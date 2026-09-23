#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One discovery run, the tracks it found and why (DISCOVER-02, DEC-091).

The three types over ``m0021_discover``'s run tables. A run costs minutes and
hundreds of Beatport requests, so it is kept: reopened later, its tracks are
read back in the order it found them and ownership is computed then (DEC-092),
so a track matched after the run reads as owned.

A run is written when it starts
-------------------------------
Its :attr:`DiscoveryRun.outcome` is ``None`` while it runs, and it gains an
outcome and a :attr:`~DiscoveryRun.finished_at` together when it ends — one
without the other is a row that says both "running" and "ended", so each is
refused without the other. Every count starts at zero and only grows, which is
why none of them is ever unknown.

How a run can end
-----------------
``succeeded``, ``cancelled`` or ``failed``. A cancel keeps what was found
(DEC-091), so a cancelled run's tracks are real results; only a failure has to
say why. :attr:`~DiscoveryRun.error_class` is DISCOVER-01's classification of a
Beatport failure (``no_token``, ``rejected``, ``forbidden``, ``rate_limited``,
``unavailable``). A model imports from ``cuepoint.models`` only, and that
vocabulary lives in ``services/beatport_api_client.py``, so it is validated
there, by the writer, as ``m0020``'s ``key_format`` is; here it is only text,
and only on a failure.

Every reason, not the first one
-------------------------------
inCrate kept one source per track. A :class:`DiscoveryRunSource` is one reason
among possibly several: a track in three charts has three rows, each naming the
chart and the library artist or label (:attr:`~DiscoveryRunSource.matched_on`)
that put that chart in scope.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import (
    non_negative,
    one_of,
    optional_https_url,
    optional_id,
    optional_text,
    required_id,
    required_text,
)

#: The run finished what it set out to do.
RUN_SUCCEEDED = "succeeded"

#: The user stopped it. What it found so far is kept.
RUN_CANCELLED = "cancelled"

#: It stopped on an error, and :attr:`DiscoveryRun.error` says which.
RUN_FAILED = "failed"

#: How a run can end. A running run has no outcome yet.
RUN_OUTCOMES = (RUN_SUCCEEDED, RUN_CANCELLED, RUN_FAILED)

#: Found in a chart whose curator is a library artist.
SOURCE_CHART = "chart"

#: Found in a recent release on a library label.
SOURCE_LABEL_RELEASE = "label_release"

#: Why a run found a track.
SOURCE_TYPES = (SOURCE_CHART, SOURCE_LABEL_RELEASE)

#: The counts a run keeps, in the order the table declares them.
RUN_COUNTS = (
    "labels_in_scope",
    "labels_resolved",
    "artists_in_scope",
    "charts_read",
    "releases_read",
    "tracks_found",
)


