# CuePoint v1.0.0 — Phase 10: Prepare, Detailed Step Specifications

Status: **Specified 2026-09-28. PREP-01 to PREP-11 are implemented (2026-09-28 to 2026-09-29).** The twelve steps below replace the roadmap's
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

## PREP-06 — Set Lists: Text, CSV and M3U8 ✅ IMPLEMENTED 2026-09-28

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

**Outcome**: Implemented (2026-09-28). A Set can be copied as a plain-text tracklist, or saved as a
text, CSV or M3U8 set list to a path a save dialog returns. The engine checks the path, writes the file
atomically, and records one activity event. No audio file is opened. Nothing a user can reach changes
yet: the routes and the save dialog are PREP-08's, and the buttons PREP-10's.

**What was built.**

- **`data/set_list_file.py`**: pure renderers over a `SetList` of `SetListChapter`s and `SetListRow`s,
  and one writer.
  - `render_text` gives the Set's name and running time, then each chapter as a heading and each
    entry as `NN. [starts at]  Artist – Title`, with `(in m:ss, out m:ss)` when it has times. The
    running-time line says how many untimed entries it did not count.
  - `render_csv` gives one row per entry with fifteen columns: position, chapter, starts at, in, out,
    planned, artist, title, remixer, BPM, key, length, file, file status and note. It is written with
    a byte-order mark by `encoded`.
  - `render_m3u8` gives `#EXTM3U`, `#PLAYLIST:<name>`, each chapter as `# Chapter: <name>`, and each
    entry as `#EXTINF:<length or -1>,Artist - Title` followed by its path. It has no times.
  - `form_of` maps `.txt`, `.csv` and `.m3u8`, in any case, to their form, and nothing else.
  - `write_set_list` is the only writing function. It writes a temporary file beside the destination,
    then replaces the destination. A stop or a failure leaves nothing behind, and an existing file
    stays as it was.
- **`services/set_list_service.py`**, `SetListService`:
  - `set_list(set_id)` reads the Set in one transaction: PREP-03's plan (chapters, times, starts,
    notes), PREP-05's facts (effective BPM, effective key written in the library's notation, the last
    check of the current path, length), and the new `SetRepository.entry_tracks` (artist, title,
    remixer and file path, which have no override).
  - `text(set_id)` returns the copy.
  - `save(set_id, path)`:
    1. Checks the destination before reading anything.
    2. Writes the file in the form its extension names.
    3. Records one `set_list.saved` event, for example "Saved 'Friday' as a CSV set list — 4 entries,
       1 file missing, 2 untimed", whose detail holds the form, the path and the counts.
    4. Returns a `SetListSaved` with `to_dict`.
  - `SetListDestinationError` is a `ValidationError` with a `reason`, as the export's destination
    refusal is. The reasons are `destination_blank`, `destination_not_set_list`,
    `destination_is_folder` and `destination_folder_missing`.
- **Wiring.** `ISetListService` is in `interfaces.py` and registered in `bootstrap.py`.
  `ISetRepository` gains `entry_tracks`, and `models/set_plan.py` gains `EntryTrackRow`. The two new
  modules join the strict mypy gate.
- **The boundaries.**
  - CLEAN-10's file-write boundary test lists `data/set_list_file.py` as a writing module whose one
    writer is `write_set_list`, reached only from the set list service. Its scanner found exactly
    that.
  - The persistence boundary's allow-list gains the service, which opens transactions and runs no SQL.

**Where the specification was open or wrong, and what was done instead.**

1. **CSV times are `h:mm:ss`.** A spreadsheet reads `3:45` as three hours and forty-five minutes, so
   the CSV writes `0:03:45`. The text form keeps `m:ss`, as a DJ reads it.
2. **The formula guard covers OWASP's list**: `=`, `+`, `-`, `@`, and a leading tab or carriage return.
   Words are written on one line with their outer whitespace trimmed, so the last two can only reach a
   cell through a file path, which is written as the library holds it. That path is quoted too.
3. **Every value is written on one line.** A line break in a title would end an `#EXTINF` early and
   split a text line. Every run of whitespace is written as one space.
4. **"artist – title (mix)" (DEC-110) is the title as Rekordbox holds it**, which usually names its mix
   already. A remixer the title does not mention is added as "(Remixer Remix)". The CSV keeps the
   remixer in a column of its own.
5. **Chapters follow DEC-103.** A Set with only its one unnamed chapter has no headings or chapter
   lines, and its CSV chapter column is empty. Otherwise every chapter is written, an empty one
   included, and an unnamed one as "Chapter N".
6. **The M3U8 names the Set** with `#PLAYLIST:`, which players that support it show as the playlist's
   name, and which readers that do not, including `parse_m3u`, skip.
7. **An entry with no words is named by its file**, and one with no file either as "Untitled", so no
   line is blank.
8. **The CSV has a file status column** (`present`, `missing`, `unreadable`, `not checked`) and a note
   column. "Not checked" is a track with no check of its current path, which is not missing
   (DEC-088).
9. **A relative path is resolved** to an absolute one before it is checked, and the result reports the
   absolute path, as the export's does.
10. **The event is recorded after the file is in place.** A failed write records nothing, as the
    export's record never claims a file that is not there.
11. **The golden files keep their bytes.** The repository normalizes line endings (`core.autocrlf`),
    which would rewrite a golden `.txt` or `.m3u8` on checkout. A `.gitattributes` in the golden folder
    marks them `-text`, and a test holds that it does. Their paths are fixed at `/music`, so they are
    the same on every system. The M3U8 read-back uses the system's own absolute folder, because from
    Python 3.13 a Windows path with no drive is relative.

**Handed on.**

- **PREP-08:** three routes, for the set list's text, a save to a path, and the save dialog in
  Electron. The dialog remembers its folder and offers the three extensions, as EXPORT-06's does.
  `SetListDestinationError.reason` becomes the refusal code.
- **PREP-10:** "Copy set list" and "Save set list…" on the Prepare page.

**Tests**: 92 new, in two files.

- **`src/tests/unit/data/test_set_list_file.py` (63):**
  - Each form against its golden file (`src/tests/fixtures/set_lists/friday.*`). The golden Set has a
    repeat, an empty unnamed chapter, a missing length, a missing file, a non-ASCII title, a title and
    a note beginning with `=`, and a title broken over two lines.
  - The text read line by line: headings, numbering width at 120 entries, what an entry is called in
    ten cases, and the running-time line.
  - The CSV read back through `csv`: every column, the byte-order mark, the formula guard on words and
    on a path, and `h:mm:ss` times.
  - The M3U8 read back through `parse_m3u` with the same paths, titles and artists in order, carrying
    no times and no byte-order mark.
  - The forms and their extensions.
  - The write: bytes and size; replacing a file; a stop leaving nothing, or the old file as it was; a
    failed write and a folder that does not exist leaving nothing; and no audio file ever opened.
- **`src/tests/unit/services/test_set_list_service.py` (29):**
  - What a set list reads: overrides, notation, file states including a stale check, an empty Set, and
    only a Set.
  - Copy is the text form, and records nothing.
  - Save in each form by its extension, with the one event's words and detail, and a clean Set's
    shorter summary.
  - The M3U8 with a missing file and a repeat, and the CSV as a spreadsheet reads it.
  - A relative path.
  - Every refusal writing nothing, and the destination checked before the Set is read.
  - A failed write recording nothing.
  - No audio file opened, and no audio reader imported.
  - The container.

Fourteen deliberate breakages, each caught:

- no formula guard;
- no byte-order mark;
- a missing file dropped from the M3U8;
- planned times in the M3U8;
- a value left on several lines;
- the write going straight to the destination;
- a lone unnamed chapter given a heading;
- a remixer added twice;
- spreadsheet times as `m:ss`;
- any extension accepted;
- a missing folder accepted;
- the event recorded before the write;
- keys written as stored;
- never checked read as missing.

Every existing test passes unmodified, except the two boundary lists, which gain the new module and
service with their reasons.

**A bug the suite caught.** The repository ignores `*.csv` as user output, so the golden CSV would
never have been committed. The set list tests would then have failed on every clean checkout.
`test_regression_fixtures_not_ignored` caught it in the full run, and `.gitignore` gains an exception
for `src/tests/fixtures/set_lists/*.csv` with its reason, beside the other test oracles.

**Checks run**:

- **Python:**
  - the full suite: 10,826 passed and 62 skipped on eight workers, the one fixture guard included after
    the fix above; the strict mypy gate with two more modules runs inside it;
  - `ruff check` and `ruff format --check` on `src/` with the pinned ruff 0.14.0;
  - `check_no_qt_in_core.py`, the desktop version coupling and the engine health smoke test.
- **Not run:** the renderer and Electron suites. This step changes no TypeScript.
- The pre-commit hygiene hooks on the golden files, to prove they leave them byte for byte.
- `git diff --check`.

---

## PREP-07 — Sets in the Rekordbox Export ✅ IMPLEMENTED 2026-09-29

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

**Outcome**: Implemented (2026-09-29). A Set is one of the things the Rekordbox export appends. It is
written as one playlist of its entries in running order, repeats included, at its folder path under
CuePoint's folder. The record stores it as `set`, and its chapters, times, notes, acknowledgements and
warnings never reach the file, the preview or the record. The export dialog names a Set in its tree and
in the preview. Sets reach that tree once PREP-09 draws them in the Library.

**What was built.**

- **The engine needed no new branch, and none was added.** PREP-02 left the export's "not a folder,
  not smart" path reading a Set's entries through `CollectionRepository.track_ids`. That is the same
  call and the same table as a Collection's, ordered by position with repeats. PREP-01's model already
  accepted `set` in `EXPORTED_KINDS` and refused rules beside it. A dedicated Set branch would have been
  a second copy of the Collection path to keep in step, so the step proves the shared path instead.
  `_entries`, `PlaylistPreview` and the route and job docstrings now say so.
