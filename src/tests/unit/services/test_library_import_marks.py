#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An import and a refresh read each track's cues and beat grid (WAVE-04, DEC-118).

What the specification asks of the write path, case by case:

- **marks are written,** every track's, in the transaction that writes the
  tracks, and the library records them read;
- **a refresh that moves a cue is counted and applied:** the preview's one
  count, and the apply's replacement;
- **a diff of only mark changes is still a diff to apply;**
- **a removed track's marks cascade away;**
- **a re-linked track keeps its marks on its own row;**
- **marks Rekordbox cannot have** are skipped and counted in the summary and
  Activity, never raised;
- **a failed or cancelled write leaves the marks as they were;**
- **a restored launch backup brings the marks back.**
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

import pytest

from cuepoint.models.track_marks import MARKS_INDEX
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    EVENT_LIBRARY_IMPORTED,
    EVENT_LIBRARY_REFRESHED,
    ImportCancelled,
    LibraryImportService,
)
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "rekordbox" / "marks.xml"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    return TrackRepository(db)


@pytest.fixture
def marks(db):
    return TrackMarksRepository(db)


@pytest.fixture
def service(db, tracks):
    return LibraryImportService(
        tracks,
        PlaylistRepository(db),
        LibrarySourceRepository(db),
        db,
        activity_service=ActivityService(ActivityRepository(db), tracks),
    )


@pytest.fixture
def source(tmp_path) -> Path:
    path = tmp_path / "collection.xml"
    shutil.copyfile(FIXTURE, path)
    return path


def edited(tmp_path: Path, name: str, *changes: Tuple[str, str]) -> str:
    """The fixture with each ``(old, new)`` replaced exactly once."""
    text = FIXTURE.read_text(encoding="utf-8")
    for old, new in changes:
        assert text.count(old) == 1, old
        text = text.replace(old, new)
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return str(path)


def track_block(rekordbox_id: str) -> str:
    """One ``COLLECTION/TRACK`` of the fixture, with its marks, as written."""
    text = FIXTURE.read_text(encoding="utf-8")
    start = text.index(f'    <TRACK TrackID="{rekordbox_id}"')
    end = "    </TRACK>\n"
    return text[start : text.index(end, start) + len(end)]


def id_of(db, rekordbox_id: str) -> int:
    row = (
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,))
        .fetchone()
    )
    return int(row[0])


def stored(db) -> Dict[str, List[tuple]]:
    """Every mark in the library, keyed by Rekordbox TrackID, in order."""
    result: Dict[str, List[tuple]] = {}
    for row in db.connect().execute(
        "SELECT t.rekordbox_track_id, c.position, c.kind, c.hot_cue, c.start_ms,"
        " c.end_ms, c.name, c.color FROM track_cues c JOIN tracks t ON t.id = c.track_id"
        " ORDER BY t.rekordbox_track_id, c.position"
    ):
        result.setdefault(row[0], []).append(("cue", *tuple(row)[1:]))
    for row in db.connect().execute(
        "SELECT t.rekordbox_track_id, g.position, g.start_ms, g.bpm, g.meter, g.beat"
        " FROM track_beat_grid g JOIN tracks t ON t.id = g.track_id"
        " ORDER BY t.rekordbox_track_id, g.position"
    ):
        result.setdefault(row[0], []).append(("grid", *tuple(row)[1:]))
    return result


def events(db, kind: str) -> List[dict]:
    return [
        {"summary": r[0], "detail": json.loads(r[1] or "{}")}
        for r in db.connect().execute(
            "SELECT summary, detail_json FROM activity_events WHERE type = ? ORDER BY id",
            (kind,),
        )
    ]


# ------------------------------------------------------------------- import


