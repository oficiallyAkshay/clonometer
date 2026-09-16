"""The npm launcher hands off to python3 unchanged and packs only the root
script alongside itself."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tomllib
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
LAUNCHER = REPO_ROOT / "bin" / "clonometer.js"

NODE = shutil.which("node")
NPM = shutil.which("npm")

needs_node = pytest.mark.skipif(NODE is None, reason="node is not on PATH")
needs_npm = pytest.mark.skipif(NPM is None, reason="npm is not on PATH")


def _write_fake_python3(bin_dir: Path, exit_code: int = 0) -> None:
    """A python3 stand-in that prints one argv entry per line, then exits."""
    fake = bin_dir / "python3"
    fake.write_text(f'#!/bin/sh\nfor a in "$@"; do printf \'%s\\n\' "$a"; done\nexit {exit_code}\n')
    fake.chmod(0o755)


@needs_node
def test_the_launcher_invokes_python3_with_the_root_script_and_the_argv(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    _write_fake_python3(fake_bin)

    env = {**os.environ, "PATH": f"{fake_bin}:/usr/bin:/bin"}
    result = subprocess.run(
        [NODE, str(LAUNCHER), "owner/name", "--write", "out"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    expected_script = REPO_ROOT / "clonometer.py"
    assert result.returncode == 0
    assert result.stdout.splitlines() == [
        str(expected_script),
        "owner/name",
        "--write",
        "out",
    ]


@needs_node
def test_a_missing_python3_is_one_line_on_stderr_and_exit_1(tmp_path: Path) -> None:
    empty_bin = tmp_path / "empty"
    empty_bin.mkdir()

    env = {**os.environ, "PATH": str(empty_bin)}
    result = subprocess.run(
        [NODE, str(LAUNCHER), "owner/name"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert result.stderr == "clonometer needs python3 on PATH\n"
    assert result.stdout == ""


@needs_node
def test_the_childs_exit_status_is_propagated(tmp_path: Path) -> None:
    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    _write_fake_python3(fake_bin, exit_code=3)

    env = {**os.environ, "PATH": f"{fake_bin}:/usr/bin:/bin"}
    result = subprocess.run(
        [NODE, str(LAUNCHER), "owner/name"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 3


@needs_npm
def test_npm_pack_ships_exactly_the_root_script_and_the_bin_dir(
    tmp_path: Path,
) -> None:
    pack_dir = tmp_path / "pack"
    pack_dir.mkdir()
    shutil.copy2(REPO_ROOT / "package.json", pack_dir / "package.json")
    shutil.copytree(REPO_ROOT / "bin", pack_dir / "bin")
    shutil.copy2(REPO_ROOT / "README.md", pack_dir / "README.md")
    shutil.copy2(REPO_ROOT / "LICENSE", pack_dir / "LICENSE")

    real_script = REPO_ROOT / "clonometer.py"
    if real_script.exists():
        shutil.copy2(real_script, pack_dir / "clonometer.py")
    else:
        # Another builder writes the real root script on a parallel branch;
        # an empty stand-in is enough to prove the files allowlist packs it.
        (pack_dir / "clonometer.py").write_text("")

    result = subprocess.run(
        [NPM, "pack", "--dry-run", "--json"],
        cwd=pack_dir,
        capture_output=True,
        text=True,
        check=True,
    )

    packed = json.loads(result.stdout)
    paths = {entry["path"] for entry in packed[0]["files"]}
    assert paths == {
        "package.json",
        "bin/clonometer.js",
        "clonometer.py",
        "README.md",
        "LICENSE",
    }


def test_package_json_has_no_dependencies_and_the_right_bin_and_version() -> None:
    package = json.loads((REPO_ROOT / "package.json").read_text())
    with (REPO_ROOT / "pyproject.toml").open("rb") as handle:
        pyproject = tomllib.load(handle)

    assert "dependencies" not in package
    assert package["bin"] == {"clonometer": "bin/clonometer.js"}
    assert package["version"] == pyproject["project"]["version"]
