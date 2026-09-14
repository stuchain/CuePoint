#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where a track stands with Beatport, and who put it there (CLEAN-04, DEC-067).

Two kinds of writer reach ``track_match``, and the whole of this module is the
line between them:

- **The state rule**, run inside the transaction that stores each attempt
  (CLEAN-03). It decides automatically, and it may replace any automatic
  decision — an auto-accept is not sticky (DEC-067).
- **A user**, through :meth:`MatchStateService.accept`, :meth:`~MatchStateService.reject`
  and :meth:`~MatchStateService.clear_decision`. A user's decision is never
  changed by the rule. A later attempt that disagrees with it sets a flag and
  nothing else.

The rule, row by row
--------------------
:func:`automatic_state` is pure and is the table in the specification:

=================================  =================  ==========================
New attempt                        Existing state     Result
=================================  =================  ==========================
winner ≥ 95, its guards passed     none, or auto      accepted / auto → winner
winner below 95 (or a guard)       none, or auto      needs_review / auto → winner
candidates judged, none chosen     none, or auto      no_match / auto
an error, or no candidates at all  none, or auto      unchanged — nothing if none
any                                user               unchanged; the dispute flag
                                                      follows the newest answer
=================================  =================  ==========================

**An error and an empty result are not evidence.** The specification lets an
error keep a previous state and turns an error on a never-matched track into
``no_match``. The second half is refined here, for DEC-067's own reason — "an
error is not evidence that there is no match" — and for CLEAN-03's: the matcher
reports a failed search as an empty result, so an empty result is what an
outage looks like. Neither writes a state, so a track whose only attempts
failed stays "not matched", which is true, and the next match that is not a
re-match asks it again.

**The dispute flag follows the newest answer.** A user accepted candidate C: a
re-match whose winner is a different Beatport track flags the decision; one
whose winner is C clears the flag, because the newest evidence now agrees; one
with no winner says nothing new and leaves the flag alone. A user rejected the
track: a winner other than the one they rejected flags it; the same winner or
no winner at all agrees with them and clears it. Beatport tracks are compared by
Beatport id, and by page URL when either id is unknown.

``AUTO_ACCEPT_SCORE`` is 95 because that is ``core.matcher._confidence_label``'s
"high" boundary, and a test holds the two together.

What a decision records
-----------------------
Every user decision records history under ``match_state`` with source
``cuepoint`` (DEC-008). The value is the decision itself — state, who decided,
the attempt and candidate it rests on, and any newer attempt — rather than the
state word, because accepting the second candidate instead of the first changes
no word and changes what "apply" copies (CLEAN-05), and because CLEAN-06's
revert needs every part of it back. A decision that changes nothing writes
nothing. The rule's automatic writes record no history: a match job over a
library would otherwise write fifty thousand rows nobody asked to see, and the
attempts are already their record.

**Deciding applies nothing** (DEC-004). Nothing here reaches ``track_metadata``.

Batch decisions confirm or refuse a proposal
--------------------------------------------
:meth:`MatchStateService.accept_proposed` and
:meth:`~MatchStateService.reject_proposed` are what ORG-07's batch path calls. A
batch runs over a query that may name forty thousand tracks, so it acts only on
what the matcher proposed and nobody has decided: a track a user already
accepted or rejected is left exactly as it is and counted unchanged. Overriding
one person's decision is a per-track act (:meth:`~MatchStateService.accept`,
:meth:`~MatchStateService.reject`), which is the protection DEC-067 exists for.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_NOT_MATCHED,
    STATE_REJECTED,
    MatchAttempt,
    MatchCandidate,
    TrackMatch,
)
from cuepoint.persistence.activity_repository import SOURCE_CUEPOINT
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    IMatchRepository,
    IMatchStateService,
    ITrackRepository,
)

#: An attempt whose winner scores at least this, with its guards passed, is
#: accepted automatically (DEC-067). The matcher's "high" confidence boundary.
AUTO_ACCEPT_SCORE = 95

#: The history field every decision is recorded under.
FIELD_MATCH_STATE = "match_state"

#: Every value ``match_state`` takes in a filter, in the order a review works
#: through them.
FILTER_STATES = (
    STATE_NOT_MATCHED,
    STATE_NO_MATCH,
    STATE_NEEDS_REVIEW,
    STATE_ACCEPTED,
    STATE_REJECTED,
)


@dataclass(frozen=True)
class Evidence:
    """What one stored attempt says, as the state rule reads it.

    Attributes:
        attempt: The stored attempt.
        winner: Its winning candidate, when it has one.
        answered: Whether it found a match or judged at least one candidate. An
            error or an empty result has not answered anything.
    """

    attempt: MatchAttempt
    winner: Optional[MatchCandidate]
    answered: bool


