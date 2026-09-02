# CuePoint v1.0.0 — Phase 2: Application Shell, Detailed Step Specifications

Status: **Phase 2 complete — SHELL-01 … SHELL-10 all implemented (2026-09-02).**
Each step was implemented under its own explicit instruction, verified, and recorded below. The
order taken was 01, 03, 02, 04, 05, 06, 07, 08, 09, 10: SHELL-03 was brought forward to close the
routing defect in fact 2 below, which blocked packaged-build verification for every later step.
The sequencing diagram shows the planned order, not the order taken.

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
- `apps/desktop-electron/electron/engineSupervisor.ts` — **the forwarding method**. This list
  originally omitted it and SHELL-04 paid for the omission: `main.ts` calls `engine.X()` on an
  `EngineSupervisor` facade that forwards to `EngineClient` one method at a time, so a client
  method plus an IPC channel is not enough. Nothing type-checks the gap, and the failure appears
  only in the running app as `engine.X is not a function`
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

## SHELL-02 — Navigation Registry and Sidebar ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. The floating lab pill is gone; a real sidebar renders from the registry,
collapses to an icon rail, and remembers which. The registry now declares the full target IA
(Library, Collections, Clean, Discover, Prepare) with `enabled: false`, grouped `workspace` /
`tools` / `system`. A group with nothing enabled is not rendered at all, so today the sidebar shows
Tools and Settings rather than an empty heading with a divider under it.

**The one-flag promise is tested, not just asserted.** A test enables `library` in a copy of the
registry and checks the workspace group appears with it — the thing DEC-020 is actually buying.

**Both inherited cleanups done.** `--safe-bottom` no longer reserves 48px for a pill that no longer
exists. `--results-frame-max-width` moved from `80vw` to `80cqw`, and `getFrameMaxWidth()` now
measures the content region instead of the window, so the CSS cap and the JS drag clamp agree.

**The sidebar broke a layout, exactly where predicted.** At 3x the content region drops to 1048px
while the window is still 1264px, and inKey's two-column grid needed ~1130px — it ran 170px
off-screen, because its `@media (max-width: 900px)` collapse asks the *window* how wide it is. The
content region is now a query container (`container-type: inline-size`), and the layout rules
inside it are `@container` queries. Safe here specifically because `container-type` implies
`contain: layout`, which would make the region a containing block for fixed-position descendants —
the three that exist (engine banner, modals, toasts) all render outside the shell grid.

Two further things were needed: grid items are `min-width: auto` by default, so a grid refuses to
shrink below its content and overflows instead — `.match-layout > * { min-width: 0 }` makes it
shrink whatever the breakpoints do. And the threshold has to follow the interface scale (two
columns need ~380px at 1x, ~750px at 2x, ~1130px at 3x), which a container query cannot express
with `var(--scale)`, so 3x gets its own rule keyed on the attribute `applyScale()` already sets.

**A worse bug found by looking, then caught by measuring.** The 3x screenshot showed inKey missing
its toolbar while `scrollTop` was 0 — contradictory, so I measured the geometry: the toolbar sat at
`top: -927px`, above the content region and unreachable, because scroll offsets cannot go negative.
Centering a flex column taller than its box (`justify-content: center` on `.screen--center` and
`.screen--stack`) pushes the overflow out of *both* ends. `justify-content: safe center` falls back
to flex-start exactly when that would happen.

This is **not something the sidebar caused**: re-running the matrix against `HEAD` with SHELL-02
stashed reproduces it at 2x and 3x, on every theme — 8px of Tools and 248px of inKey unreachable at
the *default* scale. The SHELL-01 matrix never looked for it. It does now: the harness fails any
combination with content above the region's top, and reverting `safe center` fails 6 combinations.

**Verification**: 184 renderer tests (+23), including sidebar rendering, grouping, the disabled-
destination rule, `aria-current` in both states, accessible names surviving the collapse, and
persistence across a remount. 75/75 on the packaged-build matrix, now with two new checks
(unreachable content, results-frame overflow). 4 E2E tests, lint, typecheck, `build:check` clean.
No Python changed.

**One judgement call worth flagging**: the expanded sidebar is sized for the longest label the
registry declares ("Collections"), capped at 34vw. The first attempt sized the rail instead and
truncated every label to two characters — caught by looking at a screenshot, not by any test.

---

## SHELL-02 — Navigation Registry and Sidebar (original plan)

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

