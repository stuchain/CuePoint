# inCrate implementation design 03: Discovery flow (Phase 3)

**Implementation order:** Phase 3 — build after Phase 1 (Inventory) and Phase 2 (Beatport API).  
**Spec:** [../incrate-spec.md](../incrate-spec.md)  
**Previous:** [incrate-01-inventory.md](incrate-01-inventory.md), [incrate-02-beatport-api.md](incrate-02-beatport-api.md)  
**Next:** [incrate-04-playlist-and-auth.md](incrate-04-playlist-and-auth.md).

---

## 1. Goals and scope

1. **Charts branch:** For user-selected genres, fetch charts published in the **past month**; keep only charts whose **chart author** is in library artists (from Phase 1); add **all tracks** from each such chart to the discovery result.
2. **New-releases branch:** For each label in the inventory, fetch releases from Beatport (Phase 2 API) with **release date in the last 30 days**; add those tracks to the result.
3. **Deduplication:** By Beatport track ID (or URL); same track from chart and label release appears once.
4. **Output:** Ordered list of `DiscoveredTrack` (beatport_track_id, beatport_url, title, artists, source_type, source_name) for Phase 4 (playlist) and UI review.

**Out of scope:** Playlist creation (Phase 4); UI (Phase 5). This phase is pure logic and service layer.

---

## 2. Exact file and directory layout

| Action | Path | Purpose |
|--------|------|---------|
| CREATE or EXTEND | `src/cuepoint/incrate/beatport_api_models.py` or `incrate/discovery_models.py` | Add `DiscoveredTrack` dataclass. |
| CREATE | `src/cuepoint/incrate/discovery.py` | `run_discovery(...)` and helpers: _charts_branch, _new_releases_branch, _dedupe. |
| CREATE | `src/cuepoint/services/incrate_discovery_service.py` | Facade: depends on InventoryService and BeatportApi; exposes run_discovery with config (genres, dates). |

---

## 3. Data model: DiscoveredTrack

**File:** `src/cuepoint/incrate/discovery_models.py` or add to beatport_api_models.py

```python
@dataclass
class DiscoveredTrack:
    beatport_track_id: int
    beatport_url: str
    title: str
    artists: str
    source_type: str   # "chart" | "label_release"
    source_name: str  # chart name or release title
```

- Used by Phase 4 to add to playlist (need track_id and url); used by UI to show "From chart X" or "From release Y".

---

## 4. Algorithm (exact steps)

### 4.1 run_discovery signature

```python
def run_discovery(
    inventory_service: InventoryService,
    beatport_api: BeatportApi,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    new_releases_days: int = 30,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[DiscoveredTrack]:
```

- progress_callback(stage, current, total): stage in ("charts", "releases"), current/total for progress bar.

### 4.2 Charts branch (detailed)

1. library_artists = set(normalize(a) for a in inventory_service.get_library_artists()). Normalize: strip, lower.
2. result_tracks: List[DiscoveredTrack] = [].
3. For each genre_id in genre_ids:
   - charts = beatport_api.list_charts(genre_id, charts_from_date, charts_to_date).
   - For each chart in charts:
     - If normalize(chart.author_name) not in library_artists: continue.
     - detail = beatport_api.get_chart(chart.id). If None: continue.
     - For each t in detail.tracks: append DiscoveredTrack(beatport_track_id=t.track_id, beatport_url=t.beatport_url, title=t.title, artists=t.artists, source_type="chart", source_name=detail.name).
   - If progress_callback: progress_callback("charts", idx_genre + 1, len(genre_ids)).
4. Return result_tracks (before dedupe; dedupe below).

### 4.3 New-releases branch (detailed)

1. library_labels = inventory_service.get_library_labels().
2. label_ids: Dict[str, int] = {}. For each label_name in library_labels: id = beatport_api.search_label_by_name(label_name); if id: label_ids[label_name] = id.
3. to_date = date.today(); from_date = to_date - timedelta(days=new_releases_days).
4. For each (label_name, label_id) in label_ids:
   - releases = beatport_api.get_label_releases(label_id, from_date, to_date).
   - For each release in releases: for each t in release.tracks: append DiscoveredTrack(..., source_type="label_release", source_name=release.title).
   - If progress_callback: progress_callback("releases", ...).
5. Combine charts list + releases list; dedupe by beatport_track_id; preserve order (charts first, then releases, or by first-seen). Return List[DiscoveredTrack].

### 4.4 Deduplication

- seen_ids: Set[int] = set(). out: List[DiscoveredTrack] = [].
- For each t in combined: if t.beatport_track_id not in seen_ids: seen_ids.add(t.beatport_track_id); out.append(t).
- Return out.

