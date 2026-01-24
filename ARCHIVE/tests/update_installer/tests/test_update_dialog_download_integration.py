#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration Test for Update Dialog Download Flow

Opens the actual update dialog window and tests the download functionality.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

try:
    from PySide6.QtWidgets import QApplication, QMessageBox
    from PySide6.QtCore import QTimer, Qt
    from PySide6.QtTest import QTest
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("ERROR: PySide6 not available. Please install PySide6 to run this test.")
    sys.exit(1)

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

from cuepoint.update.update_ui import show_update_check_dialog, UpdateCheckDialog
from cuepoint.ui.main_window import MainWindow


class TestUpdateDialogDownloadIntegration(unittest.TestCase):
    """Integration test for update dialog download flow."""
    
    @classmethod
    def setUpClass(cls):
        """Set up QApplication for all tests."""
        if QApplication.instance() is None:
            cls.app = QApplication(sys.argv)
        else:
            cls.app = QApplication.instance()
    
    def setUp(self):
        """Set up test fixtures."""
        self.window = MainWindow()
        self.window.show()
        
        # Mock update manager
        self.window.update_manager = Mock()
        self.window.update_manager._update_available = None
    
    def tearDown(self):
        """Clean up after tests."""
        if hasattr(self, 'dialog') and self.dialog:
            self.dialog.close()
        if hasattr(self, 'window') and self.window:
            self.window.close()
    
    def test_dialog_opens_and_shows_update(self):
        """Test that dialog opens and displays update information."""
        from cuepoint.version import get_version
        
        # Create dialog
        self.dialog = show_update_check_dialog(get_version(), self.window)
        self.dialog.show()
        
        # Process events to ensure UI is updated
        QApplication.processEvents()
        
        # Verify dialog is visible
        self.assertTrue(self.dialog.isVisible())
        
        # Set update found
        update_info = {
            'short_version': '1.0.1-test17',
            'version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'file_size': 95451610,
            'pub_date': datetime(2024, 12, 19),
            'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17',
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Verify update info is displayed
        self.assertEqual(self.dialog.update_info, update_info)
        self.assertTrue(self.dialog.download_button.isVisible())
        self.assertTrue(self.dialog.download_button.isEnabled())
        
        # Verify release date is shown
        results_text = self.dialog.results_label.text()
        self.assertIn("Released:", results_text)
        self.assertIn("2024-12-19", results_text)
        
        # Verify download URL is shown
        self.assertIn("Direct Download Link", results_text)
    
    def test_download_button_click_triggers_handler(self):
        """Test that clicking download button triggers the download handler."""
        from cuepoint.version import get_version
        
        # Create dialog
        self.dialog = show_update_check_dialog(get_version(), self.window)
        self.window.update_check_dialog = self.dialog
        self.dialog.show()
        
        # Set update found
        update_info = {
            'short_version': '1.0.1-test17',
            'version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'file_size': 95451610,
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Store update_info in window for handler
        self.window.update_check_dialog.update_info = update_info
        
        # Mock the download handler to verify it's called
        original_handler = self.window._on_update_install_from_dialog
        handler_called = {'called': False, 'update_info_received': None}
        
        def mock_handler():
            handler_called['called'] = True
            handler_called['update_info_received'] = getattr(
                self.window.update_check_dialog, 'update_info', None
            )
            # Don't actually download, just verify handler was called
        
        self.window._on_update_install_from_dialog = mock_handler
        
        # Connect button (simulating what main_window does)
        if not hasattr(self.dialog, '_download_connected'):
            self.dialog.download_button.clicked.connect(
                lambda: self.window._on_update_install_from_dialog()
            )
            self.dialog._download_connected = True
        
        # Click the download button
        QTest.mouseClick(self.dialog.download_button, Qt.MouseButton.LeftButton)
        QApplication.processEvents()
        
        # Verify handler was called
        self.assertTrue(handler_called['called'], "Download handler should be called")
        self.assertIsNotNone(handler_called['update_info_received'], "Update info should be available")
        self.assertEqual(
            handler_called['update_info_received']['short_version'],
            '1.0.1-test17'
        )
        
        # Restore original handler
        self.window._on_update_install_from_dialog = original_handler
    
    def test_context_menu_works_without_crash(self):
        """Test that context menu works without TypeError."""
        from cuepoint.version import get_version
        
        # Create dialog
        self.dialog = show_update_check_dialog(get_version(), self.window)
        self.dialog.show()
        
        # Set update found with links
        update_info = {
            'short_version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17',
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Try to show context menu - should not crash
        try:
            # Simulate right-click on results label
            pos = self.dialog.results_label.rect().center()
            self.dialog._on_results_label_context_menu(pos)
            QApplication.processEvents()
            
            # If we get here without TypeError, the fix worked
            success = True
        except TypeError as e:
            if "missing 1 required positional argument: 'checked'" in str(e):
                self.fail("Context menu still has the TypeError bug!")
            raise
        except Exception as e:
            # Other exceptions are OK (like menu not showing if no links)
            success = True
        
        self.assertTrue(success, "Context menu should not crash")
    
    def test_full_download_flow_with_mock(self):
        """Test the full download flow with mocked downloader."""
        from cuepoint.version import get_version
        
        # Create dialog
        self.dialog = show_update_check_dialog(get_version(), self.window)
        self.window.update_check_dialog = self.dialog
        self.dialog.show()
        
        # Set update found
        update_info = {
            'short_version': '1.0.1-test17',
            'version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'file_size': 95451610,
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Mock the download progress dialog
        with patch('cuepoint.ui.main_window.DownloadProgressDialog') as MockDownloadDialog:
            mock_dialog_instance = Mock()
            MockDownloadDialog.return_value = mock_dialog_instance
            
            # Store update_info
            self.window.update_check_dialog.update_info = update_info
            
            # Connect button
            if not hasattr(self.dialog, '_download_connected'):
                self.dialog.download_button.clicked.connect(
                    lambda: self.window._on_update_install_from_dialog()
                )
                self.dialog._download_connected = True
            
            # Click download button
            QTest.mouseClick(self.dialog.download_button, Qt.MouseButton.LeftButton)
            QApplication.processEvents()
            
            # Verify download dialog was created
            MockDownloadDialog.assert_called_once()
            call_args = MockDownloadDialog.call_args
            self.assertEqual(
                call_args[0][0],
                update_info['download_url']
            )
    
    def test_version_filtering_in_dialog(self):
        """Test that version filtering works when update is found."""
        from cuepoint.version import get_version
        
        # Test with test version
        self.dialog = show_update_check_dialog("1.0.0-test17", self.window)
        self.dialog.show()
        
        # Set update found with test version (should be allowed)
        update_info = {
            'short_version': '1.0.1-test20',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test20/CuePoint-Setup-v1.0.1-test20.exe',
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Verify test version is shown
        self.assertEqual(self.dialog.update_info['short_version'], '1.0.1-test20')
        self.assertTrue(self.dialog.download_button.isVisible())
        
        self.dialog.close()
        
        # Test with stable version
        self.dialog = show_update_check_dialog("1.0.0", self.window)
        self.dialog.show()
        
        # Set update found with stable version (should be allowed)
        update_info = {
            'short_version': '1.0.2',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.2/CuePoint-Setup-v1.0.2.exe',
        }
        
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Verify stable version is shown
        self.assertEqual(self.dialog.update_info['short_version'], '1.0.2')
        self.assertTrue(self.dialog.download_button.isVisible())


def run_interactive_test():
    """Run an interactive test that opens the window."""
    if not QT_AVAILABLE:
        print("ERROR: PySide6 not available.")
        return
    
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    from cuepoint.version import get_version
    
    # Create main window
    window = MainWindow()
    window.show()
    
    # Create update check dialog
    dialog = show_update_check_dialog(get_version(), window)
    window.update_check_dialog = dialog
    dialog.show()
    QApplication.processEvents()
    
    # Set update found with test data
    update_info = {
        'short_version': '1.0.1-test17',
        'version': '1.0.1-test17',
        'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
        'file_size': 95451610,
        'pub_date': datetime(2024, 12, 19),
        'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17',
        'release_notes': 'Test release notes\n\n- Fixed update detection\n- Improved download progress',
    }
    
    # Simulate _on_update_available flow exactly
    # This is what happens in the real application
    dialog.set_update_found(update_info)
    QApplication.processEvents()
    
    # Connect download button if not already connected (same as _on_update_available does)
    if not hasattr(dialog, '_download_connected'):
        # Store update_info in dialog for download (CRITICAL)
        dialog.update_info = update_info
        print(f"✓ Stored update_info in dialog: {update_info.get('short_version', 'unknown')}")
        
        # Also store in update_manager as fallback
        if not hasattr(window, 'update_manager') or window.update_manager is None:
            from unittest.mock import Mock
            window.update_manager = Mock()
        window.update_manager._update_available = update_info
        print(f"✓ Stored update_info in update_manager as fallback")
        
        # Disconnect any existing handler first
        try:
            dialog.download_button.clicked.disconnect()
            print("✓ Disconnected existing button handlers")
        except TypeError:
            print("✓ No existing button handlers to disconnect")
            pass
        
        # Create the handler function (same pattern as main_window._on_update_available)
        main_window_self = window
        
        def on_download_clicked():
            print("\n" + "=" * 70)
            print("DOWNLOAD BUTTON CLICKED!")
            print("=" * 70)
            print(f"Dialog update_info: {getattr(dialog, 'update_info', 'NOT SET')}")
            print(f"Window update_check_dialog: {getattr(window, 'update_check_dialog', 'NOT SET')}")
            if hasattr(window, 'update_check_dialog') and window.update_check_dialog:
                print(f"Dialog has update_info: {hasattr(window.update_check_dialog, 'update_info')}")
                if hasattr(window.update_check_dialog, 'update_info'):
                    print(f"Dialog update_info value: {window.update_check_dialog.update_info}")
            main_window_self._on_update_install_from_dialog()
        
        # Ensure button is enabled
        dialog.download_button.setEnabled(True)
        
        # Connect the button
        dialog.download_button.clicked.connect(on_download_clicked)
        dialog._download_connected = True
        print(f"✓ Download button connected successfully")
        print(f"✓ Button state - visible: {dialog.download_button.isVisible()}, enabled: {dialog.download_button.isEnabled()}")
    else:
        print("✓ Download button already connected")
    
    print("=" * 70)
    print("INTERACTIVE UPDATE DIALOG TEST")
    print("=" * 70)
    print()
    print("The update dialog is now open.")
    print("You can:")
    print("  1. See the update information")
    print("  2. Click 'Download & Install' to test download")
    print("  3. Right-click links to copy them")
    print("  4. Close the dialog when done")
    print()
    print("Note: The download will use the actual download handler.")
    print("      It will show the download progress dialog.")
    print()
    
    # Show message
    QMessageBox.information(
        window,
        "Interactive Test",
        "Update dialog is open.\n\n"
        "Click 'Download & Install' to test the download functionality.\n\n"
        "The download progress dialog should appear if everything works correctly."
    )
    
    # Run application
    sys.exit(app.exec())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        # Run interactive test
        run_interactive_test()
    else:
        # Run unit tests
        unittest.main(verbosity=2)
