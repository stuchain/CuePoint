#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Artifact Validation Script

Validates build artifacts before release.
Implements done criteria from Step 1.10.
"""

import platform
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple


class ArtifactValidator:
    """Validate build artifacts."""

    def __init__(self):
        """Initialize validator."""
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate_all(self, artifacts_dir: Path) -> Tuple[bool, List[str]]:
        """Validate all artifacts in directory.

        Args:
            artifacts_dir: Directory containing artifacts.

        Returns:
            Tuple of (is_valid, list_of_errors).
        """
        self.errors = []
        self.warnings = []

        # Find artifacts
        dmgs = list(artifacts_dir.glob("*.dmg"))
        installers = list(artifacts_dir.glob("*-setup.exe"))

        # Validate macOS DMG
        for dmg in dmgs:
            self.validate_macos_dmg(dmg)

        # Validate Windows installer
        for installer in installers:
            self.validate_windows_installer(installer)

        return len(self.errors) == 0, self.errors

    def validate_macos_dmg(self, dmg_path: Path) -> bool:
        """Validate macOS DMG.

        Args:
            dmg_path: Path to DMG file.

        Returns:
            True if valid, False otherwise.
        """
        print(f"Validating macOS DMG: {dmg_path.name}")

        # Check DMG exists
        if not dmg_path.exists():
            self.errors.append(f"DMG not found: {dmg_path}")
            return False

        # Check DMG size (not empty)
        if dmg_path.stat().st_size < 1024 * 1024:  # < 1MB
            self.errors.append(f"DMG appears to be empty: {dmg_path}")
            return False

        # Try to mount DMG (macOS only)
        if platform.system() == "Darwin":
            with tempfile.TemporaryDirectory() as mount_point:
                result = subprocess.run(
                    ["hdiutil", "attach", str(dmg_path), "-mountpoint", mount_point],
                    capture_output=True,
                    text=True,
                )

                if result.returncode != 0:
                    self.errors.append(f"Failed to mount DMG: {result.stderr}")
                    return False

                try:
                    # Check app bundle exists
                    app_path = Path(mount_point) / "CuePoint.app"
                    if not app_path.exists():
                        self.errors.append("App bundle not found in DMG")
                        return False

                    # Check app bundle structure
                    required_paths = [
                        "Contents/MacOS/CuePoint",
                        "Contents/Info.plist",
                        "Contents/Resources",
                    ]
                    for req_path in required_paths:
                        if not (app_path / req_path).exists():
                            self.errors.append(f"Missing required path: {req_path}")

                    # Check Applications symlink
                    apps_link = Path(mount_point) / "Applications"
                    if not apps_link.exists():
                        self.warnings.append("Applications symlink not found")

                    # Verify signing
                    result = subprocess.run(
                        ["codesign", "--verify", "--deep", "--strict", str(app_path)],
                        capture_output=True,
                        text=True,
                    )
                    if result.returncode != 0:
                        self.errors.append(f"App bundle not signed: {result.stderr}")

                finally:
                    # Unmount
                    subprocess.run(["hdiutil", "detach", mount_point], check=False)

        return len(self.errors) == 0

    def validate_windows_installer(self, installer_path: Path) -> bool:
        """Validate Windows installer.

        Args:
            installer_path: Path to installer file.

        Returns:
            True if valid, False otherwise.
        """
        print(f"Validating Windows installer: {installer_path.name}")

        # Check installer exists
        if not installer_path.exists():
            self.errors.append(f"Installer not found: {installer_path}")
            return False

        # Check installer size
        if installer_path.stat().st_size < 1024 * 1024:  # < 1MB
            self.errors.append(f"Installer appears to be empty: {installer_path}")
            return False

        # Verify signing (if on Windows)
        if platform.system() == "Windows":
            result = subprocess.run(
                ["signtool", "verify", "/pa", "/v", str(installer_path)],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                self.errors.append(f"Installer not signed: {result.stderr}")

        return len(self.errors) == 0


if __name__ == "__main__":
    artifacts_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dist")
    validator = ArtifactValidator()
    valid, errors = validator.validate_all(artifacts_dir)

    if valid:
        print("All artifacts validated successfully!")
        sys.exit(0)
    else:
        print("Validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
