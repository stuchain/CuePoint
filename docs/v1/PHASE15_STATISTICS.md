# CuePoint v1.0.0 — Phase 15: Statistics, Detailed Step Specifications

Status: **Specified 2026-10-07. STATS-01 is implemented (2026-10-08), ahead of Phase 14 (DEC-211); Phase 14 is complete, and STATS-02 to STATS-07 are implemented (2026-10-09).** Seven steps, STATS-01…STATS-07.
Writing the steps raised seven questions that Decision Round 14 did not answer. They were asked as
Decision Round 18 (Q-163…Q-169) and settled the same day as DEC-162…DEC-168, each as recommended, so
there are no open points. Where a step below says "if Q-NNN …", the recommended branch is the one
built. Per the process, no implementation happens from this document. Each step needs an explicit
"Implement STATS-NN" instruction, scoped to exactly that step, and its outcome is recorded under the
step afterwards.

**Amended 2026-10-08 for Phase 14's later decisions** (DEC-199…DEC-209, `PHASE14_PAGES.md` "What the
later phases pick up"). A track's key is DEC-201's: the user's correction, else the accepted
Beatport match's, else none, shown as "No Beatport key". The key spread's home is Phase 14's Keys
page (DEC-206): this phase shows a key summary that opens it, and adds no wheel mode of its own. The
playlist scope uses Phase 14's "In playlist" field (DEC-162 as amended). There are four sizes, 1×,
1.5×, 2× and 3× (DEC-161). The text below is changed where these apply.

Depends on Phases 1–14. Phase 14 must be complete first (DEC-140): the page is built in the
revisited style, and it reuses what Phase 14 adds (the shell header, the Camelot wheel, the selected
track, the empty-state shape, Settings' sections and the ten motion switches). Decision Rounds 1–18
apply (`DECISIONS.md`, DEC-001…DEC-168). This phase's own decisions are DEC-136 (what the page
shows), DEC-137 (play history) and DEC-138 (its own destination), with DEC-162…DEC-168 (scope, Clean's
Health tab, unknown plays, remixes, "Since", keeping a list, and history seeded from the last
import), and DEC-020 (the destination registry), DEC-096 (the key rule the wheel lights), DEC-132 (clear to new users), DEC-155 (no
"engine" or "jobs" in the app's words), DEC-158 (American English) and DEC-140 (its place, after the
pages).

The step prefix is STATS.

## What this phase is

CuePoint holds a lot about a DJ's library and says almost nothing about it as a whole. The Library
lists tracks; Clean counts problems. Nothing answers "what have I been playing", "who do I play most",
"what have I never played" or "what does my library look like".

This phase adds **Statistics**, a sidebar destination after Prepare (DEC-138), showing (DEC-136):
- **Most played,** as a top 10, 25, 50, 100 or 200, all time or since a date.
- **Top artists and labels,** by the plays of their tracks.
- **Never played.**
- **How the library spreads** by genre, key (a summary that opens the Keys page, DEC-206), tempo, year, date added, rating
  and loudness.
- **Library health:** missing files, matched to Beatport, analysed.

And it starts keeping **play history** (DEC-137): each import and refresh stores the play counts that
changed, with the date, so "most played since a date" has an answer. History starts with the first
refresh after STATS-01, and cannot be recovered for earlier.

**Every number leads somewhere.** A bar, a count or a row opens the Library on exactly those tracks
wherever a Library filter can say it, and a top list can be kept as a Collection (DEC-167).

**What this phase is not.**
- **No new data from outside.** Every number is a query over what CuePoint already holds, plus the
  play counts STATS-01 starts keeping. Nothing is read from Rekordbox's own database, and nothing is
  sent anywhere.
- **No listening history inside CuePoint.** Plays are Rekordbox's `PlayCount`. CuePoint's own player
  does not count plays (it previews; it is not where the DJ plays a set).
- **No change to the Library's filter language.** "Plays since a date" and "top N" are not filter
  fields. Where the Library cannot say a list, the list is opened track by track or kept as a
  Collection (fact 7).
- **No charting library.** The bars are drawn in the pixel style from whole-pixel rectangles, as
  Prepare's lanes are (fact 9).
- **No export of the statistics** (CSV, image). Deferred.

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| `play_count`, `rating`, `date_added` on each track (nullable, no default) | `migrations/m0005_track_fields_and_source.py` |
| One transaction for import and refresh, and the place old and new rows meet | `LibraryImportService._write_export` (`services/library_import_service.py:593`, `:626`); `TrackRepository.upsert_many_from_rekordbox` (`persistence/track_repository.py:820`, `:909-921`) |
| Identity across refreshes (TrackID, then path); `tracks.id` survives a re-link | `resolve_identity` (`models/library_track.py:243`) |
| The credit index: artists and remixers by `name_key`, labels by `label_key` | `track_credits` (m0021), `persistence/track_credit_repository.py`, `core/entity_names.py` |
| Loudness per file (LUFS, dBFS) at the current version | `loudness` in `waveforms.db` (`persistence/waveform_store.py:162`); `WaveformService.states` (`services/waveform_service.py:319`) |
| What is analysed | `WaveformAnalysisService.plan()` (`services/waveform_analysis_service.py:226`), `GET /api/v1/waveforms/analysis` |
| Library health counts, each with the rule that opens it | `HealthService.report()` and `HEALTH_RULES` (`services/health_service.py:88`, `:271`); `GET /api/v1/clean/health` |
| Key parsing in any notation, and the library's dominant notation | `parse_key`, `format_key` (`services/override_values.py:116`, `:128`); `key_notation_counts` (`track_repository.py:697`) |
| Value counts per facetable field | `GET /api/v1/library/facets?field=` (`server.py:659`) |
| Filter fields for play count, date added, genre, key, tempo, year, rating, file status, artist and label | `FIELDS` (`models/filter_rule.py:512-730`) |
| Opening the Library on a rule set | `libraryRulesState` (`renderer/src/screens/library/libraryLink.ts:29`); callers `HealthView.tsx:144`, `EntityScreen.tsx:285` |
| Opening the Library on one track | `libraryTrackState(trackId)` (PAGES-03) |
| The destination registry | `renderer/src/components/shell/navRegistry.ts:88-101` (DEC-020) |
| Pixel icons, 12×12 | `renderer/src/components/pixelIcons.ts` |
| Whole-pixel SVG drawing from pure geometry | `screens/prepare/SetLanes.tsx`, `prepareLanes.ts` |
| The keys of a scope, counted | PAGES-16's Keys page and `POST /api/v1/library/keys/population` |
| The empty-state shape `{ title, hint, action? }` | `emptyStateFor` (`libraryEmpty.ts`, PAGES-05) |
| Ten motion kinds, each behind a switch | `tokens/motion.ts`, `MotionContext.tsx` (PAGES-02, PAGES-12) |
| Creating a Collection and adding tracks to it (two calls) | `POST /api/v1/collections/create`, `/collections/tracks/add` (`engine/organization_api.py:512`, `:569`) |
| Backups copy the whole library database | `services/backup_service.py:135` |
| The 20,000-track scale tests and the 50,000-track benchmark | `src/tests/performance/test_library_scale.py`, `scripts/bench_library.py` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-136 | Most played as a top 10, 25, 50, 100 or 200; top artists and labels by their tracks' plays (DISCOVER-03's credit index, so "B" means B); never played; spreads by genre, key on the Camelot wheel, tempo, year, date added, rating and loudness (from the waveform store); health: missing files, matched to Beatport, analysed. |
| DEC-137 | Every import and refresh stores each changed `PlayCount` with the date it was read. Only changes stored. A count that goes down is kept as read, and "played since" never goes below zero. It is user data: in the backup, and a track's history goes with the track. |
| DEC-138 | A sidebar destination after Prepare, added through DEC-020's registry. |
| DEC-020 | The destination is one registry entry; no other destination moves. |
| DEC-096 | Not drawn here: the key spread lives on the Keys page (DEC-206), which lights compatible keys by this rule. |
| DEC-132 | Plain words; an empty state that says what to do next (import a library; refresh to start history). |
| DEC-155, DEC-158 | No "engine" or "jobs" in the page's words; American spelling. |
| DEC-134, DEC-135 | The page's motion uses the existing kinds and switches, in pixel steps. No new kind. |
| DEC-140 | This phase runs alone, after Phase 14. |

## Sequencing

**History first.** STATS-01 starts keeping play counts and nothing else, so it can ship on its own
and history begins as early as possible: every refresh before it is history lost. It has no UI.

**The engine's answers next.** STATS-02 (plays) and STATS-03 (spreads and health) add the routes the
page reads. Each returns, beside every number, the rule set that opens it in the Library, so the
renderer never builds a filter of its own (as `HealthService` already does). STATS-03 does not need
STATS-02; both need STATS-01's tables only for STATS-02's "since".

**Then the page.** STATS-04 adds the destination, the bridge and the page's frame, with its empty
states and scope. STATS-05 (plays) and STATS-06 (spreads) fill it, in either order. STATS-07 adds
health, keeps Clean's Health tab as it is (DEC-163), and brings the phase together.

