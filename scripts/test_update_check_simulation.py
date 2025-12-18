#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simulate the update check to see why updates aren't being detected.
"""

import sys
from pathlib import Path

# Add SRC to path
_script_dir = Path(__file__).resolve().parent
_project_root = _script_dir.parent
_src_dir = _project_root / 'SRC'
sys.path.insert(0, str(_src_dir))

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.version import get_version

def main():
    """Simulate update check"""
    print("="*60)
    print("Update Check Simulation")
    print("="*60)
    
    # Test with the actual scenario: 1.0.0-test2 -> 1.0.1-test9
    current_version = "1.0.0-test2"  # Simulate the user's installed version
    print(f"Current app version (simulated): {current_version}")
    print(f"Actual version.py: {get_version()}")
    
    feed_url = "https://stuchain.github.io/CuePoint/updates"
    platform = "windows"  # or "macos"
    channel = "stable"
    
    print(f"Feed URL base: {feed_url}")
    print(f"Platform: {platform}")
    print(f"Channel: {channel}")
    
    checker = UpdateChecker(feed_url, current_version, channel)
    full_url = checker.get_feed_url(platform)
    print(f"Full feed URL: {full_url}")
    
    print("\nChecking for updates...")
    try:
        update_info = checker.check_for_updates(platform, timeout=10)
        
        if update_info:
            print(f"\n[UPDATE AVAILABLE]")
            print(f"  Version: {update_info.get('short_version')}")
            print(f"  Build: {update_info.get('version')}")
            print(f"  Download URL: {update_info.get('download_url')}")
            print(f"  Release notes: {update_info.get('release_notes_url')}")
        else:
            print(f"\n[NO UPDATE]")
            print(f"  Current version {current_version} is the latest or newer")
    except Exception as e:
        print(f"\n[ERROR]")
        print(f"  {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
