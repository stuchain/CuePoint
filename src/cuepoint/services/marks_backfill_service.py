#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading the marks of a library imported before WAVE-04 (DEC-118, DEC-035).

An import and a refresh read each track's cue points and beat grid as they
write it. A library imported before they did has none stored, and its marks
are still in the file it came from. This reads them from there, once, when
that file is demonstrably the one imported: the source record's path, with the
size and modified time it had (DEC-035). Then the library's tracks and the
file's agree track for track, which is what lets each track's marks be written
against the row its Rekordbox TrackID names.

When the file has changed or is gone, nothing is read. Marks taken from a
different file could belong to tracks the library does not yet hold, or put a
cue where the track no longer has it. They arrive with the next refresh, and
the Inspector says so (``library.marks_read`` is still unset).

It runs once
------------
Success records ``library.marks_read``
(:data:`~cuepoint.models.track_marks.MARKS_INDEX`) in the transaction that
writes the last chunk, and a library with that record is never read again. A
cancelled or failed run records nothing, and the next start reads it again
from the beginning: every write is a replacement, so a second pass converges.

Stepping aside for a write that already did the work
----------------------------------------------------
A chunk at a time, each in its own transaction, so it never holds the write
lock for long. An import or a refresh started meanwhile is not refused and does
not wait: it writes every track's marks itself. So each chunk first checks, in
its own transaction, that the marks are still unread and the source record is
the one this run started from. If not, the run ends without writing, and what
the import wrote stands.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from cuepoint.data.rekordbox import iter_collection_entries
from cuepoint.models.library_source import LibrarySource
from cuepoint.models.track_marks import ReadMarks
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    ILibrarySourceRepository,
    IMarksBackfillService,
    ITrackMarksRepository,
    ITrackRepository,
)

_logger = logging.getLogger(__name__)

#: The Activity event a backfill that read anything records.
EVENT_MARKS_READ = "library.marks_read"

#: Tracks per transaction. A chunk of a 50,000-track library commits in tens of
#: milliseconds, so an import waiting for the lock waits no longer than that.
BACKFILL_CHUNK_SIZE = 2000

OUTCOME_READ = "read"
OUTCOME_ALREADY_READ = "already_read"
OUTCOME_NO_SOURCE = "no_source"
OUTCOME_SOURCE_CHANGED = "source_changed"
OUTCOME_SUPERSEDED = "superseded"
OUTCOME_CANCELLED = "cancelled"

#: How a backfill can end. Only ``read`` records the marks as read.
BACKFILL_OUTCOMES = (
    OUTCOME_READ,
    OUTCOME_ALREADY_READ,
    OUTCOME_NO_SOURCE,
    OUTCOME_SOURCE_CHANGED,
    OUTCOME_SUPERSEDED,
    OUTCOME_CANCELLED,
)

#: ``(completed, total)`` tracks.
BackfillProgress = Callable[[int, int], None]


class _Superseded(Exception):
    """An import or refresh wrote the marks while the backfill ran."""


@dataclass(frozen=True)
class MarksBackfillResult:
    """What one backfill did.

    Attributes:
        outcome: One of :data:`BACKFILL_OUTCOMES`.
        tracks: Tracks whose marks were written.
        cues: ``track_cues`` rows written.
        markers: ``track_beat_grid`` rows written.
        skipped: Marks refused as unknown or malformed.
    """

    outcome: str
    tracks: int = 0
    cues: int = 0
    markers: int = 0
    skipped: int = 0

    @property
    def read(self) -> bool:
        """True when the library's marks are now recorded as read."""
        return self.outcome == OUTCOME_READ

    def summary_line(self) -> str:
        """One line a user can read, for Activity and the job's message."""
        if self.outcome == OUTCOME_READ:
            line = (
                f"Read cue points and beat grids for {self.tracks:,} tracks"
                f" from the imported collection: {self.cues:,} cues,"
                f" {self.markers:,} grid markers"
            )
            if self.skipped:
                noun = "mark" if self.skipped == 1 else "marks"
                line += f"; {self.skipped:,} unreadable {noun} skipped"
            return line
        return {
            OUTCOME_ALREADY_READ: "Cue points were already read",
            OUTCOME_NO_SOURCE: "No imported collection to read cue points from",
            OUTCOME_SOURCE_CHANGED: (
                "The imported collection has changed since the import; cue points"
                " arrive with the next refresh"
            ),
            OUTCOME_SUPERSEDED: "An import or refresh read the cue points instead",
            OUTCOME_CANCELLED: "Stopped reading cue points; it finishes at the next start",
        }[self.outcome]

    def to_dict(self) -> Dict[str, Any]:
        """The job result."""
        return {
            "outcome": self.outcome,
            "tracks": self.tracks,
            "cues": self.cues,
            "markers": self.markers,
            "skipped": self.skipped,
            "summary_line": self.summary_line(),
        }


