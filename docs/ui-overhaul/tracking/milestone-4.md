# Milestone 4 — tracking

**Status:** Done — Phase 3 P1 export + inCrate inventory

## Completed

- [x] Engine `POST /api/v1/export` (job_id or inline results → CSV/JSON/Excel)
- [x] Engine `GET /api/v1/incrate/inventory` (+ `?demo=true` dev payload)
- [x] Engine `POST /api/v1/incrate/import`
- [x] Tests: `test_engine_export.py`, `test_engine_incrate.py`
- [x] Electron IPC: export, inventory, import, save dialog
- [x] Renderer: Export on Results + Settings; inCrate inventory preview + import

## Next

- [ ] Job cancel endpoint + inKey Cancel button
- [ ] SSE/WebSocket job progress (replace polling)
- [ ] Rollout Phase C: Qt results 80vw cap
- [ ] Rollout Phase D: Qt Settings appearance

See [next-milestone.md](../next-milestone.md).
