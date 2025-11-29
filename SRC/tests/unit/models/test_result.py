#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive tests for TrackResult model.

Tests all validation rules, edge cases, and error handling.
"""

import pytest
from datetime import datetime

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult


class TestTrackResultCreation:
    """Test TrackResult model creation."""

    def test_create_valid_result(self):
        """Test creating a valid result."""
        result = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
        )
        assert result.playlist_index == 1
        assert result.title == "Test Track"
        assert result.artist == "Test Artist"
        assert result.matched is True

    def test_create_result_with_all_fields(self):
        """Test creating result with all optional fields."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Beatport Track",
            artists="Beatport Artist",
            label="Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="query",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
        )
        result = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
            best_match=candidate,
            candidates=[candidate],
            beatport_url="https://www.beatport.com/track/test/123",
            beatport_title="Beatport Track",
            beatport_artists="Beatport Artist",
            beatport_key="A",
            beatport_key_camelot="8A",
            beatport_year="2020",
            beatport_bpm="128",
            beatport_label="Label",
            beatport_genres="House",
            beatport_release="Release",
            beatport_release_date="2020-01-01",
            beatport_track_id="123",
            match_score=85.5,
            title_sim=90.0,
            artist_sim=80.0,
            confidence="high",
            search_query_index="1",
            search_stop_query_index="2",
            candidate_index="0",
            candidates_data=[{"url": "https://beatport.com/track/test/123"}],
            queries_data=[{"index": 1, "query": "test query"}],
            processing_time=1.5,
        )
        assert result.best_match == candidate
        assert len(result.candidates) == 1
        assert result.match_score == 85.5


class TestTrackResultValidation:
    """Test TrackResult model validation."""

    def test_validation_rejects_empty_title(self):
        """Test validation rejects empty title."""
        with pytest.raises(ValueError, match="title cannot be empty"):
            TrackResult(playlist_index=1, title="", artist="Artist", matched=False)

    def test_validation_rejects_whitespace_title(self):
        """Test validation rejects whitespace-only title."""
        with pytest.raises(ValueError, match="title cannot be empty"):
            TrackResult(playlist_index=1, title="   ", artist="Artist", matched=False)

    def test_validation_rejects_empty_artist(self):
        """Test validation rejects empty artist."""
        with pytest.raises(ValueError, match="artist cannot be empty"):
            TrackResult(playlist_index=1, title="Title", artist="", matched=False)

    def test_validation_rejects_whitespace_artist(self):
        """Test validation rejects whitespace-only artist."""
        with pytest.raises(ValueError, match="artist cannot be empty"):
            TrackResult(playlist_index=1, title="Title", artist="   ", matched=False)

    def test_validation_clamps_negative_match_score(self):
        """Test validation clamps negative match_score to 0."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            match_score=-10.0,
        )
        # Should be clamped to 0.0
        assert result.match_score == 0.0

    def test_validation_rejects_invalid_title_sim_too_low(self):
        """Test validation rejects title_sim below 0."""
        with pytest.raises(ValueError, match="Title similarity must be between"):
            TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                title_sim=-1.0,
            )

    def test_validation_rejects_invalid_title_sim_too_high(self):
        """Test validation rejects title_sim above 100."""
        with pytest.raises(ValueError, match="Title similarity must be between"):
            TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                title_sim=101.0,
            )

    def test_validation_rejects_invalid_artist_sim_too_low(self):
        """Test validation rejects artist_sim below 0."""
        with pytest.raises(ValueError, match="Artist similarity must be between"):
            TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                artist_sim=-1.0,
            )

    def test_validation_rejects_invalid_artist_sim_too_high(self):
        """Test validation rejects artist_sim above 100."""
        with pytest.raises(ValueError, match="Artist similarity must be between"):
            TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                artist_sim=101.0,
            )

    def test_validation_rejects_invalid_confidence(self):
        """Test validation rejects invalid confidence value."""
        with pytest.raises(ValueError, match="Confidence must be"):
            TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                confidence="invalid",
            )

    def test_validation_accepts_valid_confidence_values(self):
        """Test validation accepts valid confidence values."""
        for conf in ["high", "medium", "low"]:
            result = TrackResult(
                playlist_index=1,
                title="Title",
                artist="Artist",
                matched=False,
                confidence=conf,
            )
            assert result.confidence == conf

    def test_validation_accepts_boundary_values(self):
        """Test validation accepts boundary values."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            match_score=0.0,  # Minimum
            title_sim=0.0,  # Minimum
            artist_sim=0.0,  # Minimum
            confidence="low",
        )
        assert result.match_score == 0.0
        assert result.title_sim == 0.0
        assert result.artist_sim == 0.0

        result2 = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            title_sim=100.0,  # Maximum
            artist_sim=100.0,  # Maximum
            confidence="high",
        )
        assert result2.title_sim == 100.0
        assert result2.artist_sim == 100.0


