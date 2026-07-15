# Milestone 11 — M3U match + history re-run

**Status:** Done

## Scope

| Slice | Deliverable |
| --- | --- |
| M3U match job | `POST /jobs/match` with `{ m3u_path }` → `run_real_m3u_match_job` |
| inKey source toggle | Collection (XML) vs Playlist file (M3U); batch hidden for M3U |
| Electron IPC | `openM3uFileDialog` |
| History re-run | Past searches → M3U browse fallback → auto-start on Main |

## Verification

- `pytest src/tests/unit/engine/test_engine_m3u.py`
- Electron: Main → Playlist file (M3U) → browse → Start M3U matching
- Past search with `.meta.json` `source: playlist_file` → Re-run processing

## Remaining

- Sync tags from history CSV (Qt `on_write_to_track_tags_from_history`)
- M3U batch source (not in Qt either)
