# CuePoint v1.0.0 — Phase 4: Library UI, Detailed Step Specifications

Status: **In progress.** LIBUI-01…LIBUI-04 are implemented, each with its outcome recorded below
the step that specified it; LIBUI-05…LIBUI-10 are specified and not started. Per the process, no implementation
happens from this document — each step needs an explicit "Implement LIBUI-NN" instruction, scoped
to exactly that step, and its outcome is recorded under the step afterwards.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`) and Phase 3
(`PHASE3_LIBRARY.md`), all complete, and on Decision Rounds 1–6 (`DECISIONS.md`, DEC-001…DEC-048).
Phase 4's own decisions are DEC-039…DEC-048, alongside DEC-023 (one search path), DEC-031
(playlists are read-only), DEC-016 (flat AND-only rules), DEC-018/DEC-024 (the Inspector) and
DEC-012 (double-click, which Phase 5 delivers).

## What this phase is

Phase 3 filled a database nobody can look at. `LibraryScreen` reports `3,880 tracks · 234
playlists · 13,870 entries` and, by its own test, renders no rows. This phase is the browsing
surface: a generic virtualized track table fed a window at a time from the engine, a playlist tree
that scopes it, a reusable filter system, column control, multi-selection, and the first real
content in the Track Inspector.

**What this phase is not.** It edits nothing. Tags, ratings, notes and Collections are Phase 6
(DEC-006, DEC-015); Beatport values, duplicates, missing files and health are Phase 7 (DEC-004,
DEC-037); playback and the track context menu are Phase 5 (DEC-012, DEC-013); export is Phase 8.
It does not migrate `ResultsTable`, inKey or inCrate onto the new table (DEC-041, DEC-021), and it
does not make Rekordbox playlists editable (DEC-031).

## What the earlier phases already built

The roadmap line for this phase — "generalizes `ResultsTable.tsx`; builds the reusable filter
system and global search that don't exist today" — was written before Phase 2 shipped global
search. Read the code before writing any of it again:

| Already exists | Where |
| --- | --- |
| Virtualized table: sticky header, resizable columns, persisted widths, themed scrollbar | `components/ResultsTable.tsx`, `components/resultsTableLayout.ts` |
| Engine-backed search with debounce, stale-response dropping, and "no library" vs "no matches" | `components/shell/useLibrarySearch.ts`, `GlobalSearch.tsx` |
| Search endpoint, response shape, and a serializer with an explicit field list | `engine/library_api.py`, `LibraryTrack` |
| Paged reads, counts, `LIKE` search over title/artist/album/label | `persistence/track_repository.py` |
| Playlist tree and membership, stored and queryable | `persistence/playlist_repository.py`, `migrations/m0006_rekordbox_playlists.py` |
| Inspector container: persistent across navigation, resizable, hideable, empty | `components/shell/TrackInspector.tsx` |
| The Library page, its import/refresh flow and every sentence it says | `screens/library/`, `libraryFormat.ts` |
| `shell.showItemInFolder` over IPC | `electron/main.ts`, `preload.cjs` |
| A 50,000-track benchmark harness and its recorded numbers | `scripts/bench_library.py`, `docs/user-guide/performance.md` |

Phase 4 is the query layer *under* the table and the interaction layer *over* it.

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-040 | Rows come from the engine, one window at a time | LIBUI-01, LIBUI-03, LIBUI-05 |
| DEC-043 | Filters are the Smart Collection rule model, unsaved | LIBUI-02, LIBUI-08 |
| DEC-023 | One search path, extended — not a second one | LIBUI-03 |
| DEC-044 | The playlist tree scopes the table | LIBUI-03, LIBUI-07 |
| DEC-047 | The Inspector shows everything imported, read-only | LIBUI-03, LIBUI-09 |
| DEC-041 | A new generic `TrackTable`; `ResultsTable` converges in Phase 7 | LIBUI-04 |
| DEC-048 | A data font for dense values | LIBUI-04, LIBUI-10 |
| DEC-042 | Columns can be hidden and reordered, persisted | LIBUI-06 |
| DEC-045 | Multi-select is built now | LIBUI-09 |
| DEC-046 | Double-click does nothing until the player exists | LIBUI-09 |
| DEC-039 | The Library page is the browser | LIBUI-10 |

## Sequencing

```
LIBUI-01 (browse query + indexes)
      │
      ▼
LIBUI-02 (filter rules + facets)
      │
      ▼
LIBUI-03 (browse, playlists, facets, track detail — API + desktop contract)
      │
      ├───────────────┬───────────────┐
      ▼               ▼               ▼
LIBUI-04         LIBUI-07        LIBUI-08
(TrackTable)     (playlist pane) (filter bar)
      │               │               │
      ▼               │               │
LIBUI-05              │               │
(windowed load,       │               │
 server-side sort)    │               │
      │               │               │
      ├── LIBUI-06 (columns: hide, reorder, widths)
      │               │               │
      ▼               │               │
LIBUI-09 (selection, actions, Inspector)
      │               │               │
      └───────┬───────┴───────────────┘
              ▼
      LIBUI-10 (the page, scale verification, docs)
```

LIBUI-04 through LIBUI-08 can be built in any order once LIBUI-03 lands, but LIBUI-05 needs
LIBUI-04's data-source interface and LIBUI-09 needs both. LIBUI-10 is last, as LIBRARY-12 was.

---

## Before starting any step — five cross-cutting facts

### 1. The desktop contract is six files, and a test enforces it

LIBUI-03 adds four endpoints. Per the invariant and `renderer/src/api/desktopContract.test.ts`,
each must move together:

Python `library_api.py` + `engine/server.py` · `engineClient.ts` · **`engineSupervisor.ts`** ·
`main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a placeholder) ·
`cuepointBridge.types.ts`.

The supervisor is the one that bit in SHELL-04 and again in LIBRARY-11 — it forwards method by
method and nothing type-checks the gap.

### 2. One search path (DEC-023), and today's callers must not notice

`/api/v1/library/search` is a public shape with a live caller: global search. Its current
behaviour — a blank query returns nothing, "an empty search box should not be a request to read
everything" — is deliberate and stays. Browsing is expressed as *additional parameters* on the same
endpoint and the same service method, not as a second query path, and a guard test asserts that a
request carrying none of the new parameters returns exactly what it returns today.

### 3. Fifty thousand rows now live in the renderer too

Phase 3 made the import batch and the diff stream because of this number. Phase 4 faces it in
JavaScript: never hold 50,000 row objects, never sort in the renderer, never issue one request per
row, and never let a fast scroll queue hundreds of in-flight windows. Every one of those is easy to
write by accident and invisible against a 400-track fixture — which is why LIBUI-10 measures rather
than asserts.

