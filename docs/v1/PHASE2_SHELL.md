# CuePoint v1.0.0 — Phase 2: Application Shell, Detailed Step Specifications

Status: **SHELL-01 and SHELL-03 implemented (2026-09-02); the rest are draft step specs.**
Implementation of any step below requires an explicit "Implement SHELL-NN" instruction, scoped to
exactly that step, followed by tests, a completion report, and a stop before the next step per the
evolution spec's process. SHELL-03 was taken before SHELL-02 to close the routing defect recorded
in fact 2 below; the sequencing diagram shows the planned order, not the order taken.

Depends on Phase 1 being complete (`PHASE1_FOUNDATION.md`, audited 2026-09-02) and on Decision
Rounds 1–3 (`DECISIONS.md`, DEC-001…DEC-027). Builds on `CURRENT_ARCHITECTURE.md`,
`GAP_ANALYSIS.md` §I, and `PIXEL_DESIGN_SYSTEM.md` — read those for reasoning this document does
not repeat.

## What this phase is

Phase 2 replaces the lab-era chrome with the real application shell: a persistent layout with
navigation, header search, a Track Inspector, a status strip, and reserved regions that later
phases fill. It is the frame; almost nothing inside it is new product surface.

**What this phase is not.** It builds no library, no player, no collections, no matching changes.
Two steps (SHELL-04, SHELL-07/08) add engine endpoints, but only to read data Phase 1 already
stores. Every existing screen keeps working exactly as it does today, re-parented rather than
rewritten (DEC-021).

## Decisions this phase implements

| Decision | Substance | Step |
| --- | --- | --- |
| DEC-020 | Nav registry declares the full target IA, renders only what has landed | SHELL-02 |
| DEC-021 | Existing screens kept intact as a "Tools" group | SHELL-02 |
| DEC-022 | Sidebar has two states (expanded / icon rail), persisted | SHELL-02 |
| DEC-023 | Global search is engine-backed over the Phase 1 `tracks` table | SHELL-04 |
| DEC-018 | Inspector persists across pages, resizable, width remembered | SHELL-05 |
| DEC-024 | Inspector ships as container + empty state + hide toggle | SHELL-05 |
| DEC-025 | Player region is a zero-height layout slot until Phase 5 | SHELL-06 |
| DEC-026 | Status strip plus Activity panel over FOUNDATION-07/08 data | SHELL-07, SHELL-08 |
| DEC-027 | App reopens on the last-visited destination | SHELL-03 |

## Sequencing

```
SHELL-01 (layout skeleton)
   │
   ├─────────────┬─────────────┬─────────────┬──────────────┐
   ▼             ▼             ▼             ▼              ▼
SHELL-02      SHELL-05      SHELL-06      SHELL-07       SHELL-04
(nav +        (inspector)   (player slot) (status strip)  (search:
 sidebar)                                     │            engine + UI)
   │                                          ▼
   ▼                                       SHELL-08
SHELL-03                                   (activity panel)
(routing +
 launch page)

SHELL-09 (shell iconography)  — after SHELL-02; the rail is what the icons are drawn against
SHELL-10 (hardening: a11y, E2E, docs) — last, after every other step
```

SHELL-04's engine half has no dependency on SHELL-01 and can be built in parallel with the layout
work; only its header UI needs the shell to exist.

---

## Before starting any step — three cross-cutting facts

These apply to more than one step and are easier to state once.

### 1. Two steps cross the desktop contract

SHELL-04 (search) and SHELL-07/SHELL-08 (jobs and activity) add engine endpoints. Per the
AGENTS.md invariant, each must move together in one change:

- Python: a new `*_api.py` module plus its dispatch arm in `engine/server.py`
- `apps/desktop-electron/electron/engineClient.ts` — the typed HTTP method
- `apps/desktop-electron/electron/main.ts` — the `ipcMain.handle("engine:…")` arm
- `apps/desktop-electron/electron/preload.cjs` — **the runtime preload**; `preload.ts` is a
  placeholder and must not be mistaken for it
- `apps/desktop-electron/renderer/src/api/cuepointBridge.types.ts` — the `CuePointBridge` type
- tests on both sides

The engine reaches Phase 1 services through the lazy-container pattern already established at
`engine/server.py:62` (`_resolve_job_repository()`): resolve the interface from
`cuepoint.utils.di_container.get_container()` at call time, not at import time, because the module
is imported before `bootstrap_services()` runs. New endpoints resolve `ILibraryService` and
`IActivityService` the same way. Endpoints authenticate with the existing `self._authorized()`
check and fail with `error_payload(CODE, message)` — the envelope is an invariant, so no endpoint
here invents its own error shape.

### 2. A routing defect — **CONFIRMED and FIXED 2026-09-02 in SHELL-03**

In production `main.ts:157` loads the renderer with `loadFile(.../renderer/dist/index.html)`, so
`window.location.pathname` is a `file://` path ending in `/index.html`. `App.tsx` uses
`BrowserRouter`, whose routes are all rooted at `/`. No route matches, and the content area stays
empty.

