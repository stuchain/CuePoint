"""
Integration test: Rekordbox XML → parsed tracks → output writer. Design 3.20, 3.70.

Runs pipeline with small.xml fixture: parse XML, build TrackResults, write CSVs,
verify main output row count and schema.
"""

import csv
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import parse_rekordbox
from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import read_csv_skip_comments, write_csv_files


def _tests_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _fixtures_dir() -> Path:
    return _tests_dir() / "fixtures" / "rekordbox"


@pytest.mark.integration
def test_pipeline_small_xml_to_csv(tmp_path: Path) -> None:
    """XML → parsed track list → write CSV; main output has correct row count and schema."""
    small_xml = _fixtures_dir() / "small.xml"
    if not small_xml.exists():
        pytest.skip("fixtures/rekordbox/small.xml not found")

    playlists = parse_rekordbox(str(small_xml))
    assert "My Playlist" in playlists, "small.xml should define 'My Playlist'"
    playlist = playlists["My Playlist"]
    tracks = playlist.tracks
    assert len(tracks) == 10, "small.xml has 10 tracks in My Playlist"

    # Build TrackResult per track (unmatched; no Beatport calls)
    results = [
        TrackResult(
            playlist_index=i,
            title=t.title,
            artist=t.artist,
            matched=False,
        )
        for i, t in enumerate(tracks)
    ]

    out = write_csv_files(
        results,
        "pipeline_small",
        output_dir=str(tmp_path),
        include_metadata=True,
    )

    assert "main" in out
    main_path = Path(out["main"])
    assert main_path.exists()

    headers, rows = read_csv_skip_comments(str(main_path))

    assert len(rows) == 10
    required = [
        "playlist_index",
        "original_title",
        "original_artists",
        "beatport_title",
        "match_score",
        "confidence",
    ]
    for col in required:
        assert col in (headers or []), f"Missing column: {col}"
    assert rows[0]["original_title"] == "Track 1"
    assert rows[0]["original_artists"] == "Artist 1"
