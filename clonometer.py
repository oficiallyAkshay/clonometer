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

Shields can read a public repository's branch straight off raw.githubusercontent.com,
but never a private one, so a private repository that still wants a badge
needs the numbers mirrored somewhere shields can reach. ``--gist`` does that:
in write mode, once the branch files are on disk, it PATCHes the same
numbers, never the ledgers, into a gist. The ledger stays the one source of
truth on the branch; the gist is a public window onto it.

This module is meant to be read top to bottom as a pipeline: fetch the
window, read the previous ledger, merge, total, guard, and only then write.
Every step is its own small function, and nothing is written until every
requested metric has passed the guard; the publish step that copies these
files onto the branch never runs after a failed write. A single helper wraps
the one network call every other function needs, so tests can fake it once.
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

TOKEN_ENV = "CLONOMETER_TOKEN"  # noqa: S105 -- an env var name, not a secret value
FALLBACK_TOKEN_ENV = "GITHUB_TOKEN"  # noqa: S105 -- an env var name, not a secret value
GIST_TOKEN_ENV = "CLONOMETER_GIST_TOKEN"  # noqa: S105 -- an env var name, not a secret value
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

HTTP_NOT_FOUND = 404
HTTP_FORBIDDEN = 403
# A ledger day key's exact length: "YYYY-MM-DD".
ISO_DATE_LENGTH = 10
# Below this, short() keeps every digit; at and above it, short() switches to
# one decimal place with a k/M/B suffix.
SHORT_FORM_THRESHOLD = 10_000
THOUSAND = 1_000
# A gist id is hexadecimal; GitHub's are 32 characters, but this allows some room.
GIST_ID_MIN_LENGTH = 20
GIST_ID_MAX_LENGTH = 40


class ClonometerError(Exception):
    """A failure the caller prints in one line and exits on."""


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """Refuse every redirect: a token must never follow a 3xx to another host."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        _fp: object,
        _code: int,
        _msg: object,
        _headers: object,
        newurl: str,
    ) -> None:
        message = (
            f"{req.full_url} answered with a redirect to {newurl}; "
            "clonometer does not follow redirects while carrying a token"
        )
        raise ClonometerError(message)


_OPENER = urllib.request.build_opener(_NoRedirects)


def _open(request: urllib.request.Request) -> http.client.HTTPResponse:
    """The one call that reaches the network; tests replace this function.

    ``check_api_root`` already refuses anything but https (or http to the
    local machine, for tests), but that guard lives one call away from the
    open itself; this one checks the scheme again, right where the network
    call actually happens.
    """
    if request.type not in ("http", "https"):
        raise ClonometerError(f"refusing to open a {request.type!r} URL")
    return _OPENER.open(request, timeout=TIMEOUT_SECONDS)


def check_api_root(api_root: str) -> str:
    """The API root with any trailing slash removed, if it is safe to send a token to.

    Only https, or plain http on the local machine for a test server: the
    token travels in a header, and clear text to any other host would hand
    it to the network.
    """
    root = api_root.strip().rstrip("/") or DEFAULT_API_ROOT
    parts = urllib.parse.urlsplit(root)
    if parts.scheme == "https" and parts.hostname:
        return root
    if parts.scheme == "http" and parts.hostname in ("localhost", "127.0.0.1"):
        return root
    raise ClonometerError(f"{API_ROOT_ENV} must start with https:// (got {root!r})")


def _request(url: str, token: str, method: str = "GET", body: dict | None = None) -> object:
    """The one call that reaches the network and returns the parsed JSON body.

    Every request, traffic, ledger and gist alike, goes through here on top
    of ``_open``, so a test suite fakes that one function and every code
    path above it is exercised through it. ``body``, when given, is sent as
    a JSON request body, the shape a gist PATCH needs; a plain GET never
    sets it.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "clonometer",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(  # noqa: S310 -- _open checks the scheme before opening it
        url, data=data, headers=headers, method=method
    )
    try:
        response = _open(request)
    except urllib.error.HTTPError:
        # Callers decide what a status means; the stdlib error carries it.
        raise
    except urllib.error.URLError as error:
        raise ClonometerError(f"{url} could not be reached: {error.reason}") from error
    # Headers arrived, but the connection can still drop, time out or hand
    # back a truncated body while the response is read. TimeoutError is an
    # OSError, so this also catches a timeout that lands after the connect.
    try:
        with response:
            response_body = response.read()
    except (OSError, http.client.HTTPException) as error:
        raise ClonometerError(f"{url} could not be read: {error}") from error
    try:
        return json.loads(response_body)
    except ValueError as error:
        raise ClonometerError(f"{url} did not answer with JSON: {error}") from error


