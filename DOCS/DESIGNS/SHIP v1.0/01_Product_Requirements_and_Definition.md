## Step 1: Product Requirements & Definition (Ship v1.0)

**Implementation Order**: This is the **first step** - all other implementation steps depend on this foundation.

### Step 1.1: Product Statement

**1.1.1 Core Product Definition**
- CuePoint is a desktop utility that enriches Rekordbox collections/playlists with Beatport metadata and exports clean, filterable results with a professional "no-surprises" UX.

### Step 1.2: Target Users (Personas)

**1.2.1 User Persona Definitions**
- **DJ / power user**: runs large playlists, cares about accuracy, speed, export formats, and repeatability.
- **Casual user**: runs occasional searches, cares about installation simplicity and clear guidance.
- **Support/dev**: needs reliable logs, reproducible diagnostics, and straightforward bug reporting.

### Step 1.3: Primary Workflows (User Journeys)

**1.3.1 First Run Workflow**
1. Launch → learn what "Collection XML" is → select XML → choose mode → choose playlist → process → review → export.

**1.3.2 Repeat Run Workflow**
2. App remembers recent XML + output folder → choose playlist → process → export.

**1.3.3 Review / Refine Workflow**
3. Use filters to find low-confidence items → review candidates (where available) → re-export.

**1.3.4 Past Searches Workflow**
4. Open Past Searches → pick prior result → filter → export again → optionally "Re-run Processing".

**1.3.5 Update Workflow**
5. App checks for updates → prompt → user updates with minimal friction → app relaunches.

### Step 1.4: Target Outcomes (v1.0)

**1.4.1 Installation Outcome**
- **End-user install** without developer tooling (no Python, no pip, no terminal).

**1.4.2 Trust Outcome**
- **Trustworthy first run**: no "unidentified developer" blockers (signed/notarized).

**1.4.3 Reliability Outcome**
- **Predictable behavior**: stable config/data paths, reliable exports, clear errors.

**1.4.4 Update Outcome**
- **Self-service updates**: in-app prompt when a new release exists.

### Step 1.5: Supported Platforms

**1.5.1 macOS Platform**
- Architectures: Apple Silicon (arm64) and optionally Intel (x64)
- Minimum OS: define explicitly (recommend: macOS 12+; align with QtWebEngine constraints)

**1.5.2 Windows Platform**
- Windows 10/11 x64

**1.5.3 System Requirements**
- **CPU/RAM**: 4GB min (8GB recommended for large playlists)
- **Disk**: space for app + cache + exports (depending on cache/Playwright usage)
- **Network**: required for enrichment; must behave gracefully offline

### Step 1.6: Distribution Formats

**1.6.1 macOS Distribution**
- Format: `CuePoint.app` inside `CuePoint.dmg` (drag-to-Applications)

**1.6.2 Windows Distribution**
- Format: `CuePointSetup.exe` (NSIS) for v1.0 (optionally `.msi` later)

**1.6.3 Install/Uninstall Expectations**
- Install:
  - no Terminal required
  - minimal prompts (prefer per-user install)
  - creates shortcuts (Start menu / Applications)
- Uninstall:
  - removes app binaries
  - preserves user data by default (config/history) unless user opts to remove

### Step 1.7: Versioning

**1.7.1 Version Scheme**
- Use **SemVer**: `MAJOR.MINOR.PATCH`

**1.7.2 Version Embedding**
- Embed version in:
  - App UI ("About")
  - Binary metadata (mac Info.plist, Windows file version)
  - Update feed metadata

**1.7.3 Build Identifiers**
- Release version: `X.Y.Z`
- Build number: CI run number (or date-based) for traceability
- Commit SHA: included in diagnostics (support-friendly)

### Step 1.8: UX Requirements (Professional Baseline)

**1.8.1 Layout Requirements**
- responsive; all critical controls remain visible
- app scrolls when window height is small
- tables remain readable; target "~10 visible rows" when height allows

**1.8.2 Progress Requirements**
- current track info, elapsed/remaining, matched/unmatched counters
- cancel works reliably and leaves app in a safe state

**1.8.3 Discoverability Requirements**
- tooltips for key steps (Collection XML, playlists)
- shortcuts dialog accessible

**1.8.4 Export Requirements**
- obvious buttons, clear output location, "Open Output Folder"

**1.8.5 UX Acceptance Criteria**
- No clipped controls at common laptop resolutions (macOS 13")
- Keyboard usable end-to-end (tab order + Return to start + Esc to cancel)
- Errors always show:
  - what happened
  - what the user can do next
  - where logs are

### Step 1.9: Operational Requirements

**1.9.1 Storage Locations**
- Use stable storage locations via Qt `QStandardPaths`:
  - config, logs, cache, support bundles

**1.9.2 Logging Requirements**
- Rotating logs + crash capture

**1.9.3 Network Behavior**
- Safe network behavior:
  - timeouts
  - retries with backoff/jitter
- No sensitive data leaked to logs by default

**1.9.4 Data Retention**
- Cache: user can clear; bounded size policy
- History: keep last N runs or last N days (configurable)
- Exports: app never deletes user exports automatically

**1.9.5 Diagnostics (Supportability)**
Provide a "Copy diagnostics" / "Export support bundle" that includes:
- app version/build/SHA
- OS version
- update channel (stable/beta) and update feed URL
- key settings toggles (non-sensitive)
- last N log lines + crash log if present

### Step 1.10: "Done" Criteria for v1.0

**1.10.1 Build Criteria**
- CI builds produce **signed** artifacts for macOS and Windows.

**1.10.2 Release Criteria**
- Releases published to GitHub Releases with update metadata.

**1.10.3 Update Criteria**
- Installed app checks for updates and prompts user.

**1.10.4 Repository Criteria**
- CI prevents large files (e.g., `.venv`) from being committed.

### Step 1.11: Non-functional Requirements (NFRs)

**1.11.1 Reliability**
- no crashes on invalid inputs; fail gracefully.

**1.11.2 Performance**
- UI stays responsive; filtering is debounced; bulk table updates.

**1.11.3 Security**
- update integrity checks; safe defaults; no secret leakage.

**1.11.4 Maintainability**
- centralized UI tokens; clear module boundaries.

### Step 1.12: Out of Scope (v1.0)

**1.12.1 Localization**
- Full multi-language localization (prepare hooks only)

**1.12.2 Updates**
- Full Windows delta updates

**1.12.3 Telemetry**
- Telemetry (unless explicitly required; must be opt-in)
