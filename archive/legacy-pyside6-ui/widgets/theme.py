#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Theme Manager (Step 9.1)

Centralized theme management system that provides easy access to all theme tokens,
handles platform detection, and manages theme state.
"""

import sys
from typing import Optional

from cuepoint.ui.widgets.theme_tokens import (
    ColorTokens,
    RadiusTokens,
    SizeTokens,
    SpacingTokens,
    TypographyTokens,
)


class ThemeManager:
    """Centralized theme management system."""

    _instance: Optional["ThemeManager"] = None
    _colors: Optional[ColorTokens] = None
    _spacing: Optional[SpacingTokens] = None
    _typography: Optional[TypographyTokens] = None
    _radius: Optional[RadiusTokens] = None
    _size: Optional[SizeTokens] = None

    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize theme tokens for current platform."""
        platform = sys.platform
        self._colors = ColorTokens.for_platform(platform)
        self._spacing = SpacingTokens.for_platform(platform)
        self._typography = TypographyTokens.for_platform(platform)
        self._radius = RadiusTokens.for_platform(platform)
        self._size = SizeTokens.for_platform(platform)

    @property
    def colors(self) -> ColorTokens:
        """Get color tokens."""
        if self._colors is None:
            self._initialize()
        return self._colors

    @property
    def spacing(self) -> SpacingTokens:
        """Get spacing tokens."""
        if self._spacing is None:
            self._initialize()
        return self._spacing

    @property
    def typography(self) -> TypographyTokens:
        """Get typography tokens."""
        if self._typography is None:
            self._initialize()
        return self._typography

    @property
    def radius(self) -> RadiusTokens:
        """Get radius tokens."""
        if self._radius is None:
            self._initialize()
        return self._radius

    @property
    def size(self) -> SizeTokens:
        """Get size tokens."""
        if self._size is None:
            self._initialize()
        return self._size

    def get_platform(self) -> str:
        """Get current platform identifier."""
        return sys.platform

    def reload(self):
        """Reload theme tokens (useful for theme switching)."""
        self._initialize()


# Global theme manager instance
def get_theme() -> ThemeManager:
    """Get the global theme manager instance."""
    return ThemeManager()
