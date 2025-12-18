#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Windows version_info.txt
Creates version info file for Windows executable metadata
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __build_number__, __version__
except ImportError:
    print("Error: Could not import version module")
    sys.exit(1)


def generate_version_info():
    """Generate version_info.txt for Windows"""
    try:
        # Extract base version (X.Y.Z) from version string, removing prerelease suffixes
        # e.g., "1.0.0-test10" -> "1.0.0"
        base_version = __version__
        if '-' in base_version:
            base_version = base_version.split('-')[0]
        if '+' in base_version:
            base_version = base_version.split('+')[0]
        
        # Parse base version parts
        version_parts = base_version.split('.')
        if len(version_parts) != 3:
            raise ValueError(f"Version must have 3 parts (major.minor.patch), got: {base_version}")
        
        major, minor, patch = map(int, version_parts)
    except (ValueError, AttributeError) as e:
        print(f"Error: Invalid version format: {__version__} (base: {base_version if 'base_version' in locals() else 'N/A'})")
        print(f"Details: {e}")
        sys.exit(1)
    
    try:
        build = int(__build_number__ or "0")
    except (ValueError, TypeError):
        build = 0
    
    template = f"""VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=({major}, {minor}, {patch}, {build}),
    prodvers=({major}, {minor}, {patch}, {build}),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable('040904B0', [
        StringStruct('CompanyName', 'StuChain'),
        StringStruct('FileDescription', 'CuePoint - Rekordbox Metadata Enrichment Tool'),
        StringStruct('FileVersion', '{__version__}.{build}'),
        StringStruct('InternalName', 'CuePoint'),
        StringStruct('LegalCopyright', 'Copyright (C) 2024 StuChain. All rights reserved.'),
        StringStruct('OriginalFilename', 'CuePoint.exe'),
        StringStruct('ProductName', 'CuePoint'),
        StringStruct('ProductVersion', '{__version__}.{build}')
      ])
    ]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""
    
    output_path = Path("build/version_info.txt")
    # Create build directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Write with explicit UTF-8 encoding to handle special characters like ©
    output_path.write_text(template, encoding='utf-8')
    print(f"Generated version_info.txt: {output_path}")
    print(f"  Version: {__version__}.{build}")
    print(f"  File version: ({major}, {minor}, {patch}, {build})")


if __name__ == '__main__':
    generate_version_info()
