# Processor Service

## What it is (high-level)

The **processor service** runs the main pipeline: load Rekordbox XML → select playlist(s) → for each track, generate queries → search Beatport → fetch candidates → match and score → produce `TrackResult`s → (optionally) write checkpoints and call progress callbacks. It supports:

- **Single playlist** or **batch** (multiple playlists).
- **Parallelism**: configurable worker count (thread pool) so multiple tracks are processed concurrently.
- **Progress reporting**: throttled progress callback (e.g. 5 updates/sec) with ETA; optional guardrails (max runtime, max memory) that can cancel the run.
- **Cancellation**: a `ProcessingController` (or similar) allows the UI to request cancel; the processor checks it and stops cleanly.
- **Checkpoint/resume**: save state every N tracks and resume from last checkpoint if requested.
- **Incremental mode**: skip tracks that are already present in a previous run’s CSV (by playlist index + title + artist).

The service is the main entry used by both the **GUI** (via GUIController/MainWindow) and the **CLI** (via CLIProcessor).

## How it is implemented (code)

- **Interface and implementation**  
  - **File:** `src/cuepoint/services/interfaces.py` — `IProcessorService` (e.g. `process_playlist(xml_path, playlist_name, progress_callback, controller, ...)`).  
  - **File:** `src/cuepoint/services/processor_service.py` — `ProcessorService` implementing that interface.

- **Orchestration**  
  - Loads XML via `parse_rekordbox(xml_path)` (or `read_playlist_index` for listing).  
  - Gets playlist(s) and for each track: calls `make_search_queries()` (query_generator), then runs the **matcher** (matcher_service or core matcher) which does search + fetch + scoring.  
  - Collects `TrackResult`s and passes them to the progress callback; optionally calls **output_writer** / **checkpoint_service**.

- **Throttling and guardrails**  
  - **File:** `src/cuepoint/services/processor_service.py`  
  - **Function:** `_throttled_progress_callback(callback, throttle_ms=200, eta_every_n=50)` — wraps the UI callback so it’s invoked at most every 200 ms and ETA is updated every N tracks.  
  - **Function:** `_guardrail_progress_callback(callback, controller, runtime_max_sec, memory_max_mb, logging_service)` — checks runtime and memory; if over limit, logs (e.g. P001) and calls `controller.cancel()`.

- **Concurrency**  
  - Uses `ThreadPoolExecutor` (or similar) with `max_workers` from config; each track is a unit of work; results are collected and order is preserved for the final result list.

- **Checkpoint and incremental**  
  - **File:** `src/cuepoint/services/checkpoint_service.py` — `CheckpointService`, `CheckpointData`, `compute_xml_hash`; save/load checkpoint every N tracks.  
  - **File:** `src/cuepoint/services/output_writer.py` — `load_processed_track_keys(csv_path)` returns set of (playlist_index, title, artist); processor skips tracks in this set when `--incremental` (or equivalent) is used.

- **Performance collection**  
  - **File:** `src/cuepoint/utils/run_performance_collector.py` — stages like `STAGE_PARSE_XML`, `STAGE_SEARCH_CANDIDATES`; used when `--benchmark` is set to write metrics to the output dir.

- **Usage**  
  - **GUI:** MainWindow/controller calls `processor_service.process_playlist(...)` with progress callback and cancel controller; on completion, results are shown and optionally auto-saved.  
  - **CLI:** `CLIProcessor` in `src/cuepoint/cli/cli_processor.py` calls the same service with CLI-driven config (presets, output dir, resume, incremental, etc.).

So: **what the feature is** = “run the full track-matching pipeline with progress, cancel, checkpoint, and incremental”; **how it’s implemented** = `processor_service.py` (orchestration, throttle, guardrails, workers) + checkpoint_service + output_writer.load_processed_track_keys + run_performance_collector.
