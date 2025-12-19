#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Test Suite for Update Installer

Tests all aspects of the update installation system:
1. Path validation and error handling
2. PowerShell launcher script execution
3. Direct installer launch (fallback)
4. Windows-specific installation flow
5. macOS-specific installation flow
6. Error cases (empty paths, missing files, etc.)
7. Complete integration flow with mocks
"""

import sys
import os
import unittest
import tempfile
import platform
from unittest.mock import Mock, patch, MagicMock, call, mock_open
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / "SRC"))

from cuepoint.update.update_installer import UpdateInstaller


class TestUpdateInstallerPathValidation(unittest.TestCase):
    """Test path validation and error handling."""
    
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
    
    def test_install_with_nonexistent_file(self):
        """Test that installer returns error for nonexistent file."""
        result = self.installer.install("/nonexistent/path/installer.exe")
        self.assertFalse(result[0])
        self.assertIn("not found", result[1].lower())
    
    def test_install_with_empty_path(self):
        """Test that installer handles empty path."""
        result = self.installer.install("")
        self.assertFalse(result[0])
        self.assertIsNotNone(result[1])
    
    def test_install_with_none_path(self):
        """Test that installer handles None path."""
        result = self.installer.install(None)
        self.assertFalse(result[0])
        self.assertIsNotNone(result[1])
        self.assertIn("empty", result[1].lower() or "none")


class TestUpdateInstallerWindows(unittest.TestCase):
    """Test Windows-specific installation."""
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        # Create a temporary installer file for testing
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    @patch('time.sleep')
    def test_windows_install_with_powershell_launcher(self, mock_sleep, mock_exit, mock_popen):
        """Test Windows installation using PowerShell launcher."""
        import sys
        
        # Mock the launcher script existing
        with patch('pathlib.Path.exists') as mock_exists, \
             patch('pathlib.Path.resolve') as mock_resolve, \
             patch('pathlib.Path.parent') as mock_parent:
            
            # Setup path mocks
            mock_exists.return_value = True
            mock_resolve.return_value = Path('C:/test/launcher.ps1')
            mock_parent.return_value = Path('C:/test')
            
            # Mock subprocess.Popen to return a process that doesn't exit immediately
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None  # Process still running
            mock_popen.return_value = mock_process
            
            # Mock sys._MEIPASS for frozen app
            # Use getattr with default since 'frozen' may not exist
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Should succeed (will exit, so we can't check return value)
                # But we can verify Popen was called
                mock_popen.assert_called()
                # Verify PowerShell command was constructed
                call_args = mock_popen.call_args[0][0]
                self.assertIn('powershell.exe', call_args)
                self.assertIn('-File', call_args)
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    @patch('time.sleep')
    def test_windows_install_direct_fallback(self, mock_sleep, mock_exit, mock_popen):
        """Test Windows installation with direct installer launch (fallback)."""
        import sys
        
        # Mock launcher script not existing
        with patch('pathlib.Path.exists') as mock_exists:
            mock_exists.return_value = False
            
            # Mock subprocess.Popen
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None  # Process still running
            mock_popen.return_value = mock_process
            
            # Mock sys._MEIPASS for frozen app
            # Use getattr with default since 'frozen' may not exist
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Verify Popen was called with installer path
                mock_popen.assert_called()
                # Should use shell=True for direct launch
                call_kwargs = mock_popen.call_args[1]
                self.assertTrue(call_kwargs.get('shell', False))
    
    @patch('subprocess.Popen')
    def test_windows_install_empty_path_handling(self, mock_popen):
        """Test that empty installer path is handled correctly."""
        import sys
        
        # Create a Path object that doesn't exist
        empty_path = Path("C:/nonexistent/installer.exe")
        
        result = self.installer._install_windows(empty_path)
        
        # Should return error
        self.assertFalse(result[0])
        self.assertIn("not found", result[1].lower())
        # Popen should not be called
        mock_popen.assert_not_called()
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    def test_windows_install_process_exits_immediately(self, mock_exit, mock_popen):
        """Test handling when installer process exits immediately."""
        import sys
        
        # Mock process that exits immediately
        mock_process = Mock()
        mock_process.pid = 12345
        mock_process.poll.return_value = 1  # Process exited with error
        mock_process.returncode = 1
        mock_popen.return_value = mock_process
        
        with patch('pathlib.Path.exists') as mock_exists:
            mock_exists.return_value = False  # No launcher, use direct launch
            
            result = self.installer._install_windows(self.test_installer)
            
            # Should detect process exit and return error
            self.assertFalse(result[0])
            self.assertIn("exited", result[1].lower())


class TestUpdateInstallerMacOS(unittest.TestCase):
    """Test macOS-specific installation."""
    
    @unittest.skipIf(platform.system() != 'Darwin', "macOS-only test")
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        # Create a temporary DMG file for testing
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_dmg = self.temp_dir / 'test_installer.dmg'
        self.test_dmg.write_bytes(b'fake dmg content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_dmg.exists():
            self.test_dmg.unlink()
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    def test_macos_install_dmg(self, mock_exit, mock_popen):
        """Test macOS installation with DMG."""
        import sys
        
        # Mock subprocess.Popen
        mock_process = Mock()
        mock_process.pid = 12345
        mock_popen.return_value = mock_process
        
        result = self.installer._install_macos(self.test_dmg)
        
        # Should call Popen to mount DMG
        mock_popen.assert_called()
        # Should exit after launching
        mock_exit.assert_called_once_with(0)


class TestUpdateInstallerIntegration(unittest.TestCase):
    """Test complete integration flow with mocks."""
    
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        # Create a temporary installer file
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('cuepoint.update.update_installer.UpdateInstaller._install_windows')
    def test_install_calls_platform_specific_method(self, mock_windows_install):
        """Test that install() calls the correct platform-specific method."""
        if platform.system() == 'Windows':
            mock_windows_install.return_value = (True, None)
            result = self.installer.install(str(self.test_installer))
            mock_windows_install.assert_called_once()
            self.assertTrue(result[0])
    
    @patch('cuepoint.update.update_installer.UpdateInstaller._install_macos')
    def test_install_calls_macos_method(self, mock_macos_install):
        """Test that install() calls macOS method on macOS."""
        if platform.system() == 'Darwin':
            mock_macos_install.return_value = (True, None)
            test_dmg = self.temp_dir / 'test_installer.dmg'
            test_dmg.write_bytes(b'fake dmg')
            result = self.installer.install(str(test_dmg))
            mock_macos_install.assert_called_once()
            self.assertTrue(result[0])
            test_dmg.unlink()
    
    def test_install_converts_string_to_path(self):
        """Test that install() converts string path to Path object."""
        with patch.object(self.installer, '_install_windows' if platform.system() == 'Windows' else '_install_macos') as mock_install:
            mock_install.return_value = (True, None)
            result = self.installer.install(str(self.test_installer))
            # Verify Path object was passed to platform method
            call_args = mock_install.call_args[0][0]
            self.assertIsInstance(call_args, Path)


class TestUpdateInstallerErrorHandling(unittest.TestCase):
    """Test error handling in various scenarios."""
    
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
    
    @patch('subprocess.Popen')
    def test_popen_exception_handling(self, mock_popen):
        """Test that Popen exceptions are caught and returned as errors."""
        import sys
        
        if platform.system() == 'Windows':
            # Make Popen raise an exception
            mock_popen.side_effect = OSError("Failed to launch process")
            
            # Create a real file for testing
            temp_file = Path(tempfile.gettempdir()) / 'test_installer.exe'
            temp_file.write_bytes(b'test')
            
            try:
                result = self.installer._install_windows(temp_file)
                self.assertFalse(result[0])
                self.assertIn("Failed to launch", result[1])
            finally:
                if temp_file.exists():
                    temp_file.unlink()
    
    def test_unsupported_platform(self):
        """Test that unsupported platforms return error."""
        # Temporarily change platform
        original_platform = self.installer.platform
        self.installer.platform = 'linux'
        
        temp_file = Path(tempfile.gettempdir()) / 'test_installer.deb'
        temp_file.write_bytes(b'test')
        
        try:
            result = self.installer.install(str(temp_file))
            self.assertFalse(result[0])
            self.assertIn("Unsupported platform", result[1])
        finally:
            self.installer.platform = original_platform
            if temp_file.exists():
                temp_file.unlink()
    
    def test_install_with_none_path_handled(self):
        """Test that installer handles None path gracefully."""
        result = self.installer.install(None)
        self.assertFalse(result[0])
        self.assertIn("empty", result[1].lower() or "none")


class TestUpdateInstallerPowerShellLauncher(unittest.TestCase):
    """Test PowerShell launcher script integration."""
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.resolve')
    def test_powershell_launcher_command_construction(self, mock_resolve, mock_exists, mock_exit, mock_popen):
        """Test that PowerShell launcher command is constructed correctly."""
        import sys
        
        # Mock launcher script existing
        mock_exists.return_value = True
        mock_resolve.side_effect = lambda: Path('C:/test/launcher.ps1') if 'launcher' in str(self) else Path('C:/test/installer.exe')
        
        # Mock process
        mock_process = Mock()
        mock_process.pid = 12345
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process
        
        # Mock frozen app
        with patch('sys.frozen', True, create=True), \
             patch('sys._MEIPASS', 'C:/frozen_app', create=True), \
             patch('shutil.copy2'), \
             patch('tempfile.gettempdir', return_value='C:/temp'):
            
            result = self.installer._install_windows(self.test_installer)
            
            # Verify Popen was called
            mock_popen.assert_called()
            call_args = mock_popen.call_args[0][0]
            
            # Verify PowerShell command structure
            self.assertIn('powershell.exe', call_args)
            self.assertIn('-ExecutionPolicy', call_args)
            self.assertIn('Bypass', call_args)
            self.assertIn('-File', call_args)
            self.assertIn('-InstallerPath', call_args)
    
    @patch('subprocess.Popen')
    @patch('pathlib.Path.exists')
    def test_powershell_launcher_fallback_on_missing_script(self, mock_exists, mock_popen):
        """Test that system falls back to direct launch if launcher script missing."""
        import sys
        
        # Mock launcher script not existing
        mock_exists.return_value = False
        
        # Mock process
        mock_process = Mock()
        mock_process.pid = 12345
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process
        
        with patch('sys.frozen', True, create=True), \
             patch('sys._MEIPASS', 'C:/frozen_app', create=True):
            
            result = self.installer._install_windows(self.test_installer)
            
            # Verify Popen was called (direct launch)
            mock_popen.assert_called()
            # Should use shell=True for direct launch
            call_kwargs = mock_popen.call_args[1]
            self.assertTrue(call_kwargs.get('shell', False))


class TestUpdateInstallerAppPathDetection(unittest.TestCase):
    """Test app path detection for reopening."""
    
    @unittest.skipIf(platform.system() != 'Windows', "Windows-only test")
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('winreg.OpenKey')
    @patch('winreg.QueryValueEx')
    @patch('winreg.CloseKey')
    def test_app_path_from_registry(self, mock_close, mock_query, mock_open):
        """Test that app path is retrieved from Windows registry."""
        import sys
        import winreg
        
        # Mock registry access
        mock_key = Mock()
        mock_open.return_value = mock_key
        mock_query.return_value = ('C:/Program Files/CuePoint',)
        
        with patch('subprocess.Popen') as mock_popen, \
             patch('sys.exit'), \
             patch('pathlib.Path.exists', return_value=False):
            
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None
            mock_popen.return_value = mock_process
            
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Verify registry was accessed
                mock_open.assert_called()
                mock_query.assert_called()
                mock_close.assert_called()
    
    @patch('winreg.OpenKey')
    def test_app_path_fallback_on_registry_error(self, mock_open):
        """Test that app path falls back to default location on registry error."""
        import sys
        
        # Make registry access fail
        mock_open.side_effect = Exception("Registry key not found")
        
        with patch('subprocess.Popen') as mock_popen, \
             patch('sys.exit'), \
             patch('pathlib.Path.exists', return_value=False), \
             patch('os.path.expandvars', return_value='C:/Users/Test/AppData/Local/CuePoint/CuePoint.exe'):
            
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None
            mock_popen.return_value = mock_process
            
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Should not crash, should use fallback
                mock_popen.assert_called()


class TestUpdateInstallerCompleteFlow(unittest.TestCase):
    """Test complete update installation flow with all components."""
    
    @unittest.skipIf(not platform.system() == 'Windows', "Windows-only test")
    def setUp(self):
        """Set up test environment."""
        self.installer = UpdateInstaller()
        self.temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Test_Updates'
        self.temp_dir.mkdir(exist_ok=True)
        self.test_installer = self.temp_dir / 'test_installer.exe'
        self.test_installer.write_bytes(b'fake installer content')
    
    def tearDown(self):
        """Clean up test files."""
        if self.test_installer.exists():
            self.test_installer.unlink()
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    @patch('time.sleep')
    def test_complete_flow_with_powershell_launcher(self, mock_sleep, mock_exit, mock_popen):
        """Test complete flow: path validation -> PowerShell launcher -> exit."""
        import sys
        
        # Mock all components
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.resolve', side_effect=lambda: Path('C:/test/launcher.ps1') if 'launcher' in str(self) else Path('C:/test/installer.exe')), \
             patch('pathlib.Path.parent', return_value=Path('C:/test')), \
             patch('shutil.copy2'), \
             patch('tempfile.gettempdir', return_value='C:/temp'), \
             patch('winreg.OpenKey'), \
             patch('winreg.QueryValueEx', return_value=('C:/Program Files/CuePoint',)), \
             patch('winreg.CloseKey'):
            
            # Mock process
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None  # Process running
            mock_popen.return_value = mock_process
            
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Verify all steps were executed
                mock_popen.assert_called()
                # Verify PowerShell command structure
                call_args = mock_popen.call_args[0][0]
                self.assertIn('powershell.exe', call_args)
                self.assertIn('-InstallerPath', call_args)
    
    @patch('subprocess.Popen')
    @patch('sys.exit')
    def test_complete_flow_direct_launch(self, mock_exit, mock_popen):
        """Test complete flow with direct installer launch (no PowerShell launcher)."""
        import sys
        
        # Mock launcher not existing
        with patch('pathlib.Path.exists', return_value=False):
            
            # Mock process
            mock_process = Mock()
            mock_process.pid = 12345
            mock_process.poll.return_value = None
            mock_popen.return_value = mock_process
            
            with patch('sys.frozen', True, create=True), \
                 patch('sys._MEIPASS', 'C:/frozen_app', create=True):
                
                result = self.installer._install_windows(self.test_installer)
                
                # Verify direct launch was used
                mock_popen.assert_called()
                call_kwargs = mock_popen.call_args[1]
                self.assertTrue(call_kwargs.get('shell', False))


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerPathValidation))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerWindows))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerMacOS))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerErrorHandling))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerPowerShellLauncher))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerAppPathDetection))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateInstallerCompleteFlow))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
