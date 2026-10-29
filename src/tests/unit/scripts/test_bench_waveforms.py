"""The phase's bench (WAVE-07): its budgets, its marks and its verdict.

The bench at 50,000 tracks runs for minutes and is run by hand, and
``test_waveforms_scale.py`` runs it whole at 5,000 on the slow suite; these
hold the parts that decide what it measures to the specifications they come
from.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_SCRIPTS = Path(__file__).resolve().parents[4] / "scripts"


def _load():
    sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(
        "bench_waveforms", _SCRIPTS / "bench_waveforms.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load()


def test_the_budgets_are_the_phases():
    # WAVE-02: 250 MB at 50,000 and WAVE-08's 10 for loudness; 50 ms a batch,
    # 20 ms a picture.
    assert bench.SIZE_BUDGET_KB_PER_TRACK * 50_000 / 1000 == 260
    assert bench.BATCH_BUDGET_MS == 50
    assert bench.ONE_BUDGET_MS == 20
    # WAVE-04's ratios, and the work list's, set by WAVE-07.
    assert bench.TYPICAL_READ_BUDGET_RATIO == 1.30
    assert bench.PREPARED_READ_BUDGET_RATIO == 1.40
    assert bench.WORK_LIST_BUDGET_MS == 600  # HARDEN-07: 500 was within 6% on every leg
    assert bench.DEFAULT_TRACKS == 50_000
    assert bench.DEFAULT_RUNS == 2


def test_the_zoomed_waveforms_budgets_are_t4s():
    # ADR-011: 60 ms to reduce and encode six minutes, 20 ms (the picture's)
    # to read and decode one, 50 ms to write one at a full cap.
    assert bench.DETAIL_BUILD_BUDGET_MS == 60
    assert bench.DETAIL_READ_BUDGET_MS == bench.ONE_BUDGET_MS == 20
    assert bench.DETAIL_PUT_BUDGET_MS == 50
    assert bench.DETAIL_FRAMES == 54_000  # six minutes at the decoder's 150 Hz
    assert bench.DETAIL_CAP_BYTES == 256 * 1024 * 1024


def test_the_detail_rows_are_measured_and_the_mean_size_reported(tmp_path):
    built = bench.bench_waveform_store.build(tmp_path, 60, worst_case=False)
    try:
        rows = bench.measure_detail(built, repeats=3, cap_bytes=3_000_000)
        store = built["store"]
        held = store.detail_bytes()
        count = store.detail_count()
    finally:
        built["store"].close_all()
        built["db"].close_all()

    labels = [row["label"] for row in rows]
    assert labels[:2] == [
        "A six-minute detail, reduce and encode",
        "One detail, read and decode",
    ]
    assert labels[2].startswith("A detail written at a full cap")
    assert labels[3] == "The mean detail"
    budgets = {row["label"]: row["budget"] for row in rows}
    assert budgets["A six-minute detail, reduce and encode"] == 60
    assert budgets["One detail, read and decode"] == 20
    assert budgets["The mean detail"] is None
    mean = rows[3]
    assert mean["unit"] == "KB" and mean["value"] > 5
    assert not mean["over_budget"]
    # The cap held: the store filled to it, and every write evicted down to it.
    assert 2_500_000 < held <= 3_000_000 + 200_000
    assert count > 10


def test_the_report_prints_the_mean_detail_in_kilobytes(capsys):
    rows = [bench._row("The mean detail", 45.5, "KB", None, "note")]
    bench.report(
        {
            "tracks": 1_000,
            "platform": "Test",
            "python": "3",
            "sqlite": "3",
            "runs": [{"run": 1, "seconds": 1.0, "rows": rows}],
        }
    )
    assert "| The mean detail | 45.5 KB |  |" in capsys.readouterr().out


def test_every_track_carries_eight_marks():
    cues, grid = bench.prepared_marks(12)
    assert len(cues) == 7 and len(grid) == 1
    assert [cue[1] for cue in cues] == [None, None, None, 0, 1, 2, 3]
    assert all(cue[0] == "cue" for cue in cues)
    starts = [cue[2] for cue in cues]
    assert len(set(starts)) == len(starts)


def test_a_missed_budget_is_named_with_its_run():
    def row(label, value, budget):
        return bench._row(label, value, "ms p95", budget, "")

    result = {
        "runs": [
            {"run": 1, "rows": [row("200 states", 3.0, 50.0)]},
            {"run": 2, "rows": [row("200 states", 51.0, 50.0)]},
        ]
    }
    assert bench.over_budget(result) == ["run 2: 200 states"]
    result["runs"][1]["rows"][0] = row("200 states", 50.0, 50.0)
    assert bench.over_budget(result) == []


def test_the_report_prints_every_run_side_by_side(capsys):
    rows = [bench._row("The store, 1,000 waveforms", 4.9, "MB", 5.0, "note")]
    bench.report(
        {
            "tracks": 1_000,
            "platform": "Test",
            "python": "3",
            "sqlite": "3",
            "runs": [
                {"run": 1, "seconds": 1.0, "rows": rows},
                {"run": 2, "seconds": 1.0, "rows": rows},
            ],
        }
    )
    out = capsys.readouterr().out
    assert "| Measure | Run 1 | Run 2 | Budget |" in out
    assert "| The store, 1,000 waveforms | 4.9 MB | 4.9 MB | 5 MB |" in out
