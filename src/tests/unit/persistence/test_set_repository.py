#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's chapters and plan through its two writers (PREP-03, DEC-103).

``SetRepository`` writes chapters, planned times and notes, and never an entry.
``CollectionRepository.move_chapter`` moves a chapter with its entries, because
that module is the only writer of entries (PREP-02). Both end each write with
``check_set``. These tests read every write back from the rows:

- **Inserting** an empty chapter moves the chapters after it up and no entry.
- **Updating** a chapter changes its fields and never its place.
- **Deleting** one puts its entries into the chapter before it, or the one
  after for the first, and closes the gap; deleting the only one is refused
  by the check and rolls back.
- **Splitting** one at an entry moves that entry and the rest of the chapter
  into a new chapter straight after it, and no entry changes place.
- **Moving** one takes its entries along as a block, in their order, with
  their plans.
- **The check** now also holds chapter positions to ``0 … n - 1``.
- **One writer of entries.** No module but ``collection_repository`` has a
  statement that writes ``collection_tracks``.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pytest

from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, Collection
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.set_plan import (
    SetChapter,
    SetEntryPlan,
    SetEntryRow,
    SetIntegrityError,
)
from cuepoint.persistence import set_integrity
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2020-01-01T00:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def ids(db) -> List[int]:
    TrackRepository(db).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="A",
                duration_seconds=300 + i,
            )
            for i in range(1, 11)
        ]
    )
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, ids) -> CollectionRepository:
    return CollectionRepository(db)


@pytest.fixture
def sets(db, ids) -> SetRepository:
    return SetRepository(db)


def make_set(repo, name="Friday") -> int:
    return int(repo.create(Collection(name=name, kind=KIND_SET)).id)


@pytest.fixture
def gig(repo) -> int:
    return make_set(repo)


@pytest.fixture
def three(repo, sets, gig, ids) -> Tuple[int, List[int], List[int]]:
    """A Set of nine entries in three chapters: 0-2 Warm-up, 3-5 Peak, 6-8 Close.

    Returns the Set, its entry ids in order and its chapter ids in order.
    """
    repo.add(gig, ids[:9])
    entries = [int(e.id) for e in repo.entries(gig)]
    sets.split_chapter(entries[3], "Peak")
    sets.split_chapter(entries[6], "Close")
    chapters = [int(c.id) for c in repo.chapters(gig)]
    first = repo.chapters(gig)[0]
    first.name = "Warm-up"
    sets.update_chapter(first)
    return gig, entries, chapters


def layout(db, set_id: int) -> List[Tuple[int, str]]:
    """``(entry id, chapter name)`` in the Set's order."""
    rows = db.connect().execute(
        "SELECT ct.id, ch.name FROM collection_tracks ct"
        " JOIN set_entries se ON se.entry_id = ct.id"
        " JOIN set_chapters ch ON ch.id = se.chapter_id"
        " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id",
        (set_id,),
    )
    return [(int(r["id"]), str(r["name"])) for r in rows]


def chapter_names(repo, set_id: int) -> List[str]:
    return [c.name for c in repo.chapters(set_id)]


def assert_whole(db, set_id: int) -> None:
    """DEC-103, computed from the rows rather than from the module's check."""
    rows = (
        db.connect()
        .execute(
            "SELECT ct.position, se.entry_id AS planned, ch.position AS chapter"
            " FROM collection_tracks ct"
            " LEFT JOIN set_entries se ON se.entry_id = ct.id"
            " LEFT JOIN set_chapters ch ON ch.id = se.chapter_id"
            " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id",
            (set_id,),
        )
        .fetchall()
    )
    assert [int(r["position"]) for r in rows] == list(range(len(rows)))
    assert all(r["planned"] is not None for r in rows)
    chapters = [int(r["chapter"]) for r in rows]
    assert chapters == sorted(chapters)
    positions = [
        int(r["position"])
        for r in db.connect().execute(
            "SELECT position FROM set_chapters WHERE collection_id = ?"
            " ORDER BY position",
            (set_id,),
        )
    ]
    assert positions and positions == list(range(len(positions)))


