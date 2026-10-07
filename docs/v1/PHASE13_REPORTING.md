# CuePoint v1.0.0 — Phase 13: Error Reporting, Detailed Step Specifications

Status: **Specified 2026-10-07. REPORT-01 and REPORT-02 are implemented (2026-10-07); REPORT-03 is next.** Eight steps,
REPORT-01…REPORT-08. Writing the steps raised six questions that Decision Round 14 did not answer.
They were asked as Decision Round 16 (Q-151…Q-156) and settled the same day as DEC-148…DEC-153, so
there are no open points. Per the process, no implementation happens from this
document. Each step needs an explicit "Implement REPORT-NN" instruction, scoped to exactly that step,
and its outcome is recorded under the step afterwards.

Depends on Phases 1–12. Phase 12 must be complete first: PRUNE-06 removes the unused `sentry-sdk`
pin for this phase to re-add (`PHASE12_AUDIT.md`, group I), and PRUNE-07 rewrites the policy docs
this phase then changes. Decision Rounds 1–15 apply (`DECISIONS.md`, DEC-001…DEC-147). This phase's
own decisions are DEC-126 (what is reported), DEC-127 (what a report may carry), DEC-128 (on by
default, with a switch) and DEC-148…DEC-153 (the projects, no crash dumps, no reports from source
runs or the CLI, "Report a problem", and failed jobs with a cause the user owns), with DEC-140 (its place, first after the cleanup) and DEC-028 (the engine's
bounded restarts, which it now reports).

The step prefix is REPORT.

## What this phase is

When something goes wrong in CuePoint today, nobody but the user knows. The engine writes a log on
the user's machine, Electron main writes nothing at all, and the renderer has no error boundary, so
an error in a component leaves a blank window. A crashed engine restarts up to three times and then
gives up in silence. The Qt app had Sentry; Phase 12 removed it with Qt, since it read consent
through `QSettings` and sent local variables.

This phase brings error reporting back, on the terms Decision Round 14 set:
- **Every unexpected failure, in every process** (DEC-126): the engine, Electron main and the
  renderer; the engine and the player exiting or restarting; every failed job; every logged error.
  Each report carries the steps that led to it.
- **Nothing personal leaves the machine** (DEC-127). Paths keep their shape, and names, notes, tags
  and tokens are replaced. No local variables are sent.
- **On by default, with a switch** (DEC-128). One switch in Settings turns it off at once, in every
  process. The privacy notice says what is sent.

**What this phase is not.**
- **No performance traces and no session replay** (DEC-126).
- **No change to what the user sees when something fails,** with one exception: the renderer gains an
  error screen in place of a blank window (REPORT-06).
- **No first-run notice** (DEC-128, against the recommendation of one).
- **No analytics.** Nothing is sent about what works, only about what fails. The CLI's opt-in
  `TelemetryService` is untouched, and stays off by default.
- **No new release pipeline.** Phase 16 builds it. This phase tags what `desktop-electron.yml`
  already builds (REPORT-07).

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| The error envelope and `ApiError` | `src/cuepoint/engine/api_errors.py` |
| Refusal mapping per routed module (`ApiError`, `ValueError` → 400, `LookupError` → 404, busy → 409, unavailable → 503, else 500) | `status_for` in `organization_api.py`, `clean_api.py`, `discover_api.py`, `rekordbox_export_api.py`, `sets_api.py`, `waveforms_api.py` |
| One runner every job goes through, with listeners on start and end | `JobStore._run_job` and `add_listeners`, `src/cuepoint/engine/jobs.py` |
| The engine's bounded restarts, and its status | `apps/desktop-electron/electron/engineSupervisor.ts` (`scheduleRestart`, `getStatus`) |
| The player's bounded restarts, a 50-line tail of mpv's output, and a snapshot listener | `apps/desktop-electron/electron/playerSupervisor.ts` (`recentOutput`, `onSnapshot`) |
| The main process's own settings file, written atomically | `apps/desktop-electron/electron/mainSettings.ts` (`main-settings.json`) |
| Redaction rules for logs and support bundles | `LogSanitizer` (`utils/logger.py`), `SupportBundleGenerator._sanitize_*` (`utils/support_bundle.py`) |
| The engine's activity feed | `activity_events`, `ActivityService.record_event` |
| The Settings page, built of panels | `renderer/src/screens/SettingsExportScreen.tsx` |
| The Help → Privacy dialog | `renderer/src/components/PrivacyDialog.tsx` |
| Toasts | `renderer/src/components/Toast.tsx` |
| The version coupling check | `scripts/check_desktop_version_coupling.py` |
| Electron builds on three systems | `.github/workflows/desktop-electron.yml` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-126 | Uncaught errors in the engine, main and the renderer; engine and player exits and restarts; failed jobs; logged errors. Steps before each error. No traces, no replay. One setup per process, sharing release and environment. Source maps uploaded. Expected refusals not reported. |
| DEC-127 | Paths, the user's name and home folder, track, artist, label and playlist names, notes, tags and tokens replaced before sending. Code, stack, state and settings kept. No local variables. One rule per language, held by tests over real failures. Paths keep their extension and depth. |
| DEC-128 | On from the first launch. A Settings switch turns it off at once in every process. Off means nothing is sent and nothing is queued. A start-up crash respects the stored choice. `PRIVACY_NOTICE.md` and `docs/policy/` change in the step that turns reporting on. |
| DEC-140 | This phase runs alone, after Phase 12. |
| DEC-148 | The engine reports to the existing Python project, main and the renderer to a new Electron project. |
| DEC-149 | No native crash dumps; a process that is gone is an event with its reason and exit code. |
| DEC-150 | Only packaged builds send, unless a developer sets `CUEPOINT_SENTRY_DSN`. |
| DEC-151 | The CLI does not report. |
| DEC-152 | Help gains "Report a problem", sent as Sentry user feedback. |
| DEC-153 | A job failing on a cause the user owns is a refusal, its code listed in one place. |

