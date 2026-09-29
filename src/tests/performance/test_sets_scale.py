#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Phase 10 at scale, kept runnable (PREP-12).

``scripts/bench_sets.py`` is the full 50,000-track measurement and prints the
numbers the docs record: the m0025 upgrade, a 1,000-entry Set's plan, running
order and checks, and suggestions at the densest gap. A measurement nobody
runs rots — ``bench_library.py`` could not run at all for two phases before
anyone noticed — so this runs the same code at a tenth of the size on every
full suite.

It asserts what must hold at any size rather than wall-clock seconds, which
vary by machine: the upgrade keeps every row and passes the foreign-key check
(the bench asserts both on every copy), the Set is built at its limit with its
warnings accepted, every measurement is taken, and nothing misses its budget —
at this size, missing one would mean something had gone badly wrong.

Marked slow; ``scripts/run_tests.py --no-slow`` skips it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# `scripts/` is not a package; the bench lives there because a person runs it.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

import bench_sets  # noqa: E402

pytestmark = [pytest.mark.performance, pytest.mark.slow]

TRACKS = 5_000


@pytest.fixture
def result(tmp_path, monkeypatch):
    """One run of the bench, with everything it sets for the process put back."""
    from cuepoint.services import database_service
    from cuepoint.utils.di_container import get_container, reset_container

    monkeypatch.setattr(
        database_service,
        "default_database_path",
        database_service.default_database_path,
    )
    monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("CUEPOINT_SKIP_BEATPORT", "1")
    try:
        yield bench_sets.run(TRACKS, tmp_path)
    finally:
        from cuepoint.services.interfaces import IDatabaseService

        try:
            get_container().resolve(IDatabaseService).close_all()
        finally:
            reset_container()


def test_every_measurement_is_taken_within_its_budget(result):
    labels = [row["label"] for row in result["rows"]]
    assert labels == [
        "m0025 on a version-24 library",
        "The plan",
        "The running order, as the route sends it",
        "The checks",
        "The checks, with their wire object",
        "Suggestions at a dense gap, the whole library",
        "The same, as the route sends it",
        "The same, 200 suggestions",
        "After the last entry",
        "A gap nothing bridges",
    ]
    assert all(row["value"] > 0 for row in result["rows"])
    assert bench_sets.over_budget(result) == []
    budgeted = [row["label"] for row in result["rows"] if row["budget"] is not None]
    assert budgeted == [
        "m0025 on a version-24 library",
        "The checks, with their wire object",
        "Suggestions at a dense gap, the whole library",
    ]


def test_the_set_is_at_its_limit_with_warnings_accepted(result):
    assert result["set_entries"] == 1_000
    assert result["chapters"] == 10
    assert result["acknowledged"] == 100


def test_the_upgrade_ran_over_a_library_shaped_as_the_step_says(result):
    migration = result["migration"]
    assert migration["nodes"] == TRACKS * 500 // 50_000
    assert migration["entries"] >= TRACKS * 2 - migration["nodes"]
    assert migration["exports"] == TRACKS * 400 // 50_000


def test_the_library_is_discover_08s_shape():
    # 70% in the dense band, 15% at 170–175 and 15% spread over 70–160,
    # which puts a few more inside 120–130 too.
    bands = {"dense": [], "fast": [], "spread": []}
    for i in range(1, 10_001):
        band = i % 100
        name = "dense" if band < 70 else "fast" if band < 85 else "spread"
        bands[name].append(bench_sets.bpm_of(i))
    assert [len(bands[name]) for name in ("dense", "fast", "spread")] == [
        7_000,
        1_500,
        1_500,
    ]
    assert all(120 <= bpm < 130 for bpm in bands["dense"])
    assert all(170 <= bpm <= 175 for bpm in bands["fast"])
    assert all(70 <= bpm <= 160 for bpm in bands["spread"])
    assert {bench_sets.key_of(i) for i in range(1, 200)} == {
        f"{n}{letter}" for n in range(1, 13) for letter in "AB"
    }


def test_a_missed_budget_fails_the_run(monkeypatch, capsys):
    """The exit status is what a release run gates on."""
    over = {
        "tracks": 5_000,
        "migration": {
            "nodes": 1,
            "entries": 1,
            "exports": 1,
            "database_mb": 1,
            "build_seconds": 0,
        },
        "set_entries": 1_000,
        "chapters": 10,
        "acknowledged": 100,
        "seeding_seconds": {},
        "rows": [
            {
                "label": "The checks, with their wire object",
                "value": 250.0,
                "unit": "ms",
                "note": "",
                "budget": 200.0,
                "over_budget": True,
            }
        ],
    }
    monkeypatch.setattr(bench_sets, "run", lambda total, workspace: over)
    assert bench_sets.main(["--tracks", "5000"]) == 1
    assert "Over budget: The checks, with their wire object" in capsys.readouterr().out
