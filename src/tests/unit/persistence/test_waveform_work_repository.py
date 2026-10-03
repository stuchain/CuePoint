#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the library analysis may open, and in which order (WAVE-03).

Over a real, migrated library database:

- only tracks the last check found **present at their current path** are work,
  with the size that check recorded (fact 6);
- the order is **Sets' entries, then Collections', then the rest, newest
  first**, by Rekordbox's date added and then the newest import;
- ``library_paths`` is every track's path, present or not, for pruning.
"""

from __future__ import annotations

from typing import Optional

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    TrackFileStatus,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.waveform_analysis import PresentFile
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_work_repository import WaveformWorkRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-10-03T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    database = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(database).migrate()
    yield database
    database.close_all()


def add(
    db,
    key: str,
    *,
    path: Optional[str] = None,
    status: Optional[str] = FILE_PRESENT,
    checked: Optional[str] = None,
    size: Optional[int] = 1000,
    added: Optional[str] = None,
) -> int:
    file_path = f"/music/{key}.flac" if path is None else path
    TrackRepository(db).add(
        LibraryTrack(
            rekordbox_track_id=key,
            title=key,
            artist="A",
            file_path=file_path,
            date_added=added,
        )
    )
    track_id = int(
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (key,))
        .fetchone()["id"]
    )
    if status is not None and file_path:
        FileStatusRepository(db).record(
            [
                TrackFileStatus(
                    track_id,
                    status,
                    checked if checked is not None else file_path,
                    NOW,
                    size_bytes=size if status == FILE_PRESENT else None,
                )
            ]
        )
    return track_id


def collection(db, kind: str, name: str, *track_ids: int) -> int:
    connection = db.connect()
    cursor = connection.execute(
        "INSERT INTO collections (parent_id, kind, name, position, depth,"
        " created_at, updated_at) VALUES (NULL, ?, ?, 0, 0, ?, ?)",
        (kind, name, NOW, NOW),
    )
    collection_id = int(cursor.lastrowid)
    for position, track_id in enumerate(track_ids):
        connection.execute(
            "INSERT INTO collection_tracks (collection_id, track_id, position,"
            " added_at) VALUES (?, ?, ?, ?)",
            (collection_id, track_id, position, NOW),
        )
    connection.commit()
    return collection_id


def ids(files):
    return [present.track_id for present in files]


class TestWhatIsWork:
    def test_only_present_files_at_their_current_path(self, db):
        present = add(db, "present")
        add(db, "missing", status=FILE_MISSING)
        add(db, "unreadable", status=FILE_UNREADABLE)
        add(db, "unchecked", status=None)
        add(db, "moved", checked="/music/old-place.flac")
        add(db, "no-location", path="", status=None)

        files = WaveformWorkRepository(db).present_files()

        assert files == [PresentFile(present, "/music/present.flac", 1000)]

    def test_the_checks_size_comes_with_it(self, db):
        add(db, "a", size=4321)
        add(db, "b", size=None)

        sizes = {
            present.path: present.size_bytes
            for present in WaveformWorkRepository(db).present_files()
        }

        assert sizes == {"/music/a.flac": 4321, "/music/b.flac": None}

    def test_an_empty_library_has_no_work(self, db):
        assert WaveformWorkRepository(db).present_files() == []
        assert WaveformWorkRepository(db).library_paths() == set()


class TestTheOrder:
    def test_sets_then_collections_then_the_newest(self, db):
        old = add(db, "old", added="2020-01-01")
        newest = add(db, "newest", added="2026-09-01")
        middle = add(db, "middle", added="2024-05-05")
        in_collection = add(db, "in-collection", added="2019-01-01")
        in_set = add(db, "in-set", added="2018-01-01")
        collection(db, "collection", "Crate", in_collection)
        collection(db, "set", "Friday", in_set)

        files = WaveformWorkRepository(db).present_files()

        assert ids(files) == [in_set, in_collection, newest, middle, old]

    def test_a_track_in_a_set_and_a_collection_ranks_as_a_set(self, db):
        plain = add(db, "plain", added="2026-01-01")
        both = add(db, "both", added="2000-01-01")
        collection(db, "collection", "Crate", both)
        collection(db, "set", "Friday", both)

        assert ids(WaveformWorkRepository(db).present_files()) == [both, plain]

    def test_within_a_rank_the_newest_first(self, db):
        first = add(db, "first", added="2021-01-01")
        second = add(db, "second", added="2025-01-01")
        collection(db, "set", "Friday", first, second)

        assert ids(WaveformWorkRepository(db).present_files()) == [second, first]

    def test_without_dates_the_newest_import_first_and_undated_last(self, db):
        undated_old = add(db, "undated-old")
        dated = add(db, "dated", added="2001-01-01")
        undated_new = add(db, "undated-new")

        assert ids(WaveformWorkRepository(db).present_files()) == [
            dated,
            undated_new,
            undated_old,
        ]

    def test_a_smart_collection_or_folder_has_no_members_to_rank(self, db):
        plain = add(db, "plain", added="2026-01-01")
        older = add(db, "older", added="2000-01-01")
        collection(db, "smart", "Rules")
        collection(db, "folder", "Folder")

        assert ids(WaveformWorkRepository(db).present_files()) == [plain, older]

    def test_unordered_answers_the_same_files(self, db):
        for index in range(5):
            add(db, f"t{index}", added=f"202{index}-01-01")
        collection(db, "set", "Friday", 3)

        repository = WaveformWorkRepository(db)

        assert sorted(ids(repository.present_files(ordered=False))) == sorted(
            ids(repository.present_files())
        )


class TestLibraryPaths:
    def test_every_tracks_path_present_or_not(self, db):
        add(db, "present")
        add(db, "missing", status=FILE_MISSING)
        add(db, "unchecked", status=None)
        add(db, "no-location", path="", status=None)

        assert WaveformWorkRepository(db).library_paths() == {
            "/music/present.flac",
            "/music/missing.flac",
            "/music/unchecked.flac",
        }
