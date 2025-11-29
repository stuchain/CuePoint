#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Playlist model.
"""

import pytest
from pathlib import Path

from cuepoint.models.playlist import Playlist
from cuepoint.models.track import Track


class TestPlaylistCreation:
    """Test Playlist model creation."""

    def test_create_valid_playlist(self):
        """Test creating a valid playlist."""
        playlist = Playlist(name="Test Playlist")
        assert playlist.name == "Test Playlist"
        assert len(playlist.tracks) == 0
        assert playlist.file_path is None

    def test_create_playlist_with_tracks(self):
        """Test creating playlist with tracks."""
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        playlist = Playlist(name="Test Playlist", tracks=[track1, track2])
        assert playlist.name == "Test Playlist"
        assert len(playlist.tracks) == 2
        assert playlist.tracks[0].title == "Track 1"
        assert playlist.tracks[1].title == "Track 2"

    def test_create_playlist_with_all_fields(self):
        """Test creating playlist with all optional fields."""
        track = Track(title="Track 1", artist="Artist 1")
        playlist = Playlist(
            name="Test Playlist",
            tracks=[track],
            file_path=Path("/path/to/playlist.xml"),
            created_date="2020-01-01",
            modified_date="2020-01-02",
        )
        assert playlist.name == "Test Playlist"
        assert len(playlist.tracks) == 1
        assert playlist.file_path == Path("/path/to/playlist.xml")
        assert playlist.created_date == "2020-01-01"
        assert playlist.modified_date == "2020-01-02"


class TestPlaylistValidation:
    """Test Playlist model validation."""

    def test_validation_rejects_empty_name(self):
        """Test validation rejects empty name."""
        with pytest.raises(ValueError, match="name cannot be empty"):
            Playlist(name="")

    def test_validation_rejects_whitespace_name(self):
        """Test validation rejects whitespace-only name."""
        with pytest.raises(ValueError, match="name cannot be empty"):
            Playlist(name="   ")


class TestPlaylistTrackManagement:
    """Test Playlist track management methods."""

    def test_add_track(self):
        """Test adding a track to playlist."""
        playlist = Playlist(name="Test Playlist")
        track = Track(title="Track 1", artist="Artist 1")
        playlist.add_track(track)
        assert len(playlist.tracks) == 1
        assert playlist.tracks[0] == track
        assert track.position == 1

    def test_add_track_sets_position(self):
        """Test that adding track sets position automatically."""
        playlist = Playlist(name="Test Playlist")
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        playlist.add_track(track1)
        playlist.add_track(track2)
        assert track1.position == 1
        assert track2.position == 2

    def test_add_track_preserves_existing_position(self):
        """Test that adding track with existing position preserves it."""
        playlist = Playlist(name="Test Playlist")
        track = Track(title="Track 1", artist="Artist 1", position=5)
        playlist.add_track(track)
        assert track.position == 5

    def test_remove_track(self):
        """Test removing a track from playlist."""
        playlist = Playlist(name="Test Playlist")
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        playlist.add_track(track1)
        playlist.add_track(track2)
        playlist.remove_track(track1)
        assert len(playlist.tracks) == 1
        assert playlist.tracks[0] == track2

    def test_remove_track_updates_positions(self):
        """Test that removing track updates positions."""
        playlist = Playlist(name="Test Playlist")
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        track3 = Track(title="Track 3", artist="Artist 3")
        playlist.add_track(track1)
        playlist.add_track(track2)
        playlist.add_track(track3)
        playlist.remove_track(track1)
        assert track2.position == 1
        assert track3.position == 2

    def test_remove_track_not_in_playlist(self):
        """Test removing track not in playlist does nothing."""
        playlist = Playlist(name="Test Playlist")
        track1 = Track(title="Track 1", artist="Artist 1")
        track2 = Track(title="Track 2", artist="Artist 2")
        playlist.add_track(track1)
        playlist.remove_track(track2)  # Not in playlist
        assert len(playlist.tracks) == 1
        assert playlist.tracks[0] == track1

    def test_get_track_count(self):
        """Test getting track count."""
        playlist = Playlist(name="Test Playlist")
        assert playlist.get_track_count() == 0
        playlist.add_track(Track(title="Track 1", artist="Artist 1"))
        assert playlist.get_track_count() == 1
        playlist.add_track(Track(title="Track 2", artist="Artist 2"))
        assert playlist.get_track_count() == 2


class TestPlaylistSerialization:
    """Test Playlist model serialization."""

    def test_to_dict(self):
        """Test converting playlist to dictionary."""
        track = Track(title="Track 1", artist="Artist 1")
        playlist = Playlist(
            name="Test Playlist",
            tracks=[track],
            file_path=Path("/path/to/playlist.xml"),
            created_date="2020-01-01",
            modified_date="2020-01-02",
        )
        data = playlist.to_dict()
        assert data["name"] == "Test Playlist"
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["title"] == "Track 1"
        # Path conversion may use different separators on different platforms
        assert data["file_path"] in ("/path/to/playlist.xml", "\\path\\to\\playlist.xml")
        assert data["created_date"] == "2020-01-01"
        assert data["modified_date"] == "2020-01-02"

    def test_to_dict_without_file_path(self):
        """Test to_dict when file_path is None."""
        playlist = Playlist(name="Test Playlist")
        data = playlist.to_dict()
        assert data["file_path"] is None

    def test_from_dict(self):
        """Test creating playlist from dictionary."""
        data = {
            "name": "Test Playlist",
            "tracks": [
                {"title": "Track 1", "artist": "Artist 1"},
                {"title": "Track 2", "artist": "Artist 2"},
            ],
            "file_path": "/path/to/playlist.xml",
            "created_date": "2020-01-01",
            "modified_date": "2020-01-02",
        }
        playlist = Playlist.from_dict(data)
        assert playlist.name == "Test Playlist"
        assert len(playlist.tracks) == 2
        assert playlist.tracks[0].title == "Track 1"
        assert playlist.tracks[1].title == "Track 2"
        assert playlist.file_path == Path("/path/to/playlist.xml")
        assert playlist.created_date == "2020-01-01"
        assert playlist.modified_date == "2020-01-02"

    def test_from_dict_without_file_path(self):
        """Test from_dict when file_path is None."""
        data = {
            "name": "Test Playlist",
            "tracks": [],
        }
        playlist = Playlist.from_dict(data)
        assert playlist.file_path is None

    def test_serialization_round_trip(self):
        """Test serialization round trip."""
        track1 = Track(title="Track 1", artist="Artist 1", bpm=128.0)
        track2 = Track(title="Track 2", artist="Artist 2", bpm=130.0)
        original = Playlist(
            name="Test Playlist",
            tracks=[track1, track2],
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


class TestPlaylistStringRepresentation:
    """Test Playlist string representations."""

    def test_str_representation(self):
        """Test string representation."""
        playlist = Playlist(name="Test Playlist")
        assert "Test Playlist" in str(playlist)
        assert "0 tracks" in str(playlist)
        playlist.add_track(Track(title="Track 1", artist="Artist 1"))
        assert "1 tracks" in str(playlist)

    def test_repr_representation(self):
        """Test developer representation."""
        playlist = Playlist(name="Test Playlist")
        repr_str = repr(playlist)
        assert "Playlist" in repr_str
        assert "Test Playlist" in repr_str
        assert "track_count=0" in repr_str or "0" in repr_str