def _get_json(url: str, token: str) -> object:
    """GET url with the standard headers and return the parsed JSON body."""
    return _request(url, token)


def today_utc() -> str:
    """Today's date in UTC, as the ledger and the numbers file store it.

    Its own function so a test can point it at a fixed day instead of
    whatever day the suite happens to run on.
    """
    return datetime.now(UTC).date().isoformat()


def fetch_traffic(
    api_root: str,
    repo: str,
    token: str,
    metric: str,
    token_source: str = TOKEN_ENV,
) -> dict:
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
            if token_source == FALLBACK_TOKEN_ENV:
                fix = (
                    f"{FALLBACK_TOKEN_ENV} can never read traffic; set the action's token "
                    f"input ({TOKEN_ENV}) to a fine-grained token with Administration read"
                )
            else:
                fix = "the token needs Administration read on this repository"
            raise ClonometerError(
                f"the {metric} endpoint answered HTTP {error.code} for {repo}; {fix}",
            ) from error
        raise ClonometerError(
            f"the {metric} endpoint answered HTTP {error.code} for {repo}",
        ) from error
    if not isinstance(payload, dict):
        raise ClonometerError(f"the {metric} endpoint answered with something other than an object")
    rows = payload.get(metric)
    if rows is not None and not isinstance(rows, list):
        raise ClonometerError(
            f"the {metric} endpoint answered with something other than a list under {metric!r}"
        )
    return payload


def read_ledger(
    api_root: str,
    repo: str,
    branch: str,
    token: str,
    file_name: str,
    today: str,
) -> dict:
    """The previous ledger, or a freshly started one when there is none yet.

    A 404 here means either the storage branch or the file does not exist,
    which is exactly what the first run looks like, so it starts an empty
    ledger. Any other failure, a bad status, a body that will not decode, a
    schema that does not match, is refused rather than treated the same way,
    because silently restarting would erase the lifetime total this whole
    module exists to protect.
    """
    # Percent-encoded so a branch such as "a#b" cannot truncate the ref at
    # the fragment marker and silently ask for a different branch.
    url = f"{api_root}/repos/{repo}/contents/{file_name}?ref={urllib.parse.quote(branch, safe='')}"
    try:
        payload = _get_json(url, token)
    except urllib.error.HTTPError as error:
        if error.code == HTTP_NOT_FOUND:
            return {"schema": 1, "repo": repo, "since": today, "days": {}}
        hint = (
            "; the token needs Contents read on this repository"
            if error.code == HTTP_FORBIDDEN
            else ""
        )
        raise ClonometerError(
            f"could not read {file_name} from the {branch} branch: HTTP {error.code}{hint}",
        ) from error
    if not isinstance(payload, dict) or "content" not in payload:
        raise ClonometerError(
            f"GitHub returned {file_name} without its contents; "
            "a file over 1 MB is read that way, and this one should be far smaller",
        )
    try:
        raw = base64.b64decode(payload["content"])
        ledger = json.loads(raw)
    except (ValueError, TypeError) as error:
        raise ClonometerError(
            f"{file_name} on the {branch} branch is not valid JSON: {error}",
        ) from error
    if (
        not isinstance(ledger, dict)
        or ledger.get("schema") != 1
        or not isinstance(ledger.get("days"), dict)
        or not all(_is_date(day) and _valid_day(value) for day, value in ledger["days"].items())
    ):
        raise ClonometerError(
            f"{file_name} on the {branch} branch is not a ledger clonometer wrote; "
            "restore a good copy, or delete it there to start the count again",
        )
    return ledger


