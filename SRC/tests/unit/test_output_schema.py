"""
Golden/schema tests for CSV output. Design 3.25, 3.45, 3.49, 3.50.

Validates main CSV headers, column order, UTF-8 encoding, and formatting.
"""

from pathlib import Path

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import read_csv_skip_comments, write_csv_files, write_main_csv

# Expected main CSV schema (must match output_writer.write_main_csv)
MAIN_CSV_HEADERS_BASE = [
    "playlist_index",
    "original_title",
    "original_artists",
    "beatport_title",
    "beatport_artists",
    "beatport_key",
    "beatport_key_camelot",
    "beatport_year",
    "beatport_bpm",
    "beatport_url",
    "title_sim",
    "artist_sim",
    "match_score",
    "confidence",
    "search_query_index",
    "search_stop_query_index",
    "candidate_index",
]

MAIN_CSV_HEADERS_WITH_METADATA = MAIN_CSV_HEADERS_BASE + [
    "beatport_label",
    "beatport_genres",
    "beatport_release",
    "beatport_release_date",
    "beatport_track_id",
]


@pytest.mark.unit
def test_main_csv_headers_and_order(tmp_path: Path) -> None:
    """Main CSV has all required columns in correct order. Design 3.25, 3.45."""
    results = [
        TrackResult(
            playlist_index=0,
            title="Test",
            artist="Artist",
            matched=False,
        )
    ]
    out_file = "schema_test.csv"
    write_main_csv(
        results,
        out_file,
        output_dir=str(tmp_path),
        include_metadata=True,
    )
    path = tmp_path / out_file
    assert path.exists()
    fieldnames, _ = read_csv_skip_comments(str(path))
    assert fieldnames == MAIN_CSV_HEADERS_WITH_METADATA


@pytest.mark.unit
def test_main_csv_headers_without_metadata(tmp_path: Path) -> None:
    """Main CSV without metadata has base columns only."""
    results = [
        TrackResult(
            playlist_index=0,
            title="A",
            artist="B",
            matched=False,
        )
    ]
    write_main_csv(
        results,
        "no_meta.csv",
        output_dir=str(tmp_path),
        include_metadata=False,
    )
    path = tmp_path / "no_meta.csv"
    fieldnames, _ = read_csv_skip_comments(str(path))
    assert fieldnames == MAIN_CSV_HEADERS_BASE


@pytest.mark.unit
def test_main_csv_utf8_encoding(tmp_path: Path) -> None:
    """CSV file is UTF-8. Design 3.25."""
    results = [
        TrackResult(
            playlist_index=0,
            title="Track avec café",
            artist="Artíst",
            matched=False,
        )
    ]
    write_main_csv(results, "utf8_test.csv", output_dir=str(tmp_path))
    path = tmp_path / "utf8_test.csv"
    with open(path, encoding="utf-8") as f:
        content = f.read()
    assert "café" in content
    assert "Artíst" in content


@pytest.mark.unit
def test_main_csv_commas_quoted(tmp_path: Path) -> None:
    """Fields containing comma are quoted. Design 3.49, 3.50."""
    results = [
        TrackResult(
            playlist_index=0,
            title="Track, Part 1",
            artist="Artist, Feat. Other",
            matched=False,
        )
    ]
    write_main_csv(results, "commas.csv", output_dir=str(tmp_path))
    path = tmp_path / "commas.csv"
    with open(path, newline="", encoding="utf-8") as f:
        raw = f.read()
    # CSV writer should quote fields with commas
    assert '"Track, Part 1"' in raw or "Track, Part 1" in raw
    # Verify we can round-trip (Design 9: skip comment headers)
    _, rows = read_csv_skip_comments(str(path))
    assert rows
    row = rows[0]
    assert "Part 1" in row["original_title"]
    assert "Other" in row["original_artists"]


@pytest.mark.unit
def test_write_csv_files_main_schema(tmp_path: Path) -> None:
    """write_csv_files produces main CSV with correct schema."""
    results = [
        TrackResult(playlist_index=i, title=f"Track {i}", artist=f"Artist {i}", matched=False)
        for i in range(3)
    ]
    out = write_csv_files(
        results,
        "golden",
        output_dir=str(tmp_path),
        include_metadata=True,
    )
    assert "main" in out
    main_path = Path(out["main"])
    assert main_path.exists()
    fieldnames, rows = read_csv_skip_comments(str(main_path))
    assert fieldnames == MAIN_CSV_HEADERS_WITH_METADATA
    assert len(rows) == 3
