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
3. Use CLIProcessor (Phase 5 architecture) to process all tracks in the playlist
4. Output CSV files are generated in the output/ directory

Example usage:
    python main.py --xml collection.xml --playlist "My Playlist" --myargs --auto-research
"""

import argparse
import os
import sys

# Add src to path for imports
if __name__ == "__main__":
    src_path = os.path.dirname(os.path.abspath(__file__))
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import (
    IConfigService,
    IExportService,
    ILoggingService,
    IProcessorService,
)
from cuepoint.utils.di_container import get_container
from cuepoint.utils.errors import (
    error_config_invalid,
    error_file_not_found,
    error_missing_dependency,
    print_error,
)
from cuepoint.utils.utils import startup_banner


def main():
    """
    Main CLI entry point
    
    This function:
    1. Bootstraps services (dependency injection setup)
    2. Sets up argument parser with all available options
    3. Applies configuration presets based on flags (--fast, --turbo, --myargs, etc.)
    4. Shows startup banner with configuration fingerprint
    5. Uses CLIProcessor (Phase 5 architecture) to execute the main processing logic
    """
    # Bootstrap services (dependency injection setup)
    bootstrap_services()
    
    # Get services from DI container
    container = get_container()
    processor_service = container.resolve(IProcessorService)  # type: ignore
    export_service = container.resolve(IExportService)  # type: ignore
    config_service = container.resolve(IConfigService)  # type: ignore
    logging_service = container.resolve(ILoggingService)  # type: ignore
    
    # Create CLI processor
    cli_processor = CLIProcessor(
        processor_service=processor_service,
        export_service=export_service,
        config_service=config_service,
        logging_service=logging_service,
    )
    
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

    # Configuration file
    ap.add_argument("--config", type=str, default=None,
                    help="Path to YAML configuration file - settings in file are merged with defaults, CLI flags override file settings")

    # Advanced query options
    ap.add_argument("--all-queries", action="store_true",
                help="Run EVERY query variation: disable time budget, wait for all candidates, allow tri-gram crosses")
    ap.add_argument("--myargs", action="store_true",
                    help="Ultra-aggressive preset: goes beyond defaults for maximum match discovery (slower but finds more tracks)")
    ap.add_argument("--auto-research", action="store_true",
                    help="Automatically re-search unmatched tracks without prompting - useful for batch processing")

    args = ap.parse_args()

    # Load configuration from YAML file if specified
    # YAML settings are loaded first, then CLI presets override them
    if args.config:
        try:
            # Use legacy load_config_from_yaml for backward compatibility
            # Then update ConfigService with those values
            from cuepoint.models.config import load_config_from_yaml
            
            yaml_settings = load_config_from_yaml(args.config)
            # Update ConfigService with YAML settings
            for key, value in yaml_settings.items():
                config_service.set(key, value)
            print(f"Loaded configuration from: {args.config}")
        except FileNotFoundError as e:
            print_error(error_file_not_found(args.config, "Configuration", "Check the --config file path"))
        except ImportError as e:
            if "yaml" in str(e).lower() or "pyyaml" in str(e).lower():
                print_error(error_missing_dependency("pyyaml", "pip install pyyaml>=6.0"))
            else:
                print_error(error_missing_dependency(str(e).split()[-1] if e.args else "unknown"))
        except ValueError as e:
            # Extract key information from ValueError if possible
            error_msg = str(e)
            invalid_key = None
            expected_type = None
            actual_value = None
            
            # Try to parse ValueError message for key details
            if "Setting" in error_msg and "expects" in error_msg:
                parts = error_msg.split("Setting ")[1].split(" expects ")
                if len(parts) == 2:
                    invalid_key = parts[0].strip()
                    type_parts = parts[1].split(", got ")
                    if len(type_parts) == 2:
                        expected_type = type_parts[0].strip()
                        value_parts = type_parts[1].split(" (")
                        if len(value_parts) >= 1:
                            actual_value = value_parts[0].strip() if value_parts else None
            
            print_error(error_config_invalid(args.config, e, invalid_key, expected_type, actual_value))
        except Exception as e:
            print_error(error_config_invalid(args.config, e))

    # Apply --fast preset: optimizes for speed with reasonable accuracy
    # - Fewer search results per query (12 vs 50)
    # - More parallel workers for faster processing
    # - Shorter time budget per track (15s vs 25s)
    if args.fast:
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 8)
        config_service.set("TRACK_WORKERS", 4)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 15)
        config_service.set("ENABLE_CACHE", True)
    
    # Apply --turbo preset: maximum speed with minimal accuracy tradeoffs
    # - Very few search results (12)
    # - Maximum parallelism (12 candidate workers, 8 track workers)
    # - Very short time budget (10s per track)
    if args.turbo:
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 12)
        config_service.set("TRACK_WORKERS", 8)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 10)
        config_service.set("ENABLE_CACHE", True)
    
    # Apply --exhaustive preset: maximum accuracy with more queries and time
    # - Many search results (100)
    # - High parallelism (16 candidate workers, 8+ track workers)
    # - Long time budget (100s+ per track)
    # - Enables cross-title-grams with artists for more query variants
    if args.exhaustive:
        config_service.set("MAX_SEARCH_RESULTS", 100)
        config_service.set("CANDIDATE_WORKERS", 16)
        current_track_workers = config_service.get("TRACK_WORKERS", 8)
        config_service.set("TRACK_WORKERS", max(current_track_workers, 8))
        current_time_budget = config_service.get("PER_TRACK_TIME_BUDGET_SEC", 100)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", max(current_time_budget, 100))
        config_service.set("ENABLE_CACHE", True)
        config_service.set("CROSS_TITLE_GRAMS_WITH_ARTISTS", True)
        config_service.set("CROSS_SMALL_ONLY", True)
        config_service.set("REVERSE_ORDER_QUERIES", False)
    
    # Apply --all-queries preset: run every possible query variation
    # - No time budget limit (None)
    # - All query generation features enabled
    # - Maximum workers for parallel processing
    if args.all_queries:
        config_service.set("RUN_ALL_QUERIES", True)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", None)
        config_service.set("CROSS_SMALL_ONLY", False)
        current_title_gram_max = config_service.get("TITLE_GRAM_MAX", 3)
        config_service.set("TITLE_GRAM_MAX", max(current_title_gram_max, 3))
        current_max_search = config_service.get("MAX_SEARCH_RESULTS", 20)
        config_service.set("MAX_SEARCH_RESULTS", max(current_max_search, 20))
        current_candidate_workers = config_service.get("CANDIDATE_WORKERS", 16)
        config_service.set("CANDIDATE_WORKERS", max(current_candidate_workers, 16))
        current_track_workers = config_service.get("TRACK_WORKERS", 10)
        config_service.set("TRACK_WORKERS", max(current_track_workers, 10))
        config_service.set("ENABLE_CACHE", True)

    # Ultra-aggressive preset: goes beyond defaults for maximum match discovery
    # Note: Default settings now match what --myargs used to apply
    # This preset enables even more aggressive settings for users who want maximum coverage
    if args.myargs:
        # ---- Core speed/concurrency (ultra) ----
        config_service.set("CANDIDATE_WORKERS", 20)
        config_service.set("TRACK_WORKERS", 16)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 60)

        # ---- Early exit tuning (more lenient) ----
        config_service.set("EARLY_EXIT_SCORE", 88)
        config_service.set("EARLY_EXIT_MIN_QUERIES", 6)
        config_service.set("EARLY_EXIT_FAMILY_SCORE", 85)
        config_service.set("EARLY_EXIT_FAMILY_AFTER", 3)
        config_service.set("REMIX_MAX_QUERIES", 40)

        # ---- Query generation (more exhaustive) ----
        config_service.set("TITLE_GRAM_MAX", 3)
        config_service.set("CROSS_TITLE_GRAMS_WITH_ARTISTS", True)
        config_service.set("MAX_QUERIES_PER_TRACK", 60)
        config_service.set("TITLE_COMBO_MAX_LEN", 5)
        config_service.set("MAX_COMBO_QUERIES", 25)

        # ---- Search depth (ultra) ----
        config_service.set("MAX_SEARCH_RESULTS", 75)
        config_service.set("MR_LOW", 15)
        config_service.set("MR_MED", 35)
        config_service.set("MR_HIGH", 75)

        # ---- Scoring (more lenient) ----
        config_service.set("MIN_ACCEPT_SCORE", 65)

    # Apply logging and determinism settings from command line
    config_service.set("VERBOSE", bool(args.verbose))
    config_service.set("TRACE", bool(args.trace))
    config_service.set("SEED", int(args.seed))

    # Display startup banner with configuration fingerprint
    startup_banner(sys.argv[0], args)
    
    # Execute the main processing pipeline using CLIProcessor
    # This will:
    # 1. Parse the Rekordbox XML file
    # 2. Extract tracks from the specified playlist
    # 3. For each track, generate search queries and find best Beatport matches
    # 4. Write results to CSV files in the output/ directory
    # 5. Optionally re-search unmatched tracks if --auto-research is enabled
    cli_processor.process_playlist(
        xml_path=args.xml,
        playlist_name=args.playlist,
        out_csv_base=args.out,
        auto_research=args.auto_research,
    )


if __name__ == "__main__":
    main()
