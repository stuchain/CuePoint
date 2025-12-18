#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate Sparkle appcast XML for macOS auto-updates

Usage:
    python scripts/generate_appcast.py --dmg <dmg_path> --version <version> --url <download_url> [--notes <notes_url>] [--signature <signature>] [--ed-signature <ed_signature>] [--output <output_path>] [--append] [--description <description>]
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
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
    dmg_path: Path,
    version: str,
    download_url: str,
    release_notes_url: Optional[str] = None,
    release_notes: Optional[str] = None,
    ed_signature: Optional[str] = None,
    dsa_signature: Optional[str] = None,
    minimum_system_version: Optional[str] = None
) -> ET.Element:
    """
    Generate a single appcast item.
    
    Args:
        dmg_path: Path to DMG file
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download DMG
        release_notes_url: Optional URL to release notes
        release_notes: Optional release notes HTML content
        ed_signature: Optional EdDSA signature (preferred)
        dsa_signature: Optional DSA signature (legacy)
        minimum_system_version: Optional minimum macOS version
    
    Returns:
        XML item element
    """
    dmg_file = Path(dmg_path)
    if not dmg_file.exists():
        raise FileNotFoundError(f"DMG file not found: {dmg_path}")
    
    dmg_size = dmg_file.stat().st_size
    build_number = version_to_build_number(version)
    
    # Create item
    item = ET.Element('item')
    ET.SubElement(item, 'title').text = f'Version {version}'
    # Always use current time for pubDate to ensure it's different each time
    from datetime import datetime
    pub_date = formatdate()
    ET.SubElement(item, 'pubDate').text = pub_date
    print(f"Generated pubDate: {pub_date}")  # Debug output
    
    # Sparkle version info
    version_elem = ET.SubElement(item, f'{{{SPARKLE_NS}}}version')
    version_elem.text = build_number
    
    short_version = ET.SubElement(item, f'{{{SPARKLE_NS}}}shortVersionString')
    short_version.text = version
    
    # Minimum system version
    if minimum_system_version:
        min_sys = ET.SubElement(item, f'{{{SPARKLE_NS}}}minimumSystemVersion')
        min_sys.text = minimum_system_version
    
    # Enclosure
    enclosure = ET.SubElement(item, 'enclosure')
    enclosure.set('url', download_url)
    enclosure.set(f'{{{SPARKLE_NS}}}version', build_number)
    enclosure.set(f'{{{SPARKLE_NS}}}shortVersionString', version)
    enclosure.set('length', str(dmg_size))
    enclosure.set('type', 'application/octet-stream')
    
    # Add signature (prefer EdDSA over DSA)
    if ed_signature:
        enclosure.set(f'{{{SPARKLE_NS}}}edSignature', ed_signature)
    elif dsa_signature:
        enclosure.set(f'{{{SPARKLE_NS}}}dsaSignature', dsa_signature)
    
    # Release notes link
    if release_notes_url:
        notes_link = ET.SubElement(item, f'{{{SPARKLE_NS}}}releaseNotesLink')
        notes_link.text = release_notes_url
    
    # Release notes description
    if release_notes:
        description = ET.SubElement(item, 'description')
        description.text = release_notes
    
    return item


