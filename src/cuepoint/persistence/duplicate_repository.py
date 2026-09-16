#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for duplicate groups: finding them, storing them, dismissing them (CLEAN-08).

Reading
-------
The path and Beatport signals are grouped by SQL, as the specification asks:
``GROUP BY`` over ``tracks.normalized_path``, and over the Beatport id of every
accepted candidate. The text signal needs the matcher's normalization, which is
Python, so this module only streams the four columns it reads.

Writing a signal
----------------
:meth:`DuplicateRepository.replace_signal` makes one signal's stored groups the
groups a scan found, inside the caller's transaction:

- a group whose key is still found keeps its **id**, so a group a user has open
  is still the same group after the scan that follows an import;
- its members become exactly the members found, and a member that left the
  library while the scan ran is skipped rather than failing the signal;
- its fingerprint is written from the members it ended up with;
- a group no longer found is deleted, and so is one left with fewer than two.

Nothing here writes ``tracks``, ``track_metadata`` or anything outside these
three tables; a test holds it to that.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, Iterator, List, Optional, Sequence, Set, Tuple

from cuepoint.models.duplicate_group import (
    SIGNALS,
    DuplicateDismissal,
    DuplicateGroup,
    DuplicateGroupMembers,
    ScannedGroup,
    member_hash,
)
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked
from cuepoint.services.interfaces import IDatabaseService, IDuplicateRepository

_GROUP_COLUMNS = "g.id AS id, g.signal AS signal, g.group_key AS group_key, g.computed_at AS computed_at, g.member_hash AS member_hash"

# A group as it is now, with whether a dismissal covers its members. Members are
# read in the same statement, so the fingerprint and the list come from one read.
_GROUPS = (
    f"SELECT {_GROUP_COLUMNS}, group_concat(m.track_id) AS track_ids, "
    "EXISTS (SELECT 1 FROM duplicate_dismissals AS d WHERE d.signal = g.signal"
    " AND d.group_key = g.group_key AND d.member_hash = g.member_hash) AS dismissed "
    "FROM duplicate_groups AS g JOIN duplicate_members AS m ON m.group_id = g.id"
    "{where} GROUP BY g.id HAVING count(m.track_id) >= {minimum}{hidden}"
    " ORDER BY g.signal, g.group_key{page}"
)

# Dismissed groups left out in SQL, so a page and its count describe the same
# groups (CLEAN-12). `dismissed` is the column above; SQLite reads it by name.
_NOT_DISMISSED = " AND NOT dismissed"

_PATH_GROUPS = (
    "SELECT normalized_path AS group_key, group_concat(id) AS track_ids FROM tracks"
    " WHERE normalized_path <> '' GROUP BY normalized_path HAVING count(*) >= 2"
)

# The accepted candidate's Beatport id, or its page when an id was never parsed.
# `track_match` is keyed by track, so a track appears once per key.
_BEATPORT_GROUPS = (
    "SELECT CASE WHEN c.beatport_track_id IS NOT NULL AND c.beatport_track_id <> ''"
    " THEN 'id:' || c.beatport_track_id ELSE 'url:' || c.url END AS group_key,"
    " group_concat(m.track_id) AS track_ids"
    " FROM track_match AS m JOIN match_candidates AS c ON c.id = m.candidate_id"
    " WHERE m.state = 'accepted' GROUP BY group_key HAVING count(*) >= 2"
)


def _ids(text: Optional[str]) -> Tuple[int, ...]:
    if not text:
        return ()
    return tuple(sorted({int(part) for part in str(text).split(",")}))


def _signal_where(signal: Optional[str]) -> Tuple[str, Tuple[object, ...]]:
    if signal is None:
        return "", ()
    return " WHERE g.signal = ?", (signal,)


def _members(row: sqlite3.Row) -> DuplicateGroupMembers:
    return DuplicateGroupMembers(
        group=DuplicateGroup.from_row(row),
        track_ids=_ids(row["track_ids"]),
        dismissed=bool(row["dismissed"]),
    )


