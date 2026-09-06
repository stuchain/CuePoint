# CuePoint v1.0.0 — Phase 6: Organization, Detailed Step Specifications

Status: **Specified, none of it implemented.** ORG-01…ORG-13 below are the step inventory the
roadmap has carried as a placeholder since Phase 0. Per the process, no implementation happens from
this document — each step needs an explicit "Implement ORG-NN" instruction, scoped to exactly that
step, and its outcome is recorded under the step afterwards.

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

## ORG-01 — The Organizational Schema

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

---

## ORG-02 — Rating, Favorite and Notes

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
- `browse` and the track-detail read gain a `LEFT JOIN track_metadata`, so the table and the
  Inspector can show the effective rating and the favorite without a second query per row.

**Tests**: Validation refusals for each field, each naming the field. Clear-versus-zero. History
written on change and not on a no-op. The import/refresh guard above. The join returns nulls, not
missing rows, for a track with no metadata. Effective-value resolution over the four combinations
(neither, one, the other, both).

**Acceptance criteria / DoD**: A rating survives an import, a refresh and a restart; the browse
window carries effective rating and favorite at no measurable cost at 50,000 tracks; nothing writes
`tracks.rating` or `tracks.comment`.

**Risks**: Low-medium. The one real risk is the join's cost in the hot browse path, which is
measured rather than assumed.

**Complexity**: **M**

---

## ORG-03 — Tags

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

---

## ORG-04 — Collections, the Folder Tree, and the Reference Answer

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

---

## ORG-05 — Rules Reach CuePoint's Own Data

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

---

## ORG-06 — Smart Collections

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

---

## ORG-07 — Batch Edits as Jobs

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
  one transaction does not hold 47,913 rows. The consequence is stated rather than hidden: a
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

---

## ORG-08 — The Organization API and the Desktop Contract

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

---

## ORG-09 — The Collections Tree in the Library Pane

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

---

## ORG-10 — The Inspector Becomes Editable

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

---

## ORG-11 — Selection Actions, the Context Menu, and the Batch Path

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

---

## ORG-12 — The Filter Bar Saves a Smart Collection

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
