#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compare local build with GitHub installer to identify differences.

This script helps identify what might be missing in the GitHub installer
that causes it to match fewer tracks than the local build.
"""

import sys
from pathlib import Path

def check_ddgs_engines_available():
    """Check which ddgs engines are available."""
    print("Checking available ddgs engines...")
    
    engines = [
        'ddgs.engines.duckduckgo',
        'ddgs.engines.duckduckgo_images',
        'ddgs.engines.duckduckgo_news',
        'ddgs.engines.duckduckgo_videos',
        'ddgs.engines.bing',
        'ddgs.engines.bing_news',
        'ddgs.engines.google',
        'ddgs.engines.brave',
        'ddgs.engines.yahoo',
        'ddgs.engines.yahoo_news',
        'ddgs.engines.yandex',
        'ddgs.engines.mojeek',
        'ddgs.engines.wikipedia',
        'ddgs.engines.annasarchive',
    ]
    
    available = []
    missing = []
    
    for engine in engines:
        try:
            __import__(engine)
            available.append(engine)
        except ImportError:
            missing.append(engine)
    
    print(f"Available: {len(available)}/{len(engines)}")
    if missing:
        print(f"Missing: {missing}")
    
    return len(missing) == 0


def check_fake_useragent_data():
    """Check if fake_useragent data is available."""
    print("\nChecking fake_useragent data...")
    
    try:
        from fake_useragent import UserAgent
        ua = UserAgent()
        test_ua = ua.random
        print(f"✓ fake_useragent data available")
        return True
    except Exception as e:
        print(f"✗ fake_useragent data missing: {e}")
        return False


def check_compatibility_shim():
    """Check if duckduckgo_search compatibility shim exists."""
    print("\nChecking duckduckgo_search compatibility shim...")
    
    # Check if file exists
    shim_path = Path('SRC') / 'duckduckgo_search.py'
    if shim_path.exists():
        print(f"✓ Shim file exists: {shim_path}")
    else:
        print(f"✗ Shim file missing: {shim_path}")
        return False
    
    # Try to import
    try:
        import duckduckgo_search
        print(f"✓ duckduckgo_search can be imported")
        return True
    except ImportError as e:
        print(f"✗ Could not import: {e}")
        return False


def main():
    """Run comparison checks."""
    print("=" * 60)
    print("Build Comparison Diagnostic")
    print("=" * 60)
    print(f"Python: {sys.version}")
    print(f"Frozen: {getattr(sys, 'frozen', False)}")
    print("=" * 60)
    
    results = {
        'ddgs_engines': check_ddgs_engines_available(),
        'fake_useragent': check_fake_useragent_data(),
        'compatibility_shim': check_compatibility_shim(),
    }
    
    print("\n" + "=" * 60)
    print("Results:")
    for check, passed in results.items():
        print(f"  {check}: {'✓' if passed else '✗'}")
    
    if not all(results.values()):
        print("\n⚠️  Some components are missing!")
        print("This could explain why the GitHub installer matches fewer tracks.")
        print("\nTo fix:")
        print("1. Ensure pyinstaller.spec includes all ddgs engines")
        print("2. Ensure fake_useragent data files are collected")
        print("3. Ensure duckduckgo_search.py shim is included as data file")
        print("4. Rebuild the installer")
        return 1
    
    print("\n✓ All components available")
    return 0


if __name__ == '__main__':
    sys.exit(main())
