# CuePoint v1.0.0 — Phase 1: Foundation, Detailed Step Specifications

Status: **Draft step specs, design-only mode.** No code has been written from this document.
Implementation of any step below requires an explicit "Implement FOUNDATION-NN" instruction,
scoped to exactly that step, followed by tests, a completion report, and a stop before the next
step per the evolution spec's process.

This is the most important phase — every later phase (Library, Player, Organization, Clean,
Discover, Prepare, Intelligence) builds on it. Depends on Decision Rounds 1–2
(`DECISIONS.md`, DEC-001…DEC-019). Builds on the findings in `CURRENT_ARCHITECTURE.md` and
`GAP_ANALYSIS.md` — read those first; this document doesn't repeat their reasoning, only their
conclusions where relevant to a specific step.

## Sequencing

```
FOUNDATION-01 (Qt boundary + interfaces)  ─┐
FOUNDATION-15 (Qt updater removal)        ─┤  no dependencies — can run first, in either order
                                            │
FOUNDATION-02 (SQLite plumbing)            │
      │                                    │
      ▼                                    │
FOUNDATION-03 (migrations)                 │
      │                                    │
      ▼                                    │
FOUNDATION-04 (canonical Track model)      │
      │                                    │
      ▼                                    │
FOUNDATION-05 (repository layer)           │
      │                                    │
      ▼                                    │
FOUNDATION-06 (application service layer)  │
      │                                    │
      ├──────────────┬─────────────────────┘
      ▼              ▼
FOUNDATION-07    FOUNDATION-08
(job durability) (activity/history)

FOUNDATION-09 (settings cleanup)   — independent, any time after 06
FOUNDATION-10 (logging/diagnostics)— independent, best after 11 (DB in backups)
FOUNDATION-11 (backups)            — depends on 02
FOUNDATION-12 (test infrastructure)— independent, any time
FOUNDATION-13 (CI quality gates)   — independent, any time
FOUNDATION-14 (pixel icon set)     — independent, any time
```

---

## FOUNDATION-01 — Architecture Boundaries & Qt Cleanup ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. Both Qt violations removed, six interfaces added, guard widened, and
the bug verified fixed by simulating a Qt-free environment (the original code raised
`ImportError`; the new code works). Full suite green: 1816 unit + 313 integration passing,
zero new mypy errors vs. HEAD, `ruff check`/`format` clean on all changed files.

**What implementation revealed (worth recording):**

1. **`PrivacyService` has zero production call sites.** The engine's `privacy_api.py` calls
   `DataDeletionManager` directly and Electron handles exit-prefs itself. It was converted
   rather than deleted (deletion is out of this step's scope), but it is effectively dead code
   today — worth revisiting when the Settings UI is built in Phase 2.
2. **Deviation from this spec — `SecurityService` and `CheckpointService` got interfaces but
   were deliberately NOT registered in `bootstrap_services()`**, contrary to this step's
   original "registers the six services" wording. Reasons: `SecurityService` imports
   `cuepoint.update.security`, and registering it would add a new import edge, on every CLI and
   engine startup, into the exact package FOUNDATION-15 deletes; `CheckpointService` is
   constructed per-run with a `checkpoint_dir` argument by `cli_processor.py` and
   `processor_service.py`, so a zero-arg container registration would produce a differently
   configured instance and invite confusion. The four DI-appropriate services (Privacy,
   Onboarding, Inventory, IncrateDiscovery) are registered.
3. **Inventory/Discovery are dual-registered** (interface *and* concrete class), because
   `engine/incrate_api.py` resolves them by concrete class — interface-only registration would
   have broken inCrate at runtime.
4. **The guard was widened beyond `services/`** to also cover `core/`, `data/`, and `incrate/`,
   after verifying all three are already Qt-free. `utils/` (7 files) and `update/` (4 files)
   still contain Qt and are excluded, with that exclusion documented in the script.
5. **A now-dead mypy override was removed** — `[mypy-cuepoint.services.onboarding_service]
   disable_error_code = arg-type` existed only to suppress errors from the deleted
   `QSettings.value(..., type=bool)` calls; verified unnecessary after the rewrite.
6. **`test_onboarding_service.py` is no longer Qt-gated.** It was listed in `conftest.py`'s
   `_QT_TEST_PATH_FRAGMENTS`, so it had been silently skipped in CI ever since PySide6 left the
   default requirements. It now runs for real.

**Follow-up noted, not actioned here**: `ruff check src/` currently reports 5 pre-existing `F401`
unused-import errors in files untouched by this step (`engine/export_api.py`,
`engine/sync_tags_api.py`, three `tests/unit/engine/` files), and `ruff format --check` flags 26
other pre-existing files. Since `release-gates.yml` enforces both, that CI job is presumably
already red on this branch. Left for FOUNDATION-13 (CI quality gates) per this document's own
guidance that newly-surfaced violations become their own follow-up rather than blocking the step
that found them.

---

**Objective**: Close the two real Qt-boundary violations the audit found
(`services/privacy_service.py:16` and `services/onboarding_service.py:19`, both with unguarded
module-level `from PySide6.QtCore import QSettings`) by moving their persistence onto
`ConfigService` instead of Qt, and give the services that currently have no interface
(`InventoryService`, `IncrateDiscoveryService`, `PrivacyService`, `OnboardingService`,
`SecurityService`, `CheckpointService`) real ABCs in `services/interfaces.py`, matching the
existing pattern (`ILoggingService`, `IConfigService`, etc.).

**User-visible result**: None — invisible infrastructure step. CuePoint behaves identically.

**Why now**: This is a live bug today, not hypothetical — importing either service outside the
optional `requirements-qt.txt` environment raises `ImportError`, since PySide6 was dropped from
default `requirements.txt`. It also directly violates an AGENTS.md invariant that
`scripts/check_no_qt_in_core.py` doesn't catch (it doesn't scan `services/`). Fixing it first,
before any DI-heavy Foundation work builds on these services, avoids compounding the debt.

