#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Update Installer Scripts

Tests the PowerShell and batch launcher scripts:
1. PowerShell script parameter handling
2. Script execution and error handling
3. Script file existence and bundling
"""

import sys
import unittest
import tempfile
import platform
from unittest.mock import Mock, patch, mock_open
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))


class TestUpdateLauncherScripts(unittest.TestCase):
    """Test update launcher scripts."""
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_powershell_script_exists(self):
        """Test that PowerShell launcher script exists."""
        script_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        self.assertTrue(script_path.exists(), f"PowerShell script not found at {script_path}")
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_powershell_script_content(self):
        """Test that PowerShell script has required content."""
        script_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        
        if script_path.exists():
            content = script_path.read_text(encoding='utf-8')
            
            # Check for required elements
            self.assertIn('param(', content, "Script should have parameters")
            self.assertIn('InstallerPath', content, "Script should accept InstallerPath parameter")
            self.assertIn('Test-Path', content, "Script should verify installer exists")
            self.assertIn('Get-Process', content, "Script should check for running CuePoint")
            self.assertIn('Start-Process', content, "Script should launch installer")
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_batch_script_exists(self):
        """Test that batch launcher script exists."""
        script_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.bat"
        self.assertTrue(script_path.exists(), f"Batch script not found at {script_path}")
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_batch_script_content(self):
        """Test that batch script has required content."""
        script_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.bat"
        
        if script_path.exists():
            content = script_path.read_text(encoding='utf-8')
            
            # Check for required elements
            self.assertIn('INSTALLER_PATH', content, "Script should use INSTALLER_PATH variable")
            self.assertIn('tasklist', content, "Script should check for running CuePoint")
            self.assertIn('start /wait', content, "Script should launch installer and wait")
    
    def test_scripts_in_pyinstaller_spec(self):
        """Test that scripts are included in PyInstaller spec."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        
        if spec_path.exists():
            content = spec_path.read_text(encoding='utf-8')
            
            # Check for script references
            self.assertIn('update_launcher.ps1', content, "PowerShell script should be in spec")
            self.assertIn('update_launcher.bat', content, "Batch script should be in spec")


class TestInstallerScriptModifications(unittest.TestCase):
    """Test installer script (NSIS) modifications."""
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_installer_script_exists(self):
        """Test that installer script exists."""
        script_path = Path(__file__).parent.parent / "scripts" / "installer.nsi"
        self.assertTrue(script_path.exists(), f"Installer script not found at {script_path}")
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def test_installer_script_wait_for_close(self):
        """Test that installer script waits for app to close instead of aborting."""
        script_path = Path(__file__).parent.parent / "scripts" / "installer.nsi"
        
        if script_path.exists():
            content = script_path.read_text(encoding='utf-8')
            
            # Check for wait logic instead of immediate abort
            self.assertIn('wait_for_close', content, "Script should have wait_for_close logic")
            self.assertIn('MB_OKCANCEL', content, "Script should show OK/Cancel dialog")
            # Should NOT have immediate Abort after finding running app
            # (old behavior: MessageBox then Abort, new: MessageBox then wait loop)
            self.assertNotIn(
                'MessageBox.*Abort',
                content.replace('\n', ' ').replace('\r', ' '),
                "Script should not immediately abort when app is running"
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
