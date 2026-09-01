# CuePoint — Pixel-Art Design System (Current State Audit)

Status: **Audit — describes what exists today.** This is the baseline the target vision's design
system work must preserve and extend (per the evolution spec: "the pixel-art identity that exists
today must survive and become MORE polished, not disappear"). No changes proposed here yet — see
`OPEN_QUESTIONS.md` for the open design-direction questions this audit feeds.

Source of truth in-repo: `apps/desktop-electron/renderer/src/tokens/` (`tokens.css`, `layout.css`,
`fonts.css`, `themes/*.css`, `theme.ts`, `scale.ts`, `customThemes.ts`, `themeDerivation.ts`), plus
one hand-written `.css` file per component in `renderer/src/components/`. Plain CSS custom
properties — no styled-components, no Tailwind, no CSS modules.

## Scale mechanism

`--scale` is the root CSS custom property (default `2`); nearly every size token
(`--space-*`, `--font-size-*`, `--border-width*`, `--bevel-size*`, `--hit-min`, `--shadow-*`) is
`calc(<base-px> * var(--scale))`. `SCALE_OPTIONS = [1, 2, 3]` — **integer-only by design**, applied
via `document.documentElement.dataset.scale` + a `style.setProperty`, deliberately not
`transform: scale()` (keeps borders crisp). Persisted to `localStorage` key
`cuepoint-ui-lab-scale`. Controls live in Settings → Appearance only (moved off the top-right
chrome per `docs/ui-overhaul/decisions.md`).

## Color palette — 5 built-in themes

Each theme defines the same token set: `--bg-app`, `--bg-panel`, `--bg-panel-alt`, `--bg-input`,
`--bg-toolbar`, `--border-highlight/-shadow/-outline/-light/-muted`, `--bevel-highlight/-shadow`,
`--fg-primary/-muted/-disabled/-inverse`, `--accent-primary/-hover/-pressed/-secondary/-success/
-warning/-danger/-info`, `--overlay-header`, `--overlay-backdrop`.

| Theme ID | bg-app | bg-panel | accent-primary | fg-primary | Character |
|---|---|---|---|---|---|
| `neoDark` (**default**) | `#18181b` | `#27272a` | `#8b5cf6` violet | `#fafafa` | Modern-product zinc base |
| `retro16` | `#1a1a2e` | `#3d5a80` | `#ee6c4d` coral | `#e0fbfc` | Original lab look; also the `:root` fallback |
| `qtEvolved` | `#1e1e1e` | `#252526` | `#0078d4` blue | `#ffffff` | Matches the old PySide6 dark theme, for continuity |
| `clubNeon` | `#0a0a0f` | `#14141f` | `#e040fb` magenta + `#00e5ff` cyan info | `#f0f0ff` | "DJ neon" |
| `mutedPro` | `#1c1f26` | `#2a3140` | `#f59e0b` amber | `#e8eaed` | Long-session comfort |

`--border-outline` is `#000000` in **all five** themes — every panel/button/modal is outlined in
solid black regardless of theme; this is the core pixel-chrome signature that survives theme
switches. Users can also define custom themes from 8 base colors (Settings → Appearance); border/
bevel/hover shades auto-derive via `themeDerivation.ts`. Custom themes persist to
`cuepoint-ui-lab-custom-themes`; active theme choice to `cuepoint-ui-lab-theme`.

`apps/desktop-electron/docs/design-signoff.md` ran contrast checks at 2× scale for all 5 themes
(all pairs ≥4.5:1 except a couple ~4.5–4.9:1 borderline "muted" pairs) and verified hit-targets
(buttons 88×44 CSS px @2×, toolbar icons 88×88, modal close 88×88).

## Typography

Single family: `--font-pixel: "Pixelify Sans", "Segoe UI", sans-serif`, loaded via Google Fonts
`@import` (weights 400/500/600/700). Discrete scale: `--font-size-xs: 10px×scale`,
`-sm: 12px`, `-md: 14px`, `-lg: 18px`, `-xl: 24px` (all ×scale). Buttons/panel titles use
weight 600–700. **Open item already flagged in-repo**: `docs/ui-overhaul/phase-1-pixel-design-system.md`
lists "Pixelify Sans acceptable for table readability (or swap font ADR)" as an unchecked
sign-off item — table-density readability at small sizes hasn't been formally confirmed.

## Spacing

`--unit: calc(4px * var(--scale))`; `--space-xs/sm/md/lg/xl` = `1×/1.5×/2×/3×/4×` unit.

## Borders, corners, bevels, shadows — the pixel-chrome signature

- **`--radius-sm: 0`** everywhere — confirmed no component overrides this with a non-zero
  `border-radius` (checked Button, Panel, Modal, Badge, TextField, Toast, Tabs, ListRow,
  ResultsTable). Fully square corners throughout, by design.
- `--border-width: 2px×scale` standard; `--border-width-heavy: 3px×scale` on `.cp-modal` only.
  All borders solid `var(--border-outline)` (black).
- Bevel effect (`--shadow-bevel`, `-panel`, `-sm`, `-pressed`): paired `inset` box-shadows
  (highlight top-left, shadow bottom-right) from theme-specific `--bevel-highlight`/`-shadow`.
- Hard, **zero-blur offset** drop shadows: `--shadow-panel` = `4px×scale 4px×scale 0
  var(--border-shadow)`, `--shadow-modal` = `8px×scale 8px×scale 0`, `--shadow-badge` =
  `2px×scale 2px×scale 0` — the classic "pixel-art chrome" look (no soft/blurred shadows anywhere).
- Buttons get a physical pressed-state: `.cp-btn:active` translates `(1px×scale, 1px×scale)` and
  swaps to `--shadow-bevel-pressed` (inverted bevel) — simulates a depressed 3D button.

## Icons — the one real asset gap

> **Partly closed by FOUNDATION-14.** Ten icons now exist as 12×12 pixel grids in
> `renderer/src/components/pixelIcons.ts`, rendered by `PixelIcon.tsx` as SVG rectangles filled
> with `currentColor` so one drawing serves all five themes. Sized from `--icon-size`
> (`24px * var(--scale)`), so a grid cell is always a whole number of CSS pixels. Unicode glyphs
> remain the path for secondary actions per DEC-010. The audit below describes the state before
> that step.

**No pixel sprite/icon assets exist.** `ToolbarIcon.tsx` renders icons as **Unicode glyph text**
(e.g. `☰`) inside a styled button — not sprite sheets or PNGs. `renderer/src/assets/` contains only
Vite/React boilerplate (`hero.png`, `react.svg`, `vite.svg`). `image-rendering: pixelated` is set
globally on `body`, and a `.pixel-canvas` utility class exists but has no actual image/canvas
content using it. The 9-slice/Aseprite pipeline specced in
`docs/ui-overhaul/phase-1-pixel-design-system.md` (DS-3: "9-slice for panels/buttons... document
pipeline Aseprite → PNG") **was never implemented** — everything visual today is CSS-drawn
(bevels/shadows/borders), not bitmap art.

## Component inventory (all under `renderer/src/components/`)

| Component | Notes |
|---|---|
| `Button` | primary / secondary / danger variants; hover = brightness filter; active = translate + inverted bevel; disabled = 0.55 opacity; loading reuses pressed visual |
| `Panel` | black-outlined box, bevel + drop shadow, optional header/badge, `--fill` variant for viewport-filling layouts |
| `Modal` | full-screen backdrop + centered box, heavier 3px border, 88×88 close button; 15 feature dialogs built on it |
| `TextField` / `Select` | recessed "carved-in" look via deep inset shadow; focus = solid accent-info ring; error = red border + hint text |
| `ResultsTable` | virtualized (`@tanstack/react-virtual`), sortable, resizable, sticky header + Write/Index columns, 14-column grid, themed scrollbar, column widths persist to `localStorage` |
| `ListRow` | simpler 3-col grid row primitive; hover tint via `color-mix`; selected = inset accent-info outline |
| `Toast` | fixed bottom-right stack, 4 variants, slide-up-fade-in, black-outlined with hard shadow |
| `Badge` | small square (not pill) label, 5 variants, 2px offset shadow |
| `Tabs` | segmented control; active tab filled + inverse text; **flagged in design-signoff**: tab height (66px @2×) is below the 44px CSS-px hit-target floor — unresolved |
| `ProgressBar`, `ToolbarIcon`, `AppMenuBar`, `EngineStatusBanner` | present, consistent with the system |

## What this means for the target design system work

This is a genuinely mature, internally consistent token system — the "reuse, don't redesign" case
from the target vision applies directly. The gaps worth deciding on (not deciding here, just
flagging — see `OPEN_QUESTIONS.md`):

1. **Icons**: stay with styled Unicode glyphs (cheap, already working) vs. invest in real pixel
   sprite iconography (matches the "pixel-art identity" ambition more literally, but is real
   asset-production work with no existing pipeline).
2. **Naming debt**: several `localStorage` keys and one CSS class (`app-lab-nav`) still carry a
   `-ui-lab-` naming that predates the shipping-product framing — cosmetic, low-risk to rename,
   but touches persisted user state (would need a migration, not just a rename).
3. **Tabs hit-target**: the known-and-logged sub-44px tab height should get an explicit decision
   (fix now vs. accept for secondary nav) rather than staying an open item indefinitely.
4. **Font readability at density**: Pixelify Sans's suitability for dense data tables (the
   Universal Track Table will be exactly this) was never formally signed off.

None of this blocks reusing the system as the foundation for SHELL/LIBUI phase work.
