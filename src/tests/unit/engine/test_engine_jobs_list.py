#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Listing jobs over the engine API (SHELL-07, DEC-026).

Before this, a caller could only ask about a job whose id it already had, so
nothing could report on a job it had not started itself — including one that
outlived a renderer reload, which is exactly what the status strip has to show.

The merge is what these tests are mostly about: the in-memory store is live but
forgets everything on restart, the repository survives but samples progress at
most once a second, and neither alone answers "what is happening right now".
"""

from __future__ import annotations

import json
import socket
import threading
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.jobs_api import LIST_LIMIT_MAX, list_jobs
from cuepoint.engine.server import EngineConfig, get_job_store, start_engine_thread
from cuepoint.persistence.job_repository import JobRecord
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "jobs-list-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _get(url: str, token: str | None = TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=headers, method="GET"), timeout=5
    )


def _get_json(base: str, query: str) -> dict:
    with _get(f"{base}{query}") as resp:
        payload: dict = json.loads(resp.read().decode("utf-8"))
    return payload


def _start_held_job(store):
    """Start a real job that stays running until the returned event is set.

    `create_match_job` runs its runner on a thread immediately, so a no-op
    runner would finish before the request under test could see it.
    """
    release = threading.Event()
    job = store.create_match_job(
        xml_path=None,
        playlist_name=None,
        demo=True,
        runner=lambda _job: release.wait(timeout=5),
    )
    return job, release


class _FakeJob:
    """Stands in for a MatchJob: the API only reads `to_status_dict`."""

    def __init__(self, job_id: str, state: str, created_at: str, progress=None):
        self.id = job_id
        self._payload = {
            "id": job_id,
            "state": state,
            "created_at": created_at,
            "updated_at": created_at,
            "demo": False,
        }
        if progress is not None:
            self._payload["progress"] = progress

    def to_status_dict(self):
        return dict(self._payload)


class _FakeStore:
    def __init__(self, jobs):
        self._jobs = jobs

    def list_all(self):
        return list(self._jobs)


@pytest.mark.unit
class TestMerging:
    def test_reports_jobs_only_the_repository_knows(self, monkeypatch):
        # The DEC-007 case: the engine restarted, so the in-memory store is
        # empty, but the record survived.
        record = JobRecord(
            id="old-job",
            type="match",
            state="running",
            demo=False,
            progress={"completed": 3, "total": 10},
            error=None,
            created_at="2026-09-02T10:00:00Z",
            updated_at="2026-09-02T10:00:05Z",
        )
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository",
            lambda: type("R", (), {"list_recent": lambda self, limit: [record]})(),
        )

        payload = list_jobs(job_store=_FakeStore([]))

        assert [job["id"] for job in payload["jobs"]] == ["old-job"]
        assert payload["jobs"][0]["type"] == "match"

    def test_live_progress_wins_over_the_sampled_copy(self, monkeypatch):
        # Persisted progress lags by up to a second by design (FOUNDATION-07),
        # so a strip showing the stored number would visibly stutter.
        record = JobRecord(
            id="job-1",
            type="match",
            state="running",
            demo=False,
            progress={"completed": 1, "total": 10},
            error=None,
            created_at="2026-09-02T10:00:00Z",
            updated_at="2026-09-02T10:00:00Z",
        )
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository",
            lambda: type("R", (), {"list_recent": lambda self, limit: [record]})(),
        )
        live = _FakeJob(
            "job-1",
            "running",
            "2026-09-02T10:00:00Z",
            progress={"completed": 9, "total": 10},
        )

        payload = list_jobs(job_store=_FakeStore([live]))

        assert len(payload["jobs"]) == 1
        assert payload["jobs"][0]["progress"]["completed"] == 9

    def test_keeps_the_persisted_type_for_a_live_job(self, monkeypatch):
        # The in-memory job has no type column; the table's discriminator does.
        record = JobRecord(
            id="job-1",
            type="import",
            state="running",
            demo=False,
            progress=None,
            error=None,
            created_at="2026-09-02T10:00:00Z",
            updated_at="2026-09-02T10:00:00Z",
        )
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository",
            lambda: type("R", (), {"list_recent": lambda self, limit: [record]})(),
        )

        payload = list_jobs(
            job_store=_FakeStore([_FakeJob("job-1", "running", "2026-09-02T10:00:00Z")])
        )

        assert payload["jobs"][0]["type"] == "import"

    def test_works_without_a_repository(self, monkeypatch):
        # Persistence is best-effort; losing it must not lose the live jobs.
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository", lambda: None
        )

        payload = list_jobs(
            job_store=_FakeStore([_FakeJob("job-1", "running", "2026-09-02T10:00:00Z")])
        )

        assert [job["id"] for job in payload["jobs"]] == ["job-1"]

    def test_survives_a_repository_that_raises(self, monkeypatch):
        class Broken:
            def list_recent(self, limit):
                raise RuntimeError("database gone")

        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository", lambda: Broken()
        )

        payload = list_jobs(
            job_store=_FakeStore([_FakeJob("job-1", "running", "2026-09-02T10:00:00Z")])
        )

        assert [job["id"] for job in payload["jobs"]] == ["job-1"]


@pytest.mark.unit
class TestFilteringAndOrdering:
    @pytest.fixture(autouse=True)
    def no_repository(self, monkeypatch):
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository", lambda: None
        )

    def test_active_excludes_finished_jobs(self):
        store = _FakeStore(
            [
                _FakeJob("a", "running", "2026-09-02T10:00:00Z"),
                _FakeJob("b", "queued", "2026-09-02T10:00:01Z"),
                _FakeJob("c", "succeeded", "2026-09-02T10:00:02Z"),
                _FakeJob("d", "failed", "2026-09-02T10:00:03Z"),
                _FakeJob("e", "cancelled", "2026-09-02T10:00:04Z"),
            ]
        )

        assert {job["id"] for job in list_jobs(job_store=store)["jobs"]} == {"a", "b"}

    def test_all_includes_finished_jobs(self):
        store = _FakeStore(
            [
                _FakeJob("a", "running", "2026-09-02T10:00:00Z"),
                _FakeJob("c", "succeeded", "2026-09-02T10:00:02Z"),
            ]
        )

        assert len(list_jobs(state="all", job_store=store)["jobs"]) == 2

    def test_active_count_ignores_the_filter_and_the_limit(self):
        # So a strip showing one job can still say how many are running.
        store = _FakeStore(
            [
                _FakeJob("a", "running", "2026-09-02T10:00:00Z"),
                _FakeJob("b", "running", "2026-09-02T10:00:01Z"),
                _FakeJob("c", "succeeded", "2026-09-02T10:00:02Z"),
            ]
        )

        assert list_jobs(limit=1, job_store=store)["active_count"] == 2

    def test_orders_newest_first(self):
        store = _FakeStore(
            [
                _FakeJob("old", "running", "2026-09-02T10:00:00Z"),
                _FakeJob("new", "running", "2026-09-02T12:00:00Z"),
            ]
        )

        assert [job["id"] for job in list_jobs(job_store=store)["jobs"]] == [
            "new",
            "old",
        ]

    def test_clamps_the_limit(self):
        store = _FakeStore(
            [
                _FakeJob(str(i), "running", f"2026-09-02T10:00:{i:02d}Z")
                for i in range(5)
            ]
        )

        assert len(list_jobs(limit=2, job_store=store)["jobs"]) == 2
        assert len(list_jobs(limit=0, job_store=store)["jobs"]) == 1
        assert len(list_jobs(limit=LIST_LIMIT_MAX + 500, job_store=store)["jobs"]) == 5


@pytest.mark.unit
class TestJobStoreSnapshot:
    def test_list_all_returns_a_copy(self):
        store = JobStore()
        job, release = _start_held_job(store)
        try:
            snapshot = store.list_all()
            snapshot.clear()

            assert len(store.list_all()) == 1
            assert store.get(job.id) is not None
        finally:
            release.set()

    def test_a_real_job_appears_in_the_listing(self, monkeypatch):
        monkeypatch.setattr(
            "cuepoint.engine.jobs_api._resolve_job_repository", lambda: None
        )
        store = JobStore()
        job, release = _start_held_job(store)
        try:
            payload = list_jobs(state="all", job_store=store)

            assert [j["id"] for j in payload["jobs"]] == [job.id]
            assert payload["jobs"][0]["state"] in {
                JobState.QUEUED.value,
                JobState.RUNNING.value,
            }
        finally:
            release.set()


@pytest.fixture
def engine(tmp_path, monkeypatch):
    """A running engine over a sandboxed database."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)
        reset_container()


