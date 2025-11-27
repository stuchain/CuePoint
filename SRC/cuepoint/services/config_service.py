#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config Service Implementation

Service for managing configuration settings.
"""

from typing import Any, Dict, Optional

from cuepoint.models.config import SETTINGS
from cuepoint.services.interfaces import IConfigService


class ConfigService(IConfigService):
    """Implementation of configuration service."""

    def __init__(self, settings: Optional[Dict[str, Any]] = None):
        """Initialize configuration service.

        Args:
            settings: Optional dictionary of settings. If None, uses default SETTINGS.
        """
        self._settings: Dict[str, Any] = (
            settings.copy() if settings else SETTINGS.copy()
        )

    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value.

        Args:
            key: Configuration key.
            default: Default value if key not found.

        Returns:
            Configuration value or default.
        """
        return self._settings.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set configuration value.

        Args:
            key: Configuration key.
            value: Value to set.
        """
        self._settings[key] = value

    def save(self) -> None:
        """Save configuration to persistent storage."""
        # For now, this is a no-op as settings are in-memory
        # Can be extended to save to YAML file
        pass

    def load(self) -> None:
        """Load configuration from persistent storage."""
        # For now, this is a no-op as settings are loaded from module
        # Can be extended to load from YAML file
        pass

