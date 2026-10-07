# Configuration

## What it is (high-level)

CuePoint behavior is controlled by **configuration** that can come from:

- **Defaults** (in code or a default YAML).
- **Config file** (e.g. `--config path/to/config.yaml`); settings are merged with defaults.
- **CLI flags** override file and defaults (e.g. `--fast`, `--max-workers 8`).
- **Desktop app**: the **Settings** page (theme, audio, waveform and Rekordbox export options) and the Beatport token Discover uses. It has no presets; Fast, Turbo and Myargs are CLI flags.

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

- **Desktop Settings page**
  - **Folder:** `apps/desktop-electron/renderer/src/screens/` — the settings panels (`ThemeSettingsPanel.tsx`, `AudioSettingsPanel.tsx`, `WaveformSettingsPanel.tsx`, `RekordboxExportSettingsPanel.tsx`) and `SettingsExportScreen.tsx`.
  - **File:** `src/cuepoint/engine/config_api.py` — the engine endpoints that read and write the Beatport token through config_service.
  - **File:** `apps/desktop-electron/electron/mainSettings.ts` — the few things the Electron main process remembers for itself, such as the folder a set list was last saved to.

- **Bootstrap**  
  - **File:** `src/cuepoint/services/bootstrap.py` — registers config_service in the DI container; may load default or file-based config at startup.

So: **what the feature is** = “centralized config from defaults, file and CLI, with presets on the CLI and a Settings page in the desktop app”; **how it’s implemented** = config_service + config_models/config.py + main.py (presets and overrides) + the engine's config_api and the renderer's Settings screens + bootstrap.
