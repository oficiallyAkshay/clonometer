"""The prose gate passes on this tree and fails on the character it forbids."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from scripts import check_prose

if TYPE_CHECKING:
    import pytest

GIT = shutil.which("git") or "git"


def test_the_tracked_tree_has_no_em_dash() -> None:
    assert check_prose.main([]) == 0


def test_an_em_dash_is_reported_by_file_and_line() -> None:
    errors = check_prose.scan_text("notes.md", "fine\nnot " + chr(0x2014) + " fine\n")
    assert errors == ["notes.md:2: em dash"]


def test_a_tree_with_nothing_to_read_is_an_error_not_a_pass(tmp_path: Path) -> None:
    subprocess.run(  # noqa: S603 -- static args, never external input
        [GIT, "init", "--quiet", str(tmp_path)], check=True
    )
    assert check_prose.main([str(tmp_path)]) == 1


def test_binary_files_are_skipped(tmp_path: Path) -> None:
    (tmp_path / "blob.bin").write_bytes(b"\0" + chr(0x2014).encode())
    (tmp_path / "text.md").write_text("plain\n", encoding="utf-8")
    errors, read = check_prose.scan([Path("blob.bin"), Path("text.md")], tmp_path)
    assert (errors, read) == ([], 1)


def test_a_skipped_suffix_is_never_opened(tmp_path: Path) -> None:
    image = tmp_path / "picture.png"
    image.write_text("plain text, not actually a png", encoding="utf-8")
    assert check_prose.is_text(image) is False


def test_a_path_that_cannot_be_opened_as_a_file_is_not_text(tmp_path: Path) -> None:
    directory = tmp_path / "a-directory"
    directory.mkdir()
    assert check_prose.is_text(directory) is False


def test_an_em_dash_found_by_main_is_printed_and_the_gate_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    subprocess.run(  # noqa: S603 -- static args, never external input
        [GIT, "init", "--quiet", str(tmp_path)], check=True
    )
    (tmp_path / "notes.md").write_text("bad " + chr(0x2014) + " line\n", encoding="utf-8")
    subprocess.run(  # noqa: S603 -- static args, never external input
        [GIT, "-C", str(tmp_path), "add", "notes.md"], check=True
    )
    assert check_prose.main([str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "notes.md:1: em dash" in out
    assert "1 files, 1 errors" in out
