#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for model compatibility helpers.

Tests conversion functions between old and new data models.
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


class TestTrackFromRBTrack:
    """Test RBTrack to Track conversion."""

    def test_basic_conversion(self):
        """Test basic RBTrack to Track conversion."""
        rbtrack = RBTrack(track_id="123", title="Test Track", artists="Test Artist")
        track = track_from_rbtrack(rbtrack)

        assert track.title == "Test Track"
        assert track.artist == "Test Artist"  # Note: artists -> artist
        assert track.track_id == "123"
        assert isinstance(track, Track)

    def test_field_name_mapping(self):
        """Test that artists field is correctly mapped to artist."""
        rbtrack = RBTrack(track_id="456", title="Title", artists="Artist Name")
        track = track_from_rbtrack(rbtrack)

        assert track.artist == "Artist Name"
        assert track.artist == rbtrack.artists

    def test_all_fields_preserved(self):
        """Test that all RBTrack fields are preserved."""
        rbtrack = RBTrack(track_id="789", title="My Track", artists="My Artist")
        track = track_from_rbtrack(rbtrack)

        assert track.track_id == rbtrack.track_id
        assert track.title == rbtrack.title
        assert track.artist == rbtrack.artists

    def test_empty_artist_uses_default(self):
        """Test that empty artist field uses 'Unknown Artist' default."""
        rbtrack = RBTrack(track_id="999", title="Track Without Artist", artists="")
        track = track_from_rbtrack(rbtrack)

        assert track.artist == "Unknown Artist"
        assert track.title == "Track Without Artist"

    def test_empty_artist_extracts_from_title(self):
        """Test that empty artist is extracted from title if possible."""
        rbtrack = RBTrack(track_id="888", title="Artist Name - Track Title", artists="")
        track = track_from_rbtrack(rbtrack)

        # Should extract artist from title (title remains unchanged)
        assert track.artist == "Artist Name"
        assert track.title == "Artist Name - Track Title"  # Title stays as-is


class TestBeatportCandidateFromOld:
    """Test old BeatportCandidate to new model conversion."""

    def test_basic_conversion(self):
        """Test basic BeatportCandidate conversion."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            key="A",
            release_year=2020,
            bpm="128",
            label="Test Label",
            genres="House",
            release_name="Test Release",
            release_date="2020-01-01",
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

        new = beatport_candidate_from_old(old)

        assert new.url == old.url
        assert new.title == old.title
        assert new.artists == old.artists
        assert new.score == old.score
        assert isinstance(new, BeatportCandidate)

    def test_all_fields_preserved(self):
        """Test that all fields are preserved in conversion."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
            key="A",
            release_year=2020,
            bpm="128",
            label="Label",
            genres="House",
            release_name="Release",
            release_date="2020-01-01",
            score=85.5,
            title_sim=90,
            artist_sim=80,
            query_index=1,
            query_text="query",
            candidate_index=2,
            base_score=75.0,
            bonus_year=5,
            bonus_key=5,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=False,
        )

        new = beatport_candidate_from_old(old)

        assert new.url == old.url
        assert new.title == old.title
        assert new.artists == old.artists
        assert new.key == old.key
        assert new.release_year == old.release_year
        assert new.bpm == old.bpm
        assert new.label == old.label
        assert new.genre == old.genres  # Note: old uses "genres", new uses "genre"
        assert new.release_name == old.release_name
        assert new.release_date == old.release_date
        assert new.score == old.score
        assert new.title_sim == old.title_sim
        assert new.artist_sim == old.artist_sim
        assert new.query_index == old.query_index
        assert new.query_text == old.query_text
        assert new.candidate_index == old.candidate_index
        assert new.base_score == old.base_score
        assert new.bonus_year == old.bonus_year
        assert new.bonus_key == old.bonus_key
        assert new.guard_ok == old.guard_ok
        assert new.reject_reason == old.reject_reason
        assert new.elapsed_ms == old.elapsed_ms
        assert new.is_winner == old.is_winner

    def test_validation_passes(self):
        """Test that converted candidate passes validation."""
        old = OldBeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test",
            artists="Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
            score=0.0,  # Valid score
            title_sim=0,  # Valid similarity
            artist_sim=0,  # Valid similarity
            query_index=0,
            query_text="",
            candidate_index=0,
            base_score=0.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=False,
            reject_reason="",
            elapsed_ms=0,
            is_winner=False,
        )

        # Should not raise validation error
        new = beatport_candidate_from_old(old)
        assert isinstance(new, BeatportCandidate)

    def test_validation_fails_on_invalid_data(self):
        """Test that invalid data raises validation error."""
        old = OldBeatportCandidate(
            url="",  # Empty URL - should fail validation
            title="Test",
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
            query_text="",
            candidate_index=0,
            base_score=0.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=False,
            reject_reason="",
            elapsed_ms=0,
            is_winner=False,
        )

        with pytest.raises(ValueError, match="URL cannot be empty"):
            beatport_candidate_from_old(old)


