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

### Amended (2026-10-08, DEC-201) — the key

For the key only, accepting a match is what sets the value the app shows, exports and writes:
Beatport's key, unless the user has corrected it (DEC-201). Every other field keeps this decision:
applying stays a separate, explicit act.

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

### Amended (2026-10-08, DEC-200) — Keys

The registry gains one destination, **Keys** (`/keys`), after Library and its nested Collections,
built in PAGES-16 (2026-10-08): `/keys`, after Collections, dimmed before the first import.

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

### Amendment (2026-09-20) — the export never writes `TotalTime`

**What the Phase 8 specification found**: this decision closed by saying "Phase 8's export maps it
back to `TotalTime` in one line". Round 10 chose to patch the source XML rather than regenerate it
(DEC-077), because CuePoint parses no cue points or beat grids and a generated document would strip
them. A patch sets only the attributes CuePoint owns, and `TotalTime` is not one of them — the value
is already in the file, written by Rekordbox.

**Amended decision**: unchanged in substance. `duration_seconds` remains the only length column and
the domain's name for it. The closing sentence about mapping it back is obsolete: no export writes
`TotalTime`, in one line or otherwise.

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
  not have, which is Phase 19's scope.

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

### Amendment (2026-09-20) — Phase 8 did decide, and it exports directly

**What Round 10 settled**: the question this decision left open by name — whether a Smart Collection
exports directly — was asked as Q-082 and answered by DEC-081. A Smart Collection exports as an
ordinary Rekordbox playlist holding whoever matches its rules at the moment of export, in its stored
sort order. Nothing is frozen and nothing is linked.

**Amended decision**: unchanged in substance; the deferred clause is now resolved rather than open.
Freezing is no longer "the answer in the meantime" — it is the way to keep a durable copy inside
CuePoint, and the export record (DEC-086) is what explains a past export's membership without storing
it.

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

### Amendment (2026-09-20) — ratings are exported; tags, notes and favorites are not

**What Round 10 settled**: this decision handed Phase 8 the mapping — "Collections into Rekordbox
playlists, ratings and tags into whatever fields make sense, if any" — and the answer to the second
half is "no field makes sense". DEC-080 exports the effective rating and the five override fields and
leaves tags, notes and the favorite flag in CuePoint. Rekordbox XML has no field for a tag set, `Comments`
is already claimed by the match flow and by DEC-070's file write, and My Tag is not in the XML at all.

**Amended decision**: unchanged in substance — this phase still writes nothing outside the database, and
export is still the explicit user-initiated write that carries organization outward. The promise is
narrowed where it was conditional: Collections become playlists (DEC-078) and the rating is written
(DEC-079), while tags, notes and favorites remain CuePoint's alone. The "if any" in the original sentence
is doing the work. The user docs this decision already required must therefore keep saying that tags,
notes and favorites do not appear in Rekordbox even after an export.

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

### Implemented (2026-09-19, CLEAN-14) — resuming is offered where a person sees it

The engine could resume since CLEAN-03 and the bridge since CLEAN-11, but no screen offered it.
CLEAN-14 adds the offer in two places: the Clean page's review queue says when a match stopped with
tracks left, and an interrupted match's Activity entry offers **Resume**. Still only when asked;
nothing resumes on its own. The file-based match this decision retired is removed with inKey
(DEC-071), and the CLI keeps its own path unchanged.

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

### Amended (2026-10-08, DEC-201) — an accept gives the key

Under DEC-201 an accepted match supplies the track's key, and every accept counts, the automatic ones
included (DEC-202). An automatic accept stays not sticky, so a re-match can change a key; History
records the change.

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

### Amended (2026-10-08, DEC-201) — the key

For the key, the effective value is the user's correction, else the accepted Beatport match's key,
else none. Rekordbox's key is never the fallback. BPM, genre, label and year keep this decision as it
stands, and the key's history and revert work as here.

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

### Implemented (2026-09-15, CLEAN-10) — preview by id, record before write, restore by hash

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-10:

- **A write writes a preview, by its id.** The preview reads every file in scope and writes none;
  it is a job above DEC-063's threshold and kept under that job's id, or answered inline with an id
  of its own. A write names the id, takes the preview out of the store so it is written once, and
  looks at each file again first: a path, file check, effective value or accepted artwork that
  changed since is skipped as `changed_since_preview`, never written with either version.
- **Recorded before written, and pending until confirmed.** Migration 0018 adds `pending` and
  `restore_of` to `file_writes`. A row is committed pending before the file is touched and
  confirmed against what the file holds when read back, so a crash can leave a record of a write
  that may not have happened, never a written file with no record. A restore records rows of its
  own naming the write each undid; a write is restorable until such a restore is confirmed.
- **Values are recorded as the writer touches them**, not as text: every `COMM` frame an ID3 comment
  write deletes, both `KEY` and `INITIALKEY` in FLAC, the v2.4 `TDRC` year. So a restore returns
  every field to exactly what it held, including fields that were absent. `data/tag_fields.py`
  reads and restores them; `tag_writer` still does every forward write.
- **Formats**: MP3, AIFF, FLAC and Ogg Vorbis. WAV is skipped by the existing rule. Every other
  container is skipped as `unsupported_format`: the writer's catch-all path writes MP4 atoms no
  player reads, which is not a write worth recording.
- **Artwork (DEC-076)**: Beatport's 1400-pixel image, fetched at write time through the same gate
  and guard as a thumbnail, re-encoded as a JPEG no larger than 1400 pixels with no metadata, and
  embedded only when the file holds no picture of any kind — checked by the service and again by
  the embedding function against the tags it saves. A restore removes that picture by its hash and
  nothing else. Off unless asked for.
- **The one boundary is a test.** `test_file_write_boundary.py` finds the writing functions of
  `tag_writer.py`, `rekordbox.py` and `tag_fields.py` from their source and fails on any importer
  beyond the CLI's existing paths, Sync Tags (until CLEAN-14) and the tag write service.
- **Found and fixed**: the existing writer never replaced a year a file already had — nearly every
  purchased track — while reporting success, in Sync Tags and the CLI alike.

### Amended (2026-10-08, DEC-201) — the key

Writing file tags stays an explicit job. What it writes for the key is DEC-201's key: an accepted
match's key reaches a file when the user saves changes into it, without a separate apply, and a
track with no key leaves the file's key untouched.

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

### Implemented (2026-09-19, CLEAN-14) — as decided, with the removal recorded

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-14 and in ADR-005:

- **Removed through all six contract files**: `POST /api/v1/jobs/match`, `/api/v1/history/*`,
  `POST /api/v1/tags/sync`, `POST /api/v1/export`, and `GET /api/v1/xml/playlists`, which only
  inKey's playlist picker read. The job-results route no longer carries match rows. The changelog
  records it as a breaking engine-API change.
- **Redirects, not 404s**: `navRegistry.ts` declares retired destinations, so `/match`, `/results`
  and a remembered id of either open Clean.
- **Export** is Clean's review list; Settings no longer has one. **Past searches' CSV files** are
  left where they are and not listed.
- **The CLI is unchanged**; its smoke test and flags are as before.

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

### Implemented (2026-09-16, CLEAN-12) — the page, as tabs over the Library's own query

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-12:

- **Tabs**: Review, Missing files, Duplicates and Health, the last one used remembered.
- **Review and Missing files are the Library's `TrackTable`** over the Library's windowed browse
  with a rule set, so DEC-041's convergence needed no in-memory source.
- **The comparison's differences are the engine's answer**, because the same key in two notations
  is not a difference and only the engine knows the notations.
- **A candidate's Beatport image is not drawn**: DEC-076 as amended shows artwork only through its
  guarded decoder, which serves Beatport's image for an accepted match only.
- The Library and Inspector hooks are CLEAN-13's.

### Implemented (2026-09-17, CLEAN-13) — the Library and Inspector hooks

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-13:

- **One operations list.** The Clean entries are appended to ORG-11's, so the context menu and the
  Actions button offer the same eight, each only in a build whose engine has Clean.
- **The Inspector is four zones and a picture**: Yours (with the five values of DEC-069), Beatport,
  the imported record, which stays read-only (DEC-047), and History, which offers Revert for
  CuePoint's own changes.
- **Revert for Collection membership is shown disabled in Activity**, where membership batches are
  recorded; History has no membership rows to put it on.
- **A write the engine stopped in the middle of is offered for restoring** in Activity, with how many
  of its writes may not have finished (DEC-070).

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
every file, and acoustic fingerprinting belongs to Phase 19. Deleting is out because a refresh
re-adds a deleted track (DEC-003) and the file is user data.

