#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a Set's checks find, and why (PREP-05, DEC-106).

No SQL and no I/O. A caller reads a Set's entries, chapters and acknowledged
warnings into the small value objects below, and :func:`analyse` returns every
warning, notice and total, each as data. Nothing here blocks anything
(DEC-017): a warning is something to look at, never a refusal.

What is checked
---------------
**Each transition**, from an entry into the one after it:

- ``tempo_jump``: the two tempos are too far apart to mix. It is DEC-096's
  tempo gate (``core.similarity.tempo_relation``), with half and double time
  counted as close. A transition is compared both ways, and is a jump only when
  neither track is within the other's window. That is what makes Suggestions
  and warnings one rule (PREP's fact 6): Suggestions judge a slot from each
  neighbour's tempo, so a suggested track inserted there never jumps.
- ``key_clash``: DEC-096's wheel finds no relation between the two keys. Key
  only adds points in DEC-096, so a suggested track can still clash, and the
  warning then means exactly that it earned no key points.
- ``tempo_unknown``: a side has no tempo to check, and the detail says which.
  A side with no key gives no warning (DEC-201); it is counted in
  ``without_key``. ``key_unknown`` is no longer a kind: an acknowledgement
  stored for it is never matched, so it is inert.

**Each entry**: ``file_missing`` and ``file_unreadable`` from the last file
check (DEC-073), and ``time_outside_track`` when a planned time is past the
track's end, as a refresh that shortened a track can make it (DEC-107). A track
in the Set more than once is a ``repeat`` *notice*, not a warning, because
DEC-017 says repeating is legitimate.

**Each chapter** (DEC-103): ``over_target`` whenever its timed entries already
exceed the target, ``under_target`` only when every entry in it is timed
(DEC-107), and ``bpm_outside_range`` with the entries outside it.

**The Set**: the count of each kind, the running time with how many entries are
untimed, and what the file checks cover. A Set whose files were never checked
says so rather than reporting no missing files (DEC-088).

Warnings are data
-----------------
Each warning is ``{kind, detail, compared}``. ``compared`` holds the values
the check read, in a canonical form: BPMs to two decimals, keys as Camelot codes.
The service writes keys in the library's notation for the wire. The canonical
form is what an acknowledgement stores, so a library that changes notation does
not make every acknowledgement stale.

The shape
---------
**The values the checks read** (DEC-111, PREP-11): each entry's effective BPM
and key, and how each transition's keys relate on DEC-096's wheel. The
Prepare page draws its tempo and key lanes from these, so a lane and a warning
can never disagree about a key: both were read here, once. A value the rule
cannot use is none, and a lane draws it as a gap, never a zero.

Acknowledgements
----------------
Only a transition warning can be acknowledged; the others describe something
the user fixes. An acknowledgement applies while its two entries are adjacent in
that order and the values compared are unchanged. After a reorder, a replaced
neighbour or a new BPM or key override, it matches nothing, is inert, and the
warning shows again. It is not deleted, so undoing the change brings the
acknowledgement back with it.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
)

from cuepoint.core.set_timing import RunningTime, running_time
from cuepoint.core.similarity import (
    MusicalKey,
    key_relation,
    tempo_gap,
    tempo_relation,
)

# --------------------------------------------------------------- vocabulary

#: Transition warnings: the only ones that can be acknowledged.
TEMPO_JUMP = "tempo_jump"
KEY_CLASH = "key_clash"
TEMPO_UNKNOWN = "tempo_unknown"
KEY_UNKNOWN = "key_unknown"
TRANSITION_KINDS: Tuple[str, ...] = (TEMPO_JUMP, KEY_CLASH, TEMPO_UNKNOWN)

#: Entry warnings.
FILE_MISSING_WARNING = "file_missing"
FILE_UNREADABLE_WARNING = "file_unreadable"
TIME_OUTSIDE_TRACK = "time_outside_track"
ENTRY_KINDS: Tuple[str, ...] = (
    FILE_MISSING_WARNING,
    FILE_UNREADABLE_WARNING,
    TIME_OUTSIDE_TRACK,
)

#: Chapter warnings.
OVER_TARGET = "over_target"
UNDER_TARGET = "under_target"
BPM_OUTSIDE_RANGE = "bpm_outside_range"
CHAPTER_KINDS: Tuple[str, ...] = (OVER_TARGET, UNDER_TARGET, BPM_OUTSIDE_RANGE)