- **The renderer's two labels** (`screens/library/rekordboxExport.ts`):
  - `playlistKindNote` gives a Set "Set, in its running order", beside the Smart Collection's "as it
    matches now".
  - The new `exportNodeLabel` is what the dialog's tree prints beside a name: "folder", "Smart
    Collection" (or "— broken"), "Set · N", or a Collection's plain count. It replaces an inline ternary
    in `RekordboxExportDialog.tsx` that would have drawn a Set as a Collection.
- **The engine-produced dialog fixture** gains `chosen_set`: a Set in a folder with three chapters, a
  planned time, a note, a reprise and a track the file lacks, chosen beside a Collection. The renderer's
  tests read it.

**Where the specification was open, and what was done.**

1. **"Everything else in the file is byte-identical" is proved against a Collection.** The same folder,
   name and entries, exported once as a fully planned Set and once as a Collection, give identical
   files. So every byte-level guarantee EXPORT-02 holds of a Collection holds of a Set, without
   restating them. A second test holds that every byte before the playlist tree is the source's own.
2. **"Warnings are not mentioned" is held structurally.** A Set's preview has exactly the keys a
   Collection's has, and differs only in the playlist's identity (id, kind, name, path). A Set whose
   checks find a tempo jump and a missing file, one of them acknowledged, exports as any other.
3. **The tree's label is part of this step,** as PREP-09 hands it here. Fact 2 asks "is this a
   crate?" of the dialog's label, and a Set must answer no, so it is named rather than drawn as a count.
4. **The empty-choice sentences are unchanged.** "Tick a Collection…" and "holds no Collections" still
   read correctly with Sets in the tree. PREP-09's audit may reword them once Sets are drawn there.

**Handed on.**

- **PREP-08:** nothing. The export's routes already accept a Set's id.
- **PREP-09:** Sets in the Library tree, which is where the export dialog's tree comes from. The
  context menu's "Export to Rekordbox…" on a Set pre-ticks it, which `initialIds` already does.
- **PREP-12:** `rekordbox-export.md` says a Set exports as one playlist and its plan stays in CuePoint.

**Tests**: 28 new.

- **`src/tests/unit/services/rekordbox_export/test_rekordbox_export_sets.py` (17):**
  - What is written:
    - the running order with the reprise, read back through the importer's own reader;
    - three chapters make one playlist and no folder;
    - no chapter name, note, planned time or acknowledgement reaches the file;
    - the file is byte-identical to a Collection's with the same entries;
    - every byte before the playlist tree is the source's;
    - a Set in a nested folder lands at its path;
    - a folder holding a Set and Collections writes all of them;
    - an empty Set is still a playlist.
  - The record:
    - the row says `set` and keeps no rules, stored as `set` in the table;
    - the record outlives the Set's deletion;
    - the preview and the export agree, with a Set among the choices and a dropped track (DEC-084);
    - the preview's playlist names its kind.
  - What the file cannot hold: tracks the source lacks are dropped per appearance and counted, and a
    Set the file holds nothing of is an empty playlist (DEC-082).
  - Nothing stops it: a Set with warnings exports; the preview says nothing of its checks; `validate`
    runs no rules for it.
- **`test_rekordbox_export_dialog_fixture.py`:** the `chosen_set` state.
- **`test_rekordbox_export_jobs.py`:** a planned Set in a folder, exported by a real job through the
  bootstrapped container, is written in order with its repeat and recorded as `set`.
- **Renderer (9):**
  - `rekordboxExport.test.ts`: the Set's note and count over the engine's answer, with no word of its
    plan in it; a Set sent and covered as a Collection is; the tree's labels.
  - `RekordboxExportDialog.test.tsx`: a Set in the tree as "Set · 4", ticked from its menu, previewed at
    its path with its note, and covered by its folder.

Eight deliberate breakages, each caught:

- a Set read as a Smart Collection;
- its repeat written once;
- it recorded as a Collection;
- it previewed as a Collection;
- a Set under a chosen folder skipped;
- `validate` running rules for it;
- the preview giving it no label;
- the tree drawing it as a Collection.

Every existing test passes unmodified. The renderer test that lists the fixture's states gains
`chosen_set`.

**Checks run**:

- The full Python suite: 10,845 passed, 62 skipped. That is PREP-06's 10,826 and the 19 new tests.
- The renderer: 115 files and 3,240 tests passed. Type-check clean, and lint clean, with only the
  warnings that were already there.
- Clean: ruff check and format, the Qt guard, version coupling, the engine smoke test and
  `git diff --check`.
- The Electron suite was not run, because no Electron file changed.

---

## PREP-08 — The Sets API and the Desktop Contract ✅ IMPLEMENTED 2026-09-29

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

**Outcome**: Implemented (2026-09-29). Everything PREP-02 to PREP-06 built for a Set can be reached from
the renderer: twenty methods on `window.cuepoint.sets`, through all six contract files, and a save dialog
for set lists. Each method answers its value or the refusal standing in for it, with a code and, where
there is more than one kind, a reason. Nothing a user can reach changes yet: the Library draws Sets in
PREP-09, and the Prepare page is PREP-10's.

**What was built.**

- **`engine/sets_api.py`**, every route under `/api/v1/sets/`:
  - Reads (GET), each named by `set_id` in the query:
    - `plan`: PREP-03's `SetPlan`.
    - `entries`: the running order, repeats included. Each entry's plan sits beside the Library's own
      row for its track (`track_to_dict`, with CuePoint's layer, effective values, Clean's answers and
      the file's last check), plus `limit`, `MAX_SET_ENTRIES`.
    - `analysis`: PREP-05's report.
    - `suggestions`: the gap as `before_entry_id` and `after_entry_id`, `chapter_id`, `against`,
      `limit`, and the pool as the Library's own `q`, `playlist_id`, `filters`, `scope` and
      `collection_id`, read as Similar Tracks reads its scope.
    - `set-list/text`: the plain-text set list.
  - Actions (POST):
    - The Set: `create`, `create-from`, `duplicate` and `notes`.
    - Chapters: `chapters/create`, `update`, `move`, `delete` and `split`.
    - Entries: `entries/move`, `times` and `note`.
    - Warnings: `acknowledge` and `unacknowledge`.
    - Set lists: `set-list/save`.

  Every handler validates and delegates. A key a route does not take is refused by name, and a query
  parameter given twice is refused. Field lists on the way out are explicit.
- **Typed refusals**, answered as values over IPC:
  - `SET_NOT_FOUND` (404) with `reason` `set`, `chapter` or `entry`: the thing named has gone, and the
    view should reload.
  - `SET_INSERTION_POINT_REFUSED` with PREP-04's `reason`: `stale` (409), `empty_set` (409) or
    `no_neighbour` (400).
  - `SET_LIST_DESTINATION_REFUSED` (400) with PREP-06's `reason` and the `path`.
  - `SET_LIST_WRITE_FAILED` (500) with the `path`.
  - `INVALID_REQUEST` (400): a body, a parameter, or a value a service refuses, in its words.

  503 and anything unrecognized still throw, because nobody can act on them.
- **The six files.**
  - `server.py` dispatches the module, as it does Discover's.
  - `engineClient.ts` has the twenty methods and `readSetAnswer`, which keeps a refusal's code, reason
    and path, and reads a reason the engine never sends as none. It also carries every Set wire type,
    PREP-05's included.
  - `engineSupervisor.ts` forwards all twenty, one by one.
  - `main.ts` handles the twenty channels and the `dialog:saveSetList` channel.
  - `preload.cjs` exposes them as one namespace, `sets`, as `player` is one.
  - `cuepointBridge.types.ts` has the same types and `SetsBridge`, and `CuePointBridge` gains an
    optional `sets`.
- **The save dialog**, `electron/setListDialog.ts`, modeled on the export's:
  - It suggests `<Set name> <date>.txt`, dated in local time. Characters a file name cannot hold are
    replaced, a name Windows reserves is prefixed, and a long name is cut to 100 characters.
  - It offers the three forms as filters, text first, and reopens at a choice the engine refused.
  - It never judges the path and cannot save.
- **Main's own settings**, `electron/mainSettings.ts`: one JSON file in the user-data folder.
  - Reading never fails; anything unreadable reads as the defaults.
  - Writing replaces the file whole through a temporary file beside it.
  - Its one setting is the folder the last set list was saved to.
- **`SetService.update_chapter`** (and on `ISetService`): a chapter's name, notes and targets in one
  write, as PREP-10's heading dialog sends them. It changes only the fields it is given, refuses a field
  a chapter does not have, and applies the single edits' rules together.
- **`/api/v1/collections/tracks/insert` takes an optional `chapter_id`**, which the service already did
  (PREP-02). The client and bridge types say so.
- `engine/sets_api.py` joins the strict mypy gate.

**Where the specification was open, and what was done.**

1. **The routes are named by query and body ids, not path segments.** `/api/v1/sets/plan?set_id=7`
   follows `/api/v1/collections/entries?collection_id=`. Every path is fixed, so the module needs no
   pattern matching and the client names each route as a constant.
2. **`entries` carries the Library's own row for each track.** "The track fields the table shows" is
   read as the whole browse row, from the same serializer. The Prepare table and the Library table then
   show one track the same way, and PREP-10's ordinary track operations and the Inspector take the row
   they already take. The plan is read in one transaction and the rows after it. An entry whose track
   a refresh deleted in between is left out, as a second read would leave it: the refresh deletes its
   entries too.
3. **`SET_NOT_FOUND` is its own code.** PREP-10 opens `/prepare/:setId`, and "that Set was deleted" is a
   different next step from "that time is not a time". The route checks that the Set, chapter or entry
   it names exists before it asks the service anything. A node that exists but is not a Set is refused
   by the service, in its words, as a 400.
4. **A chapter is updated in one write.** The specification lists `chapters/update`. PREP-03 has three
   separate edits (rename, notes, targets). One route calling three would leave the new name written
   when the BPM range is refused. `update_chapter` validates and writes everything together; fields left
   out keep their values and `null` clears one.
5. **A chapter's target is typed, as an entry's times are.** PREP-03 left this open. `target` is read
   with `parse_optional_time` where it arrives, so `45:00` is 2,700 seconds, a blank clears it, and a
   refusal is in `set_timing`'s words.
6. **A write that clears must be asked for.** `notes`, `entries/times` (both times) and `entries/note`
   need their keys, and `null` clears. A body that left `in_time` out would otherwise clear it, because
   times are written as a pair (PREP-03).
7. **A file system that will not write is a refusal.** `SET_LIST_WRITE_FAILED` carries the path. The
   destination passed the engine's check, and the next step is another place, so it crosses as a value
   rather than a bare failure. Nothing is left behind (PREP-06).
8. **An insert can name its chapter on the wire.** "Adding and removing entries keep using
   `/api/v1/collections/tracks/*`." A drop at the top of a chapter (PREP-10) and "Insert here" on a
   chapter boundary (PREP-11) need the chapter named. The service took it already. The route now does,
   so there is still one path to write an entry.
9. **The folder is remembered from a save, not from the dialog.** "The folder a set list was last saved
   to" is recorded when the engine answers that it wrote the file (`rememberSetListFolder` around
   `engine:saveSetList`). A path the engine refused is not where set lists go.
