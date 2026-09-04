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

---

## DEC-030 — inCrate's Inventory and the Library

**Status**: Approved

**Decision**: Phase 3 builds the persistent library beside inCrate's existing inventory database.
The two coexist until Phase 9 re-homes inCrate behind Discover, at which point inCrate reads from
the library and its own inventory is retired.

**Reason**: Converging now would rewrite a working feature's data layer inside a phase about
import. Coexistence is the smaller change, provided the duplication is stated rather than hidden.

**Implications**:
- Two collection imports exist meanwhile, and can disagree. User documentation must say so.
- Phase 9 inherits a migration: inCrate's Beatport ids belong in a table keyed on the library
  track, not in a second copy of the collection.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-031 — Rekordbox Playlists Are Mirrored, Read-Only

**Status**: Approved

**Decision**: The library persists the Rekordbox playlist tree and its membership as read-only
source data, refreshed with the collection. CuePoint's own Collections (Phase 6) remain a separate,
editable concept.

**Reason**: The parser already reads nested folders; Phase 4's Library UI browses by playlist and
Phase 8's export needs the tree. Storing them later would mean a second pass over import and
refresh.

**Implications**: Two new tables, and refresh must diff playlist membership as well as tracks.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-032 — Refresh Previews Before It Applies

**Status**: Approved

**Decision**: A refresh computes the diff, reports it ("N new, M changed, K removed") and applies
only on confirmation. The first import applies directly. DEC-011's Collection/Set reference check is
built now as a seam that returns zero references until Phase 6 fills it.

**Reason**: DEC-003 deletes removed tracks irreversibly. A preview is what makes that a decision
rather than a surprise, and building the reference seam now means the flow does not change shape
when Collections arrive.

**Implications**: The refresh is two operations — compute a diff, apply a diff — which shapes both
the engine API and the eventual UI.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-033 — Import Runs as a Background Job

**Status**: Approved

**Decision**: Import and refresh run as background jobs of a new `library_import` type, reporting
progress through the existing job infrastructure and the SHELL-07 status strip.

**Reason**: FOUNDATION-07 gave the `jobs` table a type discriminator for exactly this, and the
status strip already displays running jobs with live progress. A synchronous import would block a
request for the length of a 50,000-track parse and duplicate progress reporting that exists.

**Implications**: `JobStore`'s match-specific assumptions have to give way to a second job type.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-034 — Capture Every Useful Rekordbox Field Now

**Status**: Approved · **Amended by DEC-038** (total time lands in the existing
`duration_seconds` column rather than a new one)

**Decision**: Import captures rating, play count, colour, date added, comments, total time and
bitrate in addition to today's fields, in one migration.

**Reason**: Adding a column later is cheap; backfilling it is not — it requires every user to
re-import their collection. These are the fields Phase 4 sorts and filters by and Phase 6 organizes
with.

**Implications**: Migration 0005 extends `tracks`; the parser gains one pass over the new
attributes. Six of the seven fields became new columns — see DEC-038 for total time.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-035 — The Library Remembers Its Source File

**Status**: Approved

**Decision**: The imported XML's path and modified time are stored with the import. Refresh re-reads
that file without asking, and reports clearly when it has moved, vanished, or is unchanged.

**Reason**: A refresh has to know what to re-read. Asking every time turns routine refreshing into a
file dialog and lets a different export silently replace the library; watching the file would mean a
background watcher and unprompted interruptions.

**Implications**: A small `library_source` record, and a "source missing" state in the refresh flow.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-036 — inKey and inCrate Are Not Moved onto the Library Yet

**Status**: Approved

**Decision**: Both keep parsing an XML per run through Phase 3. Phase 7 switches inKey when it
becomes Clean; Phase 9 switches inCrate when it becomes Discover.

**Reason**: DEC-021 already assigned those moves to those phases. Rewriting a mature flow inside a
phase about persistence would put unrelated risk into both.

**Implications**: Three code paths read Rekordbox XML during Phase 3. That is temporary and
tracked, not accidental.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-037 — Missing Audio Files Are Not Checked at Import

**Status**: Approved

**Decision**: Import records the path Rekordbox provides and does not check whether the file exists.
Missing-file detection belongs to Phase 7, with duplicates and library health.

**Reason**: Checking 50,000 paths against disk is a slow scan with its own progress, failure modes
and caching questions, and Phase 7 is already scoped to do it properly.

