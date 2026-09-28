#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's entries through the one writer of ``collection_tracks`` (PREP-02).

A Set (DEC-102) keeps its entries where a Collection does, and every entry must
be in a chapter from the moment it exists, with a chapter's entries together
(DEC-103). ``CollectionRepository`` is the only writer of those rows, so these
tests drive each of its write paths into a Set and read the plan back:

- **Where an entry goes.** Appended into the last chapter; inserted or moved
  into the chapter of the entry before it, or the first at position 0; or into a
  chapter the caller names, which is refused unless the position is inside it
  or at one of its edges.
- **The limit.** A Set holds at most ``MAX_SET_ENTRIES``, and an add past it is
  refused with the numbers and nothing written.
- **What a removal takes.** The plan row and any acknowledgement, by cascade.
- **The copy.** A duplicated Set has its own chapters, entries, plan rows and
  acknowledgements, pointing at each other and not at the original.
- **The check.** A Set left unplanned or out of order by something other than
  this module is refused at its next write, which rolls back.
- **The property.** Random sequences of every write keep every invariant, as
  computed here from the rows rather than trusted from the module's own check.

And the converse: no path writes any of this for a Collection.
"""

from __future__ import annotations

import random
import sqlite3
from typing import Dict, List, Tuple

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SET,
    KIND_SMART,
    Collection,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.set_plan import (
    MAX_SET_ENTRIES,
    SetIntegrityError,
    SetLimitError,
)
from cuepoint.persistence.collection_repository import CollectionRepository
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
def tracks(db):
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="A",
            )
            for i in range(1, 13)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks) -> List[int]:
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, tracks) -> CollectionRepository:
    return CollectionRepository(db)


def make(repo, name, kind=KIND_SET, parent_id=None) -> int:
    rules = '{"match":"all","rules":[]}' if kind == KIND_SMART else None
    node = repo.create(
        Collection(name=name, kind=kind, parent_id=parent_id, rules_json=rules)
    )
    return int(node.id)


@pytest.fixture
def gig(repo) -> int:
    return make(repo, "Friday")


def add_chapter(db, set_id: int, name: str, **values) -> int:
    """Append a chapter at the end, as PREP-03's service will."""
    with db.transaction() as conn:
        row = conn.execute(
            "SELECT count(*) AS n FROM set_chapters WHERE collection_id = ?",
            (set_id,),
        ).fetchone()
        cursor = conn.execute(
            "INSERT INTO set_chapters (collection_id, position, name, notes,"
            " target_seconds, bpm_min, bpm_max, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                set_id,
                int(row["n"]),
                name,
                values.get("notes"),
                values.get("target_seconds"),
                values.get("bpm_min"),
                values.get("bpm_max"),
                NOW,
                NOW,
            ),
        )
        return int(cursor.lastrowid)


def order(db, set_id: int) -> List[Tuple[int, int, int]]:
    """``(entry id, track id, chapter position)`` in the Set's order."""
    rows = db.connect().execute(
        "SELECT ct.id, ct.track_id, ch.position AS chapter"
        " FROM collection_tracks ct"
        " LEFT JOIN set_entries se ON se.entry_id = ct.id"
        " LEFT JOIN set_chapters ch ON ch.id = se.chapter_id"
        " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id",
        (set_id,),
    )
    return [(int(r["id"]), int(r["track_id"]), r["chapter"]) for r in rows]


def chapters_of(db, set_id: int) -> List[int]:
    """The chapter position of each entry, in the Set's order."""
    return [chapter for _, _, chapter in order(db, set_id)]


