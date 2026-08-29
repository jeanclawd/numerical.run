/* numerical.run shell — two modes over one .nb.md document and one kernel.
 *
 *   Notebook mode : STATEFUL cell execution (Jupyter-style). Each code cell has
 *                   its own ▸ Run (and Ctrl+Enter); running a cell executes it
 *                   against the persistent workspace and updates only that
 *                   cell's output. A widget inside a cell's output reruns just
 *                   that cell. "Run all" resets and runs every cell in order.
 *
 *   App mode      : WHOLE-DOCUMENT rerun (Streamlit-style). Every interaction
 *                   resets the session and runs the whole document top-to-bottom;
 *                   widgets and outputs render in place, code hidden, prose
 *                   interleaved.
 *
 *   Widgets panel : WYSIWYG — click a widget to write its sl_* call into the
 *                   active code cell (or a new one) and run.
 */

const V = document.body.dataset.v || String(Date.now());
const { createKernel } = await import(`./kernel.js?v=${V}`);
const { parseNbMd, serializeNbMd, newCell } = await import(`./nbmd.js?v=${V}`);
const { mdToHtml } = await import(`./md.js?v=${V}`);

const $ = (id) => document.getElementById(id);
const EXAMPLES = ['waves.nb.md', 'knn.nb.md', 'hello.nb.md'];

const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

const kernel = await createKernel({
  statusEl: $('status'),
  runtimeUrl: './runtime',
  figrenderUrl: `./runtime/figrender.mjs?v=${V}`,
  renderUrl: `./render.js?v=${V}`,
  library: await (await fetch(`./lib.m?v=${V}`)).text(),
});

// ---------------------------------------------------------------- document state
let doc = { frontmatter: null, cells: [] };
let mode = 'notebook';           // 'notebook' | 'app'
let lastByCell = new Map();      // cell-index -> output elements
let activeId = null;             // last-focused code cell (WYSIWYG target)
const counters = {};             // per-kind widget label counter
const outNodes = new Map();      // cell-id -> its .cell-out node (notebook)

const status = (t) => { $('status').textContent = t; };
const cellIndex = (id) => doc.cells.findIndex((c) => c.id === id);
const codeCellById = (id) => doc.cells.find((c) => c.id === id && c.kind === 'code');

// ---------------------------------------------------------------- running
function timed(label, promise, done) {
  status(`${label}…`);
  const t0 = performance.now();
  promise.then((r) => { status(`${label} · ${Math.round(performance.now() - t0)} ms`); done(r); });
}

// App mode: whole-document rerun.
function runApp() { timed('ran', kernel.runAll(doc.cells), (byCell) => { lastByCell = byCell; renderApp(); }); }

// Notebook: run all cells (reset + top-to-bottom), refresh every output.
function runAllNotebook() { timed('ran all', kernel.runAll(doc.cells), (byCell) => { lastByCell = byCell; refreshOutputs(); }); }

// Notebook: run one cell statefully, refresh only its output.
function runOneCell(cell) {
  timed('ran cell', kernel.runCell(cell), (els) => {
    lastByCell.set(cellIndex(cell.id), els);
    updateCellOut(cell.id, els);
  });
}

function runForMode() { mode === 'app' ? runApp() : runAllNotebook(); }

// ---------------------------------------------------------------- setState
// A widget interaction: notebook reruns just the owning cell; app reruns all.
function cellSetState(cell) {
  return (label, value, opts = {}) => {
    kernel.markWidget(label, value, opts.once);
    timed('ran cell', kernel.runCell(cell), (els) => { lastByCell.set(cellIndex(cell.id), els); updateCellOut(cell.id, els); });
  };
}
function appSetState(label, value, opts = {}) {
  kernel.markWidget(label, value, opts.once);
  timed('ran', kernel.runAll(doc.cells), (byCell) => { lastByCell = byCell; renderApp(); });
}

// ---------------------------------------------------------------- notebook view
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 34) + 'px'; }

function moveCell(id, dir) {
  const i = cellIndex(id), j = i + dir;
  if (j < 0 || j >= doc.cells.length) return;
  [doc.cells[i], doc.cells[j]] = [doc.cells[j], doc.cells[i]];
  renderNotebook(); runAllNotebook();
}
function deleteCell(id) { doc.cells = doc.cells.filter((c) => c.id !== id); renderNotebook(); runAllNotebook(); }
function addCell(kind, afterId) {
  const cell = newCell(kind, kind === 'markdown' ? '_New text cell — double-click to edit._' : '');
  doc.cells.splice(afterId ? cellIndex(afterId) + 1 : doc.cells.length, 0, cell);
  activeId = cell.id;
  renderNotebook();
}

