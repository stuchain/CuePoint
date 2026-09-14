#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Finding possible duplicates, remembering "not duplicates" (CLEAN-08, DEC-074).

A scan rebuilds the stored groups one signal at a time — path, Beatport, text —
each written in one transaction, so a signal is always either the previous
scan's answer or this one's. The work of *finding* happens before the
transaction: two SQL reads and one streamed read the text signal groups in
Python. The write lock is held only while the answer is written, never while
fifty thousand titles are normalized.

What a scan never does
----------------------
It writes nothing but the three duplicate tables and the activity feed. It does
not delete, merge, retag or edit a track, and it opens no file. DEC-074 is
explicit that a duplicate is a question for a person: the actions a group offers
are the ones that already exist — tag, add to a Collection, reveal — and they
are CLEAN-13's.

Dismissing
----------
:meth:`DuplicateService.dismiss` records "these are not duplicates" for the
members the group has *now*, and writes the same fingerprint onto the group, so
the Duplicates list and the filter fields hide it at once. A group that later
gains a member is a different set of tracks and is shown again (DEC-074). The
answer can be taken back with :meth:`DuplicateService.restore`.

Groups are as of the last scan, which follows every import, refresh and match
job. A user's decision on a single track between scans can leave a Beatport
group one scan behind; each group says when it was computed.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from cuepoint.models.duplicate_group import (
    SIGNAL_BEATPORT,
    SIGNAL_LABELS,
    SIGNAL_PATH,
    SIGNAL_TEXT,
    SIGNALS,
    DuplicateDismissal,
    DuplicateGroupMembers,
    ScannedGroup,
    member_hash,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.services.busy_wait import write_waiting
from cuepoint.services.duplicate_keys import text_groups
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    IDuplicateRepository,
    IDuplicateService,
)

_logger = logging.getLogger(__name__)

#: Recorded once per scan, with each signal's counts.
EVENT_DUPLICATES_SCANNED = "clean.duplicates.scanned"

#: Recorded when a user marks a group as not duplicates, and when they take it back.
EVENT_DUPLICATES_DISMISSED = "clean.duplicates.dismissed"
EVENT_DUPLICATES_RESTORED = "clean.duplicates.restored"

#: What started a scan: every import, applied refresh and match job, or a request.
TRIGGER_REQUEST = "request"
TRIGGER_IMPORT = "import"
TRIGGER_REFRESH = "refresh"
TRIGGER_MATCH = "match"
TRIGGERS = (TRIGGER_REQUEST, TRIGGER_IMPORT, TRIGGER_REFRESH, TRIGGER_MATCH)

#: How long a signal's write keeps trying while another job holds the database.
DATABASE_BUSY_PATIENCE_SECONDS = 120.0
_BUSY_RETRY_INTERVAL_SECONDS = 0.05

#: Rows the text signal reads between asking whether to stop.
_CANCEL_EVERY_ROWS = 1_000

#: How each signal is named in a sentence about a scan.
_SIGNAL_NOUNS = {
    SIGNAL_PATH: "file path",
    SIGNAL_BEATPORT: "Beatport track",
    SIGNAL_TEXT: "artist and title",
}


def validate_signals(signals: Optional[Iterable[str]]) -> Tuple[str, ...]:
    """Return the signals to scan, in scan order; every one when none are named.

    Raises:
        ValueError: If a signal is unknown, or an empty list was given.
    """
    if signals is None:
        return SIGNALS
    wanted = [str(signal) for signal in signals]
    unknown = sorted(set(wanted) - set(SIGNALS))
    if unknown:
        raise ValueError(
            f"Unknown duplicate signals {unknown}; the signals are {SIGNALS}"
        )
    if not wanted:
        raise ValueError("A duplicate scan needs at least one signal")
    return tuple(signal for signal in SIGNALS if signal in wanted)


def _count(number: int, noun: str) -> str:
    return f"{number:,} {noun}{'' if number == 1 else 's'}"


@dataclass(frozen=True)
class SignalScan:
    """What one signal found.

    Attributes:
        signal: One of :data:`SIGNALS`.
        groups: Groups shown now: two or more members, not dismissed.
        tracks: Tracks in those groups.
        dismissed: Groups found that a dismissal still covers.
        seconds: How long finding and writing took.
    """

    signal: str
    groups: int
    tracks: int
    dismissed: int
    seconds: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signal": self.signal,
            "groups": self.groups,
            "tracks": self.tracks,
            "dismissed": self.dismissed,
            "seconds": round(self.seconds, 3),
        }


