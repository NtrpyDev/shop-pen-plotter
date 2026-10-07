/* Shop Pen Plotter proposal v3: loads data/*.json, fills the page, layers scroll motion on top.
   Everything renders in its final state first. GSAP is optional: without it (or with reduced
   motion, or without JS) the page is complete and still. */
(() => {
  'use strict';

  const root = document.documentElement;
  const mq = (q) => window.matchMedia(q);
  const reduce = mq('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = () => !!(window.gsap && window.ScrollTrigger);
  const $ = (sel, r = document) => r.querySelector(sel);
  const $$ = (sel, r = document) => [...r.querySelectorAll(sel)];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const has = (v) => v !== undefined && v !== null && v !== '';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const BAR = 26, TOC = 40;
  const TABS = ['summary', 'spend', 'done', 'machine', 'cost', 'parts'];

  /* ---------- formatting ---------- */
  function usd(v, round) {
    if (!isNum(v)) return 'TBD';
    const d = round ? 0 : 2;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function num(v, digits = 1) {
    if (!isNum(v)) return 'TBD';
    return v.toLocaleString('en-US', { maximumFractionDigits: digits });
  }
  const txt = (v) => (has(v) ? String(v) : 'TBD');
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n) => WORDS[n] || String(n);

  /* Tiny element builder. Children may be strings (set as text, never HTML) or nodes. */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat()) {
      if (k === null || k === undefined || k === false) continue;
      n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return n;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    for (const k of kids.flat()) if (k !== null && k !== undefined) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  }
  function val(v) {
    const t = txt(v);
    return /^TBD\b/.test(t) ? h('span', { class: 'tbd' }, t) : document.createTextNode(t);
  }
  function link(url, label) {
    const u = safeUrl(url);
    return u ? h('a', { href: u, rel: 'noopener noreferrer' }, label) : null;
  }

  /* ---------- count-up numbers ---------- */
  function fmtCount(kind, x) {
    switch (kind) {
      case 'usd2': return usd(x);
      case 'int': return num(x, 0);
      case 'dec1': return num(x, 1);
      default: return usd(x, true);
    }
  }
  const fmtRange = (lo, hi) => `${usd(lo, true)}-${usd(hi, true)}`;
  /* A number that counts up once when it enters. Final text is already in place. */
  function cnt(value, kind, cls) {
    const n = h('span', { class: cls || null, 'data-count': '' });
    n.dataset.fmt = kind;
    if (isNum(value)) n.dataset.value = String(value);
    n.textContent = isNum(value) ? fmtCount(kind, value) : 'TBD';
    return n;
  }
  function countUp(n) {
    const kind = n.dataset.fmt;
    const t0 = performance.now();
    const dur = 900;
    const isRange = kind === 'usdrange';
    if (isRange ? !n.dataset.lo : !isNum(parseFloat(n.dataset.value))) return;
    const set = (e) => {
      if (isRange) n.textContent = fmtRange(parseFloat(n.dataset.lo) * e, parseFloat(n.dataset.hi) * e);
      else n.textContent = fmtCount(kind, parseFloat(n.dataset.value) * e);
    };
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      set(1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function setupCounts() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        countUp(e.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    $$('[data-count]').forEach((el) => io.observe(el));
  }

  /* ---------- data ---------- */
  const FILES = ['content', 'budget', 'prebuilt', 'shop'];
  const OPTIONAL = ['parts', 'exploded', 'explode']; // delivered later; the page degrades without them
  async function loadData() {
    const out = {};
    const missing = [];
    await Promise.all(FILES.map(async (name) => {
      try {
        const r = await fetch(`data/${name}.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(r.status);
        out[name] = await r.json();
        if (out[name] && out[name].placeholder) missing.push(name);
      } catch (e) {
        out[name] = {};
        missing.push(name);
      }
    }));
    await Promise.all(OPTIONAL.map(async (name) => {
      try {
        const r = await fetch(`data/${name}.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(r.status);
        out[name] = await r.json();
      } catch (e) {
        out[name] = null;
      }
    }));
    return { data: out, missing };
  }

  const r50 = (x) => (isNum(x) ? Math.round(x / 50) * 50 : null);

  function derive(d) {
    const c = d.content || {};
    const rec = c.recommended || {};
    const b = d.budget || {};
    const p = d.prebuilt || {};
    const best = p.best_match || {};
    const sh = d.shop || {};
    const specs = Object.fromEntries((c.specs || []).map(([k, x]) => [k, x]));
    const dateIn = (t) => (typeof t === 'string' && (t.match(/\d{4}-\d{2}-\d{2}/) || [])[0]) || null;
    const recDate = c.date || rec.date || dateIn(rec.notes) || 'TBD';
    const preTotal = best.price;
    const stages = rec.stages || [];
    const pens = ((c.supplies || {}).items || [])[0];
    const s1 = stages[0] && stages[0][2];
    const m = /\$\d[\d,]*/.exec(c.risk_first || '');
    const cheapOk = !b.placeholder && isNum(b.total);
    const amts = stages.map((x) => x[2]).filter(isNum);
    const v = {
      content: c,
      shop: sh,
      specs,
      stages,
      recTotal: rec.total,
      recDate,
      cheapTotal: cheapOk ? b.total : undefined,
      cheapOk,
      cheapDate: txt(b.date),
      cheapProvisional: /provisional/i.test(String(b.summary || '')),
      preTotal,
      preDate: txt(p.date),
      zero: 0,
      firstOrder: isNum(s1) && pens && isNum(pens[1]) ? Math.round(s1 + pens[1]) : null,
      largestOrder: amts.length ? Math.max(...amts) : null,
      diyLow: cheapOk ? r50(b.total) : null,
      diyHigh: r50(rec.total),
      slideCost: m ? m[0] : 'TBD',
      saveRec: isNum(preTotal) && isNum(rec.total) ? preTotal - rec.total : null,
      saveCheap: isNum(preTotal) && cheapOk ? preTotal - b.total : null,
    };
    v.recDateLine = `parts only, priced ${recDate}`;
    v.cheapDateLine = v.cheapProvisional
      ? `materials incl. shipping, priced ${v.cheapDate}; some prices provisional`
      : `parts only, priced ${v.cheapDate}`;
    v.preDateLine = `price read ${v.preDate}`;
    v.recNoteLine = rec.notes || '';
    return v;
  }

  function lookup(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  /* ---------- renderers ---------- */
  function fillBindings(v) {
    $$('[data-text]').forEach((n) => {
      const x = lookup(v, n.dataset.text);
      if (has(x)) n.textContent = String(x);
    });
    $$('[data-count]').forEach((n) => {
      const x = v[n.dataset.count];
      if (isNum(x)) n.dataset.value = String(x);
      n.dataset.fmt = n.dataset.fmt || 'usd0';
      n.textContent = isNum(x) ? fmtCount(n.dataset.fmt, x) : 'TBD';
      if (!isNum(x)) n.classList.add('tbd');
    });
    const diy = $('#diy-range');
    if (diy) {
      if (isNum(v.diyLow) && isNum(v.diyHigh)) {
        diy.dataset.count = '';
        diy.dataset.fmt = 'usdrange';
        diy.dataset.lo = String(v.diyLow);
        diy.dataset.hi = String(v.diyHigh);
        diy.textContent = fmtRange(v.diyLow, v.diyHigh);
      } else {
        diy.textContent = 'TBD';
        diy.classList.add('tbd');
      }
    }
  }

  /* A: general notes */
  function renderNotes(v) {
    const items = [
      ['What it is:', ' a flatbed pen plotter for white-on-blue prints and drafting film, up to 36" x 48", built in the shop.'],
      ['What it costs:', ` ${usd(v.recTotal)} in materials for the recommended build, before shipping and tax, vs ${usd(v.preTotal, true)} for the cheapest pre-built that takes these pens.`],
      ['How the money goes out:', ` ${word(v.stages.length)} orders, smallest first. The first is ${isNum(v.firstOrder) ? usd(v.firstOrder, true) : 'TBD'} and proves the design before any metal is cut.`],
      ['What is already done:', ' the design, every CNC program, the drawings, the wiring diagram, the firmware settings and the plotting software. Nothing has been bought.'],
      ['What it needs from the shop:', " the VF-3SS (or any 3-axis mill) for the machined parts, the 3D printer for the printed parts, and Noah's assembly work."],
    ];
    const tb = $('#notes tbody');
    items.forEach(([k, t], i) => tb.append(h('tr', null, h('td', { class: 'n' }, String(i + 1)), h('td', null, h('b', null, k), t))));
  }

  function renderSpecs(v) {
    const t = $('#specs');
    const tb = h('tbody');
    (v.content.specs || []).forEach(([k, x]) => tb.append(h('tr', null, h('th', { scope: 'row' }, k), h('td', null, x))));
    t.append(tb);
  }

  /* B: stage staircase */
  const stair = { items: [], total: 0, idx: 0, pinned: false, w: 0 };

  function setStairActive(i) {
    stair.idx = i;
    const it = stair.items[i];
    if (!it) return;
    $('#sp-no').textContent = `Stage ${it.no}`;
    $('#sp-name').textContent = it.name;
    const c = $('#sp-cost');
    c.textContent = usd(it.amt);
    c.append(h('small', null, 'this stage'));
    $('#sp-run').textContent = `Running total ${usd(it.to)}`;
    $('#sp-desc').textContent = it.note || '';
    $$('#stair-svg .st').forEach((g, k) => {
      g.classList.toggle('next', stair.pinned && k > i);
      g.classList.toggle('active', stair.pinned && k === i);
    });
  }

  function wrapWords(t, max) {
    const out = [];
    let cur = '';
    String(t).split(/\s+/).forEach((w) => {
      if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) out.push(cur);
    return out;
  }

  function drawStair() {
    const box = $('#stair-svg');
    const items = stair.items;
    if (!box || !items.length) return;
    const W = Math.max(280, Math.round(box.clientWidth || 800));
    stair.w = W;
    const n = items.length;
    const full = W >= 760;
    const ml = full ? 68 : 54, mr = 8, mt = full ? 104 : 62, ph = full ? 330 : 250, mb = 30;
    const slot = (W - ml - mr) / n;
    const gap = full ? 18 : 6;
    const bw = slot - gap;
    const H = mt + ph + mb;
    const max = stair.total;
    const y = (x) => mt + ph - (x / max) * ph;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });

    for (let g = 0; g <= max; g += 500) {
      svg.append(s('line', { class: 'grid-l', x1: ml, x2: W - mr, y1: y(g), y2: y(g) }));
      svg.append(s('text', { class: 't-dim', x: ml - 8, y: y(g) + 4, 'text-anchor': 'end', 'font-size': 11 }, usd(g, true)));
    }
    svg.append(s('line', { class: 'grid-l grid-top', x1: ml, x2: W - mr, y1: y(max), y2: y(max) }));
    svg.append(s('text', { class: 't-mark', x: ml + 4, y: y(max) - 7, 'font-size': 11 }, `TOTAL ${usd(max)}`));
    svg.append(s('line', { x1: ml, x2: ml, y1: mt, y2: mt + ph, stroke: 'var(--dim)', 'stroke-width': 1 }));
    svg.append(s('line', { x1: ml, x2: W - mr, y1: mt + ph, y2: mt + ph, stroke: 'var(--line)', 'stroke-width': 1 }));

    const maxChars = Math.max(8, Math.floor(bw / 6.6));
    let firstLabelTop = 0;
    items.forEach((it, k) => {
      const x0 = ml + k * slot + gap / 2;
      const yt = y(it.to), yb = y(it.from);
      const g = s('g', { class: `st${k === 0 ? ' first' : ''}` });
      g.append(s('rect', { class: 'blk', x: x0, y: yt, width: bw, height: Math.max(1, yb - yt) }));
      const cx = x0 + bw / 2;
      const lines = full
        ? [['t-dim', `STAGE ${it.no}`, 10], ...wrapWords(it.name, maxChars).map((t) => ['t-name', t, 12]), ['t-dim', `+${usd(it.amt)}`, 11], ['', usd(it.to), 11]]
        : [['t-mark', it.no, 12], ['', usd(it.to, true), 11]];
      lines.forEach(([cls, t, fs], i) => {
        g.append(s('text', { class: cls, x: cx, y: yt - 8 - (lines.length - 1 - i) * (full ? 14 : 14), 'text-anchor': 'middle', 'font-size': fs }, t));
      });
      if (k === 0) firstLabelTop = yt - 8 - (lines.length - 1) * 14 - 11;
      svg.append(g);
      svg.append(s('text', { class: 't-dim', x: cx, y: mt + ph + 19, 'text-anchor': 'middle', 'font-size': 11 }, it.no));
      if (k < n - 1) svg.append(s('line', { class: 'tread', x1: x0 + bw, x2: x0 + slot, y1: yt, y2: yt }));
    });
    const tx = ml + gap / 2;
    const ty = firstLabelTop - 30;
    const tag = s('g', null,
      s('line', { x1: tx + 8, x2: tx + 8, y1: ty + 16, y2: firstLabelTop - 2, stroke: 'var(--mark)', 'stroke-width': 1 }),
      s('rect', { class: 'tag-bg', x: tx, y: ty, width: 70, height: 16 }),
      s('text', { class: 'tag-t', x: tx + 35, y: ty + 12, 'text-anchor': 'middle', 'font-size': 10 }, 'ORDER NOW'));
    svg.append(tag);
    box.replaceChildren(svg);
    setStairActive(stair.idx);
  }

  function renderStairs(v) {
    let run = 0;
    stair.items = v.stages.map(([no, name, amt, note]) => {
      const from = run;
      run += isNum(amt) ? amt : 0;
      return { no, name, amt, note, from, to: run };
    });
    stair.total = run;
    if (!stair.items.length) return;
    const ol = $('#stair-list');
    stair.items.forEach((it) => ol.append(h('li', null,
      h('span', { class: 'sl-no' }, `STAGE ${it.no}`),
      h('span', { class: 'sl-name' }, it.name),
      h('span', { class: 'sl-amt' }, usd(it.amt)),
      h('span', { class: 'sl-desc' }, it.note || ''),
      h('span', { class: 'sl-run' }, `Running total ${usd(it.to)}`))));
    drawStair();
    if ('ResizeObserver' in window) {
      let t = null;
      new ResizeObserver(() => {
        const w = Math.round($('#stair-svg').clientWidth || 0);
        if (Math.abs(w - stair.w) < 2) return;
        clearTimeout(t);
        t = setTimeout(() => { drawStair(); if (hasGsap()) window.ScrollTrigger.refresh(); }, 80);
      }).observe($('#stair-svg'));
    }
  }

  /* C: done tiles */
  function renderDone(v) {
    const sh = v.shop;
    const progs = sh.programs || [];
    const pr = sh.printed || {};
    const printedQty = Array.isArray(pr.parts) ? pr.parts.reduce((a, x) => a + (isNum(x.qty) ? x.qty : 0), 0) : null;
    const machined = (v.content.shop_parts || {}).machined_parts;
    const tile = (node, label) => h('div', { class: 'dtile' }, h('dd', null, node), h('dt', null, label));
    const dl = $('#done-tiles');
    dl.append(
      tile(cnt(progs.length, 'int', 'big num'), 'CNC programs, verified and backplotted'),
      tile(cnt(machined, 'int', 'big num'), 'machined parts'),
      tile(cnt(printedQty, 'int', 'big num'), `printed parts, ${num(pr.grams_est, 0)} g PETG`),
      tile(cnt(0, 'int', 'big num'), 'hole-alignment fit failures'),
      tile(cnt(0, 'int', 'big num'), 'collisions at all 4 travel corners, pen up and down'));
  }

  /* E: cards */
  function rows(target, list) {
    const dl = $(target);
    list.forEach(([label, content]) => {
      if (content === null || content === undefined || content === '') return;
      let dd;
      if (Array.isArray(content)) {
        const items = content.filter(has);
        if (!items.length) return;
        const ul = h('ul', null, items.map((x) => h('li', null, val(x))));
        dd = h('dd', null, items.length > 1
          ? h('details', { class: 'inline' }, h('summary', null, `${items.length} ${label.toLowerCase()}`), ul)
          : ul);
      } else if (content instanceof Node) {
        dd = h('dd', null, content);
      } else if (typeof content === 'string' && content.length > 220) {
        /* Long text: first sentence stays visible, the rest folds away so the three cards stay comparable. */
        const cut = content.search(/\.\s/);
        if (cut > 0 && cut < content.length - 2) {
          dd = h('dd', null, h('p', null, content.slice(0, cut + 1)),
            h('details', { class: 'inline' }, h('summary', null, 'More'), h('p', null, content.slice(cut + 2))));
        } else {
          dd = h('dd', null, val(content));
        }
      } else {
        dd = h('dd', null, val(content));
      }
      dl.append(h('div', null, h('dt', null, label), dd));
    });
  }


  const DIY_SUPPORT = 'No machine warranty. Parts carry their makers\' terms and the shop does its own repairs.';

  function renderCards(d, v) {
    const b = d.budget || {};
    const rec = (v.content.recommended || {});
    const best = (d.prebuilt || {}).best_match || {};

    const lowTxt = isNum(v.diyLow) ? usd(v.diyLow, true) : 'TBD';
    const highTxt = isNum(v.diyHigh) ? usd(v.diyHigh, true) : 'TBD';
    $('#cost-intro').textContent = `Buying a machine that takes a 36" x 48" sheet and these pens starts at ${usd(best.price, true)}. Building the same machine costs ${lowTxt} to ${highTxt} in materials, depending on where the parts come from.`;

    rows('#rows-cheap', [
      ['What you get', b.summary],
      ['Accuracy', b.accuracy_expectation],
      ['Pens', b.pens],
      ['Warranty and support', b.support || b.warranty || DIY_SUPPORT],
      ['Trade-offs', b.tradeoffs],
      ['Key risks', b.risks],
      ['Shipping and tax', b.shipping_tax || b.shipping],
    ]);

    rows('#rows-rec', [
      ['What you get', v.content.what_it_does],
      ['Accuracy', v.specs['Accuracy target']],
      ['Pens', v.specs['Pens']],
      ['Warranty and support', DIY_SUPPORT],
      ['Key risks', [v.content.risk_first]],
      ['Shipping and tax', rec.notes],
    ]);

    const price = [];
    if (isNum(best.regular_price) && isNum(best.price) && best.regular_price !== best.price) {
      price.push(`${usd(best.price)} now, regular ${usd(best.regular_price)}, both read ${v.preDate}`);
    }
    const what = [best.name, best.size].filter((x) => has(x) && x !== 'TBD').join(', ');
    const pl = link(best.url, 'Product page');
    rows('#rows-pre', [
      ['What you get', what || 'TBD'],
      ['Price', price[0]],
      ['Accuracy', best.accuracy],
      ['Pens', best.pens],
      ['Warranty and support', best.warranty || best.support || 'From the maker; terms on the product page.'],
      ['Key risks', best.risks],
      ['Shipping and tax', best.shipping],
      ['Included', best.included],
      ['Notes', has(best.notes) && best.notes !== 'TBD'
        ? h('details', { class: 'inline' }, h('summary', null, 'Seller page notes'), h('p', null, best.notes))
        : best.notes],
      ['Source', pl],
    ]);
  }

  function niceStep(max) {
    const raw = max / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }


  function renderBars(v) {
    const items = [
      { key: 'cheap', label: 'Low-cost build', sub: `priced ${v.cheapDate}`, value: v.cheapTotal },
      { key: 'rec', label: 'Recommended build', sub: `priced ${v.recDate}`, value: v.recTotal },
      { key: 'pre', label: 'Buy pre-built', sub: `price read ${v.preDate}`, value: v.preTotal },
    ];
    const nums = items.map((i) => i.value).filter(isNum);
    const box = $('#bars');
    if (!nums.length) { box.append(h('p', { class: 'note' }, 'Totals TBD.')); return; }
    const max = Math.max(...nums);
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;

    items.forEach((i) => {
      const ok = isNum(i.value);
      const fill = h('span', { class: 'bar-fill' });
      if (ok) fill.style.width = `${(i.value / top) * 100}%`;
      box.append(h('div', { class: `bar-row ${i.key}${ok ? '' : ' na'}` },
        h('span', { class: 'bar-label' }, i.label, h('small', null, i.sub)),
        h('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill),
        h('span', { class: 'bar-val' }, usd(i.value, true))));
    });

    const axis = h('div', { class: 'scale-axis', 'aria-hidden': 'true' });
    for (let t = 0; t <= top + 1e-6; t += step) {
      const sp = h('span', null, t === 0 ? '$0' : `$${(t / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`);
      sp.style.left = `${(t / top) * 100}%`;
      axis.append(sp);
    }
    box.after(h('div', { class: 'scale' }, h('span'), axis, h('span')));

    const sav = $('#savings');
    [
      ['Recommended build vs buying', v.saveRec],
      ['Low-cost build vs buying', v.saveCheap],
    ].forEach(([label, amt]) => {
      const pos = isNum(amt) && amt >= 0;
      sav.append(h('div', { class: `save${isNum(amt) && !pos ? ' neg' : ''}` },
        h('span', { class: 'save-txt' }, label),
        h('span', { class: 'save-amt money' }, isNum(amt) ? usd(Math.abs(amt), true) : 'TBD'),
        h('span', { class: 'save-sub' }, isNum(amt) ? 'on materials' : 'waiting on prices')));
    });
  }

  function renderOthers(d) {
    const p = d.prebuilt || {};
    const others = (p.others || []).filter((o) => o && has(o.name));
    if (!others.length) return;
    const t = $('#others');
    t.append(h('caption', { class: 'sr' }, 'Other pre-built machines'));
    const heads = ['Machine', 'Price', 'Size', 'Fits 36" x 48"', 'Pens', 'Accuracy', 'Notes'];
    t.append(h('thead', null, h('tr', null,
      heads.map((x, i) => h('th', { class: i === 1 ? 'price' : null, scope: 'col' }, x)))));
    const tb = h('tbody');
    others.forEach((o) => {
      const fits = o.fits_36x48 === true ? 'Yes' : o.fits_36x48 === false ? 'No' : o.fits_36x48;
      const name = link(o.url, txt(o.name)) || val(o.name);
      tb.append(h('tr', null,
        h('th', { scope: 'row', class: 'name' }, name),
        h('td', { class: 'price', 'data-label': 'Price' }, isNum(o.price) ? usd(o.price, true) : val(o.price)),
        h('td', { class: 'd', 'data-label': 'Size' }, val(o.size)),
        h('td', { class: 'd', 'data-label': 'Fits 36" x 48"' }, val(fits)),
        h('td', { class: 'd', 'data-label': 'Pens' }, val(o.pens)),
        h('td', { class: 'd', 'data-label': 'Accuracy' }, val(o.accuracy)),
        h('td', { class: 'd notes', 'data-label': 'Notes' }, val(o.notes))));
    });
    t.append(tb);
    $('#others-wrap').append(h('p', { class: 'note' }, `Prices read ${txt(p.date)}.`));
    $('#others-wrap').hidden = false;
  }

  function moneyTable(sel, head, items, total, totalLabel) {
    const t = $(sel);
    t.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, head[0]), h('th', { scope: 'col', class: 'r' }, head[1]))));
    const tb = h('tbody');
    items.forEach(([name, amt]) => tb.append(h('tr', null, h('td', null, val(name)), h('td', { class: 'r m' }, isNum(amt) ? usd(amt) : val(amt)))));
    t.append(tb);
    if (totalLabel) t.append(h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, totalLabel), h('td', { class: 'r m' }, usd(total)))));
  }

  /* F: made parts (from parts.json, if it has arrived) */
  function renderMade(parts) {
    const list = Array.isArray(parts) ? parts.filter((x) => x && has(x.part)) : [];
    if (!list.length) return;
    const t = $('#made');
    const heads = ['Part', 'Qty', 'Process', 'Size (in)', 'Material', 'Est. time each', 'Filament'];
    t.append(h('thead', null, h('tr', null, heads.map((x, i) => h('th', { scope: 'col', class: i === 1 ? 'r' : null }, x)))));
    const tb = h('tbody');
    [['machined', 'Machined'], ['printed', 'Printed']].forEach(([kind, label]) => {
      const set = list.filter((x) => String(x.kind).toLowerCase() === kind);
      if (!set.length) return;
      tb.append(h('tr', { class: 'grp' }, h('th', { scope: 'colgroup', colspan: '7' }, label)));
      set.forEach((x) => tb.append(h('tr', null,
        h('th', { scope: 'row', class: 'pname' }, txt(x.part)),
        h('td', { class: 'r m', 'data-label': 'Qty' }, val(x.qty)),
        h('td', { 'data-label': 'Process' }, label),
        h('td', { class: 'm', 'data-label': 'Size (in)' }, has(x.size_in) ? `${x.size_in} in` : ''),
        h('td', { 'data-label': 'Material' }, val(x.material)),
        h('td', { class: 'm', 'data-label': 'Est. time each' }, has(x.est_time_each) ? String(x.est_time_each) : ''),
        h('td', { class: 'm', 'data-label': 'Filament' }, isNum(x.filament_g) ? `${num(x.filament_g, 0)} g` : ''))));
    });
    t.append(tb);
    $('#made-wrap').hidden = false;
  }

  /* F: the CNC programs, with a drawing preview on hover, focus or tap */
  function renderPrograms(d) {
    const progs = (d.shop || {}).programs || [];
    const t = $('#programs');
    t.append(h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Program'), h('th', { scope: 'col' }, 'Part'),
      h('th', { scope: 'col', class: 'r' }, 'Qty'), h('th', { scope: 'col', class: 'r' }, 'Setups'))));
    const tb = h('tbody');
    progs.forEach((p) => {
      const id = typeof p.program === 'string' ? p.program.replace(/\.nc$/i, '').split('_')[0] : p.program;
      tb.append(h('tr', { tabindex: '0', 'data-prog': has(id) ? String(id) : null },
        h('td', { class: 'prog', title: p.program || null }, val(id)),
        h('td', null, val(p.part)),
        h('td', { class: 'r m' }, val(p.qty)),
        h('td', { class: 'r m' }, val(p.setups))));
    });
    t.append(tb);
    setupProgPreview(tb);
  }

  function setupProgPreview(tb) {
    const pv = $('#prog-pv');
    const pimg = $('img', pv);
    const ov = $('#pv-overlay');
    const oimg = $('img', ov);
    const fine = mq('(hover: hover) and (pointer: fine)');
    const srcOf = (id) => `assets/drawings/${encodeURIComponent(id)}.png`;
    const ok = new Map();
    const probe = (id) => {
      if (ok.has(id)) return ok.get(id);
      const pr = new Promise((res) => {
        const im = new Image();
        im.onload = () => res(true);
        im.onerror = () => res(false);
        im.src = srcOf(id);
      });
      ok.set(id, pr);
      return pr;
    };
    let cur = null;
    let pos = { x: 0, y: 0, row: null };
    const place = () => {
      const w = pv.offsetWidth || 520;
      const hh = pv.offsetHeight || 400;
      const vw = window.innerWidth, vh = window.innerHeight;
      let left, top;
      if (pos.row) {
        const r = pos.row.getBoundingClientRect();
        left = r.right - w - 8; top = r.bottom + 8;
        if (top + hh > vh - 12) top = r.top - hh - 8;
      } else {
        left = pos.x + 24; top = pos.y - hh / 2;
        if (left + w > vw - 12) left = pos.x - w - 24;
      }
      left = clamp(left, 12, Math.max(12, vw - w - 12));
      top = clamp(top, 12, Math.max(12, vh - hh - 12));
      pv.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const hide = () => { cur = null; pv.classList.remove('on'); pv.hidden = true; };
    const show = async (row) => {
      const id = row.dataset.prog;
      if (!id) return;
      cur = id;
      if (!(await probe(id)) || cur !== id) { if (cur === id) hide(); return; }
      if (pimg.getAttribute('src') !== srcOf(id)) pimg.src = srcOf(id);
      pv.hidden = false;
      place();
      requestAnimationFrame(() => { if (cur === id) { place(); pv.classList.add('on'); } });
    };
    let last = 'mouse';
    let hoverRow = null;
    tb.addEventListener('pointerdown', (e) => { last = e.pointerType; });
    tb.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      const row = e.target.closest('tr[data-prog]');
      if (!row || row === hoverRow) return;
      hoverRow = row;
      pos = { x: e.clientX, y: e.clientY, row: null };
      show(row);
    });
    tb.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !fine.matches || !cur) return;
      pos.x = e.clientX; pos.y = e.clientY; pos.row = null;
      if (!pv.hidden) place();
    });
    tb.addEventListener('pointerleave', () => { hoverRow = null; hide(); });
    tb.addEventListener('focusin', (e) => {
      const row = e.target.closest('tr[data-prog]');
      if (!row || last === 'touch') return;
      pos = { x: 0, y: 0, row };
      show(row);
    });
    tb.addEventListener('focusout', hide);
    tb.addEventListener('click', async (e) => {
      const row = e.target.closest('tr[data-prog]');
      if (!row || (e.pointerType !== 'touch' && last !== 'touch' && fine.matches)) return;
      const id = row.dataset.prog;
      if (!(await probe(id))) return;
      oimg.src = srcOf(id);
      ov.hidden = false;
      $('#pv-close').focus();
    });
    const closeOv = () => { ov.hidden = true; };
    $('#pv-close').addEventListener('click', closeOv);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeOv(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOv(); hide(); } });
    window.addEventListener('scroll', () => { if (cur && !pv.hidden && !pos.row) hide(); }, { passive: true });
  }

  /* F: stage table, categories, low-cost list */
  function renderSheet(d, v) {
    const rec = v.content.recommended || {};
    const t = $('#stage-table');
    t.append(h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Stage'), h('th', { scope: 'col' }, 'Order'),
      h('th', { scope: 'col' }, 'What is in it'), h('th', { scope: 'col', class: 'r' }, `Subtotal, ${v.recDate}`))));
    const tb = h('tbody');
    (rec.stages || []).forEach(([no, name, amt, note]) => tb.append(h('tr', null,
      h('td', { class: 'm' }, `Stage ${no}`),
      h('th', { scope: 'row' }, name),
      h('td', { class: 'd full' }, note),
      h('td', { class: 'r m' }, usd(amt)))));
    t.append(tb);
    t.append(h('tfoot', null, h('tr', null,
      h('th', { scope: 'row', colspan: '3' }, 'Recommended build, parts total'),
      h('td', { class: 'r m' }, usd(rec.total)))));
    if (rec.notes) t.closest('.table-wrap').after(h('p', { class: 'note' }, rec.notes));

    moneyTable('#group-table', ['Category', `Subtotal, ${v.recDate}`],
      (rec.groups || []).map(([n, a]) => [n, a]), rec.total, 'Total');

    const b = d.budget || {};
    moneyTable('#cheap-groups', ['Group', `Subtotal, ${v.cheapDate}`],
      (b.groups || []).map(([n, a]) => [n, a]), b.total, 'Low-cost build total');
    const lines = b.lines || [];
    if (lines.length) {
      const lt = $('#cheap-lines');
      lt.append(h('caption', { class: 'sr' }, 'Low-cost build line items'));
      lt.append(h('thead', null, h('tr', null,
        ['Item', 'Qty', 'Each', 'Total', 'Vendor'].map((x, i) => h('th', { scope: 'col', class: i > 0 && i < 4 ? 'r' : null }, x)))));
      const lb = h('tbody');
      let group = null;
      lines.forEach((l) => {
        if (has(l.group) && l.group !== group) {
          group = l.group;
          lb.append(h('tr', { class: 'grp' }, h('th', { scope: 'rowgroup', colspan: '5', class: 'm full' }, group)));
        }
        /* the raw listing title (spec) stays in the CSV; the page shows the plain item name */
        const vend = link(l.url, txt(l.vendor)) || val(l.vendor);
        lb.append(h('tr', null,
          h('td', { class: 'full' }, val(l.item), has(l.notes) && l.notes !== 'TBD' ? h('div', { class: 'd' }, l.notes) : null),
          h('td', { class: 'r m' }, val(l.qty)),
          h('td', { class: 'r m' }, isNum(l.unit) ? usd(l.unit) : val(l.unit)),
          h('td', { class: 'r m' }, isNum(l.ext) ? usd(l.ext) : val(l.ext)),
          h('td', { class: 'd' }, vend)));
      });
      lt.append(lb);
    }
  }

  /* D: exploded views (from exploded.json, if it has arrived) */
  function renderExploded(list) {
    if (!Array.isArray(list) || !list.length) return;
    const wrap = $('#exp');
    const sel = $('#exp-sel');
    const body = $('#exp-body');
    const kindLabel = { machined: 'Machined', printed: 'Printed', bought: 'Bought' };
    const show = (i) => {
      const it = list[i];
      $$('button', sel).forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      const img = has(it.image) ? (/[\/]/.test(it.image) ? it.image : `assets/exploded/${it.image}`) : null;
      const fig = h('figure', { class: 'exp-fig' });
      if (img) {
        const im = h('img', { src: img, alt: `Exploded view, ${txt(it.title)}: parts are numbered to match the list`, loading: 'lazy' });
        im.addEventListener('error', () => { fig.hidden = true; }, { once: true });
        fig.append(im);
      }
      fig.append(h('figcaption', null, txt(it.title)));
      const t = h('table', { class: 'data compact exp-parts' },
        h('caption', { class: 'sr' }, `Parts in ${txt(it.title)}`),
        h('thead', null, h('tr', null, ['No.', 'Part', 'Qty', 'Kind'].map((x, k) => h('th', { scope: 'col', class: k === 2 ? 'r' : null }, x)))),
        h('tbody', null, (it.parts || []).map((p) => h('tr', null,
          h('td', { class: 'n' }, txt(p.n)), h('td', null, txt(p.name)), h('td', { class: 'r m' }, txt(p.qty)),
          h('td', { class: 'd' }, kindLabel[p.kind] || txt(p.kind))))));
      body.replaceChildren(fig, h('div', { class: 'table-wrap' }, t));
    };
    list.forEach((it, i) => {
      const b = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, txt(it.title));
      b.addEventListener('click', () => show(i));
      sel.append(b);
    });
    show(0);
    wrap.hidden = false;
  }

  /* ---------- images that are not there yet ---------- */
  function guardImages() {
    $$('img[src^="assets/"]').forEach((img) => {
      const swap = () => {
        const box = h('div', { class: 'img-missing', role: 'img', 'aria-label': img.alt || 'image' }, `Image pending: ${img.getAttribute('src')}`);
        img.replaceWith(box);
      };
      if (img.complete && img.naturalWidth === 0 && img.src) swap();
      else img.addEventListener('error', swap, { once: true });
    });
  }

  /* ---------- pen up / pen down pairs ---------- */
  function setPair(pair, up) {
    pair.style.setProperty('--up', String(up));
    $$('[data-pen]', pair).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.pen === 'up') === (up > 0.5))));
  }
  function setupPairs() {
    $$('.pair').forEach((pair) => {
      $$('[data-pen]', pair).forEach((b) => b.addEventListener('click', () => setPair(pair, b.dataset.pen === 'up' ? 1 : 0)));
    });
  }

  /* ---------- tabs ---------- */
  const scrollState = { tour: false, update: null };
  const tabState = { cur: root.getAttribute('data-tab') || 'summary' };
  const refreshST = () => { if (hasGsap()) window.ScrollTrigger.refresh(); };

  function showTab(id, opts) {
    if (!TABS.includes(id)) id = 'summary';
    const o = opts || {};
    tabState.cur = id;
    root.setAttribute('data-tab', id);
    $$('#tablist [role="tab"]').forEach((a) => {
      const on = a.dataset.tab === id;
      a.setAttribute('aria-selected', String(on));
      a.setAttribute('tabindex', on ? '0' : '-1');
      if (on && o.reveal !== false) {
        const bar = $('#tablist');
        bar.scrollLeft = Math.max(0, a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2);
      }
    });
    if (o.push && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    if (o.scroll !== false) window.scrollTo(0, 0);
    if (o.focusPanel) { const p = document.getElementById(id); if (p) p.focus({ preventScroll: true }); }
    requestAnimationFrame(() => { refreshST(); if (scrollState.update) scrollState.update(); heroResume(); });
  }
  const tabFromHash = () => {
    const x = location.hash.slice(1);
    return TABS.includes(x) ? x : null;
  };

  function setupTabs() {
    const list = $('#tablist');
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    tabs.forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      showTab(a.dataset.tab, { push: true });
    }));
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let k = null;
      if (e.key === 'ArrowRight') k = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') k = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = tabs.length - 1;
      if (k === null) return;
      e.preventDefault();
      tabs[k].focus();
      showTab(tabs[k].dataset.tab, { push: true });
    });
    $$('[data-tab-link]').forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      showTab(a.getAttribute('href').slice(1), { push: true, focusPanel: true });
    }));
    const onNav = () => showTab(tabFromHash() || 'summary', { reveal: true });
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', () => { if (tabFromHash() && tabFromHash() !== tabState.cur) onNav(); });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    showTab(tabFromHash() || 'summary', { scroll: false });
  }

  /* ---------- scroll layer: progress line, hero parallax, machine tour ---------- */
  function setupScroll() {
    const fill = $('#db-fill');
    const read = $('#db-read');
    const heroBg = $('#hero-bg');
    const heroEl = $('#top');
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY || 0;
      const vh = window.innerHeight;
      const max = Math.max(1, root.scrollHeight - vh);
      const pct = clamp(y / max, 0, 1);
      if (fill) fill.style.transform = `scaleX(${pct})`;
      if (read) read.textContent = `Y ${(pct * 100).toFixed(1)}%`;
      /* parallax applies to the hero only: the model layer moves at about half the scroll speed */
      if (heroBg && heroEl && !reduce) {
        const hh = heroEl.offsetHeight;
        heroBg.style.transform = tabState.cur === 'summary' ? `translate3d(0, ${Math.round(clamp(y, 0, hh) * 0.5)}px, 0)` : '';
      }
      if (scrollState.tour) updateTour(vh);
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    scrollState.update = update;
    update();
  }

  /* machine tour: sticky frame on the left swaps as the steps scroll past */
  function updateTour(vh) {
    const steps = $$('.tour-step');
    if (!steps.length || tabState.cur !== 'machine') return;
    const line = vh * 0.5;
    let active = 0;
    steps.forEach((st, i) => { if (st.getBoundingClientRect().top <= line) active = i; });
    steps.forEach((st, i) => st.classList.toggle('is-active', i === active));
    $$('.tour-frame .layer').forEach((l) => l.classList.toggle('on', Number(l.dataset.step) === active));
    if (active === 2) {
      const r = steps[2].getBoundingClientRect();
      const q = (line - r.top) / r.height;
      const pair = $('.tour-frame .pair');
      if (pair) setPair(pair, clamp((q - 0.3) / 0.4, 0, 1));
    }
  }
  function setupTourMode() {
    const m = mq('(min-width: 900px) and (prefers-reduced-motion: no-preference)');
    const apply = () => {
      scrollState.tour = m.matches;
      root.classList.toggle('tour-on', m.matches);
      $$('.tour-step').forEach((st) => { if (!m.matches) st.classList.remove('is-active'); });
      if (scrollState.update) scrollState.update();
      refreshST();
    };
    m.addEventListener('change', apply);
    apply();
  }


  /* ---------- reveals: headings draw their dimension line, blocks rise in, cost bars grow ----------
     IntersectionObserver fires when a tab panel becomes visible, so this works across tab switches.
     Reduced motion or no IntersectionObserver: nothing is set, everything stays in its final state. */
  function setupReveals() {
    if (reduce || !('IntersectionObserver' in window)) return;
    root.classList.add('motion');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    const watch = (el, delay) => {
      el.classList.add('rv');
      if (delay) el.style.transitionDelay = `${delay}s`;
      io.observe(el);
    };
    $$('.sec-head').forEach((h) => { h.classList.add('dl-anim'); io.observe(h); });
    $$('[data-reveal]').forEach((el) => watch(el, 0));
    [['#notes tbody tr', 0.14], ['#cards .card', 0.15], ['#done-tiles .dtile', 0.1]].forEach(([sel, st]) => {
      $$(sel).forEach((el, i) => watch(el, i * st));
    });
    const bars = $('#bars');
    if (bars) { bars.classList.add('bars-anim'); io.observe(bars); }
  }

  /* ---------- GSAP motion, opted into per media query ---------- */
  function initMotion() {
    if (!hasGsap()) return;
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({
      desk: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
      mob: '(max-width: 899px) and (prefers-reduced-motion: no-preference)',
      still: '(prefers-reduced-motion: reduce)',
    }, (ctx) => {
      const { desk, mob } = ctx.conditions;
      if (!desk && !mob) return undefined; // reduced motion: everything stays in its final state
      const topPin = BAR + TOC + 16;
      const added = [];
      const mark = (el, cls) => { el.classList.add(cls); added.push([el, cls]); };

      /* headings, reveals and cost bars run on IntersectionObserver (setupReveals), not here:
         ScrollTriggers made inside hidden tab panels never played */

      /* stage staircase: pinned, one step per slice of scroll */
      const stairEl = $('#stair');
      if (desk && stairEl && stair.items.length) {
        mark(root, 'stair-on');
        stair.pinned = true;
        stair.idx = 0;
        drawStair();
        const n = stair.items.length;
        ScrollTrigger.create({
          trigger: stairEl, start: `top ${topPin}`, end: () => `+=${Math.round(window.innerHeight * 2.4)}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (self) => { const i = Math.min(n - 1, Math.floor(self.progress * n)); if (i !== stair.idx) setStairActive(i); },
        });
      }

      /* drawings strip: vertical scroll moves it sideways */
      const hs = $('#hs');
      const view = $('#hs-view');
      const track = $('#hs-track');
      if (desk && hs && view && track) {
        mark(root, 'hs-on');
        const dist = () => {
          const pad = parseFloat(getComputedStyle(view).paddingLeft) || 0;
          return Math.max(0, Math.round(track.offsetWidth + 2 * pad - view.clientWidth));
        };
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: hs, start: `top ${topPin}`, end: () => `+=${dist()}`, pin: true, scrub: true, anticipatePin: 1, invalidateOnRefresh: true },
        });
      }

      ScrollTrigger.sort();
      requestAnimationFrame(() => ScrollTrigger.refresh());

      return () => {
        added.forEach(([el, cls]) => el.classList.remove(cls));
        stair.pinned = false;
        drawStair();
      };
    });
  }

  /* ---------- 3D: one loader, one lighting rig, used by the hero and the viewer ---------- */
  const three = { lib: null, model: null, explode: null };
  const loadScript = (src) => new Promise((ok, bad) => {
    const sc = document.createElement('script');
    sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error(src));
    document.head.appendChild(sc);
  });
  function loadThree() {
    if (!three.lib) {
      three.lib = (async () => {
        if (!window.THREE) {
          await loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js');
          await loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js');
          await loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
        }
        return window.THREE;
      })();
      three.lib.catch(() => { three.lib = null; });
    }
    return three.lib;
  }
  function loadModel() {
    if (!three.model) {
      three.model = loadThree().then((T) => new Promise((ok, bad) => {
        new T.GLTFLoader().load('assets/model.json', (g) => {
          /* The glTF materials carry no metallic factor, so they load fully metallic and render black without an
             environment map. Matte them down so aluminum reads light gray, the bed blue, printed parts orange. */
          g.scene.traverse((o) => {
            if (!o.isMesh) return;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach((m) => { m.side = T.DoubleSide; if ('metalness' in m) { m.metalness = 0.12; m.roughness = 0.58; } });
          });
          ok(g);
        }, undefined, bad);
      }));
      three.model.catch(() => { three.model = null; });
    }
    return three.model;
  }

  function makeStage(T, cv, gltf, o) {
    const sizeOf = () => {
      const p = cv.parentElement;
      const w = Math.max(1, p.clientWidth);
      return [w, o.fill ? Math.max(1, p.clientHeight) : Math.round(w * 10 / 16)];
    };
    let [w, hgt] = sizeOf();
    const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: !!o.alpha });
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(w, hgt, false);
    if (o.alpha) r.setClearColor(0x000000, 0);
    const sc = new T.Scene();
    if (!o.alpha) sc.background = new T.Color('#eef1f4');
    /* Lighting: hemisphere fill, key from front-top-left, weaker fill from the back-right. */
    sc.add(new T.HemisphereLight(0xffffff, 0x8c8478, 0.9));
    const key = new T.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1800, 3200, 2600);
    sc.add(key);
    const fillL = new T.DirectionalLight(0xffffff, 0.6);
    fillL.position.set(2200, 1400, -2600);
    sc.add(fillL);
    const model = gltf.scene.clone(true);
    sc.add(model);
    const cam = new T.PerspectiveCamera(30, w / hgt, 5, 20000);
    cam.position.set(2300, 2000, 2700);
    const c = new T.OrbitControls(cam, cv);
    c.target.set(0, 0, 50);
    c.enableDamping = true;
    c.enableZoom = false; // wheel zoom only with Ctrl or when the canvas is focused, so the page still scrolls
    cv.style.touchAction = o.touch || 'none';
    cv.addEventListener('wheel', (e) => { c.enableZoom = e.ctrlKey || document.activeElement === cv; }, { capture: true, passive: true });
    const applySize = () => {
      [w, hgt] = sizeOf();
      r.setSize(w, hgt, false);
      cam.aspect = w / hgt;
      if (o.shift && window.innerWidth >= 900) cam.setViewOffset(w, hgt, -w * o.shift, 0, w, hgt);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    };
    applySize();
    window.addEventListener('resize', applySize);
    c.update();
    return { T, r, sc, cam, c, model, applySize, render: () => { c.update(); r.render(sc, cam); } };
  }

  /* hero: the model is the background layer */
  const heroState = { stage: null, visible: false, raf: 0 };
  function heroLoop() {
    heroState.raf = 0;
    if (!heroState.stage || !heroState.visible || document.hidden) return;
    heroState.stage.render();
    heroState.raf = requestAnimationFrame(heroLoop);
  }
  function heroResume() {
    if (!heroState.stage) return;
    const el = $('#top');
    heroState.visible = tabState.cur === 'summary' && !!el && el.getBoundingClientRect().bottom > 0;
    if (heroState.visible && !heroState.raf) { heroState.stage.applySize(); heroState.raf = requestAnimationFrame(heroLoop); }
  }
  async function setupHero3D() {
    const cv = $('#hero-3d');
    const hero = $('#top');
    if (!cv || !hero) return;
    try {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
      const [T, g] = await Promise.all([loadThree(), loadModel()]);
      cv.hidden = false;
      const st = makeStage(T, cv, g, { alpha: true, fill: true, shift: 0.17, touch: 'pan-y' });
      st.c.autoRotate = !reduce;
      st.c.autoRotateSpeed = 0.8;
      st.c.addEventListener('start', () => { st.c.autoRotate = false; });
      heroState.stage = st;
      st.render();
      hero.classList.add('live');
      window.addEventListener('scroll', heroResume, { passive: true });
      document.addEventListener('visibilitychange', heroResume);
      heroResume();
    } catch (e) {
      cv.hidden = true; // the poster render stays as the background
    }
  }

  /* viewer in the Machine tab, with the explode slider */
  function setupViewer(data) {
    const btn = $('#open3d');
    const cv = $('#viewer');
    const st = $('#vstate');
    if (!btn || !cv || !st) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      st.textContent = 'Loading the 3D model. It is a large file, so this can take a few seconds.';
      try {
        const [T, g] = await Promise.all([loadThree(), loadModel()]);
        cv.hidden = false;
        const s = makeStage(T, cv, g, { alpha: false, touch: 'none' });
        s.applySize();
        st.textContent = 'Drag to orbit, hold Ctrl and scroll (or click the model first) to zoom, right-drag to pan.';
        btn.hidden = true;
        refreshST();
        const ex = data && data.explode && typeof data.explode === 'object' ? data.explode : null;
        const ctl = $('#explode-ctl');
        if (ex && ctl) {
          const items = Object.entries(ex).map(([name, vec]) => {
            const o = s.model.getObjectByName(name);
            return o && Array.isArray(vec) && vec.length === 3 ? { o, base: o.position.clone(), vec } : null;
          }).filter(Boolean);
          if (items.length) {
            const slider = $('#explode');
            const apply = () => {
              const k = parseFloat(slider.value) || 0;
              items.forEach(({ o, base, vec }) => o.position.set(base.x + vec[0] * k, base.y + vec[1] * k, base.z + vec[2] * k));
            };
            slider.addEventListener('input', apply);
            ctl.hidden = false;
          }
        }
        (function loop() { s.render(); requestAnimationFrame(loop); })();
      } catch (e) {
        st.textContent = 'The 3D viewer could not load here. The renders above show the same assembly.';
        btn.disabled = false;
      }
    });
  }

  /* ---------- boot ---------- */
  async function main() {
    guardImages();
    setupPairs();
    setupScroll();
    setupTabs();
    setupTourMode();
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 400));
    idle(() => setupHero3D());
    const { data, missing } = await loadData();
    setupViewer(data);
    const v = derive(data);
    fillBindings(v);
    const steps = [renderNotes, renderSpecs, renderStairs, renderDone, () => renderCards(data, v), renderBars, () => renderOthers(data),
      () => renderMade(data.parts), () => renderPrograms(data), () => renderSheet(data, v), () => renderExploded(data.exploded)];
    steps.forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });
    if (missing.length) {
      $('#draft-list').textContent = missing.map((m) => `${m}.json`).join(', ');
      $('#draft').hidden = false;
    }
    setupCounts();
    setupReveals();
    initMotion();
    if (scrollState.update) scrollState.update();
    const refresh = () => { refreshST(); if (scrollState.update) scrollState.update(); };
    if (document.readyState === 'complete') refresh(); else window.addEventListener('load', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    let t = null;
    $$('img').forEach((img) => { if (!img.complete) img.addEventListener('load', () => { clearTimeout(t); t = setTimeout(refresh, 120); }, { once: true }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
