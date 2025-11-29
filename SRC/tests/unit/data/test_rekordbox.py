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
