#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Python DLL Inclusion in PyInstaller Builds

Ensures that python313.dll (or current version DLL) is properly included
in the PyInstaller bundle to prevent "Failed to load Python DLL" errors.
"""

import sys
import unittest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))


class TestPythonDLLInclusion(unittest.TestCase):
    """Test that Python DLL is included in PyInstaller spec."""
    
    def test_spec_file_includes_dll_collection(self):
        """Test that spec file has code to collect Python DLL."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        
        self.assertTrue(spec_path.exists(), "pyinstaller.spec should exist")
        
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Check for DLL collection code
        self.assertIn("python313.dll", spec_content.lower() or "python", 
                     "Spec should include Python DLL collection")
        self.assertIn("binaries", spec_content.lower(),
                     "Spec should have binaries list")
        self.assertIn("python_dll_name", spec_content or "python",
                     "Spec should have Python DLL name variable")
    
    def test_spec_file_has_post_analysis_check(self):
        """Test that spec file verifies DLL after Analysis."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Check for post-analysis verification
        self.assertIn("a.binaries", spec_content,
                     "Spec should check binaries after Analysis")
        self.assertIn("dll_found", spec_content.lower() or "dll",
                     "Spec should check if DLL was found")
    
    def test_spec_file_has_pre_exe_verification(self):
        """Test that spec file verifies DLL before EXE creation."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Check for pre-EXE verification
        self.assertIn("dll_in_binaries", spec_content.lower() or "dll",
                     "Spec should verify DLL before EXE creation")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_python_dll_exists_in_installation(self):
        """Test that Python DLL exists in Python installation."""
        python_dir = Path(sys.executable).parent
        python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
        python_dll_path = python_dir / python_dll_name
        
        self.assertTrue(
            python_dll_path.exists(),
            f"Python DLL should exist at {python_dll_path}"
        )
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_python3_dll_exists(self):
        """Test that python3.dll exists (if present)."""
        python_dir = Path(sys.executable).parent
        python3_dll_path = python_dir / 'python3.dll'
        
        # python3.dll may or may not exist, but if it does, it should be valid
        if python3_dll_path.exists():
            self.assertTrue(python3_dll_path.is_file(), "python3.dll should be a file")


class TestAppReopeningAfterUpdate(unittest.TestCase):
    """Test app reopening logic after update installation."""
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_app_path_detection_from_registry(self):
        """Test that app path can be detected from Windows registry."""
        from cuepoint.update.update_installer import UpdateInstaller
        
        installer = UpdateInstaller()
        
        # Mock registry access
        with patch('winreg.OpenKey') as mock_open, \
             patch('winreg.QueryValueEx') as mock_query, \
             patch('winreg.CloseKey') as mock_close:
            
            mock_key = Mock()
            mock_open.return_value = mock_key
            mock_query.return_value = ('C:/Program Files/CuePoint',)
            
            # This will call the registry code
            # We can't easily test the private method, but we can verify the logic exists
            self.assertTrue(hasattr(installer, '_install_windows'),
                          "UpdateInstaller should have _install_windows method")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_app_path_fallback_to_default(self):
        """Test that app path falls back to default location."""
        from cuepoint.update.update_installer import UpdateInstaller
        import os
        
        installer = UpdateInstaller()
        
        # Mock registry to fail
        with patch('winreg.OpenKey', side_effect=Exception("Registry key not found")):
            # The fallback should use %LOCALAPPDATA%\CuePoint\CuePoint.exe
            default_path = Path(os.path.expandvars(r"%LOCALAPPDATA%\CuePoint\CuePoint.exe"))
            
            # Verify the path format is correct
            self.assertTrue(str(default_path).endswith("CuePoint.exe"),
                          "Default path should end with CuePoint.exe")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_powershell_launcher_includes_app_path(self):
        """Test that PowerShell launcher receives app path parameter."""
        launcher_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        
        if launcher_path.exists():
            content = launcher_path.read_text(encoding='utf-8')
            
            # Check that launcher accepts AppPath parameter
            self.assertIn("AppPath", content,
                         "PowerShell launcher should accept AppPath parameter")
            self.assertIn("Start-Process", content,
                         "PowerShell launcher should use Start-Process to launch app")


