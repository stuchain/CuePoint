"""Headless path fallbacks for engine sidecar (no PySide6)."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path


def test_standard_path_fallback_without_qt(monkeypatch):
    """AppPaths resolves when PySide6 is unavailable."""
    monkeypatch.setitem(sys.modules, "PySide6", None)
    monkeypatch.setitem(sys.modules, "PySide6.QtCore", None)

    paths = importlib.import_module("cuepoint.utils.paths")
    importlib.reload(paths)

    config = paths._standard_path_fallback("AppConfigLocation")
    assert isinstance(config, Path)
    assert config.name in {"Roaming", ".config", "Application Support"}


def test_standard_path_respects_cuepoint_headless(monkeypatch):
    """CUEPOINT_HEADLESS forces fallback even when PySide6 is installed."""
    monkeypatch.setenv("CUEPOINT_HEADLESS", "1")

    paths = importlib.import_module("cuepoint.utils.paths")
    importlib.reload(paths)

    resolved = paths._standard_path("AppConfigLocation")
    fallback = paths._standard_path_fallback("AppConfigLocation")
    assert resolved == fallback