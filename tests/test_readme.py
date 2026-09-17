"""The README and CONTRIBUTING stay internally consistent.

Stdlib only: no HTML or markdown parser, just enough regex to find the
links and images the house style allows (HTML `href`/`src` attributes and
markdown `[text](url)` / `![alt](url)`) and check they resolve.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
README = REPO_ROOT / "README.md"
CONTRIBUTING = REPO_ROOT / ".github" / "CONTRIBUTING.md"

RECIPE_URLS = (
    "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
    "OWNER/REPO/badges/clones.json&query=$.badge&label=clones&logo=github&logoColor=white",
    "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
    "OWNER/REPO/badges/views.json&query=$.badge&label=views&logo=github&logoColor=white",
    "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
    "OWNER/REPO/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time",
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


def test_the_readme_carries_both_dynamic_json_badge_recipes() -> None:
    text = README.read_text("utf-8")
    for recipe in RECIPE_URLS:
        assert recipe in text


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


def test_the_consumer_workflow_carries_the_required_pieces() -> None:
    text = README.read_text("utf-8")
    start = text.index("```yaml")
    end = text.index("```", start + len("```yaml"))
    block = text[start:end]
    assert "secrets.TRAFFIC_TOKEN" in block
    assert "concurrency" in block
    assert "oficiallyAkshay/clonometer@" in block


def test_the_readme_has_no_bare_http_link() -> None:
    for line in README.read_text("utf-8").splitlines():
        assert "http://" not in line, f"README has a bare http link: {line}"


def test_the_hero_graphic_is_committed_offline_and_shows_the_three_zones() -> None:
    svg = REPO_ROOT / "assets" / "loop.svg"
    assert svg.is_file()
    assert 'src="assets/loop.svg"' in README.read_text("utf-8")
    body = svg.read_text("utf-8")
    for label in (
        "What GitHub keeps",
        "What clonometer does, once a day",
        "What you get",
        "clones",
        "views",
        "clones.json",
        "views.json",
        "all-time",
    ):
        assert label in body, f"loop graphic is missing {label!r}"
    assert "http" not in body.replace("http://www.w3.org/2000/svg", "")
    assert "@import" not in body and "<image" not in body


def test_the_consumer_workflow_file_is_the_block_the_readme_shows() -> None:
    """One source for the workflow: the curl one-liner fetches exactly what the README prints."""
    text = README.read_text("utf-8")
    start = text.index("```yaml\n") + len("```yaml\n")
    end = text.index("```", start)
    template = (REPO_ROOT / ".github" / "consumer-workflow.yml").read_text("utf-8")
    assert text[start:end] == template
    assert "consumer-workflow.yml" in text


def test_the_agent_section_documents_every_key_in_the_example() -> None:
    text = README.read_text("utf-8")
    agents = text[text.index("## For agents") :]
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
        "last7_short",
        "total",
        "total_short",
        "window_short",
        "badge",
    ):
        assert f"`{key}`" in agents, f"For agents does not document {key}"
    assert text.rstrip().endswith("(.github/CONTRIBUTING.md).")


def test_the_readme_wears_its_own_badges_made_from_the_first_two_recipes() -> None:
    """The repo's own clones and views badges are the recipes with this repository filled in."""
    text = README.read_text(encoding="utf-8")
    for recipe in RECIPE_URLS[:2]:
        own = recipe.replace("OWNER/REPO", "oficiallyAkshay/clonometer")
        assert f'src="{own}"' in text


def test_the_hero_graphic_matches_its_committed_spec() -> None:
    """The SVG is drawn from the spec beside it; a stale SVG fails here, not in a reader's eye."""
    from scripts import draw_loop

    assert draw_loop.main(["--check"]) == 0
