#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate update feeds (appcast)

Usage:
    python scripts/validate_feeds.py [--macos <appcast.xml>] [--windows <appcast.xml>]
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def validate_appcast(appcast_path):
    """Validate macOS appcast XML
    
    Args:
        appcast_path: Path to appcast.xml
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    appcast_path = Path(appcast_path)
    if not appcast_path.exists():
        return False, f"Appcast not found: {appcast_path}"
    
    try:
        tree = ET.parse(appcast_path)
        root = tree.getroot()
        
        # Validate structure
        if root.tag != 'rss':
            return False, "Invalid root element (expected 'rss')"
        
        # Check for Sparkle namespace
        # Namespace can be declared as xmlns:sparkle or in root.attrib
        sparkle_ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
        has_namespace = (
            'xmlns:sparkle' in root.attrib and root.attrib['xmlns:sparkle'] == sparkle_ns
        ) or sparkle_ns in root.attrib.values()
        
        if not has_namespace:
            return False, "Missing Sparkle namespace"
        
        # Check for channel
        channel = root.find('channel')
        if channel is None:
            return False, "Missing 'channel' element"
        
        # Check for items
        items = channel.findall('item')
        if not items:
            return False, "No release items found"
        
        # Validate each item
        for item in items:
            # Check required fields
            version = item.find('{http://www.andymatuschak.org/xml-namespaces/sparkle}version')
            if version is None:
                return False, "Missing sparkle:version in item"
            
            enclosure = item.find('enclosure')
            if enclosure is None:
                return False, "Missing enclosure in item"
            
            if 'url' not in enclosure.attrib:
                return False, "Missing url in enclosure"
            
            if 'length' not in enclosure.attrib:
                return False, "Missing length in enclosure"
        
        return True, "Appcast valid"
        
    except ET.ParseError as e:
        return False, f"XML parse error: {e}"
    except Exception as e:
        return False, f"Validation error: {e}"


def validate_update_feed(feed_path):
    """Validate Windows update feed XML (Sparkle-compatible)
    
    Args:
        feed_path: Path to appcast.xml (Windows uses Sparkle-compatible XML)
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    feed_path = Path(feed_path)
    if not feed_path.exists():
        return False, f"Update feed not found: {feed_path}"
    
    try:
        # Windows uses Sparkle-compatible XML format (same as macOS)
        tree = ET.parse(feed_path)
        root = tree.getroot()
        
        # Validate structure
        if root.tag != 'rss':
            return False, "Invalid root element (expected 'rss')"
        
        # Check for Sparkle namespace
        sparkle_ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
        has_namespace = (
            'xmlns:sparkle' in root.attrib and root.attrib['xmlns:sparkle'] == sparkle_ns
        ) or sparkle_ns in root.attrib.values()
        
        if not has_namespace:
            return False, "Missing Sparkle namespace"
        
        # Check for channel
        channel = root.find('channel')
        if channel is None:
            return False, "Missing 'channel' element"
        
        # Check for items
        items = channel.findall('item')
        if not items:
            return False, "No release items found"
        
        # Validate each item
        for item in items:
            # Check required fields
            version = item.find('{http://www.andymatuschak.org/xml-namespaces/sparkle}version')
            if version is None:
                return False, "Missing sparkle:version in item"
            
            enclosure = item.find('enclosure')
            if enclosure is None:
                return False, "Missing enclosure in item"
            
            if 'url' not in enclosure.attrib:
                return False, "Missing url in enclosure"
            
            if 'length' not in enclosure.attrib:
                return False, "Missing length in enclosure"
        
        return True, "Update feed valid"
        
    except ET.ParseError as e:
        return False, f"XML parse error: {e}"
    except Exception as e:
        return False, f"Validation error: {e}"


def main():
    """Main function"""
    # Set UTF-8 encoding for Windows console compatibility
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    
    parser = argparse.ArgumentParser(
        description='Validate update feeds (appcast)'
    )
    parser.add_argument('--macos',
                       help='Path to macOS appcast.xml (default: updates/macos/appcast.xml)')
    parser.add_argument('--windows',
                       help='Path to Windows appcast.xml (default: updates/windows/appcast.xml)')
    
    args = parser.parse_args()
    
    errors = []
    
    # Validate macOS appcast
    if args.macos or not args.windows:
        appcast_path = args.macos or 'updates/macos/appcast.xml'
        valid, message = validate_appcast(appcast_path)
        if valid:
            print(f"[PASS] macOS appcast: {message}")
        else:
            print(f"[FAIL] macOS appcast: {message}")
            errors.append(f"macOS: {message}")
    
    # Validate Windows feed
    if args.windows or not args.macos:
        feed_path = args.windows or 'updates/windows/appcast.xml'
        valid, message = validate_update_feed(feed_path)
        if valid:
            print(f"[PASS] Windows feed: {message}")
        else:
            print(f"[FAIL] Windows feed: {message}")
            errors.append(f"Windows: {message}")
    
    if errors:
        print("\nValidation failed:")
        for error in errors:
            print(f"  {error}")
        sys.exit(1)
    
    print("\nAll feeds validated successfully")


if __name__ == '__main__':
    main()
