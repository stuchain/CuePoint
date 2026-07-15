"""Derive full theme tokens from eight editor colors (lab parity)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict

ThemeTokenMap = Dict[str, str]

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


@dataclass(frozen=True)
class CustomThemeColors:
    bg_app: str
    bg_panel: str
    bg_input: str
    fg_primary: str
    fg_muted: str
    accent_primary: str
    accent_success: str
    accent_warning: str
    accent_danger: str


@dataclass
class CustomTheme:
    id: str
    name: str
    colors: CustomThemeColors


def _clamp(value: float, low: float = 0.0, high: float = 255.0) -> int:
    return int(min(high, max(low, round(value))))


def normalize_hex(hex_color: str) -> str:
    raw = hex_color.strip()
    if not _HEX_RE.match(raw):
        raise ValueError(f"Invalid hex color: {hex_color}")
    body = raw.lstrip("#")
    if len(body) == 3:
        body = "".join(ch * 2 for ch in body)
    return f"#{body.lower()}"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    normalized = normalize_hex(hex_color).lstrip("#")
    return (
        int(normalized[0:2], 16),
        int(normalized[2:4], 16),
        int(normalized[4:6], 16),
    )


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{_clamp(r):02x}{_clamp(g):02x}{_clamp(b):02x}"


def darken(hex_color: str, amount: float) -> str:
    r, g, b = _hex_to_rgb(hex_color)
    factor = 1.0 - amount
    return _rgb_to_hex(r * factor, g * factor, b * factor)


def lighten(hex_color: str, amount: float) -> str:
    r, g, b = _hex_to_rgb(hex_color)
    return _rgb_to_hex(
        r + (255 - r) * amount,
        g + (255 - g) * amount,
        b + (255 - b) * amount,
    )


def _relative_luminance(hex_color: str) -> float:
    r, g, b = _hex_to_rgb(hex_color)

    def channel(value: int) -> float:
        s = value / 255.0
        if s <= 0.03928:
            return s / 12.92
        return ((s + 0.055) / 1.055) ** 2.4

    rs, gs, bs = channel(r), channel(g), channel(b)
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs


def pick_contrast_text(bg_hex: str) -> str:
    return "#000000" if _relative_luminance(bg_hex) > 0.45 else "#ffffff"


def derive_theme_tokens(colors: CustomThemeColors) -> ThemeTokenMap:
    bg_app = normalize_hex(colors.bg_app)
    bg_panel = normalize_hex(colors.bg_panel)
    bg_input = normalize_hex(colors.bg_input)
    fg_primary = normalize_hex(colors.fg_primary)
    fg_muted = normalize_hex(colors.fg_muted)
    accent_primary = normalize_hex(colors.accent_primary)

    bg_toolbar = darken(bg_app, 0.05)
    bg_panel_alt = darken(bg_panel, 0.08)
    border_shadow = darken(bg_app, 0.2)
    border_highlight = lighten(bg_panel, 0.15)
    border_light = lighten(bg_panel, 0.22)
    border_muted = darken(bg_panel, 0.12)

    return {
        "bg-app": bg_app,
        "bg-panel": bg_panel,
        "bg-panel-alt": bg_panel_alt,
        "bg-input": bg_input,
        "bg-toolbar": bg_toolbar,
        "border-highlight": border_highlight,
        "border-shadow": border_shadow,
        "border-outline": "#000000",
        "border-light": border_light,
        "border-muted": border_muted,
        "bevel-highlight": border_highlight,
        "bevel-shadow": border_shadow,
        "fg-primary": fg_primary,
        "fg-muted": fg_muted,
        "fg-disabled": fg_muted,
        "fg-inverse": pick_contrast_text(accent_primary),
        "accent-primary": accent_primary,
        "accent-primary-hover": lighten(accent_primary, 0.12),
        "accent-primary-pressed": darken(accent_primary, 0.12),
        "accent-secondary": bg_panel_alt,
        "accent-secondary-hover": lighten(bg_panel_alt, 0.08),
        "accent-success": normalize_hex(colors.accent_success),
        "accent-warning": normalize_hex(colors.accent_warning),
        "accent-danger": normalize_hex(colors.accent_danger),
        "accent-info": lighten(accent_primary, 0.05),
        "overlay-header": "rgba(0, 0, 0, 0.25)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.72)",
    }
