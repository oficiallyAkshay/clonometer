<h1 align="center">📈 clonometer</h1>

<p align="center">
  <b>GitHub forgets your clones after 14 days. clonometer does not.</b>
  <br>
  A lifetime clone count for any repository, in a JSON file you can badge any way you like.
</p>

<p align="center">
  <a href=".github/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/oficiallyAkshay/clonometer/ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://codecov.io/gh/oficiallyAkshay/clonometer"><img alt="coverage" src="https://img.shields.io/codecov/c/github/oficiallyAkshay/clonometer?logo=codecov&logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/license-MIT-2f6f4e?logo=opensourceinitiative&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="Python 3.11 or newer" src="https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="zero runtime dependencies" src="https://img.shields.io/badge/dependencies-0-2f6f4e?logo=python&logoColor=white"></a>
</p>

<p align="center">
  <a href="#limits"><img alt="clones of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a>
  <a href="#limits"><img alt="views of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a>
</p>

<!-- once published, add: https://img.shields.io/npm/dm/clonometer?logo=npm&logoColor=white and https://img.shields.io/pypi/dm/clonometer?logo=pypi&logoColor=white -->

<p align="center"><img alt="A conveyor belt of GitHub's 14-day clone window: a new day rises in on the right every two seconds, the belt slides left, the oldest day tips off the left edge, and its count travels down to a running all-time total that ticks up and pulses" src="assets/loop.svg" width="900"></p>

<p align="center">
  <b><a href="https://github.com/oficiallyAkshay/clonometer/blob/badges/clones.json">See this repository's own numbers file</a></b>
</p>

GitHub only remembers the last 14 days of clone traffic, then the number is gone. clonometer samples that window once a day and keeps the total forever.

```bash
mkdir -p .github/workflows && curl -fsSL https://raw.githubusercontent.com/oficiallyAkshay/clonometer/main/.github/consumer-workflow.yml | sed "s|<sha>|$(git ls-remote https://github.com/oficiallyAkshay/clonometer.git HEAD | cut -c1-40)|" > .github/workflows/clonometer.yml
```

One line writes [the workflow](.github/consumer-workflow.yml), pinned to the current commit. Add the token from the table below, run it once, pick a badge.

## Features

| Feature | What it means |
| --- | --- |
| **Honest numbers** | Never goes down, uniques are never summed across days |
| **Your badge, your way** | Label, colour, style and logo are yours; clonometer ships numbers |
| **Stored on your repo** | The ledger lives on a branch of your own repository, no other repo; a private one can mirror its numbers to a gist for the badge |
| **Views too** | One input adds page views beside clones |

## Badges

Live from this repository's own numbers file. Click one for its recipe.

<p align="center">
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"><img alt="Clones, seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"><img alt="Views, the same" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"><img alt="All time only" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"><img alt="Last seven days only" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&style=for-the-badge&logo=github"><img alt="Any style shields has" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&style=for-the-badge&logo=github"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&color=6f42c1&logo=github&logoColor=white"><img alt="Any colour" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&color=6f42c1&logo=github&logoColor=white"></a>
</p>

```
https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/OWNER/REPO/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white
```

Swap clones for views, point the query at any key in the file, and add any style or colour shields offers.

A private repository sets the gist input and points the badge at the gist instead, since shields cannot read a private branch:

```
https://img.shields.io/badge/dynamic/json?url=https://gist.githubusercontent.com/OWNER/GIST_ID/raw/clones.json&query=$.badge&label=clones&logo=github&logoColor=white
```

## Configuration and security

| Input | Default | Meaning |
| --- | --- | --- |
| `token` | required | A [fine-grained token](https://github.com/settings/personal-access-tokens/new) for this repository only, Administration read and Contents write, stored as the Actions secret TRAFFIC_TOKEN |
| `branch` | `badges` | Storage branch, always one commit, never your default branch |
| `metrics` | `clones` | `clones` or `clones,views` |
| `gist` | off | Id of a gist to mirror the numbers files into, for a private repository; the ledger stays on the branch. Make the gist secret, since the numbers file carries the repository name |
| `gist_token` | `token` | A [classic token](https://github.com/settings/tokens/new?scopes=gist&description=clonometer%20gist) with only the gist scope, stored as the Actions secret GIST_TOKEN; a fine-grained token cannot write a gist |

### What leaves your machine

| What | Where it goes | The guard |
| --- | --- | --- |
| The token | Up to two requests to the GitHub API per metric, traffic and the ledger read, plus one gist PATCH when the gist input is set, plus one push to your own repository | Never in a URL or a log; redirects and plain http refused |
| The numbers | One commit on your storage branch, force pushed | Your default branch is refused |
| The gist token | One PATCH to the gist you name, numbers files only, never the ledger | Off unless the gist input is set; never in a URL or a log |
| Nothing else | No dependencies, no telemetry, no identity in the files | Standard library only; a secrets scan and a prose gate on every commit |

## How it compares

| | [github-clone-count-badge](https://github.com/MShawon/github-clone-count-badge) | [github-repo-stats](https://github.com/jgehrcke/github-repo-stats) | clonometer |
| --- | --- | --- | --- |
| Lifetime count | Yes | Yes | Yes |
| One line in a workflow | No, paste its workflow | Yes | Yes |
| Where the data lives | A gist | A data branch of whichever repository runs it, this one by default | A branch of this repository |
| What you get | One badge | Reports and charts | Numbers files, any badge |
| Counts views too | No | Yes | Yes |
| Token needs | Traffic, plus gist write | Traffic, plus push to the repository that runs it | Traffic, plus push to this repository; gist write only if you mirror |

## Limits

- Counting starts the day you enable it, plus the 14 days GitHub still had.
- Clones include bots and CI: a repository whose scheduled job checks itself out every two days showed 7 clones and 1 unique in 15 days. GitHub's figures arrive a day late; a day GitHub later revises down keeps its highest sample.
- Uniques are per day and never added up.
- A private repository keeps counting; its badge renders once it is public, or right away through the gist input.
- Run it daily with the concurrency group kept, since a gap past 13 days loses rows, and read the commit the install line pins before trusting it.
- GitHub disables a scheduled workflow on a public repository after 60 days with no commit to the repository; any commit, on any branch, resets that clock.
- Every run of the action fetches this repository with git, so clonometer's own clone count measures runs of the action as much as people cloning it; uniques barely move, since runners share addresses. That fetch needs no token of yours and works from a private repository, as long as clonometer itself stays public.
