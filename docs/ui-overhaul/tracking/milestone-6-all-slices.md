# Milestone 6+ — tracking (all remaining slices)

**Status:** Done — inCrate discover/playlist, Qt match layout, sticky columns

## inCrate Discover + Playlist (Electron)

- [x] Engine `GET /api/v1/incrate/discover/options`
- [x] Engine `POST /api/v1/incrate/discover` (+ `demo: true`)
- [x] Engine `POST /api/v1/incrate/playlist`
- [x] Electron IPC + `InCrateMainScreen` discover/playlist UI
- [x] Tests: `test_engine_incrate_discover.py`

## Qt Phase A — match equal-height panels

- [x] Input | Processing two-column layout in `main_window.py`
- [x] Results remain full-width below match row

## Qt Phase B — sticky Write + Index

- [x] `ResultsFrozenTableHost` dual-table wrapper
- [x] Wired in `results_view.py` (single-mode table)
- [x] `sticky_left_offset()` helper + tests

## Prior Milestone 6 (same branch)

- [x] Beatport token via engine config API
- [x] Results empty state when engine connected

See [next-milestone.md](../next-milestone.md).
