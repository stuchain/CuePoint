# CuePoint v1.0.0 — Phase 10: Prepare, Detailed Step Specifications

Status: **Specified 2026-09-28. PREP-01 to PREP-05 are implemented (2026-09-28).** The twelve steps below replace the roadmap's
placeholder inventory (PREP-01…PREP-12), keeping its count. Per the process, no implementation
happens from this document: each step needs an explicit "Implement PREP-NN" instruction, scoped to
exactly that step, and its outcome is recorded under the step afterwards. There are no open points.
The one precision writing it found, that widening the Collection kind cascades unless the rows are
set aside first, is recorded in DEC-102.

Depends on Phases 1–4 and 6–9 (`PHASE1_FOUNDATION.md` … `PHASE9_DISCOVER.md`), all implemented, and
on Phase 5 (`PHASE5_PLAYER.md`), all steps implemented. Decision Rounds 1–12 apply (`DECISIONS.md`,
DEC-001…DEC-112). Phase 10's own decisions are DEC-102…DEC-112, alongside DEC-017 (a track may repeat
in a Set; warnings never block), DEC-058 (a Collection is ordered and may repeat, so a Set differs by
what this phase adds), DEC-059 (folders), DEC-060 (membership rules), DEC-011 (the refresh warning),
DEC-078 and DEC-086 (the export and its record), DEC-096 (the similarity rule) and DEC-050, DEC-056
(the player, unchanged).

**Owed before this phase is built past its data layer.** The roadmap says Phase 10 depends on the
player being solid. Phase 5's code is complete, but its acceptance is not: a notarization submission,
the rows that need a real audio interface, the row that needs somebody to listen, and the DEC-055
amendment. Phase 9 also owes its macOS packaged checks and a manual pass against the live API. None of
that blocks PREP-01 to PREP-05, which touch no player and no packaging. It should be closed, or
explicitly deferred by the user, before PREP-10 wires "Play Set".

## What this phase is

A DJ prepares a set as a running order: this track, then that one, in sections, to a length. CuePoint
already holds everything a running order is made of. It has the library with effective values (Phases
3, 6, 7), ordered Collections that may repeat a track (DEC-058), a similarity rule that explains itself
(DEC-096), a player that takes a list (Phase 5) and an export that writes playlists into Rekordbox
(Phase 8).

This phase adds the Set. A Set is a kind of Collection node (DEC-102) that is divided into chapters with
optional targets (DEC-103). Each entry can carry planned in and out times, which make a running time
out of what the user planned rather than an estimate (DEC-107). The Set checks every transition,
entry and chapter and explains what it finds, never blocking anything (DEC-106, DEC-017). It suggests
what fits at any point in the order, between the tracks on either side (DEC-105). It draws its tempo
and key as two lanes (DEC-111). It plays as the queue (DEC-108), exports to Rekordbox as one playlist
(DEC-109), and saves as a text, CSV or M3U8 set list (DEC-110). All of it lives on a Prepare page laid
out side by side (DEC-104, DEC-112), with Sets also in the Library's tree.

**What this phase is not.** It does not change the player: no transition preview, no crossfade, no
start or stop at the planned times (DEC-108, DEC-056). It adds no energy field (DEC-111). It does not
write chapters, times or notes into Rekordbox (DEC-109). It does not parse cue points, beat grids or
mix points, which CuePoint has never read (DEC-077). It does not change the Library page's height,
floor or default scale (DEC-112). It keeps no record of a Set being performed. It does not put Beatport
tracks in a Set: a track with no `tracks` row cannot be an entry. It writes no audio file and never
the source XML.

## What the earlier phases already built

Read this table before writing any of it again.

| Already exists | Where |
| --- | --- |
| The CuePoint tree: folders, Collections, Smart Collections, one table | `collections`, `collection_tracks` (m0009); `models/collection.py` |
| Ordered entries with their own ids, repeats allowed, gap-closing reorder | `persistence/collection_repository.py` (the only writer of `collection_tracks`) |
| Tree operations, add/insert/remove/reorder, freeze, duplicate | `services/collection_service.py` |
| The Collection routes (fifteen of ORG-08's twenty-two) | `engine/organization_api.py` (`/api/v1/collections/*`) |
| The Collections pane, its tree model, drag and context menu | `CollectionsPane.tsx`, `collectionTree.ts`, `collectionDrag.ts` |
| One operations list for the row menu and the Actions button | `SelectionActions.tsx` (ORG-11, CLEAN-13, DISCOVER-11) |
| Inspector zones, editable fields above the imported record | `TrackDetailPanel.tsx` (ORG-10) |
| The generic, windowed table, with row drag, drop, activate and context menu | `components/table/TrackTable.tsx` |
| The membership rule field over `collection_tracks` | `models/filter_rule.py` (the `collection` field, `_COLLECTION_LINK`) |
| DEC-011's reference count, with a `set_count` that answers zero | `models/references.py::ReferenceSummary`, `collection_repository.references_for` |
| The similarity rule: tempo window and gate, Camelot key relation, reasons as data | `core/similarity.py` (`Traits`, `score`, `rank`, `tempo_ranges`, `key_relation`) |
| Similarity over the library with a scope, reading effective values | `services/similarity_service.py`, `persistence/similarity_repository.py` |
| Reasons in words, held to the engine's vocabulary by a test | `screens/discover/similarReasons.ts` |
| Key parsing, formatting and the library's notation | `services/override_values.py` (`parse_key`, `format_key`, `key_notation_of`) |
| Effective values | `models/track_metadata.py::effective_value`, the browse SQL's `COALESCE` |
| Stored file status and "never checked" | `persistence/file_status_repository.py` (DEC-073, DEC-088) |
| Duplicate groups | `services/duplicate_service.py` (DEC-074) |
| The Rekordbox export: patch, preview, job, record, dialog | `data/rekordbox_export.py`, `services/rekordbox_export_service.py`, `models/rekordbox_export.py::EXPORTED_KINDS` |
| A native save dialog that remembers a folder and leaves validation to the engine | `electron/rekordboxExportDialog.ts` (EXPORT-06) |
| An atomic file write: temporary file, then replace | `data/rekordbox_export.py` |
| An M3U/M3U8 reader | `data/playlist_file.py::parse_m3u` |
| The player's list entry point | `player.playQueue(items, startIndex)` in `preload.cjs` |
| The `prepare` destination, declared and disabled, with its icon drawn | `navRegistry.ts`, `pixelIcons.ts` (SHELL-09) |
| A table rebuild that holds under `foreign_keys=ON` | `migrations/m0012_match_similarity.py` |
| The launch backup, taken before any migration runs | `services/backup_service.py::backup_on_launch` (FOUNDATION-11) |
| Activity events | `activity_events`, `IActivityService.record_event` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-102 | A `set` kind in the Collections table; entries are `collection_tracks`; side tables for the rest; the kind audited everywhere. |
| DEC-103 | Contiguous chapters, at least one per Set, with optional notes, target length and BPM range. |
| DEC-104 | The `prepare` destination as the Set Builder; Sets in the Library tree, scoping the table; "Open in Prepare", "New Set from…", "Add to Set…". |
| DEC-105 | Suggestions scored against both neighbours of an insertion point, over a chosen pool, narrowed by the chapter's range. |
| DEC-106 | Transition, entry and chapter warnings from DEC-096's rule; transition warnings acknowledgeable; none blocks. |
| DEC-107 | Typed in and out times per entry; running time counts timed entries only and says how many are untimed. |
| DEC-108 | Play Set loads the entries, repeats included, as the queue through `playQueue`; the player is unchanged. |
| DEC-109 | Sets in the Rekordbox export as one playlist each; chapters, times and notes stay in CuePoint. |
| DEC-110 | Set lists as `.txt`, `.csv` and `.m3u8` through a save dialog, and as copied text. |
| DEC-111 | A tempo lane and a key lane drawn from effective values; no energy field. |
| DEC-112 | Side-by-side layout, a row-count check at the default window size, and `TrackTable`'s double-click fix. |

## Sequencing

PREP-01 lands the schema in one forward-only migration. It goes first because it rebuilds a table that
holds user data nothing can re-derive, and that should be done once, alone, and measured. PREP-02 takes
the new kind through the Collection code, and it has to precede everything else because every later
step reads a Set through that code. PREP-03 to PREP-07 are the engine: chapters, times and notes;
suggestions; the warnings; set list files; the Rekordbox export. PREP-08 puts them on the wire. PREP-09
draws Sets in the Library, PREP-10 draws the Prepare page, and PREP-11 draws its source panel and
lanes. PREP-12 closes the phase.

**Nothing is retired in this phase.** Everything is added beside what exists, and every intermediate
build keeps working.

## Before starting any step — eight cross-cutting facts

### 1. The desktop contract is six files

Every new endpoint moves through `engine/*_api.py` + `server.py` · `engineClient.ts` ·
**`engineSupervisor.ts`** · `main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a
placeholder) · `cuepointBridge.types.ts`, gated by `desktopContract.test.ts`. The supervisor forwards
method by method and nothing type-checks it. `server.py` speaks only `do_GET` and `do_POST`, and
mutations are POSTs to action paths. Methods answer `{ value, refusal }` (DISCOVER-09), so a refusal a
person can act on reaches the renderer with its code.

### 2. A Set is a Collection node, so every test of `kind` is a decision

DEC-102 puts Sets in the same table as Collections. Code that asks "is this a Collection?" by testing
`kind == "collection"` will now get it wrong for a Set, in one of two directions. Where the question
really means "does this node hold tracks?" (adding, the entry count, the scope, export), a Set must
answer yes. Where it means "is this a crate?" (the icon, the "Add to Collection" picker, the export
dialog's label), a Set must answer no.

At the time of writing, Python tests `kind` in `collection_repository.py`, `collection_service.py`,
`organization_api.py` and `models/rekordbox_export.py`, and the renderer does so about thirty times,
across `CollectionsPane.tsx`, `collectionTree.ts`, `LibraryScreen.tsx`, `TrackDetailPanel.tsx`,
`RekordboxExportDialog.tsx`, `rekordboxExport.ts`, `EntityScreen.tsx`, `cleanRules.ts`,
`ReviewView.tsx` and `DuplicatesView.tsx`. PREP-02 and PREP-09 each record a table of every one, and
what it now answers for a Set. A search is re-run at the end of each step, because a missed test fails
quietly: a Set that is not offered somewhere, or is offered as a Collection.

### 3. The Library shows a Set's tracks once; the running order is the Set's entries

`track_query.py`'s `collection_scope` groups by track and keeps each track's earliest position. That is
right for browsing and wrong for a running order with a reprise. Everything that needs the order, with
repeats, reads the Set's entries: the Prepare table, the warnings, "Play Set", the export and the set
list files. The Library's Set scope stays the browse query, and says it lists each track once.

### 4. Every write to an entry happens in one file

`collection_repository.py` is the only writer of `collection_tracks`. Batch jobs, drags, the Actions
menu and "freeze" all go through it. A Set's entry needs a chapter from the moment it exists, so the
repository writes the `set_entries` row in the same transaction as the `collection_tracks` row. Doing it
in the service would leave one path that forgets.

### 5. Dropping `collections` deletes everything under it, unless the rows are set aside first

Under `PRAGMA foreign_keys=ON`, which the migration runner cannot switch off inside its transaction,
`DROP TABLE` performs an implicit `DELETE`. `collection_tracks` and the tree's own `parent_id` both
cascade, so a naive rebuild of `collections` empties every Collection the user has. PREP-01 copies both
tables aside before either is dropped, as m0012 did, and a test fails if the order is ever reversed.

### 6. Suggestions and warnings are judged by one rule

A tempo jump is "outside DEC-096's window, half and double time counted". A key clash is "no relation
on DEC-096's wheel". Both are read from `core/similarity.py`, not restated. A track Suggestions offered
for a slot therefore never has a tempo warning there, and a test holds that. Key only adds points in
DEC-096, so a suggested track can still clash, and the warning then says exactly that it earned no key
points.

### 7. Two kinds of file leave CuePoint in this phase, and neither is audio

The Rekordbox export gains Sets (PREP-07), and set lists are new (PREP-06). Both write one new file to a
path a save dialog returned, validated by the engine and written atomically. Neither opens an audio file
or the source XML. CLEAN-10's file-write boundary test names every module that may write, and PREP-06
adds the set-list writer to it as a text-file writer.

### 8. Times are whole seconds and belong to the entry

`tracks.duration_seconds` is a whole number of seconds and may be null. Planned times match it, and are
stored on the entry rather than the track, because the same track twice in a Set is planned twice
(DEC-107).

---

## PREP-01 — The Set Schema ✅ IMPLEMENTED 2026-09-28

**Objective**: Migration `m0025_sets`: the `set` kind, and the tables a Set needs that a Collection
does not.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**: m0012's rebuild pattern; m0009's DDL for both tables; the migration runner.

**Design**:

- **Rebuild `collections` and `collection_tracks`**, identical to m0009 except that `kind` accepts
  `'set'`:
  1. Copy every row of both tables into plain copy tables (not `TEMP`: the runner's transaction covers
     one database).
  2. Drop `collection_tracks`, then `collections`. With the rows copied, the implicit `DELETE` and its
     cascades remove nothing that is not already safe.
  3. Recreate both tables and their three indexes with m0009's DDL, widened.
  4. Insert every row back with its id. Restore `sqlite_sequence` for both, so an id handed out once is
     never handed out again.
  5. Drop the copies.
- **Rebuild `rekordbox_export_playlists`** so `kind` accepts `'set'`. It is a child of
  `rekordbox_exports`, so dropping it cascades nothing, but its rows are the export history DEC-086
  keeps, and they are copied and restored the same way. Its index on `export_id` is recreated.
- **New tables**:

  ```sql
  CREATE TABLE set_details (
      collection_id INTEGER PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
      notes         TEXT,
      updated_at    TEXT NOT NULL
  );
  CREATE TABLE set_chapters (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id  INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      position       INTEGER NOT NULL,
      name           TEXT    NOT NULL DEFAULT '',
      notes          TEXT,
      target_seconds INTEGER CHECK (target_seconds IS NULL OR target_seconds > 0),
      bpm_min        REAL    CHECK (bpm_min IS NULL OR bpm_min > 0),
      bpm_max        REAL    CHECK (bpm_max IS NULL OR bpm_max > 0),
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL,
      CHECK (bpm_min IS NULL OR bpm_max IS NULL OR bpm_min <= bpm_max)
  );
  CREATE UNIQUE INDEX idx_set_chapters_position ON set_chapters (collection_id, position);
  CREATE TABLE set_entries (
      entry_id    INTEGER PRIMARY KEY REFERENCES collection_tracks(id) ON DELETE CASCADE,
      chapter_id  INTEGER NOT NULL REFERENCES set_chapters(id),
      in_seconds  INTEGER CHECK (in_seconds IS NULL OR in_seconds >= 0),
      out_seconds INTEGER CHECK (out_seconds IS NULL OR out_seconds > 0),
      note        TEXT,
      CHECK (in_seconds IS NULL OR out_seconds IS NULL OR in_seconds < out_seconds)
  );
  CREATE INDEX idx_set_entries_chapter ON set_entries (chapter_id);
  CREATE TABLE set_acknowledgements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entry_id INTEGER NOT NULL REFERENCES collection_tracks(id) ON DELETE CASCADE,
      to_entry_id   INTEGER NOT NULL REFERENCES collection_tracks(id) ON DELETE CASCADE,
      warning       TEXT    NOT NULL,
      compared_json TEXT    NOT NULL,
      created_at    TEXT    NOT NULL,
      UNIQUE (from_entry_id, to_entry_id, warning)
  );
  CREATE INDEX idx_set_acknowledgements_to ON set_acknowledgements (to_entry_id);
  ```

- **Why `chapter_id` does not cascade.** Deleting a chapter that still holds entries is a mistake the
  service must not make (DEC-103 moves them first), so the database refuses it. The key is the default
  `NO ACTION`, checked at the end of the statement, so deleting a whole Set, which removes its chapters
  and its entries in one cascade, is still allowed.
- **No `CHECK` on `warning`.** Its vocabulary is PREP-05's and lives in `core/`, for the reason DEC-086's
  precision gave for `key_format`: a forward-only schema cannot revise a restated list.
- **Models** beside the tables: `SetDetails`, `SetChapter`, `SetEntryPlan`, `SetAcknowledgement`, with
  `from_row` and validation in the style of `models/collection.py`. `KIND_SET` is added to
  `models/collection.py` in PREP-02, not here, so this step changes no behavior.

**Tests**: A database at version 24 holding folders, Collections, Smart Collections, frozen
Collections, repeated entries and export records migrates with every row, id, position, index and
`sqlite_sequence` value unchanged. A test that performs the drops before the copies fails, which proves
the order is load-bearing. An upgraded database's schema text equals a fresh database's. Each `CHECK`
refuses what it should. Deleting a chapter with entries is refused. Deleting a Set removes its chapters,
entries, plan rows, details and acknowledgements and no tracks. Deleting a track removes its entries'
plan rows and acknowledgements.

**Acceptance criteria / DoD**: The migration applied to a 50,000-track library with 500 nodes and
100,000 entries, measured and recorded. `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: High. This is the first migration since m0012 to rebuild a table holding user data, and the
first where a mistake deletes it silently. The launch backup is the recovery path, and a test proves
the backup precedes the migration (FOUNDATION-11's test already does; this step re-runs it against
m0025).

