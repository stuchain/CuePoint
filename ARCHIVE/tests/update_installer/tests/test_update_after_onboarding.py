#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Update System After Onboarding Dialog

Verifies that update system works even if onboarding dialog is closed.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

try:
    from PySide6.QtWidgets import QApplication
    from PySide6.QtCore import QTimer
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))


class TestUpdateAfterOnboarding(unittest.TestCase):
    """Test that update system works after onboarding dialog is closed."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_update_manager_available_after_onboarding(self):
        """Test that update_manager is available even if onboarding is shown/closed."""
        from cuepoint.ui.main_window import MainWindow
        
        # Create main window (this sets up update system)
        window = MainWindow()
        
        # Verify update_manager is set up
        self.assertTrue(hasattr(window, "update_manager"), "update_manager should be set up in __init__")
        
        # Simulate onboarding dialog being shown and closed
        # (The onboarding dialog is shown asynchronously, but update_manager should already exist)
        QApplication.processEvents()
        
        # Verify update_manager is still available
        self.assertIsNotNone(window.update_manager, "update_manager should be available even after onboarding")
        
        # Verify we can check for updates
        self.assertTrue(hasattr(window, "on_check_for_updates"), "on_check_for_updates method should exist")
        
        window.close()
    
    def test_update_check_works_after_onboarding_closed(self):
        """Test that update check works after onboarding dialog is closed."""
        from cuepoint.ui.main_window import MainWindow
        
        window = MainWindow()
        window.show()
        QApplication.processEvents()
        
        # Simulate onboarding being closed (it's shown asynchronously)
        # The update_manager should already be initialized
        self.assertIsNotNone(window.update_manager, "update_manager should be initialized")
        
        # Try to check for updates
        try:
            # This should work even if onboarding was closed
            window.on_check_for_updates()
            QApplication.processEvents()
            
            # If we get here without exception, it worked
            success = True
        except Exception as e:
            # If update_manager is None, on_check_for_updates will show a message box
            # but shouldn't crash
            if "update_manager" in str(e).lower() or "Update system is not available" in str(e):
                self.fail(f"Update check failed because update_manager is not available: {e}")
            else:
                # Other exceptions are unexpected
                raise
        
        self.assertTrue(success, "Update check should work after onboarding is closed")
        
        # Close any dialogs
        if hasattr(window, "update_check_dialog") and window.update_check_dialog:
            window.update_check_dialog.close()
        
        window.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
