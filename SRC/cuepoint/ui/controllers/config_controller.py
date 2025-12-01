#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config Controller - Business logic for configuration management

This controller handles configuration logic, separating business logic from UI presentation.
"""

from typing import Any, Dict, Optional

from cuepoint.services.interfaces import IConfigService


class ConfigController:
    """Controller for configuration management - handles config logic."""

    def __init__(self, config_service: Optional[IConfigService] = None):
        """
        Initialize config controller.

        Args:
            config_service: Optional IConfigService instance (for dependency injection)
        """
        self.config_service = config_service
        # Default preset values
        self.preset_values = {
            "balanced": {
                "TRACK_WORKERS": 12,
                "PER_TRACK_TIME_BUDGET_SEC": 45,
                "MIN_ACCEPT_SCORE": 70.0,
                "MAX_SEARCH_RESULTS": 50,
            },
            "fast": {
                "TRACK_WORKERS": 8,
                "PER_TRACK_TIME_BUDGET_SEC": 30,
                "MIN_ACCEPT_SCORE": 75.0,
                "MAX_SEARCH_RESULTS": 40,
            },
            "turbo": {
                "TRACK_WORKERS": 16,
                "PER_TRACK_TIME_BUDGET_SEC": 20,
                "MIN_ACCEPT_SCORE": 80.0,
                "MAX_SEARCH_RESULTS": 30,
            },
            "exhaustive": {
                "TRACK_WORKERS": 6,
                "PER_TRACK_TIME_BUDGET_SEC": 120,
                "MIN_ACCEPT_SCORE": 60.0,
                "MAX_SEARCH_RESULTS": 100,
            },
        }

    def get_preset_values(self, preset: str) -> Dict[str, Any]:
        """
        Get values for a preset.

        Args:
            preset: Preset name ("balanced", "fast", "turbo", "exhaustive")

        Returns:
            Dictionary of preset values
        """
        return self.preset_values.get(preset, self.preset_values["balanced"]).copy()

    def validate_settings(self, settings: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate settings values.

        Args:
            settings: Dictionary of settings to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Validate TRACK_WORKERS
        track_workers = settings.get("TRACK_WORKERS", 12)
        if not isinstance(track_workers, int) or track_workers < 1 or track_workers > 20:
            return False, "TRACK_WORKERS must be an integer between 1 and 20"

        # Validate PER_TRACK_TIME_BUDGET_SEC
        time_budget = settings.get("PER_TRACK_TIME_BUDGET_SEC", 45)
        if not isinstance(time_budget, (int, float)) or time_budget < 10 or time_budget > 300:
            return False, "PER_TRACK_TIME_BUDGET_SEC must be between 10 and 300 seconds"

        # Validate MIN_ACCEPT_SCORE
        min_score = settings.get("MIN_ACCEPT_SCORE", 70.0)
        if not isinstance(min_score, (int, float)) or min_score < 0 or min_score > 200:
            return False, "MIN_ACCEPT_SCORE must be between 0 and 200"

        # Validate MAX_SEARCH_RESULTS
        max_results = settings.get("MAX_SEARCH_RESULTS", 50)
        if not isinstance(max_results, int) or max_results < 10 or max_results > 200:
            return False, "MAX_SEARCH_RESULTS must be an integer between 10 and 200"

        return True, None

    def merge_settings_with_preset(
        self, preset: str, custom_settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Merge preset values with custom settings.

        Args:
            preset: Preset name
            custom_settings: Optional custom settings to override preset values

        Returns:
            Merged settings dictionary
        """
        # Start with preset values
        settings = self.get_preset_values(preset)

        # Override with custom settings if provided
        if custom_settings:
            settings.update(custom_settings)

        return settings

    def get_default_settings(self) -> Dict[str, Any]:
        """
        Get default settings (balanced preset).

        Returns:
            Dictionary of default settings
        """
        return self.get_preset_values("balanced")

    def apply_preset_to_settings(
        self, preset: str, current_settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply preset values to current settings.

        Args:
            preset: Preset name
            current_settings: Current settings dictionary

        Returns:
            Updated settings dictionary with preset values applied
        """
        preset_values = self.get_preset_values(preset)
        updated = current_settings.copy()
        updated.update(preset_values)
        return updated

    def get_config_value(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value from config service.

        Args:
            key: Configuration key
            default: Default value if key not found

        Returns:
            Configuration value or default
        """
        if self.config_service:
            return self.config_service.get(key, default)
        return default

    def set_config_value(self, key: str, value: Any) -> None:
        """
        Set configuration value in config service.

        Args:
            key: Configuration key
            value: Value to set
        """
        if self.config_service:
            self.config_service.set(key, value)
            self.config_service.save()






