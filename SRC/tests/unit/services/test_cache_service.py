"""Unit tests for cache service."""

import time

import pytest

from cuepoint.services.cache_service import CacheEntry, CacheService


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
    
    def test_cache_entry_no_expiration(self):
        """Test cache entry without expiration never expires."""
        entry = CacheEntry("value")
        # Wait a bit
        time.sleep(0.1)
        assert entry.is_expired() is False
    
    def test_cache_entry_expires_after_ttl(self):
        """Test cache entry expires after TTL."""
        entry = CacheEntry("value", ttl=0.1)
        assert entry.is_expired() is False
        
        time.sleep(0.15)
        assert entry.is_expired() is True
    
    def test_get_expired_entry_removed(self):
        """Test that expired entries are removed on get."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=0.1)
        
        # Should be available immediately
        assert cache.get("key1") == "value1"
        
        # Wait for expiration
        time.sleep(0.15)
        
        # Should return None and remove entry
        assert cache.get("key1") is None
        # Entry should be removed from cache
        assert "key1" not in cache._cache
    
    def test_set_with_zero_ttl(self):
        """Test setting cache entry with zero TTL."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=0)
        
        # Should expire immediately
        time.sleep(0.01)
        assert cache.get("key1") is None
    
    def test_set_with_negative_ttl(self):
        """Test setting cache entry with negative TTL."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=-1)
        
        # Should expire immediately (treated as expired)
        assert cache.get("key1") is None
    
    def test_cache_with_different_types(self):
        """Test caching different data types."""
        cache = CacheService()
        
        cache.set("str_key", "string_value")
        cache.set("int_key", 42)
        cache.set("list_key", [1, 2, 3])
        cache.set("dict_key", {"a": 1, "b": 2})
        cache.set("none_key", None)
        
        assert cache.get("str_key") == "string_value"
        assert cache.get("int_key") == 42
        assert cache.get("list_key") == [1, 2, 3]
        assert cache.get("dict_key") == {"a": 1, "b": 2}
        assert cache.get("none_key") is None
    
    def test_cache_entry_value_access(self):
        """Test accessing cache entry value directly."""
        entry = CacheEntry("test_value", ttl=100)
        assert entry.value == "test_value"
        assert entry.expires_at is not None
    
    def test_clear_removes_all_entries(self):
        """Test that clear removes all entries regardless of TTL."""
        cache = CacheService()
        cache.set("key1", "value1")
        cache.set("key2", "value2", ttl=3600)
        cache.set("key3", "value3", ttl=0.1)
        
        cache.clear()
        
        assert cache.get("key1") is None
        assert cache.get("key2") is None
        assert cache.get("key3") is None
    
    def test_get_nonexistent_key(self):
        """Test getting nonexistent key returns None."""
        cache = CacheService()
        assert cache.get("nonexistent") is None
    
    def test_set_overwrites_existing(self):
        """Test that set overwrites existing entry."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=100)
        cache.set("key1", "value2", ttl=200)
        
        # Should return new value
        assert cache.get("key1") == "value2"
        # Should have new TTL
        entry = cache._cache["key1"]
        assert entry.value == "value2"
    
    def test_cache_entry_with_long_ttl(self):
        """Test cache entry with long TTL."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=3600)  # 1 hour
        
        # Should be available immediately
        assert cache.get("key1") == "value1"
        # Should not expire quickly
        time.sleep(0.1)
        assert cache.get("key1") == "value1"
    
    def test_multiple_entries_different_ttl(self):
        """Test multiple entries with different TTLs."""
        cache = CacheService()
        cache.set("key1", "value1", ttl=0.1)  # Short TTL
        cache.set("key2", "value2", ttl=1.0)  # Longer TTL
        cache.set("key3", "value3")  # No TTL
        
        # All should be available immediately
        assert cache.get("key1") == "value1"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"
        
        # Wait for first to expire
        time.sleep(0.15)
        
        # First should be expired, others still valid
        assert cache.get("key1") is None
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"
        
        # Wait for second to expire
        time.sleep(0.9)
        
        # Second should be expired, third still valid
        assert cache.get("key2") is None
        assert cache.get("key3") == "value3"  # Never expires