---

## 5. Configuration

- Charts window: from_date/to_date from run_discovery args (UI or config: incrate.charts_from_date, incrate.charts_to_date; default past month).
- New releases days: incrate.new_releases_days = 30.
- Genre ids: from UI selection (saved in incrate.genres as list of ids).

---

## 6. Full testing design

### 6.1 Unit tests – discovery.py

**File:** `src/tests/unit/incrate/test_discovery.py`

| Test method | Mock inventory | Mock API | Assertion |
|-------------|----------------|----------|-----------|
| test_run_discovery_empty_inventory | get_library_artists=[], get_library_labels=[] | — | result [] |
| test_run_discovery_charts_filters_by_author | artists ["Artist A"] | list_charts return 1 chart author "Artist A"; get_chart return 2 tracks | len(result)==2; both source_type "chart" |
| test_run_discovery_charts_skips_author_not_in_library | artists ["Other"] | chart author "Unknown" | chart skipped; result 0 from that chart |
| test_run_discovery_new_releases_adds_tracks | labels ["Defected"] | search_label 1; get_label_releases return 1 release 2 tracks | 2 DiscoveredTrack source_type "label_release" |
| test_run_discovery_dedupe_same_track_in_chart_and_release | chart and release both have track_id 99 | — | result has one track with id 99 |
| test_run_discovery_progress_callback_called | — | 2 genres, 1 chart | progress_callback called with "charts" |
| test_run_discovery_label_not_found_skipped | labels ["Unknown Label"] | search_label_by_name return None | no call to get_label_releases for that label |
| test_run_discovery_date_filter_charts | — | list_charts return charts with dates in range | only charts in range used |
| test_run_discovery_date_filter_releases | — | get_label_releases return releases; filter 30 days | only releases in last 30 days |

### 6.2 Unit tests – IncrateDiscoveryService

**File:** `src/tests/unit/services/test_incrate_discovery_service.py`

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_run_discovery_returns_list | run_discovery(genre_ids=[1], ...) with mocks | List[DiscoveredTrack] |
| test_run_discovery_uses_config_dates | config charts_to_date = today | API called with to_date=today |

### 6.3 Integration test

**File:** `src/tests/integration/test_incrate_discovery.py`

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_run_discovery_e2e_mocked | Real InventoryService with temp DB (1 artist, 1 label); mocked BeatportApi returning 1 chart and 1 release | result non-empty; dedupe applied |

### 6.4 Full test matrix (Phase 3)

| # | Test file | Test method |
|---|-----------|-------------|
| 1 | test_discovery | test_run_discovery_empty_inventory |
| 2 | test_discovery | test_run_discovery_charts_filters_by_author |
| 3 | test_discovery | test_run_discovery_charts_skips_author_not_in_library |
| 4 | test_discovery | test_run_discovery_new_releases_adds_tracks |
| 5 | test_discovery | test_run_discovery_dedupe_same_track_in_chart_and_release |
| 6 | test_discovery | test_run_discovery_progress_callback_called |
| 7 | test_discovery | test_run_discovery_label_not_found_skipped |
| 8 | test_discovery | test_run_discovery_date_filter_charts |
| 9 | test_discovery | test_run_discovery_date_filter_releases |
| 10 | test_incrate_discovery_service | test_run_discovery_returns_list |
| 11 | test_incrate_discovery_service | test_run_discovery_uses_config_dates |
| 12 | test_incrate_discovery (integration) | test_run_discovery_e2e_mocked |

### 6.5 File-by-file checklist (Phase 3)

| File | Item | Implemented | Test |
|------|------|-------------|------|
| incrate/discovery_models.py | DiscoveredTrack | [ ] | test_discovery |
| incrate/discovery.py | run_discovery | [ ] | test_discovery |
| incrate/discovery.py | _charts_branch (or inline) | [ ] | test_run_discovery_charts_* |
| incrate/discovery.py | _new_releases_branch | [ ] | test_run_discovery_new_releases_* |
| incrate/discovery.py | _dedupe | [ ] | test_run_discovery_dedupe |
| services/incrate_discovery_service.py | run_discovery facade | [ ] | test_incrate_discovery_service |

---

## 7. Edge cases

- **No genres selected:** genre_ids=[] → charts branch returns []; only new_releases branch runs.
- **API returns None for get_chart:** skip that chart; do not crash.
- **Label name with special chars:** pass as-is to search_label_by_name; API may accept or return None.
- **Empty chart (0 tracks):** append 0 tracks; continue.
- **Very large result:** no hard limit in Phase 3; UI may paginate or truncate later.

