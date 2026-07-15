"""In-memory match jobs for engine HTTP API (Phase 3 P0)."""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from cuepoint.ui.gui_interface import ProgressInfo, TrackResult

_services_bootstrapped = False
_bootstrap_lock = threading.Lock()


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def progress_to_dict(progress: ProgressInfo) -> Dict[str, Any]:
    return {
        "completed_tracks": progress.completed_tracks,
        "total_tracks": progress.total_tracks,
        "matched_count": progress.matched_count,
        "unmatched_count": progress.unmatched_count,
        "current_track": progress.current_track,
        "elapsed_time": progress.elapsed_time,
        "eta_seconds": progress.eta_seconds,
        "status_message": progress.status_message,
        "reliability_state": progress.reliability_state,
        "percentage": getattr(progress, "percentage", 0.0),
    }


def track_result_to_dict(result: TrackResult) -> Dict[str, Any]:
    return {
        "playlist_index": result.playlist_index,
        "title": result.title,
        "artist": result.artist,
        "matched": result.matched,
        "beatport_title": result.beatport_title,
        "beatport_artists": result.beatport_artists,
        "beatport_key": result.beatport_key,
        "beatport_key_camelot": result.beatport_key_camelot,
        "beatport_year": result.beatport_year,
        "beatport_bpm": result.beatport_bpm,
        "beatport_label": result.beatport_label,
        "match_score": result.match_score,
        "confidence": result.confidence,
        "write": False,
    }


@dataclass
class MatchJob:
    id: str
    state: JobState = JobState.QUEUED
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    progress: Optional[ProgressInfo] = None
    results: List[TrackResult] = field(default_factory=list)
    error: Optional[Dict[str, str]] = None
    demo: bool = False

    def to_status_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "state": self.state.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "demo": self.demo,
        }
        if self.progress is not None:
            payload["progress"] = progress_to_dict(self.progress)
        if self.error is not None:
            payload["error"] = self.error
        return payload


class JobStore:
    """Thread-safe job registry."""

    def __init__(self) -> None:
        self._jobs: Dict[str, MatchJob] = {}
        self._lock = threading.Lock()

    def create_match_job(
        self,
        *,
        xml_path: Optional[str],
        playlist_name: Optional[str],
        demo: bool,
        runner: Callable[[MatchJob], None],
    ) -> MatchJob:
        job = MatchJob(id=str(uuid.uuid4()), demo=demo)
        with self._lock:
            self._jobs[job.id] = job

        thread = threading.Thread(
            target=self._run_job,
            args=(job, runner),
            daemon=True,
            name=f"match-job-{job.id[:8]}",
        )
        thread.start()
        return job

    def get(self, job_id: str) -> Optional[MatchJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def _run_job(self, job: MatchJob, runner: Callable[[MatchJob], None]) -> None:
        self._update(job, state=JobState.RUNNING)
        try:
            runner(job)
            if job.state not in (JobState.FAILED, JobState.SUCCEEDED):
                self._update(job, state=JobState.SUCCEEDED)
        except Exception as exc:  # noqa: BLE001 — surface to API client
            self._update(
                job,
                state=JobState.FAILED,
                error={"code": "JOB_FAILED", "message": str(exc)},
            )

    def _update(
        self,
        job: MatchJob,
        *,
        state: Optional[JobState] = None,
        progress: Optional[ProgressInfo] = None,
        results: Optional[List[TrackResult]] = None,
        error: Optional[Dict[str, str]] = None,
    ) -> None:
        with self._lock:
            if state is not None:
                job.state = state
            if progress is not None:
                job.progress = progress
            if results is not None:
                job.results = results
            if error is not None:
                job.error = error
            job.updated_at = _utc_now()


def _ensure_services() -> None:
    global _services_bootstrapped
    with _bootstrap_lock:
        if _services_bootstrapped:
            return
        from cuepoint.services.bootstrap import bootstrap_services

        bootstrap_services()
        _services_bootstrapped = True


def run_demo_match_job(job: MatchJob, store: JobStore) -> None:
    """Simulated match for Electron dev without XML."""
    total = 5
    results: List[TrackResult] = []
    for i in range(1, total + 1):
        time.sleep(0.05)
        progress = ProgressInfo(
            completed_tracks=i,
            total_tracks=total,
            matched_count=i - 1,
            unmatched_count=1,
            status_message=f"Processing track {i}/{total}",
            reliability_state="running",
        )
        store._update(job, progress=progress)
        results.append(
            TrackResult(
                playlist_index=i,
                title=f"Demo Track {i}",
                artist="Demo Artist",
                matched=i % 2 == 0,
                beatport_title=f"Beatport Demo {i}" if i % 2 == 0 else None,
                beatport_artists="BP Artist" if i % 2 == 0 else None,
                match_score=88.0 if i % 2 == 0 else None,
                confidence="high" if i % 2 == 0 else "low",
            )
        )
    store._update(
        job,
        progress=ProgressInfo(
            completed_tracks=total,
            total_tracks=total,
            matched_count=2,
            unmatched_count=3,
            status_message="Complete",
            reliability_state="completed",
        ),
        results=results,
        state=JobState.SUCCEEDED,
    )


def run_real_match_job(
    job: MatchJob,
    store: JobStore,
    xml_path: str,
    playlist_name: str,
) -> None:
    _ensure_services()
    from cuepoint.services.interfaces import IProcessorService
    from cuepoint.ui.gui_interface import ProcessingController
    from cuepoint.utils.di_container import get_container

    processor = get_container().resolve(IProcessorService)
    controller = ProcessingController()

    def on_progress(info: ProgressInfo) -> None:
        store._update(job, progress=info)

    results = processor.process_playlist_from_xml(
        xml_path,
        playlist_name,
        progress_callback=on_progress,
        controller=controller,
    )
    store._update(
        job,
        results=results,
        progress=ProgressInfo(
            completed_tracks=len(results),
            total_tracks=len(results),
            matched_count=sum(1 for r in results if r.matched),
            unmatched_count=sum(1 for r in results if not r.matched),
            status_message="Complete",
            reliability_state="completed",
        ),
        state=JobState.SUCCEEDED,
    )


def parse_match_job_body(raw: bytes) -> Dict[str, Any]:
    if not raw:
        return {"demo": True}
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON body") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


def start_match_job(store: JobStore, body: Dict[str, Any]) -> MatchJob:
    demo = bool(body.get("demo", False))
    xml_path = body.get("xml_path")
    playlist_name = body.get("playlist_name")

    if demo or not xml_path or not playlist_name:
        return store.create_match_job(
            xml_path=xml_path,
            playlist_name=playlist_name,
            demo=True,
            runner=lambda job: run_demo_match_job(job, store),
        )

    def runner(job: MatchJob) -> None:
        run_real_match_job(job, store, str(xml_path), str(playlist_name))

    return store.create_match_job(
        xml_path=str(xml_path),
        playlist_name=str(playlist_name),
        demo=False,
        runner=runner,
    )
