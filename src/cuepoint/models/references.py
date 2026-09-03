#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Who else is holding on to a track (DEC-011).

DEC-003 deletes a track that has left Rekordbox, and takes its tags, ratings and
membership with it. DEC-011 narrows that: a removal that nothing else refers to
happens without a prompt, and one that a Collection or Set is using has to be
warned about first — "N tracks removed from Rekordbox are used in M Collections
and Sets".

Collections arrive in Phase 6 and Sets in Phase 10, so the honest answer today
is **zero**, and it is a real answer rather than a placeholder: there is nothing
in this build that can reference a track, so nothing does. DEC-032 chose to
build the question now anyway, because a refresh that grows a confirmation step
later is a refresh whose service, API, tests and UI all move again.

What Phase 6 has to satisfy
---------------------------
:meth:`~cuepoint.services.interfaces.ILibraryService.references_for` takes the
library ids of the tracks a refresh would delete and returns one of these. The
counts are of *referencing things*, not of references: a Collection holding
three of the doomed tracks counts once, because the sentence it feeds says how
many Collections a user would find changed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Tuple


@dataclass(frozen=True)
class ReferenceSummary:
    """How much CuePoint-side work depends on a set of tracks.

    Attributes:
        collection_count: Collections holding at least one of the tracks
            (DEC-006, Phase 6).
        set_count: Sets holding at least one of them (Phase 10).
        referenced_track_ids: The library ids that are referenced by something,
            so a preview can point at them rather than only counting. A subset
            of what was asked about, never all of it by default.
    """

    collection_count: int = 0
    set_count: int = 0
    referenced_track_ids: Tuple[int, ...] = field(default_factory=tuple)

    @property
    def referenced_track_count(self) -> int:
        """How many of the tracks asked about are referenced by something."""
        return len(self.referenced_track_ids)

    @property
    def has_references(self) -> bool:
        """True when deleting these tracks would change something else.

        The condition DEC-011 turns into a prompt. False means the removal is
        the uneventful case and goes ahead without one.
        """
        return bool(self.collection_count or self.set_count)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "collection_count": self.collection_count,
            "set_count": self.set_count,
            "referenced_track_count": self.referenced_track_count,
            "referenced_track_ids": list(self.referenced_track_ids),
            "has_references": self.has_references,
        }


#: The answer for a library with no Collections and no Sets, which is every
#: library this build can produce. Named rather than written out at each call
#: site so that the day it stops being the answer, there is one place that
#: stopped being right.
NO_REFERENCES = ReferenceSummary()
