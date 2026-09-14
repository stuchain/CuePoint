#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An override survives everything that rewrites the imported record (CLEAN-05).

CLEAN-05's acceptance criterion: applied and hand-edited values survive import,
refresh, restart and backup/restore. And its guard in the other direction:
nothing that should read what Rekordbox imported reads the override instead —
not the refresh diff, and not the match adapter (CLEAN-03).

The pipeline is real, as in ``test_cuepoint_metadata_survives_refresh``: the
actual import and refresh over real XML files.
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.match_input import library_track_to_track
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_refresh_diff import track_xml, write_export

EMPTY_PLAYLISTS = '<NODE Name="ROOT" Type="0"></NODE>'

#: What the user said about track "1". The imported record says Tonality 8A,
#: AverageBpm 124, Genre House, Label "Label", Year 2024 (``TRACK_ATTRS``).
OVERRIDES = {"key": "Fm", "bpm": 130.0, "genre": "Dub", "label": "Mine", "year": 1999}

#: The same, as stored: the library's keys are Camelot, so F minor is 4A.
STORED = {"key": "4A", "bpm": 130.0, "genre": "Dub", "label": "Mine", "year": 1999}

#: Track "1" after Rekordbox changed its mind about key, BPM and genre. Written
#: out whole rather than through ``track_xml``'s overrides, which are for one
#: attribute at a time.
CHANGED_ONE = (
    '<TRACK TrackID="1" Name="One" Artist="A" Genre="Techno" Album="Album" '
    'Label="Label" Tonality="5A" AverageBpm="126.00" Year="2024" TotalTime="360" '
    'BitRate="320" Rating="204" PlayCount="7" DateAdded="2024-01-01" Comments="c" '
    'Location="file://localhost/m/one.mp3"/>'
)


@pytest.fixture
def path(tmp_path):
    return tmp_path / "cuepoint.db"


@pytest.fixture
def db(path):
    service = DatabaseService(db_path=path)
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def services(database) -> Dict[str, object]:
    tracks = TrackRepository(database)
    return {
        "tracks": tracks,
        "metadata": MetadataService(
            TrackMetadataRepository(database),
            tracks,
            ActivityService(ActivityRepository(database), tracks),
            database,
        ),
        "importer": LibraryImportService(
            tracks,
            PlaylistRepository(database),
            LibrarySourceRepository(database),
            database,
        ),
    }


@pytest.fixture
def exports(tmp_path) -> Dict[str, str]:
    others = [
        track_xml("2", "/m/two.mp3", "Two", "B"),
        track_xml("3", "/m/three.mp3", "Three", "C"),
    ]
    base = write_export(
        tmp_path,
        [track_xml("1", "/m/one.mp3", "One", "A"), *others],
        EMPTY_PLAYLISTS,
        name="base.xml",
    )
    changed = write_export(
        tmp_path, [CHANGED_ONE, *others], EMPTY_PLAYLISTS, name="changed.xml"
    )
    return {"base": base, "changed": changed}


@pytest.fixture
def edited(db, exports) -> int:
    """The base export imported, and every override set on track "1"."""
    parts = services(db)
    parts["importer"].import_rekordbox_xml(exports["base"])
    track_id = int(parts["tracks"].find_by_rekordbox_id("1").id)
    for field, value in OVERRIDES.items():
        source = "beatport" if field in ("key", "bpm") else "cuepoint"
        parts["metadata"].set_override(track_id, field, value, source=source)
    return track_id


def overrides(database, track_id: int) -> Dict[str, object]:
    record = services(database)["metadata"].get(track_id)
    return {field: getattr(record, field) for field in OVERRIDES}


def found(database, field: str, value) -> List[int]:
    query = BrowseQuery(rules=RuleSet(rules=(FilterRule(field, "is", value),)))
    return services(database)["tracks"].browse_ids(query, limit=100)


