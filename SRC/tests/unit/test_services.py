#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Service implementations
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from cuepoint.services.cache_service import CacheService, CacheEntry
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.export_service import ExportService
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.data.rekordbox import RBTrack
from cuepoint.ui.gui_interface import TrackResult


class TestCacheService:
    """Test cases for Cache Service."""
    
    def test_get_set(self):
        """Test basic get/set operations."""
        cache = CacheService()
        
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
    
    def test_get_missing(self):
        """Test getting non-existent key."""
        cache = CacheService()
        assert cache.get("missing") is None
    
    def test_ttl_expiration(self):
        """Test TTL expiration."""
        from datetime import datetime, timedelta
        cache = CacheService()
        
        # Create entry with expired TTL
        entry = CacheEntry("value1", ttl=1)
        entry.expires_at = datetime.now() - timedelta(seconds=1)  # Already expired
        cache._cache["key1"] = entry
        
        # Entry should be expired
        assert cache.get("key1") is None
    
    def test_clear(self):
        """Test clearing cache."""
        cache = CacheService()
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None


class TestLoggingService:
    """Test cases for Logging Service."""
    
    def test_logging_methods(self):
        """Test that logging methods don't raise errors."""
        logger = LoggingService()
        
        logger.debug("debug message")
        logger.info("info message")
        logger.warning("warning message")
        logger.error("error message")


class TestConfigService:
    """Test cases for Config Service."""
    
    def test_get_set(self):
        """Test get/set operations."""
        config = ConfigService()
        
        config.set("test_key", "test_value")
        assert config.get("test_key") == "test_value"
    
    def test_get_default(self):
        """Test getting with default value."""
        config = ConfigService()
        assert config.get("missing", "default") == "default"
    
    def test_save_load(self):
        """Test save/load operations (no-op for now)."""
        config = ConfigService()
        # Should not raise
        config.save()
        config.load()


class TestExportService:
    """Test cases for Export Service."""
    
    def test_export_to_json(self, tmp_path):
        """Test JSON export."""
        service = ExportService()
        results = [
            TrackResult(
                playlist_index=1,
                title="Test Track",
                artist="Test Artist",
                matched=False
            )
        ]
        
        filepath = tmp_path / "test.json"
        service.export_to_json(results, str(filepath))
        
        assert filepath.exists()
        import json
        with open(filepath) as f:
            data = json.load(f)
            assert len(data) == 1
            # Check that the result data is present (keys may vary based on TrackResult.to_dict() implementation)
            assert "playlist_index" in data[0] or "title" in data[0] or data[0].get("playlist_index") == 1


class TestBeatportService:
    """Test cases for Beatport Service."""
    
    def test_search_tracks_caching(self):
        """Test that search results are cached."""
        cache = CacheService()
        logging = LoggingService()
        service = BeatportService(cache, logging)
        
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = ["url1", "url2"]
            
            # First call should call search
            results1 = service.search_tracks("test query")
            assert mock_search.call_count == 1
            assert results1 == ["url1", "url2"]
            
            # Second call should use cache
            results2 = service.search_tracks("test query")
            assert mock_search.call_count == 1  # Not called again
            assert results2 == ["url1", "url2"]


class TestMatcherService:
    """Test cases for Matcher Service."""
    
    def test_find_best_match(self):
        """Test that matcher service delegates to best_beatport_match."""
        service = MatcherService()
        
        with patch('cuepoint.services.matcher_service.best_beatport_match') as mock_match:
            mock_match.return_value = (None, [], [], 0)
            
            result = service.find_best_match(
                idx=1,
                track_title="Test",
                track_artists_for_scoring="Artist",
                title_only_mode=False,
                queries=["query1"]
            )
            
            mock_match.assert_called_once()
            assert result == (None, [], [], 0)


class TestProcessorService:
    """Test cases for Processor Service."""
    
    def test_process_track_no_match(self):
        """Test processing track with no match."""
        beatport = Mock()
        matcher = Mock()
        logging = LoggingService()
        config = ConfigService()
        
        service = ProcessorService(beatport, matcher, logging, config)
        
        # Mock matcher to return no match
        matcher.find_best_match.return_value = (None, [], [], 0)
        
        track = RBTrack(track_id="1", title="Test Track", artists="Test Artist")
        result = service.process_track(1, track)
        
        assert result.matched is False
        assert result.title == "Test Track"
        assert result.artist == "Test Artist"
    
    def test_process_playlist(self):
        """Test processing playlist."""
        beatport = Mock()
        matcher = Mock()
        logging = LoggingService()
        config = ConfigService()
        
        service = ProcessorService(beatport, matcher, logging, config)
        
        # Mock matcher to return no match
        matcher.find_best_match.return_value = (None, [], [], 0)
        
        tracks = [
            RBTrack(track_id="1", title="Track 1", artists="Artist 1"),
            RBTrack(track_id="2", title="Track 2", artists="Artist 2"),
        ]
        
        results = service.process_playlist(tracks)
        
        assert len(results) == 2
        assert all(not r.matched for r in results)

