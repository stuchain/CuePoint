# Scripts Directory

Helper scripts for CI, the desktop build, development and maintenance. Every script that is
here is listed, grouped by what runs it. Run Python scripts from the repository root.

## Run by CI workflows (`.github/workflows/`)

- `build_engine_sidecar.py`: Builds the packaged Python engine (PyInstaller, `build/engine-sidecar.spec`)
  and smoke-tests it. `desktop-electron.yml`; also `npm run build:engine-sidecar`.
- `fetch_player_sidecar.py`: Downloads the pinned mpv player sidecar (`player_sidecar_manifest.json`),
  verifies it and runs the format and waveform-analysis checks (`--check-formats`, `--check-analysis`).
  `desktop-electron.yml`; also `npm run fetch:player-sidecar` and `verify:player-sidecar`.
- `player_sidecar_manifest.json`: The pinned mpv/FFmpeg versions and checksums `fetch_player_sidecar.py` reads.
- `check_bundled_licenses.py`: Checks the bundled mpv/FFmpeg component licences. `desktop-electron.yml`,
  `license-compliance.yml`.
- `check_desktop_version_coupling.py`: Checks `src/cuepoint/version.py` and the desktop `package.json`
  agree. `desktop-electron.yml`; also the `version-coupling.sh` Claude hook.
- `smoke_engine_health.py`: Starts the engine module and checks `/health` responds. `desktop-electron.yml`.
- `generate_sha256_sums.py`: Writes the checksums for a build leg's release artifacts. `--leg <leg>` names the file `SHA256SUMS-<leg>.txt` (without it, `SHA256SUMS.txt`). Hashes only the top-level files (installers, zips, block maps, manifests), not the unpacked app folders, other `SHA256SUMS*.txt` files or electron-builder's debug files. `desktop-electron.yml`.
- `check_no_qt.py`: Fails on any Qt import, requirement or CI install. `desktop-electron.yml`, `test.yml`;
  also the `qt-guard.sh` Claude hook.
- `audit_dead_code.py`: Reports what nothing shipped or run reaches (Python modules, scripts, workflows,
  Electron and renderer files, exports, CSS, docs, dependencies) and changes nothing. With `--check` it is
  the dead-code guard: exit 1 on a Python module, script or Electron/renderer file nothing shipped or run
  reaches (a file only tests reach counts as dead), or on a stale `ALLOWLIST` entry. `test.yml` runs
  `--check`. By hand, `python scripts/audit_dead_code.py --output report.md`; Phase 12's audit
  (`docs/v1/PHASE12_AUDIT.md`) is written from it.
- `check_acceptance.py`: Checks `docs/release/v1-acceptance.md`, the list of every check owed before
  `v1.0.0` (HARDEN-09): each row has a check, a source that exists, systems, a how, a result and, once it is
  not `owed`, a date. With `--release` it also exits 1 while any row is `owed` or `fail` (DEC-188). `release.yml`
  runs `--release` for a normal tag only, never a `-test.N` tag; the shape check runs in the unit tests.
- `run_tests.py`: Runs the Python test suites by layer (`--unit`, `--all`, `--no-slow`, `--coverage`). `test.yml`.
- `check_large_files.py`: Fails on files over the size limit. `large-file-check.yml`, `test.yml`.
- `check_file_sizes.py`: Fails if any tracked file exceeds the size limit. `release-gates.yml`.
- `validate_version.py`: Checks the version format and consistency (release gate R001). `release-gates.yml`.
- `validate_changelog.py`: Checks `docs/release/CHANGELOG.md` has an entry for the version or a non-empty
  `[Unreleased]` (release gate R002). `release-gates.yml`.
- `generate_sbom.py`: Writes an SPDX SBOM (release gate R003). `release-gates.yml`.
- `generate_requirements_hashes.py`: Writes the hashed requirements file for a `pip --require-hashes`
  install check. `release-gates.yml`.
- `generate_licenses.py`: Writes `THIRD_PARTY_LICENSES.txt` (release gate R004). `release-gates.yml`,
  `license-compliance.yml`.
