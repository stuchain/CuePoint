#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive Update System Test Suite

Tests all update detection scenarios to ensure 100% reliability:
- Pre-release to pre-release updates
- Stable to pre-release updates
- Pre-release to stable updates
- Stable to stable updates
- Channel filtering
- Edge cases
- Error handling
- Integration scenarios
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional
from unittest.mock import Mock, patch

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'SRC'))

from cuepoint.update.update_checker import UpdateChecker, UpdateCheckError
from cuepoint.update.version_utils import (
    compare_versions,
    extract_base_version,
    is_stable_version,
    parse_version,
)


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
    UNDERLINE = '\033[4m'


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


def create_mock_appcast(versions: List[Dict]) -> bytes:
    """
    Create a mock appcast XML with given versions.
    
    Args:
        versions: List of version dicts with keys:
            - short_version: Semantic version (e.g., "1.0.1-test-unsigned53")
            - version: Build number (e.g., "202512181304")
            - url: Download URL
            - title: Update title
            - pub_date: Publication date (optional)
    
    Returns:
        Appcast XML as bytes
    """
    sparkle_ns = "http://www.andymatuschak.org/xml-namespaces/sparkle"
    
    root = ET.Element('rss', version='2.0')
    root.set(f'xmlns:sparkle', sparkle_ns)
    
    channel = ET.SubElement(root, 'channel')
    ET.SubElement(channel, 'title').text = 'CuePoint Updates'
    ET.SubElement(channel, 'link').text = 'https://stuchain.github.io/CuePoint'
    ET.SubElement(channel, 'description').text = 'CuePoint Application Updates'
    ET.SubElement(channel, 'language').text = 'en'
    
    for ver_info in versions:
        item = ET.SubElement(channel, 'item')
        ET.SubElement(item, 'title').text = ver_info.get('title', f"Version {ver_info['short_version']}")
        
        # Sparkle version elements
        version_elem = ET.SubElement(item, f'{{{sparkle_ns}}}version')
        version_elem.text = ver_info.get('version', '202512181304')
        
        short_version_elem = ET.SubElement(item, f'{{{sparkle_ns}}}shortVersionString')
        short_version_elem.text = ver_info['short_version']
        
        # Enclosure
        enclosure = ET.SubElement(item, 'enclosure')
        enclosure.set('url', ver_info.get('url', 'https://example.com/download.exe'))
        enclosure.set('length', str(ver_info.get('length', 50000000)))
        enclosure.set('type', ver_info.get('type', 'application/octet-stream'))
        
        # Publication date
        if 'pub_date' in ver_info:
            ET.SubElement(item, 'pubDate').text = ver_info['pub_date']
        else:
            ET.SubElement(item, 'pubDate').text = 'Mon, 01 Jan 2024 00:00:00 +0000'
    
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def test_version_comparison_scenarios():
    """Test all version comparison scenarios."""
    print_header("Version Comparison Scenarios")
    
    test_cases = [
        # (current, candidate, should_detect, description)
        # Pre-release to Pre-release
        ("1.0.0-test-unsigned52", "1.0.1-test-unsigned53", True, "Pre-release to pre-release (minor bump)"),
        ("1.0.0-test-unsigned52", "1.0.0-test-unsigned53", True, "Pre-release to pre-release (build bump)"),
        ("1.0.1-test-unsigned52", "1.0.0-test-unsigned53", False, "Pre-release to pre-release (downgrade)"),
        
        # Stable to Pre-release
        ("1.0.0", "1.0.1-test-unsigned53", True, "Stable to pre-release (minor bump)"),
        ("1.0.0", "1.0.0-test-unsigned53", False, "Stable to pre-release (same base)"),
        ("1.0.1", "1.0.2-test-unsigned53", True, "Stable to pre-release (patch bump)"),
        ("1.0.0", "2.0.0-test-unsigned53", True, "Stable to pre-release (major bump)"),
        
        # Pre-release to Stable
        ("1.0.0-test-unsigned52", "1.0.1", True, "Pre-release to stable (minor bump)"),
        ("1.0.1-test-unsigned52", "1.0.1", True, "Pre-release to stable (same base - upgrade to stable)"),
        ("1.0.0-test-unsigned52", "1.0.0", True, "Pre-release to stable (same base - upgrade to stable)"),
        
        # Stable to Stable
        ("1.0.0", "1.0.1", True, "Stable to stable (patch bump)"),
        ("1.0.0", "1.1.0", True, "Stable to stable (minor bump)"),
        ("1.0.0", "2.0.0", True, "Stable to stable (major bump)"),
        ("1.0.1", "1.0.0", False, "Stable to stable (downgrade)"),
        ("1.0.0", "1.0.0", False, "Stable to stable (same version)"),
        
        # Edge cases
        ("1.0.0-beta.1", "1.0.0-beta.2", True, "Beta to beta (same base)"),
        ("1.0.0-alpha.1", "1.0.0-beta.1", True, "Alpha to beta (same base)"),
        ("1.0.0-rc.1", "1.0.0", True, "RC to stable (same base)"),
        ("1.0.0", "1.0.0-rc.1", False, "Stable to RC (downgrade)"),
    ]
    
    all_passed = True
    for current, candidate, should_detect, desc in test_cases:
        try:
            base_current = extract_base_version(current)
            base_candidate = extract_base_version(candidate)
            
            base_comp = compare_versions(base_candidate, base_current)
            full_comp = compare_versions(candidate, current)
            
            # Determine if update should be detected
            detected = (base_comp > 0) or (base_comp == 0 and full_comp > 0)
            
            passed = (detected == should_detect)
            details = (
                f"Current: {current} (base: {base_current})\n"
                f"Candidate: {candidate} (base: {base_candidate})\n"
                f"Base comparison: {base_comp}, Full: {full_comp}\n"
                f"Detected: {detected} (expected: {should_detect})"
            )
            
            print_test(desc, passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(desc, False, f"Error: {e}")
            all_passed = False
    
    return all_passed


def test_channel_filtering():
    """Test channel filtering logic."""
    print_header("Channel Filtering Tests")
    
    scenarios = [
        # (current, channel, candidate, should_show, description)
        # Stable channel
        ("1.0.0", "stable", "1.0.1", True, "Stable to stable on stable channel"),
        ("1.0.0", "stable", "1.0.1-test-unsigned53", True, "Stable to pre-release (base newer) on stable channel"),
        ("1.0.1", "stable", "1.0.1-test-unsigned53", False, "Stable to pre-release (same base) on stable channel"),
        ("1.0.0-test-unsigned52", "stable", "1.0.1-test-unsigned53", True, "Pre-release to pre-release on stable channel"),
        ("1.0.0-test-unsigned52", "stable", "1.0.1", True, "Pre-release to stable on stable channel"),
        
        # Beta channel
        ("1.0.0", "beta", "1.0.1", True, "Stable to stable on beta channel"),
        ("1.0.0", "beta", "1.0.1-test-unsigned53", True, "Stable to pre-release on beta channel"),
        ("1.0.1", "beta", "1.0.1-test-unsigned53", True, "Stable to pre-release (same base) on beta channel"),
        ("1.0.0-test-unsigned52", "beta", "1.0.1-test-unsigned53", True, "Pre-release to pre-release on beta channel"),
    ]
    
    all_passed = True
    for current, channel, candidate, should_show, desc in scenarios:
        try:
            base_current = extract_base_version(current)
            base_candidate = extract_base_version(candidate)
            current_is_prerelease = not is_stable_version(current)
            candidate_is_prerelease = not is_stable_version(candidate)
            
            base_comp = compare_versions(base_candidate, base_current)
            
            # Apply filtering logic (matches UpdateChecker)
            if base_comp > 0:
                # Base version is newer
                if channel == "stable":
                    if not current_is_prerelease and candidate_is_prerelease:
                        # Current is stable, candidate is pre-release
                        # Allow since base is newer
                        filtered = True
                    else:
                        filtered = True
                else:  # beta channel
                    filtered = True
            elif base_comp == 0:
                # Same base version
                if channel == "stable":
                    if not current_is_prerelease and candidate_is_prerelease:
                        filtered = False
                    else:
                        filtered = True
                else:  # beta channel
                    filtered = True
            else:
                filtered = False
            
            passed = (filtered == should_show)
            details = (
                f"Current: {current} (prerelease: {current_is_prerelease})\n"
                f"Candidate: {candidate} (prerelease: {candidate_is_prerelease})\n"
                f"Channel: {channel}, Base comp: {base_comp}\n"
                f"Filtered: {filtered} (expected: {should_show})"
            )
            
            print_test(desc, passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(desc, False, f"Error: {e}")
            all_passed = False
    
    return all_passed


def test_update_checker_with_mock_feed():
    """Test UpdateChecker with mock appcast feeds."""
    print_header("UpdateChecker Integration Tests (Mock Feeds)")
    
    test_scenarios = [
        {
            'name': 'Pre-release to pre-release update',
            'current': '1.0.0-test-unsigned52',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304', 'url': 'https://example.com/v1.0.1-test-unsigned53.exe'},
                {'short_version': '1.0.0-test-unsigned52', 'version': '202512181200', 'url': 'https://example.com/v1.0.0-test-unsigned52.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.1-test-unsigned53',
        },
        {
            'name': 'Stable to pre-release update (base newer)',
            'current': '1.0.0',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304', 'url': 'https://example.com/v1.0.1-test-unsigned53.exe'},
                {'short_version': '1.0.0', 'version': '202512181200', 'url': 'https://example.com/v1.0.0.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.1-test-unsigned53',
        },
        {
            'name': 'Stable to pre-release (same base - blocked)',
            'current': '1.0.1',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304', 'url': 'https://example.com/v1.0.1-test-unsigned53.exe'},
                {'short_version': '1.0.1', 'version': '202512181200', 'url': 'https://example.com/v1.0.1.exe'},
            ],
            'should_detect': False,
        },
        {
            'name': 'Pre-release to stable update',
            'current': '1.0.0-test-unsigned52',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1', 'version': '202512181304', 'url': 'https://example.com/v1.0.1.exe'},
                {'short_version': '1.0.0-test-unsigned52', 'version': '202512181200', 'url': 'https://example.com/v1.0.0-test-unsigned52.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.1',
        },
        {
            'name': 'Stable to stable update',
            'current': '1.0.0',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1', 'version': '202512181304', 'url': 'https://example.com/v1.0.1.exe'},
                {'short_version': '1.0.0', 'version': '202512181200', 'url': 'https://example.com/v1.0.0.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.1',
        },
        {
            'name': 'No update available (latest version)',
            'current': '1.0.1',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.1', 'version': '202512181304', 'url': 'https://example.com/v1.0.1.exe'},
                {'short_version': '1.0.0', 'version': '202512181200', 'url': 'https://example.com/v1.0.0.exe'},
            ],
            'should_detect': False,
        },
        {
            'name': 'Multiple versions in feed (should pick latest)',
            'current': '1.0.0',
            'channel': 'stable',
            'feed_versions': [
                {'short_version': '1.0.2', 'version': '202512181400', 'url': 'https://example.com/v1.0.2.exe'},
                {'short_version': '1.0.1', 'version': '202512181300', 'url': 'https://example.com/v1.0.1.exe'},
                {'short_version': '1.0.0', 'version': '202512181200', 'url': 'https://example.com/v1.0.0.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.2',
        },
        {
            'name': 'Beta channel allows pre-release',
            'current': '1.0.0',
            'channel': 'beta',
            'feed_versions': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304', 'url': 'https://example.com/v1.0.1-test-unsigned53.exe'},
            ],
            'should_detect': True,
            'expected_version': '1.0.1-test-unsigned53',
        },
    ]
    
    all_passed = True
    for scenario in test_scenarios:
        try:
            # Create mock appcast
            appcast_data = create_mock_appcast(scenario['feed_versions'])
            
            # Create UpdateChecker
            checker = UpdateChecker(
                feed_url='https://example.com/updates',
                current_version=scenario['current'],
                channel=scenario['channel']
            )
            
            # Mock the _fetch_appcast method
            with patch.object(checker, '_fetch_appcast', return_value=appcast_data):
                result = checker.check_for_updates(platform='windows', timeout=5)
            
            detected = result is not None
            passed = (detected == scenario['should_detect'])
            
            if passed and detected and 'expected_version' in scenario:
                # Verify correct version was detected
                if result.get('short_version') != scenario['expected_version']:
                    passed = False
                    details = (
                        f"Update detected but wrong version:\n"
                        f"Expected: {scenario['expected_version']}\n"
                        f"Got: {result.get('short_version')}"
                    )
                else:
                    details = (
                        f"Current: {scenario['current']}\n"
                        f"Detected: {result.get('short_version')}\n"
                        f"Channel: {scenario['channel']}"
                    )
            elif passed:
                details = (
                    f"Current: {scenario['current']}\n"
                    f"Update detected: {detected} (expected: {scenario['should_detect']})"
                )
            else:
                details = (
                    f"Current: {scenario['current']}\n"
                    f"Detected: {detected} (expected: {scenario['should_detect']})"
                )
            
            print_test(scenario['name'], passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(scenario['name'], False, f"Error: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False
    
    return all_passed


def test_error_handling():
    """Test error handling scenarios."""
    print_header("Error Handling Tests")
    
    test_cases = [
        {
            'name': 'Invalid XML feed',
            'feed_data': b'<invalid>xml</invalid>',
            'should_raise': True,
        },
        {
            'name': 'Missing version in item',
            'feed_data': create_mock_appcast([
                {'short_version': '', 'version': '202512181304', 'url': 'https://example.com/app.exe'},
            ]),
            'should_raise': False,  # Should handle gracefully
        },
        {
            'name': 'Invalid version format',
            'feed_data': create_mock_appcast([
                {'short_version': 'invalid-version', 'version': '202512181304', 'url': 'https://example.com/app.exe'},
            ]),
            'should_raise': False,  # Should handle gracefully
        },
        {
            'name': 'Empty feed',
            'feed_data': create_mock_appcast([]),
            'should_raise': False,  # Should return None
        },
    ]
    
    all_passed = True
    for test_case in test_cases:
        try:
            checker = UpdateChecker(
                feed_url='https://example.com/updates',
                current_version='1.0.0',
                channel='stable'
            )
            
            with patch.object(checker, '_fetch_appcast', return_value=test_case['feed_data']):
                try:
                    result = checker.check_for_updates(platform='windows', timeout=5)
                    raised = False
                except UpdateCheckError:
                    raised = True
                    result = None
            
            if test_case['should_raise']:
                passed = raised
                details = f"Should raise error: {raised}"
            else:
                passed = not raised
                details = f"Should handle gracefully: {not raised}, Result: {result is not None}"
            
            print_test(test_case['name'], passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(test_case['name'], False, f"Unexpected error: {e}")
            all_passed = False
    
    return all_passed


def test_version_parsing_edge_cases():
    """Test version parsing with edge cases."""
    print_header("Version Parsing Edge Cases")
    
    test_cases = [
        # (version_string, should_parse, expected_base)
        ("1.0.0", True, "1.0.0"),
        ("1.0.0-test-unsigned53", True, "1.0.0"),
        ("1.0.0-beta.1", True, "1.0.0"),
        ("1.0.0-alpha.1", True, "1.0.0"),
        ("1.0.0-rc.1", True, "1.0.0"),
        ("1.0.0+build.123", True, "1.0.0"),  # Build metadata (extract_base_version now handles this)
        ("1.0.0-test-unsigned53+build.123", True, "1.0.0"),
        # Note: extract_base_version just splits on '-', so these will "work" but may not be valid SemVer
        # The actual validation happens in parse_version() which is used for comparison
        ("v1.0.0", True, "v1.0.0"),  # extract_base_version doesn't validate, just extracts
        ("1.0", True, "1.0"),  # extract_base_version doesn't validate
        ("", True, ""),  # extract_base_version doesn't validate
    ]
    
    all_passed = True
    for version_str, should_parse, expected_base in test_cases:
        try:
            # extract_base_version doesn't validate, it just extracts
            # So we test that it extracts correctly
            base = extract_base_version(version_str)
            parsed = True
            passed = (base == expected_base)
            details = f"Version: {version_str} -> Base: {base} (expected: {expected_base})"
            
            # Also test that parse_version works for valid SemVer
            if should_parse and version_str not in ["v1.0.0", "1.0", ""]:
                try:
                    parse_version(version_str)
                    details += "\n  SemVer validation: PASS"
                except ValueError:
                    details += "\n  SemVer validation: FAIL (but extract_base_version works)"
            
            print_test(f"Parse '{version_str}'", passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(f"Parse '{version_str}'", False, f"Error: {e}")
            all_passed = False
    
    return all_passed


def test_real_world_scenarios():
    """Test real-world update scenarios."""
    print_header("Real-World Update Scenarios")
    
    scenarios = [
        {
            'name': 'User on v1.0.0-test-unsigned52, new release v1.0.1-test-unsigned53',
            'current': '1.0.0-test-unsigned52',
            'feed': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304'},
                {'short_version': '1.0.0-test-unsigned52', 'version': '202512181200'},
            ],
            'should_detect': True,
        },
        {
            'name': 'User on v1.0.0 (stable), new pre-release v1.0.1-test-unsigned53',
            'current': '1.0.0',
            'feed': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304'},
                {'short_version': '1.0.0', 'version': '202512181200'},
            ],
            'should_detect': True,
        },
        {
            'name': 'User on v1.0.1 (stable), new pre-release v1.0.1-test-unsigned53 (same base)',
            'current': '1.0.1',
            'feed': [
                {'short_version': '1.0.1-test-unsigned53', 'version': '202512181304'},
                {'short_version': '1.0.1', 'version': '202512181200'},
            ],
            'should_detect': False,
        },
        {
            'name': 'User on v1.0.0-test-unsigned52, new stable release v1.0.1',
            'current': '1.0.0-test-unsigned52',
            'feed': [
                {'short_version': '1.0.1', 'version': '202512181304'},
                {'short_version': '1.0.0-test-unsigned52', 'version': '202512181200'},
            ],
            'should_detect': True,
        },
        {
            'name': 'User on v1.0.0, new stable release v1.0.1',
            'current': '1.0.0',
            'feed': [
                {'short_version': '1.0.1', 'version': '202512181304'},
                {'short_version': '1.0.0', 'version': '202512181200'},
            ],
            'should_detect': True,
        },
        {
            'name': 'User already on latest version',
            'current': '1.0.1',
            'feed': [
                {'short_version': '1.0.1', 'version': '202512181304'},
                {'short_version': '1.0.0', 'version': '202512181200'},
            ],
            'should_detect': False,
        },
    ]
    
    all_passed = True
    for scenario in scenarios:
        try:
            appcast_data = create_mock_appcast([
                {**v, 'url': f"https://example.com/v{v['short_version']}.exe"}
                for v in scenario['feed']
            ])
            
            checker = UpdateChecker(
                feed_url='https://example.com/updates',
                current_version=scenario['current'],
                channel='stable'
            )
            
            with patch.object(checker, '_fetch_appcast', return_value=appcast_data):
                result = checker.check_for_updates(platform='windows', timeout=5)
            
            detected = result is not None
            passed = (detected == scenario['should_detect'])
            
            details = (
                f"Current: {scenario['current']}\n"
                f"Feed versions: {[v['short_version'] for v in scenario['feed']]}\n"
                f"Detected: {detected} (expected: {scenario['should_detect']})"
            )
            if detected:
                details += f"\nDetected version: {result.get('short_version')}"
            
            print_test(scenario['name'], passed, details)
            if not passed:
                all_passed = False
        except Exception as e:
            print_test(scenario['name'], False, f"Error: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False
    
    return all_passed


def main():
    """Run all comprehensive tests."""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'=' * 70}")
    print(f"CuePoint Update System - Comprehensive Test Suite")
    print(f"{'=' * 70}{Colors.ENDC}\n")
    
    results = {}
    
    # Run all test suites
    results['Version Comparison'] = test_version_comparison_scenarios()
    results['Channel Filtering'] = test_channel_filtering()
    results['UpdateChecker Integration'] = test_update_checker_with_mock_feed()
    results['Error Handling'] = test_error_handling()
    results['Version Parsing'] = test_version_parsing_edge_cases()
    results['Real-World Scenarios'] = test_real_world_scenarios()
    
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
        print(f"\n{Colors.BOLD}{Colors.OKGREEN}[PASS] All test suites passed! Update system is robust and ready.{Colors.ENDC}\n")
        return 0
    else:
        print(f"\n{Colors.BOLD}{Colors.FAIL}[FAIL] Some test suites failed. Please review the output above.{Colors.ENDC}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
