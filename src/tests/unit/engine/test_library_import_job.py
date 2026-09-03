#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the Rekordbox import as a background job (LIBRARY-05).

The risk this step carries is not that an import runs — LIBRARY-04 already
proved that — but that it shares a job store built for one kind of job, and that
cancelling it mid-write could leave the library half-imported. Both are what
these tests are aimed at.

Cancellation has a defined boundary rather than a promise to stop instantly: it
is honoured before anything is written and throughout the track pass, where it
rolls the transaction back; once those tracks are committed the import finishes,
because what remains is small and stopping between the tracks and their playlist
mirror would leave the two disagreeing. Either way the library is never half
imported and a source record only ever describes an import that completed.
"""

from __future__ import annotations

import json
import socket
import threading
import time
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.library_jobs import (
    JOB_TYPE_LIBRARY_IMPORT,
    run_library_import_job,
    start_library_import_job,
)
from cuepoint.engine.jobs_api import list_jobs
from cuepoint.engine.server import (
    EngineConfig,
    get_job_store,
    start_engine_thread,
)
from cuepoint.persistence.job_repository import JobRecord
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "library-import-job-token"

TRACK_ATTRS = (
    'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" '
    'TotalTime="360" BitRate="320" Rating="0" PlayCount="0"'
)


def write_export(tmp_path: Path, count: int, name="collection.xml") -> str:
    entries = "\n".join(
        f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A{i}" {TRACK_ATTRS} '
        f'Location="file://localhost/m/{i}.mp3"/>'
        for i in range(count)
    )
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{count}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0">'
        '<NODE Name="set" Type="1" Entries="1"><TRACK Key="0"/></NODE>'
        "</NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    """A sandboxed library with services bootstrapped over it."""
    from cuepoint.services.bootstrap import bootstrap_services

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()

    from cuepoint.services.interfaces import IMigrationRunner
    from cuepoint.utils.di_container import get_container

    get_container().resolve(IMigrationRunner).migrate()
    yield db_path
    reset_container()


@pytest.fixture
def store():
    return JobStore()


def wait_for_terminal(job: Job, timeout: float = 20.0) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job did not finish; state={job.state}")


def wait_for_record(repository, job_id, state, timeout: float = 10.0):
    """Wait for a job's *persisted* record to reach a state.

    Not the same instant as the in-memory job reaching it: ``JobStore._update``
    sets the state under its lock and writes the record outside it, on purpose,
    so a database write cannot hold up status polling or SSE. Durability is
    therefore eventual, which is what this waits for — asserting it
    synchronously made this test flaky rather than strict.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        record = repository.get(job_id)
        if record is not None and record.state == state:
            return record
        time.sleep(0.01)
    record = repository.get(job_id)
    raise AssertionError(
        f"record never reached {state!r}; "
        f"last seen {record.state if record else None!r}"
    )


def counts():
    from cuepoint.services.interfaces import (
        ILibraryImportService,
        IPlaylistRepository,
        ITrackRepository,
    )
    from cuepoint.utils.di_container import get_container

    container = get_container()
    return (
        container.resolve(ITrackRepository).count(),
        container.resolve(IPlaylistRepository).count(),
        container.resolve(ILibraryImportService).current_source(),
    )


