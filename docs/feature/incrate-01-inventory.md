# inCrate implementation design 01: Inventory (Phase 1)

**Implementation order:** Phase 1 — build this first. No inCrate dependencies.  
**Spec:** [../incrate-spec.md](../incrate-spec.md)  
**Next phase:** [incrate-02-beatport-api.md](incrate-02-beatport-api.md) (Beatport API client).

---

## 1. Goals and scope

1. Parse the **full COLLECTION** from Rekordbox XML (every TRACK under COLLECTION, not just playlist-referenced).
2. Persist an **inventory index** in SQLite with: artist, title, remix/version, label (when available).
3. On **first import** only: for tracks with empty label, run existing inKey-style Beatport match and store the resolved label (and optionally Beatport track ID/URL).
4. Expose: library artists list, library labels list, “has artist” check, inventory stats — for use by Phase 3 (Discovery).

**Out of scope for this phase:** Beatport API for charts/releases (Phase 2), discovery flow (Phase 3), playlist (Phase 4), UI (Phase 5).

---

## 2. Exact file and directory layout

Create or modify the following. All paths are relative to repo root `s:\Documents\Git Projects\CuePoint`.

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `src/cuepoint/incrate/__init__.py` | Empty or export public symbols for incrate package. |
| CREATE | `src/cuepoint/incrate/models.py` | Dataclasses: `CollectionTrack`, `InventoryRecord` (in-memory shapes). |
| CREATE | `src/cuepoint/incrate/schema.sql` | SQLite DDL (or embed in code). |
| CREATE | `src/cuepoint/incrate/inventory_db.py` | DB layer: connect, upsert, get_library_artists, get_library_labels, has_artist, get_inventory_stats. |
| CREATE | `src/cuepoint/incrate/collection_parser.py` | Parse XML COLLECTION only → iterable of CollectionTrack; track_key computation. |
| CREATE | `src/cuepoint/incrate/enrichment.py` | Label enrichment: given InventoryService + BeatportService, enrich rows with empty label; progress callback. |
| CREATE | `src/cuepoint/services/inventory_service.py` | Facade: import_from_xml(path, enrich=True), get_library_artists(), get_library_labels(), has_artist(name), get_inventory_stats(); uses incrate.* and BeatportService. |
| MODIFY | `src/cuepoint/data/rekordbox.py` | Add `parse_collection(xml_path: str) -> Iterator[CollectionTrack]` (or return list); read COLLECTION only; read TrackID, Name, Artist, Label, Remixer; optional remix from title via mix_parser. |

Do **not** create `src/cuepoint/incrate/collection_parser.py` as a wrapper that re-parses XML: either implement `parse_collection` in `rekordbox.py` and have `collection_parser.py` re-export and add `track_key`, or implement full parse in `collection_parser.py` and call `rekordbox` only for XML loading/validation. Design choice: implement **parse_collection** in `rekordbox.py` (single place for XML) and `collection_parser.py` only builds `track_key` and maps to `CollectionTrack`/`InventoryRecord`.

---

## 3. Data model (exact)

### 3.1 CollectionTrack (in-memory, from XML)

**File:** `src/cuepoint/incrate/models.py`

```python
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=False)
class CollectionTrack:
    track_id: str       # Rekordbox TrackID
    title: str
    artist: str
    remix_version: str  # From Remixer attr or parsed from title
    label: Optional[str] = None  # From XML Label attr
```

- All string fields must be stripped; empty string allowed for artist/title only if we later allow (otherwise reject in parser). For remix_version and label, empty string or None both mean “unknown”.

### 3.2 InventoryRecord (row to persist)

**File:** `src/cuepoint/incrate/models.py`

```python
@dataclass
class InventoryRecord:
    track_key: str
    track_id: str
    artist: str
    title: str
    remix_version: str
    label: Optional[str]
    beatport_track_id: Optional[str] = None
    beatport_url: Optional[str] = None
    created_at: str   # ISO 8601
    updated_at: str   # ISO 8601
```

- `track_key`: unique key for upsert; recommend `track_id` for simplicity (Rekordbox TrackID is unique per collection export). If we support multiple XML files later, use `hash(xml_path + track_id)` or `f"{xml_path}:{track_id}"`; for Phase 1, `track_key = track_id` is sufficient.

### 3.3 SQLite schema (exact DDL)

**File:** `src/cuepoint/incrate/schema.sql` (or inline in `inventory_db.py`)

```sql
-- inCrate inventory: one row per unique track (by track_key)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_key TEXT NOT NULL UNIQUE,
    track_id TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    remix_version TEXT DEFAULT '',
    label TEXT,
    beatport_track_id TEXT,
    beatport_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_artist ON inventory(artist);
CREATE INDEX IF NOT EXISTS idx_inventory_label ON inventory(label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_track_key ON inventory(track_key);
```

- Use IF NOT EXISTS for idempotent init. SQLite: no separate “updated_at” trigger; application sets updated_at on every update.

### 3.4 Queries to implement

