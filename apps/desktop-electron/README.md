# CuePoint desktop shell (Electron + renderer)

Monorepo entry for the **Electron + React** UI overhaul. The pixel-art renderer was promoted from the UI lab (`apps/ui-lab` → `renderer/`).

## Layout

```
apps/desktop-electron/
  electron/          # Main process (stub — Phase 4)
  renderer/          # Vite + React UI (formerly ui-lab)
  docs/              # Design sign-off, spikes
  package.json       # Dev orchestration
```

## Quick start (renderer only — browser lab)

```bash
cd apps/desktop-electron/renderer
npm install
npm run dev          # http://localhost:5173
npm run storybook    # http://localhost:6006
```

## Routes (mock screens)

| Route | Screen |
|-------|--------|
| `/` | Tool selection |
| `/match` | inKey main workflow |
| `/results` | Virtualized results table |
| `/settings` | Settings + export modal |

## Next steps (Phase 4+)

1. Wire `electron/main.ts` to load Vite dev server or built `renderer/dist`.
2. Implement Python engine sidecar (see `docs/spike-s1-engine-health.md`).
3. Replace mock fixtures with engine API client (Phase 3/5).

See [docs/ui-overhaul](../../docs/ui-overhaul/) for the full phased plan.
