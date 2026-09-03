#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Engine tests for the refresh endpoints (LIBRARY-10).

Driven over real HTTP against a real engine thread, like the import tests, and
for the same reason: what is most likely to be wrong here is what only the
server decides — which status code an error maps to, whether a route is
authorized, and whether a refusal says something a user could act on.

Three properties carry this step.

**A preview writes nothing.** DEC-032's whole argument is that a user sees the
numbers before anything irreversible happens, so the preview is asserted against
a byte-level snapshot of the library rather than against its counts.

**A stale diff cannot be applied.** A preview describes a file at a moment. If
the file moved on, the numbers a user confirmed are about something that no
longer exists, and applying them would delete on that basis. Refused at the
endpoint and again inside the job.

**One library job at a time.** An import and an apply write the same tables. The
job store refuses the second one, and it refuses across types, not only within
one — which is what a plain per-type lock would have missed.
"""

from __future__ import annotations

import json
import os
import socket
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.library_refresh import RefreshDiffStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "library-refresh-api-token"

TRACK_ATTRS = (
    'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" '
    'TotalTime="360" BitRate="320" Rating="204" PlayCount="3"'
)

PREVIEW = "/api/v1/library/refresh/preview"
APPLY = "/api/v1/library/refresh/apply"


def write_export(tmp_path: Path, ids=(0, 1, 2, 3), name="collection.xml") -> str:
    """Write an export holding the given TrackIDs, with one playlist."""
    entries = "\n".join(
        f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A{i}" {TRACK_ATTRS} '
        f'Location="file://localhost/m/{i}.mp3"/>'
        for i in ids
    )
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(ids)}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0">'
        f'<NODE Name="set" Type="1" Entries="1"><TRACK Key="{ids[0] if ids else 0}"/>'
        "</NODE></NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()

    from cuepoint.services.interfaces import IMigrationRunner
    from cuepoint.utils.di_container import get_container

    get_container().resolve(IMigrationRunner).migrate()
    yield db_path
    reset_container()


@pytest.fixture
def diff_store(monkeypatch):
    """A diff store of this test's own.

    ``library_refresh._DIFF_STORE`` is a module singleton, and two of the
    assertions here are about how many diffs it holds.
    """
    from cuepoint.engine import library_refresh

    store = RefreshDiffStore()
    monkeypatch.setattr(library_refresh, "_DIFF_STORE", store)
    return store


@pytest.fixture
def engine(library_db, diff_store, monkeypatch):
    """An engine with a job store of its own, for the same reason."""
    from cuepoint.engine import server as server_module

    store = JobStore(job_repository_provider=server_module._resolve_job_repository)
    monkeypatch.setattr(server_module, "_JOB_STORE", store)

    port = _free_port()
    httpd, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=2)


def request(base, path, *, method="GET", body=None, token=TOKEN, raw=None):
    """Return ``(status, payload)``, treating an error response as a result."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = raw
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{base}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def wait_for_job(base, job_id, timeout=30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status, payload = request(base, f"/api/v1/jobs/{job_id}")
        if status == 200 and payload.get("state") in (
            "succeeded",
            "failed",
            "cancelled",
        ):
            return payload
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def job_result(base, job_id):
    status, payload = request(base, f"/api/v1/jobs/{job_id}/results")
    assert status == 200, payload
    return payload.get("result")


def do_import(base, xml_path):
    status, payload = request(
        base, "/api/v1/library/import", method="POST", body={"xml_path": xml_path}
    )
    assert status == 202, payload
    finished = wait_for_job(base, payload["job_id"])
    assert finished["state"] == "succeeded", finished
    return finished


def do_preview(base, xml_path=None):
    body = {"xml_path": xml_path} if xml_path else {}
    status, payload = request(base, PREVIEW, method="POST", body=body)
    assert status == 202, payload
    finished = wait_for_job(base, payload["job_id"])
    assert finished["state"] == "succeeded", finished
    return job_result(base, payload["job_id"])


def snapshot(db_path: Path):
    """Every row a refresh could touch, as bytes on disk see them."""
    connection = sqlite3.connect(str(db_path))
    try:
        return {
            name: [
                tuple(row)
                for row in connection.execute(f"SELECT * FROM {name} ORDER BY rowid")
            ]
            for name in (
                "tracks",
                "rekordbox_playlists",
                "rekordbox_playlist_tracks",
                "library_source",
            )
        }
    finally:
        connection.close()


def touch_export(xml_path: str, ids) -> None:
    """Rewrite an export and force its modified time to move.

    A rewrite within the filesystem's timestamp granularity can land on the same
    mtime, which would make a genuinely changed file look unchanged and quietly
    turn the staleness tests into no-ops.
    """
    path = Path(xml_path)
    write_export(path.parent, ids, path.name)
    stat = os.stat(path)
    os.utime(path, (stat.st_atime + 5, stat.st_mtime + 5))


@pytest.mark.unit
class TestAuth:
    def test_preview_requires_a_token(self, engine):
        status, payload = request(engine, PREVIEW, method="POST", body={}, token=None)
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"

    def test_apply_requires_a_token(self, engine):
        status, payload = request(
            engine, APPLY, method="POST", body={"diff_id": "x"}, token=None
        )
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"

    def test_a_wrong_token_is_refused(self, engine):
        status, _ = request(
            engine, PREVIEW, method="POST", body={}, token="not-the-token"
        )
        assert status == 401

    def test_an_unauthorized_call_starts_no_job(self, engine, library_db, tmp_path):
        request(engine, PREVIEW, method="POST", body={}, token=None)
        status, payload = request(engine, "/api/v1/jobs?state=all")
        assert status == 200
        assert payload["jobs"] == []


@pytest.mark.unit
class TestPreviewWritesNothing:
    def test_a_preview_leaves_the_library_byte_identical(
        self, engine, library_db, tmp_path
    ):
        """DEC-032's premise, asserted against rows rather than counts."""
        do_import(engine, write_export(tmp_path))
        before = snapshot(library_db)

        diff = do_preview(engine, write_export(tmp_path, (0, 1), "edited.xml"))

        assert diff["tracks"]["removed"]["count"] == 2
        assert snapshot(library_db) == before

    def test_the_diff_comes_back_as_the_jobs_result(self, engine, library_db, tmp_path):
        export = write_export(tmp_path)
        do_import(engine, export)

        status, started = request(engine, PREVIEW, method="POST", body={})
        assert status == 202
        assert started["state"] in ("queued", "running")
        wait_for_job(engine, started["job_id"])
        diff = job_result(engine, started["job_id"])

        assert diff["xml_path"] == export
        assert diff["is_empty"] is True
        assert diff["diff_id"]

    def test_the_status_payload_does_not_carry_the_diff(
        self, engine, library_db, tmp_path
    ):
        """The status route is polled, for every job. A diff there is sent over
        and over to draw a progress bar."""
        do_import(engine, write_export(tmp_path))
        status, started = request(engine, PREVIEW, method="POST", body={})
        finished = wait_for_job(engine, started["job_id"])

        assert "result" not in finished
        _, listed = request(engine, "/api/v1/jobs?state=all")
        assert all("result" not in job for job in listed["jobs"])

    def test_a_preview_with_no_path_uses_the_source_record(
        self, engine, library_db, tmp_path
    ):
        """DEC-035 recorded the path so a refresh does not have to ask."""
        export = write_export(tmp_path)
        do_import(engine, export)

        diff = do_preview(engine)

        assert diff["xml_path"] == export

    def test_a_preview_before_any_import_says_so(self, engine, library_db):
        status, started = request(engine, PREVIEW, method="POST", body={})
        assert status == 202
        finished = wait_for_job(engine, started["job_id"])

        assert finished["state"] == "failed"
        assert finished["error"]["code"] == "LIBRARY_NOT_IMPORTED"

    def test_a_path_that_is_not_there_is_refused_at_once(self, engine, library_db):
        status, payload = request(
            engine, PREVIEW, method="POST", body={"xml_path": "/nope/missing.xml"}
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert "No such file" in payload["error"]["message"]

    def test_a_file_that_is_not_a_collection_fails_in_the_job(
        self, engine, library_db, tmp_path
    ):
        """The split the import established: cheap checks at the endpoint,
        anything needing the parser inside the job."""
        bad = tmp_path / "notes.xml"
        bad.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")

        status, started = request(
            engine, PREVIEW, method="POST", body={"xml_path": str(bad)}
        )
        assert status == 202
        finished = wait_for_job(engine, started["job_id"])

        assert finished["state"] == "failed"
        assert finished["error"]["code"] == "LIBRARY_XML_NO_COLLECTION"

    def test_a_malformed_body_is_refused(self, engine, library_db):
        status, payload = request(engine, PREVIEW, method="POST", raw=b"{not json")
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"

    def test_an_empty_xml_path_is_refused_rather_than_ignored(self, engine, library_db):
        """Silently falling back to the source record would refresh from a file
        the caller did not mean."""
        status, payload = request(
            engine, PREVIEW, method="POST", body={"xml_path": "   "}
        )
        assert status == 400


@pytest.mark.unit
class TestApply:
    def test_a_previewed_diff_applies_and_reports_what_it_did(
        self, engine, library_db, tmp_path
    ):
        do_import(engine, write_export(tmp_path))
        diff = do_preview(engine, write_export(tmp_path, (0, 1, 9), "edited.xml"))
        assert (
            diff["tracks"]["added"]["count"],
            diff["tracks"]["removed"]["count"],
        ) == (1, 2)

        status, started = request(
            engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )
        assert status == 202
        finished = wait_for_job(engine, started["job_id"])
        assert finished["state"] == "succeeded", finished
        result = job_result(engine, started["job_id"])

        assert result["tracks_inserted"] == 1
        assert result["tracks_deleted"] == 2
        assert result["track_count"] == 3
        assert result["diff_id"] == diff["diff_id"]
        assert "removed" in result["summary_line"]

        _, summary = request(engine, "/api/v1/library/summary")
        assert summary["track_count"] == 3

    def test_the_apply_job_is_typed_so_the_shell_can_label_it(
        self, engine, library_db, tmp_path
    ):
        do_import(engine, write_export(tmp_path))
        diff = do_preview(engine, write_export(tmp_path, (0,), "edited.xml"))
        _, started = request(
            engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )
        finished = wait_for_job(engine, started["job_id"])

        assert finished["type"] == "library_refresh_apply"

    def test_an_unknown_diff_id_is_refused_with_404(self, engine, library_db):
        status, payload = request(
            engine, APPLY, method="POST", body={"diff_id": "nothing-like-this"}
        )
        assert status == 404
        assert payload["error"]["code"] == "LIBRARY_REFRESH_DIFF_NOT_FOUND"

    def test_an_unknown_diff_id_starts_no_job(self, engine, library_db):
        request(engine, APPLY, method="POST", body={"diff_id": "nope"})
        _, listed = request(engine, "/api/v1/jobs?state=all")
        assert listed["jobs"] == []

    def test_a_missing_diff_id_is_refused(self, engine, library_db):
        status, payload = request(engine, APPLY, method="POST", body={})
        assert status == 400
        assert "diff_id is required" in payload["error"]["message"]

    def test_a_non_boolean_confirmation_is_refused(self, engine, library_db):
        status, payload = request(
            engine,
            APPLY,
            method="POST",
            body={"diff_id": "x", "confirm_references": "yes"},
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.unit
class TestAStaleDiffCannotBeApplied:
    """The correctness question this step exists to answer."""

    def test_a_changed_file_is_refused_with_409(self, engine, library_db, tmp_path):
        do_import(engine, write_export(tmp_path))
        edited = write_export(tmp_path, (0, 1), "edited.xml")
        diff = do_preview(engine, edited)

        # The user re-exports before confirming.
        touch_export(edited, (0, 1, 2, 3, 4))

        status, payload = request(
            engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )

        assert status == 409
        assert payload["error"]["code"] == "LIBRARY_REFRESH_DIFF_STALE"
        assert payload["error"]["diff_id"] == diff["diff_id"]
        assert payload["error"]["xml_path"] == edited

    def test_a_stale_apply_changes_nothing(self, engine, library_db, tmp_path):
        do_import(engine, write_export(tmp_path))
        edited = write_export(tmp_path, (0, 1), "edited.xml")
        diff = do_preview(engine, edited)
        before = snapshot(library_db)

        touch_export(edited, (0, 1, 2, 3, 4))
        request(engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]})

        assert snapshot(library_db) == before

    def test_a_deleted_file_is_refused(self, engine, library_db, tmp_path):
        do_import(engine, write_export(tmp_path))
        edited = write_export(tmp_path, (0, 1), "edited.xml")
        diff = do_preview(engine, edited)

        Path(edited).unlink()

        status, payload = request(
            engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )
        assert status == 409
        assert payload["error"]["code"] == "LIBRARY_REFRESH_DIFF_STALE"

    def test_an_unchanged_file_still_applies(self, engine, library_db, tmp_path):
        """Guards the guard: a staleness check that refused everything would
        pass every test above."""
        do_import(engine, write_export(tmp_path))
        diff = do_preview(engine, write_export(tmp_path, (0, 1), "edited.xml"))

        status, started = request(
            engine, APPLY, method="POST", body={"diff_id": diff["diff_id"]}
        )

        assert status == 202
        assert wait_for_job(engine, started["job_id"])["state"] == "succeeded"

    def test_the_job_checks_again_before_writing(
        self, engine, library_db, tmp_path, diff_store
    ):
        """The endpoint's check answers quickly; this one is there to be right.

        Simulated by letting the endpoint's check pass and changing the file
        before the job reaches its own — which is a real window, because a job
        is queued and a thread is scheduled in between.
        """
        from cuepoint.engine.library_refresh import run_refresh_apply_job
        from cuepoint.engine.jobs import JobStore as Store

        do_import(engine, write_export(tmp_path))
        edited = write_export(tmp_path, (0, 1), "edited.xml")
        diff = do_preview(engine, edited)
        before = snapshot(library_db)

        touch_export(edited, (0, 1, 2, 3, 4))
        store = Store()
        job = store.create_job(job_type="test", runner=lambda _job: None)
        run_refresh_apply_job(job, store, diff["diff_id"], False, diff_store)

        assert job.error["code"] == "LIBRARY_REFRESH_DIFF_STALE"
        assert snapshot(library_db) == before


@pytest.mark.unit
class TestOneLibraryJobAtATime:
    """An import and an apply write the same tables; a preview reads them."""

    def test_a_preview_is_refused_while_an_import_runs(
        self, engine, library_db, tmp_path
    ):
        big = write_export(tmp_path, tuple(range(4000)), "big.xml")
        status, started = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": big}
        )
        assert status == 202

        status, payload = request(engine, PREVIEW, method="POST", body={})

        wait_for_job(engine, started["job_id"], timeout=60)
        assert status == 409, payload
        assert payload["error"]["code"] == "LIBRARY_BUSY"
        assert payload["error"]["job_type"] == "library_import"
        assert payload["error"]["job_id"] == started["job_id"]

    def test_an_import_is_refused_while_a_preview_runs(
        self, engine, library_db, tmp_path
    ):
        """The direction a per-type lock would have missed."""
        big = write_export(tmp_path, tuple(range(4000)), "big.xml")
        do_import(engine, big)

        status, started = request(engine, PREVIEW, method="POST", body={})
        assert status == 202
        status, payload = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": big}
        )

        wait_for_job(engine, started["job_id"], timeout=60)
        assert status == 409, payload
        assert payload["error"]["code"] == "LIBRARY_IMPORT_IN_PROGRESS"
        assert payload["error"]["job_id"] == started["job_id"]

    def test_two_library_jobs_never_run_together(self, engine, library_db, tmp_path):
        """Fired from threads, because the interesting case is simultaneous
        arrival — a check-then-create would let both through."""
        big = write_export(tmp_path, tuple(range(4000)), "big.xml")
        do_import(engine, big)
        results = []
        barrier = threading.Barrier(4)

        def fire():
            barrier.wait()
            results.append(request(engine, PREVIEW, method="POST", body={}))

        threads = [threading.Thread(target=fire) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)

        accepted = [payload for status, payload in results if status == 202]
        refused = [payload for status, payload in results if status == 409]
        assert len(accepted) == 1, [r[0] for r in results]
        assert len(refused) == 3
        wait_for_job(engine, accepted[0]["job_id"], timeout=60)


