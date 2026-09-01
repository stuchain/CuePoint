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

## FOUNDATION-02 — Persistent Database Infrastructure ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. `services/database_service.py` (`DatabaseService`/`IDatabaseService`)
provides the connection layer; no application schema yet, as planned (that is FOUNDATION-03/04).

**Delivered**:
- `default_database_path()` → `~/.cuepoint/cuepoint.db`, beside `config.yaml`, so all CuePoint
  state lives in one directory (which also makes FOUNDATION-11's backup a single-directory copy).
  Overridable via a new `database.path` config key.
- **One connection per thread** (`threading.local`), matching the codebase's thread-based model
  (`ThreadPoolExecutor`, thread-per-job, `ThreadingHTTPServer`). A registry lets `close_all()`
  reach connections opened on other threads for shutdown/teardown.
- **WAL journal mode** — verified by test that a reader is not blocked by an open write
  transaction, which is the property engine job threads and API request threads actually need.
- **`foreign_keys=ON` per connection** (SQLite defaults it off and does not persist it), verified
  by a test that an actual FK violation raises, not just that the pragma reports as on.
- **`busy_timeout`** configurable via `database.busy_timeout_seconds` (default 5s).
- `transaction()` context manager: commits on success, rolls back on exception, and **rejects
  nesting** with `DB_NESTED_TRANSACTION` rather than silently committing partial work (SQLite has
  no nested transactions).
- `execute_script()` for FOUNDATION-03's migrations.
- New `DatabaseError` exception carrying `error_code` and the db path, so a corrupt or
  non-database file produces an actionable message instead of a raw `sqlite3` error. The file is
  probed at open time (`SELECT count(*) FROM sqlite_master`) so corruption surfaces immediately
  rather than at an arbitrary later query.
- Registered as a **DI singleton** (one connection pool per process). Construction performs no
  disk I/O, so bootstrap stays cheap for CLI runs that never touch the database.

**Deviations from this spec**: none of substance. The spec suggested `services/database_service.py`
"or `core/db.py`"; the services module was chosen to match the existing DI pattern.

**Verification**: 51 new tests (36 database service, 8 config, 7 interface/DI). Full suite
1862 unit (was 1811) + 313 integration passing; `ruff check`/`format` clean; no mypy errors in
changed files; engine health smoke passes. Cross-platform and scale concerns from this spec are
covered: a Unicode-path test, a 6-thread × 25-transaction concurrent-write test, and a
20,000-row bulk insert.

**Note for FOUNDATION-11 (backups)**: WAL means the database is not a single file at rest —
`-wal` and `-shm` sidecars exist. A backup that copies only `cuepoint.db` can lose recent commits.
Use SQLite's backup API or checkpoint WAL before copying.

---

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

## FOUNDATION-03 — Schema Migration Infrastructure ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. `cuepoint/migrations/` holds the migrations,
`services/migration_runner.py` applies them, `schema_version` records what ran.

**Verification task answered**: the existing `services/schema_migration.py` (the audit guessed the
name as `schema_migration_service.py`) migrates **exported CSV files** between output-schema
versions. Unrelated to database schema — the name is a coincidence. Not reused; the new runner's
docstring points this out so the two are not confused.

**Migrations are Python modules, not `.sql` data files.** While checking packaging, I found that
`incrate/schema.sql` is **absent from the packaged engine sidecar** — `build/engine-sidecar.spec`
lists no `.sql` in `datas`, and the built TOC confirms it. Data files need explicit spec entries
and that has already been missed once here. Python modules are followed automatically via the
module graph, so migrations cannot go missing in a shipped build. (The inCrate bug is real and
pre-existing — reported separately, not fixed here.)

**Two real bugs found and fixed during implementation**, both caught by tests rather than review:

1. **`executescript()` broke migration atomicity.** It issues an implicit `COMMIT` before
   executing, so a migration's DDL was committed *outside* the runner's transaction — a failure
   left the schema changed but unrecorded, the exact corruption migrations exist to prevent.
   Fixed by splitting the script and executing statement by statement inside the transaction,
   using `sqlite3.complete_statement` so semicolons in string literals and `CREATE TRIGGER`
   bodies are handled correctly. A first attempt split line by line, which silently joined two
   statements sharing a line (`execute()` accepts only one) — also fixed and covered.

2. **Concurrent first-launch opens failed with "database is locked"** (a FOUNDATION-02 bug this
   step's testing surfaced). Switching a database to WAL takes a brief exclusive lock, and SQLite
   returns `SQLITE_BUSY` for a contended `PRAGMA journal_mode` *without consulting the busy
   handler* — and `busy_timeout` was being set after `journal_mode` anyway. In production the
   engine's request and job threads all reach for the database at once on first launch. Fixed by
   setting `busy_timeout` first and serializing connection opening; WAL persists in the file, so
   later opens are a no-op. Reproduced 3 runs in 5 before the fix, 8 clean runs after.

**Guarantees now tested**: migrations apply in order and exactly once; a failure rolls back that
migration only and the upgrade resumes after a fix; a database from a newer CuePoint is refused
with `DB_SCHEMA_TOO_NEW` rather than damaged; duplicate versions, sequence gaps, malformed modules
and filename/VERSION mismatches fail loudly at discovery.

**Not wired to startup yet, deliberately**: `migrate()` is invoked explicitly, not from
`connect()`. Auto-migrating on every connection would be surprising and slow, and there is no
schema worth migrating until the Track model lands. The call site belongs with the first real
consumer.

**Verification**: 37 new tests (31 runner/splitting, 6 discovery validation). 1902 unit (was
1862) + 313 integration passing; ruff and mypy clean.

---

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

## FOUNDATION-04 — Core `Track` Domain Model ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete, in three commits (the spec planned two; investigating the unification
uncovered a live bug that deserved its own).

**A live production bug found first.** `GET /api/v1/jobs/{id}/results` returned a 500 for *any*
real match run that produced candidates: the pipeline puts `BeatportCandidate` objects in
`.candidates`, and `track_result_to_dict` passed them straight to `json.dumps`. It went unnoticed
because every engine test constructs the *compat* `TrackResult` (dicts), so the tests exercised a
shape the real pipeline never produces — precisely the hazard of two classes sharing one name.
Fixed by serializing `candidates_data`, which already carries the field names the renderer reads
(`candidate_title`, `final_score`); `BeatportCandidate.to_dict()` uses different keys and would
have rendered blank rows instead.

**Unification**: `compat.gui_types.TrackResult` is now a re-export; one definition remains. The
two differed in three ways, each handled: `candidates` (dicts vs objects), `queries` vs
`queries_data` (now a read/write property alias — note it cannot be passed to the constructor,
since it is a property, not a field), and validation (compat had none). Nine test sites and one
**production** site in `models/compat.py` constructed with `queries=` and were migrated.
`output_writer.py`'s JSON export had the same latent crash, masked only because
`include_candidates` defaults to False; it now skips non-dict candidates.

**Persistent entity**: named **`LibraryTrack`**, not `Track`. `models/track.py::Track` already
exists as the ephemeral per-run pipeline type, and adding a second `Track` would have recreated
the exact duplicate-name hazard this step existed to remove.

**Identity (DEC-002)** lives in `resolve_identity()`: Rekordbox TrackID first, normalized path as
fallback, and an explicit `relinked` flag when the fallback matched a track Rekordbox has
renumbered — reported rather than applied silently. `normalize_path()` is deliberately
**platform-independent** (forward slashes, collapsed segments, case-folded) rather than using
`os.path.normcase`, because the database is a single file users copy and restore between machines.
The documented tradeoff: on a case-sensitive filesystem two files differing only in case compare
equal — vanishingly rare, and only ever consulted after TrackID lookup has already missed.

**Migration 0002** creates `tracks` with a UNIQUE index on `rekordbox_track_id` (two rows for one
Rekordbox track would make a refresh ambiguous) and a non-unique index on `normalized_path` (paths
can legitimately repeat, and the fallback must not full-scan the library). Both indexes are
asserted via `EXPLAIN QUERY PLAN` against 2,000 rows, not assumed.

**Deviation**: the spec said this step would add the first real `migrate()` call site. It does not
— there is still no consumer of the schema, and wiring startup migration before anything reads the
tables would be premature. That belongs with the repository layer.

**Verification**: 1956 unit (was 1915) + 313 integration passing; ruff clean; **mypy errors fell
50 → 46** against a HEAD baseline, since the duplicate type was itself causing type confusion.

**Follow-up noted**: `models/compat.py`'s `track_result_from_old`/`track_result_to_old` are now
largely degenerate — they convert a `TrackResult` to a `TrackResult`. Left alone to avoid scope
creep; worth removing.

---

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

## FOUNDATION-05 — Repository / Data Access Layer ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. `cuepoint/persistence/` holds `TrackRepository`, the only place that
executes SQL against `cuepoint.db`.

**New package, not `data/`**: `cuepoint.data` adapts *external* sources (Rekordbox XML, Beatport,
audio tags); `cuepoint.persistence` owns CuePoint's own store. Added to
`check_no_qt_in_core.py`'s scanned prefixes, so it is Qt-guarded like the rest of the runtime.

**`migrate()` is now wired**, as promised in FOUNDATION-03. The repository's DI factory runs
migrations before handing one out, so a repository can never be used against an unmigrated
database. It is deliberately *not* in `DatabaseService.connect()`: that would make opening the
database expensive for the many code paths that never touch it, and FOUNDATION-02's laziness is
what keeps plain CLI matching runs from creating a database file at all. `migrate()` is a cheap
version check once the schema is current.

**Repository surface**: `add`, `add_many` (one transaction for a whole import — a failed batch
leaves nothing behind, verified by test), `get`, `update`, `delete`, `delete_by_rekordbox_ids`
(DEC-003 refresh removal), `find_by_rekordbox_id`, `find_by_normalized_path`, `find_by_path`,
`resolve_identity`, `list_all` (paged), `count`, `exists`, and `upsert_from_rekordbox` — which
applies DEC-002 end to end: a renumbered track is re-linked in place rather than duplicated, and
`created_at` stays with the library row rather than being overwritten by the incoming export.

**Two deliberate details**: `find_by_normalized_path` orders by id so a duplicated path resolves
deterministically instead of by SQLite's row order; `list_all` sorts with `COLLATE NOCASE` so
artist ordering is not case-split.

**Architectural rule enforced, not documented**: `test_persistence_boundary.py` fails if any
module outside the persistence layer reaches for the library database. Its own meta-test earned
its keep immediately — it caught a wrong path depth in the guard that would have made it scan a
nonexistent directory and pass vacuously forever.

**Deviation**: the spec also called for a thin `PlaylistRepository` stub. Skipped — there is no
playlists table yet, and a repository over a nonexistent table is exactly the "no fake
implementation" the Definition of Done rules out. It belongs with the migration that creates the
table, in Phase 3.

**Verification**: 39 new tests; 1997 unit (was 1956) + 313 integration passing; ruff clean; no
mypy errors in the new package.

---

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

## FOUNDATION-06 — Application Service Layer ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. `LibraryService`/`ILibraryService` is the entry point engine handlers, the
CLI and later the renderer call; they do not reach for repositories directly. Registered through
the existing `bootstrap_services()` pattern, so both entry points (`src/main.py` and
`engine/jobs.py::_ensure_services`) get it.

Intentionally thin: reads, counts and `stats()`. Rekordbox import and refresh belong to the
Library phase, and stubbing them here would be the "no fake implementation" the Definition of Done
rules out. `is_empty()` exists because first-launch flows must key off whether tracks were
imported — a database *file* appears as soon as anything opens it, so its presence proves nothing.

**A real bug found — and it had already caused harm.** `DatabaseService` resolved `database.path`
in `__init__`, but the container builds it eagerly as a singleton, so a path configured *after*
bootstrap was silently ignored. That is exactly how the CLI applies flags and how tests redirect
the database. The symptom: this step's tests wrote two rows into the developer's **real**
`~/.cuepoint/cuepoint.db`. Fixed by resolving path and busy-timeout lazily on first use (and
caching once resolved, since moving the database under open connections would orphan them). The
stray rows were removed from the real database; its schema was left intact.

**Guard added**: an autouse fixture in `src/tests/conftest.py` redirects the default database path
to a temp file for *every* test, so no test can reach the user's real library again regardless of
how it builds its services. Verified by checking the real database's row count and mtime before
and after a full suite run — both unchanged.

**Verification**: 17 new tests; 2016 unit (was 1997) + 313 integration passing; ruff, Qt guard and
mypy clean.

---

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

## FOUNDATION-07 — Background Job Architecture ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. Job records now survive an engine restart (DEC-007), with the in-memory
store still the hot path.

**Extended, not replaced.** `JobStore` keeps its in-memory dict; a `JobRepository` is written
through behind it. `job_repository` is optional, so `JobStore()` still means purely in-memory —
which is why **all 47 existing engine tests pass with zero modifications**, the hard bar this step
set itself.

**Migration 0003** adds `jobs`, with `type` as a discriminator so future import/artwork/waveform/
analysis jobs share one lifecycle table. Results are deliberately not stored: a match run's
results are thousands of candidate rows, and DEC-007 chose durable job *records*, not resumable
job *state*.

**Progress is sampled, state transitions never are.** Progress ticks arrive per track, so writing
each one would mean thousands of database writes per run for information superseded moments later.
Progress persists at most once a second; any state change or error is forced through immediately,
because a dropped terminal state would misreport forever.

**Measured, not assumed** (4,000 progress updates, i.e. a 4,000-track run):

| | in-memory only | with persistence |
| --- | --- | --- |
| progress updates | 2.1 µs each (8.3 ms) | 2.8 µs each (11.2 ms) |
| status-polling reads | 1.1 ms | 1.1 ms |

Total overhead across a whole run is ~3 ms, and polling is untouched because it never reaches the
database.

**Persistence is best-effort throughout.** A failing repository, a failing provider, or an
unserializable payload leaves the job running normally — tested explicitly. A job record must
never be the reason a run fails.

**Interrupted jobs**: the engine closes out anything still marked queued or running at startup,
since the process that owned it is gone. They become `failed` with `JOB_INTERRUPTED` rather than a
new state value, so the renderer's existing state handling keeps working.

**Fixed along the way**: FOUNDATION-04's schema test hardcoded version `2`, so adding migration
0003 broke it for no real reason. It now asserts against `target_version`.

**Verification**: 28 new tests; 2046 unit (was 2016) + 313 integration passing across three
consecutive runs; ruff, Qt guard, mypy and engine health smoke clean.

**Noted, not diagnosed**: one full-suite run showed two failures in
`test_step13_ops.py::TestExportSupportBundleCLI` (subprocess CLI tests). They reference nothing
this step touched, pass 5/5 in isolation, and did not recur across three later full runs — an
intermittent that predates this work, not a regression from it.

---

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

## FOUNDATION-08 — Activity / Event Architecture ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. Migration 0004 adds `activity_events` (the user-readable feed) and
`track_history` (per-field audit), with `ActivityRepository` and `ActivityService` over them.

**Append-only, and enforced rather than documented.** A revert writes a *new* entry restoring the
previous value; the original is never edited or deleted. `test_activity_append_only.py` fails if
any code outside the migration issues UPDATE or DELETE against either table, and separately
asserts the repository exposes no mutator methods. History that can be rewritten still looks
authoritative, which makes it worse than no history.

**Values are stored as JSON**, so reverting `bpm` restores `124.0` as a float rather than a string
that has to be guessed back into a number.

**Identity fields are not editable through history** (`rekordbox_track_id`, `normalized_path`,
`id`): changing them would corrupt the DEC-002 rules a refresh depends on.

**Foreign keys earn their keep**: `track_history` cascades on track delete, since DEC-003 removes
tracks outright and history for a nonexistent track would be unreachable rows. This is the first
schema to rely on FKs, and the cascade test confirms FOUNDATION-02's per-connection
`foreign_keys=ON` actually bites rather than merely reporting as on.

**A test-suite problem I caused in FOUNDATION-06, found and fixed here.** The autouse database
sandbox called `mktemp` per test — thousands of directories per run. That filesystem churn was
starving the handful of tests that spawn subprocesses, producing failures that moved around
between runs (support-bundle CLI, then policy-flag CLI, then pylint). Making the sandbox
session-scoped fixed it and cut suite runtime from ~120s to ~82s. The earlier note in
FOUNDATION-07 calling those failures "a pre-existing intermittent" was wrong: they were mine.

**Verification**: 41 new tests; 2091 unit + 313 integration passing; ruff, Qt guard and mypy clean.

### Environment and CI findings (not fixed here)

- **The venv had lost declared dev dependencies** (`hypothesis`, `pytest-benchmark` and others),
  so the suite could not even collect. Restored from `requirements-dev.txt`.
- **`test_error_reporter.py::test_init_without_token` fails on any machine with `GITHUB_TOKEN`
  set**, because `ErrorReporter` falls back to that environment variable while the test asserts
  "disabled without token" without isolating it. Fixed here (one-line `monkeypatch.delenv`) since
  it blocked a clean suite.
- **The ruff gate is version-fragile and probably already failing in CI.** `requirements-dev.txt`
  specifies `ruff>=0.8.0` with no upper bound, there is no `[tool.ruff]` config, and CI installs
  from that file. Ruff 0.16.5 expanded its default rule set, and under it `ruff check src/`
  reports thousands of pre-existing violations codebase-wide (UP006/UP035/UP045/I001/RUF...).
  Versions 0.12–0.14 are clean on both lint and format. Local ruff pinned to 0.14.0 to match the
  state the repository was in; **the fix — pinning ruff and adding an explicit rule set — belongs
  to FOUNDATION-13**, which exists for exactly this.

---

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

## FOUNDATION-09 — Settings Architecture Cleanup ✅ IMPLEMENTED 2026-09-01 (scope changed)

**Outcome**: The planned cleanup was not what this step needed to do. Investigating it surfaced a
live bug, and fixing that — with the user's agreement — became the step.

**The plan's premise was wrong.** It assumed the flat `SETTINGS` dict held a few leftovers to fold
into `AppConfig`, with only the three documented DDG keys remaining. In fact it holds **66 keys, 57
of which are matching-engine tuning parameters with no `AppConfig` equivalent**, read directly as
`SETTINGS[...]` in ~80 places across `core/matcher.py`, `core/query_generator.py`,
`data/beatport.py` and `services/processor_service.py`. Migrating them would have meant rewriting
the module the Phase 0 audit explicitly said to reuse rather than rebuild — an L/XL change filed
as an "S/M" cleanup.

**The bug**: `ConfigService.__init__` took `SETTINGS.copy()`, and nothing ever wrote back to the
module dict. CLI speed presets (`--fast`, `--turbo`, `--myargs`) and `--config file.yaml` apply
tuning *only* through `config_service.set(...)`, so every matcher-tuning value they set landed in
a private dict the engine never read. The flags reported success, the config read back correctly,
and **the matching engine ran on defaults regardless**. Verified before fixing: setting
`TRACK_WORKERS` to 64 through the service left `SETTINGS["TRACK_WORKERS"]` at 12.

**The fix** is one line plus its reasoning: the service now operates on the shared `SETTINGS` dict
instead of a copy. An explicitly supplied settings dict is still copied, so callers that want
isolation (chiefly tests) keep it.

**This changes behaviour**, which is why it was the user's call rather than a refactor: presets and
`--config` now actually retune the matcher, so match results can differ for anyone who used them.
That is the bug being fixed, but it is a real change and is recorded here as such.

**Test isolation added**: `SETTINGS` is genuinely process-wide now, so an autouse fixture snapshots
and restores it around every test. Without it, one test setting `EARLY_EXIT_SCORE` would quietly
retune the matcher for everything running after it, and the failure would surface somewhere
unrelated. A pair of tests in the new file deliberately checks that guard works.

**A claim of mine that was wrong, corrected**: I initially reported that `_map_to_legacy_key`
pointed at a `performance.*` path `AppConfig` does not have. On checking, that table only maps
flattened **YAML input** keys, never `AppConfig` lookups, and is working as intended. Nothing was
changed there.

**Deliberately not done**: the 57 tuning keys stay in the flat dict. They are the matching
engine's configuration surface, not legacy debt, and moving them is a large refactor of the
highest-value module for cosmetic gain. That option was considered and declined, not overlooked.

**Verification**: 15 new tests; core/matcher suites green (272 passed) — the ones that matter most
for a change to matcher inputs; 2106 unit (was 2091) + 313 integration passing across repeated
runs; ruff, mypy, Qt guard, engine smoke and CLI startup all clean.

---

## FOUNDATION-09 — Settings Architecture Cleanup (original plan)

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

## FOUNDATION-10 — Logging / Diagnostics Alignment ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. The open privacy question this step was created to answer is now decided
and enforced.

**Decision: the database is never bundled.** A support bundle is meant to be shareable with a
maintainer. The library database holds the user's entire library — titles, artists and **file
paths** — plus tags, ratings, notes and history. File paths are precisely what the bundle's
existing `_sanitize_log_content` strips out of logs, so attaching the database would undo that
discipline in one step. Bundles now carry `database.json` describing only its *shape*: schema
version, expected version, pending migrations, per-table row counts, journal mode and a
`quick_check` integrity result. That is what actually diagnoses a database problem.

The summary proved its worth immediately: run against the developer's real database it reported
schema version 2 with migrations 3 and 4 pending — exactly the kind of state that produces
confusing bug reports.

**`foreign_keys` is deliberately not reported.** It is a per-connection pragma, so a throwaway
diagnostic connection reads 0 and would tell a maintainer the app runs without foreign keys when
it enables them on every connection it opens. A misleading diagnostic is worse than a missing one.

**The privacy notice was out of date and is now corrected.** It enumerated Configuration, Cache,
Logs and Exports as locally-stored data and did not mention the library database at all — the most
personal thing CuePoint now stores. It lists it, says where it lives, states that the
Help → Privacy clear actions deliberately do **not** touch it (clearing a cache must never delete
someone's library), and documents what a support bundle does and does not contain.

**Safety verified, not assumed**: `DataDeletionManager.clear_cache()` does `shutil.rmtree` on the
cache directory. The database sits in `~/.cuepoint/` while cache and logs are under
`AppData\Local`, so it is out of reach — now pinned by a test, since those paths could drift into
each other later.

**Activity versus debug logs**: already distinct by construction. Activity events live in the
database as a queryable feed; debug logs remain rotated files. Nothing writes one into the other.

**Verification**: 12 new tests, including a scan asserting that no library content — a distinctive
title, artist and file path planted in the database — appears in *any* entry of a generated
bundle. 2118 unit (was 2106) + 313 integration passing; ruff and mypy clean.

---

## FOUNDATION-10 — Logging / Diagnostics Alignment (original plan)

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

## FOUNDATION-11 — Backup Infrastructure ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. `BackupService` provides backup-on-launch, a retention cap, and manual
backup/restore, per DEC-009.

**The WAL caveat from FOUNDATION-02 was real, and worse than expected.** That note warned a
file-copy backup "can lose recent commits". Measured: on a database whose writes had not yet been
checkpointed, copying `cuepoint.db` produced a file where **the table did not exist at all** —
schema and all 50 rows were still in the `-wal` sidecar. A file-copy backup would have produced
silently useless backups, discovered only at restore, which is the worst possible moment. Backups
therefore go through SQLite's `Connection.backup()` API, which resolves WAL content and is safe
against a live database. The existing file-copy `BackupManager` in `utils/file_safety.py` is
deliberately **not** reused for the database.

**Restore is treated as the dangerous operation it is.** In order: verify the backup
(`PRAGMA quick_check`) *before* touching anything, take a `pre-restore` safety copy of the current
database, close connections, restore through SQLite rather than copying, then delete the stale
`-wal`/`-shm` files — which describe the previous database and would otherwise be applied on top of
the restored one. Pre-restore copies are exempt from pruning: they exist for the case where the
restore itself was the mistake. Tested: a corrupt or missing backup is rejected with the live
library intact, and a restore can be undone.

**Backup-on-launch never raises** — a backup problem must not stop the app starting — and skips
when nothing changed. Change detection reads the mtimes of the `-wal` and `-shm` sidecars as well
as the main file, because commits land in the WAL and the main file's mtime can sit still while
the database is actively changing.

**A guard fired and was handled, not widened away.** FOUNDATION-05's persistence-boundary test
flagged `backup_service.py` for touching the database outside `persistence/`. It is a genuine
exception — backup/restore uses `.backup()` and `PRAGMA quick_check` on the database *as a whole*
and never queries library tables, whereas the rule exists to stop *queries* spreading across the
codebase. Allowlisted with that reasoning recorded, and the failure message now tells the next
person what justification is required.

**Verification**: 28 new tests (25 backup, 3 config). 2148 unit (was 2118) + 313 integration
passing across repeated runs; ruff and mypy clean.

**Not wired to startup yet**: `backup_on_launch()` is available and registered but nothing calls it,
because CuePoint has no library to protect until Phase 3 imports one. The call site belongs with
that work, alongside the Settings UI for manual backup/restore.

---

## FOUNDATION-11 — Backup Infrastructure (original plan)

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

## FOUNDATION-12 — Test Infrastructure ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. All three gaps closed before the UI surface grows.

**1. Renderer component testing now exists.** The suite covered only pure utility modules, and
`.test.tsx` files were not even collected: `vite.config.ts` set `environment: "node"` and
`include: ["src/**/*.test.ts"]`. Added jsdom, Testing Library and a shared setup file that unmounts
between tests, and widened collection to `.test.tsx`. `Button.test.tsx` is the first rendering
test and the template for the components Library and Player will bring — it asserts what a user
would notice (a disabled button not firing, a loading button hiding its label) rather than markup,
so it survives restyling.

**Verified the test can fail.** A component test that cannot fail is theatre, so this was checked
rather than assumed: removing the `loading → disabled` logic the way a careless refactor would
makes the suite go red, and restoring it green. These run in CI already, via `npm test`.

**2. Two of the three zero-coverage `incrate/` modules now have real tests.**
`past_results_storage.py` (15 tests) pins the tolerance that matters — a corrupt or partial
history file degrades to "no history" instead of breaking discovery, and saving over a corrupt
file still works. `beatport_oauth.py` (17 tests) pins credential precedence, including that a
half-configured environment does not mask the file's secret, that a password is *not* trimmed
while a username is, and that the token request carries a timeout. `models.py`, listed in the
audit, has since gained coverage elsewhere.

**`beatport_playlist_browser.py` deliberately did not get unit tests**, and that is the honest
answer rather than a gap. Almost all of its 402 lines drive a Playwright page; unit-testing it
would mean asserting against an elaborate fake page — verifying the mock, not the code, and
raising a coverage number while catching nothing. It has cheap real guards instead: that it
imports without a browser installed (the engine sidecar imports inCrate modules at start-up), and
that its endpoints are HTTPS Beatport URLs. Its behaviour is genuinely verified by using it.

**3. Regression-test convention documented.** `src/tests/regression/README.md` explains when a bug
belongs there versus beside the code, the layout, and the rule that matters most: write the test
so it *fails on the unfixed code first*, since a regression test that has never failed may be
asserting the wrong thing entirely. It cites three bugs found during this phase and where each was
pinned. Referenced from AGENTS.md where regression tests are asked for.

**Verification**: 32 new Python tests and 9 renderer tests. 2191 Python unit (was 2148) + 47
renderer tests passing; ruff clean.

### Finding: the renderer typecheck is not run anywhere

`npm run build:check` (`tsc -b && vite build`) fails with **9 pre-existing TypeScript errors**,
mostly `TrackResult` not being assignable to `Record<string, unknown>` in `ResultsScreen.tsx`.
Confirmed pre-existing: the count is identical with my changes stashed. CI runs `npm test` and
`npm run build` — and `vite build` transpiles *without* typechecking — so nothing has ever failed
on these, which is how nine of them accumulated.

Not fixed here: that is renderer type debt, not test infrastructure, and adding `build:check` to
CI would fail immediately. It is the same shape as the ruff finding in FOUNDATION-13 — a gate that
exists but is never run — and wants its own change: fix the types, then enforce the script.

> **Resolved 2026-09-01.** All 9 errors fixed and both renderer gates wired into
> `desktop-electron.yml`. Details below.

#### Follow-up: renderer typecheck and lint gates

The nine errors were three problems, not nine:

1. **`fixtures.ts` used `ProgressInfo` and `ToolOption` without importing them** (3 errors). Both
   exist in `mocks/types.ts`; the import line simply omitted them.
2. **The sync request was typed as `Record<string, unknown>`** (5 errors). No caller could satisfy
   it: every one passes `TrackResult[]`, and a TypeScript *interface* has no implicit index
   signature, so `TrackResult` is not assignable to `Record<string, unknown>` — the annotation
   could never type-check against its only real input. `SyncTagsRequest` in
   `cuepointBridge.types.ts` already declared `results?: TrackResult[]`, so the honest type was
   sitting next door. `buildSyncRequest` now takes and returns those types; the emitted payload is
   field for field what it was. Two identical copies of `SyncTagsResponse` also existed, one per
   file and free to drift, so the sync options moved next to the request that carries them and
   `syncTagsUtils` re-exports both — no consumer import changed.
3. **An unused `useCallback` import** (1 error).

**A gate that cannot fail is worse than no gate**, so both were checked by planting violations:
`npm run typecheck` exits 2 on a type error and 0 clean; `npm run lint` exits 1 on a hook
dependency violation and 0 clean.

That check exposed a second dead gate. **`npm run lint` was bare `oxlint`, which reports
everything — `eval` and `debugger` included — as a warning and exits 0.** Adding it to CI as-is
would have been decoration. It is now `oxlint -D correctness`, and CI's step named "Lint and unit
test renderer" finally lints, which it never did.

Turning that on surfaced two `exhaustive-deps` errors that are **both false positives, where
obeying the linter would introduce real bugs**: `readRowHeight()` reads the `--row-height` CSS
variable derived from `--scale`, so the `scale` dependency is what re-reads it after a scale
change; and `getAllThemeOptions()` reads stored themes, so `customThemes` is the signal they
changed. Removing either dependency leaves virtualized row heights or the theme list stale. Both
are now suppressed with a comment explaining why the dependency is deliberate — worth having
regardless, since the next reader would otherwise "fix" them.

---

## FOUNDATION-12 — Test Infrastructure (original plan)

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

## FOUNDATION-13 — CI Quality Gates ✅ IMPLEMENTED 2026-09-01

**Outcome**: Complete. Four gaps closed; each was a check that either did not run or could not
fail.

**1. Pull requests now run the Python suite.** `test.yml` triggered on push only, so a PR could be
reviewed and merged green having never had the tests run against it. Added a `pull_request`
trigger for `main` and `feature`.

**2. Soft-failed checks made real.** `test.yml` ran `pylint ... || true` and `mypy ... || true`,
discarding their exit codes — a lint or type error produced a green tick, which is worse than not
running them because the check looks covered. Replaced with enforced `ruff check src/`,
`ruff format --check src/` and the same mypy gate `release-gates.yml` uses. The duplicated
`pip-audit`/`bandit` steps (also `|| true`) were removed: `security-scan.yml` already runs both on
push, PR and a weekly schedule.

**3. Ruff pinned.** `requirements-dev.txt` specified `ruff>=0.8.0` with no upper bound while every
other dependency in the file is pinned exactly, and the project has no `[tool.ruff]` config, so
the gate runs on ruff's defaults. Ruff 0.16 expanded those defaults and reports thousands of
violations against this codebase — meaning the lint gate would fail on an unrelated PR with no
code change. Pinned to `ruff==0.14.0`, which is clean on both lint and format, with a comment
explaining why the bound matters. **Upgrading ruff is now a deliberate task** (bump plus the
resulting fixes), not something that happens by surprise.

**4. The fake build gate removed.** `release-gates.yml`'s "Build Gates" job ran `python build.py`
— a script that does not exist in this repository — behind `|| echo "Build script not found"` and
`continue-on-error: true`. It could not fail, and its green tick meant nothing. Removed, with a
comment recording where real packaging actually happens (`desktop-electron.yml` for the
PyInstaller sidecar and electron-builder; `build-windows.yml`/`build-macos.yml` for releases).

**Also fixed: a gate that cried wolf.** `check_large_files.py` walks the filesystem, so it flagged
an 80 MB PyInstaller sidecar under `apps/desktop-electron/resources/` that git *ignores* and has
never tracked. It passed in CI (clean checkout) and failed only on developer machines that had
built the app — the fastest way to teach people a gate is noise. It now skips anything
`git ls-files --others --ignored` reports, and falls back to the previous behaviour when git is
unavailable. Verified both directions: the ignored artifact no longer trips it, and a committable
51 MB file still does.

**Action version drift** in `release-gates.yml` closed: `actions/checkout@v3` → `@v4`,
`actions/setup-python@v4` → `@v5` (3 occurrences each).

**Verification**: every gate command run locally exactly as CI invokes it — all pass. Gate
*failure* was proven rather than assumed: a planted lint error and a badly formatted file each
produce **exit code 1**, and exit 0 once removed. All 12 workflow files parse. 2091 unit tests
passing.

**Deliberately not done**: the codebase has pre-existing lint debt under newer ruff defaults;
adopting them is a large mechanical change that belongs in its own commit, not in the step that
fixes the gate. `large-file-check.yml` still triggers only on `phase_*` branches (a stale pattern)
and duplicates a check `test.yml` now runs — left alone as it is inert rather than wrong.

---

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

## FOUNDATION-14 — Pixel-Art Design System Foundation ✅ IMPLEMENTED 2026-09-01 (mechanism amended)

**Outcome**: Complete. Ten pixel icons drawn, a rendering path added alongside the glyph path, and
the three icons the toolbar actually shows converted. Crispness verified empirically across all 5
themes and 3 scales rather than assumed.

### Deviation: pixel grids rendered as SVG, not Aseprite PNG sprites

This step called for the "9-slice/Aseprite pipeline (DS-3)". Two things about that turned out to
be wrong, and the mechanism changed as a result. **DEC-010's decision is unchanged** — hybrid,
5–10 real pixel icons, glyphs retained elsewhere; only the production mechanism named in its
*implications* differs.

1. **DS-3 is not an icon pipeline.** In `docs/ui-overhaul/phase-1-pixel-design-system.md`, DS-3
   reads "**9-slice** for panels/buttons — resize without distorting corners". That is about
   stretchable chrome, not icons. There was no specced icon pipeline to stand up.
2. **A baked-colour bitmap cannot follow the themes.** The five themes disagree about
   `--fg-primary` (`#e0fbfc`, `#e8eaed`, `#f0f0ff`, `#fafafa`, `#ffffff`) and far more strongly
   about accents. A PNG needs one copy per icon per theme — 50 assets today, +10 for every theme
   added, and each one silently wrong if a token changes.

So the artwork is authored as a 12×12 character grid (`#` on, `.` off) in
`renderer/src/components/pixelIcons.ts` and rendered as SVG rectangles filled with
`currentColor`. The grid is still genuine pixel art — hand-placed pixels, no antialiasing — but
it themes for free, is reviewable in a diff (you can see the icon in the source), needs no build
step, and carries none of the packaging risk that bundling data files has already cost this
project once (`incrate/schema.sql`, FOUNDATION-02). Adjacent lit pixels are merged into single
rectangles, cutting a worst-case 144 DOM nodes to a few dozen.

### Scope: which ten icons, and a correction to this step's premise

This step promised icons "wherever they're already used today (the current toolbar/nav)", but the
icons it listed (nav, transport, status) have **no call sites at all** — the nav shell is Phase 2
and the player is Phase 5. The only three live `ToolbarIcon` usages were Settings, Export and
Filter, none of which appear in this step's list. Building the listed set exactly would have
produced zero user-visible change, contradicting "the first visible product change of Phase 1".

The ten built are therefore: **settings, export, filter** (live today — these are the visible
change), **play, pause, next, previous** (transport; universal shapes, no design risk), and
**home, library, activity** (nav; conventional shapes).

**Deliberately not built**: `clean`, `discover`, `prepare` have no conventional icon and their
meaning is still being designed — drawing them now is guessing. The status badges
(matched/unmatched/needs-review) are rendered today as text `Badge`s, which carry the state more
legibly at 12px than any glyph would. Both are cheap to add once there is a screen to design them
against, which is the caution DEC-010 was expressing.

### Verification: measured, not eyeballed

A Playwright harness rendered the real artwork against the real theme CSS at every
theme × scale combination, then decoded the screenshots pixel by pixel. **Antialiasing shows up
as blend colours between the artwork and the background, so crisp pixel art contains exactly two
colours.** All 15 combinations returned exactly 2, with lit-pixel counts scaling exactly
×4 and ×9 across 1×/2×/3× — no rounding drift — and a different foreground colour per theme,
confirming `currentColor` follows the themes.

Checking that the harness could actually fail exposed something worth recording: at
`devicePixelRatio` 1 the result is identical with `shape-rendering` set to `auto`, because the
geometry is already exact. **The crispness comes from integer geometry, not from the attribute.**
A grid cell is `2 × scale` CSS pixels, so it stays sharp whenever `2 × scale × DPR` is a whole
number:

| DPR | Result |
|---|---|
| 1, 1.5, 2, 3 | Exact at every scale |
| **1.25** (Windows 125%) | Exact at scale 2, the default; scales 1 and 3 blend ~1% of pixels |

At DPR 1.25 `shape-rendering="crispEdges"` cuts the blended pixels from 74 to 10 (of 900), so it
earns its place, but it cannot fully fix fractional device pixels — and neither could a PNG,
which faces the same mapping. Worth knowing before anyone reports "the icons look soft": it is
125% display scaling at a non-default zoom, and it is inherent, not a defect in the artwork.

### Looking at them changed two of them

Rendering the set and actually viewing it caught what no assertion would have. The gear read as a
**dumbbell** — a thick square body with full-height side teeth — and Library ("books on a shelf")
was three vertical bars on a baseline, very nearly identical to Activity. Both were redrawn: the
gear as a rounded body with short nubs at the compass points and an open bore, Library as records
standing in a crate, which also suits the product better. Neither would have been caught by tests.

**Tests**: 66 renderer tests added (113 total, from 47). Artwork is guarded for grid dimensions —
a row one character short silently shifts the drawing and is invisible in review — for staying in
bounds, and for uniqueness. Three planted breaks confirmed the suite fails: a short row, a removed
`crispEdges`, and a hard-coded fill in place of `currentColor`.

**Zero new TypeScript errors** (9 at HEAD, 9 after — the pre-existing set from FOUNDATION-12);
lint clean; no e2e selector referenced the replaced glyphs.

---

## FOUNDATION-14 — Pixel-Art Design System Foundation (original plan)

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
