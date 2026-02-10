# CSV and Excel Export

## What it is (high-level)

After processing, CuePoint writes **output files** to a chosen directory (default `output/` or configurable):

- **Main CSV**: one row per track with columns such as playlist_index, original_title, original_artists, beatport_title, beatport_artists, beatport_key, beatport_bpm, beatport_year, beatport_url, match_score, confidence, etc. Optional metadata columns (label, genres, release, track_id) could be included.
- **Candidates CSV** (optional): per-track candidate list (e.g. for debugging or review).
- **Queries CSV** (optional): per-track search queries used.
- **Excel export**: same data can be written to `.xlsx` (when openpyxl is available); used from the export dialog or CLI.

Output files can have a **timestamp** in the filename (e.g. `beatport_enriched_20260207T120000.csv`). The writer also adds **comment lines** at the top (e.g. `# schema_version=1`, `# run_id=...`) for traceability. **Review-only** mode (e.g. `--review-only`) exports only low-confidence tracks (no main CSV of all tracks).

## How it is implemented (code)

- **Main writer**  
  - **File:** `src/cuepoint/services/output_writer.py`  
  - **Function:** `write_csv_files(results, base_filename, output_dir, delimiter, include_metadata, file_timestamp, ...)` — writes main CSV (and optionally candidates, queries). Uses:
    - **Integrity helpers:** `get_csv_header_lines()`, `write_checksum_file()`, `write_audit_log()`, `create_backup()`, `generate_run_id()`, `write_summary_report()`, `generate_diff_report()` from `integrity_service`.  
  - Buffered writes (`WRITE_BUFFER_SIZE`), batched row building (`WRITE_BATCH_THRESHOLD`) for performance.  
  - **Function:** `append_rows_to_main_csv(...)` — used when appending to an existing main CSV (e.g. resume or incremental append).

- **Excel**  
  - **File:** `src/cuepoint/services/output_writer.py`  
  - Uses `openpyxl` if available (`OPENPYXL_AVAILABLE`); builds workbook with sheets, styles (e.g. header font/fill), column widths. Exported from **export_service** or **export_controller** when the user chooses Excel in the export dialog.

- **Export service / controller**  
  - **File:** `src/cuepoint/services/export_service.py` — high-level export API (e.g. export to path, format).  
  - **File:** `src/cuepoint/ui/controllers/export_controller.py` — coordinates UI (export dialog) and export_service; triggers `write_csv_files` or Excel write.

- **CLI**  
  - **File:** `src/main.py` — `--out`, `--output-dir`, `--run-summary-json`, `--review-only`; after processing, CLI processor calls the output writer (or export service) with the results and output path.

- **Run summary**  
  - **File:** `src/cuepoint/services/integrity_service.py` (or output_writer) — `write_summary_report()` writes a small JSON (or similar) with run id, track count, timestamp; path can be passed via `--run-summary-json`.

So: **what the feature is** = “write main/candidates/queries CSV and optionally Excel with headers and optional metadata”; **how it’s implemented** = `output_writer.write_csv_files` (and append), openpyxl in same module, integrity_service for headers/checksums/audit, export_service/export_controller for UI, CLI args in main.py.
