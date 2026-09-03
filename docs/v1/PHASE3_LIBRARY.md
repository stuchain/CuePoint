# CuePoint v1.0.0 — Phase 3: Persistent Rekordbox Library, Detailed Step Specifications

Status: **In progress.** LIBRARY-01…LIBRARY-04 are implemented; LIBRARY-05…LIBRARY-12
remain draft step specs in design-only mode.
Implementation of any step below requires an explicit "Implement LIBRARY-NN" instruction, scoped to
exactly that step, followed by tests, a completion report, and a stop before the next step.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`) and Phase 2 (`PHASE2_SHELL.md`), both complete, and on
Decision Rounds 1–5 (`DECISIONS.md`, DEC-001…DEC-037). Phase 3's own decisions are DEC-030…DEC-037,
alongside DEC-002 (identity), DEC-003 (delete on removal) and DEC-011 (warn when referenced).

## What this phase is

Today CuePoint reads a Rekordbox XML once per run and forgets it. This phase turns that into a
library: imported once, stored, and refreshed differentially against the same file.

**What this phase is not.** It builds no track table UI (Phase 4), no tags, ratings or Collections
(Phase 6), no missing-file or duplicate detection (Phase 7, DEC-037), and no export (Phase 8). It
does not move inKey or inCrate onto the library (DEC-036).

## What Phase 1 already built

The roadmap was written before Phase 1 landed and understates this. Read the code before writing
any of it again:

| Already exists | Where |
| --- | --- |
| DEC-002 identity resolution — TrackID, then normalized path, with a re-link flag | `models/library_track.py::resolve_identity` |
| Insert-or-update by identity, returning `(track, action, relinked)` | `persistence/track_repository.py::upsert_from_rekordbox` |
| `tracks` table, unique TrackID index, normalized-path index | `migrations/m0002_tracks.py` |
| Batch insert, paged reads, counts, search | `TrackRepository`, `LibraryService` |
| Durable job records with a `type` discriminator | `migrations/m0003_jobs.py`, `engine/jobs.py` |
| Job progress over SSE, and a status strip that displays it | `engine/job_events.py`, `components/shell/StatusStrip.tsx` |
| Activity feed and a panel that reads it | `services/activity_service.py`, `components/shell/ActivityPanel.tsx` |
| Nested playlist-tree parsing | `data/rekordbox.py::parse_playlist_tree` |

Phase 3 is the plumbing *around* these: parsing the rest of the XML, writing playlists, diffing,
deleting, and driving it all from a job.

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-034 | Capture rating, play count, colour, date added, comment, total time, bitrate | LIBRARY-01, LIBRARY-02 |
| DEC-038 | Total time lands in the existing `duration_seconds`, not a second column | LIBRARY-01, LIBRARY-02 |
| DEC-035 | The library remembers the XML it was imported from | LIBRARY-01, LIBRARY-04 |
| DEC-031 | Rekordbox playlists mirrored as read-only source data | LIBRARY-03 |
| DEC-002 | TrackID identity with a normalized-path fallback, re-links reported | LIBRARY-04, LIBRARY-07 |
| DEC-033 | Import and refresh run as background jobs | LIBRARY-05 |
| DEC-032 | Refresh previews the diff and applies on confirmation | LIBRARY-07, LIBRARY-09 |
| DEC-011 | Warn before deleting tracks a Collection or Set references | LIBRARY-08 |
| DEC-003 | Tracks absent from a re-import are deleted | LIBRARY-09 |
| DEC-030 | inCrate's inventory coexists, and the duplication is documented | LIBRARY-12 |

## Sequencing

```
LIBRARY-01 (schema: fields + source record)
      │
      ├──────────────┐
      ▼              ▼
LIBRARY-02      LIBRARY-03
(parse tracks)  (playlist schema + parse)
      │              │
      └──────┬───────┘
             ▼
      LIBRARY-04 (import service — first import)
             │
             ▼
      LIBRARY-05 (import as a background job)
             │
             ▼
      LIBRARY-06 (engine API + desktop contract)
             │
             ▼
      LIBRARY-07 (compute a refresh diff)
             │
             ├── LIBRARY-08 (reference-check seam, DEC-011)
             ▼
      LIBRARY-09 (apply a refresh)
             │
             ▼
      LIBRARY-10 (refresh API + contract)
             │
             ▼
      LIBRARY-11 (Library page: import, refresh, preview)
             │
             ▼
      LIBRARY-12 (scale verification and docs)
