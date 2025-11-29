"""Unit tests for matcher service."""

import pytest
from unittest.mock import patch, Mock
from cuepoint.services.matcher_service import MatcherService
from cuepoint.data.beatport import BeatportCandidate


class TestMatcherService:
    """Test matcher service."""
    
    @patch('cuepoint.services.matcher_service.best_beatport_match')
    def test_find_best_match(
        self,
        mock_best_match
    ):
        """Test finding best match."""
        # Setup
        mock_best_match.return_value = (
            BeatportCandidate(
                url="https://www.beatport.com/track/test/123",
                title="Test Track",
                artists="Test Artist",
                key=None,
                release_year=None,
                bpm=None,
                label=None,
                genres=None,
                release_name=None,
                release_date=None,
                score=95.0,
                title_sim=95,
                artist_sim=100,
                query_index=1,
                query_text="Test Track Test Artist",
                candidate_index=1,
                base_score=90.0,
                bonus_year=0,
                bonus_key=0,
                guard_ok=True,
                reject_reason="",
                elapsed_ms=100,
                is_winner=False
            ),
            [],
            [],
            1
        )
        
        service = MatcherService()
        
        # Test
        best, candidates, queries_audit, last_q = service.find_best_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=["Test Track Test Artist"],
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Verify
        assert best is not None
        assert best.title == "Test Track"
        mock_best_match.assert_called_once()
    
    @patch('cuepoint.services.matcher_service.best_beatport_match')
    def test_find_best_match_no_match(
        self,
        mock_best_match
    ):
        """Test finding best match when no match exists."""
        # Setup
        mock_best_match.return_value = (None, [], [], 1)
        
        service = MatcherService()
        
        # Test
        best, candidates, queries_audit, last_q = service.find_best_match(
            idx=1,
            track_title="Unknown Track",
            track_artists_for_scoring="Unknown Artist",
            title_only_mode=False,
            queries=["Unknown Track Unknown Artist"],
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Verify
        assert best is None
        assert len(candidates) == 0





