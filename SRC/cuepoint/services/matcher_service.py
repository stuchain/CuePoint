#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Matcher Service Implementation

Service for finding best Beatport matches for tracks.
"""

from typing import Dict, List, Optional, Tuple

from cuepoint.core.matcher import best_beatport_match
from cuepoint.data.beatport import BeatportCandidate
from cuepoint.services.interfaces import IMatcherService


class MatcherService(IMatcherService):
    """Service for finding best Beatport matches for tracks.

    This service wraps the core matching algorithm and provides a clean
    interface for finding the best Beatport match for a given track.

    Attributes:
        None (stateless service)
    """

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
    ) -> Tuple[
        Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int, str, int, int]], int
    ]:
        """Find best Beatport match for a track.

        Executes search queries, fetches candidate data, scores candidates,
        and returns the best match along with all candidates and query audit trail.

        Args:
            idx: Track index (1-based) for logging.
            track_title: Track title to match.
            track_artists_for_scoring: Artist string for scoring (may differ from title).
            title_only_mode: If True, only match on title (ignore artist).
            queries: List of search queries to execute.
            input_year: Optional input year for bonus scoring.
            input_key: Optional input key for bonus scoring.
            input_mix: Optional mix flags dictionary.
            input_generic_phrases: Optional list of generic phrases from title.

        Returns:
            Tuple containing:
            - best_candidate: Best matching BeatportCandidate or None if no match
            - all_candidates: List of all evaluated BeatportCandidate objects
            - queries_audit: List of query execution audit tuples (query_index, query_text, candidate_count, elapsed_ms)
            - last_query_index: Index of last query executed (0-based)

        Example:
            >>> service = MatcherService()
            >>> best, candidates, audit, last_idx = service.find_best_match(
            ...     idx=1,
            ...     track_title="Never Sleep Again",
            ...     track_artists_for_scoring="Tim Green",
            ...     title_only_mode=False,
            ...     queries=["Never Sleep Again Tim Green"]
            ... )
            >>> if best:
            ...     print(f"Found: {best.title}")
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
