"""Integration tests for Rekordbox write-back: full round-trip and batch mode."""

import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.rekordbox import (
    MAX_XML_SIZE_BYTES,
    build_rekordbox_updates,
    build_rekordbox_updates_batch,
    parse_rekordbox,
    write_updated_collection_xml,
)
from cuepoint.models.result import TrackResult


def _fixtures_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "fixtures" / "rekordbox"


class TestRekordboxWriteIntegration:
    """Integration tests for write_updated_collection_xml round-trip."""

    def test_full_round_trip_updated_tracks_have_key_bpm_comment_ok(self):
        """Use small.xml and TrackResults; build updates, write, parse; assert updated TRACKs have Key/BPM/Year/Genre and Comment='ok'."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                beatport_key="Cm",
                beatport_bpm="130",
                beatport_year="2025",
                beatport_genres="Techno",
            ),
            TrackResult(
                playlist_index=2,
                title="Track 2",
                artist="Artist 2",
                matched=True,
                beatport_key="F",
                beatport_bpm="132",
                beatport_year="2024",
                beatport_genres="House, Deep House",
            ),
            TrackResult(
                playlist_index=3,
                title="Track 3",
                artist="Artist 3",
                matched=False,
            ),
        ]
        updates = build_rekordbox_updates(str(small_xml), "My Playlist", results)
        assert len(updates) == 2
        assert "1" in updates
        assert "2" in updates
        assert updates["1"]["Comment"] == "ok"
        assert updates["1"]["Key"] == "Cm"
        assert updates["1"]["BPM"] == "130"
        assert updates["1"]["Year"] == "2025"
        assert updates["1"]["Genre"] == "Techno"
        assert updates["2"]["Comment"] == "ok"
        assert updates["2"]["Key"] == "F"
        assert updates["2"]["Genre"] == "House"

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(small_xml), updates, output_path)
            tree = ET.parse(output_path)
            root = tree.getroot()
            collection = root.find(".//COLLECTION")
            assert collection is not None
            for elem in collection.findall("TRACK"):
                tid = elem.get("TrackID") or elem.get("Key")
                if tid == "1":
                    assert elem.get("Key") == "Cm"
                    assert elem.get("BPM") == "130"
                    assert elem.get("Year") == "2025"
                    assert elem.get("Genre") == "Techno"
                    assert elem.get("Comment") == "ok"
                elif tid == "2":
                    assert elem.get("Key") == "F"
                    assert elem.get("BPM") == "132"
                    assert elem.get("Comment") == "ok"
            playlists = parse_rekordbox(output_path)
            assert "My Playlist" in playlists
            assert len(playlists["My Playlist"].tracks) == 10
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_batch_mode_two_playlists_merged_updates(self):
        """Batch: two playlists (same fixture has one playlist; use same playlist twice or two entries). Merge updates."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        # Use one playlist with two results; batch with one key
        results_dict = {
            "My Playlist": [
                TrackResult(
                    playlist_index=1,
                    title="Track 1",
                    artist="Artist 1",
                    matched=True,
                    beatport_key="Am",
                    beatport_bpm="128",
                    beatport_year="2024",
                ),
                TrackResult(
                    playlist_index=2,
                    title="Track 2",
                    artist="Artist 2",
                    matched=True,
                    beatport_key="C",
                    beatport_bpm="130",
                ),
            ],
        }
        updates = build_rekordbox_updates_batch(str(small_xml), results_dict)
        assert "1" in updates
        assert "2" in updates
        assert updates["1"]["Comment"] == "ok"
        assert updates["2"]["Comment"] == "ok"
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            write_updated_collection_xml(str(small_xml), updates, output_path)
            playlists = parse_rekordbox(output_path)
            assert len(playlists["My Playlist"].tracks) == 10
            tree = ET.parse(output_path)
            collection = tree.getroot().find(".//COLLECTION")
            for elem in collection.findall("TRACK"):
                tid = elem.get("TrackID") or elem.get("Key")
                if tid == "1":
                    assert elem.get("Comment") == "ok"
                    assert elem.get("Key") == "Am"
                elif tid == "2":
                    assert elem.get("Comment") == "ok"
                    assert elem.get("Key") == "C"
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_write_updated_collection_xml_nonexistent_input_raises_file_not_found(self):
        """write_updated_collection_xml with nonexistent input path raises FileNotFoundError."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            with pytest.raises(FileNotFoundError, match="XML file not found"):
                write_updated_collection_xml(
                    "/nonexistent/collection.xml", {"1": {"Comment": "ok"}}, output_path
                )
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_write_updated_collection_xml_oversized_input_raises_value_error(self):
        """write_updated_collection_xml when input exceeds size cap raises ValueError."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            output_path = f.name
        try:
            with patch("os.path.getsize", return_value=MAX_XML_SIZE_BYTES + 1):
                with pytest.raises(ValueError, match="XML file too large"):
                    write_updated_collection_xml(
                        str(small_xml), {"1": {"Comment": "ok"}}, output_path
                    )
        finally:
            Path(output_path).unlink(missing_ok=True)
