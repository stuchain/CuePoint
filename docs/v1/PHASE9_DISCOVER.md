# CuePoint v1.0.0 — Phase 9: Discover, Detailed Step Specifications

Status: **DISCOVER-01 to DISCOVER-12 implemented, and DISCOVER-01's spike recorded against the
live API (2026-09-23; see its outcome). The phase-level acceptance is met on Windows (checked point
by point below, 2026-09-28); the macOS packaged checks and one manual pass through the app against
the live API are owed.** The twelve steps below replace the
roadmap's placeholder
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

**Outcome**: Implemented, and the spike recorded against the live API on 2026-09-23 (see **The
recording**, at the end of this outcome, which answers every question the text below leaves open).
The code was written and tested before a token was available: the route map was established without
one, and the recording was a single command, written and tested offline:
`python scripts/beatport_v4_spike.py --playlist --write-fixtures`.

**What was built.**

- `services/beatport_api_client.py`: the five error classes (`classify_beatport_error`:
  `no_token`, `rejected`, `forbidden`, `rate_limited`, `unavailable`); `Retry-After` honored once
  (seconds or an HTTP date; 2 s when absent; a wait over 30 s is reported at once rather than sat
  through), carried on the error as `retry_after`; one engine-wide gate of
  `MAX_CONCURRENT_REQUESTS = 4` shared by every client, released on failure and not held during a
  rate-limit wait; responses over 8 MiB refused before parsing; a POST that never follows a
  redirect; network failures on POST wrapped as `BeatportAPIError` like GET's.
- `services/beatport_catalog.py`, new: the parsers, one shape each, bounding every string (500
  characters) and credit list (50), rejecting ids that are not positive integers, and answering
  None rather than guessing. The key comes out in classic notation through `parse_key`/`format_key`,
  reading Beatport's Camelot number and letter first and its display name ("Eb Minor") second. The
  release date is `new_release_date`, falling back to `publish_date`. Split out of
  `beatport_api.py` so it could join `test_mypy_foundation.py`'s strict gate — as did the client —
  while the legacy parsers beside it keep their 14 known errors until DISCOVER-12 deletes them.
- `CatalogArtist`, `CatalogLabel`, `CatalogTrack` in `incrate/beatport_api_models.py`, and
  `catalog: CatalogTrack | None` at the end of `ChartTrack` and `LabelReleaseTrack`.
- `BeatportApi.get_track`, `get_tracks`, `get_artist`, `get_label`, `artist_tracks`,
  `label_tracks`, and `chart_tracks` (not in the list above; DISCOVER-05 needs a chart's full track
  list with ids, and `get_chart` reads only the first page). Every listing follows `next` to
  `MAX_LISTING_PAGES = 10`. `playlist_url` returns `https://www.beatport.com/library/playlists/{id}`
  — or a website URL from the create response, if a recording shows one — and validates the id, as
  `add_track_to_playlist` now does before building a path from it.
- `scripts/beatport_v4_spike.py` and `src/tests/fixtures/beatport_v4/` (see below).

**The spike, endpoint by endpoint.** No token was available when the step was implemented, and the
developer's stored credentials were deliberately not read. What could be established without one
was: Beatport's router answers **404** for a path it does not have and **401** for one it does,
before it looks at a token, so the route map below is live evidence. Response *shapes* come from
two open-source clients that decode real responses — beatportdl's typed Go structs fail on a type
mismatch, so their field names and types are strong evidence — and are documented, with the one
recorded body, in the fixtures' README.

| Endpoint | Exists (live, 2026-09-23) | Shape from | Used by |
| --- | --- | --- | --- |
| `catalog/tracks/{id}/` | yes | beatportdl, beets-beatport4 | `get_track` |
| `catalog/tracks/?id=a,b` | route yes; filter unverified | — | `get_tracks`, which checks it (below) |
| `catalog/tracks/?artist_id=` / `?label_id=` | route yes | beatportdl | `artist_tracks`, `label_tracks` |
| `catalog/artists/{id}/` | yes | beatportdl | `get_artist` |
| `catalog/artists/{id}/tracks/` | yes | — | not used; the filtered listing is the one path for both kinds |
| `catalog/labels/{id}/` | yes | beatportdl | `get_label` |
| `catalog/labels/{id}/releases/` | yes | beatportdl (`tracks` is a list of URLs) | existing, inCrate |
| `catalog/releases/{id}/tracks/` | yes | beatportdl | existing, inCrate |
| `catalog/charts/`, `catalog/charts/{id}/`, `…/tracks/` | yes | beatportdl (`person.owner_name`) | existing; `chart_tracks` |
| `catalog/search/` | yes | existing code | existing `search_label_by_name` |
| `my/playlists/`, `my/playlists/{id}/tracks/` | yes | existing code | existing, paths fixed |
| `my/playlists/{id}/tracks/bulk/` | yes | — | not used; its body is unknown |
| `catalog/artists/{id}/charts/`, `catalog/labels/{id}/charts/` | **no** | — | — |
| `catalog/labels/{id}/tracks/`, `…/top-10-tracks/` | **no** | — | — |

Findings that bind later steps:

1. **There is no route listing charts by artist or by label.** Whether `catalog/charts/?artist_id=`
   filters is a question only a token answers; the spike asks it. Until a recording shows it does,
   DISCOVER-07's Beatport half offers an artist's and a label's recent tracks and no charts, which is
   DEC-094's own fallback.
2. **Batched lookup is used if it proves itself.** The `id=a,b,c` filter could not be tested, so
   `get_tracks` asks it and checks the answer: a track it was not asked for, a 400, or leaving out a
   track that a single lookup then finds all switch the instance to one request per track. So
   DISCOVER-04's resolve job is correct either way, and its measured cost says which world it is in.
3. ~~**A chart names its curator in `person.owner_name`**, with no field known to be an artist
   id.~~ **Replaced by the recording (below):** a chart an artist made carries `artist: {id, name}`,
   `person` is its account, and `person.id` is not an artist id.
4. **Pagination is `next`, not `page`.** `page` is a string like `"1/4"`, so it is not read.
5. **The date filter is applied twice.** `artist_tracks`/`label_tracks` send
   `publish_date=from:to` and `order_by=-publish_date`, then keep only tracks inside the window and
   stop at the first page wholly older than it, so the answer is right whether or not Beatport
   honors the filter. The spike reports whether it does.
6. No rate-limit headers appear on unauthenticated answers; the spike records any on real ones.

**Two bugs found and fixed, both in code inCrate uses today.**

- **Creating a Beatport playlist had never worked.** `create_playlist` posted to `my/playlists`
  without its trailing slash; Beatport answers 301 (observed live), `requests` replays a redirected
  POST as a GET, and the GET returned the user's playlist *list*, which has no `id` — so inCrate
  reported "your token may not have playlist write access" for every token. Paths now carry the
  slash, and `post` refuses redirects so a wrong path fails loudly. Pinned by
  `src/tests/regression/test_regression_playlist_post_redirect.py`, which drives a real `requests`
  session against a local server that redirects as Beatport does, and fails on the unfixed code.
- **Every chart's curator read as blank.** The old parser looked for `author`, `user`, `creator` or
  `person.name`; v4 puts it in `person.owner_name`. inCrate's chart branch could therefore match no
  chart. Both chart parsers now fall back to it.

Also found, left alone: inCrate's label-release fallback asks `catalog/labels/{id}/tracks`, a route
that does not exist, so that branch has only ever returned nothing. It retires with inCrate in
DISCOVER-12, and `label_tracks` is the working replacement.

**Fixtures and the recording.** `src/tests/fixtures/beatport_v4/` holds 14 reconstructed files
(invented names and ids; fields the parsers ignore are present to prove they are ignored) and the
one recorded body. Value tests read them for the cases a recording cannot be relied on to contain —
two artists and a remixer, no key and no BPM, a release with no label, a page older than the window.
Agreement tests run over every fixture **and every file in `recorded/`**, checking that the parser
kept exactly what the raw JSON says: every id, the artists in order, label, release, tempo, key. The
spike writes its sanitized recordings to `recorded/` — no email, user, account or token field, and a
playlist's id and name replaced — so once a developer runs it, the parsers are held to real answers
with no test rewritten. The script's sanitizing and a whole run against a fake Beatport built from
the fixtures are tested offline.

**Tests**: 80 in `test_beatport_catalog.py`, 23 new in `test_beatport_api_client.py` (30 in all),
10 in `src/tests/unit/scripts/test_beatport_v4_spike.py`, 3 regression. inCrate's own tests pass
unchanged, as do the engine suite and the Beatport integration tests (1,072 passed, 7 skipped). The
concurrency cap is held by a threaded test of twelve clients; `playlist_url` never contains
`placeholder`; no test reaches the network.

**Checks run**: `python -m pytest src/tests` (full suite), `ruff check src/`,
`ruff format --check src/`, `check_no_qt_in_core.py`, and the strict mypy gate with the two new
modules added to it.