**Every intermediate build keeps working,** with every suite green and the engine smoke check
passing. The destination appears only in STATS-04, so a build between STATS-01 and STATS-04 looks
unchanged.

## Before starting any step — eleven cross-cutting facts

### 1. `PlayCount` is a lifetime total, and missing means unknown

Rekordbox writes one running total per track. m0005 stores it with no default on purpose: a missing
`PlayCount` is **unknown**, not never played (`m0005_track_fields_and_source.py:25-29`). So "never
played" is `play_count = 0`, and tracks with no count are their own group, **Plays unknown** (DEC-164). Plays per refresh
are only as fine as the DJ's refreshes: two weeks of gigs between refreshes read as one jump on the
refresh date.

### 2. A refresh overwrites the count in place

Nothing keeps an old count today. The refresh diff compares `play_count` but files it under
`INCIDENTAL_FIELDS` (`models/refresh_diff.py:69`), so a weekend of playing does not read as "1,200
tracks changed". The one place the old and the new count are both in hand, inside the refresh's one
transaction, is the update branch of `upsert_many_from_rekordbox` (`track_repository.py:909-921`):
`existing` is the stored row and `track` the incoming one. A new track's first count is known at its
insert (`:910-913`). No other per-run record exists: `library_source` keeps one row and is replaced
on every import (`library_source_repository.py:52`), and the `library.imported` / `library.refreshed`
activity events are written after the commit, best-effort (`library_import_service.py:1087`, `:1116`).

### 3. What the user sees is the override, if there is one

Key, tempo, genre, label, year and rating each have a CuePoint override in `track_metadata`, and the
value shown is `COALESCE(meta.x, tracks.x)` (`_effective`, `filter_rule.py:469`), except the key,
which after PAGES-15 is the correction, else the accepted Beatport match's key (DEC-201). Every statistic reads the
effective value, the same expression the filter uses, so a bar and the Library it opens agree.
**One trap:** the `rating` sort reads `tracks.rating` only (`track_query.py:378`), while the filter and
facet read the override. Statistics follows the filter.

### 4. Loudness lives in another file, by path

`loudness` is in `waveforms.db`, beside `cuepoint.db`, keyed by **file path**, not track id, and
outside backups (`waveform_store.py:1-12`, `:162`). Only rows at the current `LOUDNESS_VERSION`
count (`data/audio_decode.py:140`). It cannot be grouped in one SQL query with the library. The spread
reads the library's present files (`current_files`, `file_status_repository.py:95`), then the store's
rows for those paths, and buckets in Python, as `WaveformService.states` joins them. Loudness is not
a filter field, so a loudness bar does not open the Library (STATS-06).

### 5. Health is stored, and partly unknown

- **Missing files** come from the file check's stored rows (`track_files`), counted only when
  `checked_path = tracks.file_path`. A track never checked is **not checked**, not present. The page
  shows the three apart.
- **Matched to Beatport** is a `track_match.state = 'accepted'` row; "not matched" is no row
  (`filter_rule.py:591`).
- **Analyzed** is known only from `waveforms.db`, through `WaveformAnalysisService.plan()`.
- `HealthService.report()` already counts missing files, duplicates, not matched and more, each with
  its `RuleSet` (`health_service.py:88-161`). Clean's Health tab shows it (`HealthView.tsx`), and it
  stays (DEC-163).

### 6. Artists and labels mean the credit index

DEC-136 says DISCOVER-03's credit index, so "B" means B: artists group by `track_credits.name_key`
(`core/entity_names.py:153`), shown by the first spelling alphabetically, as `library_artists` does
(`min(name)`, `track_credit_repository.py:477-486`). Labels group by the effective `label_key` (`:110-120`). The
Library's `artist_name` filter matches artist **and** remixer credits (`filter_rule.py:694`), so
so plays count remixer credits too (DEC-165), and a row's number matches what it opens.
A track credited to two artists counts its plays for each, but **once per name**: a track credited
to B as artist and as remixer has two `track_credits` rows with the same `name_key` (m0021's key is
`(track_id, role, position)`), so sums run over distinct `(track_id, name_key)`.

### 7. What the Library can open, and what it cannot

A rule set is AND-only (`libraryLink.ts:57-67`; `filter_rule.py:107-114`). The fields this phase needs:

| Opens in the Library | Rule |
| --- | --- |
| Never played | `play_count` = 0 |
| Unknown plays | `play_count` is empty |
| A genre | `genre` is *value* |
| A key | `key` any_of *codes*, on PAGES-05's normalized Key field |
| A tempo bucket | `bpm` gte *n − 0.5* and `bpm` lt *n + 0.5* |
| A year | `year` is *value* |
| A month added | `date_added` between *YYYY-MM-01*, *YYYY-MM-31* (text, inclusive) |
| A rating | `rating` is *stars*, or is empty |
| An artist, a label | `artist_name` is, `label_name` is |
| Missing files, not matched | Health's own rules |
| A Collection, as a scope | `collection` in_collection *id* (static Collections; `collection_tracks`) |
| A Smart Collection, as a scope | its own rules, added to the bucket's (both are AND-only) |
| A Rekordbox playlist, as a scope | Phase 14's "In playlist" field (FLW-7, PAGES-05B); before Phase 14 no field named a playlist |

**What cannot be said as a rule:** a top N, plays since a date, a loudness range, and "analyzed".
Top lists open one track at a time (`libraryTrackState`) and can be kept as a Collection (DEC-167);
loudness and analyzed show their numbers only. `date_added` is unvalidated text compared as text
(`filter_sql.py:370`; `between` is inclusive), so a month bucket is **defined as** the text range
`between YYYY-MM-01 and YYYY-MM-31`, and counted with that same comparison, not by parsing the date.
Whatever text falls in the range is in the bucket, malformed or not (`2026-09-1` is in September), so
the count and the Library always agree. Everything in no month's range is **Unknown date**, count
only: rule sets are AND-only, so no rule can say "empty or malformed".

### 8. Keeping a list as a Collection takes two calls today

`createCollection` then `addTracksToCollection` (`organization_api.py:512`, `:569`), not atomic: a
failure between them leaves an empty Collection. The only atomic create-with-tracks is for Sets
(`sets/create-from`). STATS-05 adds an atomic route for Collections rather than a third two-call
caller.

### 9. The renderer has no chart, no lazy load and no number shortcuts

- **No chart library** (`renderer/package.json`), and none is added. The closest prior art is
  `SetLanes.tsx`: an SVG of whole-pixel `<rect>`s from pure geometry (`prepareLanes.ts`), filled with
  theme tokens (`prepare.css:251-278`). The bars follow it, so every theme and custom theme colors
  them, and the size setting steps them (`PIXEL_DESIGN_SYSTEM.md`; 1×, 1.5×, 2× and 3×, with every
  edge rounded to whole pixels at 1.5×, DEC-161).
- **Every screen is a static import** in `App.tsx:33-39`; Statistics is too.
- **No Ctrl+1…N shortcuts exist** (`keyboardShortcuts.ts:9-15`); none is added.

### 10. The tests that pin the destinations

Adding a destination turns these red until updated, in the same commit: `navRegistry.test.ts`
(the declared ids, `:90`, and the order, `:124`), `Sidebar.test.tsx` (the label order, `:81`),
`e2e/shell.spec.ts` (the collapsed rail's labels, `:211`), and `pixelIcons.test.ts` (every
destination's icon exists, `:42-51`, two cells wide, `:53`). PAGES-03 changes the first three for
Collections; this phase starts from their Phase 14 state.

### 11. Scale

The page must answer at 50,000 tracks. There is no index on `play_count` or `date_added` (m0008 has
none), and plays per artist joins `track_credits` (about 1.5–2 rows a track). Each route is one or a
few grouped scans, not a count per bucket (Health's one-query-per-rule pattern would cost dozens of
queries here). History grows by one row per changed count per refresh; a DJ refreshing weekly with 500
plays a week adds about 26,000 rows a year.

---

## STATS-01 — Play History, Kept From the Next Refresh

**Objective**: Every import and refresh stores the play counts that changed, with the date they were
read, inside the same transaction, so later steps can answer "most played since a date" (DEC-137).

**User-visible result**: None yet. History starts accumulating.

**Dependencies**: Phase 14.

**Existing code reused**: `_write_export`'s transaction; the update branch of
`upsert_many_from_rekordbox`; the migration runner and its test pattern
(`test_match_score_migration.py:40`).

**Design**:
- **Migration m0027,** `migrations/m0027_play_history.py`:
  - `library_reads(id INTEGER PRIMARY KEY, read_at TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('import','refresh','seed')), tracks INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0)`. One row per import or refresh, **whether or not anything changed**, so the page knows when history starts and when the counts were last read.
  - `play_counts(track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, read_id INTEGER NOT NULL REFERENCES library_reads(id), play_count INTEGER NOT NULL, PRIMARY KEY (track_id, read_id))`, with an index on `(read_id)`.
  - `read_at` is the UTC time CuePoint read the file (`utc_now_iso()`), not the XML's export date,
    which the XML does not carry.
- **What is stored:**
  - **The baseline is seeded** (DEC-168). m0027 itself inserts one `seed` read dated
    `library_source.imported_at` (the last import before the migration) and copies every known
    `tracks.play_count` into it, so the plays between that import and the first refresh are kept.
    With no library imported there is no seed, and the **first import**, found as "no
    `library_reads` row yet", stores every known count instead. The baseline is the only read that
    stores unchanged counts.
  - **After that, one row per track whose count moved,** up or down (DEC-137): an update where
    `existing.play_count` differs from `track.play_count`, both known.
  - **A new track** stores its first known count, as its own baseline.
  - **Unknown counts are not stored.** A count that becomes unknown stores nothing; one that becomes
    known again stores its value.
  - **A re-link** keeps `tracks.id`, so the history follows the track.
- **Where:** the `library_reads` row is inserted at the start of `_write_export`'s transaction, its
  `tracks` and `changed` filled by an update at the end. `upsert_many_from_rekordbox` gains two
  keyword arguments, `read_id` and `baseline: bool`, and collects the `play_counts` rows beside
  `update_rows` and `insert_rows`, written with `executemany` after the inserts have ids. A failed
  refresh rolls all of it back.
- **A deleted track's history goes with it** (`ON DELETE CASCADE`; `foreign_keys=ON` is set at
  `database_service.py:226`). Backups copy the whole database, so history is in them unchanged.