10. **Main's settings are a file of their own.** Main had no persisted settings. `mainSettings.ts` is
    small and general, so the next thing main remembers for itself has somewhere to go that is not the
    database.
11. **"New Set from…" a selection takes its tracks, not a query.** A Set is an order and a query has
    none, so the renderer resolves the selection once, in the table's order, as DEC-063 says. It can
    read the ids through the browse route's id projection. More than 1,000 is refused whole, with the
    numbers.
12. **PREP-05's types now live in both processes.** They were in the bridge only, because nothing
    crossed yet. The contract test holds the two copies of every Set type together, and a Python test
    holds the client's copy to real engine answers.

**Handed on.**

- **PREP-09:**
  - "New Set", "New Set from…", "Duplicate", "Copy set list" and "Save set list…" call these methods.
  - "Add to Set…" stays on `addTracksToCollection`.
  - "Save set list…" opens `sets.chooseSetListDestination({ setName })`. On
    `SET_LIST_DESTINATION_REFUSED` it reopens at `refusal.path` via `currentPath`.
- **PREP-10:** the page reads `sets.plan`, `sets.entries` and `sets.analysis`, and edits through the
  rest. It reloads on `SET_NOT_FOUND` and on a `stale` insertion point. A drop on a heading row passes
  `chapter_id` to `sets.moveEntry`, or to `insertTrackInCollection` for a new track. The heading dialog
  sends `sets.updateChapter` once.
- **PREP-11:** the source panel reads `sets.suggestions` with the Library's pool parameters.

**Tests**: 391 new: 156 in Python, 78 in Electron and 157 in the renderer's contract test.

- **`src/tests/unit/engine/test_sets_api.py` (109)**, through a real engine on a free port:
  - The routes: exactly the specified twenty, all under `/api/v1/sets/`, none adding or removing an
    entry, a read not answered to a POST, and every one refused without the token.
  - What a read may say: the id required and whole, an unknown or repeated parameter refused, a Set that
    is gone as `SET_NOT_FOUND`, and a Collection refused as not a Set.
  - Making a Set: `create`, filed in a folder, and its refusals. `create-from` a Collection with its
    repeat, a playlist in its order and a selection in the order sent, eight malformed sources, the
    service's refusals in its words, and 1,001 tracks refused with nothing written. `duplicate` with its
    chapters and its refusals.
  - The reads:
    - the plan's shape;
    - the running order with its repeat, each row equal to the Library's own browse row;
    - the plan's times and note beside an override's effective BPM;
    - a missing file's last check;
    - an empty Set;
    - the analysis;
    - the set list's text.
  - Suggestions: both sides, the end of the Set, the pool as a query and as a Collection, one side
    only, `stale`, `no_neighbour` and `empty_set` with their statuses, and seven malformed requests.
  - The Set's notes.
  - Chapters: create at each place; update as one write, keeping unsent fields, clearing with a blank
    target and nulls; nine refused updates each changing nothing; move, delete and split with their
    refusals, including a Collection's entry as not found.
  - Entries: a move onto a chapter boundary keeping its chapter unless one is named; move refusals; an
    insert naming its chapter on the Collection route; times as a pair; seven refused times each
    changing nothing; a note.
  - Warnings: acknowledging a tempo jump and withdrawing it twice, and the refusals.
  - Set lists: saved where the dialog chose, each form by its extension, each destination refusal with
    its reason and path and nothing written, a missing destination, a file system that refuses, and
    other refusals.
  - `status_for` on its own.
- **`src/tests/unit/engine/test_sets_contract.py` (37):** every TypeScript shape held to a real
  answer, and every nested object to its own type, the Library row included. Also held: the refusal's
  fields to every extra any refusal sends; each method's parameters to the route's fields; the
  vocabularies (codes, reasons, sides, key relations, transition warnings, forms, the twenty warning
  kinds) to the engine's; and every route to a client call.
- **`src/tests/unit/services/test_set_service.py` (+10):** `update_chapter` writes every field it is
  given together, keeps the rest, writes none of a refused update (seven cases), and refuses a chapter
  that is gone.
- **Electron (78):**
  - `engineClient.sets.test.ts` (32): each read's path and query, the suggestions' pool, each action's
    route and body, a chapter field left out when not sent, the insert's chapter, each refusal as a
    value with its reason and path, an unknown reason read as none, and what still throws.
  - `setListDialog.test.ts` (34): the dated name and fourteen unsafe names, the filters, where the
    dialog opens, a previous choice, what it answers, and the folder remembered only from a save the
    engine answered, through main's settings, never failing the save.
  - `mainSettings.test.ts` (12): defaults, unreadable files, the write whole through a temporary file,
    and the old settings kept when a write fails.
- **`desktopContract.test.ts` (+157):**
  - All twenty methods in each of the six files: on `sets` in the preload on their own channels,
    handled, forwarded, and declared with the client's own answer. Nothing else on `sets` but the
    dialog, and none of them flat on the bridge.
  - Reads by GET, actions by POST, every answer a `SetAnswer`.
  - The dialog neither saves nor judges a path, and the folder is remembered only through the save.
  - Thirty-five interfaces and thirteen types identical in both processes.

Eighteen deliberate breakages, each caught:

- a Set that is gone not looked for;
- the running order losing its repeats;
- the row missing CuePoint's layer;
- a stale gap flattened into a plain 400;
- a destination refusal losing its reason;
- a refused write answered as a bare failure;
- a chapter's fields written one at a time;
- a time left out cleared;
- an insert ignoring its chapter;
- any field of a chapter allowed to change;
- a chapter sent with a field the client does not declare;
- the supervisor dropping a method;
- the preload sending a method down another's channel;
- a Set that is gone thrown rather than answered;
- a refused save remembering its folder;
- a slash left in the suggested name;
- the bridge's copy of a chapter drifting;
- main's settings written in place.

Every existing test passes unmodified. The strict mypy gate's list gains `sets_api.py`.

**Checks run**:

- **Python:**
  - The full suite: 11,001 passed and 62 skipped on eight workers (PREP-07's 10,845 and the 156 new
    tests). The first run had one failure, `test_step6_logging.py::test_log_timing_success`, which
    asserts on shared logging state. It passed three times alone and in a second full run, and this step
    touches no logging.
  - `ruff check` and `ruff format --check` on `src/`.
  - The strict mypy gate, with `sets_api.py` in it.
  - `check_no_qt_in_core.py`, the desktop version coupling and the engine health smoke test.
- **Electron:** the type-check, 24 files and 568 tests (490 before), and the main process bundled with
  esbuild.
- **Renderer:** the type-check, lint (exit 0, with only the 8 warnings that were already there) and 115
  files and 3,397 tests (3,240 before).
- `git diff --check`.

---

## PREP-09 — Sets in the Library ✅ IMPLEMENTED 2026-09-29

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

**Outcome**: Implemented (2026-09-29). Sets are in the Library's CuePoint tree. A user can make one, file
it in a folder, copy one from a Collection, a Smart Collection or a Rekordbox playlist, duplicate it, add
tracks to it by drop or "Add to Set…", open it as the table's scope, and save or copy its set list. The
Inspector lists the Sets a track is in. A delete and a refresh name Sets as their own kind. "Open in
Prepare" is built and waits for PREP-10 to enable the page it opens.

**What was built.**

- **The tree** (`CollectionsPane.tsx`, `collectionTree.ts`, `useCollectionTree.ts`):
  - A Set is drawn with Prepare's flag and its entry count, repeats counted.
  - "New Set" sits beside "New Collection". It files the Set in the selected folder and goes straight
    into its name, through `sets.create`. The empty tree offers "Create your first Set" beside "Create
    your first Collection", and says what each is.
  - A Set's menu: "Open in Prepare", "Duplicate", "Rename", "Delete…", "Save set list…", "Copy set
    list" and "Export to Rekordbox…", which pre-ticks it (PREP-07).
  - A Collection and a Smart Collection gain "New Set from…". So does a Rekordbox playlist, in a
    context menu the mirror had not had; a folder has none, and the mirror still writes nothing.
  - A Set takes dropped tracks as a Collection does.
  - The hook gains `createSetFrom` and `duplicateSet`, and `create("set")`. A refusal becomes the
    engine's sentence, and `SET_NOT_FOUND` re-reads the tree.