def plans(
    db, set_id: int
) -> Dict[int, Tuple[Optional[int], Optional[int], Optional[str]]]:
    rows = db.connect().execute(
        "SELECT entry_id, in_seconds, out_seconds, note FROM set_entries"
        " WHERE collection_id = ?",
        (set_id,),
    )
    return {
        int(r["entry_id"]): (r["in_seconds"], r["out_seconds"], r["note"]) for r in rows
    }


def snapshot(db, set_id: int):
    """Everything a write to this Set could change."""
    conn = db.connect()
    return (
        [
            tuple(r)
            for r in conn.execute(
                "SELECT id, position, name, notes, target_seconds, bpm_min, bpm_max,"
                " updated_at FROM set_chapters WHERE collection_id = ? ORDER BY id",
                (set_id,),
            )
        ],
        [
            tuple(r)
            for r in conn.execute(
                "SELECT id, track_id, position FROM collection_tracks"
                " WHERE collection_id = ? ORDER BY id",
                (set_id,),
            )
        ],
        [
            tuple(r)
            for r in conn.execute(
                "SELECT * FROM set_entries WHERE collection_id = ? ORDER BY entry_id",
                (set_id,),
            )
        ],
        [
            tuple(r)
            for r in conn.execute(
                "SELECT * FROM set_details WHERE collection_id = ?", (set_id,)
            )
        ],
    )


# ------------------------------------------------------------------ reads


@pytest.mark.unit
class TestReads:
    def test_entry_rows_are_in_the_sets_order_with_the_tracks_length(
        self, repo, sets, gig, ids
    ):
        repo.add(gig, ids[:3])
        repo.insert_at(gig, ids[0], 0)
        rows = sets.entry_rows(gig)
        assert [r.track_id for r in rows] == [ids[0], ids[0], ids[1], ids[2]]
        assert [r.position for r in rows] == [0, 1, 2, 3]
        assert [r.length_seconds for r in rows] == [301, 301, 302, 303]
        assert all(isinstance(r, SetEntryRow) for r in rows)
        assert [r.entry_id for r in rows] == [int(e.id) for e in repo.entries(gig)]

    def test_one_entry_row(self, repo, sets, gig, ids):
        repo.add(gig, ids[:2])
        second = int(repo.entries(gig)[1].id)
        row = sets.entry_row(second)
        assert row is not None
        assert (row.position, row.track_id, row.length_seconds) == (1, ids[1], 302)
        assert row.plan.chapter_id == repo.chapters(gig)[0].id

    def test_a_collections_entry_is_not_a_sets(self, repo, sets, ids):
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        repo.add(crate, ids[:1])
        assert sets.entry_row(int(repo.entries(crate)[0].id)) is None
        assert sets.entry_rows(crate) == []
        assert sets.entry_row(999_999) is None

    @pytest.mark.parametrize("stored", [None, 0])
    def test_an_unknown_length_reads_as_none(self, db, repo, sets, gig, ids, stored):
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET duration_seconds = ? WHERE id = ?", (stored, ids[0])
            )
        repo.add(gig, ids[:1])
        assert sets.entry_rows(gig)[0].length_seconds is None

    def test_chapter_count_and_first_entry(self, sets, three):
        gig, entries, chapters = three
        assert sets.chapter_count(gig) == 3
        assert [sets.first_entry_position(c) for c in chapters] == [0, 3, 6]
        empty = sets.insert_chapter(gig, 3, "Encore")
        assert sets.first_entry_position(int(empty.id)) is None
        assert sets.chapter(999_999) is None
        assert sets.chapter(chapters[1]).name == "Peak"


# --------------------------------------------------------------- inserting


