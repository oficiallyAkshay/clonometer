#!/usr/bin/env python3
"""Draw the README's hero graphic (an animated belt) from its spec.

The spec beside the SVG is the source of truth; this script is how the SVG
was made and how a test proves the committed SVG still matches it. The
picture is a conveyor belt of GitHub's 14-day traffic window: a box enters
from the right every two seconds, the belt slides one slot left, the oldest
box tips off the left edge, and its value travels down to a running
all-time total that ticks up and pulses. Four days make one eight-second
loop; the belt strip holds four extra boxes so the values repeat and the
loop seam is invisible.

Nothing here loads a font, an image or a script from anywhere: system
fonts, basic shapes and SMIL animation, in one grey that reads on both
GitHub themes, and one green for the accent. drawsvg builds the element
tree and serialises it; this script only adds geometry and timing, and
strips the xlink namespace drawsvg always declares, since nothing here
uses an xlink reference.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import drawsvg as draw

ASSETS = Path(__file__).resolve().parents[1] / "assets"
SPEC = ASSETS / "loop.hero.json"
SVG = ASSETS / "loop.svg"

INK = "#768390"
ACCENT = "#3fb950"
FONT_STACK = 'system-ui,-apple-system,"Segoe UI",sans-serif'
DESCRIPTION = (
    "A conveyor belt of GitHub's 14-day clone window: a new day rises in on the "
    "right every two seconds, the belt slides left, the oldest day tips off the "
    "left edge, and its count travels down to a running all-time total that "
    "ticks up and pulses"
)

# Belt geometry. BELT_LEFT..BELT_RIGHT is the clipped window that always
# shows exactly VISIBLE boxes; the strip holds DAYS_PER_LOOP extra boxes
# past the right edge so the belt has somewhere to slide from.
BELT_LEFT = 100
SLOT = 50
BOX_W = 36
BOX_H = 40
BELT_TOP = 64
VISIBLE = 14
DAYS_PER_LOOP = 4
TOTAL_BOXES = VISIBLE + DAYS_PER_LOOP
BELT_RIGHT = BELT_LEFT + VISIBLE * SLOT
LABEL_Y = BELT_TOP + BOX_H + 16
CLIP_Y = BELT_TOP - 14
CLIP_H = BOX_H + 14 + 26

# Timing. One day is DAY_SECONDS long; DAYS_PER_LOOP days make one loop.
# Within a day-step, local fractions (of the whole loop) mark: the
# slide/rise finishing (F_ENTER), the falling value landing (F_FALL), and
# the step ending (F_STEP, always exactly one day-step of the loop).
DAY_SECONDS = 2
LOOP_SECONDS = DAY_SECONDS * DAYS_PER_LOOP
LOOP_DUR = f"{LOOP_SECONDS}s"
EASE = "0.4 0 0.2 1"
F_ENTER = 0.6 / LOOP_SECONDS
F_FALL = 1.4 / LOOP_SECONDS
F_STEP = DAY_SECONDS / LOOP_SECONDS

TITLE_Y = 24
ENDCAP_Y = BELT_TOP - 22

TOTAL_BOX_W = 190
TOTAL_BOX_H = 46
TOTAL_BOX_Y = 142
TOTAL_BOX_X = int(900 / 2 - TOTAL_BOX_W / 2)
TOTAL_CX = int(900 / 2)
TOTAL_CY = int(TOTAL_BOX_Y + TOTAL_BOX_H / 2)
TOTAL_TEXT_Y = TOTAL_BOX_Y + 30
CAPTION_Y = TOTAL_BOX_Y + TOTAL_BOX_H + 16
TAGLINE_Y = CAPTION_Y + 16

GONE_RIGHT = BELT_LEFT - 12
GONE_BOXES = 3
FALL_START = (BELT_LEFT - 4, BELT_TOP + BOX_H + 6)
FALL_END = (TOTAL_CX, TOTAL_BOX_Y - 6)


def num(x: float) -> str:
    """A trimmed, deterministic decimal: 0.6, not 0.6000000000000001."""
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return s or "0"


def times(fractions: list[float]) -> str:
    """The keyTimes attribute value: each fraction, formatted and joined by semicolons."""
    return ";".join(num(f) for f in fractions)


def style_block() -> draw.Raw:
    """The one CSS block every text element in the SVG shares."""
    css = (
        "text{font-family:" + FONT_STACK + f";fill:{INK}}}"
        ".t{font-size:15px;font-weight:600}"
        ".s{font-size:12px}"
        ".xs{font-size:11px}"
        ".boxval{font-size:12px;fill:#ffffff;font-weight:600}"
        ".total{font-size:26px;font-weight:700;fill:" + INK + "}"
        ".fall{font-size:13px;font-weight:700;fill:" + ACCENT + "}"
    )
    return draw.Raw(f"<style>{css}</style>")


def title_and_endcaps(spec: dict) -> list[draw.DrawingElement]:
    """The title, the two edge labels, and the two endcap ticks marking the belt."""
    return [
        draw.Text(spec["title"], 15, 450, TITLE_Y, text_anchor="middle", class_="t"),
        draw.Text(spec["oldest_label"], 12, BELT_LEFT, ENDCAP_Y, text_anchor="start", class_="s"),
        draw.Text(spec["today_label"], 12, BELT_RIGHT, ENDCAP_Y, text_anchor="end", class_="s"),
        draw.Path(
            d=f"M{BELT_LEFT} {ENDCAP_Y + 6}v6",
            stroke=INK,
            stroke_width=1.5,
            fill="none",
        ),
        draw.Path(
            d=f"M{BELT_RIGHT} {ENDCAP_Y + 6}v6",
            stroke=INK,
            stroke_width=1.5,
            fill="none",
        ),
    ]


GONE_W = 20
GONE_GAP = 6
GONE_PITCH = GONE_W + GONE_GAP


def gone_trail(spec: dict) -> list[draw.DrawingElement]:
    """A faint dotted trail beyond the left edge, marking where days go."""
    parts = []
    heights = [16, 24, 12]
    for i in range(GONE_BOXES):
        h = heights[i % len(heights)]
        x = GONE_RIGHT - (GONE_BOXES - i) * GONE_PITCH
        parts.append(
            draw.Rectangle(
                x,
                BELT_TOP + (BOX_H - h),
                GONE_W,
                h,
                rx=3,
                fill="none",
                stroke=INK,
                stroke_width=1,
                stroke_dasharray="2 3",
                stroke_opacity=0.5,
            ),
        )
    parts.append(
        draw.Text(
            spec["gone_label"],
            11,
            GONE_RIGHT - (GONE_BOXES * GONE_PITCH) // 2,
            LABEL_Y,
            text_anchor="middle",
            class_="xs",
            fill_opacity=0.6,
        ),
    )
    return parts


def box_group(index: int, value: int, label: str) -> draw.Group:
    """One belt box: a filled rect, its count, and its day label."""
    bx = index * SLOT
    g = draw.Group(transform=f"translate({bx} 0)")
    g.append(draw.Rectangle(0, BELT_TOP, BOX_W, BOX_H, rx=6, fill=INK, fill_opacity=0.85))
    g.append(
        draw.Text(
            str(value),
            12,
            BOX_W // 2,
            BELT_TOP + BOX_H // 2 + 4,
            text_anchor="middle",
            class_="boxval",
        ),
    )
    g.append(draw.Text(label, 11, BOX_W // 2, LABEL_Y, text_anchor="middle", class_="xs"))
    return g


def belt(spec: dict) -> draw.Group:
    """The clipped, sliding strip: 14 visible boxes plus 4 that enter."""
    cycle = spec["cycle"]
    day_labels = spec["day_labels"]
    clip = draw.ClipPath(id="belt-clip")
    clip.append(draw.Rectangle(BELT_LEFT, CLIP_Y, BELT_RIGHT - BELT_LEFT, CLIP_H))

    strip = draw.Group(id="belt-strip", transform=f"translate({BELT_LEFT} 0)")
    for i in range(TOTAL_BOXES):
        value = cycle[i % len(cycle)]
        label = day_labels[i % len(day_labels)]
        g = box_group(i, value, label)
        if i < DAYS_PER_LOOP:
            # This box is currently on the belt and falls off during its
            # own step: it fades where the slide has just carried it past
            # the left edge, and settles back for the next loop.
            g.append_anim(
                draw.Animate(
                    "opacity",
                    LOOP_DUR,
                    from_or_values="1;1;0;0",
                    begin=f"{i * DAY_SECONDS}s",
                    repeatCount="indefinite",
                    keyTimes=times([0, F_ENTER, F_FALL, 1]),
                ),
            )
            g.append_anim(
                draw.AnimateTransform(
                    "translate",
                    LOOP_DUR,
                    from_or_values="0,0;0,0;0,14;0,14",
                    begin=f"{i * DAY_SECONDS}s",
                    repeatCount="indefinite",
                    keyTimes=times([0, F_ENTER, F_FALL, 1]),
                    attributeName="transform",
                    additive="sum",
                ),
            )
        elif i >= VISIBLE:
            k = i - VISIBLE
            # This box has not entered yet: it rises in from the right at
            # the start of its own step, then holds until the loop resets.
            g.append_anim(
                draw.Animate(
                    "opacity",
                    LOOP_DUR,
                    from_or_values="0;1;1",
                    begin=f"{k * DAY_SECONDS}s",
                    repeatCount="indefinite",
                    keyTimes=times([0, F_ENTER, 1]),
                ),
            )
            g.append_anim(
                draw.AnimateTransform(
                    "translate",
                    LOOP_DUR,
                    from_or_values="0,10;0,0;0,0",
                    begin=f"{k * DAY_SECONDS}s",
                    repeatCount="indefinite",
                    keyTimes=times([0, F_ENTER, 1]),
                    attributeName="transform",
                    additive="sum",
                ),
            )
        strip.append(g)

    slide_values = ["0,0"]
    slide_times = [0.0]
    for step in range(1, DAYS_PER_LOOP + 1):
        x = -step * SLOT
        slide_times.append(step * F_STEP - (F_STEP - F_ENTER))
        slide_values.append(f"{x},0")
        slide_times.append(step * F_STEP)
        slide_values.append(f"{x},0")
    splines = ";".join([EASE] * (len(slide_times) - 1))
    strip.append_anim(
        draw.AnimateTransform(
            "translate",
            LOOP_DUR,
            from_or_values=";".join(slide_values),
            begin="0s",
            repeatCount="indefinite",
            calcMode="spline",
            keyTimes=times(slide_times),
            keySplines=splines,
        ),
    )

    window = draw.Group(clip_path=clip)
    window.append(strip)
    return window


def falling_values(spec: dict) -> list[draw.DrawingElement]:
    """The value that drops off the belt and travels to the total.

    The text sits at its start point with opacity 0 as its own base
    attributes, not just as an animated state: a viewer that ignores SMIL
    entirely (a static PNG render, an old reader) must still see a
    complete, on-canvas first frame, not four "+N" labels stacked at the
    origin. `animateMotion`'s path is relative to that base point.
    """
    cycle = spec["cycle"]
    sx, sy = FALL_START
    ex, ey = FALL_END
    dx, dy = ex - sx, ey - sy
    path = f"M0 0 C 0 36, {dx - 90} {dy - 8}, {dx} {dy}"
    parts = []
    for k, value in enumerate(cycle):
        t = draw.Text(f"+{value}", 13, sx, sy, text_anchor="middle", class_="fall", opacity=0)
        t.append_anim(
            draw.AnimateMotion(
                path=path,
                dur=LOOP_DUR,
                keyPoints=times([0, 0, 1, 1]),
                keyTimes=times([0, F_ENTER, F_FALL, 1]),
                calcMode="linear",
                begin=f"{k * DAY_SECONDS}s",
                repeatCount="indefinite",
            ),
        )
        t.append_anim(
            draw.Animate(
                "opacity",
                LOOP_DUR,
                # Held invisible through the slide, pops in the instant the
                # value starts falling (the repeated F_ENTER keyTime makes
                # that a snap, not a fade), then fades out as it lands.
                from_or_values="0;0;1;0;0",
                begin=f"{k * DAY_SECONDS}s",
                repeatCount="indefinite",
                keyTimes=times([0, F_ENTER, F_ENTER, F_FALL, 1]),
            ),
        )
        parts.append(t)
    return parts


def total(spec: dict) -> list[draw.DrawingElement]:
    """The centred all-time total.

    A pulsing rounded box, four totals that toggle in turn, and the two
    captions beneath it.
    """
    parts: list[draw.DrawingElement] = []

    outer = draw.Group(transform=f"translate({TOTAL_CX} {TOTAL_CY})")
    pulse = draw.Group()
    pulse_values = ["1,1"]
    pulse_times = [0.0]
    for step in range(DAYS_PER_LOOP):
        base = step * F_STEP
        pulse_times += [base + F_FALL, base + (F_FALL + F_STEP) / 2, base + F_STEP]
        pulse_values += ["1.06,1.06", "1.06,1.06", "1,1"]
    pulse.append_anim(
        draw.AnimateTransform(
            "scale",
            LOOP_DUR,
            from_or_values=";".join(pulse_values),
            begin="0s",
            repeatCount="indefinite",
            calcMode="spline",
            keyTimes=times(pulse_times),
            keySplines=";".join([EASE] * (len(pulse_times) - 1)),
        ),
    )
    inner = draw.Group(transform=f"translate({-TOTAL_CX} {-TOTAL_CY})")
    frame = draw.Rectangle(
        TOTAL_BOX_X,
        TOTAL_BOX_Y,
        TOTAL_BOX_W,
        TOTAL_BOX_H,
        rx=14,
        fill=INK,
        fill_opacity=0.08,
        stroke=INK,
        stroke_width=1.5,
    )
    # A brief accent border while a value is landing: two `set`s racing on
    # the same attribute, each repeating every loop, so the later of the
    # two most-recent begins always wins (SMIL's sandwich rule) and the
    # border toggles ink/accent on a fixed two-second cadence.
    land_on = [k * DAY_SECONDS + F_FALL * LOOP_SECONDS for k in range(DAYS_PER_LOOP)]
    land_off = [k * DAY_SECONDS + F_STEP * LOOP_SECONDS for k in range(DAYS_PER_LOOP)]
    frame.append_anim(
        draw.Set(
            "stroke",
            dur=LOOP_DUR,
            to=ACCENT,
            begin=";".join(f"{num(t)}s" for t in land_on),
            repeatCount="indefinite",
        ),
    )
    frame.append_anim(
        draw.Set(
            "stroke",
            dur=LOOP_DUR,
            to=INK,
            begin=";".join(f"{num(t)}s" for t in land_off),
            repeatCount="indefinite",
        ),
    )
    inner.append(frame)
    # Each total ticks in the instant its own value lands (F_FALL into its
    # step), so the digit change lines up with the falling value and the
    # border flash above. The last total holds through the loop seam: a
    # fifth tick to a fifth total is dropped by design (see the spec note).
    totals = spec["totals"]
    boundaries = [k * F_STEP + F_FALL for k in range(DAYS_PER_LOOP)]
    for i, value in enumerate(totals):
        if i == 0:
            key_times, values = [0, boundaries[0]], [1, 0]
        elif i == len(totals) - 1:
            key_times, values = [0, boundaries[i - 1]], [0, 1]
        else:
            key_times, values = [0, boundaries[i - 1], boundaries[i]], [0, 1, 0]
        text = draw.Text(
            value,
            26,
            TOTAL_CX,
            TOTAL_TEXT_Y,
            text_anchor="middle",
            class_="total",
            opacity=values[0],
        )
        text.append_anim(
            draw.Animate(
                "opacity",
                LOOP_DUR,
                from_or_values=times(values),
                begin="0s",
                repeatCount="indefinite",
                calcMode="discrete",
                keyTimes=times(key_times),
            ),
        )
        inner.append(text)
    pulse.append(inner)
    outer.append(pulse)
    parts.append(outer)

    parts.append(
        draw.Text(spec["total_caption"], 12, TOTAL_CX, CAPTION_Y, text_anchor="middle", class_="s"),
    )
    parts.append(
        draw.Text(spec["tagline"], 11, TOTAL_CX, TAGLINE_Y, text_anchor="middle", class_="xs"),
    )
    return parts


def render(spec: dict) -> str:
    """The whole hero SVG, built from spec's cycle of day values."""
    if not spec.get("cycle"):
        raise ValueError("spec cycle must hold at least one day value")
    vw, vh = spec["viewBox"]
    d = draw.Drawing(
        vw,
        vh,
        id_prefix="h",
        **{"role": "img", "aria-label": DESCRIPTION},
    )
    d.append(style_block())
    for el in title_and_endcaps(spec):
        d.append(el)
    for el in gone_trail(spec):
        d.append(el)
    d.append(belt(spec))
    for el in falling_values(spec):
        d.append(el)
    for el in total(spec):
        d.append(el)
    svg = d.as_svg(header="")
    svg = svg.replace(' xmlns:xlink="http://www.w3.org/1999/xlink"', "")
    if not svg.endswith("\n"):
        svg += "\n"
    return svg


def main(argv: list[str] | None = None) -> int:
    """Rebuild the hero SVG from the spec, or with --check, confirm it is already current."""
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


if __name__ == "__main__":  # pragma: no cover -- entry point, run by hand to redraw the svg
    sys.exit(main(sys.argv[1:]))
