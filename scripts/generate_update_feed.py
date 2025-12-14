#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate WinSparkle update feed JSON for Windows auto-updates

Usage:
    python scripts/generate_update_feed.py --exe <exe_path> --version <version> --url <download_url> [--notes <notes_url>] [--output <output_path>]
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"


def generate_update_feed(exe_path, version, download_url, release_notes_url=None, signature=None, file_type='installer'):
    """Generate WinSparkle update feed JSON
    
    Args:
        exe_path: Path to executable or installer
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download file
        release_notes_url: Optional URL to release notes
        signature: Optional file signature
        file_type: Type of file ('installer' or 'portable')
    
    Returns:
        JSON string
    """
    exe_file = Path(exe_path)
    if not exe_file.exists():
        raise FileNotFoundError(f"Executable file not found: {exe_path}")
    
    exe_size = exe_file.stat().st_size
    
    feed = {
        "version": version,
        "pubDate": datetime.now().isoformat() + "Z",
        "downloads": [
            {
                "url": download_url,
                "size": exe_size,
                "type": file_type
            }
        ]
    }
    
    if release_notes_url:
        feed["releaseNotes"] = release_notes_url
    
    if signature:
        feed["downloads"][0]["signature"] = signature
    
    return json.dumps(feed, indent=2)


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Generate WinSparkle update feed JSON for Windows auto-updates'
    )
    parser.add_argument('--exe', required=True,
                       help='Path to executable or installer')
    parser.add_argument('--version',
                       help='Version string (default: from version.py)')
    parser.add_argument('--url', required=True,
                       help='Download URL for executable')
    parser.add_argument('--notes',
                       help='URL to release notes')
    parser.add_argument('--signature',
                       help='File signature')
    parser.add_argument('--type',
                       choices=['installer', 'portable'],
                       default='installer',
                       help='File type (default: installer)')
    parser.add_argument('--output',
                       help='Output file path (default: updates/windows/appcast.json)')
    
    args = parser.parse_args()
    
    version = args.version or __version__
    
    try:
        feed_json = generate_update_feed(
            args.exe,
            version,
            args.url,
            args.notes,
            args.signature,
            args.type
        )
        
        # Write output
        if args.output:
            output_path = Path(args.output)
        else:
            output_path = Path('updates/windows/appcast.json')
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(feed_json, encoding='utf-8')
        
        print(f"Generated update feed: {output_path}")
        print(f"  Version: {version}")
        print(f"  File: {args.exe}")
        print(f"  URL: {args.url}")
        print(f"  Type: {args.type}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
