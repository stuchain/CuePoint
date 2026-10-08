# CuePoint v1.0.0 — Phase 14: The Pages Revisited, Detailed Step Specifications

Status: **Specified 2026-10-07. No step is implemented yet.** Sixteen steps, PAGES-01…PAGES-16.
The page reviews DEC-131 asks for are written in `PHASE14_REVIEWS.md`, 107 proposals across eleven
surfaces, each with a screenshot of the app as it is today (`phase14/`). The user marked them on
2026-10-07, taking the recommendation on every one (DEC-159): 100 accepted, and NAV-4, STR-4, BAR-6
and BAR-10 declined. Writing the reviews raised six questions that Decision Round 14 did not answer,
asked as Decision Round 17 (Q-157…Q-162). All six are settled (DEC-154…DEC-158, DEC-160). DEC-161 later added a 1.5× size as the default. The task walkthrough (`PHASE14_FLOWS.md`) then added FLW-1…FLW-22,
all accepted (DEC-199…DEC-201), and with them PAGES-15 and PAGES-16. The steps below name every
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
| Settings | SET-1…SET-11 | PAGES-01 (SET-2 also in PAGES-02; SET-4's 1.5× size in PAGES-14) |
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
| The task walkthrough (`PHASE14_FLOWS.md`) | FLW-1…FLW-22 | PAGES-03, 05–09, 13, 15, 16 |

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
| DEC-135 | Movement and scaling in whole pixels and stepped frames; fades smooth. Duration and step tokens in `tokens.css`, stepping the same at 1×, 1.5×, 2× and 3× (DEC-161). |
| DEC-096 | The wheel lights the same key, one step either way, and the relative key. |
| DEC-140 | This phase runs alone, after Phase 13. |
| DEC-199 | The walkthrough's twenty proposals built on their pages; FLW-1 only for the actions listed in `PHASE14_FLOWS.md`. |
| DEC-200 | A Keys page in the sidebar for the keys of one or several playlists, Collections or Sets. |
| DEC-201 | The key is the user's correction, else the accepted Beatport match's; never Rekordbox's. |

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

**Beatport's key early, the Keys page after the wheel.** PAGES-15 changes the key every page reads,
so it runs before PAGES-05, PAGES-09 and PAGES-10. PAGES-16 needs the wheel's drawing (PAGES-10) and
the Library's playlist rule and selection bar (PAGES-05).

**The walkthrough's proposals ride their page's step** (`PHASE14_FLOWS.md`, DEC-199): FLW-20 in
PAGES-03, FLW-4…8, 10, 11 in PAGES-05, FLW-9 in PAGES-06, FLW-12…14 in PAGES-07, FLW-15 and 16 in
PAGES-08, FLW-17…19 in PAGES-09, and the FLW-1 and FLW-2 checks in PAGES-13.

**The 1.5× size any time after PAGES-01.** PAGES-14 (DEC-161) needs only PAGES-01's Size control.
It touches every stylesheet's hairlines, so it runs alone, not beside a page step; running it before
PAGES-12 means motion's steps are built and checked at 1.5× from the start.

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
delete), SET-4 (size; its 1.5× option is PAGES-14's), SET-5 (the Beatport section), SET-6 (waveform data behind a disclosure, the
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
- **The 1.5× size is PAGES-14's** (DEC-161). This step writes SET-4's label and hint, and lists the
  options `tokens/scale.ts` offers, so the select gains Medium (1.5×) when PAGES-14 adds it.

**Tests**:
- A new `SettingsScreen.test.tsx`: the heading, the eight sections in order, each link scrolls to its
  section, and Discover's deep link focuses the token field.
- `ThemeSettingsPanel` tests: a stored theme id from before the rename still applies; a custom theme
  is deleted only after the confirm (SET-3).
- `PrivacyDialog` and the Privacy section show the same state after either changes it (SET-7).
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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-20. CuePoint gets its own app menu in place of
Electron's default: File (Import another file…, Check Rekordbox for changes, Export to Rekordbox…),
View (Size, Track details, the sidebar) and Help. Reload, Developer Tools and Zoom leave packaged
builds (Zoom fought the Size setting). The Shortcuts list shows only shortcuts that work, and gains
Prepare's. The sidebar gains **Keys** in PAGES-16.

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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-4 to FLW-8, FLW-10 and FLW-11.
- **Quick filters** (FLW-4): Key, BPM and Genre buttons above every track table. Key lists the
  view's keys in Camelot order with counts (PAGES-15's key, so "No Beatport key: N" is its own
  line), BPM offers the view's range, Genre its genres with counts. Each choice becomes an ordinary
  chip. The engine answers the facets for the current view; the key facet normalizes notation. The
  Key list ends with "See these on the Keys page" (PAGES-16 owns key analysis, FLW-2).
