#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Editing a Set's chapters, times and notes, and reading its plan (PREP-03).

``SetService`` is DEC-103's chapters and DEC-107's planned times, over the two
repositories a Set is written through. These tests hold:

- **Each chapter operation**, and that it keeps the Set whole: adding one,
  renaming, notes, targets, moving one with its entries, deleting the first, a
  middle and the last-placed chapter, refusing the only one, and starting one
  at an entry, refused at a chapter's first entry.
- **Times**: typed, refused past a known length, accepted when the length is
  unknown, and a repeat planned twice keeping two sets of times.
- **The plan**: running time per chapter and for the Set with untimed entries,
  "starts at" up to the first untimed entry, an empty chapter's start, and the
  wire shape.
- **Refusals write nothing**, and **no edit records anything**: no activity
  event, no track history.
- **A property test**: random sequences of every chapter and entry edit, with
  refusals mixed in, keep every invariant as computed here from the rows.
"""

from __future__ import annotations

from typing import Callable, List, Tuple

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from cuepoint.core.set_timing import MAX_TIME_SECONDS, RunningTime, TimeFormatError
from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SET,
    Collection,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.set_plan import MAX_CHAPTER_NAME_LENGTH, SetChapter
from cuepoint.models.track_metadata import MAX_NOTES_LENGTH
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_service import SetPlan, SetService

LENGTH = 300


def make_db(path) -> DatabaseService:
    service = DatabaseService(db_path=path)
    MigrationRunner(service).migrate()
    TrackRepository(service).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="A",
                duration_seconds=LENGTH,
            )
            for i in range(1, 13)
        ]
    )
    return service


@pytest.fixture
def db(tmp_path):
    service = make_db(tmp_path / "cuepoint.db")
    yield service
    service.close_all()


@pytest.fixture
def ids(db) -> List[int]:
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db) -> CollectionRepository:
    return CollectionRepository(db)


@pytest.fixture
def service(db, repo) -> SetService:
    return SetService(repo, SetRepository(db), db)


def make_set(repo, name="Friday") -> int:
    return int(repo.create(Collection(name=name, kind=KIND_SET)).id)


@pytest.fixture
def gig(repo) -> int:
    return make_set(repo)


@pytest.fixture
def filled(repo, gig, ids) -> Tuple[int, List[int]]:
    """A Set of six entries in its one chapter."""
    repo.add(gig, ids[:6])
    return gig, [int(e.id) for e in repo.entries(gig)]


@pytest.fixture
def three(service, repo, filled) -> Tuple[int, List[int], List[int]]:
    """Six entries in three chapters: 0-1 Warm-up, 2-3 Peak, 4-5 Close."""
    gig, entries = filled
    service.rename_chapter(int(repo.chapters(gig)[0].id), "Warm-up")
    service.split_chapter_at(entries[2], "Peak")
    service.split_chapter_at(entries[4], "Close")
    return gig, entries, [int(c.id) for c in repo.chapters(gig)]


def names(repo, set_id) -> List[str]:
    return [c.name for c in repo.chapters(set_id)]


def layout(service, set_id) -> List[Tuple[int, str]]:
    """``(entry id, chapter name)`` in the Set's order, from the plan."""
    plan = service.plan(set_id)
    by_id = {c.chapter.id: c.chapter.name for c in plan.chapters}
    return [(e.entry_id, by_id[e.chapter_id]) for e in plan.entries]


