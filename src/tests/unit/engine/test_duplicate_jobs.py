#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-08's duplicate scan as a job, and the scans that follow other jobs.

Through the bootstrapped container and real job threads:

- **A scan follows every import, applied refresh and match job**, in the job log,
  and a match job that never wrote its plan asks for none.
- **What waits for what.** A scan refuses to start beside a rewrite of the
  library; a rewrite that finishes during a scan still gets its scan, once.
- **On request**, for named signals, with refusals before any job.
- **Cancelling stops it**, and a failure keeps its code.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Sequence, Tuple

import pytest

from cuepoint.engine import match_jobs
from cuepoint.engine.artwork_jobs import JOB_TYPE_ARTWORK_SCAN
from cuepoint.engine.duplicate_jobs import (
    JOB_TYPE_DUPLICATE_SCAN,
    pending_scan,
    scan_after,
    start_duplicate_scan_job,
)
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import (
    JOB_TYPE_LIBRARY_IMPORT,
    start_library_import_job,
)
from cuepoint.engine.library_refresh import (
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    JOB_TYPE_LIBRARY_REFRESH_PREVIEW,
    RefreshDiffStore,
    start_refresh_apply_job,
    start_refresh_preview_job,
)
from cuepoint.engine.match_jobs import JOB_TYPE_CLEAN_MATCH
from cuepoint.services import database_service as database_service_module
from cuepoint.services import duplicate_service as duplicate_service_module
from cuepoint.services.duplicate_service import (
    EVENT_DUPLICATES_SCANNED,
    DuplicateService,
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


def write_export(
    tmp_path: Path, tracks: Sequence[Tuple[str, str, int]], name: str
) -> str:
    """A collection of ``(location, title, seconds)`` tracks, numbered in order."""
    entries = "\n".join(
        f'    <TRACK TrackID="{index}" Name="{title}" Artist="An Artist"'
        f' TotalTime="{seconds}" Location="file://localhost{location}"/>'
        for index, (location, title, seconds) in enumerate(tracks)
    )
    export = tmp_path / name
    export.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="0"></NODE></PLAYLISTS>\n'
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(export)


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def database() -> Any:
    from cuepoint.services.interfaces import IDatabaseService

    return resolve(IDatabaseService)


def jobs_of(store: JobStore, job_type: str) -> List[Job]:
    return [job for job in store.list_all() if job.type == job_type]


def finished(store: JobStore, job: Job) -> Job:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.type}")
    return store.get(job.id)


def all_finished(store: JobStore) -> None:
    wait_until(
        lambda: all(job.state in TERMINAL for job in store.list_all()), "every job"
    )


def job_log() -> List[Tuple[str, str]]:
    return [
        (row["type"], row["state"])
        for row in database()
        .connect()
        .execute("SELECT type, state FROM jobs ORDER BY created_at, rowid")
    ]


def scanned_events() -> List[Dict[str, Any]]:
    return [
        json.loads(row["detail_json"])
        for row in database()
        .connect()
        .execute(
            "SELECT detail_json FROM activity_events WHERE type = ? ORDER BY id",
            (EVENT_DUPLICATES_SCANNED,),
        )
    ]


def hold(store: JobStore, job_type: str) -> threading.Event:
    released = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda job: released.wait(30), exclusive=True
    )
    return released


