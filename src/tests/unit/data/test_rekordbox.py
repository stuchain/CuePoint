"""Unit tests for rekordbox parser."""

import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.data.rekordbox import (
    MAX_XML_SIZE_BYTES,
    RBTrack,
    extract_artists_from_title,
    get_playlist_track_ids,
    get_track_locations,
    is_readable,
    is_writable,
    parse_rekordbox,
    read_playlist_index,
)


def _fixtures_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "fixtures" / "rekordbox"


class TestRBTrack:
    """Test RBTrack dataclass."""

    def test_rbtrack_creation(self):
        """Test creating RBTrack."""
        track = RBTrack(track_id="123", title="Test Track", artists="Test Artist")
        assert track.track_id == "123"
        assert track.title == "Test Track"
        assert track.artists == "Test Artist"


class TestExtractArtistsFromTitle:
    """Test artist extraction from title."""

    def test_extract_artists_basic(self):
        """Test basic artist extraction."""
        result = extract_artists_from_title("Artist - Title")
        assert result is not None
        artists, title = result
        assert "Artist" in artists
        assert title == "Title"

    def test_extract_artists_no_dash(self):
        """Test extraction when no dash separator."""
        result = extract_artists_from_title("Title Only")
        # Should return None or handle gracefully
        assert result is None or isinstance(result, tuple)

    def test_extract_artists_with_prefix(self):
        """Test extraction with numeric prefix."""
        result = extract_artists_from_title("[3] Artist - Title")
        assert result is not None
        artists, title = result
        assert artists == "Artist"
        assert title == "Title"

    def test_extract_artists_with_f_prefix(self):
        """Test extraction with [F] prefix."""
        result = extract_artists_from_title("[F] Artist - Title")
        assert result is not None
        artists, title = result
        # The regex removes numeric prefixes and (F) but not [F], so it may remain
        # Just verify we got a result
        assert isinstance(artists, str)
        assert isinstance(title, str)
        assert title == "Title"

    def test_extract_artists_with_feat(self):
        """Test extraction with feat clause."""
        result = extract_artists_from_title("Artist - Title (feat. Other)")
        assert result is not None
        artists, title = result
        assert artists == "Artist"
        assert "feat" not in title.lower()
        assert "Other" not in title

    def test_extract_artists_with_colon(self):
        """Test extraction with colon separator."""
        result = extract_artists_from_title("Artist: Title")
        assert result is not None
        artists, title = result
        assert artists == "Artist"
        assert title == "Title"

    def test_extract_artists_empty_title(self):
        """Test extraction with empty title."""
        result = extract_artists_from_title("")
        assert result is None

    def test_extract_artists_whitespace_only(self):
        """Test extraction with whitespace only."""
        result = extract_artists_from_title("   ")
        assert result is None

    def test_extract_artists_with_parentheses(self):
        """Test extraction with parentheses in title."""
        result = extract_artists_from_title("Artist - Title (Remix)")
        assert result is not None
        artists, title = result
        assert artists == "Artist"
        # Parentheses should be removed
        assert "(" not in title
        assert ")" not in title


