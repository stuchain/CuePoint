# CuePoint v1.0.0 — Phase 14: The Pages Revisited, Detailed Step Specifications

Status: **Specified 2026-10-07. No step is implemented yet.** Thirteen steps, PAGES-01…PAGES-13.
The page reviews DEC-131 asks for are written in `PHASE14_REVIEWS.md`, 107 proposals across eleven
surfaces, each with a screenshot of the app as it is today (`phase14/`). The user marked them on
2026-10-07, taking the recommendation on every one (DEC-159): 100 accepted, and NAV-4, STR-4, BAR-6
and BAR-10 declined. Writing the reviews raised six questions that Decision Round 14 did not answer,
asked as Decision Round 17 (Q-157…Q-162). All six are settled (DEC-154…DEC-158, DEC-160). DEC-161 later added a 1.5× size as the default. The steps below name every
proposal they could carry, and each carries only the accepted ones. Per the process, no implementation happens from this document. Each
step needs an explicit "Implement PAGES-NN" instruction, scoped to exactly that step, and its outcome
is recorded under the step afterwards.

Depends on Phases 1–13. Phase 13 must be complete first (DEC-140): REPORT-01 adds the Privacy panel
to Settings, REPORT-06 adds the error screen and Help → **Report a problem**, and both are pages this
phase then revisits. Decision Rounds 1–16 apply (`DECISIONS.md`, DEC-001…DEC-153). This phase's own
decisions are DEC-130 (Discover is a review), DEC-131 (each page reviewed in writing, proposal by
proposal), DEC-132 (clear to new users), DEC-133 (the Camelot wheel), DEC-134 (every kind of
motion, each behind a switch) and DEC-135 (pixel steps, smooth fades), with DEC-096 (the key rule the
wheel lights), DEC-010 (the pixel style) and DEC-140 (its place, after error reporting).

The step prefix is PAGES.

## What this phase is

CuePoint does what it was built to do, but it explains almost none of it. The reviews found the same
four gaps on every page:
- **Words from the inside.** "Engine connected", "No jobs running", "Inspector", "Run", "Push",
  "Resolve Beatport identities", "Disputed", "Paste Bearer token", "Neo-dark SaaS". "Collection" means
  both the Rekordbox export and CuePoint's own lists.
- **Empty states that stop.** "Nothing is matched yet." offers a button that matches nothing.
  "No tracks match this search." has no way out. A second Set cannot be made from Prepare.
- **Background work nobody explains.** An import quietly starts five jobs. The status strip names
  them; no page says what they are or that the user can keep working.
- **Dead ends.** Search results cannot be clicked. The queue cannot be cleared. Artist pages and
  Similar tracks cannot be reached from Discover.

This phase fixes what the user accepts of that, and adds the two things Decision Round 14 decided:
- **A pixel-art Camelot wheel** in the header, lit for the track and filtering the Library
  (DEC-133).
- **Motion, all ten kinds, each behind its own switch** (DEC-134), in pixel steps with smooth fades
  (DEC-135). The user tries every kind in the running app and picks the defaults.

**What this phase is not.**
- **No new feature beyond the wheel and motion.** Statistics is Phase 15, the updater Phase 16.
- **No like or dislike on Discover** (DEC-130).
- **No change to what the engine stores.** Field ids, job types, config keys and the API stay. The
  engine changes only labels it sends for display (filter fields, Health checks) and gains one read
  route for the wheel (PAGES-10).
- **No new theme or layout.** The pixel design system stands (`PIXEL_DESIGN_SYSTEM.md`, DEC-010).
- **No proposal the user rejected,** however small.

## The reviews, and how they become steps

`PHASE14_REVIEWS.md` holds one review per surface, as DEC-131 lays it out: what it does, what a new
or non-technical user would not understand, and numbered proposals, each with what changes, why, its
size, the files it touches, a recommendation and a screenshot.