class HeldScan(DuplicateService):
    """A scan that waits at its start until released, then scans for real."""

    def __init__(self, *args: Any, fail_first: bool = False, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.reached = threading.Event()
        self.release = threading.Event()
        self.calls = 0
        self.fail_first = fail_first

    def scan(self, signals=None, *, trigger="request", should_cancel=None):
        self.calls += 1
        self.reached.set()
        assert self.release.wait(30), "the scan was never released"
        if self.fail_first and self.calls == 1:
            raise OSError("the scan fell over")
        return super().scan(signals, trigger=trigger, should_cancel=should_cancel)


def use_service(service: DuplicateService) -> None:
    from cuepoint.services.interfaces import IDuplicateService

    get_container().register_singleton(IDuplicateService, service)


def held(**kwargs: Any) -> HeldScan:
    from cuepoint.services.interfaces import (
        IActivityService,
        IDatabaseService,
        IDuplicateRepository,
    )

    service = HeldScan(
        resolve(IDuplicateRepository),
        resolve(IActivityService),
        resolve(IDatabaseService),
        **kwargs,
    )
    use_service(service)
    return service


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
    all_finished(job_store)


PAIR = (("/m/a.mp3", "Track", 300), ("/m/b.mp3", "Track (Original Mix)", 301))


# ------------------------------------------------------------ what follows


class TestWhatFollows:
    def test_an_import_is_followed_by_a_scan_in_the_job_log(self, store, tmp_path):
        export = write_export(tmp_path, PAIR, "collection.xml")
        finished(store, start_library_import_job(store, export))
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 1, "the scan"
        )
        scan = finished(store, jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)[0])
        all_finished(store)
        wait_until(lambda: all(state != "running" for _, state in job_log()), "records")

        assert scan.state is JobState.SUCCEEDED
        assert scan.result is not None and scan.result["trigger"] == "import"
        assert scan.result["groups"] == 1
        # The check's own follow-up (CLEAN-09) is created when the check ends,
        # so it may come before or after the scan in the log.
        wait_until(
            lambda: (JOB_TYPE_ARTWORK_SCAN, "succeeded") in job_log(),
            "the artwork scan after the check",
        )
        assert job_log()[0] == (JOB_TYPE_LIBRARY_IMPORT, "succeeded")
        assert sorted(job_log()) == sorted(
            [
                (JOB_TYPE_LIBRARY_IMPORT, "succeeded"),
                (JOB_TYPE_FILE_CHECK, "succeeded"),
                (JOB_TYPE_DUPLICATE_SCAN, "succeeded"),
                (JOB_TYPE_ARTWORK_SCAN, "succeeded"),
            ]
        )
        assert [event["text"] for event in scanned_events()] == [1]

    def test_an_applied_refresh_is_followed_by_a_scan(self, store, tmp_path):
        first = write_export(tmp_path, PAIR[:1], "collection.xml")
        finished(store, start_library_import_job(store, first))
        all_finished(store)

        second = write_export(tmp_path, PAIR, "collection-2.xml")
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
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 2, "the scan"
        )
        all_finished(store)

        latest = jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)[1]
        assert latest.result is not None
        assert (latest.result["trigger"], latest.result["groups"]) == ("refresh", 1)
        types = [job_type for job_type, _ in job_log()]
        assert types.index(JOB_TYPE_LIBRARY_REFRESH_APPLY) < len(types) - 1 - types[
            ::-1
        ].index(JOB_TYPE_DUPLICATE_SCAN)
        assert JOB_TYPE_LIBRARY_REFRESH_PREVIEW in types

    def test_a_match_job_that_wrote_its_plan_is_followed_by_a_scan(
        self, store, monkeypatch
    ):
        def match(job: Job, job_store: JobStore, prepare) -> None:
            prepare(object())
            job_store.finish(job, state=JobState.SUCCEEDED)

        monkeypatch.setattr(match_jobs, "_run_match_job", match)
        job = store.create_job(
            job_type=JOB_TYPE_CLEAN_MATCH,
            runner=lambda job: match_jobs.run_match_job(job, store, lambda svc: None),
        )
        finished(store, job)
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 1, "the scan"
        )
        scan = finished(store, jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)[0])
        assert scan.result is not None and scan.result["trigger"] == "match"

    def test_a_match_job_that_never_wrote_its_plan_asks_for_nothing(
        self, store, monkeypatch
    ):
        def refuse(service: Any) -> None:
            raise ValueError("nothing to match")

        def match(job: Job, job_store: JobStore, prepare) -> None:
            try:
                prepare(object())
            finally:
                job_store.finish(
                    job, state=JobState.FAILED, error={"code": "X", "message": "x"}
                )

        monkeypatch.setattr(match_jobs, "_run_match_job", match)
        job = store.create_job(
            job_type=JOB_TYPE_CLEAN_MATCH,
            runner=lambda job: match_jobs.run_match_job(job, store, refuse),
        )
        finished(store, job)
        time.sleep(0.2)
        assert jobs_of(store, JOB_TYPE_DUPLICATE_SCAN) == []


# ------------------------------------------------------ what waits for what


