#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-10's tag write as jobs: preview by id, write once, restore (DEC-070).

Through the bootstrapped container and real job threads, over real files:

- **A preview is answered inline below DEC-063's threshold and as a job above
  it**, and either way is kept by id — the job's own id when it ran as one.
- **A write names a preview and writes it once**; a preview that is unknown,
  forgotten or already written is refused before any job exists.
- **A restore names a write job or a track**, and refuses when there is nothing
  to restore.
- **What waits for what**: every tag job refuses to start beside another, an
  import, a refresh apply, a file check or an artwork scan; none of those waits
  for a tag job.
- **Cancelled and failed jobs answer as jobs do.**
"""

from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, List, Optional, Sequence

import pytest

from cuepoint.data.tag_fields import display_value, read_tag_fields
from cuepoint.engine import tag_write_jobs
from cuepoint.engine.artwork_jobs import JOB_TYPE_ARTWORK_SCAN
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK, start_file_check_job
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.engine.tag_write_jobs import (
    JOB_TYPE_TAG_RESTORE,
    JOB_TYPE_TAG_WRITE,
    JOB_TYPE_TAG_WRITE_PREVIEW,
    TAG_FILE_CONFLICTS,
    TAG_FILE_JOB_TYPES,
    PreviewNotFoundError,
    TagWritePreviewStore,
    preview_or_start,
    run_tag_preview_job,
    run_tag_restore_job,
    run_tag_write_job,
    start_tag_preview_job,
    start_tag_restore_job,
    start_tag_write_job,
)
from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.tag_write_options import TagWriteOptions
from cuepoint.services.tag_write_service import NOTHING_TO_RESTORE, NOTHING_TO_WRITE
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.audio_files import audio_copy, tag_dump

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
NOW = "2026-09-15T12:00:00+00:00"
KEY_ONLY = TagWriteOptions.from_request(
    {"write_year": False, "write_label": False, "write_comment": False}
)


# ------------------------------------------------------------------ helpers


def wait_until(
    predicate: Callable[[], bool], message: str, timeout: float = 30.0
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def database() -> Any:
    from cuepoint.services.interfaces import IDatabaseService

    return resolve(IDatabaseService)


def finished(store: JobStore, job: Job) -> Job:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.type}")
    return store.get(job.id)


def recorded(job_id: str) -> Optional[str]:
    row = (
        database()
        .connect()
        .execute("SELECT state FROM jobs WHERE id = ?", (job_id,))
        .fetchone()
    )
    return None if row is None else str(row["state"])


def add_tracks(paths: Sequence[Path], key: str = "Am") -> List[int]:
    from cuepoint.services.interfaces import IFileStatusRepository, ITrackRepository

    prefix = uuid.uuid4().hex[:8]
    resolve(ITrackRepository).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"T{index}",
                artist="A",
                file_path=str(path),
                key=key,
            )
            for index, path in enumerate(paths)
        ]
    )
    rows = (
        database()
        .connect()
        .execute(
            "SELECT id, rekordbox_track_id, file_path FROM tracks"
            " WHERE rekordbox_track_id LIKE ?",
            (f"{prefix}-%",),
        )
    )
    found = {
        row["rekordbox_track_id"]: (int(row["id"]), row["file_path"]) for row in rows
    }
    ids = [found[f"{prefix}-{index}"][0] for index in range(len(paths))]
    with database().transaction():
        resolve(IFileStatusRepository).record(
            [
                TrackFileStatus(
                    track_id, FILE_PRESENT, str(path), NOW, path.stat().st_size
                )
                for track_id, path in zip(ids, paths)
            ]
        )
    return ids


def music(tmp_path: Path, count: int) -> List[Path]:
    return [audio_copy(tmp_path / "music", "mp3", f"t{n}.mp3") for n in range(count)]


def hold(store: JobStore, job_type: str) -> threading.Event:
    released = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda job: released.wait(30), exclusive=True
    )
    return released


def use_service(service: Any) -> None:
    from cuepoint.services.interfaces import ITagWriteService

    get_container().register_singleton(ITagWriteService, service)


class Failing:
    """A tag write service whose every job raises."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    def resolve(self, selection):
        return list(selection.track_ids)

    def preview(self, *_args, **_kwargs):
        raise self.error

    def write(self, *_args, **_kwargs):
        raise self.error

    def restorable_count(self, **_kwargs):
        return 1

    def restore(self, *_args, **_kwargs):
        raise self.error


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IMigrationRunner

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()
    resolve(IMigrationRunner).migrate()
    yield db_path
    database().close_all()
    reset_container()


