#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Clean schema (CLEAN-01, Phase 7).

Everything Phase 7 stores, in one migration, for ORG-01's reason: these tables
reference each other, the runner is forward-only, and a schema landed in pieces
is a schema whose early pieces were designed without the later ones in view.

- **Overrides** — key, BPM, genre, label and year as columns on
  ``track_metadata`` (DEC-068, DEC-069).
- **Matching** — ``match_attempts`` and ``match_candidates`` keep every attempt
  with every candidate (DEC-066); ``track_match`` is each track's state and who
  decided it (DEC-067); ``match_job_tracks`` is a match job's resumable plan
  (DEC-065).
- **Detections** — ``track_files`` (DEC-073), ``duplicate_groups`` with their
  members and dismissals (DEC-074), ``track_artwork`` (DEC-076).
- **The file-write record** — ``file_writes``, what a tag write replaced
  (DEC-070).

Nothing reads or writes any of it in this step.

Why overrides are columns on ``track_metadata``
-----------------------------------------------
m0009 put CuePoint's layer in a sibling table so that no import-shaped
statement could reach it. That reason holds for these five values exactly as
it held for a rating, and a *second* sibling table would buy nothing but a
second join in every effective-value rule and a second answer to "forget
everything CuePoint knows about this track". Null means "no override", which is
a different fact from an empty string, and the model refuses to store the
latter.

The columns share their names with ``tracks.key`` and the rest. Every browse
statement qualifies its columns (``tracks.*``, ``tracks.key``), which is what
makes that safe; ``test_clean_schema`` runs a browse that joins this table and
sorts and searches by those names, so an unqualified column written later
fails there as "ambiguous column name" rather than on a user's library.

Why attempts are rows, and candidates are columns
-------------------------------------------------
m0003 says match results are not stored in ``jobs``, and that stays true:
they are stored here, in tables of their own. A candidate is columns rather
than a JSON blob because the review page sorts and compares candidates and
"apply" copies their values. Every field ``BeatportCandidate`` carries is a
column, except ``raw_data``: a stored attempt must be able to explain its own
verdict later without the network, and a field dropped here is evidence no
later migration can recover.

``input_json`` is the question the matcher was asked — the title, artist, key,
year and mix it was given — because a re-match after a refresh changed the title
is a different question. ``matcher_version`` is the engine version: the only
way to tell later whether two attempts disagree because the track changed or
because the matcher did.

``match_attempts.best_candidate_id`` is deliberately **not** a foreign key. An
attempt is inserted before its candidates, and ``match_candidates.is_winner``
already records the verdict on the candidate itself; the id is a shortcut to
it, written in the same transaction (CLEAN-02).

Why "not matched" is not a state
--------------------------------
``track_match`` has a row only for a track that has been matched at least once.
"Which tracks were never matched" is then an anti-join, not a value someone has
to remember to write for fifty thousand tracks on import. ``newer_attempt_id``
is DEC-067's flag: a re-match that disagrees with a user's decision sets it and
never touches the decision.

Why the job plan has no foreign keys
------------------------------------
``match_job_tracks`` is written once when a job starts (DEC-063) and flagged
per track as each finishes, so a resume is a query rather than a checkpoint
file. It references neither ``tracks`` nor ``jobs``, on purpose. A track a
refresh deletes mid-job is counted and skipped, as ORG-07 does, rather than
cascading a job's plan out from under it; and a job row is persisted only when
the engine has a repository to write it through, which a plan cannot be made to
depend on.

Why duplicate groups are stored
-------------------------------
DEC-075's health counts are rules, and a rule is a SQL predicate: "in a
duplicate group" has to be a join against something, not a computation per
request. A dismissal is keyed by the group's signal and key and remembers a
hash of the member ids it was dismissed with, so a group that gains a member is
shown again (DEC-074). Dismissals reference no track and no group: a group is
recomputed, and the dismissal has to outlive the row it was made against.