function toolbar(cell) {
  const bar = document.createElement('div');
  bar.className = 'cell-bar';
  if (cell.kind === 'code') {
    const runb = document.createElement('button');
    runb.className = 'icon run'; runb.textContent = '▸ Run'; runb.title = 'Run this cell (Ctrl+Enter)';
    runb.addEventListener('click', () => runOneCell(cell));
    bar.appendChild(runb);
  }
  const badge = document.createElement('span');
  badge.className = 'cell-badge'; badge.textContent = cell.kind === 'code' ? 'code' : 'md';
  bar.appendChild(badge);
  const spacer = document.createElement('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
  const mk = (label, title, fn) => {
    const b = document.createElement('button'); b.className = 'icon'; b.textContent = label; b.title = title;
    b.addEventListener('click', fn); bar.appendChild(b);
  };
  mk('↑', 'Move up', () => moveCell(cell.id, -1));
  mk('↓', 'Move down', () => moveCell(cell.id, +1));
  mk('+code', 'Add code cell below', () => addCell('code', cell.id));
  mk('+text', 'Add text cell below', () => addCell('markdown', cell.id));
  mk('✕', 'Delete cell', () => deleteCell(cell.id));
  return bar;
}

function updateCellOut(cellId, els) {
  const out = outNodes.get(cellId);
  if (!out) return;
  out.innerHTML = '';
  const cell = codeCellById(cellId);
  if (els?.length && cell) kernel.renderElements(out, els, cellSetState(cell));
}

function refreshOutputs() {
  doc.cells.forEach((cell, i) => { if (cell.kind === 'code') updateCellOut(cell.id, lastByCell.get(i) ?? []); });
}

function renderNotebook() {
  const root = $('notebook');
  root.innerHTML = '';
  outNodes.clear();
  doc.cells.forEach((cell, i) => {
    const box = document.createElement('div');
    box.className = `nb-cell ${cell.kind}${cell.id === activeId ? ' active' : ''}`;
    box.appendChild(toolbar(cell));

    if (cell.kind === 'code') {
      const ta = document.createElement('textarea');
      ta.className = 'cell-src'; ta.spellcheck = false; ta.value = cell.source;
      ta.addEventListener('input', () => { cell.source = ta.value; autosize(ta); });
      ta.addEventListener('focus', () => { activeId = cell.id; updatePaletteTarget(); box.classList.add('active'); });
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runOneCell(cell); }
      });
      box.appendChild(ta);
      const out = document.createElement('div');
      out.className = 'cell-out';
      outNodes.set(cell.id, out);
      const els = lastByCell.get(i) ?? [];
      if (els.length) kernel.renderElements(out, els, cellSetState(cell));
      box.appendChild(out);
      setTimeout(() => autosize(ta), 0);
    } else {
      const view = document.createElement('div');
      view.className = 'md'; view.innerHTML = mdToHtml(cell.source); view.title = 'Double-click to edit';
      view.addEventListener('dblclick', () => {
        const ta = document.createElement('textarea');
        ta.className = 'cell-src'; ta.spellcheck = false; ta.value = cell.source;
        ta.addEventListener('input', () => autosize(ta));
        ta.addEventListener('blur', () => { cell.source = ta.value; renderNotebook(); });
        ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ta.blur(); } });
        box.replaceChild(ta, view); ta.focus(); autosize(ta);
      });
      box.appendChild(view);
    }
    root.appendChild(box);
  });

  const add = document.createElement('div');
  add.className = 'nb-add';
  const c = document.createElement('button'); c.textContent = '+ Code';
  c.addEventListener('click', () => addCell('code', doc.cells.at(-1)?.id));
  const m = document.createElement('button'); m.textContent = '+ Text';
  m.addEventListener('click', () => addCell('markdown', doc.cells.at(-1)?.id));
  add.append(c, m);
  root.appendChild(add);
}

// ---------------------------------------------------------------- app view
function renderApp() {
  const elements = [];
  doc.cells.forEach((cell, i) => {
    if (cell.kind === 'markdown') elements.push({ type: 'text', html: mdToHtml(cell.source) });
    else elements.push(...(lastByCell.get(i) ?? []));
  });
  kernel.renderElements($('app'), elements, appSetState);
}

function renderCurrent() { mode === 'app' ? renderApp() : renderNotebook(); }

