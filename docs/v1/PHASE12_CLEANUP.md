# CuePoint v1.0.0 — Phase 12: Cleanup, Detailed Step Specifications

Status: **Specified 2026-10-06. PRUNE-01 is implemented (2026-10-06), and the user approved every
group of its audit (`PHASE12_AUDIT.md`) the same day. PRUNE-02 is implemented (2026-10-06): Qt is
removed. PRUNE-03 is next.** Eight steps, PRUNE-01…PRUNE-08. Per the
process, no implementation happens from this document. Each step needs an explicit "Implement
PRUNE-NN" instruction, scoped to exactly that step, and its outcome is recorded under the step
afterwards. There are no open points. The measurements taken while writing it are in cross-cutting
fact 6, and PRUNE-01 takes them again as its baseline.

Depends on Phases 1–11, all implemented. Decision Rounds 1–15 apply (`DECISIONS.md`,
DEC-001…DEC-147). This phase's own decisions are DEC-146 (its place, first after Phase 11) and
DEC-147 (how it decides what goes). It also works alongside DEC-019 (the Qt updater removed),
DEC-071 (inKey, Results and `ResultsTable` retired into Clean), DEC-100 (inCrate and the Tools group
retired) and DEC-145 (the new updater does not reuse the old version comparison).

The step prefix is PRUNE, because CLEAN is Phase 7's.

## What this phase is

CuePoint has been rebuilt twice: from a Qt app into Electron, and then phase by phase into v1. Each
rebuild retired something, and not everything retired was removed. A survey taken while writing this
found:
- 11 modules that still import PySide6;
- 51 Python modules that nothing shipped imports;
- about 70 scripts that nothing runs;
- a release pipeline that builds an app that no longer exists;
- 218 Markdown files in more than 20 folders, some describing screens that are gone.

This phase removes what is dead and brings what remains up to date:
- **An audit first** (PRUNE-01). Every candidate is listed with its evidence and grouped, and the
  user approves or strikes each group or item before anything is deleted (DEC-147).
- **Qt, removed entirely** (PRUNE-02). The guard that keeps it out widens to all of `src/`.
- **Dead Python modules and tests** (PRUNE-03), **the old release pipeline and scripts nothing
  runs** (PRUNE-04), and **dead Electron and renderer code** (PRUNE-05) are removed.
- **Unused dependencies, Python and npm,** are removed (PRUNE-06).
- **The docs:** too many and irrelevant ones go, and every one that remains describes the app as it
  is (PRUNE-07).
- **A guard in CI** (PRUNE-08), so that dead code cannot pile up again. The phase comes together
  there.

**What this phase is not.**
- **No behaviour changes.** Nothing a user sees, runs or stores changes:
  - the CLI and its flags;
  - the engine's routes and answers;
  - the `window.cuepoint` bridge;
  - config keys;
  - the databases and their migrations;
  - exports and set lists.
- **No refactoring of live code** beyond what a removal requires. Live code that is merely untidy
  stays. A rewrite is a phase of its own.
- **Untracked local files are not touched** (DEC-147, Q-150).
- **The design record stays:** `docs/v1/` and the ADRs (DEC-147, Q-147).
- **The website stays** (`gh-pages-root/` and `publish-gh-pages-site.yml`). Phase 17 replaces it.
- **No new release pipeline.** Phase 16 builds it. Until then, Electron builds come from
  `desktop-electron.yml`'s `npm run dist`, as they do today.

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| The no-Qt guard, run by a hook, CI and its own tests | `scripts/check_no_qt_in_core.py`, `.claude/hooks/qt-guard.sh`, `src/tests/unit/scripts/test_check_no_qt_in_core.py` |
| Test layers, selected by one runner | `scripts/run_tests.py` |
| The mypy gate over the strictly typed modules | `src/tests/integration/test_mypy_foundation.py`, `mypy.ini` |
| The link check over the docs | `.github/workflows/docs-check.yml` (lychee), `.lycheeignore` |
| The desktop contract test, across the six files | `apps/desktop-electron/renderer/src/api/desktopContract.test.ts` |
| The engine smoke check | `scripts/smoke_engine_health.py` |
| The version coupling check | `scripts/check_desktop_version_coupling.py` |
| The engine sidecar's build (PyInstaller, its own spec) | `scripts/build_engine_sidecar.py`, `build/engine-sidecar.spec` |
| Electron builds in CI | `.github/workflows/desktop-electron.yml` (`npm run dist`, artifacts uploaded) |
| Migrations, found by package scan and never imported by name | `src/cuepoint/migrations/__init__.py` (`pkgutil.iter_modules`) |
| Precedents for a recorded removal after a caller search | DISCOVER-12 (inCrate), CLEAN-14 (inKey and Results), EXPORT-01 (the legacy write path), FOUNDATION-15 (the Qt updater) |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-146 | This phase is 12, first after Phase 11. Every later phase works in what it leaves. |
| DEC-147 | An audit with evidence, approved by group, before any deletion. Qt removed entirely, with the guard widened. `docs/v1/` and the ADRs kept, and trackers and archives deleted. The old release workflows deleted if dead. Untracked local files left alone. |
| DEC-019 | The Qt updater's remains go. What release tooling still needs stays until Phase 16. |
| DEC-145 | The updater does not reuse `update/version_utils.py`'s base-only comparison, so it is not kept for one. |

## Sequencing

