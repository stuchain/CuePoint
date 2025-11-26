#!/usr/bin/env python3
"""
Comprehensive test script to verify the restructured codebase works correctly.
Tests imports, entry points, and basic functionality.
"""

import sys
import os

# Add src to path
src_path = os.path.dirname(os.path.abspath(__file__))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

def test_all_imports():
    """Test all critical imports"""
    print("=" * 80)
    print("TEST 1: Import Verification")
    print("=" * 80)
    
    errors = []
    
    # Test core imports
    try:
        from cuepoint.core.matcher import best_beatport_match, _camelot_key, _confidence_label
        print("[OK] Core matcher imports")
    except Exception as e:
        errors.append(f"Core matcher: {e}")
        print(f"[FAIL] Core matcher: {e}")
    
    try:
        from cuepoint.core.mix_parser import _parse_mix_flags, _extract_generic_parenthetical_phrases
        print("[OK] Core mix_parser imports")
    except Exception as e:
        errors.append(f"Core mix_parser: {e}")
        print(f"[FAIL] Core mix_parser: {e}")
    
    try:
        from cuepoint.core.query_generator import make_search_queries
        print("[OK] Core query_generator imports")
    except Exception as e:
        errors.append(f"Core query_generator: {e}")
        print(f"[FAIL] Core query_generator: {e}")
    
    try:
        from cuepoint.core.text_processing import normalize_text, sanitize_title_for_search, score_components
        print("[OK] Core text_processing imports")
    except Exception as e:
        errors.append(f"Core text_processing: {e}")
        print(f"[FAIL] Core text_processing: {e}")
    
    # Test data imports
    try:
        from cuepoint.data.beatport import BeatportCandidate, track_urls
        print("[OK] Data beatport imports")
    except Exception as e:
        errors.append(f"Data beatport: {e}")
        print(f"[FAIL] Data beatport: {e}")
    
    try:
        from cuepoint.data.rekordbox import RBTrack, parse_rekordbox, extract_artists_from_title
        print("[OK] Data rekordbox imports")
    except Exception as e:
        errors.append(f"Data rekordbox: {e}")
        print(f"[FAIL] Data rekordbox: {e}")
    
    # Test models imports
    try:
        from cuepoint.models.config import SETTINGS, HAVE_CACHE, BASE_URL, SESSION, NEAR_KEYS, load_config_from_yaml
        print("[OK] Models config imports")
    except Exception as e:
        errors.append(f"Models config: {e}")
        print(f"[FAIL] Models config: {e}")
    
    # Test services imports
    try:
        from cuepoint.services.processor import run, process_playlist
        print("[OK] Services processor imports")
    except Exception as e:
        errors.append(f"Services processor: {e}")
        print(f"[FAIL] Services processor: {e}")
    
    try:
        from cuepoint.services.output_writer import write_csv_files, write_json_file
        print("[OK] Services output_writer imports")
    except Exception as e:
        errors.append(f"Services output_writer: {e}")
        print(f"[FAIL] Services output_writer: {e}")
    
    # Test utils imports
    try:
        from cuepoint.utils.utils import tlog, vlog, with_timestamp, startup_banner, retry_with_backoff
        print("[OK] Utils utils imports")
    except Exception as e:
        errors.append(f"Utils utils: {e}")
        print(f"[FAIL] Utils utils: {e}")
    
    try:
        from cuepoint.utils.performance import performance_collector, PerformanceStats
        print("[OK] Utils performance imports")
    except Exception as e:
        errors.append(f"Utils performance: {e}")
        print(f"[FAIL] Utils performance: {e}")
    
    try:
        from cuepoint.utils.errors import print_error, error_file_not_found
        print("[OK] Utils errors imports")
    except Exception as e:
        errors.append(f"Utils errors: {e}")
        print(f"[FAIL] Utils errors: {e}")
    
    # Test UI imports (basic ones that don't require Qt)
    try:
        from cuepoint.ui.gui_interface import TrackResult, ProgressInfo, ProcessingError, ErrorType
        print("[OK] UI gui_interface imports")
    except Exception as e:
        errors.append(f"UI gui_interface: {e}")
        print(f"[FAIL] UI gui_interface: {e}")
    
    # Test UI imports that require Qt (may fail if Qt not installed, but should not fail on import)
    try:
        from cuepoint.ui.main_window import MainWindow
        print("[OK] UI main_window imports")
    except ImportError as e:
        if "PySide6" in str(e) or "PyQt" in str(e):
            print("[SKIP] UI main_window (Qt not available, but import path is correct)")
        else:
            errors.append(f"UI main_window: {e}")
            print(f"[FAIL] UI main_window: {e}")
    except Exception as e:
        errors.append(f"UI main_window: {e}")
        print(f"[FAIL] UI main_window: {e}")
    
    print("\n" + "=" * 80)
    if errors:
        print(f"[FAIL] {len(errors)} import error(s) found")
        return False
    else:
        print("[OK] All imports successful!")
        return True