@pytest.mark.unit
class TestRunningAsAJob:
    def test_the_job_carries_the_import_type(self, library_db, store, tmp_path):
        job = start_library_import_job(store, write_export(tmp_path, 5))
        assert job.type == JOB_TYPE_LIBRARY_IMPORT
        wait_for_terminal(job)

    def test_it_succeeds_and_imports_the_library(self, library_db, store, tmp_path):
        job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 12))
        )

        assert job.state is JobState.SUCCEEDED
        assert job.error is None
        tracks, nodes, source = counts()
        assert tracks == 12
        assert nodes == 2
        assert source is not None

    def test_progress_reaches_its_total(self, library_db, store, tmp_path):
        job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 30))
        )

        assert job.progress is not None
        assert job.progress.completed_tracks == job.progress.total_tracks
        assert job.progress.percentage == 100.0

    def test_progress_uses_the_shape_the_status_strip_reads(
        self, library_db, store, tmp_path
    ):
        """The reason an import needed no change to how progress is rendered."""
        job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 8))
        )

        payload = job.to_status_dict()["progress"]
        assert {"completed_tracks", "total_tracks", "percentage"} <= set(payload)
        assert payload["status_message"]

    def test_the_declared_entry_count_is_the_total_from_the_first_tick(
        self, library_db, store, tmp_path
    ):
        """Rekordbox writes Entries, so the bar is real rather than growing."""
        seen = []
        original = JobStore.report_progress

        def capture(self, job, progress):
            seen.append((progress.completed_tracks, progress.total_tracks))
            original(self, job, progress)

        JobStore.report_progress = capture
        try:
            wait_for_terminal(
                start_library_import_job(store, write_export(tmp_path, 40))
            )
        finally:
            JobStore.report_progress = original

        with_tracks = [t for t in seen if t[0] > 0]
        assert with_tracks, "no progress was reported"
        assert all(total == 40 for _done, total in with_tracks)

    def test_the_last_tick_of_each_phase_is_never_sampled_away(
        self, library_db, store, tmp_path
    ):
        """A short import finishes inside one sampling window.

        Without the "always report a phase's last tick" rule, a run that takes
        less than the sampling interval reports its first tick and nothing else
        — the strip would sit at 1/40 and then vanish. The runner deliberately
        sends no final tick of its own, so this is the only thing keeping the
        bar honest.
        """
        seen = []
        original = JobStore.report_progress

        def capture(self, job, progress):
            seen.append(
                (
                    progress.completed_tracks,
                    progress.total_tracks,
                    progress.status_message,
                )
            )
            original(self, job, progress)

        JobStore.report_progress = capture
        try:
            wait_for_terminal(
                start_library_import_job(store, write_export(tmp_path, 40))
            )
        finally:
            JobStore.report_progress = original

        assert (40, 40, "Importing tracks") in seen, "the tracks phase never completed"
        assert (40, 40, "Mirroring playlists") in seen, "the playlist phase was dropped"

    def test_a_second_job_type_lives_beside_match_jobs(
        self, library_db, store, tmp_path
    ):
        release = threading.Event()
        match_job = store.create_match_job(
            xml_path=None,
            playlist_name=None,
            demo=True,
            runner=lambda _job: release.wait(timeout=5),
        )
        import_job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 4))
        )
        release.set()

        types = {job.id: job.type for job in store.list_all()}
        assert types[match_job.id] == "match"
        assert types[import_job.id] == JOB_TYPE_LIBRARY_IMPORT


@pytest.mark.unit
class TestFailures:
    def test_a_file_with_no_collection_fails_the_job_not_the_engine(
        self, library_db, store, tmp_path
    ):
        path = tmp_path / "bad.xml"
        path.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")

        job = wait_for_terminal(start_library_import_job(store, str(path)))

        assert job.state is JobState.FAILED
        assert job.error["code"] == "LIBRARY_XML_NO_COLLECTION"
        assert "COLLECTION" in job.error["message"]

    def test_a_missing_file_fails_the_job(self, library_db, store, tmp_path):
        job = wait_for_terminal(
            start_library_import_job(store, str(tmp_path / "gone.xml"))
        )

        assert job.state is JobState.FAILED
        assert job.error["code"] == "LIBRARY_IMPORT_FAILED"

    def test_a_failed_import_leaves_no_source_record(self, library_db, store, tmp_path):
        path = tmp_path / "bad.xml"
        path.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")
        wait_for_terminal(start_library_import_job(store, str(path)))

        tracks, _nodes, source = counts()
        assert (tracks, source) == (0, None)


