#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library analysis through a real mpv, as the engine runs it (WAVE-03).

The unit tests prove what the job decides with a stand-in decoder; these prove
the whole path with a real one. A library of every shipped format and
``bands.flac`` is analysed by a real job: every file gets a waveform of its own
length, a broken file is stored as failed, a second run after a whole-library
check decodes nothing, and Activity records each run once.

The decoder is found as the other binary tests find it: the bundled sidecar,
then ``CUEPOINT_MPV_PATH``, then an ``mpv`` on the ``PATH``. Every test skips
when there is none. Desktop CI runs them with the pinned builds.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

import pytest

from cuepoint.core.waveform import decode
from cuepoint.data.audio_decode import ANALYSIS_VERSION
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.waveform_jobs import (
    JOB_TYPE_WAVEFORM_ANALYSIS,
    AnalysisSettings,
    analysis_after_file_check,
    bind,
)
from cuepoint.models.waveform import STORED_FAILED, STORED_READY
from cuepoint.services.config_service import ConfigService
from tests.fixtures.job_settling import wait_until_settled
from tests.fixtures.waveform_library import WaveformLibrary

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO / "src" / "tests" / "fixtures" / "audio"
_SCRIPT = _REPO / "scripts" / "fetch_player_sidecar.py"
FIXTURES = ("tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3", "bands.flac")


def _bundled() -> Optional[Path]:
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", _SCRIPT)
    assert spec and spec.loader
    fps = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, fps)
    spec.loader.exec_module(fps)
    target = fps.load_manifest().targets.get(fps.host_target_key())
    if target is None or not target.supported:
        return None
    path = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    return path if path.exists() else None


@pytest.fixture(scope="module")
def mpv() -> Path:
    for candidate in (
        _bundled(),
        os.environ.get("CUEPOINT_MPV_PATH"),
        shutil.which("mpv"),
    ):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    pytest.skip(
        "no mpv: run `python scripts/fetch_player_sidecar.py`, or set CUEPOINT_MPV_PATH"
    )


@pytest.fixture
def lib(tmp_path, mpv):
    library = WaveformLibrary(tmp_path / "library", real_decoder=mpv)
    yield library
    library.close()


@pytest.fixture
def engine(lib, tmp_path):
    store = JobStore()
    bind(
        store,
        service=lambda: lib.analysis,
        settings=AnalysisSettings(
            lambda config=ConfigService(tmp_path / "config.yaml"): config
        ),
    )
    yield store
    wait_until_settled(store, "the real analysis", timeout=300)


def test_a_real_run_analyses_every_shipped_format(lib, engine):
    for name in FIXTURES:
        shutil.copyfile(_FIXTURES / name, lib.path(name))
        lib.add(name)
    broken = lib.path("broken.mp3")
    broken.write_bytes(b"this is text, not audio" * 100)
    lib.add("broken.mp3")

    job = analysis_after_file_check(engine, "import")
    wait_until_settled(engine, "the real analysis", timeout=300)

    assert job is not None and job.state == JobState.SUCCEEDED
    assert job.result["analysed"] == len(FIXTURES)
    assert job.result["failed"] == 1
    stored = lib.stored()
    assert stored.pop("broken.mp3") == STORED_FAILED
    assert stored == {name: STORED_READY for name in FIXTURES}
    for name in FIXTURES:
        row = lib.store.get(str(lib.path(name)), ANALYSIS_VERSION)
        assert row is not None and row.data is not None
        picture = decode(row.data)
        assert picture.duration_ms == row.duration_ms
        assert row.duration_ms > 0
    assert len(lib.events()) == 1


def test_a_second_run_after_a_check_decodes_nothing(lib, engine):
    for name in ("tone.flac", "tone.mp3"):
        shutil.copyfile(_FIXTURES / name, lib.path(name))
        lib.add(name)
    analysis_after_file_check(engine, "import")
    wait_until_settled(engine, "the first run", timeout=300)
    first = {
        name: lib.store.get(str(lib.path(name)), ANALYSIS_VERSION).analysed_at
        for name in ("tone.flac", "tone.mp3")
    }

    analysis_after_file_check(engine, "refresh")
    wait_until_settled(engine, "the second run", timeout=300)

    jobs = sorted(
        (job for job in engine.list_all() if job.type == JOB_TYPE_WAVEFORM_ANALYSIS),
        key=lambda job: job.created_at,
    )
    assert jobs[-1].result["analysed"] == 0
    assert jobs[-1].result["up_to_date"] == 2
    assert {
        name: lib.store.get(str(lib.path(name)), ANALYSIS_VERSION).analysed_at
        for name in ("tone.flac", "tone.mp3")
    } == first
