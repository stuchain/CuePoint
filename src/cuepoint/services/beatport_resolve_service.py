#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Resolving the library's accepted matches into Beatport identities (DISCOVER-04, DEC-095).

An accepted match names a Beatport *track*. Its artists and label are known by
id only once that track has been read from the v4 catalog, and that read is
what this service does: every Beatport track the library owns
(``library_beatport_tracks``) that the catalog cache has no row for, or holds a
row older than :data:`RESOLVED_TRACK_MAX_AGE`, read :data:`RESOLVE_BATCH_SIZE`
at a time through DISCOVER-01's ``get_tracks`` and written to
``beatport_tracks`` and ``beatport_track_artists``. Migration 0023's
``library_beatport_credits`` then answers who each library track is by.

It is polite by construction, because a real Beatport account notices it:

- **Batched.** DISCOVER-01's recording showed ``catalog/tracks/?id=a,b,c``
  answers exactly what it is asked, so a batch is one request, and 10,000
  tracks are 100 requests. Should the filter ever stop proving itself,
  ``get_tracks`` falls back to one request per track on its own and this
  service is correct either way.
- **Only what is missing or stale.** A second resolve within the age reads
  nothing.
- **It stops.** A refusal that every later request would repeat — no token,
  a rejected token, a forbidden one, a rate limit still in force after the
  one ``Retry-After`` the client honours — stops it at once, and
  :data:`MAX_CONSECUTIVE_FAILURES` failed batches in a row stop it too, which
  is CLEAN-09's rule for a network that has gone away. What it stored before
  stopping is kept: each batch is its own transaction.
- **Only when asked.** It never starts on its own, and browsing never starts
  it (DEC-095). The Discover page and a name-matched page offer it.

A track Beatport no longer has is counted as not found and asked about again
next time. The schema has no place to remember "gone" (DISCOVER-02), and a
batch carries it at no extra request.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Protocol

from cuepoint.incrate.beatport_api_models import CatalogTrack
from cuepoint.services.beatport_api_client import (
    ERROR_FORBIDDEN,
    ERROR_NO_TOKEN,
    ERROR_RATE_LIMITED,
    ERROR_REJECTED,
    MAX_CONSECUTIVE_FAILURES,
    REPEATING_ERROR_CLASSES,
    classify_beatport_error,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IBeatportCatalogRepository,
    IBeatportResolveService,
)

_logger = logging.getLogger(__name__)

#: Tracks asked for per request: DISCOVER-01's ``TRACK_BATCH_SIZE``, the most
#: one page of ``catalog/tracks/`` answers.
RESOLVE_BATCH_SIZE = 100

#: How long a catalog row is trusted before a resolve reads it again. A track's
#: artists and label change rarely — a relabel, a corrected credit — and a
#: month keeps a monthly resolve of a large library to one request per hundred
#: tracks it holds.
RESOLVED_TRACK_MAX_AGE = timedelta(days=30)

#: The error classes that stop a resolve at the first failure. With
#: ``MAX_CONSECUTIVE_FAILURES``, the client module's policy, shared with
#: discovery (DISCOVER-05).
STOP_AT_ONCE = REPEATING_ERROR_CLASSES

#: The activity event one resolve records, whatever its outcome.
EVENT_BEATPORT_RESOLVED = "discover.beatport.resolved"

OUTCOME_SUCCEEDED = "succeeded"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_FAILED = "failed"

_STOPPED_BECAUSE = {
    ERROR_NO_TOKEN: "no Beatport token is configured",
    ERROR_REJECTED: "Beatport rejected the token",
    ERROR_FORBIDDEN: "the token is not allowed to read the catalog",
    ERROR_RATE_LIMITED: "Beatport asked CuePoint to slow down",
}


class CatalogReader(Protocol):
    """What a resolve needs from ``BeatportApi``: DISCOVER-01's batched read."""

    def require_token(self) -> None:
        """Raise a ``no_token`` ``BeatportAPIError`` when there is no token."""
        ...

    def get_tracks(self, track_ids: Iterable[int]) -> List[CatalogTrack]:
        """Catalog tracks by id, leaving out any Beatport does not have."""
        ...


def _count(n: int, one: str, many: str) -> str:
    return f"{n:,} {one if n == 1 else many}"