- **Search matches key and BPM** (FLW-5): "8A", "Am" or "124" also match the key or BPM, and a row
  says what it matched on. Engine search, `track_query.py`'s `_SEARCH_COLUMNS` plus a key and BPM
  clause.
- **One Key field** (FLW-6): `filter_rule.py` keeps one "Key" field, compared on the normalized key
  (`override_values.parse_key`), so 8A and Am are one key. "Rekordbox key" moves into the
  Rekordbox-only group; "CuePoint key" becomes "Your key".
- **"In playlist"** (FLW-7): a new rule field, and saving a Smart Collection while a playlist is
  open adds it, so the playlist is no longer dropped (`LibraryScreen.tsx` `saveSmart`).
- **The selection bar** (FLW-8, amending LIB-6): Play ▸, Organize ▸, Explore ▸ and Fix ▸ as visible
  buttons when tracks are selected; Fix ▸ opens Clean's Fix values with the selection (FLW-12). The
  right-click menu shows the same groups; "Actions…" goes.
- **The tree** (FLW-10): "New Collection", "New Set" and "New folder" as labelled buttons, and a bar
  under the tree for the selected node: Rename, Duplicate, Delete, and for a Set, Open in Prepare,
  Save set list… and Export to Rekordbox…. Hover icons and right-click keep working.
- **The header** (FLW-11): "Check Rekordbox for changes", "Import another file…" and "Export to
  Rekordbox…" as three buttons; "Collection file ▾" goes.

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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-9: Play, Play next, Similar tracks and Show
in folder as buttons under the track's title. The key reads with its source (PAGES-15): "8A ·
Beatport", "8A · yours", or "No Beatport key" with a link to match it in Clean; Rekordbox's key
shows in the Rekordbox section, marked "not used".

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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-3, FLW-12, FLW-13 and FLW-14.
- **Fix values** (FLW-12): a new tab holding Edit values, Use Beatport's values and Save changes
  into the files, for a selection or a scope (the library, a playlist, a Collection). The Library's
  Fix ▸ and Beatport ▸ open it with the selected tracks. The tabs read: Review matches, Fix values,
  Missing files, Duplicates, Health. Key leaves Edit values' Beatport choices, since an accepted
  match already gives the key (PAGES-15).
- **Matching from the header** (FLW-13): "Match tracks…" opens a small window (what to match,
  whether to match again), and "Export review list…" moves beside it. Review keeps the queue, the
  comparison and the decision buttons only.
