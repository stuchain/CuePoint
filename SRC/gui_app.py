#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Application Entry Point

This is the main entry point for the CuePoint GUI application.
Run this file to launch the graphical user interface.
"""

import sys
import os
from PySide6.QtWidgets import QApplication, QMessageBox

# Add src to path if needed (for imports)
if __name__ == "__main__":
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

from cuepoint.ui.main_window import MainWindow
from cuepoint.services.bootstrap import bootstrap_services


def main():
    """Main entry point for GUI application"""
    try:
        # Bootstrap services (dependency injection setup)
        bootstrap_services()
        
        # Create QApplication
        app = QApplication(sys.argv)
        app.setApplicationName("CuePoint")
        app.setOrganizationName("CuePoint")
        app.setApplicationVersion("1.0.0")
        
        # Create and show main window
        window = MainWindow()
        window.show()
        
        # Run event loop
        sys.exit(app.exec())
        
    except Exception as e:
        # Handle startup errors gracefully
        error_msg = f"Failed to start CuePoint GUI:\n\n{str(e)}"
        
        # Try to show error in a message box if QApplication exists
        try:
            if 'app' in locals():
                QMessageBox.critical(None, "Startup Error", error_msg)
            else:
                # If QApplication doesn't exist, print to console
                print(error_msg, file=sys.stderr)
                import traceback
                traceback.print_exc()
        except:
            # Fallback to console output
            print(error_msg, file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        sys.exit(1)


if __name__ == "__main__":
    main()
