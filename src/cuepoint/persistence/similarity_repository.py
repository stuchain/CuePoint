#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for Similar Tracks (DISCOVER-08, DEC-096).

Similar Tracks scores in Python (``core.similarity``), so this module only
reads: a seed's effective values, the candidates a pre-selection lets through,
and the few facts the service needs around them. Nothing here writes, which
DEC-096's "offline, from the library" and the phase's acceptance point 10 both
require; a test holds it to that.

Every value is the one a user sees
----------------------------------
BPM, key, genre and label are read through the rule vocabulary's own
expressions (``field_spec(...).expression``), so a track whose BPM a user
corrected is compared at the corrected BPM (DEC-068), exactly as the Library's
filter for it would find it. Artists are DISCOVER-03's credit index, the one
``artist_name`` reads, through the SQL its owner, ``track_credit_repository``,
exports: this module runs none of its own against that table.

A scope is the Library's
------------------------
Candidates are read by ``track_query.build_select_scoped`` over a
``BrowseQuery``: a Collection, a playlist, a rule set or a text query narrows
them exactly as it narrows the table, and its tag and Collection references are
checked the way every browse checks them (``check_rule_references``).
"""

from __future__ import annotations

import json
import sqlite3
from typing import Iterator, List, Optional, Sequence, Set, Tuple

from cuepoint.models.filter_rule import (
    DUPLICATE_SIGNALS_VIEW,
    METADATA_ALIAS,
    field_spec,
)
from cuepoint.models.similar_tracks import TraitRow
from cuepoint.persistence.rule_references import check_rule_references
from cuepoint.persistence.track_credit_repository import (
    CREDIT_KEY_SEPARATOR,
    credit_keys_sql,
    credited_among,
    crediting_any_sql,
)
from cuepoint.persistence.track_query import BrowseQuery, build_select_scoped
from cuepoint.services.interfaces import IDatabaseService, ISimilarityRepository

#: The fields a pre-selection may ask for the spellings of.
SPELLED_FIELDS = ("genre", "label", "key")

_BPM = field_spec("bpm").expression
_KEY = field_spec("key").expression
_GENRE = field_spec("genre").expression
_LABEL = field_spec("label").expression

#: A track's effective values, in :class:`TraitRow` order without its credits.
_VALUES = (
    f"tracks.id AS track_id, {_BPM} AS bpm, {_KEY} AS key, {_GENRE} AS genre,"
    f" {_LABEL} AS label"
)

#: The seed's values with every credit. One row, so a subquery per row costs
#: nothing; a candidate's credits are read another way (see ``candidates``).
_TRAITS = f"{_VALUES}, {credit_keys_sql('tracks.id')} AS artist_keys"

_JOINS = (METADATA_ALIAS,)


def _row(row: sqlite3.Row) -> TraitRow:
    keys = row["artist_keys"]
    return TraitRow(
        track_id=int(row["track_id"]),
        bpm=row["bpm"],
        key=row["key"],
        genre=row["genre"],
        label=row["label"],
        artist_keys=tuple(keys.split(CREDIT_KEY_SEPARATOR)) if keys else (),
    )


def _json(values: Sequence[object]) -> str:
    """``values`` as the JSON array a ``json_each`` parameter reads."""
    return json.dumps(list(values))


def _in_json(expression: str) -> str:
    """``expression IN`` the values of one JSON-array parameter."""
    return f"{expression} IN (SELECT value FROM json_each(?))"


def _preselection(
    tempo_ranges: Sequence[Tuple[float, float]],
    genres: Sequence[str],
    labels: Sequence[str],
    keys: Sequence[str],
    artist_keys: Sequence[str],
) -> Tuple[str, Tuple[object, ...]]:
    """The condition a candidate meets by meeting any one criterion given.

    Empty when no criterion is: a seed that offers nothing pre-selects nothing.
    """
    terms: List[str] = []
    params: List[object] = []
    for low, high in tempo_ranges:
        terms.append(f"{_BPM} BETWEEN ? AND ?")
        params.extend((float(low), float(high)))
    for expression, spellings in ((_GENRE, genres), (_LABEL, labels), (_KEY, keys)):
        if spellings:
            terms.append(_in_json(expression))
            params.append(_json(sorted(set(spellings))))
    if artist_keys:
        terms.append(f"tracks.id IN ({crediting_any_sql()})")
        params.append(_json(sorted(set(artist_keys))))
    return " OR ".join(terms), tuple(params)


class SimilarityRepository(ISimilarityRepository):
    """Reads for Similar Tracks: seeds, candidates, spellings and duplicates."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def seed(self, track_id: int) -> Optional[TraitRow]:
        """A track's effective values, or None when there is no such track."""
        sql, params = build_select_scoped(
            BrowseQuery(),
            _TRAITS,
            condition="tracks.id = ?",
            params=(int(track_id),),
            joins=_JOINS,
        )
        row = self._db.connect().execute(sql, params).fetchone()
        return None if row is None else _row(row)

    def check_scope(self, scope: BrowseQuery) -> BrowseQuery:
        """A scope validated, with its tag and Collection references checked.

        Raises:
            BrowseQueryError, FilterRuleError, BrokenRuleError: As a browse of
                the same query would.
        """
        valid = scope.validated()
        check_rule_references(self._db.connect(), valid.rules)
        return valid

    def candidates(
        self,
        scope: BrowseQuery,
        *,
        tempo_ranges: Sequence[Tuple[float, float]] = (),
        genres: Sequence[str] = (),
        labels: Sequence[str] = (),
        keys: Sequence[str] = (),
        artist_keys: Sequence[str] = (),
        credits_among: Sequence[str] = (),
        exclude: Sequence[int] = (),
    ) -> Iterator[TraitRow]:
        """The tracks in ``scope`` meeting any criterion given, but none in ``exclude``.

        A track qualifies with an effective BPM in any of ``tempo_ranges``
        (inclusive), or an effective genre, label or key spelled as one of
        ``genres``, ``labels`` or ``keys``, or a credit whose name key is one
        of ``artist_keys``. With no criterion, no track does, and nothing is
        read; the scope is still checked, so a broken one is refused either way.

        Each row's ``artist_keys`` holds only the keys among ``credits_among``
        that the track credits: the seed's artists, for Similar Tracks, whose
        rule reads nothing of a candidate's artists but the ones it shares.
        They are read once, through the credit index's name index, rather than
        by a subquery per row, which doubled the read of a dense tempo band.

        Streamed, in no particular order: the caller scores every row and
        orders what it keeps.

        Raises:
            As :meth:`check_scope`.
        """
        valid = self.check_scope(scope)
        condition, params = _preselection(
            tempo_ranges, genres, labels, keys, artist_keys
        )
        if not condition:
            return iter(())
        sql, bound = build_select_scoped(
            valid,
            _VALUES,
            condition=f"({condition}) AND NOT {_in_json('tracks.id')}",
            params=(*params, _json(sorted(set(int(i) for i in exclude)))),
            joins=_JOINS,
        )
        credited = credited_among(self._db.connect(), credits_among)
        cursor = self._db.connect().cursor()
        # Plain tuples: a dense band is tens of thousands of rows, each read
        # once by position, and a named row costs more than it gives here.
        cursor.row_factory = None
        cursor.execute(sql, bound)
        return (
            TraitRow(track_id, bpm, key, genre, label, credited.get(track_id, ()))
            for track_id, bpm, key, genre, label in cursor
        )

    def spellings(self, field: str) -> List[str]:
        """Every effective value a field takes in the library, each once.

        What lets a pre-selection by genre, label or key be exact: the service
        keeps the spellings whose name key or parsed key it wants, and the
        candidates are read by those spellings, which an index-free scan
        compares as text.
        """
        if field not in SPELLED_FIELDS:
            raise ValueError(f"{field!r} is not a field a pre-selection spells")
        expression = field_spec(field).expression
        rows = (
            self._db.connect()
            .execute(
                f"SELECT DISTINCT {expression} AS value FROM tracks"
                f" LEFT JOIN track_metadata AS {METADATA_ALIAS}"
                f" ON {METADATA_ALIAS}.track_id = tracks.id"
                f" WHERE {expression} IS NOT NULL"
            )
            .fetchall()
        )
        return sorted(str(row["value"]) for row in rows)

    def duplicates_of(self, track_id: int) -> Set[int]:
        """Every other track in a duplicate group shown with this one (DEC-074).

        Read from the view the Duplicates list and the ``in_duplicate_group``
        filter read, so a group the user dismissed does not count: they said
        those tracks are not the same recording.
        """
        rows = (
            self._db.connect()
            .execute(
                f"SELECT DISTINCT track_id FROM {DUPLICATE_SIGNALS_VIEW}"
                f" WHERE group_id IN (SELECT group_id FROM {DUPLICATE_SIGNALS_VIEW}"
                " WHERE track_id = ?) AND track_id <> ?",
                (int(track_id), int(track_id)),
            )
            .fetchall()
        )
        return {int(row["track_id"]) for row in rows}


__all__: Tuple[str, ...] = ("SPELLED_FIELDS", "SimilarityRepository")
