#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Applying an accepted match's values into CuePoint's layer (CLEAN-05, DEC-068).

Accepting a match says "this is the right Beatport track" and writes nothing
(DEC-004). Applying is the separate act that copies chosen fields — key, BPM,
genre, label, year — from the candidate a track's state points at into the
override layer, where a refresh cannot reach them and a revert can take them
back (CLEAN-06).

What apply refuses
------------------
- **A track that is not accepted.** Needs-review, no-match and rejected tracks
  have no candidate anyone agreed to, and applying one would copy a guess.
- **A field the candidate has no usable value for**, when that field was asked
  for by name: writing ``None`` would erase an override the user already has,
  and writing nothing silently would tell them it was applied. The whole apply
  is refused, and nothing is written.

A batch is different on the second point (:meth:`MatchApplyService.apply_decided`):
over a thousand tracks, one whose Beatport page lacked a genre still gets its key
and BPM, and its genre is left as it was. A track that is not accepted is left
alone and counted unchanged, as a batch decision leaves a user's decision alone.

Every value written records source ``beatport``, and every field of one apply
shares one batch id, so "revert what that apply did" is one question (CLEAN-06).
"""

from __future__ import annotations

import uuid
from typing import Iterable, List, Optional, Sequence

from cuepoint.models.match_attempt import STATE_ACCEPTED, MatchCandidate
from cuepoint.models.track_metadata import TrackMetadata
from cuepoint.persistence.activity_repository import SOURCE_BEATPORT
from cuepoint.services.interfaces import (
    IDatabaseService,
    IMatchApplyService,
    IMatchRepository,
    IMetadataService,
    ITrackRepository,
)
from cuepoint.services.override_values import (
    NOTATION_CLASSIC,
    candidate_value,
    require_field,
)


def chosen_fields(fields: Iterable[str]) -> List[str]:
    """Return the fields to apply, each once, in the order given.

    Raises:
        ValueError: If none are named, a bare string was passed where a list
            belongs, or a field cannot be overridden.
    """
    if isinstance(fields, str):
        raise ValueError("Name the fields to apply as a list, not as one string")
    wanted: List[str] = []
    for field in fields:
        name = require_field(field)
        if name not in wanted:
            wanted.append(name)
    if not wanted:
        raise ValueError("Choose at least one field to apply")
    return wanted


class MatchApplyService(IMatchApplyService):
    """Copies chosen fields from accepted candidates into the override layer."""

    def __init__(
        self,
        match_repository: IMatchRepository,
        metadata_service: IMetadataService,
        track_repository: ITrackRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Initialize the service.

        Args:
            match_repository: The track's state and the candidate it points at.
            metadata_service: The override layer, and the history it records.
            track_repository: Refuses an apply to a track that is not there.
            database_service: The transaction every field of one apply shares.
                No SQL is run here.
        """
        self._matches = match_repository
        self._metadata = metadata_service
        self._tracks = track_repository
        self._db = database_service

    def apply_match(
        self, track_id: int, fields: Iterable[str], batch_id: Optional[str] = None
    ) -> TrackMetadata:
        """Apply the chosen fields from a track's accepted candidate.

        Returns:
            The track's CuePoint record afterwards.

        Raises:
            ValueError: If the track does not exist or is not accepted, no
                field or an unknown one is named, or the candidate has no usable
                value for a named field. Nothing is written.
        """
        wanted = chosen_fields(fields)
        track_id = self._require_track(track_id)
        candidate = self._accepted_candidate(track_id)
        if candidate is None:
            raise ValueError(
                f"Track {track_id} has no accepted match, so there is nothing to apply"
            )
        notation = (
            self._metadata.key_notation() if "key" in wanted else NOTATION_CLASSIC
        )
        values = {name: candidate_value(candidate, name, notation) for name in wanted}
        missing = [name for name, value in values.items() if value is None]
        if missing:
            raise ValueError(
                f"The accepted Beatport match for track {track_id} has no usable"
                f" {', '.join(missing)}, so nothing was applied"
            )

        group = batch_id or str(uuid.uuid4())
        record: Optional[TrackMetadata] = None
        with self._db.transaction(join_existing=True):
            for name, value in values.items():
                record = self._metadata.set_override(
                    track_id,
                    name,
                    value,
                    source=SOURCE_BEATPORT,
                    batch_id=group,
                    notation=notation,
                )
        assert record is not None  # at least one field was named
        return record

    def apply_decided(
        self, track_id: int, fields: Sequence[str], batch_id: str, notation: str
    ) -> bool:
        """Apply what a track's accepted candidate has, for a batch.

        Returns:
            True when any override changed. A track that is not accepted, or
            whose candidate has none of the fields, is left as it is.

        Raises:
            ValueError: If the track does not exist — which a batch counts as a
                failure, as it does for every other operation.
        """
        track_id = self._require_track(track_id)
        candidate = self._accepted_candidate(track_id)
        if candidate is None:
            return False
        before = self._metadata.get(track_id)
        changed = False
        with self._db.transaction(join_existing=True):
            for name in fields:
                value = candidate_value(candidate, name, notation)
                if value is None:
                    continue
                if (getattr(before, name) if before is not None else None) == value:
                    continue
                self._metadata.set_override(
                    track_id,
                    name,
                    value,
                    source=SOURCE_BEATPORT,
                    batch_id=batch_id,
                    notation=notation,
                )
                changed = True
        return changed

    def _accepted_candidate(self, track_id: int) -> Optional[MatchCandidate]:
        match = self._matches.get_match(track_id)
        if match is None or match.state != STATE_ACCEPTED or match.candidate_id is None:
            return None
        return self._matches.get_candidate(match.candidate_id)

    def _require_track(self, track_id: int) -> int:
        wanted = int(track_id)
        if self._tracks.get(wanted) is None:
            raise ValueError(f"No such track: {track_id}")
        return wanted


__all__ = ("MatchApplyService", "chosen_fields")