@dataclass(frozen=True)
class DuplicateScanResult:
    """What a scan found, per signal, and whether it was stopped."""

    trigger: str
    signals: Tuple[str, ...]
    scans: Tuple[SignalScan, ...]
    cancelled: bool = False
    duration_seconds: float = 0.0

    def __post_init__(self) -> None:
        """Hold the result to what a scan can produce."""
        if self.trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {self.trigger!r}")
        scanned = tuple(scan.signal for scan in self.scans)
        if scanned != self.signals[: len(scanned)]:
            raise ValueError("A scan reports its signals in the order it scanned them")
        if not self.cancelled and len(scanned) != len(self.signals):
            raise ValueError(
                "A scan that was not cancelled scans every signal it was given"
            )

    @property
    def groups(self) -> int:
        """Groups shown across the signals scanned."""
        return sum(scan.groups for scan in self.scans)

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        if self.cancelled:
            done = [_SIGNAL_NOUNS[scan.signal] for scan in self.scans]
            if not done:
                return "Stopped before looking for duplicates"
            head = f"Stopped after looking for duplicates by {', '.join(done)}"
        elif self.groups == 0:
            head = "Found no possible duplicates"
        else:
            head = f"Found {_count(self.groups, 'possible duplicate group')}"
        parts = [
            f"{scan.groups:,} by {_SIGNAL_NOUNS[scan.signal]}"
            for scan in self.scans
            if scan.groups
        ]
        line = f"{head}: {', '.join(parts)}" if parts and not self.cancelled else head
        if parts and self.cancelled:
            line += f": {', '.join(parts)}"
        dismissed = sum(scan.dismissed for scan in self.scans)
        if dismissed:
            line += f". {_count(dismissed, 'more group')} marked not duplicates"
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The job's answer. A public shape; extend rather than rename."""
        return {
            "trigger": self.trigger,
            "signals": list(self.signals),
            "scans": [scan.to_dict() for scan in self.scans],
            "groups": self.groups,
            "cancelled": self.cancelled,
            "duration_seconds": round(self.duration_seconds, 3),
            "summary_line": self.summary_line(),
        }


