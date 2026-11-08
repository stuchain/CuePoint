#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An import writes every track's marks from a spill file, not from memory.

A 2.6 GB export with a beat-by-beat grid held 7.5 GB of cue points and grid
markers in a dict until the track pass ended (PYTHON-1H). The marks now go to an
anonymous file as they are read and come back a thousand tracks at a time, so
memory no longer grows with the file. What it must not change is what is stored:

- **the same rows,** compared with rows captured on the code before the change;
- **the same skipped count,** and the last occurrence of a TrackID winning;
- **one transaction,** so a cancel or a failure still rolls everything back, and
  the spill file is closed whichever way the import ends.
"""

from __future__ import annotations

import gc
import tracemalloc
from pathlib import Path
from typing import Dict, List

import pytest

from cuepoint.models.track_marks import ReadMarks
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services import library_import_service as module
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    ImportCancelled,
    LibraryImportService,
)
from cuepoint.services.marks_spill import MarksSpill
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
def service(db):
    return LibraryImportService(
        TrackRepository(db), PlaylistRepository(db), LibrarySourceRepository(db), db
    )


def edited(text: str, *changes) -> str:
    for old, new in changes:
        assert text.count(old) == 1, old
        text = text.replace(old, new)
    return text


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


# -------------------------------------------------- the same rows as before

BASE = FIXTURE.read_text(encoding="utf-8")

#: The fixture after a second import: a cue moved, a grid marker gone, a mark
#: changed, a mark added to a track that had none (and an unreadable one beside
#: it), a grid removed, and a new track with marks.
SECOND = edited(
    BASE,
    ('Start="64.025" Num="0"', 'Start="65.000" Num="0"'),
    ('      <TEMPO Inizio="60.120" Bpm="122.50" Metro="4/4" Battito="3"/>\n', ""),
    ('Kept" Type="0" Start="20.000"', 'Kept" Type="0" Start="21.000"'),
    (
        '           Location="file://localhost/C:/Music/Marks/no%20marks.mp3"'
        ' Remixer="" Tonality="Dm" Label="" Mix="">\n',
        '           Location="file://localhost/C:/Music/Marks/no%20marks.mp3"'
        ' Remixer="" Tonality="Dm" Label="" Mix="">\n'
        '      <POSITION_MARK Name="Late" Type="0" Start="12.500" Num="4"/>\n'
        '      <POSITION_MARK Name="Bad late" Type="7" Start="12.500" Num="4"/>\n',
    ),
    (
        '      <TEMPO Inizio="0.000" Bpm="132.00" Metro="4/4" Battito="1"/>\n'
        "    </TRACK>\n  </COLLECTION>",
        "    </TRACK>\n"
        '    <TRACK TrackID="106" Name="New" Artist="New"'
        ' Location="file://localhost/C:/Music/Marks/new.mp3">\n'
        '      <TEMPO Inizio="0.5" Bpm="140.00" Metro="4/4" Battito="1"/>\n'
        '      <POSITION_MARK Name="N" Type="0" Start="1.000" Num="0"/>\n'
        "    </TRACK>\n  </COLLECTION>",
    ),
)

#: Captured by importing BASE with the code as it was before the spill file.
STORED_AFTER_FIRST = {
    "101": [
        ("cue", 0, "cue", None, 25, None, "Intro", None),
        ("cue", 1, "cue", 0, 64025, None, "Drop", "#28e214"),
        ("cue", 2, "cue", 1, 96025, None, None, "#e62828"),
        ("cue", 3, "loop", 2, 120025, 127525, "Build loop", "#ff8c00"),
        ("cue", 4, "loop", None, 180025, 182000, None, None),
        ("cue", 5, "fade_in", None, 1500, None, "Fade in", None),
        ("cue", 6, "fade_out", None, 360250, None, "Fade out", None),
        ("cue", 7, "load", None, 32001, None, "Load here", None),
        ("cue", 8, "cue", 7, 300000, None, "H cue", None),
        ("grid", 0, 25, 128.0, "4/4", 1),
    ],
    "102": [
        ("cue", 0, "cue", 3, 15000, None, "Groove", None),
        ("grid", 0, 120, 121.0, "4/4", 1),
        ("grid", 1, 60120, 122.5, "4/4", 3),
        ("grid", 2, 120120, 124.0, "4/4", 1),
    ],
    "103": [
        ("cue", 0, "cue", None, 20000, None, "Kept", None),
        ("grid", 0, 50, 130.0, "4/4", 1),
    ],
    "105": [("grid", 0, 0, 132.0, "4/4", 1)],
}
COUNTS_AFTER_FIRST = (11, 6, 6)

#: Captured by importing SECOND over BASE with the code as it was.
STORED_AFTER_SECOND = {
    "101": [
        ("cue", 0, "cue", None, 25, None, "Intro", None),
        ("cue", 1, "cue", 0, 65000, None, "Drop", "#28e214"),
        ("cue", 2, "cue", 1, 96025, None, None, "#e62828"),
        ("cue", 3, "loop", 2, 120025, 127525, "Build loop", "#ff8c00"),
        ("cue", 4, "loop", None, 180025, 182000, None, None),
        ("cue", 5, "fade_in", None, 1500, None, "Fade in", None),
        ("cue", 6, "fade_out", None, 360250, None, "Fade out", None),
        ("cue", 7, "load", None, 32001, None, "Load here", None),
        ("cue", 8, "cue", 7, 300000, None, "H cue", None),
        ("grid", 0, 25, 128.0, "4/4", 1),
    ],
    "102": [
        ("cue", 0, "cue", 3, 15000, None, "Groove", None),
        ("grid", 0, 120, 121.0, "4/4", 1),
        ("grid", 1, 120120, 124.0, "4/4", 1),
    ],
    "103": [
        ("cue", 0, "cue", None, 21000, None, "Kept", None),
        ("grid", 0, 50, 130.0, "4/4", 1),
    ],
    "104": [("cue", 0, "cue", 4, 12500, None, "Late", None)],
    "106": [
        ("cue", 0, "cue", 0, 1000, None, "N", None),
        ("grid", 0, 500, 140.0, "4/4", 1),
    ],
}
COUNTS_AFTER_SECOND = (13, 5, 7)


class TestTheSameRowsAsBefore:
    @pytest.mark.parametrize("chunk", [None, 1, 2, 3])
    def test_two_imports_store_the_rows_the_old_code_stored(
        self, service, db, tmp_path, monkeypatch, chunk
    ):
        if chunk is not None:
            # `raising=False`: the constant does not exist before the spill file.
            monkeypatch.setattr(module, "MARKS_CHUNK_SIZE", chunk, raising=False)
        first = tmp_path / "first.xml"
        second = tmp_path / "second.xml"
        first.write_text(BASE, encoding="utf-8")
        second.write_text(SECOND, encoding="utf-8")

        summary = service.import_rekordbox_xml(str(first))
        assert stored(db) == STORED_AFTER_FIRST
        assert (
            summary.marks.cues,
            summary.marks.markers,
            summary.marks.skipped,
        ) == COUNTS_AFTER_FIRST

        summary = service.import_rekordbox_xml(str(second))
        assert stored(db) == STORED_AFTER_SECOND
        assert (
            summary.marks.cues,
            summary.marks.markers,
            summary.marks.skipped,
        ) == COUNTS_AFTER_SECOND

    def test_a_refresh_stores_the_same_rows_and_records_the_marks_read(
        self, service, db, tmp_path
    ):
        first = tmp_path / "first.xml"
        first.write_text(BASE, encoding="utf-8")
        service.import_rekordbox_xml(str(first))
        first.write_text(SECOND, encoding="utf-8")

        diff = service.compute_refresh_diff(str(first))
        summary = service.apply_refresh(diff)

        assert stored(db) == STORED_AFTER_SECOND
        assert summary.marks.skipped == 7
        assert TrackMarksRepository(db).is_read() is True

    @pytest.mark.parametrize("chunk", [1, 2, 100])
    def test_a_track_id_seen_twice_keeps_the_last_marks_and_adds_the_skipped(
        self, service, db, tmp_path, monkeypatch, chunk
    ):
        """The dict this replaces kept the last occurrence of a TrackID, and so did
        the marks. A file cannot carry the same id twice into the tracks (the
        unique TrackID refuses it first), so this feeds the write directly; the
        skipped counts are then added as they are read, as there is no repeat to
        take the last of."""
        monkeypatch.setattr(module, "MARKS_CHUNK_SIZE", chunk)
        path = tmp_path / "first.xml"
        path.write_text(BASE, encoding="utf-8")
        service.import_rekordbox_xml(str(path))

        cue = ("cue", None, 1000, None, "first", None)
        last = ("cue", 2, 2000, None, "last", None)
        grid = (0, 120.0, "4/4", 1)
        with MarksSpill() as spill:
            spill.add("104", ReadMarks((cue,), (grid,), 5))
            spill.add("105", ReadMarks((), (grid,), 0))
            spill.add("104", ReadMarks((last,), (), 1))
            spill.add("999", ReadMarks((cue,), (), 2))  # a track the library lacks
            with db.transaction():
                written = service._write_marks(spill)

        rows = stored(db)
        assert rows["104"] == [("cue", 0, "cue", 2, 2000, None, "last", None)]
        assert rows["105"] == [("grid", 0, 0, 120.0, "4/4", 1)]
        assert "999" not in rows
        # A track the spill does not hold keeps what it had.
        for kept in ("101", "102", "103"):
            assert rows[kept] == STORED_AFTER_FIRST[kept]
        if chunk >= 4:
            # In one step the earlier occurrence is never written. Across steps it
            # is written and then replaced, and the summary counts both writes.
            assert (written.cues, written.markers) == (1, 1)
        assert written.skipped == 5 + 1 + 2


# ------------------------------------------------------------ not held


def write_heavy_export(path: Path, tracks: int, markers: int) -> str:
    """A collection whose every track has a dynamic grid and a few cues."""
    grid = "".join(
        f'<TEMPO Inizio="{n * 0.5:.3f}" Bpm="124.00" Metro="4/4" Battito="{n % 4 + 1}"/>'
        for n in range(markers)
    )
    rows = "\n".join(
        f'<TRACK TrackID="{i}" Name="T{i}" Artist="A" '
        f'Location="file://localhost/m/{i}.mp3">{grid}'
        f'<POSITION_MARK Name="Drop" Type="0" Start="{i % 90}.5" Num="0"/>'
        f'<POSITION_MARK Name="" Type="0" Start="{i % 90 + 1}.5" Num="-1"/>'
        "</TRACK>"
        for i in range(tracks)
    )
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">'
        f'<COLLECTION Entries="{tracks}">{rows}</COLLECTION>'
        '<PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS></DJ_PLAYLISTS>',
        encoding="utf-8",
    )
    return str(path)


class RecordingSpill(MarksSpill):
    """The real spill file, remembering what it was asked to do."""

    made: List["RecordingSpill"] = []

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.directories = args
        self.added = 0
        RecordingSpill.made.append(self)

    def add(self, rekordbox_id, read) -> None:
        self.added += 1
        super().add(rekordbox_id, read)


@pytest.fixture
def spills(monkeypatch):
    RecordingSpill.made = []
    monkeypatch.setattr(module, "MarksSpill", RecordingSpill)
    return RecordingSpill.made


#: 3,000 tracks of 12 grid markers and 2 cues each. 24 markers a track takes
#: nearly 5 s under tracemalloc, which is most of what the test costs, so this
#: holds half the marks and keeps the test under 3 s.
TRACKS = 3_000
MARKERS = 12


class TestMarksAreNotHeld:
    def test_every_track_s_marks_go_to_the_spill_file(self, service, spills, tmp_path):
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")

        service.import_rekordbox_xml(str(path))

        (spill,) = spills
        assert spill.added == 5  # every track, those with no marks included

    def test_the_track_pass_keeps_no_marks_dict(self, tmp_path):
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")
        observed: Dict[str, object] = {"total": 5}

        with MarksSpill() as spill:
            tracks = list(
                LibraryImportService._observed_tracks(
                    str(path), observed, spill, None, None
                )
            )
            assert len(tracks) == 5
            assert sum(1 for _ in spill.chunks(2)) == 3

        assert set(observed) == {"total"}

    def test_the_peak_memory_of_an_import_does_not_grow_with_the_marks(
        self, service, tmp_path
    ):
        """3,000 tracks with 12 grid markers and 2 cues each. The dict this
        replaces peaked at 10.5 MB here, and grows with every mark; the import
        now peaks at 6 MB, which is the tracks' own bookkeeping, not the
        marks. The bound sits between the two."""
        path = write_heavy_export(tmp_path / "heavy.xml", TRACKS, MARKERS)
        gc.collect()
        tracemalloc.start()
        try:
            summary = service.import_rekordbox_xml(path)
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        assert summary.marks.markers == TRACKS * MARKERS
        assert summary.marks.cues == TRACKS * 2
        assert peak < 8 * 1024 * 1024, f"peak {peak / 1e6:.1f} MB"


class TestWhereTheSpillLives:
    def test_an_import_makes_it_in_the_library_s_folder(
        self, service, db, spills, tmp_path
    ):
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")

        service.import_rekordbox_xml(str(path))

        (spill,) = spills
        assert spill.directories == (db.db_path.parent,)

    def test_the_file_is_made_in_the_folder_it_is_given(self, tmp_path, monkeypatch):
        import tempfile

        made = []
        real = tempfile.TemporaryFile

        def recording(*args, **kwargs):
            made.append(kwargs.get("dir"))
            return real(*args, **kwargs)

        monkeypatch.setattr(tempfile, "TemporaryFile", recording)
        with MarksSpill(tmp_path):
            pass
        assert made == [str(tmp_path)]

    def test_a_folder_that_cannot_be_written_fails_the_import_and_stores_nothing(
        self, service, db, tmp_path, monkeypatch
    ):
        import tempfile

        def refuse(*args, **kwargs):
            raise OSError(28, "No space left on device")

        monkeypatch.setattr(tempfile, "TemporaryFile", refuse)
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")

        with pytest.raises(OSError):
            service.import_rekordbox_xml(str(path))

        assert stored(db) == {}
        assert TrackRepository(db).count() == 0


# ------------------------------------------------- rollback and the spill


class TestTheSpillFileEndsWithTheImport:
    def test_it_is_closed_when_the_import_finishes(self, service, spills, tmp_path):
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")
        service.import_rekordbox_xml(str(path))
        assert [s.closed for s in spills] == [True]

    def test_a_cancel_mid_import_rolls_back_and_closes_it(
        self, service, db, spills, tmp_path
    ):
        first = tmp_path / "first.xml"
        first.write_text(BASE, encoding="utf-8")
        service.import_rekordbox_xml(str(first))
        before = stored(db)
        spills.clear()
        second = tmp_path / "second.xml"
        second.write_text(SECOND, encoding="utf-8")
        asked = [0]

        def cancel_late() -> bool:
            asked[0] += 1
            return asked[0] > 4

        with pytest.raises(ImportCancelled):
            service.import_rekordbox_xml(str(second), should_cancel=cancel_late)

        assert stored(db) == before
        assert [s.closed for s in spills] == [True]

    def test_a_failure_in_the_playlist_phase_rolls_back_and_closes_it(
        self, service, db, spills, tmp_path, monkeypatch
    ):
        def fail(*_args, **_kwargs):
            raise RuntimeError("the playlist mirror failed")

        monkeypatch.setattr(service._playlists, "replace_tree", fail)
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")

        with pytest.raises(RuntimeError):
            service.import_rekordbox_xml(str(path))

        assert stored(db) == {}
        assert TrackMarksRepository(db).is_read() is False
        assert db.connect().execute("SELECT COUNT(*) FROM tracks").fetchone()[0] == 0
        assert [s.closed for s in spills] == [True]

    def test_a_failure_while_writing_the_marks_rolls_back_and_closes_it(
        self, service, db, spills, tmp_path, monkeypatch
    ):
        def fail(*_args, **_kwargs):
            raise OSError("disk full")

        monkeypatch.setattr(service._marks, "replace_many", fail)
        path = tmp_path / "c.xml"
        path.write_text(BASE, encoding="utf-8")

        with pytest.raises(OSError):
            service.import_rekordbox_xml(str(path))

        assert db.connect().execute("SELECT COUNT(*) FROM tracks").fetchone()[0] == 0
        assert [s.closed for s in spills] == [True]


class TestTheSpillFile:
    def test_it_hands_back_what_was_added_in_order_and_in_chunks(self):
        entries = [
            (str(n), ReadMarks(((("cue"), None, n, None, None, None),), (), n % 2))
            for n in range(7)
        ]
        with MarksSpill() as spill:
            for key, read in entries:
                spill.add(key, read)
            chunks = list(spill.chunks(3))
            again = list(spill.chunks(3))

        assert [len(c) for c in chunks] == [3, 3, 1]
        assert [pair for chunk in chunks for pair in chunk] == entries
        assert again == chunks

    def test_an_empty_one_has_no_chunks(self):
        with MarksSpill() as spill:
            assert list(spill.chunks(10)) == []

    def test_it_is_closed_after_the_block_and_by_close(self):
        with MarksSpill() as spill:
            assert spill.closed is False
        assert spill.closed is True
        spill.close()  # twice is fine
