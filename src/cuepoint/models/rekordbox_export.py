#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The record of one export, and of each playlist it wrote (EXPORT-03, DEC-086).

The two types over ``m0020_rekordbox_exports``. They answer "where did my last
export go, and what was in it" after the Collections it named have been renamed,
refiled or deleted — which is why every identity here is stored text rather than
a reference, and why :attr:`RekordboxExportPlaylist.collection_id` points at
nothing the database enforces.

What a record claims, and what it does not
------------------------------------------
It records what CuePoint wrote. It does not claim the file is still on disk, or
still holds what was written, or that the Collection named still exists. Nothing
re-derives one of these rows, so nothing can quietly correct one either.

Two counts, because they answer different questions
---------------------------------------------------
:attr:`RekordboxExport.track_count` is how many tracks were in scope;
:attr:`~RekordboxExport.changed_track_count` is how many of them the export
actually altered. DEC-079 writes an attribute only where the effective value
differs from what the file already held, so a library where nobody has
overridden anything exports every track and changes none — and
``changed_track_count == 0`` is what makes that honestly describable as a copy
with playlists appended, rather than looking like a failure.

Not checked is not zero
-----------------------
:attr:`~RekordboxExport.missing_file_count` is ``None`` when the library had
never been file-checked, and a number when it had. DEC-088 asks for exactly this
distinction: zero missing files is a claim about a user's library, and a library
nobody has checked supports no such claim.

The key notation is validated where it is chosen
------------------------------------------------
DEC-089 keeps one vocabulary for the three notations, in
``services/tag_write_options.py::KEY_FORMATS``, and says the export validates
against it rather than restating it. A model imports from ``cuepoint.models``
and from nowhere else, so restating it here is the one thing this file must not
do: :attr:`~RekordboxExport.key_format` is required text, checked against the
vocabulary by the service that takes the notation as an argument, before an
export runs. What is stored is the notation used — the only thing that can later
explain why some of a library's keys read ``8A``.

The two kinds, and the one that is not here
-------------------------------------------
A playlist row came from a Collection or a Smart Collection, and the vocabulary
is :data:`EXPORTED_KINDS` — Collection's own two track-holding kinds, imported
rather than spelled again. ``folder`` is not among them: the folders in the
written tree are structure, and DEC-078's ``CuePoint`` parent is CuePoint's own.
What records the shape is :attr:`RekordboxExportPlaylist.path`, which is the
path in the file that was written, collision suffix and all.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.collection import KIND_COLLECTION, KIND_SMART
from cuepoint.models.row_values import (
    flag,
    non_negative,
    one_of,
    optional_id,
    optional_non_negative,
    required_id,
    required_text,
)

#: The file was written.
EXPORT_WRITTEN = "written"

#: The user stopped it before the file was written.
EXPORT_CANCELLED = "cancelled"

#: It did not finish, and :attr:`RekordboxExport.error` says how.
EXPORT_FAILED = "failed"

#: How an export can end. All three are terminal: a row is written when the
#: export finishes, inside the job's own transaction (DEC-086).
EXPORT_OUTCOMES = (EXPORT_WRITTEN, EXPORT_CANCELLED, EXPORT_FAILED)

