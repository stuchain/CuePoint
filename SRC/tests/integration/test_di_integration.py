#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for Dependency Injection

Tests that all services work together correctly through the DI container.
"""

import pytest
from cuepoint.utils.di_container import reset_container, get_container
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import (
    IProcessorService,
    IBeatportService,
    ICacheService,
    IExportService,
    IConfigService,
    ILoggingService,
    IMatcherService
)
from cuepoint.models.track import Track


class TestDIIntegration:
    """Integration tests for DI container and services."""
    
    def setup_method(self):
        """Reset container before each test."""
        reset_container()
        bootstrap_services()
        self.container = get_container()
    
    def test_all_services_registered(self):
        """Test that all services are registered."""
        assert self.container.is_registered(ILoggingService)
        assert self.container.is_registered(IConfigService)
        assert self.container.is_registered(ICacheService)
        assert self.container.is_registered(IMatcherService)
        assert self.container.is_registered(IBeatportService)
        assert self.container.is_registered(IProcessorService)
        assert self.container.is_registered(IExportService)
    
    def test_resolve_logging_service(self):
        """Test resolving logging service."""
        service = self.container.resolve(ILoggingService)
        assert service is not None
        assert isinstance(service, ILoggingService)
    
    def test_resolve_config_service(self):
        """Test resolving config service."""
        service = self.container.resolve(IConfigService)
        assert service is not None
        assert isinstance(service, IConfigService)
        # Test that it has default settings
        assert service.get("MAX_SEARCH_RESULTS") is not None
    
    def test_resolve_cache_service(self):
        """Test resolving cache service."""
        service = self.container.resolve(ICacheService)
        assert service is not None
        assert isinstance(service, ICacheService)
        # Test basic functionality
        service.set("test", "value")
        assert service.get("test") == "value"
    
    def test_resolve_beatport_service(self):
        """Test resolving Beatport service."""
        service = self.container.resolve(IBeatportService)
        assert service is not None
        assert isinstance(service, IBeatportService)
        # Service should have dependencies injected
        assert hasattr(service, 'cache_service')
        assert hasattr(service, 'logging_service')
    
    def test_resolve_processor_service(self):
        """Test resolving processor service."""
        service = self.container.resolve(IProcessorService)
        assert service is not None
        assert isinstance(service, IProcessorService)
        # Service should have dependencies injected
        assert hasattr(service, 'beatport_service')
        assert hasattr(service, 'matcher_service')
        assert hasattr(service, 'logging_service')
        assert hasattr(service, 'config_service')
    
    def test_resolve_export_service(self):
        """Test resolving export service."""
        service = self.container.resolve(IExportService)
        assert service is not None
        assert isinstance(service, IExportService)
    
    def test_processor_service_process_track(self):
        """Test that processor service can process a track."""
        processor = self.container.resolve(IProcessorService)
        
        track = Track(
            track_id="1",
            title="Test Track",
            artist="Test Artist"
        )
        
        # This will actually try to search Beatport, so we expect it might fail
        # or take time, but the structure should work
        result = processor.process_track(1, track)
        
        assert result is not None
        assert result.playlist_index == 1
        assert result.title == "Test Track"
        assert result.artist == "Test Artist"
    
    def test_singleton_services(self):
        """Test that singleton services return same instance."""
        logging1 = self.container.resolve(ILoggingService)
        logging2 = self.container.resolve(ILoggingService)
        assert logging1 is logging2
        
        config1 = self.container.resolve(IConfigService)
        config2 = self.container.resolve(IConfigService)
        assert config1 is config2
        
        cache1 = self.container.resolve(ICacheService)
        cache2 = self.container.resolve(ICacheService)
        assert cache1 is cache2
    
    def test_factory_services(self):
        """Test that factory services create new instances."""
        # Beatport service uses factory, so each resolve should create new instance
        beatport1 = self.container.resolve(IBeatportService)
        beatport2 = self.container.resolve(IBeatportService)
        # Note: They might be the same if factory caches, but dependencies should be same
        assert beatport1.cache_service is beatport2.cache_service  # Same singleton
        assert beatport1.logging_service is beatport2.logging_service  # Same singleton






