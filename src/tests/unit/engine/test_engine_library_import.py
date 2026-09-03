#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Engine tests for the import and summary endpoints (LIBRARY-06).

Driven over real HTTP against a real engine thread rather than by calling the
handlers, because the things most likely to be wrong here are the things only
the server decides: whether a route is authorized, which status code an error
maps to, and whether a body that is not what the endpoint expects turns into a
message a user could act on.

The split between what the endpoint rejects and what the job rejects is
deliberate and asserted both ways. A path that is not there, or is not a file,
or is not named like an export, is decided immediately — those are almost always
a mis-click, and answering at once beats creating a job that fails a second
later. Whether the file is *really* a Rekordbox collection needs the parser, and
that stays inside the job so it appears where every other job outcome does.
"""

from __future__ import annotations

import json
import socket
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.server import EngineConfig, get_job_store, start_engine_thread
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container

TOKEN = "library-import-api-token"

TRACK_ATTRS = (
    'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" '
    'TotalTime="360" BitRate="320" Rating="204" PlayCount="3"'
)


def write_export(tmp_path: Path, count: int = 6, name: str = "collection.xml") -> str:
    entries = "\n".join(
        f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A{i}" {TRACK_ATTRS} '
        f'Location="file://localhost/m/{i}.mp3"/>'
        for i in range(count)
    )
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{count}">\n{entries}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0">'
        '<NODE Name="set" Type="1" Entries="1"><TRACK Key="0"/></NODE>'
        "</NODE></PLAYLISTS>\n"
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
def engine(library_db, monkeypatch):
    """An engine with a job store of its own.

    ``server._JOB_STORE`` is a module singleton, so without this every test in
    this file would see the jobs the previous ones left behind — and two of the
    assertions here are about how many jobs exist. Patched before the handler is
    built, because ``make_handler`` captures the store it will use.
    """
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


def request(base, path, *, method="GET", body=None, token=TOKEN):
    """Return ``(status, payload)``, treating an error response as a result."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8") if isinstance(body, dict) else body
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{base}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def wait_for_job(base, job_id, timeout=20.0):
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


@pytest.mark.unit
class TestAuth:
    def test_import_requires_a_token(self, engine, tmp_path):
        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path)},
            token=None,
        )
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"

    def test_import_rejects_a_wrong_token(self, engine, tmp_path):
        status, _payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path)},
            token="not-the-token",
        )
        assert status == 401

    def test_summary_requires_a_token(self, engine):
        status, payload = request(engine, "/api/v1/library/summary", token=None)
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"

    def test_an_unauthorized_import_starts_no_job(self, engine, tmp_path):
        request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path)},
            token=None,
        )
        _status, payload = request(engine, "/api/v1/jobs?state=all")
        assert payload["jobs"] == []


@pytest.mark.unit
class TestStartingAnImport:
    def test_it_returns_the_job_id_and_the_import_runs(self, engine, tmp_path):
        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 6)},
        )

        assert status == 202
        assert payload["job_id"]
        assert payload["state"] in ("queued", "running")

        finished = wait_for_job(engine, payload["job_id"])
        assert finished["state"] == "succeeded"

        _status, summary = request(engine, "/api/v1/library/summary")
        assert summary["track_count"] == 6

    def test_the_job_is_listed_with_its_type(self, engine, tmp_path):
        _status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path)},
        )
        wait_for_job(engine, started["job_id"])

        _status, payload = request(engine, "/api/v1/jobs?state=all")
        listed = {job["id"]: job for job in payload["jobs"]}
        assert listed[started["job_id"]]["type"] == "library_import"

    def test_progress_is_followed_through_the_existing_job_endpoint(
        self, engine, tmp_path
    ):
        """The step adds no second progress mechanism."""
        _status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 20)},
        )
        finished = wait_for_job(engine, started["job_id"])

        assert finished["progress"]["total_tracks"] == 20
        assert finished["progress"]["completed_tracks"] == 20

    def test_both_id_keys_are_present(self, engine, tmp_path):
        """`job_id` is what the spec names; `id` matches every other job start."""
        _status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path)},
        )
        assert payload["job_id"] == payload["id"]