def assert_whole(db, set_id: int) -> None:
    """DEC-103, computed from the rows rather than from the module's check."""
    rows = (
        db.connect()
        .execute(
            "SELECT ct.id, ct.position, se.entry_id AS planned, se.collection_id AS"
            " plan_set, ch.position AS chapter, ch.collection_id AS chapter_set"
            " FROM collection_tracks ct"
            " LEFT JOIN set_entries se ON se.entry_id = ct.id"
            " LEFT JOIN set_chapters ch ON ch.id = se.chapter_id"
            " WHERE ct.collection_id = ? ORDER BY ct.position, ct.id",
            (set_id,),
        )
        .fetchall()
    )
    assert [int(r["position"]) for r in rows] == list(range(len(rows)))
    assert all(r["planned"] is not None for r in rows), "an entry has no plan"
    assert all(int(r["plan_set"]) == set_id for r in rows)
    assert all(int(r["chapter_set"]) == set_id for r in rows)
    chapters = [int(r["chapter"]) for r in rows]
    assert chapters == sorted(chapters), f"chapters out of order: {chapters}"
    positions = [
        int(r["position"])
        for r in db.connect().execute(
            "SELECT position FROM set_chapters WHERE collection_id = ?"
            " ORDER BY position",
            (set_id,),
        )
    ]
    assert positions and positions == list(range(len(positions)))
    orphans = (
        db.connect()
        .execute(
            "SELECT count(*) AS n FROM set_entries se"
            " WHERE NOT EXISTS (SELECT 1 FROM collection_tracks ct"
            "  WHERE ct.id = se.entry_id)"
        )
        .fetchone()
    )
    assert int(orphans["n"]) == 0


def count(db, table: str, **where) -> int:
    clause = " AND ".join(f"{key} = ?" for key in where) or "1"
    row = (
        db.connect()
        .execute(
            f"SELECT count(*) AS n FROM {table} WHERE {clause}", tuple(where.values())
        )
        .fetchone()
    )
    return int(row["n"])


def acknowledge(db, set_id, from_entry, to_entry, warning="tempo_jump") -> int:
    with db.transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (set_id, from_entry, to_entry, warning, '{"bpm":[120,128]}', NOW),
        )
        return int(cursor.lastrowid)


# ----------------------------------------------------------------- creation


@pytest.mark.unit
class TestCreatingASet:
    def test_a_new_set_has_details_and_one_unnamed_chapter(self, repo, db, gig):
        details = repo.set_details(gig)
        assert details is not None and details.collection_id == gig
        assert details.notes is None
        chapters = repo.chapters(gig)
        assert len(chapters) == 1
        assert chapters[0].position == 0
        assert chapters[0].is_unnamed
        assert not chapters[0].has_bpm_range
        assert chapters[0].target_seconds is None

    def test_the_node_is_a_set_that_holds_tracks(self, repo, gig):
        node = repo.get(gig)
        assert node.kind == KIND_SET
        assert node.is_set and node.holds_tracks
        assert not node.is_folder and not node.is_smart

    @pytest.mark.parametrize("kind", [KIND_FOLDER, KIND_COLLECTION, KIND_SMART])
    def test_no_other_kind_gets_set_rows(self, repo, db, kind):
        node = make(repo, "Other", kind)
        assert repo.set_details(node) is None
        assert repo.chapters(node) == []
        assert count(db, "set_details") == 0
        assert count(db, "set_chapters") == 0

    def test_it_is_one_transaction(self, repo, db, monkeypatch):
        """A Set whose chapter could not be written does not exist at all."""

        def refuse(conn, set_id, notes, now):
            raise sqlite3.OperationalError("disk full")

        monkeypatch.setattr(
            CollectionRepository, "_insert_details", staticmethod(refuse)
        )
        with pytest.raises(sqlite3.OperationalError):
            make(repo, "Doomed")
        assert count(db, "collections") == 0

    def test_a_set_is_filed_in_a_folder(self, repo, db):
        folder = make(repo, "Gigs", KIND_FOLDER)
        crate = make(repo, "Crate", KIND_COLLECTION, folder)
        child = make(repo, "Friday", KIND_SET, folder)
        node = repo.get(child)
        assert (node.parent_id, node.depth, node.position) == (folder, 1, 1)
        assert [n.id for n in repo.children_of(folder)] == [crate, child]


@pytest.mark.unit
class TestTheDeletePreview:
    def test_sets_are_counted_as_their_own_kind(self, repo, ids):
        folder = make(repo, "Gigs", KIND_FOLDER)
        crate = make(repo, "Crate", KIND_COLLECTION, folder)
        first = make(repo, "Friday", KIND_SET, folder)
        make(repo, "Saturday", KIND_SET, folder)
        repo.add(crate, ids[:2])
        repo.add(first, ids[:3])

        summary = repo.subtree_summary(folder)
        assert (summary.folders, summary.collections, summary.sets) == (1, 1, 2)
        assert summary.smart_collections == 0
        assert summary.entries == 5
        assert summary.nodes == 4

    def test_a_lone_set_is_one_node(self, repo, gig, ids):
        repo.add(gig, ids[:2])
        summary = repo.subtree_summary(gig)
        assert (summary.sets, summary.nodes, summary.entries) == (1, 1, 2)
        assert not summary.is_empty


