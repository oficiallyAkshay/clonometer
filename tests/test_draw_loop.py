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
    assert spec["title"] in body
    for label in (spec["today_label"], spec["oldest_label"], spec["gone_label"]):
        assert label in body
    for total in spec["totals"]:
        assert total in body
    for value in spec["cycle"]:
        assert f">{value}<" in body


def test_the_svg_animates_with_smil_and_nothing_else() -> None:
    body = draw_loop.SVG.read_text("utf-8")
    assert "<animate " in body
    assert "<animateMotion" in body
    assert "<animateTransform" in body
    assert "<set " in body
    assert 'repeatCount="indefinite"' in body
    assert "<script" not in body
    assert "<image" not in body
    assert "@import" not in body
    assert body.count("http") == 1  # the SVG namespace, nothing else


def test_the_belt_is_clipped_to_a_single_window() -> None:
    body = draw_loop.SVG.read_text("utf-8")
    assert body.count("<clipPath") == 1


def test_every_box_value_and_every_total_from_the_spec_is_drawn() -> None:
    spec = json.loads(draw_loop.SPEC.read_text("utf-8"))
    body = draw_loop.SVG.read_text("utf-8")
    for value in spec["cycle"]:
        assert f">{value}<" in body
    for total in spec["totals"]:
        assert f">{total}<" in body


def test_the_picture_fits_its_own_viewbox() -> None:
    spec = json.loads(draw_loop.SPEC.read_text("utf-8"))
    vw, vh = spec["viewBox"]
    body = draw_loop.SVG.read_text("utf-8")
    assert f'viewBox="0 0 {vw} {vh}"' in body


def test_an_empty_cycle_is_refused() -> None:
    spec = json.loads(draw_loop.SPEC.read_text("utf-8"))
    bad = dict(spec)
    bad["cycle"] = []
    with pytest.raises(ValueError, match="cycle"):
        draw_loop.render(bad)
