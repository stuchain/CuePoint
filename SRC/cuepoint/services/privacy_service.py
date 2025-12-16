#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Privacy service (Step 8.4).

Centralizes privacy preferences and "privacy actions" so UI and runtime logic
do not duplicate QSettings keys or deletion behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from PySide6.QtCore import QSettings

from cuepoint.utils.privacy import DataDeletionManager


@dataclass(frozen=True)
class PrivacyPreferences:
    clear_cache_on_exit: bool = False
    clear_logs_on_exit: bool = False


class PrivacyService:
    SETTINGS_ORG = "CuePoint"
    SETTINGS_APP = "CuePoint"
    KEY_CLEAR_CACHE_ON_EXIT = "privacy/clear_cache_on_exit"
    KEY_CLEAR_LOGS_ON_EXIT = "privacy/clear_logs_on_exit"

    def __init__(self, settings: Optional[QSettings] = None) -> None:
        self._settings = settings or QSettings(self.SETTINGS_ORG, self.SETTINGS_APP)

    def get_preferences(self) -> PrivacyPreferences:
        return PrivacyPreferences(
            clear_cache_on_exit=bool(
                self._settings.value(self.KEY_CLEAR_CACHE_ON_EXIT, False, type=bool)
            ),
            clear_logs_on_exit=bool(
                self._settings.value(self.KEY_CLEAR_LOGS_ON_EXIT, False, type=bool)
            ),
        )

    def set_preferences(self, prefs: PrivacyPreferences) -> None:
        self._settings.setValue(self.KEY_CLEAR_CACHE_ON_EXIT, bool(prefs.clear_cache_on_exit))
        self._settings.setValue(self.KEY_CLEAR_LOGS_ON_EXIT, bool(prefs.clear_logs_on_exit))
        self._settings.sync()

    def set_clear_cache_on_exit(self, enabled: bool) -> None:
        prefs = self.get_preferences()
        self.set_preferences(
            PrivacyPreferences(clear_cache_on_exit=bool(enabled), clear_logs_on_exit=prefs.clear_logs_on_exit)
        )

    def set_clear_logs_on_exit(self, enabled: bool) -> None:
        prefs = self.get_preferences()
        self.set_preferences(
            PrivacyPreferences(clear_cache_on_exit=prefs.clear_cache_on_exit, clear_logs_on_exit=bool(enabled))
        )

    def apply_exit_policies(self) -> None:
        """Apply privacy policies on exit (best-effort; never raises)."""
        try:
            prefs = self.get_preferences()
            if prefs.clear_cache_on_exit:
                DataDeletionManager.clear_cache()
            if prefs.clear_logs_on_exit:
                DataDeletionManager.clear_logs()
        except Exception:
            # Never block app exit
            return







