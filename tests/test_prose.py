"""The prose gate passes on this tree and fails on the character it forbids."""

from __future__ import annotations

import subprocess
from pathlib import Path

from scripts import check_prose


def test_the_tracked_tree_has_no_em_dash() -> None:
    assert check_prose.main([]) == 0


def test_an_em_dash_is_reported_by_file_and_line() -> None:
    errors = check_prose.scan_text("notes.md", "fine\nnot " + chr(0x2014) + " fine\n")
    assert errors == ["notes.md:2: em dash"]


def test_a_tree_with_nothing_to_read_is_an_error_not_a_pass(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    assert check_prose.main([str(tmp_path)]) == 1


def test_binary_files_are_skipped(tmp_path: Path) -> None:
    (tmp_path / "blob.bin").write_bytes(b"\0" + chr(0x2014).encode())
    (tmp_path / "text.md").write_text("plain\n", encoding="utf-8")
    errors, read = check_prose.scan([Path("blob.bin"), Path("text.md")], tmp_path)
    assert (errors, read) == ([], 1)
