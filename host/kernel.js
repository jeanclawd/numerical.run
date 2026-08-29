/* numerical.run kernel — one RunMat WASM session, driven two ways:
 *
 *   Notebook mode : STATEFUL per-cell execution (Jupyter-style). Cells run
 *                   against a persistent workspace; running one cell does NOT
 *                   reset the session, so variables carry across cells and a
 *                   cell sees whatever earlier cells left behind. Running a
 *                   single cell reruns only that cell.
 *
 *   App mode      : WHOLE-DOCUMENT rerun (Streamlit-style). Every interaction
 *                   resets the session and runs every cell top-to-bottom, so
 *                   the page always reflects a clean run of the whole document.
 *
 * Both share the same session, the same nr_* widget library and %%NR%% marker
 * protocol, the same figure pipeline, and the same widget state store.
 *
 * The one hard RunMat 0.6.1 constraint shaping this: script-local functions are
 * redefined wholesale per executeRequest and don't persist across calls, so the
 * nr_* library (and the baked nr_state_) is appended to EVERY execution — a
 * single cell or the whole document. Workspace VARIABLES do persist across
 * executeRequest, which is exactly what makes stateful cell execution work.
 *
 * Components: the RunMat WASM runtime, figrender, the widget renderer
 * (render.js), the nr_* widget library (lib.m), and the %%NR%% marker protocol.
 */

const MARKER = '%%NR%%';

