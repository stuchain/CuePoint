# CuePoint v1.0.0 — Phase 5: Player, Detailed Step Specifications

Status: **In progress. PLAYER-01…PLAYER-07 are implemented** (outcomes recorded under each
step); PLAYER-08…PLAYER-12 are described below and not started. Per the process, no implementation happens from this document — each step needs an
explicit "Implement PLAYER-NN" instruction, scoped to exactly that step, and its outcome is
recorded under the step afterwards.

Depends on Phase 1 (`PHASE1_FOUNDATION.md`), Phase 2 (`PHASE2_SHELL.md`), Phase 3
(`PHASE3_LIBRARY.md`) and Phase 4 (`PHASE4_LIBUI.md`), all complete, and on Decision Rounds 1–7
(`DECISIONS.md`, DEC-001…DEC-056). Phase 5's own decisions are DEC-049…DEC-056, alongside DEC-005
(libmpv), DEC-012 (double-click), DEC-013 (append actions), DEC-014 (no resume), DEC-025 (the
region), DEC-037 (files unchecked until Phase 7) and DEC-046 (the double-click seam Phase 4 left).

## What this phase is

Phase 4 built a table of 50,000 tracks that cannot make a sound. This phase is audio: a second
bundled sidecar, the control contract that drives it, the queue behind it, the bar that shows it,
and the settings that make DEC-005's quality claim audible rather than nominal.

It is also the phase with the most genuinely new *infrastructure* since Phase 1. Everything before
it added Python endpoints, Electron forwarding and React screens against a pipeline that already
existed. This one adds a second per-OS binary to the release, a second supervised child process,
and the first real-time state stream in the app.

**What this phase is not.** It writes nothing to the database (DEC-051) — no play counts, no
history, no activity entries per play. It draws no waveform (Phase 11) and analyses no audio
(Phase 12). It does not crossfade (DEC-056), does not resume position across restarts (DEC-014),
and does not check whether files exist ahead of time (DEC-037 — the player finds out by trying).
It does not touch Sets or Chapters (Phase 10), and it does not make the Rekordbox `play_count`
column mean anything new.

## What the earlier phases already built

The roadmap calls this phase "entirely greenfield", and for audio that is true — there is no
player code anywhere. The *scaffolding* it mounts into is not greenfield at all, and reading it
first is the difference between one new pattern and two.

| Already exists | Where |
| --- | --- |
| A supervised sidecar: spawn, bounded restart with backoff, health, status to the renderer | `electron/engineSupervisor.ts` (`MAX_RESTART_ATTEMPTS`, `RESTART_BACKOFF_MS`) |
| A per-OS sidecar build that lands in `resources/` and ships via `extraResources` | `scripts/build_engine_sidecar.py`, `apps/desktop-electron/package.json` |
| A dev/production launch split for a bundled binary | `electron/engineLaunch.ts` (`shouldUseBundledEngine`) |
| The IPC pattern: `ipcMain.handle` per method, narrow preload methods, context isolation | `electron/main.ts`, `electron/preload.cjs` |
| A push-event bridge from main to renderer, subscribe/unsubscribe with cleanup | `preload.cjs` `subscribeJobEvents`, `engine:jobEvent` |
| The player's layout row, its span, and the promise that it takes no space when empty | `components/shell/PlayerRegion.tsx` + its test |
| `play`, `pause`, `next`, `previous` pixel icons, drawn in FOUNDATION-14 and never used | `components/pixelIcons.ts` |
| A double-click seam on every table row, deliberately wired to nothing | `components/table/TrackTable.tsx` (`onRowActivate`) |
| Ordered ids for a whole query, across unloaded rows | `/api/v1/library/search?mode=browse&fields=id` |
| `file_path` already in the row shape the table and Inspector consume | `engine/library_api.py` (`track_to_dict`) |
| Toasts with variants and a provider | `components/Toast.tsx` (`useToast`) |
| The `localStorage`-backed UI-state pattern for persisted toggles | `components/shell/sidebarState.ts`, `components/table/trackTableLayout.ts` |
| Status strip and Activity panel, where a failing sidecar becomes visible | `components/shell/StatusStrip.tsx`, `ActivityPanel.tsx` |

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-049 | Bundled `mpv` binary, JSON IPC, fetched not committed | PLAYER-01, PLAYER-02, PLAYER-03 |
| DEC-050 | Electron main owns queue and transport | PLAYER-03, PLAYER-04 |
| DEC-012 | Double-click plays; the current view becomes the queue | PLAYER-05, PLAYER-09 |
| DEC-013 | Play Next and Add to Queue are explicit append actions | PLAYER-08, PLAYER-09 |
| DEC-053 | The bar appears on first play, not before | PLAYER-06 |
| DEC-052 | Transport, seek, volume, shuffle, repeat, queue panel | PLAYER-06, PLAYER-07, PLAYER-08 |
| DEC-046 | The double-click seam finally gets its meaning | PLAYER-09 |
| DEC-054 | A file that will not play is skipped, with one toast | PLAYER-10 |
| DEC-055 | Output device and exclusive output are user-controlled | PLAYER-11 |
| DEC-051 | Playback writes nothing to the database | every step — see below |
| DEC-014 | No position resume across restarts | PLAYER-04, PLAYER-12 |
| DEC-056 | Gapless, no crossfade | PLAYER-02, PLAYER-12 |

## Sequencing

```
PLAYER-01 (mpv acquisition, packaging, ADR-004)
      │
      ▼
PLAYER-02 (JSON IPC client — protocol only)
      │
      ▼
PLAYER-03 (PlayerSupervisor + the player IPC surface)
      │
      ▼
PLAYER-04 (queue and transport state in main)
      │
      ├───────────────┬────────────────┐
      ▼               ▼                │
PLAYER-05        PLAYER-06             │
(queue from      (the bar)             │
 a view)              │                │
      │               ├────────┬───────┤
      │               ▼        ▼       ▼
      │          PLAYER-07  PLAYER-08  PLAYER-10
      │          (shuffle/  (queue     (failures)
      │           repeat)    panel)
      │               │        │
      └───────────────┴────────┴───► PLAYER-09 (double-click + context menu)
                                            │
                                            ▼
                                     PLAYER-11 (audio output settings)
                                            │
                                            ▼
                                     PLAYER-12 (hardening, E2E, docs)
```

PLAYER-01 through PLAYER-04 are a chain — each one is untestable without the one before it.
Everything from PLAYER-05 on can be parallelized if desired, except PLAYER-09, which is the step
that makes any of it reachable by a user and therefore wants the pieces it triggers to exist first.

---

## Before starting any step — four cross-cutting facts

### 1. Only one step crosses the desktop contract

Despite DEC-050 keeping playback out of Python, **PLAYER-05 still touches the engine**: turning
"the current view" into a queue means asking the library for the ordered tracks of a query, which
is a library question, not a playback question. When PLAYER-05 lands, the AGENTS.md invariant
applies in full and all of these move in one change:

- Python: `engine/library_api.py` (the projection) and its service/repository call path
- `electron/engineClient.ts` — the typed parameter and response
- `electron/engineSupervisor.ts` — the forwarding method (the omission SHELL-04 paid for)
- `electron/main.ts` — the `ipcMain.handle` arm
- `electron/preload.cjs` — **the runtime preload**, not `preload.ts`
- renderer bridge types and consumers
- tests on both sides

Every other step in this phase is Electron-and-renderer only. If a step other than PLAYER-05 finds
itself editing `library_api.py`, that is a signal the design has drifted from DEC-050 and is worth
stopping over.

### 2. The second sidecar is a second *supervised* process, not a second engine

