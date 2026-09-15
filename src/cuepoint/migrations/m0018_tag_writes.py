#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A write that may not have happened, and what a restore put back (CLEAN-10, DEC-070).

Migration 0011 gave ``file_writes`` one row per field per file per job. Building
the job needed two things that row could not say:

- **That a write was recorded but not yet confirmed.** Every row is written and
  committed *before* the file is touched, so a crash can never leave a written
  file with no record (DEC-070). The price is the opposite case: a record of a
  write that may not have happened. ``pending`` is 1 from the record until the
  file has been written and read back, so such a row says so rather than
  claiming a write. A restore handles it by looking at the file: one that
  already holds the old value needs nothing.
- **Which write a restore put back.** A restore is recorded as rows of its own —
  what the file held before it and what it restored — under the restore's job,
  and ``restore_of`` names the write each one undid. A write with a confirmed
  restore is not restored again, and a restore that was skipped because the
  file had moved on leaves the write restorable later. A restore row is recorded
  pending too, for the same reason: a crash between its record and its write
  must not mark a write as undone when the file still holds it.

``restore_of`` is indexed, partial on being set: it is read on every restore to
exclude writes already restored, and only restore rows carry it. Nothing ever
deletes a ``file_writes`` row, so its reference needs no action.
"""

from __future__ import annotations

VERSION = 18

DESCRIPTION = "pending file writes, and the write a restore undid"

SQL = """
ALTER TABLE file_writes ADD COLUMN pending INTEGER NOT NULL DEFAULT 0
    CHECK (pending IN (0, 1));

ALTER TABLE file_writes ADD COLUMN restore_of INTEGER REFERENCES file_writes(id);

CREATE INDEX idx_file_writes_restore_of ON file_writes (restore_of)
    WHERE restore_of IS NOT NULL;
"""
