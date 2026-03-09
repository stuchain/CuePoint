#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Processor Service Implementation

Service for processing tracks and playlists.
"""

import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.core.mix_parser import (
    _extract_generic_parenthetical_phrases,
    _parse_mix_flags,
)
from cuepoint.core.query_generator import make_search_queries
from cuepoint.core.text_processing import sanitize_title_for_search
from cuepoint.data.playlist_file import parse_m3u, read_title_artist_from_file
from cuepoint.data.rekordbox import (
    extract_artists_from_title,
    inspect_rekordbox_xml,
    is_readable,
    is_writable,
    parse_playlist_tree,
    read_playlist_index,
)
from cuepoint.models.config import SETTINGS
from cuepoint.models.preflight import PreflightIssue, PreflightResult
from cuepoint.models.result import FILE_NOT_FOUND_ERROR, TrackResult
from cuepoint.models.track import Track
from cuepoint.services.checkpoint_service import (
    CheckpointData,
    CheckpointService,
    compute_xml_hash,
)
from cuepoint.services.interfaces import (
    IBeatportService,
    IConfigService,
    ILoggingService,
    IMatcherService,
    IProcessorService,
)
from cuepoint.services.output_writer import (
    append_rows_to_main_csv,
    load_processed_track_keys,
    write_csv_files,
)
from cuepoint.ui.gui_interface import (
    ErrorType,
    ProcessingController,
    ProcessingError,
    ProgressCallback,
    ProgressInfo,
    ReliabilityState,
)
from cuepoint.utils.network import NetworkState
from cuepoint.utils.paths import AppPaths, StorageInvariants
from cuepoint.utils.run_context import set_run_id
from cuepoint.utils.run_performance_collector import (
    STAGE_PARSE_XML,
    STAGE_SEARCH_CANDIDATES,
    RunPerformanceCollector,
)


def _throttled_progress_callback(
    callback: ProgressCallback,
    throttle_ms: int = 200,
    eta_every_n: int = 50,
) -> ProgressCallback:
    """Wrap progress callback to throttle updates (Design 6.25: 5/sec = 200ms)."""

    last_call = [0.0]
    last_eta_update = [0]

    def wrapped(info: ProgressInfo) -> None:
        now = time.perf_counter()
        elapsed_since = (now - last_call[0]) * 1000
        if elapsed_since >= throttle_ms or info.completed_tracks >= info.total_tracks:
            last_call[0] = now
            if info.completed_tracks > 0 and info.total_tracks > 0:
                if info.completed_tracks - last_eta_update[0] >= eta_every_n:
                    last_eta_update[0] = info.completed_tracks
                    avg = info.elapsed_time / info.completed_tracks
                    info.eta_seconds = avg * (info.total_tracks - info.completed_tracks)
            callback(info)

    return wrapped


def _guardrail_progress_callback(
    callback: ProgressCallback,
    controller: Optional[ProcessingController],
    runtime_max_sec: float,
    memory_max_mb: float,
    logging_service: ILoggingService,
) -> ProgressCallback:
    """Wrap callback to enforce performance guardrails (Design 6.35, 6.167)."""

    def wrapped(info: ProgressInfo) -> None:
        if controller and controller.is_cancelled():
            callback(info)
            return
        if runtime_max_sec > 0 and info.elapsed_time >= runtime_max_sec:
            logging_service.warning(
                "[perf] P001: Runtime budget exceeded (%.0fs >= %.0fs). Stopping run.",
                info.elapsed_time,
                runtime_max_sec,
            )
            if controller:
                controller.cancel()
        if memory_max_mb > 0:
            try:
                import psutil

                mb = psutil.Process().memory_info().rss / (1024 * 1024)
                if mb >= memory_max_mb:
                    logging_service.warning(
                        "[perf] P002: Memory budget exceeded (%.0f MB >= %.0f MB). Stopping run.",
                        mb,
                        memory_max_mb,
                    )
                    if controller:
                        controller.cancel()
            except Exception:
                pass
        callback(info)

    return wrapped


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
            else {
                key: self.config_service.get(key, SETTINGS.get(key))
                for key in SETTINGS.keys()
            }
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

        best, all_candidates, queries_audit, last_qidx = (
            self.matcher_service.find_best_match(
                idx=idx,
                track_title=title_for_search,
                track_artists_for_scoring=artists_for_scoring,
                title_only_mode=title_only_search,
                queries=queries,
                input_mix=input_mix_flags,
                input_generic_phrases=input_generic_phrases,
            )
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
            from cuepoint.core.matcher import _camelot_key

            candidates_data = []
            for cand in all_candidates:
                candidates_data.append(
                    {
                        "playlist_index": str(idx),
                        "original_title": track.title,
                        "original_artists": original_artists or artists_for_scoring,
                        "candidate_url": cand.url,
                        "candidate_title": cand.title,
                        "candidate_artists": cand.artists,
                        "candidate_key": cand.key or "",
                        "candidate_key_camelot": _camelot_key(cand.key)
                        if cand.key
                        else "",
                        "candidate_year": str(cand.release_year)
                        if cand.release_year
                        else "",
                        "candidate_bpm": cand.bpm or "",
                        "candidate_label": cand.label or "",
                        "candidate_genres": cand.genre
                        or "",  # Note: new model uses "genre"
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
                confidence="high"
                if best.score >= 95
                else "medium"
                if best.score >= 85
                else "low",
                search_query_index=str(best.query_index),
                search_stop_query_index=str(last_qidx),
                candidate_index=str(best.candidate_index),
                processing_time=dur / 1000.0,  # Convert ms to seconds
                candidates_data=candidates_data,  # Dict format for export compatibility
                queries_data=queries_data,  # Dict format for export compatibility
                file_path=track.file_path,
            )
        else:
            # No match found
            self.logging_service.warning(
                f"[{idx}] No match found (duration: {dur:.0f} ms)"
            )

            # Build candidates_data list even when no match (for export and UI)
            # This ensures candidates are saved even when no match is found
            from cuepoint.core.matcher import _camelot_key

            candidates_data = []
            for cand in all_candidates:
                candidates_data.append(
                    {
                        "playlist_index": str(idx),
                        "original_title": track.title,
                        "original_artists": original_artists or artists_for_scoring,
                        "candidate_url": cand.url,
                        "candidate_title": cand.title,
                        "candidate_artists": cand.artists,
                        "candidate_key": cand.key or "",
                        "candidate_key_camelot": _camelot_key(cand.key)
                        if cand.key
                        else "",
                        "candidate_year": str(cand.release_year)
                        if cand.release_year
                        else "",
                        "candidate_bpm": cand.bpm or "",
                        "candidate_label": cand.label or "",
                        "candidate_genres": cand.genre or "",
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

            return TrackResult(
                playlist_index=idx,
                title=track.title,
                artist=original_artists or artists_for_scoring,
                matched=False,
                best_match=None,
                candidates=all_candidates,  # List of BeatportCandidate objects
                match_score=0.0,
                title_sim=0.0,
                artist_sim=0.0,
                confidence="low",
                search_stop_query_index=str(last_qidx),
                processing_time=dur / 1000.0,  # Convert ms to seconds
                candidates_data=candidates_data,  # Dict format for export compatibility
                queries_data=queries_data,  # Dict format for export compatibility
                file_path=track.file_path,
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

    def process_playlist_from_m3u(
        self,
        m3u_path: str,
        settings: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        controller: Optional[ProcessingController] = None,
    ) -> Tuple[List[TrackResult], Optional[str]]:
        """Process tracks from an M3U/M3U8 playlist file.

        Uses the same pipeline as collection mode: same config (including
        TRACK_WORKERS for parallel processing), same process_track() and matcher.
        Parses the playlist file, uses #EXTINF/file tags for title/artist,
        and runs matching (parallel when TRACK_WORKERS > 1). Missing paths
        are included as "file not found" results. Returns results with
        file_path set for sync.

        Args:
            m3u_path: Path to the .m3u or .m3u8 file.
            settings: Optional settings override dictionary.
            progress_callback: Optional callback for progress updates.
            controller: Optional controller for cancellation support.

        Returns:
            Tuple of (list of TrackResult, optional warning message).
        """
        from cuepoint.ui.gui_interface import ReliabilityState

        processing_start_time = time.perf_counter()
        effective_settings = (
            settings
            if settings is not None
            else {
                key: self.config_service.get(key, SETTINGS.get(key))
                for key in SETTINGS.keys()
            }
        )

        # Same progress throttle/guardrail config as process_playlist_from_xml
        throttle_ms = 200
        eta_every_n = 50
        runtime_max_minutes = 120
        memory_max_mb = 2048
        try:
            throttle_ms = int(
                self.config_service.get("performance.progress_throttle_ms", 200)
            )
            eta_every_n = int(
                self.config_service.get("performance.eta_update_every_tracks", 50)
            )
            runtime_max_minutes = int(
                self.config_service.get("performance.runtime_max_minutes", 120)
            )
        except (TypeError, ValueError):
            pass
        if progress_callback:
            if throttle_ms > 0:
                progress_callback = _throttled_progress_callback(
                    progress_callback, throttle_ms=throttle_ms, eta_every_n=eta_every_n
                )
            runtime_max_sec = runtime_max_minutes * 60 if runtime_max_minutes > 0 else 0
            progress_callback = _guardrail_progress_callback(
                progress_callback,
                controller,
                runtime_max_sec,
                memory_max_mb,
                self.logging_service,
            )

        entries = parse_m3u(m3u_path)
        if not entries:
            return ([], None)

        warning_msg: Optional[str] = None
        total = len(entries)

        # Build inputs (existing files only) and file-not-found results (same as collection pipeline)
        inputs: List[Tuple[int, Track]] = []
        not_found_by_idx: Dict[int, TrackResult] = {}
        for idx, (path, title, artist) in enumerate(entries, 1):
            if os.path.exists(path):
                if title is None and artist is None:
                    title, artist = read_title_artist_from_file(path)
                title = (title or "").strip() or "Unknown"
                artist = (artist or "").strip() or "Unknown"
                inputs.append((idx, Track(title=title, artist=artist, file_path=path)))
            else:
                title_display = (
                    title or os.path.basename(path) or "Unknown"
                ).strip() or "Unknown"
                artist_display = (artist or "—").strip() or "—"
                not_found_by_idx[idx] = TrackResult(
                    playlist_index=idx,
                    title=title_display,
                    artist=artist_display,
                    matched=False,
                    error=FILE_NOT_FOUND_ERROR,
                    file_path=path,
                )
        existing_count = sum(1 for p, _, _ in entries if os.path.exists(p))
        if existing_count < total:
            warning_msg = f"{existing_count} of {total} files found"
            self.logging_service.warning("[m3u] %s", warning_msg)

        def _merge_results_in_order(
            processed: Dict[int, TrackResult],
        ) -> List[TrackResult]:
            return [
                processed.get(i) or not_found_by_idx[i] for i in range(1, total + 1)
            ]

        # TRACK_WORKERS and cap (same as process_playlist_from_xml)
        def _safe_int(val: Any, fallback: int) -> int:
            try:
                return int(val)
            except (TypeError, ValueError):
                return fallback

        track_workers = _safe_int(
            effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 1)),
            SETTINGS.get("TRACK_WORKERS", 1),
        )
        perf_max = self.config_service.get("performance.max_workers", 8)
        if isinstance(perf_max, (int, float)) and perf_max >= 1:
            track_workers = min(track_workers, int(perf_max))

        matched_count = 0
        unmatched_count = len(not_found_by_idx)
        progress_lock = threading.Lock()
        results_dict: Dict[int, TrackResult] = dict(not_found_by_idx)

        if track_workers > 1 and inputs:
            self.logging_service.info(
                f"[m3u] Using parallel processing with {track_workers} workers for {len(inputs)} tracks"
            )
            try:
                with ThreadPoolExecutor(max_workers=track_workers) as ex:
                    future_to_args = {
                        ex.submit(
                            self.process_track,
                            idx,
                            track,
                            effective_settings,
                        ): (idx, track)
                        for idx, track in inputs
                    }
                    for future in as_completed(future_to_args):
                        if controller and controller.is_cancelled():
                            for f in future_to_args:
                                if not f.done():
                                    f.cancel()
                            break
                        try:
                            result = future.result()
                            results_dict[result.playlist_index] = result
                            with progress_lock:
                                if result.matched:
                                    matched_count += 1
                                else:
                                    unmatched_count += 1
                                if progress_callback:
                                    try:
                                        progress_callback(
                                            ProgressInfo(
                                                completed_tracks=len(results_dict),
                                                total_tracks=total,
                                                matched_count=matched_count,
                                                unmatched_count=unmatched_count,
                                                current_track={
                                                    "title": result.title,
                                                    "artists": result.artist or "",
                                                },
                                                elapsed_time=time.perf_counter()
                                                - processing_start_time,
                                                reliability_state=ReliabilityState.RUNNING,
                                            )
                                        )
                                    except Exception:
                                        pass
                        except Exception as e:
                            self.logging_service.warning(
                                "[m3u] Track task failed: %s", e
                            )
                results = _merge_results_in_order(results_dict)
            except Exception as e:
                self.logging_service.warning(
                    "[m3u] Parallel processing failed, falling back to sequential: %s",
                    e,
                )
                results_dict = dict(not_found_by_idx)
                matched_count = 0
                unmatched_count = len(not_found_by_idx)
                track_workers = 1
                results = None
        else:
            results = None

        if track_workers <= 1 or results is None:
            if inputs and not results:
                self.logging_service.info(
                    f"[m3u] Using sequential processing (TRACK_WORKERS={track_workers})"
                )
            results_dict = dict(not_found_by_idx)
            matched_count = 0
            unmatched_count = len(not_found_by_idx)
            for idx, track in inputs:
                if controller and controller.is_cancelled():
                    break
                result = self.process_track(idx, track, effective_settings)
                results_dict[idx] = result
                if result.matched:
                    matched_count += 1
                else:
                    unmatched_count += 1
                if progress_callback:
                    try:
                        progress_callback(
                            ProgressInfo(
                                completed_tracks=len(results_dict),
                                total_tracks=total,
                                matched_count=matched_count,
                                unmatched_count=unmatched_count,
                                current_track={
                                    "title": track.title,
                                    "artists": track.artist or "",
                                },
                                elapsed_time=time.perf_counter()
                                - processing_start_time,
                                reliability_state=ReliabilityState.RUNNING,
                            )
                        )
                    except Exception:
                        pass
            results = _merge_results_in_order(results_dict)

        return (results, warning_msg)

    def run_preflight(
        self,
        xml_path: str,
        playlist_name: str,
        output_dir: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
        force: bool = False,
    ) -> PreflightResult:
        """Run preflight validation for a run request."""
        errors: List[PreflightIssue] = []
        warnings: List[PreflightIssue] = []
        checks: Dict[str, Any] = {"preflight_enabled": True}

        preflight_enabled = self.config_service.get("product.preflight_enabled", False)
        if preflight_enabled is None:
            preflight_enabled = False
        warnings_only = self.config_service.get(
            "product.preflight_warnings_only", False
        )
        if warnings_only is None:
            warnings_only = False
        preflight_enabled = bool(preflight_enabled)
        warnings_only = bool(warnings_only)
        if not preflight_enabled and not force:
            return PreflightResult(
                errors=[],
                warnings=[],
                checks={"preflight_enabled": False},
                warnings_only=warnings_only,
                generated_at=datetime.now(),
            )

        xml_path_value = (xml_path or "").strip()
        if not xml_path_value:
            errors.append(
                PreflightIssue(code="P001", message="XML file path is required.")
            )
            return PreflightResult(
                errors=errors,
                warnings=warnings,
                checks=checks,
                warnings_only=warnings_only,
            )

        xml_path_obj = Path(xml_path_value)
        checks["xml_path_length"] = len(str(xml_path_obj))

        if not xml_path_obj.exists():
            errors.append(PreflightIssue(code="P001", message="XML file not found."))
        elif not xml_path_obj.is_file():
            errors.append(
                PreflightIssue(code="P002", message="XML path points to a directory.")
            )
        checks["xml_exists"] = xml_path_obj.exists()
        checks["xml_is_file"] = xml_path_obj.is_file()

        max_path_len = 260 if os.name == "nt" else 4096
        if len(str(xml_path_obj)) > max_path_len:
            errors.append(
                PreflightIssue(
                    code="P006",
                    message="XML path exceeds OS path length limits.",
                )
            )

        if xml_path_obj.exists() and xml_path_obj.is_file():
            if xml_path_obj.suffix.lower() != ".xml":
                warnings.append(
                    PreflightIssue(
                        code="P004", message="XML file extension is not .xml."
                    )
                )
            try:
                if xml_path_obj.stat().st_size == 0:
                    errors.append(
                        PreflightIssue(code="P004", message="XML file is empty.")
                    )
                elif xml_path_obj.stat().st_size > 100 * 1024 * 1024:
                    warnings.append(
                        PreflightIssue(
                            code="P004",
                            message="XML file is large (> 100MB). Processing may be slower.",
                        )
                    )
                checks["xml_size_bytes"] = xml_path_obj.stat().st_size
            except OSError:
                errors.append(
                    PreflightIssue(code="P003", message="XML file cannot be accessed.")
                )

            if not is_readable(xml_path_obj):
                errors.append(
                    PreflightIssue(code="P003", message="XML file is not readable.")
                )
            checks["xml_readable"] = is_readable(xml_path_obj)

        # Config validation (legacy settings + structured config)
        effective_settings = (
            settings
            if settings is not None
            else {
                key: self.config_service.get(key, SETTINGS.get(key))
                for key in SETTINGS.keys()
            }
        )

        def _safe_int(value: Any, fallback: int) -> int:
            try:
                return int(value)
            except (TypeError, ValueError):
                return fallback

        track_workers = _safe_int(
            effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 1)),
            SETTINGS.get("TRACK_WORKERS", 1),
        )
        candidate_workers = _safe_int(
            effective_settings.get(
                "CANDIDATE_WORKERS", SETTINGS.get("CANDIDATE_WORKERS", 1)
            ),
            SETTINGS.get("CANDIDATE_WORKERS", 1),
        )
        per_track_timeout = _safe_int(
            effective_settings.get(
                "PER_TRACK_TIME_BUDGET_SEC",
                SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC", 1),
            ),
            SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC", 1),
        )

        if track_workers < 1:
            errors.append(
                PreflightIssue(code="P030", message="Concurrency must be >= 1.")
            )
        if candidate_workers < 1:
            errors.append(
                PreflightIssue(code="P030", message="Candidate workers must be >= 1.")
            )
        if per_track_timeout < 1:
            errors.append(
                PreflightIssue(code="P031", message="Timeout must be >= 1 second.")
            )

        max_retries = self.config_service.get("beatport.max_retries", 0)
        if isinstance(max_retries, (int, float)) and max_retries < 0:
            errors.append(
                PreflightIssue(code="P032", message="Retry count must be >= 0.")
            )

        cache_ttl_default = self.config_service.get("cache.ttl_default", 0)
        cache_ttl_search = self.config_service.get("cache.ttl_search", 0)
        cache_ttl_track = self.config_service.get("cache.ttl_track", 0)
        if any(
            isinstance(val, (int, float)) and val < 0
            for val in [cache_ttl_default, cache_ttl_search, cache_ttl_track]
        ):
            errors.append(
                PreflightIssue(code="P033", message="Cache TTL values must be >= 0.")
            )

        export_format = self.config_service.get("export.default_format", "csv")
        valid_formats = {"csv", "json", "excel", "xlsx"}
        if (
            isinstance(export_format, str)
            and export_format.lower() not in valid_formats
        ):
            errors.append(
                PreflightIssue(
                    code="P034", message="Output format selection is invalid."
                )
            )

        # Design 6.46: Performance config validation
        try:
            perf_max_workers = self.config_service.get("performance.max_workers", 8)
            if isinstance(perf_max_workers, (int, float)) and perf_max_workers < 1:
                errors.append(
                    PreflightIssue(
                        code="P030", message="Performance max_workers must be >= 1."
                    )
                )
            perf_cache_mb = self.config_service.get("performance.cache_max_mb", 500)
            if isinstance(perf_cache_mb, (int, float)) and perf_cache_mb < 100:
                errors.append(
                    PreflightIssue(
                        code="P033", message="Performance cache_max_mb must be >= 100."
                    )
                )
        except Exception:
            pass

        config_errors = self.config_service.validate()
        if isinstance(config_errors, list):
            for err in config_errors:
                errors.append(PreflightIssue(code="CONFIG_INVALID", message=err))

        # Design 5.2: Network preflight - block if offline (reliability UX fallback)
        preflight_network = self.config_service.get(
            "product.preflight_network_check", True
        )
        if preflight_network is None:
            preflight_network = True
        if preflight_network and not errors:
            try:
                if not NetworkState.is_online():
                    errors.append(
                        PreflightIssue(
                            code="P050",
                            message="Network unavailable. Connect to the internet to search Beatport.",
                        )
                    )
                checks["network_online"] = NetworkState.is_online()
            except Exception:
                checks["network_online"] = None  # Check skipped on error

        # Playlist validation (only if XML is accessible)
        if (
            xml_path_obj.exists()
            and xml_path_obj.is_file()
            and is_readable(xml_path_obj)
        ):
            try:
                playlist_index, duplicates = read_playlist_index(xml_path_value)
                inspection = inspect_rekordbox_xml(xml_path_value)
                checks["xml_root_tag"] = inspection.get("root_tag")
                checks["xml_has_playlists"] = inspection.get("has_playlists")
                checks["xml_has_tracks"] = inspection.get("has_tracks")
                checks["tracks_missing_title"] = inspection.get("tracks_missing_title")
                checks["tracks_missing_artist"] = inspection.get(
                    "tracks_missing_artist"
                )

                root_tag = str(inspection.get("root_tag") or "")
                if not root_tag:
                    errors.append(
                        PreflightIssue(
                            code="P005", message="XML root element is missing."
                        )
                    )
                elif root_tag.upper() not in {"DJ_PLAYLISTS"}:
                    errors.append(
                        PreflightIssue(
                            code="P005",
                            message="XML root element is not a Rekordbox export.",
                        )
                    )

                if not inspection.get("has_playlists"):
                    errors.append(
                        PreflightIssue(
                            code="P005", message="XML has no playlist nodes."
                        )
                    )
                if not inspection.get("has_tracks"):
                    warnings.append(
                        PreflightIssue(code="P005", message="XML has no track nodes.")
                    )

                invalid_playlist_names = []
                for name in inspection.get("playlist_names", []):
                    if not name:
                        continue
                    if any(ch in name for ch in '<>:"/\\|?*'):
                        invalid_playlist_names.append(name)
                if invalid_playlist_names:
                    warnings.append(
                        PreflightIssue(
                            code="P012",
                            message="Playlist names contain invalid characters.",
                        )
                    )
                if inspection.get("playlist_empty_names"):
                    warnings.append(
                        PreflightIssue(
                            code="P012",
                            message="Some playlists have empty names.",
                        )
                    )

                if inspection.get("tracks_missing_title"):
                    warnings.append(
                        PreflightIssue(
                            code="P005", message="Some tracks are missing titles."
                        )
                    )
                if inspection.get("tracks_missing_artist"):
                    warnings.append(
                        PreflightIssue(
                            code="P005", message="Some tracks are missing artists."
                        )
                    )

                if duplicates:
                    warnings.append(
                        PreflightIssue(
                            code="P012",
                            message=f"Duplicate playlist names detected: {', '.join(sorted(duplicates))}.",
                        )
                    )
                if playlist_name:
                    if playlist_name not in playlist_index:
                        errors.append(
                            PreflightIssue(
                                code="P010", message="Playlist not found in XML."
                            )
                        )
                    elif playlist_index.get(playlist_name, 0) == 0:
                        errors.append(
                            PreflightIssue(code="P011", message="Playlist is empty.")
                        )
                else:
                    errors.append(
                        PreflightIssue(
                            code="P010", message="Playlist name is required."
                        )
                    )
            except Exception:
                errors.append(
                    PreflightIssue(code="P005", message="XML file could not be parsed.")
                )

        # Output directory validation (optional)
        if output_dir:
            output_path = Path(output_dir)
            checks["output_path_length"] = len(str(output_path))
            if len(str(output_path)) > max_path_len:
                errors.append(
                    PreflightIssue(
                        code="P023",
                        message="Output path exceeds OS path length limits.",
                    )
                )
            if output_path.exists() and not output_path.is_dir():
                errors.append(
                    PreflightIssue(
                        code="P021", message="Output path is not a directory."
                    )
                )
            elif not output_path.exists():
                parent_dir = output_path.parent
                if parent_dir.exists() and is_writable(parent_dir):
                    warnings.append(
                        PreflightIssue(
                            code="P020",
                            message="Output folder does not exist and will be created.",
                        )
                    )
                else:
                    errors.append(
                        PreflightIssue(
                            code="P020",
                            message="Output folder does not exist and cannot be created.",
                        )
                    )
            elif not is_writable(output_path):
                errors.append(
                    PreflightIssue(
                        code="P021", message="Output folder is not writable."
                    )
                )
            else:
                try:
                    disk = shutil.disk_usage(output_path)
                    checks["output_free_bytes"] = disk.free
                    if disk.free < 100 * 1024 * 1024:
                        errors.append(
                            PreflightIssue(
                                code="P022",
                                message="Output folder has insufficient free space.",
                            )
                        )
                except Exception:
                    warnings.append(
                        PreflightIssue(
                            code="P022",
                            message="Unable to determine available free space.",
                        )
                    )

            if StorageInvariants.is_restricted_location(output_path):
                errors.append(
                    PreflightIssue(
                        code="P024",
                        message="Output folder cannot be inside the app install path.",
                    )
                )

        try:
            cache_dir = AppPaths.cache_dir()
            if not is_writable(cache_dir):
                errors.append(
                    PreflightIssue(
                        code="P033", message="Cache directory is not writable."
                    )
                )
        except Exception:
            warnings.append(
                PreflightIssue(
                    code="P033", message="Cache directory could not be validated."
                )
            )

        if warnings_only and errors:
            warnings.extend(errors)
            errors = []

        return PreflightResult(
            errors=errors,
            warnings=warnings,
            checks=checks,
            warnings_only=warnings_only,
            generated_at=datetime.now(),
        )

    def process_playlist_from_xml(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        controller: Optional[ProcessingController] = None,
        auto_research: bool = False,
        checkpoint_service: Optional[CheckpointService] = None,
        output_dir: Optional[str] = None,
        base_filename: Optional[str] = None,
        resume_checkpoint: Optional[CheckpointData] = None,
        performance_collector: Optional[RunPerformanceCollector] = None,
        incremental_previous_csv: Optional[str] = None,
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
            else {
                key: self.config_service.get(key, SETTINGS.get(key))
                for key in SETTINGS.keys()
            }
        )

        # Design 6.25: Throttle progress updates to avoid UI stutter (default 200ms)
        throttle_ms = 200
        eta_every_n = 50
        runtime_max_minutes = 120
        memory_max_mb = 2048
        try:
            throttle_ms = int(
                self.config_service.get("performance.progress_throttle_ms", 200)
            )
            eta_every_n = int(
                self.config_service.get("performance.eta_update_every_tracks", 50)
            )
            runtime_max_minutes = int(
                self.config_service.get("performance.runtime_max_minutes", 120)
            )
            memory_max_mb = 2048  # Design 6.167: 2GB hard limit
        except (TypeError, ValueError):
            pass
        if progress_callback:
            if throttle_ms > 0:
                progress_callback = _throttled_progress_callback(
                    progress_callback, throttle_ms=throttle_ms, eta_every_n=eta_every_n
                )
            runtime_max_sec = runtime_max_minutes * 60 if runtime_max_minutes > 0 else 0
            progress_callback = _guardrail_progress_callback(
                progress_callback,
                controller,
                runtime_max_sec,
                memory_max_mb,
                self.logging_service,
            )

        # Design 6.74: Performance collector for stage timings and metrics
        collector = performance_collector

        # Preflight validation (file/playlist/config checks)
        preflight = self.run_preflight(
            xml_path=xml_path,
            playlist_name=playlist_name,
            output_dir=None,
            settings=effective_settings,
        )
        if preflight.warnings:
            for warning in preflight.warning_messages():
                self.logging_service.warning(f"Preflight warning: {warning}")
        if not preflight.can_proceed:
            error_messages = preflight.error_messages()
            error_codes = {issue.code for issue in preflight.errors}
            error_type = ErrorType.VALIDATION_ERROR
            if "P001" in error_codes:
                error_type = ErrorType.FILE_NOT_FOUND
            elif "P010" in error_codes:
                error_type = ErrorType.PLAYLIST_NOT_FOUND
            elif "P005" in error_codes:
                error_type = ErrorType.XML_PARSE_ERROR

            raise ProcessingError(
                error_type=error_type,
                message="Preflight checks failed.",
                details="; ".join(error_messages),
                suggestions=[
                    "Fix the listed preflight issues and retry",
                    "Re-export the Rekordbox XML if parsing fails",
                    "Verify file permissions and playlist selection",
                ],
                recoverable=True,
            )

        # Parse Rekordbox XML file to extract playlists with tracks (Design 6.50: stage timer)
        if collector:
            collector.start_run()
            collector.start_stage(STAGE_PARSE_XML)
        try:
            # Use path-keyed playlists so selection from UI (full path e.g. ROOT/TEST/to split test) matches
            _, playlists = parse_playlist_tree(xml_path)
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

        if collector:
            collector.end_stage(STAGE_PARSE_XML, items_processed=len(playlists))
            collector.start_stage(STAGE_SEARCH_CANDIDATES)
            collector.sample_memory()

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

        # Design 5.9, 5.62: Resume from checkpoint if provided
        start_index = 1
        existing_output_paths: Dict[str, str] = {}
        if resume_checkpoint and checkpoint_service:
            if not checkpoint_service.can_resume(resume_checkpoint, xml_path):
                self.logging_service.warning(
                    "[reliability] Checkpoint invalid or XML changed; starting fresh"
                )
                resume_checkpoint = None
            else:
                start_index = resume_checkpoint.last_track_index + 1
                existing_output_paths = dict(resume_checkpoint.output_paths or {})
                self.logging_service.info(
                    "[reliability] resume_started run_id=%s from index %s",
                    resume_checkpoint.run_id,
                    start_index,
                )

        # Design 7.52: Set run_id for observability (diagnostics, support bundle, logs)
        run_id = (
            resume_checkpoint.run_id if resume_checkpoint else uuid.uuid4().hex[:12]
        )
        set_run_id(run_id)
        self.logging_service.info("[run] run_started run_id=%s", run_id)

        # Design 5.8: Checkpoint run_id and file_timestamp for incremental save (non-resume only)
        file_timestamp = ""
        checkpoint_output_paths: Dict[str, str] = {}
        checkpoint_every = 50
        if (
            not resume_checkpoint
            and checkpoint_service
            and output_dir
            and base_filename
        ):
            resume_enabled = self.config_service.get("reliability.resume_enabled", True)
            if resume_enabled:
                checkpoint_every = int(
                    self.config_service.get("reliability.checkpoint_every", 50)
                )
                file_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                self.logging_service.info(
                    "[reliability] Checkpointing enabled run_id=%s every %s tracks",
                    run_id,
                    checkpoint_every,
                )
        last_checkpoint_count = 0

        # Prepare inputs as list of (index, track) tuples (Design 5.9: skip already-processed when resuming)
        all_inputs = [(idx, track) for idx, track in enumerate(tracks, 1)]
        inputs = [(idx, track) for idx, track in all_inputs if idx >= start_index]

        # Design 6: Incremental processing - filter to only tracks not in previous run
        if incremental_previous_csv and inputs:
            previous_keys = load_processed_track_keys(incremental_previous_csv)
            if previous_keys:
                original_count = len(inputs)
                inputs = [
                    (idx, track)
                    for idx, track in inputs
                    if (idx, track.title or "", track.artist or "") not in previous_keys
                ]
                skipped = original_count - len(inputs)
                self.logging_service.info(
                    "[perf] Incremental mode: skipping %s already-processed tracks, processing %s new",
                    skipped,
                    len(inputs),
                )
                if not inputs:
                    self.logging_service.info(
                        "[perf] All tracks already processed, nothing to do"
                    )
                    return []

        # Design 6.22: Compute track_workers (capped by performance.max_workers)
        def _safe_int(val: Any, fallback: int) -> int:
            try:
                return int(val)
            except (TypeError, ValueError):
                return fallback

        track_workers = _safe_int(
            effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 1)),
            SETTINGS.get("TRACK_WORKERS", 1),
        )
        perf_max_workers = self.config_service.get("performance.max_workers", 8)
        if isinstance(perf_max_workers, (int, float)) and perf_max_workers >= 1:
            track_workers = min(track_workers, int(perf_max_workers))

        # Shared state for progress updates (parallel and sequential)
        total = len(inputs)
        matched_count = 0
        unmatched_count = 0
        progress_lock = threading.Lock()

        # Initialize results variable (will be set by parallel or sequential processing)
        results: List[TrackResult] = []

        if track_workers > 1:
            self.logging_service.info(
                f"Using parallel processing with {track_workers} workers for {len(inputs)} tracks"
            )
            # PARALLEL MODE: Process multiple tracks simultaneously
            # Use ThreadPoolExecutor to run process_track() in parallel
            try:
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
                    results_dict: Dict[
                        int, TrackResult
                    ] = {}  # Store results by index for ordering
                    processed_futures = set()  # Track which futures we've processed

                    self.logging_service.info(
                        f"Submitted {len(future_to_args)} tasks to ThreadPoolExecutor, waiting for completion..."
                    )

                    try:
                        # CRITICAL: Wrap as_completed in a try-except to catch any iterator issues
                        # In packaged apps, the iterator might fail or exit early
                        iterator = as_completed(future_to_args)
                        loop_iterations = 0
                        max_iterations = len(future_to_args) * 2  # Safety limit

                        for future in iterator:
                            loop_iterations += 1
                            if loop_iterations > max_iterations:
                                self.logging_service.error(
                                    f"as_completed loop exceeded safety limit ({max_iterations} iterations)! "
                                    f"This should never happen. Breaking to process remaining futures."
                                )
                                break

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
                                processed_futures.add(future)

                                # Log completion for debugging (especially important in packaged apps)
                                self.logging_service.debug(
                                    f"Track {result.playlist_index} completed: "
                                    f"matched={result.matched}, "
                                    f"total_processed={len(results_dict)}/{len(inputs)}"
                                )

                                # Thread-safe progress update
                                with progress_lock:
                                    if result.matched:
                                        matched_count += 1
                                    else:
                                        unmatched_count += 1

                                    # Update progress callback (thread-safe)
                                    # CRITICAL: Progress callback must not block or raise exceptions
                                    # In packaged apps, Qt signal emission from non-Qt threads can block
                                    if progress_callback:
                                        try:
                                            completed = len(results_dict)
                                            elapsed_time = (
                                                time.perf_counter()
                                                - processing_start_time
                                            )
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
                                                reliability_state=ReliabilityState.RUNNING,
                                            )
                                            progress_callback(progress_info)
                                        except Exception as callback_setup_error:
                                            self.logging_service.warning(
                                                f"Progress callback setup error (non-fatal, continuing): {callback_setup_error}"
                                            )

                                    # Design 5.8: Parallel checkpointing - save every N completions (contiguous)
                                    if (
                                        run_id
                                        and checkpoint_service
                                        and output_dir
                                        and base_filename
                                        and len(results_dict) % checkpoint_every == 0
                                        and len(results_dict) > 0
                                    ):
                                        sorted_indices = sorted(results_dict.keys())
                                        max_idx = (
                                            max(sorted_indices) if sorted_indices else 0
                                        )
                                        K = 0
                                        for i in range(1, max_idx + 1):
                                            if i not in results_dict:
                                                break
                                            K = i
                                        if K > last_checkpoint_count:
                                            try:
                                                if last_checkpoint_count == 0:
                                                    ordered = [
                                                        results_dict[i]
                                                        for i in range(1, K + 1)
                                                    ]
                                                    out_paths = write_csv_files(
                                                        ordered,
                                                        base_filename,
                                                        output_dir,
                                                        file_timestamp=file_timestamp,
                                                        run_id=run_id,
                                                        run_status="partial",
                                                    )
                                                    checkpoint_output_paths.update(
                                                        out_paths
                                                    )
                                                else:
                                                    batch = [
                                                        results_dict[i]
                                                        for i in range(
                                                            last_checkpoint_count + 1,
                                                            K + 1,
                                                        )
                                                    ]
                                                    if (
                                                        batch
                                                        and checkpoint_output_paths.get(
                                                            "main"
                                                        )
                                                    ):
                                                        append_rows_to_main_csv(
                                                            batch,
                                                            checkpoint_output_paths[
                                                                "main"
                                                            ],
                                                            delimiter=",",
                                                            include_metadata=True,
                                                            fsync=False,  # Design 6.30: avoid frequent fsync
                                                        )
                                                xml_hash = compute_xml_hash(xml_path)
                                                last_track_id = f"trk_{K:06d}"
                                                checkpoint_service.save(
                                                    run_id=run_id,
                                                    playlist=playlist_name,
                                                    xml_path=xml_path,
                                                    xml_hash=xml_hash,
                                                    last_track_index=K,
                                                    last_track_id=last_track_id,
                                                    output_paths=checkpoint_output_paths,
                                                )
                                                last_checkpoint_count = K
                                                self.logging_service.info(
                                                    "[reliability] Parallel checkpoint saved at index %s",
                                                    K,
                                                )
                                            except Exception as ckpt_err:
                                                self.logging_service.warning(
                                                    "[reliability] Parallel checkpoint save failed: %s",
                                                    ckpt_err,
                                                )

                            except Exception as e:
                                # Handle errors from individual track processing
                                processed_futures.add(future)
                                idx, track = future_to_args[future]
                                self.logging_service.warning(
                                    f"Error processing track {idx} '{track.title}': {e}",
                                    exc_info=True,  # Include full traceback for debugging
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

                        # Log loop completion
                        self.logging_service.info(
                            f"as_completed loop finished: {loop_iterations} iterations, "
                            f"{len(processed_futures)} futures processed, "
                            f"{len(results_dict)} results collected"
                        )
                    except StopIteration:
                        # Iterator exhausted - this is normal, but log it
                        self.logging_service.info(
                            f"as_completed iterator exhausted after {loop_iterations} iterations. "
                            f"Processed: {len(processed_futures)}/{len(future_to_args)}"
                        )
                    except Exception as loop_error:
                        # Critical: If the loop itself fails, we must still process remaining futures
                        self.logging_service.error(
                            f"Error in parallel processing loop: {loop_error}",
                            exc_info=True,
                        )
                        # Process any remaining futures that weren't handled
                        for future in future_to_args.keys():
                            if future not in processed_futures:
                                try:
                                    if future.done():
                                        result = future.result(
                                            timeout=1.0
                                        )  # Short timeout for done futures
                                        results_dict[result.playlist_index] = result
                                    else:
                                        # Future not done yet, wait for it with timeout
                                        # CRITICAL: Use longer timeout to handle DuckDuckGo search timeouts
                                        timeout_sec = (
                                            effective_settings.get(
                                                "PER_TRACK_TIME_BUDGET_SEC", 45
                                            )
                                            * 2
                                        )
                                        result = future.result(timeout=timeout_sec)
                                        results_dict[result.playlist_index] = result
                                except TimeoutError:
                                    # Future timed out - likely due to DuckDuckGo search hanging
                                    idx, track = future_to_args[future]
                                    self.logging_service.error(
                                        f"Track {idx} '{track.title}' processing timed out in exception handler. "
                                        f"This may be due to DuckDuckGo search timeouts in packaged app."
                                    )
                                    error_result = TrackResult(
                                        playlist_index=idx,
                                        title=track.title,
                                        artist=track.artist or "",
                                        matched=False,
                                        error="Processing timed out (likely due to DuckDuckGo search timeouts)",
                                    )
                                    results_dict[idx] = error_result
                                    with progress_lock:
                                        unmatched_count += 1
                                except Exception as e:
                                    # Handle error for this future
                                    idx, track = future_to_args[future]
                                    self.logging_service.warning(
                                        f"Error processing remaining track {idx} '{track.title}': {e}"
                                    )
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

                    # CRITICAL: Ensure all futures are processed before exiting
                    # This handles cases where the as_completed loop might exit early
                    remaining_futures = [
                        f for f in future_to_args.keys() if f not in processed_futures
                    ]
                    if remaining_futures:
                        self.logging_service.warning(
                            f"as_completed loop exited early! Processing {len(remaining_futures)} remaining futures "
                            f"that weren't handled in the loop. This should not happen - investigating..."
                        )
                        self.logging_service.info(
                            f"Processed futures: {len(processed_futures)}, Remaining: {len(remaining_futures)}, "
                            f"Total: {len(future_to_args)}"
                        )
                        for future in remaining_futures:
                            try:
                                # Wait for future to complete (with timeout to avoid hanging)
                                # CRITICAL: In packaged apps, DuckDuckGo timeouts can cause futures to hang
                                # Use a reasonable timeout (90 seconds = PER_TRACK_TIME_BUDGET_SEC * 2)
                                if not future.done():
                                    # Future is still running, wait for it with timeout
                                    # If DuckDuckGo times out, this will prevent infinite waiting
                                    timeout_sec = (
                                        effective_settings.get(
                                            "PER_TRACK_TIME_BUDGET_SEC", 45
                                        )
                                        * 2
                                    )
                                    result = future.result(timeout=timeout_sec)
                                    results_dict[result.playlist_index] = result
                                    processed_futures.add(future)
                                    with progress_lock:
                                        if result.matched:
                                            matched_count += 1
                                        else:
                                            unmatched_count += 1
                                else:
                                    # Future is done, get result (should be instant)
                                    result = future.result(
                                        timeout=1.0
                                    )  # Short timeout for done futures
                                    results_dict[result.playlist_index] = result
                                    processed_futures.add(future)
                                    with progress_lock:
                                        if result.matched:
                                            matched_count += 1
                                        else:
                                            unmatched_count += 1
                            except TimeoutError:
                                # Future timed out - this can happen if DuckDuckGo searches hang
                                processed_futures.add(future)
                                idx, track = future_to_args[future]
                                self.logging_service.error(
                                    f"Track {idx} '{track.title}' processing timed out after waiting. "
                                    f"This may be due to DuckDuckGo search timeouts in packaged app."
                                )
                                error_result = TrackResult(
                                    playlist_index=idx,
                                    title=track.title,
                                    artist=track.artist or "",
                                    matched=False,
                                    error="Processing timed out (likely due to DuckDuckGo search timeouts)",
                                )
                                results_dict[idx] = error_result
                                with progress_lock:
                                    unmatched_count += 1
                            except Exception as e:
                                # Handle error for this future
                                processed_futures.add(future)
                                idx, track = future_to_args[future]
                                self.logging_service.warning(
                                    f"Error processing remaining track {idx} '{track.title}': {e}",
                                    exc_info=True,
                                )
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

                    # Verify we have results for all tracks
                    expected_count = len(inputs)
                    actual_count = len(results_dict)
                    self.logging_service.info(
                        f"Parallel processing complete: {actual_count}/{expected_count} tracks processed"
                    )
                    if actual_count < expected_count:
                        missing_indices = set(range(1, expected_count + 1)) - set(
                            results_dict.keys()
                        )
                        self.logging_service.error(
                            f"CRITICAL: Missing results for {len(missing_indices)} tracks! "
                            f"Expected {expected_count} tracks, got {actual_count}. "
                            f"Missing indices: {missing_indices}"
                        )
                        # Create error results for missing tracks
                        for idx, track in inputs:
                            if idx not in results_dict:
                                self.logging_service.error(
                                    f"Creating error result for missing track {idx}: {track.title}"
                                )
                                error_result = TrackResult(
                                    playlist_index=idx,
                                    title=track.title,
                                    artist=track.artist or "",
                                    matched=False,
                                    error="Track processing did not complete (possible thread/exception issue)",
                                )
                                results_dict[idx] = error_result
                                with progress_lock:
                                    unmatched_count += 1

                    # Sort results by playlist index to maintain order
                    results = [results_dict[idx] for idx in sorted(results_dict.keys())]
            except Exception as parallel_error:
                # If parallel processing fails catastrophically, fall back to sequential
                self.logging_service.error(
                    f"Parallel processing failed, falling back to sequential: {parallel_error}",
                    exc_info=True,
                )
                # Fall through to sequential processing below
                track_workers = 1  # Force sequential mode
                results = None  # Will be set in sequential mode
            else:
                # Parallel processing completed successfully, results is already set
                pass

        # If parallel processing failed or track_workers <= 1, use sequential mode
        if track_workers <= 1 or not results:
            # SEQUENTIAL MODE: Process tracks one at a time
            self.logging_service.info(
                f"Using sequential processing (TRACK_WORKERS={track_workers})"
            )
            results = []  # Re-initialize for sequential mode
            for idx, track in inputs:
                # Design 5.12, 5.25: Pause/resume support
                if controller and controller.is_paused():
                    if progress_callback:
                        elapsed_time = time.perf_counter() - processing_start_time
                        try:
                            progress_callback(
                                ProgressInfo(
                                    completed_tracks=len(results),
                                    total_tracks=total,
                                    matched_count=matched_count,
                                    unmatched_count=unmatched_count,
                                    current_track={
                                        "title": track.title,
                                        "artists": track.artist or "",
                                    },
                                    elapsed_time=elapsed_time,
                                    status_message="Paused",
                                    reliability_state=ReliabilityState.PAUSED,
                                )
                            )
                        except Exception:
                            pass
                    controller.wait_if_paused()
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

                # Update progress callback (Design 5.24: reliability_state)
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
                        reliability_state=ReliabilityState.RUNNING,
                    )
                    try:
                        progress_callback(progress_info)
                    except Exception:
                        # Don't let callback errors break processing
                        pass

                # Design 5.8: Save checkpoint every N tracks (sequential mode, first write or append)
                if (
                    run_id
                    and checkpoint_service
                    and output_dir
                    and base_filename
                    and len(results) % checkpoint_every == 0
                    and len(results) > 0
                ):
                    try:
                        if last_checkpoint_count == 0:
                            out_paths = write_csv_files(
                                results,
                                base_filename,
                                output_dir,
                                file_timestamp=file_timestamp,
                                run_id=run_id,
                                run_status="partial",
                            )
                            checkpoint_output_paths.update(out_paths)
                        else:
                            batch = results[last_checkpoint_count : len(results)]
                            if batch and checkpoint_output_paths.get("main"):
                                append_rows_to_main_csv(
                                    batch,
                                    checkpoint_output_paths["main"],
                                    delimiter=",",
                                    include_metadata=True,
                                    fsync=False,  # Design 6.30: avoid frequent fsync
                                )
                        xml_hash = compute_xml_hash(xml_path)
                        last_track_id = f"trk_{idx:06d}"
                        checkpoint_service.save(
                            run_id=run_id,
                            playlist=playlist_name,
                            xml_path=xml_path,
                            xml_hash=xml_hash,
                            last_track_index=idx,
                            last_track_id=last_track_id,
                            output_paths=checkpoint_output_paths,
                        )
                        last_checkpoint_count = len(results)
                    except Exception as ckpt_err:
                        self.logging_service.warning(
                            "[reliability] Checkpoint save failed: %s", ckpt_err
                        )

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
                    track: Optional[Track] = (
                        tracks[idx - 1] if idx <= len(tracks) else None
                    )
                    if track:
                        unmatched_inputs.append((idx, track))

                # Re-search unmatched tracks in parallel
                track_workers = enhanced_settings.get(
                    "TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12)
                )
                if track_workers > 1 and len(unmatched_inputs) > 1:
                    # Parallel re-search
                    self.logging_service.info(
                        f"Re-searching {len(unmatched_inputs)} unmatched tracks using parallel "
                        f"processing with {min(track_workers, len(unmatched_inputs))} workers"
                    )
                    with ThreadPoolExecutor(
                        max_workers=min(track_workers, len(unmatched_inputs))
                    ) as ex:
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
                                        elapsed_time = (
                                            time.perf_counter() - processing_start_time
                                        )
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
                        track: Optional[Track] = (
                            tracks[idx - 1] if idx <= len(tracks) else None
                        )
                        if track:
                            new_result = self.process_track(
                                idx, track, enhanced_settings
                            )
                            # Update the result if we found a match
                            if new_result.matched:
                                # Replace the unmatched result with the new matched result
                                results[idx - 1] = new_result
                                matched_count += 1
                                unmatched_count -= 1

                                # Update progress callback
                                if progress_callback:
                                    elapsed_time = (
                                        time.perf_counter() - processing_start_time
                                    )
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

        # Design 6: Incremental processing - append new results to previous CSV
        if incremental_previous_csv and results:
            append_rows_to_main_csv(
                results,
                incremental_previous_csv,
                delimiter=",",
                include_metadata=True,
                fsync=True,
            )
            self.logging_service.info(
                "[perf] Appended %s new results to %s",
                len(results),
                incremental_previous_csv,
            )

        # Design 5.47, 5.49: On resume append new results to existing output; discard checkpoint on success
        if checkpoint_service:
            if resume_checkpoint and existing_output_paths.get("main") and results:
                append_rows_to_main_csv(
                    results,
                    existing_output_paths["main"],
                    delimiter=",",
                    include_metadata=True,
                )
                self.logging_service.info(
                    "[reliability] Appended %s rows to checkpoint output", len(results)
                )
            checkpoint_service.discard()

        # Design 6.74: End performance collector and log report
        if collector:
            collector.end_stage(STAGE_SEARCH_CANDIDATES, items_processed=len(results))
            collector.set_tracks_processed(len(results))
            collector.set_matched_count(sum(1 for r in results if r.matched))
            collector.sample_memory()
            collector.end_run()
            report = collector.get_report()
            self.logging_service.info(
                f"[perf] run={report.run_id} tracks={report.tracks_processed} "
                f"duration={report.duration_sec:.1f}s memory_mb={report.memory_mb_peak:.1f} stages={report.stages}"
            )

        # Design 7.50: Log run_completed for observability
        self.logging_service.info(
            "[run] run_completed run_id=%s tracks=%s",
            run_id,
            len(results),
        )
        return results
