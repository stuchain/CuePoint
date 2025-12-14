#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate architecture support for macOS app

This script validates that the app supports the required architectures:
1. Checks executable architecture
2. Validates Universal2 support (if applicable)
3. Checks framework architectures match

Usage:
    python scripts/validate_architecture.py [app_path]
"""

import subprocess
import sys
from pathlib import Path


def get_architectures(file_path):
    """Get architectures for a binary file
    
    Args:
        file_path: Path to binary file
        
    Returns:
        List of architecture strings (e.g., ['arm64', 'x86_64'])
    """
    try:
        result = subprocess.run(
            ['file', str(file_path)],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return []
        
        output = result.stdout
        architectures = []
        
        if 'arm64' in output:
            architectures.append('arm64')
        if 'x86_64' in output:
            architectures.append('x86_64')
        
        return architectures
    except Exception:
        return []


def validate_architecture(app_path):
    """Validate app architecture support
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors, list_of_warnings)
    """
    app = Path(app_path)
    errors = []
    warnings = []
    
    if not app.exists():
        return False, [f"App bundle not found: {app_path}"], []
    
    # Check main executable
    exe_path = app / 'Contents/MacOS/CuePoint'
    if not exe_path.exists():
        return False, ["Main executable not found"], []
    
    exe_archs = get_architectures(exe_path)
    if not exe_archs:
        errors.append("Could not determine executable architecture")
    else:
        print(f"Main executable architectures: {', '.join(exe_archs)}")
        
        # Check for Universal2 (both architectures)
        if 'arm64' in exe_archs and 'x86_64' in exe_archs:
            print("✓ Universal2 binary detected")
        elif 'arm64' in exe_archs:
            warnings.append("App only supports arm64 (Apple Silicon)")
        elif 'x86_64' in exe_archs:
            warnings.append("App only supports x86_64 (Intel)")
    
    # Check frameworks (if any)
    frameworks_dir = app / 'Contents/Frameworks'
    if frameworks_dir.exists():
        frameworks = list(frameworks_dir.glob('*.framework'))
        if frameworks:
            print(f"Checking {len(frameworks)} frameworks...")
            
            for framework in frameworks:
                # Find framework executable
                framework_exe = None
                for pattern in ['Versions/Current/*', 'Versions/*/*', '*']:
                    matches = list(framework.glob(pattern))
                    for match in matches:
                        if match.is_file() and match.stat().st_mode & 0o111:
                            framework_exe = match
                            break
                    if framework_exe:
                        break
                
                if framework_exe:
                    fw_archs = get_architectures(framework_exe)
                    if fw_archs:
                        if set(fw_archs) != set(exe_archs):
                            warnings.append(
                                f"Framework {framework.name} architectures ({', '.join(fw_archs)}) "
                                f"do not match app architectures ({', '.join(exe_archs)})"
                            )
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else 'dist/CuePoint.app'
    
    valid, errors, warnings = validate_architecture(app_path)
    
    if warnings:
        for warning in warnings:
            print(f"WARNING: {warning}")
    
    if not valid:
        print("Architecture validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print("✓ Architecture validation passed")
    sys.exit(0)


if __name__ == '__main__':
    main()
