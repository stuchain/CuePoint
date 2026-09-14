#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Engine tests end with the jobs they started (CLEAN-08).

Every import, refresh and match job now starts follow-up jobs of its own: a file
check and a duplicate scan. Those run on threads, and a test that ends while one
is still running hands it the next test's database and container — which is how
a stray scan came to migrate a database another test was migrating. So after
each test, the job threads that test started are given time to finish.

Threads the job store starts are named ``<type>-job-<id prefix>``. Only threads
that did not exist before the test are waited for, and the wait is bounded, so a
test that deliberately leaves a job blocked costs time rather than hanging.
"""

from __future__ import annotations

import re
import threading
import time

import pytest

_JOB_THREAD = re.compile(r"-job-[0-9a-f]{8}$")

#: The longest the suite waits, in all, for one test's jobs.
_JOB_THREAD_PATIENCE_SECONDS = 30.0


@pytest.fixture(autouse=True)
def _job_threads_finish_with_their_test():
    before = set(threading.enumerate())
    yield
    deadline = time.monotonic() + _JOB_THREAD_PATIENCE_SECONDS
    started = [
        thread
        for thread in threading.enumerate()
        if thread not in before and _JOB_THREAD.search(thread.name)
    ]
    for thread in started:
        thread.join(max(0.0, deadline - time.monotonic()))
