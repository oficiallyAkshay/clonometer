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
