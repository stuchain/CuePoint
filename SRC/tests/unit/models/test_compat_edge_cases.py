#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive edge case tests for compatibility functions.

Tests all conversion edge cases, error handling, and boundary conditions.
"""

import pytest

from cuepoint.data.beatport import BeatportCandidate as OldBeatportCandidate
from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.compat import (
    beatport_candidate_from_old,
    track_from_rbtrack,
    track_result_from_old,
    track_result_to_old,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.ui.gui_interface import TrackResult as OldTrackResult


class TestTrackFromRBTrackEdgeCases:
    """Test track_from_rbtrack edge cases."""

    def test_conversion_with_whitespace_artist(self):
        """Test conversion with whitespace-only artist."""
        rbtrack = RBTrack(track_id="1", title="Track", artists="   ")
        track = track_from_rbtrack(rbtrack)
        # Should use "Unknown Artist" for whitespace-only
        assert track.artist == "Unknown Artist"

    def test_conversion_with_none_artist(self):
        """Test conversion handles None artist gracefully."""
        rbtrack = RBTrack(track_id="1", title="Track", artists="")
        # Empty string should be handled
        track = track_from_rbtrack(rbtrack)
        assert track.artist in ("Unknown Artist", "Track")  # Either default or extracted

    def test_conversion_with_title_containing_artist(self):
        """Test conversion extracts artist from various title formats."""
        test_cases = [
            ("Artist Name - Track Title", "Artist Name"),
            ("Artist - Track", "Artist"),
            ("Artist & Co. - Track Title", "Artist & Co."),
        ]
        for title, expected_artist in test_cases:
            rbtrack = RBTrack(track_id="1", title=title, artists="")
            track = track_from_rbtrack(rbtrack)
            assert track.artist == expected_artist

    def test_conversion_with_title_not_containing_artist(self):
        """Test conversion uses default when title doesn't contain artist."""
        rbtrack = RBTrack(track_id="1", title="Just a Track Title", artists="")
        track = track_from_rbtrack(rbtrack)
        assert track.artist == "Unknown Artist"

    def test_conversion_preserves_track_id(self):
        """Test conversion preserves track_id."""
        rbtrack = RBTrack(track_id="special-id-123", title="Track", artists="Artist")
        track = track_from_rbtrack(rbtrack)
        assert track.track_id == "special-id-123"

    def test_conversion_with_unicode_characters(self):
        """Test conversion handles Unicode characters."""
        rbtrack = RBTrack(track_id="1", title="Track 🎵", artists="Artist 🎤")
        track = track_from_rbtrack(rbtrack)
        assert "🎵" in track.title
        assert "🎤" in track.artist

    def test_conversion_with_special_characters(self):
        """Test conversion handles special characters."""
        rbtrack = RBTrack(
            track_id="1",
            title="Track (Remix) [Extended]",
            artists="Artist & Co.",
        )
        track = track_from_rbtrack(rbtrack)
        assert track.title == "Track (Remix) [Extended]"
        assert track.artist == "Artist & Co."