| Surface | Proposals | Built in |
| --- | --- | --- |
| Settings | SET-1…SET-11 | PAGES-01 (SET-2 also in PAGES-02) |
| The sidebar | NAV-1…NAV-6 | PAGES-03 |
| The header and menu bar | HDR-1…HDR-7 (HDR-4 is DEC-133's placement) | PAGES-03, PAGES-10 |
| The status strip and Activity | STR-1…STR-9 | PAGES-03 |
| The player bar and queue | BAR-1…BAR-10 | PAGES-04 (BAR-5 in PAGES-10) |
| The Library | LIB-1…LIB-12 | PAGES-05 |
| The Inspector | INS-1…INS-11 | PAGES-06 |
| Clean | CLN-1…CLN-12 | PAGES-07 |
| Discover (with DEC-130's keep, change or remove for each of its 21 parts) | DSC-1…DSC-12 | PAGES-08 |
| Prepare | PRP-1…PRP-13 (PRP-13 joins RUN-1) | PAGES-09 |
| The first run | RUN-1…RUN-4 | PAGES-11 |

**The marks.** Recorded beside each proposal in the review, and as DEC-159: every proposal took its
recommendation. Declined: NAV-4 (sidebar count badges), STR-4 (a toast per first job), BAR-6 (the
waveform reason in the seek area) and BAR-10 (a "how to play" hint). NAV-3 and STR-1 follow DEC-156
and DEC-155. A step whose surface has
no accepted proposal shrinks to what DEC-132 to DEC-135 require of it, or disappears.

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-130 | Discover reviewed part by part, each kept, changed or removed. No like or dislike feature. |
| DEC-131 | A written review per surface, a screenshot per proposal, the user's yes or no on each, and only the accepted built. |
| DEC-132 | Plain words throughout; empty states that say what to do next; background work explained as it happens; a short first-run guide. |
| DEC-133 | A pixel-art Camelot wheel behind a header button beside search, on every page. It lights the selected or playing track's key and DEC-096's compatible keys, and a key clicked filters the Library. Compatibility comes from the engine's rule; the filter is the Library's own. |
| DEC-134 | All ten kinds of motion built, each behind its own Settings switch. `prefers-reduced-motion` honored. No motion delays a click or a keypress. Transform and opacity only. Phase 6's and WAVE-06's scroll checks re-run with every kind on. Defaults picked by the user after testing, recorded as an amendment. |
| DEC-135 | Movement and scaling in whole pixels and stepped frames; fades smooth. Duration and step tokens in `tokens.css`, stepping the same at 1×, 2× and 3×. |
| DEC-096 | The wheel lights the same key, one step either way, and the relative key. |
| DEC-140 | This phase runs alone, after Phase 13. |

## Sequencing

**Settings first, then motion's groundwork.** PAGES-01 gives Settings its sections, so PAGES-02's
Motion panel and Phase 13's Privacy panel land in their places rather than at the bottom of a list.
PAGES-02 lays down the tokens, the ten switches and the reduced-motion rule, and moves today's three
motion rules behind them. From then on, every new piece of UI the later steps add is written against
the switches.

**The pages, one step each.** PAGES-03 (the shell) comes before the pages because it changes the
words every page shares: the status strip, the job labels and Activity. PAGES-04 to PAGES-09 then
take one surface each, in any order the user likes; none depends on another, except that PAGES-06
(the Inspector) reuses the words PAGES-07 (Clean) changes in `cleanFormat.ts`, so whichever runs
second follows the first.

**The wheel after the pages.** PAGES-10 needs PAGES-03's header and the shell's new record of the
selected track, which PAGES-05 to PAGES-09 each feed from their pages.

**The first-run guide after the pages,** because it shows them and quotes their new words.

**Motion last.** PAGES-12 builds the ten kinds across the finished pages, then re-runs the scroll
checks with every kind on. PAGES-13 is the user's test: they try each kind, pick the defaults, and
the phase comes together.

**Every intermediate build keeps working,** with every suite green and the engine smoke check
passing. A step that renames a string updates every test and every user-guide page that quotes it,
in the same commit.

## Before starting any step — ten cross-cutting facts

### 1. The words are tested

The end-to-end specs find controls by their visible names. A rename that misses one turns the suite
red on a working build. The names most quoted:

| Words | Specs that quote them |
| --- | --- |
| "Check for changes" | `libraryPage`, `libraryBrowse`, `libraryJourney`, `organization`, `clean`, `prepareJourney`, `trackMarks` |
| "Engine connected" | every spec, through `ready()` helpers and `.cp-status`; `engineReady.ts` asks the bridge instead |
| "Track inspector" | `shell`, `prepareJourney`, `prepareSource` |
| "No collection imported yet", "Import a collection" | `libraryPage`, `cleanPage` |
| The match states, "#n · 94.0" | `clean`, `cleanPage`, `cleanLibrary` |
| "Run", "New run", "Push" | `discover`, `discoverPages` |
| "Files checked", "Check every file" | `cleanPage`, `waveformSettings` |
| "In", "Out", "Acknowledge" | `prepareJourney`, `prepareSource` |

Each step greps `apps/desktop-electron/e2e/` and the renderer's tests for every string it changes.
**"Engine connected" is the one string the specs wait on everywhere**: DEC-155 replaces it, so PAGES-03
first moves every spec's `ready()` to `waitForEngine()` (`e2e/engineReady.ts`), in its own commit.

### 2. Some word modules are shared

A change to one of these changes every surface that reads it, and is made once, in the step named:

| Module | Read by | Changed in |
| --- | --- | --- |
| `components/waveform/analysisWords.ts` | the player bar, the Inspector, Prepare's strip, the Library's Waveform column, Settings → Waveforms | PAGES-04 (BAR-7), with INS-8, PRP-12 and SET-6 using its result |
| `screens/clean/cleanFormat.ts` | Clean, the Inspector's Beatport section | PAGES-07 (CLN-4) |
| `components/shell/activityActions.ts` | Activity, the Inspector's History | PAGES-06 (INS-7) |
| `components/shell/useActiveJob.ts` (`JOB_VERBS`) | the status strip, LIB-1's ready note | PAGES-03 (STR-3) |
| `screens/discover/similarReasons.ts`, `screens/prepare/prepareSource.ts` | Similar tracks, Prepare's Suggestions, the wheel | PAGES-08 (DSC-10) and PAGES-09 (PRP-8) use the same key words |

### 3. The engine sends some of the words

The filter's Field list (`src/cuepoint/models/filter_rule.py:513-730`) and the Health counts and
checks (`src/cuepoint/services/health_service.py:89-161`) are labels the engine sends. Renaming them
(LIB-7, CLN-4, CLN-9) changes the label only: the field ids and check names are stored in saved
Smart Collections and rules, and do not change. No migration.

### 4. The shell has no "selected track"

Each page owns its selection, and hands the Inspector a rendered element through `useInspectorSlot`
(`components/shell/inspectorSlot.tsx:107`), not a track. The playing track is readable anywhere
(`selectCurrentItem`, `components/player/playerStore.ts`). The wheel needs the selected track's key,
so PAGES-05 adds a small shell store, `useSelectedTrack()` / `setSelectedTrack({ id, key } | null)`,
set beside each page's `useInspectorSlot` call (Library, Clean's Review and Missing files, Discover's
artist pages and Similar tracks, Prepare). PAGES-06 to PAGES-09 feed it from their pages.

### 5. The Library's key filter is text, and no route answers "what mixes with 8A"

"Key" is an effective text field (`filter_rule.py:520`). `is` compares text, case-blind
(`src/cuepoint/persistence/filter_sql.py:231-240`), so "8A" does not find a track spelled "Am".
DEC-096's rule lives in `src/cuepoint/core/similarity.py` (`compatible_keys`, `:224`;
`key_relation`, `:208`), and the spellings a library uses for a key come from
`similarity_repository.spellings("key")`, as `similarity_service.py:358-366` does. No API route
exposes either. PAGES-10 adds one read route and filters with `any_of` over the spellings.

### 6. Motion today: three rules, no tokens, no reduced motion

The renderer moves in three places: the button's press (`components/Button.css:16`, `:38-40`) and
the toast's entrance (`components/Toast.css:18`, `:41-50`). Nothing reads `prefers-reduced-motion`;
the toast slides in regardless. `tokens/tokens.css` has the integer scale (`--scale`, `--unit`) and
no duration or step tokens. `<html data-scale>` is set by `tokens/scale.ts`, so CSS can step per
scale.

### 7. Renderer settings are separate localStorage keys

`cuepoint-ui-lab-scale`, `cuepoint-ui-lab-theme`, `cuepoint-waveform-colour`, `cuepoint-player-*`,
`cuepoint-privacy-*`, `cuepoint-ui-shell-*` and `cuepoint-onboarding-complete`, each read with a
try/catch fallback (`tokens/storageFailure.test.tsx`). Main's `main-settings.json` holds the
set-list folder and, after REPORT-01, `errorReporting`. The motion switches follow the renderer's
pattern: one key, `cuepoint-motion`.

