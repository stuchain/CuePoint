#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
HTTP Cache Management System

Implements Step 6.5 - Caching Strategy with:
- HTTP response caching using requests-cache
- Cache invalidation mechanisms
- Cache pruning strategies
- Cache statistics and diagnostics
"""

import fnmatch
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from cuepoint.utils.paths import AppPaths

try:
    import requests_cache
    from requests_cache import CachedSession
    REQUESTS_CACHE_AVAILABLE = True
except ImportError:
    REQUESTS_CACHE_AVAILABLE = False
    CachedSession = None  # type: ignore

logger = logging.getLogger(__name__)


class CacheConfig:
    """Cache configuration.
    
    Implements Step 6.5.1.1 - Cache Configuration.
    """
    
    # Default configuration
    default_ttl = timedelta(days=7)
    default_backend = "sqlite"
    default_cache_name = "http_cache"
    default_size_limit = 100 * 1024 * 1024  # 100MB
    
    def __init__(
        self,
        cache_dir: Optional[Path] = None,
        ttl: Optional[timedelta] = None,
        backend: str = "sqlite",
        size_limit: Optional[int] = None
    ):
        """Initialize cache configuration.
        
        Args:
            cache_dir: Cache directory (default: AppPaths.cache_dir() / "http_cache").
            ttl: Time to live (default: 7 days).
            backend: Cache backend (default: "sqlite").
            size_limit: Maximum cache size in bytes (default: 100MB).
        """
        self.cache_dir = cache_dir or AppPaths.cache_dir() / "http_cache"
        self.ttl = ttl or CacheConfig.default_ttl
        self.backend = backend or CacheConfig.default_backend
        self.size_limit = size_limit or CacheConfig.default_size_limit
    
    def get_cache_path(self) -> Path:
        """Get cache database path.
        
        Returns:
            Path to cache database.
        """
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        return self.cache_dir / f"{CacheConfig.default_cache_name}.sqlite"


class HTTPCacheManager:
    """Manage HTTP response caching.
    
    Implements Step 6.5.1 - Cache Management.
    """
    
    _session: Optional['CachedSession'] = None
    _config: Optional[CacheConfig] = None
    
    @staticmethod
    def initialize(config: Optional[CacheConfig] = None) -> None:
        """Initialize cache manager.
        
        Args:
            config: Cache configuration (default: default config).
        """
        if not REQUESTS_CACHE_AVAILABLE:
            logger.warning("requests-cache not available, HTTP caching disabled")
            return
        
        if HTTPCacheManager._session is not None:
            return
        
        if config is None:
            config = CacheConfig()
        
        HTTPCacheManager._config = config
        
        # Create cached session
        cache_path = config.get_cache_path()
        HTTPCacheManager._session = requests_cache.CachedSession(
            cache_name=str(cache_path.with_suffix('')),
            backend=config.backend,
            expire_after=config.ttl,
            allowable_methods=['GET', 'POST'],  # Cache GET and POST
            allowable_codes=[200, 203, 300, 301, 308],  # Cache successful responses
            match_headers=False,  # Don't match on headers
            stale_if_error=True,  # Use stale cache on error
        )
        
        logger.info(f"HTTP cache initialized at {cache_path}")
    
    @staticmethod
    def get_session() -> Optional['CachedSession']:
        """Get cached session.
        
        Returns:
            CachedSession instance, or None if caching unavailable.
        """
        if HTTPCacheManager._session is None:
            HTTPCacheManager.initialize()
        return HTTPCacheManager._session
    
    @staticmethod
    def clear_cache() -> None:
        """Clear all cached responses.
        
        Implements Step 6.5.2.2 - Manual Cache Invalidation.
        """
        if HTTPCacheManager._session is not None:
            HTTPCacheManager._session.cache.clear()
            logger.info("HTTP cache cleared")
    
    @staticmethod
    def close() -> None:
        """Close cache session and release resources."""
        if HTTPCacheManager._session is not None:
            try:
                HTTPCacheManager._session.close()
            except Exception:
                pass
            HTTPCacheManager._session = None
            HTTPCacheManager._config = None
    
    @staticmethod
    def get_cache_size() -> int:
        """Get current cache size in bytes.
        
        Returns:
            Cache size in bytes.
        """
        if HTTPCacheManager._config is None:
            return 0
        
        cache_path = HTTPCacheManager._config.get_cache_path()
        if cache_path.exists():
            return cache_path.stat().st_size
        
        # Also check for SQLite WAL and SHM files
        total = 0
        for ext in ['', '-wal', '-shm']:
            path = cache_path.with_suffix(cache_path.suffix + ext)
            if path.exists():
                total += path.stat().st_size
        
        return total
    
    @staticmethod
    def get_cache_stats() -> Dict[str, Any]:
        """Get cache statistics.
        
        Returns:
            Dictionary with cache statistics.
        """
        if HTTPCacheManager._session is None or HTTPCacheManager._config is None:
            return {
                "enabled": False,
                "size": 0,
                "entries": 0,
            }
        
        cache = HTTPCacheManager._session.cache
        size = HTTPCacheManager.get_cache_size()
        
        try:
            entries = len(cache.responses) if hasattr(cache, 'responses') else 0
        except Exception:
            entries = 0
        
        return {
            "enabled": True,
            "size": size,
            "size_mb": size / (1024 * 1024),
            "entries": entries,
            "location": str(HTTPCacheManager._config.get_cache_path()),
            "ttl_days": HTTPCacheManager._config.ttl.days,
        }


class CacheInvalidation:
    """Cache invalidation utilities.
    
    Implements Step 6.5.2 - Cache Invalidation.
    """
    
    @staticmethod
    def clear_all() -> None:
        """Clear all cached entries."""
        HTTPCacheManager.clear_cache()
    
    @staticmethod
    def clear_expired() -> None:
        """Clear expired cache entries."""
        if HTTPCacheManager._session is not None:
            try:
                # Use delete(expired=True) instead of deprecated remove_expired_responses()
                cache = HTTPCacheManager._session.cache
                if hasattr(cache, 'delete'):
                    # Delete expired entries
                    cache.delete(expired=True)
                elif hasattr(cache, 'remove_expired_responses'):
                    # Fallback for older versions
                    cache.remove_expired_responses()
                logger.info("Expired cache entries removed")
            except Exception as e:
                logger.warning(f"Error removing expired cache entries: {e}")
    
    @staticmethod
    def clear_by_url_pattern(pattern: str) -> int:
        """Clear cache entries matching URL pattern.
        
        Args:
            pattern: URL pattern (supports wildcards).
            
        Returns:
            Number of entries cleared.
        """
        if HTTPCacheManager._session is None:
            return 0
        
        cache = HTTPCacheManager._session.cache
        cleared = 0
        
        try:
            # Get all cached URLs
            if hasattr(cache, 'responses'):
                for key in list(cache.responses.keys()):
                    if fnmatch.fnmatch(str(key), pattern):
                        try:
                            cache.delete(key)
                            cleared += 1
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"Error clearing cache by pattern {pattern}: {e}")
        
        if cleared > 0:
            logger.info(f"Cleared {cleared} cache entries matching pattern: {pattern}")
        
        return cleared
    
    @staticmethod
    def clear_old_entries(days: int = 7) -> int:
        """Clear cache entries older than specified days.
        
        Args:
            days: Number of days.
            
        Returns:
            Number of entries cleared.
        """
        if HTTPCacheManager._session is None:
            return 0
        
        cutoff = datetime.now() - timedelta(days=days)
        cache = HTTPCacheManager._session.cache
        cleared = 0
        
        try:
            if hasattr(cache, 'responses'):
                for key in list(cache.responses.keys()):
                    try:
                        response = cache.responses[key]
                        if hasattr(response, 'created_at') and response.created_at < cutoff:
                            cache.delete(key)
                            cleared += 1
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"Error clearing old cache entries: {e}")
        
        if cleared > 0:
            logger.info(f"Cleared {cleared} cache entries older than {days} days")
        
        return cleared


class CacheValidator:
    """Validate cache entries.
    
    Implements Step 6.5.2.3 - Cache Validation.
    """
    
    @staticmethod
    def is_cache_valid(url: str, max_age: Optional[timedelta] = None) -> bool:
        """Check if cache entry is valid.
        
        Args:
            url: URL to check.
            max_age: Maximum age for cache entry.
            
        Returns:
            True if cache entry is valid.
        """
        if HTTPCacheManager._session is None:
            return False
        
        cache = HTTPCacheManager._session.cache
        
        try:
            if not hasattr(cache, 'responses') or url not in cache.responses:
                return False
            
            response = cache.responses[url]
            
            # Check if expired
            if hasattr(response, 'is_expired') and response.is_expired:
                return False
            
            # Check max age if specified
            if max_age is not None and hasattr(response, 'created_at'):
                age = datetime.now() - response.created_at
                if age > max_age:
                    return False
            
            return True
        except Exception:
            return False


class CacheSizeMonitor:
    """Monitor cache size and trigger pruning.
    
    Implements Step 6.5.3.1 - Cache Size Monitoring.
    """
    
    @staticmethod
    def check_cache_size() -> Dict[str, Any]:
        """Check current cache size.
        
        Returns:
            Dictionary with size information.
        """
        stats = HTTPCacheManager.get_cache_stats()
        config = HTTPCacheManager._config
        
        if config is None:
            return stats
        
        stats["limit"] = config.size_limit
        stats["limit_mb"] = config.size_limit / (1024 * 1024)
        stats["usage_percent"] = (stats["size"] / config.size_limit * 100) if config.size_limit > 0 else 0
        stats["needs_pruning"] = stats["size"] > config.size_limit
        
        return stats
    
    @staticmethod
    def should_prune() -> bool:
        """Check if cache should be pruned.
        
        Returns:
            True if cache exceeds size limit.
        """
        stats = CacheSizeMonitor.check_cache_size()
        return stats.get("needs_pruning", False)


class CachePruner:
    """Prune cache to manage size.
    
    Implements Step 6.5.3.2 - Automatic Cache Pruning.
    """
    
    @staticmethod
    def prune_to_size(target_size: int) -> int:
        """Prune cache to target size.
        
        Args:
            target_size: Target size in bytes.
            
        Returns:
            Number of entries removed.
        """
        if HTTPCacheManager._session is None:
            return 0
        
        cache = HTTPCacheManager._session.cache
        current_size = HTTPCacheManager.get_cache_size()
        
        if current_size <= target_size:
            return 0
        
        removed = 0
        
        try:
            # Get all entries sorted by age (oldest first)
            entries = []
            if hasattr(cache, 'responses'):
                for key in cache.responses.keys():
                    try:
                        response = cache.responses[key]
                        created_at = getattr(response, 'created_at', datetime.min)
                        size = getattr(response, 'size', 0)
                        entries.append((key, created_at, size))
                    except Exception:
                        pass
            
            # Sort by creation time (oldest first)
            entries.sort(key=lambda x: x[1])
            
            # Remove entries until under target size
            for key, _, _ in entries:
                if HTTPCacheManager.get_cache_size() <= target_size:
                    break
                
                try:
                    cache.delete(key)
                    removed += 1
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Error pruning cache: {e}")
        
        if removed > 0:
            logger.info(f"Pruned cache: removed {removed} entries, target size: {target_size / (1024*1024):.1f} MB")
        
        return removed
    
    @staticmethod
    def prune_automatically() -> int:
        """Automatically prune cache if size limit exceeded.
        
        Returns:
            Number of entries removed.
        """
        config = HTTPCacheManager._config
        if config is None:
            return 0
        
        if not CacheSizeMonitor.should_prune():
            return 0
        
        # Prune to 50% of limit
        target_size = config.size_limit // 2
        return CachePruner.prune_to_size(target_size)
