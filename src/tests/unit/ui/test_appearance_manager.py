"""Tests for appearance manager helpers (Rollout Phase D)."""

from PySide6.QtWidgets import QApplication

from cuepoint.ui.appearance.appearance_manager import apply_appearance, scale_stylesheet
from cuepoint.ui.appearance.appearance_store import AppearanceStore
from cuepoint.ui.appearance.built_in_themes import DEFAULT_THEME_ID
from cuepoint.ui.widgets.styles import Colors


def test_scale_stylesheet_multiplies_pixel_values():
    css = "QPushButton { padding: 8px 16px; min-height: 24px; }"
    scaled = scale_stylesheet(css, 2)
    assert "16px" in scaled
    assert "32px" in scaled
    assert "48px" in scaled


def test_apply_appearance_updates_colors(qtbot):
    app = QApplication.instance() or QApplication([])
    store = AppearanceStore()
    apply_appearance(
        app,
        theme_id="clubNeon",
        scale=2,
        store=store,
        persist=False,
    )
    assert Colors.PRIMARY == "#e040fb"
    assert "clubNeon" not in Colors.PRIMARY

    apply_appearance(
        app,
        theme_id=DEFAULT_THEME_ID,
        scale=1,
        store=store,
        persist=False,
    )
    assert Colors.PRIMARY == "#8b5cf6"
