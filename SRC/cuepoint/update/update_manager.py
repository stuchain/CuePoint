#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update manager implementation.

Coordinates update checking, notification, and installation.
"""

import platform
import threading
from datetime import datetime, timedelta
from typing import Callable, Dict, Optional

from cuepoint.update.update_checker import UpdateChecker, UpdateCheckError
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import compare_versions


class UpdateManager:
    """
    Manages the update checking and notification process.
    
    Coordinates between update checker, preferences, and UI.
    """
    
    def __init__(
        self,
        current_version: str,
        feed_url: str = "https://stuchain.github.io/CuePoint/updates",
        preferences: Optional[UpdatePreferences] = None
    ):
        """
        Initialize update manager.
        
        Args:
            current_version: Current application version
            feed_url: Base URL for update feeds
            preferences: Update preferences instance (creates new if None)
        """
        self.current_version = current_version
        self.feed_url = feed_url
        self.preferences = preferences or UpdatePreferences()
        
        # Get platform
        system = platform.system().lower()
        if system == "darwin":
            self.platform = "macos"
        elif system == "windows":
            self.platform = "windows"
        else:
            self.platform = "unknown"
        
        # Create checker
        channel = self.preferences.get_channel()
        self.checker = UpdateChecker(feed_url, current_version, channel)
        
        # State
        self._lock = threading.Lock()
        self._checking = False
        self._update_available: Optional[Dict] = None
        
        # Callbacks
        self._on_update_available: Optional[Callable[[Dict], None]] = None
        self._on_check_complete: Optional[Callable[[bool, Optional[str]], None]] = None
        self._on_error: Optional[Callable[[str], None]] = None
    
    def set_on_update_available(self, callback: Callable[[Dict], None]) -> None:
        """
        Set callback for when update is available.
        
        Args:
            callback: Function called with update info dict when update found
        """
        self._on_update_available = callback
    
    def set_on_check_complete(self, callback: Callable[[bool, Optional[str]], None]) -> None:
        """
        Set callback for when check completes.
        
        Args:
            callback: Function called with (update_available: bool, error: Optional[str])
        """
        self._on_check_complete = callback
    
    def set_on_error(self, callback: Callable[[str], None]) -> None:
        """
        Set callback for errors.
        
        Args:
            callback: Function called with error message
        """
        self._on_error = callback
    
    def check_for_updates(self, force: bool = False) -> bool:
        """
        Check for available updates.
        
        Args:
            force: If True, check even if recently checked
            
        Returns:
            True if check was initiated, False if skipped
        """
        with self._lock:
            if self._checking:
                return False
            self._checking = True
        
        # Check if check is needed
        if not force:
            if not self._should_check():
                with self._lock:
                    self._checking = False
                return False
        
        # Start check in background thread
        thread = threading.Thread(target=self._do_check, daemon=True)
        thread.start()
        
        return True
    
    def _should_check(self) -> bool:
        """Check if update check should be performed."""
        # Check frequency preference
        if not self.preferences.should_check_now():
            # Also check on startup if enabled
            frequency = self.preferences.get_check_frequency()
            if frequency == UpdatePreferences.CHECK_ON_STARTUP:
                last_check = self.preferences.get_last_check_timestamp()
                if last_check is None:
                    return True
                # Don't check if checked within last hour
                if datetime.now() - last_check < timedelta(hours=1):
                    return False
                return True
            return False
        
        return True
    
    def _do_check(self) -> None:
        """Perform update check in background thread."""
        try:
            # Update channel if changed
            channel = self.preferences.get_channel()
            if self.checker.channel != channel:
                self.checker = UpdateChecker(self.feed_url, self.current_version, channel)
            
            # Check for updates
            update_info = self.checker.check_for_updates(self.platform)
            
            # Check if version is ignored
            if update_info:
                version = update_info.get('version') or update_info.get('short_version')
                if version and self.preferences.is_version_ignored(version):
                    update_info = None
            
            # Update state
            with self._lock:
                self._update_available = update_info
                self._checking = False
            
            # Update preferences
            self.preferences.set_last_check_timestamp()
            if update_info:
                self.preferences.set_last_check_result("update_available")
            else:
                self.preferences.set_last_check_result("no_update")
            
            # Call callbacks on main thread using QTimer
            # This ensures UI updates happen on the correct thread
            try:
                from PySide6.QtCore import QTimer
                
                if update_info and self._on_update_available:
                    QTimer.singleShot(0, lambda: self._on_update_available(update_info))
                
                if self._on_check_complete:
                    QTimer.singleShot(0, lambda: self._on_check_complete(update_info is not None, None))
            except ImportError:
                # Fallback if Qt not available (shouldn't happen in GUI app)
                if update_info and self._on_update_available:
                    self._on_update_available(update_info)
                if self._on_check_complete:
                    self._on_check_complete(update_info is not None, None)
        
        except UpdateCheckError as e:
            with self._lock:
                self._checking = False
            
            self.preferences.set_last_check_timestamp()
            self.preferences.set_last_check_result("error")
            
            try:
                from PySide6.QtCore import QTimer
                
                if self._on_error:
                    QTimer.singleShot(0, lambda: self._on_error(str(e)))
                if self._on_check_complete:
                    QTimer.singleShot(0, lambda: self._on_check_complete(False, str(e)))
            except ImportError:
                if self._on_error:
                    self._on_error(str(e))
                if self._on_check_complete:
                    self._on_check_complete(False, str(e))
        
        except Exception as e:
            with self._lock:
                self._checking = False
            
            error_msg = f"Unexpected error during update check: {e}"
            
            try:
                from PySide6.QtCore import QTimer
                
                if self._on_error:
                    QTimer.singleShot(0, lambda: self._on_error(error_msg))
                        QTimer.singleShot(0, lambda: self._on_check_complete(False, error_msg))
            except ImportError:
                if self._on_error:
                    self._on_error(error_msg)
                if self._on_check_complete:
                    self._on_check_complete(False, error_msg)
    
    def get_update_info(self) -> Optional[Dict]:
        """
        Get information about available update.
        
        Returns:
            Update info dict or None if no update available
        """
        with self._lock:
            return self._update_available.copy() if self._update_available else None
    
    def is_checking(self) -> bool:
        """Check if update check is in progress."""
        with self._lock:
            return self._checking
    
    def has_update(self) -> bool:
        """Check if update is available."""
        with self._lock:
            return self._update_available is not None
    
    def ignore_update(self, version: Optional[str] = None) -> None:
        """
        Ignore the current update.
        
        Args:
            version: Version to ignore (uses current update version if None)
        """
        if version is None:
            update_info = self.get_update_info()
            if update_info:
                version = update_info.get('version') or update_info.get('short_version')
        
        if version:
            self.preferences.ignore_version(version)
            
            # Clear update if it's the one being ignored
            with self._lock:
                if self._update_available:
                    current_version = self._update_available.get('version') or self._update_available.get('short_version')
                    if current_version == version:
                        self._update_available = None
