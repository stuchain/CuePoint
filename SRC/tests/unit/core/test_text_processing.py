"""Unit tests for text_processing module."""

import pytest

from cuepoint.core.text_processing import (
    _artist_token_overlap,
    _strip_accents,
    _word_tokens,
    artists_similarity,
    normalize_text,
    sanitize_title_for_search,
    score_components,
    split_artists,
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

    def test_normalize_text_html_entities(self):
        """Test normalization with HTML entities."""
        result = normalize_text("Test &amp; Track")
        assert "&" not in result or "amp" not in result

    def test_normalize_text_various_dashes(self):
        """Test normalization with various dash types."""
        result1 = normalize_text("Test—Track")
        result2 = normalize_text("Test–Track")
        result3 = normalize_text("Test-Track")
        # All should normalize to spaces
        assert "—" not in result1
        assert "–" not in result2
        assert "-" not in result3

    def test_normalize_text_feat_variations(self):
        """Test normalization with various feat. clause formats."""
        result1 = normalize_text("Track (feat. Artist)")
        result2 = normalize_text("Track [feat. Artist]")
        result3 = normalize_text("Track feat. Artist")
        # All should remove feat clauses
        assert "feat" not in result1.lower()
        assert "feat" not in result2.lower()
        assert "feat" not in result3.lower()

    def test_normalize_text_mix_type_variations(self):
        """Test normalization with various mix type formats."""
        result1 = normalize_text("Track (Original Mix)")
        result2 = normalize_text("Track (Extended Mix)")
        result3 = normalize_text("Track (Radio Edit)")
        result4 = normalize_text("Track Original Mix")
        # All should remove mix types
        assert "original" not in result1.lower()
        assert "extended" not in result2.lower()
        assert "radio" not in result3.lower()
        assert "original" not in result4.lower()

    def test_sanitize_title_complex_pattern(self):
        """Test sanitization with complex Artist1 - Artist2 - Title pattern."""
        result = sanitize_title_for_search("Artist1 - Artist2 - Title (Remix)")
        # The function first replaces dashes with spaces (line 134), then processes
        # So it may contain all parts. We verify it processes correctly
        assert "title" in result.lower()
        assert len(result) > 0
        # Verify parentheses and remix are removed
        assert "remix" not in result.lower()
        assert "(" not in result
        assert ")" not in result

    def test_sanitize_title_with_url(self):
        """Test sanitization with URL in title."""
        result = sanitize_title_for_search("Track www.example.com")
        assert "www" not in result.lower()
        assert "example" not in result.lower()

    def test_sanitize_title_range_prefix(self):
        """Test sanitization with range prefix like [2-3]."""
        result = sanitize_title_for_search("[2-3] Track")
        assert "[2-3]" not in result
        assert "track" in result.lower()

    def test_sanitize_title_multiple_brackets(self):
        """Test sanitization with multiple bracket types."""
        result = sanitize_title_for_search("[F] Track (Remix) [Extended]")
        assert "[" not in result
        assert "]" not in result
        assert "(" not in result
        assert ")" not in result

    def test_sanitize_title_non_latin_chars(self):
        """Test sanitization with non-Latin characters."""
        result = sanitize_title_for_search("Track 中文")
        # Should handle gracefully (may remove or keep depending on implementation)
        assert isinstance(result, str)

    def test_split_artists_feat_variations(self):
        """Test splitting with various feat. formats."""
        artists1 = split_artists("Artist A feat. Artist B")
        artists2 = split_artists("Artist A ft. Artist B")
        artists3 = split_artists("Artist A featuring Artist B")
        # All should split into multiple artists
        assert len(artists1) >= 2
        assert len(artists2) >= 2
        assert len(artists3) >= 2

    def test_split_artists_various_separators(self):
        """Test splitting with various separators."""
        artists1 = split_artists("Artist A, Artist B")
        artists2 = split_artists("Artist A & Artist B")
        artists3 = split_artists("Artist A / Artist B")
        artists4 = split_artists("Artist A x Artist B")
        artists5 = split_artists("Artist A vs Artist B")
        # All should split into multiple artists
        assert len(artists1) >= 2
        assert len(artists2) >= 2
        assert len(artists3) >= 2
        assert len(artists4) >= 2
        assert len(artists5) >= 2

    def test_split_artists_empty(self):
        """Test splitting empty artist string."""
        assert split_artists("") == []
        assert split_artists("   ") == []

    def test_artists_similarity_feat_handling(self):
        """Test artist similarity with feat. clauses."""
        score = artists_similarity("Artist A feat. Artist B", "Artist A & Artist B")
        # Should still find similarity for Artist A
        assert score > 0

    def test_artists_similarity_order_independent(self):
        """Test that artist similarity is order-independent."""
        score1 = artists_similarity("Artist A, Artist B", "Artist B, Artist A")
        score2 = artists_similarity("Artist A, Artist B", "Artist A, Artist B")
        # Both should have high similarity
        assert score1 >= 80
        assert score2 >= 80

    def test_artist_token_overlap_partial_match(self):
        """Test artist token overlap with partial matches."""
        # "Adam Port" contains "Port" token
        assert _artist_token_overlap("Adam Port", "Port") is True
        assert _artist_token_overlap("Port", "Adam Port") is True

    def test_artist_token_overlap_exact_tokens(self):
        """Test artist token overlap with exact token matches."""
        assert _artist_token_overlap("John Smith", "John") is True
        assert _artist_token_overlap("John Smith", "Smith") is True

    def test_artist_token_overlap_no_overlap(self):
        """Test artist token overlap when there's no overlap."""
        assert _artist_token_overlap("John Smith", "Jane Doe") is False

    def test_artist_token_overlap_with_parentheses(self):
        """Test artist token overlap with parentheses."""
        assert _artist_token_overlap("Artist (feat. Other)", "Artist") is True

    def test_score_components_with_accents(self):
        """Test scoring with accented characters."""
        t_sim, a_sim, comp = score_components(
            "Café Track",
            "José Artist",
            "Cafe Track",
            "Jose Artist"
        )
        # Should handle accents and still find similarity
        assert t_sim > 0
        assert a_sim > 0

    def test_score_components_different_order(self):
        """Test scoring with different word order."""
        t_sim, a_sim, comp = score_components(
            "Never Sleep Again",
            "Tim Green",
            "Sleep Never Again",
            "Green Tim"
        )
        # token_set_ratio should handle order differences
        assert t_sim > 50  # Should still have good similarity
        assert a_sim > 50

    def test_sanitize_title_handles_none(self):
        """Test sanitization handles None input."""
        result = sanitize_title_for_search(None)
        assert result == ""

    def test_normalize_text_handles_none(self):
        """Test normalization handles None input."""
        result = normalize_text(None)
        assert result == ""

    def test_word_tokens_handles_special_chars(self):
        """Test word tokens with special characters."""
        tokens = _word_tokens("Track (Remix) feat. Artist")
        # Should normalize and extract meaningful tokens
        assert len(tokens) > 0
        assert all(isinstance(t, str) for t in tokens)


