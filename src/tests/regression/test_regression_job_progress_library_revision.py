"""A running job's saved progress must not count as a library change (ELECTRON-3).

What broke: every running job (an import, a match, an analysis) saves its
progress to the ``jobs`` table every couple of seconds. Each save moved the
``library`` revision, so for as long as the job ran every library page in the
app (summary, Collections, playlists, Health) was read again every couple of
seconds, and the engine recomputed each read. On a slow laptop that kept the
engine busy enough that the app's heartbeat gave up on it and restarted it.

The fix: an UPDATE of a ``jobs`` row that changes only ``progress_json`` and
``updated_at`` counts in no domain (``persistence/revision_counters.py``,
``_QUIET_UPDATE_COLUMNS``). Nothing reads saved progress through a revision.

Easy to reintroduce: a ``jobs`` column added later is counted (it is not
quiet), but widening the quiet list to ``state`` or ``error_json`` would leave
a finished job's library pages stale, which the second test pins.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.engine.revisions import LIBRARY, RevisionMemo, Revisions
from cuepoint.persistence.job_repository import JobRecord, JobRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = "2026-11-16T09:00:00+00:00"


@pytest.fixture
def library(tmp_path):
    database = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(database).migrate()
    revisions = Revisions.for_files(
        lambda: database.db_path,
        lambda: tmp_path / "waveforms.db",
        lambda: database.generation,
    )
    yield database, revisions
    revisions.close()
    database.close_all()


def _job(state: str, done: int, error=None) -> JobRecord:
    return JobRecord(
        id="match-1",
        type="match",
        state=state,
        demo=False,
        progress={"done": done, "total": 1000},
        error=error,
        created_at=NOW,
        updated_at=f"2026-11-16T09:00:{done:02d}+00:00",
    )


def test_progress_saves_leave_the_library_revision_where_it_was(library):
    database, revisions = library
    jobs = JobRepository(database)
    jobs.save(_job("running", 0))
    before = revisions.snapshot()[LIBRARY]
    for done in range(1, 6):
        jobs.save(_job("running", done))
        assert revisions.snapshot()[LIBRARY] == before, (
            "a progress save counted as a library change"
        )


def test_a_job_starting_ending_or_failing_still_counts(library):
    database, revisions = library
    jobs = JobRepository(database)

    def moved(record: JobRecord) -> bool:
        before = revisions.snapshot()[LIBRARY]
        jobs.save(record)
        return revisions.snapshot()[LIBRARY] != before

    assert moved(_job("running", 0)), "a new job went unseen"
    assert moved(_job("completed", 1)), "a finished job went unseen"
    assert moved(_job("completed", 1, error={"code": "X"})), "an error went unseen"
    assert jobs.mark_interrupted(NOW) == 0
    jobs.save(_job("running", 2))
    before = revisions.snapshot()[LIBRARY]
    assert jobs.mark_interrupted(NOW) == 1
    assert revisions.snapshot()[LIBRARY] != before, "an interrupted job went unseen"


def test_library_reads_are_not_recomputed_while_a_job_saves_progress(library):
    database, revisions = library
    jobs = JobRepository(database)
    jobs.save(_job("running", 0))
    memo = RevisionMemo(revisions)
    calls: List[int] = []

    def summary() -> int:
        calls.append(1)
        return len(calls)

    memo.get("library/summary", "", (LIBRARY,), summary)
    for done in range(1, 4):
        jobs.save(_job("running", done))
        memo.get("library/summary", "", (LIBRARY,), summary)
    assert len(calls) == 1
