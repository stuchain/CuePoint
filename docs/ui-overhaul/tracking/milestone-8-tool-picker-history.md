# Milestone 8 — Tool picker + past searches

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| Tool landing | Centered `/` screen with prominent inKey CTA + inCrate secondary |
| History API | `GET /api/v1/history/recent`, `GET /api/v1/history/load?path=` |
| Past searches UI | inKey → Past searches tab with list, browse, preview, Open in Results |
| Electron IPC | `getHistoryRecent`, `loadHistoryCsv`, `openCsvFileDialog` |

## Verification

- `pytest src/tests/unit/engine/test_engine_history.py`
- `npm test` in renderer
- Electron: export a CSV → Past searches → Refresh → load → Open in Results

## Remaining

- Rerun from history (XML + playlist)
- Write tags / sync from history CSV
- Review candidates CSV dialog