- **Upsert:** `INSERT INTO inventory (...) VALUES (?) ON CONFLICT(track_key) DO UPDATE SET artist=excluded.artist, title=excluded.title, remix_version=excluded.remix_version, label=COALESCE(excluded.label, inventory.label), beatport_track_id=COALESCE(excluded.beatport_track_id, inventory.beatport_track_id), beatport_url=COALESCE(excluded.beatport_url, inventory.beatport_url), updated_at=excluded.updated_at`. Use parameterized queries; `created_at` on INSERT only; on UPDATE keep existing created_at.
- **Library artists:** `SELECT DISTINCT artist FROM inventory WHERE TRIM(artist) != '' ORDER BY artist`.
- **Library labels:** `SELECT DISTINCT label FROM inventory WHERE label IS NOT NULL AND TRIM(label) != '' ORDER BY label`.
- **Has artist:** `SELECT 1 FROM inventory WHERE LOWER(TRIM(artist)) = LOWER(?) LIMIT 1` (or normalize artist in app and compare). Match exact normalized string; no fuzzy match in Phase 1.
- **Stats:** `SELECT COUNT(*) AS total, COUNT(CASE WHEN label IS NOT NULL AND TRIM(label) != '' THEN 1 END) AS with_label FROM inventory`.

---

## 4. Step-by-step implementation

### 4.1 Add `parse_collection` in rekordbox.py

**File:** `src/cuepoint/data/rekordbox.py`

- **Import:** add `from typing import Iterator` and dependency on `cuepoint.incrate.models.CollectionTrack` (or define a minimal `CollectionTrack` in rekordbox and have incrate import from there to avoid circular deps). Prefer: define `CollectionTrack` in `incrate/models.py` and have rekordbox return a simple tuple or dict so rekordbox does not depend on incrate; then `collection_parser.py` converts to `CollectionTrack`. So: rekordbox returns `Iterator[Tuple[str, str, str, str, Optional[str]]]` as (track_id, title, artist, remix_version, label), and collection_parser maps to `CollectionTrack`.
- **Function signature:** `def parse_collection(xml_path: str) -> Iterator[Tuple[str, str, str, str, Optional[str]]]:` yielding (track_id, title, artist, remix_version, label).
- **Steps inside parse_collection:**
  1. Same file-exists and size check as `parse_rekordbox` (MAX_XML_SIZE_BYTES).
  2. Parse XML: `ET.parse(xml_path)`, `root = tree.getroot()`.
  3. `collection = root.find(".//COLLECTION")`; if None, return (no yield).
  4. For each `t in collection.findall("TRACK")`:
     - `tid = (t.get("TrackID") or t.get("ID") or t.get("Key") or "").strip()`
     - If not tid, skip (log debug).
     - `title = (t.get("Name") or t.get("Title") or "").strip()`
     - If not title, skip (log debug).
     - `artist = (t.get("Artist") or t.get("Artists") or "").strip()`
     - `remix_raw = (t.get("Remixer") or "").strip()`. If empty, try to derive from title: call `extract_remixer_names_from_title(title)` from `cuepoint.core.mix_parser` or similar; if exists, join to string; else "".
     - `label = (t.get("Label") or "").strip() or None`
     - Yield (tid, title, artist, remix_raw or derived_remix, label).
  5. Do not read PLAYLISTS; do not build Playlist objects.
- **Tests:** unit test in `src/tests/unit/data/test_rekordbox.py` that parse_collection yields expected tuples from a minimal COLLECTION-only XML.

### 4.2 collection_parser.py

**File:** `src/cuepoint/incrate/collection_parser.py`

- **Function:** `def collection_tracks_from_xml(xml_path: str) -> Iterator[CollectionTrack]:`
  - Call `parse_collection(xml_path)` from `cuepoint.data.rekordbox`.
  - For each (track_id, title, artist, remix_version, label), build `CollectionTrack(track_id=..., title=..., artist=..., remix_version=..., label=...)` and yield.
- **Function:** `def track_key(record: CollectionTrack) -> str:` return `record.track_id` (Phase 1). Later: accept optional xml_path and return f"{xml_path}:{record.track_id}".
- **Function:** `def to_inventory_record(ct: CollectionTrack, now_iso: str) -> InventoryRecord:` set created_at and updated_at to now_iso; beatport_* None; track_key = track_key(ct).

### 4.3 inventory_db.py

**File:** `src/cuepoint/incrate/inventory_db.py`

- **init:** `def init_db(db_path: str) -> None:` open connection; execute schema (read schema.sql or inline DDL); create tables/indexes if not exist.
- **connect:** `def get_connection(db_path: str) -> sqlite3.Connection:` return connection (caller closes or use context manager). Use `check_same_thread=False` if used from Qt thread; or use a single connection per process and serialize access.
- **upsert:** `def upsert(cursor: sqlite3.Cursor, record: InventoryRecord) -> None:` execute the upsert SQL; use record’s fields; set updated_at to now on update.
- **upsert_batch:** `def upsert_batch(cursor: sqlite3.Cursor, records: List[InventoryRecord]) -> None:` loop upsert or use executemany with ON CONFLICT; ensure updated_at set.
- **get_library_artists:** `def get_library_artists(cursor: sqlite3.Cursor) -> List[str]:` execute the SELECT DISTINCT query; return list of strings.
- **get_library_labels:** `def get_library_labels(cursor: sqlite3.Cursor) -> List[str]:` same.
- **has_artist:** `def has_artist(cursor: sqlite3.Cursor, artist_name: str) -> bool:` execute SELECT 1 with LOWER(TRIM(artist)); return cursor.fetchone() is not None.
- **get_inventory_stats:** `def get_inventory_stats(cursor: sqlite3.Cursor) -> dict:` return `{"total": int, "with_label": int}`.

