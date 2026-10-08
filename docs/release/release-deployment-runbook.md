# Release Deployment Runbook

The one runbook for releasing CuePoint's Electron desktop app: how versions are set, what CI builds, how the macOS app is signed, what to test, and how to publish and announce.

## Where things stand

- **Releases are cut from `desktop-electron.yml`'s artifacts.** `.github/workflows/desktop-electron.yml` is the packaging workflow (DEC-147). `release.yml` and the per-OS build workflows no longer exist, so pushing a tag does not build anything. You build on a commit, then publish that commit's artifacts by hand.
- **There is no auto-updater and there are no update feeds.** The app does not check for updates. The updater is chosen in Phase 16 (DEC-145), and until then users install new versions by hand from the GitHub release. Nothing in this runbook publishes an appcast or feed.
- **Windows builds are unsigned.** The macOS build is signed and notarized only when credentials are present (see [Signing and notarizing](#signing-and-notarizing)).

## Release types

CuePoint follows [Semantic Versioning](https://semver.org). The cadence below is a target, not a promise.

| Type | Version | Contents | Target cadence |
| --- | --- | --- | --- |
| Major | `X.0.0` | Breaking changes to data formats or interfaces, major features. Needs a migration note. | Every 6-12 months |
| Minor | `X.Y.0` | New features, backward compatible. | Every 1-3 months |
| Patch | `X.Y.Z` | Bug fixes and security patches. No new features. | As needed |
| Hotfix | A patch shipped out of cycle | A critical fix (security, data loss, crash) that cannot wait. Skip the planning phase; keep the release gates. | Immediately |
| Test build | `X.Y.Z-test.N` | A GitHub pre-release for testers. The website offers only normal releases. | As needed (DEC-145) |

For breaking changes, see the [Breaking Change Policy](../policy/breaking-change-policy.md) and the [Deprecation Policy](../policy/deprecation-policy.md).

## Prepare the release

### Version

The version lives in `src/cuepoint/version.py` (`__version__`). The desktop `apps/desktop-electron/package.json` `version` (what `app.getVersion()` answers) must equal `__version__`, in the scheme `X.Y.Z` / `X.Y.Z-test.N`.

1. Set `__version__` in `src/cuepoint/version.py`.
2. Set `version` in `apps/desktop-electron/package.json` to the same string.
3. Run `python scripts/check_desktop_version_coupling.py`. It fails if the two differ.
4. Run `python scripts/validate_version.py` after you tag (see [Publish](#publish)), not before. It checks that the version is SemVer and that its base (`X.Y.Z`) matches the latest `v*` git tag. Until the new tag exists, the latest tag is the previous release, so this check, and the `release-gates.yml` job that runs it (R001), is expected to fail on the version-bump commit. Do not wait for R001 to go green before you tag.

### Changelog

Add the changes to `docs/release/CHANGELOG.md` under the new version. `python scripts/validate_changelog.py` fails unless the changelog has an entry for the current version or a non-empty `[Unreleased]` section. See the [Changelog Policy](../policy/changelog-policy.md).

### Release notes

Write the release notes from the template below. Keep the highlights, fixes and known issues. Link known issues to [Troubleshooting](../user-guide/troubleshooting.md) where there is a workaround.

## What CI builds

`desktop-electron.yml` runs on pushes to `main`, `feature` and `phase_*` branches and on pull requests to `main` and `feature`. It runs the same job on `ubuntu-latest`, `windows-latest` and `macos-latest` (Node 22, Python 3.12). In order, the job:

1. Installs Python (`requirements.txt`, `requirements-dev.txt`) and desktop dependencies (`npm ci` in `apps/desktop-electron` and in `renderer`).
2. Lints, tests and typechecks the renderer, then typechecks and builds the Electron shell.
3. Builds the engine sidecar with `python scripts/build_engine_sidecar.py`, which packages it with PyInstaller and smoke-tests `/health`.
4. Runs `scripts/check_no_qt.py`.
5. Fetches the mpv player sidecar (`fetch_player_sidecar.py`; it does nothing on Linux, which pins no binary), then runs its format-decode and waveform-analysis checks and `check_bundled_licenses.py`.
6. Runs the Electron main-process tests (`npm test`), the player sidecar tests, the engine unit tests, the engine health smoke (`scripts/smoke_engine_health.py`) and `check_desktop_version_coupling.py`.
7. Installs Playwright Chromium and runs the Electron smoke tests (`npm run test:e2e`).
8. When the `SENTRY_AUTH_TOKEN` repository secret is set, writes debug ids into main's and the renderer's JavaScript (`sentry-cli sourcemaps inject`) and uploads their source maps to the `electron` project of the `cuepoint` Sentry organization under release `cuepoint@<version>` and `dist` the first seven characters of the commit. Each OS leg uploads its own. Without the secret (a fork, a run that cannot read it) the step is skipped. Then deletes every `.map` under `electron-dist` and `renderer/dist`; electron-builder also excludes them, and `npm run pack` followed by `npx asar list release/linux-unpacked/resources/app.asar | grep '\.map$'` should print nothing.
9. Builds the installers with `npm run package` (electron-builder alone; `npm run dist` builds first, which would replace the files that carry the debug ids): a DMG on macOS, an NSIS installer on Windows, an AppImage on Linux. Output goes to `apps/desktop-electron/release/`.
10. Writes checksums with `python ../../scripts/generate_sha256_sums.py release`, which hashes every file under `release/` and writes `SHA256SUMS.txt` (SHA-256, one line per file, paths relative to `release/`) in that folder. Each leg writes a file with the same name.
11. Uploads `apps/desktop-electron/release/**` as the artifact `desktop-electron-<os>`.

Two other workflows gate the same commit:

- `release-gates.yml` (every PR and push to `main`/`feature`): version sync (R001, `validate_version.py`), changelog (R002), SBOM (R003, `generate_sbom.py`), the hashed-install check (see [Reproducible builds](#reproducible-builds)), the licence bundle (R004, `generate_licenses.py`), `ruff check`, the mypy gate (`test_mypy_foundation.py`), `ruff format --check` and `check_file_sizes.py`. On pushes it also runs the unit and integration tests on 3 operating systems and Python 3.11 and 3.12, with a 35% coverage floor.
- `test.yml` runs lint, format, type check and `python scripts/run_tests.py --all --coverage --no-slow`.

`security-scan.yml` runs `pip-audit` on the runtime, pinned build and development requirements on pushes, pull requests and weekly.

## Signing and notarizing

electron-builder signs and notarizes the macOS app through two hooks in `apps/desktop-electron/package.json`:

- `afterPack`: `build/signNestedBinaries.cjs` signs the code that electron-builder does not treat as part of the app, inside out, with the hardened runtime: the mpv player (`Contents/Resources/player/mpv.app`) and the engine sidecar (`Contents/Resources/engine/*`). It needs `CSC_NAME` or `CUEPOINT_SIGN_IDENTITY`.
- `afterSign`: `build/notarize.cjs` submits the signed app to Apple's notary service with `notarytool` and staples the ticket. It needs either the Apple ID credentials or the App Store Connect API key.

With no credentials, both print a note and skip, and the build is unsigned. That is what CI produces today, because no workflow sets credentials. Gatekeeper blocks an unsigned macOS build on other Macs until the user clears the quarantine flag (see the user guide's [getting started](../user-guide/getting-started.md)). For a distributable build, set the variables in [Key and Certificate Management](key-management.md) and run `npm run dist` on a Mac. The entitlements are in `apps/desktop-electron/build/entitlements.mac.plist` and `entitlements.mac.inherit.plist`.

### Checking a macOS build

Notarization fails late, so check the bundle first:

```bash
python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac-arm64/CuePoint.app --expect-hardened-runtime
```

The script checks for stray files that make a bundle unsignable, signatures on every Mach-O binary, the hardened runtime on the app and both sidecars, the entitlements Electron needs, and `codesign --verify --deep --strict`. It does not say the app is notarized. After notarization, `xcrun stapler validate <app>` confirms the ticket is stapled.

## Test before you publish

### Automated

CI covers these on every push. To run them locally first, from the repository root unless noted:

```bash
python scripts/run_tests.py --all --no-slow
ruff check src/ && ruff format --check src/
python scripts/check_no_qt.py
python scripts/validate_version.py && python scripts/validate_changelog.py
python scripts/check_desktop_version_coupling.py
cd apps/desktop-electron/renderer && npm run lint && npm test && npm run typecheck
cd apps/desktop-electron && npm test && npm run typecheck && npm run test:e2e
```

### Security gate

Before you tag, confirm:

- **Dependencies are clean.** The `security-scan.yml` run on the release commit passes.
- **Logs are redacted.** `LogSanitizer` (`cuepoint.utils.logger`) redacts user paths and secrets. `src/tests/unit/utils/test_step6_logging.py` covers path redaction.
- **Secure defaults hold.** `ProductConfig.redact_paths_in_logs` defaults to true (`src/tests/unit/test_secure_defaults.py`).
- **XML size is capped.** The Rekordbox parser rejects a file over `MAX_XML_SIZE_BYTES` (100 MiB); `test_parse_rekordbox_rejects_oversized_xml` covers it.
- **Privacy controls work.** **Help > Privacy...** offers clear cache and clear logs, now or on exit.

For vulnerability reports, see the [Security Response Process](../security/security-response-process.md).

### Manual, on the built installers

Take the installers from the CI artifacts and test on a clean user account or machine for each platform you ship (macOS, Windows, and Linux if you publish the AppImage).

- **Install.** macOS: open the DMG, drag CuePoint to Applications, and confirm Gatekeeper does not block a signed build. Windows: run the installer and confirm the shortcut. Linux: make the AppImage executable and run it.
- **Launch.** The main window appears and the engine starts (no engine error on screen).
- **Happy path.** In **Library**, import a Rekordbox XML export, run **Match all** on a playlist of about 10 tracks in **Clean**, review a match, and use **Export review list...** to save a file. Quit and relaunch, and check the library is still there.
- **Player.** Play a track, and check that its waveform draws (this covers the bundled mpv).
- **Errors.** Cancel a run partway and check nothing is corrupted. Try an invalid XML file and check that an error message appears. Try matching with the network off and check that the error is clear.
- **Help menu.** **About CuePoint...** shows the right version. **Export support bundle...** writes a bundle.
- **Uninstall and reinstall** on Windows, and check behaviour is the same.

Record the commit, the platforms tested and anything odd in the release notes' known issues.

## Publish

1. Merge to `main` and wait for a green `desktop-electron.yml` run on the release commit, on all three operating systems.
2. Tag that commit: `git tag vX.Y.Z <commit>` and `git push origin vX.Y.Z`. Use `vX.Y.Z-test.N` for a test build. Then run `python scripts/validate_version.py`; it passes once the tag matches `version.py`.
3. Download the `desktop-electron-<os>` artifacts from the run. Each leg's `SHA256SUMS.txt` has the same name, so rename them when you upload them to the release: `SHA256SUMS-windows.txt`, `SHA256SUMS-macos.txt` and `SHA256SUMS-linux.txt`. Check each one against its files (see [Checksums](key-management.md#checksums)). For a normal release, check that the macOS build is signed and notarized and says so (see [Checking a macOS build](#checking-a-macos-build)).
4. Create the GitHub release from the tag. Paste the release notes, attach the installers and the checksum files, and mark a test build as a pre-release. Mark a normal release as latest.
5. Announce it (below).

## Release notes and announcement templates

Use these for the GitHub release body and the announcement. Replace every `[placeholder]`, and delete sections you do not need.

Release notes:

```markdown
## CuePoint [version]

**Release date**: [date]

### Summary
[One or two sentences.]

### Added
- [New feature]

### Changed
- [Changed behaviour]

### Fixed
- [Bug fix]

### Security
- [Security fix]

### Performance
- [Improvement]

### Known issues
- [Issue and workaround]

### Upgrade notes
[Only if needed: steps and breaking changes.]

### Download
- **macOS**: [DMG link]
- **Windows**: [installer link]
- **Linux**: [AppImage link]

Checksums are in `SHA256SUMS-windows.txt`, `SHA256SUMS-macos.txt` and `SHA256SUMS-linux.txt` on the release.

### Full changelog
https://github.com/stuchain/CuePoint/blob/main/docs/release/CHANGELOG.md

### Support
- Report a bug: https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml
- Ask a question: https://github.com/stuchain/CuePoint/discussions
```

Announcement (Discussions or other channels):

```markdown
# CuePoint [version] released

We have released CuePoint [version].

## What is new
- [Highlight 1]
- [Highlight 2]

## Fixes
- [Fix 1]

## Download
Get it from the GitHub release: [release URL]. Install it over your current version; the app does not update itself yet.

## Breaking changes
[Only if applicable, with the migration steps.]

## Feedback
Report issues at https://github.com/stuchain/CuePoint/issues. Thank you for using CuePoint.
```

Tips: use plain language, do not oversell, say how to install, and thank people. For a short post on social media, give the version, one highlight and the download link.

## After release

- Check that each installer downloads, and install one on a clean machine.
- Watch new issues and Discussions for 24-48 hours. Triage by the [Support SLA](../policy/support-sla.md).
- If the release is broken, follow the [Rollback Runbook](rollback.md). For a live incident, see the [Incident Response Runbook](incident-response-runbook.md).
- Write down what went wrong or slowly, and plan the next release.

## The GitHub Pages site

`gh-pages-root/` holds the project's landing page (`index.html`, `logo.png`, `robots.txt`, `sitemap.xml`; the site is at <https://stuchain.github.io/CuePoint/>). `.github/workflows/publish-gh-pages-site.yml` publishes it to the `gh-pages` branch with `scripts/publish_feeds.py --site-only`. It runs on a push to `main` that changes `gh-pages-root/`, and on manual dispatch. It does not need a release tag, and it leaves everything else on `gh-pages` as it is. It commits only those four files. The script creates the `gh-pages` branch if it does not exist.

To set it up once, open **Settings > Pages** in the repository, choose the `gh-pages` branch and the `/ (root)` folder, and save. Then run the workflow from the **Actions** tab. The site can take a few minutes to appear. If you get a 404, check that the `gh-pages` branch exists and holds `index.html`, and check the workflow log.

The script's name is a leftover: it used to publish update feeds as well. It now publishes only the site.

## Reproducible builds

Reproducible here means the engine sidecar is built from pinned inputs, and the dependency install is checked against hashes. It does not mean bit-identical installers.

- **Pinned inputs.** `requirements-build.txt` pins every runtime dependency and the build tool (PyInstaller 6.17.0). The sidecar is described by `build/engine-sidecar.spec`, and `scripts/build_engine_sidecar.py` runs it. The mpv player is pinned by SHA-256 in `scripts/player_sidecar_manifest.json`, and `fetch_player_sidecar.py` refuses a binary that does not match.
- **Hashed-install gate.** `release-gates.yml` generates `requirements-build-hashed.txt` with `python scripts/generate_requirements_hashes.py` (it needs `pip-tools`) and installs it with `pip install -r requirements-build-hashed.txt --require-hashes`. The job fails if any package does not match its hash. Run the same two commands locally to reproduce the check.
- **Build locally.** Install `requirements-build.txt`, then run `python scripts/build_engine_sidecar.py`, then `npm run pack:full` or `npm run dist` in `apps/desktop-electron` (`pack:full` also builds the sidecar and fetches mpv). Set `CUEPOINT_BUILD_COMMIT` to a commit (the full or the short hash) before the sidecar build and the desktop build if you want the app, the engine and Sentry to name it (`dist`); without it a local build records no commit and About says "not recorded". To upload source maps by hand, run `npx sentry-cli sourcemaps inject electron-dist renderer/dist` after `npm run build`, upload with `sentry-cli sourcemaps upload --release cuepoint@<version> --dist <first 7 of the commit> electron-dist renderer/dist`, delete the `.map` files, and then package with `npm run package`: `npm run pack` and `npm run dist` build again first, which discards the injected debug ids. Local builds differ from CI in OS patch level, Python micro version, timestamps and signing.
- **Provenance.** Record the commit SHA, the CI run and the tool versions in the release notes for a release you publish. Nothing writes this automatically.

## Related documents

- [Key and Certificate Management](key-management.md)
- [Rollback Runbook](rollback.md)
- [Incident Response Runbook](incident-response-runbook.md)
- [Changelog](CHANGELOG.md)