@pytest.fixture
def store(library_db):
    from cuepoint.services.interfaces import IJobRepository

    job_store = JobStore(job_repository_provider=lambda: resolve(IJobRepository))
    yield job_store
    wait_until(
        lambda: all(job.state in TERMINAL for job in job_store.list_all()),
        "every job to finish",
    )


@pytest.fixture
def previews() -> TagWritePreviewStore:
    return TagWritePreviewStore()


# ------------------------------------------------------------------- preview


class TestPreviewInlineOrAsAJob:
    def test_a_small_selection_is_previewed_inline_and_kept(
        self, store, tmp_path, previews
    ):
        tracks = add_tracks(music(tmp_path, 2))

        preview, job = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )

        assert job is None and preview is not None
        assert [planned.track_id for planned in preview.files] == tracks
        assert previews.get(preview.preview_id) is preview
        assert store.list_all() == []

    def test_above_the_threshold_a_job_keeps_it_under_its_own_id(
        self, store, tmp_path, previews, monkeypatch
    ):
        monkeypatch.setattr(tag_write_jobs, "BATCH_JOB_THRESHOLD", 1)
        tracks = add_tracks(music(tmp_path, 2))

        preview, job = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )

        assert preview is None and job is not None
        done = finished(store, job)
        assert (done.type, done.state) == (
            JOB_TYPE_TAG_WRITE_PREVIEW,
            JobState.SUCCEEDED,
        )
        assert done.result is not None
        assert (done.result["preview_id"], done.result["files"]) == (job.id, 2)
        assert len(previews.get(job.id).files) == 2
        wait_until(lambda: recorded(job.id) == "succeeded", "the job record")

    def test_a_selection_of_nothing_is_refused_before_a_job_exists(
        self, store, previews
    ):
        with pytest.raises(ValueError, match=NOTHING_TO_WRITE):
            preview_or_start(
                store, BatchSelection.of_ids([123_456]), KEY_ONLY, previews=previews
            )
        assert store.list_all() == [] and previews.count() == 0

    def test_a_cancelled_preview_job_answers_and_is_not_kept(
        self, store, tmp_path, previews
    ):
        tracks = add_tracks(music(tmp_path, 1))
        job = Job(id="cancelled-preview", type=JOB_TYPE_TAG_WRITE_PREVIEW)
        job.cancel_requested = True

        run_tag_preview_job(job, store, tracks, KEY_ONLY, previews)

        assert job.state is JobState.CANCELLED
        assert job.error is not None and job.error["code"] == "JOB_CANCELLED"
        assert job.result is not None and job.result["cancelled"] is True
        assert previews.count() == 0

    def test_a_preview_that_raises_fails_with_its_message(self, store, previews):
        use_service(Failing(RuntimeError("the disk went away")))
        job = Job(id="failing-preview", type=JOB_TYPE_TAG_WRITE_PREVIEW)

        run_tag_preview_job(job, store, [1], KEY_ONLY, previews)

        assert job.state is JobState.FAILED
        assert job.error == {
            "code": "TAG_WRITE_PREVIEW_FAILED",
            "message": "the disk went away",
        }


# --------------------------------------------------------------------- write