PRUNE-01 writes the audit and deletes nothing. The user's approval of it gates every later step, and
a later step deletes only what the approval covers.

PRUNE-02 to PRUNE-05 each remove one group of code. PRUNE-02 (Qt) comes first, since several
candidates in PRUNE-03 are dead only because Qt is. PRUNE-04 needs PRUNE-02, since the old workflows
install Qt. PRUNE-05 is independent of the Python steps and can run beside them. PRUNE-06 removes
dependencies once no code uses them, so it follows PRUNE-02 to PRUNE-05. PRUNE-07 rewrites the docs
once the code they describe is settled. PRUNE-08 adds the guard and closes the phase.

**Every intermediate build keeps working.** Each step ends with every suite green, the engine smoke
check passing and a desktop build that starts. A step that cannot meet this stops and records why,
rather than deleting less carefully.

## Before starting any step — seven cross-cutting facts

### 1. What "dead" means here

A file is dead when:
- nothing shipped or run reaches it;
- it is not a public interface.

"Shipped or run" means:
- the Electron app (main, the runtime preload, the renderer);
- the engine (`python -m cuepoint.engine`, and the PyInstaller sidecar built from
  `build/engine-sidecar.spec`);
- the CLI (`main.py` → `src/main.py`);
- every workflow that stays;
- every script that a staying workflow, an npm script, a hook, `pre-commit`, or the developer docs
  tell someone to run.

**A test does not make code alive.** A module that only its own tests import is dead, and its tests
go with it. A test that checks live behaviour through dead code is rewritten against the live code,
not deleted.

### 2. A static scan misses dynamic loading

The survey's import graph marks all 26 migrations unreachable. The migration runner finds them with
`pkgutil.iter_modules` and never imports them by name. The audit therefore checks every candidate
against every way code is loaded without an `import` line:
- `importlib` and `pkgutil`;
- the dependency-injection container's registrations;
- PyInstaller's hidden imports in `build/engine-sidecar.spec`;
- entry points in `pyproject.toml`;
- `package.json` scripts and electron-builder's `files` and `extraResources`;
- `.claude/hooks/` and `.pre-commit-config.yaml`;
- string paths in workflows.

**Migrations are never deleted.** They are how every user's database reaches the current schema.

### 3. Some Qt mentions are only words

Of the 11 modules matching `PySide6`, only some import it. Several only say, in a docstring, that
they must not: `onboarding_service.py`, `privacy_service.py`, `update/__init__.py` and
`platform.py`. Others reach for Qt as a fallback inside live code: `paths.py`
(`QStandardPaths`) and `diagnostics.py` (`QSettings`). Those are rewritten to their headless path,
not deleted. The rest are dead with Qt:
- `crash_handler.py`;
- `error_reporting_prefs.py`;
- `i18n.py`;
- `performance_workers.py`;
- `sentry_init.py`.

### 4. `src/gui_app.py` is not Qt

DEC-147 listed it with Qt. Read while writing this, it launches the Electron shell, and the
`run_gui.*` scripts call it. Whether it stays is a repository question for PRUNE-01's audit (group
H), not a Qt one. The correction is recorded here and in the audit.

### 5. Live code imports through a root-level shim

`src/cuepoint/services/output_writer.py` runs `from performance import performance_collector` in two
places. That resolves to `src/performance.py`, a shim that re-exports
`cuepoint.utils.performance`. Before the shims (`src/beatport.py`, `src/duckduckgo_search.py`,
`src/performance.py`) can go, every live import is pointed at the real module. PRUNE-03 checks
whether the packaged engine even contains the shim. If it does not, that import has been failing
silently in shipped builds, and the fix is recorded as such.

### 6. Measured while writing this (2026-10-06)

| What | Count |
| --- | --- |
| Python modules in `src/cuepoint/` | 290 files, 105,043 lines |
| Python test files | 464 files, 160,058 lines |
| Electron and renderer TypeScript | 515 files, 121,141 lines |
| `scripts/` | 127 files, 25,221 lines |
| Markdown in `docs/` | 218 files, 57,076 lines |
| Modules no import reaches from the CLI or the engine | 51, of which 26 are migrations (fact 2), so about 25 |
| Modules importing or mentioning PySide6 | 11 (fact 3) |
| Test files using PySide6 or `pytest-qt` | 12 |
| Scripts referenced by nothing (workflow, npm, hook, test, other script, doc) | 29 |
| Scripts referenced only by docs or by other unreferenced scripts | about 40 |
| Workflows installing Qt or building the PyInstaller app | 4 (`build-macos.yml`, `build-windows.yml`, `release-gates.yml`, `test.yml`) |
| Doc folders | 16 under `docs/`, plus 4 loose files |

The unreachable modules outside the migrations:
- **`compat/`:** `config_controller`, `export_controller`, `results_controller`.
- **`incrate/`:** `beatport_oauth` and its package.
- **`models/`:** `serialization`.
- **`utils/`:**
  - `accessibility`, `crash_handler`, `crypto`;
  - `error_handler`, `error_reporter`, `error_reporting_prefs`;
  - `file_safety`, `health_check`, `i18n`, `logger_helper`, `metrics`;
  - `performance_decorators`, `performance_workers`, `progress_tracker`;
  - `security`, `sentry_init`, `system_check`, `telemetry_analytics`, `validation`.

These are a scan's results, not verdicts. PRUNE-01 checks each one against fact 2.

