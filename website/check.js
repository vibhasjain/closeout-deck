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
// Nav dropdown: a button that controls an existing menu holding four absolute links.
const has = (tag, cls) => (tag.attrs.class || '').split(/\s+/).includes(cls);
const within = (open, closeName) => { const end = tags.find(tag => tag.closing && tag.name === closeName && tag.start > open.start); return elements.filter(tag => tag.start > open.start && tag.start < end.start); };
const ddBtn = elements.find(tag => has(tag, 'nav-dd-btn'));
const ddMenu = elements.find(tag => has(tag, 'nav-dd-menu'));
const ddLinks = ddMenu ? within(ddMenu, 'div').filter(tag => tag.name === 'a') : [];
if (!ddBtn || !ddMenu || ddBtn.attrs['aria-controls'] !== ddMenu.attrs.id || ddBtn.attrs['aria-expanded'] !== 'false') broken.push('nav dropdown wiring');
if (ddLinks.length !== 4 || ddLinks.some(tag => !/^https:\/\/hypertrack\.com\//.test(tag.attrs.href || ''))) broken.push('nav dropdown links');
// Every speaker card carries a local headshot and a YouTube replay.
const cards = elements.filter(tag => tag.name === 'li' && has(tag, 'spk'));
const badCards = cards.filter(card => { const inner = within(card, 'li'); return !inner.some(tag => tag.name === 'img' && /^assets\/speakers\/[\w-]+\.jpg$/.test(tag.attrs.src || '')) || !inner.some(tag => tag.name === 'a' && /^https:\/\/(youtu\.be\/|www\.youtube\.com\/watch\?v=)[\w-]+$/.test(tag.attrs.href || '')); });
if (cards.length !== 9 || badCards.length) broken.push(`speaker cards (${cards.length} found, ${badCards.length} incomplete)`);
check('2 anchors, nav dropdown and speaker cards resolve', broken.length === 0, broken.length ? broken.join(', ') : `${anchors.length} fragment links, ${ddLinks.length} dropdown links, ${cards.length} speaker cards`);

const claims = [...new Set(elements.map(tag => tag.attrs['data-confirm']).filter(value => value !== undefined))];
const undocumented = claims.filter(id => !id || !readme.includes(`| ${id} |`));
check('3 claim IDs documented in README', undocumented.length === 0, undocumented.length ? undocumented.join(', ') : `${claims.length} IDs checked`);

const forbidden = ['cdn.tailwindcss.com', 'Closeout Copilot', 'pay run', 'shift work', 'hypertrack.com/research'].filter(value => html.includes(value));
check('4 prohibited strings absent', forbidden.length === 0, forbidden.join(', '));

const headings = elements.filter(tag => tag.name === 'h1');
const images = elements.filter(tag => tag.name === 'img');
const noAlt = images.filter(tag => !tag.attrs.alt?.trim() && !(tag.attrs.alt !== undefined && tag.attrs['aria-hidden'] === 'true'));
check('5 one h1 and nonempty image alt text', headings.length === 1 && noAlt.length === 0, `${headings.length} h1; ${images.length} images; ${noAlt.length} missing alt`);

check('6 no Agent Keyboard tag on this page', !html.includes('agent-keyboard.fly.dev'));

// product.html gets the structural checks only: local paths, fragment anchors, copy bans, one h1, alt text, no widget.
{
  const page = fs.readFileSync(path.join(base, 'product.html'), 'utf8');
  const els = tagsOf(page).filter(tag => !tag.closing);
  const problems = [];
  for (const { attrs } of els) for (const key of ['src', 'href']) {
    const value = attrs[key];
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) continue;
    const file = decodeURIComponent(value.split(/[?#]/)[0]);
    if (file && !fs.existsSync(path.resolve(base, file))) problems.push(`missing ${file}`);
  }
  const pageIds = new Set(els.map(tag => tag.attrs.id).filter(Boolean));
  for (const tag of els) if (tag.name === 'a' && tag.attrs.href?.startsWith('#') && !pageIds.has(tag.attrs.href.slice(1))) problems.push(`anchor ${tag.attrs.href}`);
  for (const word of ['cdn.tailwindcss.com', 'Closeout Copilot', 'pay run', 'Pay run', 'shift work', 'agent-keyboard.fly.dev']) if (page.includes(word)) problems.push(`banned "${word}"`);
  if (els.filter(tag => tag.name === 'h1').length !== 1) problems.push('h1 count');
  const bare = els.filter(tag => tag.name === 'img' && !tag.attrs.alt?.trim() && !(tag.attrs.alt !== undefined && tag.attrs['aria-hidden'] === 'true'));
  if (bare.length) problems.push(`${bare.length} images without alt`);
  check('7 product.html paths, anchors, copy, h1, alt', problems.length === 0, problems.slice(0, 8).join(', '));
}
process.exitCode = failed ? 1 : 0;