```

---

## Before starting any step — four cross-cutting facts

### 1. The desktop contract is six files, and it is enforced

LIBRARY-06 and LIBRARY-10 add engine endpoints. Per the invariant, and the test that now enforces
it (`renderer/src/api/desktopContract.test.ts`), each must move together:

Python `*_api.py` + `engine/server.py` · `engineClient.ts` · **`engineSupervisor.ts`** ·
`main.ts` · `preload.cjs` (the runtime preload) · `cuepointBridge.types.ts`.

The supervisor is the one that bit in SHELL-04: `main.ts` calls `engine.X()` on a facade that
forwards method by method, nothing type-checks the gap, and the failure appears only in the running
app. The contract test catches it now — run it.

### 2. Do not re-implement DEC-002

`resolve_identity()` and `upsert_from_rekordbox()` exist, are tested, and return the re-link flag
DEC-002 requires. A refresh diff must *use* them rather than write a second identity rule, or the
two will drift and the drift will be invisible until someone's tags land on the wrong track.

### 3. Two collection databases exist during this phase (DEC-030)

inCrate keeps its own `inventory` table in a separate file. Phase 3 does not touch it, Phase 9
retires it, and until then a user can import their collection in two places and get two answers.
LIBRARY-12 is responsible for saying so in the user documentation rather than leaving it to be
discovered.

### 4. Fifty thousand tracks is the target, and it shapes the code

Not a stress-test afterthought: it is the difference between an import that batches into one
transaction and one that commits per row, and between progress sampled once a second
(FOUNDATION-07's precedent, measured there) and thousands of database writes for numbers that are
superseded immediately. Write it that way first; LIBRARY-12 verifies it.

---

## LIBRARY-01 — Track Fields and the Source Record ✅ IMPLEMENTED 2026-09-03

**Objective**: Migration 0005. Extend `tracks` with the fields DEC-034 chose — rating, play count,
colour, date added, comment, total time, bitrate — and add the `library_source` record DEC-035
requires: the XML path, its modified time and size, when it was imported, and the counts that
import produced.

**User-visible result**: None yet.

**Dependencies**: None.

**Existing code reused**: `migrations/` and its runner, unchanged; `m0002_tracks.py` is the model
for the migration's shape. `LibraryTrack` gains fields; `_COLUMNS` in `TrackRepository` gains
entries, which is deliberately the only place the column list lives.

**Schema**:

- `tracks` gains `rating INTEGER`, `play_count INTEGER`, `colour TEXT`, `date_added TEXT`,
  `comment TEXT`, `bitrate INTEGER`. All nullable: Rekordbox omits them freely, and a missing
  rating is not a zero rating. DEC-034's seventh field, total time, goes into the existing
  `duration_seconds` column instead of a new one (DEC-038).
- `library_source` holds one row per library: `xml_path`, `xml_modified_at`, `xml_size_bytes`,
  `imported_at`, `track_count`, `playlist_count`. One row, because DEC-035 makes the library
  singular; a table rather than a config key so it can grow a history later without a migration
  that moves data.

**Tests**: Migration applies to an existing populated database without loss — the FOUNDATION-03
guarantee, re-checked with real rows present. New columns are nullable and default null. The
source record round-trips. `LibraryTrack.from_row` reads the new columns.

**Backward compatibility**: Additive columns only. A database migrated from Phase 2 keeps its
tracks; the new fields are null until a re-import populates them, which is exactly the cost
DEC-034 paid to avoid.

**Acceptance criteria / DoD**: Migration 0005 applies forward on an empty and a populated
database; every new field survives a write-read cycle; `check_no_qt_in_core.py` and the migration
tests pass.

**Risks**: Low. The one real risk is forgetting that `_COLUMNS` drives both insert and update, so a
column added to the schema and not to that tuple is silently never written.

**Complexity**: **S**

### ✅ IMPLEMENTED 2026-09-03

**Outcome**: Complete, and smaller than the spec's own worry. `m0005_track_fields_and_source.py`
adds six DEC-034 columns with `ALTER TABLE ADD COLUMN` statements and creates `library_source`.
`LibraryTrack` gained those six fields, `to_dict`/`from_row` carry them, and `_COLUMNS` gained the
six names.

**Amended 2026-09-03 by DEC-038.** As first written this step added a seventh column,
`total_time` — and LIBRARY-02 then showed why that was wrong: `tracks` had held
`duration_seconds` for the same quantity since migration 0002, and it is `duration_seconds` the
engine API exposes. Migration 0005 was corrected rather than followed by one that drops the column
it had just added, because it had not shipped and no database outside this machine had applied it.
The rest of this section describes the step as it now stands. Nothing else changed: `track_to_dict` in `library_api.py` is an
explicit field list, so the public search response is byte-identical, and `REVERTABLE_FIELDS` in
`ActivityService` was deliberately left alone — these are Rekordbox source values, nothing writes
history for them yet, and Phase 6 brings CuePoint's own rating.

**The `_COLUMNS` risk is now a test, not a note.** `TestColumnListCoversTheSchema` asserts
`PRAGMA table_info(tracks)` minus `id` equals `_COLUMNS` exactly. Deleting `"rating"` from the
tuple fails it, and fails the repository round-trip alongside it — which is the point, because
without the assertion that deletion produces a column that is silently never written and no test
that notices.

**Two design calls the spec left open.**

*No `CHECK (id = 1)` on `library_source`.* The spec's reason for a table rather than a config key
is that it can grow an import history later without a migration that moves data — and SQLite
cannot drop a CHECK constraint without rebuilding the table, so the constraint would cost exactly
the migration it was meant to avoid. Singularity is a property of the write path (LIBRARY-04
replaces the record); readers take the most recent row. `xml_modified_at` and `xml_size_bytes` are
nullable for a related reason: a `stat` that fails should cost the refresh its "unchanged?"
shortcut, not cost the user their import.

*`rating` is validated 0-5 in the model.* LIBRARY-02 owns the 0/51/102/153/204/255 → 0–5
conversion, but the column is defined here, and a raw 255 reaching the database reads as a
nonsense rating rather than failing. `LibraryTrack.__post_init__` now rejects anything outside
0–5, so forgetting the conversion in LIBRARY-02 is a loud failure at the boundary that should have
done it. This is slightly wider than the step as written; it is recorded here rather than done
silently.

**Every new column is nullable with no default**, asserted through `PRAGMA table_info`. A
`DEFAULT 0` would turn "no `Rating` attribute in the export" into "rated zero stars" for every
existing row, at migration time, irreversibly.

**Verified on a real database, not only in tmp_path.** The dev `~/.cuepoint/cuepoint.db` was at
version 4; three probe tracks were inserted at that version, the Electron app was launched, and
the running app migrated it to 5 with all three rows intact and every new column null. The app's
own global search then returned all three through engine → bridge → renderer, which is what proves
the widened row still reads end to end; the engine reported connected throughout. The probe rows
were deleted afterwards and the database left at 0 tracks, version 5.

**Guards proven by breaking them**, each reverted after: removing `"rating"` from `_COLUMNS` fails
2 tests; `NOT NULL DEFAULT 0` on `rating` fails 2; a `DELETE FROM tracks` inside the migration
fails the populated-database tests; removing the rating range check fails 7.

**Verification**: `python scripts/run_tests.py --unit --no-slow` — 2307 passed, 45 skipped (27
new). `src/tests/unit/engine` — 121 passed. `ruff check`/`ruff format --check` clean.
`check_no_qt_in_core.py`, `check_desktop_version_coupling.py` and `smoke_engine_health.py` pass.
Renderer: 381 tests, typecheck and lint unchanged and green — no renderer or Electron file was
touched, and no engine endpoint was added, so the desktop contract is unchanged. `mypy src/` is
1179 errors against a 1174 baseline; the five new ones are the `import-not-found` noise every test
file already produces, not type errors in the new code. No `CHANGELOG` entry: the step has no
user-visible result, matching how the Phase 1 migrations were handled. E2E not run — nothing it
covers changed.

---

## LIBRARY-02 — Parsing the Whole Collection ✅ IMPLEMENTED 2026-09-03

**Objective**: Read every track in the `COLLECTION` element into `LibraryTrack` objects, including
DEC-034's new fields, in a form that does not hold the whole XML in memory at once.

**User-visible result**: None directly.

**Dependencies**: LIBRARY-01.

**Existing code reused**: `data/rekordbox.py` already parses TrackID, Name, Artist, Remixer, Label
and Location, and already handles the attribute-name variations (`TrackID`/`ID`/`Key`,
`Name`/`Title`, `Artist`/`Artists`). This step adds attributes to that existing extraction rather
than writing a second parser. `normalize_path()` from FOUNDATION-04 produces `normalized_path`.

**What is new**: a collection-level iterator — `iter_collection_tracks(xml_path)` yielding
`LibraryTrack` — using `iterparse` with element clearing. `parse_rekordbox()` builds dictionaries of
playlists in memory, which is right for a single playlist run and wrong for a 50,000-track import.

**Field mapping** (Rekordbox attribute → column), to be confirmed against a real export at
implementation time rather than trusted from here: `Rating` → `rating` (Rekordbox stores 0/51/102/
153/204/255 for 0–5 stars; store the star count, not the raw value, and say so in the code),
`PlayCount` → `play_count`, `Colour`/`Color` → `colour`, `DateAdded` → `date_added`,
`Comments` → `comment`, `TotalTime` → `duration_seconds` (DEC-038), `BitRate` → `bitrate`,
`AverageBpm` → `bpm`,
`Tonality` → `key`, `Genre`, `Album`, `Year`.

**Tests**: A fixture XML exercising every field, a track missing every optional field, the
attribute-name variants, a rating of each star value, malformed numbers (a `BitRate` of `""`), and
non-ASCII paths and titles. Memory: parsing a generated 50,000-track XML does not accumulate — assert
the iterator yields without the resident set growing linearly, or at minimum that elements are
cleared.

**Backward compatibility**: Purely additive. `parse_rekordbox()` and everything using it are
untouched (DEC-036).

**Acceptance criteria / DoD**: Every DEC-034 field is populated from a real Rekordbox export; a
50,000-track file parses without loading the document into memory; existing parser tests still pass.

**Risks**: Medium — Rekordbox's attribute naming is inconsistent across versions, and the rating
encoding is a genuine trap. Verify against a real export, not the documentation.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-03

**Outcome**: Complete. `iter_collection_tracks()`, `location_to_path()` and four attribute
coercers live at the end of `data/rekordbox.py`, beside the `parse_collection()` they share
attribute-name handling with. 84 new tests. Verified against a **real 3,880-track Rekordbox 6.8.6
export**, which is where most of what follows comes from — the spec was right that the mapping had
to be confirmed against a file rather than trusted from documentation, and the file disagreed with
the obvious reading in four places.

**What the real export changed.**

*`AverageBpm="0.00"` on four tracks.* `LibraryTrack` rejects a BPM of zero (FOUNDATION-04's
validation), so the obvious `float(AverageBpm)` aborts the entire import of 3,880 tracks over four
unanalyzed ones. `_optional_bpm` returns None for zero and for anything outside 0–300, which keeps
the model's validation a backstop against a programming error instead of a tripwire on user data.
No unit test written from the spec would have found this; the real file found it immediately.

*The rating encoding is exactly the trap DEC-034 named.* Ratings in the export are
`0/51/102/153/204/255` — 3812/3/7/15/10/33 tracks — and the converted star histogram in the
database matches those counts exactly. LIBRARY-01's 0–5 range check turned this from a silent
wrong number into an import that could not have shipped wrong.

*Zero means "not known" for measured quantities.* 136 tracks carry `Year="0"`, 259 `BitRate="0"`,
one `TotalTime="0"` (a `------------------additional------------------` separator entry, not an
audio file). Stored as zeroes those sort as the oldest and worst-quality tracks in Phase 4, so
`_measured_int` nulls them. Play count and rating deliberately do not use it: zero plays and zero
stars are real answers. This is DEC-034's "a missing rating is not a zero rating" applied in the
other direction.

*Paths needed their own decoder, not `get_track_locations()`.* Seven tracks have `?` or `#` in
their filename (`Is This A Dream?`, `f#m`, `C's Movement #1`), and `get_track_locations()` splits
on both after decoding — **it truncates those paths and loses the extension. That is a real
pre-existing bug** in the path inKey's tag-writing uses; not fixed here (DEC-036 leaves that code
alone through Phase 3) but recorded. Four more tracks decode to a path still containing `%`:
`A%C3%BCra%2C` is genuinely the name on disk, because a download tool wrote percent-encoded text
into the filename and Rekordbox then encoded the `%` correctly — so `location_to_path` decodes
**exactly once**, and decoding until the string stops changing would produce paths that do not
exist. It also never touches the filesystem (DEC-037) and never branches on `os.name`: a Windows
export must decode identically on a Mac, because the database is one file a user may copy.

