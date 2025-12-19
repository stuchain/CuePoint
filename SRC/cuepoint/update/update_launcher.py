#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update Launcher Script

This script is launched separately to:
1. Show the installer window (visible installation)
2. Wait for installer to complete
3. Show a dialog asking if user wants to reopen the app
4. Launch the app if requested

This runs in a separate process so the main app can close before installation.
"""

import os
import platform
import subprocess
import sys
import time
from pathlib import Path

# Try to import Qt for dialog (if available)
try:
    from PySide6.QtWidgets import QApplication, QMessageBox
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False


def get_installed_app_path() -> Path:
    """Get the path to the installed application."""
    if platform.system() == 'Windows':
        # Windows: Check registry or default location
        import winreg
        try:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
            )
            install_path = winreg.QueryValueEx(key, "InstallLocation")[0]
            winreg.CloseKey(key)
            return Path(install_path) / "CuePoint.exe"
        except:
            # Fallback to default location
            return Path(os.path.expandvars(r"%LOCALAPPDATA%\CuePoint\CuePoint.exe"))
    elif platform.system() == 'Darwin':
        # macOS: Check /Applications
        return Path("/Applications/CuePoint.app")
    else:
        # Linux: Check common locations
        return Path.home() / ".local" / "bin" / "CuePoint"


def launch_installer(installer_path: Path) -> int:
    """Launch installer and wait for completion.
    
    Args:
        installer_path: Path to installer executable
        
    Returns:
        Exit code from installer (0 = success)
    """
    if platform.system() == 'Windows':
        # Windows: Run installer without /S (visible) but with /UPGRADE
        # Don't use /S so user can see the installation progress
        cmd = [
            str(installer_path),
            '/UPGRADE',  # Upgrade mode (skips some prompts)
        ]
        
        # Run installer and wait for completion
        process = subprocess.run(
            cmd,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        return process.returncode
    else:
        # macOS/Linux: Run installer normally
        process = subprocess.run([str(installer_path)])
        return process.returncode


def show_reopen_dialog() -> bool:
    """Show dialog asking if user wants to reopen the app.
    
    Returns:
        True if user wants to reopen, False otherwise
    """
    if not QT_AVAILABLE:
        # Fallback: Use console input
        print("\n" + "=" * 60)
        print("Update Installation Complete!")
        print("=" * 60)
        response = input("Do you want to reopen CuePoint? (y/n): ").strip().lower()
        return response in ('y', 'yes')
    
    # Create QApplication if needed
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    # Show dialog
    reply = QMessageBox.question(
        None,
        "Update Complete",
        "The update has been installed successfully.\n\n"
        "Do you want to reopen CuePoint now?",
        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        QMessageBox.StandardButton.Yes
    )
    
    return reply == QMessageBox.StandardButton.Yes


def launch_app(app_path: Path) -> bool:
    """Launch the application.
    
    Args:
        app_path: Path to application executable
        
    Returns:
        True if launch was successful, False otherwise
    """
    if not app_path.exists():
        print(f"Error: Application not found at {app_path}")
        if QT_AVAILABLE:
            QMessageBox.warning(
                None,
                "Launch Failed",
                f"Could not find CuePoint at:\n{app_path}\n\n"
                "Please launch it manually."
            )
        return False
    
    try:
        if platform.system() == 'Windows':
            # Windows: Launch exe
            subprocess.Popen(
                [str(app_path)],
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True
            )
        elif platform.system() == 'Darwin':
            # macOS: Use 'open' command
            subprocess.Popen(['open', str(app_path)])
        else:
            # Linux: Launch directly
            subprocess.Popen([str(app_path)])
        
        return True
    except Exception as e:
        print(f"Error launching app: {e}")
        if QT_AVAILABLE:
            QMessageBox.critical(
                None,
                "Launch Error",
                f"Failed to launch CuePoint:\n\n{str(e)}"
            )
        return False


def main():
    """Main entry point for update launcher."""
    if len(sys.argv) < 2:
        print("Usage: update_launcher.py <installer_path>")
        sys.exit(1)
    
    installer_path = Path(sys.argv[1])
    
    if not installer_path.exists():
        print(f"Error: Installer not found: {installer_path}")
        sys.exit(1)
    
    print("=" * 60)
    print("CuePoint Update Installer")
    print("=" * 60)
    print(f"Installer: {installer_path}")
    print("Starting installation...")
    print("=" * 60)
    
    # Launch installer and wait for completion
    exit_code = launch_installer(installer_path)
    
    if exit_code != 0:
        print(f"\nWarning: Installer exited with code {exit_code}")
        if QT_AVAILABLE:
            app = QApplication.instance() or QApplication(sys.argv)
            QMessageBox.warning(
                None,
                "Installation Warning",
                f"The installer completed with exit code {exit_code}.\n\n"
                "The installation may not have completed successfully."
            )
        sys.exit(exit_code)
    
    print("\n" + "=" * 60)
    print("Installation completed successfully!")
    print("=" * 60)
    
    # Ask if user wants to reopen
    if show_reopen_dialog():
        app_path = get_installed_app_path()
        print(f"\nLaunching CuePoint from: {app_path}")
        if launch_app(app_path):
            print("CuePoint launched successfully!")
        else:
            print("Failed to launch CuePoint. Please launch it manually.")
            if QT_AVAILABLE:
                app = QApplication.instance() or QApplication(sys.argv)
                QMessageBox.information(
                    None,
                    "Launch Failed",
                    "Please launch CuePoint manually from:\n" + str(app_path)
                )
    else:
        print("\nCuePoint will not be reopened. You can launch it manually when ready.")
    
    print("\nUpdate launcher exiting. You can close this window.")


if __name__ == '__main__':
    main()
