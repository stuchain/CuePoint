# CuePoint v1.0.0 — Phase 7: Clean, Detailed Step Specifications

Status: **Specified. CLEAN-01 to CLEAN-04 implemented.** The fourteen steps below replace the
roadmap's placeholder inventory (CLEAN-01…CLEAN-13, which Round 9's answers outgrew by one). Per
the process, no implementation happens from this document — each step needs an explicit
"Implement CLEAN-NN" instruction, scoped to exactly that step, and its outcome is recorded under the
step afterwards.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`), Phase 3
(`PHASE3_LIBRARY.md`), Phase 4 (`PHASE4_LIBUI.md`) and Phase 6 (`PHASE6_ORG.md`), all complete, and
on Phase 5 (`PHASE5_PLAYER.md`), all steps implemented. Decision Rounds 1–9 apply (`DECISIONS.md`,
DEC-001…DEC-076; DEC-011 and DEC-076 carry amendments dated 2026-09-13, settling the two open points
this specification raised). Phase 7's own decisions are DEC-065…DEC-076, alongside DEC-004 (accept
and apply are separate), DEC-021 (inKey re-homes into Clean), DEC-036 (inKey moves onto the
library), DEC-037 (files unchecked until now), DEC-041 (`ResultsTable` converges), DEC-047 (the
Inspector gains a Beatport comparison), DEC-057 (the two-layer model this phase reuses), DEC-063
(the batch path) and DEC-064 (the file-writing discipline this phase relaxes for exactly one job).

## What this phase is

Every phase so far has left inKey exactly where Phase 0 found it: a screen that asks for an XML file
and a playlist name, matches those tracks against Beatport, shows the results in memory, and forgets
them when the window closes. Meanwhile the library beside it grew a database, a browser, a player,
and a layer of the user's own data. This phase moves matching into that library. A match belongs to
a track, survives a restart and a re-match, is reviewed on a page built for reviewing, and its
values are applied into a layer a refresh cannot touch and a revert can take back.

Around that core sit the three detections the roadmap has deferred here since Phase 3 — missing
files, duplicates, and a health summary built from both — and artwork, which Round 9 brought in.

It is also the first phase since inKey that **writes into the user's audio files**. Phase 6 wrote
nothing outside the database (DEC-064). This phase keeps that discipline for everything except one
explicit, previewed job that records every value it replaces before replacing it (DEC-070).

**What this phase is not.** It does not change how matching scores anything — `core/matcher.py`'s
guards, weights and bonuses are untouched, and the one parser change it makes (artwork) is proved
not to move a score. It does not export to Rekordbox (Phase 8). It does not relocate files
(DEC-073), delete tracks or files (DEC-074), or compute a health score (DEC-075). It does not make
title, artist, remixer or album editable (DEC-069). It does not match tracks automatically on import
(DEC-065). It does not touch the Python CLI, its flags, or its per-run output files. It does not
move inCrate onto the library or retire its inventory database (DEC-030, Phase 9).

## What the earlier phases already built

The gap analysis called this "the one phase most dominated by reuse, don't rebuild", and reading the
code confirms it. Read this table before writing any of it again:

| Already exists | Where |
| --- | --- |
| The matcher: queries, guards, scoring, early exit, time budget | `core/matcher.py`, `core/query_generator.py`, `core/mix_parser.py` |
| One-track matching, returning every candidate and query | `services/processor_service.py::process_track(idx, Track, settings) -> TrackResult` |
| Parallel matching over a track list, with cancel and pause | `process_playlist_from_m3u` / `process_playlist_from_xml` — both a `ThreadPoolExecutor` over `process_track`, sized by `TRACK_WORKERS` |
| The candidate record: score, title/artist similarity, bonuses, guard verdict, rejection reason, query | `models/beatport_candidate.py` |
| The track shape matching consumes | `models/track.py::Track` |
| Text normalization and mix parsing | `core/text_processing.py::normalize_text`, `core/mix_parser.py::_parse_mix_flags` |
| Key notation conversion (classic, Camelot, short) | `data/rekordbox.py::_rekordbox_classic_key`, `_camelot_to_classic`, `_short_key` |
| Tag writing for ID3 (MP3, AIFF, WAV) and Vorbis (FLAC, OGG) | `data/tag_writer.py::write_key_comment_year_to_file` |
| The sync options: key format, per-field toggles, comment text | `engine/sync_tags_api.py::_normalize_sync_options`, `renderer/src/api/syncTagsUtils.ts` |
| CSV/JSON/Excel export | `services/export_service.py`, `services/output_writer.py` |
| Background jobs: thread-per-job, cancel, SSE progress, exclusivity, `mark_interrupted` on engine start | `engine/jobs.py::JobStore.create_job(exclusive=, conflicts_with=)`, `engine/server.py` |
| The batch path: selection-as-query, threshold 1,000, chunked commits, one batch id, one event | `services/batch_service.py`, `engine/batch_jobs.py::apply_or_start` |
| CuePoint's metadata layer and its effective-value SQL | `migrations/m0009_organization.py` (`track_metadata`), `services/metadata_service.py`, `models/filter_rule.py` (`COALESCE(meta.rating, tracks.rating)`) |
| Per-field history with `batch_id`, and a history source vocabulary that already names Beatport | `persistence/activity_repository.py` (`SOURCE_REKORDBOX`, `SOURCE_BEATPORT`, `SOURCE_CUEPOINT`) |
| A revert that appends rather than rewrites | `services/activity_service.py::revert_field_change` (Rekordbox fields only, via `REVERTABLE_FIELDS`) |
| The rule vocabulary, compiler, windowed browse, counts and facets | `models/filter_rule.py`, `persistence/filter_sql.py`, `persistence/track_query.py` |
| The generic table and its data-source interface | `components/table/TrackTable.tsx`, `trackTableSource.ts` |
| The operations list, context menu, Actions button and job following | `screens/library/trackMenu.ts`, `SelectionActions.tsx`, `useLibraryBatch.ts`, `followJob.ts` |
| The Inspector's editable zone and history section | `screens/library/TrackYours.tsx`, `TrackHistorySection.tsx` |
| The `clean` nav entry and the `clean` pixel icon, disabled | `components/shell/navRegistry.ts`, `components/pixelIcons.ts` |
| Recorded Beatport pages for parser tests | `src/tests/fixtures/beatport/` |
| The scale bench | `scripts/bench_library.py` |

Phase 7 is new tables, one new job kind per detection, and new surface over machinery that already
exists. The genuinely new mechanisms are three: persisting a match attempt, reading and fetching
artwork, and recording a file's tags before writing them.

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-065 | A match runs over library tracks, as a resumable job | CLEAN-01, CLEAN-03 |
| DEC-066 | Every attempt is kept with all its candidates | CLEAN-01, CLEAN-02 |
| DEC-067 | Auto-accept at ≥95 with guards passed; a user's decision sticks | CLEAN-04 |
| DEC-004 | Accepting applies nothing; applying is its own action | CLEAN-04, CLEAN-05 |
| DEC-068 | Applied values are a CuePoint layer; effective values; revert | CLEAN-01, CLEAN-05, CLEAN-06 |
| DEC-069 | Hand edits for key, BPM, genre, label, year | CLEAN-05, CLEAN-13 |
| DEC-008 | Per-field history for every write, now revertable for CuePoint fields | CLEAN-05, CLEAN-06, CLEAN-10 |
| DEC-073 | Missing files: a scan job; relocation stays in Rekordbox | CLEAN-01, CLEAN-07 |
| DEC-037 | The deferred file-existence check | CLEAN-07 |
| DEC-074 | Duplicates are metadata groups; nothing is deleted | CLEAN-01, CLEAN-08 |
| DEC-076 (amended) | Artwork from files and Beatport, as Pillow thumbnails; embedded only where missing | CLEAN-09, CLEAN-10 |
| DEC-011 (amended) | The refresh warning counts every track carrying the user's own data | CLEAN-05 |
| DEC-070 | File tags: an explicit job that records what it replaced | CLEAN-01, CLEAN-10 |
| DEC-075 | Health is counts, each a rule | CLEAN-11, CLEAN-12 |
| DEC-072 | Clean is its own page, with Library and Inspector hooks | CLEAN-12, CLEAN-13 |
| DEC-071, DEC-021, DEC-041 | inKey and Results retire; `ResultsTable` converges | CLEAN-12, CLEAN-14 |
| DEC-036 | inKey moves onto the library | CLEAN-03, CLEAN-14 |
| DEC-023, DEC-040, DEC-045 | One query path, windows, selection as a description | CLEAN-03, CLEAN-11, CLEAN-12 |

## Sequencing

```text
CLEAN-01 (schema + domain models)
      │
      ├───────────────┬───────────────┬───────────────┐
      ▼               ▼               ▼               ▼
CLEAN-02         CLEAN-05        CLEAN-07        CLEAN-09
(storing an      (override       (checking       (artwork:
 attempt)         layer, hand     files)          read, fetch,
      │           edits)              │            cache)
      ▼               │               │               │
CLEAN-03              ▼               │               │
(the match job)  CLEAN-06             │               │
      │          (revert)             │               │
      ▼               │               │               │
CLEAN-04 ─────────────┼──► CLEAN-08   │               │
(states,              │   (duplicates)│               │
 decisions,           │               │               │
 apply)               │               │               │
      │               ▼               ▼               ▼
      └──────────► CLEAN-10 (write tags to files, with a record) ◄──┘
                            │
                            ▼
                CLEAN-11 (Clean API, health, contract)
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
            CLEAN-12               CLEAN-13
         (the Clean page)     (Library + Inspector)
                 └──────────┬──────────┘
                            ▼
      CLEAN-14 (inKey retires; scale, docs, E2E)
