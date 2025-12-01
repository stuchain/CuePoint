"""Integration tests for ConfigService with real service instances."""

import tempfile
from pathlib import Path

import pytest
import yaml

from cuepoint.services.config_service import ConfigService


class TestConfigServiceIntegration:
    """Integration tests for ConfigService using real service instances."""
    
    @pytest.fixture
    def config_service(self):
        """Create a real config service."""
        return ConfigService()
    
    def test_get_legacy_setting(self, config_service):
        """Test getting legacy flat settings."""
        # Legacy settings should be available
        value = config_service.get("MAX_SEARCH_RESULTS")
        assert value is not None
    
    def test_get_dot_notation_setting(self, config_service):
        """Test getting settings using dot notation."""
        # Try to get a structured config value
        # Note: May return None if not set, but should not raise
        value = config_service.get("beatport.timeout")
        # Should either return a value or None, not raise
        assert value is None or isinstance(value, (int, float))
    
    def test_set_and_get_legacy_setting(self, config_service):
        """Test setting and getting legacy settings."""
        # Set a legacy setting
        config_service.set("TEST_SETTING", "test_value")
        
        # Get it back
        value = config_service.get("TEST_SETTING")
        assert value == "test_value"
    
    def test_set_and_get_dot_notation(self, config_service):
        """Test setting and getting using dot notation."""
        # Set using dot notation
        config_service.set("beatport.timeout", 60)
        
        # Get it back
        value = config_service.get("beatport.timeout")
        assert value == 60
    
    def test_config_change_callback(self, config_service):
        """Test configuration change callbacks."""
        callback_called = []
        
        def callback(key, old_value, new_value):
            callback_called.append((key, old_value, new_value))
        
        # Register callback
        config_service.register_change_callback(callback)
        
        # Change a setting
        config_service.set("TEST_CALLBACK", "new_value")
        
        # Verify callback was called
        assert len(callback_called) == 1
        assert callback_called[0][0] == "TEST_CALLBACK"
        assert callback_called[0][2] == "new_value"
        
        # Unregister callback
        config_service.unregister_change_callback(callback)
        
        # Change again - callback should not be called
        callback_called.clear()
        config_service.set("TEST_CALLBACK", "another_value")
        assert len(callback_called) == 0
    
    def test_config_from_file(self):
        """Test loading configuration from file."""
        # Create a temporary config file
        config_data = {
            "beatport": {
                "timeout": 45
            },
            "processing": {
                "max_concurrent": 5
            }
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(config_data, f)
            config_file = Path(f.name)
        
        try:
            # Create service with config file
            service = ConfigService(config_file=config_file)
            
            # Verify settings from file are loaded
            timeout = service.get("beatport.timeout")
            assert timeout == 45
        finally:
            config_file.unlink(missing_ok=True)
    
    def test_config_validation(self, config_service):
        """Test configuration validation."""
        errors = config_service.validate()
        
        # Should return a list (may be empty if all valid)
        assert isinstance(errors, list)
    
    def test_config_get_with_default(self, config_service):
        """Test getting config with default value."""
        # Get non-existent key with default
        value = config_service.get("NON_EXISTENT_KEY", default="default_value")
        assert value == "default_value"
    
    def test_config_multiple_callbacks(self, config_service):
        """Test multiple configuration change callbacks."""
        callbacks_called = []
        
        def callback1(key, old_value, new_value):
            callbacks_called.append("callback1")
        
        def callback2(key, old_value, new_value):
            callbacks_called.append("callback2")
        
        # Register both callbacks
        config_service.register_change_callback(callback1)
        config_service.register_change_callback(callback2)
        
        # Change a setting
        config_service.set("TEST_MULTIPLE", "value")
        
        # Both callbacks should be called
        assert len(callbacks_called) == 2
        assert "callback1" in callbacks_called
        assert "callback2" in callbacks_called

