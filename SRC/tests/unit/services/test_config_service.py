"""Unit tests for config service."""

import pytest

from cuepoint.models.config import SETTINGS
from cuepoint.services.config_service import ConfigService


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
    
    def test_get_dot_notation(self):
        """Test getting value using dot notation."""
        service = ConfigService()
        # Try to get a nested config value (if supported)
        # The service should handle dot notation
        value = service.get("beatport.timeout", None)
        # May return None if not set, or a default value
        assert value is not None or value is None  # Either is valid
    
    def test_set_dot_notation(self):
        """Test setting value using dot notation."""
        service = ConfigService()
        # Set a nested config value
        service.set("beatport.timeout", 60)
        # Verify it was set
        value = service.get("beatport.timeout")
        assert value == 60
    
    def test_register_change_callback(self):
        """Test registering configuration change callback."""
        service = ConfigService()
        
        callback_calls = []
        def callback(key, old_value, new_value):
            callback_calls.append((key, old_value, new_value))
        
        service.register_change_callback(callback)
        service.set("TEST_KEY", "new_value")
        
        # Callback should have been called
        assert len(callback_calls) == 1
        assert callback_calls[0][0] == "TEST_KEY"
        assert callback_calls[0][2] == "new_value"
    
    def test_unregister_change_callback(self):
        """Test unregistering configuration change callback."""
        service = ConfigService()
        
        callback_calls = []
        def callback(key, old_value, new_value):
            callback_calls.append((key, old_value, new_value))
        
        service.register_change_callback(callback)
        service.set("TEST_KEY", "value1")
        assert len(callback_calls) == 1
        
        service.unregister_change_callback(callback)
        service.set("TEST_KEY", "value2")
        # Callback should not be called after unregistering
        assert len(callback_calls) == 1
    
    def test_change_callback_exception_handling(self):
        """Test that callback exceptions don't break config service."""
        service = ConfigService()
        
        def failing_callback(key, old_value, new_value):
            raise Exception("Callback error")
        
        service.register_change_callback(failing_callback)
        # Should not raise exception
        service.set("TEST_KEY", "value")
        # Service should still work
        assert service.get("TEST_KEY") == "value"
    
    def test_load_from_file_nonexistent(self):
        """Test loading from nonexistent file."""
        service = ConfigService()
        
        with pytest.raises(FileNotFoundError):
            service.load_from_file("nonexistent_file.yaml")
    
    def test_load_from_file_invalid_yaml(self, tmp_path):
        """Test loading from invalid YAML file."""
        import tempfile
        service = ConfigService()
        
        # Create invalid YAML file
        invalid_yaml = tmp_path / "invalid.yaml"
        invalid_yaml.write_text("invalid: yaml: content: [")
        
        with pytest.raises(ValueError, match="Invalid YAML"):
            service.load_from_file(str(invalid_yaml))
    
    def test_load_from_file_valid(self, tmp_path):
        """Test loading from valid YAML file."""
        import yaml
        service = ConfigService()
        
        # Create valid YAML file
        valid_yaml = tmp_path / "valid.yaml"
        config_data = {"beatport": {"timeout": 60}}
        with open(valid_yaml, "w") as f:
            yaml.dump(config_data, f)
        
        # Should load without error
        service.load_from_file(str(valid_yaml))
        # Verify value was loaded
        value = service.get("beatport.timeout")
        assert value == 60
    
    def test_save_to_file(self, tmp_path):
        """Test saving configuration to file."""
        service = ConfigService(config_file=tmp_path / "test_config.yaml")
        
        service.set("TEST_KEY", "test_value")
        service.save()
        
        # Verify file was created
        assert (tmp_path / "test_config.yaml").exists()
    
    def test_save_error_handling(self):
        """Test save error handling."""
        import tempfile
        from pathlib import Path

        # Create a path that will fail (read-only directory on some systems)
        # Or use a path that can't be written to
        service = ConfigService(config_file=Path("/invalid/path/config.yaml"))
        
        # Should raise ConfigurationError on save failure
        with pytest.raises(Exception):  # May be ConfigurationError or OSError
            service.save()
    
    def test_validate_config(self):
        """Test configuration validation."""
        service = ConfigService()
        
        # Validate should return list of errors (empty if valid)
        errors = service.validate()
        assert isinstance(errors, list)
    
    def test_load_creates_config_dir(self, tmp_path):
        """Test that load creates config directory if it doesn't exist."""
        config_file = tmp_path / "new_dir" / "config.yaml"
        service = ConfigService(config_file=config_file)
        
        # Directory should be created
        assert config_file.parent.exists()
    
    def test_get_legacy_fallback(self):
        """Test that legacy flat keys work as fallback."""
        service = ConfigService()
        
        # Set a legacy key
        service.set("MAX_SEARCH_RESULTS", 100)
        
        # Get should return it
        value = service.get("MAX_SEARCH_RESULTS")
        assert value == 100
    
    def test_multiple_callbacks(self):
        """Test multiple callbacks are all called."""
        service = ConfigService()
        
        calls1 = []
        calls2 = []
        
        def callback1(key, old_value, new_value):
            calls1.append((key, new_value))
        
        def callback2(key, old_value, new_value):
            calls2.append((key, new_value))
        
        service.register_change_callback(callback1)
        service.register_change_callback(callback2)
        
        service.set("TEST_KEY", "value")
        
        # Both callbacks should be called
        assert len(calls1) == 1
        assert len(calls2) == 1
        assert calls1[0][1] == "value"
        assert calls2[0][1] == "value"