def generate_appcast(
    dmg_path: str,
    version: str,
    download_url: str,
    release_notes_url: Optional[str] = None,
    release_notes: Optional[str] = None,
    ed_signature: Optional[str] = None,
    dsa_signature: Optional[str] = None,
    minimum_system_version: Optional[str] = None,
    append_to: Optional[str] = None
) -> str:
    """
    Generate Sparkle appcast XML.
    
    Args:
        dmg_path: Path to DMG file
        version: Version string (e.g., "1.0.0")
        download_url: Full URL to download DMG
        release_notes_url: Optional URL to release notes
        release_notes: Optional release notes HTML content
        ed_signature: Optional EdDSA signature (preferred)
        dsa_signature: Optional DSA signature (legacy)
        minimum_system_version: Optional minimum macOS version
        append_to: Optional path to existing appcast to append to
    
    Returns:
        XML string
    """
    dmg_file = Path(dmg_path)
    if not dmg_file.exists():
        raise FileNotFoundError(f"DMG file not found: {dmg_path}")
    
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
    
    # Remove all existing items - we only want to keep the latest version
    existing_items = channel.findall('item')
    if existing_items:
        print(f"Removing {len(existing_items)} existing version(s) to keep only the latest...")
        for existing_item in existing_items:
            short_version_elem = existing_item.find(f'{{{SPARKLE_NS}}}shortVersionString')
            if short_version_elem is not None:
                existing_version = short_version_elem.text
                print(f"  Removing version: {existing_version}")
            channel.remove(existing_item)
    
    # Create new item with current information
    item = generate_appcast_item(
        dmg_file,
        version,
        download_url,
        release_notes_url,
        release_notes,
        ed_signature,
        dsa_signature,
        minimum_system_version
    )
    
    # Insert new item (will be the only one)
    channel.insert(0, item)
    print(f"Added new version: {version} (only version in appcast)")
    
    # Convert to string with proper formatting
    ET.indent(root, space='  ')
    xml_str = ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')
    
    # Debug: Log what versions are in the appcast and their pubDates
    try:
        items = channel.findall('item')
        versions_in_appcast = []
        version_pubdates = {}
        for item in items:
            short_version_elem = item.find(f'{{{SPARKLE_NS}}}shortVersionString')
            pub_date_elem = item.find('pubDate')
            if short_version_elem is not None:
                ver = short_version_elem.text
                versions_in_appcast.append(ver)
                if pub_date_elem is not None:
                    version_pubdates[ver] = pub_date_elem.text
        
        print(f"Appcast will contain {len(versions_in_appcast)} version(s): {', '.join(versions_in_appcast[:10])}")
        if version in versions_in_appcast:
            print(f"Version {version} is in appcast with pubDate: {version_pubdates.get(version, 'N/A')}")
        else:
            print(f"WARNING: Version {version} not found in appcast after generation!")
    except Exception as e:
        print(f"Warning: Could not verify versions in appcast: {e}")
    
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
    parser.add_argument('--description',
                       help='Release notes HTML content')
    parser.add_argument('--signature',
                       help='DSA signature (legacy)')
    parser.add_argument('--ed-signature',
                       help='EdDSA signature (preferred)')
    parser.add_argument('--minimum-system-version',
                       help='Minimum macOS version required')
    parser.add_argument('--output',
                       help='Output file path (default: updates/macos/stable/appcast.xml)')
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
        output_path = Path(f'updates/macos/{args.channel}/appcast.xml')
        append_to = str(output_path) if args.append and output_path.exists() else None
    
    try:
        appcast_xml = generate_appcast(
            args.dmg,
            version,
            args.url,
            args.notes,
            args.description,
            args.ed_signature,
            args.signature,
            args.minimum_system_version,
            append_to
        )
        
        # Write output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(appcast_xml, encoding='utf-8')
        
        # Count items and list versions in generated appcast for debugging
        try:
            root = ET.fromstring(appcast_xml)
            channel = root.find('channel')
            if channel is not None:
                items = channel.findall('item')
                item_count = len(items)
                versions = []
                for item in items[:5]:  # Show first 5 versions
                    short_version_elem = item.find(f'{{{SPARKLE_NS}}}shortVersionString')
                    if short_version_elem is not None:
                        versions.append(short_version_elem.text)
                print(f"Generated appcast: {output_path}")
                print(f"  Version: {version}")
                print(f"  Channel: {args.channel}")
                print(f"  Total versions in appcast: {item_count}")
                if versions:
                    print(f"  Versions (first 5): {', '.join(versions)}")
                print(f"  DMG: {args.dmg}")
                print(f"  URL: {args.url}")
        except Exception as e:
            print(f"Generated appcast: {output_path}")
            print(f"  Version: {version}")
            print(f"  Channel: {args.channel}")
            print(f"  DMG: {args.dmg}")
            print(f"  URL: {args.url}")
            print(f"  Warning: Could not parse appcast for debugging: {e}")
        if args.ed_signature:
            print(f"  Signature: EdDSA")
        elif args.signature:
            print(f"  Signature: DSA")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