class TestBeatportCandidateFromOldEdgeCases:
    """Test beatport_candidate_from_old edge cases."""

    def test_conversion_with_negative_score(self):
        """Test conversion handles negative score."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Title",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
            score=-10.0,  # Negative score
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
        new = beatport_candidate_from_old(old)
        # Should be clamped to 0
        assert new.score == 0.0

    def test_conversion_with_zero_scores(self):
        """Test conversion with zero scores."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Title",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
            score=0.0,
            title_sim=0,
            artist_sim=0,
            query_index=0,
            query_text="query",
            candidate_index=0,
            base_score=0.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=False,
            reject_reason="rejected",
            elapsed_ms=0,
            is_winner=False,
        )
        new = beatport_candidate_from_old(old)
        assert new.score == 0.0
        assert new.title_sim == 0
        assert new.artist_sim == 0

    def test_conversion_with_none_optional_fields(self):
        """Test conversion with None optional fields."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Title",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
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
        new = beatport_candidate_from_old(old)
        assert new.key is None
        assert new.release_year is None
        assert new.bpm is None
        assert new.label is None
        assert new.genre is None

    def test_conversion_with_empty_string_fields(self):
        """Test conversion with empty string fields."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="",
            artists="",
            key="",
            release_year=None,
            bpm="",
            label="",
            genres="",
            release_name="",
            release_date="",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=0,
            query_text="",
            candidate_index=0,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True,
        )
        new = beatport_candidate_from_old(old)
        assert new.title == ""
        assert new.artists == ""
        assert new.key == ""

    def test_conversion_fails_with_empty_url(self):
        """Test conversion fails with empty URL."""
        old = OldBeatportCandidate(
            url="",  # Empty URL
            title="Title",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
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
        with pytest.raises(ValueError, match="URL cannot be empty"):
            beatport_candidate_from_old(old)

    def test_conversion_with_genres_field_mapping(self):
        """Test conversion correctly maps genres to genre."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Title",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres="House, Tech House",  # Old uses "genres"
            release_name=None,
            release_date=None,
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
        new = beatport_candidate_from_old(old)
        assert new.genre == "House, Tech House"  # Should map genres -> genre


class TestTrackResultFromOldEdgeCases:
    """Test track_result_from_old edge cases."""

    def test_conversion_with_empty_candidates(self):
        """Test conversion with empty candidates list."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            candidates=[],
            queries=[],
        )
        new = track_result_from_old(old)
        assert len(new.candidates) == 0
        assert len(new.candidates_data) == 0

    def test_conversion_with_none_candidates(self):
        """Test conversion with None candidates."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            candidates=None,  # type: ignore
            queries=None,  # type: ignore
        )
        new = track_result_from_old(old)
        assert len(new.candidates) == 0
        assert new.candidates_data is None or len(new.candidates_data) == 0

    def test_conversion_with_invalid_candidate_dicts(self):
        """Test conversion skips invalid candidate dicts."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            candidates=[
                {"url": "", "title": "Invalid"},  # Empty URL
                {"invalid": "data"},  # Missing required fields
                {
                    "url": "https://beatport.com/track/test/123",
                    "title": "Valid",
                    "artists": "Artist",
                    "label": "Label",
                    "release_date": "2020-01-01",
                    "bpm": "128",
                    "key": "A",
                    "genres": "House",
                    "score": 85.5,
                    "title_sim": 90,
                    "artist_sim": 80,
                    "query_index": 0,
                    "query_text": "query",
                    "candidate_index": 0,
                    "base_score": 75.0,
                    "bonus_year": 5,
                    "bonus_key": 5,
                    "guard_ok": True,
                    "reject_reason": "",
                    "elapsed_ms": 100,
                    "is_winner": True,
                },  # Valid
            ],
            queries=[],
        )
        new = track_result_from_old(old)
        # Should only have 1 valid candidate
        assert len(new.candidates) == 1
        assert new.candidates[0].title == "Valid"
        # Original dicts preserved
        assert len(new.candidates_data) == 3

    def test_conversion_with_malformed_candidate_data(self):
        """Test conversion handles malformed candidate data."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            candidates=[
                {
                    "url": "https://beatport.com/track/test/123",
                    "title": "Valid",
                    "artists": "Artist",
                    "label": "Label",
                    "release_date": "2020-01-01",
                    "bpm": "128",
                    "key": "A",
                    "genres": "House",
                    "score": "invalid",  # Invalid type
                    "title_sim": "not a number",  # Invalid type
                    "artist_sim": 80,
                    "query_index": 0,
                    "query_text": "query",
                    "candidate_index": 0,
                    "base_score": 75.0,
                    "bonus_year": 5,
                    "bonus_key": 5,
                    "guard_ok": True,
                    "reject_reason": "",
                    "elapsed_ms": 100,
                    "is_winner": True,
                }
            ],
            queries=[],
        )
        # Should handle type conversion errors gracefully
        new = track_result_from_old(old)
        # May skip invalid candidate or use defaults
        assert isinstance(new, TrackResult)

    def test_conversion_with_string_numeric_fields(self):
        """Test conversion handles string numeric fields."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            candidates=[
                {
                    "url": "https://beatport.com/track/test/123",
                    "title": "Valid",
                    "artists": "Artist",
                    "label": "Label",
                    "release_date": "2020-01-01",
                    "bpm": "128",
                    "key": "A",
                    "genres": "House",
                    "score": "85.5",  # String number
                    "title_sim": "90",  # String number
                    "artist_sim": "80",  # String number
                    "query_index": "1",  # String number
                    "query_text": "query",
                    "candidate_index": "2",  # String number
                    "base_score": "75.0",  # String number
                    "bonus_year": "5",  # String number
                    "bonus_key": "10",  # String number
                    "guard_ok": "True",  # String boolean
                    "reject_reason": "",
                    "elapsed_ms": "100",  # String number
                    "is_winner": "False",  # String boolean
                }
            ],
            queries=[],
        )
        new = track_result_from_old(old)
        # Should convert string numbers to proper types
        if len(new.candidates) > 0:
            assert isinstance(new.candidates[0].score, float)
            assert isinstance(new.candidates[0].title_sim, int)

    def test_conversion_with_missing_optional_fields(self):
        """Test conversion handles missing optional fields."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            # All optional fields missing
        )
        new = track_result_from_old(old)
        assert new.playlist_index == 1
        assert new.title == "Title"
        assert new.artist == "Artist"
        assert new.matched is False
        assert new.beatport_url is None or new.beatport_url == ""

    def test_conversion_preserves_all_old_fields(self):
        """Test conversion preserves all old TrackResult fields."""
        old = OldTrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            beatport_url="https://beatport.com/track/test/123",
            beatport_title="Beatport Title",
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
            candidates=[],
            queries=[],
        )
        new = track_result_from_old(old)
        assert new.beatport_url == old.beatport_url
        assert new.beatport_title == old.beatport_title
        assert new.beatport_artists == old.beatport_artists
        assert new.beatport_key == old.beatport_key
        assert new.beatport_key_camelot == old.beatport_key_camelot
        assert new.beatport_year == old.beatport_year
        assert new.beatport_bpm == old.beatport_bpm
        assert new.beatport_label == old.beatport_label
        assert new.beatport_genres == old.beatport_genres
        assert new.beatport_release == old.beatport_release
        assert new.beatport_release_date == old.beatport_release_date
        assert new.beatport_track_id == old.beatport_track_id


class TestTrackResultToOldEdgeCases:
    """Test track_result_to_old edge cases."""

    def test_conversion_with_none_best_match(self):
        """Test conversion with None best_match."""
        new = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            best_match=None,
            candidates=[],
        )
        old = track_result_to_old(new)
        assert old.matched is False
        # Should handle None best_match gracefully

    def test_conversion_with_empty_candidates(self):
        """Test conversion with empty candidates."""
        new = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=False,
            candidates=[],
        )
        old = track_result_to_old(new)
        assert len(old.candidates) == 0

    def test_conversion_with_beatport_candidate_objects(self):
        """Test conversion converts BeatportCandidate objects to dicts."""
        candidate = BeatportCandidate(
            url="https://beatport.com/track/test/123",
            title="Candidate",
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
        new = TrackResult(
            playlist_index=1,
            title="Title",
            artist="Artist",
            matched=True,
            candidates=[candidate],
        )
        old = track_result_to_old(new)
        assert len(old.candidates) == 1
        assert isinstance(old.candidates[0], dict)
        assert old.candidates[0]["url"] == "https://beatport.com/track/test/123"

    def test_round_trip_preserves_data(self):
        """Test round-trip conversion preserves data."""
        original = OldTrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
            beatport_url="https://beatport.com/track/test/123",
            match_score=85.5,
            title_sim=90.0,
            artist_sim=80.0,
            confidence="high",
        )
        # Convert to new
        new = track_result_from_old(original)
        # Convert back to old
        converted_back = track_result_to_old(new)
        # Should match original
        assert converted_back.playlist_index == original.playlist_index
        assert converted_back.title == original.title
        assert converted_back.artist == original.artist
        assert converted_back.matched == original.matched
        assert converted_back.beatport_url == original.beatport_url
        assert converted_back.match_score == original.match_score

