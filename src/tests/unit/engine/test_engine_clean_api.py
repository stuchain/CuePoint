#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Clean over HTTP (CLEAN-11).

CLEAN-02 through CLEAN-10 have their own tests for what each service does. What
only this layer can get wrong, and so what is tested here, through a running
engine against a temporary database and real audio files:

- **Every route answers**: its happy path, a refusal, and a plausible wrong
  shape — and a refusal arrives as a 400, 404 or 409 in the existing envelope
  with the field named, never a 500.
- **Health cannot disagree with the Library.** Each count equals the total the
  Library's own search returns for the rule set the count carries, over a
  library holding every problem Health counts.
- **A row says what its filter finds.** The match state, dispute, file status
  and artwork on a row are the values the filters of those names select.
- **Tag writes**: a preview answered inline and as a job, a write by preview id
  refused the second time, a restore by job and by track, and a write
  interrupted after its record showing unconfirmed rows in the record and in the
  restore's answer.

Beatport is never reached: a match job's runner is replaced before any route
starts one, and no track here has a Beatport image to fetch.
"""

from __future__ import annotations

import csv
import json
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pytest

from cuepoint.engine import batch_jobs, match_jobs, tag_write_jobs
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    TrackFileStatus,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.artwork_repository import EmbeddedRecord
from cuepoint.services import database_service as database_service_module
from cuepoint.services.health_service import HEALTH_RULES
from cuepoint.services.review_export_service import REVIEW_COLUMNS
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.audio_files import audio_copy

TOKEN = "clean-api-token"
NOW = "2026-09-15T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")
TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)


# ---------------------------------------------------------------- the engine


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    """A sandboxed library database with services bootstrapped over it."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    tag_write_jobs.get_preview_store().clear()
    yield
    tag_write_jobs.get_preview_store().clear()
    reset_container()


@pytest.fixture
def store() -> JobStore:
    return JobStore()


@pytest.fixture
def engine(library_db, store):
    """A running engine over its own job store; every job ends before teardown."""
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        wait_until(
            lambda: all(job.state in TERMINAL for job in store.list_all()),
            "every job to finish",
        )
        server.shutdown()
        thread.join(timeout=2)


@pytest.fixture(autouse=True)
def no_beatport(monkeypatch):
    """A match job that finishes without asking Beatport anything."""

    def finish(job: Job, store: JobStore, prepare: Any) -> None:
        store.finish(job, state=JobState.SUCCEEDED, result={"stubbed": True})

    monkeypatch.setattr(match_jobs, "run_match_job", finish)


# ------------------------------------------------------------------ helpers


def wait_until(predicate, message: str, timeout: float = 60.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"timed out waiting for {message}")


def call(
    base: str,
    method: str,
    path: str,
    body: Any = None,
    params: Optional[Dict[str, Any]] = None,
    token: Optional[str] = TOKEN,
    raw: Optional[bytes] = None,
) -> Tuple[int, Dict[str, Any]]:
    """Make one request and return ``(status, payload)``, error or not."""
    query = urllib.parse.urlencode(
        {k: v for k, v in (params or {}).items() if v is not None}
    )
    url = f"{base}{path}" + (f"?{query}" if query else "")
    data = (
        raw
        if raw is not None
        else (json.dumps(body).encode("utf-8") if method == "POST" else None)
    )
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def get(base: str, path: str, **params: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "GET", path, params=params)


def post(base: str, path: str, body: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "POST", path, body)


def ok(result: Tuple[int, Dict[str, Any]], status: int = 200) -> Dict[str, Any]:
    assert result[0] == status, result
    return result[1]


def refused(
    result: Tuple[int, Dict[str, Any]], status: int, code: str, *words: str
) -> Dict[str, Any]:
    assert result[0] == status, result
    error = result[1]["error"]
    assert error["code"] == code, error
    for word in words:
        assert word in error["message"], error
    return error


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


def finished(store: JobStore, job_id: str) -> Job:
    wait_until(lambda: store.get(job_id).state in TERMINAL, f"job {job_id}")
    return store.get(job_id)


def hold(store: JobStore, job_type: str) -> threading.Event:
    """A running job of ``job_type`` that ends when the event is set."""
    released = threading.Event()

    def runner(job: Job) -> None:
        released.wait(30)
        store.finish(job, state=JobState.SUCCEEDED)

    store.create_job(job_type=job_type, runner=runner, exclusive=True)
    wait_until(
        lambda: any(
            job.type == job_type and job.state == JobState.RUNNING
            for job in store.list_all()
        ),
        f"a held {job_type} job",
    )
    return released


def add_tracks(*tracks: LibraryTrack) -> List[int]:
    repository = resolve("ITrackRepository")
    repository.add_many(tracks)
    return [
        int(repository.find_by_rekordbox_id(track.rekordbox_track_id).id)
        for track in tracks
    ]


def track(name: str, **fields: Any) -> LibraryTrack:
    values: Dict[str, Any] = {
        "rekordbox_track_id": f"{name}-{uuid.uuid4().hex[:6]}",
        "file_path": f"/music/{name}.mp3",
        "title": name,
        "artist": "An Artist",
    }
    values.update(fields)
    return LibraryTrack(**values)


def candidate(number: int, score: float = 80.0, **fields: Any) -> BeatportCandidate:
    values: Dict[str, Any] = dict(
        url=f"https://www.beatport.com/track/a-title/{number}",
        title="A Title",
        artists="An Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
    )
    values.update(fields)
    return BeatportCandidate(**values)


def attempt(track_id: int, *candidates: BeatportCandidate, winner: Optional[int] = 0):
    """Store an attempt through the real repository and apply the state rule."""
    best = candidates[winner] if winner is not None else None
    result = TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=best is not None,
        best_match=best,
        candidates=list(candidates),
        match_score=best.score if best is not None else None,
    )
    stored = resolve("IMatchRepository").add_attempt(track_id, "job", result, QUESTION)
    resolve("IMatchStateService").apply_attempt(stored)
    return stored


def candidates_of(attempt_id: int) -> List[Any]:
    return resolve("IMatchRepository").candidates_for(attempt_id)


def record_files(*checks: TrackFileStatus) -> None:
    with resolve("IDatabaseService").transaction():
        resolve("IFileStatusRepository").record(list(checks))


def ids_selection(*track_ids: int) -> Dict[str, Any]:
    return {"track_ids": list(track_ids)}


def browse_total(base: str, rules: Dict[str, Any]) -> int:
    payload = ok(
        get(
            base,
            "/api/v1/library/search",
            mode="browse",
            filters=json.dumps(rules),
            limit=1,
        )
    )
    return int(payload["total"])


def browse_ids(base: str, rules: Optional[Dict[str, Any]] = None) -> List[int]:
    params: Dict[str, Any] = {"mode": "browse", "fields": "id", "limit": 50000}
    if rules is not None:
        params["filters"] = json.dumps(rules)
    return list(ok(get(base, "/api/v1/library/search", **params))["track_ids"])


