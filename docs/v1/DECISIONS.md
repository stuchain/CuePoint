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

### Amendment (2026-09-13) — the warning counts everything the user authored

**What the Phase 7 specification found**: DEC-011 was written in Round 2, when a Collection or Set
was the only CuePoint data anyone had imagined attaching to a track. By Phase 7 a refresh that
deletes a track also cascades its CuePoint rating, favorite and note (DEC-057), its tags (DEC-015),
and — from Phase 7 — the user's match decisions (DEC-067) and applied or typed values (DEC-068,
DEC-069). `references_for()` counted only Collections and Sets, so a refresh could destroy an
afternoon of review work with no warning beyond the plain deletion count. Raised as Q-076.

**Amended decision**: The refresh warning counts every removed track carrying data that cannot be
recomputed: Collection or Set membership, a CuePoint rating, favorite or note, a tag, a match
decision made by the user, or an override. The warning states each non-zero kind ("12 tracks removed
from Rekordbox carry your own work: 3 in 2 Collections, 5 rated or noted, 4 tagged, 6 reviewed or
edited").

**Amended implications**:
- Data a scan or a re-match re-derives — match attempts, `auto` states, file status, duplicate
  groups, artwork state — is not counted. The rule is "counted when it cannot be recomputed", so a
  future phase knows which side of the line its data falls on.
- `ReferenceSummary` is extended, not renamed; `has_references` becomes true for any counted kind.
  Built in CLEAN-05, the first step whose data a refresh could otherwise delete silently.

**Unchanged from the original decision**: a removal that touches none of it applies without a
prompt. The common case stays frictionless, which was half of DEC-011's reason.

**Decided with**: User (delegated: "take the most professional and better long term decisions") ·
**Date**: 2026-09-13

### Implemented (2026-09-14, CLEAN-05) — five kinds, each with its number

**What building it settled**:

- *Reviewed and edited are two kinds, not one.* A match decision and an override are different
  losses, and a user deciding whether to go ahead needs to know which it is. The preview says "12
  tracks you are about to remove carry your own work: 3 in 2 Collections, 5 rated or noted, 4
  tagged, 6 reviewed, 2 edited. Removing them removes that too." The engine's refusal says the same
  kinds for a caller that never saw a preview.
- *The Collection kind carries a track count too.* `collection_track_count` joins the summary, so
  "3 in 2 Collections" has its number, as every other kind does.
- *A record that no longer says anything is not work.* A CuePoint metadata row whose rating,
  favorite, note and overrides are all empty, and a decision cleared back to automatic, are not
  counted.
- *Four questions per chunk of 500*, beside the Collection one, so a refresh deleting 20,000 tracks
  asks a bounded number of questions rather than one per track.

**Why the decision stands**: It is the amendment's rule applied without exceptions: counted when it
cannot be recomputed, and a removal carrying none of it still goes ahead without a prompt.

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

---

## DEC-049 — How libmpv Is Embedded

**Status**: Approved, then **amended 2026-09-05** (see the amendment note at the end of this entry
- implementation showed the bundled binary's licence is GPL, not LGPL) · **Refines**: DEC-005

**Decision**: CuePoint bundles the **official prebuilt `mpv` executable** for each OS as a second
sidecar and controls it over mpv's JSON IPC protocol — a named pipe on Windows, a unix domain
socket on macOS and Linux — spawned by Electron main with `--idle --no-video --input-ipc-server`.
It does not link libmpv into a native Node addon, and it does not wrap libmpv in a sidecar of our
own.

**Reason**: The repository already knows how to do exactly this once. `EngineSupervisor` spawns a
bundled binary, restarts it with backoff, reports its health to a status strip and fails visibly;
`scripts/build_engine_sidecar.py` builds a per-OS binary into `resources/engine/${os}` which
`extraResources` ships. A second sidecar reuses that shape wholesale. The alternatives each add
something the release pipeline does not currently have: a native addon needs per-OS,
per-Electron-ABI compilation and turns a decoder crash into an application crash; a custom
C/Rust wrapper puts a toolchain we own in a release path the audit already calls lightly tested.

**Implications**:
- A `PlayerSupervisor` is written in the image of `EngineSupervisor`, not as a new pattern.
- Licence compliance is satisfied by shipping the binary unmodified and carrying its licence text;
  the `license-compliance` workflow gains mpv as a bundled non-Python component. No relinking
  obligation arises because nothing is statically linked. (This bullet originally said *LGPL*; see
  the amendment below.)
- The binaries are fetched at build time into `resources/player/${os}` and are **not** committed —
  `large-file-check` and repository size both argue against vendoring them, and the engine sidecar
  sets the precedent that `resources/` is build output.
- Playback commands are asynchronous request/response over a socket, so the contract needs request
  ids, an observer/event stream for position and state, and a timeout policy. This is the
  substance of PLAYER-01–03.
- Offline builds need a cache or a pinned local path; the fetch script must fail loudly rather
  than silently producing an app with no player.

**Decided with**: User (delegated to recommendation) · **Date**: 2026-09-05

### Amendment (2026-09-05) - the bundled binary is GPL, not LGPL

**What implementation found**: PLAYER-01 pinned mpv's own CI builds and read their contents. They
are **GPL-2.0-or-later**, not LGPL. mpv supports an LGPL build configuration, but the published
builds are not built that way - they include GPL components such as `libdvdcss` - and no
first-party LGPL *player* binary is published at all. The only LGPL artifacts upstream publishes
are `libmpv` development builds, which could only be used through the native-addon approach this
decision rejected. Two further facts came out of the same work: mpv publishes no binaries on its
stable tags, so the pin necessarily tracks a rolling tag and expires; and the shipped binary must
be accompanied by the exact upstream commit so the corresponding source is identifiable.

**Amended implication**: the obligation is the **GPL's**, discharged by (1) shipping
`LICENSE.GPL`, `LICENSE.LGPL` and `Copyright` from the pinned commit inside every package,
(2) recording that commit in the manifest and in the install receipt written beside the binary, and
(3) shipping the binary unmodified. `scripts/check_bundled_licenses.py` fails the build if any of
this is missing, and `third_party/mpv/NOTICE.md` records the analysis.

**Unchanged from the original decision**: everything architectural. An unmodified binary running as
a separate process, spoken to over mpv's published JSON IPC interface, is aggregation rather than
incorporation, and is the shape that works under either licence - which is why the GPL finding
changes the paperwork and not the design. CuePoint's own code remains Apache-2.0. The native addon
and the custom wrapper stay rejected, and this amendment is a further reason to keep rejecting the
addon: linking libmpv into CuePoint's own process is a different licensing question with a
different answer.

**Also corrected**: the implications above describe the engine sidecar as building into
`resources/engine/${os}`. That path never resolved - electron-builder's `${os}` expands to
`mac`/`win`/`linux`, not `darwin`/`win32` - and both sidecars now use `${os}-${arch}`. See
`docs/ui-overhaul/adr/004-player-backend.md` and the CHANGELOG entry for the packaging fix.

**Decided with**: User (delegated: "decide the most professional and proper decisions") ·
**Date**: 2026-09-05

---

## DEC-050 — Playback State Lives in Electron Main

**Status**: Approved · **Depends on**: DEC-051

**Decision**: Electron main owns the playback queue, the current track and the transport state,
mirroring mpv's state to the renderer over IPC events. The Python engine is not told that playback
is happening.

**Reason**: With DEC-051 writing nothing to the database, the engine has nothing to record, and a
split ownership whose engine half is empty is a seam that costs a boundary and buys nothing. This
also keeps AGENTS.md's division intact on its own terms: playback is supervision of a bundled
process, which is precisely what Electron main is for, and no business rule is involved in deciding
which file plays next.

**Implications**:
- The renderer holds no authoritative playback state; it renders what main publishes and sends
  intents back. Same shape as engine status today.
- DEC-012's "the current view becomes the queue" means the renderer sends the resolved track list
  at play time — main does not query the library itself.
- Revisiting this is a real possibility: if Phase 10's Set Builder wants to read the queue, or a
  later decision reverses DEC-051, the queue moves or grows an engine half. Nothing here should
  make that hard, but nothing here anticipates it either.

**Decided with**: User (delegated to recommendation) · **Date**: 2026-09-05

---

## DEC-051 — Playback Writes Nothing to the Library

**Status**: Approved

**Decision**: Playing a track in Phase 5 changes no database row. No CuePoint play counter, no
last-played timestamp, no activity-feed entry per play. `tracks.play_count` keeps the value
Rekordbox exported and nothing writes to it.

**Reason**: Every alternative requires first defining what "played" means — three seconds, half the
track, to the end — and that threshold is arbitrary until some feature actually consumes the
number. Nothing in v1 does. It also keeps Phase 5 additive: the player can be built, changed and
thrown away without leaving marks on user data.

**Implications**:
- "Recently played" and "most played" are not v1 features and are not half-built here.
- A later phase that wants them adds its own columns; it must not repurpose the imported
  Rekordbox `play_count`, which means what Rekordbox meant by it.
- Playback failures are still surfaced (DEC-054) — that is a toast, not a database write.

**Decided with**: User · **Date**: 2026-09-05

---

## DEC-052 — What the Player Bar Contains

**Status**: Approved · **Completes**: DEC-013

**Decision**: Phase 5 ships play/pause, previous/next, a seekable position bar with elapsed and
total time, volume, current-track information, shuffle and repeat (off / one / all) as persisted
toggles, and a visible, reorderable queue panel.

**Reason**: DEC-013 already made "Play Next" and "Add to Queue" first-class context-menu actions
from day one. An append action whose result the user cannot see is an action they cannot trust or
correct — the queue panel is what makes DEC-013 legible, not an extra. Shuffle and repeat come with
it because both are queue-order concepts and the panel is where their effect is visible.

**Implications**:
- The queue panel is the largest single piece of UI in the phase and its own step, with drag
  reordering, remove-from-queue, and a marker for the currently playing item.
- Shuffle needs an explicit order model decided against DEC-012: shuffling reorders the queue that
  the view produced, and un-shuffling restores the view's order — the view itself never changes.
- Repeat-one must not fight gapless (DEC-056); it is a queue-advance rule, not a decoder setting.
- The transport pixel icons drawn in FOUNDATION-14 are finally used; shuffle, repeat and queue
  icons are new and follow `PIXEL_DESIGN_SYSTEM.md`.

**Decided with**: User · **Date**: 2026-09-05

---

## DEC-053 — The Bar Appears on First Play

**Status**: Approved · **Fulfils**: DEC-025

**Decision**: The player region stays at zero height exactly as DEC-025 left it until the first
track is played, then occupies its row for the rest of the session. Closing the app resets it,
consistent with DEC-014.

**Reason**: This is the reading of DEC-025 that survives contact with the phase that fills it.
DEC-025's stated reason was never "the region should be empty" but "the app never ships controls
that do nothing" — a bar with no track and disabled transport is that same thing, just later. The
one-time layout shift costs less than a permanently reserved strip with nothing in it.

**Implications**:
- `PlayerRegion`'s `if (!children) return null` behavior is kept, not deleted — Phase 5 supplies
  children once there is something to play, and the existing test that the empty region takes no
  space remains valid and load-bearing.
- The content region must handle being resized under the bar without losing scroll position or
  table window state.
- There is no "stop" that empties the queue and retracts the bar; ending playback leaves the bar
  showing the last track, paused.

**Decided with**: User · **Date**: 2026-09-05

---

## DEC-054 — A Queued File That Will Not Play Is Skipped

**Status**: Approved · **Meets**: DEC-037

**Decision**: When a queued file is missing or mpv cannot decode it, the player logs the failure,
advances to the next queue item, and shows a toast naming the track. Consecutive failures coalesce
into one toast reporting the count.

**Reason**: DEC-037 deliberately deferred file-existence checking to Phase 7, which makes the
player the first thing in CuePoint to discover a moved or deleted file. Stopping the queue lets one
bad file end a listening session; failing silently leaves the user guessing why tracks went past.
Coalescing is not a refinement but a requirement: a 50,000-track library on a disconnected drive
must produce one toast, not a toast storm.

**Implications**:
- The failed track is marked in the queue panel as failed, so the skip is visible after the toast
  is gone.
- Nothing is written to the database — this does not pre-empt Phase 7's missing-file detection, and
  a track that failed once is retried normally next time.
- If every item in the queue fails, the player stops and says so once rather than looping.

**Decided with**: User · **Date**: 2026-09-05

---

## DEC-055 — Output Device and Exclusive Output Are User-Controlled

**Status**: Approved, then **amended 2026-09-06** (see the amendment note at the end of this entry
— the bundled build has no SoX resampler) · **Delivers on**: DEC-005

**Decision**: Settings gains an audio section with an output-device picker enumerated from mpv, an
exclusive-output toggle (WASAPI exclusive on Windows, hog mode on macOS), and mpv's high-quality
resampler configured explicitly rather than left at defaults.

**Reason**: DEC-005 chose libmpv for foobar2000-grade playback. A high-quality decoder played to
the system default device through the OS mixer at whatever rate the mixer happens to be running is
not that claim delivered. A DJ with an audio interface who cannot route CuePoint to it is a
day-one complaint, and exclusive output is the specific mechanism that makes bit-perfect playback
real rather than nominal.

**Implications**:
- This is the only part of Phase 5 with genuinely divergent per-OS behavior, so it is its own step
  rather than an addition to an existing settings step.
- Exclusive mode can fail at runtime — device busy, unsupported format — and must fall back to
  shared output with a visible, non-fatal message rather than silence.
- Device lists change while the app runs; a disappeared device must not wedge playback.
- Settings persist through FOUNDATION-09's settings architecture, not a new store.
- Volume normalization and ReplayGain are explicitly excluded: they need scan data the library does
  not have, which is Phase 12's scope.

**Decided with**: User · **Date**: 2026-09-05

### Amendment (2026-09-06) — the bundled build has no SoX resampler

**What implementation found**: PLAYER-11 drove the pinned mpv directly before configuring anything.
Asking it for SoX resampling — `--audio-swresample-o=resampler=soxr` — produces
`SWR: Requested resampling engine is unavailable`, then `libswresample failed to initialize`, and
**every track that needs resampling fails to play**. The bundled build's FFmpeg is not compiled with
libsoxr. mpv accepts the option at the command line without complaint, so the failure appears only
at the moment a file is loaded: shipping it would have been silence sold as quality.

**Amended implication**: "mpv's high-quality resampler configured explicitly rather than left at
defaults" is delivered with the highest-quality settings the build actually has —
`--audio-resample-filter-size=32` (libswresample's maximum, twice the default) and
`--audio-resample-phase-shift=12` (a 4,096-entry phase table rather than 1,024). Both were verified
to play a resampled file through the real binary. `electron/mpvAudio.integration.test.ts` asserts
that soxr is *unavailable*, deliberately inverted: if a future bundled build gains libsoxr the test
fails and the choice is made again with the evidence in front of whoever makes it, rather than
staying at second best because nobody rechecked.

**Unchanged from the original decision**: everything else. The device picker, the exclusive-output
toggle, the runtime fallback and the persistence are as decided. The resampler settings matter only
in shared mode — exclusive output avoids sample-rate conversion altogether, which remains the way
DEC-005's claim is actually delivered.

---

## DEC-056 — No Crossfade in v1

**Status**: Approved · **Closes**: the crossfade item deferred since Round 2

**Decision**: CuePoint v1 plays gapless and does not crossfade. No fade duration setting, no
second decoder instance, no filter graph for track transitions.

**Reason**: CuePoint prepares sets; the mixing happens in Rekordbox. Crossfade also actively fights
gapless — one wants overlapping decode at a track boundary and the other wants none — so building
both means choosing between them per transition, for a feature nobody has asked for. The question
had to be answered before PLAYER-01's control contract, not after, because a crossfade decides
whether that contract needs two decoders.

**Implications**:
- One mpv instance, one playlist, gapless left at mpv's own behavior.
- The control contract is written for a single decoder. Revisiting this later is a real change to
  that contract, not a setting — recorded here so the cost is not underestimated when it comes up.
- Phase 10 may re-open it with a concrete Set Builder use case; that would be a new decision
  superseding this one, not an amendment.

**Decided with**: User · **Date**: 2026-09-05

---

## DEC-057 — CuePoint Metadata Is Its Own Layer

**Status**: Approved · **Related**: DEC-004, DEC-034, DEC-047, DEC-008

**Decision**: A CuePoint rating, favorite and note are stored separately from the Rekordbox-imported
`rating` and `comment`. Both survive. The UI shows an *effective* value and says where it came
from. A Rekordbox refresh writes only the imported fields and can never overwrite a CuePoint one.

**Reason**: `tracks.rating` and `tracks.comment` are already populated from Rekordbox by DEC-034's
import, so a single-field design means either a routine refresh silently discarding a user's own
rating, or one column whose meaning depends on a flag. Phase 8 also has to write an export, and it
can only choose whose value to write if both are still there to choose between. This is DEC-004's
precedence model — keep the source value, record the CuePoint value, resolve at read time — reused
rather than a second mechanism invented for the same problem.

**Implications**:
- New nullable fields for the CuePoint layer: a 0–5 rating, a favorite flag, and free-text notes.
  Whether they are columns on `tracks` or a sibling table is the phase spec's call; either way the
  imported columns keep their current names and meanings, and nothing that reads them changes.
- Effective rating is the CuePoint value when set, otherwise the Rekordbox one. Clearing an override
  falls back to Rekordbox's value; it does not write zero. A missing rating and a zero rating stay
  different facts (DEC-034, DEC-047).
- The Inspector shows the source of the effective value and offers "clear override" — the one
  control that makes the two-layer model visible instead of mysterious.
- "Favorite" is its own flag, not five stars. They are different statements and a user who wants
  both should not have to spend one to get the other.
- Notes are a CuePoint field beside Rekordbox's comment, never on top of it. The Inspector shows
  both, labelled.
- Every edit writes a `track_history` row whose `source` marks it as the user's (FOUNDATION-08,
  DEC-008), so the History tab distinguishes "you changed this" from "the last import changed this".
- Filter and sort vocabulary addresses the layers separately, with the UI's plain "Rating" meaning
  the effective value (DEC-060).

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-058 — A Collection Is Ordered and May Repeat a Track

**Status**: Approved · **Related**: DEC-006, DEC-017 · **Recommendation not taken** (Q-057)

**Decision**: Collection membership is explicitly ordered and reorderable by drag, and a track may
appear in the same Collection more than once — DEC-017's rule for Sets, applied to Collections.

**Reason**: An ordered list that refuses a deliberate second entry has to explain itself, and the
explanation would be a rule with no reason behind it: a DJ can repeat a track in a Set for a
closing reprise, and cannot in a Collection. Ordering is not optional either way, because Phase 8
exports a Collection into a Rekordbox playlist, which is ordered, and an unordered Collection would
lose that information at the boundary. The recommendation was ordered-without-duplicates, on the
grounds that "a Collection is a set of tracks, a Set is a running order" is what keeps DEC-006's
single-primitive decision coherent; consistency with DEC-017 was preferred.

**Implications**:
- A membership row needs its own identity — a row id, with `(collection_id, position)` unique —
  rather than a `(collection_id, track_id)` primary key. "Remove the track" is ambiguous when it
  appears twice; the UI removes a *specific entry*.
- A rule asking whether a track is in a Collection (DEC-060) is an `EXISTS`, so a duplicate never
  double-counts a track in a rule result.
- A Collection reports its entry count. Where that differs from the number of distinct tracks, both
  are shown, because a "412 tracks" label that means 412 entries is a small lie that costs trust.
- Adding a multi-selection to a Collection appends only the tracks not already in it and says how
  many it skipped; a deliberate duplicate is made by an explicit drop or "add anyway" inside the
  Collection view. Bulk-adding is the gesture most likely to create duplicates by accident, and the
  one where the user can least easily see it happen.
- **The Collection/Set distinction now rests entirely on what Phase 10 adds** — Chapters,
  transitions, set-level analysis and export — and not on structure. Recorded here so Phase 10
  weighs that deliberately instead of rediscovering it as an argument for merging the two concepts.
- `references_for()` (DEC-011) counts distinct tracks, not entries: the question it answers is how
  many *tracks* about to be deleted are still referenced.

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-059 — Collections Nest in Folders

**Status**: Approved · **Related**: DEC-044, DEC-031 · **Recommendation not taken** (Q-058)

**Decision**: Collections and Smart Collections live in a user-editable folder tree from day one,
the same shape as the Rekordbox tree already mirrored in `rekordbox_playlists`.

**Reason**: The pane will be rendering one tree beside it already, and a user who files Rekordbox
playlists into folders will want folders for their own Collections on the first day. Building flat
first — the recommendation, on the grounds that tree UI is a real cost for a library that starts
with zero collections — would mean writing the pane twice.

**Implications**:
- One table with a `kind` discriminator (`folder` | `collection` | `smart`), a nullable `parent_id`,
  a sibling `position` and a name: deliberately the same shape as m0006's `rekordbox_playlists`, so
  one pane component renders both trees. It is a *separate* table, because this one is edited by the
  user and is not rebuilt from the XML on every import.
- A `CHECK` on `kind` at creation, per m0006's reasoning — SQLite cannot drop a constraint without
  rebuilding the table, and this table holds user data, so the constraint has to be right the first
  time.
- Only a folder may be a parent. Cycles and self-parenting are refused at the service layer, and
  depth is bounded.
- Deleting a folder deletes its subtree, behind a confirmation that names what goes. Deleting a
  Collection never deletes tracks.
- Rename, move (drag between folders), and reorder among siblings are **phase scope**, not a later
  nicety. Listed explicitly so the step inventory budgets them.
- Smart Collections file into the same tree, so rules sit beside lists rather than in a second
  parallel place.
- The Rekordbox tree stays read-only (DEC-031); the two trees must be visually and behaviorally
  distinct in one pane — a drag into a Collection works, a drag into a playlist is refused.

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-060 — Rules Reach CuePoint-Owned Data

**Status**: Approved · **Extends**: DEC-043, DEC-016

**Decision**: The rule vocabulary grows beyond the `tracks` table to tags, CuePoint rating,
favorite, notes and Collection membership. A rule may not reference a Smart Collection.

**Reason**: Tag-based Smart Collections are most of the point of having tags. A filter bar that
cannot say "tagged Peak-time" while a Smart Collection can would be exactly the drift DEC-043 was
written to prevent, and the drift would show up as a filter finding tracks its saved twin does not.

**Implications**:
- `filter_sql.py` today compiles every rule to a bare predicate on `tracks` — no joins, no aliases.
  Membership rules make it emit `EXISTS` subqueries. That is the single largest change this decision
  causes, and its three existing properties hold unchanged: column names come from the registry and
  never from the caller, values are always bound parameters, and LIKE wildcards stay escaped.
- New field kinds join the registry alongside text/number/date: a tag field, a boolean favorite, and
  membership fields whose value is a Collection id. Operators stay whitelisted per type, and an
  unknown field or operator is still a rejected request with a message, never an interpolated
  string.
- **No recursion**: a rule cannot name a Smart Collection. This prevents cycles and unbounded
  evaluation, and keeps a Smart Collection explainable — its membership depends on facts about
  tracks, not on what another query happens to answer right now.
- A rule naming a deleted Collection is a broken rule, and says so on the Smart Collection rather
  than quietly matching nothing.
- Tags are facetable ("which tags exist, and how many tracks each"); notes are free text and are
  not, for the reason `FieldSpec.facetable` already gives.
- One compiler serves the Library filter bar and every Smart Collection, as DEC-043 requires.

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-061 — Smart Collections Are Live, Duplicable and Freezable

**Status**: Approved · **Closes**: the Smart Collection export/duplication item deferred since
Round 2 · **Related**: DEC-016, DEC-040, DEC-043

**Decision**: A Smart Collection stores rules, not membership. It is evaluated at query time and
never materialized. A rule set can be duplicated. "Freeze to Collection" writes the current
membership into a static Collection. A track cannot be manually added to or removed from a Smart
Collection. Whether a Smart Collection exports directly is Phase 8's decision, not this one.

**Reason**: DEC-040 already made windowed SQL over 50,000 rows the normal way this app answers a
query, so materializing membership buys nothing and adds a staleness bug with an invalidation rule
to get wrong — every edit, import, refresh and batch operation would have to know which cached
memberships it just falsified. Refusing manual pinning is what keeps a Smart Collection
explainable: its answer is "these rules, therefore these tracks", and a hand-pinned exception makes
that sentence false.

**Implications**:
- Stored state is the rule set plus name, folder and sort. There is no membership table for Smart
  Collections and nothing to invalidate.
- Evaluation reuses the existing count-plus-window path, so a Smart Collection scope costs what a
  filter costs.
- Freeze is a copy, not a link. The new Collection records where it was frozen from and when, and
  the freeze writes an activity event. Nothing keeps the two in step afterwards, and the UI says so
  at the moment of freezing rather than in a tooltip later.
- Duplicating copies the rules and settings into a new name and does not link the original.
- Phase 8 may decide a Smart Collection exports as a playlist of its current membership; nothing
  here prevents that, and freezing is the answer in the meantime.

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-062 — Collections Live in the Library's Left Pane

**Status**: Approved · **Amends**: DEC-020 · **Implements**: DEC-039, DEC-044

**Decision**: The Library page's left pane gains a Collections tree beside the mirrored Rekordbox
tree. Selecting a Collection or a Smart Collection scopes the same table, by the same mechanism
DEC-044 built for playlists. The `collections` nav destination resolves to the Library page with the
Collections tree focused; it does not open a second browser.

**Reason**: DEC-039 decided the Library page *is* the browser, and a second page would mean a second
table, a second selection model and a second filter bar — three things that would drift from the
ones Phase 4 built and tested. DEC-020's IA declared a Collections destination before any of that
was settled; this amends where it lands, not whether it exists.

**Implications**:
- `navRegistry.ts`'s disabled `collections` entry becomes enabled and routes into the Library page
  with the Collections tree focused. DEC-027's last-visited-destination memory must resolve one
  page, not two ids that fight over it — the phase spec names the rule.
- A Collection scope is another scope alongside DEC-044's playlist scope: one table, one selection
  model (DEC-045), one filter bar.
- Inside a Collection the default sort is the Collection's own order, exactly as inside a playlist —
  and unlike a playlist, reordering is allowed and writes (DEC-058).
- The pane distinguishes read-only Rekordbox playlists from editable Collections by look and by
  affordance (DEC-031, DEC-059).
- Tree expansion and selection persist with the existing `localStorage` pattern, as the Rekordbox
  tree already does.

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-063 — Batch Edits Run as Jobs Above a Threshold, With Full History

**Status**: Approved · **Related**: DEC-045, DEC-008, DEC-007, DEC-033, DEC-029

**Decision**: A batch edit over a small selection applies synchronously; above a threshold it runs
as a background job in the status strip. Either way, every changed field writes its own
`track_history` row, and every row from one operation carries a shared batch id.

**Reason**: DEC-045 made a selection a *description* — the current query, possibly 47,913 rows —
precisely so this phase could tag all of them, and blocking the UI on that is not acceptable.
Writing one summary row instead of per-field history would be cheaper storage in exchange for
breaking the one promise DEC-008 made instead of building an undo stack, and a batch edit is
exactly the operation a user most wants to take back.

**Implications**:
- An "everything matching" selection crosses the wire as the query, never as a list of ids. The job
  resolves it to an id set **once, at start**, and reports how many tracks it acted on, so the
  answer cannot drift underneath a running job.
- The threshold is a named constant the phase spec fixes, not a user setting.
- The shared batch id is what makes "revert this batch" buildable later without an undo stack.
  Phase 6 must write the id; it does not have to build the revert UI.
- One activity event per batch, carrying counts (DEC-029) — not one event per track. The per-track
  detail lives in history, which is where a user looks for it.
- Cancellation leaves what was applied applied: the job is not a transaction across 47,913 tracks,
  and the activity event records how far it got. Saying so here is cheaper than a user discovering
  it.

**Decided with**: User · **Date**: 2026-09-06

### Implemented (2026-09-14, CLEAN-06) — the batch id is read back

"Revert this batch" is built (DEC-068). It reverts every history row carrying a batch id, newest
first, under a new batch id of its own, so the revert can be reverted in turn. It uses the same
threshold, counted in changes rather than tracks, the same committed chunks, the same cancel
semantics and one event with the counts. Rows that changed since are skipped and counted.
Migration 0014 adds the index on `track_history.batch_id` that migration 0009 left for the step
that wrote its query, as a partial index, and `PHASE7_CLEAN.md` records the measurement.

---

## DEC-064 — Phase 6 Writes Nothing Outside the Database

**Status**: Approved · **Related**: DEC-051, DEC-036

**Decision**: Ratings, favorites, notes, tags, Collections and Smart Collections live only in
CuePoint's database. Phase 6 writes no audio-file tags and no Rekordbox XML.

**Reason**: The same discipline DEC-051 kept for the player, for the same reason: a phase that only
reads and writes its own database is a phase whose failure modes are recoverable. `tag_writer.py`
works well and stays available, but "I rated one track and CuePoint modified four hundred files" is
not a failure mode worth introducing here, and carrying CuePoint's organization outward is a
question with its own safety properties that belongs to the export phase.

**Implications**:
- `data/tag_writer.py` is untouched by this phase; it remains Phase 7's and Phase 8's tool.
- Phase 8 decides the export mapping — Collections into Rekordbox playlists, ratings and tags into
  whatever fields make sense, if any — as an explicit user-initiated write, keeping the existing
  never-overwrite-the-source property.
- Until export exists, a user's CuePoint organization is invisible in Rekordbox. The user docs for
  this phase must say that plainly, next to the existing note about two collection imports that can
  disagree (DEC-030).

**Decided with**: User · **Date**: 2026-09-06

---

## DEC-065 — A Match Runs Over Library Tracks

**Status**: Approved · **Implements**: DEC-036, DEC-021

**Decision**: A Beatport match in Clean runs over library tracks, chosen from any scope the Library
already browses — a Rekordbox playlist, a Collection, a Smart Collection, the current filter, or a
selection. Choosing an XML or M3U file to match retires with inKey.

**Reason**: Every other decision in this round stores something against a track — an attempt, a
decision, an applied value, a file status. A result for a track that is not in the library has
nowhere to live, so keeping file input means keeping a second, unstored kind of result for one path.
Automatic matching on import was declined: it starts slow network scraping without being asked.

**Implications**:
- A match is a background job over a scope resolved to track ids **once, at start**, as DEC-063 set
  for batches; it reports how many tracks it covered.
- The job is resumable: per-track progress is stored, so a cancel or an engine restart continues
  rather than starts over. Tracks with a decision are skipped unless the user asks to re-match them.
- `core/matcher.py` does not change. What changes is the input — library tracks adapted to what the
  processor consumes, in place of `process_playlist_from_xml` / `process_playlist_from_m3u`.
- The Python CLI (`main.py --xml … --playlist …`) keeps its XML input and its per-run files. Public
  CLI flags are an AGENTS.md invariant, and nothing in this phase asks to break them.
- Batch playlist mode and `BatchPlaylistPicker` retire with inKey: a scope already covers several
  playlists through a Collection or a filter.

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-13, CLEAN-03) — what "skipped" and "continues" had to mean

**What building it found**: Two implications above needed a sharper reading to hold.

- *Tracks already matched are skipped.* CLEAN-03 extends "tracks with a decision" to tracks already
  answered, but an attempt existing does not make it an answer. The matcher reports a failed search
  as an empty result rather than an error, so a match run during an outage stores attempts that look
  like "nothing on Beatport". A track is therefore left out only when a user decided it, or when an
  attempt found a match or judged candidates and chose none. A track with only errors or empty
  results is asked again. A run of 25 tracks in a row with no candidates at all stops the job and
  puts those tracks back, so a lost connection costs a minute rather than a library.
- *A cancel or a restart continues.* Resuming has to know what was answered *since* the plan was
  written: a whole-library match resumed after matching one overlapping playlist must not ask
  Beatport twice. `m0013` records each job's options — whether it was a re-match, its counts, and
  the highest attempt id stored when its plan was written — and a resume leaves out tracks answered
  after that point.

**Why the decision stands**: Both refine how the implications are carried out, and neither changes
what was decided. A match still resolves its scope once, resumes only when asked, and never
re-matches a user's decision unless the user asks for a re-match.

---

## DEC-066 — Every Match Attempt Is Kept, With All Its Candidates

**Status**: Approved · **Related**: DEC-004, DEC-008

**Decision**: Each match attempt for a track is stored with every candidate it considered — score,
component similarities, the guard's rejection reason where one fired, and the queries run. A
re-match adds an attempt; it overwrites nothing.

**Reason**: AGENTS.md requires matching to stay deterministic and reviewable, and the only evidence
of why a match changed is the attempt before it. At 50,000 tracks this is on the order of a million
candidate rows, ordinary for SQLite. Keeping only the latest attempt or only the decision discards
exactly what a user needs when a re-match disagrees with the last one.

**Implications**:
- New tables for attempts and candidates, keyed to `tracks.id`. What happens to a track's attempts
  when a refresh deletes the track (DEC-003) is the phase spec's to state; it may not be left to
  whatever the foreign key happens to do.
- The candidate a user sees is the stored one, not a re-fetch — reviewing never touches the network.
- Storage size and the review-queue query are measured at 50,000 tracks in the phase's scale step,
  as ORG-13 did.
- The CLI's per-run `_candidates.csv`, `_queries.csv` and `_audit.jsonl` are unchanged.

**Decided with**: User · **Date**: 2026-09-13

### Measured (2026-09-13, CLEAN-02) — the premise holds, at twice the estimate

**What was measured**: The real matcher ran through `process_track` against live Beatport for ten
tracks: eight well-known ones and two invented titles that nothing matches. It scored 40.3
candidates per attempt, from 10 to 54, rather than twenty, and the two without a match stored 40
and 41. Stored through `MatchRepository`, a candidate costs 346 bytes with its indexes and an
attempt row 1.6 KB, most of that the queries tried. One attempt for each of 50,000 tracks is
therefore about two million candidate rows and 780 MB, and each re-match of the whole library adds
as much again.

**Why the decision stands**: That is the same order as the estimate, and ordinary for SQLite.
The matcher's own caps would allow 380 candidates per track (6.2 GB at 50,000 tracks), but only if
each of forty query variants returned a page of results never seen before. Live searches for
variants of one title overlap heavily, which is why a track with no match stored no more than one
with a match. Storing every candidate is unchanged. CLEAN-14's scale step measures the review
queue against these numbers, as the implications above already say.

---

## DEC-067 — Auto-Accept at the High Tier; A User's Decision Sticks

**Status**: Approved · **Fills**: DEC-004

**Decision**: An attempt whose best candidate scores ≥95 with every guard passed is marked accepted
automatically. Any other attempt with a candidate needs review; an attempt with none is "no match".
The threshold is a named constant, not a setting. A re-match never changes an accept or reject the
user made; if it finds a different best candidate, the track is flagged, not changed.

**Reason**: ≥95 is `_confidence_label()`'s existing "high" boundary, so no new number is invented. A
user setting invites tuning a threshold whose effect nobody can see. Letting a re-run overwrite
decisions would let one click erase an afternoon of review.

**Implications**:
- States a track can be in: not matched, no match, needs review, accepted (auto), accepted (user),
  rejected (user) — plus the flag for "a newer attempt disagrees with your decision". The phase spec
  fixes the exact names; the auto/user distinction must survive into the stored state.
- An auto-accept is not sticky: a re-match may replace it. Only a user's decision is protected.
- Accepting applies nothing (DEC-004). Applying is DEC-068.
- `output_writer._get_review_indices()`'s score-below-70 rule belongs to the CLI's review file and
  does not define Clean's states.

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-13, CLEAN-04) — failures, disputes and batches

