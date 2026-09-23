#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox export over HTTP (EXPORT-06).

EXPORT-04 and EXPORT-05 test what the preview says and what the job writes.
What only this layer can get wrong, and so what is tested here, through a
running engine over a library imported by a real import job:

- **The wire carries the service's answer unchanged.** A preview over a scope
  is the service's preview, field for field.
- **A malformed body is a 400, never a 500**, and ``null`` is read as absent —
  ORG-13's lesson, where "nothing chosen" spelled ``null`` came back refused.
- **A refusal is typed.** The source path as the destination, and every other
  destination and source refusal, arrives with its ``reason`` and ``path`` so
  EXPORT-07 can offer the right next step; and it starts nothing.
- **A start is a job id**, and the job it names writes the file.
- **History says what the next export starts from**: the last one that wrote.
"""

from __future__ import annotations

import json
import os
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest

from cuepoint.engine import rekordbox_export_api as api
from cuepoint.engine.api_errors import bad_request
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import start_library_import_job
from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES
from cuepoint.engine.rekordbox_export_jobs import JOB_TYPE_REKORDBOX_EXPORT
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.models.filter_rule import FilterRuleError
from cuepoint.models.rekordbox_export import EXPORT_WRITTEN
from cuepoint.persistence.rekordbox_export_repository import MAX_RECENT
from cuepoint.services import database_service as database_service_module
from cuepoint.services.rekordbox_export_service import (
    DEFAULT_KEY_FORMAT,
    DESTINATION_BLANK,
    DESTINATION_FOLDER_MISSING,
    DESTINATION_IS_FOLDER,
    DESTINATION_IS_SOURCE,
    DESTINATION_NOT_XML,
    SOURCE_INVALID,
    SOURCE_MISSING,
    SOURCE_NEVER_IMPORTED,
    ExportDestinationError,
    ExportSourceError,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.job_settling import wait_until_settled

TOKEN = "rekordbox-export-api-token"
TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)

COLLECTION = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="3">
    <TRACK TrackID="1" Name="One" Artist="A" Tonality="Am" AverageBpm="128.00"\
 Location="file://localhost/C:/Music/one.mp3">
      <POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>
    </TRACK>
    <TRACK TrackID="2" Name="Two" Artist="B" Tonality="F#m" AverageBpm="124.00"\
 Location="file://localhost/C:/Music/two.mp3"/>
    <TRACK TrackID="3" Name="Three" Artist="C" Tonality="Gm" AverageBpm="90.00"\
 Location="file://localhost/C:/Music/three.mp3"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="0"/>
  </PLAYLISTS>
</DJ_PLAYLISTS>
"""