@pytest.mark.unit
class TestRejectedRequests:
    """What the endpoint decides, rather than the job."""

    def test_a_missing_file(self, engine, tmp_path):
        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": str(tmp_path / "gone.xml")},
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert "No such file" in payload["error"]["message"]

    def test_a_path_that_is_not_xml(self, engine, tmp_path):
        not_xml = tmp_path / "collection.csv"
        not_xml.write_text("title,artist\n", encoding="utf-8")

        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": str(not_xml)},
        )
        assert status == 400
        assert "Rekordbox XML export" in payload["error"]["message"]

    def test_a_directory(self, engine, tmp_path):
        directory = tmp_path / "not-a-file.xml"
        directory.mkdir()

        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": str(directory)},
        )
        assert status == 400
        assert "Not a file" in payload["error"]["message"]

    @pytest.mark.parametrize(
        "body,expected",
        [
            (b"", "xml_path"),
            (b"not json", "Invalid JSON"),
            (b"[]", "must be an object"),
            (b'{"xml_path": ""}', "xml_path is required"),
            (b'{"xml_path": "   "}', "xml_path is required"),
            (b"{}", "xml_path is required"),
        ],
    )
    def test_a_body_without_a_usable_path(self, engine, body, expected):
        """The message has to name the problem in the *body*.

        Asserting only the status let a version that substituted a placeholder
        path pass: it still answered 400, but with "No such file: x", which
        sends a caller looking for a file they never named.
        """
        status, payload = request(
            engine, "/api/v1/library/import", method="POST", body=body
        )
        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert expected in payload["error"]["message"]

    def test_a_rejected_request_starts_no_job(self, engine, tmp_path):
        request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": str(tmp_path / "gone.xml")},
        )
        _status, payload = request(engine, "/api/v1/jobs?state=all")
        assert payload["jobs"] == []

    def test_an_xml_file_that_is_not_a_collection_fails_as_a_job(
        self, engine, tmp_path
    ):
        """The other side of the split: this one needs the parser.

        The request is accepted because nothing cheap can tell it apart from a
        real export; the job then fails with a message that says what to do.
        """
        path = tmp_path / "playlists-only.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>\n",
            encoding="utf-8",
        )

        status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": str(path)},
        )
        assert status == 202

        finished = wait_for_job(engine, started["job_id"])
        assert finished["state"] == "failed"
        assert finished["error"]["code"] == "LIBRARY_XML_NO_COLLECTION"


@pytest.mark.unit
class TestConcurrentImports:
    """Two at once would interleave writes to the same tables."""

    def test_a_second_import_is_refused_while_one_runs(self, engine, tmp_path):
        big = write_export(tmp_path, 8000, name="big.xml")
        _status, first = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": big}
        )

        status, payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 5, name="small.xml")},
        )

        assert status == 409
        assert payload["error"]["code"] == "LIBRARY_IMPORT_IN_PROGRESS"
        # The running job's id comes back, so a caller can follow it rather
        # than only being told no.
        assert payload["error"]["job_id"] == first["job_id"]

        wait_for_job(engine, first["job_id"])

    def test_the_refused_import_did_not_run(self, engine, tmp_path):
        big = write_export(tmp_path, 8000, name="big.xml")
        _status, first = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": big}
        )
        request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 5, name="small.xml")},
        )
        wait_for_job(engine, first["job_id"])

        _status, summary = request(engine, "/api/v1/library/summary")
        assert summary["track_count"] == 8000, "the second import overwrote the first"
        assert summary["source"]["xml_path"].endswith("big.xml")

    def test_another_import_is_allowed_once_the_first_finished(self, engine, tmp_path):
        _status, first = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 4, name="one.xml")},
        )
        wait_for_job(engine, first["job_id"])

        status, _payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 4, name="two.xml")},
        )
        assert status == 202

    def test_concurrent_requests_produce_exactly_one_import(self, engine, tmp_path):
        """The check and the registration happen under one lock.

        Asking the store and then creating would let two requests arriving
        together both see an idle store.
        """
        big = write_export(tmp_path, 8000, name="big.xml")
        results: list = []

        def start() -> None:
            results.append(
                request(
                    engine,
                    "/api/v1/library/import",
                    method="POST",
                    body={"xml_path": big},
                )
            )

        threads = [threading.Thread(target=start) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        accepted = [payload for status, payload in results if status == 202]
        refused = [payload for status, payload in results if status == 409]
        assert len(accepted) == 1, f"{len(accepted)} imports started at once"
        assert len(refused) == 5

        wait_for_job(engine, accepted[0]["job_id"])
        _status, payload = request(engine, "/api/v1/jobs?state=all")
        imports = [j for j in payload["jobs"] if j["type"] == "library_import"]
        assert len(imports) == 1


@pytest.mark.unit
class TestSummary:
    def test_an_empty_library_answers_honestly(self, engine):
        """Before any import: zeroes, empty, and no source record.

        "Nothing imported yet" and "imported an empty collection" are different
        situations; the null source is what tells them apart.
        """
        status, payload = request(engine, "/api/v1/library/summary")

        assert status == 200
        assert payload["track_count"] == 0
        assert payload["playlist_count"] == 0
        assert payload["playlist_entry_count"] == 0
        assert payload["library_empty"] is True
        assert payload["source"] is None

    def test_the_documented_shape(self, engine):
        _status, payload = request(engine, "/api/v1/library/summary")
        assert set(payload) == {
            "track_count",
            "playlist_count",
            "playlist_entry_count",
            "library_empty",
            "source",
        }

    def test_after_an_import_it_describes_the_library_and_its_source(
        self, engine, tmp_path
    ):
        export = write_export(tmp_path, 9)
        _status, started = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": export}
        )
        wait_for_job(engine, started["job_id"])

        _status, payload = request(engine, "/api/v1/library/summary")

        assert payload["track_count"] == 9
        assert payload["playlist_count"] == 2
        assert payload["playlist_entry_count"] == 1
        assert payload["library_empty"] is False

        source = payload["source"]
        assert source["xml_path"] == str(Path(export))
        assert source["track_count"] == 9
        assert source["imported_at"]
        assert source["exists"] is True
        assert source["changed"] is False

    def test_it_reports_a_source_file_that_changed(self, engine, tmp_path):
        export = write_export(tmp_path, 3)
        _status, started = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": export}
        )
        wait_for_job(engine, started["job_id"])

        write_export(tmp_path, 7, name="collection.xml")

        _status, payload = request(engine, "/api/v1/library/summary")
        assert payload["source"]["exists"] is True
        assert payload["source"]["changed"] is True

    def test_it_reports_a_source_file_that_is_gone(self, engine, tmp_path):
        export = write_export(tmp_path, 3)
        _status, started = request(
            engine, "/api/v1/library/import", method="POST", body={"xml_path": export}
        )
        wait_for_job(engine, started["job_id"])

        Path(export).unlink()

        _status, payload = request(engine, "/api/v1/library/summary")
        assert payload["source"]["exists"] is False
        # Not False: whether it changed cannot be known once it is gone, and
        # answering False would read as "still fine".
        assert payload["source"]["changed"] is None

    def test_the_library_survives_a_re_import_reported_once(self, engine, tmp_path):
        export = write_export(tmp_path, 5)
        for _ in range(2):
            _status, started = request(
                engine,
                "/api/v1/library/import",
                method="POST",
                body={"xml_path": export},
            )
            wait_for_job(engine, started["job_id"])

        _status, payload = request(engine, "/api/v1/library/summary")
        assert payload["track_count"] == 5


