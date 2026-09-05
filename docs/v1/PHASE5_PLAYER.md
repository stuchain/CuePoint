# CuePoint v1.0.0 — Phase 5: Player, Detailed Step Specifications

Status: **Specified, not started.** PLAYER-01…PLAYER-12 are described below and none of them is
implemented. Per the process, no implementation happens from this document — each step needs an
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
