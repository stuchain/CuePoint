#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Waveforms and their analysis over the wire (WAVE-03, WAVE-05).

A real engine on a loopback port, its analysis bound to a real library, store
and settings file, and a stand-in decoder. So: each route's shape, pause and
resume through the routes (persisted, and acted on), the cancel route acting
as Pause for this job, and the refusals: a parameter or a body a route does not
take, no token, and a setting that cannot be saved.

WAVE-05's routes: the waveforms themselves (their shape, their limits, marks,
the paused flag and unknown ids), requests, and "Delete waveform data", which
empties the store and starts the analysis again unless paused.
"""

from __future__ import annotations

import base64
import json
import socket
import threading
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

import pytest

from cuepoint.data.audio_decode import DecodeFailed
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.engine.waveform_jobs import SETTING_PAUSED, AnalysisSettings, bind
from cuepoint.engine.waveforms_api import (
    ANALYSIS_PATH,
    DELETE_DATA_PATH,
    MAX_REQUESTED,
    MAX_TRACKS,
    PAUSE_PATH,
    REQUEST_PATH,
    RESUME_PATH,
    SETTING_FAILED,
    STORE_FAILED,
    UNAVAILABLE,
    WAVEFORMS_PATH,
    handles_get,
    handles_post,
)
from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError
from cuepoint.models.file_status import FILE_MISSING, TrackFileStatus
from cuepoint.models.track_marks import MARKS_INDEX
from cuepoint.models.waveform import STORED_READY
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.waveform_store import WaveformStoreError
from cuepoint.services.config_service import ConfigService
from cuepoint.services.interfaces import ITrackMarksRepository, IWaveformService
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import WaveformLibrary, envelope

TOKEN = "waveforms-test-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Engine:
    def __init__(self, base: str, store: JobStore) -> None:
        self.base = base
        self.store = store

    def call(
        self,
        path: str,
        *,
        method: str = "GET",
        body: Optional[bytes] = None,
        token: Optional[str] = TOKEN,
    ) -> Tuple[int, Dict[str, Any]]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            self.base + path, data=body, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))


@pytest.fixture
def lib(tmp_path):
    library = WaveformLibrary(tmp_path / "library")
    yield library
    library.close()


def serve(store: JobStore):
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    return f"http://127.0.0.1:{port}", server, thread


@pytest.fixture
def services(lib):
    """The services the waveform read resolves, over the test's library."""
    reset_container()
    container = get_container()
    container.register_singleton(IWaveformService, lib.waveforms)
    marks = TrackMarksRepository(lib.db)
    container.register_singleton(ITrackMarksRepository, marks)
    yield marks
    reset_container()


@pytest.fixture
def engine(lib, tmp_path, services):
    store = JobStore()
    config_file = tmp_path / "config.yaml"
    bind(
        store,
        service=lambda: lib.analysis,
        settings=AnalysisSettings(lambda config=ConfigService(config_file): config),
        workers=1,
    )
    base, server, thread = serve(store)
    try:
        yield Engine(base, store)
    finally:
        wait_until_settled(store, "the route test's jobs")
        server.shutdown()
        thread.join(timeout=2)


def test_the_module_answers_exactly_its_six_routes():
    assert handles_get(WAVEFORMS_PATH) and handles_get(ANALYSIS_PATH)
    assert not handles_get(PAUSE_PATH) and not handles_get(WAVEFORMS_PATH + "/")
    for path in (PAUSE_PATH, RESUME_PATH, REQUEST_PATH, DELETE_DATA_PATH):
        assert handles_post(path), path
    assert not handles_post(ANALYSIS_PATH) and not handles_post(WAVEFORMS_PATH)
    assert WAVEFORMS_PATH == "/api/v1/waveforms"
    assert ANALYSIS_PATH == "/api/v1/waveforms/analysis"
    assert PAUSE_PATH == "/api/v1/waveforms/analysis/pause"
    assert RESUME_PATH == "/api/v1/waveforms/analysis/resume"
    assert REQUEST_PATH == "/api/v1/waveforms/request"
    assert DELETE_DATA_PATH == "/api/v1/waveforms/delete-data"


def test_the_analysis_answers_its_state_and_counts(lib, engine):
    lib.add("a")
    lib.add("b")

    status, body = engine.call(ANALYSIS_PATH)

    assert status == 200
    assert body == {
        "state": "idle",
        "paused": False,
        "job_id": None,
        "present": 2,
        "analysed": 0,
        "failed": 0,
        "remaining": 2,
        "rate_per_hour": None,
        "eta_seconds": None,
        "reason": None,
        "store_bytes": lib.store.disk_bytes(),
    }