**The recording** (2026-09-23, with the developer's own token, scope `app:docs user:dj`, taken from
Beatport's API documentation page; the token lived ten minutes and was never written anywhere).
Every probe answered, 17 of 17, and the eleven sanitized bodies are committed in
`src/tests/fixtures/beatport_v4/recorded/`. **The reconstructed shapes were right**: the agreement
tests passed over all eleven recordings with no parser change.

| Question left open above | Answer |
| --- | --- |
| Does `catalog/tracks/?id=a,b` filter? | **Yes.** It answered exactly the tracks asked for. `get_tracks`' batched path is the one it takes. |
| Does `publish_date=from:to` filter a listing? | **Yes**, for an artist's tracks (all 4 inside the window) and a label's (23 inside it; 210 without it) and for charts. The client-side window stays as a guard that costs nothing. |
| Does `catalog/charts/?artist_id=` filter? | **No.** Neither `artist_id` nor `artist` does; the answer is the unfiltered listing, item for item. Finding 1 stands. |
| Is a chart's `person.id` an artist id? | **No.** It is the publishing account's (769449 for the artist 1190547). But a chart **does** carry `artist: {id, name, slug}` when a Beatport artist made it, and `null` otherwise — the field the reconstruction did not have. |
| Playlist create and add-track | Both **201**: `POST my/playlists/` with `{"name"}`, then `POST my/playlists/{id}/tracks/` with `{"track_id": …}`, the body the code already sends. A docs-page token has the scope. |
| Rate-limit headers | **None**, on any of the 17 answers. The `Retry-After` handling stays for a 429 that says it. |
| Pagination | `next` is an absolute URL; `page` a string (`"1/1522"`); `count` caps at 10,000. Finding 4 stands. |

**Finding 3 is replaced.** A chart made by an artist names that artist in `artist`, with its
Beatport id, and its `person.owner_name` can be a different name altogether: DJEFF's chart is owned
by "OFFICIALDJEFFMUSIC". So DISCOVER-05's two tests become: a chart counts when **`artist.id` is a
resolved library artist's Beatport id**, or when **`name_key(artist.name)` is a library artist's
key**; `person.owner_name` is only a fallback for a chart no artist made. `beatport_catalog.
chart_artist` reads it, and `ChartSummary` and `ChartDetail` carry it as `artist`.

**Two bugs the recording exposed, both in the parsers inCrate runs on today, fixed:**

- *A chart an artist made was credited to its account*, so inCrate — which matches library artists
  against a chart's author — never found DJEFF's chart for a library holding DJEFF, and `author_id`
  was always `None`. Both parsers now take the author, and its id, from `artist` when there is one.
- *Every chart parsed with no date*: v4's key is `publish_date`, the parsers read `published_date`
  and `published`. `list_charts` keeps an undated chart whatever the window, so its date filter and
  its newest-first sort had never done anything. `chart_publish_date` reads the right key, the old
  ones as fallbacks.

Pinned by `src/tests/regression/test_regression_v4_chart_artist_and_date.py`, which reads the
recorded page and fails four of five on the unfixed parsers.

**And one bug in this step's own commit**: `.gitignore` ignores every `*.json` as user output, so
DISCOVER-01's commit carried the fixtures' README and none of the fourteen fixtures — every test
reading them passed only on the machine that wrote them. An exception now sits beside the file's
others, and `src/tests/regression/test_regression_fixtures_not_ignored.py` asks git, for every file
under `src/tests/fixtures/`, whether it would be committed.

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

**Outcome**: Implemented. `migrations/m0021_discover.py` creates the nine tables, each with a model
beside it: `models/beatport_cache.py` (`CachedBeatportTrack`, `CachedBeatportCredit`,
`BeatportNameLookup`), `models/discovery_run.py` (`DiscoveryRun`, `DiscoveryRunTrack`,
`DiscoveryRunSource`), `models/wantlist.py` (`WantlistEntry`) and `models/track_credit.py`
(`TrackCredit`, `DerivedIndex`). The credit roles are one vocabulary, `CREDIT_ROLES`, shared by the
library's and Beatport's credit tables. All four model modules are in the strict mypy gate. Nothing
reads or writes the tables yet, and a test holds that true until a later step names its repository.
`models/row_values.py` gained four checks that the new models share: `optional_text`,
`optional_iso_date`, `https_url` and `optional_https_url`.

**Where it goes past the design, and why.** Each change is one that a forward-only schema could not
make later without another migration.

- **`discovery_run_sources` references the run's track, not the run.** The design gave it
  `run_id` and `beatport_track_id` separately, which would accept a reason for a track the run
  never listed. It now has one composite reference, `(run_id, beatport_track_id)`, into
  `discovery_run_tracks`, with a cascade. Deleting a run cascades to its tracks, and from them to
  their sources.
- **`matched_on` is `NOT NULL`.** It is the library artist or label that put a source in scope, and
  the writer always knows it. A reason that cannot say what in the library it came from is the
  unnamed signal DEC-074 refuses.
- **`discovery_runs.error_class`**, unchecked. DISCOVER-05 fails a run "with that class", and a
  reopened run has to be drawn from it: a rejected token points to Settings. Parsing that back out of
  `error` text is not reliable. The vocabulary is DISCOVER-01's `BEATPORT_ERROR_CLASSES`, and it is
  not restated in a `CHECK`, for the reason `m0020` left `key_format` unchecked. Tests store every
  class and show that the model defines none of its own.
- **`discovery_runs.id` is `AUTOINCREMENT`**, and every count is `NOT NULL DEFAULT 0`. Runs are
  deleted, and an id in an activity event must not come to name a later run. A run is written when it
  starts, so each count begins at a true zero.
- **`beatport_tracks` and `wantlist` are `WITHOUT ROWID`.** In a rowid table, SQLite answers a `NULL`
  for an `INTEGER PRIMARY KEY` by assigning the next free number, even with `NOT NULL` declared
  (checked on SQLite 3.49.1). A writer that lost a track's id would then store it under an id
  Beatport never gave. With the wantlist, the invented id can even pass the foreign key. Without a
  rowid, a missing id is refused, and integer affinity still stores `'19000001'` as the number.
  `derived_indexes.name` is `NOT NULL` for the same reason, since a text primary key otherwise
  accepts any number of `NULL` rows.
- **The credit indexes are covering.** They are `track_credits (name_key, track_id)`, and
  `beatport_track_artists (artist_id, beatport_track_id)` and `(name_key, beatport_track_id)`. The
  design asked for single-column indexes on `name_key` and `artist_id`, and each of these leads with
  that column. With the track id added, DISCOVER-03's `artist_name` rule reads back as one seek per
  library track that never touches the table:
  `SEARCH track_credits USING COVERING INDEX idx_track_credits_name (name_key=? AND track_id=?)`.
  A single-column index carries the rowid, not the track id, so it could not do that.
- **`discovery_run_tracks (run_id, position)` is a unique index.** A run's tracks are read windowed
  in first-seen order with no sort, and no two tracks can hold the same place.

**What binds later steps.**

1. **A re-read of a catalog track is an upsert** (`INSERT … ON CONFLICT (beatport_track_id) DO
   UPDATE`), never `INSERT OR REPLACE`. The replace deletes the row first, SQLite runs the delete's
   cascade, and the track's credits silently vanish. A test runs both and shows this.
2. **Ownership needs no cast.** `match_candidates.beatport_track_id` is `TEXT`, and the catalog's is
   `INTEGER`. SQLite's numeric affinity makes them compare equal in a join and in `IN (SELECT …)`,
   and a test holds DISCOVER-04's join to that.
3. **A catalog row that a run or the wantlist holds cannot be deleted**, so a cache prune has to
   name only rows that nothing holds. A test runs the prune statement that does that.
4. **A run left with no outcome by a crash stays "running"** until something closes it; the schema
   cannot tell a live run from a dead one. DISCOVER-05 closes any open run at engine start, as
   `JobRepository.mark_interrupted` closes jobs: `failed`, with an error saying CuePoint stopped
   before the run finished, and an outcome and an end time together, which the model requires.
   What the run committed before the crash is kept. No `interrupted` outcome is needed for this, so
   the vocabulary has none.
5. **`DerivedIndex.is_current` is exact equality.** An index built by any other rule version answers
   wrongly for the running engine, so a downgrade rebuilds too.
6. **Nothing in the schema records when an artist's or label's listing was last fetched.** The
   design left that out on purpose, since nothing stores a page. If DISCOVER-07 needs "this listing
   is complete as of", it keeps that outside this schema or adds it in a migration of its own.

**Tests**: 370 in `src/tests/unit/persistence/test_discover_schema.py`:

- **Shape:** columns in order, and each model exactly its table.
- **Statements:** the migration's SQL is only `CREATE`s of its own tables and indexes.
- **Indexes:** the exact indexes, and every reference leading one. The query plans cover the credit
  rule, the name and artist lookups, a label's cached tracks, and a run read in order with no sort.
- **References:** the whole reference map, and each cascade, `SET NULL` and refusal.
- **Vocabularies:** each `CHECK` read out of `sqlite_master` and compared with the model's constant.
- **Columns:** `NOT NULL` column by column.
- **Ids:** a missing Beatport id is refused rather than invented.
- **Upsert:** the upsert against `INSERT OR REPLACE`.
- **DISCOVER-01 agreement:** every `CatalogTrack` field has a column, and the fixture track (two
  artists, one accented, and a remixer) is stored and read back through the models.
- **Models:** every model round-trips a real row, and every refusal is tested.
- **Upgrade:** a populated version-20 library, with tracks, overrides, a Collection, an accepted
  match, an export record and an activity event, keeps every row. It ends with the same schema as a
  fresh one, still browses and deletes tracks, and takes every new row straight away.

Three deliberate breakages were each caught by behaviour tests and not only by the DDL-text tests:
dropping the composite reference, dropping `WITHOUT ROWID`, and narrowing the credit index.

**Measured**: applying `m0021` to a copy of a 50,000-track version-20 library (20.4 MB, with a
`track_metadata` row per track) took a median of **6.4 ms** over five copies, with a maximum of
7.4 ms. The budget was one second.

**Checks run**: `python -m pytest src/tests` (full suite), `ruff check src/`,
`ruff format --check src/`, `check_no_qt_in_core.py`, the strict mypy gate, and `git diff --check`.

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

**Outcome**: Implemented. The two name functions, the credit index and the label keys, maintained
where tracks are written and rebuilt when the rule changes, and two rule fields that the filter bar,
facets and Smart Collections read like any other field.

**What was built.**

- **`core/entity_names.py`**: `name_key` and `split_credit`, with `ENTITY_NAMES_VERSION = 1`. The
  module imports nothing from CuePoint.
  - **Accents are folded only on Latin letters.** Taken literally, "NFKD, accents stripped" merges
    what a reader sees as two different letters: Japanese "ガ" becomes "カ" and Cyrillic "й" becomes
    "и". Folding a combining mark only when the letter under it is Latin unites "Âme" and "Ame"
    (DEC-095) and leaves other scripts alone.
  - **A name made only of punctuation keeps it.** "!!!" has the key "!!!", so no non-empty name
    gets an empty key.
  - **`split_credit` also splits at semicolons**, the separator tag editors write between several
    values.
  - **A featuring marker splits only with an artist on both sides**, so an act called "Feat Lux"
    or "Soft Feat" stays whole.
  - **Both functions are cached (bounded at 65,536 entries), since they are pure.** Uncached, keeping
    the index added 1.5 s to a 50,000-track import. Cached, it adds 0.21 s (below).
  - **A pinned table of answers holds the version.** A test fails if either function's answers
    change while `ENTITY_NAMES_VERSION` stays the same.
- **`persistence/track_credit_repository.py`**, the one module that runs SQL on `track_credits` and
  `derived_indexes`.
  - `write_credits` and `label_key_of` are called inside the transactions of `TrackRepository` (on
    `add`, `add_many` and `update`, and in both upserts) and of `TrackMetadataRepository._set`. An
    import, a refresh apply, a revert and a label override therefore commit a track and its derived
    rows together.
  - An update rewrites credits only when the artist or remixer text changed. `None` and `""` count as
    the same empty credit.
  - `rebuild_chunk` reads a run of tracks and writes their credits and label keys in one
    `BEGIN IMMEDIATE` transaction.
- **`services/credit_index_service.py`** rebuilds 2,000 tracks per chunk. It can be cancelled
  between chunks and reports progress. It records both derived indexes, `track_credits` and
  `label_keys`, only after the last chunk, so a cancelled rebuild runs again at the next start.
- **`engine/credit_index_jobs.py`** registers the job type `credit_index`.
  - `start_credit_index_if_stale` runs at engine start, after migration. It never raises and starts
    nothing when the index is current.
  - The job refuses to start beside any `LIBRARY_JOB_TYPES` job, as specified. An import may start
    while a rebuild runs, because chunks are atomic under the write lock.
  - The status strip says **Indexing artists and labels**.
- **Rule fields.** A new field type, `name`, with the operators `is`, `is_not` and `any_of`. A rule
  keeps the name as typed, trimmed and never blank, and the query builder binds its `name_key`.
  Because `name_key` is idempotent, a rule may carry either a name or a key.
  - **`artist_name`, "Credited artist":** any artist or remixer credit, over `track_credits`.
  - **`label_name`, "Label, any spelling":** the effective label (DEC-068), compared by
    `COALESCE(meta.label_key, tracks.label_key)`.
  - `FieldSpec.display` is what a facet shows beside a key: the first spelling alphabetically, the
    existing facets' `min()` rule.
- **Facets.** Both fields are facetable through the Library's existing facet endpoint.
- **The renderer.** `name` joins the field-type union in `cuepointBridge.types.ts` and
  `engineClient.ts`, and `desktopContract.test.ts` pins it. The filter bar's free-text control, with
  the facet as suggestions, is exactly the right control, so `test_filter_bar_contract` counts `name`
  with `text` and `date`. The status strip has the job's verb.
- **Docs.** The Library user guide and the changelog describe the two filters.

**The two measured choices, at 50,000 tracks.**

- **`artist_name` uses the set shape, not the specified `EXISTS`.** "Is" takes 0.0 ms as
  `tracks.id IN (SELECT track_id … WHERE name_key = ?)` against 19.5 ms as a correlated `EXISTS`.
  "Is not" takes 6.7 ms against 20.4 ms. The tag rules already use the set shape.
- **`label_name` uses stored key columns (migration `m0022_label_keys`), not a SQLite function.**
  "Is" took 13.0 ms against 31.5 ms, and the facet 44.7 ms against 71.4 ms. The plain `label` rule
  takes 12.6 ms, so the new rule costs no more than the old one. The migration adds
  `tracks.label_key` and `track_metadata.label_key`, and the two repositories write each key in the
  same statement as its label. It adds no index: the effective key spans two tables, so no single
  index serves it.

**Measured through the real code** (50,000 tracks, 75,803 credits, 1,200 labels, 10,000 label
overrides, medians of seven runs):

| What | Time |
| --- | --- |
| Backfill (`CreditIndexService.rebuild`) | 0.94–1.34 s |
| Import through `upsert_many_from_rekordbox` | 1.97 s, against 1.76 s without the credit writes |
| `artist_name is`: count / first page | 0.1 ms / 0.9 ms (51 tracks) |
| `artist_name is_not`: count / first page | 6.8 ms / 1.5 ms |
| `artist_name any_of` (three names): count / first page | 0.1 ms / 1.6 ms |
| `label_name is`: count / first page | 19.8 ms / 41.2 ms (39 tracks) |
| `label_name is_not`: count / first page | 21.0 ms / 1.5 ms |
| `artist_name` facet: whole library / narrowed by a BPM rule | 93.4 ms / 122.3 ms |
| `label_name` facet: whole library / narrowed | 97.1 ms / 64.8 ms |

When nothing narrows the view, the credited-artist facet skips its scope filter. The tag facet
already did this, and it took the whole-library facet from 143 ms to 93 ms.

**Where it differs from the specification, and why.**

- **"A, B & C" credits "A" and "B & C".** The specification's rule does not split on `&`
  ("Above & Beyond"), but one of its example tests expects `artist_name is B` to find "A, B & C".
  The two contradict each other. The rule wins, since it errs by not grouping (DEC-095), and a test
  pins the choice. Once a track is resolved (DISCOVER-04), Beatport's own artist list settles such
  cases.
- **Accents on non-Latin letters are kept** (see above).
- **`any_of` is allowed on both fields.** A Smart Collection of "tracks by any of these artists" needs
  it, and it compiles to the same one-seek set.
- **`EXISTS` became the set shape, as measured above.**
- **The rebuild does not block imports**, for the reason given above. Refusing an import during the
  second a start-up rebuild takes would make a user wait for work they did not start.

**Two bugs found and fixed.**

- **Migration tests could no longer build old databases.** Seven migration test files filled a
  version-8-to-20 database through today's `TrackRepository`, which now writes columns and a table
  those versions lack. They now insert through `tests/fixtures/legacy_rows.py`, which writes only
  the columns a table has at its version. Three "no row changes" tests now migrate only up to their
  own migration, so a later migration's new column doesn't read as a changed row.
- **A race in two engine test fixtures, present before this step.** An import sets its own terminal
  state before it starts its follow-up file check, so "every job has finished" was briefly true too
  early. The Rekordbox-export preview test then read the library in that gap: it reported no file
  check over the wire, and three missing files when read directly a moment later. It failed once in
  the combined engine run. `tests/fixtures/job_settling.wait_until_settled` also waits for the job
  threads, and only a running job thread can start a follow-up.

**What binds later steps.**

1. **Facets stop at 1,000 values** (`FACET_LIMIT_MAX`). The test library above has 1,695 credited
   names, so DISCOVER-05's "the `artist_name` facet" cannot be the scope as written. The scope needs
   a repository read of every distinct key, or paging, not the capped facet.
2. **Until the first rebuild finishes, the index is incomplete** on a library upgraded from before
   this step: about a second at start-up, at 50,000 tracks. `ICreditIndexService.is_current()` says
   whether it is complete. DISCOVER-07 can draw a "still indexing" state from it rather than a
   short list.
3. **A change to either name function is a bump of `ENTITY_NAMES_VERSION`**, and no migration. The
   pinned-answer test enforces it.
4. **`label_key` belongs to the repositories.** Any new writer of `tracks.label` or
   `track_metadata.label` must write it too. Today only the two repositories write either column,
   and `LABEL_KEY_COLUMN` names it.

**Tests**:

- 71 in `src/tests/unit/core/test_entity_names.py`.
- 80 in `src/tests/unit/persistence/test_library_names.py`, covering:
  - every write path, including the import upsert, a relink, a revert and a label override;
  - a refresh that changes only the BPM, which leaves a sentinel credit untouched;
  - both rules, and every facet value's count equal to its rule's count;
  - a Smart Collection finding what the filter finds;
  - the rebuild producing exactly the write path's rows, plus version bumps, cancelling and
    progress.
- 19 in `src/tests/unit/engine/test_credit_index_jobs.py`, including a real import job and a real
  rebuild.
- 10 new in `test_filter_rule.py`.
- 5 new FilterBar tests and 1 status-strip test in the renderer.
- The DISCOVER-02 schema test now names the credit repository as the one module allowed to run SQL
  on `track_credits` and `derived_indexes`.

**Checks run**:

- **Python:** `python -m pytest src/tests` (full suite), `ruff check src/`,
  `ruff format --check src/`, `check_no_qt_in_core.py`, and the strict mypy gate with the four new
  modules and `models/filter_rule.py` added to it.
- **Renderer:** `npm test` (2,783), `npm run lint` and `npm run typecheck`.
- **Electron:** `npm test` (446), `npm run typecheck` and `npm run build`.
- **Repository:** `git diff --check`.

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

**Outcome**: Implemented. "Owned" is written once, as a view, with a Python copy of the rule that a
test holds to it. A job reads the Beatport tracks the library owns into the catalog cache, and a
second view says who each library track is by on Beatport, and on which label.

**What was built.**

- **Migration `m0023_beatport_identity`**, two views and nothing stored:
  - `library_beatport_tracks (track_id, candidate_id, beatport_track_id)` is DEC-092's rule. It has
    one row per library track whose match is accepted, automatically or by the user. The id comes
    from the accepted candidate's `beatport_track_id`, or, when that is not an id, from the
    `/track/<slug>/<id>` in its URL. A track with neither has no row.
  - `library_beatport_credits (track_id, beatport_track_id, kind, role, position, beatport_id, name,
    name_key)` is DEC-095's identity. It has one row per Beatport artist or remixer credit on each
    owned track that has been read into the cache, and one row for its label.
- **`services/beatport_ownership.py`** holds the rule in Python (`accepted_beatport_track_id`,
  `beatport_id`, `url_beatport_id`), the fragment later steps join (`owned_beatport_ids_sql()`,
  which selects from the view), and `is_owned`.
- **`persistence/beatport_catalog_repository.py`** is the one module that runs SQL on
  `beatport_tracks` and `beatport_track_artists`, and the reader of both views.
  - `upsert_tracks` stores a batch in one transaction as an `ON CONFLICT DO UPDATE`, and rewrites
    each track's credits in the same transaction (DISCOVER-02's first binding note).
  - `catalog_rows` is the one mapping from DISCOVER-01's `CatalogTrack`. The label and each credit
    are keyed by DISCOVER-03's `name_key`, so a Beatport name and a library name compare.
  - It also has `get_tracks`, `credits`, `owned_among`, `resolve_plan` and `library_credits`.
  - `LibraryBeatportCredit` models a view row.
- **`services/beatport_resolve_service.py`** reads every owned Beatport track that the cache has
  no row for, or a row older than `RESOLVED_TRACK_MAX_AGE` (30 days). It asks for
  `RESOLVE_BATCH_SIZE` (100) at a time through `get_tracks`, and each batch is its own
  transaction. It checks for a cancel between batches.
  - It stops at the first refusal that every later request would repeat: `no_token`, `rejected`,
    `forbidden`, or `rate_limited` after the one `Retry-After` the client honours.
  - It also stops after `MAX_CONSECUTIVE_FAILURES` (3) failed batches in a row. A batch that
    succeeds resets the count.
  - It records one activity event, `discover.beatport.resolved`, with its counts and outcome.
    The feed shows it whatever the outcome, including "up to date".
- **`engine/beatport_resolve_jobs.py`** registers the job type `beatport_resolve`.
  - `start_beatport_resolve_job` asks `require_token()` first. With no token it raises the
    `no_token` refusal, and no job is created.
  - A failure's class goes in the job's result, and its code is `BEATPORT_<CLASS>`.
  - The job conflicts only with itself.
  - The service is built per job, so its client carries the token configured when the job
    starts.
- **`require_token()`** was added to `BeatportApiClient` and `BeatportApi`. It is an extension
  inCrate does not use.

**Where it differs from the specification, and why.**

- **The one definition is a view, not a fragment built in Python.** The identity view has to join
  owned tracks by the same rule, and a second copy of the rule in SQL text is what fact 3 forbids.
  The view is that copy's only place. `owned_beatport_ids_sql()` selects from it. A migration's SQL
  never changes once shipped, so a change to the rule is a new migration that replaces the view.
  `m0016` did the same for duplicate signals.
- **A Beatport id is the plain decimal of a positive 64-bit integer**, tested by casting the text to
  an integer and back. So `"0123"`, `" 123"`, `"12abc"` and a 20-digit number are refused, and fall
  back to the URL. SQLite answers the test with no regular expression, and Beatport has never
  written any of the refused forms. It is also faster. At 50,000 accepted matches, reading every
  owned id takes 21 ms this way, against 57 ms with the `GLOB` checks it replaced. Nesting the URL
  parse in a scalar subquery means it runs only for the rare candidate with no usable stored id.
- **The SQL for `is_owned` is in the repository.** `test_persistence_boundary` forbids a service
  from touching the database. The service module keeps the rule, the fragment and `is_owned`, and
  `is_owned` delegates.
- **Some refusals stop the job at once**, before three failures. The specification named only the
  consecutive-failure stop. But a rejected token fails every later request the same way, and
  repeating a rate-limited request only extends the limit.
- **A track Beatport no longer has is asked about again on the next resolve.** The schema has no
  place to record that a track is gone (DISCOVER-02), and in a batch the question costs no extra
  request.

**Measured** (median of five, against the fake Beatport of the tests, so this is CuePoint's own
work; wall-clock time is its round trips on top):

| What | Result |
| --- | --- |
| Resolve 10,000 accepted tracks, batched | 0.88 s, **100 requests** |
| The same with the batched filter refused | 0.91 s, 10,001 requests (the refused one, then one per track) |
| A second resolve within the age | 20 ms, **no requests** |

At 50,000 library tracks with 45,000 accepted matches, 50,000 cached tracks and two credits each,
the two views answer as follows:

| Query | Time |
| --- | --- |
| Every owned id (`count(*)` over the view) | 21.4 ms |
| `owned_among` for 500 ids | 32.4 ms |
| 500 catalog ids filtered by `IN (owned_beatport_ids_sql())` | 57.1 ms |
| A Beatport artist's library tracks, by id | 39.4 ms |
| A Beatport label's library tracks, by id | 50.5 ms |
| One window's identity (100 library tracks) | 0.8 ms |
| `resolve_plan` (nothing stale) | 53.2 ms |

The owned id is computed from each accepted candidate, so no index can serve it, and every question
about many tracks scans the accepted matches once. One window's identity starts from its track ids
and reads each row by key.

**What binds later steps.**

1. **Ownership is read, never re-derived.** DISCOVER-05's run window, DISCOVER-06's wantlist and
   playlist push, and DISCOVER-07's pages join `owned_beatport_ids_sql()` or call `owned_among`.
   Each costs a scan of the accepted matches, 20–60 ms at 50,000, so each statement should
   reference it once.
2. **DISCOVER-07's `beatport_artist` and `beatport_label` rule fields** read
   `library_beatport_credits` with `kind` and `beatport_id`, at 39–51 ms per statement at 50,000.
   A page's count, window and facets are several statements, so DISCOVER-07 measures the page
   whole. If the page is too slow, the fix is an index on an expression over `match_candidates`,
   not a stored copy of the id.
3. **Every catalog write goes through `BeatportCatalogRepository.upsert_tracks`**, DISCOVER-05's
   found tracks included, so every label and credit key is written the same way. `fetched_at` is
   `datetime.now(timezone.utc).isoformat()`, and the plan compares it as text.
4. **The job has no route yet.** DISCOVER-09 adds `resolve/start`. It must turn the `no_token`
   refusal into a value, and add `beatport_resolve` to the status strip's `JOB_VERBS` with
   `PROGRESS_MESSAGE`. A test holds that nothing but the job module starts the job, so the route
   is the only caller it gains.
