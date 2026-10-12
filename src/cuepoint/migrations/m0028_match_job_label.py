#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A name for each match run: what was matched (C14, DEC-065).

``m0013`` recorded how a match job was started and ``m0011`` which tracks it
covered, but not *what the person asked for*: a selection is resolved to track
ids at start, so "Playlist 'Friday set'" was gone by the time the run finished.
The Match area lists past searches (DEC-065), and a row that can only say "412
tracks" is a row nobody can recognise.

``match_jobs.label``
--------------------
The words the renderer chose when it started the run ("Playlist \\"all\\"",
"Whole library", "7 chosen tracks"), trimmed and at most 200 characters. Nullable:
a run started before this migration, or by a caller that named nothing, has no
label and is listed by its track count. A resume copies its root's label, so a
chain of resumes reads as one run under one name.

Nothing else changes
--------------------
One column on a table that nothing references, no index (the list is paged by
``rowid``, which every table has), no backfill (the words were never stored, and
inventing them would be a claim).
"""

from __future__ import annotations

VERSION = 28

DESCRIPTION = "a label on each match job: what was matched"

SQL = """
ALTER TABLE match_jobs ADD COLUMN label TEXT;
"""
