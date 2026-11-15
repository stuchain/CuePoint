#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ruff: noqa: F811 — the fixtures are imported, and named as arguments

"""Regression: a Review tick failed with "database is locked" beside a writer.

Sentry PYTHON-1N.

What broke
----------
On a slow PC, ``POST /api/v1/clean/match/ticks`` raised
``OperationalError: database is locked`` from ``DatabaseService.transaction()``
after the 5 s busy timeout, while background jobs (a Beatport resolve, a
duplicate scan, job records) took turns at the write lock. It came back as a
500 ``CLEAN_FAILED`` and was reported as a bug.

Why
---
A person's save tried once. SQLite's busy handler is not a queue, so a waiting
``BEGIN IMMEDIATE`` can lose every poll to many short writers for longer than
the timeout. And a busy answer was not one ``clean_api.status_for`` knew.

What makes it easy to reintroduce
---------------------------------
Nothing fails with one writer, or on a fast machine. A busy failure of one
transaction wrote nothing, so the handler can run again; a new Clean route, or
a route that grows a second transaction or a Beatport call before its write,
must decide again whether it can (see ``clean_api._WAITING_ROUTES``).
"""

from __future__ import annotations

import itertools
import sqlite3
import threading
from typing import Any, Dict, List

import pytest

from cuepoint.engine import server as server_module
from cuepoint.services import busy_wait
from cuepoint.services.database_service import DatabaseService

# With the engine fixtures of the Clean API's own tests: a library, a job store,
# a running engine, and a match job that never asks Beatport.
from tests.unit.engine.test_engine_clean_api import (  # noqa: F401 — fixtures
    NOW,
    add_tracks,
    attempt,
    candidate,
    candidates_of,
    engine,
    finished,
    get,
    library_db,
    no_beatport,
    ok,
    post,
    resolve,
    store,
    track,
)

pytestmark = pytest.mark.unit

BUSY = "The library is busy. Try again in a moment."
_NUMBERS = itertools.count(9000)
TICKS = "/api/v1/clean/match/ticks"


@pytest.fixture(autouse=True)
def short_busy_timeout(monkeypatch):
    """Every connection the engine opens gives up on a lock after 0.2 s."""
    monkeypatch.setattr(DatabaseService, "_resolve_timeout", lambda self: 0.2)


@pytest.fixture
def reports(monkeypatch) -> List[BaseException]:
    """What the engine reported as a bug, instead of reporting it."""
    seen: List[BaseException] = []

    def record(exc: BaseException, **_: Any) -> None:
        seen.append(exc)
        return None

    monkeypatch.setattr(server_module, "report_unexpected", record)
    return seen


class Writer:
    """Another connection holding the write lock, as a background job's commit does."""

    def __init__(self, path: str) -> None:
        self._connection = sqlite3.connect(
            path, isolation_level=None, check_same_thread=False
        )
        self._connection.execute("CREATE TABLE IF NOT EXISTS scratch (x INTEGER)")
        self._lock = threading.Lock()
        self._held = False

    def hold(self) -> None:
        self._connection.execute("BEGIN IMMEDIATE")
        self._connection.execute("INSERT INTO scratch (x) VALUES (1)")
        self._held = True

    def release(self) -> None:
        with self._lock:
            if self._held:
                self._connection.execute("ROLLBACK")
                self._held = False

    def release_after(self, seconds: float) -> threading.Timer:
        timer = threading.Timer(seconds, self.release)
        timer.start()
        return timer

    def close(self) -> None:
        self.release()
        self._connection.close()


@pytest.fixture
def writer(engine):
    """A writer over the engine's library, not yet holding the lock."""
    held = Writer(str(resolve("IDatabaseService").db_path))
    yield held
    held.close()


def to_check(name: str) -> Dict[str, int]:
    """A track waiting for the person: its proposal is not ticked yet."""
    [track_id] = add_tracks(track(name))
    stored = attempt(track_id, candidate(next(_NUMBERS), score=80.0, guard_ok=False))
    [first] = candidates_of(int(stored.id))
    assert resolve("IMatchRepository").get_match(track_id).state == "needs_review"
    return {"track_id": track_id, "candidate_id": int(first.id)}


def history_rows() -> int:
    """Every history row the library holds, read beside any writer."""
    path = str(resolve("IDatabaseService").db_path)
    connection = sqlite3.connect(path)
    try:
        return int(
            connection.execute("SELECT COUNT(*) FROM track_history").fetchone()[0]
        )
    finally:
        connection.close()


def test_the_lock_is_really_held(writer):
    """Guard for the test itself: a write is refused while the writer holds it."""
    writer.hold()
    other = sqlite3.connect(
        str(resolve("IDatabaseService").db_path), isolation_level=None, timeout=0.1
    )
    try:
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            other.execute("BEGIN IMMEDIATE")
    finally:
        other.close()


