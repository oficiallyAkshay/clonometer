/* Rewrites site/metrics.json from GitHub: .github/workflows/site.yml runs it every 6 hours and on every deploy,
   then publishes the fresh file to GitHub Pages without committing it. By hand: `node site/refresh-metrics.js`.
   Node built-ins only. GITHUB_TOKEN is optional and goes only to api.github.com. */
'use strict';
const OWNER = 'oficiallyAkshay', REPO = 'clonometer';
const API = 'https://api.github.com/';
const LIVE = 'https://oficiallyakshay.github.io/clonometer/metrics.json';
const whole = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// get(url) resolves to parsed JSON, or null for a missing page; any other failure throws
async function build(get, now, prev) {
  const info = await get(`${API}repos/${OWNER}/${REPO}`);
  // the repository's open_issues_count includes pull requests, so ask the search for issues only
  const found = await get(`${API}search/issues?q=${encodeURIComponent(`repo:${OWNER}/${REPO} is:issue is:open`)}`);
  if (!info || !whole(found && found.total_count)) throw new Error('GitHub did not return the repository or its open issues');
  // every repository whose workflow names this action, on any account, plus the owner's own repositories
  const found_ = new Set(((await get(`${API}users/${OWNER}/repos?type=owner&per_page=100`)) || []).map((r) => `${OWNER}/${r.name}`));
  const q = encodeURIComponent(`"${OWNER}/${REPO}" path:.github/workflows`);
  // code search is rate limited hard (10 a minute), so it runs at most every 3 hours, only when GitHub says the quota
  // is left, and a failed search keeps what was found and must not stop the whole refresh
  let searched = prev.searched || null;
  const recent = searched && now - new Date(searched) < 3 * 3600e3 && Array.isArray(prev.tracked) && prev.tracked.length > 0;
  if (!recent) {
    try {
      const rl = await get(`${API}rate_limit`).catch(() => null);
      const left = rl && rl.resources && rl.resources.code_search && rl.resources.code_search.remaining;
      if (left === 0) throw new Error('the code search quota is used up');
      for (let page = 1; page <= 10; page++) {
        const hits = (await get(`${API}search/code?q=${q}&per_page=100&page=${page}`)) || {};
        const items = Array.isArray(hits.items) ? hits.items : [];
        for (const it of items) if (it.repository && it.repository.full_name) found_.add(it.repository.full_name);
        if (items.length < 100) break;
      }
      searched = now.toISOString();
    } catch (e) {
      console.warn('repository search skipped, counting the repositories found so far: ' + e.message);
    }
  }
  // the repositories that had numbers last time stay candidates, so a failed search still counts them
  for (const full of Array.isArray(prev.tracked) ? prev.tracked : []) if (typeof full === 'string' && /^[\w.-]+\/[\w.-]+$/.test(full)) found_.add(full);
  let sum = 0, repos = 0, own = null;
  const tracked = [];
  for (const full of found_) {
    const c = await get(`${API}repos/${full}/contents/clones.json?ref=badges`);
    if (!c || !whole(c.total)) continue;                  // not running clonometer, or no numbers yet
    sum += c.total; repos++; tracked.push(full);
    if (full.toLowerCase() === `${OWNER}/${REPO}`.toLowerCase()) own = c;
  }
  if (!own || !whole(own.window && own.window.count)) throw new Error('no clone numbers for clonometer itself');
  const day = now.toISOString().slice(0, 10);
  return {
    stars: info.stargazers_count, forks: info.forks_count, watchers: info.subscribers_count, openIssues: found.total_count,
    downloads: prev.downloads || { total: null, last30d: null },
    clones: { lifetime: own.total, last14d: own.window.count },
    tracked, searched,
    totalCounted: { clones: sum, repos, updated: day, source: `Sum of lifetime clones (total) from the badges branch clones.json of the ${repos} public repositories that run clonometer, found by searching GitHub workflows, read ${day}.` },
    updated: day,
    source: `GitHub API repos/${OWNER}/${REPO} (stars, forks, watchers), issue search (open issues, pull requests excluded) and the badges branch clones.json (clones), read ${day}. Downloads: no release assets exist, so none shown.`
  };
}

async function main(dir = __dirname) {
  const fs = require('node:fs'), path = require('node:path');
  const file = path.join(dir, 'metrics.json');
  const token = process.env.GITHUB_TOKEN;
  const get = async (url) => {
    // the contents endpoint answers with the file itself when asked for the raw form
    const headers = { accept: url.includes('/contents/') ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' };
    if (token && url.startsWith(API)) headers.authorization = 'Bearer ' + token;
    let r = await fetch(url, { headers, redirect: 'error' });
    // a rate limit that names a short wait is waited out once; a long or unnamed wait is not worth the runner time
    const wait = Number(r.status === 429 && r.headers && r.headers.get('retry-after'));
    if (r.status === 429 && Number.isFinite(wait) && wait <= 20) {
      await new Promise((done) => setTimeout(done, wait * 1000));
      r = await fetch(url, { headers, redirect: 'error' });
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(url + ' answered ' + r.status);
    return r.json();
  };
  // the file is not committed: a fresh checkout has none, so start from an empty object; a file that exists but is bad still throws
  let prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  // a fresh checkout has none, so read the repositories tracked on the live site; no answer just means none are remembered
  if (!prev.tracked) {
    try { const live = await get(LIVE); if (live && Array.isArray(live.tracked)) prev = Object.assign({}, prev, { tracked: live.tracked, searched: live.searched }); } catch (e) { console.warn('live numbers unreadable: ' + e.message); }
  }
  const next = await build(get, new Date(), prev);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
}

module.exports = { build, main, OWNER, REPO };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
