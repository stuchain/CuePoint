#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox export as a job (EXPORT-05, DEC-084).

Everything here runs through the bootstrapped container and real job threads,
over a library imported by a real import job, because what can go wrong is
between jobs as much as inside one:

- **A refusal is an answer, not a job.** A destination that is the source never
  becomes a job that fails a moment later in a log.
- **What waits for what.** Two exports at once are refused, and so is an export
  beside an import, a refresh or a batch edit — in both directions, because a
  one-way refusal lets the other side start first. A match is not refused: it
  writes nothing an export reads.
- **Every ending is the job's state and the row's outcome, agreeing.** Written,
  cancelled and failed.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Callable, List

import pytest

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.data.rekordbox_export import PHASE_PLAYLISTS, PHASE_TRACKS
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import (
    JOB_TYPE_LIBRARY_IMPORT,
    start_library_import_job,
)
from cuepoint.engine.library_refresh import (
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    LIBRARY_JOB_TYPES,
)
from cuepoint.engine.match_jobs import JOB_TYPE_CLEAN_MATCH, MATCH_JOB_CONFLICTS
from cuepoint.engine.rekordbox_export_jobs import (
    FAILURE_CODE,
    JOB_TYPE_REKORDBOX_EXPORT,
    PHASE_MESSAGES,
    _progress_reporter,
    start_rekordbox_export,
)
from cuepoint.engine.batch_jobs import start_batch_job
from cuepoint.models.rekordbox_export import (
    EXPORT_CANCELLED,
    EXPORT_FAILED,
    EXPORT_WRITTEN,
)
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchOperation
from cuepoint.services.rekordbox_export_service import (
    DESTINATION_IS_SOURCE,
    EVENT_REKORDBOX_EXPORTED,
    SOURCE_MISSING,
    ExportDestinationError,
)
from cuepoint.utils.di_container import get_container, reset_container

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)

COLLECTION = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="3">
    <TRACK TrackID="1" Name="One" Artist="A" Tonality="Am" AverageBpm="128.00"\
 Location="file://localhost/C:/Music/one.mp3">
      <POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>
    </TRACK>
    <TRACK TrackID="2" Name="Two" Artist="B" Tonality="F#m" AverageBpm="124.00"\
 Location="file://localhost/C:/Music/two.mp3"/>
    <TRACK TrackID="3" Name="Three" Artist="C" Tonality="Gm" AverageBpm="90.00"\
 Location="file://localhost/C:/Music/three.mp3"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="0"/>
  </PLAYLISTS>
