#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config Service Implementation

Service for managing configuration settings with support for multiple sources:
1. Command-line arguments (highest priority)
2. Environment variables
3. User configuration file (~/.cuepoint/config.yaml)
4. Default configuration (lowest priority)
"""

import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import yaml  # type: ignore[import-untyped]

from cuepoint.exceptions.cuepoint_exceptions import ConfigurationError
from cuepoint.models.config import SETTINGS
from cuepoint.models.config_models import AppConfig
from cuepoint.services.interfaces import IConfigService


class ConfigService(IConfigService):
    """Implementation of configuration service with multiple sources support."""

    def __init__(self, config_file: Optional[Path] = None, settings: Optional[Dict[str, Any]] = None):
        """Initialize configuration service.

        Args:
            config_file: Optional path to configuration file. Defaults to user config dir.
            settings: Optional dictionary of legacy settings for backward compatibility.
        """
        # Determine config file path
        if config_file is None:
            config_dir = Path.home() / ".cuepoint"
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / "config.yaml"

        self.config_file = config_file
        self._legacy_settings: Dict[str, Any] = settings.copy() if settings else SETTINGS.copy()
        self.config = AppConfig.default()

        # Configuration change notification callbacks
        # Callbacks are called with (key: str, old_value: Any, new_value: Any)
        self._change_callbacks: List[Callable[[str, Any, Any], None]] = []

        # Load configuration from all sources
        self.load()

    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key (supports dot notation).

        Args:
            key: Configuration key. Supports dot notation (e.g., "beatport.timeout").
                 Also supports legacy flat keys (e.g., "MAX_SEARCH_RESULTS").
            default: Default value if key not found.

        Returns:
            Configuration value or default.

        Example:
            >>> service.get("beatport.timeout")
            30
            >>> service.get("MAX_SEARCH_RESULTS")
            50
        """
        # Try dot notation first (new structured config)
        if "." in key:
            keys = key.split(".")
            value = self.config

            try:
                for k in keys:
                    value = getattr(value, k)
                return value
            except AttributeError:
                pass

        # Fall back to legacy flat settings
        return self._legacy_settings.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set configuration value by key (supports dot notation).

        Args:
            key: Configuration key in dot notation (e.g., "beatport.timeout").
                 Also supports legacy flat keys (e.g., "MAX_SEARCH_RESULTS").
            value: Value to set.

        Example:
            >>> service.set("beatport.timeout", 60)
            >>> service.set("MAX_SEARCH_RESULTS", 100)
        """
        # Get old value for notification
        old_value = self.get(key)

        # Try dot notation first (new structured config)
        if "." in key:
            keys = key.split(".")
            obj = self.config

            # Navigate to parent object
            for k in keys[:-1]:
                obj = getattr(obj, k)

            # Set value
            setattr(obj, keys[-1], value)
        else:
            # Fall back to legacy flat settings
            self._legacy_settings[key] = value

        # Notify all registered callbacks
        self._notify_change(key, old_value, value)

    def register_change_callback(self, callback: Callable[[str, Any, Any], None]) -> None:
        """Register a callback to be notified when configuration changes.

        Args:
            callback: Function that will be called with (key: str, old_value: Any, new_value: Any)
                     when a configuration value changes.

        Example:
            >>> def on_config_change(key, old_value, new_value):
            ...     print(f"Config {key} changed from {old_value} to {new_value}")
            >>> service.register_change_callback(on_config_change)
            >>> service.set("beatport.timeout", 60)
            Config beatport.timeout changed from 30 to 60
        """
        if callback not in self._change_callbacks:
            self._change_callbacks.append(callback)

    def unregister_change_callback(self, callback: Callable[[str, Any, Any], None]) -> None:
        """Unregister a configuration change callback.

        Args:
            callback: Callback function to remove.
        """
        if callback in self._change_callbacks:
            self._change_callbacks.remove(callback)

    def _notify_change(self, key: str, old_value: Any, new_value: Any) -> None:
        """Notify all registered callbacks of a configuration change.

        Args:
            key: Configuration key that changed.
            old_value: Previous value.
            new_value: New value.
        """
        for callback in self._change_callbacks:
            try:
                callback(key, old_value, new_value)
            except Exception as e:
                # Don't let callback errors break the config service
                # In production, this should be logged
                print(f"Error in config change callback: {e}")

    def save(self) -> None:
        """Save configuration to persistent storage (YAML file)."""
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_file, "w", encoding="utf-8") as f:
                yaml.dump(self.config.to_dict(), f, default_flow_style=False, sort_keys=False)
        except Exception as e:
            raise ConfigurationError(
                message=f"Failed to save configuration: {e}",
                error_code="CONFIG_SAVE_ERROR",
                context={"config_file": str(self.config_file)},
            ) from e

    def load(self) -> None:
        """Load configuration from multiple sources in priority order.

        Priority (highest to lowest):
        1. Command-line arguments (applied via set() after load)
        2. Environment variables
        3. User configuration file
        4. Default configuration
        """
        # Start with defaults
        self.config = AppConfig.default()

        # Load from file if exists
        if self.config_file.exists():
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    file_data = yaml.safe_load(f) or {}
                    self.config = AppConfig.from_dict(file_data)
            except Exception as e:
                # Log warning but continue with defaults
                # Don't raise - allow app to start with defaults
                print(f"Warning: Failed to load config file {self.config_file}: {e}")

        # Override with environment variables
        self._load_from_env()

        # Validate configuration
        errors = self.validate()
        if errors:
            # Don't raise - just log warnings
            print(f"Warning: Configuration validation errors: {', '.join(errors)}")

    def load_from_file(self, file_path: str) -> None:
        """Load configuration from a specific YAML file.

        This method loads configuration from the specified file and merges it
        with existing configuration. Settings from the file will override
        current settings but can still be overridden by subsequent set() calls.

        Args:
            file_path: Path to YAML configuration file.

        Raises:
            FileNotFoundError: If the file doesn't exist.
            yaml.YAMLError: If the YAML file is invalid.
            ValueError: If the YAML contains invalid values.
        """
        from pathlib import Path

        config_path = Path(file_path)
        if not config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {file_path}")

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                file_data = yaml.safe_load(f) or {}
                # Merge with existing config
                loaded_config = AppConfig.from_dict(file_data)
                # Update current config with loaded values
                # This is a simple merge - loaded values override existing
                for key, value in loaded_config.__dict__.items():
                    if value is not None:
                        setattr(self.config, key, value)

                # Also update legacy settings for backward compatibility
                # Flatten the loaded config to legacy format
                if isinstance(file_data, dict):
                    flattened = self._flatten_dict(file_data)
                    for key, value in flattened.items():
                        # Map to legacy keys if needed
                        legacy_key = self._map_to_legacy_key(key)
                        if legacy_key:
                            self._legacy_settings[legacy_key] = value
        except yaml.YAMLError as e:
            raise ValueError(f"Invalid YAML in configuration file {file_path}: {e}") from e

    def _flatten_dict(self, d: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, Any]:
        """Flatten nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _map_to_legacy_key(self, key: str) -> Optional[str]:
        """Map new dot-notation key to legacy flat key."""
        # Simple mapping - can be extended
        mapping = {
            "performance.candidate_workers": "CANDIDATE_WORKERS",
            "performance.track_workers": "TRACK_WORKERS",
            "performance.time_budget_sec": "PER_TRACK_TIME_BUDGET_SEC",
            "performance.max_search_results": "MAX_SEARCH_RESULTS",
            "matching.min_accept_score": "MIN_ACCEPT_SCORE",
            "matching.early_exit_score": "EARLY_EXIT_SCORE",
            "logging.verbose": "VERBOSE",
            "logging.trace": "TRACE",
            "cache.enabled": "ENABLE_CACHE",
        }
        return mapping.get(key, key.upper().replace(".", "_"))

    def _load_from_env(self) -> None:
        """Load configuration from environment variables."""
        env_mappings = {
            "CUEPOINT_BEATPORT_TIMEOUT": ("beatport.timeout", int),
            "CUEPOINT_BEATPORT_MAX_RETRIES": ("beatport.max_retries", int),
            "CUEPOINT_BEATPORT_CONNECT_TIMEOUT": ("beatport.connect_timeout", int),
            "CUEPOINT_BEATPORT_READ_TIMEOUT": ("beatport.read_timeout", int),
            "CUEPOINT_CACHE_ENABLED": ("cache.enabled", lambda x: x.lower() in ("true", "1", "yes")),
            "CUEPOINT_CACHE_MAX_SIZE": ("cache.max_size", int),
            "CUEPOINT_PROCESSING_MAX_CONCURRENT": ("processing.max_concurrent", int),
            "CUEPOINT_PROCESSING_TRACK_WORKERS": ("processing.track_workers", int),
            "CUEPOINT_PROCESSING_CANDIDATE_WORKERS": ("processing.candidate_workers", int),
            "CUEPOINT_PROCESSING_TIME_BUDGET": ("processing.per_track_time_budget_sec", int),
            "CUEPOINT_LOGGING_LEVEL": ("logging.level", str),
            "CUEPOINT_LOGGING_FILE_ENABLED": ("logging.file_enabled", lambda x: x.lower() in ("true", "1", "yes")),
            "CUEPOINT_LOGGING_CONSOLE_ENABLED": ("logging.console_enabled", lambda x: x.lower() in ("true", "1", "yes")),
            "CUEPOINT_LOGGING_VERBOSE": ("logging.verbose", lambda x: x.lower() in ("true", "1", "yes")),
            "CUEPOINT_MATCHING_MIN_ACCEPT_SCORE": ("matching.min_accept_score", float),
            "CUEPOINT_MATCHING_EARLY_EXIT_SCORE": ("matching.early_exit_score", float),
        }

        for env_var, (config_key, type_converter) in env_mappings.items():
            value = os.getenv(env_var)
            if value is not None:
                try:
                    converted_value = type_converter(value)
                    self.set(config_key, converted_value)
                except (ValueError, TypeError):
                    # Skip invalid environment variables
                    pass

    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        # Store old config for notifications
        old_config = self.config
        self.config = AppConfig.default()

        # Notify about all changes (simplified - notify about key sections)
        # In a more sophisticated implementation, we could track individual field changes
        for callback in self._change_callbacks:
            try:
                # Notify that config was reset (key="*" indicates full reset)
                callback("*", old_config, self.config)
            except Exception as e:
                print(f"Error in config change callback: {e}")

        self.save()

    def validate(self) -> List[str]:
        """Validate configuration.

        Returns:
            List of validation errors (empty if valid).
        """
        errors: List[str] = []

        # Validate beatport config
        if self.config.beatport.timeout < 1:
            errors.append("beatport.timeout must be >= 1")
        if self.config.beatport.max_retries < 0:
            errors.append("beatport.max_retries must be >= 0")
        if self.config.beatport.connect_timeout < 1:
            errors.append("beatport.connect_timeout must be >= 1")
        if self.config.beatport.read_timeout < 1:
            errors.append("beatport.read_timeout must be >= 1")

        # Validate cache config
        if self.config.cache.max_size < 1:
            errors.append("cache.max_size must be >= 1")
        if self.config.cache.ttl_default < 0:
            errors.append("cache.ttl_default must be >= 0")
        if self.config.cache.ttl_search < 0:
            errors.append("cache.ttl_search must be >= 0")
        if self.config.cache.ttl_track < 0:
            errors.append("cache.ttl_track must be >= 0")

        # Validate processing config
        if self.config.processing.max_concurrent < 1:
            errors.append("processing.max_concurrent must be >= 1")
        if self.config.processing.track_workers < 1:
            errors.append("processing.track_workers must be >= 1")
        if self.config.processing.candidate_workers < 1:
            errors.append("processing.candidate_workers must be >= 1")
        if self.config.processing.timeout_per_track < 1:
            errors.append("processing.timeout_per_track must be >= 1")
        if not 0.0 <= self.config.processing.min_confidence <= 1.0:
            errors.append("processing.min_confidence must be between 0.0 and 1.0")
        if self.config.processing.max_candidates < 1:
            errors.append("processing.max_candidates must be >= 1")
        if self.config.processing.max_search_results < 1:
            errors.append("processing.max_search_results must be >= 1")

        # Validate logging config
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.config.logging.level.upper() not in valid_levels:
            errors.append(f"logging.level must be one of {valid_levels}")
        if self.config.logging.max_file_size < 1024:  # At least 1 KB
            errors.append("logging.max_file_size must be >= 1024")
        if self.config.logging.backup_count < 0:
            errors.append("logging.backup_count must be >= 0")

        # Validate matching config
        if not 0.0 <= self.config.matching.min_accept_score <= 200.0:
            errors.append("matching.min_accept_score must be between 0.0 and 200.0")
        if not 0.0 <= self.config.matching.early_exit_score <= 200.0:
            errors.append("matching.early_exit_score must be between 0.0 and 200.0")
        if self.config.matching.early_exit_min_queries < 0:
            errors.append("matching.early_exit_min_queries must be >= 0")
        if not 0.0 <= self.config.matching.title_weight <= 1.0:
            errors.append("matching.title_weight must be between 0.0 and 1.0")
        if not 0.0 <= self.config.matching.artist_weight <= 1.0:
            errors.append("matching.artist_weight must be between 0.0 and 1.0")

        # Validate export config
        valid_formats = ["csv", "json", "excel", "xlsx"]
        if self.config.export.default_format.lower() not in valid_formats:
            errors.append(f"export.default_format must be one of {valid_formats}")

        return errors
