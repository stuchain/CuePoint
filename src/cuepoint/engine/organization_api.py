#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CuePoint's own organization over the wire (ORG-08).

Everything ORG-02 through ORG-07 built, exposed to the renderer: the Collection
tree, the tag vocabulary, one track's metadata and history, and the batch edit.
A module beside :mod:`cuepoint.engine.library_api` rather than inside it,
because twenty more routes in a file that already answers seven is a file
nobody reads to the end.

Every handler validates and delegates
-------------------------------------
No rule about what a Collection may hold, what a rating may be or which tags
exist lives here. Those are ORG-02 through ORG-07's, and a copy in an HTTP
handler is a second place for them to disagree. What lives here is the wire: a
body parsed into arguments, a refusal turned into a status, and an explicit
field list on the way out.

**Refusals are 400, not 500 and not 404.** A service raises ``ValueError`` for
"that rating is not a rating" and for "there is no Collection 7", and telling
them apart from the outside would mean matching on message text — which is a
worse contract than one honest status. So an action whose *body* names
something that is not there is a request that cannot be honoured as written,
with the service's own message naming it. A resource named in the *path* is
different: ``/library/tracks/999/history`` is a 404, because the path is the
thing that was wrong.

**Field lists are explicit**, like ``track_to_dict``'s. A column added to a
table must never become part of a public shape by accident.

The dispatch table at the bottom is what ``server.py`` reaches: two functions,
one for reads and one for writes, each answering ``(status, payload)``. The
alternative — twenty more branches in the server's request handler — puts the
routing of one feature in two files and the shape of it in neither.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.engine.api_errors import (
    ApiError,
    bad_request,
    error_payload,
    not_found,
)
from cuepoint.models.filter_rule import FilterRuleError, RuleSet
from cuepoint.models.track_metadata import (
    TrackMetadata,
    effective_rating,
    rating_source,
)
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError

#: Newest first, and a page rather than a life story: the History tab shows
#: what changed recently, and a track edited a thousand times has a thousand
#: rows nobody scrolls to the end of.
HISTORY_LIMIT_DEFAULT = 100
HISTORY_LIMIT_MAX = 500

#: ``/api/v1/library/tracks/{id}/history`` and ``…/metadata``. Anchored, so a
#: path that merely starts like one is not treated as one.
_HISTORY_ROUTE = re.compile(r"^/api/v1/library/tracks/([^/]+)/history$")
_METADATA_ROUTE = re.compile(r"^/api/v1/library/tracks/([^/]+)/metadata$")


class OrganizationUnavailableError(RuntimeError):
    """The organization services could not be resolved.

    Raised rather than answering with an empty tree, because "no Collections"
    and "the database is unreachable" are different situations with different
    answers — the same distinction :class:`LibraryUnavailableError` draws.
    """


def _resolve(interface: Any) -> Any:
    """Resolve one service from the DI container.

    Per call, not at import: this module is imported while the engine server is
    being built, which happens before ``bootstrap_services()`` runs.
    """
    try:
        from cuepoint.utils.di_container import get_container

        return get_container().resolve(interface)
    except Exception as exc:  # noqa: BLE001 — surfaced as a 503 to the caller
        raise OrganizationUnavailableError(str(exc)) from exc


def resolve_collection_service() -> Any:
    """Resolve ``ICollectionService``."""
    from cuepoint.services.interfaces import ICollectionService

    return _resolve(ICollectionService)


def resolve_tag_service() -> Any:
    """Resolve ``ITagService``."""
    from cuepoint.services.interfaces import ITagService

    return _resolve(ITagService)


def resolve_metadata_service() -> Any:
    """Resolve ``IMetadataService``."""
    from cuepoint.services.interfaces import IMetadataService

    return _resolve(IMetadataService)


def resolve_activity_service() -> Any:
    """Resolve ``IActivityService``."""
    from cuepoint.services.interfaces import IActivityService

    return _resolve(IActivityService)


def resolve_batch_service() -> Any:
    """Resolve ``IBatchService``."""
    from cuepoint.services.interfaces import IBatchService

    return _resolve(IBatchService)


