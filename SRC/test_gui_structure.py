#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Non-interactive test to verify MainWindow structure
"""

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt
from gui.main_window import MainWindow

def test_main_window_structure():
    """Test MainWindow structure without showing window"""
    print("="*60)
    print("Testing MainWindow Structure")
    print("="*60)
    
    # Create QApplication (required for Qt widgets)
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    try:
        # Create window
        print("\n1. Creating MainWindow...")
        window = MainWindow()
        print("   [OK] MainWindow created")
        
        # Test window properties
        print("\n2. Testing window properties...")
        assert window.windowTitle() == "CuePoint - Beatport Metadata Enricher", "Window title incorrect"
        print("   [OK] Window title correct")
        
        assert window.minimumSize().width() == 800, "Minimum width incorrect"
        assert window.minimumSize().height() == 600, "Minimum height incorrect"
        print("   [OK] Minimum size correct (800x600)")
        
        # Test menu bar
        print("\n3. Testing menu bar...")
        menubar = window.menuBar()
        assert menubar is not None, "Menu bar missing"
        menus = [menubar.actions()[i].text() for i in range(menubar.actions().__len__())]
        expected_menus = ["&File", "&Edit", "&View", "&Help"]
        for menu in expected_menus:
            assert any(menu in m for m in menus), f"Menu '{menu}' not found"
        print("   [OK] Menu bar exists with all menus")
        
        # Test status bar
        print("\n4. Testing status bar...")
        statusbar = window.statusBar()
        assert statusbar is not None, "Status bar missing"
        assert statusbar.currentMessage() == "Ready", "Status bar message incorrect"
        print("   [OK] Status bar exists and shows 'Ready'")
        
        # Test central widget
        print("\n5. Testing central widget...")
        central = window.centralWidget()
        assert central is not None, "Central widget missing"
        layout = central.layout()
        assert layout is not None, "Central widget has no layout"
        print(f"   [OK] Central widget has layout with {layout.count()} items")
        
        # Test sections
        print("\n6. Testing sections...")
        sections_found = []
        for i in range(layout.count()):
            item = layout.itemAt(i)
            if item and item.widget():
                widget = item.widget()
                if hasattr(widget, 'title'):
                    sections_found.append(widget.title())
        
        expected_sections = ["File Selection", "Playlist Selection", "Settings"]
        for section in expected_sections:
            assert any(section in s for s in sections_found), f"Section '{section}' not found"
        print(f"   [OK] Found sections: {sections_found}")
        
        # Test progress and results groups
        print("\n7. Testing progress and results sections...")
        assert hasattr(window, 'progress_group'), "Progress group missing"
        assert hasattr(window, 'results_group'), "Results group missing"
        assert not window.progress_group.isVisible(), "Progress group should be hidden initially"
        assert not window.results_group.isVisible(), "Results group should be hidden initially"
        print("   [OK] Progress and results groups exist and are hidden")
        
        # Test drag & drop
        print("\n8. Testing drag & drop...")
        assert window.acceptDrops(), "Drag & drop not enabled"
        print("   [OK] Drag & drop is enabled")
        
        print("\n" + "="*60)
        print("ALL TESTS PASSED!")
        print("="*60)
        print("\nThe MainWindow structure is correct.")
        print("You can now run 'python SRC/test_gui_window.py' to see the window.")
        
        return True
        
    except AssertionError as e:
        print(f"\n[FAIL] Assertion failed: {e}")
        return False
    except Exception as e:
        print(f"\n[ERROR] Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_main_window_structure()
    sys.exit(0 if success else 1)