**What building it settled**: Three questions the decision leaves open, answered so that no path
erases review work.

- *An attempt that failed is not evidence.* An error, or a search that returned no candidates at
  all (what an outage looks like, CLEAN-03), changes no state. A track whose only attempts failed
  stays "not matched" rather than becoming "no match", and a later match asks it again.
- *The flag follows the newest answer.* A re-match whose winner differs from the candidate a user
  accepted flags the decision, and one that agrees again clears the flag. A reject remembers the
  candidate it refused, so the same proposal coming back stays quiet and a different one is
  flagged. An answer with no winner agrees with a reject and says nothing about an accept.
  Candidates are compared by Beatport id.
- *A batch decides only what nobody has.* A batch accept or reject runs over a query that may name
  tens of thousands of tracks, so it confirms or refuses what the matcher proposed and leaves a
  user's own decisions exactly as they are. Overriding a decision is a per-track act.

**Why the decision stands**: Each answer applies the decision's own reasons — a re-match never
changes a user's accept or reject, and one click cannot erase an afternoon of review.

---

## DEC-068 — Applied Values Are a CuePoint Layer, and Revertable

**Status**: Approved · **Related**: DEC-057, DEC-004, DEC-008, DEC-063

**Decision**: Applying a match writes key, BPM, genre, label and year into a CuePoint override layer
beside the imported columns. The effective value is the override when set, otherwise Rekordbox's. A
refresh never writes the layer. Every applied field records history under a batch id, and per-field
and per-batch revert are built for CuePoint-owned values.

