#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A restored launch backup brings the marks back, and finds the waveforms (WAVE-07).

Phase 11 keeps two kinds of data, and DEC-122 put them on either side of the
launch backup (DEC-009):

- **Cue points and beat grids** are rows of the library database, so the
  backup copies them, and a restore brings them back with the tracks they
  belong to.
- **Waveforms** live in ``waveforms.db`` beside it, outside every backup,
  keyed by the file's path. A restore leaves the store alone, and a restored
  library finds each track's waveform by its path, with nothing analysed again.

WAVE-02 and WAVE-04 each held one half. This holds the phase's whole promise
in one sequence, the way it happens: a library imported with its marks,
checked and analysed, backed up at launch, then lost, then restored, and read
back through the services the Inspector and the analysis use.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
from cuepoint.models.waveform import OUTCOME_READY, STATE_READY
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_store import (
    WaveformStore,
    default_waveform_store_path,
)
from cuepoint.persistence.waveform_work_repository import WaveformWorkRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.waveform_analysis_service import WaveformAnalysisService
from cuepoint.services.waveform_service import WaveformService
from tests.fixtures.waveform_library import DECODER, StubDecoder

pytestmark = pytest.mark.unit

NOW = "2026-10-05T12:00:00+00:00"
NAMES = ("one.flac", "two.flac", "three.flac")


def write_export(folder: Path) -> Path:
    """Three tracks on disk; the first with a hot cue, a memory cue and a grid."""
    music = folder / "music"
    music.mkdir()
    tracks = []
    for index, name in enumerate(NAMES, start=1):
        file = music / name
        file.write_bytes(name.encode("utf-8") * 64)
        location = "file://localhost/" + file.as_posix().lstrip("/")
        marks = (
            '<TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>'
            '<POSITION_MARK Name="Drop" Type="0" Start="2.000" Num="0"'
            ' Red="230" Green="40" Blue="40"/>'
            '<POSITION_MARK Name="" Type="0" Start="30.500" Num="-1"/>'
            if index == 1
            else ""
        )
        tracks.append(
            f'<TRACK TrackID="{index}" Name="{name}" Artist="Ada"'
            f' Location="{location}">{marks}</TRACK>'
        )
    xml = folder / "collection.xml"
    xml.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">'
        f'<COLLECTION Entries="{len(tracks)}">{"".join(tracks)}</COLLECTION>'
        '<PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS></DJ_PLAYLISTS>\n',
        encoding="utf-8",
    )
    return xml


class Library:
    """The library database, the store and the services over both."""

    def __init__(self, folder: Path) -> None:
        self.db = DatabaseService(db_path=folder / "cuepoint.db")
        MigrationRunner(self.db).migrate()
        self.tracks = TrackRepository(self.db)
        self.files = FileStatusRepository(self.db)
        self.marks = TrackMarksRepository(self.db)
        self.store = WaveformStore(default_waveform_store_path(self.db.db_path))
        self.decoder = StubDecoder()
        self.waveforms = WaveformService(
            self.files, self.store, decoder=lambda: DECODER, decode_file=self.decoder
        )
        self.analysis = WaveformAnalysisService(
            WaveformWorkRepository(self.db), self.store, self.waveforms
        )
        self.importer = LibraryImportService(
            self.tracks,
            PlaylistRepository(self.db),
            LibrarySourceRepository(self.db),
            self.db,
            activity_service=ActivityService(ActivityRepository(self.db), self.tracks),
        )

    def ids(self) -> dict[str, int]:
        rows = self.db.connect().execute("SELECT id, file_path FROM tracks").fetchall()
        return {Path(row["file_path"]).name: int(row["id"]) for row in rows}

    def check(self) -> None:
        """Record every file present at its size now, as the file check does."""
        rows = self.db.connect().execute("SELECT id, file_path FROM tracks").fetchall()
        self.files.record(
            [
                TrackFileStatus(
                    int(row["id"]),
                    FILE_PRESENT,
                    row["file_path"],
                    NOW,
                    size_bytes=Path(row["file_path"]).stat().st_size,
                )
                for row in rows
            ]
        )

    def close(self) -> None:
        self.store.close_all()
        self.db.close_all()


@pytest.fixture
def library(tmp_path):
    made = Library(tmp_path)
    yield made
    made.close()


@pytest.fixture
def restored(library, tmp_path):
    """Imported, checked and analysed; backed up at launch; lost; restored."""
    library.importer.import_rekordbox_xml(str(write_export(tmp_path)))
    library.check()
    for name, track_id in library.ids().items():
        assert library.waveforms.analyse(track_id).outcome == OUTCOME_READY, name
    expected = {
        "ids": library.ids(),
        "marks": library.marks.get(library.ids()["one.flac"]),
        "store": library.store.path.read_bytes(),
    }
    backup = BackupService(library.db).backup_on_launch()
    assert backup is not None

    # The loss, the way it looks: the database is still there, its tracks and
    # their marks are not.
    with library.db.transaction() as conn:
        for table in ("track_cues", "track_beat_grid", "track_files", "tracks"):
            conn.execute(f"DELETE FROM {table}")
    assert library.ids() == {}
    assert library.marks.counts() == (0, 0)

    BackupService(library.db).restore(backup.path)
    library.decoder.opened.clear()
    return expected, backup


class TestARestoredLaunchBackup:
    def test_brings_the_marks_back_with_their_tracks(self, library, restored):
        expected, _ = restored
        assert library.ids() == expected["ids"]
        marks = library.marks.get(expected["ids"]["one.flac"])
        assert marks == expected["marks"]
        assert [(cue.hot_cue, cue.start_ms, cue.color) for cue in marks.cues] == [
            (0, 2_000, "#e62828"),
            (None, 30_500, None),
        ]
        assert [(marker.start_ms, marker.bpm) for marker in marks.grid] == [(25, 128.0)]
        assert library.marks.is_read() is True

    def test_finds_every_waveform_by_its_path_and_analyses_nothing(
        self, library, restored
    ):
        expected, _ = restored
        ids = list(expected["ids"].values())
        assert [state.state for state in library.waveforms.states(ids)] == [
            STATE_READY
        ] * len(NAMES)
        assert all(
            answer.data is not None for answer in library.waveforms.waveforms(ids, 120)
        )
        plan = library.analysis.plan()
        assert (plan.present, plan.analysed, plan.pending_total) == (3, 3, 0)
        assert library.decoder.opened == []

    def test_leaves_the_store_alone_and_holds_none_of_it(self, library, restored):
        expected, backup = restored
        assert library.store.path.read_bytes() == expected["store"]
        assert library.store.count() == len(NAMES)
        assert {Path(path).name for path in library.store.paths()} == set(NAMES)
        # The backup is the library database alone: no picture is in it.
        copy = sqlite3.connect(str(backup.path))
        try:
            tables = {
                row[0]
                for row in copy.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
        finally:
            copy.close()
        assert {"tracks", "track_cues", "track_beat_grid"} <= tables
        assert not any("waveform" in table for table in tables)
