#!/usr/bin/env python3
"""Keep a lifetime clone (and view) count for a GitHub repository.

GitHub only serves a rolling 14 day traffic window per repository, at
``GET /repos/{owner}/{repo}/traffic/clones``. Everything before that window
is gone the moment it falls off the end, so a lifetime total only exists if
something samples the window on a schedule and remembers what it already
saw. That memory is the ledger: one JSON file per metric, kept on a branch of
the same repository and read back through the contents API (which works for
private repos, unlike the raw URL) before every run.

Merging a new sample into the ledger takes the larger of the existing and new
value for each day, never the new value outright, because the newest day in
any given sample is usually a partial count that a later run will see grow.
No day is ever deleted, so the lifetime total (the sum of every day's count)
can only go up. A run that would make it go down is refused rather than
written, because a shrinking number is proof something upstream lied.

clonometer publishes numbers, not a badge: a small JSON file with the window
GitHub reported, the lifetime total, and a short form of each for a consumer
who wants to put either into a shields dynamic JSON badge of their own
choosing. This module has no opinion on label, colour or style.

This module is meant to be read top to bottom as a pipeline: fetch the
window, read the previous ledger, merge, total, guard, and only then write.
Every step is its own small function so a failure partway through never
leaves half of it on disk, and a single helper wraps the one network call
every other function needs, so tests can fake it once.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

TOKEN_ENV = "CLONOMETER_TOKEN"
FALLBACK_TOKEN_ENV = "GITHUB_TOKEN"
API_ROOT_ENV = "CLONOMETER_API"
DEFAULT_API_ROOT = "https://api.github.com"

DEFAULT_BRANCH = "badges"
DEFAULT_METRICS = "clones"
WINDOW_DAYS = 14
# The separator in the ready-made badge line, built from its code point so the
# character itself never has to survive an editor's autocorrect.
BULLET = chr(0x2022)

# Long enough for a slow API, short enough that a hung socket does not hold a
# runner for the job's whole timeout.
TIMEOUT_SECONDS = 30


class ClonometerError(Exception):
    """A failure the caller prints in one line and exits on."""


def _get_json(url: str, token: str) -> object:
    """GET url with the standard headers and return the parsed JSON body.

    This is the only function in the module that calls
    ``urllib.request.urlopen``, so a test suite fakes that one function and
    every code path above it, traffic and ledger alike, is exercised through
    it.
    """
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "clonometer",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read()
    except urllib.error.HTTPError:
        # Callers decide what a status means; the stdlib error carries it.
        raise
    except urllib.error.URLError as error:
        raise ClonometerError(f"{url} could not be reached: {error.reason}") from error
    try:
        return json.loads(body)
    except ValueError as error:
        raise ClonometerError(f"{url} did not answer with JSON: {error}") from error


def today_utc() -> str:
    """Today's date in UTC, as the ledger and the numbers file store it.

    Its own function so a test can point it at a fixed day instead of
    whatever day the suite happens to run on.
    """
    return datetime.now(UTC).date().isoformat()


def fetch_traffic(api_root: str, repo: str, token: str, metric: str) -> dict:
    """The decoded traffic payload for one metric ('clones' or 'views').

    A 403 or 404 here almost always means the token is missing
    Administration read on this repository, the one permission the traffic
    endpoints sit behind, so that is what the error says rather than just
    the status code.
    """
    url = f"{api_root}/repos/{repo}/traffic/{metric}?per=day"
    try:
        payload = _get_json(url, token)
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            raise ClonometerError(
                f"the {metric} endpoint answered HTTP {error.code} for {repo}; "
                f"{TOKEN_ENV} needs Administration read on this repository"
            ) from error
        raise ClonometerError(
            f"the {metric} endpoint answered HTTP {error.code} for {repo}"
        ) from error
    if not isinstance(payload, dict):
        raise ClonometerError(f"the {metric} endpoint answered with something other than an object")
    return payload


def read_ledger(
    api_root: str, repo: str, branch: str, token: str, file_name: str, today: str
) -> dict:
    """The previous ledger, or a freshly started one when there is none yet.

    A 404 here means either the storage branch or the file does not exist,
    which is exactly what the first run looks like, so it starts an empty
    ledger. Any other failure, a bad status, a body that will not decode, a
    schema that does not match, is refused rather than treated the same way,
    because silently restarting would erase the lifetime total this whole
    module exists to protect.
    """
    url = f"{api_root}/repos/{repo}/contents/{file_name}?ref={branch}"
    try:
        payload = _get_json(url, token)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {"schema": 1, "repo": repo, "since": today, "days": {}}
        raise ClonometerError(
            f"could not read {file_name} from the {branch} branch: HTTP {error.code}"
        ) from error
    if not isinstance(payload, dict) or "content" not in payload:
        raise ClonometerError(
            f"the contents endpoint answered without a content field for {file_name}"
        )
    try:
        raw = base64.b64decode(payload["content"])
        ledger = json.loads(raw)
    except (ValueError, TypeError) as error:
        raise ClonometerError(
            f"{file_name} on the {branch} branch is not valid JSON: {error}"
        ) from error
    if (
        not isinstance(ledger, dict)
        or ledger.get("schema") != 1
        or not isinstance(ledger.get("days"), dict)
    ):
        raise ClonometerError(
            f"{file_name} on the {branch} branch does not match the ledger schema"
        )
    return ledger


def _count(value: object, what: str) -> int:
    """An API figure as an int, or a one-line refusal when it is not a number."""
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as error:
        raise ClonometerError(f"the traffic endpoint answered with a non-numeric {what}") from error


def merge(ledger: dict, rows: list[dict]) -> dict:
    """The ledger with every row from a fresh sample merged in.

    Each row belongs to the day its timestamp falls on. For a day already in
    the ledger, both fields grow to the larger of what was there and what the
    new sample reports; a day the ledger has not seen is added outright. No
    day is ever removed, and the sample can never make a day smaller than a
    previous run already found it to be, so the merge is safe to run against
    the same day's partial count over and over as it fills in.
    """
    days = {date: dict(fields) for date, fields in ledger.get("days", {}).items()}
    for row in rows:
        date = str(row.get("timestamp", ""))[:10]
        if not date:
            continue
        count = _count(row.get("count", 0), "count")
        uniques = _count(row.get("uniques", 0), "uniques")
        existing = days.get(date, {"count": 0, "uniques": 0})
        days[date] = {
            "count": max(existing.get("count", 0), count),
            "uniques": max(existing.get("uniques", 0), uniques),
        }
    merged = dict(ledger)
    merged["days"] = days
    return merged


def lifetime(ledger: dict) -> int:
    """The lifetime total: the sum of every day's count. Uniques are never summed."""
    return sum(int(day.get("count", 0)) for day in ledger.get("days", {}).values())