### 7. Deleting is recorded, and reversible through git

Every deletion is listed in its step's outcome with the evidence that allowed it. Nothing is moved to
an archive folder, since git history is the archive (DEC-147). A commit is made only when the user
asks. When one is asked for, each step's deletions are committed apart from any fix found on the
way, as earlier phases did.

---

## PRUNE-01 — The Audit

**Objective**: List everything this phase could remove, with the evidence for each, grouped so the
user can approve or strike it. Delete nothing.

**User-visible result**: None in the app. The user gets `docs/v1/PHASE12_AUDIT.md` to read and mark.

**Dependencies**: None.

**Existing code reused**:
- `scripts/check_no_qt_in_core.py`'s file walk.
- The import-graph approach used for the survey (fact 6). It becomes a script in this step, so the
  audit can be re-run and PRUNE-08 can keep it.

**Design**:
- **`scripts/audit_dead_code.py`:**
  - builds Python's import graph from the shipped entry points (fact 1), adds every dynamic load
    from fact 2, and reports each module that is unreached and not a migration;
  - for each module, lists the tests that import it;
  - for each script, lists every reference: workflow, npm script, hook, `pre-commit`, test, other
    script and doc.

  It reads files and writes a report, and changes nothing.
- **The renderer and Electron:**
  - files that no import reaches from `electron/main.ts`, the runtime preload or the renderer's
    entry;
  - exports that nothing imports (from `tsc` and a small graph of our own, not a new dependency);
  - CSS classes that no component uses.
- **The workflows:** for each, what it builds or checks, whether that thing still exists, and what
  would stop working without it.
- **The docs:** each file, with:
  - its subject and whether that subject still exists;
  - what links to it;
  - which file says the same thing better.

  Each verdict is one of **keep**, **update**, **merge into X** or **delete**.
- **Dependencies:** each Python requirement and npm package, and the code that imports it.
- **The audit document**, grouped as DEC-147 asks:

  | Group | Holds |
  | --- | --- |
  | A — Qt | Imports, tests, requirements, CI steps, AGENTS.md rows |
  | B — The old updater | What `update/` holds, and who still uses each piece |
  | C — Legacy Python | `compat/`, `incrate/`, root shims, unreachable `utils/` and `models/` modules |
  | D — Tests | Tests of removed code; stray files at `src/tests/`'s root (`verify_*`, `test_step_5_2.py`, `test_comprehensive.py`) |
  | E — Scripts | Each with its references |
  | F — Workflows | The four Qt-era ones and anything only they call |
  | G — Electron and renderer | Files, exports, CSS |
  | H — The repository root | `collection_incrate_playlist.xml`, `run_gui.*` with `src/gui_app.py`, `requirements-qt.txt`, `Makefile`, `config/`, `third_party/` |
  | I — Dependencies | Python and npm |
  | J — Docs | Every file's verdict, folder by folder |

  Each row gives the path, its size, the evidence and the proposal. Anything uncertain says so, and
  is proposed as **keep** until the user says otherwise.
- **The baseline:**
  - fact 6's counts, taken again;
  - every suite's pass count;
  - the engine's cold start;
  - the packaged sidecar's size;
  - the installer's size on Windows.

  PRUNE-08 compares against it.

**Tests**:
- `audit_dead_code.py` against a small fixture tree that holds:
  - a reached module;
  - an unreached one;
  - a module loaded only by `importlib`;
  - a migration;
  - a module imported only by its test;
  - a script referenced only by a doc.

  Each is classified correctly.

**Acceptance criteria / DoD**:
- Every group A–J is listed with evidence, and nothing is deleted.
- Every scan finding is either confirmed or reclassified, with the reason (fact 2).
- The user's marks are recorded in the audit document. This is the gate for PRUNE-02 onwards.

**Risks**: Low. The audit writes nothing but a report and a script.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-06). The audit is `docs/v1/PHASE12_AUDIT.md`. It lists groups A to
J with their evidence and a proposed verdict for every item, and nothing is deleted. The user approved
all ten groups on 2026-10-06, after answering the audit's three questions: the release tooling and the
two fixture-regenerating scripts are deleted, and `sentry-sdk` is removed for Phase 13 to re-add.

**What was built.**

- **`scripts/audit_dead_code.py`.** It reads tracked files only and writes a Markdown or JSON report;
  it changes nothing.
  - **Python:** the import graph from the shipped entry points, with fact 2's dynamic loads (literal
    `importlib`, `pkgutil.iter_modules(__path__)`, the sidecar spec's `hiddenimports` and
    `collect_submodules`, `pyproject.toml` entry points). Migrations are never candidates. Live
    scripts count as roots. Each module's importers and tests are listed, and each unreached module's
    every other mention is listed for a person to check.
  - **Scripts:** every reference by kind (workflow, npm, hook, `pre-commit`, build, developer doc,
    test, script, doc), carried through the scripts that run each other. What only the retired app's
    pipeline runs is marked so.
  - **The rest:** workflows (what they run, Qt, the retired app, missing paths); the Electron and
    renderer graph from `main.ts`, `preload.cjs` and `index.html`, with exports and CSS classes; every
    Markdown file's links and retired subjects; Python and npm dependencies with their importers and
    tool uses; fact 6's counts.
  - **Not counted as references:** the files that list candidates (this spec, the audit, the script
    and its test).