- **"New Set from…"** (`NewSetFromDialog.tsx`, `newSetFrom.ts`): a dialog with a name and a folder,
  as "Save as Smart Collection" has, and a sentence saying what the copy means for this source. It
  names the Set after its source and files it beside a CuePoint source, or at the top level for a
  playlist. The new Set is opened, and a toast says how many entries it got.
- **The scope** (`LibraryScreen.tsx`, `setScope.ts`):
  - Selecting a Set scopes the table as a Collection does, in its running order.
  - A line under the filter bar says the rows are its tracks once each: "“Friday” is a Set of 6
    entries. The table lists each of its 5 tracks once, in the order they first play." It offers "Open
    in Prepare" once there is a Prepare.
  - Inside a Set there is no row drop and no "Remove from". `canReorder` also refuses a Set, with
    the reason.
- **"Add to Set…"** joins the operations list, after "Add to Collection…". Its picker offers the Sets
  and the folders on the way to them. It runs as the batch "add to collection" with the Set's id, so the
  engine appends to the last chapter, skips what the Set holds and counts it (DEC-058). The toast and
  the confirmation say "Set", not "Collection".
- **The rule editor** lists Sets in the `collection` field's picker as "Friday (Set)", and a chip names
  one the same way.
- **The Inspector** (`TrackDetailPanel.tsx`) lists "In 1 Set" as its own section, drawn only when there
  is one. Each Set opens Prepare where there is one, and otherwise scopes the table.
- **The refresh preview** counts a Set's tracks: "1 in 1 Collection, 1 in 1 Set", the engine's own
  wording (PREP-02). A Set a refresh emptied says so when opened, read from `set_ids`.
- **The delete confirmation** names Sets and what goes with them: "This removes 1 folder and 4 Sets,
  with 17 track entries filed in them. Each Set's chapters, planned times and notes go with it. No
  tracks are deleted."
- **The export dialog** names Sets in its legend and its empty sentences.
- **Set lists** (`screens/prepare/useSetList.ts`, `setList.ts`): "Save set list…" opens PREP-08's
  dialog, saves, and says what the engine's activity event says. A refused destination or a failed
  write reopens the dialog at the file refused, with the reason. "Copy set list" puts the engine's text
  on the clipboard. Both live under `prepare/`, because PREP-11's header uses them too.
- **Clean's scope picker** offers a Set as a scope, labelled.

**The kind audit, renderer side.** Each place in `renderer/src` that asks what kind a node of
CuePoint's tree is, and what it now answers for a Set. `CollectionKind` already held `"set"` in both
type files (PREP-01). The Rekordbox mirror's `kind` (`playlistTree.ts`, `PlaylistPane.tsx`) is another
tree's and is not listed; nor are `kind` fields of other things (Activity offers, entity pages,
warnings, tag dialogs, batch operations).

| Where | The question | A Set |
| --- | --- | --- |
| `collectionTree.ts` `holdsTracks` | Does it hold entries? | **Yes** (widened) |
| `collectionTree.ts` `isCollection` (new) | Is it a crate? | No |
| `collectionTree.ts` `isSet` (new) | Is it a Set? | Yes |
| `collectionTree.ts` `canMoveInto` | May it be a parent? | No: only a folder |
| `collectionTree.ts` `canReorder` | May its rows be dragged into a new order? | **No**, with the reason |
| `collectionTree.ts` `iconForKind` | Which icon? | **Prepare's flag** |
| `collectionTree.ts` `kindLabel` (new) | What is it called? | "Set" |
| `collectionTree.ts` `setPickerNodes` (new) | Does "Add to Set" offer it? | Yes, with the folders on the way |
| `collectionTree.ts` `defaultSortForCollection` | Which sort does its scope open on? | Its order, as a Collection's (unchanged) |
| `collectionTree.ts` `rulesOf` | Does it carry rules? | No (unchanged) |
| `collectionTree.ts` `describeDeletion` | What would a delete take? | Counted as Sets, their plans named |
| `CollectionsPane.tsx` `create`, `UNTITLED` | What do the buttons make? | "New Set", in the selected folder |
| `CollectionsPane.tsx` `create`'s parent | Is the selection a folder? | No: a Set is not a parent (unchanged) |
| `CollectionsPane.tsx` `dropKind` | Does a track drop land on it? | **Yes**, through `holdsTracks` |
| `CollectionsPane.tsx` the row's count | Is a count drawn? | **Yes**: its entries |
| `CollectionsPane.tsx` `menuItems` | Which menu? | A Set's (above) |
| `CollectionsPane.tsx` "New Set from…" | Is it a source? | No: a Set is duplicated |
| `CollectionsPane.tsx` `duplicate` | Which copy? | The Set's, with its plan |
| `CollectionsPane.tsx` the row buttons | Duplicate and freeze a saved question? | No (unchanged, smart only) |
| `useCollectionTree.ts` `create` | Which route makes it? | `sets.create` |
| `LibraryScreen.tsx` `scopedCollection` | Does the scope hold rows? | Yes |
| `LibraryScreen.tsx` `scopedSet` (new) | Is the scope a Set? | Yes: the note, no removal, no row drop |
| `LibraryScreen.tsx` `scopeToCollection` | A folder is no scope; a Smart Collection brings rules | Scopes as a Collection |
| `LibraryScreen.tsx` `acceptsRowDrop` | May a row be dropped to reorder? | **No** |
| `LibraryScreen.tsx` the operations list's scope | Is "Remove from" offered? | **No** |
| `LibraryScreen.tsx` the "Add to Collection" picker | Can it be chosen? | **No** (was `holdsTracks`, now `isCollection`) |
| `LibraryScreen.tsx` the "Add to Set" picker (new) | Can it be chosen? | Yes |
| `LibraryScreen.tsx` `filterCollections`, `ruleNames` | Can a rule name it? | Yes, labelled "(Set)" |
| `LibraryScreen.tsx` `folders` | May it hold a new node? | No (unchanged) |
| `LibraryScreen.tsx` `dropTracks` (a whole query) | Which words for the batch? | A Set's |
| `LibraryScreen.tsx` `handleApply` | Did the refresh empty it? | Read from `set_ids` too |
| `LibraryScreen.tsx` `openNewSetFrom` | Collection or Smart Collection words? | Not offered on a Set |
| `TrackDetailPanel.tsx` `collectionIcon` | Which icon? | Prepare's flag |
| `TrackDetailPanel.tsx` the Collections list | Is it one of the Collections? | **No**: a section of its own |
| `libraryEmpty.ts` `emptyStateFor` | What is empty? | "This Set is empty." |
| `libraryFormat.ts` `referenceWarning` | How is it counted? | "1 in 1 Set" |
| `libraryBatch.ts` `batchSummary`, `batchConsequence` | Whose changes have no undo? | A Set's |
| `trackMenu.ts` `organizationMenuItems` | Is removal offered? | No: the page passes no Collection for a Set |
| `rekordboxExport.ts` `playlistKindNote`, `exportNodeLabel` | What is it in the export? | "Set, in its running order", "Set · N" (PREP-07) |
| `rekordboxExport.ts` `playlistHeadline` | What can be ticked? | Named: "a Collection or a Set" |
| `RekordboxExportDialog.tsx` the legend and empty note | What is listed? | "Collections and Sets" |
| `cleanRules.ts` `scopeOptions` | May it scope Clean? | **Yes** (was drawn as unchoosable), labelled |
| `cleanRules.ts` `parseScope` | Which scope does `collection:` mean? | Its own id (unchanged) |
| `ReviewView.tsx` the Inspector's scope | Smart or collection? | `collection:` (unchanged) |
| `DuplicatesView.tsx` the "Add to Collection" picker | Can it be chosen? | **No** (was `holdsTracks`, now `isCollection`) |
| `EntityScreen.tsx` the folders for a saved filter | May it hold a new node? | No (unchanged) |
| `activityActions.ts` `MEMBERSHIP_REVERT_REASON` | Whose membership cannot be reverted? | Both are named |
| `PaneTree.tsx` `data-kind` | Passed through | `set` |

The final search matched `kind ===`, `kind !==`, `.kind ===`, `holdsTracks(`, `isCollection(`, `isSet(`,
`iconForKind(` and `kind: "collection" | "set"` across `renderer/src`, tests aside, and found nothing that
is not in the table or excluded above.

**PREP-02's three items handed on**, done: `describeDeletion` names Sets; `referenceWarning` gives the
count ("4 in 1 Set"); the refresh's emptied marking reads `set_ids` beside `collection_ids`.

**Where the specification was open, and what was done.**

1. **"Open in Prepare" is built, and offered once there is a Prepare.** The tree's menu, the
   Inspector's Sets and the scope's note all take one page prop, `onOpenInPrepare`. `App.tsx` does not
   pass it yet, because `prepare` is still a disabled destination (SHELL-09). An entry that leads to a
   page that is not there would be a broken link, and passing the prop in PREP-10 lights up all three.
   Until then, a Set in the Inspector scopes the table, as a Collection does.
2. **Every Set affordance is offered by a shell that can do it.** "New Set", "Duplicate", the set lists,
   "New Set from…" and "Add to Set…" appear when the shell has the `sets` bridge. Without it, the Sets
   the engine sends are still drawn, scoped and exported, and nothing is offered that cannot work. This
   also leaves every existing Library test unchanged, since their bridges have no `sets`.