**`Colour` is not emitted at all.** Neither `Colour` nor `Color` appears on any of the 3,880
tracks in a Rekordbox 6.8.6 export. Both spellings are read, and the column stays null. DEC-034
still paid for the column correctly — adding it later would need a re-import — but nothing in
Phase 4 should expect it to be populated.

**`Tonality`, never `Key`.** Rekordbox uses `Key` as an alternative spelling of TrackID on
playlist entries, and the existing parser already reads it that way. Accepting `Key` as a fallback
for the musical key would put a track id in the key column; there is a test that fails if someone
adds it.

**Two deliberate divergences from `parse_collection()`**, both because the library mirrors
Rekordbox where the matcher filters it: a track with no title is **kept** (dropping it would make
a track the user can see in Rekordbox vanish from CuePoint, and DEC-003 would then delete any
CuePoint data attached to it), and a track is skipped only when it has no TrackID, which is the
DEC-002 identity and the unique key.

**Streaming, measured.** On the real 4.5 MB file: 0.73 MiB peak against 26.23 MiB for `ET.parse`
of the same file — **36× less memory**, flat rather than proportional. Clearing each `TRACK` is
not enough on its own; a cleared element stays in `COLLECTION`'s child list, so the parser also
detaches it (`del collection[:]`), and the guard for that compares peak memory at 2,000 and 20,000
tracks. Parsing also stops at the end of `COLLECTION` rather than reading on into `PLAYLISTS`,
whose `<TRACK Key="…"/>` references would otherwise parse as tracks with no title and no fields.
The 50,000-track test is marked `slow` and holds under 8 MiB.

**Two columns for a track's length — resolved as DEC-038.** As first implemented, the spec's
literal mapping (`TotalTime` → `total_time`) left `duration_seconds` — the column
`library_api.py`'s public `track_to_dict` actually exposes — empty on all 3,880 imported tracks
while the real value sat in a column nothing read. They are the same quantity. Raised rather than
silently double-written, and then settled: `TotalTime` is imported into `duration_seconds`,
`total_time` does not exist, migration 0005 was corrected, and the API response shape is unchanged
because it already named `duration_seconds`. Two tests fail if a second length column comes back.

