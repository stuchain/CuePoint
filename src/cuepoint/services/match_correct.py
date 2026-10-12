#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Correct: accept a match and take the ticked values in one act (C14, DEC-068).

The Match area's one button. DEC-004 kept accepting a match and applying its
values apart, and the Match area joins them for the person who ticked the fields
they want: **Correct** accepts the candidate on screen and copies the ticked
fields, in one transaction under one batch id, so "Undo" is the existing
revert-batch and nothing is ever half done. Auto-accept still applies nothing,
and ``/clean/decide`` and ``/clean/apply`` keep their shapes.

What it writes, and what it leaves alone
----------------------------------------
For each ticked field, :func:`~cuepoint.services.override_values.candidate_value`
says what Beatport has:

- **Nothing usable** (empty, out of range): the field is *skipped*. Writing
  ``None`` would erase an override the person already has.
- **The value the track already shows**: *unchanged*, and nothing is written, so
  History does not fill with rows that say nothing.
- **Anything else** is written to the override layer with source ``beatport``.

Empty ``fields`` is allowed: the person only said "this is the right track".
:class:`~cuepoint.services.match_apply.MatchApplyService` refuses that, which is
right for "apply" and wrong here, so this service has its own loop.

The key (DEC-201, DEC-203)
--------------------------
The key is never a field. An accepted match already supplies it, unless the
track has the person's own correction, which wins. ``replace_key`` is the person
saying "use Beatport's instead": it clears the override (``None``), recorded and
revertable like any other write. It does so only for a key that *is* the
person's correction, and says what it did otherwise (``not_yours``), and it never
clears a correction when the candidate has no key to show in its place
(``no_beatport_key``).

One transaction
---------------
The accept and every field run inside one ``db.transaction()``. The services
beneath open theirs with ``join_existing=True``, so a failure in the third field
undoes the accept and the first two.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence

from cuepoint.models.match_attempt import STATE_ACCEPTED, MatchCandidate, TrackMatch
from cuepoint.persistence.activity_repository import SOURCE_BEATPORT
from cuepoint.services.interfaces import (
    IDatabaseService,
    IMatchCorrectService,
    IMatchRepository,
    IMatchStateService,
    IMetadataService,
    ITrackMetadataRepository,
    ITrackRepository,
)
from cuepoint.services.key_resolver import is_correction
from cuepoint.services.match_apply import KEY_FIELD
from cuepoint.services.match_state import decision_value
from cuepoint.services.override_values import (
    NOTATION_CLASSIC,
    candidate_value,
    require_field,
)

#: What ``replace_key`` did, when it was asked for (``CorrectOutcome.key``).
KEY_REPLACED = "replaced"
#: The track's key is not the person's own, so there was nothing to replace.
KEY_NOT_YOURS = "not_yours"
#: The candidate has no key to show instead, so the person's was kept.
KEY_NO_BEATPORT_KEY = "no_beatport_key"


def correct_fields(fields: Iterable[str]) -> List[str]:
    """Return the fields to copy, each once, in the order given. May be empty.

    Raises:
        ValueError: If a bare string was passed where a list belongs, a field
            cannot be overridden, or the key is named: it is replaced with
            ``replace_key``, never copied (DEC-201).
    """
    if isinstance(fields, str) or not isinstance(fields, (list, tuple)):
        raise ValueError("Name the fields to copy as a list")
    wanted: List[str] = []
    for item in fields:
        name = require_field(item)
        if name == KEY_FIELD:
            raise ValueError(
                "The key is not copied. Send replace_key to use Beatport's key"
                " instead of your own"
            )
        if name not in wanted:
            wanted.append(name)
    return wanted


@dataclass(frozen=True)
class CorrectOutcome:
    """What one Correct did, for the answer and for the line the person reads.

    Attributes:
        match: The track's state afterwards: accepted, by the person.
        batch_id: The one id everything was written under; reverting it is Undo.
            ``None`` when nothing changed, so there is nothing to undo.
        changed: Whether the decision or any value changed.
        applied: Fields written.
        skipped: Fields the candidate had no usable value for.
        unchanged: Fields that already showed the candidate's value.
        key: ``None`` when ``replace_key`` was not asked for, else
            ``replaced``, ``not_yours`` or ``no_beatport_key``.
    """

    match: TrackMatch
    batch_id: Optional[str]
    changed: bool = True
    applied: List[str] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    unchanged: List[str] = field(default_factory=list)
    key: Optional[str] = None


@dataclass
class _Written:
    """The fields one track's Correct went through."""

    applied: List[str] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    unchanged: List[str] = field(default_factory=list)
    key: Optional[str] = None

    @property
    def changed(self) -> bool:
        """True when any override was written or cleared."""
        return bool(self.applied) or self.key == KEY_REPLACED