def rule(field: str, operator: str, value: Any = None) -> Dict[str, Any]:
    clause: Dict[str, Any] = {"field": field, "operator": operator}
    if value is not None:
        clause["value"] = value
    return {"match": "all", "rules": [clause]}


# ---------------------------------------------------------------- the wire


@pytest.mark.unit
class TestTheWire:
    def test_a_read_needs_the_token(self, engine):
        refused(
            call(engine, "GET", "/api/v1/clean/health", token=None),
            401,
            "UNAUTHORIZED",
        )

    def test_a_write_needs_the_token(self, engine):
        refused(
            call(engine, "POST", "/api/v1/clean/decide", {}, token="wrong"),
            401,
            "UNAUTHORIZED",
        )

    def test_a_path_under_clean_that_is_not_a_route(self, engine):
        refused(get(engine, "/api/v1/clean/nothing"), 404, "NOT_FOUND")

    def test_a_body_that_is_not_json(self, engine):
        refused(
            call(engine, "POST", "/api/v1/clean/decide", raw=b"{not json"),
            400,
            "INVALID_REQUEST",
            "Invalid JSON",
        )

    def test_a_body_that_is_not_an_object(self, engine):
        refused(
            post(engine, "/api/v1/clean/files/check", [1, 2]),
            400,
            "INVALID_REQUEST",
            "object",
        )

    def test_a_field_no_route_takes_is_named(self, engine):
        refused(
            post(
                engine,
                "/api/v1/clean/files/check",
                {"selection": {"track_ids": [1]}, "selecton": {}},
            ),
            400,
            "INVALID_REQUEST",
            "selecton",
        )

    def test_the_track_routes_that_existed_still_answer(self, engine):
        [track_id] = add_tracks(track("Existing"))
        assert ok(get(engine, f"/api/v1/library/tracks/{track_id}"))["track"]["id"] == (
            track_id
        )
        assert "changes" in ok(
            get(engine, f"/api/v1/library/tracks/{track_id}/history")
        )


# ----------------------------------------------------------------- matching


@pytest.mark.unit
class TestStartingAMatch:
    def test_a_selection_starts_a_job_with_its_counts(self, engine, store):
        ids = add_tracks(track("One"), track("Two"))

        payload = ok(
            post(engine, "/api/v1/clean/match", {"selection": ids_selection(*ids)}),
            202,
        )

        assert payload["planned"] == 2
        assert payload["selected"] == 2
        assert payload["excluded"] == 0
        assert payload["resumed_from"] is None
        assert payload["job_id"] == payload["id"]
        assert store.get(payload["job_id"]).type == "clean_match"
        assert finished(store, payload["job_id"]).state == JobState.SUCCEEDED

    def test_a_query_selection_is_accepted(self, engine, store):
        add_tracks(track("House one", genre="House"), track("Other", genre="Techno"))
        payload = ok(
            post(
                engine,
                "/api/v1/clean/match",
                {"selection": {"query": {"filters": rule("genre", "is", "House")}}},
            ),
            202,
        )
        assert payload["planned"] == 1
        finished(store, payload["job_id"])

    def test_settled_tracks_are_left_out_unless_rematch(self, engine, store):
        [track_id] = add_tracks(track("Decided"))
        stored = attempt(track_id, candidate(1))
        resolve("IMatchStateService").reject(track_id)
        body = {"selection": ids_selection(track_id)}

        refused(post(engine, "/api/v1/clean/match", body), 400, "INVALID_REQUEST")
        payload = ok(
            post(engine, "/api/v1/clean/match", {**body, "rematch": True}), 202
        )
        assert payload["planned"] == 1
        assert stored.id is not None
        finished(store, payload["job_id"])

    def test_rematch_must_be_a_boolean(self, engine):
        [track_id] = add_tracks(track("Flag"))
        refused(
            post(
                engine,
                "/api/v1/clean/match",
                {"selection": ids_selection(track_id), "rematch": "false"},
            ),
            400,
            "INVALID_REQUEST",
            "rematch",
        )

    def test_a_selection_of_nothing(self, engine):
        refused(
            post(engine, "/api/v1/clean/match", {"selection": {"track_ids": []}}),
            400,
            "INVALID_REQUEST",
        )

    def test_no_selection(self, engine):
        refused(
            post(engine, "/api/v1/clean/match", {}),
            400,
            "INVALID_REQUEST",
            "selection",
        )

    def test_a_second_match_is_refused_with_the_running_job(self, engine, store):
        [track_id] = add_tracks(track("Busy"))
        released = hold(store, "clean_match")
        try:
            error = refused(
                post(
                    engine,
                    "/api/v1/clean/match",
                    {"selection": ids_selection(track_id)},
                ),
                409,
                "LIBRARY_BUSY",
            )
            assert error["job_type"] == "clean_match"
            assert error["job_id"]
        finally:
            released.set()


@pytest.mark.unit
class TestResumingAMatch:
    def plan(self, ids: List[int], job_id: str = "interrupted") -> str:
        resolve("IMatchJobRepository").create(
            job_id, ids, rematch=False, selected=len(ids), created_at=NOW
        )
        return job_id

    def test_an_interrupted_job_is_listed_and_resumed(self, engine, store):
        ids = add_tracks(track("A"), track("B"), track("C"))
        job_id = self.plan(ids)
        resolve("IMatchJobRepository").mark_done(job_id, 0)

        listed = ok(get(engine, "/api/v1/clean/match/resumable"))
        assert listed["total"] == 1
        assert listed["jobs"][0] == {
            "job_id": job_id,
            "remaining": 2,
            "planned": 3,
            "selected": 3,
            "excluded": 0,
            "rematch": False,
            "created_at": NOW,
            "resumed_from": None,
        }

        payload = ok(
            post(engine, "/api/v1/clean/match/resume", {"job_id": job_id}), 202
        )
        assert payload["resumed_from"] == job_id
        assert payload["planned"] == 2
        finished(store, payload["job_id"])

    def test_an_unknown_job(self, engine):
        refused(
            post(engine, "/api/v1/clean/match/resume", {"job_id": "nope"}),
            404,
            "NOT_FOUND",
            "nope",
        )

    def test_a_job_with_nothing_left(self, engine):
        ids = add_tracks(track("Done"))
        job_id = self.plan(ids, "finished-job")
        resolve("IMatchJobRepository").mark_done(job_id, 0)
        refused(
            post(engine, "/api/v1/clean/match/resume", {"job_id": job_id}),
            400,
            "INVALID_REQUEST",
            "nothing left",
        )

    def test_a_job_id_that_is_not_text(self, engine):
        refused(
            post(engine, "/api/v1/clean/match/resume", {"job_id": 7}),
            400,
            "INVALID_REQUEST",
            "job_id",
        )