### 4.4 enrichment.py

**File:** `src/cuepoint/incrate/enrichment.py`

- **Dependencies:** needs access to inventory DB (cursor or service) and BeatportService (search_tracks, fetch_track_data) and matcher (best_beatport_match). Signature: `def enrich_labels_for_empty(db_path: str, beatport_service: IBeatportService, progress_callback: Optional[Callable[[int, int], None]] = None) -> int:` return number of rows updated.
- **Steps:**
  1. Open DB; SELECT rows where label IS NULL OR TRIM(label) = ''; get list of (id, track_key, artist, title).
  2. For each row: build search query = f"{artist} {title}" (or use query generator from inKey if available); call beatport_service.search_tracks(query, max_results=20); get URLs; call best_beatport_match with track (title, artist) and candidates; if match, call fetch_track_data(match_url); extract label and beatport_track_id/beatport_url from result; UPDATE inventory SET label=?, beatport_track_id=?, beatport_url=?, updated_at=? WHERE id=?.
  3. After each row (or every N rows), call progress_callback(current, total).
  4. Throttle: time.sleep(0.5) or configurable delay between Beatport calls to avoid rate limit.
  5. On exception (e.g. BeatportAPIError): log and continue with next row; do not fail entire run.
- **Query building and matching:** Use the same flow as inKey: `make_search_queries(title, artist)` and `best_beatport_match()` (same query variants, scoring, guards, and early exit). Implemented in `enrichment.enrich_labels_for_empty`; search/fetch happen inside the matcher via `data.beatport` (track_urls, parse_track_page).

### 4.5 InventoryService (facade)

**File:** `src/cuepoint/services/inventory_service.py`

- **Constructor:** `__init__(self, db_path: str, config_service: Optional[IConfigService] = None, beatport_service: Optional[IBeatportService] = None, logging_service: Optional[ILoggingService] = None)`. db_path from config or default. Hold refs for enrichment.
- **import_from_xml:** `def import_from_xml(self, xml_path: str, enrich: bool = True) -> dict:` returns `{"imported": int, "enriched": int, "errors": list}`.
  - init_db(db_path) if needed.
  - records = list(collection_tracks_from_xml(xml_path)); convert each to InventoryRecord with now_iso.
  - Open connection; upsert_batch(records); imported = len(records).
  - If enrich: enriched = enrich_labels_for_empty(db_path, self.beatport_service, progress_callback); else enriched = 0.
  - Return {"imported": imported, "enriched": enriched, "errors": []}. On exception append to errors and re-raise or return partial.
- **get_library_artists:** delegate to inventory_db.get_library_artists(conn.cursor()).
- **get_library_labels:** delegate.
- **has_artist:** delegate.
- **get_inventory_stats:** delegate.

### 4.6 Configuration

- **Key:** `incrate.inventory_db_path` (str). Default: `{app_data_dir}/incrate/inventory.sqlite`. App data dir: use platform (e.g. `%APPDATA%` on Windows, `~/Library/Application Support` on macOS) and app name "CuePoint"; subdir "incrate".
- **Key:** `incrate.enrich_on_first_import` (bool). Default True. If True, import_from_xml(..., enrich=True) runs enrichment for rows with empty label.
- **Key:** `incrate.enrichment_delay_seconds` (float). Default 0.5. Delay between Beatport calls during enrichment.

---

## 5. Dependencies and import order

- `rekordbox.py` must not import incrate (to avoid circular dependency). So parse_collection returns tuples; incrate.models defines CollectionTrack; collection_parser imports rekordbox and models.
- inventory_db imports sqlite3 (stdlib), models (InventoryRecord).
- enrichment imports inventory_db, services.interfaces (IBeatportService), core.matcher (best_beatport_match), data.beatport (parse_track_page or use service.fetch_track_data).
- inventory_service imports incrate.collection_parser, incrate.inventory_db, incrate.enrichment, services.interfaces, config for db_path.

---

## 6. Full testing design

### 6.1 Unit tests – Rekordbox parse_collection

**File:** `src/tests/unit/data/test_rekordbox.py` (add new test class)

| Test method | Description | Setup | Assertion |
|-------------|-------------|--------|-----------|
| `test_parse_collection_returns_iterator` | parse_collection(xml_path) returns iterator | Temp XML with COLLECTION, 2 TRACKs | next() yields 2 tuples; each has (track_id, title, artist, remix_version, label) |
| `test_parse_collection_reads_label_and_remixer` | TRACK has Label and Remixer attrs | XML: TRACK Label="Defected", Remixer="DJ X" | yielded tuple has label="Defected", remix_version="DJ X" |
| `test_parse_collection_skips_missing_track_id` | TRACK without TrackID skipped | XML: one TRACK with no TrackID | only one track yielded (the valid one) |
| `test_parse_collection_skips_missing_title` | TRACK without Name/Title skipped | XML: one TRACK with empty Name | skip; count 0 or other track yielded |
| `test_parse_collection_empty_collection` | COLLECTION empty | XML: COLLECTION with no TRACK | list(parse_collection(...)) == [] |
| `test_parse_collection_file_not_found` | Missing file raises | parse_collection("nonexistent.xml") | raises FileNotFoundError |
| `test_parse_collection_oversized_xml` | File > MAX_XML_SIZE raises | Mock os.path.getsize 101*1024*1024 | raises ValueError with "too large" |
| `test_parse_collection_remix_from_title_when_remixer_empty` | Remixer empty; title has " (Artist Remix)" | XML: Remixer="", Name="Song (Artist Remix)" | remix_version derived from title via mix_parser (or "" if not implemented in rekordbox) |

