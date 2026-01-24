#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Test Suite for Update System

Tests all aspects of the update system including:
- Version filtering (test to test, stable to stable)
- Context menu functionality
- Update dialog behavior
- Download URL extraction
- Error handling
- All edge cases
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

try:
    from PySide6.QtWidgets import QApplication
    from PySide6.QtCore import QTimer
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("WARNING: PySide6 not available. Some UI tests will be skipped.")

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_manager import UpdateManager
from cuepoint.update.version_utils import (
    compare_versions,
    is_stable_version,
    extract_base_version,
    parse_version,
)
from cuepoint.update.update_ui import UpdateCheckDialog, show_update_check_dialog


class TestVersionFiltering(unittest.TestCase):
    """Test version filtering: test versions can only update to test, stable to stable."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.feed_url = "https://stuchain.github.io/CuePoint/updates"
    
    def _create_mock_appcast(self, versions):
        """Create a mock appcast XML with given versions."""
        items = []
        for version in versions:
            is_test = not is_stable_version(version)
            item = {
                'short_version': version,
                'version': version,
                'download_url': f'https://github.com/stuchain/CuePoint/releases/download/v{version}/CuePoint-Setup-v{version}.exe',
                'file_size': 95451610,
                'pub_date': datetime.now(),
            }
            items.append(item)
        return items
    
    def test_test_to_test_allowed(self):
        """Test versions can update to other test versions."""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast(["1.0.1-test20", "1.0.0-test18"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNotNone(result, "Test version should find test update")
        self.assertEqual(result['short_version'], "1.0.1-test20")
    
    def test_stable_to_stable_allowed(self):
        """Stable versions can update to other stable versions."""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast(["1.0.2", "1.0.1"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNotNone(result, "Stable version should find stable update")
        self.assertEqual(result['short_version'], "1.0.2")
    
    def test_stable_to_test_blocked(self):
        """Stable versions CANNOT update to test versions."""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast(["1.0.1-test20", "1.0.2"])
        
        result = checker._find_latest_update(items)
        
        # Should find 1.0.2 (stable), not 1.0.1-test20 (test)
        self.assertIsNotNone(result, "Should find stable update")
        self.assertEqual(result['short_version'], "1.0.2", "Should skip test version")
    
    def test_test_to_stable_blocked(self):
        """Test versions CANNOT update to stable versions."""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast(["1.0.1", "1.0.0-test20"])
        
        result = checker._find_latest_update(items)
        
        # Should find 1.0.0-test20 (test), not 1.0.1 (stable)
        self.assertIsNotNone(result, "Should find test update")
        self.assertEqual(result['short_version'], "1.0.0-test20", "Should skip stable version")
    
    def test_same_base_test_to_test_allowed(self):
        """Test versions can update to newer test version with same base."""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast(["1.0.0-test20", "1.0.0-test18"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNotNone(result, "Should find newer test version")
        self.assertEqual(result['short_version'], "1.0.0-test20")
    
    def test_same_base_stable_to_stable_blocked(self):
        """Stable versions cannot update to same stable version."""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast(["1.0.0"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNone(result, "Should not find update for same version")
    
    def test_test_to_newer_base_test_allowed(self):
        """Test versions can update to test version with newer base."""
        checker = UpdateChecker(self.feed_url, "1.0.0-test17", "stable")
        items = self._create_mock_appcast(["1.0.1-test20"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNotNone(result, "Should find test update with newer base")
        self.assertEqual(result['short_version'], "1.0.1-test20")
    
    def test_stable_to_newer_base_stable_allowed(self):
        """Stable versions can update to stable version with newer base."""
        checker = UpdateChecker(self.feed_url, "1.0.0", "stable")
        items = self._create_mock_appcast(["1.0.2"])
        
        result = checker._find_latest_update(items)
        
        self.assertIsNotNone(result, "Should find stable update with newer base")
        self.assertEqual(result['short_version'], "1.0.2")


class TestUpdateDialog(unittest.TestCase):
    """Test update dialog functionality."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_dialog_creation(self):
        """Test that update dialog can be created."""
        dialog = show_update_check_dialog("1.0.0", None)
        self.assertIsNotNone(dialog)
        self.assertEqual(dialog.current_version, "1.0.0")
    
    def test_set_update_found(self):
        """Test setting update found information."""
        dialog = UpdateCheckDialog("1.0.0", None)
        dialog.show()  # Make sure dialog is shown so buttons are properly initialized
        
        update_info = {
            'short_version': '1.0.1-test17',
            'version': '1.0.1-test17',
            'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
            'file_size': 95451610,
            'pub_date': datetime.now(),
        }
        
        dialog.set_update_found(update_info)
        
        self.assertEqual(dialog.update_info, update_info)
        # Process events to ensure UI is updated
        QApplication.processEvents()
        self.assertTrue(dialog.download_button.isVisible())
        self.assertTrue(dialog.download_button.isEnabled())
    
    def test_update_info_storage(self):
        """Test that update_info is properly stored in dialog."""
        dialog = UpdateCheckDialog("1.0.0", None)
        
        update_info = {
            'short_version': '1.0.1',
            'download_url': 'https://example.com/update.exe',
        }
        
        dialog.set_update_found(update_info)
        
        # Check that update_info is stored
        self.assertIsNotNone(dialog.update_info)
        self.assertEqual(dialog.update_info['short_version'], '1.0.1')
        self.assertEqual(dialog.update_info['download_url'], 'https://example.com/update.exe')
    
    def test_release_date_display(self):
        """Test that release date is displayed when available."""
        dialog = UpdateCheckDialog("1.0.0", None)
        dialog.show()  # Make sure dialog is shown
        
        update_info = {
            'short_version': '1.0.1',
            'download_url': 'https://example.com/update.exe',
            'pub_date': datetime(2024, 12, 19),
        }
        
        dialog.set_update_found(update_info)
        QApplication.processEvents()  # Process events to ensure UI is updated
        
        # Check that results label contains release date
        results_text = dialog.results_label.text()
        self.assertIn("Released:", results_text)
        self.assertIn("2024-12-19", results_text)