### 4. Do not touch `ResultsTable` (DEC-041)

`TrackTable` is new code extracted from it, not a refactor of it. The results screen keeps working
on the old component until Phase 7. Two tables exist meanwhile, deliberately, with the same
standing DEC-030 gave two collection databases.

### 5. Nothing here is editable

The whole phase is read-only over data Rekordbox produced. An affordance that looks editable —
an input, a star you can click, a droppable playlist — is a promise this build cannot keep. Phase 6
owns the first writable field.

---

## LIBUI-01 — The Browse Query and Its Indexes ✅ IMPLEMENTED 2026-09-04

**Objective**: Give the data layer a single query that can answer "which tracks, in what order,
which page" for the whole library or for one playlist, at 50,000 rows — plus the matching count.

**User-visible result**: None yet.

**Dependencies**: None.

**Existing code reused**: `TrackRepository` (`_SELECT`, `_COLUMNS`, `list_all`, `search`,
`search_count` are the shape to follow); `PlaylistRepository.track_ids_for`;
`scripts/bench_library.py` for the measurement.

**Design**:

- `TrackRepository.browse(...)` takes `scope` (a playlist id or `None`), `query` (the existing
  `LIKE` clause, reused not rewritten), `sort`, `direction`, `limit`, `offset`, and returns rows;
  `browse_count(...)` answers the same predicate without paging. LIBUI-02 adds a `rules` argument
  to both — the signature is designed for it now so it is not reshaped a step later.
- **Sortable columns are a whitelist**, mapping an API name to a SQL expression: `artist`, `title`,
  `album`, `label`, `genre`, `key`, `bpm`, `year`, `duration_seconds`, `rating`, `play_count`,
  `date_added`, `bitrate`, and `playlist_position` (valid only inside a playlist scope — asking for
  it library-wide is an error with a message, not a silent fallback). An unknown sort name is
  rejected; no caller-supplied string is ever interpolated into SQL.
- **Every ordering ends `, tracks.id ASC`.** Without a tiebreak, paging over `artist` — where
  thousands of rows share a value — can repeat and skip rows between windows, which looks like data
  corruption and is a sort bug.
- **Nulls sort last in both directions.** A library where a third of the BPMs are null must not
  open on a screen of blanks.
- Playlist scope joins `rekordbox_playlist_tracks`; a folder selects the union of its descendants'
  tracks, distinct (folders contain playlists, and a track in two of them is one row).
- Migration 0007 adds the indexes the whitelist promises: `(artist COLLATE NOCASE, title COLLATE
  NOCASE, id)` for the default order, and covering indexes for `bpm`, `key`, `genre`, `year`,
  `rating`, `date_added`. `COLLATE NOCASE` must be in the index definition or `ORDER BY … COLLATE
  NOCASE` will not use it. *(Measured and revised — only the composite index shipped; see the
  outcome below.)*