---

## 8. Dependencies

- discovery.py: depends on InventoryService (get_library_artists, get_library_labels), BeatportApi (list_charts, get_chart, get_label_releases, search_label_by_name). No UI dependency.

---

## 9. Completion criteria

- [ ] run_discovery implemented; charts and new_releases branches and dedupe tested.
- [ ] DiscoveredTrack model used by Phase 4.
- [ ] All unit tests pass; integration test with mocks passes.

---

## 10. Exact code reference

### 10.1 Normalize artist for comparison

```python
def _normalize_artist(name: str) -> str:
    return (name or "").strip().lower()
```

- library_artists_set = {_normalize_artist(a) for a in inventory_service.get_library_artists()}.

### 10.2 Charts branch loop (pseudocode)

```python
for genre_id in genre_ids:
    charts = beatport_api.list_charts(genre_id, charts_from_date, charts_to_date)
    for chart in charts:
        if _normalize_artist(chart.author_name) not in library_artists_set:
            continue
        detail = beatport_api.get_chart(chart.id)
        if not detail:
            continue
        for t in detail.tracks:
            result_tracks.append(DiscoveredTrack(
                beatport_track_id=t.track_id,
                beatport_url=t.beatport_url,
                title=t.title,
                artists=t.artists,
                source_type="chart",
                source_name=detail.name,
            ))
```

### 10.3 Label name → id resolution

- Call search_label_by_name for each label; cache in dict label_name -> id so we do not call search twice for same label. If API returns multiple labels, take first match or best match (e.g. exact name).

### 10.4 Dedupe by track id

```python
seen: Set[int] = set()
deduped: List[DiscoveredTrack] = []
for t in combined:
    if t.beatport_track_id not in seen:
        seen.add(t.beatport_track_id)
        deduped.append(t)
return deduped
```

---

## 11. Full testing design (extended)

### 11.1 Mock inventory service

- get_library_artists() -> ["Artist A", "Artist B"]
- get_library_labels() -> ["Defected", "Anjunadeep"]
- has_artist(name) -> name in library (optional; discovery uses get_library_artists set).

### 11.2 Mock Beatport API

- list_charts(genre_id, from_d, to_d) -> [ChartSummary(id=1, author_name="Artist A", published_date="2025-02-01", ...)]
- get_chart(1) -> ChartDetail(tracks=[ChartTrack(track_id=100, ...), ChartTrack(track_id=101, ...)])
- search_label_by_name("Defected") -> 5
- get_label_releases(5, from_d, to_d) -> [LabelRelease(tracks=[...])]

### 11.3 Assertions per test

- test_run_discovery_empty_inventory: len(result) == 0.
- test_run_discovery_charts_filters_by_author: len(result) == 2; all source_type == "chart"; source_name == chart name.
- test_run_discovery_dedupe: chart and release both have track_id 99; len(result) == 1; result[0].beatport_track_id == 99.
- test_run_discovery_label_not_found: get_label_releases not called when search_label_by_name returns None.

### 11.4 Additional test cases

- test_run_discovery_multiple_genres: genre_ids=[1,2]; list_charts called for each; results combined.
- test_run_discovery_multiple_charts_same_author: 2 charts same author in library; both chart track lists added.
- test_run_discovery_release_date_outside_range: get_label_releases returns release with date 40 days ago; filter in API or in discovery so only last 30 days; assert that release excluded or included per spec.
- test_run_discovery_progress_callback_stages: callback called with ("charts", 1, 2), ("charts", 2, 2), ("releases", 1, 1) or similar.
- test_discovered_track_fields: one DiscoveredTrack; assert beatport_url, title, artists, source_type, source_name set.

---

## 12. Error handling

- If list_charts raises BeatportAPIError: log and continue with next genre; do not fail entire run.
- If get_chart raises: skip that chart; continue.
- If get_label_releases raises: skip that label; continue.
- Progress callback: call even when 0 charts/releases so UI can update.

---

## 13. Next phase

Phase 4: [incrate-04-playlist-and-auth.md](incrate-04-playlist-and-auth.md) — Playlist creation and add tracks (API or browser); uses List[DiscoveredTrack] from this phase.

---

## Appendix A: Line-by-line implementation checklist (Phase 3)

