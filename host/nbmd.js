/* .nb.md — the numerical.run serialization format.
 *
 * A Markdown-based Jupyter notebook following JEP #103. A document is an ordered
 * list of cells:
 *   - markdown cells  — narrative prose, separated by a `+++` thematic break
 *   - code cells      — fenced blocks tagged `{jupyter.code-cell}`, whose
 *                       leading `:key: value` lines carry cell metadata
 *                       (numerical.run puts widget/layout data in `:widget:`)
 *
 *     ```matlab {jupyter.code-cell}
 *     :widget: {kind: nr_slider, bind: f, x: 120, y: 40, w: 220}
 *
 *     f = nr_slider('frequency', 1, 8, 2, 0.5);
 *     ```
 *
 * Delete the metadata and it's still a plain Markdown Jupyter notebook that any
 * JEP-103-aware tool can read; the code still runs.
 */

const FENCE = /^```+\s*(\w+)?\s*\{jupyter\.code-cell\}/;
const META = /^:([A-Za-z_][\w-]*):\s*(.*)$/;

let _id = 0;
const nextId = () => `c${++_id}`;

// Lenient object parser for MyST-shorthand values like
// `{kind: nr_slider, x: 120}` — unquoted keys and values, numbers coerced.
export function parseLooseObject(s) {
  const out = {};
  const body = String(s).trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!body.trim()) return out;
  for (const pair of body.split(',')) {
    const i = pair.indexOf(':');
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    let v = pair.slice(i + 1).trim();
    if (v !== '' && !Number.isNaN(Number(v))) v = Number(v);
    if (k) out[k] = v;
  }
  return out;
}

function stringifyLooseObject(o) {
  return '{' + Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ') + '}';
}

export function parseNbMd(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let frontmatter = null;

  // optional YAML frontmatter
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) { frontmatter = lines.slice(1, end).join('\n'); i = end + 1; }
  }

  const cells = [];
  let md = [];
  const flushMd = () => {
    const src = md.join('\n').trim();
    if (src) cells.push({ id: nextId(), kind: 'markdown', source: src, meta: {} });
    md = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      flushMd();
      const lang = fence[1] || 'matlab';
      i++;
      const meta = {};
      // leading :key: value metadata lines
      while (i < lines.length) {
        const m = lines[i].match(META);
        if (!m) break;
        meta[m[1]] = m[1] === 'widget' ? parseLooseObject(m[2]) : m[2].trim();
        i++;
      }
      if (lines[i] !== undefined && lines[i].trim() === '') i++;  // blank after meta
      const body = [];
      while (i < lines.length && !/^```+\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;  // closing fence
      cells.push({ id: nextId(), kind: 'code', lang, source: body.join('\n').replace(/\s+$/, ''), meta });
      continue;
    }
    if (line.trim() === '+++') { flushMd(); i++; continue; }
    md.push(line);
    i++;
  }
  flushMd();
  return { frontmatter, cells };
}

export function serializeNbMd({ frontmatter = null, cells = [] }) {
  const out = [];
  if (frontmatter && frontmatter.trim()) out.push('---', frontmatter.trim(), '---', '');
  let prevKind = null;
  for (const cell of cells) {
    if (prevKind === 'markdown' && cell.kind === 'markdown') out.push('+++', '');
    else if (prevKind) out.push('');
    if (cell.kind === 'code') {
      out.push('```' + (cell.lang || 'matlab') + ' {jupyter.code-cell}');
      for (const [k, v] of Object.entries(cell.meta || {})) {
        out.push(`:${k}: ${k === 'widget' && typeof v === 'object' ? stringifyLooseObject(v) : v}`);
      }
      if (Object.keys(cell.meta || {}).length) out.push('');
      out.push(cell.source);
      out.push('```');
    } else {
      out.push(cell.source);
    }
    prevKind = cell.kind;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export const newCell = (kind, source = '') =>
  ({ id: nextId(), kind, lang: kind === 'code' ? 'matlab' : undefined, source, meta: {} });
