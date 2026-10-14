#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Saved artist and label lists over the wire (Discover's New dig).

A dig looks for music by every artist and label in the library, by a saved list
of them, or by none. This is how the renderer keeps those lists. They live under
``/api/v1/discover/lists`` and answer in Discover's own shapes and refusals
(``discover_api.status_for`` maps them), so the client reads one family.

The routes
----------
- ``GET lists`` — every list, with its members, by name; ``kind=artist`` or
  ``kind=label`` narrows it. ``GET lists/{id}`` — one.
- ``POST lists/create`` — ``{kind, name, members}``.
- ``POST lists/{id}/update`` — ``{name?, members?}``; what is not sent is kept.
- ``POST lists/{id}/delete`` — ``{}``.

A list is ``{id, kind, name, members, created_at, updated_at}``. Its members
are the names the Library's facets send, which is what a dig's request takes, so
a dig started from a list sends the same request it would have sent from a
hand-made selection.

Refusals
--------
``INVALID_REQUEST`` (400) for a name, kind or member the repository refuses, in
its words; ``DISCOVER_LIST_NAME_TAKEN`` (409) when another list of the kind has
the name; ``DISCOVER_LIST_NOT_FOUND`` (404).
"""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Sequence, Tuple

from cuepoint.engine.api_errors import ApiError, bad_request, not_found
from cuepoint.engine.discover_api import (
    LIST_NAME_TAKEN,
    LIST_NOT_FOUND,
    PREFIX,
    _body,
    _only,
    _params,
    _resolve,
)
from cuepoint.persistence.discover_list_repository import DiscoverListNameTaken

LISTS_PATH = PREFIX + "lists"
LIST_CREATE_PATH = PREFIX + "lists/create"

_LIST_ROUTE = re.compile(r"^/api/v1/discover/lists/([^/]+)$")
_LIST_UPDATE_ROUTE = re.compile(r"^/api/v1/discover/lists/([^/]+)/update$")
_LIST_DELETE_ROUTE = re.compile(r"^/api/v1/discover/lists/([^/]+)/delete$")

LISTS_PARAMS: Tuple[str, ...] = ("kind",)
LIST_CREATE_FIELDS: Tuple[str, ...] = ("kind", "name", "members")
LIST_UPDATE_FIELDS: Tuple[str, ...] = ("name", "members")

_MAX_ID = 2**53 - 1
_WHOLE = re.compile(r"^[1-9]\d*$")


def _repository() -> Any:
    return _resolve("IDiscoverListRepository")


def _id_in_path(raw: str) -> int:
    if not _WHOLE.match(raw) or int(raw) > _MAX_ID:
        raise bad_request("A list id is a positive whole number")
    return int(raw)


def _not_found(list_id: int) -> ApiError:
    return not_found(LIST_NOT_FOUND, f"No saved list {list_id}")


def _taken(exc: DiscoverListNameTaken) -> ApiError:
    return ApiError(409, LIST_NAME_TAKEN, str(exc))


def lists(params: Dict[str, List[str]]) -> Dict[str, Any]:
    """Every saved list, or one kind's."""
    query = _params(params, LISTS_PARAMS)
    return {"lists": _repository().all(query.get("kind"))}


def list_one(list_id: int, params: Dict[str, List[str]]) -> Dict[str, Any]:
    """One list with its members."""
    _params(params, ())
    found = _repository().get(list_id)
    if found is None:
        raise _not_found(list_id)
    return found


def list_create(data: Dict[str, Any]) -> Dict[str, Any]:
    """Save a new list."""
    _only(data, LIST_CREATE_FIELDS)
    for key in ("kind", "name"):
        if key not in data:
            raise bad_request(f"{key} is required")
    try:
        return _repository().create(data["kind"], data["name"], data.get("members", []))
    except DiscoverListNameTaken as exc:
        raise _taken(exc) from None


def list_update(list_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Rename a list and/or replace its members."""
    _only(data, LIST_UPDATE_FIELDS)
    if not data:
        raise bad_request("Send a name, members, or both")
    for key in ("name", "members"):
        if key in data and data[key] is None:
            raise bad_request(f"{key} cannot be null; leave it out to keep it")
    try:
        updated = _repository().update(list_id, data.get("name"), data.get("members"))
    except DiscoverListNameTaken as exc:
        raise _taken(exc) from None
    if updated is None:
        raise _not_found(list_id)
    return updated


def list_delete(list_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a list; the artists or labels in it are untouched."""
    _only(data, ())
    if not _repository().delete(list_id):
        raise _not_found(list_id)
    return {"id": list_id, "deleted": True}


_GET_ROUTES: Dict[str, Callable[[Dict[str, List[str]]], Dict[str, Any]]] = {
    LISTS_PATH: lists,
}

GET_PATHS: Tuple[str, ...] = (*_GET_ROUTES, PREFIX + "lists/{id}")
POST_PATHS: Tuple[str, ...] = (
    LIST_CREATE_PATH,
    PREFIX + "lists/{id}/update",
    PREFIX + "lists/{id}/delete",
)


def handles_get(path: str) -> bool:
    """True when this module answers a GET for ``path``."""
    return path in _GET_ROUTES or bool(_LIST_ROUTE.match(path))


def handles_post(path: str) -> bool:
    """True when this module answers a POST for ``path``."""
    return path == LIST_CREATE_PATH or bool(
        _LIST_UPDATE_ROUTE.match(path) or _LIST_DELETE_ROUTE.match(path)
    )


def handle_get(path: str, params: Dict[str, List[str]]) -> Tuple[int, Dict[str, Any]]:
    """Answer a GET, or raise."""
    handler = _GET_ROUTES.get(path)
    if handler is not None:
        return 200, handler(params)
    one = _LIST_ROUTE.match(path)
    if one:
        return 200, list_one(_id_in_path(one.group(1)), params)
    raise not_found("NOT_FOUND", "Unknown path")


def handle_post(path: str, raw: bytes) -> Tuple[int, Dict[str, Any]]:
    """Answer a POST, or raise."""
    data = _body(raw)
    if path == LIST_CREATE_PATH:
        return 200, list_create(data)
    update = _LIST_UPDATE_ROUTE.match(path)
    if update:
        return 200, list_update(_id_in_path(update.group(1)), data)
    delete = _LIST_DELETE_ROUTE.match(path)
    if delete:
        return 200, list_delete(_id_in_path(delete.group(1)), data)
    raise not_found("NOT_FOUND", "Unknown path")


__all__: Sequence[str] = (
    "GET_PATHS",
    "POST_PATHS",
    "handle_get",
    "handle_post",
    "handles_get",
    "handles_post",
)
