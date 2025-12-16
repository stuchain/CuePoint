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

    def __init__(self, settings: Optional[QSettings] = None) -> None:
        # Allow injecting QSettings in tests.
        self._settings = settings or QSettings()

    def _begin(self) -> None:
        self._settings.beginGroup(self.SETTINGS_GROUP)

    def _end(self) -> None:
        self._settings.endGroup()

    def get_state(self) -> OnboardingState:
        """Get current persisted onboarding state."""
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
        self._begin()
        try:
            self._settings.setValue(self.KEY_FIRST_RUN_COMPLETE, True)
            self._settings.setValue(self.KEY_ONBOARDING_VERSION, onboarding_version or get_version())
            self._settings.sync()
        finally:
            self._end()

    def dismiss_onboarding(self, *, dont_show_again: bool) -> None:
        """Dismiss onboarding, optionally never show again."""
        self._begin()
        try:
            if dont_show_again:
                self._settings.setValue(self.KEY_ONBOARDING_DISMISSED, True)
            # Dismissing also completes first run (prevents repeat prompts).
            self._settings.setValue(self.KEY_FIRST_RUN_COMPLETE, True)
            self._settings.setValue(self.KEY_ONBOARDING_VERSION, get_version())
            self._settings.sync()
        finally:
            self._end()

    def reset_onboarding(self) -> None:
        """Reset onboarding state (useful for testing or power users)."""
        self._begin()
        try:
            self._settings.setValue(self.KEY_FIRST_RUN_COMPLETE, False)
            self._settings.setValue(self.KEY_ONBOARDING_DISMISSED, False)
            self._settings.setValue(self.KEY_ONBOARDING_VERSION, None)
            self._settings.sync()
        finally:
            self._end()

