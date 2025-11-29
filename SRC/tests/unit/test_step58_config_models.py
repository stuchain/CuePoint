#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.8 configuration models.
"""

import pytest
from pathlib import Path

from cuepoint.models.config_models import (
    AppConfig,
    BeatportConfig,
    CacheConfig,
    ExportConfig,
    LoggingConfig,
    MatchingConfig,
    ProcessingConfig,
    UIConfig,
)


class TestBeatportConfig:
    """Test BeatportConfig model."""

    def test_default_values(self):
        """Test that BeatportConfig has correct default values."""
        config = BeatportConfig()
        assert config.base_url == "https://www.beatport.com"
        assert config.timeout == 30
        assert config.max_retries == 3
        assert config.rate_limit_delay == 1.0
        assert config.connect_timeout == 3
        assert config.read_timeout == 8

    def test_custom_values(self):
        """Test BeatportConfig with custom values."""
        config = BeatportConfig(timeout=60, max_retries=5)
        assert config.timeout == 60
        assert config.max_retries == 5
        assert config.base_url == "https://www.beatport.com"  # Default unchanged


class TestCacheConfig:
    """Test CacheConfig model."""

    def test_default_values(self):
        """Test that CacheConfig has correct default values."""
        config = CacheConfig()
        assert config.enabled is True
        assert config.max_size == 1000
        assert config.ttl_default == 3600
        assert config.ttl_search == 3600
        assert config.ttl_track == 86400


class TestProcessingConfig:
    """Test ProcessingConfig model."""

    def test_default_values(self):
        """Test that ProcessingConfig has correct default values."""
        config = ProcessingConfig()
        assert config.max_concurrent == 5
        assert config.timeout_per_track == 60
        assert config.min_confidence == 0.0
        assert config.max_candidates == 10
        assert config.track_workers == 12
        assert config.candidate_workers == 15
        assert config.per_track_time_budget_sec == 45
        assert config.max_search_results == 50


class TestExportConfig:
    """Test ExportConfig model."""

    def test_default_values(self):
        """Test that ExportConfig has correct default values."""
        config = ExportConfig()
        assert config.default_format == "csv"
        assert config.default_directory is None
        assert config.include_candidates is False

    def test_custom_directory(self):
        """Test ExportConfig with custom directory."""
        config = ExportConfig(default_directory=Path("/tmp/exports"))
        assert config.default_directory == Path("/tmp/exports")


class TestLoggingConfig:
    """Test LoggingConfig model."""

    def test_default_values(self):
        """Test that LoggingConfig has correct default values."""
        config = LoggingConfig()
        assert config.level == "INFO"
        assert config.file_enabled is True
        assert config.console_enabled is True
        assert config.log_dir is None
        assert config.max_file_size == 10 * 1024 * 1024
        assert config.backup_count == 5
        assert config.verbose is False
        assert config.trace is False


class TestUIConfig:
    """Test UIConfig model."""

    def test_default_values(self):
        """Test that UIConfig has correct default values."""
        config = UIConfig()
        assert config.theme == "default"
        assert config.font_size == 10
        assert config.window_width == 1200
        assert config.window_height == 800
        assert config.remember_window_size is True


class TestMatchingConfig:
    """Test MatchingConfig model."""

    def test_default_values(self):
        """Test that MatchingConfig has correct default values."""
        config = MatchingConfig()
        assert config.min_accept_score == 70.0
        assert config.early_exit_score == 90.0
        assert config.early_exit_min_queries == 8
        assert config.title_weight == 0.55
        assert config.artist_weight == 0.45


class TestAppConfig:
    """Test AppConfig model."""

    def test_default(self):
        """Test AppConfig.default() creates instance with defaults."""
        config = AppConfig.default()
        assert isinstance(config.beatport, BeatportConfig)
        assert isinstance(config.cache, CacheConfig)
        assert isinstance(config.processing, ProcessingConfig)
        assert isinstance(config.export, ExportConfig)
        assert isinstance(config.logging, LoggingConfig)
        assert isinstance(config.ui, UIConfig)
        assert isinstance(config.matching, MatchingConfig)

    def test_to_dict(self):
        """Test AppConfig.to_dict() converts to dictionary."""
        config = AppConfig.default()
        data = config.to_dict()

        assert isinstance(data, dict)
        assert "beatport" in data
        assert "cache" in data
        assert "processing" in data
        assert "export" in data
        assert "logging" in data
        assert "ui" in data
        assert "matching" in data

        assert data["beatport"]["timeout"] == 30
        assert data["cache"]["enabled"] is True
        assert data["processing"]["max_concurrent"] == 5

    def test_from_dict_empty(self):
        """Test AppConfig.from_dict() with empty dictionary."""
        config = AppConfig.from_dict({})
        # Should use defaults
        assert config.beatport.timeout == 30
        assert config.cache.enabled is True

    def test_from_dict_partial(self):
        """Test AppConfig.from_dict() with partial data."""
        data = {
            "beatport": {"timeout": 60, "max_retries": 5},
            "cache": {"enabled": False},
        }
        config = AppConfig.from_dict(data)

        assert config.beatport.timeout == 60
        assert config.beatport.max_retries == 5
        assert config.cache.enabled is False
        # Other values should remain defaults
        assert config.beatport.base_url == "https://www.beatport.com"
        assert config.processing.max_concurrent == 5

    def test_from_dict_with_paths(self):
        """Test AppConfig.from_dict() with path strings."""
        data = {
            "export": {"default_directory": "/tmp/exports"},
            "logging": {"log_dir": "/tmp/logs"},
        }
        config = AppConfig.from_dict(data)

        assert config.export.default_directory == Path("/tmp/exports")
        assert config.logging.log_dir == Path("/tmp/logs")

    def test_from_dict_none_paths(self):
        """Test AppConfig.from_dict() with None paths."""
        data = {
            "export": {"default_directory": None},
            "logging": {"log_dir": None},
        }
        config = AppConfig.from_dict(data)

        assert config.export.default_directory is None
        assert config.logging.log_dir is None

    def test_round_trip(self):
        """Test that to_dict() and from_dict() are inverse operations."""
        original = AppConfig.default()
        original.beatport.timeout = 60
        original.cache.enabled = False
        original.processing.max_concurrent = 10

        data = original.to_dict()
        restored = AppConfig.from_dict(data)

        assert restored.beatport.timeout == 60
        assert restored.cache.enabled is False
        assert restored.processing.max_concurrent == 10

