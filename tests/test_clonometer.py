"""Tests for clonometer: the fetch, the ledger merge, the numbers file, and the CLI.

Nothing here opens a socket. ``urllib.request.urlopen`` is replaced with a
stand-in that serves a queue of canned answers, one per call, in the order
the module would make them (traffic first, then the previous ledger), and
records every request so tests can assert on the URL and the headers without
asking GitHub anything.

clonometer publishes numbers, not a badge: there is no label, message,
colour or shields endpoint document here, only a small JSON file a consumer
points their own dynamic badge at.
"""

from __future__ import annotations

import base64
import io
import json
import urllib.error
import urllib.request
from pathlib import Path

import pytest

import clonometer

REPO = "oficiallyAkshay/clonometer"
TODAY = "2026-09-17"


class FakeResponse(io.BytesIO):
    """Enough of an http response for ``json.load`` inside a ``with``."""

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


@pytest.fixture
def fake_http(monkeypatch: pytest.MonkeyPatch):
    """Install a urlopen stand-in fed by a queue, and record what it saw.

    Each queued item is served to the next call: a dict or list becomes a
    JSON 200, bytes becomes a raw (possibly non-JSON) 200, and an exception
    is raised as-is, the same shape ``urllib.request.urlopen`` itself would
    raise for a connection failure or a non-2xx status.
    """
    seen: list[urllib.request.Request] = []
    queue: list[object] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float | None = None):
        seen.append(request)
        result = queue.pop(0)
        if isinstance(result, Exception):
            raise result
        if isinstance(result, (bytes, bytearray)):
            return FakeResponse(bytes(result))
        return FakeResponse(json.dumps(result).encode("utf-8"))

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    class Handle:
        def queue(self, *results: object) -> None:
            queue.extend(results)

        @property
        def requests(self) -> list[urllib.request.Request]:
            return seen

    return Handle()


@pytest.fixture
def token_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(clonometer.TOKEN_ENV, "a-fine-grained-token")
    monkeypatch.delenv(clonometer.FALLBACK_TOKEN_ENV, raising=False)
    monkeypatch.delenv(clonometer.API_ROOT_ENV, raising=False)


@pytest.fixture
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clonometer, "today_utc", lambda: TODAY)


def traffic_payload(
    metric: str,
    rows: list[tuple[str, int, int]],
    *,
    count: int | None = None,
    uniques: int | None = None,
) -> dict:
    """A traffic response shaped the way GitHub shapes it, for either metric."""
    entries = [{"timestamp": f"{date}T00:00:00Z", "count": c, "uniques": u} for date, c, u in rows]
    return {
        "count": count if count is not None else sum(c for _, c, _ in rows),
        "uniques": uniques if uniques is not None else sum(u for _, _, u in rows),
        metric: entries,
    }


def contents_response(ledger: dict) -> dict:
    """A GitHub contents API response wrapping a ledger as base64 content."""
    encoded = base64.b64encode(json.dumps(ledger).encode("utf-8")).decode("ascii")
    return {"content": encoded, "encoding": "base64"}


def ledger(days: dict, *, since: str = TODAY, repo: str = REPO) -> dict:
    return {"schema": 1, "repo": repo, "since": since, "days": days}


