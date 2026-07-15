# Milestone 10 — Real XML batch matching

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| XML playlist API | `GET /api/v1/xml/playlists?path=` |
| Batch match job | `POST /jobs/match` with `{ xml_path, playlist_names: [...] }` |
| Sequential processor | `run_real_batch_match_job` aggregates progress + `batch_results` |
| inKey batch UI | Single/Batch toggle, searchable playlist checklist |
| Electron IPC | `getXmlPlaylists` |

## Verification

- `pytest src/tests/unit/engine/test_engine_xml_batch.py`
- Electron: browse XML → Batch → select playlists → Start batch → Results tabs

## Remaining

- Folder tree UI (Qt has hierarchical tree; lab uses flat searchable list)