def same_beatport_track(first: MatchCandidate, second: MatchCandidate) -> bool:
    """True when two candidates are the same Beatport track.

    By Beatport id when both are known — a URL's slug changes when a title is
    corrected, and the id does not — and by page URL otherwise.
    """
    if first.beatport_track_id and second.beatport_track_id:
        return first.beatport_track_id == second.beatport_track_id
    return first.url == second.url


def automatic_state(
    evidence: Evidence,
    existing: Optional[TrackMatch],
    decided: Optional[MatchCandidate],
    decided_at: str,
) -> Optional[TrackMatch]:
    """Return the state a track should have after a new attempt.

    Pure: the table in the module docstring, and nothing else.

    Args:
        evidence: The new attempt.
        existing: The track's current state, if it has one.
        decided: The candidate ``existing`` points at, if any.
        decided_at: When an automatic decision made now is made.

    Returns:
        The state to store, ``existing`` itself when nothing changes, or
        ``None`` when the track has no state and gains none.

    Raises:
        ValueError: If a matched attempt names no winner, which CLEAN-02's
            storage never produces.
    """
    attempt = evidence.attempt
    if attempt.outcome == OUTCOME_MATCHED and evidence.winner is None:
        raise ValueError(f"Attempt {attempt.id} is a match with no winner")

    if existing is not None and existing.is_user_decision:
        return _judge_decision(evidence, existing, decided)
    if not evidence.answered:
        return existing

    if evidence.winner is not None and attempt.outcome == OUTCOME_MATCHED:
        winner = evidence.winner
        state = (
            STATE_ACCEPTED
            if winner.guard_ok and winner.score >= AUTO_ACCEPT_SCORE
            else STATE_NEEDS_REVIEW
        )
        return TrackMatch(
            track_id=attempt.track_id,
            state=state,
            decided_by=DECIDED_BY_AUTO,
            attempt_id=_id(attempt),
            candidate_id=winner.id,
            decided_at=decided_at,
        )
    return TrackMatch(
        track_id=attempt.track_id,
        state=STATE_NO_MATCH,
        decided_by=DECIDED_BY_AUTO,
        attempt_id=_id(attempt),
        decided_at=decided_at,
    )


def _judge_decision(
    evidence: Evidence, existing: TrackMatch, decided: Optional[MatchCandidate]
) -> TrackMatch:
    """A user's decision, with its dispute flag brought up to date."""
    if not evidence.answered:
        return existing
    winner = evidence.winner if evidence.attempt.outcome == OUTCOME_MATCHED else None

    if existing.state == STATE_ACCEPTED:
        if winner is None:
            return existing
        agrees = decided is not None and same_beatport_track(winner, decided)
    elif existing.state == STATE_REJECTED:
        agrees = winner is None or (
            decided is not None and same_beatport_track(winner, decided)
        )
    else:
        return existing

    newer = None if agrees else _id(evidence.attempt)
    if newer == existing.newer_attempt_id:
        return existing
    return replace(existing, newer_attempt_id=newer)


def decision_value(match: Optional[TrackMatch]) -> Optional[Dict[str, Any]]:
    """A state as a history value: everything but the track and the clock."""
    if match is None:
        return None
    return {
        "state": match.state,
        "decided_by": match.decided_by,
        "attempt_id": match.attempt_id,
        "candidate_id": match.candidate_id,
        "newer_attempt_id": match.newer_attempt_id,
    }


def user_part(value: Optional[Dict[str, Any]]) -> Optional[Tuple[Any, Any, Any]]:
    """What of a recorded state a person owns: ``None`` unless a user decided.

    A user's decision is its state, attempt and candidate. The dispute flag is
    not theirs — the rule moves it as attempts arrive — and an automatic state
    is not theirs at all, because a re-match replaces it (DEC-067). CLEAN-06
    compares this rather than the whole value, so a re-match that moved only
    what the rule owns does not make a person's decision stale.
    """
    if not isinstance(value, dict) or value.get("decided_by") != DECIDED_BY_USER:
        return None
    return (value.get("state"), value.get("attempt_id"), value.get("candidate_id"))


def _decision_from(track_id: int, recorded: Dict[str, Any]) -> TrackMatch:
    """Rebuild a user's decision from its history value, decided now."""
    try:
        return TrackMatch(
            track_id=track_id,
            state=str(recorded["state"]),
            decided_by=DECIDED_BY_USER,
            attempt_id=int(recorded["attempt_id"]),
            candidate_id=_optional_id(recorded.get("candidate_id")),
            newer_attempt_id=_optional_id(recorded.get("newer_attempt_id")),
            decided_at=utc_now_iso(),
        )
    except (KeyError, TypeError) as exc:
        raise ValueError(
            f"The recorded decision for track {track_id} cannot be read"
            f" ({exc}): {recorded!r}"
        ) from None


def _optional_id(value: Any) -> Optional[int]:
    return None if value is None else int(value)


