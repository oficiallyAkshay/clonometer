// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const tag = (attr, name) => {
  const m = head.match(new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)"'));
  return m && m[1];
};

test('the head carries the full Open Graph and Twitter card set with absolute addresses', () => {
  const og = ['type', 'site_name', 'title', 'description', 'url', 'locale', 'image', 'image:secure_url', 'image:type', 'image:width', 'image:height', 'image:alt'];
  for (const k of og) assert.ok(tag('property', 'og:' + k), 'missing og:' + k);
  const tw = ['card', 'title', 'description', 'url', 'image', 'image:alt'];
  for (const k of tw) assert.ok(tag('name', 'twitter:' + k), 'missing twitter:' + k);
  for (const v of [tag('property', 'og:url'), tag('property', 'og:image'), tag('property', 'og:image:secure_url'), tag('name', 'twitter:image')]) {
    assert.match(v, /^https:\/\/oficiallyakshay\.github\.io\/clonometer\//);
  }
  assert.match(head, /<link rel="canonical" href="https:\/\/oficiallyakshay\.github\.io\/clonometer\/">/);
  assert.match(head, /<link rel="manifest" href="manifest\.webmanifest">/);
});

test('one discovery paragraph of 40 to 80 words fills every description and the structured data, and never the visible page', () => {
  const para = tag('name', 'description');
  const words = para.split(/\s+/).length;
  assert.ok(words >= 40 && words <= 80, 'found ' + words + ' words');
  assert.strictEqual(tag('property', 'og:description'), para);
  assert.strictEqual(tag('name', 'twitter:description'), para);
  const ld = JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const types = ld['@graph'].map((n) => n['@type']);
  assert.deepStrictEqual(types, ['WebSite', 'SoftwareSourceCode']);
  for (const n of ld['@graph']) assert.strictEqual(n.description, para);
  const kw = ld['@graph'][1].keywords;
  assert.ok(kw.length >= 8 && kw.length <= 15, 'found ' + kw.length + ' keywords');
  const body = html.slice(html.indexOf('<body>')).replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(body, /traffic history|clone statistics|open source GitHub Action/i);});

test('the crawl and agent files exist and agree with each other', () => {
  const site = 'https://oficiallyakshay.github.io/clonometer/';
  assert.match(read('robots.txt'), /^User-agent: \*\nAllow: \/\n/);
  assert.ok(read('robots.txt').includes('Sitemap: ' + site + 'sitemap.xml'));
  const map = read('sitemap.xml');
  assert.ok(map.includes('<loc>' + site + '</loc>'));
  assert.match(map, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  const llms = read('llms.txt');
  assert.match(llms, /^# clonometer\n\n> /);
  assert.ok(llms.includes(site));
  const sec = read('.well-known/security.txt');
  assert.match(sec, /^Contact: https:\/\//);
  assert.ok(new Date(sec.match(/^Expires: (\S+)$/m)[1]) > new Date(), 'security.txt has expired');
  assert.match(read('404.html'), /<title>clonometer[^<]*<\/title>[\s\S]*href="\/clonometer\/"/);
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.strictEqual(man.name, 'clonometer');
  assert.ok(man.theme_color && man.icons.length > 0);
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(__dirname, '..', i.src)), i.src);
});

test('the site files hold no em dash', () => {
  for (const f of ['index.html', '404.html', 'llms.txt', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', '.well-known/security.txt']) {
    assert.ok(!read(f).includes('—'), f);
  }
});