**Implications**:
- Normalization reuses what matching already uses (`mix_parser`, the matcher's text normalization)
  rather than a third implementation.
- "Not duplicates" survives a refresh and a rescan; a group that gains a new member is shown again.
- Whether groups are stored or computed on demand is the phase spec's call, measured at 50,000
  tracks.

**Decided with**: User · **Date**: 2026-09-13

### Implemented (2026-09-14, CLEAN-08) — what groups a track, and what hides a group

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-08:

- **Groups are stored, and "shown" is SQL.** A group carries the fingerprint of its members, and
  migration 0016's view `duplicate_track_signals` holds exactly the groups a user sees: two or more
  members, and no dismissal made for exactly those members. The filter fields and the Duplicates
  list read the same view.
- **The text key keeps the mix's own words.** `normalize_text` discards mix words and
  `_parse_mix_flags` loses remixer names for "Title - Remixer Remix", so neither alone could keep
  two remixes apart. Bracketed phrases and trailing mix segments the matcher's `MIX_PATTERNS`
  recognize are kept as words; only a featured-artist credit and "Original Mix" are dropped. The
  one way this errs is by not grouping.
- **Lengths agree within two seconds of a group's shortest**, not of a neighbour, and a track with
  no length is not grouped by text.
- **A Beatport group is an accepted candidate's Beatport id**, or its page when no id was parsed.
- **A dismissal can be taken back**, and both answers are recorded in the activity feed.
- **A scan follows every import, applied refresh and match job**, and refuses to start beside an
  import or a refresh apply.

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

### Implemented (2026-09-15, CLEAN-11) — nine rule sets, each answered by the Library's count

Nothing here changes the decision. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-11:

- **The counts are rule sets in one list** (`services/health_service.py`): missing or unreadable
  files, tracks in a duplicate group, not matched, needs review, disputed, no key, no BPM, no genre,
  and no artwork. Each is counted by `build_count`, the count the Library table shows, and
  `GET /api/v1/clean/health` returns its rules beside the number.
- **What is unknown is not counted as missing.** A file never checked is not a missing file, and a
  file whose artwork has not been read is not a track with no artwork: the counts read `missing`
  and `unreadable`, and artwork `none`, and leave `not_checked` and `unknown` out.
- **A test holds every count to the Library.** Over a library holding every problem, each count
  equals the total the Library's search returns for the rules the count carries, and finds exactly
  the tracks it is about.

### Implemented (2026-09-16, CLEAN-12) — the panel, and when each count was last looked at

- **Each count is a link** that opens the whole Library with exactly the rules the engine returned;
  the page builds no rule of its own.
- **Health says when each detection last ran** — files checked, duplicates looked for, artwork
  read — from the activity event each run records, so "no missing files" and "never checked" are
  told apart, and a run button starts each again.
- **A disconnected drive is one line**, grouped by root from the current file checks (DEC-073).

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

### Implemented (2026-09-15, CLEAN-09) — what is read, fetched, refused and kept

Nothing here changes the decision or its amendment. What building it settled, recorded in full in
`PHASE7_CLEAN.md` under CLEAN-09:

- **One guard, with named limits.** `data/artwork_image.py` refuses input over 16 MiB unread, lets
  Pillow try only the JPEG, PNG, WebP, GIF and BMP decoders, refuses a canvas over 36 megapixels
  from its header, treats Pillow's bomb warning as a refusal, decodes fully, applies EXIF
  orientation and returns a fresh RGB image that carries no metadata. A refusal is recorded against
  the exact picture (its hash) or Beatport URL, so it is never decoded again, and a different
  picture or URL is a new question.
- **Thumbnails, not originals.** Two sizes, 108 px (a 36-pixel table row at 3×) and 288 px (the
  Inspector's 96-pixel box at 3×), JPEG at quality 85, both made from one decode. The cache is
  capped at 512 MiB, evicts least recently used down to 90 %, keys every file by a SHA-256 so no
  key is ever a path, lives in the platform cache directory (under `CUEPOINT_HOME` when that is
  set), is outside the backup, and is emptied by "Clear cache".
- **A scan reads, a display decodes.** An `artwork_scan` follows every whole-library file check,
  opens only files that check found present at their current path, and records presence and a hash
  per track without decoding anything. What a display learns — a file read for the first time, a
  refusal — is recorded too, best-effort.
- **Beatport's image is an accepted match's, from Beatport's hosts only.** The parser reads the
  page's own `track-details` release image, then its `og:`/`twitter:` image, and keeps only HTTPS
  URLs on `beatport.com` and its subdomains; redirects are not followed. An attempt stored before
  CLEAN-09 has its page read once, and the answer — including "none" — is kept with that page
  (migration 0017's `beatport_page`), so a different accepted match is asked again. At most four
  requests run at once across the engine, a failure is not retried for ten minutes, and a fetch over
  a scope stops after twenty failures in a row.
- **Vocabulary**: `artwork` is `embedded`, `beatport`, `none` or `unknown` — what the table would
  show, with a file answer read at another path counting as not read.

---

## DEC-077 — The Export Patches the Source XML and Never Regenerates It

**Status**: Approved · **Related**: DEC-035, DEC-034, DEC-038 · **Amends**: DEC-038

**Decision**: An export re-parses the Rekordbox XML the library was imported from (DEC-035's recorded
source), sets only the attributes CuePoint owns on `COLLECTION/TRACK` elements that already exist,
appends CuePoint's playlists to `PLAYLISTS`, and writes the result to a new file. The document is never
built from the database.

**Reason**: `POSITION_MARK` and `TEMPO` appear nowhere in `src/`. CuePoint has never parsed a cue point
or a beat grid, has no table and no column for one, and DEC-034's "every useful field" was a list of
metadata. A generated document would therefore return a library with every hot cue, memory cue and beat
grid removed — the work a DJ has invested the most hours in, destroyed silently, and discovered on a
CDJ in a booth. Patching inverts the default: instead of preserving what CuePoint remembered to carry,
it preserves everything it never understood, which is the only discipline that scales to a vendor format
this project does not control. It also extends the property `write_updated_collection_xml` has held
since the first attribute patch — the source is read, never written.

**Implications**:
- The attributes the export sets are `Tonality`, `AverageBpm`, `Genre`, `Label`, `Year` and `Rating`,
  and nothing else. `TotalTime` is never written, which retires DEC-038's note that the export would
  map `duration_seconds` back to it — patching means the value is already in the file.
- **The legacy write path is orphaned, and this phase retires it.** A caller search found no
  production caller of `write_updated_collection_xml`, `build_rekordbox_updates`, its `_batch` twin,
  `write_key_comment_year_to_playlist_tracks`, its `_batch` twin, or `write_tags_to_paths` — only
  `data/__init__.py` re-exports and tests. `processor_service.py` imports readers from `rekordbox.py`
  and nothing else; `tag_write_service.py` calls `tag_writer.write_key_comment_year_to_file` directly.
  CLEAN-14 removed the routes and screens above this cluster and left it standing on the note that
  "the CLI's own paths stay", which turned out not to describe it. EXPORT-01 deletes it in the same
  change that introduces the new writer.
- **What that dead code got wrong, recorded because the new writer must not repeat it**: it emits
  `BPM` and `Comment`, while the parser and Rekordbox use `AverageBpm` and `Comments`, so the BPM and
  the comment never reached Rekordbox at all. It also sets `Key` on a `COLLECTION/TRACK`, which is
  Rekordbox's alternative spelling of `TrackID` on a playlist entry and sits in the importer's own
  `TrackID or ID or Key` identity fallback. The cause was one `updates` dict serving two writers —
  the file-tag path reads `attrs.get("Key")`, `("BPM")` and `("Comment")`, which are correct for it,
  while the XML writer sets every key it is handed as an attribute. The export writes the six
  attributes named above and takes no dict it did not build.
- Unknown attributes, unknown elements, `PRODUCT`, comments and the declaration survive because nothing
  rebuilds them. A test pins this by exporting a fixture with cue points, tempo marks and an invented
  attribute and asserting they are byte-identical afterwards.
- Export requires the source file. When it is gone, export cannot run (DEC-082).
- `MAX_XML_SIZE_BYTES` already guards the parse and continues to.
- The new service is not `services/export_service.py`, which means CSV, JSON and Excel. A distinct name
  is required so that "export" in code never means two things.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-078 — One Export Is the Whole Library Plus the Chosen Collections

**Status**: Approved · **Related**: DEC-077, DEC-031, DEC-059

**Decision**: An export writes the whole `COLLECTION` with CuePoint's values applied, leaves the
mirrored Rekordbox `PLAYLISTS` tree exactly as the source has it, and appends the Collections, Smart
Collections and folders the user selected as new nodes beside it.

**Reason**: Rekordbox consumes an XML by loading it as a source in its tree and letting the user drag
from it, so the useful artifact is a view of the library rather than a fragment of one. A
selection-only document looks like the user's library and is not one, which is the file that gets
confused with the real export a month later — and it makes the mirrored tree disappear for no reason,
since DEC-077's patch preserves it for free. Splitting the action in two would give one intent two
previews, two jobs and two sets of documentation, and the common case wants both halves at once.

**Implications**:
- The Collections the user ticks control which playlists are appended, never which tracks are in
  `COLLECTION`. Export reads no track selection at all (DEC-087, as amended).
- CuePoint's nodes go under a single named parent folder so the exported tree says which nodes CuePoint
  added; a name collision with an existing top-level node is resolved and reported in the preview.
- DEC-059's folder structure is carried as folder nodes, so a Collection exports at the path the user
  filed it under.
- A Collection's order is the exported playlist's order (DEC-058), and a track appearing twice in a
  Collection appears twice in the playlist.

**Amended 2026-09-20 (precision, found while implementing EXPORT-02 — the decision above is
unchanged)**: three things the wording left open, each settled by what the format actually is.

- **"Beside it" means inside the tree's root folder, not next to it.** Rekordbox writes
  `PLAYLISTS` holding a single `NODE Name="ROOT"`, and everything a user sees is inside that node. A
  folder appended as `ROOT`'s sibling is outside the tree Rekordbox reads, so CuePoint's folder goes
  in as `ROOT`'s last child. Three shapes no Rekordbox export has — a self-closing `ROOT`, a
  `PLAYLISTS` with no folder in it, and a document with no `PLAYLISTS` at all — are handled by
  creating what is missing, because the alternative is an export that silently drops the playlists a
  user explicitly asked for.
- **The root folder's `Count` is the one attribute written outside CuePoint's own subtree.**
  "Leaves the mirrored tree exactly as the source has it" holds for every node in that tree; the
  folder those nodes sit in has gained a child, and a `NODE` declaring `Count="3"` while holding
  four is a document contradicting itself, with Rekordbox as the reader that has to choose. The
  number written is the real count of child nodes rather than the old number plus one, so a file
  that was already wrong comes out right. A root folder that never declared a `Count` is not given
  one.
- **The collision check folds case.** Two top-level nodes a user cannot tell apart in the tree are
  a collision whatever the bytes say. Merging is never the answer either way: a folder called
  `CuePoint` may be the user's own, holding work this export has no business writing into or, later,
  offering to delete.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-079 — The Export Writes the Effective Value

**Status**: Approved · **Related**: DEC-057, DEC-068, DEC-069 · **Implements**: DEC-064

**Decision**: For each of the five override fields and for the rating, the export writes the effective
value — CuePoint's when there is one, otherwise the imported value unchanged. It sets an attribute only
where that effective value differs from what the source file already holds. For BPM, year and the rating
the comparison is on the parsed value, so two spellings of one number are one value. For the key it is on
the text that would be written, because the notation is the user's own choice (DEC-089). There is no
per-field choice at export time.

**Reason**: The rule exists once already: `effective_value` and `effective_rating` in
`models/track_metadata.py`, mirrored as `COALESCE(override, imported)` in the browse SQL. Reusing it
means what lands in Rekordbox is precisely what the table and the Inspector showed, so the export needs
no separate explanation of whose value won. DEC-057's warning that two implementations of this rule
disagree the day one of them is edited applies with more force when one of them writes a file a user
then loads into Rekordbox. Exporting only overridden fields would have silently preserved a stale value
for anything corrected by DEC-069's hand edit rather than by an override.

**Implications**:
- `OVERRIDE_FIELDS` is the field list: `key`, `bpm`, `genre`, `label`, `year`. A hand edit stores an
  override, so DEC-069's edits export by the same rule with no special case.
- A field with no override and no imported value is left as the source file has it, which is usually
  absent. The export does not write empty strings; null means "no value", exactly as DEC-068 has it.
- **Writing only what differs** keeps "unchanged" literally true rather than nearly true. Re-serializing
  a value the user never touched would still rewrite it, and for the rating it would visibly change it:
  `_rating_to_stars` accepts both the multiples of 51 Rekordbox writes and a plain 0–5 some tools emit,
  so a source carrying `Rating="3"` on an unrated-in-CuePoint track would come back as `Rating="153"`.
  Comparing parsed values means that track is not touched at all. It also makes the exported diff
  minimal, which is worth having when the artifact is a file someone loads into their Rekordbox.
- **The key is the exception, and has to be** (found while implementing EXPORT-01). A parsed comparison
  would make `Am` and `8A` equal, so a user who chose Camelot would get a file with no Camelot in it —
  the notation would silently do nothing. Comparing the rendered text is what makes DEC-089's choice
  take effect. The cost is that a source spelling a key unusually, say `A min`, is normalized to
  Rekordbox's own `Am` on a track with no override; that is a change to the same key rather than to a
  different one, and it is rare, so it is accepted rather than special-cased.
- Where a write *is* warranted, the rating is written in the multiples-of-51 encoding Rekordbox itself
  writes. A `_stars_to_rating` beside `_rating_to_stars` is the only implementation, with a round-trip
  test over 0–5.
- A test asserts that the value the browse query reports for a track and the value the export writes for
  it are the same value, so the two cannot drift.

**Decided with**: User · **Date**: 2026-09-20

### Amended (2026-10-08, DEC-201) — the key

For the key, the effective value is DEC-201's. A track with no key keeps the key Rekordbox already
has: the export never blanks it.

---

## DEC-080 — Tags, Notes and Favorites Stay in CuePoint

**Status**: Approved · **Related**: DEC-015, DEC-057 · **Narrows**: DEC-064

**Decision**: The export carries the five override fields, the effective rating, and Collections as
playlists. CuePoint tags, notes and the favorite flag are not exported, into any attribute.

**Reason**: Rekordbox XML has no field for a tag set, a note or a favorite. `Comments` is the only
candidate, and it is already contested: the match flow marks it, and a DEC-070 file write targets it, so
the mapping's first effect would be to overwrite a value another feature owns. Rekordbox's own My Tag is
not in the XML at all, so it cannot be a target. Exporting tags as playlists is defensible and genuinely
useful, but it turns sixty tags into sixty playlists with their own naming and collision rules, and it
answers only a third of the question. Keeping the export lossless in one direction is better than making
it lossy in two, and tags-as-playlists stays available later as an addition rather than a correction.

**Implications**:
- This narrows DEC-064's promise that the export would carry "ratings and tags into whatever fields make
  sense, if any". Ratings go; tags do not. DEC-064 carries an amendment saying so rather than leaving the
  narrowing to be inferred.
- The user docs must say that tags, notes and favorites are CuePoint's alone and do not appear in
  Rekordbox, next to the existing notes about the two collection imports (DEC-030) and about CuePoint's
  organization being invisible until an export (DEC-064).
- A user who wants a tag to reach Rekordbox has a supported route today: build a Smart Collection whose
  rule is that tag (DEC-060) and export it (DEC-081).

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-081 — A Smart Collection Exports as Its Membership

**Status**: Approved · **Closes**: the direct-export item DEC-061 deferred to this phase ·
**Related**: DEC-061, DEC-016, DEC-060

**Decision**: A Smart Collection exports as an ordinary Rekordbox playlist holding the tracks matching
its rules at the moment of export, in its stored sort order. It is not frozen, and nothing is linked
afterwards.

**Reason**: DEC-061 said a Smart Collection stores rules and never materializes membership, and left
this question here by name while noting nothing prevented it. Requiring a freeze first would charge an
extra step and a growing pile of frozen Collections for anyone who exports weekly, in exchange for
avoiding a snapshot that a rule set plus a timestamp fully explains. Freezing as a side effect would
create objects the user never asked for and leave two near-identical Collections after two exports.

**Implications**:
- Evaluation reuses the existing count-plus-window path, so exporting a Smart Collection costs what
  browsing it costs (ORG-06 measured the scope at 26.84 ms against a filter's 26.75 ms).
- The export record (DEC-086) stores the rule set and the resulting count, so a past export can explain
  which tracks it contained and why without that membership being stored anywhere.
- Two exports a week apart can legitimately differ. The preview states the count before the write, and
  "Freeze to Collection" remains the way to keep a durable copy inside CuePoint.
- DEC-061's refusal of manual pinning is untouched: the export reads the rules, it does not offer a
  chance to adjust the resulting list.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-082 — A Changed Source Is Reported, Not Refused

**Status**: Approved · **Related**: DEC-035, DEC-032, DEC-077

**Decision**: Before an export, the source file is compared against `library_source`'s recorded
`xml_modified_at` and `xml_size_bytes`. A difference is reported in the preview with its real numbers
and does not block the export. A source file that is missing or unreadable blocks it, and says which
file and why.

**Reason**: This is DEC-032's rule for a refresh applied to a write in the other direction: state what
will happen with real counts, then let the person decide. Refusing on any difference buys a guarantee by
putting a hard block on a routine action, triggered by an mtime that changes for reasons that do not
matter — the kind of gate users learn to route around. Patching silently is the only genuinely unsafe
option, because an appended playlist could then reference a `TrackID` the file no longer contains, and
Rekordbox would be the one to break the news.

**Implications**:
- Tracks the file holds that CuePoint does not know are left exactly as they are. They are counted in the
  preview, because they are the visible sign that a refresh is owed.
- Tracks CuePoint knows that the file lacks are counted, and are dropped from appended playlists so no
  dangling reference reaches Rekordbox. The count is stated before the write, not after.
- The preview offers "Refresh first" as an action, so the recommended path is one click rather than a
  sentence.
- Only the recorded size and modification time are compared. Nothing is hashed, so the check costs a
  `stat` on a file that may be hundreds of megabytes.
- A dropped reference is counted once per appearance, not once per track id, so the preview's number and
  the playlist's own arithmetic agree: entries written plus entries dropped is always the length of the
  Collection on screen. A track filed twice and missing from the file costs the playlist two entries, and
  saying "one" would be answering a different question (added 2026-09-20 with EXPORT-02).

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-083 — The Destination Is Chosen, Remembered, and Never the Source

**Status**: Approved · **Related**: DEC-077, DEC-035

**Decision**: Each export opens a native save dialog, pre-filled with a dated default name and starting
in the folder used for the previous export. The source XML's own path is refused by an explicit check
rather than by convention.

**Reason**: "Always a new file, never the source" has been this repository's safety property since the
first attribute patch, and it has been a habit of the call sites rather than a rule the code enforces.
Making it a check is the part worth spending code on, because it is the one mistake whose cost is a
user's Rekordbox library. A single remembered path overwritten after a confirm serves one workflow well
and puts one confirmation between the user and the loss of their previous export; a fixed folder with
timestamped names never overwrites anything but grows without bound somewhere the user has to go find.

**Implications**:
- The refusal compares resolved, normalized paths, so it is not defeated by a relative path, a trailing
  separator, a case difference on Windows, or a symlink.
- Only the folder is remembered, not the filename, so no export silently overwrites the previous one.
  Overwriting some other existing file is the OS dialog's own confirmation, not a second one.
- The remembered folder and the DEC-089 key format are the export's persisted preferences, and they live
  where Settings keeps the rest.
- The write keeps `write_updated_collection_xml`'s temp-file-then-`replace` pattern, so an interrupted
  export cannot leave a half-written document at the destination.
- **The source is not the only destination refused** (added 2026-09-21 with EXPORT-05). The path
  must end in `.xml`, must not be a folder, and must be in a folder that already exists. The first
  is DEC-085 held at the destination: the one file this phase writes is an XML document, and a path
  ending `.mp3` would otherwise replace somebody's audio file with a Rekordbox collection. The other
  two close paths a save dialog cannot produce, so one that names them came from somewhere else, and
  creating folders on a user's disk nobody chose is not an export's business. Each refusal has its
  own reason, and all of them happen before anything is parsed.
- **The remembered folder and notation are read from the export record, not kept as settings of
  their own** (added 2026-09-21 with EXPORT-06). They are the folder and the notation of the last
  export that wrote, as DEC-086's row holds them — which DEC-086 already names as what pre-fills the
  dialog. A copy in a settings file would be a second store that could disagree with where the last
  export actually went, and would need its own rule for a cancelled or failed export; the record has
  that rule already. The engine answers them with the export history, saying whether the folder is
  still there, and the save dialog starts in it or, when there is nothing to remember or the drive
  is gone, in Documents. The shell keeps no path of its own. The consequence is stated rather than
  hidden: the default notation changes by exporting in another one, not by a separate setting, so
  Settings (DEC-087) shows the remembered folder and notation rather than holding them.
- **The dialog reopens at a previous choice.** When a person changes the destination before
  exporting, the dialog opens at the file they had chosen rather than starting over. That path only
  decides where the dialog opens; the person still chooses, and the engine still judges.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-084 — An Export Previews, Then Runs as a Job

**Status**: Approved · **Related**: DEC-032, DEC-033, DEC-070, DEC-007

**Decision**: An export previews before it writes. The preview states the number of tracks, how many
carry a CuePoint value and in which fields, each playlist that will be appended with its count, the key
notation chosen, and every warning DEC-082 and DEC-088 produce. Nothing is written until it is confirmed.
The write then runs as a cancellable background job with an activity event.

**Reason**: The shape is not new: DEC-032 previews a refresh, DEC-033 runs an import as a job, and
DEC-070 previews the one thing in Phase 7 that touches a user's files. Each time for the same reason —
an outward-facing write is confirmed with numbers, and a long one does not hold the UI. Fifty thousand
tracks is the case that matters, and it is the case a modal would block. Removing the preview would
remove the only moment at which a stale source or a dropped reference can be noticed before Rekordbox
notices it.

**Implications**:
- The preview is computed, not estimated. It is the same query the write walks, so a number in the
  preview and a number in the result cannot disagree except through a concurrent edit.
- Cancelling before the `replace` leaves no file at the destination; the temp file is removed. There is
  no partial export and no resume — an export is cheap to repeat, so DEC-065's resumability is not
  needed here.
- The job appears in the status strip and records one activity event on success (DEC-029), carrying the
  destination and the counts.
- **The size guard and the serialization run inside the job. The parse does not — the preview needs
  it** (corrected 2026-09-21 while implementing EXPORT-04). The numbers this decision requires the
  preview to state include how many tracks would change and in which fields, and which track ids the
  file does not contain; none of those can be known without reading the source. So the preview
  re-parses it, applies the size guard first for the same reason the write does, and stops before
  serializing. Measured at 3.0 s for 50,000 tracks with 10,000 overrides, which is a preview a user
  asked for rather than something running behind them.
- **A preview is refused exactly when the export it describes could not start** (added 2026-09-21
  with EXPORT-06). While an import, a refresh, a batch edit or another export holds the library, the
  preview answers the same busy refusal a start would, naming the job. A preview computed while the
  library is being rewritten would state numbers that are about to change, and one shown beside a
  running export would offer a confirm that can only be refused. A match, a tag write or a file
  check does not refuse it, as none of them refuses a start.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-085 — Phase 8 Writes No Audio Files

**Status**: Approved · **Related**: DEC-064, DEC-070, DEC-051

**Decision**: The export's only output is the XML file. Phase 8 writes nothing into audio files.
CuePoint ratings, tags, notes and favorites are not written into file tags.

**Reason**: DEC-064 left this to the export phase, and the answer is the same discipline DEC-051 kept for
the player and DEC-064 kept for organization: a phase whose single artifact is one new file has one
failure mode. Adding a file-writing path means "I exported my library" can also mean four hundred
modified files, which is exactly the outcome DEC-064 declined to introduce for a rating. There is also no
honest tag frame for a tag set, so the mapping would have to be invented here and then depended on.

**Implications**:
- DEC-070's job is unchanged and remains the way the five Beatport fields reach a file, previewed and
  recording every value it replaces.
- `data/tag_writer.py` is untouched by this phase.
- Exporting cannot modify, move, rename or delete any audio file. A test asserts that an export leaves
  every file in the fixture library byte-identical.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-086 — Each Export Is Recorded; No Track Carries Export State

**Status**: Approved · **Related**: DEC-061, DEC-008, DEC-029

**Decision**: Each export writes one row recording when it ran, the destination path, the source file and
whether it was stale, the track count, the fields written, the key notation, and each exported playlist
with its kind, its rule set where it had one, and its count. No per-track export state is stored, and
there is no incremental "only what changed since last export".

**Reason**: A per-track stamp is the staleness bug DEC-061 refused for Smart Collections, reintroduced
where it is harder to see: every edit, apply, revert, refresh, import and batch would have to know it had
just falsified a stamp, and the symptom of missing one is an export that silently omits a track the user
changed. The row answers the question people actually ask — where did my last export go, what was in it —
and invalidates nothing. An activity event alone would leave that answer as prose the UI cannot act on or
pre-fill from.

**Implications**:
- One new table, written inside the export job's transaction, plus one activity event.
- The recorded destination is what pre-fills the next save dialog's folder (DEC-083).
- Deleting a track does not delete the history of an export that contained it: the row stores counts and
  playlist identities, not track references, so it stays readable after a refresh removes tracks (DEC-003).
- Nothing here claims the exported file still exists or is unmodified. The row records what CuePoint
  wrote, not what is on disk now.

**Amended 2026-09-20 (precision, found while landing the DDL in EXPORT-03 — the decision above is
unchanged)**: four things the specification's column list left in tension with the decisions around
it.

- **A count nobody took is null, not zero.** The specification gave `missing_file_count` as `INTEGER
  NOT NULL DEFAULT 0`, which contradicts DEC-088: that decision says in as many words that a library
  which has never been file-checked reports that it has not been checked rather than reporting zero,
  and a `NOT NULL DEFAULT 0` column can only make the claim it refuses. The column is nullable and
  carries no default — null is "never checked", a number is a number that was counted. The schema is
  forward-only, so this is a claim the row would otherwise have carried for the life of the product.
  Every other count here is always known by the writer, so each of those stays `NOT NULL`.
- **`source_stale` carries `CHECK (source_stale IN (0, 1))`**, as every other flag in this schema
  does. A flag that can hold 2 is not a flag.
- **`key_format` carries no `CHECK`.** DEC-089 keeps that vocabulary in
  `services/tag_write_options.py` and says the export validates against it rather than restating it;
  a `CHECK` here would be a restatement in the one place a forward-only schema could never revise,
  so a fourth notation would need a migration to store. The value is refused where it is chosen,
  before any export runs.
- **`rekordbox_export_playlists.export_id` is indexed**, by m0009's rule: SQLite scans the whole
  child table on a parent delete unless the referencing column is indexed, and that index is also
  how every reader asks an export for its playlists. Nothing else here is indexed, because "the most
  recent export" is already the last rowid.

**Amended 2026-09-21 (precision, found while writing the rows in EXPORT-05 — the decision above is
unchanged)**: what a row says when the export did not write.

- **A row's counts are what was written.** "Records what CuePoint wrote" is taken literally: a
  cancelled or failed export records zero changed tracks, no fields and no playlist rows, and its
  `outcome` is what qualifies the zeros — they mean nothing was written, not that nothing was in
  scope. The source's staleness, the key notation and the missing-file count are facts about the
  moment rather than about the file, so every row records them whatever the outcome.
- **A refusal is not an export and records nothing.** A destination that is the source, a library
  never imported, an unknown notation or a Smart Collection whose rules cannot run is refused before
  a job exists; one row per export means one row per export that was attempted.
- **"The most recent export" is the most recent one that wrote.** DEC-083 pre-fills the next save
  dialog's folder from it, and a cancelled or failed export's destination is somewhere nothing was
  written.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-087 — Export Is an Action in the Library and the Collection Menu

**Status**: Approved · **Related**: DEC-020, DEC-062, DEC-045

**Decision**: Export is offered in the Library header and in the context menu of a Collection or
Smart Collection in the left pane. It is not a navigation destination, not a Settings action, and
not an application-menu item. (Amended 2026-09-20 — the original text named the selection Actions
menu; see below.)

**Reason**: DEC-020's registry declares the full target IA and contains no export destination, which is
the correct shape — export is something done to a scope in view, not a place to go. Both chosen surfaces
are where a user already is when they have that scope, which is what makes the exported scope obvious
rather than implied. An application-menu item carries no scope, so it could only mean "everything", and
offering it alongside the other two invites the reading that those mean something narrower.

**Implications**:
- Export is a library-scoped action beside import and refresh, not one of ORG-11's selection
  operations.
- The Collection context menu's entry pre-ticks that node; the header's entry opens with none ticked,
  and both land in the same preview.
- Settings holds the remembered destination folder and the default key notation (DEC-083, DEC-089), and
  offers no way to start an export. (Shows rather than holds: since EXPORT-06 both are read from the
  export record, per DEC-083's precision of 2026-09-21.)
- The nav registry is unchanged, so no `export` destination, icon or route is added.

**Decided with**: User · **Date**: 2026-09-20

### Amendment (2026-09-20) — the Library header, not the selection Actions menu

**What the Phase 8 specification found**: this decision named "the Library toolbar's Actions menu,
beside ORG-11's batch operations", on the understanding that it was a general toolbar menu. Reading
`SelectionActions.tsx` showed it is not. The Actions button is rendered only when `count > 0`, so a
library-wide operation placed there would be unreachable until the user selected tracks. Worse, the
component's own design rule is that the toolbar menu and the row context menu are built from one
array — "one vocabulary for both surfaces" — so an entry there is also an entry on a right-clicked
track, where "Export…" means nothing. The specification raised this as Q-091 and it is settled here
rather than left open.

**Amended decision**: export is offered in the **Library header**, beside "Check for changes" and
"Import a different collection…", and in the context menu of a Collection or Smart Collection. It is
not in the selection Actions menu, not a navigation destination, not startable from Settings, and not
an application-menu item.

**Reason**: import and export are the two ends of the library's relationship with its source file, and
`LibraryHeader.tsx` is already where that relationship is managed. A user looking for "send this back
to Rekordbox" looks where "Import a different collection…" is. It also keeps export off a surface
scoped to a track selection, which it never reads.

**What this costs, and why it costs nothing**: the shortest path from "these 218 tracks" to "a playlist
in Rekordbox" is no longer one action. It is two — "Add to Collection", which ORG-11 already offers on
a selection, and then exporting that Collection. That is the better path: it produces a Collection with
a name, a folder and a history, which can be re-exported, edited and seen, rather than an ephemeral
playlist that exists only inside one exported file and has no identity in CuePoint. Keeping one kind of
exportable object is what stops the export record (DEC-086), the preview and the docs from each having
to describe two.

### Precision (2026-09-21, found while implementing EXPORT-07 — the decision above is unchanged)

- **In the header, export shares a menu with import.** Three buttons do not fit the Library header:
  at the default window size and scale it is about 600 pixels wide, "Check for changes", "Import a
  different collection…" and "Export to Rekordbox…" need over a thousand, and each took a line of
  its own — leaving the track table 20 pixels tall, measured in the packaged app. So "Check for
  changes" stays a button and the other two are the two items of one menu, **Collection file ▾**:
  still in the header, still beside each other, and named for the relationship this amendment gives
  as the reason they belong together. An end-to-end test holds the table's height at the default
  window size, so the header cannot grow over it again unnoticed.
- **The Collections tree gained a context menu to carry the entry.** It had none: every row action
  was a trailing button. The menu offers what those buttons do and "Export to Rekordbox…", opens on
  right-click, the menu key and Shift+F10, and changes nothing about the selection.
- **The entry is offered on folders too**, not only on a Collection or Smart Collection. The export
  already reads a chosen folder as everything filed under it (EXPORT-04), and the dialog lets a
  folder be ticked; a DJ exporting a "Gigs" folder right-clicks the folder, and offering the entry on
  every row but that one would be a gap with no reason behind it.

### Amended (2026-10-08, DEC-199) — three buttons in the Library header

The walkthrough's FLW-11, accepted, puts **Check Rekordbox for changes**, **Import another file…** and
**Export to Rekordbox…** in the header as three buttons, and "Collection file ▾" goes. The 2026-09-21
precision found three did not fit at 2×; the default size is now 1.5× (DEC-161), and where the three
do not fit on one line their labels shorten rather than fold into a menu (PAGES-05). Export stays out
of the application menu (PAGES-03), and the tree's bar under a selected node offers it on every node,
folders included.

---

## DEC-088 — Tracks With Missing Files Are Exported and Counted

**Status**: Approved · **Related**: DEC-073, DEC-003, DEC-077

**Decision**: A track whose audio file is missing is exported unchanged, and the number of such tracks in
scope is stated in the preview.

**Reason**: The `TRACK` element and its `Location` are Rekordbox's own, and dropping one removes the track
from the user's Rekordbox view — which DEC-073 was explicit CuePoint does not do, having refused even to
relocate a file. Excluding them from appended playlists only would make an exported playlist quietly
differ from the Collection on screen, and the difference would be invisible until someone counted. Blocking
the export would turn a routine action into a chore, because missing files are normal in a large library.

**Implications**:
- The preview states the count and links to Clean's missing-file view, so the information is offered
  without being enforced. (Implemented in EXPORT-07 as **Show missing files**, which opens the Clean
  page on its Missing files tab through the router's location state, as a Health count opens the
  Library; the link opens the tab without making it the one Clean remembers.)
- Whether a file is missing is read from Phase 7's existing `track_files` state, not checked during the
  export. A never-checked library reports that it has not been checked rather than reporting zero.
- No `Location` is ever rewritten. CuePoint does not fix paths (DEC-073), and an export is not the place
  it starts.

**Decided with**: User · **Date**: 2026-09-20

---

## DEC-089 — Three Key Notations, Shared With the File-Tag Path

**Status**: Approved · **Against recommendation** (pin classic) · **Related**: DEC-070, DEC-034

**Decision**: The export offers all three key notations — classic (`Am`), Camelot (`8A`) and short
(`Amin`) — reusing the file-tag path's vocabulary, validator and converter. The default is classic, and
the choice is remembered.

**Reason**: One enum and one converter for "turn a key into text" is worth more than a subset that looks
like it and is not, since two near-identical enums are how a validator ends up receiving the other one's
value. Camelot in Rekordbox's key column is also a real workflow rather than a hypothetical, and the
converter for it already exists.

Pinning classic was recommended because the importer reads `Tonality` verbatim — `_optional_text(get(
"Tonality"))`, no normalization — so re-importing an exported file writes that notation straight into
`tracks.key`, the column the matcher compares and the Clean page displays. A library exported in Camelot
and re-imported holds `8A` for those tracks and `Am` for the rest. The user accepted that risk as opt-in.

**Implications**:
- `key_text(key, key_format)` in `services/tag_write_service.py` is the only implementation, and
  `KEY_FORMATS` in `services/tag_write_options.py` the only vocabulary. The export validates against it
  rather than restating it.
- The default is classic, so the mixed-notation outcome is never reached by a user who does not choose it.
- The export preview states the consequence at the moment of choosing — that re-importing this file will
  store that notation as CuePoint's key — rather than in a docs footnote.
- The export record stores the notation used (DEC-086), which is the only thing that can later explain
  why some tracks' keys read `8A`.
- The two paths share a converter, not a setting. The file-tag dialog deliberately persists nothing, for
  the reason its own default documents; the export remembers its notation the way it remembers its folder.
- Normalizing key on import would make any notation round-trip. That belongs to whichever phase revisits
  DEC-034's capture-as-Rekordbox-has-it rule, and is not assumed here.

**Decided with**: User (against recommendation) · **Date**: 2026-09-20

---

## DEC-090 — Discover Reads the Library's Effective Values

**Status**: Approved · **Implements**: DEC-030, DEC-036 · **Related**: DEC-068, DEC-079

**Decision**: Discover's library artists and labels come from the library itself: artists from the
imported artist and remixer credits, labels from the effective label (the override when there is one,
otherwise the imported value), and Beatport ids from accepted matches. inCrate's inventory database
and its label enrichment are retired. A track with no label is a Clean task, reached through Clean's
match and apply.

**Reason**: DEC-030 promised that inCrate would read the library when it became Discover. The
enrichment flow is a second copy of Clean's match that keeps no attempt (DEC-066), asks for no review
(DEC-067) and writes outside the override layer with no history or revert (DEC-068). Reading an
accepted but unapplied label was declined for DEC-079's reason: what CuePoint acts on is what the
table showed.

**Implications**:
- `incrate/enrichment.py`, `inventory_db.py`, `collection_parser.py`, `schema.sql`,
  `services/inventory_service.py`, its interface and DI registrations, and the `/api/v1/incrate/import`,
  `/reset` and `/inventory` routes are removed. That is a breaking engine-API change and goes in the
  changelog, as CLEAN-14's removals did.
- The inventory database file on disk is user data, so it is left where it is and not deleted. The
  user docs say where it is and that nothing reads it any more, as DEC-071 did for past-search CSVs.
- The `incrate.inventory_db_path`, `enrich_on_first_import` and `enrichment_delay_seconds` config
  keys are still accepted by the loader, because config keys are an AGENTS.md invariant, and are
  documented as unused.
- "Which labels does this library have" becomes a facet over the effective label, so it counts what
  the Library's own label facet counts.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-091 — Discovery Is a Job, and Its Runs Are Kept

**Status**: Approved · **Related**: DEC-033, DEC-007, DEC-029

**Decision**: A discovery run is a cancellable background job shown in the status strip. Each run is
stored in the database with its parameters, its outcome and the tracks it found with their sources,
so that a past run can be reopened. The unused JSON run store is deleted.

**Reason**: The label branch alone makes one Beatport call per library label, so a run takes minutes.
DEC-033 settled that work of that length is a job, and a result that cost minutes and hundreds of API
calls should survive a restart.

**Implications**:
- The run's scope (which labels and artists, which genres and dates) is resolved **once, at start**,
  as DEC-063 set for batches, and is recorded with the run.
- A cancel keeps what was found so far, and the run's outcome says it was cancelled.
- One activity event per run, carrying its counts.
- Label-name lookups are cached in the database, so a second run does not ask Beatport again for
  labels it has already resolved.
- `incrate/past_results_storage.py` and `incrate_past_results.json` go. The file is left on disk and is
  not imported: its tracks have no source ids and were never checked for ownership.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-092 — Owned Tracks Are Marked and Hidden by Default

**Status**: Approved · **Related**: DEC-067, DEC-074

**Decision**: A discovered Beatport track is "In library" when its Beatport track id belongs to a
library track's accepted match. Owned tracks are hidden by default, the number hidden is shown, and a
toggle shows them.

**Reason**: A discovery list is a list of candidates to buy, and an owned track in it is noise.
Hiding it with a stated count removes the noise without hiding the fact.

**Implications**:
- "Accepted" means the state DEC-067 defines, whether automatic or the user's. A rejected candidate's
  id is not ownership.
- An accepted candidate with no parsed `beatport_track_id` falls back to the id in its URL, which is
  the rule DEC-074's Beatport duplicate signal already uses.
- Ownership is computed when it is read, never stored on a run. A track matched after a run was
  stored reads as owned when that run is reopened, which is the point of keeping runs.
- A library track that was never matched is not known to be owned. The list says ownership comes from
  Clean matches, because otherwise "not in library" reads as a stronger claim than it is.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-093 — A Wantlist, Plus the Beatport Playlist

**Status**: Approved · **Related**: DEC-006, DEC-058, DEC-092

**Decision**: CuePoint keeps a wantlist of Beatport tracks the user does not own. An entry can be
added, removed, given a note and marked bought. An entry whose track later appears in the library
through an accepted match reads as owned. Pushing tracks to a Beatport playlist and opening a track on
Beatport remain available (DEC-099).

**Reason**: A discovered track has no library row, so it cannot join a Collection, whose entries
reference `tracks.id` (DEC-058). A wantlist is a different kind of list — tracks a user does not have
yet — and Clean's accepted matches close the loop without any new link between the two.

**Implications**:
- A wantlist entry references a Beatport track id, not a library track. It is not a Collection, it
  does not appear in the Library's left pane, and it is not exported (DEC-078 exports Collections).
- "Bought" is the user's statement and "owned" is the library's. They are shown separately, because a
  track bought yesterday and not imported yet is exactly the case where they differ.
- Entries are kept until the user removes them. Nothing removes an entry automatically, including
  becoming owned.
- The wantlist is in the database, so DEC-009's backup covers it.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-094 — Artist and Label Pages Show the Library and Beatport

**Status**: Approved · **Related**: DEC-023, DEC-040, DEC-043, DEC-092

**Decision**: An Artist or Label page shows two halves: the user's own tracks by that artist or label,
which work offline, and, when a Beatport token is configured, Beatport's recent releases and charts
for it, each marked owned or not. Without a token or a connection, the Beatport half is an empty state
that says why.

**Reason**: A library-only page organizes without discovering, and a Beatport-only page shows nothing
offline while ignoring the library the page is about.

**Implications**:
- The library half is the Library's `TrackTable` over the one browse query (DEC-023, DEC-040), scoped
  by a rule (DEC-043). It is not a second table or a second query path.
- An artist is not a substring of a credit. `tracks.artist` holds "A, B & C", so the page needs an
  index that splits credits into artists, and a rule field over that index, so that the page and a
  saved Smart Collection mean the same thing.
- The Beatport half reads the v4 catalog and caches what it reads. Which feeds it can offer (releases,
  charts curated by the artist, charts featuring the artist) is settled by what the API actually
  provides, verified before the page is designed, not assumed.
- Pages are reached from the Discover page, from a track's artist and label in the Inspector, and from
  the Library's context menu. They are routes under `discover`, not new navigation destinations.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-095 — An Artist or Label Is a Beatport Id When Known, Otherwise a Name

**Status**: Approved · **Related**: DEC-074, DEC-092

**Decision**: When CuePoint knows an artist's or label's Beatport id, that id is the identity. Otherwise
the identity is a normalized name, and the page says it is a name-matched group.

**Reason**: Names vary ("Âme" and "Ame"), and one name can belong to two artists. Exact identity is
used where CuePoint has it and the page says where it does not, which is DEC-074's discipline of naming
the signal that grouped something.

**Implications**:
- **Where the id comes from** (found while writing the specification): an accepted match identifies a
  Beatport *track*. `match_candidates` stores `beatport_track_id`, but its `artists` and `label`
  columns are the text on the page. The artist and label ids are one v4 catalog lookup of that track
  away. So ids are known for a library track only after its accepted track has been resolved through
  the API, which needs a token. Without a token, every page is name-matched, and the page says so.
- Resolution is an explicit, cancellable job over accepted matches, with its results cached. It is
  never started by browsing.
- Name normalization folds case, accents and punctuation, and drops a featured-artist marker. It does
  not strip words such as "Records" or "Music", because that merges labels that differ. The one way
  this errs is by not grouping, as DEC-074 chose.
- A name-matched group and an id group that turn out to be the same artist or label are shown as one
  page, with the id as its identity, once resolution has linked them.

**Decided with**: User · **Date**: 2026-09-21

**Amendment** (2026-10-08, PAGES-08, DSC-4): "never started by browsing" stands, and the job is still
explicit and cancellable, but the engine now also starts it on its own after a Clean match finishes
successfully, when a Beatport token is present and tracks still need looking up. With no token, or one
already queued or running, nothing starts. The Discover page says it is happening and offers "Look them up
now" otherwise.

---

## DEC-096 — Similar Tracks Are Local, Deterministic and Explained

**Status**: Approved · **Related**: DEC-068, DEC-017, AGENTS.md's matching invariant

**Decision**: Similar Tracks are computed by a deterministic Python rule over the library: close BPM,
a compatible key, and a shared genre, label or artist, all read as effective values. Every suggestion
lists the reasons it scored. It works offline and needs no token. Phase 10's Set Builder reuses the
same engine.

**Reason**: AGENTS.md requires matching to stay deterministic and reviewable, and a suggestion that
cannot say why it was made is the opposite of CuePoint's "explain, don't silently decide". A local
rule is useful on the day it ships, and it is the natural core of Phase 10's "what fits next".

**Implications**:
- The rule lives in `core/`. Weights and thresholds are named constants, not settings, for DEC-067's
  reason.
- Key compatibility is new code. The matcher compares keys for equality only (`_key_bonus`). It is
  built on `services/override_values.parse_key`'s pitch-and-mode reading, so it accepts every notation
  the library holds.
- Suggestions are library tracks only. A seed with no BPM and no key still gets suggestions from its
  genre, label and artist, and says so.
- Results are ordered by score, then by track id, so the same library gives the same list.
- It is measured at 50,000 tracks.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-097 — No Audio Previews in Discover

**Status**: Approved · **Related**: DEC-050, DEC-056

**Decision**: Discover does not play Beatport preview clips. "Open on Beatport" is how a user listens
to a track they do not own.

**Reason**: The player's contract is one decoder and one queue of local files (DEC-050, DEC-056). A
streamed preview adds a network source and a second mode to it.

**Implications**: The player is untouched by this phase. A later phase that wants previews takes this
decision up again rather than amending it.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-098 — The Beatport Token Is Handled as It Is Today

**Status**: Approved · **Against recommendation** (OS secure storage)

**Decision**: Phase 9 does not change how the Beatport token is entered, stored or refreshed. A user
pastes it into Settings, it is kept in `~/.cuepoint/config.yaml` as `incrate.beatport_access_token`
(or read from `BEATPORT_ACCESS_TOKEN`), and it is tested with the existing route.

**Reason**: The user chose to keep token handling out of this phase's scope. The recommendation was
Electron `safeStorage`, because a credential stored on disk in plain text was the one security
property this phase could improve cheaply.

**Implications**, recorded so a later phase starts from the facts:
- The token stays in plain text on disk. It is still never sent to the renderer; the Settings route
  returns a masked preview, as before.
- An expired or rejected token is surfaced as what it is. A 401 or 403 from Beatport produces a stated
  "token invalid or expired" empty state that points to Settings, not a generic failure.
- `incrate/beatport_oauth.py` is left untouched. It has no production caller, as before.
- `incrate.beatport_username` and `incrate.beatport_password` fed only the browser fallback DEC-099
  deletes. The loader still accepts them (config-key invariant), and the docs say nothing reads them
  and that a user may remove them from the file. CuePoint does not edit the file to remove them.

**Decided with**: User (against recommendation) · **Date**: 2026-09-21

---

## DEC-099 — Beatport Playlists Go Through the API Only

**Status**: Approved · **Related**: DEC-093, DEC-091

**Decision**: Pushing tracks to a Beatport playlist uses the v4 API only. The playlist URL returned is
the real one. Adding tracks runs as a job that reports how many were added and how many failed. The
Playwright fallback and its tests are deleted.

**Reason**: The fallback has no production caller. Wiring it up would put browser automation into the
product to rescue a token without playlist scope, and the placeholder URL is a link that goes nowhere.

**Implications**:
- A token without playlist-write scope gets a refusal that says so, not a fallback.
- The playlist job records one activity event with its counts. A track that fails is reported and
  skipped; the job is not a transaction, as DEC-063 said of batches.
- `_CANONICAL_LABEL_IDS` — one user's label id hard-coded into discovery — is removed with the code it
  lives in. A name lookup that finds the wrong label is fixed by DEC-095's resolution or by the user,
  not by a table in the source.
- `scripts/create_incrate_playlist.py`, a developer script built on the retired inventory, is deleted
  with it.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-100 — Tools Retires, and the Library Is Home

**Status**: Approved · **Completes**: DEC-021 · **Amends**: DEC-020, DEC-027

**Decision**: Once inCrate becomes Discover, the Tools group and its landing page
(`ToolSelectionScreen`) are removed. The Library is the home destination. `/incrate`, `/` and the
remembered ids `incrate` and `tools` resolve through `RETIRED_DESTINATIONS`: `incrate` opens Discover,
and `tools` and `/` open the Library.

**Reason**: A landing page that links to destinations the sidebar already shows puts a click between
the user and their library on every launch that falls back to it. DEC-021 kept Tools only until each
tool had a real home.

**Implications**:
- `HOME_DESTINATION_ID` becomes `library`. The `tools` nav group is removed from `NAV_GROUPS`.
- The `discover` destination is enabled (DEC-020).
- Redirects, not 404s, for the reason Phase 7 gave for `/match` and `/results`.

**Decided with**: User · **Date**: 2026-09-21

---

## DEC-101 — "For You" Is Not in Phase 9

**Status**: Approved · **Related**: DEC-096

**Decision**: A "For You" feed is out of Phase 9 and recorded as deferred.

**Reason**: It needs a ranking rule over ratings, favorites and tags that nobody has asked for yet, and
DEC-096's engine is what it would be built on. Building it now would mean choosing weights with no
evidence.

**Implications**: No For You surface, route or placeholder is built. GAP_ANALYSIS §D's row stays
Missing.

**Decided with**: User · **Date**: 2026-09-21


---

## DEC-102 — A Set Is a Kind of Collection Node

**Status**: Approved · **Related**: DEC-006, DEC-017, DEC-058, DEC-059, DEC-011

**Decision**: A Set is a fourth `kind` in the existing Collections tree and table, beside `folder`,
`collection` and `smart`. Its entries are `collection_tracks` rows, ordered, and a track may repeat
(DEC-017). What a Set has that a Collection does not — chapters, planned times, notes, acknowledged
warnings — lives in side tables keyed by the Set and by its entries.

**Reason**: DEC-058 made a Collection and a Set structurally the same and recorded that the difference
would rest on what this phase adds. A separate set of tables would write Phase 6's tree, folders,
ordering and drag, DEC-060's membership rule, DEC-011's reference count and Phase 8's export path a
second time, and each copy would drift. Adding set features to every Collection instead would be the
merge DEC-058 warned about: "Collection" would stop meaning a crate. A kind keeps one tree and one
entry table, and keeps the two words meaning two things.

**Implications**:
- **Widening the kind is a table rebuild, and the rebuild must not cascade.** SQLite cannot change a
  `CHECK` in place. Under `PRAGMA foreign_keys=ON`, which the migration runner cannot switch off inside
  its transaction, `DROP TABLE collections` is an implicit `DELETE` that cascades to every
  `collection_tracks` row and every child node. The migration therefore sets both tables aside first,
  as m0012 did for `match_candidates`, and restores every id, position and `sqlite_sequence` value.
  The launch backup (FOUNDATION-11) runs before any migration, so a copy of the pre-migration database
  always exists.
- `rekordbox_export_playlists.kind` (m0020) is rebuilt in the same migration to accept `set`, so an
  exported Set is recorded as what it was (DEC-086).
- Every place that tests `kind` in Python and TypeScript is audited in one step. `Collection.holds_tracks`
  becomes true for a Set, and each `kind === "collection"` test in the renderer is either widened or
  confirmed as meaning a Collection only.
- `references_for()` splits by kind, so DEC-011's warning finally has a `set_count` to state.
- A Set sits in DEC-059's folders beside Collections. A folder may hold both.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-01) — the schema, and what the database now refuses

- **The rebuild is as decided.** `collections`, `collection_tracks` and `rekordbox_export_playlists` are
  set aside, dropped child first, and refilled with every id and sequence value. At 100,000 entries it
  takes 785 ms, once.
- **The vocabulary moved with the schema.** `KIND_SET` is in `KINDS` and `EXPORTED_KINDS`, and in the
  TypeScript unions, from PREP-01 rather than PREP-02. The repository holds each `CHECK` and its model
  constant to one list, and a schema that stores `set` must have models that can read it back. Nothing
  can create a Set until PREP-02.
- **"Set data belongs to a Set" is a constraint, not a convention.** Composite references make the
  database refuse three things: details on a node that is not a Set, a plan whose chapter is in another
  Set, and an acknowledgement across two Sets. A Set holding details cannot be turned into another
  kind. `PHASE10_PREPARE.md` records the tables and why.

**Why the decision stands**: all of this is the decision's own consequence. A Set is a node, and what
only a Set has is kept beside it, now enforced where it is stored.

### Implemented (2026-09-28, PREP-02) — the kind through the Collection code

- **`holds_tracks` is true for a Set**, so adding, inserting, moving and removing entries, the counts,
  the Library scope, the "in Collection" rule and the export path take a Set as they take a
  Collection. Everything that asks "is this a crate?" still answers no. `PHASE10_PREPARE.md` records
  the audit, one row per place `kind` is tested.
- **The one writer of entries plans them.** Every entry written into a Set gets its chapter in the same
  transaction, by every path, and a Set is checked after every write.
- **A Set holds at most 1,000 entries**, refused with the numbers before anything is written,
  including by a batch.
- **DEC-011's count has Sets of its own.** `references_for()` splits by kind, and the refusal reads
  "4 in 1 Set" beside "3 in 2 Collections". The summary carries `set_track_count` and `set_ids`,
  extended rather than renamed.
- **"New Set from…" and duplicate are copies.** Nothing is converted in place.

---

## DEC-103 — Chapters Are Contiguous Sections With Optional Targets

**Status**: Approved · **Related**: DEC-102, DEC-106, DEC-107

**Decision**: A Set is divided into ordered, named chapters. Every entry belongs to exactly one, and a
chapter's entries are contiguous in the Set's order. A chapter may carry notes, a target length and a
target BPM range. The warnings (DEC-106) and suggestions (DEC-105) read the targets.

**Reason**: A divider with no targets is a label. The targets are what turn "Warm-up" into a plan that
CuePoint can check: forty minutes, 118 to 122 BPM.

**Implications**:
- A Set always has at least one chapter. A new Set has one, unnamed, and the Set view draws no chapter
  header while that is the only one, so a Set that never uses chapters looks like a list.
- Deleting a chapter moves its entries into the chapter before it (the one after, for the first). The
  last chapter cannot be deleted.
- Contiguity is enforced by the service on every write and held by a test over random edits.
- Chapters are not exported to Rekordbox (DEC-109). They appear in the set list files (DEC-110).

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-02) — which chapter an entry joins

- **Contiguity is enforced by the one writer of entries**, the Collection repository, rather than the
  service. Every write path passes through it (DEC-102's reason for keeping entries in one table), and
  it checks the Set after each write.
- **An appended entry joins the last chapter. An inserted entry joins the chapter of the entry before
  it, or the first chapter at position 0.**
- **Precision: a moved entry keeps its chapter when it can.** The first rule written made a move follow
  the insert rule, so reordering an entry to the top of its own chapter would have put it in the
  chapter before. A moved entry now keeps its chapter whenever that chapter still reaches the new
  position, and follows the insert rule only when it does not.
- **A caller may name the chapter on an insert or a move.** At a boundary between two chapters an
  entry could belong to either. The name is refused unless the chapter reaches the position.

**Why the decision stands**: this is how "every entry belongs to exactly one chapter, and a chapter's
entries are contiguous" is kept, not a change to it.

### Implemented (2026-09-28, PREP-03) — the chapter operations

- **Deleting follows the decision.** A chapter's entries join the chapter before it, or the one after
  for the first, and the last chapter a Set has cannot be deleted. The repository picks the neighbour
  itself rather than taking it from a caller, so no path can merge a chapter into one its entries are
  not beside.
- **Moving a chapter moves its entries as one block**, in their order, in one renumbering statement.
- **Precision: "start a chapter here" is refused at a chapter's first entry.** Nothing comes before it
  in that chapter, so a split there would move every entry into the new chapter and leave the old one
  empty. The refusal says to rename the chapter instead. An empty chapter is still legal, and one made
  on purpose (a new chapter, not yet filled) is kept.
- **Contiguity now includes the chapters' own numbering.** The check that ends every write also holds
  chapter positions to `0 … n - 1`, and one function serves both writers.
- **Two writers, one rule for entries.** Chapters, times and notes have their own repository. Anything
  that moves an entry, a whole chapter included, stays with the Collection repository, and a test holds
  that no other module writes an entry.

**Why the decision stands**: these are the operations the decision implies, and the one precision
refuses a gesture that would only have made an empty chapter.

---

## DEC-104 — Prepare Is Its Own Page, and Sets Are in the Library Tree

**Status**: Approved · **Amends**: nothing; enables DEC-020's `prepare` destination · **Related**:
DEC-062, DEC-072

**Decision**: The `prepare` destination is enabled as the Set Builder: the Sets, the open Set with its
chapters, times and warnings, and a source panel of suggestions and library tracks. Sets also appear in
the Library's CuePoint tree, where selecting one scopes the table as a Collection does and "Open in
Prepare" edits it.

**Reason**: DEC-072's reasoning: a Set beside a source of tracks and a suggestion list does not fit the
Library page. DEC-062's reasoning still holds for browsing: a Set is a node in the one CuePoint tree, and
a user filing Sets in folders beside Collections sees them where they filed them.

**Implications**:
- The Library's Set scope is the browse query's Collection scope, which lists each track once. The Set
  as a running order, with its repeats, is read through the Set's own entries on the Prepare page.
- The Collections tree's context menu gains "Open in Prepare" for a Set and "New Set from…" for a
  Collection, a Smart Collection or a Rekordbox playlist. "New Set from…" copies entries; nothing is
  converted in place.
- ORG-11's operations list gains "Add to Set…".

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-29, PREP-09) — the Library half

- **As decided.** Sets are nodes of the CuePoint tree, made and filed beside Collections. Selecting one
  scopes the table as a Collection does. "New Set from…" is on a Collection, a Smart Collection and a
  Rekordbox playlist, and copies; "Add to Set…" is in ORG-11's list.
- **Precision: the Library says what its Set scope is.** A line under the filter bar says the rows are
  the Set's tracks once each, with the numbers when a track plays twice. A Set's order and removal are
  Prepare's, so the Library offers no row drop and no "Remove from" inside a Set.
- **Precision: "Open in Prepare" waits for Prepare.** It is built on the tree's menu, the Inspector's
  Sets and the scope's line, behind one page prop that PREP-10 passes when it enables the page.
- **Precision: "New Set from…" asks.** A name and a folder, with a sentence on what a copy of this
  source means, before anything is written. The source's name is filled in.

**Why the decision stands**: the tree is where a user files things (DEC-062), and a Set filed there is
found there; the running order, which the Library's browse cannot show, stays Prepare's (DEC-072).

### Implemented (2026-09-29, PREP-10) — the page

- **As decided.** `prepare` is enabled as the Set Builder: a Set, its chapters as heading rows, its
  entries' times, notes and warnings, and the entry selected planned in the Inspector. "Open in Prepare"
  leads there from the Library's tree, Inspector and Set scope.
- **Precision: a Set is a page of Prepare.** `/prepare/:setId` keeps Prepare lit and is remembered as
  Prepare (DEC-027). The page reopens its own last Set, and says so when that Set has gone.
- **Precision: with no Sets, the page makes one.** It says what a Set is and offers "New Set" and "New
  Set from…". The second asks for the source first.

**Why the decision stands**: a running order beside what can go into it is its own page (DEC-072). The
Library still shows where a Set is filed.

### Implemented (2026-09-29, PREP-12) — two gaps the acceptance check found

- **Precision: "New Set from the selection…"** joins ORG-11's list, after "Add to Set…". Phase
  acceptance 2 names a selection as a source, and PREP-02 and PREP-08 had built it, but no gesture
  reached it. It takes the selected tracks in the table's order, read once through the id projection
  (DEC-063), not the order they were clicked; more than a Set holds is refused whole, with the numbers,
  before anything is read.
- **Precision: a Set's own notes have a place on the page.** PREP-03 built them and PREP-08 wired them,
  and the phase's deferred list relies on them, but PREP-10 drew no field. "Notes…" on the header's
  facts line opens one dialog and one write; its title is the notes themselves. The line stays one line,
  and `prepare.spec.ts` measured every row count unchanged.

---

## DEC-105 — Suggestions Fit Both Neighbours

**Status**: Approved · **Related**: DEC-096, DEC-103

**Decision**: Suggestions are DEC-096's rule applied at an insertion point. A candidate is scored
against the entry before the insertion point and the entry after it, or against one of them at either
end of the Set. The pool is the whole library or a Collection, Smart Collection or Rekordbox playlist the
user picks. The chapter's BPM range, when it has one, narrows the pool. Tracks already in the Set are
marked, not hidden.

**Reason**: "What is like this track" is DEC-096's question. "What goes between these two" is the one a
Set Builder exists for, and it is the same rule applied twice, so the answer stays deterministic and
explained.

**Implications**:
- A candidate must pass DEC-096's tempo gate against each neighbour that has a BPM. Its score is the
  mean of its two scores, and its reasons are listed per side. Ties break by track id.
- When nothing can pass both gates, the answer says so, with the tempo gap between the neighbours, and
  offers each side's own list. It does not loosen the gate.
- The neighbours themselves and their duplicate groups (DEC-074) are excluded.
- The rule change is in `core/`, with no SQL and no I/O, like DEC-096's.
- An empty Set has nothing to fit against and shows no suggestions.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-04) — the rule at a gap

- **As decided.** A candidate passes the tempo gate of each neighbour with a BPM, its score is the
  mean of the two sides' scores, its reasons are listed per side, and ties break by track id. The
  neighbours and their duplicate groups are left out. Tracks already in the Set are marked with how
  many times they are there. An empty Set is refused. The rule is `core.similarity.fit`, beside
  DEC-096's, and a fit against one side is exactly DEC-096's score.
- **Precision: a side with nothing to offer counts as 0 in the mean.** A neighbour with no BPM has no
  gate, so a candidate may share nothing with it. The mean then says the candidate suits one side, not
  both.
- **Precision: each side's own list is asked for, not sent.** When nothing bridges the two
  neighbours, the answer says so, with the tempo gap in percent and how their keys relate. The same
  gap can then be fitted against one side (`against`), which is how the list for each side is offered.
  Computing both lists inside every such answer would have roughly tripled the worst case for lists the
  user may not open.
- **Precision: the gap is two entry ids, and a stale one is refused.** A view that no longer matches
  the Set cannot aim at a different gap.
- **Precision: the chapter's range is inclusive, and a track with no BPM is outside it.** A range the
  tempo windows miss gives an empty answer, which is not "nothing bridges": the neighbours can be
  bridged, just not inside that range.

**Why the decision stands**: the decided rule, written down, with the one gesture it named
("offers each side's own list") given a way to be asked for.

### Implemented (2026-09-29, PREP-11) — the panel

- **As decided.** The source panel's Suggestions tab asks for the gap after the selected entry, or
  the end of the Set, over the pool the user picks, and draws each side's reasons and the "in this
  Set" mark. A gap nothing bridges is explained from its tempo gap and key relation, with "Fit after"
  and "Fit before" asking for each side's list through `against`. An empty Set says it has nothing to
  fit against.
- **Precision: the gap names its chapter.** A track inserted at the gap joins the chapter of the entry
  before it (PREP-02), and the request names that chapter. The range that narrows the list is then the
  one the track lands in.
- **Precision: a suggestion carries its track's row.** The answer sets each suggestion beside the
  Library's own row, as a Set's entries are set, so the panel needs no read per track.

---

## DEC-106 — Set Warnings Cover Transitions, Entries and Chapters, and Can Be Acknowledged

**Status**: Approved · **Related**: DEC-017, DEC-096, DEC-073, DEC-103, DEC-107

**Decision**: A Set checks each transition for a tempo jump outside DEC-096's window (half and double
time counted as close), a key that the Camelot wheel does not call compatible, and a BPM or key it cannot
check. It checks each entry for a missing file and for planned times outside the track, and notes a
repeated track. It checks each chapter against its target length and BPM range. Every threshold is a
named constant. A transition warning can be acknowledged. Nothing blocks anything (DEC-017).

**Reason**: A warning that can never be dismissed is read once and then ignored, including the times it
matters. Reusing DEC-096's window and key relation means Suggestions and warnings judge a transition by
one rule. A track Suggestions offered for a slot never has a tempo warning there, because tempo is
DEC-096's gate. Key only adds points in DEC-096, so a suggested track can still clash, and the warning
then means exactly that it earned no key points.

**Implications**:
- An acknowledgement belongs to two adjacent entries and records the values it was given. It applies
  while those entries are adjacent in that order and the values compared are unchanged. A reorder, a
  replaced entry or a new BPM or key override brings the warning back.
- A repeated track is a notice, not a warning, because DEC-017 says repeating is legitimate.
- "Missing file" reads DEC-073's stored status. A library whose files were never checked says so rather
  than reporting no missing files (DEC-088's rule).
- A chapter's length check follows DEC-107: over target is reported whenever the timed entries already
  exceed it; under target is reported only when every entry in the chapter is timed.
- DEC-017's "PREP-11/PREP-12 never gate export" names the roadmap's placeholder steps. In the
  specification the warnings are PREP-05 and the two exports PREP-06 and PREP-07; the rule is
  unchanged.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-05) — the checks, and one rule with Suggestions

- **As decided.** Every transition, entry and chapter is checked. The thresholds are DEC-096's, read
  from `core/similarity.py` and never restated. Only transition warnings can be acknowledged, and an
  acknowledgement applies while its two entries are adjacent in that order with the values it
  accepted. A repeat is a notice. A Set never checked says so. Nothing blocks anything.
- **Precision: a transition is a tempo jump only when neither track is within the other's window.**
  DEC-096's window is a percentage of the seed, so it is not symmetric. Suggestions (DEC-105) judge a
  slot from each neighbour. So a warning judged from the earlier track only would flag a track
  Suggestions had just offered, which this decision's own reason rules out. A test holds the two
  together through both services.
- **Precision: acknowledgements compare canonical values**: keys as Camelot codes and BPMs to the
  library's two decimals. A change of the library's key notation leaves them standing, and the wire
  still writes keys in the library's notation.
- **Precision: an unreadable file warns as a missing one does**, and a missing file says when its
  drive was not connected. An in time past the track's end is outside it, as an out time is.

**Why the decision stands**: these keep "Suggestions and warnings judge a transition by one rule" true
in the direction the decision cares about, and say more exactly what was found.

### Amended (2026-10-08, DEC-201) — a missing key is a notice

A track with no Beatport key is not "a key it cannot check" warning: it is not counted among the
Set's warnings and is not acknowledged. Prepare says once how many entries have no Beatport key,
with **Match tracks…** (PAGES-09). A BPM it cannot check stays a warning.

---

## DEC-107 — Running Time Comes From Typed Times, and Counts Only What Is Timed

**Status**: Approved · **Recommendation not taken** (Q-109 and its follow-up Q-112)

**Decision**: Each Set entry may carry a planned in time and out time, typed by the user. A Set's and a
chapter's running time is the sum of the planned lengths of timed entries, and states how many entries
are untimed. An untimed entry counts as nothing. Playback ignores the times (DEC-108).

**Reason**: The user plans with real times rather than an estimate, and a running time should be a sum of
what was planned, saying what it leaves out rather than guessing. The recommendation was an estimate from
full lengths minus a mix length in bars, with no typing; and, for untimed entries, their full length.

**Implications**:
- An entry is timed when it has an out time. An in time left empty is 0:00.
- Times are whole seconds, typed as `m:ss` or `h:mm:ss`, with `in < out`, and `out` no later than the
  track's end when its length is known. A later refresh that shortens a track makes the times a warning
  (DEC-106), not an error, and nothing rewrites them.
- A "starts at" time is shown for each entry up to the first untimed one, because after it the clock is
  unknown.
- Times belong to the entry, not the track: the same track twice in a Set can be planned twice.
- Times are not exported to Rekordbox and are not in M3U8. They are in the text and CSV set lists
  (DEC-110).

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-03) — times as typed, and the running time

- **The rule is in `core/set_timing.py`**, with no SQL and no I/O. It reads `m:ss` and `h:mm:ss`, and
  writes a time back the shortest way. It also holds the planned length, the running time (a sum and an
  untimed count) and "starts at".
- **Precision: what a time may be.**
  - `m:ss` takes up to three digits of minutes, so `75:30` is read as DJs write it.
  - `h:mm:ss` takes up to two digits of hours.
  - Seconds, and minutes after hours, run from 00 to 59.
  - A bare number is refused, because `90` could be a minute and a half or an hour and a half. So are
    fractions, signs and units.
  - The forms stop at 99:59:59. That bound also caps a chapter's target.
- **Precision: an in time is also held to the track.** When the length is known, the out time is no
  later than the end, as decided, and the in time is before it. A stored length of zero is treated as
  unknown.
- **"Starts at" includes the first untimed entry**, whose start is still known, and is empty after it.
  An empty chapter starts where the entries before it end.

**Why the decision stands**: this is the decided rule written down once, with the typing forms made
exact.

---

## DEC-108 — A Set Plays as the Queue, Whole Tracks, With No Transition Preview

**Status**: Approved · **Recommendation not taken** (Q-110) · **Related**: DEC-012, DEC-050, DEC-056

**Decision**: Playing a Set loads its entries, in order and with repeats, as the queue, starting from
the entry chosen. Tracks play whole. There is no transition preview, and nothing about the player
changes.

**Reason**: The user kept the player out of this phase. The recommendation added a "Preview transition"
built from a seek and a queue of two, inside DEC-056's contract.

**Implications**:
- The queue is built with the existing `player.playQueue(items)`. `playView` is not used, because the
  Library's Collection scope lists a repeated track once (DEC-104).
- DEC-050 and DEC-056 stand unchanged. The player is not told it is playing a Set.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-29, PREP-10)

