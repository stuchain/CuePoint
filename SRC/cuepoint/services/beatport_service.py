#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport Service Implementation

Service for searching and fetching data from Beatport.
"""

from typing import List, Optional, Dict, Any
from cuepoint.services.interfaces import IBeatportService, ICacheService, ILoggingService
from cuepoint.data.beatport_search import beatport_search_hybrid
from cuepoint.data.beatport import parse_track_page


class BeatportService(IBeatportService):
    """Service for searching and fetching data from Beatport.
    
    This service provides access to Beatport's search and track data,
    with built-in caching to reduce API calls and improve performance.
    
    Attributes:
        cache_service: Service for caching search results and track data.
        logging_service: Service for logging operations.
    """
    
    def __init__(
        self,
        cache_service: ICacheService,
        logging_service: ILoggingService
    ) -> None:
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
        self.logging_service.info(f"Searching Beatport for: {query}")
        urls = beatport_search_hybrid(idx=0, query=query, max_results=max_results, prefer_direct=True)
        
        # Cache results (1 hour TTL)
        self.cache_service.set(cache_key, urls, ttl=3600)
        
        return urls
    
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
            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parse_track_page(url)
            
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
            
            return track_data
        except Exception as e:
            self.logging_service.error(f"Error fetching track data from {url}: {e}")
            return None