Cascades, and the one that is not
---------------------------------
Every row that describes a track goes when the track goes: attempts, their
candidates, match state, file status, artwork and duplicate membership. All of
these can be re-derived by matching or scanning again, and DEC-011's amended
warning counts the parts that cannot (a user's decision, an override) before a
refresh deletes anything.

``track_match``'s references into ``match_attempts`` and ``match_candidates``
have no action: every attempt is kept (DEC-066), so nothing should delete an
attempt a decision points at, and an attempt that is deleted anyway is refused.
Deleting a track removes its attempts and its match state in the same
statement, which SQLite checks at the end of the statement — so the track's own
cascade passes and a stray attempt delete does not.

``file_writes.track_id`` is ``ON DELETE SET NULL``. A track deleted from the
library does not un-write the tags already in its file, and the record of what
was replaced is the only way back; the row keeps ``file_path`` for exactly that
case. It references no job, for the same reason.

Which indexes, and which deliberately not
-----------------------------------------
m0009's rule, applied again. Every index but one is on a column that references
another table, because SQLite scans the whole child table on a parent delete
unless that column is indexed:

- ``match_attempts.track_id`` — the track cascade, and a track's attempts in
  order (the rowid is the tiebreak, so newest-first needs nothing more).
- ``match_candidates (attempt_id, rank)`` — unique, so it is also the rule that
  an attempt ranks each candidate once, and it serves "candidates by rank".
- ``track_match.attempt_id``, ``candidate_id`` and ``newer_attempt_id`` — each
  checked on every attempt and candidate delete. Measured with two attempts of
  twenty candidates and a user decision per track, deleted in chunks of 500:
  2,000 of 5,000 tracks take 0.20 s with these indexes and 25.77 s without,
  because every deleted candidate otherwise scans ``track_match``; 20,000 of
  50,000 (800,000 candidates) take 2.21 s with them.
- ``duplicate_members.track_id`` — the track cascade; the primary key already
  leads with ``group_id``.
- ``file_writes.track_id`` — the ``SET NULL``.

The exception is ``file_writes.job_id``, which CLEAN-10's restore reads a job's
record by, and which the specification names.

``track_match.state``, ``track_files.status``, ``match_candidates
.beatport_track_id`` and ``match_attempts.job_id`` are **not** indexed. Each is
a query a later step writes (CLEAN-04, CLEAN-07, CLEAN-08, CLEAN-03) and will
measure.

Timestamps are ISO-8601 UTC text, as in every table before these.
"""

from __future__ import annotations

VERSION = 11

DESCRIPTION = "overrides, matching, file checks, duplicates, artwork and file writes"

SQL = """
ALTER TABLE track_metadata ADD COLUMN key   TEXT;

ALTER TABLE track_metadata ADD COLUMN bpm   REAL;

ALTER TABLE track_metadata ADD COLUMN genre TEXT;

ALTER TABLE track_metadata ADD COLUMN label TEXT;

ALTER TABLE track_metadata ADD COLUMN year  INTEGER;

CREATE TABLE match_attempts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id          INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    job_id            TEXT,
    started_at        TEXT    NOT NULL,
    finished_at       TEXT    NOT NULL,
    outcome           TEXT    NOT NULL
                      CHECK (outcome IN ('matched', 'no_match', 'error')),
    best_candidate_id INTEGER,
    score             REAL,
    error             TEXT,
    queries_json      TEXT,
    input_json        TEXT    NOT NULL,
    matcher_version   TEXT
);

CREATE INDEX idx_match_attempts_track ON match_attempts (track_id);

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
    title_sim         INTEGER,
    artist_sim        INTEGER,
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

CREATE TABLE track_match (
    track_id         INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    state            TEXT    NOT NULL
                     CHECK (state IN
                            ('no_match', 'needs_review', 'accepted', 'rejected')),
    decided_by       TEXT    NOT NULL CHECK (decided_by IN ('auto', 'user')),
    attempt_id       INTEGER NOT NULL REFERENCES match_attempts(id),
    candidate_id     INTEGER REFERENCES match_candidates(id),
    newer_attempt_id INTEGER REFERENCES match_attempts(id),
    decided_at       TEXT    NOT NULL
);

CREATE INDEX idx_track_match_attempt ON track_match (attempt_id);

CREATE INDEX idx_track_match_candidate ON track_match (candidate_id);

CREATE INDEX idx_track_match_newer_attempt ON track_match (newer_attempt_id);

CREATE TABLE match_job_tracks (
    job_id   TEXT    NOT NULL,
    position INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    done     INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    PRIMARY KEY (job_id, position)
);

CREATE TABLE track_files (
    track_id     INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    status       TEXT    NOT NULL
                 CHECK (status IN ('present', 'missing', 'unreadable')),
    checked_path TEXT    NOT NULL,
    size_bytes   INTEGER,
    checked_at   TEXT    NOT NULL
);

CREATE TABLE duplicate_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    signal      TEXT    NOT NULL CHECK (signal IN ('path', 'beatport', 'text')),
    group_key   TEXT    NOT NULL,
    computed_at TEXT    NOT NULL,
    UNIQUE (signal, group_key)
);

CREATE TABLE duplicate_members (
    group_id INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id)           ON DELETE CASCADE,
    PRIMARY KEY (group_id, track_id)
);

CREATE INDEX idx_duplicate_members_track ON duplicate_members (track_id);

CREATE TABLE duplicate_dismissals (
    signal       TEXT NOT NULL CHECK (signal IN ('path', 'beatport', 'text')),
    group_key    TEXT NOT NULL,
    member_hash  TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (signal, group_key)
);

CREATE TABLE track_artwork (
    track_id      INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    embedded      TEXT    NOT NULL DEFAULT 'unknown'
                  CHECK (embedded IN ('unknown', 'none', 'present')),
    embedded_hash TEXT,
    beatport_url  TEXT,
    cache_key     TEXT,
    checked_at    TEXT
);

CREATE TABLE file_writes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id         TEXT    NOT NULL,
    track_id       INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    file_path      TEXT    NOT NULL,
    field          TEXT    NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT,
    outcome        TEXT    NOT NULL
                   CHECK (outcome IN ('written', 'skipped', 'failed', 'restored')),
    reason         TEXT,
    written_at     TEXT    NOT NULL
);

CREATE INDEX idx_file_writes_job ON file_writes (job_id);

CREATE INDEX idx_file_writes_track ON file_writes (track_id);
"""
