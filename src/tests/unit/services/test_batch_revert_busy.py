#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ruff: noqa: F811 — the fixtures are imported, and named as arguments

"""A batch and a batch revert beside a busy library (Sentry PYTHON-1N).

A batch is several transactions (its chunks, then its event), so it is never
run again whole: each transaction waits on its own. What is worth a test:

- **A chunk waits for the writer** and is applied once, rather than found busy,
  then tried one track at a time against the same lock.
- **A chunk still busy after waiting is raised with nothing written**, and the
  one-track-at-a-time fallback is not tried for it.
- **A revert waits the same way.** Asked to (``raise_busy``, the inline path), a
  first chunk still busy is raised with nothing reverted rather than answered
  as every change failed; a job leaves it off and counts them as it always did.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from typing import Callable, Iterator

import pytest

from cuepoint.services import busy_wait
from cuepoint.services.batch_service import EVENT_BATCH_APPLIED, OPERATION_SET_RATING
from cuepoint.services.batch_service import BatchOperation
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.revert_service import EVENT_BATCH_REVERTED

# test_revert's services, over this module's ``db`` (a short busy timeout).
from tests.unit.services.test_revert import (  # noqa: F401 — fixtures
    activity,
    apply,
    batch,
    collections,
    everyone,
    ids,
    matches,
    metadata,
    revert,
    states,
    tags,
    tracks,
)

pytestmark = pytest.mark.unit


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(
        db_path=tmp_path / "cuepoint.db", busy_timeout_seconds=0.1
    )
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture(autouse=True)
def quick(monkeypatch):
    monkeypatch.setattr(busy_wait, "REQUEST_INTERVAL_SECONDS", 0.02)
    monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 10.0)


@pytest.fixture
def writer(db, ids) -> Iterator[Callable[[], None]]:
    """Another connection holding the write lock; call it to let go."""
    connection = sqlite3.connect(
        db.db_path, isolation_level=None, check_same_thread=False
    )
    connection.execute("BEGIN IMMEDIATE")
    lock = threading.Lock()
    held = [True]

    def release() -> None:
        with lock:
            if held[0]:
                held[0] = False
                connection.execute("ROLLBACK")

    yield release
    release()
    connection.close()


def released_after(release: Callable[[], None], seconds: float) -> threading.Timer:
    timer = threading.Timer(seconds, release)
    timer.start()
    return timer


def rating(metadata, track_id: int):
    """A track's rating, None when CuePoint holds no values for it."""
    values = metadata.get(track_id)
    return None if values is None else values.rating


def one_at_a_time(caplog) -> bool:
    return any("one track at a time" in r.getMessage() for r in caplog.records) or any(
        "one change at a time" in r.getMessage() for r in caplog.records
    )


class TestABatch:
    def test_a_chunk_waits_for_the_writer_and_is_applied_once(
        self, batch, metadata, activity, ids, writer, caplog
    ):
        timer = released_after(writer, 0.4)
        with caplog.at_level(logging.WARNING):
            result = batch.apply_batch(
                everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
            )
        timer.join()

        assert (result.changed, result.failed) == (4, 0)
        assert all(rating(metadata, t) == 5 for t in ids.values())
        assert len(activity.recent_events(event_type=EVENT_BATCH_APPLIED)) == 1
        assert not one_at_a_time(caplog)

    def test_a_chunk_still_busy_is_raised_with_nothing_written(
        self, batch, metadata, activity, ids, writer, caplog, monkeypatch
    ):
        monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.3)
        with caplog.at_level(logging.WARNING):
            with pytest.raises(sqlite3.OperationalError, match="locked"):
                batch.apply_batch(
                    everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
                )
        writer()

        assert all(rating(metadata, t) is None for t in ids.values())
        assert activity.recent_events(event_type=EVENT_BATCH_APPLIED) == []
        assert not one_at_a_time(caplog)

    def test_its_event_waits_once_the_chunks_are_committed(
        self, batch, activity, ids, monkeypatch
    ):
        real = activity.record_event
        busy = [2]

        def record(*args, **kwargs):
            if busy[0]:
                busy[0] -= 1
                raise sqlite3.OperationalError("database is locked")
            return real(*args, **kwargs)

        monkeypatch.setattr(activity, "record_event", record)

        result = batch.apply_batch(
            everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
        )

        assert result.changed == 4
        assert len(activity.recent_events(event_type=EVENT_BATCH_APPLIED)) == 1


@pytest.fixture
def rated(batch, ids) -> str:
    return batch.apply_batch(
        everyone(ids), BatchOperation(OPERATION_SET_RATING, 5)
    ).batch_id


class TestABatchRevert:
    def test_it_waits_for_the_writer(self, revert, rated, metadata, ids, db, caplog):
        connection = sqlite3.connect(
            db.db_path, isolation_level=None, check_same_thread=False
        )
        connection.execute("BEGIN IMMEDIATE")
        timer = threading.Timer(0.4, lambda: connection.execute("ROLLBACK"))
        timer.start()
        try:
            with caplog.at_level(logging.WARNING):
                result = revert.revert_batch(rated, raise_busy=True)
        finally:
            timer.join()
            connection.close()

        assert (result.reverted, result.failed) == (4, 0)
        assert all(rating(metadata, t) is None for t in ids.values())
        assert not one_at_a_time(caplog)

    def test_inline_a_library_still_busy_is_raised_with_nothing_reverted(
        self, revert, rated, metadata, activity, ids, db, monkeypatch
    ):
        monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.3)
        connection = sqlite3.connect(db.db_path, isolation_level=None)
        connection.execute("BEGIN IMMEDIATE")
        try:
            with pytest.raises(sqlite3.OperationalError, match="locked"):
                revert.revert_batch(rated, raise_busy=True)
        finally:
            connection.execute("ROLLBACK")
            connection.close()

        assert all(rating(metadata, t) == 5 for t in ids.values())
        assert activity.recent_events(event_type=EVENT_BATCH_REVERTED) == []

    def test_a_job_still_counts_a_busy_chunk_one_change_at_a_time(
        self, revert, rated, metadata, ids, monkeypatch
    ):
        # Without raise_busy (a job), a chunk the library is too busy for is
        # tried one change at a time, as it always was.
        monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.0)

        def busy(*args, **kwargs):
            raise sqlite3.OperationalError("database is locked")

        monkeypatch.setattr(revert, "_revert_together", busy)

        result = revert.revert_batch(rated)

        assert (result.reverted, result.failed) == (4, 0)
        assert all(rating(metadata, t) is None for t in ids.values())

    def test_raise_busy_is_only_for_the_first_chunk(
        self, revert, rated, metadata, ids, monkeypatch
    ):
        # Once a chunk is committed, a busy one after it is counted rather than
        # raised, so a revert is never left half done without its event.
        from cuepoint.services import revert_service

        monkeypatch.setattr(revert_service, "BATCH_CHUNK_SIZE", 2)
        monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.0)
        real = revert._revert_together
        calls = [0]

        def second_busy(*args, **kwargs):
            calls[0] += 1
            if calls[0] == 2:
                raise sqlite3.OperationalError("database is locked")
            return real(*args, **kwargs)

        monkeypatch.setattr(revert, "_revert_together", second_busy)

        result = revert.revert_batch(rated, raise_busy=True)

        assert (result.reverted, result.failed) == (4, 0)
