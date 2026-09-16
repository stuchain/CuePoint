#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Library Health: what needs attention, as counts of rules (CLEAN-11, DEC-075).

Health is rules, not queries
----------------------------
Each count is a :class:`~cuepoint.models.filter_rule.RuleSet` — the same
structure the filter bar builds and a Smart Collection saves — answered by
``build_count``, the count the Library table itself shows. The report returns
the rules beside the number, so the renderer opens the Library with exactly the
rules that produced it. What Health says and what the click shows are one
statement, so they cannot disagree.

There is no score. DEC-075 declined one: a 0–100 number needs weights nobody can
justify, and replaces a list of things to do with a number to worry about.

What each count reads
---------------------
- Files: the last check for the path each track has now (CLEAN-07). A track
  never checked is not counted as missing; it is not known to be.
- Duplicates: the groups a user is shown — two or more members, not dismissed
  (CLEAN-08).
- Matching: the state (CLEAN-04). "Not matched" is a track with no state row.
- Key, BPM and genre: the effective value (DEC-068), so a key applied from
  Beatport is not missing.
- Artwork: ``none`` only — a file read and found to hold no picture, with no
  Beatport image for an accepted match. ``unknown``, a file not read yet, is not
  counted as missing, for the file count's reason.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, Iterable, Optional, Tuple

from cuepoint.models.filter_rule import (
    ARTWORK_NONE,
    OP_ANY_OF,
    OP_IS,
    OP_IS_EMPTY,
    FilterRule,
    RuleSet,
)
from cuepoint.models.file_status import FILE_MISSING, FILE_UNREADABLE
from cuepoint.models.match_attempt import STATE_NEEDS_REVIEW, STATE_NOT_MATCHED
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services.artwork_service import EVENT_ARTWORK_SCANNED
from cuepoint.services.duplicate_service import EVENT_DUPLICATES_SCANNED
from cuepoint.services.file_check_service import (
    EVENT_FILES_CHECKED,
    UnavailableRoot,
    path_root,
)
from cuepoint.services.interfaces import (
    IActivityRepository,
    IFileStatusRepository,
    IHealthService,
    ITrackRepository,
)

if TYPE_CHECKING:
    from cuepoint.persistence.activity_repository import ActivityEvent


@dataclass(frozen=True)
class HealthRule:
    """One thing Health counts.

    Attributes:
        id: A stable identifier a renderer keys on; never display text.
        label: What the panel calls it.
        rules: The rule set whose count it is.
    """

    id: str
    label: str
    rules: RuleSet


def _rules(*clauses: FilterRule) -> RuleSet:
    return RuleSet(rules=tuple(clauses)).validated()


#: Every count, in the order the panel shows them: files first, because a
#: missing file is the problem nothing else can fix.
HEALTH_RULES: Tuple[HealthRule, ...] = (
    HealthRule(
        "missing_files",
        "Missing or unreadable files",
        _rules(FilterRule("file_status", OP_ANY_OF, [FILE_MISSING, FILE_UNREADABLE])),
    ),
    HealthRule(
        "duplicates",
        "In a duplicate group",
        _rules(FilterRule("in_duplicate_group", OP_IS, True)),
    ),
    HealthRule(
        "not_matched",
        "Not matched",
        _rules(FilterRule("match_state", OP_IS, STATE_NOT_MATCHED)),
    ),
    HealthRule(
        "needs_review",
        "Needs review",
        _rules(FilterRule("match_state", OP_IS, STATE_NEEDS_REVIEW)),
    ),
    HealthRule(
        "disputed",
        "Disputed by a newer match",
        _rules(FilterRule("match_disputed", OP_IS, True)),
    ),
    HealthRule("missing_key", "No key", _rules(FilterRule("key", OP_IS_EMPTY))),
    HealthRule("missing_bpm", "No BPM", _rules(FilterRule("bpm", OP_IS_EMPTY))),
    HealthRule("missing_genre", "No genre", _rules(FilterRule("genre", OP_IS_EMPTY))),
    HealthRule(
        "no_artwork",
        "No artwork",
        _rules(FilterRule("artwork", OP_IS, ARTWORK_NONE)),
    ),
)


@dataclass(frozen=True)
class HealthDetection:
    """One of the scans whose findings Health counts, and how to tell when it ran.

    Attributes:
        id: A stable identifier a renderer keys on.
        label: What the panel calls it.
        job_type: The job that runs it, which the panel starts to run it again.
        event_type: The activity event every run records, finished or stopped.
    """

    id: str
    label: str
    job_type: str
    event_type: str


