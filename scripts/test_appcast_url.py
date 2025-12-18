#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify appcast URLs are accessible and contain correct versions.

This script tests the actual GitHub Pages URLs that the app uses to check for updates.
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Add SRC to path
_script_dir = Path(__file__).resolve().parent
_project_root = _script_dir.parent
_src_dir = _project_root / 'SRC'
sys.path.insert(0, str(_src_dir))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"

# Sparkle namespace
SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"

# Base URL (same as in main_window.py)
BASE_URL = "https://stuchain.github.io/CuePoint/updates"


def fetch_appcast(url: str, timeout: int = 10) -> bytes:
    """
    Fetch appcast XML from URL.
    
    Args:
        url: Appcast URL
        timeout: Request timeout in seconds
        
    Returns:
        Appcast XML as bytes
        
    Raises:
        Exception: If fetch fails
    """
    try:
        request = Request(url)
        request.add_header('User-Agent', 'CuePoint-UpdateChecker/1.0')
        
        with urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise Exception(f"HTTP {response.status}: {response.reason}")
            return response.read()
    except HTTPError as e:
        raise Exception(f"HTTP error {e.code}: {e.reason}")
    except URLError as e:
        raise Exception(f"Network error: {e.reason}")
    except Exception as e:
        raise Exception(f"Unexpected error: {e}")


def parse_appcast(appcast_data: bytes) -> dict:
    """
    Parse appcast XML and extract version information.
    
    Args:
        appcast_data: Appcast XML as bytes
        
    Returns:
        Dictionary with version information
    """
    try:
        root = ET.fromstring(appcast_data)
        channel = root.find('channel')
        if channel is None:
            raise ValueError("Invalid appcast: missing channel")
        
        items = channel.findall('item')
        if not items:
            return {
                'versions': [],
                'latest_version': None,
                'latest_pubdate': None,
                'latest_url': None,
                'item_count': 0
            }
        
        versions = []
        for item in items:
            short_version_elem = item.find(f'.//{{{SPARKLE_NS}}}shortVersionString')
            version_elem = item.find(f'.//{{{SPARKLE_NS}}}version')
            pubdate_elem = item.find('pubDate')
            enclosure = item.find('enclosure')
            
            version_info = {
                'short_version': short_version_elem.text if short_version_elem is not None else None,
                'build_number': version_elem.text if version_elem is not None else None,
                'pubdate': pubdate_elem.text if pubdate_elem is not None else None,
                'download_url': enclosure.get('url') if enclosure is not None else None,
                'file_size': enclosure.get('length') if enclosure is not None else None,
            }
            versions.append(version_info)
        
        # Latest version is the first item (newest first)
        latest = versions[0] if versions else None
        
        return {
            'versions': versions,
            'latest_version': latest['short_version'] if latest else None,
            'latest_build': latest['build_number'] if latest else None,
            'latest_pubdate': latest['pubdate'] if latest else None,
            'latest_url': latest['download_url'] if latest else None,
            'latest_size': latest['file_size'] if latest else None,
            'item_count': len(items)
        }
    except ET.ParseError as e:
        raise ValueError(f"XML parse error: {e}")
    except Exception as e:
        raise ValueError(f"Parse error: {e}")


def test_appcast_url(platform: str, channel: str = "stable") -> dict:
    """
    Test appcast URL for a specific platform and channel.
    
    Args:
        platform: "macos" or "windows"
        channel: "stable" or "beta"
        
    Returns:
        Dictionary with test results
    """
    url = f"{BASE_URL}/{platform}/{channel}/appcast.xml"
    
    print(f"\n{'='*60}")
    print(f"Testing: {platform.upper()} - {channel.upper()}")
    print(f"URL: {url}")
    print(f"{'='*60}")
    
    result = {
        'platform': platform,
        'channel': channel,
        'url': url,
        'accessible': False,
        'error': None,
        'version_info': None
    }
    
    try:
        # Fetch appcast
        print("Fetching appcast...")
        appcast_data = fetch_appcast(url)
        print(f"[OK] Fetched {len(appcast_data)} bytes")
        
        result['accessible'] = True
        
        # Parse appcast
        print("Parsing appcast...")
        version_info = parse_appcast(appcast_data)
        result['version_info'] = version_info
        
        # Display results
        print(f"\nAppcast Information:")
        print(f"  Total versions: {version_info['item_count']}")
        
        if version_info['latest_version']:
            print(f"  Latest version: {version_info['latest_version']}")
            print(f"  Build number: {version_info['latest_build']}")
            print(f"  Publication date: {version_info['latest_pubdate']}")
            print(f"  Download URL: {version_info['latest_url']}")
            if version_info['latest_size']:
                size_mb = int(version_info['latest_size']) / (1024 * 1024)
                print(f"  File size: {size_mb:.2f} MB")
            
            # Show all versions
            if version_info['item_count'] > 1:
                print(f"\n  All versions in appcast:")
                for i, ver_info in enumerate(version_info['versions'], 1):
                    print(f"    {i}. {ver_info['short_version']} (build {ver_info['build_number']})")
        else:
            print("  [WARNING] No versions found in appcast")
        
        print(f"\n[PASS] Test PASSED")
        
    except Exception as e:
        result['error'] = str(e)
        print(f"\n[FAIL] Test FAILED: {e}")
    
    return result


def main():
    """Main function"""
    print("="*60)
    print("Appcast URL Test Suite")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Current app version: {__version__}")
    
    results = []
    
    # Test Windows stable
    results.append(test_appcast_url("windows", "stable"))
    
    # Test macOS stable
    results.append(test_appcast_url("macos", "stable"))
    
    # Summary
    print(f"\n{'='*60}")
    print("Test Summary")
    print(f"{'='*60}")
    
    passed = sum(1 for r in results if r['accessible'] and r['version_info'])
    failed = len(results) - passed
    
    for result in results:
        status = "[PASS]" if result['accessible'] and result['version_info'] else "[FAIL]"
        print(f"{status} - {result['platform']}/{result['channel']}: {result['url']}")
        if result['error']:
            print(f"       Error: {result['error']}")
        elif result['version_info'] and result['version_info']['latest_version']:
            print(f"       Latest version: {result['version_info']['latest_version']}")
    
    print(f"\nTotal: {passed} passed, {failed} failed")
    
    # Compare with current version
    if passed > 0:
        print(f"\n{'='*60}")
        print("Version Comparison")
        print(f"{'='*60}")
        print(f"Current app version: {__version__}")
        
        for result in results:
            if result['version_info'] and result['version_info']['latest_version']:
                latest = result['version_info']['latest_version']
                print(f"{result['platform']}/{result['channel']}: Latest = {latest}")
                if latest == __version__:
                    print(f"  -> Matches current version")
                else:
                    print(f"  -> Different from current version")
    
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
