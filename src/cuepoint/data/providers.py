#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Search provider abstraction layer (Step 12: Future-Proofing).

This module defines the SearchProvider interface and provider registry.
Providers encapsulate search and parse logic per metadata source (Beatport, etc.).
Adding a new provider does not require core pipeline changes.

Design 12.1, 12.8, 12.31: Provider interface, registry, adapter pattern.
"""

from typing import Any, Dict, List, Optional, Protocol

# Error codes (Design 12.99)
F001_PROVIDER_MISSING = "F001"
F002_MIGRATION_FAILED = "F002"
F003_SCHEMA_UNSUPPORTED = "F003"


class SearchProvider(Protocol):
    """Protocol for search providers (Design 12.10, 12.70).

    Providers must implement:
    - search: Find track URLs from a query string
    - parse: Extract metadata from a track URL

    Required fields in parse result (Design 12.71):
    - title, artist, bpm, key
    Optional (Design 12.72): label, genre, release_name, release_date
    """

    def search(self, idx: int, query: str, max_results: int = 50) -> List[str]:
        """Search for track URLs.

        Args:
            idx: Track index for logging.
            query: Search query string.
            max_results: Maximum URLs to return.

        Returns:
            List of track URLs (e.g., Beatport track URLs).
        """
        ...

    def parse(self, url: str) -> Optional[Dict[str, Any]]:
        """Parse a track page and extract metadata.

        Args:
            url: Track URL to parse.

        Returns:
            Dict with required keys: title, artists, key, release_year, bpm,
            label, genres, release_name, release_date. Returns None on failure.
        """
        ...

    @property
    def name(self) -> str:
        """Provider identifier (lowercase, e.g., 'beatport')."""
        ...


class BeatportProvider:
    """Beatport search provider (Design 12.32).

    Wraps existing Beatport search and parse logic.
    """

    @property
    def name(self) -> str:
        return "beatport"

    def search(self, idx: int, query: str, max_results: int = 50) -> List[str]:
        """Search Beatport via hybrid (direct + DuckDuckGo) strategy."""
        from cuepoint.data.beatport_search import beatport_search_hybrid

        return beatport_search_hybrid(
            idx=idx, query=query, max_results=max_results, prefer_direct=True
        )

    def parse(self, url: str) -> Optional[Dict[str, Any]]:
        """Parse Beatport track page and return metadata dict."""
        from cuepoint.data.beatport import parse_track_page

        result = parse_track_page(url)
        if not result:
            return None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        return {
            "url": url,
            "title": title or "",
            "artists": artists or "",
            "key": key,
            "year": year,
            "bpm": bpm,
            "label": label,
            "genres": genres,
            "release_name": rel_name,
            "release_date": rel_date,
        }


# Provider registry (Design 12.8, 12.9)
_PROVIDERS: Dict[str, SearchProvider] = {
    "beatport": BeatportProvider(),
}


def get_provider(name: str) -> Optional[SearchProvider]:
    """Get provider by name.

    Args:
        name: Provider name (lowercase, e.g., 'beatport').

    Returns:
        Provider instance or None if not found.
    """
    return _PROVIDERS.get(name.lower() if name else "")


def get_active_provider(active_name: Optional[str] = None) -> SearchProvider:
    """Get the active provider, with fallback to beatport.

    Args:
        active_name: Provider name from config. If None/invalid, uses 'beatport'.

    Returns:
        Provider instance.

    Raises:
        ValueError: If active_name is set but provider not found (F001).
    """
    name = (active_name or "beatport").lower().strip()
    provider = get_provider(name)
    if provider is None:
        available = ", ".join(_PROVIDERS.keys())
        raise ValueError(
            f"{F001_PROVIDER_MISSING}: Provider '{name}' not found. Available: {available}"
        )
    return provider


def list_providers() -> List[str]:
    """List registered provider names."""
    return list(_PROVIDERS.keys())


def register_provider(name: str, provider: SearchProvider) -> None:
    """Register a provider (for testing or plugins).

    Args:
        name: Provider name (lowercase).
        provider: Provider instance.
    """
    _PROVIDERS[name.lower()] = provider