def test_pause_and_resume_through_the_routes(lib, engine, tmp_path):
    lib.add("a")

    paused_status, paused = engine.call(PAUSE_PATH, method="POST", body=b"{}")
    saved = ConfigService(tmp_path / "config.yaml").get(SETTING_PAUSED)
    resumed_status, resumed = engine.call(RESUME_PATH, method="POST", body=b"")
    wait_until_settled(engine.store, "the resumed run")
    _, after = engine.call(ANALYSIS_PATH)

    assert (paused_status, paused["state"], paused["paused"]) == (200, "paused", True)
    assert saved is True
    assert resumed_status == 200 and resumed["paused"] is False
    assert resumed["state"] in ("running", "idle")
    assert (after["state"], after["analysed"], after["remaining"]) == ("idle", 1, 0)
    assert lib.stored() == {"a": STORED_READY}


def test_the_job_cancel_route_pauses_this_job(lib, engine, tmp_path):
    lib.add("a")
    lib.add("b")
    entered, release = threading.Event(), threading.Event()

    def hold(source):
        entered.set()
        assert release.wait(10)
        return envelope()

    lib.decoder.default = hold
    _, resumed = engine.call(RESUME_PATH, method="POST")
    assert entered.wait(10)
    job_id = resumed["job_id"]

    status, _ = engine.call(f"/api/v1/jobs/{job_id}/cancel", method="POST", body=b"{}")
    release.set()
    wait_until_settled(engine.store, "the paused run")
    _, job = engine.call(f"/api/v1/jobs/{job_id}")
    _, analysis = engine.call(ANALYSIS_PATH)

    assert status == 200
    assert job["state"] == JobState.CANCELLED.value
    assert job["error"]["reason"] == "paused"
    assert analysis["state"] == "paused"
    assert ConfigService(tmp_path / "config.yaml").get(SETTING_PAUSED) is True


@pytest.mark.parametrize(
    "path, method, body, word",
    [
        (ANALYSIS_PATH + "?width=120", "GET", None, "width"),
        (PAUSE_PATH, "POST", b'{"now": true}', "now"),
        (RESUME_PATH, "POST", b"[1]", "object"),
        (RESUME_PATH, "POST", b"{not json", "JSON"),
    ],
)
def test_what_a_route_does_not_take_is_refused(engine, path, method, body, word):
    status, payload = engine.call(path, method=method, body=body)

    assert status == 400
    assert payload["error"]["code"] == "INVALID_REQUEST"
    assert word in payload["error"]["message"]


@pytest.mark.parametrize("path, method", [(ANALYSIS_PATH, "GET"), (PAUSE_PATH, "POST")])
def test_every_route_needs_the_token(engine, path, method):
    status, payload = engine.call(path, method=method, body=b"{}", token=None)

    assert status == 401 and payload["error"]["code"] == "UNAUTHORIZED"


def test_a_setting_that_cannot_be_saved_is_named(lib):
    class ReadOnly:
        def get(self, key, default=None):
            return False

        def set(self, key, value):
            pass

        def save(self):
            raise ConfigurationError(message="read-only disk")

    store = JobStore()
    bind(store, service=lambda: lib.analysis, settings=AnalysisSettings(ReadOnly))
    base, server, thread = serve(store)
    try:
        status, payload = Engine(base, store).call(PAUSE_PATH, method="POST")
    finally:
        server.shutdown()
        thread.join(timeout=2)

    assert status == 500
    assert payload["error"]["code"] == SETTING_FAILED


# ---------------------------------------------------------------------------
# WAVE-05: the waveforms themselves
# ---------------------------------------------------------------------------


def analysed(lib, *names: str) -> None:
    for name in names:
        assert lib.waveforms.analyse(lib.id(name)).outcome == "ready"


def read(engine, ids, width=120, marks=None):
    query = f"?track_ids={','.join(str(i) for i in ids)}&width={width}"
    if marks is not None:
        query += f"&marks={marks}"
    return engine.call(WAVEFORMS_PATH + query)


