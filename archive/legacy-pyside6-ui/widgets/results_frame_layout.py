"""Results outer frame sizing — lab parity (Rollout Phase C)."""

from __future__ import annotations

from typing import Optional, Tuple

from PySide6.QtCore import QSettings

FRAME_MIN_WIDTH = 320
FRAME_MIN_HEIGHT = 280
FRAME_MAX_WIDTH_RATIO = 0.8
FRAME_MAX_HEIGHT = 4000

SETTINGS_WIDTH_KEY = "results/frameWidth"
SETTINGS_HEIGHT_KEY = "results/frameHeight"


def get_viewport_width(viewport_width: int) -> int:
    return max(viewport_width, FRAME_MIN_WIDTH)


def get_frame_max_width(viewport_width: int) -> int:
    vw = get_viewport_width(viewport_width)
    return max(FRAME_MIN_WIDTH, int(vw * FRAME_MAX_WIDTH_RATIO))


def clamp_frame_width(width: int, viewport_width: int) -> int:
    return min(get_frame_max_width(viewport_width), max(FRAME_MIN_WIDTH, int(width)))


def clamp_frame_height(height: int) -> int:
    return min(FRAME_MAX_HEIGHT, max(FRAME_MIN_HEIGHT, int(height)))


def load_frame_size() -> Tuple[Optional[int], Optional[int]]:
    settings = QSettings()
    width = _read_optional_int(settings.value(SETTINGS_WIDTH_KEY))
    height = _read_optional_int(settings.value(SETTINGS_HEIGHT_KEY))
    return width, height


def save_frame_size(width: Optional[int], height: Optional[int]) -> None:
    settings = QSettings()
    if width is None and height is None:
        settings.remove(SETTINGS_WIDTH_KEY)
        settings.remove(SETTINGS_HEIGHT_KEY)
        return
    if width is not None:
        settings.setValue(SETTINGS_WIDTH_KEY, int(width))
    if height is not None:
        settings.setValue(SETTINGS_HEIGHT_KEY, int(height))


def clear_frame_size() -> None:
    save_frame_size(None, None)


def _read_optional_int(value: object) -> Optional[int]:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None
