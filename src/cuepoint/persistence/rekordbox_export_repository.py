#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the record of Rekordbox exports (EXPORT-05, DEC-086).

The two tables ``m0020_rekordbox_exports`` created, written for the first time.
One row per export and one per playlist it wrote; nothing here touches a track,
because DEC-086 keeps no per-track export state.

Append-only in practice
-----------------------
A row is written once, when an export ends, and never updated: the outcome is
known by then and nothing about an export changes afterwards. There is no
delete either. A history a user can prune belongs to whichever step offers
pruning, and until then a row that could vanish is a row nobody can rely on to
answer "where did my last export go".

Transactions join a caller's, as everywhere here, so an export's row, its
playlist rows and its activity event commit together or not at all.
"""

from __future__ import annotations

from typing import List, Optional, Sequence

from cuepoint.models.rekordbox_export import (
    EXPORT_WRITTEN,
    RekordboxExport,
    RekordboxExportPlaylist,
)
from cuepoint.services.interfaces import IDatabaseService, IRekordboxExportRepository

_EXPORT_COLUMNS = (
    "job_id",
    "started_at",
    "finished_at",
    "outcome",
    "destination_path",
    "source_path",
    "source_stale",
    "track_count",
    "changed_track_count",
    "fields_json",
    "key_format",
    "missing_file_count",
    "dropped_reference_count",
    "error",
)

_PLAYLIST_COLUMNS = (
    "export_id",
    "collection_id",
    "kind",
    "name",
    "path",
    "entry_count",
    "dropped_count",
    "rules_json",
)

_SELECT_EXPORT = f"SELECT id, {', '.join(_EXPORT_COLUMNS)} FROM rekordbox_exports"
_SELECT_PLAYLIST = (
    f"SELECT id, {', '.join(_PLAYLIST_COLUMNS)} FROM rekordbox_export_playlists"
)

_INSERT_EXPORT = (
    f"INSERT INTO rekordbox_exports ({', '.join(_EXPORT_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _EXPORT_COLUMNS)})"
)
_INSERT_PLAYLIST = (
    f"INSERT INTO rekordbox_export_playlists ({', '.join(_PLAYLIST_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _PLAYLIST_COLUMNS)})"
)

#: The most rows :meth:`RekordboxExportRepository.recent` answers with. A history
#: list is read by a person; a caller wanting more is asking a different question.
MAX_RECENT = 200


class RekordboxExportRepository(IRekordboxExportRepository):
    """Persistence for the record of each export and the playlists it wrote."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    def add(self, export: RekordboxExport) -> RekordboxExport:
        """Record one export and return it with its id.

        Its playlists follow in :meth:`add_playlists`, which needs this id; a
        caller wanting both or neither opens one transaction around the two.

        Raises:
            ValueError: If the export already has an id: a row is recorded once.
        """
        if export.id is not None:
            raise ValueError("An export is recorded once")
        values = export.to_dict()
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                _INSERT_EXPORT, tuple(values[column] for column in _EXPORT_COLUMNS)
            )
            export_id = int(cursor.lastrowid or 0)
            row = conn.execute(
                f"{_SELECT_EXPORT} WHERE id = ?", (export_id,)
            ).fetchone()
        return RekordboxExport.from_row(row)

    def add_playlists(
        self, playlists: Sequence[RekordboxExportPlaylist]
    ) -> List[RekordboxExportPlaylist]:
        """Record the playlists an export wrote, in order, and return them with ids.

        Raises:
            ValueError: If a row already has an id.
        """
        stored: List[RekordboxExportPlaylist] = []
        if not playlists:
            return stored
        with self._db.transaction(join_existing=True) as conn:
            for playlist in playlists:
                if playlist.id is not None:
                    raise ValueError("A playlist row is recorded once")
                values = playlist.to_dict()
                cursor = conn.execute(
                    _INSERT_PLAYLIST,
                    tuple(values[column] for column in _PLAYLIST_COLUMNS),
                )
                row = conn.execute(
                    f"{_SELECT_PLAYLIST} WHERE id = ?", (int(cursor.lastrowid or 0),)
                ).fetchone()
                stored.append(RekordboxExportPlaylist.from_row(row))
        return stored

    def get(self, export_id: int) -> Optional[RekordboxExport]:
        """Return one export, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_EXPORT} WHERE id = ?", (int(export_id),))
            .fetchone()
        )
        return None if row is None else RekordboxExport.from_row(row)

    def for_job(self, job_id: str) -> Optional[RekordboxExport]:
        """Return the export a job recorded, or ``None`` if it recorded none."""
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_EXPORT} WHERE job_id = ? ORDER BY id DESC LIMIT 1",
                (str(job_id),),
            )
            .fetchone()
        )
        return None if row is None else RekordboxExport.from_row(row)

    def playlists_for(self, export_id: int) -> List[RekordboxExportPlaylist]:
        """Return the playlists an export wrote, in the order they were written."""
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_PLAYLIST} WHERE export_id = ? ORDER BY id",
                (int(export_id),),
            )
            .fetchall()
        )
        return [RekordboxExportPlaylist.from_row(row) for row in rows]

    def recent(self, limit: int = 20) -> List[RekordboxExport]:
        """Return the newest exports first, whatever their outcome.

        By id rather than by ``started_at``: ids are never reused
        (``AUTOINCREMENT``), and two exports started in one clock tick still
        come back in the order they were recorded.
        """
        wanted = max(1, min(int(limit), MAX_RECENT))
        rows = (
            self._db.connect()
            .execute(f"{_SELECT_EXPORT} ORDER BY id DESC LIMIT ?", (wanted,))
            .fetchall()
        )
        return [RekordboxExport.from_row(row) for row in rows]

    def latest_written(self) -> Optional[RekordboxExport]:
        """Return the most recent export that wrote its file, or ``None``.

        What DEC-083 pre-fills the next save dialog's folder from. A cancelled
        or failed export is skipped: its destination is somewhere nothing was
        written, which is no reason to suggest it again.
        """
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_EXPORT} WHERE outcome = ? ORDER BY id DESC LIMIT 1",
                (EXPORT_WRITTEN,),
            )
            .fetchone()
        )
        return None if row is None else RekordboxExport.from_row(row)


__all__ = ("MAX_RECENT", "RekordboxExportRepository")
