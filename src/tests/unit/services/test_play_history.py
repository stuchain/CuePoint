#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the play history an import and a refresh keep (STATS-01).

DEC-137 decides what is stored, and these tests are that decision read back
through the real import and refresh over real XML:

- the **first** read of a library stores every known count (the baseline) and
  never an unknown one;
- after that a track stores a row only when its count *moved*, up or down, to
  a known value; a count that becomes unknown stores nothing, and one that
  becomes known again stores its value;
- a new track stores its first known count;
- one ``library_reads`` row is left by every read, whether or not anything
  changed, with the library's size and the number of rows that read stored;
- a re-link keeps ``tracks.id``, so the history follows the track;
- a failed refresh leaves both tables exactly as they were.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.play_history_repository import PlayHistoryRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures import legacy_rows

pytestmark = pytest.mark.unit

PLAYLISTS = '<NODE Name="ROOT" Type="0"></NODE>'


def track(track_id: str, path: str, plays: int | None) -> str:
    """One ``TRACK`` element; ``plays`` None leaves ``PlayCount`` out."""
    count = "" if plays is None else f' PlayCount="{plays}"'
    return (
        f'<TRACK TrackID="{track_id}" Name="T{track_id}" Artist="A"{count} '
        f'Location="file://localhost{path}"/>'
    )


def export(tmp_path: Path, name: str, *tracks: str) -> str:
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n' + "\n".join(tracks) + "\n"
        "  </COLLECTION>\n"
        f"  <PLAYLISTS>{PLAYLISTS}</PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


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
def playlists(db):
    return PlaylistRepository(db)


@pytest.fixture
def service(db, tracks, playlists):
    return LibraryImportService(tracks, playlists, LibrarySourceRepository(db), db)


def reads(db):
    return [
        tuple(row)
        for row in db.connect().execute(
            "SELECT id, kind, tracks, changed FROM library_reads ORDER BY id"
        )
    ]


def counts(db) -> dict[str, dict[int, int]]:
    """``{rekordbox TrackID: {read id: stored count}}``."""
    found: dict[str, dict[int, int]] = {}
    for row in db.connect().execute(
        "SELECT t.rekordbox_track_id, p.read_id, p.play_count FROM play_counts p"
        " JOIN tracks t ON t.id = p.track_id ORDER BY p.read_id"
    ):
        found.setdefault(row[0], {})[row[1]] = row[2]
    return found


def everything(db):
    connection = db.connect()
    return (
        [
            tuple(r)
            for r in connection.execute("SELECT * FROM library_reads ORDER BY id")
        ],
        [
            tuple(r)
            for r in connection.execute(
                "SELECT * FROM play_counts ORDER BY track_id, read_id"
            )
        ],
    )


@pytest.fixture
def first(service, tmp_path):
    """A first import: track 1 played 5 times, 2 never, 3 unknown."""
    path = export(
        tmp_path,
        "first.xml",
        track("1", "/m/one.mp3", 5),
        track("2", "/m/two.mp3", 0),
        track("3", "/m/three.mp3", None),
    )
    service.import_rekordbox_xml(path)
    return path


class TestTheFirstImport:
    def test_it_stores_every_known_count_and_no_unknown_one(self, db, first):
        assert counts(db) == {"1": {1: 5}, "2": {1: 0}}

    def test_it_leaves_one_import_read_describing_the_library(self, db, first):
        assert reads(db) == [(1, "import", 3, 2)]

    def test_its_read_is_dated_when_cuepoint_read_the_file(self, db, first):
        read_at = (
            db.connect().execute("SELECT read_at FROM library_reads").fetchone()[0]
        )
        assert read_at.startswith("20")
        assert "T" in read_at


