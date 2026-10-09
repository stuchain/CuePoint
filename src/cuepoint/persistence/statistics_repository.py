#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Statistics repository: all SQL for the plays the Statistics page answers (STATS-02).

Each method is one statement, or two where a display name needs its own scan: a
grouped read of the tracks in a scope, never a count per bucket, so the page costs
the same at 50,000 tracks whatever it is asked (Phase 15, fact 11).

The scope
---------
Every query takes a scope as a rule set and reads only the tracks it matches. It is
compiled by :func:`~cuepoint.persistence.track_query.build_select_scoped`, the
projection the Library's own browse and count are built from, so a Smart
Collection, a Collection or a playlist narrows these numbers exactly as it narrows
the table they open. An empty rule set is the whole library and adds no condition.

Where the plays come from
-------------------------
- **All time** is ``tracks.play_count``: Rekordbox's lifetime total. A missing
  count is unknown and never played is ``0`` (DEC-164).
- **Since a read** is the sum of every rise in a track's stored counts at that read
  and after it, each compared with the stored row before it (``play_counts`` only
  holds the rows where a count moved). The first row a
  track ever has is its baseline and rises from nothing, and a fall adds nothing,
  so "since" never goes below zero (DEC-137).

Artists and labels
------------------
An artist is a ``track_credits.name_key``, over artist and remixer credits, counted
once per ``(track, name_key)``: a track crediting B as artist and as remixer has two
credit rows for one name. Its name is the first spelling alphabetically across the
whole library, as ``library_artists`` shows it. A label is the effective
``label_key``, the override where there is one (DEC-068), named the way the
``label_name`` facet names it. Ties between artists or labels sort by key, which is
their name folded to one case, so the order is stable and reads alphabetically.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

from cuepoint.models.filter_rule import RuleSet
from cuepoint.persistence.track_query import BrowseQuery, build_select_scoped
from cuepoint.services.interfaces import IDatabaseService, IStatisticsRepository


@dataclass(frozen=True)
class PlayedTrack:
    """One track and the plays counted for it."""

    id: int
    title: str
    artist: str
    plays: int


@dataclass(frozen=True)
class PlayedName:
    """One artist or label and the plays counted for it.

    Attributes:
        key: The identity plays were grouped by (a ``name_key`` or ``label_key``).
        name: The first spelling of it alphabetically.
        plays: The plays of its tracks.
        tracks: How many of its tracks had at least one play.
    """

    key: str
    name: str
    plays: int
    tracks: int


#: Plays of the scope's tracks, all time: the library's own count.
_ALL_TIME = (
    "plays AS (SELECT tracks.id AS track_id, tracks.play_count AS plays FROM tracks"
    " WHERE tracks.play_count > 0{scoped})"
)

#: Plays of the scope's tracks since a read: the rises at it and after it. Each row
#: in the window is compared with the track's row before it by its primary key, so
#: the cost follows the window and not the history behind it. The first row a track
#: ever has compares with nothing and adds nothing.
_SINCE = (
    "rises AS (SELECT p.track_id AS track_id, p.play_count -"
    " (SELECT q.play_count FROM play_counts q WHERE q.track_id = p.track_id"
    " AND q.read_id < p.read_id ORDER BY q.read_id DESC LIMIT 1) AS rise"
    " FROM play_counts p WHERE p.read_id >= ?{scoped}),"
    " plays AS (SELECT track_id, SUM(rise) AS plays FROM rises"
    " WHERE rise > 0 GROUP BY track_id)"
)

_SCOPED = " AND tracks.id IN (SELECT id FROM scoped)"
_SCOPED_HISTORY = " AND p.track_id IN (SELECT id FROM scoped)"


