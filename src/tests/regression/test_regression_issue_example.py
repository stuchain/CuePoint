"""
Regression test: ISSUE-EXAMPLE. Design 3.17, 3.18, 3.19.

Runs pipeline on regression input.xml and asserts main output matches expected_main.csv
(schema, row count, and content).
"""

import csv
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import parse_rekordbox
from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import write_csv_files


def _regression_dir() -> Path:
    return Path(__file__).resolve().parent


def _issue_example_dir() -> Path:
    return _regression_dir() / "ISSUE-EXAMPLE"


@pytest.mark.integration
def test_regression_issue_example_matches_expected(tmp_path: Path) -> None:
    """Pipeline on ISSUE-EXAMPLE/input.xml produces main CSV matching expected_main.csv."""
    case_dir = _issue_example_dir()
    input_xml = case_dir / "input.xml"
    expected_csv = case_dir / "expected_main.csv"
    if not input_xml.exists() or not expected_csv.exists():
        pytest.skip("ISSUE-EXAMPLE input.xml or expected_main.csv not found")

    playlists = parse_rekordbox(str(input_xml))
    assert "Regression Playlist" in playlists
    playlist = playlists["Regression Playlist"]
    tracks = playlist.tracks
    # Parser only includes tracks with non-empty title; Track 2 has Name="" so only 1 track
    assert len(tracks) >= 1

    results = [
        TrackResult(playlist_index=i, title=t.title, artist=t.artist, matched=False)
        for i, t in enumerate(tracks)
    ]

    out = write_csv_files(
        results,
        "regression",
        output_dir=str(tmp_path),
        include_metadata=True,
    )
    assert "main" in out
    main_path = Path(out["main"])
    assert main_path.exists()

    with open(main_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        actual_headers = reader.fieldnames
        actual_rows = list(reader)

    with open(expected_csv, newline="", encoding="utf-8") as f:
        exp_reader = csv.DictReader(f)
        expected_headers = exp_reader.fieldnames
        expected_rows = list(exp_reader)

    assert actual_headers == expected_headers, "Main CSV headers must match expected"
    assert len(actual_rows) == len(expected_rows), "Row count must match expected"
    for i, (actual, expected) in enumerate(zip(actual_rows, expected_rows)):
        for key in expected_headers or []:
            assert actual.get(key) == expected.get(key), (
                f"Row {i} column {key}: got {actual.get(key)!r}, expected {expected.get(key)!r}"
            )
