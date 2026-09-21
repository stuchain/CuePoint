# CuePoint v1.0.0 — Phase 8: Rekordbox Export, Detailed Step Specifications

Status: **EXPORT-01…EXPORT-07 implemented. Phase acceptance checked on Windows (below); opening
the result in Rekordbox itself, and the macOS packaged checks, are owed.**
The seven steps below replace the roadmap's placeholder inventory (EXPORT-01…EXPORT-08, which
Round 10's answers came in one under).
Per the process, no implementation happens from this document — each step needs an explicit
"Implement EXPORT-NN" instruction, scoped to exactly that step, and its outcome is recorded under
the step afterwards. The one open point this specification raised — where export is reached from —
was settled while writing it, as an amendment to DEC-087; there are no open points.

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

## EXPORT-01 — The XML Patch Writer, Replacing the Orphaned One ✅ IMPLEMENTED 2026-09-20

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

### ✅ IMPLEMENTED 2026-09-20

**Outcome**: Complete. `data/rekordbox_export.py` holds `patch_collection_xml`, which splices
attribute values into a copy of the source and touches nothing else; `_stars_to_rating` sits beside
`_rating_to_stars` in `rekordbox.py`, derived from the same table so the two directions cannot
disagree. The orphaned cluster is gone: `write_updated_collection_xml`, `build_rekordbox_updates`,
its `_batch` twin, `write_key_comment_year_to_playlist_tracks`, its `_batch` twin and
`write_tags_to_paths`, plus `_normal_key_value`, `_short_key`, `_rekordbox_classic_key` and
`_camelot_to_classic`, which had no caller once the six went. `_CAMELOT_TO_CLASSIC` stayed:
`services/override_values.py` reads the table. 535 lines left `rekordbox.py`.