3. **"New Set from…" is a dialog.** The ellipsis promises one, and the dialog does two jobs. It asks a
   name and a folder, as a new saved filter does. It also says what "a copy" means for this source (a
   Smart Collection's copy stops matching), as the freeze confirmation does, before anything is written.
   The engine's default name, the source's, is filled in, so accepting it as it opens is one click.
4. **The scope's note sits in the filter bar's row.** The page's grid rows are positional, and a new
   row would have taken the table's growing one. It is one line, so the Library's table keeps its
   height (DEC-112).
5. **"Add to Set" offers the Sets and their folders; "Add to Collection" still offers the whole tree.**
   The Collection picker is ORG-11's, unchanged except that a Set is drawn and cannot be chosen there. A
   Set picker full of greyed Collections would hide the rows that matter, so it keeps only the folders
   on the way to a Set. With no Set at all, it says how to make one.
6. **The Inspector lists Sets apart, and only when there is one.** "In no Sets" on every track would be
   a line about a feature, not about the track.
7. **A Set's menu has no row button.** The spec puts its entries in the menu. The row already carries
   rename and delete, and a Smart Collection's two extra buttons are for its own gestures.
8. **The set list actions live under `screens/prepare/`.** PREP-11's header is their second caller, and
   the loop they share (the dialog reopening after a refusal) should be written once.
9. **"Add to Set" from Duplicates is not offered.** Clean's duplicate groups offer "Add to Collection"
   to gather copies for review. Copies of one track side by side in a running order is not a Set anyone
   makes, and the Library's list offers "Add to Set" wherever it is needed.
10. **Six sentences were reworded, because they became untrue or incomplete.** They are: the export
    dialog's two empty sentences, its legend and its no-Collections note; the tree's empty text, whose
    example "a set you are building" is now what a Set is; and Activity's membership revert reason,
    which cannot tell a Set's batch from a Collection's. The five renderer test assertions that pinned
    the export wording were updated with it. The Activity tests read the constant.

**Handed on.**

- **PREP-10:** pass `onOpenInPrepare` to `LibraryScreen` in `App.tsx`, on both the Library and
  Collections routes, navigating to `/prepare/:setId`. The empty state's "New Set" and "New Set
  from…" can reuse `collections.create("set", …)`, `createSetFrom` and `NewSetFromDialog`, with a source
  picker in front of it.
- **PREP-11:** the header's "Set list ▾" uses `useSetList` (`save`, `copy`).
- **PREP-12:** `organization.md` says Sets are in the tree beside Collections; the CHANGELOG entry.

**Tests**: 111 new: 16 in Python and 95 in the renderer.

- **`src/tests/unit/engine/test_library_sets_fixture.py` (16)** produces `librarySets.fixture.json`
  from a real engine: a folder holding a Set that plays a track twice, a Collection with a repeat, a
  Smart Collection, an empty Set, a Rekordbox playlist, each copied into a Set, a duplicate, a Set that
  is gone, a batch "Add to Set" with a skip, a track's detail, a refresh's references, a folder's
  delete preview, and a set list copied, saved and refused. The file must equal a fresh capture, with
  no timestamps, batch ids or machine paths in it. Fourteen tests hold each state to what it claims, on
  a fresh capture, so a fixture regenerated from a broken engine cannot become the expectation.
- **Renderer (95)**, over that fixture:
  - `librarySets.test.ts` (26): the kind audit's functions for each kind, the Set picker's tree, the
    delete sentence, the scope's note, the empty state, the refresh warning, the batch's words, the
    operations list, "New Set from…"'s source and words, and Clean's scope picker.
  - `CollectionsPane.sets.test.tsx` (27): a Set's icon, count and folder; a drop onto it; "New Set" in
    the selected folder and into its name, offered only where it can be made; a Set's menu, with and
    without "Open in Prepare", and each entry; "New Set from…" on a Collection, a Smart Collection and
    a Rekordbox playlist, and not on a folder or a Set; the dialog; and the hook's three Set writes,
    their refusals, the re-read after `SET_NOT_FOUND`, and a shell without the bridge.
  - `LibraryScreen.sets.test.tsx` (22): the scope, its note and link; no removal and no row drop inside
    a Set, beside a Collection that still has both; "Add to Set…" with its picker, its skip and a Set's "no undo"; "Add to
    Collection" refusing a Set; "New Set from…" a Collection and a playlist, opened, and a refusal kept
    in the dialog; saving and copying a set list; the export pre-ticking a Set; "Open in Prepare"; a
    folder's delete; the Inspector's Set; a Set a refresh emptied; and a shell without the bridge.
  - `TrackDetailPanel.sets.test.tsx` (4): Sets apart from Collections, opening Prepare or scoping the
    table, and nothing about Sets for a track in none.
  - `useSetList.test.ts` (15): the saved and copied lines, M3U8's untimed count, which refusals reopen
    the dialog, a save, a cancel, a refused destination and a failed write reopened at the file, a gone
    Set ending it, a copy, a clipboard that refuses, and a shell without the bridge.
  - `FilterBar.test.tsx` (+1): a Set in the rule editor's picker, labelled, sent by id.

Twenty-eight deliberate breakages, each caught:

- a Set no longer holding tracks;
- a Set counted as a crate;
- a Set drawn as a crate;
- a Set rearranged from the Library;
- the Set picker offering Collections;
- a delete forgetting its Sets;
- a row drop taken inside a Set;
- removal offered inside a Set;
- a Set the refresh emptied read as filled;
- "Add to Set" sent without its holder;
- the scope's note swapping entries and tracks;
- a Smart Collection sent as its own kind;
- "New Set from…" offered on a Set;
- "New Set" offered by a shell that cannot make one;
- a Set duplicated as a Smart Collection;
- a Rekordbox folder offering "New Set from…";
- the Inspector counting Sets as Collections;
- the Inspector's Set not opening Prepare;
- the refresh warning dropping a Set's track count;
- the empty state calling a Set a Collection;
- the batch saying "Collection" for a Set;
- a refused set list not reopening the dialog;
- a gone Set reopening the save dialog;
- an M3U8 counting untimed entries;
- a Set that is gone left in the tree;
- Clean refusing a Set as a scope;
- the rule editor not naming a Set;
- the fixture keeping this machine's path.

Every existing test passes, and all but the five export-wording assertions (decision 10) unmodified.

**Checks run**:
- **Python:**
  - The full suite: 11,017 passed and 62 skipped (11,001 before, and the 16 new).
  - `ruff check` and `ruff format --check` on `src/`.
  - The strict mypy gate, `check_no_qt_in_core.py`, the desktop version coupling and the engine health
    smoke test.
- **Renderer:** the type-check, lint (exit 0, with only the 8 warnings that were already there) and
  120 files and 3,492 tests (3,397 before).
- **Electron:** the type-check and 24 files, 568 tests, since the contract test's copy of the bridge types is the renderer's.
- `git diff --check`.

---

## PREP-10 — The Prepare Page ✅ IMPLEMENTED 2026-09-29

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

**Outcome**: Implemented (2026-09-29). Prepare is in the sidebar. `/prepare/:setId` opens a Set with its
chapters as heading rows, its entries' planned times, notes and warnings, and the entry selected planned
in the Inspector. Drag, the entry and heading menus, the chapter dialog and the Inspector's fields each
make one engine call and re-read the Set. "Play Set" and a double-click hand the entries, repeats
included, to `playQueue`. At the default 1,280 × 800 window and `--scale: 2` the Set shows **7 whole
rows** with the sidebar expanded and as a rail, and 4 with the player's bar on screen. "Open in Prepare"
now leads there from the Library's tree, its Inspector and its Set scope.

**What was built.**

- **Navigation** (`navRegistry.ts`, `App.tsx`, `prepareLink.ts`):
  - `prepare` is enabled and `nested`, so `/prepare/:setId` keeps Prepare lit, and DEC-027 remembers
    `prepare`, never a Set.
  - The page keeps its own memory of the last Set. `/prepare` opens that Set while it exists, else the
    first Set in the tree. A Set that is gone (`SET_NOT_FOUND`) is said, forgotten, and another opens.
  - With no Sets, the page says what a Set is and offers "New Set" (a name and a folder) and "New Set
    from…". The second asks for a source first, then opens PREP-09's own dialog.
  - `App.tsx` passes `onOpenInPrepare` to the Library on both of its routes, which lights up PREP-09's
    three links.
- **The layout** (`PrepareLayout.tsx`): the Set, and beside it the source panel with a divider that is
  dragged or moved with the arrow keys. Its width is stored as chosen and clamped when read, as the
  Inspector's is. The Inspector is unchanged, still where DEC-018 put it and still hideable.
- **The header**: the Set picker (the tree's Sets and the folders leading to them), "Play Set" and
  "Export ▾" (Save set list…, Copy set list, Export to Rekordbox…). Below them is one line: the entry
  count, the running time ("9:00 planned · 4 untimed"), the warnings ("5 warnings · 1 accepted", each
  kind in its title) and what the file checks leave unknown. The line ends with "Columns…".
- **The Set table** (`prepareColumns.tsx`, `prepareRows.ts`) is a `TrackTable` over rows of its own type,
  an entry or a chapter heading.
  - Columns: position, starts at, in, out, planned, title, artist, BPM, key, transition and note.
  - Title, artist, BPM and key are the Library's own cells.
  - A heading puts each fact about its chapter under its column: the name under Title, its time against
    its target under Planned, its BPM range under BPM, its warnings under Transition and its notes under
    Note.
  - One unnamed chapter draws no heading (DEC-103).
  - A repeat is marked beside its place, and an entry's own warnings beside its title.
- **Editing**:
  - Drag reorders entries. A drop on a heading goes to that chapter's start. A drop on an entry goes
    before or after it, in that entry's chapter.
  - An entry's menu: "Play Set from here", "Play next", "Add to queue", "Start a chapter here" (greyed
    where one starts), "Insert a repeat after", "Remove from Set", then Similar tracks and the track's
    pages. On several entries, playing, queueing and removing.
  - A heading's menu: "Rename, targets and notes…" (one dialog, one `updateChapter`), "Move chapter up",
    "Move chapter down" and "Delete chapter…". A double-click on a heading opens its dialog.
- **"In this Set"** (`SetEntryZone.tsx`), above "Yours" through a new `leadZone` on `TrackDetailPanel`.
  It shows the entry's place and start, its in and out times (saved together when a field is left or
  Enter is pressed), its note, and its chapter. It also lists the transition's and the entry's own
  warnings, each transition warning with "Acknowledge" or "Withdraw", and a repeat's other places.