class TestContextMenu(unittest.TestCase):
    """Test context menu functionality (the bug we fixed)."""
    
    @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
    def setUp(self):
        """Set up test fixtures."""
        if QApplication.instance() is None:
            self.app = QApplication(sys.argv)
        else:
            self.app = QApplication.instance()
    
    def test_context_menu_no_links(self):
        """Test context menu when no links are present."""
        dialog = UpdateCheckDialog("1.0.0", None)
        dialog.results_label.setText("No links here")
        
        # This should not crash
        try:
            dialog._on_results_label_context_menu(dialog.results_label.rect().center())
        except TypeError as e:
            if "missing 1 required positional argument: 'checked'" in str(e):
                self.fail("Context menu handler should accept 'checked' parameter")
            raise
    
    def test_context_menu_with_links(self):
        """Test context menu when links are present."""
        dialog = UpdateCheckDialog("1.0.0", None)
        dialog.results_label.setText('<a href="https://example.com">Test Link</a>')
        
        # This should not crash
        try:
            dialog._on_results_label_context_menu(dialog.results_label.rect().center())
        except TypeError as e:
            if "missing 1 required positional argument: 'checked'" in str(e):
                self.fail("Context menu handler should accept 'checked' parameter")
            raise
    
    def test_copy_link_functionality(self):
        """Test that copy link functionality works."""
        dialog = UpdateCheckDialog("1.0.0", None)
        test_url = "https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe"
        
        dialog._copy_link_to_clipboard(test_url)
        
        clipboard = QApplication.clipboard()
        self.assertEqual(clipboard.text(), test_url)


class TestDownloadURLExtraction(unittest.TestCase):
    """Test download URL extraction from appcast."""
    
    def test_download_url_from_appcast(self):
        """Test that download URL is correctly extracted from appcast."""
        import xml.etree.ElementTree as ET
        
        appcast_xml = """<?xml version="1.0"?>
        <rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
            <channel>
                <item>
                    <title>Version 1.0.1-test17</title>
                    <pubDate>Fri, 19 Dec 2025 08:10:40 -0000</pubDate>
                    <sparkle:version>10001</sparkle:version>
                    <sparkle:shortVersionString>1.0.1-test17</sparkle:shortVersionString>
                    <enclosure url="https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe" 
                               sparkle:version="10001" 
                               sparkle:shortVersionString="1.0.1-test17" 
                               length="95451610" 
                               type="application/octet-stream" />
                    <sparkle:releaseNotesLink>https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17</sparkle:releaseNotesLink>
                </item>
            </channel>
        </rss>"""
        
        checker = UpdateChecker("https://stuchain.github.io/CuePoint/updates", "1.0.0", "stable")
        items = checker._parse_appcast(appcast_xml.encode('utf-8'))
        
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['download_url'], 
                        'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe')
        self.assertEqual(items[0]['short_version'], '1.0.1-test17')


