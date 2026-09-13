#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Match attempts, their candidates, and each track's match state (CLEAN-01).

The types over the matching half of ``m0011_clean``. Four of them, because the
tables answer four different questions:

- :class:`MatchAttempt` — *what was asked, and what came back*: one run of the
  matcher for one track, kept forever (DEC-066).
- :class:`MatchCandidate` — *everything the matcher scored* in that run,
  including what its guards rejected, because a rejected candidate is what
  explains a "no match".
- :class:`TrackMatch` — *where the track stands*: its state, who decided it,
  and whether a later attempt disagrees with a user's decision (DEC-067).
- :class:`MatchJobTrack` — *how far a match job got*: one row of its plan
  (DEC-065).

"Not matched" has no type. It is the absence of a :class:`TrackMatch`, which
is what makes "tracks never matched" an anti-join rather than a state someone
has to remember to write.

Two outcomes sound alike and are not
------------------------------------
An attempt's ``no_match`` *outcome* says what one run found. A track's
``no_match`` *state* says where it stands after all of them. An ``error``
outcome is not evidence of either: a network failure on a re-match leaves an
earlier acceptance alone (CLEAN-04), which is why ``error`` is an outcome and
never a state.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from cuepoint.models.row_values import (
    flag,
    non_negative,
    number,
    one_of,
    optional_id,
    optional_non_negative,
    optional_number,
    optional_whole_number,
    required_id,
    required_text,
)

#: What one attempt found.
OUTCOME_MATCHED = "matched"
OUTCOME_NO_MATCH = "no_match"
OUTCOME_ERROR = "error"
OUTCOMES = (OUTCOME_MATCHED, OUTCOME_NO_MATCH, OUTCOME_ERROR)

#: Where a track stands. "Not matched" is deliberately absent — see the module
#: docstring.
STATE_NO_MATCH = "no_match"
STATE_NEEDS_REVIEW = "needs_review"
STATE_ACCEPTED = "accepted"
STATE_REJECTED = "rejected"
MATCH_STATES = (STATE_NO_MATCH, STATE_NEEDS_REVIEW, STATE_ACCEPTED, STATE_REJECTED)

#: Who put the track in that state. A user's decision survives any re-match.
DECIDED_BY_AUTO = "auto"
DECIDED_BY_USER = "user"
DECIDERS = (DECIDED_BY_AUTO, DECIDED_BY_USER)


def _optional_text(value: Any) -> Optional[str]:
    """Return text as stored, or ``None``. A number from a row becomes text."""
    return None if value is None else str(value)


def _json_text(value: Any, name: str, kind: type, required: bool) -> Optional[str]:
    """Return stored JSON text after checking it parses to ``kind``.

    The column is kept as the text it is stored as, so a row round-trips byte
    for byte; the check is that it is JSON of the right shape, because a stored
    question the matcher cannot be shown to have been asked is not a record.

    Raises:
        ValueError: If it is required and missing, is not JSON, or is JSON of
            another shape.
    """
    if value is None:
        if required:
            raise ValueError(f"{name} is required")
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} must be JSON text, got {type(value).__name__}")
    try:
        parsed = json.loads(value)
    except ValueError:
        raise ValueError(f"{name} is not valid JSON") from None
    if not isinstance(parsed, kind):
        raise ValueError(f"{name} must be a JSON {kind.__name__}")
    return value


