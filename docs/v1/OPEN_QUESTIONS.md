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
- ~~Smart Collection export/duplication behavior~~ — asked as Q-060 in Round 8 and resolved by
  DEC-061 (live, duplicable, freezable), and the direct-export half it left to Phase 8 asked as
  Q-082 in Round 10 and resolved by DEC-081 (exports as its membership at export time)

**Resolved since first listed here**: crossfade became Q-055/DEC-056 in Round 7, asked before
Phase 5's contract was written because a crossfade decides whether that contract needs a second
decoder. The collapsible-sidebar question became Q-022/DEC-022 in
Round 3. The `services/` Qt-boundary violation and the CI-gap items were folded into FOUNDATION-01
and FOUNDATION-13 and are done. The Smart Collection question narrowed twice before it was asked:
DEC-043 settled that Phase 6's rules and Phase 4's filters are one model, leaving only export and
duplication of a *saved* rule set, which Round 8 asked as Q-060. Audio analysis scope is the only
item still held back.

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

---

## DECISION ROUND 8 — ORGANIZATION ✅ Resolved 2026-09-06

Asked before writing Phase 6's step specifications. Round 1 and Round 2 settled the shape of the
organizational layer in the abstract — DEC-006 (Collections only), DEC-015 (flat tags), DEC-016
(flat AND-only rules), DEC-008 (per-field history, no undo stack) — and Round 6 settled that
Phase 4's filters and Phase 6's Smart Collections are one model (DEC-043). None of them says who
owns a rating, what a Collection is structurally, where one is browsed, or what a rule may talk
about.

Four of these came from reading the code rather than the roadmap: `tracks.rating` and
`tracks.comment` are already populated *from Rekordbox*, so "rate a track" and "write a note" are
writes against columns CuePoint does not own; `filter_sql.py` compiles rules to bare column
predicates on one table, with no joins, so a rule about a tag is a different shape of SQL than
anything it emits today; `references_for()` is the DEC-011 seam that answers zero because nothing
can reference a track yet, and this is the phase that makes it answer; and `navRegistry.ts`
declares a disabled `collections` destination while DEC-039 decided the Library page *is* the
browser.

Q-060 closes the Smart Collection export/duplication item deferred since Round 2. Outcomes are
DEC-057…DEC-064 in `DECISIONS.md`. Two answers went against the recommendation — Q-057 and Q-058 —
and both are noted as such below, because the reasoning trail is worth more than a tidy record.

---

### Q-056 — Who owns a track's rating, and where do notes live

**Status**: Resolved → DEC-057 (Option A chosen: CuePoint metadata is its own layer)

**Question**: Ratings, favorites and notes are entirely new (GAP_ANALYSIS §E), but `tracks.rating`
and `tracks.comment` already exist and are already populated from Rekordbox by DEC-034's import,
and shown read-only in the Inspector by DEC-047. A user rating a track is therefore a write against
a column CuePoint does not own, and the next refresh re-imports it.

- **Option A — CuePoint metadata is its own column set**, Rekordbox's stays untouched, and the UI
  shows an effective value with its source (the DEC-004 precedence shape, reused). A refresh can
  never overwrite a user's rating.
- **Option B — One rating field.** Editing overwrites the imported value; the next refresh
  overwrites the edit.
- **Option C — One field plus a dirty flag.** Refresh skips fields the user has touched.

**Recommendation**: **A**. It is the only option where Phase 8's export can answer "whose value do
I write?", and it reuses DEC-004's precedence model rather than inventing a second one. B loses
user data on a routine refresh; C keeps one column meaning two things depending on a flag.

---

### Q-057 — Is a Collection ordered, and may a track appear twice in one

**Status**: Resolved → DEC-058 (Option C chosen: ordered, duplicates allowed — **not** the
recommended option)

**Question**: DEC-006 made Collections the only CuePoint-native organizational unit. Its structure
was never specified, and Phase 8 has to export one into a Rekordbox playlist, which is ordered.

- **Option A — Ordered, duplicates rejected.** A Collection is a set of tracks; a Phase 10 Set is a
  running order.
- **Option B — Unordered.** The table's sort is the only order there is.
- **Option C — Ordered, duplicates allowed**, matching DEC-017's rule for Sets.

**Recommendation**: **A**. Rekordbox playlists are ordered, so B loses information at the export
boundary; rejecting duplicates is what keeps DEC-006 coherent, since the set/running-order
difference is the reason there is no third concept.

**Chosen**: **C**. Consistency with DEC-017 was preferred over the structural distinction: a DJ who
can repeat a track in a Set and not in a Collection has to learn a rule with no reason behind it.
The consequence — that the Collection/Set distinction now rests entirely on what Phase 10 adds
rather than on structure — is recorded in DEC-058 so Phase 10 does not rediscover it as an argument
for merging the two.

---

### Q-058 — Do Collections nest

**Status**: Resolved → DEC-059 (Option B chosen: folders from day one — **not** the recommended
option)

