"""Tests for action.yml, clonometer's composite action.

The static tests parse action.yml with pyyaml and check its shape: the five
inputs, the composite `using`, and the three bash steps named `fetch`, `count`
and `publish`.

The end to end tests run those two steps' `run` bodies exactly as written,
straight out of action.yml, as plain bash subprocesses. Nothing here talks to
the real network: CLONOMETER_API points the count step at a fake GitHub API
served on 127.0.0.1 by a background thread, and CLONOMETER_REMOTE points the
publish step's push at a throwaway bare repository on disk. The fake API's
traffic endpoints answer from canned rows a test sets up, and its contents
endpoint answers by running `git show <ref>:<file>` against that same bare
repository, which is exactly what a real GitHub Enterprise or GitHub.com
contents API is standing in for here. Its gists endpoint records every PATCH
it receives so a test can check what the gist mirror sent.
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
ACTION_FILE = ROOT / "action.yml"
BOT_AUTHOR = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
TOKEN = "a-fine-grained-token-that-must-never-leak"  # noqa: S105 -- fake test fixture, not a real secret
GIST_TOKEN = "a-classic-gist-token-that-must-never-leak"  # noqa: S105 -- fake test fixture, not a real secret
GIST_ID = "0123456789abcdef0123456789abcdef"
REPO = "octo-owner/octo-repo"
GIT = shutil.which("git") or "git"
BASH = shutil.which("bash") or "bash"


def _load_action() -> dict:
    return yaml.safe_load(ACTION_FILE.read_text(encoding="utf-8"))


def _steps() -> list[dict]:
    return _load_action()["runs"]["steps"]


def _step(name: str) -> dict:
    return next(step for step in _steps() if step["name"] == name)


def _git(*args: str, **kwargs) -> subprocess.CompletedProcess:
    """Run git at its resolved full path; every argument here is a literal this file chose."""
    check = kwargs.pop("check", False)
    return subprocess.run(  # noqa: S603 -- static args, never external input
        [GIT, *args], check=check, **kwargs
    )


# --------------------------------------------------------------------------
# action.yml, read statically
# --------------------------------------------------------------------------


def test_action_yml_parses_and_declares_exactly_the_five_inputs() -> None:
    inputs = _load_action()["inputs"]
    assert set(inputs.keys()) == {"token", "branch", "metrics", "gist", "gist_token"}
    assert inputs["token"]["required"] is True
    assert "default" not in inputs["token"]
    assert inputs["branch"]["default"] == "badges"
    assert inputs["metrics"]["default"] == "clones"
    for name in ("gist", "gist_token"):
        assert inputs[name]["required"] is False
        assert inputs[name]["default"] == ""


def test_action_yml_is_a_composite_action() -> None:
    assert _load_action()["runs"]["using"] == "composite"


def test_action_yml_has_three_bash_steps_fetch_count_publish() -> None:
    steps = _steps()
    assert [step["name"] for step in steps] == ["fetch", "count", "publish"]
    assert all(step["shell"] == "bash" for step in steps)


def test_the_fetch_step_reads_the_action_context_through_env_and_uses_no_token() -> None:
    """The fetch is what makes a consumer run count as a clone of this repository."""
    fetch = _step("fetch")
    assert fetch["env"]["CLONOMETER_ACTION_REPOSITORY"] == "${{ github.action_repository }}"
    assert fetch["env"]["CLONOMETER_ACTION_REF"] == "${{ github.action_ref }}"
    assert fetch["env"]["CLONOMETER_SERVER"] == "${{ github.server_url }}"
    assert fetch["env"]["GIT_TERMINAL_PROMPT"] == "0"
    assert "uses" not in fetch
    assert "token" not in fetch["run"].lower()
    assert "--depth 1" in fetch["run"]


def _seed_action_repo(tmp_path: Path) -> tuple[Path, str]:
    """A bare repository standing in for clonometer's own, holding a marker script."""
    seed = tmp_path / "seed"
    _git("init", "--quiet", "-b", "main", str(seed), check=True)
    (seed / "clonometer.py").write_text(
        "import sys; print('ran from the fetched checkout'); sys.exit(0)\n", encoding="utf-8"
    )
    _git("-C", str(seed), "add", "clonometer.py", check=True)
    _git(
        "-C",
        str(seed),
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "seed",
        check=True,
    )
    server = tmp_path / "server"
    bare = server / "owner" / "clonometer.git"
    bare.parent.mkdir(parents=True)
    _git("clone", "--quiet", "--bare", str(seed), str(bare), check=True)
    sha = _git(
        "-C", str(seed), "rev-parse", "HEAD", capture_output=True, text=True, check=True
    ).stdout.strip()
    return server, sha


