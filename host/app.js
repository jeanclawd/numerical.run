/* numerical.run — single-page app (v0.2.0).
 *
 * The document is one .nb.md; the EDITOR is chosen by a URL param, no button:
 *   ?editor=notebook  (default) — the notebook IS the editor: editable cells
 *                                 (Monaco per code cell) with outputs inline.
 *   ?editor=classic              — one Monaco over the whole .nb.md + an App
 *                                 preview beside it (no notebook view).
 *
 * Orthogonally, ?edit toggles authoring vs. the rendered App (View ▸ / ✎ Edit).
 * A bare URL with no shared document opens straight into the editor; a shared
 * document (#code=/?gist=) opens as the App unless ?edit is present.
 *
 * Document source: #code=<base64> | ?code= | ?gist=<id|raw-url> | built-in default.
 */

const V = document.body.dataset.v || String(Date.now());
const CFG = window.NUMCFG || {};
const RUNTIME = CFG.runtime || './runtime';
const FIGR = CFG.figrender || './runtime/figrender.mjs';
const MONACO = CFG.monaco || './monaco';
const q = (s) => document.querySelector(s);
const status = (t) => { const s = q('#status2'); if (s) s.textContent = t; };
const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

const EXAMPLES = ['waves.nb.md', 'knn.nb.md', 'hello.nb.md'];
const DEFAULT_DOC = `# numerical.run

A \`.nb.md\` notebook that runs entirely in your browser on the RunMat WASM
kernel. Edit the cells; hit **Run** (⌘/Ctrl+Enter). *View ▸* renders it as an app.

\`\`\`matlab {jupyter.code-cell}
f = sl_slider('frequency', 1, 8, 3, 0.5);
x = linspace(0, 2*pi, 400);
figure; plot(x, sin(f * x)); sl_figure();
sl_metric('frequency', f, '%g');
\`\`\`
`;

// ---------------------------------------------------------------- imports + kernel
const { createKernel } = await import(`./kernel.js?v=${V}`);
const { parseNbMd, serializeNbMd, newCell } = await import(`./nbmd.js?v=${V}`);
const { mdToHtml } = await import(`./md.js?v=${V}`);
const kernel = await createKernel({
  statusEl: q('#status2'), runtimeUrl: RUNTIME, figrenderUrl: `${FIGR}?v=${V}`,
  renderUrl: `./render.js?v=${V}`, library: await (await fetch(`./lib.m?v=${V}`)).text(),
});

// ---------------------------------------------------------------- state
let editorMode = 'notebook';          // 'notebook' | 'classic'  (URL: ?editor=)
let editing = false;                  // authoring vs. App view  (URL: ?edit)
let doc = { frontmatter: null, cells: [] };
let source = '';
let lastByCell = new Map();
let blobEditor = null, monacoReady = false;
const cellEditors = new Map();
const mdEditing = new Set();          // markdown cell ids currently open in an editor
let pendingFocus = null;              // code cell id to focus after the next render
let rendering = false;                // guard: ignore blur events fired during a re-render
const counters = {};

// ---------------------------------------------------------------- run + render
function currentSource() { return editing && editorMode === 'notebook' ? serializeNbMd(doc) : (blobEditor ? blobEditor.getValue() : source); }
function runAll() {
  status('running…'); const t0 = performance.now();
  kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; const e = q('#dev-time'); if (e) e.textContent = `${Math.round(performance.now() - t0)} ms`; status('ran'); render(); });
}
function loadText(text) { source = text; doc = parseNbMd(text); syncEditors(); runAll(); }
function render() { (editing && editorMode === 'notebook') ? renderCellsOutputs() : renderApp(); }

function renderApp() {
  const elements = [];
  doc.cells.forEach((cell, i) => { if (cell.kind === 'markdown') elements.push({ type: 'text', html: mdToHtml(cell.source) }); else elements.push(...(lastByCell.get(i) ?? [])); });
  kernel.renderElements(q('#pv-app'), elements, appSetState);
}
function appSetState(label, value, opts = {}) { kernel.markWidget(label, value, opts.once); kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; render(); }); }
function cellSetState(cell) { return (label, value, opts = {}) => { kernel.markWidget(label, value, opts.once); kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); updateCellOut(cell); }); }; }

