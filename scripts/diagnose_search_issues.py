#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diagnostic script to identify why track matching might be failing in installed version.

This script checks for:
1. Missing ddgs engine modules
2. Missing fake_useragent data
3. Missing compatibility shims
4. Network connectivity issues
5. SSL certificate issues
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

def check_ddgs_engines():
    """Check if all ddgs engines are available."""
    print("=" * 60)
    print("Checking DuckDuckGo Search (ddgs) Engines")
    print("=" * 60)
    
    engines_to_check = [
        'ddgs',
        'ddgs.ddgs',
        'ddgs.engines',
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
    
    missing = []
    available = []
    
    for engine in engines_to_check:
        try:
            __import__(engine)
            available.append(engine)
            print(f"✓ {engine}")
        except ImportError as e:
            missing.append(engine)
            print(f"✗ {engine} - {e}")
    
    print(f"\nSummary: {len(available)}/{len(engines_to_check)} engines available")
    if missing:
        print(f"⚠️  Missing engines: {missing}")
        return False
    return True


def check_fake_useragent():
    """Check if fake_useragent data is available."""
    print("\n" + "=" * 60)
    print("Checking fake_useragent")
    print("=" * 60)
    
    try:
        import fake_useragent
        print(f"✓ fake_useragent imported")
        
        # Check if data files are available
        try:
            from fake_useragent import UserAgent
            ua = UserAgent()
            # Try to get a user agent (this will fail if data is missing)
            test_ua = ua.random
            print(f"✓ fake_useragent data available (test UA: {test_ua[:50]}...)")
            return True
        except Exception as e:
            print(f"✗ fake_useragent data missing: {e}")
            return False
    except ImportError as e:
        print(f"✗ fake_useragent not available: {e}")
        return False


def check_duckduckgo_search_shim():
    """Check if duckduckgo_search compatibility shim is available."""
    print("\n" + "=" * 60)
    print("Checking duckduckgo_search compatibility shim")
    print("=" * 60)
    
    try:
        # Check if the shim file exists in the bundle
        if getattr(sys, 'frozen', False):
            # In frozen app, check if it's in the bundle
            if hasattr(sys, '_MEIPASS'):
                shim_path = Path(sys._MEIPASS) / 'SRC' / 'duckduckgo_search.py'
            else:
                shim_path = Path(sys.executable).parent / 'SRC' / 'duckduckgo_search.py'
        else:
            shim_path = Path('SRC') / 'duckduckgo_search.py'
        
        if shim_path.exists():
            print(f"✓ Compatibility shim found: {shim_path}")
        else:
            print(f"✗ Compatibility shim not found: {shim_path}")
            return False
        
        # Try to import it
        try:
            import duckduckgo_search
            print(f"✓ duckduckgo_search imported successfully")
            return True
        except ImportError as e:
            print(f"✗ Could not import duckduckgo_search: {e}")
            return False
    except Exception as e:
        print(f"✗ Error checking shim: {e}")
        return False


def test_ddgs_search():
    """Test if DuckDuckGo search actually works."""
    print("\n" + "=" * 60)
    print("Testing DuckDuckGo Search (actual query)")
    print("=" * 60)
    
    try:
        # Try to import DDGS
        try:
            from duckduckgo_search import DDGS
            print("✓ Using duckduckgo_search.DDGS")
        except ImportError:
            try:
                from ddgs import DDGS
                print("✓ Using ddgs.DDGS")
            except ImportError as e:
                print(f"✗ Could not import DDGS: {e}")
                return False
        
        # Try a test search
        with DDGS() as ddgs:
            results = list(ddgs.text("site:beatport.com test", max_results=3))
            if results:
                print(f"✓ Search works: found {len(results)} results")
                print(f"  First result: {results[0].get('href', 'N/A')[:80]}")
                return True
            else:
                print("⚠️  Search returned no results (might be network issue)")
                return False
    except Exception as e:
        print(f"✗ Search test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_network_connectivity():
    """Check network connectivity."""
    print("\n" + "=" * 60)
    print("Checking Network Connectivity")
    print("=" * 60)
    
    try:
        import requests
        response = requests.get("https://www.beatport.com", timeout=10)
        print(f"✓ Beatport accessible (status: {response.status_code})")
        return True
    except Exception as e:
        print(f"✗ Network test failed: {e}")
        return False


def check_ssl_certificates():
    """Check SSL certificates."""
    print("\n" + "=" * 60)
    print("Checking SSL Certificates")
    print("=" * 60)
    
    try:
        import certifi
        cert_path = certifi.where()
        print(f"✓ certifi found: {cert_path}")
        
        import os
        if os.path.exists(cert_path):
            size = os.path.getsize(cert_path)
            print(f"✓ Certificate file exists ({size:,} bytes)")
            return True
        else:
            print(f"✗ Certificate file not found: {cert_path}")
            return False
    except Exception as e:
        print(f"✗ certifi check failed: {e}")
        return False


def main():
    """Run all diagnostic checks."""
    print("CuePoint Search Dependencies Diagnostic")
    print("=" * 60)
    print(f"Python version: {sys.version}")
    print(f"Frozen (packaged): {getattr(sys, 'frozen', False)}")
    if getattr(sys, 'frozen', False):
        if hasattr(sys, '_MEIPASS'):
            print(f"Bundle path: {sys._MEIPASS}")
        print(f"Executable: {sys.executable}")
    print("=" * 60)
    
    results = {}
    
    results['ddgs_engines'] = check_ddgs_engines()
    results['fake_useragent'] = check_fake_useragent()
    results['duckduckgo_search_shim'] = check_duckduckgo_search_shim()
    results['network'] = check_network_connectivity()
    results['ssl'] = check_ssl_certificates()
    results['ddgs_search'] = test_ddgs_search()
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for check, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{check:30} {status}")
    
    all_passed = all(results.values())
    print("=" * 60)
    if all_passed:
        print("✓ All checks passed!")
        return 0
    else:
        print("✗ Some checks failed - this may explain why track matching is limited")
        print("\nRecommendations:")
        if not results['ddgs_engines']:
            print("  - Rebuild with updated pyinstaller.spec to include all ddgs engines")
        if not results['fake_useragent']:
            print("  - Ensure fake_useragent data files are included in the build")
        if not results['duckduckgo_search_shim']:
            print("  - Ensure duckduckgo_search.py shim is included as a data file")
        if not results['network']:
            print("  - Check network connectivity and firewall settings")
        if not results['ssl']:
            print("  - SSL certificates may be missing - check certifi installation")
        return 1


if __name__ == '__main__':
    sys.exit(main())
