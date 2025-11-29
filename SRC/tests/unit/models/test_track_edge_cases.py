#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive edge case tests for Track model.

Tests all boundary conditions, error handling, and edge cases.
"""

import pytest
from datetime import datetime

from cuepoint.models.track import Track


class TestTrackEdgeCases:
    """Test Track model edge cases."""

    def test_track_with_unicode_characters(self):
        """Test track handles Unicode characters correctly."""
        track = Track(
            title="Test Track 🎵",
            artist="Artist Name 🎤",
            genre="House 🏠",
        )
        assert "🎵" in track.title
        assert "🎤" in track.artist
        assert "🏠" in track.genre

    def test_track_with_special_characters(self):
        """Test track handles special characters."""
        track = Track(
            title="Track (Remix) [Extended]",
            artist="Artist & Co.",
            album="Album: The Collection",
        )
        assert track.title == "Track (Remix) [Extended]"
        assert track.artist == "Artist & Co."
        assert track.album == "Album: The Collection"

    def test_track_with_very_long_strings(self):
        """Test track handles very long strings."""
        long_title = "A" * 1000
        long_artist = "B" * 500
        track = Track(title=long_title, artist=long_artist)
        assert len(track.title) == 1000
        assert len(track.artist) == 500

    def test_track_with_zero_duration(self):
        """Test track accepts zero duration."""
        track = Track(title="Title", artist="Artist", duration=0.0)
        assert track.duration == 0.0

    def test_track_with_very_long_duration(self):
        """Test track accepts very long duration."""
        track = Track(title="Title", artist="Artist", duration=3600.0)  # 1 hour
        assert track.duration == 3600.0

    def test_track_with_bpm_at_boundaries(self):
        """Test track BPM at boundary values."""
        # Minimum valid BPM
        track1 = Track(title="Title", artist="Artist", bpm=0.0)
        assert track1.bpm == 0.0

        # Maximum valid BPM
        track2 = Track(title="Title", artist="Artist", bpm=300.0)
        assert track2.bpm == 300.0

    def test_track_with_year_at_boundaries(self):
        """Test track year at boundary values."""
        current_year = datetime.now().year

        # Minimum valid year
        track1 = Track(title="Title", artist="Artist", year=1900)
        assert track1.year == 1900

        # Maximum valid year (current year + 1)
        track2 = Track(title="Title", artist="Artist", year=current_year + 1)
        assert track2.year == current_year + 1

    def test_track_with_none_optional_fields(self):
        """Test track with all optional fields as None."""
        track = Track(
            title="Title",
            artist="Artist",
            album=None,
            duration=None,
            bpm=None,
            key=None,
            year=None,
            genre=None,
            label=None,
            position=None,
            file_path=None,
            track_id=None,
        )
        assert track.album is None
        assert track.duration is None
        assert track.bpm is None
        assert track.key is None
        assert track.year is None

    def test_track_with_empty_string_optional_fields(self):
        """Test track with empty string optional fields."""
        track = Track(
            title="Title",
            artist="Artist",
            album="",
            key="",
            genre="",
            label="",
        )
        assert track.album == ""
        assert track.key == ""
        assert track.genre == ""
        assert track.label == ""

    def test_track_serialization_with_none_values(self):
        """Test serialization handles None values correctly."""
        track = Track(
            title="Title",
            artist="Artist",
            album=None,
            duration=None,
            bpm=None,
        )
        data = track.to_dict()
        assert data["album"] is None
        assert data["duration"] is None
        assert data["bpm"] is None

    def test_track_from_dict_with_missing_fields(self):
        """Test from_dict handles missing fields."""
        data = {"title": "Title", "artist": "Artist"}
        track = Track.from_dict(data)
        assert track.title == "Title"
        assert track.artist == "Artist"
        assert track.album is None

    def test_track_from_dict_with_extra_fields(self):
        """Test from_dict ignores extra fields."""
        data = {
            "title": "Title",
            "artist": "Artist",
            "extra_field": "should be ignored",
        }
        track = Track.from_dict(data)
        assert track.title == "Title"
        assert track.artist == "Artist"
        # Extra field should not cause error

    def test_track_position_handling(self):
        """Test track position field handling."""
        track1 = Track(title="Title", artist="Artist", position=1)
        assert track1.position == 1

        track2 = Track(title="Title", artist="Artist", position=999)
        assert track2.position == 999

        track3 = Track(title="Title", artist="Artist", position=None)
        assert track3.position is None

    def test_track_file_path_handling(self):
        """Test track file_path field handling."""
        track1 = Track(
            title="Title",
            artist="Artist",
            file_path="/path/to/file.mp3",
        )
        assert track1.file_path == "/path/to/file.mp3"

        track2 = Track(
            title="Title",
            artist="Artist",
            file_path="C:\\Windows\\Path\\file.mp3",
        )
        assert track2.file_path == "C:\\Windows\\Path\\file.mp3"

    def test_track_track_id_handling(self):
        """Test track track_id field handling."""
        track1 = Track(title="Title", artist="Artist", track_id="12345")
        assert track1.track_id == "12345"

        track2 = Track(title="Title", artist="Artist", track_id="")
        assert track2.track_id == ""

        track3 = Track(title="Title", artist="Artist", track_id=None)
        assert track3.track_id is None


class TestTrackValidationEdgeCases:
    """Test Track validation edge cases."""

    def test_validation_rejects_none_title(self):
        """Test validation rejects None title."""
        with pytest.raises((ValueError, TypeError)):
            Track(title=None, artist="Artist")  # type: ignore

    def test_validation_rejects_none_artist(self):
        """Test validation rejects None artist."""
        with pytest.raises((ValueError, TypeError)):
            Track(title="Title", artist=None)  # type: ignore

    def test_validation_accepts_zero_duration(self):
        """Test validation accepts zero duration."""
        track = Track(title="Title", artist="Artist", duration=0.0)
        assert track.duration == 0.0

    def test_validation_accepts_exactly_300_bpm(self):
        """Test validation accepts exactly 300 BPM."""
        track = Track(title="Title", artist="Artist", bpm=300.0)
        assert track.bpm == 300.0

    def test_validation_accepts_exactly_0_bpm(self):
        """Test validation accepts exactly 0 BPM."""
        track = Track(title="Title", artist="Artist", bpm=0.0)
        assert track.bpm == 0.0

    def test_validation_accepts_current_year(self):
        """Test validation accepts current year."""
        current_year = datetime.now().year
        track = Track(title="Title", artist="Artist", year=current_year)
        assert track.year == current_year

    def test_validation_accepts_next_year(self):
        """Test validation accepts next year."""
        next_year = datetime.now().year + 1
        track = Track(title="Title", artist="Artist", year=next_year)
        assert track.year == next_year


class TestTrackStringRepresentationEdgeCases:
    """Test Track string representation edge cases."""

    def test_str_with_all_fields(self):
        """Test string representation with all fields."""
        track = Track(
            title="Test Track",
            artist="Test Artist",
            album="Test Album",
            bpm=128.0,
            year=2020,
        )
        str_repr = str(track)
        assert "Test Artist" in str_repr
        assert "Test Track" in str_repr

    def test_str_with_minimal_fields(self):
        """Test string representation with minimal fields."""
        track = Track(title="Title", artist="Artist")
        str_repr = str(track)
        assert "Artist" in str_repr
        assert "Title" in str_repr

    def test_repr_with_none_values(self):
        """Test repr with None values."""
        track = Track(
            title="Title",
            artist="Artist",
            album=None,
            duration=None,
        )
        repr_str = repr(track)
        assert "Track" in repr_str
        assert "Title" in repr_str