**Two cleanups this step inherits, both found during SHELL-01:**

- **`--safe-bottom` still reserves 48px for the pill.** `layout.css` pads every screen's bottom
  by `calc(var(--screen-padding) + 48px)`, commented "extra bottom clearance for lab route nav".
  Deleting the pill without deleting that leaves every screen with dead space at the bottom.
- **`--results-frame-max-width: 80vw` is measured against the viewport, not the content region.**
  It predates the shell, when the content area *was* the window. Once a sidebar takes horizontal
  space, 80vw can exceed the region and reintroduce the horizontal overflow the SHELL-01 matrix
  checks for. Re-run that matrix after the sidebar lands; if it overflows, the fix is a
  container-relative unit (`%` of the content region, or a container query), not a smaller `vw`.

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

## SHELL-04 — Global Search (Engine and UI) ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete, end to end. `GET /api/v1/library/search` runs a real query over the Phase 1
`tracks` table; the shell header has a search field on `Ctrl+K`; and searching in the packaged app
returns real rows from a real database.

**Built exactly to the specified contract.** The response envelope, the field list, artist-then-
title ordering, the blank-query rule and the server-side clamp (default 50, max 200) are as
specified, with one addition: `library_empty`. Without it the renderer cannot tell "you have not
imported anything yet" from "that track is not here" — the same zero-result payload, two different
problems, two different answers. DEC-023 accepted that search finds nothing until the Library
phase lands, which makes the empty case the *normal* case for now, so distinguishing it matters
more here than it would later.

**LIKE metacharacters are escaped, not just bound.** Parameter binding stops injection; it does not
stop `%` and `_` being read as wildcards, and unescaped a search for `_` matches every track that
has any character in that field. The escape character is `!` rather than backslash, so nothing
between here and SQLite can eat it. Six tests cover it, including that the escape character itself
is literal and that a `'; DROP TABLE tracks; --` query returns nothing and leaves the table intact.

**A contract bug the type-checker could not see, found by running the app.** The first end-to-end
run failed with `engine.searchLibrary is not a function`. The Python endpoint, the IPC channel, the
preload method, the bridge types and `EngineClient` were all correct — but `main.ts` calls
`engine.X()` on the `EngineSupervisor` facade, which forwards to the client method by method, and
that forwarder was missing. `main.ts` compiles against whatever the supervisor happens to have, so
this passed typecheck, lint and 220 renderer tests. Preamble fact 1 has been corrected: the
contract is **six** files, not five.

Two guards now exist, both verified to fail on the real bug: `desktopContract.test.ts` parses
`main.ts`, `preload.cjs`, `engineClient.ts`, `engineSupervisor.ts` and the bridge types and checks
they line up in both directions; and an E2E test types a query in the packaged app and asserts the
panel resolves rather than showing "Search failed". The E2E assertion is deliberately data-
independent — this machine's library may hold anything — so it checks that the round trip
*completed*, not what it found.

**Ctrl+K, as SHELL-04 decided.** `Ctrl+F` keeps its registered in-table meaning; the new binding is
in `KEYBOARD_SHORTCUTS`, so the shortcuts dialog is not lying.

**Verified against a seeded library, in the packaged app.** Launched with `USERPROFILE` pointed at
a temporary home so the real `~/.cuepoint/cuepoint.db` was never touched, over a five-track
database: "deadmau5" returned both its tracks in artist-then-title order; "Innervisions" matched on
label; "zzzznope" reported no matches (not an empty library); `%%` returned nothing, proving the
LIKE escaping holds through the whole stack; and Ctrl+K focused the field from another page.

**Verification**: 42 new Python tests (25 repository/service, 17 engine) and 28 new renderer tests
(222 total). Full Python unit suite green — 2243 passed, 45 skipped. 5 E2E tests; the shell layout
matrix re-run with the search header in place — 75/75 on the packaged build. Renderer lint,
typecheck and `build:check` clean; ruff, ruff format, the Qt guard and version coupling clean.

**A note for the next person who sees a red suite here**: the machine's C: drive hit 0 bytes free
during this step, and pytest then cannot create temporary directories. That produces
`OSError: [Errno 28] No space left on device` and a wall of errors that look nothing like a disk
problem — 89 failed, 219 errors, across tests that have nothing to do with each other. Check free
space before believing a failure pattern like that. Everything above was re-run and passed once
space was available.

---

