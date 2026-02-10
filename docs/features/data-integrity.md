# Data Integrity (Schema, Checksums, Audit, Backups)

## What it is (high-level)

CuePoint ensures **outputs are traceable and safe**:

- **Schema versioning**: output CSVs (and related files) include a **schema version** in comment headers so future versions can detect and migrate old files.
- **Run ID**: each run has a unique **run_id** (e.g. `YYYYMMDDTHHMMSS_abc123`) stored in headers and audit log.
- **Checksums**: for key output files (e.g. main CSV), a **SHA256 checksum** is written to a companion `.sha256` file (GNU format: `hash  filename`). Verification can re-compute the hash and compare.
- **Audit log**: an **audit log** file (e.g. JSON or text) records high-level events (run started, file written, checksum generated). Large audit logs can be compressed (e.g. gzip) above a size threshold.
- **Backups**: before overwriting an existing output file, the app can **create a backup** (e.g. copy to `.bak` or timestamped name) and cap the number of backups (e.g. MAX_BACKUPS = 3).
- **Path validation**: output paths are validated to **reject path traversal** (e.g. `../`) and invalid characters.
- **CSV injection**: cell values starting with `=`, `+`, `-`, `@` are **escaped** (e.g. leading `'`) to prevent formula injection in spreadsheets.
- **Verification**: `--verify-outputs` (with `--output-dir`) re-validates schema, checksums, and optionally audit log in an existing output directory.

## How it is implemented (code)

- **Integrity service**  
  - **File:** `src/cuepoint/services/integrity_service.py`  
  - **Constants:** `SCHEMA_VERSION`, `MAIN_CSV_REQUIRED_COLUMNS`, `MAIN_CSV_OPTIONAL_COLUMNS`, `AUDIT_LOG_COMPRESS_THRESHOLD_BYTES`, `MAX_BACKUPS`; error codes `D001`–`D006`.  
  - **Functions:**  
    - `generate_run_id()` — returns existing run id from run_context or new `YYYYMMDDTHHMMSS_uuid6`.  
    - `get_csv_header_lines()` — returns comment lines (e.g. `# schema_version=1`, `# run_id=...`) for CSV headers.  
    - `compute_sha256(filepath)` — SHA256 hex of file.  
    - `write_checksum_file(filepath, checksum)` — writes `.sha256` file.  
    - `verify_checksum(filepath)` — reads `.sha256`, compares with computed hash.  
    - `write_audit_log(...)` — appends to audit log; may compress if over threshold.  
    - `create_backup(filepath)` — copy to backup, prune old backups.  
    - `validate_output_path(path)` — reject path traversal and invalid paths.  
    - `_escape_csv_injection(value)` — escape leading `=`, `+`, `-`, `@`.  
    - `write_summary_report(...)`, `generate_diff_report(...)` — run summary and diff reports.

- **Output writer**  
  - **File:** `src/cuepoint/services/output_writer.py`  
  - Calls integrity_service for: headers, run_id, checksums, audit log, backup before write. Uses `_escape_csv_injection` when writing CSV cells. Writes main CSV with required columns; validates paths before opening files.

- **Verification**  
  - **File:** `src/main.py` (or a small verify module) — when `--verify-outputs` is set, walks `--output-dir`, finds CSVs and `.sha256` files, runs schema validation (required columns) and `verify_checksum()`; reports errors.

- **Run context**  
  - **File:** `src/cuepoint/utils/run_context.py` — `get_current_run_id()`, `set_run_id()` so the same run_id is used across output_writer and integrity_service during one run.

So: **what the feature is** = “schema version + run id + checksums + audit log + backups + path and CSV-injection safety + verify”; **how it’s implemented** = `integrity_service.py` (all helpers) + `output_writer.py` (integration) + `run_context.py` + `--verify-outputs` in main.
