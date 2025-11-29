"""Unit tests for query_generator module."""

import pytest
from cuepoint.core.query_generator import (
    make_search_queries,
    _ordered_unique,
    _subset_join,
    _artist_tokens,
    _title_prefixes
)


class TestQueryGeneratorHelpers:
    """Test helper functions in query_generator module."""
    
    def test_ordered_unique(self):
        """Test ordered unique function."""
        result = _ordered_unique(["A", "B", "A", "C"])
        assert result == ["A", "B", "C"]
    
    def test_ordered_unique_preserves_order(self):
        """Test that ordered_unique preserves order."""
        result = _ordered_unique(["C", "A", "B", "A"])
        assert result == ["C", "A", "B"]
    
    def test_subset_join(self):
        """Test subset join function."""
        result = _subset_join(["A", "B", "C"], max_r=2)
        assert "A" in result
        assert "A B" in result
        assert "B C" in result
        assert "A B C" not in result  # max_r=2 limits to pairs
    
    def test_subset_join_empty(self):
        """Test subset join with empty list."""
        assert _subset_join([]) == []
    
    def test_artist_tokens_single(self):
        """Test artist token extraction for single artist."""
        tokens = _artist_tokens("Artist A")
        assert "Artist A" in tokens
    
    def test_artist_tokens_multiple(self):
        """Test artist token extraction for multiple artists."""
        tokens = _artist_tokens("Artist A, Artist B")
        assert "Artist A" in tokens
        assert "Artist B" in tokens
    
    def test_artist_tokens_ampersand(self):
        """Test artist token extraction with ampersand."""
        tokens = _artist_tokens("Artist A & Artist B")
        assert len(tokens) >= 1
    
    def test_title_prefixes(self):
        """Test title prefix generation."""
        prefixes = _title_prefixes(["Never", "Sleep", "Again"], k_min=1, k_max=3)
        assert "Never" in prefixes
        assert "Never Sleep" in prefixes
        assert "Never Sleep Again" in prefixes
    
    def test_title_prefixes_empty(self):
        """Test title prefixes with empty list."""
        assert _title_prefixes([]) == []


class TestMakeSearchQueries:
    """Test make_search_queries function."""
    
    def test_make_search_queries_basic(self):
        """Test basic query generation."""
        queries = make_search_queries(
            title="Test Track",
            artists="Test Artist"
        )
        assert len(queries) > 0
        assert any("Test Track" in q for q in queries)
        assert any("Test Artist" in q for q in queries)
    
    def test_make_search_queries_title_only(self):
        """Test query generation with title only."""
        queries = make_search_queries(
            title="Test Track",
            artists=""
        )
        assert len(queries) > 0
        assert any("Test Track" in q for q in queries)
    
    def test_make_search_queries_with_remix(self):
        """Test query generation for remix tracks."""
        queries = make_search_queries(
            title="Test Track",
            artists="Test Artist",
            original_title="Test Track (Remixer Remix)"
        )
        assert len(queries) > 0
        # Should include remix-related queries
        assert any("remix" in q.lower() for q in queries) or any("Remixer" in q for q in queries)
    
    def test_make_search_queries_deduplication(self):
        """Test that queries are deduplicated."""
        queries = make_search_queries(
            title="Test Track",
            artists="Test Artist"
        )
        # Check for duplicates (case-insensitive)
        queries_lower = [q.lower() for q in queries]
        assert len(queries_lower) == len(set(queries_lower))
    
    def test_make_search_queries_priority_order(self):
        """Test that priority queries come first."""
        queries = make_search_queries(
            title="Test Track",
            artists="Test Artist"
        )
        # First queries should be most specific (full title + artist)
        if len(queries) > 0:
            first_query = queries[0]
            assert "Test Track" in first_query
            assert "Test Artist" in first_query
    
    def test_make_search_queries_empty_title(self):
        """Test query generation with empty title."""
        queries = make_search_queries(
            title="",
            artists="Test Artist"
        )
        # Should still generate some queries or return empty list
        assert isinstance(queries, list)





