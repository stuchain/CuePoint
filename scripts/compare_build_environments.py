#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compare build environments to identify differences between local and GitHub builds.
"""

import sys
import platform
from pathlib import Path


def get_build_info():
    """Get information about the current build environment."""
    info = {
        "python_version": sys.version,
        "python_version_info": sys.version_info,
        "platform": platform.platform(),
        "platform_system": platform.system(),
        "platform_release": platform.release(),
        "platform_version": platform.version(),
        "platform_machine": platform.machine(),
        "platform_processor": platform.processor(),
        "frozen": getattr(sys, "frozen", False),
        "executable": sys.executable,
    }
    
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            info["_MEIPASS"] = sys._MEIPASS
        info["build_type"] = "packaged"
    else:
        info["build_type"] = "development"
    
    return info


def print_build_info():
    """Print build information."""
    info = get_build_info()
    
    print("=" * 70)
    print("BUILD ENVIRONMENT INFORMATION")
    print("=" * 70)
    print(f"Python Version: {info['python_version']}")
    print(f"Python Version Info: {info['python_version_info']}")
    print(f"Platform: {info['platform']}")
    print(f"System: {info['platform_system']}")
    print(f"Release: {info['platform_release']}")
    print(f"Machine: {info['platform_machine']}")
    print(f"Processor: {info['platform_processor']}")
    print(f"Frozen (Packaged): {info['frozen']}")
    print(f"Build Type: {info['build_type']}")
    print(f"Executable: {info['executable']}")
    
    if "_MEIPASS" in info:
        print(f"Bundle Path: {info['_MEIPASS']}")
    
    print("=" * 70)
    
    # Check for key differences
    print("\nKEY DIFFERENCES TO CHECK:")
    print("-" * 70)
    print("1. Python Version:")
    print(f"   - Current: {info['python_version_info'].major}.{info['python_version_info'].minor}")
    print("   - GitHub Actions (pinned): 3.13.7")
    print("   - Local (recommended): 3.13.7")
    print("   → This could affect PyInstaller behavior")
    
    print("\n2. Build Type:")
    print(f"   - Current: {info['build_type']}")
    if info['frozen']:
        print("   - This is a packaged build")
    else:
        print("   - This is a development build")
    
    print("\n3. Executable Location:")
    print(f"   - {info['executable']}")
    if info['frozen'] and "_MEIPASS" in info:
        print(f"   - Bundle: {info['_MEIPASS']}")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    print_build_info()
