# CuePoint — Open Questions Log

Tracks unresolved product/architecture decisions. When resolved, the outcome moves into
`DECISIONS.md` as a `DEC-NNN` entry and the entry here is marked Resolved (kept for history,
not deleted, so the roadmap trail stays legible).

---

## DECISION ROUND 1 — FOUNDATION ✅ Resolved 2026-09-01

All ten questions below were answered 2026-09-01. Outcomes are recorded as DEC-001 through
DEC-010 in `DECISIONS.md`. Kept here (not deleted) for the reasoning trail — each entry below is
historical context for its corresponding decision, not a live question.

### Q-001 — Persistence technology

**Status**: Resolved → DEC-001 (Option B chosen: SQLite + migration tooling)

**Question**: What should CuePoint's durable local store be?

- **Option A — SQLite, single embedded file** (e.g. `~/.cuepoint/cuepoint.db`). Zero external
  dependencies, battle-tested for local-first desktop apps, trivial to back up (copy one file),
  works identically across Windows/macOS/Linux. inCrate already uses SQLite today
  (`incrate/inventory_db.py`), so there's a proven pattern in-repo to extend rather than a new
  technology to introduce.
- **Option B — SQLite + a lightweight ORM/query layer** (e.g. SQLAlchemy Core or a migrations
  tool like `alembic`). Same storage engine as A, but with schema-migration tooling built in from
  day one rather than hand-rolled.
- **Option C — Something else** (embedded document store, etc.) — no clear candidate emerged
  from the audit; would need justification against A/B.

**Recommendation**: **B** — SQLite as the engine (matches inCrate precedent, zero new runtime
dependency), with a real migration tool from the start rather than hand-rolled migrations, since
the spec is explicit that "a CuePoint update must NEVER require users to delete their database."

**Blocks**: FOUNDATION-02, FOUNDATION-03, and effectively all of Phase 3 (persistent library).

---

### Q-002 — Track identity across Rekordbox refreshes

**Status**: Resolved → DEC-002 (Option B chosen: TrackID + normalized-path fallback)

**Question**: How should CuePoint recognize "the same track" between one Rekordbox XML import and
the next (so tags/ratings/collection membership survive a refresh)?

- **Option A — Rekordbox `TrackID` only** (current behavior, unchanged). Simple, matches what the
  XML parser already extracts as identity. Risk: if a user re-exports from a rebuilt Rekordbox
  database (rare but real — e.g. after a Rekordbox library repair), TrackIDs can change, silently
  orphaning all CuePoint-side data for those tracks.
  - **Option B — TrackID with a normalized-file-path fallback**. Primary identity is TrackID;
  if a track's TrackID isn't found in the new import but a track at the same normalized path is,
  treat it as the same track (with a flagged "identity re-linked" event for transparency). More
  robust, moderate complexity.
- **Option C — TrackID + path + a lightweight content signature** (duration + normalized
  title/artist as a fuzzy fallback when neither TrackID nor path match, e.g. after a file move
  *and* a Rekordbox rebuild). Most robust, most complexity — probably premature for Phase 3.

**Recommendation**: **B**. TrackID-only is fragile for the exact scenario CuePoint should be most
resilient to (something changes on the Rekordbox side, and the user doesn't want to lose weeks of
tagging/collection work). Full content-signature matching (C) is over-engineering for v1 — can be
added later without a breaking migration.

**Blocks**: LIBRARY-02, LIBRARY-09 (differential refresh), LIBRARY-10 (removed-source handling).

---

### Q-003 — Removed-from-Rekordbox track handling

**Status**: Resolved → DEC-003 (**Option A chosen: delete** — user explicitly overrode the
recommended Option C)

**Question**: What happens to a CuePoint track when it disappears from a re-imported Rekordbox
XML?

- **Option A — Delete from CuePoint.** Simplest model. Risk: silently destroys CuePoint-only work
  (tags, ratings, Collection/Set membership) if the user removed the track from Rekordbox
  temporarily, by mistake, or as part of an unrelated cleanup.
- **Option B — Keep indefinitely**, regardless of whether anything references it. Safest for data
  preservation, but the library silently accumulates stale entries over time with no cleanup path.
- **Option C — Keep if referenced by a CuePoint Collection/Set/rating/tag, otherwise archive
  (hidden by default, recoverable, purgeable manually).** Preserves CuePoint-only work, keeps the
  active library clean, gives the user visibility and control.

**Recommendation**: **C** (this is the spec's own worked example, and it fits the audit findings —
CuePoint currently has zero mechanism to distinguish "gone from Rekordbox" from "gone entirely,"
so this needs a real `TrackSourceStatus` concept either way).

**Blocks**: LIBRARY-10, and indirectly Collections/Sets (Phase 6/10) since their referential
integrity depends on this.

---

### Q-004 — Metadata precedence & effective value

**Status**: Resolved → DEC-004 (Option C chosen: auto-mark accepted, explicit separate apply step)

**Question**: Confirming the Source → Verified → CuePoint → Effective model (target spec §9): when
a Beatport match is **accepted**, does the "Effective" (displayed) value change automatically, or
does accepting a match and applying its metadata stay two separate user actions?

- **Option A — Always manual.** Every field application is an explicit user action, even after
  accepting a match. Maximum control, more clicks.
- **Option B — Auto-accept ≥ threshold, and metadata applies immediately on accept.** Fewer
  clicks, but conflates "I agree this is the right track" with "I want Rekordbox/tags overwritten"
  — riskier for a tool whose philosophy is explicitly "explain, don't silently decide" (target
  spec §4).
- **Option C — High-confidence matches auto-mark as accepted, but applying metadata to
  Effective/tags is always a separate explicit step** (batch or per-field, per target spec §34).

**Recommendation**: **C** — this is also the spec's own worked example, and it's consistent with
the existing matcher's design (confidence is already just a label today, §11 of
`CURRENT_ARCHITECTURE.md`; there's no existing auto-apply behavior to preserve either way).

**Blocks**: CLEAN-02 (match states), CLEAN-06 (metadata precedence), CLEAN-04/05 (review UI).

---

### Q-005 — Player backend

**Status**: Resolved → DEC-005 (**libmpv sidecar chosen** — a refinement round beyond the original
A/B/C options here, prompted by the user wanting foobar2000-grade quality; see DEC-005 for the
actual options evaluated)

**Question**: Now that the product is Electron-only (Qt Multimedia is off the table — confirmed
zero player code exists anywhere in the current renderer), what should back local audio playback?