- **As decided.** "Play Set" plays from the start. A double-click or Enter on an entry plays from that
  entry. Both send the entries in order, repeats included, to `playQueue`. Nothing about the player
  changed, and it is not told it is playing a Set.

**Why the decision stands**: the queue is the player's list, and a Set's running order is a list.

---

## DEC-109 — A Set Exports as One Rekordbox Playlist

**Status**: Approved · **Related**: DEC-078, DEC-080, DEC-086, DEC-087

**Decision**: Sets join Phase 8's export dialog. Each chosen Set is written as one ordered playlist,
repeats kept, under CuePoint's folder at its folder path, like a Collection. Chapters, times and notes
are not written.

**Reason**: A DJ plays from one list. Rekordbox XML has no section marker, so chapters have no honest
place in it, which is DEC-080's reason for keeping tags in CuePoint.

**Implications**:
- `EXPORTED_KINDS` gains `set`, and the export record stores it (DEC-102's rebuild of m0020's table).
- The Collection context menu's "Export to Rekordbox…" (DEC-087) works on a Set and pre-ticks it.
- Warnings are not mentioned in the preview and never stop an export (DEC-017).

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-29, PREP-07) — a Set through Phase 8's path

- **As decided.** A chosen Set is written as one ordered playlist, with its repeats, at its folder path
  under CuePoint's folder, and recorded as `set` with no rules. Chapters, times, notes and
  acknowledgements are not written, and its warnings are neither mentioned nor able to stop an export.