# ------------------------------------------------------------------ writing


@pytest.mark.unit
class TestAppending:
    def test_added_entries_join_the_last_chapter(self, repo, db, gig, ids):
        repo.add(gig, ids[:2])
        add_chapter(db, gig, "Peak")
        repo.add(gig, ids[2:4])
        assert chapters_of(db, gig) == [0, 0, 1, 1]
        assert_whole(db, gig)

    def test_add_skips_tracks_already_in_the_set(self, repo, db, gig, ids):
        repo.add(gig, ids[:2])
        result = repo.add(gig, [ids[1], ids[2]])
        assert result.added_track_ids == (ids[2],)
        assert result.skipped_track_ids == (ids[1],)
        assert [track for _, track, _ in order(db, gig)] == ids[:3]
        assert_whole(db, gig)

    def test_append_keeps_repeats_and_order(self, repo, db, gig, ids):
        result = repo.append(gig, [ids[2], ids[0], ids[2]])
        assert result.added_track_ids == (ids[2], ids[0], ids[2])
        assert [track for _, track, _ in order(db, gig)] == [ids[2], ids[0], ids[2]]
        assert_whole(db, gig)

    def test_append_of_nothing_writes_nothing(self, repo, db, gig):
        assert repo.append(gig, []).added == 0
        assert count(db, "collection_tracks") == 0

    def test_new_plans_start_untimed_and_without_a_note(self, repo, gig, ids):
        repo.add(gig, ids[:1])
        (plan,) = repo.entry_plans(gig)
        assert (plan.in_seconds, plan.out_seconds, plan.note) == (None, None, None)
        assert not plan.is_timed


@pytest.mark.unit
class TestTheLimit:
    @pytest.fixture
    def many(self, db, tracks) -> List[int]:
        tracks.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=f"x{i}",
                    file_path=f"/m/x{i}.mp3",
                    title=f"X{i}",
                    artist="A",
                )
                for i in range(MAX_SET_ENTRIES + 1)
            ]
        )
        rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
        return [int(row["id"]) for row in rows]

    def test_a_set_takes_exactly_the_limit(self, repo, db, gig, many):
        repo.add(gig, many[:MAX_SET_ENTRIES])
        assert repo.entry_count(gig) == MAX_SET_ENTRIES
        assert_whole(db, gig)

    def test_one_past_the_limit_is_refused_and_nothing_is_written(
        self, repo, db, gig, many
    ):
        with pytest.raises(SetLimitError) as caught:
            repo.add(gig, many[: MAX_SET_ENTRIES + 1])
        assert caught.value.holding == 0
        assert caught.value.adding == MAX_SET_ENTRIES + 1
        assert "'Friday' holds 0 entries" in str(caught.value)
        assert "1,001" in str(caught.value) and "1,000" in str(caught.value)
        assert count(db, "collection_tracks") == 0
        assert count(db, "set_entries") == 0

    def test_a_full_set_refuses_one_more_by_every_path(self, repo, db, gig, many):
        repo.add(gig, many[:MAX_SET_ENTRIES])
        with pytest.raises(SetLimitError, match="holds 1,000 entries"):
            repo.add(gig, [many[-1]])
        with pytest.raises(SetLimitError):
            repo.append(gig, [many[0]])
        with pytest.raises(SetLimitError):
            repo.insert_at(gig, many[0], 3)
        assert repo.entry_count(gig) == MAX_SET_ENTRIES
        assert_whole(db, gig)

    def test_only_tracks_that_would_be_added_count(self, repo, db, gig, many):
        repo.add(gig, many[:MAX_SET_ENTRIES])
        result = repo.add(gig, many[:10])
        assert result.added == 0 and result.skipped == 10

    def test_a_collection_has_no_limit(self, repo, db, many):
        crate = make(repo, "Crate", KIND_COLLECTION)
        repo.add(crate, many)
        assert repo.entry_count(crate) == len(many) > MAX_SET_ENTRIES