**Implications**: The library can contain tracks whose files are gone; nothing in Phase 3 or 4
claims otherwise.

**Decided with**: User · **Date**: 2026-09-02

---

## DEC-038 — One Column for a Track's Length

**Status**: Approved · **Amends**: DEC-034

**Decision**: Rekordbox's `TotalTime` is imported into the existing
`tracks.duration_seconds` column. The separate `total_time` column DEC-034's field list implied is
not created.

**Reason**: DEC-034 listed "total time" among the fields to capture without noticing that `tracks`
had held `duration_seconds` for the same quantity since migration 0002. Implementing the list
literally produced two columns for one number, and the wrong one was the one the engine API
exposes: after importing a real 3,880-track collection, `total_time` was populated on 3,879 tracks
and `duration_seconds` on none, so `/api/v1/library/search` reported no duration for anything.

`duration_seconds` is the name that survives because it is the domain's, not the vendor's — its
unit is in the name, it is already in the public response shape, `engineClient.ts` and
`cuepointBridge.types.ts`, and a model named after a Rekordbox XML attribute would leak the import
format into every phase that reads a track. Phase 8's export maps it back to `TotalTime` in one
line.

Migration 0005 was corrected rather than followed by a migration that drops the column it had just
added: it had not shipped, and no database outside the development machine had ever applied it.
That is the only circumstance in which this repository's append-only migration rule gives way, and
it is recorded here rather than left to be inferred from the diff.

**Implications**:
- DEC-034 still captures seven fields; only the column it lands in changed for one of them.
- `LibraryTrack.total_time` does not exist. The engine API response shape is unchanged.
- Pinned by tests in `test_rekordbox_library.py` and `test_library_source_schema.py` that fail if a
  second length column reappears.

**Decided with**: User (delegated: "do whatever you think better and most professional") ·
**Date**: 2026-09-03

---

## DEC-039 — The Library Page Is the Browser

**Status**: Approved

**Decision**: Phase 4 turns the existing Library page into the library browser — playlist pane,
track table and Track Inspector — rather than adding a second navigation destination. Import,
refresh and the source-file state compress into a header on the same page.

**Reason**: DEC-020's registry declares the whole target information architecture, and it contains
one `library` destination. A separate "Browse" entry would add a destination the registry was
written to make unnecessary, and would split "what my library holds" from "my library" for no
gain.

**Implications**:
- LIBRARY-11's test asserting that the Library page renders no table is inverted by this phase,
  deliberately and in one place, rather than deleted quietly.
- The import and refresh flows, their wording (`libraryFormat.ts`) and DEC-032's preview dialog are
  preserved intact — this is a change of surrounding layout, not of that flow.
- The empty state stays the empty state: with no library imported, the page is the import prompt
  LIBRARY-11 built, not an empty grid.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-040 — Rows Come From the Engine, One Window at a Time

**Status**: Approved

**Decision**: The library table is fed by server-side windowed queries. Scope, text query, filters,
sort and paging are all resolved in SQL; the renderer holds only the rows it is showing plus a
margin, and fetches more as it scrolls. This extends `/api/v1/library/search` per DEC-023 rather
than adding a second query path.

**Reason**: `ResultsTable` materializes and sorts every row in JavaScript, which is a different
program at 50,000 rows than at 400. LIBRARY-12 measured the library at the size it is designed for;
a table that only works below a few thousand rows would not survive its own test data.

**Implications**:
- Sort becomes an API parameter with a whitelist of sortable columns, not a click handler over an
  array. Sorting a column the database cannot sort is a contract error, not a slow render.
- Every ordering needs a stable tiebreak (`id`), or paging can repeat or skip rows where sort keys
  collide — which they do constantly on `artist` and on a null `bpm`.
- Indexes must exist for the sorts and filters offered. A column that cannot be indexed is a column
  that should not be offered as a default sort.
- `total` continues to mean the full match count, so "showing 200 of 47,913" needs no second call.
- The renderer must show unloaded rows as placeholders rather than as an empty table, and must not
  reorder or renumber while a window is in flight.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-041 — A New Generic Track Table; `ResultsTable` Converges in Phase 7

**Status**: Approved

**Decision**: Phase 4 extracts a generic `TrackTable` from `ResultsTable`'s proven parts —
virtualization, resizable columns, sticky header, persisted layout — and uses it for the library.
`ResultsTable` and the inKey results screen are left untouched, and migrate onto `TrackTable` in
Phase 7 when inKey becomes Clean.