**Observed while implementing SHELL-01**, by launching the real packaged-mode app under Playwright:

```
pathname:      /C:/Users/.../renderer/dist/index.html
screens in main: 0        main text: ""        nav links: 5
```

Clicking a nav link does not recover it. `<Link to="/match">` resolves against the `file://`
origin to `file:///C:/match`, whose pathname is `/C:/match` — still no match:

```
Tools -> file:///C:/    inKey -> file:///C:/match    inCrate -> file:///C:/incrate
Results -> file:///C:/results    Settings -> file:///C:/settings
```

**The packaged app therefore renders chrome and no screen, on every route.** This was verified
against `HEAD` with SHELL-01 stashed, and reproduces identically, so it long predates Phase 2.
Development is unaffected — `npm run dev` serves over `http://localhost:5173`, where routing works
— which is why it survived: all five screens render correctly over http, and the only E2E test
asserts the navigation element and the "inKey" link, both rendered *outside* `<Routes>`.

**Fixed in SHELL-03** by switching to `HashRouter`, so routes live in the fragment
(`index.html#/match`) which `file://` leaves alone. A catch-all `*` route renders home, so no path
can produce an empty content area again. The packaged build now renders on first paint, navigates,
and survives a reload — and the SHELL-01 verification matrix was re-run against it: **75/75**.