@pytest.mark.unit
class TestInserting:
    @pytest.fixture
    def split(self, repo, db, gig, ids) -> Dict[str, int]:
        """Two chapters: [t0, t1] in chapter 0, [t2, t3] in chapter 1."""
        repo.add(gig, ids[:2])
        peak = add_chapter(db, gig, "Peak")
        repo.add(gig, ids[2:4])
        return {"opening": repo.chapters(gig)[0].id, "peak": peak}

    def test_at_the_top_into_the_first_chapter(self, repo, db, gig, ids, split):
        repo.insert_at(gig, ids[5], 0)
        assert chapters_of(db, gig) == [0, 0, 0, 1, 1]
        assert_whole(db, gig)

    def test_in_the_middle_into_the_chapter_before(self, repo, db, gig, ids, split):
        repo.insert_at(gig, ids[5], 3)
        assert chapters_of(db, gig) == [0, 0, 1, 1, 1]

    def test_at_a_boundary_into_the_chapter_before(self, repo, db, gig, ids, split):
        entry = repo.insert_at(gig, ids[5], 2)
        assert entry.position == 2
        assert chapters_of(db, gig) == [0, 0, 0, 1, 1]

    def test_at_a_boundary_into_a_named_later_chapter(self, repo, db, gig, ids, split):
        repo.insert_at(gig, ids[5], 2, split["peak"])
        assert chapters_of(db, gig) == [0, 0, 1, 1, 1]
        assert_whole(db, gig)

    def test_at_the_end_into_the_last_chapter(self, repo, db, gig, ids, split):
        repo.insert_at(gig, ids[5], 99)
        assert chapters_of(db, gig) == [0, 0, 1, 1, 1]

    def test_a_repeat_is_planned_on_its_own(self, repo, db, gig, ids, split):
        repo.insert_at(gig, ids[0], 4)
        rows = order(db, gig)
        assert [track for _, track, _ in rows] == [
            ids[0],
            ids[1],
            ids[2],
            ids[3],
            ids[0],
        ]
        assert len({entry for entry, _, _ in rows}) == 5
        assert count(db, "set_entries", collection_id=gig) == 5

    def test_a_named_chapter_that_does_not_reach_is_refused(
        self, repo, db, gig, ids, split
    ):
        before = order(db, gig)
        with pytest.raises(ValueError, match="'Peak' does not reach position 1"):
            repo.insert_at(gig, ids[5], 0, split["peak"])
        with pytest.raises(ValueError, match="chapter 1 does not reach position 4"):
            repo.insert_at(gig, ids[5], 3, split["opening"])
        assert order(db, gig) == before

    def test_another_sets_chapter_is_refused(self, repo, db, gig, ids, split):
        other = make(repo, "Saturday")
        foreign = repo.chapters(other)[0].id
        with pytest.raises(ValueError, match="not a chapter of this Set"):
            repo.insert_at(gig, ids[5], 0, foreign)
        assert len(order(db, gig)) == 4

    def test_a_chapter_for_a_collection_is_refused(self, repo, db, ids, split):
        crate = make(repo, "Crate", KIND_COLLECTION)
        with pytest.raises(ValueError, match="Only an entry in a Set"):
            repo.insert_at(crate, ids[0], 0, split["peak"])
        assert repo.entry_count(crate) == 0

    def test_into_an_empty_set(self, repo, db, gig, ids):
        repo.insert_at(gig, ids[0], 5)
        assert chapters_of(db, gig) == [0]
        assert_whole(db, gig)

    def test_into_an_empty_chapter_by_name(self, repo, db, gig, ids):
        """A new chapter at the end holds nothing until something is put in it."""
        repo.add(gig, ids[:2])
        closing = add_chapter(db, gig, "Closing")
        repo.insert_at(gig, ids[5], 2, closing)
        assert chapters_of(db, gig) == [0, 0, 1]