- **Precision: there is no Set branch in the export.** A Set's entries are read by the same call from
  the same table as a Collection's, so a Set is appended exactly as a Collection is. A test holds that
  a planned Set and a Collection with the same folder, name and entries give byte-identical files.
- **Precision: the dialog names a Set** as "Set · N" in its tree and "Set, in its running order" in the
  preview, as it names a Smart Collection.

**Why the decision stands**: the export writes what was decided, through the path Phase 8 already
proved.

---

## DEC-110 — A Set List Can Be Saved as Text, CSV or M3U8, or Copied

**Status**: Approved · **Recommendation not taken** (Q-113) · **Related**: DEC-083, DEC-085, DEC-088

**Decision**: "Save set list…" writes a Set as a plain-text tracklist, a CSV or an M3U8 playlist to a
file the user chooses in a save dialog. "Copy set list" puts the plain-text form on the clipboard.

**Reason**: A tracklist is what a DJ posts after a gig or prints for the booth, and an M3U8 carries the
Set to other players or a USB stick. The recommendation left M3U8 out.

**Implications**:
- Text and CSV carry the chapter, the planned times and "artist – title (mix)", read as effective values.
  M3U8 carries the order, each file's absolute path and an `#EXTINF` line, with each chapter as a
  comment line. M3U8 has no standard way to say where to start or stop, so it carries no times.
- The file is written by the engine to the path the save dialog returned, as DEC-083's export is. The
  engine refuses any other extension or a folder that does not exist. Nothing else is written, and no
  audio file is opened.
- A missing file is still listed in the M3U8 and counted, by DEC-088's reasoning: dropping it would
  make the file quietly differ from the Set.
- Each save records one activity event. No per-Set save record is kept, because nothing reads one.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-28, PREP-06) — the three forms

- **As decided.**
  - The text and CSV forms carry the chapters, the planned times and "artist – title (mix)", read
    as effective values.
  - The M3U8 form carries the order, each file's path and an `#EXTINF` line, with chapters as comment
    lines and no times. A missing file is listed and counted.
  - The engine writes only to a `.txt`, `.csv` or `.m3u8` path in a folder that exists, atomically.
    It opens no audio file, and each save records one event.
- **Precision: the CSV is safe in a spreadsheet.** It has a byte-order mark, so accents read. A cell
  that begins with `=`, `+`, `-`, `@`, a tab or a return is quoted. Times are written `h:mm:ss`,
  because `3:45` would be read as three hours and forty-five minutes.
- **Precision: "(mix)" is the title as Rekordbox holds it.** A remixer the title does not name is added
  as "(Remixer Remix)", and every value is written on one line.
- **Precision: a Set that never used chapters is written as a plain list**, as DEC-103 draws it.

**Why the decision stands**: the forms are as decided, and each precision keeps a file from being

### Implemented (2026-09-29, PREP-08) — the save dialog and the copy

- **As decided.** "Save set list…" opens a save dialog that the main process owns. The dialog only
  chooses a file; the engine judges it and writes it. "Copy set list" reads the text from the engine,
  and the renderer puts it on the clipboard (PREP-11).
- **Precision: the dialog suggests `<Set name> <date>.txt`** in local time, with the three forms as its
  filters. Characters no file name may hold are replaced, so a Set called "Friday 2/10" is saved as
  "Friday 2-10 …", not refused.
- **Precision: the folder is remembered only from a save the engine wrote.** It is kept in main's own
  settings file, not the database, because nothing but the activity event records a save.
- **Precision: a file system that refuses the write is a refusal with the path.** The next step is
  another place, so it crosses to the renderer as a value.

**Why the decision stands**: the dialog chooses, and the engine judges and writes, as DEC-083 has it for
the export.
misread by the program it is opened in.

---

## DEC-111 — A Set's Shape Is Its Tempo and Key, and There Is No Energy Field

**Status**: Approved · **Related**: DEC-015, DEC-057, the Phase 19 audio-analysis item

**Decision**: The Set view draws the Set's tempo curve and its key path on the Camelot wheel from the
entries' effective values. CuePoint gains no energy field in this phase.

**Reason**: Both lanes come from data every library already has. Tags with an "Energy" category already
let a user record energy by hand (DEC-015). A measured energy is audio analysis, which is Phase 19's, and
a hand-typed field added now might have to be reconciled with that.

**Implications**:
- The lanes are drawn in the pixel style, with no chart library.
- An entry with no BPM or key is a gap in its lane, not a zero.

**Decided with**: User · **Date**: 2026-09-28

### Implemented (2026-09-29, PREP-11)

- **As decided.** Two lanes above the Set table, drawn as inline SVG rectangles in whole pixels, in
  `currentColor` and theme tokens. Tempo is a stepped line, one column per entry. Key is each entry's
  place on the wheel, and the line between neighbours is solid for the same key or one step, dashed for
  the relative key and dotted for a clash. An unknown value is a gap. No energy field was added.
- **Precision: the engine says what the lanes draw.** `SetAnalysis.shape` carries each entry's
  effective BPM, its key in the library's notation and on the wheel, and each transition's relation.
  It is read from the same facts and through the same `key_relation` the warnings use. The renderer
  lays the shape out and parses no key, so a lane cannot disagree with a warning.
- **Precision: the key lane has a row per code.** B sits above A, so the relative key is one row away
  and a step on the wheel two. The line's style says the relation even where the wheel wraps (12A to
  1A).
