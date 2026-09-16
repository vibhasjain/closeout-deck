'use strict';

const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const repo = path.dirname(base);
let html;
let readme;
try {
  html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
  readme = fs.readFileSync(path.join(base, 'README.md'), 'utf8');
} catch (error) {
  console.error(`FAIL input files: ${error.message}`);
  process.exit(1);
}

const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  const lower = entity.toLowerCase();
  if (named[lower]) return named[lower];
  const hex = lower.startsWith('&#x');
  const point = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
});

// A small tag/attribute scanner: quoted > signs, comments and raw script bodies
// must not be mistaken for markup. This is a static checker, not a DOM engine.
function tagsOf(source) {
  const tags = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    let end = start + 1;
    let quote = '';
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    cursor = end + 1;
    const raw = source.slice(start + 1, end);
    const nameMatch = raw.match(/^\s*(\/?)\s*([a-z][\w:-]*)/i);
    if (!nameMatch) continue;
    const name = nameMatch[2].toLowerCase();
    const closing = Boolean(nameMatch[1]);
    const attrs = Object.create(null);
    let at = nameMatch[0].length;
    while (at < raw.length && !closing) {
      while (/\s/.test(raw[at] || '') && at < raw.length) at++;
      if (at >= raw.length || raw[at] === '/') break;
      const keyStart = at;
      while (at < raw.length && !/[\s=/>]/.test(raw[at])) at++;
      const key = raw.slice(keyStart, at).toLowerCase();
      if (!key) { at++; continue; }
      while (at < raw.length && /\s/.test(raw[at])) at++;
      let value = '';
      if (raw[at] === '=') {
        at++;
        while (at < raw.length && /\s/.test(raw[at])) at++;
        const delimiter = raw[at];
        if (delimiter === '"' || delimiter === "'") {
          const valueStart = ++at;
          while (at < raw.length && raw[at] !== delimiter) at++;
          value = raw.slice(valueStart, at++);
        } else {
          const valueStart = at;
          while (at < raw.length && !/\s/.test(raw[at])) at++;
          value = raw.slice(valueStart, at);
        }
      }
      attrs[key] = decode(value);
    }
    tags.push({ name, closing, attrs, start, end: end + 1 });
    if (!closing && (name === 'script' || name === 'style')) {
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = cursor;
      const match = close.exec(source);
      cursor = match ? match.index : source.length;
    }
  }
  return tags;
}

const tags = tagsOf(html);
const elements = tags.filter(tag => !tag.closing);
const pending = new Set();
const local = new Set();
for (const { attrs } of elements) {
  for (const key of ['src', 'href', 'srcset']) {
    if (!attrs[key]) continue;
    const candidates = key === 'srcset' ? attrs[key].split(',').map(value => value.trim().split(/\s+/)[0]) : [attrs[key]];
    for (const candidate of candidates) {
      if (!candidate || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(candidate)) continue;
      const pathname = decodeURIComponent(candidate.split(/[?#]/)[0]);
      if (pathname) local.add(pathname);
    }
  }
}
const missing = [];
for (const reference of local) {
  const target = reference.startsWith('/') ? path.resolve(repo, `.${reference}`) : path.resolve(base, reference);
  if (fs.existsSync(target)) continue;
  if (target.startsWith(path.join(base, 'assets', 'art') + path.sep)) pending.add(reference);
  else missing.push(reference);
}

let failed = false;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed = true;
}
check('1 local src/href/srcset paths', missing.length === 0, missing.length ? missing.join(', ') : `${local.size} paths checked; ${pending.size} pending art`);
for (const reference of [...pending].sort()) console.log(`pending art: ${reference}`);

const ids = new Set(elements.map(tag => tag.attrs.id).filter(Boolean));
const anchors = elements.filter(tag => tag.name === 'a' && tag.attrs.href?.startsWith('#'));
const broken = anchors.map(tag => decodeURIComponent(tag.attrs.href.slice(1))).filter(id => !ids.has(id));
check('2 nav and station anchors resolve', broken.length === 0, broken.length ? broken.join(', ') : `${anchors.length} fragment links checked`);

const claims = [...new Set(elements.map(tag => tag.attrs['data-confirm']).filter(value => value !== undefined))];
const undocumented = claims.filter(id => !id || !readme.includes(`| ${id} |`));
check('3 claim IDs documented in README', undocumented.length === 0, undocumented.length ? undocumented.join(', ') : `${claims.length} IDs checked`);

const forbidden = ['cdn.tailwindcss.com', 'Closeout Copilot'].filter(value => html.includes(value));
check('4 prohibited strings absent', forbidden.length === 0, forbidden.join(', '));

const headings = elements.filter(tag => tag.name === 'h1');
const images = elements.filter(tag => tag.name === 'img');
const noAlt = images.filter(tag => !tag.attrs.alt?.trim() && !(tag.attrs.alt !== undefined && tag.attrs['aria-hidden'] === 'true'));
check('5 one h1 and nonempty image alt text', headings.length === 1 && noAlt.length === 0, `${headings.length} h1; ${images.length} images; ${noAlt.length} missing alt`);

const widgets = elements.filter(tag => tag.name === 'script' && tag.attrs.src === 'https://agent-keyboard.fly.dev/widget.js');
const bodyEnd = tags.find(tag => tag.name === 'body' && tag.closing);
const widget = widgets[0];
const widgetClose = widget && tags.find(tag => tag.name === 'script' && tag.closing && tag.start >= widget.end);
const afterWidget = widgetClose && bodyEnd ? html.slice(widgetClose.end, bodyEnd.start).replace(/<!--[\s\S]*?-->/g, '').trim() : 'missing';
const bodyStart = elements.find(tag => tag.name === 'body');
const lastWidget = widgets.length === 1 && widget.attrs['data-site'] === 'closeout' && Object.hasOwn(widget.attrs, 'defer') && bodyStart && widget.start > bodyStart.end && bodyEnd && widgetClose && widgetClose.end <= bodyEnd.start && afterWidget === '';
check('6 Agent Keyboard tag present and last in body', Boolean(lastWidget));
process.exitCode = failed ? 1 : 0;
