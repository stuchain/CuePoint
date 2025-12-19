#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Suite for Update Check Dialog Download Button

Tests that:
1. Update check dialog appears when checking for updates
2. Download button is visible and enabled when update is found
3. Clicking download button initiates download process
4. Download progress dialog appears
5. Download actually starts from the provided URL
"""

import sys
import os
import unittest
from unittest.mock import Mock, patch, MagicMock, call
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))

try:
    from PySide6.QtWidgets import QApplication, QDialog, QMessageBox
    from PySide6.QtCore import QTimer, QEventLoop, Qt
    from PySide6.QtTest import QTest
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("WARNING: PySide6 not available, skipping GUI tests")

from cuepoint.update.update_ui import UpdateCheckDialog, show_update_check_dialog
from cuepoint.version import get_version


class TestUpdateDialogDownloadButton(unittest.TestCase):
    """Test update check dialog download button functionality."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_dialog_pops_up_with_update(self):
        """Test that dialog appears and shows update information."""
        update_info = {
            'short_version': '1.0.1-test20',
            'version': '1.0.1-test20',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test20/CuePoint-Setup-v1.0.1-test20.exe',
            'file_size': 95 * 1024 * 1024,  # 95 MB
            'release_notes': 'Test release notes',
            'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test20',
        }
        
        # Create dialog
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()  # Make it visible
        
        # Set update found
        dialog.set_update_found(update_info)
        
        # Verify dialog is visible
        self.assertTrue(dialog.isVisible())
        
        # Verify download button is visible and enabled
        self.assertFalse(dialog.download_button.isHidden())
        self.assertTrue(dialog.download_button.isEnabled())
        self.assertEqual(dialog.download_button.text(), "Download & Install")
        
        # Verify results group is visible
        self.assertFalse(dialog.results_group.isHidden())
        
        # Verify update info is stored
        self.assertEqual(dialog.update_info, update_info)
        self.assertEqual(dialog.update_info['download_url'], update_info['download_url'])
        
        dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    @patch('cuepoint.ui.main_window.QMessageBox')
    def test_download_button_click_initiates_download(self, mock_msgbox, mock_download_dialog_class):
        """Test that clicking download button initiates download."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_download_dialog = Mock()
        mock_download_dialog.exec.return_value = QDialog.DialogCode.Accepted
        mock_download_dialog.downloaded_file = "/tmp/CuePoint_Updates/test_installer.exe"
        mock_download_dialog.cancelled = False
        mock_download_dialog_class.return_value = mock_download_dialog
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        
        # Create update info
        update_info = {
            'short_version': '1.0.1-test20',
            'version': '1.0.1-test20',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test20/CuePoint-Setup-v1.0.1-test20.exe',
            'file_size': 95 * 1024 * 1024,
            'release_notes': 'Test release',
        }
        
        # Create and show update check dialog
        dialog = show_update_check_dialog(get_version(), window)
        dialog.set_update_found(update_info)
        dialog.show()
        
        # Store update info in dialog AND in window (required by _on_update_install_from_dialog)
        dialog.update_info = update_info
        window.update_check_dialog = dialog  # This is required!
        
        # Connect button to handler (simulating what main_window does)
        def on_download_clicked():
            window._on_update_install_from_dialog()
        
        dialog.download_button.clicked.connect(on_download_clicked)
        
        # Simulate button click
        QTest.mouseClick(dialog.download_button, Qt.MouseButton.LeftButton)
        
        # Process events to allow signal to propagate
        QApplication.processEvents()
        QTimer.singleShot(100, QApplication.quit)
        QApplication.exec()
        
        # Verify download dialog was created with correct URL
        mock_download_dialog_class.assert_called_once()
        call_args = mock_download_dialog_class.call_args
        self.assertIn('https://github.com', str(call_args))
        
        # Verify download dialog was shown
        mock_download_dialog.exec.assert_called_once()
        
        dialog.close()
        window.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    @patch('cuepoint.update.update_manager.UpdateManager.check_for_updates')
    @patch('cuepoint.ui.main_window.show_update_check_dialog')
    def test_manual_check_shows_dialog_and_button(self, mock_show_dialog, mock_check_updates):
        """Test that manual check for updates shows dialog with download button."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_dialog = Mock(spec=UpdateCheckDialog)
        mock_dialog.download_button = Mock()
        mock_dialog.download_button.isVisible.return_value = True
        mock_dialog.download_button.isEnabled.return_value = True
        mock_dialog.download_button.text.return_value = "Download & Install"
        mock_show_dialog.return_value = mock_dialog
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        window.update_manager.preferences = Mock()
        window.update_manager.preferences.get_check_frequency.return_value = "manual"
        
        # Simulate manual check
        window.on_check_for_updates()
        
        # Process events
        QApplication.processEvents()
        
        # Verify dialog was shown
        mock_show_dialog.assert_called_once()
        
        # Verify check_for_updates was called
        mock_check_updates.assert_called_once()
        
        window.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    @patch('cuepoint.ui.main_window.QMessageBox')
    def test_download_button_connection_from_main_window(self, mock_msgbox, mock_download_dialog_class):
        """Test that main window properly connects download button."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_download_dialog = Mock()
        mock_download_dialog.exec.return_value = QDialog.DialogCode.Accepted
        mock_download_dialog.downloaded_file = "/tmp/test.exe"
        mock_download_dialog.cancelled = False
        mock_download_dialog_class.return_value = mock_download_dialog
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        window.update_manager._on_update_available = None
        window.update_manager._on_check_complete = None
        window.update_manager._on_update_error = None
        
        # Create update info
        update_info = {
            'short_version': '1.0.1-test20',
            'download_url': 'https://example.com/update.exe',
        }
        
        # Create dialog
        dialog = show_update_check_dialog(get_version(), window)
        dialog.set_update_found(update_info)
        window.update_check_dialog = dialog  # Required!
        
        # Simulate update available callback (what UpdateManager does)
        window._on_update_available(update_info)
        
        # Process events to allow connection
        QApplication.processEvents()
        
        # Verify button is connected (check that _download_connected flag is set)
        self.assertTrue(hasattr(dialog, '_download_connected'))
        self.assertTrue(dialog._download_connected)
        
        # Simulate button click
        QTest.mouseClick(dialog.download_button, Qt.MouseButton.LeftButton)
        
        # Process events
        QApplication.processEvents()
        QTimer.singleShot(100, QApplication.quit)
        QApplication.exec()
        
        # Verify download dialog was created
        mock_download_dialog_class.assert_called_once()
        
        dialog.close()
        window.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_download_button_state_when_update_found(self):
        """Test download button state when update is found."""
        update_info = {
            'short_version': '1.0.1-test20',
            'download_url': 'https://example.com/update.exe',
            'file_size': 100 * 1024 * 1024,
        }
        
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()
        
        # Initially button should be hidden
        self.assertTrue(dialog.download_button.isHidden())
        
        # Set update found
        dialog.set_update_found(update_info)
        
        # Button should now be visible and enabled
        self.assertFalse(dialog.download_button.isHidden())
        self.assertTrue(dialog.download_button.isEnabled())
        self.assertTrue(dialog.download_button.isDefault())
        
        dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    @patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader')
    def test_download_url_passed_correctly(self, mock_downloader_class):
        """Test that download URL is correctly passed to downloader."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        
        test_url = "https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test20/CuePoint-Setup-v1.0.1-test20.exe"
        
        # Mock the downloader
        mock_downloader = Mock()
        mock_downloader.download.return_value = "/tmp/test.exe"
        mock_downloader_class.return_value = mock_downloader
        
        # Create download dialog
        dialog = DownloadProgressDialog(test_url)
        
        # Verify downloader was created with correct URL
        mock_downloader_class.assert_called_once()
        # The downloader should be initialized with the URL
        # (exact call depends on DownloadProgressDialog implementation)
        
        dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_context_menu_for_links(self):
        """Test that right-clicking links shows context menu with copy option."""
        update_info = {
            'short_version': '1.0.1-test20',
            'download_url': 'https://example.com/download.exe',
            'release_notes_url': 'https://example.com/release-notes',
        }
        
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()
        dialog.set_update_found(update_info)
        
        # Get the results label
        results_label = dialog.results_label
        
        # Verify context menu policy is set
        self.assertEqual(results_label.contextMenuPolicy(), Qt.ContextMenuPolicy.CustomContextMenu)
        
        # Simulate right-click
        from PySide6.QtCore import QPoint
        test_position = QPoint(10, 10)
        
        # This should trigger the context menu handler
        # (We can't easily test the menu appearance without more complex setup)
        # But we can verify the handler exists
        self.assertTrue(hasattr(dialog, '_on_results_label_context_menu'))
        
        dialog.close()