## SHELL-04 — Global Search (Engine and UI) (original plan)

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

## SHELL-05 — Track Inspector Container ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. The Inspector is docked right, resizable by mouse or keyboard, hideable,
and remembers its width and visibility. It holds an empty state and a documented slot; no track
data is wired to it, per DEC-024.

**It persists because it lives in the shell, not in a screen.** That is the whole of DEC-018, and
a test asserts the stronger version: the Inspector element after navigating is the *same DOM node*,
not merely another one that looks like it. Presence alone would pass against a component that
remounts and silently loses whatever state a later phase puts in it.

**Clamping is applied on read, never on write.** A width is stored in CSS pixels but the window it
was chosen in is not, so a panel sized on a wide monitor can leave no room for content on a laptop.
Storing the clamped value would shrink it permanently the first time that happened; clamping on
read honors the original choice again when there is room. Verified in the app: a stored 4000px
renders as 632px (half of a 1264px window) while 4000 stays in storage.

**Bounds that cannot cross.** The maximum is half the window, the minimum 220px — below a ~440px
window those invert, and a maximum that undercut the minimum would collapse the panel to nothing.
`inspectorMaxWidth()` takes the larger of the two, with a test for it.

**Resizable without a mouse.** The handle is a focusable `separator` with arrow-key resizing and
`aria-valuenow`, and `Ctrl+I` toggles the panel (registered in `KEYBOARD_SHORTCUTS`, so the
shortcuts dialog stays honest). Hiding leaves only a small reveal control, which is what actually
returns the space to the content area — measured: 624px to 880px.

**One layout bug, found by the matrix.** At 3x the uppercase "INSPECTOR" title would not shrink and
pushed the hide button 6px past the window edge — the same flex `min-width: auto` trap as
SHELL-02's grid. The title now truncates and the buttons never shrink: a control you cannot hit is
worse than a word you cannot finish.

**Verified in the packaged app, not just jsdom.** A real pointer drag widened the panel 320→440;
the width survived navigation and two restarts; hiding persisted and survived a restart; `Ctrl+I`
restored it; and an oversized stored width clamped without pushing content off-screen. The drag in
particular is not something a component test can prove, so it is also covered by a new E2E test.

**A harness lesson worth recording**: the first drag attempt appeared to do nothing. The cause was
my verification script, not the app — it set the onboarding flag without reloading, so the dialog
was still mounted and its backdrop swallowed the drag. When a pointer interaction "does nothing" in
a test, suspect an overlay before suspecting the handler.

**Verification**: 33 new renderer tests (255 total), 6 E2E tests, 75/75 on the packaged-build
matrix with the Inspector present, lint/typecheck/`build:check` clean, Python engine and
persistence suites green (188).

---

## SHELL-05 — Track Inspector Container (original plan)

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

## SHELL-06 — Player Region Slot ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete, and deliberately invisible. `PlayerRegion` is mounted between the content
area and the status strip, spanning the full width beneath sidebar and inspector. It renders
nothing and occupies nothing until Phase 5.

**It returns `null`, not an empty `<div>`.** An element with a class is somewhere a border, a
padding or a `min-height` can attach later, which is exactly how a region that should be invisible
acquires a size. The wrapper `.app-shell__player` still exists — that is the boundary Phase 5 fills
— but there is nothing inside it for the `auto` grid row to size to.

**"Pixel-identical" was measured, not asserted.** The DoD asks that the shell with the region
render identically to a build without it, so both builds were captured across 3 scales × 2 screens:
every region's bounding box matched exactly, and all **six screenshots were byte-identical by
SHA-256**.

**The zero-height promise is now enforced on every run.** The layout matrix checks that the player
region is empty and exactly 0px tall in all 75 combinations. Adding `min-height: 1px` to it fails
all 75 — a single stray pixel is caught, which is the point: this is a regression nobody would ever
notice by eye.

**Both halves of the slot are tested.** Empty renders nothing; filled renders its content in the
right place. Without the second, Phase 5 could mount a player into a region that never shows it,
and the "it takes no space" test would happily keep passing.

**Scope held.** DEC-025 rejected a visibly disabled transport, and the transport pixel icons from
FOUNDATION-14 are still unused. No CSS file was added: styling belongs with the thing that fills
the region, not with the hole it leaves.

**Verification**: 7 new renderer tests (262 total), 6 E2E tests, 75/75 on the packaged-build matrix
with the new zero-height check, byte-identical screenshot comparison against the previous build,
lint/typecheck/`build:check` clean.