### 6.2 Unit tests – collection_parser

**File:** `src/tests/unit/incrate/test_collection_parser.py` (new file)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| `test_collection_tracks_from_xml_yields_collection_track` | One track in XML | one CollectionTrack; fields match XML |
| `test_track_key_is_track_id` | track_key(ct) | assert track_key(ct) == ct.track_id |
| `test_to_inventory_record_has_created_updated_at` | to_inventory_record(ct, "2025-02-26T12:00:00Z") | record.created_at == record.updated_at == that string |

### 6.3 Unit tests – inventory_db

**File:** `src/tests/unit/incrate/test_inventory_db.py` (new file)

| Test method | Description | Setup | Assertion |
|-------------|-------------|--------|-----------|
| `test_init_db_creates_tables` | init_db(temp_path) | temp_path new | tables "inventory" exist; idx_inventory_artist exist |
| `test_upsert_inserts_new_row` | upsert(cursor, record) | empty DB | one row; all fields match |
| `test_upsert_updates_existing_by_track_key` | upsert same track_key twice, different label | second has label="X" | one row; label "X"; updated_at changed |
| `test_get_library_artists_returns_distinct` | insert 3 tracks, 2 same artist | get_library_artists() | len == 2; sorted |
| `test_get_library_labels_excludes_empty` | insert label="" and label="Defected" | get_library_labels() | ["Defected"] only |
| `test_has_artist_true` | insert artist="Charlotte de Witte" | has_artist(cursor, "Charlotte de Witte") | True |
| `test_has_artist_false` | insert other artist | has_artist(cursor, "Unknown") | False |
| `test_has_artist_case_insensitive` | insert "Artist A" | has_artist(cursor, "artist a") | True (if using LOWER in SQL) |
| `test_get_inventory_stats` | insert 5 tracks, 3 with label | get_inventory_stats() | total=5, with_label=3 |

### 6.4 Unit tests – enrichment

**File:** `src/tests/unit/incrate/test_enrichment.py` (new file)

| Test method | Description | Mock | Assertion |
|-------------|-------------|------|-----------|
| `test_enrich_labels_for_empty_updates_row` | DB has 1 row label NULL; mock Beatport returns label "Defected" | mock beatport_service.search_tracks return [url]; fetch_track_data return {"label": "Defected", ...}; best_beatport_match return url | after enrich_labels_for_empty, SELECT label FROM inventory => "Defected" |
| `test_enrich_labels_for_empty_skips_row_with_label` | DB has 1 row label "Existing" | — | no call to beatport_service; label still "Existing" |
| `test_enrich_labels_for_empty_calls_progress_callback` | 2 rows to enrich | progress_callback = Mock() | progress_callback called with (1,2), (2,2) or similar |
| `test_enrich_labels_for_empty_continues_on_beatport_error` | first row raises BeatportAPIError | mock search_tracks side_effect [Exception, None] for second | second row still processed; one row updated |

### 6.5 Unit tests – InventoryService

**File:** `src/tests/unit/services/test_inventory_service.py` (new file)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| `test_import_from_xml_upserts_and_returns_count` | import_from_xml(temp_xml, enrich=False) | return imported >= 1; get_library_artists() non-empty |
| `test_import_from_xml_with_enrich_calls_enrichment` | enrich=True; mock beatport | enrich_labels_for_empty called or Beatport service called |
| `test_get_library_artists_after_import` | import then get_library_artists() | matches expected from XML |
| `test_get_inventory_stats_after_import` | import 3 tracks | total=3 |

### 6.6 Integration tests

**File:** `src/tests/integration/test_incrate_inventory.py` (new file)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| `test_import_real_xml_minimal_then_query` | Use fixture rekordbox/small.xml; import_from_xml(..., enrich=False) | get_library_artists() contains "Artist 1"; get_inventory_stats() total=10 |
| `test_import_twice_idempotent` | import same XML twice | total count unchanged; no duplicate track_key |
| `test_enrichment_integration_mock_beatport` | Real DB; mock BeatportService returning label | after enrich, one row has label set |

### 6.7 Fixtures

- **XML fixture:** Reuse `src/tests/fixtures/rekordbox/small.xml`; add optional fixture `incrate_collection_only.xml` with COLLECTION only (no PLAYLISTS) and TRACKs with Label and Remixer for unit tests.
- **Temp DB:** Each test that touches DB uses `tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)` or pytest tmp_path; remove after test.

### 6.8 Test layout summary

```
src/tests/
  unit/
    data/test_rekordbox.py          # add TestParseCollection class
    incrate/
      __init__.py
      test_collection_parser.py
      test_inventory_db.py
      test_enrichment.py
    services/test_inventory_service.py
  integration/
    test_incrate_inventory.py
  fixtures/
    rekordbox/
      incrate_collection_only.xml   # optional
```

