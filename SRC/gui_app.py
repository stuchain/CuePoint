#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Application Entry Point

This is the main entry point for the CuePoint GUI application.
Run this file to launch the graphical user interface.
"""

import os
import sys

from PySide6.QtWidgets import QApplication, QMessageBox

# Add src to path if needed (for imports)
if __name__ == "__main__":
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.ui.migration.feature_flags import FeatureFlags
from cuepoint.ui.migration.migration_manager import MigrationManager
from cuepoint.ui.migration.migration_wizard import MigrationWizard


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
        
        # Check feature flags to determine which UI to use
        feature_flags = FeatureFlags()
        migration_manager = MigrationManager()
        
        # Determine which UI to use
        use_new_ui = feature_flags.should_use_new_ui()
        
        if use_new_ui:
            # Use new simplified UI
            from cuepoint.ui.main_window_simple import SimpleMainWindow
            
            window = SimpleMainWindow()
            
            # Check if migration is needed and show wizard
            if migration_manager.check_migration_needed():
                wizard = MigrationWizard(window)
                wizard.exec()
                # Note: Wizard handles migration, user can continue or skip
            
        else:
            # Use old UI
            from cuepoint.ui.main_window import MainWindow
            
            window = MainWindow()
            
            # Mark that old UI was used (for migration detection)
            from cuepoint.services.interfaces import IConfigService
            from cuepoint.utils.di_container import get_container
            
            config_service = get_container().resolve(IConfigService)
            config_service.set("ui.old_ui.used", True)
            config_service.save()
        
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
    main()