def http_error(status: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://api.github.com/x", status, "error", {}, None)


# --------------------------------------------------------------------------
# merge
# --------------------------------------------------------------------------


def test_merge_appends_a_day_that_was_not_in_the_ledger() -> None:
    result = clonometer.merge(
        ledger({"2026-09-15": {"count": 3, "uniques": 2}}),
        [{"timestamp": "2026-09-16T00:00:00Z", "count": 5, "uniques": 4}],
    )
    assert result["days"] == {
        "2026-09-15": {"count": 3, "uniques": 2},
        "2026-09-16": {"count": 5, "uniques": 4},
    }


def test_merge_keeps_the_existing_day_when_it_is_already_the_larger_sample() -> None:
    result = clonometer.merge(
        ledger({"2026-09-15": {"count": 10, "uniques": 8}}),
        [{"timestamp": "2026-09-15T00:00:00Z", "count": 4, "uniques": 3}],
    )
    assert result["days"]["2026-09-15"] == {"count": 10, "uniques": 8}


def test_merge_replaces_a_partial_newest_day_with_a_larger_sample() -> None:
    """A day sampled mid-window is partial; a later run sees it grow."""
    result = clonometer.merge(
        ledger({"2026-09-17": {"count": 2, "uniques": 2}}),
        [{"timestamp": "2026-09-17T00:00:00Z", "count": 9, "uniques": 6}],
    )
    assert result["days"]["2026-09-17"] == {"count": 9, "uniques": 6}


def test_merge_never_removes_a_day_that_falls_out_of_the_current_sample() -> None:
    result = clonometer.merge(
        ledger({"2026-08-01": {"count": 1, "uniques": 1}}),
        [{"timestamp": "2026-09-17T00:00:00Z", "count": 2, "uniques": 2}],
    )
    assert "2026-08-01" in result["days"]
    assert result["days"]["2026-08-01"] == {"count": 1, "uniques": 1}


def test_merge_preserves_since_and_repo_from_the_previous_ledger() -> None:
    result = clonometer.merge(ledger({}, since="2026-01-01", repo=REPO), [])
    assert result["since"] == "2026-01-01"
    assert result["repo"] == REPO


def test_merge_skips_a_row_with_no_timestamp() -> None:
    result = clonometer.merge(ledger({}), [{"count": 5, "uniques": 1}])
    assert result["days"] == {}


# --------------------------------------------------------------------------
# lifetime and short
# --------------------------------------------------------------------------


def test_lifetime_is_the_sum_of_every_days_count_not_uniques() -> None:
    total = clonometer.lifetime(
        ledger(
            {
                "2026-09-15": {"count": 3, "uniques": 100},
                "2026-09-16": {"count": 7, "uniques": 100},
            }
        )
    )
    assert total == 10


@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (999, "999"),
        (1000, "1,000"),
        (9999, "9,999"),
        (10000, "10k"),
        (12345, "12.3k"),
        (1234567, "1.2M"),
        (1000000, "1M"),
    ],
)
def test_short_formats_across_every_magnitude(n: int, expected: str) -> None:
    assert clonometer.short(n) == expected


# --------------------------------------------------------------------------
# guard
# --------------------------------------------------------------------------


def test_guard_allows_a_total_that_grew_or_held_steady() -> None:
    clonometer.guard(100, 50)
    clonometer.guard(50, 50)


def test_guard_refuses_a_total_that_shrank() -> None:
    with pytest.raises(clonometer.ClonometerError, match="smaller than the previous total"):
        clonometer.guard(40, 50)


# --------------------------------------------------------------------------
# numbers
# --------------------------------------------------------------------------


def test_numbers_matches_the_contract_shape_exactly() -> None:
    document = clonometer.numbers(
        REPO,
        "clones",
        since=TODAY,
        updated="2026-10-01",
        window_count=123,
        window_uniques=45,
        total=50123,
        last7=61,
    )
    assert document == {
        "schema": 1,
        "repo": REPO,
        "metric": "clones",
        "since": TODAY,
        "updated": "2026-10-01",
        "window": {"days": 14, "count": 123, "uniques": 45},
        "last7": 61,
        "last7_short": "61",
        "total": 50123,
        "total_short": "50.1k",
        "window_short": "123",
        "badge": "61 (7d) " + chr(0x2022) + " 50.1k (all-time)",
    }


def test_numbers_short_forms_use_the_same_rules_as_short() -> None:
    document = clonometer.numbers(
        REPO,
        "views",
        since=TODAY,
        updated=TODAY,
        window_count=10000,
        window_uniques=1,
        total=999,
        last7=12345,
    )
    assert document["window_short"] == "10k"
    assert document["total_short"] == "999"
    assert document["last7_short"] == "12.3k"
    assert document["badge"] == "12.3k (7d) " + chr(0x2022) + " 999 (all-time)"


