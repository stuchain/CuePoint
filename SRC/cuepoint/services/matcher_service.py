#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Matcher Service Implementation

Service for finding best Beatport matches for tracks.
"""

from typing import List, Optional, Dict, Tuple
from cuepoint.services.interfaces import IMatcherService
from cuepoint.core.matcher import best_beatport_match


class MatcherService(IMatcherService):
    """Implementation of track matching service."""
    
    def find_best_match(
        self,
        idx: int,
        track_title: str,
        track_artists_for_scoring: str,
        title_only_mode: bool,
        queries: List[str],
        input_year: Optional[int] = None,
        input_key: Optional[str] = None,
        input_mix: Optional[Dict[str, object]] = None,
        input_generic_phrases: Optional[List[str]] = None,
    ) -> tuple:
        """
        Find best Beatport match for a track.
        
        Returns:
            Tuple of (best_candidate, all_candidates, queries_audit, last_query_index)
        """
        return best_beatport_match(
            idx=idx,
            track_title=track_title,
            track_artists_for_scoring=track_artists_for_scoring,
            title_only_mode=title_only_mode,
            queries=queries,
            input_year=input_year,
            input_key=input_key,
            input_mix=input_mix,
            input_generic_phrases=input_generic_phrases,
        )
