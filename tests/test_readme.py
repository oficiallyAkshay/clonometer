"""The README and CONTRIBUTING stay internally consistent.

Stdlib only: no HTML or markdown parser, just enough regex to find the
links and images the house style allows (HTML `href`/`src` attributes and
markdown `[text](url)` / `![alt](url)`) and check they resolve.
"""

from __future__ import annotations

import re
from pathlib import Path

from scripts import draw_loop

REPO_ROOT = Path(__file__).resolve().parents[1]
README = REPO_ROOT / "README.md"
CONTRIBUTING = REPO_ROOT / ".github" / "CONTRIBUTING.md"

RECIPE_URLS = (
    (
        "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
        "OWNER/REPO/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"
    ),
    (
        "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
        "OWNER/REPO/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white"
    ),
    (
        "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
        "OWNER/REPO/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time"
    ),
)

GIST_RECIPE_URL = (
    "https://img.shields.io/badge/dynamic/json?url=https://gist.githubusercontent.com/"
    "OWNER/GIST_ID/raw/clones.json&query=$.badge&label=clones&logo=github&logoColor=white"
)

LINK_RE = re.compile(r'(?:href|src)="([^"]+)"|\]\(([^)\s]+)\)')


def _links(text: str) -> list[str]:
    """Every href, src or markdown link target found in text."""
    found = []
    for attr, markdown in LINK_RE.findall(text):
        found.append(attr or markdown)
    return found


def _local_links(text: str) -> list[str]:
    """Links that point at a file in this repository, not a URL or an anchor."""
    return [
        link
        for link in _links(text)
        if link and not link.startswith(("http://", "https://", "#", "mailto:"))
    ]


def test_contributing_carries_the_badge_recipe() -> None:
    """The generic OWNER/REPO and OWNER/GIST_ID recipes live in CONTRIBUTING, not the README."""
    text = CONTRIBUTING.read_text("utf-8")
    assert RECIPE_URLS[0] in text
    assert GIST_RECIPE_URL in text


def test_the_readme_ships_no_generic_recipe_placeholder() -> None:
    """The README shows only its own live badges; OWNER/REPO belongs to CONTRIBUTING."""
    text = README.read_text("utf-8")
    assert "OWNER/REPO" not in text
    assert "OWNER/GIST_ID" not in text


def test_the_readme_ships_numbers_not_a_shields_endpoint() -> None:
    text = README.read_text("utf-8")
    assert "img.shields.io/endpoint" not in text


def test_relative_links_in_the_readme_resolve_to_a_file() -> None:
    for link in _local_links(README.read_text("utf-8")):
        target = (README.parent / link).resolve()
        assert target.is_file(), f"README links to missing file: {link}"


def test_relative_links_in_contributing_resolve_to_a_file() -> None:
    for link in _local_links(CONTRIBUTING.read_text("utf-8")):
        target = (CONTRIBUTING.parent / link).resolve()
        assert target.is_file(), f"CONTRIBUTING links to missing file: {link}"


def test_the_readme_has_no_bare_http_link() -> None:
    for line in README.read_text("utf-8").splitlines():
        assert "http://" not in line, f"README has a bare http link: {line}"


def test_the_hero_graphic_is_committed_offline_and_shows_the_belt() -> None:
    svg = REPO_ROOT / "assets" / "loop.svg"
    assert svg.is_file()
    text = README.read_text("utf-8")
    assert 'src="assets/loop.svg"' in text
    body = svg.read_text("utf-8")
    for label in (
        "GitHub keeps 14 days",
        "today",
        "oldest",
        "gone",
        "all-time",
        "clonometer catches every day",
    ):
        assert label in body, f"loop graphic is missing {label!r}"
    assert "http" not in body.replace("http://www.w3.org/2000/svg", "")
    assert "@import" not in body and "<image" not in body


def test_the_badge_rows_sit_below_the_hero_image() -> None:
    """Both badge rows read below the loop, not above it, so the animation greets first."""
    text = README.read_text("utf-8")
    hero_index = text.index('src="assets/loop.svg"')
    top_row_index = text.index("codecov.io/gh/oficiallyAkshay/clonometer")
    counts_row_index = text.index(
        "raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/clones.json&query=$.badge"
    )
    assert hero_index < top_row_index
    assert hero_index < counts_row_index