@pytest.mark.unit
class TestReadingMatches:
    def test_a_track_never_matched(self, engine):
        [track_id] = add_tracks(track("Never"))
        payload = ok(get(engine, f"/api/v1/library/tracks/{track_id}/matches"))
        assert payload == {
            "track_id": track_id,
            "state": {
                "track_id": track_id,
                "state": "not_matched",
                "decided_by": None,
                "attempt_id": None,
                "candidate_id": None,
                "newer_attempt_id": None,
                "disputed": False,
                "decided_at": None,
            },
            "candidate": None,
            "attempts": [],
            "total": 0,
        }

    def test_attempts_newest_first_with_the_state_and_its_candidate(self, engine):
        [track_id] = add_tracks(track("Twice"))
        first = attempt(track_id, candidate(1))
        second = attempt(track_id, candidate(2), candidate(3))

        payload = ok(get(engine, f"/api/v1/library/tracks/{track_id}/matches"))

        assert [row["id"] for row in payload["attempts"]] == [second.id, first.id]
        assert payload["total"] == 2
        assert payload["state"]["state"] == "needs_review"
        assert payload["state"]["attempt_id"] == second.id
        assert payload["candidate"]["id"] == payload["state"]["candidate_id"]
        assert payload["candidate"]["is_winner"] is True
        assert set(payload["attempts"][0]) == {
            "id",
            "track_id",
            "job_id",
            "outcome",
            "score",
            "best_candidate_id",
            "error",
            "input",
            "queries",
            "matcher_version",
            "started_at",
            "finished_at",
        }
        assert payload["attempts"][0]["input"]["title"] == "A Title"

    def test_an_unknown_track(self, engine):
        refused(
            get(engine, "/api/v1/library/tracks/99999/matches"), 404, "TRACK_NOT_FOUND"
        )

    def test_a_track_id_that_is_not_a_number(self, engine):
        refused(
            get(engine, "/api/v1/library/tracks/abc/matches"),
            400,
            "INVALID_REQUEST",
            "track id",
        )

    def test_a_user_decision_a_newer_attempt_disagrees_with_is_disputed(self, engine):
        [track_id] = add_tracks(track("Disputed"))
        first = attempt(track_id, candidate(1))
        resolve("IMatchStateService").accept(track_id, candidates_of(first.id)[0].id)
        newer = attempt(track_id, candidate(2))

        state = ok(get(engine, f"/api/v1/library/tracks/{track_id}/matches"))["state"]

        assert state["disputed"] is True
        assert state["newer_attempt_id"] == newer.id
        assert state["attempt_id"] == first.id
        assert (state["state"], state["decided_by"]) == ("accepted", "user")

    def test_candidates_ranked_rejected_ones_kept(self, engine):
        [track_id] = add_tracks(track("Ranked"))
        stored = attempt(
            track_id,
            candidate(1, score=85),
            candidate(2, score=40, guard_ok=False, reject_reason="artist_guard"),
        )

        payload = ok(get(engine, f"/api/v1/clean/attempts/{stored.id}/candidates"))

        assert payload["attempt_id"] == stored.id
        assert payload["track_id"] == track_id
        assert [row["rank"] for row in payload["candidates"]] == [0, 1]
        rejected = payload["candidates"][1]
        assert rejected["guard_ok"] is False
        assert rejected["reject_reason"] == "artist_guard"
        assert rejected["is_winner"] is False
        assert rejected["beatport_track_id"] == "2"

    def test_an_unknown_attempt(self, engine):
        refused(
            get(engine, "/api/v1/clean/attempts/424242/candidates"),
            404,
            "ATTEMPT_NOT_FOUND",
        )

    def test_an_attempt_id_that_is_not_a_number(self, engine):
        refused(
            get(engine, "/api/v1/clean/attempts/x/candidates"), 400, "INVALID_REQUEST"
        )


# ---------------------------------------------------------------- decisions


@pytest.mark.unit
class TestDecidingOneTrack:
    def test_accepting_a_candidate_that_did_not_win(self, engine):
        [track_id] = add_tracks(track("Second"))
        stored = attempt(track_id, candidate(1), candidate(2))
        runner_up = candidates_of(stored.id)[1]

        payload = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {
                    "decision": "accept",
                    "track_id": track_id,
                    "candidate_id": runner_up.id,
                },
            )
        )

        assert payload["match"]["state"] == "accepted"
        assert payload["match"]["decided_by"] == "user"
        assert payload["match"]["candidate_id"] == runner_up.id

    def test_reject_then_clear(self, engine):
        [track_id] = add_tracks(track("Back"))
        attempt(track_id, candidate(1))

        rejected = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "reject", "track_id": track_id},
            )
        )
        assert rejected["match"]["state"] == "rejected"

        cleared = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "clear", "track_id": track_id},
            )
        )
        assert cleared["match"]["state"] == "needs_review"
        assert cleared["match"]["decided_by"] == "auto"

    def test_clearing_a_track_never_answered_is_not_matched(self, engine):
        [track_id] = add_tracks(track("Unanswered"))
        cleared = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "clear", "track_id": track_id},
            )
        )
        assert cleared["match"]["state"] == "not_matched"

    @pytest.mark.parametrize(
        "body, word",
        [
            ({"decision": "accept"}, "candidate_id"),
            ({"decision": "reject", "candidate_id": 1}, "names no candidate"),
            ({"decision": "maybe"}, "decision"),
            ({"decision": "accept", "candidate_id": "1"}, "candidate_id"),
            ({"decision": "accept", "candidate_id": True}, "candidate_id"),
        ],
    )
    def test_a_decision_that_cannot_be_honoured(self, engine, body, word):
        [track_id] = add_tracks(track("Refused"))
        attempt(track_id, candidate(1))
        refused(
            post(engine, "/api/v1/clean/decide", {**body, "track_id": track_id}),
            400,
            "INVALID_REQUEST",
            word,
        )

    def test_another_tracks_candidate(self, engine):
        mine, theirs = add_tracks(track("Mine"), track("Theirs"))
        attempt(mine, candidate(1))
        other = attempt(theirs, candidate(2))
        refused(
            post(
                engine,
                "/api/v1/clean/decide",
                {
                    "decision": "accept",
                    "track_id": mine,
                    "candidate_id": candidates_of(other.id)[0].id,
                },
            ),
            400,
            "INVALID_REQUEST",
        )

    def test_an_unknown_track(self, engine):
        refused(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "reject", "track_id": 999999},
            ),
            404,
            "TRACK_NOT_FOUND",
        )

    def test_both_a_track_and_a_selection(self, engine):
        refused(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "reject", "track_id": 1, "selection": {"track_ids": [1]}},
            ),
            400,
            "INVALID_REQUEST",
            "not both",
        )

    def test_neither(self, engine):
        refused(
            post(engine, "/api/v1/clean/decide", {"decision": "reject"}),
            400,
            "INVALID_REQUEST",
            "not both or neither",
        )


