"""Library search over the persistent ``tracks`` table (DEC-023, SHELL-04).

The shell's global search is backed by a real query from the start rather than
a client-side filter over whatever is on screen. It legitimately returns
nothing until the Library phase imports a collection, and needs no rewrite when
it does — Phase 4 extends this endpoint (filters, scoping, ranking) rather than
introducing a second search path.

The response shape is a public contract under the "preserve response shapes"
invariant, so it is defined here in one place.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.library_track import LibraryTrack

# Kept in step with LibraryService's own clamp; declared here too so a caller
# reading this module knows the bounds without following the call through.
SEARCH_LIMIT_DEFAULT = 50
SEARCH_LIMIT_MAX = 200


class LibraryUnavailableError(RuntimeError):
    """The library service could not be resolved.

    Raised rather than returning an empty result, because "no results" and
    "the database is unreachable" mean very different things to someone
    looking at an empty search box.
    """


def _resolve_library_service() -> Any:
    """Resolve ``ILibraryService`` from the DI container.

    Resolved per call, not at import: this module is imported while the engine
    server is being built, which happens before ``bootstrap_services()`` runs.
    This is the same pattern ``_resolve_job_repository()`` established.
    """
    try:
        from cuepoint.services.interfaces import ILibraryService
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(ILibraryService)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise LibraryUnavailableError(str(exc)) from exc


def parse_int_param(raw: Optional[str], *, default: int, name: str) -> int:
    """Parse a query-string integer, raising ValueError with a usable message."""
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def track_to_dict(track: LibraryTrack) -> Dict[str, Any]:
    """Serialize a library track for the API.

    An explicit field list rather than ``dataclasses.asdict``: the response is
    a public shape, and a field added to the model for internal reasons should
    not silently become part of it.
    """
    return {
        "id": track.id,
        "rekordbox_track_id": track.rekordbox_track_id,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "label": track.label,
        "genre": track.genre,
        "key": track.key,
        "bpm": track.bpm,
        "year": track.year,
        "duration_seconds": track.duration_seconds,
        "file_path": track.file_path,
    }


def search_library(
    query: str,
    limit: int = SEARCH_LIMIT_DEFAULT,
    offset: int = 0,
) -> Dict[str, Any]:
    """Run a library search and return the API payload.

    ``total`` is the full match count, not the page length, so the renderer can
    say "showing 20 of 340" without a second request.
    """
    service = _resolve_library_service()
    result = service.search_tracks(query, limit=limit, offset=offset)
    tracks: List[Dict[str, Any]] = [track_to_dict(t) for t in result.tracks]
    return {
        "query": result.query,
        "total": result.total,
        "limit": result.limit,
        "offset": result.offset,
        "tracks": tracks,
        # Lets the renderer say "no library yet" rather than "no results",
        # which are different problems with different answers.
        "library_empty": service.is_empty(),
    }


# ---------------------------------------------------------------------------
# Import and summary (LIBRARY-06)
# ---------------------------------------------------------------------------

#: Suffixes a Rekordbox collection export can have. Checked before starting a
#: job so an obviously wrong pick — a CSV, an audio file — is refused straight
#: away instead of becoming a failed job the user has to go and read.
IMPORT_SUFFIXES = (".xml",)


def parse_import_body(raw: bytes) -> str:
    """Return the ``xml_path`` from a request body.

    Raises:
        ValueError: If the body is not a JSON object, or carries no usable
            ``xml_path``. The message is what the caller shows, so it says what
            was expected rather than what went wrong internally.
    """
    if not raw:
        raise ValueError("A JSON body with an xml_path is required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")

    raw_path = data.get("xml_path")
    if raw_path is None or not str(raw_path).strip():
        raise ValueError("xml_path is required")
    return str(raw_path).strip()


def validate_import_path(xml_path: str) -> str:
    """Check a path can plausibly be imported, and return it.

    Only what can be decided cheaply and certainly: that something is there,
    that it is a file, and that it is named like an export. Whether it is
    *really* a Rekordbox collection needs the parser, and that stays inside the
    job — a file that opens and turns out to be the wrong XML is a job failure
    with a message, not a rejected request.

    The split matters because the two failures reach the user differently. A
    path that does not exist is almost always a mis-click or a file that moved,
    and answering immediately is kinder than creating a job that fails a second
    later.

    Raises:
        ValueError: If the path is missing, is not a file, or is not XML.
    """
    path = Path(xml_path)
    if not path.exists():
        raise ValueError(f"No such file: {xml_path}")
    if not path.is_file():
        raise ValueError(f"Not a file: {xml_path}")
    if path.suffix.lower() not in IMPORT_SUFFIXES:
        raise ValueError(
            f"Not a Rekordbox XML export: {path.name}. "
            "In Rekordbox, use File > Export Collection in xml format."
        )
    return str(path)


def start_import(xml_path: str, *, job_store: Any) -> Dict[str, Any]:
    """Start a library import as a background job (DEC-033).

    Returns the job identity only. Progress is followed through the existing
    job endpoints and their SSE stream — this endpoint deliberately adds no
    second progress mechanism for the renderer to keep in step.

    Raises:
        ValueError: If the path cannot plausibly be imported.
        JobTypeBusyError: If an import is already running.
    """
    from cuepoint.engine.library_jobs import start_library_import_job

    job = start_library_import_job(job_store, validate_import_path(xml_path))
    return {"job_id": job.id, "id": job.id, "state": job.state.value}


def _resolve_import_service() -> Any:
    """Resolve ``ILibraryImportService``, or raise :class:`LibraryUnavailableError`."""
    try:
        from cuepoint.services.interfaces import ILibraryImportService
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(ILibraryImportService)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise LibraryUnavailableError(str(exc)) from exc


def _resolve_playlist_repository() -> Any:
    """Resolve ``IPlaylistRepository``, or raise :class:`LibraryUnavailableError`."""
    try:
        from cuepoint.services.interfaces import IPlaylistRepository
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(IPlaylistRepository)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise LibraryUnavailableError(str(exc)) from exc


def source_to_dict(source: Any) -> Dict[str, Any]:
    """Serialize the DEC-035 source record, with the file's state now.

    ``exists`` and ``changed`` are separate because they lead to different
    things being said: a file that has moved has to be found again, one that has
    changed has to be re-read, and one that is exactly as it was needs neither.
    ``changed`` is null when it cannot be known — the file is gone, or the
    import never recorded its state — which a caller must read as "re-read it",
    never as "assume unchanged".
    """
    state = source.current_file_state()
    return {
        "xml_path": source.xml_path,
        "imported_at": source.imported_at,
        "xml_modified_at": source.xml_modified_at,
        "xml_size_bytes": source.xml_size_bytes,
        "track_count": source.track_count,
        "playlist_count": source.playlist_count,
        "exists": state.exists,
        "changed": state.changed,
    }


def library_summary() -> Dict[str, Any]:
    """Return what the library holds and where it came from.

    Answers honestly before any import: zero counts, ``library_empty`` true and
    a null ``source``. "Nothing imported yet" and "imported an empty
    collection" are different situations, and the source record is what tells
    them apart.
    """
    service = _resolve_library_service()
    playlists = _resolve_playlist_repository()
    source = _resolve_import_service().current_source()

    return {
        "track_count": service.track_count(),
        "playlist_count": playlists.count(),
        "playlist_entry_count": playlists.count_entries(),
        "library_empty": service.is_empty(),
        "source": source_to_dict(source) if source is not None else None,
    }


# ---------------------------------------------------------------------------
# Refresh: preview and apply (LIBRARY-10, DEC-032)
# ---------------------------------------------------------------------------


def parse_refresh_preview_body(raw: bytes) -> Optional[str]:
    """Return the optional ``xml_path`` a preview should read.

    An empty body is valid and is the usual case: DEC-035 recorded where the
    library came from precisely so a refresh does not have to ask. A path is
    accepted for the other case — previewing a different export before deciding
    to adopt it.

    Raises:
        ValueError: If the body is present but is not a JSON object, or carries
            an ``xml_path`` that is not a usable string.
    """
    if not raw:
        return None
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")

    raw_path = data.get("xml_path")
    if raw_path is None:
        return None
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ValueError("xml_path must be a non-empty string when given")
    return raw_path.strip()


def parse_refresh_apply_body(raw: bytes) -> Tuple[str, bool]:
    """Return ``(diff_id, confirm_references)`` from an apply request.

    ``diff_id`` is required and there is no default. An apply that fell back to
    "the most recent preview" would delete tracks on the strength of a diff the
    caller never named, which is the one shortcut this flow must not take.

    Raises:
        ValueError: If the body is missing, malformed, or carries no diff id.
    """
    if not raw:
        raise ValueError("A JSON body with a diff_id is required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")

    diff_id = data.get("diff_id")
    if diff_id is None or not str(diff_id).strip():
        raise ValueError("diff_id is required; preview the refresh first")

    confirm = data.get("confirm_references", False)
    if not isinstance(confirm, bool):
        raise ValueError("confirm_references must be true or false")
    return str(diff_id).strip(), confirm


def start_refresh_preview(xml_path: Optional[str], *, job_store: Any) -> Dict[str, Any]:
    """Start a refresh preview as a background job (DEC-032, DEC-033).

    A given path is checked the way an import's is, so an obviously wrong pick
    is refused straight away rather than becoming a failed job. A *missing*
    path is not checked here: the file to read is then the source record's, and
    whether that still exists is the job's answer to give, with the same
    ``LIBRARY_NOT_IMPORTED`` code a caller already handles.

    Raises:
        ValueError: If a given path cannot plausibly be read.
        JobTypeBusyError: If any library job is already running.
    """
    from cuepoint.engine.library_refresh import start_refresh_preview_job

    checked = validate_import_path(xml_path) if xml_path else None
    job = start_refresh_preview_job(job_store, checked)
    return {"job_id": job.id, "id": job.id, "state": job.state.value}


def start_refresh_apply(
    diff_id: str, confirm_references: bool, *, job_store: Any
) -> Dict[str, Any]:
    """Start applying a stored diff (DEC-032, DEC-003).

    The diff is looked up and its freshness checked **before** the job is
    created, so an unknown or stale id comes back as an immediate, specific
    refusal rather than a job the caller has to watch fail. The job checks
    again before writing; see ``run_refresh_apply_job`` for why both.

    Raises:
        DiffNotFoundError: If the id is unknown or has been forgotten.
        DiffStaleError: If the file has changed since the preview.
        JobTypeBusyError: If any library job is already running.
    """
    from cuepoint.engine.library_refresh import (
        get_diff_store,
        start_refresh_apply_job,
    )

    get_diff_store().require_fresh(diff_id)
    job = start_refresh_apply_job(
        job_store, diff_id, confirm_references=confirm_references
    )
    return {"job_id": job.id, "id": job.id, "state": job.state.value}
