#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CLI entry point for Rekordbox → Beatport metadata enricher

This script serves as the command-line interface for the Rekordbox to Beatport
metadata enricher. It parses command-line arguments, applies configuration presets,
and orchestrates the track matching process.

The workflow:
1. Parse command-line arguments (XML path, playlist name, output file, etc.)
2. Apply configuration presets (--fast, --turbo, --myargs, etc.)
3. Call processor.run() to process all tracks in the playlist
4. Output CSV files are generated in the output/ directory

Example usage:
    python main.py --xml collection.xml --playlist "My Playlist" --myargs --auto-research
"""

import argparse
import sys

from config import SETTINGS
from processor import run
from utils import startup_banner


def main():
    """
    Main CLI entry point
    
    This function:
    1. Sets up argument parser with all available options
    2. Applies configuration presets based on flags (--fast, --turbo, --myargs, etc.)
    3. Shows startup banner with configuration fingerprint
    4. Calls processor.run() to execute the main processing logic
    """
    # Set up command-line argument parser with all available options
    ap = argparse.ArgumentParser(description="Enrich Rekordbox playlist with Beatport metadata (Accuracy + Logs + Candidates)")
    
    # Required arguments
    ap.add_argument("--xml", required=True, help="Path to Rekordbox XML export file")
    ap.add_argument("--playlist", required=True, help="Playlist name in the XML file")
    ap.add_argument("--out", default="beatport_enriched.csv", help="Output CSV base name (timestamp auto-appended)")

    # Performance presets - these optimize for speed vs accuracy tradeoffs
    ap.add_argument("--fast", action="store_true", help="Faster defaults (safe) - reduces search results and time budgets")
    ap.add_argument("--turbo", action="store_true", help="Maximum speed (be gentle) - aggressive speed optimizations")
    ap.add_argument("--exhaustive", action="store_true",
                    help="Explode query variants (grams×artists), raise DDG per-query cap, extend time budget")

    # Logging options
    ap.add_argument("--verbose", action="store_true", help="Verbose logs - shows detailed progress information")
    ap.add_argument("--trace", action="store_true", help="Very detailed per-candidate logs - shows every candidate evaluated")

    # Determinism control
    ap.add_argument("--seed", type=int, default=0, help="Random seed for determinism (default 0) - ensures reproducible results")

    # Advanced query options
    ap.add_argument("--all-queries", action="store_true",
                help="Run EVERY query variation: disable time budget, wait for all candidates, allow tri-gram crosses")
    ap.add_argument("--myargs", action="store_true",
                    help="Ultra-aggressive preset: goes beyond defaults for maximum match discovery (slower but finds more tracks)")
    ap.add_argument("--auto-research", action="store_true",
                    help="Automatically re-search unmatched tracks without prompting - useful for batch processing")

    args = ap.parse_args()

    # Apply --fast preset: optimizes for speed with reasonable accuracy
    # - Fewer search results per query (12 vs 50)
    # - More parallel workers for faster processing
    # - Shorter time budget per track (15s vs 25s)
    if args.fast:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 8,
            "TRACK_WORKERS": 4,
            "PER_TRACK_TIME_BUDGET_SEC": 15,
            "ENABLE_CACHE": True,
        })
    # Apply --turbo preset: maximum speed with minimal accuracy tradeoffs
    # - Very few search results (12)
    # - Maximum parallelism (12 candidate workers, 8 track workers)
    # - Very short time budget (10s per track)
    if args.turbo:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 12,
            "TRACK_WORKERS": 8,
            "PER_TRACK_TIME_BUDGET_SEC": 10,
            "ENABLE_CACHE": True,
        })
    # Apply --exhaustive preset: maximum accuracy with more queries and time
    # - Many search results (100)
    # - High parallelism (16 candidate workers, 8+ track workers)
    # - Long time budget (100s+ per track)
    # - Enables cross-title-grams with artists for more query variants
    if args.exhaustive:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 100,
            "CANDIDATE_WORKERS": 16,
            "TRACK_WORKERS": max(SETTINGS["TRACK_WORKERS"], 8),
            "PER_TRACK_TIME_BUDGET_SEC": max(SETTINGS["PER_TRACK_TIME_BUDGET_SEC"], 100),
            "ENABLE_CACHE": True,
            "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,
            "CROSS_SMALL_ONLY": True,
            "REVERSE_ORDER_QUERIES": False,
        })
    # Apply --all-queries preset: run every possible query variation
    # - No time budget limit (None)
    # - All query generation features enabled
    # - Maximum workers for parallel processing
    if args.all_queries:
        SETTINGS.update({
            "RUN_ALL_QUERIES": True,
            "PER_TRACK_TIME_BUDGET_SEC": None,
            "CROSS_SMALL_ONLY": False,
            "TITLE_GRAM_MAX": max(SETTINGS["TITLE_GRAM_MAX"], 3),
            "MAX_SEARCH_RESULTS": max(SETTINGS["MAX_SEARCH_RESULTS"], 20),
            "CANDIDATE_WORKERS": max(SETTINGS["CANDIDATE_WORKERS"], 16),
            "TRACK_WORKERS": max(SETTINGS["TRACK_WORKERS"], 10),
            "ENABLE_CACHE": True,
        })

    # Ultra-aggressive preset: goes beyond defaults for maximum match discovery
    # Note: Default settings now match what --myargs used to apply
    # This preset enables even more aggressive settings for users who want maximum coverage
    if args.myargs:
        SETTINGS.update({
            # ---- Core speed/concurrency (ultra) ----
            "CANDIDATE_WORKERS": 20,  # Even more parallel workers (default: 15)
            "TRACK_WORKERS": 16,  # Even more parallel track processing (default: 12)
            "PER_TRACK_TIME_BUDGET_SEC": 60,  # Extended time budget (default: 45)

            # ---- Early exit tuning (more lenient) ----
            "EARLY_EXIT_SCORE": 88,  # Even lower threshold for faster exits (default: 90)
            "EARLY_EXIT_MIN_QUERIES": 6,  # Fewer queries before exit allowed (default: 8)
            "EARLY_EXIT_FAMILY_SCORE": 85,  # Even lower family score (default: 88)
            "EARLY_EXIT_FAMILY_AFTER": 3,  # Fewer queries for family exit (default: 5)
            "REMIX_MAX_QUERIES": 40,  # Even more remix queries (default: 30)

            # ---- Query generation (more exhaustive) ----
            "TITLE_GRAM_MAX": 3,  # Enable trigrams (default: 2)
            "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,  # Enable title-gram crossing (default: False)
            "MAX_QUERIES_PER_TRACK": 60,  # More queries per track (default: 40)
            "TITLE_COMBO_MAX_LEN": 5,  # Longer title combos (default: 4)
            "MAX_COMBO_QUERIES": 25,  # More combo queries (default: 15)

            # ---- Search depth (ultra) ----
            "MAX_SEARCH_RESULTS": 75,  # More search results (default: 50)
            "MR_LOW": 15,  # More results for low-specificity queries (default: 10)
            "MR_MED": 35,  # More results for medium queries (default: 25)
            "MR_HIGH": 75,  # More results for high-specificity queries (default: 50)

            # ---- Scoring (more lenient) ----
            "MIN_ACCEPT_SCORE": 65,  # Even more lenient acceptance (default: 70)
        })

    # Apply logging and determinism settings from command line
    SETTINGS["VERBOSE"] = bool(args.verbose)  # Enable verbose logging
    SETTINGS["TRACE"] = bool(args.trace)      # Enable trace-level logging (very detailed)
    SETTINGS["SEED"] = int(args.seed)        # Set random seed for reproducibility

    # Display startup banner with configuration fingerprint
    startup_banner(sys.argv[0], args)
    
    # Execute the main processing pipeline
    # This will:
    # 1. Parse the Rekordbox XML file
    # 2. Extract tracks from the specified playlist
    # 3. For each track, generate search queries and find best Beatport matches
    # 4. Write results to CSV files in the output/ directory
    # 5. Optionally re-search unmatched tracks if --auto-research is enabled
    run(args.xml, args.playlist, args.out, auto_research=args.auto_research)


if __name__ == "__main__":
    main()

