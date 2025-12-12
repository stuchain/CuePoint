## Step 2: Build System & Release Pipeline (Ship v1.0)

**Implementation Order**: This is the **second step** - required infrastructure for all packaging steps.

### Step 2.1: Goals

**2.1.1 Primary Goals**
- Reproducible builds for macOS + Windows.
- Automated packaging, signing, and release publishing.
- A single source of truth for versioning.
- Generate update metadata (feeds) per release.

**2.1.2 Guiding Principles**
- **Reproducible**: same tag produces the same versioned artifacts (modulo signing timestamps).
- **Auditable**: every artifact is traceable to a git tag + CI run + commit SHA.
- **Least privilege**: signing/notarization secrets are scoped to release workflows.
- **Fail-safe**: if signing/notarization fails, the release job fails and publishes nothing.

### Step 2.2: Tooling Choices (Recommended)

**2.2.1 Packaging Tool**
- **PyInstaller** for both platforms (single codebase, mature).

**2.2.2 CI/CD Platform**
- **GitHub Actions** for CI/CD.

**2.2.3 macOS Signing Tools**
- Apple signing/notarization: `codesign`, `notarytool`, `xcrun stapler`.

**2.2.4 Windows Signing Tools**
- Windows signing: `signtool.exe` (EV cert preferred).

**2.2.5 Installer Tools**
- macOS: DMG tooling (`create-dmg` or custom script).
- Windows: NSIS (simple) or WiX (enterprise).

### Step 2.3: Repository Hygiene

**2.3.1 Gitignore Requirements**
- `.gitignore` must include `.venv/`, build artifacts (`dist/`, `build/`), caches.

**2.3.2 Artifact Storage**
- Store build outputs in CI artifacts, never in git.

**2.3.3 CI "Large File" Gate**
Add a required CI check that fails if any tracked file exceeds a threshold (e.g., 50MB) to prevent accidental commits of:
- `.venv/`
- Playwright browser bundles
- large binary assets

### Step 2.4: Version Management

**2.4.1 Single Source of Truth**
- **Single source**: `SRC/cuepoint/__init__.py` (or `SRC/cuepoint/version.py`) defines `__version__`.

**2.4.2 Version Usage in Pipeline**
Release pipeline reads version and:
- sets PyInstaller version metadata
- sets mac Info.plist CFBundleShortVersionString
- sets Windows file version
- publishes tags: `vX.Y.Z`

**2.4.3 Tagging Policy**
- Tags are the release trigger: `vX.Y.Z`
- `phase_*` branches are development; releases are cut from `main`/`release` branch.
- Hotfixes: cut `hotfix/vX.Y.(Z+1)` branch, tag, release.

### Step 2.5: CI Structure (GitHub Actions)

**2.5.1 Test Job**
- **lint/test**:
  - run unit tests + minimal integration tests
  - run import/smoke tests for GUI startup (headless-friendly)

**2.5.2 macOS Build Job**
- **build-macos**:
  - PyInstaller build
  - sign `.app`
  - notarize + staple
  - create `.dmg`
  - generate mac update feed (appcast)

**2.5.3 Windows Build Job**
- **build-windows**:
  - PyInstaller build
  - sign `.exe`
  - build installer `.exe` or `.msi`
  - sign installer
  - generate windows update metadata (feed)

**2.5.4 Release Job**
- **release**:
  - triggered on tag `v*`
  - upload artifacts to GitHub Release
  - upload update feed files

**2.5.5 Proposed GitHub Actions Workflow (Pseudo-YAML)**
This is the target shape (not copy-paste final):

```yaml
name: release
on:
  push:
    tags:
      - "v*"
jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - checkout
      - setup python
      - install deps
      - run tests
      - large-file gate
  build_macos:
    needs: [test]
    runs-on: macos-latest
    steps:
      - checkout
      - build with pyinstaller
      - codesign nested + app
      - notarize + staple
      - create dmg
      - generate appcast entry
      - upload artifact
  build_windows:
    needs: [test]
    runs-on: windows-latest
    steps:
      - checkout
      - build with pyinstaller
      - signtool sign exe
      - build nsis installer
      - signtool sign installer
      - generate appcast entry
      - upload artifact
  publish:
    needs: [build_macos, build_windows]
    runs-on: ubuntu-latest
    steps:
      - create github release
      - upload dmg/exe
      - publish appcast to gh-pages (or upload to S3)
```

### Step 2.6: Artifact Structure (Recommended)

**2.6.1 Release Assets**
For each release `vX.Y.Z`:
- GitHub Release assets:
  - `CuePoint-vX.Y.Z-macos-universal.dmg`
  - `CuePoint-vX.Y.Z-windows-x64-setup.exe`

**2.6.2 Update Feed Hosting**
- Update feed hosting (GitHub Pages):
  - `updates/macos/appcast.xml`
  - `updates/windows/appcast.xml`
  - optional: `release-notes/vX.Y.Z.html`

### Step 2.7: Secrets & Cert Handling

**2.7.1 macOS Secrets**
- macOS:
  - `APPLE_DEVELOPER_ID_CERT` + keychain import in CI
  - notarization: App Store Connect API key or Apple ID + app-specific password

**2.7.2 Windows Secrets**
- Windows:
  - Code signing cert stored in secure secret store; prefer hardware-backed (EV) for production

**2.7.3 Secret Inventory (Minimum)**
- `APPLE_TEAM_ID`
- `APPLE_NOTARYTOOL_ISSUER_ID`, `APPLE_NOTARYTOOL_KEY_ID`, `APPLE_NOTARYTOOL_KEY` (API key)
- `MACOS_SIGNING_CERT_P12`, `MACOS_SIGNING_CERT_PASSWORD`
- `WINDOWS_CERT_PFX`, `WINDOWS_CERT_PASSWORD`
- `GITHUB_TOKEN` (scoped to releases/pages)

### Step 2.8: Release Gating

**2.8.1 Pre-Release Checks**
Before publishing a release:
- tests pass (required check)
- build artifacts created and signed
- update feeds generated and validated
- minimal smoke run of app on both OS (optional manual gate for v1.0)

**2.8.2 Rollback Strategy (Operational)**
- If a release is bad:
  1) Remove it from the **appcast** (most important).
  2) Optionally mark GitHub Release as "draft" or "pre-release".
  3) Publish hotfix release `vX.Y.(Z+1)` and update appcast.

### Step 2.9: Artifact Naming Conventions

**2.9.1 macOS Naming**
- macOS: `CuePoint-vX.Y.Z-macos-universal.dmg` (or `-arm64`, `-x64`)

**2.9.2 Windows Naming**
- Windows: `CuePoint-vX.Y.Z-windows-x64-setup.exe`

**2.9.3 Feed Naming**
- Feeds:
  - `updates/macos/appcast.xml`
  - `updates/windows/appcast.xml` (or JSON feed, see updater design)
