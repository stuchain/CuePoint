#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Process Info.plist Template with Version Info

This script processes the Info.plist template, replacing placeholders
with actual version information from version.py.

Usage:
    python scripts/process_info_plist.py

This script is typically called during macOS builds to generate the
final Info.plist for the app bundle.
"""

import sys
from pathlib import Path

# Add SRC to path to import version module
script_dir = Path(__file__).parent
project_root = script_dir.parent
sys.path.insert(0, str(project_root / "SRC"))

from cuepoint.version import get_build_number, get_version


def process_info_plist_template() -> None:
    """Process Info.plist template with version information."""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    template_path = project_root / "build" / "Info.plist.template"
    output_path = project_root / "build" / "Info.plist"

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    # Read template
    content = template_path.read_text()

    # Get version info
    version = get_version()
    build_number = get_build_number() or "1"

    # Replace placeholders
    content = content.replace("{{VERSION}}", version)
    content = content.replace("{{BUILD_NUMBER}}", build_number)

    # Write processed file
    output_path.write_text(content)
    print(f"Processed Info.plist: version={version}, build={build_number}")


if __name__ == "__main__":
    try:
        process_info_plist_template()
    except Exception as e:
        print(f"Error processing Info.plist: {e}", file=sys.stderr)
        sys.exit(1)
