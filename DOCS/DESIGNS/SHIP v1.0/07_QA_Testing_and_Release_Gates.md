## Step 7: QA Testing and Release Gates (Ship v1.0)

**Implementation Order**: This is the **seventh step** - validates all previous steps.

### Step 7.1: Test Layers

**7.1.1 Unit Tests**
- Unit tests: parsing, matching, filtering, export formatting.

**7.1.2 Integration Tests**
- Integration tests: XML load → playlist selection → processing flow with fixtures.

**7.1.3 GUI Smoke Tests**
- GUI smoke tests:
  - app starts
  - main window loads
  - core widgets instantiate

**7.1.4 Test Pyramid Guidance**
- Keep most tests at the unit layer (fast, deterministic).
- Integration tests should avoid real network.
- GUI tests should be minimal and smoke-oriented for CI stability.

### Step 7.2: Test Data

**7.2.1 Fixture Strategy**
- Curate a small set of deterministic fixtures (XML + HTML snapshots).
- Avoid live Beatport in CI; use recorded snapshots/mocks.

**7.2.2 Fixture Strategy (Recommended)**
- Store:
  - small Rekordbox XML fixture(s)
  - small HTML response snapshots (Beatport)
  - expected output CSV "golden" files
- Use a "record once, replay always" approach:
  - update snapshots intentionally when parsing changes

### Step 7.3: Performance Checks

**7.3.1 Performance Benchmarks**
- Basic benchmark: 500 tracks processing completes within a target time (configurable).
- UI remains responsive (no long main-thread stalls).

**7.3.2 Performance Regression Gates**
- Track:
  - startup time
  - per-track processing time distribution (p50/p95)
  - filter apply time for tables
- Fail CI if regressions exceed thresholds (optional in v1.0; recommended in v1.1).

### Step 7.4: Release Gates

**7.4.1 Required Checks**
Required before tagging:
- All tests green on macOS + Windows
- Lint/type checks pass
- "No large files" gate (prevents `.venv` etc.):
  - CI job that fails if any tracked file > 50MB
- Packaging build completes and artifacts run in a clean environment VM.

**7.4.2 Release Readiness Checklist (Manual)**
- Verify update feed points to correct artifacts.
- Install from fresh artifact on:
  - macOS fresh user account
  - Windows fresh VM
- Run a full "happy path" flow:
  - select XML → process → export → open output folder
- Verify Past Searches:
  - loads recent CSV
  - filters
  - export

### Step 7.5: Manual QA Checklist (v1.0)

**7.5.1 Manual Test Scenarios**
- Fresh install path (no config present).
- Run: select XML, select playlist, process, export.
- Past Searches loads and exports.
- Cancel mid-run behaves correctly.
- Update prompt appears when new version exists (staged feed).

**7.5.2 Manual Test Scripts (Step-by-Step)**
**macOS**
1) Download DMG → drag to Applications.
2) First run: verify no Gatekeeper blocks.
3) Run processing on a small playlist (10 tracks).
4) Verify results table shows and exports.
5) Quit and relaunch; verify recent file handling.

**Windows**
1) Install via installer (per-user).
2) Launch; verify shortcut works.
3) Run processing; export.
4) Uninstall and reinstall; verify behavior.
