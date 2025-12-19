#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Interactive Test for Update Check Dialog

This script shows the actual update check dialog window so you can:
1. See the dialog appear
2. Click the download button
3. Verify the download process starts

Run this script to visually test the update dialog functionality.
"""

import sys
import os
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))

try:
    from PySide6.QtWidgets import QApplication, QMessageBox
    from PySide6.QtCore import QTimer
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("ERROR: PySide6 not available. Please install PySide6 to run this test.")
    sys.exit(1)

from cuepoint.update.update_ui import show_update_check_dialog
from cuepoint.version import get_version
from cuepoint.ui.main_window import MainWindow


def test_update_dialog():
    """Show the update check dialog with a mock update."""
    print("=" * 60)
    print("Interactive Update Dialog Test")
    print("=" * 60)
    print("\nThis will show the update check dialog window.")
    print("You should see:")
    print("  1. Dialog appears with current version")
    print("  2. Update information displayed")
    print("  3. Download & Install button visible")
    print("  4. Clicking the button should start download\n")
    
    # Create QApplication
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    # Create a main window (required as parent)
    window = MainWindow()
    window.show()
    
    # Create mock update info (matching actual appcast.xml)
    # Note: This should match what's in https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml
    update_info = {
        'short_version': '1.0.1-test17',
        'version': '1.0.1-test17',
        'download_url': 'https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test17/CuePoint-Setup-v1.0.1-test17.exe',
        'file_size': 95451610,  # ~95 MB (actual size from appcast)
        'release_notes': 'Test Release Notes\n\n- Fixed update detection\n- Improved download progress\n- Added context menu for links',
        'release_notes_url': 'https://github.com/stuchain/CuePoint/releases/tag/v1.0.1-test17',
    }
    
    print(f"Current version: {get_version()}")
    print(f"Update available: {update_info['short_version']}")
    print(f"Download URL: {update_info['download_url']}\n")
    
    # Show the dialog
    dialog = show_update_check_dialog(get_version(), window)
    dialog.show()
    
    # Store in window for download handler (CRITICAL: must be set before connecting button)
    window.update_check_dialog = dialog
    
    # Set update found (this will show the download button and stores update_info in dialog)
    dialog.set_update_found(update_info)
    
    # Ensure update_info is stored (set_update_found should do this, but ensure it's there)
    if not hasattr(dialog, 'update_info') or dialog.update_info is None:
        dialog.update_info = update_info
        print(f"Manually set dialog.update_info: {dialog.update_info}")
    
    # Also set update_manager for the window (needed by some methods)
    if not hasattr(window, 'update_manager'):
        from unittest.mock import Mock
        mock_manager = Mock()
        mock_manager._update_available = update_info  # Set fallback update_info
        window.update_manager = mock_manager
    
    # Connect the download button (simulating what main_window._on_update_available does)
    def on_download_clicked():
        print("\n" + "=" * 60)
        print("DOWNLOAD BUTTON CLICKED!")
        print("=" * 60)
        print("This should trigger the download process...")
        
        # Debug: Check all possible sources of update_info
        print(f"\nDebugging update_info sources:")
        print(f"  1. dialog.update_info: {getattr(dialog, 'update_info', 'NOT SET')}")
        print(f"  2. window.update_check_dialog: {getattr(window, 'update_check_dialog', 'NOT SET')}")
        if hasattr(window, 'update_check_dialog') and window.update_check_dialog:
            print(f"  3. window.update_check_dialog.update_info: {getattr(window.update_check_dialog, 'update_info', 'NOT SET')}")
        if hasattr(window, 'update_manager') and window.update_manager:
            print(f"  4. window.update_manager._update_available: {getattr(window.update_manager, '_update_available', 'NOT SET')}")
        
        # Ensure update_info is available before calling handler
        if not hasattr(window, 'update_check_dialog') or not window.update_check_dialog:
            print("ERROR: window.update_check_dialog is not set!")
            window.update_check_dialog = dialog
        
        if not hasattr(window.update_check_dialog, 'update_info') or window.update_check_dialog.update_info is None:
            print("WARNING: window.update_check_dialog.update_info is not set, setting it now...")
            window.update_check_dialog.update_info = update_info
        
        try:
            window._on_update_install_from_dialog()
        except Exception as e:
            print(f"ERROR in download handler: {e}")
            import traceback
            traceback.print_exc()
            QMessageBox.critical(
                window,
                "Download Error",
                f"Error starting download:\n\n{str(e)}\n\nCheck console for details."
            )
    
    # Disconnect any existing handlers first
    try:
        dialog.download_button.clicked.disconnect()
    except TypeError:
        pass  # No existing connections
    
    dialog.download_button.clicked.connect(on_download_clicked)
    dialog._download_connected = True
    
    print(f"Button connected: {dialog._download_connected}")
    print(f"Button visible: {dialog.download_button.isVisible()}")
    print(f"Button enabled: {dialog.download_button.isEnabled()}")
    
    # Verify setup
    print(f"\nSetup verification:")
    print(f"  - window.update_check_dialog set: {hasattr(window, 'update_check_dialog') and window.update_check_dialog is not None}")
    print(f"  - dialog.update_info set: {hasattr(dialog, 'update_info') and dialog.update_info is not None}")
    if hasattr(dialog, 'update_info') and dialog.update_info:
        print(f"  - update_info version: {dialog.update_info.get('short_version', 'N/A')}")
        print(f"  - update_info download_url: {dialog.update_info.get('download_url', 'N/A')}")
    
    print("\nDialog is now visible!")
    print("You can:")
    print("  - See the update information")
    print("  - Click 'Download & Install' button")
    print("  - Right-click links to copy them")
    print("  - Close the dialog when done\n")
    
    # Show a message box with instructions
    QMessageBox.information(
        window,
        "Test Running",
        "Update dialog is now visible.\n\n"
        "Click 'Download & Install' to test the download functionality.\n\n"
        "The download progress dialog should appear if everything works correctly."
    )
    
    # Run the application
    print("Application is running. Close the dialog or window to exit.\n")
    sys.exit(app.exec())


if __name__ == "__main__":
    if not QT_AVAILABLE:
        print("ERROR: PySide6 is required to run this test.")
        sys.exit(1)
    
    try:
        test_update_dialog()
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
