#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's chapters, planned times and notes, and its running time (PREP-03).

Everything a user edits on a Set that is not which tracks it holds. Adding and
removing entries is ``collection_service``'s, as it is for a Collection
(PREP-02). This module owns the rest:

- **Chapters** (DEC-103): add one at a place or after another, rename it, give
  it notes and targets, move it with its entries, delete it into its
  neighbour, or start one at an entry.
- **Entries**: move one by PREP-02's chapter rule, plan its in and out times,
  and give it a note (DEC-107).
- **The Set**: its notes, and :meth:`SetService.plan`, which reads the whole
  plan back with the running time of each chapter and of the Set.

The rules, and where each is kept
---------------------------------
A chapter's entries stay together, and a Set always has a chapter. The
repositories keep that, and check it after every write. This module refuses
what a user can ask for and should be told no, with a message saying why:

- **The last chapter cannot be deleted** (DEC-103). A Set without a chapter
  would have nowhere to put an entry.
- **A chapter is started at an entry that has one before it in its chapter.**
  At a chapter's first entry there is nothing to split off. The new chapter
  would take every entry and leave the old one empty, which no one asking to
  "start a chapter here" means. The refusal says to rename the chapter instead.
- **Times are typed** as ``m:ss`` or ``h:mm:ss`` (``core/set_timing.py``). An
  entry comes in before it goes out. When the track's length is known, it
  goes out no later than the track ends and comes in before that. A length
  learnt later that no longer fits is a warning (PREP-05), not an error, and
  nothing here rewrites the times.

Nothing is recorded
-------------------
No activity event and no track history, as for a Collection's edits (Phase 6).
A Set's plan is not track metadata, and a note typed into a chapter is not
something a user did to the library.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from cuepoint.core.set_timing import (
    MAX_TIME_SECONDS,
    RunningTime,
    format_time,
    parse_optional_time,
    running_time,
    starts_at,
)
from cuepoint.models.collection import Collection, CollectionEntry
from cuepoint.models.set_plan import (
    SetChapter,
    SetDetails,
    SetEntryPlan,
    SetEntryRow,
    normalize_chapter_name,
)
from cuepoint.models.track_metadata import normalize_notes
from cuepoint.services.interfaces import (
    ICollectionRepository,
    IDatabaseService,
    ISetRepository,
    ISetService,
)


#: What :meth:`SetService.update_chapter` may change.
CHAPTER_FIELDS: Tuple[str, ...] = (
    "name",
    "notes",
    "target_seconds",
    "bpm_min",
    "bpm_max",
)


def _check_target(target_seconds: Any) -> None:
    """Refuse a target past the longest time a person can type (PREP-03).

    Anything that is not a whole number is left to the model, which says so.
    """
    if (
        target_seconds is not None
        and not isinstance(target_seconds, bool)
        and isinstance(target_seconds, int)
        and target_seconds > MAX_TIME_SECONDS
    ):
        raise ValueError(
            f"A chapter's target is at most {format_time(MAX_TIME_SECONDS)}, "
            f"got {format_time(target_seconds)}"
        )


def running_time_to_dict(value: RunningTime) -> Dict[str, int]:
    """The wire shape of a running time: seconds, and how many were counted."""
    return {"seconds": value.seconds, "timed": value.timed, "untimed": value.untimed}


@dataclass(frozen=True)
class PlannedEntry:
    """One entry of a Set as its plan reads (DEC-107).

    Attributes:
        entry_id: The entry's own id; a track twice in a Set is two entries.
        track_id: The track it plays.
        position: Its place in the Set, from 0.
        chapter_id: The chapter it is in.
        in_seconds: The planned in time, or ``None`` for the start.
        out_seconds: The planned out time, or ``None`` when untimed.
        note: The user's note, or ``None``.
        planned_seconds: How long it is planned to play, or ``None``.
        starts_at: When it starts, counted from the Set's start, or ``None``
            after the first untimed entry.
        length_seconds: The track's length, or ``None`` when unknown.
    """

    entry_id: int
    track_id: int
    position: int
    chapter_id: int
    in_seconds: Optional[int]
    out_seconds: Optional[int]
    note: Optional[str]
    planned_seconds: Optional[int]
    starts_at: Optional[int]
    length_seconds: Optional[int]

    def to_dict(self) -> Dict[str, Any]:
        """Return the entry for the wire."""
        return dataclasses.asdict(self)


