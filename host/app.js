/* numerical.run — single-page app.
 *
 * One page, two states chosen by the URL:
 *   • VIEW  (default)  — the .nb.md rendered as an app (Streamlit-style),
 *                        code hidden, full width. Monaco is NOT loaded.
 *   • EDIT  (?edit)    — Monaco editor + live preview (App / Notebook tabs).
 *                        Monaco loads lazily the first time you enter edit.
 *
 * The document comes from the URL, else a built-in default:
 *   #code=<base64>  |  ?code=<base64>  |  ?gist=<id | raw-url>  |  (default)
 *
 * Toggling edit/view updates the URL in place (no reload). Assets are shared
 * with the deployed site; only the heavy wasm runtime + Monaco may live on a CDN
 * (window.NUMCFG, injected per environment).
 */

const V = document.body.dataset.v || String(Date.now());
const CFG = window.NUMCFG || {};
const RUNTIME = CFG.runtime || './runtime';
const FIGR = CFG.figrender || './runtime/figrender.mjs';
const MONACO = CFG.monaco || './monaco';           // dir containing vs/

const q = (s) => document.querySelector(s);
const status = (t) => { q('#status').textContent = t; const s2 = q('#status2'); if (s2) s2.textContent = t; };
const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

const EXAMPLES = ['waves.nb.md', 'knn.nb.md', 'hello.nb.md'];
const DEFAULT_DOC = `# numerical.run

A \`.nb.md\` notebook that runs entirely in your browser on the RunMat WASM
kernel. This is the **app** view — hit *✎ Edit* to open the notebook editor.

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
  statusEl: q('#status'),
  runtimeUrl: RUNTIME,
  figrenderUrl: `${FIGR}?v=${V}`,
  renderUrl: `./render.js?v=${V}`,
  library: await (await fetch(`./lib.m?v=${V}`)).text(),
});

// ---------------------------------------------------------------- state
let doc = { frontmatter: null, cells: [] };
let source = '';                 // current document text (source of truth)
let lastByCell = new Map();
let pvMode = 'app';              // preview tab in edit mode
let editing = false;
let editor = null, monacoReady = false;
const counters = {};

// ---------------------------------------------------------------- run + render
function runFrom(text) {
  source = text;
  doc = parseNbMd(text);
  status('running…');
  const t0 = performance.now();
  kernel.runAll(doc.cells).then((byCell) => {
    lastByCell = byCell;
    const el = q('#dev-time'); if (el) el.textContent = `${Math.round(performance.now() - t0)} ms`;
    status('ran');
    render();
  });
}
function rerunCurrent() { runFrom(editing && editor ? editor.getValue() : source); }

function appSetState(label, value, opts = {}) {
  kernel.markWidget(label, value, opts.once);
  kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; render(); });
}
function cellSetState(cell) {
  return (label, value, opts = {}) => {
    kernel.markWidget(label, value, opts.once);
    kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); render(); });
  };
}

function render() { (editing && pvMode === 'nb') ? renderNb() : renderApp(); }

function renderApp() {
  const elements = [];
  doc.cells.forEach((cell, i) => {
    if (cell.kind === 'markdown') elements.push({ type: 'text', html: mdToHtml(cell.source) });
    else elements.push(...(lastByCell.get(i) ?? []));
  });
  kernel.renderElements(q('#pv-app'), elements, appSetState);
}
function renderNb() {
  const root = q('#pv-nb');
  root.innerHTML = '';
  doc.cells.forEach((cell, i) => {
    if (cell.kind === 'markdown') {
      const d = document.createElement('div'); d.className = 'pv-cell md'; d.innerHTML = mdToHtml(cell.source); root.appendChild(d); return;
    }
    const box = document.createElement('div'); box.className = 'pv-cell pv-code';
    const pre = document.createElement('pre'); pre.textContent = cell.source; box.appendChild(pre);
    const out = document.createElement('div'); out.className = 'pv-out';
    const els = lastByCell.get(i) ?? [];
    if (els.length) kernel.renderElements(out, els, cellSetState(cell));
    box.appendChild(out); root.appendChild(box);
  });
}

// ---------------------------------------------------------------- Monaco (lazy)
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`load ${src}`)); document.head.appendChild(s); });
}
async function ensureMonaco() {
  if (monacoReady) return;
  // A blob worker has no page origin, so importScripts needs an ABSOLUTE URL —
  // make the Monaco base absolute for the worker (CDN URLs already are).
  const MON_ABS = /^https?:/.test(MONACO) ? MONACO : location.origin + MONACO;
  await loadScript(`${MON_ABS}/vs/loader.js`);
  self.MonacoEnvironment = {
    getWorkerUrl() {
      return URL.createObjectURL(new Blob([
        `self.MonacoEnvironment={baseUrl:'${MON_ABS}/'};importScripts('${MON_ABS}/vs/base/worker/workerMain.js');`
      ], { type: 'text/javascript' }));
    }
  };
  require.config({ paths: { vs: `${MON_ABS}/vs` } });
  await new Promise((res) => require(['vs/editor/editor.main'], res));
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  editor = monaco.editor.create(q('#editor'), {
    value: source, language: 'markdown', theme: dark ? 'vs-dark' : 'vs',
    fontSize: 13, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false,
    wordWrap: 'on', tabSize: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runFrom(editor.getValue()));
  monacoReady = true;
}

// ---------------------------------------------------------------- mode
function updateURL() {
  const params = new URLSearchParams(location.search);
  if (editing) params.set('edit', '1'); else params.delete('edit');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}
async function setEditing(on) {
  editing = on;
  document.body.classList.toggle('is-edit', on);
  q('#stage').className = on ? 'edit' : 'view';
  if (on) { await ensureMonaco(); editor.setValue(source); editor.layout(); }
  else if (editor) { source = editor.getValue(); }   // keep edits when leaving
  updateURL();
  render();
}

// ---------------------------------------------------------------- gist
async function fetchGist(ref) {
  if (/^https?:\/\//.test(ref)) { const r = await fetch(ref); if (!r.ok) throw new Error(`gist url HTTP ${r.status}`); return await r.text(); }
  const id = ref.split('/').pop();
  const r = await fetch(`https://api.github.com/gists/${id}`);
  if (!r.ok) throw new Error(`gist API HTTP ${r.status}`);
  const files = Object.values((await r.json()).files || {});
  if (!files.length) throw new Error('gist has no files');
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
  const { name, label } = uniq(w.kind);
  const snippet = w.snip(name, label);
  // append to the last code cell, or a new one, then reflect in the editor
  let d = parseNbMd(editing && editor ? editor.getValue() : source);
  let cell = [...d.cells].reverse().find((c) => c.kind === 'code');
  if (!cell) { cell = newCell('code', ''); d.cells.push(cell); }
  cell.source = cell.source.trim() ? `${cell.source.replace(/\s+$/, '')}\n${snippet}` : snippet;
  const text = serializeNbMd(d);
  if (editing && editor) editor.setValue(text);
  runFrom(text);
}
function buildPalette() {
  const grid = q('#palette-grid');
  for (const w of WIDGETS) { const b = document.createElement('button'); b.className = 'palette-item'; b.textContent = w.label; b.addEventListener('click', () => insertWidget(w)); grid.appendChild(b); }
}

