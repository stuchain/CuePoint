#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Repository health check

Comprehensive repository health validation

Usage:
    python scripts/check_repo_health.py
"""

import subprocess
import sys
from pathlib import Path


def check_git_status():
    """Check git repository status"""
    result = subprocess.run(['git', 'status', '--porcelain'], 
                          capture_output=True, text=True, timeout=10)
    if result.stdout.strip():
        print("Warning: Uncommitted changes detected")
        return False
    return True


def check_branch():
    """Check current branch"""
    result = subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], 
                          capture_output=True, text=True, timeout=10)
    branch = result.stdout.strip()
    print(f"Current branch: {branch}")
    return branch


def check_large_files():
    """Check for large files"""
    result = subprocess.run(['python', 'scripts/check_large_files.py'], 
                          capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print("ERROR: Large files detected")
        print(result.stdout)
        return False
    return True


def check_gitignore():
    """Check .gitignore"""
    gitignore = Path('.gitignore')
    if not gitignore.exists():
        print("Warning: .gitignore not found")
        return False
    return True


def check_secrets():
    """Check for accidentally committed secrets"""
    # Check for common secret patterns
    patterns = [
        'password',
        'secret',
        'api_key',
        'private_key',
        'certificate',
    ]
    
    # Only check tracked files
    result = subprocess.run(['git', 'grep', '-i', '|'.join(patterns)], 
                          capture_output=True, text=True, timeout=30)
    
    # Filter out false positives (comments, documentation)
    lines = result.stdout.strip().split('\n')
    suspicious = []
    for line in lines:
        if line and not any(skip in line.lower() for skip in ['#', 'example', 'template', 'test', 'doc']):
            suspicious.append(line)
    
    if suspicious:
        print("Warning: Potential secrets detected in tracked files")
        print("Review the following:")
        for line in suspicious[:10]:  # Limit output
            print(f"  {line}")
        if len(suspicious) > 10:
            print(f"  ... and {len(suspicious) - 10} more")
        return False
    return True


def main():
    """Main health check"""
    print("Repository Health Check")
    print("=" * 50)
    
    checks = [
        ("Git status", check_git_status),
        ("Current branch", lambda: check_branch() is not None),
        ("Large files", check_large_files),
        (".gitignore", check_gitignore),
        ("Secrets", check_secrets),
    ]
    
    all_passed = True
    for name, check_func in checks:
        print(f"\nChecking {name}...")
        try:
            if not check_func():
                all_passed = False
        except Exception as e:
            print(f"Error: {e}")
            all_passed = False
    
    print("\n" + "=" * 50)
    if all_passed:
        print("[OK] All checks passed")
        sys.exit(0)
    else:
        print("[ERROR] Some checks failed")
        sys.exit(1)


if __name__ == '__main__':
    main()
