# Next milestone

**Gate:** Milestone 2 complete — proceed with renderer wiring and P1 endpoints.

## Rollout Phase A — Qt layout & scroll (done)

| Task | Status |
| --- | --- |
| Settings dialog scroll + scroll-to-top on open | Done |
| Stack/tab scroll reset in main window | Done |
| Match equal-height panels | Deferred (Qt fixed-height source row) |

---

## Phase 3 — Engine API

### Implemented (S1 + P0)

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/health` | None | `{ "status": "ok", "version": "..." }` |
| GET | `/api/v1/status` | Bearer | `{ "ready": true, "status", "version" }` |
| POST | `/api/v1/jobs/match` | Bearer | `{ "id", "state" }` — `{ "demo": true }` or `{ "xml_path", "playlist_name" }` |
| GET | `/api/v1/jobs/{id}` | Bearer | Job status + `progress` |
| GET | `/api/v1/jobs/{id}/results` | Bearer | `{ "id", "state", "results": [...] }` |

Modules: [`server.py`](../../src/cuepoint/engine/server.py), [`jobs.py`](../../src/cuepoint/engine/jobs.py)

Dev:

```bash
set PYTHONPATH=src
set CUEPOINT_PORT=8765
set CUEPOINT_TOKEN=dev-token
python -m cuepoint.engine
```

Demo job:

```bash
curl -X POST http://127.0.0.1:8765/api/v1/jobs/match -H "Authorization: Bearer dev-token" -H "Content-Type: application/json" -d "{\"demo\":true}"
```

### Next (P1)

| Method | Path | Maps to |
| --- | --- | --- |
| POST | `/api/v1/export` | `ExportController` |
| GET | `/api/v1/incrate/inventory` | inCrate inventory service |
| WebSocket/SSE | `/api/v1/jobs/{id}/events` | Streaming progress |

### Renderer wiring (done — Milestone 3 slice)

Preload IPC → main → authenticated fetch to job endpoints:

| IPC channel | Purpose |
| --- | --- |
| `engine:startMatchJob` | POST `/api/v1/jobs/match` |
| `engine:getJob` | GET `/api/v1/jobs/{id}` |
| `engine:getJobResults` | GET `/api/v1/jobs/{id}/results` |
| `dialog:openXml` | Native Rekordbox XML file picker |

Renderer modules:

- [`cuepointBridge.types.ts`](../../apps/desktop-electron/renderer/src/api/cuepointBridge.types.ts) — `window.cuepoint` types
- [`useMatchJob.ts`](../../apps/desktop-electron/renderer/src/hooks/useMatchJob.ts) — poll job progress
- [`MatchResultsContext.tsx`](../../apps/desktop-electron/renderer/src/context/MatchResultsContext.tsx) — share live results with Results screen
- [`InKeyMainScreen.tsx`](../../apps/desktop-electron/renderer/src/screens/InKeyMainScreen.tsx) — demo/real job start
- [`ResultsScreen.tsx`](../../apps/desktop-electron/renderer/src/screens/ResultsScreen.tsx) — shows engine results when available

Browser-only Vite dev (no preload) still uses mock simulation + fixture results.

### Next (P1)

- Rollout Phase C: Results frame 80vw cap in Qt
- Rollout Phase D: Theme/scale in Qt Settings
- Phase 6: Full GUI parity checklist
- Phase 10: Qt removal