class TestTrackResultHelperMethods:
    """Test TrackResult helper methods."""

    def test_is_successful_with_match(self):
        """Test is_successful returns True when matched."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            match_score=85.5,
        )
        assert result.is_successful() is True

    def test_is_successful_without_match(self):
        """Test is_successful returns False when not matched."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            match_score=0.0,
        )
        assert result.is_successful() is False

    def test_has_high_confidence_high(self):
        """Test has_high_confidence returns True for high confidence."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            confidence="high",
            match_score=95.0,
        )
        assert result.has_high_confidence() is True

    def test_has_high_confidence_medium(self):
        """Test has_high_confidence based on match_score threshold (default 0.7)."""
        # has_high_confidence uses match_score threshold, not confidence field
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            confidence="medium",
            match_score=85.0,  # Above 70 threshold
        )
        assert result.has_high_confidence() is True  # 85 >= 70

    def test_has_high_confidence_low(self):
        """Test has_high_confidence returns False for low match_score."""
        # has_high_confidence uses threshold=0.7 by default
        # Since match_score is typically 0-200, threshold 0.7 means any score >= 0.7
        # So we need a score < 0.7 to test False
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            confidence="low",
            match_score=0.5,  # Below 0.7 threshold
        )
        assert result.has_high_confidence() is False  # 0.5 < 0.7
        
        # Test with None match_score
        result2 = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            match_score=None,
        )
        assert result2.has_high_confidence() is False  # None match_score


class TestTrackResultSerialization:
    """Test TrackResult model serialization."""

    def test_to_dict(self):
        """Test converting result to dictionary."""
        result = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
            match_score=85.5,
            title_sim=90.0,
            artist_sim=80.0,
            confidence="high",
        )
        data = result.to_dict()
        assert data["playlist_index"] == "1"  # Converted to string
        assert data["original_title"] == "Test Track"
        assert data["original_artists"] == "Test Artist"
        assert data["match_score"] == "85.5"  # Formatted as string
        assert data["title_sim"] == "90.0"  # Converted to string
        assert data["artist_sim"] == "80.0"  # Converted to string
        assert data["confidence"] == "high"

    def test_from_dict(self):
        """Test creating result from dictionary."""
        data = {
            "playlist_index": 1,
            "original_title": "Test Track",
            "original_artists": "Test Artist",
            "matched": True,
            "match_score": 85.5,
            "title_sim": 90.0,
            "artist_sim": 80.0,
            "confidence": "high",
        }
        result = TrackResult.from_dict(data)
        assert result.playlist_index == 1
        assert result.title == "Test Track"
        assert result.artist == "Test Artist"
        assert result.matched is True
        assert result.match_score == 85.5

    def test_serialization_round_trip(self):
        """Test serialization round trip."""
        original = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
            match_score=85.5,
            title_sim=90.0,
            artist_sim=80.0,
            confidence="high",
            beatport_url="https://beatport.com/track/test/123",
            beatport_title="Beatport Track",
        )
        data = original.to_dict()
        # Add matched field to data since to_dict doesn't include it
        data["matched"] = original.matched
        restored = TrackResult.from_dict(data)
        assert restored.playlist_index == original.playlist_index
        assert restored.title == original.title
        assert restored.artist == original.artist
        assert restored.matched == original.matched
        # match_score is formatted as "85.5" in to_dict, then parsed back
        # Allow small floating point differences
        if restored.match_score is not None and original.match_score is not None:
            assert abs(restored.match_score - original.match_score) < 0.1
        if restored.title_sim is not None and original.title_sim is not None:
            assert abs(restored.title_sim - original.title_sim) < 0.1
        if restored.artist_sim is not None and original.artist_sim is not None:
            assert abs(restored.artist_sim - original.artist_sim) < 0.1
        assert restored.confidence == original.confidence


class TestTrackResultEdgeCases:
    """Test TrackResult edge cases and error handling."""

    def test_result_with_none_optional_fields(self):
        """Test result with None optional fields."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            best_match=None,
            candidates=[],
            beatport_url=None,
            beatport_title=None,
        )
        assert result.best_match is None
        assert result.beatport_url is None

    def test_result_with_empty_candidates(self):
        """Test result with empty candidates list."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            candidates=[],
            candidates_data=[],
        )
        assert len(result.candidates) == 0
        assert len(result.candidates_data) == 0

    def test_result_with_zero_scores(self):
        """Test result with zero scores (unmatched track)."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
        )
        assert result.match_score == 0.0
        assert result.is_successful() is False

    def test_result_with_very_high_scores(self):
        """Test result with very high scores."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            match_score=200.0,  # Very high score
            title_sim=100.0,
            artist_sim=100.0,
            confidence="high",
        )
        assert result.match_score == 200.0
        assert result.is_successful() is True
        assert result.has_high_confidence() is True

    def test_result_with_float_precision(self):
        """Test result handles float precision correctly."""
        result = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            match_score=85.5555555,
            title_sim=90.123456,
            artist_sim=80.987654,
        )
        # Should accept floats with precision
        assert result.match_score == 85.5555555
        assert result.title_sim == 90.123456
        assert result.artist_sim == 80.987654

