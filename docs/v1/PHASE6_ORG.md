# CuePoint v1.0.0 — Phase 6: Organization, Detailed Step Specifications

Status: **ORG-01…ORG-12 implemented; ORG-13 specified, not implemented.** The
thirteen steps below are the inventory the roadmap has carried as a placeholder since Phase 0.
Per the process, no implementation happens from this document — each step needs an explicit
"Implement ORG-NN" instruction, scoped to exactly that step, and its outcome is recorded under the
step afterwards.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`), Phase 3
(`PHASE3_LIBRARY.md`) and Phase 4 (`PHASE4_LIBUI.md`), all complete, and on Phase 5
(`PHASE5_PLAYER.md`), all steps implemented. Decision Rounds 1–8 apply (`DECISIONS.md`,
DEC-001…DEC-064). Phase 6's own decisions are DEC-057…DEC-064, alongside DEC-006 (Collections are
the only native unit), DEC-015 (flat tags), DEC-016 (flat AND-only rules), DEC-008 (per-field
history instead of an undo stack), DEC-011 (the refresh warning this phase makes real), DEC-043
(one rule model), DEC-045 (a selection can be a query) and DEC-047 (the read-only Inspector this
phase makes editable).

## What this phase is

Every phase so far has been about tracks Rekordbox owns. Phase 3 imported them, Phase 4 made them
browsable, Phase 5 made them audible — and nothing in the build can record a single thing the user
thinks about a track. This phase is CuePoint's own data: a rating, a favorite, a note, tags,
Collections in a folder tree, and Smart Collections that save the rule model Phase 4 has been
holding in view state since LIBUI-02.

It is also the first phase that **writes user data**. Everything before it either read Rekordbox's
export or wrote CuePoint's own bookkeeping. From ORG-02 onward there is data in the database that
exists nowhere else in the world, that a Rekordbox refresh must never touch, that a backup must
carry, and that a delete cascade can destroy. The invariant AGENTS.md states about user data starts
applying to CuePoint's own tables here.

**What this phase is not.** It writes nothing outside the database — no audio-file tags, no
Rekordbox XML (DEC-064). It does not export anything; Collections reach Rekordbox in Phase 8. It
does not touch Beatport values, duplicates, missing files or library health (Phase 7, DEC-004,
DEC-037). It does not build Sets or Chapters (Phase 10, DEC-017). It does not add OR logic or
nested rule groups (DEC-016), and it does not build the per-field revert UI (deferred below, with
its reason). It does not migrate `ResultsTable`, inKey or inCrate onto `TrackTable` (DEC-041,
DEC-021), and it does not retire inCrate's separate inventory database (DEC-030, Phase 9).

## What the earlier phases already built

The roadmap line for this phase says Collections, tags and ratings are "entirely new, no existing
code to reuse". That was true of the *product surface* when it was written and is not true of the
machinery underneath it. Read this table before writing any of it again:

| Already exists | Where |
| --- | --- |
| The rule model, its field registry, its operator whitelist and its refusals | `models/filter_rule.py` |
| Rule → SQL compilation, with bound parameters and escaped `LIKE` wildcards | `persistence/filter_sql.py` |
| Windowed browse, counts, sort whitelist, scope predicate, facets | `persistence/track_query.py`, `track_repository.browse` |
| Per-field change history: table, repository, service, and a working revert | `migrations/m0004_activity.py`, `persistence/activity_repository.py`, `services/activity_service.py` |
| The activity feed and its status-strip surface | `engine/activity_api.py`, Phase 2's activity panel |
| Background jobs: thread-per-job, cooperative cancel, SSE progress, persisted records | `engine/jobs.py`, `engine/library_jobs.py` |
| A folder/playlist tree: building, flattening, expansion persistence, 866 lines of tests | `screens/library/playlistTree.ts`, `PlaylistPane.tsx` |
| Selection by id, including "everything the query matches" as a description | `screens/library/trackSelection.ts`, `useTrackSelection.ts` |
| The track context menu, keyboard-navigable and themed | `components/TrackContextMenu.tsx` |
| The Inspector, filled with every imported field, read-only | `screens/library/TrackDetailPanel.tsx` |
| The filter bar, the vocabulary hook and the facet hook | `screens/library/FilterBar.tsx`, `useFilterVocabulary.ts` |
| Pixel icons including `collections`, `folder` and `playlist` | `components/pixelIcons.ts` |
| The DEC-011 reference seam and its watched-callers test | `models/references.py`, `services/library_service.py`, `tests/unit/services/test_reference_check_seam.py` |
| Migrations 1–8 and their runner | `migrations/`, `services/migration_runner.py` |
| Automatic backup on launch with retention | `services/backup_service.py` |

Phase 6 is new tables under that machinery and new surface over it. Almost nothing here is a new
mechanism.

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-057 | CuePoint metadata is its own layer; a refresh cannot overwrite it | ORG-01, ORG-02 |
| DEC-015 | Tags are flat, with an optional category and a colour | ORG-01, ORG-03 |
| DEC-058 | A Collection is ordered and may repeat a track | ORG-01, ORG-04 |
| DEC-059 | Collections and Smart Collections nest in folders | ORG-01, ORG-04, ORG-09 |
| DEC-011 | The refresh warning finally answers something | ORG-04 |
| DEC-060 | Rules reach tags, ratings, favorites and membership | ORG-05 |
| DEC-016 | Flat AND-only rules, with room for `any` later | ORG-05, ORG-06 |
| DEC-061 | Smart Collections are live, duplicable and freezable | ORG-06 |
| DEC-063 | Batch edits: threshold, then a job; full history under a batch id | ORG-01, ORG-07, ORG-11 |
| DEC-008 | Per-field history for every user edit | ORG-02, ORG-03, ORG-07, ORG-10 |
| DEC-023, DEC-040 | One query path; rows still come a window at a time | ORG-05, ORG-08 |
| DEC-045 | The selection model finally has actions worth its shape | ORG-11 |
| DEC-062 | Collections live in the Library's left pane | ORG-09, ORG-13 |
| DEC-006 | Collections are the only native organizational unit | the whole phase |
| DEC-064 | Nothing is written outside the database | the whole phase |

## Sequencing

```
ORG-01 (schema + domain models)
      │
      ├──────────────┬───────────────┐
      ▼              ▼               ▼
ORG-02          ORG-03          ORG-04
(rating,        (tags)          (collections,
 favorite,          │            folder tree,
 notes)             │            references_for)
      │             │               │
      └──────┬──────┴───────┬───────┘
             ▼              ▼
        ORG-05          ORG-07
   (rules reach     (batch edits
    CuePoint data)   as jobs)
             │              │
             ▼              │
        ORG-06              │
   (smart collections)      │
             │              │
             └──────┬───────┘
                    ▼
            ORG-08 (API + desktop contract)
                    │
      ┌─────────┬───┴─────┬──────────┐
      ▼         ▼         ▼          ▼
   ORG-09    ORG-10    ORG-11     ORG-12
   (pane)   (inspector (actions,  (filter bar,
             editing)   context    save as
                        menu,      smart)
                        batch UI)
      └─────────┴─────────┴──────────┘
                    ▼
            ORG-13 (the page, scale, docs, E2E)
```

ORG-02, ORG-03 and ORG-04 are independent once ORG-01 lands and can be built in any order. ORG-05
needs all three, because the vocabulary it adds names their columns. ORG-09 through ORG-12 are
independent of each other once ORG-08 lands. ORG-13 is last, as LIBUI-10 and PLAYER-12 were.

---

## Before starting any step — six cross-cutting facts

### 1. The desktop contract is six files, and the server speaks two verbs

ORG-08 adds the largest endpoint surface since Phase 3. Per the invariant and
`renderer/src/api/desktopContract.test.ts`, each endpoint moves through all six:

Python `organization_api.py` + `engine/server.py` · `engineClient.ts` · **`engineSupervisor.ts`** ·
`main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a placeholder) ·
`cuepointBridge.types.ts`.

The supervisor is the one that bit in SHELL-04, again in LIBRARY-11, and again in PLAYER-03 — it
forwards method by method and nothing type-checks the gap.

`server.py` implements `do_GET` and `do_POST` and nothing else. **Do not add `do_PUT` or
`do_DELETE`.** Mutations are POSTs to explicit action paths, the way
`/api/v1/library/refresh/apply` and `/api/v1/incrate/reset` already are. A REST verb table is not
worth a new dispatch path in a hand-rolled handler that thirty endpoints already share.

### 2. This is the first phase whose data exists nowhere else

A Rekordbox track can be re-imported from the XML. A rating, a note, a tag and a Collection cannot
be recovered from anything. Three consequences, all of which are step content and not
afterthoughts: every write records history (DEC-008); every destructive action states what it will
destroy before doing it; and the DEC-009 backup taken on launch is now the only copy of real user
work, so ORG-13 verifies that a restored backup brings Collections and tags back with it.

### 3. Two ratings, one meaning (DEC-057)

`tracks.rating` and `tracks.comment` belong to Rekordbox. Nothing in this phase writes them. The
mechanism that makes that structural rather than disciplinary is in ORG-01, and the reason is
concrete: `TrackRepository.update` writes **every** column from a `LibraryTrack`, so a CuePoint
rating stored on `tracks` would be erased by any code path that updates a track from an
import-shaped object. It is stored in a sibling table for that reason.

### 4. One query path, still (DEC-023, DEC-040)

A Collection and a Smart Collection are *scopes* on the existing browse endpoint, exactly as a
playlist is (DEC-044). They are not new endpoints returning rows. Nothing in this phase may load a
Collection's tracks as a list into the renderer, and nothing may sort in JavaScript. The 50,000-row
discipline from Phase 4 applies unchanged, and now applies to a 47,913-track batch edit as well.

### 5. A track may appear twice in a Collection (DEC-058)

Anything written on the assumption that a track appears in a Collection at most once is a bug in
this phase: membership is addressed by entry id, "remove" removes an entry, and a count of entries
is not a count of tracks. The mirrored `rekordbox_playlist_tracks` table keys on
`(playlist_id, position)` because it is rebuilt wholesale on every import; the editable table
cannot borrow that shape (see ORG-01).

### 6. The existing revert works on Rekordbox fields only

`activity_service.apply_field_change` and `revert_field_change` operate through
`REVERTABLE_FIELDS`, setting an attribute on a `LibraryTrack` and calling `TrackRepository.update`.
CuePoint's own fields live in a different table and are **not** added to that set. They record
history through the same repository and are read by the same `track_history` call, but reverting
them is deferred (see "Deferred, with reasons") — and a test asserts the refusal is explicit rather
than a silent no-op.

---

## ORG-01 — The Organizational Schema ✅ IMPLEMENTED 2026-09-06

**Objective**: One migration that lands every table this phase needs, plus the domain models over
them. Nothing behaves yet.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**: `migrations/m0008_facet_indexes.py` as the migration template;
`m0006_rekordbox_playlists.py` as the shape to mirror and to deliberately diverge from;
`services/migration_runner.py`, unchanged.

**Design**:

- **One migration (`m0009`), not five.** These tables reference each other, and half of them is not
  a state worth being able to be in. The runner is forward-only, so the DDL has to be right rather
  than adjustable.
- **CuePoint metadata is a sibling table**, `track_metadata (track_id INTEGER PRIMARY KEY
  REFERENCES tracks(id) ON DELETE CASCADE, rating INTEGER, favorite INTEGER NOT NULL DEFAULT 0,
  notes TEXT, created_at, updated_at)`. Not columns on `tracks`, for a reason that is structural
  rather than stylistic: `TrackRepository._UPDATE_SQL` writes every column from a `LibraryTrack`,
  and the refresh builds those objects from the XML. A CuePoint rating stored on `tracks` would be
  erased by a code path nobody thought of as destructive. In a sibling table, DEC-057's "a refresh
  can never overwrite a CuePoint value" is enforced by there being no statement that could.
- `rating` is nullable and means 0–5 stars, the same encoding `_rating_to_stars` already produces
  at import (DEC-047 corrected this once; it stays corrected). Null means "no CuePoint rating",
  which is not the same as zero stars.
- **Tags**: `tags (id, name TEXT NOT NULL, category TEXT, colour TEXT, created_at)` with a unique
  index on `name COLLATE NOCASE` — "Peak-time" and "peak-time" are one tag, and finding that out
  after a user has both is not recoverable. `category` is a free label per DEC-015, not a foreign
  key: there is no category table, and the category vocabulary is whatever categories are in use.
- **Tag assignment**: `track_tags (track_id, tag_id, created_at, PRIMARY KEY (track_id, tag_id))`,
  both foreign keys cascading. A track carries a tag once; DEC-058's duplicate rule is about
  Collections, not tags.
- **Collections**: `collections (id, parent_id INTEGER REFERENCES collections(id) ON DELETE
  CASCADE, kind TEXT NOT NULL CHECK (kind IN ('folder','collection','smart')), name TEXT NOT NULL,
  position INTEGER NOT NULL, depth INTEGER NOT NULL, rules_json TEXT, sort_field TEXT, sort_dir
  TEXT, frozen_from_id INTEGER, frozen_at TEXT, created_at, updated_at)`. The `kind` CHECK is worth
  having for m0006's reason — a two- or three-valued discriminator where a typo would sit in the
  database until something quietly failed to find a folder. **No CHECK ties `rules_json` to
  `kind`**: that relationship is enforced in the service, because SQLite cannot drop a CHECK
  without rebuilding a table that holds user data, and unlike `kind`'s vocabulary this relationship
  is not certain to hold for the life of the schema.
- **Membership**: `collection_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id NOT NULL
  REFERENCES collections(id) ON DELETE CASCADE, track_id NOT NULL REFERENCES tracks(id) ON DELETE
  CASCADE, position INTEGER NOT NULL, added_at TEXT NOT NULL)`, with an index on
  `(collection_id, position)` and one on `track_id`. **The index is deliberately not unique.**
  `rekordbox_playlist_tracks` keys on `(playlist_id, position)` because it is rebuilt wholesale on
  every import and never reordered in place; this table is reordered constantly, SQLite has no
  deferred uniqueness, and a two-row swap would violate a unique index halfway through. Contiguity
  is the service's job (ORG-04), and a test asserts it after every mutation.
- **`track_history` gains `batch_id TEXT`** and an index on it, per DEC-063. Existing rows get
  null, which reads correctly as "not part of a batch".
- Every timestamp is ISO-8601 UTC text, as every existing table stores them.
- Domain models beside the existing ones: `models/track_metadata.py`, `models/tag.py`,
  `models/collection.py` (the node, its kind, and a membership entry). Frozen dataclasses with
  `from_row`, matching `LibraryTrack` and `RekordboxPlaylist`.

**Tests**: The migration applies to a database at version 8 with real rows in it and changes none
of them. A fresh database and a migrated one produce identical schema (the existing discovery test
already asserts the pattern — extend it, do not fork it). `kind` rejects a fourth value. Every
cascade fires: deleting a track removes its metadata, its tag assignments and its membership rows;
deleting a folder removes its subtree; deleting a tag removes its assignments and no tracks.
Deleting a Collection removes no tracks — the test that would catch the worst possible bug in this
phase. Models round-trip through `from_row`.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean with the new migration in the
chain; a database created before this step opens, migrates and still browses; no repository or
service reads the new tables yet.

**Risks**: Medium-high, and front-loaded on purpose. This is the only step where a wrong choice is
expensive to undo, because it is forward-only DDL under user data. The two calls most likely to be
questioned later — the sibling table and the non-unique position index — are argued above rather
than assumed.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-06

**Outcome**: Complete. `migrations/m0009_organization.py` creates five tables and adds one column;
`models/track_metadata.py`, `models/tag.py` and `models/collection.py` are the types over them.
Nothing reads or writes any of it yet, which is the step as specified.

**The sibling table was the right call, and the reason got sharper on contact with the code.** The
spec argued it from `TrackRepository._UPDATE_SQL` writing every column. Reading the surrounding
code confirmed something the spec had not: `activity_service.apply_field_change` and
`revert_field_change` both work by `setattr` on a `LibraryTrack` followed by
`TrackRepository.update`, gated on `REVERTABLE_FIELDS`. So columns on `tracks` would have made
CuePoint's own values reachable by *three* code paths that rewrite a track from an import-shaped
object, not one. In a sibling table none of them can reach it, and cross-cutting fact 6 stands as
written: CuePoint fields are deliberately not added to `REVERTABLE_FIELDS`, and ORG-02 gives them
their own write path.

**Four indexes were written, then removed before the step landed.** The first draft indexed
`track_metadata.favorite`, `track_metadata.rating`, `tags.category` and `track_history.batch_id` —
every one of them an index for a query that does not exist yet, which is exactly what LIBUI-01
built, measured and deleted, and exactly what this phase's own ORG-05 spec says not to do. They are
gone. What remains is on columns that *reference another table*, where the justification is
structural rather than speculative: SQLite scans the whole child table on a parent delete unless
the referencing column is indexed, so those five indexes are what make this migration's cascades
affordable. Two tests hold the line — one naming the four that must not come back, one asserting
that every index present is on a referencing column or is the unique constraint on tag names.

**The models are mutable dataclasses, not frozen ones.** The spec said "frozen dataclasses with
`from_row`, matching `LibraryTrack` and `RekordboxPlaylist`" — and those two are not frozen; they
carry `touch()`. The existing convention won over the spec's own sentence, so `TrackMetadata` and
`Collection` have `touch()` and behave like every other persisted entity in the repository.
Corrected here rather than left as two conventions.

**One invariant is enforced in the model in one direction only.** A `smart` node without rules is
refused and a `folder` with rules is refused; a `collection` carrying rules is left legal. That is
the same asymmetry the migration gives for not writing a CHECK — a frozen Collection remembering
the rules it came from is a plausible future, and the model is the layer where that can change
without rebuilding a table full of user data.

**`frozen_from_id` is deliberately not a foreign key.** DEC-061 makes a freeze a copy, not a link:
the frozen Collection has to outlive the Smart Collection it came from, so a cascade — or even a
`SET NULL` — would make the provenance depend on the disappearance it exists to survive. A test
deletes the source and asserts the record stands.

**Guards: 26 of 26 fail when the thing they protect is broken.** Each was mutated in the source,
the suite was run, and the mutation was reverted: four cascades removed, the `kind` CHECK removed,
the membership index made unique, duplicate membership forbidden, tag-name uniqueness removed, its
collation removed, the `track_tags` primary key loosened, the `batch_id` column not added,
`frozen_from_id` made a cascading foreign key, a speculative index reintroduced, a referencing
column's index redirected, ratings clamped instead of refused, a boolean accepted as a rating,
an empty note stored as `""`, the note cap removed, tag names case-folded, empty tag names
accepted, a smart collection without rules accepted, a folder with rules accepted, the depth cap
removed, negative coordinates accepted, unnamed nodes accepted, and the model's `kind` vocabulary
left unvalidated. Every one produced a failure.