class TestARefresh:
    def refresh(self, service, tmp_path, name, *tracks):
        path = export(tmp_path, name, *tracks)
        return service.apply_refresh(service.compute_refresh_diff(path, force=True))

    def test_with_nothing_played_it_adds_a_read_and_no_counts(
        self, db, service, first, tmp_path
    ):
        self.refresh(
            service,
            tmp_path,
            "same.xml",
            track("1", "/m/one.mp3", 5),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        assert reads(db) == [(1, "import", 3, 2), (2, "refresh", 3, 0)]
        assert counts(db) == {"1": {1: 5}, "2": {1: 0}}

    def test_a_count_that_went_up_is_stored(self, db, service, first, tmp_path):
        self.refresh(
            service,
            tmp_path,
            "up.xml",
            track("1", "/m/one.mp3", 9),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        assert counts(db)["1"] == {1: 5, 2: 9}
        assert counts(db)["2"] == {1: 0}
        assert reads(db)[-1] == (2, "refresh", 3, 1)

    def test_a_count_that_went_down_is_stored(self, db, service, first, tmp_path):
        self.refresh(
            service,
            tmp_path,
            "down.xml",
            track("1", "/m/one.mp3", 2),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        assert counts(db)["1"] == {1: 5, 2: 2}

    def test_a_count_that_becomes_unknown_stores_nothing(
        self, db, service, first, tmp_path
    ):
        self.refresh(
            service,
            tmp_path,
            "gone.xml",
            track("1", "/m/one.mp3", None),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        assert counts(db)["1"] == {1: 5}
        assert reads(db)[-1] == (2, "refresh", 3, 0)

    def test_a_count_that_becomes_known_again_is_stored(
        self, db, service, first, tmp_path
    ):
        self.refresh(
            service,
            tmp_path,
            "gone.xml",
            track("1", "/m/one.mp3", None),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )
        self.refresh(
            service,
            tmp_path,
            "back.xml",
            track("1", "/m/one.mp3", 5),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", 4),
        )

        # Track 1 returns at the very value it had: unknown -> known stores it.
        assert counts(db)["1"] == {1: 5, 3: 5}
        # Track 3 was unknown at the baseline and is known now.
        assert counts(db)["3"] == {3: 4}
        assert reads(db)[-1] == (3, "refresh", 3, 2)

    def test_a_new_track_stores_its_first_count(self, db, service, first, tmp_path):
        self.refresh(
            service,
            tmp_path,
            "new.xml",
            track("1", "/m/one.mp3", 5),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
            track("4", "/m/four.mp3", 11),
            track("5", "/m/five.mp3", None),
        )

        assert counts(db)["4"] == {2: 11}
        assert "5" not in counts(db)
        assert reads(db)[-1] == (2, "refresh", 5, 1)

    @pytest.mark.parametrize(
        "case, moved",
        [
            # Rekordbox renumbered it: the path is the same, the TrackID is not.
            ("renumbered", {"id": "101", "path": "/m/one.mp3"}),
            # The file moved on disk: the TrackID is the same, the path is not.
            ("moved", {"id": "1", "path": "/elsewhere/one.mp3"}),
        ],
    )
    def test_a_relinked_track_keeps_its_history(
        self, db, service, first, tmp_path, case, moved
    ):
        before = (
            db.connect()
            .execute("SELECT id FROM tracks WHERE rekordbox_track_id = '1'")
            .fetchone()[0]
        )

        self.refresh(
            service,
            tmp_path,
            f"{case}.xml",
            track(moved["id"], moved["path"], 8),
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        rows = (
            db.connect()
            .execute(
                "SELECT id FROM tracks WHERE rekordbox_track_id = ?", (moved["id"],)
            )
            .fetchall()
        )
        assert [r[0] for r in rows] == [before]
        assert counts(db)[moved["id"]] == {1: 5, 2: 8}
        assert len(counts(db)) == 2

    def test_a_track_that_left_takes_its_history_with_it(
        self, db, service, first, tmp_path
    ):
        self.refresh(
            service,
            tmp_path,
            "smaller.xml",
            track("2", "/m/two.mp3", 0),
            track("3", "/m/three.mp3", None),
        )

        assert counts(db) == {"2": {1: 0}}
        assert reads(db)[-1] == (2, "refresh", 2, 0)


class TestAFailedRefresh:
    @pytest.mark.parametrize("target", ["replace_tree", "marks"])
    def test_it_leaves_both_tables_as_they_were(
        self, db, service, first, tmp_path, monkeypatch, target
    ):
        path = export(
            tmp_path,
            "moved.xml",
            track("1", "/m/one.mp3", 50),
            track("2", "/m/two.mp3", 3),
            track("4", "/m/four.mp3", 7),
        )
        diff = service.compute_refresh_diff(path, force=True)
        before = everything(db)

        def boom(*_args, **_kwargs):
            raise RuntimeError("disk gave up")

        if target == "replace_tree":
            monkeypatch.setattr(service._playlists, "replace_tree", boom)
        else:
            monkeypatch.setattr(service._marks, "mark_read", boom)

        with pytest.raises(RuntimeError, match="disk gave up"):
            service.apply_refresh(diff)

        assert everything(db) == before

    def test_the_same_refresh_without_the_failure_stores_rows(
        self, db, service, first, tmp_path
    ):
        """The control: the rollback test proves something only if this holds."""
        path = export(
            tmp_path,
            "moved.xml",
            track("1", "/m/one.mp3", 50),
            track("2", "/m/two.mp3", 3),
            track("4", "/m/four.mp3", 7),
        )
        before = everything(db)

        service.apply_refresh(service.compute_refresh_diff(path, force=True))

        assert everything(db) != before
        assert counts(db) == {"1": {1: 5, 2: 50}, "2": {1: 0, 2: 3}, "4": {2: 7}}


class TestABaselineRead:
    def test_it_stores_every_known_count_though_none_changed(self, db, tracks):
        history = PlayHistoryRepository(db)
        incoming = [
            LibraryTrack(
                rekordbox_track_id=str(n),
                file_path=f"/m/{n}.mp3",
                title=f"T{n}",
                artist="A",
                play_count=count,
            )
            for n, count in ((1, 5), (2, 0), (3, None))
        ]
        tracks.upsert_many_from_rekordbox(incoming)

        def read(baseline: bool) -> int:
            read_id = history.start_read("refresh", "2026-10-01T00:00:00+00:00")
            return tracks.upsert_many_from_rekordbox(
                incoming, read_id=read_id, baseline=baseline
            ).play_counts_stored

        assert read(baseline=False) == 0
        assert counts(db) == {}
        assert read(baseline=True) == 2
        assert counts(db) == {"1": {2: 5}, "2": {2: 0}}

    def test_a_library_migrated_without_a_seed_baselines_its_first_import(
        self, tmp_path
    ):
        """Version 26, tracks, never imported: m0027 seeds nothing (DEC-168)."""
        database = DatabaseService(db_path=tmp_path / "v26.db")
        try:
            MigrationRunner(
                database,
                migrations=[m for m in discover_migrations() if m.version <= 26],
            ).migrate()
            legacy_rows.add_tracks(
                database,
                [
                    LibraryTrack(
                        rekordbox_track_id=str(n),
                        file_path=f"/m/{n}.mp3",
                        title=f"T{n}",
                        artist="A",
                        play_count=count,
                    )
                    for n, count in ((1, 5), (2, 0), (3, None))
                ],
            )
            MigrationRunner(database).migrate()
            assert reads(database) == []

            importer = LibraryImportService(
                TrackRepository(database),
                PlaylistRepository(database),
                LibrarySourceRepository(database),
                database,
            )
            importer.import_rekordbox_xml(
                export(
                    tmp_path,
                    "same.xml",
                    track("1", "/m/1.mp3", 5),
                    track("2", "/m/2.mp3", 0),
                    track("3", "/m/3.mp3", None),
                )
            )

            # Nothing moved, yet every known count is kept: the baseline.
            assert counts(database) == {"1": {1: 5}, "2": {1: 0}}
            assert reads(database) == [(1, "import", 3, 2)]
        finally:
            database.close_all()


class TestTheRepository:
    def test_it_starts_empty_and_remembers_a_read(self, db):
        history = PlayHistoryRepository(db)
        assert history.has_reads() is False

        read_id = history.start_read("import", "2026-10-01T00:00:00+00:00")
        history.finish_read(read_id, tracks=4, changed=2)

        assert history.has_reads() is True
        assert [(r.kind, r.tracks, r.changed) for r in history.reads()] == [
            ("import", 4, 2)
        ]
