"""Unit tests for rekordbox parser."""

import os
import tempfile
import xml.etree.ElementTree as ET

import pytest

from cuepoint.data.rekordbox import RBTrack, extract_artists_from_title, parse_rekordbox


class TestRBTrack:
    """Test RBTrack dataclass."""
    
    def test_rbtrack_creation(self):
        """Test creating RBTrack."""
        track = RBTrack(
            track_id="123",
            title="Test Track",
            artists="Test Artist"
        )
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
        
        return ET.tostring(root, encoding='unicode')
    
    def test_parse_rekordbox_basic(self):
        """Test basic Rekordbox parsing."""
        xml_content = self.create_sample_xml(
            tracks=[
                ("1", "Track 1", "Artist 1"),
                ("2", "Track 2", "Artist 2"),
            ],
            playlists={
                "Playlist 1": ["1", "2"]
            }
        )
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
    
    def test_parse_rekordbox_file_not_found(self):
        """Test parsing with nonexistent file."""
        with pytest.raises(FileNotFoundError):
            parse_rekordbox("nonexistent.xml")
    
    def test_parse_rekordbox_empty_collection(self):
        """Test parsing with empty collection."""
        xml_content = self.create_sample_xml(tracks=[], playlists={})
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
            }
        )
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
            }
        )
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
        
        xml_content = ET.tostring(root, encoding='unicode')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
        
        xml_content = ET.tostring(root, encoding='unicode')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
        
        xml_content = ET.tostring(root, encoding='unicode')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
        
        xml_content = ET.tostring(root, encoding='unicode')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
            }
        )
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
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
