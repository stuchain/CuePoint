#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Feature flag system for UI migration.

This module provides a feature flag system that allows switching
between the old UI (MainWindow) and new UI (SimpleMainWindow).
"""

from typing import Optional
from enum import Enum
import logging

from cuepoint.services.interfaces import IConfigService
from cuepoint.utils.di_container import get_container

logger = logging.getLogger(__name__)


class UI_MODE(Enum):
    """UI mode options.
    
    Attributes:
        OLD: Use old UI (MainWindow)
        NEW: Use new UI (SimpleMainWindow)
        AUTO: Auto-detect based on user state
    """
    OLD = "old"
    NEW = "new"
    AUTO = "auto"


class FeatureFlags:
    """Feature flag manager for UI migration.
    
    This class manages the feature flag that determines which UI
    to use. It supports three modes:
    - OLD: Always use old UI
    - NEW: Always use new UI
    - AUTO: Auto-detect based on user state
    
    Usage:
        flags = FeatureFlags()
        if flags.should_use_new_ui():
            window = SimpleMainWindow()
        else:
            window = MainWindow()
    """
    
    def __init__(self):
        """Initialize feature flags.
        
        Gets ConfigService from DI container for storing/retrieving
        UI mode preference.
        """
        try:
            self.config_service: IConfigService = get_container().resolve(IConfigService)
        except Exception as e:
            logger.error(f"Failed to get ConfigService: {e}")
            raise
    
    def get_ui_mode(self) -> UI_MODE:
        """Get current UI mode.
        
        Returns:
            UI_MODE enum value
            
        Examples:
            >>> flags = FeatureFlags()
            >>> flags.get_ui_mode()
            <UI_MODE.AUTO: 'auto'>
        """
        mode_str = self.config_service.get("ui.mode", "auto")
        
        # Auto mode logic
        if mode_str == "auto":
            return self._auto_detect_ui_mode()
        
        try:
            return UI_MODE(mode_str)
        except ValueError:
            logger.warning(f"Invalid UI mode '{mode_str}', defaulting to AUTO")
            return UI_MODE.AUTO
    
    def set_ui_mode(self, mode: UI_MODE) -> None:
        """Set UI mode.
        
        Args:
            mode: UI_MODE enum value
            
        Examples:
            >>> flags = FeatureFlags()
            >>> flags.set_ui_mode(UI_MODE.NEW)
        """
        self.config_service.set("ui.mode", mode.value)
        self.config_service.save()
        logger.info(f"UI mode set to {mode.value}")
    
    def should_use_new_ui(self) -> bool:
        """Determine if new UI should be used.
        
        Returns:
            True if new UI should be used, False otherwise
            
        Examples:
            >>> flags = FeatureFlags()
            >>> flags.should_use_new_ui()
            True
        """
        mode = self.get_ui_mode()
        return mode == UI_MODE.NEW or (mode == UI_MODE.AUTO and self._auto_detect_new_ui())
    
    def _auto_detect_ui_mode(self) -> UI_MODE:
        """Auto-detect UI mode based on user state.
        
        Logic:
        - New users (no old UI usage) → NEW UI
        - Existing users with completed migration → NEW UI
        - Existing users without migration → OLD UI
        
        Returns:
            UI_MODE enum value
        """
        # Check if user is new (no old UI usage)
        old_ui_used = self.config_service.get("ui.old_ui.used", False)
        
        # New users get new UI
        if not old_ui_used:
            logger.info("New user detected, using NEW UI")
            return UI_MODE.NEW
        
        # Existing users: check migration status
        migration_completed = self.config_service.get("ui.migration.completed", False)
        if migration_completed:
            logger.info("Migration completed, using NEW UI")
            return UI_MODE.NEW
        else:
            logger.info("Existing user without migration, using OLD UI")
            return UI_MODE.OLD
    
    def _auto_detect_new_ui(self) -> bool:
        """Auto-detect if new UI should be used.
        
        Returns:
            True if new UI should be used
        """
        mode = self._auto_detect_ui_mode()
        return mode == UI_MODE.NEW