def test_the_contributing_workflow_snippet_matches_the_consumer_workflow_file() -> None:
    """One source for the workflow shape: CONTRIBUTING's yaml block never drifts."""
    text = CONTRIBUTING.read_text("utf-8")
    template = REPO_ROOT / ".github" / "consumer-workflow.yml"
    assert template.is_file()
    template_text = template.read_text("utf-8")

    yaml_block_match = re.search(r"```yaml\n(.*?)```", text, re.DOTALL)
    assert yaml_block_match, "CONTRIBUTING has no fenced yaml workflow block"
    yaml_block = yaml_block_match.group(1)
    assert yaml_block.count("\n") < 12, "the workflow snippet should stay under 12 lines"

    contributing_uses = re.search(r"uses:\s*(\S+)", yaml_block)
    template_uses = re.search(r"uses:\s*(\S+)", template_text)
    assert contributing_uses and template_uses
    assert contributing_uses.group(1) == template_uses.group(1)

    contributing_cron = re.search(r'cron:\s*"([^"]+)"', yaml_block)
    template_cron = re.search(r'cron:\s*"([^"]+)"', template_text)
    assert contributing_cron and template_cron
    assert contributing_cron.group(1) == template_cron.group(1)

    assert "workflow_dispatch" in yaml_block
    assert "permissions: {}" in yaml_block
    assert text.index("## For agents") < text.index(yaml_block_match.group(0))
    assert "(.github/consumer-workflow.yml)" not in text
    assert "TRAFFIC_TOKEN" in text
    assert "mkdir" not in text and "curl" not in text
    assert "secrets.TRAFFIC_TOKEN" in template_text

    readme_text = README.read_text("utf-8")
    assert "```yaml" not in readme_text, "the workflow snippet moved out of the README"


def test_contributing_documents_every_key_in_the_numbers_file() -> None:
    text = CONTRIBUTING.read_text("utf-8")
    for key in (
        "schema",
        "repo",
        "metric",
        "since",
        "updated",
        "window.days",
        "window.count",
        "window.uniques",
        "last7",
        "total",
        "window_short",
        "badge",
    ):
        assert f"`{key}`" in text, f"CONTRIBUTING does not document {key}"
    assert "## For agents" not in README.read_text("utf-8")


def test_the_readme_wears_its_own_badges_made_from_the_first_two_recipes() -> None:
    """The repo's own clones and views badges are the recipes with this repository filled in."""
    text = README.read_text(encoding="utf-8")
    for recipe in RECIPE_URLS[:2]:
        own = recipe.replace("OWNER/REPO", "oficiallyAkshay/clonometer")
        assert f'src="{own}"' in text


def test_the_badges_section_is_a_six_cell_matrix_of_live_badges() -> None:
    """Clones and Views, each crossed with This week, All time and Both: six live badges."""
    text = README.read_text(encoding="utf-8")
    section_start = text.index("## Badges")
    section_end = text.index("## Security")
    section = text[section_start:section_end]

    assert "This week" in section
    assert "All time" in section
    assert "Both" in section
    assert "Clones" in section
    assert "Views" in section
    assert "Click a badge for its recipe; Both is the recommended shape." in section
    assert 'width="100%"' in section, "the badge matrix is a full-width HTML table"

    base = "https://raw.githubusercontent.com/oficiallyAkshay/clonometer/badges/"
    for metric in ("clones", "views"):
        for query, suffix in (
            ("$.last7_short", "suffix=%20this%20week"),
            ("$.total_short", "suffix=%20all-time"),
            ("$.badge", None),
        ):
            url = (
                f"https://img.shields.io/badge/dynamic/json?url={base}{metric}.json"
                f"&query={query}&label={metric}"
            )
            if suffix:
                url = f"{url}&{suffix}"
            assert url in section, f"missing matrix badge: {url}"

    # GitHub's own 14-day window badge is dropped from the matrix.
    assert "window_short" not in section
    assert "(github%2014d)" not in section


def test_the_hero_graphic_matches_its_committed_spec() -> None:
    """The SVG is drawn from the spec beside it; a stale SVG fails here, not in a reader's eye."""
    assert draw_loop.main(["--check"]) == 0