@dataclass(frozen=True)
class ChapterPlan:
    """One chapter of a Set, with what it holds and how long that runs.

    Attributes:
        chapter: The chapter, with its name, notes and targets.
        entry_ids: Its entries, in the Set's order.
        running_time: Its timed entries' sum, and how many are untimed.
        starts_at: When it starts, counted from the Set's start, or ``None``
            when an untimed entry comes before it. An empty chapter starts
            where the entries before it end.
    """

    chapter: SetChapter
    entry_ids: Tuple[int, ...]
    running_time: RunningTime
    starts_at: Optional[int]

    def to_dict(self) -> Dict[str, Any]:
        """Return the chapter for the wire."""
        return {
            "id": self.chapter.id,
            "position": self.chapter.position,
            "name": self.chapter.name,
            "notes": self.chapter.notes,
            "target_seconds": self.chapter.target_seconds,
            "bpm_min": self.chapter.bpm_min,
            "bpm_max": self.chapter.bpm_max,
            "entry_ids": list(self.entry_ids),
            "running_time": running_time_to_dict(self.running_time),
            "starts_at": self.starts_at,
        }


@dataclass(frozen=True)
class SetPlan:
    """A Set's whole plan, as one read (PREP-03).

    Attributes:
        set: The Set's node.
        notes: The Set's notes, or ``None``.
        chapters: Its chapters, in order.
        entries: Its entries, in order, repeats included.
        running_time: The whole Set's timed sum, and how many are untimed.
    """

    set: Collection
    notes: Optional[str]
    chapters: Tuple[ChapterPlan, ...]
    entries: Tuple[PlannedEntry, ...]
    running_time: RunningTime

    def to_dict(self) -> Dict[str, Any]:
        """Return the plan for the wire."""
        return {
            "set_id": self.set.id,
            "name": self.set.name,
            "notes": self.notes,
            "chapters": [chapter.to_dict() for chapter in self.chapters],
            "entries": [entry.to_dict() for entry in self.entries],
            "running_time": running_time_to_dict(self.running_time),
        }


