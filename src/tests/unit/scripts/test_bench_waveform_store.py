"""The waveform store bench (WAVE-02): the parts that decide what it measures.

The bench at 50,000 waveforms runs for minutes and is run by hand; these hold
its pieces to the modules it measures, and run it end to end at a small size.
"""

from __future__ import annotations

import importlib.util
import random
import sys
import zlib
from pathlib import Path

import pytest

from cuepoint.core.waveform import BAND_COUNT, COLUMNS, HEADER_BYTES, encode

pytestmark = pytest.mark.unit

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "bench_waveform_store.py"


def _load():
    spec = importlib.util.spec_from_file_location("bench_waveform_store", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load()


def test_the_budgets_are_the_specifications():
    assert bench.SIZE_BUDGET_MB == 250
    assert bench.BATCH_BUDGET_MS == 50
    assert bench.ONE_BUDGET_MS == 20
    assert bench.DEFAULT_TRACKS == 50_000
    assert bench.BATCH == 200
    assert bench.LIBRARY_WIDTH == 120


def test_a_synthetic_waveform_is_a_whole_track_with_every_band_used():
    generator = random.Random(1)
    waveform = bench.synthetic_waveform(generator)

    assert waveform.columns == COLUMNS
    assert 4 * 60_000 <= waveform.duration_ms <= 9 * 60_000
    for band in range(BAND_COUNT):
        values = waveform.data[band::BAND_COUNT]
        assert max(values) > 0 and len(set(values)) > 20


def test_the_synthetic_model_is_no_easier_to_compress_than_music():
    # Blobs of the real synthetic-music tracks measured 2.3 to 2.9 KB; the
    # model must not flatter the size budget.
    generator = random.Random(2)
    sizes = [len(encode(bench.synthetic_waveform(generator))) for _ in range(50)]

    assert sum(sizes) / len(sizes) > 3_000


def test_the_worst_case_does_not_compress():
    blob = encode(bench.random_waveform(random.Random(3)))

    assert len(blob) >= HEADER_BYTES + COLUMNS * BAND_COUNT
    assert len(zlib.decompress(blob[HEADER_BYTES:])) == COLUMNS * BAND_COUNT


def test_it_runs_end_to_end(tmp_path):
    result = bench.run(tmp_path, total=400, worst_case=False, repeats=3)

    assert result["tracks"] == 400
    assert result["store_mb"] > 0
    for name in ("states_200", "pictures_200_at_120", "one_at_1200"):
        assert set(result[name]) == {"median_ms", "p95_ms", "max_ms"}
    assert isinstance(bench.over_budget(result), list)


def test_over_budget_names_what_missed():
    timing = {"median_ms": 1.0, "p95_ms": 1.0, "max_ms": 1.0}
    fine = {
        "worst_case": False,
        "store_mb": 100.0,
        "states_200": timing,
        "pictures_200_at_120": timing,
        "one_at_1200": timing,
    }
    assert bench.over_budget(fine) == []

    missed = bench.over_budget(
        {**fine, "store_mb": 300.0, "one_at_1200": {**timing, "p95_ms": 25.0}}
    )
    assert len(missed) == 2
    # A worst case's size is reported, not failed: the budget is for music.
    assert bench.over_budget({**fine, "worst_case": True, "store_mb": 300.0}) == []
