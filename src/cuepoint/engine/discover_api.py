#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discover over the wire (DISCOVER-09).

DISCOVER-04 to DISCOVER-08 built ownership and identity, discovery runs, the
wantlist and the playlist push, Artist and Label pages, and Similar Tracks.
This module is how the renderer reaches all of them. Every route lives under
``/api/v1/discover/``, and nothing here is called ``incrate``: inCrate's routes
stayed beside these until DISCOVER-12 retired them, and now answer 404.

The routes
----------
Reads are GETs, so a table redrawing itself can repeat one safely; everything
that changes something is a POST to an action path, as ``server.py`` speaks.

- ``GET options`` — what a "New run" panel needs: whether a Beatport token is
  configured and whether Beatport took it, the genres, the library's artist
  and label facets with counts, a run's defaults, how many owned tracks a
  resolve would read, and the engine's limits.
- ``GET runs`` (a window of kept runs, newest first, with the total),
  ``GET runs/{id}`` (one run's header and the scope it resolved),
  ``GET runs/{id}/tracks`` (a window of what it found, with the owned filter
  and the hidden count), ``POST runs/start`` and ``POST runs/{id}/delete``.
- ``GET wantlist`` and ``POST wantlist/add``, ``/remove``, ``/note`` and
  ``/bought``.
- ``POST playlist/start`` — by explicit ids, or by a run and its owned filter,
  in which case the run's visible tracks are gathered here rather than from
  whatever the renderer happened to load (DISCOVER-06's second binding note).
- ``POST resolve/start`` — DISCOVER-04's resolve job, its one caller.
- ``GET entity`` and ``GET entity/beatport`` — an Artist or Label page's
  library half and its Beatport half (DISCOVER-07).
- ``GET similar`` — a seed's suggestions, within the Library's own scope
  parameters (DISCOVER-08).

The three job starts answer **202** with the job's identity, as every job route
does; progress, cancel and the result are the job routes' (``/api/v1/jobs/*``).

What a request may say
----------------------
A key a route does not take is refused, naming it and what the route does take,
as the Rekordbox export refuses one: a mistyped option silently ignored is a
different request from the one sent. A query parameter given twice is refused
for the same reason. Numbers are whole numbers written plainly; a boolean in a
query string is ``true`` or ``false``.

Refusals, typed
---------------
A refusal a person can act on carries its code, and the Beatport ones their
class, so the renderer can draw the right next step rather than match a
sentence (EXPORT-06's rule, and DEC-098's):

- ``BEATPORT_REFUSED`` with ``reason`` — DISCOVER-01's class: ``no_token``,
  ``rejected`` or ``forbidden`` (409), ``rate_limited`` (429, with
  ``retry_after`` when Beatport said), ``unavailable`` (502).
- ``DISCOVER_BUSY`` (409) — a discovery, push or resolve of the same kind is
  running, with its ``job_id`` and ``job_type`` to follow.
- ``DISCOVERY_RUN_NOT_FOUND`` (404), ``DISCOVERY_RUN_RUNNING`` (409, a run
  cannot be deleted until it ends), ``TRACK_NOT_FOUND`` (404, a seed that is
  not in the library).
- ``INVALID_REQUEST`` (400) — a body, a parameter or a value the services
  refuse, in their words.
- 503 when a service cannot be resolved; 500 for anything unrecognized. Those
  two are not refusals: nothing a person does changes them.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.models.filter_rule import FilterRuleError

_logger = logging.getLogger(__name__)

PREFIX = "/api/v1/discover/"

OPTIONS_PATH = PREFIX + "options"
RUNS_PATH = PREFIX + "runs"
RUN_START_PATH = PREFIX + "runs/start"
WANTLIST_PATH = PREFIX + "wantlist"
WANTLIST_ADD_PATH = PREFIX + "wantlist/add"
WANTLIST_REMOVE_PATH = PREFIX + "wantlist/remove"
WANTLIST_NOTE_PATH = PREFIX + "wantlist/note"
WANTLIST_BOUGHT_PATH = PREFIX + "wantlist/bought"
PLAYLIST_START_PATH = PREFIX + "playlist/start"
RESOLVE_START_PATH = PREFIX + "resolve/start"
ENTITY_PATH = PREFIX + "entity"
ENTITY_BEATPORT_PATH = PREFIX + "entity/beatport"
SIMILAR_PATH = PREFIX + "similar"

#: A run's own routes. The id is matched loosely and read strictly, so
#: ``runs/abc`` is refused as a bad id rather than answered as an unknown path.
_RUN_ROUTE = re.compile(r"^/api/v1/discover/runs/([^/]+)$")
_RUN_TRACKS_ROUTE = re.compile(r"^/api/v1/discover/runs/([^/]+)/tracks$")
_RUN_DELETE_ROUTE = re.compile(r"^/api/v1/discover/runs/([^/]+)/delete$")

#: The refusal codes a caller can branch on. Named here and in the client,
#: and a test compares the two.
BEATPORT_REFUSED = "BEATPORT_REFUSED"
INVALID_REQUEST = "INVALID_REQUEST"
DISCOVER_BUSY = "DISCOVER_BUSY"
RUN_NOT_FOUND = "DISCOVERY_RUN_NOT_FOUND"
RUN_RUNNING = "DISCOVERY_RUN_RUNNING"
TRACK_NOT_FOUND = "TRACK_NOT_FOUND"

REFUSAL_CODES: Tuple[str, ...] = (
    BEATPORT_REFUSED,
    INVALID_REQUEST,
    DISCOVER_BUSY,
    RUN_NOT_FOUND,
    RUN_RUNNING,
    TRACK_NOT_FOUND,
)

#: What each Beatport class arrives as. The request was fine in every case;
#: the account, the rate limit or Beatport itself was not.
_BEATPORT_STATUS = {
    "no_token": 409,
    "rejected": 409,
    "forbidden": 409,
    "rate_limited": 429,
    "unavailable": 502,
}

#: How many runs the list answers with when not asked, and at most.
RUN_LIST_DEFAULT = 50
MAX_RUN_LIST = 200

#: A window of tracks when not asked for a size: the Library table's own.
WINDOW_DEFAULT = 100

#: What each route takes: the query parameters of a read, the fields of an
#: action's body. Named here so the client's copies can be held to them.
RUNS_PARAMS: Tuple[str, ...] = ("limit", "offset")
RUN_TRACKS_PARAMS: Tuple[str, ...] = ("owned", "sort", "dir", "offset", "limit")
WANTLIST_PARAMS: Tuple[str, ...] = (
    "owned",
    "bought",
    "sort",
    "dir",
    "offset",
    "limit",
)
ENTITY_PARAMS: Tuple[str, ...] = ("kind", "ref")
ENTITY_BEATPORT_PARAMS: Tuple[str, ...] = (
    "kind",
    "ref",
    "refresh",
    "owned",
    "offset",
    "limit",
)
SIMILAR_PARAMS: Tuple[str, ...] = (
    "track_id",
    "limit",
    "q",
    "playlist_id",
    "filters",
    "scope",
    "collection_id",
)
RUN_START_FIELDS: Tuple[str, ...] = (
    "genre_ids",
    "charts_from",
    "charts_to",
    "new_releases_days",
    "artists",
    "labels",
)
WANTLIST_ADD_FIELDS: Tuple[str, ...] = ("track_ids", "run_id")
WANTLIST_REMOVE_FIELDS: Tuple[str, ...] = ("track_ids",)
WANTLIST_NOTE_FIELDS: Tuple[str, ...] = ("track_id", "note")
WANTLIST_BOUGHT_FIELDS: Tuple[str, ...] = ("track_ids", "bought")
PLAYLIST_START_FIELDS: Tuple[str, ...] = (
    "track_ids",
    "run_id",
    "owned",
    "sort",
    "dir",
    "name",
    "include_owned",
)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_WHOLE = re.compile(r"^\d+$")


class DiscoverUnavailableError(RuntimeError):
    """A service could not be resolved: the database is unreachable."""


def _resolve(interface_name: str) -> Any:
    """Resolve one interface by name, per call: built with the token set now."""
    try:
        from cuepoint.services import interfaces
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(getattr(interfaces, interface_name))
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise DiscoverUnavailableError(str(exc)) from exc


def _beatport_api() -> Any:
    try:
        from cuepoint.services.beatport_api import BeatportApi
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(BeatportApi)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise DiscoverUnavailableError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Query strings
# ---------------------------------------------------------------------------


def _params(params: Dict[str, List[str]], allowed: Sequence[str]) -> Dict[str, str]:
    """The query's parameters, each once, and only ones this route takes."""
    unknown = sorted(key for key in params if key not in allowed)
    if unknown:
        takes = ", ".join(allowed) if allowed else "no parameters"
        raise bad_request(
            f"Unknown parameter {', '.join(unknown)!r}. This request takes: {takes}"
        )
    single: Dict[str, str] = {}
    for key, values in params.items():
        if len(values) != 1:
            raise bad_request(f"{key} may be given once")
        single[key] = values[0].strip()
    return single


def _whole(raw: str, name: str, low: int, high: int) -> int:
    if not _WHOLE.match(raw):
        raise bad_request(f"{name} must be a whole number, not {raw!r}")
    value = int(raw)
    if not low <= value <= high:
        raise bad_request(f"{name} must be from {low:,} to {high:,}, not {value:,}")
    return value


def _query_int(
    query: Dict[str, str], name: str, default: int, low: int, high: int
) -> int:
    raw = query.get(name, "")
    return default if raw == "" else _whole(raw, name, low, high)


def _query_choice(
    query: Dict[str, str], name: str, allowed: Sequence[str], default: str
) -> str:
    raw = query.get(name, "")
    if raw == "":
        return default
    if raw not in allowed:
        raise bad_request(f"{name} must be one of {', '.join(allowed)}, not {raw!r}")
    return raw


def _query_bool(query: Dict[str, str], name: str, default: bool) -> bool:
    raw = query.get(name, "").lower()
    if raw == "":
        return default
    if raw not in ("true", "false"):
        raise bad_request(f"{name} must be true or false, not {query[name]!r}")
    return raw == "true"


def _query_dir(query: Dict[str, str], default: str) -> str:
    return _query_choice(query, "dir", ("asc", "desc"), default)


def _query_required(query: Dict[str, str], name: str) -> str:
    raw = query.get(name, "")
    if raw == "":
        raise bad_request(f"{name} is required")
    return raw


def _id_in_path(raw: str, what: str) -> int:
    from cuepoint.models.beatport_cache import MAX_BEATPORT_ID

    if not _WHOLE.match(raw) or raw.startswith("0") or int(raw) > MAX_BEATPORT_ID:
        raise bad_request(f"A {what} id is a positive whole number, not {raw!r}")
    return int(raw)


# ---------------------------------------------------------------------------
# Bodies
# ---------------------------------------------------------------------------


def _body(raw: bytes) -> Dict[str, Any]:
    """A request body as an object; an empty body is an empty object.

    ``resolve/start`` takes nothing, and a caller sending nothing must not be
    refused for it.
    """
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise bad_request("Invalid JSON body") from None
    if not isinstance(data, dict):
        raise bad_request("JSON body must be an object")
    return data


def _only(data: Dict[str, Any], allowed: Sequence[str]) -> None:
    """Refuse a key this route does not take, naming it and what it does take."""
    unknown = sorted(str(key) for key in data if key not in allowed)
    if unknown:
        takes = ", ".join(allowed) if allowed else "nothing"
        raise bad_request(
            f"Unknown field {', '.join(unknown)!r}. This request takes: {takes}"
        )


def _required(data: Dict[str, Any], key: str) -> Any:
    if key not in data:
        raise bad_request(f"{key} is required")
    return data[key]


def _optional_int(data: Dict[str, Any], key: str) -> Optional[int]:
    value = data.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise bad_request(f"{key} must be a whole number, not {value!r}")
    return int(value)


def _optional_text(data: Dict[str, Any], key: str) -> Optional[str]:
    value = data.get(key)
    if value is None or isinstance(value, str):
        return value
    raise bad_request(f"{key} must be text, not {value!r}")


def _optional_bool(data: Dict[str, Any], key: str, default: bool) -> bool:
    value = data.get(key)
    if value is None:
        return default
    if not isinstance(value, bool):
        raise bad_request(f"{key} must be true or false, not {value!r}")
    return value


def _optional_date(data: Dict[str, Any], key: str) -> Optional[date]:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        raise bad_request(f"{key} must be a date written YYYY-MM-DD, not {value!r}")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise bad_request(f"{key} is not a date: {value!r}") from None


def _optional_list(data: Dict[str, Any], key: str) -> Optional[List[Any]]:
    """A list as sent, or None; its items are the service's to check."""
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, list):
        raise bad_request(f"{key} must be a list, not {value!r}")
    return value


def _ids(data: Dict[str, Any], key: str) -> List[Any]:
    value = _required(data, key)
    if not isinstance(value, list):
        raise bad_request(f"{key} must be a list of Beatport track ids")
    return value


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


def _scope_summary(value: Any) -> Dict[str, Any]:
    """An artist or label scope as a run recorded it, without its names."""
    scope = value if isinstance(value, dict) else {}
    picked = scope.get("picked")
    return {
        "picked": [str(n) for n in picked] if isinstance(picked, list) else None,
        "count": int(scope.get("count") or 0),
        "linked_ids": int(scope.get("linked_ids") or 0),
    }


def _scope_names(value: Any) -> List[Dict[str, str]]:
    """The names a run's scope resolved to: what the run looked for."""
    scope = value.get("scope") if isinstance(value, dict) else None
    if not isinstance(scope, list):
        return []
    return [
        {"key": str(entry.get("key")), "name": str(entry.get("name"))}
        for entry in scope
        if isinstance(entry, dict)
    ]


def run_to_dict(run: Any) -> Dict[str, Any]:
    """One run as the list and the header show it.

    Its parameters parsed rather than as stored text, and without the names
    its scope resolved to: a run over the whole library holds every artist in
    it, which a list of runs has no use for. The header adds them.
    """
    from cuepoint.models.discovery_run import RUN_COUNTS

    params = run.params
    return {
        "id": run.id,
        "job_id": run.job_id,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "outcome": run.outcome,
        "running": run.is_running,
        "params": {
            "genre_ids": [int(g) for g in params.get("genre_ids") or []],
            "charts_from": params.get("charts_from"),
            "charts_to": params.get("charts_to"),
            "new_releases_days": params.get("new_releases_days"),
            "releases_from": params.get("releases_from"),
            "releases_to": params.get("releases_to"),
            "artists": _scope_summary(params.get("artists")),
            "labels": _scope_summary(params.get("labels")),
        },
        **{name: getattr(run, name) for name in RUN_COUNTS},
        "error": run.error,
        "error_class": run.error_class,
    }


def _job_started(job: Any) -> Tuple[int, Dict[str, Any]]:
    return 202, {"id": job.id, "type": job.type, "state": job.state.value}


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------


def _beatport_status() -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Whether a token is configured and Beatport took it, and the genres.

    Asking for the genres is how "took it" is known: it is the one request a
    "New run" panel needs anyway, and its answer is cached for a day, so
    opening the panel costs no request most times. The token itself never
    leaves the engine (DEC-098).
    """
    from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
    from cuepoint.services.beatport_api_client import classify_beatport_error

    api = _beatport_api()
    try:
        api.require_token()
        genres = api.genres()
    except Exception as exc:  # noqa: BLE001 — every failure is a state here
        kind = classify_beatport_error(exc)
        if kind == "unavailable" and not isinstance(exc, BeatportAPIError):
            _logger.warning("[discover] reading genres failed: %s", exc)
        message = exc.message if isinstance(exc, BeatportAPIError) else str(exc)
        retry = exc.retry_after if isinstance(exc, BeatportAPIError) else None
        return (
            {
                "configured": kind != "no_token",
                "state": kind,
                "message": message,
                "retry_after": retry,
            },
            [],
        )
    listed = sorted(
        ({"id": g.id, "name": g.name, "slug": g.slug} for g in genres),
        key=lambda g: (g["name"].casefold(), g["id"]),
    )
    return (
        {"configured": True, "state": "ok", "message": None, "retry_after": None},
        listed,
    )


def options(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """What a "New run" panel and the Discover page start from."""
    from cuepoint.models.entity_page import MAX_ENTITY_WINDOW
    from cuepoint.models.similar_tracks import MAX_SIMILAR_LIMIT
    from cuepoint.models.wantlist import MAX_NOTE_LENGTH
    from cuepoint.persistence.discovery_repository import MAX_WINDOW
    from cuepoint.services.beatport_playlist_service import (
        MAX_PLAYLIST_NAME_LENGTH,
        MAX_PLAYLIST_TRACKS,
    )
    from cuepoint.services.discovery_service import MAX_GENRES, MAX_WINDOW_DAYS
    from cuepoint.services.wantlist_service import MAX_CHANGE

    _params(params, ())
    beatport, genres = _beatport_status()
    library = _resolve("ILibraryService")
    request = _resolve("IDiscoveryService").request()
    return {
        "beatport": beatport,
        "genres": genres,
        "artists": library.facet("artist_name").to_dict(),
        "labels": library.facet("label_name").to_dict(),
        "defaults": {
            "genre_ids": list(request.genre_ids),
            "charts_from": request.charts_from.isoformat(),
            "charts_to": request.charts_to.isoformat(),
            "new_releases_days": request.new_releases_days,
            "playlist_name": _resolve("IBeatportPlaylistService").default_name(),
        },
        "limits": {
            "max_genres": MAX_GENRES,
            "max_window_days": MAX_WINDOW_DAYS,
            "max_runs": MAX_RUN_LIST,
            "max_run_window": MAX_WINDOW,
            "max_entity_window": MAX_ENTITY_WINDOW,
            "max_change": MAX_CHANGE,
            "max_playlist_tracks": MAX_PLAYLIST_TRACKS,
            "max_playlist_name_length": MAX_PLAYLIST_NAME_LENGTH,
            "max_note_length": MAX_NOTE_LENGTH,
            "max_similar": MAX_SIMILAR_LIMIT,
        },
        "resolve": _resolve("IBeatportResolveService").plan().to_dict(),
        "index_current": bool(_resolve("ICreditIndexService").is_current()),
    }


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


def runs(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A window of kept runs, newest first, and how many there are."""
    query = _params(params, RUNS_PARAMS)
    limit = _query_int(query, "limit", RUN_LIST_DEFAULT, 1, MAX_RUN_LIST)
    offset = _query_int(query, "offset", 0, 0, 2**63 - 1)
    service = _resolve("IDiscoveryService")
    return {
        "runs": [run_to_dict(run) for run in service.list_runs(limit, offset)],
        "total": service.count_runs(),
        "limit": limit,
        "offset": offset,
    }


def _existing_run(service: Any, run_id: int) -> Any:
    run = service.get_run(run_id)
    if run is None:
        raise not_found(RUN_NOT_FOUND, f"No discovery run {run_id}")
    return run


def run_header(run_id: int, params: Dict[str, List[str]]) -> Dict[str, Any]:
    """One run, with the artists and labels its scope resolved to."""
    _params(params, ())
    run = _existing_run(_resolve("IDiscoveryService"), run_id)
    recorded = run.params
    return {
        "run": run_to_dict(run),
        "artists": _scope_names(recorded.get("artists")),
        "labels": _scope_names(recorded.get("labels")),
    }


def run_tracks(run_id: int, params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A window of a run's tracks, owned hidden unless asked (DEC-092)."""
    from cuepoint.models.discovery_run import (
        OWNED_FILTERS,
        OWNED_HIDE,
        RUN_TRACK_SORTS,
        SORT_FOUND,
    )
    from cuepoint.persistence.discovery_repository import MAX_WINDOW

    query = _params(params, RUN_TRACKS_PARAMS)
    owned = _query_choice(query, "owned", OWNED_FILTERS, OWNED_HIDE)
    sort = _query_choice(query, "sort", RUN_TRACK_SORTS, SORT_FOUND)
    direction = _query_dir(query, "asc")
    offset = _query_int(query, "offset", 0, 0, 2**63 - 1)
    limit = _query_int(query, "limit", WINDOW_DEFAULT, 1, MAX_WINDOW)
    service = _resolve("IDiscoveryService")
    try:
        page = service.run_tracks(
            run_id, owned, sort, direction == "desc", offset, limit
        )
    except LookupError as exc:
        raise not_found(RUN_NOT_FOUND, str(exc)) from None
    return {
        "run_id": run_id,
        **page.to_dict(),
        "window": {
            "owned": owned,
            "sort": sort,
            "dir": direction,
            "offset": offset,
            "limit": limit,
        },
    }


def run_start(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Start a discovery run over the library (DISCOVER-05)."""
    from cuepoint.engine.discovery_jobs import start_discovery_job

    _only(data, RUN_START_FIELDS)
    job = start_discovery_job(
        job_store,
        genre_ids=_optional_list(data, "genre_ids"),
        charts_from=_optional_date(data, "charts_from"),
        charts_to=_optional_date(data, "charts_to"),
        new_releases_days=_optional_int(data, "new_releases_days"),
        artists=_optional_list(data, "artists"),
        labels=_optional_list(data, "labels"),
    )
    return _job_started(job)


def run_delete(run_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Delete an ended run and its tracks; the catalog rows stay."""
    _only(data, ())
    service = _resolve("IDiscoveryService")
    if _existing_run(service, run_id).is_running:
        raise ApiError(
            409,
            RUN_RUNNING,
            f"Discovery run {run_id} is still running; cancel it first",
        )
    if not service.delete_run(run_id):
        raise not_found(RUN_NOT_FOUND, f"No discovery run {run_id}")
    return {"id": run_id, "deleted": True}


# ---------------------------------------------------------------------------
# The wantlist
# ---------------------------------------------------------------------------


def wantlist(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A window of the wantlist, newest first, owned computed now (DEC-093)."""
    from cuepoint.models.discovery_run import OWNED_ALL, OWNED_FILTERS
    from cuepoint.models.wantlist import BOUGHT_ALL, BOUGHT_FILTERS, SORT_ADDED
    from cuepoint.models.wantlist import WANTLIST_SORTS
    from cuepoint.persistence.discovery_repository import MAX_WINDOW

    query = _params(params, WANTLIST_PARAMS)
    owned = _query_choice(query, "owned", OWNED_FILTERS, OWNED_ALL)
    bought = _query_choice(query, "bought", BOUGHT_FILTERS, BOUGHT_ALL)
    sort = _query_choice(query, "sort", WANTLIST_SORTS, SORT_ADDED)
    direction = _query_dir(query, "desc")
    offset = _query_int(query, "offset", 0, 0, 2**63 - 1)
    limit = _query_int(query, "limit", WINDOW_DEFAULT, 1, MAX_WINDOW)
    page = _resolve("IWantlistService").page(
        owned=owned,
        bought=bought,
        sort=sort,
        descending=direction == "desc",
        offset=offset,
        limit=limit,
    )
    return {
        **page.to_dict(),
        "window": {
            "owned": owned,
            "bought": bought,
            "sort": sort,
            "dir": direction,
            "offset": offset,
            "limit": limit,
        },
    }


def wantlist_add(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Add Beatport tracks, from a run or a page; reads any not cached."""
    _only(data, WANTLIST_ADD_FIELDS)
    ids = _ids(data, "track_ids")
    run_id = _optional_int(data, "run_id")
    try:
        change = _resolve("IWantlistService").add(ids, run_id=run_id)
    except LookupError as exc:
        raise not_found(RUN_NOT_FOUND, str(exc)) from None
    return 200, change.to_dict()


def wantlist_remove(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Remove entries; an id not on the list is reported, not refused."""
    _only(data, WANTLIST_REMOVE_FIELDS)
    return 200, _resolve("IWantlistService").remove(_ids(data, "track_ids")).to_dict()


def wantlist_note(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Set an entry's note; ``null`` or blank text clears it.

    ``note`` is required, even to clear one: a body that forgot it must not
    erase what the user wrote.
    """
    _only(data, WANTLIST_NOTE_FIELDS)
    track_id = _required(data, "track_id")
    note = _required(data, "note")
    if note is not None and not isinstance(note, str):
        raise bad_request(f"note must be text or null, not {note!r}")
    return 200, _resolve("IWantlistService").set_note(track_id, note).to_dict()


def wantlist_bought(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Mark entries bought, or unmark them; owned is never touched."""
    _only(data, WANTLIST_BOUGHT_FIELDS)
    ids = _ids(data, "track_ids")
    bought = _required(data, "bought")
    if not isinstance(bought, bool):
        raise bad_request(f"bought must be true or false, not {bought!r}")
    return 200, _resolve("IWantlistService").set_bought(ids, bought).to_dict()


# ---------------------------------------------------------------------------
# The two Beatport jobs
# ---------------------------------------------------------------------------


def playlist_start(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Push tracks to a new Beatport playlist, as a job (DISCOVER-06, DEC-099).

    The tracks are either ``track_ids``, a selection the renderer holds, or a
    ``run_id`` with the owned filter and order the run's table shows: then
    every track that table would show is gathered here, however many the
    renderer has loaded. Owned tracks are skipped unless ``include_owned``.
    """
    from cuepoint.engine.beatport_playlist_jobs import start_beatport_playlist_job
    from cuepoint.models.discovery_run import (
        OWNED_FILTERS,
        OWNED_HIDE,
        RUN_TRACK_SORTS,
        SORT_FOUND,
    )

    _only(data, PLAYLIST_START_FIELDS)
    name = _optional_text(data, "name")
    include_owned = _optional_bool(data, "include_owned", False)
    has_ids = data.get("track_ids") is not None
    has_run = data.get("run_id") is not None
    if has_ids == has_run:
        raise bad_request("A push names its tracks by track_ids or by run_id, not both")
    if has_ids:
        for key in ("owned", "sort", "dir"):
            if data.get(key) is not None:
                raise bad_request(f"{key} goes with run_id, not with track_ids")
        ids = _ids(data, "track_ids")
    else:
        run_id = _optional_int(data, "run_id")
        if run_id is None or run_id < 1:
            raise bad_request(f"run_id is a positive whole number, not {run_id!r}")
        owned = _body_choice(data, "owned", OWNED_FILTERS, OWNED_HIDE)
        sort = _body_choice(data, "sort", RUN_TRACK_SORTS, SORT_FOUND)
        direction = _body_choice(data, "dir", ("asc", "desc"), "asc")
        try:
            ids = _resolve("IDiscoveryService").visible_track_ids(
                run_id, owned, sort, direction == "desc"
            )
        except LookupError as exc:
            raise not_found(RUN_NOT_FOUND, str(exc)) from None
        if not ids:
            raise bad_request(f"Discovery run {run_id} shows no tracks to push")
    job = start_beatport_playlist_job(
        job_store, track_ids=ids, name=name, include_owned=include_owned
    )
    return _job_started(job)


def _body_choice(
    data: Dict[str, Any], key: str, allowed: Sequence[str], default: str
) -> str:
    value = data.get(key)
    if value is None:
        return default
    if value not in allowed:
        raise bad_request(f"{key} must be one of {', '.join(allowed)}, not {value!r}")
    return str(value)


def resolve_start(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Resolve the library's accepted matches on Beatport (DISCOVER-04, DEC-095).

    Only ever started by a person asking: this route is its one caller.
    """
    from cuepoint.engine.beatport_resolve_jobs import start_beatport_resolve_job

    _only(data, ())
    return _job_started(start_beatport_resolve_job(job_store))


# ---------------------------------------------------------------------------
# Pages and Similar Tracks
# ---------------------------------------------------------------------------


def entity(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """An Artist or Label page's identity and library half (DISCOVER-07).

    When the answer's ``ref`` differs from the one asked (``redirected_from``),
    a name has since been linked to a Beatport id, and the renderer replaces
    its route with the id's.
    """
    query = _params(params, ENTITY_PARAMS)
    kind = _query_required(query, "kind")
    ref = _query_required(query, "ref")
    page = _resolve("IEntityPageService").page(kind, ref)
    result: Dict[str, Any] = page.to_dict()
    return result


def entity_beatport(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A page's recent Beatport tracks, or the state standing in for them.

    A refusal from Beatport is already a state on this answer, never an error
    (DEC-098); only a request the page cannot answer is refused.
    """
    from cuepoint.models.discovery_run import OWNED_ALL, OWNED_FILTERS
    from cuepoint.models.entity_page import MAX_ENTITY_WINDOW

    query = _params(params, ENTITY_BEATPORT_PARAMS)
    kind = _query_required(query, "kind")
    ref = _query_required(query, "ref")
    half = _resolve("IEntityPageService").beatport(
        kind,
        ref,
        refresh=_query_bool(query, "refresh", False),
        owned=_query_choice(query, "owned", OWNED_FILTERS, OWNED_ALL),
        offset=_query_int(query, "offset", 0, 0, 2**63 - 1),
        limit=_query_int(query, "limit", WINDOW_DEFAULT, 1, MAX_ENTITY_WINDOW),
    )
    result: Dict[str, Any] = half.to_dict()
    return result


def similar(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """A seed's suggestions, best first, each with its reasons (DEC-096).

    The scope is the Library's own parameters — ``q``, ``playlist_id``,
    ``filters``, ``scope`` and ``collection_id`` — read as the Library's
    search reads them, so a Collection, a playlist, a Smart Collection or a
    rule set narrows the candidates exactly as it narrows the table.
    """
    from cuepoint.engine.library_api import (
        combine_rules,
        parse_collection_id,
        parse_filters_param,
        parse_playlist_id,
        parse_scope,
        resolve_scope,
    )
    from cuepoint.models.similar_tracks import DEFAULT_SIMILAR_LIMIT, MAX_SIMILAR_LIMIT
    from cuepoint.persistence.track_query import BrowseQuery

    query = _params(params, SIMILAR_PARAMS)
    track_id = _whole(_query_required(query, "track_id"), "track_id", 1, 2**63 - 1)
    limit = _query_int(query, "limit", DEFAULT_SIMILAR_LIMIT, 1, MAX_SIMILAR_LIMIT)
    resolved = resolve_scope(
        parse_scope(query.get("scope")),
        parse_collection_id(query.get("collection_id")),
    )
    rules = combine_rules(resolved.rules, parse_filters_param(query.get("filters")))
    scope = BrowseQuery(
        query=query.get("q", ""),
        playlist_id=parse_playlist_id(query.get("playlist_id")),
        rules=rules,
        collection_id=resolved.collection_id,
    )
    try:
        answer = _resolve("ISimilarityService").similar(
            track_id, scope=scope, limit=limit
        )
    except LookupError as exc:
        raise not_found(TRACK_NOT_FOUND, str(exc)) from None
    result: Dict[str, Any] = answer.to_dict()
    return result


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    OPTIONS_PATH: options,
    RUNS_PATH: runs,
    WANTLIST_PATH: wantlist,
    ENTITY_PATH: entity,
    ENTITY_BEATPORT_PATH: entity_beatport,
    SIMILAR_PATH: similar,
}

_POST_ROUTES: Dict[str, Callable[[Dict[str, Any], Any], Tuple[int, Dict[str, Any]]]] = {
    RUN_START_PATH: run_start,
    WANTLIST_ADD_PATH: wantlist_add,
    WANTLIST_REMOVE_PATH: wantlist_remove,
    WANTLIST_NOTE_PATH: wantlist_note,
    WANTLIST_BOUGHT_PATH: wantlist_bought,
    PLAYLIST_START_PATH: playlist_start,
    RESOLVE_START_PATH: resolve_start,
}

#: Every fixed path this module answers, and the templates of a run's own, for
#: tests and the contract.
GET_PATHS: Tuple[str, ...] = (
    *_GET_ROUTES,
    PREFIX + "runs/{id}",
    PREFIX + "runs/{id}/tracks",
)
POST_PATHS: Tuple[str, ...] = (*_POST_ROUTES, PREFIX + "runs/{id}/delete")


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in _GET_ROUTES or bool(
        _RUN_ROUTE.match(path) or _RUN_TRACKS_ROUTE.match(path)
    )


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return path in _POST_ROUTES or bool(_RUN_DELETE_ROUTE.match(path))


def handle_get(path: str, params: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    handler = _GET_ROUTES.get(path)
    if handler is not None:
        return 200, handler(params)
    tracks = _RUN_TRACKS_ROUTE.match(path)
    if tracks:
        return 200, run_tracks(_id_in_path(tracks.group(1), "run"), params)
    run = _RUN_ROUTE.match(path)
    if run:
        return 200, run_header(_id_in_path(run.group(1), "run"), params)
    raise not_found("NOT_FOUND", "Unknown path")


def handle_post(path: str, raw: bytes, *, job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    data = _body(raw)
    handler = _POST_ROUTES.get(path)
    if handler is not None:
        return handler(data, job_store)
    delete = _RUN_DELETE_ROUTE.match(path)
    if delete:
        return 200, run_delete(_id_in_path(delete.group(1), "run"), data)
    raise not_found("NOT_FOUND", "Unknown path")


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope.

    A Beatport refusal always carries ``reason`` and ``retry_after``, so the
    renderer reads one shape whichever class it is.
    """
    from cuepoint.engine.jobs import JobTypeBusyError
    from cuepoint.engine.library_api import LibraryUnavailableError
    from cuepoint.exceptions.cuepoint_exceptions import (
        BeatportAPIError,
        ValidationError,
    )
    from cuepoint.services.beatport_api_client import classify_beatport_error

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, BeatportAPIError):
        kind = classify_beatport_error(exc)
        return _BEATPORT_STATUS[kind], error_payload(
            BEATPORT_REFUSED, exc.message, reason=kind, retry_after=exc.retry_after
        )
    if isinstance(exc, JobTypeBusyError):
        return 409, error_payload(
            DISCOVER_BUSY, str(exc), job_id=exc.job_id, job_type=exc.job_type
        )
    if isinstance(exc, (FilterRuleError, ValueError)):
        return 400, error_payload(INVALID_REQUEST, str(exc))
    if isinstance(exc, ValidationError):
        return 400, error_payload(INVALID_REQUEST, exc.message)
    if isinstance(exc, (DiscoverUnavailableError, LibraryUnavailableError)):
        return 503, error_payload("LIBRARY_UNAVAILABLE", str(exc))
    _logger.warning("[discover] request failed: %s", exc, exc_info=exc)
    return 500, error_payload("DISCOVER_FAILED", str(exc))


__all__: Sequence[str] = (
    "BEATPORT_REFUSED",
    "DISCOVER_BUSY",
    "DiscoverUnavailableError",
    "GET_PATHS",
    "INVALID_REQUEST",
    "POST_PATHS",
    "PREFIX",
    "REFUSAL_CODES",
    "RUN_NOT_FOUND",
    "RUN_RUNNING",
    "TRACK_NOT_FOUND",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "run_to_dict",
    "status_for",
)
