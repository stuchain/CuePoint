"""Apply theme palette and UI scale to the running Qt application."""

from __future__ import annotations

import re
from typing import Optional, TYPE_CHECKING

from cuepoint.ui.appearance.appearance_store import (
    CUSTOM_THEME_PREFIX,
    AppearanceStore,
    custom_theme_storage_id,
    is_custom_theme_id,
)
from cuepoint.ui.appearance.built_in_themes import (
    BUILT_IN_THEME_OPTIONS,
    DEFAULT_THEME_ID,
    get_built_in_tokens,
)
from cuepoint.ui.appearance.theme_derivation import derive_theme_tokens
from cuepoint.ui.widgets.styles import (
    apply_theme_tokens,
    get_stylesheet,
    set_ui_scale_factor,
)

if TYPE_CHECKING:
    from PySide6.QtWidgets import QApplication

_PX_RE = re.compile(r"(\d+(?:\.\d+)?)px")

_active_theme_id: str = DEFAULT_THEME_ID
_active_scale: int = 2


def get_active_theme_id() -> str:
    return _active_theme_id


def get_ui_scale() -> int:
    return _active_scale


def resolve_theme_tokens(theme_id: str, store: Optional[AppearanceStore] = None) -> dict[str, str]:
    if is_custom_theme_id(theme_id):
        store = store or AppearanceStore()
        record = store.get_custom_theme(custom_theme_storage_id(theme_id))
        if record is None:
            return get_built_in_tokens(DEFAULT_THEME_ID)
        return derive_theme_tokens(record.colors)
    return get_built_in_tokens(theme_id)


def scale_stylesheet(css: str, scale: int) -> str:
    if scale <= 1:
        return css

    def repl(match: re.Match[str]) -> str:
        value = float(match.group(1))
        return f"{int(round(value * scale))}px"

    return _PX_RE.sub(repl, css)


def _apply_app_font(app: "QApplication", scale: int) -> None:
    from PySide6.QtGui import QFont

    font = app.font()
    # Base body size at 1× is ~10pt; integer scale matches lab token doubling.
    font.setPointSize(9 + scale)
    app.setFont(font)


def apply_appearance(
    app: "QApplication",
    *,
    theme_id: Optional[str] = None,
    scale: Optional[int] = None,
    store: Optional[AppearanceStore] = None,
    persist: bool = False,
) -> None:
    """Apply theme + scale to the application."""
    global _active_theme_id, _active_scale

    store = store or AppearanceStore()
    resolved_theme = theme_id or store.load_theme_id()
    resolved_scale = scale if scale is not None else store.load_ui_scale()

    tokens = resolve_theme_tokens(resolved_theme, store=store)
    apply_theme_tokens(tokens)
    set_ui_scale_factor(resolved_scale)

    css = scale_stylesheet(get_stylesheet(), resolved_scale)
    app.setStyleSheet(css)
    _apply_app_font(app, resolved_scale)

    _active_theme_id = resolved_theme
    _active_scale = resolved_scale

    if persist:
        store.save_theme_id(resolved_theme)
        store.save_ui_scale(resolved_scale)


def init_appearance(app: "QApplication") -> None:
    """Load persisted appearance on startup."""
    apply_appearance(app)


def theme_option_labels() -> list[tuple[str, str]]:
    """Return (id, label) pairs for built-in + custom themes."""
    store = AppearanceStore()
    options = [(item["id"], item["label"]) for item in BUILT_IN_THEME_OPTIONS]
    for theme in store.load_custom_themes():
        options.append((f"{CUSTOM_THEME_PREFIX}{theme.id}", theme.name))
    return options