// ---------------------------------------------------------------- shell wiring
function shareLink() { return `${location.origin}${location.pathname}#code=${b64encode(editing && editor ? editor.getValue() : source)}`; }

function wire() {
  const sel = q('#example');
  for (const e of EXAMPLES) { const o = document.createElement('option'); o.value = e; o.textContent = e.replace('.nb.md', ''); sel.appendChild(o); }
  sel.addEventListener('change', async () => {
    const text = await (await fetch(`./examples/${sel.value}?v=${V}`)).text();
    if (editing && editor) editor.setValue(text);
    runFrom(text);
  });
  q('#pv-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    pvMode = b.dataset.view;
    q('#pv-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    q('#pv-app').classList.toggle('on', pvMode === 'app');
    q('#pv-nb').classList.toggle('on', pvMode === 'nb');
    render();
  }));
  q('#run-btn').addEventListener('click', () => runFrom(editor ? editor.getValue() : source));
  q('#edit-btn').addEventListener('click', () => setEditing(true));
  q('#view-btn').addEventListener('click', () => setEditing(false));
  q('#widgets-btn').addEventListener('click', () => { const p = q('#palette'); p.hidden = !p.hidden; });
  q('#palette-close').addEventListener('click', () => { q('#palette').hidden = true; });
  q('#share-btn').addEventListener('click', async () => {
    const url = shareLink();
    try { await navigator.clipboard.writeText(url); status(`link copied (${url.length} chars)`); }
    catch { prompt('share link:', url); }
  });
  buildPalette();
}

// ---------------------------------------------------------------- boot
async function boot() {
  wire();
  const hash = new URLSearchParams(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  const wantEdit = hash.has('edit') || params.has('edit');
  try {
    const code = hash.get('code') || params.get('code');
    const gist = hash.get('gist') || params.get('gist');
    if (code) source = b64decode(code);
    else if (gist) source = await fetchGist(gist);
    else source = DEFAULT_DOC;
  } catch (e) { source = DEFAULT_DOC; status(`bad source: ${e.message}`); }

  runFrom(source);
  if (wantEdit) await setEditing(true);
}

await boot();
window.__numerical = { get source() { return editing && editor ? editor.getValue() : source; }, setEditing };
