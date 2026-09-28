#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a Set has that a Collection does not (PREP-01, Phase 10).

A Set is a node of kind ``set`` in CuePoint's own tree (DEC-102), and its
entries are ``collection_tracks`` rows like any Collection's. These four models
are the rows ``m0025_sets`` adds beside them:

- :class:`SetDetails`: one per Set, holding its notes. Its existence is what
  makes a node a Set as far as every other table here is concerned.
- :class:`SetChapter`: a named, contiguous section of the Set, with optional
  targets the warnings and suggestions read (DEC-103).
- :class:`SetEntryPlan`: one per entry, saying which chapter it is in, when the
  user plans to bring it in and take it out, and a note (DEC-107). It belongs to
  the entry, not the track, so a track played twice is planned twice.
- :class:`SetAcknowledgement`: a transition warning the user has seen and
  accepted, with the values it was given, so that it stops applying when they
  change (DEC-106).

And three that are not tables: :class:`SetEntryRow`, an entry as a Set's plan
reads it, with its place, its track and that track's length (PREP-03); and
:class:`EntryFactsRow`, an entry as a Set's checks read it (PREP-05); and
:class:`EntryTrackRow`, the words a set list names an entry by (PREP-06).

The models refuse what the database would refuse, where the row is built, and
say what was wrong. A few things the database cannot see are refused here only:
a time that is not a whole number of seconds, blank notes, a name too long to be
a label, and comparison data that is not a JSON object.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, NamedTuple, Optional

from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.row_values import (
    non_negative,
    optional_id,
    optional_number,
    optional_whole_number,
    required_id,
    required_text,
)
from cuepoint.models.track_metadata import normalize_notes

#: A chapter name is a heading in a list, like a node's name, but may be empty:
#: a new Set's one chapter has no name, and is drawn without a heading
#: (DEC-103).
MAX_CHAPTER_NAME_LENGTH = 120

#: A warning name is a word from PREP-05's vocabulary, not prose.
MAX_WARNING_LENGTH = 60

#: The most entries one Set may hold (PREP-02). The Set editor reads a Set
#: whole, and a ten-hour set is about 150 tracks, so this is far past any set a
#: person plays while keeping every read of one small. A Collection has no such
#: limit: it is a crate, and a crate may hold the library.
MAX_SET_ENTRIES = 1000


class SetLimitError(ValueError):
    """Adding these entries would take a Set past :data:`MAX_SET_ENTRIES`.

    Raised before anything is written, and a ``ValueError`` so every handler
    that already answers a refusal with its message answers this one too.

    Attributes:
        name: The Set's name.
        holding: How many entries it holds now.
        adding: How many the request would add.
    """

    def __init__(self, name: str, holding: int, adding: int) -> None:
        self.name = name
        self.holding = holding
        self.adding = adding
        super().__init__(
            f"{name!r} holds {holding:,} "
            f"{'entry' if holding == 1 else 'entries'}, and adding {adding:,} "
            f"would make {holding + adding:,}: a Set holds at most "
            f"{MAX_SET_ENTRIES:,}"
        )


class SetIntegrityError(RuntimeError):
    """A write left a Set's entries unplanned or its chapters out of order.

    Not a ``ValueError``: nothing a user sends can cause it, so it is a bug in
    the writer, and the transaction it is raised in rolls back rather than
    committing a Set that breaks DEC-103.
    """


def normalize_chapter_name(value: Any) -> str:
    """Return a chapter name, trimmed; empty means an unnamed chapter.

    Raises:
        ValueError: If the name is longer than :data:`MAX_CHAPTER_NAME_LENGTH`.
    """
    name = "" if value is None else str(value).strip()
    if len(name) > MAX_CHAPTER_NAME_LENGTH:
        raise ValueError(
            f"A chapter name may be at most {MAX_CHAPTER_NAME_LENGTH} characters, "
            f"got {len(name)}"
        )
    return name


