#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Clean's saves beside a busy library (Sentry PYTHON-1N).

What is worth a test, and why:

- **A busy library is a 503 ``LIBRARY_BUSY`` to try again**, never the 500
  ``CLEAN_FAILED`` that was reported as a bug; a job holding the library is
  still the 409 that names it, and another SQLite error is still a 500.
- **Only the routes that are safe to run again whole are run again**: one
  transaction after nothing but reads. A selection (several transactions), a
  hand search (Beatport first) and a job start are run once, so a committed
  chunk or a Beatport request is never repeated here. The list is pinned, so a
  route added to it is a decision someone reviews.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from typing import Any, Dict, List, Tuple

import pytest

from cuepoint.engine import batch_jobs, clean_api
from cuepoint.engine.jobs import JobTypeBusyError
from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.reporting.expected import is_expected_code
from cuepoint.services import busy_wait

pytestmark = pytest.mark.unit

BUSY_PAYLOAD = {
    "error": {
        "code": "LIBRARY_BUSY",
        "message": "The library is busy. Try again in a moment.",
    }
}


def locked() -> sqlite3.OperationalError:
    return sqlite3.OperationalError("database is locked")


class TestABusyLibraryIsATryAgain:
    def test_a_locked_library_is_a_503_and_never_reported(self, caplog):
        wrapped = DatabaseError("Could not save", "DB_COMMIT_FAILED")
        wrapped.__cause__ = locked()
        for exc in (locked(), sqlite3.OperationalError("database is busy"), wrapped):
            with caplog.at_level(logging.WARNING, logger="cuepoint.engine.clean_api"):
                status, payload = clean_api.status_for(exc)
            assert (status, payload) == (503, BUSY_PAYLOAD)
        assert is_expected_code(BUSY_PAYLOAD["error"]["code"])
        # A warning, so a real "locked" bug stays findable in the log.
        assert any("library busy" in r.getMessage() for r in caplog.records)
        assert all(r.levelno == logging.WARNING for r in caplog.records)

    def test_another_sqlite_error_is_still_a_500(self):
        status, payload = clean_api.status_for(
            sqlite3.OperationalError("no such table: tracks")
        )
        assert (status, payload["error"]["code"]) == (500, "CLEAN_FAILED")

    def test_a_job_holding_the_library_is_still_the_409_that_names_it(self):
        status, payload = clean_api.status_for(
            JobTypeBusyError("library_batch", "job-1")
        )
        assert status == 409
        assert payload["error"]["code"] == "LIBRARY_BUSY"
        assert payload["error"]["job_id"] == "job-1"
        assert payload["error"]["job_type"] == "library_batch"


class Flaky:
    """A handler that finds the library busy ``times`` times, then answers."""

    def __init__(self, times: int) -> None:
        self.left = times
        self.bodies: List[Dict[str, Any]] = []

    def __call__(self, data: Dict[str, Any], job_store: Any) -> Tuple[int, Any]:
        self.bodies.append(data)
        if self.left > 0:
            self.left -= 1
            raise locked()
        return 200, {"ok": True}


@pytest.fixture(autouse=True)
def quick(monkeypatch):
    monkeypatch.setattr(busy_wait, "REQUEST_INTERVAL_SECONDS", 0.0)
    monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 5.0)


def post(path: str, body: Dict[str, Any]) -> Tuple[int, Any]:
    import json

    return clean_api.handle_post(path, json.dumps(body).encode(), job_store=None)


WAITING = (
    "/api/v1/clean/match/ticks",
    "/api/v1/clean/match/jobs/delete",
    "/api/v1/library/revert",
    "/api/v1/clean/duplicates/dismiss",
    "/api/v1/clean/duplicates/keep",
    "/api/v1/clean/duplicates/restore",
)
ONE_TRACK = ("/api/v1/clean/decide", "/api/v1/clean/apply", "/api/v1/clean/correct")


