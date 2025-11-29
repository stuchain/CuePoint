#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Configuration model classes for Step 5.8.

Structured configuration models using dataclasses for type safety and validation.
These models work alongside the existing SETTINGS dictionary for backward compatibility.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional


@dataclass
class BeatportConfig:
    """Beatport API configuration."""

    base_url: str = "https://www.beatport.com"
    timeout: int = 30
    max_retries: int = 3
    rate_limit_delay: float = 1.0
    connect_timeout: int = 3
    read_timeout: int = 8


@dataclass
class CacheConfig:
    """Cache configuration."""

    enabled: bool = True
    max_size: int = 1000
    ttl_default: int = 3600
    ttl_search: int = 3600
    ttl_track: int = 86400


@dataclass
class ProcessingConfig:
    """Processing configuration."""

    max_concurrent: int = 5
    timeout_per_track: int = 60
    min_confidence: float = 0.0
    max_candidates: int = 10
    track_workers: int = 12
    candidate_workers: int = 15
    per_track_time_budget_sec: int = 45
    max_search_results: int = 50


@dataclass
class ExportConfig:
    """Export configuration."""

    default_format: str = "csv"
    default_directory: Optional[Path] = None
    include_candidates: bool = False


@dataclass
class LoggingConfig:
    """Logging configuration."""

    level: str = "INFO"
    file_enabled: bool = True
    console_enabled: bool = True
    log_dir: Optional[Path] = None
    max_file_size: int = 10 * 1024 * 1024  # 10 MB
    backup_count: int = 5
    verbose: bool = False
    trace: bool = False


@dataclass
class UIConfig:
    """UI configuration."""

    theme: str = "default"
    font_size: int = 10
    window_width: int = 1200
    window_height: int = 800
    remember_window_size: bool = True


@dataclass
class MatchingConfig:
    """Matching and scoring configuration."""

    min_accept_score: float = 70.0
    early_exit_score: float = 90.0
    early_exit_min_queries: int = 8
    title_weight: float = 0.55
    artist_weight: float = 0.45


