#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate WinSparkle update feed XML (Sparkle-compatible) for Windows auto-updates

WinSparkle uses the same appcast XML format as Sparkle, so this generates
Sparkle-compatible XML for Windows.

Usage:
    python scripts/generate_update_feed.py --exe <exe_path> --version <version> --url <download_url> [--notes <notes_url>] [--output <output_path>] [--append]
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from email.utils import formatdate
from pathlib import Path
from typing import Optional

# Add SRC to path
_script_dir = Path(__file__).resolve().parent
_project_root = _script_dir.parent
_src_dir = _project_root / 'SRC'
sys.path.insert(0, str(_src_dir))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"

# Sparkle namespace
SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"


def version_to_build_number(version: str) -> str:
    """
    Convert semantic version to build number.
    
    Args:
        version: Version string (e.g., "1.0.0" or "1.0.0-test-unsigned42")
        
    Returns:
        Build number string (e.g., "100" for 1.0.0)
    """
    # Strip any suffix after the version (e.g., "-test-unsigned42")
    # Remove 'v' prefix if present
    version = version.lstrip('v')
    
    # Split on '-' to remove any suffix (e.g., "1.0.0-test-unsigned42" -> "1.0.0")
    version_base = version.split('-')[0]
    
    parts = version_base.split('.')
    if len(parts) >= 3:
        try:
            major = int(parts[0])
            minor = int(parts[1])
            patch = int(parts[2])
            # Build number: major * 10000 + minor * 100 + patch
            build = major * 10000 + minor * 100 + patch
            return str(build)
        except (ValueError, IndexError):
            # If parsing fails, return a default build number
            return "0"
    return "0"


def generate_appcast_item(
    exe_path: Path,
    version: str,
    download_url: str,
    release_notes_url: Optional[str] = None,
    release_notes: Optional[str] = None
) -> ET.Element:
    """
    Generate a single appcast item for Windows.
    
    Args:
        exe_path: Path to installer/executable file
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download file
        release_notes_url: Optional URL to release notes
        release_notes: Optional release notes HTML content
    
    Returns:
        XML item element
    """
    exe_file = Path(exe_path)
    if not exe_file.exists():
        raise FileNotFoundError(f"Executable file not found: {exe_path}")
    
    file_size = exe_file.stat().st_size
    build_number = version_to_build_number(version)
    
    # Create item
    item = ET.Element('item')
    ET.SubElement(item, 'title').text = f'Version {version}'
    ET.SubElement(item, 'pubDate').text = formatdate()
    
    # Sparkle version info
    version_elem = ET.SubElement(item, f'{{{SPARKLE_NS}}}version')
    version_elem.text = build_number
    
    short_version = ET.SubElement(item, f'{{{SPARKLE_NS}}}shortVersionString')
    short_version.text = version
    
    # Enclosure
    enclosure = ET.SubElement(item, 'enclosure')
    enclosure.set('url', download_url)
    enclosure.set(f'{{{SPARKLE_NS}}}version', build_number)
    enclosure.set(f'{{{SPARKLE_NS}}}shortVersionString', version)
    enclosure.set('length', str(file_size))
    enclosure.set('type', 'application/octet-stream')
    
    # Note: Windows uses code signing for verification, not EdDSA signatures
    # The installer is signed with the code signing certificate
    
    # Release notes link
    if release_notes_url:
        notes_link = ET.SubElement(item, f'{{{SPARKLE_NS}}}releaseNotesLink')
        notes_link.text = release_notes_url
    
    # Release notes description
    if release_notes:
        description = ET.SubElement(item, 'description')
        description.text = release_notes
    
    return item