@pytest.mark.unit
class TestEndpoint:
    def test_returns_the_documented_envelope(self, engine):
        payload = _get_json(engine, "/api/v1/jobs")

        assert set(payload) == {"jobs", "active_count"}
        assert isinstance(payload["jobs"], list)

    def test_lists_a_job_the_caller_never_started(self, engine):
        # The whole point: this job's id was never handed to the client.
        job, release = _start_held_job(get_job_store())
        try:
            payload = _get_json(engine, "/api/v1/jobs")

            assert job.id in [j["id"] for j in payload["jobs"]]
            assert payload["active_count"] >= 1
        finally:
            release.set()

    def test_requires_a_token(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/jobs", token=None)

        assert excinfo.value.code == 401

    def test_rejects_an_unknown_state(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/jobs?state=sideways")

        assert excinfo.value.code == 400
        body = json.loads(excinfo.value.read().decode("utf-8"))
        assert body["error"]["code"] == "INVALID_REQUEST"

    def test_rejects_a_non_numeric_limit(self, engine):
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _get(f"{engine}/api/v1/jobs?limit=lots")

        assert excinfo.value.code == 400

    def test_does_not_shadow_the_single_job_route(self, engine):
        job, release = _start_held_job(get_job_store())
        try:
            payload = _get_json(engine, f"/api/v1/jobs/{job.id}")

            assert payload["id"] == job.id
        finally:
            release.set()