class MatchCorrectService(IMatchCorrectService):
    """Accepts a candidate and copies ticked fields, as one act."""

    def __init__(
        self,
        match_state_service: IMatchStateService,
        match_repository: IMatchRepository,
        metadata_service: IMetadataService,
        metadata_repository: ITrackMetadataRepository,
        track_repository: ITrackRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Initialize the service.

        Args:
            match_state_service: The accept, with its history (DEC-067).
            match_repository: The candidate the fields are read from.
            metadata_service: The override layer, and the history it records.
            metadata_repository: Where an override came from, which is how the
                person's own key is told from one Beatport supplied.
            track_repository: Refuses a Correct on a track that is not there.
            database_service: The transaction the accept and every field share.
                No SQL is run here.
        """
        self._states = match_state_service
        self._matches = match_repository
        self._metadata = metadata_service
        self._sources = metadata_repository
        self._tracks = track_repository
        self._db = database_service

    def correct(
        self,
        track_id: int,
        candidate_id: int,
        fields: Sequence[str],
        replace_key: bool = False,
        batch_id: Optional[str] = None,
    ) -> CorrectOutcome:
        """Accept a candidate and copy the ticked fields, all or nothing.

        Raises:
            ValueError: If the track or candidate does not exist, the candidate
                is another track's, or a field is not one that can be copied.
                Nothing is written.
        """
        wanted = correct_fields(fields)
        track_id = self._require_track(track_id)
        candidate = self._matches.get_candidate(int(candidate_id))
        if candidate is None:
            raise ValueError(f"No candidate {candidate_id}")
        group = batch_id or str(uuid.uuid4())
        notation = self._metadata.key_notation() if replace_key else NOTATION_CLASSIC
        with self._db.transaction():
            before = self._matches.get_match(track_id)
            match = self._states.accept(track_id, int(candidate_id), group)
            written = self._write(
                track_id, candidate, wanted, replace_key, group, notation
            )
        # Nothing written means no history row carries the id, and reverting it
        # would answer "No such batch": say there is nothing to undo instead.
        changed = written.changed or decision_value(before) != decision_value(match)
        return CorrectOutcome(
            match=match,
            batch_id=group if changed else None,
            changed=changed,
            applied=written.applied,
            skipped=written.skipped,
            unchanged=written.unchanged,
            key=written.key,
        )

    def correct_proposed(
        self,
        track_id: int,
        fields: Sequence[str],
        replace_key: bool,
        batch_id: str,
        notation: str,
    ) -> bool:
        """Batch form: accept what the track proposes and copy the fields.

        A track a person already decided keeps that decision (DEC-067) but, when
        they accepted it, still gets the fields. A track never matched, or one
        the person rejected, is left as it is.

        Returns:
            True when the decision or any override changed.

        Raises:
            ValueError: If the track does not exist, which a batch counts as a
                failure, as it does for every other operation.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            changed = self._states.accept_proposed(track_id, batch_id)
            match = self._matches.get_match(track_id)
            if (
                match is None
                or match.state != STATE_ACCEPTED
                or match.candidate_id is None
            ):
                return changed
            candidate = self._matches.get_candidate(match.candidate_id)
            if candidate is None:
                return changed
            written = self._write(
                track_id, candidate, list(fields), replace_key, batch_id, notation
            )
            return changed or written.changed

    # --------------------------------------------------------------- helpers

    def _write(
        self,
        track_id: int,
        candidate: MatchCandidate,
        fields: Sequence[str],
        replace_key: bool,
        batch_id: str,
        notation: str,
    ) -> _Written:
        """Copy the fields and, when asked, clear the person's own key."""
        written = _Written()
        before = self._metadata.get(track_id)
        key_is_yours = replace_key and self._key_is_yours(track_id)
        with self._db.transaction(join_existing=True):
            for name in fields:
                value = candidate_value(candidate, name, NOTATION_CLASSIC)
                if value is None:
                    written.skipped.append(name)
                elif (getattr(before, name) if before is not None else None) == value:
                    written.unchanged.append(name)
                else:
                    self._metadata.set_override(
                        track_id,
                        name,
                        value,
                        source=SOURCE_BEATPORT,
                        batch_id=batch_id,
                        notation=NOTATION_CLASSIC,
                    )
                    written.applied.append(name)
            if replace_key:
                written.key = self._replace_key(
                    track_id, candidate, key_is_yours, batch_id, notation
                )
        return written

    def _replace_key(
        self,
        track_id: int,
        candidate: MatchCandidate,
        key_is_yours: bool,
        batch_id: str,
        notation: str,
    ) -> str:
        if not key_is_yours:
            return KEY_NOT_YOURS
        if candidate_value(candidate, KEY_FIELD, notation) is None:
            return KEY_NO_BEATPORT_KEY
        self._metadata.set_override(
            track_id, KEY_FIELD, None, batch_id=batch_id, notation=notation
        )
        return KEY_REPLACED

    def _key_is_yours(self, track_id: int) -> bool:
        """Whether the track's key override is the person's own (DEC-203)."""
        record = self._metadata.get(track_id)
        if record is None or record.key is None:
            return False
        sources: Dict[int, Dict[str, Any]] = self._sources.override_sources([track_id])
        return is_correction(record.key, sources.get(track_id, {}).get(KEY_FIELD))

    def _require_track(self, track_id: int) -> int:
        wanted = int(track_id)
        if self._tracks.get(wanted) is None:
            raise ValueError(f"No such track: {track_id}")
        return wanted


__all__ = (
    "KEY_NOT_YOURS",
    "KEY_NO_BEATPORT_KEY",
    "KEY_REPLACED",
    "CorrectOutcome",
    "MatchCorrectService",
    "correct_fields",
)
