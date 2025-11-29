#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CLI Processor - Handles CLI-specific processing concerns.

This class orchestrates the CLI workflow, including progress display,
file output, and user interaction, while delegating actual processing
to ProcessorService.
"""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from tqdm import tqdm

from cuepoint.core.text_processing import _artist_token_overlap
from cuepoint.exceptions.cuepoint_exceptions import ProcessingError
from cuepoint.ui.gui_interface import ErrorType
from cuepoint.models.result import TrackResult
from cuepoint.services.interfaces import (
    IConfigService,
    IExportService,
    ILoggingService,
    IProcessorService,
)
from cuepoint.services.output_writer import (
    write_csv_files,
    write_review_candidates_csv,
    write_review_queries_csv,
)
from cuepoint.ui.gui_interface import ProgressInfo, ProcessingController
from cuepoint.utils.errors import (
    error_file_not_found,
    error_playlist_not_found,
    print_error,
)
from cuepoint.utils.utils import with_timestamp


class CLIProcessor:
    """CLI processor that orchestrates playlist processing for command-line use."""

    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService,
        config_service: IConfigService,
        logging_service: ILoggingService,
    ) -> None:
        """Initialize CLI processor with required services.

        Args:
            processor_service: Service for processing playlists
            export_service: Service for exporting results
            config_service: Service for configuration management
            logging_service: Service for logging
        """
        self.processor_service = processor_service
        self.export_service = export_service
        self.config_service = config_service
        self.logging_service = logging_service
        self.controller = ProcessingController()
        self._pbar: Optional[tqdm] = None

    def process_playlist(
        self,
        xml_path: str,
        playlist_name: str,
        out_csv_base: str,
        auto_research: bool = False,
    ) -> None:
        """Process playlist and generate output files.

        This is the main entry point for CLI processing.
        It orchestrates the entire workflow:
        1. Creates progress callback
        2. Processes playlist via ProcessorService
        3. Writes output files via ExportService
        4. Displays summary statistics
        5. Handles unmatched tracks

        Args:
            xml_path: Path to Rekordbox XML file
            playlist_name: Name of playlist to process
            out_csv_base: Base filename for output CSV files
            auto_research: If True, auto-research unmatched tracks
        """
        # Track processing start time for summary statistics
        processing_start_time = __import__("time").perf_counter()

        # Create progress callback
        progress_callback = self._create_progress_callback()

        # Process playlist
        try:
            results = self.processor_service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name=playlist_name,
                settings=self._get_settings_dict(),
                progress_callback=progress_callback,
                controller=self.controller,
                auto_research=auto_research,
            )
        except Exception as e:
            self._handle_processing_error(e, xml_path, playlist_name)
            return
        finally:
            # Close progress bar if it exists
            if self._pbar is not None:
                self._pbar.close()
                self._pbar = None

        # Calculate processing duration
        processing_duration = __import__("time").perf_counter() - processing_start_time

        # Write output files
        output_files = self._write_output_files(results, out_csv_base)

        # Display summary
        self._display_summary(results, output_files, processing_duration)

        # Handle unmatched tracks
        if not auto_research:
            self._handle_unmatched_tracks(results)

    def _create_progress_callback(self):
        """Create CLI progress callback with tqdm integration.

        Returns:
            Callable that updates tqdm progress bar
        """
        def callback(progress_info: ProgressInfo) -> None:
            """Update progress bar with current progress information."""
            if self._pbar is None:
                # Initialize progress bar on first callback
                self._pbar = tqdm(
                    total=progress_info.total_tracks,
                    desc="Processing tracks",
                    unit="track",
                    bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]",
                )

            # Update progress bar
            self._pbar.n = progress_info.completed_tracks
            self._pbar.refresh()

            # Update postfix with current stats
            current_track = progress_info.current_track
            title = current_track.get("title", "") if current_track else ""
            if len(title) > 30:
                title = title[:30] + "..."

            self._pbar.set_postfix(
                {
                    "matched": progress_info.matched_count,
                    "unmatched": progress_info.unmatched_count,
                    "current": title or f"Track {progress_info.completed_tracks}",
                }
            )

        return callback

    def _get_settings_dict(self) -> Dict[str, Any]:
        """Get settings dictionary from ConfigService.

        Converts ConfigService settings to dict format for ProcessorService.
        This maintains compatibility with ProcessorService interface.

        Returns:
            Dictionary of settings
        """
        # Get all settings from ConfigService
        # Note: This is a simplified implementation - may need to map
        # ConfigService keys to the expected settings dict format
        settings = {}

        # Common settings keys that need to be mapped
        # This mapping may need to be adjusted based on actual ConfigService API
        setting_keys = [
            "MAX_SEARCH_RESULTS",
            "CANDIDATE_WORKERS",
            "TRACK_WORKERS",
            "PER_TRACK_TIME_BUDGET_SEC",
            "ENABLE_CACHE",
            "VERBOSE",
            "TRACE",
            "SEED",
            "EARLY_EXIT_SCORE",
            "EARLY_EXIT_MIN_QUERIES",
            "TITLE_GRAM_MAX",
            "CROSS_TITLE_GRAMS_WITH_ARTISTS",
            "MAX_QUERIES_PER_TRACK",
            "MIN_ACCEPT_SCORE",
            "RUN_ALL_QUERIES",
            "CROSS_SMALL_ONLY",
            "TITLE_COMBO_MAX_LEN",
            "MAX_COMBO_QUERIES",
            "MR_LOW",
            "MR_MED",
            "MR_HIGH",
            "REMIX_MAX_QUERIES",
            "REVERSE_ORDER_QUERIES",
        ]

        for key in setting_keys:
            value = self.config_service.get(key)
            if value is not None:
                settings[key] = value

        return settings

    def _write_output_files(
        self,
        results: List[TrackResult],
        out_csv_base: str,
    ) -> Dict[str, str]:
        """Write output files using output_writer functions.

        Args:
            results: List of TrackResult objects
            out_csv_base: Base filename for output files

        Returns:
            Dictionary mapping file type to file path
        """
        # Generate timestamped filename
        base_filename = with_timestamp(out_csv_base)

        # Ensure output directory exists
        output_dir = "output"
        os.makedirs(output_dir, exist_ok=True)

        # Write CSV files using output_writer module
        # This function writes main, candidates, queries, and review files
        output_files = write_csv_files(
            results=results,
            base_filename=base_filename,
            output_dir=output_dir,
        )

        # Get review indices for review-specific files
        review_indices = self._get_review_indices(results)

        # Write review-specific files if needed
        if review_indices:
            review_cands_path = write_review_candidates_csv(
                results, review_indices, base_filename, output_dir
            )
            review_queries_path = write_review_queries_csv(
                results, review_indices, base_filename, output_dir
            )

            if review_cands_path:
                output_files["review_candidates"] = review_cands_path
                # Count candidates: prefer candidates_data, fallback to candidates
                review_cands_count = 0
                for r in results:
                    if r.playlist_index in review_indices:
                        if r.candidates_data:
                            review_cands_count += len(r.candidates_data)
                        elif r.candidates:
                            review_cands_count += len(r.candidates)
                self.logging_service.info(
                    f"Review candidates: {review_cands_count} rows -> {review_cands_path}"
                )

            if review_queries_path:
                output_files["review_queries"] = review_queries_path
                # Count queries from queries_data
                review_queries_count = sum(
                    len(r.queries_data) if r.queries_data else 0
                    for r in results
                    if r.playlist_index in review_indices
                )
                self.logging_service.info(
                    f"Review queries: {review_queries_count} rows -> {review_queries_path}"
                )

        return output_files

    def _get_review_indices(self, results: List[TrackResult]) -> Set[int]:
        """Get indices of tracks that need review.

        A track needs review if:
        - Match score < 70
        - Artist similarity < 35 (and artist present)
        - Not matched or no beatport URL

        Args:
            results: List of TrackResult objects

        Returns:
            Set of playlist indices that need review
        """
        review_indices: Set[int] = set()

        for result in results:
            needs_review = False

            score = result.match_score or 0.0
            artist_sim = result.artist_sim or 0.0
            artists_present = bool((result.artist or "").strip())

            # Low match score
            if score < 70:
                needs_review = True

            # Low artist similarity (if artist is present)
            if artists_present and artist_sim < 35:
                beatport_artists = result.beatport_artists or ""
                if not _artist_token_overlap(result.artist or "", beatport_artists):
                    needs_review = True

            # Not matched or no URL
            if not result.matched or not (result.beatport_url or "").strip():
                needs_review = True

            if needs_review:
                review_indices.add(result.playlist_index)

        return review_indices

    def _display_summary(
        self,
        results: List[TrackResult],
        output_files: Dict[str, str],
        processing_duration: float,
    ) -> None:
        """Display processing summary statistics.

        Args:
            results: List of TrackResult objects
            output_files: Dictionary of output file paths
            processing_duration: Processing duration in seconds
        """
        total = len(results)
        matched = sum(1 for r in results if r.matched)
        unmatched = total - matched

        # Collect all candidates and queries for summary
        # Use candidates_data/queries_data if available (export format), otherwise use candidates/queries
        all_candidates: List[Any] = []
        all_queries: List[Any] = []
        for result in results:
            # For candidates: prefer candidates_data (export format), fallback to candidates (objects)
            if result.candidates_data:
                all_candidates.extend(result.candidates_data)
            elif result.candidates:
                all_candidates.extend(result.candidates)
            # For queries: use queries_data (export format)
            if result.queries_data:
                all_queries.extend(result.queries_data)

        # Display summary
        self.logging_service.info(f"\nDone. Wrote {total} rows -> {output_files.get('main', 'N/A')}")
        self.logging_service.info(f"Matched: {matched}, Unmatched: {unmatched}")
        self.logging_service.info(f"Processing time: {processing_duration:.2f} seconds")

        if output_files.get("candidates"):
            self.logging_service.info(
                f"Candidates: {len(all_candidates)} rows -> {output_files['candidates']}"
            )

        if output_files.get("queries"):
            self.logging_service.info(
                f"Queries: {len(all_queries)} rows -> {output_files['queries']}"
            )

        if output_files.get("review"):
            review_count = len(
                [r for r in results if r.playlist_index in self._get_review_indices(results)]
            )
            self.logging_service.info(
                f"Review list: {review_count} rows -> {output_files['review']}"
            )

    def _handle_unmatched_tracks(self, results: List[TrackResult]) -> None:
        """Handle unmatched tracks (display and prompt for re-search).

        Args:
            results: List of TrackResult objects
        """
        unmatched_results = [r for r in results if not r.matched]
        if not unmatched_results:
            return

        # Display list of unmatched tracks
        self.logging_service.warning(f"\n{'=' * 80}")
        self.logging_service.warning(f"Found {len(unmatched_results)} unmatched track(s):")
        self.logging_service.warning(f"{'=' * 80}")

        print(f"\n{'=' * 80}")
        print(f"Found {len(unmatched_results)} unmatched track(s):")
        print(f"{'=' * 80}")

        for result in unmatched_results:
            artists_str = result.artist or "(no artists)"
            try:
                self.logging_service.warning(
                    f"  [{result.playlist_index}] {result.title} - {artists_str}"
                )
                print(f"  [{result.playlist_index}] {result.title} - {artists_str}")
            except UnicodeEncodeError:
                # Unicode-safe fallback
                safe_title = result.title.encode("ascii", "ignore").decode("ascii")
                safe_artists = artists_str.encode("ascii", "ignore").decode("ascii")
                self.logging_service.warning(
                    f"  [{result.playlist_index}] {safe_title} - {safe_artists}"
                )
                print(f"  [{result.playlist_index}] {safe_title} - {safe_artists}")

        self.logging_service.warning(f"\n{'=' * 80}")
        print(f"\n{'=' * 80}")

        # Check if we're in an interactive environment
        if sys.stdin.isatty():
            # Interactive mode: prompt user for confirmation
            try:
                response = (
                    input("Search again for these tracks with enhanced settings? (y/n): ")
                    .strip()
                    .lower()
                )
                if response == "y":
                    self.logging_service.info("Re-searching unmatched tracks with enhanced settings...")
                    # Note: Auto-research would be handled by ProcessorService
                    # This is just for display/prompt purposes
                    print("Re-searching unmatched tracks...")
                else:
                    self.logging_service.info("Skipping re-search of unmatched tracks.")
                    print("Skipping re-search.")
            except (EOFError, KeyboardInterrupt):
                self.logging_service.info("Re-search cancelled by user.")
                print("\nRe-search cancelled.")
        else:
            # Non-interactive mode: just display the unmatched tracks
            self.logging_service.info(
                "Non-interactive mode: use --auto-research to automatically re-search unmatched tracks."
            )

    def _handle_processing_error(
        self,
        error: Exception,
        xml_path: str,
        playlist_name: str,
    ) -> None:
        """Handle processing errors with user-friendly messages.

        Args:
            error: Exception that occurred
            xml_path: Path to XML file
            playlist_name: Name of playlist
        """
        if isinstance(error, ProcessingError):
            if error.error_type == ErrorType.FILE_NOT_FOUND:
                print_error(error_file_not_found(xml_path, "XML", "Check the --xml file path"))
            elif error.error_type == ErrorType.PLAYLIST_NOT_FOUND:
                print_error(error_playlist_not_found(playlist_name, []))
            elif error.error_type == ErrorType.XML_PARSE_ERROR:
                print_error(error.message, exit_code=None)
            else:
                print_error(f"Processing error: {error.message}", exit_code=None)
        else:
            # Handle unexpected errors
            self.logging_service.error(f"Unexpected error: {error}", exc_info=error)
            error_msg = str(error)
            if error_msg.startswith("="):
                print_error(error_msg, exit_code=None)
            else:
                # Use generic error message for unexpected errors
                from cuepoint.utils.errors import error_xml_parsing

                print_error(
                    error_xml_parsing(xml_path, error, None),
                    exit_code=None,
                )