**Reason**: It is DEC-057's model — keep the source value, record CuePoint's, resolve at read time —
applied to the same problem a second time rather than solved a second way. Writing into `tracks`
would be undone by the next refresh and would leave Phase 8 unable to choose whose value to export.
A batch of applied Beatport values is exactly the operation a user wants to take back, which is
why revert is built now rather than deferred again.

**Implications**:
- A sibling table, for the reason ORG-01 gave: `TrackRepository.update` writes every column from a
  `LibraryTrack`, so overrides stored on `tracks` would be erased by any import-shaped update.
- The existing `REVERTABLE_FIELDS` path writes Rekordbox-owned columns and is not the mechanism for
  this layer. It stays as it is.
- Revert covers every CuePoint-owned field, including Phase 6's rating, favorite and notes — closing
  Phase 6's "per-field revert of CuePoint values" deferral. Whether "revert this batch" also reaches
  Phase 6's tag and Collection batches is the phase spec's to state.
- Filter and sort vocabulary: the plain "Key", "BPM", "Genre", "Label" and "Year" mean the effective
  value, as "Rating" does under DEC-060. The imported value stays addressable.
- History `source` distinguishes an applied match from a hand edit (DEC-069) and from an import.
- The Inspector shows the imported value, the accepted Beatport value and the effective value with
  its source, beside Phase 4's read-only record rather than in place of it (DEC-047).

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-14, CLEAN-05) — one notation, every reader, and what apply skips

