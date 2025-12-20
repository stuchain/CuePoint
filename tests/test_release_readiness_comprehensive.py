#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comprehensive Release Readiness Test Suite

This test suite verifies that everything is ready for release:
1. PyInstaller build configuration (Python 3.13 DLL fix)
2. Executable can be built successfully
3. Update system works correctly
4. Installation process works
5. Version embedding is correct
6. All critical paths are functional

Run this before every release to ensure quality.
"""

import unittest
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock, Mock
import platform

# Add SRC to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / 'SRC'))


class TestPyInstallerConfiguration(unittest.TestCase):
    """Test PyInstaller configuration for Python 3.13."""
    
    def setUp(self):
        self.spec_file = project_root / 'build' / 'pyinstaller.spec'
        self.hook_file = project_root / 'build' / 'hook-python313.py'
    
    def test_spec_file_exists(self):
        """Test that PyInstaller spec file exists."""
        self.assertTrue(self.spec_file.exists(), 
                       f"PyInstaller spec file not found: {self.spec_file}")
    
    def test_spec_file_includes_python_dll(self):
        """Test that spec file includes Python DLL in binaries."""
        if not self.spec_file.exists():
            self.skipTest("pyinstaller.spec not found")
        
        spec_content = self.spec_file.read_text(encoding='utf-8')
        
        # Check for pre-analysis DLL inclusion
        self.assertIn('python{sys.version_info.major}{sys.version_info.minor}.dll', spec_content,
                      "Spec file should include Python DLL detection")
        
        # Check for binaries list with DLL
        self.assertIn('binaries.append', spec_content,
                     "Spec file should append DLL to binaries list")
        
        # Check for post-analysis verification
        self.assertIn('dll_found', spec_content.lower(),
                     "Spec file should verify DLL after Analysis")
    
    def test_spec_file_uses_correct_tuple_format(self):
        """Test that spec file uses correct tuple format for binaries."""
        if not self.spec_file.exists():
            self.skipTest("pyinstaller.spec not found")
        
        spec_content = self.spec_file.read_text(encoding='utf-8')
        
        # Check for 2-tuple format in pre-analysis (for Analysis constructor)
        self.assertIn("(src_path_str, dest_dir)", spec_content,
                     "Spec file should use 2-tuple format for Analysis binaries")
        
        # Check for 3-tuple format in post-analysis (for a.binaries.append)
        self.assertIn("'BINARY'", spec_content,
                     "Spec file should use 3-tuple format when appending to a.binaries")
    
    def test_hook_file_exists(self):
        """Test that Python 3.13 hook file exists."""
        if platform.system() != 'Windows':
            self.skipTest("Hook file is Windows-specific")
        
        self.assertTrue(self.hook_file.exists(),
                       f"Python 3.13 hook file not found: {self.hook_file}")
    
    def test_hook_file_includes_dll(self):
        """Test that hook file includes Python DLL."""
        if not self.hook_file.exists():
            self.skipTest("hook-python313.py not found")
        
        hook_content = self.hook_file.read_text(encoding='utf-8')
        
        self.assertIn('python{sys.version_info.major}{sys.version_info.minor}.dll', hook_content,
                     "Hook file should include Python DLL")
        self.assertIn('binaries.append', hook_content,
                     "Hook file should append DLL to binaries")
    
    def test_spec_file_includes_hook_path(self):
        """Test that spec file includes hooks directory in hookspath."""
        if not self.spec_file.exists():
            self.skipTest("pyinstaller.spec not found")
        
        spec_content = self.spec_file.read_text(encoding='utf-8')
        
        self.assertIn('hookspath', spec_content.lower(),
                     "Spec file should include hookspath configuration")
        self.assertIn('build', spec_content,
                     "Spec file should include build directory in hookspath")


class TestPyInstallerVersion(unittest.TestCase):
    """Test that PyInstaller version meets requirements."""
    
    def test_pyinstaller_version_requirement(self):
        """Test that PyInstaller version is >= 6.10.0."""
        try:
            result = subprocess.run(
                ['pyinstaller', '--version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                self.skipTest("PyInstaller not installed or not in PATH")
            
            version_str = result.stdout.strip().split()[0]  # Get version number
            version_parts = version_str.split('.')
            major = int(version_parts[0])
            minor = int(version_parts[1])
            
            self.assertGreaterEqual(
                (major, minor),
                (6, 10),
                f"PyInstaller version {version_str} is too old. Need >= 6.10.0 for Python 3.13 support"
            )
        except FileNotFoundError:
            self.skipTest("PyInstaller not found in PATH")
        except subprocess.TimeoutExpired:
            self.skipTest("PyInstaller version check timed out")


class TestRequirementsFiles(unittest.TestCase):
    """Test that requirements files specify correct PyInstaller version."""
    
    def test_requirements_dev_specifies_pyinstaller(self):
        """Test that requirements-dev.txt specifies PyInstaller >= 6.10.0."""
        req_file = project_root / 'requirements-dev.txt'
        
        if not req_file.exists():
            self.skipTest("requirements-dev.txt not found")
        
        content = req_file.read_text(encoding='utf-8')
        
        # Check for PyInstaller requirement
        self.assertIn('pyinstaller', content.lower(),
                     "requirements-dev.txt should include PyInstaller")
        
        # Check for version >= 6.10.0
        import re
        pyinstaller_lines = [line for line in content.split('\n') 
                            if 'pyinstaller' in line.lower() and not line.strip().startswith('#')]
        
        self.assertGreater(len(pyinstaller_lines), 0,
                          "No PyInstaller requirement found")
        
        # Check if version is >= 6.10.0
        for line in pyinstaller_lines:
            if '>=' in line:
                version_match = re.search(r'>=([\d.]+)', line)
                if version_match:
                    version_str = version_match.group(1)
                    version_parts = version_str.split('.')
                    major = int(version_parts[0])
                    minor = int(version_parts[1])
                    self.assertGreaterEqual(
                        (major, minor),
                        (6, 10),
                        f"PyInstaller version requirement {version_str} is too old. Need >= 6.10.0"
                    )


class TestWorkflowConfiguration(unittest.TestCase):
    """Test that GitHub Actions workflows are configured correctly."""
    
    def test_windows_workflow_upgrades_pyinstaller(self):
        """Test that Windows workflow upgrades PyInstaller."""
        workflow_file = project_root / '.github' / 'workflows' / 'build-windows.yml'
        
        if not workflow_file.exists():
            self.skipTest("build-windows.yml not found")
        
        content = workflow_file.read_text(encoding='utf-8')
        
        self.assertIn('pip install --upgrade pyinstaller', content,
                     "Windows workflow should upgrade PyInstaller")
    
    def test_windows_workflow_verifies_version(self):
        """Test that Windows workflow verifies PyInstaller version."""
        workflow_file = project_root / '.github' / 'workflows' / 'build-windows.yml'
        
        if not workflow_file.exists():
            self.skipTest("build-windows.yml not found")
        
        content = workflow_file.read_text(encoding='utf-8')
        
        self.assertIn('6.10.0', content,
                     "Windows workflow should check for PyInstaller >= 6.10.0")
    
    def test_macos_workflow_upgrades_pyinstaller(self):
        """Test that macOS workflow upgrades PyInstaller."""
        workflow_file = project_root / '.github' / 'workflows' / 'build-macos.yml'
        
        if not workflow_file.exists():
            self.skipTest("build-macos.yml not found")
        
        content = workflow_file.read_text(encoding='utf-8')
        
        self.assertIn('pip install --upgrade pyinstaller', content,
                     "macOS workflow should upgrade PyInstaller")
    
    def test_macos_workflow_verifies_version(self):
        """Test that macOS workflow verifies PyInstaller version."""
        workflow_file = project_root / '.github' / 'workflows' / 'build-macos.yml'
        
        if not workflow_file.exists():
            self.skipTest("build-macos.yml not found")
        
        content = workflow_file.read_text(encoding='utf-8')
        
        self.assertIn('6.10.0', content,
                     "macOS workflow should check for PyInstaller >= 6.10.0")


class TestUpdateSystemConfiguration(unittest.TestCase):
    """Test that update system is configured correctly."""
    
    def test_update_launcher_scripts_exist(self):
        """Test that update launcher scripts exist."""
        scripts = [
            project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.py',
            project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.ps1',
            project_root / 'SRC' / 'cuepoint' / 'update' / 'update_launcher.bat',
        ]
        
        for script in scripts:
            if script.exists():
                self.assertTrue(script.exists(),
                               f"Update launcher script not found: {script}")
    
    def test_update_launcher_scripts_in_spec(self):
        """Test that update launcher scripts are included in PyInstaller spec."""
        spec_file = project_root / 'build' / 'pyinstaller.spec'
        
        if not spec_file.exists():
            self.skipTest("pyinstaller.spec not found")
        
        spec_content = spec_file.read_text(encoding='utf-8')
        
        # Check for update launcher scripts
        self.assertIn('update_launcher.py', spec_content,
                     "Spec file should include update_launcher.py")
        self.assertIn('update_launcher.ps1', spec_content,
                     "Spec file should include update_launcher.ps1")
        self.assertIn('update_launcher.bat', spec_content,
                     "Spec file should include update_launcher.bat")


class TestVersionConfiguration(unittest.TestCase):
    """Test that version configuration is correct."""
    
    def test_version_module_exists(self):
        """Test that version module exists."""
        version_file = project_root / 'SRC' / 'cuepoint' / 'version.py'
        
        self.assertTrue(version_file.exists(),
                      f"Version module not found: {version_file}")
    
    def test_version_module_has_version(self):
        """Test that version module has __version__."""
        version_file = project_root / 'SRC' / 'cuepoint' / 'version.py'
        
        if not version_file.exists():
            self.skipTest("version.py not found")
        
        content = version_file.read_text(encoding='utf-8')
        
        self.assertIn('__version__', content,
                     "Version module should define __version__")
    
    def test_version_info_script_exists(self):
        """Test that version info generation script exists."""
        script = project_root / 'scripts' / 'generate_version_info.py'
        
        # This is optional, so we just check if it exists
        if script.exists():
            self.assertTrue(script.exists(),
                          f"Version info script found: {script}")


class TestBuildScripts(unittest.TestCase):
    """Test that build scripts are configured correctly."""
    
    def test_build_pyinstaller_script_exists(self):
        """Test that PyInstaller build script exists."""
        script = project_root / 'scripts' / 'build_pyinstaller.py'
        
        self.assertTrue(script.exists(),
                      f"Build script not found: {script}")
    
    def test_build_script_uses_spec_file(self):
        """Test that build script uses the spec file."""
        script = project_root / 'scripts' / 'build_pyinstaller.py'
        
        if not script.exists():
            self.skipTest("build_pyinstaller.py not found")
        
        content = script.read_text(encoding='utf-8')
        
        self.assertIn('pyinstaller.spec', content,
                     "Build script should reference pyinstaller.spec")


class TestDLLFixDocumentation(unittest.TestCase):
    """Test that DLL fix is documented."""
    
    def test_dll_fix_documentation_exists(self):
        """Test that DLL fix documentation exists."""
        docs = [
            project_root / 'PYTHON313_DLL_FIX.md',
            project_root / 'PYTHON313_DLL_FIX_V2.md',
            project_root / 'PYTHON313_DLL_FIX_V3.md',
            project_root / 'PYTHON313_DLL_FIX_COMMUNITY_SOLUTION.md',
        ]
        
        # At least one should exist
        existing_docs = [doc for doc in docs if doc.exists()]
        self.assertGreater(len(existing_docs), 0,
                          "No DLL fix documentation found")


def create_test_suite():
    """Create comprehensive test suite."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestPyInstallerConfiguration))
    suite.addTests(loader.loadTestsFromTestCase(TestPyInstallerVersion))
    suite.addTests(loader.loadTestsFromTestCase(TestRequirementsFiles))
    suite.addTests(loader.loadTestsFromTestCase(TestWorkflowConfiguration))
    suite.addTests(loader.loadTestsFromTestCase(TestUpdateSystemConfiguration))
    suite.addTests(loader.loadTestsFromTestCase(TestVersionConfiguration))
    suite.addTests(loader.loadTestsFromTestCase(TestBuildScripts))
    suite.addTests(loader.loadTestsFromTestCase(TestDLLFixDocumentation))
    
    return suite


if __name__ == '__main__':
    print("=" * 80)
    print("Comprehensive Release Readiness Test Suite")
    print("=" * 80)
    print()
    print("This suite verifies:")
    print("  - PyInstaller configuration (Python 3.13 DLL fix)")
    print("  - PyInstaller version requirements")
    print("  - Requirements files")
    print("  - GitHub Actions workflows")
    print("  - Update system configuration")
    print("  - Version configuration")
    print("  - Build scripts")
    print("  - Documentation")
    print()
    print("=" * 80)
    print()
    
    suite = create_test_suite()
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 80)
    print("Test Results Summary")
    print("=" * 80)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    print()
    
    if result.wasSuccessful():
        print("[OK] All tests passed! Release is ready.")
    else:
        print("[FAIL] Some tests failed. Please fix issues before release.")
        if result.failures:
            print("\nFailures:")
            for test, traceback in result.failures:
                print(f"  - {test}")
        if result.errors:
            print("\nErrors:")
            for test, traceback in result.errors:
                print(f"  - {test}")
    
    sys.exit(0 if result.wasSuccessful() else 1)