def test_entry_points():
    """Test that entry points can be imported"""
    print("\n" + "=" * 80)
    print("TEST 2: Entry Point Verification")
    print("=" * 80)
    
    errors = []
    
    # Test CLI entry point
    try:
        from main import main
        print("[OK] CLI entry point (main.py) can be imported")
    except Exception as e:
        errors.append(f"CLI entry point: {e}")
        print(f"[FAIL] CLI entry point: {e}")
    
    # Test GUI entry point
    try:
        from gui_app import main as gui_main
        print("[OK] GUI entry point (gui_app.py) can be imported")
    except Exception as e:
        errors.append(f"GUI entry point: {e}")
        print(f"[FAIL] GUI entry point: {e}")
    
    print("\n" + "=" * 80)
    if errors:
        print(f"[FAIL] {len(errors)} entry point error(s) found")
        return False
    else:
        print("[OK] All entry points can be imported!")
        return True


def test_circular_imports():
    """Test for circular import issues"""
    print("\n" + "=" * 80)
    print("TEST 3: Circular Import Check")
    print("=" * 80)
    
    # Try importing modules that depend on each other
    try:
        # These should all work without circular import errors
        from cuepoint.core.matcher import best_beatport_match
        from cuepoint.core.query_generator import make_search_queries
        from cuepoint.services.processor import run
        from cuepoint.ui.main_window import MainWindow
        print("[OK] No circular import issues detected")
        return True
    except Exception as e:
        print(f"[FAIL] Possible circular import issue: {e}")
        return False


def test_basic_functionality():
    """Test basic functionality of key modules"""
    print("\n" + "=" * 80)
    print("TEST 4: Basic Functionality")
    print("=" * 80)
    
    errors = []
    
    # Test text processing
    try:
        from cuepoint.core.text_processing import normalize_text, sanitize_title_for_search
        result = normalize_text("Test Track (Extended Mix)")
        assert isinstance(result, str)
        result2 = sanitize_title_for_search("[3] Test Track")
        assert isinstance(result2, str)
        assert "[3]" not in result2  # Should remove prefix
        print("[OK] Text processing functions work")
    except Exception as e:
        errors.append(f"Text processing: {e}")
        print(f"[FAIL] Text processing: {e}")
    
    # Test config
    try:
        from cuepoint.models.config import SETTINGS
        assert isinstance(SETTINGS, dict)
        assert "MAX_SEARCH_RESULTS" in SETTINGS
        print("[OK] Config module works")
    except Exception as e:
        errors.append(f"Config: {e}")
        print(f"[FAIL] Config: {e}")
    
    # Test performance collector
    try:
        from cuepoint.utils.performance import performance_collector
        performance_collector.reset()
        performance_collector.start_session()
        stats = performance_collector.get_stats()
        assert stats is not None
        print("[OK] Performance collector works")
    except Exception as e:
        errors.append(f"Performance collector: {e}")
        print(f"[FAIL] Performance collector: {e}")
    
    print("\n" + "=" * 80)
    if errors:
        print(f"[FAIL] {len(errors)} functionality error(s) found")
        return False
    else:
        print("[OK] Basic functionality works!")
        return True


def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("COMPREHENSIVE TEST SUITE - Step 5.1 Verification")
    print("=" * 80)
    print()
    
    results = []
    
    results.append(("Imports", test_all_imports()))
    results.append(("Entry Points", test_entry_points()))
    results.append(("Circular Imports", test_circular_imports()))
    results.append(("Basic Functionality", test_basic_functionality()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    all_passed = True
    for test_name, passed in results:
        status = "[OK]" if passed else "[FAIL]"
        print(f"{status} {test_name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 80)
    if all_passed:
        print("[SUCCESS] All tests passed!")
        return 0
    else:
        print("[FAILURE] Some tests failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())


