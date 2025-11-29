#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.8 ConfigService.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError
from cuepoint.models.config_models import AppConfig
from cuepoint.services.config_service import ConfigService


class TestConfigServiceInitialization:
    """Test ConfigService initialization."""

    def test_init_default_config_file(self):
        """Test ConfigService initializes with default config file location."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            assert service.config_file == config_file
            assert isinstance(service.config, AppConfig)

    def test_init_custom_config_file(self):
        """Test ConfigService initializes with custom config file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "custom.yaml"
            service = ConfigService(config_file=config_file)

            assert service.config_file == config_file

    def test_init_loads_defaults(self):
        """Test ConfigService loads default configuration."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Should have default values
            assert service.config.beatport.timeout == 30
            assert service.config.cache.enabled is True
            assert service.config.processing.max_concurrent == 5


class TestConfigServiceGet:
    """Test ConfigService.get() method."""

    def test_get_dot_notation(self):
        """Test get() with dot notation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            assert service.get("beatport.timeout") == 30
            assert service.get("cache.enabled") is True
            assert service.get("processing.max_concurrent") == 5

    def test_get_dot_notation_nested(self):
        """Test get() with nested dot notation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Test nested access
            assert service.get("beatport.base_url") == "https://www.beatport.com"

    def test_get_dot_notation_not_found(self):
        """Test get() with dot notation for non-existent key."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            assert service.get("beatport.nonexistent", default="default") == "default"
            assert service.get("nonexistent.key", default=42) == 42

    def test_get_legacy_flat_key(self):
        """Test get() with legacy flat key."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Legacy keys should work
            value = service.get("MAX_SEARCH_RESULTS")
            assert value is not None  # Should get from legacy settings

    def test_get_legacy_flat_key_not_found(self):
        """Test get() with legacy flat key not found."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            assert service.get("NONEXISTENT_KEY", default="default") == "default"


class TestConfigServiceSet:
    """Test ConfigService.set() method."""

    def test_set_dot_notation(self):
        """Test set() with dot notation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("beatport.timeout", 60)
            assert service.config.beatport.timeout == 60

            service.set("cache.enabled", False)
            assert service.config.cache.enabled is False

    def test_set_legacy_flat_key(self):
        """Test set() with legacy flat key."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("MAX_SEARCH_RESULTS", 100)
            assert service.get("MAX_SEARCH_RESULTS") == 100


class TestConfigServiceFileOperations:
    """Test ConfigService file save/load operations."""

    def test_save_config_file(self):
        """Test save() writes configuration to file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Modify config
            service.set("beatport.timeout", 60)
            service.set("cache.enabled", False)

            # Save
            service.save()

            # Verify file exists and contains correct data
            assert config_file.exists()
            with open(config_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)

            assert data["beatport"]["timeout"] == 60
            assert data["cache"]["enabled"] is False

    def test_load_config_file(self):
        """Test load() reads configuration from file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"

            # Create config file
            config_data = {
                "beatport": {"timeout": 60, "max_retries": 5},
                "cache": {"enabled": False, "max_size": 2000},
            }
            with open(config_file, "w", encoding="utf-8") as f:
                yaml.dump(config_data, f)

            # Load
            service = ConfigService(config_file=config_file)

            # Verify loaded values
            assert service.config.beatport.timeout == 60
            assert service.config.beatport.max_retries == 5
            assert service.config.cache.enabled is False
            assert service.config.cache.max_size == 2000

    def test_load_config_file_invalid_yaml(self):
        """Test load() handles invalid YAML gracefully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"

            # Create invalid YAML file
            with open(config_file, "w", encoding="utf-8") as f:
                f.write("invalid: yaml: content: [unclosed")

            # Should not raise, should use defaults
            service = ConfigService(config_file=config_file)
            # Should still have defaults
            assert service.config.beatport.timeout == 30

    def test_load_config_file_missing(self):
        """Test load() handles missing config file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "nonexistent.yaml"

            # Should not raise, should use defaults
            service = ConfigService(config_file=config_file)
            assert service.config.beatport.timeout == 30