### 8. The scroll checks DEC-134 names

- **WAVE-06's** is `e2e/waveformPlaces.spec.ts:357`: no long task over 50 ms while scrolling 5,000
  rows with the Waveform column shown.
- **"Phase 6's"** is not a renderer test. Phase 6's scale checks are engine timings
  (`scripts/bench_library.py`). The renderer's 50,000-row scroll is Phase 4's memory test,
  `e2e/libraryBrowse.spec.ts:270`, run only with `CUEPOINT_E2E_MEMORY=1`.

None measures dropped frames. PAGES-12 re-runs all three with every kind on, and adds WAVE-06's
long-task probe to the 50,000-row scroll.

### 9. The first-run tour has three defects

`components/OnboardingDialog.tsx`: reopening from Help starts on the last screen seen (`step` is never
reset, `:28`); Escape or a click on the backdrop marks the tour done for good (`onClose={finish}`,
`:41`); and `finish()` writes localStorage with no try/catch (`:33`). The user guide documents a flag,
`product.onboarding_seen` (`docs/user-guide/getting-started.md:79-81`), that the desktop app never
reads.

### 10. The user guide quotes the UI

`docs/user-guide/` quotes the strings this phase changes, chiefly `the-window.md` (the sidebar,
search, the status strip, Activity, shortcuts), `getting-started.md`, `library.md`, `clean.md`,
`discover.md`, `prepare.md`, `player.md`, `waveforms.md` and `glossary.md`. Each step updates the
pages for its surface. PAGES-13 checks the whole guide against the app.

---

## PAGES-01 — Settings, One Page in Sections

**Objective**: Settings becomes one page with a heading and named sections in a fixed order, with
room for what this phase and the next two add.

**User-visible result**: Settings opens with the heading "Settings" and a short list of section
links: Appearance, Motion, Playback, Waveforms, Beatport, Rekordbox export, Privacy, About & updates.
The Beatport token panel is no longer titled "Settings". The accepted SET proposals change the
words in each section.

