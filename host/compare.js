/* numerical.run — consolidation comparison harness.
 *
 * Serves three edit-surface designs behind ?variant=1|2|3 (no arg = a chooser),
 * all over the same shared kernel / .nb.md / renderer as the real app:
 *   1) Notebook is the editor  — editable cells (Monaco per code cell) + inline
 *      outputs; App is a toggle. One surface; no duplicated render.
 *   2) Editor + App only        — one Monaco (whole .nb.md) + App preview.
 *   3) Editor + App + strip      — #2 plus a thin per-cell stdout/error strip.
 */

const V = document.body.dataset.v || String(Date.now());
const CFG = window.NUMCFG || {};
const RUNTIME = CFG.runtime || './runtime';
const FIGR = CFG.figrender || './runtime/figrender.mjs';
const MONACO = CFG.monaco || './monaco';
const q = (s) => document.querySelector(s);
const VARIANT = Number(new URLSearchParams(location.search).get('variant') || 0);
const NAMES = { 1: 'Notebook is the editor', 2: 'Editor + App only' };

if (VARIANT !== 1 && VARIANT !== 2) {
  // chooser stays visible (markup handles it); nothing else to do.
} else {
  q('#chooser').hidden = true;
  q('#stage').hidden = false;
  q('#vbadge').hidden = false; q('#vbadge').textContent = `option ${VARIANT}`;
  q('#vname').textContent = NAMES[VARIANT];
  q('#others').hidden = false;
  boot();
}

const status = (t) => { q('#status').textContent = t; const s2 = q('#status2'); if (s2) s2.textContent = t; };

let kernel, parseNbMd, serializeNbMd, newCell, mdToHtml;
let doc = { frontmatter: null, cells: [] }, source = '', lastByCell = new Map();
let monacoReady = false, blobEditor = null, appVisible = false;

async function boot() {
  const kmod = await import(`./kernel.js?v=${V}`);
  const nb = await import(`./nbmd.js?v=${V}`);
  const md = await import(`./md.js?v=${V}`);
  parseNbMd = nb.parseNbMd; serializeNbMd = nb.serializeNbMd; newCell = nb.newCell; mdToHtml = md.mdToHtml;
  kernel = await kmod.createKernel({
    statusEl: q('#status'), runtimeUrl: RUNTIME, figrenderUrl: `${FIGR}?v=${V}`,
    renderUrl: `./render.js?v=${V}`, library: await (await fetch(`./lib.m?v=${V}`)).text(),
  });

  // a multi-cell default so per-cell differences are visible
  try { source = await (await fetch(`./examples/waves.nb.md?v=${V}`)).text(); } catch { source = '# numerical.run\n'; }
  const code = new URLSearchParams(location.hash.slice(1)).get('code');
  if (code) { try { source = new TextDecoder().decode(Uint8Array.from(atob(code), (c) => c.charCodeAt(0))); } catch {} }
  doc = parseNbMd(source);

  q('#statusbar').hidden = false;
  wireCommon();
  if (VARIANT === 1) await initV1();
  else await initBlob();          // V2 + V3 share the Monaco-blob layout
  runAll();
}

// ---------------------------------------------------------------- shared run
function runAll() {
  if (VARIANT !== 1 && blobEditor) { source = blobEditor.getValue(); doc = parseNbMd(source); }
  status('running…'); const t0 = performance.now();
  kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; q('#dev-time').textContent = `${Math.round(performance.now() - t0)} ms`; status('ran'); afterRun(); });
}
function afterRun() {
  if (VARIANT === 1) { renderCellsOutputs(); if (appVisible) renderApp(); }
  else renderApp();
}
function appSetState(label, value, opts = {}) {
  kernel.markWidget(label, value, opts.once);
  kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; afterRun(); });
}
function cellSetState(cell) {
  return (label, value, opts = {}) => {
    kernel.markWidget(label, value, opts.once);
    kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); if (VARIANT === 1) updateCellOut(cell); else afterRun(); });
  };
}
function renderApp() {
  const elements = [];
  doc.cells.forEach((cell, i) => { if (cell.kind === 'markdown') elements.push({ type: 'text', html: mdToHtml(cell.source) }); else elements.push(...(lastByCell.get(i) ?? [])); });
  kernel.renderElements(q('#pv-app'), elements, appSetState);
}

