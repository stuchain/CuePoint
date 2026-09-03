#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track repository: all SQL for the library ``tracks`` table.

Backed by :class:`~cuepoint.services.database_service.DatabaseService` and
storing :class:`~cuepoint.models.library_track.LibraryTrack` rows, including the
DEC-002 identity lookups a Rekordbox refresh depends on.
"""

from __future__ import annotations

from typing import Iterable, List, Optional

from cuepoint.models.library_track import (
    IdentityMatch,
    LibraryTrack,
    normalize_path,
    resolve_identity,
    utc_now_iso,
)
from cuepoint.services.interfaces import IDatabaseService, ITrackRepository

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
    "total_time",
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

# Columns a global search looks in. Deliberately not file_path: a substring of a
# directory name would match every track under it, which reads as a broken
# search rather than a useful one.
_SEARCH_COLUMNS = ("title", "artist", "album", "label")

# `!` rather than the more usual `\`, so the pattern stays readable in a log and
# no shell or Python escaping layer can eat it before SQLite sees it.
_LIKE_ESCAPE = "!"


def _escape_like(value: str) -> str:
    """Neutralize LIKE wildcards in user input.

    Parameter binding stops SQL injection, but it does not stop `%` and `_`
    from being read as wildcards: searching for `_` would otherwise match every
    track with at least one character in that field.
    """
    out = value.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2)
    out = out.replace("%", f"{_LIKE_ESCAPE}%")
    return out.replace("_", f"{_LIKE_ESCAPE}_")


def _search_clause(query: str):
    """Build the WHERE fragment and parameters for a search.

    Returns ``(None, "", ())`` for a blank query. An empty search returning the
    whole library would be a surprising amount of work and a surprising result.
    """
    text = (query or "").strip()
    if not text:
        return None, "", ()
    pattern = f"%{_escape_like(text)}%"
    sql = " OR ".join(
        f"{column} LIKE ? ESCAPE '{_LIKE_ESCAPE}'" for column in _SEARCH_COLUMNS
    )
    return pattern, f"({sql})", tuple(pattern for _ in _SEARCH_COLUMNS)


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
        with self._db.transaction() as conn:
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
        with self._db.transaction() as conn:
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
        with self._db.transaction() as conn:
            conn.execute(_UPDATE_SQL, (*self._values(track), track.id))
        return track

    def delete(self, track_id: int) -> bool:
        """Delete a track by id. Returns True if a row was removed."""
        with self._db.transaction() as conn:
            cursor = conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
            return cursor.rowcount > 0

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
        with self._db.transaction() as conn:
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
        pattern, sql, params = _search_clause(query)
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
        pattern, sql, params = _search_clause(query)
        if pattern is None:
            return 0
        row = (
            self._db.connect()
            .execute(f"SELECT count(*) AS n FROM tracks WHERE {sql}", params)
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

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