def assert_whole(db, set_id: int) -> None:
    """DEC-103, computed from the rows rather than from the module's check."""
    rows = (
        db.connect()
        .execute(
            "SELECT ct.position, se.entry_id AS planned, ch.position AS chapter,"
            " ch.collection_id AS chapter_set"
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


def snapshot(db):
    """Every row a Set edit could touch, in every Set."""
    conn = db.connect()
    return tuple(
        [tuple(r) for r in conn.execute(f"SELECT * FROM {table} ORDER BY 1, 2")]
        for table in (
            "collections",
            "collection_tracks",
            "set_details",
            "set_chapters",
            "set_entries",
            "set_acknowledgements",
        )
    )


def refused(db, action: Callable[[], object], match: str) -> None:
    """The action is refused with a message matching ``match``, writing nothing."""
    before = snapshot(db)
    with pytest.raises(ValueError, match=match):
        action()
    assert snapshot(db) == before


# ---------------------------------------------------------------- chapters


@pytest.mark.unit
class TestCreateChapter:
    def test_at_the_end_by_default(self, service, repo, three, db):
        gig, _, _ = three
        made = service.create_chapter(gig, "Encore")
        assert names(repo, gig) == ["Warm-up", "Peak", "Close", "Encore"]
        assert made.position == 3 and made.collection_id == gig
        assert_whole(db, gig)

    def test_at_a_position(self, service, repo, three):
        gig, _, _ = three
        service.create_chapter(gig, "Interlude", position=1)
        assert names(repo, gig) == ["Warm-up", "Interlude", "Peak", "Close"]

    def test_after_a_chapter(self, service, repo, three):
        gig, _, chapters = three
        service.create_chapter(gig, "Breather", after_chapter_id=chapters[1])
        assert names(repo, gig) == ["Warm-up", "Peak", "Breather", "Close"]
        service.create_chapter(gig, "Last", after_chapter_id=chapters[2])
        assert names(repo, gig)[-1] == "Last"

    def test_it_holds_no_entries(self, service, three):
        gig, entries, _ = three
        before = layout(service, gig)
        made = service.create_chapter(gig, "Empty", position=0)
        assert layout(service, gig) == before
        assert service.plan(gig).chapters[0].entry_ids == ()
        assert service.plan(gig).chapters[0].chapter.id == made.id

    def test_unnamed(self, service, repo, gig):
        assert service.create_chapter(gig).name == ""
        assert service.create_chapter(gig, "   ").is_unnamed

    def test_refusals(self, service, repo, db, three, ids):
        gig, _, chapters = three
        other = make_set(repo, "Saturday")
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        folder = int(repo.create(Collection(name="Gigs", kind=KIND_FOLDER)).id)
        refused(db, lambda: service.create_chapter(999_999, "x"), "No such Set")
        refused(
            db,
            lambda: service.create_chapter(crate, "x"),
            "'Crate' is a collection, not a Set",
        )
        refused(
            db,
            lambda: service.create_chapter(folder, "x"),
            "'Gigs' is a folder, not a Set",
        )
        refused(
            db,
            lambda: service.create_chapter(
                gig, "x", position=0, after_chapter_id=chapters[0]
            ),
            "not both",
        )
        refused(db, lambda: service.create_chapter(gig, "x", position=-1), "negative")
        refused(
            db,
            lambda: service.create_chapter(other, "x", after_chapter_id=chapters[1]),
            "'Peak' is not a chapter of 'Saturday'",
        )
        refused(
            db,
            lambda: service.create_chapter(gig, "x", after_chapter_id=999_999),
            "No such chapter",
        )
        refused(
            db,
            lambda: service.create_chapter(gig, "x" * (MAX_CHAPTER_NAME_LENGTH + 1)),
            "at most 120",
        )


@pytest.mark.unit
class TestChapterFields:
    def test_rename(self, service, repo, three):
        gig, _, chapters = three
        assert service.rename_chapter(chapters[1], "  Peak time ").name == "Peak time"
        assert service.rename_chapter(chapters[1], "").is_unnamed
        assert names(repo, gig) == ["Warm-up", "", "Close"]

    def test_notes(self, service, three):
        _, _, chapters = three
        assert (
            service.set_chapter_notes(chapters[0], " Slow start ").notes == "Slow start"
        )
        assert service.set_chapter_notes(chapters[0], "   ").notes is None
        assert service.set_chapter_notes(chapters[0], None).notes is None

    def test_targets(self, service, three):
        _, _, chapters = three
        made = service.set_chapter_targets(chapters[1], 2400, 124, 128)
        assert (made.target_seconds, made.bpm_min, made.bpm_max) == (2400, 124.0, 128.0)
        opened = service.set_chapter_targets(chapters[1], None, 124, None)
        assert (opened.target_seconds, opened.bpm_min, opened.bpm_max) == (
            None,
            124.0,
            None,
        )
        cleared = service.set_chapter_targets(chapters[1])
        assert not cleared.has_bpm_range and cleared.target_seconds is None

    def test_targets_at_their_bounds(self, service, three):
        _, _, chapters = three
        assert service.set_chapter_targets(chapters[0], 1).target_seconds == 1
        top = service.set_chapter_targets(chapters[0], MAX_TIME_SECONDS)
        assert top.target_seconds == MAX_TIME_SECONDS
        same = service.set_chapter_targets(chapters[0], None, 125.5, 125.5)
        assert same.bpm_min == same.bpm_max == 125.5

    @pytest.mark.parametrize(
        ("target", "low", "high", "match"),
        [
            (0, None, None, "more than zero"),
            (-60, None, None, "more than zero"),
            (MAX_TIME_SECONDS + 1, None, None, "at most 99:59:59"),
            (90.5, None, None, "whole"),
            (None, 0, None, "more than zero"),
            (None, None, -1, "more than zero"),
            (None, 130, 120, "run upwards"),
            (None, float("nan"), None, "bpm_min"),
        ],
    )
    def test_target_refusals_write_nothing(
        self, service, db, three, target, low, high, match
    ):
        _, _, chapters = three
        refused(
            db,
            lambda: service.set_chapter_targets(chapters[1], target, low, high),
            match,
        )

    def test_other_refusals(self, service, db, three):
        _, _, chapters = three
        refused(db, lambda: service.rename_chapter(999_999, "x"), "No such chapter")
        refused(
            db, lambda: service.rename_chapter(chapters[0], "x" * 121), "at most 120"
        )
        refused(
            db,
            lambda: service.set_chapter_notes(
                chapters[0], "x" * (MAX_NOTES_LENGTH + 1)
            ),
            "at most",
        )
        refused(db, lambda: service.set_chapter_targets(999_999, 60), "No such chapter")

    def test_update_writes_every_field_it_is_given_together(self, service, three):
        # PREP-08: the heading dialog's one write.
        _, _, chapters = three
        made = service.update_chapter(
            chapters[1],
            {
                "name": " Peak time ",
                "notes": " Hands up ",
                "target_seconds": 2400,
                "bpm_min": 126,
                "bpm_max": 130,
            },
        )
        assert (
            made.name,
            made.notes,
            made.target_seconds,
            made.bpm_min,
            made.bpm_max,
        ) == ("Peak time", "Hands up", 2400, 126.0, 130.0)

    def test_update_keeps_what_it_is_not_given(self, service, three):
        _, _, chapters = three
        service.update_chapter(chapters[1], {"notes": "keep", "target_seconds": 600})
        made = service.update_chapter(
            chapters[1], {"bpm_max": 128, "target_seconds": None}
        )
        assert (made.name, made.notes, made.target_seconds, made.bpm_max) == (
            "Peak",
            "keep",
            None,
            128.0,
        )
        assert service.update_chapter(chapters[1], {}).name == "Peak"

    @pytest.mark.parametrize(
        ("changes", "match"),
        [
            ({"bpm_min": 130, "bpm_max": 120}, "run upwards"),
            ({"target_seconds": MAX_TIME_SECONDS + 1}, "at most 99:59:59"),
            ({"target_seconds": 0}, "more than zero"),
            ({"notes": "x" * (MAX_NOTES_LENGTH + 1)}, "at most"),
            ({"colour": "red"}, "no field 'colour'"),
            ({"collection_id": 7}, "no field 'collection_id'"),
            ({"position": 0}, "no field 'position'"),
        ],
    )
    def test_a_refused_update_writes_none_of_it(
        self, service, db, three, changes, match
    ):
        _, _, chapters = three
        refused(
            db,
            lambda: service.update_chapter(chapters[1], {"name": "Renamed", **changes}),
            match,
        )

    def test_update_of_a_chapter_that_is_gone(self, service, db, three):
        refused(
            db,
            lambda: service.update_chapter(999_999, {"name": "x"}),
            "No such chapter",
        )

    def test_fields_never_move_a_chapter(self, service, repo, three):
        gig, _, chapters = three
        before = layout(service, gig)
        service.rename_chapter(chapters[2], "Closing")
        service.set_chapter_targets(chapters[2], 600, 120, 122)
        service.set_chapter_notes(chapters[2], "end on a vocal")
        assert [e for e, _ in layout(service, gig)] == [e for e, _ in before]
        assert [c.id for c in repo.chapters(gig)] == chapters


@pytest.mark.unit
class TestMoveChapter:
    def test_its_entries_move_with_it(self, service, repo, db, three):
        gig, entries, chapters = three
        moved = service.move_chapter(chapters[2], 0)
        assert moved.position == 0 and moved.name == "Close"
        assert names(repo, gig) == ["Close", "Warm-up", "Peak"]
        assert [e for e, _ in layout(service, gig)] == (
            entries[4:6] + entries[0:2] + entries[2:4]
        )
        assert_whole(db, gig)

    def test_past_the_end_is_the_last_place(self, service, repo, three):
        gig, _, chapters = three
        assert service.move_chapter(chapters[0], 50).position == 2
        assert names(repo, gig) == ["Peak", "Close", "Warm-up"]

    def test_refusals(self, service, db, three):
        _, _, chapters = three
        refused(db, lambda: service.move_chapter(chapters[0], -1), "negative")
        refused(db, lambda: service.move_chapter(999_999, 0), "No such chapter")


@pytest.mark.unit
class TestDeleteChapter:
    def test_the_first_joins_the_one_after(self, service, repo, db, three):
        gig, entries, chapters = three
        joined = service.delete_chapter(chapters[0])
        assert joined.id == chapters[1] and joined.position == 0
        assert names(repo, gig) == ["Peak", "Close"]
        assert [n for _, n in layout(service, gig)] == ["Peak"] * 4 + ["Close"] * 2
        assert [e for e, _ in layout(service, gig)] == entries
        assert_whole(db, gig)

    def test_a_middle_one_joins_the_one_before(self, service, repo, db, three):
        gig, entries, chapters = three
        joined = service.delete_chapter(chapters[1])
        assert joined.id == chapters[0]
        assert [n for _, n in layout(service, gig)] == ["Warm-up"] * 4 + ["Close"] * 2
        assert_whole(db, gig)

    def test_the_last_placed_joins_the_one_before(self, service, repo, db, three):
        gig, entries, chapters = three
        joined = service.delete_chapter(chapters[2])
        assert joined.id == chapters[1] and joined.name == "Peak"
        assert [n for _, n in layout(service, gig)] == ["Warm-up"] * 2 + ["Peak"] * 4
        assert_whole(db, gig)

    def test_down_to_one_and_no_further(self, service, repo, db, three):
        gig, entries, chapters = three
        service.delete_chapter(chapters[0])
        service.delete_chapter(chapters[2])
        assert names(repo, gig) == ["Peak"]
        refused(
            db,
            lambda: service.delete_chapter(chapters[1]),
            "'Peak' is the only chapter of 'Friday', and a Set always has one",
        )
        assert [n for _, n in layout(service, gig)] == ["Peak"] * 6

    def test_a_new_sets_one_chapter_cannot_be_deleted(self, service, repo, db, gig):
        only = int(repo.chapters(gig)[0].id)
        refused(
            db, lambda: service.delete_chapter(only), "chapter 1 is the only chapter"
        )

    def test_times_survive_their_chapter(self, service, three):
        gig, entries, chapters = three
        service.set_entry_times(entries[3], "0:30", "4:00")
        service.delete_chapter(chapters[1])
        entry = service.plan(gig).entries[3]
        assert (entry.in_seconds, entry.out_seconds) == (30, 240)

    def test_a_chapter_that_is_not_there(self, service, db):
        refused(db, lambda: service.delete_chapter(999_999), "No such chapter")


@pytest.mark.unit
class TestSplitChapterAt:
    def test_start_a_chapter_here(self, service, repo, db, filled):
        gig, entries = filled
        made = service.split_chapter_at(entries[3], "Peak")
        assert made.name == "Peak" and made.position == 1
        assert [n for _, n in layout(service, gig)] == [""] * 3 + ["Peak"] * 3
        assert_whole(db, gig)

    def test_on_the_last_entry(self, service, repo, db, filled):
        gig, entries = filled
        made = service.split_chapter_at(entries[5], "Encore")
        assert service.plan(gig).chapters[-1].entry_ids == (entries[5],)
        assert made.position == 1
        assert_whole(db, gig)

    def test_on_the_first_entry_is_refused_and_says_to_rename(
        self, service, db, filled
    ):
        gig, entries = filled
        refused(
            db,
            lambda: service.split_chapter_at(entries[0], "Opening"),
            "chapter 1 already starts at this entry: rename it",
        )

    def test_on_any_chapters_first_entry_is_refused(self, service, db, three):
        gig, entries, _ = three
        refused(
            db, lambda: service.split_chapter_at(entries[2]), "'Peak' already starts"
        )
        refused(
            db, lambda: service.split_chapter_at(entries[4]), "'Close' already starts"
        )

    def test_unnamed(self, service, filled):
        gig, entries = filled
        assert service.split_chapter_at(entries[1]).is_unnamed

    def test_refusals(self, service, repo, db, filled, ids):
        gig, entries = filled
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        repo.add(crate, ids[:3])
        in_crate = int(repo.entries(crate)[1].id)
        refused(
            db, lambda: service.split_chapter_at(in_crate), "No such entry in a Set"
        )
        refused(db, lambda: service.split_chapter_at(999_999), "No such entry in a Set")
        refused(
            db,
            lambda: service.split_chapter_at(entries[2], "x" * 121),
            "at most 120",
        )


# ----------------------------------------------------------------- entries


@pytest.mark.unit
class TestMoveEntry:
    def test_within_its_chapter_it_keeps_it(self, service, db, three):
        gig, entries, chapters = three
        moved = service.move_entry(entries[3], 2)
        assert moved.position == 2
        assert dict(layout(service, gig))[entries[3]] == "Peak"
        assert_whole(db, gig)

    def test_across_chapters_it_follows_prep_02s_rule(self, service, db, three):
        gig, entries, chapters = three
        service.move_entry(entries[0], 5)
        assert dict(layout(service, gig))[entries[0]] == "Close"
        service.move_entry(entries[5], 1, chapters[0])
        assert dict(layout(service, gig))[entries[5]] == "Warm-up"
        assert_whole(db, gig)

    def test_refusals(self, service, repo, db, three, ids):
        gig, entries, chapters = three
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        repo.add(crate, ids[:2])
        refused(
            db,
            lambda: service.move_entry(int(repo.entries(crate)[0].id), 1),
            "No such entry in a Set",
        )
        refused(db, lambda: service.move_entry(entries[0], -1), "negative")
        refused(
            db, lambda: service.move_entry(entries[0], 5, chapters[0]), "does not reach"
        )


@pytest.mark.unit
class TestEntryTimes:
    @pytest.mark.parametrize(
        ("typed_in", "typed_out", "stored"),
        [
            ("", "4:00", (None, 240)),
            (None, "4:00", (None, 240)),
            ("0:00", "4:00", (0, 240)),
            ("0:30", "5:00", (30, 300)),
            ("0:30", "", (30, None)),
            (None, None, (None, None)),
            ("  ", "  ", (None, None)),
            ("0:00:30", "0:04:00", (30, 240)),
        ],
    )
    def test_accepted(self, service, filled, typed_in, typed_out, stored):
        gig, entries = filled
        plan = service.set_entry_times(entries[0], typed_in, typed_out)
        assert (plan.in_seconds, plan.out_seconds) == stored
        entry = service.plan(gig).entries[0]
        assert (entry.in_seconds, entry.out_seconds) == stored

    def test_at_exactly_the_tracks_end(self, service, filled):
        _, entries = filled
        assert service.set_entry_times(entries[0], None, "5:00").out_seconds == LENGTH

    @pytest.mark.parametrize(
        ("typed_in", "typed_out", "match"),
        [
            (None, "5:01", "The track is 5:00 long, so it cannot go out at 5:01"),
            ("5:00", None, "The track is 5:00 long, so it cannot come in at 5:00"),
            ("5:30", None, "cannot come in at 5:30"),
            ("4:00", "4:00", "come in before it goes out: in 4:00, out 4:00"),
            ("4:30", "4:00", "come in before it goes out"),
            (None, "0:00", "come in before it goes out: in 0:00, out 0:00"),
            ("soon", "4:00", "not a time"),
            ("0:30", "4:60", "seconds run from 00 to 59"),
            ("0:30", "240", "not a time"),
        ],
    )
    def test_refused_and_nothing_written(
        self, service, db, filled, typed_in, typed_out, match
    ):
        _, entries = filled
        service.set_entry_times(entries[0], "0:10", "3:00")
        refused(
            db, lambda: service.set_entry_times(entries[0], typed_in, typed_out), match
        )

    def test_a_bad_time_is_a_time_format_error(self, service, filled):
        _, entries = filled
        with pytest.raises(TimeFormatError):
            service.set_entry_times(entries[0], "1h", None)

    @pytest.mark.parametrize("stored", [None, 0])
    def test_accepted_past_any_length_when_the_length_is_unknown(
        self, service, db, filled, ids, stored
    ):
        gig, entries = filled
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET duration_seconds = ? WHERE id = ?", (stored, ids[0])
            )
        plan = service.set_entry_times(entries[0], "9:00", "1:02:00")
        assert (plan.in_seconds, plan.out_seconds) == (540, 3720)
        assert service.plan(gig).entries[0].length_seconds is None

    def test_a_shortened_track_keeps_its_times(self, service, db, filled, ids):
        """A refresh that shortens a track makes a warning (PREP-05), not an
        error, and nothing rewrites the times (DEC-107)."""
        gig, entries = filled
        service.set_entry_times(entries[0], None, "4:30")
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET duration_seconds = 200 WHERE id = ?", (ids[0],)
            )
        entry = service.plan(gig).entries[0]
        assert (entry.out_seconds, entry.length_seconds) == (270, 200)
        service.set_entry_note(entries[0], "fine")  # the rest still edits
        assert service.plan(gig).entries[0].out_seconds == 270

    def test_a_repeat_planned_twice_keeps_two_sets_of_times(
        self, service, repo, gig, ids
    ):
        repo.add(gig, ids[:2])
        repo.insert_at(gig, ids[0], 2)
        first, _, reprise = [int(e.id) for e in repo.entries(gig)]
        service.set_entry_times(first, None, "3:00")
        service.set_entry_times(reprise, "2:00", "5:00")
        service.set_entry_note(first, "the intro")
        service.set_entry_note(reprise, "the reprise")
        plan = service.plan(gig)
        assert plan.entries[0].track_id == plan.entries[2].track_id == ids[0]
        assert (plan.entries[0].in_seconds, plan.entries[0].out_seconds) == (None, 180)
        assert (plan.entries[2].in_seconds, plan.entries[2].out_seconds) == (120, 300)
        assert (plan.entries[0].note, plan.entries[2].note) == (
            "the intro",
            "the reprise",
        )

    def test_times_leave_the_chapter_and_note_alone(self, service, three):
        gig, entries, chapters = three
        service.set_entry_note(entries[3], "drop the bass")
        service.set_entry_times(entries[3], "0:15", "3:15")
        entry = service.plan(gig).entries[3]
        assert (entry.chapter_id, entry.note) == (chapters[1], "drop the bass")

    def test_a_collections_entry_has_no_times(self, service, repo, db, ids):
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        repo.add(crate, ids[:1])
        entry = int(repo.entries(crate)[0].id)
        refused(
            db,
            lambda: service.set_entry_times(entry, None, "3:00"),
            "No such entry in a Set",
        )


