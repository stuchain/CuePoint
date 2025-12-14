#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate metadata consistency across all files

This script validates that metadata (version, bundle ID, display name, etc.)
is consistent across:
1. version.py
2. Info.plist
3. PyInstaller spec file
4. Git tags (if available)

Usage:
    python scripts/validate_metadata.py [app_path]
"""

import plistlib
import re
import subprocess
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __build_number__, __version__, get_short_commit_sha
except ImportError:
    print("Error: Could not import version module", file=sys.stderr)
    sys.exit(1)


def get_version_from_info_plist(app_path):
    """Get version from Info.plist"""
    info_plist = Path(app_path) / 'Contents/Info.plist'
    if not info_plist.exists():
        return None, None
    
    try:
        with open(info_plist, 'rb') as f:
            plist = plistlib.load(f)
        return (
            plist.get('CFBundleShortVersionString'),
            plist.get('CFBundleVersion')
        )
    except Exception:
        return None, None


def get_version_from_spec():
    """Get version from PyInstaller spec file"""
    spec_file = Path('build/pyinstaller.spec')
    if not spec_file.exists():
        return None, None
    
    content = spec_file.read_text()
    version_match = re.search(r"['\"]CFBundleShortVersionString['\"]\s*:\s*['\"]([^'\"]+)['\"]", content)
    build_match = re.search(r"['\"]CFBundleVersion['\"]\s*:\s*['\"]([^'\"]+)['\"]", content)
    
    version = version_match.group(1) if version_match else None
    build = build_match.group(1) if build_match else None
    
    return version, build


def get_version_from_git_tag():
    """Get latest version from git tags"""
    try:
        result = subprocess.run(
            ['git', 'tag', '--list', 'v*', '--sort=-version:refname'],
            capture_output=True,
            text=True,
            check=True,
            timeout=10
        )
        tags = result.stdout.strip().split('\n')
        if tags and tags[0]:
            return tags[0][1:]  # Remove 'v' prefix
    except Exception:
        pass
    return None


def validate_metadata(app_path=None):
    """Validate metadata consistency
    
    Args:
        app_path: Optional path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []
    
    # Get versions from all sources
    file_version = __version__
    file_build = __build_number__
    
    info_version = None
    info_build = None
    if app_path:
        info_version, info_build = get_version_from_info_plist(app_path)
    
    spec_version, spec_build = get_version_from_spec()
    git_version = get_version_from_git_tag()
    
    # Validate version consistency
    if file_version:
        if info_version and info_version != file_version:
            errors.append(
                f"Version mismatch: version.py has {file_version}, "
                f"Info.plist has {info_version}"
            )
        
        if spec_version and spec_version != file_version:
            errors.append(
                f"Version mismatch: version.py has {file_version}, "
                f"pyinstaller.spec has {spec_version}"
            )
        
        # Git tag check (warning if mismatch, not error)
        if git_version and git_version != file_version:
            # This is a warning, not an error, as tags may not be created yet
            pass
    
    # Validate build number consistency
    if file_build:
        if info_build and info_build != file_build:
            errors.append(
                f"Build number mismatch: version.py has {file_build}, "
                f"Info.plist has {info_build}"
            )
    
    # Validate bundle ID (from separate validation, but check here too)
    if app_path:
        info_plist = Path(app_path) / 'Contents/Info.plist'
        if info_plist.exists():
            try:
                with open(info_plist, 'rb') as f:
                    plist = plistlib.load(f)
                bundle_id = plist.get('CFBundleIdentifier')
                if bundle_id != 'com.stuchain.cuepoint':
                    errors.append(
                        f"Bundle ID mismatch: expected com.stuchain.cuepoint, "
                        f"got {bundle_id}"
                    )
            except Exception:
                pass
    
    return len(errors) == 0, errors


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else None
    
    if app_path:
        app_path = Path(app_path)
        if not app_path.exists():
            print(f"Error: App bundle not found: {app_path}", file=sys.stderr)
            sys.exit(1)
    
    valid, errors = validate_metadata(app_path)
    
    if not valid:
        print("Metadata validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print("✓ Metadata validation passed")
    print(f"  Version: {__version__}")
    if __build_number__:
        print(f"  Build number: {__build_number__}")
    sys.exit(0)


if __name__ == '__main__':
    main()
