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
    """Implementation of Beatport API service."""
    
    def __init__(
        self,
        cache_service: ICacheService,
        logging_service: ILoggingService
    ):
        self.cache_service = cache_service
        self.logging_service = logging_service
    
    def search_tracks(self, query: str, max_results: int = 50) -> List[str]:
        """Search for tracks on Beatport and return URLs."""
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
        """Fetch track data from Beatport URL."""
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