1. **incrate/discovery_models.py or beatport_api_models.py:** Add DiscoveredTrack(beatport_track_id, beatport_url, title, artists, source_type, source_name).
2. **incrate/discovery.py:** _normalize_artist(name) -> str: strip, lower. run_discovery(inventory_service, beatport_api, genre_ids, charts_from_date, charts_to_date, new_releases_days=30, progress_callback): library_artists = set(_normalize_artist(a) for a in inventory_service.get_library_artists()). result_tracks = []. For genre_id in genre_ids: charts = beatport_api.list_charts(...). For chart in charts: if _normalize_artist(chart.author_name) not in library_artists: continue. detail = beatport_api.get_chart(chart.id). For t in detail.tracks: append DiscoveredTrack(..., source_type="chart", source_name=detail.name). label_ids = {}; for label in inventory_service.get_library_labels(): id = beatport_api.search_label_by_name(label); if id: label_ids[label]=id. from_date = today - timedelta(days=new_releases_days). For label_id in label_ids.values(): releases = beatport_api.get_label_releases(label_id, from_date, to_date). For release in releases: for t in release.tracks: append DiscoveredTrack(..., source_type="label_release", source_name=release.title). Dedupe by beatport_track_id. Return list.
3. **services/incrate_discovery_service.py:** Facade that reads config (genre_ids, dates); calls discovery.run_discovery with inventory_service and beatport_api; returns result.
4. **Tests:** Mock inventory (get_library_artists, get_library_labels); mock API (list_charts, get_chart, get_label_releases, search_label_by_name). Assert filtering by author; assert dedupe; assert progress_callback.

---

## Appendix B: Full test case specifications (Phase 3)

- **test_run_discovery_empty_inventory:** get_library_artists=[]; get_library_labels=[]; assert result == [].
- **test_run_discovery_charts_filters_by_author:** library_artists ["Artist A"]; list_charts return [ChartSummary(author_name="Artist A")]; get_chart return ChartDetail(tracks=[ChartTrack(100,...), ChartTrack(101,...)]); assert len(result)==2; both source_type "chart".
- **test_run_discovery_charts_skips_author_not_in_library:** author_name "Other"; library_artists ["Artist A"]; assert get_chart not called for that chart; result 0 from charts.
- **test_run_discovery_new_releases_adds_tracks:** get_library_labels ["Defected"]; search_label_by_name return 5; get_label_releases return [LabelRelease(tracks=[ChartTrack(200,...), ChartTrack(201,...)])]; assert len(result)==2; source_type "label_release".
- **test_run_discovery_dedupe:** Chart has track_id 99; release has track_id 99; assert len(result)==1; result[0].beatport_track_id==99.
- **test_run_discovery_label_not_found_skipped:** search_label_by_name return None; assert get_label_releases not called.

---

## Appendix C: Error and edge case matrix (Phase 3)

| Scenario | Handling |
|----------|----------|
| genre_ids empty | Charts branch returns []; only new_releases run |
| get_chart returns None | Skip that chart |
| list_charts raises | Log; continue next genre |
| get_label_releases raises | Log; skip that label |
| Label name special chars | Pass to search_label_by_name as-is |
| Empty chart (0 tracks) | Append 0; continue |
| progress_callback | Call with (stage, current, total) even when 0 |

---

## Appendix D: Dependency graph (Phase 3)

```
InventoryService.get_library_artists, get_library_labels
BeatportApi.list_charts, get_chart, get_label_releases, search_label_by_name
       |
       v
discovery.run_discovery -> List[DiscoveredTrack] (deduped)
       |
       v
Phase 4 (playlist_writer), Phase 5 (UI results section)
```

---

## Appendix E: Exact function signatures (Phase 3)

**incrate/discovery_models.py or beatport_api_models.py**
```python
@dataclass
class DiscoveredTrack:
    beatport_track_id: int
    beatport_url: str
    title: str
    artists: str
    source_type: str   # "chart" | "label_release"
    source_name: str
```

**incrate/discovery.py**
```python
def _normalize_artist(name: str) -> str: ...

def run_discovery(
    inventory_service: InventoryService,
    beatport_api: BeatportApi,
    genre_ids: List[int],
    charts_from_date: date,
    charts_to_date: date,
    new_releases_days: int = 30,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[DiscoveredTrack]: ...
```

**services/incrate_discovery_service.py**
```python
def run_discovery(self, genre_ids: Optional[List[int]] = None, ...) -> List[DiscoveredTrack]: ...
```

---

## Appendix F: Test file layout and pytest markers (Phase 3)

- `tests/unit/incrate/test_discovery.py`: TestRunDiscovery*; mock InventoryService and BeatportApi; assert result list and dedupe.
- `tests/unit/services/test_incrate_discovery_service.py`: TestRunDiscoveryReturnsList, TestRunDiscoveryUsesConfigDates.
- `tests/integration/test_incrate_discovery.py`: TestRunDiscoveryE2eMocked; marker @pytest.mark.integration.
