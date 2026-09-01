#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for PrivacyConfig (FOUNDATION-01).

Privacy preferences moved from QSettings to the structured AppConfig tree, so
they must survive a full to_dict/from_dict round-trip like every other section.
"""

from __future__ import annotations

import pytest

from cuepoint.models.config_models import AppConfig, PrivacyConfig


@pytest.mark.unit
class TestPrivacyConfig:
    def test_defaults_are_off(self):
        cfg = PrivacyConfig()
        assert cfg.clear_cache_on_exit is False
        assert cfg.clear_logs_on_exit is False

    def test_app_config_includes_privacy_section(self):
        assert isinstance(AppConfig.default().privacy, PrivacyConfig)

    def test_to_dict_includes_privacy(self):
        data = AppConfig.default().to_dict()
        assert data["privacy"] == {
            "clear_cache_on_exit": False,
            "clear_logs_on_exit": False,
        }

    def test_from_dict_reads_privacy(self):
        config = AppConfig.from_dict(
            {"privacy": {"clear_cache_on_exit": True, "clear_logs_on_exit": True}}
        )
        assert config.privacy.clear_cache_on_exit is True
        assert config.privacy.clear_logs_on_exit is True

    def test_round_trip_preserves_privacy(self):
        original = AppConfig.default()
        original.privacy.clear_cache_on_exit = True
        original.privacy.clear_logs_on_exit = False

        restored = AppConfig.from_dict(original.to_dict())

        assert restored.privacy.clear_cache_on_exit is True
        assert restored.privacy.clear_logs_on_exit is False

    def test_from_dict_partial_privacy_keeps_defaults(self):
        config = AppConfig.from_dict({"privacy": {"clear_cache_on_exit": True}})
        assert config.privacy.clear_cache_on_exit is True
        assert config.privacy.clear_logs_on_exit is False

    def test_from_dict_without_privacy_uses_defaults(self):
        """Existing config.yaml files predate the privacy section."""
        config = AppConfig.from_dict({"beatport": {"timeout": 45}})
        assert config.privacy.clear_cache_on_exit is False
        assert config.privacy.clear_logs_on_exit is False
        assert config.beatport.timeout == 45
