#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integrity Service - Data Integrity and Auditability (Step 9)

Design 09: Schema validation, checksums, audit logs, and verification.
Ensures outputs are correct, traceable, and safe to re-import.
"""

import csv
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.result import TrackResult

# Schema version for output files (Design 9.5, 9.11)
SCHEMA_VERSION = 1

# Integrity error codes (Design 9.29, 9.111)
D001_MISSING_COLUMN = "D001"
D002_CHECKSUM_MISMATCH = "D002"
D003_SCHEMA_VERSION_MISMATCH = "D003"
D004_OUTPUT_PATH_INVALID = "D004"
D005_AUDIT_LOG_MISSING = "D005"
D006_BACKUP_MISSING = "D006"

# Required columns for main CSV (Design 9.82)
MAIN_CSV_REQUIRED_COLUMNS = [
    "playlist_index",
    "original_title",
    "original_artists",
    "beatport_title",
    "beatport_artists",
    "beatport_key",
    "beatport_key_camelot",
    "beatport_year",
    "beatport_bpm",
    "beatport_url",
    "title_sim",
    "artist_sim",
    "match_score",
    "confidence",
    "search_query_index",
    "search_stop_query_index",
    "candidate_index",
]

# Optional metadata columns
MAIN_CSV_OPTIONAL_COLUMNS = [
    "beatport_label",
    "beatport_genres",
    "beatport_release",
    "beatport_release_date",
    "beatport_track_id",
]

# Audit log compression threshold (Design 9.23, 9.147)
AUDIT_LOG_COMPRESS_THRESHOLD_BYTES = 50 * 1024 * 1024  # 50 MB

# Max backups to keep (Design 9.63)
MAX_BACKUPS = 3


def generate_run_id() -> str:
    """Generate a unique run ID (Design 9.15).

    Returns:
        Run ID string in format YYYYMMDDTHHMMSS_abc123
    """
    from cuepoint.utils.run_context import get_current_run_id

    existing = get_current_run_id()
    if existing:
        return existing
    time_part = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    import uuid

    return f"{time_part}_{uuid.uuid4().hex[:6]}"


def _escape_csv_injection(value: str) -> str:
    """Escape CSV injection characters (Design 9.144, 9.145)."""
    if not value or not isinstance(value, str):
        return value or ""
    if value.strip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def validate_output_path(path: str) -> Tuple[bool, Optional[str]]:
    """Validate output path and reject path traversal (Design 9.53, 9.54).

    Args:
        path: Path to validate.

    Returns:
        Tuple of (is_valid, error_message).
    """
    try:
        abs_path = os.path.abspath(path)
        if ".." in path or path.startswith(".."):
            return False, f"D004: Output path invalid - path traversal not allowed: {path}"
        if os.path.exists(abs_path) and not os.path.isfile(abs_path) and not os.path.isdir(abs_path):
            return False, f"D004: Output path invalid: {path}"
        return True, None
    except Exception as e:
        return False, f"D004: Output path invalid: {e}"


def validate_main_csv_schema(headers: List[str], include_metadata: bool = True) -> Tuple[bool, Optional[str]]:
    """Validate main CSV schema (Design 9.43, 9.44).

    Args:
        headers: List of column headers from CSV.
        include_metadata: Whether metadata columns are expected.

    Returns:
        Tuple of (is_valid, error_message).
    """
    required = list(MAIN_CSV_REQUIRED_COLUMNS)
    if include_metadata:
        required = required + MAIN_CSV_OPTIONAL_COLUMNS

    for col in required:
        if col not in headers:
            return False, f"D001: Missing required column: {col}"

    # Check for empty header fields
    if any(not h or not h.strip() for h in headers):
        return False, "D001: Empty header fields not allowed"

    return True, None


def compute_sha256(filepath: str) -> str:
    """Compute SHA256 checksum of file (Design 9.18, 9.166).

    Uses streaming for large files.

    Args:
        filepath: Path to file.

    Returns:
        Hex digest of SHA256 checksum.
    """
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def write_checksum_file(filepath: str, checksum: str) -> str:
    """Write .sha256 file alongside output (Design 9.18, 9.19).

    Args:
        filepath: Path to main file.
        checksum: SHA256 hex digest.

    Returns:
        Path to .sha256 file.
    """
    sha_path = filepath + ".sha256"
    basename = os.path.basename(filepath)
    with open(sha_path, "w", encoding="utf-8") as f:
        f.write(f"{checksum}  {basename}\n")
    return sha_path


def verify_checksum(filepath: str) -> Tuple[bool, Optional[str]]:
    """Verify file against stored checksum (Design 9.97).

    Args:
        filepath: Path to file to verify.

    Returns:
        Tuple of (is_valid, error_message).
    """
    sha_path = filepath + ".sha256"
    if not os.path.exists(sha_path):
        return True, None  # No checksum file - skip verification

    try:
        with open(sha_path, "r", encoding="utf-8") as f:
            line = f.read().strip()
        parts = line.split(None, 1)
        if len(parts) < 1:
            return False, "D002: Checksum file malformed"
        stored_checksum = parts[0]
        computed = compute_sha256(filepath)
        if computed != stored_checksum:
            return False, f"D002: Checksum mismatch for {os.path.basename(filepath)}"
        return True, None
    except OSError as e:
        return False, f"D002: Could not read checksum file: {e}"


def result_to_audit_entry(result: TrackResult) -> Dict[str, Any]:
    """Convert TrackResult to audit log entry (Design 9.88, 9.89, 9.90, 9.91).

    Args:
        result: TrackResult to convert.

    Returns:
        Dictionary for JSONL audit log.
    """
    track_id = f"trk_{result.playlist_index:06d}"
    score = float(result.match_score) if result.match_score is not None else 0.0
    # Clamp score to 0.0-1.0 for audit (Design 9.92)
    score = max(0.0, min(1.0, score / 100.0 if score > 1.0 else score))

    query_str = ""
    if result.queries_data:
        first_q = result.queries_data[0]
        query_str = first_q.get("query", "") if isinstance(first_q, dict) else ""
    entry: Dict[str, Any] = {
        "track_id": track_id,
        "title": result.title,
        "artist": result.artist or "",
        "query": query_str,
        "score": round(score, 4),
    }

    if result.matched and result.beatport_title:
        entry["candidate_title"] = result.beatport_title
        if result.beatport_url:
            # Redact full URLs to avoid storing PII (Design 9.55)
            entry["candidate_url"] = result.beatport_url[:80] + "..." if len(result.beatport_url) > 80 else result.beatport_url
    if result.confidence:
        entry["confidence"] = result.confidence
    if result.error:
        entry["guard_reason"] = result.error

    return entry


def write_audit_log(
    results: List[TrackResult],
    filepath: str,
    run_id: str,
    run_status: str = "complete",
    compress: bool = False,
) -> Optional[str]:
    """Write audit log as JSONL (Design 9.22, 9.88).

    Args:
        results: List of TrackResult objects.
        filepath: Path for audit log file.
        run_id: Run ID for traceability.
        run_status: complete or partial.
        compress: Whether to gzip (if large).

    Returns:
        Path to written audit log, or None.
    """
    if not results:
        return None

    entries = []
    for result in results:
        entry = result_to_audit_entry(result)
        entries.append(entry)

    # Header line (Design 9.47)
    header = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "run_status": run_status,
        "track_count": len(results),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    base_path = filepath
    if compress:
        filepath = filepath + ".gz"
        import gzip

        with gzip.open(filepath, "wt", encoding="utf-8") as f:
            f.write(json.dumps(header, ensure_ascii=False) + "\n")
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(json.dumps(header, ensure_ascii=False) + "\n")
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # Compress if over threshold (Design 9.147)
    if not compress and os.path.getsize(filepath) > AUDIT_LOG_COMPRESS_THRESHOLD_BYTES:
        try:
            import gzip

            with open(filepath, "rb") as f_in:
                with gzip.open(filepath + ".gz", "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
            os.unlink(filepath)
            filepath = filepath + ".gz"
        except OSError:
            pass

    return filepath


def create_backup(filepath: str, max_backups: int = MAX_BACKUPS) -> Optional[str]:
    """Create .bak backup of file (Design 9.17, 9.63).

    Rotates existing backups. Keeps last max_backups.

    Args:
        filepath: Path to file to backup.
        max_backups: Maximum number of backups to keep.

    Returns:
        Path to backup file, or None if backup failed.
    """
    if not os.path.exists(filepath) or not os.path.isfile(filepath):
        return None

    base = filepath
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak_path = f"{base}.{timestamp}.bak"

    try:
        shutil.copy2(filepath, bak_path)

        # Rotate old backups
        parent = os.path.dirname(filepath)
        base_name = os.path.basename(filepath)
        backups = sorted(
            [
                os.path.join(parent, f)
                for f in os.listdir(parent or ".")
                if f.startswith(base_name) and f.endswith(".bak")
            ],
            key=lambda p: os.path.getmtime(p),
            reverse=True,
        )
        for old in backups[max_backups:]:
            try:
                os.unlink(old)
            except OSError:
                pass

        return bak_path
    except OSError:
        return None


def get_csv_header_lines(schema_version: int, run_id: str, run_status: str = "complete") -> List[str]:
    """Get comment header lines for CSV files (Design 9.86, 9.87, 9.128).

    Args:
        schema_version: Schema version number.
        run_id: Run ID for traceability.
        run_status: complete or partial.

    Returns:
        List of header lines (e.g. # schema_version=1).
    """
    return [
        f"# schema_version={schema_version}",
        f"# run_id={run_id}",
        f"# run_status={run_status}",
    ]


def verify_outputs(
    output_dir: str,
    main_csv_path: Optional[str] = None,
    checksums: bool = True,
    schema: bool = True,
) -> Tuple[bool, List[str]]:
    """Verify output files (Design 9.58, 9.97, 9.98, 9.99).

    Args:
        output_dir: Directory containing outputs.
        main_csv_path: Optional path to main CSV (if None, finds first *_*.csv).
        checksums: Whether to verify checksums.
        schema: Whether to validate schema.

    Returns:
        Tuple of (all_passed, list of error messages).
    """
    errors: List[str] = []
    output_dir = os.path.abspath(output_dir)

    if main_csv_path:
        main_path = main_csv_path
    else:
        # Find main CSV
        candidates = [
            os.path.join(output_dir, f)
            for f in os.listdir(output_dir)
            if f.endswith(".csv") and "_candidates" not in f and "_queries" not in f and "_review" not in f
        ]
        if not candidates:
            errors.append("D005: No main CSV found in output directory")
            return False, errors
        main_path = candidates[0]

    if not os.path.exists(main_path):
        errors.append(f"D005: Main CSV not found: {main_path}")
        return False, errors

    # Schema validation
    if schema:
        try:
            with open(main_path, "r", newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)
            headers = []
            for row in rows:
                if row and row[0].startswith("#"):
                    continue
                headers = row
                break
            if headers:
                valid, err = validate_main_csv_schema(headers, include_metadata=True)
                if not valid and err:
                    # Also try without metadata (optional columns)
                    valid, err = validate_main_csv_schema(headers, include_metadata=False)
                if not valid and err:
                    errors.append(err)
                # Design 9.149: Re-import validation
                valid_reimport, err_reimport = validate_reimport_readiness(headers)
                if not valid_reimport and err_reimport:
                    errors.append(err_reimport)
        except Exception as e:
            errors.append(f"D001: Schema validation failed: {e}")

    # Checksum verification
    if checksums:
        valid, err = verify_checksum(main_path)
        if not valid and err:
            errors.append(err)

    return len(errors) == 0, errors


# Rekordbox re-import required columns (Design 9.149, 9.150)
REKORDBOX_REIMPORT_REQUIRED = ["original_title", "original_artists", "playlist_index"]


def validate_reimport_readiness(headers: List[str]) -> Tuple[bool, Optional[str]]:
    """Validate that output CSV has columns needed for Rekordbox re-import (Design 9.149).

    Args:
        headers: List of column names from main CSV.

    Returns:
        Tuple of (is_valid, error_message).
    """
    for col in REKORDBOX_REIMPORT_REQUIRED:
        if col not in headers:
            return False, f"D001: Missing re-import column: {col} (required for Rekordbox)"
    return True, None


def _recommended_actions_for_unmatched(result: TrackResult) -> List[str]:
    """Return recommended actions for an unmatched track (Design 9: explicit unmatched handling)."""
    actions = []
    if not result.queries_data or not any(
        q.get("candidates", 0) > 0 for q in result.queries_data if isinstance(q, dict)
    ):
        actions.append("No search results found. Try manual Beatport search.")
    actions.append("Verify artist and title spelling.")
    actions.append("Track may not be available on Beatport.")
    if result.artist and result.artist.strip():
        actions.append("Try searching with artist name only.")
    return actions


def write_summary_report(
    results: List[TrackResult],
    output_path: str,
    run_id: str,
    output_files: Dict[str, str],
) -> str:
    """Write summary report with match confidence distribution and unmatched handling (Design 9).

    Args:
        results: List of TrackResult objects.
        output_path: Path for summary JSON file.
        run_id: Run ID for traceability.
        output_files: Dict of file type to path.

    Returns:
        Path to written summary report.
    """
    total = len(results)
    matched = sum(1 for r in results if r.matched)
    unmatched = total - matched

    # Confidence distribution (high >= 90, medium 70-89, low < 70)
    high = sum(1 for r in results if (r.match_score or 0) >= 90)
    medium = sum(1 for r in results if 70 <= (r.match_score or 0) < 90)
    low = sum(1 for r in results if (r.match_score or 0) < 70 or not r.matched)

    # Unmatched with recommended actions
    unmatched_entries = []
    for r in results:
        if not r.matched:
            unmatched_entries.append({
                "playlist_index": r.playlist_index,
                "title": r.title,
                "artist": r.artist or "",
                "recommended_actions": _recommended_actions_for_unmatched(r),
            })

    report = {
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "summary": {
            "total_tracks": total,
            "matched": matched,
            "unmatched": unmatched,
            "confidence_distribution": {
                "high": high,
                "medium": medium,
                "low": low,
            },
        },
        "unmatched_tracks": unmatched_entries,
        "output_files": output_files,
    }

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return output_path


def generate_diff_report(
    results: List[TrackResult],
    output_path: str,
    run_id: str,
) -> str:
    """Generate diff report comparing input vs output metadata (Design 9.151, 9.152).

    Args:
        results: List of TrackResult objects.
        output_path: Path for diff report file.
        run_id: Run ID for traceability.

    Returns:
        Path to written diff report.
    """
    diffs = []
    for r in results:
        entry = {
            "playlist_index": r.playlist_index,
            "input": {"title": r.title, "artist": r.artist or ""},
            "output": {},
            "changes": [],
        }
        if r.matched:
            entry["output"] = {
                "title": r.beatport_title or "",
                "artist": r.beatport_artists or "",
                "bpm": r.beatport_bpm or "",
                "key": r.beatport_key or "",
                "year": r.beatport_year or "",
            }
            if r.title != (r.beatport_title or ""):
                entry["changes"].append(f"Title: {r.title} -> {r.beatport_title or ''}")
            if (r.artist or "") != (r.beatport_artists or ""):
                entry["changes"].append(f"Artist: {r.artist or ''} -> {r.beatport_artists or ''}")
            if r.beatport_bpm:
                entry["changes"].append(f"BPM: (empty) -> {r.beatport_bpm}")
            if r.beatport_key:
                entry["changes"].append(f"Key: (empty) -> {r.beatport_key}")
        else:
            entry["changes"].append("No match found")
        diffs.append(entry)

    report = {
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "track_count": len(results),
        "diffs": diffs,
    }

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return output_path