**Dependencies**: Phase 13 (REPORT-01's Privacy panel exists).

**Proposals carried, if accepted**: SET-1 (the sections), SET-3 (theme names, the editor, a confirm on
delete), SET-4 (size, with DEC-161's 1.5× default), SET-5 (the Beatport section), SET-6 (waveform data behind a disclosure, the
"nothing to analyse" words), SET-7 (one Privacy section with the exit-clearing choices), SET-8 (audio
words), SET-9 (export words), SET-10 (a "Saved" tick), SET-11 (reset per section).

**Design**:
- **The page is `SettingsScreen.tsx`.** `SettingsExportScreen.tsx` is renamed; its name dates from
  Results (DEC-071). The route stays `/settings`.
- **Sections, not tabs.** The links scroll to the sections, so Discover's **Open Settings** still
  lands on the token field (`BEATPORT_TOKEN_FIELD_ID`) and the specs' `getByRole("link", { name:
  "Settings" })` still works. At narrow widths the links sit above the sections.
- **Motion is a placeholder** until PAGES-02 fills it. **About & updates** holds the version (moved
  from the status strip if STR-1 is accepted), Help → Getting started, and the slot Phase 16's
  "Check for updates" takes.
- **Privacy is REPORT-01's panel,** moved into place. REPORT-01's text, "last on the page, after
  Rekordbox export", is amended to "after Rekordbox export". If SET-7 is accepted, the section also
  holds "Clear cache on exit" and "Clear logs on exit", on the same `cuepoint-privacy-clear-*-on-exit`
  keys as Help → Privacy (`components/PrivacyDialog.tsx:5-6`), so both show one state.
- **Theme ids do not change** (SET-3). Only their labels do, so a stored theme still loads.
- **A 1.5× size, the default** (DEC-161). `tokens/scale.ts` offers `[1, 1.5, 2, 3]` and
  `DEFAULT_SCALE` becomes 1.5. The stored value is read with `Number`, not `parseInt` (which reads
  "1.5" as 1), on the same `cuepoint-ui-lab-scale` key. A stored 1, 2 or 3 is kept, so only a fresh
  install, or one that never chose, opens at 1.5. Every size token in `tokens/tokens.css` whose base
  is not a multiple of 2px (`--bevel-size-sm`, `--border-width-heavy`, and any other) is wrapped in
  `round(nearest, …, 1px)` so an edge never lands on half a pixel; Electron 34's Chromium supports
  it. The consumers of `useScaleFactor()` take a non-integer scale: the waveform's requested width
  (`waveformEnvironment.ts`), and the row heights Prepare and `SetTransition` read. Thumbnails are
  drawn at 3× already (DEC-076), so 1.5× only scales them down.

**Tests**:
- A new `SettingsScreen.test.tsx`: the heading, the eight sections in order, each link scrolls to its
  section, and Discover's deep link focuses the token field.
- `ThemeSettingsPanel` tests: a stored theme id from before the rename still applies; a custom theme
  is deleted only after the confirm (SET-3).
- `PrivacyDialog` and the Privacy section show the same state after either changes it (SET-7).
- `scale.test.ts`: with nothing stored the scale is 1.5; a stored "1.5" reads as 1.5, not 1; a
  stored "2" stays 2; an unknown value falls back to 1.5 (DEC-161).
- `e2e/playerBar.spec.ts` checks the bar fits at 1, 1.5, 2 and 3, and a new check confirms no
  computed border, bevel or focus-ring width is fractional at 1.5×.
- `e2e/waveformSettings.spec.ts`, `e2e/rekordboxExport.spec.ts`, `e2e/playerAudio.spec.ts` and
  `e2e/discover.spec.ts` pass with their strings updated.

**Acceptance criteria / DoD**:
- Every setting that existed before the step is on the page, in its section, and works.
- The token field is reachable from Discover in one click.
- `docs/user-guide/` describes the page as it now is.
- All suites pass.

**Risks**: Low. A deep link that names a removed element id is the one way to break another page.

**Complexity**: **M**

---

## PAGES-02 — Motion's Groundwork: Tokens, Ten Switches and Reduced Motion

**Objective**: The tokens every animation steps by, a stored switch for each of the ten kinds of
motion, and one rule that turns motion off when the system asks, before anything new moves.

**User-visible result**: Settings → Motion lists ten switches, all on, and says whether the system's
Reduce motion setting is on. The button's press and the toast's entrance obey their switches and the
system setting. Nothing else moves yet.

**Dependencies**: PAGES-01.

**Proposals carried, if accepted**: SET-2 (the Motion section in three plain groups, "Turn all on" and
"Turn all off", and a one-move preview beside each switch). If SET-2 is rejected, the section is a
plain list of the ten switches.

**Design**:
- **The ten kinds** (DEC-134, with DEC-154's tenth), each with a stable id:
  `micro` (microinteractions), `interaction` (interaction animations), `state` (state transitions),
  `page` (page transitions), `entrance` (entrance and exit), `hover` (hover and focus), `scroll`
  (scroll animations), `loading` (loading), `shared` (shared-element transitions), and `feedback` (DEC-154).
- **Stored** in localStorage as `cuepoint-motion`: `{ [kindId]: boolean }`. A missing, unreadable
  or partial value reads as every kind on. Defaults until PAGES-13: every kind on.
- **Applied as attributes.** A `MotionProvider` (`tokens/MotionContext.tsx`, beside `ScaleContext`)
  writes `data-motion-<kind>="on"` on `<html>` for each kind that is on and the system allows.
  When `prefers-reduced-motion: reduce` matches, it writes none of them, whatever the switches say,
  and listens for the setting changing. CSS gates every rule on its kind:
  `:root[data-motion-micro] .cp-btn { transition: … }`.
- **Tokens** (DEC-135) join `tokens/tokens.css`, beside the scale:
  - durations: `--motion-instant` (one frame), `--motion-quick`, `--motion-base`, `--motion-slow`;
  - steps: `--motion-steps-short`, `--motion-steps-long`, used as `steps(var(--motion-steps-…))`;
  - a distance unit, `--motion-step-px: var(--unit)`, so a 4-step slide moves whole device pixels
    at 1×, 2× and 3×;
  - a fade easing, `--motion-fade: linear`, for opacity, which is never stepped.
- **Two rules every motion obeys,** held by a test, not by review:
  - it animates only `transform` and `opacity` (DEC-134: the compositor);
  - it is gated on a `data-motion-*` attribute.
- **Never delays input.** No handler waits for an animation's end before acting, and a pressed
  control acts on press. Motion is decoration on top of a state that has already changed.
- **Today's three rules** move behind their kinds: the button press under `micro`, the toast under
  `entrance`.

**Tests**:
- `tokens/motion.test.ts`: the stored value's defaults, partial and corrupt values, and storage that
  throws (as `storageFailure.test.tsx`).
- `tokens/MotionContext.test.tsx`: switches map to attributes; reduced motion removes every
  attribute and restores them when it clears.
- A new `motionRules.test.ts` reads every `.css` file under `renderer/src` and fails on any
  `transition`, `animation` or `@keyframes` that is not under a `[data-motion-*]` selector, or that
  animates anything but `transform` or `opacity`.
- `e2e/motion.spec.ts`: with `reducedMotion: "reduce"`, a toast's computed `animation-name` is
  `none`; with it off and the switch on, it is `cp-toast-in`; with the switch off, `none`.

**Acceptance criteria / DoD**:
- Every kind has a switch, and every motion in the renderer obeys its switch and the system setting.
- `motionRules.test.ts` passes, and fails on a deliberately ungated rule.
- All suites pass.

**Risks**: Low. The CSS check reads text, so a motion written in TypeScript (an inline style, the Web
Animations API) escapes it; the step forbids both, and PAGES-12 adds a check for them.

**Complexity**: **S**

---

## PAGES-03 — The Shell: Sidebar, Header, Menu Bar, Status Strip and Activity

**Objective**: The parts of the window every page shares say what they are and lead somewhere.

**User-visible result**: depends on the marks. With every proposal accepted: each sidebar entry has
a one-line hint; search results open the track; search and the Help menu close on an outside click;
the menu bar has View and Help, with troubleshooting grouped; the status strip says "Ready" and
names background work in plain words, with a reason on hover; "+N more" opens the running work;
Activity shows events in words, grouped by day.

**Dependencies**: PAGES-01.

**Proposals carried, if accepted**: NAV-1…NAV-6, HDR-1, HDR-2, HDR-3, HDR-5, HDR-6, HDR-7,
STR-1…STR-9.

**Design**:
- **Search results open the track** (HDR-1). The list becomes a `listbox`; ↑ and ↓ move, Enter or a
  click opens the Library on that track, selected, and Shift+Enter plays it. The Library gains a
  "select this track" opening, `libraryTrackState(trackId)`, beside `libraryRulesState` in
  `screens/library/libraryLink.ts`, applied the way `LibraryScreen.tsx:362-370` applies rules.
- **The header becomes `ShellHeader`** (`components/shell/ShellHeader.tsx`), holding `GlobalSearch`
  and an empty slot for PAGES-10's wheel button. The `search` landmark moves from the header row to
  the search field's own container, so the wheel is not inside it.
- **The words "engine" and "jobs"** go (DEC-155). Every spec's `ready()` helper first moves to
  `waitForEngine()` (fact 1), in a commit of its own, before the strip's words change.
- **Job labels and their reasons** (STR-3) live in `useActiveJob.ts`: `JOB_VERBS` reworded, every
  count written "120 of 4,000", and a `JOB_EXPLAINERS` map that `jobTitle()` returns for each job
  type. LIB-1 and CLN-7 reuse it.
- **Collections in the sidebar** is indented under Library (DEC-156).
- **Count badges** (NAV-4) need a cheap engine count: Health's full read costs 313 ms at 50,000
  tracks (`docs/user-guide/performance.md:130`), too slow to poll. If NAV-4 is accepted, the step
  adds `GET /api/v1/clean/counts` returning only the review count, and the six contract files move
  together.

**Tests**:
- `GlobalSearch.test.tsx`: arrows move the active option, Enter navigates with `libraryTrackState`,
  Shift+Enter plays, an outside click closes the panel, one letter shows "Keep typing…".
- `e2e/shell.spec.ts`: search for a track, press Enter, and the Library shows it selected in the
  Inspector.
- `StatusStrip.test.tsx`, `useActiveJob.test.ts`, `activityFormat.test.ts`, `Sidebar.test.tsx`,
  `navRegistry.test.ts`, `AppMenuBar` tests: updated for the accepted words and behaviour.
- Every e2e spec passes after the "engine" change (DEC-155).

**Acceptance criteria / DoD**:
- A track found in search can be opened and played without the mouse.
- No string on the strip, the sidebar or the menu bar is one the user marked for change.
- All suites pass.

**Risks**: Medium. The status strip's "Engine connected" is what every spec waits on (fact 1).

**Complexity**: **M**

---

## PAGES-04 — The Player Bar and the Queue

**Objective**: The bar's controls say what they are, the queue can be managed, and a failed or
silent waveform says why.

**User-visible result**: hovering a control names it with its shortcut; the queue button shows how
many tracks wait; repeat says "All" or "One"; the playing track's title opens it in the Library; the
queue panel has a hint line, **Clear**, a drop marker and a reason on a failed row.

**Dependencies**: PAGES-03 (the Library's `libraryTrackState`, for BAR-4).

**Proposals carried, if accepted**: BAR-1…BAR-4, BAR-6…BAR-10. BAR-5 (the key opens the wheel) is
built in PAGES-10.

**Design**:
- **The waveform words** (BAR-7) are rewritten once in `analysisWords.ts`, and every surface that
  reads them changes with it (fact 2). A failed analysis maps its reason code to a sentence; an
  unknown code reads "This file could not be read." and never shows the code.
- **BAR-6 reverses a WAVE-06 rule:** "never in the region's space" (`PlayerBar.tsx:173-174`). It is
  built only if the user accepts it knowing that; otherwise the reason stays in the hover title.
- **A failed queue row's reason** (BAR-9) travels on the queue item: `QueueItem` gains
  `failure?: string`, set by main from the notice it already raises (`electron/playbackQueue.ts`),
  and the contract files move together.
- **The bar is still absent until the first play** (DEC-053). BAR-10's hint, if accepted, sits in
  the Library, not in the bar's place.

**Tests**:
- `PlayerBar.test.tsx`: every button has a title naming its shortcut; the badge shows the queue
  length and hides at 0; repeat's label follows the state.
- `QueuePanel.test.tsx`: **Clear** asks, then calls `clearQueue` once; a failed row shows its reason.
- `analysisWords.test.ts`: every reason code has a sentence; an unknown code shows none.
- `e2e/playerQueuePanel.spec.ts` and `e2e/playerBar.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- Every control in the bar and the queue panel can be named by hovering it.
- All suites pass.

