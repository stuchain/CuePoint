#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Each track's cue points and beat grid (WAVE-04, DEC-118).

Owns ``track_cues`` and ``track_beat_grid`` (``m0026_track_marks``), and the
``derived_indexes`` row that says the library's marks have been read
(``library.marks_read``, :data:`~cuepoint.models.track_marks.MARKS_INDEX`),
written through :mod:`cuepoint.persistence.derived_indexes`.

The writes are a replacement, never an edit. An import, a refresh apply and the
backfill each hand over a track's marks as Rekordbox has them now, and its
rows are deleted and written again, inside the caller's transaction so the
marks commit with the tracks they belong to or not at all. Nothing else writes
here, and nothing in CuePoint changes a mark.

The reads are one track's marks, for the Inspector, and a fingerprint of every
track's, for a refresh preview to count the tracks whose marks would change
without holding every mark of a large library in memory.
"""

from __future__ import annotations

from itertools import groupby
from operator import itemgetter
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

from cuepoint.models.track_credit import DerivedIndex
from cuepoint.models.track_marks import (
    MARKS_INDEX,
    MARKS_VERSION,
    CueValues,
    GridValues,
    TrackMarks,
    marks_fingerprint,
)
from cuepoint.persistence.derived_indexes import (
    read_derived_indexes,
    record_derived_indexes,
)
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, ITrackMarksRepository

#: One track's marks as a write takes them: ``(track_id, cues, grid)``.
MarksEntry = Tuple[int, Sequence[CueValues], Sequence[GridValues]]

_INSERT_CUE = (
    "INSERT INTO track_cues"
    " (track_id, position, kind, hot_cue, start_ms, end_ms, name, color)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)
_INSERT_MARKER = (
    "INSERT INTO track_beat_grid (track_id, position, start_ms, bpm, meter, beat)"
    " VALUES (?, ?, ?, ?, ?, ?)"
)
_CUE_COLUMNS = "kind, hot_cue, start_ms, end_ms, name, color"
_MARKER_COLUMNS = "start_ms, bpm, meter, beat"


class TrackMarksRepository(ITrackMarksRepository):
    """Reads and replaces the marks Rekordbox gave each track."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    # ------------------------------------------------------------------ writes

    def replace_many(self, entries: Iterable[MarksEntry]) -> Tuple[int, int]:
        """Replace each track's marks with these, whole: delete, then insert.

        Joins an open transaction, so an import's tracks and their marks commit
        together. A track given no marks loses any it had.

        Returns:
            ``(cues, markers)``: the rows written.
        """
        cues_written = 0
        markers_written = 0
        batch: List[MarksEntry] = []

        def flush(conn: Any) -> Tuple[int, int]:
            ids = [entry[0] for entry in batch]
            placeholders = ", ".join("?" for _ in ids)
            conn.execute(
                f"DELETE FROM track_cues WHERE track_id IN ({placeholders})", ids
            )
            conn.execute(
                f"DELETE FROM track_beat_grid WHERE track_id IN ({placeholders})", ids
            )
            cue_rows = [
                (track_id, position, *values)
                for track_id, cues, _ in batch
                for position, values in enumerate(cues)
            ]
            marker_rows = [
                (track_id, position, *values)
                for track_id, _, grid in batch
                for position, values in enumerate(grid)
            ]
            if cue_rows:
                conn.executemany(_INSERT_CUE, cue_rows)
            if marker_rows:
                conn.executemany(_INSERT_MARKER, marker_rows)
            batch.clear()
            return len(cue_rows), len(marker_rows)

        with self._db.transaction(join_existing=True) as conn:
            for entry in entries:
                batch.append(entry)
                if len(batch) >= CHUNK_SIZE:
                    cues, markers = flush(conn)
                    cues_written += cues
                    markers_written += markers
            if batch:
                cues, markers = flush(conn)
                cues_written += cues
                markers_written += markers
        return cues_written, markers_written

    def mark_read(self, read_at: str) -> None:
        """Record that the library's marks have been read by this version.

        Joins an open transaction: it is written with the marks it describes.
        """
        with self._db.transaction(join_existing=True) as conn:
            record_derived_indexes(
                conn,
                [
                    DerivedIndex(
                        name=MARKS_INDEX, version=MARKS_VERSION, built_at=read_at
                    )
                ],
            )

    # ------------------------------------------------------------------- reads

    def get(self, track_id: int) -> TrackMarks:
        """One track's marks, in order. A track with none has empty ones."""
        conn = self._db.connect()
        cues = conn.execute(
            f"SELECT position, {_CUE_COLUMNS} FROM track_cues"
            " WHERE track_id = ? ORDER BY position",
            (int(track_id),),
        ).fetchall()
        grid = conn.execute(
            f"SELECT position, {_MARKER_COLUMNS} FROM track_beat_grid"
            " WHERE track_id = ? ORDER BY position",
            (int(track_id),),
        ).fetchall()
        return TrackMarks.from_rows(int(track_id), cues, grid)

    def get_many(self, track_ids: Iterable[int]) -> Dict[int, TrackMarks]:
        """Each track's marks, keyed by id; a track with none has empty ones.

        Two queries per :data:`CHUNK_SIZE` ids, so a waveform batch of 200
        tracks costs two queries rather than four hundred. An id that is not a
        track answers empty marks, as :meth:`get` does.
        """
        wanted = unique_ids(track_ids)
        cue_rows: Dict[int, List[Any]] = {track_id: [] for track_id in wanted}
        grid_rows: Dict[int, List[Any]] = {track_id: [] for track_id in wanted}
        conn = self._db.connect()
        for chunk in chunked(wanted):
            placeholders = ", ".join("?" for _ in chunk)
            for row in conn.execute(
                f"SELECT track_id, position, {_CUE_COLUMNS} FROM track_cues"
                f" WHERE track_id IN ({placeholders})",
                chunk,
            ):
                cue_rows[int(row["track_id"])].append(row)
            for row in conn.execute(
                f"SELECT track_id, position, {_MARKER_COLUMNS} FROM track_beat_grid"
                f" WHERE track_id IN ({placeholders})",
                chunk,
            ):
                grid_rows[int(row["track_id"])].append(row)
        return {
            track_id: TrackMarks.from_rows(
                track_id, cue_rows[track_id], grid_rows[track_id]
            )
            for track_id in wanted
        }

    def fingerprints(self) -> Dict[int, bytes]:
        """Every track with marks, to the digest of its marks in order.

        A track that is absent has none, whose digest is
        :data:`~cuepoint.models.track_marks.EMPTY_FINGERPRINT`. Read as two
        scans ordered by track and merged as they go, so only one track's rows
        and the digests are ever held.
        """
        conn = self._db.connect()
        cues = _by_track(
            conn.execute(
                f"SELECT track_id, {_CUE_COLUMNS} FROM track_cues"
                " ORDER BY track_id, position"
            )
        )
        grid = _by_track(
            conn.execute(
                f"SELECT track_id, {_MARKER_COLUMNS} FROM track_beat_grid"
                " ORDER BY track_id, position"
            )
        )
        digests: Dict[int, bytes] = {}
        cue = next(cues, None)
        marker = next(grid, None)
        while cue is not None or marker is not None:
            cue_id = cue[0] if cue is not None else None
            marker_id = marker[0] if marker is not None else None
            track_id = min(i for i in (cue_id, marker_id) if i is not None)
            track_cues: Sequence[Any] = ()
            track_grid: Sequence[Any] = ()
            if cue is not None and cue_id == track_id:
                track_cues = cue[1]
                cue = next(cues, None)
            if marker is not None and marker_id == track_id:
                track_grid = marker[1]
                marker = next(grid, None)
            digests[track_id] = marks_fingerprint(track_cues, track_grid)
        return digests

    def read_record(self) -> Optional[DerivedIndex]:
        """The ``library.marks_read`` record, or None when never read."""
        records = read_derived_indexes(self._db.connect(), (MARKS_INDEX,))
        return records[0] if records else None

    def is_read(self) -> bool:
        """True when this version of the reader has read the library's marks."""
        record = self.read_record()
        return record is not None and record.is_current(MARKS_VERSION)

    def counts(self) -> Tuple[int, int]:
        """``(cues, markers)`` across the library."""
        conn = self._db.connect()
        cues = conn.execute("SELECT count(*) FROM track_cues").fetchone()[0]
        markers = conn.execute("SELECT count(*) FROM track_beat_grid").fetchone()[0]
        return int(cues), int(markers)


def _by_track(rows: Iterable[Any]) -> Iterator[Tuple[int, List[Tuple[Any, ...]]]]:
    """Rows ordered by track, one track at a time, as its values without its id."""
    for track_id, group in groupby((tuple(row) for row in rows), key=itemgetter(0)):
        yield int(track_id), [values[1:] for values in group]


__all__ = ["MarksEntry", "TrackMarksRepository"]
