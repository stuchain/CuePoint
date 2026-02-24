# inCrate implementation design 02: Beatport API client (Phase 2)

**Implementation order:** Phase 2 — build after Phase 1 (Inventory). Depends on no other inCrate phases; existing BeatportService (search/fetch) remains separate.  
**Spec:** [../incrate-spec.md](../incrate-spec.md)  
**Previous phase:** [incrate-01-inventory.md](incrate-01-inventory.md)  
**Next phase:** [incrate-03-discovery.md](incrate-03-discovery.md) (Discovery flow).

---

## 1. Goals and scope

1. Add a **Beatport API client** inside CuePoint for **read-only** operations: list genres, list charts by genre and date range, get chart detail (author, track list), get label releases (or tracks) by label and date range.
2. Use **API token or OAuth** from config/env; no scraping for these operations.
3. **Reuse** existing `BeatportService` (search_tracks, fetch_track_data) for inventory label enrichment; this phase adds **new** HTTP client and endpoints for charts and label releases only.
4. Normalize API responses to **in-memory dataclasses** so Phase 3 (Discovery) and Phase 4 (Playlist) depend on stable types, not raw JSON.

**Out of scope:** Playlist create/add (Phase 4); UI (Phase 5). Scraping fallback is out of scope for this phase; if API is unavailable, discovery is disabled until credentials are set.

---

## 2. Exact file and directory layout

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `src/cuepoint/incrate/beatport_api_models.py` | Dataclasses: Genre, ChartSummary, ChartDetail, ChartTrack, LabelRelease, DiscoveredTrack (or reuse from discovery phase). |
| CREATE | `src/cuepoint/services/beatport_api_client.py` | HTTP client: auth header, get/list methods, error handling, retries. |
| CREATE | `src/cuepoint/services/beatport_api.py` | High-level API: list_genres(), list_charts(genre_id, from_date, to_date), get_chart(chart_id), get_label_releases(label_id, from_date, to_date); parse JSON → models; use beatport_api_client. |
| MODIFY | `src/cuepoint/models/config.py` or config schema | Add keys: incrate.beatport_api_base_url, incrate.beatport_access_token (or beatport.access_token). |
| MODIFY | `src/cuepoint/services/bootstrap.py` or DI | Register BeatportApiClient or BeatportApi service if used by discovery. |

All paths relative to repo root. Do **not** modify existing `beatport_service.py` for this phase; add new modules.

---

## 3. Data models (exact)

**File:** `src/cuepoint/incrate/beatport_api_models.py`

```python
from dataclasses import dataclass
from typing import List, Optional
from datetime import date

@dataclass
class Genre:
    id: int
    name: str
    slug: str  # e.g. "afro-house" for URL/API

@dataclass
class ChartSummary:
    id: int
    name: str
    genre_id: int
    genre_slug: str
    author_id: Optional[int]
    author_name: str  # chart author (artist name)
    published_date: str  # ISO date or YYYY-MM-DD
    track_count: int

@dataclass
class ChartTrack:
    track_id: int
    title: str
    artists: str  # comma-separated
    beatport_url: str  # full URL
    position: int  # 1-based in chart

@dataclass
class ChartDetail:
    id: int
    name: str
    author_name: str
    published_date: str
    tracks: List[ChartTrack]

@dataclass
class LabelReleaseTrack:
    track_id: int
    title: str
    artists: str
    beatport_url: str
    release_date: str

@dataclass
class LabelRelease:
    release_id: int
    title: str
    release_date: str
    tracks: List[LabelReleaseTrack]
```

- Exact field names may vary with Beatport API response; adjust parsing in beatport_api.py to match. If API returns nested objects (e.g. artists as list), map to `artists: str` by joining with ", ".

---

## 4. API surface (target endpoints)

Research Beatport’s public/partner API and OpenAPI spec (e.g. from ivo-toby/beatport-mcp-server). Document the **exact** endpoint paths and query params here once known. Placeholder structure:

| Endpoint | Method | Purpose | Query/body |
|----------|--------|---------|------------|
| /genres or /catalog/genres | GET | List genres | — |
| /charts or /catalog/charts | GET | List charts | genre_id, from_date, to_date, limit, offset |
| /charts/{id} or /catalog/charts/{id} | GET | Chart detail | — |
| /labels/{id}/releases or /catalog/releases | GET | Releases by label | label_id, from_date, to_date |
| /labels/search or /catalog/labels | GET | Resolve label name → id | q=name |

