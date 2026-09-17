# Handoff (throwaway)

Where work on this repo stopped on 2026-09-17 and what is next, collected from several build sessions. The newest entry wins where two disagree. Delete this file once the items are picked up; it is not documentation.

## clonometer (written by the clonometer build session, 2026-09-17)

### State
- Repo public at github.com/oficiallyAkshay/clonometer, 19 PRs merged, no open PRs, CI green, no tags, one no-reply identity in history. Local clone `clonometer`, worktrees under `.claude/worktrees/`.
- Shipped: stdlib script with ledger, guard, numbers file (`badge` line, `last7`, `total`), composite action with self-fetch (every consumer run git-fetches clonometer, proven public and private), dogfood workflow on `@main`, npm launcher and dispatch-only release workflow (packages unpublished), README in readmerlin shape with animated belt hero, hardening from a four-lens audit, CI with cached pre-commit, grouped Dependabot, release environment with required reviewer, Dependabot alerts and security updates on.
- Secrets: `TRAFFIC_TOKEN` on clonometer only. gh token has the workflow scope (device flow done in Chrome after the owner enabled 2FA); the git credential helper still holds an old token, so push workflow files with `git -c credential.helper= -c "http.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$(gh auth token)" | base64 | tr -d '\n')" push ...`.
- Consumers: a private consumer repo (private) pinned at 19f86181bc44921ed63cce81719515744303d172 and proven. Boomerang, pierless, readmerlin not yet adopted (owner said no boomerang work in that session).

### What's left
1. Gist mirror for private repos (owner asked twice). A builder stalled with `clonometer.py` and `tests/test_clonometer.py` changed but uncommitted in `.claude/worktrees/gist` (branch `claude/gist`, about 290 lines: `--gist ID` flag, PATCH `/gists/{id}` with the numbers files only, `CLONOMETER_GIST_TOKEN` fallback to the main token, id validation, one-line failures naming the gist scope of a classic token). Still missing: action inputs `gist` and `gist_token` with env plumbing and `--gist` passed only when set, a summary line, action tests with a fake PATCH handler, README settings rows, Limits line, gist badge recipe (`gist.githubusercontent.com/OWNER/ID/raw/clones.json`), CONTRIBUTING lines. Then verifier, merge.
2. Hero still frame: the belt's resting transform (`translate(BELT_LEFT 0)` on `belt-strip` in `scripts/draw_loop.py`) does not equal the animation's first frame, so non-animating viewers (PyPI, npm, maybe GitHub) see 13 boxes and a gap. Make the base state equal frame 0, rerun `scripts/draw_loop.py`, keep the rebuild test green.
3. Unverified: whether GitHub's README plays the SMIL animation. In the build session's Chrome capture no SVG animated inside an `<img>`, even a trivial one, while the same file animated as a document. Owner should look at the README in their own browser; if still, the still frame is the product and the loop is a bonus.
4. Closing report to the owner.
5. Owner steps: PyPI pending publisher and first manual npm publish, then dispatch `release.yml`; social preview upload (`~/Downloads`-adjacent PNG was sent in chat, regenerate with `qlmanage -t -s 1280` from `assets/social-preview.svg`); Marketplace listing needs a tag; readmerlin should add an allowance for a `## Badges` section (six known badges-in-hero fails) and stop warning about the agent section.

### Learnings (clonometer-specific)
- A composite action's `github.action_repository` and `github.action_ref` on a nested `uses:` step name the nested action; read them through a bash step's `env:` and fetch with plain git. Prove such claims with the live run; the first attempt passed every test and failed live.
- GitHub traffic: rows arrive a day late; private repos record clones; runner checkouts count as clones; views on private repos read zero; `uses:` tarballs never count.
- Shields dynamic JSON badges read a numbers file; a `badge` string field gives "N (7d) • M (all-time)" in one badge; anything else is the consumer's URL.
- Ponytail twice (code, then docs). A four-lens audit after v1 found a real data-loss path (metric toggle wiped a ledger) and a symlink-follow in the new preserve logic; both had passed tests.



---

## clonometer (from the pierless session)

### What's left
- pierless has not adopted clonometer. See pierless item 9: decide whether the clones source in pierless's installs badge comes from clonometer's ledger instead of the raw 14-day window. If yes, pierless needs `TRAFFIC_TOKEN` with Contents write as well as Administration read, per clonometer's owner steps.



---

## clonometer (from the hero skill session, one addition)

- The local clone's main is 6 commits behind origin. Pull before starting any new worktree there. Everything else is in the clonometer session's entry at the top.



---

## Owner steps (from the cross-repo checklist)

| Repo | Step only the owner can do |
|---|---|
| clonometer | PyPI pending publisher; first `npm publish`; dispatch release; social preview; look at the README hero in your own browser |

---

## clonometer (from the session that set up its first outside consumer, 2026-09-17)

Only what the entries above do not already say.

### What this adds to "What's left"

1. The gist mirror in item 1 has a working reference. The private consumer already runs it as a step after the action: read `clones.json` off the storage branch with the workflow token (job `permissions: contents: read`), then `gh api -X PATCH gists/ID -F "files[clones.json][content]=@file"` with a classic token that has the gist scope. Fine-grained tokens cannot write gists, so the docs must ask for a classic one. When the flag ships, that consumer swaps its step for the action input and keeps its gist and its secret.
2. Check on 2026-09-18 or later that this repository's own `clones.json` rose by the consumer fetches. It read zero at write time, which is legitimate because traffic arrives a day late. This is the only proof that the self-fetch does what it was built for. If the number did not move, a depth-one fetch is not counted and the approach needs rethinking.
3. README Limits: "the badge renders once it is public" stops being the whole story when the gist path lands. A measured example for "CI checkouts count": a repository whose scheduled job checks itself out every two days showed 7 clones and 1 unique in 15 days.
4. The consumer is pinned at 19f86181. The commits after it add a fail-fast guard on the fetch and change nothing for a working consumer, so a re-pin can wait.

### Decisions that should not be reopened

- Consumer runs count as clones through the self-fetch. The owner rejected the dependents page as the counter, and rejected turning this into a package to get download counts.
- This repository must stay public for the self-fetch. A private one would force every consumer to hold a second token.

### Learnings

- Shields cannot read a private repository's raw file and shows "not found". The options are a gist mirror, a relative SVG committed on the default branch, or a plain link to the numbers file. The owner picked the gist.
- The dependents page lists public repositories that use the action and never shows private ones.
- A second repository consuming the action surfaced three gaps in one afternoon that the tests and the dogfood run never did: consumer runs were uncounted, private badges broke, and the action context named the wrong repository.
