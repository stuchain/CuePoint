"""Integration tests for CacheService with real service instances."""

import time

import pytest

from cuepoint.services.cache_service import CacheService


class TestCacheServiceIntegration:
    """Integration tests for CacheService using real service instances."""
    
    @pytest.fixture
    def cache_service(self):
        """Create a real cache service."""
        return CacheService()
    
    def test_set_and_get(self, cache_service):
        """Test basic set and get operations."""
        # Set a value
        cache_service.set("test_key", "test_value")
        
        # Get it back
        value = cache_service.get("test_key")
        assert value == "test_value"
    
    def test_get_nonexistent_key(self, cache_service):
        """Test getting a key that doesn't exist."""
        value = cache_service.get("nonexistent_key")
        assert value is None
    
    def test_set_with_ttl(self, cache_service):
        """Test setting a value with TTL."""
        # Set with short TTL
        cache_service.set("ttl_key", "ttl_value", ttl=1)
        
        # Should be available immediately
        value = cache_service.get("ttl_key")
        assert value == "ttl_value"
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Should be expired now
        value = cache_service.get("ttl_key")
        assert value is None
    
    def test_set_without_ttl(self, cache_service):
        """Test setting a value without TTL (never expires)."""
        # Set without TTL
        cache_service.set("no_ttl_key", "no_ttl_value")
        
        # Should be available
        value = cache_service.get("no_ttl_key")
        assert value == "no_ttl_value"
        
        # Wait a bit
        time.sleep(0.1)
        
        # Should still be available
        value = cache_service.get("no_ttl_key")
        assert value == "no_ttl_value"
    
    def test_overwrite_value(self, cache_service):
        """Test overwriting an existing value."""
        # Set initial value
        cache_service.set("overwrite_key", "initial_value")
        assert cache_service.get("overwrite_key") == "initial_value"
        
        # Overwrite it
        cache_service.set("overwrite_key", "new_value")
        assert cache_service.get("overwrite_key") == "new_value"
    
    def test_clear_cache(self, cache_service):
        """Test clearing all cache entries."""
        # Set some values
        cache_service.set("key1", "value1")
        cache_service.set("key2", "value2")
        
        # Verify they exist
        assert cache_service.get("key1") == "value1"
        assert cache_service.get("key2") == "value2"
        
        # Clear cache
        cache_service.clear()
        
        # Verify all values are gone
        assert cache_service.get("key1") is None
        assert cache_service.get("key2") is None
    
    def test_multiple_keys(self, cache_service):
        """Test storing multiple keys."""
        # Set multiple keys
        cache_service.set("key1", "value1")
        cache_service.set("key2", "value2")
        cache_service.set("key3", "value3")
        
        # Verify all are accessible
        assert cache_service.get("key1") == "value1"
        assert cache_service.get("key2") == "value2"
        assert cache_service.get("key3") == "value3"
    
    def test_different_value_types(self, cache_service):
        """Test caching different value types."""
        # Cache different types
        cache_service.set("string_key", "string_value")
        cache_service.set("int_key", 42)
        cache_service.set("list_key", [1, 2, 3])
        cache_service.set("dict_key", {"a": 1, "b": 2})
        
        # Verify all types are preserved
        assert cache_service.get("string_key") == "string_value"
        assert cache_service.get("int_key") == 42
        assert cache_service.get("list_key") == [1, 2, 3]
        assert cache_service.get("dict_key") == {"a": 1, "b": 2}
    
    def test_ttl_expiration_cleanup(self, cache_service):
        """Test that expired entries are automatically removed."""
        # Set multiple entries with different TTLs
        cache_service.set("short_ttl", "value1", ttl=1)
        cache_service.set("long_ttl", "value2", ttl=10)
        
        # Wait for short TTL to expire
        time.sleep(1.1)
        
        # Short TTL should be expired and removed
        assert cache_service.get("short_ttl") is None
        
        # Long TTL should still be available
        assert cache_service.get("long_ttl") == "value2"

