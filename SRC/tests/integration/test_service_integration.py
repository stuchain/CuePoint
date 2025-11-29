"""Integration tests for service interactions."""

import pytest
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container, reset_container
from cuepoint.services.interfaces import (
    IProcessorService,
    IBeatportService,
    ICacheService,
    IExportService,
    IConfigService,
    ILoggingService,
    IMatcherService
)
from cuepoint.data.rekordbox import RBTrack


@pytest.mark.integration
class TestServiceIntegration:
    """Integration tests for service interactions."""
    
    @pytest.fixture(autouse=True)
    def setup_services(self):
        """Set up services for integration tests."""
        reset_container()
        bootstrap_services()
        yield
        reset_container()
    
    def test_services_registered(self):
        """Test that all services are registered."""
        container = get_container()
        
        assert container.is_registered(IProcessorService)
        assert container.is_registered(IBeatportService)
        assert container.is_registered(ICacheService)
        assert container.is_registered(IExportService)
        assert container.is_registered(IConfigService)
        assert container.is_registered(ILoggingService)
        assert container.is_registered(IMatcherService)
    
    def test_resolve_services(self):
        """Test that services can be resolved."""
        container = get_container()
        
        processor = container.resolve(IProcessorService)
        assert processor is not None
        
        beatport = container.resolve(IBeatportService)
        assert beatport is not None
        
        cache = container.resolve(ICacheService)
        assert cache is not None
        
        config = container.resolve(IConfigService)
        assert config is not None
    
    def test_processor_uses_dependencies(self):
        """Test that processor service uses its dependencies."""
        container = get_container()
        processor = container.resolve(IProcessorService)
        
        # Verify processor has dependencies
        assert hasattr(processor, 'beatport_service')
        assert hasattr(processor, 'matcher_service')
        assert hasattr(processor, 'logging_service')
        assert hasattr(processor, 'config_service')
    
    def test_cache_service_integration(self):
        """Test cache service integration."""
        container = get_container()
        cache = container.resolve(ICacheService)
        
        # Test cache operations
        cache.set("test_key", "test_value")
        value = cache.get("test_key")
        assert value == "test_value"
    
    def test_config_service_integration(self):
        """Test config service integration."""
        container = get_container()
        config = container.resolve(IConfigService)
        
        # Test config operations
        config.set("TEST_KEY", "test_value")
        value = config.get("TEST_KEY")
        assert value == "test_value"






