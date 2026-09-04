#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The index behind the library browse query (LIBUI-01, DEC-040).

Phase 3 indexed the two lookups an import needs — TrackID and normalized path —
because nothing else read the table in bulk. Phase 4 reads it constantly: every
scroll of the Library table is a scoped, sorted, paged query, and the default
one runs on every visit to the page.

What this index is for
----------------------
It serves the default order, artist then title. It carries ``id`` as a third
column so the tiebreak every browse ordering ends with (see ``track_query.py``)
is satisfied by the index rather than by a sort, and it declares
``COLLATE NOCASE`` because an index's collation must match the query's or
SQLite ignores it — silently, still returning the right rows, just by reading
and sorting all of them.

Measured at 50,000 tracks (``scripts/bench_library.py``), it is the difference
between a Library page that opens instantly and one that does not:

===========================  ===========  ==============
first page of the default    with index   without index
order
===========================  ===========  ==============
opening the page                1.4 ms       16.2 ms
scrolling to the end            5.3 ms      717.3 ms
===========================  ===========  ==============

The deep page is the number that settles it. ``LIMIT ? OFFSET ?`` gets slower
the further it reaches when SQLite has to sort the whole table to find the
window; served from the index it does not.

Why only one index
------------------
The step specification also proposed single-column indexes on ``bpm``, ``key``,
``genre``, ``year``, ``rating`` and ``date_added``. They were built, measured,
and removed: every sort other than the default falls back to artist and title
before the row id (a group of equal BPMs should read like the library does, not
scatter at random), and a single-column index cannot serve that ordering. They
changed no measured time by more than noise, while costing about 10% of import
time and 30% of the database file.

LIBUI-02 adds filters and facet counts, which are the queries such indexes
would actually serve. They belong to that step, measured against the queries
that need them, rather than being added here on the strength of a guess.
"""

from __future__ import annotations

VERSION = 7

DESCRIPTION = "browse index for the library table"

SQL = """
CREATE INDEX idx_tracks_artist_title
    ON tracks (artist COLLATE NOCASE, title COLLATE NOCASE, id);
"""
