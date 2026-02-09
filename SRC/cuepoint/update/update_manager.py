#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update manager implementation.

Coordinates update checking, notification, and installation.
"""

import platform
import sys
import threading
from datetime import datetime, timedelta
from typing import Callable, Dict, Optional

from cuepoint.update.update_checker import UpdateChecker, UpdateCheckError
from cuepoint.update.update_preferences import UpdatePreferences

# Lazy definition of CallbackReceiver to avoid Qt initialization issues in packaged apps
# We'll define it when needed, after Qt is confirmed to be initialized
_CallbackReceiverClass = None
QT_AVAILABLE = False


def _get_callback_receiver_class():
    """Get or create the CallbackReceiver class, ensuring Qt is initialized first."""
    global _CallbackReceiverClass, QT_AVAILABLE

    import logging

    logger = logging.getLogger(__name__)

    if _CallbackReceiverClass is not None:
        logger.debug("CallbackReceiver class already created, returning cached class")
        return _CallbackReceiverClass

    logger.info("Creating CallbackReceiver class (lazy initialization)...")
    try:
        logger.debug("  - Importing Qt modules...")
        from PySide6.QtCore import QObject, Signal
        from PySide6.QtWidgets import QApplication

        logger.debug("  ✓ Qt modules imported")

        # Verify Qt is initialized before defining Signal classes
        logger.debug("  - Checking QApplication instance...")
        app = QApplication.instance()
        if app is None:
            # Qt not initialized yet - return None
            logger.warning(
                "  ✗ QApplication instance not found, cannot create CallbackReceiver"
            )
            return None
        logger.info(f"  ✓ QApplication instance found: {app}")

        logger.debug("  - Defining CallbackReceiver class with Signal definitions...")

        class CallbackReceiver(QObject):
            """QObject for marshaling callbacks from background threads to main thread.

            IMPORTANT: Use no-arg signals only. PySide6/Shiboken has known bugs when
            passing complex Python objects (e.g. dict) through queued cross-thread
            signals - crashes occur during object deallocation in packaged macOS apps.
            See: PYSIDE-813, PyInstaller #1657, Stack Overflow Qt6 crash on macOS.
            """

            # No-arg signals - avoid passing Python objects through queued connections
            update_available_signal = Signal()
            check_complete_signal = Signal()

            def __init__(self, on_update_available, on_check_complete, update_manager):
                super().__init__()
                self._on_update_available = on_update_available
                self._on_check_complete = on_check_complete
                self._update_manager = update_manager

                # Connect signals to callbacks
                self.update_available_signal.connect(self._handle_update_available)
                self.check_complete_signal.connect(self._handle_check_complete)

            def _handle_update_available(self):
                """Handle update available callback on main thread."""
                import logging

                logger = logging.getLogger(__name__)
                try:
                    if self._on_update_available and self._update_manager:
                        update_info = self._update_manager.get_update_info()
                        if update_info:
                            self._on_update_available(update_info)
                except Exception as e:
                    logger.error(
                        f"Error in update_available callback: {e}", exc_info=True
                    )

            def _handle_check_complete(self):
                """Handle check complete callback on main thread."""
                import logging

                logger = logging.getLogger(__name__)
                try:
                    if self._on_check_complete and self._update_manager:
                        has_update = self._update_manager.has_update()
                        error = getattr(
                            self._update_manager, "_last_check_error", None
                        )
                        self._on_check_complete(has_update, error)
                except Exception as e:
                    logger.error(
                        f"Error in check_complete callback: {e}", exc_info=True
                    )

        _CallbackReceiverClass = CallbackReceiver
        QT_AVAILABLE = True
        logger.info("  ✓ CallbackReceiver class created successfully")
        return _CallbackReceiverClass
    except ImportError as import_error:
        # Qt not available
        logger.warning(f"  ✗ Qt modules not available: {import_error}")
        QT_AVAILABLE = False
        return None
    except Exception as e:
        # Any other error - log and return None
        logger.error(f"  ✗ Could not create CallbackReceiver class: {e}", exc_info=True)
        QT_AVAILABLE = False
        return None


class UpdateManager:
    """
    Manages the update checking and notification process.

    Coordinates between update checker, preferences, and UI.
    """

    def __init__(
        self,
        current_version: str,
        feed_url: str = "https://stuchain.github.io/CuePoint/updates",
        preferences: Optional[UpdatePreferences] = None,
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
        self._last_check_error: Optional[str] = None  # For cross-thread callback (no-arg signal)

        # Callbacks
        self._on_update_available: Optional[Callable[[Dict], None]] = None
        self._on_check_complete: Optional[Callable[[bool, Optional[str]], None]] = None
        self._on_error: Optional[Callable[[str], None]] = None

    def _ensure_receiver_created(self) -> None:
        """Ensure callback receiver is created on main thread."""
        import logging

        logger = logging.getLogger(__name__)

        logger.debug("_ensure_receiver_created: Starting...")
        try:
            from PySide6.QtWidgets import QApplication

            logger.debug("  - Getting QApplication instance...")
            app = QApplication.instance()
            if app is None:
                logger.warning(
                    "  ✗ QApplication instance not found, cannot create receiver"
                )
                return  # No Qt app, can't create receiver
            logger.debug(f"  ✓ QApplication instance found: {app}")

            # Get CallbackReceiver class (lazy initialization)
            logger.debug("  - Getting CallbackReceiver class...")
            CallbackReceiverClass = _get_callback_receiver_class()
            if CallbackReceiverClass is None:
                logger.warning(
                    "  ✗ CallbackReceiver class not available, cannot create receiver"
                )
                return  # Can't create receiver class
            logger.debug(
                f"  ✓ CallbackReceiver class obtained: {CallbackReceiverClass}"
            )

            # Check if receiver already exists
            logger.debug("  - Checking if receiver already exists...")
            if hasattr(app, "_callback_receiver"):
                logger.debug("  ✓ CallbackReceiver already exists, skipping creation")
                return
            logger.debug("  - No existing receiver found, creating new one...")

            # Create receiver on main thread (this method is called on main thread)
            # Parent to app so it lives for app lifetime (critical for signal delivery on macOS)
            logger.info("  - Creating CallbackReceiver instance...")
            receiver = CallbackReceiverClass(
                self._on_update_available, self._on_check_complete, self
            )
            receiver.setParent(app)
            app._callback_receiver = receiver
            logger.info(
                f"  ✓ CallbackReceiver created and attached to QApplication: {receiver}"
            )
        except Exception as e:
            # Error creating receiver - log but don't crash
            logger.error(f"  ✗ Could not create callback receiver: {e}", exc_info=True)

    def set_on_update_available(self, callback: Callable[[Dict], None]) -> None:
        """
        Set callback for when update is available.

        Args:
            callback: Function called with update info dict when update found
        """
        self._on_update_available = callback
        # Update receiver if it exists, or create it
        self._ensure_receiver_created()
        # Update receiver callbacks
        try:
            from PySide6.QtWidgets import QApplication

            app = QApplication.instance()
            if app and hasattr(app, "_callback_receiver"):
                app._callback_receiver._on_update_available = callback
        except (ImportError, Exception):
            pass

    def set_on_check_complete(
        self, callback: Callable[[bool, Optional[str]], None]
    ) -> None:
        """
        Set callback for when check completes.

        Args:
            callback: Function called with (update_available: bool, error: Optional[str])
        """
        self._on_check_complete = callback
        # Update receiver if it exists, or create it
        self._ensure_receiver_created()
        # Update receiver callbacks
        try:
            from PySide6.QtWidgets import QApplication

            app = QApplication.instance()
            if app and hasattr(app, "_callback_receiver"):
                app._callback_receiver._on_check_complete = callback
        except (ImportError, Exception):
            pass

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
        # Validate platform before starting check
        if not self.platform or self.platform == "unknown":
            import logging
            logger = logging.getLogger(__name__)
            logger.error(
                f"Cannot check for updates: invalid platform '{self.platform}'"
            )
            return False

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

        # On frozen macOS (signed/notarized app), urllib/SSL can crash during
        # network fetch. Use QNetworkAccessManager on main thread instead.
        use_qt_network = (
            getattr(sys, "frozen", False)
            and sys.platform == "darwin"
        )

        try:
            if use_qt_network:
                try:
                    from PySide6.QtCore import QTimer
                    from PySide6.QtWidgets import QApplication
                    if QApplication.instance():
                        QTimer.singleShot(0, self._do_check_qt_main_thread)
                        return True
                except ImportError:
                    pass
                # Fallback to thread if Qt path fails
                use_qt_network = False

            if not use_qt_network:
                thread = threading.Thread(target=self._do_check, daemon=True)
                thread.start()
            return True
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to start update check: {e}", exc_info=True)
            with self._lock:
                self._checking = False
            return False

    def _do_check_qt_main_thread(self) -> None:
        """Perform update check on main thread using QNetworkAccessManager.

        Avoids urllib/SSL which can crash in signed macOS apps (hardened runtime).
        Must run on main thread - called via QTimer.singleShot(0, ...).
        """
        import logging

        logger = logging.getLogger(__name__)

        try:
            from PySide6.QtCore import QUrl
            from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest
            from PySide6.QtWidgets import QApplication
        except ImportError:
            logger.error("Qt network modules not available, falling back to thread")
            with self._lock:
                self._checking = False
            try:
                thread = threading.Thread(target=self._do_check, daemon=True)
                thread.start()
            except Exception:
                pass
            return

        feed_url = self.checker.get_feed_url(self.platform)

        from cuepoint.update.security import FeedIntegrityVerifier
        is_valid, error = FeedIntegrityVerifier.verify_feed_https(feed_url)
        if not is_valid:
            logger.error(f"Feed URL failed integrity check: {error}")
            with self._lock:
                self._checking = False
                self._last_check_error = error or "Feed URL failed integrity checks"
            self.preferences.set_last_check_timestamp()
            self.preferences.set_last_check_result("error")
            self._emit_check_complete()
            return

        logger.info(
            f"Starting update check (Qt network): {self.current_version}, "
            f"platform={self.platform}, url={feed_url}"
        )

        # Create request
        request = QNetworkRequest(QUrl(feed_url))
        request.setRawHeader(
            b"User-Agent",
            f"CuePoint/{self.current_version}".encode("utf-8"),
        )
        request.setRawHeader(
            b"Accept",
            b"application/rss+xml, application/xml, text/xml",
        )

        app = QApplication.instance()
        if not app:
            logger.error("QApplication not available")
            with self._lock:
                self._checking = False
                self._last_check_error = "Qt context not available"
            self._emit_check_complete()
            return

        network = QNetworkAccessManager(app)
        reply = network.get(request)

        def on_finished():
            try:
                if reply.error():
                    err_msg = reply.errorString() or "Network error"
                    logger.error(f"Update check failed: {err_msg}")
                    with self._lock:
                        self._update_available = None
                        self._last_check_error = err_msg
                        self._checking = False
                    self.preferences.set_last_check_timestamp()
                    self.preferences.set_last_check_result("error")
                    self._emit_check_complete()
                    return

                data = reply.readAll()
                appcast_data = bytes(data.data()) if data else b""

                if not appcast_data:
                    raise UpdateCheckError("Empty appcast response")

                update_info = self.checker.check_update_from_appcast(appcast_data)

                if update_info:
                    version = update_info.get("version") or update_info.get("short_version")
                    if version and self.preferences.is_version_ignored(version):
                        update_info = None
                else:
                    logger.info(
                        f"No update available (current: {self.current_version} is latest)"
                    )

                with self._lock:
                    self._update_available = update_info
                    self._last_check_error = None
                    self._checking = False

                self.preferences.set_last_check_timestamp()
                if update_info:
                    self.preferences.set_last_check_result("update_available")
                else:
                    self.preferences.set_last_check_result("no_update")

                self._emit_update_available_if_needed()
                self._emit_check_complete()
            except Exception as e:
                logger.error(f"Update check failed: {e}", exc_info=True)
                with self._lock:
                    self._update_available = None
                    self._last_check_error = str(e)
                    self._checking = False
                try:
                    self.preferences.set_last_check_timestamp()
                    self.preferences.set_last_check_result("error")
                except Exception:
                    pass
                self._emit_check_complete()

        reply.finished.connect(on_finished)

    def _emit_update_available_if_needed(self) -> None:
        """Emit update_available signal if we have update and callback."""
        try:
            from PySide6.QtWidgets import QApplication
            app = QApplication.instance()
            if app and hasattr(app, "_callback_receiver") and app._callback_receiver:
                if self._update_available and self._on_update_available:
                    app._callback_receiver.update_available_signal.emit()
        except Exception:
            pass

    def _emit_check_complete(self) -> None:
        """Emit check_complete signal."""
        try:
            from PySide6.QtWidgets import QApplication
            app = QApplication.instance()
            if app and hasattr(app, "_callback_receiver") and app._callback_receiver:
                app._callback_receiver.check_complete_signal.emit()
        except Exception:
            pass

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
        import logging

        logger = logging.getLogger(__name__)
        
        try:
            # Validate platform before proceeding
            if not self.platform or self.platform == "unknown":
                logger.error(f"Invalid platform for update check: {self.platform}")
                err_msg = "Invalid platform for update check"
                with self._lock:
                    self._checking = False
                    self._last_check_error = err_msg
                try:
                    from PySide6.QtWidgets import QApplication
                    app = QApplication.instance()
                    if app and hasattr(app, "_callback_receiver") and app._callback_receiver:
                        app._callback_receiver.check_complete_signal.emit()
                except Exception:
                    pass
                return

            # Update channel if changed
            channel = self.preferences.get_channel()
            if self.checker.channel != channel:
                self.checker = UpdateChecker(
                    self.feed_url, self.current_version, channel
                )

            # Check for updates
            logger.info(
                f"Starting update check: current={self.current_version}, platform={self.platform}, channel={self.checker.channel}"
            )

            update_info = self.checker.check_for_updates(self.platform)

            logger.info(
                f"Update check result: update_info={'available' if update_info else 'none'}"
            )
            if update_info:
                version = update_info.get("version") or update_info.get("short_version")
                logger.info(f"Found update: version={version}")

                # Check if version is ignored
                if version and self.preferences.is_version_ignored(version):
                    logger.info(
                        f"Update version {version} is ignored by user preferences"
                    )
                    update_info = None
            else:
                logger.info(
                    f"No update available (current: {self.current_version} is latest or newer)"
                )

            # Update state
            with self._lock:
                self._update_available = update_info
                self._last_check_error = None
                self._checking = False

            # Update preferences
            self.preferences.set_last_check_timestamp()
            if update_info:
                self.preferences.set_last_check_result("update_available")
            else:
                self.preferences.set_last_check_result("no_update")

            # Call callbacks on main thread
            # CRITICAL: We're in a regular threading.Thread, not a QThread,
            # so we can't use QTimer.singleShot(). Instead, we use Qt signals
            # which are thread-safe and automatically marshal to the main thread.
            try:
                from PySide6.QtWidgets import QApplication

                # Get QApplication instance to ensure we're in Qt context
                app = QApplication.instance()
                if app is None:
                    logger.warning(
                        "QApplication instance not found, callbacks may not work"
                    )
                    # Fallback: try direct call (may fail if not on main thread)
                    if update_info and self._on_update_available:
                        try:
                            self._on_update_available(update_info)
                        except Exception as e:
                            logger.error(
                                f"Error calling update available callback: {e}"
                            )
                    if self._on_check_complete:
                        try:
                            self._on_check_complete(update_info is not None, None)
                        except Exception as e:
                            logger.error(f"Error calling check complete callback: {e}")
                else:
                    # Verify Qt is fully initialized before proceeding
                    # On macOS, Qt may not be ready immediately after app creation
                    try:
                        # Try to access Qt's event loop to verify it's ready
                        from PySide6.QtCore import QCoreApplication
                        if not QCoreApplication.instance():
                            logger.warning(
                                "QCoreApplication instance not available, skipping signal emission"
                            )
                            return
                    except Exception as qt_check_error:
                        logger.warning(
                            f"Error checking Qt initialization: {qt_check_error}, skipping signal emission"
                        )
                        return

                    # Use receiver that was created on main thread (in set_on_update_available/set_on_check_complete)
                    if not hasattr(app, "_callback_receiver"):
                        # Receiver not created yet - this shouldn't happen if callbacks were set properly
                        # Fallback: try direct call (may fail if not on main thread)
                        logger.warning(
                            "Callback receiver not found, using direct call (may cause threading issues)"
                        )
                        if update_info and self._on_update_available:
                            try:
                                self._on_update_available(update_info)
                            except Exception as e:
                                logger.error(
                                    f"Error in direct callback: {e}", exc_info=True
                                )
                        if self._on_check_complete:
                            try:
                                self._on_check_complete(update_info is not None, None)
                            except Exception as e:
                                logger.error(
                                    f"Error in direct check_complete callback: {e}",
                                    exc_info=True,
                                )
                        return

                    receiver = app._callback_receiver

                    # Validate receiver is still valid and is a QObject
                    if receiver is None:
                        logger.warning(
                            "Callback receiver is None, skipping signal emission"
                        )
                        return
                    
                    # On macOS, verify the receiver is still a valid QObject
                    try:
                        from PySide6.QtCore import QObject
                        if not isinstance(receiver, QObject):
                            logger.warning(
                                f"Callback receiver is not a QObject (type: {type(receiver)}), skipping signal emission"
                            )
                            return
                    except Exception as type_check_error:
                        logger.warning(
                            f"Error checking receiver type: {type_check_error}, skipping signal emission"
                        )
                        return

                    try:
                        # Validate receiver is still a valid QObject before emitting
                        if not hasattr(receiver, 'update_available_signal') or not hasattr(receiver, 'check_complete_signal'):
                            logger.warning(
                                "Callback receiver missing required signals, skipping emission"
                            )
                            return

                        # Emit no-arg signals; slot retrieves data from manager
                        if update_info and self._on_update_available:
                            logger.info(
                                f"Scheduling update available callback on main thread (version: {update_info_copy.get('short_version')})"
                            )
                            # Emit no-arg signal - slot retrieves update_info from manager
                            # (avoids PySide6 bug passing dict through queued cross-thread signals)
                            try:
                                receiver.update_available_signal.emit()
                            except RuntimeError as qt_error:
                                logger.error(
                                    f"Qt signal emission failed (threading issue?): {qt_error}",
                                    exc_info=True,
                                )
                                return

                        if self._on_check_complete:
                            # Emit no-arg signal - slot retrieves has_update/error from manager
                            try:
                                receiver.check_complete_signal.emit()
                            except RuntimeError as qt_error:
                                logger.error(
                                    f"Qt signal emission failed (threading issue?): {qt_error}",
                                    exc_info=True,
                                )
                                return
                    except Exception as e:
                        logger.error(
                            f"Error emitting update signals: {e}", exc_info=True
                        )
                        # Fallback to direct call if signal emission fails
                        # But only if we're sure Qt is in a good state
                        try:
                            # Verify Qt is still accessible before fallback
                            from PySide6.QtWidgets import QApplication
                            app_check = QApplication.instance()
                            if app_check is not None:
                                if update_info and self._on_update_available:
                                    self._on_update_available(update_info)
                                if self._on_check_complete:
                                    self._on_check_complete(update_info is not None, None)
                        except Exception as fallback_error:
                            logger.error(
                                f"Error in fallback direct callback: {fallback_error}",
                                exc_info=True,
                            )
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
            logger.error(f"Update check failed: {e}")

            error_msg = str(e)
            with self._lock:
                self._checking = False
                self._last_check_error = error_msg

            try:
                self.preferences.set_last_check_timestamp()
                self.preferences.set_last_check_result("error")
            except Exception as pref_error:
                logger.error(f"Error updating preferences: {pref_error}")
            try:
                from PySide6.QtCore import QTimer, QApplication

                app = QApplication.instance()
                if app is None:
                    logger.warning(
                        "QApplication instance not found, using direct callback"
                    )
                    if self._on_error:
                        self._on_error(error_msg)
                    if self._on_check_complete:
                        self._on_check_complete(False, error_msg)
                else:
                    # Use QTimer to ensure callback runs on main thread
                    if self._on_error:
                        callback_ref = self._on_error
                        QTimer.singleShot(
                            0,
                            lambda msg=error_msg: self._safe_call_callback(
                                callback_ref, msg, callback_name="error"
                            ),
                        )
                    if self._on_check_complete:
                        callback_ref = self._on_check_complete
                        QTimer.singleShot(
                            0,
                            lambda msg=error_msg: self._safe_call_callback(
                                callback_ref, False, msg, callback_name="check_complete"
                            ),
                        )
            except ImportError:
                logger.warning("PySide6 not available, using direct callback")
                if self._on_error:
                    self._on_error(error_msg)
                if self._on_check_complete:
                    self._on_check_complete(False, error_msg)

        except Exception as e:
            logger.error(f"Unexpected error during update check: {e}", exc_info=True)

            error_msg = f"Unexpected error during update check: {e}"
            with self._lock:
                self._checking = False
                self._last_check_error = error_msg

            try:
                self.preferences.set_last_check_timestamp()
                self.preferences.set_last_check_result("error")
            except Exception as pref_error:
                logger.error(f"Error updating preferences after exception: {pref_error}")

            try:
                from PySide6.QtCore import QTimer, QApplication

                app = QApplication.instance()
                if app is None:
                    logger.warning(
                        "QApplication instance not found, using direct callback"
                    )
                    if self._on_error:
                        self._on_error(error_msg)
                    if self._on_check_complete:
                        self._on_check_complete(False, error_msg)
                else:
                    # Use QTimer to ensure callback runs on main thread
                    if self._on_error:
                        callback_ref = self._on_error
                        QTimer.singleShot(
                            0,
                            lambda msg=error_msg: self._safe_call_callback(
                                callback_ref, msg, callback_name="error"
                            ),
                        )
                    if self._on_check_complete:
                        callback_ref = self._on_check_complete
                        QTimer.singleShot(
                            0,
                            lambda msg=error_msg: self._safe_call_callback(
                                callback_ref, False, msg, callback_name="check_complete"
                            ),
                        )
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

    def _safe_call_callback(
        self, callback, *args, callback_name: str = "callback"
    ) -> None:
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
                version = update_info.get("version") or update_info.get("short_version")

        if version:
            self.preferences.ignore_version(version)

            # Clear update if it's the one being ignored
            with self._lock:
                if self._update_available:
                    current_version = self._update_available.get(
                        "version"
                    ) or self._update_available.get("short_version")
                    if current_version == version:
                        self._update_available = None
