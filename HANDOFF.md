# Handoff for clonometer, 2026-09-17

Throwaway. Lives on this branch only, never on main. Written by more than one session; where two sections disagree, the later one wins. Delete the branch once the work below is done.

---

## clonometer (written by the clonometer build session, 2026-09-17)

### State
- Repo public at github.com/oficiallyAkshay/clonometer, 19 PRs merged, no open PRs, CI green, no tags, one no-reply identity in history. Local clone `~/Desktop/GitHub Repos/ProjectAstraGitOnPersonal/clonometer`, worktrees under `.claude/worktrees/`.
- Shipped: stdlib script with ledger, guard, numbers file (`badge` line, `last7`, `total`), composite action with self-fetch (every consumer run git-fetches clonometer, proven public and private), dogfood workflow on `@main`, npm launcher and dispatch-only release workflow (packages unpublished), README in readmerlin shape with animated belt hero, hardening from a four-lens audit, CI with cached pre-commit, grouped Dependabot, release environment with required reviewer, Dependabot alerts and security updates on.
- Secrets: `TRAFFIC_TOKEN` on clonometer only. gh token has the workflow scope (device flow done in Chrome after the owner enabled 2FA); the git credential helper still holds an old token, so push workflow files with `git -c credential.helper= -c "http.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$(gh auth token)" | base64 | tr -d '\n')" push ...`.
- Consumers: USPatentTracker (private) pinned at 19f86181bc44921ed63cce81719515744303d172 and proven. Boomerang, pierless, readmerlin not yet adopted (owner said no boomerang work in that session).

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
