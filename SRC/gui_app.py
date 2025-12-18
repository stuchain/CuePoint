#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Application Entry Point

This is the main entry point for the CuePoint GUI application.
Run this file to launch the graphical user interface.
"""

import os
import sys

# If a project-local virtualenv exists, re-exec into it so `python3 gui_app.py`
# works without manual activation and uses a consistent, ship-ready runtime.
if __name__ == "__main__":
    try:
        if sys.prefix == sys.base_prefix:  # not already in a venv
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            venv_python = os.path.join(project_root, ".venv", "bin", "python")
            if os.path.exists(venv_python) and os.access(venv_python, os.X_OK):
                os.execv(venv_python, [venv_python] + sys.argv)
    except Exception:
        # Never block startup due to venv detection; fall back to current interpreter.
        pass

# Check for command-line flags before importing Qt
if "--test-search-dependencies" in sys.argv:
    # Run the test script directly without starting GUI
    import argparse
    import io
    import traceback

    # Parse arguments to handle the flag
    parser = argparse.ArgumentParser(description="CuePoint GUI Application")
    parser.add_argument("--test-search-dependencies", action="store_true",
                       help="Test search dependencies and exit")
    args, unknown = parser.parse_known_args()
    
    if args.test_search_dependencies:
        # Import and run the test script
        try:
            # Add scripts directory to path
            # Handle both development and packaged environments
            if getattr(sys, 'frozen', False):
                # Packaged app - scripts might be in the same directory or in a scripts subdirectory
                if hasattr(sys, '_MEIPASS'):
                    # PyInstaller temporary directory
                    base_path = sys._MEIPASS
                else:
                    base_path = os.path.dirname(sys.executable)
            else:
                # Development - use project root
                base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            
            scripts_path = os.path.join(base_path, "scripts")
            if scripts_path not in sys.path and os.path.exists(scripts_path):
                sys.path.insert(0, scripts_path)
            
            # Also try importing from the project root scripts directory
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            project_scripts = os.path.join(project_root, "scripts")
            if project_scripts not in sys.path and os.path.exists(project_scripts):
                sys.path.insert(0, project_scripts)
            
            # Capture output for GUI display if needed
            output_buffer = io.StringIO()
            
            # Redirect stdout to capture output
            old_stdout = sys.stdout
            sys.stdout = output_buffer
            
            try:
                # Import and run the test
                from test_search_dependencies import test_imports
                
                print("Testing search dependencies...")
                print(f"Python version: {sys.version}")
                print(f"Frozen (packaged): {getattr(sys, 'frozen', False)}")
                print(f"Executable: {sys.executable}")
                print("="*60 + "\n")
                
                success = test_imports()
                
                # Get the output
                output_text = output_buffer.getvalue()
                
                # Restore stdout
                sys.stdout = old_stdout
                
                # Print output
                # For frozen executables (console=False), always print to stderr
                # so it can be captured by subprocess.run() in tests
                if getattr(sys, 'frozen', False):
                    # In frozen mode, print to stderr so tests can capture it
                    print(output_text, file=sys.stderr)
                else:
                    # In development, print to stdout
                    print(output_text)
                
                sys.exit(0 if success else 1)
            finally:
                # Always restore stdout
                sys.stdout = old_stdout
                
        except ImportError as e:
            error_msg = f"Error: Could not import test script: {e}\nMake sure scripts/test_search_dependencies.py exists"
            print(error_msg, file=sys.stderr)
            traceback.print_exc()
            
            # Show error in message box if in packaged app
            if getattr(sys, 'frozen', False):
                try:
                    from PySide6.QtWidgets import QApplication, QMessageBox
                    app = QApplication(sys.argv)
                    QMessageBox.critical(None, "Test Error", error_msg)
                except:
                    pass
            
            sys.exit(1)
        except Exception as e:
            error_msg = f"Error running test: {e}"
            print(error_msg, file=sys.stderr)
            traceback.print_exc()
            
            # Show error in message box if in packaged app
            if getattr(sys, 'frozen', False):
                try:
                    from PySide6.QtWidgets import QApplication, QMessageBox
                    app = QApplication(sys.argv)
                    QMessageBox.critical(None, "Test Error", error_msg)
                except:
                    pass
            
            sys.exit(1)

# Import Qt widgets early (needed for icon function and main)
from PySide6.QtWidgets import QApplication, QMessageBox
from PySide6.QtGui import QIcon

# Add src to path if needed (for imports)
if __name__ == "__main__":
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.widgets.styles import get_stylesheet
from cuepoint.utils.i18n import I18nManager
from cuepoint.utils.logger import CuePointLogger
from cuepoint.utils.paths import AppPaths, PathMigration
from cuepoint.utils.system_check import SystemRequirements


def _set_application_icon(app) -> None:
    """Set the application icon for taskbar/dock.
    
    Args:
        app: QApplication instance
    """
    from pathlib import Path
    
    icon_path = None
    
    # Determine icon path based on platform and environment
    if getattr(sys, 'frozen', False):
        # Running as packaged app - PyInstaller embeds the icon in the executable
        # The icon is set via pyinstaller.spec, so we don't need to set it here
        # But we can try to load from assets as fallback
        if hasattr(sys, '_MEIPASS'):
            base_path = Path(sys._MEIPASS)
        else:
            import os
            base_path = Path(os.path.dirname(sys.executable))
        # Try platform-specific icons first
        if sys.platform == 'win32':
            # In packaged app, icon is embedded, but try assets as fallback
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
        elif sys.platform == 'darwin':
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
        else:
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
    else:
        # Running as script - try build directory first (for development)
        project_root = Path(__file__).resolve().parent.parent
        if sys.platform == 'win32':
            build_icon = project_root / 'build' / 'icon.ico'
            if build_icon.exists():
                icon_path = build_icon
        elif sys.platform == 'darwin':
            build_icon = project_root / 'build' / 'icon.icns'
            if build_icon.exists():
                icon_path = build_icon
        
        # Fallback to PNG logo if build icons don't exist
        if icon_path is None or not icon_path.exists():
            base_path = Path(__file__).resolve().parent / 'cuepoint' / 'ui'
            icon_path = base_path / 'assets' / 'icons' / 'logo.png'
    
    # Set icon if found
    if icon_path and icon_path.exists():
        try:
            icon = QIcon(str(icon_path))
            if not icon.isNull():
                app.setWindowIcon(icon)
        except Exception:
            # Icon loading failed, continue without icon
            pass


def main():
    """Main entry point for GUI application"""
    try:
        # Initialize application paths (Step 6.1)
        # Must be done before any file operations
        AppPaths.initialize_all()
        
        # Configure logging (Step 6.2)
        # Must be done early to capture all logs
        CuePointLogger.configure()
        
        # Install crash handler (Step 6.3)
        from cuepoint.utils.crash_handler import CrashHandler, ThreadExceptionHandler
        crash_handler = CrashHandler()
        ThreadExceptionHandler.install_thread_exception_handler()
        
        # Check for path migration (Step 6.1.4)
        if PathMigration.detect_migration_needed():
            # Perform migration silently (user can be notified if needed)
            success, error = PathMigration.migrate_paths()
            if not success:
                # Log error but don't block startup
                import logging
                logging.getLogger(__name__).warning(f"Path migration failed: {error}")
        
        # Bootstrap services (dependency injection setup)
        bootstrap_services()
        
        # Create QApplication (needed for message boxes)
        app = QApplication(sys.argv)
        # Set organization and application name BEFORE creating any QSettings
        # This ensures QSettings uses the correct location for all settings
        app.setOrganizationName("StuChain")
        app.setOrganizationDomain("stuchain.com")
        app.setApplicationName("CuePoint")
        # Get version from version.py (single source of truth)
        from cuepoint.version import get_version
        app.setApplicationVersion(get_version())
        
        # Set application icon (for taskbar/dock)
        _set_application_icon(app)

        # Step 9.3: localization readiness (English-only unless `.qm` files are present)
        I18nManager.setup_translations(app)
        
        # Check system requirements
        meets_requirements, errors = SystemRequirements.check_all()
        if not meets_requirements:
            error_message = (
                "Your system does not meet the minimum requirements:\n\n"
                + "\n".join(f"• {error}" for error in errors)
                + "\n\nPlease upgrade your system and try again."
            )
            
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Critical)
            msg.setWindowTitle("System Requirements Not Met")
            msg.setText(error_message)
            msg.exec()
            
            sys.exit(1)
        
        # Apply platform-specific styling
        app.setStyleSheet(get_stylesheet())
        
        # Create and show main window
        window = MainWindow()
        window.show()
        
        # Apply dark title bar on Windows (after window is shown)
        # Use QTimer to ensure window handle is fully initialized
        from cuepoint.utils.platform import apply_windows_dark_title_bar, is_windows
        if is_windows():
            from PySide6.QtCore import QTimer
            # Apply immediately
            apply_windows_dark_title_bar(window)
            # Also apply after a short delay to ensure it sticks
            QTimer.singleShot(100, lambda: apply_windows_dark_title_bar(window))
        
        # Run event loop
        sys.exit(app.exec())
        
    except Exception as e:
        # Handle startup errors gracefully
        error_msg = f"Failed to start CuePoint GUI:\n\n{str(e)}"
        
        # Try to show error in a message box
        # Always import here to avoid scoping issues
        try:
            # Import fresh to avoid any scoping issues
            from PySide6.QtWidgets import QApplication as QtApp, QMessageBox
            
            # Check if QApplication instance already exists
            existing_app = QtApp.instance()
            if existing_app:
                QMessageBox.critical(None, "Startup Error", error_msg)
            else:
                # Create a temporary QApplication for the error dialog
                temp_app = QtApp(sys.argv)
                QMessageBox.critical(None, "Startup Error", error_msg)
        except Exception as gui_error:
            # Fallback to console output if GUI error display fails
            print(error_msg, file=sys.stderr)
            print(f"Also failed to show GUI error dialog: {gui_error}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        
        sys.exit(1)


if __name__ == "__main__":
    main()
