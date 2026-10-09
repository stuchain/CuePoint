#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Statistics over the wire (STATS-02, Phase 15).

- ``GET /api/v1/statistics/plays?limit=&since=&tz=&since_read=&scope=``: the top
  tracks, artists and labels, with never played and unknown counted, each with the
  rules that open it in the Library.

  - ``limit``: 10, 25, 50, 100 or 200 rows in each list; 10 when absent.
  - ``since=YYYY-MM-DD`` with ``tz=±HH:MM``: count plays from the start of that
    local day. They go together and neither goes with ``since_read``.
  - ``since_read=<id>``: count the plays recorded at that read and after it
    ("since your last refresh"), which a date cannot say when two refreshes fall
    on one day.
  - ``scope``: ``library`` (the default), ``collection:<id>`` (a Collection, a Set
    or a Smart Collection) or ``playlist:<id>``.

- ``GET /api/v1/statistics/spreads?scope=`` (STATS-03): how the scope's tracks
  spread by genre, tempo, year, date added, rating and loudness, each as buckets
  (with the rules that open them where a rule can say it), an unknown line and a
  total. Loudness adds a ``no_file`` line and has no rules.
- ``GET /api/v1/statistics/health?scope=`` (STATS-03): the scope's tracks by file
  state and Beatport match (each with its rules), by analysis (counts only), and
  when the files were last checked. It takes the same ``scope``.

Every handler validates and delegates: what is counted, and what each number opens,
is ``services/statistics_service.py``'s. A query parameter the route does not take
is refused, naming it.

Refusals
--------
- ``INVALID_REQUEST`` (400): a parameter, or a Smart Collection scope whose rules
  can no longer run.
- ``NOT_FOUND`` (404): a Collection, playlist or read that is not there.
- ``LIBRARY_UNAVAILABLE`` (503) when the library's services cannot be reached, and
  500 ``STATISTICS_FAILED`` for anything unrecognized. Neither is a refusal a
  person can act on, so the client throws them. No refusal is reported (DEC-126).
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from typing import Any, Dict, List, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.models.filter_rule import FilterRuleError
from cuepoint.persistence.track_query import BrowseQueryError
from cuepoint.services.interfaces import IStatisticsService
from cuepoint.services.statistics_service import (
    DEFAULT_LIMIT,
    SCOPE_COLLECTION,
    SCOPE_LIBRARY,
    SCOPE_PLAYLIST,
    PlaysScope,
    ReadNotFoundError,
    ScopeNotFoundError,
)

_logger = logging.getLogger(__name__)

PREFIX = "/api/v1/statistics/"
PLAYS_PATH = PREFIX + "plays"
SPREADS_PATH = PREFIX + "spreads"
HEALTH_PATH = PREFIX + "health"

INVALID_REQUEST = "INVALID_REQUEST"
NOT_FOUND = "NOT_FOUND"
UNAVAILABLE = "LIBRARY_UNAVAILABLE"
FAILED = "STATISTICS_FAILED"

#: The refusal codes a caller can branch on.
REFUSAL_CODES: Tuple[str, ...] = (INVALID_REQUEST, NOT_FOUND, UNAVAILABLE)

GET_PATHS: Tuple[str, ...] = (PLAYS_PATH, SPREADS_PATH, HEALTH_PATH)

#: The list lengths the page offers.
LIMITS: Tuple[int, ...] = (10, 25, 50, 100, 200)

_LIMIT_MESSAGE = "limit must be one of " + ", ".join(str(n) for n in LIMITS)

#: The years a ``since`` may name: any local midnight in them is a valid UTC instant.
MIN_YEAR = 1900
MAX_YEAR = 9998

_PARAMS = ("limit", "since", "tz", "since_read", "scope")
_SCOPE_ONLY = ("scope",)
_DATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
_OFFSET = re.compile(r"^([+-])([0-9]{2}):([0-9]{2})$")
_WHOLE = re.compile(r"^[0-9]+$")


class StatisticsUnavailableError(RuntimeError):
    """A service could not be resolved: the database is unreachable."""


def _resolve(interface_name: str) -> Any:
    """Resolve one interface by name, per call: imported before bootstrap."""
    try:
        from cuepoint.services import interfaces
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(getattr(interfaces, interface_name))
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise StatisticsUnavailableError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------


def _params(
    params: Dict[str, List[str]], taken: Tuple[str, ...] = _PARAMS
) -> Dict[str, str]:
    """One value per name, refusing names this route does not take."""
    unknown = sorted(set(params) - set(taken))
    if unknown:
        raise bad_request(f"Unknown parameter: {', '.join(unknown)!r}")
    single: Dict[str, str] = {}
    for name, values in params.items():
        if len(values) != 1:
            raise bad_request(f"{name} must be given once")
        single[name] = values[0]
    return single


def _limit(raw: str) -> int:
    if not _WHOLE.match(raw) or int(raw) not in LIMITS:
        raise bad_request(_LIMIT_MESSAGE)
    return int(raw)


