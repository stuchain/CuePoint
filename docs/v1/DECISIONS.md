# CuePoint — Design Decision Log

Records every product/architecture decision made collaboratively during the design phase, per the
evolution spec's process (inspect → document → ask → decide together → refine). Decisions here are
considered locked until explicitly revisited — if new information suggests reconsidering one, that
will be called out explicitly rather than silently changed.

---

## DEC-001 — Persistence Technology

**Status**: Approved

**Decision**: SQLite as the storage engine (single embedded local file, e.g.
`~/.cuepoint/cuepoint.db`), with a real schema-migration tool from the start rather than
hand-rolled migration scripts.

**Reason**: Matches the existing in-repo precedent (`incrate/inventory_db.py` already uses
SQLite), zero external runtime dependency, trivial single-file backup. A real migration tool is
required because the spec is explicit that a CuePoint update must never require deleting the
user's database.

**Implications**:
- FOUNDATION-02/03 build on SQLite + a migration framework, not ad hoc scripts.
- Feeds ADR-001.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-002 — Track Identity Across Rekordbox Refreshes

**Status**: Approved

**Decision**: Rekordbox `TrackID` is the primary identity. If a track's TrackID is not found in a
re-imported XML, fall back to matching by normalized file path; when that fallback fires, flag it
as a re-linked-identity event for transparency (not silent).

**Reason**: TrackID-only is fragile against the exact scenario CuePoint should be resilient to
(Rekordbox database rebuild/repair changing TrackIDs). Full content-signature fuzzy matching was
judged premature complexity for v1.

**Implications**:
- LIBRARY-02 must implement the path-normalization fallback and the re-link event.
- LIBRARY-09 (differential refresh) and LIBRARY-10 depend on this.
- Feeds ADR-002.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-003 — Removed-from-Rekordbox Track Handling

**Status**: Approved

**Decision**: When a track is absent from a re-imported Rekordbox XML, it is **deleted from
CuePoint** — including any CuePoint-only data attached to it (tags, ratings, Collection/Set
membership). No "archived"/"removed source" state is maintained.

**Reason**: User preference, chosen explicitly over the recommended "keep if referenced, else
archive" option — simplicity over preservation of orphaned CuePoint-only data.

**Implications**:
- No `TrackSourceStatus`/archive concept is needed for Phase 3.
- **Open follow-up, not yet decided**: a refresh that would delete tracks referenced by existing
  Collections/Sets should probably surface a clear warning before applying ("N tracks referenced
  by your Collections/Sets will be removed") so this isn't a silent data-loss surprise — this
  specific refresh-warning UX is deferred to a later decision round, not assumed here.
- Simplifies LIBRARY-10 scope relative to the original draft roadmap step.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-004 — Metadata Precedence on Match Acceptance

**Status**: Approved

**Decision**: High-confidence Beatport matches auto-mark as "accepted," but applying accepted
metadata to the Effective/displayed value (and to tags/XML) remains a separate, explicit user
action — per-field or batch.

**Reason**: Keeps "I agree this is the right track" separate from "overwrite my metadata," in line
with CuePoint's explain-don't-silently-decide philosophy. Matches the existing matcher's design,
where confidence is already just a label with no auto-apply behavior today.

**Implications**: CLEAN-02 (match states), CLEAN-04/05 (review UI), CLEAN-06 (precedence).

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-005 — Player Backend

**Status**: Approved

**Decision**: Bundle **libmpv** as a sidecar process for local audio playback, rather than the
originally-recommended HTML5 `<audio>` element.

**Reason**: The user asked for foobar2000-grade playback quality. foobar2000 itself is
closed-source Windows-only freeware and can't be embedded or redistributed. Of the realistic
equivalents evaluated — libmpv (LGPL-compatible build, open-source, no licensing cost), BASS
(proprietary, requires a paid commercial distribution license), raw ffmpeg/libavcodec native
binding (most flexible but most integration work), and HTML5 `<audio>` (simplest but capped below
foobar-level quality/format guarantees) — the user chose libmpv: same engine behind mpv/mpv.net/
IINA, wide lossless format support (FLAC/AIFF/ALAC/WavPack/APE), gapless playback, high-quality
SoX resampling, and a well-trodden embedding pattern.

**Implications**:
- Adds a second bundled per-OS sidecar binary (alongside the existing Python engine sidecar) that
  needs building, signing, and updating — real packaging weight the audit flagged as a live risk
  area (cross-platform signing/packaging is currently only lightly tested).
- PLAYER-01–03 need to define the IPC/control contract between Electron main and the libmpv
  process (analogous to how `EngineSupervisor`/`EngineClient` already talk to the Python engine).
- Format-support verification (FLAC/AIFF on Windows and macOS) is still worth an early spike, but
  is now a packaging/build-integration validation rather than a codec-availability gamble.
- Feeds ADR-004 (superseding the original HTML5-first recommendation).

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-006 — Collections vs. Local Playlists

**Status**: Approved

**Decision**: Collections are the only CuePoint-native organizational unit. No separate
CuePoint-native "Playlist" concept distinct from imported Rekordbox playlists.

**Reason**: No existing precedent for a second local-playlist concept; avoids UI/data-model
surface area for a distinction most users wouldn't reliably keep straight. Can be split later if
it proves too coarse.

**Implications**: ORG-06 (Collections) is the single organizational primitive; LIBRARY-05
(Playlists) stays strictly the imported-from-Rekordbox concept.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-007 — Background Job Durability

**Status**: Approved

**Decision**: Job records (status, progress, timestamps) persist to the database so a restarted
engine doesn't silently lose job history. Full crash-resumability (resuming in-flight work, not
just recording that it happened) is deferred.