@pytest.mark.unit
class TestInsertChapter:
    @pytest.mark.parametrize(
        ("position", "names"),
        [
            (0, ["New", "Warm-up", "Peak", "Close"]),
            (1, ["Warm-up", "New", "Peak", "Close"]),
            (2, ["Warm-up", "Peak", "New", "Close"]),
            (3, ["Warm-up", "Peak", "Close", "New"]),
            (99, ["Warm-up", "Peak", "Close", "New"]),
            (-5, ["New", "Warm-up", "Peak", "Close"]),
        ],
    )
    def test_at_every_place(self, db, repo, sets, three, position, names):
        gig, entries, _ = three
        before = layout(db, gig)
        made = sets.insert_chapter(gig, position, "New")
        assert chapter_names(repo, gig) == names
        assert made.name == "New" and made.position == names.index("New")
        assert made.collection_id == gig
        assert layout(db, gig) == before, "no entry moved"
        assert sets.first_entry_position(int(made.id)) is None
        assert_whole(db, gig)

    def test_the_name_is_trimmed_and_may_be_empty(self, repo, sets, gig):
        assert sets.insert_chapter(gig, 1, "  Peak  ").name == "Peak"
        assert sets.insert_chapter(gig, 2).name == ""
        assert len(repo.chapters(gig)) == 3

    def test_a_name_too_long_writes_nothing(self, db, sets, gig):
        before = snapshot(db, gig)
        with pytest.raises(ValueError, match="at most 120"):
            sets.insert_chapter(gig, 0, "x" * 121)
        assert snapshot(db, gig) == before


# ---------------------------------------------------------------- updating


@pytest.mark.unit
class TestUpdateChapter:
    def test_it_writes_every_field_but_the_place(self, db, repo, sets, three):
        gig, _, chapters = three
        peak = sets.chapter(chapters[1])
        peak.name = "Peak time"
        peak.notes = "Keep it rolling"
        peak.target_seconds = 2400
        peak.bpm_min = 124.0
        peak.bpm_max = 128.0
        peak.position = 0  # not written: a chapter moves with its entries
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_chapters SET updated_at = ? WHERE id = ?", (NOW, peak.id)
            )
        stored = sets.update_chapter(peak)
        assert stored is not None
        assert (stored.name, stored.notes, stored.target_seconds) == (
            "Peak time",
            "Keep it rolling",
            2400,
        )
        assert (stored.bpm_min, stored.bpm_max, stored.position) == (124.0, 128.0, 1)
        assert stored.updated_at != NOW
        assert chapter_names(repo, gig) == ["Warm-up", "Peak time", "Close"]

    def test_clearing(self, sets, three):
        _, _, chapters = three
        peak = sets.chapter(chapters[1])
        peak.target_seconds, peak.bpm_min, peak.notes = 600, 120.0, "x"
        sets.update_chapter(peak)
        peak.target_seconds = peak.bpm_min = peak.notes = None
        stored = sets.update_chapter(peak)
        assert (stored.target_seconds, stored.bpm_min, stored.notes) == (None,) * 3

    def test_a_chapter_that_is_not_there(self, sets, gig):
        assert sets.update_chapter(SetChapter(collection_id=gig, id=999_999)) is None
        with pytest.raises(ValueError, match="stored"):
            sets.update_chapter(SetChapter(collection_id=gig))


# ---------------------------------------------------------------- deleting