**Question**: A DJ's mental index is a tree (DEC-044 says so about the Rekordbox pane). Whether
CuePoint's own Collections get one is a schema and a UI decision, and retrofitting a tree into a
flat list is cheaper in the database than in the interface.

- **Option A — Flat in v1**, with a nullable `parent_id` carried from the start so folders can
  arrive later without a migration (the DEC-016 pattern).
- **Option B — Folders from day one**, mirroring the tree already mirrored in
  `rekordbox_playlists`.
- **Option C — Flat forever.** Tags do the grouping.

**Recommendation**: **A**. B is real tree UI — drag, move, rename, cycle prevention, cascade
delete — for a library that starts with zero collections.

**Chosen**: **B**. The pane will already be rendering one tree next to it, and a user who files
Rekordbox playlists in folders will file Collections in folders on the first day. Building the flat
version first would mean writing the pane twice. The cost is accepted explicitly: DEC-059 lists the
tree operations as phase scope rather than leaving them to be discovered mid-step.

---

### Q-059 — Can a rule reference CuePoint-owned data

**Status**: Resolved → DEC-060 (Option A chosen: rules reach tags, ratings, favorites and
membership)

**Question**: DEC-043's vocabulary is seventeen columns of `tracks`, and `filter_sql.py` compiles
each rule to a bare predicate on that one table — no joins, no aliases. "Tagged Peak-time AND rated
at least 4 AND not in Collection X" is a different shape of SQL.

- **Option A — Extend the vocabulary** to tags, CuePoint rating, favorite, notes and Collection
  membership; the compiler grows `EXISTS` subqueries. A Smart Collection may not reference another
  Smart Collection.
- **Option B — Scalars only** (favorite, rating, tags); no membership rules.
- **Option C — Keep rules on `tracks` columns only.**

**Recommendation**: **A**. Tag-based Smart Collections are most of the point of having tags, and a
filter bar that cannot say "tagged X" while a Smart Collection can would be precisely the drift
DEC-043 was written to prevent.

---

### Q-060 — Smart Collection liveness, duplication and export

**Status**: Resolved → DEC-061 (Option A chosen: live, duplicable, freezable) · **Closes** the item
deferred since Round 2

**Question**: Deferred since Round 2 and narrowed by DEC-043 to exactly this: what a *saved* rule
set can do. Target spec §28 asks whether Smart Collections are directly exportable and whether rule
sets can be duplicated.

- **Option A — Always live** (evaluated per query, never materialized), rule sets can be
  duplicated, "Freeze to Collection" converts current membership into a static Collection, and
  direct export stays Phase 8's decision.
- **Option B — Live, no duplication, no freeze.**
- **Option C — Materialized membership**, refreshed on a trigger.

**Recommendation**: **A**. DEC-040 already made windowed SQL over 50,000 rows the norm, so
materializing buys nothing and adds a staleness bug with an invalidation rule to get wrong.

---

### Q-061 — Where Collections live in the UI

