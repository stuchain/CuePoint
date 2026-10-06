# CuePoint v1.0.0 — Phase 12 Audit

Status: **Written 2026-10-06 by PRUNE-01. Awaiting the user's marks. Nothing has been deleted.**

This is the audit `PHASE12_CLEANUP.md` asks for (PRUNE-01, DEC-147). It lists every candidate this
phase could remove, with its evidence, grouped A to J, and proposes a verdict for each:
- **keep**: it stays as it is;
- **update**: it stays and is corrected;
- **merge into X**: its facts move to X, and then it goes;
- **delete**: it goes, and git history keeps it.

Anything uncertain says so, and is proposed as **keep** until the user says otherwise.

**The gate.** No later step deletes anything until its group is marked below. A group can be approved,
struck, or approved except named items. A later step deletes only what its group's mark covers.

| Group | What it proposes | Removed in | Mark |
| --- | --- | --- | --- |
| A — Qt | 5 modules and the Qt tests deleted; `paths.py` and `diagnostics.py` rewritten to their headless paths; `requirements-qt.txt`, Qt CI steps and AGENTS.md's Qt rows go; the guard widens | PRUNE-02 | *pending* |
| B — The old updater | `update/` deleted, after its one live piece (`security.py`) moves beside `services/security_service.py` | PRUNE-03 | *pending* |
| C — Legacy Python | 25 unreached modules deleted; the 3 root shims deleted after their importers are repointed; `src/__init__.py` kept | PRUNE-03 | *pending* |
| D — Tests | Tests of removed code deleted; 18 stray files at `src/tests/`'s root deleted, 1 moved | PRUNE-02, PRUNE-03 | *pending* |
| E — Scripts | 46 keep, 1 update, 81 delete (of 128) | PRUNE-04 | *pending* |
| F — Workflows | `build-macos.yml`, `build-windows.yml`, `release.yml` deleted; `release-gates.yml` and `test.yml` lose their Qt and feed steps | PRUNE-04 | *pending* |
| G — Electron and renderer | 6 files deleted; unused exports made private or removed; unused CSS rules deleted | PRUNE-05 | *pending* |
| H — The repository root | `collection_incrate_playlist.xml`, `run_gui.*`, `src/gui_app.py`, `requirements-qt.txt`, `Makefile` and `.pylintrc` deleted; `config/` and `third_party/` kept | PRUNE-02, PRUNE-04 | *pending* |
| I — Dependencies | 57 keep, 14 delete | PRUNE-06 | *pending* |
| J — Docs | 103 keep, 29 update, 36 merge, 82 delete (`docs/v1/` and the ADRs kept) | PRUNE-07 | *pending* |

## How this was made

`python scripts/audit_dead_code.py` (added by this step) produced the evidence. It reads the tracked
files and writes a report, and changes nothing. It can be run again at any time, and PRUNE-08 keeps it
as the guard. Untracked files are never reported (DEC-147, Q-150).

**Python.** The import graph starts from what ships: `main.py`, `src/main.py`, the engine's
`__main__.py`, everything `build/engine-sidecar.spec` packages, and `pyproject.toml`'s entry points.
Every `import` counts, including those inside functions, behind `TYPE_CHECKING` and in `try` blocks.
Fact 2's loads without an import line are followed too:
- `importlib.import_module` and `__import__` of a literal name;
- `pkgutil.iter_modules(__path__)`, which reaches every child of its package (the migrations);
- the sidecar's `hiddenimports` and `collect_submodules`;
- scripts that a staying workflow, npm, a hook, `pre-commit` or the developer docs run.

What the scan cannot read is listed and was checked by hand:
- computed imports: only `migrations/__init__.py` in shipped code;
- files loaded by path;
- every unreached module's name in configs, specs and strings (the "Named elsewhere" column).

Migrations are never candidates.

**Scripts.** Each script's references are found by its file name, and by its import name in scripts
and tests. A reference counts by its source:
- a workflow, npm script, hook, `pre-commit` or the build: it runs the script;
- AGENTS.md, README, `scripts/README.md`, `docs/development/` or a skill: it tells a developer to run it;
- a live script: it runs it.

A script that only the retired app's pipeline runs (group F) is marked `retired-pipeline`.
`PHASE12_CLEANUP.md`, this document, the audit script and its test name every candidate, and do not
count as references.

**Electron and the renderer.** The graph runs from `electron/main.ts`, the runtime `preload.cjs` and
`renderer/index.html`, through `import`, `export … from`, `import()`, `require()`,
`new URL(…, import.meta.url)` and CSS `@import`.
- **Tooling:** config files and what they name.
- **Test roots:** tests, stories and the end-to-end suite.
- **Exports:** an export counts as used when a live file imports it by name or takes the whole module.
- **CSS:** a class counts as used when its name appears in live code. A class built from a string
  prefix is listed for a person to check.

TypeScript's own `noUnusedLocals` already covers what is unused inside a file. It reports nothing in
the renderer (it is on) or in Electron main (checked with the flag).

**Docs.** For each Markdown file: its title, last commit, what links to or names it, broken relative
links, and how often it names a retired subject (Qt, inCrate, the Sparkle updater, the PyInstaller app,
retired screens).

**Dependencies.** Each requirement and npm package, with the code that imports it, sorted by whether
that code ships, runs, tests or is dead. Tools used without an import are counted too: commands,
flags, fixtures and config strings.

**Its own tests.** `src/tests/unit/scripts/test_audit_dead_code.py` builds a small tree holding every
case it must tell apart, and checks each one:
- a reached module and an unreached one;
- a module only `importlib` loads;
- a migration;
- a module only its test imports;
- a script only a doc names;
- the Electron and CSS cases.

It also runs the audit over this repository.

## What the audit found beyond the specification

1. **`publish_feeds.py` stays.** `publish-gh-pages-site.yml` runs it with `--site-only`, and that
   workflow stays until Phase 17. PRUNE-04 deletes its feed half, not the script.
2. **A second live shim.** Fact 5 named only `performance`. Live code also imports `src/duckduckgo_search.py`
   first: `data/beatport.py` and `services/beatport_service.py`, with `ddgs` as the fallback.
   **Fact 5's question is answered:** the packaged engine contains both `performance` and
   `duckduckgo_search` (read from the sidecar built for the baseline). The import has not been failing
   in shipped builds.
3. **Why `update/` looks alive.** `services/security_service.py` imports `update.security`.
   `update/__init__.py` then imports the whole package (the checker, preferences, signature verifier
   and `version_utils`). Nothing else shipped uses it.
4. **The sidecar spec names modules that no longer exist.**
   - `hiddenimports` lists `cuepoint.ui.gui_interface` and `cuepoint.ui.controllers.export_controller`.
     PyInstaller logs `ERROR: Hidden import … not found` for both on every build.
   - `excludes` lists `cuepoint.ui.main_window`, `cuepoint.ui.widgets` and `cuepoint.ui.dialogs`.
   - All five go in PRUNE-03. The `PySide6`, `PyQt5` and `PyQt6` excludes stay, so that a developer's
     installed Qt never enters the sidecar.
5. **The release skill drives the retired pipeline.** `.claude/` and `.agents/`'s `cuepoint-release`
   skill tells a developer to run `step10_release_readiness.py`. That runs `build_pyinstaller.py` and
   the appcast scripts. The skill is rewritten with the docs (group J), and the scripts it alone keeps
   alive are marked in group E.
6. **The Qt tests are silently skipped, not failing.** `src/tests/conftest.py` lists 10 Qt test files
   and 2 Qt test folders (the folders no longer exist). It ignores them whenever `cuepoint.ui` cannot
   be imported, which is now always. One, `test_phase3_complete.py`, also tests live code. Three more
   Qt-dependent tests are not on the list, and fail collection wherever PySide6 is missing (group D).
7. **CI was red before this phase.** See the baseline. Three causes were fixed in their own commits
   before this audit, because the baseline needed them:
   - **The desktop lockfile was out of step with its `package.json`.** `npm ci` failed on every OS; Desktop Electron
     has failed on every run since at least 2026-09-13.
   - **The mypy gate failed in Linux CI.** It passed on Windows: `ctypes.get_last_error` exists only in
     Windows' stubs. The gate now checks Linux, macOS and Windows on any machine.
   - **`npm run dist` failed outside CI.** electron-builder could not name the repository. It now
     finishes locally, which the baseline's installer needs.

   A fourth was fixed too: pip-audit's 85 known vulnerabilities in the pinned aiohttp, Pillow and
   pytest. Pillow ships in the engine.

   The baseline's own runs found two more, fixed the same way:
   - **An order-dependent test.** A test's `LoggingService` switched off the `cuepoint` logger's
     propagation for every test after it.
   - **An engine bug.** A POST the engine refused was answered with its body unread, which on
     Windows can reset the connection before the client reads the answer.

   The rest belong to this phase's steps:
   - Test and Release Gates fail collecting Qt tests without PySide6 (PRUNE-02);
   - the two build workflows fail building the retired app (PRUNE-04);
   - Docs Check fails on links inside `docs/ui-overhaul/` (PRUNE-07);
   - Compliance Check fails on "Privacy dialog is missing" (PRUNE-04 checks what it validates).
8. **`maintenance_report.py` is run by the CLI.** `--maintenance-report` runs it by path
   (`src/main.py`), and a CLI flag is a public interface. The scan sees only a reference from source;
   it was checked by hand, and is kept.
9. **`psutil` is imported but not declared.** Three shipped modules import it optionally. It is in no
   requirements file (only its stubs are), so the packaged engine runs without it. PyInstaller's
   warnings say so. This is noted for PRUNE-06; nothing changes here.
10. **Fact 4 holds.** `src/gui_app.py` imports no Qt. `run_gui.sh` and `run_gui.command` launch it;
    `run_gui.bat` runs `npm run electron:start` itself (group H).

## The baseline

PRUNE-08 compares against these. They were taken on commit `06844ee1`: this step's code,
with the fixes above. Windows 11, Python 3.13.7, Node 24.14.0.

**Fact 6, taken again** (tracked files; `audit_dead_code.py --section counts`):

| What | Fact 6's survey | Now | Why it moved |
| --- | --- | --- | --- |
| Python modules in `src/cuepoint/` | 290 files, 105,043 lines | 290 files, 105,095 lines | The fixes in `audio_decode.py` and `engine/server.py` |
| Python test files | 464 files, 160,058 lines | 468 files, 161,250 lines | This step's two test files, and the two fixes' regression tests |
| Electron and renderer TypeScript | 515 files, 121,141 lines | 515 files, 121,141 lines | |
| `scripts/` | 127 files, 25,221 lines | 129 files, 27,925 lines | `audit_dead_code.py` and `bench_engine_start.py` |
| Markdown in `docs/` | 218 files, 57,076 lines | 220 files, 59,188 lines | This spec and this audit; the design rounds' edits |
| Markdown anywhere in the repository | — | 250 files, 61,496 lines | |
| Modules no shipped entry point reaches | 51, of which 26 migrations | 27, and 27 migration files (26 migrations and their package) held apart | Counted apart now |
| Modules naming PySide6 / importing it | 11 | 11 / 7 | |
| Test files naming PySide6 or pytest-qt | 12 | 13 | One is this audit's own test, whose fixture plants a Qt import |
| Scripts referenced by nothing | 29 | 29 | |
| Scripts by the scan's status | about 40 referenced only by docs or unreferenced scripts | 20 run, 12 run by a run script, 25 named by developer docs, 8 run only by the retired pipeline, 34 named only by docs, tests or dead scripts, 29 by nothing | The scan now sorts every script |
| Workflows naming Qt or building the PyInstaller app | 4 | 4 (and `release.yml`, which publishes its feeds) | |
| Folders under `docs/`, loose files | 16, 4 | 16, 6 | |

**Every suite:**

| Suite | Command | Result |
| --- | --- | --- |
| Python, everything under `src/tests` (Qt installed, as on this machine) | `python -m pytest src/tests -p no:randomly` | 12,152 passed, 75 skipped, 0 failed (12,227 collected), 36 minutes |
| Python, everything, as CI runs it (PySide6 not importable) | the same, `-p no:pytest-qt`, with PySide6 made unimportable | 12,138 passed, 50 skipped, 1 failed, 3 errors collecting. All four are Qt tests (groups A and D): `test_diagnostics.py::test_collect_config_info`, and `test_error_reporting_prefs.py`, `test_step6_crash_handler.py` and `test_step6_performance_workers.py`, which cannot be collected. CI stops at those errors (Release Gates); this run went on past them to count the rest |
| Renderer unit and component tests | `npm test` (renderer) | 4,209 passed in 159 files |
| Renderer lint | `npm run lint` | 0 errors, 9 warnings (`only-export-components`) |
| Renderer typecheck | `npm run typecheck` | clean |
| Electron main tests | `npm test` (desktop) | 595 passed in 28 files |
| Electron main typecheck | `npm run typecheck`, and again with `--noUnusedLocals` | clean, and 0 unused locals |
| Electron end to end | `npm run test:e2e` | 70 passed, 1 skipped (the opt-in memory run, `CUEPOINT_E2E_MEMORY=1`), 9.8 minutes |
| The mypy gate | `test_mypy_foundation.py` | passes for Linux, macOS and Windows |
| Engine smoke | `scripts/smoke_engine_health.py`, and the packaged sidecar's own smoke | both pass |

**The engine's start**, launch to a healthy `/health`, every run a first launch in an empty home
(`scripts/bench_engine_start.py --runs 5`):

| Engine | First run | Median | Min | Max |
| --- | --- | --- | --- | --- |
| From source (`python -m cuepoint.engine`) | 1,056 ms | 1,047 ms | 1,041 ms | 1,056 ms |
| Packaged sidecar (`cuepoint-engine.exe`) | 2,599 ms | 2,573 ms | 2,572 ms | 2,599 ms |

The same five runs taken in another session of the same day, on the same machine, gave medians of
1,545 ms and 3,102 ms. The machine's load moves these by up to a third, so PRUNE-08 measures this
commit again in the same session as its own build, and compares the two.