@pytest.mark.unit
class TestNotes:
    def test_an_entrys_note(self, service, filled):
        gig, entries = filled
        assert service.set_entry_note(entries[1], " swap at the break ").note == (
            "swap at the break"
        )
        assert service.set_entry_note(entries[1], "").note is None

    def test_a_sets_notes(self, service, repo, gig):
        assert service.set_notes(gig, " Rooftop, 3 hours ").notes == "Rooftop, 3 hours"
        assert service.plan(gig).notes == "Rooftop, 3 hours"
        assert service.set_notes(gig, None).notes is None

    def test_refusals(self, service, repo, db, filled):
        gig, entries = filled
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        too_long = "x" * (MAX_NOTES_LENGTH + 1)
        refused(db, lambda: service.set_entry_note(entries[0], too_long), "at most")
        refused(
            db, lambda: service.set_entry_note(999_999, "x"), "No such entry in a Set"
        )
        refused(db, lambda: service.set_notes(gig, too_long), "at most")
        refused(db, lambda: service.set_notes(crate, "x"), "not a Set")
        refused(db, lambda: service.set_notes(999_999, "x"), "No such Set")


# ---------------------------------------------------------------- the plan


@pytest.mark.unit
class TestPlan:
    def test_a_new_set(self, service, repo, gig):
        plan = service.plan(gig)
        assert isinstance(plan, SetPlan)
        assert plan.set.id == gig and plan.notes is None and plan.entries == ()
        assert len(plan.chapters) == 1
        only = plan.chapters[0]
        assert only.chapter.is_unnamed and only.entry_ids == ()
        assert only.running_time == RunningTime(0, 0, 0) and only.starts_at == 0
        assert plan.running_time == RunningTime(0, 0, 0)

    def test_running_times_per_chapter_and_for_the_set(self, service, three):
        gig, entries, _ = three
        service.set_entry_times(entries[0], None, "4:00")  # 240
        service.set_entry_times(entries[1], "0:30", "5:00")  # 270
        service.set_entry_times(entries[2], None, "3:00")  # 180
        # entries[3] untimed
        service.set_entry_times(entries[4], "1:00", "4:00")  # 180
        service.set_entry_times(entries[5], None, "2:00")  # 120
        plan = service.plan(gig)
        assert [c.running_time for c in plan.chapters] == [
            RunningTime(510, 2, 0),
            RunningTime(180, 1, 1),
            RunningTime(300, 2, 0),
        ]
        assert plan.running_time == RunningTime(990, 5, 1)
        assert [e.planned_seconds for e in plan.entries] == [
            240,
            270,
            180,
            None,
            180,
            120,
        ]
        assert [e.starts_at for e in plan.entries] == [0, 240, 510, 690, None, None]
        assert [c.starts_at for c in plan.chapters] == [0, 510, None]

    def test_all_timed_every_chapter_starts(self, service, three):
        gig, entries, _ = three
        for entry in entries:
            service.set_entry_times(entry, None, "1:00")
        plan = service.plan(gig)
        assert [c.starts_at for c in plan.chapters] == [0, 120, 240]
        assert plan.running_time == RunningTime(360, 6, 0)
        assert plan.running_time.is_complete

    def test_an_empty_chapter_starts_where_the_entries_before_it_end(
        self, service, three
    ):
        gig, entries, chapters = three
        for entry in entries[:2]:
            service.set_entry_times(entry, None, "1:30")
        service.create_chapter(gig, "Breather", after_chapter_id=chapters[0])
        service.create_chapter(gig, "Encore")
        plan = service.plan(gig)
        assert [c.chapter.name for c in plan.chapters] == [
            "Warm-up",
            "Breather",
            "Peak",
            "Close",
            "Encore",
        ]
        assert plan.chapters[1].starts_at == 180
        assert plan.chapters[1].running_time == RunningTime(0, 0, 0)
        assert plan.chapters[4].starts_at is None  # untimed entries came before
        for entry in entries[2:]:
            service.set_entry_times(entry, None, "1:00")
        assert service.plan(gig).chapters[4].starts_at == 180 + 4 * 60

    def test_entries_carry_their_track_place_and_length(self, service, three, ids):
        gig, entries, chapters = three
        plan = service.plan(gig)
        assert [e.entry_id for e in plan.entries] == entries
        assert [e.track_id for e in plan.entries] == ids[:6]
        assert [e.position for e in plan.entries] == list(range(6))
        assert [e.chapter_id for e in plan.entries] == [
            chapters[0],
            chapters[0],
            chapters[1],
            chapters[1],
            chapters[2],
            chapters[2],
        ]
        assert {e.length_seconds for e in plan.entries} == {LENGTH}
        assert [c.entry_ids for c in plan.chapters] == [
            tuple(entries[0:2]),
            tuple(entries[2:4]),
            tuple(entries[4:6]),
        ]

    def test_the_wire_shape(self, service, three):
        gig, entries, chapters = three
        service.set_notes(gig, "Rooftop")
        service.set_chapter_targets(chapters[1], 1800, 124, 128)
        service.set_entry_times(entries[0], "0:10", "3:10")
        wire = service.plan(gig).to_dict()
        assert set(wire) == {
            "set_id",
            "name",
            "notes",
            "chapters",
            "entries",
            "running_time",
        }
        assert (wire["set_id"], wire["name"], wire["notes"]) == (
            gig,
            "Friday",
            "Rooftop",
        )
        assert wire["running_time"] == {"seconds": 180, "timed": 1, "untimed": 5}
        assert wire["chapters"][1] == {
            "id": chapters[1],
            "position": 1,
            "name": "Peak",
            "notes": None,
            "target_seconds": 1800,
            "bpm_min": 124.0,
            "bpm_max": 128.0,
            "entry_ids": entries[2:4],
            "running_time": {"seconds": 0, "timed": 0, "untimed": 2},
            "starts_at": None,
        }
        assert wire["entries"][0] == {
            "entry_id": entries[0],
            "track_id": wire["entries"][0]["track_id"],
            "position": 0,
            "chapter_id": chapters[0],
            "in_seconds": 10,
            "out_seconds": 190,
            "note": None,
            "planned_seconds": 180,
            "starts_at": 0,
            "length_seconds": LENGTH,
        }

    def test_refusals(self, service, repo, db):
        crate = int(repo.create(Collection(name="Crate", kind=KIND_COLLECTION)).id)
        with pytest.raises(ValueError, match="not a Set"):
            service.plan(crate)
        with pytest.raises(ValueError, match="No such Set"):
            service.plan(999_999)


