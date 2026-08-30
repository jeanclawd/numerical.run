/* numerical.run renderer — elements in, DOM out. No knowledge of WHERE elements
 * came from: the in-browser wasm engine (engine.js) and the Python host's thin
 * client both feed it the same parsed marker stream.
 *
 *   renderElements(mount, elements, setState)
 *
 * setState(label, value, {once}) is called on widget interaction; the caller
 * owns state and rerunning.
 *
 * Layout elements: {type:'region', target:'sidebar'|'main'} routes following
 * elements; {type:'columns', count} / {type:'nextcol'} / {type:'endcols'}
 * build column groups. A sidebar is created only if something lands in it.
 *
 * The sidebar collapses like Streamlit's: a « toggle inside it, a floating »
 * to reopen. The open/collapsed choice lives on the mount element's dataset so
 * it survives reruns; narrow viewports start collapsed (and the CSS turns the
 * sidebar into a slide-in overlay there).
 */

export const fmtNum = (v) =>
  Number.isInteger(v) ? String(v) : v.toPrecision(3).replace(/\.?0+$/, '');

// plasma colormap LUT (0..1 → [r,g,b] 0-255), linearly interpolated between stops.
const PLASMA = [
  [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137],
  [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33],
];
function plasma(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : (t === t ? t : 0);   // clamp; NaN → 0
  const s = t * (PLASMA.length - 1);
  const i = Math.floor(s), f = s - i;
  const a = PLASMA[i], b = PLASMA[Math.min(i + 1, PLASMA.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A static text node that renders `e.html` as inline markup when present
// (sanitised upstream in livescript.js) and otherwise falls back to plain
// textContent. Honours an optional `{"align":…}` text attribute.
function richText(tag, cls, e) {
  const node = el(tag, cls);
  if (e.html !== undefined) node.innerHTML = e.html;
  else node.textContent = e.text ?? '';
  if (e.align) node.style.textAlign = e.align;
  return node;
}

export function renderElements(mount, elements, setState) {
  const scrollY = window.scrollY;
  mount.innerHTML = '';

  const layout = el('div', 'nr-layout');
  const sidebar = el('aside', 'nr-sidebar');
  const sidebarContent = el('div', 'nr-sidebar-content');
  sidebar.appendChild(sidebarContent);
  const main = el('div', 'nr-main');
  layout.append(sidebar, main);
  mount.appendChild(layout);

  let region = main;          // current top-level region
  let container = main;      // current insertion point (region or a column)
  let colGroup = null;       // active {wrap, cols, i}
  let metricRow = null;
  let sidebarUsed = false;

  const put = (node) => container.appendChild(node);

  for (const e of elements) {
    if (e.type !== 'metric') metricRow = null;

    switch (e.type) {
      // ---- layout ----------------------------------------------------------
      case 'region': {
        colGroup = null;
        region = e.target === 'sidebar' ? sidebarContent : main;
        container = region;
        if (e.target === 'sidebar') sidebarUsed = true;
        break;
      }
      case 'columns': {
        const wrap = el('div', 'nr-columns');
        const n = Math.max(1, Math.min(6, Number(e.count) || 2));
        const cols = [];
        for (let i = 0; i < n; i++) {
          const c = el('div', 'nr-col');
          wrap.appendChild(c);
          cols.push(c);
        }
        region.appendChild(wrap);
        colGroup = { cols, i: 0 };
        container = cols[0];
        break;
      }
      case 'nextcol': {
        if (colGroup) {
          colGroup.i = Math.min(colGroup.i + 1, colGroup.cols.length - 1);
          container = colGroup.cols[colGroup.i];
        }
        break;
      }
      case 'endcols': {
        colGroup = null;
        container = region;
        break;
      }

      // ---- static ----------------------------------------------------------
      // `html` (used by the live-script document renderer, host/doc.js) carries
      // already-sanitised inline markup — bold/italic/mono/links built in
      // livescript.js. Plain `text` stays textContent-only.
      case 'title': put(richText('div', 'nr-title', e)); break;
      case 'header': put(richText('div', 'nr-header', e)); break;
      case 'text': put(richText('div', 'nr-text', e)); break;
      case 'caption': put(richText('div', 'nr-caption', e)); break;
      case 'divider': put(el('hr', 'nr-divider')); break;
      case 'raw': put(el('pre', 'nr-raw', e.text)); break;
      case 'code': put(el('pre', 'nr-code', e.text)); break;
      case 'error': put(el('div', 'nr-error', e.text)); break;

      case 'metric': {
        if (!metricRow) { metricRow = el('div', 'nr-metric-row'); put(metricRow); }
        const card = el('div', 'nr-metric');
        card.appendChild(el('div', 'label', e.label));
        card.appendChild(el('div', 'value', e.value));
        if (e.delta !== undefined && e.delta !== null && e.delta !== '') {
          const up = !String(e.delta).startsWith('-');
          const d = el('div', `delta ${up ? 'up' : 'down'}`, `${up ? '▲' : '▼'} ${String(e.delta).replace(/^-/, '')}`);
          card.appendChild(d);
        }
        metricRow.appendChild(card);
        break;
      }

      case 'dataframe': {
        const box = el('div', 'nr-dataframe');
        const table = el('table');
        if (e.columns?.length) {
          const tr = el('tr');
          for (const c of e.columns) tr.appendChild(el('th', null, String(c)));
          table.appendChild(tr);
        }
        const rows = e.data ?? [];
        for (const row of rows) {
          const tr = el('tr');
          const cells = Array.isArray(row) ? row : [row];
          for (const v of cells) {
            tr.appendChild(el('td', null, typeof v === 'number' ? fmtNum(Math.round(v * 1e6) / 1e6) : String(v)));
          }
          table.appendChild(tr);
        }
        box.appendChild(table);
        if (e.truncated) box.appendChild(el('div', 'nr-caption', `showing first ${rows.length} rows`));
        put(box);
        break;
      }

      case 'figure': {
        const box = el('div', 'nr-figure');
        if (e.svg) box.innerHTML = e.svg;
        put(box);
        break;
      }

      case 'demo': {
        // nr_demo(title, description) — a gallery/notebook header (also sets the tab title)
        const box = el('div', 'nr-demo-head');
        box.appendChild(el('div', 'nr-demo-title', e.title || ''));
        if (e.description) box.appendChild(el('div', 'nr-demo-desc', e.description));
        put(box);
        break;
      }

      case 'heatmap': {
        const box = el('div', 'nr-figure nr-heatmap');
        const rows = e.data ?? [];
        const H = rows.length, W = H ? rows[0].length : 0;
        if (H && W) {
          let mn = Infinity, mx = -Infinity;
          for (const r of rows) for (const v of r) { if (v < mn) mn = v; if (v > mx) mx = v; }
          const span = (mx - mn) || 1;
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext('2d');
          const img = ctx.createImageData(W, H);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const [R, G, B] = plasma((rows[y][x] - mn) / span);
            const px = ((H - 1 - y) * W + x) * 4;   // flip so row 0 sits at the bottom
            img.data[px] = R; img.data[px + 1] = G; img.data[px + 2] = B; img.data[px + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          box.appendChild(canvas);
        }
        if (e.title) box.appendChild(el('div', 'nr-caption', e.title));
        put(box);
        break;
      }

      // ---- widgets ---------------------------------------------------------
      case 'slider': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const row = el('div', 'nr-slider-row');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = e.min; input.max = e.max; input.step = e.step; input.value = e.value;
        const val = el('span', 'val', fmtNum(e.value));
        input.addEventListener('input', () => { val.textContent = fmtNum(Number(input.value)); });
        input.addEventListener('change', () => setState(e.label, Number(input.value)));
        row.append(input, val);
        w.appendChild(row);
        put(w);
        break;
      }

      case 'number_input': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const input = document.createElement('input');
        input.type = 'number';
        if (e.min !== undefined) input.min = e.min;
        if (e.max !== undefined) input.max = e.max;
        if (e.step !== undefined) input.step = e.step;
        input.value = e.value;
        input.addEventListener('change', () => setState(e.label, Number(input.value)));
        w.appendChild(input);
        put(w);
        break;
      }

      case 'checkbox': {
        const w = el('div', 'nr-widget');
        const lab = el('label', 'nr-check');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!e.value;
        input.addEventListener('change', () => setState(e.label, input.checked));
        lab.append(input, document.createTextNode(e.label));
        w.appendChild(lab);
        put(w);
        break;
      }

      case 'selectbox': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const sel = document.createElement('select');
        for (const opt of e.options ?? []) {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt; o.selected = opt === e.value;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => setState(e.label, sel.value));
        w.appendChild(sel);
        put(w);
        break;
      }

      case 'radio': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const group = el('div', 'nr-radio-group');
        for (const opt of e.options ?? []) {
          const lab = el('label', 'nr-check');
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `nr-radio-${e.label}`;
          input.checked = opt === e.value;
          input.addEventListener('change', () => { if (input.checked) setState(e.label, opt); });
          lab.append(input, document.createTextNode(opt));
          group.appendChild(lab);
        }
        w.appendChild(group);
        put(w);
        break;
      }

      case 'multiselect': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const group = el('div', 'nr-radio-group');
        const chosen = new Set(e.value ?? []);
        for (const opt of e.options ?? []) {
          const lab = el('label', 'nr-check');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = chosen.has(opt);
          input.addEventListener('change', () => {
            if (input.checked) chosen.add(opt); else chosen.delete(opt);
            setState(e.label, [...chosen]);
          });
          lab.append(input, document.createTextNode(opt));
          group.appendChild(lab);
        }
        w.appendChild(group);
        put(w);
        break;
      }

      case 'text_input': {
        const w = el('div', 'nr-widget');
        w.appendChild(el('label', 'wlabel', e.label));
        const input = document.createElement('input');
        input.type = 'text';
        input.value = e.value ?? '';
        input.addEventListener('change', () => setState(e.label, input.value));
        w.appendChild(input);
        put(w);
        break;
      }

      case 'button': {
        const w = el('div', 'nr-widget');
        const btn = el('button', 'nr-button', e.label);
        btn.addEventListener('click', () => setState(e.label, true, { once: true }));
        w.appendChild(btn);
        put(w);
        break;
      }
    }
  }

  layout.classList.toggle('has-sidebar', sidebarUsed);
  if (!sidebarUsed) {
    sidebar.remove();
  } else {
    // Streamlit-style collapse. State survives reruns via mount.dataset;
    // narrow screens start collapsed (the CSS overlays the sidebar there).
    if (!mount.dataset.slSidebar) {
      const narrow = typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 768px)').matches;
      mount.dataset.slSidebar = narrow ? 'collapsed' : 'open';
    }
    const collapseBtn = el('button', 'nr-sidebar-toggle', '«');
    collapseBtn.title = 'Collapse sidebar';
    sidebar.insertBefore(collapseBtn, sidebarContent);
    const expandBtn = el('button', 'nr-sidebar-open', '»');
    expandBtn.title = 'Open sidebar';
    layout.appendChild(expandBtn);
    const apply = () => {
      layout.classList.toggle('sidebar-collapsed', mount.dataset.slSidebar === 'collapsed');
    };
    collapseBtn.addEventListener('click', () => { mount.dataset.slSidebar = 'collapsed'; apply(); });
    expandBtn.addEventListener('click', () => { mount.dataset.slSidebar = 'open'; apply(); });
    apply();
  }
  window.scrollTo(0, scrollY);
}
