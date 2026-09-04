# CuePoint — Evolution Roadmap

Status: **Phases 0, 1, 2 and 3 complete; Phase 4 in progress. Decision Rounds 1–6 resolved
(DEC-001…DEC-048).**
Phase 2's ten steps are implemented and recorded in `PHASE2_SHELL.md`. Phase 3's twelve steps are
implemented and recorded in `PHASE3_LIBRARY.md` (LIBRARY-01…LIBRARY-12), unblocked by Decision
Round 5 (DEC-030…DEC-037). Phase 4's ten steps are specified in `PHASE4_LIBUI.md`
(LIBUI-01…LIBUI-10), unblocked by Decision Round 6 (DEC-039…DEC-048); LIBUI-01…LIBUI-03 are
implemented.
Remaining deferred items (crossfade, audio-analysis scope, Smart Collection export/duplication
behavior) will be resolved before the phases they affect actually start. This roadmap shows the
shape of what's ahead; it is not a commitment to implement anything without an explicit
"Implement <STEP-ID>" instruction.

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

## Phase 4 — Library UI (LIBUI-01 … LIBUI-10) — in progress (LIBUI-01…LIBUI-03 done)

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

## Phase 5 — Player (PLAYER-01 … PLAYER-12)

Backend is decided: **libmpv sidecar** (DEC-005), for foobar2000-grade quality — gapless, wide
lossless format support, high-quality resampling. Still the highest-uncertainty phase in
execution terms (entirely greenfield, confirmed zero existing player code, and now also a new
per-OS sidecar to build/sign/package alongside the existing Python engine sidecar). PLAYER-01–03
need to define the Electron-main ↔ libmpv control contract (analogous to `EngineSupervisor`/
`EngineClient`); an early FLAT/AIFF-on-Windows-and-macOS validation spike is still worthwhile as
a packaging/build-integration check even though the codec-availability question itself is settled
by choosing libmpv over HTML5 `<audio>`. Double-click plays + loads the current view as the queue
(DEC-012); "Play Next"/"Add to Queue" are the explicit append actions (DEC-013); no
position-resume across restarts for v1 (DEC-014).

## Phase 6 — Organization (ORG-01 … ORG-11)

Collections-only per DEC-006 (no separate local-Playlist concept). Tags are flat with optional
categories, not hierarchical (DEC-015). Smart Collections are flat AND-only for v1, schema left
room for AND/OR grouping later (DEC-016). Ratings/favorites/notes/Collections/Smart Collections
are all entirely new, no existing code to reuse.

## Phase 7 — Clean / Beatport (CLEAN-01 … CLEAN-13)

Metadata precedence settled by DEC-004 (auto-mark accepted, explicit apply step). The one phase
most dominated by "reuse, don't rebuild" —
`core/matcher.py` is mature and stays as-is; this phase is mostly persistence + review-UI +
duplicate/missing-file/health detection (all currently missing) wrapped around it.

## Phase 8 — Rekordbox Export (EXPORT-01 … EXPORT-08)

No full-XML export exists today (only the narrow attribute-patch write) — this phase builds real
export, carrying forward the existing "always write a new file, never silently overwrite the
source" safety property.

## Phase 9 — Discover (DISCOVER-01 … DISCOVER-09)

Migrates the existing inCrate discovery logic (charts/label-releases, already working) behind a
proper Discover shell; adds Artist/Label pages and Similar Tracks, which don't exist today.

## Phase 10 — Prepare (PREP-01 … PREP-12)

Entirely greenfield (Sets/Chapters/Set Builder). Depends on Player (Phase 5) being solid first,
per the target vision's own layering. Tracks may repeat within a Set; warnings (BPM jumps, etc.)
are always advisory and never block export (DEC-017).

## Phase 11 — Waveforms (WAVE-01 … WAVE-07)

Only after Player is solid. Entirely greenfield.

## Phase 12 — Audio Intelligence (AUDIO-01 … AUDIO-10)

Entirely greenfield, latest-phase by design — no premature investment.

## Phase 13 — Advanced Preparation (ADV-01 … ADV-08)

## Phase 14 — Production Hardening

50k-track testing, full migration/backup/restore testing, cross-platform packaging validation,
accessibility, crash recovery, Unicode/path edge cases.

---

## Explicitly out of scope for now

Per DEC-019, the orphaned Qt/Sparkle updater (`src/cuepoint/update/`) is being removed (see
FOUNDATION-15), not rebuilt. A real Electron-native auto-updater is deferred to a future roadmap
item beyond Phase 14, not scheduled here.
