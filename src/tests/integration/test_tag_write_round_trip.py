#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing a library scope's tags as jobs, then restoring them (CLEAN-10, DEC-070).

The step's acceptance, end to end through the bootstrapped engine: a scope of
real files in every written format, with files that must be skipped among them,
is previewed as a job, written by the preview's id, read back, and restored as a
job — after which every file's tags are what they were, read with mutagen
directly. The scale version of this, 500 files, is measured in the step's
outcome; this is the version that runs on every build.
"""

from __future__ import annotations

import io
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List

import pytest
from PIL import Image

from cuepoint.data.tag_fields import TAG_FIELDS, predicted_value, read_tag_fields
from cuepoint.engine import tag_write_jobs
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.tag_write_jobs import (
    TagWritePreviewStore,
    preview_or_start,
    start_tag_restore_job,
    start_tag_write_job,
)
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.tag_write_options import TagWriteOptions
from cuepoint.services.tag_write_service import (
    FIELD_ARTWORK,
    SKIP_MISSING,
    SKIP_UNSUPPORTED_FORMAT,
    SKIP_WAV,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.audio_files import SUPPORTED, audio_copy, tag_dump

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
NOW = "2026-09-15T12:00:00+00:00"
PER_FORMAT = 6


def wait_until(
    predicate: Callable[[], bool], message: str, timeout: float = 60.0
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def cover() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (900, 900), "purple").save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def engine_store(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import (
        IDatabaseService,
        IJobRepository,
        IMigrationRunner,
    )

    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "db.sqlite"
    )
    reset_container()
    bootstrap_services()
    resolve(IMigrationRunner).migrate()
    store = JobStore(job_repository_provider=lambda: resolve(IJobRepository))
    yield store
    wait_until(lambda: all(job.state in TERMINAL for job in store.list_all()), "jobs")
    resolve(IDatabaseService).close_all()
    reset_container()


def add_library(tmp_path: Path) -> Dict[str, Any]:
    """Files of every kind, most with tags already, some with pictures."""
    from cuepoint.data.tag_writer import write_key_comment_year_to_file
    from cuepoint.services.interfaces import (
        IDatabaseService,
        IFileStatusRepository,
        ITrackRepository,
    )

    music = tmp_path / "music"
    entries: List[Dict[str, Any]] = []
    for kind in SUPPORTED:
        for index in range(PER_FORMAT):
            path = audio_copy(music, kind, f"{kind}-{index}.{kind}")
            if index % 2:
                write_key_comment_year_to_file(
                    str(path), "C", "old comment", "2001", "Old", "120", "Old Genre"
                )
            entries.append(
                {"path": path, "status": FILE_PRESENT, "picture": index % 3 == 0}
            )
    entries.append({"path": audio_copy(music, "wav"), "status": FILE_PRESENT})
    entries.append({"path": audio_copy(music, "m4a"), "status": FILE_PRESENT})
    entries.append({"path": music / "gone.mp3", "status": FILE_MISSING})

    prefix = uuid.uuid4().hex[:6]
    resolve(ITrackRepository).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{n}",
                title=f"T{n}",
                artist="A",
                file_path=str(entry["path"]),
                key="8A",
                year=2019,
                label="A Label",
                bpm=124.0 + n / 4,
                genre="House",
            )
            for n, entry in enumerate(entries)
        ]
    )
    db = resolve(IDatabaseService)
    ids = {
        row["rekordbox_track_id"]: int(row["id"])
        for row in db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    }
    for n, entry in enumerate(entries):
        entry["track_id"] = ids[f"{prefix}-{n}"]
    with db.transaction():
        resolve(IFileStatusRepository).record(
            [
                TrackFileStatus(
                    entry["track_id"],
                    entry["status"],
                    str(entry["path"]),
                    NOW,
                    size_bytes=(
                        entry["path"].stat().st_size
                        if entry["status"] == FILE_PRESENT
                        else None
                    ),
                )
                for entry in entries
            ]
        )
    return {"entries": entries, "db": db}


def accept_with_artwork(track_ids: List[int]) -> None:
    """Accept a Beatport match with artwork for each track, and serve its image."""
    from cuepoint.models.beatport_candidate import BeatportCandidate
    from cuepoint.models.result import TrackResult
    from cuepoint.models.track import Track
    from cuepoint.services.interfaces import (
        IArtworkService,
        IMatchRepository,
        IMatchStateService,
    )

    matches = resolve(IMatchRepository)
    states = resolve(IMatchStateService)
    image = cover()
    service = resolve(IArtworkService)
    # No test reaches Beatport: the engine's artwork service downloads through
    # this stub for the rest of the test.
    service._fetch_image = lambda url: image  # noqa: SLF001
    get_container().register_singleton(IArtworkService, service)
    for track_id in track_ids:
        candidate = BeatportCandidate(
            url=f"https://www.beatport.com/track/t/{track_id}",
            title="T",
            artists="A",
            label=None,
            release_date=None,
            bpm=None,
            key=None,
            genre=None,
            score=97.0,
            title_sim=90,
            artist_sim=90,
            query_index=1,
            query_text="q",
            candidate_index=1,
            base_score=97.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=1,
            is_winner=False,
            release_year=None,
            release_name=None,
            artwork_url=f"https://geo-media.beatport.com/image_size/{{w}}x{{h}}/{track_id}.jpg",
        )
        result = TrackResult(
            playlist_index=1,
            title="T",
            artist="A",
            matched=True,
            best_match=candidate,
            candidates=[candidate],
            match_score=97.0,
        )
        states.apply_attempt(
            matches.add_attempt(track_id, "job", result, Track(title="T", artist="A"))
        )


@pytest.mark.integration
def test_a_scope_is_previewed_written_and_restored_as_jobs(
    engine_store, tmp_path, monkeypatch
):
    from cuepoint.data.tag_fields import embed_front_cover
    from tests.fixtures.audio_files import jpeg_bytes

    store = engine_store
    library = add_library(tmp_path)
    entries = library["entries"]
    written_kinds = [
        entry
        for entry in entries
        if entry["path"].suffix[1:] in SUPPORTED and entry["status"] == FILE_PRESENT
    ]
    for entry in written_kinds:
        if entry["picture"]:
            embed_front_cover(entry["path"], jpeg_bytes("green"), 40, 20)
    accept_with_artwork([entry["track_id"] for entry in written_kinds])
    before = {
        entry["track_id"]: tag_dump(entry["path"])
        for entry in entries
        if entry["status"] == FILE_PRESENT and entry["path"].suffix[1:] in SUPPORTED
    }
    # Skipped files are compared byte for byte: nothing may touch them.
    untouched = {
        entry["path"]: entry["path"].read_bytes()
        for entry in entries
        if entry["path"].suffix in (".wav", ".m4a")
    }
    track_ids = [entry["track_id"] for entry in entries]
    previews = TagWritePreviewStore()
    options = TagWriteOptions.from_request(
        {"write_bpm": True, "write_genre": True, "embed_missing_artwork": True}
    )
    monkeypatch.setattr(tag_write_jobs, "BATCH_JOB_THRESHOLD", 5)

    _, preview_job = preview_or_start(
        store, BatchSelection.of_ids(track_ids), options, previews=previews
    )
    assert preview_job is not None
    wait_until(lambda: store.get(preview_job.id).state in TERMINAL, "the preview")
    preview = previews.get(preview_job.id)

    assert len(preview.files) == len(written_kinds)
    assert {reason: len(refs) for reason, refs in preview.skipped.items()} == {
        SKIP_WAV: 1,
        SKIP_UNSUPPORTED_FORMAT: 1,
        SKIP_MISSING: 1,
    }
    pictured = sum(1 for entry in written_kinds if entry["picture"])
    assert preview.field_counts[FIELD_ARTWORK] == len(written_kinds) - pictured

    write_job = start_tag_write_job(store, preview_job.id, previews=previews)
    wait_until(lambda: store.get(write_job.id).state in TERMINAL, "the write")
    written = store.get(write_job.id)
    assert written.state is JobState.SUCCEEDED, written.error
    assert written.result is not None
    assert (written.result["written"], written.result["failed"]) == (
        len(written_kinds),
        0,
    )

    planned = {file.track_id: file for file in preview.files}
    for entry in written_kinds:
        snapshot = read_tag_fields(entry["path"])
        for field in TAG_FIELDS:
            text = planned[entry["track_id"]].values[field]
            assert snapshot.value(field) == predicted_value(
                snapshot.format, field, text
            )
        assert len(snapshot.pictures) == 1

    restore = start_tag_restore_job(store, job_id=write_job.id)
    wait_until(lambda: store.get(restore.job.id).state in TERMINAL, "the restore")
    restored = store.get(restore.job.id)
    assert restored.state is JobState.SUCCEEDED, restored.error
    assert restored.result is not None
    assert (restored.result["skipped"], restored.result["failed"]) == (0, 0)
    assert restored.result["restored"] == restore.writes

    for track_id, dumped in before.items():
        path = next(entry["path"] for entry in entries if entry["track_id"] == track_id)
        assert tag_dump(path) == dumped, path.name
    for path, data in untouched.items():
        assert path.read_bytes() == data, path.name