class TestWriting:
    def test_a_write_job_writes_its_preview_once(self, store, tmp_path, previews):
        [path] = music(tmp_path, 1)
        tracks = add_tracks([path])
        preview, _ = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )
        assert preview is not None

        job = start_tag_write_job(store, preview.preview_id, previews=previews)
        done = finished(store, job)

        assert (done.type, done.state) == (JOB_TYPE_TAG_WRITE, JobState.SUCCEEDED)
        assert done.result is not None and done.result["written"] == 1
        assert display_value(read_tag_fields(path).value("key")) == "Am"
        assert previews.count() == 0
        with pytest.raises(PreviewNotFoundError, match="preview again"):
            start_tag_write_job(store, preview.preview_id, previews=previews)

    def test_an_unknown_preview_is_refused_before_a_job_exists(self, store, previews):
        with pytest.raises(PreviewNotFoundError):
            start_tag_write_job(store, "never-previewed", previews=previews)
        assert store.list_all() == []

    def test_a_write_whose_preview_is_gone_fails_with_its_code(self, store, previews):
        job = Job(id="orphan-write", type=JOB_TYPE_TAG_WRITE)

        run_tag_write_job(job, store, "gone", previews)

        assert job.state is JobState.FAILED
        assert job.error is not None
        assert job.error["code"] == "TAG_WRITE_PREVIEW_NOT_FOUND"

    def test_a_cancelled_write_answers_with_its_counts(self, store, tmp_path, previews):
        tracks = add_tracks(music(tmp_path, 2))
        preview, _ = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )
        assert preview is not None
        job = Job(id="cancelled-write", type=JOB_TYPE_TAG_WRITE)
        job.cancel_requested = True

        run_tag_write_job(job, store, preview.preview_id, previews)

        assert job.state is JobState.CANCELLED
        assert job.result is not None
        assert (job.result["cancelled"], job.result["written"]) == (True, 0)

    def test_a_write_that_raises_fails_with_its_message(
        self, store, tmp_path, previews
    ):
        tracks = add_tracks(music(tmp_path, 1))
        preview, _ = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )
        assert preview is not None
        use_service(Failing(RuntimeError("database is gone")))
        job = Job(id="failing-write", type=JOB_TYPE_TAG_WRITE)

        run_tag_write_job(job, store, preview.preview_id, previews)

        assert job.state is JobState.FAILED
        assert job.error == {"code": "TAG_WRITE_FAILED", "message": "database is gone"}


# ------------------------------------------------------------------- restore


class TestRestoring:
    def write(self, store, tracks, previews) -> Job:
        preview, _ = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )
        assert preview is not None
        return finished(
            store, start_tag_write_job(store, preview.preview_id, previews=previews)
        )

    def test_a_write_is_restored_by_its_job_and_by_its_track(
        self, store, tmp_path, previews
    ):
        [path] = music(tmp_path, 1)
        dumped = tag_dump(path)
        tracks = add_tracks([path])
        written = self.write(store, tracks, previews)

        started = start_tag_restore_job(store, job_id=written.id)
        done = finished(store, started.job)

        assert started.to_dict() == {
            "job_id": started.job.id,
            "writes": 1,
            "restored_job_id": written.id,
            "track_id": None,
        }
        assert (done.type, done.state) == (JOB_TYPE_TAG_RESTORE, JobState.SUCCEEDED)
        assert done.result is not None and done.result["restored"] == 1
        assert tag_dump(path) == dumped

        self.write(store, tracks, previews)
        by_track = finished(store, start_tag_restore_job(store, track_id=tracks[0]).job)
        assert by_track.state is JobState.SUCCEEDED
        assert tag_dump(path) == dumped

    def test_nothing_to_restore_is_refused_before_a_job_exists(self, store):
        with pytest.raises(ValueError, match=NOTHING_TO_RESTORE):
            start_tag_restore_job(store, job_id="never-ran")
        assert store.list_all() == []

    @pytest.mark.parametrize("scope", [{}, {"job_id": "a", "track_id": 1}])
    def test_a_job_or_a_track_exactly(self, store, scope):
        with pytest.raises(ValueError, match="not both or neither"):
            start_tag_restore_job(store, **scope)

    def test_a_restore_that_raises_fails_with_its_message(self, store):
        use_service(Failing(RuntimeError("the drive went away")))
        job = Job(id="failing-restore", type=JOB_TYPE_TAG_RESTORE)

        run_tag_restore_job(job, store, "job-1", None)

        assert job.state is JobState.FAILED
        assert job.error == {
            "code": "TAG_RESTORE_FAILED",
            "message": "the drive went away",
        }


# ------------------------------------------------------------ what waits for


