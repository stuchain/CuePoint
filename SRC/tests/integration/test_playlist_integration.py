#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script to verify PlaylistSelector integration in MainWindow
"""

import sys
import os

import pytest
from PySide6.QtWidgets import QApplication
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.main_window import MainWindow

def test_integration():
    """Test PlaylistSelector integration"""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    print("="*60)
    print("Testing PlaylistSelector Integration in MainWindow")
    print("="*60)
    
    try:
        # Create window
        window = MainWindow()
        print("\n1. MainWindow created")
        
        # Check PlaylistSelector exists
        assert hasattr(window, 'playlist_selector'), "PlaylistSelector not found in MainWindow"
        print("   [OK] PlaylistSelector integrated")
        
        # Check PlaylistSelector methods
        assert hasattr(window.playlist_selector, 'load_xml_file'), "load_xml_file method missing"
        assert hasattr(window.playlist_selector, 'get_selected_playlist'), "get_selected_playlist method missing"
        assert hasattr(window.playlist_selector, 'get_playlist_track_count'), "get_playlist_track_count method missing"
        assert hasattr(window.playlist_selector, 'clear'), "clear method missing"
        print("   [OK] All PlaylistSelector methods present")
        
        # Check signal exists
        assert hasattr(window.playlist_selector, 'playlist_selected'), "playlist_selected signal missing"
        print("   [OK] playlist_selected signal exists")
        
        # Check signal connection
        assert hasattr(window, 'on_playlist_selected'), "on_playlist_selected handler missing"
        print("   [OK] Signal handler exists")
        
        # Check that file selection triggers playlist loading
        assert hasattr(window, 'on_file_selected'), "on_file_selected handler missing"
        # Check that on_file_selected calls load_xml_file
        import inspect
        source = inspect.getsource(window.on_file_selected)
        assert 'load_xml_file' in source, "on_file_selected doesn't call load_xml_file"
        print("   [OK] File selection triggers playlist loading")
        
        print("\n" + "="*60)
        print("ALL INTEGRATION TESTS PASSED!")
        print("="*60)
        print("\nYou can now test the window:")
        print("  python SRC/test_gui_window.py")
        print("\nOr test PlaylistSelector standalone:")
        print("  python SRC/test_playlist_selector.py")
        print("\nTo test with real XML:")
        print("  1. Open the window")
        print("  2. Select or drag & drop collection.xml")
        print("  3. Playlist dropdown should populate")
        print("  4. Select a playlist to see track count")
        
    except AssertionError as e:
        pytest.fail(str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        pytest.fail(str(e))

if __name__ == "__main__":
    success = test_integration()
    sys.exit(0 if success else 1)

