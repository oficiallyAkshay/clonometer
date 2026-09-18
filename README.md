<h1 align="center">📈 clonometer</h1>

<p align="center">
  <b>GitHub keeps your clone count for 14 days. clonometer keeps it for good.</b>
</p>

<p align="center"><img alt="A conveyor belt of GitHub's 14-day clone window: a new day rises in on the right every two seconds, the belt slides left, the oldest day tips off the left edge, and its count travels down to a running all-time total that ticks up and pulses" src="assets/loop.svg" width="900"></p>

<p align="center">
  <a href="https://codecov.io/gh/oficiallyAkshay/clonometer"><img alt="coverage" src="https://img.shields.io/codecov/c/github/oficiallyAkshay/clonometer?logo=codecov&logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/license-MIT-2f6f4e?logo=opensourceinitiative&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="Python 3.11 or newer" src="https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white"></a>
  <a href="pyproject.toml"><img alt="zero runtime dependencies" src="https://img.shields.io/badge/dependencies-0-2f6f4e?logo=python&logoColor=white"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/oficiallyAkshay/clonometer"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/oficiallyAkshay/clonometer/badge"></a>
</p>

<p align="center">
  <a href="#callouts"><img alt="clones of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a>
  <a href="#callouts"><img alt="views of this repository, last seven days and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a>
</p>

<!-- once published, add: https://img.shields.io/npm/dm/clonometer?logo=npm&logoColor=white and https://img.shields.io/pypi/dm/clonometer?logo=pypi&logoColor=white -->

clonometer samples GitHub's clone count every day and keeps a lifetime ledger on a branch of your repository, or mirrored to a gist for a private one. It writes a numbers file that any badge can read.

Install: store a fine-grained token as `TRAFFIC_TOKEN` and add `oficiallyAkshay/clonometer` as a step in a daily workflow, pinned to a commit.

## Features

- 🗄️ **Stored on your repo.** The ledger lives on a branch of your own repository, no other repo.
- 👀 **Views too.** One input adds page views beside clones.
- 🔒 **Private repositories work.** The gist mirror publishes a public numbers file for a badge to read.
- 🎨 **Your badge, your way.** Label, colour, style and logo are yours, clonometer ships the numbers.

## Badges

Click a badge for its recipe; Both is the recommended shape.

<table width="100%">
  <tr>
    <th></th>
    <th align="center">This week</th>
    <th align="center">All time</th>
    <th align="center">Both</th>
  </tr>
  <tr>
    <th align="left">Clones</th>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"><img alt="Clones, this week" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.last7_short&label=clones&suffix=%20this%20week&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"><img alt="Clones, all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"><img alt="Clones, this week and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"></a></td>
  </tr>
  <tr>
    <th align="left">Views</th>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.last7_short&label=views&suffix=%20this%20week&logo=github&logoColor=white"><img alt="Views, this week" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.last7_short&label=views&suffix=%20this%20week&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.total_short&label=views&suffix=%20all-time&logo=github&logoColor=white"><img alt="Views, all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.total_short&label=views&suffix=%20all-time&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"><img alt="Views, this week and all time" src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"></a></td>
  </tr>
</table>

## Security

clonometer needs one fine-grained token scoped to your repository, Administration read and Contents write, and sends it only as a request header.

- ❌ contacts a third-party service
- ❌ sends telemetry
- ❌ touches another repository
- ❌ touches your default branch
- ❌ follows a redirect or plain http
- ❌ follows a symlink
- ❌ adds a dependency

## How it compares

| | [oficiallyAkshay/clonometer](https://github.com/oficiallyAkshay/clonometer) | [MShawon/github-clone-count-badge](https://github.com/MShawon/github-clone-count-badge) | [jgehrcke/github-repo-stats](https://github.com/jgehrcke/github-repo-stats) |
| --- | --- | --- | --- |
| Lifetime clone count | ✅ | ✅ | ✅ |
| Lifetime view count | ✅ | ❌ | ✅ |
| Installation | Action | Copy its workflow | Action |
| Storage | Branch or gist | Gist | Branch |
| Output | Numbers file | One badge | Reports |
| Token | Traffic read, contents write | Traffic read, gist write | Traffic read, contents write |

## Callouts

- Counting starts on the day you install it.
- Expect up to a day of delay.
- Counts include bots and CI, this action's own runs included.
- A private repository's badge works through the gist only.
- Scheduled workflows pause after 60 days without a commit, and a gap past 13 days loses rows.
