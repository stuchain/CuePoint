#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Sync a review's ticked tracks into the audio files (the Review tab's Sync).

Nothing is written until the person presses **Sync**, and opening the window
writes nothing at all:

- **The preview** (:func:`overlay_for`) says what each file would become by
  laying the Beatport match's BPM, Genre, Label and Year over what the track
  shows, in memory, and reading the files as the Save window's preview does.
  The track's own key keeps winning: a key it already shows (the person's own
  correction, or its accepted match's) is never replaced, and the match's key
  only fills in when it shows none.
- **The sync** (:func:`run_sync_job`) is one job. It writes the files first, from
  that same preview, recording every value before it is replaced; only then
  does it accept the ticked tracks and copy into CuePoint's own values the
  fields each file *actually got*, as one batch whose id is the write job's id.
  A field a file already held, or kept under "Keep values already in the files",
  was not written, so it is not copied: the files and the values agree. A write
  that refuses or fails before writing a file leaves nothing copied and no
  decision recorded, so there is nothing to take back.
- **Undo this save** restores the files and then reverts that batch
  (:func:`revert_synced_values`), so the values and the decisions go back with
  them.

Pure plumbing over the existing services: no matching or writing rule lives
here, only the order they are run in.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from cuepoint.engine import tag_write_jobs as jobs
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.services.override_values import NOTATION_CLASSIC, candidate_value
from cuepoint.services.tag_write_options import TagWriteOptions

_logger = logging.getLogger(__name__)

#: The values a match brings that Sync copies into CuePoint's own values.
COPIED_FIELDS = ("bpm", "genre", "label", "year")
#: What the preview lays over a track: the copied fields and the key it would show.
OVERLAY_FIELDS = (*COPIED_FIELDS, "key")


def _service(name: str) -> Any:
    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, name))


def overlay_for(track_ids: Sequence[int]) -> Dict[int, Dict[str, Any]]:
    """Per track, the values of the Beatport match it is ticked on.

    Only tracks that point at a candidate have an entry, and only the fields
    the candidate has a usable value for: a field it lacks is left as it is.
    Reads two chunked queries for the whole selection, never one per track.
    """
    matches = _service("IMatchRepository")
    states = matches.get_matches(list(track_ids))
    candidates = matches.get_candidates(
        [state.candidate_id for state in states.values() if state.candidate_id]
    )
    overlay: Dict[int, Dict[str, Any]] = {}
    for track_id, state in states.items():
        candidate = candidates.get(state.candidate_id)
        if candidate is None:
            continue
        values = {}
        for name in OVERLAY_FIELDS:
            value = candidate_value(candidate, name, NOTATION_CLASSIC)
            if value is not None:
                values[name] = value
        overlay[int(track_id)] = values
    return overlay


