#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: Prepare's reads failed with "database is locked" beside a writer.

Sentry PYTHON-1M and PYTHON-1K.

What broke
----------
Opening a Set while a ``beatport_resolve`` job was writing raised
``OperationalError: database is locked`` from ``DatabaseService.transaction()``
and came back as a 500 from ``/sets/plan``, ``/sets/entries`` and
``/sets/analysis``.

Why
---
Those reads wanted one consistent view of the Set, and got it with
``transaction(join_existing=True)``. That always begins ``IMMEDIATE``, which
takes SQLite's single write lock, so a read queued behind every writer and failed
once the busy timeout ran out. A read in WAL mode needs no lock at all.

What makes it easy to reintroduce
---------------------------------
Nothing fails with one writer, and "a transaction for consistency" reads as the
right tool. ``DatabaseService.read_snapshot()`` is the read-only one.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.collection import KIND_SET, Collection
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_analysis_service import SetAnalysisService
from cuepoint.services.set_list_service import SetListService
from cuepoint.services.set_service import SetService

pytestmark = pytest.mark.unit


@pytest.fixture
def library(tmp_path):
    """A Set of two tracks, and a short busy timeout so a lock shows at once."""
    db = DatabaseService(db_path=tmp_path / "cuepoint.db", busy_timeout_seconds=0.2)
    MigrationRunner(db).migrate()
    tracks = TrackRepository(db)
    collections = CollectionRepository(db)
    set_repo = SetRepository(db)
    ids = []
    for n in (1, 2):
        stored = tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(n),
                file_path=f"/m/{n}.mp3",
                title=f"T{n}",
                artist="A",
                bpm=124.0,
                key="8A",
                duration_seconds=300,
            )
        )
        ids.append(int(stored.id))
    set_id = int(collections.create(Collection(name="Friday", kind=KIND_SET)).id)
    collections.append(set_id, ids)
    sets = SetService(collections, set_repo, db)
    yield {
        "set_id": set_id,
        "plan": sets,
        "analysis": SetAnalysisService(collections, set_repo, tracks, db),
        "set_list": SetListService(
            sets, set_repo, tracks, ActivityService(ActivityRepository(db), tracks), db
        ),
    }
    db.close_all()


@pytest.fixture
def writer(tmp_path):
    """Another connection holding the write lock with an uncommitted insert."""
    path = tmp_path / "cuepoint.db"
    connection = sqlite3.connect(path, isolation_level=None)
    connection.execute("CREATE TABLE IF NOT EXISTS scratch (x INTEGER)")
    connection.execute("BEGIN IMMEDIATE")
    connection.execute("INSERT INTO scratch (x) VALUES (1)")
    yield connection
    connection.execute("ROLLBACK")
    connection.close()


def test_the_lock_is_really_held(library, writer):
    """Guard for the test itself: a write is refused while the writer is open."""
    other = sqlite3.connect(
        library["plan"]._db.db_path, isolation_level=None, timeout=0.1
    )
    try:
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            other.execute("BEGIN IMMEDIATE")
    finally:
        other.close()


def test_plan_reads_beside_a_writer(library, writer):
    plan = library["plan"].plan(library["set_id"])
    assert plan.set.name == "Friday"
    assert len(plan.entries) == 2


def test_analyse_reads_beside_a_writer(library, writer):
    report = library["analysis"].analyse(library["set_id"])
    assert report.set.name == "Friday"


def test_the_set_list_reads_beside_a_writer(library, writer):
    read = library["set_list"].set_list(library["set_id"])
    assert read.name == "Friday"
    assert len(read.rows) == 2
