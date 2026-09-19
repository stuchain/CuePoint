#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for match attempts, their candidates, and each track's match state.

The persistence half of DEC-066 (CLEAN-02): a matcher result goes in whole,
comes back field for field, and reading it never reaches Beatport — the
candidate a reviewer sees is the stored one, not a re-fetch.

An attempt is written whole or not at all
-----------------------------------------
An attempt without its candidates is not a state worth being able to be in,
so :meth:`MatchRepository.add_attempt` writes the attempt, every candidate and
the winner reference under one ``SAVEPOINT``. When the method opens the
transaction itself that is simply its transaction. When a caller has one open
— CLEAN-03 commits an attempt and its plan row together — the savepoint still
undoes the attempt's own rows on failure, so a caller that catches the error
and carries on cannot commit half an attempt.

The attempt row goes in first with no winner, because a candidate needs the
attempt's id; the winner is pointed at once its row exists, which is why
``best_candidate_id`` is not a foreign key (CLEAN-01).

Newest first means most recently stored
---------------------------------------
Attempts order by id, not by ``finished_at``. ``AUTOINCREMENT`` ids only ever
grow, while a timestamp comes from a clock that can be set back and from
workers that finish in any order.

A state must rest on its own track's evidence
---------------------------------------------
Foreign keys say an attempt or candidate exists; they cannot say it belongs to
the track the state is about. :meth:`MatchRepository.set_match` checks what
they cannot, because accepting another track's candidate would make "apply"
copy another track's values:

- the attempt a state rests on is one of the track's attempts;
- a named candidate comes from that attempt — a decision rests on the attempt
  its candidate came from, so choosing a candidate from an older attempt makes
  that attempt the one the decision rests on;
- a newer attempt is one of the track's, and newer than that one.

