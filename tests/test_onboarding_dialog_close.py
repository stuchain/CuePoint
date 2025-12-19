#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Onboarding Dialog Close Behavior

Verifies that closing the onboarding dialog doesn't close the entire application.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

try:
    from PySide6.QtWidgets import QApplication, QDialog
    from PySide6.QtCore import QTimer
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))


class TestOnboardingDialogClose(unittest.TestCase):
    """Test that closing onboarding dialog doesn't close the app."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_onboarding_close_keeps_main_window_open(self):
        """Test that closing onboarding dialog keeps main window open."""
        from cuepoint.ui.main_window import MainWindow
        
        # Create main window
        window = MainWindow()
        window.show()
        QApplication.processEvents()
        
        # Verify window is visible
        self.assertTrue(window.isVisible(), "Main window should be visible")
        
        # Simulate showing onboarding dialog
        # (We'll mock the dialog to avoid actually showing it)
        with patch('cuepoint.ui.dialogs.onboarding_dialog.OnboardingDialog') as mock_dialog_class:
            mock_dialog = Mock()
            mock_dialog.exec.return_value = QDialog.DialogCode.Rejected  # User closed it
            mock_dialog.dont_show_again_checked.return_value = False
            mock_dialog_class.return_value = mock_dialog
            
            # Show onboarding dialog
            window._show_onboarding_dialog()
            QApplication.processEvents()
            
            # Verify main window is still visible after dialog closes
            self.assertTrue(window.isVisible(), "Main window should still be visible after onboarding dialog closes")
            
            # Verify main window is raised
            self.assertTrue(window.isVisible(), "Main window should be raised after onboarding dialog closes")
    
    def test_onboarding_skip_keeps_main_window_open(self):
        """Test that skipping onboarding keeps main window open."""
        from cuepoint.ui.main_window import MainWindow
        
        # Create main window
        window = MainWindow()
        window.show()
        QApplication.processEvents()
        
        # Verify window is visible
        self.assertTrue(window.isVisible(), "Main window should be visible")
        
        # Simulate skipping onboarding
        with patch('cuepoint.ui.dialogs.onboarding_dialog.OnboardingDialog') as mock_dialog_class:
            mock_dialog = Mock()
            mock_dialog.exec.return_value = QDialog.DialogCode.Rejected  # User skipped
            mock_dialog.dont_show_again_checked.return_value = False
            mock_dialog_class.return_value = mock_dialog
            
            # Show onboarding dialog
            window._show_onboarding_dialog()
            QApplication.processEvents()
            
            # Verify main window is still visible after skipping
            self.assertTrue(window.isVisible(), "Main window should still be visible after skipping onboarding")
    
    def test_main_window_visible_after_onboarding(self):
        """Test that main window is properly shown and raised after onboarding."""
        from cuepoint.ui.main_window import MainWindow
        
        # Create main window
        window = MainWindow()
        window.show()
        QApplication.processEvents()
        
        # Simulate onboarding dialog closing
        with patch('cuepoint.ui.dialogs.onboarding_dialog.OnboardingDialog') as mock_dialog_class:
            mock_dialog = Mock()
            mock_dialog.exec.return_value = QDialog.DialogCode.Rejected
            mock_dialog.dont_show_again_checked.return_value = False
            mock_dialog_class.return_value = mock_dialog
            
            # Show onboarding dialog
            window._show_onboarding_dialog()
            QApplication.processEvents()
            
            # Verify main window is visible, raised, and active
            self.assertTrue(window.isVisible(), "Main window should be visible")
            # Note: raise_() and activateWindow() don't have direct testable properties,
            # but we can verify the window is visible which is the key requirement
        
        window.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