class TestImport:
    def test_importing_the_same_file_again_keeps_every_override(
        self, db, exports, edited
    ):
        services(db)["importer"].import_rekordbox_xml(exports["base"])
        assert overrides(db, edited) == STORED
        assert found(db, "genre", "Dub") == [edited]


class TestRefresh:
    @pytest.fixture
    def refreshed(self, db, exports, edited):
        importer = services(db)["importer"]
        importer.apply_refresh(importer.compute_refresh_diff(exports["changed"]))
        return edited

    def test_a_refresh_changing_rekordboxs_values_leaves_the_overrides_alone(
        self, db, refreshed
    ):
        imported = services(db)["tracks"].get(refreshed)
        assert (imported.key, imported.bpm, imported.genre) == ("5A", 126.0, "Techno")
        assert overrides(db, refreshed) == STORED

    def test_the_effective_values_are_still_the_overrides(self, db, refreshed):
        assert found(db, "key", "4A") == [refreshed]
        assert found(db, "genre", "Dub") == [refreshed]
        assert found(db, "genre", "Techno") == []

    def test_the_imported_names_see_what_rekordbox_now_says(self, db, refreshed):
        assert found(db, "key_rekordbox", "5A") == [refreshed]
        assert found(db, "bpm_rekordbox", 126) == [refreshed]

    def test_the_refresh_writes_no_override_history(self, db, refreshed):
        rows = db.connect().execute(
            "SELECT count(*) FROM track_history WHERE field LIKE 'cuepoint_%'"
        )
        assert rows.fetchone()[0] == len(OVERRIDES)


class TestTheDiffReadsWhatRekordboxImported:
    def test_an_override_is_not_a_change_rekordbox_made(self, db, exports, edited):
        diff = services(db)["importer"].compute_refresh_diff(exports["base"])
        assert (diff.added.count, diff.changed.count, diff.removed.count) == (0, 0, 0)

    def test_rekordboxs_own_change_is_measured_from_its_own_value(
        self, db, exports, edited
    ):
        diff = services(db)["importer"].compute_refresh_diff(exports["changed"])
        assert diff.changed.count == 1
        (change,) = diff.changed.items
        # Key, BPM and genre changed in the export. Label and year did not —
        # though an override covers both, which a diff reading effective values
        # would have reported as changes too.
        assert {"key", "bpm", "genre"} <= set(change.fields)
        assert "label" not in change.fields and "year" not in change.fields


class TestTheMatchAdapterReadsWhatRekordboxImported:
    def test_the_question_asked_of_beatport_is_the_imported_record(self, db, edited):
        asked = library_track_to_track(services(db)["tracks"].get(edited))
        assert (asked.key, asked.bpm, asked.genre, asked.label, asked.year) == (
            "8A",
            124.0,
            "House",
            "Label",
            2024,
        )


class TestRestart:
    def test_a_new_process_reads_every_override_back(self, db, path, edited):
        db.close_all()
        reopened = DatabaseService(db_path=path)
        try:
            MigrationRunner(reopened).migrate()
            assert overrides(reopened, edited) == STORED
            assert found(reopened, "label", "Mine") == [edited]
        finally:
            reopened.close_all()


class TestBackupAndRestore:
    def test_a_restore_brings_back_the_overrides_and_their_history(self, db, edited):
        backup = BackupService(db).create_backup(reason="test")
        services(db)["metadata"].clear(edited)
        assert services(db)["metadata"].get(edited) is None

        BackupService(db).restore(backup.path)

        assert overrides(db, edited) == STORED
        sources = {
            row["field"]: row["source"]
            for row in db.connect().execute(
                "SELECT field, source FROM track_history"
                " WHERE field LIKE 'cuepoint_%' AND old_value_json IS NULL"
            )
        }
        assert sources == {
            "cuepoint_key": "beatport",
            "cuepoint_bpm": "beatport",
            "cuepoint_genre": "cuepoint",
            "cuepoint_label": "cuepoint",
            "cuepoint_year": "cuepoint",
        }