- **The refresh preview does not change.** Play counts stay incidental there.

**Tests**:
- `src/tests/unit/persistence/test_play_history_migration.py`: m0027 applies on top of m0026 with
  data in it, and the cascade removes a track's rows.
- `src/tests/unit/services/test_play_history.py`:
  - the first read stores every known count and no unknown one;
  - a refresh with nothing played adds a `library_reads` row and no `play_counts` row;
  - a count up, a count down and a count to unknown and back, each stored as DEC-137 says;
  - a new track stores its first count;
  - a re-link (path moved, same TrackID) keeps the track's history;
  - a refresh that fails mid-write leaves neither table changed.
- `test_library_scale.py`: a refresh of 20,000 tracks with 500 changed counts stays within 10% of
  the same refresh without history (relationship, not seconds, as the file's docstring says).
- The backup service's tests: a backup holds `play_counts` and `library_reads`, and a restore brings
  them back.
- `test_references_carry_user_work.py`: `play_counts` is **not** a DEC-011 reference, so a refresh
  that deletes a played track does not ask first; its history goes quietly with it (DEC-137).

**Acceptance criteria / DoD**:
- Every import and refresh leaves one `library_reads` row and exactly the `play_counts` rows above.
- `scripts/bench_library.py` at 50,000 tracks: the **edited-diff apply** (step 5 of the benchmark, a
  refresh after the baseline exists, with its changed tracks' counts moved) within 10% of before;
  the baseline read is measured and recorded separately. The numbers are recorded under this step.
- All suites pass, with the engine smoke check.

**Risks**: Low. **Shipping it late is the real risk:** every refresh before it is history that
cannot be recovered. It has no UI so it can ship as soon as Phase 14 is done.

**Complexity**: **S**

**Outcome**: Implemented (2026-10-08), ahead of Phase 14 (DEC-211). `migrations/m0027_play_history.py`
adds `library_reads` and `play_counts` and seeds from the last import as designed; with no
`library_source` row it writes nothing. `persistence/play_history_repository.py`
(`IPlayHistoryRepository`) owns the read rows. `upsert_many_from_rekordbox` takes `read_id` and
`baseline` and reports `play_counts_stored`; a new track's id comes from the read-back its credits
already needed, so history adds no query per track. `_write_export` starts the read first in its
transaction and finishes it after the deletes. Without a `read_id` the upsert keeps no history,
exactly as before.

Decided while building:
- **`tracks` and `changed` on a read** are the library's track count after the read and the
  `play_counts` rows that read stored (the baseline's rows included).
- **A library with tracks but no read and no seed** (its `library_source` row cleared) is on its
  baseline: its next import stores every known count.

Checked in the cloud container: the new tests (`test_play_history_migration.py`,
`test_play_history.py`, `test_backup_restores_play_history.py`, two cases in
`test_references_carry_user_work.py`) and the persistence and services suites pass, with pinned
ruff 0.14.0, both mypy gates and `scripts/smoke_engine_health.py`. The services suite has one
failure, `test_step56_error_handling.py::test_beatport_service_logs_errors`, which fails the same
without this step; three files there need `hypothesis` or `mutagen`, not installed in the container.
`test_track_marks_schema.py` now stops its "only m0026" tests at version 26.

Scale. `test_library_scale.py`'s new test (20,000 tracks, 500 counts moved, best of 5) stays within
10% of the same refresh without history. `scripts/bench_library.py` at 50,000 tracks, before and after:

| Phase | Before | After |
| --- | --- | --- |
| Import (the baseline read) | 13.41 s, 54.4 MB peak | 13.89 s, 54.5 MB peak |
| Re-import | 16.98 s | 16.59 s |
| Diff, edited | 12.50 s | 11.91 s |
| Apply refresh (edited diff) | 19.25 s, 113.9 MB peak | 16.37 s, 113.9 MB peak |

The benchmark's edited export moves no counts, so its apply measures the history's bookkeeping
only; the scale test covers moved counts. Not checked: a refresh on the owner's real library.

---

## STATS-02 — The Plays: Most Played, Artists, Labels and Never Played

**Objective**: One engine route answering the page's plays section: the top N tracks, artists and
labels, all time or since a date, with never played and unknown counted, each with what opens it.

**User-visible result**: None yet.

**Dependencies**: STATS-01.

**Existing code reused**: the credit index and label keys (fact 6); `filter_rule`'s effective-value
expressions (fact 3); `RuleSet` as Health returns it; the module shape of `engine/waveforms_api.py`
(`GET_PATHS`, `handles_get`, `handle_get`, `status_for`).

**Design**:
- **New:** `services/statistics_service.py` (`StatisticsService`), `persistence/statistics_repository.py`
  (the SQL), `engine/statistics_api.py` (the routes), registered in `server.py` like the others.
- **`GET /api/v1/statistics/plays?limit=10|25|50|100|200&since=YYYY-MM-DD&tz=±HH:MM&since_read=<id>&scope=<scope>`**
  (`since` with `tz`, or `since_read`, or neither for all time):

  ```json
  { "since": "2026-09-01", "since_clamped": false,
    "history_from": "2026-10-08T09:12:00Z", "last_read": "2026-11-02T18:40:00Z",
    "tracks":  [ { "id": 812, "title": "…", "artist": "…", "plays": 14 } ],
    "artists": [ { "name": "B", "name_key": "b", "plays": 31, "tracks": 6,
                   "rules": { "match": "all", "rules": [ { "field": "artist_name", "operator": "is", "value": "B" },
                                                          { "field": "play_count", "operator": "gt", "value": 0 } ] } } ],
    "labels":  [ { "name": "…", "label_key": "…", "plays": 22, "tracks": 9, "rules": { … } } ],
    "never_played": { "count": 3120, "rules": { … play_count = 0 … } },
    "unknown":      { "count": 41,   "rules": { … play_count is empty … } } }
  ```

  - **All time** (no `since`): plays are the effective `play_count`.
  - **Since a date:** plays are the sum of every **rise** in a track's count over the reads after
    the date, each read compared with the one before it; the first read after the date compares
    with the track's last read on or before it, or with its own baseline if it has none. A fall adds
    nothing, so "since" never goes below zero (DEC-137). A date before `history_from` is clamped to
    it, and `since_clamped` says so. A date after `last_read` answers zero plays.
  - **The date is the user's local day:** the renderer sends `since` with the UTC offset in effect
    at local midnight of `since` itself, not today's (`-new Date(y, m-1, d).getTimezoneOffset()`),
    so a date on the other side of a daylight-saving change is still its own midnight
    (`since=2026-09-01&tz=+03:00`); the service compares `read_at` against that local midnight.
    A read stamped exactly at that midnight counts for the day.
  - **Since a read** (`since_read=<id>`, DEC-166's "since your last refresh"): the plays are the rises
    recorded **at** that read and after it, compared with each track's read before. A date cannot
    say this when two refreshes fall on one day.
  - **Ties** sort by plays, then title, then id, so the list is stable.
  - **Artists and labels** sum their tracks' plays (all time or since), over artist and remixer
    credits (DEC-165), distinct per track (fact 6), and count the tracks that had at least one play.
    Zero-play artists are left out. **All time,** a row's rules are the name and `play_count gt 0`,
    so it opens exactly the tracks counted. **Since a date,** no rule can say "played since", so the
    row opens all of that artist's played tracks and says so ("Shows all of B's played tracks").
  - **Never played** and **unknown** are counts with rules, not lists: the Library shows them.
- **Scope** (DEC-162): `scope=library` (the default), `collection:<id>` or `playlist:<id>`. Every query takes the scope as a track-id subquery. A Smart
  Collection's scope is its rules, compiled as the Library compiles them. Each returned rule set
  gains the scope's own rule (fact 7), so the Library opens the same tracks.
  - **Playlists use Phase 14's field.** PAGES-05B adds "In playlist" (FLW-7), over
    `rekordbox_playlist_tracks` (m0006), with any mix of playlists, Collections and Sets as its
    value; this step uses that field and its label and adds none (DEC-162 as amended 2026-10-08).
- **Refusals** (`status_for`): a bad `limit`, `since`, `tz`, `since_read` or `scope`, or `since` with
  `since_read`, is 400 `INVALID_REQUEST`; an unknown
  Collection or playlist is 404; no library is 503 `LIBRARY_UNAVAILABLE`. None is reported to Sentry
  (DEC-126, DEC-153).

**Tests**:
- `src/tests/unit/services/test_statistics_plays.py`, over a library built from a fixture XML and
  three refreshes:
  - the top N for each limit, all time and since three dates (before history, between reads, after
    the last read), with the clamp; since the last read, with two refreshes on one day;
  - a count that fell (Rekordbox reset), a new track, and a track with unknown count;
  - an artist spelled two ways counts as one; a two-artist track counts for both; a track crediting
    B as artist and remixer counts once for B; a remix counts for its remixer;
  - labels from an override beat the imported label;
  - each scope, and that every returned rule set opens exactly the counted tracks (run through
    `browse_count`).
- `src/tests/unit/engine/test_statistics_api.py`: the token, each refusal, the response shape.
- `test_statistics_contract.py` beside `test_waveforms_contract.py`: the TypeScript types match the
  payload.
- `src/tests/performance/test_statistics_scale.py` (slow): at 20,000 tracks with a year of weekly
  history, `plays` answers within the same order as `browse_count` of the whole library (a ratio, not
  seconds).

**Acceptance criteria / DoD**:
- Every all-time number the route returns matches the count the Library gives for its rule set.
  Since-a-date rows open a wider set, and say so.
- At 50,000 tracks and a year of history (`scripts/bench_library.py` extended with
  `--statistics`), `plays` answers in under 500 ms on the development machine; the number is
  recorded under this step.
- All suites pass.

**Risks**: Medium. **The "since" query** is the one new piece of logic, and a wrong baseline would
quietly mis-rank. The fixture's three refreshes and the clamp cases hold it.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-09). The playlist scope uses Phase 14's "In playlist"
field (FLW-7). `persistence/statistics_repository.py` (`IStatisticsRepository`)
holds the SQL, `services/statistics_service.py` (`IStatisticsService`) decides the scope, the window
and the rule sets, and `engine/statistics_api.py` is the route, registered in `server.py` before the
waveforms routes and in `bootstrap.py`. The scope is compiled by `build_select_scoped`, the
projection the Library's own browse and count come from, so a Smart Collection, a Collection, a Set
and a playlist narrow the numbers exactly as they narrow the table. Plays since a read are the
rises at that read and after it, each row compared with the track's previous stored row by its
primary key, so the cost follows the window and not the history behind it.

Decided while building:
- **Dates and reads.** "Since" counts the reads at or after the local midnight, from the lowest read id among them, whatever order the clock and the ids fell in; the first row a
  track ever has (its baseline, or a new track's first count) adds nothing. A date before the first
  read is clamped to it, which is the same numbers, with `since_clamped` true. `since` in the
  answer is the date as asked, not the clamped one; it is `null` for `since_read`. `history_from`
  and `last_read` are the stored UTC timestamps as written.
- **Refusals.** An id that is no read is 404 `NOT_FOUND`, as an unknown Collection or playlist is;
  so is a Collection folder, which holds no tracks. A Smart Collection whose saved rules no longer run is 400
  `INVALID_REQUEST`. `since` and `tz` must come together, and a `since` year outside 1900 to 9998 is
  400 (local midnight there overflows UTC). A `+` in `tz` that the query string decoded to a space is read as a plus. A
  blank parameter (`limit=`) is treated as absent, as the server reads query strings everywhere.
  Messages for a bad value do not echo it.
- **`opens_more`** is on every artist and label row, `false` all time and `true` since a date or
  a read.
- **Artists and labels tie** by key, which is the name folded to one case, not by display name, so
  the cut at the limit is stable and the display name is only looked up for the rows kept.
- **Scale reference.** The spec compares `plays` with `browse_count` of the whole library; that is a
  count the table keeps (0.03 ms) and says nothing about scanning rows, so the scale test compares
  with the count of the played tracks (`play_count gt 0`), with a 50 times ceiling.
- **No history at all** (no reads) answers all time as usual and zero plays for any "since".
- **TypeScript.** None declares the answer until STATS-04 (it owns the six contract files), so
  `test_statistics_contract.py` pins the Python payload, the rule sets' vocabulary and the refusal
  codes, and holds the client's types to the answer as soon as `StatisticsPlays` is declared.

Checked in the cloud container: `test_statistics_plays.py` (every all-time rule set run through
`browse_count`, in the library, a Collection, a Set, a Smart Collection and a playlist),
`test_statistics_api.py`, `test_statistics_contract.py`, `test_statistics_scale.py`, the engine,
services, persistence and reporting suites, the rest of the non-slow suites, ruff 0.14.0, the mypy
gate and `smoke_engine_health.py`. The raise-site fixtures and `test_discover_schema.py`'s reader
list name the new module. Scale: at 20,000 tracks with 52 weeks of history `plays` costs 20 to 30
times a `browse_count` of the played tracks (ceiling 50), and 200 rows cost under 3 times 10.
`scripts/bench_library.py --statistics` at 50,000 tracks with a year of weekly history (500
counts moved a week, 26,000 rows; the import and earlier reads dated a year back, so "90 days" is
a quarter of it), medians in this container: whole-library count 0.03 ms, `plays` all time 140 ms
(181 ms for 200 rows), since 90 days 73 ms, since the last read 55 ms, all under the 500 ms budget.
Not checked: a library of the owner's own.

---

## STATS-03 — The Spreads and Health, Answered

**Objective**: One route for how the library spreads by six fields, and one for the health
numbers, each bucket with the rule that opens it where a rule can say it.

**User-visible result**: None yet.

**Dependencies**: STATS-02 (the service and module it extends). It does not need history.

**Existing code reused**: `parse_key`, `format_key`, `key_notation_counts`; the waveform store
and `current_files`; `HealthService.report()`; `WaveformAnalysisService.plan()`.

**Design**:
- **`GET /api/v1/statistics/spreads?scope=<scope>`** answers all six at once (one request, one
  read transaction), each a list of `{ label, count, rules | null }` plus `unknown` and
  `total`:
  - **Genre:** the effective genre, exact text, case-blind grouped as the filter's `is` matches. The
    top 20 by count, then one **Other** bucket (no rule) and **No genre** (`genre` is empty).
  - **Key:** not counted here (DEC-206). The key summary reads PAGES-16's
    `POST /api/v1/library/keys/population` with the scope as its sources: tracks with a key, the
    three commonest codes, and `no_key` ("No Beatport key"). The spreads are six.
  - **Tempo:** the effective BPM's bucket is `n = floor(bpm + 0.5)` (not Python's `round`, which
    sends 124.5 to 124), one bucket per BPM present, each opening
    `bpm gte n-0.5` and `bpm lt n+0.5`, so every BPM lands in exactly one bucket. DJs read 124 and 125 as different tempos, so no wider bins.
    Tracks with no BPM are **No tempo**.
  - **Year:** one bucket per year present, `year is n`. **No year** for empty or 0.
  - **Date added:** one bucket per month present (`YYYY-MM`), opening `date_added between YYYY-MM-01
    and YYYY-MM-31` (fact 7). Malformed dates are **Unknown date**, count only.
  - **Rating:** 0 to 5 stars, and **Unrated** (empty), from the effective rating (fact 3).
  - **Loudness:** integrated LUFS in 1 LU buckets, read from the store for the scope's present
    files at the current version (fact 4). Not measured yet is **Not measured**, and tracks with no
    present file are **No file**, so the buckets sum to the scope's tracks. No rules: loudness is
    not a filter field.
- **`GET /api/v1/statistics/health?scope=<scope>`**:
  - `files`: present, missing, unreadable, not checked, each with `file_status is <state>`;
  - `beatport`: accepted, needs review, rejected, no match and not matched, each with
    `match_state is <state>` (`MATCH_STATE_CHOICES`, `filter_rule.py:436`), so the five sum to the
    scope's tracks;
  - `analyzed`: analyzed, failed, waiting, over the scope's **present** files (no rules), and no
    file, so they sum too;
  - `checked_at`: the last file check's time, so the page can say how old "missing" is.
  Every count is scoped. `HealthService.report()` and `WaveformAnalysisService.plan()` take no
  scope today, so this step counts files and match states with one grouped query each over the
  scope's tracks, and gives `plan()`'s counting a `paths` argument (the scope's present paths),
  keeping its rule for what counts as analyzed (current version, size as last checked). Health's
  other checks (duplicates, artwork, and the rest) stay in Clean's tab (DEC-163).
- **One grouped query per field,** not one count per bucket (fact 11). Loudness is one read of
  the store per request, with the paths chunked under SQLite's variable limit.

**Tests**:
- `src/tests/unit/services/test_statistics_spreads.py`: each field over a fixture with overrides,
  two key notations, a key spelled "EB" beside "Eb", malformed dates (`2026-09-1`, `soon`), empty
  values and BPMs at bucket edges (123.5, 124.49, 124.5); the
  top-20 cut and Other; loudness at a stale version counts as not measured; each scope.
- For every bucket with rules, the rule set's `browse_count` equals the bucket's count (one
  parametrized test across fields).
- `test_statistics_health.py`: the four file states and five match states each sum to the scope;
  analyzed matches `plan()` for the whole library; every count is scoped.
- `test_statistics_api.py` and the contract test extended to both routes.
- `test_statistics_scale.py`: `spreads` at 20,000 tracks.

**Acceptance criteria / DoD**:
- Every bucket count equals the Library's count for its rules; the buckets of each field, with its
  unknown, empty and no-file lines, sum to the scope's tracks.
- At 50,000 tracks, `spreads` under 1 s and `health` under 500 ms on the development machine,
  recorded under this step.
- All suites pass.

**Risks**: Low to medium. **Keys in many notations** and **text dates** are where counts and the
opened Library could disagree; the equal-count test holds both.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-09), extending STATS-02's module and scope resolution. Every
spread is one grouped scan of the scope's tracks, projected through `build_select_scoped` with the
filter vocabulary's own expression for the field (`field_spec(name).expression`, and the `file_status`
and `match_state` expressions for health), so the value grouped is the value the Library's rule
compares. The scope's tracks come back as one `NULL` group where a track fits no bucket, and the
service names it. `StatisticsRepository` gains `total`, `genre_spread`, `tempo_spread`,
`year_spread`, `rating_spread`, `month_spread`, `present_files`, `file_states`, `match_states` and
`last_checked`; `StatisticsService` gains `spreads` and `health`; `engine/statistics_api.py` the two
routes, which take `scope` and nothing else. `WaveformStore.readings` reads loudness for a list of
paths at one version, in chunks, and `WaveformAnalysisService.plan()` takes the keyword-only `paths`.

Decided while building:
- **Answer shape.** Each spread is `{ buckets, unknown, total }`; a bucket is
  `{ label, value, count, rules | null }` (`value` is the genre, tempo, year, `YYYY-MM`, star
  count or whole LUFS the bar stands for, `null` for **Other**) and `unknown` is
  `{ label, count, rules | null }`. Loudness alone adds `no_file`, a line like `unknown`, and has no
  rules anywhere. The answer carries `scope` as it was asked (`library`, `collection:7`).
  Health's `files` and `beatport` entries are `{ count, rules }` keyed by state, in the order the
  page reads them (`present, missing, unreadable, not_checked`; `accepted, needs_review,
  rejected, no_match, not_matched`); `analyzed` is four plain integers.
- **Genre** groups `COLLATE NOCASE`, as the filter's `is` compares, and is named by its smallest
  spelling (binary order, so `HOUSE` before `House`), not its commonest; ties sort by name. The
  top 20 are cut after the grouping, and **Other** is present only when something is left.
- **Tempo** is decided by comparison, not by adding: `n = trunc(bpm)`, plus one when
  `bpm >= n + 0.5`. `floor(bpm + 0.5)` can round up in floating point while the rule `bpm < n + 0.5`
  still says no, and the bucket must be the rule's. A BPM under 0.5 (zero or less, or too small to round to a tempo; an override can store one, an
  import does not) is **No tempo** but cannot be opened with `bpm is empty`, so that line has
  `rules: null` whenever one exists, and `bpm is empty` otherwise. **No year** is the same for a year
  of zero or less.
- **Date added** takes a month only for `YYYY-MM-` with a month 01 to 12 whose whole value lies in
  `YYYY-MM-01 … YYYY-MM-31` as text, which is the `between` rule's own comparison: `2026-09-1` is in
  September, `2026-09-31 12:00` is not, and `2026-13-05`, `soon` and a missing date are **Unknown
  date** (count only).
- **One snapshot.** `spreads` and `health` run all their reads inside one read transaction
  (`StatisticsRepository.snapshot()`), so the total and every field count the same library even if a
  refresh commits between them.
- **Rating** always shows 0 to 5 stars, empty bars included, and any other value present after them;
  **Unrated** is `rating is empty`.
- **Loudness** is `floor(LUFS)` per bar, labelled `-9 LUFS` for [-9, -8). A track is counted where
  its file was found present at its current path and the store has a reading of the current
  `LOUDNESS_VERSION` whose size is the one the last check recorded (the analysis's own rule); any
  other present file is **Not measured**, and a track with no present file (missing, unreadable,
  never checked or checked at another path) is **No file**.
- **Analyzed** is `plan(limit=0, ordered=False)`'s counts: `analyzed` and `failed` as it counts
  them, `waiting` its `remaining`, and `no_file` the scope's tracks less its present files. `plan()`
  takes a keyword-only `track_ids` (not paths): for the whole library none are passed, so the numbers
  are `plan()`'s own; for a scope, the scope's present tracks, so a track outside the scope that
  shares a path with one inside is not counted and the four always sum to the scope.
- **`checked_at`** is the latest `checked_at` among the scope's `track_files` rows whose
  `checked_path` is the track's current path, so a check of an old path does not date the answer;
  `null` when none.
- **Without the store.** A service built with no waveform store or analysis reads nothing as
  measured and nothing as analyzed; a store that cannot be read is logged and read the same way.
- **TypeScript.** None declares the answers until STATS-04, as for STATS-02. The contract test
  pins the Python payloads and their rule vocabulary now, and holds the client's `StatisticsSpreads`
  and `StatisticsHealth` types to them as soon as they are declared.

Checked in the cloud container: `test_statistics_spreads.py` and `test_statistics_health.py`
(overrides, the 124.49 / 124.5 / 123.5 tempo edges, `2026-09-1` and `soon`, empty values, the top-20
cut, a stale loudness version, a changed file size, a missing file; every bucket and line with
rules run through `browse_count` in the library, a Collection, a Set, a Smart Collection and a
playlist, and each field's buckets and unknown lines summed to the scope's total),
`test_statistics_api.py`, `test_statistics_contract.py`, `test_statistics_scale.py` (spreads and
health at 20,000 tracks), the engine, services, persistence and reporting suites, ruff 0.14.0, the
mypy gate, `smoke_engine_health.py`, the dead-code guard and `check_no_qt.py`.
`scripts/bench_library.py --statistics` at 50,000 tracks, measured in the cloud container, with the
tracks given thirty years, 120 months, 90 tempos and six ratings, a present file check each, and a
waveform store with loudness for 70% of them (medians): whole-library `spreads` 462 ms
(under the 1 s budget), `health` 436 ms (under 500 ms); in the largest playlist (700 tracks),
`spreads` 9 ms and `health` 333 ms. `health` is held up by `plan()`, which builds an object for each
of the library's present files whatever the scope is; it is the one number with little margin, and
the place to look if the budget is ever missed. A scope that is a folder holding every playlist is
dearer for every route, because the Library itself reads 175,000 playlist entries to open it.
Not checked: a library of the owner's own, with real loudness measurements.

---

## STATS-04 — The Statistics Destination

**Objective**: Statistics in the sidebar after Prepare (DEC-138), the bridge to the three routes,
and the page's frame: its sections, scope picker, loading and empty states.

**User-visible result**: A **Statistics** entry after Prepare opens a page with three sections,
Plays, Your library and Health, each showing a loading state, then its content once STATS-05 to
STATS-07 fill it. With no library imported, the page says so and offers **Import a library**. With a
library but no history yet (a library imported before updating whose import record was cleared, so nothing was seeded), the Plays section
says "Play history starts at your next refresh" and still shows all-time plays.

**Dependencies**: STATS-02, STATS-03; Phase 14 (PAGES-03's sidebar, PAGES-05's empty-state shape).

**Existing code reused**: `navRegistry.ts`, `screenFor` in `App.tsx`, `PixelIcon`, the
`getLibraryHealth` bridge chain as the pattern (`engineClient.ts:3485` → `engineSupervisor.ts:719` →
`main.ts:417` → `preload.cjs:138` → `cuepointBridge.types.ts:3154`).

**Design**:
- **The registry entry:** `{ id: "statistics", label: "Statistics", path: "/statistics", group:
  "workspace", enabled: true, icon: "statistics" }`, after Prepare. A new 12×12 `statistics` icon (three bars of
  rising height) in `pixelIcons.ts`, two cells wide by its test. A `screenFor("statistics")` case.
  The NAV-1 hint (PAGES-03): "See what you play most and how your library is made up."
- **The six contract files** move together: `engineClient.getStatisticsPlays/Spreads/Health`,
  the supervisor, main's three handlers, preload, and `cuepointBridge.types.ts`'s
  `statistics.{plays,spreads,health}` with their types. `desktopContract.test.ts` covers them.
- **`screens/statistics/StatisticsScreen.tsx`** with `useStatistics.ts` (one hook per route,
  re-read when the scope changes and after an import or refresh finishes, as Clean's health hook
  listens).
- **The scope picker** (DEC-162) sits in the page header: **Whole library**, then the Collections and
  Rekordbox playlists in a tree like the Library's. The chosen scope is remembered in
  `cuepoint-statistics-scope` (localStorage, fact 7 of Phase 14), falling back to Whole library when
  the Collection or playlist is gone.
- **Empty and loading states** use PAGES-05's `{ title, hint, action? }` and PAGES-12's loading
  motion. A failed read shows the plain-words error the other pages show, with **Try again**.
- **Words:** no "engine", "jobs", or "query" (DEC-155); American spelling (DEC-158). The user
  guide gains `docs/user-guide/statistics.md` (a stub naming the sections) and the sidebar list in
  `the-window.md`.

**Tests**:
- `navRegistry.test.ts`, `Sidebar.test.tsx`, `e2e/shell.spec.ts:211` and `pixelIcons.test.ts`
  updated for the new entry (fact 10).
- `StatisticsScreen.test.tsx`: loading, no library, a library with no history, a failed read with
  **Try again**, and the scope picker's fallback when a stored scope is gone.
- `desktopContract.test.ts` and the engine contract test for the three routes.
- `e2e/statistics.spec.ts`: import a fixture library, open Statistics from the sidebar, see the three
  sections and the "starts at your next refresh" note.

**Acceptance criteria / DoD**:
- Statistics is the sidebar entry after Prepare, reachable by mouse and Tab, with every theme and
  scale drawing its icon.
- No destination before it moved.
- All suites pass.

**Risks**: Low.

**Complexity**: **S**

**Outcome**: Implemented (2026-10-09). Statistics is the sidebar entry after Prepare (`navRegistry.ts`,
a three-bar `statistics` pixel icon, `screenFor("statistics")`), and the three routes cross the
bridge as flat methods named `getStatisticsPlays`, `getStatisticsSpreads` and `getStatisticsHealth`
through `engineClient.ts`, `engineSupervisor.ts`, `main.ts`, `preload.cjs` and
`cuepointBridge.types.ts`, with `StatisticsPlays`, `StatisticsSpreads` and `StatisticsHealth` (and
their parts) declared to match the Python payloads. `test_statistics_contract.py`'s two TypeScript
comparisons are no longer skipped and pass. `screens/statistics/` holds the page (`StatisticsScreen`,
`useStatistics.ts` with one hook per route, `statisticsScope.ts`, `statisticsEmpty.ts`).

Decided while building:
- **Flat bridge names, not `statistics.{plays,spreads,health}`,** as the sibling methods are named;
  `main.ts` checks that a call carries nothing but text and numbers under the five known keys
  (`statisticsParams`) and leaves the values to the engine.
- **The hint has no final period** ("See what you play most and how your library is made up"):
  `navRegistry.test.ts` holds every hint to that, and the other hints follow it.
- **The scope picker is a select over the Clean page's scope list** (`scopeOptions`), indented
  as the Library's trees are, with the whole library first and then a "Rekordbox playlists" header
  over the playlists. Playlists come before the Collections deliberately, as in the Library. A Smart Collection is offered as
  `collection:<id>`, which is how the route reads it; a Collection folder is drawn and cannot be
  chosen. A Smart Collection that cannot run (`broken`) is drawn disabled as "(rules need fixing)" and a
  remembered one falls back to the whole library. What is remembered under
  `cuepoint-statistics-scope` is the route's own word for the whole library and for Collections
  (`collection:<id>`), and a playlist's **path** (`path:<path>`, as the Library's pane remembers
  it), because every import and refresh gives the playlists new ids; the path is resolved to the
  current id each time the tree loads. The picker is not drawn until the summary says there is a
  library, and is disabled until the summary and the trees have answered.
- **A scope that is gone falls back in memory and is not forgotten.** Nothing is written back, so a
  Collection whose list failed to read for a moment is still remembered. No route is read until this
  refresh's summary, playlists and Collections have answered (a refresh unsettles them again), so a gone scope is never sent to the
  route and shown as a failed read.
- **Reading again.** The three hooks read again on the scope, on `announceLibraryChange`, on the end
  of a `library_import` or `library_refresh_apply` job (found by the status strip's poll through a second `useActiveJob`, with `subscribe: false` so it
  opens no progress stream; it ignores a failed poll and does not take a job the capped list left
  out, while more are active, for finished; nothing announces a job's end) and on **Try again**, which each section has for itself.
- **The section bodies are one line of counts each** (never played and no play count; the scope's
  tracks; files present and missing), from numbers the routes sent. STATS-05 to STATS-07 replace them.
- **The "starts at your next refresh" note cannot be seen after a real import.** An import seeds the
  baseline read (DEC-168), so a library imported by this build has `history_from`; the note is for a
  library imported before STATS-01. `e2e/statistics.spec.ts` asserts it is absent after an import,
  and `StatisticsScreen.test.tsx` shows it against an answer with `history_from` null.

Checked in the cloud container: the renderer's full suite, lint and typecheck; the main process's
tests and typecheck; `test_statistics_contract.py`; the dead-code guard and the version coupling
check; and `e2e/shell.spec.ts` and `e2e/statistics.spec.ts` under `xvfb-run` against the built app.
Not checked: the page on a library of the owner's own, in every theme and scale.

---

## STATS-05 — The Plays Section

**Objective**: Most played, top artists and labels, never played and unknown, all time or since a
date, each leading to its tracks; a top list kept as a Collection.

**User-visible result**: The Plays section shows:
- **Most played:** a list with a **Top 10 / 25 / 50 / 100 / 200** choice and a **Since** choice
  (DEC-166). Each row is rank, title, artist and plays, with a pixel bar for plays. Clicking a row opens
  the Library on that track; the play button previews it.
- **Top artists** and **top labels:** the top 10 of each, with plays and track count. A click opens
  the Library on that artist's or label's tracks.
- **Never played** and **plays unknown:** a count each, opening the Library on them.
- **Keep as Collection** (DEC-167) on the most-played list: it makes a Collection named, for
  example, "Most played since Sep 1, 2026 (top 50)", holding those tracks in rank order, and says
  where it is.
- The section's footer says when the counts were last read and when history started: "Counts from
  your refresh on Nov 2. History since Oct 8."

**Dependencies**: STATS-04.

**Existing code reused**: `libraryTrackState` (PAGES-03), `libraryRulesState`; the player's
preview action as the Library uses it; the bars of STATS-06's `PixelBars` if STATS-06 is first,
else this step creates `components/charts/PixelBars.tsx` and STATS-06 extends it.

**Design**:
- **Since** offers last refresh, 7, 30 and 90 days, a year, all time, and a date (DEC-166). A date before history starts is shown as clamped, with the
  route's `history_from`.
- **The top list's choices** persist in `cuepoint-statistics-plays` (`{ limit, since }`).
- **Keep as Collection** calls a new atomic engine route, `POST /api/v1/collections/create-from
  {name, parent_id, track_ids}` (fact 8), in `organization_api.py` beside `create`, which makes the
  Collection and adds the tracks in one transaction and answers the new Collection. The
  six contract files move together. The Collection is ordinary: it does not update when plays change.
- **Each row is a button** named "3. Title by Artist, 14 plays". The list is a real list for screen
  readers.
- **Motion:** a re-ranked list uses `state` motion; nothing else moves.

**Tests**:
- `PlaysSection.test.tsx`: each limit, each since choice and the clamp note, the empty and
  no-history states, a row click's navigation, the Collection's name for each since choice.
- Engine: `create-from` makes one Collection with the tracks in order, refuses an empty list or an
  unknown track (400, nothing made), and rolls back on failure.
- `e2e/statistics.spec.ts`: import, refresh a fixture with changed play counts, see the top list
  since the first import, keep it as a Collection, open it in the Library and see the same tracks in
  the same order.

**Acceptance criteria / DoD**:
- The top list, artists and labels match the route; every click opens exactly the tracks counted.
- A kept list becomes a Collection with those tracks in that order, in one step that cannot leave an
  empty Collection.
- All suites pass.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-09). `screens/statistics/PlaysSection.tsx` (with its css and
`playsChoice.ts`, the pure part: the remembered choice, the dates, the offset, the Collection's name)
fills the body of the page's Plays section; `StatisticsScreen.tsx` changed only to hold the choice and
mount it. `useStatisticsPlays` now takes the choice and keeps the last answer on screen (`stale`) while
the next is read, so the controls are never torn down by the read they started.

Decided while building:
- **`last_read_id` added to the plays answer** (Python, both TypeScript declarations, the two payload
  tests). "Since your last refresh" is `since_read=<id>`, and no route said which id was the last
  read. The hook asks without it first and again with the id the answer names, and again if a refresh
  has happened since.
- **The bar is a whole-block bar, not `PixelBars`.** `PixelBars` draws a sized chart in an SVG;
  a list row wants a bar that is part of the row. It is blocks of `--unit` (at most 24), so it scales
  and themes with everything else.
- **Since** offers Your last refresh, The last 7, 30 and 90 days, The last year, All time and A date.
  A relative choice is today's local date minus that span, sent as a date with the offset at that
  date's own local midnight. The choice is remembered in `cuepoint-statistics-plays` as `{ limit,
  since }` (`since` is `refresh`, `7d`, `30d`, `90d`, `year`, `all` or `date:YYYY-MM-DD`), default
  top 10 and all time.
- **Names of kept lists:** "Most played, all time (top 50)", and for every other choice "Most played
  since Sep 1, 2026 (top 50)", with the day the counts really begin: the typed or computed date, the
  day of the last refresh for Your last refresh, and the day history starts when a date was clamped. The
  name is shown before the button is pressed. The Collection is made at the top of Collections;
  the message says so and offers **Open it in the Library**, which opens the Library on
  `collection in_collection <id>` (its table order is the Library's, the Collection's own order is
  shown by opening it in the Collections tree).
- **Artists and labels:** the first ten of the route's rows. Every row says its plays and tracks; a
  since-a-date row says "Shows all of B's played tracks" in its visible text.
- **Never played** and **Plays unknown** are buttons with their counts, disabled at zero.
- **The preview button** reads the track (`getLibraryTrack`) and plays it with the player's
  `playQueue` through `runQueueAction`, as the Library's Track details does; it is not drawn where
  there is no player.
- **Motion:** a row whose rank moved when the list was read again steps once (`state`, through
  `useCountChanges`); nothing else moves.
- **A typed date** is held in the field and becomes the choice only when it is a complete, real day
  from 1900 to the current year; `isPlaysSince` and `sinceDay` refuse any other, so a bad saved value
  falls back to all time. A date after today is accepted and says it has nothing to count.
- **A failed read with an answer on screen** leaves the section mounted with an inline error and
  **Try again**; a refusal is not reported. While a new choice is read the list is dimmed and says
  "Reading…". "Your last refresh" with no read in the history shows no all-time numbers. A read id the
  route answers 404 for is forgotten and learned again. "Today" is read each time the page is read.
- **Keep as Collection** is not drawn without the bridge call, and a refused list says a track has
  gone and offers to read the list again.

Checked in the cloud container: `PlaysSection.test.tsx`; the renderer's full suite, lint and typecheck;
the main process's tests and typecheck; `test_statistics_plays.py`, `test_statistics_api.py` and
`test_statistics_contract.py`; the dead-code guard; and `e2e/statistics.spec.ts` under `xvfb-run`
against the built app (an import, a refresh that moves play counts, the top list since the refresh,
kept as a Collection and opened in the Library in the same order). Not checked: the page on a library of
the owner's own, in every theme and scale.

---

## STATS-06 — How the Library Spreads

**Objective**: The six spreads drawn in the pixel style, each bar opening its tracks, and a key
summary that opens the Keys page.

**User-visible result**: The **Your library** section shows six panels: Genre, Tempo, Year, Date
added, Rating and Loudness. Each is a pixel bar chart with its counts written on it, and a line for
the tracks it cannot place ("41 tracks have no tempo"). Clicking a bar opens the Library on those
tracks. Loudness bars show their counts and do not open. A seventh panel, **Keys**, is a summary:
"1,840 of 2,212 tracks have a Beatport key · most common 8A (142), 9A (131), 7A (118) · No Beatport
key: 372", with **Open in Keys**, which opens the Keys page with the same scope ticked (DEC-206).

**Dependencies**: STATS-04; PAGES-16 (the Keys page and its population route).

**Existing code reused**: `SetLanes.tsx` and `prepareLanes.ts` as the drawing pattern;
PAGES-16's population route and its sources; theme tokens.

**Design**:
- **`components/charts/PixelBars.tsx`** with its geometry in `pixelBarsGeometry.ts` (pure, tested
  without a DOM): bars are whole-pixel `<rect>`s at every size, rounded at 1.5× (DEC-161), filled with
  `--accent-primary` (the hovered or focused bar `--accent-primary-hover`), axes and labels in
  `--fg-muted` and `--font-data`, outlined in `--border-outline`. Horizontal bars for named buckets
  (genre, rating), vertical for ordered ones (tempo, year, date added, loudness). Long ordered runs
  (tempo across 60 to 180 BPM, ten years of months) scroll sideways inside the panel; the page does
  not.
- **The key summary** (DEC-206) draws no wheel: the Keys page's counts mode (PAGES-16) is the one
  place a key spread is drawn. **Open in Keys** navigates to `/keys` with the scope as its ticked
  sources (a Collection, a Smart Collection's own sources, or a playlist).
- **Each bar is a button** named "124 BPM, 312 tracks", reachable by Tab, with arrow keys moving
  within a chart. Charts have a text table fallback for screen readers (`<table>` visually hidden).
- **Motion:** bars grow in pixel steps under `entrance` when first shown, and change under `state`
  when the scope changes (DEC-134, DEC-135). Reduced motion shows them at once.

**Tests**:
- `pixelBarsGeometry.test.ts`: whole pixels at sizes 1×, 1.5×, 2× and 3×; a zero bucket draws nothing; the
  tallest bar fills the height.
- `PixelBars.test.tsx`: names, keyboard movement, the click's navigation, no click on a bar
  without rules.
- `KeySummary.test.tsx`: the counts from the population route, "No Beatport key", and Open in Keys
  carrying the scope.
- `SpreadsSection.test.tsx`: each panel, the unknown lines, the loudness panel without clicks.
- `motionRules.test.ts` passes (bars animate transform and opacity only).
- `e2e/statistics.spec.ts`: Open in Keys shows the same counts on the Keys page; click a tempo bar
  and the counts match.

**Acceptance criteria / DoD**:
- Every bar's count equals the tracks the Library shows on its click.
- The charts are readable in every theme and at every scale, and by keyboard and screen reader.
- All suites pass, with the scroll checks of PAGES-12 unchanged.

**Risks**: Low to medium. **Drawing at four sizes in five themes** is where it can look wrong;
Storybook stories for each chart at each scale and theme are the check.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-09). `PixelBars` and its geometry were already built and are
unchanged. The **Your library** section's body is now `screens/statistics/SpreadsSection.tsx`
(six panels from the spreads answer, in the order Genre, Tempo, Year, Date added, Rating, Loudness)
and `KeySummary.tsx` (the seventh), in a wrapping grid in `statistics.css`; `StatisticsScreen.tsx`
changes only that section's body.

Decided while building:
- **Bars and lines.** A bar opens the Library on its rules (`libraryRulesState`, the engine having
  put the scope's rules in); a bucket without rules (Other) and every loudness bar are drawn and open
  nothing. Tempo and loudness label the axis with the bare number ("124"), and name the bar with the
  engine's label ("124 BPM, 312 tracks"). Each panel writes the tracks it cannot place in words ("41
  tracks have no tempo", "17 tracks are not measured yet", "4 tracks have no file to measure") and
  says nothing when the count is 0. A line the engine gave rules (no genre, no tempo, no year,
  unrated) gets a visible **Open in Library** button, so nothing is hover- or right-click-only; the
  lines with no rule (unknown date, loudness) are text.
- **Key summary.** It reads `getKeysPopulation` with the scope as its one source (`library` is
  `all`; `playlist:7` a playlist; `collection:<id>` a Collection or a Set by the node's own kind,
  since the scope string cannot tell them apart), says "N of M tracks have a Beatport key", the
  three commonest codes by count, and "No Beatport key: K", and **Open in Keys** carries the same
  sources through `keysState`. **A Smart Collection** is not a source the Keys page can tick, because
  its rules decide its tracks. It is mapped only when its whole rule set is one "In playlist is any
  of" rule (then those places are exactly its tracks, and they are ticked). Any other Smart
  Collection shows no counts, says "Keys counts playlists, Collections and Sets, not a Smart
  Collection's rules, so it opens on your whole library", and **Open in Keys** opens it on the whole
  library, which the sentence says.
- **The Library's total line is gone** from the section (it was STATS-04's placeholder); the
  `StatisticsScreen` test now checks for the Genre panel instead.

Checked in the cloud container: the renderer's full suite, lint, typecheck and `motionRules.test.ts`;
the main process's tests and typecheck; the dead-code guard (the three `PixelBars` allowlist entries
are removed, now that the page reaches them); and `e2e/statistics.spec.ts` under `xvfb-run` against
the built app (a tempo bar's Library count; Open in Keys on a playlist showing the same counts).
Not checked: the panels by eye in every theme and scale on a library of the owner's own.

---

## STATS-07 — Health, and the Phase Comes Together

**Objective**: Library health on the page, Clean's Health tab kept (DEC-163), the user guide, and
the phase-level acceptance.

**User-visible result**: The **Health** section shows files (present, missing, unreadable, not
checked, with when they were last checked), Beatport (accepted, needs review, rejected, no match,
not matched) and waveforms (analyzed, failed, waiting). Each count with a rule opens the Library
on it, and each group links to where it is fixed: **Check files** and **Match** in Clean, **Analyze**
in Settings → Waveforms. **All health checks** opens Clean's Health tab, which stays (DEC-163).

**Dependencies**: STATS-05, STATS-06.

**Design**:
- **The section** reads `statistics/health`, drawn as three small pixel bars (one per group) with
  their counts, using `PixelBars`.
- **Clean's Health tab stays** (DEC-163): the page shows the three groups above and **All health
  checks** opens Clean's tab. Nothing in Clean changes.
- **The user guide:** `statistics.md` in full (what each number means, that plays come from
  Rekordbox's own count, that history starts at the first refresh after updating, and that "since"
  is as fine as the refreshes), `glossary.md` (play history, never played), and `the-window.md`.
- **The phase-level acceptance** run, below.

**Tests**:
- `HealthSection.test.tsx`: each group, the links, the not-checked line.
- `e2e/statistics.spec.ts`: the full journey (import, refresh with changes, every section, one click
  from each into the Library).

**Acceptance criteria / DoD**: the phase-level acceptance below.

**Risks**: Low.

**Complexity**: **S**

**Outcome (implemented 2026-10-09)**:
- **`HealthSection.tsx`** replaces the Health section's one-line placeholder; it is the only part of
  `StatisticsScreen.tsx` that changed. Three `.statistics-panel`s, each a horizontal `PixelBars`:
  **Files** (Present, Missing, Unreadable, Not checked, then "Last checked October 9, 2026" from
  `checked_at` in American date words, or "Files have not been checked yet"), **Beatport** and
  **Waveforms** (Analyzed, Failed, Waiting, No file; counted only, so no bar is a button).
- **Beatport uses the app's own words** (`matchStateLabel`, as Clean's Review and the Library's Match
  column do): Accepted, Waiting for you, Rejected, No match, Not matched. **Clean, Statistics and the
  Library's chips now share the filter's words** (MATCH_STATE_CHOICES; decided by Stelios
  2026-10-09); the engine is not changed. The spec's "needs review", "rejected", "no match" and "not matched" are the stored states;
  the page does not invent a second name for them.
- **Every count with rules opens the Library on the route's own rules** (`libraryRulesState`); an
  empty bar is drawn and is not a button. One visible button per action, nothing hover-only:
  **Check files** opens Clean on its Health tab (where "Check every file" is), **Match** opens Clean
  on Review matches, **Analyze** opens Settings on Waveforms (`settingsFocusState("waveforms")`),
  and **All health checks** opens Clean's Health tab. Nothing in Clean changed (DEC-163).
- **`docs/user-guide/statistics.md`** is written in full (scope, each section, each number's
  meaning, plays being Rekordbox's own count, history starting at the first refresh or import after
  updating and seeded from the last import, "since" being only as fine as the refreshes, the clamp,
  Keep as Collection); `glossary.md` has Play history and Never played; `the-window.md` already
  said what Statistics is and needed no change. The Plays text was checked against the built `PlaysSection` (its choices, the clamp, "no
  refresh" and read-failed messages, Keep as Collection's name and place, and the footer).
- **A finding for the e2e:** an import already runs a file check, so a fresh library shows
  Present and Missing, not "Not checked"; the STATS-04 assertion was updated to "Present, 2 tracks"
  and the STATS-07 journey reads the engine's count rather than assuming.

Checked in the cloud container: `HealthSection.test.tsx` (each group, the links, the not-checked
line, bar navigation, no click on the count-only bars) and `StatisticsScreen.test.tsx`; the
renderer's full suite (5,836 tests), lint and typecheck; the main process's tests, typecheck and
build; the dead-code guard; and `e2e/statistics.spec.ts` (the full journey: an import, a refresh with
changed play counts, every section, and one click each from Plays, Your library and Health into the
Library with the counted tracks; All health checks into Clean's Health tab) with `e2e/shell.spec.ts` under
`xvfb-run` against the built app. Not checked: the section on a library of the owner's own, in
every theme and scale.

---

## Phase-level acceptance

Phase 15 is complete when, in a **packaged build** on Windows and macOS:

1. Statistics is the sidebar entry after Prepare, and no other destination moved. *STATS-04.*
2. After an import and a refresh with changed play counts, the most-played list all time and since
   the import are right, a count that fell adds nothing, and a date before history is clamped and
   said so. *STATS-01, STATS-02, STATS-05.*
3. Top artists and labels follow the credit index: one artist spelled two ways is one row.
   *STATS-02.*
4. Every count that opens the Library opens exactly the tracks it counted, in every scope the page
   offers; the since-a-date artist and label rows say they open more. *STATS-02, STATS-03, STATS-05, STATS-06, STATS-07.*
5. The key summary counts Beatport's keys in every notation together, matches the Keys page, and
   opens it with the same scope. *STATS-06.*
6. A top list kept as a Collection holds those tracks in rank order. *STATS-05.*
7. Play history is in a backup and restored with it, and a deleted track's history goes with it.
   *STATS-01.*
8. At 50,000 tracks and a year of weekly history, the page shows every section within 2 s of opening
   on the development machine, and a refresh is within 10% of Phase 14's. *STATS-01 to STATS-03.*
9. The page reads well in every theme and scale, by keyboard and screen reader, with every motion
   switch on and with reduced motion. *STATS-04 to STATS-07.*
10. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check,
    the end-to-end suite and `npm run dist`.
11. No decision in DEC-001…DEC-168 is contradicted. A contradiction stops the work and is raised
    rather than worked around.

**Status (2026-10-09, STATS-07).** Verified in the cloud container (unit, contract and e2e
suites against the built app, not a packaged one): 1 (STATS-04's sidebar tests and `shell.spec.ts`),
2 (an import, then a refresh with changed play counts: the most-played list all time and since the refresh is right in the e2e; a count that fell adding nothing, and the clamp note, are engine and component tests) and 6 (the kept list holds the same tracks in the same order in the Library, e2e), 3, 4 for Health, spreads and the key summary (every count run through `browse_count` in every scope,
and a top artist, a genre bar and a Health bar each opened in the e2e with the counted tracks), 5, 7, 11 (no
decision contradicted; DEC-163 kept), and 8 at **route level only**: `bench_library.py --statistics`
at 50,000 tracks gives whole-library `spreads` 462 ms and `health` 436 ms. Criterion 10 is verified
for every suite named here except `npm run dist`, which needs a packaged build.
**Needs the owner:** the packaged Windows and macOS builds (criteria 1 to 7, 10's `npm run dist`);
page-open time on the development machine, with a year of weekly history, and a library of the
owner's own with real loudness (8, 4); and every theme and scale, the keyboard and screen reader,
and every motion switch and reduced motion, by eye (9).

## Decision Round 18 — what writing the steps raised

Asked in `OPEN_QUESTIONS.md` as Q-163…Q-169 and answered 2026-10-07, each as recommended.

| Question | Outcome | Needed by |
| --- | --- | --- |
| Q-163 — Can the page be narrowed to a Collection or playlist? | DEC-162: both, one picker; playlists gain a filter field | STATS-02, STATS-04 |
| Q-164 — Does Clean keep its Health tab? | DEC-163: yes; Statistics shows a summary that links to it | STATS-03, STATS-07 |
| Q-165 — Tracks with no play count | DEC-164: their own "Plays unknown" line | STATS-02 |
| Q-166 — Do remixer credits count toward an artist's plays? | DEC-165: yes, once per track | STATS-02 |
| Q-167 — What "Since" offers | DEC-166: last refresh, 7, 30, 90 days, a year, all time, a date | STATS-02, STATS-05 |
| Q-168 — Keeping a top list | DEC-167: a plain Collection, a snapshot in rank order | STATS-05 |
| Q-169 — Where history starts | DEC-168: seeded from the last import | STATS-01 |

## Deferred, with reasons

- **Plays counted by CuePoint's own player.** It previews; Rekordbox is where sets are played, and
  two counts would disagree.
- **History before STATS-01.** It was never stored (DEC-137). At most the seed (Q-169) keeps the
  counts as of the last import.
- **Reading Rekordbox's own database for per-play dates.** Out of scope: CuePoint reads the XML only.
- **Exporting the statistics** (CSV, image, share). Not asked for; a later release.
- **Loudness and "analyzed" as Library filter fields.** They live in `waveforms.db`, and filtering
  across two databases is its own piece of work.
- **A Smart Collection for "most played".** "Top N" and "since" are not filter rules (fact 7).
- **Number shortcuts for destinations.** None exist for any page.
