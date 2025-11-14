#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script to verify FileSelector integration in MainWindow
"""

import sys
import os
from PySide6.QtWidgets import QApplication
from gui.main_window import MainWindow

def test_integration():
    """Test FileSelector integration"""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    print("="*60)
    print("Testing FileSelector Integration in MainWindow")
    print("="*60)
    
    try:
        # Create window
        window = MainWindow()
        print("\n1. MainWindow created")
        
        # Check FileSelector exists
        assert hasattr(window, 'file_selector'), "FileSelector not found in MainWindow"
        print("   [OK] FileSelector integrated")
        
        # Check FileSelector methods
        assert hasattr(window.file_selector, 'browse_file'), "browse_file method missing"
        assert hasattr(window.file_selector, 'validate_file'), "validate_file method missing"
        assert hasattr(window.file_selector, 'get_file_path'), "get_file_path method missing"
        assert hasattr(window.file_selector, 'set_file'), "set_file method missing"
        print("   [OK] All FileSelector methods present")
        
        # Check signal exists
        assert hasattr(window.file_selector, 'file_selected'), "file_selected signal missing"
        print("   [OK] file_selected signal exists")
        
        # Check signal connection
        assert hasattr(window, 'on_file_selected'), "on_file_selected handler missing"
        print("   [OK] Signal handler exists")
        
        # Test validation
        test_path = "test.xml"
        result = window.file_selector.validate_file(test_path)
        print(f"   [OK] validate_file works (test.xml exists: {os.path.exists(test_path)})")
        
        print("\n" + "="*60)
        print("ALL INTEGRATION TESTS PASSED!")
        print("="*60)
        print("\nYou can now test the window:")
        print("  python SRC/test_gui_window.py")
        print("\nOr test FileSelector standalone:")
        print("  python SRC/test_file_selector.py")
        
        return True
        
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        return False
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_integration()
    sys.exit(0 if success else 1)

