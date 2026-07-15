# UI overhaul — lab reference

This folder captures **decisions, layout rules, and implementation details** proven in the CuePoint **UI Lab** (`apps/desktop-electron/renderer`). Use it as the source of truth when porting changes into the shipping Qt/Electron app **bit by bit**.

**Live lab:** run `npm run dev` from `apps/desktop-electron/renderer` (Vite, port 5173).

**Electron + engine (Spike S1):** start renderer (`npm run dev:renderer`), then from `apps/desktop-electron/` run `npm run electron:dev` (requires Python on PATH).

**Related:** [Design sign-off (Phase 1)](../apps/desktop-electron/docs/design-signoff.md) — themes, components, contrast. Some chrome placement notes there are **superseded** by this folder (theme/scale moved to Settings only).

---

## Documents

| Doc | What it covers |
| --- | --- |
| [Decisions & scope](decisions.md) | Locked product choices from lab review |
| [Layout & scroll](layout-and-scroll.md) | Shell, safe areas, viewport vs document scroll |
| [Results table](results-table.md) | 14 Qt columns, resize, sticky cols, persistence |
| [Settings & appearance](settings-and-appearance.md) | Theme, scale, export panels |
| [Parity matrix](parity-matrix.md) | inKey + inCrate Qt ↔ lab route map |
| [Implementation reference](implementation-reference.md) | Files, CSS tokens, `localStorage` keys |
| [Rollout phases](rollout-phases.md) | Suggested order to land in production |
| [Next milestone](next-milestone.md) | Phase A (Qt scroll) + Phase 3 API sketch |
| [Tracking](tracking/README.md) | Workstream issue templates |

---

## Quick summary

| Area | Lab behavior |
| --- | --- |
| **Default scale** | 2× (`cuepoint-ui-lab-scale`) |
| **Default theme** | `neoDark` (design sign-off 2026-07-15) |
| **Theme / scale controls** | Settings → Appearance only (removed from top-right) |
| **Lab route nav** | Fixed bottom-center: Tools, inKey, inCrate, Results, Settings |
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
| **Milestone 1 (hybrid start)** | ADRs, parity matrix, Qt Results cols, Spike S1 | **Done** |
| **Milestone 2** | Phase A scroll + Phase 3 P0 job API | **Done** |
| **Milestone 3** | Renderer inKey → engine job IPC | **Done** |
| **Milestone 4** | Phase 3 P1 export + inCrate inventory | **Done** |
| **Milestone 5** | Job cancel + SSE progress | **Done** |
| **Rollout Phase C (Qt)** | Results frame 80vw + resize grip | **Done** |
| **Rollout Phase D (Qt)** | Theme/scale in Settings | **Done** |
| **Milestone 6 (Phase E)** | Beatport token + Results empty state | **Done** |
| Rollout Phase B (Qt) | Results column mins + QSettings persistence | Done |
| Spike S1 | Engine `/health` + Electron spawn | Done |
| Lab `/incrate` stub | Route + inventory/import wiring | Done |
| **Milestone 6 (Phase E + parity slices)** | Token, discover, playlist, match layout, sticky cols | **Done** |
| **Milestone 7** | Candidate dialog + batch results tabs | **Done** |
| **Milestone 8** | Tool picker + past searches | **Done** |
| **Milestone 9** | History rerun + review workflow | **Done** |
| **Milestone 10** | Real XML batch matching | **Done** |
| **Next** | M3U rerun, sync tags, Qt batch polish | See [next-milestone.md](next-milestone.md) |
| Phase 6 | Full GUI parity + inCrate | In progress (matrix) |

Update this table as each slice lands in the main app.

---

*Last updated: 2026-07-15*
