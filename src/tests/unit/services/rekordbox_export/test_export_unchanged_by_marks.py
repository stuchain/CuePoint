#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The export is byte-identical with cue points and beat grids imported (WAVE-04).

DEC-077 rested on the fact that nothing in CuePoint parsed ``POSITION_MARK`` or
``TEMPO``. DEC-118 changes that fact and keeps the rule: the importer now reads
both into the library, and the export still patches its source and never writes
a mark. This is the guard.

``marks_export.xml`` beside the fixture was written by the export as it stood
**before** WAVE-04, over a library imported from ``marks.xml``, which carries
every kind of mark, a variable grid and malformed marks. The test imports the
same file through today's importer, makes the same edits, exports the same
Collections, and compares the bytes. Re-parsing and comparing trees would pass
while the file was being quietly reformatted, so the bytes are what is compared.

To write the expected file again (only ever when the export is *meant* to
change, never to make this pass), run the test with
``CUEPOINT_WRITE_EXPORT_GOLDEN=1``.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.rekordbox_export_repository import RekordboxExportRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.rekordbox_export_service import RekordboxExportService
from tests.unit.key_support import accept_with_key

pytestmark = pytest.mark.unit

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "rekordbox"
SOURCE = FIXTURES / "marks.xml"
EXPECTED = FIXTURES / "marks_export.xml"


def _export(tmp_path: Path) -> bytes:
    """Import ``marks.xml``, edit it as a user would, and export two Collections."""
    source = tmp_path / "collection.xml"
    shutil.copyfile(SOURCE, source)

    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    try:
        MigrationRunner(db).migrate()
        tracks = TrackRepository(db)
        sources = LibrarySourceRepository(db)
        LibraryImportService(
            tracks, PlaylistRepository(db), sources, db
        ).import_rekordbox_xml(str(source))
        ids = {
            str(row["rekordbox_track_id"]): int(row["id"])
            for row in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
        }

        # The keys the file carries are given back as Beatport's, by an accepted
        # match: Rekordbox's own key is no longer a key (DEC-201), and the golden
        # file was written when it was. Same keys, so the same bytes.
        for row in (
            db.connect()
            .execute("SELECT id, key FROM tracks WHERE key IS NOT NULL")
            .fetchall()
        ):
            accept_with_key(db, int(row["id"]), str(row["key"]))

        # Values the export patches into the source, so the patch is not empty.
        metadata = TrackMetadataRepository(db)
        metadata.set_override(ids["101"], "genre", "Peak Time Techno")
        metadata.set_override(ids["103"], "key", "Am")

        collections = CollectionRepository(db)
        activity = ActivityService(ActivityRepository(db), tracks)
        collection_service = CollectionService(collections, db, tracks, activity)
        gigs = collection_service.create_folder("Gigs")
        friday = collection_service.create_collection("Friday", gigs.id)
        collection_service.add_tracks(friday.id, [ids["103"], ids["101"], ids["105"]])
        warmup = collection_service.create_collection("Warm-up")
        collection_service.add_tracks(warmup.id, [ids["102"], ids["104"]])

        service = RekordboxExportService(
            track_repository=tracks,
            collection_repository=collections,
            collection_service=collection_service,
            library_source_repository=sources,
            file_status_repository=FileStatusRepository(db),
            export_repository=RekordboxExportRepository(db),
            activity_service=activity,
            database_service=db,
        )
        destination = tmp_path / "out" / "CuePoint Export.xml"
        destination.parent.mkdir()
        ended = service.export(
            [int(gigs.id), int(warmup.id)], "normal", str(destination)
        )
        assert ended.written
        return destination.read_bytes()
    finally:
        db.close_all()


def test_the_export_is_byte_identical_to_before_marks_were_imported(tmp_path: Path):
    written = _export(tmp_path)

    if os.environ.get("CUEPOINT_WRITE_EXPORT_GOLDEN") == "1":
        EXPECTED.write_bytes(written)
        pytest.skip(f"wrote {EXPECTED.name}")

    assert written == EXPECTED.read_bytes()


def test_the_source_marks_reach_the_export_untouched(tmp_path: Path):
    """Every mark the source holds is in the export, byte for byte."""
    written = _export(tmp_path)
    source = SOURCE.read_bytes()

    for line in source.splitlines():
        if b"<POSITION_MARK" in line or b"<TEMPO" in line:
            assert line in written, line
    assert written.count(b"<POSITION_MARK") == source.count(b"<POSITION_MARK")
    assert written.count(b"<TEMPO") == source.count(b"<TEMPO")