class TestTheWaveforms:
    def test_each_track_answers_its_state_and_a_ready_one_its_picture(
        self, lib, engine
    ):
        lib.add("a")
        lib.add("b")
        lib.add("c", checked=False)
        analysed(lib, "a")

        status, body = read(engine, [lib.id("c"), lib.id("a"), lib.id("b")], 120)

        assert status == 200
        assert body["width"] == 120 and body["paused"] is False
        assert body["unknown"] == []
        tracks = body["waveforms"]
        assert [t["track_id"] for t in tracks] == [
            lib.id("c"),
            lib.id("a"),
            lib.id("b"),
        ]
        assert [t["state"] for t in tracks] == ["unchecked", "ready", "waiting"]
        ready = tracks[1]
        expected = lib.waveforms.waveform(lib.id("a"), 120)
        assert base64.b64decode(ready["data"]) == expected.data
        assert len(base64.b64decode(ready["data"])) == 120 * 4
        assert ready["duration_ms"] == expected.state.duration_ms
        for track in tracks:
            assert set(track) == {
                "track_id",
                "state",
                "reason",
                "duration_ms",
                "loudness",
                "data",
                "marks",
            }
            assert track["marks"] is None
        assert tracks[0]["data"] is None and tracks[2]["data"] is None

    @pytest.mark.parametrize("width", [16, 17, 333, 1200])
    def test_every_width_from_16_to_1200(self, lib, engine, width):
        lib.add("a")
        analysed(lib, "a")

        _, body = read(engine, [lib.id("a")], width)

        assert len(base64.b64decode(body["waveforms"][0]["data"])) == width * 4

    def test_a_failed_and_a_missing_track_say_why(self, lib, engine):
        lib.add("a")
        lib.add("b")
        lib.decoder.answers[str(lib.path("a"))] = DecodeFailed("undecodable", "stub")
        lib.waveforms.analyse(lib.id("a"))
        lib.path("b").unlink()
        lib.files.record(
            [TrackFileStatus(lib.id("b"), FILE_MISSING, str(lib.path("b")), "now")]
        )

        _, body = read(engine, [lib.id("a"), lib.id("b")])

        failed, missing = body["waveforms"]
        assert (failed["state"], failed["reason"]) == ("failed", "undecodable")
        assert (missing["state"], missing["reason"]) == ("missing", "missing")

    def test_while_paused_a_waiting_track_says_the_analysis_is_paused(
        self, lib, engine
    ):
        lib.add("a")
        engine.call(PAUSE_PATH, method="POST")

        _, body = read(engine, [lib.id("a")])

        assert body["paused"] is True
        assert body["waveforms"][0]["state"] == "waiting"

    def test_an_id_that_is_no_track_is_listed_not_refused(self, lib, engine):
        lib.add("a")

        status, body = read(engine, [999_999, lib.id("a")])

        assert status == 200
        assert body["unknown"] == [999_999]
        assert [t["track_id"] for t in body["waveforms"]] == [lib.id("a")]

    def test_a_repeated_id_is_answered_once(self, lib, engine):
        lib.add("a")

        _, body = read(engine, [lib.id("a"), lib.id("a")])

        assert [t["track_id"] for t in body["waveforms"]] == [lib.id("a")]

    def test_two_hundred_ids_are_answered(self, lib, engine):
        lib.add("a")
        ids = [lib.id("a"), *range(1_000_000, 1_000_000 + MAX_TRACKS - 1)]

        status, body = read(engine, ids)

        assert status == 200
        assert len(body["unknown"]) == MAX_TRACKS - 1

    def test_with_marks_each_track_carries_its_cues_and_grid(
        self, lib, engine, services
    ):
        lib.add("a")
        lib.add("b")
        services.replace_many(
            [
                (
                    lib.id("a"),
                    [
                        ("cue", 0, 1_000, None, "Drop", "#28e214"),
                        ("loop", None, 2_000, 4_000, None, None),
                    ],
                    [(120, 128.0, "4/4", 1), (60_000, 130.0, "4/4", 2)],
                )
            ]
        )
        services.mark_read("2026-10-05T12:00:00+00:00")

        _, body = read(engine, [lib.id("a"), lib.id("b")], marks=1)

        marks_a, marks_b = (t["marks"] for t in body["waveforms"])
        assert marks_a == {
            "read": True,
            "cues": [
                {
                    "kind": "cue",
                    "hot_cue": 0,
                    "start_ms": 1_000,
                    "end_ms": None,
                    "name": "Drop",
                    "color": "#28e214",
                },
                {
                    "kind": "loop",
                    "hot_cue": None,
                    "start_ms": 2_000,
                    "end_ms": 4_000,
                    "name": None,
                    "color": None,
                },
            ],
            "grid": [
                {"start_ms": 120, "bpm": 128.0, "meter": "4/4", "beat": 1},
                {"start_ms": 60_000, "bpm": 130.0, "meter": "4/4", "beat": 2},
            ],
        }
        assert marks_b == {"read": True, "cues": [], "grid": []}

    def test_marks_of_a_library_never_read_say_so(self, lib, engine, services):
        lib.add("a")
        record = (
            lib.db.connect()
            .execute(
                "SELECT count(*) FROM derived_indexes WHERE name = ?", (MARKS_INDEX,)
            )
            .fetchone()[0]
        )

        _, body = read(engine, [lib.id("a")], marks=1)

        assert record == 0
        assert body["waveforms"][0]["marks"] == {"read": False, "cues": [], "grid": []}

    def test_marks_0_carries_none(self, lib, engine):
        lib.add("a")

        _, body = read(engine, [lib.id("a")], marks=0)

        assert body["waveforms"][0]["marks"] is None

    @pytest.mark.parametrize(
        "query, word",
        [
            ("?width=120", "track_ids is required"),
            ("?track_ids=1", "width is required"),
            ("?track_ids=1&width=15", "16 to 1200"),
            ("?track_ids=1&width=1201", "16 to 1200"),
            ("?track_ids=1&width=12.5", "16 to 1200"),
            ("?track_ids=1&width=abc", "16 to 1200"),
            ("?track_ids=1&width=-20", "16 to 1200"),
            ("?track_ids=&width=120", "track_ids"),
            ("?track_ids=0&width=120", "above 0"),
            ("?track_ids=-1&width=120", "track_ids"),
            ("?track_ids=a&width=120", "track_ids"),
            ("?track_ids=1,,2&width=120", "track_ids"),
            ("?track_ids=1&width=120&marks=2", "marks must be 0 or 1"),
            ("?track_ids=1&width=120&size=3", "size"),
            ("?track_ids=1&track_ids=2&width=120", "once"),
            ("?track_ids=1&width=120&data=2", "data must be 0 or 1"),
            ("?track_ids=1&data=1", "width is required"),
            ("?track_ids=1&width=120&data=0", "width is only taken"),
        ],
    )
    def test_what_the_read_does_not_take_is_refused(self, engine, query, word):
        status, payload = engine.call(WAVEFORMS_PATH + query)

        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert word in payload["error"]["message"]

    def test_a_ready_track_carries_its_loudness(self, lib, engine):
        lib.add("a")
        analysed(lib, "a")

        _, body = read(engine, [lib.id("a")])

        assert body["waveforms"][0]["loudness"] == {
            "integrated_lufs": -8.4,
            "peak_dbfs": -0.3,
            "reason": None,
        }

    def test_data_0_answers_states_and_loudness_and_reads_no_picture(
        self, lib, engine, monkeypatch
    ):
        """WAVE-08: the Library's Loudness column asks for a number, not a picture."""
        lib.add("a")
        lib.add("b")
        analysed(lib, "a")

        def no_pictures(*_args, **_kwargs):
            raise AssertionError("data=0 read a picture")

        monkeypatch.setattr(lib.store, "get_many", no_pictures)
        status, body = engine.call(
            f"{WAVEFORMS_PATH}?track_ids={lib.id('b')},{lib.id('a')},999&data=0"
        )

        assert status == 200
        assert body["width"] is None
        assert body["unknown"] == [999]
        tracks = body["waveforms"]
        assert [(t["track_id"], t["state"]) for t in tracks] == [
            (lib.id("b"), "waiting"),
            (lib.id("a"), "ready"),
        ]
        assert all(t["data"] is None and t["marks"] is None for t in tracks)
        assert tracks[1]["loudness"]["integrated_lufs"] == -8.4
        assert tracks[1]["duration_ms"] == 20_000

    def test_data_0_still_carries_marks_when_asked(self, lib, engine):
        lib.add("a")
        analysed(lib, "a")

        _, body = engine.call(
            f"{WAVEFORMS_PATH}?track_ids={lib.id('a')}&data=0&marks=1"
        )

        assert body["waveforms"][0]["marks"] is not None

    def test_more_than_two_hundred_ids_are_refused(self, engine):
        status, payload = read(engine, range(1, MAX_TRACKS + 2))

        assert status == 400
        assert "At most 200" in payload["error"]["message"]

    def test_a_library_that_cannot_be_reached_is_unavailable(self, lib, engine):
        reset_container()
        container = get_container()

        def unreachable():
            raise RuntimeError("database locked")

        container.register_factory(IWaveformService, unreachable)

        status, payload = read(engine, [1])

        assert status == 503
        assert payload["error"]["code"] == UNAVAILABLE