- **Base URL:** e.g. https://api.beatport.com/v4 or similar; config key `incrate.beatport_api_base_url`.
- **Auth:** Bearer token in header: `Authorization: Bearer {token}`. Config key `incrate.beatport_access_token` or env `BEATPORT_ACCESS_TOKEN`.

---

## 5. Step-by-step implementation

### 5.1 BeatportApiClient (low-level HTTP)

**File:** `src/cuepoint/services/beatport_api_client.py`

- **Class:** `BeatportApiClient`
- **__init__(self, base_url: str, access_token: str, timeout: int = 30, session: Optional[requests.Session] = None)**
- **Methods:**
  - `_headers() -> dict`: return `{"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}`.
  - `get(self, path: str, params: Optional[dict] = None) -> dict`: GET base_url + path with params; raise BeatportAPIError on 4xx/5xx; return response.json().
  - `_request(self, method: str, path: str, **kwargs) -> requests.Response`: single place for request; check response.raise_for_status() or status_code; on 401 log "Invalid or expired token".
- **Error handling:** On 429 (rate limit), retry with Retry-After or exponential backoff (reuse cuepoint.services.reliability_retry). On 401, do not retry; raise and surface to user.
- **Logging:** Log request path (not token); log response status; on error log status and body (truncate).

### 5.2 BeatportApi (high-level, parsing)

**File:** `src/cuepoint/services/beatport_api.py`

- **Class:** `BeatportApi` or module-level functions.
- **__init__(self, client: BeatportApiClient, cache_service: Optional[ICacheService] = None)**
- **list_genres() -> List[Genre]:**
  - Cache key: `beatport_api:genres`; TTL 86400 (24h). If cache hit, return cached.
  - client.get("/genres") or equivalent; parse JSON to List[Genre]; return.
- **list_charts(self, genre_id: int, from_date: date, to_date: date, limit: int = 100) -> List[ChartSummary]:**
  - Cache key: `beatport_api:charts:{genre_id}:{from_date}:{to_date}`; TTL 3600.
  - client.get("/charts", params={"genre_id": genre_id, "from": from_date.isoformat(), "to": to_date.isoformat(), "limit": limit}); parse to List[ChartSummary]; filter by date in app if API does not.
  - Return only charts with published_date in [from_date, to_date].
- **get_chart(self, chart_id: int) -> Optional[ChartDetail]:**
  - Cache key: `beatport_api:chart:{chart_id}`; TTL 3600.
  - client.get(f"/charts/{chart_id}"); parse to ChartDetail (tracks list); return.
- **get_label_releases(self, label_id: int, from_date: date, to_date: date) -> List[LabelRelease]:**
  - Cache key: `beatport_api:label_releases:{label_id}:{from_date}:{to_date}`; TTL 3600.
  - client.get(f"/labels/{label_id}/releases" or equivalent, params={"from": from_date, "to": to_date}); parse to List[LabelRelease]; filter release_date in range.
- **search_label_by_name(self, name: str) -> Optional[int]:** return label id if found; for Phase 3 (discovery) to resolve label name from inventory to API label_id.

### 5.3 Configuration

- `incrate.beatport_api_base_url` (str): default "https://api.beatport.com/v4" or whatever Beatport uses.
- `incrate.beatport_access_token` (str): no default; if empty, list_genres/list_charts/get_label_releases return empty or raise clear error "Configure Beatport API token".
- Env override: `BEATPORT_ACCESS_TOKEN` overrides config if set.
- `incrate.beatport_api_timeout` (int): default 30.

### 5.4 Parsing JSON → models

- In beatport_api.py, add private functions: `_parse_genre(obj) -> Genre`, `_parse_chart_summary(obj) -> ChartSummary`, `_parse_chart_detail(obj) -> ChartDetail`, `_parse_label_release(obj) -> LabelRelease`.
- Handle missing keys: use .get() with None; map None to "" or skip optional fields. Do not crash on extra keys.
- Date fields: if API returns "2025-02-01", keep as str; if datetime, use .split("T")[0] for date part.

---

## 6. Caching

- Use existing ICacheService (same as BeatportService). Keys: prefix `beatport_api:` to avoid collision with search cache.
- TTL: genres 24h; charts list 1h; chart detail 1h; label releases 1h.
- Invalidation: not required for Phase 2; user can clear cache in settings later if needed.

---

## 7. Dependencies and import order

