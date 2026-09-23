#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the Beatport catalog cache and the library's identity on it (DISCOVER-04).

The one module that runs SQL against ``beatport_tracks`` and
``beatport_track_artists`` (migration 0021), and the reader of migration
0023's two views:

- ``library_beatport_tracks`` — which Beatport tracks the library owns, one
  row per library track with an accepted match (DEC-092);
- ``library_beatport_credits`` — who Beatport says those tracks are by, and
  on which label (DEC-095).

A re-read replaces, and never deletes
-------------------------------------
Storing a track that is already cached is an ``INSERT … ON CONFLICT DO
UPDATE``, never ``INSERT OR REPLACE``: the replace deletes the row first, and
SQLite runs the delete's cascade, so every credit of the track would vanish
(DISCOVER-02's first binding note). Its credits are then rewritten in the same
transaction, so a reader sees the old credits or the new ones and never a
track with none.

A batch is one transaction, so a resolve job cancelled or failed between
batches keeps every batch it finished.

The mapping from DISCOVER-01's ``CatalogTrack`` lives here, as the models ask
(``models/beatport_cache.py``): DISCOVER-05's discovery job writes catalog
tracks too, and one mapping is what keeps a label's key the same whichever job
read it.
"""

from __future__ import annotations

import logging
from typing import Dict, Iterable, List, Sequence, Set, Tuple

from cuepoint.core.entity_names import name_key
from cuepoint.incrate.beatport_api_models import CatalogTrack
from cuepoint.models.beatport_cache import (
    CachedBeatportCredit,
    CachedBeatportTrack,
    LibraryBeatportCredit,
)
from cuepoint.models.track_credit import ROLE_ARTIST, ROLE_REMIXER
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.persistence.track_credit_repository import label_key_of
from cuepoint.services.beatport_ownership import OWNED_VIEW
from cuepoint.services.interfaces import IBeatportCatalogRepository, IDatabaseService

_logger = logging.getLogger(__name__)

#: The view of each resolved library track's Beatport artists and label.
CREDITS_VIEW = "library_beatport_credits"

_TRACK_COLUMNS: Tuple[str, ...] = (
    "beatport_track_id",
    "title",
    "mix_name",
    "url",
    "label_id",
    "label_name",
    "label_key",
    "release_id",
    "release_name",
    "release_date",
    "bpm",
    "key",
    "genre_id",
    "genre_name",
    "fetched_at",
)

_CREDIT_COLUMNS: Tuple[str, ...] = (
    "beatport_track_id",
    "role",
    "position",
    "artist_id",
    "name",
    "name_key",
)

_UPSERT_TRACK = (
    f"INSERT INTO beatport_tracks ({', '.join(_TRACK_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _TRACK_COLUMNS)})"
    " ON CONFLICT (beatport_track_id) DO UPDATE SET "
    + ", ".join(f"{c} = excluded.{c}" for c in _TRACK_COLUMNS[1:])
)

_INSERT_CREDIT = (
    f"INSERT INTO beatport_track_artists ({', '.join(_CREDIT_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _CREDIT_COLUMNS)})"
)

_CREDIT_ORDER = " ORDER BY CASE role WHEN 'artist' THEN 0 ELSE 1 END, position"

# Owned ids with no catalog row, or one read before the cutoff, each once and
# in id order, so a resolve reads the same tracks in the same order twice.
_TO_RESOLVE = (
    "SELECT DISTINCT l.beatport_track_id AS id FROM library_beatport_tracks AS l"
    " LEFT JOIN beatport_tracks AS b ON b.beatport_track_id = l.beatport_track_id"
    " WHERE b.beatport_track_id IS NULL OR b.fetched_at < ?"
    " ORDER BY l.beatport_track_id"
)

_OWNED_COUNT = (
    "SELECT count(DISTINCT beatport_track_id) AS n FROM library_beatport_tracks"
)


def catalog_rows(
    track: CatalogTrack, fetched_at: str
) -> Tuple[CachedBeatportTrack, List[CachedBeatportCredit]]:
    """A catalog track as the rows it is stored as.

    Blank text is stored as null, as every other cache column is; the label's
    key and each credit's key are DISCOVER-03's ``name_key``, the same key the
    library's own labels and credits carry.

    Raises:
        ValueError: If a value is one the models refuse, which DISCOVER-01's
            parser never produces.
    """
    label_name = track.label_name or None
    cached = CachedBeatportTrack(
        beatport_track_id=track.id,
        title=track.title,
        url=track.url,
        fetched_at=fetched_at,
        mix_name=track.mix_name or None,
        label_id=track.label_id,
        label_name=label_name,
        label_key=label_key_of(label_name),
        release_id=track.release_id,
        release_name=track.release_name or None,
        release_date=track.release_date or None,
        bpm=track.bpm,
        key=track.key or None,
        genre_id=track.genre_id,
        genre_name=track.genre_name or None,
    )
    credits = [
        CachedBeatportCredit(
            beatport_track_id=track.id,
            role=role,
            position=position,
            name=artist.name,
            name_key=name_key(artist.name),
            artist_id=artist.id,
        )
        for role, artists in (
            (ROLE_ARTIST, track.artists),
            (ROLE_REMIXER, track.remixers),
        )
        for position, artist in enumerate(artists)
    ]
    return cached, credits


class BeatportCatalogRepository(IBeatportCatalogRepository):
    """The Beatport catalog cache, and what the library owns and is by on Beatport."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ----------------------------------------------------------------- write

    def upsert_tracks(self, tracks: Sequence[CatalogTrack], fetched_at: str) -> int:
        """Store catalog tracks and their credits in one transaction.

        A track already cached is updated in place and its credits rewritten;
        one the models refuse is logged and left out rather than failing the
        batch it came in.

        Returns:
            How many tracks were stored.
        """
        rows: Dict[int, Tuple[CachedBeatportTrack, List[CachedBeatportCredit]]] = {}
        for track in tracks:
            try:
                rows[track.id] = catalog_rows(track, fetched_at)
            except (TypeError, ValueError) as exc:
                _logger.warning(
                    "[beatport] catalog track %s not stored: %s",
                    getattr(track, "id", "?"),
                    exc,
                )
        if not rows:
            return 0
        with self._db.transaction() as conn:
            conn.executemany(
                _UPSERT_TRACK,
                [
                    tuple(cached.to_dict()[c] for c in _TRACK_COLUMNS)
                    for cached, _ in rows.values()
                ],
            )
            for chunk in chunked(list(rows)):
                conn.execute(
                    "DELETE FROM beatport_track_artists WHERE beatport_track_id IN"
                    f" ({', '.join('?' for _ in chunk)})",
                    chunk,
                )
            conn.executemany(
                _INSERT_CREDIT,
                [
                    tuple(credit.to_dict()[c] for c in _CREDIT_COLUMNS)
                    for _, credits in rows.values()
                    for credit in credits
                ],
            )
        return len(rows)

    # ------------------------------------------------------------------ read

    def get_tracks(self, ids: Iterable[int]) -> Dict[int, CachedBeatportTrack]:
        """The cached tracks among ``ids``, keyed by Beatport track id."""
        found: Dict[int, CachedBeatportTrack] = {}
        conn = self._db.connect()
        for chunk in chunked(unique_ids(ids)):
            for row in conn.execute(
                f"SELECT {', '.join(_TRACK_COLUMNS)} FROM beatport_tracks"
                f" WHERE beatport_track_id IN ({', '.join('?' for _ in chunk)})",
                chunk,
            ):
                track = CachedBeatportTrack.from_row(row)
                found[track.beatport_track_id] = track
        return found

    def credits(self, beatport_track_id: int) -> List[CachedBeatportCredit]:
        """One cached track's credits, artists first, each role in Beatport's order."""
        rows = (
            self._db.connect()
            .execute(
                f"SELECT {', '.join(_CREDIT_COLUMNS)} FROM beatport_track_artists"
                " WHERE beatport_track_id = ?" + _CREDIT_ORDER,
                (int(beatport_track_id),),
            )
            .fetchall()
        )
        return [CachedBeatportCredit.from_row(row) for row in rows]

    def owned_among(self, ids: Iterable[int]) -> Set[int]:
        """Which of ``ids`` the library owns (DEC-092).

        The view's id is computed from each accepted candidate, so no index can
        serve it and every question scans the accepted matches once. A few ids
        are asked about in that one scan; more than a statement can carry are
        answered by reading every owned id once and intersecting, rather than by
        one scan per chunk.
        """
        wanted = unique_ids(ids)
        if not wanted:
            return set()
        conn = self._db.connect()
        if len(wanted) <= CHUNK_SIZE:
            return {
                int(row["beatport_track_id"])
                for row in conn.execute(
                    f"SELECT DISTINCT beatport_track_id FROM {OWNED_VIEW}"
                    f" WHERE beatport_track_id IN ({', '.join('?' for _ in wanted)})",
                    tuple(wanted),
                )
            }
        owned = {
            int(row["beatport_track_id"])
            for row in conn.execute(
                f"SELECT DISTINCT beatport_track_id FROM {OWNED_VIEW}"
            )
        }
        return owned.intersection(wanted)

    def resolve_plan(self, stale_before: str) -> Tuple[List[int], int]:
        """Owned Beatport ids to read, and how many owned ids there are in all.

        An id is read when the cache has no row for it, or one fetched before
        ``stale_before`` (ISO-8601 UTC, compared as text as every timestamp
        here is written). Each id once, in id order.
        """
        conn = self._db.connect()
        to_read = [int(row["id"]) for row in conn.execute(_TO_RESOLVE, (stale_before,))]
        row = conn.execute(_OWNED_COUNT).fetchone()
        return to_read, int(row["n"]) if row is not None else 0

    def library_credits(
        self, track_ids: Iterable[int]
    ) -> Dict[int, List[LibraryBeatportCredit]]:
        """The Beatport artists and label of each resolved library track.

        A track with no accepted match, or whose Beatport track is not cached
        yet, is absent. Artists come first in Beatport's order, remixers after
        them, then the label.
        """
        found: Dict[int, List[LibraryBeatportCredit]] = {}
        conn = self._db.connect()
        for chunk in chunked(unique_ids(track_ids)):
            rows = conn.execute(
                "SELECT track_id, beatport_track_id, kind, role, position, beatport_id,"
                f" name, name_key FROM {CREDITS_VIEW}"
                f" WHERE track_id IN ({', '.join('?' for _ in chunk)})"
                " ORDER BY track_id, CASE kind WHEN 'artist' THEN 0 ELSE 1 END,"
                " CASE role WHEN 'artist' THEN 0 ELSE 1 END, position",
                chunk,
            )
            for row in rows:
                credit = LibraryBeatportCredit.from_row(row)
                found.setdefault(credit.track_id, []).append(credit)
        return found