## Sequencing

**Nothing is sent until REPORT-08.** REPORT-03 to REPORT-06 build every sender, but the address
Sentry receives at (the DSN) comes only from an environment variable until then. A developer can
point a build at Sentry to check a step; a user's build sends nothing. REPORT-08 builds the address
into the app and changes the privacy notice in the same step, as DEC-128 asks.

REPORT-01 builds the switch first, so every sender is written against it from the start. REPORT-02
builds the scrubbers, so no sender exists without one. REPORT-03 (engine), REPORT-04 (main) and
REPORT-06 (renderer) each add one process. REPORT-05 needs REPORT-04, since main reports for the
processes it supervises. REPORT-06 needs REPORT-04, since the renderer's reports go out through
main. REPORT-07 tags releases and uploads source maps. REPORT-08 turns reporting on and closes the
phase.

**Every intermediate build keeps working,** with every suite green and the engine smoke check
passing.

## Before starting any step — eight cross-cutting facts

### 1. The desktop contract is six files

A feature crossing the engine boundary moves six files together, held by
`renderer/src/api/desktopContract.test.ts`:
1. the Python handler (`server.py` or its `*_api.py`);
2. `electron/engineClient.ts`;
3. `electron/engineSupervisor.ts`;
4. `electron/main.ts`;
5. `electron/preload.cjs`;
6. `renderer/src/api/cuepointBridge.types.ts`.

REPORT-01 (the switch) and REPORT-04 (error codes across the bridge) are the steps that cross it.

### 2. What counts as an error, and what is a refusal

The engine already sorts its answers, but in many places rather than one:
- **Refusals,** which are not reported (DEC-126):
  - any answer below 500: 400 `INVALID_REQUEST`, 401 `UNAUTHORIZED`, 404, 409 `LIBRARY_BUSY`;
  - 503 `LIBRARY_UNAVAILABLE`, which means the library is missing or busy, not that code failed;
  - a cancelled job (`JOB_CANCELLED`).
- **Errors,** which are reported:
  - every 500, whether from a route's own `except Exception` (about a dozen in `server.py`, such as
    `ARTWORK_FAILED`, `LOGS_READ_FAILED` and `SUPPORT_BUNDLE_FAILED`) or from a `status_for`
    fall-through;
  - an exception that escapes a handler. Today nothing catches it: `EngineHandler` has no
    `handle_error`, so socketserver prints the traceback to an unread pipe and the client's
    connection drops with no envelope.

REPORT-03 gives the engine one function, `report_unexpected`, and calls it from each of those places.
A failed job is a bug unless it failed on a cause the user owns, such as a Beatport token that was
rejected or a drive that was unplugged. Those are refusals (DEC-153).

### 3. Today errors lose their code on the way to the renderer

`engineClient.ts`'s `readJson` throws `new Error(body.error.message)`, dropping the HTTP status and
the code. `preload.cjs` then strips Electron's prefix, so the renderer sees only words. Neither main
nor the renderer can tell a refusal from a 500. REPORT-04 keeps the status, the code and the
engine's report id on every error that crosses the bridge, so that:
- main and the renderer do not report an engine error a second time;
- the report they make, if any, names the engine's report, and the story reads as one (DEC-126).

### 4. The engine's output is piped and never read

`engineSupervisor.ts` spawns the engine with `stdio: ["ignore", "pipe", "pipe"]` and attaches
nothing to either pipe. The engine's console handler writes every INFO line to stdout
(`LoggingService`), and an uncaught traceback goes to stderr. Once a pipe's buffer fills (about
64 KB on Linux and macOS, less on Windows), the engine's next write blocks. This is inferred from the
code and not yet reproduced: a long session could stall the engine mid-request. Nothing in main can
see an engine traceback either. REPORT-05 drains both pipes and keeps a short tail, as
`playerSupervisor.ts` already does for mpv. It could also be fixed on its own before this phase.

### 5. The engine writes its log to one folder, and reads it from another

`LoggingService` writes to `~/.cuepoint/logs/cuepoint.log` and ignores `CUEPOINT_HOME`. The log
viewer, the support bundle and "clear logs" all read `AppPaths.logs_dir()`, which is
`<data dir>/Logs`. The viewer's level filter also expects `CuePointLogger`'s format, which nothing
configures. Sentry's logging integration hooks the logger, not the file, so this phase does not
depend on it. It is recorded here, since REPORT-03 touches the logging setup, and fixed there only
if the user asks; it changes what "clear logs" deletes.

### 6. Main logs nothing, and the renderer catches nothing

- **Main:** no `console`, no log file, no `uncaughtException` or `unhandledRejection` handler, no
  `render-process-gone` or `child-process-gone`, no `crashReporter`. `engine.start()`'s failure is
  swallowed on purpose (it reaches the user through `getStatus()`).
- **The renderer:** no error boundary, no `window.onerror`, no `unhandledrejection`. `main.tsx`
  renders `<App/>` inside `StrictMode` alone. An error while rendering leaves the window blank.

"Every logged error" therefore means, for these two processes, the places that swallow a failure
today. Each is listed in REPORT-04 and REPORT-06.

### 7. A default Sentry SDK sends things DEC-127 forbids

