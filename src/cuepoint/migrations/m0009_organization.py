#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The organizational schema (ORG-01, Phase 6).

Everything CuePoint knows that Rekordbox does not: a rating, a favorite, a
note, tags, Collections in a folder tree, and the Smart Collections that save
DEC-043's rule model. Five tables and one column, in one migration, because
these tables reference each other and half of them is not a state worth being
able to be in.

This is the first schema in the project holding data that **exists nowhere
else**. A track can be re-imported from the XML; a rating cannot be re-derived
from anything. That is why the choices below lean towards making mistakes
impossible rather than merely unlikely.

Why the CuePoint layer is a sibling table (DEC-057)
---------------------------------------------------
``track_metadata`` could have been three more columns on ``tracks``, and it is
not, for a concrete reason: ``TrackRepository._UPDATE_SQL`` writes **every**
column from a ``LibraryTrack``, and the refresh builds those objects out of the
XML. A CuePoint rating living on ``tracks`` would therefore be erased by a code
path nobody thinks of as destructive — not by a bug anyone would write on
purpose, but by the ordinary act of updating a track from an import. In a
separate table, DEC-057's "a refresh can never overwrite a CuePoint value" is
enforced by there being no statement that could.

It also keeps ``LibraryTrack`` exactly as it is. The import model stays the
import model, and the user's own data is addressed by the code that owns it.

Why ``collection_tracks.position`` is indexed and not unique (DEC-058)
----------------------------------------------------------------------
``rekordbox_playlist_tracks`` keys on ``(playlist_id, position)``. That table is
rebuilt wholesale on every import and never reordered in place, so a unique key
costs nothing. This table is the opposite: it is reordered constantly, SQLite
has no deferred uniqueness for indexes, and swapping two rows would violate a
unique index halfway through the swap — forcing every reorder through a
renumbering dance to satisfy a constraint that was supposed to be free.

So position is indexed, not unique, and contiguity is the service's
responsibility (ORG-04) with a test asserting it after every mutation. The
constraint that *is* free is stated instead: a row per entry, with its own id,
because DEC-058 allows a track to appear in a Collection more than once and
"remove the track" is not a well-formed request when it does.

Why ``kind`` has a CHECK and ``rules_json`` does not
----------------------------------------------------
m0006 already argued the CHECK on a discriminator: ``kind`` is a closed
three-valued vocabulary, and a typo would otherwise sit in the database until
something quietly failed to find a folder. That reasoning holds here.

The tempting second constraint — ``rules_json`` not null exactly when
``kind = 'smart'`` — is deliberately **not** written. SQLite cannot drop a CHECK
without rebuilding the table, this table holds data that cannot be re-derived,
and unlike ``kind``'s vocabulary that relationship is not certain to hold for
the life of the schema (a frozen Collection remembering the rules it came from
would break it). The service enforces it, where it can be changed.

Cascades
--------
Every foreign key cascades, and each one is a deliberate answer to "what
happens when the thing on the other end goes away":

- A track deleted because it left Rekordbox (DEC-003) takes its metadata, its
  tag assignments and its Collection entries with it. That is exactly the loss
  DEC-011's warning exists to announce beforehand, and from this migration
  onward ``references_for`` has something true to say.
- A deleted folder takes its subtree — the self-referencing cascade on
  ``parent_id``.
- A deleted tag takes its assignments and **no tracks**.
- A deleted Collection takes its entries and **no tracks**. If one line of this
  migration is worth a test of its own, it is that one.

All of this relies on ``PRAGMA foreign_keys``, which ``DatabaseService`` enables
per connection.

``frozen_from_id`` is the one id here that is **not** a foreign key, and that is
the point. DEC-061 makes a freeze a copy rather than a link: the Collection it
produces has to outlive the Smart Collection it was frozen from, and a cascade
— or even a ``SET NULL`` — would make the provenance depend on the thing whose
disappearance it exists to survive. It records what happened; it does not point
at something that must still be there.

Which indexes, and which deliberately not
-----------------------------------------
Every index here is on a column that **references another table**. SQLite scans
the whole child table on a parent delete unless the referencing column is
indexed, so these are what make the cascades above affordable rather than
optimizations for a query somebody imagines: ``track_tags.tag_id``,
``collections.parent_id`` (which also carries sibling order),
``collection_tracks.collection_id`` (order again) and
``collection_tracks.track_id`` — the last of which is also how
``references_for`` will ask DEC-011's question. The unique index on tag names is
a constraint, not an index chosen for speed.

Nothing else is indexed, on purpose. LIBUI-01 built six single-column indexes,
measured them, and deleted them again; ORG-05 repeats the rule. An index on
``track_metadata.favorite``, on ``track_metadata.rating``, on ``tags.category``
or on ``track_history.batch_id`` would be an index for a query that does not
exist yet and therefore cannot be measured — so each is left to the step that
writes its query, against a number rather than an intuition.

Timestamps are ISO-8601 UTC text, as in every table before this one.
"""

from __future__ import annotations

VERSION = 9

DESCRIPTION = "CuePoint metadata, tags, collections and smart collections"

SQL = """
CREATE TABLE track_metadata (
    track_id   INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    rating     INTEGER,
    favorite   INTEGER NOT NULL DEFAULT 0,
    notes      TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

CREATE TABLE tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    category   TEXT,
    colour     TEXT,
    created_at TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_tags_name ON tags (name COLLATE NOCASE);

CREATE TABLE track_tags (
    track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (track_id, tag_id)
);

CREATE INDEX idx_track_tags_tag ON track_tags (tag_id);

CREATE TABLE collections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id      INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    kind           TEXT    NOT NULL CHECK (kind IN ('folder', 'collection', 'smart')),
    name           TEXT    NOT NULL,
    position       INTEGER NOT NULL,
    depth          INTEGER NOT NULL,
    rules_json     TEXT,
    sort_field     TEXT,
    sort_dir       TEXT,
    frozen_from_id INTEGER,
    frozen_at      TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE INDEX idx_collections_parent ON collections (parent_id, position);

CREATE TABLE collection_tracks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    track_id      INTEGER NOT NULL REFERENCES tracks(id)      ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    added_at      TEXT    NOT NULL
);

CREATE INDEX idx_collection_tracks_collection
    ON collection_tracks (collection_id, position);

CREATE INDEX idx_collection_tracks_track
    ON collection_tracks (track_id);

ALTER TABLE track_history ADD COLUMN batch_id TEXT;
"""
