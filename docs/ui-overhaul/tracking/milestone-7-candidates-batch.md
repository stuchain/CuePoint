# Milestone 7 — Candidate dialog + batch results tabs

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| Engine candidates | `track_result_to_dict` includes `candidates`; demo jobs populate sample rows |
| Engine batch demo | `POST /jobs/match` with `{ demo: true, demo_batch: true }` → `batch_results` payload |
| Candidate dialog | Electron `CandidateDialog` — double-click / Enter / toolbar action |
| Batch results tabs | `MatchResultsContext` batch mode + playlist tabs on `/results` |
| inKey batch demo | "Start batch demo" button when engine connected |

## Verification

- `pytest src/tests/unit/engine/test_engine_jobs.py`
- `npm test` in `apps/desktop-electron/renderer`
- Electron: Start batch demo → Results shows Warm Up / Peak Time tabs
- Double-click matched row with candidates → dialog → select updates row

## Remaining Phase 6

- Tool picker parity
- inKey past searches
- Review CSV workflow
- Real XML batch (multi-playlist) end-to-end
