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


def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    """
    Main processing function - orchestrates the entire matching pipeline
    
    This function:
    1. Parses the Rekordbox XML file
    2. Extracts tracks from the specified playlist
    3. Processes each track in parallel (if TRACK_WORKERS > 1)
    4. Collects all results and writes comprehensive CSV files
    5. Optionally re-searches unmatched tracks with enhanced settings
    
    Args:
        xml_path: Path to Rekordbox XML export file
        playlist_name: Name of playlist to process (must exist in XML)
        out_csv_base: Base filename for output CSV files (timestamp auto-appended)
        auto_research: If True, automatically re-search unmatched tracks without prompting
    
    Output files (all in output/ directory):
        - {out_csv_base} (timestamp).csv: Main results (one row per track)
        - {out_csv_base}_review.csv: Tracks needing review (low scores, weak matches)
        - {out_csv_base}_candidates.csv: All candidates evaluated for all tracks
        - {out_csv_base}_review_candidates.csv: Candidates for review tracks only
        - {out_csv_base}_queries.csv: All queries executed for all tracks
        - {out_csv_base}_review_queries.csv: Queries for review tracks only
    """
    # Set random seed for deterministic behavior (reproducible results)
    random.seed(SETTINGS["SEED"])

    # Track processing start time for summary statistics
    processing_start_time = time.perf_counter()

    # Enable HTTP response caching if available and enabled
    # Caches Beatport page responses for 24 hours to speed up repeated runs
    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        import requests_cache  # type: ignore
        requests_cache.install_cache("bp_cache", expire_after=60 * 60 * 24)

    # Parse Rekordbox XML file to extract tracks and playlists
    tracks_by_id, playlists = parse_rekordbox(xml_path)
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        raise SystemExit(
            f'Playlist "{playlist_name}" not found. Available: {", ".join(sorted(playlists.keys()))}'
        )

    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Initialize data structures for collecting results
    rows: List[Dict[str, str]] = []              # Main results (one per track)
    all_candidates: List[Dict[str, str]] = []    # All candidates evaluated across all tracks
    all_queries: List[Dict[str, str]] = []       # All queries executed across all tracks
    unmatched_tracks: List[Tuple[int, RBTrack]] = []  # Tracks with no match found (for re-search)
    # NOTE: We no longer track processed_beatport_ids globally - if the same Beatport track
    # matches multiple playlist tracks, all matches should appear in the output.

    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))

    # NOTE: We no longer skip duplicate Beatport IDs - if the same Beatport track matches
    # multiple playlist tracks, all matches should appear in the output.
    # However, we still optimize performance by skipping re-fetching/re-parsing candidates
    # that have already been seen for the same track (handled in matcher.py via visited_urls).
    
    # Create a mapping for quick lookup (used when tracking unmatched tracks in parallel mode)
    inputs_map = {idx: rb for idx, rb in inputs}
    
    # Process tracks in parallel if TRACK_WORKERS > 1, otherwise sequential
    # Parallel processing speeds up large playlists significantly
    # Progress tracking: matched/unmatched counts for progress bar display
    matched_count = 0
    unmatched_count = 0
    
    if SETTINGS["TRACK_WORKERS"] > 1:
        # PARALLEL MODE: Process multiple tracks simultaneously
        # Uses ThreadPoolExecutor to run process_track() in parallel
        # Results are collected as they complete (order may vary)
        # Use as_completed() with tqdm to show real-time progress
        with tqdm(total=len(inputs), desc="Processing tracks", unit="track", 
                  bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]') as pbar:
            with ThreadPoolExecutor(max_workers=SETTINGS["TRACK_WORKERS"]) as ex:
                # Submit all tasks - process_track takes (idx, rb) as separate args
                future_to_args = {ex.submit(process_track, idx, rb): (idx, rb) for idx, rb in inputs}
                
                # Process completed tasks as they finish
                for future in as_completed(future_to_args):
                    main_row, cand_rows, query_rows = future.result()
                    rows.append(main_row)
                    all_candidates.extend(cand_rows)
                    all_queries.extend(query_rows)
                    
                    # Track matched/unmatched for progress display
                    if (main_row.get("beatport_url") or "").strip():
                        matched_count += 1
                    else:
                        unmatched_count += 1
                        # Track unmatched tracks (no URL means no match found)
                        idx = int(main_row.get("playlist_index", "0"))
                        if idx > 0 and idx in inputs_map:
                            unmatched_tracks.append((idx, inputs_map[idx]))
                    
                    # Update progress bar with current stats
                    pbar.set_postfix({
                        'matched': matched_count,
                        'unmatched': unmatched_count,
                        'current': f"Track {main_row.get('playlist_index', '?')}"
                    })
                    pbar.update(1)
    else:
        # SEQUENTIAL MODE: Process tracks one at a time
        # Slower but uses less memory and easier to debug
        # Use tqdm to show progress bar
        with tqdm(total=len(inputs), desc="Processing tracks", unit="track",
                  bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]') as pbar:
            for args in inputs:
                idx, rb = args
                main_row, cand_rows, query_rows = process_track(*args)
                rows.append(main_row)
                all_candidates.extend(cand_rows)
                all_queries.extend(query_rows)
                
                # Track matched/unmatched for progress display
                if (main_row.get("beatport_url") or "").strip():
                    matched_count += 1
                else:
                    unmatched_count += 1
                    # Track unmatched tracks directly from input args
                    unmatched_tracks.append(args)
                
                # Update progress bar with current stats
                current_title = rb.title[:30] + "..." if len(rb.title) > 30 else rb.title
                pbar.set_postfix({
                    'matched': matched_count,
                    'unmatched': unmatched_count,
                    'current': f"#{idx}: {current_title}"
                })
                pbar.update(1)

    # ========================================================================
    # OUTPUT FILE GENERATION
    # ========================================================================
    # All output files are written to the output/ directory with timestamps
    # This ensures multiple runs don't overwrite each other
    
    # Create output directory if it doesn't exist
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

    # Generate output file paths with timestamps
    # Format: "{base} (YYYY-MM-DD HH-MM-SS).csv"
    base_filename = with_timestamp(out_csv_base)
    
    # Main results file: one row per track with best match
    out_main = os.path.join(output_dir, base_filename)
    
    # Review file: tracks that need manual review (low scores, weak matches)
    out_review = os.path.join(output_dir, re.sub(r"\.csv$", "_review.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review.csv")
    
    # Candidates file: all candidates evaluated for all tracks (comprehensive)
    out_cands = os.path.join(output_dir, re.sub(r"\.csv$", "_candidates.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_candidates.csv")
    
    # Queries file: all queries executed for all tracks (for analysis)
    out_queries = os.path.join(output_dir, re.sub(r"\.csv$", "_queries.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_queries.csv")

    main_fields = [
        "playlist_index",
        "original_title",
        "original_artists",
        "beatport_title",
        "beatport_artists",
        "beatport_key",
        "beatport_key_camelot",
        "beatport_year",
        "beatport_bpm",
        "beatport_label",
        "beatport_genres",
        "beatport_release",
        "beatport_release_date",
        "beatport_track_id",
        "beatport_url",
        "title_sim",
        "artist_sim",
        "match_score",
        "confidence",
        "search_query_index",
        "search_stop_query_index",
        "candidate_index",
    ]
    def _write_csv_no_trailing_newline(filepath: str, fieldnames: List[str], rows: List[Dict[str, str]]):
        """
        Write CSV file without trailing newline
        
        csv.DictWriter automatically adds a newline after each row, which can cause
        an extra empty row at the end when viewed in some applications (Excel, etc.).
        This function writes all rows normally except the last one, then manually
        writes the last row without the trailing newline.
        
        Args:
            filepath: Path to CSV file to write
            fieldnames: List of column names
            rows: List of dictionaries (one per row)
        """
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            if rows:
                # Write all rows except the last one normally (with newlines)
                for row in rows[:-1]:
                    writer.writerow(row)
                # Write the last row manually without trailing newline
                if len(rows) > 0:
                    last_row = rows[-1]
                    # Use StringIO to format the last row properly (handles escaping, quotes, etc.)
                    temp_buf = io.StringIO()
                    temp_writer = csv.DictWriter(temp_buf, fieldnames=fieldnames)
                    temp_writer.writerow(last_row)
                    last_row_str = temp_buf.getvalue().rstrip('\n\r')
                    f.write(last_row_str)
    
    # Write main results file
    _write_csv_no_trailing_newline(out_main, main_fields, rows)

    # ========================================================================
    # REVIEW FILE GENERATION
    # ========================================================================
    # Identify tracks that need manual review (low scores, weak matches, no matches)
    # Review files help identify problematic matches that should be checked manually
    
    review_rows: List[Dict[str, str]] = []
    review_indices = set()
    for r in rows:
        score = float(r.get("match_score", "0") or 0)
        artist_sim = int(r.get("artist_sim", "0") or 0)
        artists_present = bool((r.get("original_artists") or "").strip())
        reason = []
        
        # Flag tracks with low match scores (< 70)
        # These may be incorrect matches or incomplete matches
        if score < 70:  # Lowered from 85 to 70 to match MIN_ACCEPT_SCORE
            reason.append("score<70")
        
        # Flag tracks with weak artist matching when artists were provided
        # Artist similarity < 35% and no token overlap suggests wrong artist
        if artists_present and artist_sim < 35:
            if not _artist_token_overlap(r.get("original_artists", ""), r.get("beatport_artists", "")):
                reason.append("weak-artist-match")
        
        # Flag tracks with no match found
        if (r.get("beatport_url") or "").strip() == "":
            reason.append("no-candidates")
        
        # Add to review list if any reason flags set
        if reason:
            rr = dict(r)
            rr["review_reason"] = ",".join(reason)  # Comma-separated list of reasons
            review_rows.append(rr)
            review_indices.add(int(r.get("playlist_index", "0")))

    if review_rows:
        _write_csv_no_trailing_newline(out_review, main_fields + ["review_reason"], review_rows)
        print(f"Review list: {len(review_rows)} rows -> {out_review}")

    cand_fields = [
        "playlist_index", "original_title", "original_artists",
        "candidate_url", "candidate_track_id", "candidate_title", "candidate_artists",
        "candidate_key", "candidate_key_camelot", "candidate_year", "candidate_bpm", "candidate_label", "candidate_genres",
        "candidate_release", "candidate_release_date",
        "title_sim", "artist_sim", "base_score", "bonus_year", "bonus_key", "final_score",
        "guard_ok", "reject_reason", "search_query_index", "search_query_text", "candidate_index", "elapsed_ms", "winner",
    ]

    review_candidates = [c for c in all_candidates if int(c.get("playlist_index", "0")) in review_indices]
    if review_candidates:
        base_review_cands = re.sub(r"\.csv$", "_review_candidates.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review_candidates.csv"
        out_review_cands = os.path.join(output_dir, base_review_cands)
        _write_csv_no_trailing_newline(out_review_cands, cand_fields, review_candidates)
        print(f"Review candidates: {len(review_candidates)} rows -> {out_review_cands}")

    queries_fields = [
        "playlist_index", "original_title", "original_artists",
        "search_query_index", "search_query_text", "candidate_count", "elapsed_ms",
        "is_winner", "winner_candidate_index", "is_stop"
    ]

    review_queries = [q for q in all_queries if int(q.get("playlist_index", "0")) in review_indices]
    if review_queries:
        base_review_queries = re.sub(r"\.csv$", "_review_queries.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review_queries.csv"
        out_review_queries = os.path.join(output_dir, base_review_queries)
        _write_csv_no_trailing_newline(out_review_queries, queries_fields, review_queries)
        print(f"Review queries: {len(review_queries)} rows -> {out_review_queries}")
    if all_candidates:
        _write_csv_no_trailing_newline(out_cands, cand_fields, all_candidates)
        print(f"Candidates: {len(all_candidates)} rows -> {out_cands}")

    if all_queries:
        _write_csv_no_trailing_newline(out_queries, queries_fields, all_queries)
        print(f"Queries: {len(all_queries)} rows -> {out_queries}")

    print(f"\nDone. Wrote {len(rows)} rows -> {out_main}")
    
    # Track final rows (may be updated after re-search)
    final_rows = rows
    
    # ========================================================================
    # UNMATCHED TRACK RE-SEARCH
    # ========================================================================
    # Optionally re-search tracks that didn't find matches with enhanced settings
    # Enhanced settings: more queries, longer time budget, more search results, lower score threshold
    
    if unmatched_tracks:
        # Display list of unmatched tracks
        print(f"\n{'='*80}")
        print(f"Found {len(unmatched_tracks)} unmatched track(s):")
        print(f"{'='*80}")
        for idx, track in unmatched_tracks:
            artists_str = track.artists or "(no artists)"
            try:
                print(f"  [{idx}] {track.title} - {artists_str}")
            except UnicodeEncodeError:
                # Unicode-safe fallback
                safe_title = track.title.encode('ascii', 'ignore').decode('ascii')
                safe_artists = artists_str.encode('ascii', 'ignore').decode('ascii')
                print(f"  [{idx}] {safe_title} - {safe_artists}")
        
        print(f"\n{'='*80}")
        # Check if auto-research is enabled or if we're in an interactive environment
        if auto_research:
            # Auto-research mode: skip prompt, automatically re-search
            response = 'y'
            print("Auto-research enabled: Re-searching unmatched tracks automatically...")
        elif sys.stdin.isatty():
            # Interactive mode: prompt user for confirmation
            try:
                response = input("Search again for these tracks with enhanced settings? (y/n): ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                # User interrupted (Ctrl+C) or EOF
                print("\nRe-search skipped (interrupted).")
                response = 'n'
        else:
            # Non-interactive mode (piped input, script, etc.): skip prompt
            print("Non-interactive mode: Skipping re-search prompt.")
            print("(To enable re-search, use --auto-research flag or run in interactive terminal)")
            response = 'n'
        
        if response == 'y' or response == 'yes':
            print("\nRe-searching unmatched tracks with enhanced settings...")
            print("=" * 80)
            
            # Save original settings so we can restore them after re-search
            original_settings = {
                "PER_TRACK_TIME_BUDGET_SEC": SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC"),
                "MAX_SEARCH_RESULTS": SETTINGS.get("MAX_SEARCH_RESULTS"),
                "MAX_QUERIES_PER_TRACK": SETTINGS.get("MAX_QUERIES_PER_TRACK"),
                "REMIX_MAX_QUERIES": SETTINGS.get("REMIX_MAX_QUERIES"),
                "MIN_ACCEPT_SCORE": SETTINGS.get("MIN_ACCEPT_SCORE"),
            }
            
            # Temporarily enhance settings for re-search to maximize chances of finding matches
            # These are more aggressive settings than the initial search
            SETTINGS["PER_TRACK_TIME_BUDGET_SEC"] = max(original_settings["PER_TRACK_TIME_BUDGET_SEC"] or 45, 90)  # Double time budget
            SETTINGS["MAX_SEARCH_RESULTS"] = max(original_settings["MAX_SEARCH_RESULTS"] or 50, 100)  # Double search results
            SETTINGS["MAX_QUERIES_PER_TRACK"] = max(original_settings["MAX_QUERIES_PER_TRACK"] or 40, 60)  # 50% more queries
            SETTINGS["REMIX_MAX_QUERIES"] = max(original_settings["REMIX_MAX_QUERIES"] or 30, 50)  # More remix queries
            SETTINGS["MIN_ACCEPT_SCORE"] = max(original_settings["MIN_ACCEPT_SCORE"] or 70, 60)  # More lenient (accept lower scores)
            
            # Re-search all unmatched tracks with enhanced settings
            new_rows = []              # New matches found
            new_candidates = []        # Additional candidates from re-search
            new_queries = []           # Additional queries from re-search
            updated_indices = set()    # Indices of tracks that got new matches
            
            for idx, rb in unmatched_tracks:
                print(f"\nRe-searching [{idx}] {rb.title} - {rb.artists or '(no artists)'}")
                main_row, cand_rows, query_rows = process_track(idx, rb)
                
                # Only add if we found a match (has beatport_url)
                # If still no match, skip (don't add to new_rows)
                if (main_row.get("beatport_url") or "").strip():
                    new_rows.append(main_row)
                    new_candidates.extend(cand_rows)
                    new_queries.extend(query_rows)
                    updated_indices.add(idx)
            
            # Restore original settings (important for subsequent runs if any)
            for key, value in original_settings.items():
                if value is not None:
                    SETTINGS[key] = value
            
            # If we found new matches, update the CSV files
            if new_rows:
                print(f"\n{'='*80}")
                print(f"Found {len(new_rows)} new match(es)!")
                
                # Update existing rows with new matches
                # Convert rows list to dictionary for easy updates by index
                rows_dict = {int(r.get("playlist_index", "0")): r for r in rows}
                
                # Replace unmatched rows with newly found matches
                for new_row in new_rows:
                    idx = int(new_row.get("playlist_index", "0"))
                    rows_dict[idx] = new_row  # Replace the unmatched row with matched row
                
                # Rebuild rows list maintaining original order
                # This ensures output CSV maintains the same track order as input
                updated_rows = [rows_dict.get(int(r.get("playlist_index", "0")), r) for r in rows]
                
                # Append new candidates and queries to existing collections
                all_candidates.extend(new_candidates)
                all_queries.extend(new_queries)
                
                # Write updated CSV files
                _write_csv_no_trailing_newline(out_main, main_fields, updated_rows)
                print(f"Updated main CSV: {len(updated_rows)} rows -> {out_main}")
                
                if new_candidates:
                    _write_csv_no_trailing_newline(out_cands, cand_fields, all_candidates)
                    print(f"Updated candidates CSV: {len(all_candidates)} rows -> {out_cands}")
                
                if new_queries:
                    _write_csv_no_trailing_newline(out_queries, queries_fields, all_queries)
                    print(f"Updated queries CSV: {len(all_queries)} rows -> {out_queries}")
                
                # Update review files if needed
                review_rows = []
                review_indices = set()
                for r in updated_rows:
                    score = float(r.get("match_score", "0") or 0)
                    artist_sim = int(r.get("artist_sim", "0") or 0)
                    artists_present = bool((r.get("original_artists") or "").strip())
                    reason = []
                    if score < 70:
                        reason.append("score<70")
                    if artists_present and artist_sim < 35:
                        if not _artist_token_overlap(r.get("original_artists", ""), r.get("beatport_artists", "")):
                            reason.append("weak-artist-match")
                    if (r.get("beatport_url") or "").strip() == "":
                        reason.append("no-candidates")
                    if reason:
                        rr = dict(r)
                        rr["review_reason"] = ",".join(reason)
                        review_rows.append(rr)
                        review_indices.add(int(r.get("playlist_index", "0")))
                
                if review_rows:
                    _write_csv_no_trailing_newline(out_review, main_fields + ["review_reason"], review_rows)
                    print(f"Updated review CSV: {len(review_rows)} rows -> {out_review}")
                    
                    review_candidates = [c for c in all_candidates if int(c.get("playlist_index", "0")) in review_indices]
                    if review_candidates:
                        _write_csv_no_trailing_newline(out_review_cands, cand_fields, review_candidates)
                        print(f"Updated review candidates CSV: {len(review_candidates)} rows -> {out_review_cands}")
                    
                    review_queries = [q for q in all_queries if int(q.get("playlist_index", "0")) in review_indices]
                    if review_queries:
                        _write_csv_no_trailing_newline(out_review_queries, queries_fields, review_queries)
                        print(f"Updated review queries CSV: {len(review_queries)} rows -> {out_review_queries}")
            else:
                print(f"\nNo new matches found after re-search.")
            
            print(f"\n{'='*80}")
            print("Re-search complete.")
            # Use updated rows after re-search
            final_rows = updated_rows
        else:
            print("Re-search skipped.")
    
    # Calculate total processing time
    processing_time_sec = time.perf_counter() - processing_start_time
    
    # Prepare output files dictionary for summary
    output_files_dict = {
        "main": out_main,
        "candidates": out_cands,
        "queries": out_queries,
    }
    if os.path.exists(out_review):
        output_files_dict["review"] = out_review
    
    # Generate and display summary statistics report
    summary = generate_summary_report(
        playlist_name=playlist_name,
        rows=final_rows,
        all_candidates=all_candidates,
        all_queries=all_queries,
        processing_time_sec=processing_time_sec,
        output_files=output_files_dict
    )
    
    # Print summary (already ASCII-safe)
    print("\n" + summary)
    
    # Optionally save summary to file
    summary_file = os.path.join(output_dir, re.sub(r"\.csv$", "_summary.txt", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_summary.txt")
    try:
        with open(summary_file, "w", encoding="utf-8") as f:
            f.write(summary)
        print(f"\nSummary saved to: {summary_file}")
    except Exception as e:
        # If we can't write summary file, just continue (non-critical)
        pass