**The mechanism question the risk section left open, answered: expat offsets, not `ElementTree`.** A
tree round-trip cannot make the byte promise — it drops comments, rewrites the declaration,
re-escapes text its own way and normalizes empty elements — so a "patched" file would differ from
its source in thousands of places nobody asked to change, and a diff would be useless for telling
whether CuePoint did what it said. `xml.parsers.expat` gives the exact byte offset of every start
tag, which is all a targeted rewrite needs, and it is a real parser: the fixture's `<TRACK
TrackID="999">` inside an XML comment is not mistaken for an element, and a `TRACK` under
`PLAYLISTS` is not either. Attribute values arrive unescaped, so comparison is on real values while
the rewrite works on bytes.

**Three decisions taken while implementing, each recorded where it belongs.**

1. **The writer takes a rendered key, not a key and a notation.** The specification listed
   `key_text` under "existing code reused", but it lives in `services/` and nothing in `data/`
   imports from `services/` — checked, and true of every other module there. Rendering in the data
   layer would have inverted the layering to save the caller one line. So `TrackExportValues.key` is
   the text to put in `Tonality`, and `key_text` stays the one converter, a layer up. The tests
   render through it, so the three notations are still proved end to end here.
2. **The key is compared as rendered text, while BPM, year and rating are compared parsed.** DEC-079
   said "compared on the parsed value" for all of them, which cannot be right for the key: parsed,
   `Am` and `8A` are equal, so a Camelot export would silently write no Camelot. DEC-079 now says
   this precisely and gives the reason.
3. **`refuse_source_as_destination` lives here, not in EXPORT-05.** The specification put the
   destination check in the job. A writer that can overwrite the source is a footgun whoever calls
   it, so the check is at the lowest level that writes and EXPORT-05 will call the same function
   rather than a second copy.

**Measured**, on a 20.9 MiB source of 50,000 tracks carrying 100,000 position marks and 50,000 tempo
elements, patching 10,000 tracks across all six fields — 60,000 attribute writes: **1.70 s**.
Scaling is linear (12,500 / 25,000 / 50,000 tracks → 0.28 s / 0.55 s / 1.10 s at three fields), so
nothing here is quadratic. Every position mark and tempo element survived, and the 11 MB tail of
40,000 untouched tracks was byte-identical. An early 15.6 s reading was `tracemalloc` overhead, not
the writer.

**Tests**: `src/tests/unit/data/test_rekordbox_export.py`, 106 of them. The first asserts that
changing one attribute leaves every other byte identical, by comparing the files rather than
re-parsing them — the check that would have caught a generated document. Twelve parametrized
fragments prove the cues, grid, `PRODUCT`, comment, unknown attribute, numeric entity, playlist tree
and declaration all survive. A 500-track case makes 600 splices and then asserts the 400 untouched
tracks are byte-identical, because a four-track fixture can hide an off-by-one. Eleven cover shapes
a valid document may use and Rekordbox does not — whitespace around `=`, a start tag broken over
lines, a tab separator, a paired tag with nothing to append after, an already-escaped value equal to
ours, a `COLLECTION` deeper than the root, a decoy inside CDATA, a BPM past the parser's ceiling,
and attributes in the reverse of the field order, which is the shape that needs the splices sorted
rather than merely produced. The rest cover the differs-only rule field by field, both rating
encodings, `Rating="3"` left alone and `Rating="3"` → `204`, zero stars as a rating against zero
year as unknown, an absent attribute added, blank values never clearing one, all three notations,
escaping for both quote styles, single-quoted attributes keeping their quoting, a BOM, both
encodings' treatment of a non-ASCII value, a refused UTF-16 declaration, malformed XML, the oversize
refusal proved to happen *before* parsing, the four ways of naming the source as the destination,
atomicity under a failed `replace`, and that all ten retired names are gone from the module and the
package.

**Eight mutations were introduced deliberately to prove the tests bite**, and all eight failed the
suite: `AverageBpm` → `BPM` (the orphaned writer's actual bug), ignoring the differs-only rule,
dropping the escaping, patching playlist entries as well as collection tracks, stamping an extra
attribute, comparing BPM as text, leaving the splices unsorted, and treating an ASCII-declared
document as UTF-8. The unsorted one passed at first — the sort was defensive but unexercised,
because every fixture happened to list its attributes in field order — which is why the
reverse-order test exists.

**Two bugs found and fixed.** The first was mine, in a test:
`test_the_untouched_track_reads_back_unchanged` compared whole `LibraryTrack` objects, and
`created_at`/`updated_at` default to the clock — so it passed alone and failed in the full
directory, whenever the two parses fell in different microseconds. It now compares every field
except those two, with a second test asserting those two are the only ones excluded. The second was
in the writer, found by reading it back rather than by a failing test: a document declaring
`us-ascii` was being spliced with UTF-8 bytes, which would have produced a file contradicting its
own declaration — malformed, and refused by the next parser to open it. A non-ASCII value now goes
into such a document as numeric character references, so the export still succeeds and the file
stays valid. Rekordbox writes UTF-8, so this only bites on a collection from somewhere else.

**Also**: `test_file_write_boundary.py` was updated as this step removed functions, and it caught
something worth having caught — `rekordbox.py` no longer reaches `tag_writer` at all, so that
allowance was stale. `ALLOWED_IMPORTERS` now records that CLEAN-10's service is the only route from
the runtime into `tag_writer`, and that only the package re-export reaches the new patch.

**Not done here, deliberately**: no CHANGELOG entry. Nothing a user can do changed — the writer has
no caller until EXPORT-05 and no UI until EXPORT-07 — and inventing a user-facing line for an
unreachable function would be describing a feature that does not exist yet. The phase's entry
belongs in EXPORT-07 with the rest of its documentation.

**Checks run**: the full `python -m pytest src/tests -m "not slow"` — **7,220 passed, 65 skipped** —
plus, after the last tests were added, `src/tests/unit` (6,836 passed, 46 skipped),
`src/tests/integration` and `src/tests/regression` (368 passed, 12 skipped), and
`src/tests/unit/data` three consecutive times after the flake fix. `ruff check src/`, `ruff format
--check src/` (593 files) and `python scripts/check_no_qt_in_core.py` are clean, and
`test_step55_mypy_validation.py` type-checks the data layer green. `mypy src/` reports nothing
attributable to either changed file; its 2,772 findings across 479 files are the repository's
pre-existing baseline.

---

## EXPORT-02 — Appending CuePoint's Playlist Tree ✅ IMPLEMENTED 2026-09-20

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

**Outcome**: Complete. The tree is rendered by the same module and written in the same pass:
`patch_collection_xml` gained a `playlists` argument taking a tree of `ExportFolder` and
`ExportPlaylist`, and reports one `PlaylistResult` per playlist written. `PatchResult` gained
`playlists`, `playlist_folder`, `playlist_folder_renamed` and a `dropped_reference_count` that sums
the drops. 605 lines joined `rekordbox_export.py`.

**Why the same pass, rather than a second function over the first one's output.** Appending is a
second change to the same document. Doing it afterwards would mean reading and rewriting the file
twice, and reading back a destination the caller has just been handed — the shape
`refuse_source_as_destination` exists to stop anyone talking themselves into. One read, one splice
list, one atomic write, and a failure anywhere still leaves nothing behind.

**Four decisions taken while implementing.**

1. **The tree arrives resolved; nothing here knows what a Collection is.** The specification listed
   "the browse query's scope resolution for a Smart Collection's membership" under existing code
   reused, but that is a database question and this is `data/`, which imports from no service and
   opens no connection. So a Smart Collection's membership, a Collection's stored order and the
   folders they are filed under are resolved by EXPORT-04 and EXPORT-05, which run those queries
   once for the preview and once for the job — which is what will make "the preview cannot disagree
   with the result" a property rather than a hope. The consequence here is that every one of these
   166 tests runs without a database, so the two riskiest steps of the phase are also the two
   cheapest to prove.
2. **CuePoint's folder goes inside the tree's root folder, and that folder's `Count` is corrected.**
   "Beside the mirrored tree" read two ways; Rekordbox settles it, since a node appended as `ROOT`'s
   sibling is outside the tree Rekordbox reads. `ROOT` therefore gains a child — and a folder
   declaring `Count="3"` while holding four is a document contradicting itself, with Rekordbox as
   the reader that has to choose. That one attribute is the only thing this step writes outside its
   own subtree, it is set to the real number of children rather than the old number plus one, and a
   root that never declared a `Count` is not given one. DEC-078 now says all of this.
3. **A playlist carries the caller's own token back out.** `ExportPlaylist.ref` is never written to
   the file and comes back in the result. EXPORT-05 records one row per exported playlist, and
   matching those rows on the name or the path would be guessing: two Collections in different
   folders may share a name, and DEC-086 stores what CuePoint wrote rather than what still exists.
4. **The insertion matches the document rather than imposing a style.** The newline is whichever the
   file uses, the indentation unit is derived by dividing the container's own indentation by its
   depth, and a document written without line breaks gets an insertion without any — a block of
   pretty-printing in the middle of a single line would be a change to how the file is written,
   which is not this step's business, and the same reasoning as DEC-077's. The indentation is read
   in two places, better one first: the whitespace before a paired container's closing tag is the
   indentation that tag sits at, and it is right even where the start tag shares its line with
   something else; a self-closing container has no such run, so there the start tag's own line
   answers.

**Three document shapes no Rekordbox export has are handled rather than refused**, because the
alternative is an export that silently drops the playlists a user explicitly asked for: a
self-closing `ROOT` (which an empty library really does produce) is opened into a pair, a
`PLAYLISTS` with no folder inside gets one, and a document with no `PLAYLISTS` at all gets both. A
`PLAYLISTS` holding playlists directly gets a sibling rather than a parent invented around somebody
else's nodes.

**A name is written as it will be read.** A tab or a newline inside an attribute value is legal but
every parser turns it into a space, so it becomes one here instead of appearing to survive.
Surrounding whitespace goes for the same reason: `_playlist_node_from_element` trims a name it
reads, as does every other reader of this tree, so a name written with it would not be the name
anybody sees. Characters XML 1.0 cannot represent are dropped, because the promise this module makes
is a well-formed file. A tree deeper than `MAX_EXPORT_DEPTH` (16, against `MAX_COLLECTION_DEPTH`'s
8) is refused by name, because a `RecursionError` from inside a splice is not a usable failure.

**Measured**, on a 17.3 MiB source of 50,000 tracks carrying 100,000 position marks and 50,000 tempo
elements, patching 10,000 tracks *and* appending 200 playlists in 20 folders — 24,000 entries:
**1.86 s**, against EXPORT-01's 1.70 s for the attribute half alone. Every position mark and tempo
element survived, and the 13.9 MiB tail of 40,000 untouched tracks was byte-identical.
`iter_playlist_nodes` read the result back in 0.61 s and found all 221 nodes with all 120 entries
each.

**Tests**: 55 more in `test_rekordbox_export.py`, 166 in the file. The first is EXPORT-01's property
restated for this half: the exported file is asserted to equal the source with one spelled-out block
inserted and one `Count` digit changed, and nothing else — on the bytes, so an appender that
reformatted the mirror while adding to it fails here rather than passing a structural comparison.
The rest cover the three-level nesting read back through `iter_playlist_nodes`, the node shape
attribute by attribute, `Count` and `Entries` asserted to equal the children actually written for
every node in a document, a repeated track exporting twice against a `COLLECTION` that still holds
it once, the Collection's order rather than the table's, a dropped reference shortening `Entries`
and being counted, a blank reference, the arithmetic that entries plus drops is the Collection's own
length, an empty Collection as an empty playlist, a legacy `ID` track as a valid reference, a track
whose file is gone staying in (DEC-088), the collision going to `CuePoint (2)` then `(3)` and
folding case, a `CuePoint` folder deeper in the tree not counting, the existing folder left
untouched beside ours, a `Count` that was already wrong coming out right, `small.xml`'s root gaining
no `Count` because it never had one, all four container shapes with their indentation asserted, tab
indentation, CRLF, a compact document, a root element sharing its line with the declaration, names
carrying XML syntax and non-ASCII in an ASCII document, a newline, surrounding whitespace and a
control character in a name, a `>` inside the root folder's *own* name — which a scan looking for
the first `>` after the element name would splice into the middle of — a document whose `PLAYLISTS`
comes before its `COLLECTION` so the splices run the other way, the depth refusal leaving no
destination behind, and a 2,000-entry playlist because a four-entry fixture can hide an off-by-one.

**Seventeen mutations were introduced deliberately to prove the tests bite**, and all seventeen
failed the suite: leaving the root `Count` stale, writing a track the file does not hold, deduping a
repeated entry, counting `Entries` from what was asked for rather than what was written, a playlist
written with a folder's `Type`, an entry named with `TrackID` instead of `Key`, merging into an
existing `CuePoint` folder, a case-sensitive collision check, an unescaped name, a name keeping
characters XML cannot represent, a self-closing container treated as a pair, wrappers closed in the
order they opened, the tree appended beside the root folder instead of inside it, a folder `Count`
of zero, an ASCII document given a UTF-8 playlist name, and each of the two indentation readings
disabled in turn. The second of those survived at first: the tests covering a self-closing container
checked that it had been opened into a pair without checking where the block landed, so the fallback
reading was unexercised — which is why those two now assert the indented block in full.

**Two test defects of my own, both found by running rather than by reading**: an assertion expecting
`Genre="House"` where the fixture's track is single-quoted and a patch keeps a value's own quoting,
and `Path.write_text`, which translates a line feed into the platform's line ending and so handed a
test a CRLF document it had not spelled. Documents are now written through a `_write_xml` helper
that writes bytes, and CRLF is a case of its own.

**Checks run**: `python -m pytest src/tests/unit` — **6,899 passed, 46 skipped** — and
`src/tests/integration src/tests/regression src/tests/acceptance` — **368 passed, 19 skipped** —
both exit 0, plus `src/tests/unit/data` and the export file alone many times during the work. `ruff
check src/`, `ruff format --check src/` (593 files), `python scripts/check_no_qt_in_core.py` and
`git diff --check` are clean, and the mypy gates (`test_step55_mypy_validation.py`,
`test_mypy_foundation.py`) pass 7. `mypy` reports nothing attributable to any changed file.

**Still owed by this step's DoD**: the file opening in Rekordbox itself, which belongs to
EXPORT-07's manual pass and is recorded there rather than claimed here. Everything structural the
criterion asked for is asserted — the document re-parses, and CuePoint's own reader walks the
appended tree and finds every node, kind, path and entry where it should be.

---

## EXPORT-03 — The Export Record Schema ✅ IMPLEMENTED 2026-09-20

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

**Outcome**: Complete. `m0020_rekordbox_exports.py` creates `rekordbox_exports` and
`rekordbox_export_playlists` with one index, and `models/rekordbox_export.py` holds
`RekordboxExport` and `RekordboxExportPlaylist` — frozen dataclasses with `to_dict` and `from_row`,
beside `FileWrite` and `Collection`. Nothing reads or writes either table, and a test asserts that
rather than leaving it to review.

**Four DDL decisions, taken against the specification's own column list and recorded as an amendment
to DEC-086.**

1. **`missing_file_count` is nullable and carries no default.** The specification gave it as `NOT
   NULL DEFAULT 0`, which is the one thing DEC-088 says the record must not do: a library nobody has
   file-checked "reports that it has not been checked rather than reporting zero", and a defaulted
   column can only make the claim. Null is "never checked". This is the decision worth having taken
   now rather than later — the schema is forward-only, so the row would have carried that claim for
   the life of the product, and EXPORT-04's preview would have had nowhere to put an answer it is
   explicitly required to give.
2. **`source_stale` carries `CHECK (source_stale IN (0, 1))`**, as `guard_ok`, `is_winner`, `done`
   and `pending` each do. A flag that can hold 2 is not a flag.
3. **`key_format` carries no `CHECK`, deliberately.** DEC-089 puts that vocabulary in
   `services/tag_write_options.py::KEY_FORMATS` and says the export validates against it rather than
   restating it. A `CHECK` here would be a restatement in the one place a forward-only schema could
   never revise, so a fourth notation would need a migration before a record could hold it. Two
   tests pin the consequence: an invented notation stores, and the model accepts one too.
4. **`rekordbox_export_playlists.export_id` is indexed**, which m0009's rule requires and the
   specification did not name: SQLite scans the whole child table on a parent delete unless the
   referencing column is indexed. `EXPLAIN QUERY PLAN` is asserted, not assumed. Nothing else is
   indexed — "the most recent export", which DEC-083 pre-fills the next destination from, is already
   the last rowid.

**The models import from `cuepoint.models` and from nowhere else**, which every other model in the
package already does and a test now pins for this one. That is why `key_format` is validated as
required text rather than against `KEY_FORMATS`, which lives a layer up: the notation is refused
where it is chosen, and the record stores what was used. The two kinds a playlist row can have are
*not* spelled again either — `EXPORTED_KINDS` is `(KIND_COLLECTION, KIND_SMART)`, imported from
`models/collection.py`, so a folder cannot become an exported playlist by anybody's oversight.

**Three invariants the schema cannot express, held in the models.** `changed_track_count` may not
exceed `track_count`, because the two are read side by side and a pair that cannot both be true is
worth refusing where it is built. A failed export must say why and a written one must not carry an
error, as `FileWrite` already requires of a skipped write. And a Smart Collection's row must record
its rules while a Collection's must not — DEC-081 makes the rules the only thing that can later
explain a smart count, and rules beside a Collection would suggest they had a part in a membership
that was simply stored.

**Tests**: 118 in `test_rekordbox_export_schema.py`. The specification's six are all there — a
version-19 library holding tracks, overrides, Collections, entries, attempts, candidates, match
state, a file check, a tag write, activity and the mirrored playlist tree migrates with every row
of every table unchanged; the upgraded schema equals a fresh one; each CHECK refuses what is
outside it; deleting an export takes its playlist rows and nothing else; deleting a Collection, the
folder above it, or every track it counted leaves both rows intact; and both models round-trip
through `from_row`. Beyond them: renaming a Collection does not rewrite the record, a deleted Smart
Collection's rules and count survive, every column's nullability and default is asserted in both
directions, a never-checked library and a checked-and-clean one are proved to be different rows and
different records, ids are proved not to be reused after a delete (DEC-083 reads the last one), the
parent delete is proved to use its index, every value `KEY_FORMATS` holds is proved storable, and
the library still browses and still reads its Collections after the upgrade.

**Twenty-two mutations were introduced deliberately to prove the tests bite**, and all twenty-two
failed the suite: the null count defaulted to zero, the staleness CHECK dropped, the index dropped,
the cascade dropped, `folder` added to the kinds, `running` added to the outcomes, `collection_id`
made a cascading foreign key into `collections`, a `key_format` CHECK added,
`dropped_reference_count` made nullable, `AUTOINCREMENT` removed, `entry_count` made nullable, a
per-track column added to the playlist table, and in the models: the count comparison, the failure
reason, the written-with-an-error refusal, both rule-set rules, `KIND_FOLDER` added to the kinds,
the field-list shape check, the staleness flag read for truthiness, a null missing-count read back
as zero, and the key vocabulary restated.

**Two test defects of my own, both found by running rather than by reading**: a helper taking
`export_id` positionally, so the one case that nulls that column could not go through it; and a
parametrized negative-count case where the column under test was also the column being held at zero,
so the second write undid the first and nothing was refused. A third was a test that searched the
model's source text for each notation, which a docstring using the word "normal" would have failed —
replaced by one that looks for a second vocabulary and one that proves the model accepts a notation
it has never heard of.

**One thing added outside this step's files**: `models/rekordbox_export.py` is now in
`test_mypy_foundation.py`'s `GUARDED` list, beside every other model of its vintage. A new typed
module that is not in that list is not type-checked, and nothing would have said so.

**Checks run**: the full `src/tests/unit` (7,017 passed, 46 skipped — 6,899 as EXPORT-02 left
it, plus the 118 new here, and nothing else moved), `src/tests/integration src/tests/regression
src/tests/acceptance -m "not slow"` (368 passed, 19 skipped), `ruff check src/`, `ruff format
--check src/` (596 files), `python scripts/check_no_qt_in_core.py`, `git diff --check`, and the mypy
gates (`test_mypy_foundation.py`, `test_step55_mypy_validation.py`, 7 passed). The DoD's "a database
from before this step opens, migrates and browses" is the version-19 fixture, asserted rather than
tried by hand.

---

## EXPORT-04 — The Preview ✅ IMPLEMENTED 2026-09-21

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

**Outcome**: Complete. `services/rekordbox_export_service.py` answers `preview(collection_ids,
key_format) -> ExportPreview`: the source and its staleness, the track count, what would change and
in which fields, the two counts for the tracks the file and the library do not share, the
missing-file count, the notation, each playlist with its path and its drops, and the parent folder's
name with any collision. It writes nothing, and a test asserts nothing outside `bootstrap.py` and
`interfaces.py` can even name it yet.

**The anti-drift property is structural, not a second implementation kept in step.** This is the
step's one real design decision and it was taken against the obvious reading of the specification.
"The preview walks the same queries the write walks" could have been satisfied by a preview that
calls the same repositories and then counts for itself; that is exactly the shape that drifts,
because the counting is the part that gains a case. So `data/rekordbox_export.py` was split instead:
`plan_collection_xml` is `patch_collection_xml` with `_write_atomically` left out, both go through
one `_plan`, and the service turns the `PatchResult` either of them returns into the numbers to show
through one `report`. A number in the preview and a number in the result are now the same expression
evaluated once, and the test that runs a real export of the same plan compares the whole result
rather than a few fields.

**A plan, then a preview of it.** `plan(...)` produces what a write needs — the effective values per
track, the playlist tree resolved to track ids in export order, the source, its staleness and the
missing-file count — and `preview_of(plan)` walks it. EXPORT-05 takes the same plan to
`patch_collection_xml` and reports through the same `report`, so the job needs to add a destination,
a transaction and an activity event and nothing else. `ExportPlaylist.ref` carries the Collection's
id out and back, which is what lets a result be reported against the right node when two Collections
in different folders share a name.

**Five decisions taken while implementing.**

1. **The parse belongs in the preview, and DEC-084 said otherwise.** That decision's last
   implication had the size guard, the parse and the serialization all inside the job "so a large
   source file does not block the preview either". But the numbers DEC-084 itself requires the
   preview to state — how many tracks would change, in which fields, and which ids the file does not
   hold — cannot be known without reading the file. The preview therefore re-parses, applies the
   size guard first exactly as the write does, and stops before serializing. DEC-084 now says that,
   with the measurement beside it.
2. **The track count is the file's own, not the library's.** The export patches the source rather
   than generating a document, so what lands in the exported file is the source's `COLLECTION`.
   Reporting the library's count would describe a file nobody is going to get, and the two DEC-082
   counts either side of it — tracks the file holds that CuePoint does not know, tracks CuePoint
   knows the file lacks — are what reconcile the two. A test asserts that arithmetic rather than
   leaving a reader to do it.
3. **Staleness has three answers, not two.** `stale` is True, False, or `None` when the import's own
   `stat` failed and there is nothing to compare against — the same conservative shape
   `SourceFileState.changed` already has, for the same reason: "I cannot tell" and "it is the same
   file" lead a user to opposite actions. The signals that differ are named (`mtime`, `size`, or
   both) with the recorded and actual values beside them.
4. **Three refusals, because they are three different things to do.** `source_never_imported`
   (import a library), `source_missing` (find the file again) and `source_unreadable` (a permission,
   a lock, a dead share) are carried as reasons on a typed `ExportSourceError`, which is a
   `ValidationError` so the engine's existing handling applies unchanged. The path is on the error,
   not only in the sentence.
5. **An explicitly chosen folder with nothing in it exports nothing.** EXPORT-02 argued that an
   empty `CuePoint` folder in a DJ's tree is litter rather than a result, and the same applies one
   level down: a folder carries no user content of its own, so a folder with no exported playlist
   beneath it is not written — while an empty *Collection* still is, because a user who chose it
   said something. The preview shows zero playlists, so the consequence is visible before anything
   is confirmed.

**The two layers are resolved once, in Python.** `models/rekordbox_export_values.py` holds
`ExportTrackValues`: one row carrying both layers for one track, resolving each field through
`effective_value` and `effective_rating` — which it imports rather than reimplements, asserted by
identity rather than by grepping for a name. `TrackRepository.iter_export_values` streams them for
the whole library in one `LEFT JOIN`, deliberately *not* resolving in SQL: the browse query already
mirrors the rule as `COALESCE(override, imported)`, and a third spelling of it in the one read that
produces a file a user loads into Rekordbox is a third thing to keep in step. A test runs the browse
vocabulary's own expression over the same library and asserts the six values agree field by field,
which is DEC-079's anti-drift requirement met from the direction that matters.

**Two reads were added and one count was given a third answer.**
`TrackRepository.iter_export_values` is above. `FileStatusRepository.missing_count()` returns
`Optional[int]`: `None` when no track has ever been checked, which is DEC-088's "reports that it has
not been checked rather than reporting zero" and the same distinction `missing_file_count`'s
nullable column was made for in EXPORT-03. Both are declared on their interfaces, and
`cuepoint/persistence/` is already inside the mypy gate.

**Tests**: 130 in `test_rekordbox_export_preview.py`. The specification's eight are all there — a
stale source reporting its signal and both values, an absent source refusing with the path named, a
library with no source row refusing with its own reason, one override reporting one changed field
and none reporting zero, a source already carrying the effective value contributing nothing, a
never-checked library reporting unchecked rather than zero, a Smart Collection's entry count equal
to its browse count, and the anti-drift test. Beyond them: a folder standing for everything beneath
it at any depth, a Collection exporting at the path it is filed under, a folder nobody chose left
out, the same node named twice exported once, an empty Collection as an empty playlist, a repeated
track exporting twice against a `COLLECTION` that holds it once, a dropped reference counted once
per appearance, drops summed across playlists, an existing `CuePoint` folder going to `CuePoint (2)`
with the collision reported, a Smart Collection in its saved sort read back through
`iter_playlist_nodes`, its membership paged at one id per query to prove a large one is not
truncated, its broken rules refused where they are run, all three notations with Camelot rewriting
every key the file spells classically, a key the converter cannot read writing nothing, a rating of
zero stars beating a rated file, a `Rating="3"` some other tool wrote left alone, an unreadable
file, a file that disappears between the check and the read, an oversized one refused before
parsing, a malformed one refused by name, a source whose stat the import never recorded, a source
that holds one track twice, and the preview proved to write no file and to leave the source byte for
byte as it was.

**Twenty-nine mutations were introduced deliberately to prove the tests bite.** Twenty-eight failed
the suite; the twenty-ninth could not be expressed, and that was the useful one. It was "create a
folder with nothing exported inside it", and it survived because the guard it broke was unreachable:
a folder reaches the builder only when it is in `keep`, and `keep` holds nothing but exported
playlists and their ancestors. The branch was a claim no test could check, so it is gone and the
guarantee is where it actually lives. Three others survived the first run for a reason worth
recording too — the fixture had one unknown track and one absent track, so swapping DEC-082's two
counts changed nothing, and no source repeated a `TrackID`, so "tracks changed" and "elements
patched" were the same number. Three tests were added to tell each pair apart and all three
mutations then failed. The rest covered the never-checked count answered as zero, the missing count
read as the checked count, the resolution taking the import over the override, the rating's two
layers swapped, a blank Rekordbox id let through, the export read made an INNER JOIN, the two layers
swapped in it, the stream stopping after one batch, the notation validated against nothing, only
overridden tracks sent to the writer, an unknown collection id skipped instead of refused, the
folders on a Collection's path dropped, a Collection's repeats deduplicated, a Smart Collection read
as stored rows, its membership read one page and no more, staleness decided by the size alone, an
unrecorded stat read as unchanged, a missing source reported rather than refused, an unreadable one
reported as missing, a source row with no path taken as a source, the collision not reported, the
key left in whatever notation it is stored in, a folder's contents not reached beyond one level, an
element with no id counted as a track CuePoint knows, and — the one that would matter most — the
preview writing a file.

**Measured**, on a 20.8 MiB source of 50,000 tracks carrying 100,000 position marks and 50,000 tempo
elements, with a 50,000-track library of which 10,000 carry a genre override, 20 Collections holding
500 tracks each and one Smart Collection: **2.98 s** for the whole preview — 1.00 s to build the
plan (50,000 tracks' two layers, 21 playlists resolved to 35,000 entries in order) and 1.99 s to
walk the document. In Camelot, where every one of the 50,000 keys is rewritten rather than 10,000
genres, it is 5.88 s. Writing the same plan for real costs 5.24 s on top and produces a 22.0 MiB
file, and the preview and the export were asserted equal on that run as well as in the suite.

**Two things the specification listed that were not used, and why.** `parse_selection` and
`resolve_scope` read a scope off an HTTP request; the preview takes collection ids and a notation,
and reading a request is EXPORT-06's. And the browse query's scope resolution is reached through
`CollectionService.resolve` rather than directly, so a Smart Collection's membership here is the one
the Library table shows — which is the property DEC-081 needs and a second call site could not
promise.

**Checks run**: the full `src/tests/unit` (7,147 passed, 46 skipped — 7,017 as EXPORT-03 left it
plus the 130 new here, and nothing else moved), `src/tests/integration src/tests/regression
src/tests/acceptance -m "not slow"` (368 passed, 19 skipped), `ruff check src/`, `ruff format
--check src/`, `python scripts/check_no_qt_in_core.py`, `git diff --check`, and the mypy gates
(`test_mypy_foundation.py`, `test_step55_mypy_validation.py`), with the new model and the new
service added to `GUARDED`. `test_file_write_boundary.py` still passes unchanged:
`plan_collection_xml` calls nothing that writes, so the module's writers are the same two functions
they were.

---

## EXPORT-05 — The Export Job ✅ IMPLEMENTED 2026-09-21

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

**Outcome**: Complete. `engine/rekordbox_export_jobs.py::start_rekordbox_export` validates on the
calling thread and starts a `rekordbox_export` job; `RekordboxExportService.export` writes the file
and records how it ended; `persistence/rekordbox_export_repository.py` is the first and only code to
touch EXPORT-03's two tables, and a test now pins it as the only one. Every export that gets past
validation ends in exactly one row — `written` with its playlists and one `rekordbox.exported`
activity event, `cancelled` or `failed` with neither — and the job's state, error and result say the
same thing as the row.

**The row is EXPORT-04's report, recorded.** `export` builds the same `ExportPlan` the preview
builds, hands it to `patch_collection_xml` instead of `plan_collection_xml`, and turns the result
into numbers through the same `report`. So the anti-drift property from the other side is not a
second comparison: the job's result carries the report, and a test asserts it equals the preview of
the same scope and that every count on the row is the report's.

**Two phases of progress and three places to stop, in the writer.** `patch_collection_xml` and
`plan_collection_xml` gained `on_progress(phase, done, total)` and `should_cancel()`. Tracks are
reported every 1,000 and at both ends; playlists one by one. A stop is asked between every track,
between every playlist, and once more after the temp file is written and before it replaces anything
— the last moment it can be honoured, because afterwards the file is the user's. A stop raises
`ExportCancelled`, which is deliberately not a `ValidationError`, and in every case the destination
is left as it was and the temp file is removed. The one thing not interruptible is expat's parse
itself, about a second at 50,000 tracks. The job samples the ticks every 0.1 s as every job does,
except that each phase's first and last always get through.

**Six decisions taken while implementing.**

1. **The export joins `LIBRARY_JOB_TYPES`, and conflicts with nothing else.** The specification's
   list — "library_import", "match", "tag_write", "batch" — named job types loosely ("match" is the
   retired inKey type) and was one-directional: `create_job` checks only the new job's list, so an
   import started *during* an export would not have been refused. Joining the group makes the
   refusal run both ways with no new mechanism, and it covers exactly the jobs that change what an
   export reads: import, both halves of a refresh, and batch edits and reverts. A match records
   attempts and applies no values, a tag write changes audio files and its own record, and a file
   check's count is read once and recorded as what the last check found; none of them conflict, and
   a test proves a match and an export run side by side.
2. **Refusals happen before a job exists.** `validate` checks the notation, the source, the
   destination, every chosen node, and that every chosen Smart Collection's rules can run —
   everything that can be known cheaply. So the specification's "a refusal is a typed error, not an
   exception in a log" holds literally: the caller gets `ExportDestinationError` or
   `ExportSourceError` with a reason and the path, and no job, row or event exists. The job
   validates again as it starts, because the source can go in between; a refusal there fails the job
   with the refusal's own code and still records no row.
3. **The destination must end in `.xml`, must not be a folder, and must be in a folder that
   exists.** DEC-083 refused only the source. A destination ending `.mp3` would have replaced
   somebody's audio file with a Rekordbox collection, which DEC-085 says this phase never does — so
   DEC-085 is now held at the destination too. The other two are paths a save dialog cannot produce,
   and creating folders nobody chose is not an export's business; the writer's own `mkdir` stays for
   its existing callers, and the service refuses before reaching it. Recorded in DEC-083.
4. **A row's counts are what was written.** A cancelled or failed export records zero changed
   tracks, no fields and no playlist rows, qualified by its outcome; staleness, notation and the
   missing-file count are facts about the moment and are recorded whatever happened. The alternative
   — the plan's numbers on a row that wrote nothing — would describe a file that does not exist.
   Recorded in DEC-086.
5. **The row, its playlists and its event are one transaction, after the `replace`.** So the row
   never claims a file that is not there. The reverse is possible and is not hidden: if the database
   refuses the row after the file is written, the job fails with the reason and the file stays,
   because it is the user's and deleting it would be a second, worse mistake. A test makes the
   activity write refuse after the file is in place and asserts that neither the row nor its
   playlists survive while the file does.
6. **The destination is recorded absolute.** A relative path meant something only relative to the
   engine's working directory; the row records where the file actually went.

**Also in this step.** The status strip names the job "Exporting to Rekordbox" rather than falling
through to "Working" — the specification's user-visible result is "a job in the status strip", and
"Exporting" alone would read as the CSV export. `test_file_write_boundary.py` gains the service as
the second and last module allowed to reach the writer, which its own comment had reserved for this
step, and `test_persistence_boundary.py` lists the service beside the other services that open a
transaction and run no SQL — the full unit run caught that on its first pass. The service's tests
moved into `services/rekordbox_export/` with a `conftest.py`, so the preview's and the export's
tests share one library by fixture rather than by importing one test module into another.

**Measured**, on a 20.8 MiB source of 50,000 tracks with 100,000 position marks and 50,000 tempo
elements, a library of 50,000 tracks with 10,000 genre overrides, and 21 playlists holding 35,000
entries, each export in a process of its own so the peak is the export's: **3.12 s and a peak
working set of 161 MiB** (46 MiB before it started), writing 21.9 MiB. In Camelot, where all 50,000
keys are rewritten, 6.18 s and 181 MiB. The risk this step named — a document held as a tree while a
second is written — does not arise: EXPORT-01's byte splice holds the source once, the splices and
the output once, and no tree at all.

**Tests**: 115 new. `test_rekordbox_export_progress.py` (19) covers the two phases and the three
stopping points against a previous export already at the destination.
`rekordbox_export/test_rekordbox_export_write.py` (57) covers the specification's list — a full
export writing the file, one row, its playlists and one event; a cancel leaving no file, no temp
file, a `cancelled` row and no event; the source refused by its own path, a relative path, a `..`, a
different case on Windows and a symlink; a failure mid-write recorded with its reason and the
destination untouched; and the row's numbers equal to the preview's — and beyond it: every other
destination refusal, every other refusal recording nothing, a Smart Collection's row keeping its
rules, cue points and grid surviving, a cancel at each stopping point, a failure with no message
still saying what it was, and the row and the event rolling back together.
`test_rekordbox_export_repository.py` (16) covers the reads and the transaction.
`engine/test_rekordbox_export_jobs.py` (23) runs real job threads over a library a real import job
imported: refusals that never become jobs, two exports refused, an import and a batch refused during
an export and an export refused during an import or a refresh, a match not held up, and cancel,
failure and an unexpected error each ending job and row in agreement. The symlink case skips on a
Windows account without the privilege to make one; EXPORT-01's comparison it relies on is tested
there.

**Thirty-five mutations were introduced deliberately to prove the tests bite, and all thirty-five
failed the suite**: each of the three stopping points removed, the tracks phase never reported
finished, folders counted as playlists, the temp file left behind, every destination refusal removed
in turn and the suffix compared case-sensitively, the destination recorded as given, a cancel
recorded as a failure, a failure recorded without its reason, no playlist rows, a smart row without
its rules, every field recorded rather than the changed ones, staleness and the missing count
dropped from a written row, the row written outside the transaction, an unknown node and broken
rules left for the job to find, repeated ids kept, the stop before the walk removed, a cancelled row
counting tracks it did not write, the latest export chosen whatever its outcome, history oldest
first, the export conflicting with nothing, the export left out of the library group, validation
skipped at start, a cancel and a failure each reported as success, a cancel never passed on, and a
phase's last tick sampled away.

**Checks run**: the full `src/tests/unit` (7,261 passed, 47 skipped — 7,147 as EXPORT-04 left it
plus 114 new, the 115th being the symlink case, which skips), `src/tests/integration
src/tests/regression src/tests/acceptance -m "not slow"` (368 passed, 19 skipped), the renderer's
`npm test` (2,577 passed), `npm run typecheck` and `npm run lint` (exit 0; its three warnings are in
files this step does not touch), `ruff check src/`, `ruff format --check src/`, `python
scripts/check_no_qt_in_core.py`, `git diff --check`, and the mypy gates with the job module added to
`GUARDED`. `mypy` reports nothing new: the six findings in `library_refresh.py`, which this step
touched only to add one member to a tuple, are the same six at HEAD.

**Not done here, deliberately**: no CHANGELOG entry, for EXPORT-01's reason — nothing a user can do
starts an export until EXPORT-06 puts it on the wire and EXPORT-07 draws it. And a process killed in
the middle of the write can leave one `cuepoint_export_*.xml` temp file in the chosen folder, since
nothing survives to delete it; the job record is closed out as interrupted at the next start, as
every job's is, and no row is written.

---

## EXPORT-06 — The Export API, the Save Dialog and the Desktop Contract ✅ IMPLEMENTED 2026-09-21

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

**Outcome**: Complete. `engine/rekordbox_export_api.py` answers `POST
/api/v1/rekordbox-export/preview`, `POST /api/v1/rekordbox-export/start` and `GET
/api/v1/rekordbox-export/history`, routed from `server.py` beside Clean and organization in ORG-08's
shape — the module says what it handles and what each refusal is, the server sends it. The three
methods and the save dialog move through all six contract files in the order the specification gave:
`engineClient.ts`, `engineSupervisor.ts`, `main.ts` (three `engine:` handlers and
`dialog:saveRekordboxExport`), `preload.cjs`, and `cuepointBridge.types.ts`, where the preview, the
refusal, the started export, the job's result and the history are each typed once.
`electron/rekordboxExportDialog.ts` holds the dialog's options, apart from `main.ts` so they can be
tested; `renderer/src/api/rekordboxExportBridge.ts` names the eight bridge methods the export UI
will call, so EXPORT-07 reaches the bridge through one door.

**A refusal crosses the bridge as a value, not a rejection.** The specification asks for "a start
with the source path as destination returning the typed refusal", and implementing it found that
nothing typed survives the trip: `readJson` throws the envelope's message alone, and Electron then
flattens any rejection to its message, so the reason, the path and a busy job's id never reach the
renderer. The engine still answers with its normal envelope — 400
`REKORDBOX_EXPORT_DESTINATION_REFUSED`, 409 `REKORDBOX_EXPORT_SOURCE_REFUSED`, 409 `LIBRARY_BUSY`,
each carrying `reason`, `path` or `job_id` — and the two client methods that can meet one turn
exactly those three codes into `{ preview | started, refusal }`, with exactly one set. Anything else
still throws in the engine's words: a malformed body is a bug, not a state for a dialog to draw.

**Six decisions taken while implementing.**

1. **The remembered folder and notation are read from the export record, not kept as settings.** The
   specification said "stored in settings"; DEC-086 already names the recorded destination as what
   pre-fills the dialog, and a copy in `config.yaml` would be a second store that could disagree
   with where the last export went and would need its own rule for a cancelled one.
   `RekordboxExportService.remembered()` answers the folder and notation of the last export that
   *wrote*, and whether the folder is still there; the history carries it, and `main.ts` asks for it
   when the dialog opens, so the shell holds no path and the renderer never stores one. The cost,
   stated in DEC-083's precision: the default notation changes by exporting in another, not by a
   separate setting, so EXPORT-07's Settings section shows these rather than holding them (DEC-087
   cross-referenced).

2. **A preview is refused exactly when a start would be refused for a busy library.** Without this
   the dialog would compute numbers during an import that are about to change, then offer a confirm
   that can only fail. `refuse_if_library_busy` checks the same `LIBRARY_JOB_TYPES` the start
   conflicts with — the pattern Clean's tag-write preview already uses — and a match does not hold
   it up, as it does not hold up a start. Recorded in DEC-084.

3. **A source the patch cannot read is a typed refusal, `source_invalid`.** A preview over a source
   that is too large, not well-formed or in an encoding the writer cannot write back used to raise a
   bare `ValidationError`, which would have reached the dialog as a generic 400. It is now an
   `ExportSourceError` with its own reason, so EXPORT-07 can offer "import again" rather than "fix
   your request". It stays a `ValidationError`, so every existing handler still applies.

4. **`start_rekordbox_export` answers with the job and the export as validated.** The route must say
   what will be written — the destination made absolute, each node once — and learning that by
   validating a second time would be a race: a source that vanished in between would answer 409 for
   a job that had already started. It now returns `StartedRekordboxExport`, the shape
   `start_match_job` and the file check already use.

5. **`parse_selection` is not used.** It reads a *track* selection; an export's unit is a Collection
   (DEC-087), so the body is `collection_ids` and `key_format`, both optional, `null` read as absent
   (ORG-13's lesson), and an unknown key refused. A missing or `null` `destination_path` reaches the
   service as blank and comes back as its own `destination_blank`, like every other destination
   refusal.

6. **The dialog can reopen at a previous choice.** `chooseRekordboxExportDestination` takes an
   optional `currentPath`, used only if it is an absolute `.xml` path, so "change destination" in
   EXPORT-07 does not start over. It decides where the dialog opens and nothing else; the dialog
   judges no path, starts nothing, and a cancel — including one that still reports the text that was
   in the box — answers `{ canceled: true }`.

**Also in this step.** `test_retired_inkey_routes.py` looked for the retired `export_api` module as
a substring of every engine file, and `rekordbox_export_api` contains it — the naming risk this
step's specification named, arriving as a false alarm. It now matches whole identifiers, with a test
that it still catches `engine.export_api` and does not catch the new module. And
`test_rekordbox_export_preview.py`'s guard that "no route names the service yet" now expects exactly
the job and this module.

**Tested end to end, not only in layers.** The real TypeScript `EngineClient`, bundled with esbuild,
was run against a real `python -m cuepoint.engine` over a temporary `CUEPOINT_HOME`: a preview
refused before any import with `source_never_imported`, an import, a preview with `null` notation
and a node named twice, a bad notation thrown in the engine's words, the source as destination
refused with its reason and path and nothing started, an export in Camelot run to `succeeded` with
the file written and the source byte-identical, the history answering it with its playlist and
remembering its folder and notation, and the dialog options built from that live history starting in
that folder — 22 checks, all passing.

**Tests**: 135 new in Python and 102 in TypeScript. `engine/test_engine_rekordbox_export_api.py`
(93) runs a real engine over a library a real import job imported and covers the specification's
list — a preview over a scope, a start returning a job id whose job writes the file, the source as
destination returning the typed refusal and starting nothing, malformed selections as 400s never
500s, `null` read as absent — and beyond it: every other destination and source refusal, a busy
library for the preview and the start, the token on every route, the history's order, shape, clamped
limit and remembered folder, and every branch of `status_for`.
`engine/test_rekordbox_export_contract.py` (20) holds every TypeScript interface and union in
`engineClient.ts` against what Python actually serializes, from real objects — the one comparison
`desktopContract.test.ts` cannot make, because Vite will not read a file outside its app.
`test_rekordbox_export_remembered.py` (11) covers what is remembered and what never is; the job and
preview tests gain 10 more. On the TypeScript side, `rekordboxExportDialog.test.ts` (23) asserts the
filter, the dated name, the starting folder in each case and that a cancelled dialog starts nothing;
`engineClient.rekordboxExport.test.ts` (15) the refusal translation; `rekordboxExportBridge.test.ts`
(24) evaluates the runtime preload and asserts every method the export UI calls exists on it; and
`desktopContract.test.ts` gains 40 for the six files.

**Fifty mutations were introduced deliberately to prove the tests bite, and all fifty now fail the
suite.** Forty-eight did on the first run. The two that survived were test gaps and each gained a
test: a dialog that reports a path on cancel answered as a choice, and the accessor losing
`cancelJob` unnoticed because its tests iterated the list they should have pinned. The fifty span
`null` refused, a bool taken as an id, an unknown field let through, each typed refusal flattened or
losing its reason, a busy library a 500, the preview beside a busy library, the history unclamped,
the start answering what was sent, unreadable rules passed on, the routes unwired, the busy check
narrowed or blind to ended jobs, an unusable source untyped, a cancelled export or the file name
remembered, a gone folder said to exist, every failure drawn as a refusal, the reason or the busy
job dropped, a busy library thrown, the history posted, the month off by one, a gone folder opened,
an engine failure stopping the dialog, a relative or non-XML previous choice taken, a cancel
answered with a file, any file offered, no overwrite confirmation, and each of the six contract
files missing its piece.

**Checks run**: the full `src/tests/unit` (7,396 passed, 47 skipped), `src/tests/integration
src/tests/regression src/tests/acceptance -m "not slow"` (368 passed, 19 skipped), `python -m pytest
src/tests/unit/engine` inside that, `PYTHONPATH=src python scripts/smoke_engine_health.py` (OK), the
renderer's `npm test` (2,641 passed), `npm run typecheck` (clean) and `npm run lint` (exit 0; its
warnings are in files this step does not touch), the Electron workspace's `npm test` (431 passed)
and `npm run typecheck` (clean), `oxlint -D correctness` over the touched Electron files, an esbuild
bundle of `main.ts`, `ruff check src/`, `ruff format --check src/`, `python
scripts/check_no_qt_in_core.py`, `python scripts/check_desktop_version_coupling.py`, `git diff
--check`, and the mypy gates with the API module added to `GUARDED`.

**Not done here, deliberately**: no CHANGELOG entry, for EXPORT-01's reason — the routes exist but
nothing in the UI calls them until EXPORT-07. No Electron E2E: there is no screen to drive yet, and
the preload, the IPC channels and the dialog's options are each tested against the real files;
EXPORT-07's packaged pass covers the dialog opening for real. The preview's cost is EXPORT-04's
measured 3.0 s at 50,000 tracks — the route adds only the serialization — so it was not measured
again.

---

## EXPORT-07 — The Export Dialog, the Entry Points, and the Phase Comes Together ✅ IMPLEMENTED 2026-09-21

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
  so the entry would also appear on a right-clicked track. Import and export are the two ends of the
  library's relationship with its source file, and the header is where that already lives.
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
pre-selection, and a test asserts export appears in neither the selection Actions menu nor the track
context menu. The confirm button is disabled while a refusal stands. An E2E pass in the packaged
build: pick a destination, preview, export, and open the result in Rekordbox.

**Acceptance criteria / DoD**: The phase-level acceptance below, checked point by point and recorded
under this step.

**Risks**: Low-medium. The risk here is wording, not mechanism: a preview that undersells a warning
is how a user exports something they did not mean to.

**Complexity**: **M**

**Outcome**: Complete on Windows. `screens/library/RekordboxExportDialog.tsx` is the one dialog,
reached from the Library header and from a new context menu on the Collections tree, and
`screens/library/rekordboxExport.ts` makes every sentence it shows — pure functions of the engine's
answer, in `tagWriting.ts`'s shape. It states what will be written in the specification's order: the
destination with **Choose…**/**Change…**, the source and any staleness with **Refresh first**, the
tracks and the changed count broken down by field, the playlists with their paths and entry counts,
the warnings, and last the key notation with its consequence line beside it. Confirm says what it
will do ("Export 3,880 tracks and 4 playlists"), is disabled — and says why — while a refusal
stands, before a destination is chosen and while a preview is being asked, and nothing is written
until it is pressed. The export is then followed as a job with **Stop**, and ends in what it wrote,
how to open it in Rekordbox, and **Show in folder**. `screens/RekordboxExportSettingsPanel.tsx` is
Settings' section: where the next save dialog opens, the notation it starts in, and the recent
exports by how each ended, with no way to start one.

**Seven decisions taken while implementing.**

1. **Import and export share one header menu, "Collection file".** The first version added a third
   button beside "Check for changes" and "Import a different collection…". Every unit test passed;
   the full end-to-end run failed ORG-13's journey, and measuring the packaged window found why: at
   the default size and scale the header is about 600 pixels wide, the three labels need over a
   thousand, and each button took a line of its own — a 471-pixel header over a track table 20
   pixels tall. "Check for changes" stays a button; the other two are the items of one menu, which
   is also the relationship DEC-087's amendment gave as the reason they belong together. The header
   measures 271 pixels again (273 before this step), and the journey now asserts the table keeps its
   height at the default window size. Recorded in DEC-087.

2. **The Collections tree gained a context menu.** DEC-087 names "the context menu of a Collection",
   and the tree had none — every row action was a trailing button. `PaneTree` gained
   `onRowContextMenu`, answered for right-click, the menu key and Shift+F10, and the Collections
   section draws `TrackContextMenu` with what its buttons do plus **Export to Rekordbox…**. The
   buttons stay, because a menu is not what a first-time user finds.

3. **The entry is offered on folders too.** The export reads a chosen folder as everything filed
   under it (EXPORT-04) and the dialog lets one be ticked, so the one row it would be missing from
   is the one a DJ exporting "Gigs" would right-click. Recorded in DEC-087.

4. **The preview is asked for as the choices change, not by a button.** A preview is a read that
   costs 3.4 s at 50,000 tracks and nothing below that, so it is asked 150 ms after the last tick or
   notation change, an answer to an older question is dropped, and the numbers for the old choice
   leave the screen while the new one is asked — a count shown beside a choice it does not describe
   is the underselling this step's risk names. Confirm acts only on the preview of the choices on
   screen.

5. **A busy library is waited for, not only reported.** A preview or a start refused because an
   import, refresh, batch edit or other export holds the library names the job; the dialog follows
   that job and asks again when it ends, so "an import is running" resolves by itself. A refused
   destination stands until another file is chosen, with **Choose another file…** beside it; a
   source that is gone offers **Import a different collection…**, which closes the dialog and runs
   the page's own import.

6. **The dialog's fixtures are produced by the engine.** "Empty and refusal states come from real
   engine responses, not hand-written shapes" is met as CLEAN-12 met it:
   `test_rekordbox_export_dialog_fixture.py` builds nineteen situations over a real library — a copy
   that changes nothing, a chosen scope in each notation, a stale and an unknowable source, a name
   collision, an empty folder and an empty Collection, five refusals and a busy library, a written
   and a cancelled result, history with and without exports — and holds
   `rekordboxExport.fixture.json` to what the engine answers, with paths moved to a fictional user's
   folder and times fixed by what they record. A change to the payload fails in Python, where it was
   made.

7. **The missing-file count links to Clean** (DEC-088) through a new `cleanSectionState`: the
   location opens the Clean page on Missing files, once per navigation, without making it the tab
   Clean remembers. Recorded in DEC-088.

**Documentation.** `docs/user-guide/rekordbox-export.md` is new and says plainly what the
specification lists: tags, notes and favorites do not reach Rekordbox; the export is opened in
Rekordbox as a second library ("rekordbox xml"), not merged; CuePoint never writes the file it
imported; and cue points and beat grids are kept because the file is patched, not rebuilt.
`features.md`, `organization.md` (which still said export was "a later release"), `library.md`, the
docs index and the changelog are updated. **ADR-006** records that the export patches rather than
generates, with the signals that would justify revisiting it.

**Tests**: 21 new in Python and 132 in the renderer, and one end-to-end journey.
`rekordboxExport.test.ts` (59) holds every sentence against the engine's fixtures: each notation's
consequence line, staleness with its real numbers, every warning in the specification's order, a
never-checked library not counted as zero, the confirm label and what blocks it, every refusal's
words and next step, and what is sent for a ticked folder. `RekordboxExportDialog.test.tsx` (44)
covers both pre-selections, the order of the sections, each warning and notation line drawn, confirm
disabled while a refusal stands, a late answer dropped and old numbers taken away, the destination
chosen and reopened, a start refused, a stop, a failure, a busy library waited for, and Refresh
first handing off. `LibraryScreen.export.test.tsx` (11) opens the dialog from the header's menu with
nothing ticked and from a Collection's and a Smart Collection's context menu with that node ticked,
and asserts **export appears in neither the selection Actions menu nor the track context menu**. The
Collections pane (+9), Settings (7) and Clean's section link (+2) have theirs.
`e2e/rekordboxExport.spec.ts` drives the real window through the whole of it (below).

**Forty-one mutations were introduced deliberately to prove the tests bite, and all forty-one now
fail the suite.** Thirty-five failed on the first run; one could not be applied as written and was
corrected, and one survived — the dialog drawing an old preview's numbers while a new question was
being asked — which gained the test in decision 4. The rest covered each notation's line, staleness,
every blocker of confirm, the confirm label, both missing-file branches, the collision, the folder
rules, each refusal's next step, a playlist's drop count, the size fallback, the remembered
notation, the late answer, the busy retry, the start refusal, closing while running, the reopened
destination, broken Smart Collections, import and stop going missing, Refresh first starting an
export, both entry points' pre-selection, the dialog left open behind a refresh, the missing bridge,
folders left out of the menu, the keyboard menu, the selection moving on right-click, the header's
two menu items and its fallback, and Clean's link remembering its tab or taking any string. The
fixture test was checked the same way: changing one field of the preview's payload fails three
states.

**Checks run**: the full `src/tests/unit` (7,417 passed, 47 skipped), `src/tests/integration
src/tests/regression src/tests/acceptance -m "not slow"` (368 passed, 19 skipped), the renderer's
`npm test` (2,773 passed), `npm run typecheck`, `npm run lint` (exit 0; its eight warnings are in
files this step does not touch) and `npm run build:check`, the Electron workspace's `npm test` (431
passed) and `npm run typecheck`, the whole E2E suite against the development build (47 passed, 1
skipped), the export journey three times in a row against the packaged build
(`release/win-unpacked`, rebuilt with a fresh engine sidecar), `ruff check src/`, `ruff format
--check src/`, `python scripts/check_no_qt_in_core.py`, `python
scripts/check_desktop_version_coupling.py`, `PYTHONPATH=src python scripts/smoke_engine_health.py`,
the mypy gates and `git diff --check`.

**Packaging on Windows.** `npm run pack` failed at electron-builder's download of its Windows
code-signing tools: the archive holds symbolic links, which Windows lets an ordinary account create
only in Developer Mode. Developer Mode was turned on, the stale cache and the partial extractions
left by earlier failed attempts were deleted, and a pack from nothing then downloaded, extracted and
stamped the executable with its product name first time. `docs/development/developer-setup.md` now
names Developer Mode as a prerequisite for packaging on Windows; CI's runners do not meet the
problem.

**Found and fixed after the phase was recorded: the engine could outlive the app.** A packaged run
left a `cuepoint-engine.exe` running with no app — on its port, holding the library database,
reachable by nothing. Two causes, each with a fix and a test that fails without it. First, `main.ts`
stopped the engine in an `async` `before-quit` listener, which Electron does not wait for, so a quit
could finish while the player was still being disposed and the engine was never stopped;
`electron/quitAfter.ts` now holds the first quit until the cleanup has finished, for at most five
seconds (`quitAfter.test.ts`, 7). Second, an app that is killed or crashes runs no cleanup at all,
and while Windows ends the processes an app started along with it, it does not end what those start
in turn — and a packaged engine is a bootloader and its child, so the child survived, every time.
The shell now passes its own process id as `CUEPOINT_PARENT_PID`, and `engine/parent_watch.py` ends
the engine when that process has gone, holding it by a handle on Windows so a reused id cannot pass
for the app (`test_parent_watch.py`, 22, including a real engine outliving a killed stand-in without
the watch and exiting with it). `e2e/engineLifetime.spec.ts` drives both against the real app:
killing it outright left one engine behind in the packaged build before the fix, and after it passes
three times in a row packaged and once in development, with no engine left anywhere.

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

## Phase 8 acceptance, checked (2026-09-21)

In a packaged Windows build unless said otherwise. **Owed**: opening the result in Rekordbox itself
(points 1–6 ask for it), because doing so from here would change the Imported Library setting of the
Rekordbox installed on this machine, which is the user's; and every macOS packaged check, alongside
Phase 5's and Phase 7's.

1. **Met, except the look in Rekordbox, which is owed.** A collection exported to a new file in the
   packaged journey, and the file read back through CuePoint's own importer — the reader built for
   Rekordbox's files — with its tree intact: the mirrored `Journey` playlist, the `CuePoint` folder
   and `Saturday` with its four entries. Opening it in Rekordbox 6 as the Imported Library is the
   user's step; the guide says how.
2. **Met in the file; the look in Rekordbox is owed.** A track with a hot cue, a memory cue and a
   beat grid carries all three byte for byte after the export, asserted in the journey, and
   EXPORT-01 proved the same at 50,000 tracks with 100,000 position marks.
3. **Met in the file; the look in Rekordbox is owed.** A key override is written (`Tonality="Cm"`,
   and `5A` in Camelot); a track without one keeps what Rekordbox had and its attribute is not
   rewritten (DEC-079, EXPORT-01's byte-identity tests, the journey).
4. **Met in the file; the look in Rekordbox is owed.** A CuePoint rating of five stars is written as
   `Rating="255"`; `Rating="0"` and `Rating="255"` that CuePoint never touched are left as they were
   (the journey; EXPORT-01's `Rating="3"` test).
5. **Met.** A Collection filed in the user's order, with a closing reprise, is written as `Saturday`
   inside `CuePoint` with its four entries in that order and the repeated track twice (the journey;
   EXPORT-02 for nested folders).
6. **Met.** A Smart Collection is written as a playlist of what it matches at that moment: `Techno`,
   holding its one member, exported from its own context menu in the journey; EXPORT-04 holds its
   count to the Library's browse of it.
7. **Met.** A note, a tag and a favorite set on a track appear nowhere in the exported file (the
   journey), and the patch writes six attributes and nothing else (EXPORT-01).
8. **Met.** A source saved again after the import is reported with its modified time and size,
   recorded and actual, and **Refresh first** is offered — and the export can still be confirmed
   (the journey; the dialog's tests over the engine's stale fixture). Tracks the file lacks are
   dropped from playlists and counted, per appearance (EXPORT-04, the dialog).
9. **Met.** With the source moved away, the preview refuses and names the file, and confirm is
   disabled (the journey).
10. **Met.** Choosing the source as the destination is refused with "an export never writes over
    it", confirm is held until another file is chosen, and the source is byte-identical afterwards
    (the journey; EXPORT-05 for a relative path, a case difference and a symlink).
11. **Met, in the engine's tests.** A cancel at each of the three stopping points leaves no file at
    the destination and no temp file (`test_rekordbox_export_write.py`,
    `test_rekordbox_export_progress.py`); the dialog's **Stop** reaches the job and says nothing was
    written. A 3-track export in the packaged journey finishes before a person could stop it.
12. **Met.** The export runs as a `rekordbox_export` job the status strip names "Exporting to
    Rekordbox" (EXPORT-05); afterwards it is in Activity as `rekordbox.exported`, and the record
    states the destination, the counts and the notation — asserted through the bridge in the
    packaged journey and shown in Settings.
13. **Met.** The journey hashes every audio file of its library, and the source, before and after
    exporting: all byte-identical. `test_file_write_boundary.py` still holds that nothing in the
    phase can reach a tag writer (DEC-085).
14. **Met, and measured again end to end.** Through a real engine process at 50,000 tracks with
    10,000 overrides, a folder of 20 Collections of 500 and a Smart Collection (35,000 entries, 21
    playlists): preview **3.4 s**, export **3.6 s**, the engine's peak working set **222 MiB**
    across both previews and both exports, and a **21.9 MiB** file from a 20.8 MiB source. In
    Camelot, where all 50,000 keys are rewritten: 7.3 s and 7.6 s, 22.0 MiB. EXPORT-04 and EXPORT-05
    measured the service alone at 3.0 s and 3.1 s with a 161 MiB peak.
15. **Met.** `write_updated_collection_xml`, `build_rekordbox_updates` and the other orphaned
    writers exist nowhere in `src/`; `test_rekordbox_export.py` asserts their absence.

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
