#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migration manager for UI transition.

This module provides the MigrationManager class that handles
migration of user data, settings, and preferences from the
old UI to the new UI.
"""

from typing import Optional, Dict, Any
from datetime import datetime
import logging

from PySide6.QtCore import QObject, Signal

from cuepoint.services.interfaces import IConfigService
from cuepoint.utils.di_container import get_container

logger = logging.getLogger(__name__)


class MigrationStatus:
    """Migration status constants."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class MigrationManager(QObject):
    """Manages migration from old UI to new UI.
    
    This class handles the migration of user data, settings,
    and preferences from the old MainWindow to SimpleMainWindow.
    
    Signals:
        migration_complete: Emitted when migration completes successfully
        migration_failed: Emitted when migration fails (error message)
    
    Usage:
        manager = MigrationManager()
        if manager.check_migration_needed():
            data = manager.collect_migration_data()
            success = manager.execute_migration()
    """
    
    migration_complete = Signal()
    migration_failed = Signal(str)  # Error message
    
    def __init__(self, parent: Optional[QObject] = None):
        """Initialize migration manager.
        
        Args:
            parent: Parent QObject
        """
        super().__init__(parent)
        
        try:
            self.config_service: IConfigService = get_container().resolve(IConfigService)
        except Exception as e:
            logger.error(f"Failed to get ConfigService: {e}")
            raise
        
        self.migration_status = MigrationStatus.NOT_STARTED
        self.migration_data: Dict[str, Any] = {}
    
    def check_migration_needed(self) -> bool:
        """Check if migration is needed.
        
        Returns:
            True if migration is needed, False otherwise
            
        Logic:
        - Migration needed if:
          * User has used old UI (ui.old_ui.used = True)
          * Migration not completed (ui.migration.completed = False)
        """
        migration_completed = self.config_service.get("ui.migration.completed", False)
        old_ui_used = self.config_service.get("ui.old_ui.used", False)
        
        needs_migration = old_ui_used and not migration_completed
        
        if needs_migration:
            logger.info("Migration needed: user has used old UI and migration not completed")
        else:
            logger.info("Migration not needed")
        
        return needs_migration
    
    def collect_migration_data(self) -> Dict[str, Any]:
        """Collect data that needs to be migrated.
        
        Returns:
            Dictionary with migration data containing:
            - settings: Application settings
            - preferences: User preferences
            - window_state: Window geometry/state
            - recent_files: Recent files list
            - shortcuts: Keyboard shortcuts
        """
        logger.info("Collecting migration data...")
        
        data = {
            "settings": self._migrate_settings(),
            "preferences": self._migrate_preferences(),
            "window_state": self._migrate_window_state(),
            "recent_files": self._migrate_recent_files(),
            "shortcuts": self._migrate_shortcuts(),
        }
        
        self.migration_data = data
        
        # Log summary
        settings_count = len(data.get("settings", {}))
        prefs_count = len(data.get("preferences", {}))
        recent_count = len(data.get("recent_files", []))
        shortcuts_count = len(data.get("shortcuts", {}))
        
        logger.info(
            f"Collected migration data: {settings_count} settings, "
            f"{prefs_count} preferences, {recent_count} recent files, "
            f"{shortcuts_count} shortcuts"
        )
        
        return data
    
    def _migrate_settings(self) -> Dict[str, Any]:
        """Migrate application settings.
        
        Maps old flat keys to new structured keys.
        
        Returns:
            Dictionary with new setting keys and values
        """
        from cuepoint.ui.migration.migration_utils import map_setting_key
        
        # Get all known old keys from mappings
        from cuepoint.ui.migration.migration_utils import SETTING_KEY_MAPPINGS
        
        migrated = {}
        for old_key in SETTING_KEY_MAPPINGS.keys():
            value = self.config_service.get(old_key)
            if value is not None:
                new_key = map_setting_key(old_key)
                if new_key:
                    migrated[new_key] = value
                    logger.debug(f"Mapped {old_key} -> {new_key}: {value}")
        
        return migrated
    
    def _migrate_preferences(self) -> Dict[str, Any]:
        """Migrate user preferences.
        
        Returns:
            Dictionary with preference keys and values
        """
        preferences = {
            "theme": self.config_service.get("ui.theme", "light"),
            "window_size": self.config_service.get("ui.window.size"),
            "window_position": self.config_service.get("ui.window.position"),
        }
        
        # Filter out None values
        return {k: v for k, v in preferences.items() if v is not None}
    
    def _migrate_window_state(self) -> Dict[str, Any]:
        """Migrate window state.
        
        Returns:
            Dictionary with window state
        """
        return {
            "geometry": self.config_service.get("ui.window.geometry"),
            "maximized": self.config_service.get("ui.window.maximized", False),
        }
    
    def _migrate_recent_files(self) -> list:
        """Migrate recent files list.
        
        Returns:
            List of recent file paths
        """
        recent_files = self.config_service.get("ui.recent_files", [])
        if isinstance(recent_files, list):
            return recent_files
        return []
    
    def _migrate_shortcuts(self) -> Dict[str, str]:
        """Migrate keyboard shortcuts.
        
        Returns:
            Dictionary with shortcut mappings
        """
        shortcuts = self.config_service.get("ui.shortcuts", {})
        if isinstance(shortcuts, dict):
            return shortcuts
        return {}
    
    def execute_migration(self) -> bool:
        """Execute the migration.
        
        Returns:
            True if migration successful, False otherwise
        """
        try:
            self.migration_status = MigrationStatus.IN_PROGRESS
            logger.info("Starting migration...")
            
            # Create backup before migration
            from cuepoint.ui.migration.migration_utils import create_backup
            backup_path = create_backup(self.config_service)
            if backup_path:
                logger.info(f"Backup created: {backup_path}")
            
            # Collect data
            data = self.collect_migration_data()
            
            # Validate data
            from cuepoint.ui.migration.migration_utils import validate_migrated_data
            is_valid, errors = validate_migrated_data(data)
            if not is_valid:
                error_msg = f"Data validation failed: {', '.join(errors)}"
                logger.error(error_msg)
                self.migration_status = MigrationStatus.FAILED
                self.migration_failed.emit(error_msg)
                return False
            
            # Apply migrated data
            self._apply_migrated_data(data)
            
            # Mark migration as complete
            self.config_service.set("ui.migration.completed", True)
            self.config_service.set("ui.migration.date", datetime.now().isoformat())
            if backup_path:
                self.config_service.set("ui.migration.backup_path", str(backup_path))
            self.config_service.save()
            
            self.migration_status = MigrationStatus.COMPLETED
            self.migration_complete.emit()
            
            logger.info("Migration completed successfully")
            return True
            
        except Exception as e:
            self.migration_status = MigrationStatus.FAILED
            error_msg = f"Migration failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            self.migration_failed.emit(error_msg)
            return False
    
    def _apply_migrated_data(self, data: Dict[str, Any]):
        """Apply migrated data to new UI.
        
        Args:
            data: Migration data dictionary
        """
        logger.info("Applying migrated data...")
        
        # Apply settings
        for key, value in data.get("settings", {}).items():
            self.config_service.set(key, value)
            logger.debug(f"Applied setting: {key} = {value}")
        
        # Apply preferences
        for key, value in data.get("preferences", {}).items():
            pref_key = f"ui.{key}"
            self.config_service.set(pref_key, value)
            logger.debug(f"Applied preference: {pref_key} = {value}")
        
        # Apply other data
        if "recent_files" in data:
            self.config_service.set("ui.recent_files", data["recent_files"])
            logger.debug(f"Applied {len(data['recent_files'])} recent files")
        
        if "shortcuts" in data:
            self.config_service.set("ui.shortcuts", data["shortcuts"])
            logger.debug(f"Applied {len(data['shortcuts'])} shortcuts")
        
        logger.info("Migrated data applied successfully")
    
    def rollback_migration(self) -> bool:
        """Rollback migration.
        
        Returns:
            True if rollback successful, False otherwise
        """
        try:
            logger.info("Rolling back migration...")
            
            self.config_service.set("ui.migration.completed", False)
            self.config_service.save()
            
            self.migration_status = MigrationStatus.ROLLED_BACK
            logger.info("Migration rolled back successfully")
            return True
            
        except Exception as e:
            logger.error(f"Rollback failed: {e}", exc_info=True)
            return False
    
    def get_migration_status(self) -> str:
        """Get current migration status.
        
        Returns:
            Migration status string
        """
        return self.migration_status

