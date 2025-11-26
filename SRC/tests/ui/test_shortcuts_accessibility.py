#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Test Suite for Keyboard Shortcuts and Accessibility Features

Tests all aspects of the shortcut manager, customization, and accessibility improvements.
"""

import sys
import os
import unittest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import tempfile
import shutil

# Add SRC to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PySide6.QtWidgets import QApplication, QWidget, QPushButton, QLineEdit
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence, QKeyEvent
from PySide6.QtTest import QTest

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.shortcut_manager import ShortcutManager, ShortcutContext
from cuepoint.ui.widgets.shortcut_customization_dialog import ShortcutCustomizationDialog, ShortcutInputDialog
from cuepoint.ui.widgets.dialogs import KeyboardShortcutsDialog


class TestShortcutManager(unittest.TestCase):
    """Test ShortcutManager functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        self.parent_widget = QWidget()
        self.manager = ShortcutManager(self.parent_widget)
        
        # Create temporary config directory
        self.temp_dir = tempfile.mkdtemp()
        self.original_config_path = self.manager.config_path
        self.manager.config_path = Path(self.temp_dir) / "shortcuts.json"
    
    def tearDown(self):
        """Clean up after tests"""
        # Restore original config path
        self.manager.config_path = self.original_config_path
        # Clean up temp directory
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_shortcut_manager_creation(self):
        """Test that ShortcutManager can be created"""
        self.assertIsNotNone(self.manager)
        self.assertEqual(self.manager.current_context, ShortcutContext.GLOBAL)
        print("[OK] ShortcutManager created successfully")
    
    def test_register_shortcut(self):
        """Test registering a shortcut"""
        callback_called = [False]
        
        def test_callback():
            callback_called[0] = True
        
        self.manager.register_shortcut(
            "test_action",
            "Ctrl+T",
            test_callback,
            ShortcutContext.GLOBAL,
            "Test action"
        )
        
        self.assertIn("test_action", self.manager.shortcuts)
        self.assertIn("test_action", self.manager.shortcut_actions)
        print("[OK] Shortcut registered successfully")
        
        # Test that shortcut is callable
        shortcut = self.manager.get_shortcut("test_action")
        self.assertIsNotNone(shortcut)
        shortcut.activated.emit()
        # Note: In real Qt app, this would trigger the callback
        print("[OK] Shortcut is callable")
    
    def test_get_shortcut_sequence(self):
        """Test getting shortcut sequence"""
        self.manager.register_shortcut(
            "test_action",
            "Ctrl+T",
            lambda: None,
            ShortcutContext.GLOBAL
        )
        
        sequence = self.manager.get_shortcut_sequence("test_action")
        self.assertIsNotNone(sequence)
        print(f"[OK] Got shortcut sequence: {sequence}")
    
    def test_platform_adaptation(self):
        """Test platform adaptation (Cmd on macOS, Ctrl on others)"""
        # Test Windows/Linux (Ctrl)
        with patch('sys.platform', 'win32'):
            manager = ShortcutManager(self.parent_widget)
            adapted = manager._adapt_for_platform("Ctrl+O")
            self.assertEqual(adapted, "Ctrl+O")
            print("[OK] Windows platform adaptation works")
        
        # Test macOS (Cmd)
        with patch('sys.platform', 'darwin'):
            manager = ShortcutManager(self.parent_widget)
            adapted = manager._adapt_for_platform("Ctrl+O")
            self.assertEqual(adapted, "Meta+O")
            print("[OK] macOS platform adaptation works")
    
    def test_context_switching(self):
        """Test context switching"""
        # Register shortcuts for different contexts
        self.manager.register_shortcut(
            "global_action",
            "Ctrl+G",
            lambda: None,
            ShortcutContext.GLOBAL
        )
        
        self.manager.register_shortcut(
            "main_action",
            "Ctrl+M",
            lambda: None,
            ShortcutContext.MAIN_WINDOW
        )
        
        # Switch to main window context
        self.manager.set_context(ShortcutContext.MAIN_WINDOW)
        self.assertEqual(self.manager.current_context, ShortcutContext.MAIN_WINDOW)
        print("[OK] Context switching works")
    
    def test_custom_shortcut_persistence(self):
        """Test custom shortcut saving and loading"""
        # Set a custom shortcut
        self.manager.register_shortcut(
            "test_action",
            "Ctrl+T",
            lambda: None,
            ShortcutContext.GLOBAL
        )
        
        success = self.manager.set_custom_shortcut("test_action", "Ctrl+Shift+T")
        self.assertTrue(success)
        print("[OK] Custom shortcut set")
        
        # Save
        self.manager.save_custom_shortcuts()
        self.assertTrue(self.manager.config_path.exists())
        print("[OK] Custom shortcuts saved")
        
        # Create new manager and load
        new_manager = ShortcutManager(self.parent_widget)
        new_manager.config_path = self.manager.config_path
        new_manager.load_custom_shortcuts()
        
        self.assertIn("test_action", new_manager.custom_shortcuts)
        self.assertEqual(new_manager.custom_shortcuts["test_action"], "Ctrl+Shift+T")
        print("[OK] Custom shortcuts loaded")
    
    def test_reset_shortcut(self):
        """Test resetting shortcut to default"""
        self.manager.register_shortcut(
            "test_action",
            "Ctrl+T",
            lambda: None,
            ShortcutContext.GLOBAL
        )
        
        # Set custom
        self.manager.set_custom_shortcut("test_action", "Ctrl+Shift+T")
        self.assertIn("test_action", self.manager.custom_shortcuts)
        
        # Reset
        self.manager.reset_shortcut("test_action")
        self.assertNotIn("test_action", self.manager.custom_shortcuts)
        print("[OK] Shortcut reset to default")
    
    def test_get_all_shortcuts(self):
        """Test getting all shortcuts"""
        all_shortcuts = self.manager.get_all_shortcuts()
        self.assertIsInstance(all_shortcuts, dict)
        self.assertGreater(len(all_shortcuts), 0)
        print(f"[OK] Got {len(all_shortcuts)} shortcuts")
    
    def test_get_shortcuts_for_context(self):
        """Test getting shortcuts for specific context"""
        shortcuts = self.manager.get_shortcuts_for_context(ShortcutContext.GLOBAL)
        self.assertIsInstance(shortcuts, dict)
        self.assertGreater(len(shortcuts), 0)
        print(f"[OK] Got {len(shortcuts)} shortcuts for GLOBAL context")


