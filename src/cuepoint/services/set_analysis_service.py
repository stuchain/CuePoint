#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's warnings, and the ones the user has accepted (PREP-05, DEC-106).

The rule is ``core.set_analysis``; this service feeds it a Set and writes its
answer down. It reads the Set in three statements: its entries with their
effective BPM and key, track length and last file check; its chapters; and its
acknowledgements. It writes nothing but acknowledgements, and records no activity:
a Set's plan is not the library's history (PREP-03's rule).

Keys are compared on the Camelot wheel and written in the library's notation
------------------------------------------------------------------------------
The rule compares canonical values, keys as Camelot codes, and an
acknowledgement stores those. The wire writes every key in the notation most of
the library uses (``notation_from_counts``), as Similar Tracks' reasons are
written, so a warning reads the way the user's key column does.

The shape
---------
The answer also carries the values the checks read, entry by entry: each
effective BPM, each key in the library's notation and as its place on the
wheel, and how each transition's keys relate (DEC-111). The Prepare page's
lanes draw them, so a lane says what a warning says.

Acknowledging
-------------
:meth:`SetAnalysisService.acknowledge` accepts a transition warning that is
there now. The two entries must be in one Set and adjacent in that order, and
the warning must be one the transition gives. It stores the values the warning
compared, so the acknowledgement stops applying when they change. Asking
for one that is not there is refused, because accepting a warning nobody was
shown is not something a user did.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence

from cuepoint.core.set_analysis import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FILE_UNREADABLE,
    KEY_CLASH,
    KEY_UNKNOWN,
    TRANSITION_KINDS,
    Acknowledged,
    ChapterFacts,
    EntryFacts,
    SetAnalysis,
    SetNotice,
    SetShape,
    SetWarning,
    analyse,
    transition_warning,
)
from cuepoint.core.set_timing import RunningTime
from cuepoint.core.similarity import MusicalKey
from cuepoint.models import file_status
from cuepoint.models.collection import Collection
from cuepoint.models.set_plan import EntryFactsRow, SetAcknowledgement
from cuepoint.services.interfaces import (
    ICollectionRepository,
    IDatabaseService,
    ISetAnalysisService,
    ISetRepository,
    ITrackRepository,
)
from cuepoint.services.override_values import (
    format_key,
    notation_from_counts,
    parse_key,
)

#: The budget for checking a Set at the size limit, 1,000 entries (PREP-05's
#: acceptance). The outcome records the measurement.
ANALYSIS_BUDGET_SECONDS = 0.2

#: A stored file status as the rule reads it. A track with no check of its
#: current path is not checked, which is not the same as missing (DEC-088).
_FILE_STATES: Mapping[Optional[str], str] = {
    None: FILE_NOT_CHECKED,
    file_status.FILE_PRESENT: FILE_PRESENT,
    file_status.FILE_MISSING: FILE_MISSING,
    file_status.FILE_UNREADABLE: FILE_UNREADABLE,
}

#: The warnings whose compared values are keys, to be written in notation.
_KEYED = (KEY_CLASH, KEY_UNKNOWN)