def test_a_tick_waits_for_the_writer_and_is_saved(engine, writer, reports):
    one = to_check("WaitsOne")
    two = to_check("WaitsTwo")
    writer.hold()
    timer = writer.release_after(1.0)
    try:
        answer = ok(
            post(
                engine,
                TICKS,
                {"ticked": True, "track_ids": [one["track_id"], two["track_id"]]},
            )
        )
    finally:
        timer.join()

    assert answer["changed"] == 2
    assert answer["batch_id"]
    for wanted in (one, two):
        assert (
            resolve("IMatchRepository").get_match(wanted["track_id"]).state
            == "accepted"
        )
    assert reports == []


def test_a_tick_gives_up_politely_and_writes_nothing(
    engine, writer, reports, monkeypatch
):
    monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.5)
    wanted = to_check("GivesUp")
    before = history_rows()
    writer.hold()

    status, payload = post(
        engine, TICKS, {"ticked": True, "track_ids": [wanted["track_id"]]}
    )
    writer.release()

    assert status == 503, payload
    assert payload == {"error": {"code": "LIBRARY_BUSY", "message": BUSY}}
    assert reports == []
    assert resolve("IMatchRepository").get_match(wanted["track_id"]).state == (
        "needs_review"
    )
    assert history_rows() == before


# ---------------------------------------------------------- the other saves


def _decide(engine: str, writer: Writer) -> None:
    wanted = to_check("Decide")
    body = {"decision": "accept", **wanted}
    writer.hold()
    timer = writer.release_after(1.0)
    ok(post(engine, "/api/v1/clean/decide", body))
    timer.join()
    state = resolve("IMatchRepository").get_match(wanted["track_id"]).state
    assert state == "accepted"


def _decide_a_selection(engine: str, writer: Writer) -> None:
    # A batch waits inside the service, a chunk at a time, never re-run whole.
    one, two = to_check("SelectOne"), to_check("SelectTwo")
    body = {
        "decision": "accept",
        "selection": {"track_ids": [one["track_id"], two["track_id"]]},
    }
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(post(engine, "/api/v1/clean/decide", body))
    timer.join()
    applied = answer["applied"]
    assert applied["changed"] == 2 and applied["failed"] == 0, answer


def _overrides(engine: str, writer: Writer) -> None:
    [track_id] = add_tracks(track("Overrides", genre="House"))
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(
        post(engine, f"/api/v1/library/tracks/{track_id}/overrides", {"genre": "Dub"})
    )
    timer.join()
    assert "genre" in answer["track"]["overridden"], answer["track"]


def _revert(engine: str, writer: Writer) -> None:
    [track_id] = add_tracks(track("Revert", genre="House"))
    ok(post(engine, f"/api/v1/library/tracks/{track_id}/overrides", {"genre": "Dub"}))
    [change] = ok(get(engine, f"/api/v1/library/tracks/{track_id}/history"))["changes"]
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(post(engine, "/api/v1/library/revert", {"change_id": change["id"]}))
    timer.join()
    assert answer["revert"]["changed"] is True


def _revert_a_batch(engine: str, writer: Writer) -> None:
    # Reverting a batch inline waits for each chunk inside the service.
    one, two = to_check("UndoOne"), to_check("UndoTwo")
    ticked = ok(
        post(
            engine,
            TICKS,
            {"ticked": True, "track_ids": [one["track_id"], two["track_id"]]},
        )
    )
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(
        post(engine, "/api/v1/library/revert/batch", {"batch_id": ticked["batch_id"]})
    )
    timer.join()
    assert answer["reverted"]["changed"] == 2, answer
    assert answer["reverted"]["failed"] == 0, answer


def _delete_past_matches(engine: str, writer: Writer) -> None:
    [track_id] = add_tracks(track("PastRun"))
    resolve("IMatchJobRepository").create(
        "past-run", [track_id], rematch=False, selected=1, created_at=NOW
    )
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(
        post(engine, "/api/v1/clean/match/jobs/delete", {"job_ids": ["past-run"]})
    )
    timer.join()
    assert answer["deleted"] == 1, answer


def _dismiss_duplicates(engine: str, writer: Writer, store: Any) -> None:
    add_tracks(
        track("Twin", title="Same Song", duration_seconds=300),
        track("Twin too", title="Same Song", duration_seconds=301),
    )
    started = ok(
        post(engine, "/api/v1/clean/duplicates/scan", {"signals": ["text"]}), 202
    )
    finished(store, started["job_id"])
    [group] = ok(get(engine, "/api/v1/clean/duplicates"))["groups"]
    writer.hold()
    timer = writer.release_after(1.0)
    answer = ok(
        post(engine, "/api/v1/clean/duplicates/dismiss", {"group_id": group["id"]})
    )
    timer.join()
    assert answer["group"]["dismissed"] is True


@pytest.mark.parametrize(
    "save",
    [
        _decide,
        _decide_a_selection,
        _overrides,
        _revert,
        _revert_a_batch,
        _delete_past_matches,
        _dismiss_duplicates,
    ],
    ids=lambda save: save.__name__.strip("_"),
)
def test_other_saves_wait_for_the_writer(engine, store, writer, reports, save):
    if save is _dismiss_duplicates:
        save(engine, writer, store)
    else:
        save(engine, writer)
    assert reports == []
