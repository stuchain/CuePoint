# Rollout phases

Suggested order to land lab work in the **shipping app** without a big-bang UI rewrite. Each phase is independently testable.

## Phase 0 — Baseline (done in lab)

- [x] Pixel-art component set + Storybook
- [x] Five built-in themes + custom theme editor
- [x] Mock screens: Tools, inKey, Results, Settings
- [x] Layout tokens, safe areas, lab nav
- [x] Results 14-column table with virtualization
- [x] Column + frame resize with persistence
- [x] Settings document scroll + appearance-only theme/scale
- [x] Per-column minimum widths

**Reference:** run lab at `apps/desktop-electron/renderer`.

---

## Phase A — Layout foundation (production)

**Goal:** Shared spacing and scroll behavior without changing Qt widgets yet.

| Task | Lab source | Production target |
| --- | --- | --- |
| Content max width + screen padding | `layout.css` | Main window margins / stylesheet |
| Bottom safe-area for nav/toolbars | `--safe-bottom` | Main window layout |
| Document scroll for long settings | `app-page-scroll` pattern | Settings stack widget / scroll area |
| Route / page scroll reset | `App.tsx` | Stack index change handler |
| Match equal-height panels | `match-layout` CSS | `main_window.py` Input \| Processing | Done |

**Exit criteria:** Settings page fully scrollable at 2×; no clipped headers; scroll resets on section change.

---

## Phase B — Results table parity

**Goal:** Qt results view matches lab column behavior.

| Task | Lab source | Production target | Status |
| --- | --- | --- | --- |
| 14 columns, same indices | `resultsColumns.ts` | `results_view.py` | Done |
| Per-column min widths | `minWidthPx` map | `results_column_layout.py` | Done |
| Column drag resize | `startColumnResize` | `QHeaderView.Interactive` | Done |
| Double-click reset column | ResultsTable handler | `sectionHandleDoubleClicked` | Done |
| Persist column widths | `cuepoint-ui-lab-results-layout` | `QSettings` `results/columnWidths` | Done |
| Sticky Write + Index | `ResultsTable.css` | `ResultsFrozenTableHost` | Done |
| Unmatched row styling | `--row-unmatched-bg` | Existing delegate | Done |
| Default sort Index asc | `DEFAULT_SORT_COLUMN` | Existing Qt behavior | Done |

**Exit criteria:** User can narrow Index below old 80px floor; layout restores on restart.

---

## Phase C — Results frame & width cap (optional polish)

**Goal:** Large-monitor behavior — centered panel, max 80vw, optional outer resize.

| Task | Lab source | Production target | Status |
| --- | --- | --- | --- |
| Centered results container | `results-frame--sized` | `ResultsFrameHost` | Done |
| 80vw max width | `clampFrameWidth` | `results_frame_layout.py` | Done |
| Outer resize handle | `useResultsFrameLayout` | `_FrameResizeGrip` | Done |
| Document scroll when oversized | `results-page-scrollable` | Parent `QScrollArea` horizontal policy | Done |

**Exit criteria:** Resizing panel wider than viewport scrolls the window; panel never exceeds 80% screen width.

Modules: [`results_frame_layout.py`](../../src/cuepoint/ui/widgets/results_frame_layout.py), [`results_frame_host.py`](../../src/cuepoint/ui/widgets/results_frame_host.py)

---

## Phase D — Appearance consolidation

**Goal:** Single settings location for theme and scale (lab decision).

| Task | Lab source | Production target | Status |
| --- | --- | --- | --- |
| Remove duplicate theme/scale chrome | Removed from `App.tsx` | No extra Qt chrome (none existed) | Done |
| Settings → Appearance section | `ThemeSettingsPanel` | `AppearanceSettingsWidget` in Settings dialog | Done |
| Custom themes | `ThemeContext` + derivation | QSettings JSON + 8-color editor | Done |
| Default scale 2× | `scale.ts` default | `appearance/uiScale` QSettings default | Done |

**Exit criteria:** No theme picker outside Settings; scale change updates entire app crisply.

Modules: [`appearance/`](../../src/cuepoint/ui/appearance/), [`appearance_settings.py`](../../src/cuepoint/ui/widgets/appearance_settings.py)

QSettings keys: `appearance/theme`, `appearance/uiScale`, `appearance/customThemes`

---

## Phase E — Electron renderer wiring (future)

**Goal:** Replace or embed Qt views with lab React components where appropriate.

Depends on Phase 3 engine API from design sign-off. Not part of current layout pass.

| Task | Notes | Status |
| --- | --- | --- |
| IPC for real `TrackResult[]` | Replace `mocks/fixtures.ts` when no engine results | Done |
| Real export flow | Wire Export modal to engine | Done |
| Beatport token field | Real secure storage via engine config API | Done |

---

## Testing each phase

| Layer | What to run |
| --- | --- |
| Lab unit tests | `npm run test` in renderer (layout + columns) |
| Lab manual | All routes at 1×, 2×, 3× scale |
| Production | Existing Qt tests + visual check Results + Settings |
| Regression | Index column resize below 96px @ 2×; Settings scroll top-to-bottom |

---

## Tracking

Copy this checklist into a GitHub issue or project board. Mark phases complete as they land in `main` — update [README status table](README.md) when a phase ships.
