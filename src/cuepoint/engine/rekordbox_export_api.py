#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox export over the wire (EXPORT-06).

EXPORT-04 built the preview and EXPORT-05 the job that writes. This module is
how the renderer reaches both, and how it reads what has been exported before.
The Rekordbox export, not the CSV, JSON and Excel one: that is
``/api/v1/clean/export`` and ``services/export_service.py``, and every route
here lives under ``/api/v1/rekordbox-export/`` so the two are never wired to
each other by someone reading a name.

Three routes
------------
- ``POST /api/v1/rekordbox-export/preview`` — the chosen Collections and a key
  notation, answered with what an export would write. Computed on the request's
  thread: it writes nothing, and three seconds over fifty thousand tracks is a
  wait a dialog can show, where a job would be a second thing to follow.
- ``POST /api/v1/rekordbox-export/start`` — the same, plus the file a person
  chose in the save dialog. Validated on the request's thread, then run as a
  job; answered **202** with the job's identity, as every job route is.
- ``GET /api/v1/rekordbox-export/history`` — recent exports with the playlists
  each wrote, newest first, and what the next export starts from.

What a body may say
-------------------
``collection_ids`` is a list of whole numbers: the Collections, Smart
Collections and folders chosen. An export's unit is a Collection, not a track
selection, so ``parse_selection`` is not used here; a set of tracks becomes an
exported playlist by being added to a Collection first (DEC-087).
``key_format`` is one of ``KEY_FORMATS``. Both are optional, and ``null`` is
read as absent — ORG-13's lesson, where the renderer sent ``null`` for "none"
and the engine refused it. An unknown key is refused, as Clean refuses one: a
mistyped option silently ignored is an export other than the one asked for.

Refusals, typed
---------------
Every refusal a person can act on carries a ``reason`` beside its message, so
EXPORT-07 can offer the right next step rather than pattern-match a sentence:

- **409** ``REKORDBOX_EXPORT_SOURCE_REFUSED`` — the library was never imported,
  or its file is gone, unreadable or not a collection the export can patch.
  The request was fine; the library is not.
- **400** ``REKORDBOX_EXPORT_DESTINATION_REFUSED`` — the destination is blank,
  is the source, is not ``.xml``, is a folder, or is in a folder that does not
  exist (DEC-083). The rule is here, in Python, and never in the dialog.
- **409** ``LIBRARY_BUSY`` — an export, an import, a refresh or a batch edit is
  running, with its id and type so the renderer can follow it. A preview is
  refused by it too, exactly when a start would be.
- **400** ``INVALID_REQUEST`` — a malformed body, an unknown notation, a node
  that is not in the tree, a Smart Collection whose rules cannot run.
- **503** when a service cannot be resolved; **500** for anything unrecognized.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.models.filter_rule import FilterRuleError

#: How many exports the history answers with when not asked for a number.
HISTORY_LIMIT_DEFAULT = 20

#: The refusal codes a caller can branch on. Named once, here and in the
#: client, so the renderer's copy can be compared with this one.
SOURCE_REFUSED = "REKORDBOX_EXPORT_SOURCE_REFUSED"
DESTINATION_REFUSED = "REKORDBOX_EXPORT_DESTINATION_REFUSED"
LIBRARY_BUSY = "LIBRARY_BUSY"

PREVIEW_PATH = "/api/v1/rekordbox-export/preview"
START_PATH = "/api/v1/rekordbox-export/start"
HISTORY_PATH = "/api/v1/rekordbox-export/history"

_SELECTION_FIELDS = ("collection_ids", "key_format")


class RekordboxExportUnavailableError(RuntimeError):
    """The export service could not be resolved: the database is unreachable."""


def _resolve(interface_name: str) -> Any:
    """Resolve one interface by name, per call: imported before bootstrap."""
    try:
        from cuepoint.services import interfaces
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(getattr(interfaces, interface_name))
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise RekordboxExportUnavailableError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Bodies and query strings
# ---------------------------------------------------------------------------


def _body(raw: bytes) -> Dict[str, Any]:
    from cuepoint.engine.organization_api import parse_body

    result: Dict[str, Any] = parse_body(raw)
    return result


