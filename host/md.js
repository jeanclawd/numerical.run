/* Minimal, dependency-free Markdown → HTML for prose cells. Covers what a
 * notebook's narrative needs: ATX headings, bold/italic/inline-code, links,
 * unordered/ordered lists, blockquotes, hr, and paragraphs. Escapes HTML first,
 * so cell prose can't inject markup. Not CommonMark-complete — deliberately
 * small; code cells carry the real content. */

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only these href/src schemes are allowed — blocks javascript:/data: etc. so
// arbitrary shared markdown can't inject a dangerous link.
const SAFE = /^(https?:\/\/|\/|\.\/|\?|#|thumbs\/|examples\/)/i;
const attr = (s) => s.replace(/"/g, '%22');
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => SAFE.test(src) ? `<img alt="${attr(alt)}" src="${attr(src)}">` : m)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, href) =>
      SAFE.test(href) ? `<a href="${attr(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>` : m);
}

// GFM table: split a `| a | b |` row into trimmed cells (outer pipes optional).
const tableCells = (t) => t.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
// A separator row like `| --- | :--: |` (with optional alignment colons).
const isTableSep = (t) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(t);

export function mdToHtml(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;   // {tag, items}

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { flush(); continue; }

    let m;
    // fenced code block: ``` (or more) ... closing fence. Content is escaped
    // verbatim — no inline parsing — so a fence can show markdown/code literally.
    if ((m = t.match(/^(`{3,})(.*)$/))) {
      flush();
      const fence = m[1];
      const lang = m[2].trim().split(/\s+/)[0];
      const body = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].trim().startsWith(fence) && lines[i].trim().replace(/[^`]/g, '') === fence) { closed = true; break; }
        body.push(lines[i]);
      }
      const cls = lang ? ` class="language-${attr(lang)}"` : '';
      out.push(`<pre><code${cls}>${esc(body.join('\n'))}</code></pre>`);
      if (!closed) { /* unterminated fence: consumed to EOF */ }
      continue;
    }
    // GFM table: a `|`-bearing header line immediately followed by a separator.
    if (t.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1].trim())) {
      flush();
      const head = tableCells(t);
      i++; // consume separator
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().includes('|') && lines[i + 1].trim() !== '') {
        rows.push(tableCells(lines[++i].trim()));
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const trs = rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('<hr>'); continue; }
    if ((m = t.match(/^>\s?(.*)$/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = t.match(/^[-*+]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList();
    para.push(t);
  }
  flush();
  return out.join('\n');
}
