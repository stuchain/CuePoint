#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Keeping the library's name index current (DISCOVER-03, DEC-094).

The credits and label keys are written where tracks are written, so an import
or a refresh never leaves them behind. Two things can still leave the index
out of date, and both are this service's to repair:

- **A library that predates it.** Migrations 0021 and 0022 create the table and
  the columns empty, because ``name_key`` is Python and a migration is SQL that
  can never change once shipped.
- **A new version of the rule.** :data:`~cuepoint.core.entity_names.
  ENTITY_NAMES_VERSION` is bumped whenever ``name_key`` or ``split_credit``
  changes an answer, and the index a different version built answers a rule
  wrongly — so it is rebuilt, rather than migrated.

Both are one :meth:`CreditIndexService.rebuild`: every track, a chunk at a
time, each chunk its own transaction, the versions recorded after the last
one. A cancel keeps every chunk that finished and records nothing, so the next
engine start finishes the job.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.services.interfaces import ICreditIndexService, ITrackCreditRepository

#: Tracks read and rewritten per transaction. Large enough that commits are a
#: rounding error, small enough that a cancel is honoured within a fraction of
#: a second and an import waiting for the write lock waits no longer than that.
REBUILD_CHUNK_SIZE = 2000


@dataclass(frozen=True)
class CreditIndexResult:
    """What one rebuild did.

    Attributes:
        tracks: Tracks whose credits and label keys were rewritten.
        total: Tracks the library held when the rebuild started.
        version: The rule version it built with.
        cancelled: True when it stopped before the last chunk, in which case
            the version was not recorded.
    """

    tracks: int
    total: int
    version: int
    cancelled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """The job result a route returns."""
        return {
            "tracks": self.tracks,
            "total": self.total,
            "version": self.version,
            "cancelled": self.cancelled,
        }


class CreditIndexService(ICreditIndexService):
    """Rebuilds the name index when the running rule did not build it."""

    def __init__(
        self,
        credit_repository: ITrackCreditRepository,
        *,
        version: int = ENTITY_NAMES_VERSION,
        chunk_size: int = REBUILD_CHUNK_SIZE,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if chunk_size < 1:
            raise ValueError(f"chunk_size must be at least 1, got {chunk_size}")
        self._credits = credit_repository
        self._version = version
        self._chunk_size = chunk_size
        self._clock = clock

    @property
    def version(self) -> int:
        """The rule version this service builds with."""
        return self._version

    def is_current(self) -> bool:
        """True when every name index was built by this rule version."""
        return self._credits.is_current(self._version)

    def rebuild(
        self,
        *,
        on_progress: Optional[Callable[[int, int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> CreditIndexResult:
        """Rewrite every track's credits and label keys, then record the version.

        ``should_cancel`` is asked before each chunk, and ``on_progress`` told
        ``(done, total)`` after each one. The total is the library's size when
        the rebuild began; an import during it can make ``done`` pass it, and
        it is reported as it is rather than clamped.
        """
        total = self._credits.track_count()
        done = 0
        after_id = 0
        if on_progress is not None:
            on_progress(0, total)
        while True:
            if should_cancel is not None and should_cancel():
                return CreditIndexResult(
                    tracks=done, total=total, version=self._version, cancelled=True
                )
            after_id, read = self._credits.rebuild_chunk(after_id, self._chunk_size)
            if read == 0:
                break
            done += read
            if on_progress is not None:
                on_progress(done, total)
        self._credits.mark_built(self._version, self._clock().isoformat())
        return CreditIndexResult(tracks=done, total=total, version=self._version)