// ---------------------------------------------------------------- Monaco
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
async function ensureMonaco() {
  if (monacoReady) return;
  const BASE = /^https?:/.test(MONACO) ? MONACO : new URL(MONACO, location.href).href.replace(/\/$/, '');
  await loadScript(`${BASE}/vs/loader.js`);
  self.MonacoEnvironment = { getWorkerUrl() { return URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${BASE}/'};importScripts('${BASE}/vs/base/worker/workerMain.js');`], { type: 'text/javascript' })); } };
  require.config({ paths: { vs: `${BASE}/vs` } });
  await new Promise((res) => require(['vs/editor/editor.main'], res));
  monacoReady = true;
}
const theme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs');
const CELL_OPTS = () => ({
  language: 'markdown', theme: theme(), fontSize: 13, lineHeight: 19, minimap: { enabled: false },
  lineNumbers: 'off', wordWrap: 'on', folding: false, tabSize: 4, automaticLayout: true, scrollBeyondLastLine: false,
  overviewRulerLanes: 0, hideCursorInOverviewRuler: true, renderLineHighlight: 'none', contextmenu: false,
  scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false, verticalScrollbarSize: 0, horizontalScrollbarSize: 0 },
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});

// ---------------------------------------------------------------- classic (Monaco blob)
async function ensureBlob() {
  await ensureMonaco();
  if (!blobEditor) {
    blobEditor = monaco.editor.create(q('#editor'), {
      value: source, language: 'markdown', theme: theme(), fontSize: 13, minimap: { enabled: false },
      automaticLayout: true, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 4,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    });
    blobEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => loadText(blobEditor.getValue()));
  } else { blobEditor.setValue(source); }
  requestAnimationFrame(() => blobEditor.layout());
}

// ---------------------------------------------------------------- notebook (cells)
function autoHeight(ed, el) { el.style.height = (ed.getContentHeight() + 2) + 'px'; ed.layout(); }

// Insert a cell at any position, then bring it into edit focus.
function insertAt(index, kind) {
  const cell = newCell(kind, '');
  doc.cells.splice(index, 0, cell);
  if (kind === 'markdown') mdEditing.add(cell.id); else pendingFocus = cell.id;
  renderCells();
}
// A gap control: a subtle "+" that expands to Code/Text and inserts at `index`.
function insertControl(index) {
  const wrap = document.createElement('div'); wrap.className = 'nb-ins';
  const plus = document.createElement('button'); plus.className = 'plus'; plus.textContent = '+'; plus.title = 'Insert a cell here';
  plus.onclick = () => {
    plus.remove();
    const choice = document.createElement('div'); choice.className = 'choice';
    const c = document.createElement('button'); c.textContent = '＋ Code'; c.onclick = () => insertAt(index, 'code');
    const t = document.createElement('button'); t.textContent = '＋ Text'; t.onclick = () => insertAt(index, 'markdown');
    choice.append(c, t); wrap.appendChild(choice);
    setTimeout(() => {
      const off = (e) => { if (!wrap.contains(e.target)) { document.removeEventListener('click', off); wrap.replaceChildren(plus); } };
      document.addEventListener('click', off);
    }, 0);
  };
  wrap.appendChild(plus);
  return wrap;
}
function renderCells() {
  rendering = true;
  const root = q('#cells');
  cellEditors.forEach((ed) => { try { ed.dispose(); } catch {} });
  cellEditors.clear(); root.innerHTML = '';
  root.appendChild(insertControl(0));
  doc.cells.forEach((cell, i) => { root.appendChild(cellNode(cell)); root.appendChild(insertControl(i + 1)); });
  rendering = false;
  if (pendingFocus) { cellEditors.get(pendingFocus)?.focus(); pendingFocus = null; }
}
function cellNode(cell) {
  const box = document.createElement('div'); box.className = `nbc ${cell.kind}`;
  const head = document.createElement('div'); head.className = 'nbc-head';
  const badge = document.createElement('span'); badge.className = 'nbc-badge'; badge.textContent = cell.kind === 'code' ? 'code' : 'md';
  const sp = document.createElement('span'); sp.style.flex = '1';
  const del = document.createElement('button'); del.className = 'nbc-btn'; del.textContent = '✕'; del.title = 'delete'; del.onclick = () => { doc.cells = doc.cells.filter((c) => c !== cell); renderCells(); };
  if (cell.kind === 'code') { const r = document.createElement('button'); r.className = 'nbc-btn'; r.textContent = '▸ Run'; r.onclick = () => runCellById(cell); head.append(r); }
  head.append(badge, sp, del); box.appendChild(head);

  if (cell.kind === 'code') {
    const edEl = document.createElement('div'); edEl.className = 'cell-ed'; box.appendChild(edEl);
    const ed = monaco.editor.create(edEl, { value: cell.source, ...CELL_OPTS() });
    cellEditors.set(cell.id, ed);
    ed.onDidChangeModelContent(() => { cell.source = ed.getValue(); });
    ed.onDidContentSizeChange(() => autoHeight(ed, edEl));
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCellById(cell));
    requestAnimationFrame(() => autoHeight(ed, edEl));
    const out = document.createElement('div'); out.className = 'cell-out'; out.dataset.cellOut = cell.id; box.appendChild(out);
    const els = lastByCell.get(doc.cells.indexOf(cell)) ?? []; if (els.length) kernel.renderElements(out, els, cellSetState(cell));
  } else if (mdEditing.has(cell.id)) {
    // text cell open in an editor (freshly inserted, or after tapping ✎ Edit)
    const doneBtn = document.createElement('button'); doneBtn.className = 'nbc-btn'; doneBtn.textContent = '✓ Done';
    doneBtn.onclick = () => { mdEditing.delete(cell.id); renderCells(); };
    head.insertBefore(doneBtn, head.firstChild);
    const edEl = document.createElement('div'); edEl.className = 'cell-ed'; box.appendChild(edEl);
    const ed = monaco.editor.create(edEl, { value: cell.source, ...CELL_OPTS() });
    cellEditors.set(cell.id, ed);
    requestAnimationFrame(() => { autoHeight(ed, edEl); ed.focus(); });
    ed.onDidChangeModelContent(() => { cell.source = ed.getValue(); });
    ed.onDidContentSizeChange(() => autoHeight(ed, edEl));
    ed.onDidBlurEditorWidget(() => { if (rendering) return; if (mdEditing.has(cell.id)) { mdEditing.delete(cell.id); renderCells(); } });
  } else {
    const view = document.createElement('div'); view.className = 'md-view';
    view.innerHTML = mdToHtml(cell.source) || '<span class="nbc-badge">empty text cell — tap ✎ Edit</span>';
    const enterEdit = () => { mdEditing.add(cell.id); renderCells(); };
    view.addEventListener('dblclick', enterEdit);
    const editBtn = document.createElement('button'); editBtn.className = 'nbc-btn'; editBtn.textContent = '✎ Edit'; editBtn.onclick = enterEdit;
    head.insertBefore(editBtn, head.firstChild);
    box.appendChild(view);
  }
  return box;
}
function runCellById(cell) { status('running cell…'); kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); updateCellOut(cell); status('ran cell'); }); }
function updateCellOut(cell) { const out = document.querySelector(`[data-cell-out="${cell.id}"]`); if (!out) return; out.innerHTML = ''; const els = lastByCell.get(doc.cells.indexOf(cell)) ?? []; if (els.length) kernel.renderElements(out, els, cellSetState(cell)); }
function renderCellsOutputs() { doc.cells.forEach((cell) => { if (cell.kind === 'code') updateCellOut(cell); }); }

