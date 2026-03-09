"""Label enrichment for inventory rows with empty label.

Uses the full inKey pipeline: IProcessorService.process_track() with the same
query generation, matcher, scoring, and parallel workers (ThreadPoolExecutor)
as inKey.
"""

import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional, Tuple

from cuepoint.incrate import inventory_db
from cuepoint.models.track import Track

_logger = logging.getLogger(__name__)

# Default delay between tracks when not using processor (fallback path)
DEFAULT_ENRICHMENT_DELAY_SECONDS = 0.5


def _extract_track_id_from_url(url: str) -> Optional[str]:
    """Extract Beatport track ID from URL if present (e.g. .../track/name/12345 -> 12345)."""
    if not url:
        return None
    m = re.search(r"/track/[^/]+/(\d+)", url)
    return m.group(1) if m else None


def _safe_int(val: Any, fallback: int) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return fallback


def enrich_labels_for_empty(
    db_path: str,
    beatport_service: Any,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    delay_seconds: float = DEFAULT_ENRICHMENT_DELAY_SECONDS,
    processor_service: Optional[Any] = None,
    config_service: Optional[Any] = None,
) -> int:
    """Enrich inventory rows with empty label using the full inKey pipeline.

    When processor_service and config_service are provided, uses the same flow as inKey:
    - IProcessorService.process_track(idx, track) per row
    - TRACK_WORKERS / performance.max_workers for parallel ThreadPoolExecutor
    - Same query generation, matcher, scoring, and candidate workers as inKey

    When processor_service is None, falls back to single-threaded make_search_queries
    + best_beatport_match (no parallelism).

    Args:
        db_path: Path to SQLite inventory database.
        beatport_service: Used only when processor_service is None (fallback).
        progress_callback: Optional callback(current_index, total_count) after each row.
        delay_seconds: Sleep between tracks in fallback path.
        processor_service: Optional IProcessorService for full inKey pipeline + workers.
        config_service: Optional IConfigService for TRACK_WORKERS / max_workers.

    Returns:
        Number of rows updated.
    """
    if processor_service is not None and config_service is not None:
        return _enrich_with_processor(
            db_path=db_path,
            processor_service=processor_service,
            config_service=config_service,
            progress_callback=progress_callback,
        )
    return _enrich_fallback(
        db_path=db_path,
        beatport_service=beatport_service,
        progress_callback=progress_callback,
        delay_seconds=delay_seconds,
    )


def _enrich_with_processor(
    db_path: str,
    processor_service: Any,
    config_service: Any,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> int:
    """Use IProcessorService.process_track with parallel workers (same as inKey)."""
    from cuepoint.models.config import SETTINGS

    conn = inventory_db.get_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, track_key, artist, title FROM inventory WHERE label IS NULL OR TRIM(label) = ''"
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    # Build (row_id, idx, track) for rows with non-empty title; Track requires non-empty title and artist
    inputs: List[Tuple[int, int, Track]] = []
    for i, (row_id, _track_key, artist, title) in enumerate(rows):
        title_str = (title or "").strip()
        if not title_str:
            continue
        artist_str = (artist or "").strip() or "Unknown"
        try:
            track = Track(title=title_str, artist=artist_str)
        except ValueError:
            continue
        inputs.append((row_id, i + 1, track))

    total_inputs = len(inputs)
    if total_inputs == 0:
        return 0

    # Worker count: same logic as processor (Design 6.22)
    track_workers = _safe_int(
        config_service.get("processing.track_workers")
        or config_service.get("performance.track_workers")
        or SETTINGS.get("TRACK_WORKERS", 1),
        1,
    )
    perf_max_workers = config_service.get("performance.max_workers", 8)
    if isinstance(perf_max_workers, (int, float)) and perf_max_workers >= 1:
        track_workers = min(track_workers, int(perf_max_workers))
    track_workers = max(1, track_workers)

    # Index -> row_id for updating DB from results
    idx_to_row_id: Dict[int, int] = {idx: row_id for row_id, idx, _ in inputs}
    updated = 0
    progress_lock = threading.Lock()

    if progress_callback:
        progress_callback(0, total_inputs)

    def _update_row(
        row_id: int, label: str, beatport_track_id: Optional[str], url: str
    ) -> None:
        nonlocal updated
        updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        conn = inventory_db.get_connection(db_path)
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE inventory SET label = ?, beatport_track_id = ?, beatport_url = ?, updated_at = ? WHERE id = ?",
                (label, beatport_track_id, url, updated_at, row_id),
            )
            conn.commit()
            updated += 1
        finally:
            conn.close()

    if track_workers > 1:
        _logger.info(
            "inCrate enrichment: parallel processing with %s workers for %s tracks",
            track_workers,
            len(inputs),
        )
        try:
            with ThreadPoolExecutor(max_workers=track_workers) as ex:
                future_to_idx = {
                    ex.submit(processor_service.process_track, idx, track): idx
                    for _row_id, idx, track in inputs
                }
                completed = 0
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    row_id = idx_to_row_id.get(idx)
                    if row_id is None:
                        continue
                    try:
                        result = future.result()
                        if (
                            result.matched
                            and result.best_match
                            and result.best_match.label
                            and result.best_match.url
                        ):
                            label = (result.best_match.label or "").strip() or None
                            if label:
                                bid = _extract_track_id_from_url(result.best_match.url)
                                _update_row(row_id, label, bid, result.best_match.url)
                    except Exception as e:
                        _logger.warning(
                            "Enrichment failed for row id=%s: %s",
                            row_id,
                            e,
                            exc_info=True,
                        )
                    with progress_lock:
                        completed += 1
                        if progress_callback:
                            progress_callback(completed, total_inputs)
        except Exception as e:
            _logger.warning(
                "Enrichment parallel run failed, falling back to sequential: %s", e
            )
            updated = _run_sequential(
                inputs,
                idx_to_row_id,
                processor_service,
                db_path,
                progress_callback,
                total_inputs,
            )
    else:
        _logger.info(
            "inCrate enrichment: sequential processing for %s tracks", len(inputs)
        )
        updated = _run_sequential(
            inputs,
            idx_to_row_id,
            processor_service,
            db_path,
            progress_callback,
            total_inputs,
        )

    return updated