@pytest.mark.unit
class TestMoving:
    @pytest.fixture
    def split(self, repo, db, gig, ids) -> Dict[str, int]:
        """[t0, t1, t2] in chapter 0, [t3, t4, t5] in chapter 1."""
        repo.add(gig, ids[:3])
        peak = add_chapter(db, gig, "Peak")
        repo.add(gig, ids[3:6])
        return {"opening": repo.chapters(gig)[0].id, "peak": peak}

    def entry_at(self, db, gig, position) -> int:
        return order(db, gig)[position][0]

    def test_within_a_chapter_keeps_the_chapter(self, repo, db, gig, split):
        repo.reorder_entry(self.entry_at(db, gig, 5), 4)
        assert chapters_of(db, gig) == [0, 0, 0, 1, 1, 1]

    def test_to_the_first_place_of_its_chapter_keeps_the_chapter(
        self, repo, db, gig, split
    ):
        """The regression the first rule had: "the entry before decides" put an
        entry reordered to the top of its own chapter into the chapter before.
        """
        moved = self.entry_at(db, gig, 4)
        repo.reorder_entry(moved, 3)
        assert chapters_of(db, gig) == [0, 0, 0, 1, 1, 1]
        assert order(db, gig)[3][0] == moved
        assert_whole(db, gig)

    def test_to_the_last_place_of_its_chapter_keeps_the_chapter(
        self, repo, db, gig, split
    ):
        moved = self.entry_at(db, gig, 0)
        repo.reorder_entry(moved, 2)
        assert chapters_of(db, gig) == [0, 0, 0, 1, 1, 1]
        assert order(db, gig)[2][0] == moved

    def test_out_of_its_chapter_joins_the_chapter_it_lands_in(
        self, repo, db, gig, split
    ):
        moved = self.entry_at(db, gig, 3)
        repo.reorder_entry(moved, 1)
        assert chapters_of(db, gig) == [0, 0, 0, 0, 1, 1]
        assert order(db, gig)[1][0] == moved

    def test_down_into_a_later_chapter_follows_the_entry_before(
        self, repo, db, gig, split
    ):
        moved = self.entry_at(db, gig, 0)
        repo.reorder_entry(moved, 4)
        assert chapters_of(db, gig) == [0, 0, 1, 1, 1, 1]
        assert order(db, gig)[4][0] == moved
        assert_whole(db, gig)

    def test_to_the_top_goes_into_the_first_chapter(self, repo, db, gig, split):
        moved = self.entry_at(db, gig, 5)
        repo.reorder_entry(moved, 0)
        assert chapters_of(db, gig) == [0, 0, 0, 0, 1, 1]
        assert order(db, gig)[0][0] == moved

    def test_up_across_a_boundary_joins_the_earlier_chapter(self, repo, db, gig, split):
        repo.reorder_entry(self.entry_at(db, gig, 4), 3)
        repo.reorder_entry(self.entry_at(db, gig, 3), 3, split["opening"])
        assert chapters_of(db, gig) == [0, 0, 0, 0, 1, 1]

    def test_naming_a_chapter_in_place_crosses_the_boundary(self, repo, db, gig, split):
        last_of_opening = self.entry_at(db, gig, 2)
        entry = repo.reorder_entry(last_of_opening, 2, split["peak"])
        assert entry.position == 2
        assert chapters_of(db, gig) == [0, 0, 1, 1, 1, 1]

    def test_a_move_in_place_without_a_chapter_changes_nothing(
        self, repo, db, gig, split
    ):
        before = order(db, gig)
        repo.reorder_entry(self.entry_at(db, gig, 3), 3)
        assert order(db, gig) == before

    def test_a_named_chapter_that_does_not_reach_rolls_the_move_back(
        self, repo, db, gig, split
    ):
        before = order(db, gig)
        with pytest.raises(ValueError, match="'Peak' does not reach position 2"):
            repo.reorder_entry(self.entry_at(db, gig, 5), 1, split["peak"])
        assert order(db, gig) == before

    def test_a_chapter_for_a_collection_entry_is_refused(self, repo, db, ids, split):
        crate = make(repo, "Crate", KIND_COLLECTION)
        repo.add(crate, ids[:2])
        entry = repo.entries(crate)[0]
        with pytest.raises(ValueError, match="Only an entry in a Set"):
            repo.reorder_entry(entry.id, 1, split["peak"])
        assert [e.id for e in repo.entries(crate)][0] == entry.id

    def test_a_missing_entry_is_none(self, repo):
        assert repo.reorder_entry(987654, 0) is None