@pytest.mark.unit
class TestDecidingASelection:
    def test_accepting_what_each_track_proposes_inline(self, engine):
        ids = add_tracks(track("P1"), track("P2"), track("P3"))
        for number, track_id in enumerate(ids):
            attempt(track_id, candidate(number))

        payload = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "accept", "selection": ids_selection(*ids)},
            )
        )

        assert payload["applied"]["operation"] == "accept_match"
        assert payload["applied"]["changed"] == 3
        states = ok(get(engine, f"/api/v1/library/tracks/{ids[0]}/matches"))["state"]
        assert (states["state"], states["decided_by"]) == ("accepted", "user")

    def test_above_the_threshold_it_is_a_job(self, engine, store, monkeypatch):
        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 1)
        ids = add_tracks(track("J1"), track("J2"))
        for number, track_id in enumerate(ids):
            attempt(track_id, candidate(number))

        payload = ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "reject", "selection": ids_selection(*ids)},
            ),
            202,
        )

        job = finished(store, payload["job_id"])
        assert job.state == JobState.SUCCEEDED
        assert job.result["changed"] == 2

    def test_clearing_a_selection_is_refused_with_the_way_to_do_it(self, engine):
        ids = add_tracks(track("C1"))
        refused(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "clear", "selection": ids_selection(*ids)},
            ),
            400,
            "INVALID_REQUEST",
            "revert",
        )

    def test_a_selection_names_no_candidate(self, engine):
        ids = add_tracks(track("N1"))
        refused(
            post(
                engine,
                "/api/v1/clean/decide",
                {
                    "decision": "accept",
                    "candidate_id": 1,
                    "selection": ids_selection(*ids),
                },
            ),
            400,
            "INVALID_REQUEST",
            "candidate_id",
        )


# ---------------------------------------------------- apply, edits, revert


def accepted_track(name: str) -> int:
    [track_id] = add_tracks(track(name, genre="Deep House", bpm=120.0))
    attempt(
        track_id,
        candidate(
            abs(hash(name)) % 100000,
            score=97,
            genre="Techno",
            key="A min",
            bpm="124",
            label="Drumcode",
        ),
    )
    state = resolve("IMatchRepository").get_match(track_id)
    assert state is not None and state.state == "accepted"
    return track_id


@pytest.mark.unit
class TestApplying:
    def test_one_track_answers_its_row(self, engine):
        track_id = accepted_track("Applied")

        row = ok(
            post(
                engine,
                "/api/v1/clean/apply",
                {"track_id": track_id, "fields": ["genre", "bpm"]},
            )
        )["track"]

        assert row["id"] == track_id
        assert row["genre"] == "Deep House"
        assert row["effective_genre"] == "Techno"
        assert row["effective_bpm"] == 124.0
        assert sorted(row["overridden"]) == ["bpm", "genre"]
        assert row["match_state"] == "accepted"

    def test_a_selection_applies_inline(self, engine):
        ids = [accepted_track("Sel1"), accepted_track("Sel2")]
        payload = ok(
            post(
                engine,
                "/api/v1/clean/apply",
                {"selection": ids_selection(*ids), "fields": ["label"]},
            )
        )
        assert payload["applied"]["operation"] == "apply_match"
        assert payload["applied"]["changed"] == 2

    def test_a_track_nobody_accepted(self, engine):
        [track_id] = add_tracks(track("Undecided"))
        refused(
            post(
                engine,
                "/api/v1/clean/apply",
                {"track_id": track_id, "fields": ["genre"]},
            ),
            400,
            "INVALID_REQUEST",
            "accepted",
        )

    @pytest.mark.parametrize("fields", [None, [], "genre", [1], ["colour"]])
    def test_fields_that_are_not_fields(self, engine, fields):
        track_id = accepted_track(f"Fields{fields!r}")
        body: Dict[str, Any] = {"track_id": track_id}
        if fields is not None:
            body["fields"] = fields
        refused(post(engine, "/api/v1/clean/apply", body), 400, "INVALID_REQUEST")


@pytest.mark.unit
class TestHandEdits:
    def path(self, track_id: Any) -> str:
        return f"/api/v1/library/tracks/{track_id}/overrides"

    def test_several_fields_at_once(self, engine):
        [track_id] = add_tracks(track("Edited", genre="House", bpm=122.0))

        row = ok(
            post(
                engine,
                self.path(track_id),
                {"bpm": 126, "genre": "Techno", "year": 2020},
            )
        )["track"]

        assert row["effective_bpm"] == 126
        assert row["effective_genre"] == "Techno"
        assert row["effective_year"] == 2020
        assert row["bpm"] == 122.0
        history = ok(get(engine, f"/api/v1/library/tracks/{track_id}/history"))[
            "changes"
        ]
        assert {change["field"] for change in history} == {
            "cuepoint_bpm",
            "cuepoint_genre",
            "cuepoint_year",
        }
        assert {change["source"] for change in history} == {"cuepoint"}

    def test_null_clears_and_the_import_shows_through(self, engine):
        [track_id] = add_tracks(track("Cleared", genre="House"))
        ok(post(engine, self.path(track_id), {"genre": "Techno"}))
        row = ok(post(engine, self.path(track_id), {"genre": None}))["track"]
        assert row["effective_genre"] == "House"
        assert row["overridden"] == []

    def test_a_refused_value_writes_none_of_the_request(self, engine):
        [track_id] = add_tracks(track("Atomic", genre="House"))
        refused(
            post(engine, self.path(track_id), {"genre": "Techno", "bpm": 900}),
            400,
            "INVALID_REQUEST",
            "bpm",
        )
        row = ok(get(engine, f"/api/v1/library/tracks/{track_id}"))["track"]
        assert row["effective_genre"] == "House"
        assert (
            ok(get(engine, f"/api/v1/library/tracks/{track_id}/history"))["changes"]
            == []
        )

    def test_a_field_that_cannot_be_overridden(self, engine):
        [track_id] = add_tracks(track("Colour"))
        refused(
            post(engine, self.path(track_id), {"colour": "red"}),
            400,
            "INVALID_REQUEST",
            "colour",
        )

    def test_nothing_to_set(self, engine):
        [track_id] = add_tracks(track("Empty"))
        refused(post(engine, self.path(track_id), {}), 400, "INVALID_REQUEST")

    def test_an_unknown_track(self, engine):
        refused(post(engine, self.path(99999), {"genre": "x"}), 404, "TRACK_NOT_FOUND")

    def test_a_track_id_that_is_not_a_number(self, engine):
        refused(
            post(engine, self.path("seven"), {"genre": "x"}), 400, "INVALID_REQUEST"
        )