- **Option A — HTML5 `<audio>` element in the renderer.** Zero new dependencies (ships inside
  Chromium/Electron already); simplest integration with React state. Risk: format support depends
  on Chromium's bundled codecs — MP3/AAC/WAV are solid, but **FLAC and especially AIFF support in
  Chromium is inconsistent across platforms** and would need explicit verification (target spec
  §21 flags exactly this: "investigate codec packaging before promising support").
  - **Option B — A native Node audio library in the main process** (e.g. driving playback outside
  the renderer, streaming PCM to the renderer or using platform audio APIs directly). Broader
  format guarantees, meaningfully more integration/packaging complexity (native module, per-OS
  builds), and cuts against Electron's simplicity.
- **Option C — Bundle `mpv`/`ffmpeg`-based playback** similar in spirit to the old Qt approach's
  breadth of format support, run as a sidecar the way the Python engine already is. Widest format
  support, but adds a second bundled binary to package/sign/update per-OS (real weight given the
  audit already found packaging/signing is only lightly tested across all three OSes today).

**Recommendation**: **A**, with an explicit early spike (PLAYER-01/PLAYER-11 in the draft roadmap)
to verify FLAC/AIFF playback on both Windows and macOS Electron builds before committing — if that
spike fails for formats the user's library actually contains, fall back to B or C. Don't guess;
verify first, since this is exactly the kind of "never promise fake format support" risk the spec
calls out.

**Blocks**: all of Phase 5 (Player) — the highest-uncertainty ADR in the whole roadmap (ADR-004).

---

### Q-006 — Collections vs. local Playlists

**Status**: Resolved → DEC-006 (Option A chosen: Collections only)

**Question**: Should CuePoint support creating its own local playlists (separate from imported
Rekordbox playlists), distinct from Collections — or are Collections the only CuePoint-native
organizational unit, with Rekordbox playlists staying strictly import-only?

- **Option A — Collections only.** One CuePoint-native organizational concept. Simpler mental
  model, simpler UI, simpler export mapping (Collection → Rekordbox playlist on export).
- **Option B — Collections *and* CuePoint-native Playlists as distinct concepts**, mirroring the
  target vision's own conceptual split (target spec §25 vs. general playlist language elsewhere).
  More expressive (e.g. ordered "Playlists" for literal Rekordbox-bound structures vs. crate-like
  "Collections" for looser groupings), more surface area to build/explain/maintain.

**Recommendation**: **A**. The audit found no existing precedent for a second local-playlist
concept, and Rekordbox playlists already round-trip via the XML import; introducing a second
CuePoint-native "Playlist" type distinct from "Collection" adds real UI/data-model surface area
for a distinction most users won't reliably keep straight. Can always be split later if it proves
too coarse.

**Blocks**: ORG-06 (Collections), LIBRARY-05 (Playlists) naming/scope.

---

### Q-007 — Background job durability

**Status**: Resolved → DEC-007 (Option B chosen: persist job records, not full resumability)

**Question**: `engine/jobs.py::JobStore` today is entirely in-memory — if the engine process
restarts mid-job (crash, update, manual restart), all job/progress state is lost with no trace.
Should job state become durable?

- **Option A — Keep in-memory, accept job loss on restart.** No new work; matches today's
  behavior. Acceptable now because jobs are short (a single match run), but becomes a real problem
  once jobs include long-running import/analysis/waveform work (Phases 3, 11, 12) where losing
  hours of progress on a crash is a bad experience.
- **Option B — Persist job records (status, progress, timestamps) to the new database**, so a
  restarted engine can at least report "this job was interrupted" instead of the job vanishing
  silently, and the Activity feed has something durable to read from. Doesn't require resuming
  in-flight work, just not losing the record of it.
- **Option C — Full crash-resumability** (persist enough state to resume an interrupted job, not
  just record that it happened). `services/checkpoint_service.py` already does something similar
  for CLI runs today (JSON checkpoint file) — could inform this, but it's meaningfully more work.

**Recommendation**: **B** for Foundation; **C** is worth revisiting once real long-running jobs
(import, analysis) exist and the pain of losing them becomes concrete rather than hypothetical.

**Blocks**: FOUNDATION-07 (background job architecture), FOUNDATION-08 (activity/event architecture).

---

### Q-008 — Undo / history strategy

**Status**: Resolved → DEC-008 (Option B chosen: per-field history with manual revert)

**Question**: How reversible do CuePoint's own data changes need to be (tag edits, batch metadata
apply, Collection membership, Set edits)? Target spec §34 calls for previewing large batch changes
and using transactions; §58 implies some notion of history.

- **Option A — Transactional batch preview only, no true undo.** Every batch operation shows a
  preview before applying (already partially true in spirit — target spec's worked example), but
  once applied, reverting means manually re-editing. Simplest to build.
- **Option B — Per-field change history with manual revert**, i.e. every metadata change is logged
  (old value, new value, timestamp) and a user can look at a track's History tab and revert a
  specific field to a prior value — but there's no global "Undo" keystroke.
- **Option C — A real global Undo/Redo stack** for CuePoint-side operations (batch edits,
  collection changes, set changes), Ctrl+Z-style. Best UX, substantially more architecture (every
  mutating operation needs an inverse).

**Recommendation**: **B** for Foundation — it directly serves the "explainability" philosophy
(target spec §4, §55 Track History) without committing to the much larger architectural
investment of C. A can be upgraded to B cheaply once Track History (target spec §55) exists as a
concept; C can be considered later for specific high-blast-radius operations (batch edits) rather
than universally.

**Blocks**: FOUNDATION-08, ORG-11 (batch operations), CLEAN-08 (batch metadata).

---

### Q-009 — Backup strategy

**Status**: Resolved → DEC-009 (Option B chosen: automatic on launch + retention + manual restore)

**Question**: Once a real database exists, what's the minimum viable backup behavior for v1?

- **Option A — Manual only** ("Back Up Now" button, writes a timestamped copy of the DB file).
  Simplest; relies on the user remembering to do it.
- **Option B — Automatic on every app launch** (if the DB has changed since the last backup),
  with a retention cap (e.g. keep the last N), plus a manual "Back Up Now" / "Restore" pair in
  Settings.
- **Option C — Automatic before every schema migration only**, plus manual on-demand — narrower
  scope, protects the one moment where corruption risk is highest (a failed migration), but
  doesn't protect against other kinds of data loss.

**Recommendation**: **B**. A single-file SQLite database (per Q-001) makes this cheap to
implement, and "automatic + retained + user-triggerable" matches the target spec's explicit
requirement (§58) without needing anything exotic (no cloud, no continuous backup).

**Blocks**: FOUNDATION-11.

---

### Q-010 — Pixel icon assets

**Status**: Resolved → DEC-010 (Option C chosen: hybrid, 5–10 highest-visibility icons only)

**Question**: Today's UI uses styled Unicode glyphs for all icons (no sprite/bitmap assets exist,
despite one being specced and never built — see `PIXEL_DESIGN_SYSTEM.md`). Worth investing in real
pixel iconography now, or keep the current approach?