### 6.9 Full test matrix (all cases)

| # | Test file | Test class | Test method | Input / fixture | Expected |
|---|-----------|------------|-------------|-----------------|----------|
| 1 | test_rekordbox | TestParseCollection | test_parse_collection_returns_iterator | small.xml | 2 items from iterator |
| 2 | test_rekordbox | TestParseCollection | test_parse_collection_reads_label_and_remixer | XML with Label, Remixer | label and remix in tuple |
| 3 | test_rekordbox | TestParseCollection | test_parse_collection_skips_missing_track_id | TRACK no TrackID | skip |
| 4 | test_rekordbox | TestParseCollection | test_parse_collection_skips_missing_title | TRACK no Name | skip |
| 5 | test_rekordbox | TestParseCollection | test_parse_collection_empty_collection | empty COLLECTION | [] |
| 6 | test_rekordbox | TestParseCollection | test_parse_collection_file_not_found | "x.xml" | FileNotFoundError |
| 7 | test_rekordbox | TestParseCollection | test_parse_collection_oversized_xml | mock size 101MB | ValueError |
| 8 | test_collection_parser | TestCollectionTracksFromXml | test_yields_collection_track | 1 TRACK XML | 1 CollectionTrack |
| 9 | test_collection_parser | TestTrackKey | test_track_key_is_track_id | CollectionTrack(track_id="1", ...) | "1" |
| 10 | test_collection_parser | TestToInventoryRecord | test_has_created_updated_at | now_iso | both set |
| 11 | test_inventory_db | TestInitDb | test_init_db_creates_tables | temp path | table exists |
| 12 | test_inventory_db | TestUpsert | test_upsert_inserts_new_row | 1 record | 1 row |
| 13 | test_inventory_db | TestUpsert | test_upsert_updates_existing | same track_key | updated |
| 14 | test_inventory_db | TestGetLibraryArtists | test_returns_distinct | 3 rows 2 artists | 2 strings |
| 15 | test_inventory_db | TestGetLibraryLabels | test_excludes_empty | mix empty/label | only non-empty |
| 16 | test_inventory_db | TestHasArtist | test_true | artist in DB | True |
| 17 | test_inventory_db | TestHasArtist | test_false | artist not in DB | False |
| 18 | test_inventory_db | TestHasArtist | test_case_insensitive | "Artist A" in DB | has_artist("artist a") True |
| 19 | test_inventory_db | TestGetInventoryStats | test_counts | 5 rows 3 labels | total=5 with_label=3 |
| 20 | test_enrichment | TestEnrichLabelsForEmpty | test_updates_row | 1 row null label, mock BP | label set |
| 21 | test_enrichment | TestEnrichLabelsForEmpty | test_skips_row_with_label | label present | no BP call |
| 22 | test_enrichment | TestEnrichLabelsForEmpty | test_progress_callback | 2 rows | callback (1,2),(2,2) |
| 23 | test_enrichment | TestEnrichLabelsForEmpty | test_continues_on_error | first raises | second still updated |
| 24 | test_inventory_service | TestInventoryServiceImport | test_import_returns_count | XML enrich=False | imported >= 1 |
| 25 | test_inventory_service | TestInventoryServiceImport | test_with_enrich_calls_enrichment | enrich=True mock | enrich called |
| 26 | test_inventory_service | TestInventoryServiceGetters | test_get_library_artists_after_import | import then get | non-empty |
| 27 | test_inventory_service | TestInventoryServiceGetters | test_get_inventory_stats | import 3 | total=3 |
| 28 | test_incrate_inventory (integration) | TestImportRealXml | test_minimal_then_query | small.xml | artists, stats |
| 29 | test_incrate_inventory | TestImportIdempotent | test_import_twice | same XML 2x | no duplicate |
| 30 | test_incrate_inventory | TestEnrichmentIntegration | test_mock_beatport | real DB mock BP | label set |

### 6.10 File-by-file implementation checklist (Phase 1)

| File | Function / item | Implemented | Test coverage |
|------|-----------------|-------------|---------------|
| rekordbox.py | parse_collection() | [ ] | TestParseCollection (8 tests) |
| incrate/models.py | CollectionTrack | [ ] | test_collection_parser |
| incrate/models.py | InventoryRecord | [ ] | test_inventory_db |
| incrate/schema.sql | CREATE TABLE, INDEXES | [ ] | test_init_db |
| incrate/inventory_db.py | init_db() | [ ] | test_init_db |
| incrate/inventory_db.py | get_connection() | [ ] | used in tests |
| incrate/inventory_db.py | upsert() | [ ] | test_upsert_* |
| incrate/inventory_db.py | upsert_batch() | [ ] | test_import |
| incrate/inventory_db.py | get_library_artists() | [ ] | test_get_library_* |
| incrate/inventory_db.py | get_library_labels() | [ ] | test_get_library_* |
| incrate/inventory_db.py | has_artist() | [ ] | test_has_artist_* |
| incrate/inventory_db.py | get_inventory_stats() | [ ] | test_get_inventory_stats |
| incrate/collection_parser.py | collection_tracks_from_xml() | [ ] | test_collection_parser |
| incrate/collection_parser.py | track_key() | [ ] | test_track_key |
| incrate/collection_parser.py | to_inventory_record() | [ ] | test_to_inventory_record |
| incrate/enrichment.py | enrich_labels_for_empty() | [ ] | test_enrichment_* |
| services/inventory_service.py | __init__() | [ ] | test_inventory_service |
| services/inventory_service.py | import_from_xml() | [ ] | test_import_* |
| services/inventory_service.py | get_library_artists() | [ ] | test getters |
| services/inventory_service.py | get_library_labels() | [ ] | test getters |
| services/inventory_service.py | has_artist() | [ ] | test getters |
| services/inventory_service.py | get_inventory_stats() | [ ] | test getters |

