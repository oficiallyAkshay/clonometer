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

**The CLI contract, in brief.**

```
clonometer OWNER/NAME [--write DIR] [--branch BRANCH] [--metrics clones|clones,views]
```

Without `--write`, the run is read only: it prints one line per metric to
stdout and writes nothing. With `--write DIR`, it computes everything first,
then writes the numbers file and the ledger file, or nothing at all if
anything fails. clonometer publishes numbers, never a badge; the label,
colour, style and logo are the consumer's own shields dynamic JSON recipe
over the numbers file. The token comes from `CLONOMETER_TOKEN`, falling back
to `GITHUB_TOKEN`. Exit code 0 on success, exit 1 with one plain line on
stderr on any failure.

Tests point the script at a fake server through the `CLONOMETER_API`
environment variable, never at the real API.

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
the secret `TRAFFIC_TOKEN`.