def _only(data: Dict[str, Any], allowed: Sequence[str]) -> None:
    """Refuse a key this route does not take, naming it and what it does take."""
    unknown = sorted(str(key) for key in data if key not in allowed)
    if unknown:
        raise bad_request(
            f"Unknown field {', '.join(unknown)}. This request takes: "
            + ", ".join(allowed)
        )


def parse_collection_ids(data: Dict[str, Any]) -> Tuple[int, ...]:
    """Return the chosen nodes' ids; absent or ``null`` is none chosen.

    None chosen is a legitimate export: CuePoint's values, no playlists
    appended. A bool is refused with the rest: it is an ``int`` in Python, and
    "Collection true" is not an id.
    """
    value = data.get("collection_ids")
    if value is None:
        return ()
    if not isinstance(value, list):
        raise bad_request(
            f"collection_ids must be a list of collection ids, not {value!r}"
        )
    ids: List[int] = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, int):
            raise bad_request(
                f"collection_ids must hold whole numbers only, not {item!r}"
            )
        ids.append(int(item))
    return tuple(ids)


def parse_key_format(data: Dict[str, Any]) -> str:
    """Return the notation asked for; absent or ``null`` is the default.

    Only the type is checked here. Whether it is one of ``KEY_FORMATS`` is the
    service's to say, against the one vocabulary (DEC-089).
    """
    from cuepoint.services.rekordbox_export_service import DEFAULT_KEY_FORMAT

    value = data.get("key_format")
    if value is None:
        return DEFAULT_KEY_FORMAT
    if not isinstance(value, str):
        raise bad_request(f"key_format must be text, not {value!r}")
    return value


def parse_destination(data: Dict[str, Any]) -> str:
    """Return the destination as sent; absent or ``null`` is blank.

    Blank is passed on rather than refused here, so it arrives as the service's
    own ``destination_blank`` like every other refusal of a destination.
    """
    value = data.get("destination_path")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise bad_request(f"destination_path must be text, not {value!r}")
    return value


def _query_limit(params: Dict[str, List[str]]) -> int:
    from cuepoint.persistence.rekordbox_export_repository import MAX_RECENT

    values = params.get("limit") or []
    if len(values) > 1:
        raise bad_request("limit may be given once")
    raw = values[0].strip() if values else ""
    if not raw:
        return HISTORY_LIMIT_DEFAULT
    try:
        wanted = int(raw)
    except ValueError:
        raise bad_request(f"limit must be a number, not {raw!r}") from None
    return max(1, min(wanted, MAX_RECENT))


# ---------------------------------------------------------------------------
# Serializers — explicit field lists
# ---------------------------------------------------------------------------


def _rules(rules_json: Any) -> Any:
    """A Smart Collection's recorded rules as an object, as the tree answers them.

    ``None`` for a Collection, and for rules that do not read as an object: the
    row is still history worth showing, and the tree answers unreadable rules
    the same way (ORG-06).
    """
    import json

    if not rules_json:
        return None
    try:
        parsed = json.loads(rules_json)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def export_playlist_to_dict(playlist: Any) -> Dict[str, Any]:
    """One playlist an export wrote, as it was written."""
    return {
        "id": playlist.id,
        "collection_id": playlist.collection_id,
        "kind": playlist.kind,
        "name": playlist.name,
        "path": playlist.path,
        "entry_count": playlist.entry_count,
        "dropped_count": playlist.dropped_count,
        "requested_count": playlist.requested_count,
        "rules": _rules(playlist.rules_json),
    }


def export_record_to_dict(record: Any, playlists: Sequence[Any]) -> Dict[str, Any]:
    """One export's row, with the playlists it wrote.

    The row as a reader needs it rather than as it is stored: the staleness a
    flag rather than ``0``/``1``, the fields a list rather than JSON text.
    """
    return {
        "id": record.id,
        "job_id": record.job_id,
        "started_at": record.started_at,
        "finished_at": record.finished_at,
        "outcome": record.outcome,
        "destination_path": record.destination_path,
        "source_path": record.source_path,
        "source_stale": bool(record.source_stale),
        "key_format": record.key_format,
        "track_count": record.track_count,
        "changed_track_count": record.changed_track_count,
        "fields": list(record.fields),
        "missing_file_count": record.missing_file_count,
        "file_check_known": record.file_check_known,
        "dropped_reference_count": record.dropped_reference_count,
        "error": record.error,
        "playlists": [export_playlist_to_dict(playlist) for playlist in playlists],
    }


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


