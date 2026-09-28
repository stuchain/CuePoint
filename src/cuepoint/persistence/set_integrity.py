#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The one check every write to a Set ends with (PREP-02, PREP-03, DEC-103).

Two repositories write a Set. ``collection_repository`` writes its entries and
plans each one as it does, and ``set_repository`` writes its chapters and the
rest of each entry's plan. Both end every write with :func:`check_set`, inside
the write's transaction, so a write that breaks DEC-103 rolls back rather than
committing a Set nothing can draw.

What it holds, read back from the rows rather than trusted from the write:

- the Set has at least one chapter;
- its chapters are numbered ``0, 1, 2, …`` with no gap and no repeat;
- every entry has a plan row, so every entry is in a chapter;
- in entry order, chapter positions never decrease, so each chapter's entries
  are together.

A violation raises :class:`~cuepoint.models.set_plan.SetIntegrityError`, which
is not a ``ValueError``: nothing a user sends can cause it, so it is a bug in
the writer and is answered as one.
"""

from __future__ import annotations

import sqlite3
from typing import Sequence

from cuepoint.models.set_plan import SetIntegrityError


def check_set(conn: sqlite3.Connection, set_id: int) -> None:
    """Hold DEC-103 after a write to a Set.

    One statement reads the chapters' count, their distinct places and the
    highest place, the entries with no plan, and the entries whose chapter comes
    before the chapter of the entry before them (the window function ``lag``
    reads the neighbour without a self-join).

    Raises:
        SetIntegrityError: If the write broke any of the four rules. The
            caller's transaction rolls back.
    """
    row = conn.execute(
        "SELECT"
        " (SELECT count(*) FROM set_chapters WHERE collection_id = :set)"
        "   AS chapters,"
        " (SELECT count(DISTINCT position) FROM set_chapters"
        "   WHERE collection_id = :set) AS places,"
        " (SELECT max(position) FROM set_chapters WHERE collection_id = :set)"
        "   AS last,"
        " (SELECT count(*) FROM collection_tracks ct"
        "   WHERE ct.collection_id = :set AND NOT EXISTS"
        "   (SELECT 1 FROM set_entries se WHERE se.entry_id = ct.id))"
        "   AS unplanned,"
        " (SELECT count(*) FROM ("
        "   SELECT ch.position AS here,"
        "    lag(ch.position) OVER (ORDER BY ct.position, ct.id) AS before"
        "   FROM collection_tracks ct"
        "   JOIN set_entries se ON se.entry_id = ct.id"
        "   JOIN set_chapters ch ON ch.id = se.chapter_id"
        "   WHERE ct.collection_id = :set"
        " ) WHERE here < before) AS backwards",
        {"set": int(set_id)},
    ).fetchone()
    chapters = int(row["chapters"])
    if not chapters:
        raise SetIntegrityError(f"Set {set_id} has no chapter")
    # The schema refuses a negative position, so n chapters on n distinct
    # positions, the highest of them n - 1, are exactly 0 … n - 1.
    if int(row["places"]) != chapters or int(row["last"]) != chapters - 1:
        raise SetIntegrityError(
            f"Set {set_id}'s {chapters} chapters are not numbered 0 to {chapters - 1}"
        )
    if int(row["unplanned"]):
        raise SetIntegrityError(
            f"{row['unplanned']} entries of Set {set_id} have no chapter"
        )
    if int(row["backwards"]):
        raise SetIntegrityError(
            f"Set {set_id}'s chapters are out of order in its entries"
        )


__all__: Sequence[str] = ("check_set",)
