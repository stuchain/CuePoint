#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive edge case tests for Playlist model.

Tests all boundary conditions, error handling, and edge cases.
"""

import pytest
from pathlib import Path

from cuepoint.models.playlist import Playlist
from cuepoint.models.track import Track


class TestPlaylistEdgeCases:
    """Test Playlist edge cases."""

    def test_playlist_with_unicode_name(self):
        """Test playlist handles Unicode characters in name."""
        playlist = Playlist(name="Playlist 🎵 🎤")
        assert "🎵" in playlist.name

    def test_playlist_with_special_characters(self):
        """Test playlist handles special characters in name."""
        playlist = Playlist(name="Playlist (2024) [Extended]")
        assert playlist.name == "Playlist (2024) [Extended]"

    def test_playlist_with_very_long_name(self):
        """Test playlist handles very long name."""
        long_name = "A" * 1000
        playlist = Playlist(name=long_name)
        assert len(playlist.name) == 1000

    def test_playlist_with_empty_tracks(self):
        """Test playlist with empty tracks list."""
        playlist = Playlist(name="Empty Playlist", tracks=[])
        assert len(playlist.tracks) == 0
        assert playlist.get_track_count() == 0

    def test_playlist_with_many_tracks(self):
        """Test playlist with many tracks."""
        tracks = [
            Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1000)
        ]
        playlist = Playlist(name="Large Playlist", tracks=tracks)
        assert playlist.get_track_count() == 1000

    def test_playlist_with_none_optional_fields(self):
        """Test playlist with None optional fields."""
        playlist = Playlist(
            name="Playlist",
            tracks=[],
            file_path=None,
            created_date=None,
            modified_date=None,
        )
        assert playlist.file_path is None
        assert playlist.created_date is None
        assert playlist.modified_date is None

    def test_playlist_file_path_handling(self):
        """Test playlist file_path field handling."""
        playlist1 = Playlist(
            name="Playlist",
            file_path=Path("/path/to/playlist.xml"),
        )
        assert playlist1.file_path == Path("/path/to/playlist.xml")

        playlist2 = Playlist(
            name="Playlist",
            file_path=Path("C:\\Windows\\Path\\playlist.xml"),
        )
        assert playlist2.file_path == Path("C:\\Windows\\Path\\playlist.xml")


class TestPlaylistTrackManagementEdgeCases:
    """Test Playlist track management edge cases."""

    def test_add_track_sets_position_automatically(self):
        """Test adding track sets position automatically."""
        playlist = Playlist(name="Playlist")
        track = Track(title="Track", artist="Artist")
        assert track.position is None
        playlist.add_track(track)
        assert track.position == 1

    def test_add_track_preserves_existing_position(self):
        """Test adding track with existing position preserves it."""
        playlist = Playlist(name="Playlist")
        track = Track(title="Track", artist="Artist", position=10)
        playlist.add_track(track)
        assert track.position == 10

    def test_add_same_track_twice(self):
        """Test adding the same track twice."""
        playlist = Playlist(name="Playlist")
        track = Track(title="Track", artist="Artist")
        playlist.add_track(track)
        playlist.add_track(track)  # Add again
        # Should be added twice (no duplicate check)
        assert playlist.get_track_count() == 2

    def test_remove_track_not_in_playlist(self):
        """Test removing track not in playlist."""
        playlist = Playlist(name="Playlist")
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        playlist.add_track(track1)
        playlist.remove_track(track2)  # Not in playlist
        assert playlist.get_track_count() == 1
        assert playlist.tracks[0] == track1

    def test_remove_track_updates_all_positions(self):
        """Test removing track updates all remaining positions."""
        playlist = Playlist(name="Playlist")
        tracks = [
            Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 6)
        ]
        for track in tracks:
            playlist.add_track(track)

        # Remove middle track
        playlist.remove_track(tracks[2])

        # Positions should be updated
        assert playlist.tracks[0].position == 1
        assert playlist.tracks[1].position == 2
        assert playlist.tracks[2].position == 3
        assert playlist.tracks[3].position == 4

    def test_remove_all_tracks(self):
        """Test removing all tracks."""
        playlist = Playlist(name="Playlist")
        tracks = [
            Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(1, 4)
        ]
        for track in tracks:
            playlist.add_track(track)

        for track in tracks:
            playlist.remove_track(track)

        assert playlist.get_track_count() == 0
        assert len(playlist.tracks) == 0


class TestPlaylistSerializationEdgeCases:
    """Test Playlist serialization edge cases."""

    def test_to_dict_with_none_file_path(self):
        """Test to_dict with None file_path."""
        playlist = Playlist(name="Playlist", file_path=None)
        data = playlist.to_dict()
        assert data["file_path"] is None

    def test_to_dict_with_path_object(self):
        """Test to_dict converts Path object to string."""
        playlist = Playlist(
            name="Playlist",
            file_path=Path("/path/to/playlist.xml"),
        )
        data = playlist.to_dict()
        assert isinstance(data["file_path"], str)
        assert "playlist.xml" in data["file_path"]

    def test_from_dict_with_string_file_path(self):
        """Test from_dict converts string to Path."""
        data = {
            "name": "Playlist",
            "tracks": [],
            "file_path": "/path/to/playlist.xml",
        }
        playlist = Playlist.from_dict(data)
        assert isinstance(playlist.file_path, Path)
        assert playlist.file_path == Path("/path/to/playlist.xml")

    def test_from_dict_with_none_file_path(self):
        """Test from_dict with None file_path."""
        data = {"name": "Playlist", "tracks": [], "file_path": None}
        playlist = Playlist.from_dict(data)
        assert playlist.file_path is None

    def test_from_dict_with_missing_fields(self):
        """Test from_dict handles missing fields."""
        data = {"name": "Playlist"}  # Missing tracks, dates, etc.
        playlist = Playlist.from_dict(data)
        assert playlist.name == "Playlist"
        assert len(playlist.tracks) == 0
        assert playlist.file_path is None
        assert playlist.created_date is None
        assert playlist.modified_date is None

    def test_from_dict_with_empty_tracks(self):
        """Test from_dict with empty tracks list."""
        data = {"name": "Playlist", "tracks": []}
        playlist = Playlist.from_dict(data)
        assert len(playlist.tracks) == 0

    def test_serialization_round_trip_with_all_fields(self):
        """Test serialization round trip with all fields."""
        tracks = [
            Track(title="Track 1", artist="Artist 1", bpm=128.0),
            Track(title="Track 2", artist="Artist 2", bpm=130.0),
        ]
        original = Playlist(
            name="Test Playlist",
            tracks=tracks,
            file_path=Path("/path/to/playlist.xml"),
            created_date="2020-01-01",
            modified_date="2020-01-02",
        )
        data = original.to_dict()
        restored = Playlist.from_dict(data)
        assert restored.name == original.name
        assert len(restored.tracks) == len(original.tracks)
        assert restored.tracks[0].title == original.tracks[0].title
        assert restored.tracks[1].title == original.tracks[1].title
        assert restored.file_path == original.file_path
        assert restored.created_date == original.created_date
        assert restored.modified_date == original.modified_date


class TestPlaylistValidationEdgeCases:
    """Test Playlist validation edge cases."""

    def test_validation_rejects_none_name(self):
        """Test validation rejects None name."""
        with pytest.raises((ValueError, TypeError)):
            Playlist(name=None)  # type: ignore

    def test_validation_accepts_single_character_name(self):
        """Test validation accepts single character name."""
        playlist = Playlist(name="A")
        assert playlist.name == "A"

    def test_validation_accepts_unicode_name(self):
        """Test validation accepts Unicode name."""
        playlist = Playlist(name="プレイリスト")
        assert playlist.name == "プレイリスト"


class TestPlaylistStringRepresentationEdgeCases:
    """Test Playlist string representation edge cases."""

    def test_str_with_no_tracks(self):
        """Test string representation with no tracks."""
        playlist = Playlist(name="Empty Playlist")
        str_repr = str(playlist)
        assert "Empty Playlist" in str_repr
        assert "0 tracks" in str_repr

    def test_str_with_one_track(self):
        """Test string representation with one track."""
        playlist = Playlist(name="Playlist")
        playlist.add_track(Track(title="Track", artist="Artist"))
        str_repr = str(playlist)
        assert "1 tracks" in str_repr or "1 track" in str_repr

    def test_str_with_many_tracks(self):
        """Test string representation with many tracks."""
        playlist = Playlist(name="Playlist")
        for i in range(100):
            playlist.add_track(Track(title=f"Track {i}", artist=f"Artist {i}"))
        str_repr = str(playlist)
        assert "100 tracks" in str_repr

    def test_repr_with_all_fields(self):
        """Test repr with all fields."""
        playlist = Playlist(
            name="Test Playlist",
            file_path=Path("/path/to/playlist.xml"),
        )
        repr_str = repr(playlist)
        assert "Playlist" in repr_str
        assert "Test Playlist" in repr_str

