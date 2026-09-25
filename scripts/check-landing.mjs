#!/usr/bin/env node
// Static checks for the two ported landing pages. No packages or network needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [{ file: 'index.html', heroes: 3 }, { file: 'closeout/index.html', heroes: 1 }];
const routes = new Set(['/', '/closeout', '/product', '/answers', '/job']);
// Netlify builds product-src into /product before assembling the published site.
const buildRoutes = new Set(['/product']);
const ownerScript = 'https://agent-keyboard.fly.dev/widget.js';
const forbidden = /posthog|solutioner|hubspot|gtag|googletagmanager|warmly|apollo|valley|dashboard\.hypertrack\.com\/login|hs-scripts\.com|G-L5V1GJ51D6|GTM-5H3R6GZ|8405582/i;
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const failures = [];
const pageResults = [];
let localReferences = 0;

function fail(file, message) { failures.push(`${file}: ${message}`); }
function assert(condition, file, message) { if (!condition) fail(file, message); }
function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[\da-f]+|\d+));/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    return String.fromCodePoint(parseInt(entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1), entity[2].toLowerCase() === 'x' ? 16 : 10));
  });
}
function attributes(tag) {
  const attrs = {};
  const body = tag.replace(/^<\/?[\w:-]+/, '').replace(/\/?\s*>$/, '');
  for (const match of body.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

// A small tag tree, with script/style treated as raw text, is enough to check the
// source's real CTA containers without depending on fragile closing-div regexes.
function parseHTML(html) {
  const tree = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [tree];
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/g;
  let cursor = 0;
  let match;
  while ((match = tokens.exec(html))) {
    stack.at(-1).text += html.slice(cursor, match.index);
    const token = match[0];
    cursor = tokens.lastIndex;
    if (token.startsWith('<!')) continue;
    const tag = token.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.findLastIndex(node => node.tag === tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const node = { tag, attrs: attributes(token), children: [], text: '', parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (tag === 'script' || tag === 'style') {
      const end = new RegExp(`</${tag}\\s*>`, 'ig');
      end.lastIndex = cursor;
      const close = end.exec(html);
      node.text = html.slice(cursor, close?.index ?? html.length);
      cursor = close ? end.lastIndex : html.length;
      tokens.lastIndex = cursor;
    } else if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
  }
  return tree;
}
function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
function hasClass(node, name) { return (node.attrs.class ?? '').split(/\s+/).includes(name); }
function label(node) { return decode(node.text + node.children.map(label).join('')).replace(/\s+/g, ' ').trim(); }
function isFile(file) { try { return fs.statSync(file).isFile(); } catch { return false; } }

function checkReference(raw, file, context = 'asset') {
  let reference = decode(raw).trim();
  if (!reference || reference.startsWith('#') || /^(?:data|blob|mailto|tel|javascript):/i.test(reference)) return;
  if (/^(?:[a-z][\w+.-]*:)?\/\//i.test(reference)) {
    // Social previews are absolute URLs but must still refer to vendored files.
    const url = new URL(reference, 'https://closeoutcopilot.com');
    if (url.origin !== 'https://closeoutcopilot.com') return;
    reference = `${url.pathname}${url.search}${url.hash}`;
  } else if (/^[a-z][\w+.-]*:/i.test(reference)) return;
  if (/\$\{|[{}]/.test(reference)) {
    fail(file, `unresolved dynamic local reference ${JSON.stringify(reference)}`);
    return;
  }
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean) return;
  let pathname;
  try { pathname = decodeURIComponent(clean); } catch {
    fail(file, `invalid URL encoding in ${JSON.stringify(reference)}`);
    return;
  }
  const resolved = pathname.startsWith('/') ? path.resolve(root, `.${pathname}`) : path.resolve(root, path.dirname(file), pathname);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    fail(file, `reference escapes the repo: ${JSON.stringify(reference)}`);
    return;
  }
  localReferences++;
  const route = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (context === 'href' && pathname.startsWith('/') && !pathname.startsWith('/assets/')) {
    if (!routes.has(route)) {
      fail(file, `unported root-relative page link ${JSON.stringify(reference)}`);
      return;
    }
    if (buildRoutes.has(route)) return;
  }
  if (isFile(resolved)) return;
  if (context === 'href' && isFile(path.join(resolved, 'index.html'))) return;
  fail(file, `missing local ${context}: ${JSON.stringify(reference)} (${path.relative(root, resolved) || '.'})`);
}

function checkSrcset(value, file) {
  // Each non-data candidate is a URL followed by an optional width/density.
  // Data URLs can contain commas; consume their descriptor before continuing.
  for (const match of value.matchAll(/(?:^|,)\s*(data:[^\s]+|[^\s,]+)(?:\s+[^,]*)?/g)) checkReference(match[1], file, 'srcset');
}
function checkURLs(text, file) {
  for (const match of text.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) checkReference(match[1] ?? match[2] ?? match[3], file, 'url()');
  for (const match of text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) checkReference(match[1] ?? match[2], file, '@import');
}
function checkNodeReferences(nodes, file) {
  for (const node of nodes) {
    for (const name of ['src', 'href', 'poster', 'xlink:href', 'data-fallback']) {
      if (name in node.attrs) checkReference(node.attrs[name], file, name === 'href' && node.tag === 'a' ? 'href' : name);
    }
    if ('srcset' in node.attrs) checkSrcset(node.attrs.srcset, file);
    // This also covers SVG fill/filter attributes, as well as inline style.
    for (const value of Object.values(node.attrs)) if (/\burl\(/i.test(value)) checkURLs(value, file);
    if (node.tag === 'style') checkURLs(node.text, file);
    if (node.tag === 'script' && !node.attrs.src) checkJS(node.text, file);
    if (node.tag === 'meta' && /^(?:og:image(?::url)?|twitter:image(?::src)?)$/.test(node.attrs.property ?? node.attrs.name ?? '')) {
      assert(/^https:\/\/closeoutcopilot\.com\/assets\//.test(node.attrs.content ?? ''), file, 'social image must use https://closeoutcopilot.com/assets/');
      checkReference(node.attrs.content ?? '', file, 'social image');
    }
  }
}

function checkJS(text, file) {
  // Inspect string literals, skipping comments. Static concatenations are joined;
  // dynamic asset templates fail explicitly rather than silently evading checks.
  const tokens = [...text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g)];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0].startsWith('/')) continue;
    let token = tokens[i];
    let value = token[0].slice(1, -1);
    while (tokens[i + 1] && !tokens[i + 1][0].startsWith('/') && /^\s*\+\s*$/.test(text.slice(token.index + token[0].length, tokens[i + 1].index))) {
      token = tokens[++i];
      value += token[0].slice(1, -1);
    }
    value = value.replace(/\\([/'"`])/g, '$1');
    checkURLs(value, file);
    if (/<[a-z][\s\S]*\s(?:src|href|srcset|poster)=/i.test(value)) checkNodeReferences(descendants(parseHTML(value)), file);
    // Documentation strings such as claims.js's source CSV are not fetched.
    const isAsset = /^(?:\/(?:assets|images|fonts|css|js|videos|widget)\/|\.{1,2}\/)/.test(value)
      || /^(?:\/?[\w@.-]+\/)*[\w@.-]+\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|otf|mp4|webm|css|js)(?:[?#][^\s]*)?$/i.test(value);
    if (isAsset) checkReference(value, file, 'JS asset');
  }
}

function checkGroup(group, file, name) {
  const links = descendants(group).filter(node => node.tag === 'a');
  const starts = links.filter(node => label(node) === 'Get started' && node.attrs.href === '/product');
  const primary = descendants(group).filter(node => hasClass(node, 'btn-primary'));
  assert(starts.length >= 1, file, `${name} needs a Get started link to /product`);
  assert(primary.length === 1, file, `${name} needs exactly one primary button (found ${primary.length})`);
  assert(starts.some(node => hasClass(node, 'btn-primary')), file, `${name}'s Get started must use the existing btn-primary class`);
  for (const demo of links.filter(node => label(node) === 'Book a demo')) {
    assert(!hasClass(demo, 'btn-primary') && (hasClass(demo, 'btn-secondary') || hasClass(demo, 'ht-header__cta')), file, `${name}'s Book a demo must use an existing outline button class`);
  }
}

function checkPage({ file, heroes }) {
  if (!isFile(path.join(root, file))) { fail(file, 'page is missing'); return; }
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!forbidden.test(html), file, `forbidden tracker/login reference: ${html.match(forbidden)?.[0] ?? ''}`);
  const nodes = descendants(parseHTML(html));
  checkNodeReferences(nodes, file);
  const scripts = nodes.filter(node => node.tag === 'script' && node.attrs.src);
  // Agent Keyboard lives only on /answers and /job (owner rule, Sep 25 2026).
  const owner = scripts.filter(node => node.attrs.src.split(/[?#]/, 1)[0] === ownerScript);
  assert(owner.length === 0, file, `Agent Keyboard must not load on landing pages (found ${owner.length})`);
  for (const script of scripts) {
    if (/^(?:https?:)?\/\//.test(script.attrs.src)) assert(false, file, `unexpected third-party script ${script.attrs.src}`);
  }

  const headers = nodes.filter(node => node.tag === 'header' && hasClass(node, 'ht-header'));
  assert(headers.length === 1, file, 'expected one original ht-header');
  let groups = 0;
  for (const name of ['ht-header__actions', 'ht-header__mobile']) {
    const containers = headers.flatMap(descendants).filter(node => hasClass(node, name));
    assert(containers.length === 1, file, `expected one .${name} CTA group`);
    for (const group of containers) {
      checkGroup(group, file, `.${name}`);
      groups++;
      assert(descendants(group).some(node => node.tag === 'a' && label(node) === 'Sign in' && node.attrs.href === '/product'), file, `.${name} needs its Sign in link to /product`);
    }
  }
  const heroGroups = nodes.filter(node => hasClass(node, 'hero-actions'));
  assert(heroGroups.length === heroes, file, `expected ${heroes} hero CTA groups (found ${heroGroups.length})`);
  heroGroups.forEach((group, index) => { checkGroup(group, file, `hero CTA ${index + 1}`); groups++; });
  const closing = nodes.filter(node => node.tag === 'section' && node.attrs.id === 'demo').flatMap(node => node.children.filter(child => hasClass(child, 'zone-box')));
  assert(closing.length === 1, file, 'expected one #demo > .zone-box closing CTA group');
  closing.forEach(group => { checkGroup(group, file, 'closing CTA'); groups++; });
  const expectedURL = file === 'index.html' ? 'https://closeoutcopilot.com/' : 'https://closeoutcopilot.com/closeout';
  assert(nodes.some(node => node.tag === 'link' && node.attrs.rel === 'canonical' && node.attrs.href === expectedURL), file, 'canonical must match the ported page URL');
  assert(nodes.some(node => node.tag === 'meta' && node.attrs.property === 'og:url' && node.attrs.content === expectedURL), file, 'og:url must match the ported page URL');
  pageResults.push(`${file}: ${groups} CTA groups, no Agent Keyboard, links and social metadata checked`);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

pages.forEach(checkPage);
const vendoredFiles = walk(path.join(root, 'assets'));
assert(vendoredFiles.length > 0, 'assets/', 'vendored assets are missing');
const codeFiles = vendoredFiles.filter(file => /\.(?:css|js)$/.test(file));
for (const full of codeFiles) {
  const file = path.relative(root, full);
  const text = fs.readFileSync(full, 'utf8');
  assert(!forbidden.test(text), file, `forbidden tracker/login reference: ${text.match(forbidden)?.[0] ?? ''}`);
  if (file.endsWith('.css')) checkURLs(text, file); else checkJS(text, file);
}

if (failures.length) {
  console.error(`FAIL check-landing: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  for (const result of pageResults) console.log(`PASS ${result}`);
  console.log(`PASS ${codeFiles.length} vendored CSS/JS files; ${localReferences} local references resolve`);
  console.log('PASS no forbidden trackers or login URLs; only approved local page routes');
  console.log('PASS /product is an allowed Netlify build route (local output not required)');
  console.log('PASS check-landing');
}