# --------------------------------------------------------- nothing recorded


@pytest.mark.unit
def test_no_edit_records_activity_or_history(service, repo, db, three, ids):
    """A Set's plan is not track metadata, as a Collection's edits are not."""
    gig, entries, chapters = three

    def counts():
        conn = db.connect()
        return tuple(
            int(conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"])
            for table in ("activity_events", "track_history")
        )

    before = counts()
    made = service.create_chapter(gig, "Encore")
    service.rename_chapter(int(made.id), "Encore!")
    service.set_chapter_notes(chapters[0], "slow")
    service.set_chapter_targets(chapters[1], 1200, 124, 126)
    service.move_chapter(chapters[2], 0)
    service.split_chapter_at(entries[1], "Split")
    service.delete_chapter(int(made.id))
    service.move_entry(entries[0], 3)
    service.set_entry_times(entries[0], "0:10", "3:00")
    service.set_entry_note(entries[0], "note")
    service.set_notes(gig, "notes")
    service.plan(gig)
    assert counts() == before


@pytest.mark.unit
def test_the_container_builds_the_service(tmp_path, monkeypatch):
    from cuepoint.services import database_service as database_service_module
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import ISetRepository, ISetService
    from cuepoint.utils.di_container import get_container, reset_container

    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "c.db"
    )
    reset_container()
    try:
        bootstrap_services()
        container = get_container()
        assert isinstance(container.resolve(ISetService), SetService)
        assert isinstance(container.resolve(ISetRepository), SetRepository)
    finally:
        reset_container()


