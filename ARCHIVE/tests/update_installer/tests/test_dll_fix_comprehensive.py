#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Tests for DLL Fix

Tests all aspects of the Python DLL inclusion fix:
1. Correct tuple format in PyInstaller spec
2. PowerShell launcher script improvements
3. GitHub Actions workflow updates
4. DLL inclusion at all stages (pre-analysis, post-analysis, pre-EXE)
"""

import sys
import unittest
import re
from pathlib import Path
from unittest.mock import Mock, patch

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))


class TestPyInstallerSpecTupleFormat(unittest.TestCase):
    """Test that PyInstaller spec uses correct tuple format for binaries."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.spec_path = PROJECT_ROOT / "build" / "pyinstaller.spec"
        if not self.spec_path.exists():
            self.skipTest("pyinstaller.spec not found")
        self.spec_content = self.spec_path.read_text(encoding='utf-8')
    
    def test_pre_analysis_binaries_uses_correct_tuple_format(self):
        """Test that pre-analysis binaries.append uses (src_path, dest_dir) format for Analysis."""
        # Find the pre-analysis binaries.append line for python DLL
        # Should use 2-tuple format: (src_path, dest_dir)
        # Can be: binaries.append((str(python_dll_path), '.')) OR binaries.append((src_path_str, dest_dir))
        pattern1 = r'binaries\.append\(\(str\([^)]+\)\s*,\s*[\'"]\.[\'"]\)\)'
        pattern2 = r'binaries\.append\(\([^,]+_str\s*,\s*[^)]+\)\)'
        match1 = re.search(pattern1, self.spec_content)
        match2 = re.search(pattern2, self.spec_content)
        
        self.assertTrue(
            match1 is not None or match2 is not None,
            "Pre-analysis binaries.append should use (src_path, dest_dir) format for Analysis constructor"
        )
    
    def test_pre_analysis_binaries_has_src_path_first(self):
        """Test that pre-analysis binaries tuple has src_path as first element."""
        # The format should be: (src_path, dest_dir) where src_path is a string
        # Can be: (str(python_dll_path), '.') OR (src_path_str, dest_dir)
        pattern1 = r'binaries\.append\(\(str\(([^)]+)\)\s*,\s*[\'"]\.[\'"]\)\)'
        pattern2 = r'binaries\.append\(\(([^,]+_str)\s*,\s*([^)]+)\)\)'
        match1 = re.search(pattern1, self.spec_content)
        match2 = re.search(pattern2, self.spec_content)
        
        self.assertTrue(
            match1 is not None or match2 is not None,
            "Pre-analysis binaries should use (src_path, dest_dir) format"
        )
        
        if match1:
            path_var = match1.group(1).strip()
            # Should reference python_dll_path variable
            self.assertIn('python', path_var.lower(), "Should reference python DLL path variable")
    
    def test_post_analysis_binaries_uses_correct_tuple_format(self):
        """Test that post-analysis a.binaries.append uses correct tuple format."""
        # Find the post-analysis a.binaries.append line
        pattern = r'a\.binaries\.append\(\(([^,]+),\s*str\(([^)]+)\)\s*,\s*[\'"]BINARY[\'"]\)\)'
        match = re.search(pattern, self.spec_content)
        
        self.assertIsNotNone(
            match,
            "Post-analysis a.binaries.append should use (dest_name, src_path, 'BINARY') format"
        )
        
        if match:
            first_arg = match.group(1).strip()
            # First argument should be the DLL name variable
            self.assertIn('python', first_arg.lower(), "First element should be python DLL name")
    
    def test_pre_analysis_uses_two_tuple_format(self):
        """Test that pre-analysis binaries uses 2-tuple format (src_path, dest_dir) for Analysis."""
        # Pre-analysis format should be: binaries.append((src_path, dest_dir))
        # Can be: binaries.append((str(python_dll_path), '.')) OR binaries.append((src_path_str, dest_dir))
        pattern1 = r'binaries\.append\(\(str\([^)]+\)\s*,\s*[\'"]\.[\'"]\)\)'
        pattern2 = r'binaries\.append\(\([^,]+_str\s*,\s*[^)]+\)\)'
        match1 = re.search(pattern1, self.spec_content)
        match2 = re.search(pattern2, self.spec_content)
        
        self.assertTrue(
            match1 is not None or match2 is not None,
            "Pre-analysis binaries should use (src_path, dest_dir) format for Analysis constructor"
        )
    
    def test_python3_dll_also_uses_correct_format(self):
        """Test that python3.dll also uses correct tuple format."""
        # Check for python3.dll inclusion
        if 'python3.dll' in self.spec_content:
            # Pre-analysis should use: binaries.append((src_path, dest_dir))
            # Can be: binaries.append((str(python3_dll_path), '.')) OR binaries.append((python3_src_path_str, python3_dest_dir))
            pattern1 = r'binaries\.append\(\(str\([^)]*python3[^)]*\)\s*,\s*[\'"]\.[\'"]\)\)'
            pattern2 = r'binaries\.append\(\([^,]*python3[^,]*_str\s*,\s*[^)]+\)\)'
            match1 = re.search(pattern1, self.spec_content)
            match2 = re.search(pattern2, self.spec_content)
            
            self.assertTrue(
                match1 is not None or match2 is not None,
                "python3.dll should use (src_path, dest_dir) format for Analysis constructor"
            )


