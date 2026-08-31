/* .nb.md parse/serialize — ported from the web app (host/nbmd.js) so the VS Code
 * extension round-trips the exact same format. Kept free of any VS Code types so
 * it can be unit-tested under plain node. */

export type NbKind = 'markdown' | 'code';
export interface NbCell {
  kind: NbKind;
  lang?: string;
  source: string;
  meta: Record<string, unknown>;
}
export interface NbDoc {
  frontmatter: string | null;
  cells: NbCell[];
}

const FENCE = /^```+\s*(\w+)?\s*\{jupyter\.code-cell\}/;
const META = /^:([A-Za-z_][\w-]*):\s*(.*)$/;

// Lenient object parser for MyST-shorthand values like `{kind: nr_slider, x: 120}`.
export function parseLooseObject(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const body = String(s).trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!body.trim()) return out;
  for (const pair of body.split(',')) {
    const i = pair.indexOf(':');
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    let v: unknown = pair.slice(i + 1).trim();
    if (v !== '' && !Number.isNaN(Number(v))) v = Number(v);
    if (k) out[k] = v;
  }
  return out;
}

function stringifyLooseObject(o: Record<string, unknown>): string {
  return '{' + Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ') + '}';
}

export function parseNbMd(text: string): NbDoc {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let frontmatter: string | null = null;

  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) { frontmatter = lines.slice(1, end).join('\n'); i = end + 1; }
  }

  const cells: NbCell[] = [];
  let md: string[] = [];
  const flushMd = () => {
    const src = md.join('\n').trim();
    if (src) cells.push({ kind: 'markdown', source: src, meta: {} });
    md = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      flushMd();
      const lang = fence[1] || 'matlab';
      i++;
      const meta: Record<string, unknown> = {};
      while (i < lines.length) {
        const m = lines[i].match(META);
        if (!m) break;
        meta[m[1]] = m[1] === 'widget' ? parseLooseObject(m[2]) : m[2].trim();
        i++;
      }
      if (lines[i] !== undefined && lines[i].trim() === '') i++;
      const body: string[] = [];
      while (i < lines.length && !/^```+\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      cells.push({ kind: 'code', lang, source: body.join('\n').replace(/\s+$/, ''), meta });
      continue;
    }
    if (line.trim() === '+++') { flushMd(); i++; continue; }
    md.push(line);
    i++;
  }
  flushMd();
  return { frontmatter, cells };
}

export function serializeNbMd({ frontmatter = null, cells = [] }: NbDoc): string {
  const out: string[] = [];
  if (frontmatter && frontmatter.trim()) out.push('---', frontmatter.trim(), '---', '');
  let prevKind: NbKind | null = null;
  for (const cell of cells) {
    if (prevKind === 'markdown' && cell.kind === 'markdown') out.push('+++', '');
    else if (prevKind) out.push('');
    if (cell.kind === 'code') {
      out.push('```' + (cell.lang || 'matlab') + ' {jupyter.code-cell}');
      for (const [k, v] of Object.entries(cell.meta || {})) {
        out.push(`:${k}: ${k === 'widget' && typeof v === 'object' ? stringifyLooseObject(v as Record<string, unknown>) : v}`);
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