class TestStartupUpdateCheck(unittest.TestCase):
    """Test startup update check functionality."""
    
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
        
        # Mock the update manager
        with patch('cuepoint.ui.main_window.UpdateManager') as MockUpdateManager:
            from cuepoint.ui.main_window import MainWindow
            
            # Create a mock update manager
            mock_manager = Mock()
            mock_manager.preferences = Mock()
            mock_manager.preferences.get_check_frequency.return_value = UpdatePreferences.CHECK_ON_STARTUP
            mock_manager.check_for_updates.return_value = True
            
            # Create main window
            window = MainWindow()
            window.update_manager = mock_manager
            
            # Call startup check
            window._check_for_updates_on_startup()
            
            # Verify that check_for_updates was called with force=True
            mock_manager.check_for_updates.assert_called_once_with(force=True)


class TestErrorHandling(unittest.TestCase):
    """Test error handling in update system."""
    
    def test_missing_update_info_handling(self):
        """Test handling when update_info is missing."""
        @unittest.skipIf(not QT_AVAILABLE, "PySide6 not available")
        def test():
            if QApplication.instance() is None:
                app = QApplication(sys.argv)
            
            dialog = UpdateCheckDialog("1.0.0", None)
            
            # Try to get update_info when it's None
            self.assertIsNone(dialog.update_info)
            
            # Setting update found should work
            update_info = {'short_version': '1.0.1'}
            dialog.set_update_found(update_info)
            self.assertIsNotNone(dialog.update_info)
        
        if QT_AVAILABLE:
            test()


class TestVersionUtils(unittest.TestCase):
    """Test version utility functions."""
    
    def test_is_stable_version(self):
        """Test is_stable_version function."""
        self.assertTrue(is_stable_version("1.0.0"))
        self.assertTrue(is_stable_version("1.0.1"))
        self.assertFalse(is_stable_version("1.0.0-test"))
        self.assertFalse(is_stable_version("1.0.1-test17"))
        self.assertFalse(is_stable_version("1.0.0-beta"))
    
    def test_extract_base_version(self):
        """Test extract_base_version function."""
        self.assertEqual(extract_base_version("1.0.0"), "1.0.0")
        self.assertEqual(extract_base_version("1.0.1-test17"), "1.0.1")
        self.assertEqual(extract_base_version("1.0.0-test"), "1.0.0")
        self.assertEqual(extract_base_version("1.0.2-beta.1"), "1.0.2")
    
    def test_compare_versions(self):
        """Test version comparison."""
        # Stable versions
        self.assertEqual(compare_versions("1.0.0", "1.0.1"), -1)
        self.assertEqual(compare_versions("1.0.1", "1.0.0"), 1)
        self.assertEqual(compare_versions("1.0.0", "1.0.0"), 0)
        
        # Test versions
        self.assertEqual(compare_versions("1.0.0-test17", "1.0.0-test20"), -1)
        self.assertEqual(compare_versions("1.0.0-test20", "1.0.0-test17"), 1)
        
        # Stable vs test
        self.assertEqual(compare_versions("1.0.0", "1.0.0-test17"), 1)  # Stable > test
        self.assertEqual(compare_versions("1.0.0-test17", "1.0.0"), -1)  # Test < stable


