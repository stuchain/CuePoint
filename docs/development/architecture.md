# Architecture Overview

Design 10.25. High-level pipeline and core services.

## Pipeline Flow

```
Input (Rekordbox XML) → Parse → Query Generation → Search → Match/Score → Output (CSV/JSON/Excel)
```

1. **Parse**: Load XML, extract playlists and tracks (`src/cuepoint/data/rekordbox.py`)
2. **Query Generation**: Build search queries from title/artist (`src/cuepoint/core/query_generator.py`)
3. **Search**: Find Beatport track URLs via DuckDuckGo, direct search, or browser (`src/cuepoint/data/beatport.py`)
4. **Match/Score**: Fetch candidate pages, score with fuzzy matching, apply guards (`src/cuepoint/core/matcher.py`)
5. **Output**: Write CSV/JSON/Excel with enriched metadata (`src/cuepoint/services/output_writer.py`)

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
`/api/v1/library/facets` (a field's values, for filter suggestions),
`/api/v1/library/filter-fields` (the filter vocabulary the UI builds its
controls from) and `/api/v1/library/tracks/{id}` (one track and its playlists,
for the Inspector).

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

1. **Entry points**: CLI is run from **project root** as `python main.py` (root `main.py` delegates to `src/main.py`). Desktop UI runs from `apps/desktop-electron/` via Electron. `src/gui_app.py` is legacy fallback only during Phase 10 transition.
2. Start at `src/main.py` (CLI) or `apps/desktop-electron/electron/main.ts` + `apps/desktop-electron/renderer/src/App.tsx` (desktop UI).
3. Follow `CLIProcessor` or GUI controller into `ProcessorService`.
4. Trace `ProcessorService.process_track()` → `MatcherService.find_best_match()` → `core/matcher.best_beatport_match()`.
5. For Beatport data flow: `BeatportService` (in `services/beatport_service.py`) uses `data/beatport.py` and `data/beatport_search.py`; `beatport_service.fetch_track_data()` → `data/beatport.parse_track_page()`.

## Related Docs

- [Match Rules & Scoring](match-rules-and-scoring.md)
- [Beatport Parsing](beatport-parsing.md)
- [Project README](https://github.com/stuchain/CuePoint/blob/main/README.md)