- beatport_api_models.py: no internal CuePoint deps.
- beatport_api_client.py: requests, cuepoint.exceptions (BeatportAPIError).
- beatport_api.py: beatport_api_client, beatport_api_models, cache service, config. No dependency on incrate.inventory or discovery.

---

## 8. Full testing design

### 8.1 Unit tests – BeatportApiClient

**File:** `src/tests/unit/services/test_beatport_api_client.py`

| Test method | Description | Mock | Assertion |
|-------------|-------------|------|-----------|
| test_get_sends_auth_header | client.get("/genres") | requests mock; capture kwargs | headers["Authorization"] == "Bearer {token}" |
| test_get_returns_json | response.json() = {"data": []} | mock response | return value == {"data": []} |
| test_get_raises_on_401 | response.status_code 401 | mock response | raises BeatportAPIError or AuthError |
| test_get_raises_on_500 | response.status_code 500 | mock response | raises BeatportAPIError |
| test_get_passes_params | client.get("/charts", params={"genre_id": 1}) | capture request | request.params has genre_id=1 |
| test_timeout_passed | client.get(...) | capture Session.get call | timeout=30 or config |

### 8.2 Unit tests – BeatportApi (parsing and caching)

**File:** `src/tests/unit/services/test_beatport_api.py`

| Test method | Description | Mock | Assertion |
|-------------|-------------|------|-----------|
| test_list_genres_returns_list | list_genres() | client.get return fixtures | List[Genre]; len >= 1 |
| test_list_genres_caches | call twice; client.get once | cache.get return None then cached | client.get called once |
| test_list_charts_filters_by_date | list_charts(genre_id=1, from=date(2025,1,1), to=date(2025,1,31)) | client.get return charts with mixed dates | all returned have published_date in Jan 2025 |
| test_get_chart_returns_detail | get_chart(123) | client.get return chart detail JSON | ChartDetail with id=123; tracks list |
| test_get_chart_caches | get_chart(123) twice | client.get once | client.get called once |
| test_get_label_releases_filters_date | get_label_releases(label_id=1, from, to) | client.get return releases | all release_date in range |
| test_search_label_by_name_returns_id | search_label_by_name("Defected") | client.get return label search | id int |
| test_search_label_by_name_not_found | no match | client.get return [] | None |
| test_list_genres_empty_token_raises | token="" | — | clear error or empty list |

### 8.3 Unit tests – models

**File:** `src/tests/unit/incrate/test_beatport_api_models.py`

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_genre_dataclass | Genre(id=1, name="House", slug="house") | fields accessible |
| test_chart_detail_tracks | ChartDetail(tracks=[ChartTrack(...)]) | len(detail.tracks) == 1 |

### 8.4 Integration tests

**File:** `src/tests/integration/test_beatport_api.py`

| Test method | Description | Skip condition | Assertion |
|-------------|-------------|----------------|-----------|
| test_list_genres_live | Real API call | if not BEATPORT_ACCESS_TOKEN | list_genres() non-empty |
| test_list_charts_live | Real API with genre and dates | same | list_charts returns list |
| test_get_chart_live | get_chart(known_id) | same | ChartDetail with tracks |

- Use pytest.ini or marker: `@pytest.mark.integration` and `@pytest.mark.skipif(not os.environ.get("BEATPORT_ACCESS_TOKEN"))`.

### 8.5 Fixtures (JSON responses)

**File:** `src/tests/fixtures/beatport_api/genres_response.json`

- Minimal JSON matching Beatport API shape for genres (array of objects with id, name, slug).

**File:** `src/tests/fixtures/beatport_api/charts_response.json`

- Array of chart objects: id, name, genre_id, author_name, published_date.

**File:** `src/tests/fixtures/beatport_api/chart_detail_response.json`

- Single chart with tracks array: track_id, title, artists, url, position.

- Load in tests: `json.load(open(fixture_path))` or pytest fixture.

### 8.6 Full test matrix (Phase 2)