class TestAnImport:
    def test_it_writes_every_track_s_marks(self, service, db, marks, source):
        service.import_rekordbox_xml(str(source))
        every = stored(db)
        assert len([m for m in every["101"] if m[0] == "cue"]) == 9
        assert [m for m in every["102"] if m[0] == "grid"] == [
            ("grid", 0, 120, 121.0, "4/4", 1),
            ("grid", 1, 60120, 122.5, "4/4", 3),
            ("grid", 2, 120120, 124.0, "4/4", 1),
        ]
        assert "104" not in every
        assert marks.get(id_of(db, "101")).hot_cue_count == 4

    def test_it_records_the_marks_read(self, service, marks, source):
        assert marks.is_read() is False
        service.import_rekordbox_xml(str(source))
        assert marks.is_read() is True

    def test_its_summary_counts_what_it_wrote_and_skipped(self, service, source):
        summary = service.import_rekordbox_xml(str(source))
        assert (summary.marks.cues, summary.marks.markers, summary.marks.skipped) == (
            11,
            6,
            6,
        )
        assert summary.summary_line().endswith("6 unreadable marks skipped")

    def test_activity_records_the_marks(self, service, db, source):
        service.import_rekordbox_xml(str(source))
        (event,) = events(db, EVENT_LIBRARY_IMPORTED)
        assert event["detail"]["marks"] == {"cues": 11, "markers": 6, "skipped": 6}

    def test_a_clean_import_says_nothing_about_skipping(self, service, tmp_path):
        clean = edited(
            tmp_path,
            "clean.xml",
            ('<TEMPO Inizio="0.050" Bpm="0" Metro="4/4" Battito="1"/>', ""),
            ('<TEMPO Inizio="0.050" Bpm="" Metro="4/4" Battito="1"/>', ""),
            (
                '<POSITION_MARK Name="Unknown type" Type="9" Start="10.000" Num="-1"/>',
                "",
            ),
            ('<POSITION_MARK Name="No start" Type="0" Num="-1"/>', ""),
            ('<POSITION_MARK Name="Negative" Type="0" Start="-1.000" Num="-1"/>', ""),
            (
                '<POSITION_MARK Name="Backwards loop" Type="4" Start="50.000" End="40.000"'
                ' Num="-1"/>',
                "",
            ),
        )
        summary = service.import_rekordbox_xml(clean)
        assert summary.marks.skipped == 0
        assert "skipped" not in summary.summary_line()

    def test_importing_twice_converges(self, service, db, source):
        service.import_rekordbox_xml(str(source))
        first = stored(db)
        summary = service.import_rekordbox_xml(str(source))
        assert stored(db) == first
        assert (summary.marks.cues, summary.marks.markers) == (11, 6)

    def test_a_cancelled_import_leaves_the_marks_as_they_were(
        self, service, db, marks, source, tmp_path
    ):
        service.import_rekordbox_xml(str(source))
        before = stored(db)
        moved = edited(
            tmp_path, "moved.xml", ('Start="64.025" Num="0"', 'Start="65.000" Num="0"')
        )
        asked = [0]

        def cancel_late() -> bool:
            asked[0] += 1
            return asked[0] > 4

        with pytest.raises(ImportCancelled):
            service.import_rekordbox_xml(moved, should_cancel=cancel_late)
        assert stored(db) == before

    def test_a_failed_import_writes_no_marks_and_records_none_read(
        self, service, db, marks, source, monkeypatch
    ):
        def fail(*_args, **_kwargs):
            raise RuntimeError("the playlist mirror failed")

        monkeypatch.setattr(service._playlists, "replace_tree", fail)
        with pytest.raises(RuntimeError):
            service.import_rekordbox_xml(str(source))
        assert stored(db) == {}
        assert marks.is_read() is False

    def test_an_import_keeps_the_marks_of_tracks_it_does_not_hold(
        self, service, db, source, tmp_path
    ):
        """An import never deletes: a track the new file lacks keeps its row and marks."""
        service.import_rekordbox_xml(str(source))
        before = stored(db)["101"]
        without = edited(
            tmp_path,
            "without.xml",
            ('<TRACK TrackID="101"', '<TRACK TrackID="901"'),
            ("every%20mark.mp3", "another%20file.mp3"),
            ('<TRACK Key="101"/>', ""),
        )
        service.import_rekordbox_xml(without)
        assert stored(db)["101"] == before


# ------------------------------------------------------------------ refresh


