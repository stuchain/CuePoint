#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The waveform analysis's TypeScript agrees with what the engine sends (WAVE-03).

The engine serializes the analysis's status and its refusals; the Electron
client declares each as a TypeScript type, and the renderer's bridge types copy
them (``desktopContract.test.ts`` holds the two TypeScript copies together).
This holds the client's copy to real answers: a field the engine sends and the
client never declares is one the Health view cannot show, and one it declares
that never arrives is shown as ``undefined``.
"""

from __future__ import annotations

import re

import pytest

from cuepoint.engine import waveforms_api as api
from cuepoint.engine.jobs import JobStore
from cuepoint.engine.waveform_jobs import AnalysisSettings, bind
from cuepoint.models.waveform_analysis import ANALYSIS_STATES
from cuepoint.services.config_service import ConfigService
from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import WaveformLibrary
from tests.unit.engine.test_discover_contract import _client, _fields, _union

pytestmark = pytest.mark.unit


@pytest.fixture
def store(tmp_path):
    library = WaveformLibrary(tmp_path / "library")
    library.add("a")
    jobs = JobStore()
    bind(
        jobs,
        service=lambda: library.analysis,
        settings=AnalysisSettings(
            lambda config=ConfigService(tmp_path / "config.yaml"): config
        ),
    )
    yield jobs
    wait_until_settled(jobs, "the contract's jobs")
    library.close()


def test_the_status_carries_exactly_the_declared_fields(store):
    for answer in (api.analysis(store), api.pause(store), api.resume(store)):
        assert _fields("WaveformAnalysisStatus") == set(answer)


def test_every_state_is_typed():
    assert _union("WaveformAnalysisState") == set(ANALYSIS_STATES)


def test_every_code_a_refusal_can_carry_is_declared():
    assert _union("WaveformRefusalCode") == set(api.REFUSAL_CODES)
    text = _client()
    start = text.index("= [", text.index("export const WAVEFORM_REFUSAL_CODES")) + 3
    listed = set(re.findall(r'"([^"]+)"', text[start : text.index("];", start)]))
    assert listed == set(api.REFUSAL_CODES)


def test_the_client_calls_every_route_the_engine_answers():
    text = _client()
    for path in (*api.GET_PATHS, *api.POST_PATHS):
        assert f'"{path}"' in text, path