def test_recent_sums_counts_over_the_last_seven_days_ending_on_updated() -> None:
    """Seven calendar days inclusive of the end day; older rows and future rows are out."""
    days = {
        "2026-09-10": {"count": 100, "uniques": 1},
        "2026-09-11": {"count": 1, "uniques": 1},
        "2026-09-14": {"count": 2, "uniques": 1},
        "2026-09-17": {"count": 4, "uniques": 1},
        "2026-09-18": {"count": 1000, "uniques": 1},
    }
    assert clonometer.recent(ledger(days), "2026-09-17", 7) == 7
    assert clonometer.recent(ledger(days), "2026-09-17", 1) == 4
    assert clonometer.recent(ledger({}), "2026-09-17", 7) == 0


# --------------------------------------------------------------------------
# parse_metrics
# --------------------------------------------------------------------------


def test_parse_metrics_accepts_clones_alone() -> None:
    assert clonometer.parse_metrics("clones") == ["clones"]


def test_parse_metrics_accepts_clones_and_views() -> None:
    assert clonometer.parse_metrics("clones,views") == ["clones", "views"]


@pytest.mark.parametrize("value", ["views", "clones, views", "views,clones", "", "clones,clones"])
def test_parse_metrics_refuses_anything_else(value: str) -> None:
    with pytest.raises(clonometer.ClonometerError, match="--metrics"):
        clonometer.parse_metrics(value)


# --------------------------------------------------------------------------
# fetch_traffic
# --------------------------------------------------------------------------


def test_fetch_traffic_asks_the_clones_endpoint_for_daily_rows(fake_http) -> None:
    fake_http.queue(traffic_payload("clones", [("2026-09-17", 5, 3)]))
    payload = clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")
    assert payload["count"] == 5
    request = fake_http.requests[0]
    assert request.full_url == f"{clonometer.DEFAULT_API_ROOT}/repos/{REPO}/traffic/clones?per=day"


def test_fetch_traffic_asks_the_views_endpoint_and_reads_the_views_key(fake_http) -> None:
    fake_http.queue(traffic_payload("views", [("2026-09-17", 8, 6)]))
    payload = clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "views")
    request = fake_http.requests[0]
    assert request.full_url == f"{clonometer.DEFAULT_API_ROOT}/repos/{REPO}/traffic/views?per=day"
    assert payload["views"][0]["count"] == 8


def test_fetch_traffic_sends_the_required_headers(fake_http) -> None:
    fake_http.queue(traffic_payload("clones", []))
    clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-fine-grained-token", "clones")
    request = fake_http.requests[0]
    assert request.get_header("Accept") == "application/vnd.github+json"
    assert request.get_header("Authorization") == "Bearer a-fine-grained-token"
    assert request.get_header("X-github-api-version") == "2022-11-28"
    assert request.get_header("User-agent") == "clonometer"


@pytest.mark.parametrize("status", [403, 404])
def test_fetch_traffic_names_administration_read_on_403_or_404(fake_http, status: int) -> None:
    fake_http.queue(http_error(status))
    with pytest.raises(clonometer.ClonometerError, match="Administration read"):
        clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")


def test_fetch_traffic_refuses_other_http_statuses_without_naming_a_permission(fake_http) -> None:
    fake_http.queue(http_error(500))
    with pytest.raises(clonometer.ClonometerError) as excinfo:
        clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")
    assert "Administration read" not in str(excinfo.value)
    assert "500" in str(excinfo.value)


def test_fetch_traffic_refuses_an_unreachable_host(fake_http) -> None:
    fake_http.queue(urllib.error.URLError("name resolution failed"))
    with pytest.raises(clonometer.ClonometerError, match="could not be reached"):
        clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")


def test_fetch_traffic_refuses_a_body_that_is_not_json(fake_http) -> None:
    fake_http.queue(b"<html>upstream said no</html>")
    with pytest.raises(clonometer.ClonometerError, match="did not answer with JSON"):
        clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")