class TestWhatWaitsForWhat:
    @pytest.mark.parametrize(
        "job_type", [JOB_TYPE_LIBRARY_IMPORT, JOB_TYPE_LIBRARY_REFRESH_APPLY]
    )
    def test_a_scan_refuses_to_start_beside_a_rewrite_of_the_library(
        self, store, job_type
    ):
        released = hold(store, job_type)
        try:
            with pytest.raises(JobTypeBusyError) as busy:
                start_duplicate_scan_job(store)
            assert busy.value.job_type == job_type
            assert scan_after(store, "import") is None
            assert pending_scan(store) is None
        finally:
            released.set()

    def test_a_rewrite_finishing_during_a_scan_gets_its_scan_after_it_once(
        self, store, tmp_path
    ):
        service = held()
        first = start_duplicate_scan_job(store)
        assert service.reached.wait(10)

        export = write_export(tmp_path, PAIR, "collection.xml")
        imported = finished(store, start_library_import_job(store, export))
        assert imported.state is JobState.SUCCEEDED
        # The import asks for its scan just after its state is set, so wait.
        wait_until(lambda: pending_scan(store) == "import", "the scan request")
        assert [job.id for job in jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)] == [
            first.job.id
        ]

        service.release.set()
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 2, "follow-up"
        )
        all_finished(store)
        follow_up = jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)[1]
        assert follow_up.result is not None and follow_up.result["trigger"] == "import"
        assert pending_scan(store) is None
        time.sleep(0.2)
        assert len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 2

    def test_a_failed_scan_still_starts_the_scan_waiting_for_it(self, store):
        service = held(fail_first=True)
        first = start_duplicate_scan_job(store)
        assert service.reached.wait(10)
        assert scan_after(store, "match") is None
        service.release.set()

        failed = finished(store, first.job)
        assert failed.state is JobState.FAILED
        assert (
            failed.error is not None and failed.error["code"] == "DUPLICATE_SCAN_FAILED"
        )
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)) == 2, "follow-up"
        )
        assert finished(store, jobs_of(store, JOB_TYPE_DUPLICATE_SCAN)[1]).state is (
            JobState.SUCCEEDED
        )

    def test_a_scan_is_exclusive_with_another(self, store):
        service = held()
        start_duplicate_scan_job(store)
        assert service.reached.wait(10)
        try:
            with pytest.raises(JobTypeBusyError) as busy:
                start_duplicate_scan_job(store)
            assert busy.value.job_type == JOB_TYPE_DUPLICATE_SCAN
        finally:
            service.release.set()


# ---------------------------------------------------------------- on request


class TestOnRequest:
    def test_named_signals_are_scanned_and_answered(self, store, tmp_path):
        export = write_export(tmp_path, PAIR, "collection.xml")
        finished(store, start_library_import_job(store, export))
        all_finished(store)

        started = start_duplicate_scan_job(store, ["text", "path"])
        assert started.to_dict() == {
            "job_id": started.job.id,
            "signals": ["path", "text"],
        }
        job = finished(store, started.job)
        assert job.state is JobState.SUCCEEDED
        assert job.result is not None
        assert [scan["signal"] for scan in job.result["scans"]] == ["path", "text"]
        assert job.progress is not None
        assert job.progress.status_message == "Finding duplicates"

    @pytest.mark.parametrize("signals", [["sound"], []])
    def test_a_bad_list_of_signals_is_refused_before_any_job(self, store, signals):
        with pytest.raises(ValueError):
            start_duplicate_scan_job(store, signals)
        assert store.list_all() == []

    def test_a_cancel_stops_the_scan_while_it_reads(self, store, tmp_path, monkeypatch):
        export = write_export(
            tmp_path,
            [(f"/m/{index}.mp3", f"Track {index}", 300) for index in range(5)],
            "collection.xml",
        )
        finished(store, start_library_import_job(store, export))
        all_finished(store)
        monkeypatch.setattr(duplicate_service_module, "_CANCEL_EVERY_ROWS", 1)
        service = held()
        started = start_duplicate_scan_job(store, ["text"])
        assert service.reached.wait(10)
        store.request_cancel(started.job.id)
        service.release.set()

        job = finished(store, started.job)
        assert job.state is JobState.CANCELLED
        assert job.error is not None and job.error["code"] == "JOB_CANCELLED"
        assert job.result is not None and job.result["cancelled"] is True
