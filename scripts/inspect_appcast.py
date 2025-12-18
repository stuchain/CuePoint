#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Inspect Appcast Feed

Inspects an appcast feed to see what versions are available and their details.
Useful for debugging update detection issues.

Usage:
    python scripts/inspect_appcast.py [feed_url]
    
    Default: https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml
"""

import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'SRC'))

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.version_utils import extract_base_version, is_stable_version


def inspect_appcast(feed_url: str):
    """Inspect an appcast feed and display its contents."""
    print("=" * 70)
    print(f"Inspecting Appcast Feed")
    print("=" * 70)
    print(f"URL: {feed_url}\n")
    
    try:
        # Fetch feed
        print("Fetching feed...")
        request = urllib.request.Request(
            feed_url,
            headers={
                'User-Agent': 'CuePoint-Appcast-Inspector/1.0',
                'Accept': 'application/rss+xml, application/xml, text/xml',
            }
        )
        
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status != 200:
                print(f"Error: HTTP {response.status}: {response.reason}")
                return
            data = response.read()
        
        print(f"✓ Fetched {len(data)} bytes\n")
        
        # Parse XML
        root = ET.fromstring(data)
        channel = root.find('channel')
        
        if channel is None:
            print("Error: Invalid appcast - missing <channel> element")
            return
        
        # Display feed info
        title = channel.find('title')
        link = channel.find('link')
        description = channel.find('description')
        
        print("Feed Information:")
        print(f"  Title: {title.text if title is not None else 'N/A'}")
        print(f"  Link: {link.text if link is not None else 'N/A'}")
        print(f"  Description: {description.text if description is not None else 'N/A'}")
        print()
        
        # Check for Sparkle namespace
        sparkle_ns = "http://www.andymatuschak.org/xml-namespaces/sparkle"
        has_sparkle_ns = f"{{{sparkle_ns}}}" in str(root.attrib) or 'xmlns:sparkle' in root.attrib
        print(f"Sparkle Namespace: {'✓ Present' if has_sparkle_ns else '✗ Missing'}")
        print()
        
        # Display items
        items = channel.findall('item')
        print(f"Update Items: {len(items)}\n")
        
        if not items:
            print("No update items found in feed.")
            return
        
        for idx, item in enumerate(items, 1):
            print(f"{'=' * 70}")
            print(f"Item {idx}:")
            print(f"{'=' * 70}")
            
            # Title
            title_elem = item.find('title')
            print(f"Title: {title_elem.text if title_elem is not None else 'N/A'}")
            
            # Version info
            version_elem = item.find(f'{{{sparkle_ns}}}version')
            short_version_elem = item.find(f'{{{sparkle_ns}}}shortVersionString')
            
            build_number = version_elem.text if version_elem is not None else 'N/A'
            semantic_version = short_version_elem.text if short_version_elem is not None else 'N/A'
            
            print(f"Build Number (sparkle:version): {build_number}")
            print(f"Semantic Version (sparkle:shortVersionString): {semantic_version}")
            
            if semantic_version != 'N/A':
                try:
                    base_version = extract_base_version(semantic_version)
                    is_prerelease = not is_stable_version(semantic_version)
                    print(f"  Base Version: {base_version}")
                    print(f"  Is Prerelease: {is_prerelease}")
                except Exception as e:
                    print(f"  [Could not parse version: {e}]")
            
            # Enclosure
            enclosure = item.find('enclosure')
            if enclosure is not None:
                url = enclosure.get('url', 'N/A')
                length = enclosure.get('length', 'N/A')
                file_type = enclosure.get('type', 'N/A')
                print(f"\nDownload:")
                print(f"  URL: {url}")
                print(f"  Size: {length} bytes ({int(length) / 1024 / 1024:.2f} MB)" if length != 'N/A' and length.isdigit() else f"  Size: {length}")
                print(f"  Type: {file_type}")
            
            # Release notes
            release_notes_link = item.find(f'{{{sparkle_ns}}}releaseNotesLink')
            if release_notes_link is not None:
                print(f"\nRelease Notes: {release_notes_link.text}")
            
            # Publication date
            pub_date = item.find('pubDate')
            if pub_date is not None:
                print(f"Published: {pub_date.text}")
            
            print()
        
        print("=" * 70)
        print("Summary")
        print("=" * 70)
        print(f"Total items: {len(items)}")
        
        if items:
            # Get versions
            versions = []
            for item in items:
                short_version = item.find(f'{{{sparkle_ns}}}shortVersionString')
                if short_version is not None:
                    versions.append(short_version.text)
            
            if versions:
                print(f"Versions found: {', '.join(versions)}")
                print(f"Latest version: {versions[0]}")
        
    except urllib.error.URLError as e:
        print(f"Error: Could not fetch feed: {e.reason}")
        print(f"\nPossible issues:")
        print(f"  - Feed URL is incorrect")
        print(f"  - GitHub Pages is not enabled")
        print(f"  - Network connectivity issue")
        print(f"  - Feed has not been published yet")
    except ET.ParseError as e:
        print(f"Error: Could not parse XML: {e}")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


def main():
    feed_url = sys.argv[1] if len(sys.argv) > 1 else \
        "https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml"
    
    inspect_appcast(feed_url)


if __name__ == "__main__":
    main()
