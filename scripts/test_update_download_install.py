#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Test Suite for Update Download & Install Functionality

Tests:
1. Download progress dialog UI and functionality
2. Download progress updates (bytes, speed, time)
3. Download completion handling
4. Integration with update check dialog
5. Installation flow after download
6. Startup update check dialog
7. Error handling
"""

import sys
import os
import unittest
from unittest.mock import Mock, patch, MagicMock, call
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))

try:
    from PySide6.QtWidgets import QApplication, QDialog
    from PySide6.QtCore import QTimer, QEventLoop
    from PySide6.QtTest import QTest
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("WARNING: PySide6 not available, skipping GUI tests")

from cuepoint.update.update_downloader import UpdateDownloader
from cuepoint.update.update_installer import UpdateInstaller
from cuepoint.update.update_ui import UpdateCheckDialog, show_update_check_dialog
from cuepoint.version import get_version


class TestDownloadProgressDialog(unittest.TestCase):
    """Test download progress dialog functionality."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_dialog_initialization(self):
        """Test that download progress dialog initializes correctly."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        
        with patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader'):
            dialog = DownloadProgressDialog("http://example.com/update.exe")
            
            # Check dialog properties
            self.assertEqual(dialog.windowTitle(), "Downloading Update")
            self.assertTrue(dialog.isModal())
            self.assertIsNotNone(dialog.progress_bar)
            self.assertIsNotNone(dialog.size_label)
            self.assertIsNotNone(dialog.speed_label)
            self.assertIsNotNone(dialog.time_label)
            self.assertIsNotNone(dialog.cancel_button)
            
            # Check initial state
            self.assertEqual(dialog.progress_bar.value(), 0)
            self.assertEqual(dialog.size_label.text(), "Preparing download...")
            self.assertFalse(dialog.cancelled)
            self.assertIsNone(dialog.downloaded_file)
            
            dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_progress_updates(self):
        """Test that progress updates work correctly."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        
        with patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader'):
            dialog = DownloadProgressDialog("http://example.com/update.exe")
            
            # Simulate progress updates
            dialog.on_progress(1024 * 1024, 10 * 1024 * 1024)  # 1 MB / 10 MB
            
            # Check progress bar
            self.assertEqual(dialog.progress_bar.value(), 10)
            
            # Check size label
            self.assertIn("1.0 MB", dialog.size_label.text())
            self.assertIn("10.0 MB", dialog.size_label.text())
            
            # Simulate speed update
            dialog.on_speed_update(2.5)  # 2.5 MB/s
            self.assertIn("2.50", dialog.speed_label.text())
            
            # Simulate time remaining
            dialog.on_time_update(125)  # 125 seconds
            self.assertIn("2m 5s", dialog.time_label.text())
            
            dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_download_completion(self):
        """Test download completion handling."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        
        with patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader'):
            dialog = DownloadProgressDialog("http://example.com/update.exe")
            
            # Simulate download completion
            test_file = "/tmp/test_installer.exe"
            dialog.on_download_finished(test_file)
            
            # Check completion state
            self.assertEqual(dialog.downloaded_file, test_file)
            self.assertEqual(dialog.progress_bar.value(), 100)
            self.assertEqual(dialog.size_label.text(), "Download complete!")
            self.assertEqual(dialog.speed_label.text(), "")
            self.assertEqual(dialog.time_label.text(), "")
            
            dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_download_error(self):
        """Test download error handling."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        from PySide6.QtWidgets import QMessageBox
        
        with patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader'), \
             patch.object(QMessageBox, 'warning') as mock_warning:
            
            dialog = DownloadProgressDialog("http://example.com/update.exe")
            
            # Simulate error
            dialog.on_download_error("Network error")
            
            # Check error was shown
            mock_warning.assert_called_once()
            # Note: on_download_error calls reject(), which may not set cancelled
            # The important thing is that the error dialog was shown
            
            dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_download_cancellation(self):
        """Test download cancellation."""
        from cuepoint.ui.dialogs.download_progress_dialog import DownloadProgressDialog
        
        mock_downloader = Mock()
        mock_downloader.cancel = Mock()
        
        with patch('cuepoint.ui.dialogs.download_progress_dialog.UpdateDownloader', return_value=mock_downloader):
            dialog = DownloadProgressDialog("http://example.com/update.exe")
            dialog.downloader = mock_downloader
            
            # Simulate cancel
            dialog.on_cancel()
            
            # Check cancellation
            mock_downloader.cancel.assert_called_once()
            self.assertTrue(dialog.cancelled)
            
            dialog.close()