- **Playing** (DEC-108): "Play Set" plays from the start. A double-click on an entry, or Enter on it,
  plays from that entry. Both send the entries in order, repeats included, to `playQueue`. Nothing about
  the player changed.
- **The double-click fix** (DEC-112):
  - `TrackTable` gives itself focus on a mouse press with `preventScroll`, so the press's own focus
    moves nothing. A component test reproduced the defect first.
  - The Windows run found a second cause, described in decision 6.
- **Three generic additions to `TrackTable`**: `rowClassName`, `canDragRow`, and the row a drop landed
  on as a third argument to `onRowDrop`. None of them means anything to the table.

**Where the specification was open, and what was done.**

1. **The header is compact, because the specified one cost five rows.**
   - Built as specified (the picker, the name, "Play Set", "Set list ▾" and "Export to Rekordbox…"), the
     header wrapped to three lines in the 620px the Set has with the sidebar and Inspector open. The
     Set then showed **2** whole rows, and the page scrolled.
   - Every control is the design system's 44px hit target doubled, so they cannot shrink. The picker is
     now the page's title, and the `<h1>` stays for assistive technology.
   - "Set list ▾" and "Export to Rekordbox…" are one menu, "Export ▾": all three entries take the Set out
     of CuePoint (DEC-109, DEC-110), as the Library's "Collection file ▾" holds its import and export.
   - The strip that was under the table is gone: its count is in the header's line, and "Columns…" is a
     link at the line's end.
2. **The row count, measured and held** (`e2e/prepare.spec.ts`):
   - **7** whole rows as the page opens, with the sidebar expanded and as a rail. This is DEC-112's
     measurement, above its floor of five, and `WHOLE_ROWS` holds it.
   - **4** with the player's bar on screen, held as `WHOLE_ROWS_PLAYING` so it cannot quietly get worse.
     That is below five, and it is recorded rather than hidden. The bar takes 116px at scale 2, and a
     fifth row would need a smaller control or scale, which DEC-112 leaves alone.
   - The page itself does not scroll in any of the four states.
3. **The Set's floor is 100px × scale**, lower than the Library's 140. With the Library's floor, the
   player's bar made the page scroll and the header slide away for no extra row.
4. **The source panel's place is built and empty.** The layout, the divider and its remembered width are
   PREP-10's and are tested with a panel in them. The page passes none until PREP-11 has one, because a
   divider beside an empty pane moves nothing. So the width check here is without the panel: nothing
   spills sideways and every header control is on screen, sidebar expanded and as a rail. PREP-11 re-runs
   it with the panel.
5. **The set list actions are in the header now.** PREP-09 handed "Set list ▾" to PREP-11, but the header
   is PREP-10's, so `useSetList` is wired here and PREP-11's set list item is done.
6. **On Windows the double-click was defeated by something else, and both causes are fixed.**
   - Phase 8's macOS pass saw the browser scroll a partly visible row into view. On Windows, the spec
     passes with the focus fix removed, so Chromium there does not scroll on a mouse focus. The component
     test holds that fix, and its end-to-end proof is owed on macOS.
   - What defeated it on Windows was the selection strip. It did not wrap, so the buttons a first click
     brings ran past the Library's scrolling column and gave it a horizontal scrollbar. The scrollbar
     appeared under the rows, over the row that had been clicked, and the second click landed on it.
   - `.cp-selection-actions` now wraps. The end-to-end test double-clicks a Library row the column cuts,
     and fails without the fix.
   - Neither fix changes the Library's height, floor or scale (DEC-112).
7. **The Inspector's chapter picker moves an entry the least distance**: to the start of a later chapter,
   or the end of an earlier one.
8. **Deleting a chapter asks first**, and says which chapter its entries join. A chapter's name, notes and
   targets cannot be recovered, though its entries and their times stay.
9. **Headings are rows, not entries.** A heading cannot be selected, dragged or played. Its double-click
   and its menu open its dialog.
10. **"Refresh first" from Prepare opens the Library and starts "Check for changes"**, through a location
    state as a Health count opens its rules (`libraryRefreshState`). DEC-082's one click holds wherever
    the export was opened.
11. **"New Set from…" on Prepare offers Collections, Smart Collections and Rekordbox playlists.** A Set
    is not offered, because "Duplicate" copies one whole, chapters and times included.
12. **The registry has no disabled destination left.** The launch-memory tests that used Prepare as the
    disabled case now run against the real registry with Prepare turned off, rather than against an
    invented list.

**Handed on.**

- **PREP-11:**
  - Pass the source panel to `PrepareLayout` as `source`, and re-run `prepare.spec.ts`'s width check
    with it present.
  - The insertion point is the entry the page calls `focused`.
  - The Set table accepts only its own entry drag (`SET_ENTRY_MIME`). A library row dropped on it needs
    `insertTrackInCollection` with the place and chapter `dropMove` would give.
- **PREP-12:**
  - The user guide's Prepare page.
  - The macOS pass owes the focus-scroll half of the double-click fix, and a look at the player-bar row
    count there.

**Still owed from before this step.** This document's opening asks for Phase 5's owed acceptance to be
closed, or deferred by the user, before "Play Set" is wired. That acceptance is a notarization
submission, the rows that need a real audio interface or a listener, and the DEC-055 amendment. It is
not closed yet. "Play Set" only calls the existing `playQueue` and changes nothing in the player, so this
step adds no player risk. Those items still stand, and were raised with the user when this step was
reported.

**Tests**: 123 new: 13 in Python, 109 in the renderer and one end-to-end spec.

- **`src/tests/unit/engine/test_prepare_fixture.py` (13)** produces `prepare.fixture.json` from a real
  engine:
  - Friday, six entries in three named chapters, track 1 twice, a target and a BPM range crossed, two
    timed entries, a note, a tempo jump left standing and a key clash acknowledged.
  - Plain, one unnamed chapter with a track that has no BPM or key.
  - The answer to each edit the page makes, and the four refusals it acts on.
  - The file must equal a fresh capture, and twelve tests hold each state to what it claims.
- **Renderer (109)**, over that fixture:
  - `prepare.test.ts` (42): the rows and their headings, what a drop and a chapter change ask of the
    engine, where a chapter starts and a repeat goes, the page's words and the header's line, both
    menus, the chapter dialog's form, "New Set from…"'s sources, where `/prepare` goes and the divider's
    width.
  - `PrepareScreen.test.tsx` (50):
    - With no Sets: making one, a refusal, and making one from a source it asks for.
    - Which Set opens: the last one, the first one, the picker, a gone Set, a bad address, a failed
      read, and a shell without the bridge.
    - The header and the rows, with and without headings.
    - Playing, and every edit: the drag, both menus, the dialog and its refusal, the Inspector's times,
      a refused time, the note, the chapter and "Acknowledge".
    - The set lists and the export.
  - `PrepareLayout.test.tsx` (4): no divider without a source panel; the remembered width; the arrow
    keys; a drag that stops at the floor.
  - `trackTableClick.test.tsx` (3): a press focuses the table without a scroll. It failed on the
    unfixed table.
  - `trackTableRowKinds.test.tsx` (3): a row's class, and rows that cannot be picked up.
  - The rest:
    - `App.test.tsx` (+3): Prepare in the sidebar, a Set's address lit and remembered as Prepare, and
      reopened on Prepare.
    - `lastDestination.test.ts` (+1) and `navRegistry.test.ts` (+1): Prepare remembered, never its Set;
      nothing left disabled.
    - `LibraryScreen.test.tsx` (+1): a refresh another page asked for starts once, in StrictMode.
    - `libraryLink.test.ts` (+1).
- **`e2e/prepare.spec.ts`**, at the default 1,280 × 800 window and `--scale: 2`, measures the whole rows,
  the width and the page's own scroll, sidebar expanded and as a rail, with and without the player's
  bar. It double-clicks a partly visible row on the Prepare page, and one on the Library page, where
  the pointer would be. It failed on the Library without the selection strip's fix.

Thirty deliberate breakages, each caught:

- one unnamed chapter drawn with a heading;
- a drop on a heading taken as a drop between rows;
- a move down the list not counted without the entry;
- a drop's chapter taken from the moving entry;
- an earlier chapter joined at its start;
- a chapter started where one starts;
- a repeat inserted before its entry;
- a transition drawn on the entry it leaves;
- the running time silent about untimed entries;
- accepted warnings left out of the count;
- an accepted warning drawn as open;
- the header forgetting what the file checks leave unknown;
- "Play Set" starting past the first entry;
- the queue dropping the repeat;
- a double-click playing the row's place, headings counted;
- an acknowledgement naming the wrong entry before;
- a heading selectable;
- a chapter deleted without asking;
- a refused chapter edit sent to a toast;
- a gone Set remembered;
- `/prepare` ignoring the last Set;
- the chapter dialog sending only the name;
- the export not ticking the Set;
- a heading's row picked up;
- the table ignoring which rows can be dragged;
- a mouse press focusing the table with a scroll;
- the divider moving the wrong way;
- Prepare left disabled;
- a Set's address not routed;
- the Library starting a second refresh for one "Refresh first" (StrictMode).

The last was missed at first, because the test rendered without StrictMode, where the effect runs once.
It renders as the app does now, and catches it. The two breakages behind the double-click were also
held end to end. With the selection strip unwrapped, `prepare.spec.ts` fails on the Library. With the
focus fix removed it passes on Windows, as decision 6 says.