def test_the_fetch_step_clones_the_pinned_commit_of_the_action_repository(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    server, sha = _seed_action_repo(tmp_path)
    env = _first_run(tmp_path, bare_repo, fake_github)
    env.update(
        {
            "CLONOMETER_ACTION_REPOSITORY": "owner/clonometer",
            "CLONOMETER_ACTION_REF": sha,
            "CLONOMETER_SERVER": f"file://{server}",
        }
    )
    fetch = _run_step("fetch", env, tmp_path)
    assert fetch.returncode == 0, fetch.stderr
    assert (tmp_path / "runner-temp" / "clonometer-action" / "clonometer.py").is_file()
    assert f"at {sha}" in fetch.stdout
    assert TOKEN not in fetch.stdout + fetch.stderr


def test_the_fetch_step_does_nothing_for_a_local_action(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    env = _first_run(tmp_path, bare_repo, fake_github)
    env.update({"CLONOMETER_ACTION_REPOSITORY": ""})
    fetch = _run_step("fetch", env, tmp_path)
    assert fetch.returncode == 0, fetch.stderr
    assert "nothing to fetch" in fetch.stdout
    assert not (tmp_path / "runner-temp" / "clonometer-action").exists()


def test_the_fetch_step_lands_outside_the_consumer_workspace(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    """A later `git add -A` in the consumer's own workflow must never see this checkout."""
    server, sha = _seed_action_repo(tmp_path)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    env = _first_run(tmp_path, bare_repo, fake_github)
    env.update(
        {
            "GITHUB_WORKSPACE": str(workspace),
            "CLONOMETER_ACTION_REPOSITORY": "owner/clonometer",
            "CLONOMETER_ACTION_REF": sha,
            "CLONOMETER_SERVER": f"file://{server}",
        }
    )
    fetch = _run_step("fetch", env, tmp_path)
    assert fetch.returncode == 0, fetch.stderr
    assert not (workspace / ".clonometer").exists()
    assert list(workspace.iterdir()) == []


def test_the_count_step_runs_the_fetched_checkout_when_there_is_one(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    """The context, not where things happen to sit, decides which script runs."""
    env = _first_run(tmp_path, bare_repo, fake_github)
    action_dir = tmp_path / "runner-temp" / "clonometer-action"
    action_dir.mkdir(parents=True)
    (action_dir / "clonometer.py").write_text(
        "import sys; print('ran from the fetched checkout'); sys.exit(0)\n", encoding="utf-8"
    )
    env["CLONOMETER_ACTION_REPOSITORY"] = "owner/clonometer"
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr
    assert "ran from the fetched checkout" in count.stdout

    # A local `uses: ./` has no action repository: the fetched checkout is
    # ignored even though it is there, and the action's own script runs.
    env["CLONOMETER_ACTION_REPOSITORY"] = ""
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr
    assert "ran from the fetched checkout" not in count.stdout
    assert (tmp_path / "runner-temp" / "clonometer" / "clones.json").is_file()


def test_neither_step_body_contains_a_github_expression() -> None:
    """A `${{ }}` inside `run:` would mean the body cannot run outside the
    Actions runner, which is exactly what the tests below need it to do."""
    for step in _steps():
        if "run" in step:
            assert "${{" not in step["run"]


def test_count_step_calls_clonometer_with_write_branch_and_metrics() -> None:
    run = _step("count")["run"]
    assert "clonometer.py" in run
    assert "--write" in run
    assert "--branch" in run
    assert "--metrics" in run


def test_count_step_reads_both_gist_inputs_through_env_and_masks_the_gist_token() -> None:
    count = _step("count")
    assert count["env"]["CLONOMETER_GIST"] == "${{ inputs.gist }}"
    assert (
        count["env"]["CLONOMETER_GIST_TOKEN"] == "${{ inputs.gist_token }}"  # noqa: S105 -- a placeholder expression, not a secret value
    )
    assert "::add-mask::${CLONOMETER_GIST_TOKEN}" in count["run"]
    assert "--gist" in count["run"]


# --------------------------------------------------------------------------
# A fake GitHub API: traffic from canned rows, contents from a bare repo.
# --------------------------------------------------------------------------


class _FakeState:
    """What the fake server answers with, mutable between requests."""

    def __init__(self, repo: str, bare_repo: Path) -> None:
        self.repo = repo
        self.bare_repo = bare_repo
        self.force_403 = False
        # metric name -> (top-level count, top-level uniques, per day rows)
        self.traffic: dict[str, tuple[int, int, list[tuple[str, int, int]]]] = {}
        # What the gists endpoint answers with, and every PATCH it received:
        # (gist id, Authorization header, decoded JSON body).
        self.gist_status = 200
        self.gist_patches: list[tuple[str, str, dict]] = []

    def set_traffic(
        self, metric: str, count: int, uniques: int, rows: list[tuple[str, int, int]]
    ) -> None:
        self.traffic[metric] = (count, uniques, rows)


def _make_handler(state: _FakeState) -> type[http.server.BaseHTTPRequestHandler]:
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, _format: str, *args: object) -> None:
            pass  # the test output does not need an access log

        def _send_json(self, status: int, body: dict) -> None:
            payload = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            split = urlsplit(self.path)
            prefix = f"/repos/{state.repo}"

            if split.path.startswith(f"{prefix}/traffic/"):
                metric = split.path.rsplit("/", 1)[-1]
                if state.force_403 or metric not in state.traffic:
                    self._send_json(403, {"message": "Forbidden"})
                    return
                count, uniques, rows = state.traffic[metric]
                entries = [
                    {"timestamp": f"{date}T00:00:00Z", "count": c, "uniques": u}
                    for date, c, u in rows
                ]
                self._send_json(200, {"count": count, "uniques": uniques, metric: entries})
                return

            if split.path.startswith(f"{prefix}/contents/"):
                file_name = split.path[len(f"{prefix}/contents/") :]
                ref = parse_qs(split.query).get("ref", [""])[0]
                result = _git(
                    "-C", str(state.bare_repo), "show", f"{ref}:{file_name}", capture_output=True
                )
                if result.returncode != 0:
                    self._send_json(404, {"message": "Not Found"})
                    return
                content = base64.b64encode(result.stdout).decode("ascii")
                self._send_json(200, {"content": content, "encoding": "base64"})
                return

            self._send_json(404, {"message": "Not Found"})

        def do_PATCH(self) -> None:
            split = urlsplit(self.path)
            if not split.path.startswith("/gists/"):
                self._send_json(404, {"message": "Not Found"})
                return
            gist_id = split.path[len("/gists/") :]
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            state.gist_patches.append((gist_id, self.headers.get("Authorization", ""), body))
            if state.gist_status != 200:
                self._send_json(state.gist_status, {"message": "no"})
                return
            self._send_json(200, {"id": gist_id})

    return Handler


@pytest.fixture
def bare_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "remote.git"
    _git("init", "--quiet", "--bare", str(repo), check=True)
    return repo


@pytest.fixture
def fake_github(bare_repo: Path):
    state = _FakeState(REPO, bare_repo)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _make_handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state, f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join()


# --------------------------------------------------------------------------
# Running the two steps' bodies as plain bash, against the fakes above.
# --------------------------------------------------------------------------


def _run_step(name: str, env: dict[str, str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603 -- runs this file's own step body, never external input
        [BASH, "-c", _step(name)["run"]],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _env(
    *, api: str, out_dir: Path, branch: str, remote: Path, runner_temp: Path
) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        {
            "CLONOMETER_API": api,
            "CLONOMETER_TOKEN": TOKEN,
            "GITHUB_REPOSITORY": REPO,
            "GITHUB_ACTION_PATH": str(ROOT),
            "CLONOMETER_OUT": str(out_dir),
            "CLONOMETER_BRANCH": branch,
            "CLONOMETER_METRICS": "clones,views",
            "CLONOMETER_REMOTE": str(remote),
            "RUNNER_TEMP": str(runner_temp),
        }
    )
    return env


def _commit_count(repo: Path, ref: str) -> int:
    result = _git(
        "-C", str(repo), "rev-list", "--count", ref, capture_output=True, text=True, check=True
    )
    return int(result.stdout.strip())


def _tree_files(repo: Path, ref: str) -> set[str]:
    result = _git(
        "-C", str(repo), "ls-tree", "--name-only", ref, capture_output=True, text=True, check=True
    )
    return set(result.stdout.split())


def _show(repo: Path, ref: str, path: str) -> str:
    result = _git(
        "-C", str(repo), "show", f"{ref}:{path}", capture_output=True, text=True, check=True
    )
    return result.stdout


def _author(repo: Path, ref: str) -> str:
    result = _git(
        "-C",
        str(repo),
        "log",
        "-1",
        "--format=%an <%ae>",
        ref,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _refs(repo: Path) -> str:
    result = _git("-C", str(repo), "for-each-ref", capture_output=True, text=True, check=True)
    return result.stdout


EXPECTED_FILES = {"clones.json", "clones-ledger.json", "views.json", "views-ledger.json"}


def test_end_to_end_first_run_publishes_one_commit_with_the_four_files(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, api = fake_github
    state.set_traffic("clones", 12, 9, [("2026-09-16", 5, 4), ("2026-09-17", 7, 5)])
    state.set_traffic("views", 20, 15, [("2026-09-16", 9, 7), ("2026-09-17", 11, 8)])

    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir()
    env = _env(
        api=api,
        out_dir=runner_temp / "clonometer",
        branch="badges",
        remote=bare_repo,
        runner_temp=runner_temp,
    )

    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode == 0, publish.stderr

    assert _commit_count(bare_repo, "badges") == 1
    assert _tree_files(bare_repo, "badges") == EXPECTED_FILES
    assert _author(bare_repo, "badges") == BOT_AUTHOR

    config = _git(
        "-C", str(bare_repo), "config", "--list", capture_output=True, text=True, check=True
    ).stdout
    assert TOKEN not in config
    for name in EXPECTED_FILES:
        assert TOKEN not in _show(bare_repo, "badges", name)


def test_end_to_end_second_run_grows_the_ledger_and_still_leaves_one_commit(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, api = fake_github
    state.set_traffic("clones", 12, 9, [("2026-09-16", 5, 4), ("2026-09-17", 7, 5)])
    state.set_traffic("views", 20, 15, [("2026-09-16", 9, 7), ("2026-09-17", 11, 8)])

    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir()
    env = _env(
        api=api,
        out_dir=runner_temp / "clonometer",
        branch="badges",
        remote=bare_repo,
        runner_temp=runner_temp,
    )

    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    assert _commit_count(bare_repo, "badges") == 1

    # The day that was newest last run grows (a partial sample filling in),
    # and a new day appears. The window's top-level count is set to a value
    # that does not equal the sum of these rows, so a code path that summed
    # rows instead of reading the payload's own count would be caught.
    state.set_traffic(
        "clones",
        42,
        30,
        [("2026-09-16", 5, 4), ("2026-09-17", 15, 10), ("2026-09-18", 3, 2)],
    )
    state.set_traffic(
        "views",
        55,
        40,
        [("2026-09-16", 9, 7), ("2026-09-17", 20, 14), ("2026-09-18", 6, 4)],
    )

    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0

    assert _commit_count(bare_repo, "badges") == 1

    ledger = json.loads(_show(bare_repo, "badges", "clones-ledger.json"))
    assert ledger["days"]["2026-09-17"]["count"] == 15
    assert "2026-09-18" in ledger["days"]

    numbers = json.loads(_show(bare_repo, "badges", "clones.json"))
    assert numbers["total"] == sum(day["count"] for day in ledger["days"].values())
    assert numbers["window"]["count"] == 42


def test_end_to_end_a_403_from_traffic_leaves_the_branch_untouched(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, api = fake_github
    state.force_403 = True

    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir()
    env = _env(
        api=api,
        out_dir=runner_temp / "clonometer",
        branch="badges",
        remote=bare_repo,
        runner_temp=runner_temp,
    )

    count = _run_step("count", env, tmp_path)
    assert count.returncode == 1
    assert "Administration read" in count.stderr

    # A composite action stops after a failing step, so the test never runs
    # publish either, the same way a real workflow never would. The bare
    # repository should show no sign that anything ran at all.
    assert _refs(bare_repo) == ""


# --------------------------------------------------------------------------
# Hardening: what the publish step refuses, keeps and says.
# --------------------------------------------------------------------------


def _first_run(tmp_path: Path, bare_repo: Path, fake_github, **overrides: str) -> dict[str, str]:
    state, api = fake_github
    state.set_traffic("clones", 12, 9, [("2026-09-16", 5, 4), ("2026-09-17", 7, 5)])
    state.set_traffic("views", 20, 15, [("2026-09-16", 9, 7), ("2026-09-17", 11, 8)])
    runner_temp = tmp_path / "runner-temp"
    runner_temp.mkdir(exist_ok=True)
    env = _env(
        api=api,
        out_dir=runner_temp / "clonometer",
        branch="badges",
        remote=bare_repo,
        runner_temp=runner_temp,
    )
    env.update(overrides)
    return env


def test_turning_a_metric_off_for_a_run_keeps_its_files_and_ledger_on_the_branch(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    env = _first_run(tmp_path, bare_repo, fake_github)
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    views_ledger = _show(bare_repo, "badges", "views-ledger.json")

    # Second run with views off: its files stay exactly as they were.
    env["CLONOMETER_METRICS"] = "clones"
    env["CLONOMETER_OUT"] = str(tmp_path / "runner-temp" / "second")
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    assert _commit_count(bare_repo, "badges") == 1
    assert _tree_files(bare_repo, "badges") == EXPECTED_FILES
    assert _show(bare_repo, "badges", "views-ledger.json") == views_ledger

    # Third run with views back on: the views ledger continues, not restarts.
    env["CLONOMETER_METRICS"] = "clones,views"
    env["CLONOMETER_OUT"] = str(tmp_path / "runner-temp" / "third")
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    resumed = json.loads(_show(bare_repo, "badges", "views-ledger.json"))
    assert resumed["since"] == json.loads(views_ledger)["since"]
    assert set(resumed["days"]) >= set(json.loads(views_ledger)["days"])


def test_publish_refuses_the_repositorys_default_branch(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    default = _git(
        "-C",
        str(bare_repo),
        "symbolic-ref",
        "--short",
        "HEAD",
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    seed = tmp_path / "seed"
    _git("init", "--quiet", "-b", default, str(seed), check=True)
    (seed / "README.md").write_text("history worth keeping\n", encoding="utf-8")
    _git("-C", str(seed), "add", "README.md", check=True)
    _git(
        "-C",
        str(seed),
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "seed",
        check=True,
    )
    _git("-C", str(seed), "push", "--quiet", str(bare_repo), f"HEAD:{default}", check=True)

    env = _first_run(tmp_path, bare_repo, fake_github, CLONOMETER_BRANCH=default)
    assert _run_step("count", env, tmp_path).returncode == 0
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode == 1
    assert "default branch" in publish.stderr
    assert _tree_files(bare_repo, default) == {"README.md"}
    assert _commit_count(bare_repo, default) == 1


def test_a_branch_input_shaped_like_a_git_option_is_refused_before_any_git_call(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    """A branch beginning with a dash must never reach git as a bare ref.

    ``--upload-pack=touch marker`` is exactly the shape that made a local git
    fetch run an arbitrary command as its upload-pack program, so a marker
    file appearing anywhere under tmp_path would prove the option reached
    git; its absence proves the count step's own check stopped it first.
    """
    env = _first_run(
        tmp_path, bare_repo, fake_github, CLONOMETER_BRANCH="--upload-pack=touch marker"
    )
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 1
    assert "branch input is not a valid branch name" in count.stderr
    # The workflow would stop here on a real runner; running publish anyway
    # proves its own refs/heads/ fix also refuses the same input.
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode != 0 or "marker" not in _tree_files(bare_repo, "badges")
    assert not any(tmp_path.rglob("marker"))


def test_a_branch_with_a_slash_still_publishes_end_to_end(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    env = _first_run(tmp_path, bare_repo, fake_github, CLONOMETER_BRANCH="stats/badges")
    assert _run_step("count", env, tmp_path).returncode == 0
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode == 0, publish.stderr
    assert _commit_count(bare_repo, "stats/badges") == 1
    assert _tree_files(bare_repo, "stats/badges") == EXPECTED_FILES


def test_an_empty_token_input_fails_the_count_step_with_a_plain_message(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    env = _first_run(tmp_path, bare_repo, fake_github, CLONOMETER_TOKEN="")
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 1
    assert "token input is empty" in count.stderr
    assert "GITHUB_TOKEN" not in count.stderr


def test_a_refused_push_names_contents_write(tmp_path: Path, bare_repo: Path, fake_github) -> None:
    env = _first_run(tmp_path, bare_repo, fake_github)
    assert _run_step("count", env, tmp_path).returncode == 0
    env["CLONOMETER_REMOTE"] = str(tmp_path / "nowhere.git")
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode == 1
    assert "Contents write" in publish.stderr
    # The mask directive is consumed by the runner; on a bare shell it is plain output.
    printed = "\n".join(
        line
        for line in (publish.stdout + publish.stderr).splitlines()
        if "::add-mask::" not in line
    )
    assert TOKEN not in printed


def test_both_steps_write_the_numbers_to_the_run_summary(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    summary = tmp_path / "summary.md"
    env = _first_run(tmp_path, bare_repo, fake_github, GITHUB_STEP_SUMMARY=str(summary))
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    text = summary.read_text(encoding="utf-8")
    assert "| clones |" in text and "| views |" in text
    assert "(7d)" in text and "(all-time)" in text
    assert "Published" in text and "badges branch" in text
    assert TOKEN not in text


def test_a_symlink_planted_on_the_branch_is_replaced_not_followed(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    """A previous branch state is data, not something the publish step trusts."""
    victim = tmp_path / "victim.txt"
    victim.write_text("untouched\n", encoding="utf-8")
    seed = tmp_path / "seed"
    _git("init", "--quiet", "-b", "badges", str(seed), check=True)
    (seed / "clones.json").symlink_to(victim)
    _git("-C", str(seed), "add", "clones.json", check=True)
    _git(
        "-C",
        str(seed),
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "planted",
        check=True,
    )
    _git("-C", str(seed), "push", "--quiet", str(bare_repo), "HEAD:badges", check=True)

    env = _first_run(tmp_path, bare_repo, fake_github)
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    assert victim.read_text(encoding="utf-8") == "untouched\n"
    mode = _git(
        "-C",
        str(bare_repo),
        "ls-tree",
        "badges",
        "clones.json",
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()[0]
    assert mode == "100644"
    assert json.loads(_show(bare_repo, "badges", "clones.json"))["metric"] == "clones"


# --------------------------------------------------------------------------
# The gist mirror, end to end through the count step.
# --------------------------------------------------------------------------


def test_a_run_without_the_gist_input_sends_no_patch(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, _ = fake_github
    env = _first_run(tmp_path, bare_repo, fake_github)
    assert _run_step("count", env, tmp_path).returncode == 0
    assert state.gist_patches == []


def test_the_count_step_mirrors_exactly_the_numbers_files_into_the_gist(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, _ = fake_github
    env = _first_run(
        tmp_path, bare_repo, fake_github, CLONOMETER_GIST=GIST_ID, CLONOMETER_GIST_TOKEN=GIST_TOKEN
    )
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr

    assert len(state.gist_patches) == 1
    gist_id, authorization, body = state.gist_patches[0]
    assert gist_id == GIST_ID
    assert authorization == f"Bearer {GIST_TOKEN}"
    assert set(body["files"]) == {"clones.json", "views.json"}
    out_dir = tmp_path / "runner-temp" / "clonometer"
    for name in ("clones.json", "views.json"):
        assert body["files"][name]["content"] == (out_dir / name).read_text(encoding="utf-8")
    assert f"https://gist.github.com/{GIST_ID}" in count.stdout

    # The branch publish still happens after the mirror, unchanged.
    assert _run_step("publish", env, tmp_path).returncode == 0
    assert _tree_files(bare_repo, "badges") == EXPECTED_FILES


def test_an_empty_gist_token_input_falls_back_to_the_main_token(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, _ = fake_github
    env = _first_run(tmp_path, bare_repo, fake_github, CLONOMETER_GIST=GIST_ID)
    env["CLONOMETER_GIST_TOKEN"] = ""
    assert _run_step("count", env, tmp_path).returncode == 0
    assert state.gist_patches[0][1] == f"Bearer {TOKEN}"


def test_a_refused_gist_fails_the_count_step_naming_the_gist_scope(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    state, _ = fake_github
    state.gist_status = 404
    env = _first_run(
        tmp_path, bare_repo, fake_github, CLONOMETER_GIST=GIST_ID, CLONOMETER_GIST_TOKEN=GIST_TOKEN
    )
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 1
    assert "gist scope" in count.stderr
    # The branch files were written before the mirror was attempted, so a
    # rerun after fixing the token has nothing to recompute.
    assert (tmp_path / "runner-temp" / "clonometer" / "clones.json").is_file()
    # The composite action stops here, so the branch is never touched.
    assert _refs(bare_repo) == ""


def test_neither_token_leaks_from_a_gist_run(tmp_path: Path, bare_repo: Path, fake_github) -> None:
    summary = tmp_path / "summary.md"
    env = _first_run(
        tmp_path,
        bare_repo,
        fake_github,
        CLONOMETER_GIST=GIST_ID,
        CLONOMETER_GIST_TOKEN=GIST_TOKEN,
        GITHUB_STEP_SUMMARY=str(summary),
    )
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr
    # The mask directive is consumed by the runner; on a bare shell it is plain output.
    printed = "\n".join(
        line for line in (count.stdout + count.stderr).splitlines() if "::add-mask::" not in line
    )
    assert TOKEN not in printed and GIST_TOKEN not in printed
    text = summary.read_text(encoding="utf-8")
    assert f"https://gist.github.com/{GIST_ID}" in text
    assert TOKEN not in text and GIST_TOKEN not in text