@pytest.mark.unit
class TestReverting:
    def changes(self, base: str, track_id: int) -> List[Dict[str, Any]]:
        return ok(get(base, f"/api/v1/library/tracks/{track_id}/history"))["changes"]

    def test_one_change(self, engine):
        [track_id] = add_tracks(track("Revert", genre="House"))
        ok(
            post(
                engine,
                f"/api/v1/library/tracks/{track_id}/overrides",
                {"genre": "Techno"},
            )
        )
        [change] = self.changes(engine, track_id)

        payload = ok(
            post(engine, "/api/v1/library/revert", {"change_id": change["id"]})
        )

        assert payload["revert"] == {
            "change_id": change["id"],
            "track_id": track_id,
            "field": "cuepoint_genre",
            "previous_value": "Techno",
            "restored_value": None,
            "changed": True,
        }
        row = ok(get(engine, f"/api/v1/library/tracks/{track_id}"))["track"]
        assert row["effective_genre"] == "House"

    def test_a_change_made_stale_by_a_later_one(self, engine):
        [track_id] = add_tracks(track("Stale"))
        path = f"/api/v1/library/tracks/{track_id}/overrides"
        ok(post(engine, path, {"genre": "First"}))
        ok(post(engine, path, {"genre": "Second"}))
        earlier = self.changes(engine, track_id)[-1]

        error = refused(
            post(engine, "/api/v1/library/revert", {"change_id": earlier["id"]}),
            409,
            "REVERT_STALE",
            "Second",
        )
        assert error["change_id"] == earlier["id"]

    def test_an_unknown_change(self, engine):
        refused(
            post(engine, "/api/v1/library/revert", {"change_id": 987654}),
            400,
            "INVALID_REQUEST",
            "987654",
        )

    def test_a_change_id_that_is_not_a_number(self, engine):
        refused(
            post(engine, "/api/v1/library/revert", {"change_id": "1"}),
            400,
            "INVALID_REQUEST",
            "change_id",
        )

    def test_a_batch_inline(self, engine):
        ids = add_tracks(track("R1"), track("R2"))
        applied = ok(
            post(
                engine,
                "/api/v1/library/batch",
                {
                    "selection": ids_selection(*ids),
                    "operation": {"kind": "set_rating", "value": 4},
                },
            )
        )["applied"]

        payload = ok(
            post(
                engine,
                "/api/v1/library/revert/batch",
                {"batch_id": applied["batch_id"]},
            )
        )

        assert payload["reverted"]["revert_of"] == applied["batch_id"]
        assert payload["reverted"]["changed"] == 2
        assert payload["reverted"]["skipped"] == 0

    def test_a_batch_above_the_threshold_is_a_job(self, engine, store, monkeypatch):
        ids = add_tracks(track("B1"), track("B2"), track("B3"))
        applied = ok(
            post(
                engine,
                "/api/v1/library/batch",
                {
                    "selection": ids_selection(*ids),
                    "operation": {"kind": "set_favorite", "value": True},
                },
            )
        )["applied"]
        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 1)

        payload = ok(
            post(
                engine,
                "/api/v1/library/revert/batch",
                {"batch_id": applied["batch_id"]},
            ),
            202,
        )

        job = finished(store, payload["job_id"])
        assert job.state == JobState.SUCCEEDED
        assert job.result["revert_of"] == applied["batch_id"]

    def test_an_unknown_batch(self, engine):
        refused(
            post(engine, "/api/v1/library/revert/batch", {"batch_id": "not-a-batch"}),
            400,
            "INVALID_REQUEST",
        )


# --------------------------------------------- files, duplicates, artwork


@pytest.mark.unit
class TestFileChecks:
    def test_a_selection_is_checked_and_its_rows_say_so(self, engine, store):
        ids = add_tracks(track("Gone1"), track("Gone2"))

        payload = ok(
            post(
                engine, "/api/v1/clean/files/check", {"selection": ids_selection(*ids)}
            ),
            202,
        )

        assert payload["tracks"] == 2
        assert finished(store, payload["job_id"]).state == JobState.SUCCEEDED
        row = ok(get(engine, f"/api/v1/library/tracks/{ids[0]}"))["track"]
        assert row["file_status"] == "missing"

    def test_nothing_to_check(self, engine):
        refused(
            post(engine, "/api/v1/clean/files/check", {"selection": {"track_ids": []}}),
            400,
            "INVALID_REQUEST",
        )


@pytest.mark.unit
class TestDuplicates:
    def scanned(self, base: str, store: JobStore) -> List[int]:
        ids = add_tracks(
            track("Same", title="Same Song", duration_seconds=300),
            track("Same too", title="Same Song", duration_seconds=301),
            track("Different", title="Another Song", duration_seconds=300),
        )
        payload = ok(
            post(base, "/api/v1/clean/duplicates/scan", {"signals": ["text"]}), 202
        )
        assert payload["signals"] == ["text"]
        assert finished(store, payload["job_id"]).state == JobState.SUCCEEDED
        return ids

    def test_scan_list_dismiss_and_restore(self, engine, store):
        ids = self.scanned(engine, store)

        listed = ok(get(engine, "/api/v1/clean/duplicates"))
        assert listed["total"] == 1
        [group] = listed["groups"]
        assert group["signal"] == "text"
        assert group["track_ids"] == sorted(ids[:2])
        assert group["dismissed"] is False

        dismissed = ok(
            post(engine, "/api/v1/clean/duplicates/dismiss", {"group_id": group["id"]})
        )
        assert dismissed["group"]["dismissed"] is True
        assert ok(get(engine, "/api/v1/clean/duplicates"))["total"] == 0
        assert (
            ok(get(engine, "/api/v1/clean/duplicates", include_dismissed="true"))[
                "total"
            ]
            == 1
        )

        refused(
            post(engine, "/api/v1/clean/duplicates/dismiss", {"group_id": group["id"]}),
            400,
            "INVALID_REQUEST",
            "already",
        )

        restored = ok(
            post(engine, "/api/v1/clean/duplicates/restore", {"group_id": group["id"]})
        )
        assert restored["group"]["dismissed"] is False
        assert ok(get(engine, "/api/v1/clean/duplicates", signal="text"))["total"] == 1

    def test_every_signal_when_none_are_named(self, engine, store):
        payload = ok(post(engine, "/api/v1/clean/duplicates/scan", {}), 202)
        assert payload["signals"] == ["path", "beatport", "text"]
        finished(store, payload["job_id"])

    def test_an_unknown_group(self, engine):
        refused(
            post(engine, "/api/v1/clean/duplicates/restore", {"group_id": 4242}),
            404,
            "NOT_FOUND",
        )

    @pytest.mark.parametrize(
        "params",
        [{"signal": "colour"}, {"include_dismissed": "maybe"}],
    )
    def test_a_listing_that_cannot_be_honoured(self, engine, params):
        refused(
            get(engine, "/api/v1/clean/duplicates", **params), 400, "INVALID_REQUEST"
        )

    @pytest.mark.parametrize("signals", ["text", ["colour"], [1]])
    def test_signals_that_are_not_signals(self, engine, signals):
        refused(
            post(engine, "/api/v1/clean/duplicates/scan", {"signals": signals}),
            400,
            "INVALID_REQUEST",
        )


