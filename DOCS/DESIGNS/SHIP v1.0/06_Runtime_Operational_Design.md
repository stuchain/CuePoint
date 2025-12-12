## 6. Runtime & Operational Design (Ship v1.0)

### 6.1 File system locations (Qt standard)
Use `QStandardPaths`:
- **Config**: AppConfigLocation
- **Logs**: AppDataLocation or AppLocalDataLocation
- **Cache**: CacheLocation
- **Exports**: DocumentsLocation/CuePoint (default), user-selectable

### 6.1.1 Concrete path mapping (recommended)
**macOS**
- Config: `~/Library/Preferences/com.stuchain.cuepoint.plist` (QSettings) and/or `~/Library/Application Support/CuePoint/config/`
- App data: `~/Library/Application Support/CuePoint/`
- Cache: `~/Library/Caches/CuePoint/`
- Logs: `~/Library/Logs/CuePoint/`
- Exports (default): `~/Documents/CuePoint/`

**Windows**
- Config: `%APPDATA%\\CuePoint\\config\\`
- App data: `%LOCALAPPDATA%\\CuePoint\\`
- Cache: `%LOCALAPPDATA%\\CuePoint\\Cache\\`
- Logs: `%LOCALAPPDATA%\\CuePoint\\Logs\\`
- Exports (default): `%USERPROFILE%\\Documents\\CuePoint\\`

### 6.1.2 Storage invariants
- Never write into the app bundle (`.app`) or install directory (`Program Files`).
- All mutable state goes into user-writable app data locations.

### 6.2 Logging
- Rotating file logs (size + count).
- Console logs only in dev builds.
- Include:
  - app version/build
  - OS version
  - key settings (non-sensitive)
  - timing info for scraping

UI:
- “Open Logs Folder”
- “Copy diagnostic info”

### 6.2.1 Log rotation spec (example)
- File: `cuepoint.log`
- Rotate at: 5MB
- Keep: 5 files (`cuepoint.log`, `cuepoint.log.1`…)
- Separate crash logs:
  - `crash-YYYYMMDD-HHMMSS.log`

### 6.2.2 Logging levels
- Default: INFO
- Debug mode: DEBUG (toggle via Settings)
- Never log:
  - user tokens/passwords (if ever introduced)
  - full HTML dumps unless explicitly enabled

### 6.3 Crash handling
- Global exception hook:
  - show user-friendly dialog
  - write full traceback to crash log
- Capture last 200 log lines into crash report bundle.

### 6.3.1 Crash report bundle format
When user clicks “Export support bundle” produce a zip containing:
- `diagnostics.json` (version, OS, settings snapshot)
- `logs/cuepoint.log*`
- `crashes/crash-*.log` (latest)
- optional: `recent-run-metadata.json` (timings, counts)

### 6.4 Networking reliability
- Timeouts on every HTTP request.
- Retry with exponential backoff + jitter.
- Clear UI states:
  - “Retrying…”
  - “Network unavailable”
- Respect rate limits and avoid scraping bursts.

### 6.4.1 Timeout policy (example)
- Connect timeout: 5s
- Read timeout: 30s
- Max retries: 3 (with exponential backoff)
- Backoff base: 0.5s, jitter 0–0.25s

### 6.5 Caching strategy
- Use `requests-cache` (already present) but:
  - expose “Clear Cache”
  - show cache location in diagnostics

### 6.5.1 Cache invalidation
- Default TTL: configurable (e.g., 7 days)
- Manual “Clear Cache” in UI
- Auto-prune old cache entries periodically

### 6.6 Performance
- Never block UI thread:
  - background workers for scraping/matching
  - throttled progress updates
- Large result sets:
  - avoid O(n²) UI updates
  - batch table population

### 6.6.1 Performance budgets (targets)
- Startup to ready: < 2s on modern machines
- Table filter apply: < 200ms for 1k rows (debounced)
- Per-track processing: show progress at least every 250ms

### 6.7 Backups & safety
- Never overwrite exports without user confirmation.
- For in-place edits: write to temp and rename atomically.

### 6.7.1 Safe write pattern
- Write to `file.tmp`
- `fsync`
- Atomic rename to target file
- Keep previous version as `.bak` optionally (configurable)