```

CLEAN-02, CLEAN-05, CLEAN-07 and CLEAN-09 are independent once CLEAN-01 lands. CLEAN-05's *apply*
half needs CLEAN-04's accepted candidate; its override layer and hand edits do not, so the step can
start early and finish after CLEAN-04. CLEAN-08 needs CLEAN-04 because an accepted Beatport id is
one of its signals. CLEAN-09's Beatport half needs CLEAN-04 for the same reason; its embedded half
does not. CLEAN-10 needs effective values (05), file status (07) and artwork (09). CLEAN-12 and
CLEAN-13 are independent of each other once CLEAN-11 lands. CLEAN-14 is last, and is the only step
that deletes inKey — nothing is removed before its replacement is in a user's hands.

---

## Before starting any step — eight cross-cutting facts

### 1. The desktop contract is six files, and this phase also removes from it

Every new endpoint moves through `engine/*_api.py` + `server.py` · `engineClient.ts` ·
**`engineSupervisor.ts`** · `main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a
placeholder) · `cuepointBridge.types.ts`, gated by `desktopContract.test.ts`. The supervisor is the
file that forwards method by method and that nothing type-checks — it has bitten in SHELL-04,
LIBRARY-11 and PLAYER-03.

This is the first phase that **removes** routes (CLEAN-14). A removal is the same six-file sweep in
reverse, and it is a breaking change to the engine API that AGENTS.md says must be explicit: DEC-071
is that request, and the changelog records it. `server.py` still speaks only `do_GET` and `do_POST`;
mutations are POSTs to action paths, as Phase 6 kept them.

### 2. Only one step writes outside the database

CLEAN-10 is the one job that writes audio files. Nothing else in this phase may import a writing
function from `data/tag_writer.py` or `data/rekordbox.py`. CLEAN-10 adds a boundary test that
enumerates the importers of those functions and fails on a new one, in the spirit of
`check_no_qt_in_core.py` — because "only one step writes files" is worth being a fact the suite
checks rather than a sentence here.

### 3. Beatport is never reached by an automated test

AGENTS.md requires external services to be mocked. Every match-job, attempt, artwork-fetch and
parser test runs against `src/tests/fixtures/beatport/` or a stubbed `process_track`. The recorded
`track_page_standard.html` carries **no image data**, so CLEAN-09 records a fresh page before it
changes the parser; it does not invent a page shape. Real network is exercised only by a manual
smoke recorded in the step's outcome.

### 4. The matcher does not change

`core/matcher.py`, the query generator and the mix parser are inputs to this phase, not work items.
The single parser change (CLEAN-09, populating `artwork_url`) is guarded by a test that scores the
recorded fixtures before and after and asserts identical scores, winners and rejection reasons. A
step that finds it needs to change a scoring rule stops and raises it — that is a
`cuepoint-matching-pipeline` change with its own regression discipline, not a Clean step.

### 5. Two layers now span six fields (DEC-057, DEC-068)

`track_metadata` already holds rating, favorite and notes beside Rekordbox's columns. CLEAN-01 adds
key, BPM, genre, label and year to the same table. Four consequences, all step content:

- **The plain field names change meaning.** `key`, `bpm`, `genre`, `label` and `year` in the rule
  vocabulary become `COALESCE(meta.<field>, tracks.<field>)`, exactly as `rating` did in ORG-05. A
  saved Smart Collection with `bpm > 128` now means the BPM a user sees. That is DEC-068 stated as
  SQL, and CLEAN-05 has a test that says so.
- **`TrackRepository.update` still writes every column from a `LibraryTrack`**, which is why none of
  this lives on `tracks`.
- **`REVERTABLE_FIELDS` is not touched.** It reverts Rekordbox-owned columns and stays that way;
  CLEAN-06 builds a second, parallel path for CuePoint's fields.
- **Sorting by an effective value is a coalesce across a join**, which the m0007 browse indexes
  cannot serve. ORG-05 met the same shape for rating and measured it; CLEAN-05 measures it for five
  more fields at 50,000 tracks before claiming it is fine.

### 6. Matching is slow and network-bound, and the job must be honest about it

`PER_TRACK_TIME_BUDGET_SEC` is 45, `MAX_QUERIES_PER_TRACK` 40, `TRACK_WORKERS` 12. A match over a
whole 50,000-track library is hours, not minutes, and a real user will cancel, close the laptop, or
lose the network halfway. DEC-065's resumability is therefore not a refinement: per-track completion
is committed as each track finishes, and a job that is interrupted continues from where it was. The
job's progress says "N of M tracks, K accepted, J need review" — never a percentage that pretends to
know the remaining time.

`m0003_jobs.py`'s docstring says match results are deliberately not stored in the `jobs` table. That
stays true: attempts are stored in their own tables (DEC-066), not in `jobs.progress_json`. DEC-007
chose durable job records; DEC-065 adds durable per-track progress for one job kind. Neither
contradicts the other, and CLEAN-01 updates that docstring so the next reader is not misled.

### 7. The CLI is untouched

`main.py --xml … --playlist …`, `process_playlist_from_xml`, `checkpoint_service`, `output_writer`'s
per-run files and every public CLI flag keep working exactly as they do. Clean reaches the matcher
through `process_track`, which both the CLI's paths already call. A step that finds itself editing
`process_playlist_from_xml` has gone the wrong way.

### 8. A track may still appear twice in a Collection, and a match is per track, not per entry

Match state, overrides, file status, duplicates and artwork are facts about a **track**
(`tracks.id`). A Collection that holds a track twice shows the same match state on both entries, and
a "match this Collection" job matches that track once. Anything that counts Collection entries and
calls the number "tracks matched" is a bug.

---

## CLEAN-01 — The Clean Schema ✅ IMPLEMENTED 2026-09-13

**Objective**: One migration that lands every table and column this phase needs, plus the domain
models over them. Nothing behaves yet.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**: `migrations/m0009_organization.py` as the template and the precedent for
landing a phase's schema in one forward-only step; `services/migration_runner.py`, unchanged.

**Design**:

- **One migration (`m0011`)**, for ORG-01's reason: these tables reference each other, and the
  runner is forward-only, so the DDL has to be right rather than adjustable.
- **Overrides are columns on `track_metadata`, not a new table**: `ALTER TABLE track_metadata ADD
  COLUMN key TEXT`, `bpm REAL`, `genre TEXT`, `label TEXT`, `year INTEGER`, all nullable. ORG-01's
  reason for a sibling table — no import-shaped statement can reach it — already holds for this
  table, and a second sibling table would mean a second join for every effective-value rule and a
  second answer to "forget everything CuePoint knows about this track". `MetadataService.clear`
  already records one history row per value it forgets; it now forgets these too. Null means "no
  override", which is not the same as an empty string.
- **Match attempts**: `match_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id NOT NULL
  REFERENCES tracks(id) ON DELETE CASCADE, job_id TEXT, started_at, finished_at, outcome TEXT NOT
  NULL CHECK (outcome IN ('matched','no_match','error')), best_candidate_id INTEGER, score REAL,
  error TEXT, queries_json TEXT, input_json TEXT NOT NULL, matcher_version TEXT)`. `input_json`
  records the title, artist, key, year and mix the matcher was given, because a re-match after a
  refresh changed the title is a different question, and the attempt must say which question it
  answered. `matcher_version` is the engine version string: the only way to tell, later, whether two
  attempts disagree because the track changed or because the matcher did.
- **Candidates**: `match_candidates (id, attempt_id NOT NULL REFERENCES match_attempts(id) ON DELETE
  CASCADE, rank INTEGER NOT NULL, beatport_track_id TEXT, url TEXT NOT NULL, title, artists,
  remixers, label, genre, key, bpm REAL, release_name, release_year INTEGER, artwork_url, score REAL
  NOT NULL, base_score REAL, title_sim INTEGER, artist_sim INTEGER, bonus_year INTEGER, bonus_key
  INTEGER, guard_ok INTEGER NOT NULL, reject_reason TEXT, query_index INTEGER, query_text TEXT,
  is_winner INTEGER NOT NULL)` — the fields `BeatportCandidate` carries, as columns rather than a
  JSON blob, because the review page sorts and compares them and a candidate's values are what
  "apply" copies. `raw_data` is not stored.
- **Match state per track**: `track_match (track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON
  DELETE CASCADE, state TEXT NOT NULL CHECK (state IN
  ('no_match','needs_review','accepted','rejected')), decided_by TEXT NOT NULL CHECK (decided_by IN
  ('auto','user')), attempt_id NOT NULL REFERENCES match_attempts(id), candidate_id REFERENCES
  match_candidates(id), newer_attempt_id REFERENCES match_attempts(id), decided_at TEXT NOT NULL)`.
  "Not matched" is the absence of a row, so the question "which tracks have never been matched" is
  an anti-join, not a state someone must remember to write. `newer_attempt_id` is DEC-067's flag:
  set when a re-match disagrees with a user's decision, cleared when the user looks and decides. The
  two CHECKs are worth having for m0006's reason — small discriminators where a typo would sit
  silently.
- **Match job progress**: `match_job_tracks (job_id TEXT NOT NULL, position INTEGER NOT NULL,
  track_id INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (job_id, position))`. The
  resolved track list of a job, written once at start (DEC-063's rule), with a flag committed per
  track. It is what makes DEC-065's resume a query rather than a checkpoint file. No foreign key to
  `tracks`: a track deleted by a refresh mid-job is counted and skipped, as ORG-07 does, rather than
  cascading a job's plan out from under it.
- **File status**: `track_files (track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE
  CASCADE, status TEXT NOT NULL CHECK (status IN ('present','missing','unreadable')), checked_path
  TEXT NOT NULL, size_bytes INTEGER, checked_at TEXT NOT NULL)`. `checked_path` is the path as it
  was checked, so a refresh that changes `tracks.file_path` makes the row visibly stale rather than
  silently wrong (DEC-073).
- **Duplicates**: `duplicate_groups (id, signal TEXT NOT NULL CHECK (signal IN
  ('path','beatport','text')), group_key TEXT NOT NULL, computed_at TEXT NOT NULL, UNIQUE (signal,
  group_key))`, `duplicate_members (group_id REFERENCES duplicate_groups(id) ON DELETE CASCADE,
  track_id REFERENCES tracks(id) ON DELETE CASCADE, PRIMARY KEY (group_id, track_id))` and
  `duplicate_dismissals (signal, group_key, member_hash TEXT NOT NULL, dismissed_at, PRIMARY KEY
  (signal, group_key))`. Groups are **stored**, not computed per request: DEC-075 needs "tracks in a
  duplicate group" as a rule, and a rule is a SQL predicate. A dismissal is keyed by the group's
  signal and key plus a hash of its member ids, so a group that gains a member is shown again
  (DEC-074).
- **Artwork**: `track_artwork (track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  embedded TEXT NOT NULL CHECK (embedded IN ('unknown','none','present')), embedded_hash TEXT,
  beatport_url TEXT, cache_key TEXT, checked_at TEXT)`. The database records where artwork came from
  and a cache key, never image bytes (DEC-076).
- **The file-write record**: `file_writes (id, job_id TEXT NOT NULL, track_id INTEGER REFERENCES
  tracks(id) ON DELETE SET NULL, file_path TEXT NOT NULL, field TEXT NOT NULL, old_value_json TEXT,
  new_value_json TEXT, outcome TEXT NOT NULL CHECK (outcome IN
  ('written','skipped','failed','restored')), reason TEXT, written_at TEXT NOT NULL)`, indexed on
  `job_id` and `track_id`. **`ON DELETE SET NULL`, not cascade**: a track deleted from the library
  does not un-write the tags already in its file, and the record of what was replaced is the only
  way back. It keeps `file_path` for exactly that case.
- Every timestamp is ISO-8601 UTC text. Domain models beside the existing ones —
  `models/match_attempt.py` (attempt, candidate, state), `models/file_status.py`,
  `models/duplicate_group.py`, `models/artwork.py`, `models/file_write.py` — frozen dataclasses with
  `from_row`, matching `TrackMetadata` and `Collection`.
- `m0003_jobs.py`'s docstring gains one sentence pointing at `match_attempts` (cross-cutting fact
  6).

**Tests**: The migration applies to a version-10 database with real tracks, metadata, tags and
Collections and changes none of them. Fresh and migrated schemas are identical (extend the existing
discovery test). Every CHECK rejects a value outside its vocabulary. Deleting a track cascades its
attempts, candidates, match state, file status, artwork row and duplicate membership, and **sets
`file_writes.track_id` to null while keeping the row** — the test that would catch this phase's
worst data-loss bug. Deleting a track removes no other track's attempts. `MetadataService.clear` on
a track with overrides writes one history row per override. Models round-trip through `from_row`.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean with `m0011` in the chain; a
database from before this step opens, migrates, browses and plays; no service reads the new tables
yet.

**Risks**: Medium-high, front-loaded on purpose — forward-only DDL under user data. The calls most
likely to be questioned later are argued above: overrides on `track_metadata`, stored duplicate
groups, no foreign key on job progress, and `SET NULL` on the write record.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-13

**Outcome**: Complete. `migrations/m0011_clean.py` adds five override columns to `track_metadata`
and creates ten tables; `models/match_attempt.py` (`MatchAttempt`, `MatchCandidate`, `TrackMatch`,
`MatchJobTrack`), `models/file_status.py`, `models/duplicate_group.py`, `models/artwork.py` and
`models/file_write.py` are the types over them, with `models/row_values.py` holding the value
checks they share. `m0003_jobs.py`'s docstring points at the new tables. No service reads or writes
any of it, which is the step as specified; the one existing path that had to learn about it is
`MetadataService.clear`.

**Where the implementation went past the letter of the design, and why.**

- **Every `BeatportCandidate` field is a column**, not only the ones the design listed. The design's
  own sentence is "the fields `BeatportCandidate` carries", and it omitted five of them
  (`release_date`, `subgenre`, `preview_url`, `candidate_index`, `elapsed_ms`). A field dropped
  here is evidence no later migration can recover, while a column costs nothing when null. A test
  compares the dataclass with the table, so the next field added to the candidate fails there.
- **Three indexes the design did not name**, on `track_match.attempt_id`, `candidate_id` and
  `newer_attempt_id`. They follow ORG-01's rule (index every column that references another
  table), and they were measured before being kept. With two attempts of twenty candidates and a
  user decision per track, deleting 2,000 of 5,000 tracks takes 0.20 s with them and 25.77 s
  without, because each deleted candidate otherwise scans `track_match`. Deleting 20,000 of 50,000
  tracks (800,000 candidates) takes 2.21 s with them. The candidate index is
  `UNIQUE (attempt_id, rank)`, so it is also the rule that an attempt ranks each candidate once.
- **Small constraints where a wrong value would sit silently**:
  - `CHECK (… IN (0, 1))` on `guard_ok`, `is_winner` and `done`;
  - the signal vocabulary on `duplicate_dismissals` as well as on groups;
  - `DEFAULT 'unknown'` on `track_artwork.embedded`;
  - `NOT NULL` on both attempt timestamps, since an attempt is stored once it has finished.
- **No foreign key from any `job_id` to `jobs`.** Job rows are never deleted, and a job row is
  written only when the engine has a repository, which is best-effort. A plan, attempt or write
  record must not depend on that. `match_attempts.best_candidate_id` is not a foreign key either:
  the attempt is inserted before its candidates, and `is_winner` records the verdict on the
  candidate itself.
- **Relationships between columns live in the models, not in CHECKs**, for m0009's reason: a
  CHECK cannot be dropped without rebuilding a table of user decisions. The models refuse:
  - an accepted match without a candidate, and a no-match state that names one;
  - a dispute on anything but a user's decision;
  - an error attempt with no error text;
  - a missing file with a size;
  - an artwork hash without a present picture, and a checked state with no check time;
  - a skipped or failed write with no reason.
- **The dismissal fingerprint is defined now**: `duplicate_group.member_hash` is SHA-256 over the
  sorted, de-duplicated member ids. `DuplicateDismissal.covers` compares it against the group as it
  currently is, which is DEC-074's "a group that gains a member is shown again" as a tested
  function.
- **`TrackMetadata` gained the five overrides**, and they have the imported columns' types (a test
  compares the two tables). The model refuses what is not that kind of value — non-text key,
  genre or label; a BPM that is not a finite number; a year that is not a whole number — and
  stores blank text as no override. Ranges and key notation are CLEAN-05's.
  `TrackMetadataRepository` reads the new columns, and `MetadataService.clear` records one
  `cuepoint_key`/`_bpm`/`_genre`/`_label`/`_year` history row per override it forgets, driven by
  one table (`OVERRIDE_HISTORY_FIELDS`) so a column cannot be forgotten without a record.
- **The override columns share names with `tracks`' columns.** Every browse statement already
  qualifies its columns. A test runs browse, count, ids, sort, filter, search, facet and range
  with the metadata join in place and contradicting overrides stored, and asserts the imported
  values answer. That makes it the regression test for an ambiguous column and the proof that
  nothing reads overrides before CLEAN-05.

**Tests**:

- `persistence/test_clean_schema.py` (112 tests):
  - every CHECK vocabulary is read out of `sqlite_master` and compared with the model constants,
    and each value is accepted, with its upper-case form and a stray word refused;
  - required columns refuse null;
  - every model's fields equal its table's columns;
  - every index serves a reference, a key or the named `file_writes.job_id` query, every
    referencing column is indexed, and the deliberately unindexed columns stay so;
  - deleting a track takes its attempts, candidates, state, file status, artwork, membership and
    overrides, keeps `file_writes` with `track_id` null and its path intact, and removes nothing
    of another track's, nor any group, dismissal or job plan;
  - an attempt or candidate a decision points at cannot be deleted;
  - a populated version-10 database has every row of every existing table unchanged after the
    upgrade, and the same schema as a fresh one.
- `models/test_clean_models.py` (120 tests) covers every refusal and round trip.
- `test_track_metadata_repository.py` and `test_metadata_service.py` cover the widened read and
  `clear`.
- `test_organization_schema.py`'s column assertion is now pinned to version 9, which is what it
  describes.
- The CLEAN-01 modules and `metadata_service.py` joined `test_mypy_foundation.py`'s guarded paths.

The tests were then checked against nine in-memory mutations; each one made at least one test fail:

- `CASCADE` on the write record;
- a dropped reference index;
- a narrowed vocabulary;
- a cascading decision reference;
- a speculative index;
- a missing candidate column;
- non-cascading duplicate membership;
- an unqualified sort column;
- a repository read that omits the overrides.

"Plays" in the DoD needs no test of its own: nothing the player reads changed.

**Amended by CLEAN-02**: `match_candidates.title_sim` and `artist_sim` were declared `INTEGER`,
following `BeatportCandidate`'s annotation, but the matcher's similarities are fractional. `m0012`
rebuilds the table with both as `REAL`, and `MatchCandidate` now accepts any number from 0 to 100.
CLEAN-02's outcome records how that was found and why it is a migration rather than an edit.

**Complexity**: **M**, as estimated.

---

## CLEAN-02 — Storing a Match Attempt ✅ IMPLEMENTED 2026-09-13

**Objective**: Turn one `TrackResult` into a stored attempt with every candidate, and read attempts
back — the persistence half of DEC-066, testable without a job or a network.

**User-visible result**: None.

**Dependencies**: CLEAN-01.

**Existing code reused**: `models/result.py::TrackResult` and `models/beatport_candidate.py` as the
source shapes; `engine/jobs.py::_candidate_rows` and `track_result_to_dict` as prior art for what
the renderer already expects from a result; the repository pattern of `collection_repository.py`.

**Design**:

- `persistence/match_repository.py`: `add_attempt(track_id, job_id, result, input) -> MatchAttempt`,
  `attempts_for(track_id)` newest first, `candidates_for(attempt_id)` by rank,
  `latest_attempt(track_id)`, and the `track_match` reads and writes CLEAN-04 will drive. One
  transaction per attempt: an attempt without its candidates is not a state worth being able to be
  in.
- `services/match_record.py` (pure): `attempt_from_result(result: TrackResult, input: Track) ->
  (attempt fields, candidate rows)`. Rank is the order the matcher scored them; `is_winner` is the
  matcher's `best_match`, not recomputed. `outcome` is `error` when `TrackResult.error` is set,
  `matched` when there is a best match, `no_match` otherwise.
- **What is stored is what was scored.** No candidate is dropped, including guard-rejected ones —
  they are what explains a "no match". No candidate is re-fetched.
- **Measure the size before CLEAN-03 builds on it.** DEC-066 estimated a million candidate rows at
  50,000 tracks on about twenty candidates per track. `MAX_QUERIES_PER_TRACK` is 40 and each query
  can return several results, so the real number may be larger. This step runs the matcher over the
  recorded fixtures and a stubbed search at realistic breadth, records candidates per attempt and
  bytes per candidate, and extrapolates to 50,000 tracks. If the extrapolation is far past the
  estimate, the step stops and raises it before CLEAN-03 — per the process, a decision whose premise
  was wrong is amended, not worked around.

**Tests**: A result with a winner, with only rejected candidates, with none, and with an error each
store and read back field for field. Candidate order and `is_winner` survive. A second attempt for
the same track adds rows and changes none of the first's. Reading candidates for an attempt never
touches the network (the Beatport modules are patched to raise). An attempt's transaction rolls back
whole if a candidate row fails.

**Acceptance criteria / DoD**: Attempts round-trip completely; the size measurement is recorded in
this step's outcome with the numbers it used.

**Risks**: Medium. The mapping is simple; the risk is the size, which is why it is measured here.

**Complexity**: **S**

### ✅ IMPLEMENTED 2026-09-13

**Outcome**: Complete.

- `services/match_record.py` turns one `TrackResult` into attempt fields and candidate rows, with
  no database, clock or network.
- `persistence/match_repository.py` implements `IMatchRepository`, which is registered in
  bootstrap. It:
  - stores an attempt whole;
  - reads attempts newest first and candidates by rank;
  - reads and writes `track_match` for CLEAN-04.
- `migrations/m0012_match_similarity.py` corrects a CLEAN-01 column type (below).

Nothing calls the repository yet. CLEAN-03's job is its first caller.

**What reading the matcher found, and what was done about it.**

- **The similarities are fractional.** `score_components` returns RapidFuzz's `token_set_ratio`,
  which is a float: "Sunrise" against "Sunset Boulevard" scores 43.478…. `BeatportCandidate`'s
  `int` annotation is wrong about that, and CLEAN-01 followed the annotation, so `MatchCandidate`
  refused real matcher output. Rounding would store something other than what was scored, and the
  final score is computed from the unrounded value.
  - `m0012` rebuilds `match_candidates` with `title_sim` and `artist_sim` as `REAL`.
  - It is a migration rather than an edit to `m0011`. `m0011` was committed and the runner keeps no
    checksums, so a database already at version 11 would never see an edited DDL.
  - The rebuild runs inside the runner's transaction with foreign keys on. It sets `track_match`'s
    rows aside and restores them, every candidate keeps its id, and `sqlite_sequence` keeps its
    high-water mark.
  - The rebuilt DDL differs from `m0011`'s only in the two types.
- **The matcher's winner flag is not the pipeline's winner.** Two things break the flag:
  - The matcher flags the first candidate sharing the best one's URL, and a URL can be scored
    twice.
  - `process_track` declines a best candidate that scores under `MIN_ACCEPT_SCORE` but leaves the
    flag set.

  So `is_winner` marks `TrackResult.best_match`, found by identity, and only a `matched` attempt
  has a winner. An error attempt has neither a winner nor a score, even when the result carries a
  best match.

**Decisions taken beyond the design.**

- **An attempt is whole or absent, even inside a caller's transaction.** `add_attempt` writes
  under a `SAVEPOINT`. CLEAN-03 commits an attempt and its plan row together, and a caller that
  catches the error still cannot commit half an attempt. The attempt model is built before any
  write.
- **Values are converted only where a column needs it.**
  - Blank text is stored as null.
  - BPM text becomes a number and the release year a whole number. A value that cannot be read is
    stored as null rather than refusing an attempt that took forty-five seconds of Beatport time.
  - `beatport_track_id` is read from the URL, the way the matcher reads it.
  - The matcher's numbers are copied unchanged, and a non-finite one refuses the attempt.
- **The question is stable JSON.** It holds the title, artist, key and year, plus the mix flags
  `process_track` parses, with sorted keys, so the same question is always the same text.
- **Times.** `finished_at` defaults to now in UTC, and `started_at` to that less
  `processing_time`; CLEAN-03 can pass both. "Newest first" orders by id, never by a clock.
- **`set_match` refuses evidence that is not the track's own**, which foreign keys cannot
  express:
  - the attempt must be one of the track's;
  - a named candidate must come from that attempt;
  - a newer attempt must be the track's, and newer.

  Accepting a candidate from an older attempt (CLEAN-04) is therefore a state that rests on that
  older attempt.
- **`MatchAttempt` refuses a blank `job_id`**, and `matcher_version` defaults to the engine
  version.

**The size measurement** (DEC-066's premise). `scripts/bench_match_storage.py` runs the real
matcher through `process_track` against a stubbed Beatport: twelve title shapes at three breadths.
It stores the results and measures bytes from used pages after `VACUUM`. Offline, a candidate costs
321 bytes with its indexes.

| Breadth | Candidates per track | Rows at 50,000 | Size at 50,000 |
| --- | --- | --- | --- |
| One page per query, the track on top (exits early) | 23.8 | 1.19 M | 489 MB |
| The same page for every query, nothing matches | 23.8 | 1.19 M | 489 MB |
| A page never seen for every query, nothing matches | 380.4 | 19.0 M | 6.2 GB |
| DEC-066's estimate | 20 | 1.00 M | 429 MB |

The bench brackets a real library but cannot place one. A manual smoke therefore ran the same
pipeline against live Beatport, with browser automation off and a scratch home directory, for ten
tracks: eight well-known ones and two invented titles that nothing matches.

- The eight well-known tracks all matched, after 2 to 12 queries, with 10 to 54 candidates each.
- The two invented titles ran 10 and 13 queries and stored 41 and 40 candidates: no more than a
  match. Live searches for variants of one title overlap heavily.
- Across all ten: 40.3 candidates per attempt, 346 bytes per candidate and 1,638 bytes per attempt
  row.

At 50,000 tracks that is about 2.0 million candidate rows and 780 MB per full-library match. That
is twice the estimate but the same order, and ordinary for SQLite. It is not "far past the
estimate", so DEC-066 stands, and its entry now carries a dated measurement note.

A track took 5 to 35 s, averaging 24.7 s. If twelve parallel tracks each took as long as one alone,
a 50,000-track match would take about 29 hours, which bears out cross-cutting fact 6's "hours, not
minutes".

**Tests**:

- `services/test_match_record.py` (98 tests) covers:
  - outcomes;
  - the winner: a flagged twin, the flag alone, equality, a best match missing from its list;
  - every candidate kept in order, with its numbers unchanged;
  - text and blank text, the Beatport id, BPM and year conversions;
  - refused non-candidates, the question, queries JSON, the version and the start time.

  It also runs the real pipeline: `process_track` over the real matcher, with only search and page
  parsing stubbed. That proves the similarities are fractional, the pipeline's winner is the one
  stored, rejected candidates are kept, and nothing is re-fetched. It also proves that a best
  candidate turned down for its score stores no winner.
- `persistence/test_match_repository.py` (40 tests) covers:
  - a winner, only rejected candidates, no candidates and an error, each round-tripping field for
    field, compared against the matcher's own objects and not only against the mapping;
  - order and the winner surviving;
  - a second attempt changing no row of the first;
  - newest first, even when the clock disagrees;
  - a failing candidate row taking its attempt with it, alone and inside a caller's transaction
    that carries on;
  - a candidate the model refuses, an unknown track, a blank job id and a self-contradicting
    result, each writing nothing;
  - storing and reading with sockets, `requests` and the Beatport functions patched to fail;
  - every `set_match` refusal leaving the existing state alone.
- `persistence/test_match_similarity_migration.py` (15 tests) covers:
  - both columns becoming `REAL`, with the DDL otherwise identical to `m0011`'s;
  - a populated version-11 library keeping every row of every table, its candidate ids, its
    sequence and its decision's reference;
  - the upgraded schema equalling a fresh one;
  - an empty table gaining no sequence.
- `test_clean_models.py` (now 145 tests) accepts fractional similarities and refuses out-of-range,
  non-finite and non-numeric ones. It also refuses a blank job id.
- `test_service_interfaces.py` resolves `IMatchRepository` against a migrated database.
- `match_record.py` joined the mypy gate. The repository and the migration already sit under
  guarded directories.

The tests were checked against twelve in-memory mutations, and each one made at least one test
fail:

- the matcher's flag used as the winner;
- guard-rejected candidates dropped;
- a best match outranking an error;
- blank text kept;
- similarities rounded;
- BPM kept as text;
- no savepoint rollback;
- newest ordered by the clock;
- no evidence check;
- no sequence restore;
- a similarity left `INTEGER`;
- decisions lost in the rebuild.

**Complexity**: **S**, as estimated for the mapping and the repository. The column fix and the live
measurement brought the step closer to **M**.

---

## CLEAN-03 — The Match Job Over a Library Scope ✅ IMPLEMENTED 2026-09-13

**Objective**: Match any scope the Library browses, as a resumable background job that stores an
attempt per track as it goes (DEC-065).

**User-visible result**: None yet; CLEAN-11 exposes it and CLEAN-13 gives it a menu item.

**Dependencies**: CLEAN-02.

**Existing code reused**: `process_track` for the matching; the `ThreadPoolExecutor` + cancel shape
from `process_playlist_from_m3u`; `JobStore.create_job(exclusive=, conflicts_with=)`;
`batch_service.BatchSelection` and `build_select_ids` for resolving a scope to ids;
`engine/batch_jobs.py` as the job-runner template.

**Design**:

- `services/match_service.py`: `start(selection, rematch: bool) -> job` and `resume(job_id)`. The
  selection is ORG-07's `BatchSelection` — explicit ids or a query description — so "match this
  Collection" and "match everything matching this filter" are the same call and never cross the wire
  as a list of ids.
- **Resolve once, at start.** The id list is written to `match_job_tracks` in one transaction,
  deduped by track (cross-cutting fact 8), and the job reports the count it will cover. Unless
  `rematch` is set, tracks with a `track_match` row whose `decided_by` is `user` are excluded at
  resolution, and so are tracks with any attempt — "skip tracks already decided" means not spending
  forty-five seconds of Beatport time on a question already answered.
- **The adapter** — `library_track_to_track(LibraryTrack) -> Track` — is the whole of DEC-065's
  input change. It maps title, artist, album, duration, BPM, key, year, genre, label and file path,
  and sets `track_id` to the library id. It reads **Rekordbox's imported values**, not effective
  ones: matching asks "which Beatport track is this file?", and a key applied from a previous match
  must not become evidence for the next one. Written as a pure function with its own tests.
- **Per-track commit.** As each `process_track` returns, one transaction stores the attempt
  (CLEAN-02), sets `done`, and hands the attempt to CLEAN-04's state rule. A job killed at track
  31,204 has 31,204 stored attempts and resumes at 31,205.
- **Resume**: on engine start, `mark_interrupted` already closes the job record. A match job whose
  `match_job_tracks` has undone rows is offered for resumption (the activity event says so);
  `resume` starts a new job record over the remaining positions of the old plan. It does not resume
  silently on launch — DEC-065 declined unrequested network scraping, and that includes after a
  restart.
- **Exclusivity**: one match job at a time (`exclusive=True`), conflicting with
  `library_refresh_apply`. A refresh that deletes a queued track mid-job is counted and skipped.
- **Progress**: "N of M, K accepted, J need review, E errors", reported at the existing interval.
  Cancellation is honored between tracks and inside `process_track` through the existing controller.
- **One activity event per job** with those counts (DEC-029), not one per track.
- **Settings**: the job passes the same effective settings the XML path builds today, so Clean and
  the CLI match identically for the same input. A test compares them.

**Tests**: A stubbed `process_track` over a 50-track scope stores 50 attempts in plan order. An id
selection and an equivalent query selection resolve to the same plan. A Collection holding a track
twice matches it once. Without `rematch`, user-decided and previously attempted tracks are skipped
and the reported count says so. Cancel at track 20 leaves 20 attempts and 30 undone rows; resume
finishes the 30 and matches nothing twice. A track deleted mid-job is counted as skipped. A second
match job is refused with the running job's id. The adapter maps every field, reads imported values
when overrides exist, and a CLI-shaped and a Clean-shaped call produce identical `TrackResult`s from
the same stub.

**Acceptance criteria / DoD**: A 1,000-track scope over a stubbed matcher runs, cancels, resumes and
completes with exactly one attempt per track; the engine stays responsive to browse requests while
it runs.

**Risks**: High. This is the step where a wrong transaction boundary costs a user an afternoon of
Beatport time, and where threads writing to SQLite meet the single-writer rule — the executor's
workers match, and one writer commits.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-13

**Outcome**: Complete.

- `services/match_service.py` implements `IMatchService`. It resolves a selection into a plan,
  writes the plan, runs it and hands an interrupted job's remaining tracks to a new one.
- `services/match_input.py` is the adapter, `library_track_to_track`.
- `persistence/match_job_repository.py` implements `IMatchJobRepository`: every query about a plan.
- `engine/match_jobs.py` runs a match as a `clean_match` job (`start_match_job`,
  `resume_match_job`) and offers interrupted jobs for resumption (`offer_interrupted_matches`).
- `migrations/m0013_match_jobs.py` and the `MatchPlan` and `ResumableMatch` models record what each
  job was asked to do (below).
- `server._resolve_job_repository` offers interrupted matches just before it closes stale job
  records.

Nothing reaches the renderer yet. CLEAN-11 adds the routes. The status strip has no verb for
`clean_match` and falls back to "Working"; CLEAN-11 adds one with the route that can start the job.

**What building it found, and what was done about it.**

- **A plan cannot be resumed correctly from its rows alone.** Suppose a user matches the whole
  library, the laptop closes at track 20,000, and they then match one playlist that overlaps what
  is left. Resuming must not ask Beatport those tracks again. Telling "answered since the plan"
  from "answered before it" needs a point in the attempt history, and whether a user's decision
  keeps a track out depends on whether the job was a re-match. The rows hold neither.
  - `m0013` adds `match_jobs`, holding `rematch`, `selected`, `excluded`, `attempt_watermark` and
    `resumed_from`.
  - The watermark is the highest attempt id when the plan was written. Ids only grow, so it needs
    no clock.
  - A resume keeps its original's watermark, so a resume of a resume compares against the same
    point.
- **"Tracks with any attempt" was the wrong exclusion.** The matcher reports a failed search as an
  empty result, not an error: `track_urls` swallows the failure. So a match run during an outage
  stores attempts that look exactly like "nothing on Beatport", and the specified rule would have
  left those tracks out of every later match.
  - A track is left out only when a user decided it, or when an attempt *answered* it: found a
    match, or judged at least one candidate and chose none.
  - A track with only errors or empty results is asked again. That costs a few empty queries, not
    a track's candidate fetches.
  - Live, invented titles still drew about forty candidates (CLEAN-02), which is what makes an
    empty result a signal.
- **An outage would still burn through a library in minutes.** An empty track takes seconds, since
  there is nothing to fetch. `SEARCH_OUTAGE_STREAK` (25) tracks in a row with no candidates at all
  stop the job. Those tracks are put back in the queue and their attempts stay stored (DEC-066).
  The job ends `FAILED` with `MATCH_SEARCH_UNAVAILABLE` and its counts, so resuming once the network
  is back asks those tracks again. An error neither breaks nor extends the streak, because it says
  nothing about search.
- **The matcher cannot be cancelled mid-track.** `ProcessingController` never reaches
  `core/matcher.py`, whose loop checks only its time budget, and cross-cutting fact 4 keeps the
  matcher unchanged. So "cancellation inside `process_track`" is not available. A cancel stops new
  tracks at once, and the tracks already being matched finish and are stored: they are real
  answers, each bounded by `PER_TRACK_TIME_BUDGET_SEC`. The progress line says "finishing N in
  progress" while they do.
- **The refresh conflict is one-way.** A match job refuses to *start* while a refresh applies,
  because it would resolve its scope against a library being rewritten. A refresh may start while a
  match runs: a whole-library match takes hours, and "a refresh that deletes a queued track mid-job
  is counted and skipped" assumes exactly that. So the match job does not join the library job
  group, whose members exclude each other in both directions. A deleted track is skipped whether it
  is found missing before its turn or its attempt is refused by the foreign key while it was being
  matched.
- **A refresh's transaction can outlast SQLite's busy timeout.** A refresh applies in one
  transaction, and a large one holds the write lock longer than the 5-second busy timeout.
  - A commit that meets a lock is retried for up to 120 seconds rather than dropped.
  - Any other refusal — a full disk, a read-only file — stops the job with `MATCH_STORAGE_FAILED`
    and keeps the plan, rather than matching for hours with nowhere to put the results.

**Decisions taken beyond the design.**

- **Where `start` and `resume` live.** They are in `engine/match_jobs.py`; the service offers
  `prepare`, `write_plan`, `take_over` and `run`. A service does not hold a job, as with
  `batch_jobs` and `library_jobs`. A selection that names nothing, or only settled tracks, is
  refused before any job exists. A refusal to re-match says how to ask for one.
- **Each result commits as it arrives, not in plan order.** The writer hands the pool at most one
  track per worker, in plan order, so a cancel has nothing queued to unwind. A slow track never
  holds finished ones in memory. With one worker, attempt ids follow the plan exactly.
- **A resume moves the waiting rows** to the new job, keeping their positions. The original keeps
  what it finished, which is its record, and is never offered twice. Every track answered since is
  left out as the new job takes over; for a job that was not a re-match, so is every decided track.
- **Resolution checks the library.** Ids no longer in it are dropped, and `selected` counts library
  tracks. A track with no title is skipped without asking, as the CLI's parser does.
- **The adapter calls the CLI's own rule for title and artist** (`track_from_rbtrack`), including
  the artist taken from an "Artist - Title" title and the "Unknown Artist" placeholder, rather
  than restating it. A year `Track` would refuse is dropped, not fatal: the matcher never reads it.
- **CLEAN-04 plugs in through `StateRule`.** It is a callable run inside the attempt's transaction.
  Until it is plugged in, progress says "found" and "not found", and once it is, "accepted" and
  "need review". A result the database refuses for that track alone, such as a rule that raises,
  takes its attempt and its done flag with it. It is counted "not saved" and left waiting.
- **Every ending is an answer.**
  - Finished: `SUCCEEDED`.
  - Cancelled: `CANCELLED`.
  - Searches came back empty: `FAILED` with `MATCH_SEARCH_UNAVAILABLE`.
  - The first three carry the counts.
  - The database refused: `FAILED` with `MATCH_STORAGE_FAILED`.
  - Anything else: `FAILED` with `CLEAN_MATCH_FAILED`.

  There is one `clean.match` activity event per run, including a run stopped by an error, and no
  time estimate anywhere.
- **Resumption is offered once.** A `clean.match.interrupted` event is recorded for each resumable
  job whose record still says running when the engine first resolves its job repository. That is
  just before `mark_interrupted` closes those records, so each interruption is offered exactly once
  and nothing is resumed.
- **`match_attempts.job_id` stays unindexed.** CLEAN-01 deferred it to this step, and no query here
  reads by it.

**Measured** at 50,000 tracks. Half of them have a stored attempt, with 40 candidates for each
answer and none for an error or an empty result: 800,000 candidates in all, plus 5,000 user
decisions. Each read is the second of two passes.

| Operation | Time |
| --- | --- |
| `existing` over 50,000 ids | 53 ms |
| `settled` over 50,000 ids | 81 ms |
| `create`, a 27,500-row plan | 68 ms |
| `create`, a 50,000-row re-match plan | 132 ms |
| `waiting`, 30,000 rows left | 151 ms |
| `take_over`, 30,000 rows | 178 ms |
| `resumable` | 15 ms |
| One track's commit: attempt, 40 candidates, done flag | 2.7 ms |

Every statement finds its rows through an index. `settled` uses the track key,
`idx_match_attempts_track`, the covering `idx_match_candidates_attempt` and the `track_match` key,
and marking a track done uses the plan's primary key. Starting a whole-library match costs a
quarter of a second. A track's commit is about a ten-thousandth of the 25 seconds a track takes to
match live (CLEAN-02).

**Tests**:

- `services/test_match_input.py` (30 tests) covers:
  - every field mapped;
  - the library id as `track_id`;
  - title and artist compared with the CLI's rule over six shapes;
  - untitled and unstored tracks refused;
  - the year bounds checked against `Track` itself;
  - imported values read while an override exists for every field.
- `models/test_match_plan.py` (25 tests) covers the plan and a resumable job: what they hold, their
  round trip and every refusal.
- `persistence/test_match_jobs_migration.py` (24 tests) covers:
  - the model being exactly the table;
  - its key, its lack of references and indexes;
  - every CHECK and NOT NULL;
  - a populated version-12 library upgrading with every row kept, to a schema equal to a fresh one.
- `persistence/test_match_job_repository.py` (45 tests) covers:
  - library ids, deduplicated, in order, past one statement's parameter limit;
  - what settles a track: a match, judged candidates and a user's decision do; an error, an empty
    result and an automatic state do not;
  - plans written in order with their options and watermark, and refusals that write nothing,
    including inside a caller's transaction;
  - finishing a track twice refused, and putting tracks back;
  - a take-over that keeps positions, carries options and watermark, leaves out what was answered
    or decided since (a re-match only the former), keeps the first watermark across a chain, may
    leave an empty plan, and moves nothing when refused;
  - resumable and interrupted jobs.
- `services/test_match_service.py` (55 tests), against the real services with a stubbed
  `process_track`, covers:
  - fifty attempts in plan order, and one per track with eight workers;
  - an id selection and its query planning the same;
  - a Collection, a Rekordbox playlist and an id selection each naming a track twice;
  - skipped and settled tracks and the counts that say so;
  - every outcome, including the matcher raising or returning something else;
  - imported values reaching the matcher and the stored question;
  - the settings and the worker count;
  - tracks deleted before and during matching, and a track with no title;
  - a cancel at track 20 leaving 20 attempts and 30 waiting rows, and a resume finishing the 30 with
    nothing matched twice, also with six workers and tracks in flight;
  - the outage stop, its put-back, its resume and its streak rules;
  - the state rule inside the transaction, and a failing rule taking its attempt with it;
  - a lock waited out, a lock that never clears, and a database that refuses;
  - the wording.
- `engine/test_match_jobs.py` (23 tests) covers:
  - a job's counts, progress and terminal state;
  - a query resolved once;
  - settled tracks left out and a re-match;
  - refusals before any job;
  - a second match refused with the running job's id;
  - no start during a refresh, while a refresh may start during a match and its deletion is
    skipped;
  - every ending's state and code;
  - cancel then resume;
  - resume refusals, including a job still finishing;
  - the offer after a restart, made once, resuming nothing, then resumable.
  - The acceptance criterion: a 1,000-track scope over a stubbed matcher with eight workers runs,
    is cancelled after 300 tracks, resumes and completes with exactly one attempt and one done row
    per track. A second run answers library searches over HTTP throughout the match, the slowest
    under a second.
- `integration/test_clean_match_equivalence.py` (2 tests) matches one export through
  `process_playlist_from_xml` and, after importing it, through a match job. It uses the same real
  `ProcessorService`, and only the search is stubbed, answering from what it is asked. It runs at
  one worker (the XML path's sequential loop) and at three (its pool), and compares:
  - the matcher's questions;
  - every `TrackResult` field but the clock and the path's spelling;
  - the settings;
  - how many tracks were matched at once.
- The persistence boundary allows `match_service.py`, which opens the transaction and runs no SQL.
  `match_input.py` and `match_service.py` joined the mypy gate.
- `m0012`'s row-survival test now migrates to version 12 exactly, since `m0013` adds a table of its
  own.

The tests were checked against nineteen mutations written into the source, and each one made at
least one test fail:

- an empty result counted as an answer;
- a user's decision not settling a track;
- a resume leaving the original's waiting rows behind;
- a track finishable twice;
- any job treated as interrupted;
- the watermark ignored;
- ids not deduplicated;
- a cancel ignored;
- empty results not put back;
- the outage streak never stopping a job;
- the done flag committed apart from its attempt;
- an error breaking the streak;
- a lock never waited out;
- ids no longer in the library planned;
- a skipped track not marked done;
- a match starting during a refresh;
- the artist not built by the CLI's rule;
- an implausible year refusing the track;
- an interrupted match not offered.

**Complexity**: **L**, as estimated.

---

## CLEAN-04 — Match States, Decisions and Apply's Source ✅ IMPLEMENTED 2026-09-13

**Objective**: Derive each track's state from its attempts, let a user decide, protect that decision
from a re-match, and name the candidate that "apply" copies from (DEC-067, DEC-004).

**User-visible result**: None yet.

**Dependencies**: CLEAN-03.

**Existing code reused**: `matcher._confidence_label`'s ≥95 boundary, read rather than duplicated;
`batch_service` for batch decisions; `activity_service.record_event`.

**Design**:

- **`AUTO_ACCEPT_SCORE = 95`**, a named constant in `services/match_state.py`, asserted equal to the
  matcher's "high" boundary by a test so the two cannot drift apart silently.
- **The state rule** (pure, applied when an attempt is stored):

  | New attempt | Existing `track_match` | Result |
  | --- | --- | --- |
  | winner ≥95, guards passed | none, or `decided_by = auto` | `accepted` / `auto`, pointing at the winner |
  | winner below 95 | none, or `auto` | `needs_review` / `auto` |
  | no winner, or error | none, or `auto` | `no_match` / `auto` (error keeps the previous state if there was one) |
  | any | `decided_by = user` | unchanged; `newer_attempt_id` set if the new winner's Beatport id differs from the decided candidate's |

  An error is not evidence that there is no match: a network failure on a re-match leaves an earlier
  `accepted` alone.
- **User decisions**: `accept(track_id, candidate_id)` — any candidate from any of the track's
  attempts, not only the winner, because choosing the second candidate is the most common correction
  a reviewer makes; `reject(track_id)`; `clear_decision(track_id)`, which returns the track to what
  its latest attempt says. Each sets `decided_by = user` (clear sets `auto`) and clears
  `newer_attempt_id`.
- Decisions record history under the field name `match_state` with source `cuepoint`, and batch
  decisions go through DEC-063's path: new `BatchService` operations `accept_match` and
  `reject_match` beside ORG-07's six, one vocabulary still.
- **Accepting applies nothing.** A test asserts no `track_metadata` write happens on accept, auto or
  user (DEC-004).
- **The rule vocabulary gains `match_state`** — a text field, facetable, with the values
  `not_matched`, `no_match`, `needs_review`, `accepted`, `rejected` — plus `match_decided_by` and a
  bool `match_disputed` (`newer_attempt_id IS NOT NULL`). `not_matched` compiles to the anti-join.
  Match score of the decided candidate is a number field. These are what let "needs review" be a
  Smart Collection and a Health count (DEC-072, DEC-075).

**Tests**: Every row of the state table, including an error after an accept and a user decision
followed by an agreeing and a disagreeing re-match. Accepting a non-winning candidate from an older
attempt. A batch accept over a query selection above the threshold runs as a job with one batch id.
The constant equals the matcher's boundary. No accept writes metadata. Each new rule field compiles,
counts and facets through the existing path, and `not_matched` counts tracks with no row.

**Acceptance criteria / DoD**: Every state is reachable and filterable; no re-match can change a
user's decision, proved by test.

**Risks**: Medium. The rule is small; the risk is an edge in it (errors, disputes) that silently
erases review work, which is why the table is written out and tested row by row.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-13

**Outcome**: Complete.

- `services/match_state.py` implements `IMatchStateService`:
  - the pure state rule, `automatic_state`;
  - `accept`, `reject` and `clear_decision`, each recording history;
  - `accept_proposed` and `reject_proposed`, for the batch path.
- Bootstrap hands `apply_attempt` to CLEAN-03's match job as its state rule, so a match now reports
  "K accepted, J need review" and writes each track's state in the transaction that stores its
  attempt.
- `MatchRepository` gains `delete_match`, `latest_answered_attempt` and `has_candidates`.
- `BatchService` gains `accept_match` and `reject_match`, which take no value. The batch job names
  them "Accepting matches" and "Rejecting matches".
- The rule vocabulary gains four fields:
  - `match_state`: text and facetable, with `not_matched` for a track with no row;
  - `match_decided_by`: text and facetable;
  - `match_disputed`: yes/no and facetable;
  - `match_score`: a number, the score of the candidate the state points at.
- The renderer's history panel says what a match decision was, as a sentence (`trackEdits.ts`).

**Where it is visible.** The filter bar builds its field list from the engine, so the four fields
appear in it, and they work: "needs review" can already be a filter and a Smart Collection. Nothing
in the app can produce a state yet, because the routes that start a match or decide one are
CLEAN-11's. The existing `/api/v1/library/batch` route accepts the two new operations, which is an
additive change; the renderer's `BatchOperation` type gains them with CLEAN-11's bridge sweep.

**What building it settled, and why.**

- **A failed attempt writes no state.** The specification lets an error keep a previous state, but
  gives a never-matched track `no_match` on an error. The second half would contradict DEC-067's own
  sentence, "an error is not evidence that there is no match". And CLEAN-03 found that the matcher
  reports a failed search as an empty result. So neither an error nor an empty result changes any
  state. A track whose only attempts failed stays "not matched", which is true, and the next match
  that is not a re-match asks it again. An empty result after an accept leaves the accept alone,
  just as an error does.
- **The dispute flag follows the newest answer.**
  - For a user's accept: a winner that is a different Beatport track sets the flag to that
    attempt, a winner that is the accepted track clears it, and an answer with no winner leaves it
    as it was.
  - For a user's reject: a winner other than the refused candidate sets it, and the same winner or
    no winner at all clears it.
  - An agreeing re-match clears the flag because the flag exists to prompt a look, and a
    disagreement the matcher has since abandoned is not worth one.
  - Tracks are compared by Beatport id, which survives a slug change, or by URL when an id is
    unknown.
- **A reject remembers what it refused.** It rests on the candidate the state points at, or on the
  latest answered attempt's winner, so the same proposal coming back stays quiet. A track never
  matched cannot be rejected.
- **Clearing returns to the latest *answered* attempt.** Newer failures are skipped, for the first
  point's reason. With no answer at all the state row is deleted and the track is "not matched"
  again; every attempt stays (DEC-066).
- **A batch decides only what nobody has.** A batch accept confirms the candidate the state
  proposes, and a batch reject refuses it. A track a user already decided, or one never matched, is
  counted unchanged, and a track deleted mid-batch is counted failed. A batch runs over a query that
  may name tens of thousands of tracks; overriding a person's decision is a per-track act. DEC-067's
  entry now carries a dated note on these three rules.
- **A decision's history value is the decision.** The value records the state, who decided, the
  attempt, the candidate and any newer attempt — not the state word. Accepting the second candidate
  instead of the first changes no word, but it changes what "apply" copies (CLEAN-05), and
  CLEAN-06's revert needs every part of it. A decision that changes nothing writes nothing. The
  rule's own writes record no history: a match over a library would otherwise write fifty thousand
  rows nobody asked to see, and the attempts are already their record. The renderer draws the value
  as a sentence ("Accepted the Beatport match") rather than "[object Object]".
- **`AUTO_ACCEPT_SCORE` is held to both copies of the boundary.** The matcher's
  `_confidence_label` has one, and `process_track` spells the same boundary inline. A test checks
  95 and the float just below it against each.
- **One join registry instead of a metadata flag.**
  - `FieldSpec.metadata` became `FieldSpec.joins`, a tuple of aliases, with `metadata` kept as a
    property.
  - `track_query.JOINS` writes each join once, in dependency order, and only when a rule or a facet
    names it.
  - The join alias is `tmatch`, not `match`, which is an SQLite keyword.
  - CLEAN-07 to CLEAN-09's per-track tables will join through the same registry.
- **`not_matched` is the anti-join, spelled as a value.** `match_state` is
  `COALESCE(tmatch.state, 'not_matched')` over a LEFT JOIN on `track_match`'s key. The facet counts
  every track exactly once, and "not matched" is what the join finds nothing for. The constant
  lives with the model (`STATE_NOT_MATCHED`), and a test holds the filter's values to the stored
  states plus that one.

**Measured** at 50,000 tracks, 25,000 of them with a state. Times are the median of five runs.

| Operation | Time |
| --- | --- |
| Count, `genre` is House (for comparison) | 0.8 ms |
| Count, `match_state` is `not_matched` / `needs_review` | 8.5 / 8.3 ms |
| Count, `match_decided_by` is user · `match_disputed` is true | 5.9 · 6.8 ms |
| Count, `match_score` ≥ 95 (both joins) | 12.0 ms |
| Count, rating is 5 and `match_state` is accepted (three joins) | 7.4 ms |
| Facet, `match_state` over the library / within House | 58.8 / 41.4 ms |
| Facet, `match_decided_by` · `match_disputed` | 40.1 · 32.4 ms |
| Range, `match_score` | 17.5 ms |
| A page of 100 by artist, needs review (without a rule: 1.1 ms) | 1.4 ms |

A stored attempt with 40 candidates costs 2.59 ms per track without the state rule and 2.79 ms with
it, or 2.86 ms on a re-match with an existing state. That is under a hundredth of a track's
matching time. No index was added: every join is on a primary key, and a facet over an expression
could not use one.

**Tests**:

- `services/test_match_state.py` (67 tests) covers:
  - the boundary against `_confidence_label` and against `process_track`'s label;
  - every row of the table, including the boundary itself, a failed guard, each failure after each
    state, and no history from the rule;
  - an accept and a reject each followed by agreeing, disagreeing, no-winner and failed re-matches;
  - the flag clearing and following the newest disagreement, and a changed slug still agreeing;
  - the property: for every sequence of three re-matches drawn from six kinds (216 sequences, both
    decisions), nothing but the flag moves;
  - accepting a non-winning candidate of an older attempt, and it sticking;
  - accept, reject and clear, each clearing a dispute, refusing another track's candidate, writing
    nothing for a no-op, and recording its exact history;
  - no metadata written by any of them;
  - the batch forms leaving users' decisions and unmatched tracks alone.
  - the history value's exact shape, against literal values.
- `persistence/test_match_filters.py` (27 tests), over a library holding every state, covers:
  - each state finding exactly its tracks, and `not_matched` following a state row's absence;
  - the text operators;
  - every facet value counting what its rule finds, leaving its own rule out and honouring the
    others;
  - who decided, the dispute flag, and the decided candidate's score, not the winner's;
  - the joins: written only when named, once each, in order, beside the metadata join without
    multiplying a row, with an unregistered alias refused;
  - the vocabulary crossing the wire.
- `engine/test_match_decision_jobs.py` (9 tests) covers:
  - a query selection above the threshold accepted as a job with one batch id, its progress
    message, its one activity event, and no metadata written;
  - a batch reject leaving a user's rejects and the unmatched tracks alone, and a batch accept not
    turning a reject into an accept;
  - a value refused before any job;
  - a deleted track counted failed;
  - the existing batch route taking a decision;
  - a match run through the bootstrapped container writing states as it stores.
- `services/test_batch_edits.py` now builds `BatchService` with the decision service, and its
  vocabulary test names eight operations.
- `trackEdits.test.ts` covers the history sentence for an accept, a reject, a cleared decision,
  and a value that is not a decision.
- `match_state.py` joined the mypy gate and, like the other services that open a transaction
  without running SQL, the persistence boundary's allowlist.

The tests were checked against twenty-four mutations written into the source:

- the boundary made exclusive;
- a failed guard auto-accepted;
- an error or empty result writing a state;
- the rule overwriting a user's decision;
- a disagreement never flagged;
- a flag never cleared;
- no winner disagreeing with a reject;
- tracks compared by page only;
- a decision recording no history;
- a no-op decision written;
- a reject forgetting its candidate;
- clearing from a failed attempt;
- a batch accept or reject overriding a user;
- the history value dropping its candidate;
- an empty attempt counted as having candidates;
- the latest answer counting an empty result;
- `not_matched` spelled differently;
- the flag read from the wrong column;
- the winner's score in place of the decided candidate's;
- only the metadata join written;
- a batch decision taking a value;
- a batch reject accepting;
- the match job not given the state rule.

Twenty-three failed at least one test at once. The history value dropping its candidate did not:
the history test compared the stored value with the same helper that wrote it, so a field missing
from both went unnoticed. A test now pins the value's shape against literal values, which is the
shape CLEAN-06's revert will read, and that mutation now fails two tests.

**Complexity**: **M**, as estimated.

---

## CLEAN-05 — The Override Layer: Apply, Hand Edits, Effective Values

**Objective**: Write key, BPM, genre, label and year into CuePoint's layer — from an accepted
candidate or by hand — and make the plain field names mean the effective value everywhere (DEC-068,
DEC-069).

**User-visible result**: The refresh preview's warning now names tracks that carry ratings, notes,
tags, review decisions or applied values, not only Collection membership. Everything else: none yet.

**Dependencies**: CLEAN-01; CLEAN-04 for the apply half and for the warning's decision count.

**Existing code reused**: `services/metadata_service.py`'s set-and-record pattern and its `_record`;
`track_metadata_repository._set`; ORG-05's `rating` coalesce as the template for five more fields;
the key conversions in `data/rekordbox.py`; `models/references.py::ReferenceSummary`,
`LibraryService.references_for` and `persistence/id_chunks.py` for the warning;
`RefreshPreviewDialog.tsx`'s `referenceWarning` and `needsReferenceConfirmation`.

**Design**:

- `MetadataService` grows `set_override(track_id, field, value, source, batch_id)` for the five
  fields, recording history as `cuepoint_key`, `cuepoint_bpm`, `cuepoint_genre`, `cuepoint_label`,
  `cuepoint_year` — the naming `cuepoint_rating` set. A no-op write records nothing.
- **Sources**: an applied value records `SOURCE_BEATPORT` (defined in `activity_repository.py` since
  Phase 1 and unused until now); a hand edit records `SOURCE_CUEPOINT`. The Inspector derives "where
  did this value come from" from the latest history row for that field — history is the authority,
  so there is no second source column to keep in step with it.
- **Apply**: `apply_match(track_id, fields)` copies the chosen fields from the track's decided
  candidate. It refuses when the track is not `accepted`, and refuses a field the candidate has no
  value for rather than writing null over an existing override. Batch apply is a `BatchService`
  operation, `apply_match`, with the field list as its argument.
- **Key notation**: an applied key is stored in one canonical notation, the one Rekordbox's imported
  `key` column already uses, converted with the existing functions. The display and tag-write
  formats are choices at the edge, not stored variants. A hand-typed key is accepted in classic,
  Camelot or short notation and stored canonically; anything else is refused with the value named.
- **Validation** (engine-side, the UI never builds what the engine refuses): BPM 20–300 with at most
  two decimals; year 1900 to next year; genre and label trimmed, 1–200 characters; clearing an
  override is `None`, not an empty string.
- **Effective values in the vocabulary**: `key`, `bpm`, `genre`, `label`, `year` become
  `COALESCE(meta.<field>, tracks.<field>)` with `metadata=True`; `key_rekordbox`, `bpm_rekordbox`
  and so on address the imported column, and `cuepoint_key` and so on address the override — the
  three-name shape ORG-05 gave rating. Facets for these fields count effective values.
- **Browse and sort**: the browse projection carries effective values for the five fields and a
  per-row flag set naming which are overridden, so the table can mark them without a second request.
  Sorting by them sorts effective values. **Measured**: browse, sort and facet for each field at
  50,000 tracks with 10,000 overrides, against today's numbers; if a sort regresses past the Phase 4
  budget, the fallback is stated before it is taken, not discovered after.
- **Nothing reads effective values that should read imported ones**: the match adapter (CLEAN-03)
  and the refresh diff read `tracks`. A test on each.
- **The refresh warning counts the user's own data (DEC-011 as amended).** This is the step where a
  refresh could first delete something the user authored in Phase 7, so the seam grows here, and
  grows the way ORG-04 grew it — the body and the summary, not the callers:
  - `ReferenceSummary` gains `rated_track_count` (a CuePoint rating, favorite or note),
    `tagged_track_count`, `reviewed_track_count` (a match decision with `decided_by = user`) and
    `edited_track_count` (any override, applied or typed). Each counts tracks, not rows.
  - `referenced_track_ids` becomes every asked-about track carrying any of those or a Collection
    membership, and `has_references` is true when any count is non-zero. `to_dict` is extended,
    never renamed, as its docstring requires; the bridge type gains the same fields.
  - **Not counted**: match attempts and `auto` states (matching again re-derives them), file status,
    duplicate groups and artwork state (a scan re-derives them), and the file-write record (it is
    kept with `SET NULL`, so nothing is lost). The rule is "counted when it cannot be recomputed".
  - One query per kind over `id_chunks`, so a refresh deleting 20,000 tracks asks five questions,
    not 100,000. Measured with the rest of this step.
  - `referenceWarning` states each non-zero kind in one sentence: "12 tracks removed from Rekordbox
    carry your own work: 3 in 2 Collections, 5 rated or noted, 4 tagged, 6 reviewed or edited". A
    refresh whose deletions touch none of it still applies without a prompt — DEC-011's common case
    is kept.

**Tests**: Apply copies exactly the chosen fields from the decided candidate, refuses an undecided
track, and records `beatport` history under one batch id. `references_for` over tracks carrying each
kind alone reports that kind alone and sets `has_references`; over tracks carrying only attempts,
auto states, file status or artwork it reports none; a track carrying several kinds is one
referenced track; existing Collection-only fixtures produce byte-identical `to_dict` output for the
fields that already existed. `RefreshPreviewDialog` requires acknowledgement for a rated-only
deletion and not for an unreferenced one. A hand edit records `cuepoint`. Validation refuses each
bad value with its field named. A refresh that changes Rekordbox's key leaves the override and the
effective value alone. Effective filters find a track by its override and stop finding it by its
imported value; the `_rekordbox` names still do. A saved Smart Collection with a `bpm` rule changes
membership when an override is applied — the test that states DEC-068's meaning change. Clearing an
override falls back to Rekordbox's value. `clear` forgets overrides with one history row each.

**Acceptance criteria / DoD**: Applied and hand-edited values survive import, refresh, restart and
backup/restore; the measured browse and sort numbers are recorded.

**Risks**: Medium-high. Five fields change meaning across every filter, facet and saved Smart
Collection at once. The mitigation is ORG-05's: the change is one registry edit per field, and the
tests assert the new meaning rather than the absence of errors.

**Complexity**: **L**

---

## CLEAN-06 — Revert for CuePoint's Fields, Per Field and Per Batch

**Objective**: Take back any CuePoint-owned change, one field at a time or a whole batch at once —
closing the deferral Phase 6 carried and making DEC-063's batch id worth what it cost (DEC-068).

**User-visible result**: None yet; CLEAN-13 draws it.

**Dependencies**: CLEAN-05.

**Existing code reused**: `activity_service.revert_field_change`'s append-don't-rewrite rule, and
its event; `batch_service` for running a batch revert as a job; `MetadataService` and `TagService`'s
write paths.

**Design**:

- **A second revert path, not a wider `REVERTABLE_FIELDS`.** `services/revert_service.py` maps each
  CuePoint history field to the service call that writes it: `cuepoint_rating`, `favorite`, `notes`,
  the five `cuepoint_` overrides, `match_state`, and `tag`. It writes through those services, so a
  revert records history and fires the same validation a forward edit does.
- **A revert is a new change.** The original history row is never modified; the revert appends one
  whose old value is the current value and whose new value is the recorded old value, with a
  `revert_of` reference in the event detail — the rule `revert_field_change` already follows.
- **Stale reverts are refused, not forced.** If a field has changed since the change being reverted,
  reverting it would silently discard the later change. The service refuses with both values named;
  the user reverts the later change first or edits directly.
- **Batch revert**: `revert_batch(batch_id)` reverts every row carrying that id, newest first, as a
  job above DEC-063's threshold, under a **new** batch id so the revert can itself be reverted. Rows
  that are stale are skipped and counted, not fatal; the activity event reports reverted and skipped
  counts.
- **Scope, stated as DEC-068 asked**: batch revert reaches Phase 6's rating, favorite, tag batches
  and this phase's apply, hand-edit and decision batches. It does **not** reach Collection
  membership batches: membership is addressed by entry id and position (DEC-058), an "add" can be
  reverted by removing the entries it created but a "remove" cannot restore positions another edit
  has since shifted, and a revert that is right only sometimes is worse than an honest refusal. The
  UI says so.
- Rekordbox-owned fields keep `revert_field_change`. A test asserts each path refuses the other's
  fields explicitly rather than no-opping, extending Phase 6's refusal test.

**Tests**: Every mapped field reverts and records a new row. A stale revert is refused with both
values. A 5,000-row batch reverts as a job under a new batch id, and reverting that batch restores
the original. Stale rows in a batch are skipped and counted. A membership batch is refused with the
reason. Neither path accepts the other's fields.

**Acceptance criteria / DoD**: Any change a user made in Phase 6 or Phase 7, except Collection
membership, can be taken back, individually or as the batch it was made in.

**Risks**: Medium. The staleness rule is the part that matters; without it, revert is a second way
to lose data.

**Complexity**: **M**

---

## CLEAN-07 — Checking Files

**Objective**: Find out which tracks' files exist, as a job, and store the answer (DEC-073, closing
DEC-037).

**User-visible result**: None yet.

**Dependencies**: CLEAN-01.

**Existing code reused**: `data/rekordbox.py::is_readable`; `engine/library_jobs.py` as the job
template; `library_import_service`'s `EVENT_LIBRARY_IMPORTED` and `EVENT_LIBRARY_REFRESHED` as the
points to follow.

**Design**:

- `services/file_check_service.py` and a `file_check` job: for each track, `stat` the path, then
  open it for reading. `present` when both succeed, `unreadable` when it exists but cannot be
  opened, `missing` otherwise. Size is recorded for `present`. Nothing is read beyond opening — this
  is not a decode test, and mpv remains the judge of whether a file plays (DEC-054).
- **Runs after each import and refresh apply**, started by those jobs' completion, and on request
  over any scope. Exclusive, conflicting with `library_refresh_apply`. Chunked commits and
  cancellation as ORG-07.
- **A disconnected drive is one finding.** When more than a stated fraction of a chunk is missing
  and every missing path shares a root that does not exist, the job stops checking that root, marks
  its remaining tracks `missing` with reason `root_unavailable`, and reports one line: "4,812 tracks
  on E:\ — the drive is not connected". DEC-054's coalescing lesson, applied before the flood rather
  than after.
- **Staleness**: a track whose `tracks.file_path` differs from `track_files.checked_path` reads as
  "not checked" everywhere, not as its old status.
- **Vocabulary**: `file_status` (text, facetable: `present`, `missing`, `unreadable`, `not_checked`)
  and `file_checked_at` (date). `not_checked` covers both no row and a stale row.
- **Reveal**: `nearest_existing_folder(path)` walks up to the first directory that exists, so "show
  in folder" works for a file that moved one level and says plainly when nothing on the path exists.
- The player is not changed (DEC-054, DEC-073).

**Tests**: Present, missing and unreadable fixtures on a temporary directory. A path changed by
refresh reads as not checked. A simulated unavailable root among 5,000 tracks produces one finding
and stops touching the root. The job follows an import and a refresh in the job log. Cancellation is
prompt. `nearest_existing_folder` on nested missing paths. Every vocabulary value filters and
counts.

**Acceptance criteria / DoD**: Checking 50,000 local paths is measured and recorded, and a
disconnected drive yields one line in the activity feed.

**Risks**: Medium. Network shares and sleeping external drives make `stat` slow in ways a local test
will not show; the step records a measurement against a real external drive, not only a temporary
directory.

**Complexity**: **M**

---

## CLEAN-08 — Finding Duplicates

**Objective**: Group possible duplicates by three signals, remember dismissals, and never delete
anything (DEC-074).

**User-visible result**: None yet.

**Dependencies**: CLEAN-04 (the accepted Beatport id).

**Existing code reused**: `tracks.normalized_path` (Phase 3 already stores it); `normalize_text` and
`_parse_mix_flags`; the job template.

**Design**:

- A `duplicate_scan` job rebuilds `duplicate_groups` and `duplicate_members` in one transaction per
  signal:
  - **path** — tracks sharing `normalized_path`, one file imported as two Rekordbox entries. SQL
    `GROUP BY`, no Python.
  - **beatport** — tracks whose `accepted` candidate has the same `beatport_track_id`. SQL.
  - **text** — tracks whose normalized artist, normalized base title and mix type are equal, with
    durations within ±2 s of the group's shortest. Built in Python from one streamed read, using the
    matcher's own normalization so two tracks the matcher would call the same are grouped the same.
- A track may be in several groups (one per signal). A group has at least two members.
- **Runs after each import and refresh apply, after each match job, and on request.** Measured at
  50,000 tracks; if the text signal is slow, it is the one allowed to run only on request, and the
  step's outcome says so.
- **Dismissal**: `dismiss(group_id)` stores signal, key and member hash. On rebuild, a group whose
  hash matches a dismissal is not shown; a group with a new member has a new hash and is.
- **Nothing here deletes or edits a track.** Actions are the ones that already exist — tag, add to
  Collection, reveal — offered through CLEAN-13 against the group's members.
- **Vocabulary**: bool `in_duplicate_group` (any undismissed group) and text `duplicate_signal`.

**Tests**: Each signal on fixtures built to have one group and one near-miss (±2.5 s; different mix;
different Beatport id). A track in two groups. Dismissal hides the group; adding a member reveals
it. A rebuild after a refresh deleted a member dissolves a two-track group. No statement in the
service touches `tracks`, `track_metadata` or the filesystem (asserted by a patched connection and
patched `os`). The rule fields count what the groups say.

**Acceptance criteria / DoD**: A 50,000-track scan is measured and recorded, per signal.

**Risks**: Low-medium. The text signal's false positives are the risk to users; that is why each
group states its signal and why nothing acts without a person.

**Complexity**: **M**

---

## CLEAN-09 — Artwork: Reading, Fetching, Caching

**Objective**: Know whether each file has embedded artwork, fetch Beatport artwork for accepted
matches, and cache both for display — the reading half of DEC-076.

**User-visible result**: None yet.

**Dependencies**: CLEAN-01; CLEAN-04 for the Beatport half.

**Existing code reused**: mutagen, already a dependency; the Beatport page fetch and cache in
`data/beatport.py`; `cache_service.py`'s location conventions for where the image cache lives.

**Design**:

- **Embedded**: `data/artwork.py::read_embedded(path) -> Optional[bytes]` for ID3 `APIC` (MP3, AIFF,
  WAV), FLAC pictures, Vorbis `METADATA_BLOCK_PICTURE` and MP4 `covr`. The first front-cover
  picture, else the first picture. It never raises for a malformed tag; it returns none and the job
  counts it. An `artwork_scan` job records `embedded` and a hash per track, and runs after
  `file_check` so it never opens a missing file.
- **Beatport**: `parse_track_page` populates `BeatportCandidate.artwork_url`. **Before touching the
  parser**, a current track page is recorded into `src/tests/fixtures/beatport/` — the existing
  `track_page_standard.html` has no image data, and a parser written against a guessed shape is a
  parser that fails in production. The scoring-unchanged test (cross-cutting fact 4) runs over every
  existing fixture. Attempts stored before this step have no `artwork_url`; for an accepted track
  without one, the fetch reads the candidate's stored `url` once and records what it finds.
- **Fetching is lazy and bounded**: Beatport images are fetched when a track with an accepted match
  is first displayed, or by an explicit "fetch artwork" over a scope, with the existing request
  concurrency limits. Offline, the absence is an empty state, never an error toast.
- **Pillow becomes a runtime dependency (DEC-076 as amended).** It moves from
  `requirements-build.txt` into `requirements.txt` at the version already pinned there (12.1.1), so
  the project has one Pillow version, not two. `build/engine-sidecar.spec` does not exclude `PIL` —
  the legacy `build/pyinstaller.spec` does, and is not the engine's build — and
  `test_engine_sidecar_imports.py` gains the imports this step uses, so a packaged engine that
  cannot make a thumbnail fails a test rather than a user.
- **One decoder, behind one guard**: `data/artwork_image.py::make_thumbnail(data: bytes, size:
  int)`. Every image CuePoint decodes — embedded or fetched — goes through it, because image
  decoders are a classic attack surface and the input is untrusted twice over (files from anywhere,
  bytes from the web). The guard: refuse input over a named byte cap before decoding; allow JPEG,
  PNG, WebP, GIF (first frame) and BMP only, checked from the decoded format rather than the
  extension or MIME type; keep Pillow's decompression-bomb check and treat its warning as a refusal;
  apply EXIF orientation, convert to RGB, strip all metadata. A refused image is recorded as
  "unreadable artwork" and counted, never retried in a loop.
- **The cache holds thumbnails only**, under the existing cache directory, keyed by source hash and
  size, as JPEG. Two named sizes, derived from the table row's artwork cell and the Inspector's
  artwork box at 3× scale, so the pixel design system's integer scales never upsample. No original
  is kept: embedded artwork already lives in the file, and a Beatport image is fetched again when it
  is embedded (CLEAN-10). The cache has a named size cap with least-recently-used eviction, is
  outside the DEC-009 backup, and is rebuildable by rescanning (DEC-076).
- **Serving images to the renderer** without exposing the filesystem: an authenticated engine route
  returns a track's thumbnail at one of the two named sizes, as JPEG bytes; main forwards it over
  IPC to a narrow preload method returning an object URL. No path ever reaches the renderer, and no
  custom protocol is added.
- **Vocabulary**: text `artwork` (`embedded`, `beatport`, `none`, `unknown`) — what the table would
  show.

**Tests**: Each container format with a fixture file carrying a picture and one without. A malformed
picture frame. Parser: the new fixture yields an artwork URL; every existing fixture yields
identical scores, winners and rejection reasons before and after. Fetch is mocked; offline returns
empty; the cache dedupes identical images across tracks. The scan skips missing files. The route
refuses an unknown track and never returns a path. The guard refuses an oversized input, a
disallowed format disguised by extension, a decompression bomb and a truncated image, each without
raising out of the job; an image with an EXIF rotation comes out upright; output carries no
metadata. Eviction keeps the cache under its cap. The sidecar import test covers Pillow.

**Acceptance criteria / DoD**: Artwork state is known for every present file after a scan at 50,000
tracks, measured; the thumbnail cache size for that library is measured and recorded; a **packaged**
engine on Windows and macOS produces a thumbnail.

**Risks**: Medium-high. Beatport's page shape is outside this repository's control, and this is the
second parser change in the project's history to touch a file the matcher depends on. Pillow adds a
native dependency to the packaged engine, with a security history to match; the guard and the pin
are the mitigation, and Pillow is updated like any other pinned runtime dependency.

**Complexity**: **M**

---

## CLEAN-10 — Writing Tags to Files, With a Record

**Objective**: The one job in this phase that writes outside the database: effective values and
missing artwork into audio files, previewed, recorded before writing, and restorable (DEC-070,
DEC-076).

**User-visible result**: None yet; CLEAN-13 draws the dialog.

**Dependencies**: CLEAN-05, CLEAN-07, CLEAN-09.

**Existing code reused**: `data/tag_writer.py::write_key_comment_year_to_file` and its per-format
writers; `_normalize_sync_options` (moved, not copied, so there is one definition); the key-format
conversions; the WAV skip rule both existing callers apply; the job template.

**Design**:

- `services/tag_write_service.py`: `preview(selection, options)` and `start(selection, options)`.
  Options are today's: `key_format` (`normal`, `camelot`, `short`), `write_key`, `write_year`,
  `write_bpm`, `write_label`, `write_genre`, `write_comment` with `comment_text`, plus
  `embed_missing_artwork`. Defaults are today's defaults.
- **Values written are effective values** from `track_metadata` over `tracks`. An accepted but
  unapplied match changes no file (DEC-070). Comment text is the option's text, as today.
- **Preview** answers before anything is written: files that will change, per field; files skipped
  and why — WAV, `missing` or `unreadable` or `not_checked` in `track_files`, no field would change;
  files that will receive artwork. It reads current tags to decide "would change", so a preview is a
  read of every file in scope — run as a job above DEC-063's threshold and cached by job id for
  `start`, the way a refresh preview is applied by id.
- **Recorded before written.** For each file: read the current value of every field about to change
  (and whether it has artwork), write a `file_writes` row per field with `outcome = 'written'`
  pending, commit, then write the file, then mark the rows. A crash between the record and the write
  leaves a record of a write that may not have happened; restore treats "the file already holds the
  old value" as success. A crash can never leave a written file with no record.
- **Artwork**: embed only when the file's picture count is zero at the moment of writing — re-read,
  not taken from the scan. The Beatport image is fetched at write time (the cache holds thumbnails
  only), passed through CLEAN-09's decoder guard, and re-encoded as JPEG no larger than a named
  maximum dimension with metadata stripped — so what goes into a user's file is a clean, bounded
  image rather than whatever bytes a server returned. The preview confirms each image can be
  fetched; a file whose image cannot be is skipped with that reason. Recorded as old value `none`.
- **Restore**: `restore(job_id)` and `restore_track(track_id)` write recorded old values back,
  newest write first, with the same staleness rule as CLEAN-06: a field whose current file value is
  no longer what CuePoint wrote is skipped and reported, not overwritten. Restoring an embedded
  image removes the picture CuePoint added and nothing else.
- **After a write**: the file's size and `checked_at` in `track_files` are refreshed; tracks are
  not. Rekordbox reads new tags only when told to re-read them, and the user docs say so.
- One activity event per job, with written, skipped and failed counts (DEC-029). Exclusive, and
  conflicting with `library_refresh_apply` and `file_check`.
- **The boundary test** (cross-cutting fact 2): the only importers of the writing functions in
  `tag_writer.py` and `rekordbox.py` are this service and the CLI's existing paths.

**Tests**: For MP3, AIFF, FLAC and OGG fixtures copied to a temporary directory: preview predicts
exactly the writes the job then makes; every changed field has a record whose old value is what the
file held; restore returns every file to byte-identical tag values. WAV and missing files are
skipped with reasons. Artwork is embedded into a file with none and never into a file with one,
including one that gained artwork between preview and write. A simulated crash after recording and
before writing restores cleanly. A stale restore skips and reports. The boundary test fails when a
new module imports a writer.

**Acceptance criteria / DoD**: Writing, then restoring, a 500-file scope leaves every file's tags as
they were, verified by reading them back; the job is measured on real files.

**Risks**: High. This is user data outside the database, written in place. The record-before-write
order, the byte-identical restore test and the boundary test are the three things that make it
acceptable, and none of them is optional.

**Complexity**: **L**

---

## CLEAN-11 — The Clean API, Health, and the Desktop Contract

**Objective**: Expose CLEAN-02 through CLEAN-10 to the renderer through all six contract files, and
compute Library Health as rule counts (DEC-075).

**User-visible result**: None directly.

**Dependencies**: CLEAN-02 … CLEAN-10.

**Existing code reused**: `engine/organization_api.py` and `library_api.py`'s parsing helpers and
explicit field lists; `jobs_api.py`'s envelope; `batch_jobs.apply_or_start`; `export_service`;
`desktopContract.test.ts`.

**API**: a new `engine/clean_api.py`. Mutations are POSTs to action paths.

| Route | Purpose |
| --- | --- |
| `POST /api/v1/clean/match` | Start a match over a selection; `rematch` flag; returns a job id |
| `POST /api/v1/clean/match/resume` | Resume an interrupted match job |
| `GET /api/v1/library/tracks/{id}/matches` | Attempts, newest first, with state and dispute |
| `GET /api/v1/clean/attempts/{id}/candidates` | Candidates of one attempt, ranked |
| `POST /api/v1/clean/decide` | Accept a candidate, reject, or clear — one track or a selection |
| `POST /api/v1/clean/apply` | Apply chosen fields from decided candidates — one track or a selection |
| `POST /api/v1/library/tracks/{id}/overrides` | Hand-edit the five fields for one track |
| `POST /api/v1/library/revert` · `/revert/batch` | CLEAN-06 |
| `POST /api/v1/clean/files/check` | Start a file check over a selection |
| `POST /api/v1/clean/duplicates/scan` · `GET /api/v1/clean/duplicates` · `POST /api/v1/clean/duplicates/dismiss` | CLEAN-08 |
| `POST /api/v1/clean/artwork/scan` · `GET /api/v1/library/tracks/{id}/artwork` | CLEAN-09 |
| `POST /api/v1/clean/tags/preview` · `/tags/write` · `/tags/restore` | CLEAN-10 |
| `GET /api/v1/clean/health` | DEC-075's counts, each with its rule set |
| `POST /api/v1/clean/export` | "Export review list": a selection's match states and decided candidates as CSV, JSON or Excel |

Plus, on existing endpoints: `search` carries match state, dispute, file status, artwork state and
the overridden-field flags in its projection, and `filter-fields` grows every field this phase adds,
with the same byte-identical guard for requests that name none of them.

**Design**:

- **Health is rules, not queries.** `services/health_service.py` holds a list of `(id, label,
  RuleSet)` — missing or unreadable files, tracks in duplicate groups, not matched, needs review,
  disputed, missing effective key, BPM or genre, no artwork — and answers each with `build_count`.
  The route returns the counts **and** the rule sets, so the renderer opens the Library with exactly
  the rules that produced the number. What Health says and what the click shows cannot disagree,
  because they are the same statement (DEC-075).
- Every handler validates and delegates; refusals map to the existing envelope with the field or
  clause named. Response shapes use explicit field lists. Bridge types name the domain:
  `MatchAttempt`, `MatchCandidate`, `MatchState`, `FileStatus`, `DuplicateGroup`, `HealthCount`,
  `TagWritePreview`.
- Export reuses `export_service` with a new row source; it does not route through the retired
  `TrackResult` export.
- **inKey's routes are not removed here.** They are removed in CLEAN-14, after the page that
  replaces them exists.

**Tests**: Every route: happy path, refusal, plausible wrong shape. Each health count equals the
count of `search` with its returned rule set, over a fixture library with every problem present. The
DEC-023 guard on `search`. The contract test enumerates every new method. Error envelopes on
existing routes are unchanged.

**Acceptance criteria / DoD**: The renderer can express every Clean operation without a second query
path; `PYTHONPATH=src python scripts/smoke_engine_health.py` passes.

**Risks**: Medium-high, for ORG-08's reason: a large surface and a silent supervisor gap, mitigated
by extending the contract test per route.

**Complexity**: **L**

---

## CLEAN-12 — The Clean Page

**Objective**: The `clean` destination: a review queue with side-by-side candidate comparison, and
the Missing files, Duplicates and Health views (DEC-072).

**User-visible result**: Clean appears in the sidebar and works.

**Dependencies**: CLEAN-11.

**Existing code reused**: `TrackTable` and a windowed source (the Library's); `useTrackSelection`;
`FilterBar`'s rule model; `followJob`; `SelectionActions`; `CandidateDialog`'s comparison layout as
a reference to redraw, not a component to keep; the pixel design tokens.

**Design**:

- **Enable `clean`** in `navRegistry.ts`. Four sections as tabs within the page, remembered with the
  existing `localStorage` pattern: **Review**, **Missing files**, **Duplicates**, **Health**.
- **Review**: a `TrackTable` scoped by match state (needs review by default; disputed; accepted;
  rejected; no match; not matched), through the same browse endpoint with a rule set — no second
  query path, and no in-memory source. **DEC-041's convergence is this**: the match results that
  `ResultsTable` held in memory now come a window at a time like any other rows, so the in-memory
  adapter `trackTableSource.ts`'s comment anticipates is not built, and the comment is corrected.
- **The comparison panel**: selecting a row shows the track's imported values beside its candidates
  — title, artists, mix, label, key, BPM, year, genre, artwork, score and its parts, and a rejection
  reason where a guard fired — with differences marked. Earlier attempts are one control away.
  Actions: accept this candidate, reject, clear decision, apply chosen fields, re-match. Keyboard:
  up/down moves through the queue, and accept, reject and next have keys, because reviewing 3,000
  tracks is a keyboard job.
- **Missing files**: a `TrackTable` scoped to `file_status` missing or unreadable, with the expected
  path, reveal nearest folder, "check again", and one sentence saying fixes happen in Rekordbox with
  Relocate, then a refresh (DEC-073). A disconnected-root finding is shown as one line above the
  table.
- **Duplicates**: groups listed with their signal and members; per group, dismiss, tag members, add
  members to a Collection, reveal. No delete control exists anywhere on the page.
- **Health**: DEC-075's counts, each a link that opens the Library with the returned rule set
  applied, and a "last checked" time per detection with a button to run it.
- **Toolbar**: match selection, match everything matching, export review list, and the running job
  followed in the status strip as every job is.
- **Empty states from real engine responses**, as ORG-13 required: nothing matched yet, nothing
  needs review, no missing files, files never checked, no duplicates.

**Tests**: Component tests beside each component: the review scope changes the rule set, not the
source; the comparison marks differences and shows rejection reasons; keyboard review moves and
decides; each health link produces the rules the engine returned; the duplicates view has no delete
affordance; empty states render from recorded engine responses. `TrackTable`'s boundary test still
passes.

**Acceptance criteria / DoD**: A user can match a playlist, review it with the keyboard, accept and
apply, and see Health change, without leaving the page.

**Risks**: Medium. The comparison panel is the first dense multi-column comparison in the pixel
design system; contrast and hit targets are checked at 1×, 2× and 3×.

**Complexity**: **L**

---

## CLEAN-13 — Clean in the Library and the Inspector

**Objective**: Make match state, overrides, file status and artwork visible and actionable where
users already browse, so Clean is not the only place they exist (DEC-072, DEC-069, DEC-047).

**User-visible result**: New columns, menu items, filter fields and an Inspector zone in the
Library.

**Dependencies**: CLEAN-11.

**Existing code reused**: `trackMenu.ts::organizationMenuItems` and `SelectionActions.tsx` — one
operations list; `libraryColumns.tsx` and the column picker; `FilterBar` and `useFilterVocabulary`;
`TrackYours.tsx` and `TrackHistorySection.tsx`; `useLibraryBatch` and `followJob`.

**Design**:

- **Operations list** gains: Match on Beatport, Re-match, Accept match, Reject match, Apply Beatport
  values…, Edit metadata…, Check files, Write tags to files…, Reveal in folder. The context menu and
  the Actions button still render one list.
- **Columns** (hidden by default, available in the picker): Match state, Match score, File status,
  Artwork thumbnail. Key, BPM, genre, label and year cells show effective values with a small marker
  when overridden, its tooltip naming the source.
- **Filter bar**: the new fields appear through the vocabulary endpoint; text fields with a fixed
  value set render as a choice rather than a text box.
- **Inspector**: a Beatport zone beside the imported record and the "yours" zone — the decided
  candidate, its artwork, match state and dispute, per-field "imported / Beatport / effective" with
  the source of the effective value, apply per field, and a link to the track on the Clean page.
  Phase 4's read-only record stays read-only, field for field (DEC-047).
- **Hand edits** for the five fields in the "yours" zone, validated inline with the engine's own
  messages; "Edit metadata…" over a selection opens a dialog that goes through the batch path.
- **Revert** becomes enabled in `TrackHistorySection` for CuePoint fields, with a disabled control
  and its reason for Collection membership; a batch's activity entry offers "revert this batch".
- **Write tags to files…** opens a dialog that shows the options, runs the preview job, shows its
  answer, and only then offers Write. After a write, the activity entry offers Restore.
- **Artwork** thumbnail in the Inspector header and the optional column, via the preload method
  CLEAN-09 defined; empty state when there is none.

**Tests**: Component tests: the operations list includes the new items in both surfaces; overridden
cells are marked and name their source; the Beatport zone shows three values per field and applies
one; hand-edit validation shows the engine's refusal; revert is enabled for CuePoint fields and
disabled with a reason for membership; the write dialog cannot write before a preview has answered.
Existing Library and Inspector tests pass unchanged.

**Acceptance criteria / DoD**: Every Clean fact about a track is visible in the Library and
Inspector, and every per-track Clean action is reachable from the context menu.

**Risks**: Medium. The Inspector is now four zones; its width budget at 1× is checked, not assumed.

**Complexity**: **L**

---

## CLEAN-14 — inKey Retires; the Phase Comes Together

**Objective**: Remove inKey, Results and past searches now that Clean replaces them, and close the
phase: scale, backup, documentation, and the end-to-end journey (DEC-071, DEC-021, DEC-036,
DEC-041).

**User-visible result**: The Tools group no longer carries inKey or Results; Clean is how matching
is done.

**Dependencies**: CLEAN-12, CLEAN-13.

**Existing code reused**: `lastDestination.ts`'s unknown-path handling; `bench_library.py`;
`test_backup_restores_organization.py` as the model; `e2e/organization.spec.ts` as the model.

**Design**:

- **Search callers before deleting anything.** The candidates, each confirmed by search at the time
  of deletion rather than taken from this list: `InKeyMainScreen`, `ResultsScreen`,
  `PastSearchesPanel`, `BatchPlaylistPicker`, `ResultsTable`, `resultsTableLayout`,
  `useResultsFrameLayout`, `CandidateDialog`, `ExportResultsModal`, `SyncTagsDialog`,
  `MatchResultsContext`, the hooks `useMatchJob`, `usePastSearches`, `useSyncTags`,
  `useExportResults`, `useXmlPlaylists`, and the api utilities `candidateUtils`, `matchJobUtils`,
  `reviewUtils`, `runSummaryUtils`, `syncTagsUtils`. `SettingsExportScreen` and `TrackInspector.tsx`
  reference parts of this set and are read before anything they use is removed.
  `ToolSelectionScreen` loses its inKey entry.
- **Routes**: `/match` and `/results` redirect to `/clean`, so a remembered destination (DEC-027) or
  a bookmark lands somewhere real. `lastDestination`'s tests gain the redirect.
- **Engine and contract**: the file-based match job, `/api/v1/history/*`, `/api/v1/tags/sync` and
  `/api/v1/export` are removed through all six contract files, **after confirming** no other
  consumer — inCrate's enrichment reuses the processor service, and must be shown not to use these
  routes. The `jobs.py` file-based runners the CLI does not use go with them; the CLI's own paths
  stay. The changelog records the removal as a breaking engine-API change, per AGENTS.md.
- **Scale**, recorded in `docs/user-guide/performance.md`, at 50,000 tracks with 30,000 attempts at
  the candidate breadth CLEAN-02 measured, 10,000 overrides, 8,000 user decisions, 2,000 missing
  files, 1,500 duplicate groups and artwork state for every track: the review queue's browse, each
  health count, sort by effective BPM and key, the file check, the duplicate scan, a 5,000-track
  batch apply and its revert, and database size. Numbers are measured or not claimed.
- **Packaging**: the packaged engine on Windows and macOS imports Pillow and produces a thumbnail;
  the engine binary's size change is measured and recorded.
- **Backup and restore**: a backup taken after this phase's data exists restores attempts,
  decisions, overrides, file-write records and dismissals, read back through the services. The
  artwork cache is confirmed absent from the backup and rebuilt by a scan.
- **Documentation**: a user-guide page for Clean; `features.md` and `getting-started/quick-start.md`
  rewritten where they describe inKey; the user docs say plainly that tags written to files reach
  Rekordbox only when Rekordbox re-reads them, that relocation happens in Rekordbox, and that Clean
  deletes nothing; `docs/features/` pages that describe the retired screens are updated or marked as
  CLI-only; ADR-005 records the desktop matching path moving from files onto the library, because
  `docs/development/architecture.md` describes the file-based flow; `docs/release/CHANGELOG.md`
  under `Unreleased`.
- **E2E** (`e2e/clean.spec.ts`), with Beatport stubbed at the engine: import a library, match a
  playlist, see auto-accepted and needs-review tracks, review one with the keyboard choosing the
  second candidate, apply its key and BPM, see the effective value in the Library with its source,
  revert the apply, check files with one missing, see Health's counts and follow one into the
  Library, preview and write tags to copied fixture files, restore them, run a refresh that removes
  a reviewed track and see the warning name it, and open `/match` to land on Clean.

**Tests**: Nothing imports a deleted module (the build proves it; the search is recorded).
Redirects. The backup test. The E2E journey in a packaged build.

**Acceptance criteria / DoD**: The phase-level acceptance below, in full, in a packaged build.

**Risks**: Medium-high. Deletion is where a caller nobody listed turns up, and last steps carry
whatever earlier ones deferred.

**Complexity**: **L**

---

## Open points raised by this specification ✅ Resolved 2026-09-13

Writing the steps surfaced two questions the Round 9 decisions did not answer. They were raised
rather than settled inside the spec, asked as Q-076 and Q-077, and resolved as amendments. The user
delegated both choices ("take the most professional and better long term decisions"), and both are
recorded as such in `OPEN_QUESTIONS.md`.

- **Does DEC-011's refresh warning count Clean data? — Yes, and Phase 6's too.** A refresh that
  deletes a track cascades everything the user authored about it (DEC-003), and `references_for()`
  counted only Collections and Sets. DEC-011 is amended: the warning counts every track carrying
  data that cannot be recomputed — Collection membership, a rating, favorite or note, a tag, a
  user's match decision, an applied or typed value. Built in CLEAN-05.
- **Thumbnails or originals? — Thumbnails, with Pillow at runtime.** DEC-076 is amended: Pillow
  becomes a runtime dependency behind one guarded decoder, the cache holds bounded thumbnails only,
  and an image embedded into a file is fetched, validated and re-encoded at write time. Built in
  CLEAN-09 and CLEAN-10.

## Phase-level acceptance

Phase 7 is complete when, in a **packaged build**:

1. A match over a Rekordbox playlist, a Collection, a Smart Collection and a filter each runs as a
   job, can be cancelled and resumed without matching any track twice, and stores one attempt per
   track with every candidate (DEC-065, DEC-066).
2. Attempts at ≥95 with guards passed are accepted automatically; everything else with a candidate
   needs review; no re-match changes a user's decision, and a disagreeing re-match is flagged
   (DEC-067).
3. Accepting writes no metadata; applying writes the chosen fields into CuePoint's layer, which
   survives import, refresh, restart and backup/restore, and no Rekordbox-owned column is written
   (DEC-004, DEC-068).
4. Key, BPM, genre, label and year can be edited by hand, singly and in batch, with engine-side
   validation; title, artist, remixer and album cannot (DEC-069).
5. Plain filter, sort and facet names mean effective values, including inside saved Smart
   Collections, and the imported and CuePoint values stay addressable (DEC-068).
6. Every CuePoint-owned change except Collection membership can be reverted per field and per batch;
   a stale revert is refused with both values named (DEC-068).
7. A file check finds missing and unreadable files, reports a disconnected drive as one finding, and
   offers no relocation (DEC-073).
8. Duplicate groups state their signal, dismissals persist until a group changes, and no path in the
   phase deletes a track or a file (DEC-074).
9. Artwork is shown from files and Beatport as thumbnails made by one guarded decoder in the
   packaged engine, and the tag-write job embeds a validated, re-encoded image only into files that
   have none (DEC-076 as amended).
10. Writing tags to files is previewed, recorded before writing, and a restore returns every file to
    its previous tag values; no other code path writes outside the database (DEC-070).
11. Every Health count equals the count of the Library view it opens (DEC-075).
12. inKey and Results are gone from Tools, their routes redirect to Clean, and the CLI behaves
    exactly as before (DEC-071).
13. A refresh that would delete tracks carrying a rating, note, tag, review decision, applied value
    or Collection membership warns with a count per kind; one that touches none of it applies
    without a prompt (DEC-011 as amended).
14. Scale numbers are measured and recorded; full Python suite, renderer gates (`npm test`,
    `typecheck`, `lint`, `build:check`), E2E, Qt guard, version coupling, the desktop-contract test
    and the file-write boundary test all pass.
15. No decision in DEC-001…DEC-076, as amended, is contradicted. Per the process, a contradiction
    stops the work and gets raised rather than worked around.

## Deferred, with reasons

- **Relocating files from CuePoint** — declined by DEC-073, not deferred: the path is Rekordbox's.
- **Deleting duplicates** — declined by DEC-074: a refresh re-adds the track and the file is user
  data.
- **Audio-content hashing and acoustic fingerprinting** — Phase 12 (DEC-074).
- **A health score** — declined by DEC-075.
- **Automatic matching on import** — declined by DEC-065.
- **Editing title, artist, remixer or album** — declined by DEC-069; matching and identity read
  them.
- **Reverting Collection membership batches** — CLEAN-06, with its reason: positions shift under
  later edits, and a revert that is right only sometimes is worse than a refusal.
- **Writing CuePoint ratings, tags or notes into files** — Phase 8 (DEC-064, DEC-070).
- **Exporting overrides and Collections to Rekordbox XML** — Phase 8. DEC-068's two layers are what
  let that phase choose whose value to write.
- **Importing past inKey CSV runs** — declined by DEC-071.
- **Caching full-size artwork** — declined by DEC-076's amendment: the cache holds thumbnails, and a
  Beatport image is fetched again when it is embedded.
- **inCrate on the library, and its inventory database** — Phase 9 (DEC-030, DEC-021).
- **Renaming the legacy `-ui-lab-` storage keys** — its own change, as Phase 6 recorded. New keys
  added here do not extend the debt.