@pytest.mark.unit
class TestRemoving:
    def test_the_plan_and_acknowledgements_go_with_the_entry(self, repo, db, gig, ids):
        repo.add(gig, ids[:3])
        first, second, third = [entry for entry, _, _ in order(db, gig)]
        acknowledge(db, gig, first, second)
        acknowledge(db, gig, second, third)

        assert repo.remove_entries([second]) == 1
        assert count(db, "set_entries", collection_id=gig) == 2
        assert count(db, "set_acknowledgements") == 0
        assert_whole(db, gig)

    def test_removing_a_whole_chapter_leaves_it_empty(self, repo, db, gig, ids):
        repo.add(gig, ids[:2])
        add_chapter(db, gig, "Peak")
        repo.add(gig, ids[2:4])
        doomed = [entry for entry, _, chapter in order(db, gig) if chapter == 1]
        repo.remove_entries(doomed)
        assert chapters_of(db, gig) == [0, 0]
        assert len(repo.chapters(gig)) == 2

    def test_clearing_a_set_keeps_its_chapters(self, repo, db, gig, ids):
        repo.add(gig, ids[:4])
        add_chapter(db, gig, "Peak")
        assert repo.clear(gig) == 4
        assert count(db, "set_entries") == 0
        assert len(repo.chapters(gig)) == 2
        repo.add(gig, ids[:1])
        assert chapters_of(db, gig) == [1]

    def test_deleting_a_set_takes_everything_of_it_and_no_track(
        self, repo, db, gig, ids
    ):
        repo.add(gig, ids[:3])
        first, second, _ = [entry for entry, _, _ in order(db, gig)]
        acknowledge(db, gig, first, second)
        assert repo.delete(gig)
        for table in (
            "collections",
            "collection_tracks",
            "set_details",
            "set_chapters",
            "set_entries",
            "set_acknowledgements",
        ):
            assert count(db, table) == 0, table
        assert count(db, "tracks") == 12


# ---------------------------------------------------------------- duplicate


@pytest.mark.unit
class TestDuplicating:
    @pytest.fixture
    def planned(self, repo, db, gig, ids) -> int:
        """Two chapters with targets, a repeat, times, notes and two acks."""
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_details SET notes = 'Warehouse' WHERE collection_id = ?",
                (gig,),
            )
            conn.execute(
                "UPDATE set_chapters SET name = 'Warm-up', target_seconds = 1800,"
                " bpm_min = 118, bpm_max = 122 WHERE collection_id = ?",
                (gig,),
            )
        repo.append(gig, [ids[0], ids[1]])
        add_chapter(db, gig, "Peak", notes="Big room", target_seconds=2400, bpm_min=126)
        repo.append(gig, [ids[2], ids[0]])
        entries = [entry for entry, _, _ in order(db, gig)]
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET in_seconds = 15, out_seconds = 300,"
                " note = 'long blend' WHERE entry_id = ?",
                (entries[1],),
            )
            conn.execute(
                "UPDATE set_entries SET out_seconds = 240 WHERE entry_id = ?",
                (entries[3],),
            )
        acknowledge(db, gig, entries[1], entries[2], "tempo_jump")
        acknowledge(db, gig, entries[2], entries[3], "key_clash")
        return gig

    def test_the_copy_is_a_set_beside_the_original(self, repo, planned):
        folder_less = repo.get(planned)
        copy = repo.duplicate_set(planned, "Friday again")
        assert copy.kind == KIND_SET and copy.name == "Friday again"
        assert copy.parent_id == folder_less.parent_id
        assert copy.position == folder_less.position + 1
        assert repo.set_details(copy.id).notes == "Warehouse"

    def test_chapters_and_their_targets_are_copied(self, repo, planned):
        copy = repo.duplicate_set(planned, "Copy")
        original = repo.chapters(planned)
        copied = repo.chapters(copy.id)
        assert [
            (c.position, c.name, c.notes, c.target_seconds, c.bpm_min, c.bpm_max)
            for c in copied
        ] == [
            (c.position, c.name, c.notes, c.target_seconds, c.bpm_min, c.bpm_max)
            for c in original
        ]
        assert {c.id for c in copied}.isdisjoint({c.id for c in original})
        assert all(c.collection_id == copy.id for c in copied)

    def test_entries_repeats_times_and_notes_are_copied(self, repo, db, planned, ids):
        copy = repo.duplicate_set(planned, "Copy")
        assert [t for _, t, _ in order(db, copy.id)] == [ids[0], ids[1], ids[2], ids[0]]
        assert chapters_of(db, copy.id) == chapters_of(db, planned)
        assert [
            (p.in_seconds, p.out_seconds, p.note) for p in repo.entry_plans(copy.id)
        ] == [(p.in_seconds, p.out_seconds, p.note) for p in repo.entry_plans(planned)]
        assert_whole(db, copy.id)

    def test_acknowledgements_point_at_the_new_entries(self, repo, db, planned):
        copy = repo.duplicate_set(planned, "Copy")
        new_entries = [entry for entry, _, _ in order(db, copy.id)]
        acks = repo.acknowledgements(copy.id)
        assert [(a.from_entry_id, a.to_entry_id, a.warning) for a in acks] == [
            (new_entries[1], new_entries[2], "tempo_jump"),
            (new_entries[2], new_entries[3], "key_clash"),
        ]
        assert all(a.collection_id == copy.id for a in acks)
        assert [a.compared for a in acks] == [{"bpm": [120, 128]}] * 2
        assert [a.created_at for a in acks] == [NOW, NOW]

    def test_the_original_is_untouched_and_the_two_are_independent(
        self, repo, db, planned
    ):
        before = (order(db, planned), repo.acknowledgements(planned))
        copy = repo.duplicate_set(planned, "Copy")
        assert (order(db, planned), repo.acknowledgements(planned)) == before
        repo.delete(copy.id)
        assert (order(db, planned), repo.acknowledgements(planned)) == before
        assert_whole(db, planned)

    def test_the_copy_is_contiguous(self, repo, db, planned):
        copy = repo.duplicate_set(planned, "Copy")
        positions = [e.position for e in repo.entries(copy.id)]
        assert positions == [0, 1, 2, 3]

    def test_an_empty_set_copies_its_chapters(self, repo, db, gig):
        add_chapter(db, gig, "Peak")
        copy = repo.duplicate_set(gig, "Copy")
        assert [c.name for c in repo.chapters(copy.id)] == ["", "Peak"]
        assert repo.entry_count(copy.id) == 0

    @pytest.mark.parametrize("kind", [KIND_FOLDER, KIND_COLLECTION])
    def test_only_a_set_is_duplicated_here(self, repo, db, kind):
        node = make(repo, "Other", kind)
        assert repo.duplicate_set(node, "Copy") is None
        assert repo.duplicate_set(987654, "Copy") is None
        assert count(db, "collections") == 1


