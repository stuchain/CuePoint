#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Error Reporting Preferences

Manages user preferences for error reporting.

Implements Step 11.2.1.3 - User Consent Mechanism.
"""

from PySide6.QtCore import QSettings


class ErrorReportingPrefs:
    """Manage error reporting preferences."""
    
    def __init__(self):
        """Initialize error reporting preferences."""
        self.settings = QSettings()
    
    def is_enabled(self) -> bool:
        """Check if error reporting is enabled.
        
        Returns:
            True if error reporting is enabled, False otherwise.
        """
        return self.settings.value("error_reporting/enabled", True, type=bool)
    
    def set_enabled(self, enabled: bool) -> None:
        """Set error reporting enabled state.
        
        Args:
            enabled: Whether error reporting should be enabled.
        """
        self.settings.setValue("error_reporting/enabled", enabled)
    
    def has_user_consented(self) -> bool:
        """Check if user has consented to error reporting.
        
        Returns:
            True if user has consented, False otherwise.
        """
        return self.settings.value("error_reporting/consented", False, type=bool)
    
    def set_consented(self, consented: bool) -> None:
        """Set user consent for error reporting.
        
        Args:
            consented: Whether user has consented to error reporting.
        """
        self.settings.setValue("error_reporting/consented", consented)