def _since(raw: str) -> date:
    try:
        if not _DATE.match(raw):
            raise ValueError(raw)
        found = date.fromisoformat(raw)
        # Local midnight at any offset must stay a date in UTC too.
        if not MIN_YEAR <= found.year <= MAX_YEAR:
            raise ValueError(raw)
        return found
    except ValueError:
        raise bad_request(
            f"since must be a date as YYYY-MM-DD, from {MIN_YEAR} to {MAX_YEAR}"
        ) from None


def _offset(raw: str) -> timedelta:
    # A "+" in a query string reads as a space, which is how `tz=+03:00` arrives
    # from a caller that did not escape it.
    text = "+" + raw[1:] if raw.startswith(" ") else raw
    found = _OFFSET.match(text)
    if found is None or int(found.group(2)) > 23 or int(found.group(3)) > 59:
        raise bad_request("tz must be an offset from UTC as ±HH:MM")
    delta = timedelta(hours=int(found.group(2)), minutes=int(found.group(3)))
    return -delta if found.group(1) == "-" else delta


def _read(raw: str) -> int:
    if not _WHOLE.match(raw) or int(raw) < 1:
        raise bad_request("since_read must be a whole number above 0")
    return int(raw)


def parse_scope(raw: str) -> PlaysScope:
    """Read ``library``, ``collection:<id>`` or ``playlist:<id>``."""
    if raw == SCOPE_LIBRARY:
        return PlaysScope()
    kind, _, ident = raw.partition(":")
    if kind in (SCOPE_COLLECTION, SCOPE_PLAYLIST) and _WHOLE.match(ident):
        if int(ident) >= 1:
            return PlaysScope(kind, int(ident))
    raise bad_request(
        "scope must be library, collection:<id> or playlist:<id> with an id above 0"
    )


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------


def plays(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The top tracks, artists and labels, and what is not played."""
    query = _params(params)
    if "since" in query and "since_read" in query:
        raise bad_request("since cannot be combined with since_read: give one")
    if "since" in query and "tz" not in query:
        raise bad_request("since needs tz, the offset from UTC as ±HH:MM")
    if "tz" in query and "since" not in query:
        raise bad_request("tz is only taken with since")

    limit = _limit(query["limit"]) if "limit" in query else DEFAULT_LIMIT
    since = _since(query["since"]) if "since" in query else None
    offset = _offset(query["tz"]) if "tz" in query else None
    since_read = _read(query["since_read"]) if "since_read" in query else None
    scope = parse_scope(query["scope"]) if "scope" in query else PlaysScope()

    service: IStatisticsService = _resolve("IStatisticsService")
    report = service.plays(
        limit=limit,
        since=since,
        utc_offset=offset,
        since_read=since_read,
        scope=scope,
    )
    return report.to_dict()


def spreads(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """How the scope's tracks spread by six fields."""
    query = _params(params, _SCOPE_ONLY)
    scope = parse_scope(query["scope"]) if "scope" in query else PlaysScope()
    service: IStatisticsService = _resolve("IStatisticsService")
    return service.spreads(scope).to_dict()


def health(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The scope's tracks by file state, Beatport match and analysis."""
    query = _params(params, _SCOPE_ONLY)
    scope = parse_scope(query["scope"]) if "scope" in query else PlaysScope()
    service: IStatisticsService = _resolve("IStatisticsService")
    return service.health(scope).to_dict()


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in GET_PATHS


def handle_get(path: str, params: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    if path == PLAYS_PATH:
        return 200, plays(params)
    if path == SPREADS_PATH:
        return 200, spreads(params)
    if path == HEALTH_PATH:
        return 200, health(params)
    raise not_found("NOT_FOUND", "Unknown path")


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope."""
    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, (ScopeNotFoundError, ReadNotFoundError)):
        return 404, error_payload(NOT_FOUND, str(exc))
    if isinstance(exc, (FilterRuleError, BrowseQueryError)):
        # A Smart Collection whose saved rules no longer run.
        return 400, error_payload(INVALID_REQUEST, str(exc))
    if isinstance(exc, StatisticsUnavailableError):
        _logger.warning("[statistics] the library is unavailable: %s", exc)
        return 503, error_payload(UNAVAILABLE, "The library is not available")
    _logger.warning("[statistics] request failed: %s", exc, exc_info=exc)
    return 500, error_payload(FAILED, str(exc))


__all__: Sequence[str] = (
    "DEFAULT_LIMIT",
    "FAILED",
    "GET_PATHS",
    "HEALTH_PATH",
    "INVALID_REQUEST",
    "LIMITS",
    "NOT_FOUND",
    "PLAYS_PATH",
    "PREFIX",
    "REFUSAL_CODES",
    "SPREADS_PATH",
    "StatisticsUnavailableError",
    "UNAVAILABLE",
    "handle_get",
    "handles_get",
    "parse_scope",
    "status_for",
)