class MarksBackfillService(IMarksBackfillService):
    """Reads a pre-WAVE-04 library's marks from its unchanged source, once."""

    def __init__(
        self,
        marks_repository: ITrackMarksRepository,
        track_repository: ITrackRepository,
        source_repository: ILibrarySourceRepository,
        database_service: IDatabaseService,
        activity_service: Optional[IActivityService] = None,
        *,
        chunk_size: int = BACKFILL_CHUNK_SIZE,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if chunk_size < 1:
            raise ValueError(f"chunk_size must be at least 1, got {chunk_size}")
        self._marks = marks_repository
        self._tracks = track_repository
        self._sources = source_repository
        self._db = database_service
        self._activity = activity_service
        self._chunk_size = chunk_size
        self._clock = clock

    def needed(self) -> bool:
        """True when the marks are unread and the source can be read for them.

        Costs a query and a ``stat``, so the engine asks at every start until
        it is answered: a source a user puts back unchanged is read then.
        """
        if self._marks.is_read():
            return False
        source = self._sources.get()
        return source is not None and bool(source.matches_file_on_disk())

    def backfill(
        self,
        on_progress: Optional[BackfillProgress] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> MarksBackfillResult:
        """Read every track's marks from the source, if it is unchanged.

        Never raises for the file's sake: a source that changed or went
        returns an outcome saying so. A malformed file raises as an import
        would, and the job reports it.
        """
        if self._marks.is_read():
            return MarksBackfillResult(OUTCOME_ALREADY_READ)
        source = self._sources.get()
        if source is None:
            return MarksBackfillResult(OUTCOME_NO_SOURCE)
        if not source.matches_file_on_disk():
            _logger.info(
                "[library] %s changed since the import; its marks wait for a refresh",
                source.xml_path,
            )
            return MarksBackfillResult(OUTCOME_SOURCE_CHANGED)

        total = source.track_count
        done = 0
        tracks = cues = markers = skipped = 0
        chunk: List[Tuple[str, ReadMarks]] = []

        def write(final: bool) -> None:
            nonlocal tracks, cues, markers
            with self._db.transaction():
                self._still_unread(source)
                ids = self._tracks.ids_by_rekordbox_id(key for key, _ in chunk)
                written = self._marks.replace_many(
                    (ids[key], read.cues, read.grid)
                    for key, read in chunk
                    if key in ids
                )
                tracks += sum(1 for key, _ in chunk if key in ids)
                cues += written[0]
                markers += written[1]
                if final:
                    self._marks.mark_read(self._clock().isoformat())
            chunk.clear()

        try:
            for track, read in iter_collection_entries(source.xml_path):
                if should_cancel is not None and should_cancel():
                    return MarksBackfillResult(
                        OUTCOME_CANCELLED, tracks, cues, markers, skipped
                    )
                chunk.append((track.rekordbox_track_id, read))
                skipped += read.skipped
                done += 1
                if len(chunk) >= self._chunk_size:
                    write(final=False)
                    if on_progress is not None:
                        on_progress(done, max(total, done))
            write(final=True)
        except _Superseded:
            _logger.info("[library] an import or refresh read the marks first")
            return MarksBackfillResult(
                OUTCOME_SUPERSEDED, tracks, cues, markers, skipped
            )

        if on_progress is not None:
            on_progress(done, max(total, done))
        result = MarksBackfillResult(OUTCOME_READ, tracks, cues, markers, skipped)
        _logger.info("[library] %s", result.summary_line())
        self._record(result, source)
        return result

    def _still_unread(self, source: LibrarySource) -> None:
        """Raise :class:`_Superseded` unless nothing has read the marks since."""
        current = self._sources.get()
        if (
            self._marks.is_read()
            or current is None
            or current.to_dict() != source.to_dict()
        ):
            raise _Superseded()

    def _record(self, result: MarksBackfillResult, source: LibrarySource) -> None:
        """One Activity event for a backfill that read the marks. Best-effort."""
        if self._activity is None:
            return
        try:
            self._activity.record_event(
                EVENT_MARKS_READ,
                result.summary_line(),
                {"xml_path": source.xml_path, **result.to_dict()},
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the marks backfill: %s", exc)


__all__ = [
    "BACKFILL_CHUNK_SIZE",
    "BACKFILL_OUTCOMES",
    "EVENT_MARKS_READ",
    "OUTCOME_ALREADY_READ",
    "OUTCOME_CANCELLED",
    "OUTCOME_NO_SOURCE",
    "OUTCOME_READ",
    "OUTCOME_SOURCE_CHANGED",
    "OUTCOME_SUPERSEDED",
    "MarksBackfillResult",
    "MarksBackfillService",
]
