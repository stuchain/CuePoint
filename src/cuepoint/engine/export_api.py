"""Export results via engine HTTP API (Phase 3 P1)."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from cuepoint.engine.jobs import JobStore
from cuepoint.models.result import TrackResult as ModelTrackResult
from cuepoint.compat.export_controller import ExportController

_services_bootstrapped = False


def _ensure_services() -> None:
    global _services_bootstrapped
    if _services_bootstrapped:
        return
    from cuepoint.services.bootstrap import bootstrap_services

    bootstrap_services()
    _services_bootstrapped = True


def parse_export_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Request body required")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


def _dict_to_track_result(item: Dict[str, Any]) -> ModelTrackResult:
    title = str(item.get("title") or "Unknown")
    artist = str(item.get("artist") or "Unknown")
    return ModelTrackResult(
        playlist_index=int(item.get("playlist_index") or 0),
        title=title,
        artist=artist,
        matched=bool(item.get("matched", False)),
        beatport_url=item.get("beatport_url"),
        beatport_title=item.get("beatport_title"),
        beatport_artists=item.get("beatport_artists"),
        beatport_key=item.get("beatport_key"),
        beatport_key_camelot=item.get("beatport_key_camelot"),
        beatport_year=item.get("beatport_year"),
        beatport_bpm=item.get("beatport_bpm"),
        beatport_label=item.get("beatport_label"),
        match_score=item.get("match_score"),
        confidence=item.get("confidence"),
    )


def resolve_export_results(
    body: Dict[str, Any], job_store: JobStore
) -> List[ModelTrackResult]:
    job_id = body.get("job_id")
    if job_id:
        job = job_store.get(str(job_id))
        if job is None:
            raise ValueError(f"Job {job_id} not found")
        if not job.results:
            raise ValueError("Job has no results to export")
        return [
            _dict_to_track_result(
                {
                    "playlist_index": r.playlist_index,
                    "title": r.title,
                    "artist": r.artist,
                    "matched": r.matched,
                    "beatport_title": r.beatport_title,
                    "beatport_artists": r.beatport_artists,
                    "beatport_key": r.beatport_key,
                    "beatport_key_camelot": r.beatport_key_camelot,
                    "beatport_year": r.beatport_year,
                    "beatport_bpm": r.beatport_bpm,
                    "beatport_label": r.beatport_label,
                    "match_score": r.match_score,
                    "confidence": r.confidence,
                    "beatport_url": getattr(r, "beatport_url", None),
                }
            )
            for r in job.results
        ]

    raw_results = body.get("results")
    if not isinstance(raw_results, list) or not raw_results:
        raise ValueError("Provide job_id or a non-empty results array")
    return [_dict_to_track_result(item) for item in raw_results]


def run_export(body: Dict[str, Any], job_store: JobStore) -> Dict[str, Any]:
    _ensure_services()
    from cuepoint.services.interfaces import IExportService
    from cuepoint.utils.di_container import get_container

    format_raw = str(body.get("format", "csv")).lower()
    if format_raw == "xlsx":
        format_type = "excel"
    else:
        format_type = format_raw

    file_path = body.get("file_path")
    if not file_path or not str(file_path).strip():
        raise ValueError("file_path is required")

    options = {
        "format": format_type,
        "file_path": str(file_path),
        "playlist_name": body.get("playlist_name", "playlist"),
        "overwrite": bool(body.get("overwrite", False)),
        "delimiter": body.get("delimiter", ","),
        "compress": bool(body.get("compress", False)),
    }

    controller = ExportController()
    is_valid, error_message = controller.validate_export_options(options)
    if not is_valid:
        raise ValueError(error_message or "Invalid export options")

    results = resolve_export_results(body, job_store)
    export_service = get_container().resolve(IExportService)

    if format_type == "csv":
        export_service.export_to_csv(
            results,
            options["file_path"],
            delimiter=options["delimiter"],
            overwrite=options["overwrite"],
        )
    elif format_type == "json":
        export_service.export_to_json(
            results,
            options["file_path"],
            overwrite=options["overwrite"],
        )
    elif format_type == "excel":
        export_service.export_to_excel(
            results,
            options["file_path"],
            overwrite=options["overwrite"],
        )
    else:
        raise ValueError(f"Unsupported export format: {format_raw}")

    return {
        "file_path": options["file_path"],
        "format": format_type,
        "count": len(results),
    }
