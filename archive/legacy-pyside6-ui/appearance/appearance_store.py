"""Persist appearance preferences via QSettings (Rollout Phase D)."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from typing import List, Optional

from PySide6.QtCore import QSettings

from cuepoint.ui.appearance.built_in_themes import DEFAULT_THEME_ID, is_built_in_theme
from cuepoint.ui.appearance.theme_derivation import CustomTheme, CustomThemeColors

SETTINGS_THEME_KEY = "appearance/theme"
SETTINGS_SCALE_KEY = "appearance/uiScale"
SETTINGS_CUSTOM_THEMES_KEY = "appearance/customThemes"

SCALE_OPTIONS = (1, 2, 3)
DEFAULT_UI_SCALE = 2

CUSTOM_THEME_PREFIX = "custom:"


def is_scale_factor(value: int) -> bool:
    return value in SCALE_OPTIONS


def clamp_scale(value: int) -> int:
    return value if is_scale_factor(value) else DEFAULT_UI_SCALE


def is_custom_theme_id(theme_id: str) -> bool:
    return theme_id.startswith(CUSTOM_THEME_PREFIX)


def custom_theme_storage_id(theme_id: str) -> str:
    if not is_custom_theme_id(theme_id):
        raise ValueError(f"Not a custom theme id: {theme_id}")
    return theme_id[len(CUSTOM_THEME_PREFIX) :]


@dataclass
class CustomThemeRecord:
    id: str
    name: str
    colors: CustomThemeColors

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "colors": asdict(self.colors),
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "CustomThemeRecord":
        colors_payload = payload.get("colors") or {}
        return cls(
            id=str(payload["id"]),
            name=str(payload.get("name") or "Custom theme"),
            colors=CustomThemeColors(
                bg_app=str(colors_payload.get("bg_app", "#18181b")),
                bg_panel=str(colors_payload.get("bg_panel", "#27272a")),
                bg_input=str(colors_payload.get("bg_input", "#18181b")),
                fg_primary=str(colors_payload.get("fg_primary", "#fafafa")),
                fg_muted=str(colors_payload.get("fg_muted", "#a1a1aa")),
                accent_primary=str(colors_payload.get("accent_primary", "#8b5cf6")),
                accent_success=str(colors_payload.get("accent_success", "#22c55e")),
                accent_warning=str(colors_payload.get("accent_warning", "#eab308")),
                accent_danger=str(colors_payload.get("accent_danger", "#ef4444")),
            ),
        )

    def to_theme(self) -> CustomTheme:
        return CustomTheme(id=self.id, name=self.name, colors=self.colors)


class AppearanceStore:
    """Load/save theme, scale, and custom themes."""

    def __init__(self, settings: Optional[QSettings] = None) -> None:
        self._settings = settings or QSettings()

    def load_theme_id(self) -> str:
        raw = self._settings.value(SETTINGS_THEME_KEY, DEFAULT_THEME_ID)
        theme_id = str(raw) if raw is not None else DEFAULT_THEME_ID
        if is_built_in_theme(theme_id):
            return theme_id
        if is_custom_theme_id(theme_id):
            bare = custom_theme_storage_id(theme_id)
            if self.get_custom_theme(bare) is not None:
                return theme_id
        return DEFAULT_THEME_ID

    def save_theme_id(self, theme_id: str) -> None:
        self._settings.setValue(SETTINGS_THEME_KEY, theme_id)

    def load_ui_scale(self) -> int:
        raw = self._settings.value(SETTINGS_SCALE_KEY, DEFAULT_UI_SCALE)
        try:
            parsed = int(raw)
        except (TypeError, ValueError):
            return DEFAULT_UI_SCALE
        return clamp_scale(parsed)

    def save_ui_scale(self, scale: int) -> None:
        self._settings.setValue(SETTINGS_SCALE_KEY, clamp_scale(scale))

    def load_custom_themes(self) -> List[CustomThemeRecord]:
        raw = self._settings.value(SETTINGS_CUSTOM_THEMES_KEY)
        if not raw:
            return []
        try:
            payload = json.loads(str(raw))
        except json.JSONDecodeError:
            return []
        if not isinstance(payload, list):
            return []
        themes: List[CustomThemeRecord] = []
        for item in payload:
            if isinstance(item, dict) and item.get("id"):
                try:
                    themes.append(CustomThemeRecord.from_dict(item))
                except (KeyError, TypeError, ValueError):
                    continue
        return themes

    def save_custom_themes(self, themes: List[CustomThemeRecord]) -> None:
        payload = [theme.to_dict() for theme in themes]
        self._settings.setValue(SETTINGS_CUSTOM_THEMES_KEY, json.dumps(payload))

    def get_custom_theme(self, theme_id: str) -> Optional[CustomThemeRecord]:
        for theme in self.load_custom_themes():
            if theme.id == theme_id:
                return theme
        return None

    def upsert_custom_theme(self, theme: CustomThemeRecord) -> None:
        themes = self.load_custom_themes()
        updated = [theme]
        for existing in themes:
            if existing.id != theme.id:
                updated.append(existing)
        self.save_custom_themes(updated)

    def delete_custom_theme(self, theme_id: str) -> None:
        themes = [t for t in self.load_custom_themes() if t.id != theme_id]
        self.save_custom_themes(themes)

    @staticmethod
    def new_custom_theme_id() -> str:
        return str(uuid.uuid4())
