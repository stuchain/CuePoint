#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One library, one source file and one export service, for the preview and the write.

EXPORT-04's preview and EXPORT-05's export are only comparable over the same
data: a test that holds the two side by side is the anti-drift property, and it
means nothing if each file built its own library a little differently.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict

import pytest

from cuepoint.models.library_source import source_for_import
from cuepoint.models.library_track import LibraryTrack, utc_now_iso
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.rekordbox_export_repository import RekordboxExportRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.rekordbox_export_service import RekordboxExportService

from .library import LIBRARY, SOURCE


@pytest.fixture()
def db(tmp_path: Path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture()
def source(tmp_path: Path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_bytes(SOURCE)
    return path


@pytest.fixture()
def tracks(db) -> TrackRepository:
    repo = TrackRepository(db)
    repo.add_many([LibraryTrack(**values) for values in LIBRARY])
    return repo


@pytest.fixture()
def ids(db, tracks) -> Dict[str, int]:
    """Rekordbox track id to the library id, which the Collections point at."""
    rows = db.connect().execute("SELECT id, rekordbox_track_id FROM tracks ORDER BY id")
    return {str(row["rekordbox_track_id"]): int(row["id"]) for row in rows}


@pytest.fixture()
def metadata(db, tracks) -> TrackMetadataRepository:
    return TrackMetadataRepository(db)


@pytest.fixture()
def files(db, tracks) -> FileStatusRepository:
    return FileStatusRepository(db)


@pytest.fixture()
def sources(db, source: Path) -> LibrarySourceRepository:
    repo = LibrarySourceRepository(db)
    repo.replace(source_for_import(str(source), utc_now_iso(), len(LIBRARY), 0))
    return repo


@pytest.fixture()
def collections(db, tracks) -> CollectionRepository:
    return CollectionRepository(db)


@pytest.fixture()
def collection_service(db, collections, tracks) -> CollectionService:
    return CollectionService(
        collections, db, tracks, ActivityService(ActivityRepository(db), tracks)
    )


@pytest.fixture()
def service(
    db, tracks, collections, collection_service, sources, files
) -> RekordboxExportService:
    return RekordboxExportService(
        track_repository=tracks,
        collection_repository=collections,
        collection_service=collection_service,
        library_source_repository=sources,
        file_status_repository=files,
        export_repository=RekordboxExportRepository(db),
        activity_service=ActivityService(ActivityRepository(db), tracks),
        database_service=db,
    )


@pytest.fixture()
def tree(collection_service, collections, ids) -> Dict[str, int]:
    """A filing a user might really have, three levels deep.

    Gigs/Saturday and Gigs/2026/Summer hold tracks; Archive/Old is filed
    elsewhere and Loose sits at the top level, so a test can prove that choosing
    one folder brings exactly what is under it.
    """
    gigs = collection_service.create_folder("Gigs")
    saturday = collection_service.create_collection("Saturday", gigs.id)
    year = collection_service.create_folder("2026", gigs.id)
    summer = collection_service.create_collection("Summer", year.id)
    archive = collection_service.create_folder("Archive")
    old = collection_service.create_collection("Old", archive.id)
    loose = collection_service.create_collection("Loose")

    collection_service.add_tracks(saturday.id, [ids["1"], ids["2"]])
    collection_service.add_tracks(summer.id, [ids["3"]])
    collection_service.add_tracks(old.id, [ids["1"]])
    collection_service.add_tracks(loose.id, [ids["2"]])
    return {
        "gigs": int(gigs.id),
        "saturday": int(saturday.id),
        "2026": int(year.id),
        "summer": int(summer.id),
        "archive": int(archive.id),
        "old": int(old.id),
        "loose": int(loose.id),
    }