@dataclass(frozen=True)
class MatchAttempt:
    """One run of the matcher for one track.

    Attributes:
        track_id: The library track that was matched.
        outcome: One of :data:`OUTCOMES`.
        input_json: The question the matcher was asked — title, artist, key,
            year and mix — as a JSON object. A re-match after a refresh
            changed the title is a different question, and this says which one
            this attempt answered.
        started_at: When the run began.
        finished_at: When it ended. An attempt is stored once it has finished.
        id: Database primary key; ``None`` until persisted.
        job_id: The job that ran it, or ``None`` for a single-track match.
        best_candidate_id: The winning candidate's row, once stored.
        score: The winner's score, or ``None`` when there was no winner.
        error: What went wrong. Required when the outcome is an error: an
            error nobody can read is a no-match with extra steps.
        queries_json: The queries tried, as a JSON array.
        matcher_version: The engine version that ran the matcher — the only
            way to tell later whether two attempts disagree because the track
            changed or because the matcher did.
    """

    track_id: int
    outcome: str
    input_json: str
    started_at: str
    finished_at: str
    id: Optional[int] = None
    job_id: Optional[str] = None
    best_candidate_id: Optional[int] = None
    score: Optional[float] = None
    error: Optional[str] = None
    queries_json: Optional[str] = None
    matcher_version: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the attempt, refusing anything its table would refuse."""
        _set(self, "id", optional_id(self.id, "id"))
        _set(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.outcome, OUTCOMES, "outcome")
        _set(
            self,
            "input_json",
            _json_text(self.input_json, "input_json", dict, required=True),
        )
        _set(self, "started_at", required_text(self.started_at, "started_at"))
        _set(self, "finished_at", required_text(self.finished_at, "finished_at"))
        _set(
            self,
            "best_candidate_id",
            optional_id(self.best_candidate_id, "best_candidate_id"),
        )
        _set(self, "score", optional_number(self.score, "score"))
        _set(
            self,
            "queries_json",
            _json_text(self.queries_json, "queries_json", list, required=False),
        )
        if self.outcome == OUTCOME_ERROR and not (self.error or "").strip():
            raise ValueError("An attempt that ended in an error must say what it was")

    @property
    def is_error(self) -> bool:
        """True when the run failed rather than found nothing."""
        return self.outcome == OUTCOME_ERROR

    @property
    def input(self) -> Dict[str, Any]:
        """The question the matcher was asked, parsed."""
        parsed: Dict[str, Any] = json.loads(self.input_json)
        return parsed

    @property
    def queries(self) -> List[Any]:
        """The queries tried, parsed; empty when none were recorded."""
        if self.queries_json is None:
            return []
        parsed: List[Any] = json.loads(self.queries_json)
        return parsed

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "track_id": self.track_id,
            "job_id": self.job_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "outcome": self.outcome,
            "best_candidate_id": self.best_candidate_id,
            "score": self.score,
            "error": self.error,
            "queries_json": self.queries_json,
            "input_json": self.input_json,
            "matcher_version": self.matcher_version,
        }

    @classmethod
    def from_row(cls, row: Any) -> "MatchAttempt":
        """Build an attempt from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            track_id=data["track_id"],
            job_id=data.get("job_id"),
            started_at=data["started_at"],
            finished_at=data["finished_at"],
            outcome=data["outcome"],
            best_candidate_id=data.get("best_candidate_id"),
            score=data.get("score"),
            error=data.get("error"),
            queries_json=data.get("queries_json"),
            input_json=data["input_json"],
            matcher_version=data.get("matcher_version"),
        )


