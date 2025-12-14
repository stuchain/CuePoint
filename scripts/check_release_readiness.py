#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Check release readiness.

Automates checks that can be verified programmatically.
"""

import json
import subprocess
import sys
from pathlib import Path


def check_tests_pass():
    """Check that all tests pass."""
    print("Checking tests...")
    result = subprocess.run(
        ["pytest", "SRC/tests/", "-v", "--tb=short"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("✗ Tests failed")
        print(result.stdout)
        return False
    
    print("✓ All tests pass")
    return True


def check_coverage():
    """Check code coverage meets threshold."""
    print("Checking code coverage...")
    result = subprocess.run(
        ["pytest", "SRC/tests/", "--cov=SRC/cuepoint", "--cov-report=term"],
        capture_output=True,
        text=True
    )
    
    # Parse coverage from output
    if "TOTAL" in result.stdout:
        # Extract coverage percentage
        lines = result.stdout.split("\n")
        for line in lines:
            if "TOTAL" in line:
                parts = line.split()
                coverage = float(parts[-1].rstrip("%"))
                if coverage >= 80.0:
                    print(f"✓ Code coverage: {coverage:.1f}%")
                    return True
                else:
                    print(f"✗ Code coverage below threshold: {coverage:.1f}% < 80%")
                    return False
    
    print("✗ Could not determine coverage")
    return False


def check_linting():
    """Check linting passes."""
    print("Checking linting...")
    # Try ruff first, fall back to flake8
    result = subprocess.run(
        ["ruff", "check", "SRC/"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("✗ Linting failed")
        print(result.stdout)
        return False
    
    print("✓ Linting passes")
    return True


def check_type_checking():
    """Check type checking passes."""
    print("Checking type checking...")
    result = subprocess.run(
        ["mypy", "SRC/cuepoint"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("✗ Type checking failed")
        print(result.stdout)
        return False
    
    print("✓ Type checking passes")
    return True


def check_build_artifacts():
    """Check build artifacts exist."""
    print("Checking build artifacts...")
    dist_dir = Path("dist")
    
    if not dist_dir.exists():
        print("✗ dist/ directory not found")
        return False
    
    artifacts = list(dist_dir.glob("*"))
    if not artifacts:
        print("✗ No build artifacts found")
        return False
    
    print(f"✓ Found {len(artifacts)} build artifacts")
    return True


def check_release_notes():
    """Check release notes exist."""
    print("Checking release notes...")
    
    # Check for release notes in common locations
    release_notes_paths = [
        Path("CHANGELOG.md"),
        Path("RELEASE_NOTES.md"),
        Path("docs/RELEASE_NOTES.md"),
    ]
    
    for path in release_notes_paths:
        if path.exists():
            content = path.read_text()
            if len(content.strip()) > 100:  # Minimum content length
                print(f"✓ Release notes found: {path}")
                return True
    
    print("✗ Release notes not found or too short")
    return False


def check_version_consistency():
    """Check version numbers are consistent."""
    print("Checking version consistency...")
    
    # Check version in multiple locations
    version_files = [
        Path("SRC/cuepoint/version.py"),
        Path("pyproject.toml"),
    ]
    
    versions = []
    for file_path in version_files:
        if file_path.exists():
            content = file_path.read_text()
            # Extract version (simplified)
            if "__version__" in content:
                for line in content.split("\n"):
                    if "__version__" in line and "=" in line:
                        version = line.split("=")[1].strip().strip('"').strip("'")
                        versions.append(version)
                        break
    
    if not versions:
        print("⚠ Could not determine version")
        return True  # Don't fail on this
    
    if len(set(versions)) == 1:
        print(f"✓ Version consistent: {versions[0]}")
        return True
    else:
        print(f"✗ Version inconsistent: {versions}")
        return False


def main():
    """Run all release readiness checks."""
    print("=" * 60)
    print("Release Readiness Check")
    print("=" * 60)
    print()
    
    checks = [
        ("Tests", check_tests_pass),
        ("Coverage", check_coverage),
        ("Linting", check_linting),
        ("Type Checking", check_type_checking),
        ("Build Artifacts", check_build_artifacts),
        ("Release Notes", check_release_notes),
        ("Version Consistency", check_version_consistency),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"✗ {name} check failed with error: {e}")
            results.append((name, False))
        print()
    
    # Summary
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    
    all_passed = True
    for name, result in results:
        status = "✓" if result else "✗"
        print(f"{status} {name}")
        if not result:
            all_passed = False
    
    print()
    if all_passed:
        print("✓ All automated checks passed")
        print("⚠ Manual checklist items still need to be verified")
        return 0
    else:
        print("✗ Some checks failed")
        print("  Fix issues before proceeding with release")
        return 1


if __name__ == "__main__":
    sys.exit(main())

