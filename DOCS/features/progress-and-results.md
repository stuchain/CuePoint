# Progress and Results

## What it is (high-level)

While processing runs, the UI shows **progress**: current track index, total tracks, percentage, **ETA**, elapsed time, and optionally speed (tracks/sec). The user can **pause** (if supported) and **cancel**. When the run completes, **results** are shown in a table or list (e.g. original title, Beatport title, artists, key, BPM, score, confidence, link). The user can **copy** selected rows, **select all**, **clear results**, and optionally **rerun** (same XML/playlist) or open the **run summary** dialog (with verify output, open folder). **Batch mode**: when multiple playlists are processed, progress can show “Playlist X of Y” and aggregate or per-playlist results.

## How it is implemented (code)

- **Progress widget**  
  - **File:** `src/cuepoint/ui/widgets/progress_widget.py` — progress bar, labels for “Track N of M”, “ETA”, “Elapsed”; **Pause** and **Cancel** buttons.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_progress_updated(progress_info: ProgressInfo)` updates the progress widget; `_format_time(seconds)` for ETA/elapsed display; `_reset_progress()` when run ends. Progress info is produced by the processor service (throttled callback).

- **Progress interface**  
  - **File:** `src/cuepoint/ui/gui_interface.py` — `ProgressInfo` (completed_tracks, total_tracks, elapsed_time, eta_seconds, etc.), `ProcessingController` (cancel request, `is_cancelled()`), `ProgressCallback` type.

- **Results view**  
  - **File:** `src/cuepoint/ui/widgets/results_view.py` — table or list of `TrackResult`; columns for original title, beatport title, artists, key, BPM, score, confidence, URL.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_processing_complete(results)`, `on_copy_selected()`, `on_select_all()`, `on_clear_results()`, `on_toggle_results()`, `on_toggle_progress()`; `_auto_save_results()` may write CSV after completion.  
  - **File:** `src/cuepoint/ui/controllers/results_controller.py` — coordinates results view and data (filter, sort, copy to clipboard).

- **Run summary dialog**  
  - **File:** `src/cuepoint/ui/dialogs/run_summary_dialog.py` — shows summary (track count, path, run id); **Verify** button calls `verify_outputs(output_dir, checksums=True, schema=True)`; **Open folder** to reveal output dir.

- **Batch**  
  - **File:** `src/cuepoint/ui/widgets/batch_processor.py` — UI for selecting multiple playlists and starting batch run.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_batch_started()`, `on_batch_completed()`, `on_batch_cancelled()`, `_on_batch_playlist_complete()`, `_on_batch_playlist_error()`; reconnects signals for single vs batch so progress and completion go to the right handlers.

- **Cancel**  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_cancel_requested()` sets controller cancel; processor checks `controller.is_cancelled()` and stops; `_on_cancel_complete()` resets UI.

- **Rerun**  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_rerun_requested(xml_path, playlist_name)` — reloads file, selects playlist, and optionally starts processing again.

So: **what the feature is** = “progress bar with ETA and cancel, results table with copy/select/clear, run summary and verify, batch progress and completion”; **how it’s implemented** = progress_widget + main_window progress/results handlers + gui_interface (ProgressInfo, ProcessingController) + results_view + results_controller + run_summary_dialog + batch_processor.