- **Precision: the lanes start hidden** and are remembered once opened (DEC-112's rows).

---

## DEC-112 — Prepare Lays Out Side by Side

**Status**: Approved · **Related**: DEC-048, the Phase 8 macOS item on the Library's vertical fit

**Decision**: The Prepare page puts the Set and the source panel side by side rather than stacked. An
end-to-end test holds how many whole rows the Set shows at the default window size and scale. A
double-click on a partly visible row, which the table's own scroll-into-view currently defeats, is
fixed in `TrackTable` as a bug.

**Reason**: Stacking two tables halves a height that Phase 8 already found too small at `--scale: 2`. A
compact density app-wide would reach back into Phases 4 and 6 for a problem that is not Phase 10's alone.

**Implications**:
- The Library's own vertical fit stays recorded as Phase 8 left it. This decision does not change the
  Library page, its floor or the default scale.
- The `TrackTable` fix benefits every table, and is tested where it is made.

**Decided with**: User · **Date**: 2026-09-28
### Implemented (2026-09-29, PREP-10)

- **As decided**, with the source panel's place and its remembered divider built and PREP-11's panel
  still to come.
- **Precision: the header is two short lines.** As first specified it wrapped to three and left the Set
  two whole rows. The Set picker is the title, the two export actions are one "Export ▾" menu, and the
  counts and "Columns…" share one line.
- **Measured**: 7 whole rows at 1,280 × 800 and scale 2, with the sidebar expanded and as a rail, above
  the floor of five. With the player's bar on screen there are 4, held so they cannot get worse, and
  recorded in PREP-10's outcome. The page itself never scrolls.
- **Precision: the double-click had a second cause on Windows.** The selection strip did not wrap, so a
  first click gave the Library's scrolling column a horizontal scrollbar over the row clicked. The
  strip now wraps. `TrackTable` also focuses without a scroll, as decided. Neither changes the Library's
  height, floor or scale.

**Why the decision stands**: side by side is what leaves the Set its rows.

### Implemented (2026-09-29, PREP-11) — the panel beside the Set

- **As decided**, with the source panel in its place. The width check runs with it present: every
  control on screen, nothing spilling, and the Set the wider pane.
- **Precision: the panel is clamped against the layout, not the window.** Measured against the
  window, the panel could be wider than the Set with the sidebar and the Inspector open.
- **Precision: the header's line holds one link, "View ▾".** It opens the lanes and "Columns…". A
  second link wrapped the line and cost the Set a row.
- **Precision: the panel's controls are a row's height**, not the doubled hit target. Otherwise its
  table showed no whole row in the default window.
- **Measured on Linux**: the Set's rows are unchanged as the page opens (8, and 5 with the player's
  bar; PREP-10's Windows run measured 7 and 4). With the lanes open the Set shows 5, and the panel shows
  4 whole Suggestions. `prepare.spec.ts` holds each at one less, the offset PREP-10's two platforms
  showed, until the Windows run records its own numbers (PREP-12).

### Precision (2026-10-08, DEC-161) — the default size is now 1.5×

The floor of five whole Set rows applies, as this decision says, "at the default window size and
scale", now 1.5×. At 2× with the row-height fix (PAGES-14) the Set shows four, recorded with no floor:
someone who picks 2× chooses bigger rows over more of them. Phase 14's additions to Prepare sit on
lines it already has (PAGES-09).

---

## DEC-113 — CuePoint Computes Waveforms From the Audio

**Status**: Approved · **Related**: DEC-005, DEC-049, DEC-123

**Decision**: CuePoint computes each track's waveform from its audio file, through the decoder it
already ships, the player's `mpv`. It reads none of Rekordbox's analysis (ANLZ) files, and adds no
second decoder.

**Reason**:
- **Coverage:** one pipeline covers every track CuePoint can play, whether or not Rekordbox analysed
  it and wherever Rekordbox keeps its data.
- **Control:** the format is CuePoint's own, so a change in a vendor's undocumented layout can never
  break it.
- **Nothing new to ship:** the decoder is already fetched, verified, licensed and packaged per OS
  (PLAYER-01).

**Implications**:
- A CuePoint waveform will not match Rekordbox's pixel for pixel. It is drawn from the same audio.
- Where there is no `mpv` (Linux without `CUEPOINT_MPV_PATH`, the CLI), there are no waveforms, and the
  app says so in words.
- The format is proved in CI on the pinned binaries, as playback's formats are (WAVE-01).

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-114 — Waveforms Appear in the Bar, the Inspector, Prepare and a Library Column

**Status**: Approved · **Related**: DEC-052, DEC-042, DEC-112

**Decision**: Four places draw a waveform.

| Where | What it does |
| --- | --- |
| The player bar | Its waveform is the seek control. |
| The Inspector | Draws the selected track's waveform. |
| The Prepare page | Draws a transition strip (DEC-120). |
| The Library | Offers a "Waveform" column. |

**Reason**: Each is where a DJ reads a track's shape for a different purpose: while listening, while
inspecting, while planning a transition, and while scanning a crate.

**Implications**:
- **The bar keeps its height and its control.** The range input stays the element a keyboard and a
  screen reader use, and the waveform is its picture.
- **The column is hidden by default,** as artwork's is, and never asks for analysis. Only what a user
  is looking at jumps the queue.
- **No surface is the only place a fact appears.** Cues are listed in words in the Inspector, and planned
  times are text in the strip.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-115 — An Overview Only

**Status**: Approved · **Related**: DEC-114

**Decision**: A waveform is the whole track at once, with a playhead moving across it. There is no
zoomed, scrolling detail view.

**Reason**: The overview serves all four surfaces. A detail view needs another, much denser resolution,
scrolling kept in time with `mpv`'s position, and zoom controls: close to a phase of its own, for a
performance view CuePoint does not otherwise have.

**Implications**:
- **Fixed width:** one stored resolution, 1,200 columns per track, from which every smaller width is
  derived.
- **The detail view is deferred,** not rejected. Nothing stored would stop a later one from being
  computed beside the overview.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-116 — The Whole Library Is Analysed Automatically, in the Background

**Status**: Approved · **Against recommendation** (on demand plus a batch on request) · **Related**:
DEC-007, DEC-050, DEC-073, DEC-076

**Decision**: After every import and refresh, once the file check has found what is present, CuePoint
analyses every present track that has no current waveform, without being asked.

- **Low priority:** a bounded number of workers, at lowered OS priority.
- **Visible:** its progress is in the status strip.
- **Pausable:** it can be paused and resumed from the strip, Settings and the Health view.
- **Resumes:** after a restart it continues where it stopped, unless paused.

**Reason**: The user wants waveforms to simply be there, not to be asked for. Q-122 settled the cost
that brings: the work is spread out and yields, rather than competing with the user.

**Implications**:
- **Hours on a first run.** A 50,000-track library takes hours. The measured rate is recorded
  (WAVE-01, WAVE-03), and Settings states the time left.
- **It never delays playback.** Since the engine is not told about playback (DEC-050), the means is OS
  priority and a worker bound, and an acceptance test plays music during a run.
- **It steps aside for any library rewrite.** Import, refresh apply and the file check never wait for
  it, and it returns after the check that follows them.
- **Starting at launch reverses nothing in DEC-073.** That decision declined *checking* files at launch.
  This reads only files the last check found present.
- **Pausing** is remembered and stops background work. A track the user is looking at is still analysed
  on its own.
- **One activity event per run,** never one per track.

**Decided with**: User (Q-119 and Q-122) · **Date**: 2026-09-29

### Implemented (2026-10-03, WAVE-03) — the library analysis job

- **As decided:** after every whole-library check and at launch, unless paused. It is bounded to
  `min(2, cpu_count // 4)` workers at lowered priority, and is shown in the status strip.
  - Pause and Resume are in the Health view and the strip; Settings follows in WAVE-05.
  - A pause persists across restarts as `waveforms.analysis_paused`.
  - The tracks of Sets come first, then those of Collections, then the newest.
- **Precision: the strip's Stop is a Pause.** A cancel the setting did not record would be undone
  by the next start, so a cancel of this job, from any route, pauses it.
- **Precision: it steps aside for tag writes and restores too,** beside imports, refresh applies
  and file checks. It comes back when the last of them ends, however it ended. A failed import
  starts no check, so "returns after the check" alone could have left it stopped.
- **Precision: requests run while paused,** and jump the queue at once, not at the next chunk.
- **Precision: staleness without a `stat` of every file at every start.** A row counts only at the
  size the file check recorded. The run that follows a whole-library check also `stat`s every
  analysed file, for a file rewritten at the same size.
- **Measured on Windows** (16 cores, the pinned `mpv`, two workers):
  - about 8,400 six-minute tracks an hour, so about 6 hours for 50,000;
  - the Library search's p95 at 1.35–1.38× idle while it runs;
  - no underrun in a queue played on the audio device meanwhile.

  `PHASE11_WAVEFORMS.md` has the full table. macOS and Linux are owed.

---

## DEC-117 — Three Bands Are Stored; the Colour Is a Setting

**Status**: Approved · **Against recommendation** (three bands only) · **Related**: DEC-115

**Decision**: Every waveform stores four values per column: the full band and three frequency bands,
low, mid and high. Settings chooses how they are drawn: "Three bands", in colour and layered, or "One
colour", the full band only. The default is three bands.

**Reason**: The bands are the costly part and are stored either way, so offering one colour costs a
setting and a drawing mode, not a second analysis.

**Implications**:
- **The crossovers are CuePoint's own,** named constants: 200 Hz and 2 kHz. Changing them changes the
  analysis version, and the library is analysed again over time.
- **The colours are theme tokens,** in all five themes and derived for custom themes, and are held to a
  minimum contrast against the panel.
- **The choice is a display preference,** remembered by the renderer, not library data.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-118 — Cue Points and Beat Grids Are Imported and Drawn, Read-Only

**Status**: Approved · **Related**: DEC-077, DEC-032, DEC-035

**Decision**: The importer reads each track's `POSITION_MARK` and `TEMPO` elements from the Rekordbox
XML on import and refresh. That covers hot cues, memory cues, loops and the beat grid. They are stored
beside the track and drawn on its waveform. Nothing in CuePoint edits them, and nothing writes them
anywhere.

**Reason**: A waveform without its cues answers half of what a DJ reads one for. Reading is safe;
writing is the loss DEC-077 was written to prevent.

**Implications**:
- **DEC-077's premise changes and its rule stands.** CuePoint now parses cues and grids, but the export
  still patches the source and never writes a mark. A test holds the export byte-identical.
- **Replaced whole.** A refresh replaces a track's marks, and its preview counts the tracks whose marks
  changed, in one line. Marks are copies of Rekordbox's, not something a user would refuse.
- **Older libraries** get their marks from their recorded source, once, when it has not changed (DEC-035).
  Otherwise the marks arrive with the next refresh, and the Inspector says so.
- **Guarded vocabulary.** A mark type CuePoint does not know is skipped and counted, never stored under a
  guess.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-119 — Phase 11 Starts With Phase 5's Manual Acceptance Owed

**Status**: Approved · **Related**: the roadmap's Phase 11 gate, DEC-055

**Decision**: Phase 11 is specified and built before Phase 5's remaining manual acceptance is closed.
That acceptance is a notarization submission, the rows that need a real audio interface, the row that
needs somebody to listen, and the DEC-055 amendment. It stays recorded as owed.

**Reason**: All twelve player steps are implemented and tested. Phases 9 and 10 proceeded the same way,
recording what was owed rather than waiting on hardware. Nothing in Phase 11 changes how the player
plays: the bar gains a picture, and its seeking logic is PLAYER-06's.

**Implications**:
- **Phase 5's tests stay unchanged.** Any Phase 11 step that touches the bar must leave PLAYER-06's seek
  tests passing unchanged.
- **The roadmap still lists the owed items.** Phase 5 is not marked complete by this decision.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-120 — Prepare Shows a Transition Strip

**Status**: Approved · **Related**: DEC-107, DEC-111, DEC-112

**Decision**: The Prepare page shows the selected entry's waveform beside the next entry's, each with
its planned in and out times, in a strip under the Set's header.

**Reason**: The strip shows the one thing the table cannot: how one track ends and the next begins. A
waveform in every row would be too thin to read at a row's height.

**Implications**:
- **Opened from "View ▾," as the lanes are, and remembered.** The first time the page opens the strip
  is closed, so PREP-10's page-open row counts hold. With it open, the Set's rows are measured and held,
  as the lanes' are.
- **A precision on the option as asked:** its description said rows keep their height and seven stay on
  screen. The rows keep their height, and the seven hold as the page opens. With the strip open, the
  Set shows fewer, a count recorded when WAVE-07 measures it.
- **Planned times are text** as well as shading, because no picture is the only place a fact appears.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-121 — Phase 11 Is Waveforms Only

**Status**: Approved, then **superseded by DEC-124** (2026-10-05): the analysis also measures each
track's loudness. · **Related**: the Phase 19 audio-analysis item

**Decision**: The analysis measures nothing but the waveform. Loudness, BPM, key and every other
measurement from audio wait for Phase 19.

**Reason**: Measuring loudness now would take a Phase 19 decision early, before that phase has asked
what it is for.

**Implications**:
- **Phase 19 extends this job rather than starting another.** Its decoder and job are built to be
  extended.
- **The cost is one more pass over the library,** accepted.

**Decided with**: User · **Date**: 2026-09-29

---

## DEC-122 — Waveform Data Is Its Own Store, Keyed by File

**Status**: Approved · **Related**: DEC-009, DEC-076

**Decision**: Waveforms are kept in `waveforms.db`, a SQLite file in CuePoint's home beside
`cuepoint.db`.
- **Keyed by the file's path,** with its size, modified time and the analysis version recorded.
- **Kept out of** the launch backup, the support bundle and "Clear cache".
- **Rebuilt, never migrated:** a schema it does not know, or a store it cannot open, is set aside and
  rebuilt.
- **"Delete waveform data"** in Settings empties it.

**Reason**:
- **Not in the library database.** Every launch backup copies that database whole (DEC-009), and up to
  250 MB of data that can be rebuilt would multiply every backup's size.
- **Not in the cache folder,** where DEC-076 put artwork. "Clear cache on exit" would erase it at every
  exit, and an analysis takes hours rather than seconds to rebuild.
- **Keyed by file, not by track id.** A restored backup or a fresh import keeps every waveform, because
  the files did not change.
- **A cache needs no migrations.** When its schema changes it is rebuilt, so a later build can never
  get one wrong.

**Implications**:
- **The two databases can disagree.** A track whose file has no row is waiting. A row whose path no
  track has is pruned at the end of a full run.
- **A moved file is analysed again.** On a case-insensitive filesystem, two spellings of one path are
  two rows, which is harmless.
- **Deleting the data says what it costs:** its size and the time a new analysis takes.

**Decided with**: User (delegated: "take the most professional and better long term decisions") ·
**Date**: 2026-09-29


### Implemented (2026-09-30, WAVE-02) — the store, and one file's analysis

- **As decided,** keyed by the file's path, with its size, modified time and analysis version, and
  outside the launch backup, the support bundle and "Clear cache". Tests hold all three.
  - ADR-010 records the store; `PHASE11_WAVEFORMS.md` records the step.
  - "Delete waveform data" is a later step's.
- **Precision: an ordinary table, not `WITHOUT ROWID`.** It measured 10% smaller at 50,000 rows and
  three times as fast to read 200. The picture is the last column, so a state never reads it.
- **Precision: 16 KB pages.** At SQLite's 4 KB a page holds one picture, and 50,000 of them measured
  just over the 250 MB budget; 16 KB pages cut the waste from up to 46% to 19%.
- **Precision: beside the library database, wherever it is.** The store follows `database.path`, not
  only `CUEPOINT_HOME`.
- **Precision: corruption found in use is set aside at the next launch.** The store cannot be renamed
  under other threads' connections on Windows, so a marker condemns it. The WAL sidecars go aside
  with it, and only the newest copy is kept. A lock is never taken for corruption.
- **Precision: a stored picture answers first.** A track whose drive is unplugged still shows its
  picture. `missing` carries the file check's reason: `missing`, `unreadable`, `root_unavailable` or
  `no_path`.
- **Measured at 50,000 waveforms:** the store is 240.7 MB against a budget of 250 MB, and 200
  pictures take under 38 ms at p95 against 50 ms. `PHASE11_WAVEFORMS.md` has the full table.

---

## DEC-123 — The Engine Decodes Through the Player's `mpv`, and FFmpeg Splits the Bands

**Status**: Approved · **Related**: DEC-049, DEC-113, the Phase 19 audio-analysis item

**Decision**: Electron main passes the `mpv` path it resolved for the player to the engine as
`CUEPOINT_DECODER_PATH`. For each file, the engine runs one `mpv` child at lowered OS priority, with
the user's configuration and scripts turned off. FFmpeg's filters inside it downmix, split the bands,
rectify and reduce the audio to a small envelope, which the engine reduces again to 1,200 columns.
`numpy` is not added.

**Reason**:
- **The decoder is already shipped and licensed.** Adding FFmpeg or a Python audio stack would be a
  second decoder to fetch, verify and license.
- **The heavy work stays out of the engine.** Reducing inside FFmpeg keeps full-rate samples off the
  engine's CPU and out of its memory, and the lowered priority covers all of it.
- **Startup stays fast.** The engine ships as one file that unpacks at every launch, and `numpy` would
  add to that on every launch, for a job that does not need it.

**Implications**:
- **The exact-length path is required.** `mpv`'s encode mode pads its output, so the pipeline uses
  `--ao=pcm`. The channel order is proven with tones in CI, never assumed. Both were measured while the
  phase was specified.
- **Every argument is fixed.** The file path goes after `--`, as a local path only, and a playlist file
  is never opened.
- **WAVE-01 settles two details and records them in ADR-009:** how the samples leave `mpv` on Windows,
  and whether the final reduction stays in FFmpeg.
- **Phase 19 decides its own dependencies.** If it needs `numpy`, it brings that case with its own
  measurements.

**Decided with**: User (delegated: "take the most professional and better long term decisions") ·
**Date**: 2026-09-29

### Implemented (2026-09-30, WAVE-01) — the pipeline, and what `mpv` turned out to do

- **As decided,** with FFmpeg doing every calculation in the child and the engine taking square
  roots of a 150 Hz envelope. ADR-009 records the pipeline and the measurements, and `PHASE11_WAVEFORMS.md`
  records the step.
- **Precision: squared, not rectified.** `amultiply` measured twice as fast as `aeval=abs()`, and
  gives RMS once the engine takes the root. The values stay linear amplitude.
- **Precision: the log proves the output.** `mpv` writes info messages to standard output and exits 0
  when it drops a filter. So standard output carries only samples (`--terminal=no`), and `--log-file`
  must show `AO: [pcm] 150Hz quad 4ch float`, or the decoder is `decoder_missing` and no file is
  blamed.
- **Precision: `quad`, not `4.0`.** The `4.0` layout came out reordered, while `quad` keeps its order.
  CI proves the order with tones on the pinned builds (`--check-analysis`).
- **Precision: the downmix is normalised to unit gain,** since FFmpeg's default adds 3 dB to
  correlated stereo.
- **Precision: the transport.** A pipe on macOS and Linux, and a file in a private temporary folder on
  Windows. No named pipe is needed.
- **Precision: more isolation than `--no-config`.** It turns off resuming, saving, scripts,
  `youtube-dl` and the controller. The manifest names all seventeen options, and a test holds that
  list to the arguments passed.
- **Measured on Linux** (`mpv` 0.37, four cores):
  - 1.0–1.8 s per 6-minute track, and 67–94 MB per child;
  - the engine's search p95 with four analyses running stays within 0.98–1.25× idle;
  - the design not chosen measured 2.3–3.7× idle, and 1.4–2.8 s of the engine's own CPU per track.

  The pinned Windows and macOS timings are owed.

**Why the decision stands**: every measurement favoured decoding and reducing in the child, and none
needed `numpy`.

### Amended (2026-10-03, WAVE-03) — the pinned Windows build

- **The graph ends in the output's own format.** The pinned Windows `mpv` remixed the high band into
  the full and low bands when it converted FFmpeg's planar samples itself. `ANALYSIS_VERSION` is 2, so
  no waveform such a build stored counts again. ADR-009's amendment has the evidence.
- **The pipe transport is refused on Windows,** where it cannot work, rather than failing as the
  file's fault.
- **The engine's share is halved:** the parse runs at C level, bit-identical, still with no `numpy`.
  On Windows the engine asks for a 1 ms timer, so a request does not wait for the interpreter's lock
  in 15.6 ms steps while the analysis computes.

---

## DEC-124 — The Analysis Also Measures Loudness

**Status**: Approved · Implemented (WAVE-08, 2026-10-05) · **Supersedes**: DEC-121 · **Related**: DEC-116, DEC-122, DEC-123, Q-125

**Decision**: The pass that draws each track's waveform also measures its loudness, as Q-125's
Option B put it: the **integrated loudness** in LUFS (ITU-R BS.1770 with EBU R128's gating) and the
**peak**, shown read-only in the Inspector, a Library column and Prepare's transition strip. The user
revisited Q-125 after Phase 11 closed and chose B.

**Reason**: Decoding every file is the expensive part of the analysis, and it is already paid. A
DJ reads a track's loudness beside its shape: how hot a master is, and how far apart two tracks
in a transition sit. Measuring it later, as DEC-121 decided, would have cost a second pass over the
whole library anyway.

**Implications**:
- **Measured inside the same `mpv` child,** by FFmpeg's own `ebur128` filter at the head of
  DEC-123's graph, on the file's own channels and rate, before the downmix. The engine reads its
  one summary from the log the pipeline already reads. No new dependency, and the waveform is
  unchanged: `ANALYSIS_VERSION` stays 2. *As built:* every stored picture is the same byte for
  byte; an in-memory envelope value can differ in its last float bit (at most 7 × 10⁻⁷), since
  the meter hands the next filter doubles. A mono file is measured as it is played, on both sides
  (`dualmono`), so it reads as loud as the same music in stereo.
- **Precision: the sample peak, not the true peak.** Measured on the pinned Windows build over a
  six-minute track, the waveform alone took 0.92 s, with integrated loudness and the sample peak
  1.33 s (+45%), with the true peak instead 2.40 s (+160%). True peak's 4× oversampling would turn a
  50,000-track library's first analysis from about 6 hours into about 16. The sample peak says
  what a DJ asks of a peak, whether a master is driven to the top, for a third of that cost. True
  peak is deferred, recorded with its measured cost.
- **"Not measurable" is not a number.** `ebur128` reports -70.0 LUFS, its floor, for silence and
  for a file shorter than its 400 ms measuring block, and a peak of -inf for silence. Each is stored
  as no value with its reason, never as a level.
- **Measured, never applied.** The player does not change a track's gain: DEC-055 left volume
  normalisation to Phase 19 for want of exactly this data, and this decision measures it without
  taking that one. Nothing is written to Rekordbox, which has no field for it.
- **Kept in the waveform store,** in a table of its own created beside the waveforms, as the work
  list's index was (WAVE-03): an existing store gains it without a schema change and without
  losing a waveform (DEC-122's "rebuilt, never migrated" is not triggered).
- **Libraries already analysed are measured once more,** in the background: every waveform keeps
  drawing meanwhile, and files with no waveform at all still come first. At the measured rate that
  is about 8.7 hours for 50,000 tracks, once. *As built:* the library's rate measured 5,712 and
  5,977 six-minute tracks an hour, about 8.4 to 8.8 hours for 50,000, against about 8,400 an hour
  for the waveforms alone.
- **Phase 19** keeps BPM, key and every other measurement from audio, and the true peak and the
  loudness range if it wants them; it extends this job as DEC-121 intended.

**Decided with**: User · **Date**: 2026-10-05

---

## DEC-125 — Phases 19 and 20 Move to Future Releases

**Status**: Approved · Amended by DEC-146 (renumbered) · **Related**: DEC-019, DEC-055, DEC-074,
DEC-111, DEC-121, DEC-124, the roadmap's "not yet asked" audio-analysis item

**Decision**: Audio Intelligence (AUDIO-01…AUDIO-10) and Advanced Preparation (ADV-01…ADV-08) are
taken out of v1 and moved to future releases. Production Hardening is v1's final phase. *As
renumbered by DEC-146:* these are Phase 19, Phase 20 and Phase 18. Until then they were Phases 12,
13 and 14, and this decision said so.

**Reason**: v1 already covers the library, the player, organization, Clean, export, Discover,
Prepare and waveforms with loudness. What stands between that and a release is hardening, not more
features: packaged runs owed on Windows, macOS and Linux, Phase 5's manual acceptance, and the
cross-platform, recovery and scale checks Phase 18 lists. Neither moved phase has been specified, so
nothing designed or built is lost.

**Implications**:
- **The step IDs are kept.** The AUDIO and ADV IDs stay reserved for those phases. *Amended by
  DEC-146:* the numbers were at first kept too. They now follow the order of implementation, and
  every reference in the design docs was updated with them.
- **What was deferred to them moves with them.** "Phase 19's" in earlier decisions, specifications
  and ADRs now means a future release. That covers BPM and key from the audio (DEC-121, DEC-124),
  measured energy (DEC-111), volume normalisation (DEC-055, DEC-124), the true peak and loudness
  range (DEC-124), and acoustic fingerprinting (DEC-074). Those records stay as they were written;
  this decision is the pointer.
- **The audio-analysis scope question is not asked for v1.** It stays on the "not yet asked" list,
  to be asked in the decision round that opens Phase 19.
- **Nothing implemented changes.** WAVE-08's loudness stays measured and read-only, and the waveform
  analysis job stays built to be extended, as DEC-121 intended.
- **Owed acceptance items** from Phases 5 and 8 to 11 are still recorded where they are.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-126 — Sentry Captures Every Error, Everywhere

**Status**: Approved · **Related**: Q-126, DEC-127, DEC-128, Phase 13

**Decision**: Error reporting covers every part of the app that can fail:
- uncaught errors and crashes in the engine, Electron main and the renderer;
- the engine and the player exiting or restarting;
- every failed job;
- every logged error.

Each report carries the steps that led to it. There are no performance traces and no session
replay.

**Reason**: The user wants to see and fix everything that goes wrong. Errors with their steps
answer that. Traces add volume without errors, and replay would send the user's library as
pictures.

**Implications**:
- **One reporting setup per process,** all tagged with the same release and environment, so that an
  error that crosses the bridge reads as one story.
- **The renderer and main ship source maps** to Sentry at release, so that their stack traces read as
  source.
- **The Qt-era `utils/sentry_init.py` and `utils/error_reporting_prefs.py` are replaced,** not
  revived. They read consent through `QSettings`, and they send local variables.
- **Expected refusals are not errors.** A refusal the engine answers on purpose, such as a
  validation failure or a missing token, is not reported. Only failures the code did not mean to
  have are reported.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-127 — Reports Are Scrubbed Before They Leave the Machine

**Status**: Approved · **Related**: Q-127, DEC-126, DEC-128

**Decision**: Before a report is sent, the following are replaced:
- file paths;
- the user's name and home folder;
- track, artist, label and playlist names;
- notes and tags;
- tokens.

The code, the stack, the app's state and its settings are kept. Local variables are not sent.

**Reason**: Almost every error can be fixed from the stack and the state. Reporting on by default
(DEC-128) is only defensible if a report carries nothing personal.

**Implications**:
- **Scrubbing happens in each process before sending,** in one rule per language, held by tests over
  reports built from real failures.
- **A path keeps its shape.** Its extension and its depth stay, so "a `.flac` four folders deep"
  still helps debugging.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-128 — Reporting Is On by Default, Said in Settings and the Privacy Notice

**Status**: Approved · **Related**: Q-128, DEC-126, DEC-127

**Decision**: Error reporting is on from the first launch. A switch in Settings turns it off at once,
in every process. The privacy notice and `docs/policy/` say what is sent and how to turn it off.
There is no first-run notice. This goes against the recommendation of one.

**Reason**: The user's choice. With reports scrubbed (DEC-127), what is sent by default carries
nothing personal, and the switch and the notice say so.

**Implications**:
- **`PRIVACY_NOTICE.md` and `docs/policy/`** stop saying that v1.0 collects nothing, in the same
  step that turns reporting on.
- **Turned off means nothing is sent.** Reports are never queued for later, and a crash at start-up
  respects the stored choice.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-129 — macOS Ships as Two Downloads, Apple Silicon and Intel

**Status**: Approved · Amended by DEC-170 (unsigned; no Apple Developer account) · **Related**: Q-130, PLAYER-01, Phase 16

**Decision**: The Mac app is built, signed and notarized twice, once for Apple Silicon (arm64) and
once for Intel (x64). It is not a Universal build.

**Reason**: Many DJs still play from Intel MacBooks, and the Intel `mpv` is already pinned. Separate
builds avoid having to make the Python engine and every compiled dependency universal.

**Implications**:
- **CI builds on an Intel runner too.** The Intel build is checked there, since no Intel Mac is at
  hand.
- **The user guide's claim is corrected now.** `features.md` and `support-policy.md` say Apple
  Silicon only until the Intel build ships.
- **The download and the updater name the chip,** so that neither offers the wrong build.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-130 — Discover Is Revisited as a Review of the Page

**Status**: Approved · **Related**: Q-131, DEC-131, Phase 14

**Decision**: "Find what I like and what not" means a review. The Discover page is walked through
with the user, and each part is kept, changed or removed. No like or dislike feature is added.

**Reason**: The user's meaning.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-131 — Each Page Is Reviewed in Writing, Proposal by Proposal

**Status**: Approved · **Related**: Q-132, DEC-130, DEC-132

**Decision**: Each page gets a written review that covers:
- what the page does;
- what a new or non-technical user would not understand;
- proposed changes, each with a screenshot.

The user marks each proposal yes or no. Discover is reviewed this way too. The pages are:
- the Library, Clean, Discover, Prepare and Settings;
- the Inspector, the player bar, the status strip and the sidebar.

**Reason**: It turns "revisit" into decisions the user can make one at a time, as the rounds have
done.

**Implications**: The reviews go in Phase 14's specification. Only the accepted proposals become
steps.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-132 — The App Is Made Clear to New Users, as Well as the Site

**Status**: Approved · **Related**: Q-133, DEC-131, Phase 14, Phase 17

**Decision**: Clarity for new and non-technical users applies to the app and to the website. The app
gets:
- plain words throughout;
- empty states that say what to do next;
- background work explained as it happens;
- a short first-run guide.

**Reason**: The site brings people in, and the app has to keep them.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-133 — A Camelot Wheel in the Header, Lit and Filtering

**Status**: Approved · **Related**: Q-134, DEC-096, Phase 14

**Decision**: A pixel-art Camelot wheel opens from a button in the header beside global search, on
every page.
- It lights the selected or playing track's key, and the keys compatible with it by DEC-096's rule
  (the same key, one step either way, and the relative key).
- A key, clicked, filters the Library to it.

**Reason**: The header is on every page. Lighting the track's key makes the wheel a tool rather than
a poster.

**Implications**:
- **Compatibility comes from the engine's rule,** not a second copy in the renderer.
- **The filter is the Library's own** key rule.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-134 — Every Kind of Motion Is Built, Each Behind Its Own Switch

**Status**: Approved · **Related**: Q-135, DEC-135, Phase 14

**Decision**: All ten kinds of motion on the user's list are built:
- microinteractions;
- interaction animations;
- state transitions;
- page transitions;
- entrance and exit;
- hover and focus;
- scroll animations;
- loading;
- shared-element transitions.

Each kind has its own switch in Settings. The user tests them all and picks what stays on by
default. The recommendation was to leave out scroll animations and shared-element transitions.

**Reason**: The user's choice: judge the motion in the running app, not on paper.

**Implications**:
- **Every kind honors `prefers-reduced-motion`** and the switches, and no motion ever delays a click
  or a keypress.
- **The defaults are decided after testing,** and are recorded as an amendment here.
- **Motion runs on the compositor,** using transform and opacity only, so that scrolling 50,000 rows
  stays smooth. Phase 6's and WAVE-06's scroll checks are re-run with every kind on.

**Decided with**: User · **Date**: 2026-10-06


### Amended (2026-10-07, DEC-154) — the tenth kind is feedback

The list above names nine kinds. The tenth is **feedback**: a tick on save, a shake on a refused
value, a pulse on something new (DEC-154).

### Amended (2026-10-08, DEC-219) — the Set-entry shared-element transition is not built

Of the two shared-element transitions PAGES-12 named, only the search result into its Library row
is built. A Set's entry into the Inspector is not (DEC-219).

### Amended (2026-10-09, PAGES-13) — the defaults: every kind on

The user chose all ten kinds on by default, to judge each one in daily use and switch
off any that do not earn their place in Settings. The recommendation to leave scroll animations and
shared-element transitions off was not taken. Kinds a user already switched stay as they set them.

---

## DEC-135 — Motion Moves in Pixel Steps; Fades Stay Smooth

**Status**: Approved · **Related**: Q-136, DEC-010, DEC-134

**Decision**: Movement and scaling go in whole pixels and stepped frames, like a sprite's, short and
snappy. Opacity fades are smooth.

**Reason**: Stepped movement matches the pixel style (DEC-010), and a stepped fade looks broken.

**Implications**: Duration and step tokens join `tokens.css`, beside the integer scale, so that every
animation steps in the same pixels at 1×, 2× and 3×.

**Decided with**: User · **Date**: 2026-10-06

### Amended (2026-10-08, DEC-161) — four sizes

The steps hold at 1×, 1.5×, 2× and 3×: `--unit` is 6px at 1.5×, a whole pixel.

---

## DEC-136 — Statistics Shows Plays, Artists and Labels, the Never Played, Spreads and Health

**Status**: Approved · **Related**: Q-137, DEC-137, DEC-138, Phase 15

**Decision**: The Statistics page shows:
- **most played**, as a top 10, 25, 50, 100 or 200;
- **top artists and labels**, by the plays of their tracks;
- **tracks never played**;
- **how the library spreads** by genre, key (on the Camelot wheel), tempo, year, date added, rating
  and loudness;
- **library health**: missing files, matched to Beatport, and analysed.

**Reason**: The user's choice. Each is a query over data CuePoint already holds.

**Implications**:
- **Artists and labels use DISCOVER-03's credit index,** so "B" means B.
- **Loudness comes from the waveform store**, which is read beside the library, as WAVE-08's column
  does.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-137 — CuePoint Keeps the Play Count at Each Refresh

**Status**: Approved · **Related**: Q-138, DEC-136, LIBRARY-08

**Decision**: Every import and refresh stores each track's `PlayCount` with the date it was read, so
that Statistics can show the most played since a date. History starts with the first refresh after
the step. It cannot be recovered for earlier.

**Reason**: "What have I been playing lately" is the question a DJ asks most, and the XML holds only
a running total.

**Implications**:
- **Only changes are stored,** one row per track whose count moved, so that a refresh where nothing
  was played adds nothing.
- **A count that goes down is kept as it was read,** since Rekordbox can reset one. "Played since a
  date" never goes below zero.
- **It is user data.** It is in the backup, and a track's history goes with the track.

**Decided with**: User · **Date**: 2026-10-06

### Amended (2026-10-07, DEC-168) — history starts at the last import

The migration seeds a first reading from each track's stored count, dated the last import, so
history starts there rather than at the first refresh after the step.

---

## DEC-138 — Statistics Is Its Own Destination

**Status**: Approved · **Related**: Q-139, DEC-020

**Decision**: Statistics is a sidebar destination after Prepare, added through DEC-020's registry.

**Reason**: The page is large enough to be its own, and the registry adds a destination without
moving any other.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-139 — The Website: This Repository, Astro and Three.js, the App's Pixel Style in 3D

**Status**: Approved · **Related**: Q-140, DEC-132, Phase 17

**Decision**:
- **Where:** `apps/website/` in this repository, deployed to GitHub Pages by a workflow.
- **Built with:** Astro, with Three.js and scroll-driven WebGL scenes.
- **Look:** the app's pixel style in 3D, with voxels, pixel textures and the app's palettes.
- **Pages:**
  - home, features and download;
  - guide and FAQ;
  - changelog and privacy;
  - a blog.
- **Language:** English only.
- **Address:** GitHub Pages' own, with a custom domain added once one is bought.

**Reason**: The user asked for whatever gets the strongest "how did he make this" reaction. That
reaction comes from the WebGL scenes: custom shaders, voxel worlds and motion tied to scroll.
Three.js is the most capable way to build them. Astro serves every page as static HTML, so search
engines read all of it and it loads fast, and the 3D loads only where it is shown. Keeping the site
in this repository lets it use the app's palettes and the user guide's text without copying them.
The user left the build choice open, so it was decided under the standing instruction to take the
most professional, long-term choice.

**Implications**:
- **The site's address is one setting.** The canonical links, `sitemap.xml` and `robots.txt` all
  come from it, so moving to a custom domain loses no search standing.
- **Every 3D scene has a still fallback** for slow phones, for no WebGL and for reduced motion.
- **The guide is built from `docs/user-guide/`,** not rewritten beside it.
- **`gh-pages-root/` retires** when the new site is first deployed.

**Decided with**: User (the build choice under the standing instruction) · **Date**: 2026-10-06

---

## DEC-140 — Phases 13 to 17 Run One at a Time, Then Phase 18

**Status**: Approved · Amended by DEC-146 (renumbered; Phase 12, the cleanup, runs first) ·
**Related**: Q-141, DEC-125

**Decision**: The order is:
1. Phase 13, Error Reporting;
2. Phase 14, the Pages Revisited;
3. Phase 15, Statistics;
4. Phase 16, Distribution;
5. Phase 17, Website;
6. Phase 18, Production Hardening.

Each opens with its specification, as every phase has.

**Reason**: One phase at a time, as every phase so far has gone.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-141 — The Website's Release Checklist, Each Item Held by a Check

**Status**: Approved · **Related**: DEC-139, Q-145, Phase 17

**Decision**: The site does not launch until every item below holds. Wherever a machine can check an
item, CI checks it on every build.

| Item | How it holds |
| --- | --- |
| `sitemap.xml`, `robots.txt` | Generated from the pages at build; `robots.txt` names the sitemap |
| `noindex` | Only on the 404, form thank-you pages and preview builds; CI fails if a content page carries it (Q-145) |
| Meta title, meta description, canonical tag | Required by every page's layout, so a page without them does not build; titles and descriptions unique, checked in CI |
| One `h1`, heading hierarchy | Checked on every built page in CI |
| Alt text | Required on every image by the image component; decorative images marked as such |
| Schema markup | JSON-LD: `SoftwareApplication`, `Organization`, `WebSite`, `FAQPage`, `BlogPosting`, `BreadcrumbList`, validated in CI |
| Internal links, broken links | Related pages linked from each page; every link, internal and external, checked in CI and weekly |
| Core Web Vitals, performance | Budgets of LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 on a mid-range phone, held by Lighthouse CI. The 3D loads after the page is usable, never in the way of the first paint |
| Mobile responsiveness | Every page checked at phone, tablet and desktop widths in CI |
| HTTPS everywhere | GitHub Pages' enforced HTTPS, and no `http://` link or asset, checked in CI |
| OG image, social share | An image per page (generated at build) with Open Graph and X card tags; share links on blog posts |
| Favicon | Every size and the web manifest, from the app's icon |
| Verified with search engines | Google Search Console and Bing Webmaster Tools by meta tag, moved to DNS when a domain is bought; the user owns both accounts |
| Backlink strategy | A written plan in the site's docs: where CuePoint belongs (DJ communities, directories, launch sites, GitHub) and what is offered there. The user carries it out |
| Privacy policy, terms page | Pages of their own, naming the user (DEC-144), the analytics (DEC-142) and the form service (DEC-143) |
| Cookie consent | DEC-142 |
| Clear call to action | One primary action per page, "Download for <your system>", above the fold |
| Custom 404 | In the site's style, with search and the main links |
| Accessibility | WCAG 2.2 AA, checked by axe in CI and by keyboard and screen reader before launch |
| Forms tested | DEC-143 |

**Reason**: Each item is cheap when it is built in, and expensive when it is found missing after
launch. A check in CI keeps an item true after the first release.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-142 — Cookieless Analytics, With Consent Built In

**Status**: Approved · **Related**: Q-142, DEC-141

**Decision**: The site counts visits, sources and downloads with privacy-friendly analytics that set
no cookie. No consent banner is shown, since none is needed. A consent component is built anyway, and
turns on by itself if anything ever sets a non-essential cookie.

**Reason**: It answers what the backlink plan and the site need to know, with no banner in the way of
the first impression, and keeps the privacy policy short and true.

**Implications**: The service is chosen in Phase 17's specification, among Plausible, Umami and
Cloudflare Web Analytics, and named in the privacy policy.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-143 — Two Forms: Contact and Bug Report

**Status**: Approved · **Related**: Q-143, DEC-126, DEC-141

**Decision**: The site has a contact and feedback form and a bug-report form. Both are sent through a
form service, since GitHub Pages is static. There is no newsletter.

**Reason**: The user's choice.

**Implications**:
- **Spam protection** without a puzzle where possible, through a hidden field and the service's own
  filtering.
- **Tested before launch and in CI:**
  - each field's validation;
  - the error states;
  - the thank-you page;
  - delivery, against the service's test mode.
- **The bug form asks for the app version and system,** and says that the app also reports errors on
  its own (DEC-126).

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-144 — The User Is the Publisher

**Status**: Approved · **Related**: Q-144, DEC-141

**Decision**: The privacy policy and the terms name the user, as an individual, as the publisher and
the contact.

**Reason**: The user's choice.

**Implications**: The two pages are drafted in Phase 17 from what the app and the site actually do,
and the user approves the final text before launch.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-145 — The Auto-Updater: A Test Build Takes the Newest Test or Normal Release; a Normal Build Only Normal

**Status**: Approved · Mechanism settled by DEC-169 and DEC-170 · **Related**: Q-129, DEC-019, DEC-129, Phase 16 · **Supersedes**: the test-only
track of `docs/release/design-two-appcast-feeds-test-stable.md`

**Decision**: The installed build's own version decides what it may be offered.

| Installed build | Offered | Never offered |
| --- | --- | --- |
| **Test** (e.g. `1.4.0-test.2`) | The highest version newer than itself, test or normal | Anything older or equal |
| **Normal** (e.g. `1.4.0`) | The highest normal release newer than itself | Any test release |

- **Versions are compared by SemVer precedence,** prerelease included. `1.4.0-test.2` is older than
  `1.4.0-test.3`, and both are older than `1.4.0`. So a test of 1.4.0 is offered the real 1.4.0 when
  it comes out.
- **The highest version wins.** For example:
  - on `1.4.0-test.2`, with `1.4.0` and `1.5.0-test.1` out, `1.5.0-test.1` is offered;
  - with `1.4.0-test.3` and `1.4.0` out, `1.4.0` is offered.
- **A test user who takes a normal release becomes a normal user.** That build is normal, so it is
  offered only normal releases from then on. Testing again means installing a test build by hand.
- **A test build is only ever installed by hand.** Test releases are GitHub pre-releases. The website
  offers only normal releases, and no setting lets a normal build receive tests.
- **Test versions are named `X.Y.Z-test.N`,** with a dot, so that `test.10` follows `test.9`.
- **Updates download in the background.** Then "Update ready" shows that version's release notes
  with **Restart now**, and otherwise the update installs at the next quit.
- **The app checks** at launch, every 4 hours while open, and from a **Check for updates** button in
  Settings.
- **There is no switch to turn updates off,** and no skipping a version.
- **Windows and macOS only.** Each Mac gets its own chip's build (DEC-129). Windows updates ship
  unsigned for now, with SmartScreen's warning accepted. Linux AppImages are updated by hand.

**Reason**: The user's rules:
- a test build can move up to a newer test or to a normal release;
- a normal build never moves to a test.

The old design kept test builds on the test feed alone. It compared only `X.Y.Z`, so `1.0.0-test1`
was never offered `1.0.0-test2`, or `1.0.0` itself.

**Implications**:
- **The rule is one pure function** of the installed version and the published releases, with a
  test for every row above. It runs in Electron main, which owns installs.
- **Every download is verified before it runs:** HTTPS only, with the checksum the release
  publishes (the old verifier's two properties). An update never goes to a lower version.
- **The release workflow publishes both kinds.** A tag `vX.Y.Z-test.N` makes a pre-release, and
  `vX.Y.Z` a normal release. Normal releases are published so that test builds can see them too,
  and a normal build's check never reads a test entry.
- **`src/cuepoint/version.py`'s `1.0.0-feb1` and `1.0.0-test1.0`** are renamed to the scheme in the
  same phase. `version_utils`' base-only comparison is not reused.
- **The mechanism** (for example `electron-updater`'s channels, or the existing Sparkle appcasts) is
  chosen in Phase 16's specification, held to this table.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-146 — Phase Numbers Follow the Order of Implementation; Cleanup Is Phase 12

**Status**: Approved · **Amends**: DEC-125, DEC-140 · **Related**: Q-146…

**Decision**: Phases are numbered in the order they are built, and a cleanup phase comes first.

| Phase | Was | Is |
| --- | --- | --- |
| 12 | (new) | Cleanup: repository, dead code and docs |
| 13 | 15 | Error Reporting |
| 14 | 16 | The Pages Revisited |
| 15 | 17 | Statistics |
| 16 | 18 | Distribution |
| 17 | 19 | Website |
| 18 | 14 | Production Hardening, v1's last phase |
| 19 | 12 | Audio Intelligence, a future release |
| 20 | 13 | Advanced Preparation, a future release |

**Reason**: The user asked for numbers that read as the order of work. Cleanup goes first:
- every later phase then works in a smaller codebase and a smaller set of docs;
- the Qt-era Sentry and consent modules are removed before Phase 13 replaces them;
- the docs each later phase updates are already the ones that will remain.

**Implications**:
- **Every phase number in the design record was rewritten in one pass:** `docs/v1/`, ADR-009 and the
  decisions above. "Phase 19's" in DEC-055, DEC-074, DEC-111, DEC-121 and DEC-124 now names Audio
  Intelligence, which those decisions had called Phase 12. DEC-125 is amended to say so.
- **Step IDs do not change.** AUDIO and ADV stay reserved, and the new phases' IDs are chosen in
  their specifications.
- **DEC-140's order holds,** with Phase 12 before it: 12, 13, 14, 15, 16, 17, then 18.

**Decided with**: User (the renumbering, and adding the cleanup); the cleanup's place, under the
standing instruction · **Date**: 2026-10-06

---

## DEC-147 — How the Cleanup Decides What Goes

**Status**: Approved · **Related**: Q-146…Q-150, DEC-146, Phase 12

**Decision**:
- **An audit comes first, approved by group** (Q-146). Every candidate is listed with its evidence:
  - its callers (none);
  - its tests;
  - what replaced it.

  Candidates are grouped: Qt, `update/`, `incrate/`, scripts, workflows, tests, the repository root
  and docs. The user approves or strikes a group or a single item, and only then is anything
  deleted.
- **The design record stays** (Q-147). `docs/v1/` and the ADRs are kept. `docs/ui-overhaul/tracking/`,
  `docs/development/archive/` and other superseded plans are deleted, and git history keeps them.
- **Qt goes entirely** (Q-148). Every PySide6 import goes, along with `compat/`, `src/gui_app.py`,
  the Qt tests, `requirements-qt.txt` and the Qt rows of AGENTS.md. *Corrected while specifying
  (PHASE12_CLEANUP.md, fact 4):* `src/gui_app.py` launches Electron and is not Qt, so whether it
  stays is the audit's repository question. `check_no_qt_in_core.py`
  widens to the whole of `src/` and stays, so that Qt cannot return. The CLI is kept.
- **The old release workflows go if the audit confirms they are dead** (Q-149):
  `build-macos.yml`, `build-windows.yml`, `release.yml`, and the Sparkle feed scripts that only they
  call. Until Phase 16, releases are built by `desktop-electron.yml`.
- **Untracked local files are left alone** (Q-150). The cleanup covers only what git tracks.

**Reason**: The user's answers. Each keeps a deletion reviewable, which is how AGENTS.md asks for
removals: a caller search first, and the evidence recorded.

**Implications**:
- **Every check runs before and after,** and nothing a user relies on changes: the CLI and its
  flags, the engine API, config keys and user data.
- **Docs that remain are updated in the same phase** to describe the app as it is. That includes
  README, AGENTS.md's map, the developer setup, the user guide's index and the release runbooks.

**Decided with**: User · **Date**: 2026-10-06

---

## DEC-148 — Two Sentry Projects: the Existing Python One for the Engine, a New Electron One for the App

**Status**: Approved · **Related**: Q-151, DEC-126, Phase 13

**Decision**: The engine reports to the existing Python project in the EU, the one the Qt app used.
Electron main and the renderer report to a new Electron project. Both share the release name and
trace id (DEC-126).

**Reason**: The user's choice, as recommended. Each platform gets the grouping and source-map handling
Sentry builds for it, and the engine's earlier history stays in one place.

**Implications**:
- **The user provides** both DSNs and a `SENTRY_AUTH_TOKEN` repository secret before REPORT-07
  and REPORT-08.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-149 — No Native Crash Dumps

**Status**: Approved · **Related**: Q-152, DEC-127, Phase 13

**Decision**: No minidumps are sent from Electron or mpv. A process that is gone is reported as an
event with its reason and exit code.

**Reason**: The user's choice, as recommended. A dump holds part of the process's memory, which can
include paths and track names and cannot be scrubbed (DEC-127).

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-150 — Runs From Source Send Nothing Unless a Developer Opts In

**Status**: Approved · **Related**: Q-153, DEC-126, Phase 13

**Decision**: Only packaged builds send reports. A run from source sends only when
`CUEPOINT_SENTRY_DSN` is set by hand, tagged `development`.

**Reason**: The user's choice, as recommended. Development errors do not mix with users'.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-151 — The CLI Does Not Report

**Status**: Approved · **Related**: Q-154, DEC-126, Phase 13

**Decision**: The CLI sends no error reports. An engine started without Electron's environment
reports nothing.

**Reason**: The user's choice, as recommended. DEC-126 names the engine, main and the renderer, and the
CLI has no Settings switch to turn reporting off.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-152 — "Report a Problem" Is Built in Phase 13

**Status**: Approved · **Related**: Q-155, DEC-126, Phase 13

**Decision**: Help gains **Report a problem**: a note, the app's version and the last report's id,
sent as Sentry user feedback. The note is sent as the user wrote it, and the dialog says so. Built in
REPORT-06.

**Reason**: The user's choice, as recommended. It lets a user say what they were doing when a report
alone does not.

**Implications**:
- **It respects the switch.** With reporting off, the action is disabled and says why.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-153 — A Job That Fails on a Cause the User Owns Is a Refusal

**Status**: Approved · **Related**: Q-156, DEC-126, Phase 13

**Decision**: A job that fails on a cause the user owns (a rejected Beatport token, an unplugged
drive, a moved XML file) is not reported. Those error codes are listed in one place, each added on
purpose with a test. Every other failed job is reported.

**Reason**: The user's choice, as recommended. It keeps Sentry a list of bugs, and the activity feed
already shows the user what happened. It applies DEC-126's rule that expected refusals are not
errors.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-154 — The Tenth Kind of Motion Is Feedback

**Status**: Approved · **Related**: Q-157, DEC-134, DEC-135, Phase 14

**Decision**: DEC-134's tenth kind of motion is **feedback**: motion that confirms or warns. A tick
when a setting is saved, a short shake when a value is refused, a pulse on something new (a finished
job, a new search result). It has its own switch, like the other nine.

**Reason**: The user's choice, as recommended. DEC-134 named ten kinds and listed nine, and the
user's original list is not recorded. Feedback has the most honest uses here (SET-10's "Saved" tick,
refused times and BPMs in Prepare) and does not overlap the other nine.

**Implications**:
- **DEC-134's list is ten** with this one; its stable id is `feedback` (`PHASE14_PAGES.md`,
  PAGES-02).
- **A shake moves in whole pixels** like any other movement (DEC-135).

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-155 — The App Does Not Say "Engine" or "Jobs"

**Status**: Approved · **Related**: Q-158, DEC-132, STR-1, Phase 14

**Decision**: No user-visible text says "engine" or "jobs". The status strip says "Ready", "Starting
up…", "Reconnecting… (attempt 2 of 3)" and "CuePoint's library service stopped" with **Restart**,
and shows nothing when idle. Running work is "background work". The version moves to Help → About and
Settings → About & updates. The raw error moves to the hover title and Diagnostics.

**Reason**: The user's choice, as recommended. The strip is on screen all the time, and nothing the
user does needs the word (DEC-132).

**Implications**:
- **Every end-to-end spec that waits on "Engine connected"** moves to `waitForEngine()` first, in a
  commit of its own (PAGES-03).
- **Developer surfaces keep the word:** the CLI, logs, Diagnostics and the docs for developers.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-156 — Collections Is Nested Under Library in the Sidebar

**Status**: Approved · **Related**: Q-159, DEC-062, NAV-3, Phase 14

**Decision**: The sidebar's **Collections** entry stays, indented under **Library** as a way into
it, rather than as a second top-level destination.

**Reason**: The user's choice, as recommended. It keeps DEC-062's one-click way to Collections, and
the indent says it is part of the Library.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-157 — The Wheel Lights the Selected Track, Else the Playing One

**Status**: Approved · **Related**: Q-161, DEC-133, Phase 14

**Decision**: When a track is selected, the Camelot wheel lights its key and the keys compatible with
it. With nothing selected, it lights the playing track's. The wheel's caption names which track it
shows.

**Reason**: The user's choice, as recommended. Selecting is the deliberate act, and the player bar's
key (BAR-5) opens the wheel for the playing track.

**Decided with**: User · **Date**: 2026-10-07

### Precision (2026-10-08) — the player bar's key

This rule is the header's wheel. The wheel opened from the player bar's key (BAR-5) lights the playing
track, and its caption says "Playing: …", since that is the key the user clicked.

---

## DEC-158 — The App Is Written in American English

**Status**: Approved · **Related**: Q-162, DEC-132, Phase 14

**Decision**: Every user-visible string uses American spelling: "Favorite", "organize", "color",
"analyze", "Analyzing waveforms". The user guide follows.

**Reason**: The user's choice, as recommended. Beatport, Rekordbox and most DJ software use American
English, and today the app mixes the two.

**Implications**:
- **Labels only.** Field ids, storage keys and config keys keep their spelling
  (`cuepoint-waveform-colour`, the `colour` field), so nothing stored changes.
- **Each Phase 14 step** respells the strings on its own surface; PAGES-13 checks the rest.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-159 — Phase 14's Proposals: the Recommendation on Every One

**Status**: Approved · **Related**: DEC-131, Phase 14

**Decision**: The user took the recommendation on every proposal in `PHASE14_REVIEWS.md`. 100 are
accepted. Four are declined:
- **NAV-4,** count badges in the sidebar: it needs a new engine count, and CLN-3's tab counts show
  the same on the page.
- **STR-4,** a toast the first time each kind of background work runs: an import starts five at
  once.
- **BAR-6,** the reason for a missing waveform written in the seek area: it reverses WAVE-06, and
  BAR-7's plain words in the hover title are enough.
- **BAR-10,** a "how to play" hint: RUN-1 and RUN-3 say it.

NAV-3 and STR-1 are settled by DEC-156 and DEC-155. HDR-4 is DEC-133's placement.

**Reason**: The user's choice.

**Implications**: Each mark is recorded beside its proposal. Only the accepted proposals are built,
in the steps `PHASE14_PAGES.md` names for them.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-160 — A Click on the Camelot Wheel Replaces the Library's Filter

**Status**: Approved · **Related**: DEC-133, DEC-157, Q-160, PAGES-10

**Decision**: Clicking a key on the wheel opens the Library on all tracks in that key. The Library's
search and rules are cleared and replaced by one key rule. There is no **All N lit keys** button.

**Reason**: The user's choice. "Show me what mixes with this" is a fresh question, and carrying an
old filter along would hide tracks without saying so. The user declined the extra button the
recommendation added.

**Implications**: PAGES-10 navigates to `/library` with `libraryRulesState` holding only the
`key any_of <spellings>` rule. To see several lit keys at once, the DJ adds them in the Library's own
filter.

**Decided with**: User · **Date**: 2026-10-07

### Precision (2026-10-08) — what "the filter" covers

The click replaces the Library's whole view: its search, its rules, the quick-filter chips (FLW-4)
and the open playlist or Collection, so the result is every track in that key. Each key on the wheel
says so in its name ("9A: show every 9A track in the Library").

---

## DEC-161 — A 1.5× Size, and It Is the Default

**Status**: Approved · **Related**: SET-4, DEC-159, Phase 1 DS-2 (integer pixel scale), PAGES-01

**Decision**: The size setting offers 1×, 1.5×, 2× and 3×, and 1.5× is the default for anyone who
has not chosen. Labels: "Small (1×)", "Medium (1.5×) — default", "Large (2×)", "Extra large (3×)".

**Reason**: The user's choice: 2× is too large as a default and 1× too small.

**Implications**:
- **Amends DS-2's whole-number scale.** At 1.5× a 1px line would be 1.5px and blur, so edge tokens
  (borders, bevels, focus rings, shadows) round to whole pixels. Lines may differ by a pixel from a
  strict 1.5× of their 1× width; the pixel look holds because no edge is fractional.
- A stored choice is kept. Only a fresh install, or one that never picked a size, opens at 1.5×.
- Built in PAGES-14, after PAGES-01's Size control. The storage key stays `cuepoint-ui-lab-scale`.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-162 — Statistics Can Be Narrowed to a Collection or a Rekordbox Playlist

**Status**: Approved · **Related**: Q-163, Q-137, DEC-136, STATS-02, STATS-04

**Decision**: One picker at the top of the Statistics page narrows every section to the whole library,
a Collection (plain or Smart) or a Rekordbox playlist. The Library's filter gains a **Rekordbox
playlist** field, so a narrowed number still opens exactly its tracks.

**Reason**: The user's choice, as recommended. Q-137 proposed the scope and DEC-136 did not say. "What
do I play most from this playlist" is the natural question, and the new field is useful in the
Library on its own.

**Implications**:
- **A new filter field,** `playlist` (`in_playlist`, over `rekordbox_playlist_tracks`), built in
  STATS-02. Stored rules that do not use it are unchanged.
- **Every route takes `scope`,** and every rule set it returns carries the scope's own rule.

**Decided with**: User · **Date**: 2026-10-07

### Amended (2026-10-08, DEC-199) — one playlist field

The playlist field is Phase 14's "In playlist" (FLW-7), built in PAGES-05 with any mix of playlists,
Collections and Sets as its value. Statistics uses that field and label rather than adding its own.

---

## DEC-163 — Clean Keeps Its Health Tab; Statistics Shows a Summary

**Status**: Approved · **Related**: Q-164, DEC-136, PAGES-07, STATS-07

**Decision**: Clean keeps its Health tab with every check. Statistics shows a health summary (files,
Beatport, waveforms) whose counts open the Library and which links to Clean's tab with **All health
checks**.

**Reason**: The user's choice, as recommended. Problems are fixed in Clean; Statistics answers "how is
my library", and a summary does that.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-164 — A Track With No Play Count Is "Plays Unknown", Not Never Played

**Status**: Approved · **Related**: Q-165, DEC-136, m0005

**Decision**: "Never played" counts only tracks whose play count is zero. Tracks whose export has no
`PlayCount` are shown on their own line, **Plays unknown**, and open in the Library with `play count
is empty`.

**Reason**: The user's choice, as recommended. m0005 stores a missing count as unknown on purpose;
counting it as zero would say something the export never said.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-165 — A Remix Counts Toward Its Remixer's Plays

**Status**: Approved · **Related**: Q-166, DEC-136, DISCOVER-03

**Decision**: Top artists sum the plays of every track crediting them as artist **or** remixer, once
per track, as the Library's artist filter matches both.

**Reason**: The user's choice, as recommended. A row's number and the tracks it opens then agree.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-166 — "Since" Offers Presets and a Date

**Status**: Approved · **Related**: Q-167, DEC-137, STATS-02, STATS-05

**Decision**: Most played can be shown since your last refresh (the plays that refresh found), the
last 7, 30 and 90 days, the last year, all time, or a date the user picks.

**Reason**: The user's choice, as recommended. "Since my last refresh" and "last month" are the
questions asked most, and presets answer them in one click.

**Implications**: "Since your last refresh" is asked by read, not by date (`since_read`), so two
refreshes on one day stay apart. Every choice is as fine as the refreshes, and the page says so.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-167 — A Top List Can Be Kept as a Collection

**Status**: Approved · **Related**: Q-168, DEC-136, STATS-05

**Decision**: **Keep as Collection** on the most-played list makes a plain Collection of those tracks
in rank order, named for the list ("Most played since Sep 1, 2026 (top 50)"). It is a snapshot and
does not change when plays change.

**Reason**: The user's choice, as recommended. It turns "what I play most" into a crate. A Collection
that updates itself is not possible: "top N" and "since" are not filter rules.

**Implications**: A new atomic engine route, `POST /api/v1/collections/create-from`, makes the
Collection and adds its tracks in one transaction (STATS-05).

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-168 — Play History Is Seeded From the Last Import

**Status**: Approved · **Related**: Q-169, DEC-137, STATS-01

**Decision**: The migration that adds play history keeps every track's known play count as a first
reading, dated the library's last import. History therefore starts at the last import before
STATS-01, not at the first refresh after it.

**Reason**: The user's choice, as recommended. It costs nothing and keeps the plays between that
import and the first refresh after updating, which would otherwise be lost.

**Implications**: Amends DEC-137's start. With no library imported, there is nothing to seed, and
history starts at the first import.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-169 — CuePoint's Rule Picks the Release; electron-updater Installs It on Windows

**Status**: Approved · **Related**: Q-170, DEC-145, DIST-05, DIST-06

**Decision**: The app reads GitHub's release list and chooses the release with DEC-145's one pure
function. On Windows, `electron-updater` is then pointed at that release alone, and downloads,
checks and installs it, with block maps so only what changed is downloaded. Its own release
choice is never used. macOS installs as DEC-170 says.

**Reason**: The user's choice, as recommended. `electron-updater`'s own GitHub channels pick the
newest-published release, not the highest version, so they cannot follow DEC-145 on their own.

**Implications**: DIST-05 (the rule and the release list) and DIST-06. Sparkle appcasts are not
revived.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-170 — The Macs Ship Unsigned and Replace Themselves at Quit, as the Retired App Did

**Status**: Approved · **Related**: Q-171, DEC-129, DEC-145, DEC-019, DIST-04, DIST-06 ·
**Amends**: DEC-129 ("signed and notarized")

**Decision**: There is no Apple Developer account, so neither Mac build is signed with a Developer
ID or notarized; electron-builder's ad-hoc signature is kept. The Macs update the way the retired
Qt app did, without Squirrel.Mac: the app downloads its chip's build itself, and the new app
replaces the old one where it is installed, then opens.

**Reason**: The user's choice ("do whatever we did in the past updater"). Squirrel.Mac, which
`electron-updater` uses on macOS, refuses an update for an unsigned app. The retired app's
installer (`update/update_installer.py`, `_install_macos`, removed in b864019) mounted the DMG,
deleted `/Applications/CuePoint.app`, copied the new app in, opened it and exited. A file the app
downloads itself carries no quarantine flag, so Gatekeeper does not stop the new copy.

**Implications**:
- **Made safer than before** (DIST-06):
  - the zip, not a mounted DMG;
  - the SHA-512 and size checked against the release's manifest;
  - the version and chip checked in the bundle;
  - the swap done by a small script only after the app has quit, with the old bundle restored if
    the swap fails;
  - the app replaced where it is installed, not always in `/Applications`.
- **When the app's folder cannot be written,** or the app runs from the DMG or translocated, it
  offers **Download** instead of installing.
- **The first install is by hand,** with the quarantine flag cleared as the user guide says.
  Updates after that need nothing.
- **The release workflow does not sign or notarize.** The signing hooks stay as no-ops without
  credentials, and key-management says what an Apple Developer account would change: sign,
  notarize and move the Macs to `electron-updater`.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-171 — "Update Ready" Is a Quiet Item in the Status Strip

**Status**: Approved · **Related**: Q-172, DEC-145, DIST-07

**Decision**: When an update has downloaded, the status strip shows "CuePoint X is ready". It
opens a panel with the release notes, **Restart now** and **Later**, and it stays until the update
installs.

**Reason**: The user's choice, as recommended. It never interrupts a set being prepared. Toasts
vanish after 4 s and hold no buttons.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-172 — "What's New" Shows Once After an Update

**Status**: Approved · **Related**: Q-173, DIST-06, DIST-07

**Decision**: On the first launch after an update, that version's notes are shown once and
dismissed with **Got it**. They are not shown on a first install. They can be read again from
Settings › About & updates.

**Reason**: The user's choice, as recommended. An update that installed at quit was never seen.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-173 — Restart Now Asks First While Work Is Running

**Status**: Approved · **Related**: Q-174, DIST-06

**Decision**: If work is running (waveform analysis, matching, an export), **Restart now** asks
first and names the work. It offers **Restart when done**, **Restart now** and **Cancel**.

**Reason**: The user's choice, as recommended. It is the one quit the user may not think of as one.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-174 — Linux Is Told a New Version Is Out

**Status**: Approved · **Related**: Q-175, DEC-145, DIST-05…DIST-07

**Decision**: Linux uses the same rule and says "CuePoint X is out", with **Download**, which opens
the release page. Nothing downloads or installs. DEC-145's "by hand" holds.

**Reason**: The user's choice, as recommended.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-175 — CuePoint Keeps Its Own Copy of Each Pinned mpv

**Status**: Approved · **Related**: Q-176, DEC-049, DIST-04

**Decision**: Each pinned mpv archive is also attached, unchanged and with the same SHA-256, to a
CuePoint release of its own (`sidecar-mpv-<version>`). Builds fetch it from there first, and from
mpv's rolling release second.

**Reason**: The user's choice, as recommended. mpv republishes its rolling tag, and a pinned file
vanished on 2026-10-07. With a copy, a tag builds on any day.

**Implications**: The mirror is made once per re-pin, from the owner's machine, since the cloud
cannot reach mpv's releases. The GPL source link is unchanged.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-176 — The First Version Is 1.0.0-test.1

**Status**: Approved · **Related**: Q-177, DEC-145, DIST-01

**Decision**: `version.py`'s `1.0.0-feb1` becomes `1.0.0-test.1`. Test versions count up `test.N`
until Phase 18 ends with `1.0.0`.

**Reason**: The user's choice, as recommended. Everything before v1 is a test of v1, and normal
users are only ever offered `1.0.0` and later.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-177 — Test Tags From Any Branch, Normal Tags Only From main

**Status**: Approved · **Related**: Q-178, DIST-04

**Decision**: The release workflow builds a `vX.Y.Z-test.N` tag on any branch. It builds a
`vX.Y.Z` tag only on a commit that `main` contains.

**Reason**: The user's choice, as recommended. Work lives on `feature`, and a normal release should
be what `main` holds.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-178 — Release Notes Come From the Changelog

**Status**: Approved · **Related**: Q-179, DIST-04, DIST-07

**Decision**: The release workflow copies the version's section of `docs/release/CHANGELOG.md`
into the GitHub release. "Update ready" and "What's new" show the same text. A tag with no section
fails before anything is built.

**Reason**: The user's choice, as recommended. The changelog is already checked in CI, so the
release needs no manual step.

**Decided with**: User · **Date**: 2026-10-07

## DEC-179 — Backups Live in Their Own Settings Section

**Status**: Approved · **Related**: Q-190, HARDEN-01, DEC-009, PAGES-01

**Decision**: Settings gets a **Backups** section, before About & updates: the list of backups with their date, size and reason, **Back Up Now**, **Restore** on each row, and **Show in folder**. Restore asks first, and while work runs it asks as Restart now does (DEC-173).

**Reason**: The user's choice, as recommended. A restore has to show which copy is which, and a section has room for the list. Menu shortcuts can be added later.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-180 — A Copy Is Kept From Just Before Every Upgrade

**Status**: Approved · **Related**: Q-191, HARDEN-01, DEC-009, DIST-08

**Decision**: When migrations are pending at launch, CuePoint takes one `pre-upgrade` copy, naming both app versions, instead of that launch's ordinary backup. Pre-upgrade copies are kept apart from the five launch copies, and the last 3 are kept. Without room for the copy, the upgrade does not run.

**Reason**: The user's choice, as recommended. It is the one copy that undoes a bad release, which Phase 16's rollback relies on, and it costs one file per upgrade.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-181 — The Library Is Checked After a Crash and Weekly

**Status**: Approved · **Related**: Q-192, HARDEN-03

**Decision**: SQLite's `quick_check` runs on the library after an unclean exit and once every 7 days, in the background after the window shows. Damage found mid-session also marks the library damaged.

**Reason**: The user's choice, as recommended. Damage is most likely after a crash or power cut, and a weekly check finds the rest. Neither delays opening the app.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-182 — A Library That Can't Open Gets a Recovery Screen

**Status**: Approved · **Related**: Q-193, HARDEN-03, DEC-126, DEC-153

**Decision**: A damaged, too-new or half-upgraded library shows a full-window screen that says which, in plain words, and offers the latest good backup, another backup, the file's folder and "Report this problem". Damaged and upgrade-failed are reported; too-new and disk full are not.

**Reason**: The user's choice, as recommended. The moment the library won't open is the moment a backup matters, and Settings may not be reachable then.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-183 — Tags Are Written to a Copy, Checked, Then Swapped In

**Status**: Approved · **Related**: Q-194, HARDEN-04, DEC-070

**Decision**: Every tag write and tag restore writes a copy of the audio file in the same folder, checks that its audio frames are unchanged and its tags read back, then replaces the original in one step. A file without room for the copy, or held open by another program, fails before it is touched.

**Reason**: The user's choice, as recommended. A DJ's audio files are the one thing CuePoint must never damage. It is a little slower and needs room for one extra file at a time.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-184 — 50,000 Tracks Are Supported; 100,000 Is Measured

**Status**: Approved · **Related**: Q-195, HARDEN-07, DEC-125

**Decision**: v1 supports libraries up to 50,000 tracks, held by speed budgets on every build leg in `scale.yml`. The same run at 100,000 is recorded in the performance guide without a promise. `QUEUE_MAX_TRACKS` stays at 50,000.

**Reason**: The user's choice, as recommended. 50,000 is what every phase designed for. Measuring 100,000 tells larger libraries what to expect without a second set of budgets.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-185 — Search and Sort Ignore Accents and Case

**Status**: Approved · **Related**: Q-196, HARDEN-06, DEC-068

**Decision**: Search and sort fold accents and case beyond A–Z: "beyonce" finds "Beyoncé", "ÂME" finds "Âme", and "Âme" sorts with the A's. The fields searched stay title, artist, album and label.

**Reason**: The user's choice, as recommended. Electronic music is full of accented names, and DJs type without them.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-186 — The App Meets WCAG 2.2 AA

**Status**: Approved · **Related**: Q-197, HARDEN-08, DEC-134, DEC-141

**Decision**: Automated axe checks on every page in CI, contrast for every color token, Windows high contrast, a keyboard spec per page, and one pass by hand with NVDA on Windows and VoiceOver on macOS.

**Reason**: The user's choice, as recommended. It is the level the website already holds (DEC-141), and the pass by hand is the only way to judge the table and the waveform.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-187 — Linux Stays Experimental at 1.0

**Status**: Approved · **Related**: Q-198, HARDEN-09, HARDEN-10, DEC-174

**Decision**: Linux is built and tested by CI, including the packaged suite, with no checks by hand and no bundled player. The support page says it is experimental.

**Reason**: The user's choice, as recommended. Every check by hand doubles with a fourth system, and nothing in v1 asked for Linux support.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-188 — Every Owed Check on Windows and Both Macs Blocks 1.0.0

**Status**: Approved · **Related**: Q-199, HARDEN-09, HARDEN-10, DEC-119, DEC-176

**Decision**: `v1.0.0` is tagged only when every owed check passes on Windows, an Apple Silicon Mac and an Intel Mac. Linux needs only its automated checks. Anything else found goes on `docs/release/known-issues.md`.

**Reason**: The user's choice, as recommended. Each owed check was accepted as part of a phase, and 1.0 is where they are kept.

**Decided with**: User · **Date**: 2026-10-07

---

---

## DEC-189 — The Opening Scene: the Crate Becomes the Wheel

**Status**: Approved · **Related**: Q-180, DEC-139, SITE-06

**Decision**: The home page opens on one scroll-driven scene. A voxel crate holds unlabeled records.
As the visitor scrolls, the records lift out, take their key, tempo and genre as pixel labels, and
fly into a 3D Camelot wheel that lights up. The wheel then turns flat and becomes the real app's
window.

**Reason**: The user's choice, after seeing a live mockup of options A and B. It tells the product's
story in one movement (a messy library, matched, organized, ready for the booth), shows the wheel,
which only CuePoint has, and lands on the real app.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-190 — The Site Offers the App's Five Themes

**Status**: Approved · **Related**: Q-181, SITE-02, SITE-05

**Decision**: A pixel switch in the site's header offers the app's five themes. Neo Dark is the
default. A theme recolors the pages and the 3D scenes, and is remembered in the visitor's browser.

**Reason**: The user's choice, as recommended. It shows a feature of the app on the site itself,
and costs little: the colors are generated tokens and one shader uniform.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-191 — Sound Only When the Visitor Asks for It

**Status**: Approved · **Related**: Q-182, SITE-06

**Decision**: The home page has a pixel speaker button, off by default. Pressed, it plays a short
loop and the voxels move to it. The user supplies a loop they own the rights to; until that file
exists, the button is hidden. No sound ever plays unasked.

**Reason**: The user's choice, as recommended.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-192 — Analytics: Umami Cloud

**Status**: Approved · **Related**: Q-183, DEC-142, SITE-11, SITE-12

**Decision**: The site counts visits, sources and downloads with Umami Cloud, which sets no cookie.
Downloads, form sends, the theme switch and the sound button are counted as events. The user
creates the account; the privacy policy names the service.

**Reason**: The user's choice, as recommended. It counts what the backlink plan needs at no cost.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-193 — Forms: Web3Forms

**Status**: Approved · **Related**: Q-184, DEC-143, SITE-11, SITE-12

**Decision**: The contact and bug-report forms send through Web3Forms to the user's email. Its
access key is public by design and restricted to the site's domain. The user creates the account;
the privacy policy names the service.

**Reason**: The user's choice, as recommended. Two low-traffic forms fit its free plan.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-194 — No Download on the Site Until 1.0.0

**Status**: Approved · **Related**: Q-185, DEC-176, SITE-06, SITE-07

**Decision**: Until 1.0.0 is released, the site offers no download. The download page says 1.0.0 is
coming, and links GitHub's releases page for anyone who wants a test build. When the release data
read at build holds a normal release, the site's download buttons, the detection by system and chip
and the file list turn on by themselves, with no further change.

**Reason**: The user's choice. Test builds stay for people who seek them out on GitHub; the site's
visitors get the finished app.

**Implications**:
- Before 1.0.0, the one primary action on each page (DEC-141) is "Get notified of 1.0", which opens
  the repository's page where a visitor can watch its releases.
- SITE-07 is built and tested in full against recorded release data, so the switch at 1.0.0 is
  already proven.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-195 — The Site Goes Live at the End of Phase 17

**Status**: Approved · **Related**: Q-186, SITE-13

**Decision**: The site is deployed when Phase 17 ends, from `feature`, and from `main` once v1 is on
`main`.

**Reason**: The user's choice, as recommended. Search engines start learning the site months
earlier, and the old page describes the retired app.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-196 — A Domain Is Bought Before Launch

**Status**: Approved · **Related**: Q-187, DEC-139, SITE-13 · **Amends**: DEC-139 ("GitHub Pages'
own address until a domain is bought")

**Decision**: The user buys a domain before the site launches, and the site launches on it. The
user owns it.

**Reason**: The user's choice, as recommended. Launching once on the final address avoids a move,
gives the site a name people remember, and lets Search Console verify the whole domain.

**Implications**:
- **Checked 2026-10-07:** `cuepoint.com` (GoDaddy, since 2004), `cuepoint.app`, `cuepoint.io`,
  `getcuepoint.com`, `cuepointapp.com` and `cuepointdj.com` are taken. `usecuepoint.com`,
  `trycuepoint.com`, `getcuepoint.app` and `cuepointdj.app` were free (RDAP).
- **The registrar:** Cloudflare Registrar sells at cost (a `.com` about $10.44 a year, the same at
  renewal, privacy included) but does not sell `.app`; Porkbun or Spaceship sell `.app` at about
  $15 a year. Prices as listed on 2026-10-07; the user checks at purchase.
- **The name is the user's choice;** `SITE_URL` changes to it in SITE-13, and Search Console and Bing
  verify by DNS.
- **Other products already use the name CuePoint** (the taken domains above). A trademark search
  before launch is advised.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-197 — Comparison Pages, Factual and Dated

**Status**: Approved · **Related**: Q-188, SITE-08

**Decision**: The site has a page per similar tool (for example Lexicon, Mixed In Key and
rekordcloud). Each fact about the other tool links its own public page and carries the date it was
checked, and each page says what CuePoint does not do. The user reviews each page before launch.

**Reason**: The user's choice, as recommended. They answer searches the feature pages cannot.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-198 — A Pixel-Art Mark, and It Is the App's Icon

**Status**: Approved · **Related**: Q-189, DEC-141, DIST-09, SITE-11

**Decision**: A new pixel-art mark is drawn in the app's style: square, black-outlined, beveled, in
the theme's accent. The user approves it. It becomes the app's icon on Windows, macOS and Linux, the
site's favicon and the mark on the site. `gh-pages-root/logo.svg` retires with the old page.

**Reason**: The user's choice, and the user's words: the app has no icon of its own, and "that
should not be the case". Every packaged build so far shows Electron's default icon.

**Implications**:
- **The app's icon is built in Phase 16, as DIST-09,** so the first release in the new scheme
  (DEC-176) and every update after it carry it. It does not wait for the website.
- **SITE-11 reuses the mark** for the favicon set and the OG images, and draws nothing new.

**Decided with**: User · **Date**: 2026-10-07

---

## DEC-199 — Phase 14's Walkthrough: All Twenty Proposals, FLW-1 Narrowed

**Status**: Approved · **Related**: DEC-131, DEC-159, Phase 14 (`PHASE14_FLOWS.md`)

**Decision**: The user accepted all twenty proposals of the task walkthrough (FLW-1…FLW-20). FLW-1,
"every action has a visible place", is narrowed by the user's note: "only the most important ones
we need to be distinct". `PHASE14_FLOWS.md` lists which actions get a visible place and which stay
right-click or keys only. FLW-8 amends LIB-6: the grouped actions are also a visible bar, not only
a menu.

**Reason**: The user's marks, 2026-10-08.

**Implications**: Each proposal rides its page's step (PAGES-03, 05, 06, 07, 08, 09), and PAGES-13
checks the FLW-1 and FLW-2 rules across the app. (2026-10-08: FLW-21 is PAGES-16 and FLW-22 is
PAGES-15; FLW-11 amends DEC-087's 2026-09-21 precision, and FLW-7's field is the one DEC-162 uses.)

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-200 — The Keys of Playlists Get Their Own Page

**Status**: Approved · **Related**: DEC-133, DEC-096, DEC-201, PAGES-16

**Decision**: Seeing which keys one or several playlists, Collections or Sets hold is a distinct
function with its own sidebar entry, **Keys**, not only a filter in the Library (FLW-21). It counts
each key over the chosen sources, shows the counts on the Camelot wheel and as a list, and lists the
tracks in the keys picked.

**Reason**: The user's request, 2026-10-08.

**Implications**: A new route and page (PAGES-16) reusing PAGES-10's wheel, and one new engine read
route. The Library's Key quick filter (FLW-4) stays as an in-place filter and links to the page.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-201 — Beatport's Key Is the Only Key CuePoint Trusts

**Status**: Approved · **Amends**: DEC-068, and for the key DEC-004, DEC-067, DEC-070, DEC-079 and
DEC-106 (notes added 2026-10-08) · **Related**: DEC-075, DEC-089, DEC-096, DEC-106, DEC-111, PAGES-15

**Decision**: A track's key is the user's own correction if there is one, else the key of its
accepted Beatport match. Rekordbox's key is never used: a track with neither has no key, shows "No
Beatport key", and is left out of key filters, the wheel, the Keys page's counts, Prepare's key
checks and Similar tracks' key reason. Rekordbox's key stays visible in Track details, marked "not
used".

**Reason**: The user: Rekordbox's keys "might be wrong, the only right keys will be from beatport".
Chosen on a decision card over "Beatport first, Rekordbox's flagged" (recommended) and "write
Beatport's key as a correction on accept".

**Implications**:
- The user's own correction still wins: it is a deliberate act, and DEC-068's history and revert
  keep working for it.
- Exports and saved file tags write the key where there is one and never blank an existing key in
  Rekordbox or a file.
- Key leaves the "apply Beatport's values" choices, since accepting a match already gives it.
- A library that has not been matched shows no keys; the first-run guide and the Library say that
  keys come from matching.
- BPM, genre, label and year keep DEC-068's rule.
- Where DEC-075, DEC-096 and DEC-111 say "effective key", it is this key. DEC-089's export
  notation is unchanged: detecting it from Rekordbox's file reads the file's format, not its keys.
- (2026-10-08 review) Rekordbox's key stays readable in one filter field, "Key from Rekordbox (not
  used)", and in Review's comparison, labelled; it never feeds a count, a check or the wheel. The app
  shows keys in Camelot. Automatic accepts give the key (DEC-202), and keys applied from a match
  before this decision follow the match (DEC-203).

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-202 — Every Accepted Match Gives the Key, Automatic Ones Included

**Status**: Approved · **Related**: DEC-201, DEC-067, PAGES-15

**Decision**: Under DEC-201 a track's key comes from its accepted Beatport match. Every accepted match counts,
including those DEC-067 accepts on its own at a score of 95 or more.

**Reason**: A score of 95 is the matcher's near-certain tier; counting only hand-accepted matches would leave
most of a freshly matched library without keys until it is reviewed track by track. Asked as Q-200; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- An automatic accept stays not sticky (DEC-067): a re-match can replace it and change the key. The
  change is recorded in History like any other value's.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-203 — A Key Applied From a Match Before DEC-201 Follows the Match

**Status**: Approved · **Related**: DEC-068, DEC-201, PAGES-15

**Decision**: A key the user applied from Beatport under DEC-068, before DEC-201, is read as Beatport's key, not
as the user's correction: a later reject or a cleared match takes it away. A key the user typed stays
their correction.

**Reason**: The user applied Beatport's value, not a key of their own. Reading it as a correction would make
"· yours" mean two things. Asked as Q-201; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- History already records whether a value was applied from a match or typed (`match_apply.py`), so
  nothing stored is migrated or deleted; the resolver reads the record.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-204 — CuePoint Has One Menu Bar, the System's

**Status**: Approved · **Related**: HDR-5, FLW-20, DEC-087, PAGES-03

**Decision**: CuePoint's own system menu bar replaces both Electron's default and the in-window menu bar: CuePoint
(macOS), File, Edit, View and Help. HDR-5's View and Help move into it, and the in-window
`AppMenuBar` goes.

**Reason**: One bar, where each system puts it. macOS needs Edit's cut, copy and paste in the system menu for
text fields to work at all. Asked as Q-202; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- Export stays out of the menu (DEC-087). Ctrl+=, Ctrl+− and Ctrl+0 step the Size setting instead
  of zooming. Reload and Developer Tools leave packaged builds.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-205 — One Editor for Values: Track Details for One Track, Fix Values for Many

**Status**: Approved · **Related**: INS-4, INS-11, FLW-12, FLW-2, PAGES-06, PAGES-07

**Decision**: Values are edited in one editor. Track details opens it for the track shown (**Edit values…**); Clean's
Fix values opens it for many tracks, and Track details' **Edit values for 4 tracks…** opens Fix values
with the selection. Track details' per-field Apply from Beatport goes: applying Beatport's values is
Review's and Fix values' job.

**Reason**: Fixing one track should not need a page change, and one editor keeps the rules and words in one
place (FLW-2). Asked as Q-203; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- INS-4's "Correct a value…" and INS-11's "Change all 4…" are renamed, as `PHASE14_REVIEWS.md` notes.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-206 — The Keys Page Is the One Home of a Key Spread

**Status**: Approved · **Related**: DEC-200, DEC-136, DEC-162, STATS-06, PAGES-16

**Decision**: The Keys page (DEC-200) is where the keys of a library, playlists, Collections or Sets are counted.
Statistics shows a small key summary that opens the Keys page with the same sources, and Phase 15's
STATS-06 reuses the Keys page's wheel counts mode rather than adding a second shading mode.

**Reason**: One home per function (FLW-2), and the Keys page is the one the user asked for. Asked as Q-204; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- Phase 15's document is amended to match (2026-10-08). Counts are written on the page, never shown
  on hover alone.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-207 — Someone Who Updates Is Told Once What Phase 14 Changed

**Status**: Approved · **Related**: DEC-161, DEC-201, DEC-172, PAGES-11

**Decision**: On the first start of the version that ships Phase 14, someone who finished the old tour sees one
note: the app is now Medium size (1.5×), with **Change size**, shown only to someone who never chose
a size; and keys now come only from Beatport, with how many tracks have one and **Match tracks…**.

**Reason**: Losing every Rekordbox key at once reads as a bug unless it is explained, and Phase 16's "What's new"
does not exist yet. Asked as Q-205; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- Stored under its own key, `cuepoint-phase14-note-seen`. Phase 16's "What's new" (DEC-172) takes
  over from the next update.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-208 — The Refresh Is "Check Rekordbox for Changes"

**Status**: Approved · **Related**: LIB-3, CLN-8, FLW-11, FLW-20, PAGES-05

**Decision**: The action that re-reads the Rekordbox export is named **Check Rekordbox for changes** everywhere:
the Library header, the File menu, Clean's Missing files and every link to it.

**Reason**: It says what happens, and nothing in the library changes until the user has seen the changes. Asked as Q-206; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- LIB-3's "Refresh from Rekordbox…" and CLN-8's "Refresh the Library" are not used.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-209 — Action Bars Are Always Shown, Disabled With a Reason

**Status**: Approved · **Related**: FLW-8, FLW-10, FLW-15, FLW-17, PAGES-05, PAGES-08, PAGES-09

**Decision**: Bars that act on a selection (the Library's selection bar, the bar under the Collections tree,
Prepare's entry buttons and Discover's result actions) are always shown. With nothing selected their
buttons are disabled and say what to select.

**Reason**: A bar that appears on selection pushes down the rows the user is about to click. Asked as Q-207; the user chose the recommendation ("Use recommended", 2026-10-08).

**Implications**:
- Prepare's buttons sit on a line it already has, so DEC-112's floor is not spent on them.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-210 — The App's Icon Is the Camelot Wheel

**Status**: Approved · **Related**: DEC-198, DIST-09, SITE-11, DEC-189

**Decision**: Of three pixel marks (a record with a cue tick, the Camelot wheel, a waveform with a cue
flag), the user picked the Camelot wheel: the twelve Camelot key colours in a black-outlined ring
around a dark centre with a white cue pip, on Neo Dark's violet tile with the black outline, bevel
and hard shadow. It is drawn on its own 16, 24, 32, 48 and 64 pixel grids.

**Reason**: The user's choice on 2026-10-08. It reads at 16 px and ties the app to the site's
crate-becomes-wheel opening scene (DEC-189).

**Implications**: DIST-09 builds every icon file from these grids. SITE-11 reuses them for the
favicon set and OG images.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-211 — STATS-01 Is Built Ahead of Phase 14

**Status**: Approved · **Related**: DEC-137, DEC-140, DEC-168, STATS-01

**Decision**: STATS-01 (play history) is built while Phase 14 is still being built, rather than
after it as DEC-140 orders the phases. The rest of Phase 15 still waits for Phase 14.

**Reason**: Every refresh before STATS-01 ships is play history that can never be recovered, and the
step touches only the engine's import path, a new migration and its tests, none of the renderer
pages or Settings that Phase 14 changes. The user asked on 2026-10-08 to run in parallel whatever
could be.

**Implications**:
- m0027 is the next migration; Phase 14 adds none.
- A read row's `tracks` is the library's track count after the read, and `changed` the
  `play_counts` rows that read stored.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-212 — Phase 17, the Website, Is Built Ahead of Phases 14 to 16

**Status**: Approved · **Amends**: DEC-140 · **Related**: DEC-139, DEC-195, DEC-211, Phase 17

**Decision**: Phase 17's steps are built now, while Phase 14 is still being built and alongside
Phase 16's release plumbing, rather than after Phase 16 as DEC-140 orders the phases. Steps that need
a finished Phase 14 or 16 wait for it: SITE-04's screenshots (Phases 14 and 15's pages), the app
pictures SITE-06 and SITE-08 place, SITE-07's release data from DIST-03 and DIST-04, and SITE-13's
launch and the release-triggered deploy.

**Reason**: The site is its own code in `apps/website/`, with its own pages and its own CI job; it
touches none of the renderer pages or Settings that Phase 14 changes, nor the build and release
config Phase 16 changes. The user chose on 2026-10-08 to start it early.

**Implications**:
- Nothing is public until SITE-13 still holds: every build stays a `noindex` preview artifact, and
  the old page stays live.
- Where a page needs an app picture that does not exist yet, it builds with the scene's still and
  the picture is added when SITE-04 runs.
- The download page has no normal release to offer before 1.0.0 anyway (DEC-194), so building it
  early changes nothing it shows.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-213 — The Website's Address Is usecuepoint.com

**Status**: Approved · **Related**: DEC-139, DEC-196, SITE-01, SITE-13

**Decision**: The domain DEC-196 asks for is `usecuepoint.com`, bought by the user on 2026-10-08
(registrar Papaki). `SITE_URL` is `https://usecuepoint.com/` from now on, so the site is built with a
base of `/` and every canonical, the sitemap and `robots.txt` already name the final address.

**Reason**: The user's choice among `cuepoint.dj`, `usecuepoint.com` and `usecuepoint.app`. Building
for the final address now means launch changes no link.

**Implications**:
- The DNS records, Pages' custom domain and `public/CNAME` still wait for SITE-13; until then the old
  page stays at `https://stuchain.github.io/CuePoint/` and the new site is a `noindex` preview.
- Domain verification for the user's GitHub account (a TXT record) can be done any time, and changes
  no site.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-214 — Phase 16's Release Setup (DIST-01…DIST-05) Is Built Ahead of Phases 14 and 15

**Status**: Approved · **Amends**: DEC-140 · **Related**: DEC-145, DEC-169, DEC-170, DEC-211, DEC-212, Phase 16

**Decision**: DIST-01…DIST-05 (one version, the Intel Mac build, update metadata, the tag-driven
release workflow, and the update rule with GitHub's release list) are built now, while Phase 14 is
still being built, rather than after Phase 15 as DEC-140 orders the phases. DIST-06…DIST-08 (the
updater in main, **Update ready** and Settings' **About & updates**, and the real update) wait for
Phase 14, because they touch Settings and the app shell.

**Reason**: These steps are build, CI and pure main-process code; they touch none of the renderer
pages or Settings that Phase 14 changes, beyond the one version string About shows before main
answers. The user chose on 2026-10-08 to start them early.

**Implications**:
- The version is `1.0.0-test.1` from now on (DEC-176), in source and packaged builds alike.
- No release is made or tagged by building these steps: the first tag is the user's call.
- **electron-builder 25 does not sign a Mac app ad hoc when there is no identity** (it signs nothing),
  which fact 5 of `PHASE16_DISTRIBUTION.md` had inferred it would. So `build/signNestedBinaries.cjs`
  signs the whole bundle ad hoc itself, inside out, with the hardened runtime and the entitlements the
  build is configured with. DEC-170 stands; this is how it is met.
- The upgrade to electron-builder 26 stays deferred: the Phase 13 workaround (the copied
  `@sentry/browser-utils`, held by `packagedDependencies.test.ts`) still applies, and the upgrade
  would change signing settings that DIST-02 just fixed. It is revisited with DIST-06.
- Mac and Linux legs, the release workflow and the mpv mirror workflow are proven only by a real CI
  run and the first tag; nothing in them could run in the cloud container.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-215 — Forms stay on Web3Forms' free plan (amends DEC-193)

**Status**: Approved · **Related**: DEC-193, SITE-12, SITE-13

**Decision**: The contact and bug-report forms use Web3Forms' free plan. On that plan the access key cannot
be restricted to the site's domain, so DEC-193's "restricted to the site's domain" does not hold: the key is
public and unrestricted. Spam is held back by a hidden trap field, a minimum fill time and Web3Forms' own
filter. The free plan also refuses server-side sends, so there is no automated live send; the real send is
checked by hand on the deployed site at SITE-13.

**Reason**: The user's choice, as recommended. Domain restriction is a paid feature, and two low-traffic forms
on a personal project do not justify the cost.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-216 — A 30-Second Promo Video, Rendered From Code

**Status**: Approved · **Related**: DEC-189, DEC-190, DEC-210, SITE-04, SITE-06

**Decision**: CuePoint gets a 30-second promo in two cuts, 16:9 for the website and YouTube and 9:16
for Reels, TikTok and Shorts, built in `apps/promo-video` and rendered by `npm run render`. It is
pixel art in the app's look: the opening is the website's own crate-becomes-wheel scene (imported
read-only), the app shots are stand-ins drawn with the app's theme tokens and marked "Preview" until
the Phase 14 and 15 pages can be captured, the captions say only what the home page says, and the
music is synthesized in code so nothing needs a license.

**Reason**: The user's choice of every recommended option on 2026-10-08. Made from code, it can be
re-rendered when the redesigned pages land instead of re-edited by hand.

**Implications**: Embedding it on the site belongs to Phase 17's thread. When real captures exist,
the stand-ins are swapped and `APP_PREVIEW` turned off.

**Later the same day**: v4 is 20 seconds at 132 BPM with a one-bar feature montage (Clean, keys, Discover, Prepare, waveforms, Export), at the user's request. Before that, v2 cut faster with CSS 3D camera moves; v3, after the user asked for it
cleaner, keeps the 3D but drops the flashes, frame shake and fly-through exits, centers every shot,
and holds the captions level in one place. v5, after a second round of research and three reviews,
puts all six app panels in one 3D world the camera flies through, lands each flight half a beat
after the downbeat, drops the backdrop for a plain deep room, and starts the private track two bars
before its second drop. v6 lands every window dead level (the camera's push and slide are a screen-space
dolly, so a panel never leans or drifts off center), banks through each flight, layers the window's bar,
sidebar, buttons and cards in depth for parallax, and puts every record on the opening's tag board by
mid-bar. v7 shows the crate's records as vinyl (grooved discs with a label, one half out), fades each
caption's box and letters in rather than popping them, lights the Camelot wheel's cells beat by beat
behind the end card, lifts the compatible keys and counts them ("4 mix in key with 8A"), ticks each
accepted row in Clean, vignettes the room, and shows the exported file as a card (XML, 6 tracks).
The opening scene is a frozen copy of the website's (apps/promo-video/src/scene, from feature 537bbf3), so the
approved video does not change when the site's home page is reworked. `npm run mux` puts the user's own copy of a track under
the picture for a private cut; licensed music is never committed or posted.

**Decided with**: User · **Date**: 2026-10-08

---

## DEC-217 — The Library's Bar and Tree Bar: Five Precisions to FLW-8 and FLW-10

**Status**: Approved · **Related**: FLW-8, FLW-10, DEC-087, DEC-112, DEC-209, PAGES-05

**Decision**: Five details the Library's selection bar and the Collections tree's bar leave to the
build are settled, as precisions of FLW-8 and FLW-10 and not as new behavior:
1. **Duplicate** is offered for a Smart Collection and a Set only. The engine has no plain
   Collection or folder duplicate, so for those the button is dimmed and says so.
2. **Review these matches** opens Review on the first selected track, because Review works on
   one track at a time.
3. **Check the files are still there** runs where it is, as a job the status strip follows. It
   does not open Clean.
4. **Select all with some tracks taken back out** reaches Clean as a list of ids, because Clean's
   tracks cannot name exceptions. The list is capped at `QUEUE_ACTION_LIMIT` (50,000), the same
   cap the queue actions use, and when it is cut the Library says "Clean was given the first N of
   the M tracks selected." Select all with nothing taken out still travels as the question and
   its count.
5. **The toolbar's buttons are 30px tall** at 1.5×, under the 44px-scaled hit floor the page's
   primary buttons keep, because the toolbar is the one place a line costs a table row. In the
   default window (1,280 × 800 at 1.5×) the Library shows 4 whole rows; a taller button would
   leave the fourth with 18px of margin or less.

**Precision (2026-10-09)**: Where the toolbar row does not fit on one line it takes two, laid out
on purpose: the six groups on the first; **Clear selection**, the count, **Select all** and
**Columns…** on the second. `LibraryToolbar` measures whether one line fits (its buttons plus the
count's reserve, its longest form), so a first selection never changes the lines. On the second
line the count takes what is left, up to its reserve, and is cut with an ellipsis before a button
would wrap. The groups' ▸ is drawn (a 3 × 6 triangle at 1.5×), because the pixel font has no such
glyph and each system's fallback drew it at a different width; the row has no side padding and
2px gaps. At 1.5× in the 1,264 × 735 page with Track details open, the first line keeps 40px
or more to spare beside a 20px scrollbar, which `libraryPage.spec.ts` measures; before, it kept
about 10px on Linux and wrapped to a third line on Windows.

**Reason**: Each was a gap the walkthrough's wording left open, found while building PAGES-05C and
settled the way the engine and DEC-112's row budget allow.

**Implications**: The spec's selection-bar table and the PAGES-05 outcome note them. The held row
count in `libraryPage.spec.ts` is 4 on Linux. A change that lowers a toolbar button's height or
adds a line to the filter row, toolbar row or header re-measures it.

**Decided with**: Claude (a precision of FLW-8 and FLW-10, not a new decision) · **Date**: 2026-10-08

---

## DEC-218 — The Library Database Commits With synchronous=NORMAL

**Status**: Approved · **Related**: ADR-010 (the waveform store already runs this way)

**Decision**: `DatabaseService` sets `PRAGMA synchronous=NORMAL` beside `journal_mode=WAL`. A
commit waits for the write-ahead log, not for the disk; the disk is synced at each checkpoint.

**Reason**: With SQLite's default (FULL) every commit waited for the disk. On Windows that made
each save slow, and the unit suite timed out at 30 minutes on both Windows Release Gates legs,
each time interrupted inside `commit()`. SQLite recommends NORMAL with WAL: the file survives the
app crashing and is never corrupted; a power cut can lose the last few commits.

**Implications**: Edits and imports save faster on Windows for users too. The waveform store
already made the same choice for the same reason.

**Decided with**: User (chose the recommended option, 2026-10-08) · **Date**: 2026-10-08

---

## DEC-219 — A Set's Entry Does Not Move Into the Inspector as a Shared Element

**Status**: Approved · **Related**: DEC-134, DEC-112, PREP-10, Phase 14 (PAGES-12)

**Decision**: The Set-entry shared-element transition is not built. Only the search result into its
Library row is.

**Reason**: While a view transition is live, Chromium routes the pointer to the document root (the
pseudo-element tree sits over the page). A click in that window never reaches the row, so the second
click of a double-click to play, or a shift-click that picks a range, is lost. No transition shorter
than the double-click interval removes the window, and delaying the pick to wait it out would delay
input. DEC-112's and PREP's double-click-to-play on a Set's rows wins.

**Implications**: Picking a Set's entry is only picking. The search-result transition stays: it
starts from a click that navigates and re-sends nothing, looks for its landing once and never waits
inside the update, and is not started from an inert or leaving copy. `cp-shared-entry` is gone from
the stylesheet and the user guide.

**Decided with**: Claude (a build finding on DEC-134, raised at review) · **Date**: 2026-10-08

---

## DEC-220 — Release Gates Measure Coverage on Python 3.12 Only

**Status**: Approved · **Related**: DEC-218, CI fix · Green on all four

**Decision**: Release Gates' unit-test step measures coverage (and uploads and checks it) on the
Python 3.12 legs only, with coverage.py's `sysmon` core. The Python 3.11 legs run the same unit tests
without coverage.

**Reason**: Python 3.11 has no `sys.monitoring`, so coverage there uses the line tracer, which
roughly doubles the suite: Ubuntu took 14 minutes on 3.11 against 7.5 on 3.12 for the same commit,
and Windows 3.11 took 29 of the step's 30 minutes. Raising the limit would hide the cost; measuring
the same code twice per system adds nothing the 3.12 leg does not already show.

**Implications**: The 35% coverage gate still runs on Ubuntu, macOS and Windows (3.12). A test that
fails only on 3.11 still fails its leg. `--durations=30` lists the slowest tests on every leg.

**Decided with**: Claude (CI fix thread, under the rule not to raise timeouts to hide slowness) · **Date**: 2026-10-08

---

## DEC-221 — The Engine Hands the Interpreter's Lock Over Within 0.5 ms

**Status**: Approved · **Related**: WAVE-03 (`fine_timer_resolution`), CLEAN-03, CI fix

**Decision**: The engine sets Python's switch interval to 0.5 ms (`favour_waiting_threads()` in
`engine/server.py`), in `run_engine` and in `start_engine_thread`, so the tests' engine behaves like
the app's.

**Reason**: An engine request gives up the interpreter's lock hundreds of times: SQLite releases it
for every statement and every row, the socket for every read and write. While another thread
computes in Python (a waveform reduced, a match scored), each return waits until that thread is
asked to stop, which Python does after the switch interval: 5 ms by default, 15.6 ms on Windows,
whose timed waits round up to its timer. On Linux a 50-row search beside one busy thread took 1.5 to
2.1 s instead of 10 ms. On Windows runners searches, browses and Set reads got no answer in 5 s.
On an Intel Mac a Set insert took 8 to 14 s beside a starting match. Measured with the switch interval
at 0.5 ms: 0.1 s, and the 1,000-track match test's slowest search beside a busy thread went from 4.5 s
to 0.46 s. No database or Python lock was involved: a match job holds its write transaction only
around each result's insert (`match_service._store`), never across the Beatport lookup, which runs
on the pool threads.

**Implications**: A thread computing while another waits gives the lock up more often, about 5% of
its speed when two compute together; nothing when no one waits. On Windows a wait under 1 ms is not
timed, so the waiting thread asks for the lock at once. `src/tests/regression/
test_regression_engine_beside_busy_thread.py` fails on the old interval.

**Decided with**: Claude (CI fix thread, under the rule not to raise timeouts to hide slowness) · **Date**: 2026-10-09

---

## DEC-222 — The Site Ships One Theme, and the Home Page Stays Calm (amends DEC-190, SITE-06)

**Status**: Approved · **Related**: DEC-190, DEC-189, SITE-02, SITE-06

**Decision**: The website ships Neo Dark only; the header's theme switch, the pre-paint script and the
theme-change event are removed. The home page keeps one palette, a full-bleed 3D hero that starts on its
own, a pinned scroll story, and five one-line teasers in place of the detailed sections; the detail lives
on the feature pages. The crate's records look like vinyl in sleeves. The token generator and the
per-theme stills stay, so a theme can return later without rework.

**Reason**: The user's choice after seeing the site on his PC (2026-10-09). The first full-3D home was
"too much, not cohesive, many colors overlapping"; he asked for a cleaner, cohesive page that is still
3D, readable, and shows "only the stuff that will draw them to use it", and to "keep the default color
preset and remove the options to pick the other presets".

**Implications**: DEC-190's five switchable themes no longer apply to the site. The a11y and e2e matrices
run in one theme. The promo video imports the scene and must adapt to the new phases and the discs mesh.

**Decided with**: User · **Date**: 2026-10-09

---

## DEC-223 — A Request Checks the Schema Once, Takes Over a Connection, and Lets the Client Close First

**Status**: Approved · **Related**: DEC-221, CLEAN-03, CLEAN-14, CI fix

**Decision**: Three things an engine request no longer does.

1. **Ask whether the schema is current.** `MigrationRunner.migrate()` returns at once when the
   database service already found exactly its migrations applied (`schema_known_current`). The
   service forgets that in `close_all()`, which a restore calls before it replaces the file, and
   a finding made on a connection of an earlier generation is never recorded.
2. **Open its own SQLite connection.** `DatabaseService.connect()` gives a thread with none the
   connection of a thread that has ended, when it is of the current generation and holds no open
   transaction. Up to `IDLE_CONNECTIONS_KEPT` (8) more stay for the threads after it; the rest,
   and any from before a `close_all()`, are closed as before.
3. **Close the connection before the client does.** Once an answer that said its length is sent,
   the engine waits up to `CLIENT_CLOSES_FIRST_SECONDS` (0.5 s) for the client to close first.
   An event stream, whose end is the close, is closed at once as before.

**Reason**: The 1,000-track match test still failed on GitHub's macOS runners after DEC-221: a
search took 1.06 s (arm64, 3.12) and 1.13 s (3.11) to answer, and 1.02 s on Intel, 1.00 s of it to
connect. Traced on Linux, one search ran 22 statements: 16 were four repositories' `migrate()`
checks (two `CREATE TABLE IF NOT EXISTS` and two reads of `schema_version` each), and every request
thread first opened a connection (a file open, four pragmas, a read of `sqlite_master`, two SQL
functions). Beside a busy thread each statement, and each row, is a wait for the interpreter's lock.
Now the search runs 6 statements on a connection it did not open. The match test with two busy
threads started before the engine, measured A/B on the same machine (Python 3.12, two runs each):
median 0.46 s → 0.32 s, slowest 0.67–0.70 s → 0.47–0.52 s. With no busy thread: median 10 ms →
7 ms. What remains is the two reads of 50 rows each: SQLite gives the lock up for every row.

The 1.00 s connect is not the engine accepting slowly. The test has one connection open at a time,
so the listen queue (128, `ThreadingHTTPServer.request_queue_size`, used by `run_engine` and
`start_engine_thread` alike) holds at most one; and the kernel completes a handshake without
`accept()`, so a starved accept thread cannot delay `connect()` (on Linux, 50 connects to a listener
that never accepts take 0.1 ms at most). A connect of exactly 1.00 s is a SYN sent again after
macOS's 1 s timeout. The engine closed every connection first (HTTP/1.0), so each request left a
TIME_WAIT on the engine's own port: on Linux, 18 of 20 requests' TIME_WAITs were the engine's.
macOS picks a client's next port without regard to those, and its sequence numbers are random, so
a SYN from such a port is answered as the old connection about half the time; the client resets and
retries a second later. With the client closing first, all 20 TIME_WAITs are the client's, on ports
its own connects avoid. This reading is the likeliest one but could not be reproduced on Linux, whose
connects skip ports held in TIME_WAIT.

**Implications**: Migrations added while the engine runs are never applied by it; they never were,
being part of the build. A second process migrating the same file while the engine runs is no longer
noticed until the engine restarts or restores. A connection lives as long as the engine, not one
request. A client that reads an answer until the connection closes, rather than by its length, waits
up to 0.5 s longer for the close; the app's client and the Python clients close at once. The
mechanism is pinned by `test_migration_runner.py::TestACurrentSchemaIsCheckedOnce` (no statement
on a second `migrate()`, checked again after a restore), `test_database_service.py`
(`TestConcurrency`: handed on, never shared by live threads, never across `close_all()` or an
open transaction) and `test_engine_client_closes_first.py`.

**Decided with**: Claude (CI fix thread, under the rule not to loosen the 1.0 s bound or skip the
test) · **Date**: 2026-10-09

---

## DEC-224 — The Windows Install Runs Only From the Finished Quit Cleanup

**Status**: Approved · **Related**: DEC-169, Phase 16 fact 8, DIST-06

**Decision**: `electron-updater` runs with `autoDownload` and `autoInstallOnAppQuit` both off. The
install starts only as the last step of `quitAfter`'s cleanup, once the player and the engine have
stopped, through `quitAndInstall(true, relaunch)` on Windows and the detached script on a Mac. If the
5 s limit lets the quit through first, nothing installs on that quit and the ready update installs at
the next one.

**Reason**: The phase text set `autoDownload` and `autoInstallOnAppQuit` true. But
`electron-updater`'s own quit handler, and `quitAndInstall` itself, start the installer before the
app has finished quitting, while the engine and mpv still hold their files (fact 8). And a version
must be refused before anything downloads: with `autoDownload` on, `electron-updater` would fetch
whatever its manifest names. With it off, CuePoint checks that the manifest and the "update
available" event both name the version its rule chose, and only then calls `downloadUpdate()`.

**Implications**: The Mac and Windows installs share one path. An update is installed at a quit that
takes under 5 s, and not at a slower one.

**Decided with**: Claude (DIST-06) · **Date**: 2026-10-09

---

## DEC-225 — The Mac Update's Chip and Version Are Read in Node

**Status**: Approved · **Related**: DEC-170, DIST-06

**Decision**: After `ditto` unpacks the Mac zip, CuePoint reads the app's chip from the executable's
Mach-O header and its version from the XML `Info.plist`, both in Node. `ditto` is the only external
program the Mac installer runs.

**Reason**: On most Macs `lipo` is a stub that asks to install Xcode's tools, and may show that
dialog. `plutil -extract ... raw` needs macOS 12, and the app supports older ones. A header and a
plist are small and easy to read and test without a Mac. A binary plist is refused: the build writes
XML.

**Decided with**: Claude (DIST-06) · **Date**: 2026-10-09

---

## DEC-226 — A Failed Install Is Reported at the Next Launch

**Status**: Approved · **Related**: DEC-153, DIST-06

**Decision**: Before the install is handed off, main saves `pendingInstall` (the version) in its
settings. At the next launch it clears the note, and if the running version is still lower, the
updater reports `install-failed` once, with the last lines of the Mac script's `install.log`, scrubbed
of the user name and home folder.

**Reason**: The installer runs after the app has exited, so nothing in the app can see it fail. A
version that is still old at the next launch is the one sign that is the same on both systems.

**Decided with**: Claude (DIST-06) · **Date**: 2026-10-09

---

## DEC-227 — The Main Window Stays on the App's Own Page, and Release-Note Links Use an Allow-List

**Status**: Approved · **Related**: DIST-07

**Decision**: The main window denies new windows and cancels any navigation or redirect away from the
app's own page. A link in a release's notes opens in the browser only if it is `https`, has no port or
credentials, and is on `github.com`, a subdomain of it, `usecuepoint.com` or `www.usecuepoint.com`.

**Reason**: The window carries the preload bridge, and a release's notes are untrusted text from the
network. A link, a drop or a script must not be able to put another page in that window.

**Decided with**: Claude (DIST-07 review) · **Date**: 2026-10-09

---

## DEC-228 — Restart When Done Waits Only for the Work Running When It Was Chosen

**Status**: Approved · **Related**: DEC-173, DIST-07

**Decision**: **Restart when done** remembers the jobs that were running when it was chosen and
restarts when those have ended. Work that starts later is not waited for. If the page cannot tell what
is running, it offers only **Restart now** and **Cancel**.

**Reason**: Some work starts the work that follows it (an import starts a file check). Waiting for
all of it could mean never restarting. The person chose about what they could see.

**Decided with**: Claude (DIST-07) · **Date**: 2026-10-09

---

## DEC-229 — A Waveform Decode That Stops Making Progress Is Stopped and Run Again

**Status**: Approved · **Related**: DEC-113, DEC-123, ADR-009, WAVE-01

**Decision**: While a decoder child runs, the engine watches for progress: new bytes of decoded
output (read from the pipe as they arrive, or the output file's size on Windows) or growth of its log
file. A child with neither for 30 seconds (`STALL_SECONDS`) is killed, named in the engine's log with
its pid and last log lines, and the file is decoded again. Such attempts count toward the same
3 attempts as a log cut short; only when every attempt stalls is the file recorded as `timeout`.
The 300-second cap on one attempt stays.

**Reason**: This works around an upstream mpv bug, not a broken file. mpv's `--log-file` writer
(`common/msg.c`, 0.41) has a lost-wakeup deadlock: when its 100-entry buffer is full, the decode
thread waits for a signal that the log thread may already have sent, and both then sleep for good.
CI caught one such child on macOS at 0 CPU. The decoder always writes that log, at debug level, in
bursts of about 90 lines while the filter graph is set up, so the buffer can fill whenever the log
thread falls behind. Each hang cost the analysis 5 minutes; a second run almost always goes through.
A healthy decode is never quiet for long (its log has a line for each step before output starts,
and output then streams), so 30 seconds is ten times its longest silence.

**Decided with**: Claude (WAVE-01) · **Date**: 2026-10-10

---

## DEC-230 — The Site Prints No Contact Address (amends DEC-144)

**Status**: Approved · **Related**: DEC-144, DEC-193, DEC-215, SITE-11, SITE-12, SITE-13

**Decision**: No email address appears on any page of the website or in its source; DEC-144's
`CONTACT_EMAIL` placeholder is withdrawn. The contact form and GitHub issues are the ways to reach the
publisher: the privacy policy, the terms, the contact page and a form's failure message point to them.
The form's deliveries go to the Web3Forms account's mailbox, set in that dashboard, which the site never
needs to know. A build check (`no-email`, every build, an error) fails if an address or a `mailto:`
link appears in any built page.

**Reason**: The owner's choice on 2026-10-10 ("not let them see it"). It also keeps a personal address
out of the repository, where it would be scraped.

**Decided with**: User · **Date**: 2026-10-10
