#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for durable background-job records (DEC-007)."""

from __future__ import annotations

import pytest

from cuepoint.persistence.job_repository import JobRecord, JobRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IJobRepository
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> JobRepository:
    return JobRepository(db)


def _record(job_id: str = "job-1", state: str = "queued", **kwargs) -> JobRecord:
    return JobRecord(
        id=job_id,
        type=kwargs.get("type", "match"),
        state=state,
        demo=kwargs.get("demo", False),
        progress=kwargs.get("progress"),
        error=kwargs.get("error"),
        created_at=kwargs.get("created_at", "2026-01-01T00:00:00+00:00"),
        updated_at=kwargs.get("updated_at", "2026-01-01T00:00:00+00:00"),
    )


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(JobRepository, IJobRepository)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(JobRepository, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestSaveAndRead:
    def test_save_then_get(self, repo):
        repo.save(_record())
        stored = repo.get("job-1")
        assert stored is not None
        assert stored.type == "match"
        assert stored.state == "queued"

    def test_get_unknown_returns_none(self, repo):
        assert repo.get("nope") is None

    def test_save_is_an_upsert(self, repo):
        repo.save(_record(state="queued"))
        repo.save(_record(state="succeeded", updated_at="2026-01-02T00:00:00+00:00"))

        assert repo.count() == 1
        stored = repo.get("job-1")
        assert stored.state == "succeeded"
        assert stored.updated_at == "2026-01-02T00:00:00+00:00"

    def test_created_at_is_not_overwritten_on_update(self, repo):
        repo.save(_record(created_at="2026-01-01T00:00:00+00:00"))
        repo.save(_record(state="running", created_at="2099-12-31T00:00:00+00:00"))
        assert repo.get("job-1").created_at == "2026-01-01T00:00:00+00:00"

    def test_progress_and_error_round_trip(self, repo):
        repo.save(
            _record(
                progress={"completed_tracks": 3, "total_tracks": 10},
                error={"code": "JOB_FAILED", "message": "boom"},
            )
        )
        stored = repo.get("job-1")
        assert stored.progress["completed_tracks"] == 3
        assert stored.error["code"] == "JOB_FAILED"

    def test_demo_flag_round_trips(self, repo):
        repo.save(_record("demo-job", demo=True))
        assert repo.get("demo-job").demo is True

    def test_unserializable_payload_does_not_break_the_save(self, repo):
        """A job record must never be the reason a run fails."""
        repo.save(_record(progress={"bad": object()}))
        stored = repo.get("job-1")
        assert stored is not None
        assert stored.progress is None


@pytest.mark.unit
class TestListing:
    def test_list_recent_is_newest_first(self, repo):
        repo.save(_record("a", created_at="2026-01-01T00:00:00+00:00"))
        repo.save(_record("b", created_at="2026-01-03T00:00:00+00:00"))
        repo.save(_record("c", created_at="2026-01-02T00:00:00+00:00"))

        assert [r.id for r in repo.list_recent()] == ["b", "c", "a"]

    def test_list_recent_honours_limit(self, repo):
        for i in range(5):
            repo.save(
                _record(f"job-{i}", created_at=f"2026-01-0{i + 1}T00:00:00+00:00")
            )
        assert len(repo.list_recent(limit=2)) == 2

    def test_empty(self, repo):
        assert repo.list_recent() == []
        assert repo.count() == 0


@pytest.mark.unit
class TestInterruptedJobs:
    """A job left running belongs to a process that no longer exists."""

    def test_running_and_queued_are_closed_out(self, repo):
        repo.save(_record("running-job", state="running"))
        repo.save(_record("queued-job", state="queued"))

        closed = repo.mark_interrupted("2026-02-01T00:00:00+00:00")

        assert closed == 2
        for job_id in ("running-job", "queued-job"):
            stored = repo.get(job_id)
            assert stored.state == "failed"
            assert stored.error["code"] == "JOB_INTERRUPTED"
            assert stored.updated_at == "2026-02-01T00:00:00+00:00"

    def test_finished_jobs_are_left_alone(self, repo):
        repo.save(_record("done", state="succeeded"))
        repo.save(_record("failed-job", state="failed"))
        repo.save(_record("cancelled-job", state="cancelled"))

        assert repo.mark_interrupted("2026-02-01T00:00:00+00:00") == 0
        assert repo.get("done").state == "succeeded"
        assert repo.get("cancelled-job").state == "cancelled"

    def test_nothing_to_do_is_not_an_error(self, repo):
        assert repo.mark_interrupted("2026-02-01T00:00:00+00:00") == 0