class TestWhatWaitsForWhat:
    def test_the_designed_conflicts(self):
        assert set(TAG_FILE_JOB_TYPES) == {
            JOB_TYPE_TAG_WRITE_PREVIEW,
            JOB_TYPE_TAG_WRITE,
            JOB_TYPE_TAG_RESTORE,
        }
        assert set(TAG_FILE_CONFLICTS) == {
            *TAG_FILE_JOB_TYPES,
            JOB_TYPE_LIBRARY_IMPORT,
            JOB_TYPE_LIBRARY_REFRESH_APPLY,
            JOB_TYPE_FILE_CHECK,
            JOB_TYPE_ARTWORK_SCAN,
        }

    @pytest.mark.parametrize("job_type", TAG_FILE_CONFLICTS)
    def test_every_tag_job_refuses_to_start_beside_them(
        self, store, tmp_path, previews, job_type, monkeypatch
    ):
        tracks = add_tracks(music(tmp_path, 1))
        preview, _ = preview_or_start(
            store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
        )
        assert preview is not None
        written = finished(
            store, start_tag_write_job(store, preview.preview_id, previews=previews)
        )
        again, _ = preview_or_start(
            store,
            BatchSelection.of_ids(tracks),
            TagWriteOptions.from_request({}),
            previews=previews,
        )
        assert again is not None

        released = hold(store, job_type)
        try:
            with pytest.raises(JobTypeBusyError):
                preview_or_start(
                    store, BatchSelection.of_ids(tracks), KEY_ONLY, previews=previews
                )
            with pytest.raises(JobTypeBusyError):
                start_tag_preview_job(store, tracks, KEY_ONLY, previews=previews)
            with pytest.raises(JobTypeBusyError):
                start_tag_write_job(store, again.preview_id, previews=previews)
            with pytest.raises(JobTypeBusyError):
                start_tag_restore_job(store, job_id=written.id)
        finally:
            released.set()
        # Refused, not consumed: the preview can still be written afterwards.
        assert previews.get(again.preview_id) is again

    @pytest.mark.parametrize(
        "tag_job",
        [JOB_TYPE_TAG_WRITE, JOB_TYPE_TAG_RESTORE, JOB_TYPE_TAG_WRITE_PREVIEW],
    )
    def test_a_file_check_never_waits_for_a_tag_job(self, store, tmp_path, tag_job):
        tracks = add_tracks(music(tmp_path, 1))
        released = hold(store, tag_job)
        try:
            started = start_file_check_job(store, BatchSelection.of_ids(tracks))
            assert finished(store, started.job).state is JobState.SUCCEEDED
        finally:
            released.set()


# --------------------------------------------------------------------- store


class TestTheStore:
    def preview(self, preview_id: str, cancelled: bool = False):
        from cuepoint.services.tag_write_service import TagWritePreview

        return TagWritePreview(
            preview_id=preview_id,
            options=KEY_ONLY,
            total=0,
            cancelled=cancelled,
        )

    def test_it_forgets_the_oldest_beyond_its_size(self):
        kept = TagWritePreviewStore(max_entries=2)
        for name in ("a", "b", "c"):
            kept.put(self.preview(name))

        assert kept.count() == 2
        with pytest.raises(PreviewNotFoundError):
            kept.get("a")
        assert kept.take("c").preview_id == "c"
        with pytest.raises(PreviewNotFoundError):
            kept.take("c")
        kept.clear()
        assert kept.count() == 0

    def test_putting_one_again_keeps_it_fresh(self):
        kept = TagWritePreviewStore(max_entries=2)
        first = kept.put(self.preview("a"))
        kept.put(self.preview("b"))
        kept.put(first)
        kept.put(self.preview("c"))

        assert kept.get("a") is first
        with pytest.raises(PreviewNotFoundError):
            kept.get("b")

    def test_a_cancelled_preview_is_not_kept(self):
        with pytest.raises(ValueError, match="cancelled"):
            TagWritePreviewStore().put(self.preview("x", cancelled=True))

    def test_a_store_holds_at_least_one(self):
        with pytest.raises(ValueError):
            TagWritePreviewStore(max_entries=0)

    def test_the_engine_has_one_store(self):
        assert tag_write_jobs.get_preview_store() is tag_write_jobs.get_preview_store()
