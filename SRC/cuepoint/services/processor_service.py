#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Processor Service Implementation

Service for processing tracks and playlists.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from cuepoint.core.mix_parser import _extract_generic_parenthetical_phrases, _parse_mix_flags
from cuepoint.core.query_generator import make_search_queries
from cuepoint.core.text_processing import sanitize_title_for_search
from cuepoint.data.rekordbox import extract_artists_from_title, parse_rekordbox
from cuepoint.models.compat import track_from_rbtrack
from cuepoint.models.config import SETTINGS
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.interfaces import (
    IBeatportService,
    IConfigService,
    ILoggingService,
    IMatcherService,
    IProcessorService,
)
from cuepoint.ui.gui_interface import (
    ErrorType,
    ProcessingController,
    ProcessingError,
    ProgressCallback,
    ProgressInfo,
)


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
        self, idx: int, track: Track, settings: Optional[Dict[str, Any]] = None
    ) -> TrackResult:
        """Process a single track and return match result.

        This method:
        1. Extracts and sanitizes track title and artists
        2. Generates search queries
        3. Executes matching via MatcherService
        4. Builds TrackResult with match information

        Args:
            idx: Track index (1-based) for logging.
            track: Track object containing track information.
            settings: Optional settings dictionary to override defaults.

        Returns:
            TrackResult object containing:
            - Original track information
            - Best match (if found) with Beatport data
            - Match scores and confidence
            - All candidates and queries executed

        Example:
            >>> track = Track(title="Never Sleep Again", artist="Tim Green")
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
        # Note: Track uses 'artist' (singular), RBTrack used 'artists' (plural)
        original_artists = track.artist or ""
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

            # Fetch full track data if needed (for future use)
            _ = self.beatport_service.fetch_track_data(best.url)

            # Build candidates_data list (for backward compatibility with export and UI)
            # This format matches what CandidateDialog and export functions expect
            candidates_data = []
            for cand in all_candidates:
                candidates_data.append(
                    {
                        "candidate_url": cand.url,
                        "candidate_title": cand.title,
                        "candidate_artists": cand.artists,
                        "candidate_key": cand.key or "",
                        "candidate_key_camelot": cand.key or "",  # TODO: convert to Camelot
                        "candidate_year": str(cand.release_year) if cand.release_year else "",
                        "candidate_bpm": cand.bpm or "",
                        "candidate_label": cand.label or "",
                        "candidate_genres": cand.genre or "",  # Note: new model uses "genre"
                        "candidate_release": cand.release_name or "",
                        "candidate_release_date": cand.release_date or "",
                        "final_score": cand.score,
                        "match_score": cand.score,
                        "title_sim": cand.title_sim,
                        "artist_sim": cand.artist_sim,
                        "base_score": cand.base_score,
                        "bonus_year": cand.bonus_year,
                        "bonus_key": cand.bonus_key,
                        "url": cand.url,  # Also include direct fields for compatibility
                        "title": cand.title,
                        "artists": cand.artists,
                        "score": cand.score,
                    }
                )

            # Build queries_data list (for backward compatibility with export)
            queries_data = []
            for q_idx, q_text, cand_count, elapsed_ms in queries_audit:
                queries_data.append(
                    {
                        "index": q_idx,
                        "query": q_text,
                        "candidates": cand_count,
                        "elapsed_ms": elapsed_ms,
                    }
                )

            # Convert key to Camelot notation
            from cuepoint.core.matcher import _camelot_key
            camelot_key = _camelot_key(best.key) if best.key else None
            
            return TrackResult(
                playlist_index=idx,
                title=track.title,
                artist=original_artists or artists_for_scoring,
                matched=True,
                best_match=best,  # Set best_match to the BeatportCandidate object
                candidates=all_candidates,  # List of BeatportCandidate objects
                beatport_url=best.url,
                beatport_title=best.title,
                beatport_artists=best.artists,
                beatport_key=best.key,
                beatport_key_camelot=camelot_key or "",
                beatport_year=str(best.release_year) if best.release_year else None,
                beatport_bpm=best.bpm,
                beatport_label=best.label,
                beatport_genres=best.genre,  # Note: new model uses "genre" instead of "genres"
                beatport_release=best.release_name,
                beatport_release_date=best.release_date,
                match_score=best.score,
                title_sim=float(best.title_sim),
                artist_sim=float(best.artist_sim),
                confidence="high" if best.score >= 95 else "med" if best.score >= 85 else "low",
                search_query_index=str(best.query_index),
                search_stop_query_index=str(last_qidx),
                candidate_index=str(best.candidate_index),
                processing_time=dur / 1000.0,  # Convert ms to seconds
                candidates_data=candidates_data,  # Dict format for export compatibility
                queries_data=queries_data,  # Dict format for export compatibility
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
        self, tracks: List[Track], settings: Optional[Dict[str, Any]] = None
    ) -> List[TrackResult]:
        """Process a playlist of tracks.

        Processes each track in sequence and returns a list of results.
        Logs progress for each track.

        Args:
            tracks: List of Track objects to process.
            settings: Optional settings dictionary to override defaults.

        Returns:
            List of TrackResult objects, one per input track.

        Example:
            >>> tracks = [Track(...), Track(...)]
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

    def process_playlist_from_xml(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        controller: Optional[ProcessingController] = None,
        auto_research: bool = False,
    ) -> List[TrackResult]:
        """Process playlist from XML file with GUI-friendly interface.

        This method processes all tracks in a playlist from a Rekordbox XML file
        and returns structured results. It supports progress callbacks, cancellation,
        and auto-research of unmatched tracks.

        Args:
            xml_path: Path to Rekordbox XML export file.
            playlist_name: Name of playlist to process (must exist in XML).
            settings: Optional settings override dictionary.
            progress_callback: Optional callback for progress updates.
            controller: Optional controller for cancellation support.
            auto_research: If True, automatically re-search unmatched tracks with
                enhanced settings.

        Returns:
            List of TrackResult objects (one per track).

        Raises:
            ProcessingError: If XML file not found, playlist not found, or parsing
                errors occur.
        """
        # Track processing start time
        processing_start_time = time.perf_counter()

        # Use provided settings or fall back to config service
        effective_settings = (
            settings
            if settings is not None
            else {key: self.config_service.get(key, SETTINGS.get(key)) for key in SETTINGS.keys()}
        )

        # Parse Rekordbox XML file to extract playlists with tracks
        try:
            playlists = parse_rekordbox(xml_path)
        except FileNotFoundError:
            raise ProcessingError(
                error_type=ErrorType.FILE_NOT_FOUND,
                message=f"XML file not found: {xml_path}",
                details="The specified Rekordbox XML export file does not exist.",
                suggestions=[
                    "Check that the file path is correct",
                    "Verify the file exists and is readable",
                    "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)",
                ],
                recoverable=False,
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
                        "Try exporting a fresh XML file from Rekordbox",
                    ],
                    recoverable=False,
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
                        "Try exporting a fresh XML file from Rekordbox",
                    ],
                    recoverable=False,
                )

        # Validate that requested playlist exists in the XML
        if playlist_name not in playlists:
            available_playlists = sorted(playlists.keys())
            raise ProcessingError(
                error_type=ErrorType.PLAYLIST_NOT_FOUND,
                message=f"Playlist '{playlist_name}' not found in XML file",
                details=(
                    f"Available playlists: {', '.join(available_playlists[:10])}"
                    f"{'...' if len(available_playlists) > 10 else ''}"
                ),
                suggestions=[
                    "Check the playlist name spelling (case-sensitive)",
                    f"Verify '{playlist_name}' exists in your Rekordbox library",
                    "Export a fresh XML file from Rekordbox",
                    "Choose from available playlists listed above",
                ],
                recoverable=True,
            )

        # Get the requested playlist (already contains Track objects)
        playlist = playlists[playlist_name]
        tracks = playlist.tracks

        if not tracks:
            raise ProcessingError(
                error_type=ErrorType.VALIDATION_ERROR,
                message=f"Playlist '{playlist_name}' is empty",
                details="The playlist contains no valid tracks.",
                suggestions=[
                    "Verify the playlist has tracks in Rekordbox",
                    "Export a fresh XML file from Rekordbox",
                ],
                recoverable=True,
            )

        # Process tracks
        results: List[TrackResult] = []
        matched_count = 0
        unmatched_count = 0
        total = len(tracks)

        # Thread-safe progress tracking for parallel mode
        progress_lock = threading.Lock()

        # Determine processing mode (sequential or parallel)
        track_workers = effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))

        # Prepare inputs as list of (index, track) tuples
        inputs = [(idx, track) for idx, track in enumerate(tracks, 1)]

        if track_workers > 1:
            self.logging_service.info(f"Using parallel processing with {track_workers} workers")
            # PARALLEL MODE: Process multiple tracks simultaneously
            # Use ThreadPoolExecutor to run process_track() in parallel
            with ThreadPoolExecutor(max_workers=track_workers) as ex:
                # Submit all tasks
                future_to_args = {
                    ex.submit(
                        self.process_track,
                        idx,
                        track,
                        effective_settings,
                    ): (idx, track)
                    for idx, track in inputs
                }

                # Process completed tasks as they finish
                results_dict: Dict[int, TrackResult] = {}  # Store results by index for ordering

                for future in as_completed(future_to_args):
                    # Check for cancellation before processing each result
                    if controller and controller.is_cancelled():
                        # Cancel remaining futures that haven't started yet
                        for f in future_to_args.keys():
                            if not f.done():
                                f.cancel()
                        # Break out of the loop, but let already-running tasks finish
                        # This allows graceful shutdown
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
                                    total_tracks=total,
                                    matched_count=matched_count,
                                    unmatched_count=unmatched_count,
                                    current_track={
                                        "title": result.title,
                                        "artists": result.artist,
                                    },
                                    elapsed_time=elapsed_time,
                                )
                                try:
                                    progress_callback(progress_info)
                                except Exception:
                                    # Don't let callback errors break processing
                                    pass

                    except Exception as e:
                        # Handle errors from individual track processing
                        idx, track = future_to_args[future]
                        self.logging_service.warning(
                            f"Error processing track {idx} '{track.title}': {e}"
                        )
                        # Create error result
                        error_result = TrackResult(
                            playlist_index=idx,
                            title=track.title,
                            artist=track.artist or "",
                            matched=False,
                            error=str(e),
                        )
                        results_dict[idx] = error_result
                        with progress_lock:
                            unmatched_count += 1

                # If cancelled, wait for any remaining futures to complete or be cancelled
                if controller and controller.is_cancelled():
                    # Wait for all futures to finish (either complete or be cancelled)
                    for future in future_to_args.keys():
                        try:
                            # Wait a short time for each future to finish
                            future.result(timeout=0.1)
                        except Exception:
                            # Future was cancelled or errored, that's fine
                            pass
                    # Match sequential-mode behavior for tests/UI
                    if self.logging_service:
                        self.logging_service.info("Processing cancelled by user")
                
                # Sort results by playlist index to maintain order
                results = [results_dict[idx] for idx in sorted(results_dict.keys())]

        else:
            # SEQUENTIAL MODE: Process tracks one at a time
            self.logging_service.info(f"Using sequential processing (TRACK_WORKERS={track_workers})")
            for idx, track in inputs:
                # Check for cancellation
                if controller and controller.is_cancelled():
                    self.logging_service.info("Processing cancelled by user")
                    break

                # Process track
                result = self.process_track(idx, track, effective_settings)
                results.append(result)

                # Update statistics
                if result.matched:
                    matched_count += 1
                else:
                    unmatched_count += 1

                # Update progress callback
                if progress_callback:
                    elapsed_time = time.perf_counter() - processing_start_time
                    progress_info = ProgressInfo(
                        completed_tracks=len(results),
                        total_tracks=total,
                        matched_count=matched_count,
                        unmatched_count=unmatched_count,
                        current_track={"title": track.title, "artists": track.artist or ""},
                        elapsed_time=elapsed_time,
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
                self.logging_service.info(
                    f"Auto-research: Found {len(unmatched_results)} unmatched "
                    f"track(s), re-searching with enhanced settings..."
                )

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

                # Prepare unmatched inputs for re-search
                unmatched_inputs = []
                for result in unmatched_results:
                    idx = result.playlist_index
                    track: Optional[Track] = tracks[idx - 1] if idx <= len(tracks) else None
                    if track:
                        unmatched_inputs.append((idx, track))

                # Re-search unmatched tracks in parallel
                track_workers = enhanced_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))
                if track_workers > 1 and len(unmatched_inputs) > 1:
                    # Parallel re-search
                    self.logging_service.info(
                        f"Re-searching {len(unmatched_inputs)} unmatched tracks using parallel "
                        f"processing with {min(track_workers, len(unmatched_inputs))} workers"
                    )
                    with ThreadPoolExecutor(max_workers=min(track_workers, len(unmatched_inputs))) as ex:
                        future_to_idx = {
                            ex.submit(
                                self.process_track,
                                idx,
                                track,
                                enhanced_settings,
                            ): idx
                            for idx, track in unmatched_inputs
                        }

                        for future in as_completed(future_to_idx):
                            if controller and controller.is_cancelled():
                                for f in future_to_idx.keys():
                                    f.cancel()
                                break

                            try:
                                new_result = future.result()
                                idx = future_to_idx[future]
                                # Update the result if we found a match
                                if new_result.matched:
                                    # Replace the unmatched result with the new matched result
                                    results[idx - 1] = new_result
                                    with progress_lock:
                                        matched_count += 1
                                        unmatched_count -= 1

                                    # Update progress callback
                                    if progress_callback:
                                        elapsed_time = time.perf_counter() - processing_start_time
                                        progress_info = ProgressInfo(
                                            completed_tracks=len(results),
                                            total_tracks=total,
                                            matched_count=matched_count,
                                            unmatched_count=unmatched_count,
                                            current_track={
                                                "title": new_result.title,
                                                "artists": new_result.artist,
                                            },
                                            elapsed_time=elapsed_time,
                                        )
                                        try:
                                            progress_callback(progress_info)
                                        except Exception:
                                            # Don't let callback errors break processing
                                            pass
                            except Exception as e:
                                idx = future_to_idx[future]
                                self.logging_service.warning(
                                    f"Error in auto-research for track {idx}: {e}"
                                )
                else:
                    # Sequential re-search
                    for result in unmatched_results:
                        if controller and controller.is_cancelled():
                            break

                        idx = result.playlist_index
                        # Find the original track
                        track: Optional[Track] = tracks[idx - 1] if idx <= len(tracks) else None
                        if track:
                            new_result = self.process_track(idx, track, enhanced_settings)
                            # Update the result if we found a match
                            if new_result.matched:
                                # Replace the unmatched result with the new matched result
                                results[idx - 1] = new_result
                                matched_count += 1
                                unmatched_count -= 1

                                # Update progress callback
                                if progress_callback:
                                    elapsed_time = time.perf_counter() - processing_start_time
                                    progress_info = ProgressInfo(
                                        completed_tracks=len(results),
                                        total_tracks=total,
                                        matched_count=matched_count,
                                        unmatched_count=unmatched_count,
                                        current_track={
                                            "title": track.title,
                                            "artists": track.artist or "",
                                        },
                                        elapsed_time=elapsed_time,
                                    )
                                    try:
                                        progress_callback(progress_info)
                                    except Exception:
                                        # Don't let callback errors break processing
                                        pass

        return results
