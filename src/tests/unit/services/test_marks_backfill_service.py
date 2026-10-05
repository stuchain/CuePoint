#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading a pre-WAVE-04 library's marks from its source, once (DEC-118, DEC-035).

The specification's three cases — it runs when the source matches, does
nothing when it has changed, and runs once — and what keeps it safe beside the
writes that do the same work: an import or refresh that read the marks while
it ran wins, and a cancelled run records nothing, so the next start finishes.

The library under test is a real upgrade: a version-25 database holding the
fixture's tracks and a source record, migrated to version 26, as a user's
library is at the first launch after WAVE-04.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import List

import pytest

from cuepoint.data.rekordbox import iter_collection_tracks
from cuepoint.migrations import discover_migrations
from cuepoint.models.library_source import source_for_import
from cuepoint.models.track_marks import MARKS_INDEX
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.marks_backfill_service import (
    EVENT_MARKS_READ,
    OUTCOME_ALREADY_READ,
    OUTCOME_CANCELLED,
    OUTCOME_NO_SOURCE,
    OUTCOME_READ,
    OUTCOME_SOURCE_CHANGED,
    OUTCOME_SUPERSEDED,
    MarksBackfillResult,
    MarksBackfillService,
)
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "rekordbox" / "marks.xml"
NOW = "2026-10-01T12:00:00+00:00"


@pytest.fixture
def source(tmp_path) -> Path:
    path = tmp_path / "collection.xml"
    shutil.copyfile(FIXTURE, path)
    return path


@pytest.fixture
def db(tmp_path, source):
    """A library imported at version 25 from ``source``, then upgraded to 26."""
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= 25]
    ).migrate()
    tracks = list(iter_collection_tracks(str(source)))
    TrackRepository(service).add_many(tracks)
    LibrarySourceRepository(service).replace(
        source_for_import(str(source), NOW, len(tracks), 1)
    )
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def marks(db):
    return TrackMarksRepository(db)


def backfill_service(db, **kwargs) -> MarksBackfillService:
    tracks = TrackRepository(db)
    return MarksBackfillService(
        TrackMarksRepository(db),
        tracks,
        LibrarySourceRepository(db),
        db,
        ActivityService(ActivityRepository(db), tracks),
        **kwargs,
    )


def events(db) -> List[dict]:
    return [
        {"summary": r[0], "detail": json.loads(r[1] or "{}")}
        for r in db.connect().execute(
            "SELECT summary, detail_json FROM activity_events WHERE type = ?",
            (EVENT_MARKS_READ,),
        )
    ]


def imported_marks(tmp_path, source) -> tuple:
    """What an import of the same file stores, to hold the backfill to."""
    fresh = DatabaseService(db_path=tmp_path / "fresh.db")
    MigrationRunner(fresh).migrate()
    LibraryImportService(
        TrackRepository(fresh),
        PlaylistRepository(fresh),
        LibrarySourceRepository(fresh),
        fresh,
    ).import_rekordbox_xml(str(source))
    try:
        return stored(fresh)
    finally:
        fresh.close_all()


def stored(db) -> tuple:
    cues = db.connect().execute(
        "SELECT t.rekordbox_track_id, c.position, c.kind, c.hot_cue, c.start_ms, c.end_ms,"
        " c.name, c.color FROM track_cues c JOIN tracks t ON t.id = c.track_id"
        " ORDER BY t.rekordbox_track_id, c.position"
    )
    grid = db.connect().execute(
        "SELECT t.rekordbox_track_id, g.position, g.start_ms, g.bpm, g.meter, g.beat"
        " FROM track_beat_grid g JOIN tracks t ON t.id = g.track_id"
        " ORDER BY t.rekordbox_track_id, g.position"
    )
    return [tuple(r) for r in cues], [tuple(r) for r in grid]


class TestWhenTheSourceMatches:
    def test_it_is_needed(self, db):
        assert backfill_service(db).needed() is True

    def test_it_reads_every_track_s_marks_as_an_import_would(
        self, db, marks, source, tmp_path
    ):
        result = backfill_service(db).backfill()
        assert result == MarksBackfillResult(
            OUTCOME_READ, tracks=5, cues=11, markers=6, skipped=6
        )
        assert stored(db) == imported_marks(tmp_path, source)
        assert marks.is_read() is True

    def test_it_writes_a_chunk_at_a_time_to_the_same_answer(self, db, source, tmp_path):
        progress: List[tuple] = []
        result = backfill_service(db, chunk_size=2).backfill(
            on_progress=lambda done, total: progress.append((done, total))
        )
        assert result.read and result.tracks == 5
        assert stored(db) == imported_marks(tmp_path, source)
        assert progress == [(2, 5), (4, 5), (5, 5)]

    def test_it_records_one_activity_event(self, db, source):
        backfill_service(db).backfill()
        (event,) = events(db)
        assert event["summary"] == (
            "Read cue points and beat grids for 5 tracks from the imported collection:"
            " 11 cues, 6 grid markers; 6 unreadable marks skipped"
        )
        assert event["detail"]["xml_path"] == str(source)
        assert event["detail"]["outcome"] == OUTCOME_READ


class TestItRunsOnce:
    def test_a_second_run_does_nothing(self, db, marks):
        backfill_service(db).backfill()
        before = stored(db)
        assert backfill_service(db).needed() is False
        assert backfill_service(db).backfill() == MarksBackfillResult(
            OUTCOME_ALREADY_READ
        )
        assert stored(db) == before
        assert len(events(db)) == 1

    def test_a_library_an_import_already_read_is_not_read_again(self, db, source):
        LibraryImportService(
            TrackRepository(db), PlaylistRepository(db), LibrarySourceRepository(db), db
        ).import_rekordbox_xml(str(source))
        assert backfill_service(db).needed() is False
        assert backfill_service(db).backfill().outcome == OUTCOME_ALREADY_READ