class DuplicateService(IDuplicateService):
    """Scans for possible duplicates and records a user's answers about them."""

    def __init__(
        self,
        duplicate_repository: IDuplicateRepository,
        activity_service: Optional[IActivityService],
        database_service: IDatabaseService,
        *,
        clock: Callable[[], str] = utc_now_iso,
    ) -> None:
        """Store collaborators."""
        self._groups = duplicate_repository
        self._activity = activity_service
        self._db = database_service
        self._clock = clock

    # ----------------------------------------------------------------- scan

    def scan(
        self,
        signals: Optional[Sequence[str]] = None,
        *,
        trigger: str = TRIGGER_REQUEST,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> DuplicateScanResult:
        """Rebuild the stored groups for each signal, one transaction each.

        Args:
            signals: The signals to rebuild; every one when None.
            trigger: What started the scan, for its event.
            should_cancel: Asked before each signal and while the text signal
                reads. A signal already written stays written; one being found
                is left as the previous scan wrote it.

        Raises:
            ValueError: If a signal or the trigger is unknown.
        """
        wanted = validate_signals(signals)
        if trigger not in TRIGGERS:
            raise ValueError(f"trigger must be one of {TRIGGERS}, got {trigger!r}")
        started = time.monotonic()
        scans: List[SignalScan] = []
        cancelled = False
        for signal in wanted:
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            signal_started = time.monotonic()
            found = self._find(signal, should_cancel)
            if found is None:
                cancelled = True
                break
            computed_at = self._clock()
            write_waiting(
                self._db,
                lambda: self._groups.replace_signal(signal, found, computed_at),
                patience_seconds=DATABASE_BUSY_PATIENCE_SECONDS,
                interval_seconds=_BUSY_RETRY_INTERVAL_SECONDS,
                on_wait=lambda: _logger.info(
                    "[duplicates] the library is busy; waiting to save %s groups",
                    signal,
                ),
            )
            scans.append(self._tally(signal, time.monotonic() - signal_started))

        result = DuplicateScanResult(
            trigger=trigger,
            signals=wanted,
            scans=tuple(scans),
            cancelled=cancelled,
            duration_seconds=time.monotonic() - started,
        )
        _logger.info("[duplicates] %s (%s)", result.summary_line(), trigger)
        self._record_scan(result)
        return result

    def _find(
        self, signal: str, should_cancel: Optional[Callable[[], bool]]
    ) -> Optional[List[ScannedGroup]]:
        """The groups one signal finds now; None when a cancel stopped the read."""
        if signal == SIGNAL_PATH:
            return self._groups.path_groups()
        if signal == SIGNAL_BEATPORT:
            return self._groups.beatport_groups()

        rows: List[Tuple[int, Optional[str], Optional[str], Optional[int]]] = []
        for index, row in enumerate(self._groups.text_rows()):
            if (
                should_cancel is not None
                and index % _CANCEL_EVERY_ROWS == 0
                and index
                and should_cancel()
            ):
                return None
            rows.append(row)
        return [
            ScannedGroup(SIGNAL_TEXT, key, ids)
            for key, ids in sorted(text_groups(rows).items())
        ]

    def _tally(self, signal: str, seconds: float) -> SignalScan:
        stored = self._groups.groups(signal, include_dismissed=True)
        shown = [group for group in stored if not group.dismissed]
        return SignalScan(
            signal=signal,
            groups=len(shown),
            tracks=len({track_id for group in shown for track_id in group.track_ids}),
            dismissed=len(stored) - len(shown),
            seconds=seconds,
        )

    # --------------------------------------------------------------- groups

    def groups(
        self, signal: Optional[str] = None, *, include_dismissed: bool = False
    ) -> List[DuplicateGroupMembers]:
        """The stored groups of two or more, dismissed ones only when asked.

        Raises:
            ValueError: If the signal is unknown.
        """
        if signal is not None:
            validate_signals([signal])
        return self._groups.groups(signal, include_dismissed=include_dismissed)

    def dismiss(self, group_id: int) -> DuplicateGroupMembers:
        """Mark a group "not duplicates" for the members it has now.

        Raises:
            LookupError: If there is no such group.
            ValueError: If it no longer has two members, so there is nothing to
                answer about, or it is already dismissed.
        """
        current = self._require(group_id)
        if len(current.track_ids) < 2:
            raise ValueError(
                "That group no longer has two tracks in it, so there is nothing to"
                " mark as not duplicates"
            )
        if current.dismissed:
            raise ValueError("That group is already marked as not duplicates")
        group = current.group
        dismissal = DuplicateDismissal(
            signal=group.signal,
            group_key=group.group_key,
            member_hash=member_hash(current.track_ids),
            dismissed_at=self._clock(),
        )
        with self._db.transaction():
            self._groups.dismiss(dismissal, int(group_id))
        self._record(
            EVENT_DUPLICATES_DISMISSED,
            f"Marked {_count(len(current.track_ids), 'track')} as not duplicates"
            f" ({SIGNAL_LABELS[group.signal]})",
            current,
        )
        return self._require(group_id)

    def restore(self, group_id: int) -> DuplicateGroupMembers:
        """Take back a dismissal, showing the group again.

        Raises:
            LookupError: If there is no such group.
            ValueError: If it is not dismissed.
        """
        current = self._require(group_id)
        if not current.dismissed:
            raise ValueError("That group is not marked as not duplicates")
        with self._db.transaction():
            self._groups.undismiss(current.group.signal, current.group.group_key)
        self._record(
            EVENT_DUPLICATES_RESTORED,
            f"Showed {_count(len(current.track_ids), 'track')} as possible duplicates"
            f" again ({SIGNAL_LABELS[current.group.signal]})",
            current,
        )
        return self._require(group_id)

    def _require(self, group_id: int) -> DuplicateGroupMembers:
        found = self._groups.group(int(group_id))
        if found is None:
            raise LookupError(f"No duplicate group {group_id}")
        return found

    # ----------------------------------------------------------------- feed

    def _record_scan(self, result: DuplicateScanResult) -> None:
        """One event per scan, best-effort as every job's is."""
        if result.cancelled and not result.scans:
            return
        detail: Dict[str, Any] = {
            "trigger": result.trigger,
            "cancelled": result.cancelled,
        }
        for scan in result.scans:
            detail[scan.signal] = scan.groups
        self._write_event(EVENT_DUPLICATES_SCANNED, result.summary_line(), detail)

    def _record(self, event: str, summary: str, group: DuplicateGroupMembers) -> None:
        self._write_event(
            event,
            summary,
            {
                "group_id": group.group.id,
                "signal": group.group.signal,
                "tracks": len(group.track_ids),
            },
        )

    def _write_event(self, event: str, summary: str, detail: Dict[str, Any]) -> None:
        if self._activity is None:
            return
        try:
            self._activity.record_event(event, summary, detail)
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record %s: %s", event, exc)


__all__: Sequence[str] = (
    "DATABASE_BUSY_PATIENCE_SECONDS",
    "EVENT_DUPLICATES_DISMISSED",
    "EVENT_DUPLICATES_RESTORED",
    "EVENT_DUPLICATES_SCANNED",
    "TRIGGERS",
    "TRIGGER_IMPORT",
    "TRIGGER_MATCH",
    "TRIGGER_REFRESH",
    "TRIGGER_REQUEST",
    "DuplicateScanResult",
    "DuplicateService",
    "SignalScan",
    "validate_signals",
)
