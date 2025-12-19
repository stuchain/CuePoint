#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UI Integration Tests for Update Installer

Tests the integration between UI components and the installer:
1. Main window -> Install update flow
2. Update dialog -> Download & Install button
3. Download progress -> Installation confirmation
4. Error handling in UI
5. User cancellation flows
"""

import sys
import unittest
import tempfile
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))

try:
    from PySide6.QtWidgets import QApplication, QDialog, QMessageBox
    from PySide6.QtCore import Qt
    from PySide6.QtTest import QTest
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("WARNING: PySide6 not available, skipping UI tests")


@unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
class TestUpdateInstallerUIIntegration(unittest.TestCase):
    """Test UI integration with update installer."""
    
    def setUp(self):
        """Set up test environment."""
        if not QApplication.instance():
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
        
        # Create temporary installer file
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('PySide6.QtWidgets.QMessageBox.question')
    def test_install_update_confirmation_dialog(self, mock_question, mock_installer_class):
        """Test that confirmation dialog appears before installation."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer.install.return_value = (True, None)
        mock_installer_class.return_value = mock_installer
        
        mock_question.return_value = QMessageBox.StandardButton.Yes
        
        # Create main window
        window = MainWindow()
        
        # Call install update
        window._install_update(str(self.test_installer))
        
        # Verify confirmation dialog was shown
        mock_question.assert_called_once()
        call_args = mock_question.call_args
        self.assertIn("Install Update", call_args[0][1])
        self.assertIn("Do you want to continue", call_args[0][2])
        
        # Verify installer was called
        mock_installer.install.assert_called_once_with(str(self.test_installer))
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('PySide6.QtWidgets.QMessageBox.question')
    def test_install_update_user_cancels(self, mock_question, mock_installer_class):
        """Test that installation is cancelled when user clicks No."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer_class.return_value = mock_installer
        
        mock_question.return_value = QMessageBox.StandardButton.No
        
        # Create main window
        window = MainWindow()
        
        # Call install update
        window._install_update(str(self.test_installer))
        
        # Verify confirmation dialog was shown
        mock_question.assert_called_once()
        # Verify installer.install was NOT called
        mock_installer.install.assert_not_called()
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('PySide6.QtWidgets.QMessageBox')
    def test_install_update_installation_fails(self, mock_msgbox_class, mock_installer_class):
        """Test error handling when installation fails."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer.install.return_value = (False, "Installation failed: Test error")
        mock_installer_class.return_value = mock_installer
        
        mock_msgbox_class.question.return_value = QMessageBox.StandardButton.Yes
        mock_msgbox_class.critical = Mock()
        
        # Create main window
        window = MainWindow()
        
        # Call install update
        window._install_update(str(self.test_installer))
        
        # Verify error message was shown
        mock_msgbox_class.critical.assert_called_once()
        call_args = mock_msgbox_class.critical.call_args
        self.assertIn("Installation Failed", call_args[0][1])
        self.assertIn("Test error", call_args[0][2])
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('PySide6.QtWidgets.QMessageBox')
    def test_install_update_platform_not_supported(self, mock_msgbox_class, mock_installer_class):
        """Test handling when platform doesn't support installation."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_installer = Mock()
        mock_installer.can_install.return_value = False
        mock_installer_class.return_value = mock_installer
        
        mock_msgbox_class.warning = Mock()
        
        # Create main window
        window = MainWindow()
        
        # Call install update
        window._install_update(str(self.test_installer))
        
        # Verify warning was shown
        mock_msgbox_class.warning.assert_called_once()
        call_args = mock_msgbox_class.warning.call_args
        self.assertIn("Installation Not Supported", call_args[0][1])
        
        # Verify installer.install was NOT called
        mock_installer.install.assert_not_called()
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    @patch('PySide6.QtWidgets.QMessageBox')
    def test_download_and_install_complete_flow(self, mock_msgbox_class, mock_download_dialog_class, mock_installer_class):
        """Test complete flow: download -> install."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_download_dialog = Mock()
        mock_download_dialog.exec.return_value = QDialog.DialogCode.Accepted
        mock_download_dialog.get_downloaded_file.return_value = str(self.test_installer)
        mock_download_dialog.cancelled = False
        mock_download_dialog_class.return_value = mock_download_dialog
        
        mock_installer = Mock()
        mock_installer.can_install.return_value = True
        mock_installer.install.return_value = (True, None)
        mock_installer_class.return_value = mock_installer
        
        mock_msgbox_class.question.return_value = QMessageBox.StandardButton.Yes
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        
        # Test download and install
        update_info = {
            'download_url': 'https://example.com/update.exe',
            'short_version': '1.0.1-test20',
        }
        
        window._download_and_install_update(update_info)
        
        # Verify download dialog was created
        mock_download_dialog_class.assert_called_once()
        mock_download_dialog.exec.assert_called_once()
        
        # Verify installation was attempted
        mock_installer.can_install.assert_called_once()
        mock_msgbox_class.question.assert_called()
        mock_installer.install.assert_called_once_with(str(self.test_installer))
    
    @patch('cuepoint.update.update_installer.UpdateInstaller')
    @patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog')
    def test_download_cancelled_no_installation(self, mock_download_dialog_class, mock_installer_class):
        """Test that cancelled download doesn't trigger installation."""
        from cuepoint.ui.main_window import MainWindow
        
        # Setup mocks
        mock_download_dialog = Mock()
        mock_download_dialog.exec.return_value = QDialog.DialogCode.Rejected
        mock_download_dialog.cancelled = True
        mock_download_dialog_class.return_value = mock_download_dialog
        
        mock_installer = Mock()
        mock_installer_class.return_value = mock_installer
        
        # Create main window
        window = MainWindow()
        window.update_manager = Mock()
        
        # Test download (cancelled)
        update_info = {
            'download_url': 'https://example.com/update.exe',
        }
        
        window._download_and_install_update(update_info)
        
        # Verify installation was NOT attempted
        mock_installer.can_install.assert_not_called()
        mock_installer.install.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
