"""The playlist list and the Save bar's count over HTTP (G4 2.1, 2.2).

What only the wire can get wrong: the envelope, the refusals, and the running
match job read from the engine's own job store.
"""

from __future__ import annotations

import json
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

import pytest

from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.match_jobs import JOB_TYPE_CLEAN_MATCH
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services import database_service as database_service_module
from cuepoint.services.interfaces import IDatabaseService
from cuepoint.utils.di_container import get_container, reset_container
from tests.unit.persistence.match_status_support import (
    add_job_plan,
    add_playlist,
    add_track,
    set_state,
)

TOKEN = "match-status-token"
TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    from cuepoint.services.interfaces import IMigrationRunner

    get_container().resolve(IMigrationRunner).migrate()
    yield get_container().resolve(IDatabaseService)
    reset_container()


@pytest.fixture
def store() -> JobStore:
    return JobStore()


@pytest.fixture
def engine(library_db, store):
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=_free_port(), token=TOKEN), store=store
    )
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def get(
    base: str, path: str, token: Optional[str] = TOKEN, **params: Any
) -> Tuple[int, Dict[str, Any]]:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{base}{path}" + (f"?{query}" if query else "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


COUNT_KEYS = {
    "track_count",
    "not_matched",
    "waiting",
    "accepted",
    "rejected",
    "no_match",
    "unsaved",
    "running",
}


@pytest.mark.unit
class TestPlaylistsRoute:
    def test_the_envelope(self, engine, library_db):
        a, b = add_track(library_db, "/m/a.mp3"), add_track(library_db, "/m/b.mp3")
        set_state(library_db, a, "needs_review")
        folder = add_playlist(library_db, "Gigs", kind="folder")
        playlist = add_playlist(library_db, "Friday", [a, b], parent=folder)

        status, body = get(engine, "/api/v1/clean/playlists")

        assert status == 200
        assert set(body) == {"playlists", "whole_library"}
        [row] = body["playlists"]
        assert set(row) == {"id", "name", "path"} | COUNT_KEYS
        assert (row["id"], row["name"], row["path"]) == (playlist, "Friday", "Gigs")
        assert (row["track_count"], row["waiting"], row["not_matched"]) == (2, 1, 1)
        assert row["running"] is None
        assert set(body["whole_library"]) == COUNT_KEYS
        assert body["whole_library"]["track_count"] == 2

    def test_a_library_without_playlists(self, engine, library_db):
        add_track(library_db)
        status, body = get(engine, "/api/v1/clean/playlists")
        assert (status, body["playlists"]) == (200, [])

    def test_a_running_match_job_is_shared_by_the_playlists_it_covers(
        self, engine, library_db, store
    ):
        a, b = add_track(library_db, "/m/a.mp3"), add_track(library_db, "/m/b.mp3")
        one = add_playlist(library_db, "One", [a, b])
        two = add_playlist(library_db, "Two", [b])
        release = threading.Event()
        job = store.create_job(
            job_type=JOB_TYPE_CLEAN_MATCH, runner=lambda _job: release.wait(30)
        )
        try:
            add_job_plan(library_db, job.id, {a: True, b: False})

            _, body = get(engine, "/api/v1/clean/playlists")

            rows = {row["id"]: row for row in body["playlists"]}
            assert rows[one]["running"] == {"job_id": job.id, "done": 1, "total": 2}
            assert rows[two]["running"] == {"job_id": job.id, "done": 0, "total": 1}
            assert body["whole_library"]["running"] == {
                "job_id": job.id,
                "done": 1,
                "total": 2,
            }
        finally:
            release.set()
            for _ in range(500):
                if job.state in TERMINAL:
                    break
                threading.Event().wait(0.01)

    def test_a_finished_match_job_is_not_running(self, engine, library_db, store):
        a = add_track(library_db)
        playlist = add_playlist(library_db, "P", [a])
        job = store.create_job(job_type=JOB_TYPE_CLEAN_MATCH, runner=lambda _job: None)
        for _ in range(500):
            if job.state in TERMINAL:
                break
            threading.Event().wait(0.01)
        add_job_plan(library_db, job.id, {a: False})

        _, body = get(engine, "/api/v1/clean/playlists")

        [row] = body["playlists"]
        assert row["id"] == playlist and row["running"] is None

    def test_it_needs_the_token(self, engine):
        status, _ = get(engine, "/api/v1/clean/playlists", token=None)
        assert status in (401, 403)


@pytest.mark.unit
def test_the_routes_are_listed_for_the_contract():
    from cuepoint.engine.clean_api import GET_PATHS, handles_get

    for path in ("/api/v1/clean/playlists",):
        assert path in GET_PATHS and handles_get(path)
