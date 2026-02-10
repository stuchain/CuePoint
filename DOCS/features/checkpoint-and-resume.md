# Checkpoint and Resume

## What it is (high-level)

Long runs (many tracks or playlists) can be **interrupted**. To avoid redoing work:

- **Checkpoint**: the processor **saves progress** every N tracks (e.g. to a checkpoint file keyed by XML path + playlist + run id or hash). The checkpoint stores which tracks were completed and their results (or at least track keys and outcome).
- **Resume**: when the user runs again with **resume** enabled (e.g. `--resume`), the app loads the last checkpoint for that XML/playlist and **continues from the next track** instead of from the beginning.
- **Incremental mode** is related but different: it uses a **previous run’s main CSV** to decide which tracks to skip (by playlist index + title + artist), without using a checkpoint file. So “incremental” = “only process tracks not already in this CSV”.

## How it is implemented (code)

- **Checkpoint service**  
  - **File:** `src/cuepoint/services/checkpoint_service.py`  
  - **Classes/functions:**  
    - `CheckpointData` — structure holding: run id, xml path (or hash), playlist name, list of completed track results (or keys), maybe timestamp.  
    - `CheckpointService` — save checkpoint to disk (e.g. JSON) every N tracks; load checkpoint; determine “last completed index” for resume.  
    - `compute_xml_hash(xml_path)` — hash of XML path (or file content) to identify the run; used in checkpoint filename or key.

- **Processor integration**  
  - **File:** `src/cuepoint/services/processor_service.py`  
  - At the start: if `resume` is True, call `CheckpointService.load(...)`; set starting track index to “last completed + 1”.  
  - After each track (or every N tracks): append result to in-memory list and call `CheckpointService.save(checkpoint_data)` (or equivalent).  
  - CLI flag `--checkpoint-every` (or config) controls N.

- **CLI**  
  - **File:** `src/main.py`  
  - **Arguments:** `--resume`, `--no-resume`, `--checkpoint-every N`.  
  - **Incremental:** `--incremental CSV_PATH` — uses `load_processed_track_keys(csv_path)` from `output_writer.py` to build a set of (playlist_index, title, artist) and skip those tracks; no checkpoint file is required for incremental.

- **Output writer**  
  - **File:** `src/cuepoint/services/output_writer.py`  
  - **Function:** `load_processed_track_keys(csv_path) -> Set[tuple]` — reads the main CSV (skipping comment lines), returns set of (playlist_index, original_title, original_artists) for incremental mode .

So: **what the feature is** = “save progress periodically and resume from last checkpoint; optionally skip tracks already in a previous CSV”; **how it’s implemented** = `checkpoint_service.py` (save/load, xml hash) + processor_service (resume start index, periodic save) + `output_writer.load_processed_track_keys` for incremental + CLI flags.
