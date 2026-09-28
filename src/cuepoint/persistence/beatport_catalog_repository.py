#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the Beatport catalog cache and the library's identity on it (DISCOVER-04).

The one module that runs SQL against ``beatport_tracks`` and
``beatport_track_artists`` (migration 0021) and ``beatport_listings``
(migration 0024), and the reader of migration 0023's two views:

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

Reading the catalog beside rows of one's own
--------------------------------------------
A discovery run's window (DISCOVER-05) and the wantlist (DISCOVER-06) show
catalog tracks beside their own rows. They join ``beatport_tracks`` for the
track's columns (:data:`CATALOG_TRACK_COLUMNS`), and take each track's names
from :func:`credit_names` and the artist they sort by from
:func:`first_artist_key_sql`, so a credit is read one way wherever it is shown.

Each asks "owned?" through :func:`owned_among_json` and
:func:`owned_json_sql`. The ownership view computes every accepted match's id,
so no index can serve it, and each ``IN (view)`` in a statement builds a list
of every owned id: 34 ms at 40,000 accepted matches. A window asked it up to
four times — to count, to filter and to flag — so a run's window took 98 ms and
the wantlist's up to 137. Reading the owned ids among the list's own tracks
once, and binding them to every use as a JSON array, is one view read per
request, and the answer is the same in every part of it.

An artist's or label's recent tracks (DISCOVER-07)
--------------------------------------------------
An Artist or Label page's Beatport half is a listing read whole from Beatport:
:meth:`BeatportCatalogRepository.store_listing` stores its tracks and records
that it was read (``beatport_listings``) in one transaction, and
:meth:`~BeatportCatalogRepository.entity_tracks` reads it back from the cache
by the artist's or label's id and a window of release days, through the
indexes on ``beatport_track_artists (artist_id, …)`` and
``beatport_tracks (label_id)``. A track the cache holds for another reason that
is by the same artist in the same window is one of their releases too, and is
shown with them. A track with no release date is not, since "recent" is a
date.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Sequence,
    Set,
    Tuple,
    Union,
)

from cuepoint.core.entity_names import name_key
from cuepoint.services.beatport_api_models import CatalogTrack
from cuepoint.models.beatport_cache import (
    CachedBeatportCredit,
    CachedBeatportTrack,
    LibraryBeatportCredit,
)
from cuepoint.models.beatport_cache import ENTITY_ARTIST, ENTITY_LABEL
from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_FILTERS,
    OWNED_HIDE,
    OWNED_ONLY,
)
from cuepoint.models.entity_page import (
    MAX_ENTITY_WINDOW,
    EntityTrackRow,
    EntityTracksPage,
)
from cuepoint.models.track_credit import ROLE_ARTIST, ROLE_REMIXER
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.persistence.track_credit_repository import label_key_of
from cuepoint.services.beatport_ownership import OWNED_VIEW, owned_beatport_ids_sql
from cuepoint.services.interfaces import IBeatportCatalogRepository, IDatabaseService

_logger = logging.getLogger(__name__)

#: The view of each resolved library track's Beatport artists and label.
CREDITS_VIEW = "library_beatport_credits"