def start_ticks_job(
    store: JobStore,
    accept: Sequence[Any],
    reject: Sequence[int],
    batch_id: str,
    ticked: bool,
    skipped: int,
) -> Job:
    """Tick or untick a long list of tracks as a job, in one transaction and one batch.

    A header tick over thousands of tracks must not hold the request: it runs
    as a library batch job, the same kind the status strip already shows.
    """
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    pairs = list(accept)
    refused = list(reject)

    def runner(job: Job) -> None:
        try:
            changed = _service("IMatchStateService").decide_many(
                pairs, refused, batch_id
            )
        except Exception as exc:  # noqa: BLE001 — surfaced to the API client
            _logger.warning("[ticks] could not tick: %s", exc, exc_info=True)
            store.finish(
                job,
                state=JobState.FAILED,
                error={"code": "MATCH_TICKS_FAILED", "message": str(exc)},
            )
            return
        store.finish(
            job,
            state=JobState.SUCCEEDED,
            result={
                "ticked": ticked,
                "changed": changed,
                "skipped": skipped,
                "batch_id": batch_id if changed else None,
            },
        )

    return store.create_job(
        job_type="library_batch",
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def preview_sync(store: JobStore, selection: Any, options: TagWriteOptions) -> Any:
    """A Sync preview, inline or as a job, writing nothing (see ``preview_or_start``)."""
    return jobs.preview_or_start(store, selection, options, overlay_for=overlay_for)


def start_sync_job(
    store: JobStore, preview_id: str, options: Optional[TagWriteOptions] = None
) -> Job:
    """Start the sync of a kept Sync preview.

    Raises:
        PreviewNotFoundError: If the preview is not remembered.
        ValueError: If the preview does not cover ``options``.
        JobTypeBusyError: If a conflicting job is running.
    """
    previews = jobs.get_preview_store()
    preview = previews.get(preview_id)
    if options is not None:
        preview.require_covers(options)

    def runner(job: Job) -> None:
        run_sync_job(job, store, preview_id, previews, options)

    return store.create_job(
        job_type=jobs.JOB_TYPE_TAG_WRITE,
        runner=runner,
        exclusive=True,
        conflicts_with=jobs.TAG_FILE_CONFLICTS,
    )


class _Synced:
    """A write's result with what Sync recorded beside it, for the job's answer."""

    def __init__(self, result: Any, tracks: int, values: int, batch_id: Optional[str]):
        self._result = result
        self.cancelled = bool(result.cancelled)
        self._synced = {"tracks": tracks, "values": values, "batch_id": batch_id}

    def summary_line(self) -> str:
        return str(self._result.summary_line())

    def to_dict(self) -> Dict[str, Any]:
        return {**self._result.to_dict(), "synced": self._synced}


def copy_written_values(
    job_id: str, track_ids: Sequence[int], *, only_written: bool = False
) -> Dict[str, int]:
    """Accept the tracks and copy the fields each file got, as one batch.

    ``only_written`` (a cancelled write) leaves the tracks the write never
    reached alone. On any failure the batch so far is reverted before the error
    goes on, so CuePoint's values never keep a half of it.
    """
    service = _service("ITagWriteService")
    correct = _service("IMatchCorrectService")
    written = service.written_fields(job_id)
    tracks = 0
    values = 0
    try:
        for track_id in track_ids:
            fields = [
                name for name in written.get(track_id, []) if name in COPIED_FIELDS
            ]
            if only_written and not written.get(track_id):
                continue
            correct.correct_proposed(track_id, fields, False, job_id, NOTATION_CLASSIC)
            tracks += 1
            values += len(fields)
    except Exception:
        _revert_quietly(job_id)
        raise
    return {"tracks": tracks, "values": values}


def run_sync_job(
    job: Job,
    store: JobStore,
    preview_id: str,
    previews: jobs.TagWritePreviewStore,
    options: Optional[TagWriteOptions] = None,
) -> None:
    """Write the files, then record the decisions and values, under ``job``."""
    try:
        preview = previews.take(preview_id)
    except jobs.PreviewNotFoundError as exc:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "TAG_WRITE_PREVIEW_NOT_FOUND", "message": str(exc)},
        )
        return

    def work(on_progress: Any, should_cancel: Any) -> _Synced:
        result = _service("ITagWriteService").write(
            preview,
            job.id,
            options,
            on_progress=on_progress,
            should_cancel=should_cancel,
        )
        # A write that put nothing into any file records nothing: no decision, no value.
        if result.written == 0:
            return _Synced(result, 0, 0, None)
        copied = copy_written_values(
            job.id, sorted(preview.overlay), only_written=bool(result.cancelled)
        )
        return _Synced(
            result,
            copied["tracks"],
            copied["values"],
            job.id if copied["values"] else None,
        )

    jobs._run(job, store, jobs.WRITE_MESSAGE, work, "TAG_WRITE_FAILED")


def _revert_quietly(batch_id: str) -> int:
    """Revert a batch if it recorded anything; answer how many changes went back."""
    service = _service("IRevertService")
    try:
        service.check_batch(batch_id)
    except (ValueError, LookupError):
        return 0
    try:
        return int(service.revert_batch(batch_id).reverted)
    except Exception as exc:  # noqa: BLE001 — a revert that fails must not hide the cause
        _logger.warning("[sync] could not revert batch %s: %s", batch_id, exc)
        return 0


def revert_synced_values(write_job_id: Optional[str]) -> int:
    """Take back what a Sync's batch recorded (its decisions and the values it copied).

    The batch id is the write job's id, so a restore of any write finds its own
    batch here, and one that never synced finds none and does nothing.
    """
    if not write_job_id:
        return 0
    return _revert_quietly(write_job_id)


__all__: List[str] = [
    "COPIED_FIELDS",
    "OVERLAY_FIELDS",
    "copy_written_values",
    "overlay_for",
    "preview_sync",
    "revert_synced_values",
    "run_sync_job",
    "start_ticks_job",
    "start_sync_job",
]
