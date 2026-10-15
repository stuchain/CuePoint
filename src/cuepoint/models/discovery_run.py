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
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.beatport_cache import CachedBeatportTrack
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

#: Found in a recent release of a chosen artist.
SOURCE_ARTIST_RELEASE = "artist_release"

#: Why a run found a track.
SOURCE_TYPES = (SOURCE_CHART, SOURCE_LABEL_RELEASE, SOURCE_ARTIST_RELEASE)

#: The cards a run's results are grouped into: a chart, a chosen artist, a
#: chosen label.
GROUP_CHART = "chart"
GROUP_ARTIST = "artist"
GROUP_LABEL = "label"
GROUP_KINDS = (GROUP_CHART, GROUP_ARTIST, GROUP_LABEL)

#: Which charts a run read. ``artists``: the charts the chosen artists made.
#: ``library``: the charts any artist in the library made (every artist was
#: asked for). ``genre``: no artist was chosen, so the general charts of the
#: chosen genres. A run stored before groups exist has none of these.
CHARTS_ARTISTS = "artists"
CHARTS_LIBRARY = "library"
CHARTS_GENRE = "genre"
CHARTS_MODES = (CHARTS_ARTISTS, CHARTS_LIBRARY, CHARTS_GENRE)

#: Owned tracks left out of a run's list: DEC-092's default.
OWNED_HIDE = "hide"

#: Only the owned tracks.
OWNED_ONLY = "only"

#: Every track, owned or not.
OWNED_ALL = "all"

#: How a run's list treats owned tracks (DEC-092).
OWNED_FILTERS = (OWNED_HIDE, OWNED_ONLY, OWNED_ALL)

#: A run's list in the order it found its tracks.
SORT_FOUND = "position"
SORT_RELEASE_DATE = "release_date"
SORT_ARTIST = "artist"
SORT_TITLE = "title"

#: What a run's list can be sorted by.
RUN_TRACK_SORTS = (SORT_FOUND, SORT_RELEASE_DATE, SORT_ARTIST, SORT_TITLE)

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
            as the library names it (DEC-074: name the signal). For a general
            genre chart no library name is in scope, so it is who made the chart,
            or the chart's own name when Beatport names nobody.
        source_name: The chart's or release's name.
        source_url: Its page on the Beatport website.
        group_key: The card the reason belongs to (a chart's id, or an artist's
            or label's ``name_key``); empty for a run stored before groups.
    """

    run_id: int
    beatport_track_id: int
    source_type: str
    source_id: int
    matched_on: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    group_key: str = ""

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
        if not isinstance(self.group_key, str):
            raise ValueError("group_key must be text")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "run_id": self.run_id,
            "beatport_track_id": self.beatport_track_id,
            "source_type": self.source_type,
            "source_id": self.source_id,
            "group_key": self.group_key,
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
            group_key=data.get("group_key") or "",
        )


@dataclass(frozen=True)
class DiscoveryRunGroup:
    """One card a run's results are grouped into (``discovery_run_groups``).

    Attributes:
        run_id: The run. Its row cascades.
        kind: One of :data:`GROUP_KINDS`.
        key: A chart's Beatport id as text, or an artist's or label's
            ``name_key``.
        name: What the card is called: the chart's name, the artist's or the
            label's name as the library names it.
        position: Its place in the order the cards were found.
        beatport_id: Its Beatport id, when one is known.
        owner_key: For a chart, the chosen artist it counts for; ``None`` for a
            general genre chart.
        curator: For a chart, who made it, as Beatport names them.
        art_url: The image Beatport named; never sent to the renderer.
    """

    run_id: int
    kind: str
    key: str
    name: str
    position: int = 0
    beatport_id: Optional[int] = None
    owner_key: Optional[str] = None
    curator: Optional[str] = None
    art_url: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "run_id", required_id(self.run_id, "run_id"))
        one_of(self.kind, GROUP_KINDS, "kind")
        required_text(self.key, "key")
        required_text(self.name, "name")
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        object.__setattr__(
            self, "beatport_id", optional_id(self.beatport_id, "beatport_id")
        )
        optional_text(self.owner_key, "owner_key")
        optional_text(self.curator, "curator")
        optional_https_url(self.art_url, "art_url")

    @classmethod
    def from_row(cls, row: Any) -> "DiscoveryRunGroup":
        """Build a group from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            run_id=data["run_id"],
            kind=data["kind"],
            key=data["key"],
            name=data["name"],
            position=data.get("position", 0),
            beatport_id=data.get("beatport_id"),
            owner_key=data.get("owner_key"),
            curator=data.get("curator"),
            art_url=data.get("art_url"),
        )


