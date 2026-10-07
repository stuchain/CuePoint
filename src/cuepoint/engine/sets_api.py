#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set over the wire (PREP-08).

PREP-02 to PREP-07 built the Set: its chapters, times and notes, what fits at a
point in it, its warnings, its set lists and its place in the Rekordbox export.
This module is how the renderer reaches the first five. Every route lives under
``/api/v1/sets/``. The export needs nothing here: its routes already take a
Set's id (PREP-07).

The routes
----------
Reads are GETs, named by ``set_id`` in the query string, so a Prepare page
redrawing itself can repeat one safely:

- ``plan``: the Set's notes, its chapters with their targets, running times
  and starts, and every entry's plan (PREP-03).
- ``entries``: the whole Set in its running order, repeats included, each
  entry's plan beside the Library's own row for its track: the fields the
  table shows, effective values and the file's last check. Never more than
  ``MAX_SET_ENTRIES``, which a Set cannot pass.
- ``analysis``: the Set's warnings and notices (PREP-05).
- ``suggestions``: what fits at a gap, named by the entries on either side,
  over a pool given as the Library's own query parameters (PREP-04), each
  suggestion beside the Library's own row for its track (PREP-11).
- ``set-list/text``: the plain-text set list, for the clipboard (PREP-06).

Everything that changes something is a POST to an action path, as
``server.py`` speaks: ``create``, ``create-from``, ``duplicate``, ``notes``;
``chapters/create``, ``update``, ``move``, ``delete`` and ``split``;
``entries/move``, ``times`` and ``note``; ``acknowledge`` and
``unacknowledge``; ``set-list/save``.

