#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Onboarding Service

Implements SHIP v1.0 Step 9.4: Onboarding (first-run detection + persistence).

This module is intentionally lightweight:
- Stores onboarding state via ConfigService (``~/.cuepoint/config.yaml``,
  ``product.onboarding_*`` keys), per-user and persistent.
- Supports "don't show again" and versioned onboarding.

This module must remain free of any GUI-toolkit dependency: it runs inside the
headless engine sidecar, where PySide6 is not installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from cuepoint.services.interfaces import IConfigService, IOnboardingService
from cuepoint.version import get_version


@dataclass(frozen=True)
class OnboardingState:
    """Serializable onboarding state snapshot."""

    first_run_complete: bool
    onboarding_dismissed: bool
    onboarding_version: Optional[str]


class OnboardingService(IOnboardingService):
    """Manages onboarding state and first-run detection."""

    KEY_FIRST_RUN_COMPLETE = "product.onboarding_seen"
    KEY_ONBOARDING_DISMISSED = "product.onboarding_dismissed"
    KEY_ONBOARDING_VERSION = "product.onboarding_version"

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
        self._config_service: IConfigService = config_service

    def get_state(self) -> OnboardingState:
        """Get current persisted onboarding state."""
        version = self._config_service.get(self.KEY_ONBOARDING_VERSION, None)
        return OnboardingState(
            first_run_complete=bool(
                self._config_service.get(self.KEY_FIRST_RUN_COMPLETE, False)
            ),
            onboarding_dismissed=bool(
                self._config_service.get(self.KEY_ONBOARDING_DISMISSED, False)
            ),
            onboarding_version=str(version) if version else None,
        )

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

    def mark_first_run_complete(
        self, *, onboarding_version: Optional[str] = None
    ) -> None:
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

    def _set_state(
        self,
        *,
        first_run_complete: bool,
        onboarding_dismissed: bool,
        onboarding_version: Optional[str],
    ) -> None:
        """Persist onboarding state.

        Raises:
            ConfigurationError: If the configuration file cannot be written.
                Persistence failures are surfaced rather than swallowed, so
                onboarding state is never silently lost.
        """
        self._config_service.set(self.KEY_FIRST_RUN_COMPLETE, first_run_complete)
        self._config_service.set(self.KEY_ONBOARDING_DISMISSED, onboarding_dismissed)
        self._config_service.set(self.KEY_ONBOARDING_VERSION, onboarding_version)
        self._config_service.save()