#: Every warning kind, in the order a list of them is written in.
KINDS: Tuple[str, ...] = (*TRANSITION_KINDS, *ENTRY_KINDS, *CHAPTER_KINDS)

#: The details. A tempo jump goes faster or slower as heard; an unknown value
#: is missing on the track before, this track, or both.
FASTER = "faster"
SLOWER = "slower"
NO_RELATION = "no_relation"
SIDE_FROM = "from"
SIDE_TO = "to"
SIDE_BOTH = "both"
NOT_FOUND = "not_found"
DRIVE_UNAVAILABLE = "drive_unavailable"
UNREADABLE = "unreadable"
OUT_PAST_END = "out"
IN_PAST_END = "in"
ALL_TIMED = "all_timed"
PARTLY_TIMED = "partly_timed"
BELOW = "below"
ABOVE = "above"

#: Every warning the rule can give, as ``(kind, detail)``. The renderer has
#: words for each (``setWarnings.ts``), and a test holds the two together from
#: both sides, as DISCOVER-08's does for reasons.
WARNINGS: Tuple[Tuple[str, str], ...] = (
    (TEMPO_JUMP, FASTER),
    (TEMPO_JUMP, SLOWER),
    (KEY_CLASH, NO_RELATION),
    (TEMPO_UNKNOWN, SIDE_FROM),
    (TEMPO_UNKNOWN, SIDE_TO),
    (TEMPO_UNKNOWN, SIDE_BOTH),
    (FILE_MISSING_WARNING, NOT_FOUND),
    (FILE_MISSING_WARNING, DRIVE_UNAVAILABLE),
    (FILE_UNREADABLE_WARNING, UNREADABLE),
    (TIME_OUTSIDE_TRACK, OUT_PAST_END),
    (TIME_OUTSIDE_TRACK, IN_PAST_END),
    (OVER_TARGET, ALL_TIMED),
    (OVER_TARGET, PARTLY_TIMED),
    (UNDER_TARGET, ALL_TIMED),
    (BPM_OUTSIDE_RANGE, BELOW),
    (BPM_OUTSIDE_RANGE, ABOVE),
    (BPM_OUTSIDE_RANGE, SIDE_BOTH),
)

#: The one notice: a track the Set holds more than once (DEC-017).
REPEAT = "repeat"
REPEAT_TRACK = "track"
NOTICES: Tuple[Tuple[str, str], ...] = ((REPEAT, REPEAT_TRACK),)

#: A file check as the rule reads it. The service maps the stored status to
#: these, so the rule does not depend on how a check is stored.
FILE_PRESENT = "present"
FILE_MISSING = "missing"
FILE_UNREADABLE = "unreadable"
FILE_NOT_CHECKED = "not_checked"
FILE_STATES: Tuple[str, ...] = (
    FILE_PRESENT,
    FILE_MISSING,
    FILE_UNREADABLE,
    FILE_NOT_CHECKED,
)

#: A compared BPM's precision: the library's own two decimals. Finer than that
#: is float noise, which must not make an acknowledgement stale.
COMPARED_BPM_DECIMALS = 2


# ------------------------------------------------------------------ inputs


@dataclass(frozen=True)
class EntryFacts:
    """One entry of a Set, as the checks read it.

    Attributes:
        entry_id: The entry.
        track_id: Its track.
        chapter_id: Its chapter.
        bpm: The effective BPM, or None when there is none.
        key: The effective key, or None.
        length_seconds: The track's length, or None when not known.
        in_seconds: The planned in time, or None.
        out_seconds: The planned out time, or None when untimed.
        file: The last file check of the track's current path, one of
            :data:`FILE_STATES`.
        drive_unavailable: For a missing file, True when the check found the
            drive or share the file is on was not there.
        file_checked_at: When the current path was last checked, or None.
    """

    entry_id: int
    track_id: int
    chapter_id: int
    bpm: Optional[float] = None
    key: Optional[MusicalKey] = None
    length_seconds: Optional[int] = None
    in_seconds: Optional[int] = None
    out_seconds: Optional[int] = None
    file: str = FILE_NOT_CHECKED
    drive_unavailable: bool = False
    file_checked_at: Optional[str] = None

    def __post_init__(self) -> None:
        """Refuse a file state the rule does not know."""
        if self.file not in FILE_STATES:
            raise ValueError(f"file must be one of {FILE_STATES}, got {self.file!r}")


