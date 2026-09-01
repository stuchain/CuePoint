#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Privacy service (Step 8.4).

Centralizes privacy preferences and "privacy actions" so UI and runtime logic
do not duplicate configuration keys or deletion behavior.

Preferences are persisted through :class:`~cuepoint.services.config_service.ConfigService`
(``~/.cuepoint/config.yaml``) under the ``privacy.*`` namespace. This module must
remain free of any GUI-toolkit dependency: it runs inside the headless engine
sidecar, where PySide6 is not installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from cuepoint.services.interfaces import IConfigService, IPrivacyService
from cuepoint.utils.privacy import DataDeletionManager


@dataclass(frozen=True)
class PrivacyPreferences:
    clear_cache_on_exit: bool = False
    clear_logs_on_exit: bool = False


class PrivacyService(IPrivacyService):
    """Read/write privacy preferences and apply privacy actions on exit."""

    KEY_CLEAR_CACHE_ON_EXIT = "privacy.clear_cache_on_exit"
    KEY_CLEAR_LOGS_ON_EXIT = "privacy.clear_logs_on_exit"

    def __init__(self, config_service: Optional[IConfigService] = None) -> None:
        """Initialize the service.

        Args:
            config_service: Configuration service used for persistence. When
                omitted, a default :class:`ConfigService` is created, which reads
                and writes the user's ``~/.cuepoint/config.yaml``.
        """
        if config_service is None:
            # Imported lazily to avoid a circular import at module load time.
            from cuepoint.services.config_service import ConfigService

            config_service = ConfigService()
        self._config: IConfigService = config_service

    def get_preferences(self) -> PrivacyPreferences:
        """Return the currently persisted privacy preferences."""
        return PrivacyPreferences(
            clear_cache_on_exit=bool(
                self._config.get(self.KEY_CLEAR_CACHE_ON_EXIT, False)
            ),
            clear_logs_on_exit=bool(
                self._config.get(self.KEY_CLEAR_LOGS_ON_EXIT, False)
            ),
        )

    def set_preferences(self, prefs: PrivacyPreferences) -> None:
        """Persist the given privacy preferences.

        Raises:
            ConfigurationError: If the configuration file cannot be written.
                Persistence failures are surfaced rather than swallowed, so a
                preference the user toggled is never silently lost.
        """
        self._config.set(self.KEY_CLEAR_CACHE_ON_EXIT, bool(prefs.clear_cache_on_exit))
        self._config.set(self.KEY_CLEAR_LOGS_ON_EXIT, bool(prefs.clear_logs_on_exit))
        self._config.save()

    def set_clear_cache_on_exit(self, enabled: bool) -> None:
        prefs = self.get_preferences()
        self.set_preferences(
            PrivacyPreferences(
                clear_cache_on_exit=bool(enabled),
                clear_logs_on_exit=prefs.clear_logs_on_exit,
            )
        )

    def set_clear_logs_on_exit(self, enabled: bool) -> None:
        prefs = self.get_preferences()
        self.set_preferences(
            PrivacyPreferences(
                clear_cache_on_exit=prefs.clear_cache_on_exit,
                clear_logs_on_exit=bool(enabled),
            )
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
