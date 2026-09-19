#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A restored backup brings Clean's work back with it (CLEAN-14).

Phase 6 pinned this for Collections, tags and ratings
(``test_backup_restores_organization.py``). Phase 7 adds data that exists
nowhere else either: every candidate a match found, a reviewer's decisions, the
values applied or typed over Rekordbox's, the record of what was written into
each file — which is the only way those files get their old tags back — and the
duplicate groups a user said were fine.

So a library gets one of each, through the services and real files, is backed
up, loses all of it the way a real loss looks, is restored, and is read back
through the services. The one thing deliberately *not* in the backup is the
artwork cache (DEC-076 as amended): it is thumbnails that a scan makes again,
so the test confirms the backup holds no image and that a scan rebuilds the
cache after it has gone.
"""

from __future__ import annotations

import shutil
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Dict

import pytest

from cuepoint.data.beatport_fixture import ENV_VAR
from cuepoint.data.tag_fields import embed_front_cover, read_tag_fields
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import SOURCE_BEATPORT, SOURCE_CUEPOINT
from cuepoint.services import database_service as database_service_module
from cuepoint.services.artwork_cache import default_artwork_cache_dir
from cuepoint.services.duplicate_service import SIGNAL_TEXT
from cuepoint.services.interfaces import (
    IArtworkService,
    IBackupService,
    IDatabaseService,
    IDuplicateService,
    IFileStatusRepository,
    IFileWriteRepository,
    IMatchRepository,
    IMatchStateService,
    IMetadataService,
    IMigrationRunner,
    ITagWriteService,
    ITrackRepository,
)
from cuepoint.services.tag_write_options import TagWriteOptions
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.audio_files import audio_copy, jpeg_bytes

NOW = "2026-09-17T12:00:00+00:00"
FIXTURE = (
    Path(__file__).resolve().parents[1] / "fixtures" / "beatport" / "journey"
) / "fixture.json"
COVER = "https://geo-media.beatport.com/image_size/{w}x{h}/journey-cover.jpg"


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


@pytest.fixture
def library(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
    # Beatport's image comes from a file; nothing here reaches Beatport.
    monkeypatch.setenv(ENV_VAR, str(FIXTURE))
    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "data" / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    resolve(IMigrationRunner).migrate()
    yield tmp_path
    resolve(IDatabaseService).close_all()
    reset_container()


def candidate(number: int, score: float, winner: bool, **values) -> BeatportCandidate:
    fields: Dict[str, Any] = dict(
        url=f"https://www.beatport.com/track/backup/{number}",
        title="Tone",
        artists="Artist",
        label="Label",
        release_date="2021-03-01",
        bpm=122.0,
        key="A Minor",
        genre="Techno",
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=number,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=winner,
        release_year=2021,
        release_name="Release",
    )
    fields.update(values)
    return BeatportCandidate(**fields)


def attempt(track_id: int, *found: BeatportCandidate) -> int:
    result = TrackResult(
        playlist_index=1,
        title="Tone",
        artist="Artist",
        matched=True,
        best_match=found[0],
        candidates=list(found),
        match_score=found[0].score,
    )
    stored = resolve(IMatchRepository).add_attempt(
        track_id, "backup", result, Track(title="Tone", artist="Artist")
    )
    resolve(IMatchStateService).apply_attempt(stored)
    return stored.id


def populate(root: Path) -> Dict[str, Any]:
    """One of everything Phase 7 makes, and what to expect of it."""
    music = root / "music"
    files = [audio_copy(music, "mp3", f"{n}.mp3") for n in range(3)]
    embed_front_cover(str(files[0]), jpeg_bytes("purple", (300, 300)), 300, 300)
    tracks = resolve(ITrackRepository)
    prefix = uuid.uuid4().hex[:6]
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{n}",
                file_path=str(files[n]) if n < 3 else str(music / "gone.mp3"),
                # Two with the same artist, title and length: a duplicate group.
                title="Same Tune" if n in (2, 3) else f"Tone {n}",
                duration_seconds=300,
                artist="Artist",
                key="8A",
                bpm=124.0,
                genre="House",
                label="Imported",
                year=2020,
            )
            for n in range(4)
        ]
    )
    ids = sorted(track.id for track in tracks.list_all())
    first, second, third, gone = ids

    resolve(IFileStatusRepository).record(
        [
            TrackFileStatus(first, FILE_PRESENT, str(files[0]), NOW),
            TrackFileStatus(second, FILE_PRESENT, str(files[1]), NOW),
            TrackFileStatus(third, FILE_PRESENT, str(files[2]), NOW),
            TrackFileStatus(gone, FILE_MISSING, str(music / "gone.mp3"), NOW),
        ]
    )

    # Attempts with every candidate, and a reviewer's decisions on them.
    attempt(first, candidate(1, 97.0, True))
    attempt(
        second,
        candidate(2, 88.0, True, key="D Minor"),
        candidate(3, 80.0, False, key="E Minor", bpm=125.0, artwork_url=COVER),
    )
    attempt(third, candidate(4, 70.0, True, title="Someone Else's Tune"))
    matches = resolve(IMatchRepository)
    second_choice = [
        c for c in matches.candidates_for(matches.latest_attempt(second).id)
    ][1]
    states = resolve(IMatchStateService)
    states.accept(second, second_choice.id)
    states.reject(third)

    # Overrides: one applied from Beatport, one typed.
    metadata = resolve(IMetadataService)
    metadata.set_override(second, "bpm", 125, source=SOURCE_BEATPORT)
    metadata.set_override(first, "genre", "Melodic Techno", source=SOURCE_CUEPOINT)

    # A write into a real file, with its record.
    writer = resolve(ITagWriteService)
    options = TagWriteOptions.from_request(
        {
            "write_key": True,
            "write_year": False,
            "write_label": True,
            "write_comment": False,
        }
    )
    preview = writer.preview([second], options, preview_id="backup-preview")
    written = writer.write(preview, "backup-write")
    assert written.written > 0

    # A duplicate group, dismissed.
    duplicates = resolve(IDuplicateService)
    duplicates.scan([SIGNAL_TEXT])
    group = next(g for g in duplicates.groups() if set(g.track_ids) >= {third, gone})
    duplicates.dismiss(group.group.id)

    # The artwork cache: Beatport's image made by a scan, the file's by a look.
    artwork = resolve(IArtworkService)
    assert artwork.scan([first, second], fetch_beatport=True).fetched == 1
    assert artwork.thumbnail(first, "row") is not None
    assert artwork.thumbnail(second, "row") is not None

    return {
        "ids": {"first": first, "second": second, "third": third, "gone": gone},
        "files": files,
        "chosen_candidate": second_choice.id,
        "group_key": group.group.group_key,
    }


def destroy(expected: Dict[str, Any]) -> None:
    """Lose Phase 7's work with the database still there."""
    db = resolve(IDatabaseService)
    with db.transaction():
        connection = db.connect()
        for table in (
            "track_match",
            "match_candidates",
            "match_attempts",
            "file_writes",
            "duplicate_dismissals",
            "track_metadata",
            "track_files",
        ):
            connection.execute(f"DELETE FROM {table}")
    ids = expected["ids"]
    assert resolve(IMatchRepository).get_match(ids["second"]) is None
    assert resolve(IFileWriteRepository).for_track(ids["second"]) == []


