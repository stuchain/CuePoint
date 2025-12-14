#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Process Info.plist template with version information
Replaces placeholders with actual version data
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __build_number__, __version__, get_short_commit_sha
except ImportError:
    print("Error: Could not import version module")
    sys.exit(1)


def process_info_plist():
    """Process Info.plist template"""
    template_path = Path("build/Info.plist.template")
    output_path = Path("build/Info.plist")
    
    if not template_path.exists():
        print(f"Error: Template not found: {template_path}")
        sys.exit(1)
    
    # Read template
    content = template_path.read_text()
    
    # Replace placeholders
    content = content.replace("{{VERSION}}", __version__)
    content = content.replace("{{BUILD_NUMBER}}", __build_number__ or "1")
    
    short_commit = get_short_commit_sha() or ""
    if short_commit:
        # Add commit info as comment (optional)
        content = content.replace("<!-- Version Information -->", 
                                 f"<!-- Version Information - Commit: {short_commit} -->")
    
    # Write output
    output_path.write_text(content)
    print(f"Processed Info.plist: {output_path}")
    print(f"  Version: {__version__}")
    print(f"  Build number: {__build_number__ or '1'}")


if __name__ == '__main__':
    process_info_plist()