`EngineSupervisor` is the model, not the parent class. The engine speaks authenticated HTTP over
loopback; mpv speaks JSON lines over a named pipe or unix socket. The parts worth copying exactly
are the lifecycle shape — bounded restart attempts, backoff, an explicit status object the UI can
render, a visible failure rather than silence — and not the transport. Both processes must die
with the app: a leaked mpv holding an exclusive audio device after CuePoint exits is the worst bug
this phase can ship.

### 3. Nothing here writes to the database

DEC-051 is a phase-wide constraint, not a PLAYER-04 detail. No migration is added in this phase.
If a step wants one, the step is wrong. The player reads `file_path` from a row the library already
serializes and never writes back — not a play count, not a last-played timestamp, not a "this file
was missing" flag (that is Phase 7's, and DEC-054 says so explicitly).

### 4. Every step must leave the app usable without mpv

The engine sidecar is required for CuePoint to do anything. The player sidecar is not: a build
where mpv failed to download, a platform where it will not start, a user who never plays a track —
all must produce a working library browser with no player, not a broken app. `PlayerRegion`
already returns `null` when it has no children, which makes "no player" the natural default rather
than a special case to engineer.

---

## PLAYER-01 — mpv acquisition, packaging, and ADR-004

**What it is.** The build step that puts an `mpv` binary where the app can find it, and the
architecture record for why (DEC-049). No playback happens in this step; its deliverable is a
binary on disk, in a packaged app, with its licence beside it.

**Scope.**

- `scripts/fetch_player_sidecar.py`, in the image of `scripts/build_engine_sidecar.py`: resolves
  the platform, downloads a **pinned version** of the official prebuilt mpv for it, verifies a
  **recorded checksum**, unpacks into `apps/desktop-electron/resources/player/<win32|darwin|linux>/`,
  and smoke-tests the result by running `mpv --version` and asserting the expected version string.
- A pinned-source manifest (version, URL, SHA-256, licence URL per platform) committed as data, so
  the download is reproducible and auditable without reading the script.
- `extraResources` gains `resources/player/${os}` → `player`, alongside the existing engine entry.
- `resources/player/` is git-ignored. The binaries are **not** committed (DEC-049) — `large-file-check`
  and repository size both argue against it, and `resources/engine/` already sets the precedent
  that `resources/` is build output.
