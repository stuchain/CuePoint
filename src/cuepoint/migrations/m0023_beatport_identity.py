#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the library owns on Beatport, and who its tracks are there (DISCOVER-04).

Two views, and nothing stored. DEC-092 computes ownership when it is read, and
DEC-095 takes an artist's or label's Beatport id from a library track's
accepted match; both change the moment a match is accepted, rejected or
re-pointed at another candidate, so neither may be a copy something has to
keep in step.

``library_beatport_tracks`` — DEC-092's "owned", written once
------------------------------------------------------------
One row per library track whose match is **accepted** — automatic or the
user's, DEC-067's state and nothing else — with the Beatport track id of the
candidate it was accepted with:

- **the candidate's ``beatport_track_id``**, when it is a Beatport id;
- **otherwise, the id in the candidate's URL**: after the first ``/track/``, a
  slug with no ``/`` in it, a ``/``, and the digits that follow — the page
  shape ``/track/<slug>/<id>`` the matcher and ``match_record`` read;
- **otherwise no row**: a track whose accepted candidate names no Beatport id
  is not known to own anything, and says so by being absent.

A Beatport id is the plain decimal of a positive 64-bit integer: ASCII digits,
no sign, no space, no leading zero. The test is that casting the text to an
integer and back gives the same text, which SQLite answers without a regular
expression and which refuses ``"0123"``, ``" 123"``, ``"12abc"`` and a number
too large to be one. Beatport has never written any of those, so refusing them
loses nothing and keeps the SQL and the Python able to agree exactly.

The column is ``TEXT`` (m0011), written from the URL by ``match_record``, so
for every row CuePoint writes the fallback finds nothing the column did not
already hold. It is there because DEC-092 asks for it, and because the column
is text that any future writer could leave empty or fill with something that
is not an id; this view never trusts it to be one.

The id is an ``INTEGER``, cast here, so it compares with the catalog's own
ids by value and never by affinity rules. ``services/beatport_ownership.py``
holds the same rule in Python and a test holds the two to each other on every
case: automatic and user accepts, rejected, needs review and no match, an id
with and without a URL, a URL with no id, and ids that are not ids.

Every reader of ownership — a discovery run's list, the wantlist, the Artist
and Label pages, the playlist push — reads this view. A second copy of the
rule is how "hidden as owned" and "shown as not owned" come to describe the
same track (the phase's cross-cutting fact 3).

``library_beatport_credits`` — DEC-095's identity
-------------------------------------------------
For each of those tracks whose Beatport track is in the catalog cache, who
Beatport says it is by, and on which label:

- ``kind = 'artist'``: one row per ``beatport_track_artists`` credit, ``role``
  ``'artist'`` or ``'remixer'`` and ``position`` in Beatport's order,
  ``beatport_id`` the Beatport artist id (null when the credit carried none);
- ``kind = 'label'``: one row per track with a label, ``role`` and
  ``position`` null, ``beatport_id`` the Beatport label id.

``name`` and ``name_key`` are Beatport's spelling and DISCOVER-03's key of it,
so a name-matched group in the library can be linked to the id Beatport gives
the same name (DEC-095's last implication).

Nothing is copied onto ``tracks`` or ``track_credits``: a re-match that accepts
another candidate changes what this answers in the same statement that changes
the match, with no invalidation step to forget. A track resolved before is
still read from the cache after its match is rejected — and no longer appears
here, because it is no longer owned.

A view, as ``m0016``'s ``duplicate_track_signals`` is: it holds nothing a job
has to keep in step, and a later step that needs it shaped differently
replaces it without moving data.
"""

from __future__ import annotations

VERSION = 23

DESCRIPTION = "what the library owns on Beatport, and its tracks' Beatport credits"

SQL = """
CREATE VIEW library_beatport_tracks AS
SELECT track_id, candidate_id, beatport_track_id
FROM (
    SELECT m.track_id AS track_id,
           c.id AS candidate_id,
           CASE
               WHEN CAST(c.beatport_track_id AS INTEGER) > 0
                AND CAST(CAST(c.beatport_track_id AS INTEGER) AS TEXT)
                    = c.beatport_track_id
                   THEN CAST(c.beatport_track_id AS INTEGER)
               ELSE (
                   SELECT CASE
                              WHEN CAST(digits AS INTEGER) > 0
                               AND CAST(CAST(digits AS INTEGER) AS TEXT) = digits
                                  THEN CAST(digits AS INTEGER)
                          END
                   FROM (
                       SELECT substr(tail, 1, length(tail)
                                     - length(ltrim(tail, '0123456789'))) AS digits
                       FROM (
                           SELECT CASE WHEN instr(path, '/') > 1
                                       THEN substr(path, instr(path, '/') + 1)
                                       ELSE ''
                                  END AS tail
                           FROM (
                               SELECT CASE WHEN instr(c.url, '/track/') > 0
                                           THEN substr(c.url, instr(c.url, '/track/') + 7)
                                           ELSE ''
                                      END AS path
                           )
                       )
                   )
               )
           END AS beatport_track_id
    FROM track_match AS m
    JOIN match_candidates AS c ON c.id = m.candidate_id
    WHERE m.state = 'accepted'
)
WHERE beatport_track_id IS NOT NULL;

CREATE VIEW library_beatport_credits AS
SELECT l.track_id AS track_id,
       l.beatport_track_id AS beatport_track_id,
       'artist' AS kind,
       a.role AS role,
       a.position AS position,
       a.artist_id AS beatport_id,
       a.name AS name,
       a.name_key AS name_key
FROM library_beatport_tracks AS l
JOIN beatport_track_artists AS a ON a.beatport_track_id = l.beatport_track_id
UNION ALL
SELECT l.track_id AS track_id,
       l.beatport_track_id AS beatport_track_id,
       'label' AS kind,
       NULL AS role,
       NULL AS position,
       b.label_id AS beatport_id,
       b.label_name AS name,
       b.label_key AS name_key
FROM library_beatport_tracks AS l
JOIN beatport_tracks AS b ON b.beatport_track_id = l.beatport_track_id
WHERE b.label_id IS NOT NULL OR b.label_name IS NOT NULL;
"""
