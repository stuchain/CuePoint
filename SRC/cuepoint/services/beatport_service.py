#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport Service Implementation

Service for searching and fetching data from Beatport.
"""

from typing import Any, Dict, List, Optional

from cuepoint.data.beatport import parse_track_page
from cuepoint.data.beatport_search import beatport_search_hybrid
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.interfaces import IBeatportService, ICacheService, ILoggingService


class BeatportService(IBeatportService):
    """Service for searching and fetching data from Beatport.

    This service provides access to Beatport's search and track data,
    with built-in caching to reduce API calls and improve performance.

    Attributes:
        cache_service: Service for caching search results and track data.
        logging_service: Service for logging operations.
    """

    def __init__(self, cache_service: ICacheService, logging_service: ILoggingService) -> None:
        """Initialize Beatport service.

        Args:
            cache_service: Service for caching operations.
            logging_service: Service for logging operations.
        """
        self.cache_service = cache_service
        self.logging_service = logging_service

    def search_tracks(self, query: str, max_results: int = 50) -> List[str]:
        """Search for tracks on Beatport and return URLs.

        Searches Beatport using a hybrid search strategy (DuckDuckGo + direct)
        and returns a list of track URLs. Results are cached for 1 hour.

        Args:
            query: Search query string.
            max_results: Maximum number of results to return (default: 50).

        Returns:
            List of Beatport track URLs.

        Example:
            >>> urls = service.search_tracks("Never Sleep Again Tim Green", max_results=10)
            >>> print(f"Found {len(urls)} tracks")
        """
        # Check cache first
        cache_key = f"search:{query}:{max_results}"
        cached = self.cache_service.get(cache_key)
        if cached:
            self.logging_service.debug(f"Cache hit for query: {query}")
            return cached

        # Perform search
        try:
            self.logging_service.info(f"Searching Beatport for: {query}")
            
            # Test if ddgs is available before searching
            try:
                from duckduckgo_search import DDGS

                # Try to create a DDGS instance to verify it works
                test_ddgs = DDGS()
                del test_ddgs
            except ImportError as import_err:
                self.logging_service.warning(
                    f"DuckDuckGo search (ddgs) not available: {import_err!r}. "
                    "Track search may be limited. Falling back to direct search only."
                )
            except Exception as test_err:
                self.logging_service.warning(
                    f"DuckDuckGo search (ddgs) test failed: {test_err!r}. "
                    "Track search may be limited."
                )
            
            urls = beatport_search_hybrid(
                idx=0, query=query, max_results=max_results, prefer_direct=True
            )
            
            self.logging_service.info(f"Found {len(urls)} track URLs for query: {query}")

            # Cache results (1 hour TTL)
            self.cache_service.set(cache_key, urls, ttl=3600)

            return urls  # type: ignore[no-any-return]
        except Exception as e:
            error_msg = f"Failed to search Beatport for '{query}': {str(e)}"
            self.logging_service.error(
                error_msg, exc_info=e, extra={"query": query, "max_results": max_results}
            )
            # Log additional diagnostic info
            import sys
            import traceback
            self.logging_service.debug(
                f"Search error details:\n"
                f"  Exception type: {type(e).__name__}\n"
                f"  Exception args: {e.args}\n"
                f"  Traceback: {traceback.format_exc()}\n"
                f"  Python version: {sys.version}\n"
                f"  Frozen: {getattr(sys, 'frozen', False)}"
            )
            raise BeatportAPIError(
                message=error_msg,
                error_code="BEATPORT_SEARCH_ERROR",
                context={"query": query, "max_results": max_results},
            ) from e

    def fetch_track_data(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed track data from Beatport URL.

        Parses a Beatport track page and extracts all metadata:
        title, artists, key, year, BPM, label, genres, release info.
        Results are cached for 24 hours.

        Args:
            url: Beatport track URL to fetch.

        Returns:
            Dictionary containing track data, or None if fetch failed.
            Keys: url, title, artists, key, year, bpm, label, genres,
            release_name, release_date.

        Raises:
            Logs errors but returns None instead of raising exceptions.

        Example:
            >>> data = service.fetch_track_data("https://www.beatport.com/track/...")
            >>> print(data["title"])
        """
        # Check cache
        cache_key = f"track:{url}"
        cached = self.cache_service.get(cache_key)
        if cached:
            return cached

        # Fetch from API
        try:
            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parse_track_page(
                url
            )

            track_data = {
                "url": url,
                "title": title,
                "artists": artists,
                "key": key,
                "year": year,
                "bpm": bpm,
                "label": label,
                "genres": genres,
                "release_name": rel_name,
                "release_date": rel_date,
            }

            # Cache result (24 hours TTL)
            self.cache_service.set(cache_key, track_data, ttl=86400)

            return track_data  # type: ignore[no-any-return]
        except Exception as e:
            error_msg = f"Error fetching track data from {url}: {str(e)}"
            self.logging_service.error(
                error_msg, exc_info=e, extra={"url": url, "cache_key": cache_key}
            )
            # Return None instead of raising - allows processing to continue with other tracks
            return None