**Reason**: Today's `JobStore` is entirely in-memory; this becomes a real problem once jobs
include long-running import/analysis/waveform work. Full resumability is more architecture than
Foundation needs to commit to now — revisit once long-running jobs are concrete.

**Implications**: FOUNDATION-07 (background job architecture), FOUNDATION-08 (activity/event
architecture) build on a persisted job-record table.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-008 — Undo / History Strategy

**Status**: Approved

**Decision**: Per-field change history with manual revert (a track's History tab shows old/new
values with timestamps; a user can revert a specific field). No global Undo/Redo stack for v1.

**Reason**: Directly serves the explainability philosophy without the much larger architectural
investment of a universal undo stack (every mutating operation needing a defined inverse). Can be
revisited later for specific high-blast-radius operations (e.g. batch edits) if needed.

**Implications**: FOUNDATION-08, ORG-11 (batch operations), CLEAN-08 (batch metadata) all build
on a persisted per-field change log rather than a transaction-inverse system.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-009 — Backup Strategy

**Status**: Approved

**Decision**: Automatic backup on app launch (if the database changed since the last backup), with
a retention cap (keep the last N), plus manual "Back Up Now" / "Restore" controls in Settings.

**Reason**: A single-file SQLite database (DEC-001) makes this cheap; matches the spec's explicit
backup requirement without needing anything exotic (no cloud, no continuous backup).

**Implications**: FOUNDATION-11.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-010 — Pixel Icon Assets

**Status**: Approved

**Decision**: Hybrid — build real pixel sprite icons only for the 5–10 highest-visibility
recurring icons (nav items, transport controls, track-status badges); keep styled Unicode glyphs
for secondary/rare actions.

**Reason**: Gets the visible identity payoff where it matters most without committing to full
icon-set production before there's a stable feature surface to design icons against.

**Implications**: FOUNDATION-14. The 9-slice/Aseprite pipeline specced in
`docs/ui-overhaul/phase-1-pixel-design-system.md` (DS-3) but never built would need to be stood up
for this small icon set, not a full application-wide asset pass.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-011 — Refresh-Time Warning for Deletions

**Status**: Approved

**Decision**: A Rekordbox refresh warns before deleting tracks that are referenced by a CuePoint
Collection or Set ("N tracks removed from Rekordbox are used in M Collections/Sets — Continue /
Review"). Removed tracks with no CuePoint references are deleted without a prompt.

**Reason**: Protects the one scenario DEC-003's simpler delete-on-removal choice explicitly
accepted the risk of, without adding friction to the common case (most removed tracks won't be
referenced by anything).

**Implications**: LIBRARY-09 (differential refresh) must check Collection/Set references before
applying a removal, not just diff track IDs.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-012 — Double-Click Behavior

**Status**: Approved

**Decision**: Double-clicking a track plays it immediately and loads the current view's visible
tracks as the playback queue.

**Reason**: Makes Next/Previous meaningful immediately without a separate queue-building step;
matches common library/player app behavior.

**Implications**: PLAYER-05 (PlaybackQueue) and PLAYER-07 (track table integration) must derive
the queue from the active view's current filtered/sorted track list at play time.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-013 — Playback Queue Behavior

**Status**: Approved

**Decision**: Playing a track (double-click) replaces the current queue with the new context.
"Play Next" and "Add to Queue" are separate, explicit context-menu actions that append instead.

**Reason**: Matches the target spec's own context-menu design (PLAY / PLAY NEXT / ADD TO QUEUE as
distinct actions) rather than inventing new behavior.

