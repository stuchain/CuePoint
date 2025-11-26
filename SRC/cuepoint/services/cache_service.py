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
    """Cache entry with TTL support."""
    
    def __init__(self, value: Any, ttl: Optional[int] = None):
        self.value = value
        self.expires_at: Optional[datetime] = None
        if ttl:
            self.expires_at = datetime.now() + timedelta(seconds=ttl)
    
    def is_expired(self) -> bool:
        """Check if entry has expired."""
        if self.expires_at is None:
            return False
        return datetime.now() > self.expires_at


class CacheService(ICacheService):
    """Implementation of caching service using in-memory storage."""
    
    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        if entry.is_expired():
            del self._cache[key]
            return None
        
        return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        self._cache[key] = CacheEntry(value, ttl)
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
