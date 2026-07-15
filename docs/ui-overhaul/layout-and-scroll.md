# Layout & scroll

How the lab shell sizes content and when scrolling happens. Critical for avoiding “stuck at top but content clipped” bugs.

## App shell structure

```
html / body / #root (flex column, height 100% by default)
└── BrowserRouter
    ├── nav.app-lab-nav     (fixed, bottom-center)
    └── main.app-main       (flex: 1, overflow: hidden, justify-content: center)
        └── .screen         (route content)
```

**Default (viewport-locked screens):** `#root` and `.app-main` fill the viewport. `.app-main` uses `overflow: hidden` and vertically centers short stacks (`screen--stack:not(.screen--fill):not(.screen--scroll)`).

**Scroll pages:** A body class breaks the height lock so the **document** grows and scrolls.

## Layout tokens

File: `apps/desktop-electron/renderer/src/tokens/layout.css`

| Token | Value | Purpose |
| --- | --- | --- |
| `--content-max-width` | `min(1200px, 100%)` | Stack screens (Settings, Match) |
| `--content-narrow-width` | `min(480px, 100%)` | Settings form fields |
| `--screen-padding` | `space-xl` (responsive ↓ at 900px / 600px) | Base outer padding |
| `--safe-top` | `var(--screen-padding)` | Clears top edge |
| `--safe-bottom` | `screen-padding + 48px` | Clears bottom lab nav |
| `--safe-left` / `--safe-right` | `var(--screen-padding)` | Horizontal padding |
| `--row-height` | `0.75 × --hit-min` | Table virtual row height |
| `--results-frame-max-width` | `80vw` | Cap for user-resized results frame |
| `--results-min-rows` | `10` | Qt parity reference for min visible rows |

Breakpoints (reference): `--bp-sm` 600px, `--bp-md` 900px, `--bp-lg` 1200px.

## Screen class matrix

| Class | Use | Flex behavior |
| --- | --- | --- |
| `screen` | Base | Column flex, safe-area padding |
| `screen--stack` | Most pages | Vertical stack, gap `space-lg` |
| `screen--center` | Tool picker | Centered hero layout |
| `screen--fill` | Results (default) | Fills viewport; internal table scroll |
| `screen--scroll` | Settings | Top-aligned; participates in document scroll |
| `screen--scrollable` | Results when frame sized | Frame no longer flex-fills viewport |

### Important rule

**Do not vertically center tall scroll pages.**  
`screen--stack.screen--scroll` must use `justify-content: flex-start`. Centering a stack taller than the viewport clips top and bottom even at `scrollTop === 0`.

## Scroll strategies

Two body classes share the same “break out of flex viewport” CSS:

| Body class | Set by | When |
| --- | --- | --- |
| `results-page-scrollable` | `ResultsScreen` | User has resized the results frame (`isSized === true`) |
| `app-page-scroll` | `SettingsExportScreen` | Always while Settings route is mounted |

### Shared CSS behavior (`screens.css`)

When either class is on `body`:

1. `html` and `body`: `height: auto`, `min-height: 100%`, `overflow-y: auto`
2. `#root`: `height: auto`, `min-height: 100vh`
3. `.app-main`: `overflow: visible`, `flex: none`, `justify-content: flex-start`
4. Extra bottom padding on `screen--scroll` for lab nav clearance

### Route scroll reset

`App.tsx` — on `location.pathname` change:

```ts
window.scrollTo(0, 0);
document.querySelector(".app-main")?.scrollTo(0, 0);
```

Prevents carrying scroll position from Results → Settings.

## Lab navigation chrome

File: `App.css`

- **Position:** `fixed`, `bottom: var(--space-md)`, horizontally centered (`left: 50%`, `translateX(-50%)`)
- **Z-index:** 900
- **Safe area:** `--safe-bottom` includes ~48px extra above the nav bar

## Match layout

File: `screens.css`

| Rule | Detail |
| --- | --- |
| `.match-layout` | 2-column grid, `align-items: stretch` |
| `@media (max-width: 900px)` | Single column stack |
| `.match-layout .cp-panel` | `height: 100%` — equal panel heights |
| `.drop-zone` | `min-height: calc(var(--hit-min) * 3)` |
| `.match-actions` | `margin-top: auto` — actions at panel bottom |

## Overflow chain (Results, viewport-fill mode)

When the frame is **not** user-sized, the table scrolls inside the panel:

```
.app-main (overflow hidden)
  └── .screen--fill (overflow hidden)
        └── .results-frame (min-width: 0)
              └── .cp-panel--fill (min-width: 0)
                    └── .results-panel-body (min-width: 0)
                          └── .results-table (overflow hidden)
                                └── .results-table__scroll (overflow auto)
```

Every flex child in the chain needs `min-width: 0` (and usually `min-height: 0`) so horizontal scroll stays inside the table, not the window.

## Responsive behavior

| Viewport | Behavior |
| --- | --- |
| ≥1200px | Full content width; match two columns |
| 900–1199px | Match stacks; results horizontal scroll inside table |
| 600–899px | Toolbar wraps; stats grid 2 columns |
| <600px | Single column; tighter safe-bottom (40px nav clearance) |

## Pitfalls (learned in lab)

1. **Adding `overflow: auto` only on `.app-main`** — insufficient; flex centering + `height: 100%` chain still clips.
2. **`justify-content: center` on tall stacks** — top content unreachable at scroll 0.
3. **Two competing scroll owners** — pick document scroll OR inner panel scroll per screen mode; do not both fight.
4. **Forgetting `html` height** — body scroll alone fails if `html` stays `height: 100%`.

## Production port checklist

- [ ] Mirror layout tokens in Qt stylesheets or shared CSS variables
- [ ] Implement body/document scroll mode for Settings-equivalent long pages
- [ ] Keep Results inner scroll for default mode; document scroll only when panel exceeds viewport
- [ ] Reset scroll position on main-window page / stack changes
- [ ] Preserve bottom safe-area for any persistent nav/toolbar