@dataclass(frozen=True)
class BeatportResolveResult:
    """What one resolve did.

    Attributes:
        owned: Distinct Beatport tracks the library owned when it started.
        to_read: Of those, how many had no catalog row or a stale one.
        resolved: Tracks read and stored.
        not_found: Tracks asked for that Beatport did not return.
        unreadable: Tracks Beatport returned that could not be stored.
        failed: Tracks in batches whose request failed.
        batches: Batches asked for, successful or not. Each is one request
            while Beatport's batched lookup holds, as the recording showed it
            does.
        cancelled: True when it stopped because it was asked to.
        error_class: The DISCOVER-01 error class that stopped it, or None.
        error: That error's message.
    """

    owned: int
    to_read: int
    resolved: int = 0
    not_found: int = 0
    unreadable: int = 0
    failed: int = 0
    batches: int = 0
    cancelled: bool = False
    error_class: Optional[str] = None
    error: Optional[str] = None

    @property
    def up_to_date(self) -> int:
        """Owned tracks whose catalog row was young enough to keep."""
        return self.owned - self.to_read

    @property
    def outcome(self) -> str:
        """``succeeded``, ``cancelled`` or ``failed``."""
        if self.error_class is not None:
            return OUTCOME_FAILED
        return OUTCOME_CANCELLED if self.cancelled else OUTCOME_SUCCEEDED

    def summary_line(self) -> str:
        """The activity feed's sentence."""
        if self.owned == 0:
            return "No accepted matches to resolve on Beatport"
        if self.to_read == 0:
            return (
                "Beatport identities are up to date: "
                f"{_count(self.owned, 'owned track', 'owned tracks')} already read"
            )
        line = (
            f"Resolved {self.resolved:,} of "
            f"{_count(self.to_read, 'Beatport track', 'Beatport tracks')}"
        )
        extras = []
        if self.not_found:
            extras.append(f"{self.not_found:,} not on Beatport")
        if self.unreadable:
            extras.append(f"{self.unreadable:,} unreadable")
        if self.failed:
            extras.append(f"{self.failed:,} not read")
        if extras:
            line += " (" + ", ".join(extras) + ")"
        if self.error_class is not None:
            reason = _STOPPED_BECAUSE.get(
                self.error_class, "Beatport could not be reached"
            )
            return f"{line}; stopped because {reason}"
        if self.cancelled:
            return f"{line}; cancelled"
        return line

    def to_dict(self) -> Dict[str, Any]:
        """The job result and the activity event's detail."""
        return {
            "outcome": self.outcome,
            "owned": self.owned,
            "to_read": self.to_read,
            "up_to_date": self.up_to_date,
            "resolved": self.resolved,
            "not_found": self.not_found,
            "unreadable": self.unreadable,
            "failed": self.failed,
            "batches": self.batches,
            "cancelled": self.cancelled,
            "error_class": self.error_class,
            "error": self.error,
        }


class BeatportResolveService(IBeatportResolveService):
    """Reads the Beatport tracks the library owns into the catalog cache."""

    def __init__(
        self,
        catalog_repository: IBeatportCatalogRepository,
        beatport: CatalogReader,
        activity_service: Optional[IActivityService] = None,
        *,
        batch_size: int = RESOLVE_BATCH_SIZE,
        max_age: timedelta = RESOLVED_TRACK_MAX_AGE,
        max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if batch_size < 1:
            raise ValueError(f"batch_size must be at least 1, got {batch_size}")
        if max_consecutive_failures < 1:
            raise ValueError(
                "max_consecutive_failures must be at least 1,"
                f" got {max_consecutive_failures}"
            )
        self._catalog = catalog_repository
        self._beatport = beatport
        self._activity = activity_service
        self._batch_size = batch_size
        self._max_age = max_age
        self._max_failures = max_consecutive_failures
        self._clock = clock

    def require_token(self) -> None:
        """Refuse, as ``no_token``, when no Beatport token is configured.

        Raises:
            BeatportAPIError: Classified ``no_token``.
        """
        self._beatport.require_token()

    def resolve(
        self,
        *,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> BeatportResolveResult:
        """Read every owned Beatport track the cache lacks or holds stale.

        ``should_cancel`` is asked before each batch and ``on_progress`` told
        ``(done, total)`` after each, where ``done`` counts the tracks asked
        about, found or not. The activity feed gets one event whatever the
        outcome. A database error is not a Beatport failure and is raised.
        """
        stale_before = (self._clock() - self._max_age).isoformat()
        to_read, owned = self._catalog.resolve_plan(stale_before)
        total = len(to_read)
        counts = {"resolved": 0, "not_found": 0, "unreadable": 0, "failed": 0}
        batches = 0
        done = 0
        in_a_row = 0
        cancelled = False
        error_class: Optional[str] = None
        error: Optional[str] = None
        if on_progress is not None:
            on_progress(0, total)
        for start in range(0, total, self._batch_size):
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            batch = to_read[start : start + self._batch_size]
            batches += 1
            try:
                tracks = self._beatport.get_tracks(batch)
            except Exception as exc:  # noqa: BLE001 — classified, counted, reported
                kind = classify_beatport_error(exc)
                counts["failed"] += len(batch)
                in_a_row += 1
                _logger.warning(
                    "[beatport] resolve batch of %d failed (%s): %s",
                    len(batch),
                    kind,
                    exc,
                )
                done += len(batch)
                if on_progress is not None:
                    on_progress(done, total)
                if kind in STOP_AT_ONCE or in_a_row >= self._max_failures:
                    error_class, error = kind, str(exc)
                    break
                continue
            in_a_row = 0
            asked = set(batch)
            answered = [track for track in tracks if track.id in asked]
            stored = self._catalog.upsert_tracks(answered, self._clock().isoformat())
            counts["resolved"] += stored
            counts["unreadable"] += len(answered) - stored
            counts["not_found"] += len(asked) - len({t.id for t in answered})
            done += len(batch)
            if on_progress is not None:
                on_progress(done, total)
        result = BeatportResolveResult(
            owned=owned,
            to_read=total,
            batches=batches,
            cancelled=cancelled,
            error_class=error_class,
            error=error,
            **counts,
        )
        self._record(result)
        return result

    def _record(self, result: BeatportResolveResult) -> None:
        if self._activity is None:
            return
        try:
            self._activity.record_event(
                EVENT_BEATPORT_RESOLVED, result.summary_line(), result.to_dict()
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.debug("[activity] could not record the Beatport resolve: %s", exc)
