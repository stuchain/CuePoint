#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Store a candidate's title and artist similarity as the numbers they are.

``m0011`` declared ``match_candidates.title_sim`` and ``artist_sim`` as
``INTEGER``, following ``BeatportCandidate``'s annotation. The annotation is
wrong about the matcher: ``score_components`` returns RapidFuzz's
``token_set_ratio``, which is a float — "Sunrise" against "Sunset Boulevard" is
43.47826086956522 — and the subset-match guard subtracts from it. CLEAN-02 found
this by storing real matcher output: ``MatchCandidate`` refused the value, and
rounding it would store something other than what was scored (DEC-066), while
the final score is computed from the unrounded number.

Why a migration and not an edit to ``m0011``
--------------------------------------------
``m0011`` was committed, and the runner records versions without checksums, so
a database already at version 11 would never see an edited DDL. Forward-only
means the fix is a step forward that every database takes.

How the table is rebuilt
------------------------
SQLite cannot change a column's declared type, so the table is rebuilt, and the
rebuild has to hold under ``PRAGMA foreign_keys=ON`` inside the runner's
transaction (the pragma cannot be switched off there). ``track_match`` references
candidates without a cascade, so its rows are set aside first; dropping a table
whose rows are still referenced would be refused. Every candidate keeps its id,
and ``sqlite_sequence`` keeps its high-water mark, so an id handed out once is
never handed out again — the reason the table is ``AUTOINCREMENT``.

The copy tables are plain tables rather than ``TEMP`` ones so every statement
stays in the one database the runner's transaction covers, and they are dropped
before it commits. The rebuilt DDL is identical to ``m0011``'s but for the two
column types, so a fresh database and an upgraded one have the same schema.

Nothing reads or writes ``match_candidates`` before CLEAN-02, so in practice the
table is empty; the copy is there because a migration's correctness should not
rest on "in practice".
"""

VERSION = 12
DESCRIPTION = "candidate similarities as real numbers"

SQL = """
CREATE TABLE m0012_candidates AS SELECT * FROM match_candidates;

CREATE TABLE m0012_track_match AS SELECT * FROM track_match;

CREATE TABLE m0012_sequence AS
    SELECT seq FROM sqlite_sequence WHERE name = 'match_candidates';

DELETE FROM track_match;

DROP TABLE match_candidates;

CREATE TABLE match_candidates (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id        INTEGER NOT NULL
                      REFERENCES match_attempts(id) ON DELETE CASCADE,
    rank              INTEGER NOT NULL,
    beatport_track_id TEXT,
    url               TEXT    NOT NULL,
    title             TEXT,
    artists           TEXT,
    remixers          TEXT,
    label             TEXT,
    genre             TEXT,
    subgenre          TEXT,
    key               TEXT,
    bpm               REAL,
    release_name      TEXT,
    release_date      TEXT,
    release_year      INTEGER,
    artwork_url       TEXT,
    preview_url       TEXT,
    score             REAL    NOT NULL,
    base_score        REAL,
    title_sim         REAL,
    artist_sim        REAL,
    bonus_year        INTEGER,
    bonus_key         INTEGER,
    guard_ok          INTEGER NOT NULL CHECK (guard_ok IN (0, 1)),
    reject_reason     TEXT,
    query_index       INTEGER,
    query_text        TEXT,
    candidate_index   INTEGER,
    elapsed_ms        INTEGER,
    is_winner         INTEGER NOT NULL CHECK (is_winner IN (0, 1))
);

CREATE UNIQUE INDEX idx_match_candidates_attempt
    ON match_candidates (attempt_id, rank);

INSERT INTO match_candidates (
    id, attempt_id, rank, beatport_track_id, url, title, artists, remixers,
    label, genre, subgenre, key, bpm, release_name, release_date, release_year,
    artwork_url, preview_url, score, base_score, title_sim, artist_sim,
    bonus_year, bonus_key, guard_ok, reject_reason, query_index, query_text,
    candidate_index, elapsed_ms, is_winner
)
SELECT
    id, attempt_id, rank, beatport_track_id, url, title, artists, remixers,
    label, genre, subgenre, key, bpm, release_name, release_date, release_year,
    artwork_url, preview_url, score, base_score, title_sim, artist_sim,
    bonus_year, bonus_key, guard_ok, reject_reason, query_index, query_text,
    candidate_index, elapsed_ms, is_winner
FROM m0012_candidates;

DELETE FROM sqlite_sequence WHERE name = 'match_candidates';

INSERT INTO sqlite_sequence (name, seq)
    SELECT 'match_candidates', seq FROM m0012_sequence;

INSERT INTO track_match (
    track_id, state, decided_by, attempt_id, candidate_id, newer_attempt_id,
    decided_at
)
SELECT
    track_id, state, decided_by, attempt_id, candidate_id, newer_attempt_id,
    decided_at
FROM m0012_track_match;

DROP TABLE m0012_sequence;

DROP TABLE m0012_track_match;

DROP TABLE m0012_candidates;
"""
