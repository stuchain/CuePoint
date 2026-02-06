"""Unit tests for Step 6 remaining features: disk I/O, incremental, profiling."""

import csv

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.services.output_writer import (
    append_rows_to_main_csv,
    load_processed_track_keys,
    write_main_csv,
)


class TestLoadProcessedTrackKeys:
    """Test load_processed_track_keys (Design 6: incremental)."""

    def test_load_empty_file(self, tmp_path):
        """Empty or missing file returns empty set."""
        assert load_processed_track_keys(str(tmp_path / "nonexistent.csv")) == set()

    def test_load_csv(self, tmp_path):
        """Load keys from valid CSV."""
        csv_path = tmp_path / "main.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=["playlist_index", "original_title", "original_artists"],
                extrasaction="ignore",
            )
            w.writeheader()
            w.writerow({
                "playlist_index": "1",
                "original_title": "Track 1",
                "original_artists": "Artist 1",
            })
            w.writerow({
                "playlist_index": "2",
                "original_title": "Track 2",
                "original_artists": "Artist 2",
            })
        keys = load_processed_track_keys(str(csv_path))
        assert (1, "Track 1", "Artist 1") in keys
        assert (2, "Track 2", "Artist 2") in keys
        assert len(keys) == 2


class TestAppendRowsFsync:
    """Test append_rows_to_main_csv fsync parameter (Design 6.30)."""

    def test_append_with_fsync_false(self, tmp_path):
        """Append with fsync=False does not raise."""
        main_path = tmp_path / "main.csv"
        with open(main_path, "w", newline="", encoding="utf-8") as f:
            f.write("playlist_index,original_title,original_artists\n")
        results = [
            TrackResult(
                playlist_index=1,
                title="T1",
                artist="A1",
                matched=False,
            ),
        ]
        out = append_rows_to_main_csv(
            results, str(main_path), fsync=False
        )
        assert out == str(main_path)
        with open(main_path, encoding="utf-8") as f:
            lines = f.readlines()
        assert len(lines) >= 2


class TestWriteMainCsvBatched:
    """Test write_main_csv uses batched writes (Design 6.31)."""

    def test_write_large_batch(self, tmp_path):
        """Large batch uses writer.writerows."""
        results = [
            TrackResult(playlist_index=i, title=f"T{i}", artist=f"A{i}", matched=False)
            for i in range(1, 101)
        ]
        out = write_main_csv(results, "test.csv", str(tmp_path))
        assert out is not None
        with open(out, encoding="utf-8") as f:
            lines = f.readlines()
        # 3 metadata lines (# schema_version, # run_id, # run_status) + header + 100 rows
        assert len(lines) == 104


class TestIncrementalProcessing:
    """Test incremental processing (Design 6)."""

    @pytest.fixture
    def minimal_xml(self, tmp_path):
        """Create minimal XML with 2 tracks."""
        xml = tmp_path / "bench.xml"
        xml.write_text('''<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <PRODUCT Name="rekordbox" Version="6.7.0"/>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1" BPM="120" Key="Am" Genre="House" Year="2024"/>
        <TRACK TrackID="2" Name="Track 2" Artist="Artist 2" BPM="125" Key="C" Genre="Techno" Year="2023"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test" Type="1">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>
''')
        return xml

    def test_incremental_skips_processed(self, minimal_xml, tmp_path):
        """Incremental mode skips tracks in previous CSV."""
        from unittest.mock import Mock, patch

        from cuepoint.services.processor_service import ProcessorService

        # Create previous CSV with track 1 only
        prev_csv = tmp_path / "prev_main.csv"
        with open(prev_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=["playlist_index", "original_title", "original_artists"],
                extrasaction="ignore",
            )
            w.writeheader()
            w.writerow({
                "playlist_index": "1",
                "original_title": "Track 1",
                "original_artists": "Artist 1",
            })

        mock_beatport = Mock()
        mock_beatport.search_tracks.return_value = []
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        mock_logging = Mock()
        mock_config = Mock()
        mock_config.get.side_effect = lambda k, d=None: {
            "product.preflight_network_check": False,
            "product.preflight_enabled": False,
        }.get(k, d)

        service = ProcessorService(
            beatport_service=mock_beatport,
            matcher_service=mock_matcher,
            logging_service=mock_logging,
            config_service=mock_config,
        )

        with patch("cuepoint.services.processor_service.NetworkState") as mock_net:
            mock_net.is_online.return_value = True
            results = service.process_playlist_from_xml(
                str(minimal_xml),
                "Test",
                incremental_previous_csv=str(prev_csv),
            )

        # Should process only track 2 (1 new track)
        assert len(results) == 1
        assert results[0].playlist_index == 2
        assert results[0].title == "Track 2"
        assert results[0].title == "Track 2"
