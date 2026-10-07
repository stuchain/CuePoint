# Preflight Validation

> **Status: CLI only.** The desktop app does not run this file-based flow: it
> imports the collection once and matches library tracks from
> [Clean](../user-guide/clean.md) (DEC-071). The command-line tool works as
> described here.

## What it is (high-level)

Preflight checks the Rekordbox XML, the chosen playlist, the output folder and the run settings before a CLI run starts, and can write the result as a JSON report. It catches problems early: a missing or unreadable file, a playlist that does not exist or has no tracks, duplicate playlist names, invalid settings, no network.

Preflight is **off by default**. It runs when the config key `product.preflight_enabled` is true, or when you ask for `--preflight-only` (alias `--dry-run`), which runs it regardless and exits without processing. `--no-preflight` skips it even when the config turns it on.

## How it is implemented (code)

- **Inspection**
  - **File:** `src/cuepoint/data/rekordbox.py`
  - **Function:** `inspect_rekordbox_xml(xml_path) -> Dict` returns `root_tag`, `has_playlists`, playlist names, duplicate and empty playlist names, track counts per playlist, `has_tracks`, and counts of tracks missing a title or artist.
  - **Functions:** `is_readable(path)`, `is_writable(path)` check file access.

- **Result model**
  - **File:** `src/cuepoint/models/preflight.py`
  - **Classes:** `PreflightIssue` (a `code` and a `message`) and `PreflightResult` (`errors`, `warnings`, `checks`, `warnings_only`, `generated_at`). `can_proceed` is true when there are no errors; `to_report()` returns the JSON-ready dict.

- **Running it**
  - **File:** `src/cuepoint/services/processor_service.py`, `ProcessorService.run_preflight(xml_path, playlist_name, output_dir, settings, force)`.
  - It checks the XML path (exists, is a file, `.xml` extension, size, readable, path length), the settings (worker counts, timeout, retries, cache TTLs, output format, `config_service.validate()`), network reachability when `product.preflight_network_check` is true (the default), the Rekordbox root element, and the playlist. Errors block the run; warnings are logged and the run continues.

- **CLI**
  - **Files:** `src/main.py` (arguments) and `src/cuepoint/cli/cli_processor.py` (the run).
  - **Arguments:** `--no-preflight`, `--preflight-only`, `--dry-run` (alias for `--preflight-only`) and `--preflight-report <path>` to write the report JSON. With `--preflight-only` the CLI runs preflight, writes the report if asked, and exits: success if there are no errors, otherwise exit code 1 with the errors printed.

So: **what the feature is** = "validate the XML, playlist and settings before a run, and optionally report or exit"; **how it is implemented** = `rekordbox.inspect_rekordbox_xml` + `PreflightResult` + `ProcessorService.run_preflight` + the CLI flags.
