# AGENTS.md

clonometer is a GitHub composite Action: one Python script, standard
library only, no runtime dependencies.

| Path | What it holds |
| --- | --- |
| `clonometer.py` | The whole runtime: fetch, ledger merge, the numbers file, the CLI |
| `action.yml` | The composite action: three bash steps, fetch, count and publish |
| `tests/` | pytest, fake HTTP, fake ledger, fake git |
| `scripts/` | The hero drawing script |
| `.github/workflows/` | CI gates and the dogfood workflow |
| `SECURITY.md` | How to report a vulnerability, and what the token's blast radius is |

Reference: [CONTRIBUTING](.github/CONTRIBUTING.md) holds the consumer
workflow, the numbers file and CLI reference, what CI runs, the test
plan and the git rules, read in full alongside this file.

Three hard rules: standard library only at runtime, no em dashes
anywhere including code comments, one change per pull request.

Facts that are easy to get wrong:

- GitHub's traffic API shows the previous UTC day as its newest row, so every count lags about one day, and a repository's first run can write zeros.
- A runner downloads a `uses:` action as a tarball, which traffic never counts as a clone. The first step of `action.yml` fetches this repository with git so each run is a clone; keep that step.
- Short forms are exact below 10,000 (`1,000`), then one decimal with `k` or `M`, and a trailing `.0` is dropped (10000 renders `10k`). `short()` in `clonometer.py` is the one place that decides it.
- A token needs the `workflow` scope to push a change under `.github/workflows`; `gh repo create --push` fails on workflow files, so push those with git.
