#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Which duplicate groups are shown, as something a rule can ask (CLEAN-08, DEC-074).

Migration 0011 stored groups, their members and dismissals, and left the one
question DEC-075's Health count and the filter bar both need unanswerable in
SQL: *is this group still dismissed?* A dismissal holds a SHA-256 of the
members it was made for, and SQLite cannot compute one. So a group now stores
the same fingerprint of its members, written when a scan or a dismissal writes
the group, and "dismissed" becomes a comparison of two columns.

``duplicate_track_signals`` is the answer, written once: one row per track per
signal for every group that is shown — at least two members still in it, and no
dismissal made for exactly those members. A refresh that deletes a member
cascades it out of the group, so a pair that loses one stops being shown at
once rather than at the next scan. The filter fields ``in_duplicate_group`` and
``duplicate_signal`` read the view, and so does the Duplicates list, so the
count a user filters by and the groups they see cannot disagree.

A view rather than a table: it holds nothing a scan has to keep in step, and a
later step that needs it shaped differently replaces it without moving data.
"""

from __future__ import annotations

VERSION = 16

DESCRIPTION = "a fingerprint per duplicate group, and the view of groups shown"

SQL = """
ALTER TABLE duplicate_groups ADD COLUMN member_hash TEXT NOT NULL DEFAULT '';

CREATE VIEW duplicate_track_signals AS
SELECT m.track_id AS track_id, g.signal AS signal, g.id AS group_id
FROM duplicate_members AS m
JOIN duplicate_groups AS g ON g.id = m.group_id
WHERE (SELECT count(*) FROM duplicate_members AS c WHERE c.group_id = g.id) >= 2
  AND NOT EXISTS (
      SELECT 1 FROM duplicate_dismissals AS d
      WHERE d.signal = g.signal
        AND d.group_key = g.group_key
        AND d.member_hash = g.member_hash
  );
"""