class TestWhenTheSourceDoesNotMatch:
    def test_a_changed_file_is_not_read(self, db, marks, source):
        with open(source, "a", encoding="utf-8") as handle:
            handle.write("\n<!-- edited -->\n")
        assert backfill_service(db).needed() is False
        assert backfill_service(db).backfill() == MarksBackfillResult(
            OUTCOME_SOURCE_CHANGED
        )
        assert marks.counts() == (0, 0)
        assert marks.is_read() is False
        assert events(db) == []

    def test_a_file_touched_without_changing_is_still_a_changed_file(
        self, db, marks, source
    ):
        """The recorded modified time is what says it is unchanged (DEC-035)."""
        stat = source.stat()
        os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 5_000_000_000))
        assert backfill_service(db).backfill().outcome == OUTCOME_SOURCE_CHANGED
        assert marks.counts() == (0, 0)

    def test_a_missing_file_is_not_read(self, db, marks, source):
        source.unlink()
        assert backfill_service(db).needed() is False
        assert backfill_service(db).backfill().outcome == OUTCOME_SOURCE_CHANGED

    def test_it_reads_the_file_once_it_is_back_as_it_was(
        self, db, marks, source, tmp_path
    ):
        kept = tmp_path / "kept.xml"
        shutil.copy2(source, kept)
        source.unlink()
        assert backfill_service(db).backfill().outcome == OUTCOME_SOURCE_CHANGED
        shutil.copy2(kept, source)
        assert backfill_service(db).backfill().outcome == OUTCOME_READ

    def test_a_library_never_imported_has_nothing_to_read(self, tmp_path):
        empty = DatabaseService(db_path=tmp_path / "empty.db")
        MigrationRunner(empty).migrate()
        try:
            assert backfill_service(empty).needed() is False
            assert backfill_service(empty).backfill() == MarksBackfillResult(
                OUTCOME_NO_SOURCE
            )
        finally:
            empty.close_all()


class TestStoppingAndSteppingAside:
    def test_a_cancelled_run_records_nothing_and_the_next_finishes(
        self, db, marks, source, tmp_path
    ):
        asked = [0]

        def cancel_after_two() -> bool:
            asked[0] += 1
            return asked[0] > 3

        result = backfill_service(db, chunk_size=2).backfill(
            should_cancel=cancel_after_two
        )
        assert result.outcome == OUTCOME_CANCELLED
        assert result.tracks == 2
        assert marks.is_read() is False
        assert backfill_service(db).needed() is True

        assert backfill_service(db).backfill().read
        assert stored(db) == imported_marks(tmp_path, source)

    def test_an_import_that_read_the_marks_meanwhile_wins(
        self, db, marks, source, tmp_path
    ):
        """An import between two chunks writes every track's marks itself."""
        moved = tmp_path / "moved.xml"
        moved.write_text(
            FIXTURE.read_text(encoding="utf-8").replace(
                'Start="64.025" Num="0"', 'Start="65.000" Num="0"'
            ),
            encoding="utf-8",
        )
        importer = LibraryImportService(
            TrackRepository(db), PlaylistRepository(db), LibrarySourceRepository(db), db
        )
        imported = [False]

        def import_after_the_first_chunk(done: int, total: int) -> None:
            if not imported[0]:
                imported[0] = True
                importer.import_rekordbox_xml(str(moved))

        result = backfill_service(db, chunk_size=2).backfill(
            on_progress=import_after_the_first_chunk
        )
        assert result.outcome == OUTCOME_SUPERSEDED
        assert stored(db) == imported_marks(tmp_path, moved)
        assert events(db) == []

    def test_a_refresh_s_new_source_record_stops_it(self, db, source):
        """The guard compares the whole source record, not only the read flag."""
        service = backfill_service(db, chunk_size=2)
        sources = LibrarySourceRepository(db)

        def replace_the_source(done: int, total: int) -> None:
            record = sources.get()
            sources.replace(
                source_for_import(record.xml_path, NOW.replace("01T", "02T"), 5, 1)
            )

        assert (
            service.backfill(on_progress=replace_the_source).outcome
            == OUTCOME_SUPERSEDED
        )
        assert TrackMarksRepository(db).is_read() is False


class TestTheResult:
    @pytest.mark.parametrize(
        "outcome",
        [
            OUTCOME_ALREADY_READ,
            OUTCOME_NO_SOURCE,
            OUTCOME_SOURCE_CHANGED,
            OUTCOME_SUPERSEDED,
            OUTCOME_CANCELLED,
        ],
    )
    def test_every_outcome_says_what_happened(self, outcome):
        result = MarksBackfillResult(outcome)
        assert result.summary_line()
        assert result.to_dict()["outcome"] == outcome
        assert result.read is False

    def test_one_skipped_mark_is_one(self):
        line = MarksBackfillResult(OUTCOME_READ, tracks=1, cues=2, markers=1, skipped=1)
        assert line.summary_line().endswith("1 unreadable mark skipped")

    def test_a_read_without_skips_does_not_mention_them(self):
        line = MarksBackfillResult(OUTCOME_READ, tracks=1, cues=2, markers=1)
        assert "skipped" not in line.summary_line()

    def test_it_refuses_an_empty_chunk(self, db):
        with pytest.raises(ValueError):
            backfill_service(db, chunk_size=0)


def test_the_migration_left_the_marks_unread(db, marks):
    rows = db.connect().execute(
        "SELECT count(*) FROM derived_indexes WHERE name = ?", (MARKS_INDEX,)
    )
    assert rows.fetchone()[0] == 0
    assert marks.counts() == (0, 0)
