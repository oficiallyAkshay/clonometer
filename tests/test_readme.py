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
    "OWNER/REPO/badges/clones.json&query=$.total_short&label=clones&suffix=%20all-time"
    "&logo=github&logoColor=white",
    "https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/"
    "OWNER/REPO/badges/clones.json&query=$.window.count&label=clones&suffix=%20in%2014%20days",
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


def test_the_mermaid_diagram_names_its_five_nodes() -> None:
    text = README.read_text("utf-8")
    start = text.index("```mermaid")
    end = text.index("```", start + len("```mermaid"))
    block = text[start:end]
    for node in ("cron", "traffic API", "ledger merge", "badges branch", "shields"):
        assert node in block, f"mermaid diagram is missing the {node!r} node"


def test_the_readme_wears_its_own_badge_made_from_the_first_recipe() -> None:
    """The repo's own badge is the recipe with this repository filled in, nothing else."""
    own = RECIPE_URLS[0].replace("OWNER/REPO", "oficiallyAkshay/clonometer")
    assert f'src="{own}"' in README.read_text(encoding="utf-8")
