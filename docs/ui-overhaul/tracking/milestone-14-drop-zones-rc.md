# Milestone 14 — Drop zones + lab RC matrix

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| File drop (inKey) | XML / M3U drag-and-drop via `webUtils.getPathForFile` |
| File drop (inCrate) | Collection XML drop on import panel |
| `useFileDrop` hook | Shared drag handlers + extension validation |
| RC checklist | [manual-test-matrix-lab-rc.md](../manual-test-matrix-lab-rc.md) |

## Verification

- `npm test` in renderer (`fileDropUtils.test.ts`)
- Electron: drag XML/M3U onto inKey drop zone → path fills → start job

## Remaining

- Automated Playwright smoke (Phase 8)
- Phase 10 cutover / Qt removal
