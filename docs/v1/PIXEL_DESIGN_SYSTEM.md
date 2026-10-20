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

`--scale` is the root CSS custom property (default `1.5`); nearly every size token
(`--space-*`, `--font-size-*`, `--border-width*`, `--bevel-size*`, `--hit-min`, `--shadow-*`) is
`calc(<base-px> * var(--scale))`. `SCALE_OPTIONS = [1, 1.25, 1.5, 2, 3]` and `DEFAULT_SCALE = 1.5`
(DEC-161; Compact 1.25 added by R2-5). A fresh install (nothing stored, first-run guide not finished) opens at
`suggestedScale(screen.availHeight)`: 1.25 under 860 px, else 1.5, stepping down to the largest size that is not too big for the screen; an updater keeps 1.5. A size is disabled when
`screen.availHeight / scale < MIN_ROWS_HEIGHT` (560), never the current one; the stored value is read with `Number` and anything not on the list reads as the default,
so a stored 1, 2 or 3 is kept. Applied via `document.documentElement.dataset.scale` + a `style.setProperty`, deliberately not
`transform: scale()` (keeps borders crisp). Persisted to `localStorage` key
`cuepoint-ui-lab-scale`. Controls live in Settings → Appearance only (moved off the top-right
chrome per `docs/ui-overhaul/decisions.md`).

**Whole pixels at 1.25×.** At 1.25 the tokens that would be 7.5 or 2.5 px are rounded in the stylesheet:
`--space-sm` rounds to nearest (8 px), `--border-width`, `--bevel-size`, `--focus-ring-width` and the shadow
offsets round down, and `--icon-size` is `round(down, calc(24px * var(--scale)), 12px)`, so icons stay 24 px
(crisp 2 px cells). The values at 1, 1.5, 2 and 3 are unchanged.

