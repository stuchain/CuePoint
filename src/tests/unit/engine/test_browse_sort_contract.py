#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Library table's sortable columns must be sorts the engine accepts.

A column header in the desktop app is not a rendering instruction: clicking it
sends its ``sortKey`` to ``/api/v1/library/search``, and the engine answers only
for the names in ``SORTABLE_COLUMNS`` — anything else is a rejected request
(LIBUI-01, DEC-040). The two lists live in different languages, in different
directories, and nothing imports one from the other, so they can drift silently:
a typo in a new column, or a sort renamed on the engine side, ships a header
that produces an error instead of an ordering.

This is the same class of coupling as ``desktopContract.test.ts`` on the
renderer side, which checks that a feature crossing the engine boundary moved
every file it has to. That test cannot reach into ``src/cuepoint`` — Vite only
allows the renderer and ``../electron`` — so the Python suite is where this pair
can be compared, and here it is.

The columns are read as text rather than executed: a ``.tsx`` file cannot be
imported from Python, and the declaration is a literal list either way.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from cuepoint.persistence.track_query import (
    COLLECTION_POSITION,
    PLAYLIST_POSITION,
    SORTABLE_COLUMNS,
)

# src/tests/unit/engine -> 4 levels up is the repository root
_REPO_ROOT = Path(__file__).resolve().parents[4]
_COLUMNS = (
    _REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "library"
    / "libraryColumns.tsx"
)

_SORT_KEY = re.compile(r'sortKey:\s*"([a-z_]+)"')
_COLUMN_ID = re.compile(r'\bid:\s*"([a-z_]+)"')


def _column_sort_keys() -> set[str]:
    return set(_SORT_KEY.findall(_COLUMNS.read_text(encoding="utf-8")))


@pytest.mark.unit
class TestBrowseSortContract:
    def test_the_columns_file_is_where_this_test_thinks_it_is(self):
        """A moved or renamed file must fail loudly, not pass vacuously.

        Every other assertion here reads that file; if it silently found
        nothing, they would all pass while checking nothing at all.
        """
        assert _COLUMNS.is_file(), f"missing renderer columns: {_COLUMNS}"
        assert _COLUMN_ID.search(_COLUMNS.read_text(encoding="utf-8")), (
            "no column declarations found — the declaration format changed"
        )

    def test_every_column_sorts_by_something_the_engine_offers(self):
        unknown = sorted(_column_sort_keys() - set(SORTABLE_COLUMNS))

        assert not unknown, (
            f"libraryColumns.tsx offers sorts the engine rejects: {unknown}. "
            f"Add them to _PRIMARY in cuepoint/persistence/track_query.py or "
            f"drop the sortKey — a column with no sortKey simply cannot be "
            f"sorted by, which is the intended way to say so."
        )

    def test_the_engine_offers_no_sort_the_table_hides(self):
        """The other direction: a sort nobody can reach is a sort nobody has.

        The two position sorts are the deliberate exceptions. Neither is a
        column: one is the order a playlist opens in (DEC-044) and the other
        the order a Collection was arranged in (ORG-08, DEC-058), both chosen
        by the scope rather than by a header, and outside that scope neither
        means anything — the engine refuses them there rather than falling back.

        This is also what stops the pair passing vacuously. If the declaration
        format changed and the pattern above matched nothing, the test before
        this one would compare an empty set and be satisfied; this one would
        report every sort as unreachable. Mutation testing confirmed it.
        """
        unreachable = sorted(set(SORTABLE_COLUMNS) - _column_sort_keys())

        assert unreachable == sorted([COLLECTION_POSITION, PLAYLIST_POSITION]), (
            f"the engine sorts by {unreachable} and the table offers no column "
            f"for it. Either add the column, or say here why it is not one."
        )
