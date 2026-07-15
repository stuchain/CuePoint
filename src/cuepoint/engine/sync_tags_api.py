"""Sync Beatport tags to audio files via engine HTTP API (Phase 6 parity)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.data.rekordbox import (
    get_track_locations,
    write_key_comment_year_to_playlist_tracks,
    write_key_comment_year_to_playlist_tracks_batch,
    write_tags_to_paths,
)
from cuepoint.models.result import TrackResult

_services_bootstrapped = False

_VALID_KEY_FORMATS = ("normal", "camelot", "short")


def _ensure_services() -> None:
    global _services_bootstrapped
    if _services_bootstrapped:
        return
    from cuepoint.services.bootstrap import bootstrap_services

    bootstrap_services()
    _services_bootstrapped = True


def parse_sync_tags_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


def _normalize_sync_options(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    opts = raw if isinstance(raw, dict) else {}
    key_format = str(opts.get("key_format") or "normal").strip().lower()
    if key_format not in _VALID_KEY_FORMATS:
        key_format = "normal"
    comment_text = str(opts.get("comment_text") or "ok").strip() or "ok"
    return {
        "key_format": key_format,
        "write_key": bool(opts.get("write_key", True)),
        "write_year": bool(opts.get("write_year", True)),
        "write_bpm": bool(opts.get("write_bpm", False)),
        "write_label": bool(opts.get("write_label", True)),
        "write_genre": bool(opts.get("write_genre", False)),
        "write_comment": bool(opts.get("write_comment", True)),
        "comment_text": comment_text,
    }


def _dict_to_track_result(item: Dict[str, Any]) -> TrackResult:
    payload = dict(item)
    if "original_title" not in payload and "title" in payload:
        payload["original_title"] = payload["title"]
    if "original_artists" not in payload and "artist" in payload:
        payload["original_artists"] = payload["artist"]
    return TrackResult.from_dict(payload)


def _parse_results(raw: Any) -> List[TrackResult]:
    if not isinstance(raw, list):
        raise ValueError("results must be a non-empty array")
    if not raw:
        raise ValueError("Select at least one track to sync")
    return [_dict_to_track_result(item) for item in raw if isinstance(item, dict)]


def _parse_batch_results(raw: Any) -> Dict[str, List[TrackResult]]:
    if not isinstance(raw, dict) or not raw:
        raise ValueError("batch_results must be a non-empty object")
    parsed: Dict[str, List[TrackResult]] = {}
    for playlist_name, rows in raw.items():
        if not isinstance(rows, list) or not rows:
            continue
        parsed[str(playlist_name)] = [
            _dict_to_track_result(item) for item in rows if isinstance(item, dict)
        ]
    if not parsed:
        raise ValueError("batch_results contains no tracks")
    return parsed


def _result_payload(
    written: int,
    failed: int,
    errors: List[str],
    wav_skipped: List[str],
) -> Dict[str, Any]:
    return {
        "written": written,
        "failed": failed,
        "errors": errors[:50],
        "errors_truncated": len(errors) > 50,
        "wav_skipped": wav_skipped[:50],
        "wav_skipped_count": len(wav_skipped),
    }


def run_sync_tags(body: Dict[str, Any]) -> Dict[str, Any]:
    """Write selected tags to audio files (M3U paths or Rekordbox XML locations)."""
    _ensure_services()

    sync_options = _normalize_sync_options(body.get("sync_options"))
    source = str(body.get("source") or "collection").strip().lower()
    mode = str(body.get("mode") or "single").strip().lower()

    if source == "playlist_file" or mode == "paths":
        results = _parse_results(body.get("results"))
        if not any(getattr(r, "file_path", None) for r in results):
            raise ValueError("M3U sync requires file_path on result rows")
        written, failed, errors, wav_skipped = write_tags_to_paths(results, sync_options=sync_options)
        return _result_payload(written, failed, errors, wav_skipped)

    xml_path = str(body.get("xml_path") or "").strip()
    if not xml_path:
        raise ValueError("xml_path is required for collection sync")

    try:
        locations = get_track_locations(xml_path)
    except (ValueError, FileNotFoundError) as exc:
        raise ValueError(f"Could not read XML: {exc}") from exc
    if not locations:
        raise ValueError(
            "No file paths in this XML. Rekordbox export must include file paths (Location)."
        )

    if mode == "batch":
        batch_results = _parse_batch_results(body.get("batch_results"))
        written, failed, errors, wav_skipped = write_key_comment_year_to_playlist_tracks_batch(
            xml_path,
            batch_results,
            sync_options=sync_options,
        )
        return _result_payload(written, failed, errors, wav_skipped)

    results = _parse_results(body.get("results"))
    playlist_name = str(body.get("playlist_name") or "Playlist").strip() or "Playlist"
    try:
        written, failed, errors, wav_skipped = write_key_comment_year_to_playlist_tracks(
            xml_path,
            playlist_name,
            results,
            sync_options=sync_options,
        )
    except ValueError as exc:
        raise ValueError(f"Playlist not found in XML: {exc}") from exc
    return _result_payload(written, failed, errors, wav_skipped)
