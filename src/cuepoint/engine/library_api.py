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

from typing import Any, Dict, List, Optional

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
