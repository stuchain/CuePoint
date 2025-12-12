## 1. Product Requirements & Definition (Ship v1.0)

### 1.0 Product statement
CuePoint is a desktop utility that enriches Rekordbox collections/playlists with Beatport metadata and exports clean, filterable results with a professional “no-surprises” UX.

### 1.0.1 Target users (personas)
- **DJ / power user**: runs large playlists, cares about accuracy, speed, export formats, and repeatability.
- **Casual user**: runs occasional searches, cares about installation simplicity and clear guidance.
- **Support/dev**: needs reliable logs, reproducible diagnostics, and straightforward bug reporting.

### 1.0.2 Primary workflows (user journeys)
1) **First run**
   - Launch → learn what “Collection XML” is → select XML → choose mode → choose playlist → process → review → export.
2) **Repeat run**
   - App remembers recent XML + output folder → choose playlist → process → export.
3) **Review / refine**
   - Use filters to find low-confidence items → review candidates (where available) → re-export.
4) **Past Searches**
   - Open Past Searches → pick prior result → filter → export again → optionally “Re-run Processing”.
5) **Update**
   - App checks for updates → prompt → user updates with minimal friction → app relaunches.

### 1.1 Target outcomes (v1.0)
- **End-user install** without developer tooling (no Python, no pip, no terminal).
- **Trustworthy first run**: no “unidentified developer” blockers (signed/notarized).
- **Predictable behavior**: stable config/data paths, reliable exports, clear errors.
- **Self-service updates**: in-app prompt when a new release exists.

### 1.2 Supported platforms
- **macOS**
  - Architectures: Apple Silicon (arm64) and optionally Intel (x64)
  - Minimum OS: define explicitly (recommend: macOS 12+; align with QtWebEngine constraints)
- **Windows**
  - Windows 10/11 x64

### 1.2.1 System requirements
- **CPU/RAM**: 4GB min (8GB recommended for large playlists)
- **Disk**: space for app + cache + exports (depending on cache/Playwright usage)
- **Network**: required for enrichment; must behave gracefully offline

### 1.3 Distribution formats
- **macOS**: `CuePoint.app` inside `CuePoint.dmg` (drag-to-Applications)
- **Windows**: `CuePointSetup.exe` (NSIS) for v1.0 (optionally `.msi` later)

### 1.3.1 Install/uninstall expectations
- Install:
  - no Terminal required
  - minimal prompts (prefer per-user install)
  - creates shortcuts (Start menu / Applications)
- Uninstall:
  - removes app binaries
  - preserves user data by default (config/history) unless user opts to remove

### 1.4 Versioning
- Use **SemVer**: `MAJOR.MINOR.PATCH`
- Embed version in:
  - App UI (“About”)
  - Binary metadata (mac Info.plist, Windows file version)
  - Update feed metadata

### 1.4.1 Build identifiers
- Release version: `X.Y.Z`
- Build number: CI run number (or date-based) for traceability
- Commit SHA: included in diagnostics (support-friendly)

### 1.5 UX requirements (professional baseline)
- **Layout**:
  - responsive; all critical controls remain visible
  - app scrolls when window height is small
  - tables remain readable; target “~10 visible rows” when height allows
- **Progress**:
  - current track info, elapsed/remaining, matched/unmatched counters
  - cancel works reliably and leaves app in a safe state
- **Discoverability**:
  - tooltips for key steps (Collection XML, playlists)
  - shortcuts dialog accessible
- **Export**:
  - obvious buttons, clear output location, “Open Output Folder”

### 1.5.1 UX acceptance criteria
- No clipped controls at common laptop resolutions (macOS 13”)
- Keyboard usable end-to-end (tab order + Return to start + Esc to cancel)
- Errors always show:
  - what happened
  - what the user can do next
  - where logs are

### 1.6 Operational requirements
- Use stable storage locations via Qt `QStandardPaths`:
  - config, logs, cache, support bundles
- Rotating logs + crash capture
- Safe network behavior:
  - timeouts
  - retries with backoff/jitter
- No sensitive data leaked to logs by default

### 1.6.1 Data retention
- Cache: user can clear; bounded size policy
- History: keep last N runs or last N days (configurable)
- Exports: app never deletes user exports automatically

### 1.6.2 Diagnostics (supportability)
Provide a “Copy diagnostics” / “Export support bundle” that includes:
- app version/build/SHA
- OS version
- update channel (stable/beta) and update feed URL
- key settings toggles (non-sensitive)
- last N log lines + crash log if present

### 1.7 “Done” criteria for v1.0
- CI builds produce **signed** artifacts for macOS and Windows.
- Releases published to GitHub Releases with update metadata.
- Installed app checks for updates and prompts user.
- CI prevents large files (e.g., `.venv`) from being committed.

### 1.8 Non-functional requirements (NFRs)
- **Reliability**: no crashes on invalid inputs; fail gracefully.
- **Performance**: UI stays responsive; filtering is debounced; bulk table updates.
- **Security**: update integrity checks; safe defaults; no secret leakage.
- **Maintainability**: centralized UI tokens; clear module boundaries.

### 1.9 Out of scope (v1.0)
- Full multi-language localization (prepare hooks only)
- Full Windows delta updates
- Telemetry (unless explicitly required; must be opt-in)
