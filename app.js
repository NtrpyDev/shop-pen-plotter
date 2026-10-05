/* Shop Pen Plotter proposal: loads data/*.json, fills the page, runs the plotting animation.
   Everything renders in its final state first; motion is layered on only when allowed. */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const has = (v) => v !== undefined && v !== null && v !== '';

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
  /* Text that is exactly "TBD" gets the TBD style so placeholders stand out. */
  function val(v) {
    const s = txt(v);
    return /^TBD\b/.test(s) ? h('span', { class: 'tbd' }, s) : document.createTextNode(s);
  }
  function link(url, label) {
    const u = safeUrl(url);
    return u ? h('a', { href: u, rel: 'noopener noreferrer' }, label) : null;
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
    const specs = Object.fromEntries((c.specs || []).map(([k, v]) => [k, v]));
    const dateIn = (s) => (typeof s === 'string' && (s.match(/\d{4}-\d{2}-\d{2}/) || [])[0]) || null;
    const recDate = c.date || rec.date || dateIn(rec.notes) || 'TBD';
    const preTotal = best.price;
    const v = {
      content: c,
      specs,
      recTotal: rec.total,
      recDate,
      cheapTotal: b.total,
      cheapDate: txt(b.date),
      preTotal,
      preDate: txt(p.date),
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
      n.dataset.value = isNum(x) ? String(x) : '';
      n.textContent = usd(x, n.hasAttribute('data-round'));
      if (!isNum(x)) n.classList.add('tbd');
    });
  }

  function renderStages(v) {
    const ol = $('#stages');
    const stages = (v.content.recommended || {}).stages || [];
    let run = 0;
    stages.forEach(([no, name, amt, note]) => {
      if (isNum(amt)) run += amt;
      ol.append(h('li', { title: note || null },
        h('span', { class: 'st-no' }, `Stage ${no}`),
        h('span', { class: 'st-name' }, name),
        h('span', { class: 'st-amt' }, usd(amt)),
        h('span', { class: 'st-run' }, `running ${usd(run, true)}`)));
    });
  }

  function rows(target, list) {
    const dl = $(target);
    list.forEach(([label, content]) => {
      if (content === null || content === undefined || content === '') return;
      let dd;
      if (Array.isArray(content)) {
        const items = content.filter(has);
        if (!items.length) return;
        dd = h('dd', null, h('ul', null, items.map((x) => h('li', null, val(x)))));
      } else if (content instanceof Node) {
        dd = h('dd', null, content);
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
      const s = h('span', null, t === 0 ? '$0' : `$${(t / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`);
      s.style.left = `${(t / top) * 100}%`;
      axis.append(s);
    }
    box.after(h('div', { class: 'scale' }, h('span'), axis, h('span')));

    const sav = $('#savings');
    [
      ['Recommended build vs buying', v.saveRec, v.recDate],
      ['Cheapest build vs buying', v.saveCheap, v.cheapDate],
    ].forEach(([label, amt, d1]) => {
      const pos = isNum(amt) && amt >= 0;
      sav.append(h('div', { class: `save${isNum(amt) && !pos ? ' neg' : ''}` },
        h('span', { class: 'save-txt' }, label),
        h('span', { class: 'save-amt money' }, isNum(amt) ? usd(Math.abs(amt), true) : 'TBD'),
        h('span', { class: 'save-sub' }, isNum(amt)
          ? `${pos ? 'less' : 'more'} on parts; prices read ${d1 === v.preDate ? d1 : `${d1} and ${v.preDate}`}; shop time not counted`
          : 'waiting on prices')));
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

  function renderShop(d) {
    const s = d.shop || {};
    const progs = s.programs || [];
    const lab = s.labour_hours_estimate || {};
    const pr = s.printed || {};
    const cyc = s.total_cycle_hours;
    const set = s.setup_hours_estimate;
    const lo = [cyc, set, lab.low].every(isNum) ? cyc + set + lab.low : null;
    const hi = [cyc, set, lab.high].every(isNum) ? cyc + set + lab.high : null;

    const tile = (label, big, unit, sub, cls) => h('div', { class: `tile${cls ? ' ' + cls : ''}` },
      h('dt', null, label),
      h('dd', null, h('span', { class: 'big num' }, big), unit ? h('span', { class: 'unit' }, unit) : null,
        h('span', { class: 'sub' }, sub)));
    const range = (a, b) => (isNum(a) && isNum(b) ? `${num(a, 0)}-${num(b, 0)}` : 'TBD');
    $('#shop-tiles').append(
      tile('Mill spindle time', num(cyc), 'h', `${progs.length} programs, all quantities; estimate`),
      tile('Setups and blank prep', num(set), 'h', 'estimate'),
      tile('Assembly, wiring, setup', range(lab.low, lab.high), 'h', 'rough estimate, not measured'),
      tile('Total shop time', range(lo, hi), 'h', 'estimate; sum of the three', 'total'),
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
    [...(s.assumptions || []), ...(pr.assumptions || []).map((x) => `Printed parts: ${x}`),
      has(lab.basis) ? `Assembly hours: ${lab.basis}` : null]
      .filter(has).forEach((x) => as.append(h('li', null, val(x))));

    /* program table */
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

    /* cheapest build */
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

  function renderChecks(v) {
    const ul = $('#checklist');
    (v.content.checks || []).forEach((c) => ul.append(h('li', null, c)));
  }

  /* ---------- images that are not there yet ---------- */
  function guardImages() {
    $$('.view-body img').forEach((img) => {
      const swap = () => {
        const box = h('div', { class: 'img-missing', role: 'img', 'aria-label': img.alt }, `Image pending: ${img.getAttribute('src')}`);
        img.replaceWith(box);
      };
      if (img.complete && img.naturalWidth === 0 && img.src) swap();
      else img.addEventListener('error', swap, { once: true });
    });
  }

  /* ---------- motion ---------- */
  const below = (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92;

  function countUp(n) {
    const target = parseFloat(n.dataset.value);
    if (!isNum(target)) return;
    const round = n.hasAttribute('data-round');
    const t0 = performance.now();
    const dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      n.textContent = usd(k < 1 ? target * e : target, round || k < 1);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function setupMotion() {
    if (reduce || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        if (el.classList.contains('rise')) { el.classList.remove('rise'); el.classList.add('rise-done'); }
        if (el.classList.contains('pre')) el.classList.remove('pre');
        if (el.classList.contains('bar-fill')) el.style.transform = 'scaleX(1)';
        if (el.dataset && el.dataset.count !== undefined && !el.dataset.counted) { el.dataset.counted = '1'; countUp(el); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

    $$('.sec .wrap > *').forEach((el) => { if (below(el)) { el.classList.add('rise'); io.observe(el); } });
    $$('.sec-head').forEach((el) => { if (below(el)) { el.classList.add('pre'); io.observe(el); } });
    $$('.bar-fill').forEach((el) => {
      if (!el.closest('.na')) { el.style.transform = 'scaleX(.06)'; io.observe(el); }
    });
    $$('[data-count]').forEach((el) => io.observe(el));
  }

  /* ---------- the hero drawing: plot it like the pen would ---------- */
  async function plotHero() {
    if (reduce) return; // the <img> already shows the finished drawing
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
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return;
    root.querySelectorAll('script, foreignObject, a').forEach((n) => n.remove());
    [root, ...root.querySelectorAll('*')].forEach((n) => [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || /href$/i.test(a.name)) n.removeAttribute(a.name);
    }));
    const svg = document.importNode(root, true);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', img.alt);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    img.replaceWith(svg);

    const vb = svg.viewBox.baseVal;
    const unit = vb && vb.width ? vb.width : 200;
    const shapes = $$('path, circle, ellipse, line, polyline, polygon, rect', svg);
    const texts = $$('text', svg);
    /* Map a shape's own coordinates into the root user space through any group transforms. */
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
    shapes.forEach((s) => {
      s.removeAttribute('pathLength');
      let len = 0;
      try { len = s.getTotalLength(); } catch (e) { len = 0; }
      if (!(len > 0)) return;
      let m = null;
      try { m = toRoot(s); } catch (e) { m = null; }
      const filled = getComputedStyle(s).fill !== 'none';
      s.style.strokeDasharray = `${len} ${len}`;
      s.style.strokeDashoffset = String(len);
      if (filled) s.style.fillOpacity = '0';
      segs.push({ s, len, m, filled });
    });
    texts.forEach((t) => { t.style.opacity = '0'; t.style.transition = 'opacity .6s ease'; });
    if (!segs.length) { texts.forEach((t) => { t.style.opacity = ''; }); return; }

    const ns = 'http://www.w3.org/2000/svg';
    const pen = document.createElementNS(ns, 'g');
    pen.setAttribute('class', 'pen');
    const r = unit * 0.016;
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('r', String(r));
    const cross = document.createElementNS(ns, 'path');
    cross.setAttribute('d', `M${-r * 2.2},0 H${-r * 1.2} M${r * 1.2},0 H${r * 2.2} M0,${-r * 2.2} V${-r * 1.2} M0,${r * 1.2} V${r * 2.2}`);
    pen.setAttribute('stroke-width', String(unit * 0.004));
    pen.append(ring, cross);
    svg.append(pen);

    const pt = (seg, at) => {
      let p = seg.s.getPointAtLength(at);
      if (seg.m) p = p.matrixTransform(seg.m);
      return p;
    };
    const total = segs.reduce((a, g) => a + g.len, 0);
    const drawSpeed = total / 3.6;      // whole drawing in about 3.6 s of pen-down time
    const travelSpeed = drawSpeed * 4;  // pen-up moves are quicker
    const plan = [];
    let prevEnd = null;
    segs.forEach((g) => {
      const start = pt(g, 0);
      if (prevEnd) {
        const dist = Math.hypot(start.x - prevEnd.x, start.y - prevEnd.y);
        plan.push({ kind: 'up', from: prevEnd, to: start, dur: Math.min(0.35, Math.max(0.04, dist / travelSpeed)) });
      }
      plan.push({ kind: 'down', g, dur: Math.max(0.06, g.len / drawSpeed) });
      prevEnd = pt(g, g.len);
    });

    const status = $('#pen-status');
    const setPen = (p, down) => {
      pen.setAttribute('transform', `translate(${p.x} ${p.y})`);
      ring.style.fillOpacity = down ? '1' : '0';
    };
    let i = 0;
    let tStart = null;
    let done = 0;
    const finish = () => {
      segs.forEach((g) => { g.s.style.strokeDashoffset = '0'; g.s.style.strokeDasharray = ''; if (g.filled) { g.s.style.transition = 'fill-opacity .6s ease'; g.s.style.fillOpacity = ''; } });
      texts.forEach((t) => { t.style.opacity = ''; });
      pen.style.transition = 'opacity .5s ease';
      pen.style.opacity = '0';
      if (status) status.textContent = 'PLOTTED';
    };
    const tick = (now) => {
      if (tStart === null) tStart = now;
      let t = (now - tStart) / 1000;
      while (i < plan.length && t >= plan[i].dur) {
        const step = plan[i];
        if (step.kind === 'down') { step.g.s.style.strokeDashoffset = '0'; done += step.g.len; }
        t -= step.dur;
        tStart += step.dur * 1000;
        i++;
      }
      if (i >= plan.length) { finish(); return; }
      const step = plan[i];
      const k = t / step.dur;
      let part = 0;
      if (step.kind === 'down') {
        const at = step.g.len * k;
        part = at;
        step.g.s.style.strokeDashoffset = String(step.g.len - at);
        setPen(pt(step.g, at), true);
      } else {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setPen({ x: step.from.x + (step.to.x - step.from.x) * e, y: step.from.y + (step.to.y - step.from.y) * e }, false);
      }
      if (status) status.textContent = `PLOTTING ${Math.floor(((done + part) / total) * 100)}%`;
      requestAnimationFrame(tick);
    };
    setPen(pt(segs[0], 0), false);
    // Small pause so the reader sees the pen land before it moves.
    setTimeout(() => requestAnimationFrame(tick), 450);
  }

  /* ---------- 3D model, loaded only on request ---------- */
  function setupViewer() {
    const btn = $('#open3d');
    const cv = $('#viewer');
    const img = $('#heroimg');
    const st = $('#vstate');
    if (!btn || !cv || !st) return;
    const load = (src) => new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => bad(new Error(src));
      document.head.appendChild(s);
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
        const s = new T.Scene();
        s.background = new T.Color('#eef1f4');
        s.add(new T.HemisphereLight(0xffffff, 0x667788, 1.5));
        const dl = new T.DirectionalLight(0xffffff, 1.4);
        dl.position.set(1500, 3000, 2200);
        s.add(dl);
        const cam = new T.PerspectiveCamera(30, w / hgt, 5, 20000);
        cam.position.set(2300, 2000, 2700);
        const c = new T.OrbitControls(cam, cv);
        c.target.set(0, 0, 50);
        c.enableDamping = true;
        c.update();
        new T.GLTFLoader().load('assets/model.json', (g) => {
          g.scene.traverse((o) => { if (o.isMesh) o.material.side = T.DoubleSide; });
          s.add(g.scene);
          if (img) img.hidden = true;
          cv.hidden = false;
          [w, hgt] = size(); r.setSize(w, hgt, false); cam.aspect = w / hgt; cam.updateProjectionMatrix();
          st.textContent = 'Drag to orbit, scroll to zoom, right-drag to pan.';
          btn.hidden = true;
          window.addEventListener('resize', () => {
            [w, hgt] = size(); r.setSize(w, hgt, false); cam.aspect = w / hgt; cam.updateProjectionMatrix();
          });
          (function loop() { c.update(); r.render(s, cam); requestAnimationFrame(loop); })();
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
    plotHero();
    const { data, missing } = await loadData();
    const v = derive(data);
    fillBindings(v);
    const steps = [renderStages, () => renderCards(data, v), renderBars, () => renderOthers(data),
      () => renderShop(data), renderSpecs, () => renderSheet(data, v), renderChecks];
    steps.forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });
    if (missing.length) {
      $('#draft-list').textContent = missing.map((m) => `${m}.json`).join(', ');
      $('#draft').hidden = false;
    }
    setupMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
