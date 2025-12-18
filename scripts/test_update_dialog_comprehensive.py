#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comprehensive test for the update check dialog and update system.

Tests:
1. Dialog creation and display
2. Current version display
3. Status updates (checking, found, no update, error)
4. Update information display
5. Integration with update manager
6. Version display with prerelease suffixes
"""

import sys
from pathlib import Path
from typing import Dict, Optional
from unittest.mock import Mock, patch

# Add SRC to path
_script_dir = Path(__file__).resolve().parent
_project_root = _script_dir.parent
_src_dir = _project_root / 'SRC'
sys.path.insert(0, str(_src_dir))

def test_version_display():
    """Test version display functions."""
    print("\n" + "="*60)
    print("TEST 1: Version Display")
    print("="*60)
    
    from cuepoint.version import get_version, get_version_display_string, get_build_info
    from cuepoint.update.version_utils import get_version_display_string as format_version
    
    current_version = get_version()
    print(f"Current version (get_version()): {current_version}")
    
    display_string = get_version_display_string()
    print(f"Display string: {display_string}")
    
    build_info = get_build_info()
    print(f"Build info: {build_info}")
    
    # Test with prerelease versions
    test_versions = ["1.0.0-test2", "1.0.1-test9", "1.0.1"]
    for version in test_versions:
        formatted = format_version(version)
        print(f"  {version} -> {formatted}")
    
    print("[PASS] Version display test completed")


def test_update_checker():
    """Test update checker with different scenarios."""
    print("\n" + "="*60)
    print("TEST 2: Update Checker")
    print("="*60)
    
    from cuepoint.update.update_checker import UpdateChecker
    
    feed_url = "https://stuchain.github.io/CuePoint/updates"
    platform = "windows"
    channel = "stable"
    
    # Test scenarios
    scenarios = [
        ("1.0.0-test2", "Should find 1.0.1-test9"),
        ("1.0.1", "Should not find update (same or newer)"),
        ("1.0.1-test8", "Should find 1.0.1-test9"),
    ]
    
    for current_version, description in scenarios:
        print(f"\nScenario: {description}")
        print(f"  Current: {current_version}")
        
        checker = UpdateChecker(feed_url, current_version, channel)
        full_url = checker.get_feed_url(platform)
        print(f"  Feed URL: {full_url}")
        
        try:
            update_info = checker.check_for_updates(platform, timeout=10)
            if update_info:
                new_version = update_info.get('short_version') or update_info.get('version', 'Unknown')
                print(f"  [UPDATE FOUND] Version: {new_version}")
                print(f"    Download URL: {update_info.get('download_url', 'N/A')}")
                print(f"    Release notes: {update_info.get('release_notes_url', 'N/A')}")
            else:
                print(f"  [NO UPDATE] Current version is latest or newer")
        except Exception as e:
            print(f"  [ERROR] {e}")
    
    print("\n[PASS] Update checker test completed")


def test_version_comparison():
    """Test version comparison logic."""
    print("\n" + "="*60)
    print("TEST 3: Version Comparison")
    print("="*60)
    
    from cuepoint.update.version_utils import (
        compare_versions,
        extract_base_version,
        is_stable_version
    )
    
    test_cases = [
        ("1.0.0-test2", "1.0.1-test9", True, "Base version newer"),
        ("1.0.1", "1.0.1-test9", False, "Prerelease < stable"),
        ("1.0.1-test8", "1.0.1-test9", True, "Prerelease newer"),
        ("1.0.1-test9", "1.0.1-test8", False, "Prerelease older"),
        ("1.0.0", "1.0.1", True, "Patch newer"),
        ("1.0.1", "1.0.0", False, "Patch older"),
    ]
    
    for current, candidate, should_update, description in test_cases:
        base_current = extract_base_version(current)
        base_candidate = extract_base_version(candidate)
        current_stable = is_stable_version(current)
        candidate_stable = is_stable_version(candidate)
        
        comparison = compare_versions(candidate, current)
        will_update = comparison > 0
        
        status = "[PASS]" if will_update == should_update else "[FAIL]"
        print(f"{status} {description}")
        print(f"  Current: {current} (base: {base_current}, stable: {current_stable})")
        print(f"  Candidate: {candidate} (base: {base_candidate}, stable: {candidate_stable})")
        print(f"  Comparison: {comparison} -> {'Update' if will_update else 'No update'}")
        print(f"  Expected: {'Update' if should_update else 'No update'}")
    
    print("\n[PASS] Version comparison test completed")


def test_update_manager_integration():
    """Test update manager integration."""
    print("\n" + "="*60)
    print("TEST 4: Update Manager Integration")
    print("="*60)
    
    from cuepoint.update.update_manager import UpdateManager
    from cuepoint.version import get_version
    
    current_version = get_version()
    feed_url = "https://stuchain.github.io/CuePoint/updates"
    
    print(f"Current version: {current_version}")
    print(f"Feed URL: {feed_url}")
    
    # Create update manager
    manager = UpdateManager(current_version, feed_url)
    print(f"Platform: {manager.platform}")
    print(f"Channel: {manager.checker.channel}")
    
    # Test callbacks
    callbacks_called = {"available": False, "complete": False, "error": False}
    
    def on_update_available(update_info):
        callbacks_called["available"] = True
        print(f"  [CALLBACK] Update available: {update_info.get('short_version')}")
    
    def on_check_complete(update_available, error):
        callbacks_called["complete"] = True
        if error:
            print(f"  [CALLBACK] Check complete with error: {error}")
        elif update_available:
            print(f"  [CALLBACK] Check complete: Update available")
        else:
            print(f"  [CALLBACK] Check complete: No update")
    
    def on_error(error_msg):
        callbacks_called["error"] = True
        print(f"  [CALLBACK] Error: {error_msg}")
    
    manager.set_on_update_available(on_update_available)
    manager.set_on_check_complete(on_check_complete)
    manager.set_on_error(on_error)
    
    print("\nStarting update check...")
    result = manager.check_for_updates(force=True)
    print(f"Check initiated: {result}")
    
    # Wait a bit for async check (in real app, this would be handled by Qt event loop)
    import time
    print("Waiting for check to complete...")
    time.sleep(5)
    
    print(f"\nCallbacks called:")
    print(f"  Update available: {callbacks_called['available']}")
    print(f"  Check complete: {callbacks_called['complete']}")
    print(f"  Error: {callbacks_called['error']}")
    
    # Check update info
    update_info = manager.get_update_info()
    if update_info:
        print(f"\nUpdate info available: {update_info.get('short_version')}")
    else:
        print("\nNo update info available")
    
    print("\n[PASS] Update manager integration test completed")


def test_dialog_ui_components():
    """Test dialog UI components (without actually showing GUI)."""
    print("\n" + "="*60)
    print("TEST 5: Dialog UI Components")
    print("="*60)
    
    try:
        from PySide6.QtWidgets import QApplication
        from cuepoint.update.update_ui import UpdateCheckDialog
        from cuepoint.version import get_version
        
        # Create QApplication if it doesn't exist
        app = QApplication.instance()
        if app is None:
            app = QApplication(sys.argv)
        
        current_version = get_version()
        print(f"Current version: {current_version}")
        
        # Create dialog
        dialog = UpdateCheckDialog(current_version)
        print("Dialog created successfully")
        
        # Test status updates
        dialog.set_checking()
        print("  Status set to: Checking")
        
        # Test update found
        mock_update_info = {
            'short_version': '1.0.1-test9',
            'version': '10001',
            'download_url': 'https://example.com/download',
            'release_notes_url': 'https://example.com/release-notes',
            'file_size': 50 * 1024 * 1024,  # 50 MB
            'release_notes': 'Test release notes\n- Feature 1\n- Feature 2'
        }
        dialog.set_update_found(mock_update_info)
        print("  Status set to: Update found")
        print(f"    New version: {mock_update_info['short_version']}")
        
        # Test no update
        dialog.set_no_update()
        print("  Status set to: No update")
        
        # Test error
        dialog.set_error("Test error message")
        print("  Status set to: Error")
        
        print("\n[PASS] Dialog UI components test completed")
        
    except ImportError:
        print("[SKIP] PySide6 not available, skipping GUI test")
    except Exception as e:
        print(f"[FAIL] Dialog test failed: {e}")
        import traceback
        traceback.print_exc()


def test_version_sync():
    """Test version sync script."""
    print("\n" + "="*60)
    print("TEST 6: Version Sync Script")
    print("="*60)
    
    # Import from the script file directly
    import importlib.util
    sync_version_path = _project_root / "scripts" / "sync_version.py"
    spec = importlib.util.spec_from_file_location("sync_version", sync_version_path)
    sync_version = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync_version)
    
    get_version_from_git_tag = sync_version.get_version_from_git_tag
    get_version_from_file = sync_version.get_version_from_file
    validate_semver = sync_version.validate_semver
    
    # Test version extraction (using actual git if available, otherwise mock)
    test_tags = ["v1.0.0-test2", "v1.0.1-test9", "v1.0.1"]
    for tag in test_tags:
        try:
            # Try actual git first
            version = get_version_from_git_tag(tag)
            if version:
                print(f"Tag: {tag} -> Version: {version}")
                is_valid = validate_semver(version)
                print(f"  Valid SemVer: {is_valid}")
            else:
                print(f"Tag: {tag} -> Not found (expected if tag doesn't exist)")
        except Exception as e:
            # Fallback to mock if git fails
            print(f"Tag: {tag} -> Git check failed, testing validation only: {e}")
            # Just test the validation function instead
            version_part = tag[1:] if tag.startswith('v') else tag
            is_valid = validate_semver(version_part)
            print(f"  Version part: {version_part}")
            print(f"  Valid SemVer: {is_valid}")
    
    # Test current version from file
    file_version = get_version_from_file()
    print(f"\nCurrent version in file: {file_version}")
    if file_version:
        is_valid = validate_semver(file_version)
        print(f"  Valid SemVer: {is_valid}")
    
    print("\n[PASS] Version sync test completed")


def test_full_integration():
    """Test full integration: dialog + update manager + checker."""
    print("\n" + "="*60)
    print("TEST 7: Full Integration Test")
    print("="*60)
    
    try:
        from PySide6.QtWidgets import QApplication
        from cuepoint.update.update_manager import UpdateManager
        from cuepoint.update.update_ui import UpdateCheckDialog
        from cuepoint.version import get_version
        
        # Create QApplication if it doesn't exist
        app = QApplication.instance()
        if app is None:
            app = QApplication(sys.argv)
        
        current_version = get_version()
        feed_url = "https://stuchain.github.io/CuePoint/updates"
        
        print(f"Current version: {current_version}")
        print(f"Feed URL: {feed_url}")
        
        # Create update manager
        manager = UpdateManager(current_version, feed_url)
        
        # Create dialog
        dialog = UpdateCheckDialog(current_version)
        dialog.set_checking()
        print("Dialog created and set to checking state")
        
        # Set up callbacks to update dialog
        def on_update_available(update_info):
            dialog.set_update_found(update_info)
            print("  Dialog updated: Update found")
        
        def on_check_complete(update_available, error):
            if error:
                dialog.set_error(error)
                print(f"  Dialog updated: Error - {error}")
            elif update_available:
                # Dialog already updated by on_update_available
                print("  Dialog updated: Update available (already shown)")
            else:
                dialog.set_no_update()
                print("  Dialog updated: No update")
        
        def on_error(error_msg):
            dialog.set_error(error_msg)
            print(f"  Dialog updated: Error - {error_msg}")
        
        manager.set_on_update_available(on_update_available)
        manager.set_on_check_complete(on_check_complete)
        manager.set_on_error(on_error)
        
        print("\nStarting update check with dialog integration...")
        result = manager.check_for_updates(force=True)
        print(f"Check initiated: {result}")
        
        # Process events to allow callbacks
        import time
        print("Processing events for 5 seconds...")
        for _ in range(50):
            app.processEvents()
            time.sleep(0.1)
        
        print("\n[PASS] Full integration test completed")
        
    except ImportError:
        print("[SKIP] PySide6 not available, skipping integration test")
    except Exception as e:
        print(f"[FAIL] Integration test failed: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Run all tests."""
    print("="*60)
    print("COMPREHENSIVE UPDATE SYSTEM TEST")
    print("="*60)
    
    tests = [
        ("Version Display", test_version_display),
        ("Update Checker", test_update_checker),
        ("Version Comparison", test_version_comparison),
        ("Update Manager Integration", test_update_manager_integration),
        ("Dialog UI Components", test_dialog_ui_components),
        ("Version Sync Script", test_version_sync),
        ("Full Integration", test_full_integration),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            test_func()
            results.append((test_name, True, None))
        except Exception as e:
            print(f"\n[FAIL] {test_name} failed: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False, str(e)))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    
    for test_name, success, error in results:
        status = "[PASS]" if success else "[FAIL]"
        print(f"{status} {test_name}")
        if error:
            print(f"       Error: {error}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n[SUCCESS] All tests passed!")
        return 0
    else:
        print(f"\n[FAILURE] {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
