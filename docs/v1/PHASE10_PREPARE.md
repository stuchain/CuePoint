# CuePoint v1.0.0 — Phase 10: Prepare, Detailed Step Specifications

Status: **Specified 2026-09-28. No step is implemented.** The twelve steps below replace the roadmap's
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

## PREP-01 — The Set Schema

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

**Outcome**: Not started.

---

## PREP-02 — The Set Kind Through the Collection Code

**Objective**: A Set is created, filed, filled, counted, referenced and ruled on by the code that does
all of that for Collections, and every test of `kind` is correct for it.

**User-visible result**: None yet.

**Dependencies**: PREP-01.

**Existing code reused**: `collection_repository.py`, `collection_service.py`, `organization_api.py`,
`filter_rule.py`'s `collection` field, `references_for`.

**Design**:

- **The kind.** `KIND_SET = "set"` joins `KINDS`. `Collection.holds_tracks` is true for a Collection or
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

**Outcome**: Not started.

---

## PREP-03 — Chapters, Times and Notes

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

**Outcome**: Not started.

---

## PREP-04 — Suggestions at an Insertion Point

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

**Outcome**: Not started.

---

## PREP-05 — The Set's Warnings

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

**Outcome**: Not started.

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

- `EXPORTED_KINDS` gains `KIND_SET`. A Set is appended exactly as a Collection is: one `NODE` of
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
  what it now answers for a Set (fact 2). `CollectionKind` gains `"set"` in both type files.
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
