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

1. **Entry points**: CLI is run from **project root** as `python main.py` (root `main.py` delegates to `src/main.py`). GUI: `src/gui_app.py` or `run_gui.bat` / `run_gui.command` / `run_gui.sh` from root.
2. Start at `src/main.py` (CLI) or `src/gui_app.py` (GUI).
3. Follow `CLIProcessor` or GUI controller into `ProcessorService`.
4. Trace `ProcessorService.process_track()` → `MatcherService.find_best_match()` → `core/matcher.best_beatport_match()`.
5. For Beatport data flow: `BeatportService` (in `services/beatport_service.py`) uses `data/beatport.py` and `data/beatport_search.py`; `beatport_service.fetch_track_data()` → `data/beatport.parse_track_page()`.

## Related Docs

- [Match Rules & Scoring](match-rules-and-scoring.md)
- [Beatport Parsing](beatport-parsing.md)
- [Project README](https://github.com/stuchain/CuePoint/blob/main/README.md)