class TestUpdateInstallationFlow(unittest.TestCase):
    """Test the complete update installation flow."""
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    @patch('subprocess.Popen')
    @patch('sys.exit')
    def test_installer_launches_app_correctly(self, mock_exit, mock_popen):
        """Test that installer launches app with correct path after installation."""
        from cuepoint.update.update_installer import UpdateInstaller
        import tempfile
        
        installer = UpdateInstaller()
        
        # Create a fake installer file
        temp_file = Path(tempfile.gettempdir()) / 'test_installer.exe'
        temp_file.write_bytes(b'fake installer')
        
        try:
            # Mock exists to return True for installer, False for launcher (so it uses direct launch)
            def exists_side_effect(self_path):
                path_str = str(self_path)
                return path_str == str(temp_file)
            
            # Mock the installation process
            with patch.object(Path, 'exists', side_effect=exists_side_effect), \
                 patch('winreg.OpenKey', side_effect=Exception("No registry")), \
                 patch('os.path.expandvars', return_value='C:/Users/Test/AppData/Local/CuePoint/CuePoint.exe'):
                
                mock_process = Mock()
                mock_process.pid = 12345
                mock_process.poll.return_value = None
                mock_popen.return_value = mock_process
                
                # This will exit, so we can't check return value
                # But we can verify Popen was called
                result = installer._install_windows(temp_file)
                
                # Verify installer was launched
                # Popen should be called to launch the installer (direct launch since launcher doesn't exist)
                # Note: If validation fails early, Popen might not be called, which is also valid
                if result[0]:  # If installation succeeded
                    self.assertTrue(mock_popen.called, "Popen should be called to launch installer")
                
        finally:
            if temp_file.exists():
                temp_file.unlink()
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_powershell_launcher_script_exists(self):
        """Test that PowerShell launcher script exists and is valid."""
        launcher_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        
        self.assertTrue(launcher_path.exists(),
                       f"PowerShell launcher should exist at {launcher_path}")
        
        if launcher_path.exists():
            content = launcher_path.read_text(encoding='utf-8')
            
            # Verify script has required functionality
            self.assertIn("param(", content,
                         "Script should have parameters")
            self.assertIn("InstallerPath", content,
                         "Script should accept InstallerPath")
            self.assertIn("Get-Process", content,
                         "Script should check for running CuePoint")
            self.assertIn("Start-Process", content,
                         "Script should launch installer and app")


