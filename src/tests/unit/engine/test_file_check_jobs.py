#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-07's file check as a job, and the checks that follow a library job.

Everything here runs through the bootstrapped container and real job threads,
because what can go wrong is between jobs rather than inside one:

- **A check follows every import and every applied refresh**, in the job log,
  and never a cancelled or failed one.
- **A disconnected drive is one line in the activity feed** (the DoD).
- **What waits for what.** A check refuses to start beside a rewrite of the
  library; a rewrite never waits for a check; and a rewrite that finishes while a
  check is running still gets its check, after that one, exactly once.
- **Cancelling is prompt**, and a cancelled check keeps what it checked.
- **A library job is never failed by a check running beside it.** Two writers
  commit into one database; the first version of this step let an import lose
  its snapshot to a check's commit, and the test for it is below.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import pytest

from cuepoint.engine.file_check_jobs import (
    JOB_TYPE_FILE_CHECK,
    check_after_library_job,
    pending_follow_up,
    start_file_check_job,
)
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import (
    JOB_TYPE_LIBRARY_IMPORT,
    run_library_import_job,
    start_library_import_job,
)
from cuepoint.engine.library_refresh import (
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    JOB_TYPE_LIBRARY_REFRESH_PREVIEW,
    RefreshDiffStore,
    start_refresh_apply_job,
    start_refresh_preview_job,
)
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.file_check_service import (
    EVENT_FILES_CHECKED,
    EVENT_ROOT_UNAVAILABLE,
    FILE_CHECK_WORKERS,
    NOTHING_TO_CHECK,
    FileCheckService,
    check_file,
)
from cuepoint.utils.di_container import get_container, reset_container

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)


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


def write_export(tmp_path: Path, paths: Sequence[str], name: str) -> str:
    """A collection whose tracks live at ``paths``, numbered in order."""
    entries = "\n".join(
        f'    <TRACK TrackID="{index}" Name="Track {index}" Artist="A"'
        f' Location="{_location(path)}"/>'
        for index, path in enumerate(paths)
    )
    export = tmp_path / name
    export.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(paths)}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="0"></NODE></PLAYLISTS>\n'
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(export)


def _location(path: str) -> str:
    if path.startswith("/"):
        return f"file://localhost{path}"
    return Path(path).as_uri().replace("file:///", "file://localhost/")


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def database() -> Any:
    from cuepoint.services.interfaces import IDatabaseService

    return resolve(IDatabaseService)


def checks_of(store: JobStore) -> List[Job]:
    return [job for job in store.list_all() if job.type == JOB_TYPE_FILE_CHECK]


def finished(store: JobStore, job: Job) -> Job:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.type}")
    return store.get(job.id)


def recorded_state(job_id: str) -> Optional[str]:
    row = (
        database()
        .connect()
        .execute("SELECT state FROM jobs WHERE id = ?", (job_id,))
        .fetchone()
    )
    return None if row is None else str(row["state"])


def job_log() -> List[Tuple[str, str]]:
    """The jobs table in order, without the duplicate scans library jobs start.

    A scan follows the same imports and refreshes a check does (CLEAN-08); its
    place in the log is that step's to test, in ``test_duplicate_jobs.py``.
    """
    return [
        (row["type"], row["state"])
        for row in database()
        .connect()
        .execute(
            "SELECT type, state FROM jobs WHERE type <> 'duplicate_scan'"
            " ORDER BY created_at, rowid"
        )
    ]


def events(event_type: str) -> List[Dict[str, Any]]:
    return [
        {"summary": row["summary"], "detail": json.loads(row["detail_json"] or "{}")}
        for row in database()
        .connect()
        .execute(
            "SELECT summary, detail_json FROM activity_events WHERE type = ?"
            " ORDER BY id",
            (event_type,),
        )
    ]


def statuses() -> Dict[str, Tuple[str, Optional[str]]]:
    """Each checked track's status and reason, by the path it was checked at."""
    return {
        row["checked_path"]: (row["status"], row["reason"])
        for row in database().connect().execute("SELECT * FROM track_files")
    }


def add_tracks(paths: Sequence[str]) -> List[int]:
    from cuepoint.services.interfaces import ITrackRepository

    prefix = uuid.uuid4().hex[:8]
    resolve(ITrackRepository).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"T{index}",
                artist="A",
                file_path=path,
            )
            for index, path in enumerate(paths)
        ]
    )
    rows = (
        database()
        .connect()
        .execute(
            "SELECT id, rekordbox_track_id FROM tracks WHERE rekordbox_track_id LIKE ?",
            (f"{prefix}-%",),
        )
    )
    by_rekordbox = {row["rekordbox_track_id"]: int(row["id"]) for row in rows}
    return [by_rekordbox[f"{prefix}-{index}"] for index in range(len(paths))]


