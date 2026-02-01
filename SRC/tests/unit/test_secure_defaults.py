"""
Secure defaults tests (Design 4.81, 4.101, 4.47).

Ensures default config has telemetry off, redaction on, update verification on.
"""

import tempfile
from pathlib import Path

import pytest

from cuepoint.models.config_models import AppConfig


@pytest.mark.unit
class TestSecureDefaultsConfig:
    """Design 4.81: Secure defaults verification."""

    def test_redaction_enabled_by_default(self) -> None:
        """Redaction must be on by default (Design 4.47, 4.101)."""
        config = AppConfig.default()
        assert config.product.redact_paths_in_logs is True

    def test_verify_updates_enabled_by_default(self) -> None:
        """Update verification must be on by default (Design 4.81, 4.101)."""
        config = AppConfig.default()
        assert config.product.verify_updates is True

    def test_enforce_https_enabled_by_default(self) -> None:
        """HTTPS enforcement must be on by default (Design 4.101)."""
        config = AppConfig.default()
        assert config.product.enforce_https is True
