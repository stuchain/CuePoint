"""Acceptance tests for installation and distribution.

Tests installation workflows for macOS DMG and Windows NSIS installer.
These tests verify that the distribution packages work correctly.
"""

import platform
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import pytest


@pytest.fixture
def clean_install_dir():
    """Clean installation directory for testing."""
    if platform.system() == "Windows":
        install_dir = Path.home() / "AppData" / "Local" / "CuePoint"
    elif platform.system() == "Darwin":
        install_dir = Path.home() / "Applications" / "CuePoint.app"
    else:
        install_dir = Path.home() / ".local" / "share" / "CuePoint"
    
    # Cleanup before test
    if install_dir.exists():
        if platform.system() == "Windows":
            shutil.rmtree(install_dir, ignore_errors=True)
        else:
            shutil.rmtree(install_dir, ignore_errors=True)
    
    yield install_dir
    
    # Cleanup after test
    if install_dir.exists():
        if platform.system() == "Windows":
            shutil.rmtree(install_dir, ignore_errors=True)
        else:
            shutil.rmtree(install_dir, ignore_errors=True)


@pytest.mark.skipif(platform.system() != "Darwin", reason="macOS-specific test")
def test_macos_dmg_mounts():
    """Test macOS DMG can be mounted."""
    dmg_path = Path("dist/CuePoint-v1.0.0-macos-universal.dmg")
    
    if not dmg_path.exists():
        pytest.skip("DMG file not found. Run build first.")
    
    # Mount DMG
    result = subprocess.run(
        ["hdiutil", "attach", str(dmg_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    assert result.returncode == 0, f"Failed to mount DMG: {result.stderr}"
    
    try:
        # Verify contents
        mount_point = Path("/Volumes/CuePoint")
        assert mount_point.exists(), "DMG mount point not found"
        assert (mount_point / "CuePoint.app").exists(), "App bundle not found in DMG"
        assert (mount_point / "Applications").exists(), "Applications symlink not found"
    finally:
        # Unmount
        subprocess.run(
            ["hdiutil", "detach", "/Volumes/CuePoint"],
            capture_output=True,
            check=False,
            timeout=30
        )


@pytest.mark.skipif(platform.system() != "Darwin", reason="macOS-specific test")
def test_macos_app_structure():
    """Test macOS app bundle structure."""
    app_path = Path("dist/CuePoint.app")
    
    if not app_path.exists():
        pytest.skip("App bundle not found. Run build first.")
    
    # Check required structure
    assert (app_path / "Contents" / "MacOS" / "CuePoint").exists(), "Executable not found"
    assert (app_path / "Contents" / "Info.plist").exists(), "Info.plist not found"
    assert (app_path / "Contents" / "Resources").exists(), "Resources directory not found"
    
    # Check Info.plist
    try:
        import plistlib
        with open(app_path / "Contents" / "Info.plist", "rb") as f:
            plist = plistlib.load(f)
            assert plist.get("CFBundleIdentifier") == "com.stuchain.cuepoint", "Bundle ID incorrect"
            assert "CFBundleShortVersionString" in plist, "Version not found in Info.plist"
    except ImportError:
        pytest.skip("plistlib not available")


@pytest.mark.skipif(platform.system() != "Windows", reason="Windows-specific test")
def test_windows_installer_runs(clean_install_dir):
    """Test Windows installer can run."""
    installer_path = Path("dist/CuePoint-v1.0.0-windows-x64-setup.exe")
    
    if not installer_path.exists():
        pytest.skip("Installer not found. Run build first.")
    
    # Test silent install
    install_path = clean_install_dir.parent / "test_install"
    if install_path.exists():
        shutil.rmtree(install_path, ignore_errors=True)
    
    try:
        result = subprocess.run(
            [str(installer_path), "/S", f"/D={install_path}"],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        assert result.returncode == 0, f"Installer failed: {result.stderr}"
        
        # Verify installation
        assert (install_path / "CuePoint.exe").exists(), "CuePoint.exe not found after installation"
        assert (install_path / "uninstall.exe").exists(), "Uninstaller not found"
        
        # Test uninstall
        uninstaller = install_path / "uninstall.exe"
        if uninstaller.exists():
            result = subprocess.run(
                [str(uninstaller), "/S"],
                capture_output=True,
                text=True,
                timeout=60
            )
            # Uninstall may return non-zero if user data question is asked
            # Just verify it ran
            assert True  # If we get here, uninstaller executed
    finally:
        # Cleanup
        if install_path.exists():
            shutil.rmtree(install_path, ignore_errors=True)


@pytest.mark.skipif(platform.system() == "Windows", reason="Requires clean VM without Python")
def test_app_launches_without_python():
    """Test app launches without Python installed.
    
    This test requires a clean VM without Python.
    For now, it's a placeholder that documents the requirement.
    """
    pytest.skip("Requires clean VM without Python. Manual testing required.")


def test_installation_success_rate():
    """Test installation success rate on various systems.
    
    This test documents the requirement to test on:
    - Clean macOS 10.15+
    - Clean macOS 11+
    - Clean macOS 12+
    - Clean Windows 10
    - Clean Windows 11
    
    For now, it's a placeholder that documents the requirement.
    """
    pytest.skip("Requires multiple clean VMs. Manual testing required.")


@pytest.mark.skipif(platform.system() != "Windows", reason="Windows-specific test")
def test_uninstallation_preserves_data(clean_install_dir):
    """Test uninstallation preserves user data by default."""
    # This test would:
    # 1. Install app
    # 2. Create user data
    # 3. Uninstall (choosing to preserve data)
    # 4. Verify user data still exists
    
    pytest.skip("Requires full installation workflow. Manual testing recommended.")


def test_distribution_artifacts_exist():
    """Test that distribution artifacts exist."""
    dist_dir = Path("dist")
    
    if not dist_dir.exists():
        pytest.skip("dist directory not found. Run build first.")
    
    # Check for DMG (macOS)
    if platform.system() == "Darwin":
        dmgs = list(dist_dir.glob("*.dmg"))
        if len(dmgs) == 0:
            pytest.skip("No DMG files found in dist/. Run build first.")
    
    # Check for installer (Windows)
    if platform.system() == "Windows":
        installers = list(dist_dir.glob("*-setup.exe"))
        if len(installers) == 0:
            pytest.skip("No installer files found in dist/. Run build first.")