def preview(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Say what an export of these Collections would write (DEC-084).

    Refused while the library is busy, exactly as a start would be, so the
    dialog can say what it is waiting for before anyone confirms anything.
    """
    from cuepoint.engine.rekordbox_export_jobs import refuse_if_library_busy

    _only(data, _SELECTION_FIELDS)
    collection_ids = parse_collection_ids(data)
    key_format = parse_key_format(data)
    refuse_if_library_busy(job_store)
    answer = _resolve("IRekordboxExportService").preview(collection_ids, key_format)
    return 200, {"preview": answer.to_dict()}


def start(data: Dict[str, Any], job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Validate an export, then start it as a job (DEC-084)."""
    from cuepoint.engine.rekordbox_export_jobs import start_rekordbox_export

    _only(data, (*_SELECTION_FIELDS, "destination_path"))
    collection_ids = parse_collection_ids(data)
    key_format = parse_key_format(data)
    destination = parse_destination(data)
    started = start_rekordbox_export(
        job_store,
        collection_ids,
        key_format,
        destination,
        service=_resolve("IRekordboxExportService"),
    )
    job = started.job
    return 202, {**started.to_dict(), "id": job.id, "state": job.state.value}


def history(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Recent exports with their playlists, and what the next one starts from."""
    limit = _query_limit(params)
    repository = _resolve("IRekordboxExportRepository")
    records = repository.recent(limit)
    return {
        "exports": [
            export_record_to_dict(record, repository.playlists_for(int(record.id)))
            for record in records
        ],
        "limit": limit,
        "remembered": _resolve("IRekordboxExportService").remembered().to_dict(),
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    HISTORY_PATH: history,
}

_POST_ROUTES: Dict[str, Callable[[Dict[str, Any], Any], Tuple[int, Dict[str, Any]]]] = {
    PREVIEW_PATH: preview,
    START_PATH: start,
}

#: Every path this module answers, for tests and the contract.
GET_PATHS: Tuple[str, ...] = tuple(_GET_ROUTES)
POST_PATHS: Tuple[str, ...] = tuple(_POST_ROUTES)


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in _GET_ROUTES


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return path in _POST_ROUTES


def handle_get(path: str, params: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    handler = _GET_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(params)


def handle_post(path: str, raw: bytes, *, job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return handler(_body(raw), job_store)


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope.

    The typed refusals come first: each is also a ``ValidationError``, and the
    point of the reason is that it is not flattened into a generic 400.
    """
    from cuepoint.engine.jobs import JobTypeBusyError
    from cuepoint.exceptions.cuepoint_exceptions import ValidationError
    from cuepoint.services.rekordbox_export_service import (
        ExportDestinationError,
        ExportSourceError,
    )

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, ExportDestinationError):
        return 400, error_payload(
            DESTINATION_REFUSED, exc.message, reason=exc.reason, path=exc.path
        )
    if isinstance(exc, ExportSourceError):
        return 409, error_payload(
            SOURCE_REFUSED, exc.message, reason=exc.reason, path=exc.path
        )
    if isinstance(exc, JobTypeBusyError):
        return 409, error_payload(
            LIBRARY_BUSY, str(exc), job_id=exc.job_id, job_type=exc.job_type
        )
    if isinstance(exc, (FilterRuleError, ValueError)):
        return 400, error_payload("INVALID_REQUEST", str(exc))
    if isinstance(exc, ValidationError):
        return 400, error_payload("INVALID_REQUEST", exc.message)
    if isinstance(exc, RekordboxExportUnavailableError):
        return 503, error_payload("LIBRARY_UNAVAILABLE", str(exc))
    return 500, error_payload("REKORDBOX_EXPORT_FAILED", str(exc))


__all__: Sequence[str] = (
    "DESTINATION_REFUSED",
    "GET_PATHS",
    "HISTORY_LIMIT_DEFAULT",
    "HISTORY_PATH",
    "LIBRARY_BUSY",
    "POST_PATHS",
    "PREVIEW_PATH",
    "SOURCE_REFUSED",
    "START_PATH",
    "RekordboxExportUnavailableError",
    "export_playlist_to_dict",
    "export_record_to_dict",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "parse_collection_ids",
    "parse_destination",
    "parse_key_format",
    "status_for",
)
