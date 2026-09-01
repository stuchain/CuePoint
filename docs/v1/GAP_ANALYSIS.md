# CuePoint — Gap Analysis (Phase 0)

Status: **Draft — depends on `CURRENT_ARCHITECTURE.md`**, which it should be read alongside.
Maps today's repository reality against the target product vision (persistent local-first DJ
library workspace: Library, Clean, Discover, Prepare, with a persistent player and Track
Inspector). Legend: **Exists** (working today) / **Partial** (something related exists but doesn't
meet the target) / **Missing** (nothing exists) / **Needs Refactor** (exists but the current shape
actively works against the target and should change before building on it).

No priority/sequencing is implied by table order — see `ROADMAP.md` (draft) for phasing.

---

## A. Persistence & domain foundation

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Persistent relational database for Track/Playlist/Match/etc. | **Missing** | Only `incrate/inventory_db.py` (SQLite) exists, scoped to inCrate only | This is the single biggest foundational gap — almost everything in the target vision (Collections, Tags, Ratings, Match history, Sets) needs a durable store that doesn't exist yet |
| Track domain model | **Needs Refactor** | Two parallel `TrackResult` dataclasses (`models/result.py` vs `compat/gui_types.py`) used inconsistently by engine vs core pipeline | Must be unified before a persistent `Track` entity can be defined cleanly |
| Track identity across Rekordbox refreshes | **Missing** | Only `TrackID or ID or Key` from the current XML parse is used; no cross-import identity/diff logic exists | Core to ADR-002 (Track Identity) — needs explicit design (see Open Questions) |
| Config persistence | **Exists (Partial)** | `ConfigService` + `~/.cuepoint/config.yaml`, but split across a structured `AppConfig` tree and a legacy flat `SETTINGS` dict | Usable as-is for now; flat-dict debt should be paid down opportunistically, not blocking |
| Background job system | **Exists (Partial)** | `engine/jobs.py::JobStore` — real thread-per-job execution, cooperative cancel, SSE progress | Scoped to match jobs only; in-memory only (job history lost on engine restart); no queue/backpressure; would need generalizing for import/artwork/waveform/analysis jobs |
| Activity/event history | **Missing** | Audit trail is ephemeral per-run files (`*_audit.jsonl`, `*_candidates.csv`) | No queryable "Activity" feed exists |
| Backups | **Missing** | No user database to back up yet; only ad-hoc `.bak` files for CSV/config (`SafeFileWriter`, `integrity_service.py`) | Becomes mandatory once a DB exists (target spec §58) |

## B. Rekordbox library management

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| XML parsing (tracks, ratings, metadata) | **Partial** | `rekordbox.py` parses TrackID/Name/Artist/Remixer/Label/Location; **Rating, PlayCount, Colour, DateAdded are not parsed at all** | Straightforward extension, not a redesign |
| Nested playlist folders | **Exists** | `parse_playlist_tree()` already preserves hierarchy (`Folder/SubFolder/Playlist`) | Reusable as-is for LIBRARY-04 |
| Initial persistent import | **Missing** | Import today is one-shot, in-memory, per-run | Needs a DB to import into (depends on A) |
| Differential refresh (diff against previous import) | **Missing** | No prior-state comparison exists anywhere | New capability, depends on Track identity being settled |
| Removed-track handling | **Missing** | No "removed from Rekordbox but still referenced" state exists | Depends on Track identity + persistence |
| Full XML round-trip export | **Missing** | Only a narrow attribute patch (`write_updated_collection_xml`, Key/Comment/Year/BPM/Label/Genre) exists, always to a new file | Good safety precedent (never overwrites source) to carry forward into full export design |
| Import preview / summary UI | **Missing** | No such screen exists | — |

## C. Beatport matching ("Clean")

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Matching/scoring engine | **Exists, strong** | `core/matcher.py` — mature guards, weighted fuzzy scoring, bonuses, confidence labels | **Reuse directly** — do not rebuild |
| Confidence tiers | **Exists (Partial)** | `_confidence_label()` (high/medium/low) is a display label only, not a workflow gate | Needs an explicit accept/review/reject **state machine** layered on top (target spec §31) |
| Match review UI | **Partial** | `CandidateDialog.tsx` (modal, candidate comparison table) exists | Not a dedicated review-queue screen; no persisted accept/reject decision |
| Match history / audit persistence | **Missing** | Ephemeral per-run files only, no DB | Needed for target spec §33 (match history must survive re-matching) |
| Batch metadata editor | **Missing** | No bulk field-apply UI exists | — |
| Duplicate detection (tracks) | **Missing** | Only playlist-*name* duplicate detection exists, unrelated | New capability |
| Missing-file detection (bulk) | **Missing** | Only per-track existence checks during tag-write exist | New capability — needs a library-wide sweep |
| Library Health score | **Missing** | No such concept exists | Depends on duplicates + missing-files + metadata-completeness signals existing first |
| Artwork handling | **Missing** | `artwork_url` field exists on `BeatportCandidate` but is never populated by the scraping path; no artwork cache/display anywhere | — |
| Tag write-back to audio files | **Exists, strong** | `data/tag_writer.py` — ID3/Vorbis via mutagen, Rekordbox-safe WAV chunk ordering | **Reuse directly** |

