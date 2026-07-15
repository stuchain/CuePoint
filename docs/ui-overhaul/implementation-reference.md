# Implementation reference

Where each lab behavior lives in the codebase. Use when cherry-picking into production.

## Lab app entry

| Path | Role |
| --- | --- |
| `apps/desktop-electron/renderer/src/App.tsx` | Routes, lab nav, scroll reset on navigation |
| `apps/desktop-electron/renderer/src/App.css` | `.app-main`, `.app-lab-nav` |
| `apps/desktop-electron/renderer/src/main.tsx` | React mount |
| `apps/desktop-electron/renderer/src/index.css` | Global imports (tokens, themes, fonts) |

## Screens

| Route | Component | Key classes |
| --- | --- | --- |
| `/` | `ToolSelectionScreen.tsx` | `screen--center` |
| `/match` | `InKeyMainScreen.tsx` | `screen--stack`, `match-layout` |
| `/results` | `ResultsScreen.tsx` | `screen--fill`, `results-frame` |
| `/settings` | `SettingsExportScreen.tsx` | `screen--scroll`, `app-page-scroll` body |

Shared screen CSS: `screens/screens.css`

## Layout & tokens

| Path | Role |
| --- | --- |
| `tokens/layout.css` | Content width, safe areas, results frame max width |
| `tokens/tokens.css` | Scale, spacing, typography, `html/body/#root` height |
| `tokens/scale.ts` | Scale persistence + `--scale` on `:root` |
| `tokens/ScaleContext.tsx` | React scale state |
| `tokens/theme.ts` | Theme persistence |
| `tokens/ThemeContext.tsx` | Theme + custom themes |
| `tokens/themeDerivation.ts` | Auto border/bevel colors from 8 editor colors |

## Results table

| Path | Role |
| --- | --- |
| `components/ResultsTable.tsx` | Grid, sort, virtual rows, column resize |
| `components/ResultsTable.css` | Grid, sticky, scrollbars, resizer hit target |
| `components/resultsTableLayout.ts` | Width defaults, clamps, persistence, frame limits |
| `components/useResultsFrameLayout.ts` | Outer frame drag resize |
| `mocks/resultsColumns.ts` | Column defs, indices, per-column min widths |
| `mocks/fixtures.ts` | Sample `TrackResult[]` |
| `mocks/types.ts` | `TrackResult`, `ProgressInfo` |

Tests: `components/resultsTableLayout.test.ts`, `mocks/resultsColumns.test.ts`

## Settings / appearance

| Path | Role |
| --- | --- |
| `screens/ThemeSettingsPanel.tsx` | Appearance panel |
| `screens/theme-settings.css` | Theme editor layout |
| `tokens/themes/*.css` | Built-in theme palettes |

## Components (pixel chrome)

| Path | Notes |
| --- | --- |
| `components/Panel.tsx` + `Panel.css` | `cp-panel--fill`, `cp-panel--in-frame` for Results |
| `components/Button.css` | Bevel + pressed transform |
| `components/ToolbarIcon.css` | `--hit-min` square targets |

Storybook stories under `components/*.stories.tsx`.

## localStorage keys (lab)

| Key | Written by |
| --- | --- |
| `cuepoint-ui-lab-theme` | `theme.ts` |
| `cuepoint-ui-lab-scale` | `scale.ts` |
| `cuepoint-ui-lab-custom-themes` | `ThemeContext` |
| `cuepoint-ui-lab-results-layout` | `resultsTableLayout.ts` |

Production should use app settings / QSettings equivalents — same JSON shape is fine.

## CSS variables quick reference

| Variable | Typical @ 2× |
| --- | --- |
| `--scale` | 2 |
| `--unit` | 8px |
| `--hit-min` | 88px |
| `--space-lg` | 24px |
| `--row-height` | ~66px |
| `--content-max-width` | min(1200px, 100%) |
| `--results-frame-max-width` | 80vw |

## Body classes reference

| Class | When | Effect |
| --- | --- | --- |
| `app-page-scroll` | Settings mounted | Document scroll, top-aligned main |
| `results-page-scrollable` | Results frame user-sized | Document scroll, centered frame |
| `results-table--resizing` | Column drag | `user-select: none` |
| `results-frame--resizing` | Frame drag | Resize cursor |

## Python parity targets

| Lab type / column | Qt / Python source |
| --- | --- |
| `TrackResult` | `cuepoint/ui/gui_interface.py` |
| Column indices | `results_view.py` `COL_*` |
| Min visible rows | Qt results view (~10 rows) |

## Commands

```bash
cd apps/desktop-electron/renderer
npm run dev        # UI lab
npm run test       # vitest (layout + columns)
npm run build      # production bundle
npm run storybook  # component gallery
```
