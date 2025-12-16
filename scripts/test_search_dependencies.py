#!/usr/bin/env python3
"""Test script to verify search dependencies are available.

This script can be run in the packaged app to diagnose why track search isn't working.
"""

import sys
import traceback


def test_imports():
    """Test if all required modules can be imported."""
    results = {}
    
    # Test basic imports
    modules_to_test = [
        ('requests', 'requests'),
        ('beautifulsoup4', 'bs4'),
        ('ddgs', 'ddgs'),
        ('duckduckgo_search', 'duckduckgo_search'),
        ('certifi', 'certifi'),
        ('urllib3', 'urllib3'),
    ]
    
    for package_name, import_name in modules_to_test:
        try:
            __import__(import_name)
            results[package_name] = "OK"
            print(f"✓ {package_name} imported successfully")
        except ImportError as e:
            results[package_name] = f"FAILED: {e}"
            print(f"✗ {package_name} import failed: {e}")
            traceback.print_exc()
    
    # Test DDGS specifically
    print("\nTesting DuckDuckGo search (DDGS):")
    try:
        from duckduckgo_search import DDGS
        print("✓ duckduckgo_search.DDGS imported")
        
        # Try to create an instance
        try:
            ddgs = DDGS()
            print("✓ DDGS instance created")
            del ddgs
        except Exception as e:
            print(f"✗ DDGS instance creation failed: {e}")
            traceback.print_exc()
    except ImportError:
        try:
            from ddgs import DDGS
            print("✓ ddgs.DDGS imported (direct)")
        except ImportError as e:
            print(f"✗ DDGS import failed: {e}")
            traceback.print_exc()
    
    # Test SSL certificates
    print("\nTesting SSL certificates:")
    try:
        import certifi
        cert_path = certifi.where()
        print(f"✓ certifi found: {cert_path}")
        import os
        if os.path.exists(cert_path):
            print(f"✓ Certificate file exists: {cert_path}")
        else:
            print(f"✗ Certificate file not found: {cert_path}")
    except Exception as e:
        print(f"✗ certifi test failed: {e}")
        traceback.print_exc()
    
    # Test network connectivity
    print("\nTesting network connectivity:")
    try:
        import requests
        response = requests.get("https://www.beatport.com", timeout=5)
        print(f"✓ Beatport website accessible (status: {response.status_code})")
    except Exception as e:
        print(f"✗ Network test failed: {e}")
        traceback.print_exc()
    
    # Test DuckDuckGo search (actual search)
    print("\nTesting DuckDuckGo search (actual query):")
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            search_results = list(ddgs.text("site:beatport.com test", max_results=3))
            print(f"✓ DuckDuckGo search works: found {len(search_results)} results")
            if search_results:
                print(f"  First result: {search_results[0].get('href', 'N/A')}")
    except Exception as e:
        print(f"✗ DuckDuckGo search test failed: {e}")
        traceback.print_exc()
    
    print("\n" + "="*60)
    print("Summary:")
    for name, status in results.items():
        print(f"  {name}: {status}")
    print("="*60)
    
    return all("OK" in str(status) for status in results.values())

if __name__ == "__main__":
    print("Testing search dependencies...")
    print(f"Python version: {sys.version}")
    print(f"Frozen (packaged): {getattr(sys, 'frozen', False)}")
    print(f"Executable: {sys.executable}")
    print("="*60 + "\n")
    
    success = test_imports()
    sys.exit(0 if success else 1)
