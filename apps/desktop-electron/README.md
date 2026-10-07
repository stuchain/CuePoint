# CuePoint desktop app

Electron shell and React renderer for the CuePoint desktop application.

## Layout

```
apps/desktop-electron/
  electron/          # Main process, the preload bridge (preload.cjs) and their tests
  electron-dist/     # Built main bundle (gitignored)
  renderer/          # Vite + React UI
  e2e/               # Playwright tests that drive the built app
  build/             # electron-builder hooks (signing, notarizing) and macOS entitlements
  package.json       # Dev orchestration
```

## Renderer development

```bash
cd apps/desktop-electron/renderer
npm ci
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
npm ci
npm run electron:dev
```

`electron:dev` loads the renderer from the dev server (`http://localhost:5173`, or
`CUEPOINT_RENDERER_URL`), so keep terminal 1 running. To run the production build
instead, use `npm run electron:start`, which builds the renderer and the shell first.

The main process finds Python in this order: the `CUEPOINT_PYTHON` environment
variable, the repository's `.venv`, then `python3` (`python` on Windows) on
`PATH`. It sets `PYTHONPATH` to the repository's `src/` and starts the engine
automatically. A packaged app runs the bundled engine sidecar instead.

## Routes

| Route | Screen |
|-------|--------|
| `/library` | Library: the imported collection, and home |
| `/collections` | The Library page, aimed at Collections |
| `/clean` | Clean: matching, review, missing files, duplicates, Health |
| `/discover` | Discover: runs, the wantlist, and under it the Artist, Label and Similar tracks pages |
| `/prepare` | Prepare: Sets, with a Set's own page at `/prepare/:setId` |
| `/settings` | Settings |

`/match` and `/results`, inKey's and Results' old addresses, redirect to
`/clean` (DEC-071). `/incrate`, the screen Discover replaced, redirects to
`/discover`, and `/`, the landing page of the Tools group that is gone, to
`/library` (DEC-100). A path that matches nothing redirects to
the Library too. `renderer/src/components/shell/navRegistry.ts` declares every
destination and every retired one.

## Docs

- [Developer setup](../../docs/development/developer-setup.md)
- [Architecture](../../docs/development/architecture.md)
- [UI overhaul: the architecture decision records](../../docs/ui-overhaul/README.md)
