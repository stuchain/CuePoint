# CuePoint v1.0.0 — Phase 8: Rekordbox Export, Detailed Step Specifications

Status: **Specified, not implemented.** The seven steps below replace the roadmap's placeholder
inventory (EXPORT-01…EXPORT-08, which Round 10's answers came in one under). Per the process, no
implementation happens from this document — each step needs an explicit "Implement EXPORT-NN"
instruction, scoped to exactly that step, and its outcome is recorded under the step afterwards.
The one open point this specification raised — where export is reached from — was settled while
writing it, as an amendment to DEC-087; there are no open points.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`), Phase 3
(`PHASE3_LIBRARY.md`), Phase 4 (`PHASE4_LIBUI.md`), Phase 6 (`PHASE6_ORG.md`) and Phase 7
(`PHASE7_CLEAN.md`), all implemented, and on Phase 5 (`PHASE5_PLAYER.md`), all steps implemented.
Decision Rounds 1–10 apply (`DECISIONS.md`, DEC-001…DEC-089). Phase 8's own decisions are
DEC-077…DEC-089, alongside DEC-035 (the library remembers its source file), DEC-038 (one length
column), DEC-045 (the selection model), DEC-057 and DEC-068 (the two value layers), DEC-058 (a
Collection is ordered and may repeat), DEC-059 (Collections nest), DEC-061 (Smart Collections are
live), DEC-064 (the discipline this phase is the exception to) and DEC-073 (missing files are fixed
in Rekordbox). Round 10 also amended DEC-038, DEC-061 and DEC-064.

## What this phase is

Every phase so far has been inward. The library, the player, the organization layer and the review
work all live in one SQLite file that nothing outside CuePoint reads. A user can rate four hundred
tracks, tag them, correct their keys from Beatport and arrange them into Collections, and none of it
is visible in the software they actually play from. This phase is the one that carries it outward.

It produces one artifact: a Rekordbox XML file, written to a path the user chose, that Rekordbox can
load as a source in its tree. Inside it, the tracks carry CuePoint's values where CuePoint has them,
and the Collections the user picked appear as playlists beside the ones Rekordbox already had.

The whole design follows from one fact found while writing Round 10, and it is worth stating before
anything else: **`POSITION_MARK` and `TEMPO` appear nowhere in `src/`.** CuePoint has never parsed a
cue point or a beat grid. There is no table, no column and no model for one. So a document generated
from the database would be handed back to a DJ with every hot cue, every memory cue and every beat
grid gone — silently, and discovered in a booth. The export therefore never generates. It re-parses
the file the library came from and sets attributes on it (DEC-077), which inverts the default:
rather than preserving what CuePoint remembered to carry, it preserves everything it never
understood.

**What this phase is not.** It does not write audio files (DEC-085) — DEC-070's job in Phase 7
remains the only thing in CuePoint that does. It does not export tags, notes or favorites (DEC-080).
It does not write into the source XML, ever, and refuses that path by a check rather than by
convention (DEC-083). It does not relocate files or rewrite a `Location` (DEC-073, DEC-088). It does
not add a navigation destination (DEC-087). It does not touch the matcher, the player, the CLI or
its output files. It does not store per-track export state or offer incremental export (DEC-086). It
does not parse or begin to store cue points and beat grids — it makes that unnecessary rather than
doing it.

## What the earlier phases already built

Read this table before writing any of it again.

| Already exists | Where |
| --- | --- |
| Parsing a collection into `LibraryTrack`s, streaming | `data/rekordbox.py::iter_collection_tracks`, `collection_entry_count` |
| Parsing the playlist tree, streaming | `data/rekordbox.py::iter_playlist_nodes` |
| The size guard, the temp-file-then-`replace` write, the `TrackID or ID or Key` identity read | `data/rekordbox.py` (`MAX_XML_SIZE_BYTES`, `write_updated_collection_xml`, `_library_track_from_element`) |
| Key notation conversion, and its three-value vocabulary | `services/tag_write_service.py::key_text`, `services/tag_write_options.py::KEY_FORMATS` |
| Rekordbox `Rating` → stars, both encodings | `data/rekordbox.py::_rating_to_stars`, `_RATING_STARS` |
| The effective-value rule, in one place | `models/track_metadata.py::effective_value`, `effective_rating`, `OVERRIDE_FIELDS` |
| The recorded source file and its mtime and size | `library_source` (migration 0005), `models/library_source.py` |
| Collections, folders, Smart Collections, ordered entries | `collections`, `collection_tracks` (migration 0009) |
| Smart Collection rules, compiled to SQL | `models/filter_rule.py`, the browse query's scope CTE |
| "These tracks" as a question plus exclusions, one parser | `engine/organization_api.py::parse_selection`, `resolve_scope`, `BatchSelection.matching` |
| Per-track file status | `track_files` (migration 0011), `services/file_check_service.py` |
| Jobs: lifecycle, cancel, persistence, exclusivity, conflicts | `engine/jobs.py::create_job(job_type=…, exclusive=…, conflicts_with=…)` |
| Activity events | `activity_events` (migration 0004), `engine/activity_api.py` |
| A native save dialog, with and without a parent window | `electron/main.ts::showSaveDialogFor` |
| A preview-then-confirm dialog over a computed engine response | `renderer/.../RefreshPreviewDialog.tsx`, `WriteTagsDialog.tsx` |
| The library-scoped action bar: refresh and import | `renderer/.../LibraryHeader.tsx` |
| "Add to Collection" on a selection, the route from tracks to an exportable object | `renderer/.../LibraryScreen.tsx`, ORG-11 |
| A file-writing boundary the suite enforces | `src/tests/unit/data/test_file_write_boundary.py` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-077 | Patch the source tree; never generate. Six attributes, nothing else. Retire the orphaned writer. |
| DEC-078 | Whole `COLLECTION`, mirror untouched, chosen Collections appended under one parent folder. |
| DEC-079 | The effective value per field, written only where it differs from the file, compared parsed. |
| DEC-080 | Tags, notes and favorites are not exported, into any attribute. |
| DEC-081 | A Smart Collection exports as its membership at that moment, in its stored sort order. |
| DEC-082 | Staleness detected against `library_source`, reported with counts, not refused. Missing source blocks. |
| DEC-083 | Save dialog, remembered folder, the source path refused by a check in Python. |
| DEC-084 | A computed preview, then a cancellable job with an activity event. |
| DEC-085 | No audio file is opened for writing anywhere in this phase. |
| DEC-086 | One row per export, with its playlists; no per-track export state. |
| DEC-087 | An action in the Library header and the Collection context menu; no destination. |
| DEC-088 | Missing-file tracks exported unchanged, their count stated. |
| DEC-089 | Three key notations, the file-tag path's converter, default classic, remembered, warned. |

## Sequencing

EXPORT-01 and EXPORT-02 are the whole risk of the phase and they are pure functions over files, so
they come first and are testable without a database, a job or a UI. EXPORT-03 lands the schema in
one forward-only migration, following ORG-01 and CLEAN-01. EXPORT-04 is the preview, which is where
the queries are written; EXPORT-05 is the job that runs those same queries for real, which is what
makes "the preview cannot disagree with the result" a property rather than a hope. EXPORT-06 puts it
on the wire and gets the save dialog. EXPORT-07 draws it and closes the phase.

Nothing in the UI can start an export until EXPORT-07 wires the entry points, exactly as PLAYER-09
held playback back until the gesture existed.

## Before starting any step — six cross-cutting facts

### 1. The desktop contract is six files

Every new endpoint moves through `engine/*_api.py` + `server.py` · `engineClient.ts` ·
**`engineSupervisor.ts`** · `main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a
placeholder) · `cuepointBridge.types.ts`, gated by `desktopContract.test.ts`. The supervisor is the
file that forwards method by method and that nothing type-checks — it has bitten in SHELL-04,
LIBRARY-11, PLAYER-03 and CLEAN-11. `server.py` speaks only `do_GET` and `do_POST`; mutations are
POSTs to action paths.

This phase adds routes and removes none, so unlike CLEAN-14 it is not a breaking engine-API change.

### 2. The word "export" already means something else

`services/export_service.py` and `services/output_writer.py` are CSV, JSON and Excel, reached from
Settings. Nothing in this phase may be named so that the two are confused: the new service is
`services/rekordbox_export_service.py`, the job type is `rekordbox_export`, the routes live under
`/api/v1/rekordbox-export/`, and the renderer names follow. A reviewer should never have to open a
file to learn which export it is.

### 3. No audio file is opened for writing, and the suite checks it

DEC-085 is the whole phase, not one step's rule. `test_file_write_boundary.py` already enumerates
which functions may write files; EXPORT-01 updates it as it removes functions, and it must continue
to fail if any module added by this phase imports a writer from `data/tag_writer.py`. The only file
this phase writes is the XML at the path the user chose.

### 4. The source file is read, and never written

Every read of the source goes through the size guard. Every write goes to a temp file in the
destination's directory and is then `replace`d into place, which is what
`write_updated_collection_xml` already does and the reason an interrupted export leaves nothing
behind. The refusal to write the source path is enforced in Python, not in the dialog, because
AGENTS.md keeps business rules in the engine and a renderer check is a suggestion.

### 5. Two layers span six fields, and the export reads them exactly once

`OVERRIDE_FIELDS` is `("key", "bpm", "genre", "label", "year")`; the rating is the sixth value and
has its own resolver. `effective_value` and `effective_rating` in `models/track_metadata.py` are the
only implementations of the precedence rule, and the export calls them rather than restating them in
SQL or in a serializer. DEC-057's warning about two implementations disagreeing applies with more
force here than anywhere, because the disagreement would be inside a file a user then loads into
Rekordbox.

### 6. A track may appear twice in a Collection, and once in `COLLECTION`

DEC-058 allows repeats in a Collection. The `COLLECTION` element holds each track once; a
`PLAYLISTS` entry is a reference. So a Collection with a closing reprise exports as a playlist with
two entries pointing at the same `TrackID`, and nothing about that needs special handling as long as
the playlist builder works from `collection_tracks` rows in `position` order rather than from a set
of track ids.

---

## EXPORT-01 — The XML Patch Writer, Replacing the Orphaned One

**Objective**: One function that takes a source XML, a map of track id to attribute values, and a
destination, and writes a patched copy that differs from the source in exactly those attributes.
Delete the orphaned write cluster it replaces.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**: `write_updated_collection_xml`'s structure — the size guard, the
`tempfile.mkstemp` in the destination directory, the `Path.replace` — carried into the new function
rather than reimplemented. `_RATING_STARS` and `_rating_to_stars`. `key_text` from
`services/tag_write_service.py` for the notation, and `KEY_FORMATS` for its vocabulary.

**Design**:

- **The deletion comes first, in this step, because the new function replaces it.** A caller search
  found no production caller of `write_updated_collection_xml`, `build_rekordbox_updates`,
  `build_rekordbox_updates_batch`, `write_key_comment_year_to_playlist_tracks`, its `_batch` twin,
  or `write_tags_to_paths` — only `data/__init__.py` re-exports and tests. `processor_service.py`
  imports only readers from `rekordbox.py`; `tag_write_service.py` calls
  `tag_writer.write_key_comment_year_to_file` directly. CLEAN-14 removed the routes and screens
  above this cluster and left it on the note that "the CLI's own paths stay", which did not describe
  it. Delete the six functions, their `data/__init__.py` re-exports, the helpers left with no caller
  after them (`_normal_key_value` and any other, each confirmed by search at the time of deletion
  rather than taken from this list), and `test_rekordbox_write.py`'s tests of them. Leaving them
  standing would put two XML writers in one module, one correct and one that writes `BPM`, `Comment`
  and a stray `Key`, with the wrong one holding the more inviting name.
- **`test_file_write_boundary.py` is updated, not deleted.** It enforces which functions may write,
  which is worth more than the code it currently guards. Its list loses the removed names and gains
  the new writer.
- **The six attributes, and only those**: `Tonality`, `AverageBpm`, `Genre`, `Label`, `Year`,
  `Rating`. Not `BPM`, not `Comment`, not `Comments`, not `Key`, not `TotalTime`. The removed code
  got three of these wrong because one `updates` dict served both an XML writer and a file-tag
  writer, and the file-tag writer's parameter names leaked into the document. The new function takes
  a typed value object per track, not a free-form dict, so a name cannot leak into it.
- **An attribute is set only where the parsed value differs** (DEC-079). The element's current value
  is read with the same helpers the importer uses — `_optional_text`, `_optional_bpm`,
  `_measured_int`, `_rating_to_stars` — and compared against the effective value. Equal means the
  attribute is not touched. This is what keeps "otherwise the imported value, unchanged" literally
  true: re-serializing a value nobody changed would still rewrite it, and for a rating it would
  visibly change it, since a source carrying `Rating="3"` on a track with no CuePoint rating would
  come back as `Rating="153"`.
- **`_stars_to_rating` beside `_rating_to_stars`**, mapping 0–5 to 0, 51, 102, 153, 204, 255 — the
  encoding Rekordbox itself writes. One implementation, used only where a write is warranted.
- **BPM formatting** matches what Rekordbox writes: a fixed two-decimal string, and the comparison
  is on the parsed float so `128` and `128.00` are the same value and neither is rewritten as the
  other.
- **Nothing else in the tree is touched.** The function walks `COLLECTION/TRACK` elements, matches
  `TrackID or ID or Key` as the importer does, and sets attributes. It does not reorder attributes,
  add or remove elements, reformat, re-indent, or normalize the declaration, because every one of
  those is a diff a user did not ask for in a file they will load into Rekordbox.
- **The identity read keeps `Key` as its third fallback**, matching the importer exactly, and this
  step adds the comment explaining why a `Key` attribute must never be *written*: it would land in
  that fallback chain.
- A track id present in the map and absent from the file is returned as a "not found" count, not
  raised. A whole-library export on a stale source will have some, and EXPORT-04 reports them.

**Tests**: A fixture XML carrying `POSITION_MARK` elements, a `TEMPO` element, nested `PLAYLISTS`
folders, a `PRODUCT` element, an XML comment, an unknown attribute and a non-ASCII title is exported
with one attribute changed on one track; every byte outside that attribute is identical, asserted by
comparing the two files rather than by re-parsing. The regression this pins is the phase's worst
possible bug and it is written first. A track whose effective values equal the file's is not touched
at all — the output is byte-identical to the input. `Rating="3"` with no CuePoint rating is not
rewritten; `Rating="3"` with a CuePoint rating of 4 becomes `Rating="204"`. `_rating_to_stars(
_stars_to_rating(n)) == n` for 0–5. `AverageBpm="128.00"` with an effective BPM of 128.0 is not
touched. All three key notations produce the expected `Tonality`. A source over `MAX_XML_SIZE_BYTES`
is refused before parsing. A write that raises mid-way leaves no file at the destination and no temp
file behind. `write_updated_collection_xml` and the five others no longer exist, asserted by the
boundary test's list and by import failure.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean. `ruff`, `mypy` clean. `grep -rn
"write_updated_collection_xml\|build_rekordbox_updates" src/` returns nothing.

**Risks**: Medium. The byte-preservation property is the phase's whole value and `ElementTree` is
not obviously the tool that keeps it — it normalizes attribute quoting and may reorder attributes on
write. If the byte-identical test cannot be made to pass with `ElementTree`, the answer is a
targeted attribute rewrite over the file's own text rather than a tree round-trip, and that
alternative is decided in this step rather than discovered in EXPORT-05. Record which was used and
why.

**Complexity**: **L**

---

## EXPORT-02 — Appending CuePoint's Playlist Tree

**Objective**: Turn a set of chosen Collections, Smart Collections and folders into `PLAYLISTS`
nodes appended to the patched document, without touching the mirrored Rekordbox tree.

**User-visible result**: None.

**Dependencies**: EXPORT-01.

**Existing code reused**: `iter_playlist_nodes` as the reference for the element shape Rekordbox
writes. `collections` and `collection_tracks` as they are. The browse query's scope resolution for a
Smart Collection's membership, unchanged.

**Design**:

- **One parent folder, named `CuePoint`**, appended as the last child of the root `PLAYLISTS` node.
  Everything this phase adds goes inside it, so a user can see at a glance which nodes are
  CuePoint's and delete them all in one gesture. The mirrored tree above it is not read, not
  reordered and not counted.
- **A name collision on that parent is resolved and reported**: if a top-level node named `CuePoint`
  already exists, the export uses `CuePoint (2)` and says so in the preview. It never merges into a
  node it did not create, because a node with that name may be the user's own.
- **DEC-059's folder structure is carried.** A Collection filed three folders deep exports at that
  path, as `FOLDER` nodes containing it. A folder the user did not select is created only when it is
  on the path to something selected.
- **Entries come from `collection_tracks` in `position` order** (DEC-058), so a Collection's
  arrangement survives and a repeated track exports as two entries pointing at one `TrackID`. The
  builder never dedupes.
- **A Smart Collection resolves to its rules at this moment** (DEC-081), through the existing
  count-plus-window path, in its stored `sort_field`/`sort_dir`. It exports as a plain playlist; the
  document says nothing about it having been smart, because Rekordbox has no such concept.
- **A track id the source file does not contain is dropped from the entry list and counted**
  (DEC-082). This is the only reason an exported playlist may be shorter than the Collection on
  screen, and it is reported rather than silent.
- **Missing-file tracks are not dropped** (DEC-088). "The file is gone" and "the XML has no such
  track" are different facts and only the second one can produce a dangling reference.
- **The node shape matches Rekordbox's own**: `NODE Type="0"` for a folder with `Count`, `NODE
  Type="1" KeyType="0"` for a playlist with `Entries`, and `TRACK Key="<TrackID>"` children — which
  is why EXPORT-01 refuses to write a `Key` attribute on a `COLLECTION/TRACK` while this step writes
  `Key` on a playlist entry, where it is the correct name. The `Count` and `Entries` attributes are
  computed after the drops, so they never disagree with the children.
- An empty Collection exports as a playlist with no entries rather than being skipped, because a
  user who selected it said something.

**Tests**: A three-level folder structure with two Collections and one Smart Collection exports with
the right nesting, and the mirrored tree is byte-identical to the source. A Collection whose entries
repeat a track exports two entries. Order is the Collection's, not the table's default. A Smart
Collection's entries are its current membership in its stored sort. An existing `CuePoint` node
causes `CuePoint (2)` and a reported collision. A dropped track id shortens `Entries` and is
counted. An empty Collection exports as an empty playlist. `Count` and `Entries` equal the children
after drops.

**Acceptance criteria / DoD**: A packaged-shell-independent test writes a real XML that Rekordbox's
own DTD expectations are checked against structurally, and the file opens in Rekordbox during
EXPORT-07's manual pass. Unit tests green, `ruff`/`mypy` clean.

**Risks**: Medium. The node shape is a vendor format read from real files rather than a published
spec, so `iter_playlist_nodes` and a real export are the reference. Getting `Count`/`Entries` wrong
is the likely defect and is tested directly.

**Complexity**: **M**

---

## EXPORT-03 — The Export Record Schema

**Objective**: One migration landing the two tables DEC-086 needs, plus their models. Nothing reads
or writes them yet.

**User-visible result**: None.

**Dependencies**: None (may be implemented before or after EXPORT-01/02).

**Existing code reused**: `migrations/m0011_clean.py` as the template;
`services/migration_runner.py` unchanged.

**Design**:

- **`m0020_rekordbox_exports.py`**, forward-only, following the rule that a phase's schema lands in
  one step so the DDL is right rather than adjustable.
- **`rekordbox_exports`**: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `job_id TEXT`, `started_at TEXT
  NOT NULL`, `finished_at TEXT`, `outcome TEXT NOT NULL CHECK (outcome IN ('written','cancelled',
  'failed'))`, `destination_path TEXT NOT NULL`, `source_path TEXT NOT NULL`, `source_stale INTEGER
  NOT NULL DEFAULT 0`, `track_count INTEGER NOT NULL`, `changed_track_count INTEGER NOT NULL`,
  `fields_json TEXT NOT NULL`, `key_format TEXT NOT NULL`, `missing_file_count INTEGER NOT NULL
  DEFAULT 0`, `dropped_reference_count INTEGER NOT NULL DEFAULT 0`, `error TEXT`. `key_format` is
  stored because DEC-089 makes it the only thing that can later explain why some tracks' keys read
  `8A`. `changed_track_count` is separate from `track_count` because DEC-079 writes only what
  differs, so "how many tracks did this actually change" is a different and more useful number.
- **`rekordbox_export_playlists`**: `id`, `export_id INTEGER NOT NULL REFERENCES
  rekordbox_exports(id) ON DELETE CASCADE`, `collection_id INTEGER`, `kind TEXT NOT NULL CHECK (kind
  IN ('collection','smart'))`, `name TEXT NOT NULL`, `path TEXT NOT NULL`, `entry_count INTEGER NOT
  NULL`, `dropped_count INTEGER NOT NULL DEFAULT 0`, `rules_json TEXT`.
- **`collection_id` is deliberately not a foreign key**, and `name`/`path` are stored as text. A
  Collection deleted next month must not erase the record of an export that contained it, and
  DEC-086 is explicit that the row records what CuePoint wrote rather than what still exists.
  `rules_json` is the Smart Collection's rule set as it was, for the same reason (DEC-081).
- **No per-track table, by decision** (DEC-086). The comment in the migration says so, naming the
  staleness bug DEC-061 refused, so nobody adds one later thinking it was an oversight.
- Every timestamp is ISO-8601 UTC text. Models beside the existing ones —
  `models/rekordbox_export.py`, frozen dataclasses with `from_row`, matching `TrackMetadata` and
  `Collection`.

**Tests**: The migration applies to a version-19 database holding real tracks, metadata,
Collections, attempts and overrides and changes none of them. Fresh and migrated schemas are
identical (extend the existing discovery test). Each CHECK rejects a value outside its vocabulary.
Deleting an export cascades its playlist rows. Deleting a Collection leaves both rows intact — the
test that pins the non-foreign-key decision. Models round-trip through `from_row`.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean with `m0020` in the chain; a
database from before this step opens, migrates and browses; no service reads the new tables yet.

**Risks**: Low-medium. Forward-only DDL under user data, but two additive tables with no foreign key
into anything that churns.

**Complexity**: **S**

---

## EXPORT-04 — The Preview

**Objective**: One engine-side call that answers, for a chosen set of playlists and a source file,
exactly what an export would write — computed, not estimated.

**User-visible result**: None yet; the numbers EXPORT-07 renders.

**Dependencies**: EXPORT-01, EXPORT-02.

**Existing code reused**: `library_source` and its repository for the recorded mtime and size.
`effective_value` and `effective_rating`. The browse query and its scope resolution for a Smart
Collection's count. `track_files` for the missing-file count. `parse_selection` and `resolve_scope`
for reading a scope off a request, unchanged.

**Design**:

- **`services/rekordbox_export_service.py::preview(...) -> ExportPreview`**, returning: the source
  path, whether it is stale and on which signal (`mtime`, `size`, or both) with the recorded and
  actual values, the total track count, how many tracks would change and in which fields (a count
  per field), the tracks in the file CuePoint does not know, the tracks CuePoint knows the file
  lacks, the missing-file count, the chosen key notation, each playlist with its kind, path, entry
  count and dropped count, and any name collision.
- **The preview walks the same queries the write walks.** This is the property that makes DEC-084's
  promise real: the preview is not a separate estimate that can drift, it is the write's own
  accounting with the serialization skipped. A test asserts a preview and a completed export of the
  same scope report identical numbers.
- **Staleness is `stat` only** (DEC-082): the recorded `xml_modified_at` and `xml_size_bytes`
  against the file's current values. Nothing is hashed, because the source may be hundreds of
  megabytes.
- **A missing or unreadable source is a refusal, not a warning** (DEC-082), returned as a typed
  error naming the path — the engine's existing error envelope, unchanged.
- **A library with no `library_source` row** — never imported — is the same refusal with its own
  reason, because there is nothing to patch.
- **"Would change" is computed per field with the difference rule from EXPORT-01**, so a library
  where nobody has overridden anything reports zero changed tracks and the export is honestly
  described as a copy with playlists appended.
- **The missing-file count is read, not computed** (DEC-088). If the library has never been checked,
  the preview says it has not been checked rather than reporting zero, because zero is a claim.
- The preview takes the key notation as an argument, since `Tonality` differences depend on it.

**Tests**: A stale source reports the signal and both values. An absent source refuses with the path
named. A library with no source row refuses with its own reason. A track with an override reports
one changed field; a track with none reports zero. A source carrying a value equal to the effective
value contributes nothing to the changed count. A never-file-checked library reports unchecked
rather than zero. A Smart Collection's entry count equals its browse count. Preview numbers equal
the numbers a real export of the same scope reports (the anti-drift test).

**Acceptance criteria / DoD**: Unit tests green; `ruff`/`mypy` clean; the preview over a
50,000-track library with 10,000 overrides returns in a time recorded here rather than asserted
vaguely.

**Risks**: Medium. The anti-drift property is easy to state and easy to lose the moment the write
gains a special case the preview does not know about; the shared-code-path design is what defends
it, and the test is what catches a regression.

**Complexity**: **M**

---

## EXPORT-05 — The Export Job

**Objective**: Run an export as a cancellable background job that writes the file, records what it
wrote, and raises an activity event.

**User-visible result**: A job in the status strip, an entry in Activity, and a file on disk.

**Dependencies**: EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04.

**Existing code reused**: `engine/jobs.py::create_job` with its lifecycle, cancel, persistence,
`exclusive` and `conflicts_with`. The activity writer. `library_refresh`'s job as the shape to
follow.

**Design**:

- **`create_job(job_type="rekordbox_export", exclusive=True, conflicts_with=("library_import",
  "match", "tag_write", "batch"))`**. Exclusive because two concurrent exports to one destination is
  meaningless; conflicting with the writers because an export is a snapshot of the database and a
  batch edit landing halfway through would produce a file that matches neither state. Mirrors the
  reasoning `create_job`'s own docstring gives for an import and a refresh.
- **The destination path is validated in Python before anything is parsed** (DEC-083): resolved and
  normalized, compared against the resolved source path, and refused if equal. The comparison
  survives a relative path, a trailing separator, a case difference on Windows and a symlink. A
  refusal is a typed error, not an exception in a log.
- **The write is temp-file-then-`replace`** in the destination's directory, as EXPORT-01 provides.
  So a cancel before the `replace` leaves nothing at the destination and no temp file, and there is
  no partial export.
- **No resume** (contrast DEC-065's match job): an export is cheap to repeat and has no expensive
  network work to preserve, so a cancelled export is simply gone. The job record says cancelled and
  the export row records `outcome='cancelled'`.
- **Progress is reported in two phases** — patching tracks, then building playlists — because the
  first is proportional to the collection and the second to the selection, and one bar that jumps is
  worse than two honest ones.
- **The export row and its playlist rows are written in the job's transaction**, after the `replace`
  succeeds for a `written` outcome, and with the reason for a `failed` one. `job_id` links the two.
- **One activity event on success**, carrying the destination, the track count, the changed count
  and the playlist count — enough for the Activity panel to say something specific without opening
  the row.
- Cancellation is checked between tracks and between playlists, so a cancel is observed in bounded
  time rather than after the whole collection.

**Tests**: A full export writes the file, one export row, its playlist rows and one activity event.
A cancel mid-patch leaves no destination file, no temp file, an export row with `cancelled` and no
activity event claiming success. A destination equal to the source is refused, including via a
relative path and a differing case on Windows. A second export while one is running is refused. An
export while an import is running is refused, and the reverse. A failure mid-write records `failed`
with the reason and leaves the destination untouched. The numbers in the export row equal the
preview's (EXPORT-04's anti-drift test, from the other side).

**Acceptance criteria / DoD**: Unit and integration tests green; a 50,000-track export's duration
and peak memory recorded here; `ruff`/`mypy` clean.

**Risks**: Medium. Memory is the one to watch: a 50,000-track document held as a tree while a second
is written is the phase's plausible out-of-memory, and EXPORT-01's choice of mechanism decides it.
Measure rather than assume.

**Complexity**: **M**

---

## EXPORT-06 — The Export API, the Save Dialog and the Desktop Contract

**Objective**: Put preview and export on the wire through all six contract files, and get the
destination from a native save dialog.

**User-visible result**: None directly; the bridge EXPORT-07 calls.

**Dependencies**: EXPORT-04, EXPORT-05.

**Existing code reused**: `showSaveDialogFor` in `main.ts`, already handling the parent-window
overloads. The CSV/JSON/Excel save-dialog IPC handler as the shape to follow. `parse_selection`. The
settings store for the remembered folder and notation. `desktopContract.test.ts` as the gate.

**Design**:

- **Routes**, under `/api/v1/rekordbox-export/` so nothing is confused with
  `services/export_service.py`: `POST /preview` (a playlist selection plus a key notation, returning
  `ExportPreview`), `POST /start` (the same plus a validated destination, returning a job id), `GET
  /history` (recent export rows with their playlists, for Settings and for pre-filling). Mutations
  are POSTs to action paths, as Phase 6 kept them.
- **The dialog is Electron's, the rule is Python's.** `main.ts` gains one IPC handler that opens
  `showSaveDialogFor` with an XML filter and a dated default name — `CuePoint Export YYYY-MM-DD.xml`
  — starting in the remembered folder. The renderer sends the chosen path to `/start`, which
  validates it (EXPORT-05). The dialog never decides whether a path is allowed.
- **Only the folder is remembered, never the filename** (DEC-083), so no export can silently
  overwrite the previous one. The folder is stored in settings, alongside the default key notation
  (DEC-089).
- **The six files, in order, with the supervisor written deliberately**: `rekordbox_export_api.py` +
  `server.py`, `engineClient.ts`, `engineSupervisor.ts`, `main.ts`, `preload.cjs`,
  `cuepointBridge.types.ts`. The supervisor forwards method by method and nothing type-checks it;
  cross-cutting fact 1 lists the four steps it has already bitten.
- **No token, no path and no Node API reaches renderer storage.** The destination path crosses the
  bridge as a value returned by a dialog the user drove, which is the existing pattern for the
  CSV/JSON/Excel export and for picking an XML to import.
- The preview response is typed once in `cuepointBridge.types.ts` and consumed from there; no
  hand-written shape in the renderer.

**Tests**: `desktopContract.test.ts` covers the new methods in all six files and fails if one is
missing. A renderer-side test asserts every bridge method the export UI calls exists. Engine route
tests: a preview over a scope, a start returning a job id, a start with the source path as
destination returning the typed refusal, a malformed selection returning a 400 rather than a 500,
`null` filters treated as absent (ORG-13's lesson). A `main.ts` test asserts the dialog's filter and
default name and that a cancelled dialog starts nothing.

**Acceptance criteria / DoD**: `npm run typecheck`, `npm run lint`, `npm test` in the renderer and
`python -m pytest src/tests/unit/engine` green; `PYTHONPATH=src python
scripts/smoke_engine_health.py` passes.

**Risks**: Medium-low, but the supervisor is the known trap. The other risk is naming: a route or
type that reads as the CSV export will be wired to the wrong thing by someone later.

**Complexity**: **M**

---

## EXPORT-07 — The Export Dialog, the Entry Points, and the Phase Comes Together

**Objective**: The UI a user actually drives, from both entry points, and the phase's acceptance.

**User-visible result**: Export works, end to end, in a packaged build.

**Dependencies**: EXPORT-06.

**Existing code reused**: `RefreshPreviewDialog.tsx` and `WriteTagsDialog.tsx` as the preview-then-
confirm pattern, including how they state counts and refuse to proceed. `LibraryHeader.tsx`'s action
bar, which already holds "Check for changes" and "Import a different collection…".
`CollectionsPane.tsx`'s context menu. Existing renderer tokens, themes and the integer scale.
`KEY_FORMATS`' three labels.

**Design**:

- **One dialog, reached two ways** (DEC-087, as amended). From the **Library header**, beside
  "Import a different collection…", it opens with nothing ticked; from a Collection or Smart
  Collection's context menu it opens with that node ticked. Both land in the same component, so
  there is one preview and one confirm path.
- **Not the selection Actions menu**, which DEC-087 first named. That button is drawn only when
  `count > 0`, so a library-wide action there would be unreachable until tracks were selected; and
  `SelectionActions.tsx` builds the toolbar menu and the row context menu from one array by design,
  so the entry would also appear on a right-clicked track. Import and export are the two ends of
  the library's relationship with its source file, and the header is where that already lives.
- **The route from a selection to a playlist is unchanged and deliberate**: "Add to Collection"
  (ORG-11), then export that Collection. Two steps, and the middle one produces an object with a
  name, a folder and a history that can be re-exported and edited — rather than an ephemeral
  playlist living only inside one exported file. One kind of exportable object is what keeps the
  preview, the export record (DEC-086) and the docs from each describing two.
- **The dialog states what will be written, in this order**: the destination (with a button to
  change it), the source file and any staleness warning, the track count and the changed count with
  its per-field breakdown, the playlists to be appended with their entry counts, then the warnings —
  tracks the file lacks, missing files, a name collision — and last the key notation.
- **The key notation carries its consequence at the point of choosing** (DEC-089): choosing anything
  other than classic shows one line saying that re-importing this file will store that notation as
  CuePoint's own key. Not a tooltip, not a docs footnote.
- **Staleness offers "Refresh first"** as a button, so the recommended path is one click (DEC-082).
  Taking it closes the dialog and starts a refresh; it does not queue an export to run afterwards,
  because the refresh may change what the user wanted to export.
- **Nothing is written until confirm**, and the confirm button says what it will do — "Export 3,880
  tracks and 4 playlists" — rather than "OK".
- **Empty and refusal states come from real engine responses**, not hand-written shapes: no source
  file, never imported, no Collections to append, a scope that resolves to nothing.
- **Settings gains an export section** (DEC-087): the remembered folder, the default notation, and
  the recent-export list from `GET /history`. It offers no way to start an export.
- **Pure UI logic is tested, not the pixels**: what the dialog says for a given preview response is
  a pure function of it, in the shape `tagWriting.ts` already established for `WriteTagsDialog`.
- **Documentation**: a user-guide page for export; `features.md` updated;
  `docs/release/CHANGELOG.md` under `Unreleased`. The docs say plainly that tags, notes and
  favorites do not reach Rekordbox (DEC-080), that the export is loaded in Rekordbox as a source
  rather than merged into its collection, that CuePoint never writes the source file, and that cue
  points and beat grids are preserved because the source file is patched rather than rebuilt — which
  is the sentence a DJ will actually look for.
- **ADR**: one recording that the export patches rather than generates, and why, because it is the
  architectural choice a future contributor is most likely to want to reverse.

**Tests**: Component tests for the dialog's text over each preview shape, including every warning
and each notation's consequence line. Both entry points open the dialog with the right
pre-selection, and a test asserts export appears in neither the selection Actions menu nor the
track context menu. The confirm button is disabled while a refusal stands. An E2E pass in the
packaged build: pick a destination, preview, export, and open the result in Rekordbox.

**Acceptance criteria / DoD**: The phase-level acceptance below, checked point by point and recorded
under this step.

**Risks**: Low-medium. The risk here is wording, not mechanism: a preview that undersells a warning
is how a user exports something they did not mean to.

**Complexity**: **M**

---

## Phase-level acceptance

Checked in a packaged build on Windows, with the macOS packaged checks owed alongside Phase 5's and
Phase 7's macOS passes.

1. A library imported from a real Rekordbox XML exports to a new file, and that file opens in
   Rekordbox as a source with its tree intact.
2. A track carrying hot cues, memory cues and a beat grid still carries all of them after a round
   trip through an export, verified in Rekordbox rather than only in a test.
3. A track with a CuePoint override for key, BPM, genre, label or year shows CuePoint's value in
   Rekordbox; a track without one shows what Rekordbox had, and its attribute was not rewritten.
4. A CuePoint rating shows in Rekordbox; a Rekordbox rating CuePoint never touched is unchanged.
5. A Collection exports as a playlist in the user's folder structure, in the user's order, with a
   repeated track appearing twice.
6. A Smart Collection exports as a playlist of its current membership.
7. Tags, notes and favorites appear nowhere in the exported file.
8. Exporting with the source file modified since import warns with real numbers and can still
   proceed; tracks the file lacks are dropped from playlists and counted.
9. Exporting with the source file deleted refuses and names the file.
10. Choosing the source file as the destination is refused.
11. A cancelled export leaves no file at the destination and no temp file anywhere.
12. An export appears in the status strip while it runs and in Activity afterwards, and the export
    record states the destination, the counts and the notation.
13. No audio file anywhere on the machine is modified by an export, verified by hashing a fixture
    library before and after.
14. The scale claims are measured and recorded at 50,000 tracks with 10,000 overrides and Phase 6's
    organization on top: preview duration, export duration, peak memory and output file size.
15. `write_updated_collection_xml` and the five other orphaned writers no longer exist.

## Deferred, with reasons

- **Writing CuePoint tags, notes or favorites anywhere outside the database** — DEC-080, DEC-085.
  Not deferred to a later phase so much as declined; tags-as-playlists remains available as an
  addition.
- **Cue point and beat grid parsing and storage** — not needed, because DEC-077 makes preserving
  them a property of not rebuilding rather than of modelling them. A phase that wants to *edit* a
  cue point needs this and will have to build it.
- **Incremental export, and "what changed since last export"** — DEC-086. The per-track stamp it
  needs is the staleness bug DEC-061 refused.
- **Exporting to Rekordbox's database directly, or to a USB export** — never proposed, out of scope,
  and a different safety conversation entirely.
- **Normalizing key notation on import**, which would make any exported notation round-trip —
  DEC-089. Belongs to whichever phase revisits DEC-034's capture-as-Rekordbox-has-it rule.
- **Correcting the legacy `BPM`/`Comment`/`Key` attribute names** — not deferred, mooted: EXPORT-01
  deletes the code that wrote them.
- **M3U or other playlist formats** — no decision requested one; inCrate's own playlist writing is
  untouched and Phase 9's concern.
