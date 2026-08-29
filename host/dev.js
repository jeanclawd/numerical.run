/* numerical.run /dev — a Monaco-based dev environment with live rendering.
 *
 * Inspired by the zoetrope playground: Monaco on the left, a live preview on the
 * right, responsive (side-by-side → stacked on narrow screens). Unlike zoetrope
 * (which posts code to a backend), everything here runs client-side on the same
 * RunMat WASM kernel the app uses — the editor holds a .nb.md document, Run
 * parses it and renders both preview modes (App = whole-document rerun,
 * Notebook = stateful cells).
 *
 * Assets are shared with the deployed app under /numerical/ (kernel, runtime,
 * widget library, renderer, Monaco), so nothing is duplicated.
 */

const NUM = '/numerical';
const V = document.body.dataset.v || '';
const q = (s) => document.querySelector(s);

const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

const EXAMPLES = ['waves.nb.md', 'knn.nb.md', 'hello.nb.md'];
const STARTER = `# New notebook

Edit on the left, hit **Run** (⌘/Ctrl+Enter). Switch the preview between App and
Notebook. "Open as app" gives you an /app link that carries this document.

\`\`\`matlab {jupyter.code-cell}
n = sl_slider('points', 20, 400, 120, 10);
x = linspace(0, 2*pi, n);
figure; plot(x, sin(x)); sl_figure();
sl_metric('n', n, '%d');
\`\`\`
`;

const status = (t) => { q('#dev-status').textContent = t; };

// ---- Monaco loader (vendored under /numerical/monaco) ----
self.MonacoEnvironment = {
  getWorkerUrl() {
    const proxy = URL.createObjectURL(new Blob([`
      self.MonacoEnvironment = { baseUrl: '${location.origin}${NUM}/monaco/' };
      importScripts('${location.origin}${NUM}/monaco/vs/base/worker/workerMain.js');
    `], { type: 'text/javascript' }));
    return proxy;
  }
};
require.config({ paths: { vs: NUM + '/monaco/vs' } });

let editor, kernel, nbmd, mdmod, doc = { frontmatter: null, cells: [] };
let lastByCell = new Map();
let pvMode = 'app';

require(['vs/editor/editor.main'], async () => {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  editor = monaco.editor.create(q('#editor'), {
    value: STARTER, language: 'markdown', theme: dark ? 'vs-dark' : 'vs',
    fontSize: 13, minimap: { enabled: false }, automaticLayout: true,
    scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 4,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

  // dynamic imports (ES modules) for the kernel + format helpers
  const kmod = await import(`${NUM}/kernel.js?v=${V}`);
  nbmd = await import(`${NUM}/nbmd.js?v=${V}`);
  mdmod = await import(`${NUM}/md.js?v=${V}`);
  kernel = await kmod.createKernel({
    statusEl: q('#dev-status'),
    runtimeUrl: `${NUM}/runtime`,
    figrenderUrl: `${NUM}/runtime/figrender.mjs?v=${V}`,
    renderUrl: `${NUM}/render.js?v=${V}`,
    library: await (await fetch(`${NUM}/lib.m?v=${V}`)).text(),
  });

  wireShell();
  await boot();
});

// ---- run + preview ----
function run() {
  doc = nbmd.parseNbMd(editor.getValue());
  status('running…');
  const t0 = performance.now();
  kernel.runAll(doc.cells).then((byCell) => {
    lastByCell = byCell;
    q('#dev-time').textContent = `${Math.round(performance.now() - t0)} ms`;
    status('ran');
    renderPreview();
  });
}

function appSetState(label, value, opts = {}) {
  kernel.markWidget(label, value, opts.once);
  kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; renderPreview(); });
}
function cellSetState(cell) {
  return (label, value, opts = {}) => {
    kernel.markWidget(label, value, opts.once);
    kernel.runCell(cell).then((els) => { lastByCell.set(doc.cells.indexOf(cell), els); renderPreview(); });
  };
}

function renderPreview() { pvMode === 'app' ? renderApp() : renderNb(); }

function renderApp() {
  const elements = [];
  doc.cells.forEach((cell, i) => {
    if (cell.kind === 'markdown') elements.push({ type: 'text', html: mdmod.mdToHtml(cell.source) });
    else elements.push(...(lastByCell.get(i) ?? []));
  });
  kernel.renderElements(q('#pv-app'), elements, appSetState);
}

function renderNb() {
  const root = q('#pv-nb');
  root.innerHTML = '';
  doc.cells.forEach((cell, i) => {
    if (cell.kind === 'markdown') {
      const d = document.createElement('div'); d.className = 'pv-cell md';
      d.innerHTML = mdmod.mdToHtml(cell.source); root.appendChild(d);
      return;
    }
    const box = document.createElement('div'); box.className = 'pv-cell pv-code';
    const pre = document.createElement('pre'); pre.textContent = cell.source; box.appendChild(pre);
    const out = document.createElement('div'); out.className = 'pv-out';
    const els = lastByCell.get(i) ?? [];
    if (els.length) kernel.renderElements(out, els, cellSetState(cell));
    box.appendChild(out); root.appendChild(box);
  });
}

// ---- shell wiring ----
function wireShell() {
  const sel = q('#dev-example');
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'starter'; sel.appendChild(blank);
  for (const e of EXAMPLES) { const o = document.createElement('option'); o.value = e; o.textContent = e.replace('.nb.md', ''); sel.appendChild(o); }
  sel.addEventListener('change', async () => {
    if (!sel.value) { editor.setValue(STARTER); return run(); }
    editor.setValue(await (await fetch(`${NUM}/examples/${sel.value}?v=${V}`)).text()); run();
  });

  q('#pv-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    pvMode = b.dataset.view;
    q('#pv-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    q('#pv-app').classList.toggle('on', pvMode === 'app');
    q('#pv-nb').classList.toggle('on', pvMode === 'nb');
    renderPreview();
  }));

  q('#dev-run').addEventListener('click', run);
  const appLink = () => `${location.origin}/app#code=${b64encode(editor.getValue())}`;
  q('#dev-openapp').addEventListener('click', () => window.open(appLink(), '_blank', 'noopener'));
  q('#dev-share').addEventListener('click', async () => {
    const url = appLink();
    try { await navigator.clipboard.writeText(url); status(`app link copied (${url.length} chars)`); }
    catch { prompt('app link:', url); }
  });
}

async function boot() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  try {
    if (hash.get('code')) editor.setValue(b64decode(hash.get('code')));
    else if (params.get('code')) editor.setValue(b64decode(params.get('code')));
    else if (params.get('example')) editor.setValue(await (await fetch(`${NUM}/examples/${params.get('example')}?v=${V}`)).text());
  } catch (e) { status(`bad code param: ${e.message}`); }
  run();
}