**Risks**: Low.

**Complexity**: **S** to **M**, with BAR-9

---

## PAGES-05 — The Library

**Objective**: The Library says what it is reading, what is happening to it, and what to do next on
every empty table.

**User-visible result**: depends on the marks. With every proposal accepted: "Collection" means only
CuePoint's own lists; the refresh is **Refresh from Rekordbox…**; after an import a note explains the
work that follows and that the user can keep working; every empty table offers the next step; the
track menu is grouped; the filter's fields are grouped under plain names; one track count; Columns…
sits beside the filter.

**Dependencies**: PAGES-03 (the job explainers LIB-1 reuses).

**Proposals carried, if accepted**: LIB-1…LIB-12.

**Design**:
- **The selected-track store** (fact 4) is added here, `components/shell/selectedTrack.ts`, and the
  Library sets it whenever its Inspector shows a track. It holds `{ id, key } | null`, where `key` is
  the effective key the table shows.
- **The ready note** (LIB-1) reads the same active jobs as the status strip (`useActiveJob`) and
  shows while any of `file_check`, `artwork_scan`, `waveform_analysis`, `marks_backfill` or
  `credit_index` runs after an import. It can be dismissed for the session.
- **Empty states return an action** (LIB-5): `emptyStateFor` (`libraryEmpty.ts`) returns
  `{ title, hint, action? }`, and the table renders the action as a button.
- **Grouped filter fields** (LIB-7): the engine adds a `group` to each field spec it sends
  (`filter_rule.py`), and the renderer renders option groups from it, keeping no copy of the
  grouping. Field ids do not change (fact 3).
- **The menu's submenus** (LIB-6) reuse Rate ▸'s submenu (`trackMenu.ts:105-126`).
- **Rating shown by default** (LIB-10) reaches only a layout that has not been saved
  (`columnLayout.ts` reconcile). A saved layout keeps what the user chose.

**Tests**:
- `emptyStates.test.tsx`: each empty state has the accepted words and, where accepted, its action.
- `filter_rule` tests: every field has a group; the ids are unchanged.
- `trackMenu` tests: the grouping; every entry still reaches its action.
- `selectedTrack.test.ts`: the store follows the Library's selection.
- `e2e/libraryPage.spec.ts`, `libraryBrowse`, `libraryJourney`, `organization` and `cleanLibrary`
  pass with the new names.

**Acceptance criteria / DoD**:
- No empty table in the Library leaves the user without a next step, for the accepted proposals.
- A saved Smart Collection from before the step opens and filters exactly as before.
- All suites pass.

**Risks**: Medium. LIB-3 and LIB-4 rename the most-quoted words in the suite (fact 1).

**Complexity**: **M**

---

## PAGES-06 — The Inspector

**Objective**: The panel beside every page is named for what it shows, can be found when hidden, and
shows the important part of a track first.

**User-visible result**: depends on the marks. With every proposal accepted: the panel is **Track
details**; hidden, it is a labelled tab; its sections collapse, in a calmer order, and remember it;
the five override boxes sit behind **Correct a value…**; an unmatched track's Beatport section is one
sentence and **Match on Beatport**; ratings, file metadata, waveforms and cues are in plain words; a
multi-selection offers **Change all 4…**.

**Dependencies**: PAGES-05 (the selected-track store). PAGES-07 if it runs first (`cleanFormat.ts`).

**Proposals carried, if accepted**: INS-1…INS-11.

**Design**:
- **The panel's name** (INS-1) changes in its heading, its show and hide labels, the shortcuts list
  and the specs that find it by "Track inspector" (fact 1). The component and storage key keep their
  names (`TrackInspector`, `cuepoint-ui-shell-inspector`), so the stored width survives.
- **Collapsed sections persist** in one key, `cuepoint-ui-track-details-sections`.
- **History's file entries** (INS-7) are reworded in `activityActions.ts`, which Activity shares
  (fact 2).

**Tests**:
- `TrackInspector.test.tsx`: the hidden tab is labelled and shows the selected title.
- `TrackDetailPanel` tests: the order, collapse and restore; the override disclosure opens on its own
  when an override exists; an unmatched track shows one action, which starts a match.
- `e2e/shell.spec.ts`, `prepareJourney`, `prepareSource` and `trackMarks` pass with the new name.