@pytest.mark.unit
class TestArtworkScans:
    def test_a_selection_is_scanned(self, engine, store):
        ids = add_tracks(track("Art"))
        payload = ok(
            post(
                engine, "/api/v1/clean/artwork/scan", {"selection": ids_selection(*ids)}
            ),
            202,
        )
        assert payload["tracks"] == 1
        assert payload["fetch_beatport"] is False
        finished(store, payload["job_id"])

    def test_fetching_beatport_must_be_a_boolean(self, engine):
        ids = add_tracks(track("ArtFlag"))
        refused(
            post(
                engine,
                "/api/v1/clean/artwork/scan",
                {"selection": ids_selection(*ids), "fetch_beatport": "yes"},
            ),
            400,
            "INVALID_REQUEST",
            "fetch_beatport",
        )

    def test_refused_beside_a_file_check(self, engine, store):
        ids = add_tracks(track("ArtBusy"))
        released = hold(store, "file_check")
        try:
            error = refused(
                post(
                    engine,
                    "/api/v1/clean/artwork/scan",
                    {"selection": ids_selection(*ids)},
                ),
                409,
                "LIBRARY_BUSY",
            )
            assert error["job_type"] == "file_check"
        finally:
            released.set()


# --------------------------------------------------------------- tag writes


KEY_ONLY = {"write_year": False, "write_label": False, "write_comment": False}


@pytest.fixture
def audio(tmp_path) -> List[int]:
    """Three real MP3s keyed Am, each checked present at its path."""
    paths = [
        audio_copy(tmp_path / "music", "mp3", f"song{number}.mp3")
        for number in range(3)
    ]
    ids = add_tracks(
        *[
            track(f"Song{number}", file_path=str(path), key="Am")
            for number, path in enumerate(paths)
        ]
    )
    record_files(
        *[
            TrackFileStatus(track_id, FILE_PRESENT, str(path), NOW, path.stat().st_size)
            for track_id, path in zip(ids, paths)
        ]
    )
    return ids


@pytest.mark.unit
class TestTagWrites:
    def preview(self, base: str, ids: List[int]) -> Dict[str, Any]:
        return ok(
            post(
                base,
                "/api/v1/clean/tags/preview",
                {"selection": ids_selection(*ids), "options": KEY_ONLY},
            )
        )["preview"]

    def written(self, base: str, store: JobStore, ids: List[int]) -> str:
        preview = self.preview(base, ids)
        started = ok(
            post(
                base, "/api/v1/clean/tags/write", {"preview_id": preview["preview_id"]}
            ),
            202,
        )
        assert started["preview_id"] == preview["preview_id"]
        job = finished(store, started["job_id"])
        assert job.state == JobState.SUCCEEDED, job.error
        return str(started["job_id"])

    def test_a_preview_answered_inline(self, engine, audio):
        preview = self.preview(engine, audio)
        assert preview["total"] == 3
        assert preview["files"] == 3
        assert preview["fields"]["key"] == 3
        assert preview["options"]["write_comment"] is False
        assert preview["options"]["embed_missing_artwork"] is False

    def test_a_preview_answered_as_a_job_keeps_the_jobs_id(
        self, engine, store, audio, monkeypatch
    ):
        monkeypatch.setattr(tag_write_jobs, "BATCH_JOB_THRESHOLD", 0)

        started = ok(
            post(
                engine,
                "/api/v1/clean/tags/preview",
                {"selection": ids_selection(*audio), "options": KEY_ONLY},
            ),
            202,
        )

        assert started["preview_id"] == started["job_id"]
        job = finished(store, started["job_id"])
        assert job.state == JobState.SUCCEEDED
        assert job.result["preview_id"] == started["job_id"]
        results = ok(get(engine, f"/api/v1/jobs/{started['job_id']}/results"))
        assert results["result"]["files"] == 3

    @pytest.mark.parametrize(
        "options, word",
        [
            ({"write_genre": "false"}, "write_genre"),
            ({"write_colour": True}, "write_colour"),
            ({"key_format": "open"}, "key_format"),
            ("everything", "options"),
        ],
    )
    def test_options_that_are_not_options(self, engine, audio, options, word):
        refused(
            post(
                engine,
                "/api/v1/clean/tags/preview",
                {"selection": ids_selection(*audio), "options": options},
            ),
            400,
            "INVALID_REQUEST",
            word,
        )

    def test_a_write_by_preview_id_is_refused_the_second_time(
        self, engine, store, audio
    ):
        preview = self.preview(engine, audio)
        first = ok(
            post(
                engine,
                "/api/v1/clean/tags/write",
                {"preview_id": preview["preview_id"]},
            ),
            202,
        )
        finished(store, first["job_id"])

        error = refused(
            post(
                engine,
                "/api/v1/clean/tags/write",
                {"preview_id": preview["preview_id"]},
            ),
            404,
            "TAG_WRITE_PREVIEW_NOT_FOUND",
            "preview again",
        )
        assert error["preview_id"] == preview["preview_id"]

    def test_an_unknown_preview(self, engine):
        refused(
            post(engine, "/api/v1/clean/tags/write", {"preview_id": "never-made"}),
            404,
            "TAG_WRITE_PREVIEW_NOT_FOUND",
        )

    def test_the_record_of_a_write_and_its_restore_by_job(self, engine, store, audio):
        job_id = self.written(engine, store, audio)

        record = ok(get(engine, "/api/v1/clean/tags/writes", job_id=job_id))
        assert record["total"] == 3
        assert record["unconfirmed"] == 0
        assert record["restorable"] == 3
        assert {row["field"] for row in record["writes"]} == {"key"}
        assert all(row["pending"] is False for row in record["writes"])
        assert set(record["writes"][0]) == {
            "id",
            "job_id",
            "track_id",
            "file_path",
            "field",
            "old_value",
            "old_value_read",
            "new_value",
            "outcome",
            "reason",
            "written_at",
            "pending",
            "restore_of",
        }

        started = ok(
            post(engine, "/api/v1/clean/tags/restore", {"job_id": job_id}), 202
        )
        assert started["writes"] == 3
        assert started["unconfirmed"] == 0
        assert started["restored_job_id"] == job_id
        assert finished(store, started["job_id"]).state == JobState.SUCCEEDED

        after = ok(get(engine, "/api/v1/clean/tags/writes", job_id=job_id))
        assert after["restorable"] == 0

    def test_a_restore_by_track(self, engine, store, audio):
        self.written(engine, store, audio)
        started = ok(
            post(engine, "/api/v1/clean/tags/restore", {"track_id": audio[1]}), 202
        )
        assert started["writes"] == 1
        assert started["track_id"] == audio[1]
        finished(store, started["job_id"])
        track_record = ok(get(engine, "/api/v1/clean/tags/writes", track_id=audio[1]))
        assert track_record["restorable"] == 0
        assert track_record["total"] == 2

    def test_a_write_interrupted_after_its_record_shows_unconfirmed_rows(
        self, engine, store, audio
    ):
        job_id = self.written(engine, store, audio)
        # What an engine killed between recording and confirming leaves behind.
        with resolve("IDatabaseService").transaction() as connection:
            connection.execute(
                "UPDATE file_writes SET pending = 1 WHERE job_id = ?", (job_id,)
            )

        record = ok(get(engine, "/api/v1/clean/tags/writes", job_id=job_id))
        assert record["unconfirmed"] == 3
        assert record["restorable_unconfirmed"] == 3
        assert all(row["pending"] is True for row in record["writes"])

        started = ok(
            post(engine, "/api/v1/clean/tags/restore", {"job_id": job_id}), 202
        )
        assert started["writes"] == 3
        assert started["unconfirmed"] == 3
        assert finished(store, started["job_id"]).state == JobState.SUCCEEDED

    def test_the_record_is_paged(self, engine, store, audio):
        job_id = self.written(engine, store, audio)
        page = ok(
            get(engine, "/api/v1/clean/tags/writes", job_id=job_id, limit=1, offset=1)
        )
        assert len(page["writes"]) == 1
        assert page["total"] == 3
        assert (page["limit"], page["offset"]) == (1, 1)
        everything = ok(get(engine, "/api/v1/clean/tags/writes", job_id=job_id))
        assert page["writes"][0] == everything["writes"][1]

    @pytest.mark.parametrize(
        "params",
        [
            {},
            {"job_id": "x", "track_id": 1},
            {"track_id": "one"},
            {"job_id": "x", "limit": "all"},
        ],
    )
    def test_a_record_that_cannot_be_read(self, engine, params):
        refused(
            get(engine, "/api/v1/clean/tags/writes", **params), 400, "INVALID_REQUEST"
        )

    @pytest.mark.parametrize(
        "body, status",
        [
            ({}, 400),
            ({"job_id": "x", "track_id": 1}, 400),
            ({"job_id": "nothing-written"}, 400),
        ],
    )
    def test_a_restore_that_cannot_be_honoured(self, engine, body, status):
        refused(
            post(engine, "/api/v1/clean/tags/restore", body), status, "INVALID_REQUEST"
        )

    def test_a_preview_is_refused_beside_a_running_tag_write(
        self, engine, store, audio
    ):
        released = hold(store, "tag_write")
        try:
            error = refused(
                post(
                    engine,
                    "/api/v1/clean/tags/preview",
                    {"selection": ids_selection(*audio), "options": KEY_ONLY},
                ),
                409,
                "LIBRARY_BUSY",
            )
            assert error["job_type"] == "tag_write"
        finally:
            released.set()


