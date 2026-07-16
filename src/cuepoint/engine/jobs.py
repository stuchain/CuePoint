"""In-memory match jobs for engine HTTP API (Phase 3 P0)."""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from cuepoint.compat.gui_types import ProgressInfo, TrackResult

_services_bootstrapped = False
_bootstrap_lock = threading.Lock()


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


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
    payload: Dict[str, Any] = {
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
        "beatport_url": result.beatport_url,
        "match_score": result.match_score,
        "title_sim": result.title_sim,
        "artist_sim": result.artist_sim,
        "confidence": result.confidence,
        "write": False,
    }
    if result.candidates:
        payload["candidates"] = result.candidates
    file_path = getattr(result, "file_path", None)
    if file_path:
        payload["file_path"] = file_path
    return payload


def _demo_candidates(track_num: int, *, primary_score: float = 88.0) -> List[Dict[str, Any]]:
    """Sample candidate rows for Electron dev and tests."""
    return [
        {
            "candidate_title": f"Beatport Demo {track_num}",
            "candidate_artists": "BP Artist",
            "candidate_url": f"https://www.beatport.com/track/demo/{track_num}",
            "candidate_key": "Am",
            "candidate_key_camelot": "8A",
            "candidate_year": "2020",
            "candidate_bpm": "128",
            "candidate_label": "Demo Records",
            "final_score": primary_score,
            "match_score": primary_score,
            "title_sim": 95.0,
            "artist_sim": 90.0,
        },
        {
            "candidate_title": f"Alt Demo {track_num}",
            "candidate_artists": "Other Artist",
            "candidate_url": f"https://www.beatport.com/track/alt/{track_num}",
            "candidate_key": "Em",
            "candidate_key_camelot": "9A",
            "candidate_year": "2019",
            "candidate_bpm": "126",
            "candidate_label": "Alt Label",
            "final_score": 72.0,
            "match_score": 72.0,
            "title_sim": 80.0,
            "artist_sim": 65.0,
        },
    ]


