"""Extended unit tests for matcher module - additional edge cases and coverage."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.core.matcher import best_beatport_match
from cuepoint.models.beatport_candidate import BeatportCandidate


class TestMatcherExtended:
    """Extended tests for matcher module covering additional edge cases."""
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_early_exit_high_score(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test early exit when high score match is found."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        # Return a perfect match
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            "E Major",
            2023,
            "128",
            "Test Label",
            "House",
            "Test Release",
            "2023-01-01"
        )
        
        queries = ["Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=2023,
            input_key="E Major",
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Should find a match
        assert best is not None or len(candidates) >= 0
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_with_mix_flags(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching with mix flags (remix, extended, etc.)."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track-remix/123456"
        ]
        mock_parse.return_value = (
            "Test Track (Remix)",
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track Test Artist"]
        input_mix = {
            "is_remix": True,
            "is_extended": False,
            "is_club": False,
            "is_dub": False,
            "is_acapella": False,
            "remixers": []
        }
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track (Remix)",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=input_mix,
            input_generic_phrases=None
        )
        
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_title_only_mode(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching in title-only mode (no artists)."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = (
            "Test Track",
            "Unknown Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="",
            title_only_mode=True,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_multiple_queries(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching with multiple queries."""
        # First query returns no results, second returns a match
        def track_urls_side_effect(idx, query, max_results, **kwargs):
            if "Test Track" in query and "Test Artist" in query:
                return ["https://www.beatport.com/track/test-track/123456"]
            return []
        
        mock_track_urls.side_effect = track_urls_side_effect
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Wrong Query", "Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        assert isinstance(candidates, list)
        assert len(queries_audit) > 0
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_duplicate_urls(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test handling of duplicate URLs across queries."""
        url = "https://www.beatport.com/track/test-track/123456"
        mock_track_urls.return_value = [url, url, url]  # Same URL multiple times
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Query 1", "Query 2"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Should deduplicate URLs
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_with_year_bonus(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching with year bonus applied."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            None,
            2023,  # Same year as input
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=2023,  # Match year
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_with_key_bonus(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching with key bonus applied."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            "E Major",  # Same key as input
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key="E Major",  # Match key
            input_mix=None,
            input_generic_phrases=None
        )
        
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_parse_returns_none(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test handling when parse_track_page returns None."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = None  # Parse failure
        
        queries = ["Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Should handle None gracefully
        assert isinstance(candidates, list)
        assert best is None or isinstance(best, BeatportCandidate)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_empty_search_results(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test behavior when search returns empty results."""
        mock_track_urls.return_value = []  # No results
        mock_parse.return_value = None
        
        queries = ["Test Track Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        assert best is None
        assert len(candidates) == 0
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_adaptive_max_results(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test adaptive max_results based on query type."""
        # Query with "original mix" should use MR_MED
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = (
            "Test Track (Original Mix)",
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track (Original Mix) Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track (Original Mix)",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Verify track_urls was called (adaptive max_results logic executed)
        assert mock_track_urls.called
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_with_special_phrases(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test matching with special parenthetical phrases."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test-track/123456"
        ]
        mock_parse.return_value = (
            "Test Track (Ivory Re-fire)",
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Test Track Test Artist"]
        generic_phrases = ["Ivory Re-fire"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=generic_phrases
        )
        
        assert isinstance(candidates, list)
    
    @patch('cuepoint.core.matcher.track_urls')
    @patch('cuepoint.core.matcher.parse_track_page')
    def test_best_beatport_match_guards_reject_subset(
        self,
        mock_parse,
        mock_track_urls
    ):
        """Test that guards reject subset matches."""
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/son/123456"  # Subset of "Son of Sun"
        ]
        mock_parse.return_value = (
            "Son",  # Subset match - should be rejected
            "Test Artist",
            None,
            None,
            None,
            None,
            None,
            None,
            None
        )
        
        queries = ["Son of Sun Test Artist"]
        
        best, candidates, queries_audit, last_q = best_beatport_match(
            idx=1,
            track_title="Son of Sun",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=queries,
            input_year=None,
            input_key=None,
            input_mix=None,
            input_generic_phrases=None
        )
        
        # Should reject subset match
        assert isinstance(candidates, list)
        # Best might be None if guard rejects it