**Dependencies**: None — first step, or run alongside FOUNDATION-15.

**Existing code reused**: `services/interfaces.py`'s ABC pattern, `utils/di_container.py`,
`services/bootstrap.py::bootstrap_services()`, `services/config_service.py` (replaces `QSettings`
as the persistence backend for privacy/onboarding prefs).

**Architecture**: Define `IPrivacyService`, `IOnboardingService`, `IInventoryService`,
`IIncrateDiscoveryService`, `ISecurityService`, `ICheckpointService`. Replace `QSettings` calls in
`PrivacyService`/`OnboardingService` with `ConfigService.get/set` calls under a new
`privacy.*`/`onboarding.*` config namespace — this removes the Qt dependency entirely rather than
guarding it with a try/except, fully resolving the invariant instead of papering over it.

**Domain / Database changes**: None (no DB exists yet).

**Service changes**: As above. `bootstrap_services()` registers the six services against their
new interfaces.

**UI / Pixel design / Entry point / Navigation / Primary action / Exit / Player / Inspector**:
N/A — no UI surface touched.

**Threading**: None.

**Error handling**: `ConfigService`-backed settings get the same validation `AppConfig` already
enforces elsewhere; no new error paths.

**Empty state / Loading state**: N/A.

**Edge cases**: Users with existing Windows-registry `QSettings`-stored privacy/onboarding prefs
won't have them auto-migrated to YAML — those two specific low-stakes preference groups reset to
defaults once. Documented, not silently handled.

**Performance**: Negligible.

**Security / privacy**: Strictly improves robustness — removes a hard runtime dependency on
PySide6 from a headless/Electron-sidecar code path that shouldn't need it.

**Tests**: Unit tests for the six new interface implementations. Extend
`scripts/check_no_qt_in_core.py`'s `CORE_PREFIXES` to include `"services/"`, and add/extend its
own test coverage to assert this (currently the script scans `engine/, cli/, compat/, models/` +
`gui_app.py` only).

**Migration**: None (no DB yet).

**Backward compatibility**: Windows-registry `QSettings` privacy/onboarding prefs reset once;
call out in `docs/release/CHANGELOG.md` under `Unreleased`.

**Documentation**: `CHANGELOG.md` entry.

**Acceptance criteria / Definition of Done**: `check_no_qt_in_core.py` passes with `services/`
included and fails if a Qt import is reintroduced there; full test suite green; `grep -r PySide6
src/cuepoint/services/` returns nothing.

**Risks**: Low — small, mechanical, well-understood change.

**Complexity**: **S**

**PR breakdown**: Single PR.

---

## FOUNDATION-02 — Persistent Database Infrastructure

**Objective**: Stand up the SQLite engine and connection-management plumbing CuePoint's
persistent library will live on (per DEC-001). No application schema yet — that's
FOUNDATION-03/04. This step delivers: DB file location resolution
(`~/.cuepoint/cuepoint.db`, cross-platform), a connection-factory/singleton with WAL mode and
`PRAGMA foreign_keys=ON`, and a `DatabaseService` (or `core/db.py`) exposed through the DI
container like every other service.

**User-visible result**: None directly — but a `cuepoint.db` file now appears at
`~/.cuepoint/` on first run.

**Why now**: The single biggest gap the audit identified (`GAP_ANALYSIS.md` §A) — nearly every
later Foundation and Phase-3-through-10 capability needs a durable store that doesn't exist today
outside inCrate's narrowly-scoped inventory DB.

**Dependencies**: None architecturally, but should follow FOUNDATION-01 so the DI/interface
pattern it establishes is consistent.

**Existing code reused**: `incrate/inventory_db.py` is the one proven in-repo SQLite pattern
(busy-timeout handling, row-factory conventions, upsert style) — study and reuse its conventions
rather than inventing new ones. `utils/di_container.py`, `services/bootstrap.py`.

**Architecture**: New `services/database_service.py` implementing a new `IDatabaseService`,
providing `get_connection()` (thread-local or pooled, matching the codebase's existing
thread-based concurrency model — no asyncio, per the audit) and `execute_script()` for migrations.
WAL mode chosen specifically because the audit found the whole app is thread-heavy
(`ThreadPoolExecutor` everywhere) — WAL supports concurrent readers without blocking writers,
which matters once the engine's job threads and any future UI-driven reads overlap.

**Domain / Database changes**: Creates the DB file and connection infrastructure only; no tables
yet.

**Service changes**: New `IDatabaseService`/`DatabaseService`, registered in `bootstrap_services()`.

**UI / Pixel design / Entry point / Navigation / Primary action / Exit / Player / Inspector**: N/A.

**Threading**: Connection handling must be safe under the existing `ThreadingHTTPServer` +
per-job-thread model (`engine/jobs.py`) — verify SQLite's threading mode
(`check_same_thread=False` with appropriate locking, or thread-local connections) against how
`JobStore` and future repositories will call it concurrently.