@dataclass(frozen=True)
class MatchCandidate:
    """One Beatport result the matcher scored in one attempt.

    Every field ``BeatportCandidate`` carries except its raw payload, as
    columns: the review page sorts and compares these, and "apply" copies them.

    Attributes:
        attempt_id: The attempt that scored it.
        rank: Its place in the order the matcher scored them, from 0. Unique
            within an attempt.
        url: The Beatport track page. Required — a candidate nobody can open
            cannot be reviewed.
        score: The matcher's final score.
        guard_ok: Whether it passed the matcher's guards.
        is_winner: Whether the matcher chose it. Recorded, never recomputed.
        id: Database primary key; ``None`` until persisted.
        beatport_track_id: Beatport's id for the track, when known.
        title, artists, remixers, label, genre, subgenre, key: As Beatport
            shows them.
        bpm: Beatport's BPM.
        release_name, release_date, release_year: The release it is on.
        artwork_url, preview_url: Beatport's media for it.
        base_score: The similarity score before bonuses.
        title_sim, artist_sim: The two similarities, 0–100.
        bonus_year, bonus_key: The bonuses applied; either may be a penalty.
        reject_reason: Why a guard rejected it.
        query_index, query_text: The query that found it.
        candidate_index: Its place in that query's results.
        elapsed_ms: How long fetching and scoring it took.
    """

    attempt_id: int
    rank: int
    url: str
    score: float
    guard_ok: bool
    is_winner: bool
    id: Optional[int] = None
    beatport_track_id: Optional[str] = None
    title: Optional[str] = None
    artists: Optional[str] = None
    remixers: Optional[str] = None
    label: Optional[str] = None
    genre: Optional[str] = None
    subgenre: Optional[str] = None
    key: Optional[str] = None
    bpm: Optional[float] = None
    release_name: Optional[str] = None
    release_date: Optional[str] = None
    release_year: Optional[int] = None
    artwork_url: Optional[str] = None
    preview_url: Optional[str] = None
    base_score: Optional[float] = None
    title_sim: Optional[int] = None
    artist_sim: Optional[int] = None
    bonus_year: Optional[int] = None
    bonus_key: Optional[int] = None
    reject_reason: Optional[str] = None
    query_index: Optional[int] = None
    query_text: Optional[str] = None
    candidate_index: Optional[int] = None
    elapsed_ms: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the candidate, refusing anything its table would refuse."""
        _set(self, "id", optional_id(self.id, "id"))
        _set(self, "attempt_id", required_id(self.attempt_id, "attempt_id"))
        _set(self, "rank", non_negative(self.rank, "rank"))
        _set(self, "url", required_text(self.url, "url"))
        _set(self, "score", number(self.score, "score"))
        _set(self, "guard_ok", flag(self.guard_ok, "guard_ok"))
        _set(self, "is_winner", flag(self.is_winner, "is_winner"))
        _set(
            self,
            "beatport_track_id",
            _optional_text(self.beatport_track_id),
        )
        _set(self, "bpm", optional_number(self.bpm, "bpm"))
        _set(
            self,
            "release_year",
            optional_whole_number(self.release_year, "release_year"),
        )
        _set(self, "base_score", optional_number(self.base_score, "base_score"))
        for name in ("title_sim", "artist_sim"):
            similarity = optional_non_negative(getattr(self, name), name)
            if similarity is not None and similarity > 100:
                raise ValueError(f"{name} must be between 0 and 100, got {similarity}")
            _set(self, name, similarity)
        for name in ("bonus_year", "bonus_key"):
            _set(self, name, optional_whole_number(getattr(self, name), name))
        for name in ("query_index", "candidate_index", "elapsed_ms"):
            _set(self, name, optional_non_negative(getattr(self, name), name))

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row, with the two flags as 0/1."""
        return {
            "id": self.id,
            "attempt_id": self.attempt_id,
            "rank": self.rank,
            "beatport_track_id": self.beatport_track_id,
            "url": self.url,
            "title": self.title,
            "artists": self.artists,
            "remixers": self.remixers,
            "label": self.label,
            "genre": self.genre,
            "subgenre": self.subgenre,
            "key": self.key,
            "bpm": self.bpm,
            "release_name": self.release_name,
            "release_date": self.release_date,
            "release_year": self.release_year,
            "artwork_url": self.artwork_url,
            "preview_url": self.preview_url,
            "score": self.score,
            "base_score": self.base_score,
            "title_sim": self.title_sim,
            "artist_sim": self.artist_sim,
            "bonus_year": self.bonus_year,
            "bonus_key": self.bonus_key,
            "guard_ok": 1 if self.guard_ok else 0,
            "reject_reason": self.reject_reason,
            "query_index": self.query_index,
            "query_text": self.query_text,
            "candidate_index": self.candidate_index,
            "elapsed_ms": self.elapsed_ms,
            "is_winner": 1 if self.is_winner else 0,
        }

    @classmethod
    def from_row(cls, row: Any) -> "MatchCandidate":
        """Build a candidate from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            **{name: data.get(name) for name in _CANDIDATE_OPTIONAL},
            attempt_id=data["attempt_id"],
            rank=data["rank"],
            url=data["url"],
            score=data["score"],
            guard_ok=data["guard_ok"],
            is_winner=data["is_winner"],
        )


#: The candidate columns a row may leave null, read by name in ``from_row``.
_CANDIDATE_OPTIONAL = (
    "id",
    "beatport_track_id",
    "title",
    "artists",
    "remixers",
    "label",
    "genre",
    "subgenre",
    "key",
    "bpm",
    "release_name",
    "release_date",
    "release_year",
    "artwork_url",
    "preview_url",
    "base_score",
    "title_sim",
    "artist_sim",
    "bonus_year",
    "bonus_key",
    "reject_reason",
    "query_index",
    "query_text",
    "candidate_index",
    "elapsed_ms",
)


@dataclass(frozen=True)
class TrackMatch:
    """Where one track stands with Beatport, and who put it there.

    Attributes:
        track_id: The library track. Also the primary key: one state per track.
        state: One of :data:`MATCH_STATES`.
        decided_by: One of :data:`DECIDERS`.
        attempt_id: The attempt the state rests on.
        decided_at: When it was decided.
        candidate_id: The chosen candidate — any candidate of any of the
            track's attempts, not only a winner, because choosing the second
            one is the correction a reviewer makes most. Required when the
            state is ``accepted``, since that is what "apply" copies from;
            refused when it is ``no_match``, which has nothing to point at.
        newer_attempt_id: Set when a later attempt's winner disagrees with a
            user's decision (DEC-067). Only a user's decision can be disputed:
            an automatic state is simply replaced.
    """

    track_id: int
    state: str
    decided_by: str
    attempt_id: int
    decided_at: str
    candidate_id: Optional[int] = None
    newer_attempt_id: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the state and the invariants the table leaves to code.

        m0009's reasoning on CHECK constraints applies: the vocabularies are in
        the schema, and the relationships between columns are here, where they
        can change without rebuilding a table of user decisions.
        """
        _set(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.state, MATCH_STATES, "state")
        one_of(self.decided_by, DECIDERS, "decided_by")
        _set(self, "attempt_id", required_id(self.attempt_id, "attempt_id"))
        _set(self, "decided_at", required_text(self.decided_at, "decided_at"))
        _set(self, "candidate_id", optional_id(self.candidate_id, "candidate_id"))
        _set(
            self,
            "newer_attempt_id",
            optional_id(self.newer_attempt_id, "newer_attempt_id"),
        )

        if self.state == STATE_ACCEPTED and self.candidate_id is None:
            raise ValueError("An accepted match must name the candidate it accepted")
        if self.state == STATE_NO_MATCH and self.candidate_id is not None:
            raise ValueError("A track with no match cannot point at a candidate")
        if self.newer_attempt_id is not None:
            if self.decided_by != DECIDED_BY_USER:
                raise ValueError(
                    "Only a user's decision can be disputed by a newer attempt"
                )
            if self.newer_attempt_id == self.attempt_id:
                raise ValueError(
                    "A newer attempt cannot be the attempt the decision rests on"
                )

    @property
    def is_user_decision(self) -> bool:
        """True when a re-match must leave this state alone (DEC-067)."""
        return self.decided_by == DECIDED_BY_USER

    @property
    def is_disputed(self) -> bool:
        """True when a later attempt disagrees with the user's decision."""
        return self.newer_attempt_id is not None

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "track_id": self.track_id,
            "state": self.state,
            "decided_by": self.decided_by,
            "attempt_id": self.attempt_id,
            "candidate_id": self.candidate_id,
            "newer_attempt_id": self.newer_attempt_id,
            "decided_at": self.decided_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackMatch":
        """Build a state from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            track_id=data["track_id"],
            state=data["state"],
            decided_by=data["decided_by"],
            attempt_id=data["attempt_id"],
            candidate_id=data.get("candidate_id"),
            newer_attempt_id=data.get("newer_attempt_id"),
            decided_at=data["decided_at"],
        )


@dataclass(frozen=True)
class MatchJobTrack:
    """One track in a match job's plan (DEC-065).

    The plan is written once when the job starts, and ``done`` is committed as
    each track finishes, so an interrupted job resumes from the first row that
    is not done. ``track_id`` is not a foreign key: a track a refresh deletes
    mid-job is skipped and counted, not cascaded out of the plan.

    Attributes:
        job_id: The job this plan belongs to.
        position: The track's place in the plan, from 0.
        track_id: The library track to match.
        done: Whether the track has been matched in this job.
    """

    job_id: str
    position: int
    track_id: int
    done: bool = False

    def __post_init__(self) -> None:
        """Validate the plan row."""
        _set(self, "job_id", required_text(self.job_id, "job_id"))
        _set(self, "position", non_negative(self.position, "position"))
        _set(self, "track_id", required_id(self.track_id, "track_id"))
        _set(self, "done", flag(self.done, "done"))

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row, with ``done`` as 0/1."""
        return {
            "job_id": self.job_id,
            "position": self.position,
            "track_id": self.track_id,
            "done": 1 if self.done else 0,
        }

    @classmethod
    def from_row(cls, row: Any) -> "MatchJobTrack":
        """Build a plan row from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            job_id=data["job_id"],
            position=data["position"],
            track_id=data["track_id"],
            done=data.get("done", 0),
        )


def _set(instance: Any, name: str, value: Any) -> None:
    """Store a normalized value on a frozen dataclass during ``__post_init__``."""
    object.__setattr__(instance, name, value)
