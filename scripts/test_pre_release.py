#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Pre-Release Testing Script

Comprehensive testing of all recent changes before releasing to GitHub.
Tests version sync, update detection, UI components, and appcast generation.

Usage:
    python scripts/test_pre_release.py [--verbose]
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Tuple


class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class TestResult:
    """Test result container"""
    def __init__(self, name: str, passed: bool, message: str = ""):
        self.name = name
        self.passed = passed
        self.message = message


def print_header(text: str):
    """Print a section header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}\n")


def print_test(name: str, passed: bool, message: str = ""):
    """Print test result"""
    # Use ASCII characters for Windows compatibility
    status = f"{Colors.GREEN}[PASS]{Colors.RESET}" if passed else f"{Colors.RED}[FAIL]{Colors.RESET}"
    print(f"  {status} {name}")
    if message:
        print(f"      {message}")


def run_command(cmd: List[str], cwd: Path = None) -> Tuple[int, str, str]:
    """Run a command and return result"""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30
        )
        return (result.returncode, result.stdout, result.stderr)
    except subprocess.TimeoutExpired:
        return (1, "", "Command timed out")
    except Exception as e:
        return (1, "", str(e))


def test_version_sync_script():
    """Test version sync script"""
    print_header("Testing Version Sync Script")
    results = []
    
    script_path = Path("scripts/sync_version.py")
    if not script_path.exists():
        results.append(TestResult(
            "Version sync script exists",
            False,
            f"Script not found: {script_path}"
        ))
        return results
    
    results.append(TestResult("Version sync script exists", True))
    
    # Test --validate-only
    returncode, stdout, stderr = run_command([
        sys.executable, str(script_path), "--validate-only"
    ])
    
    if returncode == 0:
        results.append(TestResult("Version sync validation works", True))
    else:
        results.append(TestResult(
            "Version sync validation works",
            False,
            f"Validation failed: {stderr}"
        ))
    
    return results


def test_version_consistency():
    """Test version consistency"""
    print_header("Testing Version Consistency")
    results = []
    
    # Check version.py exists
    version_file = Path("SRC/cuepoint/version.py")
    if not version_file.exists():
        results.append(TestResult(
            "version.py exists",
            False,
            "version.py not found"
        ))
        return results
    
    results.append(TestResult("version.py exists", True))
    
    # Read version
    content = version_file.read_text(encoding='utf-8')
    import re
    match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    if match:
        version = match.group(1)
        results.append(TestResult(f"Version in version.py: {version}", True))
        
        # Validate SemVer format
        pattern = r"^\d+\.\d+\.\d+$"
        if re.match(pattern, version):
            results.append(TestResult("Version format is valid SemVer", True))
        else:
            results.append(TestResult(
                "Version format is valid SemVer",
                False,
                f"Version '{version}' is not in SemVer format (X.Y.Z)"
            ))
    else:
        results.append(TestResult(
            "Version found in version.py",
            False,
            "Could not extract version from version.py"
        ))
    
    # Test validate_version.py
    returncode, stdout, stderr = run_command([
        sys.executable, "scripts/validate_version.py"
    ])
    
    if returncode == 0:
        results.append(TestResult("Version validation passes", True))
    else:
        results.append(TestResult(
            "Version validation passes",
            False,
            f"Validation failed: {stderr or stdout}"
        ))
    
    return results


def test_update_checker_logic():
    """Test update checker version comparison logic"""
    print_header("Testing Update Checker Logic")
    results = []
    
    try:
        sys.path.insert(0, str(Path("SRC").resolve()))
        from cuepoint.update.version_utils import (
            compare_versions,
            is_stable_version,
            parse_version
        )
        
        # Test 1: Prerelease to prerelease (should work)
        try:
            result = compare_versions("1.0.1-test-unsigned51", "1.0.0-test-unsigned51")
            if result > 0:
                results.append(TestResult(
                    "Prerelease to prerelease comparison",
                    True,
                    "1.0.1-test-unsigned51 > 1.0.0-test-unsigned51"
                ))
            else:
                results.append(TestResult(
                    "Prerelease to prerelease comparison",
                    False,
                    f"Expected > 0, got {result}"
                ))
        except Exception as e:
            results.append(TestResult(
                "Prerelease to prerelease comparison",
                False,
                f"Error: {e}"
            ))
        
        # Test 2: Stable to prerelease (should be blocked by filter, but comparison should work)
        try:
            result = compare_versions("1.0.1-test-unsigned51", "1.0.0")
            if result > 0:
                results.append(TestResult(
                    "Stable to prerelease comparison",
                    True,
                    "1.0.1-test-unsigned51 > 1.0.0 (comparison works, filter will block)"
                ))
            else:
                results.append(TestResult(
                    "Stable to prerelease comparison",
                    False,
                    f"Expected > 0, got {result}"
                ))
        except Exception as e:
            results.append(TestResult(
                "Stable to prerelease comparison",
                False,
                f"Error: {e}"
            ))
        
        # Test 3: is_stable_version
        try:
            stable = is_stable_version("1.0.1")
            prerelease = not is_stable_version("1.0.1-test-unsigned51")
            if stable and prerelease:
                results.append(TestResult("is_stable_version detection", True))
            else:
                results.append(TestResult(
                    "is_stable_version detection",
                    False,
                    f"stable('1.0.1')={stable}, prerelease('1.0.1-test')={not prerelease}"
                ))
        except Exception as e:
            results.append(TestResult(
                "is_stable_version detection",
                False,
                f"Error: {e}"
            ))
        
    except ImportError as e:
        results.append(TestResult(
            "Import update modules",
            False,
            f"Could not import update modules: {e}"
        ))
    
    return results


def test_about_dialog_logo():
    """Test About dialog logo loading"""
    print_header("Testing About Dialog Logo Loading")
    results = []
    
    try:
        sys.path.insert(0, str(Path("SRC").resolve()))
        from cuepoint.ui.widgets.dialogs import AboutDialog
        
        # Check if _load_logo method exists
        if hasattr(AboutDialog, '_load_logo'):
            results.append(TestResult("AboutDialog has _load_logo method", True))
            
            # Try to instantiate (without showing)
            try:
                dialog = AboutDialog()
                results.append(TestResult("AboutDialog can be instantiated", True))
                
                # Try to call _load_logo
                try:
                    logo = dialog._load_logo()
                    if logo is not None:
                        results.append(TestResult("Logo loads successfully", True))
                    else:
                        results.append(TestResult(
                            "Logo loads successfully",
                            False,
                            "_load_logo returned None (logo file may be missing)"
                        ))
                except Exception as e:
                    results.append(TestResult(
                        "_load_logo method works",
                        False,
                        f"Error calling _load_logo: {e}"
                    ))
            except Exception as e:
                results.append(TestResult(
                    "AboutDialog can be instantiated",
                    False,
                    f"Error: {e}"
                ))
        else:
            results.append(TestResult(
                "AboutDialog has _load_logo method",
                False,
                "Method _load_logo not found"
            ))
    except ImportError as e:
        results.append(TestResult(
            "Import AboutDialog",
            False,
            f"Could not import AboutDialog: {e}"
        ))
    
    return results


def test_rekordbox_dialog():
    """Test Rekordbox instructions dialog"""
    print_header("Testing Rekordbox Instructions Dialog")
    results = []
    
    try:
        sys.path.insert(0, str(Path("SRC").resolve()))
        from cuepoint.ui.dialogs.rekordbox_instructions_dialog import RekordboxInstructionsDialog
        
        # Check window size
        try:
            dialog = RekordboxInstructionsDialog()
            min_size = dialog.minimumSize()
            if min_size.width() >= 900:
                results.append(TestResult(
                    "Dialog minimum width >= 900px",
                    True,
                    f"Width: {min_size.width()}px"
                ))
            else:
                results.append(TestResult(
                    "Dialog minimum width >= 900px",
                    False,
                    f"Width: {min_size.width()}px (expected >= 900)"
                ))
        except Exception as e:
            results.append(TestResult(
                "Dialog can be instantiated",
                False,
                f"Error: {e}"
            ))
    except ImportError as e:
        results.append(TestResult(
            "Import RekordboxInstructionsDialog",
            False,
            f"Could not import: {e}"
        ))
    
    return results


def test_appcast_generation():
    """Test appcast generation scripts"""
    print_header("Testing Appcast Generation")
    results = []
    
    # Check scripts exist
    scripts = [
        "scripts/generate_appcast.py",
        "scripts/generate_update_feed.py",
        "scripts/validate_feeds.py"
    ]
    
    for script in scripts:
        script_path = Path(script)
        if script_path.exists():
            results.append(TestResult(f"{script} exists", True))
        else:
            results.append(TestResult(
                f"{script} exists",
                False,
                f"Script not found: {script_path}"
            ))
    
    # Test validate_feeds.py help (should work without files)
    returncode, stdout, stderr = run_command([
        sys.executable, "scripts/validate_feeds.py", "--help"
    ])
    
    if returncode == 0:
        results.append(TestResult("validate_feeds.py script works", True))
    else:
        results.append(TestResult(
            "validate_feeds.py script works",
            False,
            f"Help command failed: {stderr}"
        ))
    
    return results


def test_publish_feeds_script():
    """Test publish_feeds script"""
    print_header("Testing Publish Feeds Script")
    results = []
    
    script_path = Path("scripts/publish_feeds.py")
    if not script_path.exists():
        results.append(TestResult(
            "publish_feeds.py exists",
            False,
            "Script not found"
        ))
        return results
    
    results.append(TestResult("publish_feeds.py exists", True))
    
    # Check for stash logic
    content = script_path.read_text()
    if "git stash" in content or "stash" in content.lower():
        results.append(TestResult("Stash logic present in publish_feeds.py", True))
    else:
        results.append(TestResult(
            "Stash logic present in publish_feeds.py",
            False,
            "Stash logic not found (needed to handle uncommitted changes)"
        ))
    
    # Check for fetch logic
    if "git fetch" in content or "Fetching latest" in content:
        results.append(TestResult("Fetch logic present in publish_feeds.py", True))
    else:
        results.append(TestResult(
            "Fetch logic present in publish_feeds.py",
            False,
            "Fetch logic not found (needed for concurrent updates)"
        ))
    
    return results


def test_workflow_files():
    """Test GitHub Actions workflow files"""
    print_header("Testing GitHub Actions Workflows")
    results = []
    
    workflows = [
        ".github/workflows/build-macos.yml",
        ".github/workflows/build-windows.yml",
        ".github/workflows/release.yml"
    ]
    
    for workflow in workflows:
        workflow_path = Path(workflow)
        if not workflow_path.exists():
            results.append(TestResult(
                f"{workflow} exists",
                False,
                "Workflow not found"
            ))
            continue
        
        results.append(TestResult(f"{workflow} exists", True))
        
        # Check for version sync step
        content = workflow_path.read_text(encoding='utf-8')
        if "sync_version" in content or "Sync version" in content:
            results.append(TestResult(
                f"{workflow} has version sync step",
                True
            ))
        else:
            results.append(TestResult(
                f"{workflow} has version sync step",
                False,
                "Version sync step not found"
            ))
    
    return results


def test_gui_app_version():
    """Test that gui_app.py uses version from version.py"""
    print_header("Testing GUI App Version Usage")
    results = []
    
    gui_app_path = Path("SRC/gui_app.py")
    if not gui_app_path.exists():
        results.append(TestResult("gui_app.py exists", False))
        return results
    
    results.append(TestResult("gui_app.py exists", True))
    
    content = gui_app_path.read_text(encoding='utf-8')
    
    # Check for hardcoded version
    if '"1.0.0"' in content or "'1.0.0'" in content:
        # Check if it's in a comment or string literal that's not the actual version
        if 'setApplicationVersion("1.0.0")' in content:
            results.append(TestResult(
                "No hardcoded version in setApplicationVersion",
                False,
                "Found hardcoded '1.0.0' in setApplicationVersion"
            ))
        else:
            results.append(TestResult("No hardcoded version in setApplicationVersion", True))
    else:
        results.append(TestResult("No hardcoded version in setApplicationVersion", True))
    
    # Check for get_version() usage
    if "get_version()" in content:
        results.append(TestResult("Uses get_version() from version.py", True))
    else:
        results.append(TestResult(
            "Uses get_version() from version.py",
            False,
            "Not using get_version() - may be using hardcoded version"
        ))
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Comprehensive pre-release testing"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show verbose output"
    )
    parser.add_argument(
        "--skip-ui",
        action="store_true",
        help="Skip UI component tests (requires GUI)"
    )
    
    args = parser.parse_args()
    
    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("=" * 60)
    print("CuePoint Pre-Release Testing")
    print("=" * 60)
    print(f"{Colors.RESET}")
    
    all_results: List[TestResult] = []
    
    # Run all tests
    all_results.extend(test_version_sync_script())
    all_results.extend(test_version_consistency())
    all_results.extend(test_update_checker_logic())
    all_results.extend(test_appcast_generation())
    all_results.extend(test_publish_feeds_script())
    all_results.extend(test_workflow_files())
    all_results.extend(test_gui_app_version())
    
    if not args.skip_ui:
        all_results.extend(test_about_dialog_logo())
        all_results.extend(test_rekordbox_dialog())
    
    # Summary
    print_header("Test Summary")
    
    passed = sum(1 for r in all_results if r.passed)
    failed = sum(1 for r in all_results if not r.passed)
    total = len(all_results)
    
    print(f"\n{Colors.BOLD}Total Tests: {total}{Colors.RESET}")
    print(f"{Colors.GREEN}Passed: {passed}{Colors.RESET}")
    print(f"{Colors.RED}Failed: {failed}{Colors.RESET}")
    
    if failed > 0:
        print(f"\n{Colors.RED}{Colors.BOLD}Failed Tests:{Colors.RESET}")
        for result in all_results:
            if not result.passed:
                print(f"  {Colors.RED}[FAIL]{Colors.RESET} {result.name}")
                if result.message:
                    print(f"      {result.message}")
    
    print()
    
    if failed == 0:
        print(f"{Colors.GREEN}{Colors.BOLD}[PASS] All tests passed! Ready for release.{Colors.RESET}\n")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}[FAIL] Some tests failed. Please fix before releasing.{Colors.RESET}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