def _id(attempt: MatchAttempt) -> int:
    if attempt.id is None:
        raise ValueError("Only a stored attempt can decide a state")
    return attempt.id


class MatchStateService(IMatchStateService):
    """Automatic states, a user's decisions, and the flag between them."""

    def __init__(
        self,
        match_repository: IMatchRepository,
        track_repository: ITrackRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Initialize the service.

        Args:
            match_repository: Attempts, candidates and states.
            track_repository: Refuses a decision about a track that is not there.
            activity_service: The history a decision records.
            database_service: The transaction a decision and its history share.
                No SQL is run here.
        """
        self._matches = match_repository
        self._tracks = track_repository
        self._activity = activity_service
        self._db = database_service

    # -------------------------------------------------------------- the rule

    def apply_attempt(self, attempt: MatchAttempt) -> Optional[TrackMatch]:
        """Bring a track's state up to date with an attempt just stored.

        CLEAN-03's state rule. Joins the transaction the attempt was stored in,
        so the attempt, its plan row and the state commit together.

        Returns:
            The track's state afterwards, or ``None`` when it has none.
        """
        with self._db.transaction(join_existing=True):
            existing = self._matches.get_match(attempt.track_id)
            wanted = automatic_state(
                self._evidence(attempt),
                existing,
                self._pointed_at(existing),
                utc_now_iso(),
            )
            if wanted is None or wanted is existing:
                return wanted
            return self._matches.set_match(wanted)

    # ------------------------------------------------------------- decisions

    def accept(
        self, track_id: int, candidate_id: int, batch_id: Optional[str] = None
    ) -> TrackMatch:
        """Accept a candidate — any candidate of any of the track's attempts.

        Raises:
            ValueError: If the track or candidate does not exist, or the
                candidate is another track's. Nothing is written.
        """
        track_id = self._require_track(track_id)
        candidate = self._matches.get_candidate(int(candidate_id))
        if candidate is None:
            raise ValueError(f"No candidate {candidate_id}")
        with self._db.transaction(join_existing=True):
            existing = self._matches.get_match(track_id)
            wanted = TrackMatch(
                track_id=track_id,
                state=STATE_ACCEPTED,
                decided_by=DECIDED_BY_USER,
                attempt_id=candidate.attempt_id,
                candidate_id=candidate.id,
                decided_at=utc_now_iso(),
            )
            return self._decide(existing, wanted, batch_id)

    def reject(self, track_id: int, batch_id: Optional[str] = None) -> TrackMatch:
        """Say that no candidate is this track.

        The decision rests on what the track's state points at — so rejecting
        an accepted candidate rejects that one — or, with nothing pointed at, on
        the latest answered attempt and its winner. Remembering which candidate
        was refused is what lets a later re-match that proposes the same one
        again stay quiet.

        Raises:
            ValueError: If the track does not exist or was never matched.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            existing = self._matches.get_match(track_id)
            if existing is not None:
                attempt_id = existing.attempt_id
                candidate_id = existing.candidate_id
                if candidate_id is None:
                    winner = self._matches.winner_of(attempt_id)
                    candidate_id = None if winner is None else winner.id
            else:
                attempt = self._matches.latest_answered_attempt(
                    track_id
                ) or self._matches.latest_attempt(track_id)
                if attempt is None:
                    raise ValueError(
                        f"Track {track_id} has never been matched, so there is"
                        " nothing to reject"
                    )
                attempt_id = _id(attempt)
                winner = self._matches.winner_of(attempt_id)
                candidate_id = None if winner is None else winner.id
            wanted = TrackMatch(
                track_id=track_id,
                state=STATE_REJECTED,
                decided_by=DECIDED_BY_USER,
                attempt_id=attempt_id,
                candidate_id=candidate_id,
                decided_at=utc_now_iso(),
            )
            return self._decide(existing, wanted, batch_id)

    def clear_decision(
        self, track_id: int, batch_id: Optional[str] = None
    ) -> Optional[TrackMatch]:
        """Return a track to what its latest answered attempt says.

        The state becomes automatic again, and a re-match may replace it. With
        no answered attempt at all the track is "not matched" once more.

        Raises:
            ValueError: If the track does not exist.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            return self._derive(track_id, batch_id)

    def restore_decision(
        self,
        track_id: int,
        recorded: Optional[Dict[str, Any]],
        batch_id: Optional[str] = None,
    ) -> Optional[TrackMatch]:
        """Put back a decision as history recorded it (CLEAN-06, DEC-068).

        What is restored is what a person owns, and nothing the rule would
        re-derive:

        - **A recorded user decision** comes back as it was — its state, its
          attempt, its candidate and the flag it carried. An attempt stored
          after everything that decision knew about is then judged against it,
          exactly as the rule would have judged it had the decision stood.
        - **A recorded automatic state, or none**, is not replayed as a stale
          snapshot. The track returns to what its latest answered attempt says,
          which is :meth:`clear_decision`: an automatic state is derived from
          evidence, and the evidence may be newer than the history row.

        Raises:
            ValueError: If the track does not exist, or the recorded decision
                cannot be read or no longer rests on the track's own evidence.
                Nothing is written.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            if user_part(recorded) is None:
                return self._derive(track_id, batch_id)
            assert recorded is not None  # user_part is None for no decision
            wanted = _decision_from(track_id, recorded)
            latest = self._matches.latest_answered_attempt(track_id)
            known = max(wanted.attempt_id, wanted.newer_attempt_id or 0)
            if latest is not None and _id(latest) > known:
                wanted = _judge_decision(
                    self._evidence(latest), wanted, self._pointed_at(wanted)
                )
            return self._decide(self._matches.get_match(track_id), wanted, batch_id)

    def accept_proposed(self, track_id: int, batch_id: Optional[str] = None) -> bool:
        """Accept what the matcher proposed, unless a user already decided.

        Returns:
            True when the track's state changed. A track never matched, with
            nothing proposed, or already decided by a user is left alone.

        Raises:
            ValueError: If the track does not exist.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            existing = self._matches.get_match(track_id)
            if (
                existing is None
                or existing.is_user_decision
                or existing.candidate_id is None
            ):
                return False
            self.accept(track_id, existing.candidate_id, batch_id)
            return True

    def reject_proposed(self, track_id: int, batch_id: Optional[str] = None) -> bool:
        """Reject what the matcher proposed, unless a user already decided.

        Returns:
            True when the track's state changed. A track never matched or
            already decided by a user is left alone.

        Raises:
            ValueError: If the track does not exist.
        """
        track_id = self._require_track(track_id)
        with self._db.transaction(join_existing=True):
            existing = self._matches.get_match(track_id)
            if existing is None or existing.is_user_decision:
                return False
            self.reject(track_id, batch_id)
            return True

    # --------------------------------------------------------------- helpers

    def _derive(self, track_id: int, batch_id: Optional[str]) -> Optional[TrackMatch]:
        """Return a track to the automatic state its evidence gives it.

        Runs inside the caller's transaction.
        """
        existing = self._matches.get_match(track_id)
        attempt = self._matches.latest_answered_attempt(track_id)
        derived = (
            None
            if attempt is None
            else automatic_state(self._evidence(attempt), None, None, utc_now_iso())
        )
        if derived is None:
            if existing is None:
                return None
            self._matches.delete_match(track_id)
            self._record(track_id, existing, None, batch_id)
            return None
        return self._decide(existing, derived, batch_id)

    def _decide(
        self,
        existing: Optional[TrackMatch],
        wanted: TrackMatch,
        batch_id: Optional[str],
    ) -> TrackMatch:
        """Store a decision and its history, unless it changes nothing."""
        if existing is not None and decision_value(existing) == decision_value(wanted):
            return existing
        stored = self._matches.set_match(wanted)
        self._record(stored.track_id, existing, stored, batch_id)
        return stored

    def _record(
        self,
        track_id: int,
        before: Optional[TrackMatch],
        after: Optional[TrackMatch],
        batch_id: Optional[str],
    ) -> None:
        self._activity.record_field_change(
            track_id=track_id,
            field_name=FIELD_MATCH_STATE,
            old_value=decision_value(before),
            new_value=decision_value(after),
            source=SOURCE_CUEPOINT,
            batch_id=batch_id,
        )

    def _evidence(self, attempt: MatchAttempt) -> Evidence:
        attempt_id = _id(attempt)
        winner = (
            self._matches.winner_of(attempt_id)
            if attempt.outcome == OUTCOME_MATCHED
            else None
        )
        answered = attempt.outcome == OUTCOME_MATCHED or (
            attempt.outcome == OUTCOME_NO_MATCH
            and self._matches.has_candidates(attempt_id)
        )
        return Evidence(attempt=attempt, winner=winner, answered=answered)

    def _pointed_at(self, match: Optional[TrackMatch]) -> Optional[MatchCandidate]:
        if match is None or match.candidate_id is None:
            return None
        return self._matches.get_candidate(match.candidate_id)

    def _require_track(self, track_id: int) -> int:
        """Return the id of a track that exists, or refuse the decision."""
        wanted = int(track_id)
        if self._tracks.get(wanted) is None:
            raise ValueError(f"No track {track_id}")
        return wanted


__all__ = (
    "AUTO_ACCEPT_SCORE",
    "FIELD_MATCH_STATE",
    "FILTER_STATES",
    "STATE_NOT_MATCHED",
    "Evidence",
    "MatchStateService",
    "automatic_state",
    "decision_value",
    "same_beatport_track",
    "user_part",
)