def recent(ledger: dict, updated: str, days: int) -> int:
    """The count summed over the last ``days`` days of the ledger, ending on ``updated``.

    Counts add across days, unlike uniques, so this is GitHub's own per-day
    figures summed: an honest short window even though the endpoint only
    hands out a 14-day one.
    """
    end = date.fromisoformat(updated)
    start = end - timedelta(days=days - 1)
    return sum(
        int(fields.get("count", 0))
        for day, fields in ledger.get("days", {}).items()
        if start <= date.fromisoformat(day) <= end
    )


def guard(new_total: int, old_total: int) -> None:
    """Refuse a lifetime total that would go backwards.

    A correct merge can only ever grow the total, so a smaller one means
    something upstream is wrong, a corrupted ledger or a sample that does not
    belong to this repository, and the honest response is to write nothing
    rather than publish a number that quietly shrank.
    """
    if new_total < old_total:
        raise ClonometerError(
            f"the new lifetime total ({new_total}) is smaller than the previous total "
            f"({old_total}); refusing to write"
        )


def short(n: int) -> str:
    """A number the way the numbers file's short forms show it.

    Below 10,000 it is digits with thousands separators, because that is
    still the exact count. From 10,000 it switches to one decimal place with
    a k or M suffix, because a consumer badge has little room and the exact
    digit count stops being the interesting part of the number; a trailing
    '.0' is dropped so round figures read as round figures.
    """
    if n < 10_000:
        return f"{n:,}"
    value, suffix = n / 1_000, "k"
    # Decided after rounding, so 999,950 reads as 1M rather than 1000k.
    if round(value, 1) >= 1_000:
        value, suffix = n / 1_000_000, "M"
    text = f"{value:.1f}"
    if text.endswith(".0"):
        text = text[:-2]
    return f"{text}{suffix}"