The gap that hid it is closed too: `e2e/shell.spec.ts` asserts screen *content* on first paint,
after navigation, and after a restart. Reverting to `BrowserRouter` fails two of those three.
(The first-paint test alone no longer discriminates, because the catch-all route independently
prevents that symptom — the navigation and restart tests are the router's regression guard.)

### 3. Storage-key naming

Existing UI state uses the lab-era prefix (`cuepoint-ui-lab-results-layout`,
`cuepoint-ui-lab-scale`, `cuepoint-ui-lab-custom-themes`). **Do not rename those** — a rename
silently resets a user's saved layout, scale and custom themes. New shell state uses
`cuepoint-ui-shell-*`, and every reader must tolerate a missing or malformed value by falling back
to a default, the way `loadResultsTableLayout()` already does.

---

## SHELL-01 — Shell Layout Skeleton ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. `AppShellLayout` owns a five-row, three-column grid; regions that no step
has filled yet are not rendered at all, so their tracks are zero-sized. The lab nav pill stays
until SHELL-02, as planned.

**The menu bar moved into the grid.** It was `position: fixed`, and `.app-main` cleared it with a
guessed `padding-top: calc(var(--space-xl) + var(--space-md))`. It is now a grid row that reserves
its real height, and keeps `position: relative` purely to preserve its `z-index: 950` — that is
what keeps its dropdown over the content and its stacking order against the engine-status banner
(850), modals (1000) and toasts (1100) unchanged.

**One thing the plan got wrong: page scrolling.** The plan assumed tall screens simply could not
scroll. They could — `InCrateMainScreen` and `SettingsExportScreen` added a `app-page-scroll`
class to `<body>`, and `screens.css` used it to let html, body and `#root` grow past the viewport
and to force `.app-main` back to `overflow: visible`. That mechanism is incompatible with a shell:
scrolling the document scrolls the frame, so the menu bar — and the sidebar, player and status
strip that SHELL-02, SHELL-06 and SHELL-07 add — would scroll out of view, and DEC-018's Inspector
could not persist beside a scrolled page. The content region owns scrolling now, the page-growing
rules are deleted, and the two `app-page-scroll` toggles went with them.
`results-page-scrollable` survives: it does something different (the resized Results frame stops
filling the region).

**Verified in the running app, not only in jsdom.** A Playwright harness walked
5 themes × 3 scales × 5 screens = **75 combinations**, asserting for each that the grid and
content region exist, a screen renders inside it, nothing overflows horizontally (both
`scrollWidth` and the widest right edge on the page), `main` starts at or below the menu bar's
bottom edge, and no unfilled region rendered an element. **75/75 pass.** A scroll probe confirmed
the content region really scrolls (Settings at 3×: 2541px of content in a 633px region, and
`scrollTop` moves). Before/after screenshots against the stashed tree confirmed the one visible
difference at 3× — the Results panel clipping — is pre-existing `screen--fill` behavior at large
scale, identical on both sides.

**Update after SHELL-03**: the matrix was re-run against the real packaged build once the router
was fixed — **75/75 again**, so nothing here rested on the http workaround.

**Two environment findings, neither a repo defect.** `ELECTRON_RUN_AS_NODE=1` in the shell makes
`electron.exe` run as plain Node, so the app and every E2E run die with an ESM loader error until
it is unset. And the packaged build renders no screen at all — see preamble fact 2, now confirmed;
the 75-combination matrix therefore ran over http against the same built assets.

**Verification**: 135 renderer tests (20 new), lint, typecheck and `build:check` clean; E2E smoke
passes; desktop version coupling passes. No Python changed, so no Python suite was run.

---

## SHELL-01 — Shell Layout Skeleton (original plan)

**Objective**: Replace the centered-content-plus-floating-pill layout with a real application
frame: a CSS-grid shell defining named regions for the menu bar, header, sidebar, content,
Inspector, player and status strip. This step builds the frame and the region components' empty
shells only — nav content, search, Inspector content, status content all arrive in later steps.

**User-visible result**: The window is laid out as an application rather than a centered lab page.
Screens render in a content region instead of a vertically centered column.

**Dependencies**: None. First step of the phase.

**Existing code reused**: The entire token system (`tokens/tokens.css`, all 5 themes) unchanged —
this step adds layout, not color, spacing or border values. `AppMenuBar` stays where it is as the
top `role="banner"` element; the shell header is a second, distinct row beneath it, not a
replacement (merging them is deliberately out of scope, see *Deferred* below).

**UI changes**: New `components/shell/AppShellLayout.tsx` + `AppShellLayout.css` owning the grid.
`App.css`'s `.app-main` loses its `align-items: center` / `justify-content: center` centering and
`padding-top`, and `.app-lab-nav` is deleted. `.app-main .screen` keeps `--content-max-width` so
screens that expect a bounded column still get one; `.screen--fill` keeps stretching.

**Tests**: Component tests for the layout (regions present, correct landmark roles, regions that
are empty render nothing rather than an empty box with padding). Every existing screen renders
inside the new frame without console errors — this is the real risk and deserves an explicit
per-screen check, not a spot check of one screen.

**Backward compatibility**: No API, CLI, config or persisted-state change. `e2e/smoke.spec.ts`
still passes at this step because the nav is not touched yet (SHELL-02 breaks it, see below).

**Acceptance criteria / DoD**: All five existing screens render correctly inside the shell at all
3 scale levels and all 5 themes; no horizontal scrollbar at 1280×800, the size `main.ts` creates
the window at; `.app-lab-nav` is gone from both CSS and markup only once SHELL-02 supplies its
replacement — if SHELL-01 lands first, the pill stays temporarily and is removed in SHELL-02.

**Risks**: **Medium-high, the highest of the phase.** Every screen was authored against a centered
`.app-main`; several use `.screen--fill`. Breakage here is visual, so tests catch less of it than
usual — budget real manual verification across themes and scales rather than trusting green tests.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## SHELL-02 — Navigation Registry and Sidebar

**Objective**: Implement DEC-020's registry, DEC-021's Tools grouping and DEC-022's two-state
sidebar. A single declarative module lists every target destination — Library, Collections,
Prepare, Discover, Clean, plus the Tools group and Settings — each with an `enabled` flag; the
sidebar renders only enabled entries. Today's five screens become the Tools group.

**User-visible result**: A real sidebar replaces the floating bottom pill. It collapses to an
icon-only rail and remembers that choice.

**Dependencies**: SHELL-01 (needs the sidebar region).

**Already partly built.** SHELL-03 ran first and created `navRegistry.ts` with today's five
destinations, plus the `enabled` flag and the lookup helpers. This step adds the target IA
(Library, Collections, Prepare, Discover, Clean) with `enabled: false`, the Tools grouping, the
icon field, and the sidebar itself. The lab nav pill already renders from the registry, so this
replaces a consumer rather than rewriting the source.

**Existing code reused**: `PixelIcon`/`ToolbarIcon`'s existing icon-or-glyph union — destinations
whose pixel icon does not exist yet (`clean`, `discover`, `prepare`) use the glyph path until
SHELL-09 draws them, which is exactly what that union was built for. `home`, `library`, `activity`
and `settings` icons already exist and are used directly.

**UI changes**: `components/shell/navRegistry.ts` (destination id, label, icon or glyph, route
path, group, `enabled`), `Sidebar.tsx` + `.css`. Collapse state persists under
`cuepoint-ui-shell-sidebar-collapsed`.

**Tests**: Registry unit tests (disabled destinations never render; group ordering is stable).
Component tests for the sidebar: collapse toggle flips state, state survives a remount, the
active destination is marked `aria-current="page"`, and every rail item keeps an accessible name
when labels are hidden — the collapsed rail is where an accessible-name regression would be
invisible.

**Backward compatibility**: Routes and screens are unchanged; only how they are reached changes.
**This step breaks `e2e/smoke.spec.ts`**, which asserts a `navigation` element named "Main
navigation" containing a link named "inKey". Updating that test is part of this step, not a
follow-up.

**Acceptance criteria / DoD**: Every existing screen is reachable; no disabled destination is
rendered; collapse state survives an app restart; the registry is the only place a destination is
declared, so enabling a future page is a one-line change (this is the property DEC-020 is buying,
so it is worth asserting in a test).

**Risks**: Low-medium. The main risk is the registry growing behavior (permissions, badges,
ordering rules) beyond a declarative list; keep it data, not logic.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## SHELL-03 — Routing and Navigation State ✅ IMPLEMENTED 2026-09-02 (taken before SHELL-02)

**Outcome**: Complete. The router defect is fixed, routes come from a registry, and the app
reopens where you left it.

**Taken out of order, so the registry seam had to be drawn early.** SHELL-03 was specified to
depend on SHELL-02, which owns the nav registry. Rather than duplicate the concept, this step
created `navRegistry.ts` with the destinations that exist today (id, label, path, `enabled`) and
left the rest of DEC-020 to SHELL-02: declaring the not-yet-built destinations with
`enabled: false`, and adding the grouping and icon fields the sidebar needs. `enabled` exists now
because DEC-027's fallback has to answer "is this still reachable?", and a rule that cannot be
false cannot be tested. The lab nav pill renders from the same registry, so SHELL-02 replaces one
consumer rather than rewriting the source.

**The router: `HashRouter`.** Routes live in the fragment, which `file://` leaves alone.
`MemoryRouter` would also have worked but loses the URL entirely, which makes debugging and
reload worse for no gain. A catch-all `*` route renders home, so no path — a stray link, a future
typo — can produce the empty content area this step exists to eliminate.

**A second defect, found by a test that was written to be strict.** The first implementation
restored the destination by navigating from a `useLayoutEffect` after mount, exactly as the plan
said. It does not work: react-router subscribes to history in *its* layout effect, and a child's
layout effect runs first, so the navigation is issued before anything is listening and is simply
lost. The symptom is the worst kind — the URL becomes `#/settings` while the content area still
shows home, so the app looks broken in a way the address bar denies. It survived the first test
run only because a leftover `location.hash` from a previous test made the router start in the
right place; resetting the hash per test exposed it. The fix resolves the destination and writes
the URL **before the router mounts**, which also removes the frame of home that a passive effect
would have painted. The stored id is still the source of truth; nothing depends on a URL surviving
a launch.

**Verification.** 26 new tests (161 renderer total): the three DEC-027 fallback cases — nothing
stored, a destination that no longer exists, one that exists but is disabled — plus malformed and
empty values, storage that throws, and an assertion that a fallback never leaves an empty content
area. Two mutants confirm the tests bite: making restore ignore the stored value fails 2 tests,
making the fallback ignore `enabled` fails 2 more. `e2e/shell.spec.ts` adds packaged-build
coverage of first paint, navigation, and DEC-027 restore **across a real app restart**; reverting
to `BrowserRouter` fails two of the three. The SHELL-01 matrix was re-run against the packaged
build: 75/75. Dev mode was checked separately — `main.ts`'s `?engine=…` query survives the hash
rewrite.

**Two things cleaned up on the way.** The E2E suite now runs each launch in its own
`--user-data-dir`: it previously used the real CuePoint profile, and the smoke test broke the
moment stored state made the app open somewhere other than home (its `link: "inKey"` lookup is
ambiguous on any screen with a "← Back to inKey" link, now scoped to the nav and exact).

**Verification**: 161 renderer tests, lint, typecheck, `build:check`, 4 E2E tests, version
coupling — all pass. No Python changed.

---

## SHELL-03 — Routing and Navigation State (original plan)

**Objective**: Derive the route table from the nav registry, and implement DEC-027 — reopen on the
last-visited destination, falling back to home when the stored destination is unknown or not
enabled.

**Carried-in obligation — the `BrowserRouter`-under-`file://` defect (preamble fact 2).**
**Confirmed 2026-09-02 during SHELL-01**, with evidence recorded in that preamble: the packaged
build matches no route, on first paint or after clicking any nav link, and renders no screen at
all. Steps 1 and 2 (observe, record) are therefore done. What remains is the **first task** of
this step, before any persistence work:

- **Fix it**: switch to `HashRouter` (or `createMemoryRouter` with the shell driving navigation),
  and add the E2E assertion whose absence let it hide — screen content, not just the nav element.
- Re-run the SHELL-01 verification matrix against the **packaged** build once the fix lands; until
  then every Phase 2 step is verified over http against the same built assets, which leaves
  packaged-only behavior unproven.

Deferring the fix to a later step is not an option here: DEC-027's restore is built on top of
routing, so shipping restore over a router that does not resolve on first paint would build on a
known break.

**User-visible result**: The app reopens where you left it.

**Dependencies**: SHELL-02 (the registry is the source of both routes and the fallback rule).

**Existing code reused**: The `loadResultsTableLayout()` read-parse-fallback shape is the model
for reading persisted navigation state. The existing `useEffect` that resets scroll on
`location.pathname` change moves into the shell rather than being rewritten.

**UI changes**: Routes generated from the registry instead of hand-written `<Route>` elements;
persistence under `cuepoint-ui-shell-last-destination`.

**Tests**: Restore-on-launch unit tests covering the three fallback cases — no stored value, a
stored value for a destination that does not exist, and a stored value for a destination that
exists but is disabled (the case that will actually occur, when a user downgrades or a phase's
flag is turned off). One test asserting an unknown stored destination never produces a blank
content area, which is the failure mode this step exists to prevent.

**Backward compatibility**: No persisted-state migration needed; there is no prior navigation
state to migrate. If the router type changes, verify deep links used anywhere in-app still resolve
— `AppMenuBar` contains a `<Link to="/settings">`, so at minimum that path must keep working.

**Acceptance criteria / DoD**: The packaged (not just dev) build opens on the stored destination;
the three fallback cases each land on home with no console error; the packaged build renders the
correct screen on first paint, with the router question settled by observation and the evidence
recorded in the completion report — and, if it was a real defect, fixed in this step with an E2E
assertion on screen content that would have caught it.

**Risks**: Medium — entirely because of the router uncertainty. If the packaged build turns out to
have been rendering no screen on first paint, this step also becomes a real bug fix, and the fix
should be verified in a packaged build, not in `npm run dev`.

**Complexity**: **S/M**

**PR breakdown**: Single PR, unless the router change proves large enough to separate from the
persistence work.

---

## SHELL-04 — Global Search (Engine and UI)

**Objective**: Implement DEC-023 — a real search over the Phase 1 `tracks` table, reachable from a
header search field. Returns nothing until Phase 3 imports a library; needs no rewrite when it
does.

**User-visible result**: A header search field that searches the library. Until Phase 3, it
reports an empty library rather than pretending to search.

**Dependencies**: SHELL-01 for the header region (UI half only). The engine half depends on
nothing in this phase.

**Existing code reused**: `TrackRepository`/`LibraryService` (FOUNDATION-05/06) gain a search
method; the SQLite connection, `LibraryTrack.from_row()` and the `_SELECT` projection are reused
rather than duplicated. `ILibraryService` in `services/interfaces.py` is extended, keeping the
interface-first pattern FOUNDATION-01 established. The engine's existing bearer auth, JSON
sender and error envelope are reused unchanged.

**API surface** (this is a public contract under the "preserve response shapes" invariant, so it
is specified here rather than grown ad hoc):

- `GET /api/v1/library/search?q=<text>&limit=<n>&offset=<n>`
- Response: `{"query": str, "total": int, "limit": int, "offset": int, "tracks": [...]}` where
  each track carries `id`, `rekordbox_track_id`, `title`, `artist`, `album`, `label`, `genre`,
  `key`, `bpm`, `year`, `duration_seconds`, `file_path`. `total` is the full match count, not the
  page length, so the UI can say "showing 20 of 340" without a second call.
- Matching for v1: case-insensitive substring across title, artist, album and label, ordered
  artist-then-title to match `list_all()`'s existing ordering. Deliberately not FTS5 — Phase 4
  can add ranking behind the same response shape.
- An empty or whitespace-only `q` returns an empty result with `total: 0` rather than the whole
  library; `limit` is clamped server-side (default 50, max 200) because a 50k-track library is an
  explicit target and an unbounded response would materialize every row.

**Keyboard binding — settled here, not left to SHELL-10.** Global search binds **`Ctrl+K`**.
`Ctrl+F` is already registered in `keyboardShortcuts.ts` as "Results — Focus search" and keeps
that meaning: `Ctrl+F` searches within the table you are looking at, `Ctrl+K` searches the
library. Binding global search to `Ctrl+F` would either shadow the in-table search or make the
same key mean two things depending on focus, and the shortcuts dialog would then be wrong however
it was written. SHELL-10 registers and documents the binding; it does not get to reopen the
choice.

**Tests**: Repository-level tests for matching, ordering, pagination, case-insensitivity, and
inputs that must not break SQL (`%`, `_`, quotes — these are LIKE metacharacters and need
escaping, not just parameter binding). Engine tests for auth-required, malformed `limit`, and the
empty-library case. Renderer tests for debounce, the empty-library state, and that no request
fires for an empty query. Per AGENTS.md, external services are mocked; this endpoint touches only
the local database, so tests use the real temporary database from the Phase 1 test sandbox.

**Backward compatibility**: Purely additive — a new endpoint, a new bridge method, a new interface
method. No existing shape changes.

**Acceptance criteria / DoD**: Search returns correct results against a seeded test database;
`ILibraryService`, `engineClient.ts`, `main.ts`, `preload.cjs` and `cuepointBridge.types.ts` are
all in sync (a bridge-shape test asserting the method exists guards the preload, which is the
piece most easily forgotten); the empty-library state reads as "no library yet", not "no results";
`Ctrl+K` focuses the search field and `Ctrl+F` still means in-table search wherever it did before.

**Risks**: Medium. Two distinct risks: the response shape becomes hard to change once Phase 4
consumes it, so it deserves review before merge; and search-as-you-type against a 50k-row table
needs the `limit` clamp and debounce to be present from the start, not added after it feels slow.

**Complexity**: **M/L** — the largest step of the phase.

**PR breakdown**: **Two PRs.** (1) Engine: service method, endpoint, tests. (2) Desktop: bridge
plumbing and header UI. Splitting keeps the contract PR reviewable on its own.

---

## SHELL-05 — Track Inspector Container

**Objective**: Implement DEC-018 and DEC-024 — a docked, user-resizable Inspector that persists
across navigation, remembers its width, can be hidden, and holds an empty state. No track data is
wired to it in this phase.

**User-visible result**: A right-hand panel that can be resized and hidden, showing an empty state
explaining that selecting a track will show its details.

**Dependencies**: SHELL-01 (needs the Inspector region).

**Existing code reused**: The resize interaction and its persistence follow
`resultsTableLayout.ts` and `ResultsTable.tsx`'s existing column-resize implementation — DEC-018
names that mechanism explicitly, so this is reuse of an established pattern, not a new one.

**UI changes**: `components/shell/TrackInspector.tsx` + `.css`, with a drag handle on its left
edge and a hide toggle. State persists under `cuepoint-ui-shell-inspector` as
`{ width, visible }` — one key, matching how `resultsTableLayout` stores a small state object
rather than several keys. Width is clamped to a minimum and to a fraction of window width, so a
narrow window cannot leave the content area unusable.

**Tests**: Width persists and is restored; visibility persists; a stored width wider than the
current window clamps rather than pushing content off-screen (the case a user hits by resizing the
window between sessions); the hide toggle is reachable by keyboard and announces its state.

**Backward compatibility**: Additive. `CandidateDialog` is untouched — the Inspector does not
replace it in this phase, and deliberately does not duplicate it.

**Acceptance criteria / DoD**: Inspector persists across navigation between all destinations;
width and visibility survive an app restart; hiding it returns the space to the content area; the
component exposes a documented slot for later phases to fill, so Phase 4 adds content without
touching the container.

**Risks**: Low-medium. The clamping edge cases are the substance; the panel itself is
straightforward.

**Complexity**: **M**

**PR breakdown**: Single PR.

---

## SHELL-06 — Player Region Slot

**Objective**: Implement DEC-025 — define the player's layout region and component boundary,
occupying no space and rendering nothing until Phase 5 fills it.

**User-visible result**: None. This step is deliberately invisible.

**Dependencies**: SHELL-01.

**Existing code reused**: Nothing beyond the layout grid.

**UI changes**: A `PlayerRegion` component that returns `null`, and a grid row that collapses to
zero height when empty. The transport pixel icons (`play`, `pause`, `next`, `previous`) already
exist from FOUNDATION-14 and are **not** used here — they wait for Phase 5.

**Tests**: The region contributes no height and no border when empty; the shell grid is unchanged
by its presence. A test that fails if the empty region starts taking space is the whole point,
since that regression would otherwise be noticed only by eye.

**Backward compatibility**: Additive and inert.

**Acceptance criteria / DoD**: With the region present, the shell renders pixel-identically to a
build without it; the component boundary and its intended props are documented for Phase 5.

**Risks**: Low. The only real risk is scope creep into building transport UI early, which DEC-025
explicitly rejected.

**Complexity**: **S**

**PR breakdown**: Single PR. Could reasonably be folded into SHELL-01 at implementation time if
that feels more natural than a near-empty PR — worth deciding then, not now.

---

## SHELL-07 — Engine and Job Status Strip

**Objective**: First half of DEC-026 — a persistent bottom status strip showing engine state and
the progress of running jobs, giving FOUNDATION-07's durable job records their first UI and
`EngineStatusBanner` a permanent home.

**User-visible result**: A status strip that reports engine connection state continuously and
shows a running job's progress from anywhere in the app.

**Dependencies**: SHELL-01.

**Existing code reused**: `EngineStatusBanner`'s status rendering is **relocated, not
duplicated** — its markup moves into the strip and the floating banner is removed. Job progress
reuses the existing SSE path (`engine:subscribeJobEvents` → `sseClient.ts` → `job_events.py`)
rather than adding a second progress mechanism.

**Carried-in obligation — `EngineStatusBanner` never updates.** Its current implementation calls
`getEngineStatus()` exactly once on mount and has no refresh path at all
(`EngineStatusBanner.tsx`), so it reports whatever was true at first paint and then goes stale
silently. That is tolerable for a banner the user reads once; it is a defect in a strip that is
always on screen and claims to show live state.

**This step must replace the one-shot read**, not merely move it. The mechanism is the
implementer's call — a modest interval poll or a status subscription — but the outcome is fixed:
the strip reflects an engine that goes down and comes back **without a remount or navigation**.
Verify by stopping the engine while the app is open, not by unit test alone; a unit test with a
mocked bridge passes just as happily against the stale one-shot version.

**API surface**: There is currently **no list-jobs endpoint** — `JOB_ROUTE` only matches
`/api/v1/jobs/{id}`, `/{id}/results` and `/{id}/events` — so the strip cannot discover a job it
did not itself start (for example after a renderer reload mid-run). This step adds:

- `GET /api/v1/jobs?state=<active|all>&limit=<n>` returning `{"jobs": [...]}` with each job's
  `id`, `type`, `state`, `progress`, `created_at`, `updated_at`, and `error` when present.
- Backed by `IJobRepository` via the lazy-container pattern, so it reports jobs that survived an
  engine restart — which is precisely what DEC-007 made durable and nothing has yet displayed.

Full desktop-contract synchronization applies (see the preamble).

**Tests**: Engine tests for the list endpoint (filtering, limit clamping, auth). Renderer tests for
connected/disconnected/reconnecting rendering, and for progress updates arriving over SSE. A test
that the strip recovers a running job after a remount, since that is the scenario the new endpoint
exists for.

**Backward compatibility**: Additive endpoint. `EngineStatusBanner` moving is a UI relocation with
no API impact, but any test asserting the old banner's position needs updating in this step.

**Acceptance criteria / DoD**: Engine state visibly updates when the engine goes down and comes
back **without a remount or navigation** (verified by stopping the engine with the app open, not
only by unit test — the one-shot read this step replaces would pass a mocked-bridge test); a match
job started on one destination shows progress while the user is on another; a job still running
after a renderer reload is picked up.

**Risks**: Medium. Polling frequency is the trap — the strip is always mounted, so a tight poll
becomes constant background load. Prefer the existing SSE stream for job progress and a modest
interval for engine health.

**Complexity**: **M/L**

**PR breakdown**: **Two PRs**: (1) engine list-jobs endpoint + bridge, (2) status strip UI and
banner relocation.

---

## SHELL-08 — Activity Panel

**Objective**: Second half of DEC-026 — surface FOUNDATION-08's `activity_events` feed in a panel
opened from the status strip.

**User-visible result**: A readable history of what CuePoint has done, in the app for the first
time.

**Dependencies**: SHELL-07 (the strip is how it opens).

**Existing code reused**: `ActivityService.recent_events()` and `ActivityRepository` exist and are
read as-is. `Modal`/`Panel` and the existing dialog patterns are reused rather than a new panel
primitive being invented.

**API surface**: `GET /api/v1/activity/recent?limit=<n>` returning `{"events": [...], "total":
int}`, resolving `IActivityService` from the container. **Naming matters here**: the existing
`/api/v1/history/*` endpoints are past *match runs* (CSV files on disk), an entirely different
concept from FOUNDATION-08's activity feed. The new endpoint must not be added under `/history`,
and the UI must not call this "History" — that name is taken by the past-searches panel users
already see.

**Scope boundary**: display only. FOUNDATION-08 supports per-field revert (DEC-008), but revert
affordances belong to the phases that produce editable fields; a revert button here would act on
fields nothing can yet edit. `track_history` is not surfaced in this phase.

**Tests**: Engine tests for limit clamping and auth; renderer tests for the empty feed (the normal
state in Phase 2), for ordering, and for timestamp formatting. Since the feed is append-only and
enforced as such by `test_activity_append_only.py`, no test here should write events by any path
other than the service.

**Backward compatibility**: Additive.

**Acceptance criteria / DoD**: Events recorded by Phase 1 services appear in the panel; the empty
state is explicit rather than a blank panel; no endpoint or label collides with the existing
past-searches "History".

**Risks**: Low-medium. The naming collision is the one real trap, and it is a user-facing one.

**Complexity**: **M**

**PR breakdown**: Single PR (endpoint plus panel), since the endpoint is small and has exactly one
consumer.

---

## SHELL-09 — Shell Iconography

**Objective**: Draw the pixel icons the shell needs that FOUNDATION-14 deliberately deferred.
Its `pixelIcons.ts` says the concept icons "stay as Unicode glyphs until there is a screen to draw
them against" — SHELL-02's sidebar is that screen.

**User-visible result**: The sidebar and header are fully pixel-art; no Unicode glyphs remain in
primary navigation.

**Dependencies**: SHELL-02 (icons are drawn against the real rail), and the destinations from
SHELL-04/05/08 that need their own icons.

**Existing code reused**: The `pixelIcons.ts` 12×12 text-grid format, unchanged — new icons are
added as grids in the same file and rendered by the existing `PixelIcon` SVG path. No new asset
pipeline, no binary sprites; the format was chosen so icons are reviewable in a diff.

**Icons to draw**: `clean`, `discover`, `prepare`, `collections`, `search`, `inspector`. The exact
set is whatever SHELL-02's registry and the header actually reference — confirm against the code
at implementation time rather than trusting this list.

**Tests**: The existing `pixelIcons.test.ts` conventions extend to the new icons (grid dimensions,
legal characters). Visual verification at all 3 scale levels and all 5 themes: at 1× a grid cell
is 2 CSS pixels, and single-pixel detail disappears — the file's own guidance, and the reason this
is a design step, not a code step.

**Backward compatibility**: Additive. Existing glyph-based icons elsewhere are untouched; the
icon-or-glyph union in `ToolbarIcon` stays, since secondary actions still use glyphs.

**Acceptance criteria / DoD**: Every primary navigation destination renders a pixel icon; each is
legible at 1× and crisp (not blurred) at 2× and 3×; the collapsed rail is comprehensible from
icons alone, which is the test that matters given DEC-022.

**Risks**: Low as code; the real risk is that a concept icon (`prepare` especially) is not legible
at 12×12 and needs redesign. Budget iteration, and accept a glyph fallback for any icon that
cannot be made to read at 1× rather than shipping mud.

**Complexity**: **M** — asset design time, not code time.

**PR breakdown**: Single PR.

---

## SHELL-10 — Shell Hardening

**Objective**: Close the phase: accessibility, keyboard model, E2E coverage of the new shell, and
documentation. This is the step that makes the shell trustworthy rather than merely present.

**User-visible result**: Keyboard and screen-reader users can operate the shell; documented
shortcuts match reality.

**Dependencies**: Every other SHELL step.

**Existing code reused**: `keyboardShortcuts.ts`'s `KEYBOARD_SHORTCUTS` registry and
`ShortcutsDialog` are extended, not replaced. The `Ctrl+F` collision is already settled in
SHELL-04 — global search is `Ctrl+K`, and the existing "Results — Focus search" entry keeps
`Ctrl+F` and its meaning. This step registers and documents that; it does not re-decide it. No key
may appear twice in the dialog with two meanings.

**Scope**:

- Landmark roles across the shell (`banner`, `navigation`, `main`, `complementary`,
  `contentinfo`), with no duplicate landmarks — `AppMenuBar` already claims `role="banner"`.
- Logical tab order: sidebar → header/search → content → Inspector → status strip; a visible focus
  indicator in all 5 themes.
- Shortcuts registered and documented: `Ctrl+K` focus global search, plus bindings for toggle
  sidebar, toggle Inspector and open Activity (unbound in this document — choose them here, avoid
  the reserved set already in the registry, and add each to `KEYBOARD_SHORTCUTS` in the same
  change that implements it).
- E2E: extend `e2e/smoke.spec.ts` (or add a shell spec) to cover navigating between destinations,
  collapsing the sidebar, hiding the Inspector, and confirming both survive a restart — the
  persistence promises of DEC-022, DEC-024 and DEC-027 are exactly the kind of thing unit tests
  can pass while the real app fails.
- Docs: user-facing documentation for the new shell, and a `docs/release/CHANGELOG.md`
  `Unreleased` entry, per AGENTS.md's "update user docs for visible behavior".

**Tests**: The E2E additions above, plus component-level tests for focus management when the
Inspector or sidebar is toggled (focus must not be lost to `<body>`).

**Backward compatibility**: No API change. Shortcut changes are user-visible and belong in the
changelog.

**Acceptance criteria / DoD**: Every shell region is reachable and operable by keyboard alone; no
duplicate landmarks; the shortcuts dialog matches the bindings that actually work; E2E covers
navigation and both persistence promises; changelog and user docs updated.

**Risks**: Low individually, but this step is the usual casualty of "the phase feels done" — the
persistence E2E in particular is what would catch a shell that quietly forgets state in a packaged
build.

**Complexity**: **M**

**PR breakdown**: Could split into (1) accessibility and keyboard, (2) E2E and docs.

---

## Phase-level acceptance

Phase 2 is complete when, in a **packaged build** (not only `npm run dev`):

1. Every existing screen works exactly as it did before the phase, reached through the new shell.
2. Sidebar collapse, Inspector width and visibility, and last-visited destination all survive an
   app restart.
3. Search returns results against a seeded database and reports an empty library honestly.
4. The status strip reflects real engine state and real job progress, including a job that
   outlived a renderer reload.
5. The Activity panel shows events recorded by Phase 1 services.
6. Full Python suite, renderer `npm test` / `lint` / `typecheck` / `build:check`, the Qt guard,
   engine health smoke, version coupling, and E2E all pass.
7. No decision in DEC-018, DEC-020…DEC-027 is contradicted by the implementation. Per the process,
   a contradiction stops the work and gets raised rather than worked around.
8. The three carried-in defects are closed, each by the step that owns it: the packaged build
   renders a screen on first paint (SHELL-03 ✅ done), the status strip updates without a remount
   (SHELL-07), and no keyboard shortcut has two meanings (SHELL-04 decides, SHELL-10 documents).

## Deferred, with reasons

- **Merging `AppMenuBar` into the shell header.** The custom menu bar and the shell header are two
  rows doing related jobs, and one row would be better. It is a visual-design decision affecting a
  component every dialog depends on, so it belongs in its own change rather than riding along with
  structural work.
- **Command palette.** Not asked in Round 3 and not required by any decision. If wanted, it should
  be a decision first.
- **Generalizing `ResultsTable` into the Universal Track Table.** Explicitly Phase 4 (LIBUI).
- **Any Inspector content.** DEC-024. The container's slot is the deliverable here.
- **Revert affordances on `track_history`.** DEC-008 supports them; nothing in Phase 2 can edit a
  field, so there is nothing to revert yet.

## Recommended First Step

**SHELL-01**, necessarily — every other step needs a region to live in, and it carries the phase's
highest risk (every existing screen was authored against a centered `.app-main`). Doing it first
means that risk is faced while nothing else is in flight, and the "Implement → test → verify →
stop" cycle confirms the layout before nine steps are built on top of it.

The one step that can genuinely run in parallel if desired is **SHELL-04's engine half** — the
search service method and endpoint touch no renderer code and depend on nothing in this phase.

Waiting for an explicit "Implement SHELL-NN" before touching any code.