def _positive_seconds(value: Any, name: str) -> Optional[int]:
    """Return a whole number of seconds above zero, or ``None``.

    Raises:
        ValueError: If the value is not a whole number, or is not above zero.
    """
    seconds = optional_whole_number(value, name)
    if seconds is not None and seconds <= 0:
        raise ValueError(f"{name} must be more than zero seconds, got {seconds}")
    return seconds


def _positive_bpm(value: Any, name: str) -> Optional[float]:
    """Return a tempo above zero, or ``None``.

    Raises:
        ValueError: If the value is not a finite number above zero.
    """
    bpm = optional_number(value, name)
    if bpm is not None and bpm <= 0:
        raise ValueError(f"{name} must be more than zero, got {bpm}")
    return bpm


def _json_object(value: Any, name: str) -> str:
    """Return JSON text that holds an object, as given.

    Raises:
        ValueError: If the value is not text, does not parse, or is not an
            object. An acknowledgement compares named values, so a list or a
            number would be a comparison nothing could read back.
    """
    text = required_text(value, name)
    try:
        parsed = json.loads(text)
    except ValueError:
        raise ValueError(f"{name} must be JSON text, got {value!r}") from None
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object, got {value!r}")
    return text


@dataclass
class SetDetails:
    """The row that makes a node a Set, and its notes.

    Attributes:
        collection_id: The Set's node in ``collections``.
        notes: Anything the user wants to keep with the Set, or ``None``.
        created_at: When the Set was made.
        updated_at: When its notes last changed.
    """

    collection_id: int
    notes: Optional[str] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Validate the row."""
        self.collection_id = required_id(self.collection_id, "collection_id")
        self.notes = normalize_notes(self.notes)

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "collection_id": self.collection_id,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "SetDetails":
        """Build the details from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            collection_id=data["collection_id"],
            notes=data.get("notes"),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


@dataclass
class SetChapter:
    """One chapter of a Set (DEC-103).

    Attributes:
        collection_id: The Set it divides.
        position: Its index among the Set's chapters, from 0. Contiguity of the
            entries it holds is the service's (PREP-02), not a constraint.
        name: Its heading; empty for an unnamed chapter.
        id: Database primary key; ``None`` until persisted.
        notes: Anything the user wants to keep with it, or ``None``.
        target_seconds: How long the user wants it to run, or ``None``.
        bpm_min: The lowest tempo it should hold, or ``None``.
        bpm_max: The highest tempo it should hold, or ``None``.
        created_at: When it was made.
        updated_at: When it last changed.
    """

    collection_id: int
    position: int = 0
    name: str = ""
    id: Optional[int] = None
    notes: Optional[str] = None
    target_seconds: Optional[int] = None
    bpm_min: Optional[float] = None
    bpm_max: Optional[float] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Validate the row."""
        self.id = optional_id(self.id, "id")
        self.collection_id = required_id(self.collection_id, "collection_id")
        self.position = non_negative(self.position, "position")
        self.name = normalize_chapter_name(self.name)
        self.notes = normalize_notes(self.notes)
        self.target_seconds = _positive_seconds(self.target_seconds, "target_seconds")
        self.bpm_min = _positive_bpm(self.bpm_min, "bpm_min")
        self.bpm_max = _positive_bpm(self.bpm_max, "bpm_max")
        if (
            self.bpm_min is not None
            and self.bpm_max is not None
            and self.bpm_min > self.bpm_max
        ):
            raise ValueError(
                f"A chapter's BPM range must run upwards, got {self.bpm_min} "
                f"to {self.bpm_max}"
            )

    @property
    def is_unnamed(self) -> bool:
        """True for a chapter with no heading (DEC-103)."""
        return not self.name

    @property
    def has_bpm_range(self) -> bool:
        """True when either end of a BPM range is set."""
        return self.bpm_min is not None or self.bpm_max is not None

    @property
    def label(self) -> str:
        """How a message names the chapter: its name, or its place if unnamed."""
        return repr(self.name) if self.name else f"chapter {self.position + 1}"

    def touch(self) -> None:
        """Mark the chapter as updated now."""
        self.updated_at = utc_now_iso()

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "collection_id": self.collection_id,
            "position": self.position,
            "name": self.name,
            "notes": self.notes,
            "target_seconds": self.target_seconds,
            "bpm_min": self.bpm_min,
            "bpm_max": self.bpm_max,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "SetChapter":
        """Build a chapter from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            collection_id=data["collection_id"],
            position=data["position"],
            name=data.get("name") or "",
            notes=data.get("notes"),
            target_seconds=data.get("target_seconds"),
            bpm_min=data.get("bpm_min"),
            bpm_max=data.get("bpm_max"),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