def test_fetch_traffic_refuses_a_body_that_is_not_an_object(fake_http) -> None:
    fake_http.queue([{"count": 1}])
    with pytest.raises(clonometer.ClonometerError, match="something other than an object"):
        clonometer.fetch_traffic(clonometer.DEFAULT_API_ROOT, REPO, "a-token", "clones")


# --------------------------------------------------------------------------
# read_ledger
# --------------------------------------------------------------------------


def test_read_ledger_decodes_the_base64_content(fake_http) -> None:
    stored = ledger({"2026-09-16": {"count": 4, "uniques": 3}}, since="2026-09-01")
    fake_http.queue(contents_response(stored))
    result = clonometer.read_ledger(
        clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
    )
    assert result == stored
    request = fake_http.requests[0]
    assert request.full_url == (
        f"{clonometer.DEFAULT_API_ROOT}/repos/{REPO}/contents/clones-ledger.json?ref=badges"
    )


def test_read_ledger_on_404_starts_an_empty_ledger_with_todays_since(fake_http) -> None:
    fake_http.queue(http_error(404))
    result = clonometer.read_ledger(
        clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
    )
    assert result == {"schema": 1, "repo": REPO, "since": TODAY, "days": {}}


def test_read_ledger_refuses_a_non_404_status(fake_http) -> None:
    fake_http.queue(http_error(500))
    with pytest.raises(clonometer.ClonometerError, match="500"):
        clonometer.read_ledger(
            clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
        )


def test_read_ledger_refuses_a_response_with_no_content_field(fake_http) -> None:
    fake_http.queue({"type": "file"})
    with pytest.raises(clonometer.ClonometerError, match="content"):
        clonometer.read_ledger(
            clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
        )


def test_read_ledger_refuses_content_that_is_not_valid_json(fake_http) -> None:
    encoded = base64.b64encode(b"not json at all").decode("ascii")
    fake_http.queue({"content": encoded})
    with pytest.raises(clonometer.ClonometerError, match="not valid JSON"):
        clonometer.read_ledger(
            clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
        )


def test_read_ledger_refuses_the_wrong_schema_version(fake_http) -> None:
    bad = {"schema": 2, "repo": REPO, "since": TODAY, "days": {}}
    fake_http.queue(contents_response(bad))
    with pytest.raises(clonometer.ClonometerError, match="schema"):
        clonometer.read_ledger(
            clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
        )


def test_read_ledger_refuses_days_that_is_not_a_dict(fake_http) -> None:
    bad = {"schema": 1, "repo": REPO, "since": TODAY, "days": []}
    fake_http.queue(contents_response(bad))
    with pytest.raises(clonometer.ClonometerError, match="schema"):
        clonometer.read_ledger(
            clonometer.DEFAULT_API_ROOT, REPO, "badges", "a-token", "clones-ledger.json", TODAY
        )


# --------------------------------------------------------------------------
# CLI: read-only mode
# --------------------------------------------------------------------------


def test_cli_read_only_prints_the_window_and_lifetime_and_writes_nothing(
    fake_http, token_env, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 100, 40)], count=100),
        contents_response(ledger({"2026-09-16": {"count": 50023, "uniques": 1}}, since=TODAY)),
    )
    monkeypatch.setattr(
        clonometer,
        "write",
        lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("write must not be called in read-only mode")
        ),
    )
    assert clonometer.main([REPO]) == 0
    out = capsys.readouterr().out.strip()
    assert out == f"clones: 100 (14d), 50,123 (all-time), since {TODAY}"


def test_cli_read_only_never_calls_write_even_on_success(fake_http, token_env, monkeypatch) -> None:
    calls: list[object] = []
    monkeypatch.setattr(clonometer, "write", lambda *a, **k: calls.append(a))
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 1, 1)]),
        http_error(404),
    )
    assert clonometer.main([REPO]) == 0
    assert calls == []


# --------------------------------------------------------------------------
# CLI: write mode
# --------------------------------------------------------------------------