# ----------------------------------------------------------------- property


OPERATIONS = (
    "create",
    "rename",
    "targets",
    "move_chapter",
    "delete",
    "split",
    "move_entry",
    "insert",
    "remove",
    "times",
)


@pytest.mark.unit
@settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
@given(
    st.lists(
        st.tuples(
            st.sampled_from(OPERATIONS),
            st.integers(min_value=0, max_value=20),
            st.integers(min_value=0, max_value=20),
        ),
        min_size=1,
        max_size=40,
    )
)
def test_any_sequence_of_edits_keeps_the_set_whole(tmp_path_factory, steps):
    """Every edit, refusals included, leaves DEC-103 true, and a refusal
    leaves the Set exactly as it was."""
    database = make_db(tmp_path_factory.mktemp("set") / "cuepoint.db")
    try:
        repo = CollectionRepository(database)
        service = SetService(repo, SetRepository(database), database)
        tracks = [
            int(r["id"])
            for r in database.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        gig = make_set(repo)
        repo.add(gig, tracks[:5])

        for operation, a, b in steps:
            entries = [int(e.id) for e in repo.entries(gig)]
            chapters: List[SetChapter] = repo.chapters(gig)
            chapter = chapters[a % len(chapters)]
            entry = entries[a % len(entries)] if entries else None
            before = snapshot(database)
            try:
                if operation == "create":
                    service.create_chapter(
                        gig, f"C{b}", position=b % (len(chapters) + 1)
                    )
                elif operation == "rename":
                    service.rename_chapter(int(chapter.id), f"R{b}")
                elif operation == "targets":
                    service.set_chapter_targets(
                        int(chapter.id), b * 60 or None, 120, 120 + b
                    )
                elif operation == "move_chapter":
                    service.move_chapter(int(chapter.id), b)
                elif operation == "delete":
                    service.delete_chapter(int(chapter.id))
                elif operation == "split" and entry is not None:
                    service.split_chapter_at(entry, f"S{b}")
                elif operation == "move_entry" and entry is not None:
                    named = int(chapters[b % len(chapters)].id) if b % 3 == 0 else None
                    service.move_entry(entry, b, named)
                elif operation == "insert":
                    named = int(chapters[b % len(chapters)].id) if b % 2 else None
                    repo.insert_at(gig, tracks[b % len(tracks)], a, named)
                elif operation == "remove" and entry is not None:
                    repo.remove_entries([entry])
                elif operation == "times" and entry is not None:
                    service.set_entry_times(entry, f"0:{b % 60:02d}", f"{b % 6}:00")
            except ValueError:
                assert snapshot(database) == before, (
                    f"{operation} was refused but wrote"
                )
            assert_whole(database, gig)
            plan = service.plan(gig)
            assert sum(len(c.entry_ids) for c in plan.chapters) == len(plan.entries)
            assert plan.running_time == sum(
                (c.running_time for c in plan.chapters), RunningTime()
            )
    finally:
        database.close_all()
