# inCrate Specification

**Status:** Finalized (ready for implementation)  
**Last updated:** 2025-02

---

## Goal

inCrate is an internal CuePoint app for music digging:

1. Build an **inventory** from your Rekordbox collection (artist, title, remix/version, label).
2. Discover **Beatport genre charts** (past month) from artists in your library and add **whole charts** to a Beatport playlist.
3. Discover **new releases** (last 30 days) from labels in your library and add them to the same playlist.
4. Use a **new Beatport playlist per run** (e.g. `feb26` for February 26).

---

## Decided Requirements

### 1. Inventory (Rekordbox → index)

| Decision | Choice |
|----------|--------|
| **Storage** | SQLite (queryable for “artists in library”, “labels in library”) |
| **Scope** | Full COLLECTION (every track in Rekordbox XML) |
| **Label enrichment** | Once on first import: run Beatport match for tracks missing label and store result |

**Implementation notes:**

- Parse full COLLECTION; read `Name`, `Artist`, `Label`, `Remixer` (and remix/version from title if needed).
- Persist inventory in SQLite; key by track identity (e.g. TrackID + path/hash) for reimport/refresh.
- On first import, for each track with empty label: use existing inKey flow (search → best_beatport_match → fetch_track_data) and store label (and optionally Beatport track ID/URL).

### 2. Charts (genre charts from library artists)

| Decision | Choice |
|----------|--------|
| **Meaning** | **A:** Charts **published in the past month** where the **chart author** is one of your library artists |
| **Genres** | User-configurable (e.g. from Beatport’s genre list or a configurable list) |
| **What to add** | The **whole chart** (all tracks in that chart) to the playlist |

**Implementation notes:**

- Need Beatport API or scraping: list charts by genre, filter by chart date (past month) and chart author ∈ library artists.
- For each matching chart, add all tracks in that chart to the target playlist.

### 3. New releases from labels

| Decision | Choice |
|----------|--------|
| **“New”** | Last **30 days** |

**Implementation notes:**

- For each label in the inventory, fetch releases/tracks from Beatport with release date in last 30 days; add to playlist.

### 4. Beatport playlist

| Decision | Choice |
|----------|--------|
| **Target** | Different playlist per run; name pattern e.g. `feb26` for February 26 (date-based or user prompt). |

**Implementation notes:**

- Create or select a playlist per run (name derived from date or user input).
- Need auth + playlist create/write (API or browser).

### 5. Auth (Q9 – recommendation)

- **Recommendation:** Prefer **Beatport API token** (or OAuth) stored in CuePoint config or env vars for all **read** operations (charts, label releases, search, track data). If the official API supports “create playlist” and “add tracks to playlist”, use the same token. If it does not, use **browser automation** with stored Beatport credentials (username/password in config or keychain) only for the “add to playlist” step. Avoid storing plain passwords in repo; use app config or env.

### 6. Architecture (Q10 – recommendation)

- **Recommendation:** **Option A + browser fallback.** Extend CuePoint with a **Beatport API client** (OAuth/token) for charts, label releases, and catalog. Reuse existing BeatportService + matcher for inventory label enrichment (search + parse). For **“add to playlist”**: if Beatport API supports it, use the API; otherwise use **browser automation** (existing or new provider) to log in and add tracks. Prefer API-first to minimize scraping and UI fragility.

---

## Summary: What to Build

1. **Inventory**
   - Collection parser (full COLLECTION; artist, title, remix/version, label from XML).
   - SQLite schema and persistence; optional “enrich label on first import” using existing inKey matcher + Beatport fetch.

2. **Charts**
   - User-configurable genres.
   - Fetch genre charts from Beatport (API or scrape) for “past month”.
   - Filter charts by: chart author in library artists.
   - Add whole chart (all tracks) to run playlist.

3. **New releases**
   - For each label in inventory, fetch new releases (last 30 days) from Beatport; add to run playlist.

4. **Playlist**
   - Per-run playlist name (e.g. date-based like `feb26`).
   - Create playlist and add discovered tracks (API or browser).

5. **Auth**
   - API token (or OAuth) in config/env for Beatport API.
   - Optional browser credentials for playlist add if API cannot do it.

6. **UI**
   - inCrate entry on tool selection page; flow: Import XML → build/enrich inventory → Discover (charts + new releases) → Review → Add to Beatport playlist (run-specific name).

---

## References

- Rekordbox parser: `src/cuepoint/data/rekordbox.py`
- Beatport search/fetch: `src/cuepoint/services/beatport_service.py`, `src/cuepoint/core/matcher.py`, `src/cuepoint/data/beatport.py`
- Tool selection: `src/cuepoint/ui/widgets/tool_selection_page.py`
- Beatport API / MCP: [ivo-toby/beatport-mcp-server](https://github.com/ivo-toby/beatport-mcp-server), [larsenweigle/beatport-mcp](https://github.com/larsenweigle/beatport-mcp)
