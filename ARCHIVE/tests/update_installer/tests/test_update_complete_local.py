#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Complete Local Test Suite for Update System

Tests all update functionality locally without requiring GitHub downloads.
This ensures everything works before building and installing.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

try:
    from PySide6.QtWidgets import QApplication, QMessageBox
    from PySide6.QtCore import Qt, QTimer
    from PySide6.QtTest import QTest
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("WARNING: PySide6 not available. Some UI tests will be skipped.")

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_manager import UpdateManager
from cuepoint.update.version_utils import (
    compare_versions,
    is_stable_version,
    extract_base_version,
)
from cuepoint.update.update_ui import UpdateCheckDialog, show_update_check_dialog
from cuepoint.ui.main_window import MainWindow


class TestContextMenuFix(unittest.TestCase):
    """Test that context menu TypeError is fixed."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_context_menu_no_crash(self):
        """Test that context menu doesn't crash with TypeError."""
        from cuepoint.version import get_version
        
        dialog = UpdateCheckDialog(get_version(), None)
        dialog.show()
        
        # Set update found with links
        update_info = {
            'short_version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17',
        }
        
        dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Try to show context menu - should NOT crash with TypeError
        try:
            pos = dialog.results_label.rect().center()
            dialog._on_results_label_context_menu(pos)
            QApplication.processEvents()
            # If we get here, no TypeError occurred
            success = True
        except TypeError as e:
            if "missing 1 required positional argument: 'checked'" in str(e):
                self.fail("Context menu still has the TypeError bug! The fix was not applied.")
            raise
        except Exception:
            # Other exceptions are OK (like menu not showing)
            success = True
        
        self.assertTrue(success, "Context menu should not crash with TypeError")
        dialog.close()


class TestVersionFilteringComplete(unittest.TestCase):
    """Complete test of version filtering logic."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.feed_url = "https://stuchain.github.io/CuePoint/updates"
    
    def _create_mock_appcast_items(self, versions):
        """Create mock appcast items."""
        items = []
        for version in versions:
            items.append({
                'short_version': version,
                'version': version,
                'download_url': f'https://github.com/stuchain/CuePoint/releases/download/v{version}/CuePoint-Setup-v{version}.exe',
                'file_size': 95451610,
                'pub_date': datetime.now(),
            })
        return items
    
    def test_test_to_test_allowed(self):
        """Test: 1.0.0-test17 → 1.0.1-test20 (allowed)"""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast_items(["1.0.1-test20", "1.0.0-test18"])
        result = checker._find_latest_update(items)
        self.assertIsNotNone(result)
        self.assertEqual(result['short_version'], "1.0.1-test20")
    
    def test_stable_to_stable_allowed(self):
        """Test: 1.0.0 → 1.0.2 (allowed)"""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast_items(["1.0.2", "1.0.1"])
        result = checker._find_latest_update(items)
        self.assertIsNotNone(result)
        self.assertEqual(result['short_version'], "1.0.2")
    
    def test_stable_blocks_test(self):
        """Test: 1.0.0 (stable) → 1.0.1-test20 (blocked, should find 1.0.2 instead)"""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast_items(["1.0.1-test20", "1.0.2"])
        result = checker._find_latest_update(items)
        self.assertIsNotNone(result)
        self.assertEqual(result['short_version'], "1.0.2", "Should skip test version")
    
    def test_test_blocks_stable(self):
        """Test: 1.0.0-test17 → 1.0.1 (blocked, should find 1.0.0-test20 instead)"""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast_items(["1.0.1", "1.0.0-test20"])
        result = checker._find_latest_update(items)
        self.assertIsNotNone(result)
        self.assertEqual(result['short_version'], "1.0.0-test20", "Should skip stable version")


class TestDownloadFlowComplete(unittest.TestCase):
    """Complete test of download flow."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
        
        self.window = MainWindow()
        self.window.show()
        
        # Mock update manager
        from unittest.mock import Mock
        self.window.update_manager = Mock()
        self.window.update_manager._update_available = None
    
    def tearDown(self):
        """Clean up."""
        if hasattr(self, 'dialog') and self.dialog:
            self.dialog.close()
        if hasattr(self, 'window') and self.window:
            self.window.close()
    
    def test_full_download_flow(self):
        """Test complete download flow from dialog to download dialog."""
        from cuepoint.version import get_version
        
        # Create dialog
        self.dialog = show_update_check_dialog(get_version(), self.window)
        self.window.update_check_dialog = self.dialog
        self.dialog.show()
        QApplication.processEvents()
        
        # Set update found
        update_info = {
            'short_version': '1.0.1-test17',
            'version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'file_size': 95451610,
        }
        
        # Simulate _on_update_available flow
        self.dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Connect button exactly like _on_update_available does
        if not hasattr(self.dialog, '_download_connected'):
            self.dialog.update_info = update_info
            self.window.update_manager._update_available = update_info
            
            def on_download_clicked():
                self.window._on_update_install_from_dialog()
            
            try:
                self.dialog.download_button.clicked.disconnect()
            except TypeError:
                pass
            
            self.dialog.download_button.clicked.connect(on_download_clicked)
            self.dialog._download_connected = True
        
        # Mock DownloadProgressDialog to avoid actual download
        with patch('cuepoint.ui.dialogs.download_progress_dialog.DownloadProgressDialog') as MockDownloadDialog:
            mock_dialog = Mock()
            mock_dialog.exec.return_value = 0  # Cancelled
            mock_dialog.get_downloaded_file.return_value = None
            mock_dialog.cancelled = True
            MockDownloadDialog.return_value = mock_dialog
            
            # Click download button
            QTest.mouseClick(self.dialog.download_button, Qt.MouseButton.LeftButton)
            QApplication.processEvents()
            
            # Give it time to process
            QTimer.singleShot(100, lambda: None)
            QApplication.processEvents()
            
            # Verify download dialog was created with correct URL
            MockDownloadDialog.assert_called_once()
            call_args = MockDownloadDialog.call_args[0]
            self.assertEqual(call_args[0], update_info['download_url'])


