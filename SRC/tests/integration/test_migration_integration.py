#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for migration system.
"""

import pytest
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication

from cuepoint.ui.migration.feature_flags import FeatureFlags, UI_MODE
from cuepoint.ui.migration.migration_manager import MigrationManager, MigrationStatus
from cuepoint.ui.migration.migration_wizard import MigrationWizard


@pytest.fixture(scope="session")
def qapp():
    """Create QApplication for widget tests."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


class TestMigrationIntegration:
    """Integration tests for migration system."""
    
    @pytest.fixture
    def mock_config_service(self):
        """Create a mock ConfigService."""
        config = Mock()
        config.get = Mock(return_value=None)
        config.set = Mock()
        config.save = Mock()
        return config
    
    def test_new_user_flow(self, qapp, mock_config_service):
        """Test that new user gets new UI, no migration."""
        with patch('cuepoint.ui.migration.feature_flags.get_container') as mock_flags_container, \
             patch('cuepoint.ui.migration.migration_manager.get_container') as mock_mgr_container:
            mock_flags_container.return_value.resolve.return_value = mock_config_service
            mock_mgr_container.return_value.resolve.return_value = mock_config_service
            
            def get_side_effect(key, default=None):
                if key == "ui.mode":
                    return "auto"
                elif key == "ui.old_ui.used":
                    return False  # New user
                elif key == "ui.migration.completed":
                    return False
                return default
            
            mock_config_service.get.side_effect = get_side_effect
            
            flags = FeatureFlags()
            assert flags.should_use_new_ui() is True
            
            manager = MigrationManager()
            assert manager.check_migration_needed() is False
    
    def test_existing_user_migration_flow(self, qapp, mock_config_service):
        """Test that existing user sees migration wizard."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            
            def get_side_effect(key, default=None):
                if key == "ui.old_ui.used":
                    return True  # Existing user
                elif key == "ui.migration.completed":
                    return False  # Not migrated
                return default
            
            mock_config_service.get.side_effect = get_side_effect
            
            manager = MigrationManager()
            assert manager.check_migration_needed() is True
    
    def test_skip_migration_flow(self, qapp, mock_config_service):
        """Test that user can skip migration."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            
            def get_side_effect(key, default=None):
                if key == "ui.old_ui.used":
                    return True  # Existing user
                elif key == "ui.migration.completed":
                    return False  # Not migrated
                return default
            
            mock_config_service.get.side_effect = get_side_effect
            
            manager = MigrationManager()
            # User skips migration, old UI usage is tracked
            mock_config_service.set("ui.old_ui.used", True)
            mock_config_service.save()
            
            # Migration still needed
            assert manager.check_migration_needed() is True
    
    def test_migration_rollback(self, qapp, mock_config_service):
        """Test that migration can be rolled back."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            
            manager = MigrationManager()
            
            # Mark migration as completed
            mock_config_service.set("ui.migration.completed", True)
            mock_config_service.save()
            
            # Rollback
            success = manager.rollback_migration()
            assert success is True
            assert manager.migration_status == MigrationStatus.ROLLED_BACK
    
    def test_settings_persistence(self, qapp, mock_config_service):
        """Test that settings persist after migration."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            
            # Set some old settings
            mock_config_service.get = Mock(side_effect=lambda k, d=None: {
                "algorithm": "fuzzy",
                "confidence_threshold": 0.8,
            }.get(k, d))
            
            manager = MigrationManager()
            data = manager.collect_migration_data()
            
            # Verify settings are collected
            assert "settings" in data
            assert len(data["settings"]) > 0
    
    def test_data_integrity(self, qapp, mock_config_service):
        """Test that all data is migrated correctly."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            
            from cuepoint.ui.migration.migration_utils import validate_migrated_data
            
            # Valid migration data
            data = {
                "settings": {"processing.algorithm": "fuzzy"},
                "preferences": {"theme": "dark"},
                "recent_files": ["/path/to/file.xml"],
                "shortcuts": {"Ctrl+S": "save"},
            }
            
            is_valid, errors = validate_migrated_data(data)
            assert is_valid is True
            assert len(errors) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