5. **Linking a name group to an id** (DEC-095's last implication) is a join on the same library
   track: `track_credits.name_key` against `library_beatport_credits.name_key`, where the credit
   carries a `beatport_id`. DISCOVER-07 writes it.

**Tests**:

- 58 in `src/tests/unit/services/test_beatport_ownership.py`:
  - the rule, case by case;
  - the view and the Python agreeing on every case (automatic and user accepts, rejected, needs
    review, no match, a stored id with and without a URL, a URL with none, ids that are not ids,
    and a state resting on a candidate other than the winner);
  - the two agreeing again on 3,000 generated ids and URLs;
  - `is_owned` over more ids than a statement carries;
  - ownership following a reject, a new candidate and a deleted track;
  - the real accept and reject path through `MatchStateService`.

  Breaking the Python rule on purpose, by letting a leading zero through, fails the generated-ids
  test.
- 40 in `src/tests/unit/persistence/test_beatport_catalog_repository.py`:
  - the mapping against the fixture and every recorded track;
  - a re-read that updates in place, rewrites credits and keeps the wantlist entry that references
    the track;
  - a refused track left out while the rest are stored, and a batch that fails storing nothing;
  - the plan (missing and stale, each id once, only owned tracks);
  - identity following a reject and a new candidate at once;
  - the model's refusals, the migration applied alone to a version-22 library, and the query plans.
- 36 in `src/tests/unit/services/test_beatport_resolve_service.py`, over DISCOVER-01's real
  `BeatportApi` with a fake HTTP client that counts requests:
  - 1,000 tracks in 10 requests, one row each;
  - reuse within the age, and a re-read after it;
  - a cancel between batches, with the next resolve finishing the job;
  - the failure limit, and a success resetting it;
  - 401, 403 and 429 stopping at once;
  - no token;
  - not found, not asked and unreadable answers;
  - the per-track fallback, and the activity event.

  The 10,000-track measure is marked slow.
- 14 in `src/tests/unit/engine/test_beatport_resolve_jobs.py`, through the real job store and
  container:
  - refusal before the job exists, including with the container's own client and no token
    configured;
  - success, failure classes, cancel, and exclusivity;
  - running beside an import;
  - nothing but the job module starting it.
- 3 new in `test_beatport_api_client.py`, for `require_token`.
- DISCOVER-02's ownership test now names the repository as the owner of the two catalog tables.

**Checks run**: `python -m pytest src/tests` (full suite), `ruff check src/`,
`ruff format --check src/`, `check_no_qt_in_core.py`, the strict mypy gate with the three new
modules added (`persistence/` and `migrations/` were already in it), and `git diff --check`.

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
- **Chart curators compare by the chart's artist.** A chart counts when its `artist.id` is a resolved
  library artist's Beatport id, or when `name_key(artist.name)` is a library artist's key; a chart no
  artist made falls back to `name_key(person.owner_name)`. DISCOVER-01's recording showed `artist`,
  and that an account's name can differ from its artist's. inCrate compared lowercased strings.
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

**Outcome**: Implemented. inCrate's algorithm now runs over the library as a job. Every run is kept
with its scope, its tracks in the order found, and every reason each was found. Ownership is
computed when a run is read.

**What was built.**

- **`services/discovery_service.py`**:
  - `DiscoveryService.request` fills in inCrate's defaults: `incrate.discovery_genre_ids`,
    `incrate.new_releases_days`, and the last 30 days of charts. It refuses what a run cannot use
    (bad genre ids, a window that ends before it starts or is over 366 days, 0 days). Days are
    counted in the user's local date, as inCrate's `date.today()` counted them; timestamps stay
    UTC.
  - `DiscoveryService.run` resolves the scope once and stores the run before asking Beatport
    anything. It then reads charts, resolves labels and reads releases, and ends the run as
    `succeeded`, `cancelled` or `failed`, whatever happens, including a bug.
  - The service also reads runs back: `list_runs`, `get_run`, `run_tracks`, `delete_run` and
    `close_interrupted`.
- **`persistence/discovery_repository.py`** is the one writer of `discovery_runs`,
  `discovery_run_tracks`, `discovery_run_sources` and `beatport_name_lookups`.
  - `record_found` commits catalog rows, new tracks at the next positions, every reason
    (`INSERT OR IGNORE`, so none twice) and the run's counts in one transaction. The catalog rows
    go through `beatport_catalog_repository.store_catalog_tracks`, extracted so that module keeps
    the catalog's SQL.
  - Counts that break the run's rules roll the whole write back, and an ended run takes no more
    writes.
  - `run_tracks` reads a window with ownership from DISCOVER-04's `owned_beatport_ids_sql()`, which
    SQLite builds once per statement. It filters owned tracks (`hide`, the default, `only` or
    `all`) and sorts by found order, release date, artist or title, with missing values last and
    ties in found order. Each row carries its artists, remixers and reasons, and each page carries
    `total`, `tracks`, `owned` and `hidden`.
- **The scope reads** are in `TrackCreditRepository`, which owns the credit index they read:
  - `library_artists` and `library_labels` give every credited name and every effective label, the
    override where there is one. Each is read whole, since facets stop at 1,000 (DISCOVER-03's
    first binding note), and spelled as its facet spells it.
  - `artist_ids_by_key` and `label_ids_by_key` give the Beatport ids resolution linked to them.
- **`engine/discovery_jobs.py`** registers the job type `discovery`.
  - `start_discovery_job` refuses with no token (`no_token`) or an unusable request (`ValueError`),
    and in both cases creates no job and no run.
  - The job is exclusive with itself only. Its progress names the stage (**Reading charts**,
    **Resolving labels**, **Reading releases**).
  - A failed run's job code is `BEATPORT_<CLASS>`, or `DISCOVERY_FAILED`, and the result carries
    the run's id, outcome and counts.
  - `run_engine` calls `close_interrupted_discovery_runs`, which never raises. It ends any run the
    last engine left open as failed, "CuePoint stopped before the run finished", keeping its
    tracks.
- **A chart listing that keeps what discovery needs.** DISCOVER-12 deletes the legacy chart parsers,
  so new code must not rest on them. So the step adds `CatalogChart` (id, name, web URL,
  publish date, `artist`, `owner_name`, genre ids, track count), `parse_catalog_chart`, and
  `BeatportApi.charts(genre_id, since, until)`. The date window and the genre are applied on our
  side as well as sent, since the recording never showed `genre_id` being honoured. The listing
  pages up to `MAX_LISTING_PAGES`. Discovery also uses `chart_tracks`, `label_tracks` and
  `search_label_by_name`.
- **The failure policy is shared.** `REPEATING_ERROR_CLASSES` and `MAX_CONSECUTIVE_FAILURES` (3)
  moved into `beatport_api_client.py`, and the resolve job and discovery both read them.

**How a run decides.**

- **Artists.** A chart made by a Beatport artist counts for the library artist resolution linked
  that artist's id to. It also counts for a library artist with no linked id whose key the chart
  artist's name has. A chart no artist made counts by its account's `owner_name`.
- **Linking an artist id.** An id is linked to a library artist when the same library track
  credits that name and its accepted Beatport track credits that id under the same key. So "A, B"
  resolved to A and B links A's id to A alone.
- **Labels.** A label uses the id resolution linked to it: the Beatport label most of its resolved
  tracks are on, with ties going to the lower id. So "Nightfall" in the library links to
  Beatport's "Nightfall Audio".
  - Without a link, the name-lookup cache answers. A found id is kept for good, since Beatport's
    ids do not change. "Not found" is trusted for 30 days (`NOT_FOUND_LOOKUP_MAX_AGE`).
  - Only a miss calls `search_label_by_name`, and its answer, "not found" included, is stored.
  - A search that failed is not stored, so the next run asks again.
- **Commits.** Findings are held and committed at most once a second (`FLUSH_INTERVAL_SECONDS`)
  or every 1,000 tracks (`FLUSH_TRACKS`). A cancel or failure commits what it holds before the
  run ends, so it keeps everything; a crash loses at most a second.

**Where it differs from the specification, and why.**

- **A library artist known by id is not matched by name.** The specification says a chart counts
  by `artist.id` *or* by name. But DEC-095 makes a known id the identity, and with the "or" a chart
  by a different artist of the same name would count. A test holds this, and allowing the "or"
  fails it.
- **inCrate's retry across all genres is not ported.** When the chosen genres gave no chart
  tracks, inCrate read charts from every genre, genres the user had not chosen.
- **`None` means the whole library, and an empty selection means none.** In inCrate an empty list
  meant all, so there was no way to say "no artists".
- **Discovery commits about once a second, not once per chart or label.** One commit per unit
  spent 4.4 s of a 5.7 s mocked run waiting on the disk (measured below). A cancel or failure
  still keeps every finding.
- **A release reason has no link.** Beatport's listing gives a release's slug, but DISCOVER-01's
  `CatalogTrack` does not keep it. Adding a field would break DISCOVER-02's rule that every parsed
  field has a column. The track keeps its own link, and the reason names the release.
- **Only a matching chart costs a second request.** A chart listing carries the artist, where
  inCrate read every chart's detail to find it. Against the same world, discovery makes fewer
  requests than inCrate, and a test holds that.

**Measured** (median of three, at 50,000 library tracks with 1,700 credited artists and 1,200
labels). Beatport is mocked: 1,000 of the labels are on it with recent releases, and two genres
have 400 charts each, 100 of them by library artists. The times are CuePoint's work plus the
fake's, without network time:

| Run | Time | Requests |
| --- | --- | --- |
| First | 1.93 s | 2,708: 8 chart listings, 100 chart track lists, 1,600 label searches (one per found label; three for each of the 200 that are not on Beatport), 1,000 label track lists |
| Second | 0.73 s | 1,108: no label searches |

Batching commits took these from 6.0 s and 4.9 s. The library reads a run starts with take:

| Read | Time |
| --- | --- |
| `library_artists` | 112 ms |
| `library_labels` | 47 ms |
| `artist_ids_by_key`, with 40,000 resolved tracks | 229 ms |
| `label_ids_by_key`, with 40,000 resolved tracks | 82 ms |

The first window of a 6,505-track run takes 7 ms, on a library with no accepted matches; at
40,000 it took 98 ms, which DISCOVER-06 found and cut to 34 ms, and DISCOVER-07's index to
13–15 ms. Against the real API, a run is bounded by its
round trips: 1,108 requests is several minutes at typical latency, and the first run's label
searches are paid once.

**What binds later steps.**

1. **DISCOVER-09's `runs/start`** calls `start_discovery_job`. It must turn the `no_token`
   refusal and the `ValueError` into values, and add `discovery` (and DISCOVER-04's
   `beatport_resolve`) to the status strip's `JOB_VERBS`. The stage is the progress's
   `status_message`. A test holds that nothing else starts a run.
2. **`runs/{id}/tracks`** is `run_tracks`: windows of 1 to 500, the four sorts, the three owned
   filters, and every page's `hidden` count. `params_json` is not in the job result, since it
   holds the whole scope. The run header reads it with `get_run`.
3. **DISCOVER-06's wantlist and playlist push** read catalog rows the run already wrote. A track
   found by a run always has one, because `record_found` writes the two together.
4. **A run's scope is in its `params_json`**: `artists` and `labels`, each with `picked`,
   `count`, `linked_ids` and `scope` (key and name). DISCOVER-10 draws "what this run looked for"
   from it.

**Tests**:

- 74 in `src/tests/unit/services/test_discovery_service.py`, over a real library and DISCOVER-01's
  real `BeatportApi`, answered by `tests/fixtures/beatport_world.py`, an in-memory Beatport that
  serves inCrate's legacy routes and the new ones from the same data. They cover:
  - **the request:** defaults, config and refusals;
  - **a run:** found order, every reason, counts, the scope as recorded, stages, the activity
    event and the catalog rows;
  - **parity with inCrate's own `run_discovery`:** the same tracks in the same order, plus the
    two reasons it dropped, in fewer requests;
  - **labels:** no label searches on a second run, "not found" trusted for its age, a label
    linked by resolution, a failed search not stored, an override read as the label;
  - **identity by id, name and account**, and **the scope**;
  - **stopping:** a cancel mid-releases, a 401 keeping rows, a 403 or 429 stopping at once, three
    failures in a row, one failure skipped, no token, a bug still ending the run;
  - **ownership:** hidden and counted, and a match accepted after the run read as owned;
  - **reading runs**, and **the commit policy**.
- 45 in `src/tests/unit/persistence/test_discovery_repository.py`: positions, reasons, refused
  tracks, counts, rollbacks, ended runs, closing interrupted runs, windows, sorts, the plan,
  lookups, and the library scope and link reads.
- 17 in `src/tests/unit/services/test_beatport_charts.py`: the chart parser over every recorded
  chart and DJEFF's, refusals, and the listing's window, genre, cap and order.
- 16 in `src/tests/unit/engine/test_discovery_jobs.py`, through the real job store and
  container:
  - refusals before a job exists, success, a rejected token, bugs and a run that cannot start;
  - cancel, exclusivity, and running beside an import;
  - closing interrupted runs, including through `run_engine`;
  - nothing but the job module starting a run.
- DISCOVER-02's ownership test names the new repository as owner of its four tables and the only
  other reader of the catalog. A new test per table holds that only the owner writes it.

**Checks run**: `python -m pytest src/tests` (full suite), `ruff check src/`,
`ruff format --check src/`, `check_no_qt_in_core.py`, the strict mypy gate with the two new
modules added, and `git diff --check`.

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

**Outcome**: Implemented. The wantlist keeps Beatport tracks with a note and a bought mark, owned
computed when it is read. A push creates a Beatport playlist through the API as a job, skipping
owned tracks unless asked, and reports the real URL.

**What was built.**

- **`persistence/wantlist_repository.py`** is the one reader and writer of `wantlist`.
  - `add` stores new catalog rows and entries in one transaction, through
    `store_catalog_tracks`. It never touches an entry already there: not its note, its bought
    mark or when it was added. It leaves out an entry whose track has no catalog row.
  - `remove`, `set_note` and `set_bought` change only what is asked. Marking an entry bought
    again keeps the moment it was first marked.
  - `page` reads a window, sorted newest first by default, or by release date, first artist or
    title, with missing values last and ties by id. Each row carries its track, credits and
    `owned`. Each page carries `total`, `entries`, `owned` and `bought`.
  - Every write joins a transaction its caller holds.
- **`services/wantlist_service.py`**:
  - `add(ids, run_id=None)`: from a run, every track must be one the run found. An id the cache
    lacks is read from Beatport in one batched request, outside the transaction, and stored with
    its entry. A track Beatport does not have is reported as `not_found`. A read that fails raises
    with its class and adds nothing, and an add needing no read works with no token.
  - `remove`, `set_note` (trimmed; `None` or blank clears; at most `MAX_NOTE_LENGTH`, 1,000
    characters) and `set_bought(ids, bought)`.
  - Each returns a `WantlistChange`: what changed, what was already as asked, what is not on the
    list, what Beatport does not have, and a sentence. Adding an entry that exists changes nothing
    and says "Already on the wantlist".
  - Each change writes one activity event (`discover.wantlist.added`, `.removed`, `.noted`,
    `.bought`, `.unbought`) **inside the change's own transaction**, so an event that cannot be
    written undoes the change (DEC-008). No `track_history` row is written.
- **`services/beatport_playlist_service.py`**:
  - `plan(ids, name=None, include_owned=False)` decides before a job exists which tracks go and
    which are skipped as owned. The default name is inCrate's, from
    `incrate.playlist_name_format`, in the user's own date. A push that would add nothing because
    every track is owned is refused, rather than creating an empty playlist.
  - `push(plan)` creates the playlist, adds each track in order, checks cancel before the create
    and before each track, and returns a `BeatportPlaylistResult`: added, the failed ids,
    skipped-as-owned, not attempted, and the playlist's id and URL.
  - One activity event per push, `discover.playlist.pushed`, whatever the outcome, carrying the
    URL once a playlist exists.
- **`engine/beatport_playlist_jobs.py`**: job type `beatport_playlist`, exclusive with itself.
  - `start_beatport_playlist_job` refuses with no token (`no_token`) or an unusable push
    (`ValueError`); either way no job exists and nothing is asked of Beatport.
  - Progress names the stage: **Creating the Beatport playlist**, then **Adding tracks to the
    Beatport playlist**.
  - A failure's code is `BEATPORT_<CLASS>`, or `BEATPORT_PLAYLIST_FAILED` when Beatport named no
    playlist. A push where some tracks failed succeeds, with the failures in its result.
- **A 403 on create is refused as `forbidden`**: "Beatport refused to create a playlist (403): the
  token may not have playlist scope". There is no fallback (DEC-099).
- **A run's window says which tracks are on the wantlist** (`RunTrackRow.on_wantlist`), which
  DISCOVER-10's run table shows. It asks through `wantlist_repository.listed_ids_sql`, so the
  SQL over the table stays in its module.
- **The catalog is read one way beside other rows.** `beatport_catalog_repository` now exports
  `CATALOG_TRACK_COLUMNS`, `credit_names` and `first_artist_key_sql`, and the run window's copies
  of them are gone. So `discovery_repository` no longer runs SQL against `beatport_track_artists`,
  and DISCOVER-02's ownership test says so.
- **`requested_track_ids`**, in `beatport_ownership.py`, is the one check for Beatport track ids
  from outside the engine. They must be whole numbers from 1 to `MAX_BEATPORT_ID`, not booleans or
  text, one to a limit, each asked about once. The wantlist and the push both use it, with
  `MAX_CHANGE` and `MAX_PLAYLIST_TRACKS` of 10,000.

**Where it differs from the specification, and why.**

- **`playlist_writer.py`'s API path is not reused.** It has no cancel, no error classes, no stop
  rule and no URL check, and it retires with inCrate. The job calls the two `BeatportApi` methods
  that path wraps, the ones DISCOVER-01 fixed.
- **The four filters are two independent ones.** Bought and owned are each `all`, `only` or
  `hide`, the words a run's owned filter uses. That gives the four filters the specification
  names, and their combinations. "Bought and not owned yet", the case DEC-093 names, is
  `bought="only"`, `owned="hide"`.
- **An add from a run must name tracks that run found.** Otherwise an entry would say it came
  from a run that never listed it.
- **A refusal about the track does not count toward stopping.** A 404 for an id Beatport does
  not have, or a 400, shows that Beatport is answering. It is reported and skipped, and it resets
  the failures-in-a-row count. The shared policy still applies to everything else: a rejected
  token, a missing scope or a rate limit stops at once, and three other failures in a row stop the
  push.
- **A push of only owned tracks is refused before its job**, as above.
- **The wantlist's events are atomic with their change; the push's event is best-effort.** A
  wantlist change can be rolled back with its event, and DEC-008 says it must be. A playlist that
  exists on Beatport cannot be rolled back, so a feed that cannot be written must not fail the
  push.

**A slow query found and fixed, in DISCOVER-05's run window as well as here.** The ownership view
computes every accepted match's id, so no index serves it. Each `IN (view)` in a statement built a
list of every owned id again, 34 ms at 40,000 accepted matches. A window asked up to four times: to
count, to filter and to flag. DISCOVER-05 measured its window at 7 ms on a library with no
accepted matches. At 40,000 accepted matches the same window took 98 ms, and the wantlist's up to
137 ms. Both now read the owned ids among their own list once per window
(`beatport_catalog_repository.owned_among_json`). Every use then tests membership in that JSON
array (`owned_json_sql`), so each part of one answer sees the same ownership. A test per filter
traces the connection and holds the view to one read per window; it fails on the old form.

**Measured** (median of five to seven, 50,000 library tracks with 40,000 accepted matches, 12,000
cached catalog tracks):

| Read or write | Before the fix | After |
| --- | --- | --- |
| Run window of 6,500 tracks, owned hidden (the default) | 98 ms | 34 ms |
| Run window, all or owned only | 68 ms / 98 ms | 34 ms / 35 ms |
| Wantlist window of 5,001 entries, any of the nine filter pairs | 71–137 ms | 35–38 ms |
| Wantlist window, by release date, artist or title; the last window | — | 39–46 ms |

| Write | Time |
| --- | --- |
| Add 5,000 cached tracks in one call, with its event | 172 ms |
| Mark 2,500 bought in one call | 37 ms |
| Add one, note one | 1.2 ms each |
| Plan a push of 100, 1,000 or 10,000 tracks (the owned check) | 26, 54 and 58 ms |

The bought filter needs no index. The list is read whole at its size, and a window's cost is the
one ownership read.

**What binds later steps.**

1. **DISCOVER-09's routes**:
   - `wantlist` is `WantlistService.page`, and `wantlist/add`, `/remove`, `/note` and `/bought`
     answer `WantlistChange.to_dict()`.
   - `playlist/start` calls `start_beatport_playlist_job`, and its result is
     `BeatportPlaylistResult.to_dict()`.
   - The `ValueError` and `LookupError` refusals, and the `BeatportAPIError` an add raises when a
     track must be read, cross the bridge as values with their class.
   - `beatport_playlist` joins `JOB_VERBS`.
   - A test holds that nothing but the job module starts a push.
2. **"A run's visible tracks"** can be more than any window holds. `playlist/start` should accept
   a run id and the owned filter and page the run window on the engine side, rather than take ids
   the renderer never loaded.
3. **DISCOVER-10** draws the wantlist from `WantlistPage`, and the run table's "on wantlist"
   column from `RunTrackRow.on_wantlist`.
4. **DISCOVER-12** deletes the whole of `playlist_writer.py`: the job does not use its API path,
   and once `incrate_api.py` goes it has no caller. It moves `playlist_name.py` beside
   `beatport_playlist_service.py`, which imports it.
5. **A reader that asks "owned?" more than once per request** reads the owned ids once with
   `owned_among_json` and tests them with `owned_json_sql`, as both windows now do.

**Tests**:

- 68 in `src/tests/unit/persistence/test_wantlist_repository.py`:
  - **writes:** an add that leaves an existing entry alone; catalog rows stored with entries; a
    refused catalog track leaving the rest; a missing run writing nothing; joining a caller's
    transaction; remove, notes, bought marks.
  - **reads:** the nine filter pairs with their counts; ownership read now and counted once;
    the four sorts with missing values last; windows and refusals; rows with credits.
  - **the plan, the run link** (`on_wantlist`, `tracks_in_run`, a deleted run) **and the models.**
- 66 in `src/tests/unit/services/test_wantlist_service.py`, over the real repositories, activity
  service and `BeatportApi`:
  - **adds:** from a run, from a page, by an id never read, batched, not found; idempotent adds;
    every refusal, including no token and a rejected read writing nothing.
  - **each operation's result and event;** owned and bought independent in all four combinations;
    becoming owned removes and marks nothing.
  - **an event that cannot be written undoes each of the four changes,** including the catalog
    row an add read.
  - **what is kept:** a large change's event; no library history; a relaunch; a deleted run.
- 51 in `src/tests/unit/services/test_beatport_playlist_service.py`, through `BeatportApi` over the
  in-memory Beatport, which now answers the two playlist routes:
  - **planning:** owned skipped by default and included on request; every name rule.
  - **pushing:** all added, in order, with the real URL and its event; some failing; refusals
    about the track never stopping it; three failures in a row stopping it; a success resetting
    the count; 401, 403 and 429 stopping at once.
  - **creating:** 403 on create refused as `forbidden` with "playlist scope"; other create
    refusals; no id in the answer.
  - **stopping and the feed:** cancelled before create and mid-way; the feed best-effort.
- 18 in `src/tests/unit/engine/test_beatport_playlist_jobs.py`, through the real job store and
  container:
  - refusals before a job exists; success with its URL and event; owned skipped and included;
  - a failing track; stage progress; 403 on create; a rejected token mid-way; no playlist id; a
    bug;
  - cancel mid-way; exclusivity; nothing else starting a push; the container building the
    wantlist.
- 17 in `test_beatport_ownership.py` for `requested_track_ids`, 4 in
  `test_beatport_catalog_repository.py` for the shared readers, and 3 in
  `test_discovery_repository.py` for one ownership read per window.
- DISCOVER-02's ownership test names `wantlist_repository.py` as the owner of `wantlist`, and the
  persistence boundary lists `wantlist_service.py` for its one transaction.
- 12 deliberate breakages were each caught:
  - **the wantlist:** an add overwriting an entry; a second bought mark overwriting the first;
    the owned filter reading bought; the run check skipped; an event failure swallowed;
    `on_wantlist` not read.
  - **the push:** owned tracks pushed by default; a refusal about the track counting toward
    stopping; a repeating refusal not stopping; cancel not checked between tracks.
  - **each window:** the view read per use.

**Checks run**: `python -m pytest src/tests` (full suite), `ruff check src/`,
`ruff format --check src/`, `check_no_qt_in_core.py`, the strict mypy gate with the three new
modules added, and `git diff --check`.

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

**Outcome**: Implemented. A reference names an artist or a label by Beatport id or by normalized
name, and the page says which. It resolves to a rule set for the Library, with a header read from
the Library's own count and facets, and to the recent Beatport tracks as a state that is always
drawable. Both halves answer in under 50 ms at 50,000 tracks.

**What was built.**

- **`models/entity_page.py`**:
  - `EntityRef` with `parse_entity_ref`: `bp:<id>` (a plain decimal, 1 to 2⁶³−1) or
    `name:<key>`. It renders back to what was parsed.
  - The page's answers: `EntityResolution`, `EntityLibrarySummary`, `EntityPage`,
    `EntityTrackRow`, `EntityTracksPage` and `EntityBeatportHalf`, each with `to_dict()`.
  - The Beatport half's states are DISCOVER-01's five error classes plus `ok` and `name_only`. A
    test holds them to `BEATPORT_ERROR_CLASSES`.
  - `name_only` carries a reason: `not_resolved`, `shared` or `not_on_beatport`. A half carries an
    action: `settings` or `resolve`.
- **Two rule fields**, `beatport_artist` and `beatport_label`, of a new field type, `beatport`,
  with `is`, `is_not` and `any_of`. An id is read exactly and bounded by what SQLite stores. The
  fields are not facetable: the name facets are what a page offers.
  - The renderer's two copies of the field-type union, the filter bar's value check and the
    desktop contract test take the new type. A typed id is sent as a number.
- **What the rule means**, in `track_credit_repository.identity_tracks_sql`:
  - every library track whose accepted Beatport track credits the id, as artist or remixer, or is
    on the label;
  - every track not resolved yet whose name is linked to that id and to no other.
  - The link is DISCOVER-05's own. An artist name is linked to an id when a resolved track credits
    the name and Beatport credits the id on it under the same key. A library label is linked to
    the Beatport label most of its resolved tracks are on, ties to the lower id.
- **`services/entity_page_service.py`**:
  - `reference` folds a name through `name_key`, so `name:ÂME` is `name:ame`.
  - `resolve`: a name linked to one artist, or a label linked to any, redirects to the id. The
    answer says what was asked (`redirected_from`). A name several artists share stays a name page
    and lists them (`links`). An id page lists the library spellings it gathers (`names`).
  - `page`: the resolution, with a header of the Library's `browse_count`, the `year` range, the
    `genre` facet, and an artist's labels (`label_name`) or a label's artists (`artist_name`),
    five values each. It includes `index_current` for DISCOVER-03's still-indexing state.
    `LibraryService.browse_count` was added so the count is the Library's own, not a window read
    for its total.
  - `beatport`: an id's tracks released in the last 365 days (artist) or 90 days (label), newest
    first.
    - Each track is marked owned and on the wantlist, with the owned filter and a window of 1 to
      500 tracks.
    - A listing is read once, through `artist_tracks` or `label_tracks`, and read back from the
      cache while it is younger than `LISTING_MAX_AGE` (12 hours) and covers the window.
      `refresh` reads it again.
    - A label's name is looked up through DISCOVER-05's lookup cache and its rule for trusting it,
      now one function, `lookup_is_current`. Only a miss searches, and the page says "found by
      name on Beatport". A search that fails is not kept.
    - An artist's name is never looked up. It is `name_only`, offering the resolve job only when
      some of the name's tracks are matched and not read yet (`resolvable`).
    - A refusal is a value with its state, never an exception. The owned filter and the window are
      checked before Beatport is asked anything.
- **Migration `m0024_entity_pages`**:
  - `beatport_listings`: when an artist's or label's recent tracks were last read whole, the
    record DISCOVER-02's sixth binding note left to this step.
  - An index on the owned-id expression, with `library_beatport_tracks` recreated from the same
    expression.
  - Two indexes on the label keys.
  - Two per-kind identity views, with `library_beatport_credits` rebuilt from them, unchanged.
  - `beatport_catalog_credits`, the catalog's side of "which tracks does this id credit".
- **The catalog reads** are in `beatport_catalog_repository`, the owner of the tables:
  `store_listing` (tracks and record in one transaction), `listing`, `entity_name` (the spelling
  on most cached tracks) and `entity_tracks`. A cached track by the same artist in the same
  window is shown whichever read cached it. An undated track is not, since "recent" is a date.
- **The container** builds `IEntityPageService` per request, so the Beatport half asks with the
  token configured at that moment.

**Where it differs from the specification, and why.**

- **An id's library half also gathers the unresolved tracks of its linked names.** The
  specification's membership rule over `library_beatport_credits` alone would lose, on every
  redirect, every track of the name that is not matched on Beatport, usually most of them. That
  is the opposite of DEC-095's "shown as one page". A name that two Beatport artists share gives
  its unresolved tracks to neither, the error DEC-095 exists to prevent. A test states the rule
  again in Python and holds the SQL to it over generated libraries.
- **A name redirects only when it is linked to exactly one artist.** A name linked to several is
  several people, and its page lists them. A label redirects to the one most of its tracks are
  on, DISCOVER-05's rule, so a page and a discovery run agree on what a label is.
- **Charts are not offered.** DISCOVER-01 found no listing of charts by artist or label. This is
  DEC-094's own fallback.
- **The recent window differs by kind.** A quarter is often empty for an artist. A year reaches
  the listing's page cap for a busy label.
- **Two states are added to the specification's seven, as reasons**: `name_only` says why
  (`not_resolved`, `shared`, `not_on_beatport`), because each is drawn differently and only one
  offers Resolve.
- **The listing needed a record** (`beatport_listings`). Freshness cannot be read from the
  tracks: an artist with no recent releases leaves none, and a track cached by a run or the
  wantlist says nothing about completeness.

**A slow first form, found and fixed; and DISCOVER-05's windows are faster for it.** Written as
specified, over DISCOVER-04's views, an artist page took **1.9 s** and a label page **9.4 s** at
50,000 tracks. Three causes, each measured:

1. **The owned id has no index.** m0023 wrote the URL fallback with nested subqueries, which an
   index cannot hold. So "which library tracks own these Beatport tracks" read every accepted match
   and computed its id, 30 to 50 ms, in each statement, and a page asks in all of them. m0024
   writes the same rule as one expression without subqueries, indexes it, and recreates the view
   from the same function. The page's reads by id drive from the id's own catalog tracks, as a list
   of values, because SQLite uses an index on an expression for a list and not for a join.
2. **The identity view could not be read one track at a time.** `library_beatport_credits` is a
   `UNION ALL`, which SQLite does not flatten into a correlated lookup. So "is this track resolved?"
   computed the whole view for each track asked about, about a second per question. The per-kind
   views flatten into lookups by key: 0.1 ms.
3. **A label's tracks were found by computing every track's effective label**: 16 ms a statement,
   and one read did it per track. DISCOVER-03 left the label keys unindexed "until the step with a
   label page measures it". The two indexes find them in two reads.

`beatport_catalog_repository.owned_among_json` uses the same index. So **DISCOVER-05's run
window**, 98 ms before DISCOVER-06 and 34 ms after, now takes **13 to 15 ms** at 40,000 accepted
matches. The wantlist's window uses the same function.

**Measured** (median of seven, 50,000 library tracks, 1,700 credited artists, 1,200 labels,
40,000 accepted matches, 40,000 cached catalog tracks with their credits):

| Read | First form | Now |
| --- | --- | --- |
| Artist page: resolve, count, year range, two facets | 1,923 ms | 25–29 ms |
| Label page: the same | 9,443 ms | 43–47 ms |
| The rule's count, artist / label | 291 / 1,218 ms | 0.4 / 0.4 ms |
| A window of the Library under the rule, artist / label | 570 / 2,352 ms | 13 / 20 ms |
| `is_not`, artist / label | 1,141 / 2,144 ms | 8 / 9 ms |
| Resolving a name that redirects, artist / label | 198 / 1,131 ms | 0.4 / 0.6 ms |
| The Beatport half's window (after the listing is read) | 33 ms | 1.2 ms |
| DISCOVER-05's run window of 6,500 tracks | 34 ms | 13–15 ms |

What the step costs: m0024 applies to that library in **52 ms**, the owned-id index
included. The two label-key indexes add 0.10 s to an import of 50,000 tracks (2.00 s against
1.90 s), which DISCOVER-03 measured at 1.97 s.

**What binds later steps.**

1. **DISCOVER-09's routes**:
   - `entity` is `EntityPageService.page(kind, ref)`, answering `EntityPage.to_dict()`.
   - `entity/beatport` is `beatport(kind, ref, refresh, owned, offset, limit)`, answering
     `EntityBeatportHalf.to_dict()`. A refusal is already a value. The `ValueError` for a bad
     reference or window crosses the bridge as one too.
   - The page's route takes `kind` and the reference as written (`bp:<id>` or `name:<key>`). When
     the answer's `ref` differs from what was asked (`redirected_from`), the renderer replaces
     the route with it.
2. **DISCOVER-11 draws the library half** by handing `rules` to the Library's browse unchanged, and
   the header from `library`. It draws each Beatport state with its `message` and `action`:
   Settings for `settings`, the resolve job (DISCOVER-04, route in DISCOVER-09) for `resolve`, and
   the `links` of a shared name as choices. "Found by name on Beatport" is `found_by_name`.
3. **The `beatport` field type** is in the filter bar, which types an id as a number. A chip reads
   "Beatport artist is 1190547". DISCOVER-11 may give the bar the page's name to show instead; the
   rule stays the id.
4. **Every "which library tracks own these Beatport tracks" read** passes a list of values to
   `library_beatport_tracks`, as `owned_among_json` does, so the index serves it. A join on the
   view's `beatport_track_id` scans every accepted match.
5. **A per-track read of identity** uses `library_beatport_artists` or `library_beatport_labels`,
   never `library_beatport_credits`, which a query cannot read one track at a time.
6. **A change to the owned rule** is a migration that rebuilds the index and the view from one
   expression, as m0024 does. A test holds the two to each other and to the Python rule.

**Tests**:

- 85 in `src/tests/unit/persistence/test_library_identity.py`:
  - **the rule, case by case, for both kinds**: resolved tracks, a linked name's unresolved tracks,
    a track matched and not read, a remix, Beatport authoritative for a resolved track, a shared
    name gathered by neither, a link needing both sides, a credit with no id, `is_not` as the
    exact complement, an empty id, a rejected match followed at once, the majority, a tie, the
    override, a label with no id;
  - **the reads** (links, gathered names, spellings, resolvable);
  - **agreement**: the SQL held to the rule stated in Python over five generated libraries, eight
    id sets each; a name redirecting exactly when its id gathers it; the links equal to DISCOVER-05's;
  - **the plans** that keep a page fast. Each fails on the first form.
- 22 in `src/tests/unit/persistence/test_entity_pages_migration.py`:
  - every owned id and identity row the same before and after m0024, over 22 hand-made cases of
    stored id and URL and 4,500 generated;
  - the new expression equal to the Python rule;
  - the migration alone on a populated library, and exactly its objects;
  - the indexes used, and the index holding the view's expression;
  - the listing table's shape and checks, and only the catalog's module running SQL on it.
- 20 in `src/tests/unit/persistence/test_entity_catalog_reads.py`:
  - storing a listing atomically, and a failure storing neither;
  - the name by most spellings;
  - the window's both ends, remixes, undated and other-source tracks;
  - owned marked, counted and filtered;
  - windows and refusals, and ownership read once.
- 66 in `src/tests/unit/services/test_entity_page_service.py`, over the real library,
  `LibraryService` and `BeatportApi` on the in-memory Beatport, which now answers
  `catalog/tracks/?artist_id=`:
  - **references and redirects**;
  - **the header equal to the Library's count, facets and years** for both kinds and both
    identities; a name page and its id page holding the same tracks; the rules crossing as JSON
    unchanged; a Smart Collection of them finding the same tracks;
  - **every state**: no token, 401, 403, 429 with its wait, 500, 503;
  - **the listing**: read once, stale after its age, refreshed, a shorter window not answering a
    longer one, a new release arriving once read again, a refusal storing nothing, a fresh cache
    answering while Beatport is down;
  - **names**: an artist never looked up, with and without resolvable tracks; a shared name; a
    label found by name, not found, trusted for its age, reused from a discovery run; a failed
    search not kept;
  - **the container** building the service.
- 62 in `src/tests/unit/models/test_entity_page.py`, and 23 new in `test_filter_rule.py`.
- 4 new renderer tests in `filterText.test.ts`, and `desktopContract.test.ts` with the new type.
- Two earlier tests updated:
  - `test_match_similarity_migration` compares m0012's rebuild at version 12, since a later index
    on the table is not something that rebuild lost;
  - `test_clean_schema` names the two new indexes among its named-query indexes.
- **A bug found by the tests**: the first id check went through `float()`, which refused 2⁶³−1 and
  would read 2⁵³+1 as its neighbour. Ids are now read exactly, and a test holds that.
- **A test outside this step, fixed**: `test_embedded_artwork`'s "without a front cover, the
  first picture is used" failed for MP3, WAV and AIFF on the last commit as well. mutagen
  writes ID3 frames smallest first, not in the order they were added, and the test's two
  8-pixel images compress to 75 and 77 bytes, so the file stored the other picture first and
  the reader, correctly, used it. The second picture is now larger, so the back cover is
  stored first in every format, and the test checks the stored order it relies on.
- 14 deliberate breakages, each caught:
  - **the rule**: a linked name's tracks dropped; a shared name gathered; a resolved track gathered
    by name; a tie to the higher id; `is_not` compiled as `is`;
  - **the page**: a name with any link redirecting; a listing never stale; a shorter window
    answering; "not found" trusted forever; the label window's last day dropped; an artist's
    window a label's;
  - **the model**: a reference with a leading zero; an id through a float;
  - **the speed**: ownership read by scanning again.

**Checks run**:

- **Python:** `python -m pytest src/tests` (full suite: 9,382 passed, 66 skipped; the three
  artwork failures above were fixed, and a CLI help test that timed out under load passes alone),
  `ruff check src/` and `ruff format --check src/` with ruff 0.14.0, the version CI and pre-commit
  pin, `check_no_qt_in_core.py`, and the strict mypy gate with the three new modules added.
- **Renderer:** `npm run typecheck`, `npm run lint` and `npm test`.
- **Electron:** `npm run typecheck` and `npm test`.
- **Repository:** `git diff --check`.

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

**Outcome**: Implemented. A seed's suggestions are scored by one rule in `core/`, with every reason
as data and keys written in the library's notation. The same library gives the same list, ordered
by score and then by id. The worst case, a seed whose tempo window holds 72% of a 50,000-track
library, takes **327 ms** against a budget of **0.5 s**.

**What was built.**

- **`core/similarity.py`**, the rule and nothing else. It imports nothing from CuePoint, and a test
  holds that.
  - **Inputs**: `Traits`: `bpm`, `key` as a `MusicalKey` (pitch class and mode), `genre_key`,
    `label_key` and `artist_keys`. Zero and blank values read as no value.
  - **Key**: `MusicalKey.camelot` places a key on the wheel by arithmetic. A test checks all 24
    keys against the library reader's own Camelot table. `key_relation` answers `same`,
    `adjacent` (one step, 12↔1 wrapping) or `relative` (same number, other letter);
    `compatible_keys` lists the four.
  - **Tempo**: within **6%** of the seed's BPM, scored from **30** points at the same tempo to
    **10** at the window's edge. Half and double time are scored by the same closeness, as heard
    (64 is 128), with their own details. `tempo_ranges` gives the three windows for a
    pre-selection.
  - **The weights**: key 25 for the same key and 20 for a step or the relative key, genre 20,
    label 10, shared artist 15 (once, however many are shared). The components add up to 100.
    Every weight is a named constant (DEC-067's reason), and a test pins the values recorded
    here.
  - **The gate**: when the seed has a BPM, a candidate outside every window, or with no BPM, is
    not a suggestion, whatever else it shares. When the seed has none, having any reason is the
    gate.
  - **`score`**: the similarity, with each `Reason`'s component, detail, points and the two values
    compared.
  - **`rank`**: the top N by score, then by track id. It totals every candidate from the same
    private match list `score` reads, and builds reasons only for the ones it keeps.
  - **`unused_components`**: what a seed could not offer. `REASONS` lists all ten
    `(component, detail)` pairs.
- **`models/similar_tracks.py`**:
  - `SimilarTracks` answers `seed_id`, `notation`, `unused`, `considered`, `duplicates_excluded`,
    `index_current` and `suggestions`.
  - Each `SimilarTrack` carries `track_id`, `score` and `reasons`, each reason a wire object:
    - `tempo`: `from` and `to` BPM;
    - `key`: `from` and `to` in the library's notation;
    - `genre` and `label`: `name`, the seed's spelling;
    - `artist`: `names`, as the seed credits them;
    - and `points` on every reason.
  - `TraitRow` is a row as read.
- **`persistence/similarity_repository.py`**, read only:
  - `seed`: every credit;
  - `check_scope`: the Library's own validation and reference check;
  - `candidates`: any of tempo ranges, genre, label or key spellings, or credited artists, within
    a scope, less an exclusion list;
  - `spellings`: the effective values a field takes;
  - `duplicates_of`: the tracks sharing a shown group, from the view the Duplicates list reads.
  - Every value is read through the rule vocabulary's own expression, so an override is what is
    compared (DEC-068).
  - The credit index's SQL comes from its owner, `track_credit_repository`: `credit_keys_sql`,
    `crediting_any_sql` and `credited_among`. `test_discover_schema` allows one module per table,
    and the first form, which queried `track_credits` here, failed it.
- **`track_query.build_select_scoped`**: a fourth projection of the browse predicate. A caller's
  columns over the tracks a `BrowseQuery` would show, narrowed by one more condition. A playlist,
  a Collection, rules and a text query restrict candidates exactly as they restrict the table.
- **`services/similarity_service.py`**: `similar(track_id, scope=None, limit=50)`, 1 to 200.
  1. Reads the seed.
  2. Excludes it and its duplicates.
  3. Pre-selects in SQL: the tempo windows, or for a seed with no BPM, the tracks sharing its
     genre, label or an artist, or having a compatible key. Each is matched by the library's
     spellings whose name key or parsed key is the seed's, so the pre-selection is exact.
  4. Ranks with the core.
  5. Writes the reasons.

  A missing seed is a `LookupError`; a bad id, limit or scope a `ValueError`.
- **The container** builds `ISimilarityRepository` and `ISimilarityService`. No Beatport client,
  and no token.
- **The reasons in words**: `renderer/src/screens/discover/similarReasons.ts` has
  `describeSimilarReason` ("One step on the wheel: 8A → 9A", "Half time: 128 → 64", "Shared
  artists: Âme, Dixon") and `describeUnused` ("This track has no BPM or key to compare."). DISCOVER-11
  draws them.

**Where it differs from the specification, and why.**

- **The tempo window is part of the rule, not only of the SQL.** The specification pre-selects by it.
  Written only there, Phase 10, which scores candidates it gathers itself, would suggest a 90 BPM
  track for a 124 BPM seed. So the rule refuses what the window refuses, and the SQL is a superset
  (the windows widened by 0.01 BPM, so a float at the edge is never lost to rounding).
- **A seed without a BPM also pre-selects by a compatible key.** The specification names genre, label
  and artist. DEC-096 scores a key without a BPM, and a seed with only a key would otherwise have no
  candidates at all.
- **A remixer counts as an artist**, as it does in the `artist_name` rule, so a shared artist means
  one thing on a page and in a suggestion.
- **A dismissed duplicate group is not excluded.** The user said those tracks are not the same
  recording, so they are suggestions like any other. The view the Duplicates list reads already
  answers that.
- **Each reason carries its points.** The specification's reasons are `{component, detail}`. The
  points let a person see why one suggestion ranks above another, which is DEC-096's case for
  explaining at all.
- **The answer says more than ids and reasons**: `considered`, `duplicates_excluded`, `index_current`
  (DISCOVER-03's rebuild state, as the entity pages report it) and `notation`. Each explains an
  absence or how to read a reason.
- **The renderer's words are written now**, not in DISCOVER-11, so the test the specification asks for
  exists on both sides in this step.

**A first form over budget, found and fixed.** Written directly, the dense band took **713 ms**.
Profiling found two causes:
1. **A subquery per candidate** for its credits doubled the read, from 58 to 115 ms. The rule reads
   nothing of a candidate's artists but those it shares with the seed. So the repository now reads
   the seed's artists' tracks once, through `track_credits`' name index (`credits_among`), and
   candidates are read as plain tuples.
2. **Building a validated reason list for all 36,000 candidates**, when only fifty are shown. `rank`
   now totals every candidate from the rule's match tuples and builds `Reason` objects for the ones
   it keeps. `score` reads the same tuples, so the two cannot disagree, and a test holds `rank` to
   sorting every `score`.

Parsed keys and genre and label keys are remembered per spelling, and a key's place on the wheel is
computed once per key. The answer did not change: the benchmark's list read the same scores before
and after, and the test against scoring every track holds the service to the rule.

**Measured** (median of seven, 50,000 tracks: 70% at 120–130 BPM, 15% at 170–175 and 15% spread
over 70–160; 24 keys, 40 genres, 1,200 labels, 1,700 artists, 30% of credits with two artists and 20%
with a remixer):

| List | Candidates scored | First form | Now |
| --- | --- | --- | --- |
| Seed at 125 BPM, the densest band, 50 suggestions | 36,105 | 713 ms | **327 ms** |
| The same, 200 suggestions | 36,105 | 714 ms | 344 ms |
| Seed at 90 BPM | 8,651 | 215 ms | 121 ms |
| Seed with no BPM (key, genre, label, artist) | 9,350 | 264 ms | 172 ms |
| Dense-band seed scoped to one genre | 907 | 75 ms | 63 ms |

Of the dense band's 327 ms, reading the 36,105 candidates is 89 ms. Counting the library's key
notation is 30 ms, and the rest is scoring. The budget, `DENSE_BAND_BUDGET_SECONDS`, is 0.5 s. That
is enough for a list opened by hand, and no Discover surface opens one per keystroke.

**What binds later steps.**

1. **DISCOVER-09's `similar` route**:
   - It is `SimilarityService.similar(track_id, scope, limit)`, answering `SimilarTracks.to_dict()`.
   - The scope arrives as the Library's own query parameters (`playlist_id`, `collection_id`, `rules`,
     `query`) and becomes a `BrowseQuery`. Its refusals are the Library's, so they map to the same
     envelope.
   - A missing seed is a `LookupError`, a 404 as `artwork_service`'s is.
2. **DISCOVER-11 draws suggestions** by reading their rows through the track-detail path (fact 5),
   in the answer's order, and words the Reasons column with `describeSimilarReason`. It shows
   `describeUnused(unused)` when the seed could not offer something. When `index_current` is false,
   it says shared artists may be missing, as the entity pages do.
3. **Phase 10 calls `core.similarity`** with its own candidates' `Traits`. It can use `rank` for an
   ordered list and `score` for one pair. `traits_of` turns a `TraitRow` into `Traits` the way this
   service does. A new component is a new pair in `REASONS`, which fails
   `test_similar_reasons_fixture.py` until the fixture is written again, and then
   `similarReasons.test.ts` until it has words.
4. **The weights are recorded here**, and `test_the_weights_are_what_the_step_records` pins them.
   Changing one is a decision to record, not a tweak.

**Tests**:

- 125 in `src/tests/unit/core/test_similarity.py`:
  - **the wheel**: 24 keys against the library's table; 18 relations, the 12→1 wrap in both modes and
    the relative switch among them; symmetry over all 576 pairs; `compatible_keys` exactly the related
    keys; enharmonic and spelled-out notations one key;
  - **tempo**: the same tempo, closeness to the edge, a hundredth apart, outside the window, half and
    double time scored as heard, and the windows agreeing with the rule over 3,000 random pairs;
  - **the rule**: a table of five candidates with their scores and reasons; the gate, even with
    everything else in common; a seed with no BPM, and with no BPM and no key; nothing in common;
    `unused`;
  - **`Traits`** normalization and refusals;
  - **ranking**: equal to sorting every `score` over 40 generated libraries; the same list from any
    input order; ties by id; exclusion; the limit; each score the sum of its reasons;
  - **reasons**: every one listed is given and every one given is listed; the weights; no imports from
    CuePoint.
- 44 in `src/tests/unit/services/test_similarity_service.py`, over a real library:
  - **the answer** on the wire; the same twice; ties; the limit and refusals; a missing seed;
  - **effective values**: an override on a candidate and on the seed; name keys; an artist as a credit
    and not a substring, remixers included; non-values;
  - **notation**: Camelot and classic libraries;
  - **no BPM**: genre, label, artist and key pre-selected, and `unused`;
  - **duplicates**: across two signals; a dismissed group; another track's group; a group not being a
    chain;
  - **scope**: a Collection, a playlist, a rule set; the seed outside the scope; a broken scope
    refused, even when nothing is pre-selected;
  - **no writes** (`total_changes` unchanged); `index_current`; the container;
  - **the whole answer against scoring every track in Python** from the tracks' own columns, over
    three generated libraries of 250 tracks with overrides, 25 seeds each. This is what shows the
    pre-selection loses nothing.
- 23 in `src/tests/unit/persistence/test_similarity_repository.py`:
  - each criterion alone and as alternatives; inclusive ranges; exact spellings; effective values;
    no criterion; exclusion;
  - `credits_among`, and a name credited twice on one track read once;
  - a playlist, a Collection, a text query, a rule, a criterion and an exclusion binding together;
  - spellings; duplicates; the builder; no writes.
- 3 in `src/tests/unit/services/test_similar_reasons_fixture.py`. They produce
  `similarReasons.fixture.json` from the real service, holding one of each of the ten reasons and
  every component as unused, and fail when the engine's answer or `REASONS` moves.
- 20 in `renderer/src/screens/discover/similarReasons.test.ts`: every reason in the fixture has its
  own sentence, the expected wording, singular and plural artists, BPM formatting, a reason from a
  newer engine, and the unused sentence.
- The strict mypy gate covers the three new modules outside `persistence/`, which it already covers
  whole.
- **21 deliberate breakages**, each caught:
  - the wheel not wrapping;
  - no relative key;
  - half time, and double time, not counted;
  - the tempo gate dropped, and a candidate with no BPM passing it;
  - ties broken the other way;
  - "the same tempo" too loose;
  - closeness not scored;
  - `unused` empty;
  - duplicates, and the seed, not excluded;
  - a dismissed group still excluding;
  - the imported BPM instead of the effective one;
  - the scope ignored;
  - the notation fixed;
  - a genre compared as text;
  - a seed with no BPM not pre-selecting by key;
  - candidates' shared artists not read;
  - the tempo slack negative;
  - artist names in key order instead of credit order.

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

**Outcome**: Implemented. DISCOVER-04 to DISCOVER-08 are on the wire, through all six contract files:
sixteen bridge methods over sixteen routes under `/api/v1/discover/`. Every method answers
`{ value, refusal }`, so a refusal a person can act on reaches the renderer with its code and, for
Beatport, its class. A Python test holds every TypeScript shape to what the engine serializes.

**What was built.**

- **`engine/discover_api.py`**, a routed module in ORG-08's shape: it says which paths it answers,
  answers them, and maps every refusal to a status and the one envelope. `server.py` gains two
  dispatch lines.
  - **Reads (GET)**:
    - `options`: token state, genres, the `artist_name` and `label_name` facets, a run's defaults and
      a push's default name, the resolve count, `index_current`, and the engine's limits;
    - `runs`: a window, newest first, with `total`;
    - `runs/{id}`: the run, with the artist and label names its scope resolved to;
    - `runs/{id}/tracks`: a window, with the owned filter and `hidden`;
    - `wantlist`, `entity`, `entity/beatport` and `similar`.
  - **Actions (POST)**: `runs/start`, `runs/{id}/delete`, `wantlist/add`, `/remove`, `/note`, `/bought`,
    `playlist/start` and `resolve/start`. The three starts answer **202** with the job's `id`, `type`
    and `state`; progress, cancel and the result are the job routes'.
  - **Every read echoes the window it answered** (`window`), so a late response can be told from a
    current one (LIBUI-05's rule).
  - **Requests are read strictly.** A key or parameter a route does not take is refused, naming it
    and what the route takes. So is a parameter given twice, and a number that is not written as
    one. Each route's accepted names are module constants, and a test holds the client's to them.
  - **`similar` takes the Library's own scope parameters** (`q`, `playlist_id`, `filters`, `scope`,
    `collection_id`) and resolves them as the Library's search does, a Smart Collection included.
    `library_api.combine_rules`, which was private, is now public for it.
  - **The refusals**:
    - `BEATPORT_REFUSED` carries `reason` (DISCOVER-01's class) and `retry_after`: 409 for `no_token`,
      `rejected` and `forbidden`, 429 for `rate_limited`, 502 for `unavailable`;
    - `DISCOVER_BUSY` (409) carries the running job's `job_id` and `job_type`;
    - `DISCOVERY_RUN_NOT_FOUND` (404), `DISCOVERY_RUN_RUNNING` (409) and `TRACK_NOT_FOUND` (404);
    - `INVALID_REQUEST` (400) for everything the services refuse, in their words;
    - 503 and 500 are not refusals: nobody can act on them.
- **The six contract files.** `engineClient.ts` declares the shapes and sixteen methods over two
  private helpers, `discoverGet` and `discoverPost`, and `readDiscover`. That function turns the six
  refusal codes into values and throws anything else. `engineSupervisor.ts` forwards each method,
  `main.ts` handles each channel, and `preload.cjs` exposes each. `cuepointBridge.types.ts` copies
  the shapes and declares the methods. A job's result can be read as `DiscoveryRunResult`,
  `BeatportPlaylistResult` or `BeatportResolveResult`.
- **One Beatport track row on the wire.** A run's row and a wantlist row are DISCOVER-07's
  `EntityTrackRow` shape (the catalog track's fields, `artists`, `remixers`, `owned`, `on_wantlist`)
  plus their own fields. So one row type and one column registry can draw all three Beatport tables
  in DISCOVER-10. `RunTrackRow`, `RunTracksPage`, `WantlistRow` and `WantlistPage` gained
  `to_dict()`.
- **What the routes needed from the services**, each added to its interface and tested:
  - `DiscoveryService.count_runs`;
  - `DiscoveryService.visible_track_ids`, over the new `DiscoveryRepository.run_track_ids`;
  - `BeatportResolveService.plan()` (a `ResolvePlan`), over the new
    `BeatportCatalogRepository.resolve_counts`;
  - `BeatportPlaylistService.default_name()`.
- **Genres read whole.** `BeatportApi.genres()` pages `catalog/genres/` through the parser every new
  catalog read uses, `parse_catalog_genre`, and keeps the answer for a day under its own cache key.
  inCrate's `list_genres` reads the listing's first page only; it is left as it is and retires with
  inCrate.
- **The status strip** names the three jobs: "Discovering on Beatport", "Pushing to Beatport",
  "Resolving Beatport identities". For a discovery or a push it shows the stage the job reports
  ("Reading charts 3/10"), because a count means nothing without it.
- **Similar Tracks' reason types** moved into the bridge types with the rest of the wire's shapes.
  `similarReasons.ts` re-exports them, so its callers are unchanged.

**Where it differs from the specification, and why.**

- **Every refusal a person can act on is a value, not only Beatport's.** DISCOVER-04 to DISCOVER-08's
  binding notes each asked for their `ValueError`s and missing things to cross as values. A form must
  be able to say "A note is at most 1000 characters" rather than fail. What throws is what nobody can
  act on: an unreachable library, a bug, an unknown path.
- **A busy Discover job is `DISCOVER_BUSY`, not `LIBRARY_BUSY`.** These jobs wait only for their own
  kind, and saying the library is busy would name the wrong thing.
- **`options` says more than the specification lists:**
  - the resolve count, which DISCOVER-10's resolve prompt needs and no route answered;
  - the engine's limits, so a form refuses what the engine would;
  - `index_current`, as the entity pages report it, since the facets may be short while DISCOVER-03
    indexes;
  - the default playlist name, so a push dialog shows the name it will take.

  "Whether Beatport accepted the token" is read from the genre request, which the panel needs anyway
  and which is cached for a day. It is not a separate probe.
- **A push can name a run** (`run_id` with the owned filter, sort and direction the table shows), as
  DISCOVER-06's second binding note asked. The engine gathers the tracks, so a push holds every
  track the table would show, not only those the renderer loaded.
- **A deleted run answers `{id, deleted}`.** A run that is still running is refused as
  `DISCOVERY_RUN_RUNNING` before the repository is asked.
- **The run list leaves out the names a run's scope resolved to.** A run over the whole library holds
  every artist in it, which a list of runs has no use for. The header adds them.

**Two slow reads, found and fixed.** Measured first as written, at 50,000 tracks with 40,000 accepted
matches:

1. **A push by run read its tracks window by window**, every source and credit included, only to keep
   the ids: **773 ms** for a 10,000-track run. `DiscoveryRepository.run_track_ids` reads the ids in
   one statement, built from the window's own filter and order fragments (`_OWNED_WHERE`,
   `_order_by`) over the same single ownership read. It takes **21 ms**, and it cannot order or
   filter differently from the table. A test holds it to the window under every filter and order.
2. **The resolve count built the list of 35,000 ids it counted**, in two statements that each scanned
   the ownership view: **137 ms** of `options`. `resolve_counts` counts both numbers in one statement
   over one scan, in **50 ms**. A test holds it to `resolve_plan` in every case and over a generated
   library.

**Measured** (median of seven, DISCOVER-08's 50,000-track library: 1,700 artists, 1,200 labels, 75,105
credit rows; 40,000 accepted matches, a 10,000-track run):

| Read | First form | Now |
| --- | --- | --- |
| `options`, whole | 458 ms | **302 ms** |
| of which the `artist_name` facet | 237 ms | 193 ms |
| of which the `label_name` facet | 71 ms | 63 ms |
| of which the resolve count | 137 ms | 50 ms |
| A push's tracks, from a 10,000-track run | 773 ms | **21 ms** |
| A run's window of 100 | — | 24 ms |

The `artist_name` facet is the Library's own, and this library's credits are denser than those
DISCOVER-03 measured at 93 ms: 161 ms here with no matches at all. `options` is read when the
Discover page opens, not per keystroke.

**A defect outside this step, found by its checks and fixed in its own commit.** The full renderer
suite failed once in four runs in `CleanScreen.test.tsx`: the first ArrowDown on the review queue was
dropped. The queue's key listener was replaced in a passive effect, after the commit that showed the
rows. A key pressed in between reached the previous listener, the empty queue's, and did nothing. It
is now replaced in a layout effect. A regression test presses the key from a `MutationObserver`, in
the microtask after the rows appear. It fails on every run against the old code and passes against
the new.

**What binds later steps.**

1. **DISCOVER-10 draws from `getDiscoverOptions`:**
   - an empty state and a Settings link from `beatport.state`;
   - the "New run" panel's genres, facets and defaults, and the form's bounds from `limits`;
   - the resolve prompt from `resolve.to_read`, started by `startBeatportResolve`.

   It lists runs with `listDiscoveryRuns` (`total` pages it), shows "what this run looked for" from
   `getDiscoveryRun`, and draws tables from `getDiscoveryRunTracks` and `getWantlist`. Both of those
   echo their `window`. "Push to Beatport playlist…" on a run's table sends `run_id` with the table's
   owned filter, sort and direction, not the loaded ids. A job's result is read through
   `getJobResults` as the matching result type.
2. **Every Discover answer is `{ value, refusal }`:**
   - `refusal.reason` picks the Beatport empty state and its action;
   - `DISCOVER_BUSY`'s `job_id` is the job to follow;
   - `INVALID_REQUEST`'s `message` is shown as written.
3. **DISCOVER-11** calls `getEntityPage` and replaces the route when `redirected_from` is set. It
   calls `getEntityBeatport` for the half, and `getSimilarTracks` with the Library's scope
   parameters. It reads suggestions' rows through `getLibraryTrack` in the answer's order, and words
   reasons with `describeSimilarReason`.
4. **DISCOVER-12** removes the inCrate routes and methods beside these. `list_genres` retires with
   them, since `genres()` replaces it, and the `Genre` model moves with the catalog models. The
   contract tests' DISCOVER-09 blocks stay.
5. **A new Discover method** is one route in `discover_api.py`, one method in each of the six files,
   and a line in each contract test's lists. A new field is a new key in both TypeScript copies,
   which both contract tests hold to the engine.
6. **If the Discover page must open faster than `options` answers**, the facets are the cost. Loading
   them after the rest, or only when the "New run" panel opens, is DISCOVER-10's to decide.

**Tests**:

- 167 in `src/tests/unit/engine/test_engine_discover_api.py`, through a running engine over a real
  library, the real job store and container, and `BeatportApi` over the in-memory Beatport:
  - **the routes**: every path under its prefix and none called `incrate`; the token on every read
    and action; unknown paths; reads and actions apart; inCrate's routes left to inCrate; bodies that
    are not objects; a parameter given twice;
  - **options**: every part; the resolve count; the name index; no token, and each refusal as a
    state; 250 genres over three pages; a genre written badly;
  - **runs**: a start answering its job; every field carried to the run; no token, nine unusable
    requests and a busy discovery, each starting nothing; the list, header and a running run; bad
    windows and ids; a run's tracks with every reason, owned hidden, counted and shown, sorted and
    windowed; deleting, and refusing a running run;
  - **the wantlist**: an add from a run, shown on the list and on the run; adding again; a track
    read from Beatport; no token and each Beatport class adding nothing; a run that is not there or
    did not find the track; remove, note and bought; the two filters; thirteen refused changes and
    four refused windows;
  - **pushes**: by ids; by a run's sorted table with owned hidden; owned shown and still skipped; a
    run showing nothing; only owned tracks; no token; one at a time; twelve refused requests;
  - **resolving**: the job reading what `options` counted; an empty body; no token; one at a time;
  - **pages**: a name page's rules giving the Library's count; a label found by name; an artist
    never looked up; a refusal as a state; the window and refresh; nine refused requests;
  - **Similar Tracks**: best first with reasons, the same twice; the limit; a Collection, a rule set
    and a text query narrowing it; a missing seed; ten refused requests;
  - **every refusal typed** through `status_for`, and the container's own client without a token.
- 42 in `src/tests/unit/engine/test_discover_contract.py`, from real answers:
  - every TypeScript interface against the engine's serialized objects, every nested one included;
  - every union against the engine's vocabulary;
  - the refusal's fields against every refusal's;
  - the request types and each method's parameters against the routes' constants;
  - every route called by the client, and every job a route starts named by the status strip.
- 28 in `src/tests/unit/services/test_beatport_genres.py`: the parser's refusals, slugs and bounds;
  every page read; the page cap; a bad genre left out; a refusal's class; the day's cache under its own
  key, never inCrate's first page; an empty answer not kept.
- 11 new in `test_discovery_service.py` (the visible list under six filters and orders, 1,203 tracks
  over three windows, an empty list, refusals; the run count) and 32 new in
  `test_discovery_repository.py` (the ids against the window under 24 filter and order pairs, the
  ownership view read once, refusals; the run count).
- 5 new in `test_beatport_resolve_service.py` for the plan, and 1 in
  `test_beatport_playlist_service.py` for the default name. In `test_beatport_catalog_repository.py`,
  every resolve-plan test now holds the count to the plan, and one new test adds a generated library.
- The three "nothing else starts it" tests name `engine/discover_api.py` as each job's one caller.
- **Electron**: 22 in `electron/engineClient.discover.test.ts`. They cover every route, method, query
  and body; each refusal as a value; a field of the wrong type or an unknown class read as absent;
  what throws; and the two lists of codes and classes.
- **Renderer**:
  - 144 new in `desktopContract.test.ts`: the sixteen methods in all six files; GETs and POSTs on their
    own routes; every answer a `DiscoverAnswer`; nothing incrate; the job results; 39 interfaces,
    what each extends included, and 20 types kept identical in both copies;
  - 4 new in `useActiveJob.test.ts`: the three verbs, and a staged job's stage.
- The strict mypy gate covers `engine/discover_api.py`.
- **26 deliberate breakages, each caught by the test named for it:**
  - **status codes and refusals**: a rejected token as 400; no `retry_after`; a missing seed as a
    plain 404; `INVALID_REQUEST` thrown rather than answered;
  - **reading requests**: an unknown parameter ignored; a parameter given twice read once; a note left
    out clearing it; an empty body refused;
  - **runs**: the owned filter ignored; a running run deleted;
  - **pushes**: a push by run in found order; a push by run showing owned tracks; a push's ids without
    the owned filter;
  - **options and pages**: no token read as configured; refresh ignored; the resolve count counting
    every row;
  - **genres**: read from one page; a genre id of 0 kept;
  - **Similar Tracks**: its scope ignored;
  - **the wire's shapes**: a run's row without its position; a wantlist row not on the wantlist; a
    null sent in a query; a field missing from the renderer's copy; the supervisor forwarding the
    wrong method;
  - **the renderer**: a staged job's stage not shown; the Clean key listener back in a passive
    effect.

**Checks run**:

- **Python:** `python -m pytest src/tests/unit/engine/ -q` (1,245 passed); the full suite on the
  final tree (9,868 passed, 66 skipped, the strict mypy gate among them); `ruff check` and
  `ruff format --check` with the pinned 0.14.0; `check_no_qt_in_core.py`; and `git diff --check`.
- **Renderer:** `npm run typecheck`, `npm run lint` (only the warnings already there) and `npm test`
  (2,956 passed), the suite six times over for the Clean fix.
- **Electron:** `npm run typecheck` and `npm test` (468 passed).

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

**Outcome** (2026-09-27): **Implemented.** Discover is in the sidebar and works end to end, in a
packaged Windows build as well. inCrate is still under Tools, unchanged, until DISCOVER-12.

**What was built.**

- **Navigation.** `discover` is enabled in `navRegistry.ts`, in the workspace group after Clean, and
  `App.tsx` routes it to `DiscoverScreen`. `lastDestination.test.ts`'s disabled example moved to
  `prepare`, as its comment said a later phase would have to.
- **The page** (`screens/discover/`). Two tabs, **Runs** and **Wantlist**, the last one used
  remembered (`discoverSections.ts`, CLEAN-12's pattern). `options` is read once when the page opens;
  a Beatport notice, the resolve prompt and a push's outcome sit above both tabs, because each is the
  page's and not a tab's.
- **Runs.** The list of kept runs, newest first, each with its date, state, what it looked for and
  how many tracks it found, paged by `total` ("Show older runs"). Beside it, the open run or **New
  run**:
  - **New run**: the genres (filterable), chart dates, release days, and the artist and label scope:
    every one, only those picked from the Library's own facets with their counts, or none.
    Everything starts from `options.defaults`, and `newRun.ts` refuses what the engine would, from
    `options.limits`. It also refuses two requests the engine accepts and that can find nothing: no
    artists and no labels, and genres with no artists (a run's charts are its artists').
  - **Starting a run** follows its job from the page. The run is opened as soon as the engine has
    made it, and the list and the open run are read again every two seconds while anything runs, and
    once when it ends. Nothing else polls.
  - **A run**: what it looked for, from its own recorded scope (the names folded under "The N
    artists it looked for"), how it ended and why, and its tracks. Owned tracks are hidden by
    default, with "N owned tracks hidden" and **Show tracks you own**. **Delete run…** asks first.
- **Wantlist.** The same table over `getWantlist` with the note, added and bought columns, the two
  independent filters DISCOVER-06 made of the four (**Owned**, **Bought**), and the entries, bought
  and owned counts.
- **The actions** (`beatportActions.ts`): one list, drawn as the toolbar's buttons and as the
  right-click menu. A run with nothing selected offers **Push to Beatport playlist…** for everything
  the table shows; a selection adds **Add to wantlist** and **Open on Beatport**. The wantlist adds
  **Edit note…** (one track), **Mark bought** (or **Mark not bought** when everything selected is
  marked) and **Remove from wantlist**. A push without a token Beatport accepts is shown disabled,
  with why.
- **Pushing.** The dialog asks the name (the engine's default) and whether to include owned tracks.
  A run's table with nothing selected is pushed by `run_id` with its owned filter, sort and
  direction, as DISCOVER-09 made possible; the wantlist with nothing selected reads every id it shows
  from the engine, window by window, in its order. The outcome stays on the page with **Open the
  playlist** until dismissed. A refusal stays in the dialog in the engine's words.
- **Token states.** `beatportState.ts` draws DISCOVER-01's five classes: **Open Settings** for no
  token, a rejected one and a refused one, **Try again** for a rate limit and an unreachable
  Beatport. A refusal a run's start meets replaces what `options` said. Runs and the wantlist stay
  readable in every state, and a run is not offered when only Settings can help.
- **The resolve prompt** says how many matched tracks have not been read and starts DISCOVER-04's
  job, followed from the page; `options` is read again when it ends.
- **Rows from Beatport are not library rows.** `TrackTable` holds them with a column registry of its
  own (`beatportColumns.tsx`) and a windowed source (`useBeatportWindow.ts`); the table itself did
  not change. Double-click does nothing. The Inspector shows its empty state, saying why, for as
  long as the page is open.
- **Open on Beatport** is a new, narrow bridge method, `openBeatportPage(url)`. It is not an engine
  route, so it crosses three files, not six: `preload.cjs`, `main.ts` and the bridge types. The main
  process opens only an https page on `www.beatport.com` or `beatport.com`, with no port or
  credentials (`electron/externalLinks.ts`), and answers whether it did. At most ten pages open at
  once.
- **Settings' token field** can be linked to: `settingsLink.ts` carries the field in the location's
  state, as Clean's links do, and Settings scrolls to it and focuses it once its status has been
  read.
- **A mocked Beatport for end-to-end tests.** `CUEPOINT_BEATPORT_FIXTURE` files gained an `api`
  section: v4 answers by method, path and the parameters an entry lists, with a status, headers and
  an optional `delay_ms`. `BeatportApiClient` answers from it in place of the network when a fixture
  is active, as a real `requests.Response`, so paging, parsing and error classes run unchanged.
  Anything unlisted is a 404, and no request reaches the network.

**Where it differs from the specification, and why.**

- **"Open on Beatport" opens at most ten pages.** The specification offers it to a multi-selection,
  and it is; each page is a browser tab, and a hundred at once is a click nobody meant.
- **The wantlist's "four filters" are two menus**, **Owned** and **Bought**, each "or not", "not" or
  "only": DISCOVER-06's reading of the four, whose combinations include "bought, not owned yet".
- **A push of a whole wantlist is offered**, beside a selection's: nothing selected pushes every
  track the list shows, read from the engine rather than from the rows loaded.
- **The Runs tab stacks when narrow.** At the default scale, with the sidebar and the Inspector
  open, a 1,280-pixel window left the open run about 300 pixels beside the list; its header took the
  whole height and the table was out of reach. Below 560 pixels at scale 1 (`useNarrow.ts`, measured
  on the element, since the sidebar and the Inspector change its width), the list goes above the
  run, and the tab scrolls as one. Found by the end-to-end spec.
- **`options` is read once, when the page opens**, facets included. DISCOVER-09 left this to this
  step: 302 ms at 50,000 tracks is a page opening, not a keystroke, and loading the facets apart
  would be a second request and a second loading state for the one panel that needs them.
- **The mocked Beatport is a fixture file**, as CLEAN-14's journey stubbed Beatport's website, not a
  local server. It reads nothing from the network, never sends the token anywhere, works the same in
  a packaged engine, and holds nothing the file does not say.

**Three defects found by this step's own tests, and fixed before commit.**

1. **Settings could not focus its token field when linked to.** The field is disabled while its
   status loads, and was focused first: Chromium drops the focus of a field disabled after it was
   focused, and jsdom keeps it, so only the end-to-end spec saw it. Settings now focuses the field
   once its status has been read (`useBeatportToken` reports `loaded`). A component test records
   when the focus came and fails on the old order.
2. **The table's rows were squeezed to nothing** when its actions wrapped in a narrow pane: the
   height floor was on the table, and the actions took it. The floor is on the rows.
3. **The run's table could be pushed out of reach** on a short window: see "stacks when narrow".

**What binds later steps.**

1. **DISCOVER-11** draws an Artist or Label page's Beatport half with `BeatportTable`,
   `useBeatportWindow` (its `answers` checking the page's echoed ref and owned filter) and
   `useBeatportSelection`, over `EntityTracksPage` rows, which are `BeatportTrackRow`s. The shared
   columns come from `beatportColumns.tsx`; the actions are `runActions` less the run. The page's
   empty states use `beatportNotice` for the classes the half shares.
2. **A new Beatport table** is a column registry, a `fetch` and an `answers` for
   `useBeatportWindow`; the table, the selection and the actions are shared.
3. **DISCOVER-12** moves the token's Settings wording from inCrate to Discover; `settingsLink.ts`
   and the field's id stay. The sidebar test that orders Discover before inCrate goes with inCrate.
4. **An end-to-end spec that needs Beatport's API** adds `api` entries to a fixture file, not a
   server; `test_discover_journey_fixture.py` is the pattern for holding such a file to its journey.

**Tests**:

- **Renderer** (`screens/discover/`):
  - `DiscoverScreen.test.tsx` (47), over the engine's own answers: the tabs and their memory; the
    engine unreachable and the bridge missing; the Inspector's empty state; every token state and
    its action, the Settings link and **Try again**, no run without a token, a start's refusal
    replacing `options`; the resolve prompt, its job and when it is not offered; the run list; the
    newest run opened; New run when there is none; what a run looked for; owned hidden, counted and
    shown; every track owned; sorting; the actions by selection size; add to wantlist; Open on
    Beatport, and a page refused; double-click doing nothing; the right-click menu; a push by run,
    in its sort, and by ids, a refusal kept, a name refused; delete and a run gone; New run's
    defaults, picking artists, the engine's refusal, the started run opened; the wantlist's rows,
    filters, empty state, actions, bought and not bought, remove, notes and a push of the whole
    list.
  - `discoverPure.test.ts` (44): the tab's memory; every Beatport state; the actions by selection
    size; the New run form's rules and request; every sentence, from the engine's answers; the
    columns.
  - `useBeatportWindow.test.tsx` (11): the first page, paging once, stale answers by question and by
    identity, the echoed window, a reload that keeps rows, shrinks and empties, a new question,
    refusals and failures, disabled.
  - `useNarrow.test.tsx` (2).
  - `settingsLink.test.tsx` (4); `navRegistry.test.ts`, `lastDestination.test.ts` and
    `Sidebar.test.tsx` for Discover enabled; `desktopContract.test.ts` (3) for the new bridge method
    and that nothing else opens a browser.
- **Electron**: `externalLinks.test.ts` (22).
- **Python**:
  - `test_discover_page_fixture.py` (36) produces `discoverPage.fixture.json` — 32 states, through a
    running engine, as the renderer receives them — and holds it to the engine (EXPORT-07's
    practice).
  - `test_beatport_fixture.py`: 33 new, for the `api` section, the client answering from it, its
    refusals classified as Beatport's, the delay, and no network.
  - `test_discover_journey_fixture.py` (3) holds the journey's Beatport to the journey.
  - The strict mypy gate covers `data/beatport_fixture.py`.
- **End to end**: `e2e/discover.spec.ts`: a first visit without a token, to the token field; and the
  journey — import, a run started and watched in the status strip, opened, two tracks added to the
  wantlist, one marked bought, found by the Bought filter.
- **Deliberate breakages, each caught by the test named for it**: owned shown by default; a push by
  run in found order, or with owned shown; an add without its run; Open offered with nothing
  selected, or for more than ten; a bought mark never undone; a push offered without a token; a
  busy refusal shown raw; a stale answer kept, by question and by identity; a reload blanking the
  rows; the Inspector left alone; the resolve prompt with nothing to read; the Settings link without
  its field; the tab not remembered; the whole library sent as none; a chart window a day too long;
  positions from zero; the stacked width ignoring the scale; Discover left disabled; Settings
  focusing before the read; an http page or a look-alike host opened; main opening unchecked; the
  fixture ignoring listed parameters, reaching the network, or ignoring its delay.

**Three things outside this step, found by its checks and fixed.**

- **The journey's Beatport file would never have been committed.** `.gitignore` ignores `*.json`
  outside its exceptions; `test_regression_fixtures_not_ignored.py` caught the new file, and it has
  its own exception beside the Clean journey's.
- **`test_the_job_is_recorded_in_the_job_log` (EXPORT-05) read the job's row too early.** The
  store marks a job finished before it writes the row, so under eight workers the row still said
  running. The test now waits for the job's thread, which ends once the row is written. A
  300 ms delay injected before the write fails the old test and passes the new one.
- **`shell.spec.ts` walked a fixed fourteen Tab presses** to reach the status strip; enabling
  Discover added a stop. It now tabs until Activity, bounded at forty, so the next enabled page
  does not break it, and lists Discover among the sidebar's links. Also, a CLI `--help` test's
  five-second subprocess timeout, a hang guard, failed under eight workers; it is sixty.

**Checks run**:

- **Python:** the full suite (9,940 passed, 66 skipped, the strict mypy gate among them); `ruff check` and
  `ruff format --check` with the pinned 0.14.0; `check_no_qt_in_core.py`;
  `check_desktop_version_coupling.py`; `git diff --check`.
- **Renderer:** `npm run typecheck`, `npm run lint` (only the eight warnings already there) and
  `npm test` (3,070 passed).
- **Electron:** `npm run typecheck` and `npm test` (490 passed).
- **End to end:** the whole suite against the development build (51 passed, 1 skipped, and the
  shell spec's keyboard test failing as above; `shell.spec.ts` then 7 of 7 after its fix), and
  `discover.spec.ts` three times in a row against the packaged build
  (`release/win-unpacked`, rebuilt with a fresh engine sidecar): 2 of 2 each time.

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

**Outcome** (2026-09-27): **Implemented.** A track's artists and label are links to their pages, from
the Inspector, the operations list and the filter chips, in the Library and on the Clean page. An
Artist or Label page holds the Library's own table over the engine's rule set and the Beatport half
in every state DISCOVER-07 answers, and says which identity it is. Similar tracks lists a seed's
suggestions with their reasons in words. Suggestions and a page's tracks play and queue as library
rows do. The end-to-end journey passes in a packaged Windows build.

**What was built.**

- **The engine: the Inspector's links.** The track detail read (`/api/v1/library/tracks/{id}`)
  gains `credits`: the artists and remixers the credit names and the effective label, each with
  the page it opens. It is additive, as every change to that shape has been.
  - `services/track_credit_links.py` splits the shown credit with `split_credit` at read time,
    not from the credit index, so a track read while DISCOVER-03's index builds still has its
    links.
  - A resolved track links by id: `TrackCreditRepository.track_identity` reads the per-kind
    views one track at a time (DISCOVER-07's fifth binding note). A name Beatport credits under
    the same key links to that artist's id, and the label to its Beatport label.
  - Everything else links by the name's key, which the page follows to an id if resolution has
    linked it since. A key Beatport credits two ids under on the one track links by name, since
    the key cannot say which.
  - `models/entity_page.py` gains `CreditLink` and `TrackCreditLinks`. Both TypeScript copies
    gain `TrackCreditLink`, `TrackCreditLinks` and `TrackCreditRole`, which both contract tests
    hold to the engine.
- **Routes** `/discover/artist/:ref`, `/discover/label/:ref` and `/discover/similar/:trackId`,
  under the `discover` destination (DEC-094). `discover` is `nested` in `navRegistry.ts`: the
  sidebar keeps it lit on its pages (a `NavLink` already did), and launch memory remembers
  Discover, not the page (`findOwningDestination`). `discoverLinks.ts` writes and reads the
  addresses.
- **A page** (`EntityScreen.tsx`):
  - **The header**: the name, the identity ("Beatport artist" or "Grouped by name") and what it
    means, the spellings an id page gathers, "Opened by name" after a redirect, and the
    Library's facts: tracks, years, genres, and an artist's labels or a label's artists as
    links to their pages. "Still indexing" shows while DISCOVER-03's index builds.
  - **Its address is its reference.** When the answer's `ref` differs from the address — a name
    now linked to an id, or a name as typed — the address is replaced, not pushed, and the page
    held is not asked for again.
  - **Open in Library** carries the rules and, for an id page, the name its id goes by, so the
    Library's chip reads "Beatport artist is Mara Veil" (DISCOVER-07's third note).
    **Save as Smart Collection…** saves the same rules through ORG-12's dialog.
- **The library half** (`LibraryHalf.tsx`) is the Library's `useTrackWindow`,
  `useTrackSelection`, `useLibraryPlayback` and `LIBRARY_COLUMNS` over the page's rules, newest
  first, with its own column layout.
  - A double-click plays the row with the whole table as the queue (DEC-012).
  - The menu and **Actions…** offer Play, Play next, Add to queue, Similar tracks, Artist page
    and Label page (DEC-013). Copy and Show in folder are the Library's `SelectionActions`.
- **The Beatport half** (`BeatportHalf.tsx`) is DISCOVER-10's `BeatportTable`,
  `useBeatportWindow` and `useBeatportSelection` over `getEntityBeatport`, with
  `ENTITY_COLUMNS` (the run's columns less the run's). Its actions are `runActions`: add to the
  wantlist (without a run), push (the engine's default name and limits read when the dialog
  opens), and open on Beatport.
  - Each state is drawn with its reason and its action. Token problems go to Settings' token
    field. A rate limit and an unreachable Beatport offer **Try again**, which reads again
    however fresh the copy. A resolvable name offers the resolve job, followed until it ends,
    and the page is then read again. A shared name offers the artists who share it. "Found by
    name on Beatport" is said.
- **Similar tracks** (`SimilarScreen.tsx`): the seed (its credit as links, BPM, key and genre,
  what it was compared with, what it could not be compared by, and the index note), then the
  suggestions.
  - Each suggestion's row is read through `getLibraryTrack` in the answer's order (fact 5). A
    row gone by then is left out.
  - `SIMILAR_COLUMNS` put the title, a **Reasons** column in `describeSimilarReason`'s words and
    the score first, then the Library's columns. None sorts.
  - A double-click plays the list from that row. The menu and Actions… offer Play, Play next,
    Add to queue, the pages, and **Similar tracks**, which makes the suggestion the next seed.
  - The Inspector shows the seed until a suggestion is selected.
- **The hooks** (the risk this step named: shared by every page):
  - **The Inspector** (`TrackDetailPanel`): with `onOpenEntity`, the header's credit is shown
    as written with each name in it a link (`CreditLinks`, over `creditSegments`), the
    effective label is a link beneath it, and the Remixer row is linked. Without the prop, or
    from an older engine, it reads as it always did. The Library, the Clean review queue,
    Missing files, the pages and Similar tracks pass it.
  - **The operations list**: `discoverMenuItems` adds Similar tracks, Artist page (a submenu
    when a credit names several, remixers after artists) and Label page for one track. It is
    in `LibraryScreen`'s one list, so the row menu and Actions… offer them alike. The one
    track's credits are read before the menu opens, from the Inspector's detail when it is that
    track's; a menu that needs none opens at once, as it always did.
  - **The filter chips**: a clause that names one artist or label (`artist_name`, `label_name`,
    `beatport_artist` or `beatport_label` with `is`) offers **Open page** (`pageOfRule`).

**Where it differs from the specification, and why.**

- **The engine splits the credit and names the pages.** The specification draws links "from
  `split_credit`", which is Python. A second copy in TypeScript would be a second rule, so the
  track detail answers the split and each link's reference.
- **The label link is the effective label, beside the artist.** The imported record's Label row
  stays exactly what Rekordbox sent (DEC-057's discipline), and a Label page's rule compares the
  effective label (DEC-068).
- **Remixers are linked too**, and **Artist page** lists them, because the `artist_name` rule and
  Similar tracks both count a remixer as an artist.
- **A page's Beatport half shows owned tracks, marked**, with **Hide tracks you own**, unlike a
  run's. A page is about the artist, and which of their releases a person already has is part of
  that; a run is a list of music to buy.
- **One selection per page.** Selecting in one half lets go of the other's, and the Inspector
  shows the library track selected or its empty state for a Beatport row (DISCOVER-10's rule).
- **A page's table offers playback and Discover's entries, not the Library's organization
  entries.** **Open in Library** is one click away, and tagging from a page would be a second
  Library.
- **The address is replaced whenever it is not the page's own reference**, not only after a
  redirect, so a name typed as "Mara Veil" and one linked as "mara veil" are one address.
- **The pages are remembered as Discover.** DEC-027 reopens on destinations. A page is reached
  from a track, and reopening on one a week later would be a guess.

**Defects found by this step's own checks, and fixed before commit.**

1. **The Beatport half blanked while it asked again.** Ticking **Hide tracks you own** is a new
   question, so the window dropped its answer and the half drew "Asking Beatport…", the checkbox
   included, until the new one landed. The half now keeps its last answer for the same page
   while it asks. The component test that toggles the filter failed on the first form.
2. **Similar tracks' reasons were out of sight** at 1,280 pixels with the sidebar and the
   Inspector open: the Library's wide title and the score came first. The reasons now sit
   beside a narrower title.
3. **Similar tracks' actions were cut off on a short window**, because the view hid its
   overflow. It scrolls as one now, as the runs pane does.

**What binds later steps.**

1. **DISCOVER-12's journey** — "open an artist page by id and a label page by name, play from one,
   open Similar tracks and queue a suggestion" — extends `e2e/discoverPages.spec.ts`. A page by
   id needs the library resolved, so its mocked Beatport answers `catalog/tracks/?id=` for the
   resolve job and `?artist_id=` for the page, in the fixture file's `api` section.
2. **Retiring inCrate touches none of this.** `discover` stays `nested`, and `/incrate`'s
   redirect lands on `/discover`, whose pages stay routes under it.
3. **A new entry for one track** goes in `discoverMenuItems` (or beside it in `LibraryScreen`'s
   one list), and a page's table offers it through `libraryRowMenuItems`.
4. **A new place that draws the Inspector** passes `onOpenEntity`, or its credits stay text.
5. **Phase 10 (Set Builder)** can call Similar tracks with a scope, which the route takes and
   this view does not send. `SIMILAR_COLUMNS` and `reasonsText` draw any list of suggestions.
6. **A page that sends id rules to the Library** sends their names with them,
   `libraryRulesState(rules, names)`, keyed by `beatportNameKey`.

**Tests**:

- **Renderer**:
  - `EntityScreen.test.tsx` (33), over the engine's own answers: both kinds in both identities,
    a name replaced by its own reference and a name redirected to its id (asked once), the
    related names as links, the index note, a refusal and a missing bridge; every Beatport-half
    state with its reason and its action (Settings' token field, **Try again** asking afresh,
    the resolve job and the page read again after it, a shared name's choices); releases marked
    owned and the owned hidden; found by name; add to the wantlist and open on Beatport; a push
    of everything shown with the engine's default name and its outcome; the library half's
    double-click playing the page's view, its menu queueing without interrupting and leading to
    an artist's page and Similar tracks, Actions… on one track, a selection played as the
    queue; Open in Library and Save as Smart Collection with the same rules, and a refused
    save; the Inspector describing a library row and never a Beatport one.
  - `SimilarScreen.test.tsx` (14): suggestions read through the track-detail path in the
    answer's order, with their scores and reasons; the seed's facts, credit links and what it
    was compared with; no BPM or key, nothing close, the index note, a seed gone, an address
    naming no track, a row gone by the time it is read; a double-click playing the list from
    that row, Play next and Add to queue, a selection played from Actions…, a suggestion made
    the next seed, its label page; the Inspector on the seed and then on a suggestion.
  - `discoverPages.test.ts` (28): addresses and references; every page's words and every
    Beatport state's headline from the fixture; a credit split into links, a name inside
    another, a name the text spells otherwise; the operations list's entries for none, one and
    several tracks, before the credits are known, remixers, a person once, the credits read or
    reused; playback first; an id rule read as the page's name, and names carried to the
    Library and checked; every reason the engine can emit in the Reasons column (DISCOVER-08's
    test, from the other side); no column sorting suggestions; the page's Beatport columns.
  - `TrackDetailPanel.discover.test.tsx` (7): each artist in the credit linked where it
    stands, by id or by name; the label; remixers; the imported Label row left as text; text
    without the prop, without credits, and for a track with none.
  - `LibraryScreen.discover.test.tsx` (9): the entries in the row menu and behind Actions…,
    each opening the right thing, a single artist without a submenu, a label a track lacks
    disabled, nothing for several tracks, nothing and no wait without the hooks; a chip's Open
    page, an id chip reading as its name, the Inspector's links.
  - Two new in `CleanScreen.test.tsx` (the review and Missing files Inspectors), two in
    `FilterBar.test.tsx`, one in `Sidebar.test.tsx` (Discover lit on its pages), four in
    `App.test.tsx` (the three routes and reopening on Discover), and three shapes more in
    `desktopContract.test.ts`.
- **Python**:
  - `test_discover_pages_fixture.py` (37) produces `discoverPages.fixture.json` — 30 answers,
    through a running engine — and holds it to the engine, with checks that every state,
    identity and reason the renderer draws is in it and that each header counts its table.
  - `test_track_credit_links.py` (17): the split, remixers, an act joined by "&", a blank
    credit, a name too long for a reference; links by id where resolved, a remixer by id, a key
    credited twice, a track matched and not read, a label with no id, the effective label;
    `track_identity`; the models.
  - Two new in `test_engine_library_browse.py` (the credits on the wire, the effective label)
    and two in `test_discover_contract.py` (the shapes and the role vocabulary).
  - The strict mypy gate covers `services/track_credit_links.py`.
- **End to end**: `e2e/discoverPages.spec.ts` — import four playable tracks, select one in the
  Library, open its artist through the Inspector's credit (the address replaced with the name's
  key, Discover lit), see the page's two tracks newest first and "Known by name only", play one
  (the page's table is the queue), open Similar tracks from the other (best first, reasons in
  words), and queue a suggestion without interrupting.
- **Deliberate breakages, 30, each caught by the test named for it**: the address not replaced,
  or the replaced address asked again; a double-click playing the row, not the view; the rules
  ignored; the wantlist sent no tracks; owned hidden by default; Try again answered from the
  copy; the half blanking while it re-asks; Settings opened without the token field; Open in
  Library losing the names; a Smart Collection of other rules; the Inspector describing a
  library row under a Beatport selection; a shared name's choices not drawn; the related names
  opening the wrong kind of page; names found from the start of the credit; remixers left out
  of the submenu; the entries offered for several tracks; the Library's menu waiting when
  nothing needs reading; remixers not linked; Clean's Inspector not wired; an "is not" chip
  offering a page; Similar tracks playing from the top; a gone row kept; suggestions sortable;
  a reason drawn as its code; Discover forgetting its pages; and, in the engine, the imported
  label linked, a key Beatport credits twice linked to one id, a resolved track linked by name,
  and a remixer credit left unsplit.

**A test outside this step, found by its checks and fixed in its own commit.**
`test_performance.py::test_performance_report` read the stats an earlier test had left in the
process-wide collector, so it failed whenever the suite's eight workers ran the two apart, and it
wrote its report into the checkout's `output/`. Each test now records its own session, and the
report goes to the test's own folder. Run alone, the old test fails and the new one passes.

**Checks run**:

- **Python:** the full suite (9,998 passed, 66 skipped, the strict mypy gate among them);
  `ruff check` and `ruff format --check` with the pinned 0.14.0; `check_no_qt_in_core.py`;
  `check_desktop_version_coupling.py`; `git diff --check`.
- **Renderer:** `npm run typecheck`, `npm run lint` (only the eight warnings already there) and
  `npm test` (3,173 passed).
- **Electron:** `npm run typecheck` and `npm test` (490 passed).
- **End to end:** the whole suite against the development build (53 passed, 1 skipped), and
  `discoverPages.spec.ts` with `discover.spec.ts` three times in a row against the packaged
  build (`release/win-unpacked`, rebuilt with a fresh engine sidecar): 3 of 3 each time.
- **By eye:** the Inspector's links, both pages and Similar tracks at 1,280 × 800 with the
  sidebar and the Inspector open, which is how the two layout defects above were found.

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

**Outcome** (2026-09-28): **Implemented.** inCrate, its inventory, its routes and the Tools group
are gone; the Library is home; `/incrate` and a remembered `incrate` open Discover, and `/` and a
remembered `tools` open the Library. The phase's journey passes end to end in a packaged Windows
build, three times in a row, over one Beatport fixture that answers Clean's matcher and the v4 API.

**What was deleted**, each after a search for its callers (recorded below): 30 files, about 8,000
lines.

- **Engine**: `incrate/enrichment.py`, `inventory_db.py`, `collection_parser.py`, `schema.sql`,
  `discovery.py`, `past_results_storage.py`, `playlist_writer.py` (the whole module: the push job
  never used its API path, and nothing else called it), `beatport_playlist_browser.py` and
  `models.py`; `services/inventory_service.py` and `incrate_discovery_service.py`, with
  `IInventoryService`, `IIncrateDiscoveryService` and their four DI registrations;
  `engine/incrate_api.py` and its six routes in `server.py`; `scripts/create_incrate_playlist.py`
  (DEC-099); the `schema.sql` entry in `build/engine-sidecar.spec`; and each module's tests.
- **The legacy catalog reads**: `BeatportApi.list_genres`, `list_charts`, `get_chart` and
  `get_label_releases`, the six parsers that guessed between nestings, `api_track_url_to_web`, their
  four caches, and the models only they built (`ChartSummary`, `ChartTrack`, `ChartDetail`,
  `LabelRelease`, `LabelReleaseTrack`, `DiscoveredTrack`). DISCOVER-01 said they would go here; with
  them went the 14 known type errors, so `beatport_api.py` joined the strict mypy gate once its label
  search's three were fixed.
- **`data/rekordbox.py::parse_collection`**, not in the specification's list: the caller search found
  that its only caller was `incrate/collection_parser.py`, and its comment's claim that it "serves
  the matching pipeline" was not true. It went with its 12 tests; the library's own parser is now the
  only COLLECTION parser.
- **Renderer**: `InCrateMainScreen`, `ToolSelectionScreen` and its test, and `hooks/useFileDrop.ts`,
  whose only user was inCrate's import; the CSS rules only those screens drew, and the `incrate`
  pixel icon.
- **The six contract files** lose `getIncrateInventory`, `importIncrateXml`, `resetIncrateInventory`,
  `getIncrateDiscoverOptions`, `runIncrateDiscover` and `createIncratePlaylist`, and the six
  `Incrate*` types. The Beatport token methods stay (DEC-098), and a test holds them.

**What moved.** The catalog models to `services/beatport_api_models.py`, beside the API and the
parsers that build them, and `playlist_name.py` to `services/`, beside the push that names a
playlist with it; both joined the strict mypy gate. `incrate/` now holds `beatport_oauth.py` alone,
untouched but for a docstring saying that nothing in the product calls it (DEC-098), and an
`__init__.py` saying where everything else went.

**The caller searches** (code, scripts and build files; generated PyInstaller output and the tests
that assert these names are absent excluded). Each returned nothing after the deletion:

| Searched for | Found |
| --- | --- |
| `InventoryService`, `IncrateDiscoveryService`, `incrate_api`, `enrich_labels_for_empty` | 0 |
| `inventory_db`, `collection_parser`, `past_results_storage`, `playlist_writer`, `beatport_playlist_browser` | 0 in code; `incrate.inventory_db_path` is a config key and stays |
| `create_incrate_playlist`, `schema.sql` | 0 in code, scripts and the sidecar spec |
| `InCrateMainScreen`, `ToolSelectionScreen`, `useFileDrop` | 0 |
| the six bridge methods, `/api/v1/incrate` | 0 |
| `list_genres`, `list_charts`, `get_chart(`, `get_label_releases`, the six legacy models, `parse_collection(` | 0 in code; two docstrings say they retired |

The specification's own check, `grep -rn "incrate_api\|InventoryService\|enrich_labels_for_empty"
src/`, is `test_retired_incrate.py::test_the_steps_own_search_finds_nothing`, which builds the names
from parts so it does not match itself.

**Navigation** (DEC-100): `HOME_DESTINATION_ID` is `library`; `NAV_GROUPS` is `workspace` and
`system`; `incrate` (→ Discover) and `tools` (→ the Library, at `/`) joined `RETIRED_DESTINATIONS`, so
the router redirects both paths and launch memory resolves both ids to the page that replaced
them. A path that matches nothing now **redirects** to the Library rather than rendering it in place,
so the address, the sidebar and launch memory agree on where the user is. Settings needed no change:
its token field never named inCrate, and its behavior is DEC-098's.

**Documentation.** Discover's user guide gains "Where inCrate went" — what replaced what, the two
files left behind and where each is on Windows, macOS and Linux, that nothing reads them and they can
be deleted by hand, and which five `incrate.` settings are read by nothing — and a paragraph on why
"not owned" depends on Clean's matches. The Library guide's DEC-030 note that two collection imports
can disagree is gone; there is one. The FAQ's four inCrate answers became "Where did inCrate go?" and
"What does a Discover run do?". `docs/features/incrate.md`, `docs/incrate-spec.md` and the five
`docs/feature/incrate-*` designs are marked historical and point to Discover; the Beatport token page
names Settings and Discover. ADR-007 (`007-discover-on-the-library.md`) records why discovery reads
the library, why ownership is computed, why an artist is a Beatport id or a name, and why similarity
is local. The changelog records the retirement and the removed routes as a breaking engine-API
change. The READMEs, the docs index, `AGENTS.md`'s map and the window guide say Discover and Library
home. `IncrateConfig`'s docstring says which of its keys are read and which are not.

**Where it differs from the specification, and why.**

- **`parse_collection` was deleted too**, as above: the caller search is the list, not the other way
  round.
- **The unmatched-path route redirects** rather than rendering home in place. Rendering in place was
  harmless while home was a landing page nobody stayed on; with the Library as home it would have
  shown the Library under a wrong address, with no sidebar entry lit and nothing remembered.
- **The parity test's answer is kept.** The specification deletes the parity test with inCrate. Its
  finding — the seven tracks inCrate found, in its order, in 19 requests — is now two values in
  `test_discovery_service.py`, measured against HEAD's inCrate before it went, so the port still
  cannot drift.
- **The chart regression test was rewritten, not deleted.** It imported inCrate's internals; it now
  holds `parse_catalog_chart`, `BeatportApi.charts` and `chart_curator` to the same recorded page and
  the same two bugs.
- **`test_beatport_genres.py`'s cache test stays**: a cache can still hold inCrate's first-page genre
  answer, and `genres()` must never read it as the whole listing.

**The journey** (`e2e/discoverPages.spec.ts`, "the whole of Phase 9"), in a packaged build, with
Beatport answered by `src/tests/fixtures/beatport/phase/`: import a four-track library with a
two-track playlist; match that playlist on the Clean page, both accepted automatically; resolve
Beatport identities from Discover's banner; run discovery over House and see the four tracks of Mara
Veil's chart with the two accepted hidden and counted ("2 owned tracks hidden"), then shown as Owned;
add one to the wantlist and push the two not owned to a new Beatport playlist ("Added 2 tracks to
“Journey push” on Beatport", with the playlist's link); open Mara Veil from the Inspector and land on
her page **by id** (`bp:301001`), "Beatport artist", with her two tracks and "4 tracks released since
…, 2 owned"; open Cold Room from the Inspector and land on its page **by name**, "Grouped by name" and
"Not found on Beatport"; play Signal from it; open Similar tracks for Signal and queue a suggestion
without interrupting; follow an old `/incrate` address to Discover and `/` to the Library; relaunch,
land on the Library, and reopen the kept run with the same tracks and why each was found.
`test_phase_journey_fixture.py` runs the same engine half on every build — offline, every
connection refused — and holds the fixture to it, including that nothing in the library's tables was
written (acceptance 10).

**Found and fixed on the way.**

- **The new fixture would never have been committed.** `.gitignore` ignores `*.json`;
  `test_regression_fixtures_not_ignored.py` caught it in the full suite, and it now has its
  exception beside DISCOVER-10's.
- **A fixture that ages.** An artist page keeps only tracks dated inside its window, so a fixture with
  fixed dates would stop passing as the calendar moved. The fixture loader now answers a body string
  `{{today-N}}` as that day's date, counted when the answer is sent, with its own tests.
- **Nineteen end-to-end tests assumed the app opened elsewhere.** With the Library as home it is
  already open when a test imports through the bridge, and it reads the library when it loads.
  Nothing in the product imports behind the page — only the Library page starts an import or a
  refresh, and it reloads itself after — so the tests, not the product, changed: each bridge import
  helper reloads the window afterwards, as a relaunch would, and says why.
- **One packaged run of the journey failed once**, at the push: the playlist notice never appeared.
  It did not happen again in ten more packaged runs, alone or beside the other specs. The step had
  one real race — adding to the wantlist reloads the run's table, and the next Ctrl-click could land
  mid-reload — so the journey now waits for the row to read "Wanted" before selecting again, checks
  the dialog names "the 2 selected tracks", and asserts the dialog closes, so a refusal would fail
  there, saying why, rather than as a missing notice.
- **The contract test's `\b`.** The new block's first draft wrote a word boundary a Python edit had
  turned into a backspace — the failure CLEAN-14's comment warns of, where a check silently matches
  nothing. It was caught before the test ran; the block carries the same comment.

**Tests.**

- Python: `test_retired_incrate.py` (35: every retired route answers as an unknown path does, with
  and without the token; every retired module is gone and every moved one answers only at its new
  address; `incrate/` holds only the OAuth helpers; the schema and script are gone; the step's search;
  nothing in the product names inCrate's files; a running engine leaves both files byte for byte and
  with their times; every `incrate.` key still loads), `test_phase_journey_fixture.py` (1, the
  journey's engine half), `TestRelativeDays` (9), the pinned parity values (2), the rewritten chart
  regression (5), the sidecar's "no retired schema" (1).
- Renderer: the registry (Library home, no Tools group, the four redirects), launch memory (a
  remembered `incrate`, `tools` or nothing, from storage too, and every retired id reaching its own
  replacement), the App (Library on first launch, `/incrate`, `/` and an unknown path redirected, a
  remembered `incrate` or `tools`, the redirect's page remembered), the sidebar, the contract test's
  DISCOVER-12 block (8), `retiredModules.test.ts` with the three modules and six methods, and the
  pixel-icon test now checking every registry icon exists.
- End to end: the phase journey; `incrateLeftovers.spec.ts`, inCrate's files and settings left
  exactly as they were across a whole session; `shell.spec.ts` gains a relaunch with a remembered
  `tools` and `incrate` and now expects the Library on first paint and Discover remembered.
- **Deliberate breakages**: 19, each caught by its test — home back on Tools, the `incrate` or `tools`
  redirect removed or pointed elsewhere, an unknown path rendered in place, a Tools group restored,
  an inCrate method left in the preload, an inCrate interface declared, a relative day counted the
  wrong way or not at all, an unused key no longer loaded, the schema bundled again, a chart by an
  account counting for nobody, a chart's artist dropped, the journey's chart answering nothing, and a
  wantlist add writing to the library's tracks; and, for the leftovers spec, an engine that touches
  the inventory's time, rewrites the past results, or leaves a journal beside the inventory.

**Checks run**: see the phase acceptance below for the full list and numbers.

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

## Phase 9 acceptance, checked (2026-09-28)

In a packaged Windows build unless said otherwise; the macOS packaged checks are owed, as for Phases 5,
7 and 8. Every automated check uses a mocked Beatport. The live API was recorded by DISCOVER-01's
spike (2026-09-23) with the developer's token; **one manual pass through the app against the live
API is owed** — this step does not read the developer's token, by rule.

1. **Met.** A run's artists and labels are the library's effective values: a label set by an override
   is in scope and a label it replaced is not (DISCOVER-05's tests). Nothing reads inCrate's inventory:
   the code is deleted, nothing in the product names its file, and a running engine leaves the file
   byte for byte (`test_retired_incrate.py`).
2. **Met.** A run is a job in the status strip, stoppable, and keeps what it found when stopped
   (DISCOVER-05, DISCOVER-10). The phase journey relaunches and reopens the run with the same tracks
   and the chart each was found in.
3. **Met.** A second run over the same labels makes no label searches (DISCOVER-05: 2,708 requests
   first, 1,108 second, none of them label searches).
4. **Met.** The journey's run hides its two accepted tracks, says "2 owned tracks hidden", and shows
   them marked Owned on the toggle. Ownership is computed on read, so a track accepted after a run
   reads as owned when the run is reopened (DISCOVER-04's and DISCOVER-05's tests).
5. **Met.** The journey's wantlist entry is there after the relaunch. Bought and owned are separate
   filters, and nothing removes an entry on its own (DISCOVER-06, DISCOVER-10).
6. **Met.** The journey pushes two tracks: "Added 2 tracks", owned tracks left out by default, and the
   playlist's real URL (`test_phase_journey_fixture.py` holds it:
   `https://www.beatport.com/library/playlists/5550101`). A token without playlist scope is refused
   with that reason (DISCOVER-06, DISCOVER-09).
7. **Met.** The journey opens Mara Veil's page by id and Cold Room's by name. Each shows the library
   half, which plays as the queue, and the Beatport half, marked owned or not; the name page says
   "Grouped by name". Save as Smart Collection saves the page's own rules (DISCOVER-11's tests).
8. **Met.** With no token and with a rejected token, Discover, a page's Beatport half and the push
   each show an explained state pointing to Settings, and the library halves and Similar tracks work
   (DISCOVER-10's journey, DISCOVER-11's tests).
9. **Met.** Similar tracks gives the same list for the same library, every suggestion states its
   reasons, and the seed and its duplicates are absent (DISCOVER-08's tests; the journey's list).
10. **Met.** No discovery, wantlist, page or similarity action writes a library table:
    `test_phase_journey_fixture.py` snapshots eleven of them before resolution and compares after the
    run, the wantlist, the push, both pages and Similar tracks. Nothing here writes audio or XML: the
    file-write boundary test (CLEAN-10) names every module that can, and none of Phase 9's is one.
11. **Met.** No Tools group and no inCrate in the sidebar; `/incrate` opens Discover and `/` the
    Library (the journey); a remembered `tools` or `incrate` opens the Library or Discover, and a
    launch with nothing remembered opens the Library (`shell.spec.ts`).
12. **Met.** In a packaged build, `e2e/incrateLeftovers.spec.ts` puts the inventory database,
    `incrate_past_results.json` and a `config.yaml` holding every `incrate.` key where a real install
    has them, runs a session — a library imported, every Discover read, the old `/incrate` address
    followed, Settings — and quits. All three keep their bytes and times, no journal appears beside the
    inventory, and the settings still load (Discover's release window and playlist-name format are the
    file's). Three deliberate breakages of the engine — touching the inventory's time, rewriting the
    past results, leaving a journal — each fail it. `test_retired_incrate.py` holds the same for every
    retired route against an engine in the test process.
13. **Met**, measured at 50,000 tracks in the steps that built each: the credit backfill 0.94–1.34 s
    and the artist and label facets 93 and 97 ms (DISCOVER-03); a run's library reads 47–229 ms
    (DISCOVER-05); an Artist and a Label page's library half 25–29 and 43–47 ms (DISCOVER-07); a
    Similar tracks list for the densest tempo band 327 ms (DISCOVER-08).
14. **Met.** Every `/api/v1/incrate/*` route answers 404 exactly as an unknown path does
    (`test_retired_incrate.py`), and the changelog records it as a breaking engine-API change.

**Checks run** (2026-09-28): the full Python suite (9,920 passed, 62 skipped, after the one failure
it found — the ignored fixture — was fixed); ruff 0.14.0 check and format; the strict mypy gate with
three more modules; the Qt guard; version coupling; the renderer's type-check, lint (the 8 existing
warnings) and 3,186 tests; the Electron type-check and 490 tests; the whole end-to-end suite on the
development build (55 passed, 1 skipped); and, against a freshly packaged
`release/win-unpacked/CuePoint.exe`, `discoverPages.spec.ts` (both journeys), `discover.spec.ts` and
`shell.spec.ts` — 12 tests — three times in a row after the push step's fix, and
`incrateLeftovers.spec.ts` three times in a row; 19 deliberate breakages, each caught.

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