**Whole pixels at 1.5×.** An even base is whole at 1.5×; an odd one is not (1.25× is covered above). `tokens.css` therefore
has one hairline token, `--hairline: max(1px, round(down, calc(1px * var(--scale)), 1px))`: 1, 1, 1, 2
and 3 pixels at 1×, 1.25×, 1.5×, 2× and 3×. Every 1px line (borders, the small bevel, outline offsets) uses it.
It rounds **down** because Chromium floors a border width: a 1.5px border is drawn 1px, and a shadow
of the same token must agree with it, not blur across two device pixels. The other odd sizes round to
a whole pixel in the stylesheet (`--border-width-heavy`, `--row-height`, the badge's padding). A
renderer test (`cssScale.test.ts`) reads every stylesheet and fails on a `calc(<n>px * var(--scale))`
whose base times 1.5 is not whole, unless it sits inside `round(`. `--row-height` is registered with
`@property` (`<length>`) so `getComputedStyle` answers a resolved length, which the table reads.
Canvases round the scale themselves (`round(scale × devicePixelRatio)`, `round(scale)`).

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

Single family: `--font-pixel: "Pixelify Sans", "Segoe UI", sans-serif`, bundled from
`@fontsource/pixelify-sans` (SIL OFL 1.1; weights 400/600/700; DEC-232). Discrete scale: `--font-size-xs: 10px×scale`,
`-sm: 12px`, `-md: 14px`, `-lg: 18px`, `-xl: 24px` (all ×scale). Buttons/panel titles use
weight 600–700. **Open item already flagged in-repo**: `docs/ui-overhaul/phase-1-pixel-design-system.md`
lists "Pixelify Sans acceptable for table readability (or swap font ADR)" as an unchecked
sign-off item — table-density readability at small sizes hasn't been formally confirmed.

> **Closed by DEC-048 (LIBUI-04).** A second token, `--font-data`, now exists and is used for
> **table cell values and Inspector field values only**; everything that is chrome — headers,
> buttons, labels, panel titles, navigation — stays on `--font-pixel`. The pixel identity lives
> in the black outlines, the bevels, the hard zero-blur shadows and the square corners, not in
> the numerals, and the track table is the one screen a user reads for hours. It is a system
> stack rather than a second bundled font, so the packaged app renders the same offline;
> being a token, a theme or a later decision can point it back at `--font-pixel` in one line.
>
> **Figures and lines (area 56, one font in a line).** Pixel words take `--font-pixel-digits`, which draws
> their digits and signs in the data face; a line of facts, counts or notes under a title (dates, BPM,
> keys, "5,805 tracks found", a status with a number) takes `--font-meta`, the data face for the whole
> line, so one line is never two fonts. Titles, chips, buttons, tabs and labels stay pixel.

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

> **Quieter chrome (DEC-241, 2026-10-12).** The app's controls and panels no longer use the bevel
> and offset-shadow tokens above; they stay defined for the player bar, the queue-count badge and
> the website. Controls (Button, Select, TextField, pane buttons) are flat: one height
> `--control-height`, a 1px `--border-control` border, the pixel font at `--control-font-size` and
> weight 400; `.cp-btn:active` keeps the 1px translate without the bevel. Panels, menus, toasts,
> dropdowns and the search box have a 1px border and no shadow; dialogs keep one soft
> `--shadow-dialog`. Selected rows use `--selected-row-background` (a lighter `--bg-selected` fill
> with a thin accent bar on the left). Tabs are underline tabs. The player bar keeps its boxed look.

## Icons — the one real asset gap

> **Partly closed by FOUNDATION-14.** Icons now exist as 12×12 pixel grids in
> `renderer/src/components/pixelIcons.ts`, rendered by `PixelIcon.tsx` as SVG rectangles filled
> with `currentColor` so one drawing serves all five themes. Sized from `--icon-size`
> (`24px * var(--scale)`), so a grid cell is always a whole number of CSS pixels. Unicode glyphs
> remain the path for secondary actions per DEC-010. The audit below describes the state before
> that step. SHELL-09 added the concept icons and LIBUI-07 added `folder` and `playlist`, each on
> the same terms: an icon is drawn when a screen needs it. Phase 5 added the player's:
> `play`, `pause`, `previous`, `next`, `shuffle`, `repeat`, `repeat-one`, `queue`, `volume` and
> `volume-muted`.
>
> Two of those are worth the note. `repeat-one` is a **separate drawing** rather than `repeat` with
> a badge — a 12×12 grid has no room for a legible "1" on top of an existing shape, and a badge
> that reads as a smudge is worse than a second icon. `volume-muted` differs from `volume` by its
> waves rather than by colour, because the five themes do not agree on what a muted colour is and
> a state a user has to compare two shades to read is not a state at a glance.

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
| `Button` | primary / secondary / danger variants; flat C11-B control (DEC-241): `--control-height`, 1px `--border-control`, pixel font xs/400, no bevel or shadow; hover = brightness filter; active = 1px translate; disabled = 0.55 opacity |
| `Panel` | 1px `--border-control` box, no bevel or shadow (DEC-241), optional header/badge, `--fill` variant for viewport-filling layouts |
| `Modal` | full-screen backdrop + centered box, 1px border and one soft `--shadow-dialog` (DEC-241), flat close button; 15 feature dialogs built on it |
| `TextField` / `Select` | flat control (DEC-241): `--control-height`, 1px `--border-control`, no inset shadow; `:focus-visible` = accent-info ring; error = red border + hint text |
| `ResultsTable` | virtualized (`@tanstack/react-virtual`), sortable, resizable, sticky header + Write/Index columns, 14-column grid, themed scrollbar, column widths persist to `localStorage` |
| `ListRow` | simpler 3-col grid row primitive; hover tint via `color-mix`; selected = inset accent-info outline |
| `Toast` | fixed bottom-right stack, 4 variants, slide-up-fade-in, 1px border, no shadow (DEC-241) |
| `Badge` | small square (not pill) label, 5 variants, 2px offset shadow |
| `Tabs` | underline tabs (DEC-241): transparent tabs, active = `--fg-primary` weight 700 over an accent underline; strip has a hairline bottom border |
| `ProgressBar`, `ToolbarIcon`, `AppMenuBar`, `EngineStatusBanner` | present, consistent with the system |

## Page header, empty state and controls

Every page uses the same few components; the guards below keep it that way.

| Need | Use | Guard |
|---|---|---|
| A page title, its actions, tabs and one summary line | `components/shell/ScreenHeader` (one `<h1>` and one divider; `title`, `display`, `crumb`, `beside`, `summary`, `actions`, `tabs`, `status`) | `screens/screenHeaders.test.tsx`: each route shows one `.cp-screen-header` and one h1; nothing else draws an `<h1>` or `.screen__title` |
| A page or panel with nothing to show | `components/EmptyState` (headline, description, one action) | `EmptyState.test.tsx` |
| A dropdown | `components/Select` (`appearance: none`, a pixel chevron; `hideLabel` keeps the label as the accessible name only) | `components/rawControls.test.ts`: no `<select>` outside `Select.tsx`, no allowlist |
| An arrow, chevron, cross, repeat or pencil mark | `PixelIcon` (`chevron-right`, `chevron-down`, `arrow-up`, `arrow-down`, `repeat`, `close`, `edit`); in a line of text `className="cp-pixel-icon--text"` (half the icon cell, plus `cp-pixel-icon--after` for a gap before it) | `components/typedSymbols.test.ts`: none of the typed marks in source, no allowlist; an arrow key named in a shortcut hint (`Alt+↑`) is a key name and is left alone |
| A button that is only a mark | `<Button iconOnly icon="close" aria-label="Dismiss">` | `Button.test.tsx` (the label is required by the type) |

## Motion

Every motion is behind its kind's `:root[data-motion-<kind>]` attribute (Settings → Motion: On,
Off or Custom; none under the system's reduced motion) and moves only `transform` and `opacity`;
opacity is never stepped (DEC-134, DEC-135). Since DEC-298 there are two looks, kept apart in
`renderer/src/motion.css` and held by `motionRules.test.ts`:

| Kind of motion | What | Timing | Distance |
|---|---|---|---|
| Interface | page change, dialog and backdrop, menus, popovers, filter panels, wheel popover, hint tips, Track details and side panels, toasts, Track details sections, the tab underline, the shared search result | `--motion-ease-out` (`cubic-bezier(0.2, 0, 0, 1)`) in over `--motion-base` (160 ms); `--motion-ease-in` out over `--motion-quick` (80 ms); the fade eases with the move | `--motion-move-px` (`--unit`: 4 px at 1×, 6 px at 1.5×) |
| Decoration | pixel spinner, field-error shake, bars and charts growing, the wheel's light, Plays list, badges and counts, hover edge bar, focus step, drag and drop, the Saved tick, Settings links | `steps(var(--motion-steps-short/-long))`; a separate `--motion-fade` (linear) fade | `--motion-step-px` (whole pixels at every scale) |

- **A press is a look, not a motion:** the control sits a hairline lower and its fill darkens
  (`--press-shade`, from the theme's `--bevel-shadow`), with no transition, so it shows on the
  first frame. Buttons, checkboxes, radios and the player's buttons; the star only sits lower.
- **The selected tab is never hidden:** it is drawn at once; only its underline grows in.
- **A new page starts moving after it is drawn:** `AppShellLayout` holds it at its first look
  (`data-page-phase="hold"`) for the frame that draws it and writes the phase on the next frame,
  so a long first frame does not use up the motion.
- **What is simply unmounted leaves as a still copy** (`useLeaveGhost`): measured in a frame after
  each render, never in the unmount, gated by the kind's attribute (no computed style), with its
  canvases drawn into the copy.

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
4. ~~**Font readability at density**~~: **resolved by DEC-048** — dense values use `--font-data`
   and everything else stays Pixelify Sans. See the Typography note above.

None of this blocks reusing the system as the foundation for SHELL/LIBUI phase work.