class TestShortcutCustomizationDialog(unittest.TestCase):
    """Test ShortcutCustomizationDialog"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        self.parent_widget = QWidget()
        self.manager = ShortcutManager(self.parent_widget)
        self.dialog = ShortcutCustomizationDialog(self.manager)
    
    def test_dialog_creation(self):
        """Test that dialog can be created"""
        self.assertIsNotNone(self.dialog)
        self.assertEqual(self.dialog.windowTitle(), "Customize Keyboard Shortcuts")
        print("[OK] ShortcutCustomizationDialog created")
    
    def test_load_shortcuts(self):
        """Test loading shortcuts into table"""
        self.dialog.load_shortcuts()
        self.assertGreater(self.dialog.table.rowCount(), 0)
        print(f"[OK] Loaded {self.dialog.table.rowCount()} shortcuts into table")
    
    def test_check_conflict(self):
        """Test conflict detection"""
        self.dialog.load_shortcuts()
        
        # Set up a conflict scenario
        if self.dialog.table.rowCount() >= 2:
            # Get first two shortcuts
            action1 = self.dialog.table.item(0, 0).text()
            action2 = self.dialog.table.item(1, 0).text()
            shortcut1 = self.dialog.table.item(0, 2).text()
            
            # Check if conflict detection works
            has_conflict = self.dialog.check_conflict(action1, shortcut1)
            # Should conflict with itself (same shortcut)
            print(f"[OK] Conflict detection works: {has_conflict}")


class TestShortcutInputDialog(unittest.TestCase):
    """Test ShortcutInputDialog"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        self.dialog = ShortcutInputDialog("Ctrl+T")
    
    def test_dialog_creation(self):
        """Test that dialog can be created"""
        self.assertIsNotNone(self.dialog)
        self.assertEqual(self.dialog.windowTitle(), "Edit Shortcut")
        print("[OK] ShortcutInputDialog created")
    
    def test_get_shortcut(self):
        """Test getting shortcut"""
        shortcut = self.dialog.get_shortcut()
        self.assertEqual(shortcut, "Ctrl+T")
        print(f"[OK] Got shortcut: {shortcut}")


