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
    "idle, chosen, missed",
    [
        # The first CI run: idle about 10 ms, a rise of 10 ms doubled the ratio.
        (10.0, 20.0, False),
        (10.0, 36.0, False),
        # Under an idle of 100 ms the limit is 1.5 x 100 = 150 ms, whatever idle was.
        (10.0, 150.0, False),
        (10.0, 151.0, True),
        (100.0, 150.0, False),
        # Above the floor it is the plain ratio of 1.5.
        (200.0, 300.0, False),
        (200.0, 301.0, True),
        (None, 20.0, False),
        (10.0, None, False),
    ],
)
def test_the_budget_is_on_the_chosen_design_over_an_idle_floored_at_100_ms(
    idle, chosen, missed
):
    result = {"responsiveness": {"idle_p95_ms": idle, "chosen_p95_ms": chosen}}
    assert bool(bench.over_budget(result)) is missed


def test_the_floored_ratio_is_over_at_least_the_floor():
    assert bench._floored_ratio(20.0, 10.0) == 0.2
    assert bench._floored_ratio(300.0, 200.0) == 1.5


def test_where_the_platform_cannot_report_peak_memory_it_says_not_measured(
    monkeypatch, tmp_path
):
    monkeypatch.delattr(bench.os, "wait4", raising=False)
    assert bench.decoder_peak_rss_mb(tmp_path / "mpv", tmp_path / "a.wav") is None


def test_the_alternative_goes_through_a_file_where_there_is_no_dev_stdout(
    monkeypatch, tmp_path
):
    """Windows: ``--ao-pcm-file`` names a temporary file, which is read back, not ``/dev/stdout``."""
    seen = {}

    def fake_run(arguments, **kwargs):
        target = next(a for a in arguments if a.startswith("--ao-pcm-file="))
        seen["target"] = target.split("=", 1)[1]
        Path(seen["target"]).write_bytes(b"\0" * 16 * 150)
        return type("Done", (), {"stdout": b"", "returncode": 0})()

    monkeypatch.setattr(
        ad, "default_transport", lambda platform=None: ad.TRANSPORT_FILE
    )
    monkeypatch.setattr(bench.subprocess, "run", fake_run)
    answer = bench.engine_side(tmp_path / "mpv", tmp_path / "a.wav")
    assert answer["via"] == ad.TRANSPORT_FILE
    assert seen["target"] != "/dev/stdout"
    assert answer["stream_mb"] == round(16 * 150 / 1e6, 1)


def test_the_alternative_is_piped_where_there_is_a_dev_stdout(monkeypatch, tmp_path):
    seen = {}

    def fake_run(arguments, **kwargs):
        seen["target"] = next(
            a for a in arguments if a.startswith("--ao-pcm-file=")
        ).split("=", 1)[1]
        return type("Done", (), {"stdout": b"\0" * 16 * 150, "returncode": 0})()

    monkeypatch.setattr(
        ad, "default_transport", lambda platform=None: ad.TRANSPORT_PIPE
    )
    monkeypatch.setattr(bench.subprocess, "run", fake_run)
    answer = bench.engine_side(tmp_path / "mpv", tmp_path / "a.wav")
    assert seen["target"] == "/dev/stdout" and answer["via"] == ad.TRANSPORT_PIPE
