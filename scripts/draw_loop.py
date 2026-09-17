#!/usr/bin/env python3
"""Draw the README's hero graphic from its spec.

The spec beside the SVG is the source of truth; this script is how the SVG
was made and how a test proves the committed SVG still matches it. Nothing
here loads a font or an image from anywhere: system fonts and basic shapes,
in one grey that reads on both GitHub themes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "assets"
SPEC = ASSETS / "loop.hero.json"
SVG = ASSETS / "loop.svg"

INK = "#768390"
ACCENT = "#3fb950"
DESCRIPTION = (
    "A cron job reads the GitHub traffic API, merges it into a ledger, publishes a "
    "numbers file on the badges branch, and your badge reads it"
)


def glyph(kind: str, cx: float, gy: float) -> str:
    """One small line-drawn icon per step, centred on cx just under the box top."""
    if kind == "clock":
        return (
            f'<g class="g"><circle cx="{cx}" cy="{gy + 13}" r="12"/>'
            f'<path d="M{cx} {gy + 5}v8h6"/></g>'
        )
    if kind == "cloud":
        return (
            f'<path class="g" d="M{cx - 18} {gy + 22}'
            'a9 9 0 0 1 2-17a12 12 0 0 1 23-3a9 9 0 0 1 8 20z"/>'
        )
    if kind == "ledger":
        return (
            f'<g class="g"><rect x="{cx - 14}" y="{gy}" width="28" height="26" rx="3"/>'
            f'<path d="M{cx - 8} {gy + 8}h16M{cx - 8} {gy + 14}h16M{cx - 8} {gy + 20}h10"/></g>'
        )
    if kind == "file":
        return (
            f'<g class="g"><path d="M{cx - 11} {gy}h14l8 8v18h-22z"/><path d="M{cx + 3} {gy}v8h8"/>'
            f'<path d="M{cx - 5} {gy + 16}h10M{cx - 5} {gy + 21}h6"/></g>'
        )
    if kind == "badge":
        return (
            f'<g><rect x="{cx - 26}" y="{gy + 3}" width="52" height="20" rx="4" fill="{INK}"/>'
            f'<rect x="{cx - 2}" y="{gy + 3}" width="28" height="20" rx="4" fill="{ACCENT}"/>'
            f'<rect x="{cx - 2}" y="{gy + 3}" width="6" height="20" fill="{ACCENT}"/></g>'
        )
    raise ValueError(f"unknown glyph {kind!r}")


def render(spec: dict) -> str:
    vw, vh = spec["viewBox"]
    box = spec["box"]
    w, h, gap, x0, y0 = box["width"], box["height"], box["gap"], box["x"], box["y"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw}" '
        f'height="{vh}" role="img" aria-label="{DESCRIPTION}">',
        "<style>text{font-family:system-ui,-apple-system,&quot;Segoe UI&quot;,sans-serif;"
        f"fill:{INK}}}.t{{font-size:15px;font-weight:600}}.s{{font-size:13px}}"
        f".b{{fill:{INK};fill-opacity:.08;stroke:{INK};stroke-width:1.5}}"
        f".g{{fill:none;stroke:{INK};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}}"
        "</style>",
        '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" '
        f'markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="{INK}"/></marker></defs>',
    ]
    steps = spec["steps"]
    for i, step in enumerate(steps):
        x = x0 + i * (w + gap)
        cx, gy = x + w / 2, y0 + 14
        parts.append(f'<rect class="b" x="{x}" y="{y0}" width="{w}" height="{h}" rx="10"/>')
        parts.append(glyph(step["glyph"], cx, gy))
        parts.append(
            f'<text class="t" x="{cx}" y="{y0 + 66}" text-anchor="middle">{step["label"]}</text>'
        )
        if step.get("sub"):
            parts.append(
                f'<text class="s" x="{cx}" y="{y0 + 86}" text-anchor="middle">{step["sub"]}</text>'
            )
        if i < len(steps) - 1:
            parts.append(
                f'<path class="g" d="M{x + w + 4} {y0 + h / 2}h{gap - 9}" marker-end="url(#a)"/>'
            )
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def main(argv: list[str] | None = None) -> int:
    check = "--check" in (argv or [])
    svg = render(json.loads(SPEC.read_text("utf-8")))
    if check:
        if SVG.read_text("utf-8") != svg:
            print(f"{SVG.name} does not match {SPEC.name}; rerun scripts/draw_loop.py")
            return 1
        print(f"{SVG.name} matches {SPEC.name}")
        return 0
    SVG.write_text(svg, encoding="utf-8")
    print(f"wrote {SVG}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
