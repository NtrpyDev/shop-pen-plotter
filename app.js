/* Shop Pen Plotter proposal v2: loads data/*.json, fills the page, layers scroll motion on top.
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
  /* A number that counts up once when it enters. Final text is already in place. */
  function cnt(value, kind, cls) {
    const n = h('span', { class: cls || null, 'data-count': '' });
    n.dataset.fmt = kind;
    if (isNum(value)) n.dataset.value = String(value);
    n.textContent = isNum(value) ? fmtCount(kind, value) : 'TBD';
    return n;
  }
  function cntRange(lo, hi, cls) {
    const n = h('span', { class: cls || null, 'data-count': '' });
    n.dataset.fmt = 'range';
    if (isNum(lo) && isNum(hi)) { n.dataset.lo = String(lo); n.dataset.hi = String(hi); }
    n.textContent = isNum(lo) && isNum(hi) ? `${num(lo, 0)}-${num(hi, 0)}` : 'TBD';
    return n;
  }
  function countUp(n) {
    const kind = n.dataset.fmt;
    const t0 = performance.now();
    const dur = 900;
    const set = (e) => {
      if (kind === 'range') {
        n.textContent = `${num(parseFloat(n.dataset.lo) * e, 0)}-${num(parseFloat(n.dataset.hi) * e, 0)}`;
      } else {
        const t = parseFloat(n.dataset.value);
        n.textContent = fmtCount(kind, t * e);
      }
    };
    if (kind === 'range' ? !n.dataset.lo : !isNum(parseFloat(n.dataset.value))) return;
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
    return { data: out, missing };
  }

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
    const v = {
      content: c,
      shop: sh,
      specs,
      stages,
      recTotal: rec.total,
      recDate,
      cheapTotal: b.total,
      cheapDate: txt(b.date),
      preTotal,
      preDate: txt(p.date),
      zero: 0,
      firstOrder: isNum(s1) && pens && isNum(pens[1]) ? Math.round(s1 + pens[1]) : null,
      slideCost: m ? m[0] : 'TBD',
      saveRec: isNum(preTotal) && isNum(rec.total) ? preTotal - rec.total : null,
      saveCheap: isNum(preTotal) && isNum(b.total) ? preTotal - b.total : null,
    };
    v.recDateLine = `parts only, priced ${recDate}`;
    v.cheapDateLine = `parts only, priced ${v.cheapDate}`;
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
  }

  /* A: general notes */
  function renderNotes(v) {
    const sh = v.shop;
    const pr = sh.printed || {};
    const items = [
      ['What it is:', ' a flatbed pen plotter for white-on-blue prints and drafting film, up to 36 x 48 in, built in the shop.'],
      ['What it costs:', ` ${usd(v.recTotal)} in materials for the recommended build, before shipping and tax.`],
      ['How the money goes out:', ` ${word(v.stages.length)} orders, smallest first. The first is ${isNum(v.firstOrder) ? usd(v.firstOrder, true) : 'TBD'} and proves the design before any metal is cut.`],
      ['What is already done:', ' the design, every Haas program, the drawings, the wiring, the firmware settings and the plotting software. Nothing has been bought.'],
      ['What it needs from the shop:', ` about ${num(sh.total_cycle_hours)} h of spindle time plus ${num(sh.setup_hours_estimate)} h of setup on the Haas, ${num(pr.grams_est, 0)} g of printer filament, and Noah's assembly time.`],
    ];
    const tb = $('#notes tbody');
    items.forEach(([k, t], i) => tb.append(h('tr', null, h('td', { class: 'n' }, String(i + 1)), h('td', null, h('b', null, k), t))));
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
      tile(cnt(progs.length, 'int', 'big num'), 'Haas programs, verified and backplotted'),
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

    $('#cost-intro').textContent = `Buying a machine that takes a 36 x 48 sheet and these pens starts at ${usd(best.price, true)}. Building the cheapest possible version costs less but gives up accuracy and needs a redesign.`;

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
      { key: 'cheap', label: 'Cheapest build', sub: `priced ${v.cheapDate}`, value: v.cheapTotal },
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
      ['Cheapest build vs buying', v.saveCheap],
    ].forEach(([label, amt]) => {
      const pos = isNum(amt) && amt >= 0;
      sav.append(h('div', { class: `save${isNum(amt) && !pos ? ' neg' : ''}` },
        h('span', { class: 'save-txt' }, label),
        h('span', { class: 'save-amt money' }, isNum(amt) ? usd(Math.abs(amt), true) : 'TBD'),
        h('span', { class: 'save-sub' }, isNum(amt) ? 'on materials; shop time is section F' : 'waiting on prices')));
    });
  }

  function renderOthers(d) {
    const p = d.prebuilt || {};
    const others = (p.others || []).filter((o) => o && has(o.name));
    if (!others.length) return;
    const t = $('#others');
    t.append(h('caption', { class: 'sr' }, 'Other pre-built machines'));
    t.append(h('thead', null, h('tr', null,
      ['Machine', 'Price', 'Size', 'Fits 36 x 48', 'Pens', 'Accuracy', 'Notes'].map((x, i) => h('th', { class: i === 1 ? 'r' : null, scope: 'col' }, x)))));
    const tb = h('tbody');
    others.forEach((o) => {
      const fits = o.fits_36x48 === true ? 'Yes' : o.fits_36x48 === false ? 'No' : o.fits_36x48;
      const name = link(o.url, txt(o.name)) || val(o.name);
      tb.append(h('tr', null,
        h('th', { scope: 'row' }, name),
        h('td', { class: 'r m' }, isNum(o.price) ? usd(o.price, true) : val(o.price)),
        h('td', { class: 'd' }, val(o.size)),
        h('td', { class: 'd' }, val(fits)),
        h('td', { class: 'd full' }, val(o.pens)),
        h('td', { class: 'd full' }, val(o.accuracy)),
        h('td', { class: 'd full' }, val(o.notes))));
    });
    t.append(tb);
    $('#others-wrap').append(h('p', { class: 'note' }, `Prices read ${txt(p.date)}.`));
    $('#others-wrap').hidden = false;
  }

  /* F: shop time, and the G program table */
  function renderShop(d) {
    const sh = d.shop || {};
    const progs = sh.programs || [];
    const lab = sh.labour_hours_estimate || {};
    const pr = sh.printed || {};
    const cyc = sh.total_cycle_hours;
    const set = sh.setup_hours_estimate;
    const lo = [cyc, set, lab.low].every(isNum) ? cyc + set + lab.low : null;
    const hi = [cyc, set, lab.high].every(isNum) ? cyc + set + lab.high : null;

    const tile = (label, big, unit, sub, cls) => h('div', { class: `tile${cls ? ' ' + cls : ''}` },
      h('dt', null, label),
      h('dd', null, big, unit ? h('span', { class: 'unit' }, unit) : null, h('span', { class: 'sub' }, sub)));
    $('#shop-tiles').append(
      tile('Mill spindle time', cnt(cyc, 'dec1', 'big num'), 'h', `${progs.length} programs, all quantities; estimate`),
      tile('Setups and blank prep', cnt(set, 'dec1', 'big num'), 'h', 'estimate'),
      tile('Assembly, wiring, setup', cntRange(lab.low, lab.high, 'big num'), 'h', 'rough estimate, not measured'),
      tile('Total shop time', cntRange(lo, hi, 'big num'), 'h', 'estimate; sum of the three', 'total'),
    );

    const ul = $('#printed');
    if (Array.isArray(pr.parts) && pr.parts.length) {
      pr.parts.forEach((x) => ul.append(h('li', null,
        h('span', null, `${txt(x.qty)} x ${txt(x.part)}`),
        h('span', null, isNum(x.grams_each) ? `${num(x.grams_each)} g each` : ''))));
    } else if (typeof (d.content.shop_parts || {}).printed_parts === 'string') {
      ul.append(h('li', null, h('span', null, d.content.shop_parts.printed_parts)));
    }
    ul.append(h('li', null, h('span', null, 'Filament, estimate'), h('span', null, isNum(pr.grams_est) ? `${num(pr.grams_est, 0)} g` : 'TBD')));

    const as = $('#shop-assume');
    [...(sh.assumptions || []), ...(pr.assumptions || []).map((x) => `Printed parts: ${x}`),
      has(lab.basis) ? `Assembly hours: ${lab.basis}` : null]
      .filter(has).forEach((x) => as.append(h('li', null, val(x))));

    const t = $('#programs');
    t.append(h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Program'), h('th', { scope: 'col' }, 'Part'),
      h('th', { scope: 'col', class: 'r' }, 'Qty'), h('th', { scope: 'col', class: 'r hide-sm' }, 'Setups'),
      h('th', { scope: 'col', class: 'r' }, 'Min each'))));
    const tb = h('tbody');
    let qty = 0;
    progs.forEach((p) => {
      if (isNum(p.qty)) qty += p.qty;
      const id = typeof p.program === 'string' ? p.program.replace(/\.nc$/i, '').split('_')[0] : p.program;
      tb.append(h('tr', null,
        h('td', { class: 'prog', title: p.program || null }, val(id)),
        h('td', null, val(p.part)),
        h('td', { class: 'r m' }, val(p.qty)),
        h('td', { class: 'r m hide-sm' }, val(p.setups)),
        h('td', { class: 'r m' }, isNum(p.est_minutes) ? num(p.est_minutes) : val(p.est_minutes))));
    });
    t.append(tb);
    t.append(h('tfoot', null, h('tr', null,
      h('th', { scope: 'row', colspan: '2' }, `${progs.length} programs, ${qty} parts: mill spindle time, estimate`),
      h('td', { class: 'r m', colspan: '3' }, `${num(cyc)} h`))));
  }

  function moneyTable(sel, head, items, total, totalLabel) {
    const t = $(sel);
    t.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, head[0]), h('th', { scope: 'col', class: 'r' }, head[1]))));
    const tb = h('tbody');
    items.forEach(([name, amt]) => tb.append(h('tr', null, h('td', null, val(name)), h('td', { class: 'r m' }, isNum(amt) ? usd(amt) : val(amt)))));
    t.append(tb);
    if (totalLabel) t.append(h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, totalLabel), h('td', { class: 'r m' }, usd(total)))));
  }

  /* G: parts sheet */
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

    const sup = v.content.supplies || {};
    const supItems = sup.items || [];
    const supTotal = supItems.reduce((a, [, x]) => a + (isNum(x) ? x : 0), 0);
    moneyTable('#supplies-table', ['Item', `Price, ${sup.date || v.recDate}`], supItems, supTotal, 'Supplies total');

    const b = d.budget || {};
    moneyTable('#cheap-groups', ['Group', `Subtotal, ${v.cheapDate}`],
      (b.groups || []).map(([n, a]) => [n, a]), b.total, 'Cheapest build total');
    const lines = b.lines || [];
    if (lines.length) {
      const lt = $('#cheap-lines');
      lt.append(h('caption', { class: 'sr' }, 'Cheapest build line items'));
      lt.append(h('thead', null, h('tr', null,
        ['Item', 'Qty', 'Each', 'Total', 'Vendor'].map((x, i) => h('th', { scope: 'col', class: i > 0 && i < 4 ? 'r' : null }, x)))));
      const lb = h('tbody');
      let group = null;
      lines.forEach((l) => {
        if (has(l.group) && l.group !== group) {
          group = l.group;
          lb.append(h('tr', { class: 'grp' }, h('th', { scope: 'rowgroup', colspan: '5', class: 'm full' }, group)));
        }
        const spec = has(l.spec) && l.spec !== 'TBD' ? h('span', { class: 'd' }, ` ${l.spec}`) : null;
        const vend = link(l.url, txt(l.vendor)) || val(l.vendor);
        lb.append(h('tr', null,
          h('td', { class: 'full' }, val(l.item), spec, has(l.notes) && l.notes !== 'TBD' ? h('div', { class: 'd' }, l.notes) : null),
          h('td', { class: 'r m' }, val(l.qty)),
          h('td', { class: 'r m' }, isNum(l.unit) ? usd(l.unit) : val(l.unit)),
          h('td', { class: 'r m' }, isNum(l.ext) ? usd(l.ext) : val(l.ext)),
          h('td', { class: 'd' }, vend)));
      });
      lt.append(lb);
    }
  }

  function renderSpecs(v) {
    const t = $('#specs');
    const tb = h('tbody');
    (v.content.specs || []).forEach(([k, x]) => tb.append(h('tr', null, h('th', { scope: 'row' }, k), h('td', null, x))));
    t.append(tb);
  }

  /* H: checks with drawn ticks */
  function renderChecks(v) {
    const ul = $('#checklist');
    (v.content.checks || []).forEach((c) => {
      const ck = s('svg', { class: 'ck', viewBox: '0 0 20 20', 'aria-hidden': 'true' }, s('path', { d: 'M3 10.5 L8 15.5 L17 5', pathLength: 1 }));
      ul.append(h('li', null, ck, c));
    });
  }

  /* J: sign-off */
  function renderSign(v) {
    const a = $('#sb-amount');
    a.replaceChildren(cnt(v.firstOrder, 'usd0'));
    $('#sb-then').textContent = `${word(Math.max(0, v.stages.length - 1))} more stages, each approved on its own, ${usd(v.recTotal)} total`;
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

  /* ---------- the hero drawing: plotted by a pen, scrubbed by scroll ---------- */
  const hero = { draw: null, p0: 0, autoP: 0, scrubP: 0, ready: false };
  const applyHero = () => { if (hero.draw) hero.draw(Math.max(hero.autoP, hero.scrubP)); };
  let heroSvg = null;
  const PART_W = 200, PART_H = 175;

  async function plotHero() {
    if (reduce) return; // the <img> already shows the finished drawing; the readout already says PLOT COMPLETE
    const box = $('#plot');
    const img = box && box.querySelector('img');
    if (!img) return;
    let src;
    try {
      const r = await fetch(img.getAttribute('src'));
      if (!r.ok) return;
      src = await r.text();
    } catch (e) { return; }
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const rootEl = doc.documentElement;
    if (!rootEl || rootEl.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return;
    rootEl.querySelectorAll('script, foreignObject, a').forEach((n) => n.remove());
    [rootEl, ...rootEl.querySelectorAll('*')].forEach((n) => [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || /href$/i.test(a.name)) n.removeAttribute(a.name);
    }));
    const svg = document.importNode(rootEl, true);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', img.alt);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    img.replaceWith(svg);
    heroSvg = svg;

    const vb = svg.viewBox.baseVal;
    const unit = vb && vb.width ? vb.width : 200;
    const shapes = $$('path, circle, ellipse, line, polyline, polygon, rect', svg);
    const texts = $$('text', svg);
    const toRoot = (el) => {
      let m = null;
      for (let n = el; n && n !== svg; n = n.parentNode) {
        const list = n.transform && n.transform.baseVal;
        const c = list && list.numberOfItems ? list.consolidate() : null;
        if (c) m = m ? c.matrix.multiply(m) : c.matrix;
      }
      return m;
    };

    const segs = [];
    shapes.forEach((sh) => {
      sh.removeAttribute('pathLength');
      let len = 0;
      try { len = sh.getTotalLength(); } catch (e) { len = 0; }
      if (!(len > 0)) return;
      let m = null;
      try { m = toRoot(sh); } catch (e) { m = null; }
      const filled = getComputedStyle(sh).fill !== 'none';
      sh.style.strokeDasharray = `${len} ${len}`;
      sh.style.strokeDashoffset = String(len);
      if (filled) sh.style.fillOpacity = '0';
      segs.push({ s: sh, len, m, filled, k: 0 });
    });
    texts.forEach((t) => { t.style.opacity = '0'; });
    if (!segs.length) { texts.forEach((t) => { t.style.opacity = ''; }); return; }

    const pen = s('g', { class: 'pen' });
    const r = unit * 0.016;
    const ring = s('circle', { r });
    const cross = s('path', { d: `M${-r * 2.2},0 H${-r * 1.2} M${r * 1.2},0 H${r * 2.2} M0,${-r * 2.2} V${-r * 1.2} M0,${r * 1.2} V${r * 2.2}` });
    pen.setAttribute('stroke-width', String(unit * 0.004));
    pen.append(ring, cross);
    svg.append(pen);

    const pt = (seg, at) => {
      let p = seg.s.getPointAtLength(at);
      if (seg.m) p = p.matrixTransform(seg.m);
      return p;
    };
    const total = segs.reduce((a, g) => a + g.len, 0);
    const drawSpeed = total / 3.6;
    const travelSpeed = drawSpeed * 4;
    const plan = [];
    let prevEnd = null;
    let t = 0;
    segs.forEach((g) => {
      const start = pt(g, 0);
      if (prevEnd) {
        const dist = Math.hypot(start.x - prevEnd.x, start.y - prevEnd.y);
        const dur = Math.min(0.35, Math.max(0.04, dist / travelSpeed));
        plan.push({ kind: 'up', from: prevEnd, to: start, t0: t, t1: t + dur });
        t += dur;
      }
      const dur = Math.max(0.06, g.len / drawSpeed);
      plan.push({ kind: 'down', g, t0: t, t1: t + dur });
      t += dur;
      prevEnd = pt(g, g.len);
    });
    const Tt = t;
    hero.p0 = plan.find((st) => st.kind === 'down').t1 / Tt;

    const dro = $('#dro');
    const f1 = (x) => clamp(x, 0, 999.9).toFixed(1).padStart(5, '0');
    const setPen = (p, down, done) => {
      pen.setAttribute('transform', `translate(${p.x} ${p.y})`);
      ring.style.fillOpacity = down ? '1' : '0';
      pen.style.opacity = done ? '0' : '1';
      if (!dro) return;
      if (done) { dro.textContent = 'PLOT COMPLETE'; return; }
      const mmX = clamp(p.x, 0, PART_W);
      const mmY = clamp(PART_H - p.y, 0, PART_H);
      dro.textContent = `X ${f1(mmX)}  Y ${f1(mmY)}  ${down ? 'PEN DN' : 'PEN UP'}`;
    };

    hero.draw = (p) => {
      const T = clamp(p, 0, 1) * Tt;
      let cur = null;
      plan.forEach((st) => {
        if (st.kind === 'down') {
          const k = T <= st.t0 ? 0 : T >= st.t1 ? 1 : (T - st.t0) / (st.t1 - st.t0);
          if (k !== st.g.k) {
            const g = st.g;
            const was = g.k;
            g.k = k;
            if (k >= 1) { g.s.style.strokeDasharray = 'none'; g.s.style.strokeDashoffset = '0'; if (g.filled) g.s.style.fillOpacity = ''; }
            else {
              if (was >= 1) g.s.style.strokeDasharray = `${g.len} ${g.len}`;
              g.s.style.strokeDashoffset = String(g.len * (1 - k));
              if (g.filled) g.s.style.fillOpacity = '0';
            }
          }
        }
        if (T >= st.t0 && T < st.t1) cur = st;
      });
      const done = p >= 1;
      texts.forEach((x) => { x.style.opacity = p >= 0.985 ? '1' : '0'; });
      if (done) { setPen(pt(segs[segs.length - 1], segs[segs.length - 1].len), false, true); return; }
      if (!cur) { setPen(pt(segs[0], 0), false, false); return; }
      const k = (T - cur.t0) / (cur.t1 - cur.t0);
      if (cur.kind === 'down') setPen(pt(cur.g, cur.g.len * k), true, false);
      else {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setPen({ x: cur.from.x + (cur.to.x - cur.from.x) * e, y: cur.from.y + (cur.to.y - cur.from.y) * e }, false, false);
      }
    };
    hero.ready = true;
    hero.draw(0);

    const deskPin = hasGsap() && mq('(min-width: 900px) and (prefers-reduced-motion: no-preference)').matches;
    const target = deskPin ? hero.p0 : 1;
    const dur = deskPin ? 1200 : 3000;
    setTimeout(() => {
      const t0 = performance.now();
      const f = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        hero.autoP = target * k;
        applyHero();
        if (k < 1) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, 250);
  }

  /* crosshair cursor over the hero drawing, fine pointers only */
  function setupCrosshair() {
    const frame = $('#sheet-frame');
    const xh = $('#xhair');
    const lab = $('#xhair-l');
    if (!frame || !xh || !mq('(hover: hover) and (pointer: fine)').matches) return;
    frame.addEventListener('pointerenter', () => frame.classList.add('xh-on'));
    frame.addEventListener('pointerleave', () => frame.classList.remove('xh-on'));
    frame.addEventListener('pointermove', (e) => {
      const r = frame.getBoundingClientRect();
      xh.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
      let mx, my;
      const plot = $('#plot').getBoundingClientRect();
      if (heroSvg && heroSvg.getScreenCTM) {
        const p = heroSvg.createSVGPoint();
        p.x = e.clientX; p.y = e.clientY;
        const q = p.matrixTransform(heroSvg.getScreenCTM().inverse());
        mx = q.x; my = PART_H - q.y;
      } else {
        mx = ((e.clientX - plot.left) / plot.width) * 234 - 10;
        my = PART_H - (((e.clientY - plot.top) / plot.height) * 205 - 10);
      }
      lab.textContent = `X ${clamp(mx, 0, PART_W).toFixed(1)}  Y ${clamp(my, 0, PART_H).toFixed(1)}`;
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

  /* ---------- scroll layer: progress line, nav, grid parallax, machine tour ---------- */
  const scrollState = { gridK: 0, tour: false };
  function setupScroll() {
    const fill = $('#db-fill');
    const read = $('#db-read');
    const toc = $('#toc');
    const links = $$('#toc-list a').map((a) => ({
      a, z: a.dataset.z, el: $(a.getAttribute('href')), label: a.childNodes[1] ? a.childNodes[1].textContent.trim() : '',
    })).filter((l) => l.el);
    const cur = $('#toc-cur');
    const btn = $('#toc-btn');
    const sum = $('#sum');
    const fine = $('#bg-fine');
    const coarse = $('#bg-coarse');
    let ticking = false;
    let lastActive = null;

    const update = () => {
      ticking = false;
      const y = window.scrollY || 0;
      const vh = window.innerHeight;
      const max = Math.max(1, root.scrollHeight - vh);
      const pct = clamp(y / max, 0, 1);
      if (fill) fill.style.transform = `scaleX(${pct})`;
      if (read) read.textContent = `Y ${(pct * 100).toFixed(1)}%`;

      if (toc && sum) {
        const show = sum.getBoundingClientRect().top < vh * 0.7;
        toc.classList.toggle('show', show);
        let active = null;
        links.forEach((l) => { if (l.el.getBoundingClientRect().top <= vh * 0.4) active = l; });
        if (active !== lastActive) {
          lastActive = active;
          links.forEach((l) => { l.a.classList.toggle('on', l === active); if (l === active) l.a.setAttribute('aria-current', 'location'); else l.a.removeAttribute('aria-current'); });
          if (active && cur) cur.replaceChildren(h('b', null, active.z), ` ${active.label}`);
        }
      }

      if (scrollState.gridK) {
        if (fine) fine.style.transform = `translate3d(0, ${-((y * 0.15 * scrollState.gridK) % 24)}px, 0)`;
        if (coarse) coarse.style.transform = `translate3d(0, ${-((y * 0.3 * scrollState.gridK) % 120)}px, 0)`;
      }
      if (scrollState.tour) updateTour(vh);
    };
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    scrollState.update = update;

    const setGrid = () => {
      scrollState.gridK = mq('(prefers-reduced-motion: reduce)').matches ? 0 : mq('(min-width: 900px)').matches ? 1 : 0.5;
      if (!scrollState.gridK) { if (fine) fine.style.transform = ''; if (coarse) coarse.style.transform = ''; }
      req();
    };
    [mq('(prefers-reduced-motion: reduce)'), mq('(min-width: 900px)')].forEach((m) => m.addEventListener('change', setGrid));
    setGrid();

    /* phone nav: current zone plus a button that opens the list */
    if (btn && toc) {
      const close = () => { toc.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', () => {
        const open = toc.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
      $$('#toc-list a').forEach((a) => a.addEventListener('click', close));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      document.addEventListener('click', (e) => { if (!toc.contains(e.target)) close(); });
    }
    update();
  }

  /* machine tour: sticky frame on the left swaps as the steps scroll past */
  function updateTour(vh) {
    const steps = $$('.tour-step');
    if (!steps.length) return;
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
      if (hasGsap()) window.ScrollTrigger.refresh();
    };
    m.addEventListener('change', apply);
    apply();
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
      const k = desk ? 1 : 0.5;
      const topPin = BAR + TOC + 16;
      const added = [];
      const mark = (el, cls) => { el.classList.add(cls); added.push([el, cls]); };

      /* hero */
      const heroEl = $('#top');
      if (desk) {
        ScrollTrigger.create({
          trigger: heroEl, start: 'top top', end: '+=150%', pin: true, anticipatePin: 1,
          onUpdate: (self) => { hero.scrubP = hero.p0 + self.progress * (1 - hero.p0); applyHero(); },
        });
        gsap.timeline({ scrollTrigger: { trigger: heroEl, start: 'top top', end: '+=150%', scrub: true } })
          .to('#hero-copy', { y: -70, opacity: 0.6, ease: 'none' }, 0)
          .to('#hero-ghost', { yPercent: -12, ease: 'none' }, 0);
      } else {
        gsap.to('#hero-copy', { y: -30, opacity: 0.8, ease: 'none', scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to('#hero-ghost', { yPercent: -8, ease: 'none', scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true } });
      }

      /* section headings: the dimension line draws in, end tick last */
      $$('.sec-head').forEach((head) => {
        const line = $('.dl-line', head);
        const end = $('.dl-end', head);
        const tl = gsap.timeline({ scrollTrigger: { trigger: head, start: 'top 88%', once: true } });
        tl.fromTo(line, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power2.out' });
        tl.fromTo(end, { scaleY: 0 }, { scaleY: 1, duration: 0.25, ease: 'power1.out' }, '>-0.05');
      });

      /* reveals: never from opacity 0 */
      $$('[data-reveal]').forEach((el) => {
        gsap.from(el, { opacity: 0.4, y: 16, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
      });
      const group = (sel, trig, stagger) => {
        const els = $$(sel);
        if (els.length) gsap.from(els, { opacity: 0.4, y: 16, duration: 0.6, stagger, ease: 'power2.out', scrollTrigger: { trigger: trig || els[0], start: 'top 85%', once: true } });
      };
      group('#notes tbody tr', '#notes', 0.14);
      group('#cards .card', '#cards', 0.15);
      group('#done-tiles .dtile', '#done-tiles', 0.1);
      group('#signblock .sb-row', '#signblock', 0.1);

      /* section ghost letters drift against the content */
      $$('.sec .ghost').forEach((g) => {
        const sec = g.closest('.sec');
        gsap.fromTo(g, { yPercent: -30 * k }, { yPercent: 30 * k, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      /* render band */
      const band = $('#band');
      const bimg = $('#band-img');
      if (band && bimg) {
        gsap.fromTo(bimg, { scale: 1.15, yPercent: -10 * k }, { scale: 1.15, yPercent: 10 * k, ease: 'none', scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom top', scrub: true } });
      }

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

      /* cost bars grow to scale */
      const fills = $$('#bars .bar-row:not(.na) .bar-fill');
      if (fills.length) {
        /* grow once, never scrubbed: a to-scale chart must not sit at a wrong length mid-scroll */
        gsap.fromTo(fills, { scaleX: 0.06 }, { scaleX: 1, duration: 1.1, ease: 'power2.out', scrollTrigger: { trigger: '#bars', start: 'top 90%', once: true } });
      }

      /* ticks draw in */
      const paths = $$('#checklist .ck path');
      if (paths.length) gsap.from(paths, { strokeDashoffset: 1, duration: 0.5, stagger: 0.25, ease: 'power1.out', scrollTrigger: { trigger: '#checklist', start: 'top 88%', once: true } });

      ScrollTrigger.sort();
      requestAnimationFrame(() => ScrollTrigger.refresh());

      return () => {
        added.forEach(([el, cls]) => el.classList.remove(cls));
        stair.pinned = false;
        drawStair();
        $$('.dl-line, .dl-end', document).forEach((el) => { el.style.clipPath = ''; el.style.transform = ''; });
      };
    });
  }

  /* ---------- 3D model, loaded only on request ---------- */
  function setupViewer() {
    const btn = $('#open3d');
    const cv = $('#viewer');
    const st = $('#vstate');
    if (!btn || !cv || !st) return;
    const load = (src) => new Promise((ok, bad) => {
      const sc = document.createElement('script');
      sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error(src));
      document.head.appendChild(sc);
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      st.textContent = 'Loading the 3D model. It is a large file, so this can take a few seconds.';
      try {
        if (!window.THREE) {
          await load('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js');
          await load('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js');
          await load('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
        }
        const T = window.THREE;
        const size = () => { const w = cv.parentElement.clientWidth; return [w, Math.round(w * 10 / 16)]; };
        let [w, hgt] = size();
        const r = new T.WebGLRenderer({ canvas: cv, antialias: true });
        r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        r.setSize(w, hgt, false);
        const sc = new T.Scene();
        sc.background = new T.Color('#eef1f4');
        sc.add(new T.HemisphereLight(0xffffff, 0x667788, 1.5));
        const dl = new T.DirectionalLight(0xffffff, 1.4);
        dl.position.set(1500, 3000, 2200);
        sc.add(dl);
        const cam = new T.PerspectiveCamera(30, w / hgt, 5, 20000);
        cam.position.set(2300, 2000, 2700);
        const c = new T.OrbitControls(cam, cv);
        c.target.set(0, 0, 50);
        c.enableDamping = true;
        c.update();
        new T.GLTFLoader().load('assets/model.json', (g) => {
          g.scene.traverse((o) => { if (o.isMesh) o.material.side = T.DoubleSide; });
          sc.add(g.scene);
          cv.hidden = false;
          [w, hgt] = size(); r.setSize(w, hgt, false); cam.aspect = w / hgt; cam.updateProjectionMatrix();
          st.textContent = 'Drag to orbit, scroll to zoom, right-drag to pan.';
          btn.hidden = true;
          if (hasGsap()) window.ScrollTrigger.refresh();
          window.addEventListener('resize', () => {
            [w, hgt] = size(); r.setSize(w, hgt, false); cam.aspect = w / hgt; cam.updateProjectionMatrix();
          });
          (function loop() { c.update(); r.render(sc, cam); requestAnimationFrame(loop); })();
        }, undefined, () => {
          st.textContent = 'The 3D model could not load here. The renders above show the same assembly.';
          btn.disabled = false;
        });
      } catch (e) {
        st.textContent = 'The 3D viewer could not load here. The renders above show the same assembly.';
        btn.disabled = false;
      }
    });
  }

  /* ---------- boot ---------- */
  async function main() {
    guardImages();
    setupViewer();
    setupPairs();
    setupScroll();
    setupTourMode();
    setupCrosshair();
    plotHero();
    const { data, missing } = await loadData();
    const v = derive(data);
    fillBindings(v);
    const steps = [renderNotes, renderStairs, renderDone, () => renderCards(data, v), renderBars, () => renderOthers(data),
      () => renderShop(data), renderSpecs, () => renderSheet(data, v), renderChecks, renderSign];
    steps.forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });
    if (missing.length) {
      $('#draft-list').textContent = missing.map((m) => `${m}.json`).join(', ');
      $('#draft').hidden = false;
    }
    setupCounts();
    initMotion();
    if (scrollState.update) scrollState.update();
    const refresh = () => { if (hasGsap()) window.ScrollTrigger.refresh(); if (scrollState.update) scrollState.update(); };
    if (document.readyState === 'complete') refresh(); else window.addEventListener('load', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    let t = null;
    $$('img').forEach((img) => { if (!img.complete) img.addEventListener('load', () => { clearTimeout(t); t = setTimeout(refresh, 120); }, { once: true }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
