<h1 align="center">📈 clonometer</h1>

<p align="center">
  <b>GitHub forgets your clones after 14 days. clonometer does not.</b>
  <br>
  A lifetime clone count for any repository, in a JSON file you can badge any way you like.
</p>

It is for repositories whose install is a clone: agent skills, actions, templates, taps, dotfiles. A repository that ships as a package already has a better number in its registry's download badge.

<p align="center">
  <a href=".github/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/oficiallyAkshay/clonometer/ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://codecov.io/gh/oficiallyAkshay/clonometer"><img alt="coverage" src="https://img.shields.io/codecov/c/github/oficiallyAkshay/clonometer?logo=codecov&logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/license-MIT-2f6f4e?logo=opensourceinitiative&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="Python 3.11 or newer" src="https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="zero runtime dependencies" src="https://img.shields.io/badge/dependencies-0-2f6f4e?logo=python&logoColor=white"></a>
  <a href="#limits"><img alt="clones of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a>
  <a href="#limits"><img alt="views of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a>
</p>

<!-- once published, add: https://img.shields.io/npm/dm/clonometer?logo=npm&logoColor=white and https://img.shields.io/pypi/dm/clonometer?logo=pypi&logoColor=white -->

<p align="center"><img alt="A cron job reads the GitHub traffic API, merges it into a ledger, publishes a numbers file on the badges branch, and your badge reads it" src="assets/loop.svg" width="900"></p>

<p align="center">
  <b><a href="https://github.com/oficiallyAkshay/clonometer/blob/badges/clones.json">See this repository's own numbers file</a></b>
</p>

GitHub only remembers the last 14 days of clone traffic, then the number resets to zero. clonometer samples that window on a schedule and keeps the total forever.

```json
{
  "badge": "61 (7d) • 50.1k (all-time)",
  "last7": 61,
  "last7_short": "61",
  "metric": "clones",
  "repo": "owner/name",
  "schema": 1,
  "since": "2026-09-17",
  "total": 50123,
  "total_short": "50.1k",
  "updated": "2026-10-01",
  "window": {
    "count": 123,
    "days": 14,
    "uniques": 45
  },
  "window_short": "123"
}
```

## Features

| Feature | What it means |
| --- | --- |
| **Lifetime count** | Every clone since day one, not just the last 14 |
| **Your badge, your way** | Label, colour, style and logo are yours; clonometer ships numbers |
| **Honest numbers** | Never goes down, uniques are never summed across days |
| **Stored on your repo** | The ledger lives on a branch of your own repo |
| **Zero dependencies** | Standard library only, nothing to install or audit |
| **Views optional** | Turn on page views alongside clones with one input |

## Quick start

```bash
mkdir -p .github/workflows && curl -fsSL https://raw.githubusercontent.com/oficiallyAkshay/clonometer/main/.github/consumer-workflow.yml | sed "s|<sha>|$(git ls-remote https://github.com/oficiallyAkshay/clonometer.git HEAD | cut -c1-40)|" > .github/workflows/clonometer.yml
```

That writes this workflow, pinned to the current commit:

```yaml
name: clonometer
on:
  schedule: [{cron: "17 3 * * *"}]
  workflow_dispatch:
permissions: {}
concurrency: {group: clonometer}
jobs:
  count:
    runs-on: ubuntu-latest
    steps:
      - uses: oficiallyAkshay/clonometer@<sha>   # pinned commit
        with:
          token: ${{ secrets.TRAFFIC_TOKEN }}
```

Then badge it however you like:

```
https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/OWNER/REPO/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white
https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/OWNER/REPO/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white
https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/OWNER/REPO/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time
```

The first two render as the badges at the top of this page; the third shows one key on its own, and any key in the file works there.

## How it works

1. A scheduled workflow runs once a day.
2. It reads the 14 day traffic window from the GitHub API.
3. Each day's counts merge into the ledger, keeping the higher value.
4. The ledger and a small numbers file are pushed to the `badges` branch.
5. Your README badge reads the numbers file through shields, or anything else that reads JSON.

## Configuration and security

| Input | Default | Meaning |
| --- | --- | --- |
| `token` | required | Fine-grained PAT with Administration read and Contents write on this repository |
| `branch` | `badges` | Orphan storage branch |
| `metrics` | `clones` | `clones` or `clones,views` |

