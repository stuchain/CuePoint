"""Past search history via engine HTTP API (Phase 6 parity)."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from cuepoint.services.output_writer import read_csv_skip_comments
from cuepoint.utils.history_manager import HistoryManager
from cuepoint.utils.paths import AppPaths

_SUFFIX_SKIP = ("_candidates.csv", "_queries.csv", "_review.csv")


def _is_main_results_csv(path: Path) -> bool:
    name = path.name.lower()
    if not name.endswith(".csv"):
        return False
    return not any(name.endswith(suffix) for suffix in _SUFFIX_SKIP)


def _parse_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _needs_review(result: Dict[str, Any]) -> bool:
    score = result.get("match_score")
    artist = (result.get("artist") or "").strip()
    artist_sim = result.get("artist_sim")
    matched = bool(result.get("matched"))
    beatport_url = (result.get("beatport_url") or "").strip()

    if score is not None and score < 70:
        return True
    if artist and artist_sim is not None and artist_sim < 50:
        return True
    if not matched or not beatport_url:
        return True
    return False


def _csv_row_to_track_result(row: Dict[str, str]) -> Dict[str, Any]:
    title = row.get("original_title") or row.get("title") or ""
    artist = row.get("original_artists") or row.get("artist") or ""
    beatport_url = (row.get("beatport_url") or "").strip()
    beatport_title = (row.get("beatport_title") or "").strip()
    match_score = _parse_float(row.get("match_score"))
    matched = bool(beatport_url or beatport_title or (match_score is not None and match_score > 0))
    confidence = (row.get("confidence") or "").strip().lower()
    if confidence not in ("high", "medium", "low"):
        confidence = None

    return {
        "playlist_index": _parse_int(row.get("playlist_index")),
        "title": title,
        "artist": artist,
        "matched": matched,
        "beatport_url": beatport_url or None,
        "beatport_title": beatport_title or None,
        "beatport_artists": (row.get("beatport_artists") or "").strip() or None,
        "beatport_key": (row.get("beatport_key") or "").strip() or None,
        "beatport_key_camelot": (row.get("beatport_key_camelot") or "").strip() or None,
        "beatport_year": (row.get("beatport_year") or "").strip() or None,
        "beatport_bpm": (row.get("beatport_bpm") or "").strip() or None,
        "beatport_label": (row.get("beatport_label") or "").strip() or None,
        "match_score": match_score,
        "title_sim": _parse_float(row.get("title_sim")),
        "artist_sim": _parse_float(row.get("artist_sim")),
        "confidence": confidence,
        "write": False,
    }


def _candidate_row_to_dict(row: Dict[str, str]) -> Dict[str, Any]:
    payload = dict(row)
    final_score = _parse_float(row.get("final_score"))
    match_score = _parse_float(row.get("match_score"))
    if final_score is not None:
        payload["final_score"] = final_score
    if match_score is not None:
        payload["match_score"] = match_score
    title_sim = _parse_float(row.get("title_sim"))
    artist_sim = _parse_float(row.get("artist_sim"))
    if title_sim is not None:
        payload["title_sim"] = title_sim
    if artist_sim is not None:
        payload["artist_sim"] = artist_sim
    return payload


def _load_meta_json(csv_path: Path) -> Optional[Dict[str, Any]]:
    meta_path = csv_path.with_suffix(".meta.json")
    if not meta_path.is_file():
        return None
    try:
        with open(meta_path, encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _related_sidecar_paths(csv_path: Path) -> Dict[str, Optional[str]]:
    base = csv_path.with_suffix("")
    sidecars = {
        "review_csv": base.with_name(f"{base.name}_review.csv"),
        "review_candidates_csv": base.with_name(f"{base.name}_review_candidates.csv"),
        "review_queries_csv": base.with_name(f"{base.name}_review_queries.csv"),
        "candidates_csv": base.with_name(f"{base.name}_candidates.csv"),
    }
    return {
        key: str(path.resolve()) if path.is_file() else None for key, path in sidecars.items()
    }


def _load_candidates_grouped(path: Path) -> Dict[int, List[Dict[str, Any]]]:
    _, rows = read_csv_skip_comments(str(path))
    grouped: Dict[int, List[Dict[str, Any]]] = {}
    for row in rows:
        index = _parse_int(row.get("playlist_index"))
        grouped.setdefault(index, []).append(_candidate_row_to_dict(row))
    return grouped


def _merge_candidates(
    results: List[Dict[str, Any]], grouped: Dict[int, List[Dict[str, Any]]]
) -> None:
    for result in results:
        candidates = grouped.get(result["playlist_index"])
        if candidates:
            result["candidates"] = candidates


def _infer_playlist_name(csv_path: Path, first_row: Dict[str, str]) -> str:
    playlist_name = (first_row.get("playlist_name") or first_row.get("playlist") or "").strip()
    if playlist_name:
        return playlist_name
    basename = csv_path.name
    if "(" in basename:
        return basename[: basename.rfind("(")].strip()
    return csv_path.stem


def _resolve_rerun(
    csv_path: Path,
    meta: Optional[Dict[str, Any]],
    first_row: Dict[str, str],
) -> Dict[str, Any]:
    source = "collection"
    xml_path = ""
    playlist_name = ""
    m3u_path = ""

    if meta:
        source = str(meta.get("source") or "collection")
        xml_path = str(meta.get("xml_path") or "").strip()
        playlist_name = str(meta.get("playlist_name") or "").strip()
        m3u_path = str(meta.get("m3u_path") or "").strip()

    if source != "playlist_file":
        if not xml_path:
            xml_path = (
                first_row.get("xml_file_path")
                or first_row.get("source_file")
                or first_row.get("xml_path")
                or ""
            ).strip()
        if not playlist_name:
            playlist_name = _infer_playlist_name(csv_path, first_row)

    can_rerun = False
    if source == "playlist_file" and m3u_path:
        can_rerun = os.path.isfile(m3u_path)
    elif xml_path and playlist_name:
        can_rerun = os.path.isfile(xml_path)

    return {
        "source": source,
        "xml_path": xml_path or None,
        "playlist_name": playlist_name or None,
        "m3u_path": m3u_path or None,
        "xml_exists": bool(xml_path and os.path.isfile(xml_path)),
        "m3u_exists": bool(m3u_path and os.path.isfile(m3u_path)),
        "can_rerun": can_rerun,
    }


def list_recent_history(max_files: int = 50) -> Dict[str, Any]:
    """List recent main-result CSV exports (newest first)."""
    exports_dir = AppPaths.exports_dir()
    files: List[Dict[str, Any]] = []

    for path in HistoryManager.get_recent_files(max_files=max_files):
        if not _is_main_results_csv(path):
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        meta = _load_meta_json(path)
        playlist_name = None
        if meta:
            playlist_name = meta.get("playlist_name") or meta.get("m3u_path")
        files.append(
            {
                "file_path": str(path.resolve()),
                "file_name": path.name,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size_bytes": stat.st_size,
                "playlist_name": playlist_name,
            }
        )

    return {
        "directory": str(exports_dir),
        "files": files,
        "count": len(files),
    }


def load_history_csv(csv_path: str) -> Dict[str, Any]:
    """Load a past search CSV and return summary + TrackResult-shaped rows."""
    path = Path(csv_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"CSV not found: {path}")
    if not _is_main_results_csv(path):
        raise ValueError("Not a main results CSV file")

    fieldnames, rows = read_csv_skip_comments(str(path))
    results = [_csv_row_to_track_result(row) for row in rows]
    matched_count = sum(1 for row in results if row["matched"])
    meta = _load_meta_json(path)
    first_row = rows[0] if rows else {}
    related_files = _related_sidecar_paths(path)
    rerun = _resolve_rerun(path, meta, first_row)

    candidate_source = related_files.get("review_candidates_csv") or related_files.get(
        "candidates_csv"
    )
    if candidate_source:
        grouped = _load_candidates_grouped(Path(candidate_source))
        _merge_candidates(results, grouped)

    review_indices: Set[int] = {row["playlist_index"] for row in results if _needs_review(row)}
    review_count = len(review_indices)

    return {
        "file_path": str(path),
        "file_name": path.name,
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
        "row_count": len(rows),
        "matched_count": matched_count,
        "unmatched_count": len(rows) - matched_count,
        "review_count": review_count,
        "fieldnames": fieldnames,
        "results": results,
        "meta": meta,
        "related_files": related_files,
        "rerun": rerun,
    }
