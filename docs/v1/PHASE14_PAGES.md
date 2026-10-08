# CuePoint v1.0.0 — Phase 14: The Pages Revisited, Detailed Step Specifications

Status: **Specified 2026-10-07. No step is implemented yet.** Sixteen steps, PAGES-01…PAGES-16.
The page reviews DEC-131 asks for are written in `PHASE14_REVIEWS.md`, 107 proposals across eleven
surfaces, each with a screenshot of the app as it is today (`phase14/`). The user marked them on
2026-10-07, taking the recommendation on every one (DEC-159): 100 accepted; NAV-4, STR-4, BAR-6
and BAR-10 declined; and three settled by decisions instead (NAV-3 by DEC-156, STR-1 by DEC-155,
HDR-4 by DEC-133). Writing the reviews raised six questions that Decision Round 14 did not answer,
asked as Decision Round 17 (Q-157…Q-162). All six are settled (DEC-154…DEC-158, DEC-160). DEC-161 later added a 1.5× size as the default. The task walkthrough (`PHASE14_FLOWS.md`) then added FLW-1…FLW-22,
all accepted (DEC-199…DEC-201), and with them PAGES-15 and PAGES-16. A full review on 2026-10-08
checked every step against DEC-001…DEC-201, the walkthrough and Phases 15–18. Its fixes are in the
text below, each decision it touched carries a dated note, and what only the user could settle was
Decision Round 22 (Q-200…Q-207), answered the same day with every recommendation (DEC-202…DEC-209).
The steps carry only accepted proposals. Per the process, no implementation happens from this document. Each
step needs an explicit "Implement PAGES-NN" instruction, scoped to exactly that step, and its outcome
is recorded under the step afterwards.

