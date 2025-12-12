## 2. Build System & Release Pipeline (Ship v1.0)

### 2.1 Goals
- Reproducible builds for macOS + Windows.
- Automated packaging, signing, and release publishing.
- A single source of truth for versioning.
- Generate update metadata (feeds) per release.

### 2.1.1 Guiding principles
- **Reproducible**: same tag produces the same versioned artifacts (modulo signing timestamps).
- **Auditable**: every artifact is traceable to a git tag + CI run + commit SHA.
- **Least privilege**: signing/notarization secrets are scoped to release workflows.
- **Fail-safe**: if signing/notarization fails, the release job fails and publishes nothing.

### 2.2 Tooling choices (recommended)
- **PyInstaller** for both platforms (single codebase, mature).
- **GitHub Actions** for CI/CD.
- **Apple signing/notarization**: `codesign`, `notarytool`, `xcrun stapler`.
- **Windows signing**: `signtool.exe` (EV cert preferred).
- **Installer**:
  - macOS: DMG tooling (`create-dmg` or custom script).
  - Windows: NSIS (simple) or WiX (enterprise).

### 2.3 Repository hygiene
- `.gitignore` must include `.venv/`, build artifacts (`dist/`, `build/`), caches.
- Store build outputs in CI artifacts, never in git.

### 2.3.1 CI “large file” gate
Add a required CI check that fails if any tracked file exceeds a threshold (e.g., 50MB) to prevent accidental commits of:
- `.venv/`
- Playwright browser bundles
- large binary assets

### 2.4 Version management
**Single source**: `SRC/cuepoint/__init__.py` (or `SRC/cuepoint/version.py`) defines `__version__`.

Release pipeline reads version and:
- sets PyInstaller version metadata
- sets mac Info.plist CFBundleShortVersionString
- sets Windows file version
- publishes tags: `vX.Y.Z`

### 2.4.1 Tagging policy
- Tags are the release trigger: `vX.Y.Z`
- `phase_*` branches are development; releases are cut from `main`/`release` branch.
- Hotfixes: cut `hotfix/vX.Y.(Z+1)` branch, tag, release.

### 2.5 CI structure (GitHub Actions)

#### Jobs
- **lint/test**:
  - run unit tests + minimal integration tests
  - run import/smoke tests for GUI startup (headless-friendly)
- **build-macos**:
  - PyInstaller build
  - sign `.app`
  - notarize + staple
  - create `.dmg`
  - generate mac update feed (appcast)
- **build-windows**:
  - PyInstaller build
  - sign `.exe`
  - build installer `.exe` or `.msi`
  - sign installer
  - generate windows update metadata (feed)
- **release**:
  - triggered on tag `v*`
  - upload artifacts to GitHub Release
  - upload update feed files

### 2.5.1 Proposed GitHub Actions workflow (pseudo-YAML)
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

### 2.5.2 Artifact structure (recommended)
For each release `vX.Y.Z`:
- GitHub Release assets:
  - `CuePoint-vX.Y.Z-macos-universal.dmg`
  - `CuePoint-vX.Y.Z-windows-x64-setup.exe`
- Update feed hosting (GitHub Pages):
  - `updates/macos/appcast.xml`
  - `updates/windows/appcast.xml`
  - optional: `release-notes/vX.Y.Z.html`

### 2.6 Secrets & cert handling
- macOS:
  - `APPLE_DEVELOPER_ID_CERT` + keychain import in CI
  - notarization: App Store Connect API key or Apple ID + app-specific password
- Windows:
  - Code signing cert stored in secure secret store; prefer hardware-backed (EV) for production

### 2.6.1 Secret inventory (minimum)
- `APPLE_TEAM_ID`
- `APPLE_NOTARYTOOL_ISSUER_ID`, `APPLE_NOTARYTOOL_KEY_ID`, `APPLE_NOTARYTOOL_KEY` (API key)
- `MACOS_SIGNING_CERT_P12`, `MACOS_SIGNING_CERT_PASSWORD`
- `WINDOWS_CERT_PFX`, `WINDOWS_CERT_PASSWORD`
- `GITHUB_TOKEN` (scoped to releases/pages)

### 2.7 Release gating
Before publishing a release:
- tests pass (required check)
- build artifacts created and signed
- update feeds generated and validated
- minimal smoke run of app on both OS (optional manual gate for v1.0)

### 2.7.1 Rollback strategy (operational)
- If a release is bad:
  1) Remove it from the **appcast** (most important).
  2) Optionally mark GitHub Release as “draft” or “pre-release”.
  3) Publish hotfix release `vX.Y.(Z+1)` and update appcast.

### 2.8 Artifact naming conventions
- macOS: `CuePoint-vX.Y.Z-macos-universal.dmg` (or `-arm64`, `-x64`)
- Windows: `CuePoint-vX.Y.Z-windows-x64-setup.exe`
- Feeds:
  - `updates/macos/appcast.xml`
  - `updates/windows/appcast.xml` (or JSON feed, see updater design)