def generate_update_feed(
    exe_path: str,
    version: str,
    download_url: str,
    release_notes_url: Optional[str] = None,
    release_notes: Optional[str] = None,
    append_to: Optional[str] = None
) -> str:
    """
    Generate WinSparkle update feed XML (Sparkle-compatible).
    
    Args:
        exe_path: Path to installer/executable file
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download file
        release_notes_url: Optional URL to release notes
        release_notes: Optional release notes HTML content
        append_to: Optional path to existing appcast to append to
    
    Returns:
        XML string
    """
    exe_file = Path(exe_path)
    if not exe_file.exists():
        raise FileNotFoundError(f"Executable file not found: {exe_path}")
    
    # Create or load existing appcast
    if append_to and Path(append_to).exists():
        # Load existing appcast
        tree = ET.parse(append_to)
        root = tree.getroot()
        channel = root.find('channel')
        if channel is None:
            raise ValueError("Invalid existing appcast: missing channel")
        
        # Ensure Sparkle namespace is declared (in case existing appcast doesn't have it)
        if 'xmlns:sparkle' not in root.attrib:
            root.set('xmlns:sparkle', SPARKLE_NS)
    else:
        # Create new appcast
        root = ET.Element('rss', version='2.0')
        root.set('xmlns:sparkle', SPARKLE_NS)
        root.set('xmlns:dc', 'http://purl.org/dc/elements/1.1/')
        
        channel = ET.SubElement(root, 'channel')
        ET.SubElement(channel, 'title').text = 'CuePoint Updates'
        ET.SubElement(channel, 'link').text = 'https://github.com/StuChain/CuePoint'
        ET.SubElement(channel, 'description').text = 'Latest CuePoint releases'
        ET.SubElement(channel, 'language').text = 'en'
    
    # Check if this version already exists in the appcast
    # This prevents duplicates when re-running the same release
    existing_items = channel.findall('item')
    version_exists = False
    for existing_item in existing_items:
        short_version_elem = existing_item.find(f'{{{SPARKLE_NS}}}shortVersionString')
        if short_version_elem is not None and short_version_elem.text == version:
            version_exists = True
            print(f"Version {version} already exists in appcast, skipping duplicate")
            break
    
    if not version_exists:
        # Create item for this release
        item = generate_appcast_item(
            exe_file,
            version,
            download_url,
            release_notes_url,
            release_notes
        )
        
        # Insert new item at the beginning (latest first)
        channel.insert(0, item)
    else:
        # Version exists - keep existing but ensure it's at the top
        # Remove existing and re-insert at top to ensure latest is first
        for existing_item in existing_items:
            short_version_elem = existing_item.find(f'{{{SPARKLE_NS}}}shortVersionString')
            if short_version_elem is not None and short_version_elem.text == version:
                channel.remove(existing_item)
                channel.insert(0, existing_item)
                print(f"Updated position of existing version {version} to top")
                break
    
    # Convert to string with proper formatting
    ET.indent(root, space='  ')
    xml_str = ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')
    
    return xml_str


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Generate WinSparkle update feed XML (Sparkle-compatible) for Windows auto-updates'
    )
    parser.add_argument('--exe', required=True,
                       help='Path to executable or installer')
    parser.add_argument('--version',
                       help='Version string (default: from version.py)')
    parser.add_argument('--url', required=True,
                       help='Download URL for executable')
    parser.add_argument('--notes',
                       help='URL to release notes')
    parser.add_argument('--description',
                       help='Release notes HTML content')
    parser.add_argument('--output',
                       help='Output file path (default: updates/windows/stable/appcast.xml)')
    parser.add_argument('--append',
                       action='store_true',
                       help='Append to existing appcast instead of creating new')
    parser.add_argument('--channel',
                       choices=['stable', 'beta'],
                       default='stable',
                       help='Update channel (default: stable)')
    
    args = parser.parse_args()
    
    version = args.version or __version__
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
        append_to = str(output_path) if args.append and output_path.exists() else None
    else:
        output_path = Path(f'updates/windows/{args.channel}/appcast.xml')
        append_to = str(output_path) if args.append and output_path.exists() else None
    
    try:
        feed_xml = generate_update_feed(
            args.exe,
            version,
            args.url,
            args.notes,
            args.description,
            append_to
        )
        
        # Write output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(feed_xml, encoding='utf-8')
        
        print(f"Generated update feed: {output_path}")
        print(f"  Version: {version}")
        print(f"  Channel: {args.channel}")
        print(f"  File: {args.exe}")
        print(f"  URL: {args.url}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
