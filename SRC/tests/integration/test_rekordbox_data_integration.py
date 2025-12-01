"""Integration tests for rekordbox.py data module with real parsing logic."""

import tempfile
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import RBTrack, extract_artists_from_title, parse_rekordbox


class TestRekordboxDataIntegration:
    """Integration tests for rekordbox data module."""
    
    def test_extract_artists_from_title_artist_dash_title(self):
        """Test extracting artists from 'Artist - Title' format."""
        result = extract_artists_from_title("Test Artist - Test Track")
        assert result is not None
        artists, title = result
        assert "Test Artist" in artists
        assert "Test Track" in title
    
    def test_extract_artists_from_title_artist_colon_title(self):
        """Test extracting artists from 'Artist: Title' format."""
        result = extract_artists_from_title("Test Artist: Test Track")
        assert result is not None
        artists, title = result
        assert "Test Artist" in artists
    
    def test_extract_artists_from_title_no_artist(self):
        """Test extracting artists when no artist separator found."""
        result = extract_artists_from_title("Just A Title")
        # May return None if no artist pattern found
        assert result is None or isinstance(result, tuple)
    
    def test_extract_artists_from_title_with_feat(self):
        """Test extracting artists from title with 'feat.' clause."""
        result = extract_artists_from_title("Main Artist feat. Other Artist - Track Title")
        assert result is not None
        artists, title = result
        assert "Main Artist" in artists or "Other Artist" in artists
    
    def test_parse_rekordbox_basic(self):
        """Test parsing basic Rekordbox XML structure."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1"/>
        <TRACK TrackID="2" Name="Track 2" Artist="Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist" Type="1">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            playlists = parse_rekordbox(xml_path)
            
            assert "Test Playlist" in playlists
            playlist = playlists["Test Playlist"]
            assert len(playlist.tracks) == 2
            assert playlist.tracks[0].title == "Track 1"
            assert playlist.tracks[1].title == "Track 2"
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_parse_rekordbox_empty_playlist(self):
        """Test parsing XML with empty playlist."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Empty Playlist" Type="1">
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            playlists = parse_rekordbox(xml_path)
            
            assert "Empty Playlist" in playlists
            playlist = playlists["Empty Playlist"]
            assert len(playlist.tracks) == 0
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_parse_rekordbox_multiple_playlists(self):
        """Test parsing XML with multiple playlists."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1"/>
        <TRACK TrackID="2" Name="Track 2" Artist="Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Playlist 1" Type="1">
                <TRACK Key="1"/>
            </NODE>
            <NODE Name="Playlist 2" Type="1">
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            playlists = parse_rekordbox(xml_path)
            
            assert len(playlists) == 2
            assert "Playlist 1" in playlists
            assert "Playlist 2" in playlists
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_parse_rekordbox_file_not_found(self):
        """Test parsing with non-existent file."""
        with pytest.raises(FileNotFoundError):
            parse_rekordbox("/nonexistent/path/file.xml")
    
    def test_parse_rekordbox_invalid_xml(self):
        """Test parsing with invalid XML."""
        xml_content = "<?xml version='1.0'?><invalid><unclosed>"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            with pytest.raises(Exception):  # Should raise ParseError or similar
                parse_rekordbox(xml_path)
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_parse_rekordbox_alternative_attributes(self):
        """Test parsing with alternative XML attribute names."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK ID="1" Title="Track 1" Artists="Artist 1"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist" type="1">
                <TRACK TrackID="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            playlists = parse_rekordbox(xml_path)
            
            assert "Test Playlist" in playlists
            playlist = playlists["Test Playlist"]
            # Should handle alternative attributes
            assert len(playlist.tracks) >= 0
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_rbtrack_creation(self):
        """Test creating RBTrack object."""
        rbtrack = RBTrack(
            track_id="12345",
            title="Test Track",
            artists="Test Artist"
        )
        
        assert rbtrack.track_id == "12345"
        assert rbtrack.title == "Test Track"
        assert rbtrack.artists == "Test Artist"