def test_cli_write_mode_writes_exactly_the_expected_files_for_clones_only(
    fake_http, token_env, frozen_today, tmp_path: Path
) -> None:
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 12, 9)], count=12, uniques=9),
        http_error(404),
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 0
    assert sorted(p.name for p in out_dir.iterdir()) == ["clones-ledger.json", "clones.json"]

    raw_numbers = (out_dir / "clones.json").read_text(encoding="utf-8")
    assert raw_numbers.endswith("\n")
    numbers_doc = json.loads(raw_numbers)
    assert numbers_doc == {
        "schema": 1,
        "repo": REPO,
        "metric": "clones",
        "since": TODAY,
        "updated": TODAY,
        "window": {"days": 14, "count": 12, "uniques": 9},
        "last7": 12,
        "last7_short": "12",
        "total": 12,
        "total_short": "12",
        "window_short": "12",
        "badge": "12 (7d) " + chr(0x2022) + " 12 (all-time)",
    }
    # sort_keys=True, so the file's own top-level key order is alphabetical.
    assert list(numbers_doc.keys()) == [
        "badge",
        "last7",
        "last7_short",
        "metric",
        "repo",
        "schema",
        "since",
        "total",
        "total_short",
        "updated",
        "window",
        "window_short",
    ]

    raw_ledger = (out_dir / "clones-ledger.json").read_text(encoding="utf-8")
    assert raw_ledger.endswith("\n")
    assert list(json.loads(raw_ledger).keys()) == ["days", "repo", "schema", "since"]
    ledger_doc = json.loads(raw_ledger)
    assert ledger_doc == {
        "schema": 1,
        "repo": REPO,
        "since": TODAY,
        "days": {"2026-09-17": {"count": 12, "uniques": 9}},
    }


def test_cli_write_mode_creates_a_nested_directory_that_does_not_exist_yet(
    fake_http, token_env, tmp_path: Path
) -> None:
    fake_http.queue(traffic_payload("clones", []), http_error(404))
    out_dir = tmp_path / "nested" / "numbers"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 0
    assert out_dir.is_dir()


def test_cli_write_mode_with_both_metrics_writes_four_files_and_shares_the_code_path(
    fake_http, token_env, frozen_today, tmp_path: Path
) -> None:
    """Views differs from clones only in endpoint, file names and the metric field."""
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 3, 2)], count=3),
        http_error(404),
        traffic_payload("views", [("2026-09-17", 7, 5)], count=7),
        http_error(404),
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--metrics", "clones,views", "--write", str(out_dir)]) == 0

    assert sorted(p.name for p in out_dir.iterdir()) == [
        "clones-ledger.json",
        "clones.json",
        "views-ledger.json",
        "views.json",
    ]
    urls = [request.full_url for request in fake_http.requests]
    assert urls[0].endswith("/traffic/clones?per=day")
    assert urls[2].endswith("/traffic/views?per=day")
    assert urls[1].endswith("/contents/clones-ledger.json?ref=badges")
    assert urls[3].endswith("/contents/views-ledger.json?ref=badges")

    clones_doc = json.loads((out_dir / "clones.json").read_text(encoding="utf-8"))
    views_doc = json.loads((out_dir / "views.json").read_text(encoding="utf-8"))
    assert clones_doc["metric"] == "clones"
    assert views_doc["metric"] == "views"
    assert clones_doc["window"]["count"] == 3
    assert views_doc["window"]["count"] == 7


def test_cli_write_mode_takes_the_window_uniques_from_the_payload_not_the_ledger(
    fake_http, token_env, frozen_today, tmp_path: Path
) -> None:
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 5, 1)], count=5, uniques=99),
        http_error(404),
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 0
    document = json.loads((out_dir / "clones.json").read_text(encoding="utf-8"))
    assert document["window"] == {"days": 14, "count": 5, "uniques": 99}