## D. Discover (inCrate evolution)

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Beatport chart/label discovery | **Exists** | `incrate/discovery.py` — artist-curated charts + label new-releases, deduped | Reuse as the seed for Discover > Beatport |
| Discovery UI | **Partial** | `/incrate` renders results as bare `<ul><li>` lists, not `ResultsTable` | Needs to adopt the Universal Track Table once it exists |
| Artist pages | **Missing** | Only string-matched curator identity exists, no artist entity/profile | — |
| Label pages | **Missing** | Only label-name → Beatport-label-ID resolution exists, no label entity/profile | — |
| Similar Tracks | **Missing** | No track-to-track similarity concept anywhere in the codebase | Net-new; genre/BPM/key/label/artist scoring could reuse matcher.py's scoring primitives conceptually |
| For You | **Missing** | No such concept exists | Depends on persistent library + ratings/tags existing first |

## E. Library organization (net-new product surface)

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Ratings, favorites, notes, tags | **Missing** | No CuePoint-owned metadata layer exists at all | Entirely new — depends on persistent Track entity |
| Collections | **Missing** | No concept exists | Entirely new |
| Smart Collections | **Missing** | No concept exists | Entirely new |
| Filter system | **Partial** | `ResultsScreen`'s matched/unmatched/needs-review `Select` is the only filter UI today | Needs generalizing into a reusable filter component |
| Global search | **Missing** | No search exists anywhere in the renderer | — |

## F. Player

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Audio playback (any form) | **Missing entirely** | Confirmed zero `<audio>`/player/waveform references anywhere in `renderer/src` | This is a from-scratch build — no existing code to reuse. Needs its own backend-selection ADR (target spec ADR-004) |
| Persistent player bar | **Missing** | No such UI exists | — |
| Track Inspector (persistent side panel) | **Missing** | `CandidateDialog` is the closest analog but is a modal, not a docked panel | — |

## G. Prepare (Sets)

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Sets, Chapters, Set Builder | **Missing entirely** | No concept exists anywhere | Entirely new, and depends on Player + persistent library existing first per the spec's own layering (§109) |
| Compatibility/next-track suggestions | **Missing** | No BPM/key/genre-based recommendation engine exists outside the Beatport-match scorer, which is a different problem (track-to-candidate, not track-to-track) | — |

## H. Intelligence (waveforms, audio analysis)

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Waveforms | **Missing entirely** | — | Depends on Player being solid first (target spec §92 gate) |
| Audio analysis (BPM validation, key, energy, etc.) | **Missing entirely** | — | Latest-phase work by design; no premature investment needed now |

## I. Application shell / UI infrastructure

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Pixel-art design system (tokens, themes, components) | **Exists, mature** | `tokens/tokens.css`, 5 themes, integer 1×/2×/3× scale, zero-radius + bevel/offset-shadow chrome, consistent component CSS | **Reuse and extend** — this is a real asset, not a gap. See `PIXEL_DESIGN_SYSTEM.md` |
| Pixel icon/sprite assets | **Missing** | Icons are Unicode glyph text; a 9-slice/Aseprite pipeline was specced (`docs/ui-overhaul/phase-1-pixel-design-system.md`, DS-3) but never implemented | Worth a decision: invest in real pixel iconography now, or defer |
| Persistent navigation shell (sidebar, header, search) | **Needs Refactor** | Current nav is a floating bottom pill (`app-lab-nav`), lab-era, not a real app shell | Target spec's shell (§7) requires a different structural layout, not just visual reskinning |
| Universal Track Table | **Partial** | `ResultsTable.tsx` — virtualized, sortable, resizable, sticky columns — is a strong base | Needs generalizing beyond match-results-specific columns and adopting across inCrate/Library/Collections |
| Reusable dialog/toast/badge/progress system | **Exists** | `Modal`, `Toast`, `Badge`, `ProgressBar`, `Tabs`, `TextField`, `Select` | Reuse directly |
| UI state persistence (window size, columns, scale, theme) | **Exists (Partial)** | Scale/theme/results-column-layout already persist to `localStorage` | Extend the same pattern to new surfaces (sidebar width, inspector width, last-selected page) rather than inventing a new mechanism |

## J. Cross-cutting / quality

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Renderer component test coverage | **Missing** | 10 Vitest files, all pure-utility logic, zero component/`.test.tsx` tests | Should be established as Foundation-phase discipline before UI surface grows |
| E2E coverage | **Missing (minimal)** | Single Playwright smoke test | Needs real flow coverage as Library/Player/Prepare land |
| CI enforcement on PRs | **Needs Refactor** | Main Python test suite (`test.yml`) and the real gate suite (`release-gates.yml`) both trigger on push, **not PR**; lint/mypy/security are soft-failed where they do run on PR-triggered workflows | Should be tightened as part of Foundation's CI-quality-gates step, independent of feature work |
| Updater | **Needs Refactor (effectively broken)** | Full Qt/Sparkle stack exists, disconnected from Electron; known issue already logged | Out of scope for early phases per target spec §107, but should be explicitly deprioritized/documented rather than left ambiguous |
| Qt boundary violation | **Needs Refactor** | Unguarded `QSettings` imports in `services/privacy_service.py` and `services/onboarding_service.py`, unscanned by `check_no_qt_in_core.py` | Small, mechanical fix; independent of the roadmap but should happen early since AGENTS.md already treats it as an invariant |

---

## What this means for sequencing (non-binding observation, not a decision)

The target vision's own layering (target spec §109: Foundation → Library → Player →
Organization → Clean → Discover → Prepare → Intelligence) lines up cleanly with what's
actually missing here: **A (persistence/domain) is the one gap that blocks nearly every other
row in this table.** C (matching/Clean) and I (design system) are the two areas where "reuse,
don't rebuild" clearly applies — they're mature. F (Player) and G (Prepare) are genuinely
greenfield with zero existing code to build on. This is consistent with, not a replacement for,
the phased roadmap the collaborative spec calls for — final phasing still depends on the
foundational product decisions in `OPEN_QUESTIONS.md`.
