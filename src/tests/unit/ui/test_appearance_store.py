"""Tests for appearance QSettings store (Rollout Phase D)."""

from PySide6.QtCore import QSettings

from cuepoint.ui.appearance.appearance_store import (
    CUSTOM_THEME_PREFIX,
    AppearanceStore,
    CustomThemeRecord,
    DEFAULT_UI_SCALE,
    clamp_scale,
)
from cuepoint.ui.appearance.built_in_themes import DEFAULT_THEME_ID
from cuepoint.ui.appearance.theme_derivation import CustomThemeColors


def test_default_theme_and_scale(tmp_path):
    settings = QSettings(str(tmp_path / "appearance.ini"), QSettings.IniFormat)
    store = AppearanceStore(settings)

    assert store.load_theme_id() == DEFAULT_THEME_ID
    assert store.load_ui_scale() == DEFAULT_UI_SCALE


def test_clamp_scale_rejects_invalid_values():
    assert clamp_scale(99) == DEFAULT_UI_SCALE
    assert clamp_scale(2) == 2


def test_custom_theme_round_trip(tmp_path):
    settings = QSettings(str(tmp_path / "appearance.ini"), QSettings.IniFormat)
    store = AppearanceStore(settings)
    record = CustomThemeRecord(
        id="abc-123",
        name="Test theme",
        colors=CustomThemeColors(
            bg_app="#111111",
            bg_panel="#222222",
            bg_input="#111111",
            fg_primary="#eeeeee",
            fg_muted="#aaaaaa",
            accent_primary="#ff00ff",
            accent_success="#00ff00",
            accent_warning="#ffff00",
            accent_danger="#ff0000",
        ),
    )
    store.upsert_custom_theme(record)
    loaded = store.get_custom_theme("abc-123")
    assert loaded is not None
    assert loaded.name == "Test theme"
    assert loaded.colors.accent_primary == "#ff00ff"

    store.save_theme_id(f"{CUSTOM_THEME_PREFIX}abc-123")
    assert store.load_theme_id() == f"{CUSTOM_THEME_PREFIX}abc-123"

    store.delete_custom_theme("abc-123")
    assert store.get_custom_theme("abc-123") is None
    assert store.load_theme_id() == DEFAULT_THEME_ID