def test_cli_write_mode_total_is_the_lifetime_sum_from_the_merged_ledger_not_the_window(
    fake_http, token_env, frozen_today, tmp_path: Path
) -> None:
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 5, 1)], count=5),
        contents_response(
            ledger({"2026-09-01": {"count": 50000, "uniques": 1}}, since="2026-09-01")
        ),
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 0
    document = json.loads((out_dir / "clones.json").read_text(encoding="utf-8"))
    assert document["total"] == 50005
    assert document["total_short"] == "50k"
    assert document["window"]["count"] == 5
    assert document["since"] == "2026-09-01"


# --------------------------------------------------------------------------
# CLI: failure paths write nothing and stop before or without a full run
# --------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["views", "clones;views"])
def test_cli_refuses_a_bad_metrics_value_before_any_request(
    fake_http, token_env, tmp_path: Path, value: str
) -> None:
    out_dir = tmp_path / "out"
    args = [REPO, "--metrics", value, "--write", str(out_dir)]
    assert clonometer.main(args) == 1
    assert fake_http.requests == []
    assert not out_dir.exists()


def test_cli_refuses_a_missing_token_before_any_request(
    fake_http, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv(clonometer.TOKEN_ENV, raising=False)
    monkeypatch.delenv(clonometer.FALLBACK_TOKEN_ENV, raising=False)
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert fake_http.requests == []
    assert not out_dir.exists()
    error = capsys.readouterr().err
    assert clonometer.TOKEN_ENV in error


def test_cli_falls_back_to_github_token_when_clonometer_token_is_unset(
    fake_http, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(clonometer.TOKEN_ENV, raising=False)
    monkeypatch.setenv(clonometer.FALLBACK_TOKEN_ENV, "a-github-actions-token")
    fake_http.queue(traffic_payload("clones", []), http_error(404))
    assert clonometer.main([REPO]) == 0
    assert fake_http.requests[0].get_header("Authorization") == "Bearer a-github-actions-token"


def test_cli_honours_a_clonometer_api_override(
    fake_http, monkeypatch: pytest.MonkeyPatch, token_env
) -> None:
    monkeypatch.setenv(clonometer.API_ROOT_ENV, "http://127.0.0.1:9999")
    fake_http.queue(traffic_payload("clones", []), http_error(404))
    assert clonometer.main([REPO]) == 0
    assert fake_http.requests[0].full_url.startswith("http://127.0.0.1:9999/")


def test_cli_write_mode_writes_nothing_on_403(
    fake_http, token_env, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_http.queue(http_error(403))
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()
    assert "Administration read" in capsys.readouterr().err


def test_cli_write_mode_writes_nothing_on_404(
    fake_http, token_env, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_http.queue(http_error(404))
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()
    assert "Administration read" in capsys.readouterr().err


def test_cli_write_mode_writes_nothing_on_a_500_from_the_traffic_endpoint(
    fake_http, token_env, tmp_path: Path
) -> None:
    fake_http.queue(http_error(500))
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()


def test_cli_write_mode_writes_nothing_when_the_ledger_body_is_bad_json(
    fake_http, token_env, tmp_path: Path
) -> None:
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 1, 1)]),
        {"content": base64.b64encode(b"not json").decode("ascii")},
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()


def test_cli_write_mode_writes_nothing_when_the_ledger_schema_is_wrong(
    fake_http, token_env, tmp_path: Path
) -> None:
    bad = {"schema": 2, "repo": REPO, "since": TODAY, "days": {}}
    fake_http.queue(traffic_payload("clones", [("2026-09-17", 1, 1)]), contents_response(bad))
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()


def test_cli_write_mode_writes_nothing_when_a_later_metric_fails(
    fake_http, token_env, tmp_path: Path
) -> None:
    """A failure on the second metric must not leave the first metric's files behind."""
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 1, 1)]),
        http_error(404),
        http_error(403),
    )
    out_dir = tmp_path / "out"
    args = [REPO, "--metrics", "clones,views", "--write", str(out_dir)]
    assert clonometer.main(args) == 1
    assert not out_dir.exists()


