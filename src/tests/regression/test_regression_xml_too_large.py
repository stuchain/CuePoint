"""Regression test: PYTHON-1H.

A 2.6 GB Rekordbox export was refused by the import, because every reader shared
a 100 MiB limit meant for the readers that build the whole tree. The import and
the refresh stream, so they take the library limit.

See ``PYTHON-1H/README.md``. The assertion is the symptom the user saw: the
import of that file works.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner

#: What the file in the report weighed.
SIZE_OF_THE_REPORTED_FILE = 2_616_715_592

TRACK_COUNT = 25


def _export(tmp_path: Path) -> str:
    tracks = "\n".join(
        f'<TRACK TrackID="{i}" Name="Track {i}" Artist="Artist {i}" '
        'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" TotalTime="360" '
        f'Location="file://localhost/music/track-{i}.mp3">'
        '<TEMPO Inizio="0.025" Bpm="124.00" Metro="4/4" Battito="1"/>'
        '<POSITION_MARK Name="Drop" Type="0" Start="64.0" Num="0"/></TRACK>'
        for i in range(TRACK_COUNT)
    )
    refs = "".join(f'<TRACK Key="{i}"/>' for i in range(TRACK_COUNT))
    path = tmp_path / "collection.xml"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{TRACK_COUNT}">\n{tracks}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0">'
        f'<NODE Name="Set" Type="1" Entries="{TRACK_COUNT}">{refs}</NODE>'
        "</NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


@pytest.mark.integration
def test_an_export_of_2_6_gb_is_imported(tmp_path, monkeypatch):
    """The import of the reported file's size succeeds, marks included."""
    path = _export(tmp_path)
    real_getsize = os.path.getsize
    monkeypatch.setattr(
        os.path,
        "getsize",
        lambda p: SIZE_OF_THE_REPORTED_FILE if str(p) == path else real_getsize(p),
    )
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    try:
        importer = LibraryImportService(
            TrackRepository(service),
            PlaylistRepository(service),
            LibrarySourceRepository(service),
            service,
        )
        summary = importer.import_rekordbox_xml(path)
    finally:
        service.close_all()

    assert summary.tracks_inserted == TRACK_COUNT
    assert summary.marks.cues == TRACK_COUNT
    assert summary.marks.markers == TRACK_COUNT
