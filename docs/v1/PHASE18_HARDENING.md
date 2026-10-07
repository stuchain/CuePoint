# CuePoint v1.0.0 — Phase 18: Production Hardening, Detailed Step Specifications

Status: **Specified 2026-10-07. No step is implemented yet.** Ten steps, HARDEN-01…HARDEN-10.
Writing the steps raised ten questions that no earlier round answered. They are asked as Decision
Round 21 (Q-190…Q-199). Where a step below says "if Q-NNN …", the recommended branch is written
out, and the step is built as the answer says. Per the process, no implementation happens from this
document. Each step needs an explicit "Implement HARDEN-NN" instruction, scoped to exactly that step,
and its outcome is recorded under the step afterwards.

Depends on Phases 1–17. Phase 17 must be complete first (DEC-140): this phase checks what the earlier
phases built, so it starts when there is nothing left to add. It reuses what Phase 13 adds (Sentry in
every process, the expected-error list, "Report a problem"), what Phase 14 adds (Settings in sections,
the motion provider and reduced motion), what Phase 15 adds (m0027, play history) and what Phase 16
adds (one version, the tag-driven release, the single-instance lock, the four build legs). Decision
Rounds 1–20 apply (`DECISIONS.md`, DEC-001…DEC-178 and Round 20's answers). This phase's own decisions are DEC-125 (hardening is v1's last
phase, and what it lists), DEC-009 (backups, whose Settings half was never built), DEC-007 (jobs
persist; full crash-resumability deferred), DEC-028 (the engine's bounded restart), DEC-065 and
DEC-070 (interrupted matches and tag writes are offered, never resumed unasked), DEC-083 (an export
never overwrites its source), DEC-119 (Phase 5's acceptance owed), DEC-126 and DEC-153 (what is
reported), DEC-132 (clear to new users), DEC-134 (reduced motion), DEC-149 (no native crash dumps),
DEC-155 and DEC-158 (the app's words), DEC-170 (the Macs ship unsigned), and DEC-145 with DEC-176
(v1 ships as `1.0.0` at the end of this phase).

The step prefix is HARDEN.

## What this phase is

Phases 1 to 17 built CuePoint and checked each piece where it was built. What no phase has done is
check the whole app the way a release is used: a large library, on every system, after a crash, after
an upgrade, with a screen reader, with a path in Greek or Japanese. Many checks were recorded as owed
and carried forward (DEC-119, DEC-125). This phase closes them, fixes what they find, and ends with
`1.0.0`.

It does five things:
- **Your library is safe.** Back Up Now and Restore exist in the app (DEC-009); a copy is kept before
  every upgrade; a damaged or too-new library at start is met with a way back, not an error; every
  file CuePoint writes is written whole or not at all.
- **A crash costs nothing.** A hung engine is found and restarted, a crashed window reloads, and the
  next launch after an unclean exit says what was interrupted. Each is proven by killing the process
  on purpose.
- **Any path, any name.** Paths are compared the same whether a Mac wrote them decomposed or Windows
  wrote them long; search and sort understand accents and case beyond ASCII.
- **50,000 tracks, measured everywhere.** The scale suites run on a schedule and before each release,
  with budgets that fail, on every build leg, in the packaged app, including start-up with a full
  library.
- **Checked as shipped.** The end-to-end suite runs against the packaged app on every leg, an
  accessibility check runs in CI, and every owed manual check is run once, on Windows and both Macs,
  from one checklist. Then `v1.0.0` is tagged.

**What this phase is not.**
- **No new features** beyond DEC-009's unbuilt controls and the recovery screens a release needs.
  Anything a check finds that is a feature, not a fault, is written down for after v1.
- **No crash-resumability of every job** (DEC-007 stands). Jobs that resume today keep resuming;
  interrupted matches and tag writes are still offered, never resumed unasked (DEC-065, DEC-070).
- **No native crash dumps** (DEC-149).
- **No code signing** (DEC-145, DEC-170), and no new build targets (Phase 16's "Deferred" stands).
- **No audio analysis** (DEC-125: Phase 19).

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| The backup service: SQLite's `.backup()` (WAL included), `cuepoint-<time>-<reason>.db`, keep 5, `pre-restore` copies never pruned | `services/backup_service.py:85-137`, `:208-229`; `models/config_models.py:127` |
| The launch backup, before any migration or the server, only when the database changed | `backup_service.py:150-180`; `engine/server.py:1197-1228`, `:1290` |
| Restore: verifies (`quick_check`), takes a `pre-restore` copy, closes every connection, restores, drops the old `-wal`/`-shm` | `backup_service.py:233-327`; `test_backup_service.py`, `test_backup_restores_*.py` |
| **Nothing calls `create_backup`, `list_backups` or `restore`** but the launch backup: no endpoint, IPC, Settings control or CLI | grep; DEC-009's "Back Up Now" / "Restore" unbuilt (`PHASE1_FOUNDATION.md:1212-1214`) |
| The migration runner: one `BEGIN IMMEDIATE` transaction per migration, statements one by one, version re-checked under the lock | `services/migration_runner.py:157-177` |
| A failed migration rolls back alone; earlier ones stay; `DB_MIGRATION_FAILED`; a newer database is `DB_SCHEMA_TOO_NEW` | `migration_runner.py:108-122`, `:180-192` |
| 26 migrations (`m0001`…`m0026`; Phase 15 adds `m0027`), their sequence checked | `src/cuepoint/migrations/`; `test_migration_discovery.py` |
| Per-migration upgrade tests that build version N-1 and migrate (about 20 files); legacy rows with an older schema's columns | e.g. `test_sets_schema.py:84`, `test_track_marks_schema.py:40`; `src/tests/fixtures/legacy_rows.py` |
| A placeholder migration integration test that only skips | `src/tests/integration/test_migration_integration.py:11` |
| The database: WAL, `busy_timeout` 5 s, `foreign_keys`, a probe on open (`DB_UNREADABLE`); `synchronous` left at FULL | `services/database_service.py:209-239` |
| The waveform store finds `SQLITE_CORRUPT` and sets the file aside to rebuild | `persistence/waveform_store.py:139`, `:260-272`, `:446-460` |
| A disk-full code that nothing raises | `exceptions/cuepoint_exceptions.py:108` (`R002_DISK_FULL`); `reporting/expected.py:88` |
| The engine's bounded restart (3 tries, 1/2/4 s), then **Restart engine** (DEC-028); health polled only at start (90 s) | `electron/engineSupervisor.ts:159`, `:171-172`, `:334-393` |
| The player's same policy, with its retry budget reset after 10 s up | `electron/playerSupervisor.ts:49-50`, `:141`, `:509-513`, `:726-745` |
| The engine exits when its parent dies (3 s grace) | `engine/server.py:1335-1360` |
| A gone renderer or child process is reported, nothing more | `electron/main.ts:1057-1062`; `electron/reporting.ts:287-300` |
| Jobs left running are marked `JOB_INTERRUPTED` at the next start; matches and tag writes offered; waveforms and the credit index resume | `engine/server.py:140-181`, `:1314-1348`; `persistence/job_repository.py:148-163` |
| Temp-and-rename writes: Rekordbox XML, set lists, CSV, artwork, checkpoints, main settings (none fsyncs but `output_writer`) | `data/rekordbox_export.py:1319-1335`; `data/set_list_file.py:392-409`; `electron/mainSettings.ts:70-83`; `services/output_writer.py:359-399` |
| Tag writes in place through mutagen's `save()`, with before-values recorded (DEC-070) | `data/tag_fields.py:294`, `:452` |
| A file location decoded once, host stripped, `/D:/` → `D:/` | `data/rekordbox.py:665-723` |
| Paths compared by slashes, `normpath` and `casefold`, never by Unicode form | `models/library_track.py:40-70` |
| Search by `LIKE … ESCAPE '!'`, sort by `COLLATE NOCASE` (both ASCII-only folding; "Âme" sorts last) | `persistence/track_query.py:300-325`; `migrations/m0007_browse_indexes.py:58`; `test_track_browse.py:241` |
| Export refuses its own source, by `samefile`, then a resolved `normcase` | `data/rekordbox_export.py:440-480` |
| The scale benches, each at 50,000 (budgets in `bench_sets`, `bench_marks`, `bench_waveform_store`, `bench_waveforms`; none in `bench_library` or `bench_clean`) | `scripts/bench_*.py` |
| Scale tests at 20,000 and 5,000, marked `slow`, **run by no workflow** | `src/tests/performance/test_*_scale.py`; `test.yml:72` (`--no-slow`); `release-gates.yml:49,55` |
| A 50,000-track renderer memory spec, skipped unless `CUEPOINT_E2E_MEMORY` | `e2e/libraryBrowse.spec.ts:270-347` |
| Engine start measured on an empty home only | `scripts/bench_engine_start.py:135-157`; `PHASE12_CLEANUP.md:1184-1190` |
| The 50,000 numbers, Windows only, with stale v0 tables at the end | `docs/user-guide/performance.md:16-304`, `:313-340` |
| 13 end-to-end specs that can drive a packaged app; **no workflow sets** `CUEPOINT_E2E_EXECUTABLE` | e.g. `e2e/clean.spec.ts:111-114`; `desktop-electron.yml:130-136` (e2e runs before `dist`) |
| `verify_macos_bundle.py`, run by hand only | `docs/release/release-deployment-runbook.md:75-81` |
| The runbook's manual checks on built installers | `release-deployment-runbook.md:85-125` |
| Roles and names in about 100 renderer tests; a player accessibility audit; a focus-trapping modal; 9 live regions; 30 `:focus-visible` rules | `components/player/playerAccessibility.test.tsx`; `components/Modal.tsx:35-112` |
| WCAG contrast math, applied to waveform tokens only | `tokens/themeDerivation.ts:91-179`; `waveformTokens.test.ts` |
| Reduced motion and the ten motion switches | PAGES-02, PAGES-12 (Phase 14) |
| The single-instance lock | DIST-06 (Phase 16) |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-125 | 50k-track testing, migration/backup/restore testing, cross-platform packaging validation, accessibility, crash recovery, Unicode/path edge cases: one step or more each. The owed packaged runs and Phase 5's acceptance are closed here. |
| DEC-009 | **Back Up Now** and **Restore** in the app (HARDEN-01), where Q-190 says. |
| DEC-007, DEC-065, DEC-070 | A crash marks jobs interrupted and offers matches and tag writes, as now; nothing new resumes unasked (HARDEN-04). |
| DEC-028 | The bounded restart stays; a hung engine counts as an exit (HARDEN-04). |
| DEC-083 | Export's source refusal holds for every path form HARDEN-06 adds. |
| DEC-119 | Phase 5's manual acceptance is run and recorded (HARDEN-09). |
| DEC-126, DEC-153 | A damaged library, a failed migration and a hung engine are reported; a full disk and a too-new library are the user's and are not. |
| DEC-134 | Every check of HARDEN-08 runs with motion on and with reduced motion. |
| DEC-149 | Recovery is built from events, not dumps. |
| DEC-132, DEC-155, DEC-158 | Recovery screens in plain American English, without "engine", "database" or "schema": "your library", "a backup from Tuesday 14:02". |
| DEC-145, DEC-176, DEC-177 | Phase 18 ends with the `v1.0.0` tag on `main`, built by Phase 16's release workflow (HARDEN-10). |
| DEC-170 | The Macs ship unsigned: the owed notarization checks (Phase 5 row 2, Phase 8) are closed as not applicable, and the first install by hand, with the quarantine flag cleared as the guide says, is itself a check (HARDEN-09). |
| DEC-140 | This phase runs alone, after Phase 17. |

## Sequencing

**Data first.** HARDEN-01 makes backups usable and keeps one before every upgrade, so every later step
that breaks a library on purpose has a way back. HARDEN-02 proves every upgrade path. HARDEN-03 meets a
damaged library at start.

**Then crashes and writes.** HARDEN-04 recovers from a dead or hung process. HARDEN-05 makes every
write whole-or-nothing, which HARDEN-04's kill tests then hold.

**Then the edges.** HARDEN-06 is paths and text. HARDEN-07 is scale. HARDEN-08 is accessibility. Each
is independent of the other two and can be built in any order.

**Then the release.** HARDEN-09 runs the end-to-end suite against the packaged app in CI and every
owed manual check from one checklist. HARDEN-10 fixes what that run finds, updates the docs and tags
`v1.0.0`.

**Every intermediate build keeps working,** with every suite green. HARDEN-07 and HARDEN-09 add CI
jobs; neither may go red on `feature` the day it lands, so each lands with its first green run.

## Before starting any step — nine cross-cutting facts

### 1. Restore exists and nothing reaches it

`BackupService.restore()` is complete and tested: it verifies the backup, keeps a `pre-restore` copy,
closes every connection, restores and drops the stale WAL. But no endpoint, IPC channel, Settings
control or CLI command calls it, and the user guide promises "restoring a backup brings all of it back"
(`organization.md:180-187`, `prepare.md:316`) without a way to do it. Restoring under a running engine
also needs every open connection closed and every cache (the browse window, the waveform store's
handle, the credit index) dropped: the safe way is to restore with the engine stopped and start it
again.

### 2. The launch backup does not survive an upgrade for long

The launch backup runs only when the database changed, and five are kept. After an upgrade, five
changed launches push out the last copy from before the migration. Phase 16's rollback runbook names
that copy as the way back from a bad release (`PHASE16_DISTRIBUTION.md`, DIST-08), so it has to be
kept on purpose.

### 3. No test walks every upgrade with data

Each migration with a test is tested from the version just before it. Nothing builds a library at
`m0001` with data in every table that exists then, migrates it one step at a time to the head, and
checks the data at each step; m0005, m0010, m0016, m0019 and m0022 have no test of their own
(*grep-based*); and no real database from an older build is kept as a fixture. The one integration
test is a skip.

### 4. A library that fails at start is a dead end

`DB_UNREADABLE`, `DB_SCHEMA_TOO_NEW` and `DB_MIGRATION_FAILED` reach the renderer as a generic request
error. None offers the backups that exist for exactly this. Nothing runs `quick_check` on the live
library, so damage found mid-session surfaces as unrelated failures. `R002_DISK_FULL` is defined and
never raised.

### 5. A hung engine is never found

The supervisor polls health only until the engine first answers. An engine that is alive but stuck
(a lock never released, a loop) is never restarted; the app waits on it forever. A crashed renderer is
reported and left blank. Nothing records that the last session ended uncleanly.

### 6. Two writes are not whole-or-nothing

- **Tag writes** rewrite the audio file in place. A crash mid-write can truncate it; the before-values
  restore tags, not audio.
- **Temp-and-rename writes** skip `fsync`, so after a power cut the renamed file can be empty. A killed
  export leaves `cuepoint_export_*.xml` temp files that nothing removes.

### 7. Paths and text are compared by ASCII rules

- **Unicode form.** macOS file systems hand back decomposed names (NFD); Rekordbox on Windows writes
  composed ones (NFC). `normalize_path` does not normalize the form, so "Beyoncé" written two ways is
  two paths: a refresh can see a track as removed and added, and Clean's file check can call a present
  file missing (*inferred; HARDEN-06's test proves or clears it*).
- **UNC.** `location_to_path` strips any host from `file://host/…`, so `file://server/share/a.mp3`
  loses `server`.
- **Long paths.** Nothing handles Windows paths over 260 characters, on the engine's side or mpv's.
- **Search and sort.** SQLite's `LIKE` and `NOCASE` fold ASCII only: "ÂME" does not find "Âme", and
  "Âme" sorts after "Zedd".
- **The sidecar's own text.** No `PYTHONUTF8` is set, so the engine's default encoding on Windows is the
  user's code page.
- **No end-to-end spec uses a non-ASCII path or home folder.**

### 8. Scale is measured, but nothing holds it

Every 50,000 number is from one Windows machine, run by hand. The scale tests are marked `slow` and no
workflow runs them; `bench_library` and `bench_clean` have no budgets; start-up has only ever been timed
on an empty library; process memory at 50,000 has been measured once, for the renderer, by hand.
`QUEUE_MAX_TRACKS = 50_000` is "the largest library CuePoint supports"; past it, only a 250,000-track
import that is checked to finish has ever run.

### 9. The packaged app is barely tested in CI

`desktop-electron.yml` runs the end-to-end suite against the development build, then packages. The
packaged app is only started by the sidecar's own `/health` smoke check. `verify_macos_bundle.py` is
run by hand. The manual checks owed, by phase:
- **Phase 5:** macOS rows 2 (notarytool), 6 (exclusive output on real hardware), 7 (unplugging the
  device), 9 (gapless by ear); Windows rows re-run on the current mpv pin (`PHASE5_PLAYER.md:1317-1421`).
- **Phase 7:** a real USB drive and network share (`PHASE7_CLEAN.md:1936-1939`).
- **Phase 8:** opening the export in Rekordbox, acceptance 1–6; Library fit at scale 2 on macOS;
  `playback` specs on macOS (`PHASE8_EXPORT.md:1496-1507`, `:1646-1694`).
- **Phase 9:** the macOS packaged checks and one pass against the live Beatport API
  (`PHASE9_DISCOVER.md:3013-3016`).
- **Phase 10:** packaged Windows and macOS runs (`PHASE10_PREPARE.md:3142-3191`).
- **Phase 11:** packaged Linux (with `CUEPOINT_MPV_PATH`), Windows and macOS runs; decoder timings on
  macOS (`PHASE11_WAVEFORMS.md:2206-2216`).
- **Phase 12:** the macOS run (`PHASE12_CLEANUP.md:1229-1233`).
- **Phase 13:** source maps resolving per process; no `.map` file in the package
  (`PHASE13_REPORTING.md:735-738`).
- **Phases 14–17:** whatever their own steps record as owed when they finish.

---

## HARDEN-01 — Back Up Now, Restore, and a Copy Before Every Upgrade

**Objective**: The user can make a backup, see the backups, and restore one, from the app (DEC-009);
and a copy taken just before each upgrade is kept apart from the five launch copies.

**User-visible result**: Settings has a **Backups** section (if Q-190 is A): "Your library is backed up
each time you open CuePoint after a change. 5 are kept." A list of backups with their date, size and
why ("When you opened CuePoint", "Before updating to 1.0.0", "Before restoring", "You made this"),
**Back Up Now**, **Restore** on each row, and **Show in folder**. Restore asks first ("Restore your
library to how it was on Tuesday 7 October, 14:02? Changes since then are set aside in a backup of their
own."), then CuePoint restarts its work in the background and the Library reloads.

**Dependencies**: Phase 17; PAGES-01 (Settings' sections).

**Existing code reused**: `BackupService` (create, list, verify, restore, prune); the engine's restart
in `engineSupervisor.ts`; Settings' section shape; the IPC and bridge pattern.

**Design**:
- **Engine:** `GET /api/v1/backups` (list: name, time, reason, bytes), `POST /api/v1/backups` (back up
  now; reason `manual`). Neither restores.
- **Restore runs in main, with the engine stopped.** `backups:restore(name)`:
  1. main asks the engine to stop through the supervisor's normal stop (no restart counted);
  2. main runs the engine binary once with `--restore <name>` (a new CLI mode of `run_engine` that
     calls `BackupService.restore()` and exits 0 or with the error's code), so the restore uses the
     same code as its tests and nothing else holds the file;
  3. main starts the engine as at launch, and the renderer reloads every view (the same signal the
     Library uses after an import).
  A failure at step 2 leaves the library as it was (restore verifies before it touches anything) and
  says so; the engine is started either way.
- **A copy before every upgrade** (if Q-191 is A): before the first pending migration, the runner asks
  `BackupService` for a backup with reason `pre-upgrade-v<from>-to-v<to>`, synchronously, in the same
  place the launch backup runs. Pre-upgrade copies are pruned on their own count (keep 3), never by the
  launch copies' five; `pre-restore` copies keep their current rule (never pruned automatically), and the
  section lets the user delete any copy by hand.
- **Every new backup is checked** with `verify_backup` (`quick_check`) after it is written; a copy that
  fails is deleted, reported (DEC-126) and does not count toward the five.
- **The words** follow DEC-155 and DEC-158: "library", "backup", never "database", "schema" or
  "engine".
- **The bridge:** `backups: { list, create, restore, showInFolder }`, typed and held by
  `desktopContract.test.ts`.
- **The user guide's** promises (`organization.md:180-187`, `prepare.md:316`) link to a new "Backups"
  section in `troubleshooting.md` that says how.

**Tests**:
- `src/tests/unit/engine/test_backups_api.py`: list shape and order; create returns the new copy;
  a failed create is an error, not a half file.
- `src/tests/unit/engine/test_restore_mode.py`: `--restore` restores, exits 0, keeps a `pre-restore`
  copy; a corrupt backup exits with its code and leaves the library untouched.
- `src/tests/unit/services/test_backup_service.py` (extended): pre-upgrade copies pruned on their own
  count; a backup that fails `quick_check` is deleted and not counted.
- `src/tests/unit/services/test_migration_runner.py` (extended): one pre-upgrade copy before the first
  pending migration, none when nothing is pending, named with both versions.
- `electron/backups.test.ts`: restore stops the engine without counting a restart, runs the restore,
  starts the engine, and starts it even when the restore fails.
- `renderer/src/screens/settings/BackupsSection.test.tsx`: the list, the reasons in words, the confirm,
  **Back Up Now** disabled while running.
- `e2e/backups.spec.ts`: import a library, back up, delete a playlist's tracks from a Collection,
  restore, and the Collection is whole again; the `pre-restore` copy is listed.

**Acceptance criteria / DoD**:
- The end-to-end spec passes on all four legs.
- `pytest src/tests/unit/engine src/tests/unit/services`, `npm test`, `npm run typecheck` and the
  contract test pass.

**Risks**: **Medium.** Restore must never run beside a live engine; the stop-run-start order and the
single-instance lock (DIST-06) are what make that true, and the spec proves it.

**Complexity**: **M**

---

## HARDEN-02 — Every Upgrade, With Data, From Every Version

**Objective**: A test builds a library at every schema version, filled with rows in every table that
exists then, migrates it one step at a time to the newest version, and checks every row survives as the
migrations say; and a migration killed halfway resumes cleanly.

**User-visible result**: None.

**Dependencies**: HARDEN-01 (the pre-upgrade copy is part of what is checked).

**Existing code reused**: `discover_migrations()`; `legacy_rows.py`; the per-migration tests' N-1
pattern; `bench_library.write_export` for realistic rows.

**Design**:
- **`src/tests/fixtures/schema_ladder.py`:** for each version V, `build_library_at(V, seed)` applies
  migrations up to V and inserts a fixed, seeded set of rows into every table V has (tracks with
  Unicode, nulls and extremes; playlists; Collections nested eight deep; tags; matches; sets; marks;
  waveform rows), using only V's columns.
- **`src/tests/integration/test_migration_ladder.py`** replaces the skip placeholder:
  - for every V from 1 to head-1: build at V, migrate to head, and assert row counts, every key field
    and every relation; `PRAGMA integrity_check` and `PRAGMA foreign_key_check` are clean; the version
    is head;
  - the same, one migration at a time from 1 to head, with the checks after each step;
  - every migration has at least one assertion of its own (a table that lists each `m00NN` and what it
    asserts; a new migration without a row fails the test).
- **Real fixtures:** one library file per published test release (`v1.0.0-test.N`, built by DIST-04)
  is saved under `src/tests/fixtures/libraries/`, small (200 tracks) and committed, and the ladder
  migrates each. The first is made from `v1.0.0-test.1`'s build when it exists; until then the ladder
  runs on synthetic libraries alone.
- **A migration killed halfway** (`test_migration_crash.py`): a subprocess runs the runner with a
  migration that sleeps mid-way; the parent kills it; a fresh runner finds the earlier migrations
  applied, the killed one not, applies it, and the data checks pass. Repeated with the kill during the
  pre-upgrade backup: the partial backup file is not listed and is removed at the next start.
- **The 50,000-track upgrade** of the slowest migrations (m0025's table rebuild and Phase 15's m0027)
  is timed in HARDEN-07's scale run, not here.

**Tests**: the files above.

**Acceptance criteria / DoD**:
- `pytest src/tests/integration/test_migration_ladder.py src/tests/integration/test_migration_crash.py`
  passes on all three systems in `release-gates.yml`, where the integration tests already run.
- The ladder's table names every migration in `src/cuepoint/migrations/`.

**Risks**: Low. The ladder may find a migration that loses data from an old shape; that is the point,
and the fix is a new migration, never an edit to a shipped one.

**Complexity**: **M**

---

## HARDEN-03 — A Damaged, Too-New or Unfinished Library at Start

**Objective**: When the library cannot be opened, is from a newer CuePoint, or failed to upgrade, the
user sees what happened and a way back; damage is looked for when it is likely; a full disk says so.

**User-visible result**: Instead of a failed Library, a full-window screen (if Q-193 is A):
- **Damaged:** "CuePoint couldn't read your library. Your latest good backup is from Tuesday 14:02."
  **Restore this backup** · **Choose another backup** · **Show the library file** · **Report this
  problem**.
- **Too new:** "This library was last opened by a newer CuePoint (1.2.0). Install that version, or
  restore a backup from before it." **Get the latest CuePoint** · **Choose a backup**.
- **Upgrade failed:** "CuePoint couldn't finish updating your library. Nothing was lost: a copy from
  just before is kept." **Try again** · **Restore that copy** · **Report this problem**.
- **Disk full:** a status message, "Your disk is full. CuePoint can't save changes until there's
  space.", and the change that failed is not half-made.
- **After an unclean exit,** once, quietly in the status strip: "CuePoint didn't close properly last
  time. Your library was checked and is fine." (or the Damaged screen).

**Dependencies**: HARDEN-01.

**Existing code reused**: `DB_UNREADABLE`, `DB_SCHEMA_TOO_NEW`, `DB_MIGRATION_FAILED`;
`verify_backup`; HARDEN-01's restore; the Phase 13 report path; the empty-state shape.

**Design**:
- **Start-up state from the engine.** `/health` gains `library: ok | damaged | too_new | upgrade_failed`
  with the versions and the newest backup that passes `quick_check`. The engine answers health even
  when the library cannot open, so the renderer can show the screen.
- **When to check** (if Q-192 is A): `PRAGMA quick_check` runs at start **after an unclean exit**
  (HARDEN-04's marker) and **once every 7 days** (the date kept in main's settings), in the background
  after the window shows; the library is usable while it runs and the screen appears only if it fails.
  `SQLITE_CORRUPT` or `SQLITE_NOTADB` raised during a session also marks the library damaged.
- **Disk full:** `SQLITE_FULL` and `ENOSPC` on any write become `R002_DISK_FULL`, an expected error
  (DEC-153, not reported), shown with the words above. The launch and pre-upgrade backups check free
  space first and skip with a status message, rather than fill the disk.
- **Reported** (DEC-126): damaged and upgrade-failed, with the versions. **Not reported:** too new
  and disk full (the user's).
- **The words** follow DEC-155 and DEC-158.

**Tests**:
- `src/tests/unit/engine/test_health_library_state.py`: each state from a fixture (a truncated file, a
  version above head, a migration made to fail), with the newest good backup chosen past a bad one.
- `src/tests/unit/services/test_database_service.py` (extended): `SQLITE_FULL` becomes `R002`;
  corruption mid-session flips the state.
- `src/tests/unit/services/test_backup_service.py` (extended): a launch backup with too little free
  space is skipped, not written.
- `electron/integrityCheck.test.ts`: the check runs after an unclean exit and after 7 days, not
  otherwise.
- `renderer/src/screens/recovery/LibraryRecovery.test.tsx`: each state's words and buttons; **Restore
  this backup** calls HARDEN-01's restore.
- `e2e/libraryRecovery.spec.ts`: a library file overwritten with noise opens the Damaged screen, and
  **Restore this backup** brings the library back.

**Acceptance criteria / DoD**:
- `quick_check` on a 50,000-track library with Clean's data (about 300 MB) is timed in HARDEN-07's run
  and recorded; it never delays the first paint.
- The end-to-end spec passes on all four legs; unit suites, typecheck and contract test pass.

**Risks**: Low. The screen is new; the recovery under it is HARDEN-01's.

**Complexity**: **M**

---

## HARDEN-04 — Crash Recovery, Proven by Killing Things

**Objective**: A hung engine is restarted; a crashed window reloads; the next launch after an unclean
exit knows; and each is proven by killing the process on purpose during real work.

**User-visible result**:
- **A hung engine** is restarted like a crashed one, with the same message the strip shows today.
- **A crashed window** reloads by itself once, saying "CuePoint's window stopped and was reopened.";
  a second crash within a minute shows a plain page with **Reload** and **Report this problem**.
- **After an unclean exit,** the next launch says what was interrupted: "An export was interrupted.
  Nothing was written." / the match and tag-write offers of DEC-065 and DEC-070, as today.

**Dependencies**: HARDEN-03 (the unclean-exit marker feeds its check).

**Existing code reused**: `engineSupervisor.ts` and `playerSupervisor.ts`'s restart policy (DEC-028);
`JOB_INTERRUPTED`; the Phase 13 events for a gone process.

**Design**:
- **A heartbeat.** While the engine is up, main calls `/health` every 15 s with a 10 s timeout. Three
  misses in a row (45 s unanswered) count as an exit: the supervisor kills the process tree and runs its
  bounded restart. A long job does not miss: health is answered on its own thread, which the test
  holds. The player gets the same through its existing IPC ping.
- **The renderer.** On `render-process-gone` (not a clean exit), main reloads the window once and sends
  the message above; two within 60 s show `recovery.html`, a static page with no app code, with
  **Reload** and **Report this problem**.
- **An unclean-exit marker.** Main writes `session.lock` in `userData` at start and removes it in
  `quitAfter`'s cleanup. Found at start, it means the last session did not end; main tells the engine
  (for HARDEN-03's check) and the renderer (for the message).
- **Interrupted work** says what it was, from the jobs marked `JOB_INTERRUPTED`; nothing new resumes
  (DEC-007).
- **Temp files** left by a killed export or set-list write are removed at start (HARDEN-05 names them).
- **Reported:** a hang (once per session), a renderer crash (as Phase 13 already does).

**Tests**:
- `electron/engineSupervisor.test.ts` (extended, fake timers): three missed heartbeats restart once;
  two missed then one answered do not; the restart counts toward DEC-028's three.
- `src/tests/unit/engine/test_health_while_busy.py`: health answers within 1 s while a job holds the
  database write lock.
- `electron/rendererRecovery.test.ts`: one crash reloads; two in 60 s load `recovery.html`; a clean
  exit does neither.
- `electron/sessionLock.test.ts`: written at start, removed at clean quit, found after a kill.
- **Crash-injection end-to-end specs** (`e2e/crash.spec.ts`), each killing a process with the OS's own
  kill, mid-work, then checking the app recovers and the library passes `integrity_check`:
  - the engine during a 50,000-track import → restarted, import marked interrupted, library as before
    it;
  - the engine during an export → no partial XML at the destination, temp file gone after restart;
  - the engine during a tag write → the offer appears; every audio file still decodes;
  - the engine stopped with `SIGSTOP` (a hang) → restarted within 60 s;
  - mpv during playback → the player restarts, the queue is kept;
  - the renderer (`process.crash()` through a test hook) → the window reloads;
  - the whole app during a refresh → the next launch shows the unclean-exit message.

**Acceptance criteria / DoD**:
- `e2e/crash.spec.ts` passes on all four legs (`SIGSTOP` is skipped on Windows, where the hang is made
  with a test-only endpoint instead).
- Electron tests, typecheck and the engine unit tests pass.

**Risks**: **Medium.** Kill timing is flaky by nature; each spec waits for a named point in the work
(a progress count) before killing, never a fixed delay.

**Complexity**: **M**

---

## HARDEN-05 — Every Write Whole or Not at All

**Objective**: Every file CuePoint writes, its own or the user's, is either the old version or the new
one after a crash or a power cut, never a mix or an empty file.

**User-visible result**: None, unless something goes wrong.

**Dependencies**: HARDEN-04 (its kill tests).

**Existing code reused**: the temp-and-rename writers; `output_writer.py`'s fsync; `tag_fields.py`;
DEC-070's before-values.

**Design**:
- **One helper per side.** `cuepoint/utils/atomic_write.py` (`write_atomic(path, bytes|stream)`: temp
  file in the same folder, write, `flush`, `os.fsync`, `os.replace`, fsync the folder on POSIX) and
  `electron/atomicWrite.ts` (the same with `fs.promises`). Every existing temp-and-rename writer moves
  onto it: Rekordbox XML, set lists, CSV, artwork, checkpoints, `mainSettings`, the player's saved
  preferences.
- **Temp files are named** `.<name>.cuepoint-tmp-<pid>`; HARDEN-04's start-up sweep removes any whose
  process is gone, in the folders CuePoint wrote to last (kept in main's settings).
- **Tag writes** (if Q-194 is A): mutagen writes a copy of the audio file made in the same folder; the
  copy is checked (it decodes its first and last second with the bundled decoder, and its tags read
  back as written), then replaces the original with `os.replace`. A folder without room for the copy
  fails that file with "Not enough space to save tags safely", before touching it. The file's times
  and, on POSIX, its mode are kept. On a network share where `os.replace` is not atomic, the same path
  is used and the check still runs.
- **The database** keeps WAL with `synchronous=FULL` (today's default, now set explicitly so it never
  changes by accident); the waveform store keeps `NORMAL`, being rebuildable.

**Tests**:
- `src/tests/unit/utils/test_atomic_write.py`: a failure mid-write leaves the old file; the temp is
  removed; the folder fsync is called on POSIX.
- `electron/atomicWrite.test.ts`: the same.
- `src/tests/unit/data/test_tag_fields_atomic.py`: a write that raises halfway leaves the original
  byte-identical; a copy that fails the decode check is discarded; no space fails before touching;
  times are kept; MP3, FLAC, AIFF, WAV, M4A and OGG fixtures all round-trip.
- `src/tests/unit/test_atomic_writers_used.py`: a source scan finding no `os.rename`, `os.replace` or
  `writeFile` of a destination outside the two helpers (an allow-list for the helpers themselves).
- HARDEN-04's tag-write and export kill specs, now asserting byte-identical originals.

**Acceptance criteria / DoD**:
- The suites above pass; HARDEN-04's crash specs pass with the stronger assertions.
- A tag write over 1,000 files is timed before and after, and recorded (`bench_tag_write.py`, new).

**Risks**: **Medium** for tag writes: the copy costs disk and time per file, and the measurement decides
whether a warning is needed for very large batches.

**Complexity**: **M**

---

## HARDEN-06 — Any Path, Any Name

**Objective**: Paths are equal when they name the same file, whatever their Unicode form, case or
length; network locations keep their host; search and sort treat accented and non-Latin text as people
expect.

**User-visible result**: "beyonce" finds "Beyoncé" and "ÂME" finds "Âme" (if Q-196 is A); "Âme" sorts
with the A's; a library on a Mac with accented folder names refreshes without false changes; a track
on `\\server\music` or in a folder 300 characters deep plays, exports and is checked like any other.

**Dependencies**: HARDEN-02 (a migration is added and the ladder checks it).

**Existing code reused**: `normalize_path`; `location_to_path`; `core/text_processing.py`'s accent
stripping; `file_check_service.py`'s UNC handling; the browse indexes.

**Design**:
- **Unicode form.** `normalize_path` applies NFC before its other steps; every stored path key is
  rewritten in a migration (`m00NN_path_nfc`), which the ladder covers. The file-system call itself
  uses the path as the OS gave it, so nothing is opened by a name the disk does not hold.
- **UNC.** `location_to_path` keeps a host other than `localhost` or empty as `//host/share/...`
  (`\\host\share\...` on Windows). Tested with Rekordbox's own spelling of a network track.
- **Long paths.** On Windows the engine opens files through `\\?\`-prefixed absolute paths when longer
  than 259 characters (one helper, used by the file check, the decoder hand-off, tag writes and export's
  folder checks); the packaged engine sets `longPathAware` in its manifest; mpv is given the prefixed
  path. Electron main's own file calls use Node, which handles long paths.
- **Search and sort** (if Q-196 is A): a `search_key` column per text field searched (title, artist,
  album, label, remixer, comment), filled with `casefold` + NFKD with marks removed, kept by the import
  and every write; search compares keys with `LIKE` on them. Sort uses a `sort_key` built the same way
  plus the original as a tie-break, with the browse indexes rebuilt on it. Both are filled by the
  migration, timed at 50,000 in HARDEN-07. Non-Latin scripts (Greek, Cyrillic, CJK) fold by `casefold`
  alone and sort by code point within their script, after Latin.
- **The sidecar's encoding:** the engine is started with `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8`,
  and the packaged build sets UTF-8 mode in its spec.
- **The Linux-only failure** `test_the_source_spelled_differently_is_refused_all_the_same` gets the
  case-sensitivity skip its regression twin has, and a twin that asserts the case-sensitive behavior on
  Linux.

**Tests**:
- `src/tests/unit/models/test_library_track.py` (extended): NFC and NFD equal; case equal; slashes
  equal.
- `src/tests/unit/data/test_rekordbox_location.py`: `file://localhost/…`, `file:///…`,
  `file://server/share/…`, `/D:/…`, percent-encoded NFD, a `#` and a `?`.
- `src/tests/unit/utils/test_long_path.py`: a 300-character path is prefixed on Windows and left alone
  elsewhere (with `os.name` faked); real on the Windows leg.
- `src/tests/unit/persistence/test_track_search_unicode.py`: "beyonce"↔"Beyoncé", "ÂME"↔"Âme",
  "straße"↔"STRASSE", "Σίσυφος"↔"σισυφος", "東京" finds itself; sort order of a mixed list.
- `e2e/unicodePaths.spec.ts`: a home folder named `Müsik ünd Ünicode ✦` (`CUEPOINT_HOME`), a library
  whose tracks live under `Ελληνικά/日本語/Beyoncé/` written in NFD on macOS, a 300-character path on
  Windows: import, refresh shows no change, play, analyze a waveform, write a tag, export, file check.

**Acceptance criteria / DoD**:
- The spec passes on all four legs; the ladder passes with the new migration; search and sort timings
  at 50,000 are within HARDEN-07's budgets.

**Risks**: **Medium.** The path migration rewrites every stored key; the launch and pre-upgrade backups
come first, and the ladder proves it.

**Complexity**: **L**

---

## HARDEN-07 — 50,000 Tracks, Measured on Every System, Held by Budgets

**Objective**: The scale suites run at 50,000 tracks on every build leg on a schedule and before every
release, with budgets that fail; start-up, end-to-end import and process memory are measured in the
packaged app; the performance guide holds every system's numbers.

**User-visible result**: The performance guide has numbers for Windows, both Macs and Linux, from the
same run.

**Dependencies**: HARDEN-06 (its search and sort keys are measured here); DIST-02 (the Intel leg).

**Existing code reused**: every `scripts/bench_*.py`; `bench_library.write_export`;
`src/tests/performance/`; the memory spec in `libraryBrowse.spec.ts`; `bench_engine_start.py`.

**Design**:
- **`.github/workflows/scale.yml`**, on a weekly schedule, on `workflow_dispatch`, and called by
  `release.yml` before it publishes (a red scale run stops a release). Four legs, as `desktop-electron.yml`.
  It runs:
  - `pytest -m performance` at full size (`CUEPOINT_SCALE=50000`; the tests' 20,000 and 5,000 become
    the default for local runs only);
  - every bench with `--json`, each failing on its budget;
  - the packaged-app specs below.
- **Budgets** (if Q-195 is A, at 50,000): each is the Windows number already recorded times 1.5, or
  the Phase 15/16 budget where one exists, and is set per leg after the first green run (a leg slower
  by more than 2× is investigated, not loosened). New budgets:
  - `bench_library`: import, refresh, browse, sort, search, facets;
  - `bench_clean`: Health, file check, duplicates;
  - start-up (below);
  - quick check (HARDEN-03), the slowest migrations (HARDEN-02), the Unicode keys (HARDEN-06).
- **Start-up with a full library.** `bench_engine_start.py --library 50000` starts the packaged engine
  on a home holding a 50,000-track library with Clean's data and waveforms, and times launch backup,
  migrations (none pending, and one pending), and first `/health`. The macOS timeout of its test is
  found and fixed here (fact 8: `TestTheRealEngine` starts the engine from source with no warm cache).
- **The packaged app at 50,000** (`e2e/scale.spec.ts`, run only by `scale.yml`, against
  `CUEPOINT_E2E_EXECUTABLE`): launch to a usable Library; import a 50,000-track export end to end
  (click to "Imported"); scroll to the end; type a search and see the first row; sort; open the
  Statistics page; and the resident memory of main, the renderer, the engine and mpv after each,
  read from the OS. Budgets as above.
- **Above 50,000** (if Q-195 is A): the same run at 100,000, recorded but not budgeted, so the guide can
  say what happens; `QUEUE_MAX_TRACKS` and the guide's "largest supported" stay at 50,000.
- **`docs/user-guide/performance.md`** is rewritten from the run's JSON by
  `scripts/performance_tables.py`: one table per area with a column per system, the date and the
  commit; the stale v0 "Performance Budgets" and "Benchmark Targets" tables and the "10k+" intro go.

**Tests**:
- `src/tests/unit/scripts/test_bench_budgets.py`: each bench exits 1 over its budget and 0 under it
  (sizes tiny, clock faked).
- `src/tests/unit/scripts/test_performance_tables.py`: the guide's tables from a recorded JSON.
- `src/tests/unit/scripts/test_scale_workflow.py`: `scale.yml` has four legs, the schedule and
  `workflow_dispatch`, and `release.yml` calls it before publishing.

**Acceptance criteria / DoD**:
- One `scale.yml` run is green on all four legs, and `performance.md` holds its numbers.
- Start-up with a 50,000-track library is measured on every leg and within budget.

**Risks**: **Medium.** CI runners vary by 20–30% between runs; budgets carry that margin, and a leg
that fails twice in a row on an unchanged commit is investigated, never re-run until green.

**Complexity**: **L**

---

## HARDEN-08 — Accessibility, Checked in CI and by Hand

**Objective**: The app meets WCAG 2.2 AA (if Q-197 is A), held by an automated check on every page in
CI and confirmed once by keyboard and with a screen reader on Windows and macOS.

**User-visible result**: Every control can be reached and used by keyboard, with a visible focus; every
control has a name; text meets contrast in every theme; the app follows the system's high-contrast and
reduced-motion settings.

**Dependencies**: Phase 14 (the pages as they ship, the motion provider, reduced motion).

**Existing code reused**: the role and name assertions; `playerAccessibility.test.tsx`; `Modal.tsx`'s
focus handling; `themeDerivation.ts`'s contrast math; the live regions.

**Design**:
- **axe in the renderer's tests.** `vitest-axe` (pinned) runs on each page's test render: Library,
  Collections, Clean, Prepare, Discover, Statistics, Settings, the Inspector, the player bar, the status
  strip, the sidebar, the first-run guide, every dialog. Each test asserts no violations at
  WCAG 2.2 A and AA.
- **axe in the end-to-end suite.** `@axe-core/playwright` (pinned) scans each destination with a
  library loaded, in each theme, at 1× and 1.5×, with motion on and reduced; `e2e/a11y.spec.ts`.
- **Contrast of every text token** in every theme: 4.5:1 for text, 3:1 for large text and for
  controls' borders and focus rings, extending the waveform check to all tokens (`themeContrast.test.ts`).
- **Forced colors** (Windows high contrast): a `forced-colors` stylesheet keeps borders, focus rings,
  the selected row and the waveform's playhead visible with system colors.
- **Keyboard:** every destination's tab order is pinned by a spec (`e2e/keyboard.spec.ts`): reachable,
  in reading order, no trap, focus returns after every dialog, and the table's arrow keys work.
- **Found violations are fixed in this step.** A violation that needs a design change beyond a label,
  a role, a color or an order is recorded under the step and raised before it is built.
- **The manual pass,** recorded under the step: NVDA on Windows and VoiceOver on macOS, through the
  first-run guide, an import, finding and playing a track, adding it to a Collection, Clean's review
  and an export; each with motion reduced. Narrator and Linux's Orca are not part of it (if Q-197 is A).

**Tests**: the files above.

**Acceptance criteria / DoD**:
- No axe violation in any renderer test or in `e2e/a11y.spec.ts` on any leg.
- `themeContrast.test.ts`, `keyboard.spec.ts` pass; the manual pass is recorded with no open blocker.

**Risks**: **Medium.** The virtualized table and the waveform canvas are the hard parts; both already
carry roles, and the waveform bar keeps a range input for keyboard and screen readers (`DECISIONS.md:3852-3853`), and the manual pass is where they are judged.

**Complexity**: **L**

---

## HARDEN-09 — The Packaged App in CI, and Every Owed Check Run Once

**Objective**: The end-to-end suite runs against the packaged app on every leg in CI; the Mac bundle is
verified in CI; and every manual check owed since Phase 5 is run from one checklist on Windows, an Apple
Silicon Mac and an Intel Mac (and Linux as Q-198 says), with the outcomes recorded.

**User-visible result**: None in the app. `docs/release/v1-acceptance.md` records every check with its
result, system and date.

**Dependencies**: HARDEN-01…HARDEN-08 (their specs are part of the suite); DIST-02, DIST-04.

**Existing code reused**: the 13 specs that read `CUEPOINT_E2E_EXECUTABLE`; `verify_macos_bundle.py`;
the runbook's manual checks; each phase's owed list.

**Design**:
- **`desktop-electron.yml`** gains, after `npm run dist`, a step that installs or unpacks the leg's
  package and runs the whole end-to-end suite against it with `CUEPOINT_E2E_EXECUTABLE`; every spec
  that today starts the development build learns the packaged path (a helper in `e2e/support/`, so
  each spec changes one line). On pushes the packaged run is the smoke subset (`@packaged-smoke`
  tag: start, import, play, export, quit), and on `release: true` and `scale.yml` it is the whole suite.
- **macOS:** `verify_macos_bundle.py` runs after `npm run pack` on both Mac legs, unsigned (DEC-170:
  no hardened-runtime or stapler check, since nothing is notarized).
- **Known reds** are fixed or their causes recorded here: the macOS `playback` specs' `rows.nth(1)`
  (`PHASE8_EXPORT.md:1646-1683`); the Qt hook's bash-4 syntax on macOS; the timing-flaky
  `StatusStrip.test.tsx` SSE test.
- **`docs/release/v1-acceptance.md`:** every owed check from fact 9, plus the runbook's manual checks
  on built installers, as one table: check, from (phase and file:line), systems, how, result, date. The
  hardware-only checks (exclusive output, unplugging, gapless by ear, a real USB drive and network
  share, opening the export in Rekordbox 6 and 7, the live Beatport pass) are run by the user on the
  user's own machines, with Remote Control where a session can drive them; the rest run on CI or by
  Remote Control.
- **Phase 5's acceptance** (DEC-119) is closed by this run. Its notarization row, and Phase 8's, are
  recorded as not applicable by DEC-170, with the first install by hand checked in their place.

**Tests**:
- The packaged end-to-end run, green on all four legs.
- `src/tests/unit/scripts/test_acceptance_doc.py`: every row has a system, a result and a date before
  HARDEN-10 can tag; a row marked owed fails it.

**Acceptance criteria / DoD**:
- `desktop-electron.yml` with `release: true` is green on all four legs with the whole suite against the
  packaged app.
- `v1-acceptance.md` has a result for every row on every system Q-199 names.

**Risks**: **High** in time, not in code: this is where every earlier phase's untested corner is
tried on a real machine. Each failure becomes a fix in HARDEN-10 or, if it is not a release blocker by
Q-199's rule, an entry in the known-issues list.

**Complexity**: **L**

---

## HARDEN-10 — Fixes, the Docs, and v1.0.0

**Objective**: Every release blocker found by HARDEN-01…HARDEN-09 is fixed, the docs describe the app
as released, and `v1.0.0` is tagged and published by the release workflow.

**User-visible result**: CuePoint 1.0.0 on GitHub, for Windows, Apple Silicon and Intel Macs, and
Linux; test builds offered it by the updater (DEC-145).

**Dependencies**: HARDEN-01…HARDEN-09; Phase 16's release workflow and rule (`1.0.0` is a normal
release; DEC-176 and DEC-177).

**Existing code reused**: `release.yml`; `CHANGELOG.md` and `validate_changelog.py`; the runbook;
the user guide; `support-policy.md`.

**Design**:
- **The fixes** for blockers are their own commits, each named for the check it closes (`fix: … (from
  v1-acceptance row N)`), each with a test where a machine can check it. Non-blockers go to
  `docs/release/known-issues.md`, linked from the release notes.
- **The docs:**
  - `support-policy.md`: the systems as tested in HARDEN-09 (Windows 10+ x64; macOS 12+ on Apple
    Silicon and Intel; Linux as Q-198 says), the largest supported library (HARDEN-07), and the
    support bundle section corrected to what the app has (the "Help > Export support bundle" and
    `main.py` lines are the retired app's);
  - `troubleshooting.md`: backups and restore, the recovery screens, the unclean-exit message;
  - `performance.md` from HARDEN-07; an accessibility page (`accessibility.md`): what is supported,
    the shortcuts, how to report a barrier;
  - `CHANGELOG.md`'s `1.0.0` section, which becomes the release notes (DEC-178).
- **The release** (by the runbook as DIST-08 left it): merge `feature` to `main` (Q-178's rule), tag
  `v1.0.0` on `main`, and the workflow builds, runs `scale.yml` and publishes the latest release
  (unsigned Macs, DEC-170). `ROADMAP.md`'s status says v1 is released, with the date.
- **A last real update:** a build of the last `1.0.0-test.N`, installed, is offered `1.0.0` and updates
  to it on Windows and each Mac (DIST-08's procedure).

**Tests**:
- Every fix's own test.
- `docs-check.yml` passes.
- `validate_version.py --tag v1.0.0` and the changelog check pass on the tagged commit.

**Acceptance criteria / DoD**:
- `v1-acceptance.md` has no open blocker; `known-issues.md` lists everything else.
- `v1.0.0` is published by the workflow alone; the last test build updates to it on each system.

**Risks**: The size of the fix list is unknown until HARDEN-09 runs. Each fix stays within its check;
anything larger is raised before it is built.

**Complexity**: **M** (the release), plus the fixes.

---

## Phase-level acceptance

Phase 18, and v1, are complete when:

1. A user can back up, see backups and restore from the app, and a copy from before every upgrade is
   kept apart. *HARDEN-01.*
2. Every schema version upgrades to the newest with its data intact, step by step and in one go, and a
   migration killed halfway finishes on the next start. *HARDEN-02.*
3. A damaged, too-new or half-upgraded library at start offers a way back, and a full disk says so
   without a half-made change. *HARDEN-03.*
4. Killing the engine, mpv, the window or the whole app during real work loses nothing that was saved,
   and the app recovers or says what was interrupted; a hung engine is restarted. *HARDEN-04.*
5. No file CuePoint writes, its own or an audio file's tags, is ever left half-written. *HARDEN-05.*
6. Paths in any Unicode form, on a network share or longer than 260 characters work everywhere, and
   search and sort fold accents and case beyond ASCII. *HARDEN-06.*
7. 50,000 tracks are measured on all four legs, in the packaged app, within budgets, on a schedule and
   before every release. *HARDEN-07.*
8. No automated accessibility violation on any page, every text token meets contrast, and the manual
   screen-reader pass has no open blocker. *HARDEN-08.*
9. The whole end-to-end suite passes against the packaged app on all four legs, and every owed check
   has a result. *HARDEN-09.*
10. `v1.0.0` is published by the release workflow, and test builds update to it. *HARDEN-10.*
11. No decision in DEC-001…DEC-178, or in the decision rounds of Phases 16 to 18, is contradicted. A
    contradiction stops the work and is raised rather than worked around.

## Decision Round 21 — what writing the steps raised

Asked in `OPEN_QUESTIONS.md` as Q-190…Q-199.

| Question | Recommendation | Needed by |
| --- | --- | --- |
| Q-190 — Where Back Up Now and Restore live | A: a **Backups** section in Settings | HARDEN-01 |
| Q-191 — A copy before every upgrade | A: yes, kept apart, the last 3 | HARDEN-01 |
| Q-192 — When the library is checked for damage | A: after an unclean exit, and weekly | HARDEN-03 |
| Q-193 — A library that can't open at start | A: a recovery screen offering the latest good backup | HARDEN-03 |
| Q-194 — Saving tags into audio files | A: write a copy, check it, then swap it in | HARDEN-05 |
| Q-195 — The largest library v1 supports | A: 50,000 supported and budgeted; 100,000 measured | HARDEN-07 |
| Q-196 — Accents and case in search and sort | A: fold them beyond ASCII | HARDEN-06 |
| Q-197 — How far accessibility goes | A: WCAG 2.2 AA, axe in CI, NVDA and VoiceOver by hand | HARDEN-08 |
| Q-198 — Linux at 1.0 | A: stays experimental; automated checks only | HARDEN-09, HARDEN-10 |
| Q-199 — What blocks 1.0.0 | A: every owed check on Windows and both Macs | HARDEN-09, HARDEN-10 |

## Deferred, with reasons

- **Resuming every job after a crash.** DEC-007 deferred it; jobs that resume today keep resuming.
- **Cloud or scheduled backups.** DEC-009 chose local backups on launch; a backup to another folder is
  already a setting (`backup.directory`).
- **Libraries above 50,000 as supported** (if Q-195 is A). Measured at 100,000 and written down; the
  queue cap and the guide stay at 50,000.
- **Narrator and Orca.** Not part of the manual pass (if Q-197 is A); axe and the keyboard specs cover
  what they share.
- **A full localization.** DEC-158: the app is in American English. HARDEN-06 makes other scripts work
  in data, not in the interface.
- **Repairing a damaged library in place** (SQLite's `.recover`). Restoring a backup is the way back;
  a repair that silently drops rows is not offered.