Depends on Phases 1–13. Phase 13 must be complete first (DEC-140): REPORT-01 adds the Privacy panel
to Settings, REPORT-06 adds the error screen and Help → **Report a problem**, and both are pages this
phase then revisits. Decision Rounds 1–16 apply (`DECISIONS.md`, DEC-001…DEC-153). This phase's own
decisions are DEC-130 (Discover is a review), DEC-131 (each page reviewed in writing, proposal by
proposal), DEC-132 (clear to new users), DEC-133 (the Camelot wheel), DEC-134 (every kind of
motion, each behind a switch), DEC-135 (pixel steps, smooth fades) and DEC-199…DEC-201 (the
walkthrough, the Keys page and Beatport's key), with DEC-096 (the key rule the wheel lights),
`PIXEL_DESIGN_SYSTEM.md` (the pixel style) and DEC-140 (its place, after error reporting).

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

The task walkthrough then added (DEC-199…DEC-201): visible buttons for the actions that matter, one
home for each function, a **Keys** page in the sidebar, and Beatport's key as the only key.

**What this phase is not.**
- **No new feature beyond the wheel, motion, the Keys page and Beatport's key.** Statistics is
  Phase 15, the updater Phase 16.
- **No like or dislike on Discover** (DEC-130).
- **No change to what the engine stores.** Field ids, job types, config keys and stored rows stay,
  and nothing migrates. The API only grows: labels it sends for display (filter fields, Health
  checks), the wheel's and the Keys page's read routes (PAGES-10, PAGES-16), the quick filters'
  facets and the search clause (PAGES-05), the "In playlist" field (FLW-7), and a key's source on
  track rows (PAGES-15). Each addition moves the six contract files together.
- **No new theme or layout.** The pixel design system stands (`PIXEL_DESIGN_SYSTEM.md`).
- **No proposal the user rejected,** however small.

## The reviews, and how they become steps

`PHASE14_REVIEWS.md` holds one review per surface, as DEC-131 lays it out: what it does, what a new
or non-technical user would not understand, and numbered proposals, each with what changes, why, its
size, the files it touches, a recommendation and a screenshot.

| Surface | Proposals | Built in |
| --- | --- | --- |
| Settings | SET-1…SET-11 | PAGES-01 (SET-2 in PAGES-02; SET-4's 1.5× size in PAGES-14) |
| The sidebar | NAV-1…NAV-6 (NAV-4 declined; NAV-3 is DEC-156) | PAGES-03 |
| The header and menu bar | HDR-1…HDR-7 (HDR-4 is DEC-133's placement) | PAGES-03, PAGES-10 |
| The status strip and Activity | STR-1…STR-9 (STR-4 declined; STR-1 is DEC-155) | PAGES-03 |
| The player bar and queue | BAR-1…BAR-10 (BAR-6 and BAR-10 declined) | PAGES-04 (BAR-5 in PAGES-10) |
| The Library | LIB-1…LIB-12 | PAGES-05 |
| The Inspector | INS-1…INS-11 | PAGES-06 |
| Clean | CLN-1…CLN-12 | PAGES-07 |
| Discover (with DEC-130's keep, change or remove for each of its 21 parts) | DSC-1…DSC-12 | PAGES-08 |
| Prepare | PRP-1…PRP-13 | PAGES-09 (PRP-13, joining RUN-1, in PAGES-11) |
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
| DEC-087 | Export stays on the Library and on a Collection's or Set's own controls, never in the app menu. FLW-11's three header buttons replace its 2026-09-21 "Collection file ▾" menu. |
| DEC-112 | Prepare's floor of five whole Set rows holds at the default size, now 1.5×, with everything this phase adds to Prepare. |
| DEC-155, DEC-158 | No "engine" or "job", and American spelling, in every string this phase writes or touches, held by a test. |
| DEC-157 | The header's wheel lights the selected track, else the playing one; the wheel opened from the player bar's key lights the playing one. |
| DEC-160 | A click on the wheel replaces the Library's whole view: search, rules, quick-filter chips and the open playlist or Collection. |
| DEC-161 | 1.5× is the default size, and table rows follow the size. |

## Sequencing

**Settings first, then motion's groundwork.** PAGES-01 gives Settings its sections, so PAGES-02's
Motion panel and Phase 13's Privacy panel land in their places rather than at the bottom of a list.
PAGES-02 lays down the tokens, the ten switches and the reduced-motion rule, and moves today's three
motion rules behind them. From then on, every new piece of UI the later steps add is written against
the switches.

**Then the size.** PAGES-14 (DEC-161) follows, so every page step after it is built and measured at
the new default, 1.5×. It touches every stylesheet's hairlines, so it runs alone, not beside a page
step.

**Beatport's key before the pages.** PAGES-15 moves every key reader that exists today onto one
resolver. The page steps then build on it: PAGES-05's quick filters, search and Key field, PAGES-07's
Health count, PAGES-09's checks, PAGES-10's wheel and PAGES-16's counts.

**The shell, then the pages, in this order.** PAGES-03 changes the words every page shares and adds
the shell's record of the selected track (fact 4). Each page step after it uses the one before:
PAGES-04 (the player bar, whose waveform words Prepare reuses); PAGES-05A and 05B (the Library's words
and its filter, including the "In playlist" field Clean's scope picker uses); PAGES-07 (Clean, whose
Fix values tab and match window the Library's buttons open); PAGES-05C (the Library's selection bar,
which opens them); PAGES-06 (Track details, which reuses Clean's words and editor); PAGES-08
(Discover, which writes the key words); and PAGES-09 (Prepare).

**The wheel, then the Keys page.** PAGES-10 needs the header, the store and PAGES-05's Key field.
PAGES-16 reuses the wheel's drawing and the Library's playlist rule and selection bar.

**The first-run guide after every page,** because it shows them and quotes their words.

**Motion last.** PAGES-12 builds the ten kinds across the finished pages, then re-runs the scroll
checks with every kind on. PAGES-13 is the user's test: they try each kind, pick the defaults, and
the phase comes together.

**The full order**: PAGES-01, 02, 14, 03, 15, 04, 05A, 05B, 07, 05C, 06, 08, 09, 10, 16, 11, 12, 13. Each step's
Dependencies line names the steps it reads.

**The walkthrough's proposals ride their page's step** (`PHASE14_FLOWS.md`, DEC-199): FLW-20 in
PAGES-03; FLW-3 (as it applies to Clean) and FLW-12…14 in PAGES-07; FLW-4…8, 10 and 11 in PAGES-05;
FLW-9 in PAGES-06; FLW-3 (as it applies to Discover), 15 and 16 in PAGES-08; FLW-17…19 in PAGES-09;
FLW-22 in PAGES-15; FLW-21 in PAGES-16; and the FLW-1 and FLW-2 checks in PAGES-13.

**Four steps are built in parts.** PAGES-03, PAGES-05, PAGES-07 and PAGES-09 each hold two or three
build loops' worth of work, so each is split into parts (03A, 03B, …), each scoped, tested and
reviewed on its own. "Implement PAGES-05" builds its parts in order; "Implement PAGES-05B" builds one.

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
| `screens/discover/similarReasons.ts`, `screens/prepare/prepareSource.ts` | Similar tracks, Prepare's Suggestions and strip, the wheel | PAGES-08 (DSC-10) writes the key words, "Same key", "Next key" and "Relative key"; PAGES-09 (PRP-8, FLW-19) and PAGES-10 reuse them, and PRP-8's "Neighbouring key" is not used |

### 3. The engine sends some of the words

The filter's Field list (`src/cuepoint/models/filter_rule.py:513-730`) and the Health counts and
checks (`src/cuepoint/services/health_service.py:89-161`) are labels the engine sends. Renaming them
(LIB-7, CLN-4, CLN-9) changes the label only: the field ids and check names are stored in saved
Smart Collections and rules, and do not change. No migration.

### 4. The shell has no "selected track"

Each page owns its selection, and hands the Inspector a rendered element through `useInspectorSlot`
(`components/shell/inspectorSlot.tsx:107`), not a track. The playing track is readable anywhere
(`selectCurrentItem`, `components/player/playerStore.ts`). The wheel needs the selected track's key,
so PAGES-03 adds a small shell store, `useSelectedTrack()` / `setSelectedTrack({ id, key } | null)`
(`components/shell/selectedTrack.ts`), and each page step sets it beside its `useInspectorSlot` call:
PAGES-05 the Library, PAGES-07 Clean's Review and Missing files, PAGES-08 Discover's result rows,
artist pages and Similar tracks (a Beatport row carries Beatport's key), PAGES-09 Prepare's Set and
source panel, and PAGES-16 the Keys page. `key` is PAGES-15's key, in Camelot, or null.

### 5. The Library's key filter is text, and no route answers "what mixes with 8A"

"Key" is an effective text field (`filter_rule.py:520`). `is` compares text, case-blind
(`src/cuepoint/persistence/filter_sql.py:231-240`), so "8A" does not find a track spelled "Am".
DEC-096's rule lives in `src/cuepoint/core/similarity.py` (`compatible_keys`, `:224`;
`key_relation`, `:208`), and the spellings a library uses for a key come from
`similarity_repository.spellings("key")`, as `similarity_service.py:358-366` does. No API route
exposes either. PAGES-05 makes the Key field compare normalized keys (FLW-6), and PAGES-10 adds one
read route for what mixes; with both, the wheel's filter needs no list of spellings.

### 6. Motion today: three rules, no tokens, no reduced motion

The renderer moves by three rules in two places: the button's press (`components/Button.css:16`, `:38-40`) and
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

- **WAVE-06's** is `e2e/waveformPlaces.spec.ts:390`: no long task over 50 ms while scrolling 5,000
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
Phase 18 later adds Backups before About & updates (DEC-179).
The Beatport token panel is no longer titled "Settings". The accepted SET proposals change the
words in each section.

**Dependencies**: Phase 13 (REPORT-01's Privacy panel exists).

**Proposals carried**: SET-1 (the sections), SET-3 (theme names, the editor, a confirm on
delete), SET-4 (size; its 1.5× option is PAGES-14's), SET-5 (the Beatport section), SET-6 (waveform
data behind a disclosure, the "Nothing to analyze" words), SET-7 (one Privacy section with the exit-clearing choices), SET-8 (audio
words), SET-9 (export words), SET-10 (a "Saved" tick), SET-11 (reset per section).

**Design**:
- **The page is `SettingsScreen.tsx`.** `SettingsExportScreen.tsx` is renamed; its name dates from
  Results (DEC-071). The route stays `/settings`.
- **Sections, not tabs.** The links scroll to the sections, so Discover's **Open Settings** still
  lands on the token field (`BEATPORT_TOKEN_FIELD_ID`) and the specs' `getByRole("link", { name:
  "Settings" })` still works. At narrow widths the links sit above the sections.
- **Motion is a placeholder** until PAGES-02 fills it. **About & updates** holds the version (moved
  from the status strip, DEC-155), Help → Getting started, and the slot Phase 16's
  "Check for updates" takes.
- **Privacy is REPORT-01's panel,** moved into place. REPORT-01's text in `PHASE13_REPORTING.md`,
  "last on the page, after Rekordbox export", is amended in this step's commit to "after Rekordbox
  export". With SET-7, the section also
  holds "Clear cache on exit" and "Clear logs on exit", on the same `cuepoint-privacy-clear-*-on-exit`
  keys as Help → Privacy (`components/PrivacyDialog.tsx:5-6`), so both show one state.
- **Theme ids do not change** (SET-3). Only their labels do, so a stored theme still loads.
- **The 1.5× size is PAGES-14's** (DEC-161). This step writes SET-4's label and hint, and lists the
  options `tokens/scale.ts` offers, so the select gains Medium (1.5×) when PAGES-14 adds it.
- **Reset to defaults** (SET-11) resets Appearance to Neo dark at 1.5× (DEC-161), not 2× as SET-11
  was written; each section's reset asks first and offers Undo in its toast.
- **American spelling** (DEC-158) in every string the step writes: "Colors", "analyze", and Health's
  "Analyze waveforms" button, which CLN-9 left as it was.
- **Sections are tested by name, not by count,** so Phase 16's update controls and Phase 18's Backups
  (DEC-179) land without rewriting the test.

**Tests**:
- A new `SettingsScreen.test.tsx`: the heading, the eight sections in order by name, each link scrolls
  to its section, and Discover's deep link focuses the token field.
- Reset to defaults: asks first; Undo restores the section; Appearance resets to 1.5×.
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

**Outcome** (2026-10-08): `SettingsScreen.tsx` (renamed from `SettingsExportScreen.tsx`) is one page: the heading
"Settings", a `nav` of in-page links (plain anchors that scroll and focus the section and leave the hash router's
address alone) and eight named regions defined once in `screens/settingsSections.ts`. Every SET proposal named above
is in, with the defaults chosen as follows. Motion is a one-line placeholder ("Motion settings will appear here.")
for PAGES-02 to replace. The Beatport "How do I get a token?" help is an inline `<details>` disclosure with the short
steps from the Discover guide, since the app cannot open the guide. The Privacy section is one panel: the
error-reports switch, then "When CuePoint quits" on the keys Help → Privacy uses, now behind one module
(`screens/exitClearing.ts`) that both read on open; Help → Privacy keeps its controls and gains a link to the
section. About & updates holds the version, **Getting started** and an empty `data-slot="updates"` for Phase 16.
"Saved" is a 2 s `SavedTick` in the panel header (or beside the switch); Reset to defaults exists for Appearance
(Neo dark at `DEFAULT_SCALE`, still 2× until PAGES-14) and Waveforms colors (Three bands), each behind a confirm and
followed by a toast with **Undo** (the toast gained an optional action button). The status strip's "Analyzing
waveforms" was spelled the American way too, to match. Strings that come from the Python side ("Waveforms
analysed" on Clean's Health row, the activity summaries) are left for PAGES-04.

---

## PAGES-02 — Motion's Groundwork: Tokens, Ten Switches and Reduced Motion

**Objective**: The tokens every animation steps by, a stored switch for each of the ten kinds of
motion, and one rule that turns motion off when the system asks, before anything new moves.

**User-visible result**: Settings → Motion lists ten switches, all on, and says whether the system's
Reduce motion setting is on. The button's press and the toast's entrance obey their switches and the
system setting. Nothing else moves yet.

**Dependencies**: PAGES-01.

**Proposals carried**: SET-2 (the Motion section in three plain groups, "Turn all on" and
"Turn all off", and a one-move preview beside each switch). Feedback, the tenth kind, sits in "When
things change", not under "While you wait or scroll" where SET-2 was drafted before DEC-154 named it.

**Design**:
- **The ten kinds** (DEC-134, with DEC-154's tenth), each with a stable id:
  `micro` (microinteractions), `interaction` (interaction animations), `state` (state transitions),
  `page` (page transitions), `entrance` (entrance and exit), `hover` (hover and focus), `scroll`
  (scroll animations), `loading` (loading), `shared` (shared-element transitions), and `feedback` (DEC-154).
- **Stored** in localStorage as `cuepoint-motion`: `{ [kindId]: boolean }`, holding only the kinds
  the user has changed, so PAGES-13's defaults still reach every kind they did not touch; "Turn all
  on" and "Turn all off" write all ten. A missing, unreadable or partial value reads the defaults.
  Defaults until PAGES-13: every kind on.
- **Applied as attributes.** A `MotionProvider` (`tokens/MotionContext.tsx`, beside `ScaleContext`)
  writes `data-motion-<kind>="on"` on `<html>` for each kind that is on and the system allows.
  When `prefers-reduced-motion: reduce` matches, it writes none of them, whatever the switches say,
  and listens for the setting changing. CSS gates every rule on its kind:
  `:root[data-motion-micro] .cp-btn { transition: … }`.
- **Tokens** (DEC-135) join `tokens/tokens.css`, beside the scale:
  - durations: `--motion-instant` (one frame), `--motion-quick`, `--motion-base`, `--motion-slow`;
  - steps: `--motion-steps-short`, `--motion-steps-long`, used as `steps(var(--motion-steps-…))`;
  - a distance unit, `--motion-step-px: var(--unit)`, so a 4-step slide moves whole CSS pixels
    at 1×, 1.5×, 2× and 3× (`--unit` is 6px at 1.5×);
  - a fade easing, `--motion-fade: linear`, for opacity, which is never stepped.
- **Two rules every motion obeys,** held by a test, not by review:
  - it animates only `transform` and `opacity` (DEC-134: the compositor);
  - it is gated on a `data-motion-*` attribute.
- **Never delays input.** No handler waits for an animation's end before acting, and a pressed
  control acts on press. Motion is decoration on top of a state that has already changed.
- **Today's three rules** move behind their kinds: the button press under `micro`, the toast under
  `entrance`. The press's `box-shadow` transition (`Button.css:16`) goes: the bevel swaps at once and
  only `transform` moves, so the press passes the rule above.
- **Turning motion off never hides information.** A kind that is off or reduced shows its still
  state: a spinner's still frame beside its words, skeleton rows without the shimmer, and feedback's
  words ("Not saved…", "New results") without the shake or the pulse.

**Tests**:
- `tokens/motion.test.ts`: the stored value's defaults, partial and corrupt values, and storage that
  throws (as `storageFailure.test.tsx`).
- `tokens/MotionContext.test.tsx`: switches map to attributes; reduced motion removes every
  attribute and restores them when it clears.
- A new `motionRules.test.ts` reads every `.css` file under `renderer/src` and fails on any
  `transition`, `animation` or `@keyframes` property that is not under a `[data-motion-*]` selector,
  or that animates anything but `transform` or `opacity`. It parses properties, not words, since
  `prepare.css` has class names containing "transition".
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

**User-visible result**: each sidebar entry has a one-line hint; search results open the track;
search closes on an outside click; CuePoint has one menu bar, its own (File, Edit, View, Help), with
troubleshooting grouped under Help; the status strip says "Ready" and names background work in plain
words, with its reason on hover and on focus; "+N more" opens the running work; Activity shows events
in words, grouped by day; no screen says "engine" or "job".

**Dependencies**: PAGES-01.

**Proposals carried**: NAV-1, NAV-2, NAV-3 (DEC-156), NAV-5, NAV-6, HDR-1, HDR-2, HDR-3, HDR-5,
HDR-6, HDR-7, STR-1 (DEC-155), STR-2, STR-3, STR-5…STR-9.

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-20, with HDR-5. CuePoint
gets one menu bar, its own, in place of both Electron's default and the in-window `AppMenuBar` whose
Help HDR-5 split into View and Help (DEC-204). The in-window bar goes and its items move
here:
- **CuePoint** (macOS only): About CuePoint, Settings…, Quit.
- **File**: Import another file… (Ctrl+O, LIB-12), Check Rekordbox for changes. Export stays where
  DEC-087 puts it, on the Library and on a Collection's or Set's own bar: a menu item has no scope.
- **Edit**: Undo, Redo, Cut, Copy, Paste and Select all (Electron's roles), so copy and paste keep
  working in text fields on macOS, the Beatport token's included.
- **View**: Size ▸ (the four sizes, the current one ticked), Bigger (Ctrl+=), Smaller (Ctrl+−),
  Default size (Ctrl+0), Track details, the sidebar, and on Windows and Linux Settings….
- **Help**: Getting started, Shortcuts, Report a problem (REPORT-06), Privacy, and HDR-5's
  troubleshooting group. Help → Privacy opens Settings → Privacy (SET-7), the one home of those
  choices; `PrivacyDialog` keeps only its explanation, with a link there.

Reload, Developer Tools and Zoom leave packaged builds; Ctrl+=, Ctrl+− and Ctrl+0 step the Size
setting instead of zooming, so the two never fight. A development build keeps a Developer menu. The
Shortcuts list shows only shortcuts that work, and gains Prepare's (LIB-12's clean-up, for the whole
app). The sidebar gains **Keys** in PAGES-16.

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
- **Pages dimmed before the first import** (NAV-5): Collections, Clean, Discover and Prepare, and
  Keys once PAGES-16 adds it. Their hint reads "Import your Rekordbox collection first".
- **The menu is built in main** (`electron/appMenu.ts`, new). The size lives in the renderer's
  storage (fact 7), so the menu and Settings → Appearance agree through narrow bridge calls: the
  renderer sends the options (`SCALE_OPTIONS`, so the menu gains 1.5× with PAGES-14) and the current
  size whenever it changes, and the menu asks the renderer to set one. Items that open a page
  (Settings…, Getting started, Shortcuts, Privacy) send one command with a fixed id. The preload
  exposes only these methods, and the contract files move together.
- **The selected-track store** (fact 4), `components/shell/selectedTrack.ts`, holding
  `{ id, key } | null`; each page step feeds it.
- **No "engine" or "job" anywhere the user reads** (DEC-155), not only on the strip. About 25
  user-visible strings still say one of them today, among them `useTrackDetail.ts:46`,
  `ReviewView.tsx`, `LibraryScreen.tsx`, `WriteTagsDialog.tsx`, `useCleanHealth.ts`,
  `SettingsExportScreen.tsx`, `useBeatportToken.ts`, `useCleanJob.ts` and `useLibraryBatch.ts`. The
  step rewords every one, and a new `userWords.test.ts` fails on either word, or on a British
  spelling from a short list (colour, analyse, behaviour, neighbour, organise, licence; DEC-158), in
  a user-visible string literal outside an allow-list of ids and log lines.
- **No reason is hover-only.** A reason given in a `title` (STR-3's job reasons, BAR-7's waveform
  reason, LIB-9's marker meaning) is also shown when its control has keyboard focus, through one
  `Hint` component this step adds; later steps use it.

**Tests**:
- `GlobalSearch.test.tsx`: arrows move the active option, Enter navigates with `libraryTrackState`,
  Shift+Enter plays, an outside click closes the panel, one letter shows "Keep typing…".
- `e2e/shell.spec.ts`: search for a track, press Enter, and the Library shows it selected in the
  Inspector.
- `StatusStrip.test.tsx`, `useActiveJob.test.ts`, `activityFormat.test.ts`, `Sidebar.test.tsx`,
  `navRegistry.test.ts`: updated for the accepted words and behavior. `AppMenuBar` and its tests go
  with it.
- `appMenu.test.ts` (main): the template on each platform; a packaged build has no Reload,
  Developer Tools or Zoom; Ctrl+= asks for the next size; Edit's roles are present on macOS.
- `e2e/shell.spec.ts`: View → Size → Large (2×) sets the size and Settings shows it; Ctrl+0 returns
  to 1.5×.
- `userWords.test.ts` and `Hint.test.tsx`: the words guard, and a reason shown on focus.
- Every e2e spec passes after the "engine" change (DEC-155).

**Acceptance criteria / DoD**:
- A track found in search can be opened and played without the mouse.
- No string on the strip, the sidebar or the menu bar is one the user marked for change, and no
  user-visible string says "engine" or "job".
- One menu bar, CuePoint's; copy and paste work in every text field on macOS.
- All suites pass.

**Risks**: Medium. The status strip's "Engine connected" is what every spec waits on (fact 1).

**Complexity**: **L**, in two parts. **PAGES-03A**: DEC-155's words and `waitForEngine()`, the
strip, Activity, the store and `Hint` (STR-1…3, STR-5…9). **PAGES-03B**: the sidebar, the header,
search and the menu (NAV, HDR, FLW-20).

---

## PAGES-04 — The Player Bar and the Queue

**Objective**: The bar's controls say what they are, the queue can be managed, and a failed or
silent waveform says why.

**User-visible result**: hovering or focusing a control names it with its shortcut; the queue button
shows how many tracks wait; repeat says "All" or "One"; the playing track's title opens it in the
Library; the queue panel has a hint line, **Clear queue**, a drop marker and a reason written on a
failed row.

**Dependencies**: PAGES-03 (the Library's `libraryTrackState`, for BAR-4, and `Hint`).

**Proposals carried**: BAR-1…BAR-4, BAR-7, BAR-8 and BAR-9. BAR-5 (the key opens the wheel) is
built in PAGES-10. BAR-6 and BAR-10 were declined.

**Design**:
- **The waveform words** (BAR-7) are rewritten once in `analysisWords.ts`, and every surface that
  reads them changes with it (fact 2). A failed analysis maps its reason code to a sentence; an
  unknown code reads "This file could not be read." and never shows the code.
- **The waveform's reason stays where WAVE-06 put it** (BAR-6 was declined): in the seek area's
  title, shown on focus too through PAGES-03's `Hint`, and in Track details (INS-8).
- **A failed queue row's reason** (BAR-9) travels on the queue item: `QueueItem` gains
  `failure?: string`, set by main from the notice it already raises (`electron/playbackQueue.ts`),
  and the contract files move together. The reason is text on the row, not only a title.
- **Clear queue** (BAR-8) asks "Clear the queue? The playing track keeps playing." The word "Clear"
  alone is not used, since the selection and the filters clear too.
- **The bar is still absent until the first play** (DEC-053). BAR-10's hint was declined; RUN-3's
  checklist says how to play.

**Tests**:
- `PlayerBar.test.tsx`: every button has a title naming its shortcut; the badge shows the queue
  length and hides at 0; repeat's label follows the state.
- `QueuePanel.test.tsx`: **Clear queue** asks, then calls `clearQueue` once; a failed row shows its
  reason as text.
- `analysisWords.test.ts`: every reason code has a sentence; an unknown code shows none.
- `e2e/playerQueuePanel.spec.ts` and `e2e/playerBar.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- Every control in the bar and the queue panel can be named by hovering or focusing it.
- All suites pass.

**Risks**: Low.

**Complexity**: **S** to **M**, with BAR-9.

---

## PAGES-05 — The Library

**Objective**: The Library says what it is reading, what is happening to it, and what to do next on
every empty table.

**User-visible result**: "Collection" means only CuePoint's own lists; the header has three buttons,
**Check Rekordbox for changes**, **Import another file…** and **Export to Rekordbox…**; after an
import a note explains the work that follows and that the user can keep working; every empty table
offers the next step; Key, BPM and Genre are one click away; search finds keys and tempos; the
actions on selected tracks are visible buttons, grouped as the right-click menu is; the filter's
fields are grouped under plain names; one track count; Columns… sits by the table.

**Dependencies**: PAGES-03 (the job explainers LIB-1 reuses, the selected-track store), PAGES-15 (the
key the quick filter, search and Key field read). Part C also needs PAGES-07 (Clean's Fix values tab
and match window, which the bar's Beatport ▸ and Fix ▸ open), so it is built after PAGES-07.

**Proposals carried**: LIB-1…LIB-12, with LIB-3, LIB-4 and LIB-6 as the walkthrough amends them
below.

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-4 to FLW-8, FLW-10 and FLW-11.
- **The header** (FLW-11, amending LIB-3, LIB-4 and DEC-087's 2026-09-21 precision): **Check
  Rekordbox for changes** (DEC-208; LIB-3's "Refresh from Rekordbox…" and CLN-8's "Refresh
  the Library" take this name too), **Import another file…** and **Export to Rekordbox…** as three
  buttons; "Collection file ▾" goes, and with it LIB-4's "Rekordbox file ▾". Before the first import
  the one button is **Import your Rekordbox collection…**, the words NAV-5, PAGES-11 and PAGES-16 use.
  DEC-087's precision found three buttons did not fit at 2×. The step measures them at 1.5×; where
  they do not fit on one line (2×, 3× or a narrow window) the labels shorten to "Check for changes",
  "Import…" and "Export…", keeping the full names as their accessible names, and never fold back into
  a menu. DEC-087's test keeps holding the table's height.
- **Two fixed rows above the table, and one notice line.** The filter row: search, **Key ▾**,
  **BPM ▾**, **Genre ▾**, **Add filter**, then the chips on the same row, scrolling sideways with a
  "+N more" when they overflow, and **Clear all filters** while there are any; the Smart Collection's
  name and Save sit at the row's end. The table's toolbar row: the selection bar on the left; the
  count ("1,204 tracks · 3 selected", LIB-8) and **Columns…** (LIB-10) on the right. Above them, one
  notice line holds whichever notice applies, one at a time: LIB-1's ready note, "No tracks have a
  Beatport key yet", or what a Health link opened ("No Beatport key: 312 tracks" with **Match
  tracks…**). It shows only after an import or a click of the user's own, never while they work in
  the table. Nothing else stacks above the table.
- **Quick filters** (FLW-4), on the Library's table, which Collections and the Keys page reuse; not
  on Clean's, Discover's or Prepare's tables, which each do one job (FLW-3). Key lists the view's
  keys in Camelot order with counts, PAGES-15's key, with "No Beatport key: N" as its own line; BPM
  offers the view's range; Genre its genres with counts. Each choice becomes an ordinary chip. The
  engine answers the facets for the current view, one read route taking the filter's body,
  `POST /api/v1/library/facets`; the contract files move together. PAGES-16 adds "See these on the
  Keys page" to the Key list.
- **When no track has a key yet** (DEC-201): the Key list, a search for a key and a Key filter that
  finds nothing (in the notice line) say "No tracks have a Beatport key yet. Keys come from matching." with **Match
  tracks…** (Clean's window, PAGES-07). An empty Key cell reads "—", and the column's hint says why.
- **Search matches key and BPM** (FLW-5): "8A", "Am" or "124" also match the key (PAGES-15's,
  normalized) or the BPM, and a row says what it matched on. Engine search: `track_query.py`'s
  `_SEARCH_COLUMNS` plus a key and BPM clause.
- **One Key field** (FLW-6): `filter_rule.py` keeps one "Key" field, PAGES-15's key compared
  normalized (`override_values.parse_key`), so 8A and Am are one key. "CuePoint key" becomes "Your
  key". Rekordbox's key stays a field only in the Rekordbox-only group, named "Key from Rekordbox
  (not used)", so a user can find tracks whose Rekordbox key disagrees with Beatport's. It is the one
  filter DEC-201 lets read Rekordbox's key, and it never feeds a count, a check or the wheel.
- **"In playlist"** (FLW-7): a new rule field, "In playlist is any of …", whose value is any mix of
  playlists, Collections and Sets, so the Keys page's sources save as one rule. Saving a Smart
  Collection while a playlist is open adds it, so the playlist is no longer dropped
  (`LibraryScreen.tsx` `saveSmart`). Phase 15's scope picker uses this same field and label (DEC-162,
  as amended 2026-10-08).
- **The selection bar** (FLW-8, amending LIB-6). The bar is always on the toolbar row (DEC-209): with nothing selected its buttons are disabled and say "Select tracks first", so it
  never appears or vanishes and the table never moves. The bar and the right-click menu are built
  from one list:

  | Group | Holds | What it does |
  | --- | --- | --- |
  | Play ▸ | Play, Play next, Add to queue | In place, the selected tracks in table order |
  | Organize ▸ | Add to Collection…, Add to Set…, New Set from these…, Remove from "X", Add tag…, Remove tag…, Rate ▸, Favorite | In place |
  | Explore ▸ | Artist page, Label page, Similar tracks | Opens the page for one track; with several, for the first |
  | Beatport ▸ | Match tracks…, Review these matches, Use Beatport's values… | Opens Clean with the selection: the match window, Review, or Fix values |
  | Fix ▸ | Edit values…, Save changes into the files…, Check the files are still there | Opens Clean with the selection: Fix values, or Missing files checking them |
  | More ▸ | Copy, Show in folder | In place |

  **Clear selection** ends the row. "Actions…" goes. Accept and Reject leave the Library: deciding a
  match is Review's job (FLW-2, FLW-12). Copy and Show in folder are visible buttons today
  (`SelectionActions.tsx:89-100`) and stay visible, under More ▸.
- **The tree** (FLW-10): "New Collection", "New Set" and "New folder" as labelled buttons over the
  tree, and a bar under it for the selected node, always shown and disabled with "Select a Collection
  or Set" when none is: Rename, Duplicate, Delete (with today's confirm), Export to Rekordbox… on
  every node, folders included (DEC-087's precision), and for a Set, Open in Prepare and Save set
  list…. Hover icons and right-click keep working; Freeze, "Copy set list" and "New Set from…" stay
  on right-click, as the narrowed FLW-1 table says. A Collection's tracks, reordered today only by
  drag, also move with Alt+↑ and Alt+↓, as the queue's do.

**Design**:
- **The selected-track store** (PAGES-03) is set whenever the Library's Track details shows a track,
  with PAGES-15's key.
- **The ready note** (LIB-1) reads the same active jobs as the status strip (`useActiveJob`) and
  shows while any of `file_check`, `artwork_scan`, `waveform_analysis`, `marks_backfill` or
  `credit_index` runs after an import. It can be dismissed for the session.
- **Empty states return an action** (LIB-5): `emptyStateFor` (`libraryEmpty.ts`) returns
  `{ title, hint, action? }`, and the table renders the action as a button.
- **Grouped filter fields** (LIB-7): the engine adds a `group` to each field spec it sends
  (`filter_rule.py`), and the renderer renders option groups from it, keeping no copy of the
  grouping. Field ids do not change (fact 3).
- **The bar and the menu** (LIB-6, FLW-8) are built from the one list above, so they cannot drift;
  Rate ▸'s submenu (`trackMenu.ts:105-126`) is the pattern. The bar is a `role="toolbar"`: Tab
  reaches it once, the arrow keys move between its buttons, and each ▸ has `aria-haspopup`.
- **LIB-2's first-run words** become RUN-3's ticking checklist in PAGES-11, at the same lines
  (`LibraryScreen.tsx:1531-1549`); this step writes the words, PAGES-11 makes them tick.
- **The Library's height is held.** At 1.5× in the 1,280 × 800 window the step measures the whole
  rows the Library shows, with the header, the two rows above the table and the player bar, and an
  e2e test holds that number, as DEC-112's does for Prepare, so nothing added later lowers it.
- **Rating shown by default** (LIB-10) reaches only a layout that has not been saved
  (`columnLayout.ts` reconcile). A saved layout keeps what the user chose.

**Tests**:
- `emptyStates.test.tsx`: each empty state has the accepted words and, where accepted, its action.
- `filter_rule` tests: every field has a group; the ids are unchanged.
- `trackMenu` and selection bar tests: one list builds both; every entry still reaches its action;
  disabled with a reason when nothing is selected; keyboard movement in the toolbar.
- Engine: facets for a view; search by key in two notations and by BPM; "In playlist" over several
  sources; the "Key from Rekordbox (not used)" field reads only the imported key.
- `selectedTrack` integration: the store follows the Library's selection.
- A new `e2e/libraryQuickFilters.spec.ts`: open a playlist, Key ▾, pick 8A, see the chip, save as a
  Smart Collection, reopen it with the playlist kept; and the Library's held row count.
- `e2e/libraryPage.spec.ts`, `libraryBrowse`, `libraryJourney`, `organization` and `cleanLibrary`
  pass with the new names.

**Acceptance criteria / DoD**:
- No empty table in the Library leaves the user without a next step.
- Every action on selected tracks is a visible button, and the bar and the right-click menu hold the
  same groups.
- A key, in either notation, or a BPM is found by typing it.
- A saved Smart Collection from before the step opens and filters exactly as before.
- All suites pass.

**Risks**: Medium. LIB-3 and LIB-4 rename the most-quoted words in the suite (fact 1).

**Complexity**: **L**, in three parts. **PAGES-05A**: the words, the header and the empty states
(LIB-1…5, LIB-9, LIB-12, FLW-11). **PAGES-05B**: the engine's filter and search (LIB-7, FLW-4…7).
**PAGES-05C**: the toolbar row, the selection bar, the tree and the right-click menu (LIB-6, LIB-8,
LIB-10, LIB-11, FLW-8, FLW-10).

---

## PAGES-06 — The Inspector

**Objective**: The panel beside every page is named for what it shows, can be found when hidden, and
shows the important part of a track first.

**User-visible result**: the panel is **Track details**; hidden, it is a labelled tab; Play, Play
next, Add to queue, Similar tracks and Show in folder sit under the title; its sections collapse, in
a calmer order, and remember it; the key reads with its source; the value boxes sit behind **Edit
values…**; an unmatched track's Beatport section is one sentence and **Match on Beatport**; ratings,
file metadata, waveforms and cues are in plain words; a multi-selection offers **Edit values for 4
tracks…**.

**Dependencies**: PAGES-05 (the Library that feeds it), PAGES-07 (`cleanFormat.ts`'s words and Fix
values' editor), PAGES-15 (the key and its source).

**Proposals carried**: INS-1…INS-11.

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-9. Play, Play next, Add to
queue, Similar tracks and Show in folder are buttons under the track's title; the File row's own Show
in folder (`TrackDetailPanel.tsx:359`) goes, so it is in one place. With several tracks selected the
buttons act on all of them, as the selection bar does, except Similar tracks, which uses the first.
The key reads with its source (PAGES-15): "8A · A minor · Beatport", "8A · A minor · yours", or "No
Beatport key" with **Match on Beatport**, which matches this one track in place (INS-5's action, the
same work as Clean's match window). Rekordbox's key shows in "Details from Rekordbox" (INS-3's name),
marked "not used".

**From the review** (2026-10-08):
- **One editor** (DEC-205). INS-4's "Correct a value…" becomes **Edit values…** and opens
  the editor Clean's Fix values uses (PAGES-07), for this track. INS-11's "Change all 4…" becomes
  **Edit values for 4 tracks…**, which opens Clean's Fix values with the selection
  (`cleanFixState(selection, "edit")`, PAGES-07); it pointed at "Actions…", which FLW-8 removes. The Beatport section's per-field **Apply** goes: applying Beatport's values is
  Review's and Fix values' job (FLW-2). INS-4's "Rekordbox's value is kept, and you can go back to
  it" holds for every field but the key, whose "go back" returns to Beatport's key, or to none
  (DEC-201).
- **INS-10's hint** points at the selection bar's Organize ▸, not at a right-click.

**Design**:
- **The panel's name** (INS-1) changes in its heading, its show and hide labels, the shortcuts list
  and the specs that find it by "Track inspector" (fact 1). The component and storage key keep their
  names (`TrackInspector`, `cuepoint-ui-shell-inspector`), so the stored width survives.
- **Collapsed sections persist** in one key, `cuepoint-ui-track-details-sections`.
- **History's file entries** (INS-7) are reworded in `activityActions.ts`, which Activity shares
  (fact 2).

**Tests**:
- `TrackInspector.test.tsx`: the hidden tab is labelled and shows the selected title.
- `TrackDetailPanel` tests: the order, collapse and restore; the value disclosure opens on its own
  when an edited value exists; an unmatched track shows one action, which starts a match; the key's
  three readings; one Show in folder; Edit values… opens the shared editor with this track.
- `e2e/shell.spec.ts`, `prepareJourney`, `prepareSource` and `trackMarks` pass with the new name.

**Acceptance criteria / DoD**:
- With the panel hidden, a user can see where it went and bring it back with one click.
- A track can be played, queued and explored from its own details.
- All suites pass.

**Risks**: Low.

**Complexity**: **M**

---

## PAGES-07 — Clean

**Objective**: Clean says what matching is before asking the user to do it, explains each state in
plain words, and keeps the matcher's internals out of the way.

**User-visible result**: an intro line on every tab; the tabs read Review matches, Fix values,
Missing files, Duplicates and Health, and show where work waits; **Match tracks…** and **Save review
list as a file…** in the header; a first visit offers to match every track, with what it will do;
the states are "Waiting for you", "Changed since you decided", "Not found on Beatport", "Not looked
up yet"; the scoring folds under "Why this score?"; Accept and Apply each say what they do; a running
match is explained on the page; Missing files gives the fix in steps; each Health count opens what
fixes it.

**Dependencies**: PAGES-03, PAGES-05A and 05B (the "In playlist" field its scope picker uses, and the
Library's notice line Health's links fill), PAGES-15 (the key Health counts, and that leaves the apply
choices).

**Proposals carried**: CLN-1…CLN-12.

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-3, FLW-12, FLW-13 and FLW-14.
- **Fix values** (FLW-12, FLW-3): a new tab holding **Edit values…**, **Use Beatport's values…** and
  **Save changes into the files…**, for a selection or a scope: the library, or any mix of playlists,
  Collections and Sets, picked with the "In playlist" picker. It opens with CLN-1's intro line; with
  nothing chosen it says "Choose tracks: pick playlists here, or select tracks in the Library and use
  Fix ▸." An opener, `cleanFixState(trackIds, action?)` beside `libraryLink.ts`'s, lets the Library's
  Beatport ▸ and Fix ▸ (PAGES-05) and Track details (PAGES-06) open it with tracks chosen. Its editor
  is the one Track details uses for one track (DEC-205). Writing keeps WriteTagsDialog's preview,
  LIB-11's confirm above 1,000 tracks and History's revert. Key is not among "Use Beatport's
  values…" choices: an accepted match already gives the key (PAGES-15).
- **Matching from the header** (FLW-13, FLW-3): **Match tracks…** opens a small window: which tracks
  (not looked up yet, all, chosen playlists, Collections or Sets, or the tracks passed in) and "Look
  up tracks that already have a match again" (CLN-10's merged control). It is the one place many
  tracks are matched: CLN-2's first-visit offer, the Library's Beatport ▸, the Keys page, Health, the
  first-run guide and Prepare's no-key line all open it with their tracks. One track is matched in
  place from Track details (INS-5). **Save review list as a file…** (CLN-11's name; "Export review
  list…" is not used) sits beside it. Review keeps the queue with its Show and In filters (CLN-2's
  "choose a playlist first" focuses that In), the comparison, and the decisions: Accept, Reject, Undo
  my decision, Search Beatport again for this track, Next, and Use Beatport's values…, folded with
  the scoring (CLN-5, CLN-6).
- **Health opens what fixes a count** (FLW-14): missing or unreadable files open Missing files,
  duplicates open Duplicates, "Waiting for you" (CLN-4's name) opens Review. The rest open the
  Library filtered on the same rule as the count (DEC-075). **No Beatport key** (PAGES-15 renames
  "No key" and changes its rule) opens the Library filtered "Key is empty", the same rule,
  whose notice line (PAGES-05) offers **Match tracks…** with those tracks. Its hint
  says how it differs from "Not looked up yet": a matched track can still have no key when Beatport's
  record has none.

**Design**:
- **The match-state words** (CLN-4) change in `cleanRules.ts`, `cleanFormat.ts` and
  `cleanColumns.tsx`, and in the engine's Health labels (`health_service.py:99-111`), which also feed
  the Library's Health links. The stored states do not change (fact 3).
- **Tab counts** (CLN-3) come from the Health counts the page already loads, and show nothing for a
  check that has never run.
- **The first-visit offer** (CLN-2) opens the match window with "Not looked up yet" chosen.
  `ReviewView.tsx:586`'s **Match all N** moves into that window.
- **Clean keeps its Health tab** (DEC-163); Statistics shows a summary that links here.
- **The selected-track store** (PAGES-03) is set from Review and Missing files.
- **"Analyze waveforms"**, Health's button, in American spelling (DEC-158).

**Tests**:
- `cleanEmpty.test.ts`, `CleanScreen.test.tsx`, `comparison.test.ts`, `HealthView.test.tsx`: the
  accepted words, the first-visit action, the folded scoring and its remembered state.
- Engine: `health_service` tests for the new labels, with the check names unchanged; "No Beatport
  key" counts exactly the tracks its Library filter shows.
- `FixValues.test.tsx`: the scope picker, the empty state, the opener with tracks, Key absent from
  Beatport's choices. `MatchWindow.test.tsx`: each opener's tracks arrive chosen.
- `e2e/clean.spec.ts`, `cleanPage.spec.ts` and `cleanLibrary.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- A user who has never matched can start matching from the first thing Clean shows them.
- Many tracks' values can be edited, filled from Beatport and saved into files from Clean alone.
- Every Health count opens a list that shows exactly that many tracks.
- All suites pass.

**Risks**: Medium. Clean's specs quote its states and its candidate headings.

**Complexity**: **L**, in two parts. **PAGES-07A**: CLN-1…CLN-12. **PAGES-07B**: the Fix values tab,
the match window and Health's links (FLW-12…14).

---

## PAGES-08 — Discover

**Objective**: Discover says what it is for, in words a DJ uses, and leads to the pages it holds.
This is DEC-130's review, applied: each of the page's 21 parts kept, changed or removed as the user
marked it.

**User-visible result**: an intro line; the tabs are **New search**, **Results** and **Wantlist**;
the token banner explains the token and how to get one; resolving is plain and automatic after a
match; charts are explained and their dates folded away; "owned" is explained once, with one switch
and one count line; "Push" becomes **Make a Beatport playlist…**; "Found in" becomes "Why it's here";
artist and label names are links, and artist pages never show a bare id; Similar tracks reads as
"Mixes well"; a card points to the artist, label and similar pages; a running search is explained on
the page.

**Dependencies**: PAGES-03, PAGES-15 (the key Similar tracks reads).

**Proposals carried**: DSC-1…DSC-12, with DSC-2's tab names superseded by FLW-15 below, and the
inventory's keep, change or remove for each part (`PHASE14_REVIEWS.md`, Discover).

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-3, FLW-15 and FLW-16. FLW-15
supersedes DSC-2's tab names: there is no "New music" tab, and "Run" is still never shown.
- **New search** holds what DSC-2 called "Look for new music": the form, the charts (DSC-5) and
  **Start looking**, which opens Results on the new search. Its empty text: "Pick artists, labels or
  charts, then press Start looking."
- **Results**: past searches on the left, each "Search of {date}" (DSC-2's words) with **Delete this
  search…** on its row; the chosen search's tracks on the right, under a "What it looked for" line.
  With no search yet it says "No searches yet" with **New search**; otherwise the newest is chosen.
- **Wantlist**: as today, with DSC-6's "In your library: Any / No / Yes" filter. Its empty text says
  "Add tracks from Results or an artist page", not "Select tracks in a run".
- **Owned tracks** (DSC-6, FLW-15): one switch, "Hide tracks already in your library", with the same
  words and the same default, on, on Results and on artist and label pages. The Wantlist keeps its
  three-way filter, set to Any, so a wanted track bought since still shows, marked "In your library":
  it is the user's own list.
- **Result actions** are always visible. Those that need rows are disabled with their reason until
  rows are selected. **Make a Beatport playlist…** stays enabled with nothing selected and then uses
  every row shown, as Push does today (`beatportActions.ts:60-79`); its label stays the same, and the
  hint beside it says "All 48 shown" or "3 selected".
- **Links** (FLW-16): artist and label names in the result and wantlist tables are links, reached by
  Tab within the row; Enter on the row still selects it. DSC-11's card points at those links and at a
  track's Similar tracks in Track details, not at a right-click.
- **DEC-130's inventory** is re-marked against the three tabs in this step's outcome: each part DSC-2
  renamed now lives in New search or Results, and keeps the user's keep, change or remove.

**Design**:
- **"Run" stays the engine's word.** Only what the user reads changes; routes, job types and stored
  rows keep "run" (fact 3).
- **Resolving on its own** (DSC-4) starts the existing resolve job when a Clean match finishes and a
  token is set, through the job store's end listener (`JobStore.add_listeners`,
  `src/cuepoint/engine/jobs.py`). Without a token it does nothing.
- **An artist page's title** (DSC-9) falls back to the library's most common spelling of the
  artist, then "Unknown artist", never "Beatport artist 12345". The engine's entity response gains
  `display_name`.
- **One "owned" default** (DSC-6): as above; the Wantlist is the one exception.
- **The selected-track store** (PAGES-03) is set from a selected result row, with Beatport's key,
  so the header's wheel lights it (DEC-157).
- **The key words** (fact 2) are written here: "Same key", "Next key", "Relative key"; Similar
  tracks' "Mixes well (next key)" uses them.

**Tests**:
- `DiscoverScreen.test.tsx`, `discoverPure.test.ts`, `EntityScreen.test.tsx`, `similarReasons.test.ts`:
  the accepted words, the fallback title, the shared default.
- Engine: a finished Clean match with a token starts one resolve; without one, none.
- `e2e/discover.spec.ts` and `e2e/discoverPages.spec.ts` pass with the new names.

**Acceptance criteria / DoD**:
- Every part in the inventory is as the user marked it, on the three tabs.
- Artist and label pages are one click from every Discover table, and the card says where Similar
  tracks is.
- All suites pass.

**Risks**: Medium. Discover's specs quote "Run" throughout.

**Complexity**: **M**

---

## PAGES-09 — Prepare

**Objective**: Prepare can start a second Set, says what its times and checks mean, and points at the
panel beside it rather than away from the page.

**User-visible result**: **New Set ▾** in the header; buttons for the selected entry; In and Out
typed in the table; one empty-Set message pointing at the Library tab beside it; "No times planned
yet" until a time is typed; "Mix in", "Mix out", "Starts at", "Plays for"; one word, "Accept", for a
warning; "Files not checked — check now"; Suggestions' "Fit" out of 100; plain key and loudness
words; the transition strip names the keys and tempos; the insertion line above the tabs; Notes and
View as buttons; chapters explained; waiting waveforms explained in place.

**Dependencies**: PAGES-03, PAGES-04 (the waveform words), PAGES-08 (the key words, fact 2),
PAGES-15 (the key).

**Proposals carried**: PRP-1…PRP-12. PRP-13 (Prepare in Getting started) is built in
PAGES-11.

**From the walkthrough** (`PHASE14_FLOWS.md`, accepted by DEC-199): FLW-17 to FLW-19.
- **The entry buttons** (FLW-17): Move up, Move down (also Alt+↑ and Alt+↓, as in the queue), Start
  a chapter here, Repeat after and Remove (also Delete, as in the queue). They are always shown and
  disabled with "Select an entry" until one is (DEC-209). With several entries selected they move and
  remove them together; Start a chapter here uses the first. A chapter heading gets Edit, Move up,
  Move down and Delete, so no chapter action is right-click only. The buttons sit on the Set's
  existing second header line (PREP-10: the counts and View ▾), not on a new row. Drag, double-click
  and right-click keep working.
- **In and Out in the table** (FLW-18): today's read-only In and Out columns
  (`prepareColumns.tsx:59-74`) become editable. A click on the cell, or Enter or F2 on a selected
  row, starts editing; double-click on the row still plays. Enter or Tab saves and moves on, Escape
  cancels. The rules and messages are Track details' "In this Set", which keeps its fields; a refused
  time's message shows in words on the facts line, naming the entry, not only as a shake, so no row
  changes height. PRP-3's hint says "type its In
  and Out in the table".
- **The strip's caption** (FLW-19): "8A → 9A · next key up · 124 → 126 BPM (+1.6%) · Out 5:30 → In
  0:45", in fact 2's words. A warning shows as a sentence at the end of the caption's line, with
  Accept beside it; the strip does not grow a line for it.
- **Keys** come from PAGES-15. A missing key is not a warning: `set_analysis.py`'s `key_unknown`
  stops counting among "N warnings" and stops asking to be accepted. The strip says "No Beatport key:
  key not checked", and the facts line says once "N entries have no Beatport key" with **Match
  tracks…** (Clean's window, those entries passed in). A key warning accepted under Rekordbox's key
  is asked again if Beatport's key still clashes, since what was accepted was a different pair of
  keys (DEC-106).

**Design**:
- **New Set from the header** (PRP-1) opens the dialogs already mounted at
  `PrepareScreen.tsx:1037`.
- **"Check now"** (PRP-6) starts Clean's file check, the same job **Check every file** starts.
- **The table's height** stays DEC-112's: everything new sits on lines Prepare already has (the
  header's second line, the facts line, the strip's caption). `e2e/prepare.spec.ts` re-measures at
  1.5× on Linux and Windows, and the Set keeps at least five whole rows, with the strip's and the
  player bar's counts recorded. If it cannot, the step stops and raises it.
- **The selected-track store** (PAGES-03) is set from the Set and the source panel.
- **Files**: besides the screens, `src/cuepoint/core/set_analysis.py` and `setWarnings.ts` for the key
  notice.

**Tests**:
- `PrepareScreen.test.tsx`, `prepare.test.ts`, `SourcePanel` tests: the accepted words, New Set from
  the header with a Set open, the check started from the facts line.
- `e2e/prepare.spec.ts`, `prepareJourney.spec.ts` and `prepareSource.spec.ts` pass with the new
  names.

**Acceptance criteria / DoD**:
- A second Set can be made without leaving Prepare.
- A Set can be ordered, chaptered and timed with buttons and typing alone.
- All suites pass.

**Risks**: Medium. Prepare's height has no row to spare.

**Complexity**: **L**, in two parts. **PAGES-09A**: PRP-1…PRP-12. **PAGES-09B**: the entry buttons,
In and Out in the table, the strip's caption and the key notice (FLW-17…19).

---

## PAGES-10 — The Camelot Wheel

**Objective**: DEC-133's wheel: a pixel-art Camelot wheel behind a header button, lit for the track,
filtering the Library on a click.

**User-visible result**: A wheel button sits beside search on every page. It opens a pixel-art
wheel of the 24 keys. The selected track's key (or, with nothing selected, the playing track's) is
lit, and so are the keys that mix with it by DEC-096's rule: the same number one step either way,
and the relative key. A caption names the track and its key. Clicking a key opens the whole Library
on all tracks in that key: the click replaces the search, the rules, the quick-filter chips and the
open playlist or Collection (DEC-160), and each key's name says so ("9A: show every 9A track in the
Library"). With no track, the wheel shows no lit key and says "Select or play a track to light its
key." The player bar's key opens the wheel lit for the playing track, captioned "Playing: …".

**Dependencies**: PAGES-03 (`ShellHeader`, the selected-track store), PAGES-05 (the one Key field a
click filters on), PAGES-15 (the key). The pages that feed the store (PAGES-05, 07, 08 and 09) come
first, so its tests cover each.

**Proposals carried**: BAR-5 (the player bar's key opens the wheel) and HDR-4 (its place beside
search, DEC-133).

The wheel reads PAGES-15's key. A selected track with no Beatport key lights nothing and says "This
track has no Beatport key yet", with **Match on Beatport**, even while a keyed track plays: the
selection wins (DEC-157). The segments stay clickable. If no track in the library has a key yet, the
wheel says so, with **Match tracks…**. PAGES-16 reuses the drawing.

**Design**:
- **The engine answers what mixes,** so the renderer keeps no copy of the rule (DEC-133). A new
  read route, `GET /api/v1/library/keys/compatible?key=<any notation>`, parses the key
  (`override_values.parse_key`), applies `compatible_keys` and `key_relation`, and answers:

  ```json
  { "key": "8A",
    "wheel": [ { "code": "8A", "relation": "same" }, { "code": "9A", "relation": "adjacent" },
               { "code": "7A", "relation": "adjacent" }, { "code": "8B", "relation": "relative" } ] }
  ```

  An unparseable key answers 400 with the envelope. The six contract files move together.
- **The filter is the Library's own** (DEC-133): a click navigates to `/library` with
  `libraryRulesState` holding one rule, "Key is 9A", on PAGES-05's normalized Key field, which finds
  the key in any notation, so no list of spellings is needed (fact 5); as Health's links do
  (`HealthView.tsx:144`). The click replaces the Library's whole view (DEC-160); there is no "All lit
  keys" button, and the Library's Key ▾ can add the other lit keys.
- **Which track:** from the header, the selected one, else the playing one (DEC-157), read from
  `useSelectedTrack()` (fact 4) and `selectCurrentItem`; from the player bar's key (BAR-5), the
  playing one.
- **The picture** is drawn in the pixel style: 24 segments in two rings (A inside, B outside) on the
  app's size, 1.5× included (its cells are whole CSS pixels there, as the icons' are), using theme
  tokens for lit, compatible and unlit, so every theme and custom theme colors it. It is a `role="dialog"` popover anchored to the button, positioned like search's panel
  so the page does not reflow, closed by Escape, an outside click or the button.
- **Keyboard**: the button is reachable by Tab; inside, the arrow keys move round the ring, ↑ and ↓
  switch rings, and Enter filters. Each segment is a button named "8A, A minor, compatible".
- **Motion** opens it under `entrance`, and lights segments under `state` (PAGES-12).

**Tests**:
- Engine: the route for each relation, for each notation the app parses, and for an unparseable key.
- `CamelotWheel.test.tsx`: the lit set for a track, the caption, the empty state, keyboard movement,
  and the navigation a click makes.
- `selectedTrack` integration: selecting a track on each page lights its key.
- `e2e/camelotWheel.spec.ts`: a fixture whose accepted matches carry keys in two notations ("9A" and
  "E Minor") and one user correction; select a track in 8A, open the wheel, click 9A, and the Library
  shows exactly the 9A tracks in both notations, and never a track whose only 9A is Rekordbox's. The
  player bar's key opens the wheel on the playing track.
- The desktop contract test covers the route and the bridge method.

**Acceptance criteria / DoD**:
- From any page, the wheel lights the right keys for the selected or playing track, and a click
  filters the Library to every track in that key, in any notation.
- A track with no Beatport key lights nothing and says why.
- The renderer contains no copy of DEC-096's rule.
- All suites pass.

**Risks**: Low. The rule and the filter already exist; this joins them.

**Complexity**: **M**

---

## PAGES-11 — The First-Run Guide

**Objective**: DEC-132's short first-run guide: a few screens that get a new user from nothing to an
imported library, and say where everything is.

**User-visible result**: on first launch, a five-screen guide (Welcome; getting the collection out
of Rekordbox, with **Show me how**; importing it, with **Import your Rekordbox collection…**;
matching, "Keys, genres and labels come from Beatport: match your tracks in Clean", with **Match
tracks…**; finding your way around, including Keys, Prepare, how to play, and the work that runs in
the background) that a stray click cannot end; Help → Getting started always opens it at the start;
the empty Library shows a first-steps checklist that ticks itself (import, match your tracks, play a
track, add your Beatport token). Someone who updates sees one note on what changed.

**Dependencies**: PAGES-03 to PAGES-10, PAGES-15 and PAGES-16, whose words it quotes.

**Proposals carried**: RUN-1 (the guide, with PRP-13's Prepare screen), RUN-2 (the three defects),
RUN-3 (the checklist, from LIB-2's words, with "Match your tracks" added for DEC-201), RUN-4 (the
user guide's onboarding facts).

**Design**:
- **Built on `OnboardingDialog`,** its storage key (`cuepoint-onboarding-complete`) and its Help
  entry, so a user who finished the old tour does not see the new one.
- **The defects** (fact 9) are fixed (RUN-2).
- **For someone who updates** (DEC-207): a person who finished the old tour sees, once, a
  one-screen note on the first start of this version: "CuePoint is now Medium size (1.5×)", with
  **Change size**, shown only to someone who never chose a size (PAGES-14); and "Keys now come only
  from Beatport. N of your tracks have one.", with **Match tracks…**. Its own key,
  `cuepoint-phase14-note-seen`, guarded like the others. Phase 16's "What's new" (DEC-172) takes over
  from the next update.
- **Import from the guide** closes it and opens the Library's import through a location-state
  opener, `libraryImportState()`, beside `libraryRefreshState` (`libraryLink.ts`).
- **The guide's pictures** are pixel icons and crops drawn with `PixelIcon`, not screenshots, so a
  theme change does not leave them stale.

**Tests**:
- A new `OnboardingDialog.test.tsx`: reopening starts at step 1; Escape and the backdrop do not mark
  it done; storage that throws does not break it; **Import your Rekordbox collection…** navigates with
  the opener; **Match tracks…** opens Clean's window.
- The note for someone who updates: shown once, only with the old tour finished; the size line only
  with no stored size.
- `FirstSteps.test.tsx`: each item ticks from real state, and the list hides once all are done.
- `e2e/firstRun.spec.ts`: a fresh install shows the guide, its import action reaches the Library's
  import, and a second launch does not show it.

**Acceptance criteria / DoD**:
- A new user can go from first launch to an imported, matched library from the guide alone.
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

**Dependencies**: PAGES-02 to PAGES-11, PAGES-14 to PAGES-16.

**Design**:
- **Where each kind is used** (the minimum; the step may add more where the same rule applies):

  | Kind | Built on |
  | --- | --- |
  | Microinteractions | button press, switch and checkbox toggle, star rating, the "Saved" tick (SET-10) |
  | Interaction animations | a dragged row's lift and settle, the drop marker (BAR-8), resize handles |
  | State transitions | a badge or state changing, a collapsible section (INS-3), the wheel's lit keys and the Keys page's counts |
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
- **The scroll checks, every kind on:** `e2e/waveformPlaces.spec.ts:390` (no long task over 50 ms,
  5,000 rows); `e2e/libraryBrowse.spec.ts:270` with `CUEPOINT_E2E_MEMORY=1` (50,000 rows), which
  gains the same long-task probe; and `scripts/bench_library.py`, unchanged from Phase 13's
  numbers. The two renderer checks run at 1× (33px rows, the most rows on screen, the heaviest case)
  and at 1.5×, the default. Results recorded in `docs/user-guide/performance.md`.
- With each kind off and under reduced motion, nothing that was shown is lost (PAGES-02's still
  states).

**Acceptance criteria / DoD**:
- Every kind exists, obeys its switch and the system setting, and moves in whole pixels at 1×,
  1.5×, 2× and 3×; every fade is smooth; a kind turned off hides nothing.
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

**Proposals carried**: FLW-1 (as narrowed) and FLW-2, as checks across the app.

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
- A new `e2e/visiblePlaces.spec.ts`: one check per row of the "gets a visible place" table, reaching
  the control with the keyboard and using it; and for each function FLW-2 names, its one home and the
  links to it.
- `userWords.test.ts` (PAGES-03) passes over the whole renderer.

**Acceptance criteria / DoD**: the phase-level acceptance below.

**Risks**: Low.

**Complexity**: **M**

---

## PAGES-14 — A 1.5× Size, and It Is the Default; Table Rows That Follow the Size

**Objective**: The size setting offers 1×, 1.5×, 2× and 3×, a fresh install opens at 1.5×, and the
pixel style stays as sharp at 1.5× as at the whole sizes (DEC-161). Table rows grow with the size,
as `--row-height` always meant them to; today they are 36px at every size (finding 9).

**User-visible result**: Settings → Appearance → **Size of text and controls** lists "Small (1×)",
"Medium (1.5×) — default", "Large (2×)" and "Extra large (3×)". Someone who never chose a size opens
the app at 1.5×. In the default 1,280 × 800 window the Library shows whole rows where at 2× today it
shows none without scrolling (four at 1.5× with rows stuck at 36px; the step re-measures with the
fixed rows, and PAGES-05 holds the number). Someone who chose 1×, 2× or 3× keeps it. Every table's rows are as
tall as the size says (50px at 1.5×), so the text in them is never cut at 3×.

**Dependencies**: PAGES-01 (the Size control and SET-4's words). Nothing else.

**Proposals carried**: SET-4's options (amended by DEC-161).

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
  holds. At 2× the Set falls to four, below that floor. DEC-112 holds the rows "at the default window
  size and scale", so its floor moves with the default, now 1.5×; someone who picks 2× chooses bigger
  rows over more of them, and a note on DEC-112 records it (2026-10-08). The player bar's counts were
  already below five at 2× (four held) and stay recorded, not floored, as DEC-112's 2026-09-29 note
  has them. This table was measured on Linux without PAGES-09's additions; Windows has measured a row
  fewer before (`prepare.spec.ts:58`), so PAGES-09 re-measures on both. The spec's held counts are
  re-measured at 1.5× and the 2× numbers recorded in the step's outcome.
- **Who moves to 1.5×.** The size is stored only when someone picks one (`tokens/scale.ts:30-38`), so
  everyone who never picked opens at 1.5× after the update, and someone who picked 2× keeps it, as
  DEC-161 says. PAGES-11's note for someone who updates tells them (DEC-207).
- **The row-height defect first.** Its fix lands in its own commit with a regression test that fails
  on today's code (`trackTableLayout.test.ts` reading a registered length), before the size
  changes, so each change's effect on the measured rows is known apart.
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
match in Clean. Keys show in Camelot ("8A") everywhere in the app; Track details adds the name
("8A · A minor").

**Dependencies**: none. It changes only the key readers that exist today.

**Built on by**: PAGES-05 (the quick filters, search and Key field use its resolver), PAGES-11 (the
guide's words), and PAGES-07, PAGES-09, PAGES-10 and PAGES-16, which read it.

**Proposals carried**: FLW-22 (the user's, DEC-201). FLW-6's one Key field is PAGES-05's, built on
this step's resolver.

**Design**:
- **One rule, in the engine.** Today the key is `effective_value(tracks.key, meta.key)` and the SQL
  `COALESCE(meta.key, tracks.key)` (`models/track_metadata.py:293`, `models/filter_rule.py:480`,
  DEC-068). Key gets its own resolver: `COALESCE(meta.key, accepted.key)`, where `accepted` is the
  `match_candidates.key` of the track's accepted match (`migrations/m0012_match_similarity.py`).
  BPM, genre, label and year keep DEC-068's rule.
- **Every reader that exists today moves together.** In the engine: the filter field
  (`filter_rule.py`); `track_repository.py`'s row read; `track_query.py`'s queue projection and sort
  entries (`:722-728`, `:814`, `:835`); `set_repository.py:104` (Prepare's entries and lanes);
  `set_analysis_service.py`; `set_suggestion_service.py`; `similarity_service.py` and
  `similarity_repository.py` (`:55-61` and `spellings()`); `set_list_service.py`;
  `metadata_service.py`; `match_comparison.py:200,217` (Review's Key row then shows Beatport's key
  against Rekordbox's, labelled so); `match_apply.py` and the batch apply (the key leaves them);
  `health_service.py`'s `missing_key` ("No Beatport key"); the export's
  `rekordbox_export_values.effective_key`; and `file_write_repository.py`. In the renderer, every
  fallback that would bring Rekordbox's key back when a track has none: `discover/entityFormat.ts:126`
  (`effective_key ?? key`), `library/useLibraryPlayback.ts:35`, `shell/useLibrarySearch.ts:120` and
  `clean/comparison.ts:83`. An engine test lists every reader, and a renderer test fails on a track
  row's `.key` read outside an allow-list, so a new one cannot read Rekordbox's key by mistake.
- **How a key is written.** Beatport sends keys as text ("A Minor", "F♯ Major"); a correction is
  stored as typed. The resolver normalizes both with `override_values.parse_key`, and the API sends
  the Camelot code with the key's name. The app shows Camelot everywhere, the wheel's notation, and
  Track details adds the name. A key that cannot be parsed counts as none and is logged. The export
  keeps writing the notation DEC-089 sets; detecting it from Rekordbox's file
  (`key_notation_counts`) reads the file's format, not its key values, so it stays.
- **Writing never blanks a key.** Export to Rekordbox and Save changes into the files write the key
  where there is one, and leave the existing key in Rekordbox or in the file untouched where there
  is none.
- **Applying is no longer needed for the key.** Key leaves "Use Beatport's values" and Review's
  apply, in the engine (`match_apply.py`) as well as on screen, since accepting already gives it.
- **Which accepts count** (DEC-202): every accepted match, the automatic ones (DEC-067's
  score of 95 or more) included. An automatic accept is not sticky, so a re-match can change a key;
  the change is recorded in History like any other value's.
- **A key applied from a match before this change** (DEC-203) follows its match like any
  Beatport key. History already records whether a value was applied from a match or typed, so an
  applied-from-match key is read as Beatport's and a later reject takes it away; a typed one stays a
  correction. Nothing stored is deleted, and History keeps both.
- **A rejected or cleared match** takes its key away with it, on the next read.
- **Matching itself is unchanged.** Matching uses no key today: the matcher's key bonus is always 0,
  since nothing passes it a key (`matcher.py:167,373`), and Review's "Key bonus" row always reads 0.
  It stays so, and CLN-5 folds that row away with the rest of the scoring.
- **The API.** A track row's `effective_key` becomes this key (null when there is none) and gains
  `key_source` ("yours", "beatport" or null) and `key_name`. The row's `key` stays the imported value,
  Rekordbox's, as it is today, so no field changes meaning. The contract files move together.

**Tests**:
- Resolver unit tests: yours beats Beatport; Beatport with no correction; neither gives none; a
  rejected match gives none.
- `filter_sql` tests: "Key is 8A" matches a Beatport "Am" and never a Rekordbox-only 8A.
- Export and tag-writing tests: no key leaves the target's key as it was.
- Set checks and Similar tracks skip a track with no key and say so; Prepare does not count it as a
  warning.
- An automatic accept gives its key; a reject takes it away; a key applied from a match before the
  change follows the match, and a typed one stays.
- The renderer guard: no `?? key` fallback to the imported key.
- Health counts "No Beatport key".
- An e2e run: import a fixture whose tracks have Rekordbox keys and no matches, and see "No Beatport
  key"; accept a fixture match and see its key in the table, the wheel and Prepare.

**Acceptance criteria / DoD**:
- No screen, filter, count, check or export uses Rekordbox's key, except the "Key from Rekordbox (not
  used)" filter field and the labelled display of it in Track details and Review.
- The guard tests list every key reader, engine and renderer.
- All suites pass.

**Risks**: Medium. A library that has not been matched shows no keys at all. That is DEC-201's
choice; PAGES-05's empty states, PAGES-11's matching screen and checklist item, and the note for
someone who updates explain it.

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

**Dependencies**: PAGES-03 (the sidebar and the store), PAGES-05 (the "In playlist" rule, FLW-7, the
quick filters and the selection bar, FLW-8), PAGES-10 (the wheel's drawing and the compatible-keys
route), PAGES-15 (the key).

**Proposals carried**: FLW-21 (the user's, DEC-200).

**Design**:
- **The route** `/keys`, its own sidebar entry at the top level, after Library and its nested
  Collections: DEC-156 nests Collections because it is the Library's own tree, and Keys is a page of
  its own, as DEC-200 asks. It joins the navigation registry (DEC-020, with a dated note) with a pixel
  icon, NAV-1's description line ("The keys in your playlists, Collections and Sets"), NAV-2's
  tooltip, a row in the Shortcuts list, and NAV-5's dimming before the first import.
- **The engine counts.** A read route, `POST /api/v1/library/keys/population`, takes the sources
  (`{kind: "all" | "playlist" | "collection" | "set", id}`) and answers `{total, keys: [{code:
  "8A", count}], no_key}`. A track in several sources counts once. Codes are Camelot, from PAGES-15's
  key. The six contract files move together.
- **The wheel is PAGES-10's,** drawn in a counts mode; one component, two uses. The list beside it
  is the accessible reading of the same numbers.
- **The tracks** are an ordinary track table whose rules are "Key is any of …" and "In playlist is
  any of …" (PAGES-05's fields), so "Open in Library" and "Save as Smart Collection…" are the
  Library's own (FLW-7). Its selection bar is the Library's, and selecting a track sets the
  selected-track store, so the header's wheel lights it.
- **The Library's Key ▾ links here**: this step adds "See these on the Keys page" to PAGES-05's Key
  list, opening Keys with the Library's open playlist or Collection ticked.
- **Phase 15's key spread** uses this page (DEC-206): its Statistics summary opens Keys
  with the same sources, and STATS-06 reuses this counts mode rather than adding a second.
- **Remembered**: the ticked sources, in `localStorage` under `cuepoint-keys-sources`, guarded like
  `scale.ts`.
- **Empty states**: no library ("Import your Rekordbox collection first"); no Beatport keys yet
  ("Keys come from Beatport. Match your tracks in Clean.", with **Match tracks…**); sources that hold
  no tracks ("These playlists are empty").
- **One home** (FLW-2): the Library's Key quick filter stays as an in-place filter and links here.

**Tests**:
- Engine: counts for one and several sources, a track in two sources counted once, `no_key`, and an
  unknown source refused with the envelope.
- Renderer: the source picker, the counts list in Camelot order, multi-key selection, the
  compatible-keys light, and the Smart Collection it saves.
- `e2e/keys.spec.ts`: tick two playlists, read the counts, click a key, play a track from the list.

**Acceptance criteria / DoD**:
- The keys of any mix of playlists, Collections and Sets are one click away from the sidebar, and
  every count matches the Library filtered the same way.
- Every count is written on the page, never on hover alone.
- All suites pass.

**Risks**: Low. The counting is a grouped read over indexed columns; it is measured on the 50k
fixture with `bench_library.py`.

**Complexity**: **L**

---

## Phase-level acceptance

Phase 14 is complete when, in a **packaged build** on Windows and macOS:

1. Every accepted proposal is built, and no rejected one. Each review's marks are recorded in
   `PHASE14_REVIEWS.md` and `PHASE14_FLOWS.md`. *PAGES-01 to PAGES-16.*
2. Discover's 21 parts are each as the user marked them (DEC-130). *PAGES-08.*
3. No user-visible string the reviews quoted for change is left unchanged where its proposal was
   accepted, no string says "engine" or "job", and the user guide quotes the app as it is. *PAGES-01
   to PAGES-11, PAGES-13 to PAGES-16.*
4. From a fresh install, the first-run guide leads to an imported, matched library, and someone who
   updates is told once what changed. *PAGES-11.*
5. From any page, the wheel lights the selected or playing track's key and its compatible keys by the
   engine's rule, and a click filters the Library to that key in any notation; the player bar's key
   opens it on the playing track; a track with no Beatport key lights nothing and says why.
   *PAGES-10.*
6. All ten kinds of motion exist, each behind its switch, in whole-pixel steps with smooth fades;
   reduced motion stops them all; no motion delays input. *PAGES-02, PAGES-12.*
7. The scroll checks pass with every kind on. *PAGES-12.*
8. The defaults are the user's, recorded as an amendment to DEC-134. *PAGES-13.*
9. Every key the app shows, filters, counts or checks is the user's or Beatport's, never
   Rekordbox's, and the Keys page counts any mix of playlists, Collections and Sets. *PAGES-15,
   PAGES-16.*
10. A fresh install opens at 1.5×, no hairline lands on half a pixel at any size, and table rows are
    as tall as the size says; the Library and Prepare hold their measured rows at 1.5×. *PAGES-14,
    PAGES-05, PAGES-09.*
11. Every action in the narrowed FLW-1 table has a visible place and works from the keyboard; each
    function FLW-2 names has one home; action bars never appear or vanish under the user. *PAGES-13.*
12. Every suite passes, with the engine smoke check, the desktop contract test, the coupling check, the
    end-to-end suite and `npm run dist`.
13. No decision in DEC-001…DEC-209 is contradicted, except where
    this document says so and the decision carries a dated note: DEC-201's change to DEC-004,
    DEC-067, DEC-068, DEC-070, DEC-079 and DEC-106 for the key; FLW-8's to LIB-6; FLW-11's to DEC-087's
    2026-09-21 precision; the Keys page's addition to DEC-020's registry; DEC-161's to DEC-135, DS-2
    and DEC-112's default; and FLW-7's field in DEC-162. A contradiction stops the work and is raised
    rather than worked around.

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

## Decision Round 22 — what the full review raised

Asked in `OPEN_QUESTIONS.md` as Q-200…Q-207 and answered 2026-10-08: the user took every
recommendation.

| Question | Outcome | Needed by |
| --- | --- | --- |
| Q-200 — Do automatic accepts give the key? | DEC-202: every accepted match does | PAGES-15 |
| Q-201 — Keys applied from Beatport before this phase | DEC-203: they follow the match | PAGES-15 |
| Q-202 — Two menu bars | DEC-204: one, the system's (File, Edit, View, Help) | PAGES-03 |
| Q-203 — Where values are edited | DEC-205: one editor; Track details for one track, Fix values for many | PAGES-06, PAGES-07 |
| Q-204 — Statistics' key spread and the Keys page | DEC-206: the Keys page is the one home | PAGES-16, Phase 15 |
| Q-205 — Telling someone who updates | DEC-207: a one-time note | PAGES-11 |
| Q-206 — The Rekordbox refresh button's name | DEC-208: "Check Rekordbox for changes" | PAGES-05 |
| Q-207 — Action bars with nothing selected | DEC-209: always shown, disabled with a reason | PAGES-05, PAGES-08, PAGES-09 |

## What the later phases pick up from this one

Their documents were written before DEC-199…DEC-209. Each change below is now made in that phase's
own document (2026-10-08), under a dated note at its top or in the step concerned:
- **Phase 15** (`PHASE15_STATISTICS.md`): fact 3's key is PAGES-15's, and "No key" reads "No
  Beatport key"; STATS-02's playlist field is FLW-7's "In playlist", one field with one label
  (DEC-162 as amended); STATS-06 reuses PAGES-16's counts mode, with counts written on the page, not
  on hover only, and its key spread opens the Keys page (DEC-206); there are four sizes, not three;
  the Health tab is settled (DEC-163).
- **Phase 17** (`PHASE17_WEBSITE.md`): the token generator resolves `round()`, `max()` and
  `@property` (PAGES-14); matching is Clean's, not Discover's; the page list and the shots gain Keys;
  the showcase fixture's keys come from stubbed accepted matches, or its wheel lights nothing; the
  site's reduced motion stops fades too, as the app's does (PAGES-02).
- **Phase 18** (`PHASE18_HARDENING.md`): Backups joins PAGES-01's sections, before About & updates
  (DEC-179); HARDEN-08's accessibility pass covers the new toolbars, the menu bar and the Keys page.

## Deferred, with reasons

- **Library health in Statistics.** Settled by DEC-163: Clean keeps its Health tab, and Statistics
  shows a summary.
- **Like and dislike on Discover.** Declined by DEC-130.
- **Sidebar count badges.** NAV-4 was declined (DEC-159).
- **Screenshots in the first-run guide.** Pixel drawings instead, so themes do not stale them
  (PAGES-11).
- **"What's new" after an update.** Phase 16's (DEC-172); until then, PAGES-11's one-time note.