**Acceptance criteria / DoD**:
- With the panel hidden, a user can see where it went and bring it back with one click.
- All suites pass.

**Risks**: Low.

**Complexity**: **M**

---

## PAGES-07 — Clean

**Objective**: Clean says what matching is before asking the user to do it, explains each state in
plain words, and keeps the matcher's internals out of the way.

**User-visible result**: depends on the marks. With every proposal accepted: an intro line on every
tab; a first visit offers **Match all N tracks** with what it will do; the tabs show where work
waits; the states are "Waiting for you", "Changed since you decided", "Not found on Beatport", "Not
looked up yet"; the scoring folds under "Why this score?"; Accept and Apply each say what they do;
a running match is explained on the page; Missing files gives the fix in steps.

**Dependencies**: PAGES-03.

**Proposals carried, if accepted**: CLN-1…CLN-12.

**Design**:
- **The match-state words** (CLN-4) change in `cleanRules.ts`, `cleanFormat.ts` and
  `cleanColumns.tsx`, and in the engine's Health labels (`health_service.py:99-111`), which also feed
  the Library's Health links. The stored states do not change (fact 3).
- **Tab counts** (CLN-3) come from the Health counts the page already loads, and show nothing for a
  check that has never run.
- **The first-visit offer** (CLN-2) starts the same match **Match all N** starts
  (`ReviewView.tsx:586`).
- **Library health and Statistics.** DEC-136 puts library health in Statistics. This phase keeps
  Clean's Health tab; Phase 15 decides whether it stays or links there.

**Tests**:
- `cleanEmpty.test.ts`, `CleanScreen.test.tsx`, `comparison.test.ts`, `HealthView.test.tsx`: the
  accepted words, the first-visit action, the folded scoring and its remembered state.
- Engine: `health_service` tests for the new labels, with the check names unchanged.
- `e2e/clean.spec.ts`, `cleanPage.spec.ts` and `cleanLibrary.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- A user who has never matched can start matching from the first thing Clean shows them.
- All suites pass.

**Risks**: Medium. Clean's specs quote its states and its candidate headings.

**Complexity**: **M**

---

## PAGES-08 — Discover

**Objective**: Discover says what it is for, in words a DJ uses, and leads to the pages it holds.
This is DEC-130's review, applied: each of the page's 21 parts kept, changed or removed as the user
marked it.

**User-visible result**: depends on the marks. With every proposal accepted: an intro line; "Run"
becomes "New music" and "Look for new music"; the token banner explains the token and how to get
one; resolving is plain and automatic after a match; charts are explained and their dates folded
away; "owned" is explained once, with one count line and one default; "Push" becomes **Make a
Beatport playlist…**; "Found in" becomes "Why it's here"; artist pages never show a bare id; Similar
tracks reads as "Mixes well"; a card points to the artist, label and similar pages; a running search
is explained on the page.

**Dependencies**: PAGES-03.

**Proposals carried, if accepted**: DSC-1…DSC-12, and the inventory's keep, change or remove for each
part (`PHASE14_REVIEWS.md`, Discover).

**Design**:
- **"Run" stays the engine's word.** Only what the user reads changes; routes, job types and stored
  rows keep "run" (fact 3).
- **Resolving on its own** (DSC-4) starts the existing resolve job when a Clean match finishes and a
  token is set, through the job store's end listener (`JobStore.add_listeners`,
  `src/cuepoint/engine/jobs.py`). Without a token it does nothing.
- **An artist page's title** (DSC-9) falls back to the library's most common spelling of the
  artist, then "Unknown artist", never "Beatport artist 12345". The engine's entity response gains
  `display_name`.
- **One "owned" default** (DSC-6): run results and artist pages both hide tracks already in the
  library, with the same checkbox words.

**Tests**:
- `DiscoverScreen.test.tsx`, `discoverPure.test.ts`, `EntityScreen.test.tsx`, `similarReasons.test.ts`:
  the accepted words, the fallback title, the shared default.
- Engine: a finished Clean match with a token starts one resolve; without one, none.
- `e2e/discover.spec.ts` and `e2e/discoverPages.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- Every part in the inventory is as the user marked it.
- Artist pages, label pages and Similar tracks can be reached from Discover itself.
- All suites pass.

**Risks**: Medium. Discover's specs quote "Run" throughout.

**Complexity**: **M**

---

## PAGES-09 — Prepare

**Objective**: Prepare can start a second Set, says what its times and checks mean, and points at the
panel beside it rather than away from the page.

**User-visible result**: depends on the marks. With every proposal accepted: **New Set ▾** in the
header; one empty-Set message pointing at the Library tab beside it; "No times planned yet" until a
time is typed; "Mix in", "Mix out", "Starts at", "Plays for"; one word, "Accept", for a warning;
"Files not checked — check now"; Suggestions' "Fit" out of 100; plain key and loudness words; the
insertion line above the tabs; Notes and View as buttons; chapters explained; waiting waveforms
explained in place.

**Dependencies**: PAGES-03, PAGES-04 (the waveform words).

**Proposals carried, if accepted**: PRP-1…PRP-12. PRP-13 (Prepare in Getting started) is built in
PAGES-11.

**Design**:
- **New Set from the header** (PRP-1) opens the dialogs already mounted at
  `PrepareScreen.tsx:1037`.
- **"Check now"** (PRP-6) starts Clean's file check, the same job **Check every file** starts.
- **The table's height** stays DEC-112's: everything new sits on the existing facts line or in the
  source panel.

**Tests**:
- `PrepareScreen.test.tsx`, `prepare.test.ts`, `SourcePanel` tests: the accepted words, New Set from
  the header with a Set open, the check started from the facts line.
- `e2e/prepare.spec.ts`, `prepareJourney.spec.ts` and `prepareSource.spec.ts` pass with the new
  names.

**Acceptance criteria / DoD**:
- A second Set can be made without leaving Prepare.
- All suites pass.

**Risks**: Low.

**Complexity**: **M**

---

## PAGES-10 — The Camelot Wheel

**Objective**: DEC-133's wheel: a pixel-art Camelot wheel behind a header button, lit for the track,
filtering the Library on a click.

**User-visible result**: A wheel button sits beside search on every page. It opens a pixel-art
wheel of the 24 keys. The selected track's key (or, with nothing selected, the playing track's) is
lit, and so are the keys that mix with it by DEC-096's rule: the same number one step either way,
and the relative key. A caption names the track and its key. Clicking a key opens the Library
on all tracks in that key, clearing its search and rules (DEC-160). With no track, the wheel shows no lit key and says "Select or play a track to light
its key."