def _is_date(value: object) -> bool:
    """True for a YYYY-MM-DD string, the only shape a ledger day key may have."""
    try:
        date.fromisoformat(str(value))
    except ValueError:
        return False
    return isinstance(value, str) and len(value) == ISO_DATE_LENGTH


def _valid_day(value: object) -> bool:
    """True for a day entry shaped the way clonometer writes one.

    A dict whose count and uniques are the kind of value ``_count`` accepts,
    so a ledger a stray edit left with a day set to null, a list, or a
    non-numeric count is refused the same way a wrong schema version is.
    """
    if not isinstance(value, dict):
        return False
    try:
        int(value.get("count", 0))  # type: ignore[arg-type]
        int(value.get("uniques", 0))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return True


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
        day = str(row.get("timestamp", ""))[:10]
        if not day:
            continue
        if not _is_date(day):
            raise ClonometerError(f"the traffic endpoint answered with a bad timestamp: {day!r}")
        count = _count(row.get("count", 0), "count")
        uniques = _count(row.get("uniques", 0), "uniques")
        existing = days.get(day, {"count": 0, "uniques": 0})
        days[day] = {
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
            f"({old_total}); refusing to write. If the ledger on the branch is wrong, "
            "delete it there to start the count again",
        )


def short(n: int) -> str:
    """A number the way the numbers file's short forms show it.

    Below 10,000 it is digits with thousands separators, because that is
    still the exact count. From 10,000 it switches to one decimal place with
    a k or M suffix, because a consumer badge has little room and the exact
    digit count stops being the interesting part of the number; a trailing
    '.0' is dropped so round figures read as round figures.
    """
    if n < SHORT_FORM_THRESHOLD:
        return f"{n:,}"
    value, suffix = n / THOUSAND, "k"
    # Decided after rounding, so 999,950 reads as 1M rather than 1000k.
    if round(value, 1) >= THOUSAND:
        value, suffix = n / 1_000_000, "M"
    if round(value, 1) >= THOUSAND:
        value, suffix = n / 1_000_000_000, "B"
    text = f"{value:.1f}"
    return text.removesuffix(".0") + suffix


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


def _serialize(doc: dict) -> str:
    """A JSON document exactly as clonometer writes and ships it.

    One function so the bytes written to a numbers file and the bytes
    handed to the gist PATCH can never drift apart.
    """
    return json.dumps(doc, indent=2, sort_keys=True) + "\n"


def write(out_dir: Path, metric: str, numbers_doc: dict, ledger_doc: dict) -> tuple[Path, Path]:
    """Write one metric's numbers and ledger files into out_dir, creating it if needed."""
    numbers_path = out_dir / f"{metric}.json"
    ledger_path = out_dir / f"{metric}-ledger.json"
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        for path in (out_dir, numbers_path, ledger_path):
            if path.is_symlink():
                raise ClonometerError(f"{path} is a symbolic link; refusing to write through it")
        numbers_path.write_text(_serialize(numbers_doc), encoding="utf-8")
        ledger_path.write_text(_serialize(ledger_doc), encoding="utf-8")
    except OSError as error:
        raise ClonometerError(f"could not write into {out_dir}: {error}") from error
    return numbers_path, ledger_path


def _valid_gist_id(value: str) -> bool:
    """True for a plausible gist id: hexadecimal, 20 to 40 characters long."""
    return GIST_ID_MIN_LENGTH <= len(value) <= GIST_ID_MAX_LENGTH and all(
        c in "0123456789abcdefABCDEF" for c in value
    )


