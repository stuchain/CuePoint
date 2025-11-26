#!/usr/bin/env python3
"""
Test script to verify all imports work correctly after restructuring.
Run this from the src directory.
"""

import sys
import os

# Add src to path
src_path = os.path.dirname(os.path.abspath(__file__))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

def test_imports():
    """Test all critical imports"""
    errors = []
    
    # Test core imports
    try:
        from cuepoint.core.matcher import best_beatport_match, _camelot_key, _confidence_label
        print("[OK] Core matcher imports")
    except Exception as e:
        errors.append(f"Core matcher: {e}")
        print(f"[FAIL] Core matcher imports: {e}")
    
    try:
        from cuepoint.core.mix_parser import _parse_mix_flags, _extract_generic_parenthetical_phrases
        print("[OK] Core mix_parser imports OK")
    except Exception as e:
        errors.append(f"Core mix_parser: {e}")
        print(f"[FAIL] Core mix_parser imports FAILED: {e}")
    
    try:
        from cuepoint.core.query_generator import make_search_queries
        print("[OK] Core query_generator imports OK")
    except Exception as e:
        errors.append(f"Core query_generator: {e}")
        print(f"[FAIL] Core query_generator imports FAILED: {e}")
    
    try:
        from cuepoint.core.text_processing import normalize_text, sanitize_title_for_search, score_components
        print("[OK] Core text_processing imports OK")
    except Exception as e:
        errors.append(f"Core text_processing: {e}")
        print(f"[FAIL] Core text_processing imports FAILED: {e}")
    
    # Test data imports
    try:
        from cuepoint.data.beatport import BeatportCandidate, track_urls
        print("[OK] Data beatport imports OK")
    except Exception as e:
        errors.append(f"Data beatport: {e}")
        print(f"[FAIL] Data beatport imports FAILED: {e}")
    
    try:
        from cuepoint.data.rekordbox import RBTrack, parse_rekordbox, extract_artists_from_title
        print("[OK] Data rekordbox imports OK")
    except Exception as e:
        errors.append(f"Data rekordbox: {e}")
        print(f"[FAIL] Data rekordbox imports FAILED: {e}")
    
    # Test models imports
    try:
        from cuepoint.models.config import SETTINGS, HAVE_CACHE, BASE_URL, SESSION, NEAR_KEYS, load_config_from_yaml
        print("[OK] Models config imports OK")
    except Exception as e:
        errors.append(f"Models config: {e}")
        print(f"[FAIL] Models config imports FAILED: {e}")
    
    # Test services imports
    try:
        from cuepoint.services.processor import run, process_track
        print("[OK] Services processor imports OK")
    except Exception as e:
        errors.append(f"Services processor: {e}")
        print(f"[FAIL] Services processor imports FAILED: {e}")
    
    try:
        from cuepoint.services.output_writer import write_csv_files
        print("[OK] Services output_writer imports OK")
    except Exception as e:
        errors.append(f"Services output_writer: {e}")
        print(f"[FAIL] Services output_writer imports FAILED: {e}")
    
    # Test utils imports
    try:
        from cuepoint.utils.utils import tlog, vlog, with_timestamp, startup_banner
        print("[OK] Utils utils imports OK")
    except Exception as e:
        errors.append(f"Utils utils: {e}")
        print(f"[FAIL] Utils utils imports FAILED: {e}")
    
    try:
        from cuepoint.utils.performance import performance_collector
        print("[OK] Utils performance imports OK")
    except Exception as e:
        errors.append(f"Utils performance: {e}")
        print(f"[FAIL] Utils performance imports FAILED: {e}")
    
    try:
        from cuepoint.utils.errors import print_error, error_file_not_found
        print("[OK] Utils errors imports OK")
    except Exception as e:
        errors.append(f"Utils errors: {e}")
        print(f"[FAIL] Utils errors imports FAILED: {e}")
    
    # Test UI imports (basic ones that don't require Qt)
    try:
        from cuepoint.ui.gui_interface import TrackResult, ProgressInfo, ProcessingError, ErrorType
        print("[OK] UI gui_interface imports OK")
    except Exception as e:
        errors.append(f"UI gui_interface: {e}")
        print(f"[FAIL] UI gui_interface imports FAILED: {e}")
    
    # Summary
    print("\n" + "="*60)
    if errors:
        print(f"[FAIL] {len(errors)} import error(s) found:")
        for error in errors:
            print(f"  - {error}")
        return False
    else:
        print("[OK] All imports successful!")
        return True

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)