@pytest.mark.unit
class TestDeleteChapter:
    def test_a_middle_chapter_joins_the_one_before(self, db, repo, sets, three):
        gig, entries, chapters = three
        assert sets.delete_chapter(chapters[1]) == (chapters[0], 3)
        assert chapter_names(repo, gig) == ["Warm-up", "Close"]
        assert [name for _, name in layout(db, gig)] == ["Warm-up"] * 6 + ["Close"] * 3
        assert [e for e, _ in layout(db, gig)] == entries, "no entry moved"
        assert [c.position for c in repo.chapters(gig)] == [0, 1]
        assert_whole(db, gig)

    def test_the_first_chapter_joins_the_one_after(self, db, repo, sets, three):
        gig, entries, chapters = three
        assert sets.delete_chapter(chapters[0]) == (chapters[1], 3)
        assert chapter_names(repo, gig) == ["Peak", "Close"]
        assert [name for _, name in layout(db, gig)] == ["Peak"] * 6 + ["Close"] * 3
        assert [c.position for c in repo.chapters(gig)] == [0, 1]
        assert_whole(db, gig)

    def test_the_last_placed_chapter_joins_the_one_before(self, db, repo, sets, three):
        gig, _, chapters = three
        assert sets.delete_chapter(chapters[2]) == (chapters[1], 3)
        assert [name for _, name in layout(db, gig)] == ["Warm-up"] * 3 + ["Peak"] * 6
        assert_whole(db, gig)

    def test_an_empty_chapter_moves_nothing(self, db, repo, sets, three):
        gig, _, chapters = three
        before = layout(db, gig)
        empty = sets.insert_chapter(gig, 1, "Interlude")
        assert sets.delete_chapter(int(empty.id)) == (chapters[0], 0)
        assert layout(db, gig) == before
        assert chapter_names(repo, gig) == ["Warm-up", "Peak", "Close"]

    def test_the_joined_chapter_is_touched_only_when_it_gains_entries(
        self, db, sets, three
    ):
        gig, _, chapters = three
        with db.transaction() as conn:
            conn.execute("UPDATE set_chapters SET updated_at = ?", (NOW,))
        empty = sets.insert_chapter(gig, 1)
        sets.delete_chapter(int(empty.id))
        assert sets.chapter(chapters[0]).updated_at == NOW
        sets.delete_chapter(chapters[1])
        assert sets.chapter(chapters[0]).updated_at != NOW

    def test_plans_and_acknowledgements_stay_with_their_entries(self, db, sets, three):
        gig, entries, chapters = three
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET in_seconds = 10, out_seconds = 200,"
                " note = 'mix out early' WHERE entry_id = ?",
                (entries[4],),
            )
            conn.execute(
                "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
                " to_entry_id, warning, compared_json, created_at)"
                " VALUES (?, ?, ?, 'key_clash', '{}', ?)",
                (gig, entries[2], entries[3], NOW),
            )
        sets.delete_chapter(chapters[1])
        assert plans(db, gig)[entries[4]] == (10, 200, "mix out early")
        assert len(CollectionRepository(db).acknowledgements(gig)) == 1

    def test_the_only_chapter_is_refused_and_nothing_changes(
        self, db, repo, sets, gig, ids
    ):
        repo.add(gig, ids[:3])
        only = int(repo.chapters(gig)[0].id)
        before = snapshot(db, gig)
        with pytest.raises(SetIntegrityError, match="only chapter"):
            sets.delete_chapter(only)
        assert snapshot(db, gig) == before

    def test_a_chapter_that_is_not_there(self, sets, gig):
        assert sets.delete_chapter(999_999) is None

    def test_another_sets_chapters_are_untouched(self, db, repo, sets, three, ids):
        gig, _, chapters = three
        other = make_set(repo, "Saturday")
        repo.add(other, ids[:2])
        sets.insert_chapter(other, 1, "Late")
        before = snapshot(db, other)
        sets.delete_chapter(chapters[0])
        assert snapshot(db, other) == before


# --------------------------------------------------------------- splitting