The existing tests pass. Seven were changed:

- the registry, launch-memory and sidebar tests, whose "disabled" example was Prepare (decision 12);
- one `TrackTable` drop assertion, which pins the new third argument.

**Checks run**:
- **Python:**
  - The full suite: 11,030 passed and 62 skipped (11,017 before, and the 13 new).
  - `ruff check` and `ruff format --check` on `src/`, the mypy gate, `check_no_qt_in_core.py`, the
    desktop version coupling and the engine health smoke test. No Python outside the new test changed.
- **Renderer:** the type-check, lint (exit 0, with only the 8 warnings that were already there) and
  125 files and 3,601 tests (3,492 before).
- **Electron:** the type-check and 24 files, 568 tests.
- **End to end:**
  - `prepare.spec.ts` passes three times in a row against the packaged Windows build
    (`release/win-unpacked`, rebuilt with a fresh engine sidecar). It measured 7, 7, 4 and 4 whole
    rows each time.
  - On the development build, `libraryPlayback.spec.ts` and `playback.spec.ts`, the two Phase 8 reported
    failing on macOS at `rows.nth(1)`, pass unweakened on Windows, with `shell.spec.ts` and
    `libraryPage.spec.ts`: 19 of 19. They are owed on macOS.
  - The rest of the suite: 57 passed on the development build. The opt-in 50,000-track memory
    measurement was skipped, as it is without `CUEPOINT_E2E_MEMORY`.
- `git diff --check`.

---

## PREP-11 — The Source Panel and the Shape Lanes ✅ IMPLEMENTED 2026-09-29

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

**Outcome**: Implemented (2026-09-29). The Prepare page fills a Set from two places beside it,
Suggestions and the library, and draws the Set's tempo and key as two lanes above its table. A track
goes in at one place, the gap after the selected entry or the end of the Set, by "Insert here", by a
row's menu or by a drag to where it should land. After an insert the new entry is selected, so the next
suggestion fits after it. Each suggestion shows its score and its reasons against each neighbour, and
is marked when the track is already in the Set. A gap nothing bridges says how far apart its
neighbours are and offers each side's own list. At the default 1,280 × 800 window and `--scale: 2`
the Set keeps every row PREP-10 measured, and the panel shows 4 whole Suggestions on Linux.

**What was built.**

- **The engine, two additions to answers that already crossed** (no new route, no new method):
  - `sets/suggestions` sets each suggestion beside the Library's own row for its track, as
    `sets/entries` sets each entry (`_track_rows`, one serializer for both). The panel draws, drags and
    inserts a suggestion with no read per track. A suggestion whose track a refresh deleted in between
    is left out, as an entry is.
  - `sets/analysis` gains `shape`: every entry in order with its effective BPM (to the two decimals a
    warning compares), its key in the library's notation and its place on the Camelot wheel, and every
    transition with how its keys relate (`same`, `adjacent`, `relative`, or `null` for a clash or an
    unknown key). It is `core.set_analysis.shape_of`, read from the same `EntryFacts` the checks read,
    through the same `key_relation`. A lane therefore cannot disagree with a warning.
  - `SetSuggestion.track`, `SetAnalysis.shape`, `SetShape`, `SetShapeEntry`, `SetShapeTransition` and
    `SetCamelot` are in both TypeScript copies. `desktopContract.test.ts` and `test_sets_contract.py`
    hold them together and to real answers.
- **The insertion point** (`prepareSource.ts`): the gap after the selected entry (the one the page
  calls `focused`), or after the last entry with nothing selected. A track put there joins the chapter
  of the entry before it, as the engine places an insert (PREP-02). Suggestions names that chapter in
  its request, so the range that narrows the list is the chapter the track will land in. The panel says
  the point in words: "Between “Open One” and “Open Two”, in Open", or "After “Peak Two”, at the end
  of the Set, in Peak". It names no chapter in a Set that draws no headings (DEC-103).
- **The source panel** (`SourcePanel.tsx`, `SourceTable.tsx`, `sourceColumns.tsx`,
  `useSetSuggestions.ts`), passed to `PrepareLayout` as `source`:
  - Two tabs, Suggestions and Library, remembered.
  - One pool picker for both: the whole library, a Rekordbox playlist or folder, a Collection, a Smart
    Collection or a Set, as Clean's scope offers them (`scopeOptions`). It is remembered, and a pool that
    has gone reads as the library. It crosses as the Library's own parameters (DEC-023).
  - **Suggestions** asks `sets.suggestions` for the point, 150 ms after the selection stops moving, and
    again after every re-read of the Set. Only the answer to the gap asked about now is drawn. The table
    shows the title (marked ↻ when the track is already in the Set), each side's reasons in words
    (`similarReasons.ts`), the score, BPM, key and artist. A list fitted to one side has no column for
    the other.
  - Notes, as asked: the chapter's range that narrowed the list, a neighbour with no BPM or key to
    compare, and an index still building. A gap nothing bridges is explained, and "Fit after “A”" and
    "Fit before “B”" ask for each side's list through `against`. "Fit both sides" goes back, and a new
    gap forgets the side. An empty Set says it has nothing to fit against and offers the Library tab.
  - **Library** searches the pool through the one browse route (`useTrackWindow`), and sorts by any
    column the engine sorts by.
  - Every row inserts at the point ("Insert here", and first in its menu). A row drags as track ids, a
    copy. A double-click or Enter plays it, as a library row plays everywhere (DEC-012). Its menu also
    offers play next, add to queue, Similar tracks and its pages.
- **Inserting** (`PrepareScreen.tsx`):
  - Tracks go in one insert each, in the table's order, through `insertTrackInCollection`, the one
    path that writes an entry, with the place and chapter named.
  - The room is checked first (`roomFor`), so a Set too full for the gesture refuses it whole rather
    than part-way.
  - The last entry put in is selected once the Set is re-read, and a toast says what went in.
- **Drops on the Set** take track ids as well as its own entries:
  - `dropPlace` (in `prepareRows.ts`) is the place a drop names: a heading's chapter start, or before
    or after an entry, in that entry's chapter. `dropMove` is now that place, counted as the engine
    counts a move.
  - An empty Set's note takes the first drop.
- **The lanes** (`prepareLanes.ts`, `SetLanes.tsx`):
  - A strip above the Set table, drawn as inline SVG rectangles in whole pixels with `crispEdges`,
    `currentColor` and theme tokens, and no chart library.
  - Tempo: one column per entry, a flat mark at its BPM's height, joined to the next by a vertical
    step. Half time is drawn as the step it is.
  - Key: 24 rows, 1A at the bottom to 12B at the top, so the relative key is one row away and a step on
    the wheel two. Lines are solid for the same key or one step, dashed for the relative key, and
    dotted in the danger token for a clash.
  - An unknown value is a gap with no line into or out of it (DEC-111). A chapter boundary is a line
    across both lanes. The selected entry's column is lit.
  - Clicking a column selects its entry, which moves the insertion point there. Each column's title says
    what it draws: "3 · Half Time · 63 BPM · 9A".
  - The lanes open and close from "View ▾" and are remembered.
- **Generic changes, each tested where it is made:**
  - `TrackTable` answers a drag that only copies with a `copy` drop effect. Chromium refuses a drop
    whose effect its drag does not allow, and says nothing.
  - `useBeatportSelection` gains `select`, one row picked from outside the table.
  - `PrepareLayout` clamps the source panel against its own width (below).

**Where the specification was open, and what was done.**

1. **A suggestion carries its track's row.** Similar Tracks reads each suggestion's row with
   `getLibraryTrack`, one full detail read per track. At every gap the selection passes, that is fifty
   reads. The route now answers with the rows, from the serializer `entries` uses. The field is
   additive, so no caller had to change.
2. **The lanes draw the engine's reading, not a second one.** Drawing the key lane needs each key's
   place on the wheel, and the lines need the relation between neighbours. Both are the business rule
   (AGENTS.md: rules stay in Python). A renderer parser of key text would have been a second reading of
   keys the engine already parses, and it could disagree with a warning. So `analysis` carries the
   shape, and the renderer only lays it out. It is in the answer the page already reads after every
   edit, rather than a twenty-first route and a fourth read per edit.
3. **The lanes start hidden.**
   - DEC-112 holds the Set's whole rows as the page opens. With the lanes open, the Set shows 5 whole
     rows on Linux instead of 8.
   - They open from the header and stay open once opened, which keeps them visible to anyone who uses
     them. The page as it opens keeps every row PREP-10 measured.
   - The lanes are as compact as their content allows: a 20-row tempo lane, a 24-row key lane (one row
     per wheel code) and a 2-unit gap.
4. **"View ▾" replaces "Columns…" in the header's line.** A second link ("Show lanes") wrapped the
   facts line onto a second line at the default width, which cost the Set a row. The lanes and the
   columns now share one menu, and the line stays one line.
5. **The panel's controls are compact.** In the default window the panel is about 290 px wide and
   390 px tall, and the table's own header takes 70 of them. With the design system's doubled hit
   targets, the tabs, the pool and a footer button left the table no whole row. The tabs, the pool
   select and "Insert here" are now a row's height. "Insert here" sits at the end of the pool's line,
   where the select gives way and the button never does. The point is one line of text, and a
   suggestion's title carries every reason as its tooltip, because the reason columns are off to the
   right at this width. Result: 4 whole Suggestions rows on Linux.
6. **The source panel is clamped against the layout, not the window.** PREP-10 limited the panel to 45%
   of the window. With the sidebar and the Inspector open, that let it be wider than the Set, against
   DEC-112 ("the Set stays the wider pane"). The layout now measures itself. The stored width is still
   the one chosen, so it comes back on a wider window.
7. **A double-click on a source row plays it.** DEC-012 gives a library row's double-click its meaning
   everywhere, and hearing a candidate before it goes in is what the panel is for. Inserting is one
   click on "Insert here", or a drag.