**Sizes** (Windows x64):

| What | Bytes |
| --- | --- |
| Packaged engine sidecar, `resources/engine/win-x64/cuepoint-engine.exe` | 80,360,117 (76.6 MiB) |
| Installer, `release/CuePoint Setup 0.0.0.exe` (`npm run dist`) | 182,625,997 (174.2 MiB) |
| Unpacked app, `release/win-unpacked/` | 432,187,877 (412.2 MiB) |
| Python modules packaged in the sidecar (`cuepoint.*`) | 261, of them 26 migrations |

**CI on `feature` before this phase** (the run for `32183d00`):

| Workflow | State | Why |
| --- | --- | --- |
| Desktop Electron | failing | `npm ci`: the lockfile was out of step (fixed, `2688ac0f`) |
| Test | failing | the mypy gate on Linux and macOS (fixed, `ff134005`) |
| Release Gates | failing | Qt tests fail collection without PySide6 (PRUNE-02); the mypy gate (fixed) |
| Security Scan | failing | 85 known vulnerabilities in aiohttp, Pillow and pytest (fixed, `1de4be30`) |
| Docs Check | failing | 17 broken links in `docs/ui-overhaul/` (PRUNE-07) |
| Compliance Check | failing | "Privacy dialog is missing" (PRUNE-04) |
| Build macOS, Build Windows | failing | they build the retired app (PRUNE-04) |
| License Compliance | passing | |

Pushing is not part of this step, so the fixed workflows' green runs are owed to the next push.

## Group A — Qt

PRUNE-02 removes Qt entirely (DEC-147, Q-148). Of the 11 modules that name PySide6, 7 import it:

| Path | Lines | Evidence | Proposal |
| --- | --- | --- | --- |
| `src/cuepoint/utils/paths.py` | 771 | Shipped. `QStandardPaths` is tried first, inside `try`; the headless fallback is what the sidecar runs | **update**: keep only the headless path, held by `test_paths_headless.py` |
| `src/cuepoint/utils/diagnostics.py` | 314 | Shipped. A `QSettings` fallback, inside `try` | **update**: keep only the headless path, held by `test_diagnostics.py` |
| `src/cuepoint/utils/crash_handler.py` | 451 | Unreached; imports PySide6 | **delete** (group C) |
| `src/cuepoint/utils/error_reporting_prefs.py` | 52 | Unreached; imports PySide6 | **delete** (group C) |
| `src/cuepoint/utils/i18n.py` | 190 | Unreached; imports PySide6 | **delete** (group C) |
| `src/cuepoint/utils/performance_workers.py` | 354 | Unreached; imports PySide6 | **delete** (group C) |
| `src/cuepoint/utils/sentry_init.py` | 256 | Unreached; imports PySide6 | **delete** (group C) |
| `onboarding_service.py`, `privacy_service.py`, `update/__init__.py`, `utils/platform.py` | — | Name PySide6 only in a docstring saying they must not import it | **keep** the rule (`update/__init__.py` goes with group B) |
| `requirements-qt.txt` | 2 | PySide6 and pytest-qt; no workflow installs it | **delete** |
| `src/tests/conftest.py` | 486 | `_QT_TEST_PATH_FRAGMENTS`, `pytest_ignore_collect`, a `QApplication` fixture and `pytest_sessionfinish`'s Qt quit | **update**: the Qt parts go |
| Qt tests | — | See group D | **delete** |
| `pytest.ini`'s `ui` marker, `run_tests.py`'s `not ui` | — | Mark and deselect the Qt tests | **delete** the marker; **update** `run_tests.py` |
| `pytest.ini` and `.coveragerc` `omit` entries for `**/ui/…` | — | Name the deleted `ui` package | **update** |
| `release-gates.yml` | — | "Install Qt dependencies (Linux)" twice; `QT_QPA_PLATFORM` twice; `-p no:pytest-qt` twice | **update**: all go |
| `test.yml` | — | `-p no:pytest-qt` twice | **update** |
| `mypy.ini` | — | Sections for Qt-era modules (`crash_handler`, `error_reporting_prefs` and others) | **update**: the sections for deleted modules go |
| `scripts/check_no_qt_in_core.py`, `.claude/hooks/qt-guard.sh`, its test | — | The guard | **update**: widened to all of `src/`, `scripts/` and the workflows, renamed `check_no_qt.py` |
| AGENTS.md | — | "Qt is optional compatibility test material…"; "`src/gui_app.py` only launches it"; the hook table's guard | **update** |
| `build/engine-sidecar.spec` `excludes` | — | `PySide6`, `PyQt6`, `PyQt5` | **keep**: they keep a developer's installed Qt out of the sidecar |

## Group B — The old updater

Every module in `update/` is reached only through `services/security_service.py`'s
`from cuepoint.update.security import FeedIntegrityVerifier` (finding 3).

| Module | Lines | Who uses it | Tests | Proposal |
| --- | --- | --- | --- | --- |
| `update/security.py` | 135 | `services/security_service.py` (live), and the checker and verifier below | `unit/update/test_update_security.py` | **move** beside `services/security_service.py`, with its test repointed |
| `update/__init__.py` | 42 | Re-exports the package; names PySide6 in its docstring | 3 update tests | **delete** |
| `update/update_checker.py` | 550 | `update/__init__.py`, and four manual scripts (group E) | `test_two_appcast_channels.py`, `test_update_security.py`, `test_update_system.py` | **delete** |
| `update/update_preferences.py` | 249 | `update/__init__.py` | `test_update_system.py` | **delete** |
| `update/signature_verifier.py` | 54 | `update/__init__.py` | — | **delete** |
| `update/version_utils.py` | 201 | `update/__init__.py`, six scripts | `test_two_appcast_channels.py`, `test_update_system.py` | **delete** (DEC-145: the new updater does not reuse it) |

## Group C — Legacy Python

The scan found 27 modules that no shipped entry point reaches, migrations excepted. Fact 6 counted
51 with the 26 migrations; the 27 migration files now (26 migrations and their package) are held
apart. Each was checked against
fact 2's list. **None is reclassified as alive:**
- no `importlib` or `pkgutil` load names one;
- the DI container registers classes its modules import, so the graph already covers it;
- the sidecar packages none (confirmed by reading its archive);
- no entry point, npm script, hook or workflow names one.

The "Named elsewhere" column holds the only other mentions: `mypy.ini` sections, and the
`compat` package's docstring naming its controllers.

| Module | Lines | Imported by (non-test) | Its tests | Named elsewhere | Proposal |
| --- | --- | --- | --- | --- | --- |
| `src/__init__.py` | 27 | — | — | — | **keep**. Uncertain. Nothing imports it, but pytest's `--import-mode=importlib` names test modules `src.tests…` through it; removing it is not provably safe. |
| `src/beatport.py` | 11 | — | `tests/integration/test_beatport_search_integration.py`, `tests/integration/test_config_service_integration.py`, `tests/unit/services/test_config_reaches_matcher.py` +2 | — | **delete**. Shim for `cuepoint.data.beatport`. Only tests import it; repoint them first (fact 5). |
| `src/cuepoint/compat/config_controller.py` | 180 | — | `tests/integration/test_step53_ui_controllers.py`, `tests/unit/test_config_controller.py`, `tests/unit/test_step55_type_hints.py` | `src/cuepoint/compat/__init__.py:8` | **delete**. Qt-era controller. Replaced by the engine's config API (`engine/config_api.py`). |
| `src/cuepoint/compat/export_controller.py` | 106 | — | `tests/integration/test_step53_ui_controllers.py`, `tests/test_step55_comprehensive.py`, `tests/unit/test_export_controller.py` +1 | `src/cuepoint/compat/__init__.py:6` | **delete**. Qt-era controller. Replaced by the engine's export routes. |
| `src/cuepoint/compat/results_controller.py` | 367 | — | `tests/integration/test_step53_ui_controllers.py`, `tests/performance/test_step510_performance.py`, `tests/test_step55_comprehensive.py` +2 | `src/cuepoint/compat/__init__.py:7` | **delete**. Qt-era controller. Replaced by Clean (DEC-071). |
| `src/cuepoint/incrate/__init__.py` | 8 | — | `tests/unit/engine/test_retired_incrate.py`, `tests/unit/incrate/test_beatport_oauth.py` | — | **delete**. inCrate retired (DEC-100); the package holds only `beatport_oauth.py`. |
| `src/cuepoint/incrate/beatport_oauth.py` | 82 | — | `tests/unit/incrate/test_beatport_oauth.py` | — | **delete**. Left behind by inCrate's retirement (DEC-100). Discover authenticates with `services/beatport_*`. |
| `src/cuepoint/models/serialization.py` | 135 | — | — | — | **delete**. No importer, no test. |
| `src/cuepoint/utils/accessibility.py` | 262 | — | `tests/unit/test_step8_ux_accessibility.py` | `mypy.ini:144` | **delete**. Qt-era accessibility helpers; its one test is a Qt test conftest already skips. |
| `src/cuepoint/utils/crash_handler.py` | 451 | — | `tests/unit/utils/test_step6_crash_handler.py` | `mypy.ini:95` | **delete**. Imports PySide6 (group A). Phase 13 replaces error reporting. |
| `src/cuepoint/utils/crypto.py` | 60 | — | — | — | **delete**. No importer, no test. |
| `src/cuepoint/utils/error_handler.py` | 221 | — | `tests/unit/test_step56_error_handler.py` | — | **delete**. Nothing shipped imports it. |
| `src/cuepoint/utils/error_reporter.py` | 317 | `utils/crash_handler.py` | `tests/unit/utils/test_error_reporter.py` | `mypy.ini:165` | **delete**. Imported only by `crash_handler.py`. Phase 13 replaces error reporting. |
| `src/cuepoint/utils/error_reporting_prefs.py` | 52 | `utils/sentry_init.py` | `tests/unit/utils/test_error_reporting_prefs.py` | `mypy.ini:153` | **delete**. Imports PySide6 (group A). |
| `src/cuepoint/utils/file_safety.py` | 370 | — | `tests/unit/utils/test_step6_file_safety.py` | — | **delete**. Nothing shipped imports it; file writes go through `data/file_write*` and its boundary test. |
| `src/cuepoint/utils/health_check.py` | 103 | — | `tests/unit/utils/test_health_check.py` | `mypy.ini:101` | **delete**. Nothing shipped imports it; the engine has `/health`. |
| `src/cuepoint/utils/i18n.py` | 190 | — | `tests/unit/utils/test_i18n.py` | — | **delete**. Imports PySide6 (group A). |
| `src/cuepoint/utils/logger_helper.py` | 33 | `utils/performance_decorators.py` | — | `mypy.ini:204` | **delete**. Imported only by `performance_decorators.py`. |
| `src/cuepoint/utils/metrics.py` | 465 | — | `tests/unit/utils/test_metrics.py` | — | **delete**. Nothing shipped imports it. |
| `src/cuepoint/utils/performance_decorators.py` | 204 | — | — | — | **delete**. No importer, no test. |
| `src/cuepoint/utils/performance_workers.py` | 354 | — | `tests/unit/utils/test_step6_performance_workers.py` | — | **delete**. Imports PySide6 (group A). |
| `src/cuepoint/utils/progress_tracker.py` | 186 | — | `tests/unit/utils/test_progress_tracker.py` | — | **delete**. Nothing shipped imports it. |
| `src/cuepoint/utils/security.py` | 59 | — | — | `mypy.ini:141` | **delete**. No importer, no test. Not `update/security.py` (group B). |
| `src/cuepoint/utils/sentry_init.py` | 256 | — | — | — | **delete**. Imports PySide6 (group A). Phase 13 brings Sentry back on its own terms. |
| `src/cuepoint/utils/system_check.py` | 214 | — | `tests/unit/utils/test_system_check.py` | `mypy.ini:150` | **delete**. Nothing shipped imports it. |
| `src/cuepoint/utils/telemetry_analytics.py` | 154 | — | `tests/unit/utils/test_telemetry_analytics.py` | — | **delete**. Nothing shipped imports it. |
| `src/cuepoint/utils/validation.py` | 196 | — | `tests/unit/utils/test_validation.py` | — | **delete**. Nothing shipped imports it. |

**Shims and launchers, reached:**
- **`src/performance.py`** is reached by `services/output_writer.py`. **Delete** after
  `output_writer.py` imports `cuepoint.utils.performance` (fact 5).
- **`src/duckduckgo_search.py`** is reached by `data/beatport.py` and `services/beatport_service.py`.
  **Delete** after both import `ddgs` directly (finding 2).
- **`src/gui_app.py`** is reached only by the `run_gui` launchers (group H).
- **`compat/__init__.py` and `compat/gui_types.py`** are shipped: the CLI and the engine's jobs import
  them. **Keep**; `__init__.py` loses its mention of the deleted controllers.

## Group D — Tests

**Tests of removed code** go with it: the "Its tests" columns of groups B and C. A test that also checks
live behaviour is rewritten against the live code, not deleted (fact 1).

