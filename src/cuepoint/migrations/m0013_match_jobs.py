#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What each match job was asked to do (CLEAN-03, DEC-065).

``m0011`` gave a match job its plan — ``match_job_tracks``, one row per track
with a ``done`` flag — and nothing else. Building the job showed that a plan
alone cannot be resumed correctly, because a resume has to answer a question
the rows do not hold: *which of the tracks still waiting were answered some
other way since this plan was written?*

A user matches a whole library, the laptop closes at track 20,000, and before
resuming they match one playlist that overlaps what is left. Resuming should
not ask Beatport those tracks again — forty-five seconds each, a dozen at a
time. Telling "matched since the plan" from "matched before it" needs a point
in the attempt history to compare against, and telling whether a user decision
should keep a track out needs to know whether the job was a re-match. Neither
can be recovered from the plan rows, so this table records both, once, when
the plan is written.

- ``rematch`` — whether decided and already-answered tracks were kept in.
- ``selected`` and ``excluded`` — how many tracks the selection named and how
  many were left out before matching, so the job can say "40 of 50 tracks, 10
  already matched" after a restart as truthfully as before one. The plan holds
  exactly ``selected - excluded`` rows.
- ``attempt_watermark`` — the highest attempt id stored when the plan was
  written. Attempt ids only grow (``AUTOINCREMENT``), so an attempt with a
  larger id was stored after the plan, whatever any clock said. A resumed job
  keeps its original's watermark, so a second resume compares against the same
  point as the first.
- ``resumed_from`` — the job whose remaining tracks this one took over, so a
  chain of resumes reads as one piece of work.

No foreign keys, for ``match_job_tracks``'s reasons: a job record is persisted
only when the engine has a repository to write it through, and a plan must not
depend on that. ``job_id`` is the primary key, which is every lookup this table
serves, so there is no other index.

The CHECKs are ``m0006``'s kind: small invariants where a wrong value would
otherwise sit silently until a resume misread it.
"""

from __future__ import annotations

VERSION = 13

DESCRIPTION = "the options each match job was started with"

SQL = """
CREATE TABLE match_jobs (
    job_id            TEXT    PRIMARY KEY,
    resumed_from      TEXT,
    rematch           INTEGER NOT NULL CHECK (rematch IN (0, 1)),
    selected          INTEGER NOT NULL CHECK (selected >= 0),
    excluded          INTEGER NOT NULL
                      CHECK (excluded >= 0 AND excluded <= selected),
    attempt_watermark INTEGER NOT NULL CHECK (attempt_watermark >= 0),
    created_at        TEXT    NOT NULL
);
"""
