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
        
        Launches a PowerShell script that closes the app, then shows
        installer window, waits for completion, and offers to reopen app.
        
        Args:
            installer_path: Path to .exe installer
            
        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info(f"Starting Windows installation from: {installer_path}")
            logger.info(f"Installer exists: {installer_path.exists()}")
            logger.info(f"Frozen app: {getattr(sys, 'frozen', False)}")
            
            # Verify installer exists
            if not installer_path.exists():
                error_msg = f"Installer file not found: {installer_path}"
                logger.error(error_msg)
                return False, error_msg
            
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
            
            # Get path to PowerShell launcher script
            current_file = Path(__file__)
            launcher_ps1 = current_file.parent / 'update_launcher.ps1'
            
            # Check if we're in a frozen (packaged) app
            if getattr(sys, 'frozen', False):
                if hasattr(sys, '_MEIPASS'):
                    # PyInstaller temporary directory
                    base_path = Path(sys._MEIPASS)
                    bundled_launcher = base_path / 'update' / 'update_launcher.ps1'
                    if bundled_launcher.exists():
                        # Extract to temp directory so it can be executed
                        temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Update'
                        temp_dir.mkdir(exist_ok=True)
                        temp_launcher = temp_dir / 'update_launcher.ps1'
                        shutil.copy2(bundled_launcher, temp_launcher)
                        launcher_ps1 = temp_launcher
                    else:
                        launcher_ps1 = None
                else:
                    launcher_ps1 = Path(sys.executable).parent / 'update_launcher.ps1'
            
            # If launcher script exists, use it
            if launcher_ps1 and launcher_ps1.exists():
                logger.info(f"Using PowerShell launcher: {launcher_ps1}")
                logger.info(f"Launcher absolute path: {launcher_ps1.resolve()}")
                
                # Launch PowerShell script that will:
                # 1. Close this app
                # 2. Launch installer (visible, no /S)
                # 3. Wait for installer to complete
                # 4. Ask if user wants to reopen
                # 5. Launch app if yes
                launcher_cmd = [
                    'powershell.exe',
                    '-ExecutionPolicy', 'Bypass',  # Allow script execution
                    '-NoProfile',  # Don't load profile (faster)
                    '-File',
                    str(launcher_ps1.resolve()),  # Use absolute path
                    '-InstallerPath', str(installer_path.resolve()),  # Use absolute path
                    '-AppPath', str(app_path.resolve()) if app_path and app_path.exists() else '',
                ]
                
                logger.info(f"Launching PowerShell launcher: {' '.join(launcher_cmd)}")
                
                # Launch launcher (detached, so it continues after app closes)
                try:
                    process = subprocess.Popen(
                        launcher_cmd,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
                        close_fds=True,
                        cwd=str(launcher_ps1.parent)
                    )
                    logger.info(f"Launcher process started with PID: {process.pid}")
                    
                    # Verify process started
                    time.sleep(0.2)
                    if process.poll() is not None:
                        return_code = process.returncode
                        logger.warning(f"Launcher exited immediately with code {return_code}, falling back to direct installer launch")
                        launcher_ps1 = None  # Fall through to direct launch
                except Exception as launch_error:
                    error_msg = f"Failed to launch PowerShell script: {str(launch_error)}"
                    logger.error(error_msg, exc_info=True)
                    # Fall through to direct installer launch
                    launcher_ps1 = None
            
            # Fallback: Launch installer directly (visible, no /S)
            if not launcher_ps1 or not launcher_ps1.exists():
                logger.warning(f"Launcher script not found, launching installer directly")
                logger.info("Note: Installer will detect if app is running")
                logger.info(f"Installer path: {installer_path}")
                logger.info(f"Installer absolute path: {installer_path.resolve()}")
                logger.info(f"Installer exists: {installer_path.exists()}")
                
                # Launch installer directly using Windows 'start' command
                # This ensures the installer window appears properly
                # The installer will detect if app is running and show a message
                try:
                    # Use 'start' command to launch installer in a new window
                    # The installer will handle detecting if app is running
                    start_cmd = [
                        'cmd.exe',
                        '/c',
                        'start',
                        '""',  # Empty window title
                        str(installer_path.resolve())  # Use absolute path
                    ]
                    
                    logger.info(f"Launching installer with: {' '.join(start_cmd)}")
                    
                    process = subprocess.Popen(
                        start_cmd,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
                        close_fds=True
                    )
                    logger.info(f"Installer launch command executed, PID: {process.pid}")
                    
                    # Give it a moment to start
                    time.sleep(0.5)
                    
                except Exception as launch_error:
                    error_msg = f"Failed to launch installer: {str(launch_error)}"
                    logger.error(error_msg, exc_info=True)
                    return False, error_msg
            
            # Give launcher/installer a moment to start
            logger.info("Waiting 0.5 seconds before closing app...")
            time.sleep(0.5)
            
            # Close current application
            # The launcher will close this app, then launch the installer
            logger.info("Closing application - launcher/installer should proceed now")
            sys.exit(0)
            
            return True, None
            
        except Exception as e:
            error_msg = f"Installation failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return False, error_msg
    
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
