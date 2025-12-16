#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Theme Token System (Step 9.1)

This module provides centralized theme tokens for colors, spacing, typography,
border radius, and control sizes. All tokens are platform-aware and provide
consistent design language across the application.
"""

import sys
from dataclasses import dataclass
from typing import Dict


def _get_platform() -> str:
    """Get current platform identifier."""
    return sys.platform


@dataclass
class ColorTokens:
    """Centralized color token definitions with platform-specific overrides."""

    # Base colors
    background: str  # Main window background
    surface: str  # Panel, card, group box background
    border: str  # Border color for inputs, panels
    border_subtle: str  # Subtle borders (dividers, separators)

    # Semantic colors
    primary: str  # Primary action color (buttons, links)
    primary_hover: str  # Primary hover state
    primary_pressed: str  # Primary pressed state
    secondary: str  # Secondary actions
    accent: str  # Accent color for highlights

    # Status colors
    success: str  # Success feedback
    warning: str  # Warning feedback
    error: str  # Error feedback
    info: str  # Informational feedback

    # Text colors
    text_primary: str  # Primary text (high contrast)
    text_secondary: str  # Secondary text (medium contrast)
    text_disabled: str  # Disabled text (low contrast, still readable)
    text_inverse: str  # Text on colored backgrounds

    # Interactive states
    hover_overlay: str  # Hover overlay (rgba)
    pressed_overlay: str  # Pressed overlay (rgba)
    focus_ring: str  # Focus indicator color
    selection: str  # Selection background

    @classmethod
    def for_platform(cls, platform: str) -> "ColorTokens":
        """Get color tokens for specific platform."""
        if platform == "darwin":  # macOS
            return cls(
                background="#1e1e1e",
                surface="#2d2d2d",
                border="#3d3d3d",
                border_subtle="#2d2d2d",
                primary="#007AFF",  # macOS blue
                primary_hover="#0056b3",
                primary_pressed="#004085",
                secondary="#5856D6",  # macOS purple
                accent="#30D158",  # macOS green
                success="#4CAF50",
                warning="#FF9800",
                error="#F44336",
                info="#2196F3",
                text_primary="#ffffff",
                text_secondary="#8e8e93",  # macOS secondary text
                text_disabled="#5a5a5a",  # Still readable
                text_inverse="#ffffff",
                hover_overlay="rgba(255, 255, 255, 0.08)",
                pressed_overlay="rgba(255, 255, 255, 0.12)",
                focus_ring="#007AFF",
                selection="rgba(0, 122, 255, 0.35)",
            )
        else:  # Windows/Linux
            return cls(
                background="#1e1e1e",
                surface="#252526",
                border="#3c3c3c",
                border_subtle="#2d2d2d",
                primary="#0078d4",  # Windows blue
                primary_hover="#106ebe",
                primary_pressed="#005a9e",
                secondary="#6b69d6",
                accent="#4CAF50",
                success="#4CAF50",
                warning="#FF9800",
                error="#F44336",
                info="#2196F3",
                text_primary="#ffffff",
                text_secondary="#888888",
                text_disabled="#666666",  # Still readable
                text_inverse="#ffffff",
                hover_overlay="rgba(255, 255, 255, 0.08)",
                pressed_overlay="rgba(255, 255, 255, 0.12)",
                focus_ring="#0078d4",
                selection="rgba(0, 120, 212, 0.35)",
            )


@dataclass
class SpacingTokens:
    """Centralized spacing token definitions."""

    # Base spacing scale (4px increments)
    xs: int = 4  # Extra small spacing (tight grouping)
    sm: int = 6  # Small spacing (related elements)
    md: int = 8  # Medium spacing (standard spacing)
    lg: int = 12  # Large spacing (section separation)
    xl: int = 16  # Extra large spacing (major sections)
    xxl: int = 24  # Extra extra large (page-level separation)

    # Component-specific spacing
    button_padding_x: int = 16  # Horizontal button padding
    button_padding_y: int = 8  # Vertical button padding
    input_padding_x: int = 6  # Horizontal input padding
    input_padding_y: int = 4  # Vertical input padding
    group_margin_top: int = 12  # Top margin for group boxes
    group_padding: int = 6  # Internal group box padding

    # Layout spacing
    window_margin: int = 8  # Window edge margin
    section_spacing: int = 16  # Spacing between major sections
    control_spacing: int = 8  # Spacing between form controls
    label_spacing: int = 6  # Spacing between label and control

    @classmethod
    def for_platform(cls, platform: str) -> "SpacingTokens":
        """Get spacing tokens for specific platform."""
        if platform == "darwin":  # macOS
            return cls(
                xs=4,
                sm=6,
                md=6,
                lg=10,
                xl=14,
                xxl=20,
                button_padding_x=14,
                button_padding_y=5,
                input_padding_x=6,
                input_padding_y=4,
                group_margin_top=10,
                group_padding=6,
                window_margin=6,
                section_spacing=14,
                control_spacing=6,
                label_spacing=6,
            )
        else:  # Windows/Linux
            return cls(
                xs=4,
                sm=6,
                md=8,
                lg=12,
                xl=16,
                xxl=24,
                button_padding_x=16,
                button_padding_y=8,
                input_padding_x=6,
                input_padding_y=4,
                group_margin_top=12,
                group_padding=8,
                window_margin=8,
                section_spacing=16,
                control_spacing=8,
                label_spacing=6,
            )


@dataclass
class TypographyTokens:
    """Centralized typography token definitions."""

    # Font families
    font_family: str = "system"  # Use system font stack
    font_family_mono: str = "monospace"  # Monospace for code/data

    # Font sizes (in pixels)
    font_size_xs: int = 10  # Extra small (tooltips, captions)
    font_size_sm: int = 11  # Small (secondary text, labels)
    font_size_base: int = 12  # Base (body text, default)
    font_size_md: int = 13  # Medium (emphasis, headings)
    font_size_lg: int = 14  # Large (section headings)
    font_size_xl: int = 16  # Extra large (page titles)
    font_size_xxl: int = 18  # Extra extra large (major headings)

    # Font weights
    font_weight_normal: int = 400
    font_weight_medium: int = 500
    font_weight_semibold: int = 600
    font_weight_bold: int = 700

    # Line heights
    line_height_tight: float = 1.2  # Tight (headings)
    line_height_normal: float = 1.5  # Normal (body text)
    line_height_relaxed: float = 1.8  # Relaxed (long form text)

    # Letter spacing
    letter_spacing_tight: float = -0.01
    letter_spacing_normal: float = 0.0
    letter_spacing_wide: float = 0.05

    @classmethod
    def for_platform(cls, platform: str) -> "TypographyTokens":
        """Get typography tokens for specific platform."""
        if platform == "darwin":  # macOS
            return cls(
                font_family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                font_family_mono="'SF Mono', Monaco, 'Cascadia Code', monospace",
                font_size_xs=10,
                font_size_sm=11,
                font_size_base=12,
                font_size_md=13,
                font_size_lg=14,
                font_size_xl=16,
                font_size_xxl=18,
                font_weight_normal=400,
                font_weight_medium=500,
                font_weight_semibold=600,
                font_weight_bold=700,
                line_height_tight=1.2,
                line_height_normal=1.5,
                line_height_relaxed=1.8,
            )
        else:  # Windows/Linux
            return cls(
                font_family="'Segoe UI', system-ui, -apple-system, sans-serif",
                font_family_mono="'Cascadia Code', 'Consolas', monospace",
                font_size_xs=10,
                font_size_sm=11,
                font_size_base=12,
                font_size_md=13,
                font_size_lg=14,
                font_size_xl=16,
                font_size_xxl=18,
                font_weight_normal=400,
                font_weight_medium=500,
                font_weight_semibold=600,
                font_weight_bold=700,
                line_height_tight=1.2,
                line_height_normal=1.5,
                line_height_relaxed=1.8,
            )


@dataclass
class RadiusTokens:
    """Centralized border radius token definitions."""

    # Base radius values
    radius_none: int = 0  # Sharp corners (tables, dividers)
    radius_sm: int = 4  # Small radius (inputs, small buttons)
    radius_md: int = 6  # Medium radius (buttons, cards)
    radius_lg: int = 8  # Large radius (panels, modals)
    radius_xl: int = 12  # Extra large radius (major containers)
    radius_full: int = 9999  # Fully rounded (pills, badges)

    # Component-specific radii
    button_radius: int = 6  # Button border radius
    input_radius: int = 4  # Input field border radius
    card_radius: int = 8  # Card/panel border radius
    badge_radius: int = 12  # Badge border radius

    @classmethod
    def for_platform(cls, platform: str) -> "RadiusTokens":
        """Get radius tokens for specific platform."""
        if platform == "darwin":  # macOS (more rounded)
            return cls(
                radius_none=0,
                radius_sm=4,
                radius_md=6,
                radius_lg=8,
                radius_xl=12,
                radius_full=9999,
                button_radius=6,
                input_radius=8,  # macOS inputs more rounded
                card_radius=8,
                badge_radius=12,
            )
        else:  # Windows/Linux (sharper corners)
            return cls(
                radius_none=0,
                radius_sm=2,
                radius_md=4,
                radius_lg=6,
                radius_xl=8,
                radius_full=9999,
                button_radius=4,
                input_radius=4,
                card_radius=6,
                badge_radius=8,
            )


@dataclass
class SizeTokens:
    """Centralized size token definitions."""

    # Control heights
    control_height_xs: int = 20  # Extra small (compact UI)
    control_height_sm: int = 24  # Small (secondary controls)
    control_height_md: int = 28  # Medium (standard controls)
    control_height_lg: int = 32  # Large (primary controls)
    control_height_xl: int = 40  # Extra large (prominent actions)

    # Component-specific heights
    button_height: int = 28  # Standard button height
    input_height: int = 26  # Input field height
    table_row_height: int = 32  # Table row height
    toolbar_height: int = 40  # Toolbar height

    # Minimum touch targets (accessibility)
    min_touch_target: int = 28  # Minimum touch target (iOS/Android guidelines)
    min_click_target: int = 24  # Minimum click target (desktop)

    # Icon sizes
    icon_size_xs: int = 12  # Extra small icons
    icon_size_sm: int = 16  # Small icons
    icon_size_md: int = 20  # Medium icons
    icon_size_lg: int = 24  # Large icons
    icon_size_xl: int = 32  # Extra large icons

    @classmethod
    def for_platform(cls, platform: str) -> "SizeTokens":
        """Get size tokens for specific platform."""
        if platform == "darwin":  # macOS
            return cls(
                control_height_xs=20,
                control_height_sm=22,
                control_height_md=26,
                control_height_lg=28,
                control_height_xl=32,
                button_height=28,
                input_height=26,
                table_row_height=32,
                toolbar_height=40,
                min_touch_target=28,  # macOS HIG recommends 28px
                min_click_target=24,
                icon_size_xs=12,
                icon_size_sm=16,
                icon_size_md=20,
                icon_size_lg=24,
                icon_size_xl=32,
            )
        else:  # Windows/Linux
            return cls(
                control_height_xs=20,
                control_height_sm=24,
                control_height_md=28,
                control_height_lg=32,
                control_height_xl=40,
                button_height=32,
                input_height=30,
                table_row_height=32,
                toolbar_height=44,
                min_touch_target=28,
                min_click_target=24,
                icon_size_xs=12,
                icon_size_sm=16,
                icon_size_md=20,
                icon_size_lg=24,
                icon_size_xl=32,
            )
