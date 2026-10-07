# CuePoint — Evolution Roadmap

Status: **Phases 0, 1, 2, 3, 4 and 6 complete. Decision Rounds 1–16 resolved (DEC-001…DEC-153); Round 17 resolved (DEC-154…DEC-160); DEC-161 adds a 1.5× default size.**

Phase numbers follow the order of implementation (DEC-146):
- **Phases 0–11** are implemented.
- **Phase 12** is the cleanup.
- **Phases 13–17** are error reporting, the pages revisited, statistics, distribution and the
  website.
- **Phase 18,** Production Hardening, is v1's last phase.
- **Phases 19 and 20** are future releases (DEC-125).

Phase 12 is specified (`PHASE12_CLEANUP.md`), and so are Phase 13 (`PHASE13_REPORTING.md`) and Phase 14
(`PHASE14_PAGES.md`, with its page reviews in `PHASE14_REVIEWS.md`); Phases 15 to 18 are not yet. PRUNE-01 is implemented
(2026-10-06): the audit is `PHASE12_AUDIT.md`, and the user approved every group of it the same day.
PRUNE-02 is implemented (2026-10-06): Qt is removed, and `scripts/check_no_qt.py` keeps it out.
PRUNE-03 is implemented (2026-10-07): no unreached Python module remains but the migrations.
PRUNE-04 is implemented (2026-10-07): the retired app's workflows and every script nothing runs are gone.
PRUNE-05 is implemented (2026-10-07): no Electron or renderer file, export or class is unreached.
PRUNE-06 is implemented (2026-10-07): every dependency left has a live importer.
PRUNE-07 is implemented (2026-10-07): 250 docs became 135, each checked against the code.
PRUNE-08 is implemented (2026-10-07): a guard in CI keeps dead code out, and Phase 12 is complete in
code; a Windows and macOS run is owed.
Phase 11 is specified in `PHASE11_WAVEFORMS.md` (WAVE-01…WAVE-08), unblocked by Decision Round 13
(DEC-113…DEC-123); WAVE-01 to WAVE-08 are implemented, WAVE-08 (loudness, DEC-124, which
supersedes DEC-121) the last. Phase 11's acceptance is met on Windows, in the
development build; the packaged runs (Linux with `CUEPOINT_MPV_PATH`, Windows and macOS) and the macOS
decoder timings are owed. It started with Phase 5's manual acceptance still owed, as the user decided
(DEC-119).
Phase 10 is specified in `PHASE10_PREPARE.md` (PREP-01…PREP-12), unblocked by Decision Round 12
(DEC-102…DEC-112); all twelve steps are implemented. Phase 10's acceptance is met on Linux, in the
development build and a packaged one; the packaged Windows and macOS runs are owed, with Phase 5's
acceptance.
Phase 9 is specified in `PHASE9_DISCOVER.md` (DISCOVER-01…DISCOVER-12), unblocked by Decision Round 11
(DEC-090…DEC-101); all twelve steps are implemented and DISCOVER-01's spike is recorded. Phase 9's
acceptance is met on Windows; the macOS packaged checks and one manual pass through the app
against the live API are owed.
Phase 2's ten steps are implemented and recorded in `PHASE2_SHELL.md`. Phase 3's twelve steps are
implemented and recorded in `PHASE3_LIBRARY.md` (LIBRARY-01…LIBRARY-12), unblocked by Decision
Round 5 (DEC-030…DEC-037). Phase 4's ten steps are specified in `PHASE4_LIBUI.md`
(LIBUI-01…LIBUI-10), unblocked by Decision Round 6 (DEC-039…DEC-048). Complete: every step is
implemented and the phase-level acceptance is met in a packaged build. Phase 5's twelve steps are
specified in `PHASE5_PLAYER.md` (PLAYER-01…PLAYER-12), unblocked by Decision Round 7
(DEC-049…DEC-056), and all of them are implemented; the phase is not complete, and what is left is
non-code (see below). Phase 6's thirteen steps are specified in `PHASE6_ORG.md`
(ORG-01…ORG-13), unblocked by Decision Round 8 (DEC-057…DEC-064). Complete: all thirteen steps
are implemented and the phase-level acceptance is met in a packaged build. Phase 7's fourteen steps
are specified in `PHASE7_CLEAN.md` (CLEAN-01…CLEAN-14), unblocked by Decision Round 9
(DEC-065…DEC-076); all fourteen are implemented and the phase-level acceptance is met in a packaged
Windows build, and the macOS packaged checks were run on 2026-09-23. The two open
points that document raised are settled as amendments to DEC-011 and DEC-076.
Audio-analysis scope is the one remaining deferred item, moved with Phase 19 to a future release
(DEC-125); crossfade was resolved by DEC-056 in Round 7, Smart Collection duplication by DEC-061 in
Round 8, and its direct export by DEC-081 in Round 10. This roadmap shows the shape of what's ahead;
it is not a commitment to implement anything without an explicit "Implement <STEP-ID>" instruction.

No implementation happens from this document alone — every phase step requires an explicit
"Implement <STEP-ID>" instruction, scoped to exactly that step.

---

## Phase 0 — Repository Audit ✅ Complete

Delivered: `CURRENT_ARCHITECTURE.md`, `GAP_ANALYSIS.md`, `PIXEL_DESIGN_SYSTEM.md`. No production
code changed. CuePoint behaves identically to before this phase, as required.

## Phase 1 — Foundation ✅ Complete (2026-09-02)

The most important phase — everything else builds on it.