Transaction joining is as in every other repository here: writes join a
transaction the caller already holds (``join_existing=True``).
"""

from __future__ import annotations

import dataclasses
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence

from cuepoint.models.match_attempt import MatchAttempt, MatchCandidate, TrackMatch
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, IMatchRepository
from cuepoint.services.match_record import attempt_from_result, started_at_for
from cuepoint.version import __version__

_ATTEMPT_COLUMNS = tuple(field.name for field in dataclasses.fields(MatchAttempt))
_CANDIDATE_COLUMNS = tuple(field.name for field in dataclasses.fields(MatchCandidate))
_MATCH_COLUMNS = tuple(field.name for field in dataclasses.fields(TrackMatch))

_SELECT_ATTEMPT = f"SELECT {', '.join(_ATTEMPT_COLUMNS)} FROM match_attempts"
_SELECT_CANDIDATE = f"SELECT {', '.join(_CANDIDATE_COLUMNS)} FROM match_candidates"
_SELECT_MATCH = f"SELECT {', '.join(_MATCH_COLUMNS)} FROM track_match"

#: Written by the database, never by an insert.
_INSERTED_ATTEMPT = tuple(c for c in _ATTEMPT_COLUMNS if c != "id")
_INSERTED_CANDIDATE = tuple(c for c in _CANDIDATE_COLUMNS if c != "id")

_INSERT_ATTEMPT = (
    f"INSERT INTO match_attempts ({', '.join(_INSERTED_ATTEMPT)})"
    f" VALUES ({', '.join('?' for _ in _INSERTED_ATTEMPT)})"
)
_INSERT_CANDIDATE = (
    f"INSERT INTO match_candidates ({', '.join(_INSERTED_CANDIDATE)})"
    f" VALUES ({', '.join('?' for _ in _INSERTED_CANDIDATE)})"
)
#: Written from the candidate after every write, never from the model.
_WRITTEN_MATCH_COLUMNS = tuple(c for c in _MATCH_COLUMNS if c != "candidate_score")

_UPSERT_MATCH = (
    f"INSERT INTO track_match ({', '.join(_WRITTEN_MATCH_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _WRITTEN_MATCH_COLUMNS)})"
    " ON CONFLICT(track_id) DO UPDATE SET "
    + ", ".join(
        f"{c} = excluded.{c}" for c in _WRITTEN_MATCH_COLUMNS if c != "track_id"
    )
)

_SET_CANDIDATE_SCORE = (
    "UPDATE track_match SET candidate_score ="
    " (SELECT score FROM match_candidates WHERE id = track_match.candidate_id)"
    " WHERE track_id = ?"
)

_SAVEPOINT = "match_attempt"


class MatchRepository(IMatchRepository):
    """Persistence for match attempts, candidates and match states."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # -------------------------------------------------------------- attempts

    def add_attempt(
        self,
        track_id: int,
        job_id: Optional[str],
        result: TrackResult,
        track: Track,
        started_at: Optional[str] = None,
        finished_at: Optional[str] = None,
        matcher_version: Optional[str] = None,
    ) -> MatchAttempt:
        """Store one matcher result as an attempt with every candidate.

        Args:
            track_id: The library track the result is for.
            job_id: The job that ran the match, or ``None`` for a single one.
            result: What ``process_track`` returned.
            track: The track it was given (see ``match_record``).
            started_at: When the run began. Defaults to ``finished_at`` less
                the result's processing time.
            finished_at: When it ended. Defaults to now, in UTC.
            matcher_version: The engine version that ran the matcher. Defaults
                to this engine's, which is the one that just ran it.

        Returns:
            The stored attempt, with its id and its winner's candidate id.

        Raises:
            ValueError: If the result cannot be stored as it is — nothing is
                written.
            sqlite3.IntegrityError: If the track does not exist, or a row is
                refused. Nothing of the attempt is left behind.
        """
        record = attempt_from_result(result, track, matcher_version or __version__)
        finished = finished_at or datetime.now(tz=timezone.utc).isoformat()
        started = started_at or started_at_for(finished, result.processing_time)
        # Built before the first write, so a result the model refuses never
        # opens a savepoint.
        attempt = MatchAttempt(
            track_id=track_id,
            job_id=job_id,
            started_at=started,
            finished_at=finished,
            **record.attempt,
        )

        with self._db.transaction(join_existing=True) as conn:
            conn.execute(f"SAVEPOINT {_SAVEPOINT}")
            try:
                values = attempt.to_dict()
                cursor = conn.execute(
                    _INSERT_ATTEMPT, tuple(values[c] for c in _INSERTED_ATTEMPT)
                )
                attempt_id = int(cursor.lastrowid or 0)
                rows = [
                    MatchCandidate(attempt_id=attempt_id, **fields).to_dict()
                    for fields in record.candidates
                ]
                conn.executemany(
                    _INSERT_CANDIDATE,
                    [tuple(row[c] for c in _INSERTED_CANDIDATE) for row in rows],
                )
                winner = next((row["rank"] for row in rows if row["is_winner"]), None)
                if winner is not None:
                    conn.execute(
                        "UPDATE match_attempts SET best_candidate_id ="
                        " (SELECT id FROM match_candidates"
                        "  WHERE attempt_id = ? AND rank = ?)"
                        " WHERE id = ?",
                        (attempt_id, winner, attempt_id),
                    )
                stored = conn.execute(
                    f"{_SELECT_ATTEMPT} WHERE id = ?", (attempt_id,)
                ).fetchone()
            except BaseException:
                _undo_savepoint(conn)
                raise
            conn.execute(f"RELEASE {_SAVEPOINT}")
        return MatchAttempt.from_row(stored)

    def get_attempt(self, attempt_id: int) -> Optional[MatchAttempt]:
        """Return one attempt, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_ATTEMPT} WHERE id = ?", (int(attempt_id),))
            .fetchone()
        )
        return None if row is None else MatchAttempt.from_row(row)

    def attempts_for(self, track_id: int) -> List[MatchAttempt]:
        """Return a track's attempts, most recently stored first."""
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_ATTEMPT} WHERE track_id = ? ORDER BY id DESC",
                (int(track_id),),
            )
            .fetchall()
        )
        return [MatchAttempt.from_row(row) for row in rows]

    def latest_attempt(self, track_id: int) -> Optional[MatchAttempt]:
        """Return a track's most recently stored attempt, or ``None``."""
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_ATTEMPT} WHERE track_id = ? ORDER BY id DESC LIMIT 1",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else MatchAttempt.from_row(row)

    # ------------------------------------------------------------ candidates

    def candidates_for(self, attempt_id: int) -> List[MatchCandidate]:
        """Return an attempt's candidates in the order the matcher scored them."""
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_CANDIDATE} WHERE attempt_id = ? ORDER BY rank",
                (int(attempt_id),),
            )
            .fetchall()
        )
        return [MatchCandidate.from_row(row) for row in rows]

    def get_candidate(self, candidate_id: int) -> Optional[MatchCandidate]:
        """Return one candidate, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_CANDIDATE} WHERE id = ?", (int(candidate_id),))
            .fetchone()
        )
        return None if row is None else MatchCandidate.from_row(row)

    def winner_of(self, attempt_id: int) -> Optional[MatchCandidate]:
        """Return the candidate an attempt chose, or ``None`` when it chose none."""
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_CANDIDATE} WHERE id ="
                " (SELECT best_candidate_id FROM match_attempts WHERE id = ?)",
                (int(attempt_id),),
            )
            .fetchone()
        )
        return None if row is None else MatchCandidate.from_row(row)

    # ----------------------------------------------------------------- state

    def get_match(self, track_id: int) -> Optional[TrackMatch]:
        """Return a track's match state, or ``None`` when it was never matched."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_MATCH} WHERE track_id = ?", (int(track_id),))
            .fetchone()
        )
        return None if row is None else TrackMatch.from_row(row)

    def get_matches(self, track_ids: Iterable[int]) -> Dict[int, TrackMatch]:
        """Return the states of the tracks that have one, keyed by track id.

        Tracks never matched are absent, as a window of rows needs: one query
        per chunk rather than one per track.
        """
        wanted = unique_ids(track_ids)
        found: Dict[int, TrackMatch] = {}
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                f"{_SELECT_MATCH} WHERE track_id IN ({placeholders})", tuple(chunk)
            ):
                match = TrackMatch.from_row(row)
                found[match.track_id] = match
        return found

    def set_match(self, match: TrackMatch) -> TrackMatch:
        """Write a track's match state, replacing any it had, and return it.

        Raises:
            ValueError: If the state rests on evidence that is not the
                track's own (see the module docstring). Nothing is written.
        """
        values = match.to_dict()
        with self._db.transaction(join_existing=True) as conn:
            _check_evidence(conn, match)
            conn.execute(
                _UPSERT_MATCH, tuple(values[c] for c in _WRITTEN_MATCH_COLUMNS)
            )
            # The score the state points at, kept beside it so a sort or a
            # filter by it reads no candidate (migration 0019). Candidates never
            # change, so it can only change here.
            conn.execute(_SET_CANDIDATE_SCORE, (match.track_id,))
            row = conn.execute(
                f"{_SELECT_MATCH} WHERE track_id = ?", (match.track_id,)
            ).fetchone()
        return TrackMatch.from_row(row)

    def delete_match(self, track_id: int) -> bool:
        """Remove a track's state, making it "not matched" again.

        Only the state goes: every attempt stays (DEC-066). Returns whether a
        state was there.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM track_match WHERE track_id = ?", (int(track_id),)
            )
            return int(cursor.rowcount) > 0

    def latest_answered_attempt(self, track_id: int) -> Optional[MatchAttempt]:
        """Return a track's newest attempt that answered anything, or ``None``.

        Answered means CLEAN-03's rule: a match, or at least one candidate
        judged. An error or an empty result is what a failed search looks like,
        and a state derived from one would be a guess.
        """
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_ATTEMPT} WHERE track_id = ?"
                " AND (outcome = 'matched' OR (outcome = 'no_match' AND EXISTS"
                " (SELECT 1 FROM match_candidates AS c"
                " WHERE c.attempt_id = match_attempts.id)))"
                " ORDER BY id DESC LIMIT 1",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else MatchAttempt.from_row(row)

    def has_candidates(self, attempt_id: int) -> bool:
        """True when an attempt scored at least one candidate."""
        row = (
            self._db.connect()
            .execute(
                "SELECT EXISTS (SELECT 1 FROM match_candidates WHERE attempt_id = ?)",
                (int(attempt_id),),
            )
            .fetchone()
        )
        return bool(row[0])


# ------------------------------------------------------------------ helpers


def _undo_savepoint(conn: sqlite3.Connection) -> None:
    """Roll an attempt's rows back and close its savepoint.

    Failures here are swallowed so the error that caused the undo is the one
    the caller sees; a connection that cannot roll back is already broken, and
    the enclosing transaction's own rollback is the last word.
    """
    try:
        conn.execute(f"ROLLBACK TO {_SAVEPOINT}")
        conn.execute(f"RELEASE {_SAVEPOINT}")
    except sqlite3.Error:
        pass


def _attempt_owner(conn: sqlite3.Connection, attempt_id: int) -> Optional[int]:
    """Return the track an attempt belongs to, or ``None`` if it does not exist."""
    row = conn.execute(
        "SELECT track_id FROM match_attempts WHERE id = ?", (attempt_id,)
    ).fetchone()
    return None if row is None else int(row["track_id"])


def _check_evidence(conn: sqlite3.Connection, match: TrackMatch) -> None:
    """Refuse a state whose attempt, candidate or newer attempt is not the track's.

    Raises:
        ValueError: Naming the reference that does not fit.
    """
    owner = _attempt_owner(conn, match.attempt_id)
    if owner is None:
        raise ValueError(f"Attempt {match.attempt_id} does not exist")
    if owner != match.track_id:
        raise ValueError(
            f"Attempt {match.attempt_id} is track {owner}'s, not track"
            f" {match.track_id}'s"
        )

    if match.candidate_id is not None:
        row = conn.execute(
            "SELECT attempt_id FROM match_candidates WHERE id = ?",
            (match.candidate_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Candidate {match.candidate_id} does not exist")
        if int(row["attempt_id"]) != match.attempt_id:
            raise ValueError(
                f"Candidate {match.candidate_id} is from attempt"
                f" {row['attempt_id']}, not attempt {match.attempt_id}: a"
                " decision rests on the attempt its candidate came from"
            )

    if match.newer_attempt_id is not None:
        newer_owner = _attempt_owner(conn, match.newer_attempt_id)
        if newer_owner is None:
            raise ValueError(f"Attempt {match.newer_attempt_id} does not exist")
        if newer_owner != match.track_id:
            raise ValueError(
                f"Attempt {match.newer_attempt_id} is track {newer_owner}'s, not"
                f" track {match.track_id}'s"
            )
        if match.newer_attempt_id < match.attempt_id:
            raise ValueError(
                f"Attempt {match.newer_attempt_id} is older than attempt"
                f" {match.attempt_id}, so it cannot be the newer one"
            )


__all__: Sequence[str] = ("MatchRepository",)