**`get_track_locations()`'s truncation is fixed, not just noted.** It is a real bug on the user's
own collection, and DEC-036 is about not re-homing inKey onto the library — not about leaving a
defect in it. It now decodes through `location_to_path` and keeps only its own local-lookup steps.
Regression test and write-up: `src/tests/regression/RB-LOCATION-PUNCTUATION/`. It fails 6 of its 7
cases against the old code, including one that puts a real file on disk and shows the returned path
does not reach it. Fixing it removed a second latent bug in the same lines: the old
`lstrip("/")` under `os.name == "nt"` turned a macOS-exported `/Users/...` path into a *relative*
one, which `resolve()` then anchored to the current working directory — a wrong file rather than an
honest miss.

**Verified in the running app.** The real collection was imported into a scratch database, the
app's `database.path` was pointed at it, and the packaged app searched it: "Themba" returned 21
results and "Chloé" returned 5, each row showing BPM and key — values that exist only because
`AverageBpm` and `Tonality` mapped correctly, rendered through engine → bridge → renderer.
`config.yaml` was restored byte-identically afterwards and the user's real database was never
written to (0 tracks, version 5, unchanged).

**Guards proven by breaking them**, 11 of 11, each reverted and the source confirmed
byte-identical afterwards: removing element detaching, removing the stop at `</COLLECTION>`,
storing the raw rating, passing zero BPM through, treating zero as a real measurement, truncating
paths at `?`/`#`, decoding paths repeatedly, branching the drive-letter rule on `os.name`, storing
blank attributes as empty strings, reading the musical key from `Key`, and skipping untitled
tracks. Every one fails the tests that cover it.

**Persistence checked end to end** (a throwaway script, not LIBRARY-04): all 3,880 parsed tracks
batch-insert into a migration-0005 database in 0.26s; the database's rating histogram matches the
raw XML; DEC-002's `find_by_rekordbox_id` and `find_by_path` resolve to the same row; and
re-running the same import through `upsert_from_rekordbox` gives 0 inserted, 3,880 updated, 0
re-links and no duplicates.

**A third bug, found by tripping over it.** Verifying DEC-038 in the running app meant pointing
`database.path` at a scratch library — and with that set, `test_engine_library_search.py` began
failing on a unique-constraint violation, because the whole suite was resolving to that database.
`conftest.py` has an autouse guard named `_never_touch_the_real_library_database` whose own
docstring says writing to the user's library "has happened, so this is a guard rather than a
precaution" — but it redirects `default_database_path()`, which `DatabaseService` consults **last**.
A `database.path` in the user's real `~/.cuepoint/config.yaml` takes precedence, and the guard did
nothing at all. The root cause is broader than the database: `ConfigService` defaulted to the real
`~/.cuepoint/config.yaml`, so every test read whatever the person running it had configured, and
behaved differently from CI for reasons nothing in the output explained.

Fixed by giving `ConfigService` a `default_config_file()` seam — the same shape as
`default_database_path()`, which the suite already redirects — and a second autouse fixture that
sandboxes it. `test_user_data_isolation.py` asserts both halves, and asserts the *bootstrapped
container's* database service, not a bare one: a bare `DatabaseService()` has no config service and
was never at risk, so a test of that would have passed throughout. Demonstrated end to end by
setting a `database.path` in the real config and watching the container resolve to it with the
guard removed, and to the sandbox with it in place; the config file was restored byte-for-byte.

**And a fourth, found by checking whether the third fix worked.** A full suite run still
modified the real `~/.cuepoint/config.yaml` — `max_retries`, `checkpoint_every` and a pytest
temporary directory left in a developer's saved settings. `test_cli_smoke.py` runs the CLI with
`subprocess.run`, and a monkeypatch cannot cross a process boundary, so no fixture-based guard can
ever cover it. `--config` does not help either: it merges settings *into* a `ConfigService` that
`bootstrap.py` still builds bare, so saving goes to the real file regardless.

Fixed with `CUEPOINT_HOME`, an environment override for the `~/.cuepoint` directory honoured by
both `default_config_file()` and `default_database_path()` — the only seam that a subprocess
inherits. The conftest guard sets it; `test_cli_smoke.py` now builds its subprocess environment at
call time rather than snapshotting `os.environ` at import, which happens during collection before
any fixture runs. Demonstrated by disabling the guard, running the real CLI test and watching the
user's config change, then restoring it and watching it not. The variable is a developer and test
seam (it also makes a second profile possible); it is documented on `cuepoint_home()` rather than
announced as a user-facing feature, because the design has not made that promise.

**Verification** (re-run after DEC-038, the location fix and both halves of the isolation fix): 86 tests in
`test_rekordbox_library.py` including the `slow` 50,000-track case, and 7 in
`src/tests/regression/`. `python scripts/run_tests.py --all --no-slow`. `src/tests/unit/engine`.
Integration. `ruff check` and `ruff format --check` clean; `check_no_qt_in_core.py`,
`check_desktop_version_coupling.py` and `smoke_engine_health.py` pass. `mypy src/` adds only the
`import-not-found` noise every module in this repo produces. The engine API response shape is
unchanged — `duration_seconds` was always the field it exposed — so no desktop-contract file
needed to move and E2E was not run. No `CHANGELOG` entry: nothing user-visible yet.

---

## LIBRARY-03 — Playlists as Read-Only Source Data ✅ IMPLEMENTED 2026-09-03

**Objective**: Persist the Rekordbox playlist tree and its membership (DEC-031).

**User-visible result**: None yet; Phase 4 browses it.

**Dependencies**: LIBRARY-01.

**Existing code reused**: `parse_playlist_tree()` already returns the hierarchy with folders
preserved, and `playlist_path_for_display()` already formats a path for humans. Neither changes.

**Schema** (migration 0006): `rekordbox_playlists` — `id`, `rekordbox_path` (the
`Folder/Sub/Playlist` key, unique), `name`, `parent_path`, `kind` (`folder` or `playlist`),
`position`, `track_count`. `rekordbox_playlist_tracks` — `playlist_id`, `track_id`, `position`, with
a foreign key to `tracks` cascading on delete, because DEC-003 deletes tracks and membership rows
for a track that no longer exists are unreachable.

> **Amended at implementation.** The path is **not** unique, and is not the key: four playlists in
> a real export contain `/` in their name, so a path is neither splittable nor guaranteed unique,
> and a UNIQUE constraint would reject a legal tree. `parent_id` (a self-referential cascading
> foreign key) plus `depth` carry the structure; membership is keyed on `(playlist_id, position)`.
> See the implementation record below.

**Read-only means read-only**: these tables are written by import and refresh and by nothing else.
CuePoint's own Collections (Phase 6) are a different concept with a different table; a user editing
a "playlist" in CuePoint must never write here, because the next refresh would silently overwrite
it.

