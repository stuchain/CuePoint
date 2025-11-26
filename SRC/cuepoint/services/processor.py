#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track processing orchestration with multi-layered search architecture

This module orchestrates the entire track matching pipeline:
1. Parses Rekordbox XML and extracts playlist tracks
2. For each track, generates search queries and finds Beatport matches
3. Writes comprehensive CSV output files with matches, candidates, and queries
4. Handles re-searching unmatched tracks with enhanced settings

The pipeline uses multi-threading for parallel track processing and candidate fetching,
and implements time budgets to balance accuracy with performance.

Key functions:
- process_track(): Processes a single track (generates queries, finds match, returns results)
- run(): Main orchestration function (parses XML, processes all tracks, writes outputs)
"""

import csv
import io
import os
import random
import re
import sys
import threading
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple, Optional, Any, Callable

from tqdm import tqdm

# Optional import for async support
try:
    import aiohttp
    ASYNC_AVAILABLE = True
except ImportError:
    ASYNC_AVAILABLE = False
    aiohttp = None

from cuepoint.models.config import HAVE_CACHE, SETTINGS
from cuepoint.utils.errors import error_playlist_not_found, error_file_not_found, print_error
from cuepoint.ui.gui_interface import TrackResult, ProcessingController, ProgressCallback, ProcessingError, ErrorType, ProgressInfo
from cuepoint.utils.logger_helper import get_logger

# Initialize logger for this module
_logger = get_logger()
from cuepoint.core.matcher import _camelot_key, _confidence_label, best_beatport_match
from cuepoint.core.mix_parser import _extract_generic_parenthetical_phrases, _parse_mix_flags
from cuepoint.services.output_writer import write_csv_files, write_review_candidates_csv, write_review_queries_csv
from cuepoint.core.query_generator import make_search_queries
from cuepoint.data.rekordbox import RBTrack, extract_artists_from_title, parse_rekordbox
from cuepoint.core.text_processing import _artist_token_overlap, sanitize_title_for_search
from cuepoint.utils.utils import with_timestamp
try:
    from performance import performance_collector
    PERFORMANCE_AVAILABLE = True
except ImportError:
    PERFORMANCE_AVAILABLE = False
    performance_collector = None

# Async I/O imports (optional - only if aiohttp is available)
try:
    import asyncio
    import aiohttp
    ASYNC_AVAILABLE = True
except ImportError:
    ASYNC_AVAILABLE = False
    asyncio = None
    aiohttp = None

# Check if async matcher is available
try:
    from matcher import async_best_beatport_match
    ASYNC_MATCHER_AVAILABLE = True
except ImportError:
    ASYNC_MATCHER_AVAILABLE = False
    async_best_beatport_match = None


def generate_summary_report(
    playlist_name: str,
    rows: List[Dict[str, str]],
    all_candidates: List[Dict[str, str]],
    all_queries: List[Dict[str, str]],
    processing_time_sec: float,
    output_files: Dict[str, str]
) -> str:
    """
    Generate a formatted summary statistics report
    
    Args:
        playlist_name: Name of the processed playlist
        rows: Main results (one row per track)
        all_candidates: All candidates evaluated
        all_queries: All queries executed
        processing_time_sec: Total processing time in seconds
        output_files: Dictionary mapping file type to file path
    
    Returns:
        Formatted summary report as string
    """
    total_tracks = len(rows)
    if total_tracks == 0:
        return "No tracks processed."
    
    # Calculate match statistics
    matched = sum(1 for r in rows if (r.get("beatport_url") or "").strip())
    unmatched = total_tracks - matched
    match_rate = (matched / total_tracks * 100) if total_tracks > 0 else 0
    
    # Calculate review statistics
    review_count = sum(1 for r in rows if float(r.get("match_score", "0") or 0) < 70 or 
                  int(float(r.get("artist_sim", "0") or 0)) < 50 or not (r.get("beatport_url") or "").strip())
    
    # Calculate confidence breakdown
    high_conf = sum(1 for r in rows if r.get("confidence") == "high")
    med_conf = sum(1 for r in rows if r.get("confidence") == "medium")
    low_conf = sum(1 for r in rows if r.get("confidence") == "low" or not (r.get("beatport_url") or "").strip())
    
    # Calculate average scores (only for matched tracks)
    matched_scores = [float(r.get("match_score", "0") or 0) for r in rows if (r.get("beatport_url") or "").strip()]
    avg_score = sum(matched_scores) / len(matched_scores) if matched_scores else 0
    
    matched_title_sims = [int(float(r.get("title_sim", "0") or 0)) for r in rows if (r.get("beatport_url") or "").strip()]
    avg_title_sim = sum(matched_title_sims) / len(matched_title_sims) if matched_title_sims else 0
    
    matched_artist_sims = [int(float(r.get("artist_sim", "0") or 0)) for r in rows if (r.get("beatport_url") or "").strip()]
    avg_artist_sim = sum(matched_artist_sims) / len(matched_artist_sims) if matched_artist_sims else 0
    
    # Performance statistics
    total_queries = len(all_queries)
    avg_queries_per_track = total_queries / total_tracks if total_tracks > 0 else 0
    total_candidates = len(all_candidates)
    avg_candidates_per_track = total_candidates / total_tracks if total_tracks > 0 else 0
    
    # Early exit statistics (queries that caused early stop)
    early_exits = sum(1 for q in all_queries if q.get("is_stop") == "Y")
    early_exit_rate = (early_exits / total_tracks * 100) if total_tracks > 0 else 0
    
    # Genre breakdown (for matched tracks only)
    genre_counts: Dict[str, int] = {}
    for r in rows:
        if (r.get("beatport_url") or "").strip() and r.get("beatport_genres"):
            genres = [g.strip() for g in r.get("beatport_genres", "").split(",") if g.strip()]
            for genre in genres:
                genre_counts[genre] = genre_counts.get(genre, 0) + 1
    
    # Sort genres by count (descending) and take top 5
    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    # Format processing time
    mins = int(processing_time_sec // 60)
    secs = int(processing_time_sec % 60)
    time_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"
    
    # Build formatted report (using ASCII-safe characters)
    lines = []
    lines.append("+" + "=" * 78 + "+")
    lines.append("|" + f"{'CuePoint Processing Summary':^78}" + "|")
    lines.append("+" + "=" * 78 + "+")
    lines.append("| " + f"Playlist: {playlist_name:<67}" + "|")
    lines.append("| " + f"Total Tracks: {total_tracks:<65}" + "|")
    lines.append("| " + f"Processing Time: {time_str:<64}" + "|")
    lines.append("+" + "=" * 78 + "+")
    lines.append("| " + "Match Results:" + " " * 63 + "|")
    lines.append("| " + f"  [OK] Matched: {matched} ({match_rate:.1f}%){' ' * (78 - 24 - len(str(matched)) - len(f'{match_rate:.1f}'))}" + "|")
    lines.append("| " + f"  [FAIL] Unmatched: {unmatched} ({100-match_rate:.1f}%){' ' * (78 - 29 - len(str(unmatched)) - len(f'{100-match_rate:.1f}'))}" + "|")
    lines.append("| " + f"  [REVIEW] Review Needed: {review_count} ({review_count/total_tracks*100:.1f}%){' ' * (78 - 37 - len(str(review_count)) - len(f'{review_count/total_tracks*100:.1f}'))}" + "|")
    lines.append("+" + "=" * 78 + "+")
    lines.append("| " + "Match Quality:" + " " * 63 + "|")
    lines.append("| " + f"  High Confidence (>=90): {high_conf} ({high_conf/total_tracks*100:.1f}%){' ' * (78 - 39 - len(str(high_conf)) - len(f'{high_conf/total_tracks*100:.1f}'))}" + "|")
    lines.append("| " + f"  Medium Confidence (70-89): {med_conf} ({med_conf/total_tracks*100:.1f}%){' ' * (78 - 42 - len(str(med_conf)) - len(f'{med_conf/total_tracks*100:.1f}'))}" + "|")
    lines.append("| " + f"  Low Confidence (<70): {low_conf} ({low_conf/total_tracks*100:.1f}%){' ' * (78 - 36 - len(str(low_conf)) - len(f'{low_conf/total_tracks*100:.1f}'))}" + "|")
    lines.append("| " + f"  Average Score: {avg_score:.1f}{' ' * (78 - 22 - len(f'{avg_score:.1f}'))}" + "|")
    lines.append("+" + "=" * 78 + "+")
    lines.append("| " + "Performance:" + " " * 66 + "|")
    lines.append("| " + f"  Total Queries: {total_queries}{' ' * (78 - 24 - len(str(total_queries)))}" + "|")
    lines.append("| " + f"  Avg Queries/Track: {avg_queries_per_track:.1f}{' ' * (78 - 28 - len(f'{avg_queries_per_track:.1f}'))}" + "|")
    lines.append("| " + f"  Total Candidates: {total_candidates:,}{' ' * (78 - 26 - len(f'{total_candidates:,}'))}" + "|")
    lines.append("| " + f"  Avg Candidates/Track: {avg_candidates_per_track:.1f}{' ' * (78 - 32 - len(f'{avg_candidates_per_track:.1f}'))}" + "|")
    lines.append("| " + f"  Early Exits: {early_exits} ({early_exit_rate:.1f}% of tracks){' ' * (78 - 38 - len(str(early_exits)) - len(f'{early_exit_rate:.1f}'))}" + "|")
    
    if top_genres:
        lines.append("+" + "=" * 78 + "+")
        lines.append("| " + "Genre Breakdown:" + " " * 60 + "|")
        for genre, count in top_genres:
            genre_pct = (count / matched * 100) if matched > 0 else 0
            genre_str = f"  - {genre}: {count} ({genre_pct:.1f}%)"
        lines.append("| " + f"{genre_str:<76}" + "|")
    
    lines.append("+" + "=" * 78 + "+")
    lines.append("| " + "Output Files:" + " " * 64 + "|")
    for file_type, file_path in output_files.items():
        file_name = os.path.basename(file_path)
        # Count rows if possible
        try:
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    row_count = sum(1 for _ in f) - 1  # Subtract header
                    file_info = f"  - {file_name} ({row_count:,} rows)"
            else:
                file_info = f"  - {file_name}"
        except:
            file_info = f"  - {file_name}"
        
            lines.append("| " + f"{file_info:<76}" + "|")
    
    lines.append("+" + "=" * 78 + "+")
    
    return "\n".join(lines)


def process_track(idx: int, rb: RBTrack) -> Tuple[Dict[str, str], List[Dict[str, str]], List[Dict[str, str]]]:
    """
    Process a single track: generate queries, find best Beatport match, return results
    
    This function handles the complete workflow for one track:
        1. Clean and normalize the track title (remove prefixes like [F], [3], etc.)
    2. Extract artists from title if not provided separately
    3. Generate search queries based on title and artists
    4. Find best matching Beatport track using multi-query search
    5. Format results for CSV output
    
    Args:
        idx: Playlist index (1-based) for this track
        rb: RBTrack object containing original track data from Rekordbox
    
    Returns:
        Tuple of (main_row, cand_rows, queries_rows):
        - main_row: Dictionary with best match (or empty if no match)
        - cand_rows: List of dictionaries for all candidates evaluated
        - queries_rows: List of dictionaries for all queries executed
    """
    t0 = time.perf_counter()  # Start timing for performance tracking

    # Extract original artist information from Rekordbox track
    original_artists = rb.artists or ""
    
    # Clean the title to remove prefixes like [F], [3], etc.
    # This is critical - never use the original title with prefixes for search/scoring
    # The sanitized title removes noise that would hurt matching accuracy
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists

    # Track whether we're doing title-only search (no artists available)
    title_only_search = False
    extracted = False

    # If no artists provided, try to extract them from the title
    # Some Rekordbox tracks have format: "Artist - Title" in the title field
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
        # Clean the extracted title too (remove prefixes, normalize)
        title_for_search = sanitize_title_for_search(extracted_title)
        extracted = True
        title_only_search = True

    # Display track information being searched (with Unicode-safe fallback)
    clean_title_for_log = title_for_search  # Already cleaned above
    try:
        _logger.info(f"[{idx}] Searching Beatport for: {clean_title_for_log} - {original_artists or artists_for_scoring}")
    except UnicodeEncodeError:
        # Fallback for terminals that can't handle Unicode (Windows console)
            safe_title = clean_title_for_log.encode('ascii', 'ignore').decode('ascii')
            safe_artists = (original_artists or artists_for_scoring).encode('ascii', 'ignore').decode('ascii')
            _logger.info(f"[{idx}] Searching Beatport for: {safe_title} - {safe_artists}")
    
    # Inform user if artists were inferred from title
    if extracted and title_only_search:
        _logger.info(f"[{idx}]   (artists inferred from title for scoring; search is title-only)")

    # Generate search queries based on title and artist information
    # Query generator creates multiple query variants to maximize match probability
    # It handles remix detection, artist combinations, title N-grams, etc.
    queries = make_search_queries(
        title_for_search,                    # Clean title for search
        ("" if title_only_search else artists_for_scoring),  # Artists (empty if title-only)
        original_title=rb.title              # Original title (for mix/remix detection)
    )

    # Display all generated queries for this track
    _logger.debug(f"[{idx}]   queries:")
    for i, q in enumerate(queries, 1):
        try:
            _logger.debug(f"[{idx}]     {i}. site:beatport.com/track {q}")
        except UnicodeEncodeError:
            # Unicode-safe fallback
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            _logger.debug(f"[{idx}]     {i}. site:beatport.com/track {safe_q}")

    # Extract mix/remix information from original title for matching bonus/penalty
    # e.g., "Original Mix", "Extended Mix", "Remix", etc.
    input_mix_flags = _parse_mix_flags(rb.title)
            
    # Extract generic parenthetical phrases (e.g., "(Ivory Re-fire)", "(Club Mix)")
    # These indicate special variants beyond standard mix types
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)

    # Execute the matching pipeline: search for candidates and find best match
    # This is the core matching logic that:
    # 1. Executes all queries in sequence (with time budget)
    # 2. Fetches candidate tracks from Beatport for each query
    # 3. Scores each candidate (title similarity, artist similarity, bonuses)
    # 4. Applies guards to reject false positives
    # 5. Returns the best match (if any)
    best, candlog, queries_audit, stop_qidx = best_beatport_match(
        idx,                                    # Track index for logging
        title_for_search,                       # Clean title for matching
        artists_for_scoring,                    # Artists for matching
        (title_only_search and not extracted), # True if truly title-only (no artists at all)
        queries,                                # List of search queries to execute
        input_year=None,                        # Optional: year from Rekordbox (currently not used)
        input_key=None,                         # Optional: key from Rekordbox (currently not used)
        input_mix=input_mix_flags,             # Mix type flags (original, extended, remix, etc.)
        input_generic_phrases=input_generic_phrases,  # Special parenthetical phrases
    )

    # Calculate processing time for this track
    dur = (time.perf_counter() - t0) * 1000
    
    # Build candidate rows for CSV output
    # Each candidate that was evaluated gets a row with full scoring details
    cand_rows: List[Dict[str, str]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
        "playlist_index": str(idx),
        "original_title": rb.title,
        "original_artists": rb.artists,
        "candidate_url": c.url,
        "candidate_track_id": bp_id,
        "candidate_title": c.title,
        "candidate_artists": c.artists,
        "candidate_key": c.key or "",
        "candidate_key_camelot": _camelot_key(c.key),
        "candidate_year": c.release_year or "",
        "candidate_bpm": c.bpm or "",
        "candidate_label": c.label or "",
        "candidate_genres": c.genres or "",
        "candidate_release": c.release_name or "",
        "candidate_release_date": c.release_date or "",
        "title_sim": str(c.title_sim),
        "artist_sim": str(c.artist_sim),
        "base_score": f"{c.base_score:.1f}",
        "bonus_year": str(c.bonus_year),
        "bonus_key": str(c.bonus_key),
        "final_score": f"{c.score:.1f}",
        "guard_ok": "Y" if c.guard_ok else "N",
        "reject_reason": c.reject_reason or "",
        "search_query_index": str(c.query_index),
        "search_query_text": c.query_text,
        "candidate_index": str(c.candidate_index),
        "elapsed_ms": str(c.elapsed_ms),
        "winner": "Y" if c.is_winner else "N",
        })

    # Build query audit rows for CSV output
    # Each query executed gets a row showing what it found
    queries_rows: List[Dict[str, str]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        # Mark if this query found the winning match
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        # Record which candidate from this query was the winner (if any)
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        # Mark if this query caused early exit (stop searching)
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
        "playlist_index": str(idx),
        "original_title": rb.title,
        "original_artists": rb.artists,
        "search_query_index": str(qidx),
        "search_query_text": qtext,
        "candidate_count": str(num_cands),
        "elapsed_ms": str(q_ms),
        "is_winner": is_winner,
        "winner_candidate_index": winner_cand_idx,
        "is_stop": is_stop,
        })

    # Check if we found an acceptable match (score >= minimum threshold)
    if best and best.score >= SETTINGS["MIN_ACCEPT_SCORE"]:
        # Display match information
        try:
            _logger.info(f"[{idx}] -> Match: {best.title} - {best.artists} "
              f"(key {best.key or '?'}, year {best.release_year or '?'}) "
              f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
              f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]")
        except UnicodeEncodeError:
        # Unicode-safe fallback
            safe_title = best.title.encode('ascii', 'ignore').decode('ascii')
        safe_artists = best.artists.encode('ascii', 'ignore').decode('ascii')
        safe_key = (best.key or '?').encode('ascii', 'ignore').decode('ascii')
        _logger.info(f"[{idx}] -> Match: {safe_title} - {safe_artists} "
              f"(key {safe_key}, year {best.release_year or '?'}) "
              f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
              f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]")

        # Extract Beatport track ID from URL (format: /track/slug/12345)
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        # Build main result row with match information
        main_row = {
        "playlist_index": str(idx),
        "original_title": rb.title,
        "original_artists": rb.artists,
        "beatport_title": best.title,
        "beatport_artists": best.artists,
        "beatport_key": best.key or "",
        "beatport_key_camelot": _camelot_key(best.key) or "",
        "beatport_year": best.release_year or "",
        "beatport_bpm": best.bpm or "",
        "beatport_label": best.label or "",
        "beatport_genres": best.genres or "",
        "beatport_release": best.release_name or "",
        "beatport_release_date": best.release_date or "",
        "beatport_track_id": beatport_track_id,
        "beatport_url": best.url,
        "title_sim": str(best.title_sim),
        "artist_sim": str(best.artist_sim),
        "match_score": f"{best.score:.1f}",
        "confidence": _confidence_label(best.score),
        "search_query_index": str(best.query_index),
        "search_stop_query_index": str(stop_qidx),
        "candidate_index": str(best.candidate_index),
        }
        return main_row, cand_rows, queries_rows
    else:
        # No match found (either no candidates or score too low)
        try:
            _logger.info(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]")
        except UnicodeEncodeError:
            pass
        
        # Build empty result row (no match)
        main_row = {
        "playlist_index": str(idx),
        "original_title": rb.title,
        "original_artists": rb.artists,
        "beatport_title": "",
        "beatport_artists": "",
        "beatport_key": "",
        "beatport_key_camelot": "",
        "beatport_year": "",
        "beatport_bpm": "",
        "beatport_label": "",
        "beatport_genres": "",
        "beatport_release": "",
        "beatport_release_date": "",
        "beatport_track_id": "",
        "beatport_url": "",
        "title_sim": "0",
        "artist_sim": "0",
        "match_score": "0.0",
        "confidence": "low",
        "search_query_index": "0",
        "search_stop_query_index": "0",
        "candidate_index": "0",
        }
        return main_row, cand_rows, queries_rows


def process_track_with_callback(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None
) -> TrackResult:
    """
    Process single track with progress callback support.
    
    This is a GUI-friendly version of process_track() that:
    - Returns TrackResult object instead of tuple of dicts
    - Supports cancellation via controller
    - Supports progress callbacks
    - Supports settings override
    
    Args:
        idx: Playlist index (1-based) for this track
        rb: RBTrack object containing original track data from Rekordbox
        settings: Optional settings override (uses SETTINGS if None)
        progress_callback: Optional callback for progress updates
        controller: Optional controller for cancellation support
    
    Returns:
        TrackResult object with match information and candidates/queries
    """
    # Check for cancellation before starting
    if controller and controller.is_cancelled():
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False
        )
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    t0 = time.perf_counter()
    
    # Copy ALL logic from process_track() function:
    # 1. Extract artists, clean title
    original_artists = rb.artists or ""
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists
    
    title_only_search = False
    extracted = False
    
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            # Clean the extracted title too (remove prefixes, normalize)
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True
    
    # 2. Log track search information
    try:
        _logger.info(f"[{idx}] Searching Beatport for: {title_for_search} - {original_artists or artists_for_scoring}")
    except UnicodeEncodeError:
        safe_title = title_for_search.encode('ascii', 'ignore').decode('ascii')
        safe_artists = (original_artists or artists_for_scoring).encode('ascii', 'ignore').decode('ascii')
        _logger.info(f"[{idx}] Searching Beatport for: {safe_title} - {safe_artists}")
    
    if extracted and title_only_search:
        _logger.info(f"[{idx}]   (artists inferred from title for scoring; search is title-only)")
    
    # 3. Generate queries
    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )
    
    _logger.debug(f"[{idx}]   queries:")
    for i, q in enumerate(queries, 1):
        try:
            _logger.debug(f"[{idx}]     {i}. site:beatport.com/track {q}")
        except UnicodeEncodeError:
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            _logger.debug(f"[{idx}]     {i}. site:beatport.com/track {safe_q}")
    
    # 4. Extract mix flags
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)
    
    # 5. Check cancellation again before expensive operation
    if controller and controller.is_cancelled():
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False
        )
    
    # 6. Execute matching (use effective_settings for MIN_ACCEPT_SCORE)
    min_accept_score = effective_settings.get("MIN_ACCEPT_SCORE", SETTINGS.get("MIN_ACCEPT_SCORE", 70))
    
    best, candlog, queries_audit, stop_qidx = best_beatport_match(
        idx,
        title_for_search,
        artists_for_scoring,
        (title_only_search and not extracted),
        queries,
        input_year=None,
        input_key=None,
        input_mix=input_mix_flags,
        input_generic_phrases=input_generic_phrases,
    )
    
    dur = (time.perf_counter() - t0) * 1000
    
    # 7. Build candidate rows (same as process_track())
    cand_rows: List[Dict[str, Any]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists or "",
            "candidate_url": c.url,
            "candidate_track_id": bp_id,
            "candidate_title": c.title,
            "candidate_artists": c.artists,
            "candidate_key": c.key or "",
            "candidate_key_camelot": _camelot_key(c.key) or "",
            "candidate_year": str(c.release_year) if c.release_year else "",
            "candidate_bpm": c.bpm or "",
            "candidate_label": c.label or "",
            "candidate_genres": c.genres or "",
            "candidate_release": c.release_name or "",
            "candidate_release_date": c.release_date or "",
            "title_sim": str(c.title_sim),
            "artist_sim": str(c.artist_sim),
            "base_score": f"{c.base_score:.1f}",
            "bonus_year": str(c.bonus_year),
            "bonus_key": str(c.bonus_key),
            "final_score": f"{c.score:.1f}",
            "guard_ok": "Y" if c.guard_ok else "N",
            "reject_reason": c.reject_reason or "",
            "search_query_index": str(c.query_index),
            "search_query_text": c.query_text,
            "candidate_index": str(c.candidate_index),
            "elapsed_ms": str(c.elapsed_ms),
            "winner": "Y" if c.is_winner else "N",
        })
    
    # 8. Build query rows (same as process_track())
    queries_rows: List[Dict[str, Any]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists or "",
            "search_query_index": str(qidx),
            "search_query_text": qtext,
            "candidate_count": str(num_cands),
            "elapsed_ms": str(q_ms),
            "is_winner": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "is_stop": is_stop,
        })
    
    # 9. Check for match and build TrackResult
    if best and best.score >= min_accept_score:
        # Match found
        try:
            _logger.info(f"[{idx}] -> Match: {best.title} - {best.artists} "
                  f"(key {best.key or '?'}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]")
        except UnicodeEncodeError:
            safe_title = best.title.encode('ascii', 'ignore').decode('ascii')
            safe_artists = best.artists.encode('ascii', 'ignore').decode('ascii')
            safe_key = (best.key or '?').encode('ascii', 'ignore').decode('ascii')
            _logger.info(f"[{idx}] -> Match: {safe_title} - {safe_artists} "
                  f"(key {safe_key}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]")
        
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_url=best.url,
            beatport_title=best.title,
            beatport_artists=best.artists,
            match_score=best.score,
            title_sim=float(best.title_sim),
            artist_sim=float(best.artist_sim),
            confidence=_confidence_label(best.score),
            beatport_key=best.key,
            beatport_key_camelot=_camelot_key(best.key) or "",
            beatport_year=str(best.release_year) if best.release_year else None,
            beatport_bpm=best.bpm,
            beatport_label=best.label,
            beatport_genres=best.genres,
            beatport_release=best.release_name,
            beatport_release_date=best.release_date,
            beatport_track_id=beatport_track_id,
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index=str(best.query_index),
            search_stop_query_index=str(stop_qidx),
            candidate_index=str(best.candidate_index),
        )
    else:
        # No match found
        try:
            _logger.info(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]")
        except UnicodeEncodeError:
            pass
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index="0",
            search_stop_query_index=str(stop_qidx),
            candidate_index="0",
        )


def process_playlist(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None,
    auto_research: bool = False
) -> List[TrackResult]:
    """
    Process playlist with GUI-friendly interface.
    
    This function processes all tracks in a playlist and returns structured results.
    It supports progress callbacks, cancellation, and both sequential and parallel processing.
    
    Args:
        xml_path: Path to Rekordbox XML export file
        playlist_name: Name of playlist to process (must exist in XML)
        settings: Optional settings override (uses SETTINGS if None)
        progress_callback: Optional callback for progress updates
        controller: Optional controller for cancellation support
        auto_research: If True, automatically re-search unmatched tracks with enhanced settings
    
    Returns:
        List of TrackResult objects (one per track)
    
    Raises:
        ProcessingError: If XML file not found, playlist not found, or parsing errors occur
    """
    # Start performance session
    if PERFORMANCE_AVAILABLE and performance_collector:
        try:
            performance_collector.start_session()
        except Exception:
            pass  # Don't let performance collection errors break processing
    
    # Track processing start time
    processing_start_time = time.perf_counter()
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    # Set random seed for deterministic behavior
    random.seed(effective_settings.get("SEED", SETTINGS.get("SEED", 0)))
    
    # Enable HTTP response caching if available and enabled
    if effective_settings.get("ENABLE_CACHE", SETTINGS.get("ENABLE_CACHE", True)) and HAVE_CACHE:
        import requests_cache
        requests_cache.install_cache("bp_cache", expire_after=60 * 60 * 24)
    
    # Parse Rekordbox XML file to extract tracks and playlists
    try:
        tracks_by_id, playlists = parse_rekordbox(xml_path)
    except FileNotFoundError:
        raise ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            details="The specified Rekordbox XML export file does not exist.",
            suggestions=[
                "Check that the file path is correct",
                "Verify the file exists and is readable",
                "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
            ],
            recoverable=False
        )
    except Exception as e:
        # XML parsing errors
        error_msg = str(e)
        if error_msg.startswith("="):
            # Error message already formatted by rekordbox.py
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=error_msg,
                details=f"Failed to parse XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
        else:
            # Generic parsing error
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=f"XML parsing failed: {error_msg}",
                details=f"Error occurred while parsing XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        available_playlists = sorted(playlists.keys())
        raise ProcessingError(
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
            message=f"Playlist '{playlist_name}' not found in XML file",
            details=f"Available playlists: {', '.join(available_playlists[:10])}{'...' if len(available_playlists) > 10 else ''}",
            suggestions=[
                "Check the playlist name spelling (case-sensitive)",
                f"Verify '{playlist_name}' exists in your Rekordbox library",
                "Export a fresh XML file from Rekordbox",
                "Choose from available playlists listed above"
            ],
            recoverable=True
        )
    
    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))
    
    if not inputs:
        raise ProcessingError(
            error_type=ErrorType.VALIDATION_ERROR,
            message=f"Playlist '{playlist_name}' is empty",
            details="The playlist contains no valid tracks.",
            suggestions=[
                "Verify the playlist has tracks in Rekordbox",
                "Export a fresh XML file from Rekordbox"
            ],
            recoverable=True
        )
    
    # Create a mapping for quick lookup (used when tracking unmatched tracks in parallel mode)
    inputs_map = {idx: rb for idx, rb in inputs}
    
    # Initialize results list and statistics
    results: List[TrackResult] = []
    matched_count = 0
    unmatched_count = 0
    
    # Thread-safe progress tracking for parallel mode
    progress_lock = threading.Lock()
    
    # Determine processing mode (sequential or parallel)
    track_workers = effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))
    
    if track_workers > 1:
        _logger.info(f"Using parallel processing with {track_workers} workers")
        # PARALLEL MODE: Process multiple tracks simultaneously
        # Use ThreadPoolExecutor to run process_track_with_callback() in parallel
        with ThreadPoolExecutor(max_workers=track_workers) as ex:
            # Submit all tasks
            future_to_args = {
                ex.submit(
                    process_track_with_callback,
                    idx,
                    rb,
                    settings=effective_settings,
                    progress_callback=None,  # Don't pass callback to individual tracks in parallel mode
                    controller=controller
                ): (idx, rb) 
                for idx, rb in inputs
            }
            
            # Process completed tasks as they finish
            results_dict: Dict[int, TrackResult] = {}  # Store results by index for ordering
            
            for future in as_completed(future_to_args):
                # Check for cancellation
                if controller and controller.is_cancelled():
                    # Cancel remaining futures
                    for f in future_to_args.keys():
                        f.cancel()
                    break
                
                try:
                    result = future.result()
                    results_dict[result.playlist_index] = result
                    
                    # Thread-safe progress update
                    with progress_lock:
                        if result.matched:
                            matched_count += 1
                        else:
                            unmatched_count += 1
                        
                        # Update progress callback (thread-safe)
                        if progress_callback:
                            completed = len(results_dict)
                            elapsed_time = time.perf_counter() - processing_start_time
                            progress_info = ProgressInfo(
                                completed_tracks=completed,
                                total_tracks=len(inputs),
                                matched_count=matched_count,
                                unmatched_count=unmatched_count,
                                current_track={
                                    'title': result.title,
                                    'artists': result.artist
                                },
                                elapsed_time=elapsed_time
                            )
                            try:
                                progress_callback(progress_info)
                            except Exception:
                                # Don't let callback errors break processing
                                pass
                
                except Exception as e:
                    # Handle errors from individual track processing
                    idx, rb = future_to_args[future]
                    # Create error result
                    error_result = TrackResult(
                        playlist_index=idx,
                        title=rb.title,
                        artist=rb.artists or "",
                        matched=False
                    )
                    results_dict[idx] = error_result
                    unmatched_count += 1
            
            # Sort results by playlist index to maintain order
            results = [results_dict[idx] for idx in sorted(results_dict.keys())]
    
    else:
        # SEQUENTIAL MODE: Process tracks one at a time
        _logger.info(f"Using sequential processing (TRACK_WORKERS={track_workers})")
        for idx, rb in inputs:
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            # Process track
            result = process_track_with_callback(
                idx,
                rb,
                settings=effective_settings,
                progress_callback=None,  # Don't pass callback to individual tracks
                controller=controller
            )
            
            results.append(result)
            
            # Update statistics
            if result.matched:
                matched_count += 1
            else:
                unmatched_count += 1
            
            # Update progress callback
            if progress_callback:
                completed = len(results)
                elapsed_time = time.perf_counter() - processing_start_time
                
                progress_info = ProgressInfo(
                    completed_tracks=completed,
                    total_tracks=len(inputs),
                    matched_count=matched_count,
                    unmatched_count=unmatched_count,
                    current_track={
                        'title': rb.title,
                        'artists': rb.artists or ""
                    },
                    elapsed_time=elapsed_time
                )
                try:
                    progress_callback(progress_info)
                except Exception:
                    # Don't let callback errors break processing
                    pass
    
    # Handle auto-research for unmatched tracks if requested and not cancelled
    if auto_research and not (controller and controller.is_cancelled()):
        unmatched_results = [r for r in results if not r.matched]
        if unmatched_results:
            _logger.info(f"\n{'='*80}")
            _logger.info(f"Auto-research: Found {len(unmatched_results)} unmatched track(s), re-searching with enhanced settings...")
            _logger.info(f"{'='*80}\n")
            
            # Enhanced settings for re-search
            enhanced_settings = effective_settings.copy()
            enhanced_settings["PER_TRACK_TIME_BUDGET_SEC"] = max(
                enhanced_settings.get("PER_TRACK_TIME_BUDGET_SEC", 45), 90
            )
            enhanced_settings["MAX_SEARCH_RESULTS"] = max(
                enhanced_settings.get("MAX_SEARCH_RESULTS", 50), 100
            )
            enhanced_settings["MAX_QUERIES_PER_TRACK"] = max(
                enhanced_settings.get("MAX_QUERIES_PER_TRACK", 40), 60
            )
            enhanced_settings["MIN_ACCEPT_SCORE"] = max(
                enhanced_settings.get("MIN_ACCEPT_SCORE", 70), 60
            )
            
            # Re-search unmatched tracks in parallel
            unmatched_inputs = [(result.playlist_index, inputs_map[result.playlist_index]) 
                               for result in unmatched_results 
                               if result.playlist_index in inputs_map]
            
            if unmatched_inputs:
                # Use same parallel processing approach as main processing
                track_workers = enhanced_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))
                if track_workers > 1 and len(unmatched_inputs) > 1:
                    # Parallel re-search
                    _logger.info(f"\nRe-searching {len(unmatched_inputs)} unmatched tracks using parallel processing with {min(track_workers, len(unmatched_inputs))} workers")
                    with ThreadPoolExecutor(max_workers=min(track_workers, len(unmatched_inputs))) as ex:
                        future_to_idx = {
                            ex.submit(
                                process_track_with_callback,
                                idx,
                                rb,
                                settings=enhanced_settings,
                                progress_callback=None,
                                controller=controller
                            ): idx
                            for idx, rb in unmatched_inputs
                        }
                        
                        for future in as_completed(future_to_idx):
                            idx = future_to_idx[future]
                            try:
                                new_result = future.result()
                                # Find and update the result
                                for i, result in enumerate(results):
                                    if result.playlist_index == idx:
                                        if new_result.matched:
                                            results[i] = new_result
                                            matched_count += 1
                                            unmatched_count -= 1
                                        break
                            except Exception as e:
                                # Error handling - keep original unmatched result
                                pass
                else:
                    # Sequential re-search (fallback)
                    reason = "only 1 unmatched track" if len(unmatched_inputs) == 1 else f"TRACK_WORKERS={track_workers}"
                    _logger.info(f"\nRe-searching {len(unmatched_inputs)} unmatched tracks using sequential processing ({reason})")
                    for idx, rb in unmatched_inputs:
                        if controller and controller.is_cancelled():
                            break
                        
                        new_result = process_track_with_callback(
                            idx,
                            rb,
                            settings=enhanced_settings,
                            progress_callback=None,
                            controller=controller
                        )
                        
                        # Update result if we found a match
                        if new_result.matched:
                            for i, result in enumerate(results):
                                if result.playlist_index == idx:
                                    results[i] = new_result
                                    matched_count += 1
                                    unmatched_count -= 1
                                    break
    
    # End performance session
    if PERFORMANCE_AVAILABLE and performance_collector:
        try:
            performance_collector.end_session()
        except Exception:
            pass  # Don't let performance collection errors break processing
    
    return results


def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False) -> None:
    """
    Main processing function - orchestrates the entire matching pipeline
    
    Legacy CLI function - wraps new process_playlist() for backward compatibility.
    This function maintains the existing CLI interface while using the new GUI-ready backend.
    
    Args:
        xml_path: Path to Rekordbox XML export file.
        playlist_name: Name of playlist to process (must exist in XML).
        out_csv_base: Base filename for output CSV files (timestamp auto-appended).
        auto_research: If True, automatically re-search unmatched tracks without prompting.
    
    Output files (all in output/ directory):
        - {out_csv_base} (timestamp).csv: Main results (one row per track)
        - {out_csv_base}_review.csv: Tracks needing review (low scores, weak matches)
        - {out_csv_base}_candidates.csv: All candidates evaluated for all tracks
        - {out_csv_base}_review_candidates.csv: Candidates for review tracks only
        - {out_csv_base}_queries.csv: All queries executed for all tracks
        - {out_csv_base}_review_queries.csv: Queries for review tracks only
    
    Returns:
        None (writes output files and prints summary to console).
    """
    # Track processing start time for summary statistics
    processing_start_time = time.perf_counter()
    
    # Create CLI progress callback wrapper (updates tqdm progress bar)
    # Use a list to hold the progress bar so we can modify it from the callback
    pbar_container = [None]
    
    def cli_progress_callback(progress_info: ProgressInfo):
        """CLI progress callback that updates tqdm progress bar"""
        if pbar_container[0] is None:
            # Initialize progress bar on first callback
            pbar_container[0] = tqdm(total=progress_info.total_tracks, desc="Processing tracks", unit="track",
                                    bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]')
        
        pbar = pbar_container[0]
        
        # Update progress bar
        current_pos = progress_info.completed_tracks
        pbar.n = current_pos
        pbar.refresh()
        
        # Update postfix with current stats
        current_track_title = progress_info.current_track.get('title', '') if progress_info.current_track else ''
        if len(current_track_title) > 30:
            current_track_title = current_track_title[:30] + "..."
        
        pbar.set_postfix({
            'matched': progress_info.matched_count,
            'unmatched': progress_info.unmatched_count,
            'current': current_track_title if current_track_title else f"Track {progress_info.completed_tracks}"
        })
    
    # Process playlist using new backend
    try:
        results = process_playlist(
            xml_path=xml_path,
            playlist_name=playlist_name,
            progress_callback=cli_progress_callback,
            auto_research=auto_research
        )
    except ProcessingError as e:
        # Convert ProcessingError to CLI-friendly error messages
        if e.error_type == ErrorType.FILE_NOT_FOUND:
            print_error(error_file_not_found(xml_path, "XML", "Check the --xml file path"))
        elif e.error_type == ErrorType.PLAYLIST_NOT_FOUND:
            print_error(error_playlist_not_found(playlist_name, []))
        elif e.error_type == ErrorType.XML_PARSE_ERROR:
            print_error(e.message, exit_code=None)
        else:
            print_error(f"Processing error: {e.message}", exit_code=None)
        return
    except Exception as e:
        # Handle unexpected errors
        error_msg = str(e)
        if error_msg.startswith("="):
            print_error(error_msg, exit_code=None)
        else:
            from error_handling import error_xml_parsing
            print_error(error_xml_parsing(xml_path, e, None), exit_code=None)
        return
    finally:
        # Close progress bar if it was opened
        if pbar_container[0] is not None:
            pbar_container[0].close()
    
    # Convert TrackResult objects to dict format for summary report
    rows = [result.to_dict() for result in results]
    
    # Collect all candidates and queries for summary
    all_candidates: List[Dict[str, str]] = []
    all_queries: List[Dict[str, str]] = []
    for result in results:
        all_candidates.extend(result.candidates)
        all_queries.extend(result.queries)
    
    # Generate output file paths with timestamps
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    base_filename = with_timestamp(out_csv_base)
    
    # Write CSV files using output_writer module
    output_files = write_csv_files(results, base_filename, output_dir)
    
    # Get review indices for review-specific files
    review_indices = set()
    for result in results:
        score = result.match_score or 0.0
        artist_sim = result.artist_sim or 0.0
        artists_present = bool((result.artist or "").strip())
        needs_review = False
        
        if score < 70:
            needs_review = True
        if artists_present and artist_sim < 35:
            beatport_artists = result.beatport_artists or ""
            if not _artist_token_overlap(result.artist, beatport_artists):
                needs_review = True
        if not result.matched or not (result.beatport_url or "").strip():
            needs_review = True
        
        if needs_review:
            review_indices.add(result.playlist_index)
    
    # Write review-specific files if needed
    if review_indices:
        review_cands_path = write_review_candidates_csv(results, review_indices, base_filename, output_dir)
        review_queries_path = write_review_queries_csv(results, review_indices, base_filename, output_dir)
        if review_cands_path:
            output_files['review_candidates'] = review_cands_path
            _logger.info(f"Review candidates: {len([c for r in results if r.playlist_index in review_indices for c in r.candidates])} rows -> {review_cands_path}")
        if review_queries_path:
            output_files['review_queries'] = review_queries_path
            _logger.info(f"Review queries: {len([q for r in results if r.playlist_index in review_indices for q in r.queries])} rows -> {review_queries_path}")
    
    # Log file output messages
    if output_files.get('main'):
        _logger.info(f"\nDone. Wrote {len(rows)} rows -> {output_files['main']}")
    if output_files.get('candidates'):
        _logger.info(f"Candidates: {len(all_candidates)} rows -> {output_files['candidates']}")
    if output_files.get('queries'):
        _logger.info(f"Queries: {len(all_queries)} rows -> {output_files['queries']}")
    if output_files.get('review'):
        review_count = len([r for r in results if r.playlist_index in review_indices])
        _logger.info(f"Review list: {review_count} rows -> {output_files['review']}")
    
    # Handle unmatched tracks display and re-search prompt (if not auto-research)
    unmatched_results = [r for r in results if not r.matched]
    if unmatched_results and not auto_research:
        # Display list of unmatched tracks
        _logger.warning(f"\n{'='*80}")
        _logger.warning(f"Found {len(unmatched_results)} unmatched track(s):")
        _logger.warning(f"{'='*80}")
        print(f"\n{'='*80}")
        print(f"Found {len(unmatched_results)} unmatched track(s):")
        print(f"{'='*80}")
        for result in unmatched_results:
            artists_str = result.artist or "(no artists)"
            try:
                _logger.warning(f"  [{result.playlist_index}] {result.title} - {artists_str}")
                print(f"  [{result.playlist_index}] {result.title} - {artists_str}")
            except UnicodeEncodeError:
                # Unicode-safe fallback
                safe_title = result.title.encode('ascii', 'ignore').decode('ascii')
                safe_artists = artists_str.encode('ascii', 'ignore').decode('ascii')
                _logger.warning(f"  [{result.playlist_index}] {safe_title} - {safe_artists}")
                print(f"  [{result.playlist_index}] {safe_title} - {safe_artists}")
        
        _logger.warning(f"\n{'='*80}")
        print(f"\n{'='*80}")
        # Check if we're in an interactive environment
        if sys.stdin.isatty():
            # Interactive mode: prompt user for confirmation
            try:
                response = input("Search again for these tracks with enhanced settings? (y/n): ").strip().lower()
                _logger.info(f"User response to re-search prompt: {response}")
            except (EOFError, KeyboardInterrupt):
                # User interrupted (Ctrl+C) or EOF
                _logger.warning("\nRe-search skipped (interrupted).")
                print("\nRe-search skipped (interrupted).")
                response = 'n'
        else:
            # Non-interactive mode (piped input, script, etc.): skip prompt
            _logger.info("Non-interactive mode: Skipping re-search prompt.")
            print("Non-interactive mode: Skipping re-search prompt.")
            print("(To enable re-search, use --auto-research flag or run in interactive terminal)")
            _logger.info("(To enable re-search, use --auto-research flag or run in interactive terminal)")
            response = 'n'
        
        if response == 'y' or response == 'yes':
            _logger.info("\nRe-searching unmatched tracks with enhanced settings...")
            print("\nRe-searching unmatched tracks with enhanced settings...")
            print("=" * 80)
            
            # Re-process playlist with auto_research=True
            try:
                # Create new progress callback for re-search
                pbar_research_container = [None]
                
                def cli_progress_callback_research(progress_info: ProgressInfo):
                    """CLI progress callback for re-search"""
                    if pbar_research_container[0] is None:
                        pbar_research_container[0] = tqdm(total=progress_info.total_tracks, desc="Re-searching", unit="track",
                                                         bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]')
                    pbar_research = pbar_research_container[0]
                    pbar_research.n = progress_info.completed_tracks
                    pbar_research.refresh()
                    pbar_research.set_postfix({
                        'matched': progress_info.matched_count,
                        'unmatched': progress_info.unmatched_count
                    })
                
                # Re-process with auto_research=True
                updated_results = process_playlist(
                    xml_path=xml_path,
                    playlist_name=playlist_name,
                    progress_callback=cli_progress_callback_research,
                    auto_research=True
                )
                
                if pbar_research_container[0] is not None:
                    pbar_research_container[0].close()
                
                # Update results with new matches
                results_dict = {r.playlist_index: r for r in results}
                for new_result in updated_results:
                    if new_result.matched:
                        old_result = results_dict.get(new_result.playlist_index)
                        if old_result is None or not old_result.matched:
                            # This is a new match or improved match
                            results_dict[new_result.playlist_index] = new_result
                
                # Rebuild results list maintaining order
                results = [results_dict.get(i, r) for i, r in enumerate(results, start=1) if i <= len(results)]
                
                # Update rows and files
                rows = [result.to_dict() for result in results]
                all_candidates = []
                all_queries = []
                for result in results:
                    all_candidates.extend(result.candidates)
                    all_queries.extend(result.queries)
                
                # Re-write CSV files
                output_files = write_csv_files(results, base_filename, output_dir)
                
                # Update review files
                review_indices = set()
                for result in results:
                    score = result.match_score or 0.0
                    artist_sim = result.artist_sim or 0.0
                    artists_present = bool((result.artist or "").strip())
                    needs_review = False
                    
                    if score < 70:
                        needs_review = True
                    if artists_present and artist_sim < 35:
                        beatport_artists = result.beatport_artists or ""
                        if not _artist_token_overlap(result.artist, beatport_artists):
                            needs_review = True
                    if not result.matched or not (result.beatport_url or "").strip():
                        needs_review = True
                    
                    if needs_review:
                        review_indices.add(result.playlist_index)
                
                if review_indices:
                    review_cands_path = write_review_candidates_csv(results, review_indices, base_filename, output_dir)
                    review_queries_path = write_review_queries_csv(results, review_indices, base_filename, output_dir)
                    if review_cands_path:
                        output_files['review_candidates'] = review_cands_path
                    if review_queries_path:
                        output_files['review_queries'] = review_queries_path
                
                new_matches = sum(1 for r in results if r.matched and (results_dict.get(r.playlist_index) is None or not results_dict.get(r.playlist_index).matched))
                if new_matches > 0:
                    _logger.info(f"\n{'='*80}")
                    _logger.info(f"Found {new_matches} new match(es)!")
                    _logger.info(f"Updated CSV files.")
                    print(f"\n{'='*80}")
                    print(f"Found {new_matches} new match(es)!")
                    print(f"Updated CSV files.")
                else:
                    _logger.info(f"\nNo new matches found after re-search.")
                    print(f"\nNo new matches found after re-search.")
                
                _logger.info(f"\n{'='*80}")
                _logger.info("Re-search complete.")
                print(f"\n{'='*80}")
                print("Re-search complete.")
            except ProcessingError as e:
                print_error(f"Re-search error: {e.message}", exit_code=None)
            except Exception as e:
                print_error(f"Re-search failed: {str(e)}", exit_code=None)
        else:
            _logger.info("Re-search skipped.")
            print("Re-search skipped.")
    
    # Calculate total processing time
    processing_time_sec = time.perf_counter() - processing_start_time
    
    # Generate and display summary statistics report
    summary = generate_summary_report(
        playlist_name=playlist_name,
        rows=rows,
        all_candidates=all_candidates,
        all_queries=all_queries,
        processing_time_sec=processing_time_sec,
        output_files=output_files
    )
    
    # Print summary (already ASCII-safe) and log it
    _logger.info("\n" + summary)
    print("\n" + summary)
    
    # Optionally save summary to file
    summary_file = os.path.join(output_dir, re.sub(r"\.csv$", "_summary.txt", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_summary.txt")
    try:
        with open(summary_file, "w", encoding="utf-8") as f:
            f.write(summary)
        _logger.info(f"\nSummary saved to: {summary_file}")
        print(f"\nSummary saved to: {summary_file}")
    except Exception as e:
        # If we can't write summary file, just continue (non-critical)
        pass


def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Process track using async I/O.
    
    This is an async version of process_track_with_callback that uses async I/O
    for network requests, providing better performance for multi-track processing.
    
    Args:
        idx: Track index
        rb: Rekordbox track object
        settings: Processing settings
        max_concurrent: Maximum concurrent requests
    
    Returns:
        TrackResult object
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_track_with_callback(idx, rb, settings)
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    t0 = time.perf_counter()
    
    # Extract artists, clean title (same logic as sync version)
    original_artists = rb.artists or ""
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists
    
    title_only_search = False
    extracted = False
    
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True
    
    # Generate queries
    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )
    
    # Extract mix/remix information
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)
    
    # Create event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create aiohttp session
        async def run_async_matching():
            async with aiohttp.ClientSession() as session:
                # Run async matching
                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                    session=session,
                    idx=idx,
                    track_title=title_for_search,
                    track_artists_for_scoring=artists_for_scoring,
                    title_only_mode=(title_only_search and not extracted),
                    queries=queries,
                    input_year=None,
                    input_key=None,
                    input_mix=input_mix_flags,
                    input_generic_phrases=input_generic_phrases,
                    max_concurrent=max_concurrent
                )
                return best, candlog, queries_audit, stop_qidx
        
        best, candlog, queries_audit, stop_qidx = loop.run_until_complete(run_async_matching())
        
        # Convert to TrackResult (same logic as sync version)
        dur = (time.perf_counter() - t0) * 1000
        
        # Build candidate rows
        cand_rows: List[Dict[str, str]] = []
        for c in candlog:
            m = re.search(r'/track/[^/]+/(\d+)', c.url)
            bp_id = m.group(1) if m else ""
            cand_rows.append({
                "playlist_index": str(idx),
                "original_title": rb.title,
                "original_artists": rb.artists,
                "candidate_url": c.url,
                "candidate_track_id": bp_id,
                "candidate_title": c.title,
                "candidate_artists": c.artists,
                "candidate_key": c.key or "",
                "candidate_key_camelot": _camelot_key(c.key),
                "candidate_year": str(c.release_year) if c.release_year else "",
                "candidate_bpm": c.bpm or "",
                "candidate_label": c.label or "",
                "candidate_genres": c.genres or "",
                "candidate_release": c.release_name or "",
                "candidate_release_date": c.release_date or "",
                "title_sim": str(c.title_sim),
                "artist_sim": str(c.artist_sim),
                "base_score": f"{c.base_score:.1f}",
                "bonus_year": str(c.bonus_year),
                "bonus_key": str(c.bonus_key),
                "final_score": f"{c.score:.1f}",
                "guard_ok": "Y" if c.guard_ok else "N",
                "reject_reason": c.reject_reason or "",
                "search_query_index": str(c.query_index),
                "search_query_text": c.query_text,
                "candidate_index": str(c.candidate_index),
                "elapsed_ms": str(c.elapsed_ms),
                "winner": "Y" if c.is_winner else "N",
            })
        
        # Build query rows
        queries_rows: List[Dict[str, str]] = []
        for (qidx, qtext, num_cands, q_ms) in queries_audit:
            is_winner = "Y" if (best and qidx == best.query_index) else "N"
            winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
            is_stop = "Y" if qidx == stop_qidx else "N"
            queries_rows.append({
                "playlist_index": str(idx),
                "original_title": rb.title,
                "original_artists": rb.artists,
                "search_query_index": str(qidx),
                "search_query_text": qtext,
                "candidate_count": str(num_cands),
                "elapsed_ms": str(q_ms),
                "winner_query": is_winner,
                "winner_candidate_index": winner_cand_idx,
                "stop_query": is_stop,
            })
        
        if best:
            m = re.search(r'/track/[^/]+/(\d+)', best.url)
            beatport_track_id = m.group(1) if m else ""
            
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=True,
                beatport_url=best.url,
                beatport_title=best.title,
                beatport_artists=best.artists,
                match_score=best.score,
                title_sim=float(best.title_sim),
                artist_sim=float(best.artist_sim),
                confidence=_confidence_label(best.score),
                beatport_key=best.key,
                beatport_key_camelot=_camelot_key(best.key) or "",
                beatport_year=str(best.release_year) if best.release_year else None,
                beatport_bpm=best.bpm,
                beatport_label=best.label,
                beatport_genres=best.genres,
                beatport_release=best.release_name,
                beatport_release_date=best.release_date,
                beatport_track_id=beatport_track_id,
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index=str(best.query_index),
                search_stop_query_index=str(stop_qidx),
                candidate_index=str(best.candidate_index),
            )
        else:
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=False,
                match_score=0.0,
                title_sim=0.0,
                artist_sim=0.0,
                confidence="low",
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index="0",
                search_stop_query_index=str(stop_qidx),
                candidate_index="0",
            )
        
    finally:
        loop.close()


def _convert_async_match_to_track_result(
    idx: int,
    rb: RBTrack,
    best: Optional[Any],
    candlog: List[Any],
    queries_audit: List[Tuple[int, str, int, int]],
    stop_qidx: int
) -> TrackResult:
    """Convert async match results to TrackResult (reuses logic from process_track_async)"""
    from matcher import _camelot_key, _confidence_label
    
    # Build candidate rows
    cand_rows: List[Dict[str, str]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "candidate_url": c.url,
            "candidate_track_id": bp_id,
            "candidate_title": c.title,
            "candidate_artists": c.artists,
            "candidate_key": c.key or "",
            "candidate_key_camelot": _camelot_key(c.key),
            "candidate_year": str(c.release_year) if c.release_year else "",
            "candidate_bpm": c.bpm or "",
            "candidate_label": c.label or "",
            "candidate_genres": c.genres or "",
            "candidate_release": c.release_name or "",
            "candidate_release_date": c.release_date or "",
            "title_sim": str(c.title_sim),
            "artist_sim": str(c.artist_sim),
            "base_score": f"{c.base_score:.1f}",
            "bonus_year": str(c.bonus_year),
            "bonus_key": str(c.bonus_key),
            "final_score": f"{c.score:.1f}",
            "guard_ok": "Y" if c.guard_ok else "N",
            "reject_reason": c.reject_reason or "",
            "search_query_index": str(c.query_index),
            "search_query_text": c.query_text,
            "candidate_index": str(c.candidate_index),
            "elapsed_ms": str(c.elapsed_ms),
            "winner": "Y" if c.is_winner else "N",
        })
    
    # Build query rows
    queries_rows: List[Dict[str, str]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "search_query_index": str(qidx),
            "search_query_text": qtext,
            "candidate_count": str(num_cands),
            "elapsed_ms": str(q_ms),
            "winner_query": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "stop_query": is_stop,
        })
    
    if best:
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_url=best.url,
            beatport_title=best.title,
            beatport_artists=best.artists,
            match_score=best.score,
            title_sim=float(best.title_sim),
            artist_sim=float(best.artist_sim),
            confidence=_confidence_label(best.score),
            beatport_key=best.key,
            beatport_key_camelot=_camelot_key(best.key) or "",
            beatport_year=str(best.release_year) if best.release_year else None,
            beatport_bpm=best.bpm,
            beatport_label=best.label,
            beatport_genres=best.genres,
            beatport_release=best.release_name,
            beatport_release_date=best.release_date,
            beatport_track_id=beatport_track_id,
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index=str(best.query_index),
            search_stop_query_index=str(stop_qidx),
            candidate_index=str(best.candidate_index),
        )
    else:
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index="0",
            search_stop_query_index=str(stop_qidx),
            candidate_index="0",
        )


def process_playlist_async(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None,
    max_concurrent_tracks: int = 5,
    max_concurrent_requests: int = 10
) -> List[TrackResult]:
    """
    Process playlist using async I/O with parallel track processing.
    
    Args:
        xml_path: Path to playlist XML file
        playlist_name: Name of playlist
        settings: Processing settings
        progress_callback: Optional progress callback
        controller: Optional controller for cancellation
        max_concurrent_tracks: Maximum tracks to process concurrently
        max_concurrent_requests: Maximum requests per track
    
    Returns:
        List of TrackResult objects
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_playlist(xml_path, playlist_name, settings, progress_callback, controller)
    
    # Start performance session
    if PERFORMANCE_AVAILABLE and performance_collector:
        try:
            performance_collector.start_session()
        except Exception:
            pass  # Don't let performance collection errors break processing
    
    # Track processing start time
    processing_start_time = time.perf_counter()
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    # Parse Rekordbox XML file to extract tracks and playlists
    try:
        tracks_by_id, playlists = parse_rekordbox(xml_path)
    except FileNotFoundError:
        raise ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            details="The specified Rekordbox XML export file does not exist.",
            suggestions=[
                "Check that the file path is correct",
                "Verify the file exists and is readable",
                "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
            ],
            recoverable=False
        )
    except Exception as e:
        error_msg = str(e)
        if error_msg.startswith("="):
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=error_msg,
                details=f"Failed to parse XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
        else:
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=f"XML parsing failed: {error_msg}",
                details=f"Error occurred while parsing XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        available_playlists = sorted(playlists.keys())
        raise ProcessingError(
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
            message=f"Playlist '{playlist_name}' not found in XML file",
            details=f"Available playlists: {', '.join(available_playlists[:10])}{'...' if len(available_playlists) > 10 else ''}",
            suggestions=[
                "Check the playlist name spelling (case-sensitive)",
                f"Verify '{playlist_name}' exists in your Rekordbox library",
                "Export a fresh XML file from Rekordbox",
                "Choose from available playlists listed above"
            ],
            recoverable=True
        )
    
    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))
    
    if not inputs:
        raise ProcessingError(
            error_type=ErrorType.VALIDATION_ERROR,
            message=f"Playlist '{playlist_name}' is empty",
            details="The playlist contains no valid tracks.",
            suggestions=[
                "Verify the playlist has tracks in Rekordbox",
                "Export a fresh XML file from Rekordbox"
            ],
            recoverable=True
        )
    
    # Initialize results list and statistics
    results: List[TrackResult] = []
    matched_count = 0
    unmatched_count = 0
    total_tracks = len(inputs)
    
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Process tracks in parallel batches
        for i in range(0, total_tracks, max_concurrent_tracks):
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            batch = inputs[i:i + max_concurrent_tracks]
            
            # Process batch concurrently
            async def process_batch():
                # Create aiohttp session for this batch
                async with aiohttp.ClientSession() as session:
                    # Process all tracks in batch concurrently
                    tasks = []
                    for idx, rb in batch:
                        # Check for cancellation
                        if controller and controller.is_cancelled():
                            break
                        
                        # Create async task for each track using a factory function to capture variables
                        def create_task(track_idx, track_rb):
                            async def process_single_track():
                                # Import here to avoid circular imports
                                from matcher import async_best_beatport_match
                                
                                # Extract artists, clean title (same logic as sync version)
                                original_artists = track_rb.artists or ""
                                title_for_search = sanitize_title_for_search(track_rb.title)
                                artists_for_scoring = original_artists
                                
                                title_only_search = False
                                extracted = False
                                
                                if not original_artists.strip():
                                    ex = extract_artists_from_title(track_rb.title)
                                    if ex:
                                        artists_for_scoring, extracted_title = ex
                                        title_for_search = sanitize_title_for_search(extracted_title)
                                        extracted = True
                                    title_only_search = True
                                
                                # Generate queries
                                queries = make_search_queries(
                                    title_for_search,
                                    ("" if title_only_search else artists_for_scoring),
                                    original_title=track_rb.title
                                )
                                
                                # Extract mix/remix information
                                input_mix_flags = _parse_mix_flags(track_rb.title)
                                input_generic_phrases = _extract_generic_parenthetical_phrases(track_rb.title)
                                
                                # Run async matching
                                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                                    session=session,
                                    idx=track_idx,
                                    track_title=title_for_search,
                                    track_artists_for_scoring=artists_for_scoring,
                                    title_only_mode=(title_only_search and not extracted),
                                    queries=queries,
                                    input_year=None,
                                    input_key=None,
                                    input_mix=input_mix_flags,
                                    input_generic_phrases=input_generic_phrases,
                                    max_concurrent=max_concurrent_requests
                                )
                                
                                # Convert to TrackResult (reuse logic from process_track_async)
                                return _convert_async_match_to_track_result(
                                    track_idx, track_rb, best, candlog, queries_audit, stop_qidx
                                )
                            return process_single_track
                        
                        tasks.append(create_task(idx, rb)())
                    
                    # Wait for all tasks in batch to complete
                    batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Handle results and exceptions
                    valid_results = []
                    for result in batch_results:
                        if isinstance(result, Exception):
                            valid_results.append(None)  # Will be handled below
                        else:
                            valid_results.append(result)
                    
                    return valid_results
            
            batch_results = loop.run_until_complete(process_batch())
            
            # Process batch results
            for j, result in enumerate(batch_results):
                if result is None:
                    # Create error result for failed track
                    idx, rb = batch[j]
                    error_result = TrackResult(
                        playlist_index=idx,
                        title=rb.title,
                        artist=rb.artists or "",
                        matched=False
                    )
                    results.append(error_result)
                    unmatched_count += 1
                else:
                    results.append(result)
                    if result.matched:
                        matched_count += 1
                    else:
                        unmatched_count += 1
                    
                    # Update progress callback
                    if progress_callback:
                        elapsed_time = time.perf_counter() - processing_start_time
                        progress_info = ProgressInfo(
                            completed_tracks=len(results),
                            total_tracks=total_tracks,
                            matched_count=matched_count,
                            unmatched_count=unmatched_count,
                            current_track={
                                'title': result.title,
                                'artists': result.artist
                            },
                            elapsed_time=elapsed_time
                        )
                        try:
                            progress_callback(progress_info)
                        except Exception:
                            pass  # Don't let callback errors break processing
        
        # Sort results by playlist index to maintain order
        results.sort(key=lambda r: r.playlist_index)
        
        return results
        
    finally:
        loop.close()