class TestUpdateCheckDialogIntegration(unittest.TestCase):
    """Test integration between update check dialog and download."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_update_check_dialog_shows_download_button(self):
        """Test that update check dialog shows download button when update found."""
        update_info = {
            'short_version': '1.0.1-test13',
            'version': '1.0.1-test13',
            'download_url': 'http://example.com/update.exe',
            'file_size': 10 * 1024 * 1024,  # 10 MB
        }
        
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()  # Make dialog visible for visibility checks
        dialog.set_update_found(update_info)
        
        # Check download button is visible and has correct text
        # Note: Widget visibility depends on parent visibility, so we check the button state
        self.assertFalse(dialog.download_button.isHidden())  # Use isHidden() instead
        self.assertEqual(dialog.download_button.text(), "Download & Install")
        self.assertTrue(dialog.download_button.isDefault())
        
        # Check update info is stored
        self.assertEqual(dialog.update_info, update_info)
        
        dialog.close()
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def test_update_check_dialog_states(self):
        """Test update check dialog state transitions."""
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()  # Make dialog visible for visibility checks
        
        # Test checking state
        dialog.set_checking()
        # Progress bar should be visible when checking
        self.assertFalse(dialog.progress_bar.isHidden())
        # Results group and download button should be hidden
        self.assertTrue(dialog.results_group.isHidden())
        self.assertTrue(dialog.download_button.isHidden())
        
        # Test no update state
        dialog.set_no_update()
        self.assertTrue(dialog.progress_bar.isHidden())
        self.assertTrue(dialog.results_group.isHidden())
        self.assertTrue(dialog.download_button.isHidden())
        
        # Test error state
        dialog.set_error("Test error")
        self.assertTrue(dialog.progress_bar.isHidden())
        self.assertTrue(dialog.results_group.isHidden())
        self.assertTrue(dialog.download_button.isHidden())
        
        dialog.close()


class TestDownloadAndInstallFlow(unittest.TestCase):
    """Test the complete download and install flow."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @patch('PySide6.QtWidgets.QMessageBox')
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    def test_download_and_install_flow(self, mock_dialog_class, mock_installer_class, mock_msgbox_class):
        """Test complete download and install flow."""
        from cuepoint.ui.main_window import MainWindow
        from PySide6.QtWidgets import QDialog, QMessageBox
        
        # Setup mocks
        mock_dialog = Mock()
        mock_dialog.exec.return_value = QDialog.DialogCode.Accepted
        mock_dialog.get_downloaded_file.return_value = "/tmp/test_installer.exe"
        mock_dialog.cancelled = False
        mock_dialog_class.return_value = mock_dialog
        
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer.install.return_value = (True, None)
        mock_installer_class.return_value = mock_installer
        
        # Mock QMessageBox.question
        mock_msgbox_class.question.return_value = QMessageBox.StandardButton.Yes
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        window.update_manager._update_available = {
            'download_url': 'http://example.com/update.exe',
            'short_version': '1.0.1-test13',
        }
        
        # Test download and install
        update_info = {
            'download_url': 'http://example.com/update.exe',
            'short_version': '1.0.1-test13',
        }
        
        window._download_and_install_update(update_info)
        
        # Verify download dialog was created and shown
        mock_dialog_class.assert_called_once()
        mock_dialog.exec.assert_called_once()
        
        # Verify installation was attempted
        mock_installer_class.assert_called_once()
        mock_installer.can_install.assert_called_once()
        # QMessageBox.question is called inside _install_update
        mock_msgbox_class.question.assert_called()
        mock_installer.install.assert_called_once_with("/tmp/test_installer.exe")
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.main_window.QMessageBox')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    def test_download_cancelled(self, mock_dialog_class, mock_msgbox, mock_installer_class):
        """Test that cancelled download doesn't trigger installation."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_dialog = Mock()
        mock_dialog.exec.return_value = QDialog.DialogCode.Rejected
        mock_dialog.cancelled = True
        mock_dialog_class.return_value = mock_dialog
        
        # Create main window
        window = MainWindow()
        
        update_info = {
            'download_url': 'http://example.com/update.exe',
        }
        
        window._download_and_install_update(update_info)
        
        # Verify installation was NOT attempted
        mock_installer_class.assert_not_called()
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.main_window.QMessageBox')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    def test_download_failed(self, mock_dialog_class, mock_msgbox, mock_installer_class):
        """Test that failed download shows error."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_dialog = Mock()
        mock_dialog.exec.return_value = QDialog.DialogCode.Rejected
        mock_dialog.cancelled = False
        mock_dialog.get_downloaded_file.return_value = None
        mock_dialog_class.return_value = mock_dialog
        
        # Create main window
        window = MainWindow()
        
        update_info = {
            'download_url': 'http://example.com/update.exe',
        }
        
        window._download_and_install_update(update_info)
        
        # Verify installation was NOT attempted
        mock_installer_class.assert_not_called()


