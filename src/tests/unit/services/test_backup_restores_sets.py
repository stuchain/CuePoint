#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A restored launch backup brings a Set back whole (PREP-12, acceptance 15).

ORG-13 proved a restore brings back Phase 6's work, and CLEAN-14 Phase 7's.
Phase 10 adds work that exists nowhere else either: a Set's running order with
its repeats, its chapters with their targets and ranges, the times and notes
typed on each entry, the Set's own notes, and the transition warnings a user
accepted. None of it goes into Rekordbox (DEC-109), so DEC-009's launch backup
is its only other copy.

The backup is a whole-database copy, and m0025 put every Set table in that
file, so a partial restore would take a deliberate mistake. That is why it is
pinned: a later phase that moved chapters to a sidecar, or left a table out of
the copy, would break this and nothing else would say so.

A library is built with one of everything Phase 10 makes, beside the Collection
it came from, **backed up the way the app does at launch**, destroyed the way a
real loss looks (the database still there, the work gone), restored, and read
back **through the services**: the plan, the running order and the checks,
which is what makes it a test of the Set being usable rather than of rows
existing.
"""

from __future__ import annotations

import pytest

from cuepoint.models.collection import KIND_SET
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.collection_service import CollectionService, SetSource
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_analysis_service import SetAnalysisService
from cuepoint.services.set_service import SetService

pytestmark = pytest.mark.unit

#: title, bpm, key, seconds. Track 3 is a tempo jump out of track 2, and a
#: key clash, so there is a warning to accept.
TRACKS = (
    ("Warm One", 122.0, "8A", 300),
    ("Warm Two", 124.0, "9A", 320),
    ("Peak Jump", 140.0, "3B", 280),
    ("Close", 125.0, "8B", 400),
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def services(database):
    """Everything Phase 10 writes and reads a Set with, over one database."""
    tracks = TrackRepository(database)
    collections = CollectionRepository(database)
    sets = SetRepository(database)
    activity = ActivityService(ActivityRepository(database), tracks)
    return {
        "tracks": tracks,
        "collections": CollectionService(collections, database, tracks, activity),
        "sets": SetService(collections, sets, database),
        "analysis": SetAnalysisService(collections, sets, tracks, database),
    }


def populate(database):
    """A folder holding a Collection with a repeat, and a Set made from it."""
    parts = services(database)
    track_ids = [
        int(
            parts["tracks"]
            .add(
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/music/{i}.mp3",
                    title=title,
                    artist="Ada",
                    bpm=bpm,
                    key=key,
                    duration_seconds=seconds,
                )
            )
            .id
        )
        for i, (title, bpm, key, seconds) in enumerate(TRACKS, start=1)
    ]
    collections = parts["collections"]
    gigs = collections.create_folder("Gigs")
    crate = collections.create_collection("Crate", gigs.id)
    # 1 2 3 4 1: the first track again at the end, a repeat.
    collections.add_tracks(crate.id, track_ids)
    collections.insert_track(crate.id, track_ids[0], 4)

    made = collections.create_set_from(
        SetSource.collection(crate.id), name="Friday", parent_id=gigs.id
    )
    set_id = int(made.set.id)
    sets = parts["sets"]
    entries = [entry.entry_id for entry in sets.plan(set_id).entries]

    # Three chapters: Warm-up (1, 2), Peak (3, 4), Close (1 again).
    sets.split_chapter_at(entries[2], "Peak")
    sets.split_chapter_at(entries[4], "Close")
    first = sets.plan(set_id).chapters[0].chapter.id
    sets.update_chapter(
        first,
        {
            "name": "Warm-up",
            "notes": "Keep it low",
            "target_seconds": 480,
            "bpm_min": 120.0,
            "bpm_max": 126.0,
        },
    )
    # The repeat is planned apart from the first time the track plays.
    sets.set_entry_times(entries[0], "0:30", "4:30")
    sets.set_entry_times(entries[4], None, "2:00")
    sets.set_entry_note(entries[0], "open on the pad")
    sets.set_entry_note(entries[4], "reprise, short")
    sets.set_notes(set_id, "Friday at the Loft")
    parts["analysis"].acknowledge(entries[1], entries[2], "key_clash")

    return {
        "track_ids": track_ids,
        "set_id": set_id,
        "crate_id": int(crate.id),
        "entries": entries,
        "plan": sets.plan(set_id).to_dict(),
        "analysis": parts["analysis"].analyse(set_id).to_dict(),
        "crate": [e.track_id for e in collections.entries(crate.id)],
    }


def destroy(database):
    """Lose the work the way it is actually lost: the file is still there."""
    parts = services(database)
    for node in parts["collections"].tree():
        if node.parent_id is None:
            parts["collections"].delete(node.id)


class TestARestoredLaunchBackupBringsSetsBack:
    @pytest.fixture
    def restored(self, db):
        expected = populate(db)
        backup = BackupService(db).backup_on_launch()
        # A launch backup, as the app takes one before any migration runs
        # (FOUNDATION-11): the one a user would restore from.
        assert backup is not None

        destroy(db)
        # The loss is real before the restore, or this passes against a
        # restore that did nothing.
        assert services(db)["collections"].tree() == []

        BackupService(db).restore(backup.path)
        return expected, services(db)

    def test_the_set_is_back_in_its_folder_beside_its_collection(self, restored):
        expected, parts = restored
        nodes = {node.name: node for node in parts["collections"].tree()}
        assert set(nodes) == {"Gigs", "Crate", "Friday"}
        assert nodes["Friday"].kind == "set"
        assert nodes["Friday"].parent_id == nodes["Gigs"].id
        assert nodes["Crate"].parent_id == nodes["Gigs"].id

    def test_the_collection_it_came_from_is_unchanged(self, restored):
        expected, parts = restored
        entries = parts["collections"].entries(expected["crate_id"])
        assert [entry.track_id for entry in entries] == expected["crate"]

    def test_the_running_order_comes_back_with_its_repeat(self, restored):
        expected, parts = restored
        plan = parts["sets"].plan(expected["set_id"])
        assert [entry.entry_id for entry in plan.entries] == expected["entries"]
        tracks = [entry.track_id for entry in plan.entries]
        assert tracks.count(expected["track_ids"][0]) == 2

    def test_the_whole_plan_comes_back_as_it_was(self, restored):
        """Chapters, targets, ranges, times, notes and running times, all of it."""
        expected, parts = restored
        assert parts["sets"].plan(expected["set_id"]).to_dict() == expected["plan"]

    def test_each_repeat_keeps_its_own_times_and_note(self, restored):
        expected, parts = restored
        plan = parts["sets"].plan(expected["set_id"])
        first, repeat = plan.entries[0], plan.entries[4]
        assert (first.in_seconds, first.out_seconds, first.note) == (
            30,
            270,
            "open on the pad",
        )
        assert (repeat.in_seconds, repeat.out_seconds, repeat.note) == (
            None,
            120,
            "reprise, short",
        )

    def test_the_chapters_come_back_with_their_targets(self, restored):
        expected, parts = restored
        chapters = [c.chapter for c in parts["sets"].plan(expected["set_id"]).chapters]
        assert [c.name for c in chapters] == ["Warm-up", "Peak", "Close"]
        warm = chapters[0]
        assert (warm.notes, warm.target_seconds, warm.bpm_min, warm.bpm_max) == (
            "Keep it low",
            480,
            120.0,
            126.0,
        )

    def test_the_accepted_warning_is_still_accepted(self, restored):
        """DEC-106: the acknowledgement comes back, and still applies."""
        expected, parts = restored
        analysis = parts["analysis"].analyse(expected["set_id"]).to_dict()
        assert analysis == expected["analysis"]
        assert analysis["acknowledged"] == 1
        (into_peak,) = [
            t
            for t in analysis["transitions"]
            if t["to_entry_id"] == expected["entries"][2]
        ]
        states = {w["kind"]: w["acknowledged"] for w in into_peak["warnings"]}
        assert states == {"tempo_jump": False, "key_clash": True}

    def test_the_sets_own_notes_come_back(self, restored):
        expected, parts = restored
        assert parts["sets"].plan(expected["set_id"]).notes == "Friday at the Loft"

    def test_the_set_is_counted_again_where_a_refresh_would_warn(self, db, restored):
        """DEC-011: a track in a restored Set is referenced by it again."""
        expected, _parts = restored
        set_ids, tracks = CollectionRepository(db).references_for(
            [expected["track_ids"][0]], KIND_SET
        )
        assert set_ids == [expected["set_id"]]
        assert tracks == [expected["track_ids"][0]]
