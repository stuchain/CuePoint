#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update installer implementation.

Handles automatic installation of downloaded updates for Windows and macOS.
"""

import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional


class UpdateInstaller:
    """
    Handles automatic installation of updates.
    
    Platform-specific installation logic for Windows and macOS.
    """
    
    def __init__(self):
        """Initialize installer."""
        self.platform = platform.system().lower()
    
    def install(self, installer_path: str) -> tuple[bool, Optional[str]]:
        """
        Install update from downloaded file.
        
        Args:
            installer_path: Path to installer/DMG file
            
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        installer_path = Path(installer_path)
        
        if not installer_path.exists():
            return False, f"Installer file not found: {installer_path}"
        
        if self.platform == 'windows':
            return self._install_windows(installer_path)
        elif self.platform == 'darwin':
            return self._install_macos(installer_path)
        else:
            return False, f"Unsupported platform: {self.platform}"
    
    def _install_windows(self, installer_path: Path) -> tuple[bool, Optional[str]]:
        """
        Install Windows update.
        
        Launches a batch script that waits for app to close, then shows
        installer window, waits for completion, and offers to reopen app.
        
        Args:
            installer_path: Path to .exe installer
            
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        try:
            # Get path to update launcher batch script
            current_file = Path(__file__)
            launcher_bat = current_file.parent / 'update_launcher.bat'
            
            # Get installed app path for reopening
            app_path = None
            try:
                import winreg
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
                )
                install_location = winreg.QueryValueEx(key, "InstallLocation")[0]
                winreg.CloseKey(key)
                app_path = Path(install_location) / "CuePoint.exe"
            except Exception:
                # Fallback to default location
                app_path = Path(os.path.expandvars(r"%LOCALAPPDATA%\CuePoint\CuePoint.exe"))
            
            # Check if we're in a frozen (packaged) app
            if getattr(sys, 'frozen', False):
                # In packaged app, launcher might be in the bundle
                if hasattr(sys, '_MEIPASS'):
                    # PyInstaller temporary directory
                    base_path = Path(sys._MEIPASS)
                    # Try to find launcher in update subdirectory (where we bundle it)
                    bundled_launcher = base_path / 'update' / 'update_launcher.bat'
                    if bundled_launcher.exists():
                        # Extract to temp directory so it can be executed
                        temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Update'
                        temp_dir.mkdir(exist_ok=True)
                        temp_launcher = temp_dir / 'update_launcher.bat'
                        # Copy batch file to temp location
                        shutil.copy2(bundled_launcher, temp_launcher)
                        launcher_bat = temp_launcher
                    else:
                        # Try other locations
                        launcher_bat = base_path / 'update_launcher.bat'
                        if not launcher_bat.exists():
                            launcher_bat = None
                else:
                    # Not in _MEIPASS, try executable directory
                    launcher_bat = Path(sys.executable).parent / 'update_launcher.bat'
            
            # If launcher script exists, use it
            if launcher_bat and launcher_bat.exists():
                # Launch the batch script that will:
                # 1. Wait for this app to close
                # 2. Launch installer (visible, no /S)
                # 3. Wait for installer to complete
                # 4. Ask if user wants to reopen
                # 5. Launch app if yes
                launcher_cmd = [
                    'cmd.exe',
                    '/c',
                    str(launcher_bat),
                    str(installer_path),
                    str(app_path) if app_path else '',
                ]
                
                # Launch launcher (detached, so it continues after app closes)
                subprocess.Popen(
                    launcher_cmd,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
                    close_fds=True,
                    cwd=str(launcher_bat.parent)
                )
                
                # Give launcher a moment to start
                time.sleep(0.3)
                
                # Close current application
                # The launcher will wait for this process to close, then launch installer
                sys.exit(0)
                return True, None
            else:
                # Fallback: Launch installer directly (visible, no /S)
                # This shows the installer window but won't wait or show reopen dialog
                installer_cmd = [
                    str(installer_path),
                    '/UPGRADE',  # Upgrade mode (no /S = visible installer window)
                ]
                
                subprocess.Popen(
                    installer_cmd,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                    close_fds=True
                )
                
                # Give installer a moment to start
                time.sleep(1)
                sys.exit(0)
                return True, None
            
        except Exception as e:
            return False, f"Installation failed: {str(e)}"
    
    def _install_macos(self, dmg_path: Path) -> tuple[bool, Optional[str]]:
        """
        Install macOS update.
        
        Mounts DMG, copies app bundle, unmounts DMG, and launches new version.
        
        Args:
            dmg_path: Path to .dmg file
            
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        try:
            import shutil
            import tempfile
            
            # Mount DMG
            mount_point = Path(tempfile.mkdtemp(prefix='CuePoint_Update_'))
            mount_cmd = ['hdiutil', 'attach', str(dmg_path), '-mountpoint', str(mount_point), '-nobrowse', '-quiet']
            
            result = subprocess.run(mount_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return False, f"Failed to mount DMG: {result.stderr}"
            
            try:
                # Find app bundle in DMG
                app_bundle = None
                for item in mount_point.iterdir():
                    if item.suffix == '.app' and 'CuePoint' in item.name:
                        app_bundle = item
                        break
                
                if not app_bundle:
                    return False, "App bundle not found in DMG"
                
                # Copy app bundle to Applications
                applications_dir = Path('/Applications')
                target_app = applications_dir / app_bundle.name
                
                # Remove existing app if present
                if target_app.exists():
                    shutil.rmtree(target_app)
                
                # Copy new app
                shutil.copytree(app_bundle, target_app)
                
                # Launch new app
                launch_cmd = ['open', str(target_app)]
                subprocess.Popen(launch_cmd)
                
                # Close current application
                sys.exit(0)
                
                return True, None
                
            finally:
                # Unmount DMG
                unmount_cmd = ['hdiutil', 'detach', str(mount_point), '-quiet']
                subprocess.run(unmount_cmd, capture_output=True)
                
                # Clean up mount point
                try:
                    mount_point.rmdir()
                except:
                    pass
            
        except Exception as e:
            return False, f"Installation failed: {str(e)}"
    
    def can_install(self) -> bool:
        """
        Check if automatic installation is supported on this platform.
        
        Returns:
            True if automatic installation is supported
        """
        if self.platform == 'windows':
            # Windows: Can install if we can launch executables
            return True
        elif self.platform == 'darwin':
            # macOS: Can install if hdiutil is available
            try:
                subprocess.run(['hdiutil', '-version'], capture_output=True, check=True)
                return True
            except:
                return False
        else:
            return False