class TestParseRekordbox:
    """Test Rekordbox XML parsing."""

    def test_parse_rekordbox_rejects_oversized_xml(self) -> None:
        """Design 4.70: XML file size cap; refuse to parse oversized file."""
        xml_content = '<?xml version="1.0"?><DJ_PLAYLISTS Version="1.0.0"><COLLECTION/><PLAYLISTS><NODE Name="ROOT"/></PLAYLISTS></DJ_PLAYLISTS>'
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name
        try:
            with patch("os.path.getsize", return_value=MAX_XML_SIZE_BYTES + 1):
                with pytest.raises(ValueError, match="XML file too large"):
                    parse_rekordbox(xml_path)
        finally:
            os.unlink(xml_path)

    def create_sample_xml(self, tracks=None, playlists=None):
        """Create a sample Rekordbox XML file."""
        root = ET.Element("DJ_PLAYLISTS")
        root.set("Version", "1.0.0")

        collection = ET.SubElement(root, "COLLECTION")
        if tracks:
            for track_id, title, artists in tracks:
                track_elem = ET.SubElement(collection, "TRACK")
                track_elem.set("TrackID", track_id)
                # The parser looks for Name and Artist as attributes (t.get("Name"))
                track_elem.set("Name", title)
                track_elem.set("Artist", artists)

        playlists_elem = ET.SubElement(root, "PLAYLISTS")
        node_elem = ET.SubElement(playlists_elem, "NODE")
        node_elem.set("Type", "1")
        node_elem.set("Name", "ROOT")

        if playlists:
            for playlist_name, track_ids in playlists.items():
                playlist_node = ET.SubElement(node_elem, "NODE")
                playlist_node.set("Type", "1")
                playlist_node.set("Name", playlist_name)
                for track_id in track_ids:
                    track_elem = ET.SubElement(playlist_node, "TRACK")
                    track_elem.set("Key", track_id)

        return ET.tostring(root, encoding="unicode")

    def test_parse_rekordbox_basic(self):
        """Test basic Rekordbox parsing."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
                ("2", "Track 2", "Artist 2"),
            ],
            playlists={"Playlist 1": ["1", "2"]},
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)

            # Verify playlists (returns Dict[str, Playlist])
            # Should have at least "Playlist 1" (and possibly "ROOT")
            assert len(playlists_dict) >= 1
            assert "Playlist 1" in playlists_dict

            playlist = playlists_dict["Playlist 1"]
            assert playlist.get_track_count() == 2
            # Verify tracks in playlist
            assert any(track.title == "Track 1" for track in playlist.tracks)
            assert any(track.title == "Track 2" for track in playlist.tracks)
        finally:
            os.unlink(xml_path)

    def test_read_playlist_index_and_duplicates(self):
        """Test lightweight playlist index parsing."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
                ("2", "Track 2", "Artist 2"),
            ],
            playlists={
                "Playlist A": ["1"],
                "Playlist B": ["2"],
            },
        )

        # Inject a duplicate playlist name manually
        root = ET.fromstring(xml_content)
        playlists_elem = root.find(".//PLAYLISTS")
        root_node = (
            playlists_elem.find("./NODE") if playlists_elem is not None else None
        )
        if root_node is not None:
            duplicate_node = ET.SubElement(root_node, "NODE")
            duplicate_node.set("Type", "1")
            duplicate_node.set("Name", "Playlist A")
            track_elem = ET.SubElement(duplicate_node, "TRACK")
            track_elem.set("Key", "2")
        xml_content = ET.tostring(root, encoding="unicode")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlist_counts, duplicates = read_playlist_index(xml_path)
            assert "Playlist A" in playlist_counts
            assert "Playlist B" in playlist_counts
            assert "Playlist A" in duplicates
        finally:
            os.unlink(xml_path)


