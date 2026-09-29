# ADR-008: A Set is a kind of Collection node, and m0025 rebuilds the tree to hold it

## Status

Accepted (PREP-12, 2026-09-29). Records DEC-102 as implemented in Phase 10
(PREP-01, PREP-02), with the phase's decisions that rest on it: DEC-103
(chapters), DEC-106 (warnings), DEC-107 (planned times) and DEC-109 (the export).

## Context

Phase 10 adds the Set: a running order a DJ prepares, divided into chapters,
with planned in and out times, notes, and checks on every transition. By then
CuePoint already had almost everything a running order is made of:

- a tree of folders, Collections and Smart Collections in one table
  (`collections`, m0009), with drag, filing, rename, delete and duplicate;
- ordered entries with their own ids in which a track may repeat
  (`collection_tracks`, DEC-058), written by one repository;
- a membership rule that names a Collection (DEC-060), the refresh warning's
  reference count (DEC-011), and the Rekordbox export's playlist path (DEC-078,
  DEC-086), all keyed by a node id.

DEC-058 had already made a Collection and a Set structurally the same thing and
recorded that the difference would rest on what this phase adds. The question
was where a Set lives.

Two options were weighed. **Separate Set tables** (their own nodes and entries)
would have written the tree, folders, ordering, drag, the membership rule, the
reference count and the export path a second time, and every copy would drift
from the first. **Adding set features to every Collection** would have been the
merge DEC-058 warned against: "Collection" would stop meaning a crate, and every
Collection would carry chapters and times nobody asked for.

## Decision

**A Set is a fourth `kind` in the one tree, beside `folder`, `collection` and
`smart`** (DEC-102).

- **Its entries are `collection_tracks` rows**: ordered, with ids, repeats
  allowed. What a Set has that a Collection does not lives in side tables keyed
  by the Set and by its entries:
  - `set_details`, one row per Set (its notes), referencing
    `collections(id, kind)` with a kind that can only be `'set'`;
  - `set_chapters`, the chapters, with name, notes, target and BPM range;
  - `set_entries`, each entry's chapter, planned times and note, referencing its
    entry and its chapter with the same Set on both sides;
  - `set_acknowledgements`, an accepted transition warning with the values it
    was accepted for, both ends in one Set.

  Composite references make a chapter of one Set holding an entry of another
  impossible rather than unlikely, as m0009 and DISCOVER-02 did for their
  tables. `set_details` and `set_entries` are `WITHOUT ROWID`, so an omitted key
  cannot silently become a real entry's id.
- **One writer for entries.** `collection_repository.py` stays the only writer
  of `collection_tracks`, and writes a new entry's `set_entries` row in the same
  transaction, so no path — batch job, drag, "freeze", "Add to Set…" — can make
  an entry without a chapter.
- **Every test of `kind` is a decision.** Where code asks "does this node hold
  tracks?" (adding, counts, scope, export) a Set answers yes; where it asks "is
  this a crate?" (the icon, the "Add to Collection" picker, labels) it answers
  no. PREP-02 and PREP-09 audited every such test, in Python and TypeScript, and
  recorded each answer.
- **Widening the kind is a table rebuild that must not cascade** (m0025).
  SQLite cannot change a `CHECK` in place, and under `PRAGMA foreign_keys=ON` —
  which the migration runner cannot switch off inside its transaction —
  `DROP TABLE collections` is an implicit `DELETE` that cascades to every
  `collection_tracks` row and every child node. So m0025:
  1. copies `collections`, `collection_tracks` and
     `rekordbox_export_playlists` aside, with their `sqlite_sequence` values;
  2. drops them child first, and recreates them with m0009's and m0020's DDL,
     only the `CHECK` widened to accept `set`;
  3. refills every row with its id, builds the indexes after the refill, and
     restores the sequences, so an id handed out once is never handed out again;
  4. creates the four new tables.

  A test performs the drops before the copies and fails, which proves the order
  matters. The launch backup (FOUNDATION-11, DEC-009) runs before any migration,
  so a copy of the pre-migration database always exists.
- **What a Set adds stays in CuePoint.** The export writes a Set as one playlist
  of its entries in running order, through the same path as a Collection
  (DEC-109); chapters, times, notes and acknowledgements never reach the file,
  the preview or the export record.

## Consequences

Positive:

- The tree, folders, drag, rename, delete, duplicate, the membership rule, the
  refresh warning and the export path work for Sets without a second copy.
  PREP-07 needed no new export branch: a Set exported with the same entries as a
  Collection writes a byte-identical file.
- A launch backup is a whole-database copy, and every Set table is in it, so a
  restore brings a Set back whole beside the Collections it sits with
  (`test_backup_restores_sets.py`).
- The database itself refuses Set data that does not belong to a Set, and an
  entry without a chapter cannot be written.
- Measured at 50,000 tracks (500 nodes, 100,000 entries, 400 export records),
  m0025 takes 324–341 ms median on the machine PREP-12 ran on, and 785 ms where
  PREP-01 first measured it, against a one-second budget. Every row, id and
  sequence value is unchanged and the foreign-key check is clean
  (`scripts/bench_sets.py`, run by `test_sets_scale.py` at 5,000 tracks on every
  full suite).

Negative:

- **The rebuild rewrites three tables once**, with every row foreign-key
  checked. It was weighed against a runner mode that disables keys for a
  migration (SQLite's twelve-step rebuild), which would skip rewriting
  `collection_tracks`; not built, because it adds a mode where references go
  unchecked to save a fraction of a second, once.
- **Every future test of `kind` has two possible meanings**, and a wrong one
  fails quietly: a Set not offered somewhere, or offered as a Collection. The
  audits' tables are the record to extend.
- The Library's Set scope is the browse query's Collection scope, which lists
  each track once; the running order with its repeats is read through the Set's
  own entries on the Prepare page. The Library says so above the table.
- A Set's plan exists nowhere but CuePoint's database; its backups are the only
  other copy, and the user guide says so.

## Signals to revisit

- A need for a Set to hold something that is not a library track (a Beatport
  track, a gap, a spoken link), which `collection_tracks` cannot reference.
- A second kind that needs side tables of its own: a pattern of kind-specific
  side tables would then want a shared rule for creating and duplicating them.
- A migration that needs to change `collections` again: the rebuild recipe in
  m0025 (set aside, drop child first, refill, index after, restore sequences) is
  the one to reuse, and its tests the ones to copy.