@dataclass
class SetEntryPlan:
    """One entry's chapter, planned times and note (DEC-103, DEC-107).

    Attributes:
        entry_id: The ``collection_tracks`` row it plans.
        collection_id: The Set that entry is in; the database holds that it is.
        chapter_id: The chapter the entry is in, in the same Set.
        in_seconds: When the user plans to bring it in; ``None`` means from the
            start.
        out_seconds: When the user plans to take it out. An entry is timed when
            this is set, and untimed entries count as nothing (DEC-107).
        note: Anything the user wants to keep with this entry, or ``None``.
    """

    entry_id: int
    collection_id: int
    chapter_id: int
    in_seconds: Optional[int] = None
    out_seconds: Optional[int] = None
    note: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        self.entry_id = required_id(self.entry_id, "entry_id")
        self.collection_id = required_id(self.collection_id, "collection_id")
        self.chapter_id = required_id(self.chapter_id, "chapter_id")
        self.in_seconds = optional_whole_number(self.in_seconds, "in_seconds")
        if self.in_seconds is not None and self.in_seconds < 0:
            raise ValueError(f"in_seconds cannot be negative: {self.in_seconds}")
        self.out_seconds = _positive_seconds(self.out_seconds, "out_seconds")
        if (
            self.in_seconds is not None
            and self.out_seconds is not None
            and self.in_seconds >= self.out_seconds
        ):
            raise ValueError(
                f"An entry must come in before it goes out, got in "
                f"{self.in_seconds}s and out {self.out_seconds}s"
            )
        self.note = normalize_notes(self.note)

    @property
    def is_timed(self) -> bool:
        """True when the entry has an out time (DEC-107)."""
        return self.out_seconds is not None

    @property
    def planned_seconds(self) -> Optional[int]:
        """How long the entry is planned to play, or ``None`` when untimed.

        An empty in time is the start of the track (DEC-107).
        """
        if self.out_seconds is None:
            return None
        return self.out_seconds - (self.in_seconds or 0)

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "entry_id": self.entry_id,
            "collection_id": self.collection_id,
            "chapter_id": self.chapter_id,
            "in_seconds": self.in_seconds,
            "out_seconds": self.out_seconds,
            "note": self.note,
        }

    @classmethod
    def from_row(cls, row: Any) -> "SetEntryPlan":
        """Build a plan from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            entry_id=data["entry_id"],
            collection_id=data["collection_id"],
            chapter_id=data["chapter_id"],
            in_seconds=data.get("in_seconds"),
            out_seconds=data.get("out_seconds"),
            note=data.get("note"),
        )


@dataclass(frozen=True)
class SetEntryRow:
    """One entry of a Set as its plan reads it (PREP-03).

    The entry's place and track beside its plan, and the track's length, which
    is what a planned out time is checked against (DEC-107).

    Attributes:
        position: The entry's place in the Set, from 0.
        track_id: The track it plays.
        plan: Its chapter, planned times and note.
        length_seconds: The track's length, or ``None`` when it is not known. A
            stored length of zero is an import that did not know it, not a
            track that plays for no time, so it reads as ``None``.
    """

    position: int
    track_id: int
    plan: SetEntryPlan
    length_seconds: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        length = optional_whole_number(self.length_seconds, "length_seconds")
        object.__setattr__(
            self, "length_seconds", None if length is None or length <= 0 else length
        )

    @property
    def entry_id(self) -> int:
        """The entry's own id."""
        return self.plan.entry_id

    @classmethod
    def from_row(cls, row: Any) -> "SetEntryRow":
        """Build the row from a join of an entry, its plan and its track."""
        data = dict(row)
        return cls(
            position=data["position"],
            track_id=data["track_id"],
            plan=SetEntryPlan.from_row(data),
            length_seconds=data.get("length_seconds"),
        )