@pytest.mark.unit
class TestTheDiffStore:
    def test_it_forgets_the_oldest_when_it_is_full(self, tmp_path):
        from cuepoint.models.refresh_diff import RefreshDiff

        export = write_export(tmp_path)
        store = RefreshDiffStore(max_entries=3)
        ids = [store.put(RefreshDiff(xml_path=export)).diff_id for _ in range(5)]

        assert store.count() == 3
        assert store.get(ids[-1]).diff_id == ids[-1]
        with pytest.raises(LookupError):
            store.get(ids[0])

    def test_a_forgotten_diff_reads_as_not_found(self, engine, library_db, tmp_path):
        """Which is what a caller should do about it: preview again."""
        from cuepoint.engine.library_refresh import DiffNotFoundError
        from cuepoint.models.refresh_diff import RefreshDiff

        store = RefreshDiffStore(max_entries=1)
        first = store.put(RefreshDiff(xml_path=write_export(tmp_path)))
        store.put(RefreshDiff(xml_path=write_export(tmp_path, name="b.xml")))

        with pytest.raises(DiffNotFoundError):
            store.require_fresh(first.diff_id)

    def test_a_diff_whose_file_was_unreadable_is_never_fresh(self, tmp_path):
        """ "I cannot tell" and "it is the same" lead to opposite actions, and
        only one of them deletes tracks."""
        from cuepoint.engine.library_refresh import DiffStaleError
        from cuepoint.models.refresh_diff import RefreshDiff

        store = RefreshDiffStore()
        stored = store.put(RefreshDiff(xml_path=str(tmp_path / "never-existed.xml")))

        assert stored.xml_modified_at is None
        with pytest.raises(DiffStaleError):
            store.require_fresh(stored.diff_id)

    def test_a_size_change_alone_counts_as_stale(self, tmp_path):
        """mtime granularity is coarse enough that an edit can keep it."""
        from cuepoint.engine.library_refresh import DiffStaleError
        from cuepoint.models.refresh_diff import RefreshDiff

        export = Path(write_export(tmp_path))
        store = RefreshDiffStore()
        stored = store.put(RefreshDiff(xml_path=str(export)))
        before = os.stat(export)

        export.write_text(
            export.read_text(encoding="utf-8") + "\n<!-- longer -->", encoding="utf-8"
        )
        os.utime(export, (before.st_atime, before.st_mtime))

        assert stored.staleness() == "its size changed"
        with pytest.raises(DiffStaleError):
            store.require_fresh(stored.diff_id)
