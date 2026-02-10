# CLI and Arguments

## What it is (high-level)

CuePoint can be run from the **command line** (e.g. `python main.py` or the packaged executable). The CLI:

- **Processes** one playlist (or batch) from a Rekordbox XML: `--xml path/to/collection.xml --playlist "My Playlist"`.
- **Output**: `--out` (base filename), `--output-dir`; optional `--run-summary-json`, `--preflight-report`.
- **Presets**: `--fast`, `--turbo`, `--exhaustive`, `--myargs` set multiple performance/query options.
- **Performance**: `--max-workers`, `--max-queries-per-track`, `--benchmark` (write metrics).
- **Reliability**: `--resume`, `--no-resume`, `--checkpoint-every`, `--max-retries`; `--incremental CSV_PATH` (skip tracks already in that CSV).
- **Determinism**: `--seed` for reproducible ordering or tie-breaking.
- **Logging**: `--verbose`, `--trace`, `--debug`.
- **Config**: `--config path/to/config.yaml`; file is merged with defaults, CLI overrides file.
- **Integrity**: `--verify-outputs` (with `--output-dir`) to validate schema and checksums; `--no-checksums`, `--no-audit-log`; `--review-only` (export only low-confidence tracks).
- **Preflight**: `--no-preflight`, `--preflight-only` / `--dry-run`.
- **Provider**: `--provider beatport` (default).
- **Policy**: `--show-privacy`, `--show-terms` (print and exit).
- **Telemetry**: `--telemetry-enable`, `--telemetry-disable`.
- **Support**: `--export-support-bundle` (generate bundle and exit).
- **Maintenance**: `--maintenance-report` (delegated to script, then exit).

**Subcommands**: `migrate` (schema migration: `--from`, `--to`, `--file`, `--directory`); handled before full bootstrap.

## How it is implemented (code)

- **Entry point**  
  - **File:** `src/main.py` — `main()`: early handling for `--maintenance-report` (subprocess to `scripts/maintenance_report.py`) and `migrate` (argparse for migrate, then `_run_migrate()` calling `schema_migration.run_migrate`). Then bootstrap_services(), resolve IProcessorService, IExportService, IConfigService, ILoggingService; create **CLIProcessor**; build **argparse** parser with all flags above; parse args; apply presets and overrides to config; handle exit-only flags (--export-support-bundle, --show-privacy, --show-terms, telemetry-only); then call **CLIProcessor.run(args)** (or equivalent) which runs preflight (if not skipped), then processor_service.process_playlist(...) with progress callback, then output_writer/export.

- **CLI processor**  
  - **File:** `src/cuepoint/cli/cli_processor.py` — **CLIProcessor** class: takes processor_service, export_service, config_service, logging_service. **run(args)** (or **process(args)**): validates --xml and --playlist (or --preflight-only / --verify-outputs), applies config from args, runs preflight if needed, invokes processor for single or batch playlist, writes output (CSV/Excel) to args.output_dir with args.out base name; handles --incremental, --resume, --run-summary-json, --benchmark.

- **Bootstrap**  
  - **File:** `src/cuepoint/services/bootstrap.py` — registers all services (config, processor, beatport, matcher, export, logging, etc.) in the DI container so main.py and CLIProcessor resolve them.

- **Migrate**  
  - **File:** `src/cuepoint/services/schema_migration.py` — `run_migrate(from_version, to_version, file_path, directory)` migrates schema of CSV files .

So: **what the feature is** = “full CLI with XML/playlist, presets, performance, reliability, integrity, policy, telemetry, support and maintenance flags, plus migrate subcommand”; **how it’s implemented** = main.py (argparse, early exits, bootstrap, CLIProcessor.run) + cli_processor.py (orchestration) + bootstrap.py + schema_migration.py.