class EntryFactsRow(NamedTuple):
    """One entry of a Set as its checks read it, unparsed (PREP-05).

    A tuple, as ``TraitRow`` is: the service parses it into the rule's own
    value object, and a Set is read whole on every check.

    Attributes:
        position: The entry's place in the Set.
        entry_id: The entry.
        track_id: Its track.
        chapter_id: Its chapter.
        in_seconds: The planned in time, or None.
        out_seconds: The planned out time, or None.
        length_seconds: The track's length as stored, or None.
        bpm: The effective BPM (DEC-068), as stored.
        key: The effective key, in whatever notation it was written.
        file_status: The status of the last check of the track's current path,
            or None when that path was never checked.
        file_reason: Why a missing file is missing, when known, or None.
        file_checked_at: When the current path was checked, or None.
    """

    position: int
    entry_id: int
    track_id: int
    chapter_id: int
    in_seconds: Optional[int]
    out_seconds: Optional[int]
    length_seconds: Optional[int]
    bpm: Optional[float]
    key: Optional[str]
    file_status: Optional[str]
    file_reason: Optional[str]
    file_checked_at: Optional[str]


class EntryTrackRow(NamedTuple):
    """One entry's track as a set list names it (PREP-06).

    Title, artist and remixer have no CuePoint override, so they are the
    imported values; BPM and key come from :class:`EntryFactsRow`, which reads
    the effective ones (DEC-068).

    Attributes:
        entry_id: The entry.
        artist: The track's artist, as imported.
        title: Its title, as imported.
        remixer: Its remixer, or None.
        file_path: Its file, as the library holds it.
    """

    entry_id: int
    artist: Optional[str]
    title: Optional[str]
    remixer: Optional[str]
    file_path: str


@dataclass(frozen=True)
class SetAcknowledgement:
    """A transition warning the user has accepted (DEC-106).

    It applies while the two entries are adjacent in this order and the values
    compared are still :attr:`compared_json`. PREP-05 decides that; this row only
    records what was accepted.

    Attributes:
        collection_id: The Set both entries are in.
        from_entry_id: The entry the transition leaves.
        to_entry_id: The entry it arrives at.
        warning: The warning's kind, from PREP-05's vocabulary.
        compared_json: The values the warning compared, as a JSON object.
        id: Database primary key; ``None`` until persisted.
        created_at: When the user acknowledged it.
    """

    collection_id: int
    from_entry_id: int
    to_entry_id: int
    warning: str
    compared_json: str
    id: Optional[int] = None
    created_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        object.__setattr__(
            self, "collection_id", required_id(self.collection_id, "collection_id")
        )
        object.__setattr__(
            self, "from_entry_id", required_id(self.from_entry_id, "from_entry_id")
        )
        object.__setattr__(
            self, "to_entry_id", required_id(self.to_entry_id, "to_entry_id")
        )
        if self.from_entry_id == self.to_entry_id:
            raise ValueError("A transition runs between two different entries")
        warning = required_text(self.warning, "warning")
        if warning != warning.strip() or len(warning) > MAX_WARNING_LENGTH:
            raise ValueError(f"warning must be a warning's name, got {warning!r}")
        _json_object(self.compared_json, "compared_json")

    @property
    def compared(self) -> Dict[str, Any]:
        """The values the warning compared when it was acknowledged."""
        parsed: Dict[str, Any] = json.loads(self.compared_json)
        return parsed

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "collection_id": self.collection_id,
            "from_entry_id": self.from_entry_id,
            "to_entry_id": self.to_entry_id,
            "warning": self.warning,
            "compared_json": self.compared_json,
            "created_at": self.created_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "SetAcknowledgement":
        """Build an acknowledgement from a database row."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            collection_id=data["collection_id"],
            from_entry_id=data["from_entry_id"],
            to_entry_id=data["to_entry_id"],
            warning=data["warning"],
            compared_json=data["compared_json"],
            created_at=data["created_at"],
        )