- **Option A — Keep Unicode glyphs.** Zero cost, already working, already themed consistently.
  Doesn't fully deliver on "distinctly pixel-art" as a literal visual identity (glyphs render via
  the system font, not hand-crafted pixel art), but is a legitimate minimalist choice many pixel-
  styled apps make.
- **Option B — Build a real pixel icon set** (the originally-specced 9-slice/Aseprite pipeline)
  for the icons that recur most (nav, toolbar, track-status, file-type). Real asset-production
  work with no existing pipeline to build on; meaningfully raises the "professional pixel-art
  desktop application" bar the spec explicitly asks for (target spec §5).
- **Option C — Hybrid**: keep glyphs for secondary/rare actions, invest in real pixel icons only
  for the highest-visibility recurring set (5–10 icons: play/pause, nav items, track status
  badges).

**Recommendation**: **C** — gets the visible identity payoff where it matters most (nav and
transport controls the user sees constantly) without committing to full icon-set production before
there's a stable feature surface to design icons for.

**Blocks**: FOUNDATION-14 (design system foundation), cosmetic only — does not block any
functional roadmap item, can be resolved later than the others in this round if preferred.

---

## DECISION ROUND 2 — REFRESH SAFETY, PLAYER UX, ORGANIZATION DETAIL, SHELL LAYOUT ✅ Resolved 2026-09-01

All nine questions below were answered 2026-09-01 (all recommended options accepted). Outcomes
recorded as DEC-011 through DEC-019 in `DECISIONS.md`.

### Q-011 — Refresh-time warning for deletions

**Status**: Resolved → DEC-011 (Option B chosen: warn only when referenced)

**Question**: DEC-003 means a Rekordbox refresh can delete tracks that are still referenced by a
CuePoint Collection or Set. Should CuePoint warn before that happens?

- **Option A — Silent delete**, matching DEC-003's simplicity exactly — no extra confirmation step.
- **Option B — Warn only when a to-be-deleted track is referenced by a Collection/Set** (e.g.
  "12 tracks removed from Rekordbox are used in 2 Collections and 1 Set — Continue / Review").
  Refresh proceeds unconditionally for unreferenced removed tracks (the common case), so this
  doesn't add friction to routine refreshes.
- **Option C — Always show a full removed-tracks summary** on every refresh, referenced or not.

**Recommendation**: **B** — protects the one scenario DEC-003 explicitly accepted the risk of
(losing Collection/Set work silently) without adding a confirmation step to the common case.

---

### Q-012 — Double-click behavior

**Status**: Resolved → DEC-012 (Option B chosen: plays + loads view as queue)

**Question**: What does double-clicking a track in the Universal Track Table do?

- **Option A — Always plays immediately**, replacing whatever is currently playing.
- **Option B — Plays immediately and loads the current view's visible tracks as the queue**
  (so Next/Previous move through the list you were browsing).

**Recommendation**: **B** — matches how most library/player apps behave and makes Next/Previous
meaningful immediately, without needing a separate "build a queue" step.

---

### Q-013 — Playback queue behavior

**Status**: Resolved → DEC-013 (Option C chosen: replace on double-click, explicit append actions)

**Question**: When you play a track from a different screen while something is already playing,
does it replace the queue or append to it?

- **Option A — Always replace** the queue with the new context (simplest mental model, matches Q-012 Option B).
- **Option B — Always append** ("Play Next"/"Add to Queue" become the only way to build a queue explicitly).
- **Option C — Double-click replaces; a separate "Add to Queue" context-menu action appends** —
  both behaviors available, driven by explicit user intent rather than one default for everything.

**Recommendation**: **C** — this is the target spec's own context-menu design (PLAY / PLAY NEXT /
ADD TO QUEUE as distinct actions), so it's already implied rather than a new invention.

---

### Q-014 — Resume playback position after restart

**Status**: Resolved → DEC-014 (Option B chosen: always start fresh)

**Question**: If you quit CuePoint mid-track, should it resume that track (and position) on next launch?

- **Option A — Yes, always resume** (track + position, paused, ready to hit play).
- **Option B — No, always start fresh** (simpler, avoids surprising playback resuming automatically).

**Recommendation**: **B** for v1 — resuming position adds real state-persistence complexity
(§DEC-007 already deferred full job-resumability for similar reasons) for a nice-to-have; can be
revisited once the player is stable.

---

### Q-015 — Tag taxonomy

**Status**: Resolved → DEC-015 (Option B chosen: flat tags with optional categories)

**Question**: Should CuePoint tags be flat, or support categories/hierarchy?

