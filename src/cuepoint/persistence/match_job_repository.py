#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for a match job's plan: what it covers and how far it got (CLEAN-03).

A match over a whole library is hours of Beatport time (cross-cutting fact 6),
so DEC-065 makes it resumable, and this module is what that rests on: the plan
is written once, a row is flagged as each track finishes, and a resume is a
query rather than a checkpoint file.

"Answered" is narrower than "attempted"
---------------------------------------
A match that is not a re-match leaves out tracks already settled, so as not to
spend forty-five seconds on a question already answered. A track is settled
when a user decided it, or when an attempt *answered* it: found a match, or
scored candidates and chose none. Two kinds of attempt answer nothing:

- **An error.** It says the run failed, not what Beatport holds (DEC-067 makes
  the same point about state).
- **A no-match that scored no candidates at all.** The matcher turns a failed
  search into an empty result rather than an error, so a run during a network
  outage looks exactly like this. A real search for a real title returns
  *something* — live, invented titles still drew forty candidates (CLEAN-02) —
  and asking again costs a few empty queries, not a track's candidate fetches.

Keeping those two in means an outage or a crash costs a re-run, never a track
silently left unmatched for good.

A resume takes the remaining tracks over
----------------------------------------
:meth:`MatchJobRepository.take_over` moves an interrupted job's waiting rows to
the job resuming it, in one transaction, keeping their positions. It leaves out
a track answered since the original plan was written — an attempt id above the
plan's watermark — and, unless the job was a re-match, a track a user decided
since. The original keeps the rows it finished, which is its record, and loses
the ones it did not, so it is not offered for resumption twice.

Transactions join a caller's, as everywhere here: a track's attempt and its
``done`` flag commit together or not at all.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from typing import Iterable, List, Optional, Sequence, Set, Tuple

from cuepoint.models.match_attempt import MatchJobTrack, MatchPlan, ResumableMatch
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, IMatchJobRepository

_PLAN_COLUMNS = tuple(field.name for field in dataclasses.fields(MatchPlan))

_SELECT_PLAN = f"SELECT {', '.join(_PLAN_COLUMNS)} FROM match_jobs"

_INSERT_PLAN = (
    f"INSERT INTO match_jobs ({', '.join(_PLAN_COLUMNS)})"
    f" VALUES ({', '.join('?' for _ in _PLAN_COLUMNS)})"
)

_INSERT_ROW = (
    "INSERT INTO match_job_tracks (job_id, position, track_id, done)"
    " VALUES (?, ?, ?, 0)"
)

#: A track an attempt has answered: a match, or candidates judged and refused.
#: ``{newer}`` narrows it to attempts stored after a watermark.
_ANSWERED = (
    "EXISTS (SELECT 1 FROM match_attempts AS a"
    " WHERE a.track_id = tracks.id{newer}"
    " AND (a.outcome = 'matched'"
    " OR (a.outcome = 'no_match'"
    " AND EXISTS (SELECT 1 FROM match_candidates AS c WHERE c.attempt_id = a.id))))"
)

#: A track a user has decided, which only a re-match asks about again.
_DECIDED = (
    "EXISTS (SELECT 1 FROM track_match AS m"
    " WHERE m.track_id = tracks.id AND m.decided_by = 'user')"
)

#: Plans with rows still waiting, newest first. ``rowid`` is insertion order,
#: which is the order plans were written in regardless of any clock.
_RESUMABLE = (
    f"SELECT {', '.join('p.' + c for c in _PLAN_COLUMNS)},"
    " SUM(CASE WHEN t.done = 0 THEN 1 ELSE 0 END) AS remaining"
    " FROM match_jobs AS p JOIN match_job_tracks AS t ON t.job_id = p.job_id"
    "{where}"
    " GROUP BY p.job_id HAVING remaining > 0 ORDER BY p.rowid DESC"
)


