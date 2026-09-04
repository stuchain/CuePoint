#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Indexes for filter facets (LIBUI-02, DEC-043).

LIBUI-01 removed six single-column indexes because nothing measured used them:
every browse ordering falls back to artist and title, which a one-column index
cannot serve. It also said the queries such indexes would actually serve arrive
with the filters, and that they should be added here, against a query that
needs them. This is that migration.

A facet groups the whole library by one column — "which genres do I have, and
how many tracks each" — and it runs every time the filter bar redraws its
choices. Measured at 50,000 tracks:

=========================  ==========  ============
facet on ``genre``         no index    with index
=========================  ==========  ============
the values and counts        36.7 ms       7.4 ms
how many values exist        32.8 ms       3.8 ms
=========================  ==========  ============

The collation is the whole trick, and it is easy to get silently wrong. The
facet groups by ``genre COLLATE NOCASE``, because ``House`` and ``house`` are
one genre; SQLite will only use an index whose collation matches, so an index
declared without ``COLLATE NOCASE`` is read past and the query sorts the
library anyway — 25 ms instead of 7, with nothing to say why. Numeric columns
have no case and are declared plainly.

Which columns
-------------
The small, repeating vocabularies a DJ filters by: genre, key, colour, label,
year, rating and bitrate — the values a filter bar offers as a list of choices.

Artist, album and remixer are deliberately left out. They are long tails (900
artists in a 50,000-track library), the renderer offers them as a searchable
list rather than a set of choices, and an index each would be seven megabytes
for the least-used question. Their facets still answer: artist in 12 ms,
because migration 0007's ``(artist, title, id)`` index already groups by artist
under the same collation, and album and remixer in about 44 ms by scanning —
both inside the budget, and paid only by someone who opens that list.

Cost, measured at 50,000 tracks: 4.9 MB of database file and 5% of an import
(10.40 s to 10.92 s), against facets that go from 117 ms to 11 ms. Recorded in
``docs/user-guide/performance.md`` beside the query times it buys.
"""

from __future__ import annotations

VERSION = 8

DESCRIPTION = "facet indexes for the library filter bar"

SQL = """
CREATE INDEX idx_tracks_genre_facet   ON tracks (genre  COLLATE NOCASE);
CREATE INDEX idx_tracks_key_facet     ON tracks (key    COLLATE NOCASE);
CREATE INDEX idx_tracks_colour_facet  ON tracks (colour COLLATE NOCASE);
CREATE INDEX idx_tracks_label_facet   ON tracks (label  COLLATE NOCASE);

CREATE INDEX idx_tracks_year_facet    ON tracks (year);
CREATE INDEX idx_tracks_rating_facet  ON tracks (rating);
CREATE INDEX idx_tracks_bitrate_facet ON tracks (bitrate);
"""
