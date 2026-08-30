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

  for (const line of lines) {
    const t = line.trim();
    if (t === '') { flush(); continue; }

    let m;
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