---

## SHELL-06 — Player Region Slot (original plan)

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

## SHELL-07 — Engine and Job Status Strip ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. A status strip along the bottom of the shell reports engine state and the
running job. Two things Phase 1 built and nothing displayed — durable job records (FOUNDATION-07)
and engine status — are finally visible.

**The carried-in obligation is discharged.** `EngineStatusBanner` read the status once on mount
with no refresh path, so it reported whatever was true at first paint and then went stale in
silence. It is **deleted**, not left alongside the strip: two reporters of the same state can
disagree. Verified the way the obligation demanded — by killing the engine process with the app
open, not by unit test: the strip went from "Engine connected · v1.0.0-feb1" to "Engine offline:
Engine not running" **with no remount and no navigation**.

**A gap that is real but not this step's to fix**: nothing brings the engine back. `EngineSupervisor`
spawns it once at startup and has no restart path, so after a crash the strip correctly reports
offline forever and the app must be restarted. The strip reports state faithfully; respawning is
supervisor behavior. Recorded here as a candidate follow-up rather than smuggled into this step.

**The new endpoint merges two sources.** `GET /api/v1/jobs?state=<active|all>&limit=<n>` combines
the in-memory store, whose progress is live, with `IJobRepository`, which survives an engine
restart. Neither alone answers "what is happening right now": persisted progress is sampled at
most once a second by design, and the in-memory store forgets everything on restart. The live copy
wins on conflict; the persisted `type` discriminator is preserved, since the in-memory job predates
that column. `active_count` is returned separately from the page, so a strip showing one job can
still say how many are running.

**Discovery polls; progress does not.** A job can be started from another screen, another window,
or a renderer that has since reloaded, and nothing broadcasts that — so the strip asks. Once a job
is known, its ticks arrive over the existing SSE stream rather than by repeated asking. The poll is
**2 seconds**, lowered from a first pass at 4: four is long enough that starting a match and
glancing down looks broken. A consequence worth stating plainly: a job shorter than the interval
can finish unseen — a demo run completes in ~300ms and is usually missed. That is acceptable, since
the jobs worth reporting on are the ones that take long enough to want reporting on.

**All three DoD items verified in the packaged app**, not only in jsdom:
- engine down without a remount — killed `python.exe`, strip flipped to offline;
- a job started on one destination visible from another — 20 sightings with live progress while
  sitting on Settings;
- a job still running after a renderer reload picked up — 10 sightings after a reload, of jobs
  whose ids that renderer had never seen.

**Verification**: 18 new Python tests, 17 new renderer tests (280 total), 6 E2E, 75/75 on the
packaged-build matrix with a new "status strip present" check, full Python suite 2261 passed,
ruff/format/Qt guard clean, renderer lint/typecheck/`build:check` clean.

---

## SHELL-07 — Engine and Job Status Strip (original plan)

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

## SHELL-08 — Activity Panel ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. `GET /api/v1/activity/recent` reads FOUNDATION-08's append-only feed, and
an Activity panel opens from the status strip. Phase 1 has been recording activity into that table
since it was built; this is the first thing that reads it back out.

**Nothing writes to the feed yet.** `record_event` has no callers anywhere in the codebase, so the
panel is empty in normal use — which makes the empty state the *normal* state, as with search
before Phase 3. The message says what will appear rather than leaving a blank box. Giving the feed
producers (a backup event, an import event) belongs to the steps that perform those actions, not
here; recorded as a follow-up rather than smuggled in.

**Called Activity, never History — enforced, not just intended.** `/api/v1/history/*` already
means past match runs, which are exported CSV files. Two tests pin the separation: the activity
feed is not served under `/history`, and `/history/recent` still returns files rather than events.
A renderer test asserts the panel never says "history" anywhere.

**Read-only, deliberately.** DEC-008 supports reverting a field change, but nothing can edit a
field yet, so a revert button would act on nothing. A test asserts there is no revert control, so
adding one becomes a decision rather than an accident.

**`event_count` was added to the service, not read from the repository.** Engine handlers call
services; reaching past one to a repository would be the first exception to a seam FOUNDATION-06
established.

**Two bugs the running app found that the tests did not.** Both were invisible in jsdom, which has
no layout:
- *"1 fields"*. A field-change event usually carries exactly one key, so the plural was on screen
  immediately. Fixed, with a test.