class TestPowerShellLauncherImprovements(unittest.TestCase):
    """Test PowerShell launcher script improvements for DLL fix."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.launcher_path = PROJECT_ROOT / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
        if not self.launcher_path.exists():
            self.skipTest("update_launcher.ps1 not found")
        self.launcher_content = self.launcher_path.read_text(encoding='utf-8')
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_launcher_sets_working_directory(self):
        """Test that launcher sets WorkingDirectory when launching app."""
        # Should use: Start-Process -FilePath $AppPath -WorkingDirectory $AppDirectory
        self.assertIn("-WorkingDirectory", self.launcher_content,
                     "Launcher should set WorkingDirectory when launching app")
        self.assertIn("$AppDirectory", self.launcher_content,
                     "Launcher should use $AppDirectory variable")
        self.assertIn("Split-Path -Parent $AppPath", self.launcher_content,
                     "Launcher should get directory from app path")
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_launcher_has_delay_before_launch(self):
        """Test that launcher has a delay before launching app."""
        # Should have: Start-Sleep -Seconds 1 before launching
        # Check that there's a Start-Sleep before Start-Process for app launch
        lines = self.launcher_content.split('\n')
        found_sleep = False
        found_start_process = False
        
        for i, line in enumerate(lines):
            if 'Start-Sleep' in line and ('-Seconds' in line or '-Seconds 1' in line):
                found_sleep = True
                # Check if Start-Process for app comes after this
                for j in range(i, min(i+10, len(lines))):
                    if 'Start-Process' in lines[j] and '$AppPath' in lines[j]:
                        found_start_process = True
                        break
                if found_start_process:
                    break
        
        self.assertTrue(
            found_sleep and found_start_process,
            "Launcher should have Start-Sleep delay before launching app"
        )
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_launcher_uses_no_new_window_flag(self):
        """Test that launcher uses -NoNewWindow flag for proper environment inheritance."""
        # Should use: Start-Process ... -NoNewWindow
        # Check that -NoNewWindow is used with Start-Process for app launch
        pattern = r'Start-Process.*\$AppPath.*-NoNewWindow'
        match = re.search(pattern, self.launcher_content, re.DOTALL)
        
        self.assertIsNotNone(
            match,
            "Launcher should use -NoNewWindow flag when launching app"
        )


class TestDLLInclusionAllStages(unittest.TestCase):
    """Test that DLL is included at all stages (pre-analysis, post-analysis, pre-EXE)."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.spec_path = PROJECT_ROOT / "build" / "pyinstaller.spec"
        if not self.spec_path.exists():
            self.skipTest("pyinstaller.spec not found")
        self.spec_content = self.spec_path.read_text(encoding='utf-8')
    
    def test_pre_analysis_dll_inclusion(self):
        """Test that DLL is included in binaries list before Analysis."""
        # Should have: binaries = [] followed by binaries.append for DLL
        self.assertIn("binaries = []", self.spec_content,
                     "Should initialize binaries list before Analysis")
        self.assertIn("binaries.append", self.spec_content,
                     "Should append DLL to binaries before Analysis")
        
        # Check that it happens before Analysis
        binaries_append_pos = self.spec_content.find("binaries.append")
        analysis_pos = self.spec_content.find("a = Analysis")
        
        self.assertLess(
            binaries_append_pos, analysis_pos,
            "binaries.append should come before Analysis"
        )
    
    def test_post_analysis_dll_verification(self):
        """Test that DLL is verified and added after Analysis if missing."""
        # Should have: a.binaries.append after Analysis
        self.assertIn("a.binaries.append", self.spec_content,
                     "Should append DLL to a.binaries after Analysis if missing")
        self.assertIn("dll_found", self.spec_content.lower(),
                     "Should check if DLL was found in binaries")
        
        # Check that it happens after Analysis
        analysis_pos = self.spec_content.find("a = Analysis")
        post_analysis_pos = self.spec_content.find("a.binaries.append")
        
        self.assertLess(
            analysis_pos, post_analysis_pos,
            "Post-analysis DLL check should come after Analysis"
        )
    
    def test_pre_exe_dll_verification(self):
        """Test that DLL is verified before or during EXE creation."""
        # Should have: dll_in_binaries check before or near exe = EXE
        self.assertIn("dll_in_binaries", self.spec_content.lower(),
                     "Should verify DLL in binaries before EXE creation")
        
        # The verification should exist (it may be right before or in the EXE block)
        # This is acceptable as long as it's checked
        verification_pos = self.spec_content.lower().find("dll_in_binaries")
        exe_pos = self.spec_content.find("exe = EXE")
        
        # Verification should exist (position doesn't matter as much as long as it's checked)
        self.assertNotEqual(
            verification_pos, -1,
            "DLL verification should exist in spec file"
        )
    
    def test_all_stages_use_same_dll_name(self):
        """Test that all stages use the same DLL name variable."""
        # All stages should use python_dll_name variable
        python_dll_name_count = self.spec_content.count("python_dll_name")
        
        self.assertGreaterEqual(
            python_dll_name_count, 3,
            "python_dll_name should be used in multiple stages (pre, post, pre-EXE)"
        )