**Implications**: PLAYER-05, and the track context-menu (target spec §19) must expose both
"Play Next" and "Add to Queue" as first-class actions from day one, not just "Play."

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-014 — Resume Playback Position After Restart

**Status**: Approved

**Decision**: CuePoint does not resume the last-playing track/position on launch; playback always
starts fresh.

**Reason**: Avoids the state-persistence complexity of accurately resuming mid-track position for
a nice-to-have; consistent with DEC-007's deferral of full job-resumability for similar reasons.
Can be revisited once the player is stable.

**Implications**: PLAYER-04/PLAYER-12 don't need to persist/restore playback position across app
restarts for v1.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-015 — Tag Taxonomy

**Status**: Approved

**Decision**: Tags are flat and user-defined, with an optional lightweight category label per tag
(e.g. "Mood: Dark") — not a fully nested hierarchy.

**Reason**: Gets useful grouping/filtering (e.g. "all Mood tags") without the UI and data-model
complexity of arbitrary nesting, which the target spec's own tag examples don't seem to need.

**Implications**: ORG-04/ORG-05 (Tags, Tag management) model a tag as `{name, category?, color?}`,
not a tree.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-016 — Smart Collection Rule Complexity

**Status**: Approved

**Decision**: v1 Smart Collections support flat AND-only rule lists (all conditions must match).
No OR logic or nested grouping in v1, but the data model will be designed so AND/OR grouping can
be added later without a breaking migration.

**Reason**: Most real-world Smart Collection use cases — including the target spec's own worked
example — are satisfied by flat AND conditions; nested boolean rule-building is real UI complexity
better deferred until there's evidence it's needed.

**Implications**: ORG-09 (Smart Collection engine) stores rules as a flat list from day one, with
the schema left room to add a `logic: AND|OR` / grouping field later.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-017 — Set/Chapter Structural Rules

**Status**: Approved

**Decision**: A track may appear more than once in the same Set. Set warnings (e.g. large BPM
jumps) are always advisory and never block export.

**Reason**: DJs legitimately reuse tracks (e.g. a closing reprise). Warnings-never-block matches
CuePoint's core "explain, don't silently decide" philosophy, stated repeatedly in the target spec.

**Implications**: PREP-01/PREP-02 (Set domain/persistence) must not enforce track uniqueness
within a Set; PREP-11/PREP-12 (Set analysis/export) never gate export on unresolved warnings.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-018 — Inspector / Shell Layout

**Status**: Approved

**Decision**: The Track Inspector persists across page navigation and is user-resizable, with its
width remembered (same `localStorage`-backed UI-state-persistence pattern already used for
results-table column widths, scale, and theme).

**Reason**: Matches the target spec's "Track Inspector available throughout app" framing and the
existing in-repo precedent for persisting UI layout state.

**Implications**: SHELL-05 (Track Inspector container) implements persistence the same way
`resultsTableLayout.ts` already does, not a new mechanism.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-019 — Orphaned Qt Updater's Fate

**Status**: Approved

**Decision**: Formally deprecate and remove the Qt-era `src/cuepoint/update/` code now, as a
standalone cleanup independent of the phased roadmap. A real Electron-native auto-updater (e.g.
`electron-updater` against the existing appcast infrastructure) becomes an explicit future roadmap
item, not a Foundation-phase blocker. CuePoint ships without auto-update in the meantime — which
is already effectively true today.

**Reason**: The dead Qt code is actively confusing (a known-issue is logged against a feature that
doesn't actually run against the shipped Electron app); removing it is small and low-risk. A
proper Electron-native updater is real, separate work that deserves its own future ADR/phase
rather than being squeezed into Foundation as an afterthought.

**Implications**: Removes `src/cuepoint/update/` (~8 files), its in-package test file, and
`src/tests/unit/update/`; updates `docs/features/update-system.md` to reflect the removal instead
of describing dead functionality; removes the `known-issues.md` entry once the feature is gone
rather than "fixed." This is a small, independently schedulable cleanup — it does not need to wait
for FOUNDATION-01, but isn't implemented yet either (still design-only mode; needs its own
"Implement" instruction like any other step).

**Decided with**: User · **Date**: 2026-09-01
