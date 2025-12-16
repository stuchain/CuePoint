#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Icon Manager (Step 9.6)

Centralized icon management system for consistent icon usage.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional

from PySide6.QtGui import QIcon, QPixmap

logger = logging.getLogger(__name__)


class IconManager:
    """Centralized icon management system."""

    _instance: Optional["IconManager"] = None
    _icons: Dict[str, QIcon] = {}
    _icon_paths: Dict[str, Path] = {}

    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize icon manager and load icons."""
        # Try multiple possible icon base paths
        possible_paths = [
            Path("SRC/cuepoint/ui/assets/icons"),
            Path("SRC/cuepoint/ui/icons"),
            Path("assets/icons"),
            Path("icons"),
        ]

        self.icon_base_path = None
        for path in possible_paths:
            if path.exists():
                self.icon_base_path = path
                break

        if self.icon_base_path:
            self._load_icons()
        else:
            logger.warning("Icon directory not found. Icons will not be available.")

    def _load_icons(self):
        """Load all icons from assets directory."""
        if not self.icon_base_path or not self.icon_base_path.exists():
            return

        # Define icon mappings (common icon names)
        icon_mappings = {
            "app": ["app_icon.png", "app_icon.ico", "icon.png"],
            "file": ["file_icon.png", "file.png", "document.png"],
            "folder": ["folder_icon.png", "folder.png", "directory.png"],
            "playlist": ["playlist_icon.png", "playlist.png", "music.png"],
            "search": ["search_icon.png", "search.png", "magnify.png"],
            "export": ["export_icon.png", "export.png", "download.png"],
            "settings": ["settings_icon.png", "settings.png", "gear.png"],
            "help": ["help_icon.png", "help.png", "question.png"],
            "about": ["about_icon.png", "about.png", "info.png"],
            "chevron_down": ["chevron-down.svg", "chevron_down.png", "arrow-down.png"],
            "chevron_up": ["chevron-up.svg", "chevron_up.png", "arrow-up.png"],
            "error": ["error_icon.png", "error.png", "warning.png"],
            "success": ["success_icon.png", "success.png", "check.png"],
            "warning": ["warning_icon.png", "warning.png", "alert.png"],
            "info": ["info_icon.png", "info.png", "information.png"],
        }

        for icon_name, icon_files in icon_mappings.items():
            icon_path = None
            for icon_file in icon_files:
                potential_path = self.icon_base_path / icon_file
                if potential_path.exists():
                    icon_path = potential_path
                    break

            if icon_path:
                try:
                    icon = QIcon(str(icon_path))
                    self._icons[icon_name] = icon
                    self._icon_paths[icon_name] = icon_path
                except Exception as e:
                    logger.warning(f"Could not load icon {icon_path}: {e}")

    def get_icon(self, icon_name: str) -> Optional[QIcon]:
        """Get icon by name.

        Args:
            icon_name: Name of icon to retrieve.

        Returns:
            QIcon if found, None otherwise.
        """
        return self._icons.get(icon_name)

    def get_icon_path(self, icon_name: str) -> Optional[Path]:
        """Get icon file path by name.

        Args:
            icon_name: Name of icon.

        Returns:
            Path to icon file if found, None otherwise.
        """
        return self._icon_paths.get(icon_name)

    def set_icon(self, widget, icon_name: str, size: Optional[int] = None):
        """Set icon on widget.

        Args:
            widget: Widget to set icon on (must have setIcon method).
            icon_name: Name of icon to use.
            size: Optional size for icon (pixels).
        """
        icon = self.get_icon(icon_name)
        if icon:
            if size:
                pixmap = icon.pixmap(size, size)
                widget.setIcon(QIcon(pixmap))
            else:
                widget.setIcon(icon)
        else:
            logger.debug(f"Icon not found: {icon_name}")

    def list_icons(self) -> List[str]:
        """List all available icon names.

        Returns:
            List of available icon names.
        """
        return list(self._icons.keys())

    def has_icon(self, icon_name: str) -> bool:
        """Check if icon exists.

        Args:
            icon_name: Name of icon to check.

        Returns:
            True if icon exists, False otherwise.
        """
        return icon_name in self._icons


# Convenience function
def get_icon_manager() -> IconManager:
    """Get the global icon manager instance.

    Returns:
        IconManager singleton instance.
    """
    return IconManager()