**Verification**: `python -m pytest src/tests/unit` — 3427 passed, 45 skipped (104 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped;
`ruff check src/` and `ruff format --check src/` clean; `python scripts/check_no_qt_in_core.py` OK;
`python scripts/check_desktop_version_coupling.py` OK; `PYTHONPATH=src python
scripts/smoke_engine_health.py` OK. `mypy src/` reports the same 1,413 pre-existing errors, 1,032
of which are the unresolved-import noise that already affects every module importing
`cuepoint.models.library_track`; the six lines naming the new files are that same noise and not
type errors. The packaged-sidecar test that enumerates migration modules
(`test_engine_sidecar_imports.py`) covers `m0009` through the existing
`collect_submodules("cuepoint.migrations")`, so nothing in `build/engine-sidecar.spec` changed.

No renderer, Electron or engine-API file was touched, so the desktop-contract and renderer gates
were not run — there is nothing in this step for them to check.

---

## ORG-02 — Rating, Favorite and Notes ✅ IMPLEMENTED 2026-09-06

**Objective**: CuePoint's own per-track values, written, read, resolved against Rekordbox's, and
recorded in history.

**User-visible result**: None yet; the Inspector gains its controls in ORG-10.

**Dependencies**: ORG-01.

**Existing code reused**: `services/activity_service.py::record_field_change` for history;
`persistence/track_query.py` for the browse statement the join goes into; `LibraryTrack` unchanged.

**Design**:

- `TrackMetadataRepository`: `get`, `get_many` (the browse join needs sets, not one at a time),
  `set_rating`, `set_favorite`, `set_notes`, `clear` — upserting a row on first write so an
  untouched track costs no storage.
- `MetadataService` owns validation and history. Rating is 0–5 or `None`; favorite is a boolean;
  notes are capped at a stated length with a message, because an unbounded text field in a
  synchronous write path is a way to find out about SQLite's limits from a user.
- **Clearing is not zeroing.** `set_rating(None)` removes the override and the effective value
  falls back to Rekordbox's. A test asserts the difference survives a round trip, because DEC-034
  and DEC-047 both turn on it.
- **Effective value resolution lives in one function**, `effective_rating(rekordbox, cuepoint)`,
  used by the browse query, the track-detail read and the Inspector's display alike. Two
  implementations of this rule would disagree the day one of them is edited.
- Every write records a `track_history` row: field names `cuepoint_rating`, `favorite`, `notes`,
  source `cuepoint`. `record_field_change` already returns `None` for a no-op change, which is the
  behavior wanted — re-saving the same note is not history.
- **The DEC-057 guard**: a regression test that sets a CuePoint rating, favorite and note on a
  track, runs a full import and a refresh over the same XML, and asserts all three survive
  unchanged, alongside the Rekordbox rating being re-imported. Written so it fails against a
  columns-on-`tracks` implementation.
- ~~`browse` and the track-detail read gain a `LEFT JOIN track_metadata`.~~ **Moved to ORG-08**
  during implementation. `browse` returns `LibraryTrack`, so carrying two more values means either
  changing that return type — rippling through the shipped service, API and about thirty
  assertions in Phase 4's tests — or returning data nothing reads. Both are the mistake LIBUI-01
  paid for with six speculative indexes. The join's real consumers are ORG-08's serializer and
  ORG-05's predicate (`COALESCE` for the effective rating), and it lands with the first of them.
  `get_many` is what this step provides instead: one query per window, not per row, which is the
  property the bullet was protecting.

**Tests**: Validation refusals for each field, each naming the field. Clear-versus-zero. History
written on change and not on a no-op. The import/refresh guard above. The join returns nulls, not
missing rows, for a track with no metadata. Effective-value resolution over the four combinations
(neither, one, the other, both).

**Acceptance criteria / DoD**: A rating survives an import, a refresh and a restart; a window's
worth of metadata reads at no measurable cost at 50,000 tracks; nothing writes `tracks.rating` or
`tracks.comment`. (The browse projection itself is ORG-08's, per the corrected bullet above.)

**Risks**: Low-medium. The one real risk is the join's cost in the hot browse path, which is
measured rather than assumed.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-06

**Outcome**: Complete. `persistence/track_metadata_repository.py` stores the layer,
`services/metadata_service.py` validates it and records every change, and
`models/track_metadata.py` gained the one function that resolves DEC-057's two ratings. Both are
registered in the DI container, so ORG-08 resolves an interface rather than constructing anything.
Nothing in the UI can reach it yet, which is the step as specified.

**The browse join moved to ORG-08, and the spec above is corrected rather than quietly skipped.**
`TrackRepository.browse` returns `LibraryTrack`; carrying two more values means either changing
that return type — through the shipped service, the API and about thirty assertions in Phase 4's
tests — or projecting columns nothing reads. That is the same mistake LIBUI-01 paid for with six
speculative indexes and that ORG-01 corrected four more of. The join's real consumers are ORG-08's
serializer and ORG-05's predicate, and it is one join for both. `get_many` is what this step
provides instead, and it holds the property the bullet was actually protecting: one query per
window, never one per row. Measured at 50,000 tracks with 25,000 of them rated: **0.22 ms** for a
100-row window's metadata against **1.18 ms** for the browse itself, so ORG-08 chooses between the
join and the second query with both numbers rather than an assumption.

**A measurement ORG-07 should not have to rediscover.** Writing ratings through the ordinary
per-write path costs **1.95 ms per track**, because each write is its own transaction and each
transaction is a commit. The same writes inside one transaction cost **0.014 ms** — **144×** — which
is a hundred seconds against under a second for a 47,913-track batch. No bulk method is needed to
get it: the repository's writes already join an outer transaction, so DEC-063's chunked
transactions are the whole mechanism. Recorded in ORG-07's design.

**`batch_id` was threaded through the history writer here rather than in ORG-07.** ORG-01 added the
column; `TrackFieldChange`, `ActivityRepository.add_field_change` and
`ActivityService.record_field_change` now carry it as an optional argument defaulting to `None`,
and `MetadataService` passes it. Additive, tested both ways, and it means ORG-07 supplies ids
rather than re-plumbing three layers that were already being edited.

**The mutation run found three real gaps, and each closed with a test rather than a shrug.**

- *`rating_source` was written and never tested.* Reporting the wrong layer left every test
  passing. It now has its own tests, including one asserting the label always agrees with the value
  — the two are read together by the Inspector, and a disagreement is what a user would see.
- *The chunking test proved nothing.* It passed 2,000 ids and asserted the answer, but this SQLite
  build accepts far more parameters than that, so an unchunked query passed too. It now counts the
  statements through `set_trace_callback`, which is build-independent, plus a second test that a
  chunked read loses nothing on a boundary.
- *The service's own validation looked redundant* — removing it left everything green, because the
  repository validates too. It is not redundant, and the missing test said why: the service writes
  the history entry, and it must record **the value that was stored**, not the value that was typed.
  `set_rating(id, "4")` now has to record the integer 4, and `"  late  "` has to record `late` —
  otherwise a re-save of the same note would look like a change, and a later revert would restore a
  string into an integer column.

**Guards: 17 of 17 fail when the thing they protect is broken.** The one worth naming is the last:
*the design DEC-057 rejected, simulated*. Making the bulk import delete `track_metadata` rows —
which is exactly what a columns-on-`tracks` layout does implicitly when it rebuilds a row from the
XML — makes the guard test fail. The others: a falsy-zero in the effective-rating rule, Rekordbox
winning over the user, the source reported backwards, an upsert that replaces the whole row,
clearing a rating deleting the record, validation after the write, unchunked reads, `get_many`
inventing empty records, history not written, history written without the previous value, a
dropped batch id, a silent clear, a no-op recorded as history, history field names colliding with
Rekordbox's, a missing track not refused by name, and the service skipping validation.

**Verification**: `python -m pytest src/tests/unit` — 3509 passed, 45 skipped (83 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped;
`ruff check src/` and `ruff format --check src/` clean; `python scripts/check_no_qt_in_core.py` OK.
The DEC-057 guard runs the real import and the real refresh over real XML, using the fixtures
Phase 3's refresh tests already build from, rather than mocking a repository and asserting it was
not called.

No renderer, Electron or engine-API file was touched, so the desktop-contract and renderer gates
were not run — nothing in this step reaches them. The measurements above are ad-hoc rather than
part of `scripts/bench_library.py`; ORG-13 owns the recorded scale numbers.

---

## ORG-03 — Tags ✅ IMPLEMENTED 2026-09-06

**Objective**: A tag vocabulary a user can build, correct, and apply to tracks.

**User-visible result**: None yet; tag chips arrive in ORG-10 and the manager in ORG-12.

**Dependencies**: ORG-01.

**Existing code reused**: `activity_service` for history; the design-system colour tokens in
`tokens/tokens.css` as the colour vocabulary.

**Design**:

- `TagRepository` and `TagService`: `create`, `rename`, `set_category`, `set_colour`, `delete`,
  `merge`, `list_all` (with a usage count per tag, which every UI over this needs), `assign`,
  `unassign`, `tags_for_track`, `tags_for_tracks`.
- **Names are unique case-insensitively**, and creation of an existing name returns the existing
  tag rather than failing — "tag as you type" is the primary way tags get made, and a modal error
  for retyping a tag you already have is a worse answer than just using it.
- **Merge exists in v1.** Two tags that should have been one is the single most likely thing a user
  will need undone, and merge is a `UPDATE OR IGNORE` plus a delete. Without it the answer is
  "retag 300 tracks by hand".
- **Colours come from the theme's token set**, not a free picker. A hex value chosen against the
  dark theme is illegible in three of the other four (`PIXEL_DESIGN_SYSTEM.md` §2), and a tag
  colour is chrome, not content.
- `category` is set and cleared as a plain string; the service exposes `categories_in_use` so the
  UI can group and offer existing ones. There is no category CRUD, per DEC-015.
- **Assignment is set-shaped, not per-track-shaped**: `assign(track_ids, tag_id)` and
  `unassign(track_ids, tag_id)` in one transaction, so ORG-07's batch path and ORG-10's single-track
  path are the same code with different arguments.
- History: assigning writes a `track_history` row with field `tag`, old value null, new value the
  tag name; unassigning writes the inverse. The History tab then reads "added Peak-time" rather
  than "tags changed", which is the difference between a log and a record.
- Deleting a tag reports how many tracks it is on, before it happens. Deleting removes assignments
  and no tracks; renaming leaves assignments alone.

**Tests**: Case-insensitive uniqueness, including creating "peak-time" when "Peak-time" exists.
Merge moves every assignment, keeps no duplicates, and deletes exactly one tag. Assign and unassign
are idempotent over a set already in that state. Usage counts match the assignments. History rows
name the tag. Deleting a tag deletes no tracks. A colour outside the token set is refused.

**Acceptance criteria / DoD**: 40 tags over 200,000 assignments list with counts within budget; the
same service call serves one track and 12,000; nothing about a tag is stored in a file.

**Risks**: Low. The named risk is the temptation to model categories as entities, which DEC-015
already refused.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-06

**Outcome**: Complete. `persistence/tag_repository.py` owns the vocabulary and its assignments,
`services/tag_service.py` decides what counts as a change to a track and records it, and
`models/tag.py` gained the colour vocabulary ORG-01 deferred to this step plus `TagUsage`. Both are
in the DI container. Nothing in the UI can reach any of it yet.

**A blocker, found by trying to do what the spec said.** The step calls for assignment "in one
transaction", and every assignment writes history — but `ActivityRepository.add_field_change` used
`transaction()` without `join_existing`, so a history write *inside* anyone's transaction raised
`DB_NESTED_TRANSACTION`. Tagging twelve thousand tracks atomically was therefore impossible, and so
were DEC-063's batches. Both `add_field_change` and `add_event` now join an open transaction, which
is the correct relationship anyway: a history entry written in its own transaction commits even
when the write it describes is rolled back, leaving a log that claims something happened to a track
that nothing happened to. Where no transaction is open — every caller before Phase 6, including the
import's deliberately-after-the-commit event — the behaviour is unchanged.

**That gap existed in ORG-02 too, and is closed here rather than left inconsistent.**
`MetadataService` wrote the value and then recorded it, in two transactions; a failure between them
left a rating with nothing in the history saying who set it. It now opens one transaction per
write, like `TagService`. Three tests were added there for it, including one asserting a failed
clear leaves the note intact and the history unchanged.

**The persistence-boundary guard caught the consequence, which is what it is for.** Both services
take `IDatabaseService`, so `test_persistence_boundary.py` failed until they were listed with a
justification — the same one `library_import_service` carries: they run no SQL, they hold the
transaction boundary. Adding to that list is meant to require an argument, and this is the
argument.

**The tag listing was measured and rewritten before it landed.** `LEFT JOIN track_tags ... GROUP BY
tags.id` reads correctly and costs **35 ms** over 40 tags and 200,000 assignments: SQLite scans the
tags, searches the index once per tag, then sorts in a temporary B-tree. Grouping the counts in a
subquery first lets it scan `idx_track_tags_tag` as a covering index once and read the tags in name
order through `idx_tags_name` — **15 ms** for the identical answer. A query-plan test pins the
shape, because nothing but the clock would notice a rewrite.

**Colours are theme tokens, not colours.** `TAG_COLOURS` is five accent-token names the renderer
resolves to `var(--accent-*)`, so a tag stays legible when the theme changes underneath it.
`--accent-secondary` is deliberately excluded: in `clubNeon` it is `#1a1a28`, a near-black panel
fill, and a tag wearing it would be invisible in exactly the theme most likely to be running.

**What counts as a change to a track, decided explicitly.** Renaming or recolouring a tag changes a
*word* and writes no track history — a History tab listing an entry on three hundred tracks after a
typo fix would bury the entries that matter. Putting a tag on a track, taking one off, deleting a
tag, and merging two all change *tracks*, and each writes one entry per track that actually
changed, naming the tag. The name is recorded rather than the id, because an entry has to stay
readable after the tag it names is gone — asserted by a test that deletes the tag and reads the
history back.

**Two smaller things.** `unassign` originally rebuilt its "which tracks have this" set inside a list
comprehension, which is one query per track — one statement instead of forty thousand, fixed before
the first test run. And `id_chunks.py` now holds the chunking helpers ORG-02 had privately, since
ORG-03 needed the same three lines.

**Measured at the acceptance scale** — 50,000 tracks, 40 tags, 199,940 assignments (with 199,940
history rows, written in 9.4 s): the tag list with counts is **15 ms**, a 100-row window's tags
**1.3 ms**, one track's tags **0.012 ms**. Assigning to 12,000 tracks is **0.29 s**, unassigning
**0.31 s**, and merging two 5,000-track tags **0.53 s** — one service call, the same one that
serves a single track.

**Guards: 25 of 25 fail when the thing they protect is broken**, first pass. Any colour string
accepted; a panel fill in the palette; case-sensitive name lookup; names case-folded on the way in;
unused tags dropped from the listing; the listing reverted to join-then-group; case-sensitive
ordering; a count query per tag; `assign` and `unassign` reporting everything they were asked about
rather than what changed; duplicate ids assigned twice; unchunked reads; `UPDATE OR REPLACE` in the
merge (which duplicates a tag on tracks that had both); the source tag left behind by a merge;
merging a tag into itself; tagging not recorded; the id recorded instead of the name; an addition
indistinguishable from a removal; a rename writing track history; a delete saying nothing to the
tracks that had it; a merge recording nothing; a dropped batch id; a rename colliding silently;
history demanding its own transaction again; and a metadata write splitting from its record.

**Verification**: `python -m pytest src/tests/unit` — 3608 passed, 45 skipped (98 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped;
`ruff check src/` and `ruff format --check src/` clean; `python scripts/check_no_qt_in_core.py` OK.

No renderer, Electron or engine-API file was touched, so the desktop-contract and renderer gates
were not run. The measurements above are ad-hoc; ORG-13 owns the recorded scale numbers, and the
`var(--accent-*)` mapping is ORG-12's when the tag manager is built.

---

## ORG-04 — Collections, the Folder Tree, and the Reference Answer ✅ IMPLEMENTED 2026-09-06

**Objective**: The organizational primitive itself — a tree of folders and Collections, ordered
membership that allows repeats, and the DEC-011 question finally answering something.

**User-visible result**: None yet; the pane arrives in ORG-09.

**Dependencies**: ORG-01.

**Existing code reused**: `persistence/playlist_repository.py` as the reference for tree queries
(its `playlist_ids_for_track` is the shape `references_for` wants); `models/references.py` and
`services/library_service.py::references_for`, whose signature and callers do not change.

**Design**:

- `CollectionRepository` and `CollectionService`. Tree operations: `create_folder`,
  `create_collection`, `rename`, `move` (reparent and position), `reorder` (among siblings),
  `delete` (subtree), `tree` (the whole thing in one query, as the playlist pane already reads it).
- **Only a folder may be a parent**, and a node may not be moved into its own subtree. The
  self-parenting and cycle cases are the classic bugs here; both are refused in the service with a
  message, and both have a test that tries.
- `depth` is stored and maintained on move, mirroring `rekordbox_playlists`, so the pane can render
  indentation without walking parents. A depth cap is enforced with a stated number.
- Membership: `add(collection_id, track_ids)` appends in the given order; `insert_at`;
  `remove_entries(entry_ids)`; `reorder(entry_id, new_position)`; `entries(collection_id, offset,
  limit)`.
- **`add` skips tracks already in the Collection and reports how many it skipped** (DEC-058). A
  deliberate duplicate is made by `insert_at`, which is what the drop gesture and "add anyway" call.
  Bulk-add is the gesture most likely to create duplicates by accident and the one where a user can
  least easily see it happen.
- **Positions are contiguous, and the service owns that.** Every mutation renumbers within one
  transaction; a test asserts no gaps and no repeats after add, insert, remove and reorder,
  including a reorder that moves the first entry to last.
- Counts: a Collection reports `entry_count` and `track_count` (distinct). Where they differ the UI
  shows both (DEC-058) — a "412 tracks" label that means 412 entries is a small lie that costs
  trust.
- **`references_for` gets its real body** (DEC-011): the Collections holding at least one of the
  given track ids, counted once each, and the distinct referenced track ids. Sets stay zero until
  Phase 10, and the return type, signature and every existing caller are untouched — which was the
  point of building the seam in LIBRARY-08.
- Deleting a folder deletes its subtree. The service returns what *would* go — folders,
  Collections, Smart Collections and entry counts — so ORG-09's confirmation names it rather than
  asking an abstract question.

**Tests**: Cycle and self-parent refusals. Reparenting maintains depth for a whole subtree. Sibling
order after every mutation. Duplicate membership: `add` skips and reports, `insert_at` creates one,
and removing one entry leaves the other. Contiguity after each mutation. `references_for` counts
Collections once each regardless of how many of the doomed tracks they hold, and counts distinct
tracks not entries. Deleting a Collection deletes no tracks, and deleting a track removes its
entries (cascade, already asserted in ORG-01, re-asserted here through the service).
`test_reference_check_seam.py` continues to pass unchanged.

**Acceptance criteria / DoD**: 200 Collections in a tree eight deep load in one query within
budget; a 5,000-entry Collection reorders without a full rewrite being visible to the user; the
refresh preview shows a non-zero reference warning for the first time in the project's history.

**Risks**: Medium-high. Tree mutation and position maintenance are where the bugs live, and both
are user data. The mitigation is that every mutation is one transaction with a contiguity assertion
behind it.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-06

**Outcome**: Complete. `persistence/collection_repository.py` owns the tree and its membership,
`services/collection_service.py` owns what a legal tree is, `models/collection.py` gained
`AddResult` and `SubtreeSummary`, and `LibraryService.references_for` has its real body. Both are
in the DI container. The pane that will show any of it is ORG-09.

**DEC-011's warning answers something for the first time in the project's history.** A track filed
in a Collection now makes the refresh preview say so, applying it without confirmation is refused,
and confirming deletes the track and its entry while the Collection itself survives. Tested end to
end through the real import and the real refresh, not through the seam alone. LIBRARY-08's bet paid
off exactly as written: one method body changed, and no caller moved.

**`references_for` needed the collection repository, and it is a required argument.** An optional
one with a `None` default would let a mis-wired service answer "nothing references these" and wave
a deletion through — a silent zero where the whole point is a warning. A missing argument is a loud
failure at construction, so four construction sites were updated rather than one default added.

**A bug found by reading the code before running it.** The first `move` parked a node by setting
its `parent_id` to `NULL`, which put it in the top-level sibling list while the top-level list was
being renumbered — a same-parent move to position 0 left a gap at 1. Parking it at a position past
the end of any real list instead is correct for both cases. The mutation run then showed the
same-parent branch was no longer needed *for contiguity*, so its docstring now says what it does
decide: a position-less move to the parent a node already has leaves it where it is, rather than
appending it to the end of its own siblings.

**Reordering is arithmetic, and that is ORG-01's decision paying off.** Moving an entry shifts only
the rows between its old and new position — two `UPDATE`s, whatever the size of the Collection —
which is possible only because ORG-01 declined a unique index on `(collection_id, position)`: two
rows briefly share a position mid-shift. Measured on a 5,000-entry Collection: **0.20 ms** to move
the first entry to last, and the same back. A renumbering loop would have been 5,000 statements.
Removal is the one case that cannot be arithmetic — several holes open at once — so it renumbers
with one windowed `UPDATE` rather than a Python loop.

**What a cascade leaves behind is documented rather than papered over.** A refresh deletes tracks
in SQL, and `m0009`'s cascade removes their entries with no Python involved and therefore no
renumbering: a Collection can be left holding entries at 0 and 2. That is harmless — order is read
with `ORDER BY position` — and the next mutation closes it. Four tests pin exactly that, because
the alternative is teaching the refresh about Collections for no gain.

**The mutation run found five gaps: three missing tests and two pieces of code that could not
fail.**

- *One Collection holding several doomed tracks* was never tested, so counting a Collection once
  per track it held passed everything. That is the arithmetic DEC-011's sentence depends on.
- *A summary naming tracks it was only asked about* passed too, because every test removed exactly
  the tracks that were filed. Now two are removed and one is filed.
- *The depth cap on create was checked twice* — in the service and in `Collection` itself. Deleting
  the service's copy changed nothing, so it went; the model is the one place that carries the rule.
- *`references_for` had two unreachable guards*: an early return for an empty request, and a
  "found nothing" shortcut. Both were deleted with every test still passing, because the repository
  already answers an empty ask without a query and an all-zero summary already equals
  `NO_REFERENCES`. A guard that cannot fail is not a guard, it is a second place to be wrong.
- *The `list()` that consumes a caller's generator* was only proven by the repository's habit of
  consuming it downstream. It now has a test that hands the service a repository reading nothing,
  which is the service's own contract rather than a collaborator's.

**Measured at the acceptance scale** — 50,000 tracks, 200 nodes in a tree eight deep, a 5,000-entry
Collection: the whole tree in **one query, 1.24 ms**; a folder's children **0.16 ms**; a subtree
summary **0.64 ms**; a 100-entry window **0.31 ms**; entry and distinct-track counts together
**0.71 ms**; `references_for` over 1,000 doomed tracks **1.47 ms** (**0.32 ms** when none are
filed); and deleting a 200-node subtree **11 ms**, with all 50,000 tracks still present afterwards.

**Guards: 26 of 26 fail when the thing they protect is broken.** Contiguity, in eight ways: a
same-parent move through the reparenting path, an old parent not closed up, a new parent making no
room, a deleted sibling leaving a hole, removed entries leaving holes, an insert not making room,
and both reorders shifting the wrong way. Depth: a child not inheriting its parent's, a moved
subtree keeping its old depths, and the cap unenforced. Duplicates: `add` not skipping, `add` not
reporting what it skipped, `insert_at` refusing a deliberate duplicate, and a distinct count
counting entries. The tree rules: anything as a parent, a node into its own subtree, a node into
itself, the depth check against the node rather than the subtree, a smart collection handed rows,
and a delete preview reporting the wrong thing. And the DEC-011 answer: back to zero, a Collection
counted once per track, tracks reported that were only asked about, the collection count counting
the wrong list, and an unconsumed generator.

**Verification**: `python -m pytest src/tests/unit` — 3717 passed, 45 skipped (109 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped;
`ruff check src/` and `ruff format --check src/` clean; `python scripts/check_no_qt_in_core.py`,
`check_desktop_version_coupling.py` and the engine health smoke all OK. Three failures in
`test_code_quality_step_5_7.py` are unrelated to this step: they assert `.pre-commit-config.yaml`
mentions black, isort and flake8, and that file was rewritten to use ruff outside this work.

No renderer, Electron or engine-API file was touched. The measurements are ad-hoc; ORG-13 owns the
recorded scale numbers.

---

## ORG-05 — Rules Reach CuePoint's Own Data ✅ IMPLEMENTED 2026-09-07

**Objective**: Extend DEC-043's one rule model to tags, ratings, favorites, notes and Collection
membership — which means the compiler's first joins.

**User-visible result**: None yet; the filter bar offers them in ORG-12.

**Dependencies**: ORG-02, ORG-03, ORG-04.

**Existing code reused**: `models/filter_rule.py` and `persistence/filter_sql.py` — extended, not
replaced. Their three existing properties (registry-supplied column names, always-bound values,
escaped `LIKE` wildcards) hold unchanged for everything added here.

**Design**:

- New field types beside text/number/date: **bool** (operators: `is`), **tag** (`has_tag`,
  `not_has_tag`, `any_of`, `is_empty` meaning untagged), **collection** (`in_collection`,
  `not_in_collection`, value is a Collection id).
- New fields: `favorite` (bool), `cuepoint_rating` (number), `notes` (text), `tag` (tag),
  `collection` (collection), and **`rating` becomes the effective value** — `COALESCE(m.rating,
  t.rating)` — with `rating_rekordbox` addressing the imported column explicitly. DEC-057 says the
  UI's plain "Rating" means the effective value; this is where that is true rather than asserted.
- **The `LEFT JOIN track_metadata` arrives here or in ORG-08, whichever lands first**, and is
  written once for both: the effective rating is `COALESCE(m.rating, t.rating)` in the predicate,
  which is the same join ORG-08's projection needs. ORG-02 deliberately did not add it early.
- **`FieldSpec` gains a way to say how a field is addressed**: a column expression or a subquery
  template. The compiler stays one function with one place that turns a rule into SQL; what changes
  is that a field can name an `EXISTS (SELECT 1 FROM track_tags …)` instead of a column. This is
  the single largest change in the step and the reason the step exists on its own.
- **A rule may not name a Smart Collection** (DEC-060). `in_collection` resolves the id and refuses
  a `kind='smart'` row with a message naming the clause. No recursion, no cycles, no unbounded
  evaluation, and a Smart Collection whose membership depends on facts about tracks rather than on
  another query's current answer.
- A rule naming a deleted Collection or tag is a **broken rule**: the compiler refuses it with a
  message, which ORG-06 turns into a state on the Smart Collection rather than a silent empty
  result.
- **Facets** extend to tags (which tags exist in this view and how many tracks each has) and
  favorite (two buckets). The existing rule that a facet excludes its own field's active rules
  applies unchanged — otherwise choosing one tag empties the tag list.
- **Measure before indexing.** LIBUI-02 built six speculative indexes, measured them, and removed
  them. The same discipline applies to `track_tags` and `collection_tracks`: measure the `EXISTS`
  at 50,000 tracks with 200,000 assignments first, then add only indexes that earn their write cost.

**Tests**: Every new operator returns exactly the rows it claims over a fixture with untagged
tracks, multiply-tagged tracks, duplicate Collection entries (a track in a Collection twice matches
`in_collection` once, and is counted once), and tracks with a CuePoint rating, a Rekordbox rating,
both, and neither. `rating` matches the effective value in all four cases. A rule naming a Smart
Collection is refused with the clause named. A rule naming a deleted Collection is refused. A value
containing SQL stays a value. Tag facet counts equal the count of applying that tag as a rule. An
empty rule set still changes nothing.

**Acceptance criteria / DoD**: Membership and tag rules compose with scope, text query and every
existing filter in one predicate used by both `browse` and `browse_count`; the vocabulary endpoint
describes the new fields well enough that ORG-12 needs no hard-coded knowledge of them; measured
timings recorded.

**Risks**: High, and the highest in the phase. This module is shared with the Library filter bar
that already works; a regression here breaks a shipped feature. The mitigation is that every
existing test in `filter_sql`'s suite must pass untouched, and that the subquery shape is one
tested place rather than a per-field string.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-07

**Outcome**: Complete. `models/filter_rule.py` gained three field types, four operators and six
fields; `persistence/filter_sql.py` gained the membership shape; `persistence/rule_references.py`
is new and answers the two questions that need a database; `track_query.py` writes the metadata
join and the tag facet. The filter bar does not offer any of it — ORG-12 does, and the bar has a
test saying so.

**DEC-057 is true rather than asserted.** `rating` is `COALESCE(meta.rating, tracks.rating)` in the
registry, so a filter for "rated 5" finds a track rated 5 in CuePoint over a 3 imported from
Rekordbox and stops finding one rated 5 in Rekordbox and 3 here. Both layers keep names of their
own — `rating_rekordbox` and `cuepoint_rating` — for the person who wants exactly one of them. A
rating of zero is still a rating through the coalesce (DEC-034), and "unrated" now means neither
layer has a value.

**`FieldSpec` says where a field lives, in one of two ways.** A column field names an expression:
`tracks.genre`, `meta.notes`, the coalesce above, or — for `rating_rekordbox` — a column whose name
is not the field's. A membership field names a link table instead, and there is exactly one
subquery shape for both tags and Collections. That split is the whole step: `compile_rule` is still
one function with one place that turns a rule into SQL.

**A tag and a Collection are named by id, never by name.** ORG-12's tag manager renames tags, and a
rule that stopped matching because someone corrected a spelling would be a saved question that
quietly changed meaning. A test renames a tag and asserts the rule still matches. The price of an
id is that it can name a row that is gone, which is what `rule_references.py` exists for.

**The set shape beat the correlated one, which was not the guess.** `EXISTS (… WHERE track_id =
tracks.id …)` probes the link table once per track in the library; `tracks.id IN (SELECT track_id
…)` reads one run of an index and tests a set. Measured over 50,000 tracks and 200,000 assignments:
"has this tag" 18.1 ms against **8.4 ms**, "any of five tags" 51.5 ms against **23.8 ms**, "in this
Collection" 11.1 ms against **1.4 ms**. It is also the shape the playlist scope already uses, and
for the same reason: a track filed in a Collection twice matches once, because a set has no
duplicates. `NOT IN` is safe only because both link tables declare their track column `NOT NULL`,
so a schema test asserts that — no behavioural test can catch a null the schema cannot hold.

**One index changed and none was added.** Migration 0009 built `idx_track_tags_tag (tag_id)` to
answer "how many tracks carry each tag". ORG-05 asks *which* tracks, which is the same index plus
one column. Migration 0010 **replaces** it with `(tag_id, track_id)`: the table keeps the number of
indexes it had, writing 12,000 assignments measured the same either way, and every tag rule got two
to three times faster. `collection_tracks` needed nothing — `idx_collection_tracks_collection`,
built for ORG-04's ordering, already answers the membership question in 1.3 ms.

**The join is written only when something asks for it.** `track_metadata` joins on its primary key,
so it is one probe per row — and one probe per row over fifty thousand rows is fifty thousand
probes that every browse the Library page has run since Phase 4 would start paying for nothing. A
filter bar with no CuePoint clause in it produces the SQL it produced before this step, and a test
asserts the string.

**The rating facet got slower, and that is the price of DEC-057.** Its group key now spans two
tables, and no index can serve that — an index is per table, and an expression index cannot reach a
joined one. Measured: **20.2 ms** against 3.7 ms for the imported column alone. It still reads the
rating index rather than the table, so it is a scan of five bytes per track rather than of a track,
and it buys a facet whose counts match the rows a rule with the same value returns — which the fast
plan would not. `test_facet_indexes.py` now pins both plans, with the numbers.

**The tag facet counts before it joins**, which is ORG-03's measurement applied again: joining
`tags` first makes the grouping walk 200,000 rows through a table it does not need until the end.
96.1 ms joined first, **14.6 ms** grouped first; with a filter narrowing it, 17.9 ms against
15.3 ms — the shape that wins by seven times in the common case never loses. Its values are tag
ids with names beside them as labels, so a chip built from the facet matches exactly the tracks the
facet counted and goes on matching them after a rename.

**Two refusals, and the difference between them is deliberate.** A rule naming a deleted tag or
Collection raises `BrokenRuleError` — a subclass, so ORG-06 can show it as a repairable state on a
Smart Collection while every handler that already maps a `FilterRuleError` keeps working untouched.
A rule naming a **Smart Collection** raises a plain `FilterRuleError` (DEC-060): it is not stale, it
is not a rule, and deleting nothing would fix it. Both messages name the clause, because a user can
have six filters on screen. The checks run in `TrackRepository._checked`, which all six reads go
through — a check one entry point skips is a check that does not exist, and six mutations prove
each one calls it.

**The bar does not offer what it cannot build.** The vocabulary endpoint describes tag, Collection
and favorite — it has to, or ORG-12 would hard-code them and DEC-043 would be a slogan. But a "Tag"
row with a free-text box would ask a user to type a database id and refuse every tag name they
typed, so `filterText.buildableFields` keeps the bar to the three types it has controls for, and a
`FilterBar` test fails if the filter is removed. ORG-12 deletes that filter when it adds the chips.

**Guards: 52 of 52 fail when the thing they protect is broken.** The effective rating, five ways:
reverted to the imported column, reduced to the CuePoint one, coalesced backwards, and either layer
losing its own name. The join, five ways: never written, always written, `requires_metadata` mute,
a facet unable to ask for it, and made inner so untouched tracks vanish. Favorite: unknown rather
than false without a row, "no" spelled yes, anything at all a yes, and the comparison collated.
Membership, eight ways: negation inverted, untagged meaning tagged, `any_of` reading one id, the
link table's columns swapped, a tag rule reading the Collection table, the predicate compiled as a
join so a duplicate entry duplicates a track, and an id allowed to be zero or fractional. What a
rule may name, seven ways: a deleted tag, a deleted Collection, a Smart Collection, a broken rule
that is not a `FilterRuleError`, only the first id of a list, membership never checked, and ids past
the first chunk never looked up. Each of the six reads skipping the check. And the facets, ten ways:
grouped by track, ignoring the rest of the view, honouring its own field's rules, the untagged
bucket dropped, assignments counted as tags, a value losing its name or carrying the name instead of
the id, a facet grouping the column the field is named after, a bool faceted as text, and a
membership field faceted as a column. The scope, two ways: a playlist scope that stops applying
once a rule is present, and a scoped tag facet computed over the whole library. The boundary,
three ways: a broken rule reaching the client as a crash rather than a message, every facet value
carrying a label including the ones that are their own, and the new fields no longer described to
the renderer. Plus one that ORG-05 must not have broken: the `LIKE` escape.

Four of those started as survivors. `any_of` truncated to its first id passed, because the fixture's
first tag happened to cover the whole union — the list is now ordered narrowest-first, so a
one-element read answers one track. The tag facet honouring its own rules passed against "more than
one choice survives", which a facet that narrowed to one track's three tags also satisfies; it is
now an equality against the unfiltered facet. And two branches turned out to change no behaviour at
all: a collation on a yes/no comparison, and the text spelling of "has a value" against an integer.
Both were kept and pinned with tests on the SQL text rather than deleted — `COALESCE(…) <> ''` is
an integer against text that SQLite answers correctly by its type ordering, which is right by
coincidence rather than by intent, and a collation on an integer claims a rule the SQL does not
have.

**Two gaps closed after the first commit, both found by reading the DoD back rather than by a
failing test.** The DoD says these rules must compose "with scope", and nothing put a membership
rule inside a playlist — the query with the most moving parts, where a recursive CTE, a playlist
membership test, the metadata join and a link-table test are assembled into one statement, with an
ordering that is itself a subquery over the scope. Ten tests now drive that, including the
`playlist_position` sort with a tag rule in the predicate and a tag facet counted inside a
playlist. And the DoD's vocabulary clause is about a boundary that three shipped endpoints cross:
`/library/filter-fields`, `/library/search` and `/library/facets` all answer differently now, and
none of it was tested over HTTP.

**The refusal was the reason to go back.** `BrokenRuleError` reaches a handler that catches
`FilterRuleError`, and it is caught — but only because of today's class statement. A filter a user
can build must never return a 500 where a message naming the clause belongs, and "a subclass, so it
is fine" is exactly the reasoning that stops being true during a later refactor. Thirty-four tests
now drive the real engine over real HTTP: a deleted tag is a 400 naming the clause, a Smart
Collection is a 400 naming the Collection, a tag chip built from a facet response matches the count
that facet reported, and a facet value for a field that is its own label carries no `label` key at
all, so an existing consumer sees the object it has always seen.

**Measured at the acceptance scale** — 50,000 tracks, 200,000 assignments over 20 tags, a
5,000-track Collection, 10,000 CuePoint metadata rows. Counts, which are the unpaged half and
therefore the slow one: "has this tag" **8.4 ms**, "not this tag" 11.9 ms, "any of five" 23.8 ms,
untagged 11.5 ms, "in this Collection" **1.3 ms**, not in it 10.5 ms, favorite 6.7 ms, effective
rating ≥ 4 **9.9 ms**, notes containing a word 7.8 ms, and a tag *and* a Collection *and* a genre
together 7.8 ms. Windows are all under 30 ms and mostly under 3. Facets: tags **14.6 ms** (totals
42.1 ms), favorite 16.3 ms, effective rating 20.2 ms. The unfiltered browse is unchanged at
0.36 ms, with no join in its SQL.

**Verification**: `python -m pytest src/tests/unit` — 3962 passed, 45 skipped (245 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped; `npm test`
in the renderer — 1265 passed; `npm run typecheck` and `npm run lint` clean; `ruff check src/` and
`ruff format --check src/` clean; `check_no_qt_in_core.py`, `check_desktop_version_coupling.py` and
the engine health smoke all OK. Three failures in `test_code_quality_step_5_7.py` are unrelated to
this step: they assert `.pre-commit-config.yaml` mentions black, isort and flake8, and that file was
rewritten to use ruff outside this work.

No Electron main, preload or engine-API file was touched; the vocabulary endpoint describes the new
fields because `describe_fields()` reads the registry, not because anything was added to it — which
is why ORG-08 has an API to build rather than one to correct. The measurements are ad-hoc; ORG-13
owns the recorded scale numbers.

---

## ORG-06 — Smart Collections ✅ IMPLEMENTED 2026-09-07

**Objective**: Save the rule set, evaluate it live, duplicate it, freeze it (DEC-061).

**User-visible result**: None yet; saving from the filter bar is ORG-12.

**Dependencies**: ORG-04, ORG-05.

**Existing code reused**: `collections` rows and `CollectionService` from ORG-04; the browse path
from LIBUI-01 unchanged — a Smart Collection scope resolves to rules and then runs the query that
already exists.

**Design**:

- A Smart Collection is a `collections` row with `kind='smart'`, `rules_json`, and an optional
  saved sort. **There is no membership table for it**, nothing to materialize and nothing to
  invalidate (DEC-061).
- `save(name, parent_id, rules, sort)`, `update_rules`, `rename`, `duplicate`, `delete`,
  `resolve(id)` → the rule set and sort a browse call needs.
- **Duplicate** copies rules and settings under a new name and links nothing. **Freeze** creates a
  `kind='collection'` sibling holding the current membership in the current sort order, sets
  `frozen_from_id` and `frozen_at`, and records an activity event. It is a copy: nothing keeps the
  two in step afterwards, and ORG-12's UI says so at the moment of freezing rather than in a
  tooltip later.
- Freeze over a large result set goes through ORG-07's job path rather than blocking — freezing a
  40,000-track rule is a bulk write like any other.
- **Membership mutation on a Smart Collection is refused** at the service, not just absent from the
  UI: no manual add, no manual remove, no reorder. A rule set with hand-pinned exceptions stops
  being explainable, which is the whole reason DEC-061 chose live evaluation.
- **Broken rules are reported, not swallowed.** A Smart Collection whose rules name a deleted
  Collection or tag reads as broken with the offending clause, and ORG-09 shows that state in the
  tree. Silently matching nothing is the failure mode this avoids.
- Deleting a Collection that a Smart Collection's rules reference does not delete the Smart
  Collection; it breaks it, visibly.

**Tests**: A saved rule set round-trips through storage and produces exactly the tracks the same
rules produce unsaved (the DEC-043 promise, asserted end to end). Duplication produces an
independent copy — editing one leaves the other alone. Freeze produces a Collection with the same
tracks in the same order, and a later library change moves the Smart Collection's membership and
not the frozen one. Membership mutation on a smart row raises. A Smart Collection referencing a
deleted Collection reports broken and names the clause. Deleting a Smart Collection deletes no
tracks and no Collections.

**Acceptance criteria / DoD**: A Smart Collection scope costs what the equivalent filter costs,
measured; no code path materializes membership; freezing 40,000 tracks runs as a job and reports
its count.

**Risks**: Medium. The named risk is a well-meaning cache: the first person to see the same query
run twice will want to store the answer. DEC-061's reasoning is recorded so that instinct meets an
argument.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-07

**Outcome**: Complete. `services/collection_service.py` gained five operations, two value types and
four helpers; `services/interfaces.py` declares all of them; nothing else in `src/cuepoint/` changed
and no schema changed — m0009 already had `rules_json`, `sort_field`, `sort_dir`, `frozen_from_id`
and `frozen_at`, which is what a step that only has to use them looks like. No engine route and no
renderer file was touched: ORG-08 owns the API and ORG-12 owns the button.

**It went into the tree service rather than beside it.** Every ORG-06 operation is a node
operation — saving one creates a node, duplicating one creates a node, and renaming, moving and
deleting one are ORG-04's methods working unchanged on a row whose `kind` happens to be `smart`. A
`SmartCollectionService` would have needed the depth cap, the folder-only-parent rule and the
sibling ordering a second time, or a private call into the first service to borrow them. What it
does buy is two new constructor arguments, and both exist for one method: a freeze has to *run* the
rules to find out what it is storing, which is a library query, and DEC-029 wants one event saying
it happened.

**DEC-043's promise is a fact about the code rather than a sentence in a document.** `resolve()`
reads a rule set out of a column and builds a `BrowseQuery` from it — the same class the filter bar
fills in, handed to the same `TrackRepository`. There is no saved-rule query path that could
disagree with the unsaved one about a null, a collation or a tiebreak, because there is only one
path. The tests assert it end to end anyway, down to the order of the ids, with a two-clause rule
set as well as a one-clause one: a bug that keeps the first rule and drops the rest still returns
tracks, just the wrong ones, and a single-rule fixture would never notice.

**A resolution is either a query or a reason, and the constructor refuses anything else.** This is
the shape decision of the step. The tempting design is a resolution that always carries a query plus
a `broken` flag; the trouble is what the query holds when the rules could not be read. An empty rule
set is the honest parse of nothing, and an empty rule set **does not match nothing — it matches
everything**. A Smart Collection whose rules were lost would quietly become the whole library under
a name the user chose for forty tracks. Three separate refusals now stand between that and a user:
saving an empty set, reading one back, and constructing a resolution with neither a query nor a
problem. Each is caught by its own mutation, and the third is the only one that cannot be argued
away by "the other two already cover it".

**Rules are checked when they are saved and again when they are read, and the two refusals are
different on purpose.** Saving refuses a rule set naming a tag or Collection that is already gone,
or one naming another Smart Collection (DEC-060) — while the user is still looking at the filter
they built, which is the only moment a refusal costs nothing. Reading cannot refuse: the row exists
whether or not the tag still does, and ORG-09 has to draw it either way. So `resolve()` reports the
problem, and the refusal happens when someone tries to run it — as `BrokenRuleError`, which ORG-05
made a `FilterRuleError` precisely so this arrives at a handler as a message naming the clause
rather than as a 500.

**DEC-060 is what makes recursion, cycle detection and an evaluation bound unnecessary rather than
unwritten.** A rule may name a Collection and may not name a Smart Collection, so a saved question
can never reference another saved question — not itself, not a cycle, not a chain. ORG-05 built that
check; ORG-06 is the first caller with something to lose by it. A *frozen* Collection is rows rather
than a question, so filtering on one is allowed, and a test says so: the rule is about `kind`, not
about provenance.

**A freeze keeps the rules it came from, which m0009 anticipated and DEC-061 needs.**
`frozen_from_id` is deliberately not a foreign key — the source has to be deletable — so provenance
that says "frozen from #7" with no #7 left says nothing at all. The frozen Collection therefore
carries `rules_json` as well, which m0009 declined to forbid with a CHECK for exactly this reason
and `Collection.__post_init__` leaves legal for exactly this case. It is still a plain Collection:
`resolve` refuses it, and tracks can be added to it by hand.

**Freezing is one transaction, including the activity event.** The Collection, its entries and the
feed entry are all of it or none of it — a Collection in the tree with forty thousand tracks in it
and nothing in the feed to say where it came from is a worse outcome than a slow freeze. A test
drives it with an activity service that refuses, and asserts the tree and `collection_tracks` are
untouched afterwards. `_create` joins an open transaction rather than refusing one, which is what
makes that possible.

**The freeze reads its answer a page at a time, and that is correctness rather than tuning.**
`browse_ids` caps one request at 50,000 ids. An unpaged read would freeze the first page of a larger
library and report it as the answer — a silent wrong number, which is the worst kind. Three
mutations cover it: reading one page, stopping one page early, and re-reading the same page forever
(the last one hangs rather than fails, which is why the harness runs under a timeout). The page
loop is driven in the tests by shrinking the page to two rather than by building a library.

**Guards: 46 of 47 fail when the thing they protect is broken.** Saving, five ways: an empty rule
set stored, what the rules name never checked, the rules stored unvalidated so one filter becomes
two different rows, a smart collection saved as a plain one, and only the first rule of a set kept.
The saved order, six ways: silence read as the default, an unknown sort accepted, a playlist
position accepted, an unknown direction accepted, the direction stored as typed, and the sort
written nowhere on update. Resolving, eight ways: the saved sort ignored, the saved direction
ignored, a broken rule set resolved to no filters at all, references never re-checked, empty stored
rules read as no rules, unreadable JSON escaping as a crash, an unrunnable saved order escaping as a
crash, and one Smart Collection's rules read off another node. The resolution shape, three ways:
neither a query nor a reason allowed, a broken one answering with the whole library, and a broken
one crashing the caller instead of refusing it. Duplicating, four ways: the order dropped, the copy
landing at the top of the tree, a name allowed past the length a name may be, and the rules
re-checked so a broken one cannot be copied to repair. Freezing, thirteen ways: the source
forgotten, the time recorded without the source, the rules dropped, a second smart collection
produced instead of a Collection, the parent lost, one page read as the whole answer, the loop
stopping early, the loop never advancing, a broken rule set frozen as though "nothing" were the
answer, the event not written, the event written outside the transaction, the count dropped from the
event, and one track reported as one tracks. What a smart collection is, three ways: any node
answering as one, a smart collection handed rows after all, and the folder it was filed in ignored.
And the contract, two ways: a tree operation and the smart operations each removed from
`ICollectionService`.

Three of those started as survivors. Storing the rules unvalidated passed, because
`check_rule_references` validates the set itself before looking anything up — so the refusal was
covered and the *normalization* was not, and a filter written as `"128"` and one written as `128`
would have been two different rows for one question; two tests on the stored bytes now pin it.
Removing an operation from the interface passed, because nothing compared the two lists: there is
now a test asserting that what `CollectionService` offers and what `ICollectionService` declares are
one set, which also found that ORG-04's `get` had never been declared. And one mutation is
genuinely equivalent and was kept rather than removed: reporting `len(track_ids)` instead of the
`AddResult`'s own count cannot differ, because a Collection created a statement earlier holds
nothing to skip and a query cannot return an id twice. The write's report of what it wrote is still
the more honest of the two, and the property that matters — the reported count equals the rows the
Collection holds — is asserted directly.

**Measured at the acceptance scale** — 50,000 tracks, 200,000 assignments over 20 tags. The DoD's
first question answers itself, because a Smart Collection scope *is* the equivalent filter: counting
five tags takes **26.84 ms** saved against 26.75 ms unsaved, a window **33.41 ms** against 33.14 ms;
a tag and a genre together, **7.09 ms** against 7.31 ms and **13.22 ms** against 13.99 ms. The whole
of the difference is `resolve()` itself at **0.07–0.09 ms** — one row and one reference check.
Editing a Smart Collection standing for 49,466 tracks is **2.17 ms** and duplicating it is 2.00 ms,
because both write one row. Nothing is stored against a smart node: `collection_tracks` holds
**0** rows for it after saving, updating, duplicating, resolving, browsing and freezing.

**Freezing is the one expensive thing, and the number is why ORG-07 owns it.** 1,683 tracks take
**28.9 ms**, 9,913 take 89.1 ms, 33,646 take 419.4 ms and 49,466 take **897.3 ms** — roughly linear
at 15 µs a track, and comfortably past any budget for a gesture that blocks. The count is reported
and correct at every size (49,466 reported, 49,466 rows stored, 49,466 matched). ORG-07 wraps this
in its job path and needs no change here; the threshold it has to pick now has points rather than
an intuition, and a freeze stays under 50 ms up to roughly three thousand tracks. It is also worth
recording what a freeze *buys*: paging the frozen Collection costs **0.30 ms** against **72.34 ms**
for the live rule set over the same tracks, which is the answer to "why would anyone freeze one".

**Verification**: `python -m pytest src/tests/unit` — 4077 passed, 45 skipped (115 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped; `npm test`
in the renderer — 1265 passed, unchanged and untouched; `ruff check src/` and `ruff format --check
src/` clean; `check_no_qt_in_core.py`, `check_desktop_version_coupling.py` and the engine health
smoke all OK; `mypy` reports nothing in either changed module. Three failures in
`test_code_quality_step_5_7.py` are unrelated to this step and predate it: they assert
`.pre-commit-config.yaml` mentions black, isort and flake8, and that file was rewritten to use ruff
outside this work.

Two things this step deliberately did not do. It did not add a `collection` or `smart` scope to
`BrowseQuery`: ORG-08's table puts `scope=collection|smart` on the search endpoint, and a Smart
Collection scope resolves to rules and then runs the query that already exists, which is the whole
of what "reused unchanged" means here. And it did not build the freeze job: `engine/jobs.py` is
ORG-07's, a job with no route would be unreachable, and `freeze` already returns the count a job has
to report. The measurements above are ad-hoc; ORG-13 owns the recorded scale numbers.

---

## ORG-07 — Batch Edits as Jobs ✅ IMPLEMENTED 2026-09-07

**Objective**: Apply one operation to a selection that may be 47,913 tracks, without blocking the
UI and without losing the history that DEC-008 promised instead of an undo stack.

**User-visible result**: None yet; the actions that call it are ORG-11.

**Dependencies**: ORG-02, ORG-03, ORG-04.

**Existing code reused**: `engine/jobs.py` and `engine/library_jobs.py` — the import job is the
template, down to its progress shape and cancel check; `services/activity_service.py` for history
and events; `track_query`'s id projection (`fields=id`), which LIBUI-03 built and which is exactly
how a query becomes an id set.

**Design**:

- One entry point: `apply_batch(selection, operation)`. **`selection` is either explicit ids or a
  query description** — scope, text query, rules — matching DEC-045's model on the wire. A
  selection of 47,913 tracks never crosses the wire as 47,913 numbers.
- Operations: set rating, set favorite, add tag, remove tag, add to Collection, remove from
  Collection. One vocabulary, so ORG-11's menu and toolbar do not each invent their own verbs.
- **The job resolves the query to an id set once, at start**, and reports the count it acted on. A
  selection that drifts under a running job would make the reported number a guess.
- **Threshold**: below it the operation applies inline and returns the count; above it a job starts
  and the status strip follows it (DEC-033's pattern). The threshold is a named constant this step
  fixes, not a setting.
- **Chunked transactions** — a stated batch size per commit — so a cancel is honored promptly and
  one transaction does not hold 47,913 rows. ORG-02 measured why this is not a nicety: writing
  through the ordinary per-write path costs 1.95 ms per track because each write is its own commit,
  and 0.014 ms inside one transaction — **144×**, or a hundred seconds against under a second for a
  47,913-track batch. No bulk repository method is needed to get it; the metadata writes already
  join an outer transaction (`transaction(join_existing=True)`), so the batch opens one and the
  existing calls do the rest. The consequence is stated rather than hidden: a
  cancelled batch leaves applied work applied, and the activity event says how far it got (DEC-063).
- **Every applied change writes its per-field history row, all sharing one `batch_id`** (a uuid).
  This is the step that makes "revert this batch" buildable later without an undo stack; building
  that UI is not in this phase, but writing the id is not optional.
- **One activity event per batch**, carrying the operation and the counts (DEC-029) — not one event
  per track. Per-track detail lives in history, which is where a user looks for it.
- Failures inside a batch (a track deleted mid-run) are counted and reported, not fatal.

**Tests**: An id selection and an equivalent query selection produce identical results. The id set
is resolved once — a fixture that changes the library mid-job does not change the job's target.
Every changed field has a history row, every row in one run shares a `batch_id`, and a no-op change
writes no row. Exactly one activity event per batch, with counts matching. Cancellation stops
promptly, leaves applied work applied, and reports the partial count. Below-threshold operations
run inline and start no job. A batch over a selection containing a track that no longer exists
reports it and completes.

**Acceptance criteria / DoD**: Tagging 47,913 tracks completes as a job with visible progress, is
cancellable, writes 47,913 history rows under one batch id and one activity event, and the app
stays responsive throughout — measured, at scale, and recorded.

**Risks**: High. This is the phase's biggest write, the one place where a wrong transaction
boundary is felt as a frozen app or a half-applied edit, and the first bulk write CuePoint performs
against data it cannot re-derive.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-07

**Outcome**: Complete. `services/batch_service.py` is the one entry point, `engine/batch_jobs.py`
decides where it runs, and between them they add six operations, three value types and a job type.
`services/interfaces.py` declares the service, `bootstrap.py` wires it, and eight write methods
across the three Phase 6 services now join an outer transaction instead of demanding their own. No
schema changed: ORG-01 added `track_history.batch_id` and ORG-02 threaded it through the history
writer, which is what a step that only has to use them looks like. No route and no renderer file
was touched — `POST /api/v1/library/batch` is ORG-08's and the menu that calls it is ORG-11's.

**The service holds no rule about ratings, tags or Collections, and that is the design.** Every
operation is delegated to the service that owns it, so a batch and an Inspector edit validate
identically, normalize identically and record identically — there is no second write path that
could disagree about what `"4"` means or about whether a no-op is history. What lives here is the
part neither of them has: resolving a selection once, moving through it in committed chunks,
honouring a cancel, counting what happened, and saying so once in the feed. The cost is six
constructor arguments, and every one of them is a rule this service refuses to own a copy of.

**The selection is resolved once, and the two tests that matter move the library underneath it.**
The obvious failure is a job that re-reads its query, and the queries a user actually batches are
the self-defeating kind: "everything with no rating", rated. A job re-reading that would rate its
first chunk, find nothing left to do, and report *that* as the answer. One test does exactly that
and asserts all forty are rated; a second adds a track mid-run and asserts it was not swept up.
Both drive real chunks by shrinking the chunk to five rather than by building a library.

**Where the refusals happen is a decision rather than an accident.** `apply_or_start` resolves the
selection *and* checks the operation before it chooses between inline and a job, so a verb that
does not exist, a favorite sent as the word `"false"`, a selection naming nothing and a tag deleted
a moment ago all come back as errors. The alternative — checking inside the job — turns each of
them into a job that appears in the status strip and fails a tick later, which is a worse way to
say "that request does not make sense". It also means the id set that answered "how many" is the id
set the work is done over, which is DEC-063's rule read literally rather than approximately.

**A chunk is applied set-shaped and retried one track at a time.** Tagging a thousand tracks is one
INSERT rather than a thousand; asking a Collection to take a thousand reads its membership once
rather than a thousand times. But a set-shaped call cannot say *which* row a foreign key complained
about, and a track deleted while the batch runs has to cost one failure rather than a thousand. So
a chunk that raises has already rolled back, and is re-applied one track at a time to find out
which one it was. That is the only path where the cost differs from the fast one, and it is the
path the spec's deleted-track test takes.

**Collection membership writes no history, deliberately, and this is the step where that had to be
decided.** DEC-063 says every changed *field* writes a row, and membership is not a field of a
track: ORG-04 records it as an entry row with its own identity (DEC-058) and writes no history for
it by any path. Recording it here alone would mean the same user action appears in the History tab
when it came from the toolbar and is absent when it came from a drag, which is worse than the gap.
If it belongs there it belongs in `CollectionService`, where both paths pass. The batch's activity
event carries the counts either way, and every field operation — rating, favorite, tag on, tag off
— writes its rows under one batch id.

**Eight write methods now join an outer transaction, which is the change ORG-03 made for the same
reason.** `MetadataService`'s four writes, `TagService.assign`/`unassign` and
`CollectionService.add_tracks`/`remove_entries` opened `transaction()` rather than
`transaction(join_existing=True)`, so calling any of them inside a batch's chunk raised
`DB_NESTED_TRANSACTION`: the chunked transaction DEC-063 asks for was not merely unimplemented, it
was impossible. Joining is the correct relationship anyway — a write that commits independently of
the boundary its caller opened makes that caller's rollback a lie. Where no transaction is open,
which is every caller outside a batch, nothing changes at all, and the 1,848 tests over those three
services say so.

**A blocker found by doing what the spec said, and fixed rather than routed around.** Removing
50,000 tracks from a Collection never finished. `CollectionRepository._renumber_entries` closed the
gaps with a *correlated* scalar subquery, so SQLite rebuilt the entire numbering once for every row
it updated: 2,000 entries took **1.24 s**, 10,000 took **30.9 s** and 20,000 took **123 s** —
quadratic, which puts one call over a 50,000-entry Collection at about a quarter of an hour, and a
batch makes one call per chunk. Nothing had noticed because nothing had ever removed entries from a
Collection that big; ORG-04's own tests use eight tracks. Rewritten as `UPDATE … FROM`, which builds
the numbering once and joins it, the same three sizes are **3.5 ms**, **18.1 ms** and **37.0 ms**,
and removing every track from a 50,000-entry Collection takes **3.6 s**. `_close_gap` over the tree
had the identical shape and was fixed with it: a folder's children will never be fifty thousand
long, but leaving one statement of each shape in one file is how the wrong one gets copied next.

Its guard is neither a clock nor a query plan. It counts the virtual-machine instructions SQLite
actually executes, through `set_progress_handler`, because a clock would be flaky and a plan would
be build-specific. The two shapes are two orders of magnitude apart — **57 steps per row against
29,474** — so the bound refuses the old one and passes the new one with a great deal of room on
either side.

**A result whose parts do not add up is refused by its own constructor.** A batch that ran to the
end accounts for every track it resolved; only a cancelled one stops short, and then it says so.
That is not tidiness: `changed`, `unchanged` and `failed` are three counters incremented in three
places, and "47,913 selected, 47,900 accounted for" is a report a user cannot reconcile with
anything. Two mutations that quietly miscount are caught by this rule rather than by a test that
happened to look in the right place.

**The threshold is measured, and the chunk size is not a speed dial.** At 50,000 tracks the most
expensive operation — a rating, four statements a track — settles at **62 µs a track**, so the
1,000-track threshold is **61 ms** of blocking: about as long as a click may take before it needs a
progress bar instead of a result. For the chunk, the same 10,000 tracks take 882 ms in chunks of
100, 561 ms in 500, 546 ms in 1,000, 524 ms in 2,000 and 521 ms in 5,000 — everything past 500 is
within a few per cent of everything else, so the size is chosen for the cancel rather than the
clock, and the cancel is **41 ms** at the acceptance scale.

**Guards: 58 of 58 fail when the thing they protect is broken.** The selection, six ways: a track
named twice counted twice, a selection naming nothing running as a batch, one page read as the
whole answer, the page loop never advancing, the loop stopping a page early, and a selection
allowed to be both ids and a query or neither. The vocabulary, six ways: an unknown verb accepted,
a rating stored as it was typed, favorite taking the word `"true"`, zero and negatives accepted as
ids, `True` accepted as an id, and a verb not trimmed. The target, six ways: a missing tag found
anyway, a missing Collection used anyway, anything in the tree given tracks, the target never
checked before the work starts, the snapshot never read, and `check` checking nothing. The loop,
eleven ways: a cancel noticed one chunk late, a cancel never noticed, the chunk size ignored, every
write committing on its own (the 144×), the whole batch as one transaction so a cancel keeps
nothing, one batch id per chunk, no batch id at all, an unchanged track counted as changed, a
failure counted as unchanged, a chunk failure taking the batch down, and the retry giving up on the
first track it cannot apply. Progress, three ways: nothing reported before the first chunk, the
chunk reported instead of the running total, and nothing reported after a chunk. The event, nine
ways: no event at all, an event per chunk, an event with no counts, a summary counting what was
selected rather than what changed, a summary that never says what it did not change, one track as
"1 tracks", adding and removing a tag reading the same, a cleared rating reading as a rating, and
favoriting and unfavoriting reading the same. The result, four ways: accounting for fewer tracks
than it resolved, for more, failures excluded from what was reached, and a payload that forgets it
was cancelled. And the engine, twelve ways: the threshold off by one, everything a job, nothing a
job, a refusal turned into a job that fails, exclusivity dropped, the conflict group dropped, a
cancelled batch reported as success, a cancelled batch reported without counts, a failure losing
its error code, the status strip told nothing about which operation is running, the last progress
tick droppable so the bar never fills, and an operation removed from `IBatchService` so the
contract and the implementation could drift apart.

Three of those started as survivors, and each closed with a test rather than a shrug. *The summary
counting the selection rather than the change* passed because every summary test happened to use a
batch where the two numbers were equal — so "Rated 5 tracks" would have appeared in the feed after
a batch that changed nothing. *The removal reporting what it was asked to do rather than what it
did* passed because the only mixed-selection test had no tracks in the Collection at all, and the
early return covered it; a chunk holding both kinds is what "remove this page from the Collection"
produces, and now has its own test. And *the sampler's last tick* passed because the test that
watched progress had switched the throttle off; with a minute-long interval, a sampler with no
exception for the final tick leaves the bar stopped where it last fired.

**Measured at the acceptance scale** — 50,000 tracks, 200,000 assignments over 20 tags. The DoD's
question first: tagging every track takes **1,397 ms** and writes **50,000** assignments, **50,000**
history rows under one batch id and **one** activity event, in 51 progress ticks with a longest gap
of **41.1 ms**. Adding all of them to a Collection is **1,325 ms** and removing them again **3.6
s**.
Resolving the whole library to ids is **30.5 ms** and a genre to 8,334 ids is **18.9 ms**;
favoriting those 8,334 is **704 ms** and reports the 8,096 that were not already favorites. Doing
the same tagging a second time, when nothing can change, is **106 ms** rather than 1,397 — thirteen
times cheaper, because `assign` skips what is already there and the batch counts what it skipped.
Inline sizes: 100 tracks 12.1 ms, 500 39.2 ms, 1,000 61.0 ms, 2,000 123.9 ms, 5,000 312.0 ms.

The app staying responsive is a property of those chunks rather than a hope: the database is in WAL
mode and no transaction spans the batch, so a reader never waits for it. A test runs a second
connection in a thread reading throughout a batch applied one track per chunk, and asserts it never
blocks and never sees a torn count.

**Verification**: `python -m pytest src/tests/unit` — 4,198 passed, 45 skipped (122 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped; `npm test`
in the renderer —
1,265 passed, unchanged and untouched; `ruff check src/` and `ruff format --check src/` clean;
`check_no_qt_in_core.py`, `check_desktop_version_coupling.py` and the engine health smoke all OK;
`mypy` reports nothing in `batch_service.py` and, in `batch_jobs.py`, only the
`container.resolve(IInterface)` note every other engine module already carries. The three failures
in `test_code_quality_step_5_7.py` are unrelated to this step and predate it: they assert
`.pre-commit-config.yaml` mentions black, isort and flake8, and that file was rewritten to use ruff
outside this work.

Three things this step deliberately did not do. It did not add the route: `POST
/api/v1/library/batch` is in ORG-08's table, and `apply_or_start` returns exactly what that handler
has to serve — an applied count or a job id. It did not build the menu or the confirmation above the
threshold, which are ORG-11's. And it did not build "revert this batch": DEC-063 requires only that
the id be written, the Deferred list already says why reverting CuePoint's own fields needs a second
write path, and a revert with no way to put a rating back is worse than none. The measurements above
are ad-hoc; ORG-13 owns the recorded scale numbers.

---

## ORG-08 — The Organization API and the Desktop Contract ✅ IMPLEMENTED 2026-09-07

**Objective**: Expose ORG-02 through ORG-07 to the renderer, through all six contract files, with
the existing error envelopes intact.

**User-visible result**: None directly; the Library page keeps behaving exactly as it does today.

**Dependencies**: ORG-02, ORG-03, ORG-04, ORG-05, ORG-06, ORG-07.

**Existing code reused**: `engine/library_api.py`'s parsing helpers (`parse_int_param`,
`parse_filters_param`, `parse_sort`) and its `track_to_dict` field-list discipline;
`engine/jobs_api.py` for the job envelope; `desktopContract.test.ts` as the gate.

**API**: a new `engine/organization_api.py` beside `library_api.py` rather than growing one module
past readability. Mutations are POSTs to action paths, per cross-cutting fact 1.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/collections` | The whole tree: folders, Collections, Smart Collections, counts, broken-rule state |
| `POST /api/v1/collections/create` · `/rename` · `/move` · `/delete` | Tree mutation; `delete` echoes what it removed |
| `POST /api/v1/collections/delete/preview` | What a subtree delete would take, for ORG-09's confirmation |
| `POST /api/v1/collections/tracks/add` · `/insert` · `/remove` · `/reorder` | Membership, by entry id |
| `POST /api/v1/collections/smart/save` · `/update` · `/duplicate` · `/freeze` | DEC-061's operations |
| `GET /api/v1/tags` | The vocabulary with usage counts and categories in use |
| `POST /api/v1/tags/create` · `/update` · `/delete` · `/merge` · `/assign` · `/unassign` | Tag management |
| `POST /api/v1/library/tracks/{id}/metadata` | Rating, favorite, notes for one track |
| `GET /api/v1/library/tracks/{id}/history` | The track's field history (DEC-008), newest first |
| `POST /api/v1/library/batch` | ORG-07; returns either an applied count or a job id |

Plus, on endpoints that already exist: `search` accepts `scope=collection|smart` with a
`collection_id` — the same one query path, extended the way LIBUI-03 extended it, with the same
guard test that a request carrying none of the new parameters returns byte-identical output.
`filter-fields` grows the new fields and their operators. `facets` answers for `tag` and `favorite`.

**Design**:

- Every handler validates and delegates; no business rule lives in the API layer. A refusal from
  the model or the service maps to the existing "that request does not make sense" envelope with
  the offending clause named — the shape `FilterRuleError` already gets.
- Ids in paths are parsed with the existing helper and refused as 400, not 500, when absurd.
- Response shapes use explicit field lists, like `track_to_dict`, so adding a column to a table is
  never accidentally a public contract change.
- **The browse projection carries CuePoint's values** — effective rating, its source, and the
  favorite — which is the step that changes `browse`'s return type and `LibraryBrowseResult`
  alongside the serializer that consumes them. ORG-02 measured the alternative it leaves open: a
  window's `get_many` is 0.22 ms against a 1.18 ms browse at 50,000 tracks, so a second query per
  window is affordable and the join is a choice to make with both numbers in hand rather than an
  assumption. Notes stay out of the window either way: a 10,000-character note times a hundred rows
  is a megabyte per window, and the Inspector reads one track.
- The six-file sweep for every route, with `engineSupervisor.ts` explicitly on the list. The
  contract test is extended in the same commit as the route, not after it.
- Bridge types name the domain, not the transport: `Collection`, `CollectionNode`, `Tag`,
  `TrackMetadata`, `BatchResult`.

**Tests**: Every route: happy path, refusal path, and a request with a plausible wrong shape. The
DEC-023 guard on `search`. The desktop-contract test covers every new method. A smart-collection
scope through the API returns the same tracks as the same rules sent as filters. Batch through the
API returns a job id above the threshold and a count below it. Error envelopes are unchanged in
shape for every existing route.

**Acceptance criteria / DoD**: The renderer can express every operation the phase needs without a
second query path; `PYTHONPATH=src python scripts/smoke_engine_health.py` passes; the contract test
enumerates every new method.

**Risks**: Medium-high. The surface is large and the supervisor gap is silent. The mitigation is
the existing test, extended per route rather than at the end.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-07

**Outcome**: Complete. `engine/organization_api.py` answers twenty-two routes,
`engine/api_errors.py` holds the one error envelope it and `server.py` both build, and
twenty-five methods cross all six
contract files. `search` and `facets` grew CuePoint's scope; the browse row grew CuePoint's three
values; `track_query.py` grew a Collection scope and the order a Collection opens in. No schema
changed and no service gained a rule — every refusal these tests assert is a message some earlier
step already wrote.

**The server learned two functions rather than twenty branches.** `do_GET` and `do_POST` are long
if-chains, and twenty more would have put the routing of one feature in a file that knows nothing
else about it. `organization_api` exposes `handles_get`/`handles_post` and
`handle_get`/`handle_post`,
each answering `(status, payload)`, so the server's whole knowledge of this step is "does that
module
take this path, and how do I send what it answers". The exception-to-status mapping lives beside the
handlers that raise, in one `status_for`, rather than as five `except` clauses per route written
slightly differently each time.

**`error_payload` moved rather than being copied.** It lived in `server.py` while one module built
the envelope; ORG-08 added a second builder, and two builders of one shape is how a shape stops
being one. It is now in `engine/api_errors.py` and re-exported from `server.py` under its old name,
so nothing that imported it noticed.

**Refusals are 400, and the reason is worth stating.** Every Phase 6 service says no with a
`ValueError` — "that rating is not a rating" and "there is no Collection 7" arrive identically, and
telling them apart from outside would mean matching on message text, which is a worse contract than
one honest status. So an action whose *body* names something missing is a 400 carrying the service's
own message. A resource named in the *path* is different: `/library/tracks/999/history` is a 404,
because the path is the thing that was wrong. Both are asserted on every route, because a refusal
that arrives as a 500 throws away the message and tells the user their app is broken instead of
that their request is.

**The scope had to reach the query, not sit beside it.** ORG-09 needs a Collection to open in the
order its owner arranged, and an ordering has to know *which* Collection it is ordering within —
something a rule about membership does not say. So `BrowseQuery` gained `collection_id` the way
LIBUI-03 gave it `playlist_id`: a CTE, a predicate that asks `IN` rather than joining (so a track
filed twice appears once and the count agrees with the rows), and a `collection_position` sort
refused outside the scope that defines it. Both scopes may be set at once and narrow together. The
whole of it is forty lines, and the alternative — a second read path for "the tracks of a
Collection" — is the one DEC-023 exists to prevent.

`scope=smart` needed no scope at all: a Smart Collection *is* rules, so it resolves to them and runs
the query that already existed. What the filter bar is holding is ANDed onto them rather than
replacing them — DEC-016's model is flat and all-of, so concatenation is the whole operation —
which is what lets ORG-12 narrow a saved question without a second endpoint. A saved sort answers
when the caller names none, which meant teaching the endpoint to tell "no sort" from "sort=artist":
the library's default is the right answer for a library and the wrong one inside a scope with an
order of its own.

**The browse row carries CuePoint's values, and `rating` still means Rekordbox's.** DEC-057 keeps
the two layers apart, so the row gained three fields rather than overwriting one. `effective_rating`
is what to draw, `rating_source` says which layer it came from, and `favorite` is a flag of its own.
Overwriting `rating` would have been a smaller change and would have left the Inspector unable to
say which value it is showing. Notes stay out of the window: ten thousand characters times a hundred
rows is a megabyte a window, and the one surface that shows a note reads a single track.

The values come from one `get_many` per window — what ORG-02 built after measuring the alternative
at 0.22 ms against a 1.18 ms browse at 50,000 tracks. The join stayed unbuilt and `LibraryTrack` did
not change, so Phase 4's thirty assertions about that row shape did not either.

**`LibraryService` gained a third repository, and it has no default.** A service wired without one
would answer every window with "nobody has rated anything" — not an error anyone can see, only a
library that looks emptier than it is. That is the argument `collection_repository` already carries,
and it is why both are required arguments rather than convenient defaults.

**A routing bug, found by a test rather than by a user.** `/api/v1/library/tracks/{id}` is matched
with `startswith`, so `/api/v1/library/tracks/7/history` was read as a track whose id is
`"7/history"` and refused as one. The organization routes are matched first now, with two anchored
patterns that cannot be confused for a track id, and a mutation putting the order back is caught.

**One route the spec's table does not list, and why.** `GET /api/v1/collections/entries` answers a
Collection's membership *by entry*. The table lists `/collections/tracks/remove` and `/reorder`,
both of which address entry ids (DEC-058: a track filed twice has two of them, and "remove the
track" is not a well-formed request) — and without this the renderer would have no way to learn an
entry id. The *tracks* of a Collection still come from the browse endpoint with `scope=collection`,
which is the one query path everything else uses.

**Guards: 48 of 48 fail when the thing they protect is broken.** The scope, fourteen ways: a
collection scope that does not narrow, one that means any collection rather than the one it names, a
Collection that opens in the library's order, a position sort accepted without the scope that
defines it, a track's *last* place deciding its order instead of its first, a named sort ignored
inside a scope, a Smart Collection not resolved to its rules, a filter replacing those rules instead
of narrowing them, a saved sort ignored, a broken Smart Collection resolving to the whole library, a
scope with no collection accepted, a collection with no scope accepted, any word accepted as a
scope, and a missing sort read as the default rather than as absent. The row, four ways: Rekordbox's
rating shown where CuePoint's belongs, every rating attributed to Rekordbox, a window that reads no
metadata at all, and a row carrying the note it was told not to. The tree, five ways: no counts, the
two counts collapsed into one, a broken Smart Collection drawn as though it worked, rules withheld
so nothing could edit a saved filter, and a Smart Collection creatable as an empty one. Bodies, six
ways: a body that is not an object, an empty id list, a list of words as ids, `true` as an id, an
empty name, and rules that are not a rule set. One track's metadata, five ways: a write on a missing
track that is not a 404, a field nobody sent written anyway, an empty body treated as a no-op,
`"true"` accepted as a favorite, and the override reported as the effective rating. History, three
ways: a missing track answered with an empty list, a limit trusted rather than clamped, and rows
with no batch id. The batch, four ways: a selection that ignores its scope, a job reported as
applied, and a body with no operation or no selection accepted. And the envelope, seven ways: a
service refusal as a 500, an unreachable database as a bad request, a named status thrown away, an
unknown path answered 200, a path id as a 500 rather than a refusal, the routes open to anyone, and
the track-detail prefix swallowing the history route.

Twelve of those started as survivors, and ten of them said the same thing: *the status was right
either way, and the message was the whole difference*. A list of words as ids was refused by
`int()` a moment later; an empty name was refused by the service; a body that is not an object was
refused for the field it did not have. In each case the user would have been told something true
and useless — "invalid literal for int() with base 10" instead of "track_ids must hold numbers". The
tests now assert the message a user actually reads, which is what those parsing helpers exist to
produce. The other two were real gaps: nothing asserted that a rating set through the API appears in
the *window* (only in the Inspector's read), so a window that read no metadata passed everything.

**Verification**: `python -m pytest src/tests/unit` — 4,308 passed, 45 skipped (98 of them new);
`python -m pytest src/tests/integration src/tests/regression` — 350 passed, 13 skipped; `npm test`
in the renderer —
1,397 passed, including 179 desktop-contract assertions; `npm run typecheck`, `npm run lint` and
`npm run build:check` in the renderer, and `npm run build` in the desktop app, all clean; `ruff
check
src/` and `ruff format --check src/` clean; `PYTHONPATH=src python scripts/smoke_engine_health.py`,
`check_no_qt_in_core.py` and `check_desktop_version_coupling.py` all OK; `mypy` reports nothing new
in the changed modules. The three failures in `test_code_quality_step_5_7.py` are unrelated and
predate this step.

Two things this step deliberately did not do. It did not build a single UI: the Library page behaves
exactly as it did, which is the step as specified — ORG-09 draws the tree, ORG-10 makes the
Inspector editable, ORG-11 adds the selection actions and ORG-12 the save button. And it did not
add a scope to the *playback* queue beyond what it gets for free: `resolveQueueFromView` passes the
view through untouched, so a queue built inside a Collection is already in that Collection's order,
and nothing else was needed to make DEC-012 agree with DEC-058.

---

## ORG-09 — The Collections Tree in the Library Pane ✅ IMPLEMENTED 2026-09-07

**Objective**: DEC-062's left pane: an editable Collections tree beside the read-only Rekordbox
tree, scoping the same table.

**User-visible result**: The first CuePoint-native organizational surface. A user can create a
Collection, file it in a folder, and click it to see its tracks.

**Dependencies**: ORG-08.

**Existing code reused**: `screens/library/playlistTree.ts` (tree building, flattening, expansion
state) and `PlaylistPane.tsx`, with 866 lines of tests behind them. The generic part is extracted
into one tree renderer both sections use; the Rekordbox section's behavior does not change.

**Design**:

- The pane becomes two sections in one scroll container: **Collections** (editable) and
  **Rekordbox** (read-only, exactly as today). Both use the extracted tree component; only the
  affordances differ.
- Create a Collection or folder, rename inline, drag to move within the tree, delete with a
  confirmation that **names what goes** — folders, Collections and entry counts, from ORG-08's
  preview route.
- **Dropping tracks onto a Collection** is the app's first drop target: dragging a selection from
  the table onto a Collection adds it (ORG-11 owns the drag source). Dropping onto a Rekordbox
  playlist is **refused with a visible reason**, not silently ignored (DEC-031) — a target that
  does nothing teaches nothing.
- Selecting a node scopes the table, by DEC-044's mechanism: a Collection sets
  `scope=collection`, a Smart Collection `scope=smart`. Inside a Collection the default sort is the
  Collection's own order.
- A broken Smart Collection (ORG-06) shows as broken in the tree with its reason on hover, and
  still opens — showing the user the rule that broke is more useful than hiding the row.
- Icons: `collections` and `folder` exist. A **smart-collection** icon and a **tag** icon are drawn
  as real sprites per DEC-010's hybrid rule (recurring, high-visibility), in `pixelIcons.ts` with
  the existing test that every icon is a well-formed grid.
- Expansion, section collapse and selection persist with the existing `localStorage` pattern; new
  keys do not extend the legacy `-ui-lab-` debt.
- Empty state: a library with no Collections says what a Collection is and offers to create one,
  rather than showing an empty box.

**Tests**: Component tests beside the component, per the repo's convention. Tree renders both
sections; a Collection is creatable, renamable and movable; a move into a node's own subtree is
refused with a message; delete confirms with the counts it was given; a drop onto a Rekordbox
playlist is refused visibly; selecting a Collection issues one browse request with the right scope;
expansion survives a remount. The existing `PlaylistPane` tests pass unchanged against the extracted
component — the regression that matters most here.

**Acceptance criteria / DoD**: 200 Collections in a tree render and interact without visible lag;
the Rekordbox section behaves exactly as it did in Phase 4; no drag gesture can modify a Rekordbox
playlist.

**Risks**: Medium. Extracting a component with 866 lines of tests behind it is the risk, and those
tests are the mitigation.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-07

**Outcome**: Complete. The Library pane is two sections in one scroll container:
`CollectionsPane.tsx` for CuePoint's own tree and the unchanged `PlaylistPane.tsx` for Rekordbox's
mirror, both drawn by one extracted `PaneTree.tsx`, composed by `LibraryPane.tsx`.
`collectionTree.ts` is the model, `useCollectionTree.ts` the state and the writes,
`collectionDrag.ts` the payload a drag carries. Two sprites joined `pixelIcons.ts`. No engine file
changed: everything here is ORG-08's API being used.

**The mirror is read-only because it passes no handlers, not because a comment says so.** The two
sections are the same component. What differs is what each hands it: `CollectionsPane` gives it
rename, drag, drop and delete; `PlaylistPane` gives it none of them, which is DEC-031 expressed as
code rather than as a promise. The regression that mattered most is that this cost nothing — all 41
of `PlaylistPane`'s existing tests pass **unchanged** against the extracted component, including
the three that assert it offers no rename, no draggable row and no text field.

**One visible change to Phase 4's pane, and it is deliberate.** "All tracks" now belongs to the
pane rather than to the Rekordbox section. It is the row that clears the scope, and leaving it
under a heading that says "from Rekordbox" would say everything came from there. `PlaylistPane`
still draws its own when it is used alone — which is what every one of its tests does — so the
change is a prop with a default rather than a rewrite.

**Identity is the id here and the path next door, and the difference is not a preference.** A
refresh replaces the entire Rekordbox mirror, so every playlist gets a new database id and only a
path survives; nothing replaces a Collection, and what changes about one is its *name*. Remembering
a path here would lose the user's place every time they renamed a folder. Both are tested by doing
the thing that breaks the other one.

**A drop that cannot work is never offered.** ORG-04's rules — only a folder may be a parent,
nothing may move inside itself, a Smart Collection holds a question rather than rows — are the
engine's and it still refuses anything wrong. `canMoveInto` asks the same questions first, and
answers *false* rather than a message: the pane declines to draw an impossible affordance, and the
rule itself stays in one place. A refusal a user has to trigger to discover is a worse answer than
a cursor that never offers it.

The one refusal that is *not* silent is the one aimed at Rekordbox. A selection dropped on a
mirrored playlist says why and names where it should have gone, because a target that quietly does
nothing teaches nothing — the user tries again, and again, and concludes the app is broken. Both
halves of DEC-031 are tested from this side: nothing in that section can be picked up, and nothing
dropped on it lands.

**A Collection opens in the order its owner arranged.** That is the whole reason ORG-08 taught
`BrowseQuery` a Collection scope and a `collection_position` sort. Selecting a Collection asks for
that order; selecting a Smart Collection asks for the sort it was saved with, so it looks the way
it looked when it was saved; selecting a *folder* asks for nothing at all, because a folder holds
nodes rather than tracks and scoping to one would show an empty table for something that is not
empty. One scope at a time: the engine would AND a playlist with a Collection, but a user who
clicks a playlist means the playlist, and a Collection still highlighted beside it would be a lie
about what the table is showing.

**A delete says what it will take, in the numbers ORG-08's preview route answers with.** "Delete
this?" over a folder holding nine Collections is a question nobody can answer, so the dialog names
the folders, the Collections, the Smart Collections and the entries filed in them — and says, every
time, that no track is deleted. That last clause is the thing a user is actually afraid of, and it
is in the dialog rather than in a document nobody reads. A preview that *fails* still asks, with
less detail: refusing to let someone delete a Collection because the preview could not be read
would be the worse answer.

**Every edit is one call and one reload, not a patch to a local tree.** Patching would mean a
second copy of the rules about depth, sibling order and what a folder may hold, and the copy in the
renderer would be the one that is wrong. A reload is one query over a few hundred rows — ORG-08
made the tree and its counts a single statement rather than two per node, which is what makes that
affordable.

**Two icons were drawn rather than borrowed** (DEC-010's rule: recurring and high-visibility). The
Smart Collection icon is deliberately the same funnel `filter` draws, with a spark beside it,
because a Smart Collection *is* the filter bar's rule set saved — and ORG-10's tag chips needed a
tag. Both go through the existing artwork tests: a square grid, rows of the exact width, something
drawn, inside the bounds, at least one two-cell stroke, and no duplicate of another icon.

**Guards: 44 of 44 fail when the thing they protect is broken.** The model, sixteen ways: a node
whose parent is gone dropped from the tree, a closed folder showing its children, a Collection
allowed to be a parent, a move into a node's own subtree allowed, a node already at the top allowed
to move there again, a Smart Collection said to hold tracks, a Collection opened alphabetically
rather than as it was arranged, a Smart Collection's saved sort ignored, a delete that stops
promising no track is deleted, one that stops counting the entries, one of a thing described as
several, stored state of some other shape trusted, ids for nodes that are gone kept, a Smart
Collection drawn as a plain one, a selection inside a closed folder left hidden, and the pane's
storage key joining the legacy `-ui-lab-` debt. The section, twelve ways: a new Collection not
opened for naming, a new node ignoring the folder that was selected, a rename that changed nothing
sent anyway, Escape committing the rename it was meant to abandon, a delete that happens without
asking, a confirmation that does not say what it is taking, tracks dropped on a folder, a move the
tree refuses offered anyway, a broken Smart Collection drawn as though it worked, the drop target
unmarked, an engine refusal swallowed, and a drop that says nothing about what was already there.
The mirror, four ways: a drop silently ignored, the refusal never reaching the page, a file from the
desktop refused as though it were tracks, and its rows made draggable. The query, three ways: two
Collections sharing one identity, a response for another scope accepted as current, and the scope
never reaching the engine. The page, four ways: a Collection selected without clearing the playlist
scope, a playlist selected without clearing the Collection scope, a folder scoping the table, and an
empty Collection reading like a search that found nothing. The tree widget, three ways: every row a
tab stop, the arrow keys unable to reach the row above the tree, and a tree whose focused row
vanished left with no way in. And the drag payload, two ways: any dragged text read as a selection
of tracks, and a payload that is not a list read as one.

Four of those started as survivors, and each closed with a test. Two were the same gap: nothing
compared two *different* Collection scopes, so a query key and a late-response check that both
ignored the scope passed everything — which at runtime is the first Collection's rows still on
screen after switching to the second. The third was a test that asserted `playlistId: null` from a
state where it was already null; it now scopes to a playlist first, so it says the scope was
*cleared*. The fourth was about a `DataTransfer` that answers every format with its text, which some
platforms do — the guard that reads the declared types rather than trusting `getData` now has a test
that fails without it. A fifth mutation was withdrawn rather than caught: the explicit "not into
itself" check was dead, because a node's subtree includes the node, and a branch no test can tell
from its absence is a branch that is not there.

**Verification**: `npm test` in the renderer — 1,528 passed across 70 files, of which 121 are new
and 41 are `PlaylistPane`'s, unchanged; `npm run typecheck`, `npm run lint` and `npm run
build:check`
clean, and `npm run build` in the desktop app; `python -m pytest src/tests/unit` — 4,308 passed, 45
skipped, unchanged because no Python file changed; `ruff check src/` and `ruff format --check src/`
clean; `PYTHONPATH=src python scripts/smoke_engine_health.py`, `check_no_qt_in_core.py` and
`check_desktop_version_coupling.py` all OK. The three failures in `test_code_quality_step_5_7.py`
are unrelated and predate this step. Electron E2E was not run: no main-process or preload file
changed here, and the flows this step adds are covered by component tests that drive the same
events.

Four things this step deliberately did not do. It did not build the drag *source*: dragging rows
out of the table is ORG-11's, so the drop target is exercised here by the events that gesture will
send, through the one module both ends read. It did not make the Inspector editable (ORG-10) or add
the filter bar's save button (ORG-12) — both call ORG-08 routes this step deliberately left alone.
And it did not build the tag manager, which is ORG-12's, even though the tag icon it needs was
drawn here beside the one this step uses.

---

## ORG-10 — The Inspector Becomes Editable ✅ IMPLEMENTED 2026-09-08

**Objective**: DEC-047's read-only panel gains the first editable fields in CuePoint, and shows
where each value came from.

**User-visible result**: Rate a track, favorite it, write a note, tag it — from the Inspector.

**Dependencies**: ORG-08.

**Existing code reused**: `TrackDetailPanel.tsx` and its 411 lines of tests; `Toast` for failures;
the existing `useTrackDetail` fetch.

**Design**:

- The panel gains a **Yours** zone above the imported fields, visibly separate from them: stars
  (click to set, click the same star to clear), a favorite toggle, a notes field, and tag chips
  with add-by-typing and remove.
- **The effective value carries its source** (DEC-057): a rating reads as yours or as Rekordbox's,
  and an overridden rating offers "clear override" — the one control that makes the two-layer model
  visible instead of mysterious. Clearing falls back; it does not write zero.
- Rekordbox's comment and CuePoint's notes are both shown, labelled. The imported fields stay
  exactly as Phase 4 rendered them (DEC-047); the panel now has two zones and must never blur them.
- Notes save on a debounce with an explicit saved/saving state. **Optimistic updates roll back on
  failure with a toast** — a panel that shows a rating the engine refused is worse than a slow one.
- A **History** section lists this track's changes from ORG-08's history route: field, old, new,
  when, and whether it came from you or an import. Read-only in this phase; per-field revert is
  deferred with its reason below.
- With several tracks selected the panel still shows the last-clicked track and says how many are
  selected (DEC-045). Editing many at once is ORG-11's toolbar, not a multi-track editor here.
- Every control is keyboard-reachable and labelled; stars are a radio group, not five buttons with
  no name.

**Tests**: Setting and clearing a rating; the source label for each of the four
CuePoint/Rekordbox combinations; a failed save rolls back and toasts; notes debounce to one request;
tag add creates-or-reuses and tag remove unassigns; the History section renders an import change
and a user change differently; the read-only zone is unchanged from its Phase 4 tests; multi-select
shows the count and does not offer a multi-track edit.

**Acceptance criteria / DoD**: Every CuePoint field is editable from the Inspector and survives a
restart; no imported field is editable; the panel never displays a value the engine rejected.

**Risks**: Medium. Optimistic UI over a real write is where "it looked saved" bugs come from.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-08

**Outcome**: Complete. The Inspector is two zones. `TrackYours.tsx` is CuePoint's own layer — stars,
a favorite, a note and tag chips — over `useTrackMetadata.ts` and `useTrackTags.ts`;
`TrackHistorySection.tsx` shows what has happened to the track, over `useTrackHistory.ts`;
`trackEdits.ts` holds every sentence the two-layer model is made of. `TrackDetailPanel.tsx` composes
them above its Phase 4 fields, which did not change. No engine file changed: this is ORG-08's API
being used, as ORG-09 was.

**The old promise was kept while the new one was made.** DEC-047 said read-only was the whole
design, and gave the reason: nothing in the build owned a write path, so an editable field would
have been a lie. ORG-10 does not take that back by making those fields editable — it puts a second
zone above them. Every one of LIBUI-09's field tests passes unchanged; the one that had to move is
the one that said *the panel* offers nothing to type into, which stopped being true the moment
CuePoint had something of its own to say. It now names the imported zone, and asserts that zone
holds no textbox, no radio and no button at all.

**Which layer is showing is a sentence, not an icon.** DEC-057 keeps two ratings and resolves them
at read time, and the resolution is worthless if the panel will not say which one it resolved to.
So there are four sentences and they are different: *Yours — Rekordbox's is ★★★*, *Yours —
Rekordbox never rated it*, *Rekordbox's*, *Not rated*. The first is the one that earns the module:
without naming what is underneath, "clear" is a control whose result cannot be predicted. Which is
why the clear control's own label changes — **Clear override** when something is underneath it,
**Clear rating** when nothing is, and absent when there is nothing of yours to clear. Clearing falls
back; it never writes a zero, and a zero of yours never falls through to Rekordbox's.

**Clicking a star that is already lit is not always a clear.** The toggle compares against *your*
rating rather than the effective one. With Rekordbox's four stars showing and no override of yours,
clicking the fourth star writes your own four — which looks like nothing happened until the line
underneath changes, and is exactly right: you have said this is a four, and it stays a four when the
next refresh changes Rekordbox's mind. That is the whole of DEC-057 in one gesture.

**The panel is optimistic, so the interesting half of it is the rollback.** A rating that waits for
a round trip is a rating a user clicks twice, so every control shows its result at once — and the
price of that is a panel that can be wrong. The hook keeps two copies, what the engine last
confirmed and what is on screen, and a refusal puts the confirmed value back and says why in the
engine's own words. The restore is **per field**: a note being typed while a rating fails is not
part of that failure, and a rating restores all three of its fields, because the effective value and
its source are derived from it and a half-restored rating labels itself wrongly.

**A note is never lost, and the debounce is not what guarantees that.** Typing settles for 600 ms
before one request goes out, and the timer resets with each keystroke — a debounce, not a throttle,
which is the difference between one request and one request per 600 ms carrying half a sentence.
What actually makes it safe is the flush: leaving the field sends what is waiting, and so does the
panel going away. Clicking the next track is precisely the moment a user believes their note was
saved, and the pending write goes out **against the track it was typed against**, with the id read
from a ref rather than from the render that is already showing something else.

**Tags are created-or-reused by the engine, never by the renderer.** `createTag` is
`TagService.create_or_get`, which matches ignoring case against the unique index, so typing
`peak-time` when `Peak-time` exists returns the tag that exists. The renderer's vocabulary is for
*suggestions* only and never decides: a copy that is seconds old would answer the same question
differently, and the answer would be a second tag that should not exist. The chips are optimistic in
the direction that works — a removal disappears at once and comes back if the engine refuses, while
an addition waits for the tag to have an id, because a chip with nothing behind it cannot be removed
again.

**The history says who, and re-reads rather than appending.** A change of yours and one an import
made are drawn differently, and `cuepoint_rating` is labelled "Your rating" where `rating` is
labelled "Rekordbox rating" — two rows both reading "Rating" would destroy the one distinction the
section exists to draw. A tag or a favorite becomes a sentence rather than a diff, because
`null → "Peak-time"` is a diff and *Tagged Peak-time* is what happened. After every accepted write
the section re-reads: the engine decides what counts as a change, and re-saving the same note
records nothing at all, so an entry appended here would be one that does not exist. There is no
revert, deliberately — `REVERTABLE_FIELDS` covers Rekordbox's columns, CuePoint's live in another
table, and a revert that worked for four fields and refused for three teaches the wrong thing about
what history is.

**Two things the step added beyond its own controls.** The Collections holding the track are listed
beside the Rekordbox playlists and open the table on one — ORG-08 put that field in the detail
payload and nothing had ever read it. And with several tracks selected the panel says, in the same
line as the count, that edits here change the one it is showing: editing twelve thousand at once is
ORG-11's toolbar, and a control that quietly applies to one when a user believed it applied to all
is not recoverable (DEC-008).

**A bug ORG-09 shipped, found on the way and fixed.** `CollectionsPane.css` named four tokens that
do not exist — `--border-subtle`, `--fg-secondary`, `--bg-elevated`, `--bg-base` — all plausible,
none of them in `tokens.css` or in any theme. An undefined custom property with no fallback is not a
compile error, not a lint error and not a visible one: the declaration is thrown away at
computed-value time, so a border vanishes and the pane looks *nearly* right. TypeScript, oxlint, the
production build and every component test were all silent about it. It is fixed, four more in
`LogViewerDialog.css` with it, and `test_renderer_css_tokens.py` now refuses the whole class —
along with a theme-parity check, since a token one theme defines and another does not is the same
hole with a different shape. It lives in the Python suite because the renderer deliberately has no
Node types and Vite's SSR pipeline hands back an empty string for a CSS import however it is
queried, so a Vitest file cannot read a stylesheet at all.

**Three numbers and two vocabularies belong to the engine, and a test says so.**
`test_inspector_field_contract.py` holds `NOTES_MAX_LENGTH`, `TAG_NAME_MAX_LENGTH` and
`RATING_STARS` to `MAX_NOTES_LENGTH`, `MAX_TAG_NAME_LENGTH` and `MAX_RATING`; every field the
services record to a label a person can read; and the `rating_source` strings the panel *branches
on* to the ones `rating_source` returns. Each drifts into a different wrong: a generous limit turns
a refusal the field could have prevented into a failure after the whole note was typed; a missing
label prints a column name in the panel whose purpose is not printing column names; a mismatched
source labels the wrong layer as yours.

**Guards: 59 of 59 fail when the thing they protect is broken.** The model, nineteen ways: a rating
of yours that does not say what it is covering, Rekordbox's presented as yours, a zero underneath
read as no rating, a missing rating read as a zero, a clear that calls itself an override over
nothing, a clear offered when there is nothing of yours, the chosen star failing to clear, the
effective value and its source not recomputed while a write is in flight, a zero falling through to
Rekordbox's, an emptied note stored as an empty string, one star described as several, your rating
labelled as Rekordbox's, a change of yours not told from an import's, an untagging recorded as a
tagging, an unfavoriting as a favoriting, an absent value drawn as a gap, a note filling the panel
rather than being cut, and a source that goes unnamed. The engine's own limits and vocabularies,
five ways: each of the three numbers drifting, and a field of either kind losing its label. What is
on screen versus what the engine has, eleven ways: stars that wait for a round trip, a refused write
left showing, a rolled-back rating keeping the failed write's label, a refusal swallowed, a failure
reported as a save, a throttle in place of a debounce, a blur that sends nothing, a note abandoned
and lost, a note written against whichever track is showing now, a field that never says it saved,
and a fresh read leaving the previous value in place. Tags, six ways: a tag created and never
assigned, a chip that stays after a refused assign, one that stays gone after a refused unassign,
the same name in another capitalization asked for again, a tag already carried suggested again, and
a vocabulary that cannot be read reported as a failure. The controls, eight ways: stars showing only
your own layer, Rekordbox's rating that cannot be adopted, arrow keys that do not move, every star a
tab stop, a group with no name, a favorite that does not say whether it is on, Enter that does
nothing, and a remove button with no name of its own. The two zones, seven ways: the imported rating
row showing the resolved value, nothing saying whose those fields are, a selection of many not
saying the edits change one, a Collection that cannot be opened, the Collections and the playlists
counted as one list, a history that does not re-read after a write, and an editor kept across a
change of track. And the reads, three ways: a history asking for a life story, a build with no
history route saying nothing has ever happened, and a stylesheet naming a token nothing defines.

Six of those started as survivors. Two were the same shape — nothing distinguished a debounce from a
throttle, because the `waiting` ref makes a stray timer a no-op, and nothing had ever re-read the
same track — and both closed with a test. Two were failures nobody was watching: an addition the
engine refuses at the *assign* step, and a history that never re-read. One was the editor's
identity:
the panel keys it by track, and nothing said what that is for, so a half-typed tag name now has to
be gone after the panel moves on. The sixth was a mutation that was not one — adding a second flush
after the first has already cleared what was waiting changes nothing — and it was replaced with the
mistake it was reaching for: keeping the ref current during render, so the note goes to the track
that is showing rather than the one it was typed against.

**Verification**: `npm test` in the renderer — 1,628 passed across 72 files, 100 of them new and
two of the files; `npm run typecheck`, `npm run lint` and `npm run build:check` clean, and `npm run
build` in the desktop app; `python -m pytest src/tests/unit` — 4,320 passed and 45 skipped, twelve
of the passes new; `ruff
check src/` and `ruff format --check src/` clean; `PYTHONPATH=src python
scripts/smoke_engine_health.py`, `check_no_qt_in_core.py` and `check_desktop_version_coupling.py`
all OK. The three failures in `test_code_quality_step_5_7.py` are unrelated and predate this step.
Electron E2E was not run: no main-process or preload file changed, and every route this step calls
was already carried through all six contract files by ORG-08.

Four things this step deliberately did not do. It did not add a **revert** to the History section,
for the reason above and stated in the phase's own preamble. It did not change the **table's Rating
column**, which is still Rekordbox's own value — the resolved one reaching the grid is ORG-11's, and
a column that quietly changed whose value it shows is exactly what this panel spent a zone
avoiding. It did not build the **tag manager** — rename, recolour, merge, delete with counts — which
is ORG-12's, beside the filter bar that uses the vocabulary. And it did not touch the changelog,
which Phase 6 has been holding for ORG-13 since ORG-07.

---

## ORG-11 — Selection Actions, the Context Menu, and the Batch Path ✅ IMPLEMENTED 2026-09-08

**Objective**: Make DEC-045's selection model earn its shape: act on one track, twelve, or every
track matching a query.

**User-visible result**: Right-click a track — or select 12,000 — and tag, rate, favorite, or add
them to a Collection.

**Dependencies**: ORG-08. Reads best after ORG-09 (the drop target) and ORG-10 (the vocabulary).

**Existing code reused**: `components/TrackContextMenu.tsx` (already keyboard-navigable, already
themed, already carrying Play Next and Add to Queue from DEC-013); `screens/library/
SelectionActions.tsx` (copy and reveal); `followJob.ts` for job progress; the status strip.

**Design**:

- The context menu gains, below the playback entries: **Add to Collection…**, **Tag…**, **Rate ▸**,
  **Favorite**, and — only in a Collection scope — **Remove from this Collection**. Copy and reveal
  stay. Order is playback first, because that is the gesture DEC-013 made first-class.
- "Add to Collection…" opens a picker over the tree with type-ahead. With 200 Collections a
  submenu is a list nobody can navigate; with three it still reads fine.
- The selection toolbar offers the same operations for the current selection, with its count. One
  vocabulary for both surfaces, calling ORG-07's one entry point.
- **An "everything matching" selection sends the query** (DEC-045, DEC-063), starts a job above the
  threshold, and follows it in the status strip. Below the threshold it applies inline.
- A batch above the threshold **confirms first, naming the count and the operation**. Not because
  it is destructive to tracks, but because "add 47,913 tracks to a Collection" is rarely what
  someone meant to click.
- The result is a toast saying what happened to how many, and an activity event behind it. There is
  no undo (DEC-008); the History tab is what the toast points at.
- Table rows become a **drag source**, so a selection can be dropped onto a Collection in the pane.
  Inside a Collection scope, dragging rows **reorders** the Collection and writes positions.
- Nothing here can modify a Rekordbox playlist, and nothing offers membership operations on a Smart
  Collection (ORG-06 refuses them; the UI does not offer them either).

**Tests**: The menu shows the right entries per scope, including "Remove from this Collection" only
inside one. An id-selection operation and an everything-matching operation both call one service
path with the right payload. Above-threshold confirms and starts a job; below applies inline. A
failed batch toasts and leaves the table consistent. Row drag onto a Collection adds; drag within a
Collection reorders and persists; drag onto a Rekordbox playlist is refused. Keyboard access to
every action.

**Acceptance criteria / DoD**: Every organization operation is reachable by keyboard and by mouse;
a 47,913-track operation never materializes ids in the renderer; the table and the pane agree about
what happened without a manual refresh.

**Risks**: Medium-high. The everything-matching path is easy to get subtly wrong in a way that only
shows at scale, which is why ORG-13 measures it rather than trusting a fixture.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-08

**Outcome**: Complete. `trackMenu.ts` is the list of operations, `libraryBatch.ts` the shape and
the sentences, `useLibraryBatch.ts` the one path that runs them, `PickerDialog.tsx` the way a
Collection or a tag is chosen out of hundreds. `TrackContextMenu.tsx` learned submenus,
`TrackTable.tsx` learned to be a drag source and a reorder target, `SelectionActions.tsx` gained
a single Actions button, and `collectionTree.ts` gained the rules for when a Collection can be
rearranged. One engine change, below.

**DEC-045's shape was one field short, and it showed the moment a user interface used it.** A
described selection is "everything matching, *minus the three I clicked out*" — that minus is in
the renderer's model and in the count on screen, and `BatchSelection` had nowhere to put it.
Sending the query alone applies the batch to tracks the user deselected; sending the ids instead
puts 47,913 numbers on the wire, which is the mistake the shape exists to prevent. So
`BatchSelection` gained `exclude_track_ids` on its query branch — bounded by what a person can
click, refused beside a list of ids (which already says exactly what it means), and refused as a
whole when it excludes everything it matched, because a batch over nothing is a request that
cannot be honoured rather than a batch of zero. It is the only engine change in the step, and it
needed no new route: the desktop path forwards the selection without looking at it, so the sweep
was the two type declarations, which a contract test now compares field for field.

**One vocabulary for both surfaces is a fact about a module, not a promise about two
components.** `organizationMenuItems` builds the array; the row menu appends it under the
playback entries, and the toolbar's Actions button opens *the same menu* with the same array.
The alternative — a toolbar with its own five buttons — is a second list that drifts, and the
drift is invisible until someone compares two menus side by side.

**The context menu grew submenus rather than six more rows.** A rating is six choices, and a
menu that already had nine entries would have had fifteen. The submenu costs the keyboard
nothing: ArrowRight opens, ArrowLeft closes, Escape closes the child before the parent, and
while one is open *every* key belongs to it — otherwise the parent list moves underneath
somebody who is reading the child.

**"Add to Collection…" and "Tag…" are one dialog.** With three Collections a submenu reads fine
and with two hundred it is a list nobody can navigate; a tag vocabulary is worse and grows
faster. So both go through a filter box over a list, and the difference between them is data:
the tree indents and draws its folders and Smart Collections as unchoosable — a tree with those
removed is a list whose indentation lies — while a tag can be *made* by typing a name, because
`create_or_get` makes that the whole gesture. A Collection cannot be made here: a new one needs
a place in the tree, and this dialog has no way to ask about one.

**The confirmation is about scale, not about damage.** Nothing here deletes a track. But "add
47,913 tracks to a Collection" is rarely what somebody meant to click, and DEC-008 chose history
over an undo stack, so the way back is reading what happened rather than reversing it — which
the dialog says, and the toast repeats for any batch that changed more than one track. It asks
at exactly the number the engine forks a job at: a confirmation for work that finished on the
request thread is a warning about nothing, and a job started without one is the opposite
mistake. A test holds the two numbers together.

**The toast reports what happened, not what was asked for.** `changed` and `unchanged` are
different sentences — "tagged 40 tracks, 12 already had it" is true and "tagged 52 tracks" is
not — and each operation has its own words for both halves, so "were already ★★★" and "were
already there" never become one generic clause. A batch that stopped halfway says so first.

**A reorder moves one row, and the reason is not a shortcut.** `reorder_entry` takes a
*position*, and the only position the renderer can know without reading a whole membership is
the one the drag started from: the table shows a window, so the row index of any *other*
selected track is simply not in hand. Rather than fetch 50,000 entries to find out, a multi-row
drag inside a Collection is refused with a sentence. The other three refusals are about what a
position means: sorted by BPM, or narrowed by a search or a filter, a row's place on screen is
not its place in the Collection, and writing one as the other scrambles the order silently. The
fourth is DEC-058's — a Collection holding a track twice collapses to one row at the earliest of
its positions, so index and position stop being the same number.

Every one of those refusals is **said out loud**, which is the opposite of ORG-09's rule and
deliberately so: there, a drop onto a folder was never offered because the user was aiming at
something else. Here they are already inside the Collection and have plainly said what they
meant, so a drop that quietly does nothing teaches them the feature is broken. Outside a
Collection the drop is not offered at all, because then they *are* aiming at the pane.

**A drag carries what the gesture means.** A row inside the selection carries the selection; a
row outside it carries itself — the rule the context menu has followed since PLAYER-09, because
dragging and right-clicking are the same gesture with a different hand. And a described
selection carries the *question*: a mime type with no ids in it at all, because the drop target
is the same page and reads the query itself. That last one is why the pane's drop callback
changed shape: `addTracksToCollection` takes ids and only the batch path takes a query, so a
47,913-track drop cannot go the way a three-track drop does. It returns `silent` when it went
the other way, so the pane does not announce an outcome it does not have.

**Two things are not offered, rather than refused.** Membership operations on a Smart Collection
— ORG-06 refuses them, so the menu does not list them and the picker draws them unchoosable
(DEC-061). And nothing here can touch a Rekordbox playlist: the mirror has no handlers to give
(ORG-09), and a selection dropped on it still gets the one loud refusal DEC-031 earned.

**Two pieces of dead code went with the step rather than staying.** `PickerDialog` guarded its
click handler against a row it had already marked `disabled`, which the DOM never lets through;
and `libraryBatch`'s rating formatter carried a null branch both its callers had already
narrowed away. A branch no test can tell from its absence is a branch that is not there.

**Guards: 65 of 65 fail when the thing they protect is broken.** The selection's shape, eleven
ways: a batch applying to the tracks a user took back out, a selection that is both ids and
exclusions, the exclusions never leaving the request body, an exclusion that is not a list taken
anyway, only one process declaring the field, a described selection sent as ids, the exclusions
dropped in the renderer, and the scope, the Collection, the filters or a cleared rating's null
lost on the way. What it says, nine ways: a confirmation with no count, one track described as
several, a toast counting what it looked at rather than what it changed, the unchanged and the
failed going unmentioned, a batch that stopped halfway reported as finished, nothing pointing at
the History, two operations sharing one verb, and the renderer confirming at a number the engine
does not fork at. What the menu offers, six ways: removing from a Collection offered outside
one, the Collection unnamed, a menu for nothing selected, a clear that writes a zero, two
favorite entries doing the same thing, and the organization block running into the playback one.
The submenu, six ways: a parent that acts instead of opening, ArrowLeft closing the whole menu,
the arrows moving the parent while a child is open, a parent that does not say it opens one,
ArrowRight that does not open it, and a child that stays open when the pointer leaves. The
picker, six ways: a case-sensitive filter, a folder that can be chosen, a keyboard that lands on
rows that cannot be, Enter that does nothing, a highlight left on a row the filter removed, and
an offer to make a tag that already exists. The table's rows, three ways: every table's rows
draggable, a drop always landing above the row it was over, and a refused drag marked and
accepted. Running it, five ways: forty thousand tracks starting without a question, a
confirmation that applies nothing, a job whose counts are never read, a failed batch leaving the
table stale, and a refused write reported as one that happened. Rearranging, nine ways: any
ordering allowed, a filtered view allowed, duplicates allowed, a row landing one place short, a
refusal that is a silent false, several rows moved from one known position, the entry read from
the top rather than from the drag, a rearranged Collection not re-read, and a reorder offered
outside a Collection. And the page's own wiring, ten ways: a right-click outside the selection
acting on it, a described selection dragged as ids, a dragged row taking a selection it is not
in, the table and the pane left stale after a batch, a query dropped as ids, the toolbar acting
on a row, a divider along the top of the toolbar's menu, the pane inventing an outcome, a drag
carrying both read as ids, and a query selection not recognized as tracks at all.

Seven of those started as survivors and each closed with a test: nothing had set a filter and
watched it travel; nothing compared the past-tense verbs, so "Removed 40 tracks" could have read
"Added"; every reorder test dragged the first row, where the offset is zero either way; every
drag test dragged a row that was *in* the selection; nothing counted the dividers in the
toolbar's menu; and nothing checked that the pane stays quiet about a batch it did not run. The
seventh was the picker's disabled row, where the test was clicking a button the DOM had already
disabled — the guard beside it was the dead one, and the mutation now removes the attribute that
actually does the work.

**Verification**: `npm test` in the renderer — 1,776 passed across 76 files, 148 of them new and
four of the files; `npm run typecheck`, `npm run lint` and `npm run build:check` clean, and `npm
run build` in the desktop app; `python -m pytest src/tests/unit` — 4,330 passed and 45 skipped,
ten of the passes new; `ruff check src/` and `ruff format --check src/` clean; `mypy` on the two
changed modules reports the same 22 pre-existing `no-any-return` findings it reported before the
step and no new ones; `PYTHONPATH=src python scripts/smoke_engine_health.py`,
`check_no_qt_in_core.py` and `check_desktop_version_coupling.py` all OK. The three failures in
`test_code_quality_step_5_7.py` are unrelated and predate this step. Electron E2E was not run:
`engineClient.ts` changed, but only by gaining an optional field on a type it already forwards
without inspecting, and no preload channel, IPC handler or supervisor method moved.

Four things this step deliberately did not do. It did not add **multi-row reordering**, for the
reason above — the positions are not in hand, and reading a membership to find them is the thing
DEC-040 spends the whole phase avoiding. It did not build the **filter bar's save button or the
tag manager**, which are ORG-12's. It did not **measure the everything-matching path at scale**;
ORG-13 does that, which is why its risk note says so. And it did not touch the changelog, which
Phase 6 has been holding for ORG-13 since ORG-07.

---

## ORG-12 — The Filter Bar Saves a Smart Collection ✅ IMPLEMENTED 2026-09-12

**Objective**: Close DEC-043's loop — the rules a user builds to narrow the table become a saved
Smart Collection without being rebuilt in a different vocabulary.

**User-visible result**: Filter to what you want, name it, and it is in the tree.

**Dependencies**: ORG-08. Reads best after ORG-09.

**Existing code reused**: `FilterBar.tsx` and its 492 lines of tests; `useFilterVocabulary` and
`useFacet`, which already drive the bar from the engine's field list — so new fields appear because
the engine describes them, not because the bar hard-codes them.

**Design**:

- The bar offers the new field kinds with controls that fit them: tag chips backed by the tag
  facet, a favorite toggle, a rating control that can address the effective value or either layer,
  and a Collection picker for membership rules.
- **"Save as Smart Collection"** takes the current rule set, a name and a folder, and writes it
  (ORG-06). This is the moment LIBUI-02's "Phase 6 inherits the model" becomes true; if anything
  has to be translated here, DEC-043 was not honored and the step stops rather than translating.
- Opening a Smart Collection **loads its rules into the bar**, visibly the same rules a user would
  have built by hand.
- Editing the bar while a Smart Collection is open does **not** silently rewrite it: the bar shows
  it is modified and offers "update the Smart Collection" or "keep as a filter". Silently rewriting
  a saved rule set because someone narrowed a view is the kind of quiet mutation this project keeps
  refusing.
- A **tag manager** — rename, recolour, categorize, merge, delete with usage counts — lives here
  rather than in Settings, because tags are a browsing vocabulary and this is where it is used.
- Refusals from the engine render as messages naming the clause, never as an empty table.

**Tests**: A rule set built in the bar and saved produces the same tracks as the same rules
unsaved. Opening a Smart Collection round-trips its rules into the bar. Editing shows modified and
does not write until asked. Tag chips reflect the facet, and choosing one tag leaves the others
choosable. The tag manager's merge and delete confirm with counts. The bar offers exactly the fields
the vocabulary endpoint describes and no others (the test that keeps the renderer honest about
DEC-043).

**Acceptance criteria / DoD**: No rule the bar can build is rejected by the engine, and no field the
engine offers is missing from the bar; saving requires no translation step.

**Risks**: Medium. The named risk is the bar growing its own idea of what a field means, which the
vocabulary-driven test forbids.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-12

**Outcome**: Complete. `filterText.ts` gained the three field kinds it had been dropping,
`smartFilter.ts` is the model for "these rules, and the Collection they came from",
`tagManager.ts` the vocabulary's own sentences, and `FilterBar.tsx` the controls and the
save button. `SaveSmartDialog.tsx` names a filter and gives it a place; `TagManagerDialog.tsx`
renames, recolours, categorizes, merges and deletes. One engine change, below.

**DEC-043 was only half kept, and the missing half was ours.** The rule was that a renderer must
not be able to build a clause the engine refuses, and the engine answers with the field list so
it cannot. The other direction had no rule: ORG-05 taught the engine to filter by tag, by
Collection membership and by favorite, the vocabulary endpoint described all three, and
`buildableFields` filtered them straight back out — honest while there were no controls for them,
and a feature nobody could reach afterwards. The bar now offers the engine's whole answer, and
two tests hold it there: one compares the field select's options against the vocabulary, and one
in the Python suite asserts the renderer has a branch for every kind in `FIELD_TYPES`. The
acceptance criterion is those two assertions rather than a reading of the code.

**The one engine change is the engine saying what a number means.** A rating is stars, and the
bar has to know that to draw five of them instead of a box to type `4` into. The version of this
that does not involve the engine is a list of rating field names in the renderer — which is
exactly the risk this step's own note names, and which would draw a number box beside the fourth
layer on the day one is added. So `FieldSpec` gained `unit`, `describe_fields` sends it for every
field, and the three rating layers declare `UNIT_STARS`. The renderer's `isStars` compares
against the unit and never against a name, which is what gives DEC-057's two layers and the
effective value one control between them. A field with no unit is a plain value, and so is a unit
this build does not recognize — so the next unit the engine declares is additive rather than a
break.

**The contract sweep found a drift nothing had caught.** `engineClient.ts`'s copy of
`LibraryFilterField` still said `type: "text" | "number" | "date"`, three kinds behind ORG-05.
The desktop contract test compares the two copies field for field now, and compares the kinds on
the `type:` line, so the next one cannot go unnoticed. The same sweep closed a second gap: the
facet endpoint has taken a scope since ORG-08 and the bridge could not pass one, so a tag list
opened inside a Collection would have offered the whole library's tags — every one of which
empties the table the moment it is chosen.

**Opening a Smart Collection loads its rules, and editing them does not rewrite it.** The bar
holds one rule set. While it is still what the Collection saved, the table asks for the
Collection *by id* — the `scope: "smart"` path ORG-08 built — so the engine resolves the saved
rules and they are not sent twice. The moment the rules differ, the table asks for the rules on
screen instead, because a user who takes a clause out and sees the same rows has been told
nothing about what they just did. The bar says "modified, not saved" and offers three things:
update the Collection, save a second one, or keep the rules as a plain filter. None of them is
the default, because narrowing a saved question is something people do all day and rewriting one
is something they do deliberately, and a build that guessed between them would lose work nobody
knew they had.

**Saving translates nothing, and that is asserted rather than reviewed.** The rule set that
crosses the wire is the object the bar handed over — `toEqual` against what the table was asked
with a moment earlier, in the page's own test. LIBUI-02 said Phase 6 would inherit the filter
model rather than convert it; a conversion step here would be a second definition of what a rule
means, and the two would drift the first time either changed.

**A tag and a Collection are chosen, never typed.** Both are named by id in a rule, because both
can be renamed and a saved question that changed meaning when somebody fixed a spelling would be
worse than one that kept it (ORG-05). So a tag is a row of chips built from the tag facet, with
the count beside each; a Collection is the tree, indented, with its folders drawn and
unchoosable — the same rule ORG-11's picker follows, because a tree with its folders removed is a
list whose indentation lies. A chip still *reads* as the name: the page has both vocabularies and
hands the lookup to the bar, and an id whose row is gone says so in words rather than showing a
number.

**The tag manager lives beside the filter bar rather than in Settings.** A tag is a browsing
vocabulary, and the moment anyone notices "Peak Time" and "Peak-time" are two tags is the moment
they are filtering by one of them. Nobody goes to Settings to fix that. Every tag carries the
engine's usage count, which is what makes the two destructive gestures answerable: "delete
Peak-time" is a click and "take Peak-time off 412 tracks" is a decision, and only one of them is
a question. Both confirm with the number; neither is offered for a tag merging into itself, which
the engine refuses anyway. A save sends only the fields that changed, because the update route
writes a column when its key is present and three keys would record three history rows for one
rename.

**A refusal names its clause instead of emptying the table.** The engine's rule errors already
name the field and the operator — `FilterRuleError` was built to, so a user can find which of six
filters was refused. What reached them was "No tracks match this search." under an empty table,
with the real message tucked beside the Columns button. The message now sits in the bar, beside
the chips that caused it, with the retry; and the table's empty state is the refusal rather than
a sentence about matching.

**Two things that look like scope creep and are not.** `useTrackDetail` gained a `reload`,
because renaming a tag changes a chip on every track that carries it and the Inspector would
otherwise show a name that no longer exists until the selection moved. And `useCollectionTree`'s
`saveSmart` gained the parent it never had — ORG-09 wrote the call with no way to say where the
node goes, which was fine while nothing called it.

**Guards: 86 of 86 fail when the thing they protect is broken.** What a field means, six ways:
the vocabulary no longer saying what a number is, a rating layer losing its unit, the renderer
naming the unit itself, the renderer deciding for itself which fields are ratings, one process
describing a field the other does not, and the two disagreeing about which kinds exist. What can
be built, six ways: the bar dropping the kinds it once had no control for, a favorite sent as
the word rather than the boolean, a tag sent as whatever was typed, a zero or a negative id sent
anyway, a list of ids crossing as text, and a value carried from one kind to another. What a
chip says, five ways: a membership chip showing the id, a deleted row shown as a bare number, a
tag claimed deleted while the names are still loading, a Collection id read out of the tag names,
and a favorite reading `true`. The controls, ten ways: a tag or a Collection typed rather than
chosen, a folder choosable, a rating typed as a number, no way to ask for unrated, chips that do
not say which is chosen, ids offered as text suggestions, an operator taking one value collecting
several, a chosen chip that cannot be let go, a list collecting the same id twice, and the
membership operators reading as identifiers. The rules and their Collection, eleven ways: one
more clause reading as unchanged, a changed value reading as unchanged, a range compared by
identity, all-of and any-of reading alike, a Smart Collection resolved *and* its rules sent, an
edit leaving the table on the saved rules, the bar clearing a scope it does not speak for, the
bar not saying it has been changed, a rule set of nothing saved, and a name that is empty or too
long sent anyway. Saving and updating, ten ways: an update offered for an unmodified Collection,
no way to keep the rules without rewriting it, a name saved with its spaces, the folder dropped,
no folder possible at all, an update writing something else, the rules translated on the way, what
was just saved not opened, an update still reading as modified, and a failed save closing as
though it worked. The vocabulary's own sentences, fifteen ways: a save writing every column, a
category cleared with an empty name, a name saved untrimmed, a name or category the engine would
refuse sent anyway, an unknown colour offered and painted, a delete that does not say its count,
a costless delete warned about, a merge that hides the deletion or counts the wrong side, a
finished delete reporting the warning's number rather than the engine's, the uncategorized shown
first, a tag listed without its use, and the manager sorting the list it was handed. The
manager's behaviour, six ways: a delete or a merge on one click, answering no running it anyway,
a tag merged into itself, a save with nothing changed still writing, and an editor still showing
a row the write removed. And what a write or a refusal makes stale, twelve ways: the table, the
vocabulary and the Inspector each left unread after a tag changed, a refused write reported as
one that happened, a yes-or-no control buying a pass over the library, a field whose control
shows values never asking for them, a facet offering the library's values inside a Collection, a
facet not re-read when the scope changes, a bridge that cannot carry a scope, a refusal not shown
beside the clauses that caused it, no way to ask again, and a refusal reaching the user as an
empty table.

Eight of those started as survivors, and seven were holes in the tests rather than in the code: a
one-clause filter made a reordering on the way to the engine invisible; nothing checked the save
dialog closes after a save that *worked*; the delete fixture gave the tag's usage count and the
engine's untagged count the same number, so reporting the wrong one looked right; two assertions
counted from zero where the vocabulary is read on mount anyway, so "read again" was already true;
and nothing covered the Inspector re-reading after a rename, the facet re-reading on a scope
change, or the table's empty state carrying a refusal. The eighth was a mistake in the harness:
`tags.slice().sort()` copies exactly as `[...tags].sort()` does, so the mutation was equivalent
rather than a defect, and it was replaced with the in-place sort that is one.

**Verification**: `npm test` in the renderer — 1,970 passed across 80 files, 194 of them new and
four of the files; `npm run typecheck`, `npm run lint` and `npm run build:check` clean, and `npm
run build` in the desktop app; `python -m pytest src/tests/unit` — 4,346 passed and 45 skipped,
sixteen of the passes new; `ruff check src/` and `ruff format --check src/` clean; `mypy` on the
one changed module reports the same 11 pre-existing findings it reported before the step and no
new ones; `check_no_qt_in_core.py`, `check_desktop_version_coupling.py` and
`smoke_engine_health.py` all OK. The three failures in `test_code_quality_step_5_7.py` are
unrelated and predate this step. Electron E2E was not run: `engineClient.ts` and
`engineSupervisor.ts` changed, but only by widening two type declarations on payloads they
already forward without inspecting, and no preload channel, IPC handler or supervisor method
moved.

Three things this step deliberately did not do. It did not add **`match: "any"`** — the engine
declares and refuses it (DEC-016), and a bar that offered it would be offering a clause the
engine refuses, which is the one thing DEC-043 exists to prevent. It did not build the **nav
destination, the empty states at scale, or the end-to-end journey**, which are ORG-13's. And it
did not touch the changelog, which Phase 6 has been holding for ORG-13 since ORG-07.

---

## ORG-13 — The Page Comes Together

**Objective**: The phase as one thing: the nav destination, the empty states, the numbers at scale,
the documentation, and the end-to-end journey.

**User-visible result**: Organization is a feature of CuePoint rather than a set of parts.

**Dependencies**: ORG-09, ORG-10, ORG-11, ORG-12.

**Existing code reused**: `navRegistry.ts` and `lastDestination.ts` (whose test currently uses
`collections` as its disabled-destination fixture and will need a different one — noted here so it
is not discovered as a mystery failure); `docs/user-guide/performance.md` as the place measurements
live; `e2e/libraryJourney.spec.ts` as the model for the new spec.

**Design**:

- **Enable the `collections` destination** (DEC-062): it resolves to the Library page with the
  Collections section focused. DEC-027's last-visited memory must resolve **one** page, not two ids
  competing for it — the rule is stated and tested.
- Empty states throughout: no Collections yet; a Smart Collection matching nothing (with its rules
  shown, so the user can see *why*); an untagged library; a Collection whose tracks were all
  removed by a refresh.
- **Scale measurement**, recorded in `docs/user-guide/performance.md`: 50,000 tracks, 200
  Collections in a tree, 40 tags, 200,000 tag assignments, a 5,000-entry Collection. Measure browse
  with a membership rule, browse with a tag rule, tag facets, the collections tree read, a
  reorder, and a 47,913-track batch. Numbers are measured or not claimed.
- **Backup and restore verification** (cross-cutting fact 2): a backup taken after this phase's
  data exists restores Collections, tags and metadata intact. This is the first phase where a
  restore is worth anything, and the first where it could be silently incomplete.
- **The DEC-011 warning, finally non-zero**: a refresh that would delete tracks a Collection holds
  shows the warning it has been able to show since Phase 3 and has never had reason to.
- Documentation: a user-guide page for organization; the DEC-064 sentence stated plainly — CuePoint
  organization is invisible in Rekordbox until export exists — next to the existing note about two
  collection imports that can disagree (DEC-030); `docs/release/CHANGELOG.md` under `Unreleased`;
  ADR only if an architectural boundary moved.
- **E2E** (`e2e/organization.spec.ts`): create a folder and a Collection, drag a selection into it,
  reorder it, tag the selection, rate one track, save a filter as a Smart Collection, freeze it,
  then run a refresh whose deletions hit the Collection and see the warning.

**Tests**: The nav destination resolves one page; `lastDestination` remembers it correctly; every
empty state renders from a real engine response rather than a mocked shape; the E2E journey passes
in a packaged build.

**Acceptance criteria / DoD**: The phase-level acceptance below, in full, in a packaged build.

**Risks**: Medium. Last steps carry whatever the earlier ones deferred; the measurements are where
that shows up.

**Complexity**: **L**

---

## Phase-level acceptance

Phase 6 is complete when, in a **packaged build**:

1. A rating, favorite, note and tag applied to a track survive an import, a refresh, a restart and
   a backup/restore cycle — and no Rekordbox-owned field was written (DEC-057, DEC-064).
2. Collections and folders can be created, renamed, moved, reordered and deleted; a delete states
   what it removes before removing it; and no Collection operation ever deletes a track.
3. A track can be added to a Collection twice on purpose and once by accident is refused with a
   count (DEC-058), and membership order is preserved and reorderable.
4. Tags can be created, applied, renamed, recoloured, categorized, merged and deleted, with usage
   counts visible at every destructive step.
5. A filter built in the Library bar saves as a Smart Collection with no translation, evaluates
   live, duplicates independently, and freezes into a static Collection (DEC-043, DEC-061).
6. No rule the UI can build is rejected by the engine; a rule naming a Smart Collection, a deleted
   Collection or a deleted tag is refused or reported with the clause named (DEC-060).
7. An operation over "everything matching" a 47,913-track query runs as a cancellable job with
   visible progress, writes per-field history under one batch id, records one activity event, and
   never materializes ids in the renderer (DEC-045, DEC-063).
8. The Inspector edits CuePoint's fields, shows each effective value's source, keeps every imported
   field read-only, and shows the track's change history (DEC-047, DEC-008).
9. A refresh that would delete tracks held by a Collection shows DEC-011's warning with real
   numbers.
10. Rekordbox playlists remain read-only by every path, including drag (DEC-031), and browsing still
    goes through one query path a window at a time (DEC-023, DEC-040).
11. Scale numbers are measured and recorded; full Python suite, renderer gates (`npm test`,
    `typecheck`, `lint`, `build:check`), E2E, Qt guard, version coupling and the desktop-contract
    test all pass.
12. No decision in DEC-001…DEC-064 is contradicted. Per the process, a contradiction stops the work
    and gets raised rather than worked around.

## Deferred, with reasons

- **Per-field revert of CuePoint values** — Phase 7. `revert_field_change` exists and works on
  Rekordbox-owned columns through `REVERTABLE_FIELDS`; CuePoint's fields live in another table and
  reverting them needs a second write path. DEC-063 explicitly requires only that the batch id be
  written, so the capability is preserved without the UI. The History tab shows the changes today;
  a disabled revert with a reason is honest, a broken one is not.
- **Exporting Collections, tags or ratings** — Phase 8 (DEC-064). Including whether a Smart
  Collection exports its current membership (DEC-061 left that open deliberately).
- **OR logic and nested rule groups** — DEC-016. The wire shape carries `match` and the compiler has
  one join point, so adding `any` later changes two places and migrates nothing.
- **A Smart Collection referencing another Smart Collection** — refused by DEC-060, not deferred:
  it would make membership depend on another query's current answer.
- **Sets, Chapters and the Set Builder** — Phase 10 (DEC-017). DEC-058 has already noted that the
  Collection/Set distinction now rests on what that phase adds.
- **Duplicates, missing files, artwork and library health** — Phase 7 (DEC-037). A Collection may
  hold a track whose file is gone, and nothing here claims otherwise.
- **inCrate's separate inventory database** — Phase 9 (DEC-030). Two collection imports that can
  disagree remain, and the user docs continue to say so.
- **`ResultsTable`, inKey and inCrate adopting `TrackTable`** — Phases 7 and 9 (DEC-041, DEC-021).
- **Renaming the legacy `-ui-lab-` storage keys** — its own change, because it touches persisted
  user state (`PIXEL_DESIGN_SYSTEM.md` §2). New keys added here do not extend the debt.