@pytest.mark.unit
class TestCancellationThroughTheApi:
    def test_an_import_started_over_http_can_be_cancelled_over_http(
        self, engine, tmp_path
    ):
        _status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 9000, name="big.xml")},
        )
        status, _payload = request(
            engine, f"/api/v1/jobs/{started['job_id']}/cancel", method="POST", body=b""
        )
        assert status == 200

        finished = wait_for_job(engine, started["job_id"])
        assert finished["state"] in ("cancelled", "succeeded")

        _status, summary = request(engine, "/api/v1/library/summary")
        if finished["state"] == "cancelled":
            assert summary["track_count"] == 0
            assert summary["source"] is None
        else:
            assert summary["track_count"] == 9000

    def test_a_cancelled_import_frees_the_slot(self, engine, tmp_path):
        _status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 9000, name="big.xml")},
        )
        request(
            engine, f"/api/v1/jobs/{started['job_id']}/cancel", method="POST", body=b""
        )
        wait_for_job(engine, started["job_id"])

        status, _payload = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 3, name="after.xml")},
        )
        assert status == 202


@pytest.mark.unit
class TestUnavailableLibrary:
    def test_the_summary_reports_503_when_services_cannot_be_resolved(
        self, engine, monkeypatch
    ):
        """A 503 rather than an empty library: they mean different things."""
        from cuepoint.engine import library_api

        def broken() -> None:
            raise library_api.LibraryUnavailableError("container is not built")

        monkeypatch.setattr(library_api, "_resolve_library_service", broken)

        status, payload = request(engine, "/api/v1/library/summary")
        assert status == 503
        assert payload["error"]["code"] == "LIBRARY_UNAVAILABLE"


@pytest.mark.unit
class TestExistingEndpointsAreUnaffected:
    def test_search_still_works(self, engine, tmp_path):
        _status, started = request(
            engine,
            "/api/v1/library/import",
            method="POST",
            body={"xml_path": write_export(tmp_path, 5)},
        )
        wait_for_job(engine, started["job_id"])

        status, payload = request(engine, "/api/v1/library/search?q=Track")
        assert status == 200
        assert payload["total"] == 5

    def test_a_match_job_can_still_be_started(self, engine):
        status, payload = request(
            engine, "/api/v1/jobs/match", method="POST", body={"demo": True}
        )
        assert status == 202
        job = get_job_store().get(payload["id"])
        assert job.type == "match"
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and job.state not in (
            JobState.SUCCEEDED,
            JobState.FAILED,
            JobState.CANCELLED,
        ):
            time.sleep(0.02)
