#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Output Writer Module - CSV file writing functions

This module handles all CSV file writing, separating I/O from business logic.
All functions take TrackResult objects as input and write CSV files.
"""

import csv
import os
from typing import List, Dict, Set, Optional
from gui_interface import TrackResult
from utils import with_timestamp


def write_csv_files(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Dict[str, str]:
    """
    Write all CSV files from TrackResult objects.
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename (timestamp will be added)
        output_dir: Output directory (default: "output")
    
    Returns:
        Dictionary mapping file type to file path:
        {
            'main': 'output/filename_20250127_123456.csv',
            'candidates': 'output/filename_candidates_20250127_123456.csv',
            'queries': 'output/filename_queries_20250127_123456.csv',
            'review': 'output/filename_review_20250127_123456.csv' (if needed)
        }
    """
    os.makedirs(output_dir, exist_ok=True)
    output_files = {}
    
    # Add timestamp to base filename
    timestamped_filename = with_timestamp(base_filename)
    
    # Write main results CSV
    main_path = write_main_csv(results, timestamped_filename, output_dir)
    if main_path:
        output_files['main'] = main_path
    
    # Write candidates CSV
    candidates_path = write_candidates_csv(results, timestamped_filename, output_dir)
    if candidates_path:
        output_files['candidates'] = candidates_path
    
    # Write queries CSV
    queries_path = write_queries_csv(results, timestamped_filename, output_dir)
    if queries_path:
        output_files['queries'] = queries_path
    
    # Write review CSV (if there are tracks needing review)
    review_indices = _get_review_indices(results)
    if review_indices:
        review_path = write_review_csv(results, review_indices, timestamped_filename, output_dir)
        if review_path:
            output_files['review'] = review_path
    
    return output_files


def write_main_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write main results CSV file (one row per track).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no results
    """
    if not results:
        return None
    
    filepath = os.path.join(output_dir, base_filename)
    
    # Define CSV columns (must match old format exactly)
    fieldnames = [
        "playlist_index", "original_title", "original_artists",
        "beatport_title", "beatport_artists", "beatport_key", "beatport_key_camelot",
        "beatport_year", "beatport_bpm", "beatport_label", "beatport_genres",
        "beatport_release", "beatport_release_date", "beatport_track_id",
        "beatport_url", "title_sim", "artist_sim", "match_score", "confidence",
        "search_query_index", "search_stop_query_index", "candidate_index"
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(result.to_dict())
    
    return filepath


def write_candidates_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write candidates CSV file (all candidates evaluated for all tracks).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no candidates
    """
    # Collect all candidates from all tracks
    all_candidates = []
    for result in results:
        all_candidates.extend(result.candidates)
    
    if not all_candidates:
        return None
    
    # Remove .csv extension and add _candidates
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_candidates.csv")
    
    # Get fieldnames from first candidate
    fieldnames = list(all_candidates[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_candidates)
    
    return filepath


def write_queries_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write queries CSV file (all queries executed for all tracks).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no queries
    """
    # Collect all queries from all tracks
    all_queries = []
    for result in results:
        all_queries.extend(result.queries)
    
    if not all_queries:
        return None
    
    # Remove .csv extension and add _queries
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_queries.csv")
    
    # Get fieldnames from first query
    fieldnames = list(all_queries[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_queries)
    
    return filepath


def write_review_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write review CSV file (tracks needing manual review).
    
    Args:
        results: List of TrackResult objects
        review_indices: Set of playlist indices that need review
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no review tracks
    """
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    # Remove .csv extension and add _review
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review.csv")
    
    # Use same format as main CSV
    fieldnames = [
        "playlist_index", "original_title", "original_artists",
        "beatport_title", "beatport_artists", "beatport_key", "beatport_key_camelot",
        "beatport_year", "beatport_bpm", "beatport_label", "beatport_genres",
        "beatport_release", "beatport_release_date", "beatport_track_id",
        "beatport_url", "title_sim", "artist_sim", "match_score", "confidence",
        "search_query_index", "search_stop_query_index", "candidate_index"
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in review_results:
            writer.writerow(result.to_dict())
    
    return filepath


def write_review_candidates_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """Write candidates CSV for review tracks only"""
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    all_candidates = []
    for result in review_results:
        all_candidates.extend(result.candidates)
    
    if not all_candidates:
        return None
    
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review_candidates.csv")
    
    fieldnames = list(all_candidates[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_candidates)
    
    return filepath


def write_review_queries_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """Write queries CSV for review tracks only"""
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    all_queries = []
    for result in review_results:
        all_queries.extend(result.queries)
    
    if not all_queries:
        return None
    
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review_queries.csv")
    
    fieldnames = list(all_queries[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_queries)
    
    return filepath


def _get_review_indices(results: List[TrackResult]) -> Set[int]:
    """
    Determine which tracks need review based on score and match quality.
    
    Review criteria (from old code):
    - Score < 70
    - Artist similarity < 50 (if artists present)
    - No match found
    """
    review_indices = set()
    
    for result in results:
        needs_review = False
        
        # Check score
        if result.match_score is not None and result.match_score < 70:
            needs_review = True
        
        # Check artist similarity (if artists present)
        if result.artist and result.artist.strip():
            if result.artist_sim is not None and result.artist_sim < 50:
                needs_review = True
        
        # Check if no match
        if not result.matched or not (result.beatport_url or "").strip():
            needs_review = True
        
        if needs_review:
            review_indices.add(result.playlist_index)
    
    return review_indices

