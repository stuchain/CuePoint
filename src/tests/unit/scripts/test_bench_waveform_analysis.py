"""The library analysis bench (WAVE-03): its budgets, and a whole run at a small size.

The bench runs the real job for minutes and is run by hand; these hold its
budgets to the specification and run it end to end on a few tracks, so a
change to the job or the engine that breaks the measurement is found here
rather than on the day it is needed.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "bench_waveform_analysis.py"


def _load():
    spec = importlib.util.spec_from_file_location("bench_waveform_analysis", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load()


def _result(**overrides):
    result = {
        "fixture_copies": {"state": "succeeded", "analysed": 5, "tracks": 5},
        "six_minute": {"state": "succeeded", "analysed": 2, "tracks": 2},
        "responsiveness": {"ratio": 1.2},
        "playback": None,
    }
    result.update(overrides)
    return result


def test_the_budgets_are_the_specifications():
    assert bench.RESPONSIVENESS_BUDGET == 1.5
    assert bench.DEFAULT_TRACKS == 5_000
    assert bench.EXTRAPOLATE_TO == 50_000


@pytest.mark.parametrize(
    "overrides, missed",
    [
        ({}, False),
        ({"responsiveness": {"ratio": 1.5}}, False),
        ({"responsiveness": {"ratio": 1.51}}, True),
        ({"responsiveness": {"ratio": None}}, False),
        ({"playback": {"underruns": 0}}, False),
        ({"playback": {"underruns": 2}}, True),
        ({"playback": {"underruns": 0, "ended_while_analysing": True}}, False),
        ({"playback": {"underruns": 0, "ended_while_analysing": False}}, True),
        ({"six_minute": {"state": "cancelled", "analysed": 2, "tracks": 2}}, True),
        ({"fixture_copies": {"state": "succeeded", "analysed": 4, "tracks": 5}}, True),
    ],
)
def test_what_misses_the_budget(overrides, missed):
    assert bool(bench.over_budget(_result(**overrides))) is missed


def test_an_underrun_is_read_from_the_players_log():
    log = "\n".join(
        [
            "[   0.10][v][ao/wasapi] starting AO",
            "[  12.30][w][ao/wasapi] Audio device underrun detected.",
            "[  12.31][v][cplayer] restarting audio after underrun",
            "[  60.00][v][ao/wasapi] audio end or underrun",
        ]
    )

    found = bench.underrun_lines(log)

    # The end of a queue says "audio end or underrun" and is neither.
    assert len(found) == 2
    assert bench.underrun_lines("[0.1][v][cplayer] Exiting... (End of file)") == []


def test_a_small_run_end_to_end(tmp_path):
    """Every fixture copy and six-minute copy analysed by the real job."""
    mpv = bench._resolve(None)
    if not mpv.is_file():
        pytest.skip("no mpv: run `python scripts/fetch_player_sidecar.py`")
    # The bench sets these for its own process. A test must hand them back, or
    # every later test on this worker skips Beatport and uses this home.
    names = ("CUEPOINT_HOME", "CUEPOINT_SKIP_BEATPORT", "CUEPOINT_DECODER_PATH")
    saved = {name: os.environ.get(name) for name in names}
    try:
        result = bench.run(
            mpv, tmp_path, tracks=12, long_tracks=2, library=300, play=False
        )
    finally:
        bench._close_databases()
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    assert result["fixture_copies"]["analysed"] == 12
    assert result["six_minute"]["analysed"] == 2
    assert result["responsiveness"]["idle_p95_ms"] is not None
    assert result["extrapolated"]["hours"] is not None
