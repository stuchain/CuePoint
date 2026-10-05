#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's waveform analysis as a background job (WAVE-03).

A real job store, a real library and ``waveforms.db``, real settings on disk,
and a stand-in decoder that can hold a file mid-decode for as long as a test
needs. So these prove the specification's list for the job itself:

- it starts after a whole-library check, and refuses to start beside a job it
  gives way to;
- an import starting mid-run makes it step aside, and the check after the import
  starts it again; no such job ever waits for it;
- pause persists across a restart of the settings, a new engine does not start
  it, resume does, and the status strip's Stop is Pause;
- a request while paused analyses exactly the requested tracks, a request mid-run
  is next, and the queue drops the oldest beyond its cap;
- the launch run starts only in its three stated conditions;
- exactly one activity event per run;
- a decoder that cannot analyse makes the analysis unavailable, once.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Callable, List, Optional

import pytest

from cuepoint.data.audio_decode import DecodeFailed, DecoderUnavailable
from cuepoint.engine import waveform_jobs
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.tag_write_jobs import JOB_TYPE_TAG_WRITE
from cuepoint.engine.waveform_jobs import (
    ERROR_ANALYSIS_FAILED,
    ERROR_DECODER_UNAVAILABLE,
    JOB_TYPE_WAVEFORM_ANALYSIS,
    MAX_REQUESTS,
    PROGRESS_MESSAGE,
    SETTING_PAUSED,
    STEPS_ASIDE_FOR,
    AnalysisSettings,
    analysis_after_file_check,
    bind,
    schedule_launch_analysis,
)
from cuepoint.models.waveform import STORED_READY
from cuepoint.models.waveform_analysis import (
    ANALYSIS_IDLE,
    ANALYSIS_PAUSED,
    ANALYSIS_RUNNING,
    ANALYSIS_UNAVAILABLE,
    STOP_DATA_DELETED,
    STOP_PAUSED,
    STOP_STEPPED_ASIDE,
    AnalysisRunResult,
)
from cuepoint.persistence.waveform_store import WaveformStoreError
from cuepoint.services.config_service import ConfigService
from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import WaveformLibrary, envelope

TIMEOUT = 15.0


def wait_for(condition: Callable[[], bool], what: str) -> None:
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        if condition():
            return
        time.sleep(0.01)
    raise AssertionError(f"Timed out waiting for {what}")


class Gate:
    """Holds a decode until released, and says when one is held."""

    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()

    def __call__(self, source: str):
        self.entered.set()
        assert self.release.wait(TIMEOUT), "a held decode was never released"
        return envelope()


@pytest.fixture
def lib(tmp_path):
    library = WaveformLibrary(tmp_path / "library")
    yield library
    library.close()


@pytest.fixture
def config_file(tmp_path) -> Path:
    return tmp_path / "config.yaml"


@pytest.fixture
def engine(lib, config_file):
    """A job store and the analysis bound to it, as the engine makes them."""
    store = JobStore()
    settings = AnalysisSettings(lambda config=ConfigService(config_file): config)
    analysis = bind(store, service=lambda: lib.analysis, settings=settings, workers=1)
    yield store, analysis
    for job in store.list_all():
        if job.type != JOB_TYPE_WAVEFORM_ANALYSIS and job.state.value == "running":
            store.request_cancel(job.id)
    wait_until_settled(store, "the test's jobs")


def analysis_jobs(store: JobStore) -> List[Job]:
    return sorted(
        (job for job in store.list_all() if job.type == JOB_TYPE_WAVEFORM_ANALYSIS),
        key=lambda job: job.created_at,
    )


def hold(store: JobStore, job_type: str) -> threading.Event:
    """Start a job of ``job_type`` that runs until the event is set."""
    done = threading.Event()

    def runner(job: Job) -> None:
        assert done.wait(TIMEOUT)

    store.create_job(job_type=job_type, runner=runner)
    return done


def settle(store: JobStore) -> None:
    wait_until_settled(store, "the analysis")