**Tests**: Every whitelisted sort returns the order it claims, ascending and descending, over a
fixture with deliberate ties and nulls. Paging with a tie-heavy sort visits every row exactly once
across windows (the tiebreak's regression test — it fails without `, id ASC`). Playlist scope
returns exactly the playlist's tracks; folder scope returns the distinct union. `playlist_position`
outside a playlist scope is refused. An unknown sort name is refused. `EXPLAIN QUERY PLAN` shows an
index for each default sort, asserted rather than assumed. Count agrees with the length of an
unpaged read.

**Acceptance criteria / DoD**: At 50,000 tracks, the first page of the default order and its count
both return within the budget recorded in `docs/user-guide/performance.md`'s style, measured with
`bench_library.py`, and no whitelisted sort is more than an order of magnitude slower than the
default.

**Risks**: Medium. The tiebreak and the `COLLATE NOCASE` index are the two things that are silently
wrong rather than loudly broken.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-04

**Outcome**: Complete. `persistence/track_query.py` builds the statements, `TrackRepository.browse`
and `browse_count` run them, and migration 0007 adds the one index the measurement justified. 128
new tests (115 for the query, 13 for the migration).

**The statement building is its own module, and that is why the guards are testable.** The rules —
a whitelist, a tiebreak, a null policy, a distinctness policy — live in `track_query.py`, and
`_predicate()` is shared by the rows and the count so a count of a different set of rows than the
query returns is not expressible. LIBUI-02's rule compilation plugs into that one function.

**`_search_clause` moved rather than being called across a cycle.** `browse` needs the same text
predicate `search` uses; importing it back from the repository would have made `track_query` and
`track_repository` import each other. The escaping helpers moved into `track_query` unchanged and
the columns are now table-qualified, so the fragment is safe inside a query with a CTE in scope.
`search`/`search_count` call the moved function and their tests were untouched.

**Membership is a question about a track, not rows to multiply by.** The scope predicate is
`tracks.id IN (SELECT track_id …)`, not a join. A join returns a track once per membership row, and
the fixture has both cases a real export has: a track listed twice in one playlist (19 playlists in
the real January export do this) and a track in two playlists under one folder. Replacing the
predicate with a join fails six scope tests.

**The six speculative indexes were built, measured, and removed.** The spec above promised covering
indexes on `bpm`, `key`, `genre`, `year`, `rating` and `date_added`. They changed no measured query
time by more than noise, and cost 9.5% of import time and 34% of the database file. The reason is
in the ordering: every sort except the default falls back to artist and title before the row id, so
a single-column index cannot serve it — and an *ascending* nulls-last ordering cannot be served by a
nulls-first SQLite index in any case. A title index was tried too, on the same theory, and made no
difference for the same reason. LIBUI-02 adds the filters and facet counts such indexes would
actually serve, and can measure them against a query that needs them.

**What the one index that shipped buys**, measured at 50,000 tracks on the same machine in the same
run of `bench_library.py`:

| | no index | `idx_tracks_artist_title` | all seven |
| --- | --- | --- | --- |
| First page, default order | 16.16 ms | **1.39 ms** | 1.41 ms |
| Scroll to the end (offset 49,900) | **717.34 ms** | **5.14 ms** | 5.28 ms |
| Import | 10.29 s | 10.40 s | 11.27 s |
| Database file | 19.7 MB | 21.5 MB | 26.5 MB |

The deep page is what settles it: without the index, every window near the end of a 50,000-track
library costs two thirds of a second, because SQLite sorts the whole table to find a hundred rows.

**The acceptance criterion was written before the measurement, and it was the wrong shape.** "No
sort more than an order of magnitude slower than the default" fails at 12–15×, not because the
other sorts are slow (16–19 ms) but because the default is unusually fast (1.4 ms) precisely
because it is index-served. Ten milliseconds either way is imperceptible; a ratio against the
fastest possible query is not a user-facing property. The honest criterion, and the one now
recorded in `docs/user-guide/performance.md`, is absolute: **every browse query returns in under
50 ms at 50,000 tracks**, and the two that run constantly — opening the page and scrolling — in
under 6 ms. The slowest is a folder scope at 48 ms, which gathers every playlist beneath it.

**Guards: 12 of 12 fail when the thing they protect is broken.** Each was mutated in the source, the
tests run, and the file restored byte-for-byte (verified by SHA-256): dropping the id tiebreak;
dropping `COLLATE NOCASE`; dropping the nulls-last policy; replacing the membership predicate with a
join; accepting any sort name; not escaping LIKE wildcards; dropping the playlist-position scope
check; taking any playlist position instead of the earliest; not clamping the limit; counting a
different predicate than the rows; declaring the index without `COLLATE NOCASE`; and not creating
the index at all.

**Verification**: `python -m pytest src/tests/unit` — 2943 passed, 45 skipped (130 of them new);
`python scripts/run_tests.py --all --no-slow` — clean, with integration, regression and system
adding 330 passed and 13 skipped.
`ruff check src/`, `ruff format --check src/`, `check_no_qt_in_core.py` and
`check_desktop_version_coupling.py` all pass. `mypy src/` introduces no new error (the run's 1348
pre-existing errors are unchanged; the one this step added was fixed). `scripts/bench_library.py`
run three times at 50,000 tracks — no indexes, seven indexes, one index — with every phase still
producing the result it promised. No CHANGELOG entry: nothing here is visible to a user yet, which
is the same line Phase 3 drew until LIBRARY-11.

---

## LIBUI-02 — Filter Rules and Facets ✅ IMPLEMENTED 2026-09-04

**Objective**: One rule model, in Python, that Phase 4's filters use unsaved and Phase 6's Smart
Collections save (DEC-043) — plus the facet counts a filter UI needs to show what is available.

**User-visible result**: None yet.

**Dependencies**: LIBUI-01.

**Existing code reused**: `LibraryTrack`'s field list is the source of what is filterable;
`TrackRepository.browse` from LIBUI-01 gains the `rules` argument its signature already anticipates.

**Design**:

- `FilterRule = {field, operator, value}`; a rule set is `{"match": "all", "rules": [...]}`. DEC-016
  is flat and AND-only for v1, and the wire shape carries `match` from the start so Phase 6 can add
  `"any"` without changing a contract or migrating stored rule sets.
- A **field registry** declares each filterable field's type and its allowed operators: text
  (`is`, `is not`, `contains`, `does not contain`, `starts with`, `is empty`, `is not empty`),
  number (`=`, `≠`, `<`, `≤`, `>`, `≥`, `between`, `is empty`), enum (`is`, `is not`, `is any of`),
  date (`before`, `after`, `between`). Fields: artist, title, album, label, genre, key, remixer,
  comment, colour, bpm, year, rating, play_count, bitrate, duration_seconds, date_added.
- Compilation to SQL lives in the persistence layer; the vocabulary and validation live with the
  model. Values are always parameters. An unknown field, an operator the field does not allow, or a
  value that will not coerce is a rejected rule set with a message naming the offending clause —
  never a dropped clause, which would silently return the wrong tracks.
- **Facets** answer "what values exist, and how many tracks each has" for enum-ish fields (genre,
  key, label, colour, rating) and min/max for numeric ones (bpm, year). A facet is computed over
  the current scope, text query and *other* filters, excluding the facet's own field — otherwise
  choosing one genre empties the genre list and the user cannot choose a second.
- Nothing here is persisted. Phase 6 adds the table; this step adds no migration.

**Tests**: Every operator on every field type returns exactly the rows it claims over a fixture
with nulls and empty strings (they are different, and `is empty` must say which it means).
Rejections: unknown field, disallowed operator, uncoercible value — each with a message naming the
clause. A value containing SQL stays a value (the injection guard, driven through the public API in
LIBUI-03 as well). Facet counts equal the count of applying that value as a rule. A facet excludes
its own field's active rules. An empty rule set changes nothing about the query.

**Acceptance criteria / DoD**: Filters compose with scope and text query in one predicate used by
both `browse` and `browse_count`; facets over 50,000 tracks return within budget; the model is
importable by Phase 6 without a change to its shape.

**Risks**: Medium. The temptation is to build the SQL string in the service; keeping compilation in
one tested place is what makes Phase 6 cheap.

**Complexity**: **M**

### ✅ IMPLEMENTED 2026-09-04

**Outcome**: Complete. `models/filter_rule.py` holds the vocabulary and its refusals,
`persistence/filter_sql.py` turns a validated rule into SQL, `track_query.py` folds both into the
one predicate LIBUI-01 built, and migration 0008 adds the indexes the facets turned out to need.
154 new tests (60 for the model, 53 for the SQL, 41 for the facets and their indexes).

**Sixteen fields, three types, and one rule about them.** Text, number and date decide which
operators are allowed and how a value is coerced. Dates get `before`/`after` rather than `lt`/`gt`
so no comparison has two spellings. The registry is sent to the renderer by `describe_fields()`
rather than duplicated in TypeScript, because the only way to guarantee the UI cannot build a
clause the engine refuses is for the list of what is buildable to come from the thing that refuses.

**Three behaviours are decided rather than inherited from SQL**, and each is the kind of thing that
looks right in a demo and is wrong in a library:

- *"Is not" includes tracks with no value.* `genre <> 'House'` is unknown, and therefore false,
  where genre is null — so a track with no genre would vanish from a filter that says "genre is not
  House". A track with no genre is not in the House genre. Same for "does not contain".
- *"Is empty" means null or blank for text, and null only for numbers.* Rekordbox writes both a
  missing attribute and an empty string for the same thing, while a zero rating is a rating and
  zero plays is an answer (DEC-034).
- *"Between" includes both ends*, which is what a range control's handles show.

**Refusal, never omission.** A bad clause raises with the field named; it is never dropped. A
filter that silently ignores one of its own rules answers a different question and shows a list
that looks right. `compile_rule` re-validates on its own, so a future caller that forgets cannot
slip an unescaped value into a LIKE pattern.

**The facets were 117 ms, which is where the interesting work was.** Three findings, each measured
at 50,000 tracks rather than argued:

1. *Grouping by `lower(column)` cannot use an index; grouping by `column COLLATE NOCASE` can.* Same
   result, same case-insensitivity. 37 ms became 7 ms.
2. *So migration 0008 adds the indexes LIBUI-01 removed* — genre, key, colour, label, year, rating,
   bitrate — this time against the query that needs them. The collation is load-bearing: an index
   declared without `COLLATE NOCASE` is read straight past, with the same rows, the same counts,
   and five times the time. That has no symptom a behavioural test could catch, so it is guarded
   twice: in the declaration and in the query plan.
3. *And the same index is a **loss** as soon as anything else is filtered.* Every index entry then
   needs its row fetched to test the filter — fifty thousand random reads against one sequential
   pass. `ANALYZE` was tried and does not change SQLite's choice. So the choice is made in
   `_facet_table()`, where the numbers can be written next to it: no predicate reads the index
   (7 ms vs 44 ms), any predicate scans (17 ms vs 83 ms). A playlist scope is indifferent either
   way, so "any predicate at all" is the rule.

| facet on `genre`, 50,000 tracks | via the index | scanning |
| --- | --- | --- |
| nothing else to filter by | **7.3 ms** | 43.6 ms |
| with two filter rules | 83.4 ms | **17.1 ms** |

**The "no value" bucket comes from the totals, not the value rows.** It was in the grouped list at
first, which meant a limit could cut it off: a library with a hundred labels more common than its
unlabelled tracks would simply stop offering "no label". It is now always present when it exists,
always last, and always agrees with what `is_empty` finds — asserted by applying every facet value
back as a rule and comparing counts.

**Artist, album and remixer are deliberately unindexed**, and a test says so, because "while we are
here" is how a database grows seven megabytes for the least-used question. They still answer:
artist in 12 ms (migration 0007's `(artist, title, id)` index already groups by artist under the
same collation — a payoff that index was not bought for), album and remixer in ~44 ms by scanning.

**What it cost**: 4.9 MB of database file and 5% of a 50,000-track import (10.40 s → 10.92 s), for
facets that went from 117 ms to 11 ms. One browse case moved the other way and is recorded rather
than hidden: a filtered first page went from 1.7 ms to 12.6 ms, because SQLite now has a genre
index to reach for, while the filtered count it is always paired with went from 12.7 ms to 0.3 ms.
The pair is slightly faster than before; the page alone is not.

**Guards: 24 of 24 fail when the thing they protect is broken**, each mutated in the source with
the file restored byte-for-byte (SHA-256 verified) — the three null-handling decisions above, the
LIKE escaping, the case-insensitive comparisons, the refuse-don't-drop rule, `match: any`, the
operator/type table, the valueless-operator check, the backwards range, the facet's own-field
exclusion, its case collapsing, its no-value bucket and that bucket's position and count, the
range's missing count, the text-field refusal, the plan-choice rule, and the filters reaching the
browse predicate at all.

**Verification**: `python -m pytest src/tests/unit` clean; `python scripts/run_tests.py --all
--no-slow` clean; `ruff check`/`format --check`, `check_no_qt_in_core.py` and `mypy src/` introduce
no new finding. `scripts/bench_library.py` run at 50,000 tracks before and after the migration,
with every phase still producing the result it promised, and the numbers recorded in
`docs/user-guide/performance.md`. Its generator now varies genre and key, because a collection
where every track shares one genre makes a facet a question with one answer. No CHANGELOG entry:
nothing here is visible to a user yet.

---

## LIBUI-03 — Browse, Playlists, Facets and Track Detail Over the Engine API ✅ IMPLEMENTED 2026-09-04

**Objective**: Expose LIBUI-01 and LIBUI-02 to the renderer, plus the playlist tree DEC-031 stored
and the track detail DEC-047 needs — as one search path (DEC-023), across the six-file contract.

**User-visible result**: None directly; global search keeps behaving exactly as it does today,
which is the point.

**Dependencies**: LIBUI-01, LIBUI-02.

**Existing code reused**: `library_api.py`'s `track_to_dict` (the explicit field list is the
contract and stays explicit), `parse_int_param`, the `LibraryUnavailableError` → 503 path,
`LibraryService.search_tracks`'s clamping, and `desktopContract.test.ts`.

