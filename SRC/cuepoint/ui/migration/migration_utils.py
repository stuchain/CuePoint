#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Utility functions for UI migration.

This module provides utility functions for migrating settings,
validating data, and managing backups during migration.
"""

from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)


# Mapping from old setting keys to new setting keys
# These mappings will be updated based on actual analysis of MainWindow
SETTING_KEY_MAPPINGS = {
    # Processing settings (flat → structured)
    "algorithm": "processing.algorithm",
    "confidence_threshold": "processing.confidence_threshold",
    "max_results": "processing.max_results",
    "timeout": "processing.timeout",
    "retry_count": "processing.retry_count",
    
    # Export settings (flat → structured)
    "export_format": "export.format",
    "export_path": "export.path",
    "include_metadata": "export.include_metadata",
    
    # UI settings (may stay the same)
    "ui.theme": "ui.theme",  # Same
    "ui.window.size": "ui.window.size",  # Same
    "ui.window.position": "ui.window.position",  # Same
    "ui.window.maximized": "ui.window.maximized",  # Same
    "ui.window.geometry": "ui.window.geometry",  # Same
    
    # Recent files (same)
    "ui.recent_files": "ui.recent_files",  # Same
    
    # Shortcuts (same)
    "ui.shortcuts": "ui.shortcuts",  # Same
    
    # Add more mappings as needed based on analysis
}


def map_setting_key(old_key: str) -> Optional[str]:
    """Map old setting key to new setting key.
    
    Args:
        old_key: Old setting key
        
    Returns:
        New setting key, or None if no mapping exists
        If key already uses dot notation and exists in mappings, returns mapped value
        If key doesn't exist in mappings, returns original key if it starts with "ui."
        Otherwise returns None
        
    Examples:
        >>> map_setting_key("algorithm")
        "processing.algorithm"
        >>> map_setting_key("ui.theme")
        "ui.theme"
        >>> map_setting_key("unknown_key")
        None
    """
    # Check if key exists in mappings
    if old_key in SETTING_KEY_MAPPINGS:
        return SETTING_KEY_MAPPINGS[old_key]
    
    # If key already uses structured notation and starts with "ui.", keep it
    if old_key.startswith("ui."):
        return old_key
    
    # Unknown key, return None
    return None


def validate_migrated_data(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Validate migrated data.
    
    Args:
        data: Migrated data dictionary
        
    Returns:
        Tuple of (is_valid, error_messages)
        - is_valid: True if data is valid, False otherwise
        - error_messages: List of error messages (empty if valid)
        
    Examples:
        >>> data = {"settings": {"processing.algorithm": "fuzzy"}}
        >>> is_valid, errors = validate_migrated_data(data)
        >>> is_valid
        True
    """
    errors = []
    
    # Validate settings
    if "settings" in data:
        if not isinstance(data["settings"], dict):
            errors.append("Settings must be a dictionary")
        else:
            for key, value in data["settings"].items():
                if not isinstance(key, str):
                    errors.append(f"Invalid setting key type: {key}")
                if value is None:
                    errors.append(f"Setting {key} has None value")
                # Validate specific setting values
                if key == "processing.algorithm":
                    valid_algorithms = ["exact", "fuzzy", "hybrid"]
                    if value not in valid_algorithms:
                        errors.append(f"Invalid algorithm: {value}")
    
    # Validate preferences
    if "preferences" in data:
        if not isinstance(data["preferences"], dict):
            errors.append("Preferences must be a dictionary")
        else:
            preferences = data["preferences"]
            if "theme" in preferences:
                valid_themes = ["light", "dark", "auto"]
                if preferences["theme"] not in valid_themes:
                    errors.append(f"Invalid theme: {preferences['theme']}")
    
    # Validate recent files
    if "recent_files" in data:
        if not isinstance(data["recent_files"], list):
            errors.append("Recent files must be a list")
        else:
            for file_path in data["recent_files"]:
                if not isinstance(file_path, (str, Path)):
                    errors.append(f"Invalid recent file path: {file_path}")
    
    # Validate shortcuts
    if "shortcuts" in data:
        if not isinstance(data["shortcuts"], dict):
            errors.append("Shortcuts must be a dictionary")
        else:
            for key, value in data["shortcuts"].items():
                if not isinstance(key, str) or not isinstance(value, str):
                    errors.append(f"Invalid shortcut mapping: {key} -> {value}")
    
    return len(errors) == 0, errors