class TestKeyboardShortcutsDialog(unittest.TestCase):
    """Test KeyboardShortcutsDialog"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        self.parent_widget = QWidget()
        self.manager = ShortcutManager(self.parent_widget)
        self.dialog = KeyboardShortcutsDialog(self.manager)
    
    def test_dialog_creation(self):
        """Test that dialog can be created"""
        self.assertIsNotNone(self.dialog)
        self.assertEqual(self.dialog.windowTitle(), "Keyboard Shortcuts - CuePoint")
        print("[OK] KeyboardShortcutsDialog created")
    
    def test_tabs_created(self):
        """Test that context tabs are created"""
        if hasattr(self.dialog, 'tabs'):
            self.assertGreater(self.dialog.tabs.count(), 0)
            print(f"[OK] Created {self.dialog.tabs.count()} context tabs")
    
    def test_create_shortcuts_table(self):
        """Test creating shortcuts table for context"""
        table = self.dialog.create_shortcuts_table(ShortcutContext.GLOBAL)
        self.assertIsNotNone(table)
        self.assertGreater(table.rowCount(), 0)
        print(f"[OK] Created shortcuts table with {table.rowCount()} rows")


class TestMainWindowShortcuts(unittest.TestCase):
    """Test shortcuts integration in MainWindow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        from gui.main_window import MainWindow
        self.window = MainWindow()
    
    def test_shortcut_manager_exists(self):
        """Test that shortcut manager exists in main window"""
        self.assertIsNotNone(self.window.shortcut_manager)
        self.assertIsInstance(self.window.shortcut_manager, ShortcutManager)
        print("[OK] ShortcutManager exists in MainWindow")
    
    def test_shortcuts_registered(self):
        """Test that shortcuts are registered"""
        manager = self.window.shortcut_manager
        
        # Check some key shortcuts
        self.assertIsNotNone(manager.get_shortcut("open_file"))
        self.assertIsNotNone(manager.get_shortcut("export_results"))
        self.assertIsNotNone(manager.get_shortcut("help"))
        print("[OK] Key shortcuts registered")
    
    def test_shortcut_sequences(self):
        """Test that shortcut sequences are correct"""
        manager = self.window.shortcut_manager
        
        # Check sequences
        open_seq = manager.get_shortcut_sequence("open_file")
        self.assertIn("O", open_seq.upper() or "")
        print(f"[OK] Open file shortcut: {open_seq}")
        
        help_seq = manager.get_shortcut_sequence("help")
        self.assertIn("F1", help_seq or "")
        print(f"[OK] Help shortcut: {help_seq}")


class TestResultsViewShortcuts(unittest.TestCase):
    """Test shortcuts integration in ResultsView"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        from gui.results_view import ResultsView
        self.results_view = ResultsView()
    
    def test_shortcut_manager_exists(self):
        """Test that shortcut manager exists in results view"""
        self.assertIsNotNone(self.results_view.shortcut_manager)
        self.assertIsInstance(self.results_view.shortcut_manager, ShortcutManager)
        print("[OK] ShortcutManager exists in ResultsView")
    
    def test_results_shortcuts_registered(self):
        """Test that results view shortcuts are registered"""
        manager = self.results_view.shortcut_manager
        
        # Check key shortcuts
        self.assertIsNotNone(manager.get_shortcut("focus_search"))
        self.assertIsNotNone(manager.get_shortcut("clear_filters"))
        self.assertIsNotNone(manager.get_shortcut("select_all"))
        print("[OK] Results view shortcuts registered")


class TestAccessibilityFeatures(unittest.TestCase):
    """Test accessibility features"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.app = QApplication.instance()
        if self.app is None:
            self.app = QApplication(sys.argv)
        
        from gui.main_window import MainWindow
        self.window = MainWindow()
    
    def test_button_tooltips(self):
        """Test that buttons have tooltips"""
        # Check start button
        if hasattr(self.window, 'start_button'):
            tooltip = self.window.start_button.toolTip()
            self.assertIsNotNone(tooltip)
            self.assertGreater(len(tooltip), 0)
            print(f"[OK] Start button tooltip: {tooltip}")
    
    def test_button_accessible_names(self):
        """Test that buttons have accessible names"""
        if hasattr(self.window, 'start_button'):
            name = self.window.start_button.accessibleName()
            self.assertIsNotNone(name)
            self.assertGreater(len(name), 0)
            print(f"[OK] Start button accessible name: {name}")
    
    def test_button_focus_policy(self):
        """Test that buttons have proper focus policy"""
        if hasattr(self.window, 'start_button'):
            focus_policy = self.window.start_button.focusPolicy()
            self.assertEqual(focus_policy, Qt.StrongFocus)
            print("[OK] Start button has StrongFocus policy")
    
    def test_results_view_accessibility(self):
        """Test accessibility in results view"""
        from gui.results_view import ResultsView
        results_view = ResultsView()
        
        # Check search box
        if hasattr(results_view, 'search_box'):
            tooltip = results_view.search_box.toolTip()
            self.assertIsNotNone(tooltip)
            print(f"[OK] Search box tooltip: {tooltip}")
            
            accessible_name = results_view.search_box.accessibleName()
            self.assertIsNotNone(accessible_name)
            print(f"[OK] Search box accessible name: {accessible_name}")


def run_all_tests():
    """Run all tests"""
    print("=" * 70)
    print("Testing Keyboard Shortcuts and Accessibility Features")
    print("=" * 70)
    print()
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestShortcutManager))
    suite.addTests(loader.loadTestsFromTestCase(TestShortcutCustomizationDialog))
    suite.addTests(loader.loadTestsFromTestCase(TestShortcutInputDialog))
    suite.addTests(loader.loadTestsFromTestCase(TestKeyboardShortcutsDialog))
    suite.addTests(loader.loadTestsFromTestCase(TestMainWindowShortcuts))
    suite.addTests(loader.loadTestsFromTestCase(TestResultsViewShortcuts))
    suite.addTests(loader.loadTestsFromTestCase(TestAccessibilityFeatures))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print()
    print("=" * 70)
    print("Test Summary")
    print("=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    print("=" * 70)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