class TestTrackResultFromOld:
    """Test old TrackResult to new model conversion."""

    def test_basic_conversion(self):
        """Test basic TrackResult conversion."""
        old = OldTrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
        )

        new = track_result_from_old(old)

        assert new.playlist_index == old.playlist_index
        assert new.title == old.title
        assert new.artist == old.artist
        assert new.matched == old.matched
        assert isinstance(new, TrackResult)

    def test_all_fields_preserved(self):
        """Test that all fields are preserved in conversion."""
        old = OldTrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
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

        assert new.playlist_index == old.playlist_index
        assert new.title == old.title
        assert new.artist == old.artist
        assert new.matched == old.matched
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
        assert new.match_score == old.match_score
        assert new.title_sim == old.title_sim
        assert new.artist_sim == old.artist_sim
        assert new.confidence == old.confidence
        assert new.search_query_index == old.search_query_index
        assert new.search_stop_query_index == old.search_stop_query_index
        assert new.candidate_index == old.candidate_index
        assert new.candidates_data == old.candidates
        assert new.queries_data == old.queries

    def test_candidates_conversion(self):
        """Test that candidates are converted from dict to BeatportCandidate."""
        old = OldTrackResult(
            playlist_index=1,
            title="Test",
            artist="Artist",
            matched=True,
            candidates=[
                {
                    "url": "https://beatport.com/track/test/123",
                    "title": "Candidate Title",
                    "artists": "Candidate Artist",
                    "label": "Label",
                    "release_date": "2020-01-01",
                    "bpm": "128",
                    "key": "A",
                    "genres": "House",  # Old format uses "genres"
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
                }
            ],
            queries=[],
        )

        new = track_result_from_old(old)

        assert len(new.candidates) == 1
        assert isinstance(new.candidates[0], BeatportCandidate)
        assert new.candidates[0].url == "https://beatport.com/track/test/123"
        assert new.candidates[0].title == "Candidate Title"
        assert new.candidates_data == old.candidates  # Original dict preserved

    def test_invalid_candidates_skipped(self):
        """Test that invalid candidate dicts are skipped."""
        old = OldTrackResult(
            playlist_index=1,
            title="Test",
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
                {"invalid": "data"},  # Invalid - missing required fields
                {"url": "", "title": "Invalid"},  # Invalid - empty URL
            ],
            queries=[],
        )

        new = track_result_from_old(old)

        # Should only have 1 valid candidate
        assert len(new.candidates) == 1
        assert new.candidates[0].url == "https://beatport.com/track/test/123"
        # Original dicts still preserved
        assert len(new.candidates_data) == 3

    def test_to_dict_compatibility(self):
        """Test that new model's to_dict() matches old format."""
        old = OldTrackResult(
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

        new = track_result_from_old(old)
        new_dict = new.to_dict()
        old_dict = old.to_dict()

        # Compare key fields
        assert new_dict["playlist_index"] == old_dict["playlist_index"]
        assert new_dict["original_title"] == old_dict["original_title"]
        assert new_dict["original_artists"] == old_dict["original_artists"]
        assert new_dict["beatport_url"] == old_dict["beatport_url"]
        assert new_dict["match_score"] == old_dict["match_score"]
        assert new_dict["title_sim"] == old_dict["title_sim"]
        assert new_dict["artist_sim"] == old_dict["artist_sim"]
        assert new_dict["confidence"] == old_dict["confidence"]


class TestTrackResultToOld:
    """Test new TrackResult to old model conversion (backward compatibility)."""

    def test_basic_conversion(self):
        """Test basic TrackResult to old model conversion."""
        new = TrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
        )

        old = track_result_to_old(new)

        assert old.playlist_index == new.playlist_index
        assert old.title == new.title
        assert old.artist == new.artist
        assert old.matched == new.matched
        assert isinstance(old, OldTrackResult)

    def test_candidates_conversion(self):
        """Test that BeatportCandidate candidates are converted to dict."""
        from cuepoint.models.beatport_candidate import BeatportCandidate

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
            title="Test",
            artist="Artist",
            matched=True,
            candidates=[candidate],
        )

        old = track_result_to_old(new)

        assert len(old.candidates) == 1
        assert isinstance(old.candidates[0], dict)
        assert old.candidates[0]["url"] == "https://beatport.com/track/test/123"

    def test_round_trip_conversion(self):
        """Test round-trip conversion (old -> new -> old)."""
        original = OldTrackResult(
            playlist_index=1,
            title="Test Track",
            artist="Test Artist",
            matched=True,
            beatport_url="https://beatport.com/track/test/123",
            match_score=85.5,
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

