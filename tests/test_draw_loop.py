"""The hero graphic is drawn from its spec, and the script says so when it is stale."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import draw_loop


def test_the_committed_svg_is_what_the_spec_draws() -> None:
    assert draw_loop.main(["--check"]) == 0


def test_a_stale_svg_is_reported_and_exits_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    stale = tmp_path / "loop.svg"
    stale.write_text("<svg/>\n", encoding="utf-8")
    monkeypatch.setattr(draw_loop, "SVG", stale)
    assert draw_loop.main(["--check"]) == 1
    assert "does not match" in capsys.readouterr().out


def test_drawing_writes_the_svg_beside_the_spec(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "loop.svg"
    monkeypatch.setattr(draw_loop, "SVG", target)
    assert draw_loop.main([]) == 0
    body = target.read_text("utf-8")
    spec = json.loads(draw_loop.SPEC.read_text("utf-8"))
    for zone in spec["zones"]:
        assert zone["title"] in body and zone["caption"] in body
    assert body.count('<rect class="b"') == len(spec["zones"])
    assert body.count("marker-end") == len(spec["zones"]) - 1


def test_an_unknown_zone_kind_is_refused() -> None:
    spec = json.loads(draw_loop.SPEC.read_text("utf-8"))
    spec["zones"][0]["kind"] = "teapot"
    with pytest.raises(ValueError, match="unknown zone kind"):
        draw_loop.render(spec)
