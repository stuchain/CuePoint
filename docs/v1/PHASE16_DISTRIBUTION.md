# CuePoint v1.0.0 — Phase 16: Distribution, Detailed Step Specifications

Status: **Specified 2026-10-07. DIST-09 built 2026-10-08 (packaged checks owed); the other steps are not implemented yet.** Nine steps, DIST-01…DIST-09 (DIST-09, the app's icon, added by DEC-198 on 2026-10-07).
Writing the steps raised ten questions that Decision Round 14 did not answer. They were asked as
Decision Round 19 (Q-170…Q-179) and settled the same day as DEC-169…DEC-178: nine as recommended,
and Q-171 otherwise. There is no Apple Developer account, so the Macs ship unsigned and update
themselves the way the retired app did (DEC-170). Each step below is written as the answers say. Per the process, no implementation happens
from this document. Each step needs an explicit "Implement DIST-NN" instruction, scoped to exactly
that step, and its outcome is recorded under the step afterwards.

Depends on Phases 1–15. Phase 15 must be complete first (DEC-140). It reuses what Phase 13 adds
(Sentry in all three processes, REPORT-07's one release name and its source-map upload) and what
Phase 14 adds (Settings' **About & updates** section, PAGES-01). Decision Rounds 1–18 apply
(`DECISIONS.md`, DEC-001…DEC-168). This phase's own decisions are DEC-145 (the updater's rule) and
DEC-129 (two Mac downloads), with DEC-169…DEC-178 (Decision Round 19), and DEC-019 (the old updater's fate, which this phase finally replaces),
DEC-147 (releases come from `desktop-electron.yml` until this phase), DEC-126 and DEC-153 (what
Sentry reports), DEC-132 (clear to new users), DEC-155 and DEC-158 (the app's words) and DEC-009
(the launch backup).

The step prefix is DIST.

## What this phase is

Today a CuePoint release is made by hand. A commit is built by `desktop-electron.yml` on three
systems, its artifacts are downloaded, and a GitHub release is made from them. The app never learns
that a newer version exists, and every Mac build is for Apple Silicon.

This phase makes releasing a tag, and updating automatic:
- **A release is a tag.** Pushing `vX.Y.Z-test.N` builds every download and publishes a GitHub
  pre-release; pushing `vX.Y.Z` publishes a normal release. Nothing is uploaded by hand.
- **One version string,** in DEC-145's scheme, read the same by the app, the engine, Sentry, the
  updater and the release.
- **macOS ships twice** (DEC-129): Apple Silicon and Intel, each built and checked on its own chip.
- **The app updates itself** on Windows and macOS (DEC-145): it checks at launch, every 4 hours and
  from Settings, downloads in the background, says **Update ready** with the release notes and
  **Restart now**, and otherwise installs at quit. A test build moves to the highest newer release,
  test or normal; a normal build only to a newer normal one.

**What this phase is not.**
- **No code signing.** Windows ships unsigned for now, with SmartScreen's warning accepted
  (DEC-145), and so does macOS, with no Apple Developer account (DEC-170).
- **No Linux self-update.** AppImages are updated by hand (DEC-145); at most the app says a new
  version is out (DEC-174).
- **No switch to turn updates off, and no skipping a version** (DEC-145).
- **No Windows on Arm, no Universal Mac build, no Mac App Store, no Microsoft Store, no package
  managers** (winget, Homebrew). Deferred, below.
- **No website.** Phase 17 builds the download page; this phase gives it stable file names that name
  the system and the chip.

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| The packaging workflow, three systems, `npm run dist`, checksums, artifacts | `.github/workflows/desktop-electron.yml` (matrix at line 17, `npm run dist` at 136, `generate_sha256_sums.py` after it) |
| electron-builder's config: NSIS on Windows, DMG on macOS, AppImage on Linux; no `publish` key; no `arch` | `apps/desktop-electron/package.json` (`build`) |
| Signing the bundled sidecars inside out, and notarizing, each a no-op without credentials | `apps/desktop-electron/build/signNestedBinaries.cjs`, `build/notarize.cjs` |
| What each signing variable is | `docs/release/key-management.md` |
| Checking a Mac bundle before notarizing | `scripts/verify_macos_bundle.py` |
| The engine sidecar, built for the machine's own chip | `scripts/build_engine_sidecar.py` (`normalize_arch`, lines 42-64), `build/engine-sidecar.spec` (`target_arch=None`, line 108) |
| An Intel mpv, pinned and hashed, that nothing packages | `scripts/player_sidecar_manifest.json` (`darwin-x64`, `…-macos-15-intel.zip`); `fetch_player_sidecar.py --target` (lines 1395-1399) |
| The version, and the check that holds two copies equal | `src/cuepoint/version.py:19`; `scripts/check_desktop_version_coupling.py:19-33` |
| SemVer and tag checks | `scripts/validate_version.py:124-172`, run in `release-gates.yml:88` |
| The changelog and its check | `docs/release/CHANGELOG.md`; `scripts/validate_changelog.py` |
| The quit that stops the player and the engine before the app exits, with a 5 s cap | `electron/quitAfter.ts:28`, `:43-64`; `main.ts:980-999` |
| Main's settings file, written atomically | `electron/mainSettings.ts:27-83` |
| The bridge and the test that holds it to main | `electron/preload.cjs:41`; `renderer/src/api/cuepointBridge.types.ts:2923`; `renderer/src/api/desktopContract.test.ts:73-87` |
| The launch backup, taken before any migration runs | DEC-009, FOUNDATION-11 (`migrations/m0025_sets.py:34-35`) |
| A database newer than the build is refused, by name | `services/migration_runner.py:107-120` (`DB_SCHEMA_TOO_NEW`) |
| End-to-end specs that can launch a packaged app | `CUEPOINT_E2E_EXECUTABLE` in 12 specs (e.g. `e2e/clean.spec.ts:18-20`) |
| Settings' **About & updates** section | PAGES-01 (Phase 14) |
| Sentry in every process, one release name, source maps uploaded from CI | REPORT-03…REPORT-07 (Phase 13) |
| The GitHub Pages site, published by its own workflow | `publish-gh-pages-site.yml`, `scripts/publish_feeds.py --site-only` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-145 | The rule as one pure function in main, with a test per row; SemVer precedence, prerelease included; the highest version wins; `X.Y.Z-test.N`; test releases as GitHub pre-releases; background download; **Update ready** with notes and **Restart now**, else install at quit; checks at launch, every 4 h and from Settings; no off switch, no skipping; HTTPS and the release's checksum; never a lower version; Windows and macOS only; `version.py`'s two odd versions renamed; `version_utils`' base-only comparison not reused; the mechanism chosen here (DEC-169, DEC-170). |
| DEC-129, DEC-170 | Two Mac builds, arm64 and x64, unsigned (DEC-170 amends "signed and notarized"); the Intel one built and checked on CI's Intel runner; the download and the updater name the chip; the user guide's "Intel planned" lines corrected when it ships. |
| DEC-147 | `desktop-electron.yml` stops being where releases come from; a tag-driven release workflow takes over. |
| DEC-126, DEC-153 | A failed update is reported; a check that fails because the computer is offline is not (a cause the user owns). |
| DEC-009 | The first launch of an update takes the launch backup before migrating, as every launch does; nothing new is needed, and DIST-08 checks it. |
| DEC-132, DEC-155, DEC-158 | Plain words: "Update ready", "Restart now", "You're up to date"; no "engine"; American spelling. |
| DEC-140 | This phase runs alone, after Phase 15. |

## Sequencing

**The version first.** DIST-01 makes one version string, in the new scheme. Everything after reads
it.

**Then the builds.** DIST-02 adds the Intel Mac leg. DIST-03 makes every build carry what an
updater needs (the Mac zip, the update manifests, file names that name the chip). DIST-04 adds the
release workflow, so a tag publishes a release.

**Then the updater.** DIST-05 is the rule and the release list, pure and fully tested. DIST-06 wires
it into main: check, download, verify, install. DIST-07 is what the user sees. DIST-08 updates the
docs and runs a real update from one test release to the next, on every system.

**Every intermediate build keeps working,** with every suite green. Until DIST-06 the app does not
check for anything, so a build between DIST-01 and DIST-05 looks unchanged apart from its version.

**The app's icon (DIST-09) can be built at any point before DIST-04's first release,** and depends
on nothing else here; it is listed last only because it was added last (DEC-198).

**The first build with the updater has to be installed by hand.** Nothing before it can update itself:
the published releases (v0.0.2, v0.0.3) and every build so far have no updater. DIST-08's runbook
and release notes say so.

## Before starting any step — ten cross-cutting facts

### 1. The version is three strings, and none is in the new scheme

- `src/cuepoint/version.py:19`: `__version__ = "1.0.0-feb1"`. Run from source, `get_version()`
  answers `__version_local_dev__ = "1.0.0-test1.0"`, a leftover of the old update checker's test
  track.
- `apps/desktop-electron/package.json`: `"version": "0.0.0"`, and `cuepoint.engineVersion` is
  `1.0.0-feb1`. The coupling check holds those two equal (`check_desktop_version_coupling.py:19-33`)
  and nothing checks `version`.
- `renderer/src/components/AboutDialog.tsx:5` hard-codes `1.0.0-feb1`.
- REPORT-07 builds Sentry's release `cuepoint@<version>` from `engineVersion`.

**Any Electron updater reads `app.getVersion()`, which is `package.json`'s `version`.** At `0.0.0`
every release looks newer. So `version` has to become the real version, and the coupling check has
to hold it to `version.py`.

### 2. The published releases

GitHub has three releases today: `v0.0.2` and `v0.0.3` (normal, from the retired app), and a draft
pre-release `v1.0.0-feb1-test1`. The tags are `v0.0.1`…`v0.0.3`. None carries update metadata, and
`v1.0.0-feb1-test1` is not in the `X.Y.Z-test.N` scheme. The rule must skip drafts, tags outside the
scheme and releases with no manifest for the user's system, so none of these is ever offered.

### 3. Nothing builds on a tag

`desktop-electron.yml` runs on pushes to `main`, `feature` and `phase_*` and on pull requests. No
workflow runs on a tag, so today pushing `vX.Y.Z` builds nothing (the runbook says so). The release
is assembled by hand from a run's artifacts. Each leg writes a file named `SHA256SUMS.txt`, renamed by
hand when attached.

### 4. Only Apple Silicon is built

The matrix's `macos-latest` is arm64. `build_engine_sidecar.py` and PyInstaller build for the
machine's own chip, so an Intel engine needs an Intel machine (or an x86_64 Python under Rosetta,
which is slower and not what DEC-129 asked). mpv's own Intel build comes from GitHub's
`macos-15-intel` runner, and that is the runner the Intel leg uses. electron-builder names a Mac
DMG `CuePoint-<version>-arm64.dmg` only when told to; today the name carries no chip.

### 5. Electron's Mac updater needs a signed app, and the retired app's did not

On macOS `electron-updater` installs through Squirrel.Mac, which **refuses an update whose code
signature does not match the running app's**, so an unsigned or ad-hoc-signed build cannot update
itself that way. There is no Apple Developer account (Q-171), so CuePoint's Macs stay unsigned.

The retired Qt app updated its unsigned Mac build without Squirrel
(`update/update_installer.py`, `_install_macos`, removed in b864019): it downloaded the DMG,
mounted it with `hdiutil`, deleted `/Applications/CuePoint.app`, copied the new app in, opened it and
exited. That works unsigned because **a file an app downloads with its own HTTP client carries no
quarantine flag**, so Gatekeeper does not stop the replaced app. Only the first copy, downloaded in a
browser, has to be cleared by hand, and the user guide's getting-started already says how. DEC-170
keeps that approach, made safer: the app is replaced where it is installed (not always
`/Applications`), only after the old one has quit, from the zip rather than a mounted DMG, and only
after its checksum passes. Apple Silicon runs only signed code, and electron-builder signs ad hoc when
no identity is set, which is enough for a copy with no quarantine flag (*inferred; DIST-08 confirms
it on both chips*).

### 6. Windows updates per user, with no prompt

electron-builder's NSIS defaults (no `oneClick` or `perMachine` is set) install per user, under
`%LOCALAPPDATA%\Programs`, so an update needs no administrator prompt. An unsigned installer is
accepted by the updater when no publisher is configured, and SmartScreen asks only for a file a
browser downloaded, not for one the app fetched itself (*inferred; DIST-08 confirms it on a clean
Windows account*).

### 7. The rule cannot be left to a stock channel

The common Electron updater, `electron-updater`, has GitHub channels of its own. They pick the
**newest-published** release rather than the highest version, and decide test from normal by the
channel's name. DEC-145 asks for the **highest** version by SemVer precedence, and for a test build to
take a newer normal one. For example, a `1.4.1` hotfix published after `1.5.0-test.1` would be offered
to a `1.5.0-test.1` build by a stock channel; DEC-145 offers it nothing, since `1.4.1` is lower. So
CuePoint's own function chooses the release, and `electron-updater` only downloads, checks and
installs it, on Windows (DEC-169).

### 8. Quitting already stops both sidecars, within 5 seconds

`quitAfter` holds the first quit, runs main's cleanup (media keys, playback, `player.dispose()`,
`engine.stop()`), then quits for real, or after 5 s whatever happens (`quitAfter.ts:28`, `:43-64`).
An updater's "restart and install" quits through `before-quit`, so it goes through the same hold, and
the engine and mpv are gone before the installer replaces their files. **There is no single-instance
lock** (`requestSingleInstanceLock` appears nowhere). A second copy, started while the first installs,
would hold the files the installer is replacing, and would run a second engine on the same library.

### 9. Nothing warns before quitting during work

Quitting while waveforms are analyzed, a library is matched or an export is written stops the work,
which each job already survives (resume or rerun). Nothing asks first. **Restart now** is a quit the
user did not think of as one, so it asks first, naming the work (DEC-173).

### 10. The mpv pin can vanish

mpv's builds come from its rolling `git-release` tag, which mpv republishes. A pinned asset 404s when
that happens (it did on 2026-10-07, and was re-pinned from the owner's machine). A release workflow
that fetches mpv at tag time can then fail on a commit that built yesterday. So CuePoint keeps its
own copy (DEC-175).

## DIST-01 — One Version, in DEC-145's Scheme

**Objective**: The app, the engine, Sentry and the release all read one version, in the
`X.Y.Z` / `X.Y.Z-test.N` scheme, and a check fails when any copy differs.

**User-visible result**: The About section shows `1.0.0-test.1` (DEC-176) and the
commit, from source and from a packaged build alike.

**Dependencies**: Phase 15.

**Existing code reused**: `check_desktop_version_coupling.py`; `validate_version.py`; REPORT-07's
release name and `dist`.

**Design**:
- **`version.py`:** `__version__` becomes the first version in the scheme (DEC-176:
  `1.0.0-test.1`). `__version_local_dev__` and the frozen/source split in `get_version()` go: a source
  run reports the same version, and Sentry already tells them apart by environment (REPORT-07).
- **`package.json`:** `version` becomes the same string. `cuepoint.engineVersion` goes, and main
  reads `app.getVersion()`. REPORT-07's release name is built from it.
- **About:** `AboutDialog.tsx`'s hard-coded string goes (or the About section that PAGES-01 moved it
  to); it reads the version from main.
- **The coupling check** holds `package.json` `version` equal to `__version__`, and keeps REPORT-07's
  assertion that main and the engine report one release.
- **`validate_version.py`** accepts exactly `X.Y.Z` and `X.Y.Z-test.N` (N ≥ 1, no leading zero), and
  refuses everything else, `1.0.0-feb1` included. Its tag comparison stays as the runbook describes
  it, and gains `--tag <tag>`, which asserts that the tag is `v` + the version, for DIST-04.

**Tests**:
- `src/tests/unit/scripts/test_check_desktop_version_coupling.py`: equal passes; `version` differing,
  missing or `0.0.0` fails.
- `src/tests/unit/scripts/test_validate_version.py`: `1.0.0`, `1.0.0-test.1` and `1.2.3-test.10`
  pass; `1.0.0-feb1`, `1.0.0-test1`, `1.0.0-test.0`, `1.0.0-test.01` and `1.0.0-beta.1` fail;
  `--tag v1.0.0-test.1` against `1.0.0-test.1` passes, against `1.0.0-test.2` fails.
- `src/tests/unit/test_version.py`: `get_version()` is `__version__`, frozen or not.
- `electron/appVersion.test.ts`: main's version is `app.getVersion()`, and is what the release name
  and the About payload carry.
- `desktopContract.test.ts`: the About payload's channel.

**Acceptance criteria / DoD**:
- `python scripts/check_desktop_version_coupling.py` and `python scripts/validate_version.py` pass.
- `grep -rn "1.0.0-feb1\|test1.0\|engineVersion" src apps/desktop-electron --include=*.py --include=*.ts --include=*.tsx --include=*.json` (package locks excluded) finds nothing.
- All suites pass, with the engine smoke check.

**Risks**: Low. `validate_version.py`'s tag comparison (R001) goes red on the version commit until the
tag exists, as the runbook already says.

**Complexity**: **S**

---

## DIST-02 — The Intel Mac Build

**Objective**: CI builds, tests and packages CuePoint for Intel Macs on an Intel runner, beside the
Apple Silicon build (DEC-129).

**User-visible result**: None in the app. Each `desktop-electron.yml` run has a fourth artifact,
`desktop-electron-macos-x64`.

**Dependencies**: DIST-01.

**Existing code reused**: the `darwin-x64` mpv pin; `build_engine_sidecar.py`'s `normalize_arch`;
`verify_macos_bundle.py`.

**Design**:
- **The matrix** names its legs by system and chip: `windows-x64` (`windows-latest`), `linux-x64`
  (`ubuntu-latest`), `macos-arm64` (`macos-latest`) and `macos-x64` (`macos-15-intel`). The artifact
  is `desktop-electron-<leg>`. Every step runs on every leg, as now, so the Intel leg runs the
  engine's tests, the player sidecar's decode and waveform checks on the Intel mpv, the end-to-end
  suite and `npm run dist`.
- **electron-builder** is passed the chip explicitly on Macs (`--arm64` or `--x64`, from the leg), so
  a runner's default never decides it, and the `extraResources` paths stay `${os}-${arch}`.
- **A guard,** `scripts/check_bundle_arch.py <app>`: every Mach-O file in the packaged app (Electron,
  the engine sidecar, mpv and their libraries) is for the leg's chip, read with `lipo -archs`. A
  universal file passes if it contains the chip. It runs after `npm run pack` on both Mac legs.
- **The runbook's "Checking a macOS build"** names both `mac-arm64` and `mac` (x64) output folders.
- **The user guide's Intel lines** (`features.md:114`, `support-policy.md:18`) change in DIST-08,
  when the first release with an Intel download is out, not here.

**Tests**:
- `src/tests/unit/scripts/test_check_bundle_arch.py`: a tree with an arm64 file fails on the x64 leg,
  a universal file passes, a non-Mach-O file is skipped (with `lipo` faked).
- The `macos-x64` leg itself: green on the commit that adds it.

**Acceptance criteria / DoD**:
- One `desktop-electron.yml` run is green on all four legs, and its `macos-x64` artifact's app passes
  `check_bundle_arch.py` and `verify_macos_bundle.py` (unsigned).
- The Intel DMG installs and starts on the Intel runner (the end-to-end suite run against the
  packaged app with `CUEPOINT_E2E_EXECUTABLE`, on that leg only).

**Risks**: **Medium.** `macos-15-intel` is GitHub's last Intel image, available until August 2027
(*per GitHub's announcement; confirmed on the first run*). After that the Intel build needs another
Intel machine or Rosetta, and DEC-129 is revisited. PyInstaller's hidden imports may differ on Intel;
the leg's packaged smoke test finds that.

**Complexity**: **S**

---

## DIST-03 — Every Build Carries What an Update Needs

**Objective**: Each build produces, beside its installer, what an updater downloads and checks: the
installer or the Mac zip, its block map, and a manifest naming its version, file, size and SHA-512.
File names name the system and the chip.

**User-visible result**: None in the app. The downloads have names like
`CuePoint-1.0.0-test.1-mac-arm64.dmg`.

**Dependencies**: DIST-02.

**Existing code reused**: electron-builder's targets and its update-info output; `generate_sha256_sums.py`.

**Design**:
- **Targets.** Windows: `nsis`, unchanged (per-user, fact 6). macOS: `dmg` and `zip` (the zip is
  what the Mac installer downloads, DIST-06). Linux: `AppImage`, unchanged.
- **File names** (`artifactName`), so the website (Phase 17) and the updater can pick by name:
  - `CuePoint-${version}-win-x64-setup.exe`;
  - `CuePoint-${version}-mac-${arch}.dmg` and `.zip`;
  - `CuePoint-${version}-linux-x86_64.AppImage`.
- **A `publish` entry of the generic kind,** with no URL of its own at build time, so
  electron-builder writes the update manifests (`latest.yml` on Windows, `latest-mac.yml` on macOS,
  `latest-linux.yml` on Linux) and the `.blockmap` files that let an update download only the blocks
  that changed. The updater points it at the chosen release at run time (DIST-06). Building never
  uploads anything; publishing is DIST-04's.
- **The two Mac manifests are merged.** Each Mac leg writes its own `latest-mac.yml` naming only its
  chip's zip. `scripts/merge_update_manifests.py arm64.yml x64.yml -o latest-mac.yml` writes one
  manifest listing both files, which is the form the updater reads to pick a Mac's own chip
  (DEC-129). It refuses two manifests whose versions differ, or one whose file lacks its chip in the
  name.
- **Checksums** are written per leg as `SHA256SUMS-<leg>.txt`, so nothing is renamed by hand.

**Tests**:
- `src/tests/unit/scripts/test_merge_update_manifests.py`: two manifests merge into one with both
  files and one version; differing versions fail; a file name with no chip fails; the output parses
  as YAML with the fields the updater reads (`version`, `files[].url`, `sha512`, `size`, `path`,
  `releaseDate`).
- `src/tests/unit/scripts/test_generate_sha256_sums.py`: the file is named for the leg.
- `electron/builderConfig.test.ts`: `package.json`'s `build` has the targets, names and generic
  publish entry above.

**Acceptance criteria / DoD**:
- One `desktop-electron.yml` run produces, per leg, the installer named as above, its block map, its
  manifest and `SHA256SUMS-<leg>.txt`; the two Mac legs' manifests merge with the script.
- `npm run dist` on a developer's machine still works offline and uploads nothing.

**Risks**: Low. The manifests' shape is `electron-updater`'s, and the merge test pins it.

**Complexity**: **S**

---

## DIST-04 — A Release Is a Tag

**Objective**: Pushing `vX.Y.Z-test.N` or `vX.Y.Z` builds every download and publishes one GitHub release with the installers, the merged manifests, the block maps, the
checksums and the release notes.

**User-visible result**: A test or normal release appears on GitHub with every file, without a hand
upload.

**Dependencies**: DIST-03; REPORT-07 (its source-map upload moves here for tagged builds).

**Existing code reused**: `desktop-electron.yml`'s build steps, as a reusable workflow;
`verify_macos_bundle.py`; `validate_version.py --tag`; `validate_changelog.py`.

**Design**:
- **`desktop-electron.yml` becomes callable** (`workflow_call`), keeping its push and pull-request
  triggers, with one input, `release: true|false`. On `true` it keeps the source maps' upload to Sentry, and keeps the artifacts for the release job.
- **`.github/workflows/release.yml`,** on `push: tags: ['v*']`:
  1. **Gate:** `validate_version.py --tag ${{ github.ref_name }}` (the tag is `v` + the version, in
     the scheme), and the changelog has a section for that version. A test tag may be on any branch;
     a normal tag must be on a commit `main` contains (DEC-177).
  2. **Build:** calls `desktop-electron.yml` with `release: true`, on all four legs.
  3. **Check the Macs** (DEC-170: no signing): both Mac apps pass `verify_macos_bundle.py` without
     `--expect-hardened-runtime`, and `codesign --verify` accepts their ad-hoc signature. The
     signing hooks stay as they are, no-ops without credentials, so signing can be added later
     without changing this design.
  4. **Publish:** merges the Mac manifests (DIST-03), then creates the GitHub release for the tag as
     a **draft**, uploads every file, writes the notes (DEC-178: that version's
     `CHANGELOG.md` section), and only then publishes it: a pre-release for a test tag, the latest
     release for a normal tag. A failure at any step leaves at most a draft, which the updater never
     reads (fact 2).
- **The mpv archives** come from a CuePoint release of their own (DEC-175,
  `sidecar-mpv-<version>`, holding the pinned archives with the same SHA-256, so a tag builds on any
  day; `fetch_player_sidecar.py` tries it first and mpv's rolling release second).
- **The old manual path** in the runbook is replaced by "push the tag", with the manual steps kept
  only for a release the workflow cannot build.

**Tests**:
- `src/tests/unit/scripts/test_release_notes.py` (for `scripts/release_notes.py <version>`, which
  extracts the section): a version's section is returned without its heading; a missing section
  fails; `[Unreleased]` is never used for a tag.
- `src/tests/unit/scripts/test_release_workflow.py`: reads `release.yml` and asserts the order (gate,
  build, sign, draft, upload, publish), that publishing is last, that a `-test.` tag sets
  `prerelease: true` and `make_latest: false`, and that a normal tag sets `make_latest: true`.
- `test_fetch_player_sidecar.py`: the mirror is tried first, a hash mismatch from
  either source fails, and the upstream URL is the fallback.
- **The first real release:** tagging `v1.0.0-test.1` publishes a pre-release with, for each of the
  four legs, the installer, the block map and the checksums, plus `latest.yml`, the merged
  `latest-mac.yml` and `latest-linux.yml`.

**Acceptance criteria / DoD**:
- `v1.0.0-test.1` is published by the workflow alone, as a pre-release, with every file above; both
  Mac apps in it pass `verify_macos_bundle.py` and `codesign --verify` (ad hoc, DEC-170).
- A tag that does not match the version fails at the gate, before any build.
- Pushes and pull requests still run `desktop-electron.yml` as before, unsigned.

**Risks**: **Medium.** The workflow is new, and the first real tag is its test. With no signing there
is no notarization wait.

**Complexity**: **M**

---

## DIST-05 — The Rule: Which Release Is Offered

**Objective**: One pure function decides, from the installed version and the published releases,
which release (if any) this computer is offered, exactly as DEC-145's table says; and one reader turns
GitHub's release list into its input.

**User-visible result**: None yet.

**Dependencies**: DIST-01.

**Existing code reused**: none (DEC-145: `version_utils`' base-only comparison is not reused, and it
went with `update/` in Phase 12, `PHASE12_AUDIT.md`).

**Design**:
- **`electron/updateRule.ts`**, pure:
  - `parseVersion(s)`: `X.Y.Z` or `X.Y.Z-test.N`, else `null`. A leading `v` is allowed for tags.
  - `compareVersions(a, b)`: SemVer precedence. `X.Y.Z-test.N` is below `X.Y.Z`; `test.N` compares
    numerically.
  - `pickUpdate(installed, releases, target)` returns the release to offer, or `null`:
    - releases that are drafts, outside the scheme, or have no manifest for `target`
      (`win-x64`, `mac-arm64`, `mac-x64` and `linux-x64`, DEC-174) are dropped;
    - a **normal** installed version keeps only normal releases; a **test** installed version keeps
      both;
    - of those **strictly higher** than the installed version, the highest is offered.
  - Nothing else decides: no date, no "latest" flag, no channel name.
- **`electron/releaseList.ts`** (DEC-169): reads
  `https://api.github.com/repos/stuchain/CuePoint/releases?per_page=100` over HTTPS, with a 15 s
  timeout and the app's version in the user agent, and maps each release to
  `{ tag, version, draft, prerelease, notes, publishedAt, assets }`. A release has a manifest for a
  target when its assets hold the matching manifest (`latest.yml`, `latest-mac.yml`,
  `latest-linux.yml`) and the target's file. Anonymous requests are limited to 60 an hour per address;
  the app makes at most one every 4 hours plus the button, and a refused or failed read is "could not
  check", never "up to date".
- **Where the repository is named:** one constant, so a fork or a move changes one line.

**Tests**:
- `electron/updateRule.test.ts`, one test per row and example of DEC-145:
  - test `1.4.0-test.2` with `1.4.0` and `1.5.0-test.1` out → `1.5.0-test.1`;
  - test `1.4.0-test.2` with `1.4.0-test.3` and `1.4.0` out → `1.4.0`;
  - test `1.4.0-test.9` with `1.4.0-test.10` out → `1.4.0-test.10`;
  - normal `1.4.0` with `1.5.0-test.1` out → nothing;
  - normal `1.4.0` with `1.4.1` and `1.5.0-test.1` out → `1.4.1`;
  - test `1.5.0-test.1` with `1.4.1` published later → nothing (fact 7);
  - equal or lower → nothing;
  - a draft, `v1.0.0-feb1-test1`, `v0.0.3` (no manifest), and a release with no file for the target
    → skipped;
  - `mac-x64` is not offered a release that has only an arm64 zip.
- `electron/releaseList.test.ts`, with a recorded GitHub response: mapping; a 403 or 429 and a
  timeout give "could not check"; a non-HTTPS URL is refused.

**Acceptance criteria / DoD**:
- Every row and example of DEC-145 has a passing test.
- `npm test` and `npm run typecheck` pass in `apps/desktop-electron`.

**Risks**: Low. The function is pure and the tests are its specification.

**Complexity**: **S**

---

## DIST-06 — The Updater in Main

**Objective**: Main checks at launch, every 4 hours and on request, downloads the chosen release in
the background, verifies it, and installs it on **Restart now** or at the next quit, on Windows and
macOS.

**User-visible result**: None yet but the bridge; DIST-07 shows it.

**Dependencies**: DIST-03, DIST-05; REPORT-04 (Sentry in main).

**Existing code reused**: `quitAfter`; `mainSettings`; the IPC and bridge pattern; REPORT-02's event
rules.

**Design**:
- **On Windows, `electron-updater`** (DEC-169), added with `npm install`, pinned. Its own choice is turned
  off: it is never asked to find a release. For the release `pickUpdate` chose, main sets a generic
  feed to that release's download folder
  (`https://github.com/stuchain/CuePoint/releases/download/<tag>/`) and lets the updater read that
  manifest, download, check and install:
  - `autoDownload: true`, `autoInstallOnAppQuit: true`, `allowDowngrade: false`;
  - the manifest's version must equal the chosen version, or the download is refused;
  - the download is checked against the manifest's SHA-512 before it runs (the release's checksum,
    DEC-145), over HTTPS only;
- **On macOS, CuePoint's own installer** (DEC-170), `electron/macInstaller.ts`, since Squirrel.Mac
  needs a signed app (fact 5):
  - **download:** the chip's zip, named in the chosen release's `latest-mac.yml`, fetched over HTTPS
    with main's own `net` stream into `userData/updates/<version>/` (never the browser's download
    manager, which would mark it quarantined), and refused unless its SHA-512 and size match the
    manifest;
  - **unpack:** `ditto -x -k` into the same folder; the result must be one `CuePoint.app` whose
    `Info.plist` version is the chosen version and whose code is for this Mac's chip
    (`check_bundle_arch`'s rule), or it is deleted and the update fails;
  - **where:** the app's own bundle (`app.getPath("exe")` up to `.app`). If that folder cannot be
    written (an admin-owned `/Applications` for a standard user), or the app runs translocated or from
    the DMG, nothing is replaced: the state is `manual`, and DIST-07 offers the download instead;
  - **install, after quit:** a small detached shell script, started last in `quitAfter`'s cleanup,
    waits for the app's process to exit, moves the old bundle aside, moves the new one in, removes the
    old one, and opens the new app if **Restart now** asked for it. If the move in fails, the old
    bundle is moved back, so the user is never left with no app. The script and its log live in
    `userData/updates/`;
  - **the quarantine flag** is never set on anything it writes, and a test checks it is absent.
- **`electron/updater.ts`**, a small state machine, the one place that talks to either installer:
  `idle → checking → (up-to-date | available → downloading → ready) | manual | failed`, with the version, the
  notes and the progress. It is unit-tested with the updater faked.
- **When:** 10 s after the window shows (so the first paint and the engine's start come first), then
  every 4 hours while open, and on `updates:check`. A check while one runs joins it. A version
  already downloaded is not downloaded again.
- **Restart now** (`updates:restart`) quits through `quitAfter`, so the player and the engine stop
  first (fact 8), then installs and relaunches. While work runs, it asks first, naming the work (DEC-173).
- **A single-instance lock.** `app.requestSingleInstanceLock()`; a second launch focuses the first
  window and exits (fact 8).
- **Linux:** the check runs and reports `available` with a link to the release, and nothing
  downloads (DEC-174).
- **Development and end-to-end runs** never check: the updater starts only in a packaged build, and
  `CUEPOINT_UPDATE_FEED` (a local folder or URL, test builds only) lets DIST-08's test point a
  packaged build at a staged release.
- **Reported to Sentry:** a failed download, a failed check of a download, a failed install. **Not
  reported** (DEC-153): offline, a DNS failure, GitHub's rate limit, a timeout. Those show as "could
  not check" and are retried at the next check.
- **The bridge:** `updates: { getState, check, restart, subscribe }`, with `updates:*` channels,
  typed in `cuepointBridge.types.ts` and held by `desktopContract.test.ts`.
- **Main's settings** gain `lastCheckedAt` and `lastSeenVersion` (for "What's new", DEC-172),
  in both `parseMainSettings` and `update`.

**Tests**:
- `electron/updater.test.ts` (updater faked): every state change; a launch check is scheduled after
  the window and repeats every 4 hours (fake timers); a second check joins the first; the feed is set
  to the chosen release's folder; a manifest version that differs from the chosen one is refused;
  offline, 403, 429 and a timeout give `failed` with "could not check" and no Sentry event; a failed
  download sends one; `restart` goes through `quitAfter`; nothing starts unpackaged; on Linux, a
  link and no download.
- `electron/macInstaller.test.ts` (file system and `ditto` faked where needed): a checksum or size
  mismatch deletes the download and fails; a bundle with the wrong version or chip fails; an
  unwritable folder, a translocated path and a DMG path give `manual`; the install script, run against
  a temporary folder with a fake app, swaps the bundles after the process exits, restores the old one
  when the move fails, and opens the new one only on **Restart now**; nothing written carries
  `com.apple.quarantine` (on the Mac legs, with the real `xattr`).
- `electron/singleInstance.test.ts`: a second instance exits and focuses the first window.
- `mainSettings.test.ts`: the two new fields round-trip, and unknown keys are still dropped.
- `desktopContract.test.ts`: every `updates:*` channel is handled and exposed.

**Acceptance criteria / DoD**:
- A packaged build pointed by `CUEPOINT_UPDATE_FEED` at a staged higher release downloads it,
  reports `ready`, and installs it at quit, on Windows and on each Mac (the full run is DIST-08's).
- `npm test`, `npm run typecheck` and the contract test pass.

**Risks**: **Medium.** Installing while a sidecar holds a file fails on Windows; the quit's order and
the single-instance lock are what prevent it. The Mac installer is CuePoint's own code replacing an
app bundle, so its restore path matters as much as its happy path. DIST-08 proves both on real
installs.

**Complexity**: **M**

---

## DIST-07 — Update Ready, in the App

**Objective**: The user sees, in plain words, when an update is downloading and ready, reads its
notes, and restarts now or later; Settings shows the version and checks on request.

**User-visible result**:
- **Update ready** appears as a quiet item in the status strip (DEC-171),
  "CuePoint 1.0.0-test.2 is ready", that opens a panel with the release notes and **Restart now** /
  **Later**). **Later** leaves it to install at quit, and the item stays until then.
- **Settings › About & updates** (PAGES-01) shows the version and build, "Last checked 10:42", the
  state in words ("You're up to date", "Downloading 1.0.0-test.2… 40%", "Update ready — Restart now",
  "Couldn't check for updates. You may be offline."), and **Check for updates**.
- **What's new** (DEC-172): on the first launch after an update, a panel with that version's
  notes, once, dismissed with **Got it**; also reachable from About & updates.
- On Linux (DEC-174), and on a Mac whose app cannot be replaced (`manual`, DEC-170): "CuePoint 1.0.1
  is out" with **Download**, which opens the release page.

**Dependencies**: DIST-06; PAGES-01 (the section); PAGES-02 and PAGES-12 (motion).

**Existing code reused**: the status strip; Settings' sections; the empty-state and panel shapes;
the motion kinds and switches.

**Design**:
- **Release notes are shown as text with simple formatting** (headings, lists, links, emphasis),
  rendered by a small allow-list renderer: no raw HTML, links open in the browser through
  `externalLinks`. The notes are untrusted text from the network.
- **Words** follow DEC-155 and DEC-158: never "engine", "channel", "feed" or "pre-release" in the UI;
  a test build is called a "test version".
- **Motion:** the status item's arrival uses the existing feedback kind (DEC-154) behind its switch;
  no new kind.
- **Keyboard and screen reader:** the status item is a button with a label; the panel is a dialog with
  focus kept inside it; state changes are announced politely.

**Tests**:
- `renderer/src/components/updates/UpdateStatusItem.test.tsx`: hidden while idle or up to date;
  "Downloading… 40%"; "ready" opens the panel; **Restart now** calls the bridge; **Later** closes it
  and the item stays.
- `renderer/src/components/updates/releaseNotes.test.ts`: headings, lists and links render; a
  `<script>`, an `<img onerror>` and a `javascript:` link do not.
- `renderer/src/screens/settings/AboutUpdatesSection.test.tsx`: version and build, each state's words,
  **Check for updates** disabled while checking.
- `WhatsNew.test.tsx`: shown once after the version changes, never on a first install,
  not again after **Got it**.
- The new strings contain neither "engine" nor "jobs" (DEC-155), checked as PAGES-03 checks the rest.

**Acceptance criteria / DoD**:
- Every state above reads right in every theme and size, by keyboard and screen reader, with motion
  on and with reduced motion.
- Renderer lint, tests and typecheck pass.

**Risks**: Low.

**Complexity**: **M**

---

## DIST-08 — The Docs, and a Real Update on Every System

**Objective**: The docs describe how CuePoint is released and updated today, and one real update is
run, test release to test release, on Windows, an Apple Silicon Mac and an Intel Mac.

**User-visible result**: The user guide says how updates work; the downloads name every system and
chip.

**Dependencies**: DIST-01…DIST-07.

**Existing code reused**: the runbook, `rollback.md`, `key-management.md`, the user guide, the
privacy notice.

**Design**:
- **`release-deployment-runbook.md`:** "Where things stand" and "Publish" become "push the tag"; the
  release types table keeps `X.Y.Z-test.N`; how a test build is installed by hand (DEC-145); that the
  first updater build is installed by hand by everyone.
- **`rollback.md`:** an update never goes lower (DEC-145), so a bad release is withdrawn by making it a
  draft again (the updater stops offering it at once) and fixed by a higher one. A build that already
  installed it stays until the fix; a database it migrated is refused by an older build by name
  (`DB_SCHEMA_TOO_NEW`), and the launch backup taken before the migration (DEC-009) is how to go back.
- **`key-management.md`:** that no build is signed (DEC-170), and what signing would need if an
  Apple Developer account is added later.
- **The user guide's getting-started** keeps clearing the quarantine flag for the first download, and
  says later updates need nothing.
- **`docs/features/update-system.md`:** rewritten to describe the updater as built.
- **The user guide:** a short "Updates" page (what happens, where to check, test versions);
  `features.md:114` and `support-policy.md:18` name both Mac chips.
- **`PRIVACY_NOTICE.md`:** it says CuePoint contacts the network only when the user asks; it now also
  checks GitHub for updates at launch and every 4 hours, sending only what any download sends (the
  address, the app's version in the user agent). Phase 13's changes to the same file are kept.
- **The changelog** gains the phase's entry.

**Tests**:
- `docs-check.yml` passes (links, headings).
- **The real update** (manual, recorded under this step): `v1.0.0-test.1` installed by hand, then
  `v1.0.0-test.2` tagged. On a clean Windows account, an Apple Silicon Mac and an Intel Mac (the Intel
  one on hardware if available, else on CI's runner with `CUEPOINT_UPDATE_FEED`), the installed app,
  within a minute of launch, says the update is ready; **Restart now** installs it, CuePoint relaunches
  as `1.0.0-test.2`, the library and settings are unchanged, a launch backup exists from before, and
  no CuePoint, engine or mpv process from the old version is left. On each Mac the app was installed from the DMG
  by hand once (quarantine cleared as the guide says), and the update replaced it with no Gatekeeper
  prompt; a second Mac run with the app in a folder the user cannot write shows **Download** instead. Then a second run where the user
  quits instead: the update installs at quit. On Windows, whether SmartScreen asked is recorded
  (fact 6).

**Acceptance criteria / DoD**:
- The real update passes on all three, and the outcome is recorded here with the versions and times.
- Every doc above describes what the app does, checked against the code.

**Risks**: Low in the docs. The real update is where anything earlier steps missed is found.

**Complexity**: **S**

---

## DIST-09 — The App's Icon

**Objective**: CuePoint has an icon of its own, a pixel-art mark in the app's style, on every system,
in every build from the first release in the new scheme (DEC-176) on (DEC-198).

**User-visible result**: The CuePoint icon on the taskbar and Start menu (Windows), the Dock and
Finder (macOS), the desktop's launcher (Linux), the installer and the DMG, and the window's title bar
where the system shows one.

**Dependencies**: None in this phase. Built before DIST-04's first release.

**Existing code reused**: none. Today `apps/desktop-electron/package.json` names no icon, there is no
`.ico`, `.icns` or app PNG in the repository, and every packaged build shows Electron's default icon.
`gh-pages-root/logo.svg` (a green rounded square) is not reused: it has none of the pixel signature.

**Design**:
- **The mark,** drawn in the app's style (`docs/v1/PIXEL_DESIGN_SYSTEM.md`): square, a black
  outline, a bevel, hard zero-blur shadow, in Neo Dark's violet accent. It is drawn by hand on pixel
  grids, not scaled down from a large picture, so small sizes stay crisp:
  - `apps/desktop-electron/build/icon-source/mark-16.svg`, `mark-32.svg` and `mark-64.svg`, one rect
    per pixel, each grid its own drawing;
  - a 1024 px master scaled up from the 64 grid with nearest-neighbor, for the large sizes.

  Two or three candidates are shown to the user as pictures in the thread, and the one the user
  approves is committed. Nothing is built from an unapproved mark.
- **`scripts/build_app_icons.py`** makes, from those sources, every file electron-builder needs, into
  `apps/desktop-electron/build/` (its `buildResources` default, already holding the entitlements):
  - `icon.ico` with 16, 24, 32, 48, 64, 128 and 256 px, each small size from its own grid;
  - `icon.icns` with 16 to 1024 px (`@1x` and `@2x`);
  - `icon.png` (512 px) and `icons/<size>x<size>.png` for Linux;
  - the generated files are committed, so a build needs no image tool, and the script's `--check`
    fails when they are older than the sources or differ from what the sources give.
- **`package.json`'s `build`:** `icon` for each of `win`, `mac` and `linux` (and NSIS's
  `installerIcon` and `uninstallerIcon`), so the installer and the DMG carry it too.
- **The window:** `BrowserWindow`'s `icon` is set on Windows from `build/icon.ico` and on Linux from
  `build/icon.png`, so a development run shows it as well (macOS takes the bundle's).
- **The renderer's About section** (Settings › About & updates, PAGES-01) shows the mark at 64 px.
- **The website (Phase 17)** reuses the same sources for its favicon and OG images (SITE-11).

**Tests**:
- `src/tests/unit/scripts/test_build_app_icons.py`: the `.ico` holds every size above and each small
  size equals its own grid pixel for pixel; the `.icns` holds every size; `--check` passes on the
  committed files and fails after a source changes.
- `electron/builderConfig.test.ts`: `build.win.icon`, `build.mac.icon`, `build.linux.icon` and the
  NSIS icons point at files that exist.

**Acceptance criteria / DoD**:
- The user approved the mark.
- `npm run dist` on Windows shows the icon on the installer, the Start menu, the taskbar and the
  window; on a Mac, in the DMG, the Dock and Finder; on Linux, on the AppImage. Checked on the user's
  PC through Remote Control, and on the macOS and Linux CI legs by inspecting the built bundle's
  icon files.
- `python scripts/build_app_icons.py --check` runs in CI and passes.

**Risks**: Low in code. The mark is the user's to approve.

**Complexity**: **S**

**Outcome (2026-10-08)**: Built ahead of the rest of the phase, at the user's request. The user picked
the Camelot wheel from three candidates (DEC-210): twelve key colours around a dark centre with a
white cue pip, on Neo Dark's violet tile. Grids are drawn for 16, 24, 32 and 48 as well as 64
(`build/icon-source/mark-*.svg`), so every small `.ico` size is its own drawing.
`scripts/build_app_icons.py` is standard-library only; its tests check every pixel of every entry.
The window icon ships as an extra resource (`resources/icon.ico` on Windows, `resources/icon.png`
on Linux) and is read from there when packaged.

**Checked on Windows (2026-10-08), in a packaged build.** The installer and `CuePoint.exe` (which
the Start menu shortcut points at) each hold all seven sizes, read back from the files and each a
crisp drawing on a dark and a light background. The check found the window passing the 512 px PNG,
so the title bar and the taskbar shrank it and the wheel blurred at 16 to 32 px. The window now takes
`icon.ico`, and reading the running window's icons back gives the hand-drawn 16 and 32 px images.
The tile is opaque with a dark outline, so it reads on both taskbar themes. The installer was not
run, so the Start menu and taskbar were judged from the files and the window's icons, not by eye.

Still owed: the macOS DMG/Dock/Finder check
(including whether Finder uses the hand-drawn 16 and 32 grids from the PNG `icp4`/`icp5` entries)
and the Linux AppImage check. The 64 px mark in Settings › About & updates rides PAGES-01.

---

## Phase-level acceptance

Phase 16 is complete when:

1. Pushing a `vX.Y.Z-test.N` tag publishes a pre-release, and a `vX.Y.Z` tag the latest release, each
   with an installer for Windows, an Apple Silicon Mac, an Intel Mac and Linux, the update manifests,
   the block maps, the checksums and the notes, with nothing uploaded by hand. *DIST-03, DIST-04.*
2. Both Mac builds pass the bundle checks unsigned (DEC-170), each contains only its own chip's code, and the Intel one
   was built and tested on an Intel runner. *DIST-02, DIST-04.*
3. The app, the engine, Sentry, the About section and the release report one version, in the
   `X.Y.Z` / `X.Y.Z-test.N` scheme. *DIST-01.*
4. Every row and example of DEC-145 has a passing test of the one rule, and no other code decides
   what is offered. *DIST-05.*
5. A real update from one test release to the next works on Windows and on each Mac, by **Restart
   now** and at quit, with the library, the settings and the launch backup intact and no old process
   left. *DIST-06, DIST-08.*
6. Offline, the app says it could not check, sends no report, and works as before. *DIST-06, DIST-07.*
7. The update's words read well in every theme and size, by keyboard and screen reader, with every
   motion switch on and with reduced motion. *DIST-07.*
8. The runbook, the rollback runbook, key management, the user guide and the privacy notice describe
   what the app and the release workflow do. *DIST-08.*
9. Every build carries CuePoint's own icon, the pixel mark the user approved, on every system.
   *DIST-09.*
10. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check, the
   end-to-end suite and `npm run dist` on all four legs.
11. No decision in DEC-001…DEC-198 is contradicted. A contradiction stops
    the work and is raised rather than worked around.

## Decision Round 19 — what writing the steps raised

Asked in `OPEN_QUESTIONS.md` as Q-170…Q-179 and answered 2026-10-07: Q-171 as the user chose, the
rest as recommended.

| Question | Outcome | Needed by |
| --- | --- | --- |
| Q-170 — Which mechanism installs updates? | DEC-169: CuePoint's rule picks the release; `electron-updater` installs it on Windows | DIST-05, DIST-06 |
| Q-171 — Where are the Mac builds signed? | DEC-170: nowhere; Macs ship unsigned and replace themselves at quit, as the retired app did | DIST-04, DIST-06 |
| Q-172 — Where does "Update ready" appear? | DEC-171: a quiet item in the status strip that opens the notes | DIST-07 |
| Q-173 — "What's new" after an update? | DEC-172: once, on the first launch after it | DIST-06, DIST-07 |
| Q-174 — Restart now while work is running | DEC-173: ask first, naming the work | DIST-06 |
| Q-175 — Linux | DEC-174: say a new version is out, with a download link | DIST-05…DIST-07 |
| Q-176 — Keeping a copy of mpv | DEC-175: mirror each pinned archive on a CuePoint release | DIST-04 |
| Q-177 — The first version in the new scheme | DEC-176: `1.0.0-test.1`, with `1.0.0` at the end of Phase 18 | DIST-01 |
| Q-178 — Which branches can release | DEC-177: test tags from any branch, normal tags only from `main` | DIST-04 |
| Q-179 — Where release notes come from | DEC-178: the version's `CHANGELOG.md` section | DIST-04, DIST-07 |

## Deferred, with reasons

- **Code signing.** DEC-145 ships Windows unsigned and DEC-170 macOS. A Windows certificate later
  changes the build's settings and the updater's publisher check; an Apple Developer ID later lets the
  Macs sign, notarize and move to `electron-updater`, with the release workflow's signing step added
  back. Neither changes the rule.
- **Windows on Arm and Linux on Arm.** Not asked for; each is another build leg.
- **A Universal Mac build.** DEC-129 chose two builds.
- **Stores and package managers** (Mac App Store, Microsoft Store, winget, Homebrew, Flathub). Each has
  its own review and update path; not asked for.
- **Linux self-update.** DEC-145: by hand.
- **Staged rollouts** (offering a release to a share of users first). Not asked for, and DEC-145's
  rule has no share in it.
- **Download links on the website.** Phase 17, using DIST-03's file names.