class TestARefresh:
    @pytest.fixture
    def imported(self, service, source):
        service.import_rekordbox_xml(str(source))
        return source

    def test_an_unchanged_file_has_no_mark_changes(self, service, imported):
        diff = service.compute_refresh_diff(str(imported), force=True)
        assert diff.marks_changed == 0
        assert diff.is_empty

    def test_a_moved_cue_is_counted_once_and_applied(
        self, service, db, imported, tmp_path
    ):
        moved = edited(
            tmp_path, "moved.xml", ('Start="64.025" Num="0"', 'Start="65.000" Num="0"')
        )
        diff = service.compute_refresh_diff(moved)
        assert diff.marks_changed == 1
        assert diff.changed.count == 0
        assert not diff.is_empty
        assert diff.to_dict()["tracks"]["marks_changed"] == 1

        before = stored(db)
        summary = service.apply_refresh(diff)
        after = stored(db)
        assert ("cue", 1, "cue", 0, 65000, None, "Drop", "#28e214") in after["101"]
        assert {k: v for k, v in after.items() if k != "101"} == {
            k: v for k, v in before.items() if k != "101"
        }
        assert summary.marks.cues == 11
        assert service.compute_refresh_diff(moved, force=True).is_empty

    @pytest.mark.parametrize(
        "change",
        [
            ('Name="Drop"', 'Name="The Drop"'),
            ('Red="40" Green="226" Blue="20"', 'Red="41" Green="226" Blue="20"'),
            ('End="127.525"', 'End="128.525"'),
            ('<TEMPO Inizio="60.120" Bpm="122.50" Metro="4/4" Battito="3"/>', ""),
            ('<TEMPO Inizio="0.000" Bpm="132.00" Metro="4/4" Battito="1"/>', ""),
            (
                '<POSITION_MARK Name="Kept" Type="0" Start="20.000" Num="-1"/>',
                '<POSITION_MARK Name="Kept" Type="0" Start="20.000" Num="-1"/>'
                '<POSITION_MARK Name="New" Type="0" Start="30.000" Num="5"/>',
            ),
        ],
    )
    def test_every_kind_of_mark_change_is_counted(
        self, service, imported, tmp_path, change
    ):
        diff = service.compute_refresh_diff(edited(tmp_path, "changed.xml", change))
        assert diff.marks_changed == 1

    def test_the_order_of_marks_is_a_change(self, service, imported, tmp_path):
        swapped = edited(
            tmp_path,
            "swapped.xml",
            (
                '<POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>\n'
                '      <POSITION_MARK Name="Drop" Type="0" Start="64.025" Num="0" Red="40"'
                ' Green="226" Blue="20"/>',
                '<POSITION_MARK Name="Drop" Type="0" Start="64.025" Num="0" Red="40"'
                ' Green="226" Blue="20"/>\n'
                '      <POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>',
            ),
        )
        assert service.compute_refresh_diff(swapped).marks_changed == 1

    def test_a_skipped_mark_changing_is_no_change(self, service, imported, tmp_path):
        """Marks CuePoint cannot read are not stored, so they cannot differ."""
        other = edited(
            tmp_path,
            "other.xml",
            ('Name="Unknown type" Type="9"', 'Name="Other" Type="9"'),
        )
        assert service.compute_refresh_diff(other).marks_changed == 0

    def test_a_new_track_s_marks_are_written_but_not_counted_as_a_change(
        self, service, db, imported, tmp_path
    ):
        added = edited(
            tmp_path,
            "added.xml",
            (
                "  </COLLECTION>",
                '    <TRACK TrackID="106" Name="New" Artist="X" Location="file://localhost/C:/new.mp3">'
                '<POSITION_MARK Name="N" Type="0" Start="1.000" Num="0"/></TRACK>\n  </COLLECTION>',
            ),
        )
        diff = service.compute_refresh_diff(added)
        assert diff.added.count == 1
        assert diff.marks_changed == 0
        service.apply_refresh(diff)
        assert stored(db)["106"] == [("cue", 0, "cue", 0, 1000, None, "N", None)]

    def test_a_removed_track_s_marks_cascade_away(
        self, service, db, imported, tmp_path
    ):
        removed = edited(
            tmp_path,
            "removed.xml",
            (track_block("102"), ""),
            ('<TRACK Key="102"/>', ""),
        )
        gone = id_of(db, "102")
        diff = service.compute_refresh_diff(removed)
        assert diff.removed.count == 1
        service.apply_refresh(diff)
        assert "102" not in stored(db)
        rows = db.connect().execute(
            "SELECT count(*) FROM track_beat_grid WHERE track_id = ?", (gone,)
        )
        assert rows.fetchone()[0] == 0

    def test_a_re_linked_track_keeps_its_marks_on_its_own_row(
        self, service, db, imported, tmp_path
    ):
        """Rekordbox renumbered it; the file, the row and the marks are the same."""
        row = id_of(db, "101")
        before = stored(db)["101"]
        renumbered = edited(
            tmp_path,
            "renumbered.xml",
            ('<TRACK TrackID="101"', '<TRACK TrackID="9101"'),
            ('<TRACK Key="101"/>', '<TRACK Key="9101"/>'),
        )
        diff = service.compute_refresh_diff(renumbered)
        assert diff.relinked.count == 1
        assert diff.marks_changed == 0
        service.apply_refresh(diff)
        assert id_of(db, "9101") == row
        assert stored(db)["9101"] == before

    def test_activity_records_the_refresh_s_marks(
        self, service, db, imported, tmp_path
    ):
        moved = edited(
            tmp_path, "moved.xml", ('Start="64.025" Num="0"', 'Start="65.000" Num="0"')
        )
        service.apply_refresh(service.compute_refresh_diff(moved))
        (event,) = events(db, EVENT_LIBRARY_REFRESHED)
        assert event["detail"]["marks"] == {"cues": 11, "markers": 6, "skipped": 6}

    def test_the_apply_job_s_result_carries_the_marks(
        self, service, imported, tmp_path
    ):
        from cuepoint.engine.library_refresh import refresh_summary_to_dict

        moved = edited(
            tmp_path, "moved.xml", ('Start="64.025" Num="0"', 'Start="65.000" Num="0"')
        )
        summary = service.apply_refresh(service.compute_refresh_diff(moved))
        result = refresh_summary_to_dict(summary, "diff-1")
        assert result["marks"] == {"cues": 11, "markers": 6, "skipped": 6}
        assert result["summary_line"].endswith("6 unreadable marks skipped")