### What leaves your machine: one authenticated request to api.github.com and one push to your own repository, nothing else

| Concern | What actually happens | The guard |
| --- | --- | --- |
| Reading traffic | The action reads the clones endpoint with the token you provide | A workflow token cannot read traffic, so `GITHUB_TOKEN` is never used here |
| The push | One commit lands on the storage branch of your own repository | The branch is force pushed, so it never grows past that one commit |
| The token | Sits in your repository's secrets | Sent only to `api.github.com` and `github.com`, never written to a log |
| Dependencies | None at runtime | Standard library only, nothing to resolve or audit |
| This repo leaking data | No data belonging to anyone is in this repository | A prose gate and a secrets scan run on every commit in CI |
| Your badge | Shields fetches a public raw file from your storage branch | The file carries counts only, no identity in it |

## Local check

Once published, the same script prints the numbers for any repository your token can read traffic on, and writes nothing.

| Command | What it prints |
| --- | --- |
| `pipx run clonometer owner/name` | `clones: 123 (14d), 50,123 (all-time), since 2026-09-17` |
| `npx clonometer owner/name` | The same, through the npm launcher |

## How it compares

| | Copy-paste workflow templates | Central stats repositories | Registry download badges | clonometer |
| --- | --- | --- | --- | --- |
| Lifetime count | No, 14 days only | Yes | No | Yes |
| One line in a workflow | No, paste the workflow yourself | No | Yes | Yes |
| Data lives with the repo | Yes | No | No | Yes |
| Badge shape is yours | No | No | No | Yes |
| Needs an extra repo or gist | No | Yes | No | No |
| Counts views too | No | Sometimes | No | Yes |

Prior art: [MShawon/github-clone-count-badge](https://github.com/MShawon/github-clone-count-badge) copies clones into a gist with a workflow template, and [jgehrcke/github-repo-stats](https://github.com/jgehrcke/github-repo-stats) reports into a central stats repository.

## Limits

- Counting starts the day you enable it, plus the 14 days GitHub still had; nothing older is recoverable.
- Clones include bots and CI.
- Uniques are per day and never added up.
- A private repo keeps counting, but the badge renders only once the repo is public.
- A PAT is required because a workflow token cannot read traffic.
- Run it daily; anything past 13 days loses rows.

## For agents

| Key | Type | Meaning |
| --- | --- | --- |
| `schema` | int | Always `1` |
| `repo` | string | `owner/name` the numbers belong to |
| `metric` | string | `clones` or `views` |
| `since` | date | The day the ledger started, UTC |
| `updated` | date | The day this file was written, UTC |
| `window.days` | int | Always `14`, the size of GitHub's window |
| `window.count` | int | GitHub's own count for the window |
| `window.uniques` | int | GitHub's own uniques for the window |
| `last7` | int | Sum of the ledger's counts over the last seven days |
| `last7_short` | string | `last7` in the short form |
| `total` | int | Sum of every day's count in the ledger |
| `total_short` | string | `total` as `1,234`, `12.3k` or `1.2M` |
| `window_short` | string | `window.count` in the same short form |
| `badge` | string | Seven days, a bullet, all time, in short form, ready for one badge |

Ledger, one per metric beside its numbers file (the views pair appears only when views are on):

```json
{"schema": 1, "repo": "owner/name", "since": "2026-09-17", "days": {"2026-09-17": {"count": 12, "uniques": 9}}}
```

Merge: each day's fields become the larger of the ledger's value and the new one, no day is ever removed. Guard: a lifetime total below the previous run's is refused and nothing is written.

```
clonometer OWNER/NAME [--write DIR] [--branch badges] [--metrics clones|clones,views]
```

| Variable or exit | Meaning |
| --- | --- |
| `CLONOMETER_TOKEN` | The token; `GITHUB_TOKEN` is read when it is unset |
| `CLONOMETER_API` | API root override for tests, default `https://api.github.com` |
| exit `0` | Numbers printed, or files written |
| exit `1` | One line on stderr, nothing written |

What CI runs and the test plan a change must satisfy: [CONTRIBUTING](.github/CONTRIBUTING.md).