**Reason**: `ResultsTable` is mature, load-bearing and shaped entirely around match results
(`TrackResult`, a `write` checkbox, Beatport columns, client-side sort). Rewriting it in place
would put a working screen's risk inside a phase about a new one. Coexist-then-converge is the
pattern DEC-030 and DEC-036 already set in this project.

**Implications**:
- Two table components exist between Phase 4 and Phase 7. That is temporary and tracked, not
  accidental — the same standing this repository gave two collection databases under DEC-030.
- `TrackTable` must be generic in row type and column definition from the start, or the
  convergence it promises will not be possible. Its data source is windowed (DEC-040), so the
  match screen's in-memory array becomes one adapter of that interface in Phase 7, not a special
  case inside the component.
- inCrate's bare list adopts the same table in Phase 9 (DEC-021), not now.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-042 — Columns Can Be Hidden and Reordered

**Status**: Approved

**Decision**: The library table has a column picker (show/hide) and drag-to-reorder, both persisted
alongside the existing per-column width persistence. A "reset columns" action restores the default
set, order and widths.

**Reason**: User chose the fuller option over the recommended show/hide-only: order is part of how
a dense table is read, and a column that cannot be moved is a column that eventually gets hidden
instead.

**Implications**:
- Column layout becomes ordered state, not a set of visibility flags — persisted as an explicit
  ordered list of column ids plus widths, so a column added in a later release appears at a defined
  position rather than wherever a merge puts it.
- Stored layout must be reconciled with the current column registry on load: unknown ids dropped,
  missing ids appended in registry order. Without that, a rename or a removed column leaves a
  persisted layout that renders a blank column forever.
- Reorder must work in a virtualized CSS-grid table, which is the real cost of this option and is
  accepted knowingly.
- Sticky columns interact with reorder: whatever is pinned left stays pinned, and the constraint is
  stated in the step rather than discovered.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-043 — Filters Are the Smart Collection Rule Model, Unsaved

**Status**: Approved · **Related**: DEC-016

**Decision**: Phase 4 builds field filters (genre, key, BPM range, year, rating, label, and text)
on top of one rule model — a flat, AND-only list of `{field, operator, value}` clauses, the exact
shape DEC-016 chose for Smart Collections. Phase 6's Smart Collections save that model; Phase 4
holds it in view state.

**Reason**: Two rule vocabularies for the same job would drift, and the drift would show up as a
filter that finds tracks a Smart Collection with the same rules does not. Building one model once,
and adding persistence later, costs almost nothing extra now.

**Implications**:
- The field/operator vocabulary and its SQL compilation live in Python, per the "business rules
  stay in Python" invariant. The renderer sends rules and renders facets; it does not build SQL or
  decide what a rule means.
- Operators are validated against a whitelist per field type. An unknown field or operator is a
  rejected request with a message, never an interpolated string.
- Facet values (which genres exist, and how many tracks each has) come from the engine, so the
  counts reflect the library rather than the loaded window.
- Phase 6 inherits the model, the compiler and their tests; what it adds is a table to store rule
  sets in and a UI to name them.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-044 — The Playlist Tree Scopes the Table

**Status**: Approved · **Implements**: DEC-031

**Decision**: The Library page has a playlist pane showing the mirrored Rekordbox folder/playlist
tree. Selecting a playlist scopes the table to its tracks; inside a playlist the default sort is
the playlist's own order ("as arranged in Rekordbox"). Selecting nothing shows the whole library.

**Reason**: DEC-031 mirrored the tree and its membership precisely so Phase 4 could browse by
playlist, and a DJ's mental index of their collection is the playlist tree, not an alphabetical
list of 50,000 tracks.

**Implications**:
- A playlists endpoint is required — the mirrored tree has never been exposed over HTTP — with the
  full six-file desktop-contract synchronization.
- Playlist order is a sortable dimension only within a playlist scope. Offering it library-wide
  would be meaningless, and the step says so rather than leaving it to be tried.
- Playlists remain read-only (DEC-031): no drag-to-add, no rename, no delete. CuePoint's own
  editable Collections are Phase 6.
- Expansion and selection state persist with the existing `localStorage` pattern.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-045 — Multi-Select Is Built Now

**Status**: Approved