class DuplicateRepository(IDuplicateRepository):
    """Persistence for duplicate groups, their members and dismissals."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # -------------------------------------------------------------- finding

    def path_groups(self) -> List[ScannedGroup]:
        """Tracks sharing a normalized file path, grouped by SQL."""
        return [
            ScannedGroup("path", str(row["group_key"]), _ids(row["track_ids"]))
            for row in self._db.connect().execute(_PATH_GROUPS)
        ]

    def beatport_groups(self) -> List[ScannedGroup]:
        """Tracks whose accepted candidates are one Beatport track, grouped by SQL."""
        return [
            ScannedGroup("beatport", str(row["group_key"]), _ids(row["track_ids"]))
            for row in self._db.connect().execute(_BEATPORT_GROUPS)
        ]

    def text_rows(
        self,
    ) -> Iterator[Tuple[int, Optional[str], Optional[str], Optional[int]]]:
        """Every track's id, artist, title and length, streamed."""
        cursor = self._db.connect().execute(
            "SELECT id, artist, title, duration_seconds FROM tracks"
        )
        for row in cursor:
            duration = row["duration_seconds"]
            yield (
                int(row["id"]),
                row["artist"],
                row["title"],
                None if duration is None else int(duration),
            )

    # -------------------------------------------------------------- writing

    def replace_signal(
        self, signal: str, groups: Sequence[ScannedGroup], computed_at: str
    ) -> int:
        """Make one signal's stored groups the groups found; return members written.

        Joins the caller's transaction, so a signal is replaced whole or not at
        all.

        Raises:
            ValueError: If a group is for another signal or two share a key.
        """
        if signal not in SIGNALS:
            raise ValueError(f"signal must be one of {SIGNALS}, got {signal!r}")
        keys: Set[str] = set()
        for group in groups:
            if group.signal != signal:
                raise ValueError(
                    f"A {group.signal} group cannot replace {signal} groups"
                )
            if group.group_key in keys:
                raise ValueError(
                    f"Two {signal} groups share the key {group.group_key!r}"
                )
            keys.add(group.group_key)

        written = 0
        with self._db.transaction(join_existing=True) as conn:
            existing: Dict[str, int] = {
                str(row["group_key"]): int(row["id"])
                for row in conn.execute(
                    "SELECT id, group_key FROM duplicate_groups WHERE signal = ?",
                    (signal,),
                )
            }
            stale = [group_id for key, group_id in existing.items() if key not in keys]
            for chunk in chunked(stale, CHUNK_SIZE):
                placeholders = ", ".join("?" for _ in chunk)
                conn.execute(
                    f"DELETE FROM duplicate_groups WHERE id IN ({placeholders})", chunk
                )

            for group in groups:
                group_id = existing.get(group.group_key)
                if group_id is None:
                    cursor = conn.execute(
                        "INSERT INTO duplicate_groups"
                        " (signal, group_key, computed_at, member_hash) VALUES (?, ?, ?, ?)",
                        (signal, group.group_key, computed_at, group.member_hash),
                    )
                    group_id = int(cursor.lastrowid or 0)
                    current: Set[int] = set()
                else:
                    current = {
                        int(row["track_id"])
                        for row in conn.execute(
                            "SELECT track_id FROM duplicate_members WHERE group_id = ?",
                            (group_id,),
                        )
                    }
                wanted = set(group.track_ids)
                gone = sorted(current - wanted)
                for chunk in chunked(gone, CHUNK_SIZE):
                    placeholders = ", ".join("?" for _ in chunk)
                    conn.execute(
                        "DELETE FROM duplicate_members"
                        f" WHERE group_id = ? AND track_id IN ({placeholders})",
                        (group_id, *chunk),
                    )
                kept = set(current & wanted)
                for track_id in sorted(wanted - current):
                    cursor = conn.execute(
                        "INSERT INTO duplicate_members (group_id, track_id)"
                        " SELECT ?, ? WHERE EXISTS (SELECT 1 FROM tracks WHERE id = ?)",
                        (group_id, track_id, track_id),
                    )
                    if cursor.rowcount == 1:
                        kept.add(track_id)
                        written += 1
                fingerprint = member_hash(kept) if kept else group.member_hash
                conn.execute(
                    "UPDATE duplicate_groups SET computed_at = ?, member_hash = ?"
                    " WHERE id = ?",
                    (computed_at, fingerprint, group_id),
                )

            conn.execute(
                "DELETE FROM duplicate_groups WHERE signal = ? AND"
                " (SELECT count(*) FROM duplicate_members AS m"
                "  WHERE m.group_id = duplicate_groups.id) < 2",
                (signal,),
            )
        return written

    def dismiss(self, dismissal: DuplicateDismissal, group_id: int) -> None:
        """Store a dismissal, and the fingerprint it was made for on its group."""
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(
                "INSERT INTO duplicate_dismissals"
                " (signal, group_key, member_hash, dismissed_at) VALUES (?, ?, ?, ?)"
                " ON CONFLICT (signal, group_key) DO UPDATE SET"
                " member_hash = excluded.member_hash, dismissed_at = excluded.dismissed_at",
                (
                    dismissal.signal,
                    dismissal.group_key,
                    dismissal.member_hash,
                    dismissal.dismissed_at,
                ),
            )
            conn.execute(
                "UPDATE duplicate_groups SET member_hash = ? WHERE id = ?",
                (dismissal.member_hash, int(group_id)),
            )

    def undismiss(self, signal: str, group_key: str) -> bool:
        """Forget a dismissal; return whether there was one."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM duplicate_dismissals WHERE signal = ? AND group_key = ?",
                (signal, group_key),
            )
            return cursor.rowcount == 1

    # -------------------------------------------------------------- reading

    def groups(
        self,
        signal: Optional[str] = None,
        *,
        include_dismissed: bool = False,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> List[DuplicateGroupMembers]:
        """Groups of two or more, optionally one signal's, by signal and key.

        Dismissed groups are left out unless asked for. ``limit`` and ``offset``
        page them in SQL (CLEAN-12): a page of fifty is read as fifty groups,
        not as every group with fifty kept.
        """
        where, params = _signal_where(signal)
        page = ""
        if limit is not None:
            page = " LIMIT ? OFFSET ?"
            params = (*params, int(limit), max(0, int(offset)))
        elif offset:
            page = " LIMIT -1 OFFSET ?"
            params = (*params, max(0, int(offset)))
        return [
            _members(row)
            for row in self._db.connect().execute(
                _GROUPS.format(
                    where=where,
                    minimum=2,
                    hidden="" if include_dismissed else _NOT_DISMISSED,
                    page=page,
                ),
                params,
            )
        ]

    def count_groups(
        self, signal: Optional[str] = None, *, include_dismissed: bool = False
    ) -> int:
        """How many groups :meth:`groups` would answer without a page."""
        where, params = _signal_where(signal)
        inner = _GROUPS.format(
            where=where,
            minimum=2,
            hidden="" if include_dismissed else _NOT_DISMISSED,
            page="",
        )
        row = (
            self._db.connect()
            .execute(f"SELECT count(*) FROM ({inner})", params)
            .fetchone()
        )
        return int(row[0]) if row is not None else 0

    def group(self, group_id: int) -> Optional[DuplicateGroupMembers]:
        """A group as it is now, whatever its size; None when there is no such group."""
        row = (
            self._db.connect()
            .execute(
                _GROUPS.format(where=" WHERE g.id = ?", minimum=0, hidden="", page=""),
                (int(group_id),),
            )
            .fetchone()
        )
        if row is not None:
            return _members(row)
        bare = (
            self._db.connect()
            .execute(
                "SELECT id, signal, group_key, computed_at, member_hash"
                " FROM duplicate_groups WHERE id = ?",
                (int(group_id),),
            )
            .fetchone()
        )
        if bare is None:
            return None
        return DuplicateGroupMembers(group=DuplicateGroup.from_row(bare), track_ids=())

    def dismissal(self, signal: str, group_key: str) -> Optional[DuplicateDismissal]:
        """The dismissal stored for a signal and key, if any."""
        row = (
            self._db.connect()
            .execute(
                "SELECT signal, group_key, member_hash, dismissed_at"
                " FROM duplicate_dismissals WHERE signal = ? AND group_key = ?",
                (signal, group_key),
            )
            .fetchone()
        )
        return None if row is None else DuplicateDismissal.from_row(row)


__all__: Sequence[str] = ("DuplicateRepository",)