#: The detections behind the counts (CLEAN-12). When each last ran is read from
#: the activity feed rather than the job table: every run records its event
#: whatever started it — an import, a refresh, a match or a person — and the
#: feed is what the Activity panel shows, so the two cannot disagree.
HEALTH_DETECTIONS: Tuple[HealthDetection, ...] = (
    HealthDetection("files", "Files checked", "file_check", EVENT_FILES_CHECKED),
    HealthDetection(
        "duplicates",
        "Duplicates looked for",
        "duplicate_scan",
        EVENT_DUPLICATES_SCANNED,
    ),
    HealthDetection("artwork", "Artwork read", "artwork_scan", EVENT_ARTWORK_SCANNED),
)


@dataclass(frozen=True)
class DetectionRun:
    """A detection and its latest recorded run, if it has ever run."""

    detection: HealthDetection
    last: Optional["ActivityEvent"] = None

    def to_dict(self) -> Dict[str, Any]:
        """The detection as the panel reads it: never run is ``null``, not a date."""
        return {
            "id": self.detection.id,
            "label": self.detection.label,
            "job_type": self.detection.job_type,
            "last_run_at": self.last.created_at if self.last is not None else None,
            "last_summary": self.last.summary if self.last is not None else None,
        }


def unavailable_roots(paths: Iterable[str]) -> Tuple[UnavailableRoot, ...]:
    """Group paths found on a missing root into one finding per root.

    Most tracks first, then by root, so the same library answers in the same
    order. A path with no root — relative, or empty — is nobody's drive and is
    left out.
    """
    counts: Dict[str, int] = {}
    for path in paths:
        root = path_root(path)
        if root is not None:
            counts[root] = counts.get(root, 0) + 1
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return tuple(UnavailableRoot(root, tracks) for root, tracks in ordered)


@dataclass(frozen=True)
class HealthCount:
    """One rule and how many tracks it finds."""

    rule: HealthRule
    count: int

    def to_dict(self) -> Dict[str, Any]:
        """The count as the panel reads it, with the rules a click opens."""
        return {
            "id": self.rule.id,
            "label": self.rule.label,
            "count": self.count,
            "rules": self.rule.rules.to_dict(),
        }


@dataclass(frozen=True)
class HealthReport:
    """Every Health count, and the library size they are counts of."""

    track_count: int
    counts: Tuple[HealthCount, ...]
    detections: Tuple[DetectionRun, ...] = ()
    unavailable_roots: Tuple[UnavailableRoot, ...] = ()

    def to_dict(self) -> Dict[str, Any]:
        """The report as an answer. A public shape; extend rather than rename.

        CLEAN-12 extended it with ``detections``, when each scan last ran, and
        ``unavailable_roots``, a disconnected drive as one line rather than as
        thousands of missing files (DEC-073).
        """
        return {
            "track_count": self.track_count,
            "counts": [count.to_dict() for count in self.counts],
            "detections": [run.to_dict() for run in self.detections],
            "unavailable_roots": [root.to_dict() for root in self.unavailable_roots],
        }


class HealthService(IHealthService):
    """Counts :data:`HEALTH_RULES` through the Library's own count."""

    def __init__(
        self,
        track_repository: ITrackRepository,
        rules: Tuple[HealthRule, ...] = HEALTH_RULES,
        *,
        activity_repository: Optional[IActivityRepository] = None,
        file_status_repository: Optional[IFileStatusRepository] = None,
        detections: Tuple[HealthDetection, ...] = HEALTH_DETECTIONS,
    ) -> None:
        """Count through ``track_repository``, whose count the Library table shows.

        Without an activity repository every detection reads as never run, and
        without a file-status repository no root is reported unavailable: a
        report that cannot know says nothing rather than something untrue.
        """
        self._tracks = track_repository
        self._rules = rules
        self._activity = activity_repository
        self._files = file_status_repository
        self._detections = detections

    def _last_run(self, detection: HealthDetection) -> DetectionRun:
        if self._activity is None:
            return DetectionRun(detection)
        latest = self._activity.recent_events(limit=1, event_type=detection.event_type)
        return DetectionRun(detection, latest[0] if latest else None)

    def report(self) -> HealthReport:
        """Count every rule over the whole library, and say when each scan last ran."""
        return HealthReport(
            track_count=self._tracks.count(),
            counts=tuple(
                HealthCount(
                    rule, self._tracks.browse_count(BrowseQuery(rules=rule.rules))
                )
                for rule in self._rules
            ),
            detections=tuple(
                self._last_run(detection) for detection in self._detections
            ),
            unavailable_roots=(
                unavailable_roots(self._files.unavailable_paths())
                if self._files is not None
                else ()
            ),
        )


__all__ = (
    "HEALTH_DETECTIONS",
    "HEALTH_RULES",
    "DetectionRun",
    "HealthCount",
    "HealthDetection",
    "HealthReport",
    "HealthRule",
    "HealthService",
    "unavailable_roots",
)
