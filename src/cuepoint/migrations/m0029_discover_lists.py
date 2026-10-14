#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Saved, named artist and label lists for a dig (Discover's New dig).

A dig looks for music by every artist and label in the library, by a chosen few,
or by none. The chosen few used to live only in the form, so a person who dug
by the same twenty artists each week picked them again each week. A list keeps
them, under a name.

``discover_lists``
------------------
One row per list: ``kind`` (``'artist'`` or ``'label'``), the name as typed, and
``name_key``, the name folded for comparison, which is what the one-name-per-kind
rule is made on (``House`` and ``house`` are the same name). ``created_at`` and
``updated_at`` are ISO-8601 UTC.

``discover_list_members``
-------------------------
The names in a list, in the order they were saved: the same identifiers the
Library's artist and label facets send and a dig's request takes. Deleting a
list deletes its members.

Nothing is lost
---------------
A custom selection was never stored: it lived in the form and survived only as
the ``picked`` names a past run recorded in its parameters. So that nothing a
person chose is lost, the newest run that picked artists becomes a list named
"My artists", and the newest that picked labels one named "My labels". A library
with no such run gets no list. A run whose parameters are not valid JSON is
skipped rather than failing the migration, and the names follow the repository's
rules: trimmed, 1 to 300 characters, each once.
"""

from __future__ import annotations

VERSION = 29

DESCRIPTION = "saved artist and label lists for a dig"

_TABLES = """
CREATE TABLE discover_lists (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL CHECK (kind IN ('artist', 'label')),
    name        TEXT    NOT NULL,
    name_key    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (kind, name_key)
);

CREATE TABLE discover_list_members (
    list_id     INTEGER NOT NULL
                REFERENCES discover_lists(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    member      TEXT    NOT NULL,
    PRIMARY KEY (list_id, member)
);

CREATE INDEX idx_discover_list_members_order
    ON discover_list_members (list_id, position);
"""


def _seed(kind: str, name: str) -> str:
    """The statements that make one kind's "My ..." list from the newest picked run."""
    path = f"$.{kind}s.picked"
    picked = (
        "CASE WHEN json_valid(params_json) "
        f"THEN json_type(params_json, '{path}') END = 'array'"
        " AND CASE WHEN json_valid(params_json) "
        f"THEN json_array_length(params_json, '{path}') END > 0"
    )
    key = name.lower()
    now = "strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')"
    return f"""
INSERT INTO discover_lists (kind, name, name_key, created_at, updated_at)
SELECT '{kind}', '{name}', '{key}', {now}, {now}
WHERE EXISTS (SELECT 1 FROM discovery_runs WHERE {picked});

INSERT OR IGNORE INTO discover_list_members (list_id, position, member)
SELECT (SELECT id FROM discover_lists WHERE kind = '{kind}' AND name_key = '{key}'),
       CAST(j.key AS INTEGER),
       trim(j.value)
FROM json_each(
    (SELECT json_extract(params_json, '{path}')
     FROM discovery_runs
     WHERE {picked}
     ORDER BY id DESC LIMIT 1),
    '$'
) AS j
WHERE j.type = 'text' AND length(trim(j.value)) BETWEEN 1 AND 300
  AND EXISTS (SELECT 1 FROM discover_lists WHERE kind = '{kind}' AND name_key = '{key}');
"""


SQL = _TABLES + _seed("artist", "My artists") + _seed("label", "My labels")