// ---------------------------------------------------------------- WYSIWYG palette
const WIDGETS = [
  { kind: 'slider',       bind: true,  label: 'Slider',      snip: (n, l) => `${n} = sl_slider('${l}', 0, 10, 5);` },
  { kind: 'number_input', bind: true,  label: 'Number',      snip: (n, l) => `${n} = sl_number_input('${l}', 1);` },
  { kind: 'checkbox',     bind: true,  label: 'Checkbox',    snip: (n, l) => `${n} = sl_checkbox('${l}', true);` },
  { kind: 'selectbox',    bind: true,  label: 'Select',      snip: (n, l) => `${n} = sl_selectbox('${l}', {'one','two','three'});` },
  { kind: 'radio',        bind: true,  label: 'Radio',       snip: (n, l) => `${n} = sl_radio('${l}', {'a','b','c'});` },
  { kind: 'multiselect',  bind: true,  label: 'Multiselect', snip: (n, l) => `${n} = sl_multiselect('${l}', {'a','b','c'});` },
  { kind: 'text_input',   bind: true,  label: 'Text input',  snip: (n, l) => `${n} = sl_text_input('${l}', '');` },
  { kind: 'button',       bind: false, label: 'Button',      snip: (n, l) => `if sl_button('${l}')\n    disp('${l} clicked');\nend` },
  { kind: 'header',       bind: false, label: 'Header',      snip: (n, l) => `sl_header('${l}');` },
  { kind: 'text',         bind: false, label: 'Text',        snip: (n, l) => `sl_text('${l}');` },
  { kind: 'metric',       bind: false, label: 'Metric',      snip: (n, l) => `sl_metric('${l}', 42);` },
  { kind: 'figure',       bind: false, label: 'Figure',      snip: () => `figure;\nplot(1:20, (1:20).^2);\nsl_figure();` },
  { kind: 'divider',      bind: false, label: 'Divider',     snip: () => `sl_divider();` },
];

function uniq(kind) { counters[kind] = (counters[kind] || 0) + 1; return { name: `${kind}${counters[kind]}`, label: `${kind} ${counters[kind]}` }; }

function insertWidget(w) {
  const { name, label } = uniq(w.kind);
  const snippet = w.snip(name, label);
  let cell = codeCellById(activeId);
  if (!cell) { cell = newCell('code', ''); doc.cells.push(cell); activeId = cell.id; }
  cell.source = cell.source.trim() ? `${cell.source.replace(/\s+$/, '')}\n${snippet}` : snippet;
  if (w.bind) cell.meta.widget = { kind: w.kind, bind: name };
  if (mode === 'app') { renderApp(); runApp(); }
  else { renderNotebook(); runOneCell(cell); }
}

function updatePaletteTarget() { $('palette-target').textContent = codeCellById(activeId) ? '→ active code cell' : '→ new cell'; }

function buildPalette() {
  const grid = $('palette-grid');
  for (const w of WIDGETS) {
    const b = document.createElement('button'); b.className = 'palette-item'; b.textContent = w.label;
    b.addEventListener('click', () => insertWidget(w));
    grid.appendChild(b);
  }
}

// ---------------------------------------------------------------- mode + shell
function setMode(m) {
  mode = m;
  $('notebook').hidden = m !== 'notebook';
  $('app').hidden = m !== 'app';
  $('run-btn').textContent = m === 'app' ? 'Rerun ▸' : 'Run all ▸';
  $('run-btn').title = m === 'app' ? 'Rerun the whole document' : 'Reset and run every cell top-to-bottom';
  document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'app') runApp(); else renderNotebook();
}

function loadText(text, run = true) {
  doc = parseNbMd(text);
  for (const k in counters) delete counters[k];
  lastByCell = new Map();
  activeId = doc.cells.find((c) => c.kind === 'code')?.id ?? null;
  renderNotebook();
  if (run) (mode === 'app' ? runApp() : runAllNotebook());
}

async function loadExample(name) { loadText(await (await fetch(`./examples/${name}?v=${V}`)).text()); }

async function boot() {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('nb')) { try { return loadText(b64decode(hash.get('nb'))); } catch (e) { status(`bad #nb link: ${e.message}`); } }
  if (params.get('nb')) {
    try { const r = await fetch(params.get('nb')); if (!r.ok) throw new Error(`HTTP ${r.status}`); return loadText(await r.text()); }
    catch (e) { status(`could not fetch ?nb=: ${e.message}`); }
  }
  await loadExample(EXAMPLES[0]);
}

// wiring
const exSel = $('example');
for (const e of EXAMPLES) { const o = document.createElement('option'); o.value = e; o.textContent = e.replace('.nb.md', ''); exSel.appendChild(o); }
exSel.addEventListener('change', () => void loadExample(exSel.value));
document.querySelectorAll('#mode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('run-btn').addEventListener('click', () => runForMode());
$('design-btn').addEventListener('click', () => { const p = $('palette'); p.hidden = !p.hidden; updatePaletteTarget(); });
$('palette-close').addEventListener('click', () => { $('palette').hidden = true; });
$('share-btn').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#nb=${b64encode(serializeNbMd(doc))}`;
  try { await navigator.clipboard.writeText(url); status(`share link copied (${url.length} chars)`); }
  catch { prompt('share link:', url); }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); runForMode(); }
});

buildPalette();
await boot();
window.__numerical = { get doc() { return doc; }, serialize: () => serializeNbMd(doc), runApp, runAllNotebook };