| # | Test file | Test class | Test method |
|---|-----------|------------|-------------|
| 1 | test_beatport_api_client | TestBeatportApiClientGet | test_get_sends_auth_header |
| 2 | test_beatport_api_client | TestBeatportApiClientGet | test_get_returns_json |
| 3 | test_beatport_api_client | TestBeatportApiClientGet | test_get_raises_on_401 |
| 4 | test_beatport_api_client | TestBeatportApiClientGet | test_get_raises_on_500 |
| 5 | test_beatport_api_client | TestBeatportApiClientGet | test_get_passes_params |
| 6 | test_beatport_api | TestBeatportApiListGenres | test_returns_list |
| 7 | test_beatport_api | TestBeatportApiListGenres | test_caches |
| 8 | test_beatport_api | TestBeatportApiListCharts | test_filters_by_date |
| 9 | test_beatport_api | TestBeatportApiGetChart | test_returns_detail |
| 10 | test_beatport_api | TestBeatportApiGetChart | test_caches |
| 11 | test_beatport_api | TestBeatportApiLabelReleases | test_filters_date |
| 12 | test_beatport_api | TestBeatportApiSearchLabel | test_returns_id |
| 13 | test_beatport_api | TestBeatportApiSearchLabel | test_not_found_returns_none |
| 14 | test_beatport_api_models | TestGenre | test_dataclass |
| 15 | test_beatport_api_models | TestChartDetail | test_tracks |
| 16 | test_beatport_api (integration) | TestBeatportApiLive | test_list_genres_live |
| 17 | test_beatport_api (integration) | TestBeatportApiLive | test_list_charts_live |
| 18 | test_beatport_api (integration) | TestBeatportApiLive | test_get_chart_live |

### 8.7 File-by-file implementation checklist (Phase 2)

| File | Item | Implemented | Test |
|------|------|-------------|------|
| incrate/beatport_api_models.py | Genre, ChartSummary, ChartTrack, ChartDetail, LabelRelease, LabelReleaseTrack | [ ] | test_beatport_api_models |
| services/beatport_api_client.py | BeatportApiClient.__init__ | [ ] | test_beatport_api_client |
| services/beatport_api_client.py | _headers, get, _request | [ ] | test_get_* |
| services/beatport_api.py | BeatportApi or module functions | [ ] | test_beatport_api |
| services/beatport_api.py | list_genres, list_charts, get_chart, get_label_releases, search_label_by_name | [ ] | test_* |
| services/beatport_api.py | _parse_genre, _parse_chart_summary, _parse_chart_detail, _parse_label_release | [ ] | via list_*/get_* |
| config | incrate.beatport_api_base_url, incrate.beatport_access_token, incrate.beatport_api_timeout | [ ] | config tests |

---

## 9. Edge cases and error handling

- **Missing token:** If token is empty, list_genres can return [] or raise "Configure Beatport API token"; prefer raising so UI can show message.
- **Invalid token (401):** Raise BeatportAPIError with message "Invalid or expired token"; do not retry.
- **Rate limit (429):** Retry with backoff (reuse run_with_retry); max 3 retries.
- **Timeout:** Use config timeout; on timeout raise or return partial; log.
- **Malformed JSON:** Catch json.JSONDecodeError; raise BeatportAPIError("Invalid API response").
- **Missing key in response:** Use .get() with None; if required field missing (e.g. id), skip that item or raise with "Unexpected API response shape".
- **Empty chart list:** Return []; do not treat as error.
- **Label not found in search:** Return None; Phase 3 will skip that label.

---

## 10. Exact code reference

### 10.1 BeatportApiClient.get (with retry)

```python
def get(self, path: str, params: Optional[dict] = None) -> dict:
    url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
    resp = self.session.get(url, params=params, headers=self._headers(), timeout=self.timeout)
    if resp.status_code == 401:
        raise BeatportAPIError("Invalid or expired Beatport API token", status_code=401)
    resp.raise_for_status()
    return resp.json()
```

### 10.2 Cache key format

- `beatport_api:genres`
- `beatport_api:charts:{genre_id}:{from_date}:{to_date}`
- `beatport_api:chart:{chart_id}`
- `beatport_api:label_releases:{label_id}:{from_date}:{to_date}`
- `beatport_api:label_search:{normalized_name}` (for search_label_by_name)

### 10.3 Config default

- base_url: "https://api.beatport.com/v4" (verify against Beatport docs)
- access_token: "" (required to be set by user)
- timeout: 30

---

## 11. Completion criteria for Phase 2

- [ ] BeatportApiClient and BeatportApi implemented; config keys added.
- [ ] list_genres, list_charts, get_chart, get_label_releases, search_label_by_name implemented and tested with mocks.
- [ ] Caching in place for all list/get methods.
- [ ] Integration tests skipped when BEATPORT_ACCESS_TOKEN not set; pass when set.
- [ ] No dependency on Phase 3 or 4; Phase 3 will depend on this module.

---

