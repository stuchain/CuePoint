#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration Test for Keyboard Shortcuts

Tests shortcuts in a running GUI application with actual user interactions.
"""

import sys
import os
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QKeyEvent
from PySide6.QtTest import QTest

# Add SRC to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.ui.gui_interface import TrackResult


def test_shortcuts_in_gui():
    """Test shortcuts in actual GUI application"""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    print("=" * 70)
    print("Keyboard Shortcuts Integration Test")
    print("=" * 70)
    print()
    
    # Create main window
    window = MainWindow()
    window.show()
    
    print("[TEST] MainWindow created and shown")
    
    # Test 1: Verify shortcut manager exists
    assert window.shortcut_manager is not None, "ShortcutManager should exist"
    print("[OK] ShortcutManager exists in MainWindow")
    
    # Test 2: Verify shortcuts are registered
    manager = window.shortcut_manager
    shortcuts_to_check = [
        "open_file",
        "export_results",
        "quit",
        "help",
        "shortcuts",
        "fullscreen",
        "new_session",
        "start_processing",
        "restart_processing"
    ]
    
    for shortcut_id in shortcuts_to_check:
        shortcut = manager.get_shortcut(shortcut_id)
        assert shortcut is not None, f"Shortcut '{shortcut_id}' should be registered"
        print(f"[OK] Shortcut '{shortcut_id}' is registered")
    
    # Test 3: Test shortcut sequences
    print("\n[TEST] Checking shortcut sequences:")
    sequences = {
        "open_file": manager.get_shortcut_sequence("open_file"),
        "help": manager.get_shortcut_sequence("help"),
        "start_processing": manager.get_shortcut_sequence("start_processing"),
        "shortcuts": manager.get_shortcut_sequence("shortcuts"),
    }
    
    for action_id, sequence in sequences.items():
        print(f"  {action_id}: {sequence}")
    
    # Test 4: Test ResultsView shortcuts
    print("\n[TEST] Testing ResultsView shortcuts:")
    results_view = window.results_view
    assert results_view.shortcut_manager is not None, "ResultsView should have shortcut manager"
    print("[OK] ResultsView has shortcut manager")
    
    results_shortcuts = [
        "focus_search",
        "clear_filters",
        "select_all",
        "copy"
    ]
    
    for shortcut_id in results_shortcuts:
        shortcut = results_view.shortcut_manager.get_shortcut(shortcut_id)
        assert shortcut is not None, f"ResultsView shortcut '{shortcut_id}' should be registered"
        print(f"[OK] ResultsView shortcut '{shortcut_id}' is registered")
    
    # Test 5: Test accessibility features
    print("\n[TEST] Testing accessibility features:")
    
    # Check start button
    if hasattr(window, 'start_button'):
        tooltip = window.start_button.toolTip()
        assert tooltip is not None and len(tooltip) > 0, "Start button should have tooltip"
        print(f"[OK] Start button tooltip: {tooltip}")
        
        accessible_name = window.start_button.accessibleName()
        assert accessible_name is not None and len(accessible_name) > 0, "Start button should have accessible name"
        print(f"[OK] Start button accessible name: {accessible_name}")
        
        focus_policy = window.start_button.focusPolicy()
        assert focus_policy == Qt.StrongFocus, "Start button should have StrongFocus"
        print("[OK] Start button has proper focus policy")
    
    # Check results view accessibility
    if hasattr(results_view, 'search_box'):
        tooltip = results_view.search_box.toolTip()
        assert tooltip is not None and len(tooltip) > 0, "Search box should have tooltip"
        print(f"[OK] Search box tooltip: {tooltip}")
        
        accessible_name = results_view.search_box.accessibleName()
        assert accessible_name is not None and len(accessible_name) > 0, "Search box should have accessible name"
        print(f"[OK] Search box accessible name: {accessible_name}")
    
    # Test 6: Test shortcut dialog
    print("\n[TEST] Testing KeyboardShortcutsDialog:")
    from gui.dialogs import KeyboardShortcutsDialog
    dialog = KeyboardShortcutsDialog(manager, window)
    assert dialog is not None, "Dialog should be created"
    print("[OK] KeyboardShortcutsDialog created")
    
    if hasattr(dialog, 'tabs'):
        assert dialog.tabs.count() > 0, "Dialog should have tabs"
        print(f"[OK] Dialog has {dialog.tabs.count()} tabs")
    
    # Test 7: Test customization dialog
    print("\n[TEST] Testing ShortcutCustomizationDialog:")
    from gui.shortcut_customization_dialog import ShortcutCustomizationDialog
    custom_dialog = ShortcutCustomizationDialog(manager, window)
    assert custom_dialog is not None, "Customization dialog should be created"
    print("[OK] ShortcutCustomizationDialog created")
    
    custom_dialog.load_shortcuts()
    assert custom_dialog.table.rowCount() > 0, "Dialog should have shortcuts in table"
    print(f"[OK] Customization dialog has {custom_dialog.table.rowCount()} shortcuts")
    
    print("\n" + "=" * 70)
    print("All integration tests passed!")
    print("=" * 70)
    print("\nTo test shortcuts interactively:")
    print("1. The window is now visible")
    print("2. Try pressing shortcuts:")
    print("   - Ctrl+O: Open file")
    print("   - F1: Show help")
    print("   - Ctrl+?: Show shortcuts")
    print("   - F11: Toggle fullscreen")
    print("   - F5: Start processing (after loading file)")
    print("3. Close the window when done")
    print()
    
    # Keep window open for manual testing
    QTimer.singleShot(100, lambda: print("\nWindow will close in 5 seconds for automated test..."))
    QTimer.singleShot(5000, app.quit)
    
    return app.exec()


if __name__ == "__main__":
    success = test_shortcuts_in_gui()
    sys.exit(0 if success == 0 else 1)

