export const $ = (s) => document.querySelector(s);
export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function inline(s) {
  const kept = [];
  const keep = (html) => `\u0000${kept.push(html) - 1}\u0000`;
  return s
    .replace(/`([^`]+)`/g, (_, c) => keep(`<code>${c}</code>`))
    .replace(LINK, (_, t, u) => keep(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])[*_]([^*_\s][^*_]*?)[*_](?=[^*\w]|$)/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\u0000(\d+)\u0000/g, (_, n) => kept[n]);
}

const ITEM = /^\s*(?:[-*+]|\d+[.)]) (.*)/;
const ROW = /^\s*\|/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^(#{1,4}) (.*)/;
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));

// Escape first, then build a small whitelist of markdown blocks; LLM output carries untrusted email/Slack/page text.
export function md(text) {
  const lines = esc(text).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    let m;
    if (!line.trim()) i++;
    else if ((m = line.match(HEADING))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
    } else if (RULE.test(line)) {
      out.push('<hr>');
      i++;
    } else if (ROW.test(line) && /^[\s|:-]+$/.test(lines[i + 1] ?? '') && lines[i + 1].includes('-')) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && ROW.test(lines[i]); i++) rows.push(cells(lines[i]));
      const tr = (r, tag) => `<tr>${r.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
      out.push(`<table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r, 'td')).join('')}</tbody></table>`);
    } else if (ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      for (; i < lines.length && (m = lines[i].match(ITEM)) && /^\s*\d/.test(lines[i]) === ordered; i++) items.push(`<li>${inline(m[1])}</li>`);
      out.push(`<${tag}>${items.join('')}</${tag}>`);
    } else {
      const para = [];
      do para.push(lines[i++]);
      while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !ITEM.test(lines[i]) && !RULE.test(lines[i]) && !ROW.test(lines[i]));
      out.push(`<p>${inline(para.join('<br>'))}</p>`);
    }
  }
  return out.join('');
}

export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter((k) => k != null && k !== false && k !== ''));
  return e;
};

export const link = (url, text, className) =>
  url?.startsWith('https://') ? el('a', { href: url, target: '_blank', rel: 'noopener', textContent: text, className }) : text;

export const when = (at) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
