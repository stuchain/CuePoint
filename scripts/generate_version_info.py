#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Windows version_info.txt
Creates version info file for Windows executable metadata
"""

import sys
import io
from pathlib import Path

def configure_output_encoding() -> None:
    """Ensure stdout/stderr can handle Unicode output."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            try:
                wrapped = io.TextIOWrapper(
                    stream.buffer,
                    encoding="utf-8",
                    errors="replace",
                    line_buffering=True,
                )
                setattr(sys, stream_name, wrapped)
            except (AttributeError, ValueError):
                continue


configure_output_encoding()

# Fall back to ASCII-safe text for logs if needed.
def safe_display(value: str) -> str:
    return value.encode("ascii", "backslashreplace").decode("ascii")

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
        base_display = base_version if 'base_version' in locals() else 'N/A'
        print(
            "Error: Invalid version format: "
            f"{safe_display(__version__)} (base: {safe_display(str(base_display))})"
        )
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
    print(f"  Version: {safe_display(__version__)}.{build}")
    print(f"  File version: ({major}, {minor}, {patch}, {build})")


if __name__ == '__main__':
    generate_version_info()
