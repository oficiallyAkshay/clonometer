#!/usr/bin/env python3
"""Prose gate: no em dash anywhere in the tracked tree.

Every tracked text file is read and any line carrying the em dash is reported
by file and line number. The repo root is resolved from this file's own path,
so a run from any directory reads the same tree. A scan that finds no files to
read exits 1 rather than reporting zero errors from a gate that checked
nothing.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Built from its code point so the character itself never appears in this repo.
EM_DASH = chr(0x2014)
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"}


def git_files(root: Path) -> list[Path]:
    """Every tracked file, as paths relative to the repo root."""
    out = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=str(root),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [Path(name) for name in out.split("\0") if name]


def is_text(path: Path) -> bool:
    """True for a file the gate should read."""
    if path.suffix.lower() in SKIP_SUFFIXES:
        return False
    try:
        with path.open("rb") as handle:
            return b"\0" not in handle.read(8192)
    except OSError:
        return False


def scan_text(name: str, text: str) -> list[str]:
    """Every em dash in text, one error string per line that carries one."""
    return [
        f"{name}:{number}: em dash"
        for number, line in enumerate(text.splitlines(), start=1)
        if EM_DASH in line
    ]


def scan(files: list[Path], root: Path) -> tuple[list[str], int]:
    """Errors across every readable text file, and how many files were read."""
    errors: list[str] = []
    read = 0
    for path in files:
        target = root / path
        if not target.is_file() or not is_text(target):
            continue
        read += 1
        errors.extend(scan_text(path.as_posix(), target.read_text("utf-8", errors="replace")))
    return errors, read


def main(argv: list[str] | None = None) -> int:
    root = Path(argv[0]) if argv else REPO_ROOT
    errors, read = scan(git_files(root), root)
    for error in errors:
        print(error)
    if read == 0:
        print("check_prose: no tracked text files were read, nothing to check")
        return 1
    print(f"check_prose: {read} files, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
