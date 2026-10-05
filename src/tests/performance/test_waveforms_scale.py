#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Phase 11 at scale, kept runnable (WAVE-07).

``scripts/bench_waveforms.py`` is the full 50,000-track measurement, run twice,
and prints the numbers the docs record: the store's size, the Library's batch,
the bar's picture, the Inspector's picture with its marks, the work list and
the marks read. A measurement nobody runs rots, so this runs the same code at
a tenth of the size, once, on every full suite.

It asserts what must hold at any size. The store's size is held to its budget
exactly: the waveforms are seeded, so the size is the same on every machine
with one SQLite. Timings are held under a ceiling well above their budgets
rather than to the budgets themselves: at this size, on a machine running the
rest of the suite at once, a few milliseconds are noise, and the ceiling still
catches a read that went quadratic or a query that lost its index.

Marked slow; ``scripts/run_tests.py --no-slow`` skips it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# `scripts/` is not a package; the bench lives there because a person runs it.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

import bench_waveforms  # noqa: E402

pytestmark = [pytest.mark.performance, pytest.mark.slow]

TRACKS = 5_000

#: Timings may run to this many times their budget here; see the docstring.
CEILING = 4.0

#: Far above the 1.21 and 1.28 measured at 50,000 tracks, as `test_marks_scale` holds.
RATIO_CEILING = 2.0


@pytest.fixture(scope="module")
def result(tmp_path_factory):
    return bench_waveforms.run(
        TRACKS, tmp_path_factory.mktemp("waveforms"), runs=1, repeats=10, work_repeats=5
    )


def _rows(result):
    (run,) = result["runs"]
    return {row["label"]: row for row in run["rows"]}


def test_every_measurement_is_taken(result):
    assert list(_rows(result)) == [
        f"The store, {TRACKS:,} waveforms",
        "200 states",
        "200 pictures at width 120",
        "One picture at 1,200",
        "One picture at 1,200 with its marks",
        "The work list, a refill of 200",
        "The work list, a count",
        "The marks read, typical (3.3 marks a track)",
        "The marks read, prepared (8.0 marks a track)",
    ]
    assert all(row["value"] > 0 for row in _rows(result).values())
    assert all(row["budget"] is not None for row in _rows(result).values())


def test_the_store_is_inside_its_budget_for_its_size(result):
    store = _rows(result)[f"The store, {TRACKS:,} waveforms"]
    assert store["budget"] == pytest.approx(25.0)
    assert not store["over_budget"], store


def test_every_timing_is_under_its_ceiling(result):
    for row in _rows(result).values():
        if row["unit"] != "ms p95":
            continue
        assert row["value"] <= row["budget"] * CEILING, row


def test_the_marks_read_is_under_its_ceiling(result):
    for label, row in _rows(result).items():
        if row["unit"] == "×":
            assert 1.0 <= row["value"] < RATIO_CEILING, (label, row)
