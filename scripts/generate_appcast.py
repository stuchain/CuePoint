#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Sparkle appcast XML for macOS auto-updates

Usage:
    python scripts/generate_appcast.py --dmg <dmg_path> --version <version> --url <download_url> [--notes <notes_url>] [--output <output_path>]
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"


def generate_appcast(dmg_path, version, download_url, release_notes_url=None, signature=None):
    """Generate Sparkle appcast XML
    
    Args:
        dmg_path: Path to DMG file
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download DMG
        release_notes_url: Optional URL to release notes
        signature: Optional DSA or ED25519 signature
    
    Returns:
        XML string
    """
    dmg_file = Path(dmg_path)
    if not dmg_file.exists():
        raise FileNotFoundError(f"DMG file not found: {dmg_path}")
    
    dmg_size = dmg_file.stat().st_size
    
    # Create RSS root
    root = ET.Element('rss', version='2.0')
    root.set('xmlns:sparkle', 'http://www.andymatuschak.org/xml-namespaces/sparkle')
    
    channel = ET.SubElement(root, 'channel')
    ET.SubElement(channel, 'title').text = 'CuePoint Updates'
    ET.SubElement(channel, 'link').text = 'https://github.com/StuChain/CuePoint'
    ET.SubElement(channel, 'description').text = 'Latest CuePoint releases'
    
    # Create item for this release
    item = ET.SubElement(channel, 'item')
    ET.SubElement(item, 'title').text = f'Version {version}'
    ET.SubElement(item, 'pubDate').text = datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')
    
    # Sparkle version info
    version_elem = ET.SubElement(item, '{http://www.andymatuschak.org/xml-namespaces/sparkle}version')
    version_elem.text = version
    
    short_version = ET.SubElement(item, '{http://www.andymatuschak.org/xml-namespaces/sparkle}shortVersionString')
    short_version.text = version
    
    # Enclosure
    enclosure = ET.SubElement(item, 'enclosure')
    enclosure.set('url', download_url)
    enclosure.set('sparkle:version', version)
    enclosure.set('sparkle:shortVersionString', version)
    enclosure.set('length', str(dmg_size))
    enclosure.set('type', 'application/octet-stream')
    
    if signature:
        enclosure.set('sparkle:dsaSignature', signature)
    
    # Release notes link
    if release_notes_url:
        notes_link = ET.SubElement(item, '{http://www.andymatuschak.org/xml-namespaces/sparkle}releaseNotesLink')
        notes_link.text = release_notes_url
    
    # Convert to string with proper formatting
    ET.indent(root, space='  ')
    xml_str = ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')
    
    return xml_str


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Generate Sparkle appcast XML for macOS auto-updates'
    )
    parser.add_argument('--dmg', required=True,
                       help='Path to DMG file')
    parser.add_argument('--version',
                       help='Version string (default: from version.py)')
    parser.add_argument('--url', required=True,
                       help='Download URL for DMG')
    parser.add_argument('--notes',
                       help='URL to release notes')
    parser.add_argument('--signature',
                       help='DSA or ED25519 signature')
    parser.add_argument('--output',
                       help='Output file path (default: updates/macos/appcast.xml)')
    
    args = parser.parse_args()
    
    version = args.version or __version__
    
    try:
        appcast_xml = generate_appcast(
            args.dmg,
            version,
            args.url,
            args.notes,
            args.signature
        )
        
        # Write output
        if args.output:
            output_path = Path(args.output)
        else:
            output_path = Path('updates/macos/appcast.xml')
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(appcast_xml, encoding='utf-8')
        
        print(f"Generated appcast: {output_path}")
        print(f"  Version: {version}")
        print(f"  DMG: {args.dmg}")
        print(f"  URL: {args.url}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
