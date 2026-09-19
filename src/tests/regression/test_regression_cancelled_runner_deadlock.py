#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A job stopped by its runner locked the whole job store (found in CLEAN-14).

**What broke.** A runner that noticed a cancel and simply returned — without
setting a terminal state itself — never finished. Worse, the job store stayed
locked from then on: every status request, every job list and every cancel
waited forever, so the engine stopped answering anything about jobs.

**Why.** ``JobStore._run_job`` decides the ending under the store's lock, and
for a cancelled job called ``_update`` — which takes the same lock — from
inside it. The lock is not re-entrant.

**Why it went unseen.** inKey's file-based match runners always set
``CANCELLED`` themselves, and so do the library jobs, so the path was never
taken. Removing the file-based match (CLEAN-14) left a test whose runner
returned early, and the engine hung.
"""

from __future__ import annotations

import threading
import time

from cuepoint.engine.jobs import JobState, JobStore


def wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_a_runner_that_returns_on_cancel_ends_cancelled():
    store = JobStore()
    started = threading.Event()

    def runner(job):
        started.set()
        while not job.cancel_requested:
            time.sleep(0.005)

    job = store.create_job(job_type="library_batch", runner=runner)
    assert started.wait(5)
    store.request_cancel(job.id)

    assert wait_for(lambda: job.state is JobState.CANCELLED)
    assert job.error == {"code": "JOB_CANCELLED", "message": "Cancelled by user"}


def test_the_store_still_answers_afterwards():
    store = JobStore()
    started = threading.Event()

    def runner(job):
        started.set()
        while not job.cancel_requested:
            time.sleep(0.005)

    job = store.create_job(job_type="library_batch", runner=runner)
    assert started.wait(5)
    store.request_cancel(job.id)
    wait_for(lambda: job.state is JobState.CANCELLED, 2.0)

    answered = threading.Event()

    def ask():
        store.list_all()
        store.get(job.id)
        answered.set()

    threading.Thread(target=ask, daemon=True).start()
    assert answered.wait(2), "the job store stayed locked"