class TestConfigServiceEnvironmentVariables:
    """Test ConfigService environment variable loading."""

    def test_load_from_env_beatport_timeout(self):
        """Test loading beatport timeout from environment."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            with patch.dict(os.environ, {"CUEPOINT_BEATPORT_TIMEOUT": "60"}):
                service = ConfigService(config_file=config_file)
                assert service.config.beatport.timeout == 60

    def test_load_from_env_cache_enabled(self):
        """Test loading cache enabled from environment."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            with patch.dict(os.environ, {"CUEPOINT_CACHE_ENABLED": "false"}):
                service = ConfigService(config_file=config_file)
                assert service.config.cache.enabled is False

    def test_load_from_env_processing_workers(self):
        """Test loading processing workers from environment."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            with patch.dict(os.environ, {"CUEPOINT_PROCESSING_TRACK_WORKERS": "20"}):
                service = ConfigService(config_file=config_file)
                assert service.config.processing.track_workers == 20

    def test_load_from_env_invalid_value(self):
        """Test loading invalid environment variable value."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            with patch.dict(os.environ, {"CUEPOINT_BEATPORT_TIMEOUT": "invalid"}):
                # Should not raise, should skip invalid value
                service = ConfigService(config_file=config_file)
                # Should use default
                assert service.config.beatport.timeout == 30

    def test_load_from_env_priority_over_file(self):
        """Test environment variables override file configuration."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"

            # Create config file with timeout = 50
            config_data = {"beatport": {"timeout": 50}}
            with open(config_file, "w", encoding="utf-8") as f:
                yaml.dump(config_data, f)

            # Set environment variable to 60
            with patch.dict(os.environ, {"CUEPOINT_BEATPORT_TIMEOUT": "60"}):
                service = ConfigService(config_file=config_file)
                # Environment should override file
                assert service.config.beatport.timeout == 60


class TestConfigServiceValidation:
    """Test ConfigService validation."""

    def test_validate_default_config(self):
        """Test validation of default configuration."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            errors = service.validate()
            assert errors == []  # Default config should be valid

    def test_validate_invalid_beatport_timeout(self):
        """Test validation catches invalid beatport timeout."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("beatport.timeout", 0)  # Invalid: must be >= 1
            errors = service.validate()
            assert any("beatport.timeout must be >= 1" in error for error in errors)

    def test_validate_invalid_cache_max_size(self):
        """Test validation catches invalid cache max size."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("cache.max_size", 0)  # Invalid: must be >= 1
            errors = service.validate()
            assert any("cache.max_size must be >= 1" in error for error in errors)

    def test_validate_invalid_processing_max_concurrent(self):
        """Test validation catches invalid processing max concurrent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("processing.max_concurrent", 0)  # Invalid: must be >= 1
            errors = service.validate()
            assert any("processing.max_concurrent must be >= 1" in error for error in errors)

    def test_validate_invalid_logging_level(self):
        """Test validation catches invalid logging level."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("logging.level", "INVALID")  # Invalid level
            errors = service.validate()
            assert any("logging.level must be one of" in error for error in errors)

    def test_validate_invalid_matching_score(self):
        """Test validation catches invalid matching score."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("matching.min_accept_score", 300.0)  # Invalid: must be <= 200
            errors = service.validate()
            assert any("matching.min_accept_score must be between" in error for error in errors)

    def test_validate_multiple_errors(self):
        """Test validation returns multiple errors."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            service.set("beatport.timeout", 0)
            service.set("cache.max_size", 0)
            service.set("processing.max_concurrent", 0)

            errors = service.validate()
            assert len(errors) >= 3


