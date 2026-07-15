# Results table

14-column results grid aligned with Qt `results_view.py` `COL_*` indices. Implemented in the lab with virtualization, sticky columns, and user-resizable layout.

## Column map

File: `apps/desktop-electron/renderer/src/mocks/resultsColumns.ts`

| Index | ID | Label | Sortable | Sticky | Min width (CSS px, pre-scale) |
| --- | --- | --- | --- | --- | --- |
| 0 | write | Write | No | Yes | 36 |
| 1 | index | Index | Yes | Yes | 48 |
| 2 | originalTitle | Original Title | Yes | No | 80 (default) |
| 3 | originalArtists | Original Artists | Yes | No | 80 |
| 4 | beatportTitle | Beatport Title | Yes | No | 80 |
| 5 | beatportArtists | Beatport Artists | Yes | No | 80 |
| 6 | key | Key | Yes | No | 56 |
| 7 | camelotKey | Camelot Key | Yes | No | 64 |
| 8 | releaseYear | Release Year | Yes | No | 64 |
| 9 | label | Label | Yes | No | 80 |
| 10 | matched | Matched | Yes | No | 56 |
| 11 | score | Score | Yes | No | 56 |
| 12 | confidence | Confidence | Yes | No | 64 |
| 13 | bpm | BPM | Yes | No | 56 |

**Default sort:** Index ascending (`DEFAULT_SORT_COLUMN = COL_INDEX`).

**Sticky columns:** Write + Index — header and cells use `position: sticky` with `left` offset computed from prior sticky column widths.

### Why Index could not shrink (fixed)

Previously every column shared a **global 80px minimum** (`COL_MIN_PX × scale`). At 2× scale that meant 160px floor for Index even though values are 1–3 digits.

**Fix:** optional `minWidthPx` per column in `ResultsColumnDef`; resize clamp uses `getColumnMinWidth(colIndex, scale)`.

## Default column widths (at scale S)

File: `resultsTableLayout.ts` → `defaultColumnWidths(scale)`

| Column | Default (approx) |
| --- | --- |
| Write, Index, Key, Matched, Score, BPM | column minimum |
| Original / Beatport Title | 140 × S |
| Original / Beatport Artists, Label | 120 × S |
| Camelot Key, Release Year, Confidence | 96 × S |

Double-click a column resizer resets that column to its default.

## Column resize UX

| Action | Behavior |
| --- | --- |
| Drag header right edge | Resize single column; clamped to column’s `minWidthPx × scale` |
| Double-click resizer | Reset column to default width |
| During drag | `body.results-table--resizing` — no text selection |

Grid template is applied via inline CSS variable:

```css
grid-template-columns: var(--results-grid-columns); /* e.g. "72px 96px 280px ..." */
```

## Outer frame resize

Files: `ResultsScreen.tsx`, `useResultsFrameLayout.ts`

| Action | Behavior |
| --- | --- |
| Drag corner handle (`.results-frame__resizer`) | Resize panel + table wrapper together |
| Double-click handle | Reset frame to viewport-fill mode |
| Width clamp | min 320px, max **80% of viewport** |
| Height clamp | min 280px, max 4000px |
| When sized | `body.results-page-scrollable`, frame centered, `max-width: 80vw` |

Constants:

```ts
FRAME_MIN_WIDTH = 320
FRAME_MIN_HEIGHT = 280
FRAME_MAX_WIDTH_RATIO = 0.8
FRAME_MAX_HEIGHT = 4000
```

## Persistence

**Key:** `cuepoint-ui-lab-results-layout`  
**Shape:**

```ts
{
  columnWidths: number[];  // length 14, scaled CSS px
  tableWidth: number | null;
  tableHeight: number | null;
}
```

- Loaded on mount; clamped through `clampColumnWidths` when scale changes.
- Patched on column width change and frame resize.
- Invalid / wrong-length arrays fall back to defaults.

## Visual rules

| Rule | Token / class |
| --- | --- |
| Unmatched row background | `--row-unmatched-bg` (`#5c2e2e`) |
| Selected row | `.results-table__row--selected` |
| Row height | `--row-height` (virtualizer + CSS) |
| Header sticky | `.results-table__header` `position: sticky; top: 0` |
| Themed scrollbars | `.results-table__scroll` webkit + `scrollbar-color` |
| Header ellipsis | Narrow columns truncate label; full label in `title` |

## Virtualization

- Library: `@tanstack/react-virtual`
- Scroll container: `.results-table__scroll`
- Row positioning: `translateY` per virtual item
- Overscan: 10 rows

## Qt parity notes for production

When porting to `QTableView` / custom delegate:

1. Keep **column index order** identical to Python constants.
2. Persist column widths + optional table outer size in app settings (not just lab `localStorage`).
3. Implement **per-column minimums** — do not use one global minimum for Index and Title.
4. Sticky Write + Index: Qt may need frozen-column pattern or duplicate header row.
5. Default sort Index ascending matches current Qt behavior — verify before changing.

## Production port checklist

- [ ] 14 columns with same indices and labels
- [ ] Sticky Write + Index
- [ ] Per-column min widths (especially Index 48px base)
- [ ] Column drag resize + double-click reset
- [ ] Optional outer panel resize with 80vw max width
- [ ] Persist layout in user settings
- [ ] Virtual scrolling or equivalent for large result sets