# ---------------------------------------------------------- health and rows


@pytest.fixture
def troubled(engine, tmp_path) -> Dict[str, int]:
    """A library holding every problem Health counts, each on its own track."""
    present = tmp_path / "present.mp3"
    present.write_bytes(b"not really audio")
    ids = add_tracks(
        track("Missing"),
        track("Unreadable", key="Am", bpm=120.0, genre="House"),
        track(
            "Dup A",
            title="Twin",
            duration_seconds=240,
            key="Am",
            bpm=120.0,
            genre="House",
        ),
        track(
            "Dup B",
            title="Twin",
            duration_seconds=241,
            key="Am",
            bpm=120.0,
            genre="House",
        ),
        track("Review", key="Am", bpm=120.0, genre="House"),
        track("Disputed", key="Am", bpm=120.0, genre="House"),
        track("Accepted", key="Am", bpm=120.0, genre="House"),
        track("No art", file_path=str(present), key="Am", bpm=120.0, genre="House"),
    )
    names = dict(
        zip(
            [
                "missing",
                "unreadable",
                "dup_a",
                "dup_b",
                "review",
                "disputed",
                "accepted",
                "no_art",
            ],
            ids,
        )
    )
    record_files(
        TrackFileStatus(names["missing"], FILE_MISSING, "/music/Missing.mp3", NOW),
        TrackFileStatus(
            names["unreadable"], FILE_UNREADABLE, "/music/Unreadable.mp3", NOW
        ),
        TrackFileStatus(names["no_art"], FILE_PRESENT, str(present), NOW, 16),
    )
    attempt(names["review"], candidate(10))
    first = attempt(names["disputed"], candidate(20))
    resolve("IMatchStateService").accept(
        names["disputed"], candidates_of(first.id)[0].id
    )
    attempt(names["disputed"], candidate(21))
    attempt(names["accepted"], candidate(30, score=97))
    # A user's decision no newer attempt disputes: decided by a person, and so
    # the track that tells "disputed" apart from "decided by a user".
    [rejected] = add_tracks(track("Rejected", key="Am", bpm=120.0, genre="House"))
    attempt(rejected, candidate(40))
    resolve("IMatchStateService").reject(rejected)
    names["rejected"] = rejected
    with resolve("IDatabaseService").transaction():
        resolve("IArtworkRepository").record_embedded(
            [EmbeddedRecord(names["no_art"], "none", None, NOW, str(present))]
        )
    resolve("IDuplicateService").scan(["text"])
    return names


@pytest.mark.unit
class TestHealth:
    def test_every_count_equals_the_librarys_count_of_its_rules(self, engine, troubled):
        report = ok(get(engine, "/api/v1/clean/health"))

        assert report["track_count"] == len(troubled)
        assert [count["id"] for count in report["counts"]] == [
            health.id for health in HEALTH_RULES
        ]
        for count in report["counts"]:
            assert count["count"] > 0, count
            assert browse_total(engine, count["rules"]) == count["count"], count

    def test_each_count_finds_the_track_it_is_about(self, engine, troubled):
        counts = {c["id"]: c for c in ok(get(engine, "/api/v1/clean/health"))["counts"]}
        expected = {
            "missing_files": {troubled["missing"], troubled["unreadable"]},
            "duplicates": {troubled["dup_a"], troubled["dup_b"]},
            "needs_review": {troubled["review"]},
            "disputed": {troubled["disputed"]},
            "missing_key": {troubled["missing"]},
            "missing_bpm": {troubled["missing"]},
            "missing_genre": {troubled["missing"]},
            "no_artwork": {troubled["no_art"]},
        }
        for health_id, track_ids in expected.items():
            assert set(browse_ids(engine, counts[health_id]["rules"])) == track_ids, (
                health_id
            )
        assert troubled["accepted"] not in browse_ids(
            engine, counts["not_matched"]["rules"]
        )

    def test_a_key_edited_in_is_no_longer_missing(self, engine, troubled):
        before = {
            c["id"]: c["count"]
            for c in ok(get(engine, "/api/v1/clean/health"))["counts"]
        }
        ok(
            post(
                engine,
                f"/api/v1/library/tracks/{troubled['missing']}/overrides",
                {"key": "8A"},
            )
        )
        after = {
            c["id"]: c["count"]
            for c in ok(get(engine, "/api/v1/clean/health"))["counts"]
        }
        assert after["missing_key"] == before["missing_key"] - 1
        assert after["missing_bpm"] == before["missing_bpm"]

    def test_the_shape(self, engine, troubled):
        report = ok(get(engine, "/api/v1/clean/health"))
        assert set(report) == {"track_count", "counts"}
        assert set(report["counts"][0]) == {"id", "label", "count", "rules"}
        assert report["counts"][0]["rules"]["match"] == "all"

    def test_an_empty_library_counts_nothing(self, engine):
        report = ok(get(engine, "/api/v1/clean/health"))
        assert report["track_count"] == 0
        assert {count["count"] for count in report["counts"]} == {0}