@dataclass
class AppConfig:
    """Main application configuration.

    This is the root configuration model that contains all sub-configurations.
    It supports loading from multiple sources (file, environment, CLI) with proper precedence.
    """

    beatport: BeatportConfig = field(default_factory=BeatportConfig)
    cache: CacheConfig = field(default_factory=CacheConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    export: ExportConfig = field(default_factory=ExportConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    ui: UIConfig = field(default_factory=UIConfig)
    matching: MatchingConfig = field(default_factory=MatchingConfig)

    @classmethod
    def default(cls) -> "AppConfig":
        """Create default configuration.

        Returns:
            AppConfig instance with all default values.
        """
        return cls()

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary.

        Returns:
            Dictionary representation of configuration.
        """
        return {
            "beatport": {
                "base_url": self.beatport.base_url,
                "timeout": self.beatport.timeout,
                "max_retries": self.beatport.max_retries,
                "rate_limit_delay": self.beatport.rate_limit_delay,
                "connect_timeout": self.beatport.connect_timeout,
                "read_timeout": self.beatport.read_timeout,
            },
            "cache": {
                "enabled": self.cache.enabled,
                "max_size": self.cache.max_size,
                "ttl_default": self.cache.ttl_default,
                "ttl_search": self.cache.ttl_search,
                "ttl_track": self.cache.ttl_track,
            },
            "processing": {
                "max_concurrent": self.processing.max_concurrent,
                "timeout_per_track": self.processing.timeout_per_track,
                "min_confidence": self.processing.min_confidence,
                "max_candidates": self.processing.max_candidates,
                "track_workers": self.processing.track_workers,
                "candidate_workers": self.processing.candidate_workers,
                "per_track_time_budget_sec": self.processing.per_track_time_budget_sec,
                "max_search_results": self.processing.max_search_results,
            },
            "export": {
                "default_format": self.export.default_format,
                "default_directory": str(self.export.default_directory) if self.export.default_directory else None,
                "include_candidates": self.export.include_candidates,
            },
            "logging": {
                "level": self.logging.level,
                "file_enabled": self.logging.file_enabled,
                "console_enabled": self.logging.console_enabled,
                "log_dir": str(self.logging.log_dir) if self.logging.log_dir else None,
                "max_file_size": self.logging.max_file_size,
                "backup_count": self.logging.backup_count,
                "verbose": self.logging.verbose,
                "trace": self.logging.trace,
            },
            "ui": {
                "theme": self.ui.theme,
                "font_size": self.ui.font_size,
                "window_width": self.ui.window_width,
                "window_height": self.ui.window_height,
                "remember_window_size": self.ui.remember_window_size,
            },
            "matching": {
                "min_accept_score": self.matching.min_accept_score,
                "early_exit_score": self.matching.early_exit_score,
                "early_exit_min_queries": self.matching.early_exit_min_queries,
                "title_weight": self.matching.title_weight,
                "artist_weight": self.matching.artist_weight,
            },
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AppConfig":
        """Create configuration from dictionary.

        Args:
            data: Dictionary with configuration values.

        Returns:
            AppConfig instance created from dictionary.
        """
        config = cls.default()

        if "beatport" in data:
            beatport_data = data["beatport"]
            config.beatport = BeatportConfig(
                base_url=beatport_data.get("base_url", config.beatport.base_url),
                timeout=beatport_data.get("timeout", config.beatport.timeout),
                max_retries=beatport_data.get("max_retries", config.beatport.max_retries),
                rate_limit_delay=beatport_data.get("rate_limit_delay", config.beatport.rate_limit_delay),
                connect_timeout=beatport_data.get("connect_timeout", config.beatport.connect_timeout),
                read_timeout=beatport_data.get("read_timeout", config.beatport.read_timeout),
            )

        if "cache" in data:
            cache_data = data["cache"]
            config.cache = CacheConfig(
                enabled=cache_data.get("enabled", config.cache.enabled),
                max_size=cache_data.get("max_size", config.cache.max_size),
                ttl_default=cache_data.get("ttl_default", config.cache.ttl_default),
                ttl_search=cache_data.get("ttl_search", config.cache.ttl_search),
                ttl_track=cache_data.get("ttl_track", config.cache.ttl_track),
            )

        if "processing" in data:
            processing_data = data["processing"]
            config.processing = ProcessingConfig(
                max_concurrent=processing_data.get("max_concurrent", config.processing.max_concurrent),
                timeout_per_track=processing_data.get("timeout_per_track", config.processing.timeout_per_track),
                min_confidence=processing_data.get("min_confidence", config.processing.min_confidence),
                max_candidates=processing_data.get("max_candidates", config.processing.max_candidates),
                track_workers=processing_data.get("track_workers", config.processing.track_workers),
                candidate_workers=processing_data.get("candidate_workers", config.processing.candidate_workers),
                per_track_time_budget_sec=processing_data.get(
                    "per_track_time_budget_sec", config.processing.per_track_time_budget_sec
                ),
                max_search_results=processing_data.get("max_search_results", config.processing.max_search_results),
            )

        if "export" in data:
            export_data = data["export"]
            default_dir = export_data.get("default_directory")
            config.export = ExportConfig(
                default_format=export_data.get("default_format", config.export.default_format),
                default_directory=Path(default_dir) if default_dir else None,
                include_candidates=export_data.get("include_candidates", config.export.include_candidates),
            )

        if "logging" in data:
            logging_data = data["logging"]
            log_dir = logging_data.get("log_dir")
            config.logging = LoggingConfig(
                level=logging_data.get("level", config.logging.level),
                file_enabled=logging_data.get("file_enabled", config.logging.file_enabled),
                console_enabled=logging_data.get("console_enabled", config.logging.console_enabled),
                log_dir=Path(log_dir) if log_dir else None,
                max_file_size=logging_data.get("max_file_size", config.logging.max_file_size),
                backup_count=logging_data.get("backup_count", config.logging.backup_count),
                verbose=logging_data.get("verbose", config.logging.verbose),
                trace=logging_data.get("trace", config.logging.trace),
            )

        if "ui" in data:
            ui_data = data["ui"]
            config.ui = UIConfig(
                theme=ui_data.get("theme", config.ui.theme),
                font_size=ui_data.get("font_size", config.ui.font_size),
                window_width=ui_data.get("window_width", config.ui.window_width),
                window_height=ui_data.get("window_height", config.ui.window_height),
                remember_window_size=ui_data.get("remember_window_size", config.ui.remember_window_size),
            )

        if "matching" in data:
            matching_data = data["matching"]
            config.matching = MatchingConfig(
                min_accept_score=matching_data.get("min_accept_score", config.matching.min_accept_score),
                early_exit_score=matching_data.get("early_exit_score", config.matching.early_exit_score),
                early_exit_min_queries=matching_data.get("early_exit_min_queries", config.matching.early_exit_min_queries),
                title_weight=matching_data.get("title_weight", config.matching.title_weight),
                artist_weight=matching_data.get("artist_weight", config.matching.artist_weight),
            )

        return config

