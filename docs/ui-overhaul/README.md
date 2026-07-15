# UI overhaul — lab reference

This folder captures **decisions, layout rules, and implementation details** proven in the CuePoint **UI Lab** (`apps/desktop-electron/renderer`). Use it as the source of truth when porting changes into the shipping Qt/Electron app **bit by bit**.

**Live lab:** run `npm run dev` from `apps/desktop-electron/renderer` (Vite, port 5173).

**Related:** [Design sign-off (Phase 1)](../apps/desktop-electron/docs/design-signoff.md) — themes, components, contrast. Some chrome placement notes there are **superseded** by this folder (theme/scale moved to Settings only).

---

## Documents

| Doc | What it covers |
| --- | --- |
| [Decisions & scope](decisions.md) | Locked product choices from lab review |
| [Layout & scroll](layout-and-scroll.md) | Shell, safe areas, viewport vs document scroll |
| [Results table](results-table.md) | 14 Qt columns, resize, sticky cols, persistence |
| [Settings & appearance](settings-and-appearance.md) | Theme, scale, export panels |
| [Implementation reference](implementation-reference.md) | Files, CSS tokens, `localStorage` keys |
| [Rollout phases](rollout-phases.md) | Suggested order to land in production |

---

## Quick summary

| Area | Lab behavior |
| --- | --- |
| **Default scale** | 2× (`cuepoint-ui-lab-scale`) |
| **Theme / scale controls** | Settings → Appearance only (removed from top-right) |
| **Lab route nav** | Fixed bottom-center: Tools, inKey, Results, Settings |
| **Results frame** | Centered, max **80vw** width; page scroll when user resizes panel |
| **Results columns** | Per-column minimum widths; drag header edge to resize; double-click resets |
| **Settings scroll** | Document scroll via `body.app-page-scroll`; content top-aligned |
| **Match screen** | Equal-height two-column panels; drop zone min height |

---

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| Lab Phase 1 | Pixel chrome, themes, mock screens | Done in renderer |
| Lab layout pass | Shell, Results, Settings scroll/resize | Done in renderer |
| Production Phase A | Layout tokens + Results table parity | Not started |
| Production Phase B | Settings appearance + persistence | Not started |
| Production Phase C | Match / tool screens polish | Not started |

Update this table as each slice lands in the main app.

---

*Last updated: 2026-07-15*