class TestALibraryWhoseMarksWereNeverRead:
    """Imported before WAVE-04, with a changed source: the backfill did not run."""

    @pytest.fixture
    def unread(self, service, db, marks, source):
        service.import_rekordbox_xml(str(source))
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_cues")
            conn.execute("DELETE FROM track_beat_grid")
            conn.execute("DELETE FROM derived_indexes WHERE name = ?", (MARKS_INDEX,))
        assert marks.is_read() is False
        return source

    def test_the_next_refresh_counts_every_track_with_marks(self, service, unread):
        diff = service.compute_refresh_diff(str(unread), force=True)
        assert diff.marks_changed == 4
        assert not diff.is_empty

    def test_and_writes_them(self, service, db, marks, unread):
        service.apply_refresh(service.compute_refresh_diff(str(unread), force=True))
        assert marks.is_read() is True
        assert marks.counts() == (11, 6)


# ------------------------------------------------------------------- backup


def test_a_restored_launch_backup_brings_the_marks_back(service, db, marks, source):
    service.import_rekordbox_xml(str(source))
    expected = stored(db)
    backup = BackupService(db).backup_on_launch()
    assert backup is not None

    with db.transaction() as conn:
        conn.execute("DELETE FROM track_cues")
        conn.execute("DELETE FROM track_beat_grid")
        conn.execute("DELETE FROM derived_indexes WHERE name = ?", (MARKS_INDEX,))
    assert stored(db) == {}

    BackupService(db).restore(backup.path)
    assert stored(db) == expected
    assert TrackMarksRepository(db).is_read() is True
