# CuePoint — Current Architecture (Phase 0 Audit)

Status: **Complete for Phase 0**. This document is a factual snapshot of the repository as it
exists today (2026-09-01, `feature` branch, HEAD `f010968`). It makes no product recommendations
— see `GAP_ANALYSIS.md` for that. Produced under the CuePoint evolution spec's design-only mode;
no production code was modified to produce this document.

Context: CuePoint just completed a deliberate Qt → Electron-only migration (`docs/ui-overhaul/`,
commits through `6d246ad phase10: Electron-only gui_app and drop Qt from product path`). The
desktop UI is React (`apps/desktop-electron/renderer/`) → `window.cuepoint` preload bridge →
Electron main → authenticated loopback HTTP/SSE → Python engine. A CLI (`main.py` → `src/main.py`)
is the other supported interface. Both sit on the same `src/cuepoint/` core.

---

## 1. Domain / data model

Everything is a plain **dataclass** — no ORM, no pydantic in `src/cuepoint/models/` or `compat/`.

- `models/track.py` — `Track`: `title, artist, album, duration, bpm, key, year, genre, label, position, file_path, track_id`. Validates in `__post_init__`.
- `models/playlist.py` — `Playlist`: `name, tracks: List[Track], file_path, created_date, modified_date`.
- `models/beatport_candidate.py` — `BeatportCandidate`: metadata fields (`label, release_date, bpm, key, genre, remixers, artwork_url, preview_url, subgenre`, etc.) + scoring/audit fields (`score, title_sim, artist_sim, base_score, bonus_year, bonus_key, guard_ok, reject_reason, elapsed_ms, is_winner`).
- `models/result.py` — `TrackResult`: the central row model. Joins `Track` + `best_match: Optional[BeatportCandidate]` + `candidates: List[BeatportCandidate]` + flattened `beatport_*` fields + `candidates_data`/`queries_data` (list-of-dict, kept for CSV/export back-compat).
- `models/config_models.py` — nested config dataclasses composed into `AppConfig`.
- `models/preflight.py`, `models/run_summary.py` — supporting types.
- **`compat/gui_types.py` — a second, near-duplicate `TrackResult` dataclass** (lines 52–104), plus `ProgressInfo`, `ProgressCallback`, `ProcessingController` (thread-safe cancel/pause via `threading.Lock`/`Event`), `ErrorType`, `ProcessingError`. Docstring: extracted from the old `cuepoint.ui.gui_interface` package during the Phase 10 Qt removal. **`engine/jobs.py` imports `TrackResult` from `compat.gui_types`, not `models.result`** — two structurally different `TrackResult` types coexist under the same name (the compat one has `candidates: List[Dict]` vs the models one's `candidates: List[BeatportCandidate]`).
- `models/compat.py` — shim converters (`track_from_rbtrack`, `beatport_candidate_from_old`, `track_result_from_old/to_old`) bridging legacy dict formats to the dataclasses.
- `core/matcher.py::MatchRow` — internal scoring row used before conversion to `BeatportCandidate`.

**Persistence today**: almost entirely in-memory, one-shot batch, with CSV/JSON/Excel export as the
durable artifact. **The only real SQLite database in the codebase is `incrate/inventory_db.py`**
(schema in `incrate/schema.sql`) — a library-track inventory (`track_key, artist, title,
remix_version, label, beatport_track_id, beatport_url, created_at, updated_at`) used solely by
inCrate. `services/checkpoint_service.py` persists run-resume state as a single JSON file
(`cuepoint_checkpoint.json`), not a database. Config persists to `~/.cuepoint/config.yaml`. There
is **no relational store for `Track`/`TrackResult`/match history** — "history" today means
re-reading prior CSV exports (`engine/history_api.py`).

## 2. Services layer (`src/cuepoint/services/`)

14 concrete service classes. Notable sizes: `processor_service.py` 2220 lines, `output_writer.py`
1288, `beatport_api.py` 970, `config_service.py` 444, `export_service.py` 431, `integrity_service.py` 618.

- **`ProcessorService`** — orchestration god-class: `process_track()`, `process_playlist()`, `process_playlist_from_xml()` (preflight → parse XML → resolve playlist → `ThreadPoolExecutor` dispatch → checkpointing → progress callbacks), `process_playlist_from_m3u()`, `run_preflight()` (error codes P001–P050). Covers orchestration, validation, and I/O in one 2220-line class — a natural decomposition candidate.
- **`MatcherService`** — thin stateless wrapper over `core.matcher.best_beatport_match()`.
- **`BeatportService`** — `search_tracks()`/`fetch_track_data()` via `data/providers.get_active_provider()`, wrapped in retry/circuit-breaker (`reliability_retry.py`, `circuit_breaker.py`). Honors `CUEPOINT_SKIP_BEATPORT` for CI.
- **`ConfigService`** — dot-notation get/set over `AppConfig`, **with a parallel legacy flat-dict `SETTINGS` fallback** (`_map_to_legacy_key`) — an incomplete migration.
- **`ExportService`** / **`OutputWriter`** (module of functions) — CSV/JSON/Excel export, path validation, checksum/audit-log writing.
- **`CacheService`** — in-memory dict, per-entry TTL, no persistence.
- **`CheckpointService`** — JSON-file resume/crash-recovery, XML-hash validated.
- **`InventoryService` / `IncrateDiscoveryService` / `BeatportApi`** — inCrate's own SQLite-backed inventory + Beatport REST client (charts/labels), separate from the scraping-based `BeatportService`.
- **`LoggingService`, `TelemetryService`** (opt-in), **`SecurityService`, `PrivacyService`, `OnboardingService`, `IntegrityService`, `SchemaMigrationService`**.
- **DI**: manual service-locator, `utils/di_container.py::DIContainer` (`register_singleton`, `register_factory`, `resolve` by interface type). `services/bootstrap.py::bootstrap_services()` wires everything by hand. Both `src/main.py` (CLI) and `engine/jobs.py::_ensure_services()` (lazily, thread-safe) call it. Interfaces (`services/interfaces.py`, ABCs): `ILoggingService, ICacheService, IConfigService, IExportService, IMatcherService, IBeatportService, ITelemetryService, IProcessorService`. `InventoryService, IncrateDiscoveryService, PrivacyService, OnboardingService, SecurityService, CheckpointService` have **no interface** — used as concrete classes directly.

## 3. Engine layer (`src/cuepoint/engine/`)

Not FastAPI/Flask — a **hand-rolled `http.server.ThreadingHTTPServer` + `BaseHTTPRequestHandler`**
(`engine/server.py`). `EngineConfig` (frozen dataclass) enforces loopback-only hosts
(`127.0.0.1`/`localhost`/`::1`); `from_env()` reads `CUEPOINT_HOST/PORT/TOKEN`. Auth is a static
in-memory bearer token checked in `_authorized()`; only `/health` is unauthenticated (confirms the
AGENTS.md invariant). Routing is manual `if path ==` chains + two regexes — not a router library.

**Route surface**: `/health`, `/api/v1/status`, `/api/v1/jobs/match` (POST), `/api/v1/jobs/{id}`,
`/api/v1/jobs/{id}/results`, `/api/v1/jobs/{id}/events` (SSE), `/api/v1/jobs/{id}/cancel`,
`/api/v1/export`, `/api/v1/tags/sync`, `/api/v1/support/bundle`, `/api/v1/incrate/*`
(import/reset/discover/playlist/inventory/discover-options), `/api/v1/history/recent`,
`/api/v1/history/load`, `/api/v1/xml/playlists`, `/api/v1/config/beatport-token(/test)`,
`/api/v1/logs/*`, `/api/v1/privacy/clear-logs`, `/api/v1/privacy/clear-cache`. Each domain has its
own `*_api.py` (`config_api.py, export_api.py, history_api.py, incrate_api.py, logs_api.py,
privacy_api.py, sync_tags_api.py, support_bundle_api.py, xml_api.py`), imported and dispatched
inline by `server.py`.

**Jobs** (`engine/jobs.py`, 769 lines): `JobState` enum (`QUEUED, RUNNING, SUCCEEDED, FAILED,
CANCELLED`), `MatchJob` dataclass, `JobStore` (single `threading.Lock`, in-memory dict — **no
persistence, no process pool, no queue/backpressure**). Each job = one daemon `threading.Thread`.
Cancellation is cooperative via `ProcessingController` (poll-based, not preemptive). Runner
variants: `run_demo_match_job`/`run_demo_batch_match_job` (Electron-dev synthetic data),
`run_real_match_job`, `run_real_batch_match_job`, `run_real_m3u_match_job`.

**SSE** (`engine/job_events.py::iter_job_events()`): a **polling generator** (`time.sleep(0.2)`,
15s heartbeats, 300s timeout) — not real pub/sub. `server.py::_stream_job_events()` writes frames
directly to the socket.

## 4. Threading / concurrency model

No asyncio anywhere. Everything is `concurrent.futures.ThreadPoolExecutor` / `threading.Thread` /
`threading.Lock`. No multiprocessing.

- Pipeline parallelism: `process_playlist_from_xml()` / `_from_m3u()` use `ThreadPoolExecutor(max_workers=track_workers)` per track, with `as_completed()`, a `progress_lock`, and manual future-cancellation on `controller.is_cancelled()`. `track_workers` set by config presets (e.g. `--myargs` → `TRACK_WORKERS=16`).
- Candidate-fetch concurrency (`CANDIDATE_WORKERS`) is internal to `core/matcher.py::best_beatport_match`.
- Engine: each `POST /api/v1/jobs/match` spawns a new daemon thread; `ThreadingHTTPServer` gives one thread per HTTP connection, so jobs/SSE/status polling run concurrently with **no bound on concurrently-running job threads**.
- Cancellation is cooperative everywhere via `ProcessingController` (a `threading.Event` for pause, boolean+lock for cancel) — pipeline code polls between track dispatches, no thread interrupts.

## 5. Configuration

`ConfigService` is the single source of truth. Priority: CLI flags > env vars (`CUEPOINT_*`) > user
YAML (`~/.cuepoint/config.yaml`) > code defaults (`AppConfig.default()`). **Two config surfaces
coexist**: the structured `AppConfig` dataclass tree (dot-notation) and a legacy flat dict
`SETTINGS` (`models/config.py`, e.g. `TRACK_WORKERS`, `MIN_ACCEPT_SCORE`) bridged by
`_map_to_legacy_key()` — acknowledged incomplete migration. `validate()` checks numeric ranges
across sub-configs. Engine bearer token / other secrets are handled separately (in-memory only).

## 6. CLI (`src/main.py`, via root `main.py`)

Flow: early-exit subcommands (`--maintenance-report`, `migrate`) → `bootstrap_services()` → resolve
`IProcessorService`/`IExportService`/`IConfigService`/`ILoggingService` → construct `CLIProcessor`
(`cuepoint/cli/cli_processor.py`) → large `argparse` surface (`--xml/--playlist/--out`, speed
presets `--fast/--turbo/--exhaustive/--all-queries/--myargs` — each independently hardcodes
5–15 `config_service.set()` calls, a duplication/layering risk — `--verbose/--trace/--debug`,
`--seed`, `--config`, `--auto-research`, `--no-preflight/--preflight-only/--dry-run`,
`--max-workers`, `--benchmark`, `--verify-outputs/--no-checksums/--no-audit-log/--review-only`,
`--resume/--incremental/--no-resume`, `--provider`, `--show-privacy/--terms`,
`--telemetry-enable/--disable`, `--export-support-bundle`, `--checkpoint-every/--max-retries`) →
apply presets/overrides → `cli_processor.process_playlist(...)`.

## 7. Updater — orphaned Qt subsystem

`docs/features/update-system.md` describes a Sparkle-style appcast system
(`update/update_checker.py`, `update_manager.py`, `update_ui.py`, `update_downloader.py`,
`update_installer.py`, `update/security.py`, `update_preferences.py`,
`scripts/generate_appcast.py`). **This entire module is built on PySide6/Qt**
(`QObject, Signal, QNetworkAccessManager, QApplication, QTimer, QMessageBox`). It is **not wired
into the Electron product path**: no `electron-updater`/`autoUpdater` anywhere in
`apps/desktop-electron/electron`, and `src/gui_app.py` (the Electron launcher) never references
`update`. `docs/release/known-issues.md` already logs "Update fails on some Windows 10
configurations" as an open, under-investigation issue — consistent with this being dead/orphaned
functionality post-Qt-removal rather than a working feature. **Auto-update is effectively
non-functional for the shipped Electron app today.**

## 8. Rekordbox XML parsing (`src/cuepoint/data/rekordbox.py`)

**Parses**: tracks (`COLLECTION/TRACK`) and playlists/folders (`PLAYLISTS/NODE`).
`parse_rekordbox()` returns a flat `Dict[str, Playlist]` (folders dissolved). **`parse_playlist_tree()`
is folder-aware** — `Type="0"` = folder, `Type="1"` = playlist — returns `(tree_roots,
playlists_by_path)` with paths like `"Folder/SubFolder/Playlist Name"`; this is the existing nested-
folder mechanism. `parse_collection()` is a separate low-memory `iterparse` streaming reader (used
by inCrate's inventory import).

**Fields extracted**: `TrackID`/`ID`/`Key` (identity), `Name`/`Title`, `Artist`/`Artists`,
`Remixer` (falls back to title-derived), `Label`, `Location` (URL-decoded file path).
**Rating, PlayCount, Colour, DateAdded are not parsed at all today.**

**Identity**: **`TrackID` (string) is the sole identity**, resolved as `TrackID or ID or Key`. No
path- or content-hash-based identity for COLLECTION tracks. inCrate mirrors this
(`InventoryRecord.track_key()` = `track_id` directly).

**Round-tripping**: no full XML re-export exists. `write_updated_collection_xml()` does a narrow,
non-destructive **attribute patch**: mutates only `Key/Tonality, Comment, Year, BPM, Label, Genre`
on matching `COLLECTION/TRACK` elements by TrackID, writing via atomic temp-file +
`Path.replace()` to an explicit **new** output path (never silently overwrites the source).
`build_rekordbox_updates(_batch)()` builds the `track_id -> {attr: value}` map from `TrackResult`,
respecting a `sync_options` dict (key format, per-field toggles, custom comment text). **The
dominant write path is actually direct audio-file tag writing, not XML writing** (see §16).

## 9. Query generation & mix parsing

`core/query_generator.py::make_search_queries()` builds ~10 priority-ordered query stages (exact
quoted title, base-title + artist(s), base-title + "Original Mix", remixer combos, N-gram
fallbacks), deduplicated, capped at `SETTINGS["MAX_QUERIES_PER_TRACK"]` (default 200).
`core/mix_parser.py` detects mix type (original/extended/club/radio/edit/remix/dub/vip/
rework/refire/acapella/instrumental via `MIX_PATTERNS`) and extracts remixer names/phrases —
feeds both query construction and later scoring bonuses in `matcher.py`.

## 10. Beatport search/fetch (`data/beatport.py`, `data/beatport_search.py`)

`track_urls()` chooses between direct search (API/HTML), browser automation (Playwright/Selenium,
gated), and DuckDuckGo `site:beatport.com` search, with heuristics favoring direct search for
remix/original-mix queries. `parse_track_page()` layers JSON-LD → Next.js `__NEXT_DATA__` → raw
HTML selectors, with a stale-cache self-heal retry. Two `BeatportCandidate` shapes exist (a
reference dataclass in `data/beatport.py` and the canonical one in `models/beatport_candidate.py`
used by `matcher.py`); `artwork_url`/`preview_url`/`subgenre`/`remixers` exist on the model but are
**not populated** by the HTML-scraping path — reserved for API-sourced data.

## 11. Matching & scoring (`core/matcher.py`, 1430 lines)

`best_beatport_match()` — time-budgeted (`PER_TRACK_TIME_BUDGET_SEC`), query-capped, parallel
candidate fetch, dedup caches, early-exit once a guard-passing candidate crosses
`EARLY_EXIT_SCORE`. **Scoring**: `TITLE_WEIGHT * title_sim + ARTIST_WEIGHT * artist_sim`
(~55/45, RapidFuzz `token_set_ratio` + custom multi-artist matching) plus bonuses (year ±1,
key/Camelot-near, mix-type agreement, generic-phrase, refire/rework) and penalty branches.
**Guards** reject with a `reject_reason` (not silently): subset-match prevention, title-token
coverage floor, title-only 88% floor, artist-overlap-or-remix-mention requirement, variable
title-sim floor (30–60 depending on remix/artist-sim). **Confidence tiers**:
`_confidence_label()` — high ≥95, medium ≥85, else low — **display/export label only, not a
workflow gate**; review classification happens downstream in `output_writer.py::_get_review_indices()`
(score <70, artist_sim <50, or no match → `_review.csv`). **Audit trail is ephemeral per-run** —
every candidate (including rejected) goes into an in-memory `candidates_log`, written per-run to
`*_candidates.csv`, `*_queries.csv`, `*_audit.jsonl`. **No cross-run match-history database.**

## 12. inCrate (`src/cuepoint/incrate/`)

A separate Beatport-discovery feature, loosely coupled to the matching pipeline (reuses
`rekordbox.py::parse_collection()` for its inventory, and optionally reuses the full
`IProcessorService`/matcher pipeline for label enrichment of inventory rows via
`incrate/enrichment.py`). Two flows: **Discovery** (`discovery.py`) — Beatport charts curated by
artists already in the user's library, and new label releases from labels already in the library,
deduped by `beatport_track_id`. **Playlist creation** (`playlist_writer.py`) — Beatport API first,
browser-automation fallback. Backed by `services/beatport_api.py` (`list_charts, get_chart,
get_label_releases, search_label_by_name`), `incrate_discovery_service.py`, `inventory_service.py`.
Engine surface: `engine/incrate_api.py` under `/api/v1/incrate/*`. **No "similar track" /
recommendation concept exists anywhere in inCrate** — artist/label are just string-matched
curator/owner identities, not profile entities.

## 13. Duplicates / missing files / library health

**No dedicated feature exists.** What's present is narrower: duplicate **playlist names** (not
tracks) are flagged in preflight (`rekordbox.py::inspect_rekordbox_xml`); dedup elsewhere
(query/URL/track-ID caches, inCrate's `_dedupe`) is dedup of search artifacts, not library tracks.
Missing-file handling is per-track only (`TrackResult.FILE_NOT_FOUND_ERROR` set when an M3U entry's
path doesn't exist; `write_tags_to_paths()` checks existence per track) — **no bulk library scan
for missing/broken files or duplicate tracks, no health score.**

## 14. Output/export (`services/output_writer.py`)

CSV (configurable delimiter), JSON (optional gzip), Excel (`openpyxl`, guarded availability). Also
emits `_candidates.csv`, `_queries.csv`, `_review.csv`, `_audit.jsonl`, `_summary.json`,
`_diff.json`, SHA256 checksums, optional `.bak` backups (`services/integrity_service.py`). **No
whole-XML re-export** — only the narrow attribute patch in §8, always to an explicit output path.
Writes are atomic (temp-file + rename).

## 15. Tag write-back (`data/tag_writer.py`)

Accepted Beatport metadata **is written directly into audio file tags** via `mutagen` — ID3
(MP3, WAV, AIFF) and Vorbis comments (FLAC, OGG): Key, Comment, Year, Label, BPM, Genre. WAV uses
Latin-1-safe ID3v2.3 encoding with Rekordbox-required chunk ordering, but is explicitly **skipped
in the playlist-track write paths** as a caller-side policy choice ("Rekordbox cannot read tags
from WAV"), not a library limitation. `sync_options` controls key format and per-field toggles.

## 16. Electron shell — app structure & navigation

`renderer/src/main.tsx` → `App.tsx`: `BrowserRouter > ThemeProvider > ScaleProvider > ToastProvider
> MatchResultsProvider > AppShell`. `AppShell` renders `AppMenuBar` (top menu), `EngineStatusBanner`,
a **floating fixed bottom-center pill nav** (still literally classed `app-lab-nav` — a lab-era
leftover) linking `/` Tools, `/match` inKey, `/incrate` inCrate, `/results` Results, `/settings`
Settings, and `<main>` with `<Routes>`. **No persistent sidebar, no Track Inspector panel, and no
audio/player UI exist anywhere in the renderer** — confirmed by search, zero hits for
audio/player/waveform. Each screen is a monolithic page; the only cross-page continuity is the
floating nav plus a few in-page back-links.

## 17. Electron main / preload / IPC contract

`electron/main.ts`: on ready, registers ~25 `ipcMain.handle` channels, calls `engine.start()`
(spawns the Python engine via `electron/engineSupervisor.ts`), then creates the `BrowserWindow`
(`contextIsolation: true, nodeIntegration: false`, `preload: resolvePreloadPath()`).
`EngineSupervisor` picks a random loopback port, generates a random 24-byte hex bearer token +
session UUID, spawns the bundled engine binary (or `python -m cuepoint.engine` in dev) with these
as env vars, polls `/health` before ready. **The bearer token is generated and held in the main
process only** (`electron/engineClient.ts` attaches `Authorization: Bearer` + `X-Session-Id`); the
renderer never sees it — it only gets already-authenticated IPC results. This satisfies the
"never expose tokens to renderer" invariant.

**`preload.cjs`** (the real runtime preload — `preload.ts` is confirmed an unused placeholder)
exposes `window.cuepoint` with ~28 methods: `getEngineStatus, startMatchJob, getJob,
getJobResults, exportResults, getIncrateInventory, importIncrateXml, resetIncrateInventory,
getIncrateDiscoverOptions, runIncrateDiscover, createIncratePlaylist, cancelMatchJob,
getBeatportTokenStatus, setBeatportToken, testBeatportToken, getHistoryRecent, loadHistoryCsv,
getXmlPlaylists, syncTags, exportSupportBundle, showItemInFolder, getLogsDir, getCuepointLog,
clearCuepointLogs, clearCuepointCache, setPrivacyExitPrefs, subscribeJobEvents,
openXmlFileDialog/openCsvFileDialog/openM3uFileDialog, resolveDroppedFilePath,
saveExportFileDialog`. Contract types: `renderer/src/api/cuepointBridge.types.ts`
(`CuePointBridge` interface + `hasEngineBridge()` used to detect browser-lab-mode).

## 18. Engine client / SSE

`electron/engineClient.ts::EngineClient` attaches bearer/session headers on every call to
`http://127.0.0.1:${port}${path}`. Endpoints in active use match the full route surface in §3.
SSE: `streamJobEvents()` fetches `/jobs/:id/events` (`Accept: text/event-stream`), parsed by
`electron/sseClient.ts::collectSseUntilTerminal`, running in the **main process**; the renderer
subscribes only via IPC forwarding (`engine:jobEvent`/`engine:jobEventEnd`), never talking to
HTTP/SSE directly.

## 19. Renderer state management

No Redux/Zustand/Jotai/React Query — plain **React Context + hooks**
(`ThemeContext, ScaleContext, ToastProvider, MatchResultsContext`). `hooks/useMatchJob.ts` is the
central job-state hook: prefers SSE-over-IPC push (`subscribeJobEvents`), falls back to polling
`getJob(jobId)` every 300ms when unavailable; a pure browser-mock path exists for lab/no-engine
mode. Per-feature hooks (`useSyncTags, useXmlPlaylists, usePastSearches, useBeatportToken,
useFileDrop`) are local `useState`/`useCallback`, no global store.

## 20. Pixel-art design system

See `PIXEL_DESIGN_SYSTEM.md` for the full audit (palette, typography, spacing, borders/bevels,
component inventory, icon-asset gap, scale mechanism). Summary: mature CSS-token system
(`tokens/tokens.css`, 5 built-in themes, integer 1×/2×/3× scale via `--scale` CSS var, zero
border-radius, hard offset drop-shadows + inset bevels for pixel chrome), but **no actual pixel
sprite/icon assets exist** — icons are Unicode glyph text, and the specced 9-slice/Aseprite
pipeline (`docs/ui-overhaul/phase-1-pixel-design-system.md`, DS-3) was never implemented.

## 21. Reusable UI components (`renderer/src/components/`)

- **Table/grid**: `ResultsTable.tsx` — virtualized (`@tanstack/react-virtual`), sortable,
  resizable, sticky header/columns, 14-column grid layout — the strongest existing candidate to
  generalize into the spec's "Universal Track Table." `ListRow.tsx` is a simpler row primitive.
- **Detail panel**: no docked/persistent inspector exists. `CandidateDialog.tsx` (a modal with a
  candidate-comparison table) is the closest analog but is not a side-panel pattern.
- **Player/audio**: none exist anywhere in the renderer.
- **Dialogs**: `Modal.tsx` base + 15 feature dialogs (About, Diagnostics, LogViewer, Onboarding,
  Privacy, RekordboxInstructions, PlaylistExportInstructions, Shortcuts, SupportBundle,
  SyncComplete, SyncTags, RunSummary, Candidate, ExportResultsModal).
- **Toasts, Badge, ProgressBar, Tabs, TextField, Select, ToolbarIcon, Panel, AppMenuBar,
  EngineStatusBanner** — all present, consistently styled via the token system.
- No custom combobox/multi-select/autocomplete; inCrate's filters are toggle buttons.

## 22. Existing features mapped to today's UI

- **inCrate** (`/incrate`, single flat screen, no sub-routes): Import / Discover / Playlist /
  Inventory-preview / Discovery-results panels — inventory and discovery results render as bare
  `<ul><li>` lists, **not** `ResultsTable` — no per-track selection or inspector.
- **Match/results review**: `InKeyMainScreen` (`/match`, single vs batch, XML vs M3U source,
  `BatchPlaylistPicker`, `PastSearchesPanel`, progress + cancel, `RunSummaryDialog`) →
  `ResultsScreen` (`/results`, batch tabs, matched/unmatched/needs-review filter, resizable
  `ResultsTable`, `CandidateDialog` on row activation, "Sync with Rekordbox" → `syncTags` IPC →
  `SyncCompleteDialog`). **Batch XML matching is fully wired end-to-end** (UI → IPC → engine →
  SSE/poll → results), confirmed via `useMatchJob.ts`'s real-batch branch.

## 23. Tests

**Python** (`src/tests/`, `pytest.ini`, `testpaths = src/tests`): `unit/` (~130 files, mirrors
`src/cuepoint/`), `integration/` (~24 files, mixed — legacy Qt-era files coexist, skip-gated),
`system/` (`test_cli_smoke.py` only), thin `performance/regression/acceptance/` (regression has
just one example test — no systematic regression-test practice yet). **Well covered**:
`core/matcher.py` (1839+443 test lines), `core/mix_parser.py`, `core/query_generator.py`,
`core/text_processing.py`, `engine/` (13 files, real HTTP-driven tests via
`start_engine_thread`/`EngineConfig`, though no dedicated `test_server.py`). **Real gap**:
`incrate/beatport_oauth.py`, `incrate/beatport_playlist_browser.py` (402 lines),
`incrate/models.py`, `incrate/past_results_storage.py` have **zero dedicated unit tests**.

**Renderer** (`apps/desktop-electron/renderer`, Vitest): 10 test files, **all pure-utility logic**
(`candidateUtils, fileDropUtils, keyboardShortcuts, matchJobUtils, reviewUtils, runSummaryUtils,
syncTagsUtils, resultsTableLayout, resultsColumns, themeDerivation`) — **zero component-level
tests** (no `.test.tsx`, no Testing Library usage) despite a full `screens/` tree.

**E2E**: `apps/desktop-electron/e2e/smoke.spec.ts` — one Playwright-Electron test, asserts window
title + nav visibility only. No coverage of match-job, inCrate, sync-tags, export, or
theme/scale flows.

## 24. CI (`.github/workflows/`, 12 files)

`test.yml` (Python matrix, macOS/Windows × py3.11) triggers **on push only — no `pull_request`
trigger**; its lint/type/security steps (`pylint`, `mypy --ignore-missing-imports`, `pip-audit`,
`bandit`) are all suffixed `|| true` and cannot fail the build. `desktop-electron.yml` (Node 22 +
Python 3.12, ubuntu/windows/macos, triggers on push **and PR**) runs renderer tests, `check_no_qt_in_core.py`,
engine unit tests, `smoke_engine_health.py`, `check_desktop_version_coupling.py`, Playwright smoke,
`electron-builder` dist build. `release-gates.yml` (push to main/feature + dispatch, **not PR**) is
where real enforcement lives: unit+integration pytest with `continue-on-error: false`, coverage
`--fail-under=35` (low bar), `ruff check` + `ruff format --check` enforced, mypy via a
test-wrapped invocation (`test_step55_mypy_validation.py`, not a direct `mypy src/` call),
version/changelog/SBOM/hash-determinism/license checks; its `build-gates` job is effectively a
no-op (`continue-on-error: true` + a `|| echo "Build script not found"` fallback). Separate
`compliance-check.yml`, `license-compliance.yml`, `security-scan.yml` (weekly `pip-audit`, one
`CVE-2026-4539` ignored pending upstream fix), `docs-check.yml`, `build-macos.yml`,
`build-windows.yml`, `release.yml` (tag-triggered), `large-file-check.yml` (push to `phase_*` only
— likely stale trigger). **Net effect: a plain feature PR is not gated by the main Python test
suite or by lint/mypy enforcement** — those live on push-to-branch workflows instead.

## 25. Quality-gate tooling

`scripts/check_no_qt_in_core.py` scans only `engine/, cli/, compat/, models/` + `gui_app.py` —
**does not scan `services/`, `update/`, or `utils/`**. `scripts/check_desktop_version_coupling.py`
compares `package.json`'s `cuepoint.engineVersion` to `cuepoint.version.__version__`, enforced only
in `desktop-electron.yml`. `scripts/smoke_engine_health.py` boots the real engine and hits
`/health`. mypy config (`mypy.ini`, not strict-mode) has broad per-module `disable_error_code`
overrides — notably **`core.matcher` disables `no-any-return, call-overload, arg-type, assignment,
operator`**, weakening type-checking on the best-tested, highest-value module.

## 26. Packaging / release

Python engine: `scripts/build_engine_sidecar.py` → PyInstaller (onedir/onefile set inside the
`.spec` file, not confirmed from build-script flags), output copied into
`apps/desktop-electron/resources/engine/${os}` as `electron-builder` `extraResources`.
`electron-builder` targets **all three OSes** (`nsis`/`dmg`/`AppImage`), but there's no dedicated
`build-linux.yml` — only `desktop-electron.yml`'s ubuntu CI leg exercises it, not a release
pipeline. Checksums are always generated; GPG signing of `SHA256SUMS` is optional
(`docs/release/checksum-signing.md`). `docs/release/compatibility-matrix.md` marks Windows 10/11
and macOS 12/13 as CI-tested, macOS 14 and Linux as experimental — and is already slightly out of
sync with actual CI matrices (doesn't mention the ubuntu leg or the release-gates py3.12 leg).

## 27. Version coupling

`src/cuepoint/version.py::__version__` (currently `"1.0.0-feb1"`) vs.
`apps/desktop-electron/package.json`'s `cuepoint.engineVersion` field (top-level npm `"version"` is
separate/unused for this purpose). `scripts/check_desktop_version_coupling.py` enforces equality,
but **only in `desktop-electron.yml`** — a Python-only PR path isn't caught by `test.yml` or
`release-gates.yml`.

## 28. Technical debt & risk — consolidated

- **Two parallel `TrackResult` dataclasses** (`models/result.py` vs `compat/gui_types.py`) with
  different shapes under the same name — engine-layer and core-pipeline code operate on
  structurally different types. (§1)
- **`ProcessorService` god-class** (2220 lines) — orchestration + validation + I/O in one class. (§2)
- **Dual config surfaces** (`AppConfig` dataclass tree + legacy flat `SETTINGS` dict) — incomplete migration. (§5)
- **Orphaned Qt updater** — a fully-built Sparkle/PySide6 update stack with no Electron equivalent; a known-issue is already logged. (§7)
- **Qt leakage past AGENTS.md's boundary**: `services/onboarding_service.py:19` and
  `services/privacy_service.py:16` both have **unguarded, module-level `from PySide6.QtCore import
  QSettings`** inside `services/` — one of the four directories AGENTS.md says Qt must not enter.
  `check_no_qt_in_core.py` doesn't scan `services/`, so this isn't CI-caught. Since PySide6 was
  dropped from default `requirements.txt`, importing either service outside the optional
  `requirements-qt.txt` environment raises `ImportError`.
- **No cross-run match history, no duplicate/missing-file/library-health sweep, no persistent DB**
  outside inCrate's inventory — this is the central gap the whole "persistent local-first library"
  vision (target spec §8) needs to close. (§1, §13)
- **CI gaps**: main Python suite has no PR trigger; lint/mypy/security are soft-failed on the push
  path that does run; coverage floor is 35%; the "release gate" build-check step is effectively a
  no-op. (§24, §25)
- **Renderer has zero component-level tests**; E2E is a single smoke test. (§23)
- **No pixel sprite/icon assets** despite a specced 9-slice pipeline — icons are Unicode glyphs. (§20)
- Recent git history (`git log --oneline -30`) shows a clean, well-sequenced Qt→Electron migration
  (feature → docs → CI-guard, in that order) that is ~95% complete, now transitioning into
  tooling/agent-guidance setup (`f010968, 0f822ab, def83fb`) — i.e., **the repo is between major
  efforts right now**, a reasonable moment to start a foundation-first evolution.

---

*Sources: direct repository inspection (2026-09-01) via four parallel research passes covering
(1) Python core/services/engine/CLI/updater, (2) Electron/React app + pixel design system,
(3) Rekordbox/Beatport/matching/inCrate data flows, (4) tests/CI/packaging/tech debt. Real file
and symbol names throughout; no line numbers should be treated as exact without reverification if
the surrounding code changes.*