**Error handling**: Corrupt/unreadable DB file at startup should fail loudly with a clear,
non-technical message (per target spec §60's error-UX philosophy) rather than a raw stack trace —
this is the first point in the codebase where "the user's persistent data might be broken" becomes
a real scenario to design for.

**Empty state / Loading state**: N/A for this step (no schema/UI yet).

**Edge cases**: First-run directory creation (`~/.cuepoint/` may not exist yet — reuse whatever
pattern `ConfigService`/`~/.cuepoint/config.yaml` already uses for this); disk-full during DB
creation; a `~/.cuepoint/` path containing non-ASCII characters (Unicode path handling is already
a named risk area in the target spec's own risk register).

**Performance**: WAL mode + connection reuse should be verified under a synthetic
several-thousand-row smoke test, not just correctness-tested, given the target's eventual
1k/10k/50k-track performance requirements (target spec §65) — early verification here is cheap
insurance.

**Security / privacy**: The DB will eventually hold the user's full library and CuePoint-only
data (tags, notes, ratings) — treat the file itself as sensitive user data from this step onward
(matches AGENTS.md's "treat Rekordbox/audio files, tags, exports, history, logs, and caches as
user data" invariant, extended to the new DB file).

**Tests**: Connection creation across a clean environment; WAL mode verification; a concurrent-
access smoke test (multiple threads reading/writing simultaneously, matching the audit's finding
that everything today is thread-based); corrupt-file startup behavior.

**Migration**: N/A yet (FOUNDATION-03 owns migrations).

**Backward compatibility**: New file, no existing state to preserve.

**Documentation**: `docs/development/architecture.md` gets a short "Persistence" section pointing
at the new `DatabaseService`.

**Acceptance criteria / DoD**: A new, empty, WAL-mode `cuepoint.db` is created on first run at the
correct path on both Windows and macOS; concurrent-access test passes; full test suite green.

**Risks**: Medium — this is genuinely new infrastructure with no direct precedent beyond
inCrate's narrower use, and cross-platform path/threading behavior needs real verification, not
assumption.

**Complexity**: **M**

**PR breakdown**: Single PR (connection plumbing is small enough not to need splitting).

---

## FOUNDATION-03 — Schema Migration Infrastructure

**Objective**: Deliver versioned, numbered schema migrations for the new `cuepoint.db`, with a
`schema_version` tracking table and an apply-on-startup routine wired into `DatabaseService`
(FOUNDATION-02), satisfying the target spec's explicit requirement that a CuePoint update must
never require deleting the user's database.

**Important existing-code note**: The audit found `services/schema_migration_service.py` and a
CLI `migrate` subcommand (`src/main.py` → `schema_migration.run_migrate`) **already exist** — but
their current purpose (per `docs/policy/output-schema-versioning.md`) appears to be CSV/JSON
*output*-schema versioning, not database schema migration. **Verifying the actual scope of
`SchemaMigrationService` is the first task of this step**, before deciding whether to extend it or
build a parallel, differently-scoped migration runner following the same numbered-version
convention it already establishes. Don't assume either way going in.

**User-visible result**: None directly.

**Why now**: Every subsequent schema-bearing step (FOUNDATION-04 onward) needs this in place
first, or its own schema becomes unmigratable later.

**Dependencies**: FOUNDATION-02.

**Existing code reused**: `services/schema_migration_service.py`'s versioning convention
(pending the verification above), `DatabaseService.execute_script()` from FOUNDATION-02.

**Architecture**: A `migrations/` directory of numbered `NNNN_description.sql` files; a
`schema_version` table in `cuepoint.db`; `DatabaseService` (or a new `MigrationRunner`) applies
any pending migrations in order at startup, transactionally, before any other DB access occurs.

**Domain / Database changes**: Introduces the migration mechanism itself; the first real
migration (`0001_initial_schema.sql`, defining actual tables) is FOUNDATION-04's job, not this
step's — this step should ship with an empty/no-op initial migration to prove the mechanism works
end-to-end.

**Service changes**: Possibly extends `SchemaMigrationService`, or adds a sibling
`IDbMigrationService` — decided during implementation per the verification task above.

**Tests**: Applying migrations 1→N on a fresh DB; applying a partial set (simulating an interrupted
prior run) and confirming idempotent resume; a deliberately-failing migration rolls back cleanly
and doesn't leave `schema_version` in an inconsistent state.

**Edge cases / Error handling**: A migration failing partway through must not corrupt the DB —
wrap each migration in its own transaction. A DB with a `schema_version` newer than the running
app's known migrations (e.g. user downgraded CuePoint) should fail loudly with a clear message,
not silently attempt to run.

**Backward compatibility**: This is the mechanism that guarantees backward compatibility for
every future schema change — get it right here rather than retrofitting later.

**Acceptance criteria / DoD**: A migration can be added, applied, and verified end-to-end in a
test without touching a real user's DB; interrupted-migration resume test passes; rollback test
passes.

**Risks**: Medium-high — getting migration semantics wrong is expensive to fix later once real
user data exists on top of it. Worth extra test-writing time relative to its size.

**Complexity**: **M**

**PR breakdown**: Single PR, but expect the most scrutiny/review time of any Foundation step
relative to its line count.

---

## FOUNDATION-04 — Core `Track` Domain Model

**Objective**: Two problems solved together: (1) unify the two parallel `TrackResult` dataclasses
(`models/result.py` vs `compat/gui_types.py`) that the audit found coexisting under the same name
with different shapes; (2) introduce the new **persistent** `Track` entity (distinct from the
ephemeral per-run matching-pipeline `TrackResult`) with DEC-002's TrackID-plus-normalized-path
identity resolution built in from the start.

**User-visible result**: None directly — but this is the entity Collections, Tags, Ratings, and
every later Library feature attaches to.

**Why now**: Blocks FOUNDATION-05 (repositories need a settled domain shape) and every later
phase that touches "a track" as a persistent concept.

**Dependencies**: FOUNDATION-03 (needs schema migrations to exist to define the `tracks` table).

**Existing code reused**: `models/track.py::Track` (the existing lightweight dataclass) as a
starting shape; `models/result.py::TrackResult` chosen as canonical over `compat/gui_types.py`'s
duplicate (richer — has `candidates: List[BeatportCandidate]` vs the compat version's
`List[Dict]`); `models/compat.py`'s existing conversion-shim pattern as the model for how the new
persistent `Track` relates to the ephemeral pipeline types.

**Architecture**: `compat/gui_types.py::TrackResult` becomes a re-export/alias of
`models/result.py::TrackResult` instead of a second dataclass definition; `engine/jobs.py` (which
today imports from `compat.gui_types`) keeps working unmodified through the alias, with a
follow-up cleanup (not blocking this step) to eventually import directly from `models.result`.
New: a persistent `Track` entity (id, `rekordbox_track_id`, `file_path`, `normalized_path`,
title, artist, album, bpm, key, year, genre, label, `source_status`, `created_at`, `updated_at`)
in a new `models/domain/` (or similar) package — explicitly distinct from the matching pipeline's
ephemeral `Track`/`TrackResult`, which continue to represent a single run's input/output, not a
library entity.

**Domain changes**: As above — this is the step's primary content.

**Database changes**: First real migration (`0001_initial_schema.sql` or similar): `tracks` table
with a unique index on `rekordbox_track_id` and a separate index on `normalized_path` (supporting
DEC-002's fallback lookup).

**Service changes**: None yet (FOUNDATION-05/06 build on this).

**Tests**: Path-fallback identity resolution as unit tests with concrete fixtures — same
`TrackID`, different path → same track; different `TrackID`, same normalized path → re-linked-
identity event (per DEC-002); existing `TrackResult`-consuming tests (engine, processor_service)
continue passing unmodified against the alias.

**Edge cases**: Path normalization across Windows/macOS path separators and case-sensitivity
differences (a named risk in the target spec's own risk register) needs explicit test coverage,
not just Windows-only verification given the audit found macOS is also a CI-tested target.

**Backward compatibility**: The `compat/gui_types.TrackResult` alias is exactly what makes this
non-breaking for every existing call site — verify via the full existing test suite passing
unmodified, not just new tests passing.

**Acceptance criteria / DoD**: `grep -rn "class TrackResult" src/cuepoint/` returns exactly one
real definition; full existing test suite green with zero call-site changes required outside the
alias itself; new `Track` entity + migration + identity-resolution tests all pass.

**Risks**: Medium — touches many call sites indirectly (engine/jobs.py, processor_service.py,
output_writer.py, server.py) even though the alias approach is designed to make those changes
invisible; worth a careful full-suite run, not just targeted tests.

**Complexity**: **L**

**PR breakdown**: Two PRs — (1) the `TrackResult` unification/alias alone, verified against the
full existing suite in isolation; (2) the new persistent `Track` entity + migration + identity
tests, once (1) is merged and stable.

---

## FOUNDATION-05 — Repository / Data Access Layer

**Objective**: Introduce repository classes as the single place SQL queries against the new DB
live, enforcing the target spec's "no raw SQL scattered through services/widgets" principle
(§77) from the start rather than retrofitting it later.

**User-visible result**: None.

**Dependencies**: FOUNDATION-04.

**Existing code reused**: `incrate/inventory_db.py`'s query functions are the closest existing
analog (parameterized queries, upsert patterns) — generalize their conventions rather than
inventing a new style.

**Architecture**: New `TrackRepository` (and a thin `PlaylistRepository` stub, even though full
playlist persistence is Phase 3's job) in a new `persistence/repositories/` (or
`data/repositories/`) module, built on `IDatabaseService` (FOUNDATION-02). `TrackRepository`
exposes CRUD plus the DEC-002 identity-resolution lookup (`find_by_track_id_or_path()`).

**Service changes**: None yet.

**Tests**: Full CRUD + the identity-resolution lookup, each test run against a temporary SQLite
DB (never the real user DB — matches the existing "never use the real user database in tests"
testing invariant already followed elsewhere in the suite).

**Performance**: Basic query-plan sanity check (e.g. `EXPLAIN QUERY PLAN` on the
`normalized_path` lookup uses the index from FOUNDATION-04's migration) — cheap to verify now,
expensive to discover missing at 50k-track scale later.

**Acceptance criteria / DoD**: `TrackRepository` CRUD and identity-lookup fully covered by tests
against a temp DB; no other module executes raw SQL against `cuepoint.db` (only the repository
layer does).

**Risks**: Low — well-scoped, small surface area.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## FOUNDATION-06 — Application Service Layer

**Objective**: Introduce a `LibraryService` (or equivalently named) as the orchestration layer
between repositories and future UI/engine-API consumers — the DI-registered service that
Phase 3 (Library) and Phase 6 (Organization) will actually call, following the exact existing
`IProcessorService`/`bootstrap_services()` wiring pattern rather than inventing a new style.

**User-visible result**: None directly.

**Dependencies**: FOUNDATION-05.

**Existing code reused**: `services/interfaces.py`, `services/bootstrap.py`,
`utils/di_container.py` — this step is explicitly about following the established pattern, not
introducing a new architectural style.

**Architecture**: `ILibraryService`/`LibraryService`, registered in `bootstrap_services()`,
wrapping `TrackRepository`. No real import/refresh business logic yet — that's Phase 3.

**Tests**: A placeholder method (e.g. `get_track(id)`) proven end-to-end through the DI container,
resolved the same way `IProcessorService` is resolved today in both `src/main.py` and
`engine/jobs.py::_ensure_services()`.

**Acceptance criteria / DoD**: `ILibraryService` resolves correctly from both CLI and engine
bootstrap paths; a round-trip test (create via repository → read via service) passes.

**Risks**: Low.

**Complexity**: **S**

**PR breakdown**: Single PR.

---

## FOUNDATION-07 — Background Job Architecture

**Objective**: Generalize `engine/jobs.py::JobStore` beyond match-only jobs, and persist job
records (status, progress, timestamps — not full resumability, per DEC-007) to the new DB.

**User-visible result**: None directly yet — but this is what later lets the Activity feed
(FOUNDATION-08) show "this import job was interrupted" instead of jobs silently vanishing on an
engine restart, which is today's actual behavior.

**Dependencies**: FOUNDATION-05 (needs a `JobRepository`), conceptually pairs with FOUNDATION-08.

**Existing code reused**: `JobStore`, `JobState` enum, `MatchJob` dataclass, the cooperative-
cancellation `ProcessingController` pattern — **extended, not replaced**; the audit found this
pattern already works well for match jobs, and today's SSE polling (`iter_job_events`) behavior
must not regress.

**Architecture**: New `jobs` table (id, type, state, progress, error, `created_at`, `updated_at`,
payload — `type` is a discriminator so future import/artwork/waveform/analysis job kinds reuse
this one table rather than each needing a bespoke store). `JobStore`'s in-memory dict becomes a
write-through cache in front of a new `JobRepository`, not a full rearchitecture — chosen
specifically to avoid regressing today's 300ms-interval SSE/polling performance
(`engine/job_events.py`, `hooks/useMatchJob.ts`'s polling fallback).

**Domain / Database changes**: New `jobs` table via a migration.

**Service changes**: `JobStore` gains a persistence-backed constructor path.

**Threading**: Must remain compatible with the existing thread-per-job model and
`ThreadingHTTPServer` — no change to the concurrency model itself, only to where state lives.

**Tests**: **Every existing match-job test in `src/tests/unit/engine/` must still pass
unmodified** — this is a hard regression bar, not just a nice-to-have. New tests: a job record
survives a simulated engine restart (`JobStore` re-hydrated from the DB); write-through cache
consistency under concurrent access.

**Performance**: SSE/status-polling latency must not measurably regress — worth a before/after
timing comparison in the PR description, not just "tests pass."

**Acceptance criteria / DoD**: Full existing engine test suite green with zero behavioral change
to match jobs; new job-record-survives-restart test passes; SSE polling latency unchanged within
noise.

**Risks**: Medium — regressing a working, well-tested subsystem (13 existing engine test files)
is the main risk; mitigate by keeping the in-memory path as the hot path and the DB as a durable
mirror, not the other way around.

**Complexity**: **M**

**PR breakdown**: Single PR, but should include an explicit before/after performance note.

---

## FOUNDATION-08 — Activity / Event Architecture

**Objective**: Build the queryable Activity feed (target spec §54) and the per-field
change-history log with manual revert (DEC-008), both backed by the new DB.

**User-visible result**: None yet in this step (no UI) — but the data model this step defines is
what target spec §54 (Activity) and §55 (Track History) will render against in Phase 2/4.

**Dependencies**: FOUNDATION-05, pairs with FOUNDATION-07.

**Existing code reused**: The append-only audit-trail philosophy already proven in
`core/matcher.py`'s `candidates_log` and `services/integrity_service.py`'s `*_audit.jsonl`
writing — same philosophy, moving from ephemeral per-run files to a durable DB table.

**Architecture**: `activity_events` table (id, type, summary, `detail_json`, `created_at`) and
`track_history` table (id, `track_id`, field, `old_value`, `new_value`, source
[rekordbox/beatport/cuepoint], `changed_at`). Reverting a field reads `track_history` and writes a
**new** row restoring the prior value plus a new Activity event describing the revert — the log
itself is append-only and is never mutated or deleted, matching target spec §4's explainability
philosophy and the existing audit-trail precedent.

**Domain / Database changes**: The two tables above, via migration.

**Service changes**: A small `ActivityService`/`IActivityService` for writing events; track-field
writers (introduced in later phases, not this step) will call into it.

**Tests**: Writing a field change produces both an Activity event and a `track_history` row;
reverting restores the prior value and logs the revert as a new entry (never a delete/mutation of
prior rows).

**Acceptance criteria / DoD**: Append-only invariant is enforced and tested (no UPDATE/DELETE
statements against `track_history` or `activity_events` anywhere in the codebase — worth a
grep-based regression test, not just a code-review convention).

**Risks**: Low-medium — schema design here should be conservative since target spec §54/§55 will
build UI directly on it in Phase 2/4; getting the shape wrong means a later migration, not just a
UI change.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## FOUNDATION-09 — Settings Architecture Cleanup

**Objective**: Pay down the dual `AppConfig`/flat-`SETTINGS` surface the audit identified as
acknowledged incomplete-migration debt — migrate remaining flat-dict-only settings into the
structured `AppConfig` tree, keeping the legacy flat-dict fallback path reachable **only** for the
three settings `docs/policy/deprecation-schedule.md` already documents as supported indefinitely
(`DDG_ENABLED`, `DDG_TIMEOUT_SEC`, `DDG_PREFLIGHT_TIMEOUT_SEC`).

**User-visible result**: None — CLI flags and config file keys behave identically; only internal
representation changes.

**Dependencies**: None strictly, but logically follows FOUNDATION-06 since this is a
lower-priority cleanup relative to unblocking the DB-dependent chain.

**Existing code reused**: `services/config_service.py`'s existing `_map_to_legacy_key()`
mechanism — this step shrinks its scope rather than replacing the mechanism.

**Tests**: Every existing CLI flag / config-file key continues resolving to the same effective
value (regression tests against the current `--myargs`/`--fast`/`--turbo` preset behavior, since
those are the heaviest users of the flat `SETTINGS` dict today).

**Backward compatibility**: This is explicitly a compatibility-preserving refactor — no config
key, CLI flag, or output shape changes, only where the value lives internally.

**Acceptance criteria / DoD**: `_map_to_legacy_key()`'s reachable key set matches exactly the
three documented indefinitely-supported keys; full CLI preset test coverage green.

**Risks**: Low-medium — the presets (`--myargs` etc.) each independently hardcode many
`config_service.set()` calls, so this touches a lot of call sites even though the external
behavior shouldn't change; regression-test coverage matters more than usual here.

**Complexity**: **S/M**

**PR breakdown**: Single PR.

---

## FOUNDATION-10 — Logging / Diagnostics Alignment

**Objective**: Light-touch audit and adjustment of the already-working `LoggingService`,
support-bundle export, and log-viewer (already wired to Electron via `/api/v1/logs/*` and
`/api/v1/support/bundle`) against two new realities: the DB now exists (FOUNDATION-02) and holds
sensitive user data, and the Activity log now exists (FOUNDATION-08) and must stay clearly
distinguished from debug logs, per target spec §54 ("Activity is user-readable. Debug logs remain
separate.").

**User-visible result**: Support bundles become more useful for diagnosing real bugs (can
optionally include DB state), with an explicit privacy tradeoff to design carefully, not assume.

**Dependencies**: FOUNDATION-02, FOUNDATION-08 (or at least their schemas being settled).

**Existing code reused**: `LoggingService`, `services/support_bundle` machinery, `engine/logs_api.py`,
`engine/support_bundle_api.py` — audited and extended, not rebuilt.

**Open item flagged, not resolved by this spec**: Whether/how the DB is included in support
bundles needs an explicit privacy review against `docs/policy/privacy-notice.md` and
`docs/policy/data-processing-notice.md` — likely a redacted/sanitized export rather than the raw
file, but the exact shape should be decided during implementation with those docs in hand, not
guessed here.

**Acceptance criteria / DoD**: Support bundle export either includes a clearly-labeled,
privacy-reviewed DB export, or explicitly documents why it doesn't yet; Activity events and debug
logs remain visibly distinct wherever both are surfaced.

**Risks**: Low technically, medium on the privacy-review dimension — don't rush this past a real
look at the existing privacy docs.

**Complexity**: **S**

**PR breakdown**: Single PR.

---

## FOUNDATION-11 — Backup Infrastructure

**Objective**: Automatic backup on launch (if the DB changed since the last backup), retention
cap, plus manual "Back Up Now"/"Restore" — per DEC-009.

**User-visible result**: First real user-facing Foundation output — a Settings-reachable backup/
restore control (even if Settings UI itself is minimal/placeholder at this point in the roadmap,
per Phase 2's shell work; this step can ship the engine-side capability ahead of a polished UI).

**Dependencies**: FOUNDATION-02.

**Existing code reused**: `utils/file_safety.py::SafeFileWriter`'s atomic-write/backup
conventions as the file-copy mechanism — extended to whole-DB-file backups, not reinvented.

**Architecture**: Backups stored as timestamped copies (`~/.cuepoint/backups/cuepoint-
YYYYMMDD-HHMMSS.db`); retention count configurable via a new `BackupConfig` sub-config, following
`AppConfig`'s existing nested-config pattern. New `/api/v1/backups` endpoints (list/create/
restore) as `engine/backup_api.py`, following the existing per-domain `*_api.py` module pattern.

**Domain / Database changes**: No schema change to `cuepoint.db` itself — backups are whole-file
copies.

**Threading**: Backup-on-launch should run off the main request-handling path (a background
thread or job, consistent with FOUNDATION-07's job model) so it never blocks app startup.

**Error handling**: A failed backup (disk full, permissions) should warn, not block app startup —
matches target spec §60's non-blocking error-UX philosophy.

**Tests**: Kill-mid-write-and-restart doesn't corrupt the live DB (WAL mode from FOUNDATION-02
already protects this at the SQLite level — verify that specifically, don't just assume it);
retention cap correctly prunes old backups; restore-flow round-trip test.

**Backward compatibility**: N/A (new capability).

**Acceptance criteria / DoD**: Automatic backup fires on launch when the DB changed; retention cap
enforced; manual backup/restore both work and are covered by tests; restore test proves data
integrity end-to-end (write → backup → corrupt/replace → restore → verify).

**Risks**: Medium — restore is the one operation in Foundation with real data-loss blast radius
if implemented carelessly; test the failure paths (restoring a corrupt backup, restoring over a
DB with unsaved changes) explicitly, not just the happy path.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## FOUNDATION-12 — Test Infrastructure

**Objective**: Close the audit's identified coverage gaps as an infrastructure investment before
the UI surface grows in Phase 2 onward: renderer component-testing setup (currently zero
`.test.tsx` files / no Testing Library usage exists at all), the four zero-coverage `incrate/`
modules (`beatport_oauth.py`, `beatport_playlist_browser.py` — 402 lines, `models.py`,
`past_results_storage.py`), and a real regression-test directory practice (`src/tests/
regression/` currently holds just one example file, despite AGENTS.md's "add ... a regression
test for bugs" instruction implying an ongoing practice).

**User-visible result**: None directly.

**Dependencies**: None — can run any time, independent of the DB-dependent chain.

**Existing code reused**: Existing Vitest config (`apps/desktop-electron/renderer`) gets Testing
Library added, not replaced; existing `pytest.ini` marker conventions extended, not changed.

**Tests** (this step *is* tests): One real component test as a template (cheapest component —
`Badge` or `Button` — proving the renderer testing setup works end-to-end, not just configured);
baseline unit tests for the four listed `incrate/` modules; one additional regression-test example
beyond the current lone file, with a documented convention (where it should live, naming, what
counts as "regression-worthy") referenced from `AGENTS.md` or a short `src/tests/regression/
README.md`.

**Acceptance criteria / DoD**: `npm test` in the renderer runs at least one component-level test
that would fail if the component broke; the four `incrate/` modules each have baseline coverage;
a documented regression-test convention exists and is referenced from a discoverable location.

**Risks**: Low.

**Complexity**: **M**

**PR breakdown**: Could split into two PRs (renderer testing setup; Python coverage gaps) if
preferred at implementation time — not required to be one PR.

---

## FOUNDATION-13 — CI Quality Gates

**Objective**: Close the audit's CI gaps: ensure a plain feature PR is actually gated by the
Python test suite (today `test.yml` triggers on push only, not `pull_request`); resolve the
soft-failed lint/mypy/security duplication in `test.yml` now that `release-gates.yml` already
enforces `ruff check`/`ruff format --check` properly (either make `test.yml`'s checks real gates
or remove the redundant soft copies to avoid contradictory signal — an implementation-time
engineering call, not a product decision); fix `release-gates.yml`'s effectively-no-op
`build-gates` job (`continue-on-error: true` + a `|| echo "Build script not found"` fallback).

**User-visible result**: None directly — but a deliberately-broken PR should now actually be
blocked without needing a push to `main`/`feature` first.

**Dependencies**: None — independent of the DB-dependent chain, can run any time.

**Existing code reused**: The workflow files themselves — this is a tightening pass, not a
rewrite. Also worth folding in during the same PR (adjacent, not a new decision): the
`actions/checkout@v3`/`setup-python@v4` version drift the audit found in `release-gates.yml`
relative to other workflows' `@v4`/`@v6`.

**Tests**: A deliberately-broken test/PR-branch scenario should demonstrably fail CI at the PR
stage (verify this manually once, document the verification in the PR description — CI-of-CI
testing is inherently a bit manual).

**Acceptance criteria / DoD**: A PR with a failing test or lint violation is blocked before merge,
without requiring a push to `main`/`feature`; `build-gates` either does something real or is
removed rather than left as a no-op with misleading green status.

**Risks**: Medium — tightening CI can surface a backlog of previously-uncaught lint/type issues
across the whole codebase; scope this step to the gate mechanism itself, and treat any newly-
surfaced violations as a separate follow-up rather than blocking this step on fixing all of them.

**Complexity**: **M**

**PR breakdown**: Single PR for the gate mechanism; any newly-surfaced lint/type violations become
their own follow-up PR(s), tracked separately rather than blocking this step.

---

## FOUNDATION-14 — Pixel-Art Design System Foundation

**Objective**: Per DEC-010, build real pixel sprite icons for the 5–10 highest-visibility
recurring icons — nav items (Home/Library/Clean/Discover/Prepare/Activity, anticipating Phase 2's
shell nav), transport controls (play/pause/next/previous, anticipating Phase 5's player), and
track-status badges (matched/unmatched/needs-review) — using the previously-specced-but-never-
built 9-slice/Aseprite pipeline (`docs/ui-overhaul/phase-1-pixel-design-system.md`, DS-3),
replacing `ToolbarIcon.tsx`'s current Unicode-glyph rendering for just this set.

**User-visible result**: The first visible product change of Phase 1 — a handful of real pixel
icons in place of Unicode glyphs, wherever they're already used today (the current toolbar/nav).

**Dependencies**: None technically, though nav-item icons anticipate Phase 2 and transport icons
anticipate Phase 5 — building them now is a bet those icon sets won't change shape, which seems
safe given the target nav (target spec §7) is already well-specified.

**Existing code reused**: The entire existing token system (`tokens.css`, all 5 theme files) —
**no changes to colors/spacing/borders**, this step only adds icon assets and the rendering path
for them.

**Pixel-art design impact**: This *is* the design-system content of this step — see
`PIXEL_DESIGN_SYSTEM.md` for the full current-state audit this builds on.

**UI changes**: `ToolbarIcon.tsx` gains a sprite-rendering path (alongside, not replacing, the
glyph path — used only for the new icon set) per the 9-slice pipeline.

**Tests**: Visual verification across all 5 existing themes and all 3 scale levels (1×/2×/3×) —
`image-rendering: pixelated` is already set globally per the audit, but this is the first time
it'll actually apply to real bitmap content, so verify it renders crisp (not blurred) at each
scale, not just assume the existing CSS property handles it correctly.

**Acceptance criteria / DoD**: The chosen icon set renders correctly, crisply, across all 5 themes
and 3 scale levels; existing glyph-based icons elsewhere are unaffected.

**Risks**: Low architecturally; the main risk is asset-production time/quality, not code risk.

**Complexity**: **M**

**PR breakdown**: Single PR once assets are produced (asset production itself may take longer
than the code integration).

---

## FOUNDATION-15 — Qt Updater Removal ✅ IMPLEMENTED 2026-09-01 (scope amended)

**Outcome**: Complete, but **narrower than this spec assumed**. The spec (and DEC-019) described
`src/cuepoint/update/` as a fully-orphaned Qt stack. It wasn't: only 4 of 12 files touched Qt, and
the rest is Qt-free logic actively used by release tooling, `SecurityService`, and two passing
test files. See the DEC-019 amendment in `DECISIONS.md`.

**Removed** (12 files): `update_manager.py`, `update_ui.py`, `update_downloader.py`,
`update_installer.py` (Qt-free, but only reachable from the deleted UI and dependent on the
deleted launchers), `update_launcher.py`/`.bat`/`.ps1`, and 5 obsolete GUI-driving scripts
(`scripts/test_update_dialog_comprehensive.py`, `test_update_dialog_download_button.py`,
`test_update_dialog_interactive.py`, `test_update_download_install.py`,
`test_update_integration.py`).

**Kept**: `update_checker.py`, `version_utils.py`, `security.py`, `signature_verifier.py`,
`update_preferences.py` — the appcast/versioning/verification logic that
`scripts/inspect_appcast.py`, `scripts/generate_appcast.py`, `scripts/test_pre_release.py`,
`services/security_service.py` and `src/tests/unit/update/` depend on.

**Also**: `update/__init__.py` rewritten (dropped deleted exports, documents current status);
`docs/features/update-system.md` rewritten to state CuePoint ships without in-app updates instead
of describing a flow that could not run; `docs/release/known-issues.md` entry reworded from "update
fails on some Windows 10 configurations" to "no in-app updates" with the real cause; two stale
`mypy.ini` sections removed.

**Coverage note**: 5 tests were removed with `UpdateManager` (the "effective channel" rule that a
test build must fetch the test feed regardless of user preference). That rule is a real past bug
fix — it is now documented in `docs/features/update-system.md` and in the remaining test file's
docstring so a future Electron-native updater reimplements it rather than rediscovering it.

**Bonus**: `update/` is now Qt-free, so it was added to `check_no_qt_in_core.py`'s scanned
prefixes. Only `utils/` (7 files, optional try-guarded imports with headless fallbacks) remains
outside the guard.

**Verification**: 1811 unit (= 1816 minus the 5 deliberately removed) + 313 integration passing;
`ruff check`/`format` clean; Qt guard passes across 9 packages; engine health smoke and version
coupling pass; no mypy errors in any changed file.

---

**Objective**: Per DEC-019, remove the orphaned Qt/Sparkle update subsystem
(`src/cuepoint/update/`, ~8 files) that the audit found disconnected from the Electron product,
with a known issue already logged against it for a feature that doesn't actually run.

**User-visible result**: None — the feature was already non-functional in the shipped app; this
removes dead code and stale documentation, not working functionality.

**Dependencies**: None — independent, can run any time, alongside or before FOUNDATION-01.

**Existing code reused**: N/A — this step deletes code.

**Scope**:
- Delete `src/cuepoint/update/` (all ~8 files) and its in-package test file
  (`src/cuepoint/update/test_update_system.py`, which the audit noted lives inside the package
  rather than under `src/tests/` — itself a small pre-existing test-organization anomaly resolved
  by this deletion).
- Delete `src/tests/unit/update/`.
- Update `docs/features/update-system.md` to state auto-update was removed pending a future
  Electron-native rebuild (not yet scheduled), rather than describing dead Qt functionality as if
  it works.
- Remove the "Update fails on some Windows 10 configurations" entry from
  `docs/release/known-issues.md` (the issue no longer exists because the feature no longer
  exists — not because it was fixed; word the removal accordingly).
- Verify and clean up any `requirements-qt.txt` / `scripts/run_tests.py --with-qt` references to
  the deleted update tests.
- Verify `services/security_service.py`'s reference to `update.security.FeedIntegrityVerifier`
  (found in the audit) — if `SecurityService` depends on anything in the deleted module, that
  dependency needs resolving as part of this step, not left broken.

**Tests**: `grep -rn "cuepoint.update"` and `grep -rn "PySide6"` (outside `requirements-qt.txt`-
gated legacy UI test material, which stays per AGENTS.md's carve-out) return nothing; full test
suite green after deletion.

**Backward compatibility**: N/A — removing non-functional code.

**Documentation**: `docs/features/update-system.md`, `docs/release/known-issues.md`,
`docs/release/CHANGELOG.md` (under `Unreleased`).

**Acceptance criteria / DoD**: No references to the deleted module remain anywhere in the
codebase or its CI configuration; `services/security_service.py`'s dependency (if any) is
resolved; full test suite green; docs updated, not just code.

**Risks**: Low — the audit already confirmed this code has no live callers in the Electron
product path; the one thing worth double-checking during implementation is the
`SecurityService`/`FeedIntegrityVerifier` reference flagged above.

**Complexity**: **S**

**PR breakdown**: Single PR.

---

## Recommended First Step

**FOUNDATION-01**, for three reasons: it fixes a real, live bug (the `ImportError` risk in
`services/privacy_service.py`/`onboarding_service.py`), it closes an AGENTS.md invariant violation
that's currently silently unenforced, and it has zero dependencies while establishing the
interface pattern every later DI-heavy step will follow. It's also genuinely small (**S**
complexity) — a good first "Implement → test → verify → stop" cycle to confirm the working
rhythm before FOUNDATION-02 opens the larger, higher-risk database-infrastructure work.

**FOUNDATION-15** is an equally valid alternative first step (also **S**, also zero dependencies,
also a real cleanup) if you'd rather clear the dead-code item before starting on anything
database-related — either order works; they don't depend on each other.

The critical-path step that actually unblocks the rest of Foundation is **FOUNDATION-02**, so
whichever small step goes first, that should follow soon after rather than being deferred.

Waiting for an explicit "Implement FOUNDATION-NN" before touching any code.
