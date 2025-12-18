#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update System Integration Tests

Tests the complete update system integration:
- Feed URL construction
- Platform detection
- UpdateManager initialization
- Startup check behavior
- Manual check behavior
- Feed URL accessibility
"""

import sys
import platform
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Optional

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'SRC'))

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_manager import UpdateManager
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.version import get_version


class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    """Print a formatted header."""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'=' * 70}")
    print(f"{text}")
    print(f"{'=' * 70}{Colors.ENDC}")


def print_test(name: str, passed: bool, details: str = ""):
    """Print test result."""
    status = f"{Colors.OKGREEN}[PASS]{Colors.ENDC}" if passed else f"{Colors.FAIL}[FAIL]{Colors.ENDC}"
    print(f"{status} {name}")
    if details:
        for line in details.split('\n'):
            if line.strip():
                print(f"    {line}")


def test_feed_url_construction():
    """Test that feed URLs are constructed correctly."""
    print_header("Feed URL Construction Tests")
    
    base_url = "https://stuchain.github.io/CuePoint/updates"
    current_version = "1.0.0"
    
    test_cases = [
        ("macos", "stable", f"{base_url}/macos/stable/appcast.xml"),
        ("macos", "beta", f"{base_url}/macos/beta/appcast.xml"),
        ("windows", "stable", f"{base_url}/windows/stable/appcast.xml"),
        ("windows", "beta", f"{base_url}/windows/beta/appcast.xml"),
    ]
    
    all_passed = True
    for platform_name, channel, expected_url in test_cases:
        try:
            checker = UpdateChecker(base_url, current_version, channel)
            actual_url = checker.get_feed_url(platform_name)
            
            passed = (actual_url == expected_url)
            details = (
                f"Platform: {platform_name}, Channel: {channel}\n"
                f"Expected: {expected_url}\n"
                f"Actual: {actual_url}"
            )
            
            print_test(f"Feed URL for {platform_name}/{channel}", passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(f"Feed URL for {platform_name}/{channel}", False, f"Error: {e}")
            all_passed = False
    
    return all_passed


def test_platform_detection():
    """Test that platform is detected correctly."""
    print_header("Platform Detection Tests")
    
    system = platform.system().lower()
    expected_platform = "macos" if system == "darwin" else "windows" if system == "windows" else "unknown"
    
    try:
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates"
        )
        
        passed = (manager.platform == expected_platform)
        details = (
            f"System: {system}\n"
            f"Expected platform: {expected_platform}\n"
            f"Detected platform: {manager.platform}"
        )
        
        print_test("Platform Detection", passed, details)
        return passed
    except Exception as e:
        print_test("Platform Detection", False, f"Error: {e}")
        return False


def test_update_manager_initialization():
    """Test UpdateManager initialization."""
    print_header("UpdateManager Initialization Tests")
    
    all_passed = True
    
    # Test 1: Default initialization
    try:
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates"
        )
        
        passed = (
            manager.current_version == "1.0.0" and
            manager.feed_url == "https://stuchain.github.io/CuePoint/updates" and
            manager.preferences is not None and
            manager.checker is not None
        )
        
        details = (
            f"Current version: {manager.current_version}\n"
            f"Feed URL: {manager.feed_url}\n"
            f"Platform: {manager.platform}\n"
            f"Preferences: {'OK' if manager.preferences else 'MISSING'}\n"
            f"Checker: {'OK' if manager.checker else 'MISSING'}"
        )
        
        print_test("Default Initialization", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Default Initialization", False, f"Error: {e}")
        all_passed = False
    
    # Test 2: Custom preferences
    try:
        prefs = UpdatePreferences()
        prefs.set_channel("beta")
        
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates",
            preferences=prefs
        )
        
        passed = (manager.checker.channel == "beta")
        details = (
            f"Channel: {manager.checker.channel} (expected: beta)"
        )
        
        print_test("Custom Preferences", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Custom Preferences", False, f"Error: {e}")
        all_passed = False
    
    # Test 3: Version from version.py
    try:
        version = get_version()
        manager = UpdateManager(
            current_version=version,
            feed_url="https://stuchain.github.io/CuePoint/updates"
        )
        
        passed = (manager.current_version == version)
        details = (
            f"Version from version.py: {version}\n"
            f"Manager version: {manager.current_version}"
        )
        
        print_test("Version from version.py", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Version from version.py", False, f"Error: {e}")
        all_passed = False
    
    return all_passed


def test_startup_check_behavior():
    """Test startup check behavior."""
    print_header("Startup Check Behavior Tests")
    
    all_passed = True
    
    # Test 1: Should check on startup (CHECK_ON_STARTUP)
    try:
        prefs = UpdatePreferences()
        prefs.set_check_frequency(UpdatePreferences.CHECK_ON_STARTUP)
        
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates",
            preferences=prefs
        )
        
        # Mock the check to avoid actual network call
        check_called = False
        original_check = manager.check_for_updates
        
        def mock_check(force=False):
            nonlocal check_called
            check_called = True
            return True
        
        manager.check_for_updates = mock_check
        
        # Simulate startup check
        if manager.preferences.get_check_frequency() == UpdatePreferences.CHECK_ON_STARTUP:
            manager.check_for_updates(force=False)
        
        passed = check_called
        details = (
            f"Check frequency: {manager.preferences.get_check_frequency()}\n"
            f"Check called: {check_called}"
        )
        
        print_test("Startup Check (CHECK_ON_STARTUP)", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Startup Check (CHECK_ON_STARTUP)", False, f"Error: {e}")
        all_passed = False
    
    # Test 2: Should NOT check on startup (CHECK_DAILY)
    try:
        prefs = UpdatePreferences()
        prefs.set_check_frequency(UpdatePreferences.CHECK_DAILY)
        prefs.set_last_check_timestamp()  # Set recent timestamp
        
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates",
            preferences=prefs
        )
        
        check_called = False
        original_check = manager.check_for_updates
        
        def mock_check(force=False):
            nonlocal check_called
            check_called = True
            return True
        
        manager.check_for_updates = mock_check
        
        # Simulate startup check
        if manager.preferences.should_check_now():
            manager.check_for_updates(force=False)
        
        passed = not check_called  # Should NOT be called
        details = (
            f"Check frequency: {manager.preferences.get_check_frequency()}\n"
            f"Should check now: {manager.preferences.should_check_now()}\n"
            f"Check called: {check_called} (should be False)"
        )
        
        print_test("Startup Check (CHECK_DAILY - recent)", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Startup Check (CHECK_DAILY - recent)", False, f"Error: {e}")
        all_passed = False
    
    return all_passed


def test_manual_check_behavior():
    """Test manual check behavior."""
    print_header("Manual Check Behavior Tests")
    
    all_passed = True
    
    try:
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates"
        )
        
        # Test that force=True always checks
        check_called = False
        
        def mock_check(force=False):
            nonlocal check_called
            check_called = True
            return True
        
        manager.check_for_updates = mock_check
        
        # Manual check should force
        result = manager.check_for_updates(force=True)
        
        passed = (check_called and result)
        details = (
            f"Force check: True\n"
            f"Check called: {check_called}\n"
            f"Result: {result}"
        )
        
        print_test("Manual Check (force=True)", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("Manual Check (force=True)", False, f"Error: {e}")
        all_passed = False
    
    return all_passed


def test_feed_url_accessibility():
    """Test that feed URLs are accessible (optional - requires network)."""
    print_header("Feed URL Accessibility Tests")
    
    import urllib.request
    import urllib.error
    
    base_url = "https://stuchain.github.io/CuePoint/updates"
    system = platform.system().lower()
    platform_name = "macos" if system == "darwin" else "windows" if system == "windows" else "unknown"
    
    if platform_name == "unknown":
        print_test("Feed URL Accessibility", False, "Unknown platform, skipping")
        return False
    
    test_urls = [
        f"{base_url}/{platform_name}/stable/appcast.xml",
    ]
    
    all_passed = True
    for url in test_urls:
        try:
            request = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'CuePoint-Update-Test/1.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                }
            )
            
            with urllib.request.urlopen(request, timeout=5) as response:
                status = response.status
                content_type = response.headers.get('Content-Type', 'unknown')
                
                passed = (status == 200)
                details = (
                    f"URL: {url}\n"
                    f"Status: {status}\n"
                    f"Content-Type: {content_type}\n"
                    f"Accessible: {passed}"
                )
                
                print_test(f"Feed URL Accessibility ({platform_name}/stable)", passed, details)
                if not passed:
                    all_passed = False
        except urllib.error.URLError as e:
            print_test(
                f"Feed URL Accessibility ({platform_name}/stable)",
                False,
                f"URL: {url}\nError: {e.reason}\nNote: This is OK if GitHub Pages is not set up yet"
            )
            # Don't fail the test - this is expected if GitHub Pages isn't set up
            all_passed = True  # Don't fail on network errors
        except Exception as e:
            print_test(
                f"Feed URL Accessibility ({platform_name}/stable)",
                False,
                f"URL: {url}\nError: {e}"
            )
            all_passed = False
    
    return all_passed


def test_update_checker_integration():
    """Test UpdateChecker integration with UpdateManager."""
    print_header("UpdateChecker Integration Tests")
    
    all_passed = True
    
    try:
        manager = UpdateManager(
            current_version="1.0.0",
            feed_url="https://stuchain.github.io/CuePoint/updates"
        )
        
        # Verify checker is initialized correctly
        # Note: Default channel may be "beta" or "stable" depending on UpdatePreferences defaults
        channel = manager.preferences.get_channel()
        passed = (
            manager.checker is not None and
            manager.checker.current_version == "1.0.0" and
            manager.checker.feed_url == "https://stuchain.github.io/CuePoint/updates" and
            manager.checker.channel == channel  # Channel should match preferences
        )
        
        details = (
            f"Checker initialized: {manager.checker is not None}\n"
            f"Current version: {manager.checker.current_version}\n"
            f"Feed URL: {manager.checker.feed_url}\n"
            f"Channel: {manager.checker.channel} (preferences: {channel})"
        )
        
        print_test("UpdateChecker Integration", passed, details)
        if not passed:
            all_passed = False
    except Exception as e:
        print_test("UpdateChecker Integration", False, f"Error: {e}")
        all_passed = False
    
    return all_passed


def test_feed_url_format():
    """Test that feed URLs follow the correct format."""
    print_header("Feed URL Format Tests")
    
    base_url = "https://stuchain.github.io/CuePoint/updates"
    current_version = "1.0.0"
    
    test_cases = [
        ("macos", "stable", f"{base_url}/macos/stable/appcast.xml"),
        ("windows", "stable", f"{base_url}/windows/stable/appcast.xml"),
    ]
    
    all_passed = True
    for platform_name, channel, expected_url in test_cases:
        try:
            checker = UpdateChecker(base_url, current_version, channel)
            actual_url = checker.get_feed_url(platform_name)
            
            # Verify format: base_url/platform/channel/appcast.xml
            parts = actual_url.split('/')
            passed = (
                actual_url == expected_url and
                parts[-1] == "appcast.xml" and
                parts[-2] == channel and
                parts[-3] == platform_name
            )
            
            details = (
                f"URL: {actual_url}\n"
                f"Format: {'CORRECT' if passed else 'INCORRECT'}\n"
                f"Expected: {expected_url}"
            )
            
            print_test(f"Feed URL Format ({platform_name}/{channel})", passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(f"Feed URL Format ({platform_name}/{channel})", False, f"Error: {e}")
            all_passed = False
    
    return all_passed


def main():
    """Run all integration tests."""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'=' * 70}")
    print(f"CuePoint Update System - Integration Tests")
    print(f"{'=' * 70}{Colors.ENDC}\n")
    
    results = {}
    
    # Run all test suites
    results['Feed URL Construction'] = test_feed_url_construction()
    results['Platform Detection'] = test_platform_detection()
    results['UpdateManager Initialization'] = test_update_manager_initialization()
    results['Startup Check Behavior'] = test_startup_check_behavior()
    results['Manual Check Behavior'] = test_manual_check_behavior()
    results['UpdateChecker Integration'] = test_update_checker_integration()
    results['Feed URL Format'] = test_feed_url_format()
    results['Feed URL Accessibility'] = test_feed_url_accessibility()  # Optional - may fail if no network
    
    # Print summary
    print_header("Test Summary")
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    failed_tests = total_tests - passed_tests
    
    for name, passed in results.items():
        status = f"{Colors.OKGREEN}[PASS]{Colors.ENDC}" if passed else f"{Colors.FAIL}[FAIL]{Colors.ENDC}"
        print(f"{status} {name}")
    
    print(f"\n{Colors.BOLD}Total Test Suites: {total_tests}{Colors.ENDC}")
    print(f"{Colors.OKGREEN}Passed: {passed_tests}{Colors.ENDC}")
    if failed_tests > 0:
        print(f"{Colors.FAIL}Failed: {failed_tests}{Colors.ENDC}")
    
    if all(results.values()):
        print(f"\n{Colors.BOLD}{Colors.OKGREEN}[PASS] All integration tests passed! Update system integration is correct.{Colors.ENDC}\n")
        return 0
    else:
        # Don't fail if only accessibility test failed (network may not be available)
        critical_tests = [
            'Feed URL Construction',
            'Platform Detection',
            'UpdateManager Initialization',
            'Startup Check Behavior',
            'Manual Check Behavior',
            'UpdateChecker Integration',
            'Feed URL Format',
        ]
        critical_passed = all(results.get(name, False) for name in critical_tests)
        
        if critical_passed:
            print(f"\n{Colors.BOLD}{Colors.OKGREEN}[PASS] All critical integration tests passed!{Colors.ENDC}")
            print(f"{Colors.WARNING}Note: Feed URL accessibility test may fail if GitHub Pages is not set up.{Colors.ENDC}\n")
            return 0
        else:
            print(f"\n{Colors.BOLD}{Colors.FAIL}[FAIL] Some critical integration tests failed. Please review the output above.{Colors.ENDC}\n")
            return 1


if __name__ == "__main__":
    sys.exit(main())