def _run_sequential(
    inputs: List[Tuple[int, int, Track]],
    idx_to_row_id: Dict[int, int],
    processor_service: Any,
    db_path: str,
    progress_callback: Optional[Callable[[int, int], None]],
    total_inputs: int,
) -> int:
    updated = 0
    for completed, (row_id, idx, track) in enumerate(inputs, 1):
        try:
            result = processor_service.process_track(idx, track)
            if (
                result.matched
                and result.best_match
                and result.best_match.label
                and result.best_match.url
            ):
                label = (result.best_match.label or "").strip() or None
                if label:
                    bid = _extract_track_id_from_url(result.best_match.url)
                    updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    conn = inventory_db.get_connection(db_path)
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "UPDATE inventory SET label = ?, beatport_track_id = ?, beatport_url = ?, updated_at = ? WHERE id = ?",
                            (label, bid, result.best_match.url, updated_at, row_id),
                        )
                        conn.commit()
                        updated += 1
                    finally:
                        conn.close()
        except Exception as e:
            _logger.warning(
                "Enrichment failed for row id=%s: %s", row_id, e, exc_info=True
            )
        if progress_callback:
            progress_callback(completed, total_inputs)
    return updated


def _enrich_fallback(
    db_path: str,
    beatport_service: Any,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    delay_seconds: float = DEFAULT_ENRICHMENT_DELAY_SECONDS,
) -> int:
    """Single-threaded fallback: make_search_queries + best_beatport_match (no processor)."""
    from cuepoint.core.matcher import best_beatport_match
    from cuepoint.core.mix_parser import (
        _extract_generic_parenthetical_phrases,
        _parse_mix_flags,
    )
    from cuepoint.core.query_generator import make_search_queries
    from cuepoint.core.text_processing import sanitize_title_for_search

    MIN_ACCEPT_SCORE = 70

    conn = inventory_db.get_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, track_key, artist, title FROM inventory WHERE label IS NULL OR TRIM(label) = ''"
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    total = len(rows)
    updated = 0
    if progress_callback:
        progress_callback(0, total)

    for i, (row_id, _track_key, artist, title) in enumerate(rows):
        try:
            title_str = (title or "").strip()
            artist_str = (artist or "").strip()
            if not title_str:
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            title_for_search = sanitize_title_for_search(title_str).strip()
            queries = make_search_queries(
                title_for_search,
                artist_str,
                original_title=title_str,
            )
            if not queries:
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            input_mix = _parse_mix_flags(title_str)
            input_generic_phrases = _extract_generic_parenthetical_phrases(title_str)
            title_only_mode = not bool(artist_str)

            best, _candidates, _audit, _last_q = best_beatport_match(
                idx=i + 1,
                track_title=title_for_search,
                track_artists_for_scoring=artist_str,
                title_only_mode=title_only_mode,
                queries=queries,
                input_mix=input_mix,
                input_generic_phrases=input_generic_phrases,
            )

            if best and best.score >= MIN_ACCEPT_SCORE and best.label and best.url:
                best_label = (best.label or "").strip() or None
                if best_label:
                    beatport_track_id = _extract_track_id_from_url(best.url)
                    updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    conn = inventory_db.get_connection(db_path)
                    try:
                        cur = conn.cursor()
                        cur.execute(
                            "UPDATE inventory SET label = ?, beatport_track_id = ?, beatport_url = ?, updated_at = ? WHERE id = ?",
                            (
                                best_label,
                                beatport_track_id,
                                best.url,
                                updated_at,
                                row_id,
                            ),
                        )
                        conn.commit()
                        updated += 1
                    finally:
                        conn.close()
        except Exception as e:
            _logger.warning(
                "Enrichment failed for row id=%s: %s", row_id, e, exc_info=True
            )

        if progress_callback:
            progress_callback(i + 1, total)
        time.sleep(delay_seconds)

    return updated