#: The kinds of node that export as a playlist, from Collection's own
#: vocabulary. A folder is not one: it is structure in the written tree.
EXPORTED_KINDS = (KIND_COLLECTION, KIND_SMART)


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
class RekordboxExport:
    """One export, as it ended.

    Attributes:
        started_at: When it began, ISO-8601 UTC.
        outcome: One of :data:`EXPORT_OUTCOMES`.
        destination_path: The file CuePoint wrote, as written to.
        source_path: The Rekordbox XML it patched (DEC-077 never generates).
        track_count: Tracks in scope.
        changed_track_count: How many of them an attribute was written for.
        fields_json: The fields written, as a JSON array of names.
        key_format: The notation keys were rendered in (DEC-089).
        id: Database primary key; ``None`` until persisted.
        job_id: The job that ran it, or ``None`` when no job did.
        finished_at: When it ended, or ``None`` for a row not yet closed.
        source_stale: True when the source file had changed since the import
            CuePoint's values came from (DEC-082).
        missing_file_count: Tracks in scope whose audio file was missing, or
            ``None`` when the library had never been checked (DEC-088).
        dropped_reference_count: Playlist entries dropped because the file held
            no such track, counted per appearance (DEC-082).
        error: Why it failed. Required for a failure, refused for a write.
    """

    started_at: str
    outcome: str
    destination_path: str
    source_path: str
    track_count: int
    changed_track_count: int
    fields_json: str
    key_format: str
    id: Optional[int] = None
    job_id: Optional[str] = None
    finished_at: Optional[str] = None
    source_stale: bool = False
    missing_file_count: Optional[int] = None
    dropped_reference_count: int = 0
    error: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the record."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        required_text(self.started_at, "started_at")
        one_of(self.outcome, EXPORT_OUTCOMES, "outcome")
        required_text(self.destination_path, "destination_path")
        required_text(self.source_path, "source_path")
        object.__setattr__(
            self, "track_count", non_negative(self.track_count, "track_count")
        )
        object.__setattr__(
            self,
            "changed_track_count",
            non_negative(self.changed_track_count, "changed_track_count"),
        )
        # Not a schema constraint, and not a nicety: the two counts are read
        # side by side ("changed 12 of 50,000"), so a pair that cannot both be
        # true is worth refusing where it is built rather than rendering.
        if self.changed_track_count > self.track_count:
            raise ValueError(
                f"changed_track_count ({self.changed_track_count}) cannot exceed "
                f"track_count ({self.track_count})"
            )
        if not isinstance(self.fields_json, str):
            raise ValueError("fields_json must be JSON text")
        _json_or_none(self.fields_json, "fields_json")
        if not isinstance(json.loads(self.fields_json), list):
            raise ValueError("fields_json must be a JSON array of field names")
        required_text(self.key_format, "key_format")
        if self.job_id is not None:
            required_text(self.job_id, "job_id")
        if self.finished_at is not None:
            required_text(self.finished_at, "finished_at")
        object.__setattr__(
            self, "source_stale", flag(self.source_stale, "source_stale")
        )
        object.__setattr__(
            self,
            "missing_file_count",
            optional_non_negative(self.missing_file_count, "missing_file_count"),
        )
        object.__setattr__(
            self,
            "dropped_reference_count",
            non_negative(self.dropped_reference_count, "dropped_reference_count"),
        )
        # An export that wrote the file and recorded an error is a row nobody
        # can act on; a failure that does not say why is one nobody can read.
        if self.outcome == EXPORT_WRITTEN and (self.error or "").strip():
            raise ValueError("An export that wrote the file recorded no error")
        if self.outcome == EXPORT_FAILED and not (self.error or "").strip():
            raise ValueError("A failed export must say why")

    @property
    def fields(self) -> Tuple[str, ...]:
        """The fields this export wrote, in the order recorded."""
        return tuple(str(name) for name in json.loads(self.fields_json))

    @property
    def wrote_file(self) -> bool:
        """True when a file was actually written."""
        return self.outcome == EXPORT_WRITTEN

    @property
    def is_finished(self) -> bool:
        """True when the row records when it ended."""
        return self.finished_at is not None

    @property
    def file_check_known(self) -> bool:
        """True when :attr:`missing_file_count` is a count rather than silence."""
        return self.missing_file_count is not None

    @property
    def changed_nothing(self) -> bool:
        """True when no track's attributes differed, so this was a copy.

        Not the same as having exported nothing: the playlists were still
        appended, and every track in scope is still in the file.
        """
        return self.changed_track_count == 0

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "job_id": self.job_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "outcome": self.outcome,
            "destination_path": self.destination_path,
            "source_path": self.source_path,
            "source_stale": 1 if self.source_stale else 0,
            "track_count": self.track_count,
            "changed_track_count": self.changed_track_count,
            "fields_json": self.fields_json,
            "key_format": self.key_format,
            "missing_file_count": self.missing_file_count,
            "dropped_reference_count": self.dropped_reference_count,
            "error": self.error,
        }

    @classmethod
    def from_row(cls, row: Any) -> "RekordboxExport":
        """Build a record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            job_id=data.get("job_id"),
            started_at=data["started_at"],
            finished_at=data.get("finished_at"),
            outcome=data["outcome"],
            destination_path=data["destination_path"],
            source_path=data["source_path"],
            source_stale=data.get("source_stale", 0),
            track_count=data["track_count"],
            changed_track_count=data["changed_track_count"],
            fields_json=data["fields_json"],
            key_format=data["key_format"],
            missing_file_count=data.get("missing_file_count"),
            dropped_reference_count=data.get("dropped_reference_count", 0),
            error=data.get("error"),
        )


@dataclass(frozen=True)
class RekordboxExportPlaylist:
    """One playlist an export wrote, as it was written.

    Attributes:
        export_id: The export this belongs to. Its row cascades.
        kind: One of :data:`EXPORTED_KINDS`.
        name: What the node was called then.
        path: Where it landed in the written file, from DEC-078's parent folder
            down — the collision suffix included, since that is what is in the
            file.
        entry_count: Entries actually written.
        id: Database primary key; ``None`` until persisted.
        collection_id: The node it came from, if it still had an id. Not a
            foreign key, on purpose: deleting a Collection does not erase the
            record of an export that contained it.
        dropped_count: Entries the source file held no track for, dropped and
            counted (DEC-082).
        rules_json: The Smart Collection's rule set as it was (DEC-081). A
            Smart Collection has one; a Collection exported stored membership,
            so it has none.
    """

    export_id: int
    kind: str
    name: str
    path: str
    entry_count: int
    id: Optional[int] = None
    collection_id: Optional[int] = None
    dropped_count: int = 0
    rules_json: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        object.__setattr__(self, "export_id", required_id(self.export_id, "export_id"))
        one_of(self.kind, EXPORTED_KINDS, "kind")
        required_text(self.name, "name")
        required_text(self.path, "path")
        object.__setattr__(
            self, "entry_count", non_negative(self.entry_count, "entry_count")
        )
        object.__setattr__(
            self, "collection_id", optional_id(self.collection_id, "collection_id")
        )
        object.__setattr__(
            self, "dropped_count", non_negative(self.dropped_count, "dropped_count")
        )
        _json_or_none(self.rules_json, "rules_json")
        # DEC-081 exports a Smart Collection as its membership, and the rules
        # are the only record of how that membership was arrived at — nothing
        # else can explain the count later. A Collection exported the entries
        # it stores, so rules beside it would suggest they had a part in it;
        # a frozen Collection remembering where it came from is the Collection's
        # business, not this row's.
        if self.kind == KIND_SMART and not self.rules_json:
            raise ValueError("A smart collection's export must record its rules")
        if self.kind == KIND_COLLECTION and self.rules_json:
            raise ValueError(
                "A Collection exported its stored membership, not a rule set"
            )

    @property
    def is_smart(self) -> bool:
        """True when membership came from a rule set evaluated at export time."""
        return self.kind == KIND_SMART

    @property
    def requested_count(self) -> int:
        """Entries the node held, written and dropped together."""
        return self.entry_count + self.dropped_count

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "export_id": self.export_id,
            "collection_id": self.collection_id,
            "kind": self.kind,
            "name": self.name,
            "path": self.path,
            "entry_count": self.entry_count,
            "dropped_count": self.dropped_count,
            "rules_json": self.rules_json,
        }

    @classmethod
    def from_row(cls, row: Any) -> "RekordboxExportPlaylist":
        """Build a row's record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            export_id=data["export_id"],
            collection_id=data.get("collection_id"),
            kind=data["kind"],
            name=data["name"],
            path=data["path"],
            entry_count=data["entry_count"],
            dropped_count=data.get("dropped_count", 0),
            rules_json=data.get("rules_json"),
        )