def resolve_collection_repository() -> Any:
    """Resolve ``ICollectionRepository``.

    For the one read no service offers: which Collections hold a track. The
    Inspector asks it the way it asks which playlists do, and that one goes
    through ``IPlaylistRepository`` for the same reason.
    """
    from cuepoint.services.interfaces import ICollectionRepository

    return _resolve(ICollectionRepository)


# ---------------------------------------------------------------------------
# Serializers — explicit field lists, like ``track_to_dict``'s
# ---------------------------------------------------------------------------


def _decoded_rules(rules_json: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return a saved rule set as an object, or ``None``.

    Unparseable rules come back as ``None`` rather than as an error: the node
    still exists and the tree still has to draw it, and ``problem`` beside this
    is what says why it cannot be run (ORG-06).
    """
    if not rules_json:
        return None
    try:
        parsed = json.loads(rules_json)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def collection_to_dict(
    node: Any,
    counts: Tuple[int, int] = (0, 0),
    problem: Optional[str] = None,
) -> Dict[str, Any]:
    """Serialize one node of CuePoint's tree.

    ``entry_count`` and ``track_count`` are both here because DEC-058 lets them
    differ, and a label reading "412 tracks" that means 412 entries is a small
    lie that costs trust.

    ``problem`` is a Smart Collection whose saved rules cannot be run right now
    — a tag or a Collection they name has been deleted. The node is still
    drawn, still renamable and still openable; ORG-09 shows the reason rather
    than hiding the row, because showing the rule that broke is more useful.
    """
    entries, tracks = counts
    return {
        "id": node.id,
        "parent_id": node.parent_id,
        "kind": node.kind,
        "name": node.name,
        "position": node.position,
        "depth": node.depth,
        "rules": _decoded_rules(node.rules_json),
        "sort": node.sort_field,
        "dir": node.sort_dir,
        "frozen_from_id": node.frozen_from_id,
        "frozen_at": node.frozen_at,
        "entry_count": entries,
        "track_count": tracks,
        "broken": problem is not None,
        "problem": problem,
        "created_at": node.created_at,
        "updated_at": node.updated_at,
    }


def entry_to_dict(entry: Any) -> Dict[str, Any]:
    """Serialize one track's place in one Collection (DEC-058).

    The entry id is the field that matters: everything that removes or moves
    membership addresses it, because a track filed twice has two of them.
    """
    return {
        "id": entry.id,
        "collection_id": entry.collection_id,
        "track_id": entry.track_id,
        "position": entry.position,
        "added_at": entry.added_at,
    }


def subtree_to_dict(summary: Any) -> Dict[str, Any]:
    """Serialize what a delete would take, or did (ORG-09's confirmation)."""
    return {
        "folders": summary.folders,
        "collections": summary.collections,
        "smart_collections": summary.smart_collections,
        "entries": summary.entries,
        "nodes": summary.nodes,
    }


def tag_to_dict(usage: Any) -> Dict[str, Any]:
    """Serialize one tag and how many tracks carry it."""
    tag = usage.tag
    return {
        "id": tag.id,
        "name": tag.name,
        "category": tag.category,
        "colour": tag.colour,
        "track_count": usage.track_count,
        "created_at": tag.created_at,
    }


def metadata_to_dict(
    track_id: int, rekordbox_rating: Optional[int], record: Optional[TrackMetadata]
) -> Dict[str, Any]:
    """Serialize CuePoint's layer for one track, notes included.

    The Inspector's half of DEC-057: both ratings, which one is showing, the
    favorite and the note. The row shape in ``track_to_dict`` deliberately
    carries three of these and not the note — this is the one place that reads
    a single track and can afford it.
    """
    cuepoint = record.rating if record is not None else None
    return {
        "track_id": int(track_id),
        "rating": cuepoint,
        "rekordbox_rating": rekordbox_rating,
        "effective_rating": effective_rating(rekordbox_rating, cuepoint),
        "rating_source": rating_source(rekordbox_rating, cuepoint),
        "favorite": bool(record.favorite) if record is not None else False,
        "notes": record.notes if record is not None else None,
        "created_at": record.created_at if record is not None else None,
        "updated_at": record.updated_at if record is not None else None,
    }


def change_to_dict(change: Any) -> Dict[str, Any]:
    """Serialize one row of a track's field history (DEC-008).

    ``batch_id`` is carried because it is what makes one edit of forty
    thousand tracks legible as one thing later (DEC-063) — the id is written
    whether or not anything reads it yet.
    """
    return {
        "id": change.id,
        "track_id": change.track_id,
        "field": change.field_name,
        "old_value": change.old_value,
        "new_value": change.new_value,
        "source": change.source,
        "changed_at": change.changed_at,
        "batch_id": change.batch_id,
    }


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def collection_tree() -> Dict[str, Any]:
    """Return the whole tree: folders, Collections and Smart Collections.

    The whole thing in one response, like the playlist tree beside it: a few
    hundred nodes is small, and a lazily loaded tree would be complexity bought
    for nothing.

    Counts come from one query for every node rather than two per node, and a
    Smart Collection is resolved so the tree can draw a broken one as broken —
    which costs one reference check each and nothing at all for the rest.
    """
    service = resolve_collection_service()
    nodes = service.tree()
    counts = service.all_counts()

    payload: List[Dict[str, Any]] = []
    for node in nodes:
        problem = None
        if node.kind == "smart":
            problem = service.resolve(node.id).problem
        payload.append(
            collection_to_dict(node, counts.get(int(node.id or 0), (0, 0)), problem)
        )
    return {"collections": payload, "total": len(payload)}


def collection_entries(
    collection_id: int, limit: Optional[int] = None, offset: int = 0
) -> Dict[str, Any]:
    """Return one window of a Collection's membership, in its own order.

    By entry rather than by track, because that is what a removal addresses
    (DEC-058). The *tracks* of a Collection are read through the browse
    endpoint with ``scope=collection``, which is the one query path the table
    uses for everything else.
    """
    service = resolve_collection_service()
    entries, tracks = service.counts(collection_id)
    rows = service.entries(collection_id, offset=max(0, int(offset)), limit=limit)
    return {
        "collection_id": int(collection_id),
        "entries": [entry_to_dict(row) for row in rows],
        "entry_count": entries,
        "track_count": tracks,
        "offset": max(0, int(offset)),
    }


def tag_vocabulary() -> Dict[str, Any]:
    """Return every tag with its usage count, and the categories in use."""
    service = resolve_tag_service()
    return {
        "tags": [tag_to_dict(usage) for usage in service.list_all()],
        "categories": list(service.categories_in_use()),
    }


def tags_on(track_id: int) -> List[Dict[str, Any]]:
    """Return the tags on one track, for the Inspector."""
    service = resolve_tag_service()
    return [
        {"id": tag.id, "name": tag.name, "category": tag.category, "colour": tag.colour}
        for tag in service.tags_for_track(int(track_id))
    ]


def collections_holding(track_id: int) -> List[Dict[str, Any]]:
    """Return the Collections one track is filed in (DEC-047).

    The answer to "where is this?", which is the question the Inspector's
    playlist list already answers for Rekordbox's side.
    """
    repository = resolve_collection_repository()
    service = resolve_collection_service()
    found = []
    for collection_id in repository.collection_ids_for_track(int(track_id)):
        node = service.get(collection_id)
        if node is not None:
            found.append({"id": node.id, "name": node.name, "kind": node.kind})
    return found


def track_history(track_id: int, limit: Optional[int] = None) -> Dict[str, Any]:
    """Return one track's field history, newest first (DEC-008).

    Raises:
        ApiError: 404 when there is no such track. A history for a track that
            is not there is not a question with an empty answer.
    """
    library = _resolve_library_service()
    if library.get_track(int(track_id)) is None:
        raise not_found("TRACK_NOT_FOUND", f"No track with id {track_id}")

    safe = (
        HISTORY_LIMIT_DEFAULT
        if limit is None
        else max(1, min(int(limit), HISTORY_LIMIT_MAX))
    )
    changes = resolve_activity_service().track_history(int(track_id), limit=safe)
    return {
        "track_id": int(track_id),
        "changes": [change_to_dict(change) for change in changes],
        "limit": safe,
    }


def _resolve_library_service() -> Any:
    """Resolve ``ILibraryService`` — the one read that says a track exists."""
    from cuepoint.services.interfaces import ILibraryService

    return _resolve(ILibraryService)


# ---------------------------------------------------------------------------
# Bodies
# ---------------------------------------------------------------------------


def parse_body(raw: bytes) -> Dict[str, Any]:
    """Return a request body as an object.

    Raises:
        ApiError: 400 if it is missing, is not JSON, or is not an object.
    """
    if not raw:
        raise bad_request("A JSON body is required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise bad_request("Invalid JSON body") from None
    if not isinstance(data, dict):
        raise bad_request("JSON body must be an object")
    return data


def _require_int(data: Dict[str, Any], key: str) -> int:
    """Return a required integer field.

    Raises:
        ApiError: 400 if it is missing or is not a number. ``True`` is refused
            with it: a bool is an int in Python, and "collection true" is not
            an id.
    """
    value = data.get(key)
    if isinstance(value, bool) or value is None:
        raise bad_request(f"{key} is required and must be a number")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise bad_request(f"{key} must be a number, not {value!r}") from None


def _optional_int(data: Dict[str, Any], key: str) -> Optional[int]:
    """Return an optional integer field, or ``None`` when absent or null."""
    if data.get(key) is None:
        return None
    return _require_int(data, key)


def _require_str(data: Dict[str, Any], key: str) -> str:
    """Return a required non-empty string field."""
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise bad_request(f"{key} is required and must be a non-empty string")
    return value


def _optional_str(data: Dict[str, Any], key: str) -> Optional[str]:
    """Return an optional string field, or ``None`` when absent or null."""
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise bad_request(f"{key} must be a string, not {value!r}")
    return value


def _require_ids(data: Dict[str, Any], key: str) -> List[int]:
    """Return a required list of ids.

    Raises:
        ApiError: 400 if it is missing, is not a list, or holds anything that
            is not a number.
    """
    value = data.get(key)
    if not isinstance(value, list) or not value:
        raise bad_request(f"{key} must be a non-empty list of ids")
    found: List[int] = []
    for item in value:
        if isinstance(item, bool):
            raise bad_request(f"{key} must hold numbers, not {item!r}")
        try:
            found.append(int(item))
        except (TypeError, ValueError):
            raise bad_request(f"{key} must hold numbers, not {item!r}") from None
    return found


def _rule_set(value: Any, key: str = "rules") -> RuleSet:
    """Return a rule set from a request body.

    Raises:
        ApiError: 400 if it is not an object.
        FilterRuleError: If it is an object that is not a rule set. It names
            the clause, which is the message a user needs.
    """
    if not isinstance(value, dict):
        raise bad_request(f"{key} must be a rule set object")
    return RuleSet.from_dict(value)


# ---------------------------------------------------------------------------
# The tree
# ---------------------------------------------------------------------------

#: What ``create`` may be asked for. A Smart Collection is not among them: it is
#: made by saving rules, which is a different request with a different body.
CREATABLE_KINDS = ("folder", "collection")


def create_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a folder or a Collection."""
    service = resolve_collection_service()
    kind = _require_str(data, "kind").strip().lower()
    if kind not in CREATABLE_KINDS:
        allowed = " or ".join(repr(value) for value in CREATABLE_KINDS)
        raise bad_request(
            f"kind may only be {allowed}, not {kind!r}; a smart collection is "
            "created by saving its rules"
        )
    name = _require_str(data, "name")
    parent_id = _optional_int(data, "parent_id")
    node = (
        service.create_folder(name, parent_id)
        if kind == "folder"
        else service.create_collection(name, parent_id)
    )
    return {"collection": collection_to_dict(node)}


def rename_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Rename a node."""
    service = resolve_collection_service()
    node = service.rename(_require_int(data, "id"), _require_str(data, "name"))
    return {"collection": collection_to_dict(node)}


def move_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Reparent a node, or move it among its siblings, or both."""
    service = resolve_collection_service()
    node = service.move(
        _require_int(data, "id"),
        _optional_int(data, "parent_id"),
        _optional_int(data, "position"),
    )
    return {"collection": collection_to_dict(node)}


def delete_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a node and everything under it, echoing what went."""
    service = resolve_collection_service()
    summary = service.delete(_require_int(data, "id"))
    return {"removed": subtree_to_dict(summary)}


def preview_delete_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Answer what a delete would take, before it takes it (ORG-09)."""
    service = resolve_collection_service()
    summary = service.delete_preview(_require_int(data, "id"))
    return {"removes": subtree_to_dict(summary)}


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------


def add_tracks(data: Dict[str, Any]) -> Dict[str, Any]:
    """Append tracks to a Collection, reporting what was already there."""
    service = resolve_collection_service()
    result = service.add_tracks(
        _require_int(data, "collection_id"), _require_ids(data, "track_ids")
    )
    return {
        "added": result.added,
        "skipped": result.skipped,
        "added_track_ids": list(result.added_track_ids),
        "skipped_track_ids": list(result.skipped_track_ids),
    }


def insert_track(data: Dict[str, Any]) -> Dict[str, Any]:
    """Put one track at a position, duplicate or not (DEC-058)."""
    service = resolve_collection_service()
    entry = service.insert_track(
        _require_int(data, "collection_id"),
        _require_int(data, "track_id"),
        _require_int(data, "position"),
    )
    return {"entry": entry_to_dict(entry)}


def remove_entries(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove entries by their own ids."""
    service = resolve_collection_service()
    removed = service.remove_entries(_require_ids(data, "entry_ids"))
    return {"removed": removed}


def reorder_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    """Move one entry within its Collection."""
    service = resolve_collection_service()
    entry = service.reorder_entry(
        _require_int(data, "entry_id"), _require_int(data, "position")
    )
    return {"entry": entry_to_dict(entry)}


# ---------------------------------------------------------------------------
# Smart Collections (DEC-061)
# ---------------------------------------------------------------------------


def save_smart_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Save a filter as a Smart Collection (ORG-12's button)."""
    service = resolve_collection_service()
    node = service.create_smart(
        _require_str(data, "name"),
        _rule_set(data.get("rules")),
        parent_id=_optional_int(data, "parent_id"),
        sort=_optional_str(data, "sort"),
        direction=_optional_str(data, "dir"),
    )
    return {"collection": collection_to_dict(node)}


def update_smart_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Replace a Smart Collection's rules."""
    service = resolve_collection_service()
    node = service.update_rules(
        _require_int(data, "id"),
        _rule_set(data.get("rules")),
        sort=_optional_str(data, "sort"),
        direction=_optional_str(data, "dir"),
    )
    return {"collection": collection_to_dict(node)}


def duplicate_smart_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Copy a Smart Collection, rules and all."""
    service = resolve_collection_service()
    node = service.duplicate(_require_int(data, "id"), _optional_str(data, "name"))
    return {"collection": collection_to_dict(node)}


def freeze_smart_collection(data: Dict[str, Any]) -> Dict[str, Any]:
    """Store today's answer as a plain Collection (DEC-061)."""
    service = resolve_collection_service()
    result = service.freeze(_require_int(data, "id"), _optional_str(data, "name"))
    return {
        "collection": collection_to_dict(
            result.collection, (result.track_count, result.track_count)
        ),
        "source_id": result.source_id,
        "source_name": result.source_name,
        "track_count": result.track_count,
    }


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def create_tag(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a tag, or return the one that already has this name (ORG-03)."""
    service = resolve_tag_service()
    tag = service.create_or_get(
        _require_str(data, "name"),
        category=_optional_str(data, "category"),
        colour=_optional_str(data, "colour"),
    )
    return {"tag": _plain_tag(tag)}


def update_tag(data: Dict[str, Any]) -> Dict[str, Any]:
    """Rename, recolour or categorize a tag.

    One route for the three because they are one gesture in the manager, and
    each is applied only when the field is present — ``category: null`` clears
    a category, while leaving it out says nothing about it.
    """
    service = resolve_tag_service()
    tag_id = _require_int(data, "id")
    tag = None
    if "name" in data:
        tag = service.rename(tag_id, _require_str(data, "name"))
    if "category" in data:
        tag = service.set_category(tag_id, _optional_str(data, "category"))
    if "colour" in data:
        tag = service.set_colour(tag_id, _optional_str(data, "colour"))
    if tag is None:
        raise bad_request("Nothing to update: send a name, a category or a colour")
    return {"tag": _plain_tag(tag)}


def delete_tag(data: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a tag, reporting how many tracks lost it."""
    service = resolve_tag_service()
    return {"untagged": service.delete(_require_int(data, "id"))}


def merge_tags(data: Dict[str, Any]) -> Dict[str, Any]:
    """Merge one tag into another, reporting how many tracks moved."""
    service = resolve_tag_service()
    moved = service.merge(
        _require_int(data, "source_id"), _require_int(data, "target_id")
    )
    return {"moved": moved}


def assign_tag(data: Dict[str, Any]) -> Dict[str, Any]:
    """Put a tag on tracks, reporting the ones that changed."""
    service = resolve_tag_service()
    changed = service.assign(
        _require_ids(data, "track_ids"), _require_int(data, "tag_id")
    )
    return {"changed": len(changed), "track_ids": list(changed)}


def unassign_tag(data: Dict[str, Any]) -> Dict[str, Any]:
    """Take a tag off tracks, reporting the ones that changed."""
    service = resolve_tag_service()
    changed = service.unassign(
        _require_ids(data, "track_ids"), _require_int(data, "tag_id")
    )
    return {"changed": len(changed), "track_ids": list(changed)}


def _plain_tag(tag: Any) -> Dict[str, Any]:
    """Serialize a tag with no usage count, for a write that just made one."""
    return {
        "id": tag.id,
        "name": tag.name,
        "category": tag.category,
        "colour": tag.colour,
        "created_at": tag.created_at,
    }


# ---------------------------------------------------------------------------
# One track's metadata (DEC-057)
# ---------------------------------------------------------------------------


def set_track_metadata(track_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Set any of a track's rating, favorite and note.

    Only the fields that are present. ``rating: null`` clears the override and
    lets Rekordbox's show through; leaving ``rating`` out says nothing about
    it. The two are different requests and DEC-057 needs both.

    Raises:
        ApiError: 404 when there is no such track — the id is in the path.
    """
    library = _resolve_library_service()
    track = library.get_track(int(track_id))
    if track is None:
        raise not_found("TRACK_NOT_FOUND", f"No track with id {track_id}")

    service = resolve_metadata_service()
    touched = False
    if "rating" in data:
        service.set_rating(int(track_id), data.get("rating"))
        touched = True
    if "favorite" in data:
        favorite = data.get("favorite")
        if not isinstance(favorite, bool):
            raise bad_request(f"favorite must be true or false, not {favorite!r}")
        service.set_favorite(int(track_id), favorite)
        touched = True
    if "notes" in data:
        service.set_notes(int(track_id), _optional_str(data, "notes"))
        touched = True
    if not touched:
        raise bad_request("Nothing to set: send a rating, a favorite or notes")

    record = service.get(int(track_id))
    return {"metadata": metadata_to_dict(int(track_id), track.rating, record)}


# ---------------------------------------------------------------------------
# The batch edit (ORG-07, DEC-063)
# ---------------------------------------------------------------------------


def _selection(data: Dict[str, Any]) -> Any:
    """Build the batch's target from a request body (DEC-045).

    Either explicit ids or the query that names them — never both, and the
    shape refuses that itself. A query selection is the view the user is
    looking at, minus its ordering: a batch is a set, and which end of it was
    at the top changes nothing about what it applies to.

    A query selection may also carry ``exclude_track_ids`` (ORG-11): "everything
    matching, except these" is what select-all-then-deselect means, and the
    count the user is reading already says so. The list is bounded by what a
    person can click, so DEC-045's rule that a 47,913-track selection never
    crosses as 47,913 numbers is untouched.
    """
    from cuepoint.engine.library_api import resolve_scope
    from cuepoint.services.batch_service import BatchSelection

    selection = data.get("selection")
    if not isinstance(selection, dict):
        raise bad_request("selection must be an object with track_ids or a query")

    if "track_ids" in selection:
        return BatchSelection.of_ids(_require_ids(selection, "track_ids"))

    query = selection.get("query")
    if not isinstance(query, dict):
        raise bad_request("selection needs either track_ids or a query")

    scope = resolve_scope(
        _optional_str(query, "scope"), _optional_int(query, "collection_id")
    )
    sent = _rule_set(query["filters"], "filters") if "filters" in query else RuleSet()
    rules = (
        RuleSet(rules=tuple(scope.rules.rules) + tuple(sent.rules))
        if scope.rules.rules
        else sent
    )
    excluded = (
        _require_ids(selection, "exclude_track_ids")
        if selection.get("exclude_track_ids")
        else ()
    )
    return BatchSelection.matching(
        BrowseQuery(
            query=_optional_str(query, "q") or "",
            playlist_id=_optional_int(query, "playlist_id"),
            collection_id=scope.collection_id,
            rules=rules,
        ),
        exclude=excluded,
    )


def _operation(data: Dict[str, Any]) -> Any:
    """Build the batch's verb from a request body."""
    from cuepoint.services.batch_service import BatchOperation

    operation = data.get("operation")
    if not isinstance(operation, dict):
        raise bad_request("operation must be an object with a kind and a value")
    kind = _require_str(operation, "kind")
    return BatchOperation(kind, operation.get("value"))


def apply_batch(data: Dict[str, Any], *, job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Apply an operation to a selection, inline or as a job (DEC-063).

    Returns 200 with the counts when the selection is small enough to apply on
    this thread, and 202 with a job identity when it is not — the same two
    answers the import gives, and the same job endpoints follow it.

    Raises:
        ApiError: 409 if a library job is already running.
    """
    from cuepoint.engine.batch_jobs import apply_or_start
    from cuepoint.engine.jobs import JobTypeBusyError

    selection = _selection(data)
    operation = _operation(data)
    try:
        result, job = apply_or_start(job_store, selection, operation)
    except JobTypeBusyError as exc:
        raise ApiError(
            409,
            "LIBRARY_BUSY",
            str(exc),
            job_id=exc.job_id,
        ) from exc

    if job is not None:
        return 202, {"job_id": job.id, "id": job.id, "state": job.state.value}
    assert result is not None  # apply_or_start returns exactly one of the two
    return 200, {"applied": result.to_dict()}


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

#: Reads. Each takes the parsed query string and answers a payload.
_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    "/api/v1/collections": lambda params: collection_tree(),
    "/api/v1/collections/entries": lambda params: collection_entries(
        _query_int(params, "collection_id", required=True) or 0,
        limit=_query_int(params, "limit"),
        offset=_query_int(params, "offset") or 0,
    ),
    "/api/v1/tags": lambda params: tag_vocabulary(),
}

#: Writes. Each takes the parsed body and answers a payload; the two that need
#: the job store are handled beside the table, because passing it to twenty
#: handlers that do not want it would be worse than one branch.
_POST_ROUTES: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "/api/v1/collections/create": create_collection,
    "/api/v1/collections/rename": rename_collection,
    "/api/v1/collections/move": move_collection,
    "/api/v1/collections/delete": delete_collection,
    "/api/v1/collections/delete/preview": preview_delete_collection,
    "/api/v1/collections/tracks/add": add_tracks,
    "/api/v1/collections/tracks/insert": insert_track,
    "/api/v1/collections/tracks/remove": remove_entries,
    "/api/v1/collections/tracks/reorder": reorder_entry,
    "/api/v1/collections/smart/save": save_smart_collection,
    "/api/v1/collections/smart/update": update_smart_collection,
    "/api/v1/collections/smart/duplicate": duplicate_smart_collection,
    "/api/v1/collections/smart/freeze": freeze_smart_collection,
    "/api/v1/tags/create": create_tag,
    "/api/v1/tags/update": update_tag,
    "/api/v1/tags/delete": delete_tag,
    "/api/v1/tags/merge": merge_tags,
    "/api/v1/tags/assign": assign_tag,
    "/api/v1/tags/unassign": unassign_tag,
}

#: Every path this module answers, for the server to route on without knowing
#: any of them by name.
GET_PATHS: Tuple[str, ...] = tuple(_GET_ROUTES)
POST_PATHS: Tuple[str, ...] = tuple(_POST_ROUTES) + ("/api/v1/library/batch",)


def _query_int(
    params: Dict[str, List[str]], name: str, *, required: bool = False
) -> Optional[int]:
    """Read an integer from a parsed query string."""
    values = params.get(name) or []
    raw = values[0] if values else None
    if raw is None or raw.strip() == "":
        if required:
            raise bad_request(f"{name} is required")
        return None
    try:
        return int(raw)
    except ValueError:
        raise bad_request(f"{name} must be a number, not {raw!r}") from None


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in _GET_ROUTES or _HISTORY_ROUTE.match(path) is not None


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return (
        path in _POST_ROUTES
        or path == "/api/v1/library/batch"
        or _METADATA_ROUTE.match(path) is not None
    )


def handle_get(path: str, params: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise.

    Returns:
        ``(status, payload)``.
    """
    match = _HISTORY_ROUTE.match(path)
    if match:
        return 200, track_history(
            _path_int(match.group(1), "track id"), _query_int(params, "limit")
        )
    handler = _GET_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(params)


def handle_post(path: str, raw: bytes, *, job_store: Any) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise.

    Returns:
        ``(status, payload)``.
    """
    if path == "/api/v1/library/batch":
        return apply_batch(parse_body(raw), job_store=job_store)

    match = _METADATA_ROUTE.match(path)
    if match:
        return 200, set_track_metadata(
            _path_int(match.group(1), "track id"), parse_body(raw)
        )

    handler = _POST_ROUTES.get(path)
    if handler is None:
        raise not_found("NOT_FOUND", "Unknown path")
    return 200, handler(parse_body(raw))


def _path_int(raw: str, what: str) -> int:
    """Parse an id out of a path.

    Raises:
        ApiError: 400 rather than 500 when it is absurd. The path was wrong,
            which is something the caller can fix.
    """
    try:
        return int(raw)
    except ValueError:
        raise bad_request(f"{what} must be a number, not {raw!r}") from None


def status_for(exc: BaseException) -> Tuple[int, Dict[str, Any]]:
    """Map an exception from any handler here to a status and an envelope.

    One place rather than five ``except`` clauses per route. The mapping is the
    module's contract, stated once:

    * :class:`ApiError` carries its own status — a 404 for a path, a 409 for a
      busy library.
    * A rule that cannot be honoured, a query that cannot be built and any
      refusal from a service are **400** with the message the service wrote.
      ``ValueError`` covers all three, and a service says "no such tag: 7" with
      it as readily as "that rating is not a rating".
    * A service that cannot be resolved is **503**: the database is
      unreachable, which is not the caller's fault and not their fix.
    * Anything else is **500**, unchanged and unclassified, because pretending
      to recognize it is how a bug becomes a confusing message.
    """
    if isinstance(exc, ApiError):
        return exc.status, exc.payload()
    if isinstance(exc, (FilterRuleError, BrowseQueryError, ValueError)):
        return 400, error_payload("INVALID_REQUEST", str(exc))
    if isinstance(exc, OrganizationUnavailableError):
        return 503, error_payload("LIBRARY_UNAVAILABLE", str(exc))
    return 500, error_payload("ORGANIZATION_FAILED", str(exc))


__all__: Sequence[str] = (
    "GET_PATHS",
    "POST_PATHS",
    "OrganizationUnavailableError",
    "collection_to_dict",
    "collections_holding",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
    "metadata_to_dict",
    "resolve_metadata_service",
    "status_for",
    "tags_on",
)