class TestWhichSavesWait:
    def test_the_routes_that_wait_are_these(self):
        # Adding one is a decision: its whole write must be one transaction
        # after nothing but reads, with no Beatport call and no file write.
        assert clean_api._WAITING_ROUTES == frozenset(WAITING)
        assert clean_api._ONE_TRACK_WAITING_ROUTES == frozenset(ONE_TRACK)

    @pytest.mark.parametrize("path", WAITING)
    def test_a_route_that_is_safe_to_run_again_waits(self, monkeypatch, path):
        handler = Flaky(2)
        monkeypatch.setitem(clean_api._POST_ROUTES, path, handler)

        assert post(path, {"any": 1}) == (200, {"ok": True})

        assert handler.bodies == [{"any": 1}] * 3

    @pytest.mark.parametrize("path", ONE_TRACK)
    def test_one_track_waits(self, monkeypatch, path):
        handler = Flaky(1)
        monkeypatch.setitem(clean_api._POST_ROUTES, path, handler)

        assert post(path, {"track_id": 1}) == (200, {"ok": True})

        assert len(handler.bodies) == 2

    @pytest.mark.parametrize("path", ONE_TRACK)
    def test_a_selection_is_run_once(self, monkeypatch, path):
        # A batch waits inside its service, a transaction at a time; run again
        # whole, it could apply a committed chunk twice under two batch ids.
        handler = Flaky(1)
        monkeypatch.setitem(clean_api._POST_ROUTES, path, handler)

        with pytest.raises(sqlite3.OperationalError):
            post(path, {"selection": {"track_ids": [1]}})

        assert len(handler.bodies) == 1

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/clean/match/search",  # Beatport first
            "/api/v1/library/revert/batch",  # waits inside the service
            "/api/v1/clean/match",  # starts a job
            "/api/v1/clean/export",  # writes the person's file
            "/api/v1/clean/tags/write",
        ],
    )
    def test_any_other_route_is_run_once(self, monkeypatch, path):
        handler = Flaky(1)
        monkeypatch.setitem(clean_api._POST_ROUTES, path, handler)

        with pytest.raises(sqlite3.OperationalError):
            post(path, {})

        assert len(handler.bodies) == 1

    def test_a_tracks_overrides_wait(self, monkeypatch):
        calls: List[Dict[str, Any]] = []

        def set_overrides(track_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
            calls.append(data)
            if len(calls) < 3:
                raise locked()
            return {"track": {"id": track_id}}

        monkeypatch.setattr(clean_api, "set_overrides", set_overrides)

        answer = post("/api/v1/library/tracks/7/overrides", {"genre": "Dub"})

        assert answer == (200, {"track": {"id": 7}})
        assert calls == [{"genre": "Dub"}] * 3

    def test_a_refusal_is_not_tried_again(self, monkeypatch):
        calls: List[int] = []

        def refusing(data: Dict[str, Any], job_store: Any) -> Tuple[int, Any]:
            calls.append(1)
            raise ValueError("ticked must be true or false")

        monkeypatch.setitem(
            clean_api._POST_ROUTES, "/api/v1/clean/match/ticks", refusing
        )

        with pytest.raises(ValueError):
            post("/api/v1/clean/match/ticks", {})
        assert calls == [1]

    def test_the_wait_gives_up_after_its_patience(self, monkeypatch):
        monkeypatch.setattr(busy_wait, "REQUEST_PATIENCE_SECONDS", 0.0)
        handler = Flaky(10)
        monkeypatch.setitem(
            clean_api._POST_ROUTES, "/api/v1/clean/match/ticks", handler
        )

        with pytest.raises(sqlite3.OperationalError) as raised:
            post("/api/v1/clean/match/ticks", {})

        assert len(handler.bodies) == 1
        assert clean_api.status_for(raised.value) == (503, BUSY_PAYLOAD)


class _Reverted:
    def to_dict(self) -> Dict[str, Any]:
        return {"changed": 0}


class _Revert:
    """The revert service, saying how it was asked."""

    def __init__(self) -> None:
        self.asked: List[Dict[str, Any]] = []
        self.answer = _Reverted()

    def check_batch(self, batch_id: str) -> int:
        return 3

    def revert_batch(self, batch_id: str, **kwargs: Any) -> _Reverted:
        self.asked.append(kwargs)
        return self.answer


class TestRevertingABatchInline:
    """Inline, a library still busy is a 503 with nothing reverted, not "all failed"."""

    def test_a_small_batch_is_asked_to_raise_busy(self, monkeypatch):
        service = _Revert()
        monkeypatch.setattr(batch_jobs, "_revert_service", lambda: service)

        result, job = batch_jobs.revert_or_start(None, "b")  # type: ignore[arg-type]

        assert (result, job) == (service.answer, None)
        assert service.asked == [{"raise_busy": True}]

    def test_one_tracks_revert_is_asked_to_raise_busy(self, monkeypatch):
        service = _Revert()
        monkeypatch.setattr(clean_api, "_service", lambda name: service)

        status, payload = clean_api.revert_batch({"batch_id": "b", "track_id": 4}, None)

        assert (status, payload) == (200, {"reverted": {"changed": 0}})
        assert service.asked == [{"track_id": 4, "raise_busy": True}]


class TestAHandSearch:
    """Beatport is asked once; only storing what it answered waits."""

    def test_the_store_waits_and_beatport_is_not_asked_again(self):
        from types import SimpleNamespace

        from cuepoint.engine import match_search

        asked: List[Any] = []

        class Matcher:
            def find_best_match(self, **kwargs: Any) -> Tuple[Any, list, Any, Any]:
                asked.append(kwargs["queries"])
                return None, [], None, None

        class Matches:
            def __init__(self) -> None:
                self.tries = 0

            def add_hand_search(self, track_id: int, result: Any, track: Any) -> Any:
                self.tries += 1
                if self.tries < 3:
                    raise locked()
                return SimpleNamespace(id=41)

        matches = Matches()
        track = SimpleNamespace(
            title="A Title", artist="An Artist", file_path="/music/a.mp3"
        )

        answer = match_search.search_track(7, track, "a title", Matcher(), matches)

        assert answer == {"attempt_id": 41, "failure": None}
        assert asked == [["a title"]]
        assert matches.tries == 3


class TestATickJob:
    def test_a_long_tick_waits_for_a_busy_library(self, monkeypatch):
        from cuepoint.engine import match_sync
        from cuepoint.engine.jobs import JobState, JobStore

        tries: List[int] = []

        class States:
            def decide_many(self, accept: Any, reject: Any, batch_id: str) -> int:
                tries.append(1)
                if len(tries) < 3:
                    raise locked()
                return len(accept) + len(reject)

        monkeypatch.setattr(match_sync, "_service", lambda name: States())
        store = JobStore()

        job = match_sync.start_ticks_job(store, [(1, 10)], [2], "b-1", True, 0)

        deadline = time.monotonic() + 10
        while store.get(job.id).state not in (JobState.SUCCEEDED, JobState.FAILED):
            assert time.monotonic() < deadline
            time.sleep(0.01)

        finished = store.get(job.id)
        assert finished.state == JobState.SUCCEEDED, finished.error
        assert finished.result["changed"] == 2
        assert len(tries) == 3

    def test_a_tick_job_whose_service_cannot_be_found_fails_as_a_tick_failure(
        self, monkeypatch
    ):
        from cuepoint.engine import match_sync
        from cuepoint.engine.jobs import JobState, JobStore

        def missing(name: str) -> Any:
            raise RuntimeError("no service")

        monkeypatch.setattr(match_sync, "_service", missing)
        store = JobStore()

        job = match_sync.start_ticks_job(store, [(1, 10)], [], "b-2", True, 0)

        deadline = time.monotonic() + 10
        while store.get(job.id).state not in (JobState.SUCCEEDED, JobState.FAILED):
            assert time.monotonic() < deadline
            time.sleep(0.01)
        finished = store.get(job.id)
        assert finished.state == JobState.FAILED
        assert "MATCH_TICKS_FAILED" in str(finished.error)


class TestOrganizationBusy:
    """Library batches (``/api/v1/library/batch``) answer a busy library the same way."""

    def test_a_busy_library_is_a_503_to_try_again(self):
        from cuepoint.engine import organization_api, sets_api

        status, payload = organization_api.status_for(
            sqlite3.OperationalError("database is locked")
        )
        assert status == 503
        assert payload["error"]["code"] == sets_api.LIBRARY_BUSY
        assert payload["error"]["message"] == sets_api.LIBRARY_BUSY_MESSAGE
        assert is_expected_code(payload["error"]["code"])

    def test_a_busy_commit_wrapped_by_the_service_is_a_503_too(self):
        from cuepoint.engine import organization_api

        wrapped = DatabaseError(message="Could not save", error_code="DB_COMMIT_FAILED")
        wrapped.__cause__ = sqlite3.OperationalError("database is locked")
        status, _payload = organization_api.status_for(wrapped)
        assert status == 503

    def test_anything_else_is_still_a_500(self):
        from cuepoint.engine import organization_api

        status, payload = organization_api.status_for(RuntimeError("boom"))
        assert status == 500
        assert payload["error"]["code"] == "ORGANIZATION_FAILED"
