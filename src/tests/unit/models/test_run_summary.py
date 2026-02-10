#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for RunSummary."""

from cuepoint.models.result import TrackResult
from cuepoint.models.run_summary import RunSummary


def test_run_summary_counts():
    results = [
        TrackResult(
            playlist_index=1, title="A", artist="AA", matched=True, match_score=90.0
        ),
        TrackResult(
            playlist_index=2, title="B", artist="BB", matched=False, match_score=0.0
        ),
        TrackResult(
            playlist_index=3, title="C", artist="CC", matched=True, match_score=65.0
        ),
    ]

    summary = RunSummary.from_results(
        results=results,
        playlist="Test",
        duration_sec=12.5,
        output_paths=["out.csv"],
    )

    assert summary.total_tracks == 3
    assert summary.matched == 2
    assert summary.unmatched == 1
    assert summary.low_confidence == 2
    assert summary.output_paths == ["out.csv"]