**What building it settled**:

- *A key override is stored in the notation the library already uses.* The specification says
  "the one Rekordbox's imported `key` column already uses", but that column holds whichever notation
  the user chose in Rekordbox. So the notation is read from the library: Camelot when most imported
  keys are Camelot, classic otherwise and when there are none. An override in the other notation
  would make the plain `key` field hold `8A` on one track and `Am` for the same key on the next, and
  a facet would count one key twice. Enharmonic spellings are stored as one key.
- *Every reader of the plain names reads the effective value*: filters, facets, ranges, sorts,
  saved Smart Collections, the play queue's key and BPM, and the text search, which finds a label a
  user typed. The row payload keeps its plain fields as imported and adds `effective_*` and
  `overridden`, because DEC-057 keeps the two layers distinguishable on the wire. The refresh diff
  and the match adapter read the import, and a test on each says so.
- *Apply refuses for one track and skips for a batch.* Applying a named field the accepted candidate
  has no value for refuses the whole apply, because writing nothing silently would tell the user it
  was applied. A batch over thousands of tracks applies what each candidate has and leaves the rest
  as it was. Neither ever writes an empty value over an override, and a track nobody accepted is
  left alone.

**Why the decision stands**: The layer is DEC-057's model applied a second time, and each answer
keeps it one model: one stored form per value, one meaning per name, and nothing erased by a write
that had nothing to write.