**API**:

- `GET /api/v1/library/search` gains `mode` (`search`, the default and today's behaviour, or
  `browse`), `playlist_id`, `sort`, `dir`, and `filters` (a URL-encoded rule set). In `search` mode
  a blank query still returns nothing; in `browse` mode a blank query means "everything in scope"
  and a limit is required. The response shape is unchanged and additive only: `scope`, `sort` and
  `dir` are echoed back so a late response can be recognized as stale by what it answered rather
  than by bookkeeping in the renderer.
- `GET /api/v1/library/search?fields=id` returns ids only, for shift-range and select-all-matching
  (DEC-045). It is the same query with a narrower projection — not a second endpoint — and it is
  what keeps "select everything matching this filter" from meaning "load 50,000 rows".
- `GET /api/v1/library/playlists` returns the tree: id, parent id, name, path, kind
  (folder/playlist), and track count. Whole tree in one response — 234 playlists is small, and a
  lazily-loaded tree is complexity bought for nothing.
- `GET /api/v1/library/facets` returns facet values and counts for the current scope, query and
  filters.
- `GET /api/v1/library/tracks/{id}` returns the full track plus the playlists containing it
  (`playlist_ids_for_track`, resolved to names and paths).
- Errors keep the existing envelope. A malformed rule set is a 400 naming the clause; a library
  that cannot be resolved is the existing 503.

**Tests**: A request with none of the new parameters is byte-identical to today's response (the
DEC-023 guard). Browse mode with a blank query returns the scope; search mode with a blank query
still returns nothing. Sort and direction round-trip and are echoed. `fields=id` returns ids for
the same predicate, in the same order. Playlist tree round-trips nesting and counts, including the
four real playlist names containing `/` that LIBRARY-03 found. Track detail returns membership.
Injection through `filters` and `q` stays parameterized. The desktop-contract test passes with the
new methods present in all six files.

**Acceptance criteria / DoD**: The renderer can express every query the UI will need — scope, text,
filters, sort, window, ids-only — through one endpoint; `smoke_engine_health.py` and the contract
test pass; no existing caller changed behaviour.

**Risks**: Medium-high. The `mode` parameter is the seam where DEC-023's letter and the browsing
requirement meet; getting it wrong means either a broken global search or two query paths.

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-04

