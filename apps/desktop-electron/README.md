# CuePoint desktop shell (Electron + renderer)

Monorepo entry for the **Electron + React** UI overhaul. The pixel-art renderer lives in `renderer/` (canonical; `apps/ui-lab/` is legacy duplicate).

## Layout

```
apps/desktop-electron/
  electron/          # Main process + preload (Spike S1)
  electron-dist/     # Built main bundle (gitignored)
  renderer/          # Vite + React UI
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

## Electron + Python engine (Spike S1)

Terminal 1 — renderer:

```bash
cd apps/desktop-electron
npm run dev:renderer
```

Terminal 2 — Electron shell (spawns `python -m cuepoint.engine`):

```bash
cd apps/desktop-electron
npm install
npm run electron:dev
```

Requires **Python on PATH** and repo `src/` on `PYTHONPATH` (set automatically by main process). A green **Engine connected** banner appears when `/health` succeeds.

## Routes (mock screens)

| Route | Screen |
|-------|--------|
| `/` | Tool selection |
| `/match` | inKey main workflow |
| `/incrate` | inCrate stub (import / discover / playlist) |
| `/results` | Virtualized results table |
| `/settings` | Settings + export modal |

## Docs

- [UI overhaul plan](../../docs/ui-overhaul/README.md)
- [Spike S1](docs/spike-s1-engine-health.md)
- [Design sign-off](docs/design-signoff.md)