@pytest.mark.unit
class TestSplitChapter:
    def test_in_the_middle(self, db, repo, sets, gig, ids):
        repo.add(gig, ids[:6])
        entries = [int(e.id) for e in repo.entries(gig)]
        made = sets.split_chapter(entries[2], "Peak")
        assert made is not None and made.name == "Peak" and made.position == 1
        assert [name for _, name in layout(db, gig)] == [""] * 2 + ["Peak"] * 4
        assert [e for e, _ in layout(db, gig)] == entries, "no entry moved"
        assert_whole(db, gig)

    def test_at_the_last_entry(self, db, repo, sets, gig, ids):
        repo.add(gig, ids[:4])
        entries = [int(e.id) for e in repo.entries(gig)]
        sets.split_chapter(entries[3], "Encore")
        assert [name for _, name in layout(db, gig)] == ["", "", "", "Encore"]
        assert_whole(db, gig)

    def test_the_new_chapter_goes_straight_after_its_chapter(
        self, db, repo, sets, three
    ):
        gig, entries, _ = three
        sets.split_chapter(entries[4], "Peak 2")
        assert chapter_names(repo, gig) == ["Warm-up", "Peak", "Peak 2", "Close"]
        assert [name for _, name in layout(db, gig)] == (
            ["Warm-up"] * 3 + ["Peak"] + ["Peak 2"] * 2 + ["Close"] * 3
        )
        assert [c.position for c in repo.chapters(gig)] == [0, 1, 2, 3]
        assert_whole(db, gig)

    def test_splitting_the_last_chapter(self, db, repo, sets, three):
        gig, entries, _ = three
        sets.split_chapter(entries[8], "Outro")
        assert chapter_names(repo, gig) == ["Warm-up", "Peak", "Close", "Outro"]
        assert layout(db, gig)[-1][1] == "Outro"
        assert_whole(db, gig)

    def test_the_old_chapter_keeps_its_targets_and_the_new_one_has_none(
        self, sets, three
    ):
        gig, entries, chapters = three
        peak = sets.chapter(chapters[1])
        peak.target_seconds, peak.bpm_min, peak.notes = 1800, 124.0, "hands up"
        sets.update_chapter(peak)
        made = sets.split_chapter(entries[5], "")
        kept = sets.chapter(chapters[1])
        assert (kept.target_seconds, kept.bpm_min, kept.notes) == (
            1800,
            124.0,
            "hands up",
        )
        assert (made.target_seconds, made.bpm_min, made.notes) == (None, None, None)

    def test_repeats_split_by_place_not_by_track(self, db, repo, sets, gig, ids):
        repo.add(gig, ids[:3])
        repo.insert_at(gig, ids[0], 3)  # the first track again, at the end
        entries = [int(e.id) for e in repo.entries(gig)]
        sets.split_chapter(entries[2], "B")
        assert [name for _, name in layout(db, gig)] == ["", "", "B", "B"]

    def test_times_stay_with_their_entries(self, db, sets, three):
        gig, entries, _ = three
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET out_seconds = 120 WHERE entry_id = ?",
                (entries[5],),
            )
        sets.split_chapter(entries[4])
        assert plans(db, gig)[entries[5]] == (None, 120, None)

    def test_a_collections_entry_is_not_split(self, repo, sets, ids):
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        repo.add(crate, ids[:3])
        assert sets.split_chapter(int(repo.entries(crate)[1].id)) is None
        assert sets.split_chapter(999_999) is None

    def test_at_a_chapters_first_entry_the_check_is_not_what_refuses(
        self, db, repo, sets, three
    ):
        """The service refuses this with a reason. Here it leaves an empty
        chapter behind, which is legal, so the check has nothing to catch."""
        gig, entries, _ = three
        sets.split_chapter(entries[3], "Peak again")
        assert chapter_names(repo, gig) == ["Warm-up", "Peak", "Peak again", "Close"]
        assert sets.first_entry_position(int(repo.chapters(gig)[1].id)) is None
        assert_whole(db, gig)


# ----------------------------------------------------------------- moving


