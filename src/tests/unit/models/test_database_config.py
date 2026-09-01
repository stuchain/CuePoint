#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for DatabaseConfig.

The library database path must survive a config round-trip, and existing
config.yaml files that predate the section must keep working.
"""

from __future__ import annotations

import pytest

from cuepoint.models.config_models import AppConfig, DatabaseConfig


@pytest.mark.unit
class TestDatabaseConfig:
    def test_defaults(self):
        cfg = DatabaseConfig()
        assert cfg.path is None, "None means 'use the platform default'"
        assert cfg.busy_timeout_seconds == 5.0

    def test_app_config_includes_database_section(self):
        assert isinstance(AppConfig.default().database, DatabaseConfig)

    def test_to_dict_includes_database(self):
        assert AppConfig.default().to_dict()["database"] == {
            "path": None,
            "busy_timeout_seconds": 5.0,
        }

    def test_from_dict_reads_database(self):
        config = AppConfig.from_dict(
            {"database": {"path": "/tmp/x.db", "busy_timeout_seconds": 12.5}}
        )
        assert config.database.path == "/tmp/x.db"
        assert config.database.busy_timeout_seconds == 12.5

    def test_round_trip_preserves_database(self):
        original = AppConfig.default()
        original.database.path = "/var/lib/cuepoint.db"
        original.database.busy_timeout_seconds = 30.0

        restored = AppConfig.from_dict(original.to_dict())

        assert restored.database.path == "/var/lib/cuepoint.db"
        assert restored.database.busy_timeout_seconds == 30.0

    def test_partial_section_keeps_defaults(self):
        config = AppConfig.from_dict({"database": {"path": "/tmp/only-path.db"}})
        assert config.database.path == "/tmp/only-path.db"
        assert config.database.busy_timeout_seconds == 5.0

    def test_missing_section_uses_defaults(self):
        """Existing config.yaml files predate the database section."""
        config = AppConfig.from_dict({"beatport": {"timeout": 45}})
        assert config.database.path is None
        assert config.database.busy_timeout_seconds == 5.0
        assert config.beatport.timeout == 45

    def test_timeout_coerced_from_string(self):
        """YAML may yield a string for a numeric field."""
        config = AppConfig.from_dict({"database": {"busy_timeout_seconds": "7.5"}})
        assert config.database.busy_timeout_seconds == 7.5