| Test | Evidence | Proposal |
| --- | --- | --- |
| `integration/test_export_integration.py` | Imports PySide6 and `cuepoint.ui.dialogs`; skipped by conftest | **delete** |
| `integration/test_playlist_integration.py` | Imports PySide6 and `cuepoint.ui.main_window`; skipped | **delete** |
| `integration/test_step53_ui_controllers.py` | Imports PySide6 and the `compat` controllers; skipped | **delete** |
| `unit/test_advanced_filtering.py` | Imports PySide6 and `cuepoint.ui.widgets`; skipped | **delete** |
| `unit/test_step8_ux_accessibility.py` | Imports `cuepoint.ui` and `utils/accessibility.py`; skipped | **delete**, after its output-writer checks are compared with `test_output_writer.py` |
| `integration/test_step52_full_integration.py`, `integration/test_step52_main_controller_di.py` | Import `cuepoint.ui.controllers.main_controller`; skipped | **delete** |
| `integration/test_phase3_complete.py` | Skipped whole; its Qt tests need `QApplication`, while its others check the performance collector, retries, cache hits and query classification | **update**: the live checks move into their layers where not already covered; the Qt ones go |
| `unit/utils/test_error_reporting_prefs.py`, `unit/utils/test_step6_crash_handler.py`, `unit/utils/test_step6_performance_workers.py` | Import Qt modules; not on conftest's list, so they fail collection without PySide6 (Release Gates on the branch) | **delete** with their modules |
| `unit/utils/test_diagnostics.py`, `unit/utils/test_paths_headless.py` | Patch PySide6 to test the fallbacks; `test_diagnostics.py::test_collect_config_info` fails wherever PySide6 is missing (the baseline's no-Qt run) | **update** with group A |
| `unit/scripts/test_check_no_qt_in_core.py` | The guard's test | **update** with the guard |
| `unit/test_release_validation.py` | Tests `validate_changelog` and `generate_sbom` (kept) and `validate_appcast` and `generate_build_metadata` (deleted); writes "PySide6==6.10.1" as fixture text | **update**: the deleted scripts' tests go |
| `unit/test_code_quality_step_5_7.py` | Checks that black, isort, pylint and flake8 are installed and configured, and that `.pylintrc` exists | **delete**; ruff and `pre-commit` are the gates (group I) |
| `unit/update/*` (3 files) | The old updater | **delete**, except `test_update_security.py`, which follows `security.py` (group B) |
| `unit/incrate/test_beatport_oauth.py` | `incrate/beatport_oauth.py` | **delete** |
| `unit/scripts/test_beatport_v4_spike.py`, `unit/scripts/test_track_metrics.py`, `unit/scripts/test_appcast_channels.py` and the other tests of scripts group E deletes | Test deleted scripts | **delete** with their scripts |
| `unit/data/test_file_write_boundary.py` | Lists `scripts/debug_sync_to_split_test.py` as an allowed writer | **update**: the entry goes with the script |
| `unit/engine/test_retired_incrate.py` | Asserts inCrate's modules are gone | **keep**: still true after `incrate/` goes |
| `unit/test_step13_ops.py` | Tests the CLI's `--export-support-bundle` | **keep**: live behaviour |

**The stray files at `src/tests/`'s root:**

| File | Lines | Evidence | Proposal |
| --- | --- | --- | --- |
| `run_all_step52_tests.py`, `run_step52_tests.py`, `run_step52_tests_fixed.py`, `run_step53_tests.py`, `run_step54_tests.py`, `run_step55_tests.py`, `run_step56_tests.py`, `run_step58_tests.py`, `run_step510_benchmarks.py`, `run_tests_with_output.py` | 24–115 each | One-off runners for Qt-era steps; nothing runs them (`mypy.ini` has a section for one) | **delete** |
| `verify_all_step52_tests.py`, `verify_step52_tests.py`, `verify_step_5_2.py`, `verify_export_dialog.py` | 20–68 | One-off checks; `verify_export_dialog.py` is on conftest's Qt list | **delete** |
| `test_step_5_2.py`, `test_comprehensive.py`, `test_step55_comprehensive.py` | 249–301 | Step 5 scripts written as tests; `test_comprehensive.py` checks the "restructured codebase" and tolerates a missing `cuepoint.ui` | **delete** |
| `test_export_dialog_import.py` | 14 | Imports `cuepoint.ui.dialogs.export_dialog`, which does not exist; on conftest's Qt list | **delete** |
| `test_imports.py` | 51 | A live import smoke test of the services (Step 5.2) | **update**: moves to `unit/` |

## Group E — Scripts

128 scripts (129 files with `scripts/README.md`). Each is listed with what the scan found and what references it. A script kept as a developer
tool is listed in `scripts/README.md` by PRUNE-04.

- **Kept:** anything a staying workflow, npm script, hook, `pre-commit` or the developer docs run, and
  every bench the full suite runs.
- **Undecided:** each is kept, and its question is put to the user.

| Script | Lines | Scan | References | Proposal |
| --- | --- | --- | --- | --- |
| `analyze_coverage_gaps.py` | 148 | unreferenced | none | **delete**. Nothing names it. |
| `analyze_licenses.py` | 122 | run-by-script | doc 1; script 2 | **keep**. Run by `generate_licenses.py` and `validate_licenses.py`. |
| `audit_dead_code.py` | 2466 | dev-docs | doc 1 | **keep**. This audit; PRUNE-08 keeps it as the guard. |
| `beatport_v4_spike.py` | 411 | not-run | doc 3; test 1 | **keep**. Uncertain. A spike, but `src/tests/fixtures/beatport_v4/README.md` names it as the tool that re-records the Beatport v4 fixtures. |
| `bench.py` | 283 | not-run | doc 1 | **keep**. Developer tool: the CLI pipeline bench (user guide, performance). |
| `bench_clean.py` | 460 | not-run | doc 2 | **keep**. Developer tool; PHASE7 and the user guide quote it. |
| `bench_decoder.py` | 423 | not-run | doc 2; script 1; test 1 | **keep**. Developer tool, tested; ADR-009 quotes it. |
| `bench_engine_start.py` | 230 | dev-docs | doc 1; test 1 | **keep**. This audit's cold-start baseline; PRUNE-08 repeats it. |
| `bench_library.py` | 926 | not-run | doc 6; script 3; source 1; test 2 | **keep**. Developer tool; the performance suite imports it. |
| `bench_marks.py` | 365 | run-by-script | doc 2; script 1; test 1 | **keep**. Run by `bench_waveforms.py`; the performance suite imports it. |
| `bench_match_storage.py` | 327 | not-run | doc 1 | **keep**. Developer tool; PHASE7 quotes it. |
| `bench_sets.py` | 614 | not-run | doc 4; test 1 | **keep**. Developer tool; the performance suite imports it. |
| `bench_waveform_analysis.py` | 513 | not-run | doc 1; test 1 | **keep**. Developer tool, tested; PHASE11 quotes it. |
| `bench_waveform_store.py` | 338 | run-by-script | doc 2; script 1; test 1 | **keep**. Run by `bench_waveforms.py`. |
| `bench_waveforms.py` | 360 | dev-docs | doc 4; test 2 | **keep**. AGENTS.md names it as Phase 11's bench. |
| `build_engine_sidecar.py` | 197 | run | doc 9; npm 1; script 2; source 2; test 3; workflow 1 | **keep**. Builds the engine sidecar (`desktop-electron.yml`, npm). |
| `build_pyinstaller.py` | 78 | run-by-script | doc 6; script 3; workflow 2 | **delete**. Builds the retired PyInstaller app. |
| `build_windows_installer.ps1` | 187 | unreferenced | none | **delete**. The retired app's NSIS installer. Nothing names it. |
| `check_appcast_diff.py` | 103 | dev-docs | doc 4 | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). |
| `check_bundled_licenses.py` | 149 | run | doc 4; test 1; workflow 2 | **keep**. Desktop and licence workflows. |
| `check_desktop_version_coupling.py` | 39 | run | doc 12; hook 1; workflow 1 | **keep**. Desktop workflow and the version-coupling hook. |
| `check_file_sizes.py` | 64 | run | doc 1; script 1; workflow 1 | **keep**. `release-gates.yml`. |
| `check_large_files.py` | 162 | run | doc 3; script 1; workflow 2 | **keep**. `test.yml`, `large-file-check.yml`. |
| `check_no_qt_in_core.py` | 67 | run | doc 16; hook 1; test 2; workflow 2 | **update**. Widened and renamed `check_no_qt.py` in PRUNE-02. |
| `check_performance.py` | 165 | run-by-script | doc 1; script 1 | **delete**. Run only by `step10_release_readiness.py`. |
| `check_release_readiness.py` | 225 | dev-docs | doc 3 | **keep**. Undecided: the release skill uses it. |
| `check_repo_health.py` | 123 | unreferenced | none | **delete**. Nothing names it. |
| `check_step13_ops.py` | 124 | unreferenced | none | **delete**. A one-off step script; its finding is recorded in its step. |
| `compare_build_environments.py` | 86 | unreferenced | none | **delete**. Nothing names it. |
| `compare_builds.py` | 124 | unreferenced | none | **delete**. Nothing names it. |
| `create_dmg.sh` | 331 | retired-pipeline | doc 2; workflow 1 | **delete**. Run only by the retired app's pipeline (group F). |
| `create_release_tag.sh` | 69 | dev-docs | doc 2 | **keep**. Undecided: the release skill uses it. Does Phase 16 keep tag-driven releases? |
| `debug_beatport_search_page.py` | 46 | not-run | test 1 | **keep**. Uncertain. It writes the page a regression test reads (`test_regression_fixtures_not_ignored.py`), which skips without it. |
| `debug_sync_to_split_test.py` | 117 | not-run | test 1 | **delete**. A debugging script. `test_file_write_boundary.py` lists it as an allowed writer; that entry goes with it. |
| `detect_pitfalls.py` | 291 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `detect_windows_pitfalls.py` | 243 | not-run | script 1 | **delete**. Run only by `test_step4_validation.py`. |
| `dev_setup.py` | 146 | dev-docs | doc 2 | **keep**. Developer setup. |
| `diagnose_search_issues.py` | 254 | unreferenced | none | **delete**. Nothing names it. |
| `download_beatport_docs.py` | 192 | not-run | doc 1 | **delete**. Fetched the Beatport docs once; the reference it produced stays. |
| `fetch_player_sidecar.py` | 1533 | run | doc 7; npm 1; script 5; source 3; test 15; workflow 1 | **keep**. Desktop workflow and npm. |
| `generate_appcast.py` | 373 | dev-docs | doc 8; script 2; test 1; workflow 1 | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). |
| `generate_artifact_name.py` | 122 | unreferenced | none | **delete**. Nothing names it. |
| `generate_build_metadata.py` | 118 | retired-pipeline | test 1; workflow 2 | **delete**. Run only by the retired app's pipeline (group F). |
| `generate_checksums.py` | 115 | dev-docs | doc 5; workflow 3 | **delete**. Run only by the retired app's pipeline (group F). The desktop workflow uses `generate_sha256_sums.py`. |
| `generate_icons.py` | 203 | run-by-script | build 1; doc 1; script 1; source 1; workflow 2 | **delete**. Makes the retired app's icons (`build/pyinstaller.spec`). Electron's icons are electron-builder's. |
| `generate_licenses.py` | 90 | run | doc 4; script 2; test 1; workflow 5 | **keep**. Licence and release-gate workflows. |
| `generate_release_notes.py` | 205 | dev-docs | doc 2; workflow 1 | **keep**. Undecided: run by `release.yml` (going); release notes from the changelog may serve Phase 16. |
| `generate_requirements_hashes.py` | 93 | run | doc 4; source 1; workflow 3 | **keep**. `release-gates.yml`'s deterministic-install check. |
| `generate_sbom.py` | 228 | run | doc 2; test 1; workflow 2 | **keep**. `release-gates.yml`. |
| `generate_sha256_sums.py` | 51 | run | workflow 1 | **keep**. Desktop workflow's checksums. |
| `generate_test_xml.py` | 103 | not-run | script 1 | **keep**. Run by `bench.py`. |
| `generate_update_feed.py` | 332 | dev-docs | doc 5; script 2; test 1; workflow 1 | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). |
| `generate_version_info.py` | 121 | run-by-script | script 2; workflow 1 | **delete**. Run only by the retired app's pipeline (group F). |
| `import_macos_cert.sh` | 34 | unreferenced | none | **delete**. Nothing names it. |
| `import_windows_cert.ps1` | 42 | unreferenced | none | **delete**. Nothing names it. |
| `inspect_appcast.py` | 178 | not-run | doc 3; source 1 | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). |
| `installer.nsi` | 312 | retired-pipeline | doc 2; script 4; workflow 1 | **delete**. Run only by the retired app's pipeline (group F). |
| `maintenance_report.py` | 174 | not-run | doc 1; source 1; test 1 | **keep**. Run by the CLI's `--maintenance-report` flag (`src/main.py:98`), a public interface. The scan reports it not run because a module runs it by path; checked by hand. |
| `make_audio_fixtures.py` | 253 | dev-docs | doc 4; script 1; test 1 | **keep**. Developer setup; makes the audio test fixtures. |
| `make_prerelease_main.ps1` | 45 | unreferenced | none | **delete**. Nothing names it. |
| `make_prerelease_main.sh` | 43 | unreferenced | none | **delete**. Nothing names it. |
| `notarize_macos.sh` | 137 | retired-pipeline | script 1; workflow 1 | **delete**. Run only by the retired app's pipeline (group F). Electron notarizes in `build/notarize.cjs`. |
| `organize_root_files.bat` | 54 | unreferenced | none | **delete**. Nothing names it. |
| `organize_root_files.sh` | 53 | unreferenced | none | **delete**. Nothing names it. |
| `player_sidecar_manifest.json` | 95 | dev-docs | doc 5; script 1; source 1; test 1 | **keep**. Read by `fetch_player_sidecar.py`. |
| `prepare_release.py` | 227 | dev-docs | doc 2 | **keep**. Undecided: the release skill uses it. |
| `process_info_plist.py` | 56 | retired-pipeline | workflow 1 | **delete**. Run only by the retired app's pipeline (group F). |
| `publish_feeds.py` | 675 | run | doc 6; script 1; workflow 2 | **keep**. **Correction to PRUNE-04:** `publish-gh-pages-site.yml`, which stays until Phase 17, runs it with `--site-only`. Its feed half can go in PRUNE-04; the script stays. |
| `release_readiness.py` | 362 | dev-docs | doc 4; script 2 | **keep**. Undecided: the release skill uses it; it calls the Qt-era step-10 script. |
| `run_tests.py` | 121 | run | doc 17; script 1; test 4; workflow 1 | **keep**. `test.yml` and AGENTS.md. |
| `save_beatport_docs_state.py` | 26 | not-run | doc 1 | **delete**. As `download_beatport_docs.py`. |
| `set_build_info.py` | 161 | run-by-script | doc 1; script 2; source 1; workflow 2 | **delete**. Run only by the retired app's pipeline (group F). |
| `set_wav_unwritten_tags_to_one.py` | 65 | unreferenced | none | **delete**. Nothing names it. |
| `setup/install_requirements.sh` | 71 | dev-docs | doc 2 | **keep**. scripts/README.md; PRUNE-06 updates it with the requirements. |
| `sign_checksums.py` | 121 | dev-docs | doc 3; workflow 1 | **keep**. Undecided: run by `release.yml` (going); GPG-signed checksums may serve Phase 16. |
| `sign_macos.sh` | 93 | retired-pipeline | doc 1; script 1; workflow 1 | **delete**. Run only by the retired app's pipeline (group F). Electron signs in `build/signNestedBinaries.cjs`. |
| `sign_windows.ps1` | 123 | not-run | script 1 | **delete**. Run only by `build_windows_installer.ps1`. |
| `smoke_engine_health.py` | 44 | run | doc 10; workflow 1 | **keep**. Desktop workflow and AGENTS.md. |
| `step10_release_readiness.py` | 686 | dev-docs | doc 4 | **delete**. A one-off step script; its finding is recorded in its step. It runs `build_pyinstaller.py`. |
| `sync_version.py` | 251 | dev-docs | doc 6; script 1; workflow 3 | **keep**. Undecided: run by `release.yml` and the build workflows (going); tag-to-version sync may serve Phase 16. |
| `test_appcast_url.py` | 247 | unreferenced | none | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). Nothing names it. |
| `test_build_and_executable.py` | 203 | not-run | doc 3 | **delete**. Tests the retired PyInstaller executable. |
| `test_generate_version_info.py` | 100 | unreferenced | none | **delete**. Tests `generate_version_info.py`. Nothing names it. |
| `test_pre_release.py` | 587 | dev-docs | doc 6; source 1 | **delete**. Exercises the old updater (`update/`). |
| `test_search_dependencies.py` | 138 | retired-pipeline | build 1 | **delete**. Run only by `build/pyinstaller.spec`. |
| `test_step3_validation.py` | 101 | unreferenced | none | **delete**. A one-off step script; its finding is recorded in its step. |
| `test_step4_validation.py` | 162 | unreferenced | none | **delete**. A one-off step script; its finding is recorded in its step. |
| `test_update_check_simulation.py` | 62 | unreferenced | none | **delete**. Exercises the old updater. Nothing names it. |
| `test_update_detection.py` | 214 | not-run | doc 4 | **delete**. Exercises the old updater. |
| `test_update_system_comprehensive.py` | 662 | unreferenced | none | **delete**. Exercises the old updater. Nothing names it. |
| `test_version_comparison.py` | 68 | unreferenced | none | **delete**. Exercises `version_utils` (DEC-145). Nothing names it. |
| `test_version_comparison_interactive.py` | 144 | unreferenced | none | **delete**. Exercises `version_utils` (DEC-145). Nothing names it. |
| `track_metrics.py` | 224 | not-run | test 1 | **delete**. GitHub metrics; only its own test runs it. |
| `validate_appcast.py` | 177 | run | doc 3; test 1; workflow 1 | **delete**. Its `release-gates.yml` step validates the Sparkle feeds and cannot fail (`|| true`); the step goes with it. |
| `validate_architecture.py` | 141 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_artifact_names.py` | 115 | unreferenced | none | **delete**. Nothing names it. |
| `validate_artifacts.py` | 170 | run-by-script | script 1 | **delete**. Run only by `validate_release.py`. |
| `validate_bundle_id.py` | 170 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_bundle_structure.py` | 106 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_certificate.py` | 184 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_changelog.py` | 192 | run | doc 2; script 1; test 1; workflow 2 | **keep**. `release-gates.yml`. |
| `validate_compliance.py` | 63 | run | doc 5; script 1; workflow 1 | **keep**. `compliance-check.yml` (failing on the branch; see the baseline). |
| `validate_dmg.py` | 125 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_feeds.py` | 235 | dev-docs | doc 5; script 3; workflow 1 | **delete**. Sparkle feeds, retired with `release.yml` (DEC-145, DEC-147). |
| `validate_gitignore.py` | 79 | unreferenced | none | **delete**. Nothing names it. |
| `validate_info_plist.py` | 149 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_licenses.py` | 78 | run | doc 1; script 3; workflow 1 | **keep**. `license-compliance.yml`. |
| `validate_metadata.py` | 180 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_notarization.py` | 81 | dev-docs | doc 2; script 1 | **delete**. Run only by `validate_release.py`; the retired app's notarization. |
| `validate_pre_notarization.py` | 173 | retired-pipeline | script 2 | **delete**. Run only by `notarize_macos.sh` and a step script. |
| `validate_publisher_identity.py` | 216 | not-run | script 1 | **delete**. Run only by `test_step4_validation.py`. |
| `validate_release.py` | 145 | dev-docs | doc 2 | **delete**. Validates the retired app's artifacts and feeds. |
| `validate_release_notes.py` | 99 | run-by-script | doc 1; script 2 | **delete**. Run only by `step10_release_readiness.py` and `validate_release.py`. |
| `validate_signatures.py` | 162 | dev-docs | doc 4; workflow 2 | **delete**. Run only by the retired app's pipeline (group F). |
| `validate_signing.py` | 145 | run-by-script | script 1 | **delete**. Run only by `validate_release.py`. |
| `validate_step55.py` | 67 | unreferenced | none | **delete**. A one-off step script; its finding is recorded in its step. |
| `validate_update_compatibility.py` | 138 | not-run | script 1 | **delete**. Run only by `test_step3_validation.py`. |
| `validate_update_compatibility_windows.py` | 210 | not-run | script 1 | **delete**. Run only by `test_step4_validation.py`. |
| `validate_updates.py` | 140 | run | workflow 1 | **delete**. Its `release-gates.yml` step validates the Sparkle feeds; the step goes with it. |
| `validate_version.py` | 185 | run | doc 8; script 2; test 1; workflow 4 | **keep**. `release-gates.yml`. |
| `validate_windows_dependencies.py` | 213 | not-run | script 1 | **delete**. Run only by `test_step4_validation.py`. |
| `validate_windows_signing.py` | 230 | not-run | script 1 | **delete**. Run only by `test_step4_validation.py`. |
| `verify_artifacts.py` | 125 | unreferenced | none | **delete**. Nothing names it. |
| `verify_installer.py` | 242 | dev-docs | doc 4; test 1; workflow 2 | **delete**. Run only by the retired app's pipeline (group F). |
| `verify_macos_bundle.py` | 255 | not-run | doc 3 | **keep**. The macOS verification tool PHASE5, PHASE7 and PHASE8 tell a person to run. |
| `verify_signing.ps1` | 42 | unreferenced | none | **delete**. Nothing names it. |
| `verify_signing.sh` | 47 | unreferenced | none | **delete**. Nothing names it. |
| `verify_version_embedding.py` | 157 | run-by-script | script 1; workflow 2 | **delete**. Run only by the retired app's pipeline (group F). |

**Questions for the user (group E):**
1. **Release tooling.** The release skill and `release.yml` use these, and Phase 16 builds the new
   pipeline. Keep them for Phase 16, or delete them now and let Phase 16 write its own?
   - `create_release_tag.sh`, `generate_release_notes.py`, `sign_checksums.py`, `sync_version.py`;
   - `prepare_release.py`, `release_readiness.py`, `check_release_readiness.py`.
2. **Two spike scripts.** `beatport_v4_spike.py` and `debug_beatport_search_page.py` regenerate test
   fixtures. Keep them as fixture tools, or delete them and let the fixtures stand as recorded?

## Group F — Workflows

| Workflow | What it does | Still exists? | Without it | Branch state | Proposal |
| --- | --- | --- | --- | --- | --- |
| `build-macos.yml` | Builds, signs, notarizes and packages the PyInstaller app (`build_pyinstaller.py`, `create_dmg.sh`) | No: the app is retired | Nothing; Electron's macOS build is `desktop-electron.yml`'s `npm run dist` | Failing | **delete** (DEC-147, Q-149) |
| `build-windows.yml` | Builds the PyInstaller app and its NSIS installer (`build/pyinstaller.spec`, `installer.nsi`) | No | Nothing; Electron's Windows build is `desktop-electron.yml`'s | Failing | **delete** |
| `release.yml` | On a tag: downloads the two workflows' `macos-dmg` and `windows-installer` artifacts, makes the GitHub Release, and publishes the Sparkle feeds | No: its inputs are the retired builds | Releases until Phase 16 are cut from `desktop-electron.yml`'s artifacts (DEC-147) | Runs on tags only | **delete** |
| `release-gates.yml` | Unit and integration tests on three OSes, plus code-quality gates: version, changelog, SBOM, hashed install, licences, ruff, the mypy gate, file sizes | Yes | Those gates | Failing: Qt tests without PySide6; the mypy gate (fixed) | **update**: Qt steps and env go; the two appcast steps go with `validate_appcast.py` and `validate_updates.py`; it says what it does in its first lines |
| `test.yml` | The full layered suite with coverage, the mypy gate, the no-Qt guard, the large-file check | Yes | The main test run | Failing: the mypy gate (fixed) | **update**: `-p no:pytest-qt` goes; first-line description |
| `desktop-electron.yml` | Lint, typecheck and test the renderer and Electron main; build the sidecar; fetch and check mpv; licences; engine tests and smoke; Playwright; `npm run dist` | Yes | The desktop build and release artifacts | Failing at `npm ci` (lockfile, fixed) | **keep**; first-line description |
| `docs-check.yml` | lychee over `docs/` | Yes | Link checking | Failing: 17 broken links in `docs/ui-overhaul/` (deleted in J) | **keep** |
| `compliance-check.yml` | `validate_compliance.py` weekly and on push | Yes | Compliance checks | Failing: "Privacy dialog is missing" | **keep**; PRUNE-04 checks whether that check describes the Electron app |
| `license-compliance.yml` | Licence validation, bundled licences, the licence bundle | Yes | Licence gates | Passing | **keep** |
| `security-scan.yml` | pip-audit over the three requirements files | Yes | Vulnerability scanning | Failing: 85 known vulnerabilities (fixed by the pin bump) | **keep** |
| `large-file-check.yml` | `check_large_files.py` on `phase_*` branches | Yes | Large-file guard | Not run on this branch | **keep** |
| `publish-gh-pages-site.yml` | Publishes `gh-pages-root/` with `publish_feeds.py --site-only` | Yes (until Phase 17) | The website | Runs on `main` | **keep** (the website stays) |

What only the deleted workflows call is in group E (`retired-pipeline`). They also use
`build/pyinstaller.spec` and `build/Info.plist.template`, which go with them (group H).

## Group G — Electron and renderer

**Files no import reaches from the app:**

| File | Lines | Scan | Imported by | Proposal |
| --- | --- | --- | --- | --- |
| `electron/preload.ts` | 5 | unreached | — | **delete**. The placeholder AGENTS.md describes; nothing builds or imports it (the runtime preload is `preload.cjs`). AGENTS.md is updated with it. |
| `renderer/src/api/fileDropUtils.ts` | 44 | test-only | `renderer/src/api/fileDropUtils.test.ts` | **delete**. Only its own test imports it; drag and drop goes through `collectionDrag.ts`. |
| `renderer/src/tokens/ScaleControls.tsx` | 21 | unreached | — | **delete**. Phase 1 lab control; the scale is set in Settings. |
| `renderer/src/tokens/ThemeControls.tsx` | 26 | unreached | — | **delete**. Phase 1 lab control; the theme is set in Settings. |
| `renderer/src/tokens/scale-controls.css` | 10 | unreached | — | **delete**. Styles `ScaleControls.tsx` only. |
| `renderer/src/tokens/theme-controls.css` | 59 | unreached | `renderer/src/tokens/ThemeControls.tsx` | **delete**. Styles `ThemeControls.tsx` only. |

**Exports.** 906 exports: 238 used only by tests, 559 used only inside their own file, 109 used nowhere. Test-only exports are kept: exporting a pure helper for its test
is how the renderer tests pure logic (AGENTS.md). Barrel re-exports nothing imports go. Other unused
exports become private, or go when nothing in their own file uses them.

<details><summary>Exports by file</summary>

| File | Test-only | Unused, used in its file | Unused anywhere | Proposal |
| --- | --- | --- | --- | --- |
| `electron/engineClient.ts` | 8 | 146 | 4 | **keep**, uncertain: the published answer shapes of the engine client and the bridge, held in step by the desktop contract. Test-only exports stay. |
| `electron/engineSupervisor.ts` | 4 | 4 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/externalLinks.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/mainSettings.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/mediaKeys.ts` | 5 | 4 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/mpvClient.ts` | 5 | 7 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/playbackController.ts` |  | 4 |  | **update**: make the unused ones private. |
| `electron/playbackFailures.ts` | 2 | 3 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/playbackQueue.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/playerLaunch.ts` | 3 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/playerSupervisor.ts` | 4 | 12 | 1 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |
| `electron/processTree.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/queueResolver.ts` | 2 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/quitAfter.ts` | 2 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `electron/rekordboxExportDialog.ts` | 5 |  |  | **keep**: the test seam for pure logic. |
| `electron/setListDialog.ts` | 6 |  |  | **keep**: the test seam for pure logic. |
| `electron/sseClient.ts` |  | 1 |  | **update**: make the unused ones private. |
| `electron/testWindowPlacement.ts` | 1 | 3 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/api/cuepointBridge.types.ts` | 22 | 113 |  | **keep**, uncertain: the published answer shapes of the engine client and the bridge, held in step by the desktop contract. Test-only exports stay. |
| `renderer/src/api/keyboardShortcuts.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/api/libraryChanges.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/api/rekordboxExportBridge.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/Badge.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/Button.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/components/ListRow.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/LogViewerDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/Modal.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/Panel.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/PixelIcon.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/ProgressBar.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/Select.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/SupportBundleDialog.tsx` |  |  | 1 | **update**: remove what is used nowhere. |
| `renderer/src/components/Tabs.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/components/TextField.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/Toast.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/ToolbarIcon.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/index.ts` |  | 7 | 14 | **update**: drop the re-exports nothing imports. |
| `renderer/src/components/pixelIcons.ts` | 3 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/player/PlayerAnnouncer.tsx` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/components/player/PlayerBar.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/player/QueuePanel.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/components/player/playerAudioState.ts` | 3 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/player/playerFormat.ts` | 3 |  | 1 | **update**: remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/components/player/playerOrderState.ts` | 5 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/components/player/playerStore.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/player/usePlayerShortcuts.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/player/useQueueWindow.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/components/shell/ActivityOffer.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/shell/ActivityPanel.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/shell/activityActions.ts` | 1 | 6 | 1 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/components/shell/index.ts` | 2 | 5 | 51 | **update**: drop the re-exports nothing imports. |
| `renderer/src/components/shell/usePlayerStatus.ts` | 1 |  | 1 | **update**: remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/components/table/index.ts` |  |  | 27 | **update**: drop the re-exports nothing imports. |
| `renderer/src/components/table/trackTableLayout.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/components/waveform/WaveformCanvas.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/waveform/analysisWords.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/waveform/loudnessWords.ts` | 7 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/waveform/useWaveformAnalysis.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/components/waveform/useWaveformRequest.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/waveform/useWaveforms.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/waveform/waveformCache.ts` | 3 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/waveform/waveformColour.ts` | 6 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/components/waveform/waveformEnvironment.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/components/waveform/waveformLayout.ts` | 15 | 7 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/components/waveform/waveformPaint.ts` | 3 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/components/waveform/waveformSettle.ts` | 2 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/RekordboxExportSettingsPanel.tsx` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/SettingsExportScreen.tsx` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/clean/CleanScreen.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/ComparisonPanel.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/DuplicatesView.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/HealthView.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/MissingFilesView.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/ReviewView.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/cleanEmpty.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/cleanLink.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/cleanRules.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/cleanSections.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/clean/comparison.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/clean/revealTrack.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/reviewKeyboard.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/clean/useCleanHealth.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/useCleanJob.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/clean/useResumableMatches.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/BeatportHalf.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/BeatportTable.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/EntityScreen.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/LibraryHalf.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/NewRunPanel.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/NoteDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/PushDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/RunDetail.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/RunList.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/RunsView.tsx` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/ScopeDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/SimilarScreen.tsx` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/discover/WantlistView.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/beatportActions.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/discover/beatportState.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/discoverFormat.ts` | 3 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/discover/discoverLinks.ts` | 1 |  | 1 | **update**: remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/screens/discover/discoverSections.ts` | 2 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/discover/libraryRowMenu.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/similarReasons.ts` | 2 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/discover/useBeatportWindow.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/discover/useDiscoverJob.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/ApplyValuesDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/CollectionsPane.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/CreditLinks.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/EditMetadataDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/FilterBar.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/LibraryHeader.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/LibraryPane.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/NewSetFromDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/PaneTree.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/PickerDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/PlaylistPane.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/RefreshPreviewDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/RekordboxExportDialog.tsx` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/SaveSmartDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/SelectionActions.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TagManagerDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackBeatportSection.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackDetailPanel.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackHistorySection.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackMarksSection.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackOverrides.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/TrackYours.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/WriteTagsDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/collectionDrag.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/collectionTree.ts` | 4 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/creditSegments.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/filterText.ts` | 1 | 6 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/followJob.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/index.ts` |  | 1 | 1 | **update**: drop the re-exports nothing imports. |
| `renderer/src/screens/library/libraryBatch.ts` | 2 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/libraryCells.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/libraryClean.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/libraryColumns.tsx` | 1 | 2 | 2 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/libraryDiscover.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/libraryEmpty.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/libraryFormat.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/libraryLink.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/libraryQuery.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/metadataEdits.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/newSetFrom.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/playlistTree.ts` | 2 | 1 | 1 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/rekordboxExport.ts` | 2 | 4 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/smartFilter.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/tagManager.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/tagWriting.ts` | 2 |  | 1 | **update**: remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/trackClipboard.ts` | 2 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/trackEdits.ts` | 2 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/trackMarks.ts` | 2 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/trackMenu.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/trackSelection.ts` | 4 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/library/useCollectionTree.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/useFilterVocabulary.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useLibraryBatch.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/useLibraryClean.tsx` | 1 | 3 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/useLibraryPlayback.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/usePlaylistTree.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useTrackDetail.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useTrackHistory.ts` | 1 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/library/useTrackMetadata.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useTrackSelection.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useTrackTags.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/library/useTrackWindow.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/ChapterDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/NewSetDialogs.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/PrepareLayout.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/PrepareScreen.tsx` | 2 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/SetEntryZone.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/SetLanes.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/SetNotesDialog.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/SetTransition.tsx` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/SourcePanel.tsx` | 1 | 3 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/SourceTable.tsx` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/prepareFormat.ts` | 3 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/prepareLanes.ts` | 10 | 3 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/prepareLayoutState.ts` | 3 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/prepareLink.ts` | 1 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/prepare/prepareMenus.ts` |  | 4 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/prepareRows.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/prepareSource.ts` | 3 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/prepare/setAreaFloor.ts` | 2 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/prepare/setWarnings.ts` | 3 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/prepare/sourceColumns.tsx` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/sourcePanelState.ts` | 7 |  |  | **keep**: the test seam for pure logic. |
| `renderer/src/screens/prepare/transitionStrip.ts` | 2 | 1 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/prepare/usePreparedSet.ts` |  | 4 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/useSetList.ts` |  | 3 |  | **update**: make the unused ones private. |
| `renderer/src/screens/prepare/useSetSuggestions.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/screens/settingsLink.ts` |  | 1 |  | **update**: make the unused ones private. |
| `renderer/src/tokens/customThemes.ts` |  | 2 |  | **update**: make the unused ones private. |
| `renderer/src/tokens/scale.ts` | 1 | 2 |  | **update**: make the unused ones private; keep the test-only ones (the test seam). |
| `renderer/src/tokens/theme.ts` | 1 | 4 | 1 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |
| `renderer/src/tokens/themeDerivation.ts` | 8 | 2 | 1 | **update**: make the unused ones private; remove what is used nowhere; keep the test-only ones (the test seam). |

