<h1 align="center">📈 clonometer</h1>

<p align="center">
  <b>GitHub keeps your clone count for 14 days. clonometer keeps it for good.</b>
</p>

<p align="center">
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

clonometer samples GitHub's clone count every day and keeps a lifetime ledger on a branch of your own repository. It writes a numbers file that any badge can read.

Add [the workflow](.github/consumer-workflow.yml) to your repository pinned to a commit, store a token as `TRAFFIC_TOKEN`, run it once.

## Features

- 🔢 **Honest numbers.** Never goes down, uniques are never summed across days.
- 🎨 **Your badge, your way.** Label, colour, style and logo are yours, clonometer ships the numbers.
- 🗄️ **Stored on your repo.** The ledger lives on a branch of your own repository, no other repo.
- 👀 **Views too.** One input adds page views beside clones.
- 🔒 **Private repositories work.** The gist mirror publishes a public numbers file for a badge to read.

## Badges

Live from this repository's own numbers file. The recommended shape is seven days alongside all time, shown first. Click a badge for its recipe.

<p align="center">
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"><img alt="Clones, seven days and all time, recommended" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"><img alt="Views, seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"><img alt="Clones, all time only" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"><img alt="Clones, seven days only" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"></a>
  <a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.window_short&label=clones&suffix=%20(github%2014d)&logo=github&logoColor=white"><img alt="GitHub's own 14-day window count" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.window_short&label=clones&suffix=%20(github%2014d)&logo=github&logoColor=white"></a>
</p>

## Configuration

- **Metrics.** Count clones alone, or clones and views together.
- **Branch.** Any branch name holds the ledger, except your default branch.
- **Gist.** A private repository needs its numbers mirrored to a public gist before a badge can read them.

## Security

**Needs.** One fine-grained token scoped to this repository, with Administration read and Contents write. Optionally, a classic token with only the gist scope.

**Does.** Reads the traffic endpoints, pushes one commit to your storage branch, and PATCHes your gist if you set one. The token travels only as a header, never in a URL, a config file or a log.

**Never.** No third-party service, no telemetry, no other repository, no dependencies. Refuses plain http, redirects, your default branch and symlinks.

**Check.** A pinned commit, tests at 100 percent coverage, and the gates in CONTRIBUTING.

## How it compares

| | clonometer | [MShawon/github-clone-count-badge](https://github.com/MShawon/github-clone-count-badge) | [jgehrcke/github-repo-stats](https://github.com/jgehrcke/github-repo-stats) |
| --- | --- | --- | --- |
| Lifetime clone count | Yes | Yes | Yes |
| Lifetime view count | Yes | No | Yes |
| One line in a workflow | Yes | No, paste its workflow | Yes |
| Approach | A branch of your repository | A gist | A data branch of the repository that runs it |
| What you get | A numbers file, any badge | One clone count badge, fixed | Reports and charts |
| Token needs | One token on your repository | Traffic plus a gist token | Traffic plus push |

## Limits

- Counting starts the day you enable it, plus the 14 days GitHub still had.
- Figures arrive a day late and include bots and CI, runner fetches of this action included.
- A private repository counts, but its badge needs the gist mirror.
- Scheduled workflows stop after 60 days without a commit, and a gap past 13 days loses rows.