@pytest.mark.unit
class TestCancellation:
    """The step's stated risk: cancelling mid-write."""

    def test_a_cancel_during_the_track_pass_writes_nothing(
        self, library_db, store, tmp_path
    ):
        """Rolled back, not partially applied.

        The cancel check runs inside the upsert's transaction, so raising there
        undoes every track the import had written so far.
        """
        export = write_export(tmp_path, 4000)
        job = Job(id="cancel-me", type=JOB_TYPE_LIBRARY_IMPORT)

        def cancel_after_a_while() -> None:
            time.sleep(0.05)
            job.cancel_requested = True

        threading.Thread(target=cancel_after_a_while, daemon=True).start()
        run_library_import_job(job, store, export)

        assert job.state is JobState.CANCELLED
        assert job.error["code"] == "JOB_CANCELLED"
        tracks, nodes, source = counts()
        assert (tracks, nodes, source) == (0, 0, None)

    def test_cancelling_before_the_job_starts_writes_nothing(
        self, library_db, store, tmp_path
    ):
        job = Job(id="pre-cancelled", type=JOB_TYPE_LIBRARY_IMPORT)
        job.cancel_requested = True

        run_library_import_job(job, store, write_export(tmp_path, 50))

        assert job.state is JobState.CANCELLED
        assert counts() == (0, 0, None)

    def test_an_empty_collection_still_honours_a_cancel(
        self, library_db, store, tmp_path
    ):
        """The only case the check before the first track can catch.

        With tracks to read, the per-track check stops the import anyway. With
        none, nothing else would look at the request, and a cancelled import
        would report success and write a source record.
        """
        job = Job(id="pre-cancelled-empty", type=JOB_TYPE_LIBRARY_IMPORT)
        job.cancel_requested = True

        run_library_import_job(job, store, write_export(tmp_path, 0))

        assert job.state is JobState.CANCELLED
        assert counts() == (0, 0, None)

    def test_a_cancel_that_arrives_after_the_import_finished_does_not_undo_it(
        self, library_db, store, tmp_path
    ):
        """A late cancel must not relabel a completed import as cancelled.

        The runner sets its own terminal state for this reason: the store marks
        a job cancelled when a request arrived and the runner left the state
        unset, which would report a library that *was* imported as one that
        was not.
        """
        job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 6))
        )
        assert job.state is JobState.SUCCEEDED

        store.request_cancel(job.id)

        assert store.get(job.id).state is JobState.SUCCEEDED
        tracks, _nodes, source = counts()
        assert tracks == 6
        assert source is not None

    def test_the_library_is_never_left_half_imported(self, library_db, store, tmp_path):
        """Cancel at many different moments; every outcome is consistent.

        Either nothing was written and there is no source record, or everything
        was written and there is one. There is no state in between.
        """
        export = write_export(tmp_path, 1500)
        for delay in (0.0, 0.01, 0.02, 0.04, 0.08, 0.15):
            reset_container()
            from cuepoint.services.bootstrap import bootstrap_services
            from cuepoint.services.interfaces import IMigrationRunner
            from cuepoint.utils.di_container import get_container

            bootstrap_services()
            get_container().resolve(IMigrationRunner).migrate()
            for table in (
                "rekordbox_playlist_tracks",
                "rekordbox_playlists",
                "library_source",
                "tracks",
            ):
                from cuepoint.services.interfaces import IDatabaseService

                with get_container().resolve(IDatabaseService).transaction() as conn:
                    conn.execute(f"DELETE FROM {table}")

            job = Job(id=f"cancel-{delay}", type=JOB_TYPE_LIBRARY_IMPORT)

            def cancel(job=job, delay=delay) -> None:
                time.sleep(delay)
                job.cancel_requested = True

            threading.Thread(target=cancel, daemon=True).start()
            run_library_import_job(job, store, export)

            tracks, nodes, source = counts()
            if job.state is JobState.CANCELLED:
                assert (tracks, nodes, source) == (0, 0, None), (
                    f"cancel at {delay}s left a partial library"
                )
            else:
                assert job.state is JobState.SUCCEEDED
                assert tracks == 1500
                assert source is not None


@pytest.mark.unit
class TestDurability:
    """DEC-007's guarantee, now with a second job type."""

    def test_the_record_is_persisted_with_its_type(self, library_db, tmp_path):
        from cuepoint.services.interfaces import IJobRepository
        from cuepoint.utils.di_container import get_container

        repository = get_container().resolve(IJobRepository)
        store = JobStore(job_repository=repository)

        job = wait_for_terminal(
            start_library_import_job(store, write_export(tmp_path, 5))
        )

        record = wait_for_record(repository, job.id, "succeeded")
        assert record.type == JOB_TYPE_LIBRARY_IMPORT

    def test_it_survives_a_simulated_engine_restart(self, library_db, tmp_path):
        """A fresh store knows nothing; the record is what remains."""
        from cuepoint.services.interfaces import IJobRepository
        from cuepoint.utils.di_container import get_container

        repository = get_container().resolve(IJobRepository)
        job = wait_for_terminal(
            start_library_import_job(
                JobStore(job_repository=repository), write_export(tmp_path, 5)
            )
        )

        wait_for_record(repository, job.id, "succeeded")

        restarted = JobStore(job_repository=repository)
        assert restarted.get(job.id) is None

        payload = list_jobs(state="all", job_store=restarted)
        listed = {entry["id"]: entry for entry in payload["jobs"]}
        assert listed[job.id]["type"] == JOB_TYPE_LIBRARY_IMPORT
        assert listed[job.id]["state"] == "succeeded"

    def test_a_live_import_keeps_its_type_over_a_stale_record(
        self, library_db, monkeypatch
    ):
        """The merge rule: a running job is the source of its own type.

        The stale record is injected through a stub rather than written to the
        database, because the job's own state transitions re-persist the correct
        type moments later — a race that made an earlier version of this test
        pass against the opposite merge rule.
        """
        store = JobStore()
        release = threading.Event()
        job = store.create_job(
            job_type=JOB_TYPE_LIBRARY_IMPORT,
            runner=lambda _job: release.wait(timeout=5),
        )
        stale = JobRecord(
            id=job.id,
            type="match",
            state="running",
            demo=False,
            progress=None,
            error=None,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository",
            lambda: type("R", (), {"list_recent": lambda self, limit: [stale]})(),
        )
        try:
            listed = {
                entry["id"]: entry
                for entry in list_jobs(state="all", job_store=store)["jobs"]
            }
            assert listed[job.id]["type"] == JOB_TYPE_LIBRARY_IMPORT
        finally:
            release.set()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.mark.unit
