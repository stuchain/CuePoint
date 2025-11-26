#!/usr/bin/env python3
"""Fix all service files"""

import os

def write_file(path, content):
    """Write file with proper encoding."""
    full_path = os.path.join(os.path.dirname(__file__), path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    size = os.path.getsize(full_path)
    print(f"[OK] {path} ({size} bytes)")

# Fix cache_service.py
cache_content = '''#!/usr/bin/env python3
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
'''
write_file('cuepoint/services/cache_service.py', cache_content)

# Fix bootstrap.py
bootstrap_content = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Bootstrap

Bootstrap function to register all services with the DI container.
This should be called at application startup.
"""

from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import (
    IProcessorService,
    IBeatportService,
    ICacheService,
    IExportService,
    IConfigService,
    ILoggingService,
    IMatcherService
)
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.export_service import ExportService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService


def bootstrap_services() -> None:
    """Register all services with the DI container."""
    container = get_container()
    
    # Register logging service first (needed by others)
    logging_service = LoggingService()
    container.register_singleton(ILoggingService, logging_service)
    
    # Register config service
    config_service = ConfigService()
    container.register_singleton(IConfigService, config_service)
    
    # Register cache service
    cache_service = CacheService()
    container.register_singleton(ICacheService, cache_service)
    
    # Register matcher service (no dependencies)
    matcher_service = MatcherService()
    container.register_singleton(IMatcherService, matcher_service)
    
    # Register Beatport service (depends on cache and logging)
    def create_beatport_service() -> IBeatportService:
        return BeatportService(
            cache_service=container.resolve(ICacheService),
            logging_service=container.resolve(ILoggingService)
        )
    container.register_factory(IBeatportService, create_beatport_service)
    
    # Register processor service (depends on beatport, matcher, logging, config)
    def create_processor_service() -> IProcessorService:
        return ProcessorService(
            beatport_service=container.resolve(IBeatportService),
            matcher_service=container.resolve(IMatcherService),
            logging_service=container.resolve(ILoggingService),
            config_service=container.resolve(IConfigService)
        )
    container.register_factory(IProcessorService, create_processor_service)
    
    # Register export service (no dependencies)
    export_service = ExportService()
    container.register_singleton(IExportService, export_service)
'''
write_file('cuepoint/services/bootstrap.py', bootstrap_content)

print("\nAll service files fixed!")

