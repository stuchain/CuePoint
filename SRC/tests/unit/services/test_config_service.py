"""Unit tests for config service."""

import pytest
from cuepoint.services.config_service import ConfigService
from cuepoint.models.config import SETTINGS


class TestConfigService:
    """Test config service."""
    
    def test_get_default(self):
        """Test getting default value."""
        service = ConfigService()
        value = service.get("NONEXISTENT_KEY", "default")
        assert value == "default"
    
    def test_get_existing(self):
        """Test getting existing setting."""
        service = ConfigService()
        # Use a known setting from SETTINGS
        value = service.get("TITLE_WEIGHT")
        assert value is not None
    
    def test_set_get(self):
        """Test setting and getting value."""
        service = ConfigService()
        service.set("TEST_KEY", "test_value")
        assert service.get("TEST_KEY") == "test_value"
    
    def test_set_overwrite(self):
        """Test overwriting existing value."""
        service = ConfigService()
        service.set("TEST_KEY", "value1")
        service.set("TEST_KEY", "value2")
        assert service.get("TEST_KEY") == "value2"
    
    def test_save_load(self):
        """Test save and load operations."""
        service = ConfigService()
        # These are no-ops for now, but should not raise errors
        service.save()
        service.load()
    
    def test_custom_settings(self):
        """Test service with custom settings."""
        custom_settings = {"TEST_KEY": "test_value"}
        service = ConfigService(settings=custom_settings)
        assert service.get("TEST_KEY") == "test_value"
    
    def test_get_with_default_from_settings(self):
        """Test getting value with default from SETTINGS."""
        service = ConfigService()
        # Get a known setting
        value = service.get("TITLE_WEIGHT", 0.5)
        assert value == SETTINGS.get("TITLE_WEIGHT")