### Implemented (2026-09-14, CLEAN-06) — what a revert restores, and what makes one stale

**What building it settled**:

- *A revert restores a value with its provenance.* The Inspector reads where an override came from
  off the latest history row. Reverting a hand edit that replaced a Beatport value puts the Beatport
  value back, so the revert's row says `beatport`, read from the change that set the value.
  Clearing an override is the user's act and says `cuepoint`.
- *Staleness compares what a person owns.* A tag is present or absent, so renaming it does not make
  its assignment stale. A match decision compares state, attempt and candidate. The dispute flag is
  the rule's, and an automatic state is re-derived by every re-match, so neither makes a person's
  decision stale.
- *A decision comes back as a person made it; an automatic state is re-derived.* A recorded user
  decision is restored with the flag it carried, then judged against any attempt newer than
  everything it referred to, as the rule would have judged it. A recorded automatic state is not
  replayed as a snapshot. The track returns to what its newest answered attempt says.
- *Batch revert reaches every batch that recorded history* — ratings, favorites, tags, decisions,
  applies and hand edits — and refuses Collection membership with the specification's reason.
  Membership writes no history, so such a batch is recognised by its activity event.
- *A deleted or merged tag is re-created by name* when a removal is reverted. Its category and
  colour belong to the vocabulary, not to any track, and history does not hold them.