// ---------------------------------------------------------------- mode / layout
function setStage() {
  const stage = q('#stage');
  stage.className = !editing ? 'view' : editorMode;      // 'view' | 'classic' | 'notebook'
  document.body.classList.toggle('is-edit', editing);
  q('#modetag').textContent = !editing ? '.nb.md · RunMat · in-browser'
    : (editorMode === 'notebook' ? 'notebook editor' : 'classic editor');
}
async function syncEditors() {
  if (editing && editorMode === 'classic') await ensureBlob();
  if (editing && editorMode === 'notebook') { await ensureMonaco(); renderCells(); }
}
function updateURL() {
  const p = new URLSearchParams(location.search);
  if (editing) p.set('edit', '1'); else p.delete('edit');
  if (editorMode === 'classic') p.set('editor', 'classic'); else p.delete('editor');
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}
async function setEditing(on) {
  if (!on && editing) source = currentSource();     // keep edits when leaving
  editing = on; setStage(); updateURL();
  await syncEditors();
  render();
}

// ---------------------------------------------------------------- gist
async function fetchGist(ref) {
  if (/^https?:\/\//.test(ref)) { const r = await fetch(ref); if (!r.ok) throw new Error(`gist url HTTP ${r.status}`); return await r.text(); }
  const id = ref.split('/').pop();
  const r = await fetch(`https://api.github.com/gists/${id}`); if (!r.ok) throw new Error(`gist API HTTP ${r.status}`);
  const files = Object.values((await r.json()).files || {}); if (!files.length) throw new Error('gist has no files');
  const pick = files.find((f) => /\.nb\.md$/.test(f.filename)) || files.find((f) => /\.md$/.test(f.filename)) || files.find((f) => /\.m$/.test(f.filename)) || files[0];
  if (pick.truncated && pick.raw_url) return await (await fetch(pick.raw_url)).text();
  return pick.content;
}

// ---------------------------------------------------------------- WYSIWYG palette
const WIDGETS = [
  { kind: 'slider', bind: true, label: 'Slider', snip: (n, l) => `${n} = sl_slider('${l}', 0, 10, 5);` },
  { kind: 'number_input', bind: true, label: 'Number', snip: (n, l) => `${n} = sl_number_input('${l}', 1);` },
  { kind: 'checkbox', bind: true, label: 'Checkbox', snip: (n, l) => `${n} = sl_checkbox('${l}', true);` },
  { kind: 'selectbox', bind: true, label: 'Select', snip: (n, l) => `${n} = sl_selectbox('${l}', {'one','two','three'});` },
  { kind: 'radio', bind: true, label: 'Radio', snip: (n, l) => `${n} = sl_radio('${l}', {'a','b','c'});` },
  { kind: 'text_input', bind: true, label: 'Text input', snip: (n, l) => `${n} = sl_text_input('${l}', '');` },
  { kind: 'button', bind: false, label: 'Button', snip: (n, l) => `if sl_button('${l}')\n    disp('${l} clicked');\nend` },
  { kind: 'metric', bind: false, label: 'Metric', snip: (n, l) => `sl_metric('${l}', 42);` },
  { kind: 'figure', bind: false, label: 'Figure', snip: () => `figure;\nplot(1:20, (1:20).^2);\nsl_figure();` },
  { kind: 'text', bind: false, label: 'Text', snip: (n, l) => `sl_text('${l}');` },
];
function uniq(kind) { counters[kind] = (counters[kind] || 0) + 1; return { name: `${kind}${counters[kind]}`, label: `${kind} ${counters[kind]}` }; }
function insertWidget(w) {
  const { name, label } = uniq(w.kind); const snippet = w.snip(name, label);
  const d = parseNbMd(currentSource());
  let cell = [...d.cells].reverse().find((c) => c.kind === 'code');
  if (!cell) { cell = newCell('code', ''); d.cells.push(cell); }
  cell.source = cell.source.trim() ? `${cell.source.replace(/\s+$/, '')}\n${snippet}` : snippet;
  loadText(serializeNbMd(d));
}
function buildPalette() { const g = q('#palette-grid'); for (const w of WIDGETS) { const b = document.createElement('button'); b.className = 'palette-item'; b.textContent = w.label; b.onclick = () => insertWidget(w); g.appendChild(b); } }

// ---------------------------------------------------------------- shell wiring
function shareLink() { return `${location.origin}${location.pathname}#code=${b64encode(currentSource())}`; }
function wire() {
  const sel = q('#example');
  for (const e of EXAMPLES) { const o = document.createElement('option'); o.value = e; o.textContent = e.replace('.nb.md', ''); sel.appendChild(o); }
  sel.addEventListener('change', async () => { loadText(await (await fetch(`./examples/${sel.value}?v=${V}`)).text()); });
  q('#run-btn').addEventListener('click', () => loadText(currentSource()));
  q('#edit-btn').addEventListener('click', () => setEditing(true));
  q('#view-btn').addEventListener('click', () => setEditing(false));
  q('#widgets-btn').addEventListener('click', () => { const p = q('#palette'); p.hidden = !p.hidden; });
  q('#palette-close').addEventListener('click', () => { q('#palette').hidden = true; });
  q('#share-btn').addEventListener('click', async () => { const url = shareLink(); try { await navigator.clipboard.writeText(url); status(`link copied (${url.length} chars)`); } catch { prompt('share link:', url); } });
  buildPalette();
}

// ---------------------------------------------------------------- boot
async function boot() {
  wire();
  const hash = new URLSearchParams(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  editorMode = (hash.get('editor') || params.get('editor')) === 'classic' ? 'classic' : 'notebook';
  const wantEdit = hash.has('edit') || params.has('edit');
  const code = hash.get('code') || params.get('code');
  const gist = hash.get('gist') || params.get('gist');
  try {
    if (code) source = b64decode(code);
    else if (gist) source = await fetchGist(gist);
    else source = DEFAULT_DOC;
  } catch (e) { source = DEFAULT_DOC; status(`bad source: ${e.message}`); }
  const hasDoc = !!(code || gist);

  doc = parseNbMd(source);
  // a bare URL (authoring a new doc) opens in the editor; a shared doc opens as
  // the App unless ?edit is present.
  editing = wantEdit || !hasDoc;
  setStage(); updateURL();
  await syncEditors();
  runAll();
}
await boot();
window.__numerical = { get source() { return currentSource(); }, setEditing };
