#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-09's artwork scan as a job, and the thumbnail route (DEC-076).

Through the bootstrapped container, real job threads and a running engine:

- **A scan follows every whole-library file check** — so every import and
  refresh — and reads the picture a real file carries.
- **What waits for what**: a scan refuses to start beside an import, a refresh
  apply or a file check; none of them waits for a scan; a check that ends during
  a scan still gets its scan, after that one, once.
- **Cancelled and failed scans answer as jobs do.**
- **The route** answers a JPEG at a named size, 204 for no artwork, and refuses
  an unknown track, a bad size and a missing token — and never answers a path.
"""

from __future__ import annotations

import io
import shutil
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable, List, Optional, Sequence, Tuple

import pytest
from mutagen.flac import FLAC, Picture
from PIL import Image

from cuepoint.engine.artwork_jobs import (
    ARTWORK_SCAN_CONFLICTS,
    JOB_TYPE_ARTWORK_SCAN,
    artwork_scan_after,
    pending_artwork_scan,
    run_artwork_scan_job,
    start_artwork_scan_job,
)
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK, start_file_check_job
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import (
    JOB_TYPE_LIBRARY_IMPORT,
    start_library_import_job,
)
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.artwork_service import NOTHING_TO_SCAN
from cuepoint.services.batch_service import BatchSelection
from cuepoint.utils.di_container import get_container, reset_container

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
TOKEN = "artwork-token"
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "audio"


# ------------------------------------------------------------------ helpers


def wait_until(
    predicate: Callable[[], bool], message: str, timeout: float = 30.0
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(interface: Any) -> Any:
    return get_container().resolve(interface)


def database() -> Any:
    from cuepoint.services.interfaces import IDatabaseService

    return resolve(IDatabaseService)


def _location(path: str) -> str:
    return Path(path).as_uri().replace("file:///", "file://localhost/")


def write_export(
    tmp_path: Path, paths: Sequence[str], name: str = "collection.xml"
) -> str:
    entries = "\n".join(
        f'    <TRACK TrackID="{index}" Name="Track {index}" Artist="A"'
        f' Location="{_location(path)}"/>'
        for index, path in enumerate(paths)
    )
    export = tmp_path / name
    export.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(paths)}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="0"></NODE></PLAYLISTS>\n'
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(export)


def pictured_flac(tmp_path: Path, name: str = "pictured.flac") -> Path:
    """A real FLAC carrying a 600 × 300 front cover."""
    target = tmp_path / "music" / name
    target.parent.mkdir(exist_ok=True)
    shutil.copy(FIXTURES / "tone.flac", target)
    buffer = io.BytesIO()
    Image.new("RGB", (600, 300), "red").save(buffer, "PNG")
    picture = Picture()
    picture.type = 3
    picture.mime = "image/png"
    picture.data = buffer.getvalue()
    audio = FLAC(str(target))
    audio.add_picture(picture)
    audio.save()
    return target


def jobs_of(store: JobStore, job_type: str) -> List[Job]:
    return [job for job in store.list_all() if job.type == job_type]


def finished(store: JobStore, job: Job) -> Job:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.type}")
    return store.get(job.id)


def recorded(job_id: str) -> Optional[str]:
    row = (
        database()
        .connect()
        .execute("SELECT state FROM jobs WHERE id = ?", (job_id,))
        .fetchone()
    )
    return None if row is None else str(row["state"])


def add_tracks(paths: Sequence[str]) -> List[int]:
    from cuepoint.services.interfaces import ITrackRepository

    prefix = uuid.uuid4().hex[:8]
    resolve(ITrackRepository).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"T{index}",
                artist="A",
                file_path=path,
            )
            for index, path in enumerate(paths)
        ]
    )
    rows = (
        database()
        .connect()
        .execute(
            "SELECT id, rekordbox_track_id FROM tracks WHERE rekordbox_track_id LIKE ?",
            (f"{prefix}-%",),
        )
    )
    found = {row["rekordbox_track_id"]: int(row["id"]) for row in rows}
    return [found[f"{prefix}-{index}"] for index in range(len(paths))]


def hold(store: JobStore, job_type: str) -> threading.Event:
    released = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda job: released.wait(30), exclusive=True
    )
    return released


def track_id_at(path: Path) -> int:
    rows = database().connect().execute("SELECT id, file_path FROM tracks").fetchall()
    [found] = [int(row["id"]) for row in rows if Path(row["file_path"]) == path]
    return found


class Service:
    """Stands in for the artwork service where a test needs a scan to fail or wait."""

    def __init__(self, error: Optional[Exception] = None) -> None:
        self.error = error
        self.reached = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def library(self) -> List[int]:
        return []

    def scan(self, track_ids, **_options):
        self.reached.set()
        assert self.release.wait(30)
        if self.error is not None:
            raise self.error
        from cuepoint.services.artwork_service import ArtworkScanResult

        return ArtworkScanResult(trigger=_options["trigger"], total=0)


def use_service(service: Any) -> None:
    from cuepoint.services.interfaces import IArtworkService

    get_container().register_singleton(IArtworkService, service)


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IMigrationRunner

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()
    resolve(IMigrationRunner).migrate()
    yield db_path
    database().close_all()
    reset_container()


@pytest.fixture
def store(library_db):
    from cuepoint.services.interfaces import IJobRepository

    job_store = JobStore(job_repository_provider=lambda: resolve(IJobRepository))
    yield job_store
    wait_until(
        lambda: all(job.state in TERMINAL for job in job_store.list_all()),
        "every job to finish",
    )


@pytest.fixture
def engine(library_db):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def get(base: str, path: str, token: Optional[str] = TOKEN) -> Tuple[int, dict, bytes]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(f"{base}{path}", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


# ------------------------------------------------------------------ following


class TestAfterAnImport:
    def test_an_import_is_followed_by_a_scan_that_reads_the_real_picture(
        self, store, tmp_path, engine
    ):
        pictured = pictured_flac(tmp_path)
        missing = tmp_path / "music" / "missing.flac"
        finished(
            store,
            start_library_import_job(
                store, write_export(tmp_path, [str(pictured), str(missing)])
            ),
        )
        wait_until(lambda: len(jobs_of(store, JOB_TYPE_ARTWORK_SCAN)) == 1, "the scan")
        scan = finished(store, jobs_of(store, JOB_TYPE_ARTWORK_SCAN)[0])

        assert scan.state is JobState.SUCCEEDED
        assert scan.result is not None
        assert (
            scan.result["trigger"],
            scan.result["present"],
            scan.result["not_read"],
        ) == (
            "import",
            1,
            1,
        )
        check = jobs_of(store, JOB_TYPE_FILE_CHECK)[0]
        assert scan.created_at >= check.updated_at

        status, headers, body = get(
            engine, f"/api/v1/library/tracks/{track_id_at(pictured)}/artwork?size=row"
        )
        assert status == 200
        assert headers["Content-Type"] == "image/jpeg"
        assert headers["Cache-Control"] == "no-store"
        assert Image.open(io.BytesIO(body)).size == (108, 54)
        assert str(tmp_path).encode() not in body

    def test_a_check_on_request_is_not_followed_by_a_scan(self, store, tmp_path):
        [track] = add_tracks([str(pictured_flac(tmp_path))])

        finished(store, start_file_check_job(store, BatchSelection.of_ids([track])).job)
        time.sleep(0.2)

        assert jobs_of(store, JOB_TYPE_ARTWORK_SCAN) == []


class TestOnRequest:
    def test_a_scan_over_a_selection_answers_what_it_started(self, store, tmp_path):
        [track] = add_tracks([str(pictured_flac(tmp_path))])

        started = start_artwork_scan_job(
            store, BatchSelection.of_ids([track]), fetch_beatport=True
        )
        scan = finished(store, started.job)

        assert started.to_dict() == {
            "job_id": started.job.id,
            "tracks": 1,
            "fetch_beatport": True,
        }
        assert scan.state is JobState.SUCCEEDED
        assert scan.result is not None and scan.result["not_read"] == 1
        wait_until(lambda: recorded(scan.id) == "succeeded", "the job record")

    def test_a_selection_of_nothing_is_refused_before_a_job_exists(self, store):
        with pytest.raises(ValueError, match=NOTHING_TO_SCAN):
            start_artwork_scan_job(store, BatchSelection.of_ids([123_456]))
        assert jobs_of(store, JOB_TYPE_ARTWORK_SCAN) == []

    def test_a_cancelled_scan_is_cancelled_with_its_counts(self, store, tmp_path):
        from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
        from cuepoint.services.interfaces import IFileStatusRepository

        pictured = pictured_flac(tmp_path)
        [track] = add_tracks([str(pictured)])
        with database().transaction():
            resolve(IFileStatusRepository).record(
                [
                    TrackFileStatus(
                        track,
                        FILE_PRESENT,
                        str(pictured),
                        "2026-09-15T12:00:00+00:00",
                        1,
                    )
                ]
            )
        job = Job(id="cancelled-scan", type=JOB_TYPE_ARTWORK_SCAN)
        job.cancel_requested = True

        run_artwork_scan_job(job, store, [track], "request", False)

        assert job.state is JobState.CANCELLED
        assert job.error is not None and job.error["code"] == "JOB_CANCELLED"
        assert job.result is not None
        assert (job.result["cancelled"], job.result["completed"]) == (True, 0)

    @pytest.mark.parametrize(
        "error, code",
        [(RuntimeError("the disk went away"), "ARTWORK_SCAN_FAILED")],
    )
    def test_a_scan_that_raises_fails_with_its_message(self, store, error, code):
        use_service(Service(error))
        job = Job(id="failing-scan", type=JOB_TYPE_ARTWORK_SCAN)

        run_artwork_scan_job(job, store, None, "request", False)

        assert job.state is JobState.FAILED
        assert job.error == {"code": code, "message": "the disk went away"}


class TestWhatWaitsForWhat:
    def test_the_designed_conflicts(self):
        assert set(ARTWORK_SCAN_CONFLICTS) == {
            JOB_TYPE_LIBRARY_IMPORT,
            JOB_TYPE_LIBRARY_REFRESH_APPLY,
            JOB_TYPE_FILE_CHECK,
        }

    @pytest.mark.parametrize(
        "job_type", [*ARTWORK_SCAN_CONFLICTS, JOB_TYPE_ARTWORK_SCAN]
    )
    def test_a_scan_refuses_to_start_beside_them(self, store, tmp_path, job_type):
        [track] = add_tracks([str(tmp_path / "a.flac")])
        released = hold(store, job_type)
        try:
            with pytest.raises(JobTypeBusyError):
                start_artwork_scan_job(store, BatchSelection.of_ids([track]))
        finally:
            released.set()

    def test_an_import_never_waits_for_a_scan(self, store, tmp_path):
        released = hold(store, JOB_TYPE_ARTWORK_SCAN)
        try:
            job = start_library_import_job(
                store, write_export(tmp_path, [str(tmp_path / "a.flac")])
            )
            assert finished(store, job).state is JobState.SUCCEEDED
        finally:
            released.set()

    def test_a_check_ending_during_a_scan_gets_its_scan_after_it_once(self, store):
        waiting = Service()
        waiting.release.clear()
        use_service(waiting)
        first = artwork_scan_after(store, "import")
        assert first is not None
        assert waiting.reached.wait(10)

        assert artwork_scan_after(store, "refresh") is None
        assert artwork_scan_after(store, "refresh") is None
        assert pending_artwork_scan(store) == "refresh"

        waiting.release.set()
        wait_until(
            lambda: len(jobs_of(store, JOB_TYPE_ARTWORK_SCAN)) == 2, "the waiting scan"
        )
        second = finished(store, jobs_of(store, JOB_TYPE_ARTWORK_SCAN)[1])
        finished(store, first)
        time.sleep(0.2)

        assert second.result is not None and second.result["trigger"] == "refresh"
        assert len(jobs_of(store, JOB_TYPE_ARTWORK_SCAN)) == 2
        assert pending_artwork_scan(store) is None


# ------------------------------------------------------------------ the route


class TestTheRoute:
    def test_a_track_with_no_artwork_is_204_and_empty(self, engine, tmp_path):
        [track] = add_tracks([str(tmp_path / "nothing.flac")])

        status, _, body = get(
            engine, f"/api/v1/library/tracks/{track}/artwork?size=inspector"
        )

        assert (status, body) == (204, b"")

    def test_the_inspector_size_is_the_larger_one(self, engine, tmp_path):
        [track] = add_tracks([str(pictured_flac(tmp_path))])

        status, _, body = get(
            engine, f"/api/v1/library/tracks/{track}/artwork?size=inspector"
        )

        assert status == 200
        assert Image.open(io.BytesIO(body)).size == (288, 144)

    def test_an_unknown_track_is_404(self, engine):
        status, _, body = get(engine, "/api/v1/library/tracks/987654/artwork?size=row")

        assert status == 404
        assert b"TRACK_NOT_FOUND" in body

    @pytest.mark.parametrize(
        "query", ["", "?size=huge", "?size=row&size=inspector", "?size=../../x"]
    )
    def test_a_missing_or_unknown_size_is_400(self, engine, tmp_path, query):
        [track] = add_tracks([str(tmp_path / "a.flac")])

        status, _, body = get(engine, f"/api/v1/library/tracks/{track}/artwork{query}")

        assert status == 400
        assert b"INVALID_REQUEST" in body

    def test_no_token_is_401(self, engine, tmp_path):
        [track] = add_tracks([str(tmp_path / "a.flac")])

        status, _, _ = get(
            engine, f"/api/v1/library/tracks/{track}/artwork?size=row", token=None
        )

        assert status == 401

    def test_a_path_in_place_of_an_id_is_not_the_artwork_route(self, engine, tmp_path):
        status, _, body = get(
            engine, "/api/v1/library/tracks/..%2F..%2Fsecret/artwork?size=row"
        )

        assert status != 200
        assert b"image/jpeg" not in body

    def test_a_failure_inside_is_500_with_a_message(self, engine, tmp_path):
        from cuepoint.services.interfaces import IArtworkService

        broken = type("Broken", (), {"thumbnail": lambda self, track_id, size: 1 / 0})()
        get_container().register_singleton(IArtworkService, broken)

        status, _, body = get(engine, "/api/v1/library/tracks/1/artwork?size=row")

        assert status == 500
        assert b"ARTWORK_FAILED" in body
