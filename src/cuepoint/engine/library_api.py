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
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.filter_rule import (
    FACETABLE_FIELDS,
    TYPE_NUMBER,
    Facet,
    FacetRange,
    RuleSet,
    describe_fields,
    describe_operators,
    field_spec,
)
from cuepoint.models.library_track import LibraryTrack, QueueTrack
from cuepoint.models.track_metadata import (
    TrackMetadata,
    effective_rating,
    rating_source,
)
from cuepoint.persistence.track_query import (
    COLLECTION_POSITION,
    DEFAULT_SORT,
    SORTABLE_COLUMNS,
)

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


def queue_track_to_dict(track: QueueTrack) -> Dict[str, Any]:
    """Serialize one playable queue entry (PLAYER-05).

    Seven fields, and an explicit list like :func:`track_to_dict`'s: a queue can
    be tens of thousands of rows, so anything added here is paid for once per
    track. ``file_path`` is what the player opens; the rest is what the player
    bar and the queue panel show, key and BPM included (PLAYER-06).
    """
    return {
        "id": track.id,
        "title": track.title,
        "artist": track.artist,
        "key": track.key,
        "bpm": track.bpm,
        "duration_seconds": track.duration_seconds,
        "file_path": track.file_path,
    }


def track_to_dict(
    track: LibraryTrack, metadata: Optional[TrackMetadata] = None
) -> Dict[str, Any]:
    """Serialize a library track for the API.

    An explicit field list rather than ``dataclasses.asdict``: the response is
    a public shape, and a field added to the model for internal reasons should
    not silently become part of it.

    LIBUI-03 added the fields DEC-034 imported — remixer, rating, play count,
    colour, date added, comment and bitrate — because the table's columns
    (DEC-042) and the Inspector (DEC-047) show them, and one serializer for one
    row shape is what keeps the two agreeing. Additive: every field the shape
    had, it still has.

    ORG-08 added CuePoint's own three. ``rating`` stays exactly what Rekordbox
    imported — DEC-057 keeps the two layers apart, and a row that overwrote one
    with the other would make the Inspector unable to say which it is showing.
    ``effective_rating`` is what to draw, ``rating_source`` says which layer it
    came from, and ``favorite`` is a flag of its own rather than five stars.
    Notes are deliberately absent: ten thousand characters times a hundred rows
    is a megabyte a window, and the one place that shows a note reads one track.

    ``metadata`` is what the window read in one query (ORG-02). ``None`` means
    the track has nothing recorded, which is the common case and is not a
    missing answer — the imported rating shows through and the favorite is
    false.
    """
    cuepoint_rating = metadata.rating if metadata is not None else None
    return {
        "id": track.id,
        "rekordbox_track_id": track.rekordbox_track_id,
        "title": track.title,
        "artist": track.artist,
        "remixer": track.remixer,
        "album": track.album,
        "label": track.label,
        "genre": track.genre,
        "key": track.key,
        "bpm": track.bpm,
        "year": track.year,
        "duration_seconds": track.duration_seconds,
        "rating": track.rating,
        "play_count": track.play_count,
        "colour": track.colour,
        "date_added": track.date_added,
        "comment": track.comment,
        "bitrate": track.bitrate,
        "file_path": track.file_path,
        "effective_rating": effective_rating(track.rating, cuepoint_rating),
        "rating_source": rating_source(track.rating, cuepoint_rating),
        "favorite": bool(metadata.favorite) if metadata is not None else False,
    }


#: The two things this endpoint can be asked. ``search`` is what global search
#: has always meant — a blank query finds nothing, because an empty search box
#: is not a request to read the library. ``browse`` is the Library table, where
#: a blank query means everything in the current scope.
MODE_SEARCH = "search"
MODE_BROWSE = "browse"
MODES = (MODE_SEARCH, MODE_BROWSE)

#: ``fields=id`` narrows the projection to ids (DEC-045); ``fields=queue``
#: narrows it to what a playback queue entry needs (PLAYER-05, DEC-012).
#: Anything else is refused rather than ignored, so a typo does not silently
#: return whole rows.
FIELDS_ID = "id"
FIELDS_QUEUE = "queue"
FIELDS_VALUES = (FIELDS_ID, FIELDS_QUEUE)