@dataclass
class MatchJob:
    id: str
    state: JobState = JobState.QUEUED
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    progress: Optional[ProgressInfo] = None
    results: List[TrackResult] = field(default_factory=list)
    batch_results: Dict[str, List[TrackResult]] = field(default_factory=dict)
    error: Optional[Dict[str, str]] = None
    demo: bool = False
    cancel_requested: bool = False

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
        self._controllers: Dict[str, Any] = {}

    def register_controller(self, job_id: str, controller: Any) -> None:
        with self._lock:
            self._controllers[job_id] = controller

    def unregister_controller(self, job_id: str) -> None:
        with self._lock:
            self._controllers.pop(job_id, None)

    def request_cancel(self, job_id: str) -> MatchJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job.state in (
                JobState.SUCCEEDED,
                JobState.FAILED,
                JobState.CANCELLED,
            ):
                return job
            job.cancel_requested = True
            job.updated_at = _utc_now()
            controller = self._controllers.get(job_id)
        if controller is not None:
            controller.cancel()
        return job

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
            with self._lock:
                if job.state in (
                    JobState.FAILED,
                    JobState.SUCCEEDED,
                    JobState.CANCELLED,
                ):
                    return
                if job.cancel_requested:
                    self._update(
                        job,
                        state=JobState.CANCELLED,
                        error={
                            "code": "JOB_CANCELLED",
                            "message": "Cancelled by user",
                        },
                    )
                    return
            if job.state not in (JobState.FAILED, JobState.SUCCEEDED):
                self._update(job, state=JobState.SUCCEEDED)
        except Exception as exc:  # noqa: BLE001 — surface to API client
            self._update(
                job,
                state=JobState.FAILED,
                error={"code": "JOB_FAILED", "message": str(exc)},
            )
        finally:
            self.unregister_controller(job.id)

    def _update(
        self,
        job: MatchJob,
        *,
        state: Optional[JobState] = None,
        progress: Optional[ProgressInfo] = None,
        results: Optional[List[TrackResult]] = None,
        batch_results: Optional[Dict[str, List[TrackResult]]] = None,
        error: Optional[Dict[str, str]] = None,
    ) -> None:
        with self._lock:
            if state is not None:
                job.state = state
            if progress is not None:
                job.progress = progress
            if results is not None:
                job.results = results
            if batch_results is not None:
                job.batch_results = batch_results
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
        if job.cancel_requested:
            store._update(
                job,
                progress=ProgressInfo(
                    completed_tracks=max(0, i - 1),
                    total_tracks=total,
                    matched_count=len([r for r in results if r.matched]),
                    unmatched_count=len([r for r in results if not r.matched]),
                    status_message="Cancelled",
                    reliability_state="failed",
                ),
                results=results,
                state=JobState.CANCELLED,
                error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
            )
            return
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
        matched = i % 2 == 0
        candidates = _demo_candidates(i) if matched else []
        results.append(
            TrackResult(
                playlist_index=i,
                title=f"Demo Track {i}",
                artist="Demo Artist",
                matched=matched,
                beatport_title=f"Beatport Demo {i}" if matched else None,
                beatport_artists="BP Artist" if matched else None,
                beatport_url=f"https://www.beatport.com/track/demo/{i}" if matched else None,
                beatport_key="Am" if matched else None,
                beatport_key_camelot="8A" if matched else None,
                beatport_year="2020" if matched else None,
                beatport_bpm="128" if matched else None,
                beatport_label="Demo Records" if matched else None,
                match_score=88.0 if matched else None,
                title_sim=95.0 if matched else None,
                artist_sim=90.0 if matched else None,
                confidence="high" if matched else "low",
                candidates=candidates,
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


def run_demo_batch_match_job(job: MatchJob, store: JobStore) -> None:
    """Simulated multi-playlist batch for Electron batch-results tabs."""
    playlists: Dict[str, List[TrackResult]] = {
        "Warm Up": [],
        "Peak Time": [],
    }
    total = 6
    completed = 0
    for playlist_name, count in (("Warm Up", 3), ("Peak Time", 3)):
        for offset in range(1, count + 1):
            completed += 1
            if job.cancel_requested:
                store._update(
                    job,
                    progress=ProgressInfo(
                        completed_tracks=completed - 1,
                        total_tracks=total,
                        matched_count=0,
                        unmatched_count=0,
                        status_message="Cancelled",
                        reliability_state="failed",
                    ),
                    batch_results=playlists,
                    state=JobState.CANCELLED,
                    error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
                )
                return
            time.sleep(0.04)
            matched = offset % 2 == 0
            candidates = _demo_candidates(completed, primary_score=86.0 + offset) if matched else []
            track = TrackResult(
                playlist_index=offset,
                title=f"{playlist_name} Track {offset}",
                artist="Batch Artist",
                matched=matched,
                beatport_title=f"Beatport {playlist_name} {offset}" if matched else None,
                beatport_artists="BP Artist" if matched else None,
                beatport_url=f"https://www.beatport.com/track/batch/{completed}" if matched else None,
                beatport_key="Dm" if matched else None,
                beatport_key_camelot="7A" if matched else None,
                beatport_year="2021" if matched else None,
                beatport_bpm="125" if matched else None,
                beatport_label="Batch Records" if matched else None,
                match_score=86.0 + offset if matched else None,
                title_sim=92.0 if matched else None,
                artist_sim=88.0 if matched else None,
                confidence="high" if matched else "low",
                candidates=candidates,
            )
            playlists[playlist_name].append(track)
            matched_count = sum(
                1 for rows in playlists.values() for row in rows if row.matched
            )
            unmatched_count = completed - matched_count
            store._update(
                job,
                progress=ProgressInfo(
                    completed_tracks=completed,
                    total_tracks=total,
                    matched_count=matched_count,
                    unmatched_count=unmatched_count,
                    status_message=f"Processing {playlist_name} ({completed}/{total})",
                    reliability_state="running",
                ),
                batch_results=playlists,
            )

    matched_count = sum(1 for rows in playlists.values() for row in rows if row.matched)
    store._update(
        job,
        progress=ProgressInfo(
            completed_tracks=total,
            total_tracks=total,
            matched_count=matched_count,
            unmatched_count=total - matched_count,
            status_message="Complete",
            reliability_state="completed",
        ),
        batch_results=playlists,
        state=JobState.SUCCEEDED,
    )


def run_real_batch_match_job(
    job: MatchJob,
    store: JobStore,
    xml_path: str,
    playlist_names: List[str],
) -> None:
    """Process multiple playlists sequentially from one Rekordbox XML file."""
    _ensure_services()
    from cuepoint.data.rekordbox import parse_playlist_tree
    from cuepoint.services.interfaces import IProcessorService
    from cuepoint.compat.gui_types import ProcessingController, ProgressInfo
    from cuepoint.utils.di_container import get_container

    if not playlist_names:
        store._update(
            job,
            state=JobState.FAILED,
            error={"code": "INVALID_REQUEST", "message": "No playlists selected"},
        )
        return

    _, playlists_by_path = parse_playlist_tree(xml_path)
    missing = [name for name in playlist_names if name not in playlists_by_path]
    if missing:
        store._update(
            job,
            state=JobState.FAILED,
            error={
                "code": "PLAYLIST_NOT_FOUND",
                "message": f"Playlist(s) not found in XML: {', '.join(missing[:3])}",
            },
        )
        return

    processor = get_container().resolve(IProcessorService)
    controller = ProcessingController()
    store.register_controller(job.id, controller)

    batch_results: Dict[str, List[TrackResult]] = {name: [] for name in playlist_names}
    total_tracks = sum(len(playlists_by_path[name].tracks) for name in playlist_names)
    completed_global = 0
    matched_global = 0

    for playlist_index, playlist_name in enumerate(playlist_names, start=1):
        if job.cancel_requested or controller.is_cancelled():
            store._update(
                job,
                batch_results=batch_results,
                progress=ProgressInfo(
                    completed_tracks=completed_global,
                    total_tracks=total_tracks,
                    matched_count=matched_global,
                    unmatched_count=completed_global - matched_global,
                    status_message="Cancelled",
                    reliability_state="failed",
                ),
                state=JobState.CANCELLED,
                error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
            )
            return

        playlist_completed = 0

        def on_progress(info: ProgressInfo, *, _playlist_name: str = playlist_name) -> None:
            nonlocal playlist_completed
            playlist_completed = info.completed_tracks
            completed = completed_global + playlist_completed
            matched = matched_global + info.matched_count
            store._update(
                job,
                batch_results=batch_results,
                progress=ProgressInfo(
                    completed_tracks=completed,
                    total_tracks=total_tracks,
                    matched_count=matched,
                    unmatched_count=completed - matched,
                    current_track=info.current_track,
                    elapsed_time=info.elapsed_time,
                    eta_seconds=info.eta_seconds,
                    status_message=(
                        info.status_message
                        or f"Processing {_playlist_name} ({playlist_index}/{len(playlist_names)})"
                    ),
                    reliability_state=info.reliability_state or "running",
                ),
            )

        store._update(
            job,
            batch_results=batch_results,
            progress=ProgressInfo(
                completed_tracks=completed_global,
                total_tracks=total_tracks,
                matched_count=matched_global,
                unmatched_count=completed_global - matched_global,
                status_message=f"Starting {playlist_name} ({playlist_index}/{len(playlist_names)})",
                reliability_state="running",
            ),
        )

        try:
            results = processor.process_playlist_from_xml(
                xml_path,
                playlist_name,
                progress_callback=on_progress,
                controller=controller,
            )
        except Exception as exc:  # noqa: BLE001 — surface to API client
            store._update(
                job,
                batch_results=batch_results,
                state=JobState.FAILED,
                error={"code": "JOB_FAILED", "message": str(exc)},
            )
            return

        if controller.is_cancelled() or job.cancel_requested:
            batch_results[playlist_name] = results
            completed_global += len(results)
            matched_global += sum(1 for row in results if row.matched)
            store._update(
                job,
                batch_results=batch_results,
                progress=ProgressInfo(
                    completed_tracks=completed_global,
                    total_tracks=total_tracks,
                    matched_count=matched_global,
                    unmatched_count=completed_global - matched_global,
                    status_message="Cancelled",
                    reliability_state="failed",
                ),
                state=JobState.CANCELLED,
                error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
            )
            return

        batch_results[playlist_name] = results
        completed_global += len(results)
        matched_global += sum(1 for row in results if row.matched)

    store._update(
        job,
        batch_results=batch_results,
        progress=ProgressInfo(
            completed_tracks=completed_global,
            total_tracks=total_tracks,
            matched_count=matched_global,
            unmatched_count=completed_global - matched_global,
            status_message="Complete",
            reliability_state="completed",
        ),
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
    from cuepoint.compat.gui_types import ProcessingController
    from cuepoint.utils.di_container import get_container

    processor = get_container().resolve(IProcessorService)
    controller = ProcessingController()
    store.register_controller(job.id, controller)

    def on_progress(info: ProgressInfo) -> None:
        store._update(job, progress=info)

    results = processor.process_playlist_from_xml(
        xml_path,
        playlist_name,
        progress_callback=on_progress,
        controller=controller,
    )
    if controller.is_cancelled() or job.cancel_requested:
        store._update(
            job,
            results=results,
            progress=ProgressInfo(
                completed_tracks=len(results),
                total_tracks=len(results),
                matched_count=sum(1 for r in results if r.matched),
                unmatched_count=sum(1 for r in results if not r.matched),
                status_message="Cancelled",
                reliability_state="failed",
            ),
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
        )
        return
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


def run_real_m3u_match_job(job: MatchJob, store: JobStore, m3u_path: str) -> None:
    """Process tracks from an M3U/M3U8 playlist file."""
    _ensure_services()
    from cuepoint.services.interfaces import IProcessorService
    from cuepoint.compat.gui_types import ProcessingController
    from cuepoint.utils.di_container import get_container

    processor = get_container().resolve(IProcessorService)
    controller = ProcessingController()
    store.register_controller(job.id, controller)

    def on_progress(info: ProgressInfo) -> None:
        store._update(job, progress=info)

    try:
        results, warning = processor.process_playlist_from_m3u(
            m3u_path,
            progress_callback=on_progress,
            controller=controller,
        )
    except Exception as exc:  # noqa: BLE001 — surface to API client
        store._update(
            job,
            state=JobState.FAILED,
            error={"code": "JOB_FAILED", "message": str(exc)},
        )
        return

    status_message = "Complete"
    if warning:
        status_message = f"Complete ({warning})"

    if controller.is_cancelled() or job.cancel_requested:
        store._update(
            job,
            results=results,
            progress=ProgressInfo(
                completed_tracks=len(results),
                total_tracks=len(results),
                matched_count=sum(1 for r in results if r.matched),
                unmatched_count=sum(1 for r in results if not r.matched),
                status_message="Cancelled",
                reliability_state="failed",
            ),
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": "Cancelled by user"},
        )
        return

    store._update(
        job,
        results=results,
        progress=ProgressInfo(
            completed_tracks=len(results),
            total_tracks=len(results),
            matched_count=sum(1 for r in results if r.matched),
            unmatched_count=sum(1 for r in results if not r.matched),
            status_message=status_message,
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
    demo_batch = bool(body.get("demo_batch", False))
    xml_path = body.get("xml_path")
    m3u_path = body.get("m3u_path")
    playlist_name = body.get("playlist_name")
    playlist_names_raw = body.get("playlist_names")
    playlist_names: List[str] = []
    if isinstance(playlist_names_raw, list):
        playlist_names = [str(name).strip() for name in playlist_names_raw if str(name).strip()]

    has_real_m3u = bool(m3u_path and str(m3u_path).strip())
    has_real_xml = bool(xml_path and str(xml_path).strip())
    has_real_single = has_real_xml and bool(playlist_name and str(playlist_name).strip())
    has_real_batch = has_real_xml and bool(playlist_names)

    if demo or not (has_real_m3u or has_real_single or has_real_batch):
        runner = (
            (lambda job: run_demo_batch_match_job(job, store))
            if demo_batch
            else (lambda job: run_demo_match_job(job, store))
        )
        return store.create_match_job(
            xml_path=xml_path,
            playlist_name=playlist_name,
            demo=True,
            runner=runner,
        )

    if has_real_m3u:
        path = str(m3u_path).strip()

        def m3u_runner(job: MatchJob) -> None:
            run_real_m3u_match_job(job, store, path)

        return store.create_match_job(
            xml_path=None,
            playlist_name=Path(path).name,
            demo=False,
            runner=m3u_runner,
        )

    if playlist_names:
        names = playlist_names

        def batch_runner(job: MatchJob) -> None:
            run_real_batch_match_job(job, store, str(xml_path), names)

        return store.create_match_job(
            xml_path=str(xml_path),
            playlist_name=playlist_names[0],
            demo=False,
            runner=batch_runner,
        )

    def runner(job: MatchJob) -> None:
        run_real_match_job(job, store, str(xml_path), str(playlist_name))

    return store.create_match_job(
        xml_path=str(xml_path),
        playlist_name=str(playlist_name),
        demo=False,
        runner=runner,
    )


def cancel_match_job(store: JobStore, job_id: str) -> MatchJob:
    return store.request_cancel(job_id)
