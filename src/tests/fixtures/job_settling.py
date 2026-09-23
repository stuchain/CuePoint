#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Waiting until a job, and every job it starts, has finished.

An import finishes and *then* starts its follow-ups — a file check and a
duplicate scan (DEC-073, DEC-074) — and a file check starts an artwork scan the
same way. So "every job in the store is finished" is briefly true between the
import setting its own state and its follow-ups being created, and a test that
waits for only that can read the library while a file check it never saw is
about to write it. That is a race a fixture lost: a preview read over the wire
reported no file check, and the same preview read a moment later reported
three missing files.

What cannot be caught between states is a job's *thread*. A follow-up is only
ever started from a job thread that is still running, so once no job thread is
alive and every job is finished, nothing is left that could start another.
Threads the job store starts are named ``<type>-job-<id prefix>``, which
``tests/unit/engine/conftest.py`` relies on too.
"""

from __future__ import annotations

import re
import threading
import time

from cuepoint.engine.jobs import JobState

_JOB_THREAD = re.compile(r"-job-[0-9a-f]{8}$")

_TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)


def wait_until_settled(store, what: str, timeout: float = 30.0) -> None:
    """Block until no job thread runs and every job in ``store`` has finished.

    Raises:
        AssertionError: If that has not happened within ``timeout`` seconds.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        running = [
            thread
            for thread in threading.enumerate()
            if _JOB_THREAD.search(thread.name) and thread.is_alive()
        ]
        if not running and all(job.state in _TERMINAL for job in store.list_all()):
            return
        time.sleep(0.02)
    raise AssertionError(f"Timed out waiting for {what}")