def parse_mode(raw: Optional[str]) -> str:
    """Parse the ``mode`` parameter, defaulting to today's behaviour.

    Defaulting to ``search`` is what keeps DEC-023's promise that a caller
    written before browsing existed still gets exactly what it got.

    Raises:
        ValueError: If the mode is not one this endpoint has.
    """
    if raw is None or raw == "":
        return MODE_SEARCH
    mode = str(raw).strip().lower()
    if mode not in MODES:
        raise ValueError(f"mode must be {' or '.join(MODES)}, not {raw!r}")
    return mode


def parse_filters_param(raw: Optional[str]) -> RuleSet:
    """Parse the ``filters`` parameter — a JSON rule set (DEC-043).

    JSON in a query string rather than a POST body, so browsing stays a GET:
    every scroll, sort and filter of the Library table is a read, and a read
    that cannot be repeated safely is a different kind of thing.

    Raises:
        ValueError: If the value is not JSON, or is not a rule set. The message
            is what the caller shows, and names the clause when it can.
    """
    if raw is None or raw.strip() == "":
        return RuleSet()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"filters must be a JSON object: {exc}") from None
    return RuleSet.from_dict(payload)


def parse_sort(raw: Optional[str]) -> str:
    """Parse the ``sort`` parameter against the whitelist.

    Raises:
        ValueError: If the column cannot be sorted by.
    """
    fallback: str = DEFAULT_SORT
    if raw is None or raw == "":
        return fallback
    sort = str(raw).strip()
    if sort not in SORTABLE_COLUMNS:
        valid = ", ".join(SORTABLE_COLUMNS)
        raise ValueError(f"Cannot sort by {raw!r}. Sortable columns: {valid}")
    return sort


def parse_direction(raw: Optional[str]) -> str:
    """Parse the ``dir`` parameter.

    Raises:
        ValueError: If it is neither ascending nor descending.
    """
    if raw is None or raw == "":
        return "asc"
    direction = str(raw).strip().lower()
    if direction not in ("asc", "desc"):
        raise ValueError(f"dir must be 'asc' or 'desc', not {raw!r}")
    return direction


def parse_playlist_id(raw: Optional[str]) -> Optional[int]:
    """Parse the ``playlist_id`` scope parameter.

    Raises:
        ValueError: If it is present and is not a number.
    """
    if raw is None or raw.strip() == "":
        return None
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"playlist_id must be a number, not {raw!r}") from None


def parse_fields(raw: Optional[str]) -> Optional[str]:
    """Parse the ``fields`` projection parameter.

    Raises:
        ValueError: If it is anything but ``id`` or ``queue``.
    """
    if raw is None or raw.strip() == "":
        return None
    fields = str(raw).strip().lower()
    if fields not in FIELDS_VALUES:
        allowed = " or ".join(repr(value) for value in FIELDS_VALUES)
        raise ValueError(f"fields may only be {allowed}, not {raw!r}")
    return fields


#: What ``scope`` may name. ``collection`` is CuePoint's own list of rows;
#: ``smart`` is a saved question that resolves to rules (DEC-061). Absent means
#: the library, which is what every caller written before ORG-08 sends.
SCOPE_COLLECTION = "collection"
SCOPE_SMART = "smart"
SCOPES = (SCOPE_COLLECTION, SCOPE_SMART)


def parse_scope(raw: Optional[str]) -> Optional[str]:
    """Parse the ``scope`` parameter.

    Raises:
        ValueError: If it is not one of :data:`SCOPES`.
    """
    if raw is None or raw.strip() == "":
        return None
    scope = str(raw).strip().lower()
    if scope not in SCOPES:
        allowed = " or ".join(repr(value) for value in SCOPES)
        raise ValueError(f"scope may only be {allowed}, not {raw!r}")
    return scope


def parse_collection_id(raw: Optional[str]) -> Optional[int]:
    """Parse the ``collection_id`` scope parameter.

    Raises:
        ValueError: If it is present and is not a number.
    """
    if raw is None or raw.strip() == "":
        return None
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"collection_id must be a number, not {raw!r}") from None


def parse_optional_sort(raw: Optional[str]) -> Optional[str]:
    """Parse ``sort``, keeping "the caller did not say" distinguishable.

    :func:`parse_sort` answers with the library's default for a missing value,
    which is the right answer for a library and the wrong one inside a scope
    that has an order of its own (ORG-09). Absent has to stay absent for this
    endpoint to tell the two apart.

    Raises:
        ValueError: If the column cannot be sorted by.
    """
    if raw is None or raw == "":
        return None
    return parse_sort(raw)


