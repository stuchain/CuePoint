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

**Amended 2026-09-01 (mechanism only — the decision above is unchanged)**: implementation found
DS-3 is about 9-slice *panels and buttons*, not icons, so there was no icon pipeline to stand up;
and a baked-colour PNG cannot follow five themes that disagree about `--fg-primary` without one
copy per icon per theme. The icons are instead authored as pixel grids and rendered as SVG
rectangles inheriting `currentColor`. Still hand-placed pixels and still 5–10 icons; only the
production and delivery mechanism differs. See FOUNDATION-14's outcome in `PHASE1_FOUNDATION.md`.

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

**Status**: Approved, then **amended 2026-09-01** (see amendment note at the end of this entry —
implementation showed the original premise was only partly true)

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

### Amendment (2026-09-01) — scope narrowed to the Qt-dependent modules only

**What implementation found**: the premise above ("a fully-built Sparkle/PySide6 update stack,
orphaned") was only about one third true. Of the 12 files in `src/cuepoint/update/`, **only 4
touched Qt** (`update_manager.py` 25 refs, `update_ui.py` 7, `update_downloader.py` 3,
`update_launcher.py` 1). The rest is Qt-free and **actively used**: `version_utils.py` by
`scripts/inspect_appcast.py` and `scripts/test_pre_release.py`, `security.py` by
`services/security_service.py`, and both by two real passing tests in `src/tests/unit/update/`.
Deleting the package wholesale would have destroyed working, tested release tooling and broken
the appcast pipeline.

**Amended decision**: delete only the dead Qt update *flow* — `update_manager.py`, `update_ui.py`,
`update_downloader.py`, `update_installer.py` (Qt-free, but only reachable from the deleted UI and
dependent on the deleted launchers), `update_launcher.py`/`.bat`/`.ps1`, plus the 5 obsolete
`scripts/test_update_dialog*.py` / `test_update_download_install.py` / `test_update_integration.py`
GUI-driving scripts. **Keep** the appcast/version/security logic (`update_checker.py`,
`version_utils.py`, `security.py`, `signature_verifier.py`, `update_preferences.py`) that release
tooling and `SecurityService` depend on.

**Unchanged from the original decision**: CuePoint ships without in-app updates; an
Electron-native updater remains a future, unscheduled item; `docs/features/update-system.md` and
`docs/release/known-issues.md` now describe the real situation instead of a feature that could not
run.

**Decided with**: User · **Date**: 2026-09-01

---

## DEC-020 — Navigation Inventory for the v1 Shell

**Status**: Approved

**Decision**: The full target information architecture is declared once in a navigation registry,
but the sidebar renders only destinations whose feature has actually landed. Each later phase
enables one pre-declared destination rather than restructuring the shell.

**Reason**: Builds the shell once without advertising capabilities that do not exist, and avoids
the repeated IA reshuffling that a grow-as-you-go nav would cause.

**Implications**:
- SHELL-01/SHELL-02 build a declarative nav registry, not a hardcoded list of links.
- Every later phase's UI step includes "enable its destination in the nav registry" as part of
  its own scope.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-021 — Fate of the Existing Lab Screens

**Status**: Approved

**Decision**: `ToolSelectionScreen`, `InKeyMainScreen`, `InCrateMainScreen` and `ResultsScreen`
move under the new shell intact, grouped as a "Tools" section. Phase 7 re-homes inKey into Clean;
Phase 9 re-homes inCrate into Discover.

**Reason**: Keeps Phase 2 structural. Re-homing them now would pull Phase 7 and Phase 9 product
work into the shell phase, against the one-step-at-a-time process.

**Implications**:
- SHELL-02 re-parents the existing routes; it does not rewrite the screens.
- CLEAN and DISCOVER phase specs inherit an explicit "retire the Tools entry" obligation.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-022 — Sidebar Behavior

**Status**: Approved

**Decision**: The sidebar has two states — expanded with labels, or collapsed to an icon-only rail
— toggled by the user, with the state persisted in `localStorage`. It is not freely resizable;
the Inspector keeps the only drag handle.

**Reason**: Two fixed widths let the icon rail be drawn at exact pixel sizes, which arbitrary
drag-resize would undermine for pixel art. It also avoids two draggable vertical edges competing
either side of the content area.

**Implications**:
- Resolves the collapsible-sidebar item Round 1 deferred; it is now decided independently of
  DEC-018's Inspector-specific answer.
- The icon rail requires the `clean`, `discover` and `prepare` icons FOUNDATION-14 deliberately
  left as Unicode glyphs "until there is a screen to draw them against" — Phase 2 is that screen,
  so drawing them belongs to a SHELL step.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-023 — Global Search in Phase 2

**Status**: Approved

**Decision**: The shell's global search is backed by a real engine query over the Phase 1 SQLite
`tracks` table from the start. It legitimately returns nothing until Phase 3 imports a library,
and needs no rewrite when it does.

**Reason**: User chose the forward-looking option over the recommended inert-chrome answer:
building the real contract once is preferable to shipping a placeholder mechanism that Phase 4
would replace.

**Implications**:
- Phase 2 is a **desktop-contract change, not a renderer-only one**. Per the AGENTS.md invariant,
  SHELL-04 must move Python `*_api.py`/`server.py`, `engineClient.ts`, `main.ts`, the runtime
  `preload.cjs`, renderer bridge types and consumers, and tests together.
- The search response shape becomes a public API surface subject to the "preserve response
  shapes" invariant, so it should be specified deliberately in SHELL-04 rather than grown ad hoc.
- Phase 4's Library UI extends this endpoint (filters, scoping) rather than introducing a
  different search path.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-024 — Track Inspector Content in Phase 2

**Status**: Approved

**Decision**: Phase 2 delivers the Inspector container, its empty state, and a hide toggle with a
keyboard shortcut. It is not wired to any track data yet; each later phase contributes its own
Inspector content.

**Reason**: Wiring it to `ResultsScreen` selection now would build a panel against the legacy
`TrackResult` shape that Phase 4 will rework, and would duplicate `CandidateDialog`.

**Implications**:
- Extends DEC-018: alongside persisted width, the Inspector also has a persisted
  visible/hidden state.
- SHELL-05 owns the container and its persistence; it defines the slot later phases fill.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-025 — Player Container Before Phase 5

**Status**: Approved

**Decision**: The shell defines the player's layout region and component boundary in Phase 2, but
it occupies no space and renders nothing until Phase 5 fills it.

**Reason**: Phase 5 gets a stable insertion point without Phase 2 shipping visibly dead transport
controls, and without Phase 5 having to re-open shell layout and its tests.

**Implications**: SHELL-06 is a layout-and-boundary step with no player behavior; PLAYER-phase
steps mount into it.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-026 — Background Activity Surface

**Status**: Approved

**Decision**: The shell gets a persistent bottom status strip showing engine state and running
job progress, which opens an Activity panel over the FOUNDATION-08 activity feed.

**Reason**: FOUNDATION-07 (durable job records) and FOUNDATION-08 (`activity_events`,
`track_history`) shipped with no UI at all; the shell is where that infrastructure becomes
observable. It also gives `EngineStatusBanner` a permanent home instead of a floating banner, and
the `activity` pixel icon already exists for it.

**Implications**:
- SHELL-07 (status strip) and SHELL-08 (Activity panel) read existing engine job and activity
  APIs; where those are not yet exposed over HTTP, exposing them is part of these steps and
  carries the same desktop-contract synchronization obligation as DEC-023.
- `EngineStatusBanner` is relocated, not duplicated.
- Per-field revert (DEC-008) surfaces here eventually, but v1 scope for the panel is display;
  revert affordances belong to the phases that produce editable fields.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-027 — Launch Page

**Status**: Approved

**Decision**: The app reopens on the last-visited destination, persisted with the same
`localStorage` pattern used for scale, theme and results-table column widths, falling back to the
home destination when the stored one no longer exists or is not enabled in the nav registry.

**Reason**: Consistent with DEC-018 and the existing UI-state-persistence precedent; preserves the
user's place across restarts.

**Implications**: SHELL-03 implements it; the fallback must consult DEC-020's registry so a stored
destination from a future phase (or a removed Tools entry per DEC-021) degrades gracefully rather
than routing to a blank page.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-028 — Engine Recovery

**Status**: Approved

**Decision**: When the engine process exits unexpectedly, `EngineSupervisor` restarts it up to
three times with increasing backoff, reporting "Reconnecting…" while it tries. When those attempts
are exhausted it stops and the status strip offers a "Restart engine" control. Every engine start
is recorded as an activity event.

**Reason**: Doing nothing was the state SHELL-07 exposed — a permanently offline strip and no way
back without quitting. Unlimited restarts would hide a crash-looping engine behind a flickering
status; auto-restart without a control leaves the same dead end one step later. Bounding the
attempts and recording each start keeps a repeated failure visible rather than silently healed.

**Implications**:
- `EngineSupervisor` owns the restart policy; the status strip reports it and offers the control.
- Adds one desktop-contract channel, which moves all six files per the Phase 2 preamble.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-029 — First Activity Producers

**Status**: Approved

**Decision**: The launch backup and every engine start are recorded as activity events. Match job
events are deliberately not recorded. Later phases add their own producers as they build the
actions worth recording.

**Reason**: FOUNDATION-08's feed and SHELL-08's panel both shipped with nothing writing to them, so
the feature reads as broken rather than empty. These two producers already happen on every launch
and cost a line each. Job events were considered and rejected as duplicating the past-searches
list, which already exists and means the same thing to a user.

**Implications**: DEC-028's restart trail depends on the engine-start producer, so the two land
together.

**Decided with**: User · **Date**: 2026-09-02