**Why the decision stands**: "Revertable" was the decision's promise, and each answer keeps a revert
from becoming a second way to lose work: nothing later is overwritten, nothing re-derivable is
frozen, and nothing is right only sometimes.

---

## DEC-069 — Hand Edits Reach the Fields Beatport Supplies

**Status**: Approved · **Related**: DEC-068, DEC-063

**Decision**: A user can edit key, BPM, genre, label and year by hand, for one track or a batch,
into the same override layer DEC-068 builds. Title, artist, remixer and album stay Rekordbox's.

**Reason**: Once the layer exists this is nearly free, and it is the batch metadata editor
GAP_ANALYSIS §C lists as missing. Title, artist and remixer are what matching searches on and what
DEC-002's path-fallback identity reads; making them editable would force matching to choose between
an edited title and an imported one.

**Implications**:
- Batches go through DEC-063's path: inline below the threshold, a job above it, history under one
  batch id either way.
- Validation — accepted key notations, BPM range, year range — is the phase spec's to fix, and the
  engine rejects what the UI would not build (DEC-060's rule, reapplied).
- A hand edit and an applied match write the same layer; the later one wins, and history says which
  was which.

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-14, CLEAN-05) — the vocabulary

**What building it settled**:

- *Key*: classic (`Am`, `F#`), Camelot (`8A`), short (`Amin`) or spelled out (`A minor`, Beatport's
  `A min`), with ♯ and ♭ as well as `#` and `b`. Stored in the library's notation (DEC-068's note).
