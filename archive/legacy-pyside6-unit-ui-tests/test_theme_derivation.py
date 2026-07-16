"""Tests for theme token derivation (Rollout Phase D)."""

from cuepoint.ui.appearance.theme_derivation import (
    CustomThemeColors,
    darken,
    derive_theme_tokens,
    normalize_hex,
)


def test_normalize_hex_expands_short_form():
    assert normalize_hex("#abc") == "#aabbcc"


def test_derive_theme_tokens_builds_borders():
    colors = CustomThemeColors(
        bg_app="#18181b",
        bg_panel="#27272a",
        bg_input="#18181b",
        fg_primary="#fafafa",
        fg_muted="#a1a1aa",
        accent_primary="#8b5cf6",
        accent_success="#22c55e",
        accent_warning="#eab308",
        accent_danger="#ef4444",
    )
    tokens = derive_theme_tokens(colors)
    assert tokens["bg-app"] == "#18181b"
    assert tokens["accent-primary"] == "#8b5cf6"
    assert tokens["border-muted"] == darken("#27272a", 0.12)