- `npm run pack:full` gains the fetch, so one command still produces a complete app.
- Licence text (LGPL plus mpv's dependency notices) is carried into the packaged app and into
  whatever the About/licences surface already shows; the `license-compliance` workflow learns that
  a bundled non-Python component exists and checks that its licence file is present.
- `docs/ui-overhaul/adr/004-player-backend.md` — the ADR the roadmap and DEC-005 have both been
  pointing at, which does not exist yet (`adr/` holds 001–003). It records libmpv over HTML5
  `<audio>`, the bundled-binary-plus-JSON-IPC shape over a native addon, and the consequences.
- Developer setup documents an override (`CUEPOINT_MPV_PATH`) for a system mpv, mirroring
  `CUEPOINT_PYTHON`, so contributors are not forced through the download.

**The format spike, folded in.** The roadmap has carried "validate FLAC/AIFF on Windows and macOS"
since Round 1. It belongs here rather than in its own step, because with a bundled mpv it is a
packaging assertion and not a codec gamble: the acceptance below runs the fetched binary against
small FLAC, AIFF, ALAC, MP3 and WAV fixtures and asserts a successful decode of each on each OS
that CI builds.

**Not in scope.** Spawning mpv from Electron (PLAYER-03), signing/notarization specifics beyond
confirming the packaged app still passes existing release gates, and Linux beyond best-effort
(AppImage is already the least-tested target).

**Acceptance.**

- `python scripts/fetch_player_sidecar.py` on a clean checkout produces a runnable mpv for the
  host OS, and refuses loudly on a checksum mismatch rather than continuing.
- A packaged build contains the binary at a path the app can compute, on Windows and macOS.
- Decode assertions pass for FLAC, AIFF, ALAC, MP3 and WAV.
- `git status --short` is clean after a fetch — nothing downloaded is tracked.
- The licence file ships and `license-compliance` fails if it goes missing.

**Risks.** The mpv distribution for each OS differs in shape (Windows ships an archive with the
executable; macOS commonly needs a Homebrew-built binary or a bundle); the manifest must encode
per-platform unpacking rather than pretending they are the same. macOS notarization of a
third-party binary inside the app bundle is the specific thing most likely to surprise, and the
step is not done until a *signed* packaged build has been produced at least once.

### Outcome (2026-09-05)

Implemented. `scripts/fetch_player_sidecar.py` pins, downloads, verifies, installs and smoke-tests
mpv v0.41.0-dev-gf5bcfb195; `scripts/player_sidecar_manifest.json` holds the pins;
`scripts/make_audio_fixtures.py` regenerates the five decode fixtures;
`scripts/check_bundled_licenses.py` is the licence gate; `third_party/mpv/` carries the licence
texts and `NOTICE.md`; ADR-004 is written. 132 tests pass (54 unit for the fetcher, 12 for the
licence gate, 23 integration against the real binary, the rest pre-existing in those files), plus
the full unit suite at 3276 passed / 45 skipped.

Five things the work changed about the plan, each because the code or the artifacts said so:

1. **The source is mpv's own CI builds, not a third-party one.** mpv publishes *no* binaries on
   its stable tags — `v0.40.0` and `v0.39.0` carry zero release assets — so the only first-party
   binaries live on the rolling `git-release` tag. They ship as `.zip` (stdlib-extractable, so no
   7-Zip dependency and no `py7zr`) and cover macOS as well as Windows. The cost is that pins
   expire when CI republishes, which is why `--update-manifest` exists and why a 404 is reported
   as a rotated pin naming the command that fixes it, rather than as a network error.
2. **Checksums are verified against upstream, not against ourselves.** The GitHub API publishes a
   SHA-256 per asset. The re-pin flow compares the download against *that*, so the manifest
   records what upstream says it published; a hash we computed from our own possibly-corrupt
   download can never silently become the pin.
3. **The licence is GPL, not LGPL.** See the correction note below — it changes the obligation,
   not the architecture.
4. **`${os}` does not mean what the engine's packaging assumes.** It expands to `mac`/`win`/`linux`
   (a Platform's `buildConfigurationKey`), never `darwin`/`win32`. The player's install
   directories use `${os}-${arch}` — the arch half because two macOS pins (arm64 and x64) would
   otherwise overwrite each other in one `mac` directory. Two unit tests hold both properties.
5. **No MP3 encoder ships in the bundled build** (`libmp3lame` absent, the MediaFoundation wrapper
   writes zero bytes) and this repository has no ffmpeg, so `tone.mp3` is a constructed, spec-valid
   MPEG-1 Layer III stream that decodes to silence. The other four fixtures carry a real 441 Hz
   tone, and the decode check asserts RMS on those rather than merely an exit code. `tone.mp3`'s
   frame count is what its check means, and `FORMAT_FIXTURES` marks it non-tonal so this is
   explicit rather than a quiet weakness.

**Verified, not assumed**: the pinned build carries FLAC, ALAC, WavPack, Monkey's Audio, AAC, MP3
and big-endian PCM decoders, plus `--input-ipc-server`, `--gapless-audio`, `--audio-exclusive`
and `--audio-device`; all five formats decode to real audio; a corrupt FLAC decodes to nothing (so
the check can fail); a packaged `--dir` build contains `resources/player/mpv.exe` and it runs from
there with its licences beside it.

**Not verified, and owed to the macOS pass**: signing and notarization of a third-party binary
inside the bundle — the risk this step flagged — could not be exercised here. Windows packaging
was verified without code signing, because electron-builder's `winCodeSign` extraction needs
symlink privileges this account does not have. The macOS `.app` bundles were extracted and their
layout verified on Windows, but never executed.

**Correction owed to DEC-049.** Its implications say "LGPL compliance is satisfied by shipping the
binary unmodified". The published builds are **GPL-2.0-or-later** — they include GPL components
such as `libdvdcss`, and no first-party LGPL *player* binary is published at all (only LGPL
`libmpv` development builds, which would need the native-addon approach DEC-049 rejected). The
decision's conclusion is unaffected, since an unmodified binary in a separate process is the shape
that works under either licence, but the obligation is the GPL's. ADR-004 records this; DEC-049's
bullet should be amended rather than left to mislead.

**Adjacent bug found, and fixed separately.** `resources/engine/${os}` in
`apps/desktop-electron/package.json` had the same macro mistake, and `build_engine_sidecar.py` wrote
`resources/engine/win32`. A packaged build printed `file source doesn't exist from=...\resources\engine\win`
and shipped **no Python engine at all** on Windows or macOS - confirmed by inspecting
`release/win-unpacked`, which contained `player/` and no `engine/`. Only Linux matched, by
coincidence, which is why it went unnoticed.

Fixed on the user's instruction as its own change rather than folded into PLAYER-01:
`PLATFORM_DIRS` now yields electron-builder's names, a new `platform_dir()` appends `${arch}` (the
engine has the same two-macOS-arches problem the player does), and both `extraResources` entries
use `${os}-${arch}`. `src/tests/unit/scripts/test_packaging_resource_paths.py` expands the macros
the way electron-builder does and asserts both sidecar builds write exactly there - it fails on the
unfixed code with 6 failures and Linux passing, which is the bug's real-world signature. Verified
end to end: a packaged build now contains both `engine/` and `player/`, and the packaged
`cuepoint-engine.exe` starts and answers `/health`.

---

## PLAYER-02 — The mpv control client

**What it is.** A pure protocol module — `electron/mpvClient.ts` — that speaks mpv's JSON IPC over
a socket and knows nothing about queues, tracks or React.

**Scope.**

- Connect to a named pipe (`\\.\pipe\cuepoint-mpv-<pid>`) on Windows and a unix domain socket in
  the app's temp directory elsewhere; the path is generated per instance, never fixed, so two
  CuePoint windows or a stale socket cannot collide.
- Newline-delimited JSON framing with partial-chunk buffering. This is the single most likely
  place for a subtle bug: a property observation can arrive split across two socket reads.
- Request/response correlation via `request_id`, a per-request timeout, and rejection of every
  in-flight request when the socket closes.
- Typed command wrappers for what later steps need: `loadfile`, `stop`, `set_property`
  (`pause`, `volume`, `mute`, `audio-device`, `speed`), `get_property`, `seek`, and
  `observe_property`.
- An event stream: `property-change` for `time-pos`, `duration`, `pause`, `eof-reached`,
  `idle-active`, plus `end-file` with its reason (which is how DEC-054 learns a file failed, and
  how PLAYER-04 learns a track ended naturally).
- Gapless configured explicitly (`--gapless-audio`), and no crossfade filter (DEC-056).

**Not in scope.** Process spawning (PLAYER-03), any notion of "next track", any React.

**Acceptance.**

- Unit tests drive the client against a fake socket server: a command resolves with its response,
  a split JSON line is reassembled, an unknown `request_id` is ignored rather than crashing, a
  timeout rejects, and a socket close rejects everything outstanding exactly once.
- No test in this step launches a real mpv process.

**Risks.** Windows named-pipe semantics differ enough from unix sockets that "it works on my
machine" is a real failure mode here; both paths need a test, and the CI matrix must exercise both.

### Outcome (2026-09-05)

Implemented as `apps/desktop-electron/electron/mpvClient.ts` with 59 tests in
`electron/mpvClient.test.ts`, all passing. The client connects, correlates requests, buffers
partial lines, times out, routes property observations, and exposes typed wrappers for the
commands and properties Phase 5 drives. It starts no process and knows nothing about tracks or
queues, as specified.

**A test harness had to be built first.** `electron/` had no way to run a unit test — which is why
`engineSupervisor` and `engineClient` have none — so this step adds vitest to the desktop workspace
(the renderer already used it), a `vitest.config.ts` scoped to `electron/**/*.test.ts` in a node
environment, an `npm test` script, and a CI step that runs it on all three operating systems. That
matrix is what discharges the step's stated risk: the tests drive the client against a real
`net` server, so Windows exercises a named pipe and macOS and Linux exercise a unix socket.

**Two bugs found, both by tests rather than by review.**

1. `createMpvSocketPath()` returned the *same* path when called twice in one millisecond — its
   entire purpose is uniqueness, and a supervisor restarting a dead player is exactly the caller
   that would hit it. A sequence number now separates them.
2. **mpv reports a failed file in `file_error`, not `error`.** The client read `error`, so the
   explanation was silently dropped — precisely the text DEC-054's "skipped, and here is why" toast
   is built from, meaning PLAYER-10 would have been built on a field that is always `undefined`.

The second was invisible to the unit tests, because the fake server produced the shape the
implementation assumed. It was found by driving the **real bundled mpv** (from PLAYER-01) once,
which answered with
`{"event":"end-file","reason":"error","playlist_entry_id":1,"file_error":"loading failed"}`. That
payload is now the fixture in the test, so the knowledge is committed rather than remembered, and
the client accepts the `error` spelling as a fallback.

**Verified against real mpv, not only against the fake** (a throwaway probe, since spawning is
PLAYER-03's scope): connect over a real named pipe, `get_property mpv-version`, an unknown property
rejecting as `MpvCommandError` rather than hanging, all five observed properties accepted,
`loadfile` of a fixture ending with `reason: "eof"`, `time-pos` changes arriving, and a missing
file ending with `reason: "error"` and its message. PLAYER-03 owns turning that probe into a
standing integration test, since it is the step that legitimately spawns the process.

**Not done here, and deliberately**: no reconnection (PLAYER-03's supervisor), no queue, no IPC to
the renderer, no process spawning. `MPV_BASE_ARGS`, `buildMpvArgs()` and `MPV_OBSERVED_PROPERTIES`
are exported for PLAYER-03 to consume so the flags the protocol depends on — `--idle`,
`--input-ipc-server`, and DEC-056's `--gapless-audio` with no crossfade filter — cannot drift away
from the client that relies on them.

**Adjacent finding, fixed immediately after.** `tsc -p tsconfig.json --noEmit` over `electron/`
reported 5 pre-existing errors in `main.ts`: `dialog.showOpenDialog(win ?? undefined, ...)` at five
call sites. Not bugs — Electron ignores a falsy first argument, so the dialogs worked — but
`undefined` selects neither overload, and those five errors were the only thing keeping the main
process out of CI's typecheck. Replaced with `showOpenDialogFor`/`showSaveDialogFor` helpers that
pick the overload explicitly, behaviour unchanged, and `npm run typecheck` now runs over
`electron/` in CI.

The point was never the five errors. Nothing type-checked the process that spawns both sidecars,
owns the IPC surface, and under DEC-050 is about to own all playback state — and PLAYER-03 adds
the supervisor and the whole `player:*` surface to that same file. Turning the gate on before that
code is written is worth considerably more than turning it on after. Verified as a real gate by
planting a type error and watching it fail, and as behaviour-preserving by the 26-test Playwright
suite against the packaged app.

---

## PLAYER-03 — `PlayerSupervisor` and the player IPC surface

**What it is.** The lifecycle owner — `electron/playerSupervisor.ts` — plus the `player:*` IPC
methods and the state-push channel the renderer will subscribe to.

**Scope.**

- Spawn the bundled mpv with `--idle=yes --no-video --input-ipc-server=<path>` (plus the audio
  options PLAYER-11 will make configurable), resolved through a `playerLaunch.ts` that mirrors
  `engineLaunch.ts`'s bundled/dev split and honours `CUEPOINT_MPV_PATH`.
- Bounded restart with backoff, reusing `EngineSupervisor`'s constants and shape; a `PlayerStatus`
  object (`available`, `reconnecting`, `restartAttempts`, `error`) pushed to the renderer.
- **Lazy start**: mpv is spawned on the first play, not at app launch, so a user who never plays
  a track never pays for a second process — and, with DEC-053, the bar and the process appear at
  the same moment.
- Shutdown on `before-quit` and on window close: terminate, wait, then kill. A leaked process
  holding an audio device is an explicit acceptance criterion, not a nicety.
- `ipcMain.handle` arms for `player:play`, `player:pause`, `player:toggle`, `player:next`,
  `player:previous`, `player:seek`, `player:setVolume`, `player:getState` — and a
  `player:subscribeState` / `player:state` push pair following `subscribeJobEvents`'s exact
  refcount-and-cleanup pattern.
- Narrow preload methods under a `player` namespace on `window.cuepoint`. No socket path, no
  process handle, no file path resolution is exposed to the renderer.
- Player unavailability is surfaced in the status strip alongside engine status, distinguishable
  from it — "audio unavailable" is not "engine offline" and must not read as one.

**Not in scope.** The queue (PLAYER-04), any UI beyond the status-strip line, audio device
selection (PLAYER-11).

**Acceptance.**

- With mpv present, a `player:play` on a fixture file produces audible playback in a dev run and
  a state stream in the test harness; `getState` agrees with what the stream last pushed.
- With mpv absent or unstartable, the app launches, the library works, playback attempts report a
  clear error once, and nothing retries in a loop.
- Killing mpv externally triggers bounded restarts, then a visible stopped state.
- Quitting the app leaves no mpv process behind on Windows and macOS — asserted, not assumed.

**Risks.** Lazy start interacts with PLAYER-10: the first play of a session must not report
"file failed" when what actually failed was starting mpv. The two failures are different sentences
and the code must be able to tell them apart.

### Outcome (2026-09-05)

Implemented as `electron/playerLaunch.ts` (18 tests), `electron/playerSupervisor.ts` (43 unit,
14 integration against the real binary), the `player:*` IPC surface in `main.ts`, a narrow `player`
namespace in `preload.cjs`, and the status-strip line with `usePlayerStatus.ts` (12 renderer
tests). 137 main-process tests and 993 renderer tests pass; both typechecks are clean.

`playerLaunch.ts` deliberately imports nothing from Electron, so every path it resolves — Windows,
both macOS arches, the `CUEPOINT_MPV_PATH` override, the macOS `.app` layout — is checked from
every platform rather than only on the one that happens to be building. `PlayerSupervisor` takes
its `spawn` and its client as options for the same reason: `engineLaunch.ts` reads `app.isPackaged`
at module scope, which is exactly why `EngineSupervisor` has no unit tests to this day, and
repeating the pattern would have repeated the consequence.

**Three bugs found, each by a different kind of test.**

1. **A failed connect left the client permanently closed** (`mpvClient.ts`). mpv does not create
   its IPC socket the instant its process exists, so the supervisor retries — and every retry
   failed with "client is closed". This would have broken the **first play of every session**. It
   was invisible to PLAYER-02's unit tests, which only ever connected to a server that was already
   listening, and invisible to the manual probe, which slept before connecting. The integration
   test found it immediately. `close` is now fatal only for the socket that actually became the
   live connection, which also stops a stale attempt from tearing down a later, working one.
2. **The restart budget never bound anything.** Resetting the attempt counter whenever a start
   *succeeded* meant mpv that launches cleanly and then dies — failing to open an audio device,
   say — restarts forever, since starting succeeds every time. That is precisely the unbounded
   loop the bound exists to prevent. The counter is now cleared by evidence the player *worked*:
   surviving `PLAYER_STABLE_UPTIME_MS`, or a deliberate play.
3. **A test harness silently dropped an option**, so a restart test was measuring default
   behaviour rather than the case it named. Caught by the `electron/` typecheck gate turned on
   immediately before this step — which is the return on that decision, arriving one step later.

**Verified end to end in the real packaged shell**, not only in unit tests: launching the app with
Playwright, `window.cuepoint.player` exposes exactly ten methods and no socket path, process handle
or binary path; `getState()` reports `running: false` before any play (lazy start); `player:play`
on a real fixture returns `{ok: true}`, brings `running` to true, and delivers **11 state pushes**
to the renderer with the correct file path. `getSnapshot()` agrees with the last pushed snapshot.
No `mpv.exe` survived the app closing.

The integration tests assert the acceptance criteria against the real binary: mpv starts on first
play and not before, real duration reaches the supervisor, a track ends with `eof`, a missing file
ends with `error` **and mpv's own message**, an externally killed process is restarted, and — the
worst failure this phase could ship — **no process is left behind**, asserted against the real pid
rather than assumed.

**Scope corrections, both deliberate.**

- **No `player:next` or `player:previous`.** This step's bullet list named them, but they are queue
  operations and DEC-050 puts the queue in PLAYER-04. Shipping endpoints that cannot do anything
  would contradict DEC-025's own reasoning about controls that do nothing; PLAYER-04 adds them when
  they can mean something.
- **The status strip stays silent unless the player broke.** "Player unavailability is surfaced in
  the status strip" cannot mean a permanent line on a Linux build that bundles no mpv, or on a
  checkout where nobody ran the fetch script — the strip is always on screen, so anything it says
  permanently is noise. It speaks when the player was in use and is now reconnecting or has given
  up, and the never-installed case is reported when someone actually tries to play something.

**Owed to PLAYER-04**: gapless (DEC-056) needs mpv to know the *next* file before the current one
ends, which means using mpv's own playlist (`loadfile … append`) rather than loading one file at a
time on `end-file`. Loading on end-file is correct for a single track and would put a gap between
every pair of tracks in a queue. The supervisor already accepts an append mode; PLAYER-04 has to
decide the preload policy, and it is the step where "gapless" stops being a flag and starts being a
behaviour worth testing.

---

## PLAYER-04 — Queue and transport state in Electron main

**What it is.** The model DEC-050 puts in main: what is queued, what is playing, what happens when
a track ends. Written as a pure module (`electron/playbackQueue.ts`) that the supervisor drives, so
the interesting rules are testable without a process, a socket or a window.

**Scope.**

- Queue state: an ordered list of queue items (`{ trackId, filePath, title, artist, durationSeconds }`),
  the current index, and a per-item status (`pending` / `playing` / `failed`).
- Transport state: playing/paused, position, duration, volume — mirrored from mpv's properties,
  never invented locally.
- Operations: `replaceQueue(items, startIndex)` (DEC-012/DEC-013's "play replaces"),
  `playNext(items)` (insert after current), `addToQueue(items)` (append), `removeAt`, `moveItem`,
  `jumpTo`, `next`, `previous`.
- Advance rules: end-of-file advances; end of queue stops; `previous` within the first ~3 seconds
  goes to the previous track, otherwise restarts the current one (the convention every player
  shares, worth stating so it is not re-litigated in review).
- Shuffle and repeat live here as *order* rules, not decoder settings (PLAYER-07 supplies the UI):
  shuffle holds a shuffled index order alongside the queue's natural order and un-shuffling
  restores it with the current track kept current; repeat-one replays the current index; repeat-all
  wraps at the end.
- **No persistence.** DEC-014 and DEC-050 together mean this module has no serialization at all —
  no `localStorage`, no file, no database. Quitting loses the queue by design.

**Not in scope.** Where items come from (PLAYER-05), how failures are reported (PLAYER-10), UI.

**Acceptance.** Unit tests covering: replace vs. play-next vs. append ordering; removing the
playing item; removing an item before the playing one (the index must follow the track, not the
slot); end-of-queue with each repeat mode; shuffle then un-shuffle preserving the current track;
`previous` on both sides of the 3-second boundary; and an empty queue rejecting every transport
operation without throwing.

**Risks.** Index bookkeeping under mutation is where this kind of module always breaks. Tracking
the current item by identity and deriving the index — rather than storing an index and patching it
on every mutation — is the design that survives; the tests above are written to catch the other one.

### Outcome (2026-09-05)

Implemented as `electron/playbackQueue.ts` (59 tests) and `electron/playbackController.ts`
(36 unit, 10 integration against real mpv), with the queue exposed over IPC and through the
preload. 242 main-process tests and 993 renderer tests pass, twice in a row; both typechecks,
lint and the 26-test Playwright suite are green.

The queue holds the current track by identity and derives the index, as the risk note asked. The
tests that matter are the awkward ones: removing the row *above* the playing track leaves it
playing and still advances correctly, reordering across it does not disturb it, and shuffling
mid-track keeps it current and restores the original order when switched off.

**Gapless is the substance of this step, and it decided the design.** `--gapless-audio` only
removes the gap *inside mpv's own playlist*, so waiting for `end-file` and then loading the next
track would put a gap between every pair — the exact thing DEC-056 rules out. The controller
therefore appends the next track while the current one is still playing and lets mpv walk into it.
That means mpv decides the moment of the transition and CuePoint notices afterwards, which is done
with **playlist entry ids**: `loadfile` returns the id of the entry it creates and `start-file`
reports the id mpv began. Probing the real binary settled why ids and not positions —
`playlist-pos` reads `-1` until playback actually starts, and indices shift as the playlist is
edited. Manual next/previous/jump use `replace` instead: a gap there is not a defect, because the
user asked for the change and expects it now.

**Three defects found, two of them real.**

1. **A finished queue reported a track as still playing.** Clearing the current id at the end left
   the last item's status at `playing`, so a snapshot said "nothing is current" and "this one is
   playing" at once — the queue panel would have drawn a stopped track as running. Found by
   reading the state after a real queue finished in the packaged app, not by a unit test.
2. **`append-play` would have started music nobody asked for.** I briefly switched the preload to
   it while chasing a failure. It is worse than it looks: after a queue finishes mpv is idle and
   `peekNext()` answers with the *first* track, so any later queue edit would have appended-and-
   played it spontaneously. Reverted to `append`, and the controller now refuses to preload at all
   while nothing is playing.
3. **A test that could not have passed.** The "carries on past a broken file" integration test
   sampled item status after the fact, but the fixtures are a quarter of a second long, so the
   recovery track had played *and finished* before the assertion looked. It now records transitions
   from the snapshot stream. Probing mpv directly proved the product behaviour was right all along
   — entry 1 fails, entry 2 starts — which is why the fix belonged in the test.

**Verified against real mpv**, not only the fake: a three-track queue plays end to end unattended
(mpv cannot start a file it was never given, so an unattended advance *is* the evidence the preload
worked), repeat-one loops, repeat-all wraps, a broken track is recorded and skipped past, removing
the playing track hands over immediately, and editing or shuffling around a playing track does not
interrupt it. Verified end to end in the packaged shell too: `playQueue` over IPC plays three
tracks through to the third with no manual `next`, 24 state pushes reach the renderer, shuffle and
repeat round-trip, and the queue ends with nothing marked playing.

**Scope note.** `player:play(filePath)` from PLAYER-03 is gone, replaced by `player:playQueue`.
Everything that plays now goes through the queue, so the queue and what is actually playing cannot
disagree — a single-track play is a one-item queue. `next` and `previous`, deferred from PLAYER-03
because there was no queue to make them mean anything, exist now, along with the queue editing and
order operations PLAYER-07 and PLAYER-08 will put controls on.

**Not done here, deliberately**: no UI (PLAYER-06/07/08), no toast for a failed track (PLAYER-10 —
the item is marked `failed`, and reporting it is that step's), and nothing is persisted anywhere,
per DEC-014 and DEC-050. A test asserts the queue exposes no serialization at all, because that is
the first step someone would take toward restoring it.

---

## PLAYER-05 — Turning a view into a queue

**What it is.** DEC-012 says double-click "loads the current view's visible tracks as the queue".
With DEC-040's windowed table, the renderer holds a window of maybe 200 rows out of 47,913 — so
"the current view" is a *query*, not an array, and this step is what resolves one into playable
items. **This is the phase's only desktop-contract step.**

**Scope.**

- Extend the existing `fields` projection on `/api/v1/library/search?mode=browse` with a compact
  queue projection — `fields=queue` returning `{ id, title, artist, duration_seconds, file_path }`
  — refused-not-ignored for any other value, exactly as `fields=id` already behaves.
  This reuses DEC-023's one query path rather than adding a second, and it exists because the
  alternatives are both bad: `fields=id` alone cannot fill a queue panel, and full rows carry 18
  fields per item when a queue needs 5.
- A cap and paging: resolving a view means asking for the whole ordered result, which at 50,000
  rows is a real payload. The queue resolves in pages, and there is an explicit maximum queue size
  with a visible, honest message when a view exceeds it rather than a silent truncation.
- The renderer resolves the *current* query — same `q`, `playlistId`, `filters`, `sort`, `dir` the
  table is showing — so the queue is in the order the user is looking at, which is the whole point
  of DEC-012.
- The full contract chain: Python, `engineClient.ts`, `engineSupervisor.ts` (the forwarding
  method), `main.ts`, `preload.cjs`, renderer types, tests on both sides.

**Not in scope.** The gesture that triggers it (PLAYER-09); the panel that displays it (PLAYER-08).

**Acceptance.**

- The projection returns items in the same order as `mode=browse` with the same parameters — a
  test asserts the two agree for a filtered, sorted, playlist-scoped query.
- An unknown `fields` value is rejected with the existing error envelope, not ignored.
- Resolving a view of N tracks issues a bounded number of requests, and a view above the cap
  produces a queue at the cap plus a message saying so.
- Response shape is additive — every existing consumer of this endpoint is unaffected.

**Risks.** Paging without a stable tiebreak repeats or skips rows, which LIBUI-01 already solved
for the table; this step must use the same ordering guarantee rather than a new one, or a long
queue will quietly contain duplicates.

### Outcome (2026-09-05)

Implemented across the full contract chain: `build_select_queue` in `track_query.py`,
`browse_queue` on the repository, `browse_queue_tracks` on the service, a `QueueTrack` model,
`fields=queue` on `/api/v1/library/search`, the typed parameter and row in `engineClient.ts`, a
`queueResolver.ts` in main, the `player:playView` IPC arm, the runtime preload and the renderer
bridge types. 23 new engine tests, 21 resolver tests, and one end-to-end test that crosses every
layer at once. 3,317 Python tests, 263 main-process tests, 993 renderer tests, 27 E2E, both
typechecks, ruff and lint all pass.

**The projection is a third view of one query, not a second query path.** `build_select_queue`
reuses the same predicate, the same scope and the same `_order_by` as `build_select` and
`build_select_ids` — including the row-id tiebreak the risk note names — so paging a long queue
cannot repeat or skip a track. The acceptance criterion is tested directly rather than argued:
`fields=queue` and `mode=browse` are asserted to return identical ids for the default order, four
different sorts, a text query, a filtered view, a playlist-scoped view, and all of them at once.
A separate test pages the queue two rows at a time and asserts the pages join up into exactly the
browse order with nothing duplicated.

**Resolution happens in main, not the renderer.** The renderer sends the *query* it is showing;
main asks the engine and keeps the result, which is where DEC-050 puts the queue. The alternative —
resolving in the renderer — would send up to fifty thousand rows across IPC twice, out to a
renderer that never needs to see them and back again. The cap is `QUEUE_MAX_TRACKS = 50,000`,
matched to the engine's own ceiling for one projection request and to the library size LIBUI-01 was
measured against, so it is "the largest library CuePoint supports" rather than a smaller number
invented here. Above it the queue is cut short and `playView` returns `truncated` with a message
naming both numbers, because doing less than was asked without saying so is the one outcome that is
not acceptable.

**Two defects found by the gates rather than by review.**

1. **An interface left behind.** `browse_queue` was added to `TrackRepository` but not to
   `ITrackRepository`, so the service called a method its own interface did not declare. The mypy
   foundation gate caught it — exactly the gap FOUNDATION-01 formalised those interfaces to
   prevent.
2. **A filter syntax I got wrong** (`op` rather than `operator`) made two agreement tests fail
   against the real engine — worth noting only because it is the kind of thing a mocked test would
   have accepted happily.

**Verified end to end**, in `e2e/playerQueue.spec.ts`: the app imports a Rekordbox export whose
tracks point at the repository's real audio fixtures, then plays the view sorted by artist
descending starting at its second row. The resulting queue is asserted **equal to what the table
itself returns for the same query**, the second row is what is playing, and mpv is running. That is
the one test that proves the chain is joined up; each layer's own tests cannot.

**Scope notes.** The gesture that triggers this is PLAYER-09's and the panel that shows the queue
is PLAYER-08's — nothing in the renderer calls `playView` yet, and the bridge type is what
PLAYER-09 will reach for. DEC-013's Play Next and Add to Queue over a *selection* are not resolved
here either: a selection that crosses unloaded rows is a list of ids rather than a view, which is a
different query shape, and PLAYER-09 is where the selection semantics get decided.

---

## PLAYER-06 — The player bar

**What it is.** The UI DEC-052 specifies and DEC-053 times: transport, seek, volume and
current-track information, mounted into the region DEC-025 reserved in Phase 2.

**Scope.**

- `components/player/PlayerBar.tsx` rendered as `PlayerRegion`'s children, so `PlayerRegion.tsx`
  gains a child and loses nothing — its `if (!children) return null` and the test asserting a
  childless region takes no space both stay exactly as they are (DEC-053).
- Visible from the first play and for the rest of the session; a session with no play never shows
  it. Ending playback leaves the bar showing the last track, paused — there is no control that
  retracts it.
- Contents: play/pause (the FOUNDATION-14 `play`/`pause` icons, finally used), previous/next, a
  seekable position bar with elapsed and total time in the `--font-data` face (DEC-048 — these are
  dense numerals changing every second, exactly what that token is for), a volume control with
  mute, and the current track's title, artist and key/BPM.
- A subscription to `player:state` with proper cleanup; the renderer holds no authoritative
  playback state (DEC-050) and sends intents rather than mutating.
- Seek is a drag with a preview time that commits on release, not a seek per pixel — a seek per
  mouse-move over a network volume is a stutter machine.
- The content region resizes under the bar without losing table scroll position or its loaded
  window (DEC-053's stated cost, and the acceptance below checks it).

**Not in scope.** Shuffle/repeat controls (PLAYER-07), the queue panel and its toggle (PLAYER-08),
device settings (PLAYER-11), any waveform (Phase 11).

**Acceptance.**

- Component tests: renders nothing before a first play; renders transport, times and track info
  after; play/pause reflects pushed state rather than local optimism; seek commits once on release;
  volume changes are sent and reflected.
- The existing `PlayerRegion` zero-height test still passes unmodified.
- A packaged run at 1×, 2× and 3× scale shows no horizontal overflow and no clipped controls;
  contrast and hit targets re-checked per `apps/desktop-electron/docs/design-signoff.md`.

**Risks.** A position stream at 10Hz re-rendering a table of 200 virtualized rows is the
performance trap here. Position state must be isolated to the bar's own subtree.

### Outcome (2026-09-05)

Implemented as `components/player/` — `PlayerBar.tsx` and its CSS, `PlayerSlot.tsx`,
`playerFormat.ts` and `playerStore.ts` — with 55 component tests, plus `e2e/playerBar.spec.ts`
measuring the bar in the running app. 1,058 renderer tests, 263 main-process tests, 28 E2E, both
typechecks, lint, ruff and the Python suites all pass.

**The performance risk is addressed by construction, and tested.** A `playerStore` holds one bridge
subscription for the whole renderer and hands out slices through selectors, so a component
re-renders only when *its* value changes. The status strip now selects the message rather than the
snapshot, which means it repaints when the player's health changes and never for a moving position;
a test asserts that pushing three positions in a row re-renders a track-selecting component zero
times, and that three readers still make one IPC subscription. Without that, every component reading
playback state would repaint several times a second for the length of every track — the kind of
problem that only shows up on a real library, on a slow machine, long after the code was written.

**Nothing is optimistic (DEC-050).** Every control sends an intent and waits to be told what
happened; a test asserts the play button does *not* flip on click and only changes when main says
so. A transport that flips its own icon and then finds the command failed tells the user something
untrue about a process they cannot see. The single exception is the seek slider mid-drag, which
holds a local preview so an arriving position cannot yank the handle away from the pointer, and
commits exactly one seek on release — tested in both directions.

**Three things the work changed.**

1. **Key and BPM were added to the queue projection.** PLAYER-05 justified five fields; the bar
   needs what a DJ actually reads off a player, and fetching it per track change would flash empty
   at every transition. Two small columns across the same query, additive at every layer, and
   PLAYER-08's panel gets them too.
2. **The transport button now derives from `playing`, not `paused`.** Idle is not paused: with
   nothing loaded `paused` is false, so a button derived from it offered to *pause* silence. Found
   by the no-bridge test.
3. **Hit targets were wrong and are now the app's own.** The buttons had a hand-picked 32px floor,
   which measured 56px at 2× against the 88px `--hit-min` standard `ToolbarIcon` and `Button` use.
   They now size from the token: measured 44 / 88 / 132 px at 1× / 2× / 3×.

**Measured in the running app, not asserted by eye.** `e2e/playerBar.spec.ts` reads sizes out of the
packaged shell: the region is 0 px tall with no children before the first play (DEC-025's promise,
kept), and at all three scales nothing overflows the viewport, nothing is clipped by the bar, and
the transport meets the floor. It applies scale the way the app does — the `data-scale` attribute
*and* the `--scale` custom property; an earlier version of this check set only the attribute, which
changed no sizes and would have passed while testing nothing. `docs/design-signoff.md` records the
numbers.

**Not visible to a user yet, and that is the sequencing.** Nothing in the UI can start playback
until PLAYER-09 wires double-click and the context menu, so the bar is reachable only through the
queue API. That is why there is no CHANGELOG entry: the feature is not user-visible until the
gesture exists. Shuffle, repeat and the queue panel are deliberately absent (PLAYER-07, PLAYER-08),
and the model behind all three already exists from PLAYER-04.

---

## PLAYER-07 — Shuffle and repeat

**What it is.** The two persisted toggles DEC-052 includes, over the order rules PLAYER-04 already
implements.

**Scope.**

- Shuffle on/off and repeat off/one/all, as controls in the bar with new pixel icons drawn to
  `PIXEL_DESIGN_SYSTEM.md`'s rules (repeat needs three visually distinct states, not two plus a
  badge).
- Persisted with the established `localStorage` UI-state pattern (`sidebarState.ts`,
  `trackTableLayout.ts`), not a new mechanism, and restored at launch — these are preferences, not
  playback position, so DEC-014 does not apply to them.
- Turning shuffle on while playing keeps the current track playing and shuffles what follows;
  turning it off restores the view's order with the current track still current. **The view itself
  never changes** — shuffle reorders the queue, not the table (DEC-052).

**Not in scope.** Any change to how the queue is built (PLAYER-05) or displayed (PLAYER-08).

**Acceptance.** Unit tests for the order rules already exist from PLAYER-04; this step adds
component tests for the toggles and their persistence, and an assertion that toggling shuffle does
not reorder, refetch or scroll the table.

### Outcome (2026-09-05)

Implemented as two controls in the bar over PLAYER-04's existing order rules, with
`playerOrderState.ts` for persistence and three new pixel icons. 87 player tests (1,107 renderer in
total), 263 main-process, 29 E2E, both typechecks, lint — all pass.

**Three drawings for three states, enforced rather than intended.** DEC-052 asked for three
visually distinct repeat states rather than two and a badge, so `repeat-one` is its own 12×12 glyph
beside `repeat` and `shuffle`. The icon suite already refuses duplicate artwork, which turns that
decision into something a test can fail on, and a component test asserts the `repeat-one` glyph is
the one rendered in that state.

**Persistence is a preference, not playback state.** DEC-014 rules out restoring what was playing
and where it had got to; it says nothing about how someone likes their queue ordered, and a shuffle
setting that silently reset each launch would be a bug rather than a decision. Stored in
`localStorage` the way the sidebar's state and the table's columns already are — never in main,
which owns the live order and is *told* the preference at startup.

**Restoring happens at the shell, not in the bar**, and that timing is the substance: the bar does
not exist until the first play (DEC-053), so restoring from it would reorder a queue the user had
already started listening to. `useRestorePlayerOrder()` runs once in `App`, before anything is
queued, and sends the defaults explicitly rather than assuming main starts in the same state — the
two would drift the moment either default changed.

**Nothing is persisted that did not take effect.** The toggles await main's acknowledgement before
writing to storage, so a failed command leaves the remembered preference untouched; a test forces a
rejection and asserts storage stays empty. The buttons themselves show what main reports, never the
click.

**Two testing faults found and fixed, both of the same kind — a test that passed while proving
nothing.**

1. The table-isolation test compared "rows before" with "rows after" and both were **empty**: jsdom
   lays nothing out and has no `ResizeObserver`, so the virtualised table rendered no rows at all,
   and the comparison was `[] === []`. Found by adding a guard assertion on the *content* of the
   list before comparing it. It now installs the same layout fakes `LibraryScreen.test.tsx` uses,
   compares whole rows rather than one column, and asserts six specific rows are there first.
2. A first version of the same file mocked a library summary with `source: null`, which is the
   "nothing imported yet" state — so the page rendered the import prompt and there was no table to
   leave alone.

**Verified in the running app** (`e2e/playerOrder.spec.ts`): pressing the controls changes the
queue's order settings in the main process, repeat cycles off → all → one with its own glyph, and —
the half no single session can exercise — the preference is still applied after closing and
reopening the app on the same profile.

**The acceptance criterion, met explicitly**: toggling shuffle does not reorder the table's rows,
does not re-run its query (asserted on the browse call count — at 50,000 rows a refetch per press is
exactly what DEC-040's windowing exists to avoid), does not scroll it, and does not change the sort
it is showing.

---

## PLAYER-08 — The queue panel

**What it is.** The largest single piece of UI in the phase, and the reason DEC-052 chose the wider
option: DEC-013 makes "Play Next" and "Add to Queue" first-class actions, and an append whose
result is invisible is an append the user cannot verify or undo.

**Scope.**

- A panel opened from the bar showing the queue in order, with the current item marked, upcoming
  items after it, and already-played items still visible above (a queue is a place, not a stack).
- Drag reordering, remove-from-queue, and double-click to jump to an item — each an operation
  PLAYER-04 already exposes.
- Windowed rendering. A queue can be tens of thousands of items (PLAYER-05's cap), so this reuses
  the virtualization already proven in `TrackTable` rather than rendering a list.
- Items hydrate from PLAYER-05's compact projection as the panel scrolls; the queue holds enough to
  play without holding enough to display everything.
- Items that failed to play are marked (DEC-054's "visible after the toast is gone").
- Empty state when the queue is empty but the bar is present — the paused-after-last-track case.

**Not in scope.** Saving a queue as a Collection (Phase 6), Sets (Phase 10).

**Acceptance.** Component tests for ordering, current-item marking, reorder, remove and jump;
a test that removing the playing item advances rather than stalling; a test at 5,000 items
asserting a bounded number of rendered nodes.

**Risks.** Drag-and-drop plus virtualization is the combination that produces flaky tests and
janky pointer behavior. Reordering must be expressible without dragging as well — keyboard, or a
menu action — both for accessibility and so the behavior can be tested without simulating drags.

---

## PLAYER-09 — Double-click and the track context menu

**What it is.** The step that makes everything above reachable, and the one that finally answers
DEC-046: the seam Phase 4 left wired to nothing gets DEC-012's meaning.

**Scope.**

- `onRowActivate` on the library table resolves the current view (PLAYER-05), replaces the queue
  (PLAYER-04), and starts playback at the activated row (DEC-012). No other table changes.
- A track context menu, shipping here rather than in Phase 4 exactly as DEC-046 planned, with
  **Play**, **Play Next** and **Add to Queue** as first-class entries (DEC-013), plus the existing
  "Show in folder" and copy actions that currently live in `SelectionActions`.
- Multi-selection is respected (DEC-045): the menu acts on the selection when the right-clicked row
  is part of it, and on the clicked row otherwise — the convention every file manager uses, and the
  one users will assume.
- The menu is a renderer component, not a native Electron menu, so it can be themed with the pixel
  design system and tested in jsdom.
- Keyboard equivalent: Enter activates the focused row, so playback is not mouse-only.

**Not in scope.** Context-menu entries for tags, ratings or Collections (Phase 6) or Beatport
actions (Phase 7). The menu is built so those are additions, not rewrites.

**Acceptance.**

- Double-clicking row *n* of a filtered, sorted, playlist-scoped view plays that track and produces
  a queue matching the view's order — the acceptance test for DEC-012, and the one worth writing
  first.
- Play Next inserts after the current track; Add to Queue appends; neither interrupts playback.
- With three rows selected, all three actions act on all three, in view order.
- The menu opens with the keyboard and closes on Escape without losing table focus.

---

## PLAYER-10 — Files that will not play

**What it is.** DEC-054's behavior. DEC-037 deliberately left file existence unchecked until
Phase 7, which makes the player the first thing in CuePoint to discover a moved drive.

**Scope.**

- On `end-file` with a failure reason, or a missing path, mark the item `failed`, log it, and
  advance to the next item.
- **Coalescing, which is the requirement and not a refinement**: consecutive failures produce one
  toast that counts them ("12 tracks could not be played"), not one toast each. A disconnected
  drive with a 5,000-track queue must produce one message.
- A single isolated failure names the track; the coalesced message does not try to name twelve.
- If every remaining item fails, playback stops and says so once rather than spinning through the
  queue at speed.
- Failure is transient state: nothing is written to the database (DEC-051), and a track that failed
  once is retried normally the next time it is played — the drive may well be back.
- Distinguish "mpv could not start" from "this file could not be played" (PLAYER-03's risk note);
  they get different messages.

**Not in scope.** Detecting missing files ahead of time, marking them in the library, or offering
to relocate them — all Phase 7 (DEC-037).

**Acceptance.** Unit tests for the advance-and-mark rule and the coalescing window; a test that a
queue of all-bad files stops with exactly one message; a test that a failed track plays normally
on a later attempt; an integration check with a real missing path through the supervisor.

---

## PLAYER-11 — Audio output settings

**What it is.** DEC-055 — the step that turns DEC-005's quality claim into something a user with an
audio interface can actually hear. It is the only part of this phase with genuinely divergent
per-OS behavior, which is why it is its own step.

**Scope.**

- An Audio section in Settings (`SettingsExportScreen` is the current `/settings` destination):
  output device, exclusive output toggle, and a short, honest explanation of what exclusive output
  does and what it costs (other applications lose the device).
- Device enumeration from mpv's `audio-device-list` property, refreshed when the panel opens.
- Exclusive output: WASAPI exclusive on Windows, hog mode on macOS, absent on Linux with the
  control disabled and a reason rather than a control that lies.
- mpv's high-quality resampler configured explicitly rather than left at defaults, so the "SoX
  resampling" in DEC-005's reasoning is a real setting and not an assumption.
- **Runtime fallback, which is the part most likely to be under-built**: exclusive mode fails when
  the device is busy or the format is unsupported. It must fall back to shared output and say so
  visibly and non-fatally — never silence, never a dead transport.
- A device that disappears while selected (interface unplugged) falls back to the system default
  and says so; it must not wedge playback or crash the supervisor.
- Settings persist through FOUNDATION-09's settings architecture, not a new store, and apply to the
  next `loadfile` without requiring a restart.

**Not in scope.** ReplayGain, volume normalization, DSP or EQ (DEC-055 excludes them explicitly;
normalization needs scan data the library does not have, which is Phase 12).

**Acceptance.**

- Selecting a device routes audio to it in a dev run on Windows and macOS.
- Exclusive mode engages where supported; forcing a failure (device held by another app) falls back
  to shared with a visible message and continuing playback.
- Unplugging the selected device does not stop the app or leave the transport lying about its state.
- Settings survive a restart and are applied to the first track of the next session.

**Risks.** This step cannot be validated in CI — it needs real hardware on two operating systems.
The acceptance is manual by nature, and the step is not complete until that manual pass has actually
been run and recorded, not asserted.

---

## PLAYER-12 — Hardening: shortcuts, accessibility, E2E, documentation

**What it is.** The last step, after every other one, in the shape SHELL-10 and LIBUI-10 already
set.

**Scope.**

- Keyboard shortcuts through the existing shell keyboard layer: play/pause, next, previous, volume.
  Space is the obvious play/pause key and the dangerous one — it must not fire while a text field,
  the filter bar or global search has focus. The existing shortcuts dialog gains the new entries.
- Media keys (Play/Pause, Next, Previous) registered as global shortcuts, with the explicit caveat
  that they are global to the OS: registered on focus, released on blur, so CuePoint does not
  silently hijack the media keys of the whole machine while in the background.
- Accessibility: transport controls are real buttons with labels and states, the seek bar is a
  slider with `aria-valuenow`/`valuetext`, the queue panel is reorderable without a mouse, and
  playback changes are announced without the position stream flooding a screen reader every tick.
- E2E (`apps/desktop-electron/e2e/`): a `playback.spec.ts` covering double-click → bar appears →
  queue populated → next/previous → queue panel reorder, running against a fixture audio file. It
  must also pass with mpv absent, asserting the graceful-degradation promise from cross-cutting
  fact 4.
- Gapless verified by ear and by assertion on two consecutive fixture files (DEC-056's other half —
  a phase that decided not to crossfade should at least prove it is gapless).
- DEC-014 verified end-to-end: quit mid-track, relaunch, nothing resumes and nothing is remembered.
- Documentation: a user-guide page for the player (transport, queue, shuffle/repeat, audio settings,
  and what a skipped track means), `docs/release/CHANGELOG.md` under `Unreleased`, ADR-004 marked
  accepted with any consequences learned during implementation, and `docs/features/` updated if the
  bundled-binary inventory is recorded there.
- `PIXEL_DESIGN_SYSTEM.md` updated with the new icons (shuffle, repeat×3, queue, volume).

**Acceptance.** Every check above run — not assumed — with results recorded under this step,
including which ones needed real hardware and were therefore manual.

---

## Before the phase is called complete — the macOS pass

**Development happens on Windows. Nothing in this phase is done until it has been run on macOS.**

This is stated as its own gate rather than left inside PLAYER-12's checklist because it is the one
part of the phase that cannot be discharged from the development machine, and because more of this
phase depends on it than on any phase before it. Phases 1–4 added Python endpoints, Electron
forwarding and React screens — all platform-neutral, and their macOS risk was packaging alone.
Phase 5 adds a second signed binary, a different IPC transport (unix socket rather than named
pipe), a different exclusive-output mechanism (hog mode rather than WASAPI), and OS-level media-key
registration. Every one of those is a place where a green Windows run says nothing at all about
macOS.

Run on a Mac, on the **packaged, signed** app and not a dev build, before PLAYER-12 is recorded
complete:

| # | What to run | Why it is macOS-specific |
| --- | --- | --- |
| 1 | `python scripts/fetch_player_sidecar.py`, then a full `npm run pack:full` and `dist` | The macOS mpv distribution differs in shape from the Windows archive (PLAYER-01) |
| 2 | Launch the signed, notarized `.dmg` build and play a track | Notarization of a third-party binary inside the bundle is PLAYER-01's flagged risk, and it fails at launch, not at build |
| 3 | The decode fixtures: FLAC, AIFF, ALAC, MP3, WAV | The format claim in DEC-005 was never verified on this OS |
| 4 | Double-click → bar appears → queue → next/previous → queue reorder | The unix-socket transport path in PLAYER-02, untested by any Windows run |
| 5 | Quit mid-playback, then check no `mpv` process survives (`ps aux \| grep mpv`) | Process teardown differs, and a leaked process holding hog mode is this phase's worst bug |
| 6 | Audio settings: pick a real interface, engage hog mode, then force it to fail with another app holding the device | PLAYER-11's fallback path, which has no Windows equivalent — hog mode is not WASAPI exclusive |
| 7 | Unplug the selected interface mid-playback | Device-loss handling, per PLAYER-11 |
| 8 | Media keys, with CuePoint focused and then backgrounded | Global-shortcut registration behaves differently on macOS, including its accessibility permissions prompt |
| 9 | Gapless across two consecutive fixture files, by ear | The DEC-056 claim, on the OS where the audio path is different |
| 10 | The E2E suite, including the mpv-absent degradation case | `apps/desktop-electron/e2e/playback.spec.ts` from PLAYER-12 |
| 11 | The whole run again with mpv deliberately removed from the bundle | Cross-cutting fact 4 — the app must still launch and browse |

Record the result under PLAYER-12 with the macOS version and hardware used. A failure here is a
Phase 5 bug, not a Phase 14 packaging item — Phase 14's cross-platform work assumes the phases
before it already ran on both platforms.

---

## Phase-level acceptance

The phase is complete when, in a **packaged build on Windows and macOS**:

1. Double-clicking a track in a filtered, sorted, playlist-scoped library view plays it and loads
   that view, in that order, as the queue (DEC-012).
2. Play Next and Add to Queue append without interrupting, and their effect is visible in the queue
   panel (DEC-013, DEC-052).
3. The player bar is absent until the first play and present thereafter (DEC-053, DEC-025).
4. Transport, seek, volume, shuffle and repeat all work, and shuffle/repeat survive a restart while
   playback position does not (DEC-052, DEC-014).
5. A missing or undecodable file is skipped with one coalesced toast and a marked queue item, and
   the database is unchanged (DEC-054, DEC-051).
6. Output device and exclusive output are selectable, exclusive failure falls back audibly and
   visibly, and playback is gapless with no crossfade (DEC-055, DEC-056).
7. Quitting leaves no mpv process running, and a build without mpv still launches, browses and
   reports the absence honestly.
8. No migration was added, no database row is written by playback, and `library_api.py` changed in
   exactly one step (DEC-050, DEC-051).
