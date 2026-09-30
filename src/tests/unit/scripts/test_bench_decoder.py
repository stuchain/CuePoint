"""The decoder bench (WAVE-01): the parts that decide what it measures.

The bench itself runs the real decoder for minutes and is run by hand; these
hold the pieces that could drift from the module it measures.
"""

from __future__ import annotations

import importlib.util
import sys
import wave
from pathlib import Path

import pytest

from cuepoint.data import audio_decode as ad

pytestmark = pytest.mark.unit

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "bench_decoder.py"


def _load():
    spec = importlib.util.spec_from_file_location("bench_decoder", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load()


def test_the_alternative_is_the_chosen_graph_before_its_reduction():
    """The comparison is fair only if both decode and split the same way."""
    unreduced = bench._unreduced_graph()
    assert ad.filter_graph().startswith(unreduced)
    assert unreduced.endswith(f"channel_layout={ad.CHANNEL_LAYOUT}")
    assert "amultiply" not in unreduced


def test_the_source_is_as_long_as_it_says(tmp_path, monkeypatch):
    monkeypatch.setattr(bench, "TRACK_SECONDS", 2)
    path = tmp_path / "source.wav"
    bench.write_source(path)
    with wave.open(str(path), "rb") as source:
        assert source.getnframes() == 2 * bench.SAMPLE_RATE
        assert source.getnchannels() == 2


@pytest.mark.parametrize(
    "ratio, missed", [(1.0, False), (1.5, False), (1.51, True), (None, False)]
)
def test_the_budget_is_on_the_chosen_design(ratio, missed):
    result = {"responsiveness": {"chosen_ratio": ratio}}
    assert bool(bench.over_budget(result)) is missed
