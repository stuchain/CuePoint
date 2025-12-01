"""Unit tests for cache service."""

import pytest
import time
from cuepoint.services.cache_service import CacheService, CacheEntry


class TestCacheEntry:
    """Test cache entry."""
    
    def test_cache_entry_no_ttl(self):
        """Test cache entry without TTL."""
        entry = CacheEntry("value")
        assert entry.value == "value"
        assert entry.expires_at is None
        assert entry.is_expired() is False
    
    def test_cache_entry_with_ttl(self):
        """Test cache entry with TTL."""
        entry = CacheEntry("value", ttl=1)
        assert entry.value == "value"
        assert entry.expires_at is not None
        assert entry.is_expired() is False
    
    def test_cache_entry_expires(self):
        """Test cache entry expiration."""
        entry = CacheEntry("value", ttl=0.1)
        time.sleep(0.2)
        assert entry.is_expired() is True


class TestCacheService:
    """Test cache service."""
    
    def test_get_set(self):
        """Test basic get/set operations."""
        cache = CacheService()
        
        # Set value
        cache.set("key1", "value1")
        
        # Get value
        value = cache.get("key1")
        assert value == "value1"
    
    def test_get_nonexistent(self):
        """Test getting nonexistent key."""
        cache = CacheService()
        assert cache.get("nonexistent") is None
    
    def test_set_overwrite(self):
        """Test overwriting existing key."""
        cache = CacheService()
        cache.set("key1", "value1")
        cache.set("key1", "value2")
        assert cache.get("key1") == "value2"
    
    def test_clear(self):
        """Test clearing cache."""
        cache = CacheService()
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        
        cache.clear()
        
        assert cache.get("key1") is None
        assert cache.get("key2") is None
    
    def test_ttl_expiration(self):
        """Test TTL expiration."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=0.1)
        
        # Should be available immediately
        assert cache.get("key1") == "value1"
        
        # Wait for expiration
        time.sleep(0.2)
        
        # Should be expired
        assert cache.get("key1") is None
    
    def test_multiple_keys(self):
        """Test multiple keys."""
        cache = CacheService()
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        assert cache.get("key1") == "value1"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"











