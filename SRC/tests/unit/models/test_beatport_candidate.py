#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for BeatportCandidate model.
"""

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate


class TestBeatportCandidateCreation:
    """Test BeatportCandidate model creation."""

    def test_create_valid_candidate(self):
        """Test creating a valid candidate."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            label="Test Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="test query",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
        )
        assert candidate.url == "https://www.beatport.com/track/test/123"
        assert candidate.title == "Test Track"
        assert candidate.artists == "Test Artist"
        assert candidate.score == 85.5

    def test_create_candidate_with_optional_fields(self):
        """Test creating candidate with optional fields."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            label="Test Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="test query",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
            remixers="Remixer",
            subgenre="Tech House",
            artwork_url="https://example.com/artwork.jpg",
            preview_url="https://example.com/preview.mp3",
            release_year=2020,
            release_name="Test Release",
        )
        assert candidate.remixers == "Remixer"
        assert candidate.subgenre == "Tech House"
        assert candidate.artwork_url == "https://example.com/artwork.jpg"
        assert candidate.preview_url == "https://example.com/preview.mp3"
        assert candidate.release_year == 2020
        assert candidate.release_name == "Test Release"


class TestBeatportCandidateValidation:
    """Test BeatportCandidate model validation."""

    def test_validation_rejects_empty_url(self):
        """Test validation rejects empty URL."""
        with pytest.raises(ValueError, match="URL cannot be empty"):
            BeatportCandidate(
                url="",
                title="Test",
                artists="Artist",
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

    def test_validation_clamps_negative_score(self):
        """Test validation clamps negative score to 0 instead of rejecting."""
        # Negative scores can occur during score calculation in edge cases
        # We clamp them to 0 instead of raising an error
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
            label="Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=-1.0,
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
        # Score should be clamped to 0
        assert candidate.score == 0.0

    def test_validation_rejects_invalid_title_sim(self):
        """Test validation rejects invalid title similarity."""
        with pytest.raises(ValueError, match="Title similarity must be between"):
            BeatportCandidate(
                url="https://www.beatport.com/track/test/123",
                title="Test",
                artists="Artist",
                label="Label",
                release_date="2020-01-01",
                bpm="128",
                key="A",
                genre="House",
                score=85.5,
                title_sim=101,
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

    def test_validation_rejects_invalid_artist_sim(self):
        """Test validation rejects invalid artist similarity."""
        with pytest.raises(ValueError, match="Artist similarity must be between"):
            BeatportCandidate(
                url="https://www.beatport.com/track/test/123",
                title="Test",
                artists="Artist",
                label="Label",
                release_date="2020-01-01",
                bpm="128",
                key="A",
                genre="House",
                score=85.5,
                title_sim=90,
                artist_sim=-1,
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


class TestBeatportCandidateSerialization:
    """Test BeatportCandidate model serialization."""

    def test_to_dict(self):
        """Test converting candidate to dictionary."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            label="Test Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="test query",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
            remixers="Remixer",
            release_year=2020,
        )
        data = candidate.to_dict()
        assert data["url"] == "https://www.beatport.com/track/test/123"
        assert data["title"] == "Test Track"
        assert data["artists"] == "Test Artist"
        assert data["score"] == 85.5
        assert data["remixers"] == "Remixer"
        assert data["release_year"] == 2020

    def test_from_dict(self):
        """Test creating candidate from dictionary."""
        data = {
            "url": "https://www.beatport.com/track/test/123",
            "title": "Test Track",
            "artists": "Test Artist",
            "label": "Test Label",
            "release_date": "2020-01-01",
            "bpm": "128",
            "key": "A",
            "genre": "House",
            "score": 85.5,
            "title_sim": 90,
            "artist_sim": 80,
            "query_index": 0,
            "query_text": "test query",
            "candidate_index": 0,
            "base_score": 75.0,
            "bonus_year": 5,
            "bonus_key": 5,
            "guard_ok": True,
            "reject_reason": "",
            "elapsed_ms": 100,
            "is_winner": True,
        }
        candidate = BeatportCandidate.from_dict(data)
        assert candidate.url == "https://www.beatport.com/track/test/123"
        assert candidate.title == "Test Track"
        assert candidate.score == 85.5

    def test_serialization_round_trip(self):
        """Test serialization round trip."""
        original = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            label="Test Label",
            release_date="2020-01-01",
            bpm="128",
            key="A",
            genre="House",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="test query",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
            remixers="Remixer",
            release_year=2020,
        )
        data = original.to_dict()
        restored = BeatportCandidate.from_dict(data)
        assert restored.url == original.url
        assert restored.title == original.title
        assert restored.score == original.score
        assert restored.release_year == original.release_year


class TestBeatportCandidateYearExtraction:
    """Test year extraction from release date."""

    def test_get_year_from_release_year(self):
        """Test getting year from release_year field."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
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
            release_year=2020,
        )
        assert candidate.get_year() == 2020

    def test_get_year_from_release_date_iso_format(self):
        """Test extracting year from ISO format date."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
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
        assert candidate.get_year() == 2020

    def test_get_year_from_release_date_year_only(self):
        """Test extracting year from year-only string."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
            label="Label",
            release_date="2020",
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
        assert candidate.get_year() == 2020

    def test_get_year_returns_none_when_no_date(self):
        """Test get_year returns None when no date available."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
            label="Label",
            release_date=None,
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
        assert candidate.get_year() is None


class TestBeatportCandidateStringRepresentation:
    """Test BeatportCandidate string representations."""

    def test_str_representation(self):
        """Test string representation."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
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
        assert "Test Artist" in str(candidate)
        assert "Test Track" in str(candidate)
        assert "85.5" in str(candidate)