def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Process track using async I/O.
    
    This is an async version of process_track_with_callback that uses async I/O
    for network requests, providing better performance for multi-track processing.
    
    Args:
        idx: Track index
        rb: Rekordbox track object
        settings: Processing settings
        max_concurrent: Maximum concurrent requests
    
    Returns:
        TrackResult object
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_track_with_callback(idx, rb, settings)
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    t0 = time.perf_counter()
    
    # Extract artists, clean title (same logic as sync version)
    original_artists = rb.artists or ""
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists
    
    title_only_search = False
    extracted = False
    
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True
    
    # Generate queries
    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )
    
    # Extract mix/remix information
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)
    
    # Create event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create aiohttp session
        async def run_async_matching():
            async with aiohttp.ClientSession() as session:
                # Run async matching
                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                    session=session,
                    idx=idx,
                    track_title=title_for_search,
                    track_artists_for_scoring=artists_for_scoring,
                    title_only_mode=(title_only_search and not extracted),
                    queries=queries,
                    input_year=None,
                    input_key=None,
                    input_mix=input_mix_flags,
                    input_generic_phrases=input_generic_phrases,
                    max_concurrent=max_concurrent
                )
                return best, candlog, queries_audit, stop_qidx
        
        best, candlog, queries_audit, stop_qidx = loop.run_until_complete(run_async_matching())
        
        # Convert to TrackResult (same logic as sync version)
        dur = (time.perf_counter() - t0) * 1000
        
        # Build candidate rows
        cand_rows: List[Dict[str, str]] = []
        for c in candlog:
            m = re.search(r'/track/[^/]+/(\d+)', c.url)
            bp_id = m.group(1) if m else ""
            cand_rows.append({
                "playlist_index": str(idx),
                "original_title": rb.title,
                "original_artists": rb.artists,
                "candidate_url": c.url,
                "candidate_track_id": bp_id,
                "candidate_title": c.title,
                "candidate_artists": c.artists,
                "candidate_key": c.key or "",
                "candidate_key_camelot": _camelot_key(c.key),
                "candidate_year": str(c.release_year) if c.release_year else "",
                "candidate_bpm": c.bpm or "",
                "candidate_label": c.label or "",
                "candidate_genres": c.genres or "",
                "candidate_release": c.release_name or "",
                "candidate_release_date": c.release_date or "",
                "title_sim": str(c.title_sim),
                "artist_sim": str(c.artist_sim),
                "base_score": f"{c.base_score:.1f}",
                "bonus_year": str(c.bonus_year),
                "bonus_key": str(c.bonus_key),
                "final_score": f"{c.score:.1f}",
                "guard_ok": "Y" if c.guard_ok else "N",
                "reject_reason": c.reject_reason or "",
                "search_query_index": str(c.query_index),
                "search_query_text": c.query_text,
                "candidate_index": str(c.candidate_index),
                "elapsed_ms": str(c.elapsed_ms),
                "winner": "Y" if c.is_winner else "N",
            })
        
        # Build query rows
        queries_rows: List[Dict[str, str]] = []
        for (qidx, qtext, num_cands, q_ms) in queries_audit:
            is_winner = "Y" if (best and qidx == best.query_index) else "N"
            winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
            is_stop = "Y" if qidx == stop_qidx else "N"
            queries_rows.append({
                "playlist_index": str(idx),
                "original_title": rb.title,
                "original_artists": rb.artists,
                "search_query_index": str(qidx),
                "search_query_text": qtext,
                "candidate_count": str(num_cands),
                "elapsed_ms": str(q_ms),
                "winner_query": is_winner,
                "winner_candidate_index": winner_cand_idx,
                "stop_query": is_stop,
            })
        
        if best:
            m = re.search(r'/track/[^/]+/(\d+)', best.url)
            beatport_track_id = m.group(1) if m else ""
            
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=True,
                beatport_url=best.url,
                beatport_title=best.title,
                beatport_artists=best.artists,
                match_score=best.score,
                title_sim=float(best.title_sim),
                artist_sim=float(best.artist_sim),
                confidence=_confidence_label(best.score),
                beatport_key=best.key,
                beatport_key_camelot=_camelot_key(best.key) or "",
                beatport_year=str(best.release_year) if best.release_year else None,
                beatport_bpm=best.bpm,
                beatport_label=best.label,
                beatport_genres=best.genres,
                beatport_release=best.release_name,
                beatport_release_date=best.release_date,
                beatport_track_id=beatport_track_id,
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index=str(best.query_index),
                search_stop_query_index=str(stop_qidx),
                candidate_index=str(best.candidate_index),
            )
        else:
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=False,
                match_score=0.0,
                title_sim=0.0,
                artist_sim=0.0,
                confidence="low",
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index="0",
                search_stop_query_index=str(stop_qidx),
                candidate_index="0",
            )
        
    finally:
        loop.close()