**Status**: Resolved → DEC-062 (Option B chosen: the Library page's left pane)

**Question**: `navRegistry.ts` has declared a disabled `collections` destination since DEC-020, and
DEC-039 then decided that the Library page *is* the browser. Phase 6 has to reconcile them.

- **Option A — Enable the nav destination** as its own page, with its own list and its own table.
- **Option B — A second section in the Library page's left pane**, beside the mirrored Rekordbox
  tree; selecting a Collection scopes the same table, by DEC-044's mechanism.
- **Option C — Both surfaces.**

**Recommendation**: **B**. One browser, one selection model, one filter bar, one table. It amends
DEC-020's IA, which is why it is a question and not an assumption.

---

### Q-062 — How a batch edit runs over "everything matching"

**Status**: Resolved → DEC-063 (Option A chosen: threshold, then a job; full history either way)

**Question**: DEC-045 lets a selection be a *description* — the current query over 47,913 rows —
specifically so Phase 6 could tag all of them. DEC-008 promises per-field revert, which at that
size is 47,913 history rows for one gesture.

- **Option A — Small selections apply synchronously**, anything above a threshold runs as a
  background job (DEC-033's pattern); full per-field history either way, every row carrying a shared
  batch id.
- **Option B — Always a background job.**
- **Option C — A job, with one summary history row per batch** instead of per track.

**Recommendation**: **A**. C is cheaper storage in exchange for breaking the one promise DEC-008
made instead of building an undo stack — and a batch edit is exactly the operation a user most
wants to take back.

---

### Q-063 — Does Phase 6 write anything outside the database

**Status**: Resolved → DEC-064 (Option A chosen: database only)

**Question**: `data/tag_writer.py` already writes ID3/Vorbis tags to audio files, safely and well.
Whether Phase 6 uses it decides whether rating a track modifies files on disk.

- **Option A — No.** Ratings, tags and notes live in CuePoint's database only; carrying them into
  files or into Rekordbox is Phase 8's decision.
- **Option B — Write through to audio files** as edits are made.

**Recommendation**: **A**. Same discipline as DEC-051 kept for the player, and it keeps Phase 6
clear of "I rated one track and CuePoint modified four hundred files" as a failure mode.

---

## DECISION ROUND 9 — CLEAN ✅ Resolved 2026-09-13

Asked before writing Phase 7's step specifications. Round 1 settled the one rule this phase was
known to need — DEC-004, accept and apply are separate — and Rounds 3, 5 and 6 left it three
obligations: re-home inKey into Clean (DEC-021), move it onto the library (DEC-036), and converge
`ResultsTable` onto `TrackTable` (DEC-041). DEC-037 left it missing-file detection, and Phase 6
left it duplicates, health, artwork and per-field revert of CuePoint values. None of that says what
a match runs over, what survives a re-match, where an applied value is stored, or whether anything
is written to disk.

Five of these came from reading the code rather than the roadmap: inKey still reads its tracks from
an XML or M3U file on every run, so no result is attached to a library track; match results exist
only as per-run CSV and JSONL files, so nothing survives a re-match; `_confidence_label()`'s
"high" tier (≥95) is a display label and gates nothing; the existing `REVERTABLE_FIELDS` path
writes Rekordbox-owned columns on `tracks`, which the next refresh overwrites; and neither
`tag_writer.py` nor the Beatport page parser handles artwork at all — `artwork_url` exists on
`BeatportCandidate` and is never populated.

Outcomes are DEC-065…DEC-076 in `DECISIONS.md`. One answer went against the recommendation — Q-075,
artwork — and is noted as such below. Q-064 was re-asked after the user asked what "a Clean match"
meant; the clarified wording is the one recorded.

---

### Q-064 — What a match runs over

**Status**: Resolved → DEC-065 (Option A chosen: library tracks only)

**Question**: inKey matches tracks read from an XML playlist or an M3U file on each run. A "match"
here is inKey's existing process — build queries from a track's title and artist, search Beatport,
score candidates, reject the wrong ones with a reason, keep the best. When it moves into Clean,
where are the tracks chosen from?

- **Option A — Library tracks only.** Any scope the Library already browses — a Rekordbox
  playlist, a Collection, a Smart Collection, the current filter or a selection — as a resumable
  job that skips tracks already decided unless asked to re-match. XML/M3U input retires with inKey.
- **Option B — Library, plus playlist files.** Tracks from a file that are not in the library get a
  one-off result that is not stored, as today.
- **Option C — Library, plus automatic matching on import.** New tracks from each import or refresh
  are queued without being asked.

**Recommendation**: **A**. A result has to belong to a track to be stored (Q-065), reviewed, applied
(Q-067) or counted (Q-074). B keeps a second, unstored kind of result alive for one input path. C
starts slow network scraping nobody asked for.

---

### Q-065 — How much match history is kept

**Status**: Resolved → DEC-066 (Option A chosen: every attempt, all candidates)

**Question**: GAP_ANALYSIS §C requires match history to survive re-matching, and AGENTS.md requires
matching to stay reviewable — candidates, rejection reasons, confidence. How much is stored?

- **Option A — Every attempt, with all its candidates**, scores, rejection reasons and queries. A
  re-match adds an attempt and overwrites nothing.
- **Option B — The latest attempt in full**; older attempts reduced to a summary row.
- **Option C — The decision only**; candidates stay in per-run files.

**Recommendation**: **A**. Roughly a million candidate rows at 50,000 tracks is ordinary for SQLite,
and B and C both discard exactly the evidence a user needs to understand why a match changed.

---

### Q-066 — What auto-accepts, and what a re-match does to a user's decision

**Status**: Resolved → DEC-067 (Option A chosen: the high tier, fixed; user decisions stick)

**Question**: DEC-004 auto-marks high-confidence matches accepted but does not say where "high"
is, or whether re-running a match can undo review work.

- **Option A — ≥95 with every guard passed, as a named constant.** Anything else with a candidate
  needs review. A re-match never changes a user's accept or reject; a better candidate is flagged.
- **Option B — The same, with the threshold a user setting.**
- **Option C — ≥95 fixed, and a re-match re-evaluates everything**, including user decisions.

**Recommendation**: **A**. ≥95 is the matcher's existing "high" boundary, so no new number is
invented. A setting invites tuning a threshold nobody can see the effect of; C lets a re-run erase
an afternoon of review.

---

### Q-067 — Where applied Beatport values are stored

**Status**: Resolved → DEC-068 (Option A chosen: a CuePoint override layer, with revert)

**Question**: Applying an accepted match writes key, BPM, genre, label and year. Those columns on
`tracks` belong to Rekordbox and are rewritten by every refresh.

- **Option A — A CuePoint override layer** beside the imported columns: effective value is the
  override when set, otherwise Rekordbox's; per-field history under a batch id; per-field and
  per-batch revert built, closing Phase 6's deferred revert.
- **Option B — Write into the `tracks` columns.**
- **Option C — The override layer, with revert still deferred.**

**Recommendation**: **A**. It is DEC-057's model reused for the same problem. B is silently undone
by the next refresh and leaves Phase 8 unable to choose whose value to export. Applying a batch of
Beatport values is the operation a user most wants to take back, which is why C is not enough.

---

### Q-068 — Whether a user can type metadata by hand

**Status**: Resolved → DEC-069 (Option A chosen: the fields Beatport supplies)

**Question**: GAP_ANALYSIS §C lists a batch metadata editor as missing. With Q-067's layer in place,
may a user edit values directly rather than only apply them from a match?

- **Option A — Yes, for key, BPM, genre, label and year**, single and batch, into the same layer.
  Title, artist and remixer stay Rekordbox's.
- **Option B — Yes, for every text field**, including title, artist, remixer and album.
- **Option C — No; values come only from an accepted match.**

**Recommendation**: **A**. Nearly free once the layer exists. Title, artist and remixer are what
matching searches on and what DEC-002's identity fallback reads, so B would force matching to choose
between an edited title and an imported one.

---

### Q-069 — Whether Phase 7 writes audio-file tags

**Status**: Resolved → DEC-070 (Option A chosen: an explicit job that records what it replaced)

**Question**: inKey's Sync Tags writes Key, Comment, Year, Label, BPM and Genre into audio files
today. Retiring inKey without a replacement removes a capability users have; DEC-064 kept
`tag_writer.py` for Phases 7 and 8.

- **Option A — A separate, user-initiated "Write tags to files" job** over effective values:
  previewed, cancellable, recording each file's previous tag values before writing so the write is
  auditable and reversible. Today's field toggles, key format and WAV rule carry over.
- **Option B — Port today's sync unchanged**, without recording prior values.
- **Option C — Defer to Phase 8**; Phase 7 writes only the database.

**Recommendation**: **A**. B carries forward a write that cannot be undone into a phase that has
just built revert for everything else. C is a regression for anyone who uses inKey today.

---

### Q-070 — What happens to inKey, Results and their extras

**Status**: Resolved → DEC-071 (Option A chosen: retire into Clean)

**Question**: DEC-021 and DEC-041 require inKey to be re-homed and `ResultsTable` to converge.
Around them sit past-search history (per-run CSVs read back by `history_api.py`), CSV/JSON/Excel
export, and the candidate dialog.

- **Option A — Retire into Clean.** Tools loses inKey and Results; `TrackTable` replaces
  `ResultsTable` and `CandidateDialog`; past searches stop being a screen, their files stay on disk
  unimported; export survives as "export review list".
- **Option B — Retire, and import past CSV runs** into match history.
- **Option C — Keep inKey beside Clean** for now, amending DEC-021 and DEC-041.

**Recommendation**: **A**. B imports results whose candidates were matched against a different track
list with no reliable way to attach them to library tracks. C keeps two match flows alive.

---

### Q-071 — Where Clean lives in the UI

**Status**: Resolved → DEC-072 (Option A chosen: its own page, with hooks in the Library)

**Question**: DEC-062 folded Collections into the Library page rather than a second browser. Does
Clean follow that, or earn a page?

- **Option A — Its own page**: a review queue by match state with side-by-side candidate comparison,
  plus Missing files, Duplicates and Health. The Library gains a "Match on Beatport" action, a
  match-state column and filter; the Inspector gains a Beatport comparison (DEC-047).
- **Option B — Folded into the Library**, with review in the Inspector.
- **Option C — A separate page each** for review, duplicates, missing files and health.

**Recommendation**: **A**. Comparing a track with five candidates does not fit an Inspector column,
which is the difference from DEC-062's case. C spreads four views of one job across four
destinations.

---

### Q-072 — How missing files are found, and whether CuePoint fixes them

**Status**: Resolved → DEC-073 (Option A chosen: a scan job; relocation stays in Rekordbox)

**Question**: DEC-037 deferred file-existence checks here. Checking 50,000 paths is a slow scan, and
a found-missing file raises the question of relocating it.

- **Option A — A cancellable "Check files" job**, also run after each import or refresh; status and
  check time stored and filterable. No relocation: paths are Rekordbox's, fixed there with its own
  Relocate and brought in by a refresh.
- **Option B — The same, plus a relocation override** stored by CuePoint and used by the player and
  tag writer.
- **Option C — Scan automatically on every launch.**

**Recommendation**: **A**. B creates a path that disagrees with Rekordbox until Phase 8 exports it,
and every consumer of `file_path` would need to know which to use. C puts 50,000 file checks in
front of startup on a disconnected drive.

---

### Q-073 — What a duplicate is, and what can be done about one

**Status**: Resolved → DEC-074 (Option A chosen: metadata signals, nothing deleted)

**Question**: No track-duplicate detection exists (CURRENT_ARCHITECTURE §13).

- **Option A — Groups from metadata signals**: same normalized path, same accepted Beatport track
  id, or same normalized artist + title + mix within ±2 s. Each group says why. "Not duplicates" is
  remembered; tag, Collection and reveal actions; nothing is deleted.
- **Option B — Also hash audio contents.**
- **Option C — Identical normalized artist and title only.**

**Recommendation**: **A**. B reads every file in the library; acoustic fingerprinting belongs to
Phase 12. C misses both the strongest signal (the same Beatport release) and the most common real
duplicate (one file imported twice). Deleting is out because a refresh re-adds the track and the
file is user data.

---

### Q-074 — What Library Health is

**Status**: Resolved → DEC-075 (Option A chosen: counts, no score)

**Question**: GAP_ANALYSIS §C lists a health score as missing. Is it a number?

- **Option A — Concrete counts**, each opening the Library filtered to exactly those tracks.
- **Option B — A 0–100 score** with the counts beneath.
- **Option C — Defer health**; ship the detections only.

**Recommendation**: **A**. A score needs weights nobody can justify, and "explain, don't silently
decide" is the principle DEC-004 already applied to this phase.

---

### Q-075 — Whether artwork is in Phase 7

**Status**: Resolved → DEC-076 (Option C chosen: embedded and Beatport artwork — **against the
recommendation**, which was to defer; follow-up resolved as "embed only where missing", also
against its recommendation, which was display only)

**Question**: Phase 6 deferred artwork here. Nothing populates `artwork_url` and `tag_writer.py`
neither reads nor writes pictures.

- **Option A — Defer.**
- **Option B — Beatport artwork for accepted matches**, cached as thumbnails and displayed.
- **Option C — Embedded artwork read from files, plus Beatport artwork.**

**Follow-up**: should the file-tag job (DEC-070) also embed Beatport artwork into files?

- **Display only** — nothing written.
- **Optional embed toggle**, replacing existing artwork after recording it.
- **Embed only where the file has none**, never replacing.

**Recommendation**: **A**, then **display only** — artwork is not a cleaning task, and both sources
are new code. **Chosen**: C, and embed where missing. The user wants artwork visible and wants files
without any to receive it. Never replacing existing artwork keeps the write additive, which is the
property that makes it acceptable inside DEC-070's recorded, reversible job.

---

### Q-076 — Does the refresh warning count more than Collections

**Status**: Resolved → DEC-011, amended 2026-09-13 (Option A chosen: count everything the user
authored). Raised while writing `PHASE7_CLEAN.md`; the user delegated the choice.

**Question**: A refresh that deletes a track cascades its CuePoint rating, note, tags and, from
Phase 7, its match decisions and applied values. `references_for()` counts only Collections and
Sets. Should the DEC-011 warning count the rest?

- **Option A — Count every track carrying data that cannot be recomputed**: Collection membership, a
  rating, favorite or note, a tag, a user's match decision, an override. Re-derivable data
  (attempts, auto states, file status, duplicates, artwork state) is not counted.
- **Option B — Add only Phase 7's data**: review decisions and applied values.
- **Option C — Leave DEC-011 as it is.**

**Recommendation**: **A**. B draws the line by phase rather than by what a user would lose, and
leaves a rated, tagged track deletable with no specific warning. C lets a routine refresh erase
review work silently. A keeps the common case — deleting tracks nobody touched — prompt-free.

---

### Q-077 — Thumbnails or original images

**Status**: Resolved → DEC-076, amended 2026-09-13 (Option A chosen: real thumbnails, Pillow at
runtime). Raised while writing `PHASE7_CLEAN.md`; the user delegated the choice.

**Question**: DEC-076 says artwork is cached as thumbnails. Making them needs Pillow, which is only
a build dependency today.

- **Option A — Pillow at runtime**, behind one guarded decoder; the cache holds bounded thumbnails
  only; embedded images are fetched, validated and re-encoded at write time.
- **Option B — Cache originals**, scaled by the renderer; no new dependency.

**Recommendation**: **A**. B's cache is unbounded and every table cell decodes a full-size image.
A's cost is a native dependency with a security history, which the decoder guard and the pin answer.
A bounded image re-encoded before it goes into a user's file is also the more professional artifact.

---

## DECISION ROUND 10 — REKORDBOX EXPORT ✅ Resolved 2026-09-20

Asked before writing Phase 8's step specifications. Nine rounds left this phase five obligations and
no mechanism. DEC-064 said export is the explicit user-initiated write that carries CuePoint's
organization outward, and named the mapping as this phase's to decide. DEC-061 left "whether a Smart
Collection exports directly" here by name. DEC-057 and DEC-068 built two value layers so that this
phase would have something to choose between. DEC-058 made a Collection ordered because a Rekordbox
playlist is. DEC-038 assumed the export would map `duration_seconds` back to `TotalTime`. None of
that says what artifact export produces, what it is allowed to lose, or where it goes.

Six of these came from reading the code rather than the roadmap:

- **Nothing parses or stores cue points or beat grids.** `POSITION_MARK` and `TEMPO` appear nowhere
  in `src/` — no parser, no table, no column. `tracks` holds twenty columns of metadata and stops
  there. An XML regenerated from the database would therefore hand a DJ back a library with every
  hot cue, memory cue and beat grid stripped, silently. This single fact decides Q-078 and most of
  what follows from it.
- **The existing writer cannot add a playlist.** `write_updated_collection_xml` sets attributes on
  `COLLECTION/TRACK` elements that already exist and preserves `PLAYLISTS` by never touching it. Its
  safety property is exactly its narrowness, so carrying Collections outward is new code beside it
  rather than a parameter on it.
- **The importer reads `Tonality` verbatim.** `_library_track_from_element` stores
  `_optional_text(get("Tonality"))` with no normalization, so whatever notation export writes is
  what a later import puts into `tracks.key` — the column the matcher compares. Export is an input
  to CuePoint's own importer, which is what turns Q-090 from a formatting detail into a decision.
- **`library_source` already records staleness.** `xml_modified_at` and `xml_size_bytes` have been
  stored since migration 0005, so Q-083 needs no new schema to answer.
- **`Rating` has two encodings on the way in.** `_rating_to_stars` accepts both the multiples of 51
  Rekordbox writes and the plain star count some tools emit. Reading tolerates both; writing has to
  choose one.
- **"Export" is already taken.** `services/export_service.py` means CSV, JSON and Excel. Phase 8's
  service needs a name that does not collide with it.

Outcomes are DEC-077…DEC-089 in `DECISIONS.md`. One answer went against the recommendation — Q-090,
key notation — and is noted as such below. Q-090 was also asked late: it was first offered as a
step-doc detail and became a question once the verbatim-`Tonality` finding showed that export's
notation choice reaches CuePoint's own key column.

---

### Q-078 — How the exported XML is produced

**Status**: Resolved → DEC-077 (Option A chosen: patch the source tree)

**Question**: Rekordbox consumes an XML by loading it as a source in its tree, not by merging it into
its own collection. What document does CuePoint hand it, and how is that document built?

- **Option A — Patch the source XML tree.** Re-parse the file the library was imported from, set only
  the attributes CuePoint owns, append CuePoint's playlists, write a new file. Everything CuePoint
  never parsed survives because it is never rebuilt. Requires the source file to still be present.
- **Option B — Generate the document from the database.** Build the whole XML from `tracks`,
  `rekordbox_playlists` and `collections`. One code path, no dependency on the source file — and
  every exported track loses its cues and grid, unless this phase first builds parsing and storage
  for all of it.
- **Option C — Patch, with generate as a fallback** when the source is missing.

**Recommendation**: **A**. B's cost is not a rough edge, it is the destruction of the work a DJ cares
about most, discovered on a CDJ. C keeps that outcome and hides it behind a fallback a user reaches
exactly when they are least able to judge what it cost them. A extends a property this repository has
held since the first attribute patch: the source is read, never written, and what CuePoint does not
understand is preserved rather than reconstructed.

---

### Q-079 — What one export contains

**Status**: Resolved → DEC-078 (Option A chosen: whole library plus chosen Collections)

**Question**: Is an export a view of the library, or of a selection?

- **Option A — The whole `COLLECTION`, the Rekordbox mirror untouched, plus the Collections the user
  picked** as new `PLAYLISTS` nodes.
- **Option B — Only the selected scope**: `COLLECTION` holds just those tracks, `PLAYLISTS` just that
  node.
- **Option C — Two separate actions**, "export metadata" and "export Collection".

**Recommendation**: **A**. It matches how the file is actually used — loaded as a source and dragged
from. B produces a document that looks like the user's library and is not one, which is the kind of
file that gets confused with the real export a month later. C splits one intent into two flows, two
previews and two sets of documentation, and users will want both halves at once.

---

### Q-080 — Whose value the export writes

**Status**: Resolved → DEC-079 (Option A chosen: the effective value)

**Question**: A track can carry an imported Rekordbox value and a CuePoint override for the same
field (DEC-057, DEC-068). Which reaches the file?

- **Option A — The effective value, per field**: the override when there is one, otherwise the
  imported value, unchanged.
- **Option B — The user chooses per field at export time**, as toggles in the preview.
- **Option C — Only fields that hold an override** are touched at all.

**Recommendation**: **A**. The rule already exists, in one place, as `effective_value` and
`effective_rating`, mirrored as `COALESCE(override, imported)` in the browse SQL. Reusing it means
what lands in Rekordbox is what the table and the Inspector showed. B is a second precedence rule
beside that one, and DEC-057's note that two implementations disagree the day one is edited applies
with more force when one of them writes a file. C sounds conservative but silently keeps a stale
value for any field corrected by hand rather than by override.

---

### Q-081 — What happens to tags, notes and favorites

**Status**: Resolved → DEC-080 (Option A chosen: they stay in CuePoint)

**Question**: Rekordbox XML has no field for a tag set, a note or a favorite. DEC-064 promised export
would carry "ratings and tags into whatever fields make sense, if any". Do they go?

- **Option A — They stay in CuePoint.** Export carries the five override fields, the effective
  rating, and Collections as playlists.
- **Option B — Tags become playlists** under a folder of their own; notes go nowhere.
- **Option C — An opt-in mapping into `Comment`**, with a chosen separator.

**Recommendation**: **A**. C writes into the one attribute this codebase already contests — the match
flow marks it, and a DEC-070 file write targets it — so the mapping's first effect would be to
overwrite something another feature owns. B is defensible and genuinely useful, but sixty tags become
sixty playlists with their own naming and collision rules, and it answers only a third of the
question. A keeps export lossless in one direction instead of lossy in two, and leaves B available
later as an addition rather than a correction.

---

### Q-082 — Whether a Smart Collection exports directly

**Status**: Resolved → DEC-081 (Option A chosen: as its membership at export time). Closes the item
DEC-061 deferred here by name.

**Question**: A Smart Collection stores rules and never materializes membership (DEC-061). A
Rekordbox playlist is a list of tracks. What does exporting one mean?

- **Option A — Export its membership at that moment**, in its stored sort order, recording the rule
  set and the count.
- **Option B — Refuse; require "Freeze to Collection" first**, which DEC-061 built for this.
- **Option C — Freeze as a side effect** of exporting.

**Recommendation**: **A**. B is coherent but charges an extra step and a growing pile of frozen
Collections for anyone who exports weekly, to avoid a snapshot that a rule set plus a timestamp fully
explains. C creates objects the user did not ask for and leaves two near-identical Collections after
two exports. A is what DEC-061 already contemplated when it said nothing here prevents it.

---

### Q-083 — A source file that changed or vanished

**Status**: Resolved → DEC-082 (Option A chosen: detect, report, allow)

**Question**: Patching depends on the source XML. It can have been re-exported from Rekordbox since
CuePoint imported it, or moved, or deleted. What does export do?

- **Option A — Detect against `library_source`, report in the preview, let the user proceed**: tracks
  the file has and CuePoint does not are left untouched; tracks CuePoint has and the file lacks are
  counted and dropped from appended playlists. A missing file blocks the export and says why.
- **Option B — Refuse until the library is refreshed.**
- **Option C — Patch whatever is on disk**, silently.

**Recommendation**: **A**. C is the only genuinely unsafe one: a dropped reference becomes a playlist
entry pointing at a `TrackID` the file does not have, discovered in Rekordbox. B buys a guarantee
with a hard block on a routine action, triggered by an mtime that changes for reasons that do not
matter — the kind of gate users learn to route around. A makes the difference visible with real
numbers at the moment it matters, which is what DEC-032 already established for a refresh.

---

### Q-084 — Where the exported file goes

**Status**: Resolved → DEC-083 (Option A chosen: save dialog, remembered folder, source refused)

**Question**: The existing writer's safety property is "always a new file, never the source". How does
that become a rule rather than a habit?

- **Option A — A native save dialog** pre-filled with a dated name, starting in the folder used last,
  with the source path refused by an explicit check.
- **Option B — A fixed exports folder** with timestamped names and no dialog.
- **Option C — One remembered path, overwritten after a confirm**, so Rekordbox's imported-XML entry
  keeps pointing at the same file.

**Recommendation**: **A**. C serves one workflow well and puts a single confirm between the user and
the loss of their previous export. B never overwrites anything but grows without bound in a folder the
user has to go and find. A is what a desktop app does, and turning "never the source" into a check the
code makes is the part worth spending code on.

---

### Q-085 — How an export runs

**Status**: Resolved → DEC-084 (Option A chosen: preview, then a job)

**Question**: Inline, or as a background job?

- **Option A — A preview that states exactly what will be written, then a cancellable background job**
  with an activity event.
- **Option B — Preview, then a synchronous write** behind a modal.
- **Option C — One click, no preview.**

**Recommendation**: **A**. It is the shape DEC-032, DEC-033 and DEC-070 already established, for the
same reason each time: this is an outward-facing write, and every other one in CuePoint previews
first. B blocks the UI on the fifty-thousand-track case, which is the case that matters. C removes the
only step at which a stale source or a dropped reference can be noticed before Rekordbox notices it.

---

### Q-086 — Whether Phase 8 writes audio files

**Status**: Resolved → DEC-085 (Option A chosen: XML only)

**Question**: DEC-064 left "carrying CuePoint ratings and tags into audio files" to this phase.
Does export touch files?

- **Option A — No. Phase 8's only output is the XML.** DEC-070's job already writes the five Beatport
  fields into files, previewed and recorded.
- **Option B — Extend the DEC-070 job** with CuePoint rating and tags.
- **Option C — A separate opt-in file-writing job.**

**Recommendation**: **A**. B and C both need an ID3 mapping for a tag set that does not exist, so the
mapping would be invented here and then depended on. More importantly, a phase whose single artifact
is one new file has one failure mode; adding a file-writing path means "I exported my library" can
mean four hundred modified files. DEC-070's existing job remains available for the fields that have an
honest home in a file.

---

### Q-087 — What CuePoint remembers about an export

**Status**: Resolved → DEC-086 (Option A chosen: a record per export, no per-track state)

**Question**: Is an export recorded, and at what granularity?

- **Option A — One row per export** — when, where, how many tracks, which Collections with which
  counts, which source and whether it was stale — plus an activity event. No per-track state.
- **Option B — Also stamp each exported track**, enabling "only what changed since last export".
- **Option C — An activity event and nothing else.**

**Recommendation**: **A**. B is the staleness bug DEC-061 refused for Smart Collections, reintroduced:
every edit, apply, revert, refresh and batch would have to know it had just falsified a stamp, and the
symptom of getting it wrong is an export that silently omits a track. C leaves "where did my last
export go" as prose the UI cannot act on. A answers the question a user actually asks and invalidates
nothing.

---

### Q-088 — Where export is reachable from

**Status**: Resolved → DEC-087 (Options A and B chosen: Library Actions and the Collection context
menu), **amended 2026-09-20** — Option A's surface turned out to be selection-scoped, so the entry
moved to the Library header beside import and refresh. Raised by the Phase 8 specification as Q-091
and settled there.

**Question**: DEC-020's navigation registry declares the full target IA — Library, Collections, Clean,
Discover, Prepare, Tools, inCrate, Settings — and has no export destination. So export is an action.
Which surfaces offer it?

- **Option A — The Library toolbar's Actions menu**, beside ORG-11's batch operations. (The menu this
  named is drawn only when tracks are selected, which the amendment above corrects.)
- **Option B — The Collection and Smart Collection context menu** in the left pane.
- **Option C — A section in Settings.**
- **Option D — A native File-menu item with an accelerator.**

**Recommendation**: **A and B**. They are the two places a user already is when they have a scope in
view, which is what makes the exported scope obvious rather than implied. C is the right home for the
remembered destination and defaults, and the wrong home for the action. D has no scope context, so it
can only ever mean "everything", and offering it invites the reading that the other two mean something
narrower than they do.

---

### Q-089 — Tracks whose file is missing

**Status**: Resolved → DEC-088 (Option A chosen: exported, and counted)

**Question**: Phase 7 detects that a track's file is gone (DEC-073). Does export include it?

- **Option A — Yes, unchanged, with the count stated in the preview.**
- **Option B — Yes in `COLLECTION`, but excluded from appended playlists.**
- **Option C — Block the export until they are resolved.**

**Recommendation**: **A**. The `TRACK` element and its `Location` are Rekordbox's own; dropping one
removes the track from the user's Rekordbox view, which DEC-073 was explicit CuePoint does not do. B
makes an exported playlist quietly differ from the Collection on screen. C turns a routine action into
a chore, since missing files are normal in any large library. A states the number and lets the user
decide.

---

### Q-090 — Which key notation the export writes

**Status**: Resolved → DEC-089 (Option C chosen: all three, shared with the file-tag path) —
**against the recommendation**. Raised while reviewing the step-doc details, once the importer's
verbatim `Tonality` read showed the choice reaches CuePoint's own key column.

**Question**: Export writes `Tonality`, which Rekordbox displays as the key. `key_text(key,
key_format)` already converts to classic (`Am`), Camelot (`8A`) or short (`Amin`) for the file-tag
path. Which does export offer? The importer reads `Tonality` verbatim, so whatever is written becomes
`tracks.key` on a later import of that file.

- **Option A — Pin classic**, no control. The exported file round-trips: re-importing stores the keys
  CuePoint already had, and `tracks.key` stays one notation across the library.
- **Option B — Offer classic and Camelot**, remembered, with the re-import consequence stated in the
  preview.
- **Option C — Offer all three**, reusing the file-tag vocabulary, validator and converter.
- **Option D — Offer the choice and normalize key on import**, so any notation round-trips.

**Recommendation**: **A**. B and C both let a user produce a file whose re-import leaves `tracks.key`
holding `8A` for some tracks and `Am` for others, in the column the matcher compares and the Clean
page displays — a warning about a consequence two steps away, which is the kind users click past. C
additionally offers `short`, a notation Rekordbox never produces. D is the honest fix and belongs to
whichever phase revisits DEC-034's capture-as-Rekordbox-has-it rule, not to export.

**Chosen**: **C**. The user chose one enum and one converter over a subset, accepting the mixed-column
risk as opt-in. DEC-089 records the two mitigations that follow: the default is classic, and the
preview states the consequence at the moment of choosing rather than in a footnote.