**Complexity**: **M**

**Outcome**: Implemented (2026-09-28). Migration `m0025_sets` lands the `set` kind and the four
tables. On a copy of a 50,000-track version-24 library with 500 nodes, 100,000 entries and 400 export
records, it takes a median of **785 ms** over five copies (maximum 815 ms), against a budget of one
second. Every row, id and sequence value is unchanged, and the foreign-key check is clean. Nothing
creates a Set yet: `CREATABLE_KINDS` is still folder and collection, so this step changes no behavior
a user can reach.

**What was built.**

- `migrations/m0025_sets.py`. It sets aside all three tables and the sequence values, drops them child
  first, recreates them, refills them, builds their indexes and restores the sequences, then creates
  the four new tables. The rebuilt tables' DDL is m0009's and m0020's with only the `CHECK` widened.
- `models/set_plan.py`: `SetDetails`, `SetChapter`, `SetEntryPlan` and `SetAcknowledgement`. Notes use
  the library's own `normalize_notes`. Times must be whole seconds, a chapter name is at most 120
  characters and may be empty, and comparison data must be a JSON object. `SetEntryPlan.is_timed` and
  `planned_seconds` state DEC-107's rule: timed means an out time, and an empty in time is the start.
- `KIND_SET` in `models/collection.py`, and `set` in `EXPORTED_KINDS`, with a Set's export row refused
  if it carries rules, as a Collection's is. `CollectionKind` and the two export-playlist `kind`
  unions gain `"set"` in `engineClient.ts` and `cuepointBridge.types.ts`, as types only.
- `models/set_plan.py` and `models/collection.py` join the strict mypy gate.

**Where the specification was wrong, and what was done instead.** Five points, each settled the most
durable way and recorded here rather than left to be rediscovered.

1. **The vocabulary lands with the schema, not in PREP-02.** The specification said `KIND_SET` would
   wait for PREP-02 "so this step changes no behavior". But the repository already holds each `CHECK`
   and its model constant to one list: `test_the_kind_check_says_what_the_model_says` for the export
   table, and a TypeScript contract test for the export record. A schema that stores `set` beside models
   that refuse to read it back would break that rule, or the tests would have to be weakened. So
   `KINDS`, `EXPORTED_KINDS` and the TypeScript unions all gain `set` here, and the organization schema
   test now reads the kinds from `KINDS` and holds the `CHECK` to it. Behavior is still unchanged: the
   create route accepts only folder and collection, and the services create nodes of fixed kinds.
   `holds_tracks`, the kind summary and every other caller are PREP-02's audit, as specified.
2. **The database refuses Set data that does not belong to a Set.** The specified DDL let a chapter
   hang off any node, and let an entry's plan name a chapter in a different Set. m0009's principle is to
   make such mistakes impossible rather than unlikely, and DISCOVER-02 had already used composite
   references to that end. So:
   - `set_details` references `collections(id, kind)` with a `kind` that can only be `'set'`.
   - Chapters reference `set_details`.
   - A plan references its entry as `collection_tracks(id, collection_id)` and its chapter as
     `set_chapters(id, collection_id)` with the same `collection_id`.
   - An acknowledgement's two ends reference `set_entries(entry_id, collection_id)` with one
     `collection_id`.

   Four unique indexes serve as the parent keys: `collections(id, kind)`,
   `collection_tracks(id, collection_id)`, `set_chapters(id, collection_id)` and
   `set_entries(entry_id, collection_id)`. Each leads with a primary key, so every row already
   satisfies it. A side effect worth having: a Set that holds details cannot be turned into another kind
   while it has them.
3. **`set_details` and `set_entries` are `WITHOUT ROWID`.** Both are keyed by another table's id. In a
   rowid table an omitted `INTEGER PRIMARY KEY` is given the next free number, and the tests construct
   the case where that number names a real, unplanned entry in the same Set, which the reference would
   then accept. This is the trap DISCOVER-02 found for tables keyed by a Beatport id.
4. **Chapter positions are indexed, not unique.** The specified `UNIQUE (collection_id, position)`
   contradicts m0009's reasoning for `collection_tracks`: chapters are reordered, SQLite has no deferred
   uniqueness, and a swap would violate the index halfway through. Contiguity belongs to the service,
   as the specification already said of entries.