class TestRequests:
    def test_requested_tracks_are_analysed_even_while_paused(self, lib, engine):
        lib.add("a")
        lib.add("b")
        engine.call(PAUSE_PATH, method="POST")

        status, body = engine.call(
            REQUEST_PATH,
            method="POST",
            body=json.dumps({"track_ids": [lib.id("b")]}).encode(),
        )
        wait_until_settled(engine.store, "the requested run")

        assert status == 200
        assert body["requested"] == [lib.id("b")]
        assert body["job_id"]
        assert lib.stored() == {"b": STORED_READY}

    def test_a_repeated_id_is_requested_once(self, lib, engine):
        lib.add("a")

        _, body = engine.call(
            REQUEST_PATH,
            method="POST",
            body=json.dumps({"track_ids": [lib.id("a"), lib.id("a")]}).encode(),
        )

        assert body["requested"] == [lib.id("a")]

    def test_without_a_decoder_nothing_runs(self, lib, engine):
        lib.add("a")
        lib.decoder_path = None

        _, body = engine.call(
            REQUEST_PATH,
            method="POST",
            body=json.dumps({"track_ids": [lib.id("a")]}).encode(),
        )

        assert body["job_id"] is None

    @pytest.mark.parametrize(
        "body, word",
        [
            (b"{}", "track_ids must be a list"),
            (b'{"track_ids": 3}', "track_ids must be a list"),
            (b'{"track_ids": []}', "at least one"),
            (b'{"track_ids": [0]}', "above 0"),
            (b'{"track_ids": [true]}', "above 0"),
            (b'{"track_ids": ["1"]}', "above 0"),
            (b'{"track_ids": [1.5]}', "above 0"),
            (b'{"track_ids": [1], "now": true}', "now"),
            (b"[1]", "object"),
        ],
    )
    def test_what_a_request_does_not_take_is_refused(self, engine, body, word):
        status, payload = engine.call(REQUEST_PATH, method="POST", body=body)

        assert status == 400
        assert payload["error"]["code"] == "INVALID_REQUEST"
        assert word in payload["error"]["message"]

    def test_more_than_fifty_are_refused(self, engine):
        body = json.dumps({"track_ids": list(range(1, MAX_REQUESTED + 2))}).encode()

        status, payload = engine.call(REQUEST_PATH, method="POST", body=body)

        assert status == 400
        assert "At most 50" in payload["error"]["message"]


