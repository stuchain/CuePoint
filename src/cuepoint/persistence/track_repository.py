#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track repository: all SQL for the library ``tracks`` table.

Backed by :class:`~cuepoint.services.database_service.DatabaseService` and
storing :class:`~cuepoint.models.library_track.LibraryTrack` rows, including the
DEC-002 identity lookups a Rekordbox refresh depends on.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from cuepoint.models.library_track import (
    IdentityMatch,
    LibraryTrack,
    normalize_path,
    resolve_identity,
    utc_now_iso,
)
from cuepoint.models.filter_rule import Facet, FacetRange, FacetValue, field_spec
from cuepoint.persistence.track_query import (
    BrowseQuery,
    build_count,
    build_facet_range,
    build_facet_value_count,
    build_facet_values,
    build_select,
    build_select_ids,
    clamp_facet_limit,
    search_clause,
)
from cuepoint.services.interfaces import IDatabaseService, ITrackRepository

# Rows per executemany during a bulk import. Large enough that the statement
# overhead disappears, small enough that one statement's parameters stay a
# few megabytes rather than a few hundred at fifty thousand tracks.
_UPSERT_BATCH_SIZE = 1000

# Column order used for inserts and updates. "id" is excluded: SQLite assigns it.
_COLUMNS = (
    "rekordbox_track_id",
    "file_path",
    "normalized_path",
    "title",
    "artist",
    "remixer",
    "album",
    "label",
    "genre",
    "key",
    "bpm",
    "year",
    "duration_seconds",
    "rating",
    "play_count",
    "colour",
    "date_added",
    "comment",
    "bitrate",
    "created_at",
    "updated_at",
)

_INSERT_SQL = (
    f"INSERT INTO tracks ({', '.join(_COLUMNS)}) "
    f"VALUES ({', '.join('?' for _ in _COLUMNS)})"
)

_UPDATE_SQL = (
    "UPDATE tracks SET "
    + ", ".join(f"{column} = ?" for column in _COLUMNS)
    + " WHERE id = ?"
)

_SELECT = "SELECT * FROM tracks"


