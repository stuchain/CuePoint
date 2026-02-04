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


def _safe_print_utf8(text: str) -> None:
    """Print UTF-8 text safely on Windows (avoids cp1252 encoding errors)."""
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    try:
        print(text)
    except UnicodeEncodeError:
        sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        sys.stdout.buffer.write(b"\n")


def _run_migrate(args) -> int:
    """Run schema migration (Step 12: Future-Proofing)."""
    from cuepoint.services.schema_migration import run_migrate

    directory = args.directory
    result = run_migrate(
        from_version=args.from_version,
        to_version=args.to_version,
        file_path=args.file,
        directory=directory,
    )
    if result.errors:
        for err in result.errors:
            print(f"Error: {err}")
        return 1
    print(f"Migrated: {result.files_migrated} file(s)")
    return 0


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
    # Step 15: Maintenance report - handle before full bootstrap
    if len(sys.argv) > 1 and sys.argv[1] == "--maintenance-report":
        import subprocess
        src_path = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(src_path)
        script = os.path.join(project_root, "scripts", "maintenance_report.py")
        # Pass through remaining args (e.g. --skip-audit, --json)
        script_args = [sys.executable, script] + sys.argv[2:]
        result = subprocess.run(
            script_args,
            cwd=project_root,
        )
        sys.exit(result.returncode)

    # Step 12: Migrate subcommand - handle before full bootstrap
    if len(sys.argv) > 1 and sys.argv[1] == "migrate":
        migrate_parser = argparse.ArgumentParser(prog="cuepoint migrate")
        migrate_parser.add_argument("--from", dest="from_version", type=int, required=True, metavar="V")
        migrate_parser.add_argument("--to", dest="to_version", type=int, required=True, metavar="V")
        migrate_parser.add_argument("--file", default=None, help="CSV file to migrate")
        migrate_parser.add_argument("--directory", "--output-dir", dest="directory", default=None, help="Directory with CSVs")
        migrate_args = migrate_parser.parse_args(sys.argv[2:])
        sys.exit(_run_migrate(migrate_args))

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
    
    # Required arguments (optional when --verify-outputs)
    ap.add_argument("--xml", required=False, help="Path to Rekordbox XML export file")
    ap.add_argument("--playlist", required=False, help="Playlist name in the XML file")
    ap.add_argument("--out", default="beatport_enriched.csv", help="Output CSV base name (timestamp auto-appended)")
    ap.add_argument("--output-dir", default=None, help="Output directory path")
    ap.add_argument("--run-summary-json", default=None, help="Write run summary JSON to this path")
    ap.add_argument("--preflight-report", default=None, help="Write preflight report JSON to this path")

    # Performance presets - these optimize for speed vs accuracy tradeoffs
    ap.add_argument("--fast", action="store_true", help="Faster defaults (safe) - reduces search results and time budgets")
    ap.add_argument("--turbo", action="store_true", help="Maximum speed (be gentle) - aggressive speed optimizations")
    ap.add_argument("--exhaustive", action="store_true",
                    help="Explode query variants (grams×artists), raise DDG per-query cap, extend time budget")

    # Logging options (Design 7.148)
    ap.add_argument("--verbose", action="store_true", help="Verbose logs - shows detailed progress information")
    ap.add_argument("--trace", action="store_true", help="Very detailed per-candidate logs - shows every candidate evaluated")
    ap.add_argument("--debug", action="store_true", help="Debug mode: extra detail for support (sets verbose + trace)")

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
    ap.add_argument("--no-preflight", action="store_true", help="Skip preflight validation (advanced)")
    ap.add_argument("--preflight-only", action="store_true", help="Run preflight only and exit")
    ap.add_argument("--dry-run", action="store_true", help="Alias for --preflight-only")
    # Design 6.63, 6.142: Performance CLI flags
    ap.add_argument("--max-workers", type=int, default=None, metavar="N",
                    help="Max parallel track workers (overrides performance.max_workers)")
    ap.add_argument("--max-queries-per-track", type=int, default=None, metavar="N",
                    help="Max queries per track (overrides performance.max_queries_per_track)")
    ap.add_argument("--benchmark", action="store_true",
                    help="Benchmark mode: collect and save performance metrics to output dir")
    # Design 9: Data integrity - verify outputs
    ap.add_argument("--verify-outputs", action="store_true",
                    help="Verify output files (schema, checksums) in output directory; requires --output-dir")
    ap.add_argument("--no-checksums", action="store_true",
                    help="Skip writing checksums when exporting (use with normal run)")
    ap.add_argument("--no-audit-log", action="store_true",
                    help="Skip writing audit log when exporting (use with normal run)")
    ap.add_argument("--review-only", action="store_true",
                    help="Export only low-confidence tracks (review mode) - no main CSV")

    # Design 5.47, 5.90, 5.153: Resume and reliability
    ap.add_argument("--resume", action="store_true", help="Resume from last checkpoint if available")
    # Design 6: Incremental processing - only process new tracks
    ap.add_argument("--incremental", type=str, default=None, metavar="CSV_PATH",
                    help="Incremental mode: path to previous run's main CSV; only process tracks not already in it")
    ap.add_argument("--no-resume", action="store_true", help="Do not resume; start fresh (ignore checkpoint)")
    # Step 12: Provider selection (Future-Proofing)
    ap.add_argument("--provider", default=None, help="Search provider (e.g., beatport). Default: beatport")
    # Step 11: Legal/policy flags
    ap.add_argument("--show-privacy", action="store_true", help="Print privacy notice and exit")
    ap.add_argument("--show-terms", action="store_true", help="Print terms of use and exit")
    # Step 14: Telemetry opt-in/out
    ap.add_argument("--telemetry-enable", action="store_true", help="Enable opt-in telemetry")
    ap.add_argument("--telemetry-disable", action="store_true", help="Disable telemetry and delete local data")
    # Design 13.182: Support bundle export (Step 13)
    ap.add_argument(
        "--export-support-bundle",
        dest="export_support_bundle",
        action="store_true",
        help="Generate support bundle (diagnostics, logs, config) and exit",
    )
    # Step 15: Maintenance report
    ap.add_argument(
        "--maintenance-report",
        action="store_true",
        help="Generate maintenance report (dependencies, audit status) and exit",
    )
    ap.add_argument("--checkpoint-every", type=int, default=None, metavar="N",
                    help="Save checkpoint every N tracks (default: from config)")
    ap.add_argument("--max-retries", type=int, default=None, metavar="N",
                    help="Max network retries per request (default: from config)")

    args = ap.parse_args()
    if args.dry_run:
        args.preflight_only = True

    # Design 13.182: --export-support-bundle - generate support bundle and exit
    if getattr(args, "export_support_bundle", False):
        from pathlib import Path

        from cuepoint.utils.paths import AppPaths
        from cuepoint.utils.support_bundle import SupportBundleGenerator

        output_dir = AppPaths.exports_dir()
        output_dir.mkdir(parents=True, exist_ok=True)
        try:
            bundle_path = SupportBundleGenerator.generate_bundle(
                output_dir, include_logs=True, include_config=True, sanitize=True
            )
            _safe_print_utf8(f"Support bundle created: {bundle_path}")
            _safe_print_utf8(f"Location: {bundle_path.parent}")
            return
        except Exception as e:
            print_error(f"Failed to create support bundle: {e}", exit_code=1)

    # Step 11: Legal/policy CLI flags - show and exit
    if args.show_privacy:
        from cuepoint.utils.policy_docs import find_privacy_notice, load_policy_text
        path = find_privacy_notice()
        text = load_policy_text(path, "Privacy notice could not be loaded.")
        _safe_print_utf8(text)
        return
    if args.show_terms:
        from cuepoint.utils.policy_docs import find_terms_of_use, load_policy_text
        path = find_terms_of_use()
        text = load_policy_text(path, "Terms of use could not be loaded.")
        _safe_print_utf8(text)
        return

    # Step 14: Telemetry-only mode (enable/disable without processing)
    telemetry_enable = getattr(args, "telemetry_enable", False)
    telemetry_disable = getattr(args, "telemetry_disable", False)
    if (telemetry_enable or telemetry_disable) and (not args.xml or not args.playlist):
        if telemetry_disable:
            config_service.set("telemetry.enabled", False)
            try:
                from cuepoint.services.interfaces import ITelemetryService
                if container.is_registered(ITelemetryService):
                    telemetry = container.resolve(ITelemetryService)
                    telemetry.delete_local_data()
            except Exception:
                pass
            config_service.save()
            _safe_print_utf8("Telemetry disabled. Local telemetry data deleted.")
            return
        if telemetry_enable:
            config_service.set("telemetry.enabled", True)
            config_service.save()
            _safe_print_utf8("Telemetry enabled. Anonymous usage data will be collected when you run processing.")
            return

    # Design 9: Verify outputs mode - run verification and exit (no xml/playlist needed)
    if args.verify_outputs:
        from cuepoint.services.integrity_service import verify_outputs
        output_dir = args.output_dir or "output"
        output_dir = os.path.abspath(output_dir)
        if not os.path.isdir(output_dir):
            print_error(f"Output directory not found: {output_dir}\nUse --output-dir to specify output directory.")
        else:
            ok, errors = verify_outputs(output_dir, checksums=True, schema=True)
            if ok:
                print("Verify outputs: OK")
                print("Checksums: OK")
                print("Schema: OK")
                print("Re-import: OK")
            else:
                for err in errors:
                    print(f"Error: {err}")
                sys.exit(1)
        return

    # Require xml and playlist for normal processing
    if not args.xml or not args.playlist:
        ap.error("--xml and --playlist are required for processing (or use --verify-outputs to verify existing outputs)")

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

    # Apply logging and determinism settings from command line (Design 7.148)
    if args.debug:
        config_service.set("VERBOSE", True)
        config_service.set("TRACE", True)
    else:
        config_service.set("VERBOSE", bool(args.verbose))
        config_service.set("TRACE", bool(args.trace))
    config_service.set("SEED", int(args.seed))

    # Design 9: Integrity options
    if args.no_checksums:
        config_service.set("integrity.checksums", False)
    if args.no_audit_log:
        config_service.set("integrity.audit_log", False)
    if args.review_only:
        config_service.set("integrity.review_only", True)

    # Step 12: Apply provider selection
    if args.provider:
        config_service.set("providers.active", args.provider)

    # Step 14: Apply telemetry flags when processing
    if getattr(args, "telemetry_enable", False):
        config_service.set("telemetry.enabled", True)
        config_service.save()
    if getattr(args, "telemetry_disable", False):
        config_service.set("telemetry.enabled", False)
        config_service.save()
        try:
            from cuepoint.services.interfaces import ITelemetryService
            if container.is_registered(ITelemetryService):
                telemetry = container.resolve(ITelemetryService)
                telemetry.delete_local_data()
        except Exception:
            pass

    # Design 7.53: Set run ID for observability
    from cuepoint.utils.run_context import set_run_id
    run_id = set_run_id()

    # Step 14: Track app_start (CLI processing)
    try:
        from cuepoint.utils.telemetry_helper import get_telemetry
        get_telemetry().track("app_start", {"channel": "cli"})
    except Exception:
        pass

    # Display startup banner with configuration fingerprint
    startup_banner(sys.argv[0], args)

    # Design 7.53, 7.54: Print run ID and log path at start
    log_path = None
    try:
        log_svc = container.resolve(ILoggingService)
        if hasattr(log_svc, "get_log_path"):
            log_path = log_svc.get_log_path()
    except Exception:
        pass
    print(f"Run ID: {run_id}")

    preflight_enabled_value = config_service.get("product.preflight_enabled", True)
    if preflight_enabled_value is None:
        preflight_enabled_value = True
    preflight_enabled = not args.no_preflight and bool(preflight_enabled_value)
    run_summary_json_path = args.run_summary_json
    run_summary_write_value = config_service.get("run_summary.write_json", False)
    if run_summary_write_value is None:
        run_summary_write_value = False
    if not run_summary_json_path and bool(run_summary_write_value):
        run_summary_json_path = config_service.get("run_summary.json_path", "") or None

    # Design 5.153: Apply reliability CLI overrides
    if args.checkpoint_every is not None and args.checkpoint_every > 0:
        config_service.set("reliability.checkpoint_every", args.checkpoint_every)
    if args.max_retries is not None and args.max_retries >= 0:
        config_service.set("reliability.max_retries", args.max_retries)
        config_service.set("beatport.max_retries", args.max_retries)

    # Design 6.63: Apply performance CLI overrides
    if args.max_workers is not None and args.max_workers >= 1:
        config_service.set("performance.max_workers", args.max_workers)
    if args.max_queries_per_track is not None and args.max_queries_per_track >= 1:
        config_service.set("performance.max_queries_per_track", args.max_queries_per_track)
    
    # Execute the main processing pipeline using CLIProcessor
    # This will:
    # 1. Parse the Rekordbox XML file
    # 2. Extract tracks from the specified playlist
    # 3. For each track, generate search queries and find best Beatport matches
    # 4. Write results to CSV files in the output/ directory
    # 5. Optionally re-search unmatched tracks if --auto-research is enabled
    # Design 5.47: --resume wins over --no-resume when both given
    resume = args.resume and not args.no_resume
    try:
        cli_processor.process_playlist(
            xml_path=args.xml,
            playlist_name=args.playlist,
            out_csv_base=args.out,
            auto_research=args.auto_research,
            output_dir=args.output_dir,
            preflight_only=args.preflight_only,
            preflight_report_path=args.preflight_report,
            run_summary_json_path=run_summary_json_path,
            preflight_enabled=preflight_enabled,
            resume=resume,
            incremental_previous_csv=args.incremental,
            benchmark_mode=args.benchmark,
        )
    finally:
        # Design 7.53, 7.54: Print log path at end
        if log_path:
            print(f"Logs: {log_path}")


if __name__ == "__main__":
    main()