</details>

**CSS.** 55 classes: 37 unused, 0 named only by tests, 18 built from a prefix. Every class marked unused was checked by hand against the TypeScript.
`past-searches`, for instance, appears only in a comment in `ActivityPanel.tsx`.

| Stylesheet | Class | Line | Scan | Proposal |
| --- | --- | --- | --- | --- |
| `App.css` | `.screen--fill` | 56 | unused | **delete**: no component names it. |
| `components/Badge.css` | `.cp-badge--default` | 12 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Badge.css` | `.cp-badge--success` | 17 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Badge.css` | `.cp-badge--warning` | 22 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Badge.css` | `.cp-badge--danger` | 27 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Badge.css` | `.cp-badge--info` | 32 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Button.css` | `.cp-btn--primary` | 19 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Button.css` | `.cp-btn--secondary` | 24 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Button.css` | `.cp-btn--danger` | 29 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Panel.css` | `.cp-panel--alt` | 7 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Panel.css` | `.match-layout` | 32 | unused | **delete**: no component names it. |
| `components/Panel.css` | `.cp-panel--fill` | 38 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Toast.css` | `.cp-toast--info` | 21 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Toast.css` | `.cp-toast--success` | 26 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Toast.css` | `.cp-toast--warning` | 31 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `components/Toast.css` | `.cp-toast--error` | 36 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `screens/clean/clean.css` | `.cp-button` | 510 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__stats` | 27 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__source` | 32 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__path` | 41 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__imported` | 47 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__state` | 48 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__state--attention` | 54 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__applied` | 59 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-screen__error` | 311 | unused | **delete**: no component names it. |
| `screens/library/library.css` | `.library-cell__mark--beatport` | 384 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `screens/prepare/prepare.css` | `.prepare-warning--open` | 402 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `screens/prepare/prepare.css` | `.prepare-warning--accepted` | 407 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `screens/screens.css` | `.screen--fill` | 15 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.screen--scrollable` | 52 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-frame` | 61 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.screen__hero` | 66 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.tool-grid` | 82 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.batch-playlist-picker__list` | 89 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.batch-playlist-picker__row` | 98 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.batch-playlist-picker__label` | 111 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.match-mode-toggle` | 117 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.match-mode-toggle__btn` | 122 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches` | 126 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches__actions` | 132 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches__list` | 139 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches__summary` | 148 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches__preview` | 152 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.past-searches__table` | 157 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.tool-card__desc` | 177 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.match-layout` | 184 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.stats-grid` | 231 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-panel-body` | 257 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-frame--sized` | 277 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.cp-panel--in-frame` | 295 | dynamic | **keep**: built from a string prefix in a component (`cp-badge--${variant}` and the like); checked by hand. |
| `screens/screens.css` | `.results-frame__resizer` | 301 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-page-scrollable` | 345 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-frame--resizing` | 351 | unused | **delete**: no component names it. |
| `screens/screens.css` | `.results-toolbar` | 356 | unused | **delete**: no component names it. |
| `tokens/tokens.css` | `.pixel-canvas` | 92 | unused | **delete**: no component names it. |

The bridge is not narrowed (PRUNE-05): every `window.cuepoint` method the renderer calls stays.

## Group H — The repository root

| Path | Size | Evidence | Proposal |
| --- | --- | --- | --- |
| `collection_incrate_playlist.xml` | 405 B | inCrate's sample; only `docs/v1` names it | **delete** |
| `run_gui.bat` | 37 lines | Runs `npm run electron:start` in `apps/desktop-electron` | **delete**: AGENTS.md and the README document `npm run electron:start` |
| `run_gui.sh`, `run_gui.command` | — | Run `src/gui_app.py`; `run_gui.sh` still installs Playwright "for inCrate Add to playlist" | **delete** |
| `src/gui_app.py` | 145 lines | Launches the Electron shell and carries a search-dependency test mode; reached only by the two launchers (fact 4) | **delete**, with AGENTS.md's "`src/gui_app.py` only launches it", the guard's special case, `build/pyinstaller.spec`'s entry and the docs that name it |
| `requirements-qt.txt` | 2 lines | Group A | **delete** |
| `Makefile` | 19 lines | `black`, `isort`, `pylint`, `flake8`, `mypy src/cuepoint`; only `test_code_quality_step_5_7.py` names it | **delete**: AGENTS.md's commands are the interface |
| `.pylintrc` | 15 lines | Only `test_code_quality_step_5_7.py` names it | **delete** with pylint (group I) |
| `pyproject.toml` | — | `[tool.black]` and `[tool.isort]` only | **update**: both sections go with black and isort (group I) |
| `build/pyinstaller.spec`, `build/Info.plist.template` | — | The retired app's spec and plist (group F) | **delete** |
| `build/engine-sidecar.spec` | — | The sidecar | **update**: the stale `cuepoint.ui.*` names go (finding 4) |
| `config/logging.yaml` | — | Packaged into the sidecar by its spec | **keep** |
| `config/config.yaml.template` | — | Documents the config keys (named by `TECHNICAL_ANALYSIS.md`, which merges into `architecture.md`) | **keep** |
| `third_party/mpv/` | 4 files | The bundled player's licences; `check_bundled_licenses.py` and `fetch_player_sidecar.py` read them | **keep** |
| `gh-pages-root/` | 5 files | The website | **keep** (Phase 17) |
| `.coveragerc`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.lycheeignore`, `.pre-commit-config.yaml`, `.python-version`, `mypy.ini`, `pytest.ini` | — | In use | **keep**; `.coveragerc`, `pytest.ini` and `mypy.ini` are updated with group A |
| `requirements_optional.txt` | 2 lines | Playwright and Selenium, also in `requirements.txt` | PRUNE-06 folds it in or states its purpose (group I) |