def publish_gist(api_root: str, gist_id: str, token: str, files: dict[str, str]) -> None:
    """PATCH a gist's files to the numbers files this run produced.

    ``files`` maps each numbers file's name (never a ledger's) to the exact
    text ``write`` already put on disk for it, so the gist a consumer's
    shields badge reads is byte-identical to the branch. Shields cannot
    fetch a raw file from a private branch, so this mirror exists for a
    private repository whose branch it otherwise could not read; the ledger
    itself is never mirrored, the branch stays its one source of truth.

    A 401, 403 or 404 here almost always means the gist token lacks the
    gist scope, or is a fine-grained token, which cannot write a gist at
    all, or the gist id itself does not exist.
    """
    url = f"{api_root}/gists/{gist_id}"
    body = {"files": {name: {"content": content} for name, content in files.items()}}
    try:
        _request(url, token, method="PATCH", body=body)
    except urllib.error.HTTPError as error:
        if error.code in (401, 403, 404):
            raise ClonometerError(
                f"the gist endpoint answered HTTP {error.code} for {gist_id}; the gist token "
                "needs the gist scope of a classic token (a fine-grained token cannot write "
                "gists), and the gist id must exist",
            ) from error
        raise ClonometerError(
            f"the gist endpoint answered HTTP {error.code} for {gist_id}",
        ) from error


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
        "--write",
        metavar="DIR",
        help="write the numbers and ledger files into DIR",
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
    parser.add_argument(
        "--gist",
        metavar="ID",
        default=None,
        help=(
            "id of a gist to mirror the numbers files into, for a private repository "
            "whose branch shields cannot read (write mode only)"
        ),
    )
    return parser


def _compute(
    args: argparse.Namespace,
    token: str,
    api_root: str,
    today: str,
    token_source: str = TOKEN_ENV,
) -> list[tuple[dict, dict]]:
    """Fetch, merge and total every requested metric before anything is written."""
    owner, _, name = args.repo.partition("/")
    if not owner or not name or "/" in name or any(c.isspace() for c in args.repo):
        raise ClonometerError(f"the repository must be given as owner/name, got {args.repo!r}")
    if args.gist and not _valid_gist_id(args.gist):
        raise ClonometerError(
            f"--gist must be a hexadecimal id 20 to 40 characters long, got {args.gist!r}",
        )
    results: list[tuple[dict, dict]] = []
    for metric in parse_metrics(args.metrics):
        traffic = fetch_traffic(api_root, args.repo, token, metric, token_source)
        ledger_file = f"{metric}-ledger.json"
        previous = read_ledger(api_root, args.repo, args.branch, token, ledger_file, today)
        old_total = lifetime(previous)
        merged = merge(previous, traffic.get(metric) or [])
        # The ledger follows the repository it was read for, so a rename does
        # not leave it describing the old name forever; and since is a floor
        # on the days it holds, which the first sample can push back 13 days.
        merged["repo"] = args.repo
        merged["since"] = min([str(merged.get("since", today)), *merged["days"]])
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


def _resolve_token() -> tuple[str, str]:
    """The token to use and which env var it came from, or a refusal when neither is set."""
    token_source = TOKEN_ENV
    token = os.environ.get(TOKEN_ENV, "").strip()
    if not token:
        token_source = FALLBACK_TOKEN_ENV
        token = os.environ.get(FALLBACK_TOKEN_ENV, "").strip()
    if not token:
        raise ClonometerError(f"{TOKEN_ENV} is not set, so clonometer has no token to use")
    return token, token_source


def main(argv: list[str] | None = None) -> int:
    """Parse argv, fetch and total every requested metric, and print or write the result."""
    args = _build_parser().parse_args(argv)
    try:
        token, token_source = _resolve_token()
        api_root = check_api_root(os.environ.get(API_ROOT_ENV, DEFAULT_API_ROOT))
        results = _compute(args, token, api_root, today_utc(), token_source)
        if args.write:
            out_dir = Path(args.write)
            gist_files: dict[str, str] = {}
            for doc, ledger_doc in results:
                numbers_path, ledger_path = write(out_dir, doc["metric"], doc, ledger_doc)
                print(f"{doc['metric']}: wrote {numbers_path} and {ledger_path}; {doc['badge']}")
                gist_files[f"{doc['metric']}.json"] = _serialize(doc)
            if args.gist:
                gist_token = os.environ.get(GIST_TOKEN_ENV, "").strip() or token
                publish_gist(api_root, args.gist, gist_token, gist_files)
                print(
                    f"gist: {', '.join(sorted(gist_files))} mirrored to "
                    f"https://gist.github.com/{args.gist}",
                )
    except ClonometerError as error:
        print(str(error), file=sys.stderr)
        return 1

    if not args.write:
        for doc, _ in results:
            print(
                f"{doc['metric']}: {doc['badge']}, {doc['window']['count']:,} in the last "
                f"14 days, since {doc['since']}",
            )
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