@dataclass(frozen=True)
class GroupCard:
    """A card as a run's results show it, with its counts as they are now.

    Attributes:
        group: The stored group.
        tracks: Distinct tracks the card holds.
        owned: How many of those the library owns now (DEC-092).
        charts: For an artist, how many charts of theirs the run read.
        new: For an artist or a label, the tracks found as new releases.
    """

    group: DiscoveryRunGroup
    tracks: int = 0
    owned: int = 0
    charts: int = 0
    new: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API; the image URL stays behind (``has_art``)."""
        return {
            "kind": self.group.kind,
            "key": self.group.key,
            "name": self.group.name,
            "curator": self.group.curator,
            "tracks": self.tracks,
            "owned": self.owned,
            "charts": self.charts,
            "new": self.new,
            "has_art": self.group.art_url is not None,
        }


@dataclass(frozen=True)
class GroupSelection:
    """The cards a person ticked: their distinct tracks, and how many are owned."""

    tracks: int
    owned: int

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {"tracks": self.tracks, "owned": self.owned}


@dataclass(frozen=True)
class RunTrackRow:
    """One track in a window of a run's list, as it reads now.

    Attributes:
        position: Its place in the run's first-seen order.
        track: The cached catalog track.
        artists: Its artists' names, in Beatport's order.
        remixers: Its remixers' names, in Beatport's order.
        owned: Whether the library owns it now (DEC-092), computed when read.
        sources: Every reason the run found it, in the order it found them.
        on_wantlist: Whether it is on the wantlist now (DISCOVER-06), also
            computed when read.
    """

    position: int
    track: CachedBeatportTrack
    artists: Tuple[str, ...] = ()
    remixers: Tuple[str, ...] = ()
    owned: bool = False
    sources: Tuple[DiscoveryRunSource, ...] = ()
    on_wantlist: bool = False

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        for source in self.sources:
            if source.beatport_track_id != self.track.beatport_track_id:
                raise ValueError("A row's sources are its own track's")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API (DISCOVER-09).

        A Beatport track row as every Beatport table sends one — the catalog
        track's own fields, its credits, ``owned`` and ``on_wantlist``, which
        is ``EntityTrackRow``'s shape — plus the run's place for it and every
        reason it was found. A reason leaves out the run and the track, which
        the row already says.
        """
        return {
            **self.track.to_dict(),
            "artists": list(self.artists),
            "remixers": list(self.remixers),
            "owned": self.owned,
            "on_wantlist": self.on_wantlist,
            "position": self.position,
            "sources": [
                {
                    "source_type": source.source_type,
                    "source_id": source.source_id,
                    "source_name": source.source_name,
                    "source_url": source.source_url,
                    "matched_on": source.matched_on,
                }
                for source in self.sources
            ],
        }


@dataclass(frozen=True)
class RunTracksPage:
    """A window of a run's list, and the counts every response carries.

    Attributes:
        rows: The window.
        total: Tracks the list holds under its owned filter; the window is a
            slice of these.
        tracks: Every track the run found.
        owned: How many of those the library owns now.
        hidden: How many owned tracks the filter leaves out — "N owned tracks
            hidden" (DEC-092). ``owned`` under ``hide``, otherwise 0.
    """

    rows: Tuple[RunTrackRow, ...]
    total: int
    tracks: int
    owned: int
    hidden: int

    def __post_init__(self) -> None:
        """Validate the counts."""
        for name in ("total", "tracks", "owned", "hidden"):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))
        if self.owned > self.tracks or self.total > self.tracks:
            raise ValueError("A run's counts cannot exceed its tracks")
        if len(self.rows) > self.total:
            raise ValueError("A window cannot hold more rows than its list")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API (DISCOVER-09)."""
        return {
            "rows": [row.to_dict() for row in self.rows],
            "total": self.total,
            "tracks": self.tracks,
            "owned": self.owned,
            "hidden": self.hidden,
        }


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
