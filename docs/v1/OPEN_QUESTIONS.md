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

## Not yet asked (deferred to a later round)

Per the spec's own guidance not to dump every question at once — these are real open items
surfaced by the audit but held back until Round 1's foundational decisions are locked, since
several depend on those answers:

- Crossfade support (deferred — Round 2 covered double-click/queue/resume but not crossfade)
- Whether the collapsible-sidebar question (part of the original shell-layout list) needs its own
  decision beyond DEC-018's Inspector-specific answer
- Audio analysis scope (which features are worth building at all — likely a Phase 12 conversation)
- Whether to fix the `services/` Qt-boundary violation and CI-gap items as standalone quick
  fixes now, or fold them into Foundation's CI-quality-gates step
- Smart Collection export/duplication behavior (target spec §28 asks whether Smart Collections
  should be directly exportable and whether rule sets can be duplicated — not yet asked)