- **`scripts/bench_engine_start.py`.** Times the engine from launch to a healthy `/health`, from
  source or packaged. Every run starts in an empty temporary home, so it never touches the user's
  data. PRUNE-08 repeats it.
- **Tests.** `test_audit_dead_code.py` (55 tests) builds a fixture tree holding every case the spec
  names, plus the Electron, CSS, docs, dependency and git cases; it also runs over this repository.
  `test_bench_engine_start.py` (12) runs a stand-in engine, and the real one once. Both scripts are
  listed in `scripts/README.md`.

**Every scan finding confirmed or reclassified.** None of the 27 unreached modules is reclassified as
alive:
- no dynamic load names one;
- the sidecar's archive, read after the baseline build, contains none;
- their only other mentions are `mypy.ini` sections.

`src/__init__.py` is kept as uncertain, since pytest names test modules through it. The scan's
script statuses were corrected by hand in two places:
- `maintenance_report.py` is run by the CLI's `--maintenance-report`;
- `publish_feeds.py` is run by the website's workflow, which stays.

The audit's "What the audit found beyond the specification" lists these, and eight more.

**Corrections to this specification**, recorded in the audit:
- PRUNE-04 deletes `publish_feeds.py`'s feed half, not the script.
- Fact 5 has a second live shim, `duckduckgo_search`. Its question is answered: the packaged engine
  contains both shims, so nothing failed silently.
- PRUNE-03's sidecar spec has five stale `cuepoint.ui.*` names.
- `update/` is reached only through `security_service.py`'s import of `update.security`.

**Fixed on the way, each in its own commit before this step's.** The baseline needed them, and the
user asked that bugs found be fixed:
- **Desktop CI.** The desktop lockfile was out of step with `package.json` (vitest 4's vite 8 wants
  esbuild 0.27 or later), so `npm ci` failed on every OS. It is re-synced with npm 10, CI's npm.
- **`npm run dist` outside CI.** It failed after writing the installer because electron-builder could
  not name the repository. `package.json` now names it, and a test holds it.
- **The mypy gate.** It failed in Linux and macOS CI on `ctypes.get_last_error`, which exists only in
  Windows' stubs. `audio_decode.py` looks it up as it already did `WinDLL`, and the gate now checks
  all three platforms on any machine. It reproduced the failure on Windows before the fix.
- **Vulnerable pins.** pip-audit's 85 known vulnerabilities: Pillow 12.1.1 → 12.3.0 (shipped in the
  engine), aiohttp 3.13.3 → 3.13.4, pytest 9.0.2 → 9.0.3. Artwork's 281 tests pass on the new
  Pillow.
- **An order-dependent test.** A test's `LoggingService` turned the `cuepoint` logger's propagation
  off for every later test, so a `caplog` assertion failed in the full suite and passed alone.
  `conftest.py` now restores the logger after each test, and a regression test failed before the fix.
- **An engine bug the baseline run exposed.** The engine answered a POST it did not route (an unknown
  path, a missing token) without reading its body, and on Windows the close then reset the
  connection. `test_retired_incrate.py` failed once that way, with "connection aborted" instead of
  its 404. The engine now reads every request's body before answering, bounded at 16 MB. A test that
  sends the body after the answer reproduced `WinError 10053` every time before the fix.

**The baseline** is in the audit. It was taken on the commit before this step's own, which is this
step's code with the fixes above. It records:
- fact 6 again;
- every suite;
- the engine's start from source and packaged;
- the sidecar's, installer's and unpacked app's sizes;
- CI's state per workflow.

**Checks run:**
- the full Python suite, with Qt installed and as CI runs it without;
- the renderer's tests, lint and typecheck;
- Electron main's tests and typecheck, and `noUnusedLocals`;
- the Electron end-to-end suite;
- the mypy gate for three platforms;
- the engine smoke, the no-Qt guard and the version coupling;
- the sidecar build and its smoke;
- `npm run dist`, and the two new scripts' tests.

**Owed:**
- CI's green runs of the fixed workflows, on the next push (nothing was pushed).
- The Linux and macOS runs of the baseline, which this Windows-only step could not take. PRUNE-08
  compares like with like on Windows.

---

## PRUNE-02 — Qt, Removed

**Objective**: No PySide6 anywhere in the repository, and a guard that keeps it so.

**User-visible result**: None. The shipped app has not used Qt since the move to Electron.

**Dependencies**: PRUNE-01, with group A approved.

**Existing code reused**: The no-Qt guard and its tests; the headless paths already in `paths.py`
and `diagnostics.py`.

**Design**:
- **Rewritten:** `paths.py` and `diagnostics.py` lose their Qt fallbacks and keep their headless
  paths (fact 3), with behaviour held by their tests (`test_paths_headless.py`,
  `test_diagnostics.py`).
- **Deleted:**
  - the modules dead with Qt (fact 3);
  - the Qt-only tests among the 12 (as group A marks them);
  - `requirements-qt.txt`;
  - Qt fixtures in `src/tests/conftest.py`;
  - `-p no:pytest-qt` where it was only there to keep a plugin out.
- **The docstrings** that say "must stay free of PySide6" are kept, since they state the rule.
- **The guard:** `check_no_qt_in_core.py` widens from core, engine, CLI and services to all of
  `src/`, `scripts/` and the workflows. It is renamed to `check_no_qt.py`, with its hook, its CI step,
  its tests and AGENTS.md updated together.
