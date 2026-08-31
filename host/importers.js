/* importers.js — convert popular notebook formats to .nb.md on load (issue #5).
 *
 *   toNbMd(text, name) -> .nb.md source text
 *
 * Handles: Jupyter .ipynb (JSON), MATLAB plain-text live script (.m, %%-sections),
 * and Markdown notebooks (.qmd / .Rmd / Jupytext-MyST .md with fenced code).
 * Anything already in .nb.md form (a fence tagged {jupyter.code-cell}) is returned
 * unchanged. Output flows through the normal parseNbMd path, so edit/share/run all
 * work. NOTE: only MATLAB/Octave code runs on the RunMat kernel — other languages
 * import as cells but won't execute.
 */

import { serializeNbMd } from './nbmd.js';

const ext = (name) => (String(name).split(/[?#]/)[0].match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
const fenceLang = (info) => {
  // "python" | "{python}" | "{r, echo=FALSE}" | "matlab" | "" → a bare language
  const m = String(info).trim().replace(/^\{|\}$/g, '').match(/^[a-z0-9_+-]+/i);
  const l = (m ? m[0] : '').toLowerCase();
  return /^(matlab|octave|m)$/.test(l) ? 'matlab' : l;
};
const ser = (cells, frontmatter = null) => serializeNbMd({ frontmatter, cells });
const md = (source) => ({ kind: 'markdown', source: String(source).replace(/\s+$/, ''), meta: {} });
const code = (source, lang = 'matlab') => ({ kind: 'code', lang: lang || 'matlab', source: String(source).replace(/\s+$/, ''), meta: {} });

// ---- Jupyter .ipynb -------------------------------------------------------
function ipynbToNbMd(text) {
  const nb = JSON.parse(text);
  const lang = fenceLang(nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || 'matlab') || 'matlab';
  const cells = [];
  for (const c of nb.cells || []) {
    const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
    if (!src.trim() && c.cell_type !== 'markdown') continue;
    if (c.cell_type === 'markdown') cells.push(md(src));
    else if (c.cell_type === 'code') cells.push(code(src, lang));
  }
  return ser(cells);
}

// ---- Markdown notebook (.qmd / .Rmd / Jupytext-MyST) ----------------------
function mdNotebookToNbMd(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0, frontmatter = null;
  if (lines[0] === '---') { const e = lines.indexOf('---', 1); if (e > 0) { frontmatter = lines.slice(1, e).join('\n'); i = e + 1; } }
  const cells = [];
  let prose = [];
  const flushProse = () => { const s = prose.join('\n').trim(); if (s) cells.push(md(s)); prose = []; };
  const FENCE = /^(`{3,}|~{3,})(.*)$/;
  while (i < lines.length) {
    const m = lines[i].match(FENCE);
    if (m) {
      flushProse();
      const close = new RegExp('^' + m[1][0] + '{' + m[1].length + ',}\\s*$');
      const lang = fenceLang(m[2]);
      i++;
      const body = [];
      while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // closing fence
      cells.push(code(body.join('\n'), lang));
    } else { prose.push(lines[i]); i++; }
  }
  flushProse();
  return ser(cells, frontmatter);
}

// ---- MATLAB plain-text live script (.m) -----------------------------------
// Section-per-cell: each %% starts a cell. The comment block immediately after a
// section break carries text markup (translated to Markdown); the code that
// follows is one code cell, verbatim (inline code comments preserved). A plain
// script with no %% sections is a single code cell.

// text markup inside a comment line -> Markdown (bold/italic/monospace, links,
// images, symbols). Runs on prose lines only, never on code.
function mlInline(s) {
  return String(s)
    .replace(/<<([^>]+)>>/g, (_, f) => `![](${f.trim()})`)                                   // <<image>>
    .replace(/<((?:https?|ftp|file|mailto):[^>\s]+)(?:\s+([^>]+))?>/gi,                        // <url text>
      (_, url, label) => `[${(label || url).trim()}](${url})`)
    .replace(/<matlab:[^>\s]+(?:\s+([^>]+))?>/gi, (_, label) => label ? label.trim() : '')     // <matlab:…> can't run → label text
    .replace(/(^|[\s([{])\|(\S(?:[^|]*\S)?)\|(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}\`${t}\``)   // |mono|
    .replace(/(^|[\s([{])\*(\S(?:[^*]*\S)?)\*(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}**${t}**`)   // *bold*
    .replace(/(^|[\s([{])_(\S(?:[^_]*\S)?)_(?=[\s)\]}.,;:!?]|$)/g, (_, p, t) => `${p}*${t}*`)       // _italic_
    .replace(/\(TM\)/g, '™').replace(/\(R\)/g, '®').replace(/\(C\)/g, '©');
}

// a run of comment lines (each starting with %) after a section break -> Markdown.
function mlCommentBlockToMd(rawLines) {
  const out = [];
  let pre = null;                                             // preformatted / sample-code buffer
  const flushPre = () => { if (pre) { out.push('```', ...pre, '```'); pre = null; } };
  for (const raw of rawLines) {
    const body = raw.replace(/^%/, '');                       // drop the single leading %
    const lead = (body.match(/^ +/) || [''])[0].length;
    const trimmed = body.trimStart();
    if (trimmed === '') { flushPre(); out.push(''); continue; }               // blank comment → paragraph break
    if (/^<\/?(html|latex)>$/i.test(trimmed)) { continue; }                   // drop raw-markup wrappers
    if (lead >= 2) { (pre ??= []).push(body.slice(2)); continue; }            // 2+ spaces → preformatted
    flushPre();
    let m;
    if ((m = trimmed.match(/^\*\s+(.*)$/))) { out.push('- ' + mlInline(m[1])); continue; }        // bullet
    if ((m = trimmed.match(/^#\s+(.*)$/)))  { out.push('1. ' + mlInline(m[1])); continue; }       // numbered
    out.push(mlInline(trimmed));
  }
  flushPre();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function liveScriptToNbMd(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => /^%%/.test(l))) return ser([code(text.replace(/\s+$/, ''))]);
  const cells = [];
  let i = 0;
  while (i < lines.length) {
    let title = null, subhead = false;
    const t = lines[i].match(/^%%(%)?[ \t]?(.*)$/);           // section break (%% or %%% no-break heading)
    if (t) { subhead = !!t[1]; title = t[2].trim(); i++; }
    const comments = [];                                      // leading comment block (markup text)
    while (i < lines.length && /^[ \t]*%(?!%)/.test(lines[i])) { comments.push(lines[i].replace(/^[ \t]*/, '')); i++; }
    const codeLines = [];                                     // code until the next section break
    while (i < lines.length && !/^%%/.test(lines[i])) { codeLines.push(lines[i]); i++; }

    const parts = [];
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

export function toNbMd(text, name = '') {
  const e = ext(name);
  const head = text.slice(0, 4000);
  if (/\.nb\.md(?:[?#]|$)/i.test(name)) return text;                    // our own format (even prose-only) — never re-parse
  if (/\{jupyter\.code-cell\}/.test(head)) return text;                 // already .nb.md
  if (e === '.ipynb' || (/^\s*\{/.test(text) && /"cells"\s*:/.test(head))) return ipynbToNbMd(text);
  if (e === '.m') return liveScriptToNbMd(text);
  if (e === '.qmd' || e === '.rmd' || e === '.md' || /^(`{3,}|~{3,})/m.test(text)) return mdNotebookToNbMd(text);
  return text;
}