---

## 7. Edge cases and error handling

- **XML missing COLLECTION:** parse_collection yields nothing; import_from_xml returns imported=0.
- **XML malformed:** ET.ParseError propagates; catch in import_from_xml and return errors=["ParseError: ..."] or re-raise.
- **DB locked:** sqlite3.OperationalError; retry once or surface to user "Database busy".
- **Enrichment: Beatport rate limit (429):** respect retry/backoff from BeatportService; if still failing, log and continue with next track; do not abort.
- **Enrichment: no match found:** leave label NULL; do not overwrite with empty string.
- **Empty artist in XML:** allow; has_artist("") can return False; get_library_artists excludes "" if we add WHERE TRIM(artist) != ''.

---

## 8. Performance and limits

- **Batch size:** upsert_batch in chunks of 500 or 1000 to avoid huge transactions.
- **Enrichment:** delay 0.5s between calls; for 5000 tracks without label, ~40+ minutes; show progress in UI (Phase 5).
- **DB size:** SQLite handles 100k+ rows; indexes on artist and label keep get_library_* fast.

---

## 9. Completion criteria for Phase 1

- [ ] parse_collection in rekordbox.py implemented and tested.
- [ ] incrate/models.py, schema, inventory_db.py, collection_parser.py, enrichment.py, inventory_service.py implemented.
- [ ] Config keys incrate.inventory_db_path and incrate.enrich_on_first_import and incrate.enrichment_delay_seconds read from config.
- [ ] All unit tests above pass.
- [ ] Integration test import_real_xml_minimal_then_query passes.
- [ ] No circular imports; rekordbox does not import incrate.

---

## 10. Exact code and SQL reference

### 10.1 Upsert SQL (parameterized)

```sql
INSERT INTO inventory (track_key, track_id, artist, title, remix_version, label, beatport_track_id, beatport_url, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(track_key) DO UPDATE SET
  artist = excluded.artist,
  title = excluded.title,
  remix_version = excluded.remix_version,
  label = COALESCE(NULLIF(TRIM(excluded.label), ''), inventory.label),
  beatport_track_id = COALESCE(excluded.beatport_track_id, inventory.beatport_track_id),
  beatport_url = COALESCE(excluded.beatport_url, inventory.beatport_url),
  updated_at = excluded.updated_at;
```

- On INSERT use created_at = updated_at = now_iso. On conflict, do not update created_at (keep existing).

### 10.2 Python: init_db

```python
def init_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_DDL)  # SCHEMA_DDL from schema.sql or string
    finally:
        conn.close()
```

### 10.3 Python: has_artist (normalized)

```python
def has_artist(cursor: sqlite3.Cursor, artist_name: str) -> bool:
    n = (artist_name or "").strip().lower()
    if not n:
        return False
    cursor.execute(
        "SELECT 1 FROM inventory WHERE LOWER(TRIM(artist)) = ? LIMIT 1",
        (n,),
    )
    return cursor.fetchone() is not None
```

### 10.4 Enrichment loop (pseudocode)

```
rows = SELECT id, track_id, artist, title FROM inventory WHERE label IS NULL OR TRIM(label) = ''
for (i, row) in enumerate(rows):
    query = f"{row.artist} {row.title}"
    urls = beatport_service.search_tracks(query, max_results=20)
    best_url = best_beatport_match(track=(row.title, row.artist), candidate_urls=urls)
    if best_url:
        data = beatport_service.fetch_track_data(best_url)
        if data and data.get("label"):
            UPDATE inventory SET label=?, beatport_track_id=?, beatport_url=?, updated_at=? WHERE id=?
    if progress_callback:
        progress_callback(i + 1, len(rows))
    time.sleep(enrichment_delay_seconds)
```

### 10.5 Config default for db_path

- Windows: `os.environ.get("APPDATA", os.path.expanduser("~")) / "CuePoint" / "incrate" / "inventory.sqlite"`
- macOS: `~/Library/Application Support/CuePoint/incrate/inventory.sqlite`
- Linux: `os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share")) / "CuePoint" / "incrate" / "inventory.sqlite"` or `~/.cuepoint/incrate/inventory.sqlite`

Create parent directories on first init_db if not exist.

---

## 11. Additional unit test cases (exhaustive)