# -------------------------------------------------------------- references


@pytest.mark.unit
class TestReferencesByKind:
    def test_sets_and_collections_are_counted_apart(self, repo, gig, ids):
        crate = make(repo, "Crate", KIND_COLLECTION)
        repo.add(crate, ids[:2])
        repo.append(gig, [ids[1], ids[2], ids[1]])

        assert repo.references_for(ids[:4]) == ([crate], ids[:2])
        assert repo.references_for(ids[:4], KIND_COLLECTION) == ([crate], ids[:2])
        assert repo.references_for(ids[:4], KIND_SET) == ([gig], [ids[1], ids[2]])

    def test_a_kind_with_no_entries_answers_nothing(self, repo, gig, ids):
        repo.add(gig, ids[:2])
        assert repo.references_for(ids, KIND_SMART) == ([], [])
        assert repo.references_for(ids, KIND_COLLECTION) == ([], [])


# ------------------------------------------------------------------ checks


@pytest.mark.unit
class TestTheCheckAfterEveryWrite:
    """A Set broken by something other than this module refuses its next write."""

    def test_an_unplanned_entry_is_caught_and_the_write_rolls_back(
        self, repo, db, gig, ids
    ):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO collection_tracks (collection_id, track_id, position,"
                " added_at) VALUES (?, ?, 0, ?)",
                (gig, ids[0], NOW),
            )
        with pytest.raises(SetIntegrityError, match="1 entries of Set .* no chapter"):
            repo.insert_at(gig, ids[1], 1)
        assert repo.entry_count(gig) == 1

    def test_chapters_out_of_order_are_caught(self, repo, db, gig, ids):
        repo.add(gig, ids[:2])
        peak = add_chapter(db, gig, "Peak")
        first = order(db, gig)[0][0]
        with db.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET chapter_id = ? WHERE entry_id = ?",
                (peak, first),
            )
        with pytest.raises(SetIntegrityError, match="out of order"):
            repo.add(gig, [ids[5]])
        assert repo.entry_count(gig) == 2

    def test_a_set_with_no_chapter_is_caught(self, repo, db, gig, ids):
        with db.transaction() as conn:
            conn.execute("DELETE FROM set_chapters WHERE collection_id = ?", (gig,))
        with pytest.raises(SetIntegrityError, match="no chapter"):
            repo.add(gig, ids[:1])
        with pytest.raises(SetIntegrityError, match="no chapter"):
            repo.insert_at(gig, ids[0], 0)
        assert repo.entry_count(gig) == 0

    def test_it_is_not_a_value_error(self):
        """A user can cause a ValueError; only a bug causes this."""
        assert not issubclass(SetIntegrityError, ValueError)
        assert issubclass(SetLimitError, ValueError)