- *BPM*: 20 to 300, at most two decimals. *Year*: a whole number, 1900 to next year. *Genre and
  label*: trimmed, 1 to 200 characters.
- *Blank is refused, not read as a clear.* Clearing is `null`. A caller that sent `""` for a genre
  believes it set one, and clearing it would silently show Rekordbox's genre instead.
- *A batch hand edit is validated before any track is touched*, so a bad BPM refuses the batch
  rather than failing forty thousand times.

**Why the decision stands**: The engine refuses exactly what the UI will not build, and each refusal
names the field and the value.

---

## DEC-070 — Writing File Tags Is an Explicit Job That Records What It Replaced

**Status**: Approved · **Related**: DEC-064, DEC-051, DEC-008

**Decision**: "Write tags to files" is a separate action the user starts, over a scope, writing
effective values into audio files through `data/tag_writer.py`. It shows a preview, runs as a
cancellable job, and records each file's previous tag values before writing, so every write is
auditable and can be restored. Today's field toggles, key format and WAV rule carry over.

**Reason**: inKey's Sync Tags is a capability users have today, and retiring inKey without a
replacement is a regression. Porting it unchanged would carry a write that cannot be undone into the
phase that builds revert for everything else. Recording the old values costs a read per file and
turns the one destructive action in this phase into a reversible one.

**Implications**:
- The first write to user files since inKey. Nothing else in Phase 7 writes outside the database.
- Only today's fields — Key, Comment, Year, Label, BPM, Genre — plus artwork where a file has none
  (DEC-076). CuePoint ratings, tags and notes are not written into files; that stays Phase 8's
  question (DEC-064).
- Values written are effective values, so an accepted but unapplied match changes no file.
- The preview states the files, the fields and what will be skipped — WAV, missing files (DEC-073),
  unchanged values — before anything is written.
- A restore writes the recorded values back. The record is required; how restore is offered is the
  phase spec's to state.
- One activity event per job with counts (DEC-029). A file that fails is reported and skipped; the
  job is not a transaction, as DEC-063 said of batches.
- Rekordbox sees new tags only when it re-reads the file. The user docs say so.

**Decided with**: User · **Date**: 2026-09-13

---

## DEC-071 — inKey and Results Retire Into Clean

**Status**: Approved · **Implements**: DEC-021, DEC-041, DEC-036

**Decision**: By the end of Phase 7 the Tools group no longer carries inKey or Results. `TrackTable`
replaces `ResultsTable` and `CandidateDialog`. Past searches stop being a screen: their CSV files
stay where they are on disk and are not imported. CSV/JSON/Excel export survives as "export review
list" from Clean.

**Reason**: DEC-021 and DEC-041 assigned both moves to this phase. Importing past runs was declined:
those candidates were matched against a playlist file, with no reliable way to attach them to
library tracks. Keeping inKey beside Clean would keep two match flows alive and amend two decisions
for no gain.

**Implications**:
- Retiring a screen means searching its callers first: `MatchResultsContext`, `PastSearchesPanel`,
  `BatchPlaylistPicker`, `reviewUtils`, `syncTagsUtils`, `ToolSelectionScreen`'s inKey entry, and
  the `/match` and `/results` routes, which redirect rather than 404 for anyone with a remembered
  destination (DEC-027).
- Engine endpoints that only inKey uses — match jobs over files, `/api/v1/history/*`,
  `/api/v1/tags/sync`, `/api/v1/export` — are replaced or removed through all six contract files,
  and the removal is documented in the changelog, because AGENTS.md treats API shapes as preserved
  unless a breaking change is explicit. This decision is that explicit request.
- DEC-041 expected an in-memory `TrackTable` data source over match results. With DEC-066 storing
  them, the review queue is a windowed engine query like the library's. The phase spec confirms that
  rather than building an adapter nothing would use.
- The CLI and its output files are untouched (DEC-065).

**Decided with**: User · **Date**: 2026-09-13

---

## DEC-072 — Clean Is Its Own Page, With Hooks in the Library

**Status**: Approved · **Related**: DEC-020, DEC-062, DEC-047, DEC-045

**Decision**: The `clean` nav destination becomes a page: a review queue of tracks by match state
with side-by-side candidate comparison, and Missing files, Duplicates and Health. The Library gains
"Match on Beatport" among its selection actions, a match-state column, and match state as a filter
field. The Inspector gains a Beatport comparison beside its existing zones.

**Reason**: DEC-062 folded Collections into the Library because a second browser would duplicate a
table, a selection model and a filter bar. Review is a different job: comparing one track with five
candidates does not fit an Inspector column. The hooks keep Clean from becoming the only place a
match state is visible.

**Implications**:
- The review queue and the Health links use `TrackTable`, DEC-045's selection model and the one
  query path (DEC-023, DEC-040); the page is new surface, not a new table.
- Match state enters the rule vocabulary (DEC-043, DEC-060), so "needs review" can be saved as a
  Smart Collection and Health's links are ordinary filters.
- "Match on Beatport" joins ORG-11's single operations list, offered by the context menu and the
  Actions button alike.
- Whether the four parts are tabs or sections is the phase spec's call.

**Decided with**: User · **Date**: 2026-09-13

---

## DEC-073 — Missing Files Are Found by a Scan Job and Fixed in Rekordbox

**Status**: Approved · **Fills**: DEC-037 · **Related**: DEC-054

**Decision**: A cancellable "Check files" job checks every track's file, and runs after each import
or refresh as well as on request. Each track's status and the time it was checked are stored by
CuePoint, and are filterable. CuePoint does not relocate files: the path is Rekordbox's, fixed there
with Rekordbox's own Relocate and brought in by a refresh.

**Reason**: DEC-037 deferred this because a 50,000-path check is a slow scan with its own progress
and failure modes — which is a job. A CuePoint relocation would create a path that disagrees with
Rekordbox until Phase 8 exports it, and every consumer of `file_path` would need to know which to
trust. Scanning on launch was declined because it puts the scan in front of startup on a
disconnected drive.