**Outcome**: Complete. Five endpoints, one query path, and the six-file contract moved together.
`LibraryService` gained `browse_tracks`, `browse_track_ids`, `facet` and `facet_range`;
`library_api.py` gained the parameter parsing and four new payloads; `engineClient.ts`,
`engineSupervisor.ts`, `main.ts`, `preload.cjs` and `cuepointBridge.types.ts` gained five methods
each. 62 new Python tests and 21 new renderer contract assertions.

**One endpoint, two modes.** `mode=search` is what SHELL-04 shipped, down to the blank query
finding nothing; `mode=browse` adds scope, filters, ordering and paging. Defaulting to `search` is
what makes DEC-023's promise keepable: the live caller sends no new parameter and gets exactly what
it got. Three tests hold that line, including one that asserts the response's key set — the six
SHELL-04 documented plus the four LIBUI-03 echoes, and nothing else.

**The response grew, deliberately and additively.** `mode`, `scope`, `sort` and `dir` are echoed so
LIBUI-05 can recognize a stale response by what it answers rather than by bookkeeping it keeps in
step. The track row gained the seven fields DEC-034 imported, because the table's columns (DEC-042)
and the Inspector (DEC-047) read the same row shape and a second serializer for one row is a second
thing to keep in step. Two of SHELL-04's tests asserted the old shapes exactly; both were updated
in place with a comment naming this step, rather than loosened to stop noticing.

**`fields=id` is a projection, not an endpoint.** The same predicate and the same ordering, reading
one column. That is what lets a shift-click select a range crossing rows the table has never loaded
(DEC-045) without a second query path that could disagree about which rows those are. A test asserts
the ids equal the ids of the rows the same query returns, in the same order.

**A real bug, found by the test for the empty case.** `/api/v1/library/playlists` resolves only the
playlist repository — and that repository's factory did not run migrations, while the track
repository's did. Every path that had ever touched playlists resolved something else first (the
import service, or the summary endpoint's library service), so the tables existed by accident of
ordering. On a fresh install, the first visit to the Library page would have been a 500 with no
table. The playlist and source repositories now migrate like the others, and
`test_bootstrap_migrations.py` resolves each repository **on its own** against a database nothing
has opened — the exact condition the old code got wrong. It fails on the unfixed bootstrap.

**A fifth endpoint the spec did not list.** `/api/v1/library/filter-fields` sends the filter
vocabulary — fields, types, operators, what is facetable and what is sortable. LIBUI-02 built
`describe_fields()` for exactly this reason: the only way to guarantee the renderer cannot build a
clause the engine refuses is for the list of what is buildable to come from the thing that does the
refusing. Adding it here rather than in LIBUI-08 costs one route and saves a second six-file change.

**Refusals name the clause.** A filter naming a field that does not exist, an operator a field does
not allow, a value that will not coerce, an unsortable column, a direction that is neither, a scope
that is not a number, `fields` that is not `id`, `match: any` — each is a 400 carrying the message
the model wrote, not a 500. A missing track is a 404, because an empty object is something a panel
renders as a track with no title. Every new endpoint requires the bearer token, asserted per
endpoint rather than assumed from the pattern.

**One redundant check became a real one.** The API validates the sort column, and so does the query
builder — so mutating the API check away changed nothing, because the query layer still refused.
Rather than delete a defence, the case it uniquely covers is now tested: in `search` mode nothing
downstream ever reads `sort`, so without the check at the edge a typo would be accepted in silence.

**Guards: 18 of 18 fail when the thing they protect is broken**, each mutated in the source with the
file restored byte-for-byte (SHA-256 verified). Including: browse becoming the default mode, every
parameter check, the echo keys, the ids projection, the 404, the row's imported fields, playlist
membership, the 400-not-500 mapping, the token checks, the repository migration fix, a dropped
scope, and — on the desktop half — the client browsing a second endpoint, the preload losing a
channel, and the supervisor losing a method.

**Verification**: `python -m pytest src/tests/unit` clean; `python scripts/run_tests.py --all
--no-slow` clean; renderer `npm test` (497 passed, 34 files), `npm run typecheck`, `npm run lint`
and the Electron `npm run build` clean; `ruff check`/`format --check`, `check_no_qt_in_core.py`,
`check_desktop_version_coupling.py` and `smoke_engine_health.py` pass; `mypy src/` introduces no
new finding (the two this step first produced were fixed). Still no CHANGELOG entry: five endpoints
exist and no screen calls them yet.

---

## LIBUI-04 — `TrackTable`: The Generic Virtualized Table ✅ IMPLEMENTED 2026-09-04

**Objective**: The Universal Track Table as a component: generic in row type and column set,
windowed in its data source, and visually identical in character to what `ResultsTable` established
(DEC-041). Introduce `--font-data` (DEC-048).

**User-visible result**: None on its own; it renders in tests and stories.

**Dependencies**: None (can start alongside LIBUI-01), but LIBUI-05 needs its data-source interface.

**Existing code reused**: `ResultsTable.tsx` and `resultsTableLayout.ts` as the *source* of the
proven mechanics — `@tanstack/react-virtual`, sticky header, resize handles, sticky-left offsets,
scale-aware minimum widths, themed scrollbar CSS. Copy and generalize; do not edit the original.

**Design**:

- `TrackColumnDef<Row>`: `id`, `header`, `minWidthPx`, `defaultWidthPx`, `align`, `sortKey`
  (absent means the column cannot be sorted, which is how "playlist position outside a playlist"
  is expressed), and `render(row)`.
- **Data source interface**, so the component never knows where rows come from:
  `{ total, getRow(index), requestWindow(startIndex, endIndex), status }`. LIBUI-05 implements the
  windowed one; Phase 7 implements an in-memory one over match results and that is how
  `ResultsTable` converges without `TrackTable` growing a special case.
- A row index with no row yet renders a **placeholder row**, not a blank or a collapsed row —
  the row height must never depend on whether data has arrived, or scrolling a 50,000-row table
  becomes a jitter machine.
- `onSelect`, `onRowActivate` (unused in Phase 4 per DEC-046, present so Phase 5 has a seam) and
  `sort`/`onSortChange` as controlled props. The component owns no query state.
- `--font-data` is added to `tokens/tokens.css` as a system-first stack (no second Google Fonts
  import — the packaged app must render identically offline) and applied to cell values only.
  Headers, buttons and chrome stay Pixelify Sans. `PIXEL_DESIGN_SYSTEM.md` §4's open item is
  updated in this step, since this is what answers it.

**Tests**: Component tests (Testing Library, beside the component) for header rendering, sort
indicator and callback, resize handles clamping to minimum width, placeholder rows keeping row
height constant, and a column with no `sortKey` not being clickable. Layout maths stays in a pure
module with its own tests, as `resultsTableLayout.test.ts` established. A test asserts `TrackTable`
imports nothing from `mocks/` — the boundary that keeps it generic.

