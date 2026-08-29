---
name: cuepoint-desktop-contract
description: Maintain CuePoint features crossing the Python engine API, Electron IPC/preload, and React renderer. Use for desktop endpoints, bridge types, jobs, native dialogs, and integration bugs; not isolated Python logic or CSS.
---

# CuePoint desktop contract

Keep the desktop boundary complete, typed, secure, and testable from Python through the UI.

## Read the affected contract

Start with the smallest relevant files:

- Architecture: `docs/ui-overhaul/adr/001-electron-shell.md`, `002-engine-packaging.md`, and
  `003-http-ipc.md` only when the change touches their decisions.
- Python transport: `src/cuepoint/engine/server.py` and the relevant `*_api.py` or `jobs.py`.
- Electron HTTP/SSE client: `apps/desktop-electron/electron/engineClient.ts` and `sseClient.ts`.
- Process supervision: `engineSupervisor.ts` and `engineLaunch.ts`.
- IPC registration: `electron/main.ts`.
- Runtime preload: `electron/preload.cjs`. The adjacent `preload.ts` is only a placeholder.
- Renderer contract: `renderer/src/api/cuepointBridge.types.ts`.
- Consumer: the relevant renderer hook, context, screen, or component.

Search for the endpoint, IPC channel, and bridge method across all layers before editing.

## Preserve these boundaries

- The engine listens only on loopback. `/health` is unauthenticated and contains no secrets;
  `/api/v1/*` routes require the in-memory bearer token.
- The renderer receives narrow methods through `window.cuepoint`; it does not receive engine
  tokens, arbitrary filesystem access, or Node APIs.
- Keep `contextIsolation: true` and `nodeIntegration: false`.
- Preserve structured engine errors and translate failures into actionable UI state.
- Keep request/response field names aligned. Python uses JSON snake_case; TypeScript types must
  describe the wire format rather than inventing a second shape.
- Maintain cancellation and SSE cleanup when changing jobs or progress handling.
- Keep business logic in Python; Electron supervises and bridges, while React presents state.

## Implement and verify

Update every affected layer and add tests at the narrowest meaningful boundary. Typical checks:

```bash
python -m pytest src/tests/unit/engine/ -q --tb=short
python scripts/smoke_engine_health.py
python scripts/check_no_qt_in_core.py
cd apps/desktop-electron/renderer && npm test && npm run build:check
cd apps/desktop-electron && npm run build
```

Run `npm run test:e2e` from `apps/desktop-electron/` for changed user journeys, native dialogs,
startup, or process integration. Run `python scripts/check_desktop_version_coupling.py` for any
version-related change.

When handing off, identify each contract layer changed and any manual desktop behavior still
requiring verification.
