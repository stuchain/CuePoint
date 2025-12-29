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
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Starting update check: current={self.current_version}, platform={self.platform}, channel={self.checker.channel}")
            
            update_info = self.checker.check_for_updates(self.platform)
            
            logger.info(f"Update check result: update_info={'available' if update_info else 'none'}")
            if update_info:
                version = update_info.get('version') or update_info.get('short_version')
                logger.info(f"Found update: version={version}")
                
                # Check if version is ignored
                if version and self.preferences.is_version_ignored(version):
                    logger.info(f"Update version {version} is ignored by user preferences")
                    update_info = None
            else:
                logger.info(f"No update available (current: {self.current_version} is latest or newer)")
            
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
                from PySide6.QtCore import QTimer, QApplication
                
                # Get QApplication instance to ensure we're in Qt context
                app = QApplication.instance()
                if app is None:
                    logger.warning("QApplication instance not found, callbacks may not work")
                    # Fallback: try direct call (may fail if not on main thread)
                    if update_info and self._on_update_available:
                        try:
                            self._on_update_available(update_info)
                        except Exception as e:
                            logger.error(f"Error calling update available callback: {e}")
                    if self._on_check_complete:
                        try:
                            self._on_check_complete(update_info is not None, None)
                        except Exception as e:
                            logger.error(f"Error calling check complete callback: {e}")
                else:
                    # Use QTimer to schedule on main thread
                    # Capture update_info in closure to avoid reference issues
                    update_info_copy = update_info.copy() if update_info else None
                    
                    if update_info_copy and self._on_update_available:
                        logger.info(f"Scheduling update available callback on main thread (version: {update_info_copy.get('short_version')})")
                        # Store callback reference to avoid closure issues
                        callback_ref = self._on_update_available
                        QTimer.singleShot(0, lambda info=update_info_copy: self._safe_call_callback(
                            callback_ref, info, callback_name="update_available"
                        ))
                    
                    if self._on_check_complete:
                        has_update = update_info is not None
                        callback_ref = self._on_check_complete
                        QTimer.singleShot(0, lambda has_upd=has_update: self._safe_call_callback(
                            callback_ref, has_upd, None, callback_name="check_complete"
                        ))
            except ImportError:
                # Fallback if Qt not available (shouldn't happen in GUI app)
                # This can happen in non-GUI contexts or unusual packaging environments.
                # Don't spam users with a warning; fall back quietly.
                logger.debug("PySide6 not available, using direct callback")
                if update_info and self._on_update_available:
                    self._on_update_available(update_info)
                if self._on_check_complete:
                    self._on_check_complete(update_info is not None, None)
            except Exception as e:
                logger.error(f"Error scheduling callbacks: {e}")
                import traceback
                logger.error(traceback.format_exc())
        
        except UpdateCheckError as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Update check failed: {e}")
            
            with self._lock:
                self._checking = False
            
            self.preferences.set_last_check_timestamp()
            self.preferences.set_last_check_result("error")
            
            error_msg = str(e)
            try:
                from PySide6.QtCore import QTimer, QApplication
                
                app = QApplication.instance()
                if app is None:
                    logger.warning("QApplication instance not found, using direct callback")
                    if self._on_error:
                        self._on_error(error_msg)
                    if self._on_check_complete:
                        self._on_check_complete(False, error_msg)
                else:
                    # Use QTimer to ensure callback runs on main thread
                    if self._on_error:
                        callback_ref = self._on_error
                        QTimer.singleShot(0, lambda msg=error_msg: self._safe_call_callback(
                            callback_ref, msg, callback_name="error"
                        ))
                    if self._on_check_complete:
                        callback_ref = self._on_check_complete
                        QTimer.singleShot(0, lambda msg=error_msg: self._safe_call_callback(
                            callback_ref, False, msg, callback_name="check_complete"
                        ))
            except ImportError:
                logger.warning("PySide6 not available, using direct callback")
                if self._on_error:
                    self._on_error(error_msg)
                if self._on_check_complete:
                    self._on_check_complete(False, error_msg)
        
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Unexpected error during update check: {e}", exc_info=True)
            
            with self._lock:
                self._checking = False
            
            error_msg = f"Unexpected error during update check: {e}"
            
            try:
                from PySide6.QtCore import QTimer, QApplication
                
                app = QApplication.instance()
                if app is None:
                    logger.warning("QApplication instance not found, using direct callback")
                    if self._on_error:
                        self._on_error(error_msg)
                    if self._on_check_complete:
                        self._on_check_complete(False, error_msg)
                else:
                    # Use QTimer to ensure callback runs on main thread
                    if self._on_error:
                        callback_ref = self._on_error
                        QTimer.singleShot(0, lambda msg=error_msg: self._safe_call_callback(
                            callback_ref, msg, callback_name="error"
                        ))
                    if self._on_check_complete:
                        callback_ref = self._on_check_complete
                        QTimer.singleShot(0, lambda msg=error_msg: self._safe_call_callback(
                            callback_ref, False, msg, callback_name="check_complete"
                        ))
            except ImportError:
                logger.warning("PySide6 not available, using direct callback")
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
    
    def _safe_call_callback(self, callback, *args, callback_name: str = "callback") -> None:
        """Safely call a callback with error handling.
        
        Args:
            callback: Callback function to call
            *args: Arguments to pass to callback
            callback_name: Name of callback for logging
        """
        import logging
        logger = logging.getLogger(__name__)
        try:
            if callback:
                logger.debug(f"Calling {callback_name} callback with {len(args)} args")
                callback(*args)
                logger.debug(f"{callback_name} callback completed successfully")
            else:
                logger.warning(f"Callback {callback_name} is None, not calling")
        except Exception as e:
            logger.error(f"Error in {callback_name} callback: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
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