**Implications**:
- Status lives in a CuePoint table, not on `tracks`, for DEC-068's reason. A refresh that changes a
  track's path makes its status stale, and the phase spec says how that is shown.
- A disconnected drive produces one coalesced finding, not 50,000 — DEC-054's lesson, applied to the
  scan.
- The player's DEC-054 behaviour does not change: a failed play still writes nothing.
- Clean shows the expected path and reveals the nearest folder that does exist.
- The DEC-070 job skips files the scan found missing, and says so in its preview.

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-14, CLEAN-07) — what a check does, and what it waits for

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-07:

- **A drive is asked about before its files.** The specification coalesced a disconnected drive
  once a fraction of a chunk had gone missing. A root that does not exist makes every path under it
  missing by definition, so the check asks the root the first time it meets it and records its
  tracks `missing` with the reason `root_unavailable`, without looking at their paths. It asks again
  after any chunk with a miss under that root, which catches a drive unplugged during the check.
  Migration 0015 adds the `reason` column.
- **"Not checked" is no check for the current path:** no row, or a row whose `checked_path` is no
  longer `tracks.file_path`. Paths are compared exactly, as `TrackFileStatus.is_stale_for` does.
- **A check refuses to start while an import or a refresh apply runs**; the specification named
  only the refresh. Neither waits for a check. A library job that finishes while a check is running
  gets its check once that one ends.
- **Files are looked at on eight threads.** On a spinning disk, opening a file not touched recently
  measured 30 ms and its `stat` 8 µs. The pool brought that to 1.6 ms a file. Roots, the cancel and
  the rows stay on the job's thread.
- **Every unit of work now begins `IMMEDIATE`.** A check committing beside an import made a latent
  SQLite behaviour routine: a deferred transaction that has read cannot wait for the write lock,
  and fails at once if anything commits before its first write. The regression test is
  `regression/test_regression_write_after_read_snapshot.py`.

---

## DEC-074 — Duplicates Are Metadata Groups, and Nothing Is Deleted

**Status**: Approved · **Related**: DEC-003, DEC-066, DEC-067

**Decision**: Tracks are grouped as possible duplicates when they share a normalized file path,
share an accepted Beatport track id, or share a normalized artist, title and mix with durations
within ±2 s. Each group states which signal grouped it. A group can be marked "not duplicates",
which is remembered. Tag, add-to-Collection and reveal are offered. Nothing deletes a track or a
file.

**Reason**: The path signal catches one file imported twice, the Beatport id catches the same
release under different metadata, and the text signal catches the rest. Hashing audio would read
every file, and acoustic fingerprinting belongs to Phase 12. Deleting is out because a refresh
re-adds a deleted track (DEC-003) and the file is user data.

**Implications**:
- Normalization reuses what matching already uses (`mix_parser`, the matcher's text normalization)
  rather than a third implementation.
- "Not duplicates" survives a refresh and a rescan; a group that gains a new member is shown again.
- Whether groups are stored or computed on demand is the phase spec's call, measured at 50,000
  tracks.

**Decided with**: User · **Date**: 2026-09-13

---

## DEC-075 — Library Health Is Counts, Not a Score

**Status**: Approved · **Related**: DEC-043, DEC-072

**Decision**: Library Health is a panel of concrete counts — missing files, tracks in duplicate
groups, not matched, needs review, and tracks missing key, BPM, genre or artwork — each opening the
Library filtered to exactly those tracks. There is no score.

**Reason**: A 0–100 score needs weights nobody can justify, and would replace a list of things to do
with a number to worry about. It is DEC-004's "explain, don't silently decide", applied to the
summary.

**Implications**:
- Every count is expressible as a rule (DEC-043), and the count shown is that rule's count — so what
  Health says and what the click shows cannot disagree.
- "Missing key" and the like read effective values (DEC-068): a key applied from Beatport is not
  missing.

**Decided with**: User · **Date**: 2026-09-13

---

## DEC-076 — Artwork Is Shown From Files and Beatport, and Embedded Only Where Missing

**Status**: Approved · **Against recommendation** (deferral) · **Related**: DEC-070, DEC-066

**Decision**: Artwork embedded in audio files is read, and Beatport artwork is fetched for accepted
matches. Both are cached as thumbnails and shown in the Inspector and the table. The DEC-070 job may
embed Beatport artwork into a file that has none; it never replaces artwork a file already has.

**Reason**: The user wants artwork visible, and wants files without any to receive it. Deferral was
recommended because artwork is not a cleaning task and both sources are new code. Never replacing
existing artwork keeps the write additive, which is what makes it acceptable inside a recorded,
reversible job.

**Implications**:
- New code on both sides: `tag_writer.py` neither reads nor writes pictures today, and the Beatport
  page parser never populates `BeatportCandidate.artwork_url`. The parser change must not alter
  scoring, and tests mock Beatport, as AGENTS.md requires.
- The thumbnail cache is regenerable and is not part of the DEC-009 backup; the database records
  where artwork came from, not the image.
- Beatport artwork is fetched for accepted matches only, lazily, and its absence offline is an
  empty state, not an error.
- Embedding records "had no artwork" before writing, so a restore removes what was added (DEC-070).
- WAV is skipped for artwork as for every other tag.

**Decided with**: User · **Date**: 2026-09-13

### Amendment (2026-09-13) — real thumbnails, with Pillow at runtime

**What the Phase 7 specification found**: "Cached as thumbnails" needs something to make thumbnails.
Pillow is the standard Python choice, and is today only a build dependency
(`requirements-build.txt`, used by `scripts/generate_icons.py`). The first draft of CLEAN-09 avoided
it by caching original images and scaling them in the renderer. At 50,000 tracks that means an
unbounded cache of images that are often a megabyte or more, decoded at full size to draw a 20-pixel
table cell. Raised as Q-077.

**Amended decision**: Pillow becomes a runtime dependency of the engine, at the version already
pinned. Every image CuePoint decodes — embedded or fetched — passes through one guarded decoder. The
cache holds bounded thumbnails only. An image embedded into a file is fetched at write time,
validated by the same decoder, and re-encoded.

**Amended implications**:
- The decoder guard is part of the decision, not an implementation detail: a byte cap before
  decoding, an allow-list of formats checked from the decoded image, Pillow's decompression-bomb
  check treated as a refusal, EXIF orientation applied, all metadata stripped. Image decoders are a
  classic attack surface, and CuePoint's input is untrusted twice over.
- Thumbnails come in two named sizes derived from the layout at 3×, so integer scales never
  upsample. The cache has a size cap with least-recently-used eviction and stays outside the DEC-009
  backup.
- No full-size image is kept. What is embedded into a user's file is a re-encoded, bounded JPEG, not
  the raw bytes a server returned.
- The packaged engine must be proved to make a thumbnail on Windows and macOS. The sidecar import
  guard test covers Pillow.

**Unchanged from the original decision**: both sources, display in the Inspector and the table,
embedding only where a file has no artwork, and the record that lets a restore remove what was
added.

**Decided with**: User (delegated: "take the most professional and better long term decisions") ·
**Date**: 2026-09-13
