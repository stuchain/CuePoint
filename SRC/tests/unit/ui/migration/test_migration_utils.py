#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for migration utilities.
"""

import pytest
from unittest.mock import Mock
from pathlib import Path

from cuepoint.ui.migration.migration_utils import (
    map_setting_key,
    validate_migrated_data,
    create_backup,
    restore_from_backup,
    get_migration_summary,
)


class TestMigrationUtils:
    """Test cases for migration utility functions."""
    
    def test_map_setting_key_processing(self):
        """Test that processing settings map correctly."""
        assert map_setting_key("algorithm") == "processing.algorithm"
        assert map_setting_key("confidence_threshold") == "processing.confidence_threshold"
        assert map_setting_key("max_results") == "processing.max_results"
    
    def test_map_setting_key_ui(self):
        """Test that UI settings stay same."""
        assert map_setting_key("ui.theme") == "ui.theme"
        assert map_setting_key("ui.window.size") == "ui.window.size"
        assert map_setting_key("ui.recent_files") == "ui.recent_files"
    
    def test_map_setting_key_unknown(self):
        """Test that unknown keys return None."""
        assert map_setting_key("unknown_key") is None
        assert map_setting_key("random_setting") is None
    
    def test_validate_migrated_data_valid(self):
        """Test that valid data passes validation."""
        data = {
            "settings": {"processing.algorithm": "fuzzy"},
            "preferences": {"theme": "dark"},
            "recent_files": ["/path/to/file.xml"],
            "shortcuts": {"Ctrl+S": "save"},
        }
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is True
        assert len(errors) == 0
    
    def test_validate_migrated_data_invalid(self):
        """Test that invalid data fails validation."""
        data = {
            "settings": "not a dict",  # Invalid
            "preferences": {"theme": "invalid_theme"},  # Invalid theme
        }
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is False
        assert len(errors) > 0
    
    def test_validate_migrated_data_algorithm(self):
        """Test that algorithm validation works."""
        # Valid algorithm
        data = {"settings": {"processing.algorithm": "fuzzy"}}
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is True
        
        # Invalid algorithm
        data = {"settings": {"processing.algorithm": "invalid"}}
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is False
        assert any("algorithm" in error.lower() for error in errors)
    
    def test_validate_migrated_data_theme(self):
        """Test that theme validation works."""
        # Valid theme
        data = {"preferences": {"theme": "dark"}}
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is True
        
        # Invalid theme
        data = {"preferences": {"theme": "invalid_theme"}}
        is_valid, errors = validate_migrated_data(data)
        assert is_valid is False
        assert any("theme" in error.lower() for error in errors)
    
    def test_create_backup(self, tmp_path, monkeypatch):
        """Test that backup creation works."""
        # Change to temp directory
        monkeypatch.chdir(tmp_path)
        
        from cuepoint.services.interfaces import IConfigService
        
        mock_config_service = Mock(spec=IConfigService)
        mock_config_service.get = Mock(return_value="test_value")
        
        backup_path = create_backup(mock_config_service)
        
        assert backup_path is not None
        assert backup_path.exists()
        assert backup_path.suffix == ".json"
        
        # Verify backup content
        import json
        with open(backup_path, 'r') as f:
            backup_data = json.load(f)
        
        assert "timestamp" in backup_data
        assert "version" in backup_data
        assert "settings" in backup_data
    
    def test_restore_from_backup(self, tmp_path, monkeypatch):
        """Test that backup restoration works."""
        # Change to temp directory
        monkeypatch.chdir(tmp_path)
        
        from cuepoint.services.interfaces import IConfigService
        
        # Create a backup file
        backup_path = tmp_path / "test_backup.json"
        backup_data = {
            "timestamp": "2024-01-01T12:00:00",
            "version": "1.0",
            "settings": {
                "ui.theme": "dark",
                "algorithm": "fuzzy",
            }
        }
        
        import json
        with open(backup_path, 'w') as f:
            json.dump(backup_data, f)
        
        mock_config_service = Mock(spec=IConfigService)
        mock_config_service.set = Mock()
        mock_config_service.save = Mock()
        
        success = restore_from_backup(backup_path, mock_config_service)
        
        assert success is True
        assert mock_config_service.set.call_count == 2
        mock_config_service.save.assert_called_once()
    
    def test_get_migration_summary(self):
        """Test that summary generation works."""
        data = {
            "settings": {"processing.algorithm": "fuzzy"},
            "preferences": {"theme": "dark"},
            "recent_files": ["/path/to/file1.xml", "/path/to/file2.xml"],
            "shortcuts": {"Ctrl+S": "save"},
        }
        
        summary = get_migration_summary(data)
        
        assert "1 setting" in summary
        assert "1 preference" in summary
        assert "2 recent files" in summary
        assert "1 shortcut" in summary
    
    def test_get_migration_summary_empty(self):
        """Test that empty data returns appropriate summary."""
        data = {}
        summary = get_migration_summary(data)
        assert summary == "No data to migrate"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

