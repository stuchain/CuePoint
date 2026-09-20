#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Two database connections in one engine (found in CLEAN-14).

**What broke.** Importing a library in the desktop app crawled. A 50,000-track
export that the engine imports in under three seconds took more than ten
minutes and never finished: progress advanced by *one track every five
seconds*. Nothing failed, nothing was logged, and the same import run straight
through the services was instant, so it read as "large imports are slow".

**Why.** ``bootstrap_services()`` registered a brand new ``DatabaseService``
over the previous one every time it was called, and the engine calls it more
than once — the launch backup calls it at startup, the first job calls it again
through ``_ensure_services``. Whatever had already been resolved kept the first
one. The job store had: it resolves its repository once, when the first job
record is written, which is while the import request is still being served. So
the import held its write lock on one connection, and the job store tried to
record the import's progress on *another* — a second writer to the same file,
waiting out the entire five-second busy timeout, on every tick. The failure was
invisible because a job record is written best-effort and the timeout was
swallowed.

**The symptom a user saw** is what the second test asserts: an import that
finishes in seconds. The first test asserts the cause directly, because the
timing one only fails once an import is big enough to tick.

**Why it is easy to bring back.** Calling "bootstrap the services" twice looks
harmless, and every caller of it means "make sure they exist". Nothing warns
that the second call replaced the database — and with one connection, an
engine, a CLI run and every test behaves identically.
"""

from __future__ import annotations

import time

import pytest

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine import jobs as jobs_module
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.services import database_service as database_service_module
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import (
    IDatabaseService,
    IJobRepository,
    ILibraryImportService,
    IMigrationRunner,
)
from cuepoint.utils.di_container import get_container, reset_container

#: SQLite's default lock wait, which is what a progress write spent waiting on
#: the unfixed engine — every time, because the lock it waited for was held by
#: the very import whose progress it was recording.
BUSY_TIMEOUT_SECONDS = 5.0


@pytest.fixture
def engine_home(tmp_path, monkeypatch):
    """A sandboxed database, and a container as empty as a fresh process's.

    ``_services_bootstrapped`` is cleared rather than set: the second bootstrap
    call is exactly what this test is about, so the job thread has to be
    allowed to make it.
    """
    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    monkeypatch.setattr(jobs_module, "_services_bootstrapped", False)
    reset_container()
    yield tmp_path
    try:
        get_container().resolve(IDatabaseService).close_all()
    except ValueError:  # nothing was ever registered
        pass
    reset_container()


def wait_for_terminal(job: Job, timeout: float) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(
        f"the import did not finish within {timeout:.0f}s; state={job.state.value}, "
        f"progress={job.progress}"
    )


@pytest.mark.integration
def test_bootstrapping_twice_keeps_one_database(engine_home):
    """Everything in a process shares one database service, however often it is wired."""
    bootstrap_services()  # the engine's launch backup
    first = get_container().resolve(IDatabaseService)
    job_repository = get_container().resolve(IJobRepository)

    bootstrap_services()  # the first job, through _ensure_services

    assert get_container().resolve(IDatabaseService) is first
    assert get_container().resolve(ILibraryImportService)._db is first
    # The one that mattered: a repository resolved before the second call must
    # still be writing to the same connection as everything resolved after it.
    assert job_repository._db is first


@pytest.mark.integration
def test_recording_progress_never_waits_on_the_database(engine_home):
    """A job's progress write must not queue behind that job's own transaction.

    This is the bug at the size it actually bit: a runner holding the
    transaction an import holds, reporting progress the way an import reports
    it. On one connection the write is refused as a nested transaction and
    returns at once; on two it waits out the whole busy timeout, and the tick
    after it does the same, which is what turned a three-second import into an
    afternoon.
    """
    bootstrap_services()  # the engine's launch backup
    get_container().resolve(IMigrationRunner).migrate()
    # The store resolves its repository from this wiring, as the engine's does:
    # the first job record is written while the request is still being served.
    store = JobStore(job_repository=get_container().resolve(IJobRepository))

    bootstrap_services()  # the first job, through _ensure_services
    database = get_container().resolve(IDatabaseService)

    waits: list[float] = []

    def runner(job: Job) -> None:
        # The transaction an import holds from its first track to its last.
        with database.transaction():
            for completed in range(3):
                started = time.monotonic()
                store.report_progress(
                    job,
                    ProgressInfo(
                        completed_tracks=completed,
                        total_tracks=3,
                        matched_count=0,
                        unmatched_count=0,
                        elapsed_time=0.0,
                        status_message="Importing tracks",
                    ),
                )
                waits.append(time.monotonic() - started)

    job = wait_for_terminal(
        store.create_job(job_type=JOB_TYPE_LIBRARY_IMPORT, runner=runner),
        timeout=BUSY_TIMEOUT_SECONDS * 6,
    )

    assert job.state is JobState.SUCCEEDED, job.error
    assert waits, "the runner never reported progress"
    assert max(waits) < BUSY_TIMEOUT_SECONDS / 2, (
        f"reporting progress took {max(waits):.1f}s: it is waiting on the "
        "database rather than writing to it"
    )
