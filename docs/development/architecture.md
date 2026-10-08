# Architecture Overview

Design 10.25. High-level pipeline and core services.

## Pipeline Flow

The matching pipeline is shared. What feeds it differs: the **CLI** parses a
playlist from an XML file and writes CSV/JSON/Excel, as below; the **desktop
app** matches tracks from its library and stores every attempt in SQLite — see
[Matching (desktop)](#matching-desktop) and
[ADR-005](../ui-overhaul/adr/005-matching-on-the-library.md).

```
CLI:     Input (Rekordbox XML) → Parse → Query Generation → Search → Match/Score → Output (CSV/JSON/Excel)
Desktop: Library tracks → Query Generation → Search → Match/Score → match_attempts / match_candidates → state
```

1. **Parse**: Load XML, extract playlists and tracks (`src/cuepoint/data/rekordbox.py`)
2. **Query Generation**: Build search queries from title/artist (`src/cuepoint/core/query_generator.py`)
3. **Search**: Find Beatport track URLs via DuckDuckGo, direct search, or browser (`src/cuepoint/data/beatport.py`)
4. **Match/Score**: Fetch candidate pages, score with fuzzy matching, apply guards (`src/cuepoint/core/matcher.py`)
5. **Output**: Write CSV/JSON/Excel with enriched metadata (`src/cuepoint/services/output_writer.py`) — the CLI's step

## Core Services

| Service | Location | Role |
| --- | --- | --- |
| ProcessorService | `services/processor_service.py` | Orchestrates per-track processing |
| MatcherService | `services/matcher_service.py` | Wraps `core/matcher.py` |
| BeatportService | `services/beatport_service.py` | Fetches and parses Beatport pages |
| ConfigService | `services/config_service.py` | Configuration and presets |
| OutputWriter | `services/output_writer.py` | Export to CSV/JSON/Excel |

## Key Modules

| Module | Purpose |
| --- | --- |
| `core/matcher.py` | Matching and scoring logic |
| `core/query_generator.py` | Search query generation |
| `core/text_processing.py` | Normalization, similarity scoring |
| `core/mix_parser.py` | Remix/extended/original mix parsing |
| `data/beatport.py` | Beatport search and page parsing |
| `data/rekordbox.py` | Rekordbox XML parsing |

## How a Track Is Matched

The same matcher serves the CLI and the desktop app. These are its parts, in the order a track meets them.

**Input.** `data/rekordbox.py` extracts playlists and track rows from the XML export. If a track has no artist, the artists are taken from the title. Titles are cleaned with `sanitize_title_for_search` before queries are built.

**Query generation** (`core/query_generator.py`) builds a set of query variants in stages:

- **Priority queries**: the full title with artist combinations.
- **N-gram queries**: title fragments of one to N words.
- **Remix queries**: the remixer and mix type, when the title names them.
- **Special phrases**: parenthetical phrases such as "(Ivory Re-fire)".
- **Reverse queries**: "Artist Title", optionally.

The count is bounded by the `TITLE_GRAM_MAX`, `MAX_QUERIES_PER_TRACK` and `CROSS_TITLE_GRAMS_WITH_ARTISTS` settings.

**Search** (`data/beatport_search.py`, `data/beatport.py`) combines methods: direct search of Beatport's pages and endpoints, DuckDuckGo (through `ddgs`) to find track URLs, and browser automation (Playwright or Selenium) when a page is rendered by JavaScript. `services/beatport_service.py` is the entry point; it caches search results and logs diagnostics.

**Candidate parsing** (`data/beatport.py`, `parse_track_page`) reads a track page into its title, artists, key, year, BPM, label, genre, release name and release date. Parsed pages are cached.

**Scoring** (`core/matcher.py`) weights title and artist similarity, then adds bonuses for a matching key or year, for the mix type (remix or original mix) and for special phrases. **Guards** reject false positives early: a title that matches on too few significant tokens, weak overlap between title and artist tokens, and title-only checks when the artist is missing. If a candidate scores high enough, the matcher stops early (`EARLY_EXIT_SCORE`, `EARLY_EXIT_MIN_QUERIES`).

**Concurrency.** Tracks are processed in parallel (`TRACK_WORKERS`), candidates for one track are fetched in parallel (`CANDIDATE_WORKERS`), and `PER_TRACK_TIME_BUDGET_SEC` caps the time spent on a track. A `SEED` setting makes ordering and tie-breaking repeatable.

**Output.** The CLI's writer (`services/output_writer.py`) produces the main CSV (one row per track), a candidates CSV (every candidate with its score), a queries CSV (an audit trail of the queries run) and, when any track falls below the acceptance threshold, a review CSV with matching review candidates and queries files. The desktop app stores attempts and candidates in SQLite instead (see [Matching (desktop)](#matching-desktop)).

**Configuration** is layered: defaults in `models/config.py` (`SETTINGS`), overridden by `config.yaml` (the template is `config/config.yaml.template`), overridden by CLI flags and presets such as `--fast`, `--turbo` and `--exhaustive`. Nested YAML keys are mapped to the flat `SETTINGS` names, and you can also write the uppercase names directly.

**Constraints.** A valid Rekordbox XML export is required. Match quality depends on Beatport's availability and metadata, and search speed on the network.

## The desktop app (process model)

```
React renderer  ->  window.cuepoint (preload.cjs, contextBridge)  ->  Electron main (IPC)
  ->  loopback HTTP + SSE, bearer token  ->  cuepoint.engine (Python)  ->  services / core / data
```

- **Renderer** (`apps/desktop-electron/renderer/src/`): React. It presents state and holds no business rules. It runs with context isolation on and no Node access, and reaches everything through the `window.cuepoint` bridge.
- **Preload** (`apps/desktop-electron/electron/preload.cjs`): the runtime preload, which exposes narrow methods that forward to IPC handlers in `main.ts`.
- **Electron main** (`electron/main.ts`): creates the window, shows native dialogs, and supervises two child processes. `engineSupervisor.ts` starts the Python engine on `127.0.0.1` on a free port with a per-session bearer token (in development `python -m cuepoint.engine`; packaged, the PyInstaller engine sidecar). `playerSupervisor.ts` starts the bundled mpv player. `engineClient.ts` makes the authenticated calls and relays job events (SSE) to the renderer.
- **Engine** (`src/cuepoint/engine/`): an HTTP server. Only `/health` is unauthenticated. Everything under `/api/v1/` needs the bearer token. Long work runs as jobs (`jobs.py`) whose progress streams from `/api/v1/jobs/{id}/events`.

The pages below describe two of the paths through it in detail.

## Library Browsing (desktop)

The Library page browses a collection that does not fit in the renderer. Every
question about it — a window of rows, a count, a facet's values, the ids behind
a selection — is answered by SQLite and travels the full desktop path; the
renderer holds no library.

```
TrackTable (virtualized)
  -> useTrackWindow          renderer/src/screens/library/useTrackWindow.ts
  -> window.cuepoint.browseLibrary                   preload (contextBridge)
  -> IPC -> engineClient.ts -> loopback HTTP (bearer)
  -> GET /api/v1/library/search                     engine/server.py
  -> library_api.search_library                     engine/library_api.py
  -> LibraryService.browse_tracks                   services/library_service.py
  -> persistence/track_query.py                     one windowed SQL statement
```

The statement chooses the window by ids and sort keys first, then reads the
hundred rows asked for (CLEAN-14): sorting whole rows made a window deep into a
50,000-track library sorted by anything but artist cost 0.6 s.

Two properties hold this together:

- **The window is a query, not a slice.** Scope, sort, direction, text and
  filters go to SQLite; `LIMIT`/`OFFSET` is applied there. Sorting 50,000 tracks
  re-asks the engine rather than re-ordering anything in JavaScript.
- **A response says what it answers.** `search_library` echoes back the mode,
  scope, sort, direction and filter set it computed for, and the renderer drops
  any response that does not answer the question being asked now
  (`libraryQuery.ts`). This is why a fast sequence of clicks cannot leave the
  table showing the previous sort's rows.

Related surfaces on the same path: `/api/v1/library/playlists` (the tree),
`/api/v1/library/facets` (a field's values, for filter suggestions; and, as
`POST` with the view as its body, the Key, BPM and Genre quick filters' lists:
keys in Camelot order, `no_key`, the BPM range and the 30 most common genres),
`/api/v1/library/filter-fields` (the filter vocabulary the UI builds its
controls from) and `/api/v1/library/tracks/{id}` (one track and its playlists,
for the Inspector).

## Matching (desktop)

Since Phase 7 (DEC-065, DEC-071) the desktop app matches **library tracks**.
There is no file-based match job, no past-searches listing and no results
export on the engine API any more; the CLI keeps its own file-based path.

```
Clean page (ReviewView) / Library actions
  -> window.cuepoint.startCleanMatch | resumeCleanMatch       preload
  -> POST /api/v1/clean/match | /clean/match/resume           engine/clean_api.py
  -> match_jobs.start_match_job / resume_match_job            engine/match_jobs.py (a job)
  -> MatchService.run                                         services/match_service.py
       -> ProcessorService.process_track (the shared matcher, unchanged)
       -> MatchRepository.add_attempt   (every candidate, DEC-066)
       -> MatchStateService.apply_attempt (accepted / needs review, DEC-067)
  -> review: /clean/decide, /clean/apply                         decisions and overrides
  -> export: /clean/export                                     the review list
  -> files:  /clean/tags/preview, /write, /restore               CLEAN-10's recorded writes
```

- **A match is a resumable job.** Its plan is stored per track
  (`match_job_tracks`), so a stopped or interrupted match resumes over what it
  had not reached; the Clean page and the Activity panel offer it.
- **Beatport can be answered from files** for end-to-end tests:
  `CUEPOINT_BEATPORT_FIXTURE` names a fixture read by `data/beatport_fixture.py`
  at the three network edges (search, track page, image). The matcher still
  parses and scores what it is given.

## Architecture Diagram (ASCII)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Rekordbox XML   │────▶│ Rekordbox Parser │────▶│ Track List      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Beatport URLs   │◀────│ Query Generator   │◀────│ Per-Track Loop  │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ parse_track_page │────▶│ BeatportCandidate │────▶│ Matcher (score) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ CSV / JSON      │◀────│ Output Writer     │◀────│ TrackResult     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Code Reading Guide

1. **Entry points**: CLI is run from **project root** as `python main.py` (root `main.py` delegates to `src/main.py`). Desktop UI runs from `apps/desktop-electron/` via Electron.
2. Start at `src/main.py` (CLI) or `apps/desktop-electron/electron/main.ts` + `apps/desktop-electron/renderer/src/App.tsx` (desktop UI).
3. Follow `CLIProcessor` (CLI) or `MatchService` (desktop) into `ProcessorService`.
4. Trace `ProcessorService.process_track()` → `MatcherService.find_best_match()` → `core/matcher.best_beatport_match()`.
5. For Beatport data flow: `BeatportService` (in `services/beatport_service.py`) uses `data/beatport.py` and `data/beatport_search.py`; `beatport_service.fetch_track_data()` → `data/beatport.parse_track_page()`.

## Related Docs

- [Match Rules & Scoring](match-rules-and-scoring.md)
- [Beatport Parsing](beatport-parsing.md)
- [Beatport v4 API Reference](beatport-v4-api.md) (what Discover uses)
- [Project README](https://github.com/stuchain/CuePoint/blob/main/README.md)