@dataclass(frozen=True)
class BrowseScope:
    """What a ``scope`` parameter resolved to (ORG-08).

    A Collection resolves to a scope the query narrows by and an order it can
    open in. A Smart Collection resolves to *rules* — it holds a question, not
    rows (DEC-061) — plus the sort it was saved with, so opening one shows what
    the user saw when they saved it.
    """

    collection_id: Optional[int] = None
    rules: RuleSet = RuleSet()
    sort: Optional[str] = None
    direction: Optional[str] = None


def _resolve_collection_service() -> Any:
    """Resolve ``ICollectionService``, or raise :class:`LibraryUnavailableError`."""
    try:
        from cuepoint.services.interfaces import ICollectionService
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(ICollectionService)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise LibraryUnavailableError(str(exc)) from exc


def resolve_scope(scope: Optional[str], collection_id: Optional[int]) -> BrowseScope:
    """Turn a ``scope`` and an id into what the query needs.

    Raises:
        ValueError: If a scope was named without a collection, or an id without
            a scope — both are requests that cannot be honoured as written,
            and guessing which was meant is worse than saying so.
        BrokenRuleError: If a Smart Collection's saved rules cannot be run. It
            is a ``FilterRuleError``, so it reaches the caller as the clause
            that broke rather than as a failure.
    """
    if scope is None and collection_id is None:
        return BrowseScope()
    if scope is None:
        raise ValueError("collection_id needs a scope: 'collection' or 'smart'")
    if collection_id is None:
        raise ValueError(f"scope={scope!r} needs a collection_id")

    if scope == SCOPE_COLLECTION:
        return BrowseScope(collection_id=collection_id, sort=COLLECTION_POSITION)

    resolution = _resolve_collection_service().resolve(collection_id)
    query = resolution.require_query()
    return BrowseScope(rules=query.rules, sort=query.sort, direction=query.direction)


