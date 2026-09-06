#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the ``track_metadata`` table (ORG-02, DEC-057).

CuePoint's own rating, favorite and note, stored beside the imported record
rather than inside it. ``TrackRepository`` owns everything Rekordbox wrote;
this owns everything the user wrote, and the two never touch the same columns —
which is what makes "a refresh cannot overwrite your rating" a property of the
schema rather than a promise about the code.

A row per track, only once there is something to say
----------------------------------------------------
Every write upserts, so an untouched track has no row at all and a
fifty-thousand-track library that nobody has rated costs nothing. That means
:meth:`TrackMetadataRepository.get` answering ``None`` is the normal case, not
an error, and every reader has to treat "no row" as "no CuePoint opinion" —
which is exactly what :func:`~cuepoint.models.track_metadata.effective_rating`
does with it.

Clearing versus zeroing
-----------------------
``set_rating(track_id, None)`` writes ``NULL`` and the effective rating falls
back to Rekordbox's; ``set_rating(track_id, 0)`` writes a zero-star rating that
overrides it. Both are ordinary writes here, and neither is a deletion: the row
survives so the favorite and the note on it survive too. :meth:`clear` is the
one that removes the row, and it is for "forget everything CuePoint knows about
this track", not for "unrate it".
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.track_metadata import (
    TrackMetadata,
    normalize_notes,
    normalize_rating,
)
from cuepoint.services.interfaces import IDatabaseService, ITrackMetadataRepository

#: Ids per ``IN`` clause when reading many rows. SQLite's default parameter
#: limit is 999 in older builds; a window is a hundred rows and a batch job's
#: chunk is larger, so the chunking is here rather than at every call site.
_READ_CHUNK_SIZE = 500

_SELECT = (
    "SELECT track_id, rating, favorite, notes, created_at, updated_at"
    " FROM track_metadata"
)


class TrackMetadataRepository(ITrackMetadataRepository):
    """Persistence for the CuePoint metadata layer."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ read

    def get(self, track_id: int) -> Optional[TrackMetadata]:
        """Return one track's CuePoint metadata, or ``None`` if it has none.

        ``None`` is the ordinary answer for a track nobody has rated, favorited
        or annotated. It is not an error and it is not an empty record.
        """
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE track_id = ?", (int(track_id),))
            .fetchone()
        )
        return None if row is None else TrackMetadata.from_row(row)

    def get_many(self, track_ids: Iterable[int]) -> Dict[int, TrackMetadata]:
        """Return metadata for the tracks that have any, keyed by track id.

        The shape a window of rows needs: one query for a hundred tracks rather
        than a hundred queries, and tracks with no metadata simply absent from
        the result rather than present as empty records.

        Duplicate ids are asked about once, and the order of ``track_ids`` does
        not matter — the caller is looking things up, not iterating.
        """
        wanted = _unique_ids(track_ids)
        if not wanted:
            return {}

        found: Dict[int, TrackMetadata] = {}
        connection = self._db.connect()
        for chunk in _chunked(wanted, _READ_CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            rows = connection.execute(
                f"{_SELECT} WHERE track_id IN ({placeholders})", tuple(chunk)
            ).fetchall()
            for row in rows:
                record = TrackMetadata.from_row(row)
                found[record.track_id] = record
        return found

    def count(self) -> int:
        """Return how many tracks have any CuePoint metadata at all."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM track_metadata")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    # ----------------------------------------------------------------- write

    def set_rating(self, track_id: int, rating: Optional[int]) -> TrackMetadata:
        """Set or clear the CuePoint rating, and return the stored record.

        ``None`` clears the override — the effective rating falls back to
        Rekordbox's — while ``0`` is a rating of zero stars that does not.

        Raises:
            ValueError: If the rating is not 0–5 or ``None``.
        """
        return self._set("rating", normalize_rating(rating), int(track_id))

    def set_favorite(self, track_id: int, favorite: bool) -> TrackMetadata:
        """Set the favorite flag, and return the stored record."""
        return self._set("favorite", 1 if favorite else 0, int(track_id))

    def set_notes(self, track_id: int, notes: Optional[str]) -> TrackMetadata:
        """Set or clear the note, and return the stored record.

        Raises:
            ValueError: If the note is longer than the model allows.
        """
        return self._set("notes", normalize_notes(notes), int(track_id))

    def clear(self, track_id: int) -> bool:
        """Delete everything CuePoint knows about a track.

        For "forget this", not for "unrate this" — clearing a rating is
        :meth:`set_rating` with ``None``, which leaves the favorite and the note
        alone.

        Returns:
            True when a row was removed.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM track_metadata WHERE track_id = ?", (int(track_id),)
            )
            return cursor.rowcount > 0

    # --------------------------------------------------------------- helpers

    def _set(self, column: str, value: Any, track_id: int) -> TrackMetadata:
        """Upsert one column, creating the row if this is the first thing said.

        The column name comes from this module's own calls and never from a
        caller, which is why it can be interpolated; the value is always bound.

        Raises:
            sqlite3.IntegrityError: If the track does not exist — the foreign
                key is what stops metadata accumulating against ids that were
                deleted by a refresh.
        """
        now = utc_now_iso()
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(
                "INSERT INTO track_metadata"
                f" (track_id, {column}, created_at, updated_at)"
                " VALUES (?, ?, ?, ?)"
                " ON CONFLICT(track_id) DO UPDATE SET"
                f" {column} = excluded.{column}, updated_at = excluded.updated_at",
                (track_id, value, now, now),
            )
            row = conn.execute(f"{_SELECT} WHERE track_id = ?", (track_id,)).fetchone()
        return TrackMetadata.from_row(row)


def _unique_ids(track_ids: Iterable[int]) -> List[int]:
    """Return the ids once each, in the order first seen."""
    seen: Dict[int, None] = {}
    for track_id in track_ids:
        seen.setdefault(int(track_id), None)
    return list(seen)


def _chunked(values: Sequence[int], size: int) -> Iterable[Tuple[int, ...]]:
    """Yield ``values`` in tuples of at most ``size``."""
    for start in range(0, len(values), size):
        yield tuple(values[start : start + size])