- **Option A — Flat list**, user-defined, optional color per tag (simplest; matches most DJ
  software's tagging model, e.g. a flat set of user labels).
- **Option B — Flat tags with optional categories** (e.g. "Mood: Dark", "Set Position: Warmup") —
  a lightweight grouping without full hierarchy/nesting.
- **Option C — Fully hierarchical tags** (nested tag trees) — most expressive, most UI complexity,
  and the target spec's own example list (§26) reads as a flat vocabulary in practice.

**Recommendation**: **B** — gets useful organization (e.g. filter "all Mood tags") without the
complexity of arbitrary nesting the spec's own examples don't seem to need.

---

### Q-016 — Smart Collection rule complexity

**Status**: Resolved → DEC-016 (Option A chosen: flat AND-only for v1)

**Question**: How complex should Smart Collection rule-building be for v1?

- **Option A — Flat AND-only** rule list (all conditions must match) — simplest to build and to explain.
- **Option B — AND/OR with one level of grouping** (e.g. "Genre IS Afro House AND (Rating >= 4 OR Favorite)").
- **Option C — Arbitrary nested AND/OR groups** — matches the target spec's example most literally, most implementation and UI complexity.

**Recommendation**: **A** for v1, with the data model designed so B/C can be added later without a
breaking migration — most real-world Smart Collection use cases (the spec's own worked example
included) are satisfied by flat AND conditions.

---

### Q-017 — Set/Chapter structural rules

**Status**: Resolved → DEC-017 (Option A chosen: repeats allowed, warnings always advisory)

**Question**: Two structural rules for Sets: (1) can the same track appear twice in one Set? (2) do
Set warnings (e.g. large BPM jumps) block export, or are they advisory only?

- **Option A — Track can repeat; warnings are always advisory** (never block export). Matches the
  spec's "never make unexplained decisions for them" philosophy most closely.
- **Option B — Track cannot repeat (enforced); warnings advisory only.**
- **Option C — Track can repeat; export requires explicit acknowledgment of open warnings** (not a
  hard block, but a confirmation step, e.g. "3 unresolved warnings — Export Anyway / Review").

**Recommendation**: **A** for repeats (DJs legitimately replay tracks, e.g. a closing reprise) and
warnings always advisory (never block — matches CuePoint's core "explain, don't decide" philosophy
stated repeatedly in the spec). This is genuinely a UX-feel judgment call, not just engineering.

---

### Q-018 — Inspector / shell layout

**Status**: Resolved → DEC-018 (Option B chosen: persists, resizable, remembered)

**Question**: Should the Track Inspector (persistent right-side panel) stay open when navigating
between pages, and should it be resizable?

- **Option A — Persists across pages, fixed width.** Simpler to build; consistent but not user-tunable.
- **Option B — Persists across pages, user-resizable (width remembered)**, consistent with how
  column widths/scale already persist to `localStorage` today.
- **Option C — Closes when navigating away from Library-like pages**, reopens on next selection.

**Recommendation**: **B** — matches the existing UI-state-persistence pattern already in the
codebase (`resultsTableLayout`, scale, theme all persist this way) and the target spec's explicit
"Track Inspector available throughout app" framing (§101).

---

### Q-019 — Orphaned Qt updater's fate

**Status**: Resolved → DEC-019 (Option B chosen: deprecate/remove now, real updater deferred)

**Question**: `src/cuepoint/update/` is a fully-built Sparkle/PySide6 auto-update system,
disconnected from the Electron shell, with a known issue already logged
(`docs/release/known-issues.md`: "Update fails on some Windows 10 configurations"). What should
happen to it?

- **Option A — Rebuild an Electron-native equivalent** (e.g. `electron-updater` against the
  existing appcast infrastructure) as an early Foundation/Shell-phase step, since auto-update is
  fairly foundational infrastructure for a shipped product.
- **Option B — Formally deprecate and remove the Qt-era code now**, and treat "auto-update"
  as an explicit later roadmap item (not blocking Foundation), shipping without it meanwhile
  (manual download/install, as is effectively true today).
- **Option C — Leave it as-is for now** (untouched, undecided) and revisit once Foundation/Shell
  work is further along.

**Recommendation**: **B** — the dead code is actively confusing (a known-issue is logged against a
feature that doesn't actually run), and removing it is a small, low-risk cleanup independent of
the roadmap; a proper Electron-native updater is real work that deserves its own future ADR/phase
rather than being squeezed into Foundation as an afterthought.

---


## DECISION ROUND 3 — APPLICATION SHELL ✅ Resolved 2026-09-02

Asked after Phase 1 completed (all 15 FOUNDATION steps implemented and audited 2026-09-02), to
unblock the Phase 2 step specifications. Outcomes are recorded as DEC-020 through DEC-027 in
`DECISIONS.md`.

---

### Q-020 — Navigation inventory for the v1 shell

**Status**: Resolved → DEC-020 (Option A chosen: nav registry, render only what exists)

**Question**: Today's navigation is the floating `app-lab-nav` pill in `App.tsx` with five routes.
Most target destinations (Library, Collections, Prepare, Discover, Clean) do not exist until
Phases 3–10. What does the new sidebar list at Phase 2 time?

- **Option A — Declare the full target IA once in a nav registry, render only what has landed.**
  Each later phase flips one flag on a pre-declared destination instead of restructuring the
  shell. No dead-end placeholder pages; the shell is still built once.
- **Option B — Full IA now with "coming in Phase N" placeholder pages.** Final shape visible
  immediately, but the app advertises a lot it cannot do yet.
- **Option C — Only what exists today**, adding destinations as phases land. Honest, but the IA
  gets reshuffled repeatedly.

**Recommendation**: **A**.

**Blocks**: SHELL-01, SHELL-02.

---

### Q-021 — Fate of the existing lab screens

**Status**: Resolved → DEC-021 (Option A chosen: keep as a Tools group, migrate per-phase)

**Question**: What happens to `ToolSelectionScreen`, `InKeyMainScreen`, `InCrateMainScreen` and
`ResultsScreen` when the real shell replaces the lab nav?

- **Option A — Keep them intact, grouped as "Tools".** Phase 7 re-homes inKey into Clean, Phase 9
  re-homes inCrate into Discover. Smallest coherent change; no feature work smuggled into Phase 2.
- **Option B — Re-home into the target IA now** (inKey→Clean, inCrate→Discover, Results→Clean
  review, drop the ToolSelection landing). Final IA sooner, but Phase 2 absorbs Phase 7 and 9 work.
- **Option C — Re-parent unchanged as flat top-level entries.** Least work now, messiest IA.

**Recommendation**: **A**.

**Blocks**: SHELL-02.

---

### Q-022 — Sidebar behavior

**Status**: Resolved → DEC-022 (Option A chosen: two-state expanded / icon rail, persisted)

**Question**: Round 1 deferred this ("whether the collapsible-sidebar question needs its own
decision beyond DEC-018's Inspector-specific answer"). It does. How does the sidebar behave?

- **Option A — Two states: expanded with labels, or collapsed to an icon-only rail**, persisted
  to `localStorage`. Predictable widths let the icon rail be designed at exact pixel sizes, which
  matters for pixel art; only the Inspector gets a free-drag handle.
- **Option B — Free-resize plus a collapse toggle.** Most flexible, but arbitrary widths fight
  pixel-art icon rendering and add a second draggable edge alongside the Inspector's.
- **Option C — Fixed width, always expanded.** Simplest; gives up horizontal space on small
  windows, which matters once the Inspector is also docked.

**Recommendation**: **A**.

**Blocks**: SHELL-02, and the `clean`/`discover`/`prepare` icons FOUNDATION-14 deliberately left
as Unicode glyphs "until there is a screen to draw them against".

---

### Q-023 — Global search in Phase 2

**Status**: Resolved → DEC-023 (**Option A chosen: engine-backed search over the Phase 1 `tracks`
table** — the user chose the more forward-looking option over the recommended inert-chrome answer)

**Question**: No search exists anywhere in the renderer today. What does the header search do in
Phase 2, before Phase 3 populates a library?

- **Option A — Real engine-backed search over the Phase 1 SQLite `tracks` table.** Returns nothing
  until Phase 3 imports a library, then works with no rewrite. Builds the real contract now.
- **Option B — Client-side filter over whatever table is on screen.** Immediately useful, but a
  different mechanism from the global search Phase 4 needs, so it gets replaced.
- **Option C — Chrome only, disabled until Phase 4.** Locks the layout without committing to a
  search contract; ships a visibly dead control for several phases.

**Recommendation**: **B or C** — the user chose **A**.

**Blocks**: SHELL-04. Note this makes Phase 2 a desktop-contract change, not a renderer-only one:
a `/api/v1` search endpoint, `engineClient.ts`, runtime `preload.cjs`, bridge types and tests all
have to move together per the AGENTS.md invariant.

---

### Q-024 — Track Inspector content in Phase 2

**Status**: Resolved → DEC-024 (Option A chosen: container + empty state, hideable)

**Question**: DEC-018 settled that the Inspector persists across pages and is resizable with its
width remembered. What does it actually contain in Phase 2, and can it be hidden?

- **Option A — Container, empty state, and a hide toggle with a keyboard shortcut.** Each later
  phase contributes its own content; no track-data contract is invented before the library exists.
- **Option B — Also wire it to `ResultsScreen` selection now.** Proves the container with real
  content, but builds a panel against the old `TrackResult` shape Phase 4 will rework, and
  overlaps `CandidateDialog`.
- **Option C — Container, always visible, no hide toggle.** Simpler state model; costs horizontal
  space on every page whether or not it has content.

**Recommendation**: **A**.

**Blocks**: SHELL-05.

---

### Q-025 — Player container before Phase 5

**Status**: Resolved → DEC-025 (Option A chosen: zero-height layout slot)

**Question**: The roadmap says the shell carries a persistent player container that stays empty
until Phase 5. How literally?

- **Option A — The grid region and component boundary exist but occupy no space and render
  nothing.** Phase 5 fills it without touching shell layout; nothing dead is visible meanwhile.
- **Option B — A visibly disabled transport bar** using the existing play/pause/next/previous
  pixel icons. Locks visual proportions early; ships non-functional controls for several phases.
- **Option C — Nothing at all until Phase 5**, which then re-opens the shell layout and its tests.

**Recommendation**: **A**.

**Blocks**: SHELL-06.

---

### Q-026 — Background activity surface

**Status**: Resolved → DEC-026 (Option A chosen: status strip plus Activity panel)

**Question**: FOUNDATION-07 (durable job records) and FOUNDATION-08 (`activity_events` +
`track_history`) shipped with **no UI at all**. Does the shell surface them?

- **Option A — A bottom status strip** showing engine state and running job progress, clicking
  through to the activity feed. Gives Phase 1's infrastructure its first surface and gives
  `EngineStatusBanner` a permanent home instead of a floating banner. The `activity` pixel icon
  already exists for exactly this.
- **Option B — A compact header indicator only**, with the full feed becoming its own page later.
- **Option C — Defer to Phase 3**, the first phase that generates jobs. Keeps Phase 2 tight, but
  leaves shipped infrastructure unobservable.

**Recommendation**: **A**.

**Blocks**: SHELL-07, SHELL-08.

---

### Q-027 — Launch page

**Status**: Resolved → DEC-027 (Option A chosen: restore last-visited page)

**Question**: Where does the app open on launch?

- **Option A — Restore the last-visited destination**, persisted with the same `localStorage`
  pattern as scale, theme and column widths, falling back to home when it no longer exists.
- **Option B — Always a fixed home page.** Predictable and trivially testable; loses the user's
  place between sessions.
- **Option C — Restore within a session only** (survives reload, not restart) — in practice close
  to B, since restarts are the common case.

**Recommendation**: **A**.

**Blocks**: SHELL-03.

---

## DECISION ROUND 4 — ENGINE RECOVERY AND ACTIVITY PRODUCERS ✅ Resolved 2026-09-02

Asked after Phase 2 completed, from its own findings rather than from the audit: SHELL-07 made a
dead engine visible for the first time, and SHELL-08 shipped a feed with no producers. Outcomes are
DEC-028 and DEC-029 in `DECISIONS.md`.

---

### Q-028 — What happens when the engine process dies

**Status**: Resolved → DEC-028 (Option A chosen: bounded auto-restart plus a manual control)

**Question**: `EngineSupervisor` spawns the engine once at startup and never again, so after a crash
the status strip correctly reports "Engine offline" forever and the app has to be restarted.
SHELL-07 made this visible; nothing yet makes it recoverable.

- **Option A — Bounded auto-restart plus a manual button.** Respawn up to three times with backoff,
  showing "Reconnecting…"; when those are exhausted, stop and offer "Restart engine". Each engine
  start is recorded as an activity event, so repeated crashes are visible rather than silently
  healed.
- **Option B — Manual button only.** Smallest, nothing hidden, but a transient crash still
  interrupts the user until they notice.
- **Option C — Auto-restart only.** No user-facing control, so exhausted attempts leave today's
  dead end, just later.
- **Option D — Unlimited auto-restart.** Maximum resilience, but a crash-looping engine restarts
  forever behind a flickering status, hiding a real fault.

**Recommendation**: **A**.

---

### Q-029 — What should record activity events

**Status**: Resolved → DEC-029 (backup-on-launch and engine start chosen)

**Question**: FOUNDATION-08 built an append-only activity feed and SHELL-08 displays it, but
`record_event` has no callers, so the panel is empty in normal use. What should produce events now,
rather than waiting for the phases that own each action?

- **Library backup on launch** — already happens every start; recording it is a line and a test.
- **Engine start and restart** — gives a visible trail of crashes, which is what makes DEC-028's
  bounded auto-restart honest rather than silent.
- **Match jobs started and finished** — overlaps the existing past-searches list.
- **Nothing else for now** — leave every producer to the phase that owns it.

**Recommendation**: the first two. Job events were considered and left out as duplicative.

---

## DECISION ROUND 5 — PERSISTENT LIBRARY ✅ Resolved 2026-09-02

Asked before writing Phase 3's step specifications. Three of these came out of reading the code
rather than the roadmap: Phase 1 had already built more of DEC-002 than the roadmap assumed,
inCrate turned out to keep its own persistent copy of the collection, and DEC-011's reference check
has nothing to check until Phase 6. Outcomes are DEC-030…DEC-037 in `DECISIONS.md`.

---

### Q-030 — inCrate's inventory and the new library

**Status**: Resolved → DEC-030 (Option A chosen: coexist now, converge in Phase 9)

**Question**: `incrate/inventory_db.py` already keeps a persistent copy of the collection — an
`inventory` table in a separate database under `%APPDATA%`, built from the same Rekordbox XML.
Phase 3 builds a second one, and two "import your collection" flows can disagree.

- **Option A — Coexist, converge in Phase 9.** Phase 3 stays focused; inCrate keeps its inventory
  until the phase that re-homes it behind Discover.
- **Option B — Converge now.** One source of truth immediately, at the cost of rewriting a working
  feature's data layer inside a phase about import.
- **Option C — Separate permanently.** Two collection imports become a permanent product feature.

**Recommendation**: **A**, with the duplication stated plainly in the docs meanwhile.

---

### Q-031 — Do Rekordbox playlists get persisted

**Status**: Resolved → DEC-031 (Option A chosen: mirror as read-only source data)

**Question**: `parse_playlist_tree()` already reads nested folders. Does the library store them?

- **Option A — Mirror the tree and membership, read-only.** Phase 4 browses by playlist, Phase 8
  exports them, and CuePoint's own Collections (Phase 6) stay a separate concept.
- **Option B — Tracks only.** Smallest Phase 3, at the cost of a second pass over import and
  refresh later.
- **Option C — Only selected playlists.** Less data, but the selection becomes state a refresh has
  to reconcile.

**Recommendation**: **A**.

---

### Q-032 — How a refresh applies its changes

**Status**: Resolved → DEC-032 (Option A chosen: preview, then apply on confirm)

**Question**: DEC-003 deletes tracks that vanish from the XML, and DEC-011's warning depends on
Collection references that do not exist until Phase 6. What does a refresh actually do?

- **Option A — Preview the diff and wait for confirmation**; the first import applies directly
  because there is nothing to lose. DEC-011's reference check is built now as a seam that returns
  zero until Phase 6.
- **Option B — Apply immediately, summarise after.** Fewer steps, but deletion is irreversible and
  the user learns about it afterwards.
- **Option C — Preview only when something would be deleted.** Closest to DEC-011's letter, at the
  cost of a flow that behaves differently between runs.

**Recommendation**: **A**.

---

### Q-033 — How the import runs

**Status**: Resolved → DEC-033 (Option A chosen: background job, reported in the status strip)

**Question**: A 50,000-track import parses a large XML and writes thousands of rows. Foreground or
background?

- **Option A — A background job.** FOUNDATION-07's `jobs` table already carries a `type`
  discriminator for exactly this, and SHELL-07's status strip already displays running jobs with
  progress.
- **Option B — Synchronous with its own progress endpoint.** Simpler, but blocks the request and
  duplicates progress reporting.
- **Option C — Background with no progress.** Cheapest, and shows nothing during the slowest
  operation in the app.

**Recommendation**: **A**.

---

### Q-034 — Which Rekordbox fields to capture

**Status**: Resolved → DEC-034 (Option A chosen: capture them all now)

**Question**: The parser reads none of Rating, PlayCount, Colour, DateAdded or Comments, and the
schema has no columns for them. Adding columns later is easy; backfilling needs a full re-import.

- **Option A — All of them now**, plus total time and bitrate.
- **Option B — Only rating and date added.**
- **Option C — None.**

**Recommendation**: **A**. One migration and one parser pass now, against asking every user to
re-import later.

---

### Q-035 — Where the XML comes from on a refresh

**Status**: Resolved → DEC-035 (Option A chosen: remember the path, re-read it)

**Question**: A refresh has to know which file to re-read.

- **Option A — Store the path and modified time with the import**, re-read on refresh, and say so
  when the file has moved or vanished.
- **Option B — Ask every time.** No staleness, but a file picker on every refresh, and nothing
  stops a different export silently replacing the library.
- **Option C — Watch the file and offer to refresh.** Convenient, but a background watcher and
  prompts at moments the user did not choose.

**Recommendation**: **A**.

---

### Q-036 — Whether inKey and inCrate move onto the library now

**Status**: Resolved → DEC-036 (Option A chosen: leave them untouched)

**Question**: Both parse an XML per run today, independently of any library.

- **Option A — Leave them.** DEC-021 already assigns inKey to Phase 7 and inCrate to Phase 9;
  those steps switch them over, with their own tests.
- **Option B — Switch inKey now.** One import instead of two, at the cost of rewriting a mature
  flow inside a phase about persistence.

**Recommendation**: **A**.

---

### Q-037 — Missing audio files

**Status**: Resolved → DEC-037 (Option A chosen: record the path, check later)

**Question**: Rekordbox exports paths; files move and disappear. Does import check?

- **Option A — No check in Phase 3.** Import stores the path Rekordbox gave. Phase 7 owns
  missing-file detection alongside duplicates and health.
- **Option B — Check on import.** Immediate answer, at the cost of a full filesystem scan on every
  import and work duplicated with Phase 7.
- **Option C — Check lazily when a track is used.** No import cost, but spreads file-existence
  logic across screens before there is a player or Clean flow to own it.

**Recommendation**: **A**.

---

## DECISION ROUND 6 — LIBRARY UI ✅ Resolved 2026-09-04

Asked before writing Phase 4's step specifications. Three of these came out of reading the code
rather than the roadmap: `/api/v1/library/search` answers nothing for a blank query, so browsing
has no data path at all today; `ResultsTable` sorts an in-memory array, which is a different
program at 50,000 rows than at 400; and the Rekordbox playlist tree LIBRARY-03 mirrored is stored
but has never been exposed over HTTP. Outcomes are DEC-039…DEC-048 in `DECISIONS.md`.

---

### Q-038 — Where browsing lives

**Status**: Resolved → DEC-039 (Option A chosen: the Library page becomes the browser)

**Question**: `LibraryScreen` shows counts, the source file and the import/refresh controls, and a
test asserts it renders no table. Where does the track table go?

- **Option A — The Library page becomes the browser**: playlist pane, table and Inspector, with
  import and refresh compressed into a header.
- **Option B — A second destination.** Library keeps its summary; a new "Browse" entry holds the
  table.
- **Option C — Tabs inside Library**: Overview and Tracks.

**Recommendation**: **A** — DEC-020's registry declares one `library` destination and the target IA
has no second one; B would invent a destination the registry exists to avoid inventing ad hoc.

---

### Q-039 — Where rows come from at fifty thousand tracks

**Status**: Resolved → DEC-040 (Option A chosen: server-side windowed queries)

**Question**: `ResultsTable` holds every row in memory and sorts in JavaScript. LIBRARY-12 measured
the library at 50,000 tracks. What feeds the table?

- **Option A — Server-side windowed queries.** Scope, filter, sort and paging in SQL; the renderer
  holds a window and fetches as it scrolls. Extends `/api/v1/library/search` per DEC-023.
- **Option B — Load everything once**, sorting and filtering client-side, as today's table does.
- **Option C — Hybrid.** A compact in-memory index of ids and sort keys, row detail fetched per
  window.

**Recommendation**: **A**. Costs: new indexes, a stable tiebreak so paging cannot repeat or skip a
row, and sort becoming an API parameter rather than a click handler. B is far less code and will be
comfortable at 4,000 rows and wrong at 50,000 — which is the size this library is designed for.

---

### Q-040 — One table component or two

**Status**: Resolved → DEC-041 (Option A chosen: a new generic table, converge in Phase 7)

**Question**: The roadmap says Phase 4 "generalizes `ResultsTable` into the Universal Track Table".
`ResultsTable` is mature, virtualized and load-bearing for inKey's results screen, and its 14
columns are match-specific.

- **Option A — Extract a generic `TrackTable`** from its proven parts, use it for the library now,
  and migrate the results screen in Phase 7 when inKey becomes Clean. Coexist, then converge — the
  pattern DEC-030 and DEC-036 already set.
- **Option B — Refactor `ResultsTable` in place** and re-express match columns against the generic
  table immediately.
- **Option C — Two tables permanently.**

**Recommendation**: **A**.

---

### Q-041 — Columns

**Status**: Resolved → DEC-042 (Option C chosen: show/hide and reorder, both persisted)

**Question**: Today's table has a fixed 14-column grid with persisted widths. A library table is
looked at for hours by people with strong opinions about what belongs on screen.

- **Option A — A fixed default set.**
- **Option B — Show/hide picker**, persisted, alongside the existing width persistence.
- **Option C — B plus drag-to-reorder.**

**Recommendation**: **B**; reorder is real work in a virtualized grid for less payoff than hiding.
**User chose C** — order is part of how a table is read, and a column you cannot move is a column
you end up hiding.

---

### Q-042 — Filters, and whether they are the Smart Collection engine

**Status**: Resolved → DEC-043 (Option B chosen: facets over one shared rule model)

**Question**: The roadmap asks Phase 4 for "the reusable filter system that doesn't exist today",
and DEC-016 already settled that Phase 6's Smart Collections are flat AND-only rule sets. Those are
the same shape.

- **Option A — Playlist scope and text search only** this phase.
- **Option B — Field facets too** (genre, key, BPM range, year, rating, label), built as the
  reusable component, with a rule vocabulary deliberately shaped so Phase 6's Smart Collections
  reuse it rather than growing a second one.
- **Option C — A full rule builder now**, with Phase 6 adding only persistence.

**Recommendation**: **B** — one model, built once, saved later.

---

### Q-043 — The playlist tree

**Status**: Resolved → DEC-044 (Option A chosen: the tree scopes the table)

**Question**: DEC-031 mirrored the tree and its membership read-only, explicitly so Phase 4 could
browse by playlist. Nothing exposes it over HTTP yet.

- **Option A — A tree pane that scopes the table**, with "as arranged in Rekordbox" as the default
  sort inside a playlist.
- **Option B — A playlist filter chip**, no tree.
- **Option C — No playlist browsing in Phase 4.**

**Recommendation**: **A**. It needs a new playlists endpoint, which is a full six-file
desktop-contract change.

---

### Q-044 — Selection

**Status**: Resolved → DEC-045 (Option A chosen: multi-select now)

**Question**: Nothing in this build can act on a set of tracks — tags and Collections arrive in
Phase 6, Clean actions in Phase 7. Is selection built before the actions exist?

- **Option A — Multi-select now** (ctrl/shift, select all, a selection count), with only the
  actions that exist today: copy, and reveal in the file manager.
- **Option B — Single-select now**, multi-select in Phase 6 when there is something to do with it.

**Recommendation**: **A** — retrofitting a selection model into a virtualized table with windowed
data later is worse than building it once, and every phase after this one wants it.

---

### Q-045 — Double-click before a player exists

**Status**: Resolved → DEC-046 (Option A chosen: double-click stays inert)

**Question**: DEC-012 says double-click plays the track and loads the current view as the queue.
Phase 5 is where that becomes possible.

- **Option A — Double-click does nothing yet**; single click selects and fills the Inspector.
- **Option B — Double-click opens the Inspector** now and changes meaning in Phase 5.
- **Option C — Double-click reveals the file.**

**Recommendation**: **A** — B teaches a gesture in order to take it away.

---

### Q-046 — Inspector content

**Status**: Resolved → DEC-047 (Option A chosen: everything imported, read-only)

**Question**: DEC-024 built the Inspector container empty and left each later phase to fill it.
Phase 4 is the first phase with something to put there.

- **Option A — Everything imported, read-only**: all DEC-034 fields, the file path, and playlist
  membership.
- **Option B — Minimal identity only** (title, artist, key, BPM, path).
- **Option C — Leave it empty** until Phase 6 and 7 have editable fields.

**Recommendation**: **A**. Membership needs a track-detail endpoint; the repository method
(`playlist_ids_for_track`) already exists.

---

### Q-047 — Typography at table density

**Status**: Resolved → DEC-048 (Option B chosen: a data font for dense values)

**Question**: `PIXEL_DESIGN_SYSTEM.md` §4 records that Pixelify Sans was never signed off for dense
data tables, and notes that the Universal Track Table "will be exactly this".

- **Option A — Keep Pixelify Sans everywhere** and tune size and row height.
- **Option B — Keep the pixel chrome**, and introduce a `--font-data` token used only in table
  cells and Inspector values.
- **Option C — Run a readability check first** and decide after.

**Recommendation**: **B** — the identity lives in the black outlines, bevels and hard shadows, not
in the numerals.

---

## Not yet asked (deferred to a later round)

Per the spec's own guidance not to dump every question at once — these are real open items
surfaced by the audit but held back until the decisions they depend on are locked:

- ~~Crossfade support~~ — asked as Q-055 in Round 7 and resolved by DEC-056 (no crossfade in v1)
- Audio analysis scope (which features are worth building at all — likely a Phase 12 conversation)
- Smart Collection export/duplication behavior (target spec §28 asks whether Smart Collections
  should be directly exportable and whether rule sets can be duplicated — not yet asked)

**Resolved since first listed here**: crossfade became Q-055/DEC-056 in Round 7, asked before
Phase 5's contract was written because a crossfade decides whether that contract needs a second
decoder. The collapsible-sidebar question became Q-022/DEC-022 in
Round 3. The `services/` Qt-boundary violation and the CI-gap items were folded into FOUNDATION-01
and FOUNDATION-13 and are done. The Smart Collection question above is now narrower than when it
was written: DEC-043 settled that Phase 6's rules and Phase 4's filters are one model, so what
remains open is only export and duplication of a *saved* rule set.

---

## DECISION ROUND 7 — PLAYER ✅ Resolved 2026-09-05

Asked before writing Phase 5's step specifications. DEC-005 chose libmpv and DEC-012/013/014
settled double-click, queue append and no-resume back in Round 2, but none of them says how mpv is
embedded, who holds the queue, or what the bar contains — and Phase 5 is the first phase that adds
a second bundled per-OS binary to a release pipeline the audit already flagged as lightly tested.
Two of these came from reading the code rather than the roadmap: `PlayerRegion` currently returns
`null` and is the single file DEC-025 promised Phase 5 would change, and `tracks.play_count` is
already populated *from Rekordbox*, so "count plays" is a write against a column CuePoint does not
own. Q-055 closes the crossfade item deferred since Round 2. Outcomes are DEC-049…DEC-056 in
`DECISIONS.md`.

---

### Q-048 — How libmpv is embedded

**Status**: Resolved → DEC-049 (Option A chosen: bundle the mpv binary, JSON IPC)

**Question**: DEC-005 says "libmpv sidecar" without saying what that binary is. The shape decides
PLAYER-01–03's control contract and everything about packaging and signing.

- **Option A — Bundle the official prebuilt `mpv` executable** per OS, spawn it with `--idle
  --input-ipc-server`, and speak JSON over a named pipe (Windows) or unix socket. Mirrors
  `EngineSupervisor` exactly; no compiler in the release path; LGPL satisfied by shipping an
  unmodified binary.
- **Option B — A native N-API addon** linking libmpv into Electron main. Lowest latency and direct
  property access, at the cost of per-OS, per-Electron-ABI compilation and native crashes that
  take the app down with them.
- **Option C — A custom C/Rust sidecar** around libmpv speaking our own protocol. Most control,
  most new code, and the only option that puts a toolchain we own in the release path.

**Recommendation**: **A**. The repository already knows how to build, ship, supervise and smoke-test
a sidecar; this is the option that reuses all of it.

---

### Q-049 — Who owns playback state

**Status**: Resolved → DEC-050 (Option A chosen: Electron main owns it)

**Question**: The queue, the current track and the position have to live somewhere. AGENTS.md says
business rules live in Python and Electron supervises — playback is not obviously either.

- **Option A — Electron main.** Holds the queue, mirrors mpv's state to the renderer over IPC;
  Python never hears about playback.
- **Option B — The Python engine.** One source of truth, queryable by Phase 10's Set Builder, at
  the cost of routing every transport tick across two process boundaries.
- **Option C — Split.** Main drives live transport; the engine is told only durable facts.

**Recommendation**: **A**, given Q-050's answer. C is the right long-term shape, but with nothing
written to the database in this phase its engine half would have nothing to record.

---

### Q-050 — Whether playback writes to the library

**Status**: Resolved → DEC-051 (Option A chosen: nothing in Phase 5)

**Question**: `tracks.play_count` already holds a value imported from Rekordbox (m0005). Does
playing a track in CuePoint change anything in the database?

- **Option A — Nothing in Phase 5.** Playback is read-only against the library.
- **Option B — CuePoint-owned counters** (`cuepoint_play_count`, `last_played_at`) written on a
  play threshold, never touching the imported values.
- **Option C — Activity-log entries only**, no new columns.

**Recommendation**: **A**. Both alternatives require defining what "played" means — a threshold
that is arbitrary until someone actually wants the number for something.

---

### Q-051 — What the player bar contains

**Status**: Resolved → DEC-052 (Option C chosen: transport, shuffle/repeat, and a queue panel)

**Question**: Waveforms are Phase 11 regardless. What ships in the bar itself?

- **Option A — Transport, seek and volume**: play/pause, previous/next, position bar with
  elapsed/total, volume, current-track info.
- **Option B — Plus shuffle and repeat** as persisted toggles.
- **Option C — Plus a visible, reorderable queue panel**, so DEC-013's Play Next and Add to Queue
  have somewhere to show their result.

**Recommendation**: **A** for scope discipline, but C is defensible: DEC-013 makes two append
actions first-class from day one, and an append action with no visible queue is an action whose
effect the user cannot see.

---

### Q-052 — The bar when nothing is playing

**Status**: Resolved → DEC-053 (Option B chosen: appears on first play)

**Question**: DEC-025 holds the region at zero height and gave the reason: never ship controls that
do nothing. Once they do something, does the bar appear before it has a track?

- **Option A — Always visible from launch** with disabled transport; no layout shift, but it
  reverses DEC-025's reasoning.
- **Option B — Zero-height until the first play**, then present for the rest of the session.
- **Option C — Always visible with a pixel empty state**, the way the Inspector handled its own
  empty slot.

**Recommendation**: **B**. It is the reading of DEC-025 that survives contact with Phase 5, and the
one-time layout shift is a smaller cost than a permanently reserved strip with nothing in it.

---

### Q-053 — A queued file that will not play

**Status**: Resolved → DEC-054 (Option A chosen: skip and toast)

**Question**: DEC-037 deliberately left file existence unchecked until Phase 7. The player is the
first thing that opens these files, so it is the first thing that finds them gone.

- **Option A — Skip with a toast** naming the track, and continue the queue.
- **Option B — Stop and report** against the failed track until the user acts.
- **Option C — Skip silently**, recording every failure in the activity feed.

**Recommendation**: **A**, with coalescing: a 500-track queue on a disconnected drive must produce
one toast, not five hundred. B lets a single bad file end the session; C leaves a user who never
opens Activity wondering why tracks vanished.

---

### Q-054 — How much audio control is exposed

**Status**: Resolved → DEC-055 (Option A chosen: device picker and exclusive mode)

**Question**: DEC-005 was chosen for foobar2000-grade quality. A bundled high-quality decoder
playing to the wrong device at the system mixer's sample rate does not deliver that.

- **Option A — Output-device picker plus exclusive output** (WASAPI exclusive on Windows, hog mode
  on macOS) with mpv's high-quality resampler configured explicitly.
- **Option B — Device picker only**, everything else at mpv's defaults.
- **Option C — No audio settings in Phase 5.**
- **Option D — A, plus ReplayGain/volume normalization.**

**Recommendation**: **A**. C leaves a DJ with an audio interface unable to route CuePoint to it,
which is a plausible day-one complaint. D needs scan data the library does not have and drags
Phase 12's analysis scope forward.

---

### Q-055 — Crossfade

**Status**: Resolved → DEC-056 (Option A chosen: no crossfade in v1)

**Question**: Deferred since Round 2, due now because it shapes the mpv control contract — a
crossfade needs either two decoder instances or a filter graph, decided before the contract is
written, not after.

- **Option A — No crossfade in v1.** Gapless only, which mpv provides for free.
- **Option B — A fixed, configurable crossfade** between queue items.
- **Option C — Defer again**, keeping the contract deliberately open for it until Phase 10.

**Recommendation**: **A**. CuePoint prepares sets; the mixing happens in Rekordbox. B also fights
gapless — the two features want opposite things at a track boundary.