**Decision**: The library table supports multi-selection — click, ctrl/cmd-click, shift-click,
select-all — with a visible selection count. The only actions offered in Phase 4 are the ones that
exist today: copy the selection, and reveal a file in the OS file manager.

**Reason**: Nothing in this build can tag, rate or collect a set of tracks yet, but every phase
after this one can. Retrofitting a selection model into a virtualized table backed by windowed data
is materially harder than building it once.

**Implications**:
- Selection is identified by track id, not row index — with windowed data a row index means nothing
  once the window moves, and "select all" cannot mean "all loaded rows".
- "Select all" over a filtered 50,000-row view is a *description* of a selection (the current
  query), not a list of ids. The model must be able to express that, or Phase 6's "tag everything
  matching this filter" becomes a rewrite.
- The Inspector shows the last-clicked track when several are selected, and says how many are
  selected. It is not a multi-track editor; that question belongs to Phase 6.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-046 — Double-Click Does Nothing Until the Player Exists

**Status**: Approved · **Anticipates**: DEC-012

**Decision**: In Phase 4, single click selects a row and fills the Inspector; double-click does
nothing. Phase 5 gives double-click DEC-012's meaning — play the track and load the current view as
the queue.

**Reason**: Giving double-click a temporary meaning teaches a gesture in order to take it away.
Doing nothing is honest about the fact that playback has not been built yet.

**Implications**:
- `TrackTable` still carries an `onRowActivate` callback so Phase 5 has a defined seam, and a test
  asserts the library page passes nothing to it today.
- The context menu ships in Phase 5 with playback in it (DEC-013), not in Phase 4 with two entries
  that would be re-ordered a phase later. Copy and reveal-in-file-manager live in the selection
  toolbar until then.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-047 — The Inspector Shows Everything Imported, Read-Only

**Status**: Approved · **Fills**: DEC-024

**Decision**: Phase 4 fills DEC-024's empty Inspector slot with the selected track's full imported
record — identity, the DEC-034 fields (rating, play count, colour, date added, comment, bitrate),
BPM, key, duration, file path — plus the playlists that contain it. Everything is read-only.

**Reason**: The Inspector container has existed since Phase 2 with nothing in it; this is the first
phase with data to put there. Read-only because nothing in this build owns editing yet: ratings and
tags are Phase 6, Beatport values are Phase 7, and an editable field with no write path is a lie.

**Implications**:
- A track-detail endpoint is required for playlist membership; `playlist_ids_for_track` already
  exists in the repository and is not re-implemented.
- Ratings display as stars with no conversion in the UI. This bullet originally called for a
  mapping function for Rekordbox's 0/51/102/153/204/255 encoding; reading the code during LIBUI-01
  showed the conversion already happens at import (`_rating_to_stars`), and `LibraryTrack` rejects
  any rating outside 0–5, so the stored value is already the star count. Corrected here rather than
  left to be implemented twice.
- A field Rekordbox did not provide reads as absent, not as zero — a missing rating and a
  zero rating are different facts, which is why LIBRARY-01 made those columns nullable.
- Phase 6 adds editing in place; Phase 7 adds the Beatport comparison beside it. Neither replaces
  this panel.

**Decided with**: User · **Date**: 2026-09-04

---

## DEC-048 — A Data Font for Dense Values

**Status**: Approved

**Decision**: A `--font-data` token is introduced and used for table cell values and Inspector
field values only. Pixelify Sans remains the font of the application everywhere else — headers,
buttons, labels, panel titles, navigation. This closes the open sign-off item recorded in
`PIXEL_DESIGN_SYSTEM.md` §4.

**Reason**: The pixel identity lives in the black outlines, the bevels, the hard zero-blur shadows
and the square corners — not in the numerals. A display face set at 10–12px across 14 columns of
titles, keys and BPMs is the one place that identity costs legibility, and this is the screen users
will stare at longest.

**Implications**:
- `--font-data` is a system-first stack, not a second Google Fonts `@import`: the packaged app must
  render identically offline, and today's single webfont is already a network dependency worth not
  doubling.
- It is a token, so a theme or a later decision can point it back at Pixelify Sans in one line.
- `PIXEL_DESIGN_SYSTEM.md` is updated in the same step that introduces it, since that document
  records the open question this answers.
- Contrast and hit-target checks (`apps/desktop-electron/docs/design-signoff.md`) are re-run for the
  table at 1×, 2× and 3× scale, because row density and font metrics change both.

**Decided with**: User · **Date**: 2026-09-04