def image_blobs(database: Path) -> int:
    """How many stored values in a database file are JPEG images."""
    connection = sqlite3.connect(database)
    try:
        found = 0
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        ]
        for table in tables:
            columns = [
                row[1] for row in connection.execute(f"PRAGMA table_info('{table}')")
            ]
            for column in columns:
                found += connection.execute(
                    f"SELECT COUNT(*) FROM '{table}' WHERE typeof(\"{column}\") = 'blob'"
                    f" AND hex(substr(\"{column}\", 1, 2)) = 'FFD8'"
                ).fetchone()[0]
        return found
    finally:
        connection.close()


@pytest.mark.integration
class TestARestoreBringsBackClean:
    @pytest.fixture
    def restored(self, library):
        expected = populate(library)
        backup = resolve(IBackupService).create_backup(reason="test")
        expected["backup"] = backup.path
        destroy(expected)
        resolve(IBackupService).restore(backup.path)
        return expected

    def test_every_attempt_comes_back_with_every_candidate(self, restored):
        ids = restored["ids"]
        matches = resolve(IMatchRepository)
        second = matches.attempts_for(ids["second"])
        assert len(second) == 1
        keys = [c.key for c in matches.candidates_for(second[0].id)]
        assert sorted(keys) == ["D Minor", "E Minor"]
        assert len(matches.attempts_for(ids["first"])) == 1

    def test_the_decisions_come_back(self, restored):
        ids = restored["ids"]
        matches = resolve(IMatchRepository)
        accepted = matches.get_match(ids["second"])
        assert accepted.state == "accepted"
        assert accepted.decided_by == "user"
        # The second candidate, the correction a reviewer makes most.
        assert accepted.candidate_id == restored["chosen_candidate"]
        rejected = matches.get_match(ids["third"])
        assert (rejected.state, rejected.decided_by) == ("rejected", "user")
        automatic = matches.get_match(ids["first"])
        assert (automatic.state, automatic.decided_by) == ("accepted", "auto")

    def test_the_overrides_come_back_with_their_sources(self, restored):
        ids = restored["ids"]
        metadata = resolve(IMetadataService)
        assert metadata.get(ids["second"]).bpm == 125
        assert metadata.get(ids["first"]).genre == "Melodic Techno"
        from cuepoint.services.interfaces import ILibraryService

        sources = resolve(ILibraryService).override_sources(
            [ids["first"], ids["second"]]
        )
        assert sources[ids["second"]]["bpm"] == SOURCE_BEATPORT
        assert sources[ids["first"]]["genre"] == SOURCE_CUEPOINT

    def test_the_file_status_comes_back(self, restored):
        ids = restored["ids"]
        status = resolve(IFileStatusRepository)
        assert status.get(ids["gone"]).status == FILE_MISSING
        assert status.get(ids["first"]).status == FILE_PRESENT

    def test_the_dismissal_comes_back(self, restored):
        groups = resolve(IDuplicateService).groups(include_dismissed=True)
        dismissed = [g for g in groups if g.group.group_key == restored["group_key"]]
        assert dismissed and dismissed[0].dismissed is True

    def test_the_write_record_comes_back_and_still_restores_the_file(self, restored):
        ids = restored["ids"]
        writer = resolve(ITagWriteService)
        assert resolve(IFileWriteRepository).for_track(ids["second"])
        assert writer.restorable_count(job_id="backup-write") > 0
        assert read_tag_fields(str(restored["files"][1])).value("key")

        result = writer.restore("backup-restore", job_id="backup-write")

        assert result.restored > 0
        # The file holds what it held before CuePoint wrote to it: the tone
        # fixture carries no key.
        assert not read_tag_fields(str(restored["files"][1])).value("key")

    def test_the_backup_holds_no_artwork(self, restored):
        assert image_blobs(restored["backup"]) == 0
        cache = default_artwork_cache_dir()
        assert list(cache.rglob("*.jpg"))
        assert cache not in restored["backup"].parents
        assert not any(
            path.suffix == ".jpg" for path in restored["backup"].parent.rglob("*")
        )

    def test_a_scan_rebuilds_the_artwork_cache(self, restored):
        ids = restored["ids"]
        cache = default_artwork_cache_dir()
        shutil.rmtree(cache)
        assert not cache.exists()
        artwork = resolve(IArtworkService)

        # Beatport's thumbnails are made again by the scan that fetches them...
        assert (
            artwork.scan([ids["first"], ids["second"]], fetch_beatport=True).fetched
            == 1
        )
        made_by_the_scan = set(cache.rglob("*.jpg"))
        assert made_by_the_scan
        # ...and a file's own picture the next time it is shown.
        assert artwork.thumbnail(ids["first"], "row") is not None
        assert set(cache.rglob("*.jpg")) > made_by_the_scan
        assert artwork.thumbnail(ids["second"], "row") is not None