class TestConfigServiceResetToDefaults:
    """Test ConfigService.reset_to_defaults()."""

    def test_reset_to_defaults(self):
        """Test reset_to_defaults() resets configuration."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Modify config
            service.set("beatport.timeout", 60)
            service.set("cache.enabled", False)

            # Reset
            service.reset_to_defaults()

            # Should be back to defaults
            assert service.config.beatport.timeout == 30
            assert service.config.cache.enabled is True

    def test_reset_to_defaults_saves(self):
        """Test reset_to_defaults() saves to file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Modify and save
            service.set("beatport.timeout", 60)
            service.save()

            # Reset
            service.reset_to_defaults()

            # File should be updated
            with open(config_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            assert data["beatport"]["timeout"] == 30


class TestConfigServiceErrorHandling:
    """Test ConfigService error handling."""

    def test_save_permission_error(self):
        """Test save() raises ConfigurationError on permission error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create read-only directory (on Unix)
            config_file = Path(tmpdir) / "readonly" / "config.yaml"
            config_file.parent.mkdir()

            # On Windows, we can't easily create read-only directories
            # So we'll test with a file that can't be written
            if os.name == "nt":
                # On Windows, try to write to a non-existent path in a non-existent drive
                config_file = Path("Z:/nonexistent/config.yaml")
            else:
                # On Unix, make directory read-only
                config_file.parent.chmod(0o444)

            service = ConfigService(config_file=config_file)

            with pytest.raises(ConfigurationError) as exc_info:
                service.save()

            assert "Failed to save configuration" in str(exc_info.value)
            assert exc_info.value.error_code == "CONFIG_SAVE_ERROR"


class TestConfigServiceChangeNotifications:
    """Test ConfigService configuration change notifications."""

    def test_register_change_callback(self):
        """Test registering a change callback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Track changes
            changes = []

            def callback(key: str, old_value: Any, new_value: Any) -> None:
                changes.append((key, old_value, new_value))

            # Register callback
            service.register_change_callback(callback)

            # Make a change
            service.set("beatport.timeout", 60)

            # Verify callback was called
            assert len(changes) == 1
            assert changes[0] == ("beatport.timeout", 30, 60)

    def test_multiple_callbacks(self):
        """Test multiple callbacks are all called."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            changes1 = []
            changes2 = []

            def callback1(key: str, old_value: Any, new_value: Any) -> None:
                changes1.append((key, old_value, new_value))

            def callback2(key: str, old_value: Any, new_value: Any) -> None:
                changes2.append((key, old_value, new_value))

            # Register both callbacks
            service.register_change_callback(callback1)
            service.register_change_callback(callback2)

            # Make a change
            service.set("cache.enabled", False)

            # Verify both callbacks were called
            assert len(changes1) == 1
            assert len(changes2) == 1
            assert changes1[0] == ("cache.enabled", True, False)
            assert changes2[0] == ("cache.enabled", True, False)

    def test_unregister_change_callback(self):
        """Test unregistering a change callback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            changes = []

            def callback(key: str, old_value: Any, new_value: Any) -> None:
                changes.append((key, old_value, new_value))

            # Register and make a change
            service.register_change_callback(callback)
            service.set("beatport.timeout", 60)
            assert len(changes) == 1

            # Unregister and make another change
            service.unregister_change_callback(callback)
            service.set("beatport.timeout", 90)

            # Callback should not be called again
            assert len(changes) == 1  # Still only one change recorded

    def test_callback_with_legacy_key(self):
        """Test callback is called for legacy flat keys."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            changes = []

            def callback(key: str, old_value: Any, new_value: Any) -> None:
                changes.append((key, old_value, new_value))

            service.register_change_callback(callback)

            # Set legacy key
            old_value = service.get("MAX_SEARCH_RESULTS")
            service.set("MAX_SEARCH_RESULTS", 100)

            # Verify callback was called
            assert len(changes) == 1
            assert changes[0][0] == "MAX_SEARCH_RESULTS"
            assert changes[0][1] == old_value
            assert changes[0][2] == 100

    def test_callback_error_handling(self):
        """Test that callback errors don't break the service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            def bad_callback(key: str, old_value: Any, new_value: Any) -> None:
                raise ValueError("Callback error")

            # Register bad callback
            service.register_change_callback(bad_callback)

            # Should not raise, should continue working
            service.set("beatport.timeout", 60)
            assert service.get("beatport.timeout") == 60

    def test_reset_to_defaults_notifies(self):
        """Test that reset_to_defaults() notifies callbacks."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            # Modify config
            service.set("beatport.timeout", 60)
            service.set("cache.enabled", False)

            changes = []

            def callback(key: str, old_value: Any, new_value: Any) -> None:
                changes.append((key, old_value, new_value))

            service.register_change_callback(callback)

            # Reset to defaults
            old_config = service.config
            service.reset_to_defaults()

            # Should notify about reset (key="*" indicates full reset)
            assert len(changes) == 1
            assert changes[0][0] == "*"
            assert changes[0][1] == old_config
            assert isinstance(changes[0][2], AppConfig)

    def test_duplicate_callback_registration(self):
        """Test that registering the same callback twice doesn't duplicate calls."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.yaml"
            service = ConfigService(config_file=config_file)

            changes = []

            def callback(key: str, old_value: Any, new_value: Any) -> None:
                changes.append((key, old_value, new_value))

            # Register callback twice
            service.register_change_callback(callback)
            service.register_change_callback(callback)

            # Make a change
            service.set("beatport.timeout", 60)

            # Should only be called once (no duplicates)
            assert len(changes) == 1