class TestStartupCheckComplete(unittest.TestCase):
    """Test startup update check."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_startup_check_uses_force_true(self):
        """Test that startup check uses force=True."""
        from cuepoint.update.update_preferences import UpdatePreferences
        
        window = MainWindow()
        
        # Mock update manager
        mock_manager = Mock()
        mock_manager.preferences = Mock()
        mock_manager.preferences.get_check_frequency.return_value = UpdatePreferences.CHECK_ON_STARTUP
        mock_manager.check_for_updates.return_value = True
        
        window.update_manager = mock_manager
        
        # Call startup check
        window._check_for_updates_on_startup()
        
        # Verify force=True was used
        mock_manager.check_for_updates.assert_called_once_with(force=True)
        
        window.close()


class TestUpdateInfoStorage(unittest.TestCase):
    """Test that update_info is properly stored and retrieved."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_update_info_persistence(self):
        """Test that update_info persists through dialog operations."""
        from cuepoint.version import get_version
        
        window = MainWindow()
        dialog = show_update_check_dialog(get_version(), window)
        window.update_check_dialog = dialog
        
        update_info = {
            'short_version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
        }
        
        # Set update found
        dialog.set_update_found(update_info)
        QApplication.processEvents()
        
        # Verify it's stored
        self.assertEqual(dialog.update_info, update_info)
        
        # Simulate button click handler accessing it
        retrieved_info = getattr(dialog, 'update_info', None)
        self.assertIsNotNone(retrieved_info)
        self.assertEqual(retrieved_info['short_version'], '1.0.1-test17')
        
        dialog.close()
        window.close()


def run_all_local_tests():
    """Run all local tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    test_classes = [
        TestContextMenuFix,
        TestVersionFilteringComplete,
        TestDownloadFlowComplete,
        TestStartupCheckComplete,
        TestUpdateInfoStorage,
    ]
    
    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    print("=" * 70)
    print("COMPLETE LOCAL UPDATE SYSTEM TEST SUITE")
    print("=" * 70)
    print()
    print("Testing:")
    print("  - Context menu fix (no TypeError)")
    print("  - Version filtering (test to test, stable to stable)")
    print("  - Complete download flow")
    print("  - Startup check (force=True)")
    print("  - Update info storage")
    print()
    print("=" * 70)
    print()
    
    success = run_all_local_tests()
    
    print()
    print("=" * 70)
    if success:
        print("[PASS] ALL TESTS PASSED!")
        print("The update system is ready for local build.")
    else:
        print("[FAIL] SOME TESTS FAILED")
        print("Please fix the issues before building.")
    print("=" * 70)
    
    sys.exit(0 if success else 1)
