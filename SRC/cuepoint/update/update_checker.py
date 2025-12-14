#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update checker implementation.

Fetches and parses appcast feeds to check for available updates.
"""

import ssl
import threading
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse

from cuepoint.update.version_utils import compare_versions, is_stable_version, parse_version


class UpdateCheckError(Exception):
    """Exception raised during update checking."""
    pass


class UpdateChecker:
    """
    Checks for available updates by fetching and parsing appcast feeds.
    """
    
    # Sparkle namespace
    SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"
    
    def __init__(self, feed_url: str, current_version: str, channel: str = "stable"):
        """
        Initialize update checker.
        
        Args:
            feed_url: Base URL for update feeds (e.g., "https://stuchain.github.io/CuePoint/updates/")
            current_version: Current application version
            channel: Update channel ("stable" or "beta")
        """
        self.feed_url = feed_url.rstrip('/')
        self.current_version = current_version
        self.channel = channel
        self._lock = threading.Lock()
        self._checking = False
    
    def get_feed_url(self, platform: str) -> str:
        """
        Get full feed URL for platform and channel.
        
        Args:
            platform: "macos" or "windows"
            
        Returns:
            Full feed URL
        """
        return f"{self.feed_url}/{platform}/{self.channel}/appcast.xml"
    
    def check_for_updates(self, platform: str, timeout: int = 10) -> Optional[Dict]:
        """
        Check for available updates.
        
        Args:
            platform: "macos" or "windows"
            timeout: Request timeout in seconds
            
        Returns:
            Dictionary with update information if update available, None otherwise.
            Format: {
                "version": "1.0.1",
                "short_version": "1.0.1",
                "download_url": "https://...",
                "release_notes_url": "https://...",
                "release_notes": "...",
                "file_size": 52428800,
                "signature": "...",
                "pub_date": datetime,
            }
            
        Raises:
            UpdateCheckError: If check fails
        """
        with self._lock:
            if self._checking:
                raise UpdateCheckError("Update check already in progress")
            self._checking = True
        
        try:
            feed_url = self.get_feed_url(platform)
            appcast_data = self._fetch_appcast(feed_url, timeout)
            items = self._parse_appcast(appcast_data)
            
            # Find latest version that's newer than current
            latest_update = self._find_latest_update(items)
            
            return latest_update
        finally:
            with self._lock:
                self._checking = False
    
    def _fetch_appcast(self, url: str, timeout: int) -> bytes:
        """
        Fetch appcast XML from URL.
        
        Args:
            url: Appcast URL
            timeout: Request timeout in seconds
            
        Returns:
            Appcast XML as bytes
            
        Raises:
            UpdateCheckError: If fetch fails
        """
        # Validate URL
        parsed = urlparse(url)
        if parsed.scheme != 'https':
            raise UpdateCheckError("Feed URL must use HTTPS")
        
        try:
            # Create request with User-Agent
            request = urllib.request.Request(
                url,
                headers={
                    'User-Agent': f'CuePoint/{self.current_version}',
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                }
            )
            
            # Create SSL context
            ssl_context = ssl.create_default_context()
            
            # Fetch with timeout
            with urllib.request.urlopen(request, timeout=timeout, context=ssl_context) as response:
                if response.status != 200:
                    raise UpdateCheckError(f"HTTP {response.status}: {response.reason}")
                
                return response.read()
        
        except urllib.error.URLError as e:
            raise UpdateCheckError(f"Network error: {e.reason}")
        except urllib.error.HTTPError as e:
            raise UpdateCheckError(f"HTTP error {e.code}: {e.reason}")
        except ssl.SSLError as e:
            raise UpdateCheckError(f"SSL error: {e}")
        except Exception as e:
            raise UpdateCheckError(f"Unexpected error: {e}")
    
    def _parse_appcast(self, appcast_data: bytes) -> List[Dict]:
        """
        Parse appcast XML and extract update items.
        
        Args:
            appcast_data: Appcast XML as bytes
            
        Returns:
            List of update item dictionaries
            
        Raises:
            UpdateCheckError: If parsing fails
        """
        try:
            root = ET.fromstring(appcast_data)
            
            # Find channel
            channel = root.find('channel')
            if channel is None:
                raise UpdateCheckError("Invalid appcast: missing channel")
            
            # Find all items
            items = []
            for item in channel.findall('item'):
                item_data = self._parse_item(item)
                if item_data:
                    items.append(item_data)
            
            # Sort by version (latest first)
            items.sort(key=lambda x: self._version_sort_key(x['version']), reverse=True)
            
            return items
        
        except ET.ParseError as e:
            raise UpdateCheckError(f"XML parse error: {e}")
        except Exception as e:
            raise UpdateCheckError(f"Parse error: {e}")
    
    def _parse_item(self, item: ET.Element) -> Optional[Dict]:
        """
        Parse a single appcast item.
        
        Args:
            item: XML item element
            
        Returns:
            Item dictionary or None if invalid
        """
        try:
            # Get version
            version_elem = item.find(f'{{{self.SPARKLE_NS}}}version')
            if version_elem is None:
                return None
            
            version = version_elem.text
            if not version:
                return None
            
            # Get short version
            short_version_elem = item.find(f'{{{self.SPARKLE_NS}}}shortVersionString')
            short_version = short_version_elem.text if short_version_elem is not None else version
            
            # Get enclosure
            enclosure = item.find('enclosure')
            if enclosure is None:
                return None
            
            download_url = enclosure.get('url')
            if not download_url:
                return None
            
            # Get file size
            length_str = enclosure.get('length', '0')
            try:
                file_size = int(length_str)
            except ValueError:
                file_size = 0
            
            # Get signature
            signature = enclosure.get(f'{{{self.SPARKLE_NS}}}edSignature') or enclosure.get(f'{{{self.SPARKLE_NS}}}dsaSignature')
            
            # Get release notes
            release_notes_elem = item.find('description')
            release_notes = None
            if release_notes_elem is not None and release_notes_elem.text:
                release_notes = release_notes_elem.text.strip()
            
            # Get release notes link
            release_notes_link_elem = item.find(f'{{{self.SPARKLE_NS}}}releaseNotesLink')
            release_notes_url = release_notes_link_elem.text if release_notes_link_elem is not None else None
            
            # Get publication date
            pub_date_elem = item.find('pubDate')
            pub_date = None
            if pub_date_elem is not None and pub_date_elem.text:
                try:
                    # Parse RFC 822 date
                    from email.utils import parsedate_to_datetime
                    pub_date = parsedate_to_datetime(pub_date_elem.text)
                except (ValueError, TypeError):
                    pass
            
            return {
                "version": version,
                "short_version": short_version,
                "download_url": download_url,
                "release_notes_url": release_notes_url,
                "release_notes": release_notes,
                "file_size": file_size,
                "signature": signature,
                "pub_date": pub_date,
            }
        
        except Exception:
            return None
    
    def _version_sort_key(self, version: str) -> tuple:
        """
        Get sort key for version string.
        
        Args:
            version: Version string
            
        Returns:
            Tuple for sorting
        """
        try:
            major, minor, patch, prerelease = parse_version(version)
            # Sort prerelease versions after stable versions
            prerelease_key = (1 if prerelease else 0, prerelease or "")
            return (major, minor, patch, prerelease_key)
        except ValueError:
            # Invalid version - sort to end
            return (0, 0, 0, (1, ""))
    
    def _find_latest_update(self, items: List[Dict]) -> Optional[Dict]:
        """
        Find the latest update that's newer than current version.
        
        Args:
            items: List of update items (sorted by version, latest first)
            
        Returns:
            Latest update item or None if no update available
        """
        for item in items:
            version = item['version']
            
            # Skip prerelease versions if on stable channel
            if self.channel == "stable" and not is_stable_version(version):
                continue
            
            # Check if version is newer
            if compare_versions(version, self.current_version) > 0:
                return item
        
        return None
