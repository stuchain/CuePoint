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
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

from tqdm import tqdm

from config import HAVE_CACHE, SETTINGS
from error_handling import error_playlist_not_found, error_file_not_found, print_error
from matcher import _camelot_key, _confidence_label, best_beatport_match
from mix_parser import _extract_generic_parenthetical_phrases, _parse_mix_flags
from query_generator import make_search_queries
from rekordbox import RBTrack, extract_artists_from_title, parse_rekordbox
from text_processing import _artist_token_overlap, sanitize_title_for_search
from utils import with_timestamp


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
        print(f"[{idx}] Searching Beatport for: {clean_title_for_log} - {original_artists or artists_for_scoring}", flush=True)
    except UnicodeEncodeError:
        # Fallback for terminals that can't handle Unicode (Windows console)
            safe_title = clean_title_for_log.encode('ascii', 'ignore').decode('ascii')
            safe_artists = (original_artists or artists_for_scoring).encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}] Searching Beatport for: {safe_title} - {safe_artists}", flush=True)
    
    # Inform user if artists were inferred from title
    if extracted and title_only_search:
        print(f"[{idx}]   (artists inferred from title for scoring; search is title-only)", flush=True)

    # Generate search queries based on title and artist information
    # Query generator creates multiple query variants to maximize match probability
    # It handles remix detection, artist combinations, title N-grams, etc.
    queries = make_search_queries(
        title_for_search,                    # Clean title for search
        ("" if title_only_search else artists_for_scoring),  # Artists (empty if title-only)
        original_title=rb.title              # Original title (for mix/remix detection)
    )

    # Display all generated queries for this track
    print(f"[{idx}]   queries:", flush=True)
    for i, q in enumerate(queries, 1):
        try:
            print(f"[{idx}]     {i}. site:beatport.com/track {q}", flush=True)
        except UnicodeEncodeError:
            # Unicode-safe fallback
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}]     {i}. site:beatport.com/track {safe_q}", flush=True)

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
            print(f"[{idx}] -> Match: {best.title} - {best.artists} "
              f"(key {best.key or '?'}, year {best.release_year or '?'}) "
              f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
              f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
        # Unicode-safe fallback
            safe_title = best.title.encode('ascii', 'ignore').decode('ascii')
        safe_artists = best.artists.encode('ascii', 'ignore').decode('ascii')
        safe_key = (best.key or '?').encode('ascii', 'ignore').decode('ascii')
        print(f"[{idx}] -> Match: {safe_title} - {safe_artists} "
              f"(key {safe_key}, year {best.release_year or '?'}) "
              f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
              f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)

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
            print(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]", flush=True)
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