@pytest.mark.unit
class TestMoveChapter:
    @pytest.mark.parametrize(
        ("which", "to", "names"),
        [
            (0, 2, ["Peak", "Close", "Warm-up"]),
            (0, 1, ["Peak", "Warm-up", "Close"]),
            (2, 0, ["Close", "Warm-up", "Peak"]),
            (1, 0, ["Peak", "Warm-up", "Close"]),
            (1, 2, ["Warm-up", "Close", "Peak"]),
            (0, 99, ["Peak", "Close", "Warm-up"]),
            (2, -3, ["Close", "Warm-up", "Peak"]),
        ],
    )
    def test_its_entries_move_as_a_block(self, db, repo, three, which, to, names):
        gig, entries, chapters = three
        blocks = {"Warm-up": entries[0:3], "Peak": entries[3:6], "Close": entries[6:9]}
        moved = repo.move_chapter(chapters[which], to)
        assert moved is not None and moved.position == names.index(moved.name)
        assert chapter_names(repo, gig) == names
        expected = [entry for name in names for entry in blocks[name]]
        assert [e for e, _ in layout(db, gig)] == expected
        assert [name for _, name in layout(db, gig)] == [
            n for n in names for _ in "abc"
        ]
        assert_whole(db, gig)

    def test_to_where_it_is_changes_nothing(self, db, repo, three):
        gig, _, chapters = three
        with db.transaction() as conn:
            conn.execute("UPDATE set_chapters SET updated_at = ?", (NOW,))
        before = snapshot(db, gig)
        assert repo.move_chapter(chapters[1], 1).position == 1
        assert snapshot(db, gig) == before

    def test_only_the_moved_chapter_is_touched(self, db, repo, three):
        gig, _, chapters = three
        with db.transaction() as conn:
            conn.execute("UPDATE set_chapters SET updated_at = ?", (NOW,))
        repo.move_chapter(chapters[0], 2)
        stamps = {int(c.id): c.updated_at for c in repo.chapters(gig)}
        assert stamps[chapters[0]] != NOW
        assert stamps[chapters[1]] == stamps[chapters[2]] == NOW

    def test_an_empty_chapter_moves_and_no_entry_does(self, db, repo, sets, three):
        gig, entries, _ = three
        empty = sets.insert_chapter(gig, 3, "Encore")
        repo.move_chapter(int(empty.id), 1)
        assert chapter_names(repo, gig) == ["Warm-up", "Encore", "Peak", "Close"]
        assert [e for e, _ in layout(db, gig)] == entries
        assert_whole(db, gig)

    def test_plans_repeats_and_acknowledgements_go_with_their_entries(
        self, db, repo, sets, gig, ids
    ):
        repo.add(gig, ids[:2])
        repo.insert_at(gig, ids[0], 2)
        repo.add(gig, ids[2:4])
        entries = [int(e.id) for e in repo.entries(gig)]
        sets.split_chapter(entries[3], "B")
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET in_seconds = 5, out_seconds = 65,"
                " note = 'the reprise' WHERE entry_id = ?",
                (entries[2],),
            )
            conn.execute(
                "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
                " to_entry_id, warning, compared_json, created_at)"
                " VALUES (?, ?, ?, 'tempo_jump', '{}', ?)",
                (gig, entries[0], entries[1], NOW),
            )
        repo.move_chapter(int(repo.chapters(gig)[0].id), 1)
        assert [e for e, _ in layout(db, gig)] == entries[3:] + entries[:3]
        assert repo.track_ids(gig) == [ids[2], ids[3], ids[0], ids[1], ids[0]]
        assert plans(db, gig)[entries[2]] == (5, 65, "the reprise")
        assert len(repo.acknowledgements(gig)) == 1
        assert_whole(db, gig)

    def test_another_set_is_untouched(self, db, repo, sets, three, ids):
        gig, _, chapters = three
        other = make_set(repo, "Saturday")
        repo.add(other, ids[:4])
        sets.split_chapter(int(repo.entries(other)[2].id), "Late")
        before = snapshot(db, other)
        repo.move_chapter(chapters[0], 2)
        assert snapshot(db, other) == before

    def test_a_chapter_that_is_not_there(self, repo):
        assert repo.move_chapter(999_999, 0) is None


# ------------------------------------------------------------ entries, notes


@pytest.mark.unit
class TestPlanAndNotes:
    def test_times_and_note_are_written_and_the_chapter_is_not(
        self, db, repo, sets, three
    ):
        gig, entries, chapters = three
        row = sets.entry_row(entries[4])
        plan = SetEntryPlan(
            entry_id=row.entry_id,
            collection_id=gig,
            chapter_id=chapters[0],  # not written
            in_seconds=15,
            out_seconds=240,
            note="loop the break",
        )
        assert sets.update_entry_plan(plan) is True
        assert plans(db, gig)[entries[4]] == (15, 240, "loop the break")
        assert sets.entry_row(entries[4]).plan.chapter_id == chapters[1]

    def test_an_entry_with_no_plan(self, sets, gig):
        plan = SetEntryPlan(entry_id=999_999, collection_id=gig, chapter_id=1)
        assert sets.update_entry_plan(plan) is False

    def test_a_sets_notes(self, db, repo, sets, gig):
        with db.transaction() as conn:
            conn.execute("UPDATE set_details SET updated_at = ?", (NOW,))
        details = sets.set_notes(gig, "Closing set, 3 hours")
        assert details.notes == "Closing set, 3 hours"
        assert details.updated_at != NOW
        assert repo.set_details(gig).notes == "Closing set, 3 hours"
        assert sets.set_notes(gig, None).notes is None

    def test_a_node_that_is_not_a_set_has_no_notes(self, repo, sets):
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        assert sets.set_notes(crate, "x") is None
        assert sets.set_notes(999_999, "x") is None


# ------------------------------------------------------------- the check


