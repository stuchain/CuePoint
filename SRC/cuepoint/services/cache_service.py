#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Cache Service Implementation

Simple in-memory cache service. Can be extended to use persistent storage.
"""

from typing import Any, Optional, Dict
from datetime import datetime, timedelta
from cuepoint.services.interfaces import ICacheService


class CacheEntry:
    """Cache entry with time-to-live (TTL) support.
    
    Stores a value with an optional expiration time. When TTL is provided,
    the entry expires after that many seconds.
    
    Attributes:
        value: The cached value.
        expires_at: Optional datetime when the entry expires.
    """
    
    def __init__(self, value: Any, ttl: Optional[int] = None) -> None:
        """Initialize cache entry.
        
        Args:
            value: Value to cache.
            ttl: Optional time-to-live in seconds. If None, entry never expires.
        """
        self.value = value
        self.expires_at: Optional[datetime] = None
        if ttl:
            self.expires_at = datetime.now() + timedelta(seconds=ttl)
    
    def is_expired(self) -> bool:
        """Check if cache entry has expired.
        
        Returns:
            True if entry has expired (TTL was set and time has passed),
            False if entry has no TTL or hasn't expired yet.
        """
        if self.expires_at is None:
            return False
        return datetime.now() > self.expires_at


class CacheService(ICacheService):
    """In-memory caching service with TTL support.
    
    Provides a simple key-value cache with optional expiration times.
    Can be extended to use persistent storage (Redis, database, etc.).
    
    Attributes:
        _cache: Internal dictionary mapping keys to CacheEntry objects.
    """
    
    def __init__(self) -> None:
        """Initialize empty cache."""
        self._cache: Dict[str, CacheEntry] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache.
        
        Returns the cached value if it exists and hasn't expired.
        Automatically removes expired entries.
        
        Args:
            key: Cache key to look up.
        
        Returns:
            Cached value if found and not expired, None otherwise.
        
        Example:
            >>> cache.set("key", "value", ttl=3600)
            >>> cache.get("key")
            'value'
        """
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        if entry.is_expired():
            del self._cache[key]
            return None
        
        return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL.
        
        Stores a value in the cache. If TTL is provided, the entry will
        expire after that many seconds.
        
        Args:
            key: Cache key.
            value: Value to cache.
            ttl: Optional time-to-live in seconds. If None, entry never expires.
        
        Example:
            >>> cache.set("key", "value", ttl=3600)  # Expires in 1 hour
            >>> cache.set("key2", "value2")  # Never expires
        """
        self._cache[key] = CacheEntry(value, ttl)
    
    def clear(self) -> None:
        """Clear all cache entries.
        
        Removes all entries from the cache, regardless of expiration status.
        
        Example:
            >>> cache.clear()  # Cache is now empty
        """
        self._cache.clear()
