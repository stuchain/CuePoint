#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Library source repository: SQL for the DEC-035 record of the imported file.

One row, because the library is singular. :meth:`LibrarySourceRepository.replace`
enforces that rather than the schema doing it — a ``CHECK (id = 1)`` cannot be
dropped without rebuilding the table in SQLite, which is exactly the migration
the table exists to avoid when a later release grows an import history.
"""

from __future__ import annotations

from typing import Optional

from cuepoint.models.library_source import LibrarySource
from cuepoint.services.interfaces import IDatabaseService, ILibrarySourceRepository

_COLUMNS = (
    "xml_path",
    "xml_modified_at",
    "xml_size_bytes",
    "imported_at",
    "track_count",
    "playlist_count",
)

_INSERT_SQL = (
    f"INSERT INTO library_source ({', '.join(_COLUMNS)}) "
    f"VALUES ({', '.join('?' for _ in _COLUMNS)})"
)


class LibrarySourceRepository(ILibrarySourceRepository):
    """Reads and replaces the record of the file the library was imported from."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def replace(self, source: LibrarySource) -> LibrarySource:
        """Make ``source`` the library's only source record.

        Written last in an import, and in its own transaction, so the record
        exists only when everything before it succeeded. An import that fails
        part way leaves no source record, and the library correctly reports that
        it has not been imported from a file — which is the honest answer, and
        the one a retry can act on.
        """
        data = source.to_dict()
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM library_source")
            cursor = conn.execute(
                _INSERT_SQL, tuple(data[column] for column in _COLUMNS)
            )
            row_id = int(cursor.lastrowid or 0)
        return LibrarySource(
            xml_path=source.xml_path,
            imported_at=source.imported_at,
            xml_modified_at=source.xml_modified_at,
            xml_size_bytes=source.xml_size_bytes,
            track_count=source.track_count,
            playlist_count=source.playlist_count,
            id=row_id,
        )

    def get(self) -> Optional[LibrarySource]:
        """Return the current source record, or None if nothing was imported.

        The most recent row wins if more than one ever exists, so a future
        import history reads correctly through this method without a migration.
        """
        row = (
            self._db.connect()
            .execute("SELECT * FROM library_source ORDER BY id DESC LIMIT 1")
            .fetchone()
        )
        return LibrarySource.from_row(row) if row is not None else None

    def clear(self) -> None:
        """Forget where the library came from."""
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM library_source")