class StatisticsRepository(IStatisticsRepository):
    """Reads the library's plays, grouped."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def reads(self) -> List[Tuple[int, str]]:
        """Every read as ``(id, read_at)``, oldest first."""
        rows = self._db.connect().execute(
            "SELECT id, read_at FROM library_reads ORDER BY id"
        )
        return [(int(row[0]), str(row[1])) for row in rows]

    def top_tracks(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedTrack]:
        """The ``limit`` most played tracks, ties by title and then id."""
        sql, params = self._statement(
            scope,
            from_read,
            "SELECT t.id, COALESCE(t.title, ''), COALESCE(t.artist, ''), p.plays"
            " FROM plays p JOIN tracks t ON t.id = p.track_id"
            " ORDER BY p.plays DESC, COALESCE(t.title, '') COLLATE NOCASE ASC,"
            " t.id ASC LIMIT ?",
            limit,
        )
        rows = self._db.connect().execute(sql, params)
        return [PlayedTrack(int(r[0]), str(r[1]), str(r[2]), int(r[3])) for r in rows]

    def top_artists(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedName]:
        """The ``limit`` artists with the most plays, over artist and remixer credits."""
        # `track_credits.role` is `artist` or `remixer`, so every credit counts;
        # DISTINCT is what makes a track credited twice to one name count once.
        sql, params = self._statement(
            scope,
            from_read,
            "credited AS (SELECT DISTINCT c.track_id, c.name_key FROM track_credits c"
            " WHERE c.track_id IN (SELECT track_id FROM plays)),"
            " ranked AS (SELECT cr.name_key AS name_key, SUM(p.plays) AS plays,"
            " COUNT(*) AS tracks FROM credited cr"
            " JOIN plays p ON p.track_id = cr.track_id"
            " GROUP BY cr.name_key ORDER BY plays DESC, cr.name_key ASC LIMIT ?)"
            " SELECT r.name_key,"
            " (SELECT min(name) FROM track_credits WHERE name_key = r.name_key),"
            " r.plays, r.tracks FROM ranked r"
            " ORDER BY r.plays DESC, r.name_key ASC",
            limit,
            tail_ctes=True,
        )
        return self._names(sql, params)

    def top_labels(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedName]:
        """The ``limit`` labels with the most plays, by effective label key."""
        effective_key = "COALESCE(m.label_key, t.label_key)"
        sql, params = self._statement(
            scope,
            from_read,
            "ranked AS (SELECT lk.label_key AS label_key, SUM(lk.plays) AS plays,"
            " COUNT(*) AS tracks FROM ("
            f"SELECT {effective_key} AS label_key, p.plays AS plays FROM plays p"
            " JOIN tracks t ON t.id = p.track_id"
            " LEFT JOIN track_metadata m ON m.track_id = t.id) lk"
            " WHERE lk.label_key IS NOT NULL"
            " GROUP BY lk.label_key ORDER BY plays DESC, lk.label_key ASC LIMIT ?),"
            f" named AS (SELECT {effective_key} AS label_key,"
            " min(CASE WHEN m.label_key IS NOT NULL THEN m.label ELSE t.label END)"
            " AS name FROM tracks t LEFT JOIN track_metadata m ON m.track_id = t.id"
            f" WHERE {effective_key} IN (SELECT label_key FROM ranked) GROUP BY 1)"
            " SELECT r.label_key, n.name, r.plays, r.tracks FROM ranked r"
            " JOIN named n ON n.label_key = r.label_key"
            " ORDER BY r.plays DESC, r.label_key ASC",
            limit,
            tail_ctes=True,
        )
        return self._names(sql, params)

    def unplayed(self, scope: RuleSet) -> Tuple[int, int]:
        """``(never played, unknown)`` among the scope's tracks."""
        sql, params = self._scope(scope)
        prefix = f"WITH scoped AS ({sql}) " if sql else ""
        where = " WHERE tracks.id IN (SELECT id FROM scoped)" if sql else ""
        row = (
            self._db.connect()
            .execute(
                f"{prefix}SELECT COALESCE(SUM(play_count = 0), 0),"
                f" COALESCE(SUM(play_count IS NULL), 0) FROM tracks{where}",
                params,
            )
            .fetchone()
        )
        return int(row[0]), int(row[1])

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _scope(scope: RuleSet) -> Tuple[str, Tuple[object, ...]]:
        """The scope's track ids as a statement, or nothing for the whole library."""
        if not scope:
            return "", ()
        return build_select_scoped(BrowseQuery(rules=scope), "tracks.id")

    def _statement(
        self,
        scope: RuleSet,
        from_read: Optional[int],
        select: str,
        limit: int,
        *,
        tail_ctes: bool = False,
    ) -> Tuple[str, Tuple[object, ...]]:
        """Assemble ``WITH scoped, plays <select>`` and its parameters in order.

        ``select`` is either a final ``SELECT`` over ``plays`` or, with
        ``tail_ctes``, further CTEs ending in one. Parameters bind in the order
        they appear: the scope's, then the window's read, then the limit.
        """
        scope_sql, params = self._scope(scope)
        ctes = []
        if scope_sql:
            ctes.append(f"scoped AS ({scope_sql})")
        if from_read is None:
            ctes.append(_ALL_TIME.format(scoped=_SCOPED if scope_sql else ""))
        else:
            ctes.append(_SINCE.format(scoped=_SCOPED_HISTORY if scope_sql else ""))
            params = (*params, int(from_read))
        joiner = ", " if tail_ctes else " "
        return f"WITH {', '.join(ctes)}{joiner}{select}", (*params, int(limit))

    def _names(self, sql: str, params: Tuple[object, ...]) -> List[PlayedName]:
        rows = self._db.connect().execute(sql, params)
        return [
            PlayedName(str(r[0]), str(r[1]).strip(), int(r[2]), int(r[3])) for r in rows
        ]
