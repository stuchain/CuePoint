"""Unit tests for DI container."""

import pytest
from cuepoint.utils.di_container import DIContainer, get_container, reset_container


class TestDIContainer:
    """Test dependency injection container."""
    
    def test_register_singleton(self):
        """Test registering singleton."""
        container = DIContainer()
        instance = object()
        container.register_singleton(str, instance)
        
        resolved = container.resolve(str)
        assert resolved is instance
    
    def test_register_factory(self):
        """Test registering factory."""
        container = DIContainer()
        container.register_factory(str, lambda: "factory_result")
        
        resolved = container.resolve(str)
        assert resolved == "factory_result"
    
    def test_register_transient(self):
        """Test registering transient service."""
        class TestService:
            pass
        
        container = DIContainer()
        container.register_transient(TestService, TestService)
        
        instance1 = container.resolve(TestService)
        instance2 = container.resolve(TestService)
        
        # Transient should create new instances
        assert instance1 is not instance2
        assert isinstance(instance1, TestService)
        assert isinstance(instance2, TestService)
    
    def test_resolve_nonexistent(self):
        """Test resolving nonexistent service."""
        container = DIContainer()
        with pytest.raises(ValueError):
            container.resolve(str)
    
    def test_is_registered(self):
        """Test checking if service is registered."""
        container = DIContainer()
        assert container.is_registered(str) is False
        
        container.register_singleton(str, "value")
        assert container.is_registered(str) is True
    
    def test_clear(self):
        """Test clearing container."""
        container = DIContainer()
        container.register_singleton(str, "value")
        container.clear()
        
        assert container.is_registered(str) is False
    
    def test_get_container_singleton(self):
        """Test that get_container returns singleton."""
        reset_container()
        container1 = get_container()
        container2 = get_container()
        
        assert container1 is container2
    
    def test_reset_container(self):
        """Test resetting global container."""
        container1 = get_container()
        reset_container()
        container2 = get_container()
        
        assert container1 is not container2






















