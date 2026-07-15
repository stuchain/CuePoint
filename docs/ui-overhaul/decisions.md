# Decisions & scope

Choices locked during UI Lab layout work. Do not revert without explicit product sign-off.

## Chrome & navigation

| Decision | Detail |
| --- | --- |
| **Keep floating lab nav** | Bottom-center bar: Tools, inKey, Results, Settings. Fixed position; content uses extra bottom safe-area so panels are not covered. |
| **Remove top-right theme/scale** | Theme picker and scale control were removed from `App.tsx`. All appearance controls live in **Settings → Appearance**. |
| **Default UI scale** | **2×** — stored in `localStorage` (`cuepoint-ui-lab-scale`). Options: 1× compact, 2× default, 3× large. |
| **Integer scale only** | Scale factors 1, 2, 3 — crisp pixel borders via `--scale` CSS variable (not `transform: scale()` on the root). |

## Results screen

| Decision | Detail |
| --- | --- |
| **Centered results panel** | Table + panel wrapper centered in the viewport. |
| **Max frame width** | **80vw** (`--results-frame-max-width`). Frame width also capped in JS (`FRAME_MAX_WIDTH_RATIO = 0.8`). |
| **Page scroll when oversized** | If the user resizes the results frame beyond the default viewport fill, enable **document scroll** (`body.results-page-scrollable`), not nested `.app-main` scroll. |
| **Resizable outer frame** | Corner handle resizes Panel + table together. Double-click handle resets to default fill behavior. |
| **Resizable columns** | Drag the right edge of each header cell. Double-click resizer resets that column to default width. |
| **Persist layout** | Column widths + frame size saved to `localStorage` (`cuepoint-ui-lab-results-layout`). |
| **Per-column minimum widths** | Not all columns use 80px minimum — narrow data columns (Index, Write, Key, etc.) have smaller floors. See [Results table](results-table.md). |

## Settings screen

| Decision | Detail |
| --- | --- |
| **Long-page scroll** | Settings uses **document scroll** (`body.app-page-scroll`), not flex-centered clipping inside `.app-main`. |
| **Top-aligned stack** | `screen--scroll` uses `justify-content: flex-start` so toolbar and Appearance header are visible at scroll position 0. |
| **Reset scroll on route change** | Navigating between lab routes scrolls window (and `.app-main`) to top. |
| **Appearance panel full width** | On scroll screens, theme settings span content width (not narrow form width). |

## Match / tools (spacing)

| Decision | Detail |
| --- | --- |
| **Equal-height match panels** | Two-column grid stretches both panels to the same height. |
| **Drop zone minimum height** | `min-height: calc(var(--hit-min) * 3)` so empty state is usable at 2× scale. |
| **Stats + actions rhythm** | Stats grid spacing and match action bar pinned to panel bottom via flex. |

## Out of scope (lab only)

- Real Beatport token storage / export paths (mock copy only).
- Engine API wiring (Phase 3+ in design sign-off).
- Replacing Qt with web renderer in production (this doc describes **what to port**, not a big-bang swap).

## Supersedes

The following in `apps/desktop-electron/docs/design-signoff.md` is **outdated**:

- “Theme/scale controls stay fixed top-right” → now **Settings only**.
- “Route nav bottom-left” → lab nav is **bottom-center**.
- Global “80px min for all columns” → **per-column minimums** in `resultsColumns.ts`.

When in conflict, prefer this folder for layout and chrome placement.
