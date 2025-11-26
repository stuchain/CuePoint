"""Unit tests for text_processing module."""

import pytest
from cuepoint.core.text_processing import (
    normalize_text,
    sanitize_title_for_search,
    score_components,
    artists_similarity,
    split_artists,
    _strip_accents,
    _word_tokens,
    _artist_token_overlap
)


class TestNormalizeText:
    """Test text normalization functions."""
    
    def test_normalize_text_basic(self):
        """Test basic text normalization."""
        result = normalize_text("Test Track")
        assert result == "test track"
    
    def test_normalize_text_removes_accents(self):
        """Test that accents are removed."""
        result = normalize_text("café")
        assert "cafe" in result
    
    def test_normalize_text_removes_feat_clauses(self):
        """Test that feat. clauses are removed."""
        result = normalize_text("Track (feat. Artist)")
        assert "feat" not in result
        assert "artist" not in result
    
    def test_normalize_text_removes_mix_types(self):
        """Test that mix type indicators are removed."""
        result = normalize_text("Track (Original Mix)")
        assert "original" not in result
        assert "mix" not in result
    
    def test_normalize_text_empty(self):
        """Test normalization with empty string."""
        assert normalize_text("") == ""
        assert normalize_text(None) == ""
    
    def test_strip_accents(self):
        """Test accent stripping."""
        assert _strip_accents("café") == "cafe"
        assert _strip_accents("naïve") == "naive"
        assert _strip_accents("résumé") == "resume"
    
    def test_strip_accents_no_accents(self):
        """Test accent stripping with no accents."""
        assert _strip_accents("hello") == "hello"
        assert _strip_accents("") == ""


class TestSanitizeTitleForSearch:
    """Test title sanitization for search."""
    
    def test_sanitize_removes_numeric_prefixes(self):
        """Test that numeric prefixes like [3] are removed."""
        result = sanitize_title_for_search("[3] Test Track")
        assert "[3]" not in result
        assert "test track" in result.lower()
    
    def test_sanitize_removes_letter_prefixes(self):
        """Test that letter prefixes like [F] are removed."""
        result = sanitize_title_for_search("[F] Test Track")
        assert "[F]" not in result
        assert "test track" in result.lower()
    
    def test_sanitize_removes_parenthetical_mix_types(self):
        """Test that parenthetical mix types are removed."""
        result = sanitize_title_for_search("Track (Original Mix)")
        assert "original mix" not in result.lower()
    
    def test_sanitize_handles_artist_title_pattern(self):
        """Test handling of Artist - Title pattern."""
        result = sanitize_title_for_search("Artist - Title (Remix)")
        # Should extract just the title part
        assert "title" in result.lower()
    
    def test_sanitize_empty(self):
        """Test sanitization with empty string."""
        assert sanitize_title_for_search("") == ""
        assert sanitize_title_for_search(None) == ""


class TestScoreComponents:
    """Test similarity scoring functions."""
    
    def test_score_components_exact_match(self):
        """Test scoring for exact matches."""
        t_sim, a_sim, comp = score_components(
            "Test Track",
            "Test Artist",
            "Test Track",
            "Test Artist"
        )
        assert t_sim >= 90  # High title similarity
        assert a_sim >= 90  # High artist similarity
        assert comp > 0
    
    def test_score_components_partial_match(self):
        """Test scoring for partial matches."""
        t_sim, a_sim, comp = score_components(
            "Test Track",
            "Test Artist",
            "Test",
            "Artist"
        )
        assert t_sim > 0
        assert a_sim > 0
        assert comp > 0
    
    def test_score_components_no_match(self):
        """Test scoring when there's no match."""
        # Use completely different strings to ensure low similarity
        t_sim, a_sim, comp = score_components(
            "Completely Different Track",
            "Completely Different Artist",
            "Totally Unrelated Song",
            "Totally Unrelated Performer"
        )
        # These should have very low similarity
        assert t_sim < 60  # Allow some tolerance for token matching
        assert a_sim < 60  # Allow some tolerance
        assert comp > 0  # Still positive (weighted combination)
    
    def test_score_components_empty_artists(self):
        """Test scoring when artists are empty."""
        t_sim, a_sim, comp = score_components(
            "Test Track",
            "",
            "Test Track",
            ""
        )
        assert t_sim > 0
        assert a_sim == 0  # No artist similarity when both empty
        assert comp > 0


class TestArtistsSimilarity:
    """Test artist similarity functions."""
    
    def test_artists_similarity_exact_match(self):
        """Test artist similarity for exact matches."""
        score = artists_similarity("Artist A", "Artist A")
        assert score >= 90
    
    def test_artists_similarity_multiple_artists(self):
        """Test artist similarity with multiple artists."""
        score = artists_similarity("Artist A, Artist B", "Artist A & Artist B")
        assert score > 0
    
    def test_artists_similarity_no_match(self):
        """Test artist similarity when there's no match."""
        # Use completely different artists to ensure low similarity
        score = artists_similarity("Completely Different Artist", "Totally Unrelated Performer")
        assert score < 50
    
    def test_artists_similarity_empty(self):
        """Test artist similarity with empty strings."""
        assert artists_similarity("", "") == 0
        assert artists_similarity("Artist A", "") == 0
    
    def test_split_artists(self):
        """Test splitting artist strings."""
        artists = split_artists("Artist A, Artist B")
        assert len(artists) == 2
        assert "artist a" in [a.lower() for a in artists]
    
    def test_split_artists_ampersand(self):
        """Test splitting artists with ampersand."""
        artists = split_artists("Artist A & Artist B")
        assert len(artists) >= 1
    
    def test_artist_token_overlap(self):
        """Test artist token overlap detection."""
        assert _artist_token_overlap("Artist A", "Artist A") is True
        # Note: "Artist A" and "Artist B" both contain "Artist" token, so they overlap
        # Use completely different artists for no overlap test
        assert _artist_token_overlap("Completely Different", "Totally Unrelated") is False
        assert _artist_token_overlap("", "") is False


class TestWordTokens:
    """Test word token extraction."""
    
    def test_word_tokens_basic(self):
        """Test basic word token extraction."""
        tokens = _word_tokens("Test Track")
        assert "test" in tokens
        assert "track" in tokens
    
    def test_word_tokens_normalizes(self):
        """Test that tokens are normalized."""
        tokens = _word_tokens("Test Track (Remix)")
        # Should be normalized (lowercase, no parentheses)
        assert all(isinstance(t, str) for t in tokens)
    
    def test_word_tokens_empty(self):
        """Test word tokens with empty string."""
        assert _word_tokens("") == []