**Tests**: A nested tree round-trips with its hierarchy intact; membership order is preserved
(a DJ's playlist order is meaningful); deleting a track cascades its membership away; a playlist
whose tracks reference an unknown TrackID does not fail the import.

**Acceptance criteria / DoD**: A real export's tree is reconstructable from the database, including
folders with the same name under different parents.

**Risks**: Low-medium. The subtle one is ordering: Rekordbox playlist order is data, not
presentation.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-03

**Outcome**: Complete. Migration 0006 creates `rekordbox_playlists` and
`rekordbox_playlist_tracks`; `models/rekordbox_playlist.py` adds `RekordboxPlaylist` and
`PlaylistTreeWriteResult`; `data/rekordbox.py` gains `iter_playlist_nodes()`; and
`persistence/playlist_repository.py` adds `PlaylistRepository` behind a new `IPlaylistRepository`,
registered in `bootstrap.py`. 116 new tests.

Verified against the same real 3,880-track export as LIBRARY-02, whose tree is a much harder case
than the spec assumed: **234 nodes over five levels, 28 folders, 206 playlists, 13,870 track
references**, twelve names reused under different parents, 21 empty playlists, three empty folders,
19 playlists holding the same track more than once — one of them eight times — and four playlist
names containing the path separator.

**The path cannot be the key.** The spec proposed `rekordbox_path` as a unique
`Folder/Sub/Playlist` key. That export contains playlists named `stoa w/ deer`,
`dybbuk 11.12.25 w/ u.nid (rezo)`, `COZMO_11/02` and `COZMO_3/03`, so a path cannot be split back
into segments — `ROOT/LIBRARY 7.0/PREP/PAST SETS/COZMO_11/02` reads equally well as a playlist
`02` inside a folder `COZMO_11` — and two different trees can produce the same string (a folder
`A/B` holding `C`, and a folder `A` holding `B/C`). **A UNIQUE constraint would have rejected a
legal Rekordbox tree at import.** So `parent_id` is the structure: a self-referential, cascading
foreign key that cannot be orphaned. `rekordbox_path` is kept beside it as a derived, indexed,
**non-unique** column, because it is what the CLI's `--playlist` and `parse_playlist_tree()`
already speak and Phase 4 wants it for display. `depth` is stored for the same reason: it is what
resolves a child to its parent during import without parsing a path that may not be parseable.

**A third parser, and why.** The spec said to reuse `parse_playlist_tree()` unchanged. It is
reused — by the matching pipeline, untouched — but it cannot serve the library, on three counts
that a single matching run does not care about. It calls `ET.parse` and then builds an `RBTrack`
for every collection track and a `Track` for every playlist entry: 26 MiB of elements for a 4.5 MB
file, an order of magnitude worse at the 50,000-track target. It **skips collection tracks with no
title**, so a playlist entry pointing at one silently disappears — and LIBRARY-02 deliberately
imports untitled tracks, so a mirror built on it would quietly hold fewer entries than the export.
And it returns nested dictionaries keyed by that ambiguous path rather than tree coordinates.
`iter_playlist_nodes()` streams instead: **1.16 MiB peak against 26 MiB**, parents always yielded
before children.

**Ordering is enforced, not conventional.** Membership is keyed on `(playlist_id, position)` with
no surrogate id, so a DJ's set list order is a property the database holds rather than one the code
remembers to preserve — while still allowing the same track twice in one playlist. Both foreign
keys cascade; a `CHECK` on `kind` is acceptable here where 0005 refused one, because this table is
a mirror rebuilt from the XML on every import, so a future rebuild migration costs nothing.

**Read-only means read-only.** The repository offers `replace_tree` and `clear` and nothing else —
no rename, move, add-track or remove-track. `test_playlist_read_only.py` fails if one appears, on
the class and on the interface, because whatever such a method wrote would be destroyed without
warning by the next refresh and Phase 6's Collections are the editable concept.

**Unknown references are skipped and reported.** A reference naming a track the library does not
hold is counted into `PlaylistTreeWriteResult.missing_track_refs` rather than inserted — the
foreign key would reject it, and one stale reference must not fail a whole import. `track_count`
records what was actually stored rather than what Rekordbox declared, so the mirror never claims
rows it does not have; the discrepancy is reported at import time instead. The real export has zero
of these, so this path is tested rather than exercised.

**The DoD, met against the real file.** All 234 nodes and 13,870 entries were rebuilt from the
database by following `parent_id` alone and compared to an independent DOM walk of the XML — node
for node, reference for reference, in order. **Identical.** Import of the whole collection and tree
took 0.44s.

**Five of the first twenty-four guards did not guard.** Breaking each behaviour in turn found four
tests that passed against code with the behaviour removed, which is the whole point of doing it:

- The node-detaching memory test used 400 nodes and a 4x bound. Measured properly, 100 nodes cost
  530 KiB either way while 20,000 cost 530 KiB with the detach and 2,095 KiB without; the test now
  uses those sizes and a 1.5x bound.
- Stopping at `</PLAYLISTS>` was unobservable because Rekordbox writes that element last. It is now
  tested with an export whose `PLAYLISTS` *precedes* a 40,000-track collection, where reading on
  would cost the whole file.
- The stale-parent cleanup is only reachable on malformed input — in a well-formed tree the entry
  one level up is always the right parent. The test now uses a depth jump after a closed subtree,
  where without the cleanup a node silently attaches to a folder that already ended.
- The sibling-order test used siblings whose alphabetical order happened to match their position,
  and passed against a repository that sorted by name — which would silently reorder a set list.

With those fixed, **24 of 24 guards fail when the thing they protect is removed**, and every source
file was restored byte-identically afterwards.

**Verified in the running app.** The packaged app migrated the real `~/.cuepoint/cuepoint.db` from
version 5 to 6, creating both tables without disturbing anything, and reported the engine
connected. It was then pointed at a scratch database holding the whole imported collection *and*
tree — 3,880 tracks, 234 nodes, 13,870 entries — where search returned 22 results for "Bedouin"
with BPM and key intact. The cascade was proven on that real data before handing the file over:
deleting the most-referenced track removed exactly its 37 playlist entries. `config.yaml` was
restored byte-for-byte and the real library was never written to (0 tracks, 0 nodes, version 6).

**Verification**: 116 new tests — 19 model, 34 parser, 41 repository, 5 read-only, 17 schema.
`python scripts/run_tests.py --all --no-slow`: 2521 unit, 315 integration, 7 regression, 4 system,
all passing. `ruff check` and `ruff format --check` clean; `check_no_qt_in_core.py`,
`check_desktop_version_coupling.py` and `smoke_engine_health.py` pass. `mypy src/` adds only the
`import-not-found` noise every module here produces — the one real finding it reported was fixed.
No renderer, Electron or engine API file was touched, so the desktop contract is unchanged and E2E
was not run. No `CHANGELOG` entry: nothing user-visible yet, as Phase 4 is what browses this.

---

## LIBRARY-04 — The Import Service ✅ IMPLEMENTED 2026-09-03

**Objective**: The first import. Parse, upsert every track, store the playlist tree, write the
source record, and return a summary.

**User-visible result**: None directly — LIBRARY-06 exposes it, LIBRARY-11 shows it.

**Dependencies**: LIBRARY-02, LIBRARY-03.

**Existing code reused**: `upsert_from_rekordbox()` for every track (fact 2 above),
`add_many()` for the bulk path, `ILibraryService` as the entry point engine handlers call.

**Behaviour**:
- One transaction for the whole import, or explicit batches — not a commit per track.
- Returns `ImportSummary`: inserted, updated, relinked, playlists, duration, and the source record.
- Re-links are counted and listed (DEC-002 says they are reported, not silent).
- Records an activity event on completion, following DEC-029's producers.

**Tests**: Importing a fixture collection produces the expected counts; importing the same file
twice is idempotent — second run reports zero inserted, N updated, and does not duplicate rows;
a re-numbered TrackID with an unchanged path is reported as a re-link, not an insert and a delete;
an XML with no `COLLECTION` element fails with a clear error rather than an empty library.

**Backward compatibility**: New service surface; nothing existing changes.

**Acceptance criteria / DoD**: A real export imports completely, twice, with correct counts and no
duplicates; the source record matches the file.

**Risks**: Medium. Idempotency is the property most likely to break subtly, and the one users
notice last.

**Complexity**: **M/L**

### ✅ IMPLEMENTED 2026-09-03

**Outcome**: Complete. `services/library_import_service.py` adds `LibraryImportService` and
`ImportSummary`; `models/library_source.py` and `persistence/library_source_repository.py` build
the DEC-035 record LIBRARY-01 deliberately left unwritten; `TrackRepository` gains
`upsert_many_from_rekordbox`; `data/rekordbox.py` gains `has_collection_element`. Both new
services are registered in `bootstrap.py` behind `ILibraryImportService` and
`ILibrarySourceRepository`. 87 new tests.

**`upsert_from_rekordbox()` cannot be looped, so the bulk path is new code running the same
rule.** The spec named that method for every track. It opens **its own transaction per call** —
fifty thousand tracks would be fifty thousand commits — against a step that also requires "one
transaction for the whole import, not a commit per track". `upsert_many_from_rekordbox` resolves
the conflict without a second identity rule: `resolve_identity()` takes its two lookups as
callables precisely so they can be dictionaries instead of queries, and it is still the only thing
that decides a match. `TestAgreesWithTheSingleTrackPath` runs both paths over seven scenarios and
compares the resulting rows, so the day they diverge a test says so rather than a user's tags
landing on the wrong track.

**Identity is resolved against the library as it was before the import began.** The maps are built
once and a row already written by this import is never matched again. Without that, two incoming
tracks sharing a file path would collapse into one — the second would path-match the row the first
had just inserted and overwrite it. Rekordbox says they are two tracks, so the library must agree.
The cost is holding the identity of every existing track in memory, about 25 MB at fifty thousand,
freed when the import ends.

**The real collection has exactly one such pair**: two Rekordbox entries pointing at
`ajna (be) - on my mind (original mix).mp3`, titled `[5] On My Mind (Original Mix)` and `On My
Mind (Original Mix)`. It only surfaced because the verification renumbered every TrackID in the
real export to simulate a Rekordbox database rebuild — 3,879 tracks re-linked and kept their rows,
and the pair produced one re-link plus one insert rather than one track quietly disappearing. That
shape is now a unit test.

**A separate service, not a method on `LibraryService`.** The spec pointed at `ILibraryService` as
"the entry point engine handlers call", and that seam is reused — but the import method lives on
its own service. An import needs the parser, the playlist mirror, the source record and the
activity feed; the search endpoint needs none of them, and `LibraryService`'s own docstring says it
is "reads and counts only". LIBRARY-05 hands this to a background job and LIBRARY-07/09 add the
refresh diff to it, so the alternative was a service that grows to own the whole phase while the
search endpoint carries its dependencies. Recorded rather than done silently.

**The source record is written last, and that is the atomicity story.** `DatabaseService` refuses
nested transactions by design — SQLite has none, and pretending otherwise would silently commit
partial work — so the import is three explicit batches rather than one transaction. The ordering is
what makes a partial failure safe: tracks, then playlists, then the source record. An import that
fails part way leaves no source record, so the library honestly reports that it has not been
imported from a file, and because every track write is an upsert a retry converges instead of
duplicating. Two tests cover it, including one whose file passes the `COLLECTION` check and then
fails while the tracks are being read.

**A file with no `COLLECTION` is refused before anything is written.** `has_collection_element()`
stops at that element's start tag, so the check costs a few kilobytes — deliberately not
`validate_xml_file()`, which builds the whole document and then counts every element in it. An
empty `COLLECTION` is allowed: a new Rekordbox install legitimately has no tracks.

**Three of the first seventeen guards did not guard.** Breaking each behaviour found two tests that
passed against code with the behaviour removed, and one piece of code that no test could
distinguish from its absence:

- Nothing covered "a path shared by several rows resolves to the lowest id", which is what keeps
  the bulk and single-track paths agreeing when a library legitimately holds two rows for one file.
- The source-record ordering test used a file rejected *before* any work started, so it passed
  against a service that wrote the record first. It now uses a file that fails mid-parse.
- `matches_file_on_disk` opened with `if not self.is_stat_known: return False`, which was
  unreachable in effect — a recorded `None` never equals a real modified time. Removed rather than
  guarded; `is_stat_known` stays as the property the refresh flow will ask.

With those addressed, **16 of 16 guards fail when the thing they protect is removed**, and every
source file was restored byte-identically.

**The DoD, against the real export.** Imported completely (3,880 tracks, 234 nodes, 13,870 entries
in 0.47s), then twice more: zero inserted, 3,880 updated, no duplicate rows, primary keys and
`created_at` unchanged, and one source record matching the file's modified time and size. The
renumbered variant re-linked 3,879 tracks onto their existing rows, and the playlist tree still
rebuilt identically to that XML.

**Verified in the running app.** The import ran through `bootstrap_services()` and the DI container
the engine uses — the wiring check, not just the class — and the completion event reached the
Activity panel, which rendered "Library imported — 3880 tracks, 3880 new, 206 playlists" with its
detail, needing no renderer change. `config.yaml` was restored byte-for-byte and the real library
was never written to (0 tracks, 0 nodes, 0 source rows, version 6).

**Verification**: 87 new tests — 13 source model, 9 source repository, 31 bulk upsert, 34 import
service. `python scripts/run_tests.py --all --no-slow`: 2604 unit, 315 integration, 7 regression,
4 system, all passing. `ruff check` and `ruff format --check` clean; `check_no_qt_in_core.py`,
`check_desktop_version_coupling.py` and `smoke_engine_health.py` pass. `mypy src/` adds only the
`import-not-found` noise every module here produces — its one real finding, in
`library_source.py`, was fixed. No renderer, Electron or engine API file was touched, so the
desktop contract is unchanged and E2E was not run; LIBRARY-06 is what exposes this. No `CHANGELOG`
entry: still nothing a user can reach.

---

## LIBRARY-05 — Import as a Background Job

**Objective**: Run import under the existing job infrastructure as a `library_import` job (DEC-033),
with progress the status strip already knows how to display.

**User-visible result**: A running import appears in the status strip, from anywhere in the app.

**Dependencies**: LIBRARY-04.

**Existing code reused**: `JobStore`, the `jobs` table's `type` discriminator, the SSE event stream,
and SHELL-07's status strip — which reads `completed_tracks`/`total_tracks` and a percentage, so an
import that reports the same shape needs no renderer change at all.

**Expect the job store to resist.** `JobStore` is `MatchJob`-shaped: `create_match_job`, results
lists, batch results, match-specific status payloads. FOUNDATION-07 chose the `type` column
precisely so a second kind could share the table, but the in-memory side has not met one yet. This
step generalizes the minimum needed and leaves the rest — it is not a rewrite of the job system.

**Progress**: sampled, following FOUNDATION-07's measured precedent — persist at most once a second,
force state transitions through immediately. Import ticks per track; 50,000 database writes for
superseded numbers is the failure mode being avoided.

**Tests**: A job is created, progresses and completes; its record survives a simulated engine
restart (the DEC-007 guarantee, now with a second job type); cancelling an import mid-run leaves the
library in a consistent state — either the import applied or it did not; existing match-job tests
pass unchanged, which is the bar for "generalized, not rewritten".

**Acceptance criteria / DoD**: An import runs as a job, reports progress the strip renders, and
appears in `GET /api/v1/jobs` alongside match jobs; all pre-existing job tests still pass.

**Risks**: **Medium-high** — the highest of the phase. Cancellation mid-write and the shared job
store are where correctness problems hide.

**Complexity**: **L**

---

## LIBRARY-06 — Import API and Desktop Contract

**Objective**: Start an import from the app and follow it.

**Dependencies**: LIBRARY-05.

**API surface**:
- `POST /api/v1/library/import` with `{ "xml_path": "…" }` → `{ "job_id": … }`.
- `GET /api/v1/library/summary` → track count, playlist count, and the source record (path,
  imported_at, whether the file is still there and whether it has changed since).

Progress is read through the existing job endpoints and SSE; this step adds no second progress
mechanism.

**Contract**: all six files, per fact 1. `searchLibrary` (SHELL-04) is the worked example.

**Tests**: Engine tests for auth, a missing file, a path that is not XML, and starting an import
while one is running (reject with a clear code rather than corrupting state). A bridge-shape test,
which is what the contract test exists for.

**Acceptance criteria / DoD**: An import can be started and followed from the renderer; the summary
endpoint reports an empty library honestly before any import.

**Risks**: Low-medium, with the contract test carrying most of the risk that used to exist here.

**Complexity**: **M**

**PR breakdown**: Two — engine endpoints, then bridge plumbing.

---

## LIBRARY-07 — Computing a Refresh Diff

**Objective**: Compare a re-read XML against the stored library and produce a diff, **writing
nothing** (DEC-032).

**Dependencies**: LIBRARY-04.

**Existing code reused**: `resolve_identity()` decides what each incoming track *is* — fact 2. The
diff classifies; it does not invent identity.

**Output** — `RefreshDiff`: `added`, `changed` (with which fields changed, so the preview can say
more than a number), `removed`, `relinked`, and the same for playlists. Counts plus enough detail
for a preview, without materializing 50,000 rows twice.

**What counts as changed** matters and should be decided here, not in the UI: a track whose only
difference is `play_count` has changed in Rekordbox but is not interesting to report as an edit.
The diff carries the field list; the preview decides what to show.

**Tests**: An unchanged file diffs to nothing — the case that must be fast and must not report noise.
Added, changed and removed are each classified correctly; a re-numbered TrackID at the same path is
`relinked`, not `removed` + `added`, which is the DEC-002 failure that would silently destroy
CuePoint-side data; a moved file with the same TrackID is `changed`, not removed.

**Acceptance criteria / DoD**: Diffing a file against itself produces an empty diff; every category
is exercised against a real export edited in known ways.

**Risks**: Medium-high. The removed-versus-relinked distinction is where irreversible deletion meets
identity, and it is worth a regression test written to fail first.

**Complexity**: **L**

---

## LIBRARY-08 — The Reference-Check Seam (DEC-011)

**Objective**: Answer "how many Collections or Sets reference these tracks?" — which is zero until
Phase 6, and must be asked anyway.

**Dependencies**: LIBRARY-07.

**Why now**: DEC-011 requires the warning; DEC-032 chose to build the seam rather than change the
refresh flow's shape later. A refresh that grows a confirmation step in Phase 6 is a refresh whose
API, tests and UI all move again.

**Behaviour**: `ILibraryService.references_for(track_ids) -> ReferenceSummary` returning zero
counts, with the contract documented for Phase 6 to satisfy. The diff carries the summary; the
preview reads it.

**Tests**: The seam returns zero for any input today. A test that fails if a caller *skips* the
check on the delete path — the point is that Phase 6 has one place to fill, not several to find.

**Acceptance criteria / DoD**: Every deletion path consults the seam; Phase 6's work is implementing
one method.

**Risks**: Low, provided it is not quietly bypassed.

**Complexity**: **S**

---

## LIBRARY-09 — Applying a Refresh

**Objective**: Apply a computed diff: insert, update, delete (DEC-003), and update playlists and the
source record, transactionally.

**User-visible result**: The library matches the Rekordbox export again.

**Dependencies**: LIBRARY-07, LIBRARY-08.

**Behaviour**:
- One transaction. A refresh that fails halfway must leave the library as it was, not half-applied.
- Deletions cascade to playlist membership (LIBRARY-03's foreign key) and, from Phase 6, to whatever
  else references a track — which is why LIBRARY-08 exists.
- Records an activity event with the counts, so a destructive refresh is visible afterwards
  (DEC-029's feed is the only durable record a user has).
- Re-links are applied through `upsert_from_rekordbox` and reported.

**Tests**: Applying a diff produces exactly the diff's counts; a failure mid-apply rolls back
entirely — worth testing with an induced error, because this is the one operation that can destroy
user data; deleted tracks take their playlist membership with them; applying the same diff twice is
harmless.

**Backward compatibility**: The first import path (LIBRARY-04) and the refresh path share the same
writes, and should share the same code rather than diverge.

**Acceptance criteria / DoD**: A real edited export refreshes correctly; an induced failure leaves
the database untouched; the activity feed records what happened.

**Risks**: **High** — the only irreversible operation in the phase.

**Complexity**: **L**

---

## LIBRARY-10 — Refresh API and Contract

**Objective**: Preview and apply, over the engine API.

**Dependencies**: LIBRARY-09.

**API surface**:
- `POST /api/v1/library/refresh/preview` → a job that computes a diff and returns it as its result.
- `POST /api/v1/library/refresh/apply` with the diff's id → a job that applies it.

Two calls rather than one, because DEC-032 chose preview-then-confirm, and because a diff computed
and applied in one request could not be confirmed by anyone.

**A diff has a lifetime**, and this step must decide it: a preview computed against a file that
changes before apply is stale, and applying it would delete based on a snapshot that no longer
holds. Store the diff with the source file's modified time and refuse to apply a stale one.

**Tests**: Preview returns a diff without writing — assert the library is byte-identical afterwards.
Applying an unknown or stale diff id is refused with a clear code. Auth, as everywhere.

**Acceptance criteria / DoD**: Preview never writes; a stale diff cannot be applied; both flows are
reachable from the renderer.

**Risks**: Medium. Diff staleness is the correctness question.

**Complexity**: **M**

---

## LIBRARY-11 — The Library Page

**Objective**: The first user-facing library surface: enable the `library` destination, show what
the library holds, and drive import and refresh with DEC-032's preview.

**User-visible result**: A Library page. Import a collection, see counts, refresh, and confirm a
diff before it applies.

**Dependencies**: LIBRARY-06, LIBRARY-10.

**Existing code reused**: DEC-020's registry — enabling the destination is the one-line change
SHELL-02 built it for, and SHELL-09 already drew the `library` icon. The status strip already
reports the running import; this page does not build a second progress display. `Modal` for the
preview, which SHELL-10 gave focus management and Escape.

**Scope boundary**: **not** the track table. Phase 4 (LIBUI) builds the Universal Track Table,
filters and browsing. This page shows counts, the source file, and the import/refresh controls. The
temptation to start listing tracks here is the phase boundary being crossed.

**Tests**: Empty state before any import that says what to do; import flow from file picker to
completion; a refresh preview that reports counts and applies on confirm; a preview with removals
that shows them prominently; the reference warning path (which shows zero until Phase 6, and should
still be exercised).

**Acceptance criteria / DoD**: A user can import a collection, see it, refresh it, and cancel a
refresh at the preview without anything changing.

**Risks**: Low-medium — mostly the pull toward Phase 4's scope.

**Complexity**: **M**

---

## LIBRARY-12 — Scale, Verification and Documentation

**Objective**: Prove the phase at the size it was designed for, and write down what a user needs to
know — including what is confusing (DEC-030).

**Dependencies**: Every other step.

**Scope**:
- **50,000 tracks, measured.** A generated collection of that size imports, refreshes and diffs;
  record the timings and memory in the completion report. This is the number the design was built
  against, and the only honest way to claim it is to run it.
- **An unchanged refresh is fast.** The common case is re-importing a file that barely changed;
  diffing 50,000 unchanged tracks should not feel like a fresh import.
- **The duplication is documented.** Per DEC-030, user docs state that inCrate keeps its own
  inventory, that importing in one does not import in the other, and that they converge in a later
  release. Leaving this to be discovered is the failure this step prevents.
- User documentation for import and refresh, including what a refresh deletes (DEC-003) and that
  missing files are not detected yet (DEC-037).
- `docs/release/CHANGELOG.md` under `Unreleased`.

**Tests**: The scale run itself, plus an E2E covering import → summary → refresh preview → apply in
the packaged app.

**Acceptance criteria / DoD**: The 50,000-track numbers are recorded and acceptable; docs describe
import, refresh, deletion and both limitations.

**Risks**: Low, but this is the step most likely to be skipped when the phase "feels done" — and the
scale claim is worthless unless someone runs it.

**Complexity**: **M**

---

## Phase-level acceptance

Phase 3 is complete when, in a **packaged build**:

1. A real Rekordbox export imports completely, with every DEC-034 field and the full playlist tree.
2. Re-importing the same file changes nothing and reports zero changes.
3. An edited export produces a correct diff, previews it, and applies it on confirmation.
4. A track re-numbered by Rekordbox is re-linked, not deleted and re-added.
5. Removed tracks are deleted (DEC-003), the reference seam is consulted first (DEC-011), and the
   activity feed records what happened.
6. Import runs as a job and appears in the status strip from anywhere in the app.
7. 50,000 tracks import and refresh within recorded, acceptable timings.
8. Full Python suite, renderer gates, E2E, Qt guard, version coupling and the desktop-contract test
   all pass.
9. No decision in DEC-002, DEC-003, DEC-011 or DEC-030…DEC-037 is contradicted. Per the process, a
   contradiction stops the work and gets raised rather than worked around.

## Deferred, with reasons

- **The track table, filters and browsing** — Phase 4. LIBRARY-11 shows counts, not rows.
- **Tags, ratings, Collections** — Phase 6. Until then a deleted track takes nothing with it, which
  is why DEC-003's risk is currently theoretical and will not stay that way.
- **Missing-file and duplicate detection** — Phase 7 (DEC-037).
- **Export** — Phase 8. The existing narrow attribute-patch writer is untouched.
- **inKey and inCrate moving onto the library** — Phases 7 and 9 (DEC-036).
- **Retiring inCrate's inventory** — Phase 9 (DEC-030).

## Recommended First Step

**LIBRARY-01**. Everything reads or writes the schema, the migration is small and well-precedented,
and it settles DEC-034's field list before two other steps assume it.

**LIBRARY-02 and LIBRARY-03 can then run in parallel** if wanted — one parses tracks, the other
playlists, and they meet at LIBRARY-04.

The step to schedule carefully is **LIBRARY-09**: it is the only irreversible operation in the
phase, and it should not be written on the same day as the diff it applies.

Waiting for an explicit "Implement LIBRARY-NN" before touching any code.