export async function createKernel({ statusEl = null, runtimeUrl, figrenderUrl, renderUrl, library }) {
  const status = (t) => { if (statusEl) statusEl.textContent = t; };

  status('loading runtime…');
  const base = runtimeUrl.replace(/\/$/, '');
  const { renderFigureScene } = await import(/* @vite-ignore */ figrenderUrl);
  const { renderElements } = await import(/* @vite-ignore */ renderUrl ?? new URL('./render.js', import.meta.url).href);
  const web = await import(/* @vite-ignore */ `${base}/runmat_wasm_web.js`);
  await web.default({ module_or_path: `${base}/runmat_wasm_web_bg.wasm` });
  const session = await web.initRunMat({
    enableGpu: false, enableJit: false, telemetryConsent: false,
    logLevel: 'error', languageCompat: 'matlab'
  });
  let streamBuf = '';
  let streaming = false;
  try {
    await web.subscribeStdout((e) => { if (streaming) streamBuf += e.text ?? ''; });
  } catch { /* markers still arrive via result.stdout on some builds */ }
  status('runtime ready');

  // ---------------------------------------------------------------- state
  const state = new Map();      // widget label -> value
  const oneShot = new Set();    // button labels cleared after their run

  function stateFunction() {
    // Trailing numeric sentinel forces jsondecode into CELL arrays (RunMat
    // 0.6.1 collapses homogeneous/1-element JSON arrays into scalars).
    const keys = [...state.keys(), 0];
    const values = [...state.keys()].map((k) => state.get(k)).concat(0);
    const json = JSON.stringify({ keys, values }).replace(/'/g, "''");
    return `function st = nr_state_()\n    st = jsondecode('${json}');\nend\n`;
  }

  function parseStream(text) {
    const elements = [];
    let raw = [];
    const flushRaw = () => {
      const chunk = raw.join('\n').trim();
      if (chunk) elements.push({ type: 'raw', text: chunk });
      raw = [];
    };
    for (const line of text.split('\n')) {
      if (line.startsWith(MARKER)) {
        flushRaw();
        try { elements.push(JSON.parse(line.slice(MARKER.length))); }
        catch { raw.push(line); }
      } else {
        raw.push(line);
      }
    }
    flushRaw();
    return elements;
  }

  function applyStateSets(elements) {
    const rest = [];
    for (const e of elements) {
      if (e.type === 'set_state') state.set(e.key, e.value);
      else rest.push(e);
    }
    return rest;
  }

  // The page follows the OS/browser color scheme (see style.css).
  const pageTheme = () => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';

  async function attachFigures(elements, handles) {
    const slots = elements.filter((e) => e.type === 'figure');
    for (let i = 0; i < slots.length; i++) {
      const handle = handles[i];
      if (handle === undefined) continue;
      try {
        const bytes = await session.exportFigureScene(handle);
        if (bytes?.length) {
          // cache the raw scene (as a string) so figures can be re-themed on a
          // color-scheme change without re-running the kernel — parse fresh each
          // time since figrender recolors the scene object in place.
          slots[i].sceneJson = new TextDecoder().decode(bytes);
          slots[i].svg = renderFigureScene(JSON.parse(slots[i].sceneJson), { width: 700, height: 420, theme: pageTheme() });
        }
      } catch { /* leave the slot empty */ }
    }
  }

  const fmtErr = (e) =>
    `${e.identifier ?? 'error'}: ${e.message}` + (e.span?.line ? ` (line ${e.span.line})` : '');

  // ------------------------------------------------------ single-flight lock
  // The wasm session is single-threaded: executeRequest calls must not overlap.
  // A promise chain serializes every run; widget events fire on 'change', so
  // this is enough without extra coalescing.
  let chain = Promise.resolve();
  const serialize = (fn) => (chain = chain.then(fn, fn));

  // ------------------------------------------------------ execution
  // Run one code cell against the CURRENT workspace (no reset). Returns its
  // output elements. nr_* library + baked state are appended per RunMat's rule.
  async function _execCell(cell) {
    if (cell.kind !== 'code') return [];
    streamBuf = ''; streaming = true;
    let result;
    try {
      result = await session.executeRequest({
        source: { kind: 'text', name: '<cell>', text: `${cell.source}\n\n${library}\n${stateFunction()}` }
      });
    } catch (err) {
      streaming = false;
      return [{ type: 'error', text: String(err?.message ?? err) }];
    }
    streaming = false;
    const els = applyStateSets(parseStream(streamBuf));
    if (result.error) els.push({ type: 'error', text: fmtErr(result.error) });
    await attachFigures(els, result.figuresTouched ?? []);
    return els;
  }

  function clearOneShot() { for (const l of oneShot) state.delete(l); oneShot.clear(); }

  // ------------------------------------------------------ public API

  // Stateful single-cell run (notebook mode): no reset, persistent workspace.
  function runCell(cell) {
    return serialize(async () => { const els = await _execCell(cell); clearOneShot(); return els; });
  }

  // Reset the workspace (notebook "restart", and the start of every app rerun).
  function reset() { return serialize(() => session.resetSession()); }

  // Whole-document run: reset, then execute every code cell top-to-bottom
  // (stateful between cells). Returns Map<cellIndex, elements>. Used by app mode
  // on every interaction, and by notebook "Run all".
  function runAll(cells) {
    return serialize(async () => {
      await session.resetSession();
      const byCell = new Map();
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].kind === 'code') byCell.set(i, await _execCell(cells[i]));
      }
      clearOneShot();
      return byCell;
    });
  }

  // Record a widget interaction before triggering a run (once=button semantics).
  const markWidget = (label, value, once = false) => { state.set(label, value); if (once) oneShot.add(label); };

  // Re-render every cached figure in a byCell map for the current theme, without
  // touching the session. Parses each cached scene fresh (figrender mutates it).
  function reRenderFigures(byCell, theme = pageTheme()) {
    for (const els of byCell.values()) {
      for (const e of els) {
        if (e.type === 'figure' && e.sceneJson) {
          try { e.svg = renderFigureScene(JSON.parse(e.sceneJson), { width: 700, height: 420, theme }); } catch { /* keep old svg */ }
        }
      }
    }
  }

  return { state, markWidget, runCell, runAll, reset, renderElements, reRenderFigures, pageTheme };
}