**Adding and removing entries is not here.** It stays on
``/api/v1/collections/tracks/*``, which PREP-02 made Set-aware: one path writes
an entry, on the wire as in the repository. That insert takes a chapter too,
for a drop at the top of one.

Every handler validates and delegates
-------------------------------------
No rule about a Set lives here. What a time may be, which chapter an entry
joins, what a warning is and where a set list may be written are the
services'. What lives here is the wire: a body read into arguments, a refusal
turned into a code, and an explicit field list on the way out.

What a request may say
----------------------
A key a route does not take is refused, naming it and what the route does
take; a query parameter given twice is refused. Ids are positive whole numbers.
A typed time is text, ``m:ss`` or ``h:mm:ss``, and a blank one clears it
(DEC-107): the service reads it, so a time the Set rejects is refused in the
same words however it arrives.

Refusals, typed
---------------
A refusal a person can act on carries its code, and a ``reason`` where there
is more than one kind of it, so the renderer can draw the right next step
rather than match a sentence (EXPORT-06's rule, DISCOVER-09's pattern):

- ``SET_NOT_FOUND`` (404) with ``reason`` ``set``, ``chapter`` or ``entry``: the
  thing named has gone, deleted in another window or by a refresh. The view's
  cue to reload.
- ``SET_INSERTION_POINT_REFUSED`` with PREP-04's ``reason``: ``stale`` (409, the
  two entries are no longer side by side: reload), ``empty_set`` (409) or
  ``no_neighbour`` (400).
- ``SET_LIST_DESTINATION_REFUSED`` (400) with PREP-06's ``reason`` and the
  ``path``. The rule is Python's, never the save dialog's.
- ``SET_LIST_WRITE_FAILED`` (500) with the ``path``: the destination was fine
  and the file system would not write it. Choosing another place is the
  answer, so it is a refusal and not only a failure.
- ``INVALID_REQUEST`` (400): a body or a parameter, or a value a service
  refuses, in its words: a time that is not one, a Set that is full, a warning
  that is no longer there.
- 503 when a service cannot be resolved; 500 for anything unrecognized. Those
  two are not refusals: nothing a person does changes them.
"""

from __future__ import annotations

import logging
import os
import re
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
)

from cuepoint.engine.api_errors import ApiError, bad_request, error_payload, not_found
from cuepoint.models.filter_rule import FilterRuleError

_logger = logging.getLogger(__name__)

PREFIX = "/api/v1/sets/"

PLAN_PATH = PREFIX + "plan"
ENTRIES_PATH = PREFIX + "entries"
ANALYSIS_PATH = PREFIX + "analysis"
SUGGESTIONS_PATH = PREFIX + "suggestions"
SET_LIST_TEXT_PATH = PREFIX + "set-list/text"

CREATE_PATH = PREFIX + "create"
CREATE_FROM_PATH = PREFIX + "create-from"
DUPLICATE_PATH = PREFIX + "duplicate"
NOTES_PATH = PREFIX + "notes"
CHAPTER_CREATE_PATH = PREFIX + "chapters/create"
CHAPTER_UPDATE_PATH = PREFIX + "chapters/update"
CHAPTER_MOVE_PATH = PREFIX + "chapters/move"
CHAPTER_DELETE_PATH = PREFIX + "chapters/delete"
CHAPTER_SPLIT_PATH = PREFIX + "chapters/split"
ENTRY_MOVE_PATH = PREFIX + "entries/move"
ENTRY_TIMES_PATH = PREFIX + "entries/times"
ENTRY_NOTE_PATH = PREFIX + "entries/note"
ACKNOWLEDGE_PATH = PREFIX + "acknowledge"
UNACKNOWLEDGE_PATH = PREFIX + "unacknowledge"
SET_LIST_SAVE_PATH = PREFIX + "set-list/save"

#: The refusal codes a caller can branch on. Named here and in the client, and
#: a test compares the two.
INVALID_REQUEST = "INVALID_REQUEST"
SET_NOT_FOUND = "SET_NOT_FOUND"
INSERTION_POINT_REFUSED = "SET_INSERTION_POINT_REFUSED"
SET_LIST_DESTINATION_REFUSED = "SET_LIST_DESTINATION_REFUSED"
SET_LIST_WRITE_FAILED = "SET_LIST_WRITE_FAILED"

REFUSAL_CODES: Tuple[str, ...] = (
    INVALID_REQUEST,
    SET_NOT_FOUND,
    INSERTION_POINT_REFUSED,
    SET_LIST_DESTINATION_REFUSED,
    SET_LIST_WRITE_FAILED,
)

#: What a ``SET_NOT_FOUND`` names.
MISSING_SET = "set"
MISSING_CHAPTER = "chapter"
MISSING_ENTRY = "entry"
NOT_FOUND_REASONS: Tuple[str, ...] = (MISSING_SET, MISSING_CHAPTER, MISSING_ENTRY)

#: What each route takes: the query parameters of a read, the fields of an
#: action's body. Named here so the client's copies can be held to them.
SET_PARAMS: Tuple[str, ...] = ("set_id",)
SUGGESTIONS_PARAMS: Tuple[str, ...] = (
    "set_id",
    "before_entry_id",
    "after_entry_id",
    "chapter_id",
    "against",
    "limit",
    "q",
    "playlist_id",
    "filters",
    "scope",
    "collection_id",
)
CREATE_FIELDS: Tuple[str, ...] = ("name", "parent_id")
CREATE_FROM_FIELDS: Tuple[str, ...] = ("source", "name", "parent_id")
SOURCE_FIELDS: Tuple[str, ...] = ("kind", "id", "track_ids")
DUPLICATE_FIELDS: Tuple[str, ...] = ("set_id", "name")
NOTES_FIELDS: Tuple[str, ...] = ("set_id", "notes")
CHAPTER_CREATE_FIELDS: Tuple[str, ...] = (
    "set_id",
    "name",
    "position",
    "after_chapter_id",
)
CHAPTER_UPDATE_FIELDS: Tuple[str, ...] = (
    "chapter_id",
    "name",
    "notes",
    "target",
    "bpm_min",
    "bpm_max",
)
CHAPTER_MOVE_FIELDS: Tuple[str, ...] = ("chapter_id", "position")
CHAPTER_DELETE_FIELDS: Tuple[str, ...] = ("chapter_id",)
CHAPTER_SPLIT_FIELDS: Tuple[str, ...] = ("entry_id", "name")
ENTRY_MOVE_FIELDS: Tuple[str, ...] = ("entry_id", "position", "chapter_id")
ENTRY_TIMES_FIELDS: Tuple[str, ...] = ("entry_id", "in_time", "out_time")
ENTRY_NOTE_FIELDS: Tuple[str, ...] = ("entry_id", "note")
ACKNOWLEDGE_FIELDS: Tuple[str, ...] = ("from_entry_id", "to_entry_id", "warning")
SET_LIST_SAVE_FIELDS: Tuple[str, ...] = ("set_id", "destination_path")

#: The largest id SQLite stores, so a parsed id is always one a row could have.
_MAX_ID = 2**63 - 1
_WHOLE = re.compile(r"^\d+$")


class SetsUnavailableError(RuntimeError):
    """A service could not be resolved: the database is unreachable."""


def _resolve(interface_name: str) -> Any:
    """Resolve one interface by name, per call: imported before bootstrap."""
    try:
        from cuepoint.services import interfaces
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(getattr(interfaces, interface_name))
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise SetsUnavailableError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Query strings
# ---------------------------------------------------------------------------


def _params(params: Dict[str, List[str]], allowed: Sequence[str]) -> Dict[str, str]:
    """The query's parameters, each once, and only ones this route takes."""
    unknown = sorted(key for key in params if key not in allowed)
    if unknown:
        raise bad_request(
            f"Unknown parameter {', '.join(unknown)!r}. This request takes: "
            + ", ".join(allowed)
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


def _query_id(query: Dict[str, str], name: str) -> int:
    raw = query.get(name, "")
    if raw == "":
        raise bad_request(f"{name} is required")
    return _whole(raw, name, 1, _MAX_ID)


def _query_optional_id(query: Dict[str, str], name: str) -> Optional[int]:
    raw = query.get(name, "")
    return None if raw == "" else _whole(raw, name, 1, _MAX_ID)


# ---------------------------------------------------------------------------
# Bodies
# ---------------------------------------------------------------------------


def _body(raw: bytes) -> Dict[str, Any]:
    from cuepoint.engine.organization_api import parse_body

    result: Dict[str, Any] = parse_body(raw)
    return result


def _only(data: Mapping[str, Any], allowed: Sequence[str]) -> None:
    """Refuse a key this route does not take, naming it and what it does take."""
    unknown = sorted(str(key) for key in data if key not in allowed)
    if unknown:
        raise bad_request(
            f"Unknown field {', '.join(unknown)!r}. This request takes: "
            + ", ".join(allowed)
        )


def _id(value: Any, name: str) -> int:
    """A positive whole number; a bool is refused, as ``True`` is not an id."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise bad_request(f"{name} must be a whole number, not {value!r}")
    if not 1 <= value <= _MAX_ID:
        raise bad_request(f"{name} must be a positive whole number, not {value!r}")
    return int(value)


def _required_id(data: Mapping[str, Any], name: str) -> int:
    if data.get(name) is None:
        raise bad_request(f"{name} is required")
    return _id(data[name], name)


def _optional_id(data: Mapping[str, Any], name: str) -> Optional[int]:
    value = data.get(name)
    return None if value is None else _id(value, name)


def _position(data: Mapping[str, Any], name: str, *, required: bool) -> Optional[int]:
    """A place from 0; the services clamp one past the end to the end."""
    value = data.get(name)
    if value is None:
        if required:
            raise bad_request(f"{name} is required")
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise bad_request(f"{name} must be a whole number, not {value!r}")
    if value < 0:
        raise bad_request(f"{name} cannot be negative, not {value!r}")
    return int(value)


def _text(data: Mapping[str, Any], name: str) -> Optional[str]:
    """Text as sent, or ``None`` when absent or null."""
    value = data.get(name)
    if value is None or isinstance(value, str):
        return value
    raise bad_request(f"{name} must be text, not {value!r}")


def _present(data: Mapping[str, Any], name: str) -> None:
    """Require a key a route writes, even when its value clears something.

    A time, a note or a Set's notes left out would be cleared by accident; a
    ``null`` sent on purpose clears it.
    """
    if name not in data:
        raise bad_request(f"{name} is required; send null to clear it")


def _bpm(data: Mapping[str, Any], name: str) -> Optional[float]:
    value = data.get(name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise bad_request(f"{name} must be a number, not {value!r}")
    return float(value)


# ---------------------------------------------------------------------------
# What must exist
# ---------------------------------------------------------------------------


def _require_set(set_id: int) -> Any:
    """The node, or ``SET_NOT_FOUND``. A node that is not a Set is the
    service's to refuse, in its words ("'Crate' is a collection, not a Set")."""
    node = _resolve("ICollectionService").get(set_id)
    if node is None:
        raise ApiError(
            404, SET_NOT_FOUND, f"There is no Set {set_id}", reason=MISSING_SET
        )
    return node


def _require_chapter(chapter_id: int) -> Any:
    chapter = _resolve("ISetRepository").chapter(chapter_id)
    if chapter is None:
        raise ApiError(
            404,
            SET_NOT_FOUND,
            f"There is no chapter {chapter_id}",
            reason=MISSING_CHAPTER,
        )
    return chapter


def _require_entry(entry_id: int) -> Any:
    row = _resolve("ISetRepository").entry_row(entry_id)
    if row is None:
        raise ApiError(
            404,
            SET_NOT_FOUND,
            f"There is no entry {entry_id} in a Set",
            reason=MISSING_ENTRY,
        )
    return row


# ---------------------------------------------------------------------------
# Serializers — explicit field lists
# ---------------------------------------------------------------------------


def set_to_dict(node: Any) -> Dict[str, Any]:
    """A Set as the tree draws it, with its counts, as the tree answers it."""
    from cuepoint.engine.organization_api import collection_to_dict

    counts = _resolve("ICollectionService").counts(int(node.id))
    result: Dict[str, Any] = collection_to_dict(node, counts)
    return result


def chapter_to_dict(chapter: Any) -> Dict[str, Any]:
    """One chapter as it is stored: its place, name, notes and targets."""
    return {
        "id": chapter.id,
        "set_id": chapter.collection_id,
        "position": chapter.position,
        "name": chapter.name,
        "notes": chapter.notes,
        "target_seconds": chapter.target_seconds,
        "bpm_min": chapter.bpm_min,
        "bpm_max": chapter.bpm_max,
        "created_at": chapter.created_at,
        "updated_at": chapter.updated_at,
    }


def entry_plan_to_dict(plan: Any) -> Dict[str, Any]:
    """One entry's chapter, planned times and note, with its planned length."""
    return {
        "entry_id": plan.entry_id,
        "set_id": plan.collection_id,
        "chapter_id": plan.chapter_id,
        "in_seconds": plan.in_seconds,
        "out_seconds": plan.out_seconds,
        "planned_seconds": plan.planned_seconds,
        "note": plan.note,
    }


def details_to_dict(details: Any) -> Dict[str, Any]:
    """A Set's notes, and when they last changed."""
    return {
        "set_id": details.collection_id,
        "notes": details.notes,
        "updated_at": details.updated_at,
    }


def acknowledgement_to_dict(acknowledgement: Any) -> Dict[str, Any]:
    """An accepted warning, with the values it accepted as an object."""
    return {
        "id": acknowledgement.id,
        "set_id": acknowledgement.collection_id,
        "from_entry_id": acknowledgement.from_entry_id,
        "to_entry_id": acknowledgement.to_entry_id,
        "warning": acknowledgement.warning,
        "compared": acknowledgement.compared,
        "created_at": acknowledgement.created_at,
    }


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def plan(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The Set's notes, chapters, entries' plans and running times (PREP-03)."""
    set_id = _query_id(_params(params, SET_PARAMS), "set_id")
    _require_set(set_id)
    result: Dict[str, Any] = _resolve("ISetService").plan(set_id).to_dict()
    return result


def _track_rows(track_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    """The Library's own row for each track that still exists, by id.

    Read the way a browse window reads it (``track_to_dict``), so a track on
    the Prepare page reads the same as in the Library table: effective values,
    CuePoint's rating, the file's last check. A track a refresh deleted is
    simply absent, and the caller leaves out whatever named it.
    """
    from cuepoint.engine.library_api import track_to_dict
    from cuepoint.persistence.id_chunks import unique_ids

    ids = unique_ids(track_ids)
    tracks = {
        int(track.id): track for track in _resolve("ITrackRepository").get_many(ids)
    }
    metadata = _resolve("IMetadataService").get_many(ids)
    library = _resolve("ILibraryService")
    clean = library.clean_states(ids)
    sources = library.override_sources(ids)
    return {
        track_id: track_to_dict(
            track,
            metadata.get(track_id),
            clean.get(track_id),
            sources.get(track_id),
        )
        for track_id, track in tracks.items()
    }


def entries(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The Set in its running order, each entry beside its track's row.

    The row is the Library's own (``_track_rows``). The plan is read in one
    transaction (PREP-03); the rows after it. A track a refresh deletes between
    the two takes its entries with it, so an entry whose row has gone is left
    out, as a second read would leave it.
    """
    from cuepoint.models.set_plan import MAX_SET_ENTRIES

    set_id = _query_id(_params(params, SET_PARAMS), "set_id")
    _require_set(set_id)
    read = _resolve("ISetService").plan(set_id)
    tracks = _track_rows(entry.track_id for entry in read.entries)
    rows = [
        {**entry.to_dict(), "track": tracks[entry.track_id]}
        for entry in read.entries
        if entry.track_id in tracks
    ]
    return {
        "set_id": read.set.id,
        "name": read.set.name,
        "entries": rows,
        "limit": MAX_SET_ENTRIES,
    }


def analysis(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Every transition, entry and chapter checked (PREP-05, DEC-106)."""
    set_id = _query_id(_params(params, SET_PARAMS), "set_id")
    _require_set(set_id)
    result: Dict[str, Any] = _resolve("ISetAnalysisService").analyse(set_id).to_dict()
    return result


def suggestions(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """What fits between two entries, over a pool (PREP-04, DEC-105).

    The pool is the Library's own parameters — ``q``, ``playlist_id``,
    ``filters``, ``scope`` and ``collection_id`` — read as Similar Tracks reads
    its scope, so a Smart Collection resolves to its saved rules and a filter
    narrows the pool exactly as it narrows the table.
    """
    from cuepoint.engine.library_api import (
        combine_rules,
        parse_collection_id,
        parse_filters_param,
        parse_playlist_id,
        parse_scope,
        resolve_scope,
    )
    from cuepoint.models.set_suggestions import SIDES
    from cuepoint.models.similar_tracks import DEFAULT_SIMILAR_LIMIT, MAX_SIMILAR_LIMIT
    from cuepoint.persistence.track_query import BrowseQuery

    query = _params(params, SUGGESTIONS_PARAMS)
    set_id = _query_id(query, "set_id")
    against = query.get("against", "") or None
    if against is not None and against not in SIDES:
        raise bad_request(f"against must be one of {', '.join(SIDES)}, not {against!r}")
    raw_limit = query.get("limit", "")
    limit = (
        DEFAULT_SIMILAR_LIMIT
        if raw_limit == ""
        else _whole(raw_limit, "limit", 1, MAX_SIMILAR_LIMIT)
    )
    resolved = resolve_scope(
        parse_scope(query.get("scope")),
        parse_collection_id(query.get("collection_id")),
    )
    pool = BrowseQuery(
        query=query.get("q", ""),
        playlist_id=parse_playlist_id(query.get("playlist_id")),
        rules=combine_rules(resolved.rules, parse_filters_param(query.get("filters"))),
        collection_id=resolved.collection_id,
    )
    _require_set(set_id)
    answer = _resolve("ISetSuggestionService").suggest(
        set_id,
        before_entry_id=_query_optional_id(query, "before_entry_id"),
        after_entry_id=_query_optional_id(query, "after_entry_id"),
        pool=pool,
        chapter_id=_query_optional_id(query, "chapter_id"),
        against=against,
        limit=limit,
    )
    result: Dict[str, Any] = answer.to_dict()
    # Each suggestion beside the Library's own row for its track (PREP-11), as
    # an entry is: the source panel draws, drags and inserts it with no second
    # read per track. A track deleted since it was scored is left out.
    tracks = _track_rows(s["track_id"] for s in result["suggestions"])
    result["suggestions"] = [
        {**s, "track": tracks[s["track_id"]]}
        for s in result["suggestions"]
        if s["track_id"] in tracks
    ]
    return result


def set_list_text(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """The plain-text set list, which the renderer copies (DEC-110)."""
    set_id = _query_id(_params(params, SET_PARAMS), "set_id")
    _require_set(set_id)
    return {"set_id": set_id, "text": _resolve("ISetListService").text(set_id)}


# ---------------------------------------------------------------------------
# The Set
# ---------------------------------------------------------------------------


def create(data: Dict[str, Any]) -> Dict[str, Any]:
    """An empty Set with one unnamed chapter, filed where it is asked for."""
    _only(data, CREATE_FIELDS)
    name = _text(data, "name")
    if name is None:
        raise bad_request("name is required")
    node = _resolve("ICollectionService").create_set(
        name, _optional_id(data, "parent_id")
    )
    return {"set": set_to_dict(node)}


def _source(value: Any) -> Any:
    """What "New Set from…" copies, as PREP-02's ``SetSource`` names it.

    A selection is its tracks, in the table's order, resolved once by the
    caller (DEC-063): a Set is an order, and a query has none.
    """
    from cuepoint.services.collection_service import (
        SET_SOURCES,
        SOURCE_SELECTION,
        SetSource,
    )

    if not isinstance(value, dict):
        raise bad_request(
            "source must be an object: a collection or playlist by id, or a "
            "selection by track_ids"
        )
    _only(value, SOURCE_FIELDS)
    kind = value.get("kind")
    if kind not in SET_SOURCES:
        raise bad_request(
            f"source.kind must be one of {', '.join(SET_SOURCES)}, not {kind!r}"
        )
    if kind == SOURCE_SELECTION:
        if value.get("id") is not None:
            raise bad_request("A selection names its track_ids, not an id")
        track_ids = value.get("track_ids")
        if not isinstance(track_ids, list) or not track_ids:
            raise bad_request("A selection's track_ids must be a non-empty list")
        return SetSource.selection(_id(item, "track_ids") for item in track_ids)
    if value.get("track_ids") is not None:
        raise bad_request(f"A {kind} source names its id, not track_ids")
    source_id = _required_id(value, "id")
    return SetSource(kind, id=source_id)


def create_from(data: Dict[str, Any]) -> Dict[str, Any]:
    """A Set holding a copy of a Collection, playlist or selection (DEC-104)."""
    _only(data, CREATE_FROM_FIELDS)
    source = _source(data.get("source"))
    made = _resolve("ICollectionService").create_set_from(
        source, _text(data, "name"), _optional_id(data, "parent_id")
    )
    return {
        "set": set_to_dict(made.set),
        "source": {
            "kind": made.source_kind,
            "id": made.source_id,
            "name": made.source_name,
        },
        "track_count": made.track_count,
    }


def duplicate(data: Dict[str, Any]) -> Dict[str, Any]:
    """A copy of a Set, chapters, plan and acknowledgements included."""
    _only(data, DUPLICATE_FIELDS)
    set_id = _required_id(data, "set_id")
    _require_set(set_id)
    copy = _resolve("ICollectionService").duplicate_set(set_id, _text(data, "name"))
    return {"set": set_to_dict(copy)}


def notes(data: Dict[str, Any]) -> Dict[str, Any]:
    """Write a Set's notes; null or blank clears them."""
    _only(data, NOTES_FIELDS)
    set_id = _required_id(data, "set_id")
    _present(data, "notes")
    _require_set(set_id)
    details = _resolve("ISetService").set_notes(set_id, _text(data, "notes"))
    return {"details": details_to_dict(details)}


# ---------------------------------------------------------------------------
# Chapters
# ---------------------------------------------------------------------------


def chapter_create(data: Dict[str, Any]) -> Dict[str, Any]:
    """An empty chapter at a place, after a chapter, or at the end."""
    _only(data, CHAPTER_CREATE_FIELDS)
    set_id = _required_id(data, "set_id")
    position = _position(data, "position", required=False)
    after = _optional_id(data, "after_chapter_id")
    _require_set(set_id)
    if after is not None:
        _require_chapter(after)
    chapter = _resolve("ISetService").create_chapter(
        set_id,
        _text(data, "name") or "",
        position=position,
        after_chapter_id=after,
    )
    return {"chapter": chapter_to_dict(chapter)}


def chapter_update(data: Dict[str, Any]) -> Dict[str, Any]:
    """Change any of a chapter's name, notes and targets, in one write.

    Only the fields sent change; ``null`` clears one. ``target`` is typed, as
    an entry's times are, and a blank one clears it (PREP-03 handed this on).
    """
    from cuepoint.core.set_timing import parse_optional_time

    _only(data, CHAPTER_UPDATE_FIELDS)
    chapter_id = _required_id(data, "chapter_id")
    changes: Dict[str, Any] = {}
    if "name" in data:
        changes["name"] = _text(data, "name") or ""
    if "notes" in data:
        changes["notes"] = _text(data, "notes")
    if "target" in data:
        changes["target_seconds"] = parse_optional_time(_text(data, "target"))
    for name in ("bpm_min", "bpm_max"):
        if name in data:
            changes[name] = _bpm(data, name)
    if not changes:
        raise bad_request(
            "Nothing to change: send any of name, notes, target, bpm_min, bpm_max"
        )
    _require_chapter(chapter_id)
    chapter = _resolve("ISetService").update_chapter(chapter_id, changes)
    return {"chapter": chapter_to_dict(chapter)}


def chapter_move(data: Dict[str, Any]) -> Dict[str, Any]:
    """Move a chapter, its entries travelling with it as one block."""
    _only(data, CHAPTER_MOVE_FIELDS)
    chapter_id = _required_id(data, "chapter_id")
    position = _position(data, "position", required=True)
    assert position is not None  # required
    _require_chapter(chapter_id)
    chapter = _resolve("ISetService").move_chapter(chapter_id, position)
    return {"chapter": chapter_to_dict(chapter)}


def chapter_delete(data: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a chapter; its entries join the neighbour that is answered."""
    _only(data, CHAPTER_DELETE_FIELDS)
    chapter_id = _required_id(data, "chapter_id")
    _require_chapter(chapter_id)
    joined = _resolve("ISetService").delete_chapter(chapter_id)
    return {"deleted_chapter_id": chapter_id, "joined": chapter_to_dict(joined)}


def chapter_split(data: Dict[str, Any]) -> Dict[str, Any]:
    """Start a chapter at an entry: it and the rest of its chapter move."""
    _only(data, CHAPTER_SPLIT_FIELDS)
    entry_id = _required_id(data, "entry_id")
    _require_entry(entry_id)
    chapter = _resolve("ISetService").split_chapter_at(
        entry_id, _text(data, "name") or ""
    )
    return {"chapter": chapter_to_dict(chapter)}


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------


def entry_move(data: Dict[str, Any]) -> Dict[str, Any]:
    """Move one entry, into a chapter that reaches its new place (PREP-02).

    Answered with the entry and the chapter it is now in, which a drop on a
    chapter heading is checked against.
    """
    from cuepoint.engine.organization_api import entry_to_dict

    _only(data, ENTRY_MOVE_FIELDS)
    entry_id = _required_id(data, "entry_id")
    position = _position(data, "position", required=True)
    assert position is not None  # required
    chapter_id = _optional_id(data, "chapter_id")
    _require_entry(entry_id)
    if chapter_id is not None:
        _require_chapter(chapter_id)
    moved = _resolve("ISetService").move_entry(entry_id, position, chapter_id)
    return {
        "entry": entry_to_dict(moved),
        "chapter_id": _require_entry(entry_id).plan.chapter_id,
    }


def entry_times(data: Dict[str, Any]) -> Dict[str, Any]:
    """Plan an entry's in and out times, typed, both written together."""
    _only(data, ENTRY_TIMES_FIELDS)
    entry_id = _required_id(data, "entry_id")
    _present(data, "in_time")
    _present(data, "out_time")
    in_time = _text(data, "in_time")
    out_time = _text(data, "out_time")
    _require_entry(entry_id)
    planned = _resolve("ISetService").set_entry_times(entry_id, in_time, out_time)
    return {"plan": entry_plan_to_dict(planned)}


def entry_note(data: Dict[str, Any]) -> Dict[str, Any]:
    """Write an entry's note; null or blank clears it."""
    _only(data, ENTRY_NOTE_FIELDS)
    entry_id = _required_id(data, "entry_id")
    _present(data, "note")
    note = _text(data, "note")
    _require_entry(entry_id)
    planned = _resolve("ISetService").set_entry_note(entry_id, note)
    return {"plan": entry_plan_to_dict(planned)}


# ---------------------------------------------------------------------------
# Warnings
# ---------------------------------------------------------------------------


def _transition(data: Dict[str, Any]) -> Tuple[int, int, str]:
    _only(data, ACKNOWLEDGE_FIELDS)
    from_entry = _required_id(data, "from_entry_id")
    to_entry = _required_id(data, "to_entry_id")
    warning = _text(data, "warning")
    if not warning:
        raise bad_request("warning is required")
    _require_entry(from_entry)
    _require_entry(to_entry)
    return from_entry, to_entry, warning


def acknowledge(data: Dict[str, Any]) -> Dict[str, Any]:
    """Accept a transition warning that is there now (DEC-106)."""
    from_entry, to_entry, warning = _transition(data)
    made = _resolve("ISetAnalysisService").acknowledge(from_entry, to_entry, warning)
    return {"acknowledgement": acknowledgement_to_dict(made)}


def unacknowledge(data: Dict[str, Any]) -> Dict[str, Any]:
    """Withdraw an acknowledgement; ``removed`` says whether there was one."""
    from_entry, to_entry, warning = _transition(data)
    removed = _resolve("ISetAnalysisService").unacknowledge(
        from_entry, to_entry, warning
    )
    return {"removed": bool(removed)}


# ---------------------------------------------------------------------------
# Set lists
# ---------------------------------------------------------------------------


def set_list_save(data: Dict[str, Any]) -> Dict[str, Any]:
    """Write a set list where the save dialog chose (DEC-110).

    The destination is the service's to judge, before anything is read. A
    file system that will not write it is answered as a refusal with the
    path: nothing is left behind, and another place is the next step.
    """
    _only(data, SET_LIST_SAVE_FIELDS)
    set_id = _required_id(data, "set_id")
    destination = _text(data, "destination_path") or ""
    _require_set(set_id)
    try:
        saved = _resolve("ISetListService").save(set_id, destination)
    except OSError as exc:
        path = os.path.abspath(destination.strip())
        raise ApiError(
            500,
            SET_LIST_WRITE_FAILED,
            f"The set list could not be written to {str(path)!r}: {exc.strerror or exc}",
            path=path,
        ) from exc
    return {"saved": saved.to_dict()}


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    PLAN_PATH: plan,
    ENTRIES_PATH: entries,
    ANALYSIS_PATH: analysis,
    SUGGESTIONS_PATH: suggestions,
    SET_LIST_TEXT_PATH: set_list_text,
}

_POST_ROUTES: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    CREATE_PATH: create,
    CREATE_FROM_PATH: create_from,
    DUPLICATE_PATH: duplicate,
    NOTES_PATH: notes,
    CHAPTER_CREATE_PATH: chapter_create,
    CHAPTER_UPDATE_PATH: chapter_update,
    CHAPTER_MOVE_PATH: chapter_move,
    CHAPTER_DELETE_PATH: chapter_delete,
    CHAPTER_SPLIT_PATH: chapter_split,
    ENTRY_MOVE_PATH: entry_move,
    ENTRY_TIMES_PATH: entry_times,
    ENTRY_NOTE_PATH: entry_note,
    ACKNOWLEDGE_PATH: acknowledge,
    UNACKNOWLEDGE_PATH: unacknowledge,
    SET_LIST_SAVE_PATH: set_list_save,
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


def handle_post(
    path: str, raw: bytes, *, job_store: Any = None
) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise. No Set route starts a job."""
    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(_body(raw))


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope.

    The typed refusals come first: each is also a ``ValueError`` or a
    ``ValidationError``, and the point of the reason is that it is not
    flattened into a generic 400.
    """
    from cuepoint.exceptions.cuepoint_exceptions import ValidationError
    from cuepoint.services.set_list_service import SetListDestinationError
    from cuepoint.services.set_suggestion_service import (
        NO_NEIGHBOUR,
        InsertionPointError,
    )

    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, InsertionPointError):
        status = 400 if exc.reason == NO_NEIGHBOUR else 409
        return status, error_payload(
            INSERTION_POINT_REFUSED, str(exc), reason=exc.reason
        )
    if isinstance(exc, SetListDestinationError):
        return 400, error_payload(
            SET_LIST_DESTINATION_REFUSED, exc.message, reason=exc.reason, path=exc.path
        )
    if isinstance(exc, (FilterRuleError, ValueError)):
        return 400, error_payload(INVALID_REQUEST, str(exc))
    if isinstance(exc, ValidationError):
        return 400, error_payload(INVALID_REQUEST, exc.message)
    if isinstance(exc, SetsUnavailableError):
        return 503, error_payload("LIBRARY_UNAVAILABLE", str(exc))
    _logger.warning("[sets] request failed: %s", exc, exc_info=exc)
    return 500, error_payload("SETS_FAILED", str(exc))


__all__: Sequence[str] = (
    "GET_PATHS",
    "INSERTION_POINT_REFUSED",
    "INVALID_REQUEST",
    "NOT_FOUND_REASONS",
    "POST_PATHS",
    "PREFIX",
    "REFUSAL_CODES",
    "SET_LIST_DESTINATION_REFUSED",
    "SET_LIST_WRITE_FAILED",
    "SET_NOT_FOUND",
    "SetsUnavailableError",
    "acknowledgement_to_dict",
    "chapter_to_dict",
    "details_to_dict",
    "entry_plan_to_dict",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "set_to_dict",
    "status_for",
)
