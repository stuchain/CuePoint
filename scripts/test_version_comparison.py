#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test version comparison to understand why updates aren't detected.
"""

import sys
from pathlib import Path

# Add SRC to path
_script_dir = Path(__file__).resolve().parent
_project_root = _script_dir.parent
_src_dir = _project_root / 'SRC'
sys.path.insert(0, str(_src_dir))

from cuepoint.update.version_utils import compare_versions, extract_base_version, is_stable_version

def test_comparison(current: str, candidate: str):
    """Test version comparison."""
    print(f"\nComparing:")
    print(f"  Current: {current}")
    print(f"  Candidate: {candidate}")
    
    try:
        base_current = extract_base_version(current)
        base_candidate = extract_base_version(candidate)
        current_is_prerelease = not is_stable_version(current)
        candidate_is_prerelease = not is_stable_version(candidate)
        
        print(f"  Base current: {base_current} (prerelease: {current_is_prerelease})")
        print(f"  Base candidate: {base_candidate} (prerelease: {candidate_is_prerelease})")
        
        # Base comparison
        base_comp = compare_versions(base_candidate, base_current)
        print(f"  Base comparison: {base_comp} ({base_candidate} vs {base_current})")
        
        # Full comparison
        full_comp = compare_versions(candidate, current)
        print(f"  Full comparison: {full_comp} ({candidate} vs {current})")
        
        if base_comp == 0:
            print(f"  -> Same base version")
            if not current_is_prerelease and candidate_is_prerelease:
                print(f"  -> Current is stable, candidate is prerelease - would be SKIPPED in stable channel")
            elif full_comp > 0:
                print(f"  -> Candidate is newer (would be offered)")
            else:
                print(f"  -> Candidate is NOT newer (would be skipped)")
        elif base_comp > 0:
            print(f"  -> Candidate base version is newer (would be offered)")
        else:
            print(f"  -> Candidate base version is older (would be skipped)")
            
    except Exception as e:
        print(f"  ERROR: {e}")

if __name__ == '__main__':
    print("="*60)
    print("Version Comparison Test")
    print("="*60)
    
    # Test the actual scenario
    test_comparison("1.0.1", "1.0.1-test9")
    
    # Test other scenarios
    test_comparison("1.0.0", "1.0.1-test9")
    test_comparison("1.0.1-test8", "1.0.1-test9")
    test_comparison("1.0.0-test2", "1.0.1-test9")
