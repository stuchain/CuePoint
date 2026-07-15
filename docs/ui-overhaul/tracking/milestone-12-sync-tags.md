# Milestone 12 — Sync tags with Rekordbox

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| Tag sync API | `POST /api/v1/tags/sync` (M3U paths, XML single, XML batch) |
| Sync options | Key format + tag field toggles (persisted in lab localStorage) |
| Results UI | Write column checkboxes + **Sync with Rekordbox** |
| Past searches UI | Write column + sync from loaded CSV |
| Electron IPC | `syncTags` |

## Verification

- `pytest src/tests/unit/engine/test_engine_sync_tags.py`
- `npm test` in renderer (`syncTagsUtils.test.ts`)
- Electron: match job → Results → tick Write → Sync → verify tag files

## Remaining

- Full history table (lab preview shows 12 rows; use Results for full Write toggles)
- Qt batch-mode sticky columns (optional polish)
