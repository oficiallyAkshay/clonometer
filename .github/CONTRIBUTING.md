# Contributing

clonometer stays a small, honest counter. Scope stays small on purpose.

## What we want

- **Bug fixes**, with a test that fails before the fix and passes after.
- **Consumer workflow fixes**, when the quick start no longer matches what the action needs.
- **Documentation clarifications**, when a setting or a number is unclear.

## What we decline

New subcommands, a config file format, or anything that turns this into a
dashboard. A runtime dependency, however small. Personal data in a test
fixture or an example. A feature that only one repository needs belongs in
that repository's own workflow, not in this action.

## Three hard rules

1. Standard library only at runtime, no exceptions.
2. No em dashes anywhere, code comments included.
3. One change per pull request, titled as a plain sentence stating the
   outcome: "The ledger keeps the newest partial day at its larger count".

## Run it

```bash
uv sync --all-extras
uv run pre-commit install
uv run pytest
```

## For agents

The layout.

| Path | What it holds |
| --- | --- |
| `clonometer.py` | The whole runtime: fetch, ledger merge, the numbers file, the CLI |
| `action.yml` | The composite action: one python3 step, one publish step |
| `tests/` | pytest, fake HTTP, fake ledger, fake git |
| `scripts/` | The prose gate |
| `.github/workflows/` | CI gates and the dogfood workflow |
| `assets/` | The emoji icon and the social preview image |

**The numbers file and the CLI.**

| Key | Type | Meaning |
| --- | --- | --- |
| `schema` | int | Always `1` |
| `repo` | string | `owner/name` the numbers belong to |
| `metric` | string | `clones` or `views` |
| `since` | date | The earliest day in the ledger, UTC |
| `updated` | date | The day this file was written, UTC |
| `window.days` | int | Always `14`, the size of GitHub's window |
| `window.count` | int | GitHub's own count for the window, as reported this run |
| `window.uniques` | int | GitHub's own uniques for the window |
| `last7`, `last7_short` | int, string | Sum of the ledger's counts over the last seven days, so it never goes down, and its short form |
| `total`, `total_short` | int, string | Sum of every day's count in the ledger, and its short form: `1,234`, `12.3k`, `1.2M` |
| `window_short` | string | `window.count` in the same short form |
| `badge` | string | Seven days, a bullet, all time, in short form, ready for one badge |

| File on the storage branch | Holds |
| --- | --- |
| `clones.json`, `clones-ledger.json` | The numbers file above and its ledger |
| `views.json`, `views-ledger.json` | The same for views, when views are on |

```json
{"schema": 1, "repo": "owner/name", "since": "2026-09-17", "days": {"2026-09-17": {"count": 12, "uniques": 9}}}
```

Merge: each day's fields become the larger of the ledger's value and the new one, no day is ever removed. Guard: a lifetime total below the previous run's is refused and nothing is written.

```
clonometer OWNER/NAME [--write DIR] [--branch badges] [--metrics clones|clones,views] [--gist ID]
uvx --from git+https://github.com/oficiallyAkshay/clonometer clonometer owner/name
```

| Variable or exit | Meaning |
| --- | --- |
| `CLONOMETER_TOKEN` | The token; `GITHUB_TOKEN` is read when it is unset and can never work |
| `CLONOMETER_API` | API root override for tests, https only, default `https://api.github.com` |
| `CLONOMETER_GIST_TOKEN` | The classic token with the gist scope that `--gist` uses; the main token is used when it is unset |
| exit `0` or `1` | Numbers printed or files written, read-only without `--write`; or one line on stderr and nothing written |

Gist: with --gist, write mode PATCHes the numbers files, never the ledgers, into that gist after the files are on disk; a 401, 403 or 404 there names the gist scope of a classic token.

**What CI runs.**

| Check | Runs on | Blocks merge |
| --- | --- | --- |
| pre-commit hooks, gitleaks skipped | `checks` | yes |
| secrets scan over the whole history | `checks` | yes |
| dependency audit | `checks` | yes |
| pytest with coverage | `test`, on 3.11 and 3.13 | yes |
| diff coverage at 90 percent | `test`, pull requests only | yes |
| coverage upload | `test`, on 3.13 only | no |
| gate | `ci` | yes |

**Test plan a change must satisfy.**

| Area | What a change there must prove |
| --- | --- |
| `clonometer.py` | The merge rule, the totals, the guard and both CLI modes are covered by a test that fails without the change |
| `action.yml` | The end-to-end test still runs the script step against a fake API and a throwaway bare repository, and the branch holds exactly one commit afterward |
| Docs | Every URL and relative link the README and this file name resolves, and the prose gate stays green |

**Git.**

- One branch per pull request, under `.claude/worktrees/<name>`, branch
  `claude/<name>`.
- Never commit to main.
- Never `git add -A`.
- Plain-sentence titles.
- Merges are rebases.
- History stays under the `oficiallyAkshay <186180952+oficiallyAkshay@users.noreply.github.com>`
  identity.

**The token.** Traffic reads need a fine-grained PAT scoped to Administration
read and Contents write on that repository only, with an expiry, stored as
the secret `TRAFFIC_TOKEN`. The gist mirror needs a second, classic token with only the `gist` scope, stored as `GIST_TOKEN`; a fine-grained token cannot write a gist.