def use_checker(checker: Callable[[str], Tuple[str, Optional[int]]]) -> None:
    """Replace the engine's check service with one looking at paths through ``checker``."""
    from cuepoint.services.interfaces import (
        IActivityService,
        IBatchService,
        IDatabaseService,
        IFileCheckService,
        IFileStatusRepository,
    )

    service = FileCheckService(
        resolve(IFileStatusRepository),
        resolve(IBatchService),
        resolve(IActivityService),
        resolve(IDatabaseService),
        checker=checker,
    )
    get_container().register_singleton(IFileCheckService, service)


class Gate:
    """A checker that holds the first path it is asked about until released."""

    def __init__(self) -> None:
        self.reached = threading.Event()
        self.release = threading.Event()
        self.calls = 0

    def __call__(self, path: str) -> Tuple[str, Optional[int]]:
        self.calls += 1
        self.reached.set()
        assert self.release.wait(30), "the gate was never released"
        return check_file(path)


def hold(store: JobStore, job_type: str) -> threading.Event:
    """Start a job of ``job_type`` that runs until the returned event is set."""
    released = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda job: released.wait(30), exclusive=True
    )
    return released


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    """A sandboxed library with services bootstrapped over it."""
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
def present(tmp_path) -> str:
    track = tmp_path / "music" / "present.mp3"
    track.parent.mkdir()
    track.write_bytes(b"12345")
    return str(track)


# ------------------------------------------------------------ after an import


class TestAfterAnImport:
    def test_an_import_is_followed_by_a_check_of_the_whole_library(
        self, store, tmp_path, present
    ):
        missing = str(tmp_path / "music" / "missing.mp3")
        export = write_export(tmp_path, [present, missing], "collection.xml")

        imported = finished(store, start_library_import_job(store, export))
        assert imported.state is JobState.SUCCEEDED
        wait_until(lambda: len(checks_of(store)) == 1, "the check to start")
        check = finished(store, checks_of(store)[0])
        wait_until(lambda: recorded_state(check.id) == "succeeded", "the job record")

        assert check.state is JobState.SUCCEEDED
        assert check.result is not None
        assert (
            check.result["trigger"],
            check.result["total"],
            check.result["present"],
            check.result["missing"],
        ) == ("import", 2, 1, 1)
        assert job_log() == [
            (JOB_TYPE_LIBRARY_IMPORT, "succeeded"),
            (JOB_TYPE_FILE_CHECK, "succeeded"),
        ]
        assert check.created_at >= imported.updated_at
        assert set(statuses().values()) == {(FILE_PRESENT, None), (FILE_MISSING, None)}

    def test_a_disconnected_drive_is_one_line_in_the_activity_feed(
        self, store, tmp_path, present
    ):
        volume = f"/Volumes/CuePoint-{uuid.uuid4().hex[:8]}"
        paths = [f"{volume}/Music/{index:03}.mp3" for index in range(300)]
        export = write_export(tmp_path, [present, *paths], "collection.xml")

        finished(store, start_library_import_job(store, export))
        wait_until(lambda: len(checks_of(store)) == 1, "the check to start")
        finished(store, checks_of(store)[0])

        assert [event["summary"] for event in events(EVENT_ROOT_UNAVAILABLE)] == [
            f"300 tracks on {volume} — the drive is not connected"
        ]
        [counts] = events(EVENT_FILES_CHECKED)
        assert counts["detail"]["unavailable"] == 300
        assert counts["detail"]["present"] == 1

    def test_a_cancelled_import_is_followed_by_nothing(self, store, tmp_path, present):
        export = write_export(tmp_path, [present], "collection.xml")
        job = Job(id="cancelled-import", type=JOB_TYPE_LIBRARY_IMPORT)
        job.cancel_requested = True
        run_library_import_job(job, store, export)
        assert job.state is JobState.CANCELLED
        assert checks_of(store) == []

    def test_a_failed_import_is_followed_by_nothing(self, store, tmp_path):
        job = Job(id="failed-import", type=JOB_TYPE_LIBRARY_IMPORT)
        run_library_import_job(job, store, str(tmp_path / "nowhere.xml"))
        assert job.state is JobState.FAILED
        assert checks_of(store) == []

    def test_an_import_beside_a_running_check_is_never_failed_by_it(
        self, store, tmp_path
    ):
        """An import beside the checks imports start is never failed by them.

        The symptom from building this step: an import failed with "database is
        locked" because a check committed inside its read-then-write
        transaction. Whether that gap is hit here depends on thread timing, so
        this guards the symptom; the deterministic reproduction is
        ``regression/test_regression_write_after_read_snapshot.py``.
        """
        tracks = [f"/cuepoint-no-such-folder/{index:05}.mp3" for index in range(3000)]
        export = write_export(tmp_path, tracks, "collection.xml")
        for round_number in range(6):
            from cuepoint.services.interfaces import IDatabaseService

            with resolve(IDatabaseService).transaction() as conn:
                conn.execute("DELETE FROM tracks")
            job = Job(id=f"import-{round_number}", type=JOB_TYPE_LIBRARY_IMPORT)
            run_library_import_job(job, store, export)
            assert job.state is JobState.SUCCEEDED, job.error


