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
from typing import Any, Dict, Tuple

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
from cuepoint.services.interfaces import IHealthService, ITrackRepository


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

    def to_dict(self) -> Dict[str, Any]:
        """The report as an answer. A public shape; extend rather than rename."""
        return {
            "track_count": self.track_count,
            "counts": [count.to_dict() for count in self.counts],
        }


class HealthService(IHealthService):
    """Counts :data:`HEALTH_RULES` through the Library's own count."""

    def __init__(
        self,
        track_repository: ITrackRepository,
        rules: Tuple[HealthRule, ...] = HEALTH_RULES,
    ) -> None:
        """Count through ``track_repository``, whose count the Library table shows."""
        self._tracks = track_repository
        self._rules = rules

    def report(self) -> HealthReport:
        """Count every rule over the whole library."""
        return HealthReport(
            track_count=self._tracks.count(),
            counts=tuple(
                HealthCount(
                    rule, self._tracks.browse_count(BrowseQuery(rules=rule.rules))
                )
                for rule in self._rules
            ),
        )


__all__ = (
    "HEALTH_RULES",
    "HealthCount",
    "HealthReport",
    "HealthRule",
    "HealthService",
)