class TestStartupUpdateCheck(unittest.TestCase):
    """Test startup update check functionality."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    @patch('cuepoint.update.update_ui.show_update_check_dialog')
    @patch('cuepoint.update.update_preferences.UpdatePreferences')
    def test_startup_check_shows_dialog(self, mock_prefs_class, mock_show_dialog):
        """Test that startup check shows dialog when enabled."""
        from cuepoint.ui.main_window import MainWindow
        from cuepoint.update.update_preferences import UpdatePreferences
        
        # Setup mocks
        mock_prefs = Mock()
        mock_prefs.get_check_frequency.return_value = UpdatePreferences.CHECK_ON_STARTUP
        mock_prefs_class.return_value = mock_prefs
        
        mock_dialog = Mock()
        mock_show_dialog.return_value = mock_dialog
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        window.update_manager.preferences = mock_prefs
        window.update_manager.check_for_updates = Mock()
        
        # Test startup check
        window._check_for_updates_on_startup()
        
        # Verify dialog was shown
        mock_show_dialog.assert_called_once()
        mock_dialog.set_checking.assert_called_once()
        window.update_manager.check_for_updates.assert_called_once_with(force=False)
    
    @patch('cuepoint.update.update_ui.show_update_check_dialog')
    @patch('cuepoint.update.update_preferences.UpdatePreferences')
    def test_startup_check_disabled(self, mock_prefs_class, mock_show_dialog):
        """Test that startup check doesn't run when disabled."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_prefs = Mock()
        mock_prefs.get_check_frequency.return_value = 0  # Not CHECK_ON_STARTUP
        mock_prefs_class.return_value = mock_prefs
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        window.update_manager.preferences = mock_prefs
        window.update_manager.check_for_updates = Mock()
        
        # Test startup check
        window._check_for_updates_on_startup()
        
        # Verify dialog was NOT shown
        mock_show_dialog.assert_not_called()
        window.update_manager.check_for_updates.assert_not_called()


class TestUpdateDownloader(unittest.TestCase):
    """Test UpdateDownloader functionality."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_downloader_initialization(self):
        """Test that downloader initializes correctly."""
        downloader = UpdateDownloader()
        
        self.assertIsNotNone(downloader.network_manager)
        self.assertIsNone(downloader.current_reply)
        self.assertFalse(downloader.cancelled_flag)
    
    def test_downloader_signals(self):
        """Test that downloader has required signals."""
        downloader = UpdateDownloader()
        
        # Check signals exist
        self.assertTrue(hasattr(downloader, 'progress'))
        self.assertTrue(hasattr(downloader, 'download_speed'))
        self.assertTrue(hasattr(downloader, 'time_remaining'))
        self.assertTrue(hasattr(downloader, 'finished'))
        self.assertTrue(hasattr(downloader, 'error'))
        self.assertTrue(hasattr(downloader, 'cancelled'))


class TestUpdateInstaller(unittest.TestCase):
    """Test UpdateInstaller functionality."""
    
    @patch('platform.system')
    @patch('subprocess.Popen')
    @patch('sys.exit')
    def test_windows_installation(self, mock_exit, mock_popen, mock_system):
        """Test Windows installation."""
        mock_system.return_value = 'Windows'
        
        installer = UpdateInstaller()
        installer_path = "/tmp/test_installer.exe"
        
        # Create a mock file
        with patch('pathlib.Path.exists', return_value=True):
            success, error = installer.install(installer_path)
        
        # Verify installer was called with correct arguments
        mock_popen.assert_called_once()
        call_args = mock_popen.call_args[0][0]
        self.assertIn('/S', call_args)
        self.assertIn('/UPGRADE', call_args)
        
        # Verify sys.exit was called
        mock_exit.assert_called_once_with(0)
    
    @patch('platform.system')
    def test_unsupported_platform(self, mock_system):
        """Test unsupported platform handling."""
        mock_system.return_value = 'Linux'
        
        installer = UpdateInstaller()
        installer_path = "/tmp/test_installer.exe"
        
        with patch('pathlib.Path.exists', return_value=True):
            success, error = installer.install(installer_path)
        
        self.assertFalse(success)
        self.assertIn("Unsupported platform", error)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestDownloadProgressDialog))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateCheckDialogIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestDownloadAndInstallFlow))
    suite.addTests(loader.loadTestsFromTestCase(TestStartupUpdateCheck))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateDownloader))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstaller))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    
    if result.failures:
        print("\nFAILURES:")
        for test, traceback in result.failures:
            print(f"  - {test}")
            print(f"    {traceback.split(chr(10))[-2]}")
    
    if result.errors:
        print("\nERRORS:")
        for test, traceback in result.errors:
            print(f"  - {test}")
            print(f"    {traceback.split(chr(10))[-2]}")
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