- **FOUNDATION-01** — Architecture boundaries (formalize the service-interface gaps found in the
  audit — e.g. give `InventoryService`, `CheckpointService` etc. real interfaces; fix the two
  unguarded `QSettings` imports in `services/` that violate AGENTS.md's Qt boundary)
- **FOUNDATION-02** — Persistent database infrastructure (SQLite, per DEC-001)
- **FOUNDATION-03** — Schema migration infrastructure (per DEC-001)
- **FOUNDATION-04** — Core `Track` domain model (resolve the two-parallel-`TrackResult` problem
  found in the audit; bake in DEC-002's TrackID+path-fallback identity from the start)
- **FOUNDATION-05** — Repository/data access layer
- **FOUNDATION-06** — Application service layer
- **FOUNDATION-07** — Background job architecture (persist job records per DEC-007; generalizes
  today's match-only `JobStore`)
- **FOUNDATION-08** — Activity/event architecture, plus the per-field change-history log (DEC-008)
- **FOUNDATION-09** — Settings architecture (pay down the dual `AppConfig`/flat-`SETTINGS`
  surface found in the audit, opportunistically)
- **FOUNDATION-10** — Logging/diagnostics (largely exists — `LoggingService`, support bundle —
  audit as part of this step rather than rebuild)
- **FOUNDATION-11** — Backup infrastructure (automatic-on-launch + retention + manual restore,
  per DEC-009)
- **FOUNDATION-12** — Test infrastructure (address the audit's coverage gaps: renderer component
  tests, `incrate/` unit-test gaps, regression-test practice)
- **FOUNDATION-13** — CI quality gates (the audit found `test.yml`/`release-gates.yml` don't
  trigger on PR, and several checks are soft-failed — tighten this)
- **FOUNDATION-14** — Pixel-art design system foundation (build the small 5–10-icon pixel sprite
  set per DEC-010; otherwise mostly formalizing what already exists per `PIXEL_DESIGN_SYSTEM.md`)
- **FOUNDATION-15** — Qt updater removal (DEC-019: delete `src/cuepoint/update/` and its tests,
  update `docs/features/update-system.md`, retire the related `known-issues.md` entry). Small,
  independently schedulable — doesn't block anything else in this phase, but grouped here since
  it's a Foundation-appropriate cleanup and AGENTS.md already treats the Qt boundary as an
  invariant.

## Phase 2 — Application Shell ✅ Complete (2026-09-02)

Real navigation shell replacing the floating `app-lab-nav` pill. Decided by Round 3:

- Nav destinations come from a registry declaring the full target IA, rendering only what has
  landed (DEC-020); today's screens move under it intact as a "Tools" group, with inKey re-homed
  into Clean in Phase 7 and inCrate into Discover in Phase 9 (DEC-021).
- Sidebar has two states, expanded or icon-only rail, persisted (DEC-022) — which means drawing
  the `clean`/`discover`/`prepare` icons FOUNDATION-14 deliberately deferred.
- Global search is engine-backed over the Phase 1 `tracks` table from the start (DEC-023), so
  this phase is a desktop-contract change, not a renderer-only one.
- Track Inspector container persists across pages, is user-resizable, and is hideable; it holds
  an empty state only in this phase (DEC-018, DEC-024).
- Player region exists as a zero-height layout slot until Phase 5 (DEC-025).
- A bottom status strip plus an Activity panel give FOUNDATION-07/08's job and activity data
  their first UI, and `EngineStatusBanner` a permanent home (DEC-026).
- The app reopens on the last-visited destination (DEC-027).

Toasts/dialogs already largely exist and get reused, not rebuilt. Step specifications:
`PHASE2_SHELL.md`.

## Phase 3 — Persistent Rekordbox Library (LIBRARY-01 … LIBRARY-12) — complete

Builds on DEC-002 (TrackID+path identity), DEC-003 (delete-on-removal), and DEC-011 (refresh
warns before deleting tracks referenced by a Collection/Set — LIBRARY-08 builds that check as a
seam that answers zero until Phase 6). Turns the existing one-shot XML parse (`rekordbox.py`,
already handles nested folders) into a persistent, differentially-refreshable library.

Round 5 settled the rest: playlists are mirrored read-only (DEC-031), refresh previews before it
applies (DEC-032), import runs as a background job in the status strip (DEC-033), every useful
Rekordbox field is captured now because backfilling one later needs a re-import (DEC-034), and the
library remembers the file it came from (DEC-035). inKey and inCrate keep their own XML parsing
until Phases 7 and 9 (DEC-036), and inCrate's separate inventory database coexists until Phase 9
retires it (DEC-030) — two collection imports that can disagree, which the user docs must say.

Step specifications: `PHASE3_LIBRARY.md`.

## Phase 4 — Library UI (LIBUI-01 … LIBUI-10) — complete

Extracts a generic `TrackTable` from `ResultsTable.tsx` (DEC-041 — the results screen converges in
Phase 7) and builds the reusable filter system. Global search already exists from Phase 2, so this
phase extends that one query path (DEC-023) rather than building a second.

Round 6 settled the rest: the Library page becomes the browser instead of gaining a sibling
destination (DEC-039); rows come from the engine a window at a time, with sort and filters resolved
in SQL, because 50,000 rows will not be sorted in JavaScript (DEC-040); columns can be hidden and
reordered (DEC-042); filters *are* Phase 6's Smart Collection rule model, just unsaved (DEC-043);
the mirrored Rekordbox tree scopes the table, read-only (DEC-044); multi-selection is built before
the actions that need it (DEC-045); double-click stays inert until Phase 5 gives it DEC-012's
meaning (DEC-046); the Track Inspector finally gets content — everything imported, read-only
(DEC-047); and dense values get their own font token, closing the readability item
`PIXEL_DESIGN_SYSTEM.md` §4 has carried since the audit (DEC-048).

Step specifications: `PHASE4_LIBUI.md`.

## Phase 5 — Player (PLAYER-01 … PLAYER-12) — all steps implemented, **acceptance outstanding**

Backend is decided: **libmpv sidecar** (DEC-005), for foobar2000-grade quality — gapless, wide
lossless format support, high-quality resampling. Still the highest-uncertainty phase in
execution terms (entirely greenfield, confirmed zero existing player code, and now also a new
per-OS sidecar to build/sign/package alongside the existing Python engine sidecar).

Round 7 settled the shape. The sidecar is the official prebuilt `mpv` binary driven over JSON IPC,
supervised the way `EngineSupervisor` already supervises the engine, fetched at build time rather
than committed (DEC-049). Electron main owns the queue and the transport; the Python engine is not
told playback is happening (DEC-050), which is coherent only because playback writes nothing to
the database at all in this phase (DEC-051). The bar carries transport, seek, volume, shuffle,
repeat and a reorderable queue panel — the panel is what makes DEC-013's two append actions
visible (DEC-052) — and it stays at DEC-025's zero height until the first play (DEC-053). A
missing or undecodable file is skipped with a coalesced toast, the player being the first thing in
CuePoint to discover what DEC-037 left unchecked (DEC-054). Output device and exclusive/hog-mode
output are user-controlled, which is what turns DEC-005's quality claim into something audible
(DEC-055). No crossfade in v1 (DEC-056), closing the item deferred since Round 2.

Carried forward from Round 2: double-click plays and loads the current view as the queue
(DEC-012); "Play Next"/"Add to Queue" are the explicit append actions (DEC-013); no
position-resume across restarts (DEC-014).

PLAYER-01, PLAYER-02 and PLAYER-03 are implemented: mpv is pinned, fetched, verified and packaged,
with ADR-004 written and the format spike passing on Windows; the JSON IPC client that drives it is
written and tested against both a fake socket server and the real binary; the supervisor that
owns the process — lazy start, bounded restart, state mirroring, IPC to the renderer — plays a real
file end to end through the packaged shell and leaves no process behind; the queue behind it
plays a three-track list through unattended, gapless, by preloading the next track into mpv; a
whole view — the query the table is showing, not the rows it happens to hold — resolves into that
queue in the view's own order; the transport bar appears on first play, showing what main says
rather than what the click implied; shuffle and repeat are controls on it, remembered across
sessions and applied before anything is queued; and the queue itself is visible in a panel that
reorders, removes and jumps — read a window at a time, because the whole queue is 14.5 MB. Nothing in the UI starts playback until PLAYER-09
wires the gesture. Implementation corrected two things the plan had wrong — the
bundled build is GPL rather than LGPL, and electron-builder's `${os}` macro expands to `mac`/`win`,
not `darwin`/`win32` — and surfaced a pre-existing packaging bug that leaves the Python engine out
of packaged Windows and macOS builds. See the step's Outcome section.

The macOS pass has since been run (2026-09-06, recorded under PLAYER-12): nine of its eleven rows
are closed and the one defect it found is fixed. What keeps the phase from complete is non-code —
a notarization submission, two rows needing a real audio interface, and one row needing somebody to
listen — plus an amendment DEC-055 needs, since its premise that the bundled build has no SoX
resampler is true on Windows and false on macOS.

Step specifications: `PHASE5_PLAYER.md`.

## Phase 6 — Organization (ORG-01 … ORG-13) ✅ Complete

Collections-only per DEC-006 (no separate local-Playlist concept). Tags are flat with optional
categories, not hierarchical (DEC-015). Smart Collections are flat AND-only for v1, schema left
room for AND/OR grouping later (DEC-016). Ratings/favorites/notes/Collections/Smart Collections
are all entirely new, no existing code to reuse.

Round 8 settled the shape. CuePoint's rating, favorite and notes are their own layer beside the
Rekordbox-imported `rating` and `comment`, resolved to an effective value at read time, so a
refresh can never overwrite a user's own rating and Phase 8 still has both values to choose from
(DEC-057). A Collection is ordered and may repeat a track, matching DEC-017's rule for Sets — which
means the Collection/Set distinction now rests entirely on what Phase 10 adds, not on structure
(DEC-058). Collections and Smart Collections file into a user-editable folder tree from day one,
the same shape as the mirrored Rekordbox tree but a separate, editable table (DEC-059). The DEC-043
rule vocabulary grows past the `tracks` table to tags, CuePoint rating, favorite, notes and
Collection membership — the compiler's first joins — while a rule may never name another Smart
Collection (DEC-060). A Smart Collection stores rules and not membership: evaluated live,
duplicable, freezable into a static Collection, never hand-pinned (DEC-061), which closes the
export/duplication item deferred since Round 2. All of it is browsed in the Library page's left
pane rather than a second browser, amending DEC-020's IA (DEC-062). A batch edit applies inline
when small and as a background job when large, always writing per-field history under a shared
batch id, because DEC-008 promised revert instead of an undo stack (DEC-063). And nothing in this
phase writes outside the database — no audio-file tags, no Rekordbox XML (DEC-064).

This is also the phase that makes `references_for()` answer: DEC-011's warning before a refresh
deletes a track had returned zero since Phase 3 because nothing could reference a track yet.
ORG-04 changed that — one method body, no callers moved. ORG-05 then made DEC-057's other
promise true: the plain word "rating" means the value a user sees, in the SQL rather than in a
sentence, and the filter vocabulary reaches tags and Collection membership. ORG-06 saved that
vocabulary to a column and read it back as the same query, which is DEC-043 stated as code rather
than as a promise — and measured it: a Smart Collection scope costs 26.84 ms where the equivalent
unsaved filter costs 26.75 ms, because it is the same statement. ORG-07 then made DEC-063's batch
real — tagging 50,000 tracks takes 1.4 s, writes 50,000 history rows under one batch id and one
activity event, and is cancellable within 41 ms — and found, by being the first thing to remove
entries from a Collection that large, that closing the gaps afterwards was quadratic: 20,000
entries took 123 s and now take 37 ms. ORG-08 put all of it on the wire — twenty-two routes and
twenty-five methods across the six contract files — and gave the browse query CuePoint's own scope,
so a Collection opens in the order its owner arranged and a Smart Collection resolves to its rules,
both through the one query path DEC-023 has insisted on since Phase 2. ORG-09 drew it: the Library
pane is now two sections, CuePoint's editable tree above Rekordbox's read-only mirror, both rendered
by one extracted tree component — which is why the mirror's 41 existing tests pass against it
unchanged, and why "read-only" is now a fact about which handlers that section passes rather than a
line in a comment. ORG-10 gave the Inspector the first editable fields in CuePoint — a rating, a
favorite, a note and tag chips — in a second zone above Phase 4's imported record rather than in
place of it, so DEC-047's read-only promise is kept field for field while DEC-057's two layers stay
visibly two, each saying which one the stars are showing and what clearing would fall back to.
ORG-11 gave DEC-045's selection model something to do: one list of operations offered by the context
menu and by the toolbar's Actions button, applied through ORG-07's single entry point, confirmed
above the engine's own threshold and followed as a job past it. It also closed the gap that model
had carried since Phase 4 — "everything matching, minus the three I clicked out" now crosses the
wire as the question plus a handful of exclusions, so what the toolbar counts and what the batch
touches are finally the same tracks. ORG-12 gave the filter bar the three field kinds it had been
dropping and taught it to save what it built, with no translation step between the rules on screen
and the rules stored. ORG-13 closed the phase: the Collections destination resolves to the Library
page rather than a second browser, every empty state is rendered from a real engine response rather
than a hand-written shape, the scale claims are measured and recorded at 50,000 tracks with Phase
6's own organization on top of them, a restored backup is proved to bring Collections, tags and
metadata back together, and the whole journey runs end to end in a packaged build.

Step specifications: `PHASE6_ORG.md` (ORG-01…ORG-13, all implemented).

## Phase 7 — Clean / Beatport (CLEAN-01 … CLEAN-14) — implemented; checked on Windows and macOS

Metadata precedence settled by DEC-004 (auto-mark accepted, explicit apply step). The one phase
most dominated by "reuse, don't rebuild" —
`core/matcher.py` is mature and stays as-is; this phase is mostly persistence + review-UI +
duplicate/missing-file/health detection (all currently missing) wrapped around it.

Round 9 settled the shape. A match runs over library tracks from any scope the Library browses, as a
resumable job; XML and M3U input retire with inKey, while the CLI keeps its own (DEC-065). Every
attempt is kept with all its candidates, so a re-match adds evidence rather than replacing it
(DEC-066). An attempt auto-accepts at the matcher's existing ≥95 tier with every guard passed, and a
user's own accept or reject survives any re-match (DEC-067). Applying writes key, BPM, genre, label
and year into a CuePoint override layer that no refresh touches, with per-field and per-batch revert
— closing Phase 6's deferred revert (DEC-068) — and the same five fields can be edited by hand
(DEC-069). Writing tags into audio files stays, as an explicit previewed job that records every
value it replaces (DEC-070). inKey, Results, past searches and `ResultsTable` retire into Clean
(DEC-071), which is its own page with hooks in the Library and Inspector (DEC-072). Missing files
are found by a scan job and fixed in Rekordbox, not relocated by CuePoint (DEC-073); duplicates are
metadata groups and nothing is deleted (DEC-074); health is counts, not a score (DEC-075). Artwork
is in — read from files, fetched from Beatport for accepted matches, and embedded only into files
that have none (DEC-076, against the recommendation to defer).

Step specifications: `PHASE7_CLEAN.md` (CLEAN-01…CLEAN-14, all implemented; the acceptance is
checked point by point under CLEAN-14, on Windows, and the macOS packaged checks run 2026-09-23).
Writing them grew the placeholder by one step and raised two open points, both settled as
amendments (Q-076, Q-077):
DEC-011's refresh warning now counts every track carrying the user's own data — ratings, notes,
tags, review decisions and applied values as well as Collections — and DEC-076's artwork is cached
as real thumbnails, making Pillow a runtime dependency behind one guarded decoder.

## Phase 8 — Rekordbox Export (EXPORT-01 … EXPORT-07) — implemented; checked on Windows and macOS, the check in Rekordbox itself owed

No full-XML export exists today (only the narrow attribute-patch write) — this phase builds real
export, carrying forward the existing "always write a new file, never silently overwrite the source"
safety property. Decision Round 10 settled its shape (DEC-077…DEC-089), and the steps are specified
in `PHASE8_EXPORT.md` (EXPORT-01…EXPORT-07 — one fewer than the placeholder). Writing them found
that the legacy write path this phase was assumed to build on has no production caller at all:
CLEAN-14 retired the routes and screens above it and left the cluster standing, so EXPORT-01 deleted
it in the change that replaced it.

EXPORT-01 and EXPORT-02 are implemented: `data/rekordbox_export.py` patches the six attributes and
appends CuePoint's playlist tree in one pass over the source bytes, proved against a 50,000-track
collection whose cue points, grids and untouched tracks come through byte-identical. Both are pure
functions over files, so neither is reachable from the UI until EXPORT-07 wires the entry points.

EXPORT-03 is implemented too: migration `m0020` lands the two tables DEC-086 needs — one row per
export, one per playlist it wrote — with models beside them and nothing reading either yet. Landing
the DDL settled four things the specification's column list left in tension with the decisions
around it, recorded as an amendment to DEC-086; the one that mattered is that a library nobody has
file-checked now records that fact rather than recording zero missing files, which DEC-088 refuses
and a forward-only `NOT NULL DEFAULT 0` column could never have taken back.

EXPORT-04 is the preview, and it is where DEC-084's "the preview cannot disagree with the result"
stopped being a promise. Rather than a second walk that counts for itself, the writer was split:
`plan_collection_xml` is the patch with the write left out, both halves go through one
implementation, and `services/rekordbox_export_service.py` turns whichever of them ran into the
numbers to show. A preview of a 50,000-track library with 10,000 overrides and 21 playlists takes
3.0 s and writes nothing. It also corrected DEC-084, which had put the parse inside the job: the
counts that decision requires the preview to state cannot be known without reading the source.

EXPORT-05 is the job that writes: validated before it exists, cancellable between tracks, between
playlists and before the file replaces anything, and ending in one row that agrees with the job —
with the preview's own report recorded on it, so the two cannot disagree. It joined the library job
group, so an import cannot start beside an export any more than the reverse, and it refuses any
destination but an `.xml` file in a folder that exists, holding DEC-085 at the destination. A
50,000-track export takes 3.1 s with a 161 MiB peak working set.

EXPORT-06 puts both on the wire: three routes under `/api/v1/rekordbox-export/`, carried through all
six desktop-contract files, and a native save dialog that suggests a dated name in the folder the
last export went to and never judges the path — the engine does. A refusal a person can act on
crosses the bridge as a value carrying its reason, since a rejection loses everything but its
message on the way to the renderer, and the folder and notation to start from are read from the
export record rather than kept as settings that could drift from it. A test in Python holds every
TypeScript shape against what the engine actually serializes.

EXPORT-07 draws it and closes the phase: one dialog reached from the Library header's **Collection
file** menu and from a new context menu on the Collections tree, stating the destination, the source
and its staleness, the tracks and fields that change, the playlists, the warnings and the notation's
consequence in that order, over fixtures the Python suite produces from the real engine. A Settings
section shows where exports go, a user-guide page and ADR-006 record what the export keeps and why,
and an end-to-end journey passes three times in a row in the packaged Windows build — cue points and
grids kept, the source and every audio file byte-identical. Adding the header entry first stacked the
header's buttons and left the track table 20 pixels tall, which only the packaged run could see; import
and export now share one menu. Phase acceptance is recorded point by point in `PHASE8_EXPORT.md`:
opening the result in Rekordbox itself is owed.

The macOS pass was run on 2026-09-23 and is written up in `PHASE8_EXPORT.md`. It discharges the
packaged checks Phases 7 and 8 both owed — both journeys pass in a packaged, hardened-runtime macOS
build — and it found that **acceptance point 10 had never been true on macOS**: the guard that
refuses the source as a destination compared paths with `os.path.normcase`, which folds case on
Windows and does nothing on POSIX, so an export could overwrite the library it was read from on a
case-insensitive volume. The unit test that would have caught it skipped itself unless
`os.name == "nt"`. It is fixed, with a regression test. The pass also found that the packaged engine
needs about ten seconds to cold-start while the supervisor allowed five, and that the status strip
called a spawned process a connected engine — so the first ten seconds of every Mac launch failed
silently. Fixed, and the shell now opens in 2.2s rather than 9.5s instead of waiting for the engine
at all. One item is left open by design: at the default `--scale: 2` in a laptop-height window the
Library screen shows very few whole rows, and double-clicking a partly visible one is defeated by
the scroll that brings it into view. What gives at short window heights is a design decision
reaching back into Phases 4 and 6, so it is recorded rather than changed.

Round 10's central finding came from the code rather than the roadmap: `POSITION_MARK` and `TEMPO`
appear nowhere in `src/`, so CuePoint has never parsed a cue point or a beat grid. An XML generated
from the database would therefore return a library with every hot cue, memory cue and grid stripped,
silently. So the export **patches the source file** instead — re-parsing the XML the library was
imported from, setting only the six attributes CuePoint owns, appending CuePoint's playlists,
writing a new file — which preserves everything CuePoint never understood rather than everything it
remembered to carry (DEC-077). That decision also retires DEC-038's note that the export maps
`duration_seconds` back to `TotalTime`: a patch never writes it.

One export is the whole `COLLECTION`, the mirrored Rekordbox tree untouched, plus the Collections
the user picked as new nodes under a folder of CuePoint's own (DEC-078). Each field is written at
its effective value — the override when there is one, otherwise the import — reusing the one
implementation of that rule rather than restating it, so what reaches Rekordbox is what the table
showed (DEC-079). Tags, notes and favorites stay in CuePoint, because `Comments` is already claimed
and My Tag is not in the XML, which narrows DEC-064's conditional promise to ratings and Collections
(DEC-080). A Smart Collection exports as its membership at that moment, closing the item DEC-061
left here by name (DEC-081).

The safety properties are where most of the decisions went. A source file that changed since import
is detected against `library_source`, reported with real counts, and not refused; tracks the file no
longer holds are dropped from appended playlists so no dangling reference reaches Rekordbox
(DEC-082). The destination comes from a save dialog that remembers its folder and refuses the source
path by an explicit check rather than by convention (DEC-083). The run previews with computed
numbers and then runs as a cancellable job (DEC-084). Nothing outside the XML is written — no audio
files, keeping DEC-064's discipline where Phase 7 relaxed it for one job (DEC-085). Each export
records what it wrote, with no per-track export state, because that stamp is the staleness bug
DEC-061 refused for Smart Collections (DEC-086). Export is an action in the Library header beside import and refresh, and in the Collection context
menu — not a destination, since DEC-020's registry has no export entry and that stays true (DEC-087,
amended: the selection Actions menu it first named is drawn only when tracks are selected). Tracks whose files are missing are exported and counted, since dropping a
`TRACK` element would remove it from the user's Rekordbox view (DEC-088). All three key notations
are offered, sharing the file-tag path's single converter, defaulting to classic (DEC-089, against
the recommendation to pin classic — the importer reads `Tonality` verbatim, so a Camelot export
re-imported leaves CuePoint's own key column holding two notations; the default and a preview
warning are the mitigations).

## Phase 9 — Discover (DISCOVER-01 … DISCOVER-12) — implemented; acceptance met on Windows

Migrates the existing inCrate discovery logic (charts/label-releases, already working) behind a
proper Discover shell; adds Artist/Label pages and Similar Tracks, which don't exist today.

Decision Round 11 settled the shape (DEC-090…DEC-101), and the steps are specified in
`PHASE9_DISCOVER.md` — twelve, three more than the placeholder. Reading the code found that inCrate
runs a second copy of the matcher, writing labels outside Clean's history and override layer; that
discovery runs inside one blocking request and keeps nothing; that it cannot tell an owned track from
one that is not; that the Beatport v4 parsers throw away every id this phase needs; and that an
accepted match identifies a Beatport *track*, so an artist's or label's Beatport id is one API lookup
further away.

Discovery reads the library's effective values, and inCrate's inventory and enrichment retire
(DEC-090). A run is a cancellable job whose runs are kept (DEC-091). A track is owned when an accepted
match carries its Beatport id; owned tracks are hidden by default and counted (DEC-092). A found track
can go on a CuePoint wantlist or into a Beatport playlist, pushed through the API only, with the unused
browser fallback deleted (DEC-093, DEC-099). Artist and Label pages show the user's own tracks through
the Library's query and Beatport's catalog beside them (DEC-094), identified by Beatport id when it has
been resolved and by a normalized name otherwise, saying which (DEC-095). Similar Tracks is a
deterministic, explained, offline rule over the library, written for Phase 10 to reuse (DEC-096). No
previews (DEC-097), no For You (DEC-101), and the Beatport token is handled as it is today — against
the recommendation to move it into OS secure storage (DEC-098). The Tools group and its landing page
retire, and the Library becomes home (DEC-100).

DISCOVER-01 is implemented: a catalog client that keeps every artist, label, release and genre id,
says which of five things went wrong when Beatport refuses, honors `Retry-After` once, and holds
the whole engine to four Beatport requests at a time. With no token available, the route map was
established against the live API anyway — its router answers 404 for a missing path before it asks
for a token — and it settled one of DEC-094's open questions: there is no route listing charts by
artist or by label. It also found that creating a Beatport playlist had never worked. The playlist
paths lacked their trailing slash, Beatport redirected them, and the redirect turned the POST into a
GET of the playlist list, so inCrate blamed the token every time. Real response bodies were then
recorded with a developer's token (2026-09-23). Every reconstructed shape held, and no filter lists
charts by artist. But a chart made by an artist names that artist, and its account's name can
differ, so inCrate had been missing such charts; it had also read no chart's date. Both are fixed.

DISCOVER-02 is implemented: migration `m0021_discover`, nine empty tables and their models, applied
to a 50,000-track library in 6 ms. Two things in it go past the specification, each because a
forward-only schema could not add them later without another migration. A run stores the class of
the Beatport failure that ended it, so a reopened run can point to Settings. A reason a run found a
track references that run's track, so a reason for a track the run never listed is refused. Writing
it also found a trap SQLite sets for any table keyed by someone else's number. Given no id, an
`INTEGER PRIMARY KEY` invents the next free one, even with `NOT NULL` declared, so the two tables
keyed by a Beatport id are `WITHOUT ROWID`, where a missing id is refused.

DISCOVER-03 is implemented: "tracks by B" now means B, not every artist whose name contains B.
Credits are split into artists, and names are compared with case, Latin accents and punctuation
folded, so **Credited artist** and **Label, any spelling** are filters, facets and Smart Collection
rules like any other. The index is written in the same transaction as the tracks it comes from,
and rebuilt in about a second at 50,000 tracks when a library predates it. Both of the step's
measured choices went the faster way. A credited artist is a set lookup: 0.1 ms, against 19.5 ms
as the specified `EXISTS`. A label compares stored keys: 13 ms, against 31.5 ms through a SQLite
function. The specification contradicted itself on "A, B & C", and its rule was kept over its
example. Caching the pure name functions took the index's cost on an import from 1.5 s to 0.2 s.

DISCOVER-04 is implemented: CuePoint knows which Beatport tracks the library owns, and, once asked
to resolve them, who each library track is by on Beatport. "Owned" is written once, as a database
view over Clean's accepted matches, and a Python copy of the rule is held to it by a test over
every case and 3,000 generated ids and URLs. Nothing is stored, so a match that is rejected or
re-pointed changes both answers at once. The resolve job reads the owned tracks the catalog cache
lacks, 100 per request: 10,000 tracks are 100 requests and 0.9 s of CuePoint's own time, and a
second resolve within the month reads nothing. It stops at once on a refusal every later request
would repeat, and after three failed batches in a row. With no token it is refused before a job
exists.

DISCOVER-05 is implemented: inCrate's discovery now runs over the library as a job, and every run
is kept, with what it looked for, what it found in order, and every reason for each track. inCrate
kept only the first reason. It finds the same tracks as inCrate for the same inputs, held by a
test that runs both, and in fewer requests. A chart listing names its artist, so only a chart by
a library artist costs a second request. Where resolution knows an artist's Beatport id, that id
is the artist, so a chart by someone else of the same name no longer counts. Labels are searched
once and remembered, including "not found". At 50,000 tracks and 1,200 labels against a mocked
Beatport, a first run is 2,708 requests in 1.9 s, and a second makes no label searches: 1,108
requests in 0.7 s. Committing once a second rather than once per chart or label took the mocked
first run from 6.0 s to 1.9 s. A cancel or failure keeps everything found, and a crash loses at
most a second.

DISCOVER-06 is implemented: the wantlist keeps Beatport tracks with a note and a bought mark,
and owned is computed when it is read. Bought and owned filter independently, and nothing removes
an entry. Each change and its activity event commit together. An add of a track never read reads
it first, in one batched request. A push to a Beatport playlist runs as a job through the API
only. It skips owned tracks unless asked, stops at once on a refusal every later track would
repeat, and reports the real URL; a 403 on create says the token may lack playlist scope. The
step also found that a window asking "owned?" rebuilt the ownership view for every use. DISCOVER-05's
run window took 98 ms at 40,000 accepted matches, and both windows now read ownership once, in
34 to 46 ms.

DISCOVER-07 is implemented: an Artist or Label page's data, for a reference by Beatport id or by
normalized name. A name resolution has linked to one artist, or a label linked to any, redirects
to the id. A name several artists share stays a name page and lists them. The library half is a
rule set for the Library's own browse. Two new rule fields, **Beatport artist** and **Beatport
label**, gather the resolved tracks and the unresolved tracks of a linked name, so nothing is lost
on the redirect. The header is the Library's own count and facets over those rules. The Beatport
half is the recent tracks, read once and then from the cache for 12 hours, each marked owned and
on the wantlist. A label is looked up by name, an artist never. Every answer carries a state:
`ok`, `name_only` with its reason, or DISCOVER-01's error class. Written first over DISCOVER-04's
views, a page took 1.9 s (artist) and 9.4 s (label) at 50,000 tracks. Migration 0024 indexes the
owned id, splits the identity view by kind and indexes the label keys, and a page now takes 25 to
47 ms. DISCOVER-05's run window fell from 34 ms to 13–15 ms with it.

DISCOVER-08 is implemented: Similar Tracks' engine, with nothing drawn yet. The rule is in
`core/similarity.py`, with no SQL and no I/O, so Phase 10 can call it over its own candidates. It
scores tempo within 6% (half and double time counted, and said), a key on the Camelot wheel (the
same key, one step, or the relative key), and a genre, label or artist in common. Every weight is a
named constant, and the components add up to 100. When the seed has a BPM, the tempo window is a gate.
Every reason is data, with its points and the values compared, keys in the library's notation, and
the renderer has words for each. A test on each side holds the two lists together. The service reads
effective values. It pre-selects in SQL by the tempo window, or by genre, label, artist or compatible
key for a seed with no BPM, and says which components the seed could not offer. It leaves out the seed
and its duplicates, takes the Library's scope, orders by score and then by id, and writes nothing. A
test holds it to scoring every track in Python. A seed whose tempo window holds 72% of a
50,000-track library took 713 ms as first written and now takes 327 ms, against a budget of 0.5 s.

DISCOVER-09 is implemented: DISCOVER-04 to DISCOVER-08 on the wire, with nothing drawn yet. Sixteen
routes under `/api/v1/discover/` go through all six contract files as sixteen bridge methods. They
are the options, runs and their tracks, the wantlist and its four changes, the playlist push and the
resolve job, both halves of a page, and Similar Tracks. Every method answers `{ value, refusal }`,
so a refusal a person can act on reaches the renderer with its code and, for Beatport, its class. A
Python test holds every TypeScript shape and vocabulary to what the engine serializes. A push can
name a run and gets exactly the tracks its table shows. The status strip names the three Beatport
jobs and shows a discovery's stage. Two slow reads were found and fixed: a push's tracks from a
10,000-track run (773 ms to 21 ms) and the resolve count (137 ms to 50 ms). `options` answers in
302 ms at 50,000 tracks, most of it the Library's own artist facet. The step's checks also found a
dropped key on Clean's review queue; it was fixed in its own commit.

DISCOVER-10 is implemented: the Discover page is in the sidebar and works end to end, in a
packaged Windows build too, with inCrate still under Tools until DISCOVER-12. **Runs** lists the
kept runs beside the open one or **New run** (genres, chart dates, release days, and the artist
and label scope from the Library's facets); a run is a job the status strip follows, opened as
soon as it exists, its owned tracks hidden and counted. **Wantlist** has the note, bought and owned
columns and the two filters. One list of actions, by selection size, is both the toolbar and the
right-click menu: add to the wantlist, push to a Beatport playlist (a run's whole table by
`run_id`), open on Beatport through a new bridge method the main process restricts to https
pages on beatport.com, note, bought and remove. Every token state is drawn from DISCOVER-01's
classes with a link to the token field in Settings, and the resolve prompt starts DISCOVER-04's
job. `TrackTable` holds Beatport rows with its own column registry and windowed source and did
not change. The component tests read the engine's own answers, produced by the Python suite; the
end-to-end journey runs over a Beatport answered from a fixture file, whose new `api` section the
real client reads in place of the network. The journey found that the Runs tab left the open
run no room at the default scale, so it stacks when narrow, and that Settings could not focus its
token field while its status loaded; both were fixed.

DISCOVER-11 is implemented: every track leads to its artist's and label's pages and to its
similar tracks, from the Inspector (a credit's artists and the label are links), the one
operations list (row menu and Actions…) and a filter chip that names one artist or label, in
the Library and on Clean. The engine answers the links with the track's detail — the credit
split by `split_credit`, by Beatport id where the track is resolved — so the renderer has no
copy of the rule. A page, under the `discover` destination, says which identity it is, holds
the Library's own table over the engine's rule set (double-click plays it as the queue) and
the Beatport half in every state, and takes its rules to the Library or a Smart Collection.
Similar tracks shows DISCOVER-08's suggestions as library rows with a Reasons column in
words. The end-to-end journey (Library track, artist page, play, Similar tracks, queue a
suggestion) passes in a packaged build; its checks found the Beatport half blanking while it
re-asked and Similar tracks' reasons out of sight on a narrow pane, both fixed.

DISCOVER-12 is implemented, and with it the phase: inCrate, its inventory, its six routes and
bridge methods, the Tools group and its landing page are gone, each deletion after a caller
search recorded in the step's outcome. The Library is home; `/incrate` and a remembered `incrate`
open Discover, and `/` and a remembered `tools` open the Library. inCrate's inventory database and
past results stay on disk, read by nothing, and the user guide says where they are and which five
`incrate.` settings nothing reads. The legacy catalog parsers went too, and `beatport_api.py`
joined the strict type gate. ADR-007 records the design. The whole-phase journey — match and
accept two tracks, resolve, a run hiding them as owned, the wantlist and a push, an artist page by
id and a label page by name, play, Similar tracks, relaunch onto the Library — passes three times
in a row in a packaged Windows build, over one Beatport fixture for Clean's matcher and the v4 API.
Its checks found the new fixture git-ignored and a fixture that would have aged out of the artist
page's window; both were fixed. The phase acceptance is met on Windows; the macOS packaged checks
and a manual pass through the app against the live API are owed.

Step specifications: `PHASE9_DISCOVER.md`.

## Phase 10 — Prepare (PREP-01 … PREP-12) — implemented

Entirely greenfield (Sets/Chapters/Set Builder). Depends on Player (Phase 5) being solid first,
per the target vision's own layering. Tracks may repeat within a Set; warnings (BPM jumps, etc.)
are always advisory and never block export (DEC-017).

Decision Round 12 settled the shape (DEC-102…DEC-112), and the steps are specified in
`PHASE10_PREPARE.md`, twelve as the placeholder had. Reading the code found that DEC-058 had already
made a Collection structurally a Set, so a Set is a fourth kind of node in the Collections tree
(DEC-102). Widening that kind means rebuilding the table, and a naive rebuild under
`foreign_keys=ON` would delete every Collection entry, so the migration sets the rows aside first. It
also found that CuePoint has no mix points to plan from, that DEC-096's rule scores against one seed,
and that the Library's Collection scope lists a repeated track once. So a Set's running order is read
from its entries and never through the browse query.

A Set is divided into contiguous chapters that can carry a target length and BPM range (DEC-103). It
is built on its own Prepare page and also shown in the Library's tree (DEC-104). Suggestions fit the
tracks on both sides of a gap (DEC-105). Transitions, entries and chapters are checked by DEC-096's own
rule, and a transition warning can be acknowledged (DEC-106). The running time is the sum of typed in
and out times and says how many entries are untimed (DEC-107, against the recommendation of an
estimate). A Set plays as the queue with the player unchanged (DEC-108, against the recommendation of
a transition preview). It exports to Rekordbox as one playlist (DEC-109), and saves as a text, CSV or
M3U8 set list (DEC-110, M3U8 against the recommendation). It shows its tempo and key as lanes, with no
energy field (DEC-111), and the page is laid out side by side (DEC-112). Phase 5's acceptance and
Phase 9's macOS and live checks are owed before PREP-10 wires playback.

PREP-01 is implemented: migration `m0025_sets` rebuilds the Collection tables to accept a Set, adds its
details, chapters, planned times and acknowledgements, and takes 785 ms at 100,000 entries. Every row,
id and sequence survives, and the database itself refuses Set data that does not belong to one Set.

PREP-02 is implemented: a Set is created, filed, filled, counted, referenced and ruled on by the
Collection code. Every entry written into a Set is planned into a chapter by the one writer of entries,
a Set holds at most 1,000 entries, and "New Set from…" and duplicate are copies. A moved entry keeps
its chapter when it can, a precision to DEC-103.

PREP-03 is implemented: a Set's chapters are added, renamed, given notes and targets, moved with their
entries, deleted into a neighbour and started at an entry. Entries carry typed in and out times, held to
the track's length when it is known, and a note. The plan reads back with the running time of each
chapter and of the Set, counting only timed entries and saying how many are not (DEC-107). A new Set
repository writes all of this, and the Collection repository stays the only writer of entries.

PREP-04 is implemented: the engine answers what fits at any gap in a Set, scored by DEC-096's rule
against each neighbour, with each side's reasons, and marks tracks already in the Set. A gap nothing can
bridge says by how much, and each side's own list can then be asked for. The worst case at 50,000
tracks takes 401 ms against DISCOVER-08's 0.5 s budget.

PREP-05 is implemented: a Set checks every transition, entry and chapter against DEC-096's rule, the
last file check and its chapters' targets, and a transition warning can be acknowledged until what it
accepted changes. A track Suggestions offer never has a tempo warning where it was offered, and the
renderer already has words for every warning. A 1,000-entry Set is checked in 57 ms.

PREP-06 is implemented: a Set can be copied as a plain-text tracklist, or saved as text, CSV or M3U8 to
a path the engine checks and writes atomically. The CSV is safe to open in a spreadsheet, the M3U8 lists
every file, missing ones included, and no audio file is opened.

PREP-07 is implemented: a Set exports to Rekordbox as one playlist of its running order, repeats kept,
at its folder path, and is recorded as a Set. Its chapters, times, notes and warnings stay in CuePoint,
and the file is byte-identical to a Collection's with the same entries.

PREP-08 is implemented: a Set's plan, running order, checks, suggestions and set lists are on the wire.
They are twenty methods on `window.cuepoint.sets`, and each answers its value or a typed refusal. A
save dialog for set lists opens where the last one was saved. A Python test and the desktop contract
test hold all six contract files to one another and to the engine's answers.

PREP-09 is implemented: Sets are in the Library's CuePoint tree. A Set is made beside a Collection,
copied from a Collection, a Smart Collection or a Rekordbox playlist, duplicated, filled by drop or
"Add to Set…", and opened as the table's scope, which says it lists each track once. Its set list is
saved or copied from its menu. The Inspector, the rule editor, Clean's scope, the delete confirmation
and the refresh warning all name Sets as their own kind. "Open in Prepare" waits for PREP-10.

PREP-10 is implemented: Prepare is in the sidebar. A Set opens with its chapters as heading rows and
its entries' times, notes and warnings. Each is edited by drag, menu, one chapter dialog or the
Inspector's "In this Set", and plays as the queue with its repeats. At the default window and scale it
shows seven whole rows. A double-click on a partly visible row now plays that row, in the Library too.

PREP-11 is implemented: the Prepare page fills a Set from Suggestions and the library beside it. A track
goes in at the gap after the selected entry, by "Insert here" or a drag, and the new entry is
selected. Suggestions fit both neighbours, each side's reasons shown, and a gap nothing bridges offers
each side's own list. The Set's tempo and key are drawn as two pixel lanes from the engine's own
reading, so a lane cannot disagree with a warning. The page as it opens keeps every row PREP-10
measured.

PREP-12 is implemented, and with it the phase. The user guide has a Prepare page, and the
organization, export, glossary, features and performance pages name Sets. ADR-008 records DEC-102's
design and m0025's rebuild, and the changelog has the phase. `scripts/bench_sets.py` measures the phase
at 50,000 tracks and is run at 5,000 by every full suite: the upgrade takes about a third of a second,
a 1,000-entry Set's plan, running order and checks each take under 70 ms, and Suggestions in the
densest band 305 ms, inside every budget, twice. A restored launch backup brings a Set back whole. The
nine-step journey — a Set from a Collection with a repeat, chapters with a target and a range, timed
and reordered entries, a gap filled from Suggestions and a key warning accepted, played from the third
entry, three set lists and a copy, exported to Rekordbox, relaunched onto, and counted in a refresh's
warning — passes three times in a row in a packaged Linux build, and its engine half runs on every
build. The acceptance check found two gaps and closed them: "New Set from the selection…" joined the
Library's list, and a Set's own notes got a field on the page. The packaged Windows and macOS runs are
owed.

## Phase 11 — Waveforms (WAVE-01 … WAVE-08) — implemented, acceptance met on Windows

The roadmap's gate was "only after Player is solid". Phase 5's code is complete, and the user decided
the phase starts with its manual acceptance still owed and recorded (DEC-119).

Round 13 settled the shape:
- **Source:** CuePoint computes each waveform from the audio, through the `mpv` it already ships. It
  reads none of Rekordbox's analysis files and adds no decoder (DEC-113, DEC-123).
- **Where:** the player bar, where the waveform is the seek control; the Inspector; a Library column,
  hidden by default; and a transition strip on the Prepare page, which shows the selected entry beside
  the next one with their planned times (DEC-114, DEC-120).
- **What:** an overview only, with no zoomed detail view (DEC-115). Three frequency bands are stored,
  and Settings draws them in colour or as one colour (DEC-117).
- **When:** the whole library is analysed automatically after each import. The job runs at low
  priority, can be paused and resumed, continues after a restart, and steps aside for anything that
  rewrites the library (DEC-116).
- **Marks:** cue points and beat grids are imported from the XML and drawn read-only. The export
  still never writes one (DEC-118).
- **Scope:** no loudness or other measurement; those are Phase 19's (DEC-121). Revisited after the
  phase closed: loudness is measured in the same pass (DEC-124, WAVE-08).
- **Storage:** waveform data is its own store beside the library, keyed by file, and outside backups
  and "Clear cache", because it takes hours to rebuild (DEC-122).

Writing the specification found two traps in `mpv`, both now requirements of WAVE-01:
- its encode mode pads output with silence, so the pipeline uses the exact `--ao=pcm` path;
- a four-channel join does not keep its channel order, so the order is proven with tones in CI.

WAVE-01 is implemented: the player's `mpv` decodes any shipped format into a four-band RMS envelope
of exact length, with FFmpeg doing every calculation in a child at lowered priority. Its log must
prove the output format, since `mpv` exits 0 when it drops a filter and writes messages where the
samples go. Electron names the decoder to the engine, and every child ends with the engine.
- **Linux measurements:** 1.0–1.8 s per 6-minute track, and the engine's search stays within 1.25× of
  idle with four analyses running. The design not chosen measured up to 3.7×.
- **CI:** it proves the length, band separation and channel order on the pinned Windows and macOS
  builds with tones (`--check-analysis`).
- **ADR-009** records the design.

WAVE-02 is implemented: one file analyses into `waveforms.db`, and any track's waveform state or
picture is answered without touching a file.
- **Where:** the store is a SQLite file beside the library database, keyed by the file's path, and
  outside the launch backup, the support bundle and "Clear cache".
- **Rebuilt, never migrated:** a store in another schema, or a corrupt one, is set aside and rebuilt.
- **The picture:** 1,200 columns of four bands, compressed. The Library's 200 pictures at width 120
  are cut down in C-level integer arithmetic, with no `numpy`.
- **ADR-010** records the store and the measurements its layout was chosen on.

WAVE-03 is implemented: the whole library is analysed in the background, without being asked.
- **When:** after every whole-library file check and at launch, unless paused. Sets' tracks come
  first, then Collections', then the newest.
- **Giving way:** it steps aside for imports, refreshes, file checks and tag writes, none of which
  waits for it, and comes back when they end.
- **Controls:** Pause and Resume in the status strip and Clean's Health view, kept across restarts.
- **Measured on Windows:** about 6 hours for 50,000 tracks, the Library search within 1.38× of
  idle, and no playback underrun.
- **Fixed on the way:** the pinned Windows build had remixed the bands, which WAVE-01's check in CI
  had been reporting. `ANALYSIS_VERSION` is 2.

WAVE-04 is implemented: each track's cue points and beat grid are read from the XML, read-only.
- **Read on import and refresh,** and replaced whole; the refresh preview counts the tracks whose
  marks changed, in one line. A mark CuePoint does not know is skipped and counted.
- **Shown in the Inspector:** every cue, one line each, and the grid's tempo or "variable".
- **Older libraries** are read once from their unchanged source by a backfill at the first start;
  otherwise the marks arrive with the next refresh.
- **The export is unchanged,** held byte for byte by a test over a fixture full of marks.
- **Measured at 50,000 tracks:** reading the marks costs 21% of reading the tracks alone in a typical
  collection and 28% with eight marks on every track, over the 10% the specification aimed for.

WAVE-05 is implemented: waveforms are on the wire, and the renderer draws them.
- **The contract:** each track's picture at any width from 16 to 1,200, with its cues and grid when
  asked; requests; and "Delete waveform data", through all six contract files.
- **The drawing:** the renderer's first canvas, laid out by a pure function in whole scale pixels,
  in three bands or one colour, with the played part dimmed, cues, loops, the grid and the
  playhead. Every theme's bands are held at 3:1 against its panel, custom themes included.
- **Settings → Waveforms:** the analysis with Pause or Resume, the colour choice with a preview on
  the track in the player, and "Delete waveform data…", which states the size on disk and that the
  library will be analysed again.
- **Proven in the app:** `bands.flac` analysed and painted, each section in its band's colour, in
  two themes.

WAVE-06 is implemented: waveforms are drawn where people look at tracks.
- **The bar:** the playing track's waveform is the seek control's picture, laid across the player's
  duration; the slider stays the control, over it, and shows as before until the picture is ready.
  The bar is no taller, and PLAYER-06's tests pass unchanged.
- **The Inspector:** the selected track with its cues, loops and grid; a click seeks the playing
  track only.
- **The Library:** a "Waveform" column, hidden by default, which reads only rows that stay on screen
  for 100 ms and never moves a track ahead in the analysis.
- **Proven in the app:** a click on `bands.flac`'s picture seeks to within one column, the Inspector
  draws its hot cue at its time, and 5,000 rows scroll with the column shown and no long task.
- **Owed:** the packaged Linux run, with the phase's other packaged runs.

WAVE-07 is implemented, and closes the phase.
- **Prepare's transition strip:** "View ▾" shows the selected entry's waveform beside the next one's,
  with their cues, the picture outside each entry's planned times dimmed, and the times in words
  ("Out 5:42 → In 0:16"). A click on a half selects it. It starts hidden and is remembered, and it
  costs the Set's rows what the lanes do.
- **The Set keeps two rows:** with the lanes or the strip open and the player's bar on screen, the
  Set had no whole row left at the default window. Its area's floor now keeps two, and the page
  scrolls instead.
- **Measured at 50,000 tracks, twice** (`scripts/bench_waveforms.py`, and at 5,000 on every full
  suite): the store, the Library's batch, the bar's and the Inspector's pictures, the work list and
  the marks read, all inside budget.
- **The journey** passes three times in a row in the running app, and its engine half runs on every
  build. A restored launch backup brings the marks back and finds every waveform by its path.
- **Fixed on the way:** a fresh import's analysis status counted nothing present for up to five
  seconds into the run, because its count predated the file check.
- **Docs:** a Waveforms page in the user guide, and ADR-009's outcome.
- **Owed:** the journey in packaged builds, and the macOS decoder timings.

WAVE-08 is implemented (2026-10-05): loudness, measured in the same pass (DEC-124).
- **What:** each track's integrated loudness (LUFS) and sample peak, from FFmpeg's `ebur128` at the
  head of the existing graph; every stored waveform is unchanged, byte for byte.
- **Where:** the Inspector, a "Loudness" Library column hidden by default, and Prepare's strip with
  the difference between the two tracks. Read-only, never applied to playback.
- **Cost, measured:** about 6,000 six-minute tracks an hour, a third below the waveforms alone, so
  about 8.5 hours for 50,000; the search and playback budgets held. The true peak would have cost
  2.6 times the analysis's time, and is deferred. A library already analysed is measured once more
  in the background, keeping every waveform.
- **Fixed on the way:** decoders could outlive a killed engine on Windows; Prepare's row-count test
  held Linux's counts on Windows, where it had failed since PREP-11.

Step specifications: `PHASE11_WAVEFORMS.md`.

## Phases 12 to 17 — before hardening (added 2026-10-06; Decision Rounds 14 and 15 resolved)

The user asked for these to be built before v1's hardening. Phase numbers follow the order of
implementation (DEC-146). Each phase runs alone, and Phase 18 follows them. Decision Round 14
settled the shape of Phases 13 to 17 (DEC-126…DEC-145), and Decision Round 15 settled Phase 12's
(DEC-147). Phases 12, 13 and 14 are specified, and the rest are not yet. Items marked *proposed* are suggestions that have not been accepted.

Why this order:
- **Cleanup comes first,** so that every later phase works in a smaller codebase and a smaller set of
  docs. It also clears the Qt-era error-reporting modules before Phase 13 replaces them.
- **Error reporting comes next,** so that bugs from every later phase reach Sentry from the first
  build that has it.
- **The pages are revisited before Statistics is added,** so the new page is built in the revisited
  style and motion.
- **Distribution comes before the website,** so that the site's download offers each build. The site
  comes last among these phases, so that its pictures show the revisited pages.

## Phase 12 — Cleanup: Repository, Dead Code and Docs (PRUNE-01 … PRUNE-08) — implemented

Specified 2026-10-06 in `PHASE12_CLEANUP.md`, in eight steps:
- **PRUNE-01:** the audit, approved by group before anything goes. *Implemented 2026-10-06;
  every group of `PHASE12_AUDIT.md` approved the same day.*
- **PRUNE-02:** Qt. *Implemented 2026-10-06.*
- **PRUNE-03:** legacy Python modules. *Implemented 2026-10-07.*
- **PRUNE-04:** the old release pipeline and scripts nothing runs. *Implemented 2026-10-07.*
- **PRUNE-05:** dead Electron and renderer code. *Implemented 2026-10-07.*
- **PRUNE-06:** dependencies. *Implemented 2026-10-07.*
- **PRUNE-07:** the docs. *Implemented 2026-10-07.*
- **PRUNE-08:** a dead-code guard in CI, and the phase comes together. *Implemented 2026-10-07;
  the Windows and macOS runs are owed.*

The prefix is PRUNE because CLEAN is Phase 7's.

An audit comes first, listing every candidate with its evidence, and the user approves it by group
before anything is deleted (DEC-147). Qt goes entirely. `docs/v1/` and the ADRs stay, and trackers
and archives go. Untracked local files are left alone.

- **The repository.** Tracked files that nothing uses go:
  - `collection_incrate_playlist.xml`, since inCrate is retired;
  - the `run_gui.*` launchers;
  - `requirements-qt.txt`;
  - the scripts written for one past step, among the 127 in `scripts/` (spikes, `debug_*`, the
    `step10`/`step13` scripts, `organize_root_files.*`).

  The Qt-era release workflows (`build-macos.yml`, `build-windows.yml`, `release.yml`) build and
  publish the PyInstaller app and its Sparkle feeds. They go if the audit confirms it, and Electron
  builds come from `desktop-electron.yml` until Phase 16 (DEC-147).
- **Dead code.** Every deletion comes after a caller search, and the evidence is recorded:
  - Qt: 11 non-test modules still import PySide6:
    - in `utils/`, `crash_handler`, `diagnostics`, `error_reporting_prefs`, `i18n`, `paths`,
      `performance_workers`, `platform` and `sentry_init`;
    - in `services/`, `onboarding_service` and `privacy_service`;
    - `update/__init__`.

    With them go `compat/` and `src/gui_app.py`, as far as the CLI and the tests allow.
  - The rest of `update/`: DEC-145 does not reuse its version comparison.
  - The two files left in `incrate/`.
  - The stray `verify_*` and `test_step_5_2` files at the root of `src/tests/`.
  - Whatever a dead-code report and coverage find, each checked by hand.
- **The docs.** 228 tracked files in more than 20 folders. Too much and irrelevant goes, and what
  remains is brought up to date:
  - duplicates (`docs/feature/` beside `docs/features/`, `docs/roadmap.md` beside this one);
  - retired subjects (`incrate-spec.md`, Qt-era guides and how-tos);
  - the 38 release documents, folded into what the Electron release actually does.

  What stays, kept true:
  - the user guide;
  - the developer docs;
  - the ADRs;
  - the release runbooks;
  - the policies;
  - this design record.
- **Nothing a user relies on goes.** The CLI and its flags, the engine API, config keys, user data,
  and the design record in `docs/v1/` stay (AGENTS.md's invariants). Every check is run before and
  after.

## Phase 13 — Error Reporting

Specified 2026-10-07 in `PHASE13_REPORTING.md`, in eight steps (REPORT-01…REPORT-08). Decision
Round 16 settled what writing it raised (DEC-148…DEC-153): two Sentry projects, no native crash
dumps, nothing sent from source runs or the CLI, "Report a problem" built, and a job failing on a
cause the user owns treated as a refusal.

- **Sentry, on by default, catching every error everywhere** (DEC-126). It covers:
  - crashes and uncaught errors in the engine, Electron main and the renderer;
  - the engine and the player exiting or restarting;
  - every failed job;
  - every logged error.

  Each report carries the steps that led to it. Expected refusals are not reported, and there are
  no performance traces and no replay. Releases are tagged and source maps uploaded.
- **Scrubbed before sending** (DEC-127). Paths, names, notes, tags and tokens are replaced, and no
  local variables are sent.
- **A Settings switch turns it off,** at once, in every process. The privacy notice says what is
  sent. There is no first-run notice (DEC-128).
- **Found in the code:**
  - `utils/sentry_init.py` and `utils/error_reporting_prefs.py` belong to the retired Qt app. They
    read consent through `QSettings`, nothing in the Electron app calls them, and they send local
    variables. They are replaced, not revived.
  - Electron main and the renderer have no Sentry.
  - `PRIVACY_NOTICE.md` and `docs/policy/` promise that v1.0 collects nothing, and change in the
    same step.
- **A "Report a problem" action** that sends a note with the last report's id (DEC-152).

## Phase 14 — The Pages Revisited

Specified 2026-10-07 in `PHASE14_PAGES.md`, in thirteen steps (PAGES-01…PAGES-13). The page reviews
DEC-131 asks for are `PHASE14_REVIEWS.md`: 107 proposals across eleven surfaces, each with a
screenshot (`phase14/`). The user took the recommendation on every one (DEC-159): 100 accepted, 4
declined. Decision Round 17 settled what the reviews raised (DEC-154…DEC-158: feedback is the tenth
kind of motion, the app never says "engine", Collections nests under Library, the wheel lights the
selected track, American English) and DEC-160 (a wheel click replaces the Library's filter). DEC-161 adds a 1.5× size as the
default.

- **Every page reviewed in writing, proposal by proposal** (DEC-130, DEC-131). Each review covers:
  - what the page does;
  - what a new user would not understand;
  - proposed changes, each with a screenshot.

  The user marks each proposal yes or no. The pages are:
  - Discover, the Library, Clean, Prepare and Settings;
  - the Inspector, the player bar, the status strip and the sidebar.
- **Clear to new and non-technical users** (DEC-132):
  - plain words throughout;
  - empty states that say what to do next;
  - background work explained as it happens;
  - a short first-run guide.
- **A pixel-art Camelot wheel** behind a button in the header, beside search (DEC-133). It lights
  the selected or playing track's key and its compatible keys by DEC-096's rule, and a key,
  clicked, filters the Library.
- **Motion, all ten kinds, each behind its own Settings switch,** so the user can test them and
  pick the defaults (DEC-134).
  - It moves in pixel steps, and fades are smooth (DEC-135).
  - It honors reduced motion, and never delays a click.
  - Today the renderer has three motion rules in all.

## Phase 15 — Statistics

- **Its own destination** in the sidebar, after Prepare (DEC-138).
- **The page shows** (DEC-136):
  - most played, as a top 10, 25, 50, 100 or 200;
  - top artists and labels by their tracks' plays;
  - tracks never played;
  - how the library spreads by genre, key, tempo, year, date added, rating and loudness;
  - library health.
- **Play history** (DEC-137). Each import and refresh keeps the play counts that changed, with the
  date, so the page can show the most played since a date. History starts with the first refresh
  after the step.
- **Found in the code:** `PlayCount` is already imported (m0005), and it is a filter field and a
  sort. The XML holds only a running total.
- *Proposed:* a top list saved as a Collection.

## Phase 16 — Distribution

- **An auto-updater** (DEC-145). DEC-019 left it as a future item, and this schedules it.
  - **A test build** (`X.Y.Z-test.N`) updates to the highest newer release, test or normal.
  - **A normal build** updates only to a newer normal release.
  - **Downloads in the background,** then shows "Update ready" with the release notes and
    **Restart now**, and otherwise installs at quit.
  - **Checks** at launch, every 4 hours, and from a button in Settings.
  - **Windows and macOS only.** Windows ships unsigned for now.
- **macOS as two downloads, Apple Silicon and Intel** (DEC-129).
  - **Today only Apple Silicon (arm64) is built.** The build passes no architecture, so it gets the
    machine's own. CI's `macos-latest` is arm64, and the macOS checks ran on an M5 Pro. An Intel
    `mpv` is pinned and fetched, but nothing packages it.
  - The user guide's Intel claim was corrected on 2026-10-06.
  - The Intel build is checked on CI's Intel runner.
- *Proposed:* "What's new" shown once after an update.

## Phase 17 — Website

- **A full remake** (DEC-139). Today the site is `gh-pages-root/`, one 639-line page.
  - **Where and how:** `apps/website/` in this repository, built with Astro and Three.js, with
    scroll-driven WebGL scenes in the app's pixel style in 3D.
  - **Search and speed:** static pages for search engines, and a still fallback for every scene.
  - **Hosting:** English only, on GitHub Pages until a domain is bought. The address is one
    setting, so moving to a custom domain later loses no search standing.
- **Pages:**
  - home, features and download;
  - guide (built from `docs/user-guide/`) and FAQ;
  - changelog and privacy;
  - a blog.
- **Clear to new and non-technical users** what the app does (DEC-132).
- **The user will install skills for it.**
- *Proposed:* the download detects the visitor's system and chip.
- **The release checklist,** each item held by a check in CI where a machine can check it (DEC-141).
  Cookieless analytics, so no banner is needed (DEC-142). Contact and bug-report forms (DEC-143). The
  user is the publisher (DEC-144).
  - **Search:**
    - `sitemap.xml` and `robots.txt`;
    - `noindex` where intended and nowhere else;
    - a meta title, meta description and canonical tag on every page;
    - schema markup;
    - internal links;
    - verification with search engines;
    - a backlink strategy.
  - **Structure:**
    - one `h1` per page and a correct heading hierarchy;
    - alt text on every image;
    - no broken links;
    - a custom 404.
  - **Speed and reach:**
    - Core Web Vitals;
    - optimized performance;
    - mobile responsiveness;
    - HTTPS everywhere.
  - **Sharing:**
    - an OG image;
    - social share;
    - a favicon.
  - **Trust:**
    - a privacy policy and a terms page;
    - cookie consent;
    - a clear call to action.
  - **Checks:**
    - accessibility;
    - forms tested.

## Phase 18 — Production Hardening — v1's final phase, not yet specified

50k-track testing, full migration/backup/restore testing, cross-platform packaging validation,
accessibility, crash recovery, Unicode/path edge cases.

Phases 12 to 17 run before it (DEC-140, DEC-146).

---

## Future releases (beyond v1)

Moved out of v1 by DEC-125, and numbered after v1 by DEC-146. Neither phase is specified, and their
step IDs stay reserved for them. Each starts with a decision round of its own.

### Phase 19 — Audio Intelligence (AUDIO-01 … AUDIO-10)

Entirely greenfield, latest-phase by design — no premature investment. Earlier decisions deferred to
it, and these move with it:
- BPM and key measured from the audio (DEC-121, DEC-124).
- A measured energy value (DEC-111).
- Volume normalisation in the player, from WAVE-08's loudness (DEC-055, DEC-124).
- The true peak and the loudness range (DEC-124).
- Acoustic fingerprinting for duplicates (DEC-074).

The audio-analysis scope question is asked in its decision round. It extends the waveform analysis job
rather than starting a second pass (DEC-121).

### Phase 20 — Advanced Preparation (ADV-01 … ADV-08)

Not yet scoped. It follows Phase 19, whose measurements it would build on.

---

## Explicitly out of scope for now

Per DEC-019, the orphaned Qt/Sparkle updater (`src/cuepoint/update/`) is being removed (see
FOUNDATION-15), not rebuilt. A real Electron-native auto-updater is deferred to a future roadmap
item beyond Phase 18, not scheduled here.