- *Every summary refused to wrap, and the list scrolled sideways.* The panel was rendered inside
  the status strip's `<div>`, so the dialog inherited `white-space: nowrap` from it — a dialog
  silently taking the styling of whatever happened to render it. It is now a sibling of the strip.
  The shared `Modal` also gained an optional `size="wide"`: 520px is right for a question and wrong
  for a log.

**Verified in the packaged app** against three events recorded through the real `ActivityService`
into an isolated library: the panel listed all three newest-first, rendered detail readably
(`count: 5 · source: rekordbox`), reported "3 events", showed no horizontal overflow anywhere, and
reloaded on reopen.

**Verification**: 12 new Python tests, 28 new renderer tests (308 total), 6 E2E, 75/75 on the
packaged-build matrix, full Python suite 2273 passed, ruff/format/Qt guard clean, renderer
lint/typecheck/`build:check` clean.

---

## SHELL-08 — Activity Panel (original plan)

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

## SHELL-09 — Shell Iconography ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete. Six icons drawn — `collections`, `clean`, `discover`, `prepare`, `match`,
`incrate` — and every navigation destination now renders pixel artwork. No Unicode glyphs remain
in the sidebar.

**The set was confirmed against the code, not the plan.** The step description guessed at
`search` and `inspector`; neither is needed — the header search field has no icon and the
Inspector's controls are chevrons. What the registry actually still had as glyphs was `match` and
`incrate`, which the plan did not list.

**No new pipeline.** The existing 12×12 text-grid format was used unchanged, so each icon is
readable and reviewable as a diff rather than a binary sprite.

**Three of the six had to be redrawn after looking at them**, which is the whole substance of a
step like this:
- *discover* read as a letter **Q** — twice. The handle hung from the bottom of the ring like a
  tail; it attaches at the lower-right corner on a 45° diagonal now.
- *prepare* was mud, exactly as the plan predicted for it. A cue marker over a timeline is too
  many parts for 12×12. It is a flag now: one shape, survives 1×.
- *incrate* read as a minus sign — a plain box with a slot. The dividers are what make it a crate.
- *match* had an eighth note's flag that blurred into a blob; a quarter note needs no flag.

**Judged from a contact sheet, not from the code.** Every icon was rendered at 24/48/96px beside
the existing set and inspected, then re-checked in the running sidebar: expanded and collapsed, at
1×/2×/3×, in three themes. The collapsed rail — the DEC-022 case where an icon is the only thing
identifying a destination — is comprehensible from icons alone.

**A test I wrote and then deleted.** I added a rule that every icon must leave one clear edge, and
it failed on the existing `settings` gear, which fills the grid deliberately and renders fine. The
rule was mine, not the codebase's, so it went rather than being weakened until it passed.

**Left as glyphs, deliberately**: the sidebar collapse chevrons and the Inspector's show/hide
chevrons. They are controls, not destinations, and DEC-010 reserved the glyph path for exactly
that. The `activity` icon drawn in FOUNDATION-14 is still unused — the status strip's entry point
is a text button — and is left alone rather than forced into service.

**Verification**: 350 renderer tests (+42, including a test that no destination is a glyph and one
that every icon carries a stroke at least two cells wide, since a single cell is two pixels at 1×),
6 E2E, 75/75 on the packaged-build matrix, lint/typecheck/`build:check` clean.

---

## SHELL-09 — Shell Iconography (original plan)

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

## SHELL-10 — Shell Hardening ✅ IMPLEMENTED 2026-09-02

**Outcome**: Complete, and Phase 2 with it.

**The audit came first, and most of it already passed.** Walking the real app's tab order found
every shell region reachable in visual order — search, navigation, page, Inspector, status strip —
with a visible focus indicator on every control. Two landmarks were missing: the header region is
`role="search"` now and the status strip is a `<footer>` (contentinfo). Both live on the shell's
region wrappers rather than inside the components, so a component that later moves does not carry
the shell's semantics with it.

**Tab order follows the screen, not the plan.** The step description listed sidebar before
header; the header spans above the sidebar, so tab order goes header first. Visual order wins.

**Bindings chosen and implemented**: `Ctrl+B` collapses navigation, `Ctrl+Shift+A` opens Activity.
With `Ctrl+K` (search) and `Ctrl+I` (Inspector) that completes the shell's keyboard model, and a
test now asserts **no key carries two meanings** — the DoD condition that made SHELL-04 pick
`Ctrl+K` rather than overloading `Ctrl+F`.

