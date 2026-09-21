#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The record of each export, read and written (EXPORT-05, DEC-086).

The repository is small; what it must get right is small too. A row is written
once. Playlists are filed under the export they came from. "The most recent
export" means the most recent one that wrote a file, because that is what the
next save dialog is pre-filled from (DEC-083). And an export's rows commit with
the caller's transaction, so a failure after them takes them back.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cuepoint.models.collection import KIND_COLLECTION, KIND_SMART
from cuepoint.models.rekordbox_export import (
    EXPORT_CANCELLED,
    EXPORT_FAILED,
    EXPORT_WRITTEN,
    RekordboxExport,
    RekordboxExportPlaylist,
)
from cuepoint.persistence.rekordbox_export_repository import (
    MAX_RECENT,
    RekordboxExportRepository,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IRekordboxExportRepository
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = "2026-09-21T12:00:00+00:00"
RULES = json.dumps(
    {"match": "all", "rules": [{"field": "bpm", "op": "gte", "value": 124}]}
)


@pytest.fixture()
def db(tmp_path: Path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture()
def repo(db) -> RekordboxExportRepository:
    return RekordboxExportRepository(db)


def export(outcome: str = EXPORT_WRITTEN, **overrides) -> RekordboxExport:
    values = dict(
        started_at=NOW,
        finished_at=NOW,
        outcome=outcome,
        destination_path="C:/Exports/out.xml",
        source_path="C:/Rekordbox/collection.xml",
        track_count=10,
        changed_track_count=2,
        fields_json='["genre"]',
        key_format="normal",
        error="disk full" if outcome == EXPORT_FAILED else None,
    )
    values.update(overrides)
    return RekordboxExport(**values)


def playlist(
    export_id: int, name: str = "Saturday", **overrides
) -> RekordboxExportPlaylist:
    values = dict(
        export_id=export_id,
        collection_id=7,
        kind=KIND_COLLECTION,
        name=name,
        path=f"CuePoint/{name}",
        entry_count=3,
    )
    values.update(overrides)
    return RekordboxExportPlaylist(**values)


class TestWritingARecord:
    def test_an_export_comes_back_with_its_id_and_every_field(self, repo):
        stored = repo.add(
            export(job_id="job-1", source_stale=True, missing_file_count=4)
        )

        assert stored.id is not None
        assert repo.get(int(stored.id)) == stored
        assert stored.job_id == "job-1"
        assert stored.source_stale is True
        assert stored.missing_file_count == 4
        assert stored.fields == ("genre",)

    def test_a_never_checked_count_stays_none(self, repo):
        assert repo.add(export()).missing_file_count is None

    def test_a_recorded_export_is_not_recorded_again(self, repo):
        stored = repo.add(export())

        with pytest.raises(ValueError, match="recorded once"):
            repo.add(stored)

    def test_playlists_are_filed_under_their_export_in_order(self, repo):
        stored = repo.add(export())
        rows = repo.add_playlists(
            [
                playlist(int(stored.id), "Saturday"),
                playlist(int(stored.id), "Fast", kind=KIND_SMART, rules_json=RULES),
            ]
        )

        assert [row.name for row in rows] == ["Saturday", "Fast"]
        assert all(row.id is not None for row in rows)
        assert repo.playlists_for(int(stored.id)) == rows
        assert rows[1].rules_json == RULES

    def test_no_playlists_is_nothing_to_write(self, repo):
        assert repo.add_playlists([]) == []

    def test_a_recorded_playlist_is_not_recorded_again(self, repo):
        stored = repo.add(export())
        (row,) = repo.add_playlists([playlist(int(stored.id))])

        with pytest.raises(ValueError, match="recorded once"):
            repo.add_playlists([row])

    def test_one_exports_playlists_are_not_anothers(self, repo):
        first = repo.add(export())
        second = repo.add(export())
        repo.add_playlists([playlist(int(first.id), "Mine")])

        assert repo.playlists_for(int(second.id)) == []

    def test_the_repository_is_its_interface(self, repo):
        assert isinstance(repo, IRekordboxExportRepository)


class TestReadingItBack:
    def test_nothing_recorded_reads_as_nothing(self, repo):
        assert repo.get(1) is None
        assert repo.for_job("job") is None
        assert repo.recent() == []
        assert repo.latest_written() is None
        assert repo.playlists_for(1) == []

    def test_a_job_finds_the_export_it_recorded(self, repo):
        repo.add(export(job_id="other"))
        mine = repo.add(export(job_id="mine"))

        assert repo.for_job("mine") == mine

    def test_recent_is_newest_first_whatever_the_outcome(self, repo):
        written = repo.add(export())
        cancelled = repo.add(
            export(EXPORT_CANCELLED, track_count=0, changed_track_count=0)
        )
        failed = repo.add(export(EXPORT_FAILED))

        assert [row.id for row in repo.recent()] == [
            failed.id,
            cancelled.id,
            written.id,
        ]

    def test_recent_is_newest_first_even_within_one_clock_tick(self, repo):
        """Ordered by id, because two exports can share a timestamp."""
        first = repo.add(export(started_at=NOW))
        second = repo.add(export(started_at=NOW))

        assert [row.id for row in repo.recent()] == [second.id, first.id]

    def test_recent_honours_its_limit_and_its_bounds(self, repo):
        for _ in range(5):
            repo.add(export())

        assert len(repo.recent(2)) == 2
        assert len(repo.recent(0)) == 1
        assert len(repo.recent(10_000)) == 5
        assert MAX_RECENT == 200

    def test_the_latest_written_skips_what_wrote_nothing(self, repo):
        """What pre-fills the next save dialog (DEC-083): a cancelled or failed
        export's destination is somewhere nothing was written."""
        written = repo.add(export(destination_path="C:/Good/out.xml"))
        repo.add(export(EXPORT_CANCELLED, track_count=0, changed_track_count=0))
        repo.add(export(EXPORT_FAILED))

        assert repo.latest_written() == written


class TestTransactions:
    def test_a_rolled_back_transaction_takes_the_export_and_its_playlists(
        self, repo, db
    ):
        with pytest.raises(RuntimeError):
            with db.transaction():
                stored = repo.add(export())
                repo.add_playlists([playlist(int(stored.id))])
                raise RuntimeError("the activity event could not be written")

        assert repo.recent() == []
        count = (
            db.connect()
            .execute("SELECT count(*) FROM rekordbox_export_playlists")
            .fetchone()[0]
        )
        assert count == 0

    def test_outside_a_transaction_each_call_commits_its_own(self, repo, db):
        stored = repo.add(export())

        other = DatabaseService(db_path=Path(db.db_path))
        try:
            seen = (
                other.connect().execute("SELECT id FROM rekordbox_exports").fetchall()
            )
        finally:
            other.close_all()
        assert [row["id"] for row in seen] == [stored.id]
