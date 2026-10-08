#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for a Set's plan that does not move an entry (PREP-03, DEC-103).

A Set's entries are ``collection_tracks`` rows, and ``collection_repository``
is the only module that writes them (PREP-02): anything that adds, removes or
moves an entry, including moving a whole chapter, is there. This module writes
everything else a user edits on a Set:

- **chapters**: inserting one, changing its name, notes and targets, deleting
  one into its neighbour, and splitting one at an entry;
- **each entry's plan**: its planned in and out times and its note;
- **the Set's own notes**;
- **acknowledged warnings** (PREP-05), and the one read a Set's checks need.

It never writes ``collection_tracks``, and a test holds it to that.

Chapter positions are contiguous, as entry positions are
--------------------------------------------------------
Chapters are numbered ``0, 1, 2, …`` with no gaps, and each write here keeps
them so by the same range arithmetic ``collection_repository`` uses for
entries. Nothing here changes an entry's position, so a write here can keep a
Set's chapters in entry order only by which chapter it puts entries in:

- a new chapter is inserted with no entries, so it breaks no order;
- a deleted chapter's entries join the chapter next to them, which they are
  already beside;
- a split moves the entries from a point to the end of one chapter into a new
  chapter placed straight after it.

Every write that touches chapters ends with
:func:`~cuepoint.persistence.set_integrity.check_set` inside its transaction,
so the argument above is checked on every call rather than trusted.

