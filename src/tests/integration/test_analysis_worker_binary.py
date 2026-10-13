#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The analysis worker with a real mpv: the same bytes as in-process (C19g).

Moving the work to a child must change nothing a user can see, and ANALYSIS_VERSION
does not move with it: a library analysed before the move and one after hold the
same rows. So for the shipped fixtures the worker's :class:`Computed`, overview,
detail, loudness and all, equals the in-process computer's, byte for byte.

The decoder is found as ``test_waveform_service_binary.py`` finds it: the bundled
sidecar, then ``CUEPOINT_MPV_PATH``, then an ``mpv`` on the ``PATH``. Every test
skips when there is none.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

import pytest

from cuepoint.services.analysis_worker_client import WorkerComputer
from cuepoint.services.waveform_computer import COMPUTED_READY, InProcessComputer

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO / "src" / "tests" / "fixtures" / "audio"
_SCRIPT = _REPO / "scripts" / "fetch_player_sidecar.py"


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


@pytest.fixture(scope="module")
def worker():
    made = WorkerComputer()
    yield made
    made.close()


@pytest.mark.parametrize("name", ["tone.flac", "bands.flac"])
def test_the_worker_computes_what_the_engine_would_have(worker, mpv, name):
    path = str(_FIXTURES / name)
    expected = InProcessComputer().compute(path, mpv, overview=True, detail=True)
    assert expected.outcome == COMPUTED_READY and expected.detail

    computed = worker.compute(path, mpv, overview=True, detail=True)

    assert computed == expected
    assert worker.pid is not None and worker.pid != os.getpid()


def test_a_file_that_is_not_audio_is_the_same_failure_either_way(worker, mpv, tmp_path):
    broken = tmp_path / "broken.mp3"
    broken.write_bytes(b"\x00not audio at all" * 4096)
    expected = InProcessComputer().compute(str(broken), mpv, overview=True, detail=True)
    computed = worker.compute(str(broken), mpv, overview=True, detail=True)
    assert computed == expected
