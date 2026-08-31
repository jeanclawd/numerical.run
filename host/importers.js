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
// %%-sectioned files become cells: a %% title → heading, contiguous %-comment
// runs → prose, code runs → code cells. A plain script (no %% sections) is one
// code cell.
function liveScriptToNbMd(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => /^%%/.test(l))) return ser([code(text.replace(/\s+$/, ''))]);
  const cells = [];
  let run = null, kind = null;                 // current run of lines + its kind
  const flush = () => {
    if (run && run.join('').trim()) cells.push(kind === 'md' ? md(run.join('\n')) : code(run.join('\n')));
    run = null; kind = null;
  };
  const add = (k, line) => { if (kind !== k) { flush(); kind = k; run = []; } run.push(line); };
  for (const line of lines) {
    const sec = line.match(/^%%\s?(.*)$/);
    if (sec) { flush(); if (sec[1].trim()) { kind = 'md'; run = ['## ' + sec[1].trim()]; flush(); } continue; }
    if (/^\s*%/.test(line)) add('md', line.replace(/^\s*%\s?/, ''));
    else add('code', line);
  }
  flush();
  return ser(cells);
}

export function toNbMd(text, name = '') {
  const e = ext(name);
  const head = text.slice(0, 4000);
  if (/\{jupyter\.code-cell\}/.test(head)) return text;                 // already .nb.md
  if (e === '.ipynb' || (/^\s*\{/.test(text) && /"cells"\s*:/.test(head))) return ipynbToNbMd(text);
  if (e === '.m') return liveScriptToNbMd(text);
  if (e === '.qmd' || e === '.rmd' || e === '.md' || /^(`{3,}|~{3,})/m.test(text)) return mdNotebookToNbMd(text);
  return text;
}
