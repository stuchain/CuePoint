# Milestone 5 — tracking

**Status:** Done — job cancel + SSE progress

## Completed

- [x] Engine `POST /api/v1/jobs/{id}/cancel`
- [x] Engine `GET /api/v1/jobs/{id}/events` (SSE)
- [x] Demo + real jobs honour `ProcessingController.cancel()`
- [x] Tests: `test_engine_cancel.py`, `test_engine_job_events.py`
- [x] Electron SSE proxy via main → preload `subscribeJobEvents`
- [x] inKey Cancel button + SSE-driven progress (poll fallback)

## Next

- [ ] Rollout Phase C: Qt results 80vw cap
- [ ] Rollout Phase D: Qt Settings appearance
- [ ] Job pause/resume endpoints (optional)

See [next-milestone.md](../next-milestone.md).
