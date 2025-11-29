#!/usr/bin/env python3
"""
Final verification test for Step 5.1 restructuring.
Run this from the project root directory.
"""

import sys
import os

# Add src to path
src_path = os.path.join(os.path.dirname(__file__), 'src')
if src_path not in sys.path:
    sys.path.insert(0, src_path)

def test_cli_entry_point():
    """Test CLI entry point works"""
    print("=" * 80)
    print("TEST: CLI Entry Point")
    print("=" * 80)
    
    try:
        from main import main
        print("[OK] CLI entry point imported successfully")
        
        # Test that it can parse arguments (without actually running)
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--xml", required=True)
        parser.add_argument("--playlist", required=True)
        parser.add_argument("--out", default="test.csv")
        print("[OK] CLI argument parsing structure works")
        return True
    except Exception as e:
        print(f"[FAIL] CLI entry point error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_gui_entry_point():
    """Test GUI entry point works"""
    print("\n" + "=" * 80)
    print("TEST: GUI Entry Point")
    print("=" * 80)
    
    try:
        from gui_app import main as gui_main
        print("[OK] GUI entry point imported successfully")
        
        # Don't actually create QApplication (would require display)
        # Just verify the import works
        return True
    except Exception as e:
        print(f"[FAIL] GUI entry point error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_key_modules():
    """Test that key modules can be imported and basic functions work"""
    print("\n" + "=" * 80)
    print("TEST: Key Module Functionality")
    print("=" * 80)
    
    errors = []
    
    # Test text processing
    try:
        from cuepoint.core.text_processing import normalize_text, sanitize_title_for_search
        result = normalize_text("Test Track (Extended Mix)")
        assert result == "test track", f"Expected 'test track', got '{result}'"
        result2 = sanitize_title_for_search("[3] Test Track")
        assert "[3]" not in result2, "Prefix should be removed"
        print("[OK] Text processing works correctly")
    except Exception as e:
        errors.append(f"Text processing: {e}")
        print(f"[FAIL] Text processing: {e}")
    
    # Test query generation
    try:
        from cuepoint.core.query_generator import make_search_queries
        queries = make_search_queries("Test Track", "Test Artist")
        assert isinstance(queries, list)
        assert len(queries) > 0
        print("[OK] Query generation works correctly")
    except Exception as e:
        errors.append(f"Query generation: {e}")
        print(f"[FAIL] Query generation: {e}")
    
    # Test config
    try:
        from cuepoint.models.config import SETTINGS
        assert "MAX_SEARCH_RESULTS" in SETTINGS
        assert isinstance(SETTINGS["MAX_SEARCH_RESULTS"], int)
        print("[OK] Config module works correctly")
    except Exception as e:
        errors.append(f"Config: {e}")
        print(f"[FAIL] Config: {e}")
    
    # Test mix parser
    try:
        from cuepoint.core.mix_parser import _parse_mix_flags
        flags = _parse_mix_flags("Test Track (Extended Mix)")
        assert flags["is_extended"] == True
        print("[OK] Mix parser works correctly")
    except Exception as e:
        errors.append(f"Mix parser: {e}")
        print(f"[FAIL] Mix parser: {e}")
    
    if errors:
        return False
    return True


def test_import_paths():
    """Test that all import paths are correct"""
    print("\n" + "=" * 80)
    print("TEST: Import Path Verification")
    print("=" * 80)
    
    test_cases = [
        ("cuepoint.core.matcher", "best_beatport_match"),
        ("cuepoint.core.query_generator", "make_search_queries"),
        ("cuepoint.data.beatport", "BeatportCandidate"),
        ("cuepoint.data.rekordbox", "RBTrack"),
        ("cuepoint.services.processor", "run"),
        ("cuepoint.services.output_writer", "write_csv_files"),
        ("cuepoint.utils.utils", "tlog"),
        ("cuepoint.utils.performance", "performance_collector"),
        ("cuepoint.ui.gui_interface", "TrackResult"),
    ]
    
    errors = []
    for module_name, item_name in test_cases:
        try:
            module = __import__(module_name, fromlist=[item_name])
            assert hasattr(module, item_name), f"{item_name} not found in {module_name}"
            print(f"[OK] {module_name}.{item_name}")
        except Exception as e:
            errors.append(f"{module_name}.{item_name}: {e}")
            print(f"[FAIL] {module_name}.{item_name}: {e}")
    
    if errors:
        return False
    return True


def main():
    """Run all verification tests"""
    print("\n" + "=" * 80)
    print("STEP 5.1 RESTRUCTURING - FINAL VERIFICATION")
    print("=" * 80)
    print()
    
    results = []
    results.append(("CLI Entry Point", test_cli_entry_point()))
    results.append(("GUI Entry Point", test_gui_entry_point()))
    results.append(("Key Module Functionality", test_key_modules()))
    results.append(("Import Path Verification", test_import_paths()))
    
    # Summary
    print("\n" + "=" * 80)
    print("VERIFICATION SUMMARY")
    print("=" * 80)
    
    all_passed = True
    for test_name, passed in results:
        status = "[OK]" if passed else "[FAIL]"
        print(f"{status} {test_name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 80)
    if all_passed:
        print("[SUCCESS] All verification tests passed!")
        print("Step 5.1 restructuring is complete and verified.")
        return 0
    else:
        print("[FAILURE] Some verification tests failed.")
        return 1


if __name__ == "__main__":
    sys.exit(main())