Each SDK, as installed, would send:
- **the machine's name,** as `server_name` (Python and Node);
- **the request,** with its query string and body (Python's integrations for HTTP servers);
- **UI breadcrumbs** naming the clicked element and its text, which in the Library is a track's
  title (browser);
- **console breadcrumbs,** with whatever was logged;
- **local variables,** when `include_local_variables` is on (Python's default is on).

Each is turned off or scrubbed in REPORT-02's event rules, and REPORT-02's tests build an event with
every one of them and assert what is left. The Electron SDK also queues reports on disk when
offline, which DEC-128 forbids ("never queued for later"). REPORT-04 uses its plain transport.

### 8. The version is three different strings

- `src/cuepoint/version.py`: `1.0.0-feb1`, with a build number, commit and date that were last set
  in February. When run from source, `get_version()` answers `1.0.0-test1.0`.
- `apps/desktop-electron/package.json`: `0.0.0`, with `cuepoint.engineVersion` set to `1.0.0-feb1`.
  The coupling check holds those two equal.
- Main never calls `app.getVersion()`. The About dialog shows the engine's version.

DEC-126 wants one release across the three processes. REPORT-07 takes it from `version.py`, which is
already the source the coupling check trusts, and adds the commit as Sentry's `dist`.

---

## REPORT-01 — The Choice, Stored Once and Read Everywhere

**Objective**: One stored on-or-off choice for error reporting, read by every process before it could
send anything, and a switch in Settings that changes it at once.

**User-visible result**: Settings gains a Privacy panel with one switch, "Send error reports", on by
default, and a line saying what is sent. Nothing is sent yet, by anything.

**Dependencies**: Phase 12.

**Existing code reused**: `MainSettingsStore` (`mainSettings.ts`); the pattern of the privacy exit
preferences, which the renderer pushes to main at launch (`privacy:setExitPrefs`).

**Design**:
- **Stored by main,** in `main-settings.json`, as `errorReporting: boolean`. Main owns it because
  main starts first and starts everything else. A missing, unreadable or hand-edited value reads as
  `true` (DEC-128: on from the first launch).
- **Read before anything starts.** Main reads it synchronously, before `app.whenReady`, so a crash
  at start-up respects it (DEC-128).
- **Passed to the engine** at launch, in `engineEnvironment` beside `CUEPOINT_TOKEN`, as
  `CUEPOINT_ERROR_REPORTING=1` or `0`. An engine started without it (the CLI, a developer running
  `python -m cuepoint.engine`) treats it as off.
- **Changed at once:**
  - **The bridge** gains `window.cuepoint.errorReporting.get()` and `.set(enabled)`.
  - **`set`** writes the file first, then tells the engine through a new authorized route,
    `POST /api/v1/reporting` with `{ "enabled": bool }`, then answers. If the engine is down, the
    file is still written and the next engine launch reads it from the environment.
  - **The engine's route** sets one in-process flag and answers `{ "enabled": bool }`. It is the
    only state the route touches.
  - **Every sender** (REPORT-03 to REPORT-06) checks the flag inside its `before_send` and
    `before_breadcrumb`, so turning it off drops anything already captured but not yet sent.
- **The Privacy panel** sits last on the Settings page, after Rekordbox export. It holds the switch
  and two sentences: what a report carries, and what it never carries (from REPORT-08's notice). It
  links to Help → Privacy, which shows the same state and links back.
- **The six contract files** move together (fact 1).

**Tests**:
- `mainSettings.test.ts`: a missing file, a missing key, a non-boolean and garbage all read as `true`;
  `false` survives a round trip.
- The engine: the route needs the token, refuses a non-boolean with 400, and flips the flag.
  `CUEPOINT_ERROR_REPORTING` absent, `0` and `1` each give the right starting value.
- Main: `set(false)` writes the file before calling the engine, and still writes it when the engine
  is down.
- The renderer: the panel renders the stored state, and toggling calls the bridge once.
- The desktop contract test covers the new route and bridge method.

**Acceptance criteria / DoD**:
- Every process can answer "may I send?" before it starts work, from one stored value.
- Turning the switch off changes the engine's flag without a restart.
- All suites pass.

**Risks**: Low.

**Complexity**: **S**

**Outcome**: Implemented (2026-10-07). The choice is `errorReporting` in `main-settings.json`, read
as on when missing or unreadable, and held by `ErrorReportingChoice` (`electron/errorReporting.ts`),
which main reads before `app.whenReady`. The engine gets `CUEPOINT_ERROR_REPORTING=1` or `0` at each
launch and holds the flag in `cuepoint/engine/reporting_api.py`, set first thing in `run_engine` and
changed by `POST /api/v1/reporting`. Settings ends with a Privacy panel holding the "Send error
reports" switch; Help → Privacy shows its state and opens Settings on it. `set` writes the file, then
tells the engine in order, and fails only when the file cannot be written, in plain words. Nothing
sends anything yet.

Checked in the cloud container: the engine's new route tests (13), the Electron suite (575) and the
renderer suite (4210) pass, with both type-checks and the pinned ruff 0.14.0. The engine suite has one
failure, `test_engine_rekordbox_export_api.py::TestTheStart::test_the_source_spelled_differently_is_refused_all_the_same`,
which fails the same on the commit before this step. Not checked: the switch in a running or packaged
app.

---

## REPORT-02 — The Scrubbers, One Per Language, Held by One Corpus

**Objective**: A rule in Python and a rule in TypeScript that turn any report into one carrying
nothing personal, both held by the same set of examples built from real failures.

**User-visible result**: None.

**Dependencies**: None. It can run beside REPORT-01.

**Existing code reused**: `LogSanitizer`'s token and URL patterns (`utils/logger.py`), and
`SupportBundleGenerator`'s home-folder replacement. They are read for their patterns, not imported:
both are narrower than DEC-127 asks (the support bundle's config redaction sees only top-level keys,
so the nested Beatport token passes it).

**Design**:
- **Where they live:**
  - Python: `src/cuepoint/reporting/scrub.py`.
  - TypeScript: `apps/desktop-electron/electron/reportScrub.ts`. Renderer reports go out through
    main (REPORT-06), so main's scrubber sees them. If REPORT-04 finds the Electron SDK does not pass
    renderer events through main's `beforeSend`, the renderer imports the same file.
- **What each replaces** (DEC-127):
  - **Paths keep their shape.** `C:\Users\anna\Music\House\2024\track.flac` becomes
    `<home>\<dir>\<dir>\<dir>\<file>.flac`. The separator, the depth and the extension stay. A
    path under the app's own install or resources folder keeps its name, since it says which file of
    ours failed (`<app>\resources\engine\cuepoint-engine.exe`). Windows, POSIX, `file://` URLs and
    percent-encoded paths are all recognised.
  - **The user's name and home folder,** wherever they appear, even outside a path.
  - **Quoted values in messages.** Text inside `'…'`, `"…"`, `“…”` and `‘…’` in an exception
    message or log message becomes `<value>`, since that is where our code puts a track title, a
    playlist name or a query. The audit below decides whether this is enough.
  - **Library fields by key.** Any key in `extra`, `contexts` or breadcrumb `data` named like
    `title`, `artist`, `label`, `album`, `remixer`, `playlist`, `name`, `note`, `tag`, `comment`,
    `query`, `search`, `path`, `file`, `location`, `token`, `password` or `secret` (the full list is
    in the module, matched case-insensitively and as a suffix) has its value replaced.
  - **Tokens anywhere.** `Bearer …`, `token=`, `access_token=`, JWT-shaped strings, the engine's
    session token, and runs of 32 or more hex or base64 characters.
- **What the event rules remove,** whatever their content (fact 7):
  - `server_name`, `user`, `request` (Python), and the device's name;
  - local variables (also off at init, belt and braces);
  - breadcrumbs of kind `ui.click` and `ui.input`;
  - attachments, except the process output tails REPORT-05 adds, which are scrubbed line by line.
- **What is kept:** the exception type, the stack (file names inside our code, functions, line
  numbers), the route template (`/api/v1/library/tracks/{id}`, never the filled-in path), the job
  type, the app's settings that are not secrets, the OS and its version, the app's version.
- **The audit of real failures.** Every `raise` in `src/cuepoint/` whose message is an f-string or
  `%`-format with a value in it is listed, with what the value can hold. Every one that can hold a
  library value or a path goes into the corpus. If a value reaches a message unquoted, the raise
  site is changed to quote it, rather than widening the scrubber to guess.
- **The corpus:** `src/tests/fixtures/reporting/scrub_corpus.json`, a list of `{ input, expected }`
  events, read by both test suites. It holds:
  - one event per audited raise site;
  - a traceback from each process, with paths on all three systems;
  - a breadcrumb trail of each kind;
  - fact 7's default-SDK event, with every forbidden field present.

**Tests**:
- `test_scrub.py` and `reportScrub.test.ts` run the whole corpus, and each must produce `expected`
  exactly.
- A property test in each: no output contains the test user's name, the test home folder, any value
  from a generated library, or a generated token.
- A test that fails if a new f-string `raise` with a value appears in `src/cuepoint/` without a
  corpus entry, so the audit cannot go stale. Its allowlist names each exempt site and why.

**Acceptance criteria / DoD**:
- Both scrubbers pass the same corpus.
- Every audited raise site is in the corpus or on the allowlist with its reason.
- Nothing sends yet.

**Risks**: Medium. **A library value reaching a message unquoted** is the risk. The audit and the
raise-site test hold it, and REPORT-08 runs the scrubbers over a day's real reports before the
release.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-07). The scrubbers are `src/cuepoint/reporting/scrub.py` and
`electron/reportScrub.ts`, with the same rules and the same results. They are held by
`src/tests/fixtures/reporting/scrub_corpus.json` (94 hand-written cases) and by
`raise_site_events.json` beside it (one event per audited site), both run by `test_scrub.py` and
`reportScrub.test.ts`, with a property test in each.

Decided while building, beyond the design above:
- **Log calls are audited too.** The audit covers 648 `raise` sites and 99 log calls at INFO and above,
  every argument and keyword, `+` and `.join`. 432 can carry a library value or a path and have an
  event; 315 are exempt with a reason (`raise_sites.json`). `test_raise_sites.py` keeps it current,
  and a site's key keeps its `!r`, so dropping the quotes fails it.
- **Values are quoted with `!r`,** not `'…'`. A title such as "Lovin' You (Ol' Skool Mix)" closes a
  hand-written quote early; `repr` switches to double quotes. About 100 sites changed; only the
  quoting of their messages changed.
- **A log record's arguments are values.** Each `%s` argument becomes `<value>`, or its path shape when
  it is a whole path, and the formatted message is rebuilt from them.
- **Kept:** API route paths (their query values are replaced), a `:line:col` after a path, 32-hex ids
  under `report_id`, `event_id`, `trace_id` and `span_id`, booleans and numbers under library keys,
  and the SDKs' runtime contexts.
- **Limit:** an unquoted path with a space ends at the space. Our code quotes them; anything else is
  best effort.

Checked in the cloud container: the reporting tests (553 in Python, 544 in TypeScript), the tests of
every module whose messages changed, the regression suite, ruff 0.14.0, the TypeScript type-check
and the dead-code guard. The one engine failure,
`test_the_source_spelled_differently_is_refused_all_the_same`, fails the same before this step (it
assumes a case-insensitive file system). Nothing sends yet.

---

## REPORT-03 — The Engine Reports

**Objective**: Every unexpected failure in the engine is reported, scrubbed, with the steps before
it, and no refusal is.

**User-visible result**: One fix. An exception that escapes a request handler now answers a 500
envelope instead of dropping the connection. Nothing is sent from a user's build yet.

**Dependencies**: REPORT-01, REPORT-02, and PRUNE-06 done.

**Existing code reused**: `JobStore.add_listeners`; the routed modules' `status_for`; the activity
feed's event names.

**Design**:
- **`sentry-sdk`** is re-added to `requirements.txt` and `requirements-build.txt`, pinned to a minor
  version, and to the sidecar spec's hidden imports as PyInstaller needs.
- **`src/cuepoint/reporting/engine_reporting.py`** sets Sentry up, first thing in `run_engine()`,
  before `backup_library_on_launch()`, so that a failure while starting is caught:
  - the DSN from `CUEPOINT_SENTRY_DSN` only (REPORT-08 builds it in). No DSN means no setup, and
    every call below does nothing;
  - the flag from REPORT-01, checked in `before_send` and `before_breadcrumb`;
  - `include_local_variables=False`, `send_default_pii=False`, `traces_sample_rate` unset,
    `max_request_body_size="never"`, `server_name=""`;
  - REPORT-02's scrubber as the last step of `before_send`;
  - release, `dist` and environment from REPORT-07's values, passed in the environment by main.
- **What is reported:**
  - **Escaped handler exceptions.** `EngineHandler.handle_error` is overridden: it reports, then
    answers `500 INTERNAL_ERROR` if no answer was started.
  - **Every 500.** `report_unexpected(exc, route=<template>)` is called from each route's
    `except Exception` in `server.py` and from every `status_for` fall-through. Each answer's
    envelope gains `error.report_id`, the Sentry event id, when one was made (fact 3). No refusal
    calls it (fact 2), and a test holds that.
  - **Failed jobs.** One `ended` listener on the job store reports a job that ends `FAILED`, with its
    type and error code. The cause the job runner caught is attached as the exception. Expected causes
    are not reported (DEC-153): their codes are listed once, in `reporting/expected.py`.
  - **Background threads.** `threading.excepthook` and `sys.excepthook` report (the SDK's threading
    integration), so a thread that dies outside a job is seen.
  - **Logged errors.** The logging integration turns every `ERROR` record into an event and every
    `INFO` and `WARNING` record into a breadcrumb. A test confirms it sees records under the
    `cuepoint` logger, whose propagation `LoggingService` turns off.
- **The steps before an error** (breadcrumbs), kept to the last 50:
  - each request's method, route template and status;
  - each job's start and end, with its type;
  - each activity event's type (not its summary);
  - the log records above, scrubbed.
- **Not reported:** refusals (fact 2); cancelled jobs; anything while the flag is off.
- **The CLI does not report** (DEC-151). It never sets the DSN or the flag.

**Tests**:
- With a fake transport that records events:
  - a handler that raises answers a 500 envelope with a `report_id`, and one event is recorded;
  - a 400, 401, 404, 409 and 503 record nothing;
  - a job that raises records one event with its type; a cancelled job and a job failing with an
    expected code record nothing;
  - a thread that raises outside a job records one event;
  - an `ERROR` log under `cuepoint.engine` records one event, and an `INFO` log a breadcrumb;
  - with the flag off, nothing is recorded, including an event captured just before it was turned
    off;
  - without a DSN, nothing is set up and nothing fails.
- Every recorded event passes REPORT-02's scrubber with nothing personal left (the property test's
  check, run on these events).
- The packaged sidecar builds, contains `sentry_sdk`, and passes the smoke check. Its size and cold
  start are recorded against PRUNE-08's figures.

**Acceptance criteria / DoD**:
- Every 500 path and every failed job reports once, and no refusal reports.
- The envelope carries `report_id`.
- All suites pass, and the sidecar's cold start grows by no more than 100 ms.

**Risks**: Medium. **Start-up time** is one risk, since `sentry_sdk` loads before the engine is
healthy, and the bench measures it. **A 500 path missed** is the other, and a test walks
`server.py`'s syntax tree for every `500` answer and asserts each calls `report_unexpected`.

**Complexity**: **M**

---

## REPORT-04 — Electron Main Reports, and Errors Keep Their Code Across the Bridge

**Objective**: Electron main reports its own failures, and every engine error that crosses into main
and the renderer keeps its status, code and report id.

**User-visible result**: None. Nothing is sent from a user's build yet.

**Dependencies**: REPORT-01, REPORT-02, REPORT-03.

**Existing code reused**: `engineClient.ts`'s readers; `preload.cjs`'s `withEngineWords`.

**Design**:
- **`@sentry/electron`** is added to the desktop workspace with `npm install`, pinned to a version
  that supports Electron 34.
- **Main sets Sentry up first,** at the top of `main.ts` before `app.whenReady`, from a new
  `electron/reporting.ts`:
  - the DSN from `CUEPOINT_SENTRY_DSN` only, until REPORT-08;
  - REPORT-01's choice, read synchronously, and checked in `beforeSend` and `beforeBreadcrumb`;
  - the plain transport, never the offline one (fact 7);
  - `sendDefaultPii: false`, no `serverName`, no tracing;
  - REPORT-02's scrubber as the last step of `beforeSend`;
  - native crash dumps off (DEC-149);
  - the SDK's main-process integrations for uncaught exceptions and unhandled rejections on, and
    those for screenshots and replay off.
- **Errors keep their code** (fact 3). `engineClient.ts` throws an `EngineError` carrying `status`,
  `code`, `message` and `reportId`. `preload.cjs` passes the code and report id through with the
  words, and `cuepointBridge.types.ts` describes the shape. The renderer's existing `catch` blocks
  keep working, since `message` is unchanged. The six contract files move together.
- **What main reports:**
  - its own uncaught exceptions and rejections (the SDK);
  - a renderer or helper process that is gone (`render-process-gone`, `child-process-gone`), with
    its reason and exit code, except a clean exit;
  - an `ipcMain.handle` handler that throws anything but an `EngineError` refusal. A small wrapper
    does this for every handler in one place;
  - `engine.start()`'s swallowed failure, once per launch;
  - an engine error below 500 is never reported, and one of 500 or above is reported only if it has
    no `reportId` (the engine could not report it itself). Otherwise main adds a breadcrumb naming
    the engine's report.
- **The steps before an error:** each bridge call's channel name and outcome (never its arguments),
  window focus and blur, engine and player status changes, and the app's lifecycle events.
- **One story across the bridge.** Main sends the SDK's trace headers on each engine request, so an
  engine report and the main or renderer report it led to share a trace id without any performance
  tracing (DEC-126). REPORT-04 confirms that both SDKs link errors this way with tracing off; if
  they do not, the `report_id` breadcrumb is the link.

**Tests**:
- `reporting.test.ts`, with a fake transport:
  - an uncaught exception in main records one event;
  - a throwing IPC handler records one event, and a handler that returns a refusal records none;
  - a 400 engine error records nothing; a 500 with a `reportId` records a breadcrumb, not an event;
    a 500 without one records an event;
  - the choice off records nothing;
  - no DSN, no setup.
- `engineClient` tests: every reader throws or returns an `EngineError` with the envelope's code,
  status and `report_id`.
- The desktop contract test, and `preloadErrors.test.ts` for the new fields.

**Acceptance criteria / DoD**:
- Main's failures report once each; engine errors are never reported twice.
- The renderer receives status, code and report id on every engine error.
- All suites pass, and the end-to-end suite passes.

**Risks**: Medium. **The SDK's defaults** are the risk (fact 7). REPORT-02's corpus holds a main
event with every default field.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-07), before REPORT-03 was committed: nothing in main needs the
engine's side, and an engine error without a `report_id` is simply reported by main until it has one.
`electron/reporting.ts` sets `@sentry/electron` **7.20.1** up first in `main.ts` (8.x needs Electron 35),
with the plain transport, an allowlist of integrations (no minidumps, sessions, console, context lines,
local variables, screenshots or fetch breadcrumbs), `sendClientReports: false` and IPC mode Classic. A
broken SDK load or `init` sets nothing up and the app carries on. `engineClient.ts` throws
`EngineError` (status, code, report id) from every reader.

