# CuePoint v1.0.0 — Phase 9: Discover, Detailed Step Specifications

Status: **Specified. No step implemented.** The twelve steps below replace the roadmap's placeholder
inventory (DISCOVER-01…DISCOVER-09, which Round 11's answers came in three over).
Per the process, no implementation happens from this document — each step needs an explicit
"Implement DISCOVER-NN" instruction, scoped to exactly that step, and its outcome is recorded under
the step afterwards. There are no open points; the one precision writing it found — where a Beatport
artist or label id actually comes from — is recorded in DEC-095.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`), Phase 3
(`PHASE3_LIBRARY.md`), Phase 4 (`PHASE4_LIBUI.md`), Phase 6 (`PHASE6_ORG.md`), Phase 7
(`PHASE7_CLEAN.md`) and Phase 8 (`PHASE8_EXPORT.md`), all implemented, and on Phase 5
(`PHASE5_PLAYER.md`), all steps implemented. Decision Rounds 1–11 apply (`DECISIONS.md`,
DEC-001…DEC-101). Phase 9's own decisions are DEC-090…DEC-101, alongside DEC-021 (inCrate re-homes
into Discover), DEC-030 (its inventory retires), DEC-036 (it moves onto the library), DEC-041 (its
lists adopt `TrackTable`), DEC-043 and DEC-060 (one rule model), DEC-063 (a scope is resolved once, at
start), DEC-066 and DEC-067 (what an accepted match is) and DEC-074 (name the signal that grouped
something). Round 11 amended DEC-020 and DEC-027 through DEC-100.

## What this phase is

inCrate has been the one part of CuePoint that looks outward for music a user does not have. It works:
it finds charts curated by artists in the collection and new releases from labels in it. But it was
built before the library existed, so it reads its own copy of the collection, fills missing labels
with its own copy of the matcher, runs inside one blocking request, keeps nothing it found, and cannot
tell a track the user already owns from one they do not.

This phase moves that capability onto everything the earlier phases built. Discovery reads the
library's own effective values (DEC-090), runs as a job whose runs are kept (DEC-091), knows what is
owned through Clean's accepted matches (DEC-092), and gives a found track somewhere to go — a wantlist
in CuePoint, or a playlist on Beatport (DEC-093, DEC-099). It then adds the three things the roadmap
asked for that do not exist at all: an Artist page, a Label page (DEC-094, DEC-095) and Similar Tracks
(DEC-096).

**What this phase is not.** It does not play previews (DEC-097) or touch the player. It does not
change how the Beatport token is entered or stored (DEC-098). It does not build "For You" (DEC-101). It
does not write audio files, Rekordbox XML or anything outside the database, except the Beatport
playlist the user explicitly pushes to. It does not change the matcher, the scraping search Clean
uses, or the CLI. It does not add Beatport tracks to the library, a Collection or an export: a track a
user does not own has no `tracks` row, and nothing here invents one.

## What the earlier phases already built

Read this table before writing any of it again.

| Already exists | Where |
| --- | --- |
| A v4 API client with bearer token, timeout and typed errors | `services/beatport_api_client.py::BeatportApiClient` |
| Genres, charts, chart detail, label releases, label search, playlist create/add | `services/beatport_api.py::BeatportApi` |
| The discovery algorithm: charts by library artists, releases by library labels, de-duplicated | `incrate/discovery.py::run_discovery` |
| Default playlist naming | `incrate/playlist_name.py` |
| Token entry, masking and test | `engine/config_api.py`, Settings |
| Accepted matches, their candidate and its Beatport track id and page | `track_match`, `match_candidates` (migration 0011) |
| The URL-id fallback for a candidate with no parsed id | the Beatport duplicate signal, `services/duplicate_service.py` (CLEAN-08) |
| Effective values in SQL, and the rule vocabulary with `EXISTS` membership fields | `models/filter_rule.py` (`FIELDS`, `_effective`, the `tag` and `collection` fields) |
| One windowed browse query with count and facets | `persistence/track_query.py`, `/api/v1/library/search` |
| A generic, windowed, virtualized table | `renderer/src/components/table/TrackTable.tsx` |
| Jobs: lifecycle, cancel, persistence, exclusivity, conflicts | `engine/jobs.py::create_job` |
| Activity events | `activity_events`, `engine/activity_api.py` |
| Key parsing into pitch class and mode, every notation the library holds | `services/override_values.py::parse_key` |
| Accent stripping; the matcher's artist split | `core/text_processing.py::_strip_accents`, `split_artists` |
| Retired destinations that redirect rather than 404 | `navRegistry.ts::RETIRED_DESTINATIONS` (CLEAN-14) |
| One operations list for the context menu and the Actions button | `SelectionActions.tsx` (ORG-11, CLEAN-13) |
| Inspector zones | `TrackDetailPanel.tsx` (ORG-10, CLEAN-13) |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-090 | Discovery reads effective library values; inventory and enrichment are retired. |
| DEC-091 | A cancellable discovery job; every run stored with its parameters, outcome and sources. |
| DEC-092 | Owned = an accepted match's Beatport track id; hidden by default, counted, computed on read. |
| DEC-093 | A wantlist of Beatport tracks: add, remove, note, mark bought; owned derived. |
| DEC-094 | Artist and Label pages: the library half through the one browse query, the Beatport half cached. |
| DEC-095 | Beatport id when resolved, otherwise a normalized name, and the page says which. |
| DEC-096 | A deterministic, explained similarity engine in `core/`, offline, reusable by Phase 10. |
| DEC-097 | No previews; the player is untouched. |
| DEC-098 | Token handling unchanged; a rejected token is an explained empty state. |
| DEC-099 | Beatport playlists through the API only, as a job, with the real URL; the browser fallback goes. |
| DEC-100 | Tools and its landing page retire; Library is home; `incrate` and `tools` redirect. |
| DEC-101 | No For You surface. |

## Sequencing

DISCOVER-01 goes first because everything Beatport-facing in this phase depends on response shapes
nobody has pinned down: the existing parsers try four guessed nestings, and they drop exactly the ids
this phase needs. It is verified against the real API before anything is built on it. DISCOVER-02
lands the schema in one forward-only migration. DISCOVER-03 and DISCOVER-04 are the two primitives
every later step reads — what an artist or label *is* in the library, and what the library *owns* on
Beatport. DISCOVER-05 to DISCOVER-08 are the four services: discovery, the wantlist and playlist push,
the pages and similarity. DISCOVER-09 puts them on the wire. DISCOVER-10 and DISCOVER-11 draw them.
DISCOVER-12 retires inCrate and Tools and closes the phase.

**inCrate keeps working until DISCOVER-12.** The new code is written beside it, not over it — the
coexist-then-converge pattern of DEC-030, DEC-036 and DEC-041 — so every intermediate build has a
working discovery screen. The one shared file, `services/beatport_api.py`, is only extended in
DISCOVER-01, never changed in a way inCrate would notice.

## Before starting any step — seven cross-cutting facts

### 1. The desktop contract is six files

Every new endpoint moves through `engine/*_api.py` + `server.py` · `engineClient.ts` ·
**`engineSupervisor.ts`** · `main.ts` · `preload.cjs` (the runtime preload; `preload.ts` is still a
placeholder) · `cuepointBridge.types.ts`, gated by `desktopContract.test.ts`. The supervisor forwards
method by method and nothing type-checks it; it has bitten in SHELL-04, LIBRARY-11, PLAYER-03 and
CLEAN-11. `server.py` speaks only `do_GET` and `do_POST`; mutations are POSTs to action paths.

This phase **removes** routes: `/api/v1/incrate/*` goes in DISCOVER-12. That is a breaking engine-API
change, recorded in the changelog as CLEAN-14's was, and DEC-090 is the explicit request AGENTS.md
requires.

### 2. Every Beatport call is made by the engine, with a token the renderer never sees

The token stays where DEC-098 leaves it. The renderer learns only whether one is configured and
whether Beatport accepted it. Every catalog response is untrusted input: parsed defensively, bounded
in size, and never interpolated into SQL or HTML. Tests mock Beatport, as AGENTS.md requires; the one
live check is DISCOVER-01's recorded spike, and its fixtures are sanitized before they are committed.

### 3. "Owned" has one definition, and it lives in one place

DEC-092's rule — an accepted match's Beatport track id, falling back to the id in its URL — is written
once, in DISCOVER-04, as a SQL fragment and a Python function that a test holds together. Discovery
runs, the wantlist, the Artist and Label pages and the playlist push all read it. A second
implementation is how "hidden as owned" and "shown as not owned" end up describing the same track.

### 4. An artist is not a substring of a credit

`tracks.artist` holds "A, B & C". The rule vocabulary's `artist` field is text, so no existing rule can
say "tracks by B" without also finding "Bb" and "Bob B". DISCOVER-03 builds a credit index and a rule
field over it, so an Artist page's library half is an ordinary rule, and "tracks by B" means the same
thing on the page and in a saved Smart Collection (DEC-043).

### 5. The library half of every page is the Library's own query

An Artist page, a Label page and a Similar Tracks list are not new tables or new query paths. The first
two are `TrackTable` over `/api/v1/library/search` with a rule set (DEC-023, DEC-040, DEC-043).
Similarity is the one exception, because a score is not a filter: it answers an ordered list of track
ids with reasons, and the renderer reads those rows through the existing track-detail path.

### 6. inCrate code is retired, and its data is not deleted

The inventory database under `%APPDATA%`, `incrate_past_results.json` and any Beatport playlists
already created are user data. DISCOVER-12 deletes the code that reads them, never the files, and the
user docs say where they are and that nothing reads them — DEC-071's treatment of past-search CSVs.

### 7. Config keys are an invariant

`incrate.*` keys stay readable by the loader, including the ones nothing reads any more
(`inventory_db_path`, `enrich_on_first_import`, `enrichment_delay_seconds`, `beatport_username`,
`beatport_password`). Renaming the section to `discover.*` would be a config-key change with a
migration note; nothing asks for one, so the token and the defaults keep their `incrate.` names and
the docs say that the prefix is historical.

---

## DISCOVER-01 — A Verified Beatport v4 Catalog Client

**Objective**: A catalog client whose response shapes are known rather than guessed, that keeps the
ids this phase needs, and that says plainly when a token is missing, rejected or short of scope.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**: `BeatportApiClient` (bearer auth, timeout, `BeatportAPIError`),
`BeatportApi`'s genre, chart and label-release methods, `api_track_url_to_web`, `CacheService`.

**Design**:

- **A recorded spike comes first.** With the developer's own token, call each endpoint this phase
  needs once and save the responses: a track by id, several tracks by id in one call if the API offers
  it, an artist, an artist's tracks, a label, a label's releases (existing), charts (existing), a
  chart (existing), a label search (existing), and playlist creation and add-track against a throwaway
  playlist. Record in the step outcome which exist, their paths, their pagination and any rate-limit
  headers. Sanitize the saved responses — no account ids, emails, playlist ids or tokens — and commit
  them under `src/tests/fixtures/beatport_v4/`. The parsers are then written against those files.
- **Which features the pages offer depends on this, and is decided here.** DEC-094 wants recent
  releases and charts for an artist or label. If the API cannot list charts curated by an artist, or
  charts featuring one, the page offers what the API does provide, and the outcome says so. Nothing
  later in this document may assume an endpoint this step did not find.
- **The parsers keep ids.** New dataclasses beside the existing ones, in
  `incrate/beatport_api_models.py` until DISCOVER-12 moves them:
  - `CatalogArtist(id, name)`;
  - `CatalogTrack(id, title, mix_name, url, artists: tuple[CatalogArtist, ...], remixers: tuple[...],
    label_id, label_name, release_id, release_name, release_date, bpm, key, genre_id, genre_name)`,
    where `key` is Beatport's key name converted to classic notation through `parse_key`/`format_key`,
    because every other key in CuePoint is classic or Camelot and nothing reads Beatport's spelling.
  - `ChartTrack` and `LabelReleaseTrack` gain an optional `catalog: CatalogTrack | None` at the end,
    so inCrate's existing code, which never reads it, is unaffected.
- **One parse path per shape.** Each parser reads the shape the fixture shows and nothing else. The
  existing "tracks or track_list or results or data" guessing stays in the existing functions until
  DISCOVER-12 deletes them; new code does not copy it.
- **New `BeatportApi` methods**, each only if the spike found its endpoint: `get_tracks(ids)`
  (batched to the API's page size), `get_artist(id)`, `artist_tracks(id, since)`, `get_label(id)`,
  `label_tracks(id, since)`, and chart listings by artist if they exist. Every list method follows the
  API's pagination up to a named cap, so one call cannot page forever.
- **`playlist_url` returns the real URL.** From the create response if it carries one, otherwise the
  web URL format the spike observes. The placeholder string goes.
- **Errors say what happened.** `BeatportAPIError` already carries `status_code`. A small
  classification — `no_token`, `rejected` (401), `forbidden` (403, including a missing playlist
  scope), `rate_limited` (429, with `Retry-After` honored once), `unavailable` (network, 5xx) — is what
  every later step's empty states are built from (DEC-098).
- **A request budget.** Concurrent catalog requests across the engine are capped by a named constant,
  as CLEAN-09 capped artwork fetches at four, so a discovery run and an open page cannot exceed it
  together.

**Tests**: Every new parser against its recorded fixture, including a track with two artists and a
remixer, a track with no key or no BPM, and a release with no label. Pagination stops at the cap.
Each error class from a mocked status. `Retry-After` is honored once and then reported. The
concurrency cap holds under a threaded test. `playlist_url` never contains `placeholder`. inCrate's
existing tests pass unchanged, which proves the extension did not change it.

**Acceptance criteria / DoD**: The spike's findings are recorded in the outcome, endpoint by endpoint.
`python -m pytest src/tests` clean; `ruff`, `mypy` clean. No test reaches the network.

**Risks**: High — this is the phase's unknown. Beatport documents its v4 API only partially, and a
personal token's scopes may differ from a partner's. If an endpoint DEC-094 wanted does not exist, the
Beatport half of the pages is narrower, and that is recorded rather than worked around by scraping. If
batched track lookup does not exist, DISCOVER-04's resolution does one request per track, and its
measured cost decides whether it needs a cap.

**Complexity**: **L**

---

## DISCOVER-02 — The Discover Schema

**Objective**: One forward-only migration, `m0021_discover`, holding everything this phase stores.

**User-visible result**: None.

**Dependencies**: DISCOVER-01 (the columns follow what the API returns).

**Existing code reused**: The migration runner and its conventions (m0009, m0011, m0020): `CHECK` on
every vocabulary at creation, indexes on every referencing column, models beside the DDL.

**Design**: Nine tables — seven for Beatport-facing data, then two for the library side.

- **`beatport_tracks`** — a cache of catalog tracks CuePoint has read: `beatport_track_id INTEGER
  PRIMARY KEY`, `title TEXT NOT NULL`, `mix_name`, `url TEXT NOT NULL`, `label_id INTEGER`,
  `label_name`, `label_key`, `release_id INTEGER`, `release_name`, `release_date`, `bpm REAL`, `key`,
  `genre_id INTEGER`, `genre_name`, `fetched_at TEXT NOT NULL`. A re-read replaces the row. Indexed
  on `label_id` and `label_key`.
- **`beatport_track_artists`** — `beatport_track_id` (references `beatport_tracks`, cascade), `role`
  `CHECK (role IN ('artist', 'remixer'))`, `position`, `artist_id INTEGER`, `name TEXT NOT NULL`,
  `name_key TEXT NOT NULL`; primary key `(beatport_track_id, role, position)`. Indexed on `artist_id`
  and `name_key`.
- **`beatport_name_lookups`** — the cache DEC-091 requires: `kind CHECK (kind IN ('artist',
  'label'))`, `name_key`, `beatport_id INTEGER` (null means "searched, not found"), `beatport_name`,
  `looked_up_at TEXT NOT NULL`; primary key `(kind, name_key)`.
- **`discovery_runs`** — `id INTEGER PRIMARY KEY`, `job_id TEXT`, `started_at`, `finished_at`,
  `outcome CHECK (outcome IN ('succeeded', 'cancelled', 'failed'))` (null while running),
  `params_json TEXT NOT NULL` (genres, dates, days, and the artist and label scope as resolved at
  start), and `NOT NULL` counts the writer always knows: `labels_in_scope`, `labels_resolved`,
  `artists_in_scope`, `charts_read`, `releases_read`, `tracks_found`, plus `error TEXT`.
- **`discovery_run_tracks`** — `run_id` (cascade), `beatport_track_id` (references
  `beatport_tracks`), `position` (first-seen order); primary key `(run_id, beatport_track_id)`.
- **`discovery_run_sources`** — every reason a run found a track: `run_id`, `beatport_track_id`,
  `source_type CHECK (source_type IN ('chart', 'label_release'))`, `source_id INTEGER NOT NULL`,
  `source_name`, `source_url`, `matched_on` (the library artist or label that put this source in
  scope); primary key `(run_id, beatport_track_id, source_type, source_id)`. inCrate kept only a
  track's first source. A track in three charts is found for three reasons, and the list says so.
- **`wantlist`** — `beatport_track_id INTEGER PRIMARY KEY` (references `beatport_tracks`),
  `added_at TEXT NOT NULL`, `note TEXT`, `bought_at TEXT`, `added_from_run_id` (references
  `discovery_runs`, `ON DELETE SET NULL`).

And for the library side, the credit index DISCOVER-03 maintains:

- **`track_credits`** — `track_id` (references `tracks`, cascade), `role CHECK (role IN ('artist',
  'remixer'))`, `position`, `name TEXT NOT NULL`, `name_key TEXT NOT NULL`; primary key
  `(track_id, role, position)`. Indexed on `name_key`.
- **`derived_indexes`** — `name TEXT PRIMARY KEY`, `version INTEGER NOT NULL`, `built_at TEXT NOT
  NULL`. One row, `track_credits`, so a change to the normalization rule is a version bump that
  rebuilds the index rather than a migration.

Nothing stores ownership (DEC-092) or a page (DEC-094). Both are computed when read.

**Tests**: A fresh database and a migrated one produce the same schema (the existing discovery test).
Every `CHECK` rejects a value outside its vocabulary. Deleting a track cascades its credits. Deleting a
run cascades its tracks and sources and sets a wantlist entry's `added_from_run_id` to null. A
`beatport_tracks` row referenced by a wantlist entry or a run cannot be deleted.

**Acceptance criteria / DoD**: The migration applies on a copy of a real 50,000-track library in under
a second, since it creates empty tables. `python -m pytest src/tests` clean.

**Risks**: Low. The schema is forward-only, so the columns follow DISCOVER-01's findings rather than
an expectation of them.

**Complexity**: **M**

---

## DISCOVER-03 — Artist and Label Names in the Library

**Objective**: One normalization rule for artist and label names, a credit index that turns "A, B & C"
into artists, and rule fields over both, so an artist or label is something a rule can name.

**User-visible result**: None yet. The new rule fields exist in the vocabulary.

**Dependencies**: DISCOVER-02.

**Existing code reused**: `_strip_accents`; the `tag` field's `EXISTS` shape in `models/filter_rule.py`
(DEC-060); `TrackRepository`'s write path; the jobs infrastructure for the rebuild.

**Design**:

- **`core/entity_names.py`**, holding two pure functions the whole phase shares:
  - `name_key(name) -> str`: NFKD, accents stripped, `casefold`, punctuation to spaces, whitespace
    collapsed. It keeps every script, so a Cyrillic or Japanese name has a key, and it never returns
    an empty key for a non-empty name. **It does not reuse `normalize_text`**, which drops non-Latin
    characters and strips mix words — right for matching titles and wrong for identity: a Cyrillic
    artist would get an empty key and an artist called "Dub Phizix" would lose a word. It does not
    strip "Records" or "Music" either (DEC-095).
  - `split_credit(credit) -> list[str]`: splits on commas and on featuring markers (`feat.`, `ft.`,
    `featuring`), and **not** on `&`, `and`, `x`, `vs` or `/`. `split_artists` splits on all of those,
    which is right for scoring and wrong for identity: "Above & Beyond" and "Chase & Status" are one
    act each. Beatport credits separate artists with commas, so this finds individual artists in the
    common case and errs toward keeping a duo together otherwise. That is DEC-074's "errs by not
    grouping". When DISCOVER-04 has resolved a track, its Beatport artist list is authoritative.
- **`track_credits` is maintained where tracks are written.** Every insert, and every update that
  changes `artist` or `remixer`, rewrites that track's credits in the same transaction. That covers
  import, refresh apply and nothing else, since only those write the two columns (DEC-069 keeps them
  Rekordbox's). There is no stale window between an import and a scan.
- **Backfill and version bumps**: at engine start, if `derived_indexes` has no `track_credits` row or
  an older version, a `credit_index` job rebuilds the index in chunks, cancellable, visible in the
  status strip, and conflicting with `LIBRARY_JOB_TYPES`. It is a few seconds at 50,000 tracks
  (measured in this step).
- **Rule fields**:
  - `artist_name` — a new field kind: `EXISTS (SELECT 1 FROM track_credits WHERE track_id = tracks.id
    AND name_key = ?)`, operators `is` and `is_not`, with the value normalized by `name_key` on the
    Python side before it is bound. Remixer credits count, so "tracks by B" includes B's remixes; a
    `role` qualifier is not offered, because nothing asks for one yet.
  - `label_name` — the effective label compared by key. The key has to be computed on the effective
    value, which changes when an override is applied, so it is not indexed on a column. The step
    measures two implementations at 50,000 tracks and keeps the faster: a Python `name_key`
    registered on the connection as a deterministic SQLite function, or a `label_key` column on
    `track_metadata` and on `tracks` maintained where each is written. The one kept is recorded with
    its numbers.
- **Facets**: `artist_name` and `label_name` are facetable, so "which artists does this library have,
  and how many tracks each" is the Library's facet endpoint, not a new one. DISCOVER-05's scope and
  DISCOVER-07's pages read those facets.

**Tests**: `name_key` on accents, case, punctuation, Cyrillic, Japanese, and a name that is only
punctuation. `split_credit` on commas, featuring markers, a duo with `&`, a trailing comma and
whitespace. An import writes credits; a refresh that changes an artist rewrites them; one that changes
only the BPM does not touch them. The backfill job builds the same rows the write path would, and a
version bump rebuilds. `artist_name is B` finds "A, B & C" and "B feat. D" and not "Bob B". The
filter and a saved Smart Collection with the same rule return the same tracks. `label_name` finds a
label set by an override and stops finding one that an override replaced.

**Acceptance criteria / DoD**: At 50,000 tracks: the backfill time, the `artist_name` and `label_name`
browse counts, and the two facets, each measured and recorded. `python -m pytest src/tests` clean.

**Risks**: Medium. Splitting credits is a heuristic, and any heuristic finds cases it gets wrong. The
mitigation is the direction it errs in and Beatport resolution overriding it, not a smarter splitter.

**Complexity**: **L**

---

## DISCOVER-04 — Ownership and Beatport Identity

**Objective**: DEC-092's "owned" as one definition, and DEC-095's resolution of accepted matches into
Beatport artist and label ids.

**User-visible result**: None yet.

**Dependencies**: DISCOVER-01, DISCOVER-02, DISCOVER-03.

**Existing code reused**: `track_match` and `match_candidates`; the URL-id fallback from CLEAN-08;
`get_tracks` from DISCOVER-01; `create_job`.

**Design**:

- **`services/beatport_ownership.py`** holds the one definition. `owned_beatport_ids_sql()` returns a
  fragment selecting the Beatport track ids of accepted matches (`state = 'accepted'`, either
  `decided_by`), with the id taken from `beatport_track_id` or, when that is null, parsed from the
  candidate's URL. `is_owned(ids) -> set` runs it. A test builds a library with every case —
  automatic accept, user accept, reject, needs review, no id but a URL, neither — and asserts the SQL
  and the Python agree on every track.
- **A `beatport_resolve` job.** Over the accepted matches whose Beatport track has no
  `beatport_tracks` row, or a row older than a named age, it reads the tracks in batches through
  DISCOVER-01 and writes `beatport_tracks` and `beatport_track_artists`. It is cancellable between
  batches, stops after a named number of consecutive failures (CLEAN-09's rule), refuses to start
  without a token, and records one activity event with its counts. It runs only when asked:
  offered on the Discover page and on a name-matched Artist or Label page, never started by browsing
  (DEC-095).
- **Linking the two worlds.** Once a library track's accepted Beatport track is resolved, its Beatport
  artists and label are known by id. The pages (DISCOVER-07) read identity through one view,
  `library_beatport_credits`, joining accepted matches to `beatport_track_artists` and
  `beatport_tracks.label_id`. No id is copied onto `tracks` or `track_credits`, so a re-match that
  accepts a different candidate changes the identity with no invalidation step.

**Tests**: The ownership agreement test above. A resolve over 1,000 accepted tracks with a mocked API
writes one catalog row each, re-uses rows younger than the age, cancels between batches, stops after
the failure limit, and refuses without a token. A track whose accepted candidate changes reads the new
identity immediately.

**Acceptance criteria / DoD**: Resolving 10,000 accepted tracks against a mocked API, measured for
time and request count. `python -m pytest src/tests` clean.

**Risks**: Medium. The resolve job's request count is the thing a real Beatport account notices. If
DISCOVER-01 found no batched lookup, it is one request per track, and the named cap and the
consecutive-failure stop are what keep it polite.

**Complexity**: **M**

---

## DISCOVER-05 — The Discovery Job

**Objective**: inCrate's discovery algorithm, reading the library, running as a job, keeping its runs.

**User-visible result**: None yet. It runs through the engine.

**Dependencies**: DISCOVER-01 to DISCOVER-04.

**Existing code reused**: `incrate/discovery.py`'s algorithm — charts in the chosen genres and dates
whose curator is a library artist, releases in the last N days from library labels, de-duplicated by
Beatport track id — ported rather than reinvented. `IncrateDiscoveryService`'s config defaults
(`incrate.discovery_genre_ids`, `incrate.new_releases_days`). `create_job`.

**Design**:

- **`services/discovery_service.py`**, new, beside inCrate's module rather than over it.
- **The scope is resolved once, at start** (DEC-091, DEC-063). Artists: the `artist_name` facet, or
  the subset the user picked. Labels: the `label_name` facet, or the subset picked. Both recorded in
  `params_json`, with their counts.
- **Labels resolve through the cache.** A label with a Beatport id from DISCOVER-04 uses it. Otherwise
  `beatport_name_lookups` is asked, and only a miss calls `search_label_by_name`, whose answer
  (including "not found") is stored. A second run spends no requests on labels the first one resolved.
  `_CANONICAL_LABEL_IDS` is not ported (DEC-099).
- **Chart curators compare by key.** A chart counts when `name_key(author)` is a library artist's key,
  or when its author id is a resolved library artist's Beatport id. inCrate compared lowercased strings.
- **Every found track is written through.** Its catalog row goes to `beatport_tracks`, its place in
  the run to `discovery_run_tracks`, and each reason it was found to `discovery_run_sources`. Written
  in committed chunks, so a cancel keeps what was found and the run records `cancelled`.
- **The job**: type `discovery`, exclusive with itself only. It reads the library once at start and
  never writes to it, so it does not conflict with imports; a refresh during a run changes nothing
  the run already resolved. Progress reports the stage (resolving labels, reading charts, reading
  releases) with counts. Cancel is checked between API calls. One activity event, `discovery.ran`,
  with the counts and the outcome.
- **Reading a run** is a windowed query over its tracks, joined to the catalog and to ownership:
  `owned` filters (`hide`, the default, `only`, `all`), sort by first-seen order, release date,
  artist or title, and a count of hidden owned tracks in every response. Ownership is computed then,
  not stored (DEC-092).
- **A token is required** and its absence is a refusal before the job exists, with DISCOVER-01's error
  class. A token rejected mid-run fails the run with that class and keeps what was found.

**Tests**: The ported algorithm against a mocked API over a fixture library: the same tracks inCrate's
`run_discovery` finds for the same inputs, plus the second and third sources inCrate dropped. A second
run makes no label searches. A cancel mid-releases keeps the charts' tracks and records `cancelled`. A
401 mid-run fails it and keeps the rows. Owned tracks are hidden and counted, and a track accepted
after the run reads as owned when the run is reopened. The scope is recorded as resolved.

**Acceptance criteria / DoD**: A mocked run over a library of 50,000 tracks with 1,200 labels, measured
for time and request count, first and second run. `python -m pytest src/tests` clean.

**Risks**: Medium. Porting an algorithm while changing its inputs invites quiet drift. The parity
test against inCrate's own function, run while both exist, is the guard, and it is deleted with
inCrate in DISCOVER-12.

**Complexity**: **L**

---

## DISCOVER-06 — The Wantlist and the Beatport Playlist Job

**Objective**: DEC-093's wantlist, and DEC-099's playlist push as a job.

**User-visible result**: None yet.

**Dependencies**: DISCOVER-02, DISCOVER-04.

**Existing code reused**: `playlist_writer.py`'s API path; `playlist_name.py`; `BeatportApi`'s
`create_playlist` and `add_track_to_playlist`; `create_job`.

**Design**:

- **`services/wantlist_service.py`**: add (from a run or a page, by Beatport track id; the catalog row
  must exist, and one is read if it does not), remove, set or clear a note, mark or unmark bought.
  Adding an entry that exists changes nothing and says so. Reads are windowed with `owned` computed
  (DEC-092), and filters for bought, not bought, owned and not owned.
- **Owned and bought are two columns on screen** (DEC-093): a track bought and not imported yet is
  bought and not owned; a track owned and never marked bought is owned. Neither changes the other, and
  nothing removes an entry automatically.
- **Every change writes an activity event**, so the Activity panel shows the wantlist's history. No
  `track_history` row is written, because there is no track.
- **The playlist job**, type `beatport_playlist`: given a name and a set of Beatport track ids (a
  run's visible tracks, a wantlist selection, or an explicit list), it creates the playlist, adds each
  track, checks cancel between tracks, and reports added, failed and skipped-as-owned counts. Owned
  tracks are skipped unless asked for, since pushing tracks a user has to a list for buying is the
  mistake DEC-092 exists to prevent. One activity event carries the real playlist URL.
- **Scope refusal**: a 403 on create is refused as `forbidden`, saying the token may lack playlist
  scope (DEC-099). There is no fallback.

**Tests**: Each wantlist operation, idempotent add, the four filters, owned and bought independent. The
playlist job against a mocked API: all added, some failing, cancelled mid-way, 403 on create, owned
skipped by default and included on request, and the event carries a URL with no `placeholder`.

**Acceptance criteria / DoD**: `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Low.

**Complexity**: **M**

---

## DISCOVER-07 — Artist and Label Pages

**Objective**: The data behind DEC-094's two pages, with DEC-095's identity.

**User-visible result**: None yet.

**Dependencies**: DISCOVER-01, DISCOVER-03, DISCOVER-04.

**Existing code reused**: The rule vocabulary and browse query (for the library half), the catalog
cache and ownership (for the Beatport half).

**Design**:

- **An entity reference** is `{kind: "artist" | "label", beatport_id?: int, name_key?: str}`, written
  in URLs as `bp:<id>` or `name:<key>`. Resolving it answers a display name, which identity was used
  (`beatport` or `name`), and, for a name reference that DISCOVER-04 has since linked to an id, the id
  reference to redirect to (DEC-095's last implication).
- **The library half is a rule set**, returned by the engine, that the renderer passes to the
  Library's browse unchanged, as Health's counts are (CLEAN-12): `artist_name is <key>` or
  `label_name is <key>` for a name reference, and for an id reference a membership rule over
  `library_beatport_credits`. That is one more rule field, `beatport_artist` or `beatport_label`,
  added to the vocabulary here. The page builds no SQL.
- **Summary facts** for the header: track count, the years the library covers, the top genres, and
  for an artist the labels, for a label the artists — each from the Library's facets over that rule
  set, so a number on the header and the count of the table below it cannot disagree.
- **The Beatport half**, with an id reference and a token: the artist's or label's tracks released in
  a named recent window, and charts if DISCOVER-01 found an endpoint for them, cached in
  `beatport_tracks` with a named freshness age and each marked owned. With a name reference, the
  label half may use the name lookup cache and says "found by name on Beatport" when it does; the
  artist half does not guess, because a name search for an artist that shares a name is exactly the
  wrong answer DEC-095 exists to avoid, and it offers the resolve job instead.
- **Every Beatport-half response carries its state**: `ok`, `no_token`, `rejected`, `forbidden`,
  `rate_limited`, `unavailable`, or `name_only`. The page draws each as an empty state with its reason
  and, where there is one, its action (Settings, Resolve).

**Tests**: Entity references parse and render round-trip. A name reference linked to an id redirects.
The library half's rule set returns the same tracks as the equivalent filter, for both kinds and both
identities. Each Beatport-half state from a mocked API. The header's counts equal the table's.

**Acceptance criteria / DoD**: At 50,000 tracks, both halves' library queries measured.
`python -m pytest src/tests` clean.

**Risks**: Medium, inherited from DISCOVER-01: the Beatport half is as wide as the API allows.

**Complexity**: **M**

---

## DISCOVER-08 — Similar Tracks

**Objective**: DEC-096's engine: deterministic, explained, offline, and shaped for Phase 10 to reuse.

**User-visible result**: None yet.

**Dependencies**: DISCOVER-03.

**Existing code reused**: `parse_key`; the effective-value SQL; `name_key` and `track_credits`.

**Design**:

- **`core/similarity.py`** holds the rule and nothing else — no SQL, no I/O — so Phase 10 can call it
  over a Set's candidates. Inputs are small value objects (`bpm`, `key` as pitch and mode, `genre_key`,
  `label_key`, artist keys); the output is a score and a list of reasons.
- **The components**, each a named constant:
  - *Tempo*: within a named percentage of the seed's BPM, scored by closeness, and half or double time
    counted as close with a reason that says so.
  - *Key*, on the Camelot wheel from `(pitch, minor)`: same key; one step either way in the same mode;
    the relative major or minor. Each is its own reason. This is new code, because `_key_bonus` only
    compares keys for equality.
  - *Genre*, *label* and *shared artist*, each by key.
- **Reasons are data**, not prose: `{component, detail}` pairs such as `{"key": "adjacent", "from":
  "8A", "to": "9A"}`, written in the library's key notation (`key_notation_of`). The renderer turns
  them into words, and a test holds every reason the engine can produce to a string the UI has.
- **The service** (`services/similarity_service.py`) reads the seed, pre-selects candidates in SQL by
  the tempo window, or by genre, label and artist when the seed has no BPM, scores them in Python,
  and returns the top N by score and then by track id. It excludes the seed and tracks in the seed's
  duplicate group (DEC-074), because "the same track again" is not a suggestion. A seed with no BPM
  and no key says which components it could not use.
- **An optional scope** restricts candidates to a Collection, playlist or rule set, which is what
  Phase 10 will pass. Phase 9 draws only the whole-library case.

**Tests**: The rule, component by component, with a table of seeds and candidates and their expected
scores and reasons. Camelot adjacency across the 12→1 wrap and the relative-mode switch. Half and
double time. A seed with no BPM and no key. The same library gives the same order twice, and ties
break by id. The seed and its duplicates are excluded. A scope restricts.

**Acceptance criteria / DoD**: At 50,000 tracks, a suggestion list for a seed in a dense tempo band
(the worst case) measured, with a named budget the step sets and meets. `python -m pytest src/tests`
clean.

**Risks**: Medium. Weights are a judgment, and a judgment users will disagree with. That is why the
reasons are shown: a suggestion that says why can be discounted, and one that does not can only be
distrusted.

**Complexity**: **M**

---

## DISCOVER-09 — The Discover API and the Desktop Contract

**Objective**: DISCOVER-04 to DISCOVER-08 on the wire, through all six contract files.

**User-visible result**: None yet.

**Dependencies**: DISCOVER-04 to DISCOVER-08.

**Existing code reused**: The job routes (`/api/v1/jobs/*`) for progress, cancel and events; the
Library's browse for every library half; `engine/api_errors.py`'s envelope.

**Design**:

- **Routes under `/api/v1/discover/`**: `options` (token state, genres, the artist and label facets
  with counts, defaults), `runs` (list), `runs/start`, `runs/{id}` (header), `runs/{id}/tracks`
  (windowed, with the owned filter and the hidden count), `runs/{id}/delete`; `wantlist` (windowed),
  `wantlist/add`, `wantlist/remove`, `wantlist/note`, `wantlist/bought`; `playlist/start`;
  `resolve/start`; `entity` (resolve a reference), `entity/beatport` (the Beatport half);
  `similar` (a seed track id and an optional scope). New names only: nothing is called `incrate`.
- **A refusal a person can act on is a value**, as EXPORT-06 did: DISCOVER-01's error classes cross
  the bridge as data with their reason, because a rejected IPC promise loses everything but its
  message on the way to the renderer.
- **A Python test holds every new TypeScript shape** against what the engine serializes, as EXPORT-06's
  does.
- **`/api/v1/incrate/*` is left in place** until DISCOVER-12, so the inCrate screen keeps working.

**Tests**: Each route's happy path and each refusal, through the real HTTP server. The contract test
passes with every new method in all six files. The shape test. A renderer test that the bridge
methods exist in the types.

**Acceptance criteria / DoD**: `python -m pytest src/tests/unit/engine/ -q` clean;
`npm run typecheck`, `npm test` clean in the renderer.

**Risks**: Low, and the supervisor is the file to check twice.

**Complexity**: **L**

---

## DISCOVER-10 — The Discover Page

**Objective**: The `discover` destination: runs, their tracks, and the wantlist.

**User-visible result**: Discover appears in the sidebar and works end to end. inCrate is still there
until DISCOVER-12.

**Dependencies**: DISCOVER-09.

**Existing code reused**: `TrackTable` with a windowed data source (DEC-041); the status strip's job
display; `Tabs`; the pixel `discover` icon (SHELL-09); the Library's column-layout persistence.

**Design**:

- **Enable `discover`** in `navRegistry.ts` (DEC-020).
- **Two tabs, Runs and Wantlist**, the last one used remembered, like Clean's (CLEAN-12).
- **Runs**: a "New run" panel with genres, chart dates, release days and the artist and label scope
  (all, or picked from the facets, with counts), defaulted from `options`. Starting a run shows it in
  the status strip and in the list of past runs, each with its date, parameters, outcome and counts.
  Opening a run shows its tracks in `TrackTable` — title, artists, label, release date, BPM, key,
  genre, sources, owned, on wantlist — with the owned toggle and "N owned tracks hidden". A multi-
  selection offers **Add to wantlist**, **Push to Beatport playlist…**, and **Open on Beatport**.
- **Wantlist**: the same table over the wantlist, with the note, bought and owned columns, the four
  filters, and the same push and open actions, plus **Remove** and **Mark bought**.
- **No-token and rejected-token states** draw from DISCOVER-01's classes, with a link to Settings.
  The page is usable without a token for reading past runs and the wantlist.
- **A resolve prompt**: when the library has accepted matches with no resolved identity, the page says
  how many and offers **Resolve Beatport identities**, starting DISCOVER-04's job.
- **Rows from Beatport are not library rows.** The table is the same component with a different row
  type and column registry, which is what DEC-041 made `TrackTable` generic for. Double-click on a
  Beatport row does nothing, because the player plays library files (DEC-097), and the row has no
  Inspector content; the Inspector shows its empty state rather than the last library track, so it
  never appears to describe a row it does not.

**Tests**: Component tests with fixtures the Python suite produces from the real engine (EXPORT-07's
practice): the run list, a run's tracks with owned hidden and shown, the wantlist filters, every token
state, the resolve prompt, the actions offered by selection size. Navigation tests: Discover is
enabled. An end-to-end spec with a mocked Beatport behind the engine: start a run, watch it in the
status strip, open it, add two tracks to the wantlist, mark one bought.

**Acceptance criteria / DoD**: `npm run lint`, `npm run typecheck`, `npm test` clean; the end-to-end
spec passes three times in a row in the packaged Windows build.

**Risks**: Medium. `TrackTable` has only ever held library rows. If making it hold a second row type
needs more than a column registry and a data source, the step says what changed and why.

**Complexity**: **L**

---

## DISCOVER-11 — Artist and Label Pages, Similar Tracks, and the Hooks

**Objective**: Draw DISCOVER-07 and DISCOVER-08, and reach them from where a user already is.

**User-visible result**: Clicking an artist or a label opens its page; "Similar tracks" lists
explained suggestions.

**Dependencies**: DISCOVER-09, DISCOVER-10.

**Existing code reused**: `TrackTable` and the Library's browse for every library half;
`TrackDetailPanel`'s zones; `SelectionActions`' single operations list (ORG-11); the queue's play
actions, unchanged (DEC-012, DEC-013).

**Design**:

- **Routes** `/discover/artist/:ref` and `/discover/label/:ref`, under the `discover` destination, not
  new ones (DEC-094). A name reference that the engine redirects to an id reference replaces the URL.
- **A page**: a header with the name, which identity it is ("Beatport artist" or "Grouped by name"),
  and the summary facts; the library half as the Library's `TrackTable` over the engine's rule set,
  with DEC-012's double-click and DEC-013's queue actions working as they do in the Library, because
  these are library rows; the Beatport half as DISCOVER-10's Beatport table with its state, owned
  marks and wantlist and playlist actions. **Open in Library** applies the same rule set in the
  Library, and **Save as Smart Collection** saves it (DEC-043), so the page is also a way in to
  CuePoint's own organization.
- **Similar tracks**: a panel on the Discover page's seed view, reached from a track, listing
  suggestions in `TrackTable` with a Reasons column in words ("Same key", "One step on the wheel:
  8A → 9A", "Half time", "Same label"), each suggestion playable and queueable like any library row.
- **The hooks**:
  - The Inspector's artist credit becomes one link per artist from `split_credit`, and its label a
    link, each opening its page; resolved tracks link by id.
  - `SelectionActions` gains **Similar tracks** and **Artist page** / **Label page** for a single
    selection, in both the context menu and the Actions button, since they share one list.
  - The Library's filter chips for `artist_name` and `label_name` offer **Open page**.

**Tests**: Component tests for both pages in each identity and each Beatport state; the library half's
double-click plays; Open in Library and Save as Smart Collection carry the same rules. The Reasons
column renders every reason the engine can emit (the test from DISCOVER-08, from the other side). The
Inspector links split credits correctly and open the right page. An end-to-end spec: from a track in
the Library, open its artist's page, play a track from it, open Similar tracks and queue a suggestion.

**Acceptance criteria / DoD**: As DISCOVER-10.

**Risks**: Medium. The Inspector and the operations list are shared by every page, so a hook added for
Discover is a change to the Library and Clean too. Their existing tests must pass unchanged.

**Complexity**: **L**

---

## DISCOVER-12 — inCrate and Tools Retire, and the Phase Comes Together

**Objective**: Remove inCrate, its inventory, its routes and the Tools group; make the Library home;
document; prove the phase in a packaged build.

**User-visible result**: The sidebar has no Tools group and no inCrate. The app opens on the Library
when it has nowhere else to go. `/incrate` opens Discover.

**Dependencies**: DISCOVER-10, DISCOVER-11.

**Existing code reused**: CLEAN-14's retirement practice: search callers first, redirect rather than
404, record the removal in the changelog, keep user files.

**Design**:

- **Delete, each confirmed by a caller search at the time rather than taken from this list**:
  `incrate/enrichment.py`, `inventory_db.py`, `collection_parser.py`, `schema.sql`, `discovery.py`,
  `past_results_storage.py`, `playlist_writer.py`'s browser path, `beatport_playlist_browser.py`;
  `services/inventory_service.py`, `incrate_discovery_service.py`, `IInventoryService`,
  `IIncrateDiscoveryService` and their DI registrations; `engine/incrate_api.py` and its routes;
  `scripts/create_incrate_playlist.py` (DEC-099); the `schema.sql` entry in
  `build/engine-sidecar.spec`; and each module's tests. What survives moves out of `incrate/`: the
  catalog models go beside `services/beatport_api.py`, and `playlist_name.py` beside the playlist
  job. `incrate/beatport_oauth.py` stays where it is, untouched, per DEC-098, and its module docstring
  records that nothing in the product calls it.
- **The six contract files lose** `getIncrateInventory`, `importIncrateXml`, `resetIncrateInventory`,
  `getIncrateDiscoverOptions`, `runIncrateDiscover` and `createIncratePlaylist`, and the renderer
  loses `InCrateMainScreen` and its types. The Beatport token methods stay (DEC-098).
- **Navigation** (DEC-100): `HOME_DESTINATION_ID` becomes `library`; `tools` leaves `NAV_GROUPS`;
  `tools` and `incrate` join `RETIRED_DESTINATIONS`, replaced by `library` and `discover`; `/` routes
  to the Library; `ToolSelectionScreen` and its test go. DEC-027's fallback is re-tested with a
  remembered `tools` and a remembered `incrate`.
- **Settings**: the Beatport token field stays where it is, in `SettingsExportScreen`'s general
  panel, unchanged in behavior (DEC-098). Only wording that names inCrate changes, to say Discover.
- **Docs**:
  - A user-guide page for Discover: runs, owned and why "not owned" depends on Clean's matches,
    the wantlist, pages and their two identities, Similar tracks and how to read its reasons, and the
    token.
  - `docs/features/incrate.md` and the `docs/feature/incrate-*` pages are marked historical and point
    to the new page, rather than deleted.
  - The user docs say where the inventory database and `incrate_past_results.json` are, that nothing
    reads them any more, and that they can be deleted by hand (fact 6). The note DEC-030 required —
    that two collection imports can disagree — is removed, because there is one now.
  - The docs say `incrate.beatport_username` and `incrate.beatport_password` are unused and can be
    removed from `config.yaml` (DEC-098).
  - An ADR, `007-discover-on-the-library.md`: why discovery reads the library, why ownership is
    computed, why an artist is a Beatport id or a name, and why similarity is local.
  - The CHANGELOG, under Unreleased, with the removed routes as a breaking engine-API change.
  - `ROADMAP.md` and this document's status.
- **The end-to-end journey**, packaged Windows build, with a mocked Beatport behind the engine: import
  a library, match and accept two tracks, resolve identities, run discovery and see those two hidden as
  owned, add a track to the wantlist and push two to a Beatport playlist, open an artist page by id
  and a label page by name, play from one, open Similar tracks and queue a suggestion, and relaunch to
  land on the Library.

**Tests**: The caller searches as greps in the step outcome. Navigation and launch-memory tests. The
contract test with the methods removed. The journey, three times in a row.

**Acceptance criteria / DoD**: Phase-level acceptance below, checked point by point.
`python -m pytest src/tests` clean; `ruff`, `mypy`, `check_no_qt_in_core.py`, renderer lint,
typecheck and tests clean; `grep -rn "incrate_api\|InventoryService\|enrich_labels_for_empty" src/`
returns nothing.

**Risks**: Medium. Retiring a screen touches navigation, launch memory and Settings at once, which is
what CLEAN-14 found. The redirects exist so no remembered state lands on a blank page.

**Complexity**: **L**

---

## Phase-level acceptance

In a packaged Windows build unless said otherwise, with the macOS packaged checks owed alongside
Phases 5, 7 and 8. A mocked Beatport stands in for the real one in every automated check; one manual
pass against the real API with the developer's token is recorded.

1. Discovery reads the library's effective labels: a label set by an override is in scope, and a
   label replaced by one is not. Nothing reads inCrate's inventory.
2. A run is a job in the status strip, can be cancelled, keeps what it found when cancelled, and can
   be reopened after a relaunch with the same tracks and sources.
3. A second run over the same labels makes no label searches.
4. Tracks owned through accepted matches are hidden by default, counted, and shown by the toggle. A
   track accepted after a run reads as owned when the run is reopened.
5. The wantlist keeps entries across relaunches; bought and owned are independent; nothing removes an
   entry automatically.
6. A Beatport playlist push adds the tracks, reports added and failed counts, skips owned tracks by
   default, and returns a real URL. A token without playlist scope is refused with that reason.
7. An Artist page by Beatport id and a Label page by name each show the library half, which plays and
   queues like the Library, and the Beatport half, marked owned or not; the name page says it is
   grouped by name. Save as Smart Collection saves the same tracks.
8. With no token, and with a rejected token, every Beatport surface shows an explained empty state
   pointing to Settings, and every library surface still works.
9. Similar tracks gives the same list twice for the same library, every suggestion states its reasons,
   and the seed and its duplicates are absent.
10. No audio file, no Rekordbox XML and nothing in the library tables is written by any discovery,
    wantlist, page or similarity action.
11. The sidebar has no Tools group and no inCrate; `/incrate` opens Discover; a remembered `tools` or
    `incrate` opens the Library or Discover; a launch with nothing remembered opens the Library.
12. The inventory database file and `incrate_past_results.json` are where they were, untouched.
13. Measured at 50,000 tracks: the credit backfill, the artist and label facets, an Artist and a Label
    page's library half, a discovery run's library reads, and a Similar tracks list for the densest
    tempo band.
14. `/api/v1/incrate/*` answers 404, and the changelog says so.

## Deferred, with reasons

- **Storing the Beatport token securely, or a sign-in flow** — DEC-098, against the recommendation.
  The token stays in plain text in `config.yaml`.
- **Audio previews** — DEC-097.
- **For You** — DEC-101.
- **Beatport tracks in Similar tracks** — DEC-096 chose local only; the engine's inputs do not depend
  on where a candidate came from, so adding catalog candidates later is an addition.
- **Editing an artist's or label's identity by hand** (merging two name groups, splitting a duo) —
  nothing asks for it yet; resolution through Beatport is the supported way to exact identity.
- **Adding a Beatport track to the library** — impossible by construction: the library mirrors
  Rekordbox (DEC-031), and a track enters it by being bought, imported into Rekordbox and refreshed.
