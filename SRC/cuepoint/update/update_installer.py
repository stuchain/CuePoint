#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update installer implementation.

Handles automatic installation of downloaded updates for Windows and macOS.
"""

import os
import platform
import subprocess
import sys
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
        
        Launches installer with silent/upgrade flags and closes current app.
        
        Args:
            installer_path: Path to .exe installer
            
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        try:
            # Windows installer flags:
            # /S = Silent installation
            # /UPGRADE = Upgrade mode (detects existing installation)
            # /D=path = Installation directory (optional, uses existing if upgrading)
            
            installer_cmd = [
                str(installer_path),
                '/S',  # Silent mode
                '/UPGRADE',  # Upgrade mode
            ]
            
            # Launch installer (this will close the current app)
            # Use CREATE_NEW_PROCESS_GROUP to detach from current process
            subprocess.Popen(
                installer_cmd,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True
            )
            
            # Give installer a moment to start
            import time
            time.sleep(1)
            
            # Close current application
            # The installer will handle the upgrade
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
