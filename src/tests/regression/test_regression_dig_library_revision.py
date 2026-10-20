"""A Discover dig must not count as a library change (Statistics flickered).

What broke: while a dig ran, Statistics re-read about once a second, and Plays
dimmed under a Loading line each time. A dig caches Beatport catalog rows, its
run's tracks and its job's progress in ``cuepoint.db`` about once a second. The
engine's ``library`` revision was ``PRAGMA data_version`` on that file, which
moves on *any* commit, so every one of those writes told the renderer "the
library changed", and every read tagged ``library`` (Statistics, Library, Clean,
Keys) was read again, and the engine's memo recomputed them too.

The fix counts writes by table (``persistence/revision_counters.py``): Discover's
tables and job rows move ``discover``, everything else ``library``.

Easy to reintroduce: anything that goes back to watching the file as a whole,
a new Discover table not listed in ``DISCOVER_TABLES`` (it would count as the
library's again), or a library table wrongly listed there (its writes would
then leave library reads stale, which the second half of this file pins).
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.engine.revisions import DISCOVER, LIBRARY, RevisionMemo, Revisions
from cuepoint.models.discovery_run import DiscoveryRun
from cuepoint.persistence.beatport_catalog_repository import BeatportCatalogRepository
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.persistence.job_repository import JobRecord, JobRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import NOW, accept, add_tracks, catalog_track

pytestmark = pytest.mark.unit


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


def _job(job_id: str, job_type: str, done: int) -> JobRecord:
    return JobRecord(
        id=job_id,
        type=job_type,
        state="running",
        demo=False,
        progress={"done": done},
        error=None,
        created_at=NOW,
        updated_at=NOW,
    )


def _dig_writes(database, done: int) -> None:
    """What one tick of a dig writes: a run, its catalog tracks, its progress."""
    runs = DiscoveryRepository(database)
    run = runs.start_run(DiscoveryRun(started_at=NOW, params_json="{}"))
    assert run.id is not None
    tracks = [
        catalog_track(9000 + done * 10 + n, artists=[(n + 1, f"Artist {n}")])
        for n in range(3)
    ]
    runs.record_found(run.id, tracks, (), NOW, {})
    BeatportCatalogRepository(database).upsert_tracks(tracks, NOW)
    JobRepository(database).save(_job("dig", "discovery", done))


def test_a_dig_leaves_the_library_revision_where_it_was(library):
    database, revisions = library
    before = revisions.snapshot()
    for tick in range(3):
        _dig_writes(database, tick)
        after = revisions.snapshot()
        assert after[LIBRARY] == before[LIBRARY], (
            "a dig write counted as a library change"
        )
        assert after[DISCOVER] != before[DISCOVER], "a dig write went unseen"
        before = after


def test_statistics_is_not_recomputed_while_a_dig_writes(library):
    """The engine half of the symptom: a library read kept across a dig's writes."""
    database, revisions = library
    memo = RevisionMemo(revisions)
    calls: List[int] = []

    def plays() -> int:
        calls.append(1)
        return len(calls)

    memo.get("statistics/plays", "", (LIBRARY,), plays)
    for tick in range(3):
        _dig_writes(database, tick)
        memo.get("statistics/plays", "", (LIBRARY,), plays)
    assert len(calls) == 1


def test_every_library_write_still_moves_the_library_revision(library):
    database, revisions = library

    def moved(write) -> bool:
        before = revisions.snapshot()[LIBRARY]
        write()
        return revisions.snapshot()[LIBRARY] != before

    def tracks() -> None:
        with database.transaction() as conn:
            add_tracks(conn, 2, start=1)

    def match() -> None:
        with database.transaction() as conn:
            accept(conn, 1, "777")

    def removal() -> None:
        with database.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = 2")

    def a_library_job() -> None:
        JobRepository(database).save(_job("import", "library_import", 1))

    assert moved(tracks)
    assert moved(match)
    assert moved(removal)
    assert moved(a_library_job)
    # A restore closes every connection and replaces the file: the generation.
    assert moved(database.close_all)