# ------------------------------------------------------------------ helpers


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_until(
    predicate: Callable[[], bool], message: str, timeout: float = 30.0
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


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


def export_jobs(store: JobStore) -> List[Any]:
    return [job for job in store.list_all() if job.type == JOB_TYPE_REKORDBOX_EXPORT]


def blocking_job(store: JobStore, job_type: str, conflicts=()) -> threading.Event:
    """A job of ``job_type`` that runs until the returned event is set."""
    release = threading.Event()
    store.create_job(
        job_type=job_type,
        runner=lambda _job: release.wait(30),
        exclusive=True,
        conflicts_with=conflicts,
    )
    return release


def _made(path: Path) -> Path:
    """A folder, made, whose name reads like a file's."""
    path.mkdir()
    return path


# ------------------------------------------------------------------ fixtures


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
    resolve("IMigrationRunner").migrate()
    yield
    resolve("IDatabaseService").close_all()
    reset_container()


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until(
        lambda: all(job.state in TERMINAL for job in job_store.list_all()),
        "every job to finish",
    )


@pytest.fixture
def engine(store):
    """A running engine over the test's job store."""
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.fixture
def source(tmp_path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_text(COLLECTION, encoding="utf-8")
    return path


@pytest.fixture
def imported(store, source) -> Path:
    """The source, imported by a real import job, with its follow-ups done."""
    job = start_library_import_job(store, str(source))
    wait_until(lambda: store.get(job.id).state in TERMINAL, "the import")
    assert store.get(job.id).state is JobState.SUCCEEDED
    # Not "every job finished": an import finishes and then starts its
    # follow-ups, so that is briefly true before they exist.
    wait_until_settled(store, "the import's follow-up jobs")
    return source


@pytest.fixture
def folder(tmp_path) -> Path:
    path = tmp_path / "exports"
    path.mkdir()
    return path


@pytest.fixture
def set_list(imported) -> Any:
    """A Collection holding the first two tracks, the second one twice."""
    ids = [
        int(row["id"])
        for row in resolve("IDatabaseService")
        .connect()
        .execute("SELECT id FROM tracks ORDER BY rekordbox_track_id")
    ]
    collections = resolve("ICollectionService")
    node = collections.create_collection("Saturday")
    collections.add_tracks(int(node.id), ids[:2])
    collections.insert_track(int(node.id), ids[1], 2)
    return node


def preview(base: str, body: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "POST", api.PREVIEW_PATH, body)


def start(base: str, body: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "POST", api.START_PATH, body)


def history(base: str, **params: Any) -> Tuple[int, Dict[str, Any]]:
    return call(base, "GET", api.HISTORY_PATH, params=params)


def exported(base: str, store: JobStore, body: Dict[str, Any]) -> Any:
    """Start an export over the wire and wait for its job to end."""
    answer = ok(start(base, body), 202)
    wait_until(lambda: store.get(answer["job_id"]).state in TERMINAL, "the export")
    return store.get(answer["job_id"])


# ------------------------------------------------------------------ the routes


class TestTheRoutes:
    def test_every_route_lives_under_its_own_prefix(self):
        """Nothing here can be read as the CSV, JSON and Excel export."""
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            assert path.startswith("/api/v1/rekordbox-export/"), path
        assert set(api.POST_PATHS) == {api.PREVIEW_PATH, api.START_PATH}
        assert set(api.GET_PATHS) == {api.HISTORY_PATH}

    def test_no_path_is_shared_with_clean(self):
        from cuepoint.engine import clean_api

        ours = {*api.GET_PATHS, *api.POST_PATHS}
        assert not ours & {*clean_api.GET_PATHS, *clean_api.POST_PATHS}

    @pytest.mark.parametrize(
        "method, path",
        (
            ("POST", api.PREVIEW_PATH),
            ("POST", api.START_PATH),
            ("GET", api.HISTORY_PATH),
        ),
    )
    def test_every_route_needs_the_token(self, engine, imported, method, path):
        refused(call(engine, method, path, {}, token=None), 401, "UNAUTHORIZED")
        refused(call(engine, method, path, {}, token="wrong"), 401, "UNAUTHORIZED")

    def test_a_route_this_module_does_not_have_is_not_found(self, engine):
        refused(
            call(engine, "GET", "/api/v1/rekordbox-export/nothing"), 404, "NOT_FOUND"
        )
        refused(
            call(engine, "POST", "/api/v1/rekordbox-export/nothing", {}),
            404,
            "NOT_FOUND",
        )

    def test_a_read_is_not_answered_to_a_post_or_a_write_to_a_get(
        self, engine, imported
    ):
        refused(call(engine, "POST", api.HISTORY_PATH, {}), 404, "NOT_FOUND")
        refused(call(engine, "GET", api.PREVIEW_PATH), 404, "NOT_FOUND")
        refused(call(engine, "GET", api.START_PATH), 404, "NOT_FOUND")


# ----------------------------------------------------------------- the preview


class TestThePreview:
    def test_a_preview_of_the_whole_library(self, engine, imported):
        answer = ok(preview(engine, {}))["preview"]

        assert answer["track_count"] == 3
        assert answer["key_format"] == DEFAULT_KEY_FORMAT
        assert answer["playlists"] == []
        assert answer["playlist_folder"] is None
        assert answer["source"]["path"] == str(imported)
        assert answer["source"]["stale"] is False

    def test_a_preview_over_a_scope_says_what_each_playlist_would_hold(
        self, engine, set_list
    ):
        answer = ok(preview(engine, {"collection_ids": [int(set_list.id)]}))["preview"]

        [playlist] = answer["playlists"]
        assert playlist["collection_id"] == int(set_list.id)
        assert playlist["name"] == "Saturday"
        assert playlist["entry_count"] == 3
        assert playlist["kind"] == "collection"
        assert answer["playlist_folder"] == "CuePoint"

    def test_the_wire_carries_the_services_answer_unchanged(self, engine, set_list):
        wire = ok(
            preview(
                engine, {"collection_ids": [int(set_list.id)], "key_format": "camelot"}
            )
        )["preview"]
        direct = (
            resolve("IRekordboxExportService")
            .preview([int(set_list.id)], "camelot")
            .to_dict()
        )

        assert wire == json.loads(json.dumps(direct))

    def test_each_notation_is_honoured(self, engine, imported):
        for notation in ("normal", "camelot", "short"):
            answer = ok(preview(engine, {"key_format": notation}))["preview"]
            assert answer["key_format"] == notation

    def test_null_is_read_as_absent_not_refused(self, engine, imported):
        """ORG-13: the renderer spells "nothing chosen" as null and sends the
        key either way. Refusing it made the most ordinary request a 400."""
        absent = ok(preview(engine, {}))["preview"]
        spelled = ok(preview(engine, {"collection_ids": None, "key_format": None}))[
            "preview"
        ]

        assert spelled == absent

    def test_an_empty_list_is_nothing_chosen(self, engine, imported):
        assert ok(preview(engine, {"collection_ids": []}))["preview"]["playlists"] == []

    def test_a_node_named_twice_is_previewed_once(self, engine, set_list):
        node = int(set_list.id)
        answer = ok(preview(engine, {"collection_ids": [node, node]}))["preview"]

        assert len(answer["playlists"]) == 1

    @pytest.mark.parametrize(
        "body, words",
        (
            ({"collection_ids": "7"}, ("collection_ids",)),
            ({"collection_ids": 7}, ("collection_ids",)),
            ({"collection_ids": {"id": 7}}, ("collection_ids",)),
            ({"collection_ids": [True]}, ("whole numbers",)),
            ({"collection_ids": [1.5]}, ("whole numbers",)),
            ({"collection_ids": ["1"]}, ("whole numbers",)),
            ({"collection_ids": [None]}, ("whole numbers",)),
            ({"key_format": 3}, ("key_format",)),
            ({"key_format": ["camelot"]}, ("key_format",)),
            ({"selection": {"scope": "all"}}, ("Unknown field selection",)),
            ({"destination_path": "C:/x.xml"}, ("Unknown field destination_path",)),
        ),
    )
    def test_a_malformed_selection_is_a_400_never_a_500(
        self, engine, imported, body, words
    ):
        refused(preview(engine, body), 400, "INVALID_REQUEST", *words)

    @pytest.mark.parametrize(
        "raw, words",
        (
            (b"", ("body is required",)),
            (b"{not json", ("Invalid JSON",)),
            (b"[1, 2]", ("must be an object",)),
            (b'"text"', ("must be an object",)),
        ),
    )
    def test_a_body_that_is_not_an_object_is_a_400(self, engine, imported, raw, words):
        refused(
            call(engine, "POST", api.PREVIEW_PATH, raw=raw),
            400,
            "INVALID_REQUEST",
            *words,
        )

    def test_an_unknown_notation_is_a_400_naming_the_field(self, engine, imported):
        refused(
            preview(engine, {"key_format": "boring"}),
            400,
            "INVALID_REQUEST",
            "key_format",
        )

    def test_a_node_not_in_the_tree_is_a_400_naming_it(self, engine, imported):
        refused(
            preview(engine, {"collection_ids": [987654]}),
            400,
            "INVALID_REQUEST",
            "987654",
        )

    def test_a_library_never_imported_is_a_typed_refusal(self, engine, store):
        error = refused(preview(engine, {}), 409, api.SOURCE_REFUSED)

        assert error["reason"] == SOURCE_NEVER_IMPORTED
        assert error["path"] is None

    def test_a_source_that_is_gone_is_a_typed_refusal_naming_it(self, engine, imported):
        imported.unlink()

        error = refused(preview(engine, {}), 409, api.SOURCE_REFUSED)

        assert error["reason"] == SOURCE_MISSING
        assert error["path"] == str(imported)

    def test_a_source_that_is_not_a_collection_is_a_typed_refusal(
        self, engine, imported
    ):
        imported.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")

        error = refused(preview(engine, {}), 409, api.SOURCE_REFUSED, "not well-formed")

        assert error["reason"] == SOURCE_INVALID
        assert error["path"] == str(imported)

    def test_a_preview_writes_nothing_and_starts_nothing(
        self, engine, store, imported, folder
    ):
        before = imported.read_bytes()

        ok(preview(engine, {}))

        assert imported.read_bytes() == before
        assert export_jobs(store) == []
        assert list(folder.iterdir()) == []
        assert ok(history(engine))["exports"] == []


class TestAPreviewWhileTheLibraryIsBusy:
    """Refused exactly when a start would be, so the dialog can say what it is
    waiting for before anyone confirms anything."""

    @pytest.mark.parametrize(
        "job_type", ("library_import", "library_batch", JOB_TYPE_REKORDBOX_EXPORT)
    )
    def test_it_names_the_job_holding_the_library(
        self, engine, store, imported, job_type
    ):
        release = blocking_job(store, job_type, LIBRARY_JOB_TYPES)
        try:
            error = refused(preview(engine, {}), 409, api.LIBRARY_BUSY)
        finally:
            release.set()

        assert error["job_type"] == job_type
        assert error["job_id"]

    def test_a_match_does_not_hold_it_up(self, engine, store, imported):
        """A match writes nothing an export reads, and does not hold up a start."""
        release = blocking_job(store, "clean_match")
        try:
            ok(preview(engine, {}))
        finally:
            release.set()

    def test_it_is_answered_again_once_the_job_has_ended(self, engine, store, imported):
        release = blocking_job(store, "library_import", LIBRARY_JOB_TYPES)
        refused(preview(engine, {}), 409, api.LIBRARY_BUSY)
        release.set()
        wait_until(
            lambda: all(job.state in TERMINAL for job in store.list_all()),
            "the blocking job to end",
        )

        ok(preview(engine, {}))

    def test_a_malformed_body_is_still_a_400_first(self, engine, store, imported):
        """What the request says is judged before the library's state."""
        release = blocking_job(store, "library_import", LIBRARY_JOB_TYPES)
        try:
            refused(preview(engine, {"collection_ids": "x"}), 400, "INVALID_REQUEST")
        finally:
            release.set()


# ------------------------------------------------------------------- the start


class TestTheStart:
    def test_a_start_returns_a_job_id_and_the_job_writes_the_file(
        self, engine, store, set_list, folder
    ):
        destination = folder / "out.xml"
        node = int(set_list.id)

        answer = ok(
            start(
                engine,
                {
                    "collection_ids": [node, node],
                    "key_format": "camelot",
                    "destination_path": str(destination),
                },
            ),
            202,
        )

        assert answer["job_id"] == answer["id"]
        assert answer["state"] in {"queued", "running", "succeeded"}
        assert answer["collection_ids"] == [node]
        assert answer["key_format"] == "camelot"
        assert answer["destination_path"] == str(destination)
        wait_until(lambda: store.get(answer["job_id"]).state in TERMINAL, "the export")
        job = store.get(answer["job_id"])
        assert job.type == JOB_TYPE_REKORDBOX_EXPORT
        assert job.state is JobState.SUCCEEDED
        assert job.result["outcome"] == EXPORT_WRITTEN
        assert job.result["playlist_count"] == 1
        assert destination.is_file()

    def test_the_job_can_be_read_back_over_the_job_route(
        self, engine, store, imported, folder
    ):
        job = exported(engine, store, {"destination_path": str(folder / "out.xml")})

        answer = ok(call(engine, "GET", f"/api/v1/jobs/{job.id}"))

        assert answer["type"] == JOB_TYPE_REKORDBOX_EXPORT
        assert answer["state"] == "succeeded"

    def test_a_relative_destination_is_answered_as_where_it_will_go(
        self, engine, store, imported, folder, monkeypatch
    ):
        monkeypatch.chdir(folder)

        answer = ok(start(engine, {"destination_path": "relative.xml"}), 202)

        assert answer["destination_path"] == os.path.abspath("relative.xml")
        wait_until(lambda: store.get(answer["job_id"]).state in TERMINAL, "the export")

    def test_the_source_as_the_destination_is_a_typed_refusal_and_starts_nothing(
        self, engine, store, imported
    ):
        before = imported.read_bytes()

        error = refused(
            start(engine, {"destination_path": str(imported)}),
            400,
            api.DESTINATION_REFUSED,
        )

        assert error["reason"] == DESTINATION_IS_SOURCE
        assert error["path"] == str(imported)
        assert export_jobs(store) == []
        assert imported.read_bytes() == before
        assert ok(history(engine))["exports"] == []

    def test_the_source_spelled_differently_is_refused_all_the_same(
        self, engine, store, imported
    ):
        spelled = str(imported.parent / "." / imported.name.upper())

        error = refused(
            start(engine, {"destination_path": spelled}), 400, api.DESTINATION_REFUSED
        )

        assert error["reason"] == DESTINATION_IS_SOURCE
        assert export_jobs(store) == []

    @pytest.mark.parametrize(
        "make, reason",
        (
            (lambda folder: str(folder / "out.mp3"), DESTINATION_NOT_XML),
            (
                lambda folder: str(_made(folder / "looks like a file.xml")),
                DESTINATION_IS_FOLDER,
            ),
            (
                lambda folder: str(folder / "gone" / "out.xml"),
                DESTINATION_FOLDER_MISSING,
            ),
            (lambda folder: "   ", DESTINATION_BLANK),
        ),
    )
    def test_every_other_destination_refusal_is_typed(
        self, engine, store, imported, folder, make, reason
    ):
        error = refused(
            start(engine, {"destination_path": make(folder)}),
            400,
            api.DESTINATION_REFUSED,
        )

        assert error["reason"] == reason
        assert export_jobs(store) == []

    @pytest.mark.parametrize("body", ({}, {"destination_path": None}))
    def test_no_destination_is_the_blank_refusal(self, engine, store, imported, body):
        error = refused(start(engine, body), 400, api.DESTINATION_REFUSED)

        assert error["reason"] == DESTINATION_BLANK
        assert export_jobs(store) == []

    @pytest.mark.parametrize(
        "body, words",
        (
            ({"destination_path": 5}, ("destination_path",)),
            ({"destination_path": ["a.xml"]}, ("destination_path",)),
            (
                {"collection_ids": "all", "destination_path": "a.xml"},
                ("collection_ids",),
            ),
            ({"key_format": False, "destination_path": "a.xml"}, ("key_format",)),
            (
                {"overwrite": True, "destination_path": "a.xml"},
                ("Unknown field overwrite",),
            ),
        ),
    )
    def test_a_malformed_start_is_a_400_and_starts_nothing(
        self, engine, store, imported, body, words
    ):
        refused(start(engine, body), 400, "INVALID_REQUEST", *words)

        assert export_jobs(store) == []

    def test_null_selection_fields_are_read_as_absent(
        self, engine, store, imported, folder
    ):
        job = exported(
            engine,
            store,
            {
                "collection_ids": None,
                "key_format": None,
                "destination_path": str(folder / "out.xml"),
            },
        )

        assert job.state is JobState.SUCCEEDED
        assert job.result["key_format"] == DEFAULT_KEY_FORMAT

    def test_a_library_never_imported_refuses_the_start(self, engine, store, folder):
        error = refused(
            start(engine, {"destination_path": str(folder / "out.xml")}),
            409,
            api.SOURCE_REFUSED,
        )

        assert error["reason"] == SOURCE_NEVER_IMPORTED
        assert export_jobs(store) == []

    def test_a_busy_library_names_the_job_holding_it(
        self, engine, store, imported, folder
    ):
        release = blocking_job(store, "library_import", LIBRARY_JOB_TYPES)
        try:
            error = refused(
                start(engine, {"destination_path": str(folder / "out.xml")}),
                409,
                api.LIBRARY_BUSY,
            )
        finally:
            release.set()

        assert error["job_type"] == "library_import"
        assert error["job_id"]
        assert export_jobs(store) == []
        assert not (folder / "out.xml").exists()


# ----------------------------------------------------------------- the history


class TestTheHistory:
    def test_nothing_exported_is_an_empty_history_and_the_defaults(
        self, engine, imported
    ):
        answer = ok(history(engine))

        assert answer["exports"] == []
        assert answer["limit"] == api.HISTORY_LIMIT_DEFAULT
        assert answer["remembered"] == {
            "folder": None,
            "folder_exists": False,
            "key_format": DEFAULT_KEY_FORMAT,
            "export_id": None,
        }

    def test_history_is_newest_first_with_each_exports_playlists(
        self, engine, store, set_list, folder
    ):
        exported(engine, store, {"destination_path": str(folder / "first.xml")})
        exported(
            engine,
            store,
            {
                "collection_ids": [int(set_list.id)],
                "key_format": "camelot",
                "destination_path": str(folder / "second.xml"),
            },
        )

        first, second = ok(history(engine))["exports"][::-1]

        assert second["destination_path"] == str(folder / "second.xml")
        assert second["key_format"] == "camelot"
        assert second["outcome"] == EXPORT_WRITTEN
        assert second["source_stale"] is False
        assert isinstance(second["fields"], list)
        [playlist] = second["playlists"]
        assert playlist["name"] == "Saturday"
        assert playlist["entry_count"] == 3
        assert playlist["requested_count"] == 3
        assert playlist["collection_id"] == int(set_list.id)
        assert playlist["rules"] is None
        assert first["playlists"] == []

    def test_a_row_is_answered_as_a_reader_needs_it(
        self, engine, store, imported, folder
    ):
        exported(engine, store, {"destination_path": str(folder / "out.xml")})

        [row] = ok(history(engine))["exports"]

        assert set(row) == {
            "id",
            "job_id",
            "started_at",
            "finished_at",
            "outcome",
            "destination_path",
            "source_path",
            "source_stale",
            "key_format",
            "track_count",
            "changed_track_count",
            "fields",
            "missing_file_count",
            "file_check_known",
            "dropped_reference_count",
            "error",
            "playlists",
        }
        assert row["track_count"] == 3
        assert row["source_path"] == str(imported)

    def test_the_next_export_starts_where_the_last_one_that_wrote_went(
        self, engine, store, imported, folder
    ):
        job = exported(
            engine,
            store,
            {"key_format": "short", "destination_path": str(folder / "out.xml")},
        )

        remembered = ok(history(engine))["remembered"]

        assert remembered == {
            "folder": str(folder),
            "folder_exists": True,
            "key_format": "short",
            "export_id": job.result["export_id"],
        }

    def test_the_remembered_folder_says_when_it_is_gone(
        self, engine, store, imported, tmp_path
    ):
        gone = tmp_path / "gone"
        gone.mkdir()
        exported(engine, store, {"destination_path": str(gone / "out.xml")})
        (gone / "out.xml").unlink()
        gone.rmdir()

        remembered = ok(history(engine))["remembered"]

        assert remembered["folder"] == str(gone)
        assert remembered["folder_exists"] is False

    def test_limit_pages_the_history(self, engine, store, imported, folder):
        for name in ("a", "b", "c"):
            exported(engine, store, {"destination_path": str(folder / f"{name}.xml")})

        answer = ok(history(engine, limit=2))

        assert answer["limit"] == 2
        assert [Path(row["destination_path"]).name for row in answer["exports"]] == [
            "c.xml",
            "b.xml",
        ]

    @pytest.mark.parametrize(
        "given, answered", (("0", 1), ("-4", 1), ("100000", MAX_RECENT), ("", 20))
    )
    def test_limit_is_clamped_rather_than_refused(
        self, engine, imported, given, answered
    ):
        assert ok(history(engine, limit=given))["limit"] == answered

    def test_a_limit_that_is_not_a_number_is_a_400(self, engine, imported):
        refused(history(engine, limit="ten"), 400, "INVALID_REQUEST", "limit")

    def test_a_limit_given_twice_is_a_400(self, engine, imported):
        refused(
            call(engine, "GET", f"{api.HISTORY_PATH}?limit=1&limit=2"),
            400,
            "INVALID_REQUEST",
            "once",
        )

    def test_history_is_readable_before_anything_is_imported(self, engine, store):
        assert ok(history(engine))["exports"] == []


# --------------------------------------------------------------- the statuses


class TestStatuses:
    """The mapping, stated once and checked once per branch."""

    def test_a_destination_refusal(self):
        status, payload = api.status_for(
            ExportDestinationError(DESTINATION_NOT_XML, "Not XML", "C:/a.mp3")
        )

        assert status == 400
        assert payload["error"] == {
            "code": api.DESTINATION_REFUSED,
            "message": "Not XML",
            "reason": DESTINATION_NOT_XML,
            "path": "C:/a.mp3",
        }

    def test_a_source_refusal(self):
        status, payload = api.status_for(
            ExportSourceError(SOURCE_MISSING, "Gone", "C:/c.xml")
        )

        assert status == 409
        assert payload["error"]["code"] == api.SOURCE_REFUSED
        assert payload["error"]["reason"] == SOURCE_MISSING
        assert payload["error"]["path"] == "C:/c.xml"

    def test_a_busy_library(self):
        status, payload = api.status_for(JobTypeBusyError("library_import", "j-1"))

        assert status == 409
        assert payload["error"]["code"] == api.LIBRARY_BUSY
        assert payload["error"]["job_id"] == "j-1"
        assert payload["error"]["job_type"] == "library_import"

    @pytest.mark.parametrize(
        "exc",
        (
            ValueError("key_format must be one of"),
            FilterRuleError("No such tag: 7"),
            ValidationError("Something else about the request"),
        ),
    )
    def test_a_request_that_cannot_be_honoured(self, exc):
        status, payload = api.status_for(exc)

        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert "[" not in payload["error"]["message"]

    def test_an_api_error_keeps_its_own_status(self):
        status, payload = api.status_for(bad_request("nope"))

        assert (status, payload["error"]["code"]) == (400, "INVALID_REQUEST")

    def test_an_unreachable_database(self):
        status, payload = api.status_for(api.RekordboxExportUnavailableError("down"))

        assert (status, payload["error"]["code"]) == (503, "LIBRARY_UNAVAILABLE")

    def test_anything_else_is_a_500_unclassified(self):
        status, payload = api.status_for(RuntimeError("surprise"))

        assert (status, payload["error"]["code"]) == (500, "REKORDBOX_EXPORT_FAILED")
        assert payload["error"]["message"] == "surprise"

    def test_the_typed_refusals_are_checked_before_the_generic_ones(self):
        """Each typed refusal is also a ValidationError. Flattened into a
        generic 400, it would lose the reason that is the point of it."""
        for exc in (
            ExportDestinationError(DESTINATION_BLANK, "Blank"),
            ExportSourceError(SOURCE_NEVER_IMPORTED, "Never"),
        ):
            assert isinstance(exc, ValidationError)
            assert api.status_for(exc)[1]["error"]["code"] != "INVALID_REQUEST"

    def test_a_service_that_cannot_be_resolved_is_a_503_over_the_wire(
        self, engine, imported, monkeypatch
    ):
        def unresolvable(name: str) -> Any:
            raise api.RekordboxExportUnavailableError("database is locked")

        monkeypatch.setattr(api, "_resolve", unresolvable)

        refused(preview(engine, {}), 503, "LIBRARY_UNAVAILABLE", "locked")
        refused(history(engine), 503, "LIBRARY_UNAVAILABLE")


class TestParsing:
    """The three readers, directly, for the cases a route test would repeat."""

    def test_collection_ids_keep_order_and_repeats_for_the_service(self):
        assert api.parse_collection_ids({"collection_ids": [3, 1, 3]}) == (3, 1, 3)

    def test_absent_and_null_are_none_chosen(self):
        assert api.parse_collection_ids({}) == ()
        assert api.parse_collection_ids({"collection_ids": None}) == ()

    def test_absent_and_null_notation_is_the_default(self):
        assert api.parse_key_format({}) == DEFAULT_KEY_FORMAT
        assert api.parse_key_format({"key_format": None}) == DEFAULT_KEY_FORMAT

    def test_the_notation_is_passed_on_for_the_service_to_judge(self):
        assert api.parse_key_format({"key_format": "Camelot "}) == "Camelot "

    def test_absent_and_null_destination_is_blank(self):
        assert api.parse_destination({}) == ""
        assert api.parse_destination({"destination_path": None}) == ""

    def test_the_destination_is_passed_on_as_sent(self):
        assert api.parse_destination({"destination_path": " a.xml"}) == " a.xml"


class TestHistoryRows:
    """How a recorded playlist comes back, directly, for the cases a running
    engine would take a Smart Collection and a corrupted row to reach."""

    def _playlist(self, **overrides):
        from cuepoint.models.rekordbox_export import RekordboxExportPlaylist

        values = dict(
            id=1,
            export_id=1,
            collection_id=4,
            kind="smart",
            name="Peak time",
            path="CuePoint/Peak time",
            entry_count=5,
            dropped_count=2,
            rules_json='{"match": "all", "rules": [{"field": "bpm", "op": "gte", "value": 130}]}',
        )
        values.update(overrides)
        return RekordboxExportPlaylist(**values)

    def test_a_smart_playlists_rules_come_back_as_an_object(self):
        row = api.export_playlist_to_dict(self._playlist())

        assert row["rules"] == {
            "match": "all",
            "rules": [{"field": "bpm", "op": "gte", "value": 130}],
        }
        assert row["requested_count"] == 7

    def test_rules_that_are_not_an_object_come_back_as_none(self):
        """The row is still history worth showing, as the tree shows a Smart
        Collection whose rules cannot be read."""
        assert (
            api.export_playlist_to_dict(self._playlist(rules_json="[1, 2]"))["rules"]
            is None
        )

    def test_a_collection_has_no_rules(self):
        row = api.export_playlist_to_dict(
            self._playlist(kind="collection", rules_json=None)
        )

        assert row["rules"] is None
