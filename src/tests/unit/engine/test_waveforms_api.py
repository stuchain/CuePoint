#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The waveform analysis over the wire (WAVE-03).

A real engine on a loopback port, its analysis bound to a real library, store
and settings file, and a stand-in decoder. So: each route's shape, pause and
resume through the routes (persisted, and acted on), the cancel route acting
as Pause for this job, and the refusals: a parameter or a body a route does not
take, no token, and a setting that cannot be saved.
"""

from __future__ import annotations

import json
import socket
import threading
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

import pytest

from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.engine.waveform_jobs import SETTING_PAUSED, AnalysisSettings, bind
from cuepoint.engine.waveforms_api import (
    ANALYSIS_PATH,
    PAUSE_PATH,
    RESUME_PATH,
    SETTING_FAILED,
    handles_get,
    handles_post,
)
from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError
from cuepoint.models.waveform import STORED_READY
from cuepoint.services.config_service import ConfigService
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
def engine(lib, tmp_path):
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


def test_the_module_answers_exactly_its_three_routes():
    assert handles_get(ANALYSIS_PATH) and not handles_get(PAUSE_PATH)
    assert handles_post(PAUSE_PATH) and handles_post(RESUME_PATH)
    assert not handles_post(ANALYSIS_PATH)
    assert ANALYSIS_PATH == "/api/v1/waveforms/analysis"
    assert PAUSE_PATH == "/api/v1/waveforms/analysis/pause"
    assert RESUME_PATH == "/api/v1/waveforms/analysis/resume"


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