@dataclass(frozen=True)
class RelinkedTrack:
    """A track whose Rekordbox TrackID changed but whose file did not (DEC-002).

    Attributes:
        rekordbox_track_id: The TrackID the export now uses.
        previous_rekordbox_track_id: The TrackID the library held before.
        file_path: The path both agree on, which is what matched them.
    """

    rekordbox_track_id: str
    previous_rekordbox_track_id: str
    file_path: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename.

        Here rather than in the diff because a refresh preview carries these in
        a ``Category`` alongside track and playlist summaries, and that class
        serializes whatever it holds by asking it. Without this, a diff for a
        collection Rekordbox had renumbered could be computed and then not sent
        — which is what happened, and is why LIBRARY-12's end-to-end run exists.
        """
        return {
            "rekordbox_track_id": self.rekordbox_track_id,
            "previous_rekordbox_track_id": self.previous_rekordbox_track_id,
            "file_path": self.file_path,
        }


@dataclass(frozen=True)
class BulkUpsertResult:
    """What one bulk upsert changed.

    Attributes:
        inserted: Tracks the library had not seen before.
        updated: Tracks matched to an existing row and refreshed.
        relinked: Every track matched by path because Rekordbox had renumbered
            it. Listed rather than counted because DEC-002 requires re-links to
            be reported: a user whose library was rebuilt should be able to see
            which tracks kept their tags and why.
        unclaimed_track_ids: Library rows no incoming track matched — the tracks
            that are no longer in the export. An import ignores them, because an
            import only ever adds and updates. A refresh deletes them (DEC-003),
            and taking them from the same pass that did the matching is what
            keeps the two from ever disagreeing about which rows those are.
    """

    inserted: int = 0
    updated: int = 0
    relinked: Tuple[RelinkedTrack, ...] = ()
    unclaimed_track_ids: Tuple[int, ...] = ()

    @property
    def total(self) -> int:
        """Tracks written, inserted and updated together."""
        return self.inserted + self.updated

    @property
    def relinked_count(self) -> int:
        """How many tracks were matched by path after a renumbering."""
        return len(self.relinked)

    @property
    def unclaimed_count(self) -> int:
        """How many library rows the export no longer contains."""
        return len(self.unclaimed_track_ids)


class TrackRepository(ITrackRepository):
    """Reads and writes library tracks."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _values(track: LibraryTrack) -> tuple:
        data = track.to_dict()
        return tuple(data[column] for column in _COLUMNS)

    # ------------------------------------------------------------------ write

    def add(self, track: LibraryTrack) -> LibraryTrack:
        """Insert a track and return it with its assigned ``id``.

        Raises:
            sqlite3.IntegrityError: If a track with the same
                ``rekordbox_track_id`` already exists.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(_INSERT_SQL, self._values(track))
            track.id = int(cursor.lastrowid or 0)
        return track

    def add_many(self, tracks: Iterable[LibraryTrack]) -> int:
        """Insert many tracks in one transaction.

        A Rekordbox import inserts thousands of rows; one transaction for the
        batch rather than one per row is the difference between seconds and
        minutes, and it means a failed import leaves nothing behind.

        Returns:
            Number of tracks inserted.
        """
        rows = [self._values(track) for track in tracks]
        if not rows:
            return 0
        with self._db.transaction(join_existing=True) as conn:
            conn.executemany(_INSERT_SQL, rows)
        return len(rows)

    def update(self, track: LibraryTrack) -> LibraryTrack:
        """Persist changes to an existing track, refreshing ``updated_at``.

        Raises:
            ValueError: If the track has no ``id`` (never persisted).
        """
        if track.id is None:
            raise ValueError("Cannot update a track that has no id")
        track.touch()
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(_UPDATE_SQL, (*self._values(track), track.id))
        return track

    def delete(self, track_id: int) -> bool:
        """Delete a track by id. Returns True if a row was removed."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
            return cursor.rowcount > 0

    def delete_many(self, track_ids: Iterable[int]) -> int:
        """Delete tracks by library id, in one transaction.

        The form a refresh needs: ``upsert_many_from_rekordbox`` reports the
        rows it did not claim as ids, and those are exactly the tracks the
        export no longer contains (DEC-003).

        Deleting cascades — playlist membership goes with the track (LIBRARY-03),
        its field history goes with it (FOUNDATION-08), and from Phase 6 so does
        anything else that references it. That is why LIBRARY-08's seam must be
        consulted first, and why this method is on the watched list in
        ``tests/unit/services/test_reference_check_seam.py``.

        Returns:
            Number of tracks deleted.
        """
        ids = [int(value) for value in track_ids]
        if not ids:
            return 0
        deleted = 0
        with self._db.transaction(join_existing=True) as conn:
            for track_id in ids:
                cursor = conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
                deleted += cursor.rowcount
        return deleted

    def delete_by_rekordbox_ids(self, rekordbox_track_ids: Iterable[str]) -> int:
        """Delete tracks by Rekordbox TrackID (DEC-003 refresh removal).

        Returns:
            Number of tracks deleted.
        """
        ids = [
            str(value).strip() for value in rekordbox_track_ids if str(value).strip()
        ]
        if not ids:
            return 0
        deleted = 0
        with self._db.transaction(join_existing=True) as conn:
            for rekordbox_id in ids:
                cursor = conn.execute(
                    "DELETE FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,)
                )
                deleted += cursor.rowcount
        return deleted

    # ------------------------------------------------------------------- read

    def get(self, track_id: int) -> Optional[LibraryTrack]:
        """Return a track by primary key, or None."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE id = ?", (track_id,))
            .fetchone()
        )
        return LibraryTrack.from_row(row) if row is not None else None

    def find_by_rekordbox_id(self, rekordbox_track_id: str) -> Optional[LibraryTrack]:
        """Return the track with this Rekordbox TrackID, or None."""
        identifier = str(rekordbox_track_id).strip()
        if not identifier:
            return None
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE rekordbox_track_id = ?", (identifier,))
            .fetchone()
        )
        return LibraryTrack.from_row(row) if row is not None else None

    def find_by_normalized_path(self, normalized: str) -> Optional[LibraryTrack]:
        """Return a track whose normalized path matches, or None.

        The path index is not unique, so more than one row can match after a
        file move. The lowest id wins, deterministically, rather than leaving
        the choice to SQLite's row order.
        """
        if not normalized:
            return None
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT} WHERE normalized_path = ? ORDER BY id LIMIT 1",
                (normalized,),
            )
            .fetchone()
        )
        return LibraryTrack.from_row(row) if row is not None else None

    def find_by_path(self, file_path: str) -> Optional[LibraryTrack]:
        """Return a track matching this path, normalizing it first."""
        return self.find_by_normalized_path(normalize_path(file_path))

    def resolve_identity(
        self, rekordbox_track_id: str, file_path: Optional[str]
    ) -> Optional[IdentityMatch]:
        """Find the library track an incoming Rekordbox track refers to.

        Applies DEC-002: TrackID first, normalized path as fallback, with
        re-links flagged. See
        :func:`cuepoint.models.library_track.resolve_identity`.
        """
        return resolve_identity(
            rekordbox_track_id,
            file_path,
            self.find_by_rekordbox_id,
            self.find_by_normalized_path,
        )

    def list_all(
        self, limit: Optional[int] = None, offset: int = 0
    ) -> List[LibraryTrack]:
        """Return tracks ordered by artist then title.

        ``limit`` is optional but callers displaying a library should pass one:
        a full read of a 50,000-track library materializes every row.
        """
        sql = f"{_SELECT} ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE"
        params: tuple = ()
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            params = (int(limit), int(offset))
        rows = self._db.connect().execute(sql, params).fetchall()
        return [LibraryTrack.from_row(row) for row in rows]

    def search(
        self, query: str, limit: int = 50, offset: int = 0
    ) -> List[LibraryTrack]:
        """Return tracks matching ``query``, ordered by artist then title.

        Case-insensitive substring match across title, artist, album and label.
        Deliberately LIKE rather than FTS5: SHELL-04 needs one reviewable
        contract now, and Phase 4 can add ranking behind the same response.
        """
        pattern, sql, params = search_clause(query)
        if pattern is None:
            return []
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT} WHERE {sql} "
                "ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE "
                "LIMIT ? OFFSET ?",
                (*params, int(limit), int(offset)),
            )
            .fetchall()
        )
        return [LibraryTrack.from_row(row) for row in rows]

    def search_count(self, query: str) -> int:
        """Return how many tracks match ``query``, ignoring paging.

        Separate from :meth:`search` so a caller can say "showing 20 of 340"
        without reading 340 rows to find out.
        """
        pattern, sql, params = search_clause(query)
        if pattern is None:
            return 0
        row = (
            self._db.connect()
            .execute(f"SELECT count(*) AS n FROM tracks WHERE {sql}", params)
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    def browse(
        self,
        query: Optional[BrowseQuery] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List[LibraryTrack]:
        """Return one window of the library, scoped, ordered and paged.

        The read behind the Library table (LIBUI-01, DEC-040). Unlike
        :meth:`search`, a blank text query means *everything in scope* rather
        than nothing: a table with an empty search box shows the library, while
        a search box with nothing typed in it is not a request to read one.

        ``limit`` and ``offset`` are clamped rather than trusted — this is
        reached from an HTTP handler — and the ordering always ends with the
        row id, so paging cannot repeat or skip a row where sort values tie.

        Args:
            query: What to show. Defaults to the whole library in the default
                order.
            limit: Rows to return, clamped to ``BROWSE_LIMIT_MAX``.
            offset: Rows to skip, clamped to zero or more.

        Raises:
            BrowseQueryError: If the sort or direction is not one that exists,
                or the sort needs a scope it was not given.
        """
        sql, params = build_select(query or BrowseQuery(), limit, offset)
        rows = self._db.connect().execute(sql, params).fetchall()
        return [LibraryTrack.from_row(row) for row in rows]

    def browse_ids(
        self,
        query: Optional[BrowseQuery] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List[int]:
        """Return the ids :meth:`browse` would return, in the same order.

        The same predicate and ordering with a narrower projection, so a
        selection can name rows the table has not loaded (DEC-045) without a
        second query path that could disagree about which rows those are.
        """
        sql, params = build_select_ids(query or BrowseQuery(), limit, offset)
        rows = self._db.connect().execute(sql, params).fetchall()
        return [int(row["id"]) for row in rows]

    def browse_count(self, query: Optional[BrowseQuery] = None) -> int:
        """Return how many tracks :meth:`browse` would return, ignoring paging.

        The number a table needs to say "showing 100 of 47,913" and to size its
        scrollbar, so it is asked once per query rather than inferred from a
        window. Built from the same predicate as the rows it counts, in
        ``track_query``, because a count of a different set of rows is worse
        than no count at all.

        Raises:
            BrowseQueryError: As :meth:`browse` does.
        """
        sql, params = build_count(query or BrowseQuery())
        row = self._db.connect().execute(sql, params).fetchone()
        return int(row["n"]) if row is not None else 0

    def facet_values(
        self, query: Optional[BrowseQuery] = None, field: str = "genre", limit: int = 0
    ) -> Facet:
        """Return which values a field takes in the current view, with counts.

        What a filter list is built from (LIBUI-02, LIBUI-08). Computed over
        the playlist scope, the text query and every filter *except* this
        field's own, so choosing one genre still leaves the other genres
        choosable — see :func:`~cuepoint.persistence.track_query.facet_query`.

        The counts come from the library, not from the loaded window: a facet
        that counted only what is on screen would say "House (100)" for every
        library.

        Args:
            query: The current view. Defaults to the whole library.
            field: A facetable field name.
            limit: Values to return; ``0`` means the default page size. One
                more than the limit is read internally so ``truncated`` can be
                answered without a second query.

        Raises:
            FilterRuleError: If the field cannot be filtered.
            BrowseQueryError: Via :meth:`browse`'s validation.
        """
        spec = field_spec(field)
        browse_query = query or BrowseQuery()
        page = clamp_facet_limit(limit or None)

        sql, params = build_facet_values(browse_query, spec.name, page)
        rows = self._db.connect().execute(sql, params).fetchall()

        truncated = len(rows) > page
        named = tuple(
            FacetValue(value=str(row["raw_value"]), count=int(row["n"]))
            for row in rows[:page]
        )

        count_sql, count_params = build_facet_value_count(browse_query, spec.name)
        totals = self._db.connect().execute(count_sql, count_params).fetchone()
        distinct = int(totals["values_count"] or 0) if totals is not None else 0
        missing = int(totals["missing"] or 0) if totals is not None else 0

        # The "no value" bucket comes from the totals rather than the value
        # rows, so it is always offered when it exists — a limit cannot cut it
        # off, however many values are more common than it. It sits last
        # whatever its count, because it is not a value.
        gap = (FacetValue(value=None, count=missing),) if missing else ()

        return Facet(
            field=spec.name,
            values=named + gap,
            truncated=truncated,
            # The gap counts as one of the choices offered, so "showing 100 of
            # 240" stays true when one of them is "no genre".
            total_values=distinct + (1 if missing else 0),
        )

    def facet_range(
        self, query: Optional[BrowseQuery] = None, field: str = "bpm"
    ) -> FacetRange:
        """Return the span of a numeric field in the current view.

        Both ends and how many tracks have no value, which is what a range
        control needs to draw itself honestly rather than treating a missing
        BPM as zero.

        Raises:
            FilterRuleError: If the field cannot be filtered.
            BrowseQueryError: If the field is not numeric.
        """
        spec = field_spec(field)
        sql, params = build_facet_range(query or BrowseQuery(), spec.name)
        row = self._db.connect().execute(sql, params).fetchone()
        if row is None:
            return FacetRange(field=spec.name)
        return FacetRange(
            field=spec.name,
            minimum=None if row["low"] is None else float(row["low"]),
            maximum=None if row["high"] is None else float(row["high"]),
            missing=int(row["missing"] or 0),
        )

    def count(self) -> int:
        """Return the number of tracks in the library."""
        row = self._db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()
        return int(row["n"]) if row is not None else 0

    def exists(self, rekordbox_track_id: str) -> bool:
        """Return True if a track with this Rekordbox TrackID is stored."""
        return self.find_by_rekordbox_id(rekordbox_track_id) is not None

    # ----------------------------------------------------------------- upsert

    def upsert_from_rekordbox(
        self, track: LibraryTrack
    ) -> tuple[LibraryTrack, str, bool]:
        """Insert or update an incoming Rekordbox track, applying DEC-002.

        Returns:
            ``(track, action, relinked)`` where ``action`` is ``"inserted"`` or
            ``"updated"`` and ``relinked`` is True when an existing track was
            matched by path because Rekordbox had renumbered it. Callers report
            re-links rather than applying them silently.
        """
        match = self.resolve_identity(track.rekordbox_track_id, track.file_path)
        if match is None:
            return self.add(track), "inserted", False

        existing = match.track
        track.id = existing.id
        # created_at belongs to the row, not to the incoming export.
        track.created_at = existing.created_at
        track.updated_at = utc_now_iso()
        return self.update(track), "updated", match.relinked

    # ----------------------------------------------------------- bulk upsert

    def upsert_many_from_rekordbox(
        self, tracks: Iterable[LibraryTrack], batch_size: int = _UPSERT_BATCH_SIZE
    ) -> BulkUpsertResult:
        """Insert or update a whole collection, applying DEC-002 identity.

        The bulk form of :meth:`upsert_from_rekordbox`, and it exists because
        that method cannot be looped. It runs two lookups and a write per track,
        each in **its own transaction**: fifty thousand tracks would be fifty
        thousand commits, which is the difference between seconds and an hour.

        It is not a second identity rule. The same
        :func:`~cuepoint.models.library_track.resolve_identity` decides every
        match — that function takes its two lookups as callables precisely so
        they can be dictionaries here instead of queries. If the rule ever
        changes, both paths change with it.

        **Identity is resolved against the library as it was before this import
        began.** The maps are built once, up front, and a row already written by
        this same import is never matched again. Both halves matter:

        - Without the snapshot, two incoming tracks sharing a file path would
          collapse into one row — the second would path-match the row the first
          had just inserted and overwrite it. Rekordbox says they are two
          tracks, and the library must agree.
        - Without the claim set, the same would happen through an update.

        The cost is holding the identity of every existing track in memory —
        roughly 25 MB at fifty thousand tracks, freed when the import ends. A
        per-batch query instead would be smaller but would see this import's own
        writes, which is the behaviour above that has to be avoided.

        Args:
            tracks: Incoming tracks, in any order.
            batch_size: Rows per ``executemany``. Everything is still one
                transaction; this only bounds the size of a single statement.

        Returns:
            A :class:`BulkUpsertResult` with the counts and every re-link.

        Note:
            Inserted tracks are **not** stamped with their new ``id`` —
            ``executemany`` does not report one per row. Callers needing ids
            read them back; ``PlaylistRepository`` already does.
        """
        incoming = list(tracks)
        by_rekordbox_id, by_path = self.identity_snapshot()
        unclaimed = {
            track.id: track
            for track in by_rekordbox_id.values()
            if track.id is not None
        }
        if not incoming:
            # Still a real answer: an empty export claims nothing, so every row
            # in the library is unclaimed. A refresh against an emptied
            # collection has to be able to say that.
            return BulkUpsertResult(unclaimed_track_ids=tuple(sorted(unclaimed)))

        claimed: set = set()

        inserted = 0
        updated = 0
        relinked: List[RelinkedTrack] = []
        insert_rows: List[tuple] = []
        update_rows: List[tuple] = []

        with self._db.transaction(join_existing=True) as conn:
            for track in incoming:
                match = resolve_identity(
                    track.rekordbox_track_id,
                    track.file_path,
                    by_rekordbox_id.get,
                    by_path.get,
                )
                existing = match.track if match is not None else None
                if existing is None or existing.id in claimed:
                    insert_rows.append(self._values(track))
                    inserted += 1
                else:
                    claimed.add(existing.id)
                    unclaimed.pop(existing.id, None)
                    track.id = existing.id
                    # created_at belongs to the row, not to the incoming export.
                    track.created_at = existing.created_at
                    track.updated_at = utc_now_iso()
                    update_rows.append((*self._values(track), existing.id))
                    updated += 1
                    if match is not None and match.relinked:
                        relinked.append(
                            RelinkedTrack(
                                rekordbox_track_id=track.rekordbox_track_id,
                                previous_rekordbox_track_id=(
                                    existing.rekordbox_track_id
                                ),
                                file_path=track.file_path,
                            )
                        )

                if len(insert_rows) >= batch_size:
                    conn.executemany(_INSERT_SQL, insert_rows)
                    insert_rows = []
                if len(update_rows) >= batch_size:
                    conn.executemany(_UPDATE_SQL, update_rows)
                    update_rows = []

            if insert_rows:
                conn.executemany(_INSERT_SQL, insert_rows)
            if update_rows:
                conn.executemany(_UPDATE_SQL, update_rows)

        return BulkUpsertResult(
            inserted=inserted,
            updated=updated,
            relinked=tuple(relinked),
            unclaimed_track_ids=tuple(sorted(unclaimed)),
        )

    def identity_snapshot(self) -> tuple:
        """Return ``(by_rekordbox_id, by_normalized_path)`` for the whole library.

        Whole rows rather than the four columns identity strictly needs, because
        two callers share this: the bulk upsert, which needs ``id`` and
        ``created_at``, and LIBRARY-07's refresh diff, which also compares every
        Rekordbox-sourced field. One method means the two cannot drift on *what
        a match is* — and a preview that classified a track differently from the
        apply that follows it would be worse than no preview. The cost is
        roughly 35 MB at fifty thousand tracks, freed when the operation ends.

        Ordered by id so that a path shared by several rows resolves to the
        lowest one — matching :meth:`find_by_normalized_path`, which a
        single-track upsert would have used.
        """
        by_rekordbox_id: dict = {}
        by_path: dict = {}
        rows = self._db.connect().execute(f"{_SELECT} ORDER BY id")
        for row in rows:
            track = LibraryTrack.from_row(row)
            by_rekordbox_id[track.rekordbox_track_id] = track
            if track.normalized_path and track.normalized_path not in by_path:
                by_path[track.normalized_path] = track
        return by_rekordbox_id, by_path
