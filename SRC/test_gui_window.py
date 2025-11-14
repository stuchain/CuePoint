#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script to verify MainWindow displays correctly
"""

import sys
from PySide6.QtWidgets import QApplication
from gui.main_window import MainWindow

def main():
    """Test main window display"""
    try:
        app = QApplication(sys.argv)
        app.setApplicationName("CuePoint")
        app.setOrganizationName("CuePoint")
        
        print("Creating MainWindow...")
        window = MainWindow()
        
        print("Window created successfully!")
        print("Window title:", window.windowTitle())
        print("Window size:", window.size().width(), "x", window.size().height())
        print("Minimum size:", window.minimumSize().width(), "x", window.minimumSize().height())
        print("Menu bar exists:", window.menuBar() is not None)
        print("Status bar exists:", window.statusBar() is not None)
        print("Status bar message:", window.statusBar().currentMessage())
        
        # Check if sections exist
        print("\nChecking sections:")
        central = window.centralWidget()
        if central:
            layout = central.layout()
            if layout:
                print(f"  Central widget has {layout.count()} items")
                for i in range(layout.count()):
                    item = layout.itemAt(i)
                    if item and item.widget():
                        widget = item.widget()
                        if isinstance(widget, type(window.progress_group)):
                            print(f"    - {widget.title() if hasattr(widget, 'title') else 'Widget'}: visible={widget.isVisible()}")
        
        print("\n" + "="*60)
        print("Window should be visible now!")
        print("Please verify:")
        print("  1. Window displays with title 'CuePoint - Beatport Metadata Enricher'")
        print("  2. Menu bar is visible (File, Edit, View, Help)")
        print("  3. All sections are visible (File Selection, Playlist Selection, Settings, etc.)")
        print("  4. Status bar shows 'Ready'")
        print("  5. Window can be resized")
        print("  6. You can try dragging an XML file onto the window")
        print("="*60)
        print("\nClose the window to exit the test.")
        
        window.show()
        
        # Run the event loop
        sys.exit(app.exec())
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
