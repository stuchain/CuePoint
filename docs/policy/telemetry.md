# Telemetry Policy

CuePoint has two separate kinds of reporting. This page is mostly about the first.

| | Usage telemetry | Error reporting |
| --- | --- | --- |
| Where | CLI only | Desktop app (released builds) |
| Default | **Off**, opt-in | **On**, with a switch |
| Sent to | An endpoint you configure (none by default) | Sentry, EU region |
| Switch | `--telemetry-enable` / `--telemetry-disable` | Settings → Privacy → Send error reports |

## Error Reporting (desktop app)
Released builds of the desktop app send an error report to Sentry (EU region) when CuePoint hits an
unexpected error, unless the user turns it off in **Settings → Privacy → Send error reports** (it takes
effect at once, with no restart). Reports are scrubbed on the device before they are sent: they carry
the error, where in the code it happened, a short description of each of the last steps before it, the version and build,
and the operating system, with file, folder, track, artist, label and playlist names, the notes and tags kept in CuePoint,
tokens, the user's or computer's name and the values of variables removed by rules applied on the
computer before sending. A note sent with **Help → Report a problem** is sent as written. Nothing is queued for later.
The full list, and how long Sentry keeps a report, is in the [Privacy Notice](privacy-notice.md).

- Builds run from source send nothing unless a developer sets `CUEPOINT_SENTRY_DSN` by hand (a DSN
  set by hand goes to both the desktop app's main process and the engine);
  `CUEPOINT_SENTRY_DSN=off` sends nothing from a build of any kind.
- **The CLI never sends error reports**, whatever its configuration or environment. Its usage
  telemetry (below) is separate, opt-in and off.
- This is not analytics: no usage events, sessions, performance traces or session recordings are sent.

## v1.0 Status (usage telemetry)
- ✅ Telemetry implemented (opt-in only)
- ✅ Default OFF – no data collection unless user enables
- ✅ All processing local; optional remote endpoint
- ✅ No network requests except for:
  - Beatport scraping (user-initiated)
  - Telemetry (only when opt-in enabled and endpoint configured)

## Privacy-First Approach

### Core Principles
1. **Opt-in Only**: Default OFF; user must explicitly enable
2. **User Control**: CLI flags `--telemetry-enable` / `--telemetry-disable`. The desktop app has no usage-telemetry switch and sends none; usage events come only from CLI runs
3. **Transparency**: Clear disclosure of what is collected
4. **Minimal Data**: Collect only what's necessary; no PII
5. **Local Processing**: Events buffered locally; optional HTTPS endpoint

### What Is Collected (when opt-in enabled)
- **Usage Events** (anonymized):
  - `app_start` – CLI launched (channel: cli)
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
2. **Desktop app**: collects no usage telemetry (error reports are separate, see above); the in-app Privacy dialog shows the error-report switch
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
