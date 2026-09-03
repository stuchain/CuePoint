#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
The XML file a library was imported from (DEC-035).

A refresh has to know what to re-read. Asking every time turns routine
refreshing into a file dialog and lets a different export silently replace the
library; watching the file would mean a background watcher and unprompted
interruptions. So the import records the path it read, along with enough of the
file's state — modified time and size — for a later refresh to say "unchanged
since the last import" or "that file has moved" instead of guessing.

Logically there is one record: the library is singular. It lives in a table
rather than a settings key so a later release can keep a short import history
without a migration that moves data out of a config blob, which is why nothing
here assumes a fixed row id.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def _iso_from_timestamp(timestamp: float) -> str:
    """Return a POSIX timestamp as an ISO-8601 UTC string."""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


@dataclass(frozen=True)
class LibrarySource:
    """Where a library came from, and what that import produced.

    Attributes:
        xml_path: The export's path, exactly as it was given — not resolved
            against the filesystem, so what a user sees is what they chose.
        xml_modified_at: The file's modified time when it was read (ISO-8601,
            UTC), or ``None`` when it could not be read.
        xml_size_bytes: The file's size when it was read, or ``None``.
        imported_at: When the import finished (ISO-8601, UTC).
        track_count: Tracks the library held afterwards.
        playlist_count: Playlist nodes the library held afterwards, folders
            included.
        id: Database primary key; ``None`` until persisted.
    """

    xml_path: str
    imported_at: str
    xml_modified_at: Optional[str] = None
    xml_size_bytes: Optional[int] = None
    track_count: int = 0
    playlist_count: int = 0
    id: Optional[int] = None

    @property
    def is_stat_known(self) -> bool:
        """True when the file's state was recorded and a refresh can compare it.

        False means the ``stat`` failed at import time. A refresh must then
        re-read the file rather than deciding it is unchanged, because it has
        nothing to compare against.
        """
        return self.xml_modified_at is not None and self.xml_size_bytes is not None

    def matches_file_on_disk(self, xml_path: Optional[str] = None) -> bool:
        """True when the file still looks exactly as it did at import.

        Deliberately conservative: an unreadable file, a missing one, or an
        import that never recorded the file's state all answer False, because
        each of those is a reason to re-read rather than to skip. The last of
        those needs no branch of its own — a recorded ``None`` never equals a
        real modified time — and an explicit guard here would be code no test
        could ever distinguish from its absence.
        """
        current = describe_file(xml_path or self.xml_path)
        if current is None:
            return False
        modified, size = current
        return modified == self.xml_modified_at and size == self.xml_size_bytes

    def to_dict(self) -> Dict[str, Any]:
        """Return a plain dict, suitable for persistence or serialization."""
        return {
            "id": self.id,
            "xml_path": self.xml_path,
            "xml_modified_at": self.xml_modified_at,
            "xml_size_bytes": self.xml_size_bytes,
            "imported_at": self.imported_at,
            "track_count": self.track_count,
            "playlist_count": self.playlist_count,
        }

    @classmethod
    def from_row(cls, row: Any) -> "LibrarySource":
        """Build a source record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            xml_path=data.get("xml_path") or "",
            xml_modified_at=data.get("xml_modified_at"),
            xml_size_bytes=data.get("xml_size_bytes"),
            imported_at=data.get("imported_at") or "",
            track_count=int(data.get("track_count") or 0),
            playlist_count=int(data.get("playlist_count") or 0),
        )


def describe_file(xml_path: str) -> Optional[Tuple[str, int]]:
    """Return ``(modified_at_iso, size_bytes)`` for a file, or None.

    None rather than an exception: a ``stat`` that fails on an unusual
    filesystem should cost a refresh its "unchanged?" shortcut, not cost the
    user their import. Every caller here treats the absence as "re-read it".
    """
    try:
        stat = os.stat(xml_path)
    except OSError:
        return None
    return _iso_from_timestamp(stat.st_mtime), int(stat.st_size)


def source_for_import(
    xml_path: str,
    imported_at: str,
    track_count: int,
    playlist_count: int,
) -> LibrarySource:
    """Build the record describing an import that has just finished."""
    described = describe_file(xml_path)
    modified_at, size_bytes = described if described is not None else (None, None)
    return LibrarySource(
        xml_path=str(Path(xml_path)),
        imported_at=imported_at,
        xml_modified_at=modified_at,
        xml_size_bytes=size_bytes,
        track_count=track_count,
        playlist_count=playlist_count,
    )
