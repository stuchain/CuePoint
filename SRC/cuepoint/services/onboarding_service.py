#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Onboarding Service

Implements SHIP v1.0 Step 9.4: Onboarding (first-run detection + persistence).

This module is intentionally lightweight:
- Stores onboarding state in QSettings (per-user, persistent).
- Supports "don't show again" and versioned onboarding.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from PySide6.QtCore import QSettings

from cuepoint.services.interfaces import IConfigService
from cuepoint.version import get_version


@dataclass(frozen=True)
class OnboardingState:
    """Serializable onboarding state snapshot."""

    first_run_complete: bool
    onboarding_dismissed: bool
    onboarding_version: Optional[str]


class OnboardingService:
    """Manages onboarding state and first-run detection."""

    SETTINGS_GROUP = "Onboarding"
    KEY_FIRST_RUN_COMPLETE = "first_run_complete"
    KEY_ONBOARDING_DISMISSED = "onboarding_dismissed"
    KEY_ONBOARDING_VERSION = "onboarding_version"

    def __init__(
        self,
        settings: Optional[QSettings] = None,
        config_service: Optional[IConfigService] = None,
    ) -> None:
        # Allow injecting QSettings in tests.
        self._settings = settings or QSettings()
        self._config_service = config_service

    def _begin(self) -> None:
        self._settings.beginGroup(self.SETTINGS_GROUP)

    def _end(self) -> None:
        self._settings.endGroup()

    def get_state(self) -> OnboardingState:
        """Get current persisted onboarding state."""
        config_state = self._get_state_from_config()
        if config_state is not None:
            if (
                config_state.first_run_complete
                or config_state.onboarding_dismissed
                or config_state.onboarding_version
            ):
                return config_state

        settings_state = self._get_state_from_settings()
        if config_state is not None:
            # Migrate legacy settings into config if present.
            if (
                settings_state.first_run_complete
                or settings_state.onboarding_dismissed
                or settings_state.onboarding_version
            ):
                self._set_state_in_config(settings_state)
        return settings_state

    def is_first_run(self) -> bool:
        """Return True if onboarding has never been completed."""
        return not self.get_state().first_run_complete

    def should_show_onboarding(self) -> bool:
        """Return True if onboarding should be shown now."""
        state = self.get_state()
        if state.first_run_complete:
            return False
        if state.onboarding_dismissed:
            return False
        return True

    def mark_first_run_complete(self, *, onboarding_version: Optional[str] = None) -> None:
        """Mark onboarding as completed (does not set dismissed)."""
        self._set_state(
            first_run_complete=True,
            onboarding_dismissed=False,
            onboarding_version=onboarding_version or get_version(),
        )

    def dismiss_onboarding(self, *, dont_show_again: bool) -> None:
        """Dismiss onboarding, optionally never show again."""
        self._set_state(
            first_run_complete=True,
            onboarding_dismissed=dont_show_again,
            onboarding_version=get_version(),
        )

    def reset_onboarding(self) -> None:
        """Reset onboarding state (useful for testing or power users)."""
        self._set_state(
            first_run_complete=False,
            onboarding_dismissed=False,
            onboarding_version=None,
        )

    def _get_state_from_settings(self) -> OnboardingState:
        self._begin()
        try:
            return OnboardingState(
                first_run_complete=self._settings.value(
                    self.KEY_FIRST_RUN_COMPLETE, False, type=bool
                ),
                onboarding_dismissed=self._settings.value(
                    self.KEY_ONBOARDING_DISMISSED, False, type=bool
                ),
                onboarding_version=self._settings.value(self.KEY_ONBOARDING_VERSION, None, type=str),
            )
        finally:
            self._end()

    def _get_state_from_config(self) -> Optional[OnboardingState]:
        if not self._config_service:
            return None
        return OnboardingState(
            first_run_complete=bool(self._config_service.get("product.onboarding_seen", False)),
            onboarding_dismissed=bool(self._config_service.get("product.onboarding_dismissed", False)),
            onboarding_version=self._config_service.get("product.onboarding_version", None),
        )

    def _set_state_in_config(self, state: OnboardingState) -> None:
        if not self._config_service:
            return
        try:
            self._config_service.set("product.onboarding_seen", state.first_run_complete)
            self._config_service.set("product.onboarding_dismissed", state.onboarding_dismissed)
            self._config_service.set("product.onboarding_version", state.onboarding_version)
            self._config_service.save()
        except Exception:
            # Config persistence is best-effort; fall back to QSettings.
            pass

    def _set_state(
        self,
        *,
        first_run_complete: bool,
        onboarding_dismissed: bool,
        onboarding_version: Optional[str],
    ) -> None:
        # Persist to QSettings for backward compatibility.
        self._begin()
        try:
            self._settings.setValue(self.KEY_FIRST_RUN_COMPLETE, first_run_complete)
            self._settings.setValue(self.KEY_ONBOARDING_DISMISSED, onboarding_dismissed)
            self._settings.setValue(self.KEY_ONBOARDING_VERSION, onboarding_version)
            self._settings.sync()
        finally:
            self._end()

        self._set_state_in_config(
            OnboardingState(
                first_run_complete=first_run_complete,
                onboarding_dismissed=onboarding_dismissed,
                onboarding_version=onboarding_version,
            )
        )