class TestRealWorldScenarios(unittest.TestCase):
    """Test real-world update scenarios."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.feed_url = "https://stuchain.github.io/CuePoint/updates"
    
    def _create_checker_with_mock_feed(self, current_version, available_versions):
        """Create a checker with a mock feed."""
        checker = UpdateChecker(self.feed_url, current_version, "stable")
        
        # Mock the _fetch_appcast method
        import xml.etree.ElementTree as ET
        from email.utils import formatdate
        
        items_xml = []
        for version in available_versions:
            is_test = not is_stable_version(version)
            build_num = version.replace('.', '').replace('-test', '').replace('-', '')
            items_xml.append(f"""
            <item>
                <title>Version {version}</title>
                <pubDate>{formatdate()}</pubDate>
                <sparkle:version>{build_num}</sparkle:version>
                <sparkle:shortVersionString>{version}</sparkle:shortVersionString>
                <enclosure url="https://github.com/stuchain/CuePoint/releases/download/v{version}/CuePoint-Setup-v{version}.exe" 
                           length="95451610" 
                           type="application/octet-stream" />
            </item>
            """)
        
        appcast_xml = f"""<?xml version="1.0"?>
        <rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
            <channel>
                {''.join(items_xml)}
            </channel>
        </rss>"""
        
        checker._fetch_appcast = Mock(return_value=appcast_xml.encode('utf-8'))
        return checker
    
    def test_scenario_test_to_test_update(self):
        """Scenario: User on v1.0.0-test17, new release v1.0.1-test20."""
        checker = self._create_checker_with_mock_feed(
            "1.0.0-test17",
            ["1.0.1-test20", "1.0.0-test18"]
        )
        
        result = checker.check_for_updates("windows")
        
        self.assertIsNotNone(result, "Should find test update")
        self.assertEqual(result['short_version'], "1.0.1-test20")
    
    def test_scenario_stable_to_stable_update(self):
        """Scenario: User on v1.0.0, new release v1.0.2."""
        checker = self._create_checker_with_mock_feed(
            "1.0.0",
            ["1.0.2", "1.0.1"]
        )
        
        result = checker.check_for_updates("windows")
        
        self.assertIsNotNone(result, "Should find stable update")
        self.assertEqual(result['short_version'], "1.0.2")
    
    def test_scenario_stable_blocks_test(self):
        """Scenario: User on v1.0.0 (stable), new test release v1.0.1-test20."""
        checker = self._create_checker_with_mock_feed(
            "1.0.0",
            ["1.0.1-test20", "1.0.2"]
        )
        
        result = checker.check_for_updates("windows")
        
        # Should find 1.0.2 (stable), not 1.0.1-test20 (test)
        self.assertIsNotNone(result, "Should find stable update")
        self.assertEqual(result['short_version'], "1.0.2", "Should skip test version")
    
    def test_scenario_test_blocks_stable(self):
        """Scenario: User on v1.0.0-test17, new stable release v1.0.1."""
        checker = self._create_checker_with_mock_feed(
            "1.0.0-test17",
            ["1.0.1", "1.0.0-test20"]
        )
        
        result = checker.check_for_updates("windows")
        
        # Should find 1.0.0-test20 (test), not 1.0.1 (stable)
        self.assertIsNotNone(result, "Should find test update")
        self.assertEqual(result['short_version'], "1.0.0-test20", "Should skip stable version")


def run_all_tests():
    """Run all test suites."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    test_classes = [
        TestVersionFiltering,
        TestUpdateDialog,
        TestContextMenu,
        TestDownloadURLExtraction,
        TestStartupUpdateCheck,
        TestErrorHandling,
        TestVersionUtils,
        TestRealWorldScenarios,
    ]
    
    for test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    print("=" * 70)
    print("COMPREHENSIVE UPDATE SYSTEM TEST SUITE")
    print("=" * 70)
    print()
    print("Testing:")
    print("  - Version filtering (test to test, stable to stable)")
    print("  - Update dialog functionality")
    print("  - Context menu (bug fix)")
    print("  - Download URL extraction")
    print("  - Startup update check")
    print("  - Error handling")
    print("  - Version utilities")
    print("  - Real-world scenarios")
    print()
    print("=" * 70)
    print()
    
    success = run_all_tests()
    
    print()
    print("=" * 70)
    if success:
        print("✅ ALL TESTS PASSED! Update system is ready for production.")
    else:
        print("❌ SOME TESTS FAILED. Please review the output above.")
    print("=" * 70)
    
    sys.exit(0 if success else 1)