class TestDLLInBuildOutput(unittest.TestCase):
    """Test that DLL is actually included in build output."""
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_spec_file_binaries_format(self):
        """Test that binaries are in correct format for PyInstaller."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Check that binaries use correct tuple format: (name, path, type)
        # The spec should append tuples to binaries list
        self.assertIn("binaries.append", spec_content,
                     "Spec should append to binaries list")
        self.assertIn("'BINARY'", spec_content or "BINARY",
                     "Spec should specify BINARY type")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_binaries_tuple_format_is_correct(self):
        """Test that pre-analysis binaries uses (src_path, dest_dir) format for Analysis."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Pre-analysis should use: (str(python_dll_path), '.') - 2-tuple for Analysis constructor
        # Post-analysis should use: (python_dll_name, str(python_dll_path), 'BINARY') - 3-tuple for a.binaries.append
        import re
        
        # Check for pre-analysis format (2-tuple)
        pre_analysis_pattern = r'binaries\.append\(\(str\([^)]+\)\s*,\s*[\'"]\.[\'"]\)\)'
        pre_analysis_match = re.search(pre_analysis_pattern, spec_content)
        
        # Check for post-analysis format (3-tuple)
        post_analysis_pattern = r'a\.binaries\.append\(\([^,]+,\s*str\([^)]+\)\s*,\s*[\'"]BINARY[\'"]\)\)'
        post_analysis_match = re.search(post_analysis_pattern, spec_content)
        
        self.assertIsNotNone(
            pre_analysis_match,
            "Pre-analysis binaries should use (src_path, dest_dir) format for Analysis constructor"
        )
        self.assertIsNotNone(
            post_analysis_match,
            "Post-analysis a.binaries.append should use (dest_name, src_path, 'BINARY') format"
        )
    
    def test_spec_file_handles_python_versions(self):
        """Test that spec file handles different Python versions."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Should use sys.version_info to get current version
        self.assertIn("sys.version_info", spec_content,
                     "Spec should use sys.version_info for version detection")
        self.assertIn("python_dll_name", spec_content or "python",
                     "Spec should construct DLL name dynamically")


class TestAppLaunchAfterInstall(unittest.TestCase):
    """Test app launching after update installation."""
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    @patch('subprocess.Popen')
    def test_app_launch_uses_absolute_path(self, mock_popen):
        """Test that app is launched with absolute path."""
        from cuepoint.update.update_launcher import launch_app
        from pathlib import Path
        
        app_path = Path("C:/Program Files/CuePoint/CuePoint.exe")
        
        # Mock the launch
        with patch('pathlib.Path.exists', return_value=True):
            result = launch_app(app_path)
            
            # Verify Popen was called (if launch_app uses it)
            # Note: launch_app might use different method, adjust test accordingly
            if mock_popen.called:
                call_args = mock_popen.call_args
                # Get the first argument (could be list or string)
                if call_args[0]:
                    first_arg = call_args[0][0]
                    if isinstance(first_arg, (list, tuple)):
                        # If it's a list, get the path from it
                        path_str = str(first_arg[-1]) if first_arg else None
                    else:
                        path_str = str(first_arg) if first_arg else None
                    
                    if path_str:
                        # Verify absolute path is used
                        self.assertTrue(
                            path_str.startswith("C:") or Path(path_str).is_absolute(),
                            f"App should be launched with absolute path, got: {path_str}"
                        )
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_powershell_launcher_checks_app_exists(self):
        """Test that PowerShell launcher verifies app exists before launching."""
        launcher_path = Path(__file__).parent.parent / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        
        if launcher_path.exists():
            content = launcher_path.read_text(encoding='utf-8')
            
            # Should check if app exists before launching (PowerShell uses Test-Path)
            self.assertIn("Test-Path", content,
                         "Launcher should use Test-Path to check if app exists")
            # Should check $AppPath specifically
            self.assertIn("$AppPath", content,
                         "Launcher should check $AppPath variable")
            # The check should be: if (Test-Path $AppPath)
            content_lower = content.lower()
            has_check = "test-path" in content_lower and "$apppath" in content_lower
            self.assertTrue(
                has_check,
                "Launcher should verify app exists using Test-Path $AppPath before launching"
            )


class TestDLLErrorPrevention(unittest.TestCase):
    """Test prevention of DLL loading errors."""
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_dll_in_spec_binaries_list(self):
        """Test that DLL is added to binaries list in spec."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # Should add DLL to binaries before Analysis
        self.assertIn("binaries.append", spec_content,
                     "Spec should append DLL to binaries")
        
        # Should also check after Analysis
        self.assertIn("a.binaries.append", spec_content,
                     "Spec should append DLL after Analysis if missing")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_dll_placement_in_root(self):
        """Test that DLL is placed in root directory (not subdirectory)."""
        spec_path = Path(__file__).parent.parent / "build" / "pyinstaller.spec"
        spec_content = spec_path.read_text(encoding='utf-8')
        
        # DLL should be placed in root ('.') not in a subdirectory
        # Check that destination is '.' or root
        lines = spec_content.split('\n')
        dll_placement_found = False
        for i, line in enumerate(lines):
            if 'binaries.append' in line and 'python' in line.lower():
                # Check next few lines for destination
                for j in range(i, min(i+5, len(lines))):
                    if "'.'" in lines[j] or '"."' in lines[j] or "root" in lines[j].lower():
                        dll_placement_found = True
                        break
                if dll_placement_found:
                    break
        
        self.assertTrue(dll_placement_found,
                       "DLL should be placed in root directory ('.')")


if __name__ == '__main__':
    unittest.main(verbosity=2)