class MatchJobRepository(IMatchJobRepository):
    """Persistence for match job plans and their progress."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------ resolving

    def existing(self, track_ids: Iterable[int]) -> List[int]:
        """Return the ids that are library tracks, once each, in the order given.

        An id selection names what the renderer showed a moment ago, and a
        refresh may have deleted some of it since; a plan covers tracks that
        are there.
        """
        wanted = unique_ids(track_ids)
        found: Set[int] = set()
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            found.update(
                int(row["id"])
                for row in connection.execute(
                    f"SELECT id FROM tracks WHERE id IN ({placeholders})", chunk
                )
            )
        return [track_id for track_id in wanted if track_id in found]

    def settled(self, track_ids: Iterable[int]) -> Set[int]:
        """Return the tracks a match that is not a re-match leaves out.

        Those a user decided, and those an attempt answered (see the module
        docstring for why an error or an empty result is not an answer).
        """
        return _settled(
            self._db.connect(),
            unique_ids(track_ids),
            newer_than=None,
            include_decided=True,
        )

    # -------------------------------------------------------------- writing

    def create(
        self,
        job_id: str,
        track_ids: Sequence[int],
        *,
        rematch: bool,
        selected: int,
        created_at: str,
    ) -> MatchPlan:
        """Write a job's plan: its options and one row per track, in order.

        Args:
            job_id: The job the plan is for.
            track_ids: The tracks to match, in the order to match them.
            rematch: Whether settled tracks were kept in.
            selected: How many tracks the selection named; the difference from
                ``len(track_ids)`` is what was left out.
            created_at: When the plan is written.

        Raises:
            ValueError: If the plan is empty, names a track twice, holds more
                tracks than were selected, or the job already has a plan.
                Nothing is written.
        """
        ids = [int(track_id) for track_id in track_ids]
        if not ids:
            raise ValueError("A match plan needs at least one track")
        if len(set(ids)) != len(ids):
            raise ValueError("A match plan names each track once")
        if selected < len(ids):
            raise ValueError(
                f"A match plan cannot hold {len(ids)} tracks from a selection of"
                f" {selected}"
            )

        with self._db.transaction(join_existing=True) as conn:
            plan = MatchPlan(
                job_id=job_id,
                rematch=rematch,
                selected=selected,
                excluded=selected - len(ids),
                attempt_watermark=_attempt_watermark(conn),
                created_at=created_at,
            )
            _insert_plan(conn, plan, list(enumerate(ids)))
        return plan

    def take_over(self, from_job_id: str, job_id: str, created_at: str) -> MatchPlan:
        """Move an interrupted job's waiting tracks to the job resuming it.

        Returns:
            The new job's plan. It may hold no tracks, when every one left was
            answered since — the job then has nothing to do, which is true.

        Raises:
            LookupError: If ``from_job_id`` has no plan.
            ValueError: If it has nothing left, or ``job_id`` already has a
                plan. Nothing is written.
        """
        with self._db.transaction(join_existing=True) as conn:
            original = _get_plan(conn, from_job_id)
            if original is None:
                raise LookupError(f"No match job {from_job_id}")
            waiting: List[Tuple[int, int]] = [
                (int(row["position"]), int(row["track_id"]))
                for row in conn.execute(
                    "SELECT position, track_id FROM match_job_tracks"
                    " WHERE job_id = ? AND done = 0 ORDER BY position",
                    (from_job_id,),
                )
            ]
            if not waiting:
                raise ValueError(f"Match job {from_job_id} has nothing left to resume")

            answered = _settled(
                conn,
                unique_ids(track_id for _, track_id in waiting),
                newer_than=original.attempt_watermark,
                include_decided=not original.rematch,
            )
            kept = [(pos, tid) for pos, tid in waiting if tid not in answered]
            plan = MatchPlan(
                job_id=job_id,
                rematch=original.rematch,
                selected=len(waiting),
                excluded=len(waiting) - len(kept),
                attempt_watermark=original.attempt_watermark,
                created_at=created_at,
                resumed_from=from_job_id,
            )
            _insert_plan(conn, plan, kept)
            conn.execute(
                "DELETE FROM match_job_tracks WHERE job_id = ? AND done = 0",
                (from_job_id,),
            )
        return plan

    def mark_done(self, job_id: str, position: int) -> None:
        """Flag one waiting track finished.

        Raises:
            ValueError: If that position is not waiting — it does not exist, or
                is already done. Finishing a track twice is how a job would
                match it twice, so it is refused rather than ignored.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE match_job_tracks SET done = 1"
                " WHERE job_id = ? AND position = ? AND done = 0",
                (job_id, int(position)),
            )
            if cursor.rowcount != 1:
                raise ValueError(
                    f"Position {position} of match job {job_id} is not waiting"
                )

    def mark_waiting(self, job_id: str, positions: Iterable[int]) -> int:
        """Put finished tracks back in the queue; returns how many moved.

        Used once, when a job stops because searches came back empty: those
        tracks were asked during what looks like an outage, and a resume should
        ask them again. Their attempts stay stored (DEC-066).
        """
        wanted = unique_ids(positions)
        moved = 0
        with self._db.transaction(join_existing=True) as conn:
            for chunk in chunked(wanted, CHUNK_SIZE):
                placeholders = ", ".join("?" for _ in chunk)
                cursor = conn.execute(
                    "UPDATE match_job_tracks SET done = 0"
                    f" WHERE job_id = ? AND done = 1 AND position IN ({placeholders})",
                    (job_id, *chunk),
                )
                moved += int(cursor.rowcount)
        return moved

    # -------------------------------------------------------------- reading

    def get(self, job_id: str) -> Optional[MatchPlan]:
        """Return a job's plan, or ``None``."""
        return _get_plan(self._db.connect(), job_id)

    def waiting(self, job_id: str) -> List[MatchJobTrack]:
        """Return a job's tracks not yet done, in plan order."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT job_id, position, track_id, done FROM match_job_tracks"
                " WHERE job_id = ? AND done = 0 ORDER BY position",
                (job_id,),
            )
            .fetchall()
        )
        return [MatchJobTrack.from_row(row) for row in rows]

    def progress(self, job_id: str) -> Tuple[int, int]:
        """Return ``(tracks in the plan, tracks done)`` for a job."""
        row = (
            self._db.connect()
            .execute(
                "SELECT COUNT(*) AS planned, COALESCE(SUM(done), 0) AS done"
                " FROM match_job_tracks WHERE job_id = ?",
                (job_id,),
            )
            .fetchone()
        )
        return int(row["planned"]), int(row["done"])

    def resumable(self) -> List[ResumableMatch]:
        """Return every job with tracks still waiting, newest first."""
        rows = self._db.connect().execute(_RESUMABLE.format(where="")).fetchall()
        return [_resumable(row) for row in rows]

    def interrupted(self, job_type: str) -> List[ResumableMatch]:
        """Return resumable jobs whose job record still says they are running.

        Asked once, as the engine starts and before stale records are closed
        out: a record still running then belongs to a process that is gone, so
        these are exactly the jobs a restart interrupted.
        """
        where = (
            " WHERE EXISTS (SELECT 1 FROM jobs AS j WHERE j.id = p.job_id"
            " AND j.type = ? AND j.state IN ('queued', 'running'))"
        )
        rows = (
            self._db.connect()
            .execute(_RESUMABLE.format(where=where), (job_type,))
            .fetchall()
        )
        return [_resumable(row) for row in rows]


# ------------------------------------------------------------------ helpers


def _attempt_watermark(conn: sqlite3.Connection) -> int:
    """Return the highest attempt id stored so far, or 0."""
    row = conn.execute("SELECT COALESCE(MAX(id), 0) FROM match_attempts").fetchone()
    return int(row[0])


def _get_plan(conn: sqlite3.Connection, job_id: str) -> Optional[MatchPlan]:
    row = conn.execute(f"{_SELECT_PLAN} WHERE job_id = ?", (job_id,)).fetchone()
    return None if row is None else MatchPlan.from_row(row)


def _insert_plan(
    conn: sqlite3.Connection, plan: MatchPlan, rows: Sequence[Tuple[int, int]]
) -> None:
    """Insert a plan and its rows, refusing a job that already has one."""
    values = plan.to_dict()
    try:
        conn.execute(_INSERT_PLAN, tuple(values[c] for c in _PLAN_COLUMNS))
    except sqlite3.IntegrityError:
        raise ValueError(f"Match job {plan.job_id} already has a plan") from None
    conn.executemany(
        _INSERT_ROW, [(plan.job_id, position, track_id) for position, track_id in rows]
    )


def _settled(
    conn: sqlite3.Connection,
    track_ids: Sequence[int],
    *,
    newer_than: Optional[int],
    include_decided: bool,
) -> Set[int]:
    """Return the tracks answered (after ``newer_than``) or, optionally, decided."""
    newer = "" if newer_than is None else " AND a.id > ?"
    answered = _ANSWERED.format(newer=newer)
    predicate = f"({answered} OR {_DECIDED})" if include_decided else answered
    found: Set[int] = set()
    for chunk in chunked(list(track_ids), CHUNK_SIZE):
        placeholders = ", ".join("?" for _ in chunk)
        params: Tuple[object, ...] = tuple(chunk)
        if newer_than is not None:
            params = (int(newer_than), *chunk)
        found.update(
            int(row["id"])
            for row in conn.execute(
                f"SELECT tracks.id AS id FROM tracks WHERE {predicate}"
                f" AND tracks.id IN ({placeholders})",
                params,
            )
        )
    return found


def _resumable(row: sqlite3.Row) -> ResumableMatch:
    return ResumableMatch(plan=MatchPlan.from_row(row), remaining=int(row["remaining"]))


__all__: Sequence[str] = ("MatchJobRepository",)