// ---------------------------------------------------------------- Monaco loader
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
async function ensureMonaco() {
  if (monacoReady) return;
  // absolute base (origin-qualified) so the blob worker's importScripts resolves
  const BASE = /^https?:/.test(MONACO) ? MONACO : new URL(MONACO, location.href).href.replace(/\/$/, '');
  await loadScript(`${BASE}/vs/loader.js`);
  self.MonacoEnvironment = { getWorkerUrl() { return URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${BASE}/'};importScripts('${BASE}/vs/base/worker/workerMain.js');`], { type: 'text/javascript' })); } };
  require.config({ paths: { vs: `${BASE}/vs` } });
  await new Promise((res) => require(['vs/editor/editor.main'], res));
  monacoReady = true;
}
const theme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs');

// ---------------------------------------------------------------- V2: Monaco blob
async function initBlob() {
  q('#cells').hidden = true; q('#editor').style.display = '';
  q('#editor-head').textContent = 'editor · .nb.md — Run to render';
  await ensureMonaco();
  blobEditor = monaco.editor.create(q('#editor'), {
    value: source, language: 'markdown', theme: theme(), fontSize: 13, minimap: { enabled: false },
    automaticLayout: true, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  });
  blobEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runAll);
  requestAnimationFrame(() => blobEditor.layout());
}

// ---------------------------------------------------------------- V1: notebook is the editor
const cellEditors = new Map();   // cell.id -> monaco editor
async function initV1() {
  q('#stage').className = 'notebook';
  q('#editor').style.display = 'none';
  q('#cells').hidden = false;
  q('#editor-head').textContent = 'notebook — edit cells, run inline';
  // mode toggle Notebook | App
  const seg = q('#mode-seg'); seg.hidden = false;
  seg.innerHTML = '<button data-m="nb" class="on">Notebook</button><button data-m="app">App</button>';
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    appVisible = b.dataset.m === 'app';
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    q('#stage').classList.toggle('appview', appVisible);
    if (appVisible) renderApp();
  }));
  await ensureMonaco();
  renderCells();
}
// Grow the editor to fit its content exactly — a notebook cell has no inner
// scrollbar; the page scrolls, not the cell.
const CELL_OPTS = {
  language: 'markdown', theme: theme(), fontSize: 13, lineHeight: 19, minimap: { enabled: false },
  lineNumbers: 'off', wordWrap: 'on', folding: false, tabSize: 4, automaticLayout: true,
  scrollBeyondLastLine: false, overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
  renderLineHighlight: 'none', contextmenu: false,
  scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false, alwaysConsumeMouseWheel: false, verticalScrollbarSize: 0, horizontalScrollbarSize: 0 },
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};
function autoHeight(ed, el) { el.style.height = (ed.getContentHeight() + 2) + 'px'; ed.layout(); }
function renderCells() {
  const root = q('#cells'); root.innerHTML = ''; cellEditors.clear();
  doc.cells.forEach((cell) => root.appendChild(cellNode(cell)));
  const add = document.createElement('div'); add.className = 'nb-add';
  const c = document.createElement('button'); c.textContent = '+ Code'; c.onclick = () => { const n = newCell('code', ''); doc.cells.push(n); renderCells(); };
  const m = document.createElement('button'); m.textContent = '+ Text'; m.onclick = () => { const n = newCell('markdown', '_text_'); doc.cells.push(n); renderCells(); };
  add.append(c, m); root.appendChild(add);
}
function cellNode(cell) {
  const box = document.createElement('div'); box.className = `nbc ${cell.kind}`;
  const head = document.createElement('div'); head.className = 'nbc-head';
  if (cell.kind === 'code') { const r = document.createElement('button'); r.className = 'nbc-run'; r.textContent = '▸ Run'; r.onclick = () => runCellById(cell); head.appendChild(r); }
  const badge = document.createElement('span'); badge.className = 'nbc-badge'; badge.textContent = cell.kind === 'code' ? 'code' : 'md';
  const sp = document.createElement('span'); sp.style.flex = '1';
  const del = document.createElement('button'); del.className = 'nbc-run'; del.textContent = '✕'; del.title = 'delete'; del.onclick = () => { doc.cells = doc.cells.filter((c) => c !== cell); renderCells(); };
  head.append(badge, sp, del); box.appendChild(head);

  if (cell.kind === 'code') {
    const edEl = document.createElement('div'); edEl.className = 'cell-ed'; box.appendChild(edEl);
    const ed = monaco.editor.create(edEl, { value: cell.source, ...CELL_OPTS });
    cellEditors.set(cell.id, ed);
    ed.onDidChangeModelContent(() => { cell.source = ed.getValue(); });
    ed.onDidContentSizeChange(() => autoHeight(ed, edEl));
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCellById(cell));
    requestAnimationFrame(() => autoHeight(ed, edEl));
    const out = document.createElement('div'); out.className = 'cell-out'; out.dataset.cellOut = cell.id; box.appendChild(out);
    const els = lastByCell.get(doc.cells.indexOf(cell)) ?? []; if (els.length) kernel.renderElements(out, els, cellSetState(cell));
  } else {
    const view = document.createElement('div'); view.className = 'md-view';
    view.innerHTML = mdToHtml(cell.source) || '<span class="nbc-badge">empty text cell — tap ✎ Edit</span>';
    view.title = 'double-click to edit';
    const enterEdit = () => {
      if (box.querySelector('.cell-ed')) return;              // already editing
      const edEl = document.createElement('div'); edEl.className = 'cell-ed'; box.replaceChild(edEl, view);
      const ed = monaco.editor.create(edEl, { value: cell.source, ...CELL_OPTS });
      requestAnimationFrame(() => { autoHeight(ed, edEl); ed.focus(); });
      ed.onDidChangeModelContent(() => { cell.source = ed.getValue(); });
      ed.onDidContentSizeChange(() => autoHeight(ed, edEl));
      ed.onDidBlurEditorWidget(() => renderCells());
    };
    view.addEventListener('dblclick', enterEdit);
    // explicit affordance (double-click doesn't exist on touch)
    const editBtn = document.createElement('button'); editBtn.className = 'nbc-run'; editBtn.textContent = '✎ Edit'; editBtn.onclick = enterEdit;
    head.insertBefore(editBtn, head.firstChild);
    box.appendChild(view);
  }
  return box;
}
function runCellById(cell) { status('running cell…'); kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); updateCellOut(cell); status('ran cell'); }); }
function updateCellOut(cell) {
  const out = document.querySelector(`[data-cell-out="${cell.id}"]`); if (!out) return;
  out.innerHTML = ''; const els = lastByCell.get(doc.cells.indexOf(cell)) ?? []; if (els.length) kernel.renderElements(out, els, cellSetState(cell));
}
function renderCellsOutputs() { doc.cells.forEach((cell) => { if (cell.kind === 'code') updateCellOut(cell); }); }

// ---------------------------------------------------------------- common wiring
function wireCommon() {
  const runBtn = q('#run-btn'); runBtn.hidden = false; runBtn.onclick = runAll;
  if (VARIANT === 1) runBtn.textContent = '▶ Run all';
}