@pytest.mark.unit
class TestRowsSayWhatTheirFiltersFind:
    @pytest.mark.parametrize(
        "field, values",
        [
            ("match_state", ["not_matched", "needs_review", "accepted"]),
            ("file_status", ["missing", "unreadable", "present", "not_checked"]),
            ("artwork", ["none", "unknown"]),
        ],
    )
    def test_a_rows_value_is_the_one_its_filter_selects(
        self, engine, troubled, field, values
    ):
        rows = ok(get(engine, "/api/v1/library/search", mode="browse", limit=100))[
            "tracks"
        ]
        for value in values:
            marked = {row["id"] for row in rows if row[field] == value}
            assert marked, (field, value)
            assert set(browse_ids(engine, rule(field, "is", value))) == marked, (
                field,
                value,
            )

    def test_the_dispute_flag(self, engine, troubled):
        rows = ok(get(engine, "/api/v1/library/search", mode="browse", limit=100))[
            "tracks"
        ]
        marked = {row["id"] for row in rows if row["match_disputed"] is True}
        assert marked == {troubled["disputed"]}
        assert set(browse_ids(engine, rule("match_disputed", "is", True))) == marked
        assert all(isinstance(row["match_disputed"], bool) for row in rows)

    def test_global_search_and_the_inspector_carry_them_too(self, engine, troubled):
        found = ok(get(engine, "/api/v1/library/search", q="Review"))["tracks"]
        assert found[0]["match_state"] == "needs_review"
        detail = ok(get(engine, f"/api/v1/library/tracks/{troubled['missing']}"))[
            "track"
        ]
        assert detail["file_status"] == "missing"
        assert detail["match_disputed"] is False


# ------------------------------------------------------------------- export


@pytest.mark.unit
class TestExportingAReviewList:
    def body(self, path: Path, ids: List[int], **extra: Any) -> Dict[str, Any]:
        return {
            "selection": ids_selection(*ids),
            "format": "csv",
            "file_path": str(path),
            **extra,
        }

    def test_a_csv_of_states_and_decided_candidates(self, engine, troubled, tmp_path):
        target = tmp_path / "review.csv"
        ids = [troubled["accepted"], troubled["review"], troubled["missing"]]

        payload = ok(post(engine, "/api/v1/clean/export", self.body(target, ids)))

        assert payload["count"] == 3
        assert payload["format"] == "csv"
        assert payload["columns"] == list(REVIEW_COLUMNS)
        with open(target, newline="", encoding="utf-8-sig") as handle:
            header = next(csv.reader(handle))
        # A public shape, spelled out: a column may be added at the end, and a
        # rename or a reordering has to fail here rather than in a spreadsheet.
        assert header == [
            "track_id",
            "artist",
            "title",
            "remixer",
            "album",
            "key",
            "bpm",
            "genre",
            "label",
            "year",
            "file_path",
            "match_state",
            "match_decided_by",
            "match_disputed",
            "match_score",
            "match_decided_at",
            "candidate_beatport_track_id",
            "candidate_url",
            "candidate_title",
            "candidate_artists",
            "candidate_remixers",
            "candidate_label",
            "candidate_genre",
            "candidate_key",
            "candidate_bpm",
            "candidate_release_name",
            "candidate_release_date",
            "candidate_release_year",
        ]
        with open(target, newline="", encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
        assert [int(row["track_id"]) for row in rows] == ids
        assert rows[0]["match_state"] == "accepted"
        assert rows[0]["match_disputed"] == "false"
        assert rows[0]["match_decided_by"] == "auto"
        assert rows[0]["candidate_url"].endswith("/30")
        assert rows[1]["match_state"] == "needs_review"
        assert rows[2]["match_state"] == "not_matched"
        assert rows[2]["candidate_url"] == ""

    @pytest.mark.parametrize(
        "file_format, suffix",
        [("json", ".json"), ("excel", ".xlsx"), ("xlsx", ".xlsx")],
    )
    def test_json_and_excel(self, engine, troubled, tmp_path, file_format, suffix):
        target = tmp_path / f"review{suffix}"
        payload = ok(
            post(
                engine,
                "/api/v1/clean/export",
                self.body(target, [troubled["accepted"]], format=file_format),
            )
        )
        assert payload["count"] == 1
        assert target.stat().st_size > 0

    def test_an_existing_file_is_replaced_only_when_asked(
        self, engine, troubled, tmp_path
    ):
        target = tmp_path / "review.csv"
        target.write_text("mine", encoding="utf-8")
        body = self.body(target, [troubled["accepted"]])

        error = refused(
            post(engine, "/api/v1/clean/export", body), 409, "EXPORT_FILE_EXISTS"
        )
        assert error["file_path"] == str(target)
        assert target.read_text(encoding="utf-8") == "mine"

        ok(post(engine, "/api/v1/clean/export", {**body, "overwrite": True}))
        assert target.read_text(encoding="utf-8-sig").startswith("track_id,")

    @pytest.mark.parametrize(
        "change, word",
        [
            ({"file_path": "review.csv"}, "absolute"),
            ({"format": "json"}, ".json"),
            ({"format": "pdf"}, "format"),
            ({"overwrite": "yes"}, "overwrite"),
            ({"selection": {"track_ids": []}}, ""),
        ],
    )
    def test_an_export_that_cannot_be_honoured(
        self, engine, troubled, tmp_path, change, word
    ):
        body = {**self.body(tmp_path / "review.csv", [troubled["accepted"]]), **change}
        refused(
            post(engine, "/api/v1/clean/export", body), 400, "INVALID_REQUEST", word
        )
        assert not (tmp_path / "review.csv").exists()
