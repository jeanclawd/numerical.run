/* numerical.run kernel — one RunMat WASM session, Streamlit-style whole-document
 * rerun, with per-cell output attribution.
 *
 * This is the shared runtime behind BOTH modes. Every rerun resets the session
 * and executes the whole document top-to-bottom in a single executeRequest —
 * exactly Streamlit's model (adapted from streamlab's engine). The one addition
 * over streamlab is a cell-boundary marker emitted between code cells, so the
 * flat marker stream can be split back into per-cell output lists — which the
 * notebook view needs and the app view ignores.
 *
 * Reused verbatim from streamlab: the RunMat WASM runtime, figrender, the
 * widget renderer (render.js), the sl_* widget library (lib.m), the %%SL%%
 * marker protocol, and the sl_state_() state-baking trick.
 */

const MARKER = '%%SL%%';
const CELL = '__cell__';

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
    return `function st = sl_state_()\n    st = jsondecode('${json}');\nend\n`;
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

  async function attachFigures(elements, handles) {
    const slots = elements.filter((e) => e.type === 'figure');
    for (let i = 0; i < slots.length; i++) {
      const handle = handles[i];
      if (handle === undefined) continue;
      try {
        const bytes = await session.exportFigureScene(handle);
        if (bytes?.length) {
          slots[i].svg = renderFigureScene(
            JSON.parse(new TextDecoder().decode(bytes)), { width: 700, height: 420 });
        }
      } catch { /* leave the slot empty */ }
    }
  }

  // ---------------------------------------------------------------- run loop
  let running = false;
  let queued = null;         // latest {cells, onDone} awaiting a free loop

  // Assemble every code cell into one script, with a boundary marker before each
  // so the flat output stream can be re-split per cell. Library + baked state go
  // last, per the RunMat script-with-functions rule.
  function assemble(cells) {
    const parts = [];
    cells.forEach((cell, i) => {
      if (cell.kind !== 'code') return;
      parts.push(`fprintf('%%%%SL%%%%{"type":"${CELL}","i":${i}}\\n');`);
      parts.push(cell.source);
    });
    return `${parts.join('\n')}\n\n${library}\n${stateFunction()}`;
  }

  // Split the flat, figure-attached element stream into { i -> elements[] } by
  // the cell-boundary markers.
  function splitByCell(elements) {
    const byCell = new Map();
    let cur = null;
    for (const e of elements) {
      if (e.type === CELL) { cur = e.i; byCell.set(cur, []); continue; }
      if (cur === null) continue;             // stray output before any cell
      byCell.get(cur).push(e);
    }
    return byCell;
  }

  // Run the whole document. Returns { byCell: Map<i, elements>, flat, error }.
  async function _run(cells) {
    await session.resetSession();
    streamBuf = ''; streaming = true;
    let result;
    try {
      result = await session.executeRequest({
        source: { kind: 'text', name: '<numerical>', text: assemble(cells) }
      });
    } catch (err) {
      streaming = false;
      return { byCell: new Map(), flat: [], error: String(err?.message ?? err) };
    }
    streaming = false;

    const flat = applyStateSets(parseStream(streamBuf));
    let error = null;
    if (result.error) {
      error = `${result.error.identifier ?? 'error'}: ${result.error.message}` +
              (result.error.span?.line ? ` (line ${result.error.span.line})` : '');
    }
    await attachFigures(flat, result.figuresTouched ?? []);

    const byCell = splitByCell(flat);
    if (error) {
      // an error aborts execution — attribute it to the last cell that started,
      // or expose it document-wide if nothing had started yet
      const last = flat.filter((e) => e.type === CELL).map((e) => e.i).pop();
      if (last != null) byCell.get(last).push({ type: 'error', text: error });
    }
    // document-order elements for the app view (cell markers stripped)
    const appElements = flat.filter((e) => e.type !== CELL);
    if (error) appElements.push({ type: 'error', text: error });
    return { byCell, appElements, error };
  }

  // Public rerun: coalesces bursts (a slider drag) to one in-flight run.
  async function rerun(cells, onResult) {
    if (running) { queued = { cells, onResult }; return; }
    running = true;
    try {
      const out = await _run(cells);
      onResult?.(out);
    } finally {
      running = false;
      if (queued) { const q = queued; queued = null; void rerun(q.cells, q.onResult); }
    }
  }

  // Widget interaction: update state and rerun the whole document.
  function makeSetState(getCells, onResult) {
    return (label, value, { once = false } = {}) => {
      state.set(label, value);
      if (once) oneShot.add(label);
      void rerun(getCells(), (out) => {
        for (const label of oneShot) state.delete(label);
        oneShot.clear();
        onResult?.(out);
      });
    };
  }

  return { state, rerun, makeSetState, renderElements };
}
