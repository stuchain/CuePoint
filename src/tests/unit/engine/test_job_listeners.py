#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Being told when a job starts and when it has ended (WAVE-03).

The waveform analysis steps aside for every job that rewrites the library or
its files, and comes back when the last of them ends, through these two
listeners. So: a start is told after the job is registered and before its
runner runs; an end only once its terminal state is set, whatever it was; and a
listener that raises is logged and never reaches the job.
"""

from __future__ import annotations

import logging
import threading

import pytest

from cuepoint.engine.jobs import Job, JobState, JobStore
from tests.fixtures.job_settling import wait_until_settled


@pytest.fixture
def store():
    jobs = JobStore()
    yield jobs
    wait_until_settled(jobs, "the listener test's jobs")


def test_a_start_is_told_before_the_runner_runs(store):
    seen = []
    runner_started = threading.Event()

    def started(job: Job) -> None:
        seen.append((job.type, runner_started.is_set(), store.get(job.id) is job))

    store.add_listeners(started=started)
    store.create_job(job_type="file_check", runner=lambda job: runner_started.set())

    assert seen == [("file_check", False, True)]


@pytest.mark.parametrize(
    "runner, state",
    [
        (lambda job: None, JobState.SUCCEEDED),
        (lambda job: (_ for _ in ()).throw(RuntimeError("boom")), JobState.FAILED),
    ],
)
def test_an_end_is_told_once_its_state_is_final(store, runner, state):
    ended = []
    done = threading.Event()

    def on_end(job: Job) -> None:
        ended.append(job.state)
        done.set()

    store.add_listeners(ended=on_end)
    store.create_job(job_type="library_import", runner=runner)

    assert done.wait(5)
    assert ended == [state]


def test_an_end_after_a_cancel_is_told_as_cancelled(store):
    ended = []
    release = threading.Event()
    done = threading.Event()

    def on_end(job: Job) -> None:
        ended.append(job.state)
        done.set()

    store.add_listeners(ended=on_end)
    job = store.create_job(job_type="tag_write", runner=lambda job: release.wait(5))
    store.request_cancel(job.id)
    release.set()

    assert done.wait(5)
    assert ended == [JobState.CANCELLED]


def test_a_listener_that_raises_never_reaches_the_job(store):
    def broken(job: Job) -> None:
        raise RuntimeError("listener bug")

    store.add_listeners(started=broken, ended=broken)
    records: list = []
    handler = logging.Handler(logging.DEBUG)
    handler.emit = records.append  # type: ignore[method-assign]
    # Its own handler, not caplog's on the root: in a full run another test's
    # setup stops the cuepoint loggers propagating.
    logger = logging.getLogger("cuepoint.engine.jobs")
    disabled, level = logger.disabled, logger.level
    logger.disabled = False
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    try:
        job = store.create_job(job_type="file_check", runner=lambda job: None)
        wait_until_settled(store, "the job")
    finally:
        logger.removeHandler(handler)
        logger.disabled, logger.level = disabled, level

    assert job.state == JobState.SUCCEEDED
    assert sum("a listener failed" in r.getMessage() for r in records) == 2


def test_a_listener_added_twice_is_told_once(store):
    seen = []

    def started(job: Job) -> None:
        seen.append(job.id)

    store.add_listeners(started=started)
    store.add_listeners(started=started)
    store.create_job(job_type="file_check", runner=lambda job: None)

    assert len(seen) == 1