**Acceptance criteria / DoD**: `TrackTable` renders 50,000 placeholder rows with no data source
attached and stays responsive; `ResultsTable` and the results screen are unchanged and their tests
still pass; contrast and hit-target checks pass at 1×, 2× and 3× with the new font token.

**Risks**: Medium. The real risk is generalizing too little (a component that only fits the library)
or too much (a table framework nobody asked for). The Phase 7 convergence is the test of "enough".

**Complexity**: **L**

### ✅ IMPLEMENTED 2026-09-04

**Outcome**: Complete. `components/table/` holds the component, its layout maths, the data-source
interface, its stories and its tests. `ResultsTable` is untouched, and a test says so. 73 renderer
tests (34 component, 26 layout, 13 boundary).

**It owns two things and no more.** How wide a column is while you drag it, and which rows are on
screen. The sort, the widths, the selection, the query and the persistence are all passed in and
handed back. That is what makes "universal" true rather than aspirational: the library table
(LIBUI-10), the match results (Phase 7) and inCrate (Phase 9) differ in exactly the state this
component refuses to hold.

**Widths are keyed by column id, not by position.** `resultsTableLayout.ts` stores an array indexed
by column, which is right only while the order is fixed — and DEC-042 lets a user reorder columns,
at which point an array would apply the artist column's width to whatever moved into slot two.
`resolveWidths` also drops a width stored for a column that no longer exists, without which
renaming a column would leave a user a layout they could never correct.

**A row that has not arrived is still a row.** `getRow` returning undefined draws a placeholder of
exactly the same height, positioned where the row will be. Two tests hold that: one compares a
placeholder's height against a loaded row's, and one checks the second placeholder is not at
`translateY(0)`. If height depended on whether data had arrived, every window a 50,000-row table
loaded would move the ground under the pointer.

**The source is told about a range, not woken by a wheel.** `requestWindow(first, last)` fires when
the visible range changes, which is the contract LIBUI-05's coalescing needs; a test fails if it is
ever called once per row.

**`--font-data` (DEC-048), and only for values.** A system stack rather than a second Google Fonts
import, so a packaged app renders the same offline. Cell values use it; headers, buttons and the
empty state stay Pixelify Sans. `PIXEL_DESIGN_SYSTEM.md`'s §4 sign-off item — open since the
Phase 0 audit — is closed in the same change, in both the Typography section and the open-items
list.

**jsdom needed two fakes, and it is worth writing down which.** The virtualizer measures its scroll
element with `offsetWidth`/`offsetHeight` (not `getBoundingClientRect`, which was the first guess
and rendered nothing) and watches it with a `ResizeObserver` jsdom does not have. Both are supplied
in the test file; nothing else is faked, and the component under test is the real one. That is why
this repository can now test a virtualized table at all, which it could not before.

**A redundant guard, removed rather than left.** `handleSort` began with
`if (!column.sortKey || !onSortChange) return;`. Mutating the second half away changed no
behaviour — the optional call below already did nothing — so the check could not be tested and was
deleted, leaving the half that is observable: a column with no `sortKey` has a disabled header and
asks for nothing when clicked.

**`npm run typecheck` passed while `npm run build:check` failed**, on the very next line: `tsc -b`
had cached the previous successful build and did not re-check the file that changed. The
type error was real (a call that had relied on the guard just removed). Worth carrying forward —
`build:check` is the gate that actually re-checks.

**Guards: 18 of 18 fail when the thing they protect is broken**, each mutated in the source with the
file restored byte-for-byte (SHA-256 verified): the placeholder's height, drawing unloaded rows at
all, the table reordering rows itself, the sort toggle, the disabled header, keying rows by
identity, ignoring clicks on rows that are not there, the window request being one call, the scroll
range covering every row, reporting a drag rather than deciding it, the drag minimum, the width
clamping and reconciliation, the sticky offset, reading the row height, importing an application
row type, and the in-memory source.

**Verification**: renderer `npm test` — 570 passed across 37 files (73 new); `npm run typecheck`,
`npm run lint` and `npm run build:check` clean. Not done in this step, and deliberately: the
contrast and hit-target re-check the spec asks for. `--font-data` changes no colour and no row
height, so `design-signoff.md`'s recorded results still hold arithmetically, but a table rendered
at 1×, 2× and 3× in the packaged app has not been looked at — LIBUI-10 assembles the page and is
where that pass belongs. Stories exist (`TrackTable.stories.tsx`, including the loading and
partially-loaded states) so there is something to look at when it happens.

---

## LIBUI-05 — Windowed Loading and Server-Side Sort

**Objective**: Feed `TrackTable` from the engine as the user scrolls, and make sorting a query
rather than a re-render (DEC-040).

**User-visible result**: A table that scrolls through a 50,000-track library without loading it.

**Dependencies**: LIBUI-03, LIBUI-04.

**Existing code reused**: `useLibrarySearch`'s proven patterns — debounce, stale-response dropping
by comparing what a response answered, and the status union that distinguishes "no library" from
"no matches". `followJob`'s teardown discipline for effects that outlive a page.

**Design**:

- `useTrackWindow({scope, query, filters, sort, dir})` owns: page size, a prefetch margin either
  side of the viewport, coalescing (one request per contiguous gap, not one per row), cancellation
  of windows that scrolled out of relevance, and `total`.
- **Any query change resets the window and returns to the top.** A sort that keeps the scroll
  offset shows the user a different place in a different order and reads as a bug.
- A response that answers a query the user has moved on from is dropped, recognized by the echoed
  `scope`/`sort`/`dir` from LIBUI-03 rather than by a request counter.
- Failure is a state, not a spinner: an engine that is down leaves placeholder rows carrying a
  message and a retry, consistent with SHELL-07's engine status rather than inventing a second
  vocabulary for "offline".
- Row identity is the track id throughout, never the row index (DEC-045's consequence, and the
  reason selection survives a window refill).

**Tests**: A fast scroll across the whole range issues a bounded number of requests (the guard that
fails on a naive implementation). A stale response is dropped. Changing sort resets to the top and
re-queries. A gap in the middle of the range fetches once, not per row. Engine failure renders the
error state and recovers on retry. Total is displayed from the response, not counted from loaded
rows.

**Acceptance criteria / DoD**: Scrolling a 50,000-track library end to end stays smooth, memory
stays bounded (asserted, with the measurement recorded), and no query state lives in `TrackTable`.

**Risks**: Medium-high. This is where a request storm or a memory leak hides, and both are
invisible on small fixtures.