## Group I — Dependencies

Each requirement and npm package, with what imports it:
- **shipped:** the CLI or the engine;
- **run:** a launcher or a live script;
- **test** or **script**;
- **dead:** an unreached module.

"Tool uses" are commands, flags, fixtures and config strings.

| Package | Declared in | Importers | Tool uses | Proposal |
| --- | --- | --- | --- | --- |
| `aiohttp` | `requirements-build.txt`, `requirements.txt` | none | — | **delete**. No importer. |
| `beautifulsoup4` | `requirements-build.txt`, `requirements.txt` | shipped 1, test 7 | — | **keep** |
| `black` | `requirements-dev.txt` | none | `Makefile`, `docs/development/coding-standards.md` +3 | **delete**. Named by the Makefile, `pyproject.toml`'s `[tool.black]` and three developer docs; nothing runs it. ruff formats (AGENTS.md, pre-commit). The docs are updated in J. |
| `coverage` | `requirements-dev.txt`, `requirements.txt` | none | `.agents/skills/cuepoint-matching-pipeline/SKILL.md`, `.claude/skills/cuepoint-matching-pipeline/SKILL.md` +9 | **keep**. `release-gates.yml` and pytest-cov. |
| `ddgs` | `requirements-build.txt`, `requirements.txt` | script 2, shipped 2 | — | **keep** |
| `flake8` | `requirements-dev.txt` | none | `Makefile`, `docs/development/coding-standards.md` +1 | **keep**. Uncertain: only the Makefile and `check_release_readiness.py` run it, and that script is undecided (group E). It goes if that script goes. |
| `hypothesis` | `requirements-dev.txt` | test 7 | — | **keep**. Tests. |
| `isort` | `requirements-dev.txt` | none | `Makefile`, `docs/development/coding-standards.md` +1 | **delete**. Only the Makefile and `pyproject.toml`'s `[tool.isort]` name it; ruff sorts imports. |
| `mutagen` | `requirements-build.txt`, `requirements.txt` | script 2, shipped 4, test 11 | — | **keep** |
| `mypy` | `requirements-dev.txt` | none | `.agents/skills/cuepoint-release/SKILL.md`, `.claude/skills/cuepoint-release/SKILL.md` +12 | **keep**. The mypy gate. |
| `openpyxl` | `requirements-build.txt`, `requirements.txt` | shipped 2, test 5 | — | **keep** |
| `pillow` | `requirements-build.txt`, `requirements.txt` | script 1, shipped 1, test 7 | — | **keep** |
| `pip-tools` | `requirements-dev.txt` | none | `scripts/generate_requirements_hashes.py` | **keep**. `generate_requirements_hashes.py` runs `pip-compile`. |
| `playwright` | `requirements-build.txt`, `requirements.txt`, `requirements_optional.txt` | script 2, shipped 1 | `.github/workflows/build-macos.yml`, `.github/workflows/build-windows.yml` +6 | **keep**. Uncertain: one shipped module imports it (Beatport fallback); PRUNE-06 confirms the path is live. |
| `pre-commit` | `requirements-dev.txt` | none | `.pre-commit-config.yaml`, `AGENTS.md` | **keep** |
| `pyinstaller` | `requirements-build.txt`, `requirements-dev.txt` | none | `.github/workflows/build-macos.yml`, `.github/workflows/build-windows.yml` +20 | **keep**. Builds the engine sidecar. |
| `pylint` | `requirements-dev.txt` | none | `Makefile`, `docs/development/coding-standards.md` | **delete**. Only the Makefile and `test_code_quality_step_5_7.py` run it (groups D and H). |
| `pyside6` | `requirements-qt.txt` | dead 5, shipped 2, test 7 | — | **delete**. Group A. |
| `pytest` | `requirements-dev.txt`, `requirements.txt` | test 375 | `.agents/skills/cuepoint-desktop-contract/SKILL.md`, `.agents/skills/cuepoint-matching-pipeline/SKILL.md` +17 | **keep** |
| `pytest-asyncio` | `requirements-dev.txt`, `requirements.txt` | none | — | **delete**. No async test uses it (no `pytest.mark.asyncio`, no `asyncio_mode`). |
| `pytest-benchmark` | `requirements-dev.txt` | none | — | **delete**. No test uses its `benchmark` fixture; the benches are scripts. |
| `pytest-cov` | `requirements-dev.txt`, `requirements.txt` | none | `.github/workflows/release-gates.yml`, `scripts/analyze_coverage_gaps.py` +4 | **keep**. `--cov` in workflows and `run_tests.py`. |
| `pytest-mock` | `requirements-dev.txt`, `requirements.txt` | none | — | **delete**. No test uses its `mocker` fixture. |
| `pytest-qt` | `requirements-qt.txt` | none | — | **delete**. Group A. |
| `pytest-timeout` | `requirements-dev.txt`, `requirements.txt` | none | `.github/workflows/release-gates.yml` | **keep**. `release-gates.yml` passes `--timeout`. |
| `pytest-xdist` | `requirements-dev.txt`, `requirements.txt` | none | — | **delete**. Nothing passes `-n`. |
| `python-dateutil` | `requirements-build.txt`, `requirements.txt` | shipped 1 | — | **keep** |
| `pyyaml` | `requirements-build.txt`, `requirements.txt` | shipped 4, test 5 | — | **keep** |
| `radon` | `requirements-dev.txt` | none | — | **delete**. Nothing runs it. |
| `rapidfuzz` | `requirements-build.txt`, `requirements.txt` | shipped 1 | — | **keep** |
| `requests` | `requirements-build.txt`, `requirements.txt` | dead 2, script 4, shipped 7, test 6 | — | **keep** |
| `requests-cache` | `requirements-build.txt`, `requirements.txt` | shipped 2 | — | **keep** |
| `ruff` | `requirements-dev.txt` | none | `.claude/hooks/lint-touched.sh`, `.github/workflows/release-gates.yml` +7 | **keep** |
| `selenium` | `requirements-build.txt`, `requirements.txt`, `requirements_optional.txt` | shipped 1 | — | **keep**. Uncertain: one shipped module imports it (Beatport fallback); PRUNE-06 confirms the path is live. |
| `sentry-sdk` | `requirements-build.txt`, `requirements.txt` | dead 2 | — | **keep**. Uncertain: only dead modules import it today, and Phase 13 brings Sentry back. Remove now and re-add in Phase 13, or keep? |
| `tqdm` | `requirements-build.txt`, `requirements.txt` | shipped 1 | — | **keep** |
| `types-psutil` | `requirements-dev.txt` | dead 1, script 1, shipped 3 | — | **keep**. Uncertain: `psutil` is an optional import the requirements do not declare (the sidecar's PyInstaller warnings list it missing). |
| `types-pyyaml` | `requirements-dev.txt` | shipped 4, test 5 | — | **keep** |
| `types-requests` | `requirements-dev.txt` | dead 2, script 4, shipped 7, test 6 | — | **keep** |
| `types-tqdm` | `requirements-dev.txt` | shipped 1 | — | **keep** |
| `@playwright/test (npm)` | `apps/desktop-electron/package.json` | test 35, tooling 1 | `apps/desktop-electron/package.json scripts: playwright`, `apps/desktop-electron/package.json scripts: test` | **keep** |
| `cross-env (npm)` | `apps/desktop-electron/package.json` | none | `apps/desktop-electron/package.json scripts: cross-env` | **keep** |
| `electron (npm)` | `apps/desktop-electron/package.json` | source 6, test 2 | `apps/desktop-electron/electron/preloadErrors.test.ts`, `apps/desktop-electron/electron/preloadPath.test.ts` +3 | **keep** |
| `electron-builder (npm)` | `apps/desktop-electron/package.json` | none | `apps/desktop-electron/package.json scripts: electron-builder` | **keep** |
| `esbuild (npm)` | `apps/desktop-electron/package.json` | none | `apps/desktop-electron/package.json scripts: esbuild` | **keep** |
| `tsx (npm)` | `apps/desktop-electron/package.json` | none | — | **delete**. No script, config or file uses it. |
| `typescript (npm)` | `apps/desktop-electron/package.json` | none | `apps/desktop-electron/package.json scripts: tsc` | **keep** |
| `vitest (npm)` | `apps/desktop-electron/package.json` | test 28, tooling 1 | `apps/desktop-electron/package.json scripts: vitest` | **keep** |
| `@tanstack/react-virtual (npm)` | `apps/desktop-electron/renderer/package.json` | source 1 | — | **keep** |
| `react (npm)` | `apps/desktop-electron/renderer/package.json` | source 138, test 6, tooling 1 | `apps/desktop-electron/renderer/.oxlintrc.json` | **keep** |
| `react-dom (npm)` | `apps/desktop-electron/renderer/package.json` | source 1 | — | **keep** |
| `react-router-dom (npm)` | `apps/desktop-electron/renderer/package.json` | source 13, test 10 | — | **keep** |
| `@storybook/addon-essentials (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/.storybook/main.ts` | **keep** |
| `@storybook/addon-interactions (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/.storybook/main.ts` | **keep** |
| `@storybook/blocks (npm)` | `apps/desktop-electron/renderer/package.json` | none | — | **delete**. Nothing imports it; Storybook's essentials bring their own. |
| `@storybook/react (npm)` | `apps/desktop-electron/renderer/package.json` | test 11, tooling 1 | — | **keep** |
| `@storybook/react-vite (npm)` | `apps/desktop-electron/renderer/package.json` | tooling 1 | — | **keep** |
| `@storybook/test (npm)` | `apps/desktop-electron/renderer/package.json` | none | — | **delete**. Nothing imports it. |
| `@testing-library/jest-dom (npm)` | `apps/desktop-electron/renderer/package.json` | test 1 | — | **keep** |
| `@testing-library/react (npm)` | `apps/desktop-electron/renderer/package.json` | test 93 | — | **keep** |
| `@testing-library/user-event (npm)` | `apps/desktop-electron/renderer/package.json` | test 29 | — | **keep** |
| `@types/node (npm)` | `apps/desktop-electron/renderer/package.json` | none | `types for node` | **keep** |
| `@types/react (npm)` | `apps/desktop-electron/renderer/package.json` | none | `types for react` | **keep** |
| `@types/react-dom (npm)` | `apps/desktop-electron/renderer/package.json` | none | `types for react-dom` | **keep** |
| `@vitejs/plugin-react (npm)` | `apps/desktop-electron/renderer/package.json` | tooling 1 | — | **keep** |
| `jsdom (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/vite.config.ts` | **keep** |
| `oxlint (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/package.json scripts: oxlint` | **keep** |
| `storybook (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/package.json scripts: storybook` | **keep** |
| `typescript (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/.oxlintrc.json`, `apps/desktop-electron/renderer/package.json scripts: tsc` | **keep** |
| `vite (npm)` | `apps/desktop-electron/renderer/package.json` | none | `apps/desktop-electron/renderer/package.json scripts: vite`, `apps/desktop-electron/renderer/tsconfig.app.json` | **keep** |
| `vitest (npm)` | `apps/desktop-electron/renderer/package.json` | test 160, tooling 1 | `apps/desktop-electron/renderer/package.json scripts: vitest` | **keep** |

**Questions for the user (group I):** `sentry-sdk` is imported only by dead modules today, and
Phase 13 brings Sentry back. Remove it now and re-add it in Phase 13, or keep it?

## Group J — Docs

Every Markdown file in the repository, folder by folder. `docs/v1/` and `docs/ui-overhaul/adr/` are the
design record and stay unchanged (DEC-147). "Links to repoint" lists the staying docs that link to a
doc proposed for deletion or merging, which PRUNE-07 changes with it.

**Proposed for the design record:** where `docs/v1/` or an ADR links to a doc that goes, PRUNE-07
changes that link alone. It points the link at the doc's replacement, or at the file in git history
when nothing replaces it, so that the link check stays clean. The record's text is not rewritten.

#### `./` — 4 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | 136 | 2026-10-06 | 21 | qt 2 | **update**. Qt rows (group A), the hook table, the map. |
| `CLAUDE.md` | 1 | 2026-09-01 | — | — | **keep** |
| `PRIVACY_NOTICE.md` | 62 | 2025-12-29 | 10 | — | **keep**. Kept equal to `docs/policy/privacy-notice.md`. |
| `README.md` | 73 | 2026-09-28 | 5 | — | **update** |

#### `.agents/skills/cuepoint-desktop-contract/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 56 | 2026-08-29 | — | — | **keep** |

#### `.agents/skills/cuepoint-matching-pipeline/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 63 | 2026-08-29 | — | — | **keep** |

#### `.agents/skills/cuepoint-release/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 325 | 2026-09-07 | — | old_updater 4, qt 1 | **update**. Drives the retired pipeline (`step10_release_readiness.py` runs `build_pyinstaller.py`; appcast scripts). Rewritten for the Electron release, with `.claude`'s copy. |

#### `.claude/skills/cuepoint-desktop-contract/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 56 | 2026-09-01 | — | — | **keep** |

#### `.claude/skills/cuepoint-matching-pipeline/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 63 | 2026-09-01 | — | — | **keep** |

#### `.claude/skills/cuepoint-release/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` | 325 | 2026-09-07 | — | old_updater 4, qt 1 | **update**. As `.agents`' copy. |

#### `.github/` — 5 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `COMMUNITY_GUIDELINES.md` | 83 | 2025-12-21 | — | — | **merge** into `docs/policy/community-contributions.md`. Nothing links to it. |
| `CONTRIBUTING.md` | 70 | 2026-07-16 | 6 | qt 2 | **update**. Names `requirements-qt.txt`. |
| `PULL_REQUEST_TEMPLATE.md` | 19 | 2026-03-09 | — | — | **keep** |
| `SECURITY.md` | 24 | 2026-01-24 | 1 | — | **keep** |
| `TECHNICAL_ANALYSIS.md` | 203 | 2026-03-09 | — | incrate 2, old_updater 1, qt 2, retired_ui 2 | **merge** into `docs/development/architecture.md`. Describes inKey and inCrate as the app's two tools; nothing links to it. |

#### `apps/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 10 | 2026-08-29 | — | — | **keep** |

#### `apps/desktop-electron/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 65 | 2026-09-28 | — | incrate 1, retired_ui 1 | **update**. Names inCrate and a retired screen. |

#### `apps/desktop-electron/docs/` — 2 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `design-signoff.md` | 196 | 2026-09-05 | 6 | qt 4, retired_ui 3 | **delete**. Phase 1 lab sign-off; `PIXEL_DESIGN_SYSTEM.md` and the ADRs hold the design. Links to repoint: `apps/desktop-electron/README.md`, `apps/desktop-electron/renderer/README.md`, `docs/v1/DECISIONS.md` +2. Broken links: 1. |
| `spike-s1-engine-health.md` | 43 | 2026-07-15 | 3 | — | **delete**. Spike; its finding is the engine supervisor. Links to repoint: `apps/desktop-electron/README.md`, `docs/ui-overhaul/adr/002-engine-packaging.md`. |

#### `apps/desktop-electron/renderer/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 21 | 2026-09-28 | — | — | **keep** |

#### `docs/` — 6 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 86 | 2026-10-05 | 6 | incrate 6 | **update**. Becomes the map of where each kind of doc lives. |
| `how-to-run.md` | 40 | 2026-08-29 | 3 | — | **merge** into `docs/development/developer-setup.md`. Links to repoint: `README.md`. |
| `incrate-spec.md` | 116 | 2026-09-28 | 10 | incrate 5, retired_ui 2 | **delete**. inCrate retired (DEC-100). Links to repoint: `docs/README.md`, `docs/ui-overhaul/adr/007-discover-on-the-library.md`, `docs/v1/PHASE9_DISCOVER.md`. |
| `index.md` | 21 | 2026-10-05 | — | incrate 1 | **update** |
| `release-checklist.md` | 116 | 2026-02-10 | 1 | — | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `docs/README.md`. |
| `roadmap.md` | 7 | 2026-02-15 | 4 | — | **delete**. Links point at `docs/v1/ROADMAP.md` instead. Links to repoint: `docs/development/metadata-sources-caching-strategy.md`, `docs/v1/ROADMAP.md`. |

#### `docs/compliance/` — 3 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `accessibility-compliance.md` | 221 | 2026-02-10 | 2 | — | **keep** |
| `license-compliance.md` | 238 | 2026-09-05 | 3 | — | **keep** |
| `privacy-compliance.md` | 276 | 2026-02-10 | 3 | — | **keep** |

#### `docs/development/` — 13 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `architecture.md` | 147 | 2026-09-19 | 8 | — | **update** |
| `beatport-parsing.md` | 73 | 2026-02-10 | 4 | — | **keep** |
| `beatport-site-change-plan.md` | 50 | 2026-02-10 | 1 | — | **keep** |
| `coding-standards.md` | 9 | 2026-02-10 | 1 | — | **merge** into `docs/development/developer-setup.md`. Names black, isort, pylint and flake8; the gates are ruff. Links to repoint: `docs/README.md`. |
| `common-errors.md` | 154 | 2026-09-28 | 2 | incrate 2, qt 8 | **update**. Qt and inCrate errors. |
| `debug-mismatch.md` | 80 | 2026-02-10 | 3 | — | **keep** |
| `dev-sandbox.md` | 61 | 2026-07-16 | 2 | — | **keep** |
| `developer-setup.md` | 143 | 2026-09-21 | 4 | qt 2 | **update**. Names Qt. |
| `docs-ownership.md` | 41 | 2026-02-10 | 1 | — | **merge** into `docs/README.md`'s map. Links to repoint: `docs/README.md`. |
| `match-rules-and-scoring.md` | 91 | 2026-02-10 | 7 | — | **keep** |
| `metadata-sources-caching-strategy.md` | 129 | 2026-02-10 | — | — | **keep**. Uncertain: a Step 12 strategy nothing links to. Delete if it is no longer the plan. |
| `remediation-notes.md` | 6 | 2026-02-10 | 1 | — | **delete**. Six lines marked archive. Links to repoint: `docs/README.md`. |
| `testing-strategy.md` | 93 | 2026-02-10 | 4 | — | **update**. Checked against `run_tests.py`'s layers. |

#### `docs/development/archive/` — 2 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `di-integration-test-timeout-remediation.md` | 68 | 2026-02-10 | 1 | — | **delete**. Archive (DEC-147). |
| `mypy-type-errors-remediation.md` | 175 | 2026-02-10 | 1 | qt 5 | **delete**. Archive (DEC-147). |

#### `docs/faq/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `index.md` | 75 | 2026-09-28 | 2 | incrate 5, retired_ui 2 | **update**. inCrate and retired screens. |

#### `docs/feature/` — 8 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 42 | 2026-09-28 | 3 | incrate 22 | **delete**. Index of inCrate's designs. Links to repoint: `docs/README.md`, `docs/index.md`. |
| `beatport-api-reference.md` | 175 | 2026-09-23 | — | incrate 10 | **merge** into `docs/development/` as the Beatport v4 reference Discover uses. |
| `beatport-api-token.md` | 188 | 2026-09-28 | 2 | incrate 5 | **merge** into `docs/user-guide/discover.md`. |
| `incrate-01-inventory.md` | 650 | 2026-09-28 | 3 | incrate 86, qt 1, retired_ui 3 | **delete**. inCrate retired (DEC-100). |
| `incrate-02-beatport-api.md` | 524 | 2026-09-28 | 5 | incrate 34 | **delete**. inCrate retired (DEC-100). |
| `incrate-03-discovery.md` | 388 | 2026-09-28 | 3 | incrate 32 | **delete**. inCrate retired (DEC-100). |
| `incrate-04-playlist-and-auth.md` | 249 | 2026-09-28 | 3 | incrate 40 | **delete**. inCrate retired (DEC-100). |
| `incrate-05-ui-and-integration.md` | 288 | 2026-09-28 | 2 | incrate 63, qt 4, retired_ui 17 | **delete**. inCrate retired (DEC-100). |

#### `docs/features/` — 23 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 38 | 2026-09-28 | — | incrate 3, qt 1 | **update** |
| `beatport-search-and-fetch.md` | 37 | 2026-02-10 | 1 | — | **keep** |
| `checkpoint-and-resume.md` | 40 | 2026-09-19 | 1 | — | **keep** |
| `cli-and-arguments.md` | 39 | 2026-02-10 | 2 | — | **keep** |
| `configuration.md` | 39 | 2026-02-10 | 1 | — | **keep** |
| `csv-and-excel-export.md` | 42 | 2026-09-19 | 1 | — | **keep** |
| `data-integrity.md` | 43 | 2026-02-10 | 1 | — | **keep** |
| `dialogs-and-help.md` | 54 | 2026-09-19 | 1 | qt 1, retired_ui 3 | **delete**. Qt dialogs. Links to repoint: `docs/features/README.md`. |
| `incrate.md` | 25 | 2026-09-28 | 2 | incrate 11, retired_ui 2 | **delete**. inCrate retired (DEC-100). Links to repoint: `docs/features/README.md`, `docs/v1/PHASE9_DISCOVER.md`. |
| `main-window-and-navigation.md` | 49 | 2026-09-19 | 1 | qt 1, retired_ui 8 | **delete**. Qt main window; `docs/user-guide/the-window.md` describes the app's. Links to repoint: `docs/features/README.md`. |
| `matching-and-scoring.md` | 45 | 2026-02-10 | 1 | — | **keep** |
| `mix-parsing.md` | 35 | 2026-02-10 | 1 | — | **keep** |
| `preflight.md` | 35 | 2026-09-19 | 1 | retired_ui 1 | **update**. Names a retired screen. |
| `processor-service.md` | 51 | 2026-09-19 | 1 | retired_ui 2 | **update**. Names a retired screen. |
| `progress-and-results.md` | 40 | 2026-09-19 | 1 | qt 1, retired_ui 6 | **delete**. Qt results table (DEC-071). Links to repoint: `docs/features/README.md`. |
| `query-generation.md` | 31 | 2026-02-10 | 1 | — | **keep** |
| `rekordbox-parsing.md` | 49 | 2026-02-10 | 1 | — | **keep** |
| `reliability-and-performance.md` | 31 | 2026-02-10 | 1 | — | **keep** |
| `shortcuts-and-themes.md` | 37 | 2026-09-19 | 1 | qt 2, retired_ui 4 | **merge** into `docs/user-guide/the-window.md`. Links to repoint: `docs/features/README.md`. |
| `status-bar-history-batch.md` | 33 | 2026-09-19 | 1 | qt 1, retired_ui 5 | **delete**. Qt status bar and batch UI. Links to repoint: `docs/features/README.md`. |
| `support-and-diagnostics.md` | 43 | 2026-02-10 | 1 | qt 1, retired_ui 6 | **merge** into `docs/user-guide/troubleshooting.md`. Links to repoint: `docs/features/README.md`. |
| `text-processing.md` | 37 | 2026-02-10 | 1 | — | **keep** |
| `update-system.md` | 52 | 2026-09-01 | 8 | old_updater 15, qt 5 | **delete**. The old updater; Phase 16 writes its successor. Links to repoint: `docs/features/README.md`, `docs/release/design-two-appcast-feeds-test-stable.md`, `docs/v1/CURRENT_ARCHITECTURE.md` +3. |

#### `docs/future-features/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 5 | 2026-02-15 | — | — | **delete**. Links point at `docs/v1/ROADMAP.md` instead. |

#### `docs/getting-started/` — 3 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `first-steps.md` | 54 | 2026-02-10 | 2 | — | **merge** into `docs/user-guide/getting-started.md`. Links to repoint: `docs/README.md`, `docs/faq/index.md`. |
| `installation.md` | 49 | 2026-03-09 | 1 | — | **merge** into `docs/user-guide/getting-started.md`. Links to repoint: `docs/README.md`. |
| `quick-start.md` | 54 | 2026-09-19 | 3 | — | **merge** into `docs/user-guide/getting-started.md`. Links to repoint: `docs/README.md`, `docs/faq/index.md`, `docs/index.md`. |

#### `docs/guides/` — 5 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 9 | 2026-02-10 | 1 | qt 1 | **delete**. Index of a folder that empties. |
| `fix-pyside6-macos.md` | 183 | 2026-07-16 | 1 | qt 36 | **delete**. Qt. |
| `how-to-see-shortcuts.md` | 205 | 2026-07-16 | 1 | — | **merge** into `docs/user-guide/the-window.md`. |
| `install-macos.md` | 216 | 2026-07-16 | 1 | qt 4 | **merge** into `docs/development/developer-setup.md` (a Python environment for running from source). |
| `reproducible-builds.md` | 167 | 2026-02-10 | — | pyinstaller_app 1 | **delete**. Duplicate of `docs/release/guides/reproducible-builds.md`. |

#### `docs/policy/` — 16 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `acceptable-use.md` | 33 | 2026-02-10 | 1 | — | **keep** |
| `breaking-change-policy.md` | 45 | 2026-02-10 | 2 | — | **keep** |
| `changelog-policy.md` | 61 | 2026-03-09 | 4 | — | **keep** |
| `code-of-conduct.md` | 47 | 2026-02-10 | 3 | — | **keep** |
| `community-contributions.md` | 52 | 2026-03-29 | 2 | — | **keep** |
| `data-processing-notice.md` | 58 | 2026-02-10 | 3 | — | **keep** |
| `deprecation-policy.md` | 47 | 2026-02-10 | 4 | — | **keep** |
| `deprecation-schedule.md` | 71 | 2026-02-10 | 5 | — | **keep** |
| `export-control.md` | 28 | 2026-07-16 | 1 | — | **keep** |
| `index.md` | 46 | 2026-03-29 | — | — | **keep** |
| `output-schema-versioning.md` | 48 | 2026-02-10 | 2 | — | **keep** |
| `privacy-notice.md` | 78 | 2026-09-01 | 8 | — | **keep** |
| `support-sla.md` | 49 | 2026-02-10 | 7 | — | **keep** |
| `telemetry.md` | 60 | 2026-02-10 | 2 | — | **keep** |
| `terms-of-use.md` | 34 | 2026-03-29 | 2 | — | **keep** |
| `trademark-usage.md` | 31 | 2026-02-10 | 1 | — | **keep** |

#### `docs/release/` — 24 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `CHANGELOG.md` | 682 | 2026-10-06 | 26 | incrate 22, old_updater 1, qt 4, retired_ui 6 | **keep** |
| `backup-disaster-recovery.md` | 101 | 2026-02-10 | 1 | old_updater 11 | **merge** into `docs/release/incident-response-runbook.md`. |
| `checksum-signing.md` | 265 | 2026-02-10 | 5 | — | **merge** into `docs/release/key-management.md`. Links to repoint: `docs/release/key-management.md`, `docs/v1/CURRENT_ARCHITECTURE.md`. |
| `compatibility-matrix.md` | 76 | 2026-02-10 | 6 | — | **merge** into `docs/user-guide/support-policy.md`. Links to repoint: `.agents/skills/cuepoint-release/SKILL.md`, `.claude/skills/cuepoint-release/SKILL.md`, `docs/v1/CURRENT_ARCHITECTURE.md`. |
| `design-two-appcast-feeds-test-stable.md` | 504 | 2026-10-06 | 3 | old_updater 86, qt 1 | **keep**. Uncertain: marked superseded by DEC-145 on 2026-10-06 and kept as history. DEC-147 deletes superseded plans; delete if git history is enough. |
| `incident-response-runbook.md` | 115 | 2026-02-10 | 3 | old_updater 2 | **update** |
| `key-management.md` | 39 | 2026-02-10 | 4 | — | **update** |
| `known-issues.md` | 53 | 2026-09-01 | 7 | old_updater 1, qt 2 | **merge** into `docs/user-guide/troubleshooting.md`. Links to repoint: `.agents/skills/cuepoint-release/SKILL.md`, `.claude/skills/cuepoint-release/SKILL.md`, `docs/v1/CURRENT_ARCHITECTURE.md` +3. |
| `maintenance-policy.md` | 194 | 2026-02-10 | 4 | — | **merge** into `docs/policy/` (policies live there). |
| `maintenance-roadmap.md` | 54 | 2026-02-10 | 3 | — | **delete**. `docs/v1/ROADMAP.md` is the roadmap. |
| `ops-index.md` | 61 | 2026-03-09 | 8 | old_updater 1 | **delete**. Index of documents folded elsewhere. Links to repoint: `.agents/skills/cuepoint-release/SKILL.md`, `.claude/skills/cuepoint-release/SKILL.md`, `AGENTS.md` +1. |
| `ops-kpis.md` | 98 | 2026-02-10 | 1 | — | **merge** into `docs/policy/support-sla.md`. |
| `ops-support-channels.md` | 80 | 2026-02-10 | 1 | — | **merge** into `docs/policy/support-sla.md`. |
| `pre-release-checklist.md` | 198 | 2026-02-10 | 3 | old_updater 3, pyinstaller_app 1 | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `.agents/skills/cuepoint-release/SKILL.md`, `.claude/skills/cuepoint-release/SKILL.md`. |
| `release-announcement-template.md` | 60 | 2026-02-10 | 2 | — | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `docs/release/release-deployment-runbook.md`. |
| `release-deployment-runbook.md` | 78 | 2026-03-09 | 10 | old_updater 3 | **update**. Becomes the one release runbook for what the Electron release does today. |
| `release-notes-template.md` | 72 | 2026-03-09 | 3 | — | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `docs/release/release-deployment-runbook.md`. |
| `release-readiness-summary.md` | 133 | 2026-02-10 | — | pyinstaller_app 1 | **delete**. Readiness of the retired app. |
| `release-readiness-test-plan.md` | 215 | 2026-02-10 | 1 | pyinstaller_app 2 | **delete**. Readiness of the retired app. |
| `release-schedule.md` | 281 | 2026-03-09 | 4 | — | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `docs/release/release-deployment-runbook.md`. |
| `release-strategy.md` | 229 | 2026-03-09 | 6 | — | **merge** into `docs/release/release-deployment-runbook.md`. Links to repoint: `docs/release/release-deployment-runbook.md`, `docs/release/rollback.md`. |
| `rollback.md` | 68 | 2026-03-09 | 8 | old_updater 12 | **update**. The rollback runbook. |
| `triage-workflow.md` | 140 | 2026-02-10 | 4 | old_updater 1 | **merge** into `docs/policy/support-sla.md`. Links to repoint: `docs/release/incident-response-runbook.md`. |
| `update-feed-recovery-runbook.md` | 74 | 2026-02-10 | 4 | old_updater 18 | **delete**. Sparkle feeds retired. Links to repoint: `docs/release/incident-response-runbook.md`, `docs/release/release-deployment-runbook.md`. |

#### `docs/release/guides/` — 14 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 18 | 2026-02-15 | 3 | — | **delete**. Index of a folder that empties. |
| `download-location-info.md` | 71 | 2026-02-10 | 1 | — | **delete**. Where the Qt updater saved installers. |
| `github-pages-setup-quick-start.md` | 52 | 2026-02-10 | 1 | old_updater 5 | **merge** into `docs/release/release-deployment-runbook.md` (the site; the feeds go). |
| `github-pages-setup.md` | 126 | 2026-02-10 | 1 | old_updater 9 | **merge** into `docs/release/release-deployment-runbook.md` (the site; the feeds go). |
| `github-secrets-setup.md` | 259 | 2026-02-10 | 2 | — | **merge** into `docs/release/key-management.md`. Links to repoint: `docs/release/key-management.md`. |
| `pre-release-testing.md` | 225 | 2026-02-10 | 1 | old_updater 8 | **merge** into `docs/release/release-deployment-runbook.md`. |
| `release-communication-templates.md` | 164 | 2026-03-09 | 1 | — | **merge** into `docs/release/release-deployment-runbook.md`. |
| `reproducible-builds.md` | 167 | 2026-02-15 | 1 | pyinstaller_app 1 | **merge** into `docs/release/release-deployment-runbook.md` (the sidecar's build; the retired app's goes). |
| `rollback-plan.md` | 190 | 2026-02-10 | 1 | old_updater 19 | **merge** into `docs/release/rollback.md`. |
| `step-10-macos-signing-optional.md` | 130 | 2026-02-10 | 1 | — | **delete**. One-off Step 10 guide for the retired app's signing. |
| `step-10-manual-steps-guide.md` | 781 | 2026-03-09 | 1 | — | **delete**. One-off Step 10 guide for the retired app's signing. |
| `step-10-no-signing-guide.md` | 480 | 2026-03-09 | 2 | pyinstaller_app 2 | **delete**. One-off Step 10 guide for the retired app's signing. Links to repoint: `docs/release/key-management.md`. |
| `step-10-quick-start.md` | 81 | 2026-02-10 | 1 | — | **delete**. One-off Step 10 guide for the retired app's signing. |
| `version-sync-automation.md` | 154 | 2026-02-10 | 1 | old_updater 2 | **delete**. Version sync for the retired app; `check_desktop_version_coupling.py` holds the coupling. |

#### `docs/schema/` — 2 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `migration-guide.md` | 53 | 2026-02-10 | 1 | — | **keep** |
| `rekordbox-compatibility-matrix.md` | 48 | 2026-02-10 | 2 | — | **keep** |

#### `docs/security/` — 4 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `security-gate-checklist.md` | 32 | 2026-02-10 | — | old_updater 1, retired_ui 1 | **merge** into `docs/release/release-deployment-runbook.md`. |
| `security-response-process.md` | 139 | 2026-02-10 | 6 | — | **keep** |
| `support-sla-playbook.md` | 62 | 2026-02-10 | 6 | old_updater 2 | **keep** |
| `vulnerability-patch.md` | 199 | 2026-02-10 | 1 | — | **keep** |

#### `docs/ui-overhaul/` — 25 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 77 | 2026-07-15 | 5 | incrate 6, qt 8, retired_ui 3 | **update**. Becomes the index of the ADRs beside it. Broken links: 1. |
| `decisions.md` | 57 | 2026-07-15 | 2 | qt 1, retired_ui 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`, `docs/v1/PIXEL_DESIGN_SYSTEM.md`. |
| `implementation-reference.md` | 128 | 2026-07-15 | 1 | incrate 1, qt 2, retired_ui 2 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. |
| `layout-and-scroll.md` | 140 | 2026-07-15 | 2 | qt 2 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. |
| `manual-test-matrix-lab-rc.md` | 67 | 2026-07-15 | 2 | incrate 3, qt 1, retired_ui 2 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `manual-test-matrix.md` | 47 | 2026-07-15 | 1 | incrate 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `next-milestone.md` | 27 | 2026-07-16 | 5 | qt 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `parity-matrix.md` | 42 | 2026-07-15 | 3 | incrate 17, qt 6, retired_ui 6 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. Broken links: 11. |
| `phase-0-architecture.md` | 223 | 2026-07-15 | 5 | incrate 1, qt 4 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/adr/002-engine-packaging.md`, `docs/ui-overhaul/adr/README.md`. |
| `phase-0b-security-and-privacy.md` | 216 | 2026-07-15 | 5 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/adr/003-http-ipc.md`. |
| `phase-0c-repo-hygiene.md` | 188 | 2026-07-15 | 2 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/assets/README.md`. |
| `phase-1-pixel-design-system.md` | 258 | 2026-07-15 | 6 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/assets/README.md`, `docs/v1/CURRENT_ARCHITECTURE.md`, `docs/v1/DECISIONS.md` +3. |
| `phase-10-cutover-remove-qt.md` | 99 | 2026-08-29 | 2 | qt 17 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-2-repo-layout.md` | 151 | 2026-07-15 | 1 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-3-engine-api.md` | 171 | 2026-07-15 | 3 | qt 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/adr/003-http-ipc.md`, `docs/ui-overhaul/adr/005-matching-on-the-library.md`. |
| `phase-4-electron-shell.md` | 124 | 2026-07-15 | 1 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-5-frontend-foundations.md` | 150 | 2026-07-15 | — | incrate 2, qt 1, retired_ui 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-6-10-roadmap.md` | 89 | 2026-08-29 | 2 | incrate 1, qt 4, retired_ui 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. |
| `phase-6-gui-parity.md` | 178 | 2026-07-16 | 4 | incrate 3, qt 9, retired_ui 3 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-7-observability.md` | 139 | 2026-07-15 | 1 | qt 2 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-8-testing.md` | 95 | 2026-07-15 | 3 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `phase-9-ci-release.md` | 113 | 2026-07-15 | 1 | — | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). |
| `results-table.md` | 137 | 2026-07-15 | 3 | qt 4 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. |
| `rollout-phases.md` | 118 | 2026-07-15 | 3 | qt 6, retired_ui 4 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. Broken links: 4. |
| `settings-and-appearance.md` | 79 | 2026-07-15 | 2 | retired_ui 1 | **delete**. A plan, phase or matrix of the Electron migration, which is done (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. Broken links: 1. |

#### `docs/ui-overhaul/adr/` — 11 files, **keep** (design record, DEC-147)

#### `docs/ui-overhaul/assets/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 21 | 2026-07-15 | 1 | — | **keep**. Uncertain: the pixel assets' reference; keep while the ADRs cite assets. |

#### `docs/ui-overhaul/tracking/` — 23 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 26 | 2026-07-15 | 2 | incrate 2, qt 3, retired_ui 2 | **delete**. Tracker (DEC-147). Links to repoint: `docs/ui-overhaul/README.md`. |
| `issue-parity-matrix.md` | 18 | 2026-07-15 | 1 | incrate 5, qt 1, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `issue-qt-results.md` | 21 | 2026-07-15 | 1 | qt 2 | **delete**. Tracker (DEC-147). |
| `issue-spike-s1.md` | 21 | 2026-07-15 | 1 | — | **delete**. Tracker (DEC-147). |
| `milestone-10-xml-batch.md` | 22 | 2026-07-15 | — | qt 1, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-11-m3u-rerun.md` | 23 | 2026-07-15 | — | qt 2, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-12-sync-tags.md` | 24 | 2026-07-15 | — | qt 1 | **delete**. Tracker (DEC-147). |
| `milestone-13-incrate-import.md` | 22 | 2026-07-15 | — | incrate 3, qt 1 | **delete**. Tracker (DEC-147). |
| `milestone-14-drop-zones-rc.md` | 22 | 2026-07-15 | — | incrate 1, qt 1, retired_ui 2 | **delete**. Tracker (DEC-147). |
| `milestone-2.md` | 19 | 2026-07-15 | — | incrate 1, qt 1, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-4.md` | 21 | 2026-07-15 | — | incrate 4, qt 2, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-5.md` | 20 | 2026-07-15 | — | qt 2, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-6-all-slices.md` | 29 | 2026-07-15 | — | incrate 5, qt 3, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `milestone-6.md` | 21 | 2026-07-15 | — | incrate 1, qt 3 | **delete**. Tracker (DEC-147). |
| `milestone-7-candidates-batch.md` | 27 | 2026-07-15 | — | retired_ui 2 | **delete**. Tracker (DEC-147). |
| `milestone-8-tool-picker-history.md` | 24 | 2026-07-15 | — | incrate 1, retired_ui 2 | **delete**. Tracker (DEC-147). |
| `milestone-9-rerun-review.md` | 23 | 2026-07-15 | — | — | **delete**. Tracker (DEC-147). |
| `phase-6-help-dialogs.md` | 26 | 2026-07-16 | — | qt 1, retired_ui 1 | **delete**. Tracker (DEC-147). |
| `phase-7-support-bundle.md` | 21 | 2026-07-15 | — | — | **delete**. Tracker (DEC-147). |
| `phase-8-playwright-smoke.md` | 25 | 2026-07-15 | — | — | **delete**. Tracker (DEC-147). |
| `phase-9-electron-packaging.md` | 33 | 2026-07-16 | — | — | **delete**. Tracker (DEC-147). |
| `phase-c-qt-results-frame.md` | 20 | 2026-07-15 | — | qt 1 | **delete**. Tracker (DEC-147). |
| `phase-d-qt-appearance.md` | 23 | 2026-07-15 | — | qt 1 | **delete**. Tracker (DEC-147). |

#### `docs/user-guide/` — 16 files

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `clean.md` | 182 | 2026-10-05 | 21 | retired_ui 4 | **update**. Names a retired screen (as history?) — checked against the app. |
| `discover.md` | 282 | 2026-09-28 | 18 | incrate 26 | **update**. Names inCrate (what Discover replaced) — checked against the app. |
| `features.md` | 122 | 2026-10-06 | 1 | — | **keep** |
| `getting-started.md` | 59 | 2026-02-10 | 2 | — | **update**. Last changed 2026-02-10, before the v1 phases. |
| `glossary.md` | 37 | 2026-10-06 | 2 | — | **keep** |
| `library.md` | 539 | 2026-10-06 | 14 | incrate 4 | **update**. Names inCrate — checked against the app. |
| `organization.md` | 196 | 2026-09-29 | 6 | — | **keep** |
| `performance.md` | 434 | 2026-10-06 | 12 | — | **keep** |
| `player.md` | 139 | 2026-10-05 | 6 | — | **keep** |
| `prepare.md` | 329 | 2026-10-06 | 11 | — | **keep** |
| `rekordbox-export.md` | 136 | 2026-09-29 | 6 | — | **keep** |
| `support-policy.md` | 58 | 2026-10-06 | 7 | — | **keep** |
| `the-window.md` | 144 | 2026-10-05 | 13 | incrate 1, retired_ui 1 | **update**. Names inCrate and a retired screen. |
| `troubleshooting.md` | 189 | 2026-02-10 | 7 | — | **update**. Last changed 2026-02-10, before the v1 phases. |
| `waveforms.md` | 197 | 2026-10-06 | 11 | — | **keep** |
| `workflows.md` | 66 | 2026-09-29 | 2 | — | **keep** |

#### `docs/v1/` — 19 files, **keep** (design record, DEC-147)

#### `scripts/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 20 | 2026-02-15 | 3 | — | **update**. Lists every remaining script (PRUNE-04). |

#### `src/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 18 | 2026-09-28 | — | incrate 2 | **update**. Names inCrate. |

#### `src/tests/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 10 | 2026-02-15 | — | — | **keep** |

#### `src/tests/fixtures/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 38 | 2026-02-10 | — | — | **keep** |

#### `src/tests/fixtures/beatport_v4/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 65 | 2026-09-23 | 2 | incrate 1 | **keep** |

#### `src/tests/regression/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 70 | 2026-09-19 | 2 | — | **keep** |

#### `src/tests/regression/ISSUE-EXAMPLE/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 20 | 2026-02-10 | — | — | **keep** |

#### `src/tests/regression/RB-LOCATION-PUNCTUATION/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 55 | 2026-09-03 | 1 | retired_ui 1 | **keep** |

#### `src/tests/regression/RB-RELINK-NOT-REMOVED/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `README.md` | 45 | 2026-09-03 | 1 | — | **keep** |

#### `third_party/mpv/` — 1 file

| Doc | Lines | Last changed | Linked or named by | Signals | Proposal |
| --- | --- | --- | --- | --- | --- |
| `NOTICE.md` | 73 | 2026-09-05 | 4 | — | **keep** |


## Outcome

Recorded under PRUNE-01 in `PHASE12_CLEANUP.md`. The user's marks go in the table at the top.
