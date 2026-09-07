#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Widening the tag index so a tag rule can be answered from it (ORG-05).

Migration 0009 created ``idx_track_tags_tag (tag_id)`` for one question: how
many tracks carry each tag, which is what ORG-03's tag list shows. ORG-05 asks
a second one — *which* tracks carry it — and that is a different index by one
column.

``track_tags`` is a rowid table with ``PRIMARY KEY (track_id, tag_id)``, so a
one-column index on ``tag_id`` really stores ``(tag_id, rowid)``. Finding the
tracks with a tag therefore reads the index for the tag's rowids and then
fetches each row to learn its ``track_id``. Adding ``track_id`` to the index
puts the answer in the index itself, and the row is never touched.

Measured over 50,000 tracks and 200,000 assignments, on the query ORG-05
compiles for a tag rule:

===========================  =========  =========
                             ``tag_id``  ``(tag_id, track_id)``
===========================  =========  =========
"has this tag"                 18.7 ms     8.4 ms
"any of five tags"             68.6 ms    23.8 ms
"does not have this tag"       22.6 ms    12.0 ms
ORG-03's tag list with counts  12.9 ms    13.7 ms
===========================  =========  =========

It **replaces** the narrow index rather than joining it, which is why it is
worth having: a wider index that answers a superset of the same questions
leaves the table with the number of indexes it already had. Writing 12,000 tag
assignments measured the same either way (41 ms and 28 ms across runs, which is
noise at this size), and the index is a few hundred kilobytes wider over
200,000 rows. LIBUI-01's rule — measure, then keep only what earns its write
cost — is satisfied by a swap that costs nothing and returns two to three times
on every tag rule.

Nothing else is added. ``collection_tracks`` needs no new index: the same
question over a Collection is already answered in 1.4 ms through
``idx_collection_tracks_collection``, which 0009 created for the ordering.
"""

from __future__ import annotations

VERSION = 10

DESCRIPTION = "widen the tag index to cover which tracks carry a tag"

SQL = """
DROP INDEX idx_track_tags_tag;

CREATE INDEX idx_track_tags_tag ON track_tags (tag_id, track_id);
"""