def test_cli_write_mode_writes_nothing_when_the_guard_refuses_a_shrinking_total(
    fake_http,
    token_env,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Merge can only grow a total, so this forces the refusal by faking merge itself."""
    monkeypatch.setattr(clonometer, "merge", lambda previous, rows: ledger({}, since=TODAY))
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 1, 1)]),
        contents_response(ledger({"2026-09-01": {"count": 500, "uniques": 1}})),
    )
    out_dir = tmp_path / "out"
    assert clonometer.main([REPO, "--write", str(out_dir)]) == 1
    assert not out_dir.exists()
    assert "smaller than the previous total" in capsys.readouterr().err


def test_short_switches_to_millions_when_rounding_would_read_a_thousand_k() -> None:
    """999,950 rounds to 1000.0k, which is 1M, never '1000k'."""
    assert clonometer.short(999_949) == "999.9k"
    assert clonometer.short(999_950) == "1M"
    assert clonometer.short(999_999) == "1M"


def test_a_non_numeric_count_from_the_endpoint_is_one_line_not_a_traceback(
    fake_http, token_env, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_http.queue(traffic_payload("clones", [("2026-09-17", "abc", 1)], count=5), http_error(404))
    assert clonometer.main([REPO, "--write", str(tmp_path / "out")]) == 1
    captured = capsys.readouterr()
    assert captured.err.count("\n") == 1 and "non-numeric count" in captured.err
    assert captured.out == ""
    assert not (tmp_path / "out").exists()


def test_a_write_target_that_is_a_file_is_one_line_not_a_traceback(
    fake_http, token_env, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_http.queue(traffic_payload("clones", [("2026-09-17", 5, 1)], count=5), http_error(404))
    target = tmp_path / "taken"
    target.write_text("a file, not a directory", encoding="utf-8")
    assert clonometer.main([REPO, "--write", str(target)]) == 1
    captured = capsys.readouterr()
    assert captured.err.count("\n") == 1 and "could not write into" in captured.err
    assert captured.out == ""


def test_a_repository_that_is_not_owner_slash_name_is_refused_before_any_request(
    fake_http, token_env, capsys: pytest.CaptureFixture[str]
) -> None:
    for bad in ("owner", "owner/", "/name", "owner/name/", "owner/na me"):
        assert clonometer.main([bad]) == 1, bad
        assert "owner/name" in capsys.readouterr().err
    assert fake_http.requests == []


def test_a_trailing_slash_on_the_api_root_does_not_double_the_slash(
    fake_http, token_env, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(clonometer.API_ROOT_ENV, "https://ghe.example/api/v3/")
    fake_http.queue(traffic_payload("clones", [("2026-09-17", 5, 1)], count=5), http_error(404))
    assert clonometer.main([REPO]) == 0
    assert fake_http.requests[0].full_url.startswith("https://ghe.example/api/v3/repos/")


def test_a_bad_timestamp_from_the_endpoint_is_one_line_not_a_traceback(
    fake_http, token_env, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    payload = traffic_payload("clones", [("2026-09-17", 5, 1)], count=5)
    payload["clones"][0]["timestamp"] = "not-a-real-timestamp"
    fake_http.queue(payload, http_error(404))
    assert clonometer.main([REPO, "--write", str(tmp_path / "out")]) == 1
    captured = capsys.readouterr()
    assert captured.err.count("\n") == 1 and "bad timestamp" in captured.err
    assert not (tmp_path / "out").exists()


def test_a_ledger_with_a_day_key_that_is_not_a_date_is_refused(
    fake_http, token_env, capsys: pytest.CaptureFixture[str]
) -> None:
    """A corrupt ledger is refused outright rather than parsed as far as it goes."""
    fake_http.queue(
        traffic_payload("clones", [("2026-09-17", 5, 1)], count=5),
        contents_response(ledger({"not-a-date": {"count": 1, "uniques": 1}})),
    )
    assert clonometer.main([REPO]) == 1
    captured = capsys.readouterr()
    assert captured.err.count("\n") == 1 and "ledger schema" in captured.err
