#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Create the background jobs table.

Records what jobs ran and how they ended, so a restarted engine can say "that
import was interrupted" instead of the job vanishing without trace (DEC-007).

``type`` is a discriminator rather than a table per job kind: import, artwork,
waveform and analysis jobs are all coming, and they differ in payload, not in
lifecycle.

Results are deliberately **not** stored here. A match run's results are
thousands of rows of candidate data; persisting them would bloat the database
for something only useful while the app is open. DEC-007 chose durable job
*records*, not crash-resumable job *state*.
"""

from __future__ import annotations

VERSION = 3

DESCRIPTION = "background jobs table"

SQL = """
CREATE TABLE jobs (
    id            TEXT    PRIMARY KEY,
    type          TEXT    NOT NULL,
    state         TEXT    NOT NULL,
    demo          INTEGER NOT NULL DEFAULT 0,
    progress_json TEXT,
    error_json    TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX idx_jobs_state ON jobs (state);

CREATE INDEX idx_jobs_created_at ON jobs (created_at DESC);
"""
