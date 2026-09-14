#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Finding a batch's changes without reading all of history (CLEAN-06, DEC-063).

Migration 0009 added ``track_history.batch_id`` and deliberately left it
unindexed: nothing asked "which changes belong to this batch" yet, so an index
would have been for a query that could not be measured. CLEAN-06's batch revert
is that query, asked once when a revert is checked and once when it runs.

The index is **partial**. Most history rows are one edit to one track and carry
no batch id, and they never need to be found this way, so they are not in it.
``id`` is the second column because a revert walks a batch newest first, and
ids only grow, so the index hands the rows back in that order with no sort.

The numbers, from a library of 50,000 tracks whose history holds 1,000,000
changes, are in ``docs/v1/PHASE7_CLEAN.md`` under CLEAN-06: without the index a
batch's ids are a scan of the whole table, and the time grows with every edit a
user ever makes, which is the one table in the database that never shrinks.
"""

from __future__ import annotations

VERSION = 14

DESCRIPTION = "index track history by batch, for reverting a batch"

SQL = """
CREATE INDEX idx_track_history_batch ON track_history (batch_id, id)
    WHERE batch_id IS NOT NULL;
"""