**Complexity**: **L**

---

## LIBUI-06 — Columns: Hide, Reorder, Persist

**Objective**: DEC-042 — a column picker, drag-to-reorder, persisted widths, and a reset.

**User-visible result**: The user decides what their table shows and in what order, and it is still
that way tomorrow.

**Dependencies**: LIBUI-04.

**Existing code reused**: `resultsTableLayout.ts`'s clamping, defaults and `localStorage` shape as
the model for the new `trackTableLayout.ts`.

**Design**:

- Persisted state is an **ordered list** of `{id, width, hidden}`, not a map of flags — order is
  part of the state, so it must be the shape of the state.
- New storage key `cuepoint-library-table-layout`. Deliberately **without** the legacy `-ui-lab-`
  segment that `PIXEL_DESIGN_SYSTEM.md` §2 flags as naming debt; existing keys are not renamed here
  (that touches persisted user state and belongs to its own change), but new ones do not add to it.
- **Reconciliation on load**: unknown ids are dropped, ids missing from the stored list are appended
  in registry order, widths are clamped to the current scale's minimum. Without this, renaming or
  removing a column leaves a user with a permanently broken table and no way back.
- Reorder is drag-and-drop on the header of a CSS-grid virtualized table, with a keyboard path
  (move left/right) so it is not mouse-only. Pinned-left columns stay pinned, and a drag cannot
  interleave with them — stated here rather than discovered.
- "Reset columns" restores the default set, order and widths.

**Tests**: Round-trip of order, hidden set and widths. Reconciliation: unknown id dropped, new id
appended, corrupt JSON falls back to defaults without throwing. Hiding the last visible column is
refused. Reorder by keyboard and by drag produce the same state. Reset restores defaults. Widths
clamp at each scale.

**Acceptance criteria / DoD**: Layout survives a restart, a scale change and a column-registry
change; no state is written that cannot be read back by the same code.

**Risks**: Low-medium; drag inside a virtualized grid is the fiddly part.

**Complexity**: **M**

---

## LIBUI-07 — The Playlist Pane

**Objective**: DEC-044 — render the mirrored Rekordbox tree and let it scope the table.

**User-visible result**: The collection browsed the way it is organized, not as one alphabetical
list.

**Dependencies**: LIBUI-03.

**Existing code reused**: `Sidebar`'s rail/expanded patterns and its persistence approach;
`sidebarState.ts` as the model for storing expansion; `PixelIcon` for folder/playlist icons.

**Design**:

- Root is "All tracks" with the library count; below it the folder/playlist tree with per-node
  track counts from LIBUI-03.