## 12. Detailed implementation notes (BeatportApi)

### 12.1 list_charts date filtering

- API may return charts with published_date; filter in Python: `[c for c in raw if from_date <= parse_date(c.published_date) <= to_date]`.
- If API uses query params for date, pass from_date and to_date as ISO string; still filter in app to avoid timezone issues.
- Sort result by published_date descending (newest first) for consistency.

### 12.2 get_chart tracks ordering

- Preserve API order (usually position 1..N); set ChartTrack.position from API or enumerate(tracks, 1).

### 12.3 get_label_releases pagination

- If API supports limit/offset, loop: fetch page; append to list; if len(page) < limit, break. Else single call.

### 12.4 search_label_by_name

- Call GET /catalog/labels?q={name} or similar; take first result id if any; else None. Normalize name: strip, lowercase for comparison if API is case-insensitive.

### 12.5 Retry and circuit breaker

- Reuse cuepoint.services.reliability_retry.run_with_retry for get(); max_retries 2 for 5xx; do not retry 4xx except 429.
- Optionally use circuit breaker (get_network_circuit_breaker) around get() to avoid cascading failures.

---

## 13. Test fixture examples (JSON)

### 13.1 genres_response.json (minimal)

```json
[
  {"id": 5, "name": "House", "slug": "house"},
  {"id": 12, "name": "Afro House", "slug": "afro-house"}
]
```

### 13.2 chart_detail_response.json (minimal)

```json
{
  "id": 12345,
  "name": "Top 10 February",
  "author": {"id": 1, "name": "Artist Name"},
  "published_date": "2025-02-15",
  "tracks": [
    {"id": 100, "title": "Track A", "artists": [{"name": "Artist 1"}], "url": "https://beatport.com/track/...", "position": 1}
  ]
}
```

- Adjust keys to actual Beatport API (e.g. performers vs artists, slug vs id). Tests assert structure after parsing.

---

## 14. Error code matrix

| HTTP | Action | User message |
|------|--------|--------------|
| 401 | Raise BeatportAPIError | "Invalid or expired Beatport API token. Check Settings." |
| 403 | Raise | "Beatport API access forbidden." |
| 404 | Return [] or None | No error for chart/release not found |
| 429 | Retry with backoff | After 3 failures: "Rate limited; try again later." |
| 5xx | Retry up to 2x | "Beatport API error; try again." |
| Timeout | Raise or return | "Request timed out." |

---

## 15. Next phase

Phase 3: [incrate-03-discovery.md](incrate-03-discovery.md) — Discovery flow: use inventory (Phase 1) and Beatport API (Phase 2) to build charts-from-library-artists and new-releases-from-labels; output list of DiscoveredTrack for Phase 4.

---

## Appendix A: Line-by-line implementation checklist (Phase 2)

1. **incrate/beatport_api_models.py:** Define Genre(id, name, slug), ChartSummary(id, name, genre_id, genre_slug, author_id, author_name, published_date, track_count), ChartTrack(track_id, title, artists, beatport_url, position), ChartDetail(id, name, author_name, published_date, tracks), LabelReleaseTrack, LabelRelease. Add docstrings.
2. **services/beatport_api_client.py:** BeatportApiClient.__init__(base_url, access_token, timeout). _headers() return dict with Authorization Bearer. get(path, params) -> dict: session.get(url, params, headers, timeout); on 401 raise BeatportAPIError; resp.raise_for_status(); return resp.json(). Use requests.Session.
3. **services/beatport_api.py:** BeatportApi __init__(client, cache_service). list_genres(): cache key beatport_api:genres TTL 86400; if cache return; client.get("/genres"); parse to List[Genre]; cache.set; return. list_charts(genre_id, from_date, to_date, limit): cache key; client.get("/charts", params); parse; filter by date; return. get_chart(chart_id): cache; client.get(f"/charts/{chart_id}"); parse ChartDetail; return. get_label_releases(label_id, from_date, to_date): cache; client.get; parse; filter; return. search_label_by_name(name): client.get("/labels", params={"q": name}); take first id or None.
4. **Parsing helpers:** _parse_genre(obj), _parse_chart_summary(obj), _parse_chart_detail(obj), _parse_label_release(obj). Use .get() for all keys; handle list/dict nesting per API response shape.
5. **Config:** incrate.beatport_api_base_url, incrate.beatport_access_token, incrate.beatport_api_timeout. Read in BeatportApi or client from config_service.
6. **Tests:** test_beatport_api_client (get, auth header, 401, 500); test_beatport_api (list_genres, list_charts, get_chart, get_label_releases, search_label, cache); test_beatport_api_models; integration test with BEATPORT_ACCESS_TOKEN.

