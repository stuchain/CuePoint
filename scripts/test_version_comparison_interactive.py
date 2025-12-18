#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Interactive Version Comparison Tester

Tests version comparison logic interactively to debug update detection issues.

Usage:
    python scripts/test_version_comparison_interactive.py
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'SRC'))

from cuepoint.update.version_utils import (
    compare_versions,
    extract_base_version,
    is_stable_version,
)


def test_comparison(current: str, candidate: str):
    """Test version comparison and explain the result."""
    print("\n" + "=" * 70)
    print("Version Comparison Test")
    print("=" * 70)
    
    try:
        base_current = extract_base_version(current)
        base_candidate = extract_base_version(candidate)
        current_is_prerelease = not is_stable_version(current)
        candidate_is_prerelease = not is_stable_version(candidate)
        
        print(f"\nCurrent Version:")
        print(f"  Full: {current}")
        print(f"  Base: {base_current}")
        print(f"  Is Prerelease: {current_is_prerelease}")
        
        print(f"\nCandidate Version:")
        print(f"  Full: {candidate}")
        print(f"  Base: {base_candidate}")
        print(f"  Is Prerelease: {candidate_is_prerelease}")
        
        # Compare base versions
        base_comparison = compare_versions(base_candidate, base_current)
        print(f"\nBase Version Comparison:")
        print(f"  {base_candidate} vs {base_current} = {base_comparison}")
        if base_comparison > 0:
            print(f"  → Candidate base version is NEWER")
        elif base_comparison < 0:
            print(f"  → Candidate base version is OLDER")
        else:
            print(f"  → Base versions are EQUAL")
        
        # Compare full versions
        full_comparison = compare_versions(candidate, current)
        print(f"\nFull Version Comparison:")
        print(f"  {candidate} vs {current} = {full_comparison}")
        if full_comparison > 0:
            print(f"  → Candidate version is NEWER")
        elif full_comparison < 0:
            print(f"  → Candidate version is OLDER")
        else:
            print(f"  → Versions are EQUAL")
        
        # Determine if update should be detected
        print(f"\nUpdate Detection Logic:")
        if base_comparison > 0:
            print(f"  ✓ Base version is newer - UPDATE SHOULD BE DETECTED")
            if current_is_prerelease and candidate_is_prerelease:
                print(f"    (Both are prerelease - allowed)")
            elif not current_is_prerelease and candidate_is_prerelease:
                print(f"    (Current is stable, candidate is prerelease)")
                print(f"    → Allowed if major/minor bump, blocked if patch bump")
            else:
                print(f"    (Both are stable - allowed)")
        elif base_comparison == 0:
            if full_comparison > 0:
                print(f"  ✓ Same base, but candidate is newer - UPDATE SHOULD BE DETECTED")
            else:
                print(f"  ✗ Same or older version - UPDATE SHOULD NOT BE DETECTED")
        else:
            print(f"  ✗ Candidate is older - UPDATE SHOULD NOT BE DETECTED")
        
        return base_comparison > 0 or (base_comparison == 0 and full_comparison > 0)
        
    except ValueError as e:
        print(f"\nError: {e}")
        return False


def main():
    print("=" * 70)
    print("Interactive Version Comparison Tester")
    print("=" * 70)
    print("\nThis tool helps debug update detection by testing version comparisons.")
    print("Enter versions to compare, or press Enter to use default test cases.\n")
    
    # Default test cases
    test_cases = [
        ("1.0.0-test-unsigned52", "1.0.1-test-unsigned53", "Prerelease to prerelease (minor bump)"),
        ("1.0.0", "1.0.1-test-unsigned53", "Stable to prerelease (minor bump)"),
        ("1.0.0-test-unsigned52", "1.0.1", "Prerelease to stable (minor bump)"),
        ("1.0.1", "1.0.1-test-unsigned53", "Stable to prerelease (same base)"),
        ("1.0.1-test-unsigned52", "1.0.1-test-unsigned53", "Prerelease to prerelease (same base)"),
    ]
    
    if len(sys.argv) >= 3:
        # Command line arguments
        current = sys.argv[1]
        candidate = sys.argv[2]
        test_comparison(current, candidate)
    else:
        # Interactive mode
        use_defaults = input("Use default test cases? (Y/n): ").strip().lower()
        
        if use_defaults != 'n':
            print("\nRunning default test cases...\n")
            for current, candidate, desc in test_cases:
                print(f"\n{'=' * 70}")
                print(f"Test: {desc}")
                print(f"{'=' * 70}")
                test_comparison(current, candidate)
        else:
            # Interactive input
            while True:
                print("\n" + "=" * 70)
                current = input("Current version (or 'quit' to exit): ").strip()
                if current.lower() == 'quit':
                    break
                
                candidate = input("Candidate version: ").strip()
                if not candidate:
                    continue
                
                test_comparison(current, candidate)


if __name__ == "__main__":
    main()
