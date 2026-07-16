"""Appearance settings — theme and UI scale (Rollout Phase D)."""

from cuepoint.ui.appearance.appearance_manager import (
    apply_appearance,
    get_active_theme_id,
    get_ui_scale,
    init_appearance,
)
from cuepoint.ui.appearance.appearance_store import AppearanceStore

__all__ = [
    "AppearanceStore",
    "apply_appearance",
    "get_active_theme_id",
    "get_ui_scale",
    "init_appearance",
]