- **test_parse_collection_alternative_attributes:** XML uses Key instead of TrackID, Artists instead of Artist → still yields.
- **test_upsert_preserves_created_at_on_update:** insert record; update same track_key with new title; SELECT created_at unchanged.
- **test_get_library_labels_none:** all rows label NULL → empty list.
- **test_has_artist_whitespace:** artist in DB "  Artist  "; has_artist("Artist") → True (after TRIM in SQL).
- **test_enrichment_delay_called:** mock time.sleep; verify sleep(0.5) or config value called between iterations.
- **test_inventory_service_import_from_xml_file_not_found:** import_from_xml("nonexistent.xml") raises or returns errors with FileNotFound.
- **test_inventory_service_get_inventory_stats_empty_db:** before any import, get_inventory_stats() returns total=0, with_label=0.

---

## 12. Next phase

Phase 2: [incrate-02-beatport-api.md](incrate-02-beatport-api.md) — Beatport API client for charts, labels, releases. Inventory (Phase 1) is consumed by Phase 3 (Discovery) via get_library_artists() and get_library_labels().

---

## Appendix A: Line-by-line implementation checklist (Phase 1)

Implement in this order to avoid circular imports and to allow incremental testing.

1. **incrate/models.py:** Define CollectionTrack (track_id, title, artist, remix_version, label). Define InventoryRecord (track_key, track_id, artist, title, remix_version, label, beatport_track_id, beatport_url, created_at, updated_at). Add docstrings.
2. **incrate/schema.sql:** Write full DDL (CREATE TABLE inventory, CREATE INDEX x3). No code yet.
3. **data/rekordbox.py:** Add parse_collection(xml_path) -> Iterator[Tuple[...]]. Use same file/size checks as parse_rekordbox. Loop COLLECTION/TRACK; read TrackID, Name, Artist, Label, Remixer; if Remixer empty try mix_parser; yield (tid, title, artist, remix_version, label). Write unit tests in test_rekordbox.py.
4. **incrate/collection_parser.py:** Import parse_collection from rekordbox; define collection_tracks_from_xml -> Iterator[CollectionTrack]; define track_key(ct) = ct.track_id; define to_inventory_record(ct, now_iso) -> InventoryRecord. Write unit tests.
5. **incrate/inventory_db.py:** init_db(db_path): connect, executescript(schema). get_connection(db_path). upsert(cursor, record): execute INSERT...ON CONFLICT. upsert_batch(cursor, records): for r in records: upsert(cursor, r). get_library_artists(cursor). get_library_labels(cursor). has_artist(cursor, name). get_inventory_stats(cursor). Write unit tests with temp DB.
6. **incrate/enrichment.py:** enrich_labels_for_empty(db_path, beatport_service, progress_callback). SELECT id, track_id, artist, title WHERE label IS NULL OR TRIM(label)=''. For each: query = artist + " " + title; urls = beatport_service.search_tracks(query); best_url = best_beatport_match(...); data = beatport_service.fetch_track_data(best_url); UPDATE inventory SET label=?, beatport_track_id=?, beatport_url=?, updated_at=? WHERE id=?; progress_callback(i+1, total); time.sleep(delay). Write unit tests with mock beatport_service.
7. **services/inventory_service.py:** __init__(db_path, config_service, beatport_service, logging_service). import_from_xml(xml_path, enrich=True): init_db; records = list(collection_tracks_from_xml); upsert_batch; if enrich: enrich_labels_for_empty; return {imported, enriched, errors}. get_library_artists, get_library_labels, has_artist, get_inventory_stats delegate to inventory_db. Write unit tests.
8. **Config:** Add incrate.inventory_db_path (default app_data/incrate/inventory.sqlite), incrate.enrich_on_first_import (True), incrate.enrichment_delay_seconds (0.5). Read in inventory_service from config_service.

---

## Appendix B: Full test case specifications (Phase 1)

Each test must be independent (fresh temp DB or fresh parse). Use pytest fixtures for temp_path and sample XML.

- **test_parse_collection_returns_iterator:** Create temp XML with 2 TRACKs in COLLECTION. Call parse_collection(path). Assert next(it) and next(it) return tuples; assert StopIteration or list has len 2.
- **test_parse_collection_reads_label_and_remixer:** XML TRACK has Label="X", Remixer="Y". Assert yielded tuple has label "X", remix_version "Y".
- **test_upsert_inserts_new_row:** init_db(temp_path); conn = get_connection(temp_path); cursor = conn.cursor(); record = InventoryRecord(track_key="1", track_id="1", artist="A", title="T", remix_version="", label=None, beatport_track_id=None, beatport_url=None, created_at=now, updated_at=now); upsert(cursor, record); conn.commit(); cursor.execute("SELECT * FROM inventory"); assert cursor.fetchone() is not None; assert row[3]=="A".
- **test_upsert_updates_existing_by_track_key:** Insert record with track_key="1" label=None; upsert second record same track_key label="Defected"; assert one row; label "Defected"; updated_at changed.
- **test_get_library_artists_returns_distinct:** Insert 3 rows artists "A", "A", "B"; assert get_library_artists returns ["A", "B"] or ["B", "A"] (sorted).
- **test_has_artist_case_insensitive:** Insert artist="Charlotte de Witte"; assert has_artist(cursor, "charlotte de witte") is True.
- **test_enrich_labels_for_empty_updates_row:** Mock beatport_service.search_tracks return ["https://beatport.com/track/x/1"]; fetch_track_data return {"label": "Defected"}; best_beatport_match return url. Insert 1 row label NULL. Call enrich_labels_for_empty. Assert SELECT label FROM inventory = "Defected".
- **test_import_from_xml_upserts_and_returns_count:** Temp XML with 1 TRACK. inventory_service.import_from_xml(path, enrich=False). Assert return imported=1; get_library_artists() has one artist.

