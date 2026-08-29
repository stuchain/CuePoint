# CuePoint desktop app

Electron shell and React renderer for the CuePoint desktop application.

## Layout

```
apps/desktop-electron/
  electron/          # Main process and preload
  electron-dist/     # Built main bundle (gitignored)
  renderer/          # Vite + React UI
  docs/              # Desktop design and implementation notes
  package.json       # Dev orchestration
```

## Renderer development

```bash
cd apps/desktop-electron/renderer
npm install
npm run dev          # http://localhost:5173
npm run storybook    # http://localhost:6006
```

## Electron and Python engine

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

Python must be available on `PATH`. The main process configures `PYTHONPATH` for
the repository and starts the engine automatically.

## Routes

| Route | Screen |
|-------|--------|
| `/` | Tool selection |
| `/match` | inKey main workflow |
| `/incrate` | inCrate workflow |
| `/results` | Virtualized results table |
| `/settings` | Settings + export modal |

## Docs

- [UI overhaul plan](../../docs/ui-overhaul/README.md)
- [Spike S1](docs/spike-s1-engine-health.md)
- [Design sign-off](docs/design-signoff.md)