5. **The rebuilt tables' indexes are built after the refill.** Built first, the refill of 100,000
   entries took 973 ms of a 1.12 s migration, keeping four indexes current one row at a time. Built
   after, the whole migration takes 785 ms. Most of what remains is the foreign-key check on every
   restored row. The runner cannot switch that off inside its transaction, and it is worth keeping: it
   proves each row still points at something. A runner mode that disables keys for a migration
   (SQLite's documented twelve-step rebuild) would avoid rewriting `collection_tracks` at all. It was
   weighed and not built, because it adds a mode where the database's references are unchecked to save
   a fraction of a second, once.

Two assumptions were checked rather than trusted. `defer_foreign_keys` was in the first draft, to let a
Collection filed under a folder made after it (so with a lower id than its parent) be refilled. It was
removed: SQLite checks an immediate key at the end of each statement, and each refill is one
statement. The upgrade fixture holds a tree shaped like that. And dropping `collection_tracks` before
`collections` turned out not to be what protects the rows, which the copies do. It keeps the drop
cheap, because the other order cascades a delete to every entry just before the table goes anyway. The
test and the migration's docstring say so.

**Tests**: 187 new: 93 in `src/tests/unit/persistence/test_sets_schema.py` and 94 in
`src/tests/unit/models/test_set_plan_models.py`.

- **The rebuild.** Each rebuilt table's DDL equals its version-24 text with only the `CHECK` widened.
  Columns, references and indexes are the same, plus exactly the two named unique indexes. Nothing
  outside the rebuilt tables pointed into them before; only `set_details` and `set_entries` do now. No
  working table is left behind.
- **The upgrade.** The version-24 fixture has a nested tree, a Collection older than its folder, a
  repeat, a Smart Collection, a frozen Collection, deleted nodes, entries and export rows (so each
  sequence sits above its highest id), and rows in the tables around them. It keeps every row of every
  table and every sequence value, and new ids continue from them. The foreign-key and integrity checks
  are clean. The repository reads the same tree and entries. Folder and track deletes still cascade.
  The schema equals a fresh one. Empty tables gain no sequence row.
- **The hazard.** A test drops `collections` first inside a savepoint and watches `collection_tracks`
  empty. The migration's own statement order is checked: every copy before any drop, entries before
  nodes. A migration made to fail halfway leaves version 24 and every row.
- **The new tables.** Columns in order. `WITHOUT ROWID` and `AUTOINCREMENT` where intended. The whole
  reference map. Every reference leads an index, and every composite reference has its unique key.
  Each refusal is tested: details on a folder, Collection or Smart Collection; a plan for a
  Collection's entry; a chapter from another Set; a plan naming the wrong Set; an acknowledgement
  across two Sets, of an unplanned entry, or from an entry to itself; a second plan per entry. Each
  `CHECK` is tested at its boundaries. Each cascade is tested: deleting a Set, its folder, a track or
  one entry takes exactly what it should. A chapter still holding entries cannot be deleted, and
  neither can a Set's details while its entries are planned.
- **The models.** Each is exactly its table, except `set_details.kind`, a constant the database fills.
  Each round-trips a real row. Every refusal names its field.

Three deliberate breakages were each caught:

- dropping `WITHOUT ROWID`, by the two behavioural tests as well as the DDL check;
- making the chapter reference plain, by three tests;
- removing `collection_tracks(id, collection_id)`, by 5 failures and 40 errors.

A fourth, a migration made to fail after its last statement, is a test of its own and leaves version
24 intact.

**Checks run**: the full Python suite (10,111 passed, 62 skipped, on eight workers); `ruff check` and
`ruff format --check` on `src/` with the pinned ruff 0.14.0; the
strict mypy gate with two more modules; `check_no_qt_in_core.py`; the backup-before-migration and
concurrent-migration tests; the renderer's type-check, lint (the 8 existing warnings) and 3,186 tests;
the Electron type-check and 490 tests; and `git diff --check`.

---

## PREP-02 — The Set Kind Through the Collection Code ✅ IMPLEMENTED 2026-09-28

**Objective**: A Set is created, filed, filled, counted, referenced and ruled on by the code that does
all of that for Collections, and every test of `kind` is correct for it.

**User-visible result**: None yet.

**Dependencies**: PREP-01.

**Existing code reused**: `collection_repository.py`, `collection_service.py`, `organization_api.py`,
`filter_rule.py`'s `collection` field, `references_for`.

**Design**:

- **The kind.** `KIND_SET = "set"` is already in `KINDS` (PREP-01 landed the vocabulary with the
  schema; see its outcome). `Collection.holds_tracks` is true for a Collection or
  a Set, and `Collection.is_set` is added. The repository's kind summary (the delete preview) counts
  Sets.
- **The kind audit, Python side.** Every test of `kind` in `src/cuepoint` is listed in the outcome with
  what it now answers for a Set.
- **Every entry is in a chapter.** The repository writes a `set_entries` row whenever it writes a
  `collection_tracks` row for a Set, in the same transaction. Appending goes into the last chapter.
  Inserting at a position goes into the chapter of the entry before it, or the first chapter at
  position 0. A move follows the same rule unless the caller names a chapter. After every write to a
  Set, the repository checks contiguity: in entry order, chapter positions never decrease. A violation
  raises and rolls back, because it is a bug and not a user error.
- **Creating a Set** makes the node, a `set_details` row and one unnamed chapter, in one transaction.
- **A size limit.** `MAX_SET_ENTRIES = 1000`, a named constant. The Set editor reads a Set whole, and a
  ten-hour set is about 150 tracks. An add that would pass the limit is refused before anything is
  written, with the numbers.
- **"New Set from…"** copies a Collection's entries in order with repeats, a Smart Collection's current
  membership in its stored sort (as a freeze does), a Rekordbox playlist in its order, or a selection
  resolved once, at start (DEC-063), in the table's order. Everything goes into one chapter. It records
  one activity event, as a freeze does, because it copies membership at a moment. Nothing is converted
  in place.
- **Duplicating a Set** copies its chapters, targets, notes, times and acknowledgements, remapped to the
  new entries. It is how last week's set becomes this week's.
- **Adding many tracks at once** follows DEC-058: tracks already in the Set are skipped and counted, and
  a deliberate repeat is an explicit single insert.
- **References.** `references_for` splits by kind. `ReferenceSummary` gains `set_track_count` beside
  `set_count`, is extended rather than renamed, and the Collection kinds exclude Sets. DEC-011's
  message states Sets as their own kind ("4 in 1 Set").
- **Rules.** The `collection` rule field accepts a Set as its value. `EXISTS` over `collection_tracks`
  already means "in this Set" with no compiler change, and a test proves it. DEC-060's refusal of a rule
  naming a Smart Collection is unchanged.
- **The existing routes.** `/api/v1/collections/create` accepts `kind: "set"`, and the tree and entries
  routes return Sets with their kind. Nothing else on the wire changes in this step.

**Tests**: Creating a Set makes one chapter. Every repository write path (add, insert, batch add,
remove, reorder, freeze into a Set's folder, duplicate) leaves every entry of a Set with a plan row and
contiguous chapters, including a property test over random sequences of edits. The limit refuses at 1,001
with nothing written. "New Set from…" each of the four sources, with a repeat preserved from a
Collection. Duplicate remaps acknowledgements. References count Sets separately, and a track in a Set and
a Collection is counted once in each. A Smart Collection rule "in Set X" resolves to the Set's tracks.
A Collection's behavior is unchanged: its existing tests pass unmodified.

**Acceptance criteria / DoD**: The audit table is in the outcome, with a final search showing nothing
unlisted. `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Medium. The risk is a `kind` test not found, and the audit is the answer to it.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-28). A Set can be created, filed, filled, moved, counted, referenced,
ruled on, copied from a Collection, a Smart Collection, a Rekordbox playlist or a selection, and
duplicated. Every entry written into a Set gets its chapter in the same transaction, by every path.
Nothing a user can reach changes yet: the renderer creates no Set until PREP-09.

**What was built.**

- **The kind.** `Collection.holds_tracks` is true for a Collection or a Set. `Collection.is_set` is
  added. `SubtreeSummary` gains `sets`, and `nodes` counts them.
- **The one writer plans every entry** (`persistence/collection_repository.py`).
  - Creating a Set writes the node, its `set_details` row and one unnamed chapter together.
  - `add` and the new `append` put entries into the last chapter. `append` keeps repeats and order
    and exists for copies. `add` still skips what is already there (DEC-058).
  - `insert_at` puts an entry into the chapter of the entry before it, or the first chapter at
    position 0.
  - `reorder_entry` keeps the entry's chapter when that still reaches the new position, and otherwise
    follows the insert rule (correction 1).
  - Both take an optional `chapter_id`, refused unless the chapter reaches the position (correction 2).
  - After every write to a Set, `_check_set` reads it back: at least one chapter, every entry planned,
    and chapter positions never decreasing in entry order. A violation raises `SetIntegrityError`
    (a `RuntimeError`, so a 500: it is a bug, not a refusal) and the transaction rolls back.
  - `duplicate_set` copies the Set whole in one transaction and remaps every id.
  - `references_for(track_ids, kind)` answers one kind at a time, Collections by default.
  - Reads: `set_details`, `chapters`, `entry_plans`, `acknowledgements`.
- **The limit.** `MAX_SET_ENTRIES = 1000` and `SetLimitError` (a `ValueError`, so a 400) are in
  `models/set_plan.py`. The message has the numbers: "'Friday' holds 990 entries, and adding 20 would
  make 1,010: a Set holds at most 1,000". Only the tracks that would actually be added count. The
  repository refuses before writing, and the batch refuses before its first chunk (correction 3).
- **The service** (`services/collection_service.py`).
  - `create_set`.
  - `create_set_from(SetSource, name, parent_id)`, which copies:
    - a Collection's entries, repeats included;
    - a Smart Collection's current answer, in its saved sort;
    - a Rekordbox playlist's tracks, in its order and with its repeats;
    - a selection, in the order given.

    Everything goes into one chapter. Reading the source, the limit check, the Set, its entries and
    one `set.created_from` activity event are one transaction.
  - `duplicate_set`, named "… copy" by default and trimmed to fit, as a Smart Collection's duplicate
    is.
  - `check_add`, which asks whether an add would fit without writing anything.
  - Insert and reorder pass a chapter through.
- **References** (`models/references.py`, `services/library_service.py`). Sets are counted as Sets, and
  the Collection counts exclude them. `ReferenceSummary` gains `set_track_count` and `set_ids`, extended
  rather than renamed. A track in a Set and a Collection counts once in each and is one referenced
  track. The refresh refusal reads "3 in 2 Collections, 4 in 1 Set, …".
- **The wire.**
  - `/api/v1/collections/create` accepts `kind: "set"`.
  - The delete summary carries `sets`.
  - The reference summary carries `set_track_count` and `set_ids`.
  - The TypeScript types match (`CollectionSubtree`, `RefreshReferences`), and the renderer's typed
    fixtures gained the new fields as zeros. No renderer behavior changed.

**The kind audit, Python side.** Each place in `src/cuepoint` that asks what kind a node of CuePoint's
tree is, and what it now answers for a Set. The Rekordbox mirror (`RekordboxPlaylist.is_folder`, used by
the import, the playlist repository and "New Set from…" a playlist) is a different type and a
different tree, so it is not listed.

| Where | The question | A Set |
| --- | --- | --- |
| `models/collection.py` `holds_tracks` | Does it hold entries? | **Yes** (widened) |
| `models/collection.py` `is_set` (new), `is_folder`, `is_smart` | Which kind is it? | A Set; not a folder, not smart |
| `models/collection.py` `__post_init__` | Rules only on a smart node; none on a folder | Neither rule applies. Like a Collection, a Set may carry rules no code writes |
| `models/rekordbox_export.py` `EXPORTED_KINDS` and its rule checks | May the export record name it? | Yes, and never with rules (PREP-01) |
| `collection_repository` `subtree_summary` | What would a delete take? | Counted as `sets` |
| `collection_repository` `create`, `_append`, `insert_at`, `reorder_entry`, `remove_entries` | Does this write need a plan? | Yes, and a check after it |
| `collection_repository` `references_for` | Which kind is being counted? | Sets when asked for, never among Collections |
| `collection_repository` `duplicate_set` | Is it a Set? | Only a Set is copied this way |
| `collection_service` `_depth_under` (create and move) | May it be a parent? | **No**: only a folder contains nodes |
| `collection_service` `_require_smart` (resolve, update rules, duplicate, freeze) | Is it a saved question? | No, refused: "'Friday' is a set, not a smart collection" |
| `collection_service` `_require_collection` (add, insert, `check_add`; the batch through it) | May tracks be put in it? | **Yes** |
| `collection_service` `freeze` | What does a freeze make? | A Collection, a crate, never a Set |
| `collection_service` `_source_tracks` | What can "New Set from…" copy? | Not a Set: "already a Set: duplicate it" |
| `collection_service` `_require_set`, `check_add` | Is it a Set? | New, Set-only |
| `organization_api` `collection_tree` | Should its rules be resolved? | No: only a Smart Collection's are |
| `organization_api` `CREATABLE_KINDS` | May `create` make it? | **Yes** (widened) |
| `organization_api` `collections_holding` (the Inspector) | No test | Listed with `kind: "set"` |
| `rule_references` `_check_collections` | May a rule name it? | **Yes**: only a Smart Collection is refused (DEC-060) |
| `library_service` `references_for` | Which kind is this count? | Its own |
| `library_api` `resolve_scope` | No test for `collection`; `smart` goes through `_require_smart` | Scopes as a Collection; refused as `smart` |
| `rekordbox_export_service` (validate, build, `_entries`, `_playlist_preview`, `_playlists_under`) | Smart, folder, or otherwise a playlist? | Otherwise a playlist: its entries in order with repeats. PREP-07 tests and labels this |
| `filter_sql` `_COLLECTION_LINK`, `track_query` Collection scope | No test | "In Set X" and the Library scope work unchanged |

The final search matched `KIND_*`, `is_folder`, `is_smart`, `is_set`, `holds_tracks`,
`CREATABLE_KINDS`, `EXPORTED_KINDS`, `c.kind`, `SMART` and string comparisons of `kind` across
`src/cuepoint` (migrations aside), and found nothing that is not in the table.

**Where the specification was wrong, and what was done instead.**

1. **A moved entry keeps its chapter when it can.** The specified rule, "a move follows the insert
   rule", assigns a moved entry to the chapter of the entry before it. Reordering an entry to the first
   place of its own chapter would then silently move it into the chapter before, which no user means.
   The first test of a reorder within a chapter caught it. A moved entry now keeps its chapter whenever
   that chapter still *reaches* the new position (at or after the chapter before, at or before the
   chapter after), and follows the insert rule only when it does not. A regression test holds it, and
   removing it is caught.
2. **A chapter may be named on an insert, not only on a move.** An insertion point between the last
   entry of one chapter and the first of the next is in both chapters. Without a way to name one, a
   drop at the top of a chapter could only land at the end of the one before. The same "reaches" rule
   validates both.
3. **The batch checks the limit before its first chunk.** The specification said an add past the limit
   is "refused before anything is written". The batch path commits one chunk at a time, so a
   repository-only check would have added chunks until the limit stopped it. `BatchService.check(op,
   track_ids)` and an `admit` hook on each operation refuse the whole selection first. The engine asks
   this before it decides whether to start a job, so an oversized "Add to Set" is a 400 and never a
   job that fails.
4. **Two public shapes grew, additively.** The specification said nothing else on the wire changes, but
   the two summaries it changes are serialized as they are:
   - The delete summary gains `sets`, so `nodes` stays the sum of the kinds it names.
   - The reference summary gains `set_ids` beside `set_track_count`, for the reason ORG-13 gave for
     `collection_ids`: a user whose Set a refresh emptied is owed its name.

   The one engine test that pins the delete shape and the one that lists the summary's keys were
   extended. The two wording tests of the refresh refusal now expect "N in 1 Set".
5. **The Collection repository's `references_for` takes a kind**, defaulting to Collections. That keeps
   its existing tests unmodified. One test double of it gained the parameter.
6. **"New Set from…" files at the top level unless told otherwise, and is named after its source.** The
   specification left both open. The caller passes `parent_id`, which the renderer knows. A selection has
   no name of its own, so it needs one. A Set is refused as a source and pointed at duplicate, which also
   copies the plan. A folder is refused.
7. **`CollectionService` takes the playlist repository**, optionally, for "New Set from…" a playlist.
   The bootstrap passes the registered one, and every existing construction keeps working.

**Handed on.**

- **PREP-07:** the export already writes a Set as one playlist through the "not a folder, not smart"
  path, with repeats in order. PREP-07's work is the tests and the label.
- **PREP-09, the renderer half of the audit:**
  - `describeDeletion` does not yet name Sets.
  - `referenceWarning` still says "in 1 Set" without the count.
  - The refresh's "emptied" marking reads `collection_ids` only, which no longer includes Sets. It
    should read `set_ids` too.

**Tests**: 115 new, in three files.

- **`src/tests/unit/persistence/test_set_entries.py` (64):**
  - Creation and its transaction, and the delete preview.
  - Every write path: the last chapter, the chapter before, the first at 0, and named chapters that
    reach, do not reach, or belong to another Set.
  - Keeping a chapter on a move.
  - The limit at 1,000 and 1,001 by every path, with nothing written.
  - Removal, clear and delete cascades.
  - Duplicate: chapters, targets, notes, times, repeats and remapped acknowledgements, with the two
    Sets independent.
  - References by kind.
  - `SetIntegrityError` for an unplanned entry, chapters out of order and a Set with no chapter, each
    rolling back.
  - No Set row for a Collection by any path.
  - A Hypothesis property test: 60 random sequences of up to 40 edits, including refused named
    chapters, which must leave the Set exactly as it was. The invariants are recomputed from the rows,
    not taken from the module's own check.
  - An exhaustive check of every insertion point against every chapter.
- **`src/tests/unit/services/test_collection_service_sets.py` (40):**
  - The tree rules for a Set.
  - Membership by every service path.
  - `check_add`.
  - "New Set from…" each source: a Collection's repeat, a Smart Collection's saved order, a playlist's
    order and repeat, and a selection's order. Its refusals (folder, Set, broken rules, no name, past
    the limit, a failure part-way) each leave nothing behind, and it writes one event.
  - Duplicate and its refusals.
  - The batch: last chapter, removal of repeats, and a selection refused whole with a 100-track chunk
    size.
  - References counted once per kind.
  - "In Set X" and "not in Set X" resolving to the Set's tracks, and breaking when it is deleted.
    DEC-060's refusal unchanged.
  - A freeze into a Set's folder leaving the Set as it was.
- **`src/tests/unit/engine/test_engine_organization_sets.py` (11):**
  - Create, the tree, the folder, the refusals.
  - Every entry route planning what it writes.
  - The Inspector's list and the Library scope.
  - The delete preview.
  - The limit as a 400 with its message, for an add and for a batch.

Seven deliberate breakages were each caught:

- `_check_set` doing nothing;
- a move not keeping its chapter;
- an insert left unplanned;
- the batch skipping the admission check;
- `holds_tracks` narrowed back to Collections;
- references not split by kind;
- duplicate not remapping acknowledgements.

Every existing Collection test passes unmodified except the four shape and wording tests, and the test
double, named above.

**Checks run**:

- **Python:** the full suite (10,226 passed, 62 skipped, on eight workers); `ruff check` and
  `ruff format --check` on `src/` with the pinned ruff 0.14.0; the strict mypy gate;
  `check_no_qt_in_core.py`; the desktop version coupling; the engine health smoke test.
- **Renderer:** the type-check, lint (the 8 existing warnings) and 3,186 tests.
- **Electron:** the type-check and 490 tests.
- `git diff --check`.

---

## PREP-03 — Chapters, Times and Notes ✅ IMPLEMENTED 2026-09-28

**Objective**: Everything a user edits on a Set that is not an entry's position, and the running time
that follows from it.

**User-visible result**: None yet.

**Dependencies**: PREP-02.

**Existing code reused**: The repository's transaction and gap-closing reorder.

**Design**:

- **`core/set_timing.py`**, with no SQL and no I/O:
  - `parse_time(text)` reads `m:ss` and `h:mm:ss` into whole seconds and refuses anything else;
    `format_time(seconds)` writes them back.
  - `planned_seconds(in, out)`: `out - (in or 0)` when `out` is set, otherwise none (DEC-107).
  - `running_time(plans)`: the sum over timed entries, and how many are untimed.
  - `starts_at(plans)`: each entry's start, up to the first untimed entry and none after it.
- **`services/set_service.py`**:
  - Chapters: `create_chapter` (at a position, or after a chapter), `rename_chapter`,
    `set_chapter_notes`, `set_chapter_targets(target_seconds, bpm_min, bpm_max)`, `move_chapter`
    (the chapter's entries move with it as a block, so contiguity holds), `delete_chapter` (its entries
    join the chapter before it, or the one after for the first, and the last chapter cannot be deleted)
    and `split_chapter_at(entry_id, name)` ("start a chapter here", the gesture a user most often wants).
  - Entries: `move_entry(entry_id, position, chapter_id=None)`, the generic reorder with PREP-02's
    chapter rule; `set_entry_times(entry_id, in_text, out_text)`, validated by `parse_time`, with
    `in < out`, and `out` no later than the track's length when it is known; `set_entry_note`.
  - The Set: `set_notes`.
  - `plan(set_id)`: the chapters and every entry's chapter, times and planned length, with the running
    time per chapter and for the Set.
- **What edits record.** Nothing in the activity feed and nothing in `track_history`, as Collection edits
  record nothing (Phase 6). A Set's plan is not track metadata.

**Tests**: `parse_time` on every accepted and refused form. Running time and "starts at" with untimed
entries at the start, the middle and the end. Each chapter operation keeps contiguity. Deleting the first
chapter, a middle chapter and the last remaining chapter. Moving a chapter moves its entries.
`split_chapter_at` on the first entry and the last. Times refused past a known length and accepted when
the length is unknown. A repeat planned twice keeps two sets of times.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-28). Everything a user edits on a Set that is not which tracks it
holds can now be edited: chapters, their notes and targets, each entry's planned times and note, and
the Set's notes. The plan reads back with the running time of each chapter and of the Set. Nothing a
user can reach changes yet: the wire is PREP-08's, and the page is PREP-10's.

**What was built.**

- **`core/set_timing.py`**, with no SQL and no I/O:
  - `parse_time` reads `m:ss` and `h:mm:ss` into whole seconds and refuses anything else with the
    reason. `format_time` writes the shortest form back, and is its inverse for every time it can
    read.
  - `parse_optional_time` reads a blank field as no time, which is how a time is cleared.
  - `planned_seconds` states DEC-107's rule, and a property test holds `SetEntryPlan` to agree with it.
  - `running_time` returns a `RunningTime` (seconds, timed, untimed), which adds.
  - `starts_at` gives each entry's start up to and including the first untimed entry.
- **`persistence/set_repository.py`**, `SetRepository`: all SQL for a Set's plan that does not move an
  entry.
  - It inserts, updates, deletes and splits chapters, and writes entries' times and notes and the Set's
    notes.
  - It reads a chapter, one entry or all of a Set's entries with their plan and track length, a
    chapter's first entry, and the chapter count.
  - It never writes `collection_tracks`, and a test holds it to that.
- **`CollectionRepository.move_chapter`**: the one chapter operation that moves entries, so it lives
  with the one writer of entries. The chapter moves by range arithmetic, then the Set's entries are
  renumbered in one statement ordered by chapter and then by their old place, so the chapter's entries
  travel as one block.
- **`persistence/set_integrity.py`**: the check that ends every write to a Set, moved out of the
  Collection repository so both writers call one function. It now also holds chapter positions to
  `0 … n - 1`.
- **`services/set_service.py`**, `SetService`:
  - Chapters: `create_chapter` (at a position, after a chapter, or at the end), `rename_chapter`,
    `set_chapter_notes`, `set_chapter_targets`, `move_chapter`, `delete_chapter` and
    `split_chapter_at`.
  - Entries: `move_entry` (PREP-02's rule, with an optional chapter), `set_entry_times` and
    `set_entry_note`.
  - The Set: `set_notes` and `plan`.

  `plan` returns a `SetPlan` of `ChapterPlan`s and `PlannedEntry`s. It carries each entry's planned
  length, start and track length, and each chapter's entries, running time and start, with `to_dict`
  for PREP-08. It reads in one transaction, so a write between its reads cannot pair an entry with a
  chapter list that has lost its chapter.
- **Wiring.** `ISetRepository` and `ISetService` are in `interfaces.py`, and both are registered in
  `bootstrap.py`. `ICollectionRepository` gains `move_chapter`. `SetChapter.label` names a chapter in a
  refusal. `SetEntryRow` is an entry as the plan reads it; it is not a table. `core/set_timing.py` and
  `services/set_service.py` join the strict mypy gate, and the new persistence modules are already
  under it.
- **Nothing is recorded.** No activity event and no track history, as for a Collection's edits. A test
  runs every operation and counts both tables.

**Where the specification was open or wrong, and what was done instead.**

1. **Chapter SQL has its own repository, and moving a chapter does not.** The specification put
   everything in `set_service`. The SQL went into `SetRepository`, with one exception.
   `move_chapter` moves entries, so it stays in `collection_repository.py`, which keeps fact 4 whole.
   A new test scans `src/cuepoint` and fails if any module but that one has a statement writing
   `collection_tracks`.
2. **"Start a chapter here" is refused at a chapter's first entry.** The specification asked for a test
   "on the first entry" without saying what it should do. A split there would move every entry into the
   new chapter and leave the old one empty, with its name and targets holding nothing. The refusal says
   to rename the chapter instead. The test on the first entry proves the refusal, and the test on the
   last entry proves a one-entry chapter.
3. **The repository chooses the chapter a deleted chapter's entries join.** A caller choosing it could
   merge a chapter into one its entries are not beside. The repository applies DEC-103's rule itself,
   and the service refuses deleting the only chapter with a message. The repository refuses it as well,
   as an integrity error, in case the service's check is ever skipped.
4. **The integrity check holds chapter numbering.** PREP-02's check proved entry order but not that
   chapters are numbered without gaps or repeats. Every chapter operation here renumbers, so the check
   now proves it. A "lowest place is 0" condition was tried and taken out: the schema already refuses a
   negative position, so it could never fail, which a deliberate breakage showed. A test records why.
5. **What a typed time may be.** DEC-107 named the two forms. They are now exact:
   - up to three digits of minutes in `m:ss`, so `75:30` is read;
   - up to two digits of hours in `h:mm:ss`;
   - fields from 00 to 59, and ASCII digits only;
   - no bare number, fraction, sign or unit.

   The forms stop at 99:59:59 (`MAX_TIME_SECONDS`), which also caps a chapter's target.
6. **An in time is held to the track too.** DEC-107 held the out time to a known length. An in time at
   or past the end is as impossible, so it is refused as well. A stored length of zero reads as
   unknown, because it is an import that did not know the length, not a track that plays for no time.
7. **Times are written as a pair.** `set_entry_times` writes both times, and a blank clears one. An in
   time alone is kept, and the entry stays untimed. An out time of 0:00 is refused with the same "come
   in before it goes out" message as any other out time that is not after the in time.
8. **A chapter's start is part of the plan.** The specification asked only for starts per entry. A
   chapter heading showing when it starts is the obvious use, so each chapter carries one. An empty
   chapter starts where the entries before it end.

**Handed on.**

- **PREP-08:** the wire. Wire shapes are `SetPlan.to_dict` and `SetChapter` fields. The plan carries
  times in seconds only. Whether the renderer formats them with a copy of `format_time`, held to it by
  a test as DISCOVER-08 did for reasons, or the engine sends text, is PREP-08's call. A chapter's
  target takes seconds, so a typed target is parsed where it arrives, with `parse_time`.
- **PREP-05:** `plan()` already has what the warnings need about times: each entry's times and track
  length, and each chapter's running time and targets. A shortened track keeps its times, and a test
  proves the rest of the entry still edits.

**Measured** on a 1,000-entry Set in ten chapters (the limit), with half its entries timed:

| Operation | Median |
| --- | --- |
| `plan` | 13 ms |
| Moving the first chapter to the end | 7.5 ms |
| Moving an entry from first to last | 8.8 ms |
| A split followed by a delete | 10.7 ms |
| `set_entry_times` | about 2 ms |

**Tests**: 266 new, in four files.

- **`src/tests/unit/core/test_set_timing.py` (110):**
  - `parse_time` on every accepted form and every refused one, from a table, each refusal with its
    reason.
  - `format_time`, and the round trip: exhaustively up to three hours, and by property to 99:59:59.
  - `planned_seconds`, and agreement with the model.
  - Running time and "starts at" with an untimed entry at the start, the middle and the end, and a
    property holding each start to the running time before it.
- **`src/tests/unit/persistence/test_set_repository.py` (68):**
  - Inserting a chapter at every place.
  - Updating one without moving it.
  - Deleting the first, a middle, the last-placed, an empty and the only chapter.
  - Splitting in the middle, at the last entry, in the last chapter, and across a repeat.
  - Moving a chapter to every place, with plans, repeats and acknowledgements going with their
    entries.
  - Another Set untouched by each operation.
  - The check's numbering rule, with every write calling it.
  - The one-writer scan.
- **`src/tests/unit/services/test_set_service.py` (77):**
  - Each operation and each of its refusals, every refusal leaving every Set table exactly as it was.
  - Times refused past a known length and accepted when it is unknown or zero.
  - A shortened track keeping its times.
  - A repeat planned twice keeping two sets of times and two notes.
  - The plan's running times, starts, empty-chapter starts and wire shape.
  - Nothing recorded, and the container building the service.
  - A Hypothesis property: 60 random sequences of up to 40 edits of every kind, refusals included,
    each checked against DEC-103 computed from the rows.
- **`src/tests/unit/models/test_set_plan_models.py` (+11):** `SetChapter.label` and `SetEntryRow`.

Eleven deliberate breakages, each caught:

- `move_chapter` leaving the entries where they were;
- delete always joining the chapter after;
- a split moving only its one entry;
- a split allowed at a chapter's first entry;
- times not held to the track's length;
- "starts at" counting on after an untimed entry;
- the only chapter's deletion not refused by the service;
- an empty chapter's start read from the wrong place;
- an untimed entry counted as timed;
- the numbering check ignoring repeated places;
- the numbering check ignoring the highest place.

The repeated-places breakage was missed at first. `(0, 2, 2)` is the one case only that condition
catches, and it was added to the table.

Every PREP-01 and PREP-02 test passes unmodified. One existing test changed: the persistence
boundary's allow-list gains `services/set_service.py`, which opens transactions and runs no SQL,
with its reason written beside it as every other entry has.

**Checks run**:

- **Python:** the full suite (10,492 passed, 62 skipped, on eight workers); `ruff check` and
  `ruff format --check` on `src/` with the pinned ruff 0.14.0; the strict mypy gate with two more
  modules; `check_no_qt_in_core.py`; the desktop version coupling; the engine health smoke test.
- **Not run:** the renderer and Electron suites. This step changes no TypeScript and no wire shape.
- `git diff --check`.

---

## PREP-04 — Suggestions at an Insertion Point ✅ IMPLEMENTED 2026-09-28

**Objective**: DEC-105: what fits between two entries, or after or before one, explained, over a chosen
pool.

**User-visible result**: None yet.

**Dependencies**: PREP-03.

**Existing code reused**: `core/similarity.py`; `similarity_service`'s pre-selection, effective-value
reads and duplicate exclusion; `BrowseQuery` as the pool.

**Design**:

- **The rule, in `core/similarity.py`.** A new `fit(before, after, candidate)`, where either side may be
  absent. A candidate must pass DEC-096's tempo gate against each side that has a BPM. Its score is the
  mean of the sides' scores, rounded as `score` rounds. A `Fit` carries both sides' `Similarity`, so the
  reasons stay per side. `rank_fits` orders by score, then by track id. `fit_tempo_ranges(before, after)`
  intersects the two sides' windows for the pre-selection, and `tempo_gap(before, after)` says how far
  apart the neighbours are when the intersection is empty. Nothing here reads a database.
- **The service**, `services/set_suggestion_service.py`:
  - Input: the Set, and the insertion point as `before_entry_id` and `after_entry_id` (either may be
    null), so that a stale view cannot aim at the wrong gap; a pool as a `BrowseQuery` (the library, a
    Collection, a Smart Collection's rules or a Rekordbox playlist); and a limit, capped at
    `MAX_SIMILAR_LIMIT`.
  - The chapter of the insertion point narrows the pool to its BPM range when it has one, and the answer
    says so.
  - The two neighbours' tracks and their duplicate groups are excluded. Tracks already in the Set are
    kept and carry how many times they appear.
  - With both sides present and nothing able to pass both gates, the answer is empty with `no_fit`:
    the tempo gap in percent and the key relation between the neighbours. It never loosens the gate.
  - An empty Set, or an insertion point with no neighbour, is refused with a reason.
  - Each side reports the components it could not use, as `similar()` does.
- **Wire shape** follows `SimilarTracks`, with per-side reasons and `in_set`, so the renderer's reason
  words (`similarReasons.ts`) serve both.

**Tests**: The rule with one side and with two: the gate on each side, the mean, the tie by id, half and
double time against each side. The same inputs give the same list twice. An empty intersection gives
`no_fit` with the right gap. The chapter range narrows. Neighbours and their duplicates are absent, and
another entry's track is present and marked. A pool restricts. A test holds the service to scoring every
candidate in Python, as DISCOVER-08's does.

**Acceptance criteria / DoD**: At 50,000 tracks, the worst case (both neighbours in the densest tempo
band, the whole library as the pool) within **0.5 s**, DISCOVER-08's budget. `python -m pytest
src/tests` clean.

**Risks**: Medium. The mean is a judgment, which is why both sides' reasons are shown.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-28). The engine answers "what fits here" for any gap in a Set:
between two entries, or before the first or after the last. The answer is scored by DEC-096's rule
against each neighbour, with each side's reasons kept apart. The worst case, both neighbours in the
densest tempo band of a 50,000-track library with the whole library as the pool, takes **401 ms**
against the budget of **0.5 s**. Nothing a user can reach changes yet: the route is PREP-08's and the
panel PREP-11's.

**What was built.**

- **The rule, in `core/similarity.py`**, still with no SQL and no I/O:
  - `fit(before, after, candidate)`, where either side may be absent. The candidate passes the tempo
    gate of every side with a BPM, and needs at least one reason on some side. Its score is the mean of
    the sides' scores as shown, rounded as a score is. A fit against one side is exactly `score`
    against it, and a property test holds that for every generated pair.
  - `Fit` carries both sides' `Similarity`; `FitSuggestion` is a ranked fit.
  - `rank_fits` orders fits by score, then by track id, and builds reasons only for those kept, as
    `rank` does.
  - `fit_tempo_ranges(before_bpm, after_bpm)` intersects the two sides' windows. A property test holds
    it to exactly the tempos that pass both gates, asked of the rule itself.
  - `tempo_gap(before_bpm, after_bpm)` gives how far apart two tempos are as heard, counting half and
    double time.
  - The rule is stated once. A new `_side` is the gate and the matches for one seed. `score` and `rank`
    read it through `_matches` as before, and `fit` reads it for each side.
- **`models/set_suggestions.py`**, the answer, shaped after `SimilarTracks`:
  - `SetSuggestions` gives the gap's entries, the sides fitted, the gap's chapter and any BPM range
    that narrowed the pool, the notation, each side's unused components, `considered`,
    `duplicates_excluded`, `index_current`, `no_fit` and the suggestions.
  - A `SlotSuggestion` has its score, `in_set`, and a `SideFit` (score and reasons) for each side.
    The reasons are the wire objects Similar Tracks writes, so `similarReasons.ts` serves both.
  - `NoFit` gives the two BPMs, the gap in percent, and the two keys with their relation. The keys are
    `null` when either is unknown, and the relation is `null` when they clash.
  - `BpmRange` is the chapter's range, inclusive, open at either end, and never holding an unknown
    tempo.
- **`services/set_suggestion_service.py`**, `SetSuggestionService.suggest(set_id, before_entry_id,
  after_entry_id, pool, chapter_id, against, limit)`, read only:
  1. The gap is checked (below).
  2. Each neighbour is read as a seed, from its effective values.
  3. With both BPMs known and no tempo bridging them, the answer is `no_fit`.
  4. Otherwise the pool is pre-selected by the intersected windows, clipped to the chapter's range,
     or by what either side shares when neither has a BPM.
  5. The chapter's range is applied to every row read.
  6. `rank_fits` scores everything, and each side's reasons are written.
- **Reuse, not copies** (`services/similarity_service.py`). Similar Tracks' private writer is now the
  public `ReasonWriter`. Its pre-selection is now `read_candidates`, which takes any number of seeds.
  `SimilarityService` calls both with one seed, and DISCOVER-08's brute-force test still passes
  unchanged.
- **Wiring.** `ISetSuggestionService` is in `interfaces.py` and registered in `bootstrap.py`.
  `models/set_suggestions.py` and `services/set_suggestion_service.py` join the strict mypy gate.

**The gap, and its refusals.** A gap is named by two entry ids, so a view that has gone stale cannot
aim at a different gap. `InsertionPointError` is a `ValueError` with a `reason` for PREP-08 to turn into
a code:

- `empty_set`: the Set holds nothing to fit against (DEC-105).
- `no_neighbour`: neither entry is named.
- `stale`, in any of these cases:
  - the two entries are no longer adjacent in that order;
  - an entry named at an end is no longer at that end;
  - an entry has left the Set, or belongs to another one;
  - a neighbour's track has gone from the library.

Everything else a caller can get wrong is a plain `ValueError` with a message: a node that is not a
Set, a bad id, a bad limit, a bad `against`, or a chapter that does not reach the gap. A broken pool is
refused as the Library refuses it, even when nothing could have fitted.

**Where the specification was open or wrong, and what was done instead.**

1. **"Offers each side's own list" needed a way to ask for it.** DEC-105 has the answer offer each
   side's list when nothing bridges the gap. The specification's answer had only `no_fit`. The engine
   now takes `against="before"` or `"after"`, which fits one side at the same gap. It is still
   checked as that gap, and the other neighbour is still left out. The panel can offer both lists
   without the engine loosening anything. Computing both lists inside every `no_fit` answer was
   rejected: it would roughly triple the worst case for an answer the user may not open.
2. **A side with nothing to offer counts as 0 in the mean.** When a neighbour has no BPM, it has no
   gate. A candidate that shares nothing with it but suits the other side is still a fit, and the
   number says it suits one side. Dropping that side from the mean would rank it as if it suited both.
   A candidate with no reason on either side is not a fit, which is DEC-096's own gate for a seed with
   no BPM.
3. **The mean is of the sides' scores as shown.** Each side's score is rounded before the mean, so the
   number a person reads is the mean of the two numbers beside it.
4. **Which chapter.** A gap is in the chapter an entry dropped there would join (PREP-02's rule): the
   chapter of the entry before, or the first chapter at the start. A caller may name another chapter
   for a gap on a boundary, and it must reach the gap as it would for an insert.
5. **The chapter's range narrows, and never widens.** It is inclusive. A track with no BPM is outside
   any range, because it cannot be shown to be inside. When the range misses every window, the answer
   is empty but is not `no_fit`: the neighbours can be bridged, just not inside this chapter's range.
6. **`no_fit` depends on the neighbours, not the pool.** It is reported only when both sides fitted
   have a BPM and no tempo passes both gates. A pool with nothing in the window is an ordinary empty
   answer.
7. **`considered`** counts the rows read and inside the chapter's range: what was actually scored.
8. **The worst case was over budget, and was fixed without restating the rule.** The first form took
   502 ms, because a gap scores every candidate twice. `_tempo` is a pure function of two tempos, and a
   library stores BPMs to two decimals. So a dense band of 36,000 tracks holds about a thousand
   distinct tempos, and `_tempo` is now remembered (`TEMPO_MEMO_SIZE`). `_total` adds in a loop rather
   than through a generator, which is the same float from the same additions. Every similarity test
   passed before and after. Similar Tracks' own worst case got faster too, from 343 to 287 ms on this
   machine.

**Measured** (median of seven, on DISCOVER-08's library shape: 50,000 tracks, 70% at 120–130 BPM,
15% at 170–175 and 15% over 70–160; 24 keys, 40 genres, 1,200 labels, 1,700 artists):

| Answer | Candidates scored | First form | Now |
| --- | --- | --- | --- |
| A gap between two tracks at about 125 BPM, the whole library, 50 suggestions | 36,023 | 502 ms | **401 ms** |
| The same, 200 suggestions | 36,023 | 511 ms | 400 ms |
| After the last entry, one side at 140 BPM | 1,746 | 71 ms | 68 ms |
| A gap nothing bridges (120 to 140) | 0 | 29 ms | 29 ms |
| The dense gap, pool one genre | 880 | 64 ms | 63 ms |
| Similar Tracks, DISCOVER-08's worst case, for comparison | 36,037 | 343 ms | 287 ms |

The budget is `DENSE_GAP_BUDGET_SECONDS`, 0.5 s, DISCOVER-08's.

**Handed on.**

- **PREP-05:** the shared-rule test. The rule side is proven here: every suggestion passes both
  neighbours' tempo gates, by the window property and by the service's brute-force test. PREP-05's test
  inserts suggestions and reads its own warnings.
- **PREP-08:** the route takes these parameters:
  - `set_id`, `before_entry_id` and `after_entry_id`;
  - the pool as the Library's own query parameters. A Smart Collection is resolved to its rules by
    `CollectionService.resolve`, as the scope of Similar Tracks is;
  - `chapter_id`, `against` and `limit`.

  It maps `InsertionPointError.reason` to refusal codes. A `stale` refusal is the view's cue to reload.
- **PREP-11:** the panel draws each side's reasons with `similarReasons.ts` and marks `in_set`. It
  explains `no_fit` in words, from its gap and key relation, and offers each side's list through
  `against`.

**Tests**: 128 new, in three files.

- **`src/tests/unit/core/test_similarity_fit.py` (47):**
  - One side is exactly `score`, both ways, by property.
  - The mean, and the gate on each side.
  - Half and double time against each side.
  - A side with nothing to offer, and no reason anywhere.
  - A property restating the whole rule independently.
  - `rank_fits`: its order, ties by id, sameness, the limit, exclusions, and a property that it is
    every fit sorted.
  - `fit_tempo_ranges` held to the rule's own gate by property.
  - `tempo_gap` cases and refusals.
  - The tempo memo changing no answer.
- **`src/tests/unit/services/test_set_suggestion_service.py` (56):**
  - Both sides with their reasons, and the wire shape.
  - The same answer twice, ties by id, and the limit.
  - Both ends, and one side matching Similar Tracks exactly.
  - Every refusal of a gap, including a Set changed under the view.
  - `no_fit`, with an adjacent key, a clash and an unknown key; each side's own list; half time is
    not a gap; a neighbour without a BPM is never one.
  - The chapter: its range, an open end, a boundary and a named chapter, the first chapter at the
    start, a chapter that does not reach, a range the windows miss, and tracks with no BPM.
  - Neighbours and their duplicates left out. Other Set tracks kept and counted, and a repeated
    neighbour still left out.
  - Collection, playlist and rule pools, and a broken pool.
  - Nothing written, checked across every table.
  - The container.
  - **The brute-force test.** Over three seeded libraries of 220 tracks each, with overrides, repeats
    and a chapter range, every gap of a 30-entry Set is fitted three ways (both sides, before, after).
    Each answer must equal `rank_fits` over every track read from the tracks' own columns.
- **`src/tests/unit/models/test_set_suggestions_model.py` (25):** each wire shape, the range's bounds,
  and the answer's refusals.

Thirteen deliberate breakages, each caught:

- the better side instead of the mean;
- the gate held on one side only;
- windows unioned instead of intersected;
- a side with nothing dropped from the mean;
- ties broken against the id;
- duplicates suggested;
- Set tracks hidden instead of marked;
- a gap that is not adjacent accepted;
- the chapter's range used only in SQL;
- the gate loosened when nothing bridges;
- the chapter after taken by default;
- only one side's artists read;
- `in_set` counting one chapter.

Every existing test passes unmodified.

**Checks run**:

- **Python:** the full suite (10,620 passed, 62 skipped, on eight workers), with the strict mypy gate
  and two more modules inside it; `ruff check` and `ruff format --check` on `src/` with the pinned
  ruff 0.14.0; `check_no_qt_in_core.py`; the desktop version coupling; the engine health smoke test.
- **The 50,000-track measurement** above, from a script built to DISCOVER-08's recorded library
  shape. It reproduces DISCOVER-08's own worst case within a few percent of its recorded 327 ms.
- **Not run:** the renderer and Electron suites. This step changes no TypeScript and no wire route.
- `git diff --check`.

---

## PREP-05 — The Set's Warnings ✅ IMPLEMENTED 2026-09-28

**Objective**: DEC-106: every transition, entry and chapter checked and explained, with transition
warnings acknowledgeable.

**User-visible result**: None yet.

**Dependencies**: PREP-03.

**Existing code reused**: `tempo_ranges` and `key_relation` from `core/similarity.py`; the file status
repository; `key_notation_of` and `format_key`.

**Design**:

- **`core/set_analysis.py`**, with no SQL and no I/O. Input: the entries in order (entry id, track id,
  chapter, effective BPM and key, length, planned times, file status as missing, present or unchecked),
  the chapters with their targets, and the acknowledgements. Output:
  - **Per transition**, into each entry from the one before: `tempo_jump` (the percent, the two BPMs,
    and which window it missed, half and double time counted as within), `key_clash` (the two keys, no
    relation on the wheel), `tempo_unknown` and `key_unknown` (which side). The thresholds are DEC-096's
    constants, read and not restated (fact 6).
  - **Per entry**: `file_missing`, and `time_outside_track` when a planned out time is past a length a
    refresh has since shortened. A repeated track is a `repeat` notice with the other positions, not a
    warning (DEC-017).
  - **Per chapter**: `over_target` whenever its timed entries already exceed the target; `under_target`
    only when every entry in it is timed (DEC-107); and `bpm_outside_range` with the entries outside it.
  - **For the Set**: counts of each kind, the running time, the untimed count, and when files were last
    checked, or that they never were (DEC-088's rule).
- **Warnings are data**, `{kind, detail, compared}`, with keys in the library's notation. A test holds
  every kind and detail to a string the renderer has, as DISCOVER-08 did for reasons.
- **Acknowledgements.** `acknowledge(from_entry_id, to_entry_id, warning)` stores the compared values.
  An acknowledgement applies while the two entries are adjacent in that order and the values compared
  are unchanged. Otherwise it is inert and the warning shows again. `unacknowledge` removes it. Only
  transition warnings can be acknowledged. The others describe something the user fixes.
- **The service**, `services/set_analysis_service.py`, reads a Set's entries with effective values and
  file status in one query per table and runs the rule. It writes nothing but acknowledgements.

**Tests**: Every kind from a table of cases, including half time, a 12→1 wheel wrap, a relative key, an
unknown BPM on either side, a missing file, an unchecked library, a shortened track, repeats, and each
chapter target with timed and untimed entries. An acknowledgement goes stale on a reorder, a replaced
neighbour and a new BPM override, and holds across an unrelated edit. **The shared-rule test**: for a
seeded library, every suggestion PREP-04 gives for a gap, inserted there, has no `tempo_jump` on either
of its transitions.

**Acceptance criteria / DoD**: A 1,000-entry Set analysed within **0.2 s**, measured. `python -m pytest
src/tests` clean.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-28). A Set checks every transition, entry and chapter, and says what
it found as data the renderer has words for. Transition warnings can be acknowledged, and an
acknowledgement stops applying as soon as what it accepted changes. Nothing blocks anything
(DEC-017). A 1,000-entry Set in a 50,000-track library is checked in **57 ms** against the budget of
**0.2 s**. Nothing a user can reach changes yet: the routes are PREP-08's and the drawing PREP-10's.

**What was built.**

- **`core/set_analysis.py`**, with no SQL and no I/O. It takes `EntryFacts` (effective BPM and key,
  length, planned times, file state), `ChapterFacts` (targets) and `Acknowledged` (accepted
  warnings), and `analyse` returns a `SetAnalysis`:
  - **Per transition**:
    - `tempo_jump` (`faster` or `slower`, with the two BPMs and the gap in percent);
    - `key_clash` (the two keys, with no relation on the wheel);
    - `tempo_unknown` and `key_unknown` (`from`, `to` or `both`).
  - **Per entry**:
    - `file_missing` (`not_found` or `drive_unavailable`);
    - `file_unreadable`;
    - `time_outside_track` (`out`, or `in` when even the in time is past the end).

    A repeated track is a `repeat` notice with its other positions, not a warning.
  - **Per chapter**: `over_target` (`all_timed` or `partly_timed`), `under_target` (only when every
    entry is timed) and `bpm_outside_range` (`below`, `above` or `both`, with the entries outside).
  - **For the Set**: the count of each kind not acknowledged, how many are acknowledged, the notices,
    the running time with its untimed count, and a `FileCoverage` by track. Its `never_checked` says a
    Set was never checked, rather than that nothing is missing (DEC-088).
  - `WARNINGS` lists all twenty `(kind, detail)` pairs, and `NOTICES` the one notice.
  - `transition_warning` finds one warning by name, which is what an acknowledgement is made against.
- **The shared rule, read and not restated.**
  - `core/similarity.py` gains `tempo_relation(seed_bpm, candidate_bpm)`, DEC-096's tempo gate as a
    public question.
  - The key check is `key_relation`, and the gap in percent is PREP-04's `tempo_gap`.
  - A test reads the module's source and finds no window percentage in it.
- **`persistence/set_repository.py`**:
  - `entry_facts(set_id)` is one statement for the whole Set. It reads the effective BPM and key
    through the rule vocabulary's expressions, the track's length, and the last check of the track's
    current path, as the Library's `file_status` filter reads it. `filter_rule.FILE_CHECK_CURRENT` is
    public for that, so "current" has one spelling.
  - `acknowledge` is an upsert that keeps the first moment while the values are unchanged.
  - `unacknowledge` is a delete.
  - `models/set_plan.py` gains `EntryFactsRow`, the row as read.
- **`services/set_analysis_service.py`**, `SetAnalysisService`:
  - `analyse(set_id)` reads the entries, chapters and acknowledgements in one transaction and returns
    a `SetAnalysisReport`. Its `to_dict` writes keys in the library's notation.
  - `acknowledge(from_entry_id, to_entry_id, warning)` and `unacknowledge(...)`.
  - It writes nothing but acknowledgements, and records no activity.
- **Wiring.**
  - `ISetAnalysisService` is in `interfaces.py`, registered in `bootstrap.py`. `ISetRepository` gains
    three methods.
  - `core/set_analysis.py` and `services/set_analysis_service.py` join the strict mypy gate.
  - The persistence-boundary allow-list gains the service, with its reason: it opens transactions and
    runs no SQL.
- **The renderer's words**, written now as DISCOVER-08 wrote Similar Tracks' reasons:
  - `screens/prepare/setWarnings.ts`: `describeSetWarning` ("Tempo jumps 16.7% faster: 120 → 140",
    "1:00 over the 5:00 target, before 1 entry still untimed"), `describeSetNotice` ("Also at 3"),
    `describeFileCheck` and `isAcknowledgeable`.
  - `screens/prepare/setTime.ts`: `formatTime`, the engine's `format_time`.
  - The wire types (`SetWarning`, `SetNotice`, `SetFileCheck`, `SetRunningTime`, `SetAnalysis`) are in
    `cuepointBridge.types.ts`.
  - `test_set_warnings_fixture.py` writes `setWarnings.fixture.json` from the real services. It holds
    one of each of the twenty warnings, the notice, the three file-check states and a table of times.
  - `setWarnings.test.ts` and `setTime.test.ts` give each warning a sentence of its own and hold
    `formatTime` to every time the engine wrote.

**Where the specification was open or wrong, and what was done instead.**

1. **A transition is a tempo jump only when neither track is within the other's window.** DEC-096's
   window is a percentage of the seed, so it is not symmetric: 100 then 106.2 is outside 100's window
   but inside 106.2's. PREP-04 judges a slot from each neighbour, so a check from the earlier track
   only would warn about a track Suggestions had just offered. That is the failure fact 6 forbids.
   Judged both ways, the shared-rule test holds, by property over tempos and through both real
   services. The jump is described the closest way it is heard: 90 after 128 is "29.7% slower",
   not double time.
2. **Keys are compared as Camelot codes and written in the library's notation.** An acknowledgement
   stores the canonical values, so a library whose notation changes does not see every acknowledgement
   go stale. A test proves an acknowledgement holds across that change. BPMs are compared at the
   library's two decimals, so float noise cannot make one stale either.
3. **`file_unreadable` is a warning of its own, and a missing file says when the drive was the
   cause.** The specification named only missing files. A file that cannot be read will not play
   either. A drive that was not connected is a different fix from a deleted file, and CLEAN-07 already
   records which.
4. **`time_outside_track` covers the in time too.** An in time at or past the end (`in`) is as
   impossible as an out time past it (`out`). An out time exactly at the end is fine.
5. **Two details for being over target.** `partly_timed` says the chapter is already over with
   untimed entries still to add. An empty chapter with a target is under it, because all none of its
   entries are timed and it plays for no time.
6. **The BPM range is literal and inclusive**, as the range that narrows Suggestions (PREP-04). Half
   and double time do not count as inside. A track with no BPM is not listed as outside, because its
   transitions already say it has none.
7. **Acknowledging is refused unless the warning is there now.** Accepting a warning nobody was shown
   is not something a user did. Acknowledging again after the values changed accepts the new ones.
   Acknowledging again with no change keeps the first moment.
8. **An acknowledgement that no longer applies is kept, not deleted.** Undoing a reorder brings it
   back. It goes by cascade when either of its entries is removed.
9. **The wire lists only what found something.** Transitions and entries appear only with a warning
   or notice, so a clean 1,000-entry Set is not a thousand empty objects. Every chapter is listed,
   with its running time.
10. **The renderer formats times with a copy of `format_time`, held to it by a test.** PREP-03 handed
    that choice to PREP-08. It was needed here, for the warnings' words, and a table the engine writes
    settles it: a time is drawn far more often than it is sent.

**Measured**: a 1,000-entry Set in DISCOVER-08's 50,000-track library, with ten chapters with
targets and ranges, half the entries timed, every file checked, and a hundred acknowledgements. The
median of nine runs is **57 ms** for the check and its wire object, and **55 ms** for the check alone.
About 30 ms of that is counting the library's key notation. The budget is
`ANALYSIS_BUDGET_SECONDS`, 0.2 s.

**Handed on.**

- **PREP-08:**
  - Three routes: the check, acknowledge and unacknowledge.
  - Their refusals are `ValueError`s with messages.
  - The types are in place, so only the methods move through the six contract files.
- **PREP-10:**
  - It draws each warning beside its entry, transition or chapter, and offers acknowledging where
    `isAcknowledgeable` says to.
  - It shows the file-check sentence, and formats `last_checked_at` as a date.
- **PREP-06 and PREP-07:** the warnings never gate an export (DEC-017).

**Tests**: 114 new Python tests in four files, and 45 renderer tests in two.

- **`src/tests/unit/core/test_set_analysis.py` (81):**
  - Every kind from tables of cases: half and double time, the 12→1 wrap, a relative key, unknown
    values on each side, each file state, times at and past a shortened track's end, repeats, and each
    target with timed and untimed entries.
  - The cases yield exactly `WARNINGS`.
  - Acknowledgements: applied, inert four ways, and read back from JSON.
  - Two properties tying the rule to PREP-04's gate.
- **`src/tests/unit/services/test_set_analysis_service.py` (26):**
  - Overrides, and values that are not values.
  - Notation, and every file state, including a check of a path a refresh has since changed.
  - A shortened track, chapter targets and a repeat.
  - The wire shape, and refusals.
  - Acknowledgements: made; stale after a reorder, a replaced neighbour and a new BPM override;
    holding across unrelated edits and a change of notation; withdrawn; cascading; every refusal.
  - Nothing else written.
  - **The shared-rule test** through both real services: every suggestion for every gap of a seeded
    Set is inserted there and checked (over forty in all).
  - The container.
- **`src/tests/unit/persistence/test_set_repository.py` (+4):** the read, the upsert and delete, and
  the database refusing an acknowledgement across two Sets.
- **`src/tests/unit/services/test_set_warnings_fixture.py` (3):** the fixture is the engine's answer,
  and covers every warning, notice and file-check state.
- **`setWarnings.test.ts` and `setTime.test.ts` (45):** a sentence for each warning, distinct and as
  written; notices; file checks; and `formatTime` against the engine's table.

Fourteen deliberate breakages, each caught:

- a jump judged one way only;
- under target with untimed entries;
- over target only when all timed;
- an acknowledgement ignoring its values;
- one applying either way round;
- a repeat reported as a warning;
- the range's edges exclusive;
- a time at the exact end called outside;
- both keys unknown left unsaid;
- never checked read as missing;
- another path's check read as current;
- the stored BPM read instead of the override;
- a non-adjacent transition acknowledged;
- keys always written in Camelot.

The repeat breakage was first written against the counts, which already ignore anything that is not a
warning. It was rewritten to make the repeat a warning, and was caught.

Every existing test passes unmodified, except the persistence boundary's allow-list, which gains the
service with its reason.

**Checks run**:

- **Python:** the full suite (10,734 passed, 62 skipped, on eight workers), with the strict mypy gate
  and two more modules inside it; `ruff check` and `ruff format --check` on `src/` with the pinned
  ruff 0.14.0; `check_no_qt_in_core.py`; the desktop version coupling; the engine health smoke test.
- **Renderer:** the type-check, lint (exit 0, the 8 existing warnings) and the full suite (3,231
  tests).
- **Electron:** the type-check, because the bridge types changed. Its tests were not run: no Electron
  file changed.
- **The measurement** above, and `git diff --check`.

---

## PREP-06 — Set Lists: Text, CSV and M3U8

**Objective**: DEC-110: a Set written as a set list file, or as text to copy.

**User-visible result**: None yet.

**Dependencies**: PREP-03.

**Existing code reused**: `parse_m3u` (to prove the M3U8 round-trips); effective values; the atomic write
in `data/rekordbox_export.py`; the file-write boundary test (CLEAN-10).

**Design**:

- **`data/set_list_file.py`**, pure writers over a list of `SetListRow` (position, chapter, starts at,
  in, out, planned, artist, title, BPM, key, file path, length):
  - **Text**: the Set's name and running time, then each chapter as a heading and each entry as
    `NN. [starts at]  Artist – Title`, with planned times where they exist. UTF-8.
  - **CSV**: one header row, then one row per entry with every field above. UTF-8 with a byte-order
    mark so spreadsheet programs read accents. A cell beginning with `=`, `+`, `-` or `@` is prefixed
    with an apostrophe, so no title runs as a formula.
  - **M3U8**: `#EXTM3U`, then each chapter as a `# Chapter: name` comment line, and each entry as
    `#EXTINF:<length or -1>,Artist - Title` followed by its absolute file path. Repeats are listed
    again. No times (DEC-110).
- **`services/set_list_service.py`**:
  - `text(set_id)` returns the text form for the clipboard.
  - `save(set_id, path)` refuses a path whose extension is not `.txt`, `.csv` or `.m3u8`, or whose
    folder does not exist, and writes the file atomically in the format the extension names. A refusal is
    a value with its reason (DISCOVER-09's pattern). It records one activity event with the format and
    the counts: entries, missing files, untimed entries.
  - Missing files are listed and counted, not dropped (DEC-088's reasoning).
- **The boundary test** gains `data/set_list_file.py` as a module that writes text files, and asserts
  that nothing on this path opens an audio file.

**Tests**: Each format against a golden file, including a repeat, an empty chapter, a missing length, a
missing file, a non-ASCII title and a title beginning with `=`. The M3U8 is read back by `parse_m3u` with
the same paths and titles in the same order. `save` refuses each bad path and writes nothing. A
cancelled write leaves no partial file.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Low.

**Complexity**: **S**

**Outcome**: Not started.

---

## PREP-07 — Sets in the Rekordbox Export

**Objective**: DEC-109: a Set is one of the things the Phase 8 export can append.

**User-visible result**: None yet (PREP-09 draws it).

**Dependencies**: PREP-02.

**Existing code reused**: The whole Phase 8 path: `plan_collection_xml`, the preview, the job, the record,
`EXPORTED_KINDS`.

**Design**:

- `EXPORTED_KINDS` already holds `KIND_SET` (PREP-01, with the widened `CHECK`); this step makes the
  writer and preview use it. A Set is appended exactly as a Collection is: one `NODE` of
  playlist type, entries in order, a repeat written twice, at its folder path under CuePoint's folder
  (DEC-078).
- Chapters, times, notes and acknowledgements are not written.
- The preview labels a Set as "Set, in its running order". Warnings are not mentioned, and nothing about
  a Set can stop an export (DEC-017).
- The export record stores `kind = 'set'` (PREP-01 widened the column).
- The dialog's tree payload includes Sets with their kind.

**Tests**: A Set with a repeat and three chapters exports as one playlist with the repeat and no trace of
the chapters, and everything else in the file is byte-identical, as EXPORT-02's test holds. A Set in a
folder exports at its path. The record says `set`. The preview and the result agree (DEC-084's test,
extended). A Set whose tracks the source no longer holds drops them from the playlist and counts them,
as DEC-082 does for Collections.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean.

**Risks**: Low: the path is Phase 8's.

**Complexity**: **S**

**Outcome**: Not started.

---

## PREP-08 — The Sets API and the Desktop Contract

**Objective**: PREP-02 to PREP-07 on the wire, through all six contract files, with the save dialog for
set lists.

**User-visible result**: None yet.

**Dependencies**: PREP-02 to PREP-07.

**Existing code reused**: `organization_api.py`'s route style; DISCOVER-09's `{ value, refusal }`
pattern and its Python test of TypeScript shapes; `rekordboxExportDialog.ts`.

**Design**:

- **Routes** under `/api/v1/sets/`, in `engine/sets_api.py`:
  - Reads (GET): `plan` (details, chapters, running times), `entries` (the whole Set, capped by
    `MAX_SET_ENTRIES`, with the track fields the table shows, file status, chapter, times and note),
    `analysis`, `suggestions` (the insertion point and the pool as parameters) and `set-list/text`.
  - Actions (POST): `create`, `create-from`, `duplicate`, `notes`; `chapters/create`, `update`, `move`,
    `delete`, `split`; `entries/move`, `times`, `note`; `acknowledge`, `unacknowledge`;
    `set-list/save`.
  - Adding and removing entries keep using `/api/v1/collections/tracks/*`, which PREP-02 made Set-aware.
    There is one path to write an entry, on the wire as in the repository.
- **Six files, one test.** Every route becomes a bridge method on `window.cuepoint.sets`. A Python test
  holds every TypeScript shape and vocabulary (warning kinds, refusal codes) to what the engine
  serializes.
- **The save dialog.** `electron/setListDialog.ts`, modeled on the export's: it suggests `<Set name>
  <date>.txt` in the folder a set list was last saved to, offers the three formats as filters, and never
  judges the path, because the engine does. The folder is kept in main's own settings, not the database:
  unlike DEC-086, nothing records a set list save beyond its activity event.
- **The status strip** needs nothing: set-list saves are synchronous, and exports are Phase 8's job.

**Tests**: The contract test; every route's refusal paths; the shape test; the dialog's options and its
remembered folder; `desktopContract.test.ts`.

**Acceptance criteria / DoD**: Python suite, Electron type-check and tests, renderer type-check clean.

**Risks**: Medium, for the reason fact 1 gives. The supervisor has dropped a method in four earlier
phases.

**Complexity**: **M**

**Outcome**: Not started.

---

## PREP-09 — Sets in the Library

**Objective**: DEC-104's Library half: Sets in the CuePoint tree, scoping the table, reachable from every
place a Collection is.

**User-visible result**: A user can create a Set, see it in the tree, add tracks to it and open it.

**Dependencies**: PREP-08.

**Existing code reused**: `CollectionsPane.tsx`, `collectionTree.ts`, `SelectionActions.tsx`,
`TrackDetailPanel.tsx`, `RekordboxExportDialog.tsx`, the rule editor, the refresh preview.

**Design**:

- **The kind audit, renderer side.** Every `kind` test in `renderer/src` is listed in the outcome with
  what it now answers for a Set (fact 2). `CollectionKind` gains `"set"` in both type files. PREP-02
  handed on three items, in its outcome: `describeDeletion` and `referenceWarning` do not yet name
  Sets, and the refresh's "emptied" marking must read `set_ids` beside `collection_ids`.
- **The tree.** A Set shows the `prepare` icon and its entry count. "New Set" sits beside "New
  Collection" and files into the selected folder. The context menu adds "Open in Prepare", "Duplicate",
  "Save set list…", "Copy set list" and the existing "Export to Rekordbox…". A Collection, a Smart
  Collection and a Rekordbox playlist gain "New Set from…".
- **The scope.** Selecting a Set scopes the table as a Collection does (DEC-044, DEC-062). The table
  names it as a Set and says it lists each track once (fact 3). Order and removal belong to Prepare, so
  the Set scope in the Library offers no drag reorder and no entry removal.
- **"Add to Set…"** joins the one operations list, with a Set picker. It appends to the last chapter, and
  skips and counts tracks already in the Set (DEC-058).
- **The rule editor** lists Sets in the `collection` field's picker, labelled as Sets.
- **The Inspector** lists the Sets a track is in beside its Collections, each opening Prepare.
- **The refresh preview** states Sets as their own kind (DEC-011, PREP-02).
- **The export dialog** shows Sets in the tree with their label (PREP-07).

**Tests**: Component tests over the engine's own answers, produced by the Python suite as fixtures (the
Phase 7 and 9 practice): the tree with a Set, the context menus, the scope's label, "Add to Set" with a
skip, the picker, the Inspector list, the refresh preview's wording, and the export dialog. The existing
Collection tests pass unchanged.

**Acceptance criteria / DoD**: Renderer type-check, lint and tests clean. The audit table is in the
outcome.

**Risks**: Medium: the audit again.

**Complexity**: **M**

**Outcome**: Not started.

---

## PREP-10 — The Prepare Page

**Objective**: DEC-104's Set Builder: the Set with its chapters, times, notes and warnings, playable, laid
out side by side (DEC-112).

**User-visible result**: The Prepare page, in the sidebar.

**Dependencies**: PREP-08, PREP-09.

**Existing code reused**: `TrackTable` and its row drag and drop; the Inspector's editable zones;
`playQueue`; the navigation registry.

**Design**:

- **Navigation.** `prepare` is enabled at `/prepare`, and `/prepare/:setId` opens a Set. DEC-027's memory
  reopens the last Set. With no Sets, the page says what a Set is and offers "New Set" and "New Set
  from…".
- **The layout** (DEC-112). A header, then two panes side by side: the Set, wider, and the source panel
  (PREP-11), with a divider whose width is remembered. The Inspector stays where DEC-018 put it and can
  be hidden. The header holds the Set picker (the CuePoint tree's Sets and folders), the name, the running
  time ("1:34:20 planned · 3 untimed"), the warning counts, "Play Set", "Set list ▾" (Save…, Copy) and
  "Export to Rekordbox…".
- **The Set table** is a `TrackTable` over the Set's entries with its own column registry: position,
  starts at, in, out, planned length, title, artist, BPM, key, transition (the warnings into this entry,
  as an icon and a short text) and note. **Chapter headings are rows of the table's own row type**, not a
  `TrackTable` feature: a heading row shows the chapter's name, its running time against its target and
  its BPM range. A Set with one unnamed chapter shows no heading row (DEC-103).
- **Editing.**
  - Drag reorders entries. A drop on a chapter heading row puts the entry at that chapter's start.
  - An entry's context menu offers "Start a chapter here", "Remove from Set", "Insert a repeat after"
    and the ordinary track operations.
  - A heading row's context menu offers rename, targets and notes (one dialog), move up or down, and
    delete.
- **The entry's plan in the Inspector.** Selecting an entry adds an "In this Set" zone to the Inspector,
  above ORG-10's: in, out, note and chapter, and the entry's warnings with "Acknowledge". This keeps the
  Set pane's height for rows.
- **Playing** (DEC-108). Double-clicking an entry plays the Set from that entry. "Play Set" plays it
  from the start. Both call `playQueue` with the entries in order, repeats included, and nothing else
  about the player changes.
- **The `TrackTable` double-click fix** (DEC-112). A mouse click on a partly visible row no longer
  scrolls it into view before the second click lands. Keyboard navigation still scrolls. A component test
  reproduces the defect first. The two Library specs Phase 8's macOS pass reported failing on
  `rows.nth(1)` pass unweakened on Windows, and are recorded as owed on macOS.

**Tests**: Component tests over engine fixtures: the empty state, a Set with chapters and without, each
edit, the heading rows, the Inspector zone, acknowledgement, and "Play Set" calling `playQueue` with a
repeat. An end-to-end test at the default window size and scale holds how many whole rows the Set table
shows. The step measures what the design reaches and sets that number, with a floor of five. If the
design cannot reach five, the step stops and says so rather than lowering the floor.

**Acceptance criteria / DoD**: Renderer and Electron checks clean; the row-count test passes three times
in a row in a packaged Windows build.

**Risks**: Medium. The screen is crowded: sidebar, Set, source panel and Inspector across the default
1,280 × 800 window at scale 2. The row-count test holds the height. The width is checked in the same run, with the
sidebar as a rail and as expanded.

**Complexity**: **L**

**Outcome**: Not started.

---

## PREP-11 — The Source Panel and the Shape Lanes

**Objective**: Where tracks come from on the Prepare page (suggestions and the library), and the Set's
tempo and key drawn as lanes (DEC-105, DEC-111).

**User-visible result**: Filling a Set from suggestions and the library, and seeing its shape.

**Dependencies**: PREP-10.

**Existing code reused**: The browse query and `TrackTable`; the Library's scope pickers; `similarReasons.ts`;
`PixelIcon`'s rectangle-per-cell drawing.

**Design**:

- **The source panel** has two tabs, remembered.
  - **Suggestions.** The insertion point is after the selected entry (between it and the next), or the
    end of the Set with nothing selected. The panel names it ("Between *A* and *B*, in Peak"). A pool
    picker offers the library, a Collection, a Smart Collection or a Rekordbox playlist. Rows show the
    score, each side's reasons in words and an "in this Set" mark. "Insert here" and drag both insert.
    `no_fit` shows the tempo gap and offers "Fit after *A*" and "Fit before *B*".
  - **Library.** A search box and the same pool picker over the one browse query (DEC-023). Rows drag
    into the Set, or insert at the insertion point.
- **The lanes**, a strip above the Set table that can be collapsed and remembers it:
  - **Tempo**: one column per entry, in order, drawn as a stepped line of whole pixels. A half- or
    double-time step is drawn as a step, and the transition column already says why.
  - **Key**: each entry's Camelot position, number and letter, with a line between neighbours whose
    style says same, adjacent, relative or no relation, using the same words as the warnings.
  - An unknown value is a gap, never a zero (DEC-111). Chapter boundaries are marked. Clicking a column
    selects its entry. Drawn in inline SVG rectangles like `PixelIcon`, with `currentColor` and theme
    tokens, so all five themes read it, and with no chart library.
- **Set lists.** "Save…" opens PREP-08's dialog and reports what was written, or the refusal. "Copy" puts
  the text on the clipboard with the web Clipboard API and confirms with a toast. No new preload method
  is needed.

**Tests**: Component tests over engine fixtures: the insertion point's label for each selection, the
pool picker, `no_fit` and its two buttons, drag and "Insert here", the Library tab's search, the lanes'
columns and gaps and wheel relations, a click selecting an entry, and both set-list actions.

**Acceptance criteria / DoD**: Renderer checks clean.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Not started.

---

## PREP-12 — The Phase Comes Together

**Objective**: Documented, measured and proved end to end in a packaged build.

**User-visible result**: The user guide's Prepare page.

**Dependencies**: PREP-01 to PREP-11.

**Design**:

- **Docs.** `docs/user-guide/prepare.md` covers Sets, chapters, times, warnings, suggestions, playing,
  set lists and the export, and says plainly that chapters, times and notes stay in CuePoint and that
  playback plays whole tracks. `organization.md` mentions Sets beside Collections. `rekordbox-export.md`
  lists Sets. The glossary gains Set, Chapter, entry and planned time. ADR-008 records DEC-102's
  design and the rebuild. `CHANGELOG.md` gets an **Unreleased** entry.
- **Measurements at 50,000 tracks**, collected from the steps and re-run once: the migration, a
  1,000-entry Set's entries, plan and analysis, and suggestions in the densest band.
- **The phase journey**, in a packaged Windows build, three times in a row:
  1. Create a Set from a Collection with a repeat.
  2. Split it into three chapters and give one a target length and a BPM range.
  3. Time some entries, reorder, and see the running time and "starts at" change.
  4. Fill a gap from Suggestions, and acknowledge a key warning.
  5. Play the Set from the third entry, and hear the repeat in the queue.
  6. Save the Set list as text, CSV and M3U8, and copy it.
  7. Export to Rekordbox with the Set ticked.
  8. Relaunch onto the Set, all of it intact.
  9. Refresh a library that deletes one of its tracks, and see the Set counted in the warning.
- **Backup.** A restored launch backup brings back Sets, chapters, times and acknowledgements with the
  Collections they sit beside (ORG-13's proof, extended).

**Tests**: The journey; `backup` restore; the full suites.

**Acceptance criteria / DoD**: The phase-level acceptance below, checked point by point in this
document.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Not started.

---

## Phase-level acceptance

In a packaged Windows build unless said otherwise, with the macOS packaged checks owed alongside Phases
5, 7, 8 and 9.

1. Upgrading a library with Collections, Smart Collections, frozen Collections, repeats and export
   records to m0025 changes none of them, measured at 50,000 tracks; a launch backup precedes it.
2. A Set is created, filed in a folder, duplicated, deleted and created from a Collection, a Smart
   Collection, a Rekordbox playlist and a selection. A Collection behaves exactly as before.
3. A track may repeat in a Set, and each repeat keeps its own times and note.
4. Every entry belongs to one chapter and chapters stay contiguous through every edit. The last chapter
   cannot be deleted. A single unnamed chapter shows no heading.
5. Planned times are typed and validated. The running time counts timed entries and says how many are
   not. "Starts at" stops at the first untimed entry.
6. Suggestions for a gap are scored against both neighbours, explain each side, respect the chapter's
   BPM range, mark tracks already in the Set, and say plainly when nothing fits both. The same library
   gives the same list twice.
7. Transitions, entries and chapters are checked. An acknowledged transition warning returns when either
   side or its values change. No warning blocks playing, saving or exporting.
8. A suggested track never has a tempo warning in the slot it was suggested for.
9. "Play Set" and a double-click play the entries in order, repeats included, through the unchanged
   player.
10. A Set exports to Rekordbox as one playlist with its repeats, at its folder path, recorded as a Set,
    with nothing about chapters or times in the file.
11. Text, CSV and M3U8 set lists are written only where the save dialog pointed, the M3U8 reads back
    through `parse_m3u`, and a copied set list matches the text file.
12. The Library shows Sets in the tree, scopes to them, offers "Add to Set…", lists them in rules and the
    Inspector, and counts them in the refresh warning.
13. The Prepare page shows at least the measured number of whole rows at the default window size and
    scale, with the sidebar expanded and as a rail. Double-clicking a partly visible row plays it.
14. No audio file and no source XML is written by any Phase 10 action. The file-write boundary test says
    so.
15. A restored backup brings Sets back whole.

## Deferred, with reasons

- **A transition preview, and starting or stopping at planned times** — DEC-108, against the
  recommendation. The player is unchanged.
- **Crossfade** — DEC-056 stands. A later request supersedes it rather than amending it.
- **Chapters, times and notes in Rekordbox** — DEC-109. The XML has no place for them.
- **An energy field, or charting tags as numbers** — DEC-111. Phase 12 owns measured energy.
- **Reading cue points or mix points** to suggest in and out times — nothing parses `POSITION_MARK`
  (DEC-077). A later phase that parses them can offer them as defaults for DEC-107's fields.
- **Performed history** (a Set marked as played, a date or a venue) — nothing asks for it yet. A Set's
  notes hold anything a user wants to record, and "Duplicate" keeps last week's plan.
- **The Library page's vertical fit at scale 2** — DEC-112 leaves it as Phase 8 recorded it.
- **A Set larger than 1,000 entries** — `MAX_SET_ENTRIES`. A Collection holds larger lists.
