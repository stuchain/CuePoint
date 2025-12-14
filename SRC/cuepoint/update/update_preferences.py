#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update preferences management.

Handles storage and retrieval of update preferences including:
- Check frequency
- Update channel (stable/beta)
- Ignored versions
- Last check timestamp
"""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from cuepoint.utils.paths import AppPaths


class UpdatePreferences:
    """
    Manages update preferences and state.
    
    Preferences are stored in a JSON file in the app data directory.
    """
    
    # Check frequency options
    CHECK_ON_STARTUP = "on_startup"
    CHECK_DAILY = "daily"
    CHECK_WEEKLY = "weekly"
    CHECK_MONTHLY = "monthly"
    CHECK_NEVER = "never"
    
    # Update channels
    CHANNEL_STABLE = "stable"
    CHANNEL_BETA = "beta"
    
    def __init__(self, preferences_file: Optional[Path] = None):
        """
        Initialize update preferences.
        
        Args:
            preferences_file: Optional path to preferences file.
                            If None, uses default location in app data directory.
        """
        if preferences_file is None:
            app_data = AppPaths.data_dir()
            preferences_file = app_data / "update_preferences.json"
        
        self.preferences_file = Path(preferences_file)
        self._lock = threading.Lock()
        self._preferences: dict = {}
        self._load_preferences()
    
    def _load_preferences(self) -> None:
        """Load preferences from file."""
        if self.preferences_file.exists():
            try:
                with open(self.preferences_file, 'r', encoding='utf-8') as f:
                    self._preferences = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                # If file is corrupted, start with defaults
                self._preferences = self._get_default_preferences()
        else:
            self._preferences = self._get_default_preferences()
            self._save_preferences()
    
    def _save_preferences(self) -> None:
        """Save preferences to file."""
        try:
            self.preferences_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.preferences_file, 'w', encoding='utf-8') as f:
                json.dump(self._preferences, f, indent=2, ensure_ascii=False)
        except IOError as e:
            # Log error but don't fail
            print(f"Warning: Could not save update preferences: {e}")
    
    def _get_default_preferences(self) -> dict:
        """Get default preferences."""
        return {
            "check_frequency": self.CHECK_ON_STARTUP,
            "channel": self.CHANNEL_STABLE,
            "ignored_versions": [],
            "last_check_timestamp": None,
            "last_check_result": None,
            "auto_download": False,
        }
    
    def get_check_frequency(self) -> str:
        """Get update check frequency."""
        return self._preferences.get("check_frequency", self.CHECK_ON_STARTUP)
    
    def set_check_frequency(self, frequency: str) -> None:
        """
        Set update check frequency.
        
        Args:
            frequency: One of CHECK_ON_STARTUP, CHECK_DAILY, CHECK_WEEKLY, CHECK_MONTHLY, CHECK_NEVER
        """
        with self._lock:
            self._preferences["check_frequency"] = frequency
            self._save_preferences()
    
    def get_channel(self) -> str:
        """Get update channel (stable or beta)."""
        return self._preferences.get("channel", self.CHANNEL_STABLE)
    
    def set_channel(self, channel: str) -> None:
        """
        Set update channel.
        
        Args:
            channel: One of CHANNEL_STABLE or CHANNEL_BETA
        """
        with self._lock:
            self._preferences["channel"] = channel
            self._save_preferences()
    
    def get_ignored_versions(self) -> List[str]:
        """Get list of ignored versions."""
        return self._preferences.get("ignored_versions", [])
    
    def is_version_ignored(self, version: str) -> bool:
        """Check if a version is ignored."""
        return version in self.get_ignored_versions()
    
    def ignore_version(self, version: str) -> None:
        """
        Add a version to the ignored list.
        
        Args:
            version: Version string to ignore
        """
        with self._lock:
            ignored = self.get_ignored_versions()
            if version not in ignored:
                ignored.append(version)
                self._preferences["ignored_versions"] = ignored
                self._save_preferences()
    
    def unignore_version(self, version: str) -> None:
        """
        Remove a version from the ignored list.
        
        Args:
            version: Version string to unignore
        """
        with self._lock:
            ignored = self.get_ignored_versions()
            if version in ignored:
                ignored.remove(version)
                self._preferences["ignored_versions"] = ignored
                self._save_preferences()
    
    def get_last_check_timestamp(self) -> Optional[datetime]:
        """Get timestamp of last update check."""
        timestamp_str = self._preferences.get("last_check_timestamp")
        if timestamp_str:
            try:
                return datetime.fromisoformat(timestamp_str)
            except (ValueError, TypeError):
                return None
        return None
    
    def set_last_check_timestamp(self, timestamp: Optional[datetime] = None) -> None:
        """
        Set timestamp of last update check.
        
        Args:
            timestamp: Timestamp to set. If None, uses current time.
        """
        with self._lock:
            if timestamp is None:
                timestamp = datetime.now()
            self._preferences["last_check_timestamp"] = timestamp.isoformat()
            self._save_preferences()
    
    def get_last_check_result(self) -> Optional[str]:
        """Get result of last update check."""
        return self._preferences.get("last_check_result")
    
    def set_last_check_result(self, result: Optional[str]) -> None:
        """
        Set result of last update check.
        
        Args:
            result: Result string (e.g., "update_available", "no_update", "error")
        """
        with self._lock:
            self._preferences["last_check_result"] = result
            self._save_preferences()
    
    def get_auto_download(self) -> bool:
        """Get auto-download setting."""
        return self._preferences.get("auto_download", False)
    
    def set_auto_download(self, enabled: bool) -> None:
        """
        Set auto-download setting.
        
        Args:
            enabled: Whether to auto-download updates
        """
        with self._lock:
            self._preferences["auto_download"] = enabled
            self._save_preferences()
    
    def should_check_now(self) -> bool:
        """
        Check if an update check should be performed now based on frequency.
        
        Returns:
            True if check should be performed, False otherwise
        """
        frequency = self.get_check_frequency()
        
        if frequency == self.CHECK_NEVER:
            return False
        
        if frequency == self.CHECK_ON_STARTUP:
            # Check on startup is handled separately
            return False
        
        last_check = self.get_last_check_timestamp()
        if last_check is None:
            return True
        
        from datetime import timedelta
        now = datetime.now()
        time_since_check = now - last_check
        
        if frequency == self.CHECK_DAILY:
            return time_since_check >= timedelta(days=1)
        elif frequency == self.CHECK_WEEKLY:
            return time_since_check >= timedelta(weeks=1)
        elif frequency == self.CHECK_MONTHLY:
            return time_since_check >= timedelta(days=30)
        
        return False
    
    def reset(self) -> None:
        """Reset preferences to defaults."""
        with self._lock:
            self._preferences = self._get_default_preferences()
            self._save_preferences()