class TestDeletingTheData:
    def test_it_empties_the_store_and_the_analysis_starts_again(self, lib, engine):
        lib.add("a")
        lib.add("b")
        analysed(lib, "a", "b")

        status, body = engine.call(DELETE_DATA_PATH, method="POST", body=b"{}")
        emptied = lib.store.count()
        wait_until_settled(engine.store, "the run after the deletion")

        assert status == 200
        assert body["deleted"]["waveforms"] == 2
        assert body["deleted"]["freed_bytes"] >= 0
        assert body["analysis"]["paused"] is False
        assert set(body["analysis"]) >= {"state", "store_bytes", "present"}
        assert emptied in (0, 1, 2)  # the run after it may already be writing
        assert lib.stored() == {"a": STORED_READY, "b": STORED_READY}
        assert sorted(lib.decoder.names()) == ["a", "a", "b", "b"]

    def test_while_paused_it_stays_empty(self, lib, engine):
        lib.add("a")
        analysed(lib, "a")
        engine.call(PAUSE_PATH, method="POST")

        status, body = engine.call(DELETE_DATA_PATH, method="POST")
        wait_until_settled(engine.store, "nothing")

        assert status == 200
        assert body["deleted"]["waveforms"] == 1
        assert body["analysis"]["state"] == "paused"
        assert body["analysis"]["analysed"] == 0
        assert lib.stored() == {}

    def test_it_takes_no_body(self, engine):
        status, payload = engine.call(
            DELETE_DATA_PATH, method="POST", body=b'{"all": true}'
        )

        assert status == 400 and "all" in payload["error"]["message"]

    def test_a_store_that_cannot_be_emptied_is_named(self, lib, engine, monkeypatch):
        lib.add("a")
        analysed(lib, "a")

        def broken():
            raise WaveformStoreError(message="disk full", error_code="X")

        monkeypatch.setattr(lib.store, "clear", broken)

        status, payload = engine.call(DELETE_DATA_PATH, method="POST")

        assert status == 500
        assert payload["error"]["code"] == STORE_FAILED
        assert lib.store.count() == 1


@pytest.mark.parametrize(
    "path, method",
    [
        (WAVEFORMS_PATH + "?track_ids=1&width=120", "GET"),
        (REQUEST_PATH, "POST"),
        (DELETE_DATA_PATH, "POST"),
    ],
)
def test_wave_05_s_routes_need_the_token(engine, path, method):
    status, payload = engine.call(path, method=method, body=b"{}", token=None)

    assert status == 401 and payload["error"]["code"] == "UNAUTHORIZED"
