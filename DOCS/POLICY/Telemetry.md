# Telemetry Policy

## v1.0 Status (Step 14 Implementation)
- ✅ Telemetry implemented (opt-in only)
- ✅ Default OFF – no data collection unless user enables
- ✅ All processing local; optional remote endpoint
- ✅ No network requests except for:
  - Beatport scraping (user-initiated)
  - Update checking (user-configurable)
  - Telemetry (only when opt-in enabled and endpoint configured)

## Privacy-First Approach

### Core Principles
1. **Opt-in Only**: Default OFF; user must explicitly enable
2. **User Control**: Toggle in Settings → Privacy; CLI flags `--telemetry-enable` / `--telemetry-disable`
3. **Transparency**: Clear disclosure of what is collected
4. **Minimal Data**: Collect only what's necessary; no PII
5. **Local Processing**: Events buffered locally; optional HTTPS endpoint

### What Is Collected (when opt-in enabled)
- **Usage Events** (anonymized):
  - `app_start` – app launched (channel: cli/gui)
  - `run_start` – processing started (run_id, track_count)
  - `run_complete` – processing finished (duration_ms, tracks, match_rate)
  - `run_error` – processing failed (error_code, stage)
  - `export_complete` – export finished (output_count)

- **Event Metadata** (per event):
  - event_id (UUID)
  - timestamp (ISO8601)
  - schema_version
  - version (app version)
  - os (platform: macos/windows/linux)
  - session_id (per app launch)

### What Is NOT Collected
- ❌ Personal information
- ❌ File paths, XML paths, output paths
- ❌ Playlist names
- ❌ Track titles, artists, queries
- ❌ User location
- ❌ IP addresses

### Implementation
1. **Opt-in Only**: Default OFF in config (`telemetry.enabled: false`)
2. **Settings UI**: Toggle in Settings → Privacy
3. **CLI Flags**: `--telemetry-enable`, `--telemetry-disable`
4. **Data Minimization**: PII scrubbing; primitives only
5. **Secure Transport**: HTTPS only; endpoint must start with `https://`
6. **Data Retention**: 30 days (server-side if endpoint used); local buffer in `~/.cuepoint/telemetry/`
7. **Delete on Opt-out**: `delete_local_data()` clears local buffer

### Config Keys
- `telemetry.enabled` – opt-in flag (default: false)
- `telemetry.endpoint` – optional HTTPS URL for events
- `telemetry.sample_rate` – 0.0–1.0 (default: 1.0)

### Environment
- `CUEPOINT_TELEMETRY_ENABLED` – override (true/1/yes)