**Focus no longer falls to `<body>`.** Hiding the Inspector removes the button the user just
pressed; focus now moves to the control that replaced it, and `Ctrl+B` leaves focus on the sidebar
toggle. Neither moves focus on first render — an app that grabs focus on launch is worse than one
that never moves it.

**Dialogs became usable by keyboard at all.** `Modal` had no focus management and no Escape
handler: a keyboard user could open any dialog in the app and never reach it, and `aria-modal`
promised a containment that did not exist. It now takes focus on open (the dialog itself, so the
title is announced and the user does not start on the close button), keeps Tab inside, closes on
Escape, and returns focus to whatever opened it. All twelve existing dialogs inherit this; none
broke.

**Two clipping defects, found by making the check general.** The parked 3× Results item turned out
to be measurable and worse than "cut off": 480px of the screen was unreachable, because
`.screen--fill` shrank to fit and clipped rather than letting anything scroll. Fixing it exposed a
second one the same check caught — `.results-frame .cp-panel--in-frame` set `min-height: 0`, so at
the **default** scale the Results panel was squeezed to 118px while holding 281px and its filter
control was simply absent. Both fixed; the matrix now fails any combination where an element
overflows something that cannot scroll.

`min-height: min-content` on `.screen--fill` was tried first and did nothing — its children are
themselves scroll containers, so its min-content collapses. That is recorded in the CSS because
the next person will reach for the same thing.

**E2E now covers the promises unit tests cannot.** Sidebar collapse and Inspector state across a
real restart, and a keyboard walk asserting every region is reachable and each of the four
bindings works, ending with Escape closing the Activity dialog.

**Docs**: `docs/user-guide/the-window.md` describes the window, the shortcuts and the two honest
limitations a user will meet — the engine does not restart itself, and Activity is empty until
features record into it. Linked from both documentation indexes.

**Verification**: 374 renderer tests (+24), 8 E2E, 75/75 on the packaged-build matrix with the new
clipped-content check, full Python suite 2273 passed, ruff/format/Qt guard/version coupling clean,
engine health smoke passes (with `PYTHONPATH=src`, as it has always needed).

---

## SHELL-10 — Shell Hardening (original plan)

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
- **Screens at 3× in a small window.** SHELL-01 measured, and screenshotted, the Results screen
  being cut off at 3× scale at 1280×800: the toolbar wraps to two rows and `.screen--fill`'s
  `overflow: hidden` clips what is left. It is **pre-existing** — before/after screenshots against
  the un-shelled tree are identical, so SHELL-01 neither caused nor fixed it — and it is recorded
  here because nothing else tracks it. Decide it deliberately: either accept it (the results table
  scrolls internally once there are rows) or give `.screen--fill` a minimum height and let the
  content region scroll.
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
   renders a screen on first paint (SHELL-03), the status strip updates without a remount
   (SHELL-07), and no keyboard shortcut has two meanings (SHELL-04 decided, SHELL-10 documented
   and now tests it).

**All eight were met on 2026-09-02.** Verified in a packaged build: 2273 Python tests, 374 renderer
tests, 8 E2E, 75/75 on the layout matrix across 5 themes × 3 scales × 5 screens.

### Carried out of Phase 2

Real items found along the way that belong to later work, recorded so they are not lost:

- **The engine never restarts.** `EngineSupervisor` spawns it once at startup; after a crash the
  status strip correctly reports offline forever and the app must be restarted. Reporting is the
  strip's job, respawning is the supervisor's.
- **Nothing records activity events.** `record_event` has no callers, so the Activity panel is
  empty in normal use. The steps that perform backups, imports and edits should record them.
- **`Modal` renders where it is mounted.** SHELL-08 hit a dialog inheriting `white-space: nowrap`
  from the status strip. Portalling to `document.body` would make that class of bug impossible;
  it was not needed to fix the live case, so it was not done.
- **A job shorter than the status strip's 2s discovery poll is never seen.** Fine for real match
  runs, wrong for anything brief.
- **Dead query parameters on the dev URL.** `main.ts` appends `?engine=…&engineVersion=…` when it
  loads the renderer in development, and nothing reads them — `AboutDialog` gets the version
  through the bridge. Found while checking what a hash router would break in SHELL-04; harmless,
  and left rather than touched outside a step that has reason to.

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
