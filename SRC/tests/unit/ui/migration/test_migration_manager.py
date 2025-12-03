#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for migration manager.
"""

import pytest
from unittest.mock import Mock, patch
from PySide6.QtCore import QObject

from cuepoint.ui.migration.migration_manager import MigrationManager, MigrationStatus


class TestMigrationManager:
    """Test cases for MigrationManager class."""
    
    @pytest.fixture
    def mock_config_service(self):
        """Create a mock ConfigService."""
        config = Mock()
        config.get = Mock(return_value=None)
        config.set = Mock()
        config.save = Mock()
        return config
    
    @pytest.fixture
    def migration_manager(self, mock_config_service):
        """Create MigrationManager instance with mocked ConfigService."""
        with patch('cuepoint.ui.migration.migration_manager.get_container') as mock_container:
            mock_container.return_value.resolve.return_value = mock_config_service
            return MigrationManager()
    
    def test_init(self, migration_manager, mock_config_service):
        """Test that MigrationManager initializes correctly."""
        assert migration_manager is not None
        assert migration_manager.migration_status == MigrationStatus.NOT_STARTED
        assert migration_manager.config_service == mock_config_service
    
    def test_check_migration_needed_new_user(self, migration_manager, mock_config_service):
        """Test that new user doesn't need migration."""
        def get_side_effect(key, default=None):
            if key == "ui.old_ui.used":
                return False  # New user
            elif key == "ui.migration.completed":
                return False
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        assert migration_manager.check_migration_needed() is False
    
    def test_check_migration_needed_existing_user(self, migration_manager, mock_config_service):
        """Test that existing user needs migration."""
        def get_side_effect(key, default=None):
            if key == "ui.old_ui.used":
                return True  # Existing user
            elif key == "ui.migration.completed":
                return False  # Not migrated
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        assert migration_manager.check_migration_needed() is True
    
    def test_check_migration_needed_migrated_user(self, migration_manager, mock_config_service):
        """Test that migrated user doesn't need migration."""
        def get_side_effect(key, default=None):
            if key == "ui.old_ui.used":
                return True  # Existing user
            elif key == "ui.migration.completed":
                return True  # Already migrated
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        assert migration_manager.check_migration_needed() is False
    
    def test_collect_migration_data(self, migration_manager, mock_config_service):
        """Test that migration data is collected."""
        mock_config_service.get.return_value = None
        data = migration_manager.collect_migration_data()
        
        assert "settings" in data
        assert "preferences" in data
        assert "window_state" in data
        assert "recent_files" in data
        assert "shortcuts" in data
    
    def test_migrate_settings(self, migration_manager, mock_config_service):
        """Test that settings migrate correctly."""
        def get_side_effect(key, default=None):
            if key == "algorithm":
                return "fuzzy"
            elif key == "confidence_threshold":
                return 0.8
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        settings = migration_manager._migrate_settings()
        
        assert "processing.algorithm" in settings
        assert settings["processing.algorithm"] == "fuzzy"
        assert "processing.confidence_threshold" in settings
        assert settings["processing.confidence_threshold"] == 0.8
    
    def test_migrate_preferences(self, migration_manager, mock_config_service):
        """Test that preferences migrate correctly."""
        def get_side_effect(key, default=None):
            if key == "ui.theme":
                return "dark"
            elif key == "ui.window.size":
                return (800, 600)
            return default
        
        mock_config_service.get.side_effect = get_side_effect
        preferences = migration_manager._migrate_preferences()
        
        assert "theme" in preferences
        assert preferences["theme"] == "dark"
        assert "window_size" in preferences
        assert preferences["window_size"] == (800, 600)
    
    def test_execute_migration(self, migration_manager, mock_config_service):
        """Test that migration executes successfully."""
        mock_config_service.get.return_value = None
        
        success = migration_manager.execute_migration()
        
        assert success is True
        assert migration_manager.migration_status == MigrationStatus.COMPLETED
        mock_config_service.set.assert_any_call("ui.migration.completed", True)
        mock_config_service.save.assert_called()
    
    def test_execute_migration_failure(self, migration_manager, mock_config_service):
        """Test that migration handles failure."""
        mock_config_service.get.side_effect = Exception("Test error")
        
        success = migration_manager.execute_migration()
        
        assert success is False
        assert migration_manager.migration_status == MigrationStatus.FAILED
    
    def test_rollback_migration(self, migration_manager, mock_config_service):
        """Test that rollback works."""
        success = migration_manager.rollback_migration()
        
        assert success is True
        assert migration_manager.migration_status == MigrationStatus.ROLLED_BACK
        mock_config_service.set.assert_called_with("ui.migration.completed", False)
        mock_config_service.save.assert_called()
    
    def test_get_migration_status(self, migration_manager):
        """Test that status tracking works."""
        status = migration_manager.get_migration_status()
        assert status == MigrationStatus.NOT_STARTED
        
        migration_manager.migration_status = MigrationStatus.COMPLETED
        status = migration_manager.get_migration_status()
        assert status == MigrationStatus.COMPLETED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

