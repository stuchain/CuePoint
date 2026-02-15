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
from typing import Dict, List, Optional

from cuepoint.update.security import FeedIntegrityVerifier, PackageIntegrityVerifier
from cuepoint.update.version_utils import (
    compare_versions,
    extract_base_version,
    is_test_version,
    parse_version,
)


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
        self.feed_url = feed_url.rstrip("/")
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

    def check_for_updates(self, platform: str, timeout: int = 30) -> Optional[Dict]:
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
            import logging

            logger = logging.getLogger(__name__)

            feed_url = self.get_feed_url(platform)
            logger.info("Checking for updates:")
            logger.info(f"  Feed URL: {feed_url}")
            logger.info(f"  Current version: {self.current_version}")
            logger.info(f"  Channel: {self.channel}")
            logger.info(f"  Platform: {platform}")

            appcast_data = self._fetch_appcast(feed_url, timeout)
            logger.debug(f"Fetched appcast: {len(appcast_data)} bytes")

            items = self._parse_appcast(appcast_data)
            logger.info(f"Parsed {len(items)} update item(s) from appcast")

            # Find latest version that's newer than current
            latest_update = self._find_latest_update(items)

            if latest_update:
                logger.info(
                    f"Update available: {latest_update.get('short_version')} "
                    f"(current: {self.current_version})"
                )
            else:
                logger.info(
                    f"No update available (current: {self.current_version} is latest)"
                )

            return latest_update
        finally:
            with self._lock:
                self._checking = False

    def check_update_from_appcast(self, appcast_data: bytes) -> Optional[Dict]:
        """
        Parse appcast data and find latest update (no network fetch).

        Used when fetch is done via QNetworkAccessManager on main thread
        to avoid urllib/SSL crashes in signed macOS apps.

        Args:
            appcast_data: Raw appcast XML bytes

        Returns:
            Latest update dict or None
        """
        with self._lock:
            if self._checking:
                return None
            self._checking = True

        try:
            items = self._parse_appcast(appcast_data)
            return self._find_latest_update(items)
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
        # Validate URL (Step 8.3)
        is_valid, error = FeedIntegrityVerifier.verify_feed_https(url)
        if not is_valid:
            raise UpdateCheckError(error or "Feed URL failed integrity checks")

        try:
            # Create request with User-Agent
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": f"CuePoint/{self.current_version}",
                    "Accept": "application/rss+xml, application/xml, text/xml",
                },
            )

            # Create SSL context: use certifi's CA bundle in packaged apps so SSL
            # verification works (GitHub build was failing with CERTIFICATE_VERIFY_FAILED
            # because the app bundle couldn't find the system CA store).
            try:
                try:
                    import certifi

                    ssl_context = ssl.create_default_context(cafile=certifi.where())
                except ImportError:
                    ssl_context = ssl.create_default_context()
            except Exception as ssl_error:
                import logging

                logger = logging.getLogger(__name__)
                logger.error(
                    f"Failed to create SSL context: {ssl_error}", exc_info=True
                )
                raise UpdateCheckError(f"SSL context creation failed: {ssl_error}")

            # Fetch with timeout
            try:
                with urllib.request.urlopen(
                    request, timeout=timeout, context=ssl_context
                ) as response:
                    if response.status != 200:
                        raise UpdateCheckError(
                            f"HTTP {response.status}: {response.reason}"
                        )

                    return response.read()
            except TimeoutError as timeout_error:
                import logging

                logger = logging.getLogger(__name__)
                logger.error(
                    f"Request timeout fetching appcast from {url}: {timeout_error}"
                )
                raise UpdateCheckError(f"Request timeout: {timeout_error}")

        except urllib.error.URLError as e:
            import logging

            logger = logging.getLogger(__name__)
            error_msg = str(e.reason) if hasattr(e, "reason") else str(e)
            logger.error(f"Network error fetching appcast from {url}: {error_msg}")
            raise UpdateCheckError(f"Network error: {error_msg}")
        except urllib.error.HTTPError as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"HTTP error {e.code} fetching appcast from {url}: {e.reason}")
            raise UpdateCheckError(f"HTTP error {e.code}: {e.reason}")
        except ssl.SSLError as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"SSL error fetching appcast from {url}: {e}")
            raise UpdateCheckError(f"SSL error: {e}")
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(
                f"Unexpected error fetching appcast from {url}: {e}", exc_info=True
            )
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
            channel = root.find("channel")
            if channel is None:
                raise UpdateCheckError("Invalid appcast: missing channel")

            # Find all items
            items = []
            for item in channel.findall("item"):
                item_data = self._parse_item(item)
                if item_data:
                    items.append(item_data)

            # Sort by semantic version (short_version) so 1.0.0-feb10 > 1.0.0-feb1
            def _item_sort_key(x):
                v = x.get("short_version") or x.get("version") or "0.0.0"
                return self._version_sort_key(v)

            items.sort(key=_item_sort_key, reverse=True)

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
            version_elem = item.find(f"{{{self.SPARKLE_NS}}}version")
            if version_elem is None:
                return None

            version = version_elem.text
            if not version:
                return None

            # Get short version
            short_version_elem = item.find(f"{{{self.SPARKLE_NS}}}shortVersionString")
            short_version = (
                short_version_elem.text if short_version_elem is not None else version
            )

            # Get enclosure
            enclosure = item.find("enclosure")
            if enclosure is None:
                return None

            download_url = enclosure.get("url")
            if not download_url:
                return None

            # Step 8.3: enforce HTTPS for download URLs
            is_valid, error = FeedIntegrityVerifier.verify_download_https(download_url)
            if not is_valid:
                return None

            # Get file size
            length_str = enclosure.get("length", "0")
            try:
                file_size = int(length_str)
            except ValueError:
                file_size = 0

            # Get signature
            signature = enclosure.get(
                f"{{{self.SPARKLE_NS}}}edSignature"
            ) or enclosure.get(f"{{{self.SPARKLE_NS}}}dsaSignature")
            # Checksum: explicit sparkle:sha256, or legacy 64-char hex in signature
            checksum = enclosure.get(f"{{{self.SPARKLE_NS}}}sha256")
            if checksum:
                checksum = checksum.strip().lower()
            if (
                not checksum
                and signature
                and PackageIntegrityVerifier.is_sha256_hex(signature.strip().lower())
            ):
                checksum = signature.strip().lower()
            if checksum and not PackageIntegrityVerifier.is_sha256_hex(checksum):
                checksum = None

            # Get release notes
            release_notes_elem = item.find("description")
            release_notes = None
            if release_notes_elem is not None and release_notes_elem.text:
                release_notes = release_notes_elem.text.strip()

            # Get release notes link
            release_notes_link_elem = item.find(
                f"{{{self.SPARKLE_NS}}}releaseNotesLink"
            )
            release_notes_url = (
                release_notes_link_elem.text
                if release_notes_link_elem is not None
                else None
            )

            # Get publication date
            pub_date_elem = item.find("pubDate")
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
                "checksum": checksum,
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

        Uses a two-stage comparison:
        1. Compare base versions (X.Y.Z) - if base is newer, check version type compatibility
        2. If base versions are equal, compare full versions (including prerelease)

        Version type filtering (test vs non-test):
        - Versions with a "-test" prerelease (e.g. 1.0.3-test1) can only update to other
          test versions (e.g. 1.0.4-test4).
        - Non-test versions (stable like 1.0.0, or prerelease like 1.0.0-alpha) can only
          update to non-test versions; they never see test releases as updates.

        This ensures that:
        - 1.0.0-alpha does not see 1.0.3-test4 as an update
        - 1.0.3-test1 sees 1.0.4-test4 as an update but not 1.0.4-alpha

        Args:
            items: List of update items (sorted by version, latest first)

        Returns:
            Latest update item or None if no update available
        """
        import logging

        logger = logging.getLogger(__name__)

        # Extract base version and whether current is a test release
        try:
            base_current = extract_base_version(self.current_version)
            current_is_test = is_test_version(self.current_version)
        except ValueError:
            logger.warning(f"Could not parse current version: {self.current_version}")
            return None

        logger.info(
            f"Finding latest update. Current: {self.current_version} "
            f"(base: {base_current}, test: {current_is_test}), "
            f"Channel: {self.channel}, Items: {len(items)}"
        )

        for item in items:
            # Use short_version (semantic version) for comparison
            # short_version contains the full version string like "1.0.1-test-unsigned53"
            # version (build number) like "202512181304" is NOT used for comparison
            version = item.get("short_version", "")
            if not version:
                logger.debug(
                    f"Skipping item: no short_version found "
                    f"(has short_version: {item.get('short_version')}, "
                    f"has version: {item.get('version')})"
                )
                continue

            # Skip if version looks like a build number (all digits)
            if version.isdigit():
                logger.debug(
                    f"Skipping item: version '{version}' is a build number, not semantic version"
                )
                continue

            # Try to parse as semantic version, skip if invalid
            try:
                base_candidate = extract_base_version(version)
                version_is_test = is_test_version(version)
            except (ValueError, AttributeError) as e:
                logger.debug(f"Skipping item: could not parse version '{version}': {e}")
                continue

            logger.debug(
                f"Checking version: {version} "
                f"(base: {base_candidate}, test: {version_is_test})"
            )

            # STAGE 1: Compare base versions (X.Y.Z)
            try:
                base_comparison = compare_versions(base_candidate, base_current)
            except ValueError as e:
                logger.warning(
                    f"Could not compare base versions '{base_candidate}' vs '{base_current}': {e}"
                )
                continue

            if base_comparison > 0:
                # Base version is newer - check if we should allow this update
                logger.info(
                    f"Found newer base version: {base_candidate} > {base_current}"
                )

                # Apply test vs non-test filtering: same track only
                if current_is_test and not version_is_test:
                    # Current is test, candidate is non-test (e.g. stable/alpha) - skip
                    logger.debug(
                        f"Skipping non-test version '{version}' "
                        f"(current is test '{self.current_version}')"
                    )
                    continue

                if not current_is_test and version_is_test:
                    # Current is non-test, candidate is test - skip
                    logger.debug(
                        f"Skipping test version '{version}' "
                        f"(current is non-test '{self.current_version}')"
                    )
                    continue

                # Both on same track (both test or both non-test) - allow if newer
                # Design 4.27, 4.109: require checksum; skip item if missing (no update offered).
                if not item.get("checksum"):
                    logger.debug(
                        f"Skipping item {version}: no checksum (SHA256 required)"
                    )
                    continue
                logger.info(
                    f"Found newer version: {version} (current: {self.current_version})"
                )
                return item

            elif base_comparison == 0:
                # Same base version (e.g. 1.0.0 vs 1.0.0-feb10): do not offer as update.
                # Only offer when base version increases (e.g. 1.0.0 -> 1.0.2).
                logger.debug(
                    f"Same base version: {base_candidate} == {base_current}, skipping"
                )
                continue
            # else: base_comparison < 0, candidate is older, skip

        logger.info("No newer version found")
        return None