- **AGENTS.md:**
  - the sentence "Qt is optional compatibility test material" goes;
  - "`src/gui_app.py` only launches it" follows group H's verdict;
  - the hook table names the renamed guard.

**Tests**:
- The guard's tests, widened: a PySide6 import anywhere under `src/` or `scripts/` fails it, and a
  docstring naming PySide6 does not.
- `paths` and `diagnostics` give the same answers as before on Windows, macOS and Linux CI.
- Every suite passes with no Qt installed.

**Acceptance criteria / DoD**:
- `rg PySide6` finds only docstrings stating the rule, the guard and its tests.
- CI installs no Qt package.
- All suites clean, and the engine smoke check passes.

**Risks**: Low. The shipped engine already runs without Qt installed. The risk is a test that relied
on a Qt fixture without saying so, which a run with no Qt installed exposes.

**Complexity**: **S**

**Outcome**: Implemented (2026-10-06). No code imports Qt, no requirements file declares it, no
workflow or script installs it, and `scripts/check_no_qt.py` keeps it so. The full suite passes in a
fresh virtual environment built from the requirements files alone, in which no Qt binding can be
imported: 12,195 passed, 50 skipped, 0 failed.

**Rewritten to their headless paths**, with the answers they always gave the engine:
- **`utils/paths.py`.** `_standard_path` is the platform conventions alone. `_standard_path_fallback`
  and the `CUEPOINT_HEADLESS` switch, which existed only to skip Qt, are gone.
  - `test_paths_headless.py` holds every location on Windows, macOS and Linux, whatever machine runs
    it (16 tests where there were 2).
- **`utils/diagnostics.py`.** The `QSettings` branch is gone. The settings block is the headless one
  the engine always reported, `{"source": "headless", "note": "Qt settings unavailable"}`, kept
  word for word because support bundles carry it. Its test pins it.

**Deleted:**
- **The five modules dead with Qt:** `crash_handler`, `error_reporting_prefs`, `i18n`,
  `performance_workers` and `sentry_init`, with their four test files. `sentry_init` had none.
- **The Qt-only tests:**
  - `test_export_integration`, `test_playlist_integration`, `test_step53_ui_controllers`,
    `test_step52_full_integration`, `test_step52_main_controller_di` and `test_advanced_filtering`;
  - `test_phase3_complete`, whose live checks were already covered elsewhere (the performance
    collector and report, retries, cache hits, query classification);
  - `test_step8_ux_accessibility`, after its two live classes moved to their layers as
    `unit/utils/test_output_directory.py` and `unit/services/test_output_preview.py`;
  - the root's `test_export_dialog_import.py` and `verify_export_dialog.py`, which were on
    conftest's Qt list.
- **`requirements-qt.txt`**, and its mentions in the requirements' comments.
- **From `conftest.py`:** the Qt path list, `pytest_ignore_collect`, the Qt marking in
  `pytest_collection_modifyitems`, `pytest_sessionfinish`'s Qt quit, and the `qapp` fixture.
- **From `pytest.ini`:** the `ui` marker, and the coverage omits for `gui_app.py` and `ui/`.
- **From `run_tests.py`:** `--with-qt` and its `not ui` deselection.
- **From `mypy.ini`:** the `PySide6` and `PyQt6` sections, and every `cuepoint.ui` section and the
  two deleted modules' sections.
- **`-p no:pytest-qt`** from `test.yml`, `release-gates.yml` and AGENTS.md's mypy gate.
- **From `release-gates.yml`:** both "Install Qt dependencies (Linux)" steps and both
  `QT_QPA_PLATFORM` settings.
- **`src/gui_app.py` and `run_gui.bat`, `.sh` and `.command`** (group H). AGENTS.md, `src/README.md`,
  `scripts/README.md`, `docs/development/architecture.md` and `docs/how-to-run.md` now say to start
  the app with `npm run electron:start`.

**The guard.** `check_no_qt_in_core.py` is replaced by `scripts/check_no_qt.py`. It reads Python's
syntax tree rather than lines:
- **Python:** any import of a Qt binding under `src/` (tests included), `scripts/` or the root fails
  it, in any form: `import`, `from`, inside a function or `try`, or a literal `import_module` or
  `__import__`. A docstring, comment or string naming PySide6 passes.
- **Requirements:** a Qt package in a root `requirements*.txt` or in `pyproject.toml` fails it.
- **Installs:** a `pip install` of Qt in a workflow or a shell script under `scripts/` fails it.
- **Its scope:** tracked files, plus new files git does not ignore, so a new file cannot slip past.

It runs in `test.yml` and `desktop-electron.yml`. The `qt-guard.sh` hook now runs it after any edit
to Python under `src/` or `scripts/`, not only `src/cuepoint/`. AGENTS.md, both skills and the hook
table name it.

Its tests (`test_check_no_qt.py`, 60) cover every import form and place, the docstring rule, the
requirements, `pyproject.toml`, workflows and shell scripts, git's tracked and untracked files,
the command line, and the hook itself, run through bash against a copy of the repository.

**Found on the way, and fixed:**
- **`utils/platform.py` held a Qt function the audit missed.** `apply_windows_dark_title_bar` set a
  Qt window's title bar through its `winId()`. Nothing called it, and nothing tested it. The audit
  had counted `platform.py` among the modules that name PySide6 only to state the rule; its mention
  was this function's comment. It is removed.