# ------------------------------------------------------------- after a refresh


class TestAfterARefresh:
    def test_an_applied_refresh_is_followed_by_a_check_of_the_paths_it_holds(
        self, store, tmp_path, present
    ):
        moved = tmp_path / "music" / "moved.mp3"
        moved.write_bytes(b"moved")
        first = write_export(tmp_path, [present], "collection.xml")
        finished(store, start_library_import_job(store, first))
        wait_until(lambda: len(checks_of(store)) == 1, "the import's check")
        finished(store, checks_of(store)[0])

        # Rekordbox's Relocate, then a re-export: same track, new path.
        second = write_export(tmp_path, [str(moved)], "collection-2.xml")
        diffs = RefreshDiffStore()
        preview = finished(
            store, start_refresh_preview_job(store, second, diff_store=diffs)
        )
        assert preview.result is not None
        applied = finished(
            store,
            start_refresh_apply_job(store, preview.result["diff_id"], diff_store=diffs),
        )
        assert applied.state is JobState.SUCCEEDED, applied.error
        wait_until(lambda: len(checks_of(store)) == 2, "the refresh's check")
        check = finished(store, checks_of(store)[1])
        wait_until(lambda: recorded_state(check.id) == "succeeded", "the job record")

        assert check.result is not None and check.result["trigger"] == "refresh"
        assert statuses() == {moved.as_posix(): (FILE_PRESENT, None)}
        assert job_log() == [
            (JOB_TYPE_LIBRARY_IMPORT, "succeeded"),
            (JOB_TYPE_FILE_CHECK, "succeeded"),
            (JOB_TYPE_LIBRARY_REFRESH_PREVIEW, "succeeded"),
            (JOB_TYPE_LIBRARY_REFRESH_APPLY, "succeeded"),
            (JOB_TYPE_FILE_CHECK, "succeeded"),
        ]


# --------------------------------------------------------- what waits for what


class TestWhatWaitsForWhat:
    @pytest.mark.parametrize(
        "job_type", [JOB_TYPE_LIBRARY_IMPORT, JOB_TYPE_LIBRARY_REFRESH_APPLY]
    )
    def test_a_check_refuses_to_start_beside_a_rewrite_of_the_library(
        self, store, present, job_type
    ):
        [track] = add_tracks([present])
        released = hold(store, job_type)
        try:
            with pytest.raises(JobTypeBusyError) as busy:
                start_file_check_job(store, BatchSelection.of_ids([track]))
            assert busy.value.job_type == job_type
            # Nor does a follow-up wait for it: that job starts its own.
            assert check_after_library_job(store, "refresh") is None
            assert pending_follow_up(store) is None
            assert checks_of(store) == []
        finally:
            released.set()

    def test_a_rewrite_finishing_during_a_check_gets_its_check_after_it_once(
        self, store, tmp_path, present
    ):
        [track] = add_tracks([present])
        gate = Gate()
        use_checker(gate)
        started = start_file_check_job(store, BatchSelection.of_ids([track]))
        assert gate.reached.wait(10)

        # An import is not refused beside the check, and finishes first.
        export = write_export(tmp_path, [present], "collection.xml")
        imported = finished(store, start_library_import_job(store, export))
        assert imported.state is JobState.SUCCEEDED
        # The import asks for its check just after its state is set, so wait.
        wait_until(lambda: pending_follow_up(store) == "import", "the check request")
        assert [job.id for job in checks_of(store)] == [started.job.id]

        gate.release.set()
        wait_until(lambda: len(checks_of(store)) == 2, "the follow-up")
        follow_up = finished(store, checks_of(store)[1])
        assert finished(store, started.job).state is JobState.SUCCEEDED
        assert follow_up.state is JobState.SUCCEEDED
        assert follow_up.result is not None and follow_up.result["trigger"] == "import"
        assert pending_follow_up(store) is None
        time.sleep(0.2)
        assert len(checks_of(store)) == 2

    def test_a_failed_check_still_starts_the_follow_up_waiting_for_it(
        self, store, present
    ):
        [track] = add_tracks([present])
        gate = Gate()
        failures = {"left": 1}

        def fail_once(path: str):
            if failures["left"]:
                failures["left"] -= 1
                gate(path)
                raise OSError("the share went away mid-check")
            return check_file(path)

        use_checker(fail_once)
        first = start_file_check_job(store, BatchSelection.of_ids([track]))
        assert gate.reached.wait(10)
        assert check_after_library_job(store, "refresh") is None
        gate.release.set()

        failed = finished(store, first.job)
        assert failed.state is JobState.FAILED
        assert failed.error is not None and failed.error["code"] == "FILE_CHECK_FAILED"
        wait_until(lambda: len(checks_of(store)) == 2, "the follow-up")
        assert finished(store, checks_of(store)[1]).state is JobState.SUCCEEDED

    def test_a_check_is_exclusive_with_another_check(self, store, present):
        [track] = add_tracks([present])
        gate = Gate()
        use_checker(gate)
        start_file_check_job(store, BatchSelection.of_ids([track]))
        assert gate.reached.wait(10)
        try:
            with pytest.raises(JobTypeBusyError) as busy:
                start_file_check_job(store, BatchSelection.of_ids([track]))
            assert busy.value.job_type == JOB_TYPE_FILE_CHECK
        finally:
            gate.release.set()


