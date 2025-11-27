#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Processor Service Implementation

Service for processing tracks and playlists.
"""

import time
from typing import Any, Dict, List, Optional

from cuepoint.core.mix_parser import _extract_generic_parenthetical_phrases, _parse_mix_flags
from cuepoint.core.query_generator import make_search_queries
from cuepoint.core.text_processing import sanitize_title_for_search
from cuepoint.data.rekordbox import RBTrack, extract_artists_from_title
from cuepoint.models.config import SETTINGS
from cuepoint.services.interfaces import (
    IBeatportService,
    IConfigService,
    ILoggingService,
    IMatcherService,
    IProcessorService,
)
from cuepoint.ui.gui_interface import TrackResult


class ProcessorService(IProcessorService):
    """Service for processing tracks and playlists.

    This service coordinates the entire track processing workflow:
    1. Extracts and sanitizes track information
    2. Generates search queries
    3. Executes matching via MatcherService
    4. Builds and returns TrackResult objects

    Attributes:
        beatport_service: Service for Beatport API access.
        matcher_service: Service for finding best matches.
        logging_service: Service for logging operations.
        config_service: Service for configuration management.
    """

    def __init__(
        self,
        beatport_service: IBeatportService,
        matcher_service: IMatcherService,
        logging_service: ILoggingService,
        config_service: IConfigService,
    ) -> None:
        """Initialize processor service.

        Args:
            beatport_service: Service for Beatport API access.
            matcher_service: Service for finding best matches.
            logging_service: Service for logging operations.
            config_service: Service for configuration management.
        """
        self.beatport_service = beatport_service
        self.matcher_service = matcher_service
        self.logging_service = logging_service
        self.config_service = config_service

    def process_track(
        self, idx: int, track: RBTrack, settings: Optional[Dict[str, Any]] = None
    ) -> TrackResult:
        """Process a single track and return match result.

        This method:
        1. Extracts and sanitizes track title and artists
        2. Generates search queries
        3. Executes matching via MatcherService
        4. Builds TrackResult with match information

        Args:
            idx: Track index (1-based) for logging.
            track: RBTrack object containing track information.
            settings: Optional settings dictionary to override defaults.

        Returns:
            TrackResult object containing:
            - Original track information
            - Best match (if found) with Beatport data
            - Match scores and confidence
            - All candidates and queries executed

        Example:
            >>> track = RBTrack(title="Never Sleep Again", artists="Tim Green")
            >>> result = service.process_track(1, track)
            >>> print(result.matched)
            True
        """
        # Use provided settings or fall back to config service
        effective_settings = (
            settings
            if settings is not None
            else {key: self.config_service.get(key, SETTINGS.get(key)) for key in SETTINGS.keys()}
        )

        t0 = time.perf_counter()

        # Extract artists, clean title
        original_artists = track.artists or ""
        title_for_search = sanitize_title_for_search(track.title)
        artists_for_scoring = original_artists

        title_only_search = False
        extracted = False

        if not original_artists.strip():
            ex = extract_artists_from_title(track.title)
            if ex:
                artists_for_scoring, extracted_title = ex
                title_for_search = sanitize_title_for_search(extracted_title)
                extracted = True
            title_only_search = True

        self.logging_service.info(
            f"[{idx}] Processing: {title_for_search} - {original_artists or artists_for_scoring}"
        )

        if extracted and title_only_search:
            self.logging_service.debug(
                f"[{idx}] Artists inferred from title for scoring; search is title-only"
            )

        # Generate queries
        queries = make_search_queries(
            title_for_search,
            ("" if title_only_search else artists_for_scoring),
            original_title=track.title,
        )

        self.logging_service.debug(f"[{idx}] Generated {len(queries)} queries")

        # Extract mix flags
        input_mix_flags = _parse_mix_flags(track.title)
        input_generic_phrases = _extract_generic_parenthetical_phrases(track.title)

        # Execute matching
        min_accept_score = effective_settings.get("MIN_ACCEPT_SCORE", 70)

        best, all_candidates, queries_audit, last_qidx = self.matcher_service.find_best_match(
            idx=idx,
            track_title=title_for_search,
            track_artists_for_scoring=artists_for_scoring,
            title_only_mode=title_only_search,
            queries=queries,
            input_mix=input_mix_flags,
            input_generic_phrases=input_generic_phrases,
        )

        dur = (time.perf_counter() - t0) * 1000

        # Build result
        if best and best.score >= min_accept_score:
            # Match found
            self.logging_service.info(
                f"[{idx}] Match found: {best.title} - {best.artists} (score: {best.score:.1f})"
            )

            # Fetch full track data if needed
            track_data = self.beatport_service.fetch_track_data(best.url)

            # Build candidates list
            candidates = []
            for cand in all_candidates:
                candidates.append(
                    {
                        "url": cand.url,
                        "title": cand.title,
                        "artists": cand.artists,
                        "score": cand.score,
                        "title_sim": cand.title_sim,
                        "artist_sim": cand.artist_sim,
                    }
                )

            # Build queries list
            queries_list = []
            for q_idx, q_text, cand_count, elapsed_ms in queries_audit:
                queries_list.append(
                    {
                        "index": q_idx,
                        "query": q_text,
                        "candidates": cand_count,
                        "elapsed_ms": elapsed_ms,
                    }
                )

            return TrackResult(
                playlist_index=idx,
                title=track.title,
                artist=original_artists or artists_for_scoring,
                matched=True,
                beatport_url=best.url,
                beatport_title=best.title,
                beatport_artists=best.artists,
                beatport_key=best.key,
                beatport_key_camelot=best.key,  # TODO: convert to Camelot
                beatport_year=str(best.release_year) if best.release_year else None,
                beatport_bpm=best.bpm,
                beatport_label=best.label,
                beatport_genres=best.genres,
                beatport_release=best.release_name,
                beatport_release_date=best.release_date,
                match_score=best.score,
                title_sim=float(best.title_sim),
                artist_sim=float(best.artist_sim),
                confidence="high" if best.score >= 95 else "med" if best.score >= 85 else "low",
                search_query_index=str(best.query_index),
                search_stop_query_index=str(last_qidx),
                candidate_index=str(best.candidate_index),
                candidates=candidates,
                queries=queries_list,
            )
        else:
            # No match found
            self.logging_service.warning(f"[{idx}] No match found (duration: {dur:.0f} ms)")

            return TrackResult(
                playlist_index=idx,
                title=track.title,
                artist=original_artists or artists_for_scoring,
                matched=False,
                match_score=0.0,
                title_sim=0.0,
                artist_sim=0.0,
                confidence="low",
            )

    def process_playlist(
        self, tracks: List[RBTrack], settings: Optional[Dict[str, Any]] = None
    ) -> List[TrackResult]:
        """Process a playlist of tracks.

        Processes each track in sequence and returns a list of results.
        Logs progress for each track.

        Args:
            tracks: List of RBTrack objects to process.
            settings: Optional settings dictionary to override defaults.

        Returns:
            List of TrackResult objects, one per input track.

        Example:
            >>> tracks = [RBTrack(...), RBTrack(...)]
            >>> results = service.process_playlist(tracks)
            >>> print(f"Processed {len(results)} tracks")
        """
        results = []
        total = len(tracks)

        for idx, track in enumerate(tracks, 1):
            self.logging_service.info(f"Processing track {idx}/{total}")
            result = self.process_track(idx, track, settings)
            results.append(result)

        return results
