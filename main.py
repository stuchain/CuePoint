#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CLI entry point for Rekordbox → Beatport metadata enricher
"""

import argparse
import sys

from config import SETTINGS
from processor import run
from utils import startup_banner


def main():
    """Main CLI entry point"""
    ap = argparse.ArgumentParser(description="Enrich Rekordbox playlist with Beatport metadata (Accuracy + Logs + Candidates)")
    ap.add_argument("--xml", required=True, help="Path to Rekordbox XML export")
    ap.add_argument("--playlist", required=True, help="Playlist name in the XML")
    ap.add_argument("--out", default="beatport_enriched.csv", help="Output CSV base name (timestamp auto-appended)")

    ap.add_argument("--fast", action="store_true", help="Faster defaults (safe)")
    ap.add_argument("--turbo", action="store_true", help="Maximum speed (be gentle)")
    ap.add_argument("--exhaustive", action="store_true",
                    help="Explode query variants (grams×artists), raise DDG per-query cap, extend time budget")

    ap.add_argument("--verbose", action="store_true", help="Verbose logs")
    ap.add_argument("--trace", action="store_true", help="Very detailed per-candidate logs")

    ap.add_argument("--seed", type=int, default=0, help="Random seed for determinism (default 0)")

    ap.add_argument("--all-queries", action="store_true",
                help="Run EVERY query variation: disable time budget, wait for all candidates, allow tri-gram crosses")
    ap.add_argument("--myargs", action="store_true",
                    help="Apply your custom settings bundle (edit the dict in code below)")
    ap.add_argument("--auto-research", action="store_true",
                    help="Automatically re-search unmatched tracks without prompting")

    args = ap.parse_args()

    if args.fast:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 8,
            "TRACK_WORKERS": 4,
            "PER_TRACK_TIME_BUDGET_SEC": 15,
            "ENABLE_CACHE": True,
        })
    if args.turbo:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 12,
            "TRACK_WORKERS": 8,
            "PER_TRACK_TIME_BUDGET_SEC": 10,
            "ENABLE_CACHE": True,
        })
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

    # Custom bundle preset (edit values here to taste)
    if args.myargs:
        SETTINGS.update({
            # ---- Core speed/concurrency ----
            "ENABLE_CACHE": True,
            "CANDIDATE_WORKERS": 15,  # Increased from 10 for faster candidate fetching
            "TRACK_WORKERS": 12,  # Increased from 10 for more parallel track processing
            "PER_TRACK_TIME_BUDGET_SEC": 45,  # Increased to allow priority queries to complete

            # ---- Similarity weights ----
            "TITLE_WEIGHT": 0.55,
            "ARTIST_WEIGHT": 0.45,

            # ---- Early exit tuning ----
            "EARLY_EXIT_SCORE": 90,  # Lowered from 95 to exit earlier
            "EARLY_EXIT_MIN_QUERIES": 8,  # Increased to allow more remix queries before exit
            "EARLY_EXIT_REQUIRE_MIX_OK": False,  # Disabled for faster exits
            "EARLY_EXIT_FAMILY_SCORE": 88,  # Lowered from 93 for faster exits
            "EARLY_EXIT_FAMILY_AFTER": 5,  # Reduced from 8
            "EARLY_EXIT_MIN_QUERIES_REMIX": 12,  # Increased to ensure multi-artist+remixer queries complete (they're in first 10-12 queries)
            "REMIX_MAX_QUERIES": 30,  # Increased to allow more remix-specific queries

            # ---- Adaptive max_results per query shape ----
            "ADAPTIVE_MAX_RESULTS": True,
            "MR_LOW": 10,  # Reduced from 15
            "MR_MED": 25,  # Reduced from 40
            "MR_HIGH": 50,  # Reduced from 100

            # ---- Query-generation shape preferences ----
            "FULL_TITLE_WITH_ARTIST_ONLY": True,
            "LINEAR_PREFIX_ONLY": True,
            "REVERSE_ORDER_QUERIES": False,
            "PRIORITY_REVERSE_STAGE": True,
            "REVERSE_REMIX_HINTS": True,
            "QUOTED_TITLE_VARIANT": False,

            # ---- N-gram / combos controls (reduced for speed) ----
            "TITLE_GRAM_MAX": 2,  # Reduced from 3 to generate fewer queries
            "CROSS_TITLE_GRAMS_WITH_ARTISTS": False,  # Disabled for speed
            "CROSS_SMALL_ONLY": True,
            "RUN_EXHAUSTIVE_COMBOS": False,
            "TITLE_COMBO_MIN_LEN": 2,
            "TITLE_COMBO_MAX_LEN": 4,  # Reduced from 6
            "INCLUDE_PERMUTATIONS": False,
            "PERMUTATION_K_CAP": 3,  # Reduced from 5
            "MAX_COMBO_QUERIES": 15,  # Added cap instead of None

            # ---- Safeguards / misc ----
            "MAX_SEARCH_RESULTS": 50,  # Increased for better remix discovery
            "PER_QUERY_CANDIDATE_CAP": None,  # Removed cap to find tracks that appear later in search results
            "MAX_QUERIES_PER_TRACK": 40,  # Increased slightly to allow more remix queries
            "USE_BROWSER_AUTOMATION": True,  # Enable browser automation for remix queries that direct search misses
            
            # ---- Search strategy ----
            "USE_DIRECT_SEARCH_FOR_REMIXES": True,  # Use direct Beatport search for remix queries
            "USE_BROWSER_AUTOMATION": True,  # Enable browser automation for remix queries (finds JS-rendered tracks)
            "MIN_ACCEPT_SCORE": 70,  # Lowered from 85 to catch more valid matches
            "CONNECT_TIMEOUT": 3,  # Reduced from 5 for faster failures
            "READ_TIMEOUT": 8,  # Reduced from 10
        })

    SETTINGS["VERBOSE"] = bool(args.verbose)
    SETTINGS["TRACE"] = bool(args.trace)
    SETTINGS["SEED"] = int(args.seed)

    startup_banner(sys.argv[0], args)
    run(args.xml, args.playlist, args.out, auto_research=args.auto_research)


if __name__ == "__main__":
    main()

