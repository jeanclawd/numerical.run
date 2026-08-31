// .nb.md -> .ipynb (Jupyter v4), tagged with the RunMat kernelspec so Jupyter
// runs the code cells on RunMat. Reuses the web app's parseNbMd for one source
// of truth. Usage: node nbmd2ipynb.mjs <in.nb.md> <out.ipynb>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const { parseNbMd } = await import(pathToFileURL(join(dirname(new URL(import.meta.url).pathname), '..', 'host', 'nbmd.js')));

// Jupyter stores source as a list of lines each ending in \n (except the last).
function toSource(text) {
  const lines = String(text).split('\n');
  return lines.map((l, i) => (i < lines.length - 1 ? l + '\n' : l)).filter((_, i, a) => !(i === a.length - 1 && a[i] === ''));
}

export function nbmdToIpynb(text) {
  const doc = parseNbMd(text);
  const cells = doc.cells.map((c, i) => c.kind === 'code'
    ? { id: `c${i + 1}`, cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: toSource(c.source) }
    : { id: `c${i + 1}`, cell_type: 'markdown', metadata: {}, source: toSource(c.source) });
  return {
    cells,
    metadata: {
      kernelspec: { name: 'runmat', display_name: 'RunMat', language: 'matlab' },
      language_info: { name: 'matlab', file_extension: '.m', mimetype: 'text/x-matlab' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inp, outp] = process.argv.slice(2);
  if (!inp || !outp) { console.error('usage: node nbmd2ipynb.mjs <in.nb.md> <out.ipynb>'); process.exit(1); }
  writeFileSync(resolve(outp), JSON.stringify(nbmdToIpynb(readFileSync(resolve(inp), 'utf8')), null, 1) + '\n');
  console.log('wrote', outp);
}