@pytest.mark.unit
class TestCollectionsAreUntouched:
    """Every write path, into a Collection, writes no Set row."""

    def test_no_path_plans_a_collection(self, repo, db, ids):
        crate = make(repo, "Crate", KIND_COLLECTION)
        repo.add(crate, ids[:3])
        repo.append(crate, [ids[0]])
        repo.insert_at(crate, ids[4], 1)
        entry = repo.entries(crate)[0]
        repo.reorder_entry(entry.id, 3)
        repo.remove_entries([repo.entries(crate)[1].id])
        assert repo.track_ids(crate) == [ids[4], ids[2], ids[0], ids[0]]
        for table in ("set_details", "set_chapters", "set_entries"):
            assert count(db, table) == 0, table


# ---------------------------------------------------------------- property


EDITS = st.lists(
    st.tuples(
        st.sampled_from(
            [
                "add",
                "append",
                "insert",
                "insert_named",
                "move",
                "move_named",
                "remove",
                "chapter",
            ]
        ),
        st.integers(min_value=0, max_value=40),
        st.integers(min_value=0, max_value=40),
    ),
    min_size=1,
    max_size=40,
)


@pytest.mark.unit
class TestRandomEditsKeepEveryInvariant:
    """DEC-103 over any sequence of edits, including refused ones.

    A named chapter is chosen at random, so many named edits are refusals; each
    refusal must leave the Set exactly as it was, and each success must leave
    it whole. PREP-03's chapter operations are stood in for by appending a
    chapter, which is the only chapter write that exists before it.
    """

    @settings(
        max_examples=60,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture],
    )
    @given(edits=EDITS)
    def test_edits(self, repo, db, ids, edits):
        gig = make(repo, "Random")
        for kind, a, b in edits:
            entries = order(db, gig)
            chapters = repo.chapters(gig)
            track = ids[a % len(ids)]
            named = chapters[b % len(chapters)].id
            before = (entries, [c.id for c in chapters])
            try:
                if kind == "add":
                    repo.add(gig, [track, ids[b % len(ids)]])
                elif kind == "append":
                    repo.append(gig, [track, track])
                elif kind == "insert":
                    repo.insert_at(gig, track, b)
                elif kind == "insert_named":
                    repo.insert_at(gig, track, a, named)
                elif kind == "chapter":
                    add_chapter(db, gig, f"C{len(chapters)}")
                elif not entries:
                    continue
                elif kind == "move":
                    repo.reorder_entry(entries[a % len(entries)][0], b)
                elif kind == "move_named":
                    repo.reorder_entry(entries[a % len(entries)][0], b, named)
                elif kind == "remove":
                    repo.remove_entries([entries[a % len(entries)][0]])
            except ValueError:
                assert kind.endswith("_named"), kind
                assert (order(db, gig), [c.id for c in repo.chapters(gig)]) == before
            assert_whole(db, gig)
        repo.delete(gig)


@pytest.mark.unit
class TestTheBoundaryRuleExhaustively:
    """Every insertion point and every chapter, in a Set of three chapters."""

    def test_every_named_insert_is_allowed_exactly_when_it_reaches(self, repo, db, ids):
        rng = random.Random(7)
        for trial in range(5):
            gig = make(repo, f"Trial {trial}")
            sizes = [rng.randint(0, 3) for _ in range(3)]
            chapter_ids = [repo.chapters(gig)[0].id]
            for index, size in enumerate(sizes):
                if index:
                    chapter_ids.append(add_chapter(db, gig, f"C{index}"))
                repo.append(gig, ids[:size])
            layout = chapters_of(db, gig)
            for position in range(len(layout) + 1):
                low = layout[position - 1] if position > 0 else 0
                high = layout[position] if position < len(layout) else 2
                for chapter, chapter_id in enumerate(chapter_ids):
                    allowed = low <= chapter <= high
                    try:
                        entry = repo.insert_at(gig, ids[9], position, chapter_id)
                    except ValueError:
                        assert not allowed, (layout, position, chapter)
                        continue
                    assert allowed, (layout, position, chapter)
                    assert_whole(db, gig)
                    repo.remove_entries([entry.id])
                    assert chapters_of(db, gig) == layout