@dataclass(frozen=True)
class ChapterFacts:
    """One chapter, in the Set's order, with the targets its checks read.

    Attributes:
        chapter_id: The chapter.
        target_seconds: Its target length, or None.
        bpm_min: The lowest tempo it should hold, or None.
        bpm_max: The highest, or None.
    """

    chapter_id: int
    target_seconds: Optional[int] = None
    bpm_min: Optional[float] = None
    bpm_max: Optional[float] = None


@dataclass(frozen=True)
class Acknowledged:
    """A transition warning the user accepted, with the values it compared."""

    from_entry_id: int
    to_entry_id: int
    warning: str
    compared: Mapping[str, Any]


# ----------------------------------------------------------------- outputs


@dataclass(frozen=True)
class SetWarning:
    """One thing a check found.

    Attributes:
        kind: One of :data:`KINDS`.
        detail: What it found; ``(kind, detail)`` is one of :data:`WARNINGS`.
        compared: The values it read, in canonical form, as JSON types.
        acknowledged: True for a transition warning an acknowledgement still
            applies to; always False for the others.
    """

    kind: str
    detail: str
    compared: Mapping[str, Any]
    acknowledged: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """The warning as data; the service rewrites keys for the wire."""
        return {
            "kind": self.kind,
            "detail": self.detail,
            "compared": dict(self.compared),
            "acknowledged": self.acknowledged,
        }


@dataclass(frozen=True)
class SetNotice:
    """Something worth knowing that is not a problem (DEC-017)."""

    kind: str
    detail: str
    compared: Mapping[str, Any]


@dataclass(frozen=True)
class TransitionCheck:
    """What was found going from one entry into the next."""

    from_entry_id: int
    to_entry_id: int
    warnings: Tuple[SetWarning, ...]


@dataclass(frozen=True)
class EntryCheck:
    """What was found about one entry."""

    entry_id: int
    warnings: Tuple[SetWarning, ...]
    notices: Tuple[SetNotice, ...]


@dataclass(frozen=True)
class ChapterCheck:
    """What was found about one chapter, and how long it runs."""

    chapter_id: int
    running_time: RunningTime
    warnings: Tuple[SetWarning, ...]


@dataclass(frozen=True)
class FileCoverage:
    """What the file checks say about a Set's tracks (DEC-073, DEC-088).

    Counted by track, not by entry: a file is missing once however many times
    the Set plays it.

    Attributes:
        tracks: How many distinct tracks the Set holds.
        checked: How many have a check of their current path.
        missing: How many were missing when checked.
        unreadable: How many could not be read.
        last_checked_at: The latest of those checks, or None.
    """

    tracks: int = 0
    checked: int = 0
    missing: int = 0
    unreadable: int = 0
    last_checked_at: Optional[str] = None

    @property
    def never_checked(self) -> bool:
        """True when no track of a non-empty Set has been checked: say so."""
        return self.tracks > 0 and self.checked == 0

    @property
    def unchecked(self) -> int:
        """How many tracks have no check of their current path."""
        return self.tracks - self.checked


@dataclass(frozen=True)
class ShapePoint:
    """One entry as the lanes draw it: the values the checks compared.

    Attributes:
        entry_id: The entry.
        chapter_id: Its chapter, where a lane marks a boundary.
        bpm: Its effective tempo to two decimals, or None.
        key: Its effective key, or None.
    """

    entry_id: int
    chapter_id: int
    bpm: Optional[float]
    key: Optional[MusicalKey]


@dataclass(frozen=True)
class ShapeStep:
    """How one transition's keys relate on DEC-096's wheel.

    Attributes:
        from_entry_id: The entry before.
        to_entry_id: The entry after.
        key_relation: ``same``, ``adjacent`` or ``relative``; None when the two
            keys clash, or when either is unknown (its point says which).
    """

    from_entry_id: int
    to_entry_id: int
    key_relation: Optional[str]


@dataclass(frozen=True)
class SetShape:
    """A Set's tempo and key, entry by entry (DEC-111)."""

    points: Tuple[ShapePoint, ...] = ()
    steps: Tuple[ShapeStep, ...] = ()


