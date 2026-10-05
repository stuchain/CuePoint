#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading cue points and beat grids at scale, kept runnable (WAVE-04).

``scripts/bench_marks.py`` is the full 50,000-track measurement and prints the
numbers the docs record. A measurement nobody runs rots, so this runs the same
code at a tenth of the size on every full suite.

It asserts what must hold at any size: both shapes are read and the marks
counted, the import writes every one, a refresh preview counts exactly the one
track whose cue moved, and the backfill reads the whole library. The read's
ratio is held under a ceiling well above anything measured rather than to the
bench's own budget: at this size, on a machine running the rest of the suite
at once, a fraction of a second is noise, and the ceiling still catches a read
that went quadratic.

Marked slow; ``scripts/run_tests.py --no-slow`` skips it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# `scripts/` is not a package; the bench lives there because a person runs it.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

import bench_marks  # noqa: E402

pytestmark = [pytest.mark.performance, pytest.mark.slow]

TRACKS = 5_000

#: Far above the 1.21 and 1.28 measured at 50,000 tracks; see the docstring.
RATIO_CEILING = 2.0


@pytest.fixture(scope="module")
def result(tmp_path_factory):
    return bench_marks.run(TRACKS, tmp_path_factory.mktemp("marks"))


def test_both_shapes_are_read_with_their_marks(result):
    reads = result["reads"]
    assert reads["prepared"]["marks"] == TRACKS * 8
    assert TRACKS * 3 < reads["typical"]["marks"] < TRACKS * 4
    for shape in bench_marks.SHAPES:
        assert 1.0 <= reads[shape]["ratio"] < RATIO_CEILING, (shape, reads[shape])


def test_the_import_writes_every_mark(result):
    assert result["import"]["cues"] == TRACKS * 7
    assert result["import"]["markers"] == TRACKS


def test_a_refresh_preview_counts_the_one_track_whose_cue_moved(result):
    assert result["marks_changed"] == 1


def test_the_backfill_reads_the_whole_library(result):
    assert result["backfill_outcome"] == "read"
    assert result["backfill_tracks"] == TRACKS


def test_every_measurement_is_reported(result):
    labels = [row["label"] for row in result["rows"]]
    assert len(labels) == 5
    assert all(row["value"] is not None for row in result["rows"])