def _bpm(value: Any) -> Optional[float]:
    """A tempo the rule can read, else none, as Similar Tracks reads one."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) and number > 0 else None


def _key(value: Any) -> Optional[MusicalKey]:
    parsed = parse_key(value) if isinstance(value, str) else None
    return None if parsed is None else MusicalKey(*parsed)


def facts_of(row: EntryFactsRow) -> EntryFacts:
    """A stored entry as the rule reads it.

    Anything that is not a value the rule can use (a BPM of zero, a key that
    is not a key, a length of zero) is no value, as it is to a person reading
    the row.
    """
    length = row.length_seconds
    return EntryFacts(
        entry_id=int(row.entry_id),
        track_id=int(row.track_id),
        chapter_id=int(row.chapter_id),
        bpm=_bpm(row.bpm),
        key=_key(row.key),
        length_seconds=int(length) if isinstance(length, int) and length > 0 else None,
        in_seconds=row.in_seconds,
        out_seconds=row.out_seconds,
        file=_FILE_STATES.get(row.file_status, FILE_NOT_CHECKED),
        drive_unavailable=row.file_reason == file_status.REASON_ROOT_UNAVAILABLE,
        file_checked_at=row.file_checked_at,
    )


def _running(value: RunningTime) -> Dict[str, int]:
    return {"seconds": value.seconds, "timed": value.timed, "untimed": value.untimed}


@dataclass(frozen=True)
class SetAnalysisReport:
    """A Set's checks, ready for the wire (PREP-05).

    Attributes:
        set: The Set's node.
        notation: The key notation keys are written in.
        analysis: What the rule found.
    """

    set: Collection
    notation: str
    analysis: SetAnalysis

    def _key(self, code: Optional[str]) -> Optional[str]:
        if code is None:
            return None
        key = MusicalKey.from_camelot(int(code[:-1]), code[-1])
        return format_key(key.pitch, key.minor, self.notation)

    def warning(self, warning: SetWarning) -> Dict[str, Any]:
        """One warning as its wire object, keys in the library's notation."""
        compared = dict(warning.compared)
        if warning.kind in _KEYED:
            compared = {side: self._key(compared[side]) for side in ("from", "to")}
        return {
            "kind": warning.kind,
            "detail": warning.detail,
            "compared": compared,
            "acknowledged": warning.acknowledged,
        }

    def shape(self, shape: SetShape) -> Dict[str, Any]:
        """The lanes' values on the wire (DEC-111).

        Every entry is listed, in order, with its key twice: in the library's
        notation, as the key column writes it, and as its place on the wheel,
        which is what the key lane draws.
        """
        return {
            "entries": [
                {
                    "entry_id": point.entry_id,
                    "chapter_id": point.chapter_id,
                    "bpm": point.bpm,
                    "key": (
                        None
                        if point.key is None
                        else format_key(point.key.pitch, point.key.minor, self.notation)
                    ),
                    "camelot": (
                        None
                        if point.key is None
                        else {
                            "number": point.key.camelot[0],
                            "letter": point.key.camelot[1],
                        }
                    ),
                }
                for point in shape.points
            ],
            "transitions": [
                {
                    "from_entry_id": step.from_entry_id,
                    "to_entry_id": step.to_entry_id,
                    "key_relation": step.key_relation,
                }
                for step in shape.steps
            ],
        }

    @staticmethod
    def notice(notice: SetNotice) -> Dict[str, Any]:
        """One notice as its wire object."""
        return {
            "kind": notice.kind,
            "detail": notice.detail,
            "compared": dict(notice.compared),
        }

    def to_dict(self) -> Dict[str, Any]:
        """The checks on the wire.

        Transitions and entries are listed only when something was found, so
        a clean Set of a thousand entries is not a thousand empty objects.
        Every chapter is listed, with its running time.
        """
        found = self.analysis
        files = found.files
        return {
            "set_id": self.set.id,
            "notation": self.notation,
            "running_time": _running(found.running_time),
            "counts": dict(found.counts),
            "acknowledged": found.acknowledged,
            "notices": dict(found.notices),
            "files": {
                "tracks": files.tracks,
                "checked": files.checked,
                "unchecked": files.unchecked,
                "missing": files.missing,
                "unreadable": files.unreadable,
                "never_checked": files.never_checked,
                "last_checked_at": files.last_checked_at,
            },
            "transitions": [
                {
                    "from_entry_id": t.from_entry_id,
                    "to_entry_id": t.to_entry_id,
                    "warnings": [self.warning(w) for w in t.warnings],
                }
                for t in found.transitions
                if t.warnings
            ],
            "entries": [
                {
                    "entry_id": e.entry_id,
                    "warnings": [self.warning(w) for w in e.warnings],
                    "notices": [self.notice(n) for n in e.notices],
                }
                for e in found.entries
                if e.warnings or e.notices
            ],
            "chapters": [
                {
                    "chapter_id": c.chapter_id,
                    "running_time": _running(c.running_time),
                    "warnings": [self.warning(w) for w in c.warnings],
                }
                for c in found.chapters
            ],
            "shape": self.shape(found.shape),
        }


