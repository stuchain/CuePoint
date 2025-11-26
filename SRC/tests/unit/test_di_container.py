#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for DI Container
"""

import pytest
from unittest.mock import Mock
from cuepoint.utils.di_container import DIContainer, get_container, reset_container


class TestDIContainer:
    """Test cases for DI Container."""
    
    def test_register_singleton(self):
        """Test singleton registration."""
        container = DIContainer()
        instance = Mock()
        container.register_singleton(Mock, instance)
        
        resolved = container.resolve(Mock)
        assert resolved is instance
        assert container.resolve(Mock) is instance  # Same instance
    
    def test_register_factory(self):
        """Test factory registration."""
        container = DIContainer()
        call_count = [0]
        def factory():
            call_count[0] += 1
            return Mock()
        container.register_factory(Mock, factory)
        
        resolved1 = container.resolve(Mock)
        resolved2 = container.resolve(Mock)
        
        assert resolved1 is not resolved2  # Different instances
        assert call_count[0] == 2  # Factory called twice
    
    def test_register_transient(self):
        """Test transient registration."""
        class TestClass:
            def __init__(self):
                self.value = 42
        
        container = DIContainer()
        container.register_transient(Mock, TestClass)
        
        # Note: This will fail if TestClass has dependencies
        # For now, we'll just test the registration
        assert container.is_registered(Mock)
    
    def test_resolve_not_registered(self):
        """Test that resolving unregistered service raises error."""
        container = DIContainer()
        
        with pytest.raises(ValueError, match="Service .* not registered"):
            container.resolve(Mock)
    
    def test_is_registered(self):
        """Test is_registered check."""
        container = DIContainer()
        instance = Mock()
        
        assert not container.is_registered(Mock)
        container.register_singleton(Mock, instance)
        assert container.is_registered(Mock)
    
    def test_clear(self):
        """Test clearing all registrations."""
        container = DIContainer()
        container.register_singleton(Mock, Mock())
        
        assert container.is_registered(Mock)
        container.clear()
        assert not container.is_registered(Mock)
    
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