</DJ_PLAYLISTS>
"""


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


def export_service() -> Any:
    from cuepoint.services.interfaces import IRekordboxExportService

    return resolve(IRekordboxExportService)


def finished(store: JobStore, job: Job) -> Job:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.type}")
    return store.get(job.id)


def export_rows() -> List[dict]:
    rows = database().connect().execute("SELECT * FROM rekordbox_exports ORDER BY id")
    return [dict(row) for row in rows]


def exported_events() -> List[dict]:
    rows = (
        database()
        .connect()
        .execute(
            "SELECT detail_json FROM activity_events WHERE type = ? ORDER BY id",
            (EVENT_REKORDBOX_EXPORTED,),
        )
    )
    return [json.loads(row["detail_json"]) for row in rows]


def blocking_job(store: JobStore, job_type: str, conflicts=()) -> threading.Event:
    """A job of ``job_type`` that runs until the returned event is set."""
    release = threading.Event()
    store.create_job(
        job_type=job_type,
        runner=lambda _job: release.wait(30),
        exclusive=True,
        conflicts_with=conflicts,
    )
    return release


class HeldExport:
    """The real export service, held at the start of the job until released.

    What lets a test have an export demonstrably running — to start something
    beside it, to cancel it, or to change the world under it — without racing
    a three-track export to its end.
    """

    def __init__(self, real: Any) -> None:
        self._real = real
        self.started = threading.Event()
        self.release = threading.Event()

    def validate(self, *args: Any, **kwargs: Any) -> Any:
        return self._real.validate(*args, **kwargs)

    def export(self, *args: Any, **kwargs: Any) -> Any:
        self.started.set()
        self.release.wait(30)
        return self._real.export(*args, **kwargs)


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
def source(tmp_path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_text(COLLECTION, encoding="utf-8")
    return path


@pytest.fixture
def imported(store, source) -> Path:
    """The source, imported by a real import job, with its follow-ups done."""
    job = finished(store, start_library_import_job(store, str(source)))
    assert job.state is JobState.SUCCEEDED
    wait_until(
        lambda: all(job.state in TERMINAL for job in store.list_all()),
        "the import's follow-up jobs",
    )
    return source


@pytest.fixture
def destination(tmp_path) -> Path:
    folder = tmp_path / "exports"
    folder.mkdir()
    return folder / "export.xml"


@pytest.fixture
def held(imported) -> HeldExport:
    return HeldExport(export_service())


# ------------------------------------------------------------ a full export


class TestAnExportJob:
    def test_it_succeeds_writes_the_file_one_row_and_one_event(
        self, store, imported, destination
    ):
        job = finished(
            store, start_rekordbox_export(store, [], "normal", str(destination))
        )

        assert job.type == JOB_TYPE_REKORDBOX_EXPORT
        assert job.state is JobState.SUCCEEDED
        assert destination.exists()
        (row,) = export_rows()
        assert row["outcome"] == EXPORT_WRITTEN
        assert row["job_id"] == job.id
        assert row["track_count"] == 3
        (event,) = exported_events()
        assert event["job_id"] == job.id
        assert event["export_id"] == row["id"]

    def test_its_answer_is_the_exports_own(self, store, imported, destination):
        job = finished(
            store, start_rekordbox_export(store, [], "camelot", str(destination))
        )

        assert job.result["outcome"] == EXPORT_WRITTEN
        assert job.result["export_id"] == export_rows()[0]["id"]
        assert job.result["changed_track_count"] == 3
        assert job.result["fields"] == ["key"]
        assert job.result["report"]["key_format"] == "camelot"

    def test_its_playlists_are_written_and_recorded(self, store, imported, destination):
        from cuepoint.services.interfaces import ICollectionService

        collections = resolve(ICollectionService)
        node = collections.create_collection("Saturday")
        ids = [
            int(row["id"])
            for row in database().connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        collections.add_tracks(node.id, ids[:2])

        job = finished(
            store,
            start_rekordbox_export(store, [int(node.id)], "normal", str(destination)),
        )

        assert job.result["playlist_count"] == 1
        count = (
            database()
            .connect()
            .execute("SELECT count(*) FROM rekordbox_export_playlists")
            .fetchone()[0]
        )
        assert count == 1

    def test_it_reports_progress_in_its_two_phases(self, store, imported, destination):
        seen: List[str] = []
        real = store.report_progress

        def spy(job: Job, progress: ProgressInfo) -> None:
            # The import's follow-up check reports through the same store.
            if job.type == JOB_TYPE_REKORDBOX_EXPORT:
                seen.append(progress.status_message)
            real(job, progress)

        store.report_progress = spy  # type: ignore[method-assign]
        finished(store, start_rekordbox_export(store, [], "normal", str(destination)))

        assert seen[0] == PHASE_MESSAGES[PHASE_TRACKS]
        assert seen[-1] == PHASE_MESSAGES[PHASE_PLAYLISTS]

    def test_the_job_is_recorded_in_the_job_log(self, store, imported, destination):
        job = finished(
            store, start_rekordbox_export(store, [], "normal", str(destination))
        )

        row = (
            database()
            .connect()
            .execute("SELECT type, state FROM jobs WHERE id = ?", (job.id,))
            .fetchone()
        )
        assert (row["type"], row["state"]) == (JOB_TYPE_REKORDBOX_EXPORT, "succeeded")


# ------------------------------------------------------------- refused first


class TestARefusalIsNotAJob:
    def test_the_source_as_destination_is_refused_before_any_job_exists(
        self, store, imported
    ):
        with pytest.raises(ExportDestinationError) as refused:
            start_rekordbox_export(store, [], "normal", str(imported))

        assert refused.value.reason == DESTINATION_IS_SOURCE
        assert [
            job for job in store.list_all() if job.type == JOB_TYPE_REKORDBOX_EXPORT
        ] == []
        assert export_rows() == []

    def test_an_unknown_notation_is_refused_before_any_job_exists(
        self, store, imported, destination
    ):
        with pytest.raises(ValueError):
            start_rekordbox_export(store, [], "boring", str(destination))

        assert [
            job for job in store.list_all() if job.type == JOB_TYPE_REKORDBOX_EXPORT
        ] == []

    def test_a_library_never_imported_is_refused_before_any_job_exists(
        self, store, destination
    ):
        from cuepoint.services.rekordbox_export_service import ExportSourceError

        with pytest.raises(ExportSourceError):
            start_rekordbox_export(store, [], "normal", str(destination))

        assert store.list_all() == []

    def test_a_source_gone_by_the_time_the_job_runs_fails_it_and_records_nothing(
        self, store, imported, destination, held
    ):
        job = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)
        imported.unlink()
        held.release.set()

        ended = finished(store, job)

        assert ended.state is JobState.FAILED
        assert ended.error["code"] == SOURCE_MISSING
        assert export_rows() == []
        assert not destination.exists()


# ------------------------------------------------------------ what waits for what


class TestWhatWaitsForWhat:
    def test_a_second_export_is_refused_while_one_runs(
        self, store, imported, destination, held
    ):
        first = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)

        with pytest.raises(JobTypeBusyError) as busy:
            start_rekordbox_export(
                store, [], "normal", str(destination.with_name("b.xml"))
            )

        assert busy.value.job_id == first.id
        held.release.set()
        assert finished(store, first).state is JobState.SUCCEEDED

    def test_an_import_is_refused_while_an_export_runs(
        self, store, imported, destination, held
    ):
        export = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)

        with pytest.raises(JobTypeBusyError) as busy:
            start_library_import_job(store, str(imported))

        assert busy.value.job_type == JOB_TYPE_REKORDBOX_EXPORT
        held.release.set()
        finished(store, export)

    def test_a_batch_edit_is_refused_while_an_export_runs(
        self, store, imported, destination, held
    ):
        export = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)

        with pytest.raises(JobTypeBusyError):
            start_batch_job(store, [1], BatchOperation("rating", 3))

        held.release.set()
        finished(store, export)

    @pytest.mark.parametrize(
        "job_type", (JOB_TYPE_LIBRARY_IMPORT, JOB_TYPE_LIBRARY_REFRESH_APPLY)
    )
    def test_an_export_is_refused_while_the_library_is_being_rewritten(
        self, store, imported, destination, job_type
    ):
        release = blocking_job(store, job_type, LIBRARY_JOB_TYPES)
        try:
            with pytest.raises(JobTypeBusyError) as busy:
                start_rekordbox_export(store, [], "normal", str(destination))
            assert busy.value.job_type == job_type
        finally:
            release.set()

    def test_a_match_does_not_hold_an_export_up(self, store, imported, destination):
        """A match records attempts and applies no values: nothing an export
        reads. Blocking one for an hour-long match would be a refusal with no
        reason behind it."""
        release = blocking_job(store, JOB_TYPE_CLEAN_MATCH, MATCH_JOB_CONFLICTS)
        try:
            job = finished(
                store, start_rekordbox_export(store, [], "normal", str(destination))
            )
            assert job.state is JobState.SUCCEEDED
        finally:
            release.set()

    def test_an_export_does_not_hold_a_match_up(
        self, store, imported, destination, held
    ):
        export = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)
        try:
            release = blocking_job(store, JOB_TYPE_CLEAN_MATCH, MATCH_JOB_CONFLICTS)
            release.set()
        finally:
            held.release.set()
        finished(store, export)

    def test_the_export_is_one_of_the_library_jobs(self):
        assert JOB_TYPE_REKORDBOX_EXPORT in LIBRARY_JOB_TYPES


# ------------------------------------------------------------ how it ends


class TestHowItEnds:
    def test_a_cancel_ends_the_job_cancelled_with_a_cancelled_row_and_no_file(
        self, store, imported, destination, held
    ):
        job = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)
        store.request_cancel(job.id)
        held.release.set()

        ended = finished(store, job)

        assert ended.state is JobState.CANCELLED
        assert ended.error["code"] == "JOB_CANCELLED"
        assert ended.result["outcome"] == EXPORT_CANCELLED
        (row,) = export_rows()
        assert row["outcome"] == EXPORT_CANCELLED
        assert row["job_id"] == job.id
        assert not destination.exists()
        assert list(destination.parent.iterdir()) == []
        assert exported_events() == []

    def test_a_failure_ends_the_job_failed_with_a_failed_row_and_the_reason(
        self, store, imported, destination, held
    ):
        job = start_rekordbox_export(
            store, [], "normal", str(destination), service=held
        )
        held.started.wait(10)
        imported.write_text("<DJ_PLAYLISTS><COLLECTION>", encoding="utf-8")
        held.release.set()

        ended = finished(store, job)

        assert ended.state is JobState.FAILED
        assert ended.error["code"] == FAILURE_CODE
        assert "not well-formed" in ended.error["message"]
        assert ended.result["outcome"] == EXPORT_FAILED
        (row,) = export_rows()
        assert row["outcome"] == EXPORT_FAILED
        assert "not well-formed" in row["error"]
        assert not destination.exists()
        assert exported_events() == []

    def test_an_unexpected_error_still_ends_the_job(self, store, imported, destination):
        class Broken:
            def validate(self, *args: Any, **kwargs: Any) -> Any:
                return export_service().validate(*args, **kwargs)

            def export(self, *args: Any, **kwargs: Any) -> Any:
                raise RuntimeError("something nobody planned for")

        ended = finished(
            store,
            start_rekordbox_export(
                store, [], "normal", str(destination), service=Broken()
            ),
        )

        assert ended.state is JobState.FAILED
        assert ended.error == {
            "code": FAILURE_CODE,
            "message": "something nobody planned for",
        }


# ------------------------------------------------------------ progress sampling


class RecordingStore:
    def __init__(self) -> None:
        self.ticks: List[ProgressInfo] = []

    def report_progress(self, job: Any, progress: ProgressInfo) -> None:
        self.ticks.append(progress)


class TestProgressSampling:
    def test_each_phase_is_seen_to_start_and_to_finish(self):
        recorder = RecordingStore()
        report = _progress_reporter(
            Job(id="j", type=JOB_TYPE_REKORDBOX_EXPORT), recorder
        )  # type: ignore[arg-type]

        for done in range(0, 5001):
            report(PHASE_TRACKS, done, 5000)
        for done in range(0, 4):
            report(PHASE_PLAYLISTS, done, 3)

        tracks = [t for t in recorder.ticks if t.status_message == "Patching tracks"]
        playlists = [
            t for t in recorder.ticks if t.status_message == "Building playlists"
        ]
        assert tracks[0].completed_tracks == 0
        assert tracks[-1].completed_tracks == 5000
        assert playlists[0].completed_tracks == 0
        assert playlists[-1].completed_tracks == 3
        # Sampled: five thousand ticks in well under a second is a handful.
        assert len(tracks) < 50

    def test_an_unknown_phase_is_still_described(self):
        recorder = RecordingStore()
        report = _progress_reporter(
            Job(id="j", type=JOB_TYPE_REKORDBOX_EXPORT), recorder
        )  # type: ignore[arg-type]

        report("something new", 0, 1)

        assert recorder.ticks[0].status_message == "Exporting"

    def test_the_two_phases_have_words_of_their_own(self):
        assert PHASE_MESSAGES == {
            PHASE_TRACKS: "Patching tracks",
            PHASE_PLAYLISTS: "Building playlists",
        }
