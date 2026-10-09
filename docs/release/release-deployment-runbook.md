# Release Deployment Runbook

The one runbook for releasing CuePoint's Electron desktop app: how versions are set, what CI builds, how the macOS app is signed, what to test, and how to publish and announce.

## Where things stand

- **A release is a tag (DIST-04).** Pushing `vX.Y.Z` or `vX.Y.Z-test.N` runs `.github/workflows/release.yml`, which builds every download with `desktop-electron.yml` (DEC-147) and publishes one GitHub release (see [Publish](#publish)). Nothing is uploaded by hand.
- **The app updates itself (DIST-06, DIST-07).** Windows and macOS builds check GitHub's release list at launch and every 4 hours, choose a release by DEC-145's rule, and install it on **Restart now** or at quit. Linux shows a download link. The release you publish is the update: there is no appcast, no feed to upload and no step beyond [pushing the tag](#publish). See [Updates](#updates) and `docs/features/update-system.md`.
- **Windows builds are unsigned.** The macOS build is unsigned too: it carries only an ad hoc signature (DEC-170). A Developer ID signature and notarization would be added later, and the hooks do it only when credentials are present (see [Signing and notarizing](#signing-and-notarizing)).

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

## Updates

An installed build reads GitHub's list of published releases and chooses one by the rule in DEC-145. The rule compares versions by SemVer precedence:

- A test build (`X.Y.Z-test.N`) is offered the highest version above its own, test or normal.
- A normal build is offered the highest normal version above its own, never a test version.
- No build is ever offered a lower version.

What that means when you release:

- **Pushing the tag is the whole release.** `release.yml` builds, uploads the files and manifests (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and publishes. The updater reads the published release; a draft is invisible to it.
- **Installing a test build by hand.** A test version is never offered to a normal build, and no setting turns tests on. A tester downloads the installer from the pre-release's page and installs it as in the [user guide](../user-guide/getting-started.md#install) (on a Mac, clear the quarantine flag as that page says). From then on the build updates itself to newer test or normal releases. A tester who takes a normal release becomes a normal user and must install a test build by hand again.
- **The first build with the updater is installed by hand by everyone.** Nothing released before it can update itself, so every existing user, tester included, downloads it and installs it over the old copy once.
- **Windows and Mac install the same way.** The install starts only at the end of the quit cleanup, through `quitAndInstall` on Windows and a detached script on a Mac (DEC-224). A quit that hits the 5 second limit installs nothing; the update installs at the next quit.
- **Linux is told, not updated.** The AppImage is replaced by hand (DEC-174).
- **Test versions without a release.** For a packaged test version only, `CUEPOINT_UPDATE_FEED` points the updater at a folder served over HTTPS (or HTTP on localhost) that holds `releases.json` and the files, for example from `python -m http.server`. A normal version ignores it.
- **Withdrawing a release.** Turn it back into a draft; see the [Rollback Runbook](rollback.md).

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
9. Builds the installers with `npm run package -- <chip flag>` (electron-builder alone, never publishing; `npm run dist` builds first, which would replace the files that carry the debug ids): a DMG and a zip on macOS, an NSIS installer on Windows, an AppImage on Linux. The Mac legs pass `--arm64` or `--x64`. Output goes to `apps/desktop-electron/release/`. File names carry the system and chip (`CuePoint-<version>-mac-arm64.dmg`, `-mac-x64.zip`, `-win-x64-setup.exe`, `-linux-x86_64.AppImage`). Beside them electron-builder writes the `.blockmap` files and the update manifest (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`). The `publish` entry in `package.json` (the generic provider) exists only so it writes these; its URL is not used at run time, and nothing is uploaded by a build. The two Mac manifests each name one chip, and `scripts/merge_update_manifests.py arm64.yml x64.yml -o latest-mac.yml` merges them into the one the updater reads.
10. Writes checksums with `python ../../scripts/generate_sha256_sums.py release --leg <leg>`, which hashes the files at the top of `release/` (not the unpacked app folders) and writes `SHA256SUMS-<leg>.txt` (SHA-256, one line per file) in that folder, so no file needs renaming.
11. Uploads `apps/desktop-electron/release/**` as the artifact `desktop-electron-<leg>` (`windows-x64`, `linux-x64`, `macos-arm64`, `macos-x64`).
12. Called by `release.yml` (`release: true`), the Sentry upload in step 8 is required rather than best-effort, and the leg also uploads `release-<leg>` for seven days: only the files at the top of `release/` that a release holds (`CuePoint-*` installers, dmg, zip, AppImage and block maps, `latest*.yml` and `SHA256SUMS-<leg>.txt`).

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

Notarization fails late, so check the bundle first. CI builds the app for both chips (DIST-02), and electron-builder writes each to its own folder: `release/mac-arm64/` for Apple Silicon and `release/mac/` for Intel.

```bash
python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac-arm64/CuePoint.app
python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac/CuePoint.app
```

With a Developer ID, add `--expect-hardened-runtime` to each:

```bash
python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac-arm64/CuePoint.app --expect-hardened-runtime
python scripts/verify_macos_bundle.py apps/desktop-electron/release/mac/CuePoint.app --expect-hardened-runtime
```

Then check that every Mach-O file in the app is for the folder's chip. A universal file passes if it contains the chip:

```bash
python scripts/check_bundle_arch.py apps/desktop-electron/release/mac-arm64/CuePoint.app --arch arm64
python scripts/check_bundle_arch.py apps/desktop-electron/release/mac/CuePoint.app --arch x64
```

With no Developer ID, electron-builder signs nothing, so the `afterPack` hook (`build/signNestedBinaries.cjs`) signs the whole bundle ad hoc, inside out, with the hardened runtime and the entitlements; that is what makes `codesign --verify --deep --strict` pass (DEC-170). The `macos-arm64` and `macos-x64` legs of `desktop-electron.yml` run both checks that way (without `--expect-hardened-runtime`), and the `macos-x64` leg also runs the end-to-end specs that launch the packaged app (`CUEPOINT_E2E_EXECUTABLE`), smoke test included.

`verify_macos_bundle.py` checks for stray files that make a bundle unsignable, signatures on every Mach-O binary, the hardened runtime on the app and both sidecars, the entitlements Electron needs, and `codesign --verify --deep --strict`. It does not say the app is notarized. After notarization, `xcrun stapler validate <app>` confirms the ticket is stapled.

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

- **Install.** macOS: open the DMG, drag CuePoint to Applications, and confirm Gatekeeper's prompt for an unsigned build (DEC-170) and that the steps in the user guide clear it. Windows: run the installer and confirm the shortcut. Linux: make the AppImage executable and run it.
- **Launch.** The main window appears and the engine starts (no engine error on screen).
- **Happy path.** In **Library**, import a Rekordbox XML export, run **Match all** on a playlist of about 10 tracks in **Clean**, review a match, and use **Export review list...** to save a file. Quit and relaunch, and check the library is still there.
- **Player.** Play a track, and check that its waveform draws (this covers the bundled mpv).
- **Errors.** Cancel a run partway and check nothing is corrupted. Try an invalid XML file and check that an error message appears. Try matching with the network off and check that the error is clear.
- **Help menu.** **About CuePoint...** shows the right version. **Export support bundle...** writes a bundle.
- **Uninstall and reinstall** on Windows, and check behaviour is the same.
- **Update from the previous release.** Install the previous release by hand (clear the quarantine flag on a Mac), publish the new one, and launch the old copy. Within about a minute (the first check runs 10 seconds after the window shows) the status strip says the new version is ready. **Restart now** installs it and CuePoint opens as the new version, with the library and settings unchanged and no old CuePoint, engine or mpv process left. Then repeat with **Later** and quit: the update installs at quit, once the player and engine have stopped (if that takes over 5 seconds, it installs at the next quit instead). Do this on Windows, an Apple Silicon Mac and an Intel Mac. On a Mac, check that no Gatekeeper prompt appears, and that an app in a folder you cannot write shows **Download** instead. On Windows, note whether SmartScreen asks. If an install does not take, the next launch says so (and on a Mac the log is `install.log` in the updates folder under the user data folder). This run is made for each release and recorded with it; it is not part of the automated checks.

Record the commit, the platforms tested and anything odd in the release notes' known issues.

## Publish

**Push the tag.** Everything below happens in `.github/workflows/release.yml`.

1. For a normal release, merge to `main` first (the gate refuses a normal tag on a commit `main` does not contain, DEC-177); a test tag may be on any branch. Set the version (see [Version](#version)), and add a changelog section headed `## [X.Y.Z]` or `## [X.Y.Z-test.N]` for it. The section must exist and have text before the tag is pushed: it becomes the release notes (DEC-178), and `scripts/release_notes.py <version>` fails without it. `[Unreleased]` is never used for a tag, so rename it to the version in the same commit.
2. Tag the commit and push the tag: `git tag vX.Y.Z <commit>` and `git push origin vX.Y.Z`. Use `vX.Y.Z-test.N` for a test build.
3. The workflow runs, in this order:
   - **Gate.** `validate_version.py --tag` (the tag is `v` plus `version.py`'s version, in the scheme), the changelog section, and, for a normal tag, that the commit is on `main` (`git merge-base --is-ancestor`; DEC-177). A test tag may be on any branch.
   - **Build.** `desktop-electron.yml` on all four legs, with the Sentry source-map upload required.
   - **Check the Macs.** Both Mac apps, unpacked from the zip, pass `verify_macos_bundle.py` (without `--expect-hardened-runtime`) and `codesign --verify --deep --strict`. Nothing is signed with a certificate (DEC-170); the ad hoc signature is what is verified.
   - **Publish.** Merges the two Mac manifests into one `latest-mac.yml`, creates the release as a **draft** with the notes, uploads every file, and only then publishes it: a pre-release (not latest) for a test tag, the latest release for a normal tag. A failure at any step leaves at most a draft, which the updater never reads.
4. Check the release (see [After release](#after-release)): the four installers, their block maps, `latest.yml`, `latest-mac.yml`, `latest-linux.yml` and the four `SHA256SUMS-<leg>.txt` files are attached, and a checksum matches (see [Checksums](key-management.md#checksums)).
5. Announce it (below).

If the workflow fails, fix the cause and delete the draft release and the tag (`git push --delete origin vX.Y.Z`) before pushing it again on the fixed commit. A published release is not re-published by the workflow.

### The mpv archives

Builds fetch the pinned mpv archives from CuePoint's own release `sidecar-mpv-<mpv version>` first and from mpv's rolling release second (DEC-175), so a tag builds on any day. Run the **Mirror player sidecar** workflow (Actions, run manually) once for every mpv pin, after `python scripts/fetch_player_sidecar.py --update-manifest` is merged. It downloads each pinned archive, checks its SHA-256 and attaches it to a pre-release of that name. The tag is outside the version scheme, so the updater never offers it. It runs on a GitHub runner, so nobody uploads the archives by hand. A hash mismatch from either source fails the build.

### When the workflow cannot build it

Only for a release the workflow cannot build. Publish a green commit's artifacts by hand:

1. For a normal release, merge to `main` (a test build may use any branch) and wait for a green `desktop-electron.yml` run on the release commit, on all four legs.
2. Tag that commit and push the tag as above (the tag starts the workflow; if it cannot run, push it only once the release is ready). Run `python scripts/validate_version.py`; it passes once the tag matches `version.py`.
3. Download the `desktop-electron-<leg>` artifacts from the run. Each leg's `SHA256SUMS-<leg>.txt` already has its own name. Merge the two Mac manifests with `scripts/merge_update_manifests.py arm64.yml x64.yml -o latest-mac.yml`. Check each checksum file against its files (see [Checksums](key-management.md#checksums)). For a normal release, check that the macOS build says what it is (see [Checking a macOS build](#checking-a-macos-build)).
4. Create the GitHub release from the tag. Paste the release notes, attach the installers, block maps, manifests and the checksum files, and mark a test build as a pre-release. Mark a normal release as latest.

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

Checksums are in `SHA256SUMS-windows-x64.txt`, `SHA256SUMS-macos-arm64.txt`, `SHA256SUMS-macos-x64.txt` and `SHA256SUMS-linux-x64.txt` on the release.

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
Get it from the GitHub release: [release URL]. Windows and macOS builds offer it inside the app; on Linux, or on an earlier version, install it over your current version.

## Breaking changes
[Only if applicable, with the migration steps.]

## Feedback
Report issues at https://github.com/stuchain/CuePoint/issues. Thank you for using CuePoint.
```

Tips: use plain language, do not oversell, say how to install, and thank people. For a short post on social media, give the version, one highlight and the download link.

## After release

- Check that each installer downloads, and install one on a clean machine.
- Check that an installed copy of the previous version offers the new one (see the update run under [Manual, on the built installers](#manual-on-the-built-installers)).
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
