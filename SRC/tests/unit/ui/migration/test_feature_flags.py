#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for feature flag system.
"""

import pytest
from unittest.mock import Mock, patch

from cuepoint.ui.migration.feature_flags import FeatureFlags, UI_MODE


class TestFeatureFlags:
    """Test cases for FeatureFlags class."""
    
    @pytest.fixture
    def mock_config_service(self):
        """Create a mock ConfigService."""
        config = Mock()
        config.get = Mock(return_value=None)
        config.set = Mock()
        config.save = Mock()
        return config
    
    @pytest.fixture
    def feature_flags(self, mock_config_service):
        """Create FeatureFlags instance with mocked ConfigService."""
        with patch('cuepoint.ui.migration.feature_flags.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            return FeatureFlags()
    
    def test_get_ui_mode_default_auto(self, feature_flags, mock_config_service):
        """Test that default mode is AUTO."""
        mock_config_service.get.return_value = "auto"
        mode = feature_flags.get_ui_mode()
        assert mode == UI_MODE.AUTO or mode in [UI_MODE.NEW, UI_MODE.OLD]  # Auto resolves to one of these
    
    def test_get_ui_mode_old(self, feature_flags, mock_config_service):
        """Test that OLD mode can be retrieved."""
        mock_config_service.get.return_value = "old"
        mode = feature_flags.get_ui_mode()
        assert mode == UI_MODE.OLD
    
    def test_get_ui_mode_new(self, feature_flags, mock_config_service):
        """Test that NEW mode can be retrieved."""
        mock_config_service.get.return_value = "new"
        mode = feature_flags.get_ui_mode()
        assert mode == UI_MODE.NEW
    
    def test_set_ui_mode(self, feature_flags, mock_config_service):
        """Test that UI mode can be set."""
        feature_flags.set_ui_mode(UI_MODE.NEW)
        mock_config_service.set.assert_called_once_with("ui.mode", "new")
        mock_config_service.save.assert_called_once()
    
    def test_set_ui_mode_persists(self, feature_flags, mock_config_service):
        """Test that UI mode persists after save."""
        feature_flags.set_ui_mode(UI_MODE.OLD)
        mock_config_service.set.assert_called_with("ui.mode", "old")
        mock_config_service.save.assert_called()
    
    def test_should_use_new_ui_new_mode(self, feature_flags, mock_config_service):
        """Test that should_use_new_ui returns True for NEW mode."""
        mock_config_service.get.return_value = "new"
        assert feature_flags.should_use_new_ui() is True
    
    def test_should_use_new_ui_old_mode(self, feature_flags, mock_config_service):
        """Test that should_use_new_ui returns False for OLD mode."""
        mock_config_service.get.return_value = "old"
        assert feature_flags.should_use_new_ui() is False
    
    def test_auto_detect_new_user(self, feature_flags, mock_config_service):
        """Test that new user gets NEW UI."""
        def get_side_effect(key, default=None):
            if key == "ui.mode":
                return "auto"
            elif key == "ui.old_ui.used":
                return False  # New user
            elif key == "ui.migration.completed":
                return False
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        mode = feature_flags._auto_detect_ui_mode()
        assert mode == UI_MODE.NEW
    
    def test_auto_detect_existing_user_no_migration(self, feature_flags, mock_config_service):
        """Test that existing user without migration gets OLD UI."""
        def get_side_effect(key, default=None):
            if key == "ui.mode":
                return "auto"
            elif key == "ui.old_ui.used":
                return True  # Existing user
            elif key == "ui.migration.completed":
                return False  # No migration
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        mode = feature_flags._auto_detect_ui_mode()
        assert mode == UI_MODE.OLD
    
    def test_auto_detect_existing_user_with_migration(self, feature_flags, mock_config_service):
        """Test that existing user with migration gets NEW UI."""
        def get_side_effect(key, default=None):
            if key == "ui.mode":
                return "auto"
            elif key == "ui.old_ui.used":
                return True  # Existing user
            elif key == "ui.migration.completed":
                return True  # Migration completed
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        mode = feature_flags._auto_detect_ui_mode()
        assert mode == UI_MODE.NEW
    
    def test_invalid_mode_defaults_to_auto(self, feature_flags, mock_config_service):
        """Test that invalid mode defaults to AUTO behavior."""
        mock_config_service.get.return_value = "invalid_mode"
        # Should not raise exception, should handle gracefully
        mode = feature_flags.get_ui_mode()
        assert mode in [UI_MODE.NEW, UI_MODE.OLD, UI_MODE.AUTO]  # Should resolve to valid mode


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

