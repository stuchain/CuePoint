#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What Artist and Label pages read, and read quickly (DISCOVER-07).

Two changes. One stores something new: when an artist's or label's recent
tracks were last read whole. The other reshapes migration 0023's two views so
that a page, which asks about one Beatport artist or label in every statement
of its count, window and facets, does not read every accepted match to do it.
No row is moved, and nothing the views answer changes.

``beatport_listings``
---------------------
An Artist or Label page's Beatport half (DEC-094) is a listing: every track an
artist or label released in a recent window, read through DISCOVER-01's
``artist_tracks`` or ``label_tracks`` and stored in the catalog cache like any
other catalog track. The cache says what each track is. It cannot say that it
holds *all* of an artist's recent tracks, because a track reaches it from a
discovery run, the wantlist or a resolve as well, and an artist with no recent
releases leaves nothing in it at all. DISCOVER-02's sixth binding note left
this record to the step that needed it. One row per artist or label, replaced
when it is read again:

- ``kind``: ``'artist'`` or ``'label'``, the name-lookup cache's vocabulary;
- ``beatport_id``: the artist's or label's Beatport id;
- ``since``: the first release day the listing asked for, ``YYYY-MM-DD``. A
  listing answers for a later window as well, never for an earlier one;
- ``fetched_at``: when it was read, ISO-8601 UTC, which the page's freshness
  age is measured from;
- ``tracks``: how many tracks the read returned, so a listing that found
  nothing is a fact and not an absence.

The tracks themselves are not listed. The page reads them back from the
catalog by the artist's or label's id and the window, through ``m0021``'s
indexes, so a track the cache gained another way that is by the same artist
in the same window is shown too: it is one of their releases. Nothing
references the table and it references nothing.

The owned id, indexed
---------------------
DEC-092's rule is unchanged: an accepted match's Beatport track id is its
candidate's ``beatport_track_id`` when that is the plain decimal of a positive
64-bit integer, otherwise the id in the candidate's ``/track/<slug>/<id>`` URL,
otherwise none. ``m0023`` wrote the URL half with nested subqueries, which an
index cannot hold, so every question of the form "which library tracks own
these Beatport tracks" read every accepted match and computed its id: 30 to 50
ms at 40,000 accepted matches, in each statement that asked. A page asks in
every statement.

Here the rule is one expression over the candidate's own two columns
(:func:`_owned_id`), with no subquery, and ``idx_match_candidates_owned_id``
indexes it. ``library_beatport_tracks`` is recreated with the same expression,
character for character from the same function, which is what lets SQLite use
the index through the view: a lookup of a list of Beatport ids reads the index
once per id, then the match by ``idx_track_match_candidate``. Measured at
40,000 accepted matches, one label's library tracks by id fall from 48 ms to
0.1 ms. DISCOVER-04's test holding the view to the Python rule on every case
holds the new expression to it.

The expression repeats its intermediate values (the path after ``/track/``,
the tail after the slug, the digits) where the subqueries named them, which
makes it long. It is built by a function here rather than written out so that
the index and the view cannot differ by a character, and like all of a
migration's SQL it never changes once shipped.

The identity, by kind
---------------------
``library_beatport_credits`` answered both kinds as one ``UNION ALL``. SQLite
cannot flatten a compound view into a query that reads it one track at a time,
so a correlated lookup — "is this track resolved?" for each of a name's tracks
— computed the whole view for each track, a second apiece. Each kind is now a
view of its own, which SQLite flattens into a lookup by key:

- ``library_beatport_artists (track_id, beatport_track_id, role, position,
  beatport_id, name, name_key)``;
- ``library_beatport_labels (track_id, beatport_track_id, beatport_id, name,
  name_key)``.

``library_beatport_credits`` is recreated as the two together, with the same
columns, rows and order of columns as before, so every reader of it is
unchanged.

A label's tracks, by index
--------------------------
DISCOVER-03 left ``tracks.label_key`` and ``track_metadata.label_key``
unindexed, since the effective key spans both and no single index serves a
rule on it, and said the step with a label page would measure and add them. A
Label page asks for the tracks of one library label, or of the labels its
Beatport id is linked to, in every statement; computing every track's
effective key to find them took 16 ms at 50,000 tracks, and some reads asked
it for each track. ``idx_tracks_label_key`` and
``idx_track_metadata_label_key`` find them in two index reads: the tracks whose
own key matches and that have no override, and the tracks whose override's key
matches.