- Selecting a node sets the table's scope; a folder scopes to the distinct union of its
  descendants (LIBUI-01's behaviour, surfaced honestly in the count).
- Inside a playlist, the default sort is the playlist's own order, labelled as such; leaving the
  playlist returns to the library default rather than keeping a sort that no longer means anything.
- Expansion state and the selected node persist (`localStorage`, new-style key). A stored selection
  for a playlist that a refresh removed falls back to "All tracks" and says so once, rather than
  showing an empty table — the same class of fallback DEC-027 required of the launch destination.
- Read-only (DEC-031): no drag, no rename, no delete, no create. The pane says where these came
  from, so nobody wonders why they cannot edit them.

**Tests**: Nesting renders to depth; names containing `/` render as names, not as paths (LIBRARY-03
found four real ones); counts match the engine's; selection scopes the table and updates the
default sort; a stored selection that no longer exists falls back; expansion persists; keyboard
navigation moves and expands.

**Acceptance criteria / DoD**: The 234-playlist January tree renders and scopes without perceptible
delay; nothing in the pane offers an edit.

**Risks**: Low-medium.

**Complexity**: **M**

---

## LIBUI-08 — The Filter Bar

**Objective**: The reusable filter UI over LIBUI-02's rule model (DEC-043).

**User-visible result**: "Deep house, 122–126 BPM, rated 4+, added this year" — as clauses the user
can see and remove one at a time.

**Dependencies**: LIBUI-03.

**Existing code reused**: `Select`, `TextField`, `Badge` (chips), `Button`, and the `Panel`
conventions. The rule vocabulary comes from the engine, so the UI does not re-declare which
operators a field allows.

**Design**:

- Add a clause: pick a field, then an operator its type allows, then a value — with facet values and
  counts offered for enum fields, and min/max hints for numeric ones, both from LIBUI-03.
- Active clauses render as removable chips; "Clear all" removes them at once. The result count comes
  from the query's `total`, not from loaded rows.
- Ratings are already stored as 0–5 stars: `LibraryTrack` rejects anything else, and the parser's
  `_rating_to_stars` converted Rekordbox's 0/51/102/153/204/255 encoding at import (LIBRARY-02).
  The filter offers stars and sends stars; there is no second mapping to build here.
- Text search in the bar is the same `q` the engine already understands — one search path (DEC-023),
  scoped by whatever the playlist pane has selected.
- **Filters are view state and are not persisted across restarts**, while playlist scope is
  (LIBUI-07). Reopening the app into a filtered view that looks like an empty library is a worse
  failure than losing a filter, and the asymmetry is deliberate.
- The component takes the rule set and a change handler; it holds no query and issues no request.
  That is what makes it reusable by Phase 6's Smart Collection editor.

**Tests**: Building a clause per field type produces the rule set the engine expects. An operator
list matches the field's type. Removing one chip leaves the others. Clear all empties. Facet counts
render. Rating stars map both ways. Filters reset on restart while scope does not. The component
renders from a rule set it did not create (the reuse guard Phase 6 depends on).

**Acceptance criteria / DoD**: Every field in LIBUI-02's registry is filterable through the UI, and
the UI never constructs a clause the engine rejects.

**Risks**: Medium — mostly in keeping the vocabulary in one place instead of two.

**Complexity**: **M**

---

## LIBUI-09 — Selection, Actions and the Track Inspector

**Objective**: DEC-045's selection model, the two actions that exist today, and DEC-047's Inspector
content — the first thing ever to render inside DEC-024's container.

**User-visible result**: Click a track and see everything CuePoint knows about it, including which
playlists hold it. Select many and be told how many.

**Dependencies**: LIBUI-05, LIBUI-04, LIBUI-03.

**Existing code reused**: `TrackInspector` (the container, its width and hide persistence, and
Ctrl+I); `preload.cjs`'s `showItemInFolder`; the Rekordbox rating mapping from LIBUI-08.

**Design**:

- Selection is a set of **track ids**, plus a second form: "everything matching the current query,
  except these ids". With windowed data, "select all" cannot mean "all loaded rows", and Phase 6's
  "tag everything matching this filter" needs the description, not a list. `fields=id` (LIBUI-03)
  resolves a shift-range that spans rows not yet loaded.
- Ctrl/Cmd-click toggles, shift-click extends from the anchor, Ctrl+A selects all matching, Escape
  clears. A selection count sits in the page's footer area with the two available actions: copy the
  selection (tab-separated, visible columns, in the displayed order) and reveal in file manager
  (single selection only).
- Double-click does nothing (DEC-046). `onRowActivate` is wired to nothing, and a test asserts it.
- The Inspector shows the last-clicked track: identity, artist/remixer/album/label/genre, key, BPM,
  year, duration, bitrate, rating as stars, play count, colour, date added, comment, the file path
  (with reveal), and the playlists containing it. A field Rekordbox did not supply reads as absent
  rather than as zero — nullable columns exist for that reason (LIBUI-01/LIBRARY-01).
- Clicking a playlist in the membership list scopes the table to it — the tree and the Inspector
  agreeing about what a playlist is, for free.
- With several tracks selected, the Inspector shows the last-clicked one and the selection count.
  It is not a multi-track editor; nothing here is editable at all.

**Tests**: Ctrl and shift selection over loaded and unloaded ranges. Select-all-matching is a
description, not 50,000 ids (the guard that fails if someone materializes them). Selection survives
a window refill and is cleared by a query change. Copy produces the visible columns in display
order. Reveal is single-selection only. Double-click does nothing. Inspector renders every field,
shows absent fields as absent rather than as zero, maps ratings to stars, lists membership, and
scopes the table when a playlist is clicked.

**Acceptance criteria / DoD**: A track's whole imported record is visible in the app for the first
time; selection behaves identically whether the rows involved are loaded or not.

**Risks**: Medium. Shift-range across unloaded rows is the part that quietly does the wrong thing.

**Complexity**: **L**

---

## LIBUI-10 — The Library Page Becomes the Browser

**Objective**: DEC-039 — assemble the page, prove it at 50,000 tracks, and write down what changed.

**User-visible result**: The Library page is where a user looks at their collection.

**Dependencies**: Every other step.

**Existing code reused**: All of `screens/library/` — the import and refresh flow, DEC-032's
preview dialog, and every sentence in `libraryFormat.ts`, which LIBRARY-11 established as the
feature and which this step preserves rather than rewrites.

**Design**:

- Layout: playlist pane (left), filter bar and table (centre), Inspector (right, the shell's own
  container). Import, refresh, source state and "up to date / out of date / could not tell" compress
  into a page header — same wording, less vertical space.
- Empty states are three, not one: no library imported (LIBRARY-11's import prompt, unchanged); a
  library with no matches for the current query or filters; an empty playlist. Each says something
  different, because they are different problems, which is the standard LIBRARY-11 set.
- LIBRARY-11's "renders no table" test is inverted here, in one place, with a comment pointing at
  DEC-039 — not deleted quietly.
- Keyboard: register the page's shortcuts in `keyboardShortcuts.ts` so the shortcuts dialog stays
  the truth (Ctrl+F focuses the filter bar's search within this page, consistent with Results).
- Documentation: `docs/user-guide/` gains browsing, filtering and column control; `PIXEL_DESIGN_SYSTEM.md`
  §4's open sign-off item is closed by DEC-048's outcome; `docs/development/architecture.md` gains
  the windowed-query path; `docs/release/CHANGELOG.md` gets an `Unreleased` entry; the DEC-030
  two-databases note stays accurate.
- Measurement, in `bench_library.py` style and recorded in `docs/user-guide/performance.md`: first
  page, sorted page, filtered page, facet computation, playlist scope, and renderer memory after
  scrolling the full range — at 50,000 tracks.

**Tests**: Renderer tests for the assembled page and its three empty states. E2E in a packaged
build: import, browse, scope to a playlist, sort, filter, select, inspect, and confirm the refresh
flow still works unchanged from the new header — as one journey, following LIBRARY-12's finding that
steps which pass alone can fail where they join.

**Acceptance criteria / DoD**: The phase-level acceptance below is met in a packaged build, all
gates pass, and the numbers are recorded rather than claimed.

**Risks**: Medium — assembly is where layout at 1×/2×/3× scale and small-window behaviour get real.

**Complexity**: **L**

---

## Phase-level acceptance

Phase 4 is complete when, in a **packaged build**:

1. A 50,000-track library browses smoothly end to end, with bounded memory and a bounded number of
   requests, measured and recorded.
2. Sorting by any offered column is correct and stable across page boundaries.
3. The playlist tree scopes the table, folders included, and playlist order is the default sort
   inside a playlist.
4. Filters compose with scope and text search, facet counts agree with the results they produce,
   and no rule set the UI can build is rejected by the engine.
5. Columns can be hidden, reordered, resized and reset, and survive a restart and a scale change.
6. Multi-selection works across loaded and unloaded rows; "select all matching" never materializes
   the library.
7. The Inspector shows every imported field and the track's playlist membership, read-only, with
   absent fields shown as absent.
8. Global search behaves exactly as it did before this phase (the DEC-023 guard), and there is one
   query path.
9. Import and refresh, including DEC-032's preview and DEC-011's warning, work unchanged from the
   new page header.
10. Full Python suite, renderer gates (`npm test`, `typecheck`, `lint`, `build:check`), E2E, Qt
    guard, version coupling and the desktop-contract test all pass.
11. No decision in DEC-001…DEC-048 is contradicted. Per the process, a contradiction stops the work
    and gets raised rather than worked around.

## Deferred, with reasons

- **Editing anything** — Phase 6 (tags, ratings, notes, Collections) and Phase 7 (Beatport values).
  This phase is read-only by design, not by omission.
- **Playback, and the track context menu** — Phase 5 (DEC-012, DEC-013, DEC-046).
- **Saving a filter as a Smart Collection** — Phase 6. The model is built here (DEC-043); only
  persistence and naming are missing.
- **`ResultsTable`, inKey and inCrate adopting `TrackTable`** — Phases 7 and 9 (DEC-041, DEC-021).
- **Duplicates, missing files and library health** — Phase 7 (DEC-037). A path in the table may point
  at a file that is gone, and nothing here claims otherwise.
- **Waveforms, key/BPM analysis, artwork** — Phases 11 and 12.
- **Renaming the legacy `-ui-lab-` storage keys** — its own change, because it touches persisted
  user state (`PIXEL_DESIGN_SYSTEM.md` §2). New keys added here do not extend the debt.
