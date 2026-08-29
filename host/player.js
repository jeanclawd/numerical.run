/* numerical.run /app — a headless app runner.
 *
 * No editor: it loads a .nb.md document from the URL and renders it in App mode
 * (Streamlit-style whole-document rerun) on the shared RunMat WASM kernel. The
 * document arrives one of two ways:
 *
 *   /app#code=<base64 of the .nb.md>     — the app rides inside the link
 *   /app?code=<base64>                   — same, in the query string
 *   /app?gist=<id>                       — a GitHub gist id (first .nb.md/.md/.m file)
 *   /app?gist=<raw-url>                   — a raw gist/github URL fetched directly
 *
 * The "edit ↗" link opens the same document back in /dev.
 */

const NUM = '/numerical';
const V = document.body.dataset.v || '';
const q = (s) => document.querySelector(s);
const status = (t) => { q('#status').textContent = t; };

const b64encode = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

// Resolve the document source from the URL.
async function loadSource() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  const code = hash.get('code') || params.get('code');
  if (code) return b64decode(code);

  const gist = hash.get('gist') || params.get('gist');
  if (gist) return await fetchGist(gist);

  throw new Error('no code — pass #code=<base64> or ?gist=<id|url>');
}

async function fetchGist(ref) {
  // A raw URL: fetch it directly.
  if (/^https?:\/\//.test(ref)) {
    const r = await fetch(ref);
    if (!r.ok) throw new Error(`gist url HTTP ${r.status}`);
    return await r.text();
  }
  // Otherwise treat it as a gist id (accept "id" or "user/id").
  const id = ref.split('/').pop();
  const r = await fetch(`https://api.github.com/gists/${id}`);
  if (!r.ok) throw new Error(`gist API HTTP ${r.status}`);
  const files = Object.values((await r.json()).files || {});
  if (!files.length) throw new Error('gist has no files');
  const pick = files.find((f) => /\.nb\.md$/.test(f.filename))
            || files.find((f) => /\.md$/.test(f.filename))
            || files.find((f) => /\.m$/.test(f.filename))
            || files[0];
  // Large gists are truncated in the API response — fall back to raw_url.
  if (pick.truncated && pick.raw_url) return await (await fetch(pick.raw_url)).text();
  return pick.content;
}

(async () => {
  let source;
  try { source = await loadSource(); }
  catch (e) { q('#app').innerHTML = `<div class="boot-note">Could not load app: ${e.message}</div>`; status('no app'); return; }

  q('#edit-link').href = `${location.origin}/dev#code=${b64encode(source)}`;

  const [{ createKernel }, nbmd, md] = await Promise.all([
    import(`${NUM}/kernel.js?v=${V}`),
    import(`${NUM}/nbmd.js?v=${V}`),
    import(`${NUM}/md.js?v=${V}`),
  ]);
  const kernel = await createKernel({
    statusEl: q('#status'),
    runtimeUrl: `${NUM}/runtime`,
    figrenderUrl: `${NUM}/runtime/figrender.mjs?v=${V}`,
    renderUrl: `${NUM}/render.js?v=${V}`,
    library: await (await fetch(`${NUM}/lib.m?v=${V}`)).text(),
  });

  const doc = nbmd.parseNbMd(source);
  let lastByCell = new Map();

  const setState = (label, value, opts = {}) => {
    kernel.markWidget(label, value, opts.once);
    kernel.runAll(doc.cells).then((byCell) => { lastByCell = byCell; render(); });
  };
  function render() {
    const elements = [];
    doc.cells.forEach((cell, i) => {
      if (cell.kind === 'markdown') elements.push({ type: 'text', html: md.mdToHtml(cell.source) });
      else elements.push(...(lastByCell.get(i) ?? []));
    });
    kernel.renderElements(q('#app'), elements, setState);
  }

  status('running…');
  const t0 = performance.now();
  lastByCell = await kernel.runAll(doc.cells);
  status(`ran in ${Math.round(performance.now() - t0)} ms`);
  render();
})();
