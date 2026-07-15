# Milestone 9 — History rerun + review workflow

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| Rerun metadata | `load_history_csv` returns `rerun` block from `.meta.json` |
| Re-run processing | Past searches → Main tab prefill + optional auto-start |
| Review count | Low-score / unmatched tracks counted in history load |
| Review candidates | Sidecar `_review_candidates.csv` merged into row `candidates` |
| Results filter | **Needs review** filter + `?filter=needs_review` deep link |

## Verification

- `pytest src/tests/unit/engine/test_engine_history.py`
- `npm test` in renderer
- Load export with `.meta.json` → Re-run processing → job starts on Main

## Remaining

- Write tags / Rekordbox sync from history
