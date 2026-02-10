# Configuration

## What it is (high-level)

CuePoint behavior is controlled by **configuration** that can come from:

- **Defaults** (in code or a default YAML).
- **Config file** (e.g. `--config path/to/config.yaml`); settings are merged with defaults.
- **CLI flags** override file and defaults (e.g. `--fast`, `--max-workers 8`).
- **GUI**: settings dialog and **config panel** (presets like Fast / Turbo / Myargs, and fine-grained options). Changes are persisted (e.g. QSettings or a config file in app data).

Settings cover: **performance** (max_workers, max_queries_per_track, time budget, throttle), **reliability** (max_retries, checkpoint_every), **integrity** (checksums on/off, audit log on/off), **provider** (e.g. beatport), **logging** (verbose, trace, debug), **telemetry**, and **presets** (fast, turbo, exhaustive, myargs) that set multiple options at once.

## How it is implemented (code)

- **Config service**  
  - **File:** `src/cuepoint/services/config_service.py`  
  - **Interface:** `src/cuepoint/services/interfaces.py` — `IConfigService` with `get(key, default)`, `set(key, value)`, and possibly `load(path)`, `save()`.  
  - Implementation holds a dict (or nested dict) of keys like `performance.max_workers`, `performance.max_queries_per_track`, `integrity.checksums`, `telemetry.enabled`; can load from YAML and merge.

- **Config models**  
  - **File:** `src/cuepoint/models/config_models.py` (or `config.py`) — dataclasses or Pydantic models for structured config (e.g. PerformanceConfig, IntegrityConfig); used to validate and type config.  
  - **File:** `src/cuepoint/models/config.py` — may define `SETTINGS` or default values and preset mappings (e.g. what “fast” or “turbo” sets).

- **CLI presets**  
  - **File:** `src/main.py`  
  - After parsing args, applies presets: `--fast`, `--turbo`, `--exhaustive`, `--myargs` set multiple config keys (e.g. time budget, max results, max queries). Then `--config` is merged, then individual flags (e.g. `--max-workers`, `--no-checksums`) override.

- **GUI config panel**  
  - **File:** `src/cuepoint/ui/widgets/config_panel.py` — UI for presets (radio buttons or dropdown for Fast/Turbo/Myargs) and possibly sliders/inputs for workers, queries, etc. Reads/writes via **ConfigController** or config_service.  
  - **File:** `src/cuepoint/ui/controllers/config_controller.py` — bridges config_panel and config_service; may persist to QSettings or app config file.

- **Settings dialog**  
  - **File:** `src/cuepoint/ui/dialogs/settings_dialog.py` — broader settings (paths, export defaults, maybe telemetry, privacy). Saves through config_service or a dedicated preferences layer.

- **Bootstrap**  
  - **File:** `src/cuepoint/services/bootstrap.py` — registers config_service in the DI container; may load default or file-based config at startup.

So: **what the feature is** = “centralized config from defaults, file, CLI, and GUI with presets and persistence”; **how it’s implemented** = config_service + config_models/config.py + main.py (presets and overrides) + config_panel + config_controller + settings_dialog + bootstrap.