- **`scripts/setup/install_requirements.sh` never installed anything.** It changed into
  `scripts/setup/` and ran `pip3 install -r requirements.txt` there, where no such file is. It
  now runs from the repository root. Its PySide6 install and check went, and it asks for Python
  3.11, not 3.7.
- **Developer docs that told people to install `requirements-qt.txt`** (CONTRIBUTING,
  `developer-setup.md`, `common-errors.md`) or to run `gui_app.py` were corrected with it.

**Every changed test count is accounted for**, against PRUNE-01's baseline (12,152 passed and 75
skipped, then 12,195 and 50):

| File | Before | After | Why |
| --- | --- | --- | --- |
| `test_step6_crash_handler`, `test_error_reporting_prefs`, `test_i18n` | 9, 4, 7 | gone | Their modules went |
| `test_step6_performance_workers` | 25 skipped | gone | Its module went |
| `test_check_no_qt_in_core` → `test_check_no_qt` | 20 | 60 | The widened guard |
| `test_paths_headless` | 2 | 16 | Every platform's answers |
| `test_diagnostics` | 9 | 10 | The config file's secrets are dropped |
| `test_output_directory`, `test_output_preview` | — | 4, 3 | Moved from `test_step8_ux_accessibility` |
| `test_audit_dead_code` | 55 | 56 | A launcher's reach, now that the default has none |

The Qt test files conftest ignored were never collected, so their deletion changes no count.

**Checks run:**
- the full Python suite, in the fresh no-Qt environment and in the local one (both 12,195 passed,
  0 failed);
- the mypy gate for three platforms, and the legacy mypy record;
- `ruff check` and `ruff format --check` over `src/`;
- the new guard and the version coupling;
- the renderer's theme and waveform tests (one theme file's comment changed);
- the sidecar build, its smoke and the engine smoke;
- the packaged engine's start: median 2,571 ms, against the baseline's 2,573 ms.

**What still names Qt, by design:**
- the three docstrings that state the rule (`onboarding_service`, `privacy_service`,
  `update/__init__`);
- the guard and its tests, and the audit and its tests;
- the sidecar spec's `PySide6`, `PyQt5` and `PyQt6` excludes, kept by the audit.

**What still names Qt until a later step deletes it** (approved; editing a file one step from
deletion would be churn, and none of them installs or imports Qt):
- `build-macos.yml`, `build-windows.yml`, `build/pyinstaller.spec`, `release_readiness.py` and
  `test_pre_release.py` (PRUNE-04);
- `src/tests/test_comprehensive.py` (PRUNE-03);
- the Markdown docs, rewritten or deleted in PRUNE-07.

`CUEPOINT_HEADLESS` is now read by nothing in Python. Electron, `build_engine_sidecar.py` and
`bench_engine_start.py` still set it, harmlessly; removing it touches Electron main, and is left to
PRUNE-05.

---

## PRUNE-03 — Legacy Python Modules and Tests

**Objective**: Remove the Python modules nothing shipped reaches, the tests that only test them, and
the stray test files. Point every live import at a real module.

**User-visible result**: None.

**Dependencies**: PRUNE-02, and groups B, C and D approved.

**Existing code reused**: The audit's evidence. The removal precedents (DISCOVER-12, CLEAN-14).

**Design**:
- **Root shims first** (fact 5): `output_writer.py` imports `cuepoint.utils.performance` directly.
  Then `src/beatport.py`, `src/duckduckgo_search.py` and `src/performance.py` go, with any test
  imports repointed. The step records whether the packaged engine had been failing that import.
- **`update/`** (group B):
  - what a staying caller uses moves to where it belongs. For example, `security.py`'s HTTPS check
    is used by `services/security_service.py`, and moves beside it.
  - what only the old feeds and their scripts use goes, in PRUNE-04 with them.
  - `version_utils.py` is not kept for Phase 16 (DEC-145).
- **`compat/` and `incrate/`,** if the audit confirms nothing live reaches them. inCrate's retirement
  (DEC-100) left `beatport_oauth.py` behind.
- **The unreachable `utils/` and `models/` modules** (fact 6), one by one as approved, each with its
  tests.
- **Stray tests at `src/tests/`'s root**, as approved. A test there that still checks live behaviour
  moves into its layer instead.
- **Nothing is renamed or reorganized** that is not removed. Live modules stay where they are.

**Tests**:
- Every suite passes, with its count recorded against PRUNE-01's baseline. Every test that
  disappears belongs to a removed module, or is listed with its reason.
- The packaged engine sidecar builds and passes the smoke check.
- `output_writer`'s two performance paths each run once in a test.

**Acceptance criteria / DoD**:
- Every module in groups B and C is gone or kept with its stated reason.
- `audit_dead_code.py` reports no unreached Python module other than the migrations.
- All suites clean, and the mypy gate passes.

**Risks**: Medium. **Dynamic loading** is the risk. Fact 2's list is checked for every removal, and
the packaged sidecar is built and started, since PyInstaller is where a missing hidden import
shows.

**Complexity**: **M**

---

## PRUNE-04 — The Old Release Pipeline and Scripts Nothing Runs

**Objective**: Remove the workflows that build the retired app, the scripts only they used, and every
script nothing runs. Keep everything that builds, checks or releases the Electron app.

**User-visible result**: None. The GitHub Actions list shows only workflows that do something.