Decided while building:
- **Electron drops an error's own properties at the context bridge.** The page gets a plain `Error`
  with the words only. So `preload.cjs` remembers the last 50 engine errors' fields by their words,
  and the renderer reads them with `bridgeErrorFields(error)` (`renderer/src/api/bridgeError.ts`).
- **An outage is not a bug report.** "Engine not running", a refused connection and an unavailable
  player are breadcrumbs; REPORT-05 reports the outage once. Any other failing IPC call is reported
  once per launch per channel and message.
- **One IPC wrapper.** Every `ipcMain.handle` goes through `handle()`, which records the channel and
  its outcome, never the arguments; polled channels are not recorded.
- **Trace headers** come from the SDK with tracing off and are added by `EngineClient.headers()`; the
  engine continues the trace (REPORT-03).
- A renderer or helper `killed`, and anything after quit begins, is a breadcrumb.
- Renderer feedback, sessions, logs, metrics, replay, spans and scope updates do not pass main's
  `beforeSend`; REPORT-06 keeps them off in the renderer.

Checked in the cloud container: the main-process suite (1199), the renderer suite (4220, one test fixed
for REPORT-02's quoting and one known-flaky StatusStrip test that passes alone), both type-checks, the
build, and `e2e/reportErrors.spec.ts` (5, against a fake Sentry server). The whole e2e suite ran once
before the review fixes: only the nine audio specs failed, as they do on Linux with no pinned mpv. Not
checked: a packed app.

---

## REPORT-05 — The Engine and the Player, Watched

**Objective**: Every time the engine or the player exits on its own, restarts or is given up on, a
report says so, with the last lines it wrote.

**User-visible result**: One fix. The engine's output is read, so it can no longer fill its pipes
and stall (fact 4). Nothing is sent from a user's build yet.

**Dependencies**: REPORT-04.

**Existing code reused**: `playerSupervisor.ts`'s `drainOutput`, `recentOutput` and `onSnapshot`;
`engineSupervisor.ts`'s `scheduleRestart`.

**Design**:
- **The engine's pipes are drained.** `engineSupervisor.ts` reads stdout and stderr as
  `playerSupervisor.ts` does mpv's, keeping the last 50 lines of each.
- **The engine reports,** from hooks at the points fact 4's survey found:
  - an exit that was not asked for, with its exit code or signal (`exit` handler);
  - each automatic restart, as a breadcrumb, and the restart that brings it back healthy;
  - giving up after `MAX_RESTART_ATTEMPTS`, as an event (today a silent `return`);
  - a health check that timed out at launch, and a bundled engine that is missing.
  A deliberate stop, a quit and a user's Restart are not reported.
- **The player reports** from one `onSnapshot` listener:
  - an exit that was not asked for, with its code;
  - each restart, as a breadcrumb;
  - giving up, as an event, with `gaveUpReason`.
  A playback failure on one file (`playbackFailures.ts`) is a refusal, not an error: the file is
  missing or unreadable, which the user owns. It becomes a breadcrumb.
- **What a report carries:** the process, its exit code or signal, the restart count, how long it
  had run, and the scrubbed tail of its output as an attachment (REPORT-02 scrubs it line by line).
- **One event per incident.** A crash loop of three restarts and a give-up is one event, with the
  restarts as breadcrumbs, so a flapping engine does not send four reports.

**Tests**:
- `engineSupervisor` with a stand-in engine that writes 1 MB to stdout and then answers health: it
  stays healthy (before the fix, it blocks; the test shows that first).
- A stand-in that exits with code 3: one event with the code and its tail; three exits in a row: one
  event and three breadcrumbs.
- A deliberate stop and a user's Restart: no event.
- `playerSupervisor` with the fake mpv already used by its tests: the same three cases.
- The tail attachment passes REPORT-02's scrubber.

**Acceptance criteria / DoD**:
- Every unasked-for exit, give-up and failed start of the engine or the player reports once per
  incident.
- The engine's output can no longer block it.
- All suites pass.

**Risks**: Low.

**Complexity**: **S**

---

## REPORT-06 — The Renderer Reports, and Shows an Error Screen

**Objective**: Every uncaught error in the renderer is reported, and an error while rendering shows
a screen the user can recover from instead of a blank window.

**User-visible result**: If the window would have gone blank, it shows "Something went wrong" with
**Reload** and, when a report was made, its short id. Nothing is sent from a user's build yet.

**Dependencies**: REPORT-04.

**Existing code reused**: `Toast.tsx`; `AppShell`'s `useLocation`; the bridge's new error shape.

**Design**:
- **The renderer sets Sentry up** in `main.tsx`, with `@sentry/electron/renderer`, before React
  renders. Its events go out through main, which scrubs them and applies the choice.
- **An error boundary** wraps `<App/>`. It reports the error with the component stack and renders
  the error screen in the app's pixel style, with **Reload** (reloads the window) and the report id.
  A second boundary around each destination keeps the sidebar and the player bar usable when one
  page fails.
- **Uncaught errors and rejections** report through the SDK's browser integrations.
- **The places that swallow errors today** (fact 6) are listed in the step's outcome. Each `catch`
  that ends in an error toast or an inline error reports, unless the error is an `EngineError`
  refusal or already carries a `reportId`. One helper does this, `reportUnexpected(error)`, so that
  no screen repeats the rule.
- **The steps before an error:**
  - each navigation, as the destination's id (`library`, `clean`), never the full hash, which can
    carry a search;
  - each error toast's kind (not its words);
  - the bridge calls main records (REPORT-04).

  Click, input and console breadcrumbs are off (fact 7).
- **Source maps.** `vite.config.ts` gains `build.sourcemap: "hidden"`, so maps are built for upload
  but not referenced by the shipped files. REPORT-07 uploads them and keeps them out of the
  installer.
- **"Report a problem"** (DEC-152). Help gains **Report a problem**: a box for a note, the app's
  version, and the id of the last report, sent as Sentry user feedback. The note is the user's own
  words, sent as written, and the dialog says so. With reporting off, the action is disabled and says
  why.

**Tests**:
- A component that throws while rendering shows the error screen, records one event with a component
  stack, and **Reload** reloads.
- A page that throws leaves the sidebar and the player bar working.
- `reportUnexpected`: a refusal records nothing; an error with a `reportId` records nothing; anything
  else records one event.
- Navigation breadcrumbs carry the destination id and nothing after it.
- **Report a problem** sends one feedback item with the note, the version and the last report's id,
  and is disabled with reporting off.
- The end-to-end suite gains one spec: a test-only bridge call makes a page throw, and the error
  screen appears.

**Acceptance criteria / DoD**:
- No render error leaves a blank window.
- Every uncaught renderer error reports once, and no refusal reports.
- All suites pass, and the end-to-end suite passes.

**Risks**: Low. The boundary changes what a user sees only where the window was blank.

**Complexity**: **M**

---

## REPORT-07 — Releases, Environments and Source Maps

**Objective**: Every report says which build sent it, in the same words from all three processes,
and stack traces from main and the renderer read as source.

**User-visible result**: The About dialog shows the app's version and its build (the commit).

**Dependencies**: REPORT-03, REPORT-04, REPORT-06.

**Existing code reused**: `check_desktop_version_coupling.py`; `desktop-electron.yml`'s build.

**Design**:
- **One release name:** `cuepoint@<version>`, with `<version>` from `version.py`'s `__version__`
  (fact 8). Main reads it from `package.json`'s `cuepoint.engineVersion`, which the coupling check
  already holds equal, and passes it to the engine in the environment. The renderer gets it from
  main.
- **`dist`** is the short commit, set at build time:
  - `desktop-electron.yml` writes it into the packaged app's metadata;
  - `build_engine_sidecar.py` writes it into the sidecar.
  `version.py`'s hard-coded February build number, commit and date are replaced by "unknown" when
  nothing sets them, so a build never claims to be another.
- **Environment:**
  - `production` for a packaged build;
  - `development` when run from source. A development run sends nothing unless
    `CUEPOINT_SENTRY_DSN` is set by hand (DEC-150).
- **Source maps:**
  - main: esbuild gains `--sourcemap=external`;
  - the renderer: REPORT-06's hidden maps.

  CI uploads both with `sentry-cli` (an npm dev dependency), tagged with the release and `dist`,
  then deletes them before electron-builder packs. The upload runs only when the `SENTRY_AUTH_TOKEN`
  secret is set, so a fork's build still passes.
- **The coupling check** also asserts that the release name built into main equals the one the
  engine reports at `/health`.

**Tests**:
- The coupling check's tests, for the new assertion.
- Main and the engine, started together in a test, report the same release, `dist` and environment
  in a recorded event.
- The packed app contains no `.map` file (checked after `npm run pack`).
- One event recorded from each process resolves to source in Sentry when sent to a test project by
  hand. This check is manual, and is recorded in the outcome.

**Acceptance criteria / DoD**:
- All three processes report one release and one `dist` per build.
- Main's and the renderer's stack traces read as source in Sentry.
- No map ships in the installer.

**Risks**: Low. **The secret** is the one thing CI needs from the user (DEC-148).

**Complexity**: **S**

---

## REPORT-08 — Reporting Turned On, the Notice Changed, and the Phase Comes Together

**Objective**: Turn reporting on in users' builds, and in the same step tell them what is sent and how
to turn it off (DEC-128).

**User-visible result**: Packaged builds send error reports unless the switch is off. The privacy
notice, Help → Privacy and the user guide say what is sent.

**Dependencies**: REPORT-01 to REPORT-07.

**Design**:
- **The DSNs are built in.** `electron/reporting.ts` and `engine_reporting.py` gain the project DSNs
  (DEC-148) as constants. A DSN only allows sending events, so it is safe to ship, as the Qt app did.
  `CUEPOINT_SENTRY_DSN` still overrides them, and `CUEPOINT_SENTRY_DSN=off` sends nothing.
- **The notices,** changed together:
  - `PRIVACY_NOTICE.md` and `docs/policy/privacy-notice.md` stop saying v1.0 collects nothing. They
    say what a report carries and never carries, where it is stored (Sentry, in the EU), how long it
    is kept, and how to turn it off. The two stay equal.
  - `docs/policy/telemetry.md` describes error reporting, and says the CLI's telemetry is separate,
    opt-in and off.
  - `docs/policy/data-processing-notice.md` names Sentry as the one processor.
  - `PrivacyDialog.tsx`'s "No telemetry or analytics" lines are replaced by the switch's state and a
    sentence from the notice.
- **The user guide** gains a short Privacy section on the Settings page's description, and
  `troubleshooting.md` says that the app reports errors on its own and how to find a report's id.
- **The changelog** gains one entry under Unreleased.
- **A day of real reports.** Before the release, a packaged build is used for a day by the user with
  reporting on, and every report it sent is read in Sentry for anything personal. Anything found is
  added to REPORT-02's corpus and fixed.

**Tests**:
- A packaged build with no `CUEPOINT_SENTRY_DSN` sends to the built-in DSN, and with
  `CUEPOINT_SENTRY_DSN=off` sends nothing (fake endpoint via a local relay in the end-to-end suite).
- `PRIVACY_NOTICE.md` equals `docs/policy/privacy-notice.md` (a test, if PRUNE-07 has not added one).
- `validate_compliance.py` checks the privacy dialog's new text.

**Acceptance criteria / DoD**: The phase-level acceptance below.

**Risks**: Low, once REPORT-02 to REPORT-07 hold. The day of real reports is the last check.

**Complexity**: **S**

---

## Phase-level acceptance

Phase 13 is complete when, in a **packaged build** on Windows and macOS:

1. An uncaught error in the engine, in main and in the renderer each arrives in Sentry once, with the
   steps before it. *REPORT-03, REPORT-04, REPORT-06.*
2. The engine killed from outside, and mpv killed from outside, each arrive as one report with the
   exit and the scrubbed tail of their output; a crash loop arrives as one report. *REPORT-05.*
3. A job that fails on a bug arrives once; a cancelled job, a refusal and an expected cause do not.
   *REPORT-03.*
4. An engine 500 seen by the renderer arrives once, from the engine, and the renderer's breadcrumb or
   trace names it. *REPORT-03, REPORT-04.*
5. No report carries a path's names, the user's name or home folder, a track, artist, label or
   playlist name, a note, a tag, a token, the machine's name or a local variable. Paths keep their
   extension and depth. Both scrubbers pass the shared corpus. *REPORT-02.*
6. Turning the switch off stops every process sending at once, with no restart; nothing is queued,
   and a crash at the next start-up sends nothing. *REPORT-01.*
7. All three processes report one release, `dist` and environment, and stack traces from main and
   the renderer read as source. *REPORT-07.*
8. A render error shows the error screen, not a blank window, and **Report a problem** sends a note
   with the last report's id. *REPORT-06.*
9. The privacy notice, `docs/policy/`, Help → Privacy and the user guide say what is sent and how to
   turn it off. *REPORT-08.*
10. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check,
    the end-to-end suite and `npm run dist`. The sidecar's cold start is within 100 ms of Phase 12's.
11. No decision in DEC-001…DEC-147 is contradicted. A contradiction stops the work and is raised
    rather than worked around.

## Deferred, with reasons

- **Performance traces and session replay.** Declined by DEC-126. Traces may be reconsidered after
  the first release (Q-126's recommendation).
- **A first-run notice.** Declined by DEC-128.
- **Native crash dumps.** Declined by DEC-149. A dump holds memory, which cannot be scrubbed.
- **The CLI.** Declined by DEC-151. It is a developer surface, and it has no Settings page.
- **Fixing the engine's two log folders** (fact 5), unless the user asks for it in REPORT-03. It
  changes what "clear logs" deletes.
- **Reporting from the website.** Phase 17's bug-report form says the app reports on its own
  (DEC-143).
- **Alerting rules and dashboards in Sentry.** They are set in Sentry, not in this repository.