class SetAnalysisService(ISetAnalysisService):
    """Checks a Set, and keeps the warnings its user has accepted."""

    def __init__(
        self,
        collection_repository: ICollectionRepository,
        set_repository: ISetRepository,
        track_repository: ITrackRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the service to what it reads and the one thing it writes.

        Args:
            collection_repository: The Set's node, chapters and
                acknowledgements.
            set_repository: The Set's entries as its checks read them, and
                where an acknowledgement is written.
            track_repository: The library's key notation.
            database_service: Opens the transaction a check reads in and an
                acknowledgement is written in. No SQL is run here.
        """
        self._collections = collection_repository
        self._sets = set_repository
        self._tracks = track_repository
        self._db = database_service

    def analyse(self, set_id: int) -> SetAnalysisReport:
        """Check every transition, entry and chapter of a Set (DEC-106).

        One consistent read: the entries, chapters and acknowledgements are
        read in one transaction, so a write between them cannot pair an entry
        with a chapter list that has lost its chapter.

        Raises:
            ValueError: If there is no such Set, or the node is not one.
        """
        with self._db.transaction(join_existing=True):
            node = self._require_set(set_id)
            analysis = self._analysis(int(set_id))
        notation = notation_from_counts(*self._tracks.key_notation_counts())
        return SetAnalysisReport(set=node, notation=notation, analysis=analysis)

    def acknowledge(
        self, from_entry_id: int, to_entry_id: int, warning: str
    ) -> SetAcknowledgement:
        """Accept a transition warning that is there now (DEC-106).

        Stores the values it compared, so it applies only while they, and the
        two entries' order, are unchanged. Acknowledging it again after they
        changed accepts the new values.

        Raises:
            ValueError: If ``warning`` is not a transition warning, an entry is
                not in a Set, the two are in different Sets or are not
                adjacent in that order, or the transition does not give that
                warning.
        """
        if warning not in TRANSITION_KINDS:
            raise ValueError(
                f"Only a transition's warnings can be acknowledged, and {warning!r} "
                f"is not one of {', '.join(TRANSITION_KINDS)}"
            )
        with self._db.transaction():
            before_row = self._sets.entry_row(int(from_entry_id))
            after_row = self._sets.entry_row(int(to_entry_id))
            if before_row is None or after_row is None:
                missing = from_entry_id if before_row is None else to_entry_id
                raise ValueError(f"No such entry in a Set: {missing}")
            set_id = before_row.plan.collection_id
            if after_row.plan.collection_id != set_id:
                raise ValueError(
                    f"Entries {from_entry_id} and {to_entry_id} are in different Sets"
                )
            if after_row.position != before_row.position + 1:
                raise ValueError(
                    f"Entry {to_entry_id} does not follow entry {from_entry_id}: "
                    "only a transition between adjacent entries can be acknowledged"
                )
            facts = {
                row.entry_id: facts_of(row) for row in self._sets.entry_facts(set_id)
            }
            found = transition_warning(
                facts[int(from_entry_id)], facts[int(to_entry_id)], warning
            )
            if found is None:
                raise ValueError(
                    f"There is no {warning} going from entry {from_entry_id} to "
                    f"entry {to_entry_id} to acknowledge"
                )
            return self._sets.acknowledge(
                SetAcknowledgement(
                    collection_id=set_id,
                    from_entry_id=int(from_entry_id),
                    to_entry_id=int(to_entry_id),
                    warning=warning,
                    compared_json=json.dumps(dict(found.compared), sort_keys=True),
                )
            )

    def unacknowledge(self, from_entry_id: int, to_entry_id: int, warning: str) -> bool:
        """Withdraw an acknowledgement, so its warning shows again.

        Returns:
            True if there was one to withdraw.

        Raises:
            ValueError: If ``warning`` is not a transition warning.
        """
        if warning not in TRANSITION_KINDS:
            raise ValueError(
                f"{warning!r} is not a transition warning, so it is never acknowledged"
            )
        with self._db.transaction():
            return self._sets.unacknowledge(
                int(from_entry_id), int(to_entry_id), warning
            )

    # --------------------------------------------------------------- helpers

    def _analysis(self, set_id: int) -> SetAnalysis:
        entries = [facts_of(row) for row in self._sets.entry_facts(set_id)]
        chapters = [
            ChapterFacts(
                chapter_id=int(chapter.id or 0),
                target_seconds=chapter.target_seconds,
                bpm_min=chapter.bpm_min,
                bpm_max=chapter.bpm_max,
            )
            for chapter in self._collections.chapters(set_id)
        ]
        acknowledged: List[Acknowledged] = [
            Acknowledged(
                from_entry_id=ack.from_entry_id,
                to_entry_id=ack.to_entry_id,
                warning=ack.warning,
                compared=ack.compared,
            )
            for ack in self._collections.acknowledgements(set_id)
        ]
        return analyse(entries, chapters, acknowledged)

    def _require_set(self, set_id: int) -> Collection:
        node = self._collections.get(int(set_id))
        if node is None:
            raise ValueError(f"No such Set: {set_id}")
        if not node.is_set:
            raise ValueError(f"{node.name!r} is a {node.kind}, not a Set")
        return node


__all__: Sequence[str] = (
    "ANALYSIS_BUDGET_SECONDS",
    "SetAnalysisReport",
    "SetAnalysisService",
    "facts_of",
)