**Dependencies**: PRUNE-02 and PRUNE-03, and groups E and F approved.

**Existing code reused**: `desktop-electron.yml`, which builds the Electron app and stays.

**Design**:
- **Workflows:**
  - `build-macos.yml`, `build-windows.yml` and `release.yml` go if the audit confirms they build
    only the retired PyInstaller app and its Sparkle feeds (DEC-147).
  - `release-gates.yml` and `test.yml` lose their Qt steps, and any job that only served the old
    app.
  - **What every remaining workflow does is written down in its first lines,** so the Actions list
    reads truthfully.
- **Scripts, in three kinds:**
  - **Kept:** anything a staying workflow, npm script, hook, `pre-commit` or the developer docs
    run, and every bench the full suite runs.
  - **Deleted:**
    - the 29 referenced by nothing;
    - the ones referenced only by the deleted workflows or by other deleted scripts;
    - one-off step scripts (`check_step13_ops.py`, `step10_release_readiness.py`,
      `validate_step55.py`, `test_step3_validation.py`, `test_step4_validation.py` and the like);
    - spikes and debug scripts whose finding is already recorded in a step's outcome.
  - **Undecided:** each is kept, and its question is put to the user in the audit.
- **`scripts/README.md`** lists every script that remains, one line each, grouped by what runs it.
- **The Sparkle feed scripts** (`generate_appcast.py`, `generate_update_feed.py`, `validate_feeds.py`,
  `publish_feeds.py`, `inspect_appcast.py`, `check_appcast_diff.py`) go with `release.yml`.
  Phase 16 chooses the updater's mechanism (DEC-145), and a feed format can be rewritten then if it
  is chosen.

**Tests**:
- Every staying workflow is run once on the branch (push or `workflow_dispatch`) and passes.
- No staying file names a deleted script: `rg` over workflows, `package.json`, hooks, `pre-commit`
  and docs.

**Acceptance criteria / DoD**:
- Every remaining workflow builds, checks or releases something that exists, and says so.
- Every remaining script is run by something, or is listed as a developer tool in the README.
- `npm run dist` still produces the Windows build, and CI's macOS and Linux builds still pass.

**Risks**: Medium. **A release-path script used in a way the scan missed** is the risk. That is why
every staying workflow is run, not only read.

**Complexity**: **M**

---

## PRUNE-05 — Dead Electron and Renderer Code

**Objective**: Remove the TypeScript files, exports and CSS nothing reaches, in Electron main, the
preload and the renderer.

**User-visible result**: None.

**Dependencies**: PRUNE-01, with group G approved. It can run beside PRUNE-02 to PRUNE-04.

**Existing code reused**: The renderer's lint (`oxlint`), `tsc -b`, the desktop contract test, and
the Electron end-to-end suite.

**Design**:
- **Files no import reaches go,** with their tests.
- **Exports nothing imports** are made private, or removed when they are unused inside their file.
- **CSS rules no component's class uses go.** Classes built from strings are checked by hand, since
  a scan cannot see them.
- **`preload.ts`,** which AGENTS.md calls a placeholder beside the runtime `preload.cjs`, goes if the
  audit confirms nothing builds or imports it. AGENTS.md is updated with it.
- **The bridge is not narrowed.** A `window.cuepoint` method stays as long as the renderer calls it,
  and the six contract files stay in step.

**Tests**: The renderer and Electron suites, typecheck, lint and the whole end-to-end suite, with
counts recorded against the baseline.

**Acceptance criteria / DoD**:
- The audit's group G is done.
- `tsc` with `noUnusedLocals` reports nothing new.
- The full end-to-end suite passes.

**Risks**: Low. The type checker sees every static reach, and the end-to-end suite covers the
dynamic ones.

**Complexity**: **S**

---

## PRUNE-06 — Dependencies

**Objective**: Every dependency that remains is used, and every requirements file says what it is
for.

**User-visible result**: A smaller install and a smaller packaged engine where packages go.

**Dependencies**: PRUNE-02 to PRUNE-05, and group I approved.

**Design**:
- **Python:**
  - packages no remaining code imports go from `requirements*.txt` and `pyproject.toml`;
  - each requirements file starts with what installs it and why;
  - `requirements_optional.txt` is folded into another file, or kept with its purpose stated.
- **npm:** packages no remaining code imports are removed with `npm uninstall`, so that the
  lockfiles change only through npm (AGENTS.md). `node_modules` is never edited by hand.
- **The packaged engine:** `build/engine-sidecar.spec` loses hidden imports for removed modules, and
  the sidecar is rebuilt and measured.

**Tests**:
- A fresh virtual environment from the requirements files passes every suite.
- `npm ci` and the renderer and Electron suites pass.
- The packaged engine starts and passes the smoke check.

**Acceptance criteria / DoD**:
- Every remaining dependency has a live importer.
- The sidecar's size and cold start are recorded against the baseline, and neither grows.

**Risks**: Low.

**Complexity**: **S**

---

## PRUNE-07 — The Docs

**Objective**: Fewer docs, each one true. Too many and irrelevant docs go, duplicates merge, and
every doc that remains describes the app as it is.

**User-visible result**: The user guide, README and developer docs match the app. A reader finds
one place for each subject.

**Dependencies**: PRUNE-02 to PRUNE-06 (so the docs describe settled code), and group J approved.

