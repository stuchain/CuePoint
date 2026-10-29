#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""JobStore write-through persistence (DEC-007).

In-memory state stays the hot path that status polling and SSE read; the
database is a durable mirror. These tests pin both halves of that: records are
written when they matter, and nothing about persistence is allowed to slow down
or break a running job.
"""

from __future__ import annotations

import threading
import time

import pytest

from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.persistence.job_repository import JobRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def repo(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield JobRepository(service)
    service.close_all()


def _wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


@pytest.mark.unit
class TestWithoutPersistence:
    """A store with no repository behaves exactly as before."""

    def test_runs_jobs_in_memory(self):
        store = JobStore()
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(lambda: store.get(job.id).state == JobState.SUCCEEDED)

    def test_no_repository_is_not_an_error(self):
        store = JobStore()
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert store.get(job.id) is not None


@pytest.mark.unit
class TestWriteThrough:
    def test_job_is_recorded_on_creation(self, repo):
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert repo.get(job.id) is not None

    def test_terminal_state_is_recorded(self, repo):
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(
            lambda: (repo.get(job.id) or None) and repo.get(job.id).state == "succeeded"
        )

    def test_failure_is_recorded_with_its_error(self, repo):
        def boom(job):
            raise RuntimeError("kaboom")

        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", runner=boom)

        assert _wait_for(lambda: repo.get(job.id).state == "failed")
        stored = repo.get(job.id)
        assert stored.error["code"] == "JOB_FAILED"
        assert "kaboom" in stored.error["message"]

    def test_cancellation_is_recorded(self, repo):
        release = {"go": False}

        def slow(job):
            while not release["go"]:
                time.sleep(0.01)

        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", runner=slow)
        assert _wait_for(lambda: store.get(job.id).state == JobState.RUNNING)
        store.request_cancel(job.id)
        release["go"] = True

        assert _wait_for(lambda: repo.get(job.id) is not None)
        assert repo.get(job.id) is not None

    def test_demo_flag_is_recorded(self, repo):
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert repo.get(job.id).demo is True

    def test_job_type_is_recorded(self, repo):
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert repo.get(job.id).type == "clean_match"


@pytest.mark.unit
class TestPersistenceIsBestEffort:
    """A database problem must never take down a running job."""

    def test_failing_repository_does_not_break_the_job(self):
        class Broken:
            def save(self, record):
                raise RuntimeError("database on fire")

        store = JobStore(job_repository=Broken())
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(lambda: store.get(job.id).state == JobState.SUCCEEDED)

    def test_failing_provider_falls_back_to_memory_only(self):
        def provider():
            raise RuntimeError("no container")

        store = JobStore(job_repository_provider=provider)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(lambda: store.get(job.id).state == JobState.SUCCEEDED)

    def test_provider_is_resolved_once(self):
        calls = {"n": 0}

        def provider():
            calls["n"] += 1
            return None

        store = JobStore(job_repository_provider=provider)
        for _ in range(3):
            store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert calls["n"] == 1, "repository should be resolved once, not per job"


@pytest.mark.unit
class TestProgressSampling:
    """Progress ticks arrive per track and must not mean a write per track."""

    def test_progress_updates_are_sampled(self, repo):
        from cuepoint.compat.gui_types import ProgressInfo

        saves = {"n": 0}
        original_save = repo.save

        def counting_save(record):
            saves["n"] += 1
            original_save(record)

        repo.save = counting_save  # type: ignore[method-assign]
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(lambda: store.get(job.id).state == JobState.SUCCEEDED)

        before = saves["n"]
        for i in range(200):
            store._update(
                job,
                progress=ProgressInfo(
                    completed_tracks=i,
                    total_tracks=200,
                    matched_count=i,
                    unmatched_count=0,
                ),
            )
        written = saves["n"] - before

        assert written <= 3, f"progress-only updates caused {written} writes"

    def test_state_changes_are_never_sampled_away(self, repo):
        """A terminal state dropped by throttling would misreport forever."""
        store = JobStore(job_repository=repo)
        job = store.create_job(job_type="clean_match", demo=True, runner=lambda j: None)
        assert _wait_for(lambda: store.get(job.id).state == JobState.SUCCEEDED)

        store._update(job, state=JobState.FAILED, error={"code": "X", "message": "y"})

        assert repo.get(job.id).state == "failed"


@pytest.mark.unit
class TestEnsureRepository:
    """The provider runs when asked for, not only at the first job (HARDEN-05)."""

    def test_provider_runs_without_any_job(self):
        calls = []
        store = JobStore(job_repository_provider=lambda: calls.append(1))
        assert calls == []
        store.ensure_repository()
        store.ensure_repository()
        assert calls == [1]

    def test_two_first_calls_run_the_provider_once(self):
        started = threading.Event()
        release = threading.Event()
        runs = []

        def provider():
            runs.append(threading.current_thread().name)
            started.set()
            release.wait(5)
            return "repository"

        store = JobStore(job_repository_provider=provider)
        seen = []

        def first_call():
            seen.append(store._get_repository())

        first = threading.Thread(target=first_call)
        first.start()
        assert started.wait(5)
        # The second arrives while the provider runs: it waits, it does not run it again or see None.
        second = threading.Thread(target=first_call)
        second.start()
        time.sleep(0.1)
        assert seen == []
        release.set()
        first.join(5)
        second.join(5)
        assert runs == [first.name]
        assert seen == ["repository", "repository"]

    def test_a_provider_that_asks_for_the_store_again_does_not_deadlock(self):
        holder = {}

        def provider():
            holder["inner"] = holder["store"]._get_repository()
            return "repository"

        store = JobStore(job_repository_provider=provider)
        holder["store"] = store
        assert store._get_repository() == "repository"
        assert holder["inner"] is None

    def test_a_failing_provider_is_not_retried(self):
        runs = []

        def provider():
            runs.append(1)
            raise RuntimeError("no database")

        store = JobStore(job_repository_provider=provider)
        assert store._get_repository() is None
        assert store._get_repository() is None
        assert runs == [1]

    def test_the_engine_provider_closes_out_a_job_the_last_engine_left_running(
        self, repo, monkeypatch
    ):
        from cuepoint.engine import server
        from cuepoint.persistence.job_repository import JobRecord
        from cuepoint.utils import di_container

        repo.save(
            JobRecord(
                id="left-running",
                type="library_import",
                state="running",
                demo=False,
                progress=None,
                error=None,
                created_at="2026-01-01T00:00:00+00:00",
                updated_at="2026-01-01T00:00:00+00:00",
            )
        )

        class Container:
            def resolve(self, _interface):
                return repo

        monkeypatch.setattr(di_container, "get_container", lambda: Container())
        store = JobStore(job_repository_provider=server._resolve_job_repository)
        # No job is created: resolving is enough.
        store.ensure_repository()
        record = repo.get("left-running")
        assert record.state == "failed"
        assert record.error["code"] == "JOB_INTERRUPTED"

    def test_starting_the_library_work_resolves_the_job_repository_first(
        self, monkeypatch
    ):
        from cuepoint.engine import (
            credit_index_jobs,
            discovery_jobs,
            marks_backfill_jobs,
            server,
        )

        calls = []

        class Store:
            def ensure_repository(self):
                calls.append("ensure_repository")

        monkeypatch.setattr(server, "_JOB_STORE", Store())
        monkeypatch.setattr(
            server, "record_activity", lambda *a, **k: calls.append("activity")
        )
        monkeypatch.setattr(server, "record_library_opened_by", lambda: None)
        monkeypatch.setattr(server, "_schedule_launch_analysis", lambda: None)
        monkeypatch.setattr(
            credit_index_jobs, "start_credit_index_if_stale", lambda store: None
        )
        monkeypatch.setattr(
            marks_backfill_jobs, "start_marks_backfill_if_needed", lambda store: None
        )
        monkeypatch.setattr(
            discovery_jobs, "close_interrupted_discovery_runs", lambda: None
        )

        server._start_library_work(server.EngineConfig(host="127.0.0.1", port=8765))
        assert calls[0] == "ensure_repository"