def search_library(
    query: str,
    limit: int = SEARCH_LIMIT_DEFAULT,
    offset: int = 0,
    mode: str = MODE_SEARCH,
    playlist_id: Optional[int] = None,
    sort: Optional[str] = None,
    direction: Optional[str] = None,
    filters: Optional[RuleSet] = None,
    fields: Optional[str] = None,
    scope: Optional[str] = None,
    collection_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Run a library query and return the API payload.

    One endpoint, two modes (DEC-023). ``search`` is what it has always been.
    ``browse`` adds the scope, filters, ordering and paging the Library table
    needs — the same service, the same predicate, the same response shape.

    ``total`` is the full match count, not the page length, so the renderer can
    say "showing 100 of 47,913" without a second request. ``mode``, ``scope``,
    ``sort`` and ``dir`` are echoed back so a late response can be recognized
    by what it answers rather than by bookkeeping the renderer has to keep in
    step (LIBUI-05).

    ``scope`` adds CuePoint's own two (ORG-08). A Collection narrows the same
    query and opens in the order the user arranged unless a sort is named; a
    Smart Collection resolves to the rules it saved, which are then *and*ed with
    whatever the filter bar is holding — so narrowing a saved question further
    is one query, not a second path (DEC-016, DEC-043).

    Raises:
        BrowseQueryError: If the sort or direction cannot be honoured.
        FilterRuleError: If a filter rule cannot be honoured, including a saved
            one that names something that has since been deleted.
        ValueError: If the scope and the collection do not go together.
    """
    service = _resolve_library_service()
    resolved = resolve_scope(scope, collection_id)
    rules = _combine(resolved.rules, filters)
    # What the caller asked for wins; the scope's own answer is the fallback,
    # and the library's default is the fallback for that. A caller who names a
    # sort gets it, inside a Collection or out of one.
    order = sort or resolved.sort or DEFAULT_SORT
    heading = direction or resolved.direction or "asc"

    if mode == MODE_BROWSE:
        if fields == FIELDS_ID:
            browse = service.browse_track_ids
        elif fields == FIELDS_QUEUE:
            browse = service.browse_queue_tracks
        else:
            browse = service.browse_tracks
        result: Any = browse(
            query=query,
            playlist_id=playlist_id,
            rules=rules,
            sort=order,
            direction=heading,
            limit=limit,
            offset=offset,
            collection_id=resolved.collection_id,
        )
    else:
        result = service.search_tracks(query, limit=limit, offset=offset)

    found = getattr(result, "metadata", {}) or {}
    tracks: List[Dict[str, Any]] = [
        track_to_dict(t, found.get(t.id)) for t in result.tracks
    ]
    payload: Dict[str, Any] = {
        "query": result.query,
        "total": result.total,
        "limit": result.limit,
        "offset": result.offset,
        "tracks": tracks,
        # Lets the renderer say "no library yet" rather than "no results",
        # which are different problems with different answers.
        "library_empty": service.is_empty(),
        "mode": mode,
        "scope": getattr(result, "playlist_id", None),
        "sort": getattr(result, "sort", DEFAULT_SORT),
        "dir": getattr(result, "direction", "asc"),
        # CuePoint's scope, echoed under its own names rather than folded into
        # the two above: ``scope`` has meant "which playlist" since DEC-023 and
        # changing what it means would break every caller reading it.
        "collection_scope": scope,
        "collection_id": getattr(result, "collection_id", None),
        # The filters too, so a caller can tell a late response from a current
        # one by what it answers rather than by bookkeeping it has to keep in
        # step (LIBUI-05). Without this, adding a filter — which changes
        # neither the scope, the sort nor the text — produces two requests
        # whose responses are indistinguishable.
        # The rules that were actually run, saved ones included, so a caller
        # can tell a late response from a current one by what it answers
        # (LIBUI-05) and can see what a Smart Collection resolved to.
        "filters": rules.validated().to_dict(),
    }
    ids = getattr(result, "track_ids", None)
    if ids is not None:
        payload["track_ids"] = ids
    queue_tracks = getattr(result, "queue_tracks", None)
    if queue_tracks is not None:
        # Additive, like ``track_ids`` before it: a caller that never asks for
        # this projection sees exactly the response it always saw.
        payload["queue_tracks"] = [queue_track_to_dict(t) for t in queue_tracks]
    return payload


def _combine(saved: RuleSet, sent: Optional[RuleSet]) -> RuleSet:
    """AND a scope's saved rules with the ones the caller sent (DEC-016).

    Concatenation is the whole of it, because the rule model is flat and
    all-of: two lists of clauses that must all hold are one list of clauses
    that must all hold. When either side is empty the other is returned
    unchanged, so a request with no scope produces exactly the rule set it
    sent — which is what keeps DEC-023's guarantee that a caller written
    before ORG-08 gets byte-identical output.
    """
    extra = sent or RuleSet()
    if not saved.rules:
        return extra
    if not extra.rules:
        return saved
    return RuleSet(rules=tuple(saved.rules) + tuple(extra.rules), match=saved.match)


# ---------------------------------------------------------------------------
# Playlists, facets, track detail and the filter vocabulary (LIBUI-03)
# ---------------------------------------------------------------------------


def playlist_to_dict(node: Any) -> Dict[str, Any]:
    """Serialize one node of the mirrored Rekordbox tree (DEC-031, DEC-044).

    ``parent_id`` rather than a path is the structure, for the reason migration
    0006 records: a playlist name may contain the separator, so a path cannot
    always be split back into segments. The path is carried too, because it is
    what the CLI speaks and what a tooltip shows.
    """
    return {
        "id": node.id,
        "parent_id": node.parent_id,
        "name": node.name,
        "kind": node.kind,
        "depth": node.depth,
        "position": node.position,
        "path": node.rekordbox_path,
        "track_count": node.track_count,
    }


def library_playlists() -> Dict[str, Any]:
    """Return the whole mirrored playlist tree, parents before children.

    The whole tree in one response: 234 playlists is small, and a lazily loaded
    tree would be complexity bought for nothing. Read-only (DEC-031) — there is
    no endpoint here that changes one.
    """
    playlists = _resolve_playlist_repository()
    nodes = playlists.list_all()
    return {
        "playlists": [playlist_to_dict(node) for node in nodes],
        "total": len(nodes),
    }


def facet_to_dict(facet: Facet, span: Optional[FacetRange]) -> Dict[str, Any]:
    """Serialize a facet, with the numeric range when the field has one."""
    payload: Dict[str, Any] = facet.to_dict()
    payload["range"] = span.to_dict() if span is not None else None
    return payload


def library_facet(
    field: str,
    query: str = "",
    playlist_id: Optional[int] = None,
    filters: Optional[RuleSet] = None,
    limit: int = 0,
    scope: Optional[str] = None,
    collection_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Return which values a field takes in the current view, with counts.

    The list a filter control is built from (DEC-043). Computed over the scope,
    the text query and every filter *except* this field's own, so choosing one
    genre leaves the others choosable.

    A numeric field also carries ``range`` — both ends and how many tracks have
    no value — because a control for a number needs both to draw itself, and
    asking twice would mean two passes over the same rows.

    The scope is every scope the table has, CuePoint's included (ORG-08): a
    filter control inside a Collection has to offer the values that Collection
    holds. Answering with the library's would offer a genre that vanishes the
    moment it is chosen.

    Raises:
        FilterRuleError: If the field cannot be filtered by.
        ValueError: If the scope and the collection do not go together.
    """
    service = _resolve_library_service()
    spec = field_spec(field)
    resolved = resolve_scope(scope, collection_id)
    rules = _combine(resolved.rules, filters)
    facet = service.facet(
        spec.name,
        query=query,
        playlist_id=playlist_id,
        rules=rules,
        limit=limit,
        collection_id=resolved.collection_id,
    )
    span: Optional[FacetRange] = None
    if spec.type == TYPE_NUMBER:
        span = service.facet_range(
            spec.name,
            query=query,
            playlist_id=playlist_id,
            rules=rules,
            collection_id=resolved.collection_id,
        )
    return facet_to_dict(facet, span)


def library_filter_fields() -> Dict[str, Any]:
    """Return the filter vocabulary: fields, types and their operators.

    Sent rather than duplicated in TypeScript (DEC-043). The only way to
    guarantee the renderer cannot build a clause the engine refuses is for the
    list of what is buildable to come from the same place that does the
    refusing.
    """
    return {
        "fields": describe_fields(),
        # How many values each operator takes, so the renderer builds one
        # control for "between" and a different one for "is empty" without a
        # second copy of that rule (LIBUI-08).
        "operators": describe_operators(),
        "facetable": list(FACETABLE_FIELDS),
        "sortable": list(SORTABLE_COLUMNS),
    }


def library_track_detail(track_id: int) -> Dict[str, Any]:
    """Return one track and the playlists that contain it (DEC-047).

    The Inspector's content: everything imported, read-only, plus where the
    track sits in the collection. Membership comes from
    ``playlist_ids_for_track``, which LIBRARY-03 built an index for to answer
    exactly this.

    Raises:
        LookupError: If no track has this id. A missing track is a 404, not an
            empty object a panel would render as a track with no title.
    """
    service = _resolve_library_service()
    track = service.get_track(int(track_id))
    if track is None:
        raise LookupError(f"No track with id {track_id}")

    playlists = _resolve_playlist_repository()
    nodes = [
        playlists.get(playlist_id)
        for playlist_id in playlists.playlist_ids_for_track(int(track_id))
    ]
    holders = [playlist_to_dict(node) for node in nodes if node is not None]

    # The one place a note belongs: the Inspector reads one track, and this is
    # it (ORG-08). The row shape deliberately leaves notes out.
    from cuepoint.engine.organization_api import (
        collections_holding,
        metadata_to_dict,
        resolve_metadata_service,
        tags_on,
    )

    record = resolve_metadata_service().get(int(track_id))
    return {
        "track": track_to_dict(track, record),
        "playlists": holders,
        "playlist_count": len(holders),
        "metadata": metadata_to_dict(int(track_id), track.rating, record),
        "tags": tags_on(int(track_id)),
        "collections": collections_holding(int(track_id)),
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


def parse_refresh_preview_body(raw: bytes) -> Tuple[Optional[str], bool]:
    """Return the optional ``xml_path`` a preview should read, and ``force``.

    An empty body is valid and is the usual case: DEC-035 recorded where the
    library came from precisely so a refresh does not have to ask. A path is
    accepted for the other case — previewing a different export before deciding
    to adopt it.

    ``force`` asks for the export to be read even when its recorded state says
    it cannot have changed (LIBRARY-12). Off by default, because the whole point
    of recording that state is not to read a 50,000-track file to be told
    nothing happened.

    Raises:
        ValueError: If the body is present but is not a JSON object, carries an
            ``xml_path`` that is not a usable string, or a non-boolean
            ``force``.
    """
    if not raw:
        return None, False
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")

    force = data.get("force", False)
    if not isinstance(force, bool):
        raise ValueError("force must be true or false")

    raw_path = data.get("xml_path")
    if raw_path is None:
        return None, force
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ValueError("xml_path must be a non-empty string when given")
    return raw_path.strip(), force


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


def start_refresh_preview(
    xml_path: Optional[str], force: bool = False, *, job_store: Any
) -> Dict[str, Any]:
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
    job = start_refresh_preview_job(job_store, checked, force=force)
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