@pytest.mark.unit
class TestTheCheck:
    """The check both writers share now also holds chapter numbering."""

    def test_both_writers_use_one_check(self):
        assert CollectionRepository._check_set.__doc__
        from cuepoint.persistence import collection_repository, set_repository

        assert collection_repository.check_set is set_integrity.check_set
        assert set_repository.check_set is set_integrity.check_set

    @pytest.mark.parametrize(
        ("positions", "whole"),
        [
            ((0, 1, 2), True),
            ((0, 1, 3), False),
            ((1, 2, 3), False),
            ((0, 0, 1), False),
            ((0, 2, 2), False),
            ((0, 0, 2), False),
            ((2, 0, 1), True),
        ],
    )
    def test_chapter_numbering(self, db, repo, sets, gig, positions, whole):
        sets.insert_chapter(gig, 1)
        sets.insert_chapter(gig, 2)
        chapter_ids = [int(c.id) for c in repo.chapters(gig)]
        with db.transaction() as conn:
            for chapter_id, position in zip(chapter_ids, positions):
                conn.execute(
                    "UPDATE set_chapters SET position = ? WHERE id = ?",
                    (position, chapter_id),
                )
        conn = db.connect()
        if whole:
            set_integrity.check_set(conn, gig)
            return
        with pytest.raises(SetIntegrityError, match="not numbered 0 to 2"):
            set_integrity.check_set(conn, gig)

    def test_the_database_refuses_a_negative_place(self, db, repo, gig):
        """Why the check reads no lowest place: with none below 0, n distinct
        places whose highest is n - 1 are exactly ``0 … n - 1``."""
        with pytest.raises(sqlite3.IntegrityError, match="position >= 0"):
            with db.transaction() as conn:
                conn.execute(
                    "UPDATE set_chapters SET position = -1 WHERE collection_id = ?",
                    (gig,),
                )

    def test_a_gap_is_caught_at_the_next_write_which_rolls_back(
        self, db, repo, sets, gig, ids
    ):
        sets.insert_chapter(gig, 1, "Peak")
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_chapters SET position = 5 WHERE collection_id = ?"
                " AND name = 'Peak'",
                (gig,),
            )
        with pytest.raises(SetIntegrityError, match="not numbered"):
            repo.add(gig, ids[:1])
        assert repo.entry_count(gig) == 0
        with pytest.raises(SetIntegrityError, match="not numbered"):
            sets.insert_chapter(gig, 0, "Opening")
        assert sets.chapter_count(gig) == 2

    @pytest.mark.parametrize(
        "write",
        ["insert", "delete", "split", "move"],
    )
    def test_every_chapter_write_is_checked(
        self, db, repo, sets, three, write, monkeypatch
    ):
        """Break the check and every write reports it: each one calls it."""
        gig, entries, chapters = three
        calls: List[int] = []

        def spy(conn: sqlite3.Connection, set_id: int) -> None:
            calls.append(set_id)

        from cuepoint.persistence import collection_repository, set_repository

        monkeypatch.setattr(set_repository, "check_set", spy)
        monkeypatch.setattr(collection_repository, "check_set", spy)
        {
            "insert": lambda: sets.insert_chapter(gig, 0),
            "delete": lambda: sets.delete_chapter(chapters[1]),
            "split": lambda: sets.split_chapter(entries[4]),
            "move": lambda: repo.move_chapter(chapters[0], 2),
        }[write]()
        assert calls == [gig]


# -------------------------------------------------------- one writer of entries


_SRC = Path(__file__).resolve().parents[3] / "cuepoint"
_WRITES_ENTRIES = re.compile(
    r"(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+collection_tracks\b",
    re.IGNORECASE,
)


@pytest.mark.unit
def test_only_the_collection_repository_writes_entries():
    """Fact 4 of PREP-02: every write to an entry happens in one file.

    Migrations aside, which built and rebuilt the table. A Set's plan is kept
    whole because this module is the only place an entry is written, so a
    second writer would be a path that forgets to plan one.
    """
    writers = sorted(
        str(path.relative_to(_SRC)).replace("\\", "/")
        for path in _SRC.rglob("*.py")
        if "migrations" not in path.parts
        and _WRITES_ENTRIES.search(path.read_text(encoding="utf-8"))
    )
    assert writers == ["persistence/collection_repository.py"]


@pytest.mark.unit
def test_the_set_repository_reads_entries_and_never_writes_them():
    text = (_SRC / "persistence" / "set_repository.py").read_text(encoding="utf-8")
    assert "collection_tracks" in text
    assert not _WRITES_ENTRIES.search(text)