- **Health opens Clean's own tabs** (FLW-14): missing files, duplicates and needs-review counts open
  their tab; the rest still open the Library filtered. "No key" reads "No Beatport key" and opens
  Review on the unmatched tracks, since matching is how a track gets its key.

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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-15 and FLW-16. The tabs become "New search",
"Results" (past searches on the left, the chosen one's tracks on the right) and "Wantlist". Owned
tracks are hidden by default everywhere, behind one switch with one label. Result actions are
always visible, disabled with their reason until rows are selected. Artist and label names in the
result and wantlist tables link to their pages.

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

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-17 to FLW-19.
- **The entry toolbar** (FLW-17): with an entry selected, Move up, Move down (also Alt+↑ and Alt+↓,
  as in the queue), Start a chapter here, Repeat after and Remove. A chapter heading has an Edit
  button. Drag, double-click and right-click keep working.
- **In and Out in the table** (FLW-18): two columns typed into in place, saved on Enter or blur with
  the same rules and messages as the Inspector's "In this Set", which keeps its fields.
- **The strip's caption** (FLW-19): "8A → 9A · one step up · 124 → 126 BPM (+1.6%) · Out 5:30 → In
  0:45", and a warning as a sentence under it with Accept beside it.
- **Keys** come from PAGES-15. An entry with no Beatport key gets "No Beatport key: key check
  skipped", never a clash.

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

The wheel reads PAGES-15's key. A selected track with no Beatport key lights nothing and says "This
track has no Beatport key yet", with a link to match it in Clean. PAGES-16 reuses the drawing.

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

**Dependencies**: PAGES-12, PAGES-14 to PAGES-16.

**Design**:
- **The user's test.** A build with every kind on, and a one-page checklist of where each kind shows
  (PAGES-12's table). The user switches each off and on and picks what stays on by default.
- **Recorded** as an amendment to DEC-134, and applied as the defaults in `tokens/motion.ts`. A user
  who changed a switch keeps their choice; only unset kinds take the new defaults.
- **The user guide** is read against the app, page by page, and every quoted string checked
  (fact 10). `glossary.md` gains the Camelot wheel and compatible keys, and loses any word this
  phase retired.
- **The walkthrough's rules** (DEC-199). Every action in `PHASE14_FLOWS.md`'s "gets a visible
  place" table is checked on its page (FLW-1 as narrowed), and every function listed in more than
  one place has one home with links to it (FLW-2). An e2e check per row clicks the visible control,
  not the menu.

**Tests**:
- `motion.test.ts`: the recorded defaults; a stored choice survives them.

**Acceptance criteria / DoD**: the phase-level acceptance below.

**Risks**: Low.

**Complexity**: **S**

---

## PAGES-14 — A 1.5× Size, and It Is the Default; Table Rows That Follow the Size

**Objective**: The size setting offers 1×, 1.5×, 2× and 3×, a fresh install opens at 1.5×, and the
pixel style stays as sharp at 1.5× as at the whole sizes (DEC-161). Table rows grow with the size,
as `--row-height` always meant them to; today they are 36px at every size (finding 9).

**User-visible result**: Settings → Appearance → **Size of text and controls** lists "Small (1×)",
"Medium (1.5×) — default", "Large (2×)" and "Extra large (3×)". Someone who never chose a size opens
the app at 1.5×. In the default 1,280 × 800 window the Library shows four whole rows where it shows
none without scrolling at 2× today. Someone who chose 1×, 2× or 3× keeps it. Every table's rows are as
tall as the size says (50px at 1.5×), so the text in them is never cut at 3×.

**Dependencies**: PAGES-01 (the Size control and SET-4's words). Nothing else.

**Proposals carried, if accepted**: SET-4's options (amended by DEC-161).

**What the investigation found** (2026-10-07). Read from the code, then measured in the running app
at 1,280 × 800 with a 1,000-track library (`benchmark_1k.xml`), each size applied through the app's
own storage key and a reload, on a local build that accepted 1.5. That build was not committed.

1. **Storage reads "1.5" as 1.** `getStoredScale` uses `Number.parseInt` (`tokens/scale.ts:25`),
   and `SCALE_OPTIONS` is `[1, 2, 3] as const`, so 1.5 is neither stored nor offered.
   `ThemeSettingsPanel.tsx:135` already reads the select with `Number`.
2. **Hairlines are the only CSS sizes that go fractional.** Every size is `calc(<base>px *
   var(--scale))`. At 1.5× an even base is whole, and the odd ones are:
   - `calc(1px * var(--scale))`, written 47 times across 18 stylesheets (16 in
     `TrackDetailPanel.css`), plus one negative in `prepare.css`;
   - `--bevel-size-sm` (1px) and `--border-width-heavy` (3px) in `tokens.css`;
   - two derived sizes, `--row-height` (`--hit-min × 0.75`, 49.5px) and
     `calc(var(--space-xs) * 0.75)` (4.5px). `calc(var(--hit-min) * 0.7)` is fractional at every
     size already.
3. **Chromium floors borders; it leaves shadows alone.** At 1.5× the computed border widths were only
   1px and 3px. A 1.5px border is drawn 1px, so it stays sharp but is thinner than its share. Two
   elements carried fractional inset shadows: the small bevel (`--shadow-bevel-sm`,
   `--shadow-bevel-pressed`), whose edge then blurs across two device pixels.
4. **Half-pixel positions are not new.** 358 of 490 laid-out elements on the Library had a
   fractional edge at 1.5×, against 374 of 508 at 2×, from flex and percentage layout. The table's
   rows sat at x.5 offsets at 1.5×.
5. **It looks as sharp.** Crops enlarged four times showed the sidebar icons, the pixel font and the
   bevels as crisp at 1.5× as at 2×. The icons are 12×12 grids at `--icon-size` (24px × scale), so a
   cell is 3px at 1.5×.
6. **Density** in the default window, Library, whole table rows on screen without scrolling the page:
   9 at 1×, 4 at 1.5×, none at 2× (the table starts below the window's edge) and none at 3×.
7. **Canvases already round the scale.** `waveformUnit` is `round(scale × devicePixelRatio)`
   (`waveformLayout.ts:157`): 2 device pixels per unit at 1.5× on a 1× display (as at 2×), 3 on a 2×
   display. `prepareLanes.ts:101,164` uses `round(scale)`, so the tempo and key lanes draw as at 2×.
   Both stay on whole device pixels.
8. **The rest takes a fraction as it is.** Column widths (`trackTableLayout.ts:87,94`) round
   `px × scale`; `useNarrow` compares `width < below × scale`; `SetLanes`' gutter is a `calc`.
   Thumbnails are cut for 3× (DEC-076), so 1.5× only scales them down.
9. **A defect found on the way, fixed here** (the user's call, 2026-10-07). `readRowHeight` (`trackTableLayout.ts:178`)
   parses `--row-height` from `getPropertyValue`, which answers the unresolved `calc(…)` text.
   `parseFloat` gives NaN, and the fallback of 36px is used. So table rows are 36px at every size
   (measured at 1×, 1.5×, 2× and 3×), while the header row follows `--row-height`. The cell text is
   `--font-size-xs` (10px × size) at a line height of 1.2, so at 3× a 36px line sits in a 36px row
   with no room left. Every table uses it: the Library, Collections, Clean, Discover, Prepare's Set
   and its source panel, and `SetTransition`'s strip.
10. **What assumes 2 is the default:**
    - tests: `storageFailure.test.tsx:33` expects 2; `useNarrow.test.tsx:60` reasons from 2;
      `e2e/prepare.spec.ts` asserts `--scale` is "2" and holds `WHOLE_ROWS` and the player-bar rows
      measured at 2 (DEC-112's floor is five); `e2e/playerBar.spec.ts:61` loops over 1, 2 and 3;
    - code comments: `PrepareLayout.tsx:6`, `waveformLayout.ts:80` ("integer scale");
    - docs: `PIXEL_DESIGN_SYSTEM.md` §Scale mechanism ("integer-only by design"), and
      `docs/user-guide/the-window.md` §Interface scale and theme ("scales in whole steps").

**Design**:
- **Storage** (`tokens/scale.ts`). `SCALE_OPTIONS = [1, 1.5, 2, 3]`, `DEFAULT_SCALE = 1.5`. The
  stored value is read with `Number` and checked against the options; anything else reads as the
  default. Same key, `cuepoint-ui-lab-scale`, so a stored 1, 2 or 3 is kept and nothing migrates.
- **One hairline token.** `tokens.css` gains `--hairline: max(1px, round(down, calc(1px *
  var(--scale)), 1px))`: 1, 1, 2 and 3 pixels at the four sizes. Rounding down matches what
  Chromium already does to borders, so a border and a shadow of the same token agree. All 48
  `calc(±1px * var(--scale))` become `var(--hairline)` (negated where needed), and `--bevel-size-sm`
  is `var(--hairline)`. Electron 34's Chromium (132) supports `round()`.
- **The other odd sizes round to a whole pixel**: `--border-width-heavy` as `round(down, calc(3px *
  var(--scale)), 1px)` (4px at 1.5×), `--row-height` and the `--space-xs × 0.75` gap with
  `round(nearest, …, 1px)`. At 1×, 2× and 3× every value is unchanged.
- **A guard so it stays true.** A renderer unit test reads every stylesheet and fails on a
  `calc(<n>px * var(--scale))` whose base times 1.5 is not whole, unless it sits inside `round(`. It
  names the file and line.
- **Rows that follow the size.** `layout.css` registers `--row-height` with `@property` (syntax
  `<length>`, inherited, initial 36px), so `getComputedStyle` answers a resolved length such as
  "50px" and `readRowHeight` reads it as it always meant to. The value is `round(nearest,
  calc(var(--hit-min) * 0.75), 1px)`: 33, 50, 66 and 99 pixels at the four sizes. The table's
  virtualizer, Prepare's and `SetTransition` already re-read it when the size changes, so nothing
  else in the code changes. The header row and the body rows are then the same height.
- **What the fix costs at 2×.** Measured on Linux in `e2e/prepare.spec.ts`, Prepare's Set table, whole
  rows on screen as the page opens:

  | | Today (2×, rows stuck at 36px) | Fixed, at 1.5× (the new default) | Fixed, at 2× |
  | --- | --- | --- | --- |
  | The Set | 8 measured, 7 held | 8 | 4 |
  | The source panel | 3 held | 6 | 2 |
  | With the tempo and key lanes | 4 held | 6 | 2 |
  | With the transition strip | 3 held | 5 | 1 |

  At the new default every count is at or above what the tests hold today, and DEC-112's floor of five
  holds. At 2× the Set falls to four, below that floor. DEC-112's floor is for the default size,
  which is now 1.5×; someone who picks 2× chooses bigger rows over more of them. The spec's held
  counts are re-measured at 1.5× and the 2× numbers recorded in the step's outcome.
- **Canvases keep their rounding.** The waveform's unit and the lanes' unit stay
  `round(scale × ratio)` and `round(scale)`; only their doc comments change ("the app's scale", not
  "integer scale").
- **Motion at 1.5×.** DEC-135's step tokens are in units; `--unit` is 6px at 1.5×, a whole pixel, so
  PAGES-02's steps hold. PAGES-02's and PAGES-12's checks add 1.5× to the sizes they step at.
- **The re-measured defaults.** `e2e/prepare.spec.ts` asserts the new default and re-measures
  `WHOLE_ROWS` and the player-bar rows at 1.5×, on Linux and on Windows, recording both in this step's
  outcome. DEC-112's floor of five must hold; at 1.5× there is more room than at 2×, not less.
- **Docs.** `PIXEL_DESIGN_SYSTEM.md`'s scale section says the four sizes, the default, the hairline
  token and why borders round down. The user guide's size section is rewritten with SET-4's words.
  `CHANGELOG.md` under Unreleased: the new size and default.

**Tests**:
- `scale.test.ts`: with nothing stored the scale is 1.5; a stored "1.5" reads 1.5, not 1; a stored
  "2" stays 2; "2.5", "abc" and "" read 1.5. `storageFailure.test.tsx` expects 1.5 when storage
  throws.
- `cssScale.test.ts` (the guard above), with a fixture stylesheet showing it fails on a bare
  `calc(1px * var(--scale))`.
- `waveformLayout.test.ts`: cases at 1.5 (unit 2 at ratio 1, 3 at ratio 2) and 300 CSS pixels' columns
  at 1.5. `prepareLanes` tests: a column width at 1.5.
- `ThemeSettingsPanel` test: the four options in order, 1.5 selected by default, choosing 1.5 sets
  `--scale` and `data-scale` to "1.5".
- `e2e/playerBar.spec.ts` loops over 1, 1.5, 2 and 3 and fits the bar at each.
- A new `e2e/scale.spec.ts`: a fresh profile opens at 1.5×; on the Library and on Settings no
  element's computed border width or box-shadow length is fractional at 1.5×; the page does not
  scroll sideways at any of the four sizes in the default window.
- `e2e/prepare.spec.ts` at the new default, as above.
- `trackTableLayout.test.ts`: `readRowHeight` reads a registered length ("50px") as 50, and still
  falls back on an empty or unparseable value.
- In `e2e/scale.spec.ts`: on the Library at each of the four sizes, a body row's height equals the
  header row's, and equals the size's `--row-height` (33, 50, 66, 99); no cell's text is clipped
  (each cell's `scrollHeight` is at most its `clientHeight`).

**Acceptance criteria / DoD**:
- A fresh install opens at 1.5×; a stored size is kept.
- No border, bevel or shadow lands on half a pixel at 1.5×, and the guard keeps it so.
- Every page fits the default window at all four sizes with nothing spilling sideways.
- DEC-112's floor holds at the new default, re-measured on Linux and Windows.
- Every table's rows are the size's row height, at every size, and no cell's text is cut.
- The design-system doc, the user guide and the changelog say 1.5× is the default.

**Risks**: Medium. Every new user sees every page at a size none of the earlier phases measured, so
any layout checked only at 2× may crowd or spill. The e2e suite's size checks run at the new default,
and the step's outcome lists every number it re-measured. A 1px line drawn at 1px on a 1.5× page is
thinner than a strict 1.5× would make it; that is DEC-161's accepted cost.

**Complexity**: **M**

---

## PAGES-15 — Beatport's Key Is the Key

**Objective**: A track's key is your own correction, else its accepted Beatport match's key, else
none (DEC-201). Rekordbox's key no longer counts anywhere a key is used.

**User-visible result**: Keys in the Library, the filters, search, the wheel, the Keys page,
Prepare's checks, Similar tracks and Health are Beatport's (or yours). A track with no accepted
match shows "No Beatport key" and is left out of every key filter, count and check. Track details
still shows Rekordbox's key in its Rekordbox section, marked "not used". After a fresh import no
track has a key until matching runs; the Library and the first-run guide say so, with a button to
match in Clean.

**Dependencies**: none in this phase. It runs before PAGES-05, PAGES-09, PAGES-10 and PAGES-16, which
all read the key it defines.

**Proposals carried**: FLW-22 (the user's, DEC-201), and FLW-6's notation rule.

**Design**:
- **One rule, in the engine.** Today the key is `effective_value(tracks.key, meta.key)` and the SQL
  `COALESCE(meta.key, tracks.key)` (`models/track_metadata.py:293`, `models/filter_rule.py:480`,
  DEC-068). Key gets its own resolver: `COALESCE(meta.key, accepted.key)`, where `accepted` is the
  `match_candidates.key` of the track's accepted match (`migrations/m0012_match_similarity.py`).
  BPM, genre, label and year keep DEC-068's rule.
- **Every reader moves together**: the filter field and its facet, `track_repository.py`'s row
  read, search (FLW-5), `set_analysis_service.py`, `set_suggestion_service.py`,
  `similarity_service.py`, `set_list_service.py`, `metadata_service.py`, `health_service.py`'s
  `missing_key` ("No Beatport key"), the export's `rekordbox_export_values.effective_key` and
  `file_write_repository.py`. A test lists every place that reads a key, so a new one cannot read
  `tracks.key` by mistake.
- **Writing never blanks a key.** Export to Rekordbox and Save changes into the files write the key
  where there is one, and leave the existing key in Rekordbox or in the file untouched where there
  is none.
- **Applying is no longer needed for the key.** Key leaves "Use Beatport's values" and Review's
  "Apply from the accepted match", since accepting already gives it. A key someone applied before
  stays as their correction, with its history; nothing stored is migrated.
- **A rejected or cleared match** takes its key away with it, on the next read.
- **Matching itself is unchanged.** The matcher still reads Rekordbox's key only as the scoring
  hint it uses today; that is evidence for finding the match, not the key the app shows.
- **The API** adds `key_source` ("yours", "beatport" or null) and `rekordbox_key` to track rows; the
  contract files move together.

**Tests**:
- Resolver unit tests: yours beats Beatport; Beatport with no correction; neither gives none; a
  rejected match gives none.
- `filter_sql` tests: "Key is 8A" matches a Beatport "Am" and never a Rekordbox-only 8A.
- Export and tag-writing tests: no key leaves the target's key as it was.
- Set checks and Similar tracks skip a track with no key and say so.
- Health counts "No Beatport key".
- An e2e run: import a fixture whose tracks have Rekordbox keys and no matches, and see "No Beatport
  key"; accept a fixture match and see its key in the table, the wheel and Prepare.

**Acceptance criteria / DoD**: no screen, filter, count, check or export uses Rekordbox's key; the
guard test lists every key reader.

**Risks**: Medium. A library that has not been matched shows no keys at all. That is DEC-201's
choice, and LIB-1, RUN-3 and the first-run guide explain it.

**Complexity**: **L**

---

## PAGES-16 — The Keys Page

**Objective**: A sidebar page that shows the keys of one or several playlists, Collections or Sets
together, and the tracks in any of them (FLW-21, DEC-200).

**User-visible result**: **Keys** in the sidebar. On the left, the whole library or a ticked set of
playlists, Collections and Sets. In the middle, the Camelot wheel with each key's count on its
segment, darker where there are more, and the same counts as a list in Camelot order with a bar
each; "No Beatport key: N" on its own line. Clicking one or more keys lists those tracks below,
with the selection bar's actions. "Show keys that mix with 8A" lights the compatible keys.
"Open in Library" and "Save as Smart Collection…" carry the choice on, playlists included.

**Dependencies**: PAGES-10 (the wheel's drawing and the compatible-keys route), PAGES-15 (the key),
PAGES-05 (the "In playlist" rule, FLW-7, and the selection bar, FLW-8).

**Proposals carried**: FLW-21 (the user's, DEC-200).

**Design**:
- **The route** `/keys`, its own sidebar entry after Library and Collections, with the description
  line NAV-1 gives every entry: "Which keys your playlists hold".
- **The engine counts.** A read route, `POST /api/v1/library/keys/population`, takes the sources
  (`{kind: "all" | "playlist" | "collection" | "set", id}`) and answers `{total, keys: [{code:
  "8A", count}], no_key}`. A track in several sources counts once. Codes are Camelot, from PAGES-15's
  key. The six contract files move together.
- **The wheel is PAGES-10's,** drawn in a counts mode; one component, two uses. The list beside it
  is the accessible reading of the same numbers.
- **The tracks** are an ordinary track table whose rules are "Key is any of …" and "In playlist …",
  so "Open in Library" and "Save as Smart Collection…" are the Library's own (FLW-7).
- **Remembered**: the ticked sources, in `localStorage` under `cuepoint-keys-sources`, guarded like
  `scale.ts`.
- **Empty states**: no library ("Import your collection first"); no Beatport keys yet ("Keys come
  from Beatport. Match your tracks in Clean", with the button).
- **One home** (FLW-2): the Library's Key quick filter stays as an in-place filter and links here.

**Tests**:
- Engine: counts for one and several sources, a track in two sources counted once, `no_key`, and an
  unknown source refused with the envelope.
- Renderer: the source picker, the counts list in Camelot order, multi-key selection, the
  compatible-keys light, and the Smart Collection it saves.
- `e2e/keys.spec.ts`: tick two playlists, read the counts, click a key, play a track from the list.

**Acceptance criteria / DoD**: the keys of any mix of playlists, Collections and Sets are one click
away from the sidebar, and every count matches the Library filtered the same way.

**Risks**: Low. The counting is a grouped read over indexed columns; it is measured on the 50k
fixture with `bench_library.py`.

**Complexity**: **L**

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
9. Every key the app shows, filters, counts or checks is the user's or Beatport's, never
   Rekordbox's, and the Keys page counts any mix of playlists, Collections and Sets. *PAGES-15,
   PAGES-16.*
10. A fresh install opens at 1.5×, no hairline lands on half a pixel at any size, and table rows are
    as tall as the size says. *PAGES-14.*
11. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check, the
    end-to-end suite and `npm run dist`.
12. No decision in DEC-001…DEC-201 is contradicted, except where an accepted proposal says so and the
    user accepted it knowing (BAR-6 and WAVE-06), and DEC-201's change to DEC-068 for the key. A
    contradiction stops the work and is raised rather than worked around.

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