``beatport_catalog_credits (kind, beatport_id, beatport_track_id)`` is the
catalog's side of the same question, every cached track by each artist it
credits and by its label, so a page's statements can list an artist's
Beatport tracks without running SQL against the catalog's tables, which
belongs to the catalog's own module.
"""

from __future__ import annotations

VERSION = 24

DESCRIPTION = (
    "when an artist's or label's recent Beatport tracks were read, and the owned"
    " id indexed for Artist and Label pages"
)


def _owned_id(stored: str, url: str) -> str:
    """DEC-092's rule over a candidate's stored id and URL, as one expression.

    The stored id when it is the plain decimal of a positive 64-bit integer;
    otherwise the digits after ``/track/<slug>/`` in the URL, on the same test;
    otherwise null. ``m0023``'s rule, spelled without subqueries.
    """

    def valid(text: str) -> str:
        return (
            f"CAST({text} AS INTEGER) > 0"
            f" AND CAST(CAST({text} AS INTEGER) AS TEXT) = {text}"
        )

    path = (
        f"CASE WHEN instr({url}, '/track/') > 0"
        f" THEN substr({url}, instr({url}, '/track/') + 7) ELSE '' END"
    )
    tail = (
        f"CASE WHEN instr({path}, '/') > 1"
        f" THEN substr({path}, instr({path}, '/') + 1) ELSE '' END"
    )
    digits = f"substr({tail}, 1, length({tail}) - length(ltrim({tail}, '0123456789')))"
    return (
        f"CASE WHEN {valid(stored)} THEN CAST({stored} AS INTEGER)"
        f" WHEN {valid(digits)} THEN CAST({digits} AS INTEGER) END"
    )


_INDEXED = _owned_id("beatport_track_id", "url")
_VIEWED = _owned_id("c.beatport_track_id", "c.url")

SQL = f"""
CREATE TABLE beatport_listings (
    kind         TEXT NOT NULL CHECK (kind IN ('artist', 'label')),
    beatport_id  INTEGER NOT NULL CHECK (beatport_id > 0),
    since        TEXT NOT NULL,
    fetched_at   TEXT NOT NULL,
    tracks       INTEGER NOT NULL DEFAULT 0 CHECK (tracks >= 0),
    PRIMARY KEY (kind, beatport_id)
) WITHOUT ROWID;

DROP VIEW library_beatport_credits;

DROP VIEW library_beatport_tracks;

CREATE INDEX idx_match_candidates_owned_id ON match_candidates ({_INDEXED});

CREATE INDEX idx_tracks_label_key ON tracks (label_key);

CREATE INDEX idx_track_metadata_label_key ON track_metadata (label_key);

CREATE VIEW library_beatport_tracks AS
SELECT m.track_id AS track_id,
       c.id AS candidate_id,
       {_VIEWED} AS beatport_track_id
FROM track_match AS m
JOIN match_candidates AS c ON c.id = m.candidate_id
WHERE m.state = 'accepted'
  AND {_VIEWED} IS NOT NULL;

CREATE VIEW library_beatport_artists AS
SELECT l.track_id AS track_id,
       l.beatport_track_id AS beatport_track_id,
       a.role AS role,
       a.position AS position,
       a.artist_id AS beatport_id,
       a.name AS name,
       a.name_key AS name_key
FROM library_beatport_tracks AS l
JOIN beatport_track_artists AS a ON a.beatport_track_id = l.beatport_track_id;

CREATE VIEW library_beatport_labels AS
SELECT l.track_id AS track_id,
       l.beatport_track_id AS beatport_track_id,
       b.label_id AS beatport_id,
       b.label_name AS name,
       b.label_key AS name_key
FROM library_beatport_tracks AS l
JOIN beatport_tracks AS b ON b.beatport_track_id = l.beatport_track_id
WHERE b.label_id IS NOT NULL OR b.label_name IS NOT NULL;

CREATE VIEW library_beatport_credits AS
SELECT track_id, beatport_track_id, 'artist' AS kind, role, position,
       beatport_id, name, name_key
FROM library_beatport_artists
UNION ALL
SELECT track_id, beatport_track_id, 'label' AS kind, NULL AS role,
       NULL AS position, beatport_id, name, name_key
FROM library_beatport_labels;

CREATE VIEW beatport_catalog_credits AS
SELECT 'artist' AS kind, artist_id AS beatport_id, beatport_track_id
FROM beatport_track_artists
WHERE artist_id IS NOT NULL
UNION ALL
SELECT 'label' AS kind, label_id AS beatport_id, beatport_track_id
FROM beatport_tracks
WHERE label_id IS NOT NULL;
"""