# ------------------------------------------------------------------ on request


class TestOnRequest:
    def test_a_selection_is_checked_as_a_job(self, store, tmp_path, present):
        ids = add_tracks([present, str(tmp_path / "gone.mp3")])
        started = start_file_check_job(store, BatchSelection.of_ids(ids))
        assert started.to_dict() == {"job_id": started.job.id, "tracks": 2}
        assert started.job.type == JOB_TYPE_FILE_CHECK

        job = finished(store, started.job)
        assert job.state is JobState.SUCCEEDED
        assert job.result is not None
        assert (
            job.result["trigger"],
            job.result["present"],
            job.result["missing"],
        ) == (
            "request",
            1,
            1,
        )
        assert job.progress is not None
        # The words the status strip shows, not the constant that holds them.
        assert job.progress.status_message == "Checking files"
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (2, 2)

    def test_a_query_selection_is_resolved_through_the_batch_path(
        self, store, tmp_path, present
    ):
        add_tracks([present, str(tmp_path / "gone.mp3"), ""])
        started = start_file_check_job(store, BatchSelection.matching(BrowseQuery()))
        assert started.tracks == 3
        job = finished(store, started.job)
        assert job.result is not None and job.result["no_path"] == 1

    def test_a_selection_of_nothing_in_the_library_is_refused_before_any_job(
        self, store
    ):
        with pytest.raises(ValueError) as refused:
            start_file_check_job(store, BatchSelection.of_ids([999_999]))
        assert str(refused.value) == NOTHING_TO_CHECK
        assert store.list_all() == []

    def test_a_cancel_is_prompt_and_keeps_what_was_checked(self, store):
        ids = add_tracks([f"/cuepoint-no-such-folder/{i:05}.mp3" for i in range(3000)])
        reached = threading.Event()
        cancelled = threading.Event()
        calls = {"n": 0}
        lock = threading.Lock()

        def checker(path: str):
            with lock:
                calls["n"] += 1
                number = calls["n"]
            # From the 1,500th look on, every look waits for the cancel, so no
            # more than a pool's worth can be started before it arrives.
            if number >= 1500:
                reached.set()
                assert cancelled.wait(10)
            return check_file(path)

        use_checker(checker)
        started = start_file_check_job(store, BatchSelection.of_ids(ids))
        assert reached.wait(20)
        store.request_cancel(started.job.id)
        asked = time.monotonic()
        cancelled.set()

        job = finished(store, started.job)
        assert time.monotonic() - asked < 2.0
        assert job.state is JobState.CANCELLED
        assert job.error is not None and job.error["code"] == "JOB_CANCELLED"
        assert job.result is not None
        assert job.result["cancelled"] is True
        assert 1500 <= job.result["completed"] <= 1500 + FILE_CHECK_WORKERS
        assert job.result["completed"] == calls["n"] == len(statuses())

    def test_an_empty_library_is_checked_and_nothing_is_recorded(self, store):
        job = check_after_library_job(store, "import")
        assert job is not None
        job = finished(store, job)
        assert job.state is JobState.SUCCEEDED
        assert job.result is not None and job.result["total"] == 0
        assert events(EVENT_FILES_CHECKED) == []
