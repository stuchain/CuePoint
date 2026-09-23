#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A label's name key, beside each layer of the label (DISCOVER-03, DEC-095).

The ``label_name`` rule compares a library's *effective* label — the override
when there is one, otherwise what Rekordbox wrote (DEC-068) — by
``core.entity_names.name_key``, so "Nightfall Audio", "NIGHTFALL AUDIO" and
"Nightfall-Audio" are one label. The key has to be known per row for a filter,
a facet and a Smart Collection to read it, and DISCOVER-03 measured the two
ways of knowing it at 50,000 tracks, 1,200 labels and 10,000 label overrides:

====================================  ===========  ==========
                                       rule "is"     facet
====================================  ===========  ==========
``name_key`` as a SQLite function       31.5 ms      71.4 ms
a stored ``label_key`` (this)           13.0 ms      44.7 ms
the plain ``label`` rule, for scale     12.6 ms         —
====================================  ===========  ==========

The stored key was kept: it costs a label rule nothing over the rule that
already existed, where the function costs a Python call per row on every read.

So each layer carries its own key: ``tracks.label_key`` beside ``tracks.label``
and ``track_metadata.label_key`` beside ``track_metadata.label``, and the
effective key is ``COALESCE(meta.label_key, tracks.label_key)`` — exact, because
a key is null exactly when its label is null or blank.

Who writes them
---------------
Only the two repositories that write the labels, in the same statement:
``TrackRepository`` computes ``tracks.label_key`` from the track it writes, and
``TrackMetadataRepository`` writes ``track_metadata.label_key`` with the
override. There is no second path that could let a key drift from its label.

Rows written before this migration have no key yet. The credit index job
(DISCOVER-03) fills them, and fills them again whenever the rule's version
changes — which is why the key is derived data recorded in
``derived_indexes``, not something a migration computes: ``name_key`` is
Python, and a migration is SQL that must never change once shipped.

No index
--------
Neither column is indexed. The effective key spans two tables, so no index on
either serves a rule on it, and the measured costs above are full scans that
already match the existing label rule. A reader that wants one of the two
columns on its own — a later step's label page, say — measures it and adds its
index then.
"""

from __future__ import annotations

VERSION = 22

DESCRIPTION = "a name key beside the imported label and beside its override"

SQL = """
ALTER TABLE tracks ADD COLUMN label_key TEXT;

ALTER TABLE track_metadata ADD COLUMN label_key TEXT;
"""
