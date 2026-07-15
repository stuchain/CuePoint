# Milestone — Phase 7 support bundle (Electron)

**Status:** Done (local)

## Scope

| Slice | Deliverable |
| --- | --- |
| Engine API | `POST /api/v1/support/bundle` |
| Electron IPC | Folder picker + `showItemInFolder` |
| Renderer | Help → Export Support Bundle (≤3 clicks) |

## Verification

- `pytest src/tests/unit/engine/test_engine_support_bundle.py`
- Electron: Help → Export Support Bundle → ZIP in chosen folder

## Remaining (Phase 7)

- Session correlation ID
- Bundle redaction regression test
