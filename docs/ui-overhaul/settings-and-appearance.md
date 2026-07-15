# Settings & appearance

Settings is the **only** place for theme and UI scale in the lab (top-right controls removed).

Route: `/settings`  
Component: `SettingsExportScreen.tsx`

## Page structure (top → bottom)

1. **Toolbar** — “← Back to inKey”
2. **Appearance** (`ThemeSettingsPanel`) — theme, scale, custom themes
3. **Settings** panel — Beatport token (mock), default export folder
4. **Export** panel — export results button + modal

All sections stack vertically with `screen screen--stack screen--scroll`.

## Appearance panel

File: `ThemeSettingsPanel.tsx` + `theme-settings.css`

| Control | Detail |
| --- | --- |
| Active theme | Built-ins + custom themes (`custom:{uuid}`) |
| UI scale | 1× / 2× / 3× — same as `ScaleContext` |
| Create custom theme | 8-color editor; borders/bevels derived (`themeDerivation.ts`) |
| Custom theme list | Apply / Edit / Delete |

### Storage keys

| Key | Content |
| --- | --- |
| `cuepoint-ui-lab-theme` | Active theme id |
| `cuepoint-ui-lab-scale` | 1, 2, or 3 |
| `cuepoint-ui-lab-custom-themes` | JSON array of custom themes |

See [Design sign-off](../apps/desktop-electron/docs/design-signoff.md) for theme IDs, contrast notes, and custom theme editor fields.

## Scroll behavior

On mount, Settings adds `body.app-page-scroll` and removes it on unmount.

Requirements (see [Layout & scroll](layout-and-scroll.md)):

- Document scroll, not `.app-main` overflow
- `justify-content: flex-start` on `screen--scroll`
- Extra bottom padding: `calc(var(--safe-bottom) + var(--space-xl))`
- `window.scrollTo(0, 0)` on mount + route change

### Full-width appearance on scroll pages

```css
.screen--scroll .theme-settings {
  max-width: 100%;
}
```

Settings form fields stay narrow (`--content-narrow-width`); Appearance uses full content width.

## Settings panel (mock)

| Field | Lab behavior |
| --- | --- |
| Beatport token | Password field; hint “Stored locally in engine (mock).” |
| Default export folder | Select: Downloads / Desktop / Custom |

Wire to real engine storage when porting.

## Export panel

- Opens modal: format (CSV / JSON / Excel), filename prefix
- Toast on confirm (mock success message)

## Production port checklist

- [x] Move theme + scale to app Settings (remove duplicate chrome elsewhere)
- [ ] Long settings pages use top-aligned document scroll
- [x] Custom theme CRUD + derivation pipeline
- [x] Beatport token + export path → real persistence (token via engine config API)
- [ ] Scroll reset when switching main window sections