The rules a user can break are the service's
--------------------------------------------
That the last chapter cannot be deleted, that a split needs an entry before it
in its chapter, that a planned time fits the track: those are refusals with a
message, and ``set_service`` makes them before calling here. What this module
refuses is only what would corrupt a Set, and it does that by raising
:class:`~cuepoint.models.set_plan.SetIntegrityError` from the check.
"""

from __future__ import annotations

import sqlite3
from typing import List, Optional, Sequence, Tuple

from cuepoint.models.filter_rule import (
    FILE_CHECK_CURRENT,
    FILES_ALIAS,
    MATCH_ALIAS,
    MATCH_CANDIDATE_ALIAS,
    METADATA_ALIAS,
    field_spec,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.set_plan import (
    EntryFactsRow,
    EntryTrackRow,
    SetAcknowledgement,
    SetChapter,
    SetDetails,
    SetEntryPlan,
    SetEntryRow,
    SetIntegrityError,
    normalize_chapter_name,
)
from cuepoint.persistence.set_integrity import check_set
from cuepoint.persistence.track_query import JOINS
from cuepoint.services.interfaces import IDatabaseService, ISetRepository

_SELECT_CHAPTER = (
    "SELECT id, collection_id, position, name, notes, target_seconds, bpm_min,"
    " bpm_max, created_at, updated_at FROM set_chapters"
)

#: An entry, its plan and its track's length. The plan is joined, not left
#: joined: an entry without one is a broken Set, and :func:`check_set` is what
#: reports that, not a read.
_SELECT_ENTRY_ROWS = (
    "SELECT ct.position, ct.track_id, se.entry_id, se.collection_id,"
    " se.chapter_id, se.in_seconds, se.out_seconds, se.note,"
    " t.duration_seconds AS length_seconds"
    " FROM set_entries se"
    " JOIN collection_tracks ct ON ct.id = se.entry_id"
    " JOIN tracks t ON t.id = ct.track_id"
)


def _current(column: str) -> str:
    """A column of the last file check, when it checked the current path."""
    return f"CASE WHEN {FILE_CHECK_CURRENT} THEN {FILES_ALIAS}.{column} END"


#: A Set's entries as its checks read them (PREP-05): the plan, the effective
#: BPM and key through the rule vocabulary's own expressions (DEC-068), the
#: track's length, and the last check of its current path (DEC-073), read the
#: way the Library's ``file_status`` filter reads it. One statement for the
#: whole Set.
_SELECT_FACTS = (
    "SELECT ct.position, ct.id AS entry_id, ct.track_id, se.chapter_id,"
    " se.in_seconds, se.out_seconds, tracks.duration_seconds AS length_seconds,"
    f" {field_spec('bpm').expression} AS bpm,"
    f" {field_spec('key').expression} AS key,"
    f" {_current('status')} AS file_status,"
    f" {_current('reason')} AS file_reason,"
    f" {_current('checked_at')} AS file_checked_at"
    " FROM collection_tracks ct"
    " JOIN set_entries se ON se.entry_id = ct.id"
    " JOIN tracks ON tracks.id = ct.track_id"
    f"{JOINS[METADATA_ALIAS]}{JOINS[MATCH_ALIAS]}{JOINS[MATCH_CANDIDATE_ALIAS]}"
    f"{JOINS[FILES_ALIAS]}"
    " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id"
)

_SELECT_ACKNOWLEDGEMENT = (
    "SELECT id, collection_id, from_entry_id, to_entry_id, warning,"
    " compared_json, created_at FROM set_acknowledgements"
    " WHERE from_entry_id = ? AND to_entry_id = ? AND warning = ?"
)


class SetRepository(ISetRepository):
    """Persistence for a Set's chapters, planned times and notes."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ read

    def chapter(self, chapter_id: int) -> Optional[SetChapter]:
        """Return one chapter, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_CHAPTER} WHERE id = ?", (int(chapter_id),))
            .fetchone()
        )
        return None if row is None else SetChapter.from_row(row)

    def entry_row(self, entry_id: int) -> Optional[SetEntryRow]:
        """Return one entry of a Set with its plan, or ``None``.

        ``None`` also for an entry of a Collection, which has no plan: to this
        module an entry that is not a Set's does not exist.
        """
        row = (
            self._db.connect()
            .execute(f"{_SELECT_ENTRY_ROWS} WHERE se.entry_id = ?", (int(entry_id),))
            .fetchone()
        )
        return None if row is None else SetEntryRow.from_row(row)

    def entry_rows(self, set_id: int) -> List[SetEntryRow]:
        """Return a Set's entries with their plans, in the Set's own order.

        One query for the whole Set, which is at most
        :data:`~cuepoint.models.set_plan.MAX_SET_ENTRIES` rows.
        """
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_ENTRY_ROWS} WHERE se.collection_id = ?"
                " ORDER BY ct.position, ct.id",
                (int(set_id),),
            )
            .fetchall()
        )
        return [SetEntryRow.from_row(row) for row in rows]

    def first_entry_position(self, chapter_id: int) -> Optional[int]:
        """Return the position of a chapter's first entry, or ``None`` if empty."""
        row = (
            self._db.connect()
            .execute(
                "SELECT min(ct.position) AS first FROM set_entries se"
                " JOIN collection_tracks ct ON ct.id = se.entry_id"
                " WHERE se.chapter_id = ?",
                (int(chapter_id),),
            )
            .fetchone()
        )
        return None if row is None or row["first"] is None else int(row["first"])

    def chapter_count(self, set_id: int) -> int:
        """Return how many chapters a Set has."""
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS n FROM set_chapters WHERE collection_id = ?",
                (int(set_id),),
            )
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    # -------------------------------------------------------------- chapters

    def insert_chapter(self, set_id: int, position: int, name: str = "") -> SetChapter:
        """Insert an empty chapter at ``position``, clamped to the end.

        The chapters at and after it move up one. It holds no entries, so the
        Set's entries stay in chapter order without being touched.
        """
        set_id = int(set_id)
        with self._db.transaction(join_existing=True) as conn:
            end = self._chapter_total(conn, set_id)
            target = max(0, min(int(position), end))
            conn.execute(
                "UPDATE set_chapters SET position = position + 1"
                " WHERE collection_id = ? AND position >= ?",
                (set_id, target),
            )
            chapter_id = self._insert(conn, set_id, target, name)
            check_set(conn, set_id)
            return self._read_chapter(conn, chapter_id)

    def update_chapter(self, chapter: SetChapter) -> Optional[SetChapter]:
        """Write a chapter's name, notes and targets; its place is not changed.

        The model has already validated the values. ``updated_at`` is now.

        Returns:
            The chapter as stored, or ``None`` if there is no such chapter.
        """
        if chapter.id is None:
            raise ValueError("Only a stored chapter can be updated")
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE set_chapters SET name = ?, notes = ?, target_seconds = ?,"
                " bpm_min = ?, bpm_max = ?, updated_at = ? WHERE id = ?",
                (
                    chapter.name,
                    chapter.notes,
                    chapter.target_seconds,
                    chapter.bpm_min,
                    chapter.bpm_max,
                    utc_now_iso(),
                    int(chapter.id),
                ),
            )
            if not cursor.rowcount:
                return None
            return self._read_chapter(conn, int(chapter.id))

    def delete_chapter(self, chapter_id: int) -> Optional[Tuple[int, int]]:
        """Delete a chapter, its entries joining the chapter next to them.

        DEC-103's rule: the chapter before, or the one after for the first.
        Those are the only chapters its entries are already beside, so the Set
        stays in order without an entry moving. The chapters after the deleted
        one move down one. Deleting a Set's only chapter would leave its
        entries nowhere; the service refuses it, and the check refuses it here
        too.

        Returns:
            The id of the chapter the entries joined and how many joined it, or
            ``None`` if there is no such chapter.

        Raises:
            SetIntegrityError: If it is the Set's only chapter.
        """
        chapter_id = int(chapter_id)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT collection_id, position FROM set_chapters WHERE id = ?",
                (chapter_id,),
            ).fetchone()
            if row is None:
                return None
            set_id = int(row["collection_id"])
            position = int(row["position"])
            neighbour = conn.execute(
                "SELECT id FROM set_chapters WHERE collection_id = ? AND position = ?",
                (set_id, position - 1 if position > 0 else 1),
            ).fetchone()
            if neighbour is None:
                raise SetIntegrityError(
                    f"Chapter {chapter_id} is the only chapter of Set {set_id}"
                )
            into = int(neighbour["id"])
            moved = conn.execute(
                "UPDATE set_entries SET chapter_id = ? WHERE chapter_id = ?",
                (into, chapter_id),
            ).rowcount
            if moved:
                conn.execute(
                    "UPDATE set_chapters SET updated_at = ? WHERE id = ?",
                    (utc_now_iso(), into),
                )
            conn.execute("DELETE FROM set_chapters WHERE id = ?", (chapter_id,))
            conn.execute(
                "UPDATE set_chapters SET position = position - 1"
                " WHERE collection_id = ? AND position > ?",
                (set_id, position),
            )
            check_set(conn, set_id)
        return into, int(moved or 0)

    def split_chapter(self, entry_id: int, name: str = "") -> Optional[SetChapter]:
        """Start a new chapter at an entry: it and the rest of its chapter move.

        The new chapter goes straight after the entry's chapter, and takes the
        entry and every entry after it in that chapter. The entries before it
        stay where they were, and so does every entry's position.

        Returns:
            The new chapter, or ``None`` if the entry is not a Set's.
        """
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT se.collection_id, se.chapter_id, ct.position,"
                " ch.position AS chapter_position FROM set_entries se"
                " JOIN collection_tracks ct ON ct.id = se.entry_id"
                " JOIN set_chapters ch ON ch.id = se.chapter_id"
                " WHERE se.entry_id = ?",
                (int(entry_id),),
            ).fetchone()
            if row is None:
                return None
            set_id = int(row["collection_id"])
            target = int(row["chapter_position"]) + 1
            conn.execute(
                "UPDATE set_chapters SET position = position + 1"
                " WHERE collection_id = ? AND position >= ?",
                (set_id, target),
            )
            chapter_id = self._insert(conn, set_id, target, name)
            conn.execute(
                "UPDATE set_entries SET chapter_id = ?"
                " WHERE chapter_id = ? AND entry_id IN"
                " (SELECT id FROM collection_tracks"
                "  WHERE collection_id = ? AND position >= ?)",
                (chapter_id, int(row["chapter_id"]), set_id, int(row["position"])),
            )
            conn.execute(
                "UPDATE set_chapters SET updated_at = ? WHERE id = ?",
                (utc_now_iso(), int(row["chapter_id"])),
            )
            check_set(conn, set_id)
            return self._read_chapter(conn, chapter_id)

    # --------------------------------------------------------- entries, notes

    def update_entry_plan(self, plan: SetEntryPlan) -> bool:
        """Write an entry's planned times and note; its chapter is not changed.

        The model has already validated the values.

        Returns:
            True if the entry has a plan row to write.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE set_entries SET in_seconds = ?, out_seconds = ?, note = ?"
                " WHERE entry_id = ?",
                (plan.in_seconds, plan.out_seconds, plan.note, int(plan.entry_id)),
            )
            return bool(cursor.rowcount)

    def set_notes(self, set_id: int, notes: Optional[str]) -> Optional[SetDetails]:
        """Write a Set's notes; ``None`` clears them.

        Returns:
            The details as stored, or ``None`` if the node is not a Set.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE set_details SET notes = ?, updated_at = ?"
                " WHERE collection_id = ?",
                (notes, utc_now_iso(), int(set_id)),
            )
            if not cursor.rowcount:
                return None
            row = conn.execute(
                "SELECT collection_id, notes, created_at, updated_at"
                " FROM set_details WHERE collection_id = ?",
                (int(set_id),),
            ).fetchone()
        return SetDetails.from_row(row)

    # -------------------------------------------------------- the checks

    def entry_facts(self, set_id: int) -> List[EntryFactsRow]:
        """Return a Set's entries as its checks read them, in the Set's order."""
        cursor = self._db.connect().cursor()
        # Plain tuples, as Similar Tracks reads a band: a Set is read whole on
        # every check, and each row is parsed once.
        cursor.row_factory = None
        cursor.execute(_SELECT_FACTS, (int(set_id),))
        return [EntryFactsRow(*row) for row in cursor]

    def entry_tracks(self, set_id: int) -> List[EntryTrackRow]:
        """Return each entry's track as a set list names it, in the Set's order."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT ct.id AS entry_id, tracks.artist, tracks.title,"
                " tracks.remixer, tracks.file_path"
                " FROM collection_tracks ct"
                " JOIN set_entries se ON se.entry_id = ct.id"
                " JOIN tracks ON tracks.id = ct.track_id"
                " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id",
                (int(set_id),),
            )
            .fetchall()
        )
        return [
            EntryTrackRow(
                entry_id=int(row["entry_id"]),
                artist=row["artist"],
                title=row["title"],
                remixer=row["remixer"],
                file_path=str(row["file_path"] or ""),
            )
            for row in rows
        ]

    def acknowledge(self, acknowledgement: SetAcknowledgement) -> SetAcknowledgement:
        """Store an acknowledgement, or bring one up to date (DEC-106).

        One per transition and warning: acknowledging again replaces the
        values compared, and the moment, only when the values changed. The
        database refuses an acknowledgement across two Sets or of an entry
        that is not planned.
        """
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(
                "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
                " to_entry_id, warning, compared_json, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)"
                " ON CONFLICT (from_entry_id, to_entry_id, warning) DO UPDATE SET"
                " compared_json = excluded.compared_json,"
                " created_at = excluded.created_at"
                " WHERE set_acknowledgements.compared_json <> excluded.compared_json",
                (
                    int(acknowledgement.collection_id),
                    int(acknowledgement.from_entry_id),
                    int(acknowledgement.to_entry_id),
                    acknowledgement.warning,
                    acknowledgement.compared_json,
                    acknowledgement.created_at,
                ),
            )
            row = conn.execute(
                _SELECT_ACKNOWLEDGEMENT,
                (
                    int(acknowledgement.from_entry_id),
                    int(acknowledgement.to_entry_id),
                    acknowledgement.warning,
                ),
            ).fetchone()
        return SetAcknowledgement.from_row(row)

    def unacknowledge(self, from_entry_id: int, to_entry_id: int, warning: str) -> bool:
        """Remove an acknowledgement; True if there was one."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM set_acknowledgements"
                " WHERE from_entry_id = ? AND to_entry_id = ? AND warning = ?",
                (int(from_entry_id), int(to_entry_id), warning),
            )
            return bool(cursor.rowcount)

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _chapter_total(conn: sqlite3.Connection, set_id: int) -> int:
        """How many chapters a Set has, read on the write's own connection."""
        row = conn.execute(
            "SELECT count(*) AS n FROM set_chapters WHERE collection_id = ?",
            (set_id,),
        ).fetchone()
        return int(row["n"]) if row is not None else 0

    @staticmethod
    def _insert(conn: sqlite3.Connection, set_id: int, position: int, name: str) -> int:
        """Insert a chapter row with no notes or targets; return its id."""
        now = utc_now_iso()
        cursor = conn.execute(
            "INSERT INTO set_chapters"
            " (collection_id, position, name, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (set_id, position, normalize_chapter_name(name), now, now),
        )
        return int(cursor.lastrowid or 0)

    @staticmethod
    def _read_chapter(conn: sqlite3.Connection, chapter_id: int) -> SetChapter:
        """Read a chapter back on the write's own connection."""
        row = conn.execute(
            f"{_SELECT_CHAPTER} WHERE id = ?", (int(chapter_id),)
        ).fetchone()
        return SetChapter.from_row(row)


__all__: Sequence[str] = ("SetRepository",)
