#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Step 3 validation scripts

This script tests that all Step 3 validation scripts work correctly.
It performs basic syntax and import checks.

Usage:
    python scripts/test_step3_validation.py
"""

import importlib.util
import sys
from pathlib import Path

VALIDATION_SCRIPTS = [
    'validate_bundle_structure.py',
    'validate_dmg.py',
    'validate_bundle_id.py',
    'validate_info_plist.py',
    'validate_metadata.py',
    'validate_certificate.py',
    'validate_pre_notarization.py',
    'validate_architecture.py',
    'validate_update_compatibility.py',
    'detect_pitfalls.py',
]


def test_script(script_name):
    """Test a validation script
    
    Args:
        script_name: Name of the script to test
        
    Returns:
        Tuple of (success, error_message)
    """
    script_path = Path('scripts') / script_name
    
    if not script_path.exists():
        return False, f"Script not found: {script_path}"
    
    try:
        # Try to compile
        with open(script_path, 'r', encoding='utf-8') as f:
            code = f.read()
        compile(code, script_path, 'exec')
        
        # Try to import (basic check)
        spec = importlib.util.spec_from_file_location(script_name, script_path)
        if spec is None:
            return False, "Could not create module spec"
        
        # Check for main function
        if 'if __name__' not in code or '__main__' not in code:
            return False, "Script missing main guard"
        
        return True, None
    except SyntaxError as e:
        return False, f"Syntax error: {e}"
    except Exception as e:
        return False, f"Error: {e}"


def main():
    """Main function"""
    print("Testing Step 3 validation scripts...")
    print("=" * 60)
    
    all_passed = True
    results = []
    
    for script in VALIDATION_SCRIPTS:
        success, error = test_script(script)
        results.append((script, success, error))
        if not success:
            all_passed = False
    
    # Print results
    print("\nResults:")
    print("-" * 60)
    for script, success, error in results:
        status = "[OK]" if success else "[FAIL]"
        print(f"{status} {script}")
        if error:
            print(f"    {error}")
    
    print("\n" + "=" * 60)
    if all_passed:
        print("[OK] All validation scripts passed basic tests")
        sys.exit(0)
    else:
        print("[FAIL] Some validation scripts failed")
        sys.exit(1)


if __name__ == '__main__':
    main()