- `validate_licenses.py`: Checks licence metadata of the build dependencies. `license-compliance.yml`;
  also run by `validate_compliance.py`.
- `validate_compliance.py`: Checks the in-app privacy disclosure (the Electron `PrivacyDialog.tsx`),
  `PRIVACY_NOTICE.md` and licences. `compliance-check.yml`.

## Run by the CLI

- `maintenance_report.py`: Dependency audit and environment report. `python main.py --maintenance-report`
  (`src/main.py`).

## Run by Claude hooks (`.claude/hooks/`)

- `check_no_qt.py` (`qt-guard.sh`) and `check_desktop_version_coupling.py` (`version-coupling.sh`) run after
  edits to the files they guard; see the CI list above.

## Developer tools (run by hand)

- `dev_setup.py`: Checks the Python version, creates a venv, installs dependencies and runs a sanity check
  (`.github/CONTRIBUTING.md`).
- `setup/install_requirements.sh`: Installs Python requirements on Linux/macOS.
- `analyze_licenses.py`: Best-effort licence analysis of the installed Python dependencies.
- `verify_macos_bundle.py`: Checks a packaged macOS app is in a state Apple would notarize.
- `check_bundle_arch.py`: Checks every Mach-O file in a packaged macOS app has the leg's chip (`--arch arm64|x64`). `desktop-electron.yml`.
- `merge_update_manifests.py`: Merges the arm64 and x64 `latest-mac.yml` into one (DIST-03; run by the release workflow).
- `generate_test_xml.py`: Generates synthetic Rekordbox XML fixtures (`--benchmark` for `bench.py`).
- `make_audio_fixtures.py`: Regenerates the tiny committed audio fixtures in `src/tests/fixtures/audio/`.

### Benchmarks

- `bench.py`: Matching benchmark over 1k/5k/10k-track XML fixtures (from `generate_test_xml.py`).
- `bench_library.py`: The library at 50,000 tracks (import, queries, indexes).
- `bench_clean.py`: Clean at 50,000 tracks.
- `bench_match_storage.py`: What storing 50,000 tracks' match attempts costs.
- `bench_sets.py`: Phase 10 (Prepare/Sets) at 50,000 tracks.
- `bench_marks.py`: Reading cue points and beat grids at 50,000 tracks.
- `bench_decoder.py`: The waveform decoder per format.
- `bench_waveform_store.py`: The waveform store at a large library's size.
- `bench_waveform_analysis.py`: The waveform analysis job.
- `bench_tag_write.py`: A tag write over 1,000 files, in place and through the checked copy (HARDEN-04).
- `bench_search_keys.py`: The path and search-key migrations (m0032, m0033) and searches on the keys at 50,000 tracks (HARDEN-06).
- `bench_waveforms.py`: Phase 11 as a whole at 50,000 tracks, run twice.
- `bench_engine_start.py`: Times the engine from launch to a healthy `/health`, each run in a fresh temporary
  home. `python scripts/bench_engine_start.py [--exe <packaged engine>]`. With `--library 50000` it starts on a
  full library instead (first answer, the launch backup, library ready, with and without a migration pending).
- `bench_migrations.py`: Migrations m0025 and m0027 over a library of 50,000 tracks (HARDEN-07).
- `budget_check.py`: The budgets every bench above is held to (`budgets.json`, per leg); `check e2e FILE`
  holds the packaged-app spec's numbers to them. Budgets were set from the first CI scale run (`set_from`); the Intel Mac is kept at 2.5 until its numbers arrive.
- `budgets.json`: The budget data: a base, a `scale` (and a `code_scale` for budgets written in a bench) and `overrides` for each of the four legs.
- `performance_tables.py`: Rewrites the tables of `docs/user-guide/performance.md` from a scale run's JSON
  (`.github/workflows/scale.yml` uploads it); `--check` exits 1 when the guide is out of date.

## Notes

- Scripts are grouped by intent. Run the CLI with `main.py`, and the desktop app with
  `npm run electron:start` in `apps/desktop-electron`.
- Several benches have a smaller test under `src/tests/` (for example `src/tests/performance/`) that runs in CI.