#: ``beatport_tracks``' columns, in the table's order: what a reader joining
#: the catalog selects to build a ``CachedBeatportTrack``.
CATALOG_TRACK_COLUMNS: Tuple[str, ...] = (
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

_TRACK_COLUMNS = CATALOG_TRACK_COLUMNS

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

_LISTING_COLUMNS: Tuple[str, ...] = (
    "kind",
    "beatport_id",
    "since",
    "fetched_at",
    "tracks",
)

# One artist's or label's cached tracks released in a window, by id; bound as
# :id, :since and :until.
_ENTITY_TRACK_IDS = {
    ENTITY_ARTIST: (
        "SELECT DISTINCT a.beatport_track_id FROM beatport_track_artists AS a"
        " JOIN beatport_tracks AS t ON t.beatport_track_id = a.beatport_track_id"
        " WHERE a.artist_id = :id"
        " AND t.release_date >= :since AND t.release_date <= :until"
    ),
    ENTITY_LABEL: (
        "SELECT beatport_track_id FROM beatport_tracks"
        " WHERE label_id = :id"
        " AND release_date >= :since AND release_date <= :until"
    ),
}

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


_Rows = Dict[int, Tuple[CachedBeatportTrack, List[CachedBeatportCredit]]]


def _rows_of(tracks: Sequence[CatalogTrack], fetched_at: str) -> _Rows:
    """Each storable track's rows, by id; a refused track is logged and left out."""
    rows: _Rows = {}
    for track in tracks:
        try:
            rows[track.id] = catalog_rows(track, fetched_at)
        except (TypeError, ValueError) as exc:
            _logger.warning(
                "[beatport] catalog track %s not stored: %s",
                getattr(track, "id", "?"),
                exc,
            )
    return rows


def _write_rows(conn: sqlite3.Connection, rows: _Rows) -> None:
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


def first_artist_key_sql(track_id_column: str) -> str:
    """A scalar subquery: the key of the first artist credited on a track.

    What a list sorted "by artist" sorts on. ``track_id_column`` names the
    Beatport track id in the caller's query, such as ``rt.beatport_track_id``.
    """
    return (
        "(SELECT a.name_key FROM beatport_track_artists AS a"
        f" WHERE a.beatport_track_id = {track_id_column} AND a.role = 'artist'"
        " ORDER BY a.position LIMIT 1)"
    )


def owned_among_json(
    conn: sqlite3.Connection,
    ids_sql: str,
    params: Union[Sequence[Any], Mapping[str, Any]] = (),
) -> str:
    """The owned Beatport ids among those ``ids_sql`` selects, as a JSON array.

    One read of the ownership view (DEC-092), for a statement to test
    membership against with :func:`owned_json_sql` as often as it needs.
    ``ids_sql`` is a one-column ``SELECT`` of Beatport track ids, such as a
    run's tracks, with its ``params``.
    """
    rows = conn.execute(
        f"WITH listed(id) AS ({ids_sql})"
        f" SELECT DISTINCT beatport_track_id FROM ({owned_beatport_ids_sql()})"
        " WHERE beatport_track_id IN (SELECT value FROM json_each("
        "(SELECT json_group_array(id) FROM listed)))",
        params,
    )
    return json.dumps(sorted(int(row[0]) for row in rows))


def owned_json_sql(column: str, param: str = "owned") -> str:
    """``column`` is owned: a member of :func:`owned_among_json`'s array.

    The array is bound as the named parameter ``param``.
    """
    return f"{column} IN (SELECT value FROM json_each(:{param}))"


_ENTITY_OWNED = owned_json_sql("b.beatport_track_id")

# What each owned filter keeps, as a condition that is true or false per row.
_ENTITY_OWNED_KEEPS = {
    OWNED_HIDE: f"NOT ({_ENTITY_OWNED})",
    OWNED_ONLY: _ENTITY_OWNED,
    OWNED_ALL: "1",
}


def credit_names(
    conn: sqlite3.Connection, ids: Sequence[int]
) -> Dict[int, Tuple[Tuple[str, ...], Tuple[str, ...]]]:
    """Each cached track's artist and remixer names, in Beatport's order.

    A track with no credits is absent.
    """
    names: Dict[int, Tuple[List[str], List[str]]] = {}
    for chunk in chunked(unique_ids(ids)):
        for row in conn.execute(
            "SELECT beatport_track_id, role, name FROM beatport_track_artists"
            f" WHERE beatport_track_id IN ({', '.join('?' for _ in chunk)})"
            " ORDER BY beatport_track_id, role, position",
            chunk,
        ):
            artists, remixers = names.setdefault(int(row[0]), ([], []))
            (artists if row[1] == ROLE_ARTIST else remixers).append(str(row[2]))
    return {k: (tuple(a), tuple(r)) for k, (a, r) in names.items()}


def store_catalog_tracks(
    conn: sqlite3.Connection, tracks: Sequence[CatalogTrack], fetched_at: str
) -> List[int]:
    """Store catalog tracks on a connection whose transaction the caller holds.

    What :meth:`BeatportCatalogRepository.upsert_tracks` does, for a writer
    that must commit the catalog rows together with rows of its own — a
    discovery run's tracks reference them (DISCOVER-05). The SQL stays here,
    in the one module that writes the catalog.

    Returns:
        The ids stored, in the order given; a refused track is left out.
    """
    rows = _rows_of(tracks, fetched_at)
    if rows:
        _write_rows(conn, rows)
    return list(rows)


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
        rows = _rows_of(tracks, fetched_at)
        if not rows:
            return 0
        with self._db.transaction() as conn:
            _write_rows(conn, rows)
        return len(rows)

    def store_listing(
        self, listing: BeatportListing, tracks: Sequence[CatalogTrack]
    ) -> int:
        """Store an artist's or label's listing and its tracks in one transaction.

        The tracks are stored as :meth:`upsert_tracks` stores them, with the
        listing's ``fetched_at``; the listing replaces the one read before.

        Returns:
            How many tracks were stored.
        """
        rows = _rows_of(tracks, listing.fetched_at)
        with self._db.transaction() as conn:
            if rows:
                _write_rows(conn, rows)
            conn.execute(
                f"INSERT INTO beatport_listings ({', '.join(_LISTING_COLUMNS)})"
                f" VALUES ({', '.join('?' for _ in _LISTING_COLUMNS)})"
                " ON CONFLICT (kind, beatport_id) DO UPDATE SET"
                " since = excluded.since, fetched_at = excluded.fetched_at,"
                " tracks = excluded.tracks",
                tuple(listing.to_dict()[c] for c in _LISTING_COLUMNS),
            )
        return len(rows)

    # ------------------------------------------------------------------ read

    def listing(self, kind: str, beatport_id: int) -> Optional[BeatportListing]:
        """When an artist's or label's recent tracks were last read, or None."""
        row = (
            self._db.connect()
            .execute(
                f"SELECT {', '.join(_LISTING_COLUMNS)} FROM beatport_listings"
                " WHERE kind = ? AND beatport_id = ?",
                (str(kind), int(beatport_id)),
            )
            .fetchone()
        )
        return None if row is None else BeatportListing.from_row(row)

    def entity_name(self, kind: str, beatport_id: int) -> Optional[str]:
        """How Beatport spells an artist or label the cache has seen, or None.

        The spelling on most cached tracks, then the first alphabetically, so
        a rename read on one track does not flip the page's title.
        """
        if kind == ENTITY_ARTIST:
            sql = (
                "SELECT name, count(*) AS n FROM beatport_track_artists"
                " WHERE artist_id = ? GROUP BY name ORDER BY n DESC, name LIMIT 1"
            )
        elif kind == ENTITY_LABEL:
            sql = (
                "SELECT label_name AS name, count(*) AS n FROM beatport_tracks"
                " WHERE label_id = ? AND label_name IS NOT NULL"
                " GROUP BY label_name ORDER BY n DESC, label_name LIMIT 1"
            )
        else:
            raise ValueError(f"No entity of kind {kind!r}")
        row = self._db.connect().execute(sql, (int(beatport_id),)).fetchone()
        return None if row is None else str(row["name"])

    def entity_tracks(
        self,
        kind: str,
        beatport_id: int,
        since: str,
        until: str,
        owned: str = OWNED_ALL,
        offset: int = 0,
        limit: int = 100,
    ) -> EntityTracksPage:
        """A window of an artist's or label's cached tracks released in a window.

        Newest release first, then the higher id, with ownership read once
        (DEC-092). ``on_wantlist`` is left False: the wantlist's own module
        answers it.

        Raises:
            ValueError: If the kind, the filter or the window is not one this
                answers.
        """
        if kind not in _ENTITY_TRACK_IDS:
            raise ValueError(f"No entity of kind {kind!r}")
        if owned not in OWNED_FILTERS:
            raise ValueError(f"owned must be one of {OWNED_FILTERS}, got {owned!r}")
        if not 1 <= int(limit) <= MAX_ENTITY_WINDOW or int(offset) < 0:
            raise ValueError(
                f"A window is 1 to {MAX_ENTITY_WINDOW} tracks from offset 0 or later"
            )
        ids_sql = _ENTITY_TRACK_IDS[kind]
        conn = self._db.connect()
        values: Dict[str, Any] = {
            "id": int(beatport_id),
            "since": str(since),
            "until": str(until),
            "limit": int(limit),
            "offset": int(offset),
        }
        values["owned"] = owned_among_json(conn, ids_sql, values)
        keeps = _ENTITY_OWNED_KEEPS[owned]
        counted = conn.execute(
            "SELECT count(*) AS tracks,"
            f" coalesce(sum({_ENTITY_OWNED}), 0) AS owned,"
            f" coalesce(sum({keeps}), 0) AS total"
            " FROM beatport_tracks AS b"
            f" WHERE b.beatport_track_id IN ({ids_sql})",
            values,
        ).fetchone()
        rows = conn.execute(
            f"SELECT {_ENTITY_OWNED} AS owned,"
            f" {', '.join('b.' + c for c in CATALOG_TRACK_COLUMNS)}"
            " FROM beatport_tracks AS b"
            f" WHERE b.beatport_track_id IN ({ids_sql}) AND {keeps}"
            " ORDER BY b.release_date DESC, b.beatport_track_id DESC"
            " LIMIT :limit OFFSET :offset",
            values,
        ).fetchall()
        ids = [int(r["beatport_track_id"]) for r in rows]
        credits = credit_names(conn, ids)
        window = tuple(
            EntityTrackRow(
                track=CachedBeatportTrack.from_row(
                    {c: r[c] for c in CATALOG_TRACK_COLUMNS}
                ),
                artists=credits.get(int(r["beatport_track_id"]), ((), ()))[0],
                remixers=credits.get(int(r["beatport_track_id"]), ((), ()))[1],
                owned=bool(r["owned"]),
            )
            for r in rows
        )
        return EntityTracksPage(
            rows=window,
            total=int(counted["total"]),
            tracks=int(counted["tracks"]),
            owned=int(counted["owned"]),
        )

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

    def resolve_counts(self, stale_before: str) -> Tuple[int, int]:
        """``(to_read, owned)``: what :meth:`resolve_plan` would answer, counted.

        The same rule — an owned id with no catalog row, or one fetched before
        ``stale_before`` — in one statement over one scan of the ownership
        view, for a prompt that shows the number and reads no id (DISCOVER-09).
        """
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS owned, coalesce(sum("
                "b.beatport_track_id IS NULL OR b.fetched_at < ?), 0) AS to_read"
                " FROM (SELECT DISTINCT beatport_track_id FROM library_beatport_tracks)"
                " AS l LEFT JOIN beatport_tracks AS b"
                " ON b.beatport_track_id = l.beatport_track_id",
                (stale_before,),
            )
            .fetchone()
        )
        return int(row["to_read"]), int(row["owned"])

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
