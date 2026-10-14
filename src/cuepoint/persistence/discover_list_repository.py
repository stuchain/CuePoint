#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for saved artist and label lists (migration 0029).

A list is a name and the artist or label names a dig looks for, the same names
the Library's facets send and a run's request takes. The rules a list keeps are
here, where a caller cannot go around them:

- a name is trimmed, runs of spaces become one, and it is 1 to
  :data:`MAX_NAME` characters;
- a name is unique within its kind, compared without regard to case;
- a member is a name of 1 to :data:`MAX_MEMBER` characters, kept in the order
  given, with a repeat (compared case-sensitively, as the facet's values are)
  dropped; a list holds at most :data:`MAX_MEMBERS`.

A refusal is a :class:`ValueError` in words a person can act on (the engine
maps it to 400), or :class:`DiscoverListNameTaken` for a name that is in use,
which the engine answers as 409. Each write is one transaction, so a list and
its members change together or not at all.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

from cuepoint.services.interfaces import IDatabaseService, IDiscoverListRepository

KINDS = ("artist", "label")
MAX_NAME = 80
MAX_MEMBER = 300
MAX_MEMBERS = 20000


class DiscoverListNameTaken(ValueError):
    """Another list of the same kind already has this name."""


def clean_name(value: Any) -> str:
    """A list's name as stored, or a ValueError saying what is wrong."""
    if not isinstance(value, str):
        raise ValueError("A list's name is text")
    name = " ".join(value.split())
    if not name:
        raise ValueError("Give the list a name")
    if len(name) > MAX_NAME:
        raise ValueError(f"A list's name is at most {MAX_NAME} characters")
    return name


def clean_kind(value: Any) -> str:
    """``artist`` or ``label``, or a ValueError."""
    if value not in KINDS:
        raise ValueError("A list is for artists or labels")
    return str(value)


def clean_members(value: Any) -> List[str]:
    """The names to keep, in order, each once."""
    if not isinstance(value, (list, tuple)):
        raise ValueError("A list's members are a list of names")
    seen = set()
    members: List[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("A member is a name, not another kind of value")
        member = item.strip()
        if not member:
            raise ValueError("A member's name cannot be empty")
        if len(member) > MAX_MEMBER:
            raise ValueError(f"A member's name is at most {MAX_MEMBER} characters")
        if member in seen:
            continue
        seen.add(member)
        members.append(member)
    if len(members) > MAX_MEMBERS:
        raise ValueError(f"A list holds at most {MAX_MEMBERS} names")
    return members


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key(name: str) -> str:
    return name.casefold()


class DiscoverListRepository(IDiscoverListRepository):
    """Saved lists of the artists or labels a dig looks for."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ----------------------------------------------------------------- read

    @staticmethod
    def _members(conn: sqlite3.Connection, ids: Sequence[int]) -> Dict[int, List[str]]:
        found: Dict[int, List[str]] = {i: [] for i in ids}
        if not ids:
            return found
        for start in range(0, len(ids), 500):
            chunk = list(ids[start : start + 500])
            marks = ", ".join("?" for _ in chunk)
            for row in conn.execute(
                "SELECT list_id, member FROM discover_list_members"
                f" WHERE list_id IN ({marks}) ORDER BY list_id, position",
                chunk,
            ):
                found[int(row["list_id"])].append(str(row["member"]))
        return found

    def _lists(
        self, conn: sqlite3.Connection, rows: Iterable[sqlite3.Row]
    ) -> List[Dict[str, Any]]:
        listed = list(rows)
        members = self._members(conn, [int(r["id"]) for r in listed])
        return [
            {
                "id": int(r["id"]),
                "kind": str(r["kind"]),
                "name": str(r["name"]),
                "members": members[int(r["id"])],
                "created_at": str(r["created_at"]),
                "updated_at": str(r["updated_at"]),
            }
            for r in listed
        ]

    def all(self, kind: Optional[str] = None) -> List[Dict[str, Any]]:
        """Every list, or one kind's, by name."""
        conn = self._db.connect()
        if kind is None:
            rows = conn.execute(
                "SELECT * FROM discover_lists ORDER BY kind, name_key"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM discover_lists WHERE kind = ? ORDER BY name_key",
                (clean_kind(kind),),
            ).fetchall()
        return self._lists(conn, rows)

    def get(self, list_id: int) -> Optional[Dict[str, Any]]:
        """One list with its members, or None."""
        conn = self._db.connect()
        rows = conn.execute(
            "SELECT * FROM discover_lists WHERE id = ?", (int(list_id),)
        ).fetchall()
        return self._lists(conn, rows)[0] if rows else None

    # ---------------------------------------------------------------- write

    @staticmethod
    def _write_members(
        conn: sqlite3.Connection, list_id: int, members: Sequence[str]
    ) -> None:
        conn.execute("DELETE FROM discover_list_members WHERE list_id = ?", (list_id,))
        conn.executemany(
            "INSERT INTO discover_list_members (list_id, position, member)"
            " VALUES (?, ?, ?)",
            [(list_id, i, m) for i, m in enumerate(members)],
        )

    @staticmethod
    def _taken(
        conn: sqlite3.Connection, kind: str, key: str, besides: Optional[int]
    ) -> bool:
        row = conn.execute(
            "SELECT id FROM discover_lists WHERE kind = ? AND name_key = ?",
            (kind, key),
        ).fetchone()
        return row is not None and int(row["id"]) != besides

    def create(self, kind: Any, name: Any, members: Any = ()) -> Dict[str, Any]:
        """Save a new list."""
        kind = clean_kind(kind)
        name = clean_name(name)
        kept = clean_members(members)
        now = _now()
        with self._db.transaction(join_existing=True) as conn:
            if self._taken(conn, kind, _key(name), None):
                raise DiscoverListNameTaken(
                    "Another list of this kind already has that name"
                )
            cursor = conn.execute(
                "INSERT INTO discover_lists (kind, name, name_key, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (kind, name, _key(name), now, now),
            )
            list_id = int(cursor.lastrowid or 0)
            self._write_members(conn, list_id, kept)
        created = self.get(list_id)
        if created is None:  # pragma: no cover — written a line above
            raise RuntimeError("The list was not saved")
        return created

    def update(
        self,
        list_id: int,
        name: Optional[Any] = None,
        members: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        """Rename a list and/or replace its members; None when there is no such list."""
        new_name = None if name is None else clean_name(name)
        new_members = None if members is None else clean_members(members)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT kind FROM discover_lists WHERE id = ?", (int(list_id),)
            ).fetchone()
            if row is None:
                return None
            if new_name is not None:
                if self._taken(conn, str(row["kind"]), _key(new_name), int(list_id)):
                    raise DiscoverListNameTaken(
                        "Another list of this kind already has that name"
                    )
                conn.execute(
                    "UPDATE discover_lists SET name = ?, name_key = ? WHERE id = ?",
                    (new_name, _key(new_name), int(list_id)),
                )
            if new_members is not None:
                self._write_members(conn, int(list_id), new_members)
            conn.execute(
                "UPDATE discover_lists SET updated_at = ? WHERE id = ?",
                (_now(), int(list_id)),
            )
        return self.get(list_id)

    def delete(self, list_id: int) -> bool:
        """Delete a list and its members; False when there was none."""
        with self._db.transaction(join_existing=True) as conn:
            return (
                conn.execute(
                    "DELETE FROM discover_lists WHERE id = ?", (int(list_id),)
                ).rowcount
                > 0
            )
