#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The record of what a tag write replaced in a file (CLEAN-01, DEC-070).

The type over ``file_writes``, and the only way back from CLEAN-10's job. One
row per field per file per job: what was there, what was written, and how it
went.

It outlives its track
---------------------
``track_id`` becomes ``None`` when the track is deleted from the library
(``ON DELETE SET NULL``). Deleting a track does not un-write the tags already in
its file, so the record of what was replaced is kept, and it carries
``file_path`` so that a restore can still find the file.

A value of null and no value are different
------------------------------------------
``old_value_json`` is ``None`` when nothing was read (a skipped or failed write
may never have opened the file), and the JSON text ``"null"`` when the file was
read and the field was empty. A restore writes back the second and refuses the
first, which is why the two are not collapsed here.

Pending, and what a restore undid (CLEAN-10)
--------------------------------------------
A write is recorded before the file is touched, so until the file has been
written and read back its row is ``pending``: a record of a write that may not
have happened. A restore is recorded the same way, as ``restored`` rows naming
the write they undid in ``restore_of`` — or ``skipped`` or ``failed`` rows, when
the file had moved on or could not be written. Only a write can be restored,
and only a restore row names one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import flag, one_of, optional_id, required_text

#: The value was written.
WRITE_WRITTEN = "written"

#: The write was not attempted, for a stated reason.
WRITE_SKIPPED = "skipped"

#: The write was attempted and did not succeed.
WRITE_FAILED = "failed"

#: A written value was put back to what it replaced.
WRITE_RESTORED = "restored"

WRITE_OUTCOMES = (WRITE_WRITTEN, WRITE_SKIPPED, WRITE_FAILED, WRITE_RESTORED)

#: The outcomes a reader cannot act on without being told why.
_REASON_REQUIRED = (WRITE_SKIPPED, WRITE_FAILED)

#: The outcomes recorded before the file is touched, and so pending until it is.
_MAY_BE_PENDING = (WRITE_WRITTEN, WRITE_RESTORED)


def _json_or_none(value: Any, name: str) -> Optional[str]:
    """Return stored JSON text after checking it parses, or ``None``.

    Raises:
        ValueError: If the text is not JSON.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} must be JSON text, got {type(value).__name__}")
    try:
        json.loads(value)
    except ValueError:
        raise ValueError(f"{name} is not valid JSON") from None
    return value


@dataclass(frozen=True)
class FileWrite:
    """One field written, skipped, failed or restored in one file.

    Attributes:
        job_id: The job that did it.
        file_path: The file, as written to. Kept for when the track is gone.
        field: The tag field.
        outcome: One of :data:`WRITE_OUTCOMES`.
        written_at: When.
        id: Database primary key; ``None`` until persisted.
        track_id: The library track, or ``None`` once it has been deleted.
        old_value_json: What the file held, as JSON; ``None`` if never read.
        new_value_json: What was written, as JSON.
        reason: Why. Required for a skip or a failure.
        pending: True from the record until the file was written and read back.
        restore_of: The write a restore row undid, or tried to.
    """

    job_id: str
    file_path: str
    field: str
    outcome: str
    written_at: str
    id: Optional[int] = None
    track_id: Optional[int] = None
    old_value_json: Optional[str] = None
    new_value_json: Optional[str] = None
    reason: Optional[str] = None
    pending: bool = False
    restore_of: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the record."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        required_text(self.job_id, "job_id")
        required_text(self.file_path, "file_path")
        required_text(self.field, "field")
        one_of(self.outcome, WRITE_OUTCOMES, "outcome")
        required_text(self.written_at, "written_at")
        object.__setattr__(self, "track_id", optional_id(self.track_id, "track_id"))
        _json_or_none(self.old_value_json, "old_value_json")
        _json_or_none(self.new_value_json, "new_value_json")
        if self.outcome in _REASON_REQUIRED and not (self.reason or "").strip():
            raise ValueError(f"A {self.outcome} write must say why")
        object.__setattr__(self, "pending", flag(self.pending, "pending"))
        object.__setattr__(
            self, "restore_of", optional_id(self.restore_of, "restore_of")
        )
        if self.pending and self.outcome not in _MAY_BE_PENDING:
            raise ValueError(f"A {self.outcome} row is never pending")
        if self.outcome == WRITE_WRITTEN and self.restore_of is not None:
            raise ValueError("A write undoes nothing; only a restore names a write")
        if self.outcome == WRITE_RESTORED and self.restore_of is None:
            raise ValueError("A restore must name the write it undid")

    @property
    def old_value_was_read(self) -> bool:
        """True when the file was read before the write, so it can be restored."""
        return self.old_value_json is not None

    @property
    def old_value(self) -> Any:
        """What the file held, parsed; ``None`` when empty or never read."""
        return None if self.old_value_json is None else json.loads(self.old_value_json)

    @property
    def new_value(self) -> Any:
        """What was written, parsed."""
        return None if self.new_value_json is None else json.loads(self.new_value_json)

    @property
    def is_orphaned(self) -> bool:
        """True when the track this was written for is no longer in the library."""
        return self.track_id is None

    @property
    def is_restore(self) -> bool:
        """True for a row a restore recorded."""
        return self.restore_of is not None

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "job_id": self.job_id,
            "track_id": self.track_id,
            "file_path": self.file_path,
            "field": self.field,
            "old_value_json": self.old_value_json,
            "new_value_json": self.new_value_json,
            "outcome": self.outcome,
            "reason": self.reason,
            "written_at": self.written_at,
            "pending": 1 if self.pending else 0,
            "restore_of": self.restore_of,
        }

    @classmethod
    def from_row(cls, row: Any) -> "FileWrite":
        """Build a record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            job_id=data["job_id"],
            track_id=data.get("track_id"),
            file_path=data["file_path"],
            field=data["field"],
            old_value_json=data.get("old_value_json"),
            new_value_json=data.get("new_value_json"),
            outcome=data["outcome"],
            reason=data.get("reason"),
            written_at=data["written_at"],
            pending=data.get("pending", 0),
            restore_of=data.get("restore_of"),
        )