def process_playlist_async(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None,
    max_concurrent_tracks: int = 5,
    max_concurrent_requests: int = 10
) -> List[TrackResult]:
    """
    Process playlist using async I/O with parallel track processing.
    
    Args:
        xml_path: Path to playlist XML file
        playlist_name: Name of playlist
        settings: Processing settings
        progress_callback: Optional progress callback
        controller: Optional controller for cancellation
        max_concurrent_tracks: Maximum tracks to process concurrently
        max_concurrent_requests: Maximum requests per track
    
    Returns:
        List of TrackResult objects
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_playlist(xml_path, playlist_name, settings, progress_callback, controller)
    
    # Start performance session
    if PERFORMANCE_AVAILABLE and performance_collector:
        try:
            performance_collector.start_session()
        except Exception:
            pass  # Don't let performance collection errors break processing
    
    # Track processing start time
    processing_start_time = time.perf_counter()
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    # Parse Rekordbox XML file to extract tracks and playlists
    try:
        tracks_by_id, playlists = parse_rekordbox(xml_path)
    except FileNotFoundError:
        raise ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            details="The specified Rekordbox XML export file does not exist.",
            suggestions=[
                "Check that the file path is correct",
                "Verify the file exists and is readable",
                "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
            ],
            recoverable=False
        )
    except Exception as e:
        error_msg = str(e)
        if error_msg.startswith("="):
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=error_msg,
                details=f"Failed to parse XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
        else:
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=f"XML parsing failed: {error_msg}",
                details=f"Error occurred while parsing XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        available_playlists = sorted(playlists.keys())
        raise ProcessingError(
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
            message=f"Playlist '{playlist_name}' not found in XML file",
            details=f"Available playlists: {', '.join(available_playlists[:10])}{'...' if len(available_playlists) > 10 else ''}",
            suggestions=[
                "Check the playlist name spelling (case-sensitive)",
                f"Verify '{playlist_name}' exists in your Rekordbox library",
                "Export a fresh XML file from Rekordbox",
                "Choose from available playlists listed above"
            ],
            recoverable=True
        )
    
    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))
    
    if not inputs:
        raise ProcessingError(
            error_type=ErrorType.VALIDATION_ERROR,
            message=f"Playlist '{playlist_name}' is empty",
            details="The playlist contains no valid tracks.",
            suggestions=[
                "Verify the playlist has tracks in Rekordbox",
                "Export a fresh XML file from Rekordbox"
            ],
            recoverable=True
        )
    
    # Initialize results list and statistics
    results: List[TrackResult] = []
    matched_count = 0
    unmatched_count = 0
    total_tracks = len(inputs)
    
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Process tracks in parallel batches
        for i in range(0, total_tracks, max_concurrent_tracks):
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            batch = inputs[i:i + max_concurrent_tracks]
            
            # Process batch concurrently
            async def process_batch():
                # Create aiohttp session for this batch
                async with aiohttp.ClientSession() as session:
                    # Process all tracks in batch concurrently
                    tasks = []
                    for idx, rb in batch:
                        # Check for cancellation
                        if controller and controller.is_cancelled():
                            break
                        
                        # Create async task for each track using a factory function to capture variables
                        def create_task(track_idx, track_rb):
                            async def process_single_track():
                                # Import here to avoid circular imports
                                from matcher import async_best_beatport_match
                                
                                # Extract artists, clean title (same logic as sync version)
                                original_artists = track_rb.artists or ""
                                title_for_search = sanitize_title_for_search(track_rb.title)
                                artists_for_scoring = original_artists
                                
                                title_only_search = False
                                extracted = False
                                
                                if not original_artists.strip():
                                    ex = extract_artists_from_title(track_rb.title)
                                    if ex:
                                        artists_for_scoring, extracted_title = ex
                                        title_for_search = sanitize_title_for_search(extracted_title)
                                        extracted = True
                                    title_only_search = True
                                
                                # Generate queries
                                queries = make_search_queries(
                                    title_for_search,
                                    ("" if title_only_search else artists_for_scoring),
                                    original_title=track_rb.title
                                )
                                
                                # Extract mix/remix information
                                input_mix_flags = _parse_mix_flags(track_rb.title)
                                input_generic_phrases = _extract_generic_parenthetical_phrases(track_rb.title)
                                
                                # Run async matching
                                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                                    session=session,
                                    idx=track_idx,
                                    track_title=title_for_search,
                                    track_artists_for_scoring=artists_for_scoring,
                                    title_only_mode=(title_only_search and not extracted),
                                    queries=queries,
                                    input_year=None,
                                    input_key=None,
                                    input_mix=input_mix_flags,
                                    input_generic_phrases=input_generic_phrases,
                                    max_concurrent=max_concurrent_requests
                                )
                                
                                # Convert to TrackResult (reuse logic from process_track_async)
                                return _convert_async_match_to_track_result(
                                    track_idx, track_rb, best, candlog, queries_audit, stop_qidx
                                )
                            return process_single_track
                        
                        tasks.append(create_task(idx, rb)())
                    
                    # Wait for all tasks in batch to complete
                    batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Handle results and exceptions
                    valid_results = []
                    for result in batch_results:
                        if isinstance(result, Exception):
                            # Create error result
                            # We need the track info, but we lost it in the exception
                            # For now, create a basic error result
                            valid_results.append(None)  # Will be handled below
                        else:
                            valid_results.append(result)
                    
                    return valid_results
            
            batch_results = loop.run_until_complete(process_batch())
            
            # Process batch results
            for j, result in enumerate(batch_results):
                if result is None:
                    # Create error result for failed track
                    idx, rb = batch[j]
                    error_result = TrackResult(
                        playlist_index=idx,
                        title=rb.title,
                        artist=rb.artists or "",
                        matched=False
                    )
                    results.append(error_result)
                    unmatched_count += 1
                else:
                    results.append(result)
                    if result.matched:
                        matched_count += 1
                    else:
                        unmatched_count += 1
                    
                    # Update progress callback
                    if progress_callback:
                        elapsed_time = time.perf_counter() - processing_start_time
                        progress_info = ProgressInfo(
                            completed_tracks=len(results),
                            total_tracks=total_tracks,
                            matched_count=matched_count,
                            unmatched_count=unmatched_count,
                            current_track={
                                'title': result.title,
                                'artists': result.artist
                            },
                            elapsed_time=elapsed_time
                        )
                        try:
                            progress_callback(progress_info)
                        except Exception:
                            pass  # Don't let callback errors break processing
        
        # Sort results by playlist index to maintain order
        results.sort(key=lambda r: r.playlist_index)
        
        return results
        
    finally:
        loop.close()


def _convert_async_match_to_track_result(
    idx: int,
    rb: RBTrack,
    best: Optional[Any],
    candlog: List[Any],
    queries_audit: List[Tuple[int, str, int, int]],
    stop_qidx: int
) -> TrackResult:
    """Convert async match results to TrackResult (reuses logic from process_track_async)"""
    from matcher import _camelot_key, _confidence_label
    
    # Build candidate rows
    cand_rows: List[Dict[str, str]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "candidate_url": c.url,
            "candidate_track_id": bp_id,
            "candidate_title": c.title,
            "candidate_artists": c.artists,
            "candidate_key": c.key or "",
            "candidate_key_camelot": _camelot_key(c.key),
            "candidate_year": str(c.release_year) if c.release_year else "",
            "candidate_bpm": c.bpm or "",
            "candidate_label": c.label or "",
            "candidate_genres": c.genres or "",
            "candidate_release": c.release_name or "",
            "candidate_release_date": c.release_date or "",
            "title_sim": str(c.title_sim),
            "artist_sim": str(c.artist_sim),
            "base_score": f"{c.base_score:.1f}",
            "bonus_year": str(c.bonus_year),
            "bonus_key": str(c.bonus_key),
            "final_score": f"{c.score:.1f}",
            "guard_ok": "Y" if c.guard_ok else "N",
            "reject_reason": c.reject_reason or "",
            "search_query_index": str(c.query_index),
            "search_query_text": c.query_text,
            "candidate_index": str(c.candidate_index),
            "elapsed_ms": str(c.elapsed_ms),
            "winner": "Y" if c.is_winner else "N",
        })
    
    # Build query rows
    queries_rows: List[Dict[str, str]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "search_query_index": str(qidx),
            "search_query_text": qtext,
            "candidate_count": str(num_cands),
            "elapsed_ms": str(q_ms),
            "winner_query": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "stop_query": is_stop,
        })
    
    if best:
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_url=best.url,
            beatport_title=best.title,
            beatport_artists=best.artists,
            match_score=best.score,
            title_sim=float(best.title_sim),
            artist_sim=float(best.artist_sim),
            confidence=_confidence_label(best.score),
            beatport_key=best.key,
            beatport_key_camelot=_camelot_key(best.key) or "",
            beatport_year=str(best.release_year) if best.release_year else None,
            beatport_bpm=best.bpm,
            beatport_label=best.label,
            beatport_genres=best.genres,
            beatport_release=best.release_name,
            beatport_release_date=best.release_date,
            beatport_track_id=beatport_track_id,
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index=str(best.query_index),
            search_stop_query_index=str(stop_qidx),
            candidate_index=str(best.candidate_index),
        )
    else:
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index="0",
            search_stop_query_index=str(stop_qidx),
            candidate_index="0",
        )