class TestStarting:
    def test_a_whole_library_check_starts_a_run_that_analyses_everything(
        self, lib, engine
    ):
        store, _ = engine
        for name in ("a", "b", "c"):
            lib.add(name)

        job = analysis_after_file_check(store, "import")
        settle(store)

        assert job is not None and job.state == JobState.SUCCEEDED
        assert job.result["trigger"] == "file_check"
        assert job.result["analysed"] == 3
        assert lib.stored() == {"a": STORED_READY, "b": STORED_READY, "c": STORED_READY}

    def test_its_progress_reads_as_the_strip_says_it(self, lib, engine):
        store, _ = engine
        lib.add("a")

        job = analysis_after_file_check(store, "import")
        settle(store)

        assert job.progress.status_message == PROGRESS_MESSAGE
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (1, 1)
        assert job.progress.matched_count == 1

    @pytest.mark.parametrize("busy", STEPS_ASIDE_FOR)
    def test_it_refuses_to_start_beside_a_job_it_gives_way_to(self, lib, engine, busy):
        store, analysis = engine
        lib.add("a")
        done = hold(store, busy)

        assert analysis.start("file_check") is None
        assert analysis_jobs(store) == []
        done.set()
        settle(store)

    def test_a_job_it_gave_way_to_starts_it_again_as_it_ends(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        done = hold(store, JOB_TYPE_TAG_WRITE)
        analysis.start("file_check")
        done.set()
        settle(store)

        jobs = analysis_jobs(store)
        assert len(jobs) == 1 and jobs[0].result["trigger"] == JOB_TYPE_TAG_WRITE
        assert lib.stored() == {"a": STORED_READY}

    def test_a_start_while_running_is_the_running_job(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        gate = Gate()
        lib.decoder.default = gate

        first = analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)
        again = analysis.start("resume")
        gate.release.set()
        settle(store)

        assert again is first
        assert len(analysis_jobs(store)) == 1


class TestSteppingAside:
    def test_an_import_mid_run_makes_it_step_aside_and_the_check_after_brings_it_back(
        self, lib, engine
    ):
        store, analysis = engine
        for name in ("a", "b", "c"):
            lib.add(name, added=f"2026-01-0{'cba'.index(name) + 1}")
        gate = Gate()
        lib.decoder.answers[str(lib.path("a"))] = gate
        first = analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        # The import starts and never waits; as it ends it starts a file check,
        # as the real one does.
        check_done = threading.Event()
        import_done = threading.Event()

        def importing(job: Job) -> None:
            assert import_done.wait(TIMEOUT)

            def checking(check: Job) -> None:
                assert check_done.wait(TIMEOUT)

            store.create_job(job_type=JOB_TYPE_FILE_CHECK, runner=checking)

        store.create_job(job_type=JOB_TYPE_LIBRARY_IMPORT, runner=importing)
        gate.release.set()
        wait_for(lambda: first.state == JobState.CANCELLED, "the step aside")
        assert first.error["reason"] == STOP_STEPPED_ASIDE
        assert lib.stored() == {"a": STORED_READY}

        import_done.set()
        wait_for(
            lambda: any(job.type == JOB_TYPE_FILE_CHECK for job in store.list_all()),
            "the check after the import",
        )
        # Nothing analyses while the check decides which files may be opened.
        assert len(analysis_jobs(store)) == 1
        check_done.set()
        settle(store)

        jobs = analysis_jobs(store)
        assert len(jobs) == 2
        assert jobs[1].state == JobState.SUCCEEDED
        assert jobs[1].result["trigger"] == JOB_TYPE_FILE_CHECK
        assert sorted(lib.stored()) == ["a", "b", "c"]

    def test_the_job_it_steps_aside_for_never_waits_for_it(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        gate = Gate()
        lib.decoder.default = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        ran = threading.Event()
        store.create_job(job_type=JOB_TYPE_LIBRARY_IMPORT, runner=lambda job: ran.set())

        assert ran.wait(TIMEOUT), "the import waited for the analysis"
        gate.release.set()
        settle(store)

    def test_a_failed_import_with_no_check_after_still_brings_it_back(
        self, lib, engine
    ):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        gate = Gate()
        lib.decoder.default = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        def failing(job: Job) -> None:
            raise RuntimeError("not a Rekordbox export")

        store.create_job(job_type=JOB_TYPE_LIBRARY_IMPORT, runner=failing)
        gate.release.set()
        lib.decoder.default = envelope()
        settle(store)

        jobs = analysis_jobs(store)
        assert [job.state for job in jobs] == [JobState.CANCELLED, JobState.SUCCEEDED]
        assert sorted(lib.stored()) == ["a", "b"]


class TestPauseAndResume:
    def test_pause_stops_a_running_job_and_says_so(self, lib, engine, config_file):
        store, analysis = engine
        for name in ("a", "b"):
            lib.add(name)
        gate = Gate()
        lib.decoder.default = gate
        job = analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        status = analysis.pause()
        gate.release.set()
        settle(store)

        assert status.state == ANALYSIS_PAUSED and status.paused
        assert job.state == JobState.CANCELLED
        assert job.error["reason"] == STOP_PAUSED
        assert len(lib.stored()) == 1
        assert ConfigService(config_file).get(SETTING_PAUSED) is True

    def test_pause_persists_and_a_new_engine_does_not_start(
        self, lib, engine, config_file
    ):
        store, analysis = engine
        lib.add("a")
        analysis.pause()

        restarted = JobStore()
        again = bind(
            restarted,
            service=lambda: lib.analysis,
            settings=AnalysisSettings(lambda: ConfigService(config_file)),
            workers=1,
        )

        assert again.status().state == ANALYSIS_PAUSED
        assert again.start_at_launch() is None
        assert again.start("file_check") is None
        assert restarted.list_all() == []

    def test_resume_clears_it_and_starts_a_run(self, lib, engine, config_file):
        store, analysis = engine
        lib.add("a")
        analysis.pause()

        status = analysis.resume()
        settle(store)

        assert not status.paused
        assert ConfigService(config_file).get(SETTING_PAUSED) is False
        assert analysis_jobs(store)[0].result["trigger"] == "resume"
        assert lib.stored() == {"a": STORED_READY}

    def test_resume_while_a_paused_run_finishes_its_file_runs_again(self, lib, engine):
        store, analysis = engine
        for name in ("a", "b"):
            lib.add(name)
        gate = Gate()
        lib.decoder.default = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        analysis.pause()
        analysis.resume()
        lib.decoder.default = envelope()
        gate.release.set()
        settle(store)

        assert [job.state for job in analysis_jobs(store)] == [
            JobState.CANCELLED,
            JobState.SUCCEEDED,
        ]
        assert sorted(lib.stored()) == ["a", "b"]

    def test_the_strips_stop_is_pause(self, lib, engine, config_file):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        gate = Gate()
        lib.decoder.default = gate
        job = analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        store.request_cancel(job.id)
        gate.release.set()
        settle(store)

        assert job.state == JobState.CANCELLED and job.error["reason"] == STOP_PAUSED
        assert ConfigService(config_file).get(SETTING_PAUSED) is True
        assert analysis.status().state == ANALYSIS_PAUSED

    def test_a_cancel_before_the_run_registered_is_still_a_pause(
        self, lib, engine, config_file
    ):
        store, analysis = engine
        lib.add("a")
        job = analysis.start("file_check")
        job.cancel_requested = True
        settle(store)

        assert job.state == JobState.CANCELLED
        assert ConfigService(config_file).get(SETTING_PAUSED) is True

    def test_a_pause_that_cannot_be_saved_stops_nothing(self, lib, engine):
        store, analysis = engine
        lib.add("a")

        class Unsaveable:
            def get(self, key, default=None):
                return False

            def set(self, key, value):
                pass

            def save(self):
                from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError

                raise ConfigurationError(message="read-only disk")

        broken = bind(
            JobStore(),
            service=lambda: lib.analysis,
            settings=AnalysisSettings(lambda: Unsaveable()),
        )
        from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError

        with pytest.raises(ConfigurationError):
            broken.pause()


class TestRequests:
    def test_a_request_while_paused_analyses_exactly_the_requested(self, lib, engine):
        store, analysis = engine
        for name in ("a", "b", "c"):
            lib.add(name)
        analysis.pause()

        job = analysis.request([lib.id("b")])
        settle(store)

        assert job is not None and job.state == JobState.SUCCEEDED
        assert lib.decoder.names() == ["b"]
        assert job.result["whole_library"] is False
        assert analysis.status().state == ANALYSIS_PAUSED

    def test_a_request_mid_run_is_analysed_next(self, lib, engine):
        store, analysis = engine
        for name in ("d", "c", "b", "a"):
            lib.add(name, added=f"2026-01-0{'abcd'.index(name) + 1}")
        gate = Gate()
        lib.decoder.answers[str(lib.path("d"))] = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        analysis.request([lib.id("a")])
        gate.release.set()
        settle(store)

        assert lib.decoder.names()[:2] == ["d", "a"]
        assert len(analysis_jobs(store)) == 1

    def test_the_queue_keeps_the_newest_two_hundred_and_moves_a_repeat_forward(
        self, lib, engine
    ):
        store, analysis = engine
        lib.add("held")
        gate = Gate()
        lib.decoder.default = gate
        analysis.request([lib.id("held")])
        assert gate.entered.wait(TIMEOUT)

        analysis.request(range(1_000, 1_000 + MAX_REQUESTS))
        analysis.request([5_000, 5_001])
        analysis.request([1_010])

        queued = []
        while (track_id := analysis._take_request()) is not None:
            queued.append(track_id)
        gate.release.set()
        settle(store)

        assert len(queued) == MAX_REQUESTS
        assert queued[:3] == [1_010, 5_000, 5_001]
        # The two oldest went to make room.
        assert 1_000 + MAX_REQUESTS - 1 not in queued
        assert 1_000 + MAX_REQUESTS - 2 not in queued
        assert 1_000 in queued

    def test_a_request_without_a_decoder_does_nothing(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.decoder_path = None

        assert analysis.request([lib.id("a")]) is None
        assert store.list_all() == []

    def test_requests_that_arrive_as_a_paused_run_ends_are_still_served(
        self, lib, engine
    ):
        store, analysis = engine
        for name in ("a", "b"):
            lib.add(name, added=f"2026-01-0{'ba'.index(name) + 1}")
        gate = Gate()
        lib.decoder.answers[str(lib.path("a"))] = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        analysis.pause()
        analysis.request([lib.id("b")])
        gate.release.set()
        settle(store)

        assert lib.decoder.names() == ["a", "b"]
        assert analysis_jobs(store)[-1].result["whole_library"] is False

    def test_a_whole_run_asked_for_during_a_request_run_follows_it(self, lib, engine):
        store, analysis = engine
        for name in ("a", "b", "c"):
            lib.add(name)
        gate = Gate()
        lib.decoder.answers[str(lib.path("a"))] = gate
        analysis.request([lib.id("a")])
        assert gate.entered.wait(TIMEOUT)

        analysis.start("file_check", verify=True)
        gate.release.set()
        settle(store)

        jobs = analysis_jobs(store)
        assert [job.result["whole_library"] for job in jobs] == [False, True]
        assert sorted(lib.stored()) == ["a", "b", "c"]


class TestAtLaunch:
    def test_it_starts_when_unpaused_with_a_decoder_and_work(self, lib, engine):
        store, analysis = engine
        lib.add("a")

        job = analysis.start_at_launch()
        settle(store)

        assert job is not None and job.result["trigger"] == "launch"

    def test_not_when_paused(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        analysis.pause()

        assert analysis.start_at_launch() is None

    def test_not_without_a_decoder(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.decoder_path = None

        assert analysis.start_at_launch() is None
        assert analysis.status().state == ANALYSIS_UNAVAILABLE

    def test_not_when_every_present_file_has_a_row_that_counts(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.add("never-checked", checked=False)
        lib.analysis.run(_Whole(), trigger="setup", workers=1)

        assert analysis.start_at_launch() is None
        assert store.list_all() == []

    def test_it_is_scheduled_after_the_delay(self, lib, engine):
        store, analysis = engine
        lib.add("a")

        timer = schedule_launch_analysis(store, delay_seconds=0.05)
        timer.join(TIMEOUT)
        settle(store)

        assert lib.stored() == {"a": STORED_READY}


class _Whole:
    def next_request(self) -> Optional[int]:
        return None

    def pending_requests(self) -> int:
        return 0

    def whole_library(self) -> bool:
        return True

    def verify(self) -> bool:
        return False

    def counted(self) -> None:
        pass

    def stop_reason(self) -> Optional[str]:
        return None


class TestActivity:
    def test_exactly_one_event_per_run(self, lib, engine):
        store, analysis = engine
        for name in ("a", "b"):
            lib.add(name)

        analysis.start("file_check")
        settle(store)
        lib.add("c")
        analysis.request([lib.id("c")])
        settle(store)

        events = lib.events()
        assert len(events) == 2
        assert [event.detail["whole_library"] for event in events] == [False, True]

    def test_a_stepped_aside_run_says_so(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        gate = Gate()
        lib.decoder.default = gate
        analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)
        done = hold(store, JOB_TYPE_FILE_CHECK)
        gate.release.set()
        wait_for(lambda: len(lib.events()) == 1, "the first run's event")
        lib.decoder.default = envelope()
        done.set()
        settle(store)

        events = lib.events()
        assert events[-1].detail["stopped"] == STOP_STEPPED_ASIDE
        assert "Stopped for a library change" in events[-1].summary


class TestFailures:
    def test_a_decoder_that_cannot_analyse_makes_it_unavailable_once(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        lib.decoder.default = DecoderUnavailable("graph dropped")

        job = analysis.start("file_check")
        settle(store)

        assert job.state == JobState.FAILED
        assert job.error["code"] == ERROR_DECODER_UNAVAILABLE
        assert analysis.status().state == ANALYSIS_UNAVAILABLE
        assert analysis.start("file_check") is None
        assert analysis.request([lib.id("a")]) is None
        assert len(lib.decoder.opened) == 1

    def test_a_store_that_cannot_be_written_fails_the_job(
        self, lib, engine, monkeypatch
    ):
        store, analysis = engine
        lib.add("a")

        def put(row):
            raise WaveformStoreError(
                message="disk full", error_code="WAVEFORM_STORE_IO"
            )

        monkeypatch.setattr(lib.store, "put", put)

        job = analysis.start("file_check")
        settle(store)

        assert job.state == JobState.FAILED
        assert job.error["code"] == "WAVEFORM_STORE_IO"

    def test_an_unexpected_failure_fails_the_job_with_its_own_code(self, lib, engine):
        store, analysis = engine
        lib.add("a")

        def boom(source):
            raise RuntimeError("unexpected")

        lib.decoder.default = boom

        job = analysis.start("file_check")
        settle(store)

        assert job.state == JobState.FAILED
        assert job.error["code"] == ERROR_ANALYSIS_FAILED

    def test_a_failed_file_is_not_retried_by_the_next_run(self, lib, engine):
        store, analysis = engine
        lib.add("broken")
        lib.decoder.default = DecodeFailed("undecodable", "stub")
        analysis.start("file_check")
        settle(store)

        analysis.start("file_check")
        settle(store)

        assert lib.decoder.names() == ["broken"]


class TestStatus:
    def test_idle_with_its_counts(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        lib.decoder.answers[str(lib.path("b"))] = DecodeFailed("undecodable", "stub")
        analysis.start("file_check")
        settle(store)

        status = analysis.status()

        assert status.state == ANALYSIS_IDLE and status.job_id is None
        assert (status.present, status.analysed, status.failed) == (2, 1, 1)
        assert status.remaining == 0

    def test_running_names_its_job(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        gate = Gate()
        lib.decoder.default = gate
        job = analysis.start("file_check")
        assert gate.entered.wait(TIMEOUT)

        status = analysis.status()
        gate.release.set()
        settle(store)

        assert status.state == ANALYSIS_RUNNING and status.job_id == job.id
        assert status.remaining == 1

    def test_unavailable_says_why(self, lib, engine):
        _, analysis = engine
        lib.decoder_path = None

        status = analysis.status()

        assert status.state == ANALYSIS_UNAVAILABLE
        assert status.to_dict()["reason"] == "decoder_missing"


def test_every_job_it_steps_aside_for_is_one_the_tag_and_library_jobs_name():
    assert set(STEPS_ASIDE_FOR) == {
        "library_import",
        "library_refresh_apply",
        "file_check",
        "tag_write",
        "tag_restore",
    }


def test_the_engine_binds_one_analysis_per_store(lib):
    store = JobStore()
    first = bind(store, service=lambda: lib.analysis)

    assert waveform_jobs.coordinator(store) is first


class TestDeletingTheData:
    """ "Delete waveform data" (WAVE-05): the store empties, and the analysis
    starts again unless paused, with nothing landing after the deletion."""

    def analysed(self, lib, engine, *names: str) -> None:
        store, analysis = engine
        for name in names:
            lib.add(name)
        analysis.start("test")
        settle(store)
        assert lib.stored() == {name: STORED_READY for name in names}

    def test_it_empties_the_store_and_the_library_is_analysed_again(self, lib, engine):
        store, analysis = engine
        self.analysed(lib, engine, "a", "b")

        result = analysis.delete_data()
        settle(store)

        assert result.waveforms == 2
        assert lib.stored() == {"a": STORED_READY, "b": STORED_READY}
        assert sorted(lib.decoder.names()) == ["a", "a", "b", "b"]
        runs = analysis_jobs(store)
        assert runs[-1].state == JobState.SUCCEEDED

    def test_while_paused_the_store_stays_empty(self, lib, engine):
        store, analysis = engine
        self.analysed(lib, engine, "a")
        analysis.pause()
        jobs_before = len(analysis_jobs(store))

        analysis.delete_data()
        settle(store)

        assert lib.stored() == {}
        assert len(analysis_jobs(store)) == jobs_before
        assert analysis.status().state == ANALYSIS_PAUSED

    def test_a_running_job_stops_first_and_nothing_lands_after(self, lib, engine):
        store, analysis = engine
        lib.add("a")
        lib.add("b")
        gate = Gate()
        lib.decoder.default = gate
        job = analysis.start("test")
        assert gate.entered.wait(TIMEOUT)
        # Paused in the settings only, so the run is not stopped by a pause and
        # nothing starts after the deletion: what the store holds afterwards is
        # only what landed after it.
        analysis._settings.set_paused(True)
        results: List[object] = []
        deleting = threading.Thread(
            target=lambda: results.append(analysis.delete_data())
        )
        deleting.start()
        time.sleep(0.2)
        waiting = deleting.is_alive()
        gate.release.set()
        deleting.join(TIMEOUT)
        settle(store)

        assert waiting, "the deletion did not wait for the file in flight"
        assert results and results[0].waveforms == 1
        assert lib.stored() == {}
        finished = store.get(job.id)
        assert finished.state == JobState.CANCELLED
        assert finished.error["reason"] == STOP_DATA_DELETED
        assert finished.result["stopped"] == STOP_DATA_DELETED

    def test_nothing_starts_while_the_store_is_emptied(self, lib, engine, monkeypatch):
        store, analysis = engine
        lib.add("a")
        inside, release = threading.Event(), threading.Event()
        clear = lib.store.clear

        def slow_clear():
            inside.set()
            assert release.wait(TIMEOUT)
            return clear()

        monkeypatch.setattr(lib.store, "clear", slow_clear)
        deleting = threading.Thread(target=analysis.delete_data)
        deleting.start()
        assert inside.wait(TIMEOUT)

        started = analysis.start("test")
        requested = analysis.request([lib.id("a")])
        empty_jobs = analysis_jobs(store)
        release.set()
        deleting.join(TIMEOUT)
        settle(store)

        assert started is None and requested is None
        assert empty_jobs == []
        assert lib.stored() == {"a": STORED_READY}

    def test_requests_survive_a_deletion_while_paused(self, lib, engine, monkeypatch):
        store, analysis = engine
        self.analysed(lib, engine, "a", "b")
        analysis.pause()
        inside, release = threading.Event(), threading.Event()
        clear = lib.store.clear

        def slow_clear():
            inside.set()
            assert release.wait(TIMEOUT)
            return clear()

        monkeypatch.setattr(lib.store, "clear", slow_clear)
        deleting = threading.Thread(target=analysis.delete_data)
        deleting.start()
        assert inside.wait(TIMEOUT)
        analysis.request([lib.id("b")])
        release.set()
        deleting.join(TIMEOUT)
        settle(store)

        assert lib.stored() == {"b": STORED_READY}
        assert analysis.status().state == ANALYSIS_PAUSED

    def test_a_store_that_cannot_be_emptied_raises_and_the_analysis_carries_on(
        self, lib, engine, monkeypatch
    ):
        store, analysis = engine
        lib.add("a")

        def broken():
            raise WaveformStoreError(message="disk full", error_code="X")

        monkeypatch.setattr(lib.store, "clear", broken)

        with pytest.raises(WaveformStoreError):
            analysis.delete_data()
        settle(store)

        assert lib.stored() == {"a": STORED_READY}

    def test_the_status_says_what_the_store_takes_on_disk(self, lib, engine):
        _, analysis = engine
        self.analysed(lib, engine, "a")

        size = analysis.status().store_bytes

        assert size == lib.store.disk_bytes() > 0
        assert analysis.status().to_dict()["store_bytes"] == size

    def test_a_status_whose_size_cannot_be_read_still_answers(
        self, lib, engine, monkeypatch
    ):
        _, analysis = engine

        def broken():
            raise OSError("gone")

        monkeypatch.setattr(lib.store, "disk_bytes", broken)

        assert analysis.status().store_bytes == 0

    def test_the_run_it_stopped_says_why_in_activity(self):
        result = AnalysisRunResult(
            trigger="launch", whole_library=True, analysed=3, stopped=STOP_DATA_DELETED
        )

        assert result.summary_line() == (
            "Analysed 3 waveforms. Stopped to delete the waveform data."
        )


def test_the_paused_setting_is_read_through_the_coordinator(lib, engine):
    _, analysis = engine
    assert analysis.paused() is False
    analysis.pause()
    assert analysis.paused() is True