def numbers(
    repo: str,
    metric: str,
    *,
    since: str,
    updated: str,
    window_count: int,
    window_uniques: int,
    total: int,
    last7: int,
) -> dict:
    """The numbers file for one metric.

    Plain data: the window GitHub reported for this run, the last seven days
    and the lifetime total from the merged ledger, a short form of each so a
    consumer's shields dynamic JSON badge does not have to reimplement the
    k/M rounding, and one ready-made badge line (seven days, a bullet, all
    time) for the consumer who wants both numbers in one badge.
    """
    return {
        "schema": 1,
        "repo": repo,
        "metric": metric,
        "since": since,
        "updated": updated,
        "window": {"days": WINDOW_DAYS, "count": window_count, "uniques": window_uniques},
        "last7": last7,
        "last7_short": short(last7),
        "total": total,
        "total_short": short(total),
        "window_short": short(window_count),
        "badge": f"{short(last7)} (7d) {BULLET} {short(total)} (all-time)",
    }


def write(out_dir: Path, metric: str, numbers_doc: dict, ledger_doc: dict) -> tuple[Path, Path]:
    """Write one metric's numbers and ledger files into out_dir, creating it if needed."""
    numbers_path = out_dir / f"{metric}.json"
    ledger_path = out_dir / f"{metric}-ledger.json"
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        numbers_path.write_text(
            json.dumps(numbers_doc, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        ledger_path.write_text(
            json.dumps(ledger_doc, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    except OSError as error:
        raise ClonometerError(f"could not write into {out_dir}: {error}") from error
    return numbers_path, ledger_path


def parse_metrics(value: str) -> list[str]:
    """The metric list for --metrics, which accepts exactly two spellings."""
    if value == "clones":
        return ["clones"]
    if value == "clones,views":
        return ["clones", "views"]
    raise ClonometerError(f"--metrics must be 'clones' or 'clones,views', got {value!r}")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="clonometer",
        description="Keep a lifetime clone (and view) count for a GitHub repository.",
    )
    parser.add_argument("repo", help="the repository, as owner/name")
    parser.add_argument(
        "--write", metavar="DIR", help="write the numbers and ledger files into DIR"
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH,
        help=f"branch the previous ledger is read from (default: {DEFAULT_BRANCH})",
    )
    parser.add_argument(
        "--metrics",
        default=DEFAULT_METRICS,
        help="'clones' or 'clones,views' (default: clones)",
    )
    return parser


def _compute(
    args: argparse.Namespace, token: str, api_root: str, today: str
) -> list[tuple[dict, dict]]:
    """Fetch, merge and total every requested metric before anything is written."""
    owner, _, name = args.repo.partition("/")
    if not owner or not name or "/" in name or any(c.isspace() for c in args.repo):
        raise ClonometerError(f"the repository must be given as owner/name, got {args.repo!r}")
    results: list[tuple[dict, dict]] = []
    for metric in parse_metrics(args.metrics):
        traffic = fetch_traffic(api_root, args.repo, token, metric)
        ledger_file = f"{metric}-ledger.json"
        previous = read_ledger(api_root, args.repo, args.branch, token, ledger_file, today)
        old_total = lifetime(previous)
        merged = merge(previous, traffic.get(metric) or [])
        new_total = lifetime(merged)
        guard(new_total, old_total)
        window_count = _count(traffic.get("count", 0), "count")
        window_uniques = _count(traffic.get("uniques", 0), "uniques")
        since = str(merged.get("since", today))
        numbers_doc = numbers(
            args.repo,
            metric,
            since=since,
            updated=today,
            window_count=window_count,
            window_uniques=window_uniques,
            total=new_total,
            last7=recent(merged, today, 7),
        )
        results.append((numbers_doc, merged))
    return results


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        token = (
            os.environ.get(TOKEN_ENV, "").strip() or os.environ.get(FALLBACK_TOKEN_ENV, "").strip()
        )
        if not token:
            raise ClonometerError(f"{TOKEN_ENV} is not set, so clonometer has no token to use")
        api_root = (os.environ.get(API_ROOT_ENV, "").strip() or DEFAULT_API_ROOT).rstrip("/")
        results = _compute(args, token, api_root, today_utc())
        if args.write:
            out_dir = Path(args.write)
            for doc, ledger_doc in results:
                numbers_path, ledger_path = write(out_dir, doc["metric"], doc, ledger_doc)
                print(
                    f"{doc['metric']}: wrote {numbers_path} and {ledger_path}: "
                    f"{doc['window']['count']:,} (14d), {doc['total']:,} (all-time)"
                )
    except ClonometerError as error:
        print(str(error), file=sys.stderr)
        return 1

    if not args.write:
        for doc, _ in results:
            print(
                f"{doc['metric']}: {doc['window']['count']:,} (14d), {doc['total']:,} (all-time), "
                f"since {doc['since']}"
            )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