class SetService(ISetService):
    """Edits a Set's chapters, times and notes, and reads its plan."""

    def __init__(
        self,
        collection_repository: ICollectionRepository,
        set_repository: ISetRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the service to the two stores a Set is written through.

        Args:
            collection_repository: The tree, a Set's node and its entries; the
                only writer of entries, so moving an entry or a chapter goes
                through it.
            set_repository: Chapters, planned times and notes.
            database_service: Opens the transaction each edit runs in. No SQL
                is written here.
        """
        self._collections = collection_repository
        self._sets = set_repository
        self._db = database_service

    # -------------------------------------------------------------- chapters

    def create_chapter(
        self,
        set_id: int,
        name: str = "",
        *,
        position: Optional[int] = None,
        after_chapter_id: Optional[int] = None,
    ) -> SetChapter:
        """Add an empty chapter to a Set.

        At ``position`` among the chapters (clamped to the end), straight after
        the chapter ``after_chapter_id``, or at the end when neither is given.
        It holds nothing until an entry is put in it or a split gives it some.

        Raises:
            ValueError: If there is no such Set, both places are given, the
                position is negative, the chapter named is another Set's, or
                the name is too long.
        """
        node = self._require_set(set_id)
        wanted = normalize_chapter_name(name)
        if position is not None and after_chapter_id is not None:
            raise ValueError(
                "A new chapter goes at a position or after a chapter, not both"
            )
        if position is not None and int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        with self._db.transaction():
            if after_chapter_id is not None:
                after = self._require_chapter(after_chapter_id)
                if after.collection_id != int(set_id):
                    raise ValueError(f"{after.label} is not a chapter of {node.name!r}")
                target = after.position + 1
            elif position is not None:
                target = int(position)
            else:
                target = self._sets.chapter_count(int(set_id))
            return self._sets.insert_chapter(int(set_id), target, wanted)

    def rename_chapter(self, chapter_id: int, name: str) -> SetChapter:
        """Rename a chapter. An empty name makes it unnamed.

        Raises:
            ValueError: If there is no such chapter or the name is too long.
        """
        return self._update_chapter(chapter_id, name=name)

    def set_chapter_notes(self, chapter_id: int, notes: Optional[str]) -> SetChapter:
        """Write a chapter's notes. ``None`` or blank clears them.

        Raises:
            ValueError: If there is no such chapter or the notes are too long.
        """
        return self._update_chapter(chapter_id, notes=notes)

    def set_chapter_targets(
        self,
        chapter_id: int,
        target_seconds: Optional[int] = None,
        bpm_min: Optional[float] = None,
        bpm_max: Optional[float] = None,
    ) -> SetChapter:
        """Set a chapter's target length and BPM range (DEC-103).

        All three are written together, and ``None`` clears each. Either end of
        the range may be left open.

        Raises:
            ValueError: If there is no such chapter, the length is not a whole
                number of seconds above zero and at most
                :data:`~cuepoint.core.set_timing.MAX_TIME_SECONDS`, a tempo is
                not above zero, or the range runs downwards.
        """
        _check_target(target_seconds)
        return self._update_chapter(
            chapter_id,
            target_seconds=target_seconds,
            bpm_min=bpm_min,
            bpm_max=bpm_max,
        )

    def update_chapter(self, chapter_id: int, changes: Mapping[str, Any]) -> SetChapter:
        """Change any of a chapter's name, notes and targets, in one write.

        What PREP-10's heading dialog sends: every field it shows, checked
        together, so a refused BPM range does not leave the new name written.
        A field left out keeps its value; ``None`` clears one, and an empty
        name makes the chapter unnamed.

        Raises:
            ValueError: If there is no such chapter, a field is not one of
                :data:`CHAPTER_FIELDS`, or any value is refused as the single
                edits refuse it.
        """
        unknown = sorted(str(key) for key in changes if key not in CHAPTER_FIELDS)
        if unknown:
            raise ValueError(
                f"A chapter has no field {', '.join(unknown)!r}; it has "
                + ", ".join(CHAPTER_FIELDS)
            )
        _check_target(changes.get("target_seconds"))
        return self._update_chapter(chapter_id, **dict(changes))

    def move_chapter(self, chapter_id: int, position: int) -> SetChapter:
        """Move a chapter among its Set's chapters, its entries with it.

        The chapter's entries move as one block, keeping their order, so the
        Set's chapters stay together (DEC-103). The position is clamped to the
        last place.

        Raises:
            ValueError: If there is no such chapter or the position is negative.
        """
        self._require_chapter(chapter_id)
        if int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        with self._db.transaction():
            moved = self._collections.move_chapter(int(chapter_id), int(position))
        if moved is None:
            raise ValueError(f"No such chapter: {chapter_id}")
        return moved

    def delete_chapter(self, chapter_id: int) -> SetChapter:
        """Delete a chapter. Its entries join the chapter before it (DEC-103).

        The first chapter's entries join the one after it instead. The last
        chapter a Set has cannot be deleted. The chapter's name, notes and
        targets go with it; its entries and their times do not.

        Returns:
            The chapter the entries joined, as it now is.

        Raises:
            ValueError: If there is no such chapter, or it is the Set's only
                one.
        """
        chapter = self._require_chapter(chapter_id)
        with self._db.transaction():
            if self._sets.chapter_count(chapter.collection_id) <= 1:
                node = self._collections.get(chapter.collection_id)
                name = node.name if node is not None else f"Set {chapter.collection_id}"
                raise ValueError(
                    f"{chapter.label} is the only chapter of {name!r}, and a Set "
                    "always has one"
                )
            merged = self._sets.delete_chapter(int(chapter_id))
            if merged is None:
                raise ValueError(f"No such chapter: {chapter_id}")
            joined = self._sets.chapter(merged[0])
        assert joined is not None  # the chapter an entry was just moved into
        return joined

    def split_chapter_at(self, entry_id: int, name: str = "") -> SetChapter:
        """Start a chapter at an entry: it and the rest of its chapter move.

        The new chapter goes straight after the entry's chapter. The entries
        before this one stay in the old chapter, with its name and targets.
        No entry changes place.

        Returns:
            The new chapter.

        Raises:
            ValueError: If the entry is not in a Set, it is the first entry of
                its chapter (there is nothing before it to keep), or the name is
                too long.
        """
        wanted = normalize_chapter_name(name)
        with self._db.transaction():
            row = self._require_entry(entry_id)
            if self._sets.first_entry_position(row.plan.chapter_id) == row.position:
                chapter = self._require_chapter(row.plan.chapter_id)
                raise ValueError(
                    f"{chapter.label} already starts at this entry: rename it "
                    "rather than start another chapter here"
                )
            made = self._sets.split_chapter(int(entry_id), wanted)
        assert made is not None  # the entry was a Set's a statement ago
        return made

    # --------------------------------------------------------------- entries

    def move_entry(
        self, entry_id: int, position: int, chapter_id: Optional[int] = None
    ) -> CollectionEntry:
        """Move one entry of a Set, by PREP-02's chapter rule.

        The entry keeps its chapter when that still reaches the new position,
        and otherwise joins the chapter of the entry before it, or the first at
        position 0. Naming ``chapter_id`` settles which side of a chapter
        boundary it lands on.

        Raises:
            ValueError: If the entry is not in a Set, the position is negative,
                or the chapter named cannot hold an entry there.
        """
        self._require_entry(entry_id)
        if int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        with self._db.transaction():
            moved = self._collections.reorder_entry(
                int(entry_id), int(position), chapter_id
            )
        if moved is None:
            raise ValueError(f"No such entry: {entry_id}")
        return moved

    def set_entry_times(
        self, entry_id: int, in_text: Optional[str], out_text: Optional[str]
    ) -> SetEntryPlan:
        """Plan when an entry comes in and goes out (DEC-107).

        Both are written together. Each is typed as ``m:ss`` or ``h:mm:ss``,
        and blank or ``None`` clears it. An entry with no out time is untimed.
        An empty in time is the start of the track.

        Raises:
            ValueError: If the entry is not in a Set, a time cannot be read, the
                entry would go out before it comes in, or the track's length is
                known and the out time is past it or the in time is not before
                it.
        """
        in_seconds = parse_optional_time(in_text)
        out_seconds = parse_optional_time(out_text)
        if out_seconds is not None and (in_seconds or 0) >= out_seconds:
            raise ValueError(
                "An entry must come in before it goes out: in "
                f"{format_time(in_seconds or 0)}, out {format_time(out_seconds)}"
            )
        with self._db.transaction():
            row = self._require_entry(entry_id)
            length = row.length_seconds
            if length is not None:
                if out_seconds is not None and out_seconds > length:
                    raise ValueError(
                        f"The track is {format_time(length)} long, so it cannot "
                        f"go out at {format_time(out_seconds)}"
                    )
                if in_seconds is not None and in_seconds >= length:
                    raise ValueError(
                        f"The track is {format_time(length)} long, so it cannot "
                        f"come in at {format_time(in_seconds)}"
                    )
            plan = dataclasses.replace(
                row.plan, in_seconds=in_seconds, out_seconds=out_seconds
            )
            self._sets.update_entry_plan(plan)
        return plan

    def set_entry_note(self, entry_id: int, note: Optional[str]) -> SetEntryPlan:
        """Write an entry's note. ``None`` or blank clears it.

        The note is the entry's, not the track's: the same track twice in a
        Set can carry two notes.

        Raises:
            ValueError: If the entry is not in a Set or the note is too long.
        """
        wanted = normalize_notes(note)
        with self._db.transaction():
            row = self._require_entry(entry_id)
            plan = dataclasses.replace(row.plan, note=wanted)
            self._sets.update_entry_plan(plan)
        return plan

    # ---------------------------------------------------------------- the set

    def set_notes(self, set_id: int, notes: Optional[str]) -> SetDetails:
        """Write a Set's notes. ``None`` or blank clears them.

        Raises:
            ValueError: If there is no such Set or the notes are too long.
        """
        self._require_set(set_id)
        wanted = normalize_notes(notes)
        with self._db.transaction():
            details = self._sets.set_notes(int(set_id), wanted)
        if details is None:
            raise ValueError(f"No such Set: {set_id}")
        return details

    def plan(self, set_id: int) -> SetPlan:
        """Read a Set's whole plan, with its running times (DEC-107).

        One consistent read: the node, its notes, its chapters and its entries
        are read in one transaction, so a write between them cannot pair an
        entry with a chapter list that no longer has its chapter.

        Raises:
            ValueError: If there is no such Set.
        """
        with self._db.transaction(join_existing=True):
            node = self._require_set(set_id)
            details = self._collections.set_details(int(set_id))
            chapters = self._collections.chapters(int(set_id))
            rows = self._sets.entry_rows(int(set_id))
        return _build_plan(node, details, chapters, rows)

    # --------------------------------------------------------------- helpers

    def _update_chapter(self, chapter_id: int, **changes: Any) -> SetChapter:
        """Validate changed chapter fields through the model and write them.

        Raises:
            ValueError: If there is no such chapter or the model refuses a
                value.
        """
        with self._db.transaction():
            chapter = self._require_chapter(chapter_id)
            changed = dataclasses.replace(chapter, **changes)
            stored = self._sets.update_chapter(changed)
        if stored is None:
            raise ValueError(f"No such chapter: {chapter_id}")
        return stored

    def _require_set(self, set_id: int) -> Collection:
        """Return a Set, or say what the node is instead.

        Raises:
            ValueError: If there is no such node, or it is not a Set.
        """
        node = self._collections.get(int(set_id))
        if node is None:
            raise ValueError(f"No such Set: {set_id}")
        if not node.is_set:
            raise ValueError(f"{node.name!r} is a {node.kind}, not a Set")
        return node

    def _require_chapter(self, chapter_id: int) -> SetChapter:
        """Return a chapter, or refuse by its id.

        Raises:
            ValueError: If there is no such chapter.
        """
        chapter = self._sets.chapter(int(chapter_id))
        if chapter is None:
            raise ValueError(f"No such chapter: {chapter_id}")
        return chapter

    def _require_entry(self, entry_id: int) -> SetEntryRow:
        """Return an entry of a Set with its plan, or refuse.

        Raises:
            ValueError: If there is no such entry, or it is a Collection's.
        """
        row = self._sets.entry_row(int(entry_id))
        if row is None:
            raise ValueError(f"No such entry in a Set: {entry_id}")
        return row


def _build_plan(
    node: Collection,
    details: Optional[SetDetails],
    chapters: Sequence[SetChapter],
    rows: Sequence[SetEntryRow],
) -> SetPlan:
    """Put a Set's rows together as its plan, with every running time.

    ``clocks[i]`` is when the ``i``-th entry starts, and ``clocks[n]`` when the
    last one ends, each ``None`` once an untimed entry has come before. An
    empty chapter sits between two entries, so it starts at the clock there.
    """
    plans = [row.plan for row in rows]
    clocks = starts_at(plans)
    ends = running_time(plans)
    clocks.append(ends.seconds if ends.is_complete else None)

    by_chapter: Dict[int, List[int]] = {
        int(chapter.id or 0): [] for chapter in chapters
    }
    for index, row in enumerate(rows):
        by_chapter[row.plan.chapter_id].append(index)

    chapter_plans: List[ChapterPlan] = []
    seen = 0
    for chapter in chapters:
        indexes = by_chapter[int(chapter.id or 0)]
        chapter_plans.append(
            ChapterPlan(
                chapter=chapter,
                entry_ids=tuple(rows[i].entry_id for i in indexes),
                running_time=running_time(plans[i] for i in indexes),
                starts_at=clocks[seen],
            )
        )
        seen += len(indexes)

    entries = tuple(
        PlannedEntry(
            entry_id=row.entry_id,
            track_id=row.track_id,
            position=row.position,
            chapter_id=row.plan.chapter_id,
            in_seconds=row.plan.in_seconds,
            out_seconds=row.plan.out_seconds,
            note=row.plan.note,
            planned_seconds=row.plan.planned_seconds,
            starts_at=clocks[index],
            length_seconds=row.length_seconds,
        )
        for index, row in enumerate(rows)
    )
    return SetPlan(
        set=node,
        notes=details.notes if details is not None else None,
        chapters=tuple(chapter_plans),
        entries=entries,
        running_time=ends,
    )


__all__: Sequence[str] = (
    "ChapterPlan",
    "PlannedEntry",
    "SetPlan",
    "SetService",
    "running_time_to_dict",
)