---

## Appendix B: Full test case specifications (Phase 2)

- **test_get_sends_auth_header:** Mock requests.Session.get; client.get("/genres"); assert call_args.kwargs["headers"]["Authorization"].startswith("Bearer ").
- **test_get_raises_on_401:** Mock response.status_code=401; assert raises BeatportAPIError.
- **test_list_genres_returns_list:** Mock client.get return [{"id":1,"name":"House","slug":"house"}]; assert list_genres() == [Genre(1,"House","house")].
- **test_list_genres_caches:** First call client.get; second call cache.get return cached; assert client.get call_count == 1.
- **test_list_charts_filters_by_date:** Mock return charts with published_date 2025-01-15 and 2025-03-01; from_date 2025-01-01 to_date 2025-01-31; assert only Jan chart in result.
- **test_get_chart_returns_detail:** Mock return {"id":1,"name":"Top 10","author":{"name":"DJ"},"tracks":[{"id":100,"title":"T"}]}; assert ChartDetail with tracks len 1.
- **test_search_label_by_name_not_found:** Mock return []; assert search_label_by_name("X") is None.

---

## Appendix C: Error and edge case matrix (Phase 2)

| Scenario | Handling |
|----------|----------|
| 401 Unauthorized | Raise BeatportAPIError; do not retry |
| 403 Forbidden | Raise |
| 404 Not found | Return [] or None |
| 429 Rate limit | Retry with backoff (max 3) |
| 5xx | Retry up to 2x; then raise |
| Timeout | Raise or log and raise |
| Malformed JSON | Catch JSONDecodeError; raise BeatportAPIError |
| Missing required key in response | Skip item or raise "Unexpected API response" |
| Empty token | list_genres etc. raise or return []; document "Configure token" |

---

## Appendix D: Dependency graph (Phase 2)

```
config (base_url, token, timeout)
  |
  v
BeatportApiClient.get(path, params)
  |
  v
BeatportApi.list_genres, list_charts, get_chart, get_label_releases, search_label_by_name
  |                    |
  |                    +-> cache_service.get/set
  v
Phase 3 (discovery) uses list_charts, get_chart, get_label_releases, search_label_by_name
Phase 4 (playlist) may use same token for create_playlist if API supports
```

---

## Appendix E: Exact function signatures (Phase 2)

**incrate/beatport_api_models.py**
```python
@dataclass
class Genre:
    id: int
    name: str
    slug: str

@dataclass
class ChartSummary: ...
@dataclass
class ChartTrack: ...
@dataclass
class ChartDetail: ...
@dataclass
class LabelReleaseTrack: ...
@dataclass
class LabelRelease: ...
```

**services/beatport_api_client.py**
```python
class BeatportApiClient:
    def __init__(self, base_url: str, access_token: str, timeout: int = 30, session: Optional[requests.Session] = None): ...
    def _headers(self) -> dict: ...
    def get(self, path: str, params: Optional[dict] = None) -> dict: ...
```

**services/beatport_api.py**
```python
def list_genres(self) -> List[Genre]: ...
def list_charts(self, genre_id: int, from_date: date, to_date: date, limit: int = 100) -> List[ChartSummary]: ...
def get_chart(self, chart_id: int) -> Optional[ChartDetail]: ...
def get_label_releases(self, label_id: int, from_date: date, to_date: date) -> List[LabelRelease]: ...
def search_label_by_name(self, name: str) -> Optional[int]: ...
```

---

## Appendix F: Test file layout and pytest markers (Phase 2)

- `tests/unit/services/test_beatport_api_client.py`: TestBeatportApiClientGet; mock requests.Session.get.
- `tests/unit/services/test_beatport_api.py`: TestBeatportApiListGenres, TestBeatportApiListCharts, TestBeatportApiGetChart, TestBeatportApiLabelReleases, TestBeatportApiSearchLabel; mock BeatportApiClient.
- `tests/unit/incrate/test_beatport_api_models.py`: TestGenre, TestChartDetail.
- `tests/integration/test_beatport_api.py`: TestBeatportApiLive; marker @pytest.mark.integration; @pytest.mark.skipif(not os.environ.get("BEATPORT_ACCESS_TOKEN")).
