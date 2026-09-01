#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Configuration written through ConfigService must reach the matching engine.

``core/matcher.py``, ``core/query_generator.py``, ``data/beatport.py`` and
``services/processor_service.py`` read tuning values straight from the
module-level ``cuepoint.models.config.SETTINGS`` dict. ConfigService used to
hold a *copy* of it, so every legacy key set through the service landed
somewhere the engine never looked: ``--config`` files and the speed presets
(``--fast``/``--turbo``/``--myargs``) reported success and changed nothing.

These tests pin the connection between the two.
"""

from __future__ import annotations

import pytest

from cuepoint.models.config import SETTINGS
from cuepoint.services.config_service import ConfigService


@pytest.fixture
def config(tmp_path) -> ConfigService:
    return ConfigService(config_file=tmp_path / "config.yaml")


# Tuning keys the matching engine reads directly from the module dict.
_MATCHER_KEYS = [
    "CANDIDATE_WORKERS",
    "EARLY_EXIT_SCORE",
    "MAX_QUERIES_PER_TRACK",
    "PER_TRACK_TIME_BUDGET_SEC",
    "MIN_ACCEPT_SCORE",
]


@pytest.mark.unit
class TestLegacyKeysReachTheEngine:
    @pytest.mark.parametrize("key", _MATCHER_KEYS)
    def test_set_is_visible_to_the_engine(self, config, key):
        """Regression: these writes used to land in a private copy."""
        sentinel = 4242
        config.set(key, sentinel)
        assert SETTINGS.get(key) == sentinel, (
            f"{key} set through ConfigService never reached the matching engine"
        )

    def test_get_reads_the_shared_dict(self, config):
        SETTINGS["CANDIDATE_WORKERS"] = 7
        assert config.get("CANDIDATE_WORKERS") == 7

    def test_preset_style_sequence_is_applied(self, config):
        """Mirrors what --turbo does: several config_service.set calls."""
        preset = {
            "TRACK_WORKERS": 16,
            "CANDIDATE_WORKERS": 20,
            "MAX_QUERIES_PER_TRACK": 30,
            "EARLY_EXIT_SCORE": 92.0,
        }
        for key, value in preset.items():
            config.set(key, value)

        for key, value in preset.items():
            assert SETTINGS.get(key) == value, f"preset key {key} did not take effect"

    def test_yaml_config_values_reach_the_engine(self, tmp_path):
        """`--config file.yaml` feeds values in through the same path."""
        service = ConfigService(config_file=tmp_path / "config.yaml")
        # main.py applies a loaded YAML by calling set() per key.
        for key, value in {
            "CANDIDATE_WORKERS": 11,
            "MAX_QUERIES_PER_TRACK": 55,
        }.items():
            service.set(key, value)

        assert SETTINGS["CANDIDATE_WORKERS"] == 11
        assert SETTINGS["MAX_QUERIES_PER_TRACK"] == 55


@pytest.mark.unit
class TestIsolationIsPreserved:
    def test_explicit_settings_dict_is_copied(self, tmp_path):
        """A caller supplying its own settings still gets isolation."""
        own = {"CANDIDATE_WORKERS": 1}
        service = ConfigService(config_file=tmp_path / "c.yaml", settings=own)

        service.set("CANDIDATE_WORKERS", 999)

        assert own["CANDIDATE_WORKERS"] == 1, "caller's dict was mutated"
        assert SETTINGS.get("CANDIDATE_WORKERS") != 999, "global dict was mutated"

    def test_explicit_settings_service_reads_its_own_values(self, tmp_path):
        service = ConfigService(
            config_file=tmp_path / "c.yaml", settings={"CANDIDATE_WORKERS": 3}
        )
        assert service.get("CANDIDATE_WORKERS") == 3


@pytest.mark.unit
class TestStructuredConfigUnaffected:
    """Dot-notation keys still go to AppConfig, not the legacy dict."""

    def test_dot_notation_updates_appconfig(self, config):
        config.set("beatport.timeout", 45)
        assert config.get("beatport.timeout") == 45

    def test_dot_notation_does_not_write_legacy_keys(self, config):
        before = dict(SETTINGS)
        config.set("beatport.timeout", 45)
        assert dict(SETTINGS) == before, "structured key leaked into the legacy dict"

    def test_unknown_key_returns_default(self, config):
        assert config.get("NOT_A_REAL_KEY", "fallback") == "fallback"


@pytest.mark.unit
class TestSettingsAreRestoredBetweenTests:
    """The autouse conftest fixture must undo writes to the shared dict.

    These two tests run in file order; the second fails if the first leaks.
    """

    def test_first_mutates_a_shared_key(self, config):
        config.set("CANDIDATE_WORKERS", 12345)
        assert SETTINGS["CANDIDATE_WORKERS"] == 12345

    def test_second_sees_no_leak(self):
        assert SETTINGS["CANDIDATE_WORKERS"] != 12345, (
            "a previous test's tuning leaked into this one"
        )