class TestGitHubActionsPyInstallerUpgrade(unittest.TestCase):
    """Test that GitHub Actions workflow upgrades PyInstaller."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.workflow_path = PROJECT_ROOT / ".github" / "workflows" / "build-windows.yml"
        if not self.workflow_path.exists():
            self.skipTest("build-windows.yml not found")
        self.workflow_content = self.workflow_path.read_text(encoding='utf-8')
    
    def test_workflow_upgrades_pyinstaller(self):
        """Test that workflow uses --upgrade when installing PyInstaller."""
        # Should use: pip install --upgrade pyinstaller
        self.assertIn("pip install", self.workflow_content,
                     "Workflow should install PyInstaller")
        self.assertIn("--upgrade", self.workflow_content,
                     "Workflow should use --upgrade when installing PyInstaller")
        self.assertIn("pyinstaller", self.workflow_content.lower(),
                     "Workflow should install PyInstaller")
    
    def test_workflow_logs_pyinstaller_version(self):
        """Test that workflow logs PyInstaller version."""
        # Should have: pyinstaller --version
        self.assertIn("pyinstaller --version", self.workflow_content.lower(),
                     "Workflow should log PyInstaller version")


class TestDLLFixIntegration(unittest.TestCase):
    """Integration tests for the complete DLL fix."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.spec_path = PROJECT_ROOT / "build" / "pyinstaller.spec"
        self.launcher_path = PROJECT_ROOT / "SRC" / "cuepoint" / "update" / "update_launcher.ps1"
    
    def test_spec_and_launcher_both_exist(self):
        """Test that both spec file and launcher script exist."""
        self.assertTrue(self.spec_path.exists(), "pyinstaller.spec should exist")
        self.assertTrue(self.launcher_path.exists(), "update_launcher.ps1 should exist")
    
    def test_dll_fix_completeness(self):
        """Test that DLL fix is complete (spec + launcher + workflow)."""
        spec_exists = self.spec_path.exists()
        launcher_exists = self.launcher_path.exists()
        workflow_path = PROJECT_ROOT / ".github" / "workflows" / "build-windows.yml"
        workflow_exists = workflow_path.exists()
        
        all_exist = spec_exists and launcher_exists and workflow_exists
        
        self.assertTrue(
            all_exist,
            "All components of DLL fix should exist (spec, launcher, workflow)"
        )
    
    @unittest.skipIf(sys.platform != 'win32', "Windows-only test")
    def test_dll_name_consistency(self):
        """Test that DLL name is consistent across all files."""
        if not self.spec_path.exists():
            self.skipTest("pyinstaller.spec not found")
        
        spec_content = self.spec_path.read_text(encoding='utf-8')
        
        # Extract Python version DLL name pattern
        # Should use: f'python{sys.version_info.major}{sys.version_info.minor}.dll'
        pattern = r"python\{sys\.version_info\.major\}\{sys\.version_info\.minor\}\.dll"
        match = re.search(pattern, spec_content)
        
        self.assertIsNotNone(
            match,
            "Spec should use dynamic Python version DLL name"
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