@dataclass(frozen=True)
class SetAnalysis:
    """Everything a Set's checks found.

    Attributes:
        transitions: One per pair of adjacent entries, in order.
        entries: One per entry, in order.
        chapters: One per chapter, in order.
        running_time: The Set's timed sum and untimed count.
        files: What the file checks cover.
        counts: How many of each kind are not acknowledged; kinds with none
            are absent.
        acknowledged: How many transition warnings an acknowledgement covers.
        notices: How many of each notice.
        shape: The values the checks read, for the lanes.
        without_key: How many entries have no key, so no key check applies.
    """

    transitions: Tuple[TransitionCheck, ...]
    entries: Tuple[EntryCheck, ...]
    chapters: Tuple[ChapterCheck, ...]
    running_time: RunningTime
    files: FileCoverage
    counts: Mapping[str, int] = field(default_factory=dict)
    acknowledged: int = 0
    notices: Mapping[str, int] = field(default_factory=dict)
    shape: SetShape = field(default_factory=SetShape)
    without_key: int = 0

    def warnings(self) -> Iterable[SetWarning]:
        """Every warning, transitions first, then entries, then chapters."""
        for transition in self.transitions:
            yield from transition.warnings
        for entry in self.entries:
            yield from entry.warnings
        for chapter in self.chapters:
            yield from chapter.warnings


# --------------------------------------------------------------- the checks


def camelot_code(key: MusicalKey) -> str:
    """A key's canonical spelling for comparison: its Camelot code, "8A"."""
    number, letter = key.camelot
    return f"{number}{letter}"


def _bpm(value: float) -> float:
    return round(value, COMPARED_BPM_DECIMALS)


def _side(before_missing: bool, after_missing: bool) -> str:
    if before_missing and after_missing:
        return SIDE_BOTH
    return SIDE_FROM if before_missing else SIDE_TO


def transition_warnings(before: EntryFacts, after: EntryFacts) -> List[SetWarning]:
    """What going from ``before`` into ``after`` finds, unacknowledged."""
    found: List[SetWarning] = []
    first, second = before.bpm, after.bpm
    if first is None or second is None:
        found.append(
            SetWarning(
                TEMPO_UNKNOWN,
                _side(first is None, second is None),
                {
                    "from": None if first is None else _bpm(first),
                    "to": None if second is None else _bpm(second),
                },
            )
        )
    elif (
        tempo_relation(first, second) is None and tempo_relation(second, first) is None
    ):
        heard = min(
            (second, second * 2, second / 2), key=lambda tempo: abs(tempo - first)
        )
        found.append(
            SetWarning(
                TEMPO_JUMP,
                FASTER if heard > first else SLOWER,
                {
                    "from": _bpm(first),
                    "to": _bpm(second),
                    "percent": tempo_gap(first, second),
                },
            )
        )
    # A side with no key is not a warning (DEC-201): Beatport's key is the only
    # key, so an unmatched library has none, and a warning on every transition
    # would say nothing. The Set's report counts the entries without one.
    if (
        before.key is not None
        and after.key is not None
        and key_relation(before.key, after.key) is None
    ):
        found.append(
            SetWarning(
                KEY_CLASH,
                NO_RELATION,
                {"from": camelot_code(before.key), "to": camelot_code(after.key)},
            )
        )
    return found


def entry_warnings(entry: EntryFacts) -> List[SetWarning]:
    """What one entry's file and planned times find."""
    found: List[SetWarning] = []
    if entry.file == FILE_MISSING:
        found.append(
            SetWarning(
                FILE_MISSING_WARNING,
                DRIVE_UNAVAILABLE if entry.drive_unavailable else NOT_FOUND,
                {"checked_at": entry.file_checked_at},
            )
        )
    elif entry.file == FILE_UNREADABLE:
        found.append(
            SetWarning(
                FILE_UNREADABLE_WARNING,
                UNREADABLE,
                {"checked_at": entry.file_checked_at},
            )
        )
    length = entry.length_seconds
    if length is not None:
        starts_past = entry.in_seconds is not None and entry.in_seconds >= length
        ends_past = entry.out_seconds is not None and entry.out_seconds > length
        if starts_past or ends_past:
            found.append(
                SetWarning(
                    TIME_OUTSIDE_TRACK,
                    IN_PAST_END if starts_past else OUT_PAST_END,
                    {
                        "length": length,
                        "in": entry.in_seconds,
                        "out": entry.out_seconds,
                    },
                )
            )
    return found