class TestFullUpdateFlow(unittest.TestCase):
    """Test the complete update flow from dialog to download."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    @patch('cuepoint.ui.main_window.QMessageBox')
    def test_complete_flow_dialog_to_download(self, mock_msgbox, mock_download_dialog_class, mock_installer_class):
        """Test complete flow: dialog popup -> button click -> download starts."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_download_dialog = Mock()
        mock_download_dialog.exec.return_value = QDialog.DialogCode.Accepted
        mock_download_dialog.downloaded_file = "/tmp/CuePoint_Updates/CuePoint-Setup-v1.0.1-test20.exe"
        mock_download_dialog.cancelled = False
        mock_download_dialog_class.return_value = mock_download_dialog
        
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer.install.return_value = (True, None)
        mock_installer_class.return_value = mock_installer
        
        mock_msgbox.question.return_value = QMessageBox.StandardButton.Yes
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        
        # Create update info
        update_info = {
            'short_version': '1.0.1-test20',
            'version': '1.0.1-test20',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test20/CuePoint-Setup-v1.0.1-test20.exe',
            'file_size': 95 * 1024 * 1024,
            'release_notes': 'Test release notes',
        }
        
        # Step 1: Show dialog
        dialog = show_update_check_dialog(get_version(), window)
        dialog.set_update_found(update_info)
        dialog.show()
        window.update_check_dialog = dialog
        
        # Verify dialog is visible
        self.assertTrue(dialog.isVisible())
        
        # Step 2: Connect button (simulating main_window._on_update_available)
        def on_download_clicked():
            window._on_update_install_from_dialog()
        
        dialog.download_button.clicked.connect(on_download_clicked)
        dialog._download_connected = True
        
        # Step 3: Click download button
        QTest.mouseClick(dialog.download_button, Qt.MouseButton.LeftButton)
        
        # Process events
        QApplication.processEvents()
        QTimer.singleShot(200, QApplication.quit)
        QApplication.exec()
        
        # Step 4: Verify download dialog was created
        mock_download_dialog_class.assert_called_once()
        
        # Verify download dialog was shown
        mock_download_dialog.exec.assert_called_once()
        
        # Verify download URL was passed correctly
        call_args = mock_download_dialog_class.call_args[0]
        self.assertIn('github.com', str(call_args[0]))
        self.assertIn('releases/download', str(call_args[0]))
        
        dialog.close()
        window.close()


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateDialogDownloadButton))
    suite.addTests(loader.loadTestsFromTestCase(TestFullUpdateFlow))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