---

## Appendix C: Error and edge case matrix (Phase 1)

| Scenario | Handling |
|----------|----------|
| XML missing COLLECTION | parse_collection yields nothing; import returns imported=0 |
| XML malformed | ET.ParseError; catch in import_from_xml or let propagate |
| TRACK missing TrackID | Skip; log debug |
| TRACK missing Name | Skip; log debug |
| DB file read-only | sqlite3.OperationalError; surface to user |
| Enrichment: Beatport 429 | Retry via BeatportService; if still fail, log and continue next track |
| Enrichment: no match | Leave label NULL |
| Empty artist in XML | Allow; get_library_artists excludes "" with WHERE TRIM(artist)!='' |
| Reimport same XML | Upsert updates existing rows by track_key; no duplicate rows |

---

## Appendix D: Dependency graph (Phase 1)

```
rekordbox.parse_collection  (no deps on incrate)
       |
       v
collection_parser.collection_tracks_from_xml  ->  to_inventory_record
       |
       v
inventory_db.init_db, upsert_batch, get_library_*
       ^
       |
inventory_service.import_from_xml  ->  enrichment.enrich_labels_for_empty
       |                                    |
       |                                    +-> beatport_service.search_tracks, fetch_track_data
       |                                    +-> matcher.best_beatport_match
       v
Phase 3 (discovery) uses get_library_artists(), get_library_labels()
```

---

## Appendix E: Exact function signatures (Phase 1)

**rekordbox.py**
```python
def parse_collection(xml_path: str) -> Iterator[Tuple[str, str, str, str, Optional[str]]]:
    """Yield (track_id, title, artist, remix_version, label) for each TRACK in COLLECTION."""
```

**incrate/models.py**
```python
@dataclass
class CollectionTrack:
    track_id: str
    title: str
    artist: str
    remix_version: str
    label: Optional[str] = None

@dataclass
class InventoryRecord:
    track_key: str
    track_id: str
    artist: str
    title: str
    remix_version: str
    label: Optional[str]
    beatport_track_id: Optional[str] = None
    beatport_url: Optional[str] = None
    created_at: str
    updated_at: str
```

**incrate/collection_parser.py**
```python
def collection_tracks_from_xml(xml_path: str) -> Iterator[CollectionTrack]: ...
def track_key(record: CollectionTrack) -> str: ...
def to_inventory_record(ct: CollectionTrack, now_iso: str) -> InventoryRecord: ...
```

**incrate/inventory_db.py**
```python
def init_db(db_path: str) -> None: ...
def get_connection(db_path: str) -> sqlite3.Connection: ...
def upsert(cursor: sqlite3.Cursor, record: InventoryRecord) -> None: ...
def upsert_batch(cursor: sqlite3.Cursor, records: List[InventoryRecord]) -> None: ...
def get_library_artists(cursor: sqlite3.Cursor) -> List[str]: ...
def get_library_labels(cursor: sqlite3.Cursor) -> List[str]: ...
def has_artist(cursor: sqlite3.Cursor, artist_name: str) -> bool: ...
def get_inventory_stats(cursor: sqlite3.Cursor) -> Dict[str, int]: ...
```

**incrate/enrichment.py**
```python
def enrich_labels_for_empty(
    db_path: str,
    beatport_service: IBeatportService,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> int: ...
```

**services/inventory_service.py**
```python
def import_from_xml(self, xml_path: str, enrich: bool = True) -> Dict[str, Any]: ...
def get_library_artists(self) -> List[str]: ...
def get_library_labels(self) -> List[str]: ...
def has_artist(self, name: str) -> bool: ...
def get_inventory_stats(self) -> Dict[str, int]: ...
```

---

## Appendix F: Test file layout and pytest markers (Phase 1)

**Unit tests**
- `tests/unit/data/test_rekordbox.py`: class TestParseCollection; markers: none.
- `tests/unit/incrate/test_collection_parser.py`: class TestCollectionTracksFromXml, TestTrackKey, TestToInventoryRecord.
- `tests/unit/incrate/test_inventory_db.py`: class TestInitDb, TestUpsert, TestGetLibraryArtists, TestGetLibraryLabels, TestHasArtist, TestGetInventoryStats; use @pytest.fixture tmp_path for DB.
- `tests/unit/incrate/test_enrichment.py`: class TestEnrichLabelsForEmpty; mock IBeatportService.
- `tests/unit/services/test_inventory_service.py`: class TestInventoryServiceImport, TestInventoryServiceGetters.

**Integration tests**
- `tests/integration/test_incrate_inventory.py`: class TestImportRealXml, TestImportIdempotent, TestEnrichmentIntegration; use fixtures.rekordbox.small.xml; marker @pytest.mark.integration.

**Run**
- Unit only: `pytest tests/unit/data/test_rekordbox.py tests/unit/incrate/ tests/unit/services/test_inventory_service.py -v`
- Integration: `pytest tests/integration/test_incrate_inventory.py -v`