def chapter_warnings(
    chapter: ChapterFacts, entries: Sequence[EntryFacts]
) -> Tuple[RunningTime, List[SetWarning]]:
    """A chapter's running time, and what its targets find."""
    total = running_time(entries)
    found: List[SetWarning] = []
    target = chapter.target_seconds
    if target is not None:
        compared = {
            "target": target,
            "planned": total.seconds,
            "untimed": total.untimed,
        }
        if total.seconds > target:
            found.append(
                SetWarning(
                    OVER_TARGET,
                    ALL_TIMED if total.is_complete else PARTLY_TIMED,
                    compared,
                )
            )
        elif total.is_complete and total.seconds < target:
            found.append(SetWarning(UNDER_TARGET, ALL_TIMED, compared))
    low, high = chapter.bpm_min, chapter.bpm_max
    if low is not None or high is not None:
        outside: List[Dict[str, Any]] = []
        below = above = False
        for entry in entries:
            bpm = entry.bpm
            if bpm is None:
                continue  # an unknown tempo is its transitions' warning
            if low is not None and bpm < low:
                below = True
            elif high is not None and bpm > high:
                above = True
            else:
                continue
            outside.append({"entry_id": entry.entry_id, "bpm": _bpm(bpm)})
        if outside:
            found.append(
                SetWarning(
                    BPM_OUTSIDE_RANGE,
                    SIDE_BOTH if below and above else (BELOW if below else ABOVE),
                    {"min": low, "max": high, "entries": outside},
                )
            )
    return total, found


def _applies(
    warning: SetWarning,
    before: EntryFacts,
    after: EntryFacts,
    acknowledged: Mapping[Tuple[int, int, str], Mapping[str, Any]],
) -> bool:
    compared = acknowledged.get((before.entry_id, after.entry_id, warning.kind))
    return compared is not None and dict(compared) == dict(warning.compared)


def shape_of(entries: Sequence[EntryFacts]) -> SetShape:
    """The Set's tempo and key, as its checks read them (DEC-111).

    Each point is an entry's own values, BPMs to the two decimals a warning
    compares, and each step is DEC-096's wheel between neighbours' keys: the
    same ``key_relation`` a ``key_clash`` is found by.
    """
    points = tuple(
        ShapePoint(
            entry_id=entry.entry_id,
            chapter_id=entry.chapter_id,
            bpm=None if entry.bpm is None else _bpm(entry.bpm),
            key=entry.key,
        )
        for entry in entries
    )
    steps = tuple(
        ShapeStep(
            from_entry_id=before.entry_id,
            to_entry_id=after.entry_id,
            key_relation=(
                None
                if before.key is None or after.key is None
                else key_relation(before.key, after.key)
            ),
        )
        for before, after in zip(entries, entries[1:])
    )
    return SetShape(points=points, steps=steps)


def analyse(
    entries: Sequence[EntryFacts],
    chapters: Sequence[ChapterFacts],
    acknowledgements: Iterable[Acknowledged] = (),
) -> SetAnalysis:
    """Check a Set: every transition, entry and chapter (DEC-106).

    Args:
        entries: The Set's entries in order, repeats included.
        chapters: Its chapters in order.
        acknowledgements: The transition warnings the user accepted. One that
            no longer applies is ignored, and its warning shows.

    Raises:
        ValueError: If an entry names a chapter that is not among
            ``chapters``.
    """
    known = {
        (a.from_entry_id, a.to_entry_id, a.warning): a.compared
        for a in acknowledgements
    }
    counts: Counter[str] = Counter()
    acknowledged = 0

    transitions: List[TransitionCheck] = []
    for before, after in zip(entries, entries[1:]):
        checked: List[SetWarning] = []
        for warning in transition_warnings(before, after):
            if _applies(warning, before, after, known):
                acknowledged += 1
                warning = SetWarning(
                    warning.kind, warning.detail, warning.compared, acknowledged=True
                )
            else:
                counts[warning.kind] += 1
            checked.append(warning)
        transitions.append(
            TransitionCheck(before.entry_id, after.entry_id, tuple(checked))
        )

    positions: Dict[int, List[int]] = defaultdict(list)
    for position, entry in enumerate(entries):
        positions[entry.track_id].append(position)
    notices: Counter[str] = Counter()
    entry_checks: List[EntryCheck] = []
    for position, entry in enumerate(entries):
        found = entry_warnings(entry)
        counts.update(w.kind for w in found)
        repeats: Tuple[SetNotice, ...] = ()
        if len(positions[entry.track_id]) > 1:
            others = [p for p in positions[entry.track_id] if p != position]
            repeats = (SetNotice(REPEAT, REPEAT_TRACK, {"others": others}),)
            notices[REPEAT] += 1
        entry_checks.append(EntryCheck(entry.entry_id, tuple(found), repeats))

    by_chapter: Dict[int, List[EntryFacts]] = {c.chapter_id: [] for c in chapters}
    for entry in entries:
        if entry.chapter_id not in by_chapter:
            raise ValueError(
                f"Entry {entry.entry_id} is in chapter {entry.chapter_id},"
                " which is not one of the Set's chapters"
            )
        by_chapter[entry.chapter_id].append(entry)
    chapter_checks: List[ChapterCheck] = []
    for chapter in chapters:
        total, found = chapter_warnings(chapter, by_chapter[chapter.chapter_id])
        counts.update(w.kind for w in found)
        chapter_checks.append(ChapterCheck(chapter.chapter_id, total, tuple(found)))

    return SetAnalysis(
        transitions=tuple(transitions),
        entries=tuple(entry_checks),
        chapters=tuple(chapter_checks),
        running_time=running_time(entries),
        files=file_coverage(entries),
        counts={kind: counts[kind] for kind in KINDS if counts[kind]},
        acknowledged=acknowledged,
        notices=dict(notices),
        shape=shape_of(entries),
        without_key=sum(1 for entry in entries if entry.key is None),
    )


