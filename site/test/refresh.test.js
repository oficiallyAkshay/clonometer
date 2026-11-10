// run: node --test site/test/
const test = require('node:test');
const assert = require('node:assert');
const { build, OWNER, REPO } = require('../refresh-metrics.js');

const API = 'https://api.github.com/';
const RAW = (name) => `${API}repos/${OWNER}/${name}/contents/clones.json?ref=badges`;
const NOW = new Date('2026-11-03T04:05:06Z');

function world(over) {
  const pages = Object.assign({
    [`${API}repos/${OWNER}/${REPO}`]: { stargazers_count: 4, forks_count: 1, subscribers_count: 2, open_issues_count: 5 },
    [`${API}search/issues?q=${encodeURIComponent(`repo:${OWNER}/${REPO} is:issue is:open`)}`]: { total_count: 2 },
    [`${API}users/${OWNER}/repos?type=owner&per_page=100`]: [{ name: REPO }, { name: 'one' }, { name: 'two' }, { name: 'plain' }],
    [RAW(REPO)]: { total: 2853, window: { count: 527 } },
    [RAW('one')]: { total: 100, window: { count: 3 } },
    [RAW('two')]: { total: 11, window: { count: 0 } },
    [RAW('plain')]: null,                       // a repository that does not run clonometer has no numbers file
  }, over);
  const asked = [];
  const get = async (url) => { asked.push(url); if (!(url in pages)) throw new Error('unexpected ' + url); return pages[url]; };
  return { get, asked };
}

test('the numbers come from GitHub, dated by the run', async () => {
  const m = await build(world().get, NOW, {});
  assert.deepStrictEqual([m.stars, m.forks, m.watchers], [4, 1, 2]);
  assert.deepStrictEqual(m.clones, { lifetime: 2853, last14d: 527 });
  assert.strictEqual(m.updated, '2026-11-03');
  assert.strictEqual(m.totalCounted.updated, '2026-11-03');
});

test('open issues count issues only, not the pull requests the repository count includes', async () => {
  const m = await build(world().get, NOW, {});
  assert.strictEqual(m.openIssues, 2);
  assert.notStrictEqual(m.openIssues, 5);
});

test('the total across repositories sums only repositories that run clonometer and says how many', async () => {
  const m = await build(world().get, NOW, {});
  assert.strictEqual(m.totalCounted.clones, 2853 + 100 + 11);
  assert.strictEqual(m.totalCounted.repos, 3);
});

test('a run that cannot read one of the numbers throws and writes nothing partial', async () => {
  await assert.rejects(build(world({ [RAW(REPO)]: null }).get, NOW, {}), /clonometer/);
  await assert.rejects(build(world({ [RAW(REPO)]: { total: 'x', window: { count: 1 } } }).get, NOW, {}), /clonometer/);
  await assert.rejects(build(world({ [`${API}search/issues?q=${encodeURIComponent(`repo:${OWNER}/${REPO} is:issue is:open`)}`]: {} }).get, NOW, {}), /issues/);
});

test('fields the script does not read are kept from the file it replaces', async () => {
  const m = await build(world().get, NOW, { downloads: { total: 7, last30d: 1 } });
  assert.deepStrictEqual(m.downloads, { total: 7, last30d: 1 });
  assert.deepStrictEqual((await build(world().get, NOW, {})).downloads, { total: null, last30d: null });
});

test('main starts from an empty object when no previous numbers file exists, and still fails on a bad one', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-'));
  const pages = world().get;
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const body = await pages(url);
    return { status: body === null ? 404 : 200, ok: body !== null, json: async () => body };
  };
  try {
    await require('../refresh-metrics.js').main(dir);
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
    assert.deepStrictEqual(written.downloads, { total: null, last30d: null });
    assert.strictEqual(written.clones.lifetime, 2853);
    fs.writeFileSync(path.join(dir, 'metrics.json'), '{ not json');
    await assert.rejects(require('../refresh-metrics.js').main(dir), SyntaxError);
  } finally {
    global.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the site workflow refreshes the numbers every 6 hours and before every upload to Pages', () => {
  const yml = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', '.github', 'workflows', 'site.yml'), 'utf8');
  const cron = yml.match(/cron:\s*"([^"]+)"/);
  assert.ok(cron, 'site.yml has no schedule');
  assert.strictEqual(cron[1].split(/\s+/)[1], '*/6');
  assert.match(yml, /workflow_dispatch:/);
  const refresh = yml.indexOf('run: node site/refresh-metrics.js');
  assert.ok(refresh > 0, 'site.yml never runs the refresh');
  assert.ok(refresh < yml.indexOf('upload-pages-artifact'), 'the refresh must run before the Pages upload');
});
