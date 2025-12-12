## Step 6: Runtime Operational Design (Ship v1.0)

**Implementation Order**: This is the **sixth step** - can be done in parallel with Steps 3-5.

### Step 6.1: File System Locations (Qt Standard)

**6.1.1 Qt Standard Paths**
Use `QStandardPaths`:
- **Config**: AppConfigLocation
- **Logs**: AppDataLocation or AppLocalDataLocation
- **Cache**: CacheLocation
- **Exports**: DocumentsLocation/CuePoint (default), user-selectable

**6.1.2 Concrete Path Mapping (Recommended)**
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

**6.1.3 Storage Invariants**
- Never write into the app bundle (`.app`) or install directory (`Program Files`).
- All mutable state goes into user-writable app data locations.

### Step 6.2: Logging

**6.2.1 Logging Requirements**
- Rotating file logs (size + count).
- Console logs only in dev builds.
- Include:
  - app version/build
  - OS version
  - key settings (non-sensitive)
  - timing info for scraping

**6.2.2 Logging UI**
UI:
- "Open Logs Folder"
- "Copy diagnostic info"

**6.2.3 Log Rotation Spec (Example)**
- File: `cuepoint.log`
- Rotate at: 5MB
- Keep: 5 files (`cuepoint.log`, `cuepoint.log.1`…)
- Separate crash logs:
  - `crash-YYYYMMDD-HHMMSS.log`

**6.2.4 Logging Levels**
- Default: INFO
- Debug mode: DEBUG (toggle via Settings)
- Never log:
  - user tokens/passwords (if ever introduced)
  - full HTML dumps unless explicitly enabled

### Step 6.3: Crash Handling

**6.3.1 Crash Capture**
- Global exception hook:
  - show user-friendly dialog
  - write full traceback to crash log
- Capture last 200 log lines into crash report bundle.

**6.3.2 Crash Report Bundle Format**
When user clicks "Export support bundle" produce a zip containing:
- `diagnostics.json` (version, OS, settings snapshot)
- `logs/cuepoint.log*`
- `crashes/crash-*.log` (latest)
- optional: `recent-run-metadata.json` (timings, counts)

### Step 6.4: Networking Reliability

**6.4.1 Network Requirements**
- Timeouts on every HTTP request.
- Retry with exponential backoff + jitter.
- Clear UI states:
  - "Retrying…"
  - "Network unavailable"
- Respect rate limits and avoid scraping bursts.

**6.4.2 Timeout Policy (Example)**
- Connect timeout: 5s
- Read timeout: 30s
- Max retries: 3 (with exponential backoff)
- Backoff base: 0.5s, jitter 0–0.25s

### Step 6.5: Caching Strategy

**6.5.1 Cache Management**
- Use `requests-cache` (already present) but:
  - expose "Clear Cache"
  - show cache location in diagnostics

**6.5.2 Cache Invalidation**
- Default TTL: configurable (e.g., 7 days)
- Manual "Clear Cache" in UI
- Auto-prune old cache entries periodically

### Step 6.6: Performance

**6.6.1 UI Responsiveness**
- Never block UI thread:
  - background workers for scraping/matching
  - throttled progress updates
- Large result sets:
  - avoid O(n²) UI updates
  - batch table population

**6.6.2 Performance Budgets (Targets)**
- Startup to ready: < 2s on modern machines
- Table filter apply: < 200ms for 1k rows (debounced)
- Per-track processing: show progress at least every 250ms

### Step 6.7: Backups & Safety

**6.7.1 Safe Write Patterns**
- Never overwrite exports without user confirmation.
- For in-place edits: write to temp and rename atomically.

**6.7.2 Safe Write Pattern Implementation**
- Write to `file.tmp`
- `fsync`
- Atomic rename to target file
- Keep previous version as `.bak` optionally (configurable)
