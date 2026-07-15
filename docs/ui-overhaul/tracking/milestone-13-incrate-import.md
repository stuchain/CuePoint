# Milestone 13 — inCrate import parity

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| Import UI | XML path field, Browse, Enrich toggle (default on) |
| Reset inventory | `POST /api/v1/incrate/reset` + confirm in lab |
| Import feedback | Status message, stats (tracks / artists / labels) |
| Electron IPC | `resetIncrateInventory` |

## Verification

- `pytest src/tests/unit/engine/test_engine_incrate.py`
- Electron: inCrate → Browse → Import → Refresh inventory → Run discovery

## Remaining

- Import progress streaming (Qt uses background thread + progress bar)
- Manual RC test matrix (Phase 8)