**Dependencies**: PAGES-03 (`ShellHeader`), PAGES-05 to PAGES-09 (the selected-track store, fed by
each page).

**Proposals carried, if accepted**: BAR-5 (the player bar's key opens the wheel).

**Design**:
- **The engine answers what mixes,** so the renderer keeps no copy of the rule (DEC-133). A new
  read route, `GET /api/v1/library/keys/compatible?key=<any notation>`, parses the key
  (`override_values.parse_key`), applies `compatible_keys` and `key_relation`, and answers:

  ```json
  { "key": "8A",
    "wheel": [ { "code": "8A", "relation": "same" }, { "code": "9A", "relation": "adjacent" },
               { "code": "7A", "relation": "adjacent" }, { "code": "8B", "relation": "relative" } ],
    "spellings": { "8A": ["8A", "Am"], "9A": ["9A", "Em"], "7A": ["7A"], "8B": ["8B", "C"] } }
  ```

  An unparseable key answers 400 with the envelope. `spellings` lists the library's own spellings of
  each lit key (`similarity_repository.spellings("key")`), so the filter matches a library that mixes
  notations (fact 5). The six contract files move together.
- **The filter is the Library's own** (DEC-133): a click navigates to `/library` with
  `libraryRulesState` holding one `key any_of <spellings>` rule, as Health's links do
  (`HealthView.tsx:144`). The click replaces the Library's search and rules (DEC-160); there is no
  "All lit keys" button, and the Library's own filter can add the other lit keys by hand.
- **Which track:** the selected one, else the playing one (DEC-157). The wheel reads `useSelectedTrack()` (fact 4) and
  `selectCurrentItem`.
- **The picture** is drawn in the pixel style: 24 segments in two rings (A inside, B outside) on the
  integer scale, using theme tokens for lit, compatible and unlit, so every theme and custom theme
  colours it. It is a `role="dialog"` popover anchored to the button, positioned like search's panel
  so the page does not reflow, closed by Escape, an outside click or the button.
- **Keyboard**: the button is reachable by Tab; inside, the arrow keys move round the ring, ↑ and ↓
  switch rings, and Enter filters. Each segment is a button named "8A, A minor, compatible".
- **Motion** opens it under `entrance`, and lights segments under `state` (PAGES-12).

**Tests**:
- Engine: the route for each relation, for each notation the library supports, for a key with no
  spellings in the library, and for an unparseable key.
- `CamelotWheel.test.tsx`: the lit set for a track, the caption, the empty state, keyboard movement,
  and the navigation a click makes.
- `selectedTrack` integration: selecting a track on each page lights its key.
- `e2e/camelotWheel.spec.ts`: import a library spelling keys two ways, select a track in 8A, open the
  wheel, click 9A, and the Library shows exactly the 9A tracks in both spellings.
- The desktop contract test covers the route and the bridge method.

**Acceptance criteria / DoD**:
- From any page, the wheel lights the right keys for the selected or playing track, and a click
  filters the Library to every track in that key, whatever its spelling.
- The renderer contains no copy of DEC-096's rule.
- All suites pass.

**Risks**: Low. The rule and the filter already exist; this joins them.

**Complexity**: **M**

---

## PAGES-11 — The First-Run Guide

**Objective**: DEC-132's short first-run guide: a few screens that get a new user from nothing to an
imported library, and say where everything is.

**User-visible result**: depends on the marks. With every proposal accepted: on first launch, a
five-screen guide (Welcome; getting the collection out of Rekordbox, with **Show me how**; importing
it, with **Import a collection…**; finding your way around, including Prepare and how to play;
background work) that a stray click cannot end; Help → Getting started always opens it at the start;
the empty Library shows a first-steps checklist that ticks itself.

**Dependencies**: PAGES-03 to PAGES-10, whose words it quotes.

**Proposals carried, if accepted**: RUN-1 (the guide, with PRP-13's Prepare screen), RUN-2 (the three
defects), RUN-3 (the checklist), RUN-4 (the user guide's onboarding facts).

**Design**:
- **Built on `OnboardingDialog`,** its storage key (`cuepoint-onboarding-complete`) and its Help
  entry, so a user who finished the old tour does not see the new one.
- **The defects** (fact 9) are fixed whether or not RUN-1 is accepted, if RUN-2 is.
- **Import from the guide** closes it and opens the Library's import through a location-state
  opener, `libraryImportState()`, beside `libraryRefreshState` (`libraryLink.ts`).
- **The guide's pictures** are pixel icons and crops drawn with `PixelIcon`, not screenshots, so a
  theme change does not leave them stale.

**Tests**:
- A new `OnboardingDialog.test.tsx`: reopening starts at step 1; Escape and the backdrop do not mark
  it done; storage that throws does not break it; **Import a collection…** navigates with the opener.
- `FirstSteps.test.tsx`: each item ticks from real state, and the list hides once all are done.
- `e2e/firstRun.spec.ts`: a fresh install shows the guide, its import action reaches the Library's
  import, and a second launch does not show it.

**Acceptance criteria / DoD**:
- A new user can go from first launch to an imported library from the guide alone.
- All suites pass.

**Risks**: Low.

**Complexity**: **S** to **M**

---

## PAGES-12 — Motion: Every Kind, Built

**Objective**: All ten kinds of motion (DEC-134), across the finished pages, in pixel steps with
smooth fades (DEC-135), each behind its switch, none delaying input, and the scroll checks re-run
with every kind on.

**User-visible result**: With every switch on, the app moves: buttons press; hovered and focused
controls step; dropped rows settle; states change with a short step; menus, dialogs, the wheel,
toasts and the Inspector enter and leave; pages change with a short step; loading shows pixel
spinners and skeleton rows; and the kinds DEC-134 recommended against (scroll animations,
shared-element transitions) are built too, for the user to judge. Each switch turns its kind off at
once.

**Dependencies**: PAGES-02 to PAGES-11.

**Design**:
- **Where each kind is used** (the minimum; the step may add more where the same rule applies):

  | Kind | Built on |
  | --- | --- |
  | Microinteractions | button press, switch and checkbox toggle, star rating, the "Saved" tick (SET-10) |
  | Interaction animations | a dragged row's lift and settle, the drop marker (BAR-8), resize handles |
  | State transitions | a badge or state changing, a collapsible section (INS-3), the wheel's lit keys |
  | Page transitions | a destination changing: the content steps in, the shell stays still |
  | Entrance and exit | menus, dialogs, toasts, popovers (search, the wheel, "+N more"), the Inspector showing and hiding |
  | Hover and focus | rows, buttons and links stepping on hover; the focus ring stepping in |
  | Scroll animations | the Settings section links following the scroll; a section heading settling as it reaches the top. Never on the track tables |
  | Loading | pixel spinner, skeleton rows in the track tables, the status strip's progress stepping |
  | Shared-element transitions | a search result moving into its Library row; a Set's entry into the Inspector (the View Transitions API, gated like the rest) |
  | Feedback (DEC-154) | the "Saved" tick (SET-10), a shake on a refused time, BPM or chapter length in Prepare, a pulse on a job that finishes and on new search results |

- **Exit never holds a control.** A closing dialog's buttons stop taking clicks at once, and what
  was behind it takes them; the fade plays on top.
- **Page transitions do not wait** for the next page's data: the page steps in with whatever state
  it renders first.
- **The tables never animate per row while scrolling.** Skeleton rows appear only for rows not yet
  fetched.
- **A check for motion outside CSS:** `motionRules.test.ts` (PAGES-02) gains a scan of
  `renderer/src/**/*.tsx` for inline `transition`/`animation` styles and `element.animate(`, each
  of which must sit behind `useMotion(kind)`.

**Tests**:
- `motionRules.test.ts` passes over every new rule.
- A component test per kind: with the kind off, the element has no animation; on, it has the
  stepped one; under reduced motion, none.
- `e2e/motion.spec.ts` grows: with every kind on, a click on a closing dialog's backdrop lands on
  what is behind it at once; a page change shows the new heading within one frame of the route
  changing.
- **The scroll checks, every kind on:** `e2e/waveformPlaces.spec.ts:357` (no long task over 50 ms,
  5,000 rows); `e2e/libraryBrowse.spec.ts:270` with `CUEPOINT_E2E_MEMORY=1` (50,000 rows), which
  gains the same long-task probe; and `scripts/bench_library.py`, unchanged from Phase 13's
  numbers. Results recorded in `docs/user-guide/performance.md`.

**Acceptance criteria / DoD**:
- Every kind exists, obeys its switch and the system setting, and moves in whole pixels at 1×, 2×
  and 3×; every fade is smooth.
- No motion delays a click or a keypress.
- The scroll checks pass with every kind on.
- All suites pass.

**Risks**: Medium. Shared-element transitions are the costliest kind and have few honest uses here;
the step builds the two above and stops.

**Complexity**: **L**

---

## PAGES-13 — The Defaults Picked, and the Phase Comes Together

**Objective**: The user tries every kind of motion and picks the defaults (DEC-134); the user guide
matches the app; the phase is accepted.

**User-visible result**: A new install starts with the motion the user chose. The user guide describes
the pages as they now are.

**Dependencies**: PAGES-12.

**Design**:
- **The user's test.** A build with every kind on, and a one-page checklist of where each kind shows
  (PAGES-12's table). The user switches each off and on and picks what stays on by default.
- **Recorded** as an amendment to DEC-134, and applied as the defaults in `tokens/motion.ts`. A user
  who changed a switch keeps their choice; only unset kinds take the new defaults.
- **The user guide** is read against the app, page by page, and every quoted string checked
  (fact 10). `glossary.md` gains the Camelot wheel and compatible keys, and loses any word this
  phase retired.

**Tests**:
- `motion.test.ts`: the recorded defaults; a stored choice survives them.

**Acceptance criteria / DoD**: the phase-level acceptance below.

**Risks**: Low.

**Complexity**: **S**

---

## Phase-level acceptance

Phase 14 is complete when, in a **packaged build** on Windows and macOS:

1. Every accepted proposal is built, and no rejected one. Each review's marks are recorded in
   `PHASE14_REVIEWS.md`. *PAGES-01 to PAGES-11.*
2. Discover's 21 parts are each as the user marked them (DEC-130). *PAGES-08.*
3. No user-visible string the reviews quoted for change is left unchanged where its proposal was
   accepted, and the user guide quotes the app as it is. *PAGES-01 to PAGES-11, PAGES-13.*
4. From a fresh install, the first-run guide leads to an imported library. *PAGES-11.*
5. From any page, the wheel lights the selected or playing track's key and its compatible keys by the
   engine's rule, and a click filters the Library to that key in every spelling. *PAGES-10.*
6. All ten kinds of motion exist, each behind its switch, in whole-pixel steps with smooth fades;
   reduced motion stops them all; no motion delays input. *PAGES-02, PAGES-12.*
7. The scroll checks pass with every kind on. *PAGES-12.*
8. The defaults are the user's, recorded as an amendment to DEC-134. *PAGES-13.*
9. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check, the
   end-to-end suite and `npm run dist`.
10. No decision in DEC-001…DEC-153 is contradicted, except where an accepted proposal says so and the
    user accepted it knowing (BAR-6 and WAVE-06). A contradiction stops the work and is raised rather
    than worked around.

## Decision Round 17 — what the reviews raised

Asked in `OPEN_QUESTIONS.md` as Q-157…Q-162 and answered 2026-10-07.

| Question | Outcome | Needed by |
| --- | --- | --- |
| Q-157 — The tenth kind of motion. DEC-134 says ten and lists nine. | DEC-154: feedback | PAGES-02 |
| Q-158 — "Engine" and "jobs" in the app's words. | DEC-155: neither word is shown | PAGES-03 |
| Q-159 — Collections in the sidebar. | DEC-156: nested under Library | PAGES-03 |
| Q-160 — What a click on the wheel does to the Library's filter. | DEC-160: replace the filter, no "All lit keys" button | PAGES-10 |
| Q-161 — Which track the wheel lights when one is selected and another is playing. | DEC-157: the selected track, else the playing one | PAGES-10 |
| Q-162 — British or American English. | DEC-158: American | PAGES-01 |

## Deferred, with reasons

- **Library health in Statistics.** DEC-136's; Phase 15 decides whether Clean's Health tab stays.
- **Like and dislike on Discover.** Declined by DEC-130.
- **A sidebar count badge without a cheap engine count.** NAV-4 adds one only if accepted; Health's
  full read is too slow to poll (PAGES-03).
- **Screenshots in the first-run guide.** Pixel drawings instead, so themes do not stale them
  (PAGES-11).
- **"What's new" after an update.** Phase 16's proposal.
