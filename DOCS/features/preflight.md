# Preflight Validation

## What it is (high-level)

Before starting a run, CuePoint can run **preflight** checks to validate the Rekordbox XML and selected playlist(s). This catches problems early (missing playlists, empty tracks, duplicate names, file size, readability) and optionally produces a **preflight report** (e.g. JSON) for automation. The user can choose to **skip** preflight (e.g. `--no-preflight`) or run **preflight only** (`--preflight-only` / `--dry-run`) and exit without processing.

## How it is implemented (code)

- **Inspection**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Function:** `inspect_rekordbox_xml(xml_path) -> Dict` — returns structure with: `root_tag`, `has_playlists`, playlist names, duplicate/empty playlist names, track counts per playlist, `has_tracks`, counts of tracks missing title/artist.  
  - **Functions:** `is_readable(xml_path)`, `is_writable(xml_path)` — file existence and permissions.

- **Preflight result model**  
  - **File:** `src/cuepoint/models/preflight.py`  
  - **Classes:** `PreflightIssue`, `PreflightResult` — represent one issue (e.g. “playlist X has no tracks”) and the full result (list of issues, warnings, summary).

- **Running preflight**  
  - **File:** `src/cuepoint/services/processor_service.py` (or a dedicated preflight helper)  
  - Before processing: load XML (or call inspect), validate playlist exists and has tracks, check for duplicate playlist names, missing titles; build `PreflightResult` and either block start (if errors) or warn and continue.

- **CLI**  
  - **File:** `src/main.py`  
  - **Arguments:** `--no-preflight`, `--preflight-only`, `--dry-run` (alias for preflight-only); `--preflight-report <path>` to write preflight report JSON. When `--preflight-only` is set, the app runs preflight, writes the report if requested, and exits without processing.

- **UI**  
  - **File:** `src/cuepoint/ui/dialogs/preflight_dialog.py` (or equivalent) — dialog that shows preflight issues/warnings before the user clicks “Start”.  
  - **File:** `src/cuepoint/ui/main_window.py` — `_run_preflight_checks()` (or similar) called before `start_processing()`; can show preflight dialog or embed messages in the main window.

So: **what the feature is** = “validate XML and playlist before run and optionally report or exit”; **how it’s implemented** = `rekordbox.inspect_rekordbox_xml` + `preflight.PreflightResult` + processor (or preflight runner) + CLI flags + preflight dialog.
