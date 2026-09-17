#!/usr/bin/env python3
"""Draw the README's hero graphic from its spec.

The spec beside the SVG is the source of truth; this script is how the SVG
was made and how a test proves the committed SVG still matches it. Three
zones from the reader's chair: what GitHub keeps, what clonometer does once
a day, what the reader gets. Nothing here loads a font or an image from
anywhere: system fonts and basic shapes, in one grey that reads on both
GitHub themes, and one green for the badges.
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
    "GitHub keeps 14 days of traffic and then drops them; clonometer samples them once "
    "a day into a ledger with a row for clones and a row for views, keeping every day; "
    "you get two numbers files on a badges branch and any badge you like"
)
ZONE_W, ZONE_H, GAP, X0, Y0 = 270, 190, 25, 10, 20


def text(x: float, y: float, s: str, cls: str, anchor: str = "middle") -> str:
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{s}</text>'


def window(x: float, y: float, days: int) -> list[str]:
    """A strip of day bars, the oldest fading out: the window rolls off the left."""
    parts = []
    bar_w, gap, top = 12, 4, y + 62
    heights = [22, 30, 18, 34, 26, 38, 20, 28, 36, 24, 32, 40, 30, 44]
    for i in range(days):
        h = heights[i % len(heights)]
        opacity = 0.15 + 0.85 * (i / max(days - 1, 1))
        parts.append(
            f'<rect x="{x + 22 + i * (bar_w + gap)}" y="{top + 50 - h}" width="{bar_w}" '
            f'height="{h}" rx="2" fill="{INK}" fill-opacity="{opacity:.2f}"/>'
        )
    parts.append(f'<path class="g" d="M{x + 20} {top + 52}h{days * (bar_w + gap) + 2}"/>')
    parts.append(text(x + 22, top + 68, "day 1", "s", "start"))
    parts.append(text(x + 20 + days * (bar_w + gap), top + 68, "today", "s", "end"))
    return parts


def ledger(x: float, y: float, rows: list[str], columns: int) -> list[str]:
    """A ledger growing to the right: one row per metric, one cell per day kept."""
    parts = []
    cell, gap, left, top = 11, 3, x + 68, y + 66
    for r, name in enumerate(rows):
        cy = top + r * 30
        parts.append(text(left - 10, cy + 10, name, "s", "end"))
        for c in range(columns):
            fill = ACCENT if c == columns - 1 else INK
            op = "0.9" if c == columns - 1 else f"{0.25 + 0.5 * (c / columns):.2f}"
            parts.append(
                f'<rect x="{left + c * (cell + gap)}" y="{cy}" width="{cell}" height="{cell}" '
                f'rx="2" fill="{fill}" fill-opacity="{op}"/>'
            )
        parts.append(text(left + columns * (cell + gap) + 4, cy + 10, "+1", "s", "start"))
    parts.append(text(x + ZONE_W / 2, top + 84, "sum of every day = all-time", "s"))
    return parts


def result(x: float, y: float, branch: str, files: list[str], badges: list[list[str]]) -> list[str]:
    """Two files on the branch, and the badges a consumer renders from them."""
    parts = []
    top = y + 52
    parts.append(
        f'<g class="g"><circle cx="{x + 30}" cy="{top + 4}" r="4"/><circle cx="{x + 30}" '
        f'cy="{top + 24}" r="4"/><path d="M{x + 30} {top + 8}v12"/></g>'
    )
    parts.append(text(x + 40, top + 18, branch, "s", "start"))
    for i, name in enumerate(files):
        fx = x + 110 + i * 78
        parts.append(
            f'<g class="g"><path d="M{fx} {top - 2}h12l6 6v20h-18z"/>'
            f'<path d="M{fx + 12} {top - 2}v6h6"/></g>'
        )
        parts.append(text(fx + 9, top + 40, name, "xs"))
    for i, (label, value) in enumerate(badges):
        by = top + 62 + i * 30
        lw, vw = 56, 168
        parts.append(
            f'<rect x="{x + 28}" y="{by}" width="{lw}" height="20" rx="4" fill="{INK}"/>'
            f'<rect x="{x + 28 + lw - 4}" y="{by}" width="{vw + 4}" height="20" rx="4" '
            f'fill="{ACCENT}"/><rect x="{x + 28 + lw - 4}" y="{by}" width="6" height="20" '
            f'fill="{ACCENT}"/>'
        )
        parts.append(text(x + 28 + lw / 2, by + 14, label, "badge"))
        parts.append(text(x + 28 + lw + vw / 2, by + 14, value, "badge"))
    return parts


def render(spec: dict) -> str:
    vw, vh = spec["viewBox"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw}" '
        f'height="{vh}" role="img" aria-label="{DESCRIPTION}">',
        "<style>text{font-family:system-ui,-apple-system,&quot;Segoe UI&quot;,sans-serif;"
        f"fill:{INK}}}.t{{font-size:15px;font-weight:600}}.s{{font-size:13px}}"
        ".xs{font-size:12px}.badge{font-size:11px;fill:#ffffff;font-weight:600}"
        f".b{{fill:{INK};fill-opacity:.06;stroke:{INK};stroke-width:1.5}}"
        f".g{{fill:none;stroke:{INK};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}}"
        "</style>",
        '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" '
        f'markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="{INK}"/></marker></defs>',
    ]
    zones = spec["zones"]
    for i, zone in enumerate(zones):
        x = X0 + i * (ZONE_W + GAP)
        cx = x + ZONE_W / 2
        parts.append(
            f'<rect class="b" x="{x}" y="{Y0}" width="{ZONE_W}" height="{ZONE_H}" rx="10"/>'
        )
        parts.append(text(cx, Y0 + 28, zone["title"], "t"))
        if zone["kind"] == "window":
            parts.extend(window(x, Y0, zone["days"]))
        elif zone["kind"] == "ledger":
            parts.extend(ledger(x, Y0, zone["rows"], zone["columns"]))
        elif zone["kind"] == "result":
            parts.extend(result(x, Y0, zone["branch"], zone["files"], zone["badges"]))
        else:
            raise ValueError(f"unknown zone kind {zone['kind']!r}")
        parts.append(text(cx, Y0 + ZONE_H - 12, zone["caption"], "s"))
        if i < len(zones) - 1:
            parts.append(
                f'<path class="g" d="M{x + ZONE_W + 3} {Y0 + ZONE_H / 2}h{GAP - 7}" '
                'marker-end="url(#a)"/>'
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
