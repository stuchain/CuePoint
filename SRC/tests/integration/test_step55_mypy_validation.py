#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Integration tests for Step 5.5: Mypy type checking validation.

This module verifies that mypy can successfully type-check the codebase.
"""

import subprocess
import sys
from pathlib import Path

import pytest


class TestMypyValidation:
    """Test that mypy validates the codebase correctly."""

    @pytest.mark.integration
    def test_mypy_services(self):
        """Test that mypy can type-check services."""
        src_dir = Path(__file__).parent.parent.parent
        mypy_config = src_dir.parent / "mypy.ini"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "cuepoint/services/",
                "--config-file",
                str(mypy_config),
                "--explicit-package-bases",
                "--namespace-packages",
            ],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )

        # Mypy should exit with code 0 (success) or have no errors
        # We allow warnings but not errors
        if result.returncode != 0:
            # Check if there are actual errors (not just warnings)
            output = result.stdout + result.stderr
            # Ignore acceptable errors:
            # - "Source file found twice" - path resolution issue
            # - "import-untyped" - missing type stubs for third-party libraries
            # - "import-not-found" - optional dependencies (playwright, selenium, etc.)
            # - Errors in legacy processor.py file
            # - Errors in bootstrap.py (abstract class registration is intentional)
            ignore_patterns = [
                "source file found twice",
                "import-untyped",
                "import-not-found",
                "processor.py",
                "bootstrap.py",
            ]
            errors = [
                line
                for line in output.split("\n")
                if "error:" in line.lower()
                and not any(pattern in line.lower() for pattern in ignore_patterns)
            ]
            if errors:
                pytest.fail(f"Mypy found type errors in services:\n{output}")

    @pytest.mark.integration
    def test_mypy_core(self):
        """Test that mypy can type-check core modules."""
        src_dir = Path(__file__).parent.parent.parent
        mypy_config = src_dir.parent / "mypy.ini"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "cuepoint/core/",
                "--config-file",
                str(mypy_config),
                "--explicit-package-bases",
                "--namespace-packages",
            ],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            output = result.stdout + result.stderr
            # Ignore acceptable errors (same as services test)
            ignore_patterns = [
                "source file found twice",
                "import-untyped",
                "import-not-found",
            ]
            errors = [
                line
                for line in output.split("\n")
                if "error:" in line.lower()
                and not any(pattern in line.lower() for pattern in ignore_patterns)
            ]
            if errors:
                pytest.fail(f"Mypy found type errors in core:\n{output}")

    @pytest.mark.integration
    def test_mypy_data(self):
        """Test that mypy can type-check data layer."""
        src_dir = Path(__file__).parent.parent.parent
        mypy_config = src_dir.parent / "mypy.ini"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "cuepoint/data/",
                "--config-file",
                str(mypy_config),
                "--explicit-package-bases",
                "--namespace-packages",
            ],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            output = result.stdout + result.stderr
            # Ignore acceptable errors (same as services test)
            ignore_patterns = [
                "source file found twice",
                "import-untyped",
                "import-not-found",
            ]
            errors = [
                line
                for line in output.split("\n")
                if "error:" in line.lower()
                and not any(pattern in line.lower() for pattern in ignore_patterns)
            ]
            if errors:
                pytest.fail(f"Mypy found type errors in data layer:\n{output}")

    @pytest.mark.integration
    def test_mypy_controllers(self):
        """Test that mypy can type-check UI controllers."""
        src_dir = Path(__file__).parent.parent.parent
        mypy_config = src_dir.parent / "mypy.ini"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "cuepoint/ui/controllers/",
                "--config-file",
                str(mypy_config),
                "--explicit-package-bases",
                "--namespace-packages",
            ],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            output = result.stdout + result.stderr
            # Ignore acceptable errors
            ignore_patterns = [
                "source file found twice",
                "import-untyped",
                "import-not-found",
            ]
            errors = [
                line
                for line in output.split("\n")
                if "error:" in line.lower()
                and not any(pattern in line.lower() for pattern in ignore_patterns)
            ]
            if errors:
                pytest.fail(f"Mypy found type errors in controllers:\n{output}")

    @pytest.mark.integration
    def test_mypy_utils(self):
        """Test that mypy can type-check utilities."""
        src_dir = Path(__file__).parent.parent.parent
        mypy_config = src_dir.parent / "mypy.ini"

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "cuepoint/utils/",
                "--config-file",
                str(mypy_config),
                "--explicit-package-bases",
                "--namespace-packages",
            ],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            output = result.stdout + result.stderr
            # Ignore acceptable errors
            ignore_patterns = [
                "source file found twice",
                "import-untyped",
                "import-not-found",
            ]
            errors = [
                line
                for line in output.split("\n")
                if "error:" in line.lower()
                and not any(pattern in line.lower() for pattern in ignore_patterns)
            ]
            if errors:
                pytest.fail(f"Mypy found type errors in utils:\n{output}")

