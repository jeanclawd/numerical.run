/* Foreign-format import — ported from the web app (host/importers.js) so the
 * extension and site convert identically. toNbMd(text, name) -> .nb.md text. */

import { serializeNbMd, parseLooseObject, NbCell } from './nbmd';

const ext = (name: string) => (String(name).split(/[?#]/)[0].match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
const fenceLang = (info: string) => {
  const m = String(info).trim().replace(/^\{|\}$/g, '').match(/^[a-z0-9_+-]+/i);
  const l = (m ? m[0] : '').toLowerCase();
  return /^(matlab|octave|m)$/.test(l) ? 'matlab' : l;
};
const ser = (cells: NbCell[], frontmatter: string | null = null) => serializeNbMd({ frontmatter, cells });
const md = (source: string): NbCell => ({ kind: 'markdown', source: String(source).replace(/\s+$/, ''), meta: {} });
const code = (source: string, lang = 'matlab'): NbCell => ({ kind: 'code', lang: lang || 'matlab', source: String(source).replace(/\s+$/, ''), meta: {} });

function ipynbToNbMd(text: string): string {
  const nb = JSON.parse(text);
  const lang = fenceLang(nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || 'matlab') || 'matlab';
  const cells: NbCell[] = [];
  for (const c of nb.cells || []) {
    const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
    if (!src.trim() && c.cell_type !== 'markdown') continue;
    if (c.cell_type === 'markdown') cells.push(md(src));
    else if (c.cell_type === 'code') cells.push(code(src, lang));
  }
  return ser(cells);
}

function mdNotebookToNbMd(text: string): string {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0; let frontmatter: string | null = null;
  if (lines[0] === '---') { const e = lines.indexOf('---', 1); if (e > 0) { frontmatter = lines.slice(1, e).join('\n'); i = e + 1; } }
  const cells: NbCell[] = [];
  let prose: string[] = [];
  const flushProse = () => { const s = prose.join('\n').trim(); if (s) cells.push(md(s)); prose = []; };
  const FENCE = /^(`{3,}|~{3,})(.*)$/;
  while (i < lines.length) {
    const m = lines[i].match(FENCE);
    if (m) {
      flushProse();
      const close = new RegExp('^' + m[1][0] + '{' + m[1].length + ',}\\s*$');
      const lang = fenceLang(m[2]);
      i++;
      const body: string[] = [];
      while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      cells.push(code(body.join('\n'), lang));
    } else { prose.push(lines[i]); i++; }
  }
  flushProse();
  return ser(cells, frontmatter);
}

function mlInline(s: string): string {
  return String(s)
    .replace(/<<([^>]+)>>/g, (_, f) => `![](${f.trim()})`)
    .replace(/<((?:https?|ftp|file|mailto):[^>\s]+)(?:\s+([^>]+))?>/gi, (_, url, label) => `[${(label || url).trim()}](${url})`)
    .replace(/<matlab:[^>\s]+(?:\s+([^>]+))?>/gi, (_, label) => label ? label.trim() : '')
    .replace(/(^|[\s([{])\|(\S(?:[^|]*\S)?)\|(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}\`${t}\``)
    .replace(/(^|[\s([{])\*(\S(?:[^*]*\S)?)\*(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}**${t}**`)
    .replace(/(^|[\s([{])_(\S(?:[^_]*\S)?)_(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}*${t}*`)
    .replace(/\(TM\)/g, '™').replace(/\(R\)/g, '®').replace(/\(C\)/g, '©');
}

function mlCommentBlockToMd(rawLines: string[]): string {
  const out: string[] = [];
  let pre: string[] | null = null;
  const flushPre = () => { if (pre) { out.push('```', ...pre, '```'); pre = null; } };
  for (const raw of rawLines) {
    const body = raw.replace(/^%/, '');
    const lead = (body.match(/^ +/) || [''])[0].length;
    const trimmed = body.trimStart();
    if (trimmed === '') { flushPre(); out.push(''); continue; }
    if (/^<\/?(html|latex)>$/i.test(trimmed)) { continue; }
    if (lead >= 2) { (pre ??= []).push(body.slice(2)); continue; }
    flushPre();
    let m;
    if ((m = trimmed.match(/^\*\s+(.*)$/))) { out.push('- ' + mlInline(m[1])); continue; }
    if ((m = trimmed.match(/^#\s+(.*)$/))) { out.push('1. ' + mlInline(m[1])); continue; }
    out.push(mlInline(trimmed));
  }
  flushPre();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function liveScriptToNbMd(text: string): string {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => /^%%/.test(l))) return ser([code(text.replace(/\s+$/, ''))]);
  const cells: NbCell[] = [];
  let i = 0;
  while (i < lines.length) {
    let title: string | null = null, subhead = false;
    const t = lines[i].match(/^%%(%)?[ \t]?(.*)$/);
    if (t) { subhead = !!t[1]; title = t[2].trim(); i++; }
    const comments: string[] = [];
    while (i < lines.length && /^[ \t]*%(?!%)/.test(lines[i])) { comments.push(lines[i].replace(/^[ \t]*/, '')); i++; }
    const codeLines: string[] = [];
    while (i < lines.length && !/^%%/.test(lines[i])) { codeLines.push(lines[i]); i++; }
    const parts: string[] = [];
    if (title) parts.push((subhead ? '### ' : cells.length === 0 ? '# ' : '## ') + mlInline(title));
    const block = mlCommentBlockToMd(comments);
    if (block) parts.push(block);
    const mdText = parts.join('\n\n').trim();
    if (mdText) cells.push(md(mdText));
    const codeText = codeLines.join('\n').replace(/\s+$/, '');
    if (codeText.trim()) cells.push(code(codeText));
  }
  return ser(cells);
}

export function toNbMd(text: string, name = ''): string {
  const e = ext(name);
  const head = text.slice(0, 4000);
  if (/\.nb\.md(?:[?#]|$)/i.test(name)) return text;
  if (/\{jupyter\.code-cell\}/.test(head)) return text;
  if (e === '.ipynb' || (/^\s*\{/.test(text) && /"cells"\s*:/.test(head))) return ipynbToNbMd(text);
  if (e === '.m') return liveScriptToNbMd(text);
  if (e === '.qmd' || e === '.rmd' || e === '.md' || /^(`{3,}|~{3,})/m.test(text)) return mdNotebookToNbMd(text);
  return text;
}
