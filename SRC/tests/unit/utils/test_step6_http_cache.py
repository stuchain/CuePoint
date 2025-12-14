#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.5: Caching Strategy (HTTP Cache)

Tests HTTPCacheManager, CacheConfig, CacheInvalidation, CacheValidator, CacheSizeMonitor, CachePruner.
"""

import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cuepoint.utils.http_cache import (
    CacheConfig,
    CacheInvalidation,
    CachePruner,
    CacheSizeMonitor,
    CacheValidator,
    HTTPCacheManager,
)


class TestCacheConfig:
    """Test CacheConfig class."""

    def test_default_config(self):
        """Test default cache config."""
        config = CacheConfig()
        assert config.ttl == timedelta(days=7)
        assert config.backend == "sqlite"
        assert config.size_limit == 100 * 1024 * 1024

    def test_custom_config(self):
        """Test custom cache config."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_dir = Path(tmpdir) / "custom_cache"
            config = CacheConfig(
                cache_dir=cache_dir,
                ttl=timedelta(days=1),
                size_limit=50 * 1024 * 1024
            )
            assert config.cache_dir == cache_dir
            assert config.ttl == timedelta(days=1)
            assert config.size_limit == 50 * 1024 * 1024

    def test_get_cache_path(self):
        """Test getting cache path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_dir = Path(tmpdir) / "cache"
            config = CacheConfig(cache_dir=cache_dir)
            cache_path = config.get_cache_path()
            assert cache_path.parent == cache_dir
            assert cache_path.name == "http_cache.sqlite"
            assert cache_dir.exists()


class TestHTTPCacheManager:
    """Test HTTPCacheManager class."""

    def test_initialize(self):
        """Test cache manager initialization."""
        HTTPCacheManager.close()  # Clean up any existing session
        
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_dir = Path(tmpdir) / "cache"
            config = CacheConfig(cache_dir=cache_dir)
            HTTPCacheManager.initialize(config)
            
            # Should initialize even if requests-cache not available
            assert HTTPCacheManager._config == config
            
            # Clean up
            HTTPCacheManager.close()

    def test_get_session(self):
        """Test getting session."""
        HTTPCacheManager._session = None
        HTTPCacheManager._config = None
        
        session = HTTPCacheManager.get_session()
        # May be None if requests-cache not available
        assert session is None or hasattr(session, 'cache')

    def test_clear_cache(self):
        """Test clearing cache."""
        # Should not raise exception even if session is None
        HTTPCacheManager.clear_cache()

    def test_get_cache_size(self):
        """Test getting cache size."""
        size = HTTPCacheManager.get_cache_size()
        assert isinstance(size, int)
        assert size >= 0

    def test_get_cache_stats(self):
        """Test getting cache stats."""
        stats = HTTPCacheManager.get_cache_stats()
        assert "enabled" in stats
        assert "size" in stats
        assert "entries" in stats


class TestCacheInvalidation:
    """Test CacheInvalidation class."""

    def test_clear_all(self):
        """Test clearing all cache."""
        # Should not raise exception
        CacheInvalidation.clear_all()

    def test_clear_expired(self):
        """Test clearing expired entries."""
        # Should not raise exception
        CacheInvalidation.clear_expired()

    def test_clear_by_url_pattern(self):
        """Test clearing by URL pattern."""
        cleared = CacheInvalidation.clear_by_url_pattern("*")
        assert isinstance(cleared, int)
        assert cleared >= 0

    def test_clear_old_entries(self):
        """Test clearing old entries."""
        cleared = CacheInvalidation.clear_old_entries(days=7)
        assert isinstance(cleared, int)
        assert cleared >= 0


class TestCacheValidator:
    """Test CacheValidator class."""

    def test_is_cache_valid_no_cache(self):
        """Test cache validation when cache not available."""
        result = CacheValidator.is_cache_valid("http://example.com")
        assert result is False

    def test_is_cache_valid_with_max_age(self):
        """Test cache validation with max age."""
        result = CacheValidator.is_cache_valid(
            "http://example.com",
            max_age=timedelta(days=1)
        )
        assert isinstance(result, bool)


class TestCacheSizeMonitor:
    """Test CacheSizeMonitor class."""

    def test_check_cache_size(self):
        """Test checking cache size."""
        stats = CacheSizeMonitor.check_cache_size()
        assert "size" in stats
        assert "limit" in stats or "enabled" in stats

    def test_should_prune(self):
        """Test should prune check."""
        result = CacheSizeMonitor.should_prune()
        assert isinstance(result, bool)


class TestCachePruner:
    """Test CachePruner class."""

    def test_prune_to_size(self):
        """Test pruning to target size."""
        removed = CachePruner.prune_to_size(1024 * 1024)  # 1MB
        assert isinstance(removed, int)
        assert removed >= 0

    def test_prune_automatically(self):
        """Test automatic pruning."""
        removed = CachePruner.prune_automatically()
        assert isinstance(removed, int)
        assert removed >= 0
