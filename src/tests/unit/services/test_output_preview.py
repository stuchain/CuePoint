"""The output paths a run would write, previewed before writing them.

Moved from ``test_step8_ux_accessibility.py`` when that Qt test file went
(PRUNE-02): ``preview_csv_output_paths`` and ``write_csv_files`` are live
output-writer code, and these checks were never Qt's.
"""

from __future__ import annotations

import os
import tempfile

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import preview_csv_output_paths, write_csv_files

pytestmark = pytest.mark.unit


def _result(**overrides) -> TrackResult:
    values = dict(
        playlist_index=1,
        title="Test",
        artist="Artist",
        matched=True,
        beatport_title="Test",
        beatport_artists="Artist",
        beatport_bpm="120",
        beatport_key_camelot="8A",
        candidates=[],
    )
    values.update(overrides)
    return TrackResult(**values)


def test_the_preview_has_the_files_a_write_makes():
    with tempfile.TemporaryDirectory() as tmp:
        paths = preview_csv_output_paths("test.csv", tmp, ",", results=[])
        assert {"main", "candidates", "queries"} <= set(paths)
        assert paths["main"].endswith(".csv")
        assert tmp in paths["main"]


def test_a_low_confidence_match_adds_the_review_file():
    with tempfile.TemporaryDirectory() as tmp:
        # A match score under 70 sends a track to review.
        results = [_result(match_score=50.0, artist_sim=40.0)]
        paths = preview_csv_output_paths("test.csv", tmp, ",", results=results)
        assert "review" in paths
        assert "review" in paths["review"]


def test_the_preview_names_the_directory_the_write_uses():
    with tempfile.TemporaryDirectory() as tmp:
        results = [
            _result(
                title="A",
                artist="B",
                beatport_title="A",
                beatport_artists="B",
                confidence="high",
            )
        ]
        preview = preview_csv_output_paths("playlist.csv", tmp, ",", results=results)
        written = write_csv_files(results, "playlist.csv", tmp)
        assert "main" in preview and "main" in written
        assert tmp in preview["main"]
        assert os.path.exists(written["main"])
