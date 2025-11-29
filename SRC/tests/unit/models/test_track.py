#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Track model.
"""

import pytest
from datetime import datetime

from cuepoint.models.track import Track


class TestTrackCreation:
    """Test Track model creation."""

    def test_create_valid_track(self):
        """Test creating a valid track."""
        track = Track(title="Test Track", artist="Test Artist")
        assert track.title == "Test Track"
        assert track.artist == "Test Artist"
        assert track.album is None
        assert track.bpm is None

    def test_create_track_with_all_fields(self):
        """Test creating track with all optional fields."""
        track = Track(
            title="Test Track",
            artist="Test Artist",
            album="Test Album",
            duration=180.5,
            bpm=128.0,
            key="A",
            year=2020,
            genre="House",
            label="Test Label",
            position=1,
            file_path="/path/to/file.mp3",
            track_id="12345",
        )
        assert track.title == "Test Track"
        assert track.artist == "Test Artist"
        assert track.album == "Test Album"
        assert track.duration == 180.5
        assert track.bpm == 128.0
        assert track.key == "A"
        assert track.year == 2020
        assert track.genre == "House"
        assert track.label == "Test Label"
        assert track.position == 1
        assert track.file_path == "/path/to/file.mp3"
        assert track.track_id == "12345"


class TestTrackValidation:
    """Test Track model validation."""

    def test_validation_rejects_empty_title(self):
        """Test validation rejects empty title."""
        with pytest.raises(ValueError, match="title cannot be empty"):
            Track(title="", artist="Artist")

    def test_validation_rejects_whitespace_title(self):
        """Test validation rejects whitespace-only title."""
        with pytest.raises(ValueError, match="title cannot be empty"):
            Track(title="   ", artist="Artist")

    def test_validation_rejects_empty_artist(self):
        """Test validation rejects empty artist."""
        with pytest.raises(ValueError, match="artist cannot be empty"):
            Track(title="Title", artist="")

    def test_validation_rejects_whitespace_artist(self):
        """Test validation rejects whitespace-only artist."""
        with pytest.raises(ValueError, match="artist cannot be empty"):
            Track(title="Title", artist="   ")

    def test_validation_rejects_negative_duration(self):
        """Test validation rejects negative duration."""
        with pytest.raises(ValueError, match="duration cannot be negative"):
            Track(title="Title", artist="Artist", duration=-1.0)

    def test_validation_rejects_invalid_bpm_too_low(self):
        """Test validation rejects BPM below 0."""
        with pytest.raises(ValueError, match="BPM must be between 0 and 300"):
            Track(title="Title", artist="Artist", bpm=-1.0)

    def test_validation_rejects_invalid_bpm_too_high(self):
        """Test validation rejects BPM above 300."""
        with pytest.raises(ValueError, match="BPM must be between 0 and 300"):
            Track(title="Title", artist="Artist", bpm=301.0)

    def test_validation_accepts_valid_bpm(self):
        """Test validation accepts valid BPM."""
        track = Track(title="Title", artist="Artist", bpm=128.0)
        assert track.bpm == 128.0

    def test_validation_rejects_invalid_year_too_old(self):
        """Test validation rejects year before 1900."""
        with pytest.raises(ValueError, match="year must be between"):
            Track(title="Title", artist="Artist", year=1899)

    def test_validation_rejects_invalid_year_too_new(self):
        """Test validation rejects year too far in future."""
        future_year = datetime.now().year + 2
        with pytest.raises(ValueError, match="year must be between"):
            Track(title="Title", artist="Artist", year=future_year)

    def test_validation_accepts_valid_year(self):
        """Test validation accepts valid year."""
        track = Track(title="Title", artist="Artist", year=2020)
        assert track.year == 2020


class TestTrackSerialization:
    """Test Track model serialization."""

    def test_to_dict(self):
        """Test converting track to dictionary."""
        track = Track(
            title="Test Track",
            artist="Test Artist",
            album="Test Album",
            bpm=128.0,
            year=2020,
        )
        data = track.to_dict()
        assert data["title"] == "Test Track"
        assert data["artist"] == "Test Artist"
        assert data["album"] == "Test Album"
        assert data["bpm"] == 128.0
        assert data["year"] == 2020
        assert data["duration"] is None

    def test_from_dict(self):
        """Test creating track from dictionary."""
        data = {
            "title": "Test Track",
            "artist": "Test Artist",
            "album": "Test Album",
            "bpm": 128.0,
            "year": 2020,
        }
        track = Track.from_dict(data)
        assert track.title == "Test Track"
        assert track.artist == "Test Artist"
        assert track.album == "Test Album"
        assert track.bpm == 128.0
        assert track.year == 2020

    def test_serialization_round_trip(self):
        """Test serialization round trip."""
        original = Track(
            title="Test Track",
            artist="Test Artist",
            album="Test Album",
            duration=180.5,
            bpm=128.0,
            key="A",
            year=2020,
            genre="House",
            label="Test Label",
            position=1,
            file_path="/path/to/file.mp3",
            track_id="12345",
        )
        data = original.to_dict()
        restored = Track.from_dict(data)
        assert restored.title == original.title
        assert restored.artist == original.artist
        assert restored.album == original.album
        assert restored.duration == original.duration
        assert restored.bpm == original.bpm
        assert restored.key == original.key
        assert restored.year == original.year
        assert restored.genre == original.genre
        assert restored.label == original.label
        assert restored.position == original.position
        assert restored.file_path == original.file_path
        assert restored.track_id == original.track_id


class TestTrackStringRepresentation:
    """Test Track string representations."""

    def test_str_representation(self):
        """Test string representation."""
        track = Track(title="Test Track", artist="Test Artist")
        assert str(track) == "Test Artist - Test Track"

    def test_repr_representation(self):
        """Test developer representation."""
        track = Track(title="Test Track", artist="Test Artist", bpm=128.0, year=2020)
        repr_str = repr(track)
        assert "Track" in repr_str
        assert "Test Track" in repr_str
        assert "Test Artist" in repr_str
        assert "128.0" in repr_str
        assert "2020" in repr_str

