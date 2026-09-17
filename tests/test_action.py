"""Tests for action.yml, clonometer's composite action.

The static tests parse action.yml with pyyaml and check its shape: the three
inputs, the composite `using`, and the two bash steps named `count` and
`publish`.

The end to end tests run those two steps' `run` bodies exactly as written,
straight out of action.yml, as plain bash subprocesses. Nothing here talks to
the real network: CLONOMETER_API points the count step at a fake GitHub API
served on 127.0.0.1 by a background thread, and CLONOMETER_REMOTE points the
publish step's push at a throwaway bare repository on disk. The fake API's
traffic endpoints answer from canned rows a test sets up, and its contents
endpoint answers by running `git show <ref>:<file>` against that same bare
repository, which is exactly what a real GitHub Enterprise or GitHub.com
contents API is standing in for here.
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import subprocess
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
ACTION_FILE = ROOT / "action.yml"
BOT_AUTHOR = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
TOKEN = "a-fine-grained-token-that-must-never-leak"
REPO = "octo-owner/octo-repo"


def _load_action() -> dict:
    return yaml.safe_load(ACTION_FILE.read_text(encoding="utf-8"))


def _steps() -> list[dict]:
    return _load_action()["runs"]["steps"]


def _step(name: str) -> dict:
    return next(step for step in _steps() if step["name"] == name)


# --------------------------------------------------------------------------
# action.yml, read statically
# --------------------------------------------------------------------------


def test_action_yml_parses_and_declares_exactly_the_three_inputs() -> None:
    inputs = _load_action()["inputs"]
    assert set(inputs.keys()) == {"token", "branch", "metrics"}
    assert inputs["token"]["required"] is True
    assert "default" not in inputs["token"]
    assert inputs["branch"]["default"] == "badges"
    assert inputs["metrics"]["default"] == "clones"


def test_action_yml_is_a_composite_action() -> None:
    assert _load_action()["runs"]["using"] == "composite"


def test_action_yml_has_a_fetch_step_then_two_bash_steps() -> None:
    steps = _steps()
    assert [step["name"] for step in steps] == ["fetch", "count", "publish"]
    assert all(step["shell"] == "bash" for step in steps[1:])


def test_the_fetch_step_clones_the_pinned_action_with_the_repo_wide_checkout_pin() -> None:
    """The fetch is what makes a consumer run count as a clone of this repository."""
    fetch = _step("fetch")
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    pin = fetch["uses"].split("@")[1]
    assert fetch["uses"].startswith("actions/checkout@")
    assert len(pin) == 40 and f"actions/checkout@{pin}" in ci
    assert fetch["if"] == "github.action_repository != ''"
    assert fetch["with"]["repository"] == "${{ github.action_repository }}"
    assert fetch["with"]["ref"] == "${{ github.action_ref }}"
    assert fetch["with"]["path"] == ".clonometer"
    assert fetch["with"]["persist-credentials"] is False
    assert fetch["with"]["fetch-depth"] == 1


def test_the_count_step_runs_the_fetched_checkout_when_there_is_one(
    tmp_path: Path, bare_repo: Path, fake_github
) -> None:
    """The context, not the workspace, decides which script runs."""
    env = _first_run(tmp_path, bare_repo, fake_github)
    workspace = tmp_path / "workspace"
    (workspace / ".clonometer").mkdir(parents=True)
    (workspace / ".clonometer" / "clonometer.py").write_text(
        "import sys; print('ran from the fetched checkout'); sys.exit(0)\n", encoding="utf-8"
    )
    env["GITHUB_WORKSPACE"] = str(workspace)
    env["CLONOMETER_ACTION_REPOSITORY"] = "owner/clonometer"
    count = _run_step("count", env, tmp_path)
    assert count.returncode == 0, count.stderr
    assert "ran from the fetched checkout" in count.stdout

    # A local `uses: ./` has no action repository: the workspace file is
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

    def set_traffic(
        self, metric: str, count: int, uniques: int, rows: list[tuple[str, int, int]]
    ) -> None:
        self.traffic[metric] = (count, uniques, rows)


def _make_handler(state: _FakeState) -> type[http.server.BaseHTTPRequestHandler]:
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format_: str, *args: object) -> None:
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
                result = subprocess.run(
                    ["git", "-C", str(state.bare_repo), "show", f"{ref}:{file_name}"],
                    capture_output=True,
                )
                if result.returncode != 0:
                    self._send_json(404, {"message": "Not Found"})
                    return
                content = base64.b64encode(result.stdout).decode("ascii")
                self._send_json(200, {"content": content, "encoding": "base64"})
                return

            self._send_json(404, {"message": "Not Found"})

    return Handler


@pytest.fixture
def bare_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--quiet", "--bare", str(repo)], check=True)
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
    return subprocess.run(
        ["bash", "-c", _step(name)["run"]],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
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
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-list", "--count", ref],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip())


def _tree_files(repo: Path, ref: str) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(repo), "ls-tree", "--name-only", ref],
        capture_output=True,
        text=True,
        check=True,
    )
    return set(result.stdout.split())


def _show(repo: Path, ref: str, path: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "show", f"{ref}:{path}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def _author(repo: Path, ref: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "log", "-1", "--format=%an <%ae>", ref],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _refs(repo: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "for-each-ref"], capture_output=True, text=True, check=True
    )
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

    config = subprocess.run(
        ["git", "-C", str(bare_repo), "config", "--list"],
        capture_output=True,
        text=True,
        check=True,
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
    default = subprocess.run(
        ["git", "-C", str(bare_repo), "symbolic-ref", "--short", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    seed = tmp_path / "seed"
    subprocess.run(["git", "init", "--quiet", "-b", default, str(seed)], check=True)
    (seed / "README.md").write_text("history worth keeping\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(seed), "add", "README.md"], check=True)
    subprocess.run(
        [
            "git",
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
        ],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(seed), "push", "--quiet", str(bare_repo), f"HEAD:{default}"], check=True
    )

    env = _first_run(tmp_path, bare_repo, fake_github, CLONOMETER_BRANCH=default)
    assert _run_step("count", env, tmp_path).returncode == 0
    publish = _run_step("publish", env, tmp_path)
    assert publish.returncode == 1
    assert "default branch" in publish.stderr
    assert _tree_files(bare_repo, default) == {"README.md"}
    assert _commit_count(bare_repo, default) == 1


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
    subprocess.run(["git", "init", "--quiet", "-b", "badges", str(seed)], check=True)
    (seed / "clones.json").symlink_to(victim)
    subprocess.run(["git", "-C", str(seed), "add", "clones.json"], check=True)
    subprocess.run(
        [
            "git",
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
        ],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(seed), "push", "--quiet", str(bare_repo), "HEAD:badges"], check=True
    )

    env = _first_run(tmp_path, bare_repo, fake_github)
    assert _run_step("count", env, tmp_path).returncode == 0
    assert _run_step("publish", env, tmp_path).returncode == 0
    assert victim.read_text(encoding="utf-8") == "untouched\n"
    mode = subprocess.run(
        ["git", "-C", str(bare_repo), "ls-tree", "badges", "clones.json"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()[0]
    assert mode == "100644"
    assert json.loads(_show(bare_repo, "badges", "clones.json"))["metric"] == "clones"