**Existing code reused**: The link check (`docs-check.yml`, lychee), and the user guide written
phase by phase since Phase 3.

**Design**:
- **Kept as the design record, not rewritten:** `docs/v1/` and `docs/ui-overhaul/adr/` (DEC-147).
- **Deleted, with git history as the archive:**
  - `docs/ui-overhaul/tracking/`, `docs/development/archive/`, and `docs/ui-overhaul`'s plans,
    phases and matrices for the Electron migration, which is done;
  - documents about retired subjects:
    - inCrate (`docs/feature/incrate-*`, `docs/incrate-spec.md`, `docs/features/incrate.md`);
    - Qt (`docs/guides/fix-pyside6-macos.md`, Qt screens in `docs/features/`);
    - the old updater (`update-system.md`, which is rewritten in Phase 16).
- **Merged, one subject one place:**
  - `docs/feature/` into `docs/features/`, or into the user guide where it describes what a user
    does;
  - `docs/roadmap.md` and `docs/future-features/` replaced by a link to `docs/v1/ROADMAP.md`;
  - `docs/how-to-run.md`, `docs/getting-started/` and `docs/guides/` folded into the user guide and
    the developer setup;
  - the 38 release documents folded into one release runbook for what the Electron release does
    today, plus the changelog, the incident and rollback runbooks, and key management. Policies
    stay in `docs/policy/`, with `PRIVACY_NOTICE.md` kept equal to its copy there.
- **Updated, every one that remains:**
  - `README.md`, `docs/README.md` and `docs/index.md`;
  - `docs/development/architecture.md` and `developer-setup.md`;
  - AGENTS.md's map and commands;
  - `scripts/README.md`;
  - the user guide's index and its pages' cross-links.

  Each is checked against the code, not against other docs.
- **A short map** in `docs/README.md`: where each kind of doc lives, and who it is for.

**Tests**:
- The link check passes over every remaining doc.
- No remaining doc names a deleted file, a deleted script or a Qt screen (`rg`).
- Every command written in the README, the developer setup and AGENTS.md is run once, as written, on
  Windows, and the ones CI can run on Linux and macOS are run there too.

**Acceptance criteria / DoD**:
- Every doc the audit marked is deleted, merged or updated as marked.
- The doc count and lines are recorded against the baseline.
- Every remaining command works as written.

**Risks**: Low. The risk is a merge that loses a fact. Every merged file's facts are checked
against the file it was merged into before the source is deleted.

**Complexity**: **M**

---

## PRUNE-08 — The Dead-Code Guard, and the Phase Comes Together

**Objective**: Keep the repository clean after this phase, and prove the phase changed nothing a
user relies on.

**User-visible result**: None.

**Dependencies**: PRUNE-02 to PRUNE-07.

**Design**:
- **`scripts/audit_dead_code.py --check`** runs in CI. It fails when:
  - a Python module is unreachable and is not a migration;
  - a script is referenced by nothing;
  - a renderer file is unreachable.

  It has an allowlist of named exceptions, each with its reason. The hook and AGENTS.md's tables
  name it.
- **The before and after**, against PRUNE-01's baseline:
  - files and lines, by area;
  - dependencies;
  - suite counts;
  - the sidecar's size and cold start;
  - the installer's size.
- **The changelog** gains one entry under Unreleased, stating what was removed and that nothing a
  user relies on changed.

**Tests**:
- The guard against fixtures: an unreachable module fails it, an allowlisted one passes, and a
  migration passes.

**Acceptance criteria / DoD**: The phase-level acceptance below.

**Risks**: Low.

**Complexity**: **S**

---

## Phase-level acceptance

1. The audit exists. Every group was approved or struck by the user before anything in it was
   deleted. *PRUNE-01.*
2. No PySide6 import remains, CI installs no Qt, and the widened guard holds it so. *PRUNE-02.*
3. No Python module, script or renderer file is unreachable except the migrations and the
   allowlist, and CI fails if one appears. *PRUNE-03 to PRUNE-05, PRUNE-08.*
4. Every remaining workflow builds, checks or releases something that exists, and passes on the
   branch. *PRUNE-04.*
5. Every remaining dependency has a live importer. The packaged engine is no larger and starts no
   slower than at the baseline. *PRUNE-06.*
6. Every remaining doc describes the app as it is. Links check clean, and every command in the
   README, developer setup and AGENTS.md runs as written. *PRUNE-07.*
7. Nothing a user relies on changed:
   - the CLI's flags and output;
   - the engine's routes and answers, held by the contract tests;
   - config keys;
   - the databases and migrations;
   - exports and set lists.

   Every suite passes at a count that differs from the baseline only by tests of removed code, each
   accounted for. *Every step.*
8. The Electron end-to-end suite passes. The Windows build is made with `npm run dist` and starts.
   CI's macOS and Linux builds pass. *PRUNE-08.*

## Deferred, with reasons

- **Refactoring live code.** This phase removes, it does not restructure. Untidy live code is
  noted in the audit for a later phase.
- **The new release pipeline and updater.** Phase 16 (DEC-145, DEC-129).
- **The website.** Phase 17. `gh-pages-root/` and its workflow stay until the new site deploys
  (DEC-139).
- **Rewriting the user guide for newcomers.** PRUNE-07 makes it accurate. Making it clear to new and
  non-technical users is Phase 14's work (DEC-132).
- **Untracked local files.** DEC-147 (Q-150).
