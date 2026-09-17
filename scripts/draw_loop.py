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
    "GitHub keeps a 14-day window of traffic that slides forward and drops older days; "
    "clonometer merges each day's sample into a ledger for clones and for views, appending "
    "new days and keeping old ones; you get badges from the numbers files on your badges branch"
)
ZONE_W, ZONE_H, GAP, X0, Y0 = 270, 190, 25, 10, 20


def text(x: float, y: float, s: str, cls: str, anchor: str = "middle") -> str:
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{s}</text>'


def window(x: float, y: float, days: int, gone: int) -> list[str]:
    """Day bars inside a bracketed window, and ghost bars that have already fallen out."""
    parts = []
    bar_w, gap, base = 10, 4, y + 112
    heights = [22, 30, 18, 34, 26, 38, 20, 28, 36, 24, 32, 40, 30, 44, 26, 34, 20]
    left = x + 18
    for i in range(gone + days):
        h = heights[i % len(heights)]
        bx = left + i * (bar_w + gap)
        if i < gone:
            parts.append(
                f'<rect x="{bx}" y="{base - h}" width="{bar_w}" height="{h}" rx="2" fill="none" '
                f'stroke="{INK}" stroke-width="1" stroke-dasharray="3 2" stroke-opacity="0.6"/>'
            )
        else:
            parts.append(
                f'<rect x="{bx}" y="{base - h}" width="{bar_w}" height="{h}" rx="2" fill="{INK}" '
                f'fill-opacity="0.85"/>'
            )
    wx0 = left + gone * (bar_w + gap) - 3
    wx1 = left + (gone + days) * (bar_w + gap) - gap + 3
    parts.append(f'<path class="g" d="M{wx0} {base - 58}v-6h{wx1 - wx0}v6"/>')
    parts.append(text((wx0 + wx1) / 2, base - 68, "14 days", "s"))
    parts.append(f'<path class="g" d="M{wx1 + 4} {base - 61}h12" marker-end="url(#a)"/>')
    parts.append(text(wx1 + 22, base - 57, "daily", "xs", "start"))
    parts.append(text(left + (gone * (bar_w + gap) - gap) / 2, base + 16, "gone", "xs"))
    return parts


def ledger(x: float, y: float, rows: list[str], kept: int, sample: int) -> list[str]:
    """A ledger row per metric: kept days, the sample overlapping its tail, one new day added."""
    parts = []
    cell, gap, left, top = 11, 3, x + 66, y + 62
    total = kept + 1
    for r, name in enumerate(rows):
        cy = top + r * 34
        parts.append(text(left - 10, cy + 10, name, "s", "end"))
        for c in range(total):
            new = c == total - 1
            fill = ACCENT if new else INK
            parts.append(
                f'<rect x="{left + c * (cell + gap)}" y="{cy}" width="{cell}" height="{cell}" '
                f'rx="2" fill="{fill}" fill-opacity="{0.9 if new else 0.55}"/>'
            )
        sx0 = left + (total - sample) * (cell + gap) - 2
        sx1 = left + total * (cell + gap) - gap + 2
        parts.append(
            f'<rect x="{sx0}" y="{cy - 4}" width="{sx1 - sx0}" height="{cell + 8}" rx="3" '
            f'fill="none" stroke="{ACCENT}" stroke-width="1.5" stroke-dasharray="4 3"/>'
        )
    parts.append(
        text(left + (total - sample / 2) * (cell + gap) - 6, top - 10, "today's sample", "xs")
    )
    parts.append(text(left + (total - 1) * (cell + gap) + 5, top + 34 + 26, "+1 day", "xs"))
    parts.append(text(x + ZONE_W / 2, top + 88, "sum of every day = all-time", "s"))
    return parts


def result(x: float, y: float, badges: list[list[str]]) -> list[str]:
    """The badges a consumer renders from the numbers files, and nothing else."""
    parts = []
    for i, (label, value) in enumerate(badges):
        by = y + 62 + i * 44
        lw, vw, h = 62, 178, 26
        bx = x + (ZONE_W - lw - vw) / 2
        parts.append(
            f'<rect x="{bx}" y="{by}" width="{lw}" height="{h}" rx="5" fill="{INK}"/>'
            f'<rect x="{bx + lw - 5}" y="{by}" width="{vw + 5}" height="{h}" rx="5" '
            f'fill="{ACCENT}"/>'
            f'<rect x="{bx + lw - 5}" y="{by}" width="8" height="{h}" fill="{ACCENT}"/>'
        )
        parts.append(text(bx + lw / 2, by + 17, label, "badge"))
        parts.append(text(bx + lw + vw / 2, by + 17, value, "badge"))
    return parts


def render(spec: dict) -> str:
    vw, vh = spec["viewBox"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw}" '
        f'height="{vh}" role="img" aria-label="{DESCRIPTION}">',
        "<style>text{font-family:system-ui,-apple-system,&quot;Segoe UI&quot;,sans-serif;"
        f"fill:{INK}}}.t{{font-size:15px;font-weight:600}}.s{{font-size:13px}}"
        ".xs{font-size:12px}.badge{font-size:12px;fill:#ffffff;font-weight:600}"
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
            parts.extend(window(x, Y0, zone["days"], zone["gone"]))
        elif zone["kind"] == "ledger":
            parts.extend(ledger(x, Y0, zone["rows"], zone["kept"], zone["sample"]))
        elif zone["kind"] == "result":
            parts.extend(result(x, Y0, zone["badges"]))
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
