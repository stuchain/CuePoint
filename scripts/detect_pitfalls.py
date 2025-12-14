#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Detect common macOS packaging pitfalls

This script detects common issues that can cause signing, notarization,
or distribution problems.

Usage:
    python scripts/detect_pitfalls.py [app_path]
"""

import plistlib
import subprocess
import sys
from pathlib import Path


def check_hardened_runtime(app_path):
    """Check if hardened runtime is enabled"""
    issues = []
    try:
        result = subprocess.run(
            ['codesign', '-dvv', str(app_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            if 'runtime' not in result.stdout:
                issues.append({
                    'severity': 'error',
                    'issue': 'Hardened runtime not enabled',
                    'description': 'Hardened runtime is required for notarization',
                    'fix': 'Re-sign with --options runtime flag'
                })
    except Exception:
        pass
    
    return issues


def check_unsigned_nested_items(app_path):
    """Check for unsigned nested items"""
    issues = []
    
    # Check frameworks
    frameworks_dir = Path(app_path) / 'Contents/Frameworks'
    if frameworks_dir.exists():
        frameworks = list(frameworks_dir.glob('*.framework'))
        for framework in frameworks:
            try:
                result = subprocess.run(
                    ['codesign', '--verify', '--verbose', str(framework)],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    issues.append({
                        'severity': 'error',
                        'issue': f'Unsigned framework: {framework.name}',
                        'description': 'All frameworks must be signed',
                        'fix': f'Sign the framework: codesign --force --sign "IDENTITY" --options runtime "{framework}"'
                    })
            except Exception:
                pass
    
    # Check nested binaries
    macos_dir = Path(app_path) / 'Contents/MacOS'
    if macos_dir.exists():
        binaries = list(macos_dir.glob('*'))
        for binary in binaries:
            if binary.is_file() and binary.stat().st_mode & 0o111:  # Executable
                try:
                    result = subprocess.run(
                        ['codesign', '--verify', '--verbose', str(binary)],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode != 0:
                        issues.append({
                            'severity': 'error',
                            'issue': f'Unsigned binary: {binary.name}',
                            'description': 'All executables must be signed',
                            'fix': f'Sign the binary: codesign --force --sign "IDENTITY" --options runtime "{binary}"'
                        })
                except Exception:
                    pass
    
    return issues


def check_entitlements(app_path):
    """Check entitlements for common issues"""
    issues = []
    
    try:
        result = subprocess.run(
            ['codesign', '-d', '--entitlements', ':-', str(app_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0 and result.stdout.strip():
            # Check for disallowed entitlements
            disallowed = [
                'com.apple.security.cs.allow-jit',
                'com.apple.security.cs.allow-unsigned-executable-memory',
                'com.apple.security.cs.disable-library-validation',
            ]
            
            for entitlement in disallowed:
                if entitlement in result.stdout:
                    issues.append({
                        'severity': 'warning',
                        'issue': f'Disallowed entitlement: {entitlement}',
                        'description': 'This entitlement may cause notarization to fail',
                        'fix': 'Remove the entitlement or justify its use'
                    })
    except Exception:
        pass
    
    return issues


def check_bundle_structure(app_path):
    """Check bundle structure for issues"""
    issues = []
    app = Path(app_path)
    
    # Check for files in wrong locations
    if (app / 'Resources').exists() and (app / 'Resources').is_dir():
        issues.append({
            'severity': 'warning',
            'issue': 'Legacy Resources directory at root',
            'description': 'Resources should be in Contents/Resources, not at root',
            'fix': 'Move resources to Contents/Resources'
        })
    
    # Check executable permissions
    exe_path = app / 'Contents/MacOS/CuePoint'
    if exe_path.exists():
        stat = exe_path.stat()
        if not (stat.st_mode & 0o111):
            issues.append({
                'severity': 'error',
                'issue': 'Executable does not have execute permission',
                'description': 'The main executable must be executable',
                'fix': 'chmod +x Contents/MacOS/CuePoint'
            })
    
    return issues


def check_info_plist(app_path):
    """Check Info.plist for common issues"""
    issues = []
    app = Path(app_path)
    info_plist = app / 'Contents/Info.plist'
    
    if not info_plist.exists():
        issues.append({
            'severity': 'error',
            'issue': 'Info.plist not found',
            'description': 'Info.plist is required for macOS app bundles',
            'fix': 'Create Info.plist with required keys'
        })
        return issues
    
    try:
        with open(info_plist, 'rb') as f:
            plist = plistlib.load(f)
    except Exception as e:
        issues.append({
            'severity': 'error',
            'issue': f'Invalid Info.plist: {e}',
            'description': 'Info.plist must be valid XML',
            'fix': 'Fix XML syntax errors'
        })
        return issues
    
    # Check required keys
    required_keys = [
        'CFBundleIdentifier',
        'CFBundleName',
        'CFBundleExecutable',
        'CFBundleShortVersionString',
        'CFBundleVersion',
    ]
    
    for key in required_keys:
        if key not in plist:
            issues.append({
                'severity': 'error',
                'issue': f'Missing required key: {key}',
                'description': f'{key} is required in Info.plist',
                'fix': f'Add {key} to Info.plist'
            })
    
    # Check executable matches
    executable = plist.get('CFBundleExecutable')
    if executable:
        exe_path = app / 'Contents/MacOS' / executable
        if not exe_path.exists():
            issues.append({
                'severity': 'error',
                'issue': f'Executable not found: {executable}',
                'description': f'CFBundleExecutable specifies {executable} but file does not exist',
                'fix': f'Ensure {executable} exists in Contents/MacOS/'
            })
    
    return issues


def detect_pitfalls(app_path):
    """Detect all pitfalls
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        List of issues (dicts with severity, issue, description, fix)
    """
    all_issues = []
    
    # Only check if app is signed
    try:
        result = subprocess.run(
            ['codesign', '--verify', str(app_path)],
            capture_output=True,
            timeout=10
        )
        if result.returncode == 0:
            all_issues.extend(check_hardened_runtime(app_path))
            all_issues.extend(check_unsigned_nested_items(app_path))
            all_issues.extend(check_entitlements(app_path))
    except Exception:
        pass
    
    all_issues.extend(check_bundle_structure(app_path))
    all_issues.extend(check_info_plist(app_path))
    
    return all_issues


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else 'dist/CuePoint.app'
    
    print("Detecting common macOS packaging pitfalls...")
    print(f"App: {app_path}\n")
    
    issues = detect_pitfalls(app_path)
    
    if not issues:
        print("✓ No pitfalls detected")
        sys.exit(0)
    
    # Group by severity
    errors = [i for i in issues if i['severity'] == 'error']
    warnings = [i for i in issues if i['severity'] == 'warning']
    
    if errors:
        print("ERRORS:")
        for issue in errors:
            print(f"  ✗ {issue['issue']}")
            print(f"    Description: {issue['description']}")
            print(f"    Fix: {issue['fix']}")
            print()
    
    if warnings:
        print("WARNINGS:")
        for issue in warnings:
            print(f"  ⚠ {issue['issue']}")
            print(f"    Description: {issue['description']}")
            print(f"    Fix: {issue['fix']}")
            print()
    
    if errors:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
