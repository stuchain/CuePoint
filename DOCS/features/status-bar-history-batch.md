# Status Bar, History, and Batch UI

## What it is (high-level)

- **Status bar**: a strip at the bottom of the main window shows **transient messages** (e.g. “Update available: 1.0.2”, “Download cancelled”, “Processing…”) and optionally a **file path** and **playlist** (truncated). It may also show a small **logo** or app name. Messages typically auto-clear after a few seconds.
- **History view**: a **history** of past runs (or playlists/collections) can be shown in a sidebar or panel: e.g. last used XML path, playlist name, timestamp. User can click an entry to reload that file/playlist (or rerun). Implementations vary (full run history with results vs simple “recent playlists”).
- **Batch UI**: when **Batch** mode is selected, the UI shows a **batch processor** widget: list or table of **playlists** to process (e.g. checkboxes or multi-select). User selects multiple playlists and clicks Start; the processor runs them in sequence (or parallel, if supported). Progress shows “Playlist X of Y” and completion aggregates results per playlist.

## How it is implemented (code)

- **Status bar**  
  - **File:** `src/cuepoint/ui/widgets/status_bar.py` — custom status bar widget or uses QStatusBar; may add a permanent widget (e.g. path label) and use showMessage() for temporary text.  
  - **File:** `src/cuepoint/ui/main_window.py` — `_update_status_file_path()`, `_update_status_playlist()`, `_update_status_stats()` (progress stats), `_update_status_stats_from_results()`; `_truncate_path()` for long paths. `statusBar().showMessage(msg, timeout_ms)`. `_load_logo_for_statusbar()` adds optional logo QLabel.

- **History**  
  - **File:** `src/cuepoint/ui/widgets/history_view.py` — list or table of history entries (path, playlist, date); selection triggers callback to load or rerun.  
  - **File:** `src/cuepoint/utils/history_manager.py` (if present) — load/save history entries (paths, playlists) to disk or QSettings.  
  - **File:** `src/cuepoint/ui/main_window.py` — may add history_view to a dock or sidebar; connect selection to `on_open_recent_file` or `on_rerun_requested`.

- **Batch**  
  - **File:** `src/cuepoint/ui/widgets/batch_processor.py` — widget that lists playlists (from current XML), allows multi-select; “Start” emits list of playlist names.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_batch_started(playlist_names)`, `on_batch_completed(results_dict)`, `on_batch_cancelled()`, `_on_batch_playlist_complete()`, `_on_batch_playlist_error()`; when batch is running, progress and completion handlers may switch to batch-specific logic (e.g. per-playlist results). Controller or processor_service runs multiple playlists in sequence and aggregates results.

- **Candidate dialog** (optional)  
  - **File:** `src/cuepoint/ui/widgets/candidate_dialog.py` — if the app exposes “show candidates” for a track, this dialog lists Beatport candidates and scores (for debugging or manual pick). Not all builds may expose it.

So: **what the feature is** = “status bar messages and path/playlist, history of runs/playlists, batch playlist selection and run”; **how it’s implemented** = status_bar.py + main_window status methods + history_view + history_manager + batch_processor + main_window batch handlers.