class TestOverTheHttpApi:
    """The DoD: an import appears in GET /api/v1/jobs alongside match jobs."""

    def test_an_import_is_listed_and_can_be_cancelled(self, library_db, tmp_path):
        port = _free_port()
        config = EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
        base = f"http://127.0.0.1:{port}"
        httpd, thread = start_engine_thread(config)
        try:
            store = get_job_store()
            job = wait_for_terminal(
                start_library_import_job(store, write_export(tmp_path, 20))
            )

            request = urllib.request.Request(
                f"{base}/api/v1/jobs?state=all",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))

            listed = {entry["id"]: entry for entry in payload["jobs"]}
            assert job.id in listed
            assert listed[job.id]["type"] == JOB_TYPE_LIBRARY_IMPORT
            assert listed[job.id]["state"] == "succeeded"
            assert listed[job.id]["progress"]["total_tracks"] == 20
        finally:
            httpd.shutdown()
            thread.join(timeout=2)

    def test_a_running_import_can_be_cancelled_over_http(self, library_db, tmp_path):
        port = _free_port()
        config = EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
        base = f"http://127.0.0.1:{port}"
        httpd, thread = start_engine_thread(config)
        try:
            store = get_job_store()
            job = start_library_import_job(store, write_export(tmp_path, 6000))

            request = urllib.request.Request(
                f"{base}/api/v1/jobs/{job.id}/cancel",
                data=b"",
                method="POST",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                assert response.status == 200

            wait_for_terminal(job)
            assert job.state in (JobState.CANCELLED, JobState.SUCCEEDED)
            tracks, _nodes, source = counts()
            if job.state is JobState.CANCELLED:
                assert (tracks, source) == (0, None)
            else:
                assert tracks == 6000
        finally:
            httpd.shutdown()
            thread.join(timeout=2)


@pytest.mark.unit
class TestJobStoreStaysGeneral:
    """ "Generalized, not rewritten" is the bar; these pin what generalized means."""

    def test_a_match_job_still_defaults_to_the_match_type(self, store):
        release = threading.Event()
        job = store.create_match_job(
            xml_path=None,
            playlist_name=None,
            demo=True,
            runner=lambda _job: release.wait(timeout=5),
        )
        try:
            assert job.type == "match"
            assert job.to_status_dict()["type"] == "match"
        finally:
            release.set()

    def test_create_job_names_its_thread_after_the_type(self, store):
        seen = {}
        release = threading.Event()

        def runner(_job):
            seen["thread"] = threading.current_thread().name
            release.wait(timeout=5)

        store.create_job(job_type="library_import", runner=runner)
        for _ in range(200):
            if "thread" in seen:
                break
            time.sleep(0.01)
        release.set()
        assert seen["thread"].startswith("library_import-job-")

    def test_report_progress_does_not_change_state(self, store, library_db, tmp_path):
        from cuepoint.compat.gui_types import ProgressInfo

        release = threading.Event()
        job = store.create_job(
            job_type="library_import", runner=lambda _job: release.wait(timeout=5)
        )
        try:
            store.report_progress(
                job,
                ProgressInfo(
                    completed_tracks=1,
                    total_tracks=2,
                    matched_count=0,
                    unmatched_count=0,
                ),
            )
            assert job.state is JobState.RUNNING
            assert job.progress.completed_tracks == 1
        finally:
            release.set()
