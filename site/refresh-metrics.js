/* Rewrites site/metrics.json from GitHub: run daily by a workflow, or by hand with `node site/refresh-metrics.js`.
   Node built-ins only. GITHUB_TOKEN is optional and goes only to api.github.com. */
'use strict';
const OWNER = 'oficiallyAkshay', REPO = 'clonometer';
const API = 'https://api.github.com/';
const whole = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// get(url) resolves to parsed JSON, or null for a missing page; any other failure throws
async function build(get, now, prev) {
  const info = await get(`${API}repos/${OWNER}/${REPO}`);
  // the repository's open_issues_count includes pull requests, so ask the search for issues only
  const found = await get(`${API}search/issues?q=${encodeURIComponent(`repo:${OWNER}/${REPO} is:issue is:open`)}`);
  if (!info || !whole(found && found.total_count)) throw new Error('GitHub did not return the repository or its open issues');
  const names = ((await get(`${API}users/${OWNER}/repos?type=owner&per_page=100`)) || []).map((r) => r.name);
  let sum = 0, repos = 0, own = null;
  for (const name of names) {
    const c = await get(`${API}repos/${OWNER}/${name}/contents/clones.json?ref=badges`);
    if (!c || !whole(c.total)) continue;                  // not running clonometer
    sum += c.total; repos++;
    if (name === REPO) own = c;
  }
  if (!own || !whole(own.window && own.window.count)) throw new Error('no clone numbers for clonometer itself');
  const day = now.toISOString().slice(0, 10);
  return {
    stars: info.stargazers_count, forks: info.forks_count, watchers: info.subscribers_count, openIssues: found.total_count,
    downloads: prev.downloads || { total: null, last30d: null },
    clones: { lifetime: own.total, last14d: own.window.count },
    totalCounted: { clones: sum, repos, updated: day, source: `Sum of lifetime clones (total) from the badges branch clones.json of the ${repos} public repositories that run clonometer, read ${day}.` },
    updated: day,
    source: `GitHub API repos/${OWNER}/${REPO} (stars, forks, watchers), issue search (open issues, pull requests excluded) and the badges branch clones.json (clones), read ${day}. Downloads: no release assets exist, so none shown.`
  };
}

async function main() {
  const fs = require('node:fs'), path = require('node:path');
  const file = path.join(__dirname, 'metrics.json');
  const token = process.env.GITHUB_TOKEN;
  const get = async (url) => {
    // the contents endpoint answers with the file itself when asked for the raw form
    const headers = { accept: url.includes('/contents/') ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' };
    if (token && url.startsWith(API)) headers.authorization = 'Bearer ' + token;
    const r = await fetch(url, { headers, redirect: 'error' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(url + ' answered ' + r.status);
    return r.json();
  };
  const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const next = await build(get, new Date(), prev);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
}

module.exports = { build, OWNER, REPO };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