@dataclass(frozen=True)
class DiscoveryRun:
    """One discovery run, running or ended.

    Attributes:
        started_at: When it began, ISO-8601 UTC.
        params_json: What it was asked, as a JSON object: genres, dates, days,
            and the artist and label scope as resolved at start (DEC-063).
        id: Database primary key; ``None`` until persisted. Never reused.
        job_id: The job that ran it.
        finished_at: When it ended; ``None`` while it runs.
        outcome: One of :data:`RUN_OUTCOMES`; ``None`` while it runs.
        labels_in_scope: Library labels in the resolved scope.
        labels_resolved: How many of those a Beatport id was found for.
        artists_in_scope: Library artists in the resolved scope.
        charts_read: Charts whose tracks were read.
        releases_read: Label releases whose tracks were read.
        tracks_found: Distinct tracks found.
        error: Why it failed. Required for a failure; refused otherwise.
        error_class: DISCOVER-01's class of the Beatport failure, when a
            Beatport answer was the reason. Only on a failure.
    """

    started_at: str
    params_json: str
    id: Optional[int] = None
    job_id: Optional[str] = None
    finished_at: Optional[str] = None
    outcome: Optional[str] = None
    labels_in_scope: int = 0
    labels_resolved: int = 0
    artists_in_scope: int = 0
    charts_read: int = 0
    releases_read: int = 0
    tracks_found: int = 0
    error: Optional[str] = None
    error_class: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the record."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        required_text(self.started_at, "started_at")
        if self.job_id is not None:
            required_text(self.job_id, "job_id")
        _json_object(self.params_json, "params_json")
        for name in RUN_COUNTS:
            object.__setattr__(self, name, non_negative(getattr(self, name), name))
        if self.labels_resolved > self.labels_in_scope:
            raise ValueError(
                f"labels_resolved ({self.labels_resolved}) cannot exceed "
                f"labels_in_scope ({self.labels_in_scope})"
            )
        if self.outcome is not None:
            one_of(self.outcome, RUN_OUTCOMES, "outcome")
        optional_text(self.finished_at, "finished_at")
        if (self.outcome is None) != (self.finished_at is None):
            raise ValueError("A run gains its outcome and its end time together")
        optional_text(self.error, "error")
        optional_text(self.error_class, "error_class")
        if self.outcome == RUN_FAILED and self.error is None:
            raise ValueError("A failed run must say why")
        if self.outcome != RUN_FAILED and self.error is not None:
            raise ValueError("Only a failed run records an error")
        if self.error_class is not None and self.outcome != RUN_FAILED:
            raise ValueError("Only a failed run records an error class")

    @property
    def is_running(self) -> bool:
        """True until the run records how it ended."""
        return self.outcome is None

    @property
    def params(self) -> Dict[str, Any]:
        """The run's parameters, parsed."""
        parsed: Dict[str, Any] = json.loads(self.params_json)
        return parsed

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "job_id": self.job_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "outcome": self.outcome,
            "params_json": self.params_json,
            **{name: getattr(self, name) for name in RUN_COUNTS},
            "error": self.error,
            "error_class": self.error_class,
        }

    @classmethod
    def from_row(cls, row: Any) -> "DiscoveryRun":
        """Build a run from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            job_id=data.get("job_id"),
            started_at=data["started_at"],
            finished_at=data.get("finished_at"),
            outcome=data.get("outcome"),
            params_json=data["params_json"],
            **{name: data.get(name, 0) for name in RUN_COUNTS},
            error=data.get("error"),
            error_class=data.get("error_class"),
        )


@dataclass(frozen=True)
class DiscoveryRunTrack:
    """A track a run found, at its place in the run's first-seen order.

    Attributes:
        run_id: The run. Its row cascades.
        beatport_track_id: The cached catalog track. Referenced, so the cache
            cannot drop a track a run holds.
        position: Its place in first-seen order, from zero, unique in the run.
    """

    run_id: int
    beatport_track_id: int
    position: int

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "run_id", required_id(self.run_id, "run_id"))
        object.__setattr__(
            self,
            "beatport_track_id",
            required_id(self.beatport_track_id, "beatport_track_id"),
        )
        object.__setattr__(self, "position", non_negative(self.position, "position"))

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "run_id": self.run_id,
            "beatport_track_id": self.beatport_track_id,
            "position": self.position,
        }

    @classmethod
    def from_row(cls, row: Any) -> "DiscoveryRunTrack":
        """Build a row from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            run_id=data["run_id"],
            beatport_track_id=data["beatport_track_id"],
            position=data["position"],
        )


@dataclass(frozen=True)
class DiscoveryRunSource:
    """One reason a run found a track.

    Attributes:
        run_id: The run.
        beatport_track_id: The track, which the run must have found; the row
            references the pair and cascades with it.
        source_type: One of :data:`SOURCE_TYPES`.
        source_id: The chart's or release's Beatport id.
        matched_on: The library artist or label that put the source in scope,
            as the library names it (DEC-074: name the signal).
        source_name: The chart's or release's name.
        source_url: Its page on the Beatport website.
    """

    run_id: int
    beatport_track_id: int
    source_type: str
    source_id: int
    matched_on: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "run_id", required_id(self.run_id, "run_id"))
        object.__setattr__(
            self,
            "beatport_track_id",
            required_id(self.beatport_track_id, "beatport_track_id"),
        )
        one_of(self.source_type, SOURCE_TYPES, "source_type")
        object.__setattr__(self, "source_id", required_id(self.source_id, "source_id"))
        required_text(self.matched_on, "matched_on")
        optional_text(self.source_name, "source_name")
        optional_https_url(self.source_url, "source_url")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "run_id": self.run_id,
            "beatport_track_id": self.beatport_track_id,
            "source_type": self.source_type,
            "source_id": self.source_id,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "matched_on": self.matched_on,
        }

    @classmethod
    def from_row(cls, row: Any) -> "DiscoveryRunSource":
        """Build a source from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            run_id=data["run_id"],
            beatport_track_id=data["beatport_track_id"],
            source_type=data["source_type"],
            source_id=data["source_id"],
            matched_on=data["matched_on"],
            source_name=data.get("source_name"),
            source_url=data.get("source_url"),
        )


def _json_object(value: Any, name: str) -> str:
    """Return stored JSON text after checking it is a JSON object.

    Raises:
        ValueError: If it is not text, not JSON, or not an object.
    """
    if not isinstance(value, str):
        raise ValueError(f"{name} must be JSON text, got {type(value).__name__}")
    try:
        parsed = json.loads(value)
    except ValueError:
        raise ValueError(f"{name} is not valid JSON") from None
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object")
    return value
