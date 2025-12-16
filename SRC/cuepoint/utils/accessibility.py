#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Accessibility Utilities (Step 9.2)

Contrast validation, size validation, and WCAG compliance checking.
"""

import colorsys
from typing import Dict, List, Tuple


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple.

    Args:
        hex_color: Hex color string (e.g., "#FF0000" or "FF0000").

    Returns:
        RGB tuple (r, g, b) with values 0-255.
    """
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def get_luminance(r: int, g: int, b: int) -> float:
    """Calculate relative luminance (WCAG formula).

    Args:
        r: Red component (0-255).
        g: Green component (0-255).
        b: Blue component (0-255).

    Returns:
        Relative luminance value (0.0-1.0).
    """
    def to_linear(c):
        c = c / 255.0
        if c <= 0.03928:
            return c / 12.92
        return ((c + 0.055) / 1.055) ** 2.4

    r_linear = to_linear(r)
    g_linear = to_linear(g)
    b_linear = to_linear(b)

    return 0.2126 * r_linear + 0.7152 * g_linear + 0.0722 * b_linear


def get_contrast_ratio(color1: str, color2: str) -> float:
    """Calculate contrast ratio between two colors.

    Args:
        color1: First color (hex).
        color2: Second color (hex).

    Returns:
        Contrast ratio (1.0-21.0).
    """
    rgb1 = hex_to_rgb(color1)
    rgb2 = hex_to_rgb(color2)

    lum1 = get_luminance(*rgb1)
    lum2 = get_luminance(*rgb2)

    lighter = max(lum1, lum2)
    darker = min(lum1, lum2)

    if darker == 0:
        return 21.0  # Maximum contrast

    return (lighter + 0.05) / (darker + 0.05)


def check_contrast(
    foreground: str,
    background: str,
    level: str = "AA",
    text_size: str = "normal",
) -> Tuple[bool, float]:
    """Check if color combination meets contrast requirements.

    Args:
        foreground: Foreground color (hex).
        background: Background color (hex).
        level: WCAG level ("AA" or "AAA").
        text_size: Text size ("normal" or "large").

    Returns:
        Tuple of (meets_requirements, contrast_ratio).
    """
    ratio = get_contrast_ratio(foreground, background)

    # WCAG requirements
    if level == "AA":
        if text_size == "normal":
            required = 4.5
        else:  # large text
            required = 3.0
    else:  # AAA
        if text_size == "normal":
            required = 7.0
        else:  # large text
            required = 4.5

    return ratio >= required, ratio


class ContrastValidator:
    """Validates contrast for all color combinations."""

    def __init__(self, theme_tokens):
        """Initialize contrast validator.

        Args:
            theme_tokens: Theme tokens object (ColorTokens).
        """
        self.theme = theme_tokens
        self.violations: List[Dict] = []

    def validate_all(self) -> List[Dict]:
        """Validate all color combinations in theme.

        Returns:
            List of contrast violations (empty if all pass).
        """
        violations = []

        # Text on background
        meets, ratio = check_contrast(
            self.theme.colors.text_primary,
            self.theme.colors.background,
            "AA",
            "normal",
        )
        if not meets:
            violations.append(
                {
                    "type": "text_primary_on_background",
                    "ratio": ratio,
                    "required": 4.5,
                    "foreground": self.theme.colors.text_primary,
                    "background": self.theme.colors.background,
                }
            )

        # Text on surface
        meets, ratio = check_contrast(
            self.theme.colors.text_primary,
            self.theme.colors.surface,
            "AA",
            "normal",
        )
        if not meets:
            violations.append(
                {
                    "type": "text_primary_on_surface",
                    "ratio": ratio,
                    "required": 4.5,
                    "foreground": self.theme.colors.text_primary,
                    "background": self.theme.colors.surface,
                }
            )

        # Secondary text
        meets, ratio = check_contrast(
            self.theme.colors.text_secondary,
            self.theme.colors.background,
            "AA",
            "normal",
        )
        if not meets:
            violations.append(
                {
                    "type": "text_secondary_on_background",
                    "ratio": ratio,
                    "required": 4.5,
                    "foreground": self.theme.colors.text_secondary,
                    "background": self.theme.colors.background,
                }
            )

        # Disabled text (must still be readable)
        meets, ratio = check_contrast(
            self.theme.colors.text_disabled,
            self.theme.colors.background,
            "AA",
            "normal",
        )
        if not meets:
            violations.append(
                {
                    "type": "text_disabled_on_background",
                    "ratio": ratio,
                    "required": 4.5,
                    "note": "Disabled text must still be readable",
                }
            )

        # Focus ring
        meets, ratio = check_contrast(
            self.theme.colors.focus_ring,
            self.theme.colors.background,
            "AA",
            "normal",
        )
        if not meets:
            violations.append(
                {
                    "type": "focus_ring_on_background",
                    "ratio": ratio,
                    "required": 3.0,  # UI components need 3:1
                }
            )

        return violations


class SizeValidator:
    """Validates minimum sizes for accessibility."""

    MIN_TOUCH_TARGET = 28  # pixels
    MIN_CLICK_TARGET = 24  # pixels
    MIN_TEXT_SIZE = 10  # pixels
    MIN_SPACING = 8  # pixels between targets

    def validate_widget(self, widget) -> List[str]:
        """Validate widget meets size requirements.

        Args:
            widget: Widget to validate.

        Returns:
            List of violation messages (empty if all pass).
        """
        violations = []

        size = widget.size()
        min_size = min(size.width(), size.height())

        if min_size < self.MIN_TOUCH_TARGET:
            violations.append(
                f"Widget {widget.objectName() or 'unnamed'} has size {min_size}px, "
                f"minimum is {self.MIN_TOUCH_TARGET}px"
            )

        # Check font size if text widget
        font = widget.font()
        font_size = font.pixelSize() or (font.pointSize() * 1.33)  # Approximate
        if font_size < self.MIN_TEXT_SIZE:
            violations.append(
                f"Widget {widget.objectName() or 'unnamed'} has font size {font_size}px, "
                f"minimum is {self.MIN_TEXT_SIZE}px"
            )

        return violations
