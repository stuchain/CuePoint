#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Whether a track's file was there when it was last checked (CLEAN-01, DEC-073).

The type over ``track_files``. A check is a fact about a moment and a path,
not about a track forever: files are moved, drives are unplugged, and a refresh
can change the path Rekordbox reports. So the row remembers the path it
checked, and :meth:`TrackFileStatus.is_stale_for` says when that is no longer
the path the library holds — a stale answer shown as stale rather than as
silently wrong.

No row means the track has never been checked, which is DEC-037's "unchecked"
and not the same as missing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import (
    one_of,
    optional_non_negative,
    required_id,
    required_text,
)

#: The file was there and could be read.
FILE_PRESENT = "present"

#: Nothing was at the path.
FILE_MISSING = "missing"

#: Something was at the path and could not be read.
FILE_UNREADABLE = "unreadable"

FILE_STATUSES = (FILE_PRESENT, FILE_MISSING, FILE_UNREADABLE)


@dataclass(frozen=True)
class TrackFileStatus:
    """The result of checking one track's file.

    Attributes:
        track_id: The library track. Also the primary key.
        status: One of :data:`FILE_STATUSES`.
        checked_path: The path exactly as it was checked.
        checked_at: When.
        size_bytes: The file's size when it was found. A missing file has no
            size, and one is refused rather than stored.
    """

    track_id: int
    status: str
    checked_path: str
    checked_at: str
    size_bytes: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the check."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.status, FILE_STATUSES, "status")
        required_text(self.checked_path, "checked_path")
        required_text(self.checked_at, "checked_at")
        object.__setattr__(
            self, "size_bytes", optional_non_negative(self.size_bytes, "size_bytes")
        )
        if self.status == FILE_MISSING and self.size_bytes is not None:
            raise ValueError("A missing file cannot have a size")

    @property
    def is_present(self) -> bool:
        """True when the file was there and readable."""
        return self.status == FILE_PRESENT

    @property
    def is_missing(self) -> bool:
        """True when nothing was at the path."""
        return self.status == FILE_MISSING

    def is_stale_for(self, current_path: Optional[str]) -> bool:
        """True when the library's path is no longer the one that was checked.

        Compared exactly. Two spellings of a path that happen to reach the same
        file are still two paths, and the check answered for one of them.
        """
        return self.checked_path != (current_path or "")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "track_id": self.track_id,
            "status": self.status,
            "checked_path": self.checked_path,
            "size_bytes": self.size_bytes,
            "checked_at": self.checked_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackFileStatus":
        """Build a check from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            track_id=data["track_id"],
            status=data["status"],
            checked_path=data["checked_path"],
            size_bytes=data.get("size_bytes"),
            checked_at=data["checked_at"],
        )
