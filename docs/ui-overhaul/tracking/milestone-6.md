# Milestone 6 — tracking

**Status:** In progress — Phase E Beatport token + Results empty state

## Completed

- [x] Engine `GET/POST /api/v1/config/beatport-token` (masked status, never returns full token)
- [x] Engine `POST /api/v1/config/beatport-token/test`
- [x] Persists to `~/.cuepoint/config.yaml` via `ConfigService` (same as Qt Settings)
- [x] Electron IPC: `getBeatportTokenStatus`, `setBeatportToken`, `testBeatportToken`
- [x] Settings screen wired with save + test connection
- [x] Results screen empty state when engine connected (no mock fallback)
- [x] Tests: `test_engine_config.py`

## Next

- [ ] inCrate Discover / Playlist engine endpoints
- [ ] Qt Phase A: match equal-height panels
- [ ] Results sticky Write + Index columns (Qt)

See [next-milestone.md](../next-milestone.md).