def create_backup(config_service) -> Optional[Path]:
    """Create backup of current settings.
    
    Args:
        config_service: ConfigService instance
        
    Returns:
        Path to backup file if successful, None otherwise
        
    Examples:
        >>> backup_path = create_backup(config_service)
        >>> backup_path
        Path('migration_backup_2024-01-01_12-00-00.json')
    """
    try:
        from cuepoint.services.interfaces import IConfigService
        
        if not isinstance(config_service, IConfigService):
            logger.error("Invalid config service type")
            return None
        
        # Collect all settings
        backup_data = {
            "timestamp": datetime.now().isoformat(),
            "version": "1.0",
            "settings": _collect_all_settings(config_service),
        }
        
        # Create backup file
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_path = Path(f"migration_backup_{timestamp}.json")
        
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2, default=str)
        
        logger.info(f"Backup created at {backup_path}")
        return backup_path
        
    except Exception as e:
        logger.error(f"Failed to create backup: {e}", exc_info=True)
        return None


def _collect_all_settings(config_service) -> Dict[str, Any]:
    """Collect all settings from config service.
    
    Args:
        config_service: ConfigService instance
        
    Returns:
        Dictionary with all settings
    """
    # This is a simplified version - in reality, we'd need to
    # iterate through all possible keys or use a method to get all settings
    # For now, we'll collect known keys
    
    settings = {}
    
    # Known setting keys to backup
    known_keys = [
        "algorithm",
        "confidence_threshold",
        "max_results",
        "timeout",
        "retry_count",
        "ui.theme",
        "ui.window.size",
        "ui.window.position",
        "ui.window.maximized",
        "ui.window.geometry",
        "ui.recent_files",
        "ui.shortcuts",
        "processing.algorithm",
        "processing.confidence_threshold",
        "processing.max_results",
        "processing.timeout",
        "processing.retry_count",
    ]
    
    for key in known_keys:
        value = config_service.get(key)
        if value is not None:
            settings[key] = value
    
    return settings


def restore_from_backup(backup_path: Path, config_service) -> bool:
    """Restore settings from backup.
    
    Args:
        backup_path: Path to backup file
        config_service: ConfigService instance
        
    Returns:
        True if restore successful, False otherwise
        
    Examples:
        >>> backup_path = Path("migration_backup_2024-01-01_12-00-00.json")
        >>> restore_from_backup(backup_path, config_service)
        True
    """
    try:
        from cuepoint.services.interfaces import IConfigService
        
        if not isinstance(config_service, IConfigService):
            logger.error("Invalid config service type")
            return False
        
        if not backup_path.exists():
            logger.error(f"Backup file not found: {backup_path}")
            return False
        
        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        # Restore settings
        settings = backup_data.get("settings", {})
        for key, value in settings.items():
            config_service.set(key, value)
        
        config_service.save()
        logger.info(f"Settings restored from backup: {backup_path}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to restore from backup: {e}", exc_info=True)
        return False


def get_migration_summary(migration_data: Dict[str, Any]) -> str:
    """Get human-readable migration summary.
    
    Args:
        migration_data: Migration data dictionary
        
    Returns:
        Summary string
        
    Examples:
        >>> data = {"settings": {"processing.algorithm": "fuzzy"}, "preferences": {"theme": "dark"}}
        >>> get_migration_summary(data)
        "1 setting, 1 preference"
    """
    summary_parts = []
    
    if "settings" in migration_data:
        count = len(migration_data["settings"])
        if count > 0:
            summary_parts.append(f"{count} setting{'s' if count != 1 else ''}")
    
    if "preferences" in migration_data:
        count = len(migration_data["preferences"])
        if count > 0:
            summary_parts.append(f"{count} preference{'s' if count != 1 else ''}")
    
    if "recent_files" in migration_data:
        count = len(migration_data["recent_files"])
        if count > 0:
            summary_parts.append(f"{count} recent file{'s' if count != 1 else ''}")
    
    if "shortcuts" in migration_data:
        count = len(migration_data["shortcuts"])
        if count > 0:
            summary_parts.append(f"{count} shortcut{'s' if count != 1 else ''}")
    
    return ", ".join(summary_parts) if summary_parts else "No data to migrate"