8. **An insert selects what it made**, so filling a Set runs forward: suggest, insert, and the next gap
   is after the new entry.
9. **A gesture is refused whole when the Set has no room.** A Set holds 1,000 entries (PREP-02). The
   inserts are one call each, and a refusal half-way would leave part of a selection in.
10. **Missing genre, label or artist is a tooltip, not a note.** A neighbour with no BPM or key changes
    what can be suggested, and says so on the panel. A missing label is ordinary in a library, and a
    line about it on every gap would cost the panel a row.
11. **Set lists needed nothing here**: PREP-10 wired "Save…" and "Copy" into the header's "Export ▾".

**A defect found and fixed: a stale "In this Set" zone (PREP-10).**

- `TrackDetailPanel` drew the caller's lead zone, keyed by entry id, in the same list of children as
  its own editor, keyed by track id.
- In a Set made from the library in order, entry 3 is often track 3. Both children were then keyed
  "3", and React left the old zone beside the new one when the selection moved: "Entry 3" under the
  track at entry 4.
- Found by the end-to-end run of an insert. The zone now has a slot of its own, and
  `TrackDetailPanel.leadZone.test.tsx` failed on the unfixed panel.

**Handed on.**

- **PREP-12:**
  - The user guide's Prepare page covers the source panel, the insertion point, "Insert here", the
    drag, each side's own list and the lanes.
  - The packaged Windows run records its own numbers for the Set with the lanes open and for the
    panel's rows. `prepare.spec.ts` holds each at Linux's measurement less one, the offset every
    PREP-10 state showed, until then.
  - The phase journey's step 4 ("Fill a gap from Suggestions") is `prepareSource.spec.ts`'s first half.
  - The CHANGELOG entry for the phase.
- **The macOS pass** owes both specs, with PREP-10's items.

**Tests**: 120 new: 23 in Python, 96 in the renderer and one end-to-end spec.

- **`src/tests/unit/engine/test_prepare_source_fixture.py` (13)** produces
  `prepareSource.fixture.json` from a real engine:
  - Build, in two chapters, with a range on Peak, fitted at a gap on both sides, at a gap nothing
    bridges and at each side of it, at the end, and over a Collection, a Smart Collection and a
    Rekordbox playlist.
  - Shape, with every lane case; Blank, empty.
  - The Library tab's three reads, an insert naming its chapter, and the three refusals the panel acts
    on.
  - The file must equal a fresh capture, and twelve tests hold each state to what it claims.
- **Python, beside it (10):**
  - `test_sets_api.py` (+2): each suggestion's row is the Library's browse row, and a suggestion whose
    track has gone is left out.
  - `test_set_analysis.py` (+5): every entry is a point, each transition relates as `key_relation`
    says, no relation is exactly a clash (all 576 pairs), an empty Set, and the BPM a warning compares.
  - `test_set_analysis_service.py` (+3): the wire's shape with effective values and overrides, keys in
    the library's notation and on the wheel, and a clash.
  - `test_sets_contract.py` holds `SetSuggestion.track`, `SetShape` and its parts to real answers.
- **Renderer (96):**
  - `prepareSource.test.ts` (31): the point for each selection, chapters and an empty Set; its words;
    the pool's parameters and fallback; the request; the no-fit sentence and the side buttons; the range
    note; the unused notes; the words for key relations; the in-Set mark; room; the button's label and
    the toast; `dropPlace` and `dropMove` agreeing.
  - `prepareLanes.test.ts` (16): columns and their widths, the tempo marks, steps and gaps, the wheel's
    rows, each relation's style and pattern, the chapter boundary, and whole pixels at every scale and
    width.
  - `PrepareSource.test.tsx` (30), over the fixture:
    - The point and its request, one request per stop.
    - Both sides' reasons and the score, the in-Set mark and the tooltip, the range, no fit and each
      side, a new gap forgetting the side, stale and other refusals, an empty Set, and playing.
    - Inserting one, several in order, the entry selected after, the row menu, a Set with no room, the
      drag's payload, drops on a heading, an entry and an empty Set.
    - The pool's options, parameters, memory and fallback.
    - The Library tab's memory, search, insert, scope, sort and playing.
    - The lanes' memory, their drawing and a column's click.
    - A shell without playlists.
  - `useSetSuggestions.test.ts` (7): the wait, the re-read, no gap, nothing drawn for a new gap until it
    answers, a late answer dropped, each refusal, and retry.
  - The rest:
    - `sourcePanelState.test.ts` (4).
    - `TrackDetailPanel.leadZone.test.tsx` (1), the regression above.
    - `useBeatportSelection.test.ts` (1).
    - `TrackTable.test.tsx` (+1), the copy drop.
    - `PrepareLayout.test.tsx` (+1), the clamp.
    - `desktopContract.test.ts` (+4), the new shapes in both copies.
- **`e2e/prepareSource.spec.ts`**, through the real engine:
  - The end of the Set named with nothing selected.
  - A gap filled from Suggestions and read back from the engine, with the selection following.
  - A gap nothing bridges, and each side.
  - A search and a drag from the Library tab, landing where it was dropped.
  - The lanes opened, a clash drawn, and a column selecting its entry.
  - A reload keeping the tab and the lanes.
- **`e2e/prepare.spec.ts`**, extended:
  - The width check with the panel beside the Set: every panel control on screen, the Set the wider
    pane, nothing in the panel wider than it.
  - The panel's whole Suggestions rows.
  - The Set's whole rows with the lanes open, sidebar expanded and as a rail, with the page never
    scrolling.

Thirty-six deliberate breakages, each caught:

- In the renderer:
  - a gap joining the chapter after;
  - an insert before the selected entry;
  - a request without its chapter;
  - a playlist sent as a Collection;
  - the last gap's answer drawn under the new gap;
  - no wait before asking;
  - a stale gap said instead of re-read;
  - several tracks inserted at one place;
  - no room check;
  - a drag as a move;
  - a table that always answers "move";
  - a heading's drop joining the chapter before;
  - key lines ignoring the engine's relation;
  - an unknown BPM drawn as a zero;
  - B drawn below A;
  - the lead zone sharing the panel's keys;
  - the layout clamped by the window;
  - both reason columns always drawn;
  - one side's list kept across gaps;
  - the inserted entry not selected;
  - a gone pool kept;
  - the tab not remembered;
  - a missing label drawn as a note;
  - a folder's children left out of the pool;
  - the lanes open by default;
  - a lane's click selecting nothing;
  - an empty Set's drop ignored;
  - the in-Set mark dropped.
- In the engine:
  - suggestions without their rows;
  - a gone track's suggestion kept;
  - every step the same key;
  - an unknown BPM as zero;
  - a BPM unrounded;
  - keys always in Camelot on the wire;
  - the wheel's letter swapped;
  - no shape on the wire.

Two of them were missed at first: the last gap's answer drawn while the next was loading, and asking
with no wait. The hook's tests now check what shows while a new gap loads, and advance the clock to
just short of the wait. Both are caught.

The existing tests pass. Four were changed, each for a reason this step gave:

- PREP-10's harness answers `sets.suggestions`, which the real bridge always does.
- "Ignores a drag that is not an entry" used a track drag as its example of a foreign one. PREP-10
  handed track drops to this step, so it now uses text.
- The header test opens "View ▾" to find "Columns…".
- `prepare.fixture.json` was regenerated: its analyses gained `shape` and nothing else changed.

**Checks run** (on Linux, in a container with no audio device; Windows and macOS are owed, above):

- **Python:**
  - The full suite, on eight workers: 11,021 passed, 49 skipped, 7 failed, 3 errors in collection.
    The ten fail identically on the base commit, with this step's changes set aside:
    - three files need PySide6, the optional Qt material, which is not installed here;
    - one test expects a case-insensitive file system (Windows, macOS);
    - two Beatport search tests about how many merged results come back;
    - three about the support-bundle command and diagnostics;
    - `test_step55_mypy_validation.py`, which its workflow calls a debt record rather than a gate.
  - The strict mypy gate (`test_mypy_foundation.py`), which covers `sets_api.py`, `set_analysis.py`
    and `set_analysis_service.py`, passed.
  - `ruff check` and `ruff format --check` on `src/` with the pinned ruff 0.14.0.
  - `check_no_qt_in_core.py`, the desktop version coupling and the engine health smoke test.
- **Renderer:** the type-check, lint (exit 0, with only the 8 warnings that were already there), and
  132 files and 3,697 tests (3,601 before, and the 96 new).
  - Two of three full runs passed whole. The third failed one test this step does not touch:
    `StatusStrip.test.tsx`'s "follows progress over SSE", at 1,062 ms against Testing Library's 1 s
    wait under the load of the full suite.
- **Electron:**
  - The type-check, and 22 files and 532 tests, with 36 skipped because no bundled mpv is fetched here.
  - Pointed at Debian's mpv 0.37, the mpv files run too. One fails: it asserts which platforms the
    *pinned bundled* build has the SoX resampler on (DEC-055), and Debian's is a different build.
- **End to end**, on the development build under Xvfb, with Debian's mpv:
  - `prepare.spec.ts` and `prepareSource.spec.ts` together passed 15 times in 16 runs, and
    `prepare.spec.ts` alone 5 of 5. The one failure came after every row measurement had passed, in
    PREP-10's Library double-click, which waits 30 s for mpv to report the track playing. Its error
    was not kept.
  - The whole suite: 54 passed, 1 skipped, 4 failed. Three are player specs that fail the same way on
    the base commit here: their queue rows are marked failed, since this mpv has no audio device.
    The fourth, `playback.spec.ts`, failed once on which track had advanced, and passed twice alone
    afterwards. None of the four touches anything this step changed.
- `git diff --check`.

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