def file_coverage(entries: Iterable[EntryFacts]) -> FileCoverage:
    """What the file checks say about the distinct tracks among ``entries``."""
    tracks: Dict[int, EntryFacts] = {}
    for entry in entries:
        tracks.setdefault(entry.track_id, entry)
    checked = [e for e in tracks.values() if e.file != FILE_NOT_CHECKED]
    stamps = [e.file_checked_at for e in checked if e.file_checked_at]
    return FileCoverage(
        tracks=len(tracks),
        checked=len(checked),
        missing=sum(1 for e in checked if e.file == FILE_MISSING),
        unreadable=sum(1 for e in checked if e.file == FILE_UNREADABLE),
        last_checked_at=max(stamps) if stamps else None,
    )


def transition_warning(
    before: EntryFacts, after: EntryFacts, kind: str
) -> Optional[SetWarning]:
    """The warning of ``kind`` going from ``before`` into ``after``, or None.

    What an acknowledgement is made against: the values it stores are the ones
    this finds now.

    Raises:
        ValueError: If ``kind`` is not a transition warning.
    """
    if kind not in TRANSITION_KINDS:
        raise ValueError(
            f"Only a transition's warnings can be acknowledged, and {kind!r} "
            f"is not one of {TRANSITION_KINDS}"
        )
    for warning in transition_warnings(before, after):
        if warning.kind == kind:
            return warning
    return None


__all__ = (
    "ABOVE",
    "ALL_TIMED",
    "BELOW",
    "BPM_OUTSIDE_RANGE",
    "CHAPTER_KINDS",
    "COMPARED_BPM_DECIMALS",
    "DRIVE_UNAVAILABLE",
    "ENTRY_KINDS",
    "FASTER",
    "FILE_MISSING",
    "FILE_MISSING_WARNING",
    "FILE_NOT_CHECKED",
    "FILE_PRESENT",
    "FILE_STATES",
    "FILE_UNREADABLE",
    "FILE_UNREADABLE_WARNING",
    "IN_PAST_END",
    "KEY_CLASH",
    "KEY_UNKNOWN",
    "KINDS",
    "NOTICES",
    "NOT_FOUND",
    "NO_RELATION",
    "OUT_PAST_END",
    "OVER_TARGET",
    "PARTLY_TIMED",
    "REPEAT",
    "REPEAT_TRACK",
    "SIDE_BOTH",
    "SIDE_FROM",
    "SIDE_TO",
    "SLOWER",
    "TEMPO_JUMP",
    "TEMPO_UNKNOWN",
    "TIME_OUTSIDE_TRACK",
    "TRANSITION_KINDS",
    "UNDER_TARGET",
    "UNREADABLE",
    "WARNINGS",
    "Acknowledged",
    "ChapterCheck",
    "ChapterFacts",
    "EntryCheck",
    "EntryFacts",
    "FileCoverage",
    "SetAnalysis",
    "SetNotice",
    "SetShape",
    "SetWarning",
    "ShapePoint",
    "ShapeStep",
    "TransitionCheck",
    "analyse",
    "camelot_code",
    "chapter_warnings",
    "entry_warnings",
    "file_coverage",
    "shape_of",
    "transition_warning",
    "transition_warnings",
)