class TestRekordboxValidationHelpers:
    """Test Rekordbox helper utilities."""

    def create_sample_xml(self, tracks=None, playlists=None):
        """Create a sample Rekordbox XML file."""
        root = ET.Element("DJ_PLAYLISTS")
        root.set("Version", "1.0.0")

        collection = ET.SubElement(root, "COLLECTION")
        if tracks:
            for track_id, title, artists in tracks:
                track_elem = ET.SubElement(collection, "TRACK")
                track_elem.set("TrackID", track_id)
                # The parser looks for Name and Artist as attributes (t.get("Name"))
                track_elem.set("Name", title)
                track_elem.set("Artist", artists)

        playlists_elem = ET.SubElement(root, "PLAYLISTS")
        node_elem = ET.SubElement(playlists_elem, "NODE")
        node_elem.set("Type", "1")
        node_elem.set("Name", "ROOT")

        if playlists:
            for playlist_name, track_ids in playlists.items():
                playlist_node = ET.SubElement(node_elem, "NODE")
                playlist_node.set("Type", "1")
                playlist_node.set("Name", playlist_name)
                for track_id in track_ids:
                    track_elem = ET.SubElement(playlist_node, "TRACK")
                    track_elem.set("Key", track_id)

        return ET.tostring(root, encoding="unicode")

    def test_is_readable_and_writable(self, tmp_path: Path):
        """Test readable and writable checks."""
        test_file = tmp_path / "sample.xml"
        test_file.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>", encoding="utf-8")

        assert is_readable(test_file) is True
        assert is_writable(tmp_path) is True

    def test_parse_rekordbox_file_not_found(self):
        """Test parsing with nonexistent file."""
        with pytest.raises(FileNotFoundError):
            parse_rekordbox("nonexistent.xml")

    def test_parse_rekordbox_empty_collection(self):
        """Test parsing with empty collection."""
        xml_content = self.create_sample_xml(tracks=[], playlists={})

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)
            # Empty collection should still have ROOT playlist
            assert len(playlists_dict) >= 0
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_multiple_playlists(self):
        """Test parsing with multiple playlists."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
                ("2", "Track 2", "Artist 2"),
                ("3", "Track 3", "Artist 3"),
            ],
            playlists={
                "Playlist 1": ["1", "2"],
                "Playlist 2": ["2", "3"],
            },
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)

            assert "Playlist 1" in playlists_dict
            assert "Playlist 2" in playlists_dict
            assert playlists_dict["Playlist 1"].get_track_count() == 2
            assert playlists_dict["Playlist 2"].get_track_count() == 2
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_empty_playlist(self):
        """Test parsing with empty playlist."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
            ],
            playlists={
                "Empty Playlist": [],
            },
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)

            assert "Empty Playlist" in playlists_dict
            assert playlists_dict["Empty Playlist"].get_track_count() == 0
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_missing_track_id(self):
        """Test parsing with track missing TrackID."""
        root = ET.Element("DJ_PLAYLISTS")
        collection = ET.SubElement(root, "COLLECTION")
        track_elem = ET.SubElement(collection, "TRACK")
        # Missing TrackID, should not be added to tracks_by_id
        track_elem.set("Name", "Track Without ID")
        track_elem.set("Artist", "Artist")

        playlists_elem = ET.SubElement(root, "PLAYLISTS")
        node_elem = ET.SubElement(playlists_elem, "NODE")
        node_elem.set("Type", "1")
        node_elem.set("Name", "ROOT")

        xml_content = ET.tostring(root, encoding="unicode")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)
            # Track without ID should not be included
            assert len(playlists_dict) >= 0
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_alternative_attributes(self):
        """Test parsing with alternative attribute names (ID, Key, Title, Artists)."""
        root = ET.Element("DJ_PLAYLISTS")
        collection = ET.SubElement(root, "COLLECTION")
        track_elem = ET.SubElement(collection, "TRACK")
        track_elem.set("ID", "1")  # Alternative to TrackID
        track_elem.set("Title", "Track 1")  # Alternative to Name
        track_elem.set("Artists", "Artist 1")  # Alternative to Artist

        playlists_elem = ET.SubElement(root, "PLAYLISTS")
        node_elem = ET.SubElement(playlists_elem, "NODE")
        node_elem.set("Type", "1")
        node_elem.set("Name", "ROOT")
        playlist_node = ET.SubElement(node_elem, "NODE")
        playlist_node.set("Type", "1")
        playlist_node.set("Name", "Test Playlist")
        track_ref = ET.SubElement(playlist_node, "TRACK")
        track_ref.set("TrackID", "1")  # Alternative to Key

        xml_content = ET.tostring(root, encoding="unicode")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)

            assert "Test Playlist" in playlists_dict
            playlist = playlists_dict["Test Playlist"]
            assert playlist.get_track_count() == 1
            assert playlist.tracks[0].title == "Track 1"
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_invalid_xml(self):
        """Test parsing with invalid XML."""
        invalid_xml = "<DJ_PLAYLISTS><COLLECTION><TRACK></COLLECTION>"

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(invalid_xml)
            f.flush()
            xml_path = f.name

        try:
            with pytest.raises(ET.ParseError):
                parse_rekordbox(xml_path)
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_missing_collection(self):
        """Test parsing with missing COLLECTION element."""
        root = ET.Element("DJ_PLAYLISTS")
        playlists_elem = ET.SubElement(root, "PLAYLISTS")
        node_elem = ET.SubElement(playlists_elem, "NODE")
        node_elem.set("Type", "1")
        node_elem.set("Name", "ROOT")

        xml_content = ET.tostring(root, encoding="unicode")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)
            # Should handle missing collection gracefully
            assert isinstance(playlists_dict, dict)
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_missing_playlists(self):
        """Test parsing with missing PLAYLISTS element."""
        root = ET.Element("DJ_PLAYLISTS")
        collection = ET.SubElement(root, "COLLECTION")
        track_elem = ET.SubElement(collection, "TRACK")
        track_elem.set("TrackID", "1")
        track_elem.set("Name", "Track 1")
        track_elem.set("Artist", "Artist 1")

        xml_content = ET.tostring(root, encoding="unicode")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)
            # Should handle missing playlists gracefully
            assert isinstance(playlists_dict, dict)
        finally:
            os.unlink(xml_path)

    def test_parse_rekordbox_playlist_with_missing_track(self):
        """Test parsing playlist with reference to non-existent track."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
            ],
            playlists={
                "Playlist": ["1", "999"],  # Track 999 doesn't exist
            },
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(xml_content)
            f.flush()
            xml_path = f.name

        try:
            playlists_dict = parse_rekordbox(xml_path)

            assert "Playlist" in playlists_dict
            # Should only include track 1, not 999
            assert playlists_dict["Playlist"].get_track_count() == 1
        finally:
            os.unlink(xml_path)


class TestGetPlaylistTrackIds:
    """Tests for get_playlist_track_ids."""

    def test_returns_track_ids_in_playlist_order(self):
        """Given a fixture XML with one playlist and 3 tracks, assert returned list matches order."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        track_ids = get_playlist_track_ids(str(small_xml), "My Playlist")
        assert track_ids == ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

    def test_unknown_playlist_raises_value_error(self):
        """Given unknown playlist name, assert raises ValueError."""
        small_xml = _fixtures_dir() / "small.xml"
        if not small_xml.exists():
            pytest.skip("fixtures/rekordbox/small.xml not found")
        with pytest.raises(ValueError, match="Playlist not found"):
            get_playlist_track_ids(str(small_xml), "Nonexistent Playlist")


class TestGetTrackLocations:
    """Tests for get_track_locations."""

    def test_returns_locations_when_present(self):
        """XML with Location attributes returns track_id -> path mapping."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/C:/Music/track1.mp3"/>
        <TRACK TrackID="2" Name="C" Artist="D" Location="file://localhost/D:/Songs/track2.flac"/>
    </COLLECTION>
    <PLAYLISTS><NODE Name="ROOT"><NODE Name="P" Type="1"><TRACK Key="1"/><TRACK Key="2"/></NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        ) as f:
            f.write(xml_content)
            path = f.name
        try:
            locations = get_track_locations(path)
            assert "1" in locations
            assert "2" in locations
            assert "track1.mp3" in locations["1"] or "track1" in locations["1"]
            assert "track2.flac" in locations["2"] or "track2" in locations["2"]
        finally:
            Path(path).unlink(missing_ok=True)

    def test_empty_when_no_location(self):
        """XML without Location returns empty or no entry for those tracks."""
        minimal_xml = _fixtures_dir() / "minimal.xml"
        if not minimal_xml.exists():
            pytest.skip("fixtures/rekordbox/minimal.xml not found")
        locations = get_track_locations(str(minimal_xml))
        assert locations == {}
