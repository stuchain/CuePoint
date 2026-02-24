# Beatport API v4 – Consolidated Reference

This document pulls together all Beatport API v4 information used by CuePoint’s inCrate feature. The **official interactive docs** are at **[https://api.beatport.com/v4/docs/](https://api.beatport.com/v4/docs/)** but they are **behind login**: only the shell (“API Docs”, “Login with Beatport”) is visible without authenticating. The content below is derived from our implementation, token docs, and design specs.

---

## 1. Official docs and how to get the full spec

- **Docs URL:** [https://api.beatport.com/v4/docs/](https://api.beatport.com/v4/docs/)
- **OpenAPI spec URL (requires auth):** `https://api.beatport.com/v4/swagger-ui/json/` — the docs SPA fetches this; with a logged-in session you can save it.
- **Status:** Login required. A simple HTTP GET returns only the portal shell, not the full API reference or OpenAPI spec.
- **Local export:** After logging in and saving browser state with `scripts/save_beatport_docs_state.py`, run `scripts/download_beatport_docs.py` to download the main docs HTML and the OpenAPI spec. Output is in `docs/feature/beatport-docs-export/` (including `beatport-openapi.json`).
- **To download manually:** Open the docs in a browser, log in, DevTools → Network → find the request to `/v4/swagger-ui/json/` → copy/save the response as JSON.

---

## 2. Base URL and configuration

| Item | Value |
|------|--------|
| **Base URL** | `https://api.beatport.com/v4` |
| **Config key (base)** | `incrate.beatport_api_base_url` (default: `https://api.beatport.com/v4`) |
| **Config key (token)** | `incrate.beatport_access_token` (no default) |
| **Env override** | `BEATPORT_ACCESS_TOKEN` overrides config token |
| **Timeout** | `incrate.beatport_api_timeout` (default: 30 seconds) |

---

## 3. Authentication

- **Type:** OAuth2, Bearer token.
- **Header:** `Authorization: Bearer <access_token>`
- **Content-Type:** `application/json` (for requests that send a body).

**Getting a token:** See [beatport-api-token.md](beatport-api-token.md) for:
- Requesting API access (client ID/secret)
- Authorization Code, User Password, and Client Credentials flows
- Token response (`access_token`, `refresh_token`, `expires_in`, `token_type`)
- Refresh and revoke endpoints

**Relevant auth endpoints:**

| Purpose | Method | URL |
|--------|--------|-----|
| Authorize (code flow) | GET | `https://api.beatport.com/v4/auth/o/authorize/?client_id=<ID>&response_type=code&redirect_uri=<URI>` |
| Token (exchange/refresh) | POST (form) | `https://api.beatport.com/v4/auth/o/token/` |
| Introspect | GET | `https://api.beatport.com/v4/auth/o/introspect/` (with Bearer) |
| Revoke | POST | `https://api.beatport.com/v4/auth/o/revoke/?client_id=<ID>&token=<ACCESS_TOKEN>` |

---

## 4. Catalog endpoints (used by inCrate)

All catalog requests use **GET** with **Bearer** token. Paths are relative to base `https://api.beatport.com/v4`.

### 4.1 Genres

| Endpoint | Purpose | Params |
|----------|---------|--------|
| `GET /catalog/genres` or `GET /genres` | List genres | — |

**Response handling (in code):** Top-level can be a list or object with `results` / `data` / `genres` / `items`. Each item: `id`, `name`, `slug`.

### 4.2 Charts

| Endpoint | Purpose | Params |
|----------|---------|--------|
| `GET /catalog/charts` or `GET /charts` | List charts by genre and date | `genre_id`, `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `limit` |
| `GET /catalog/charts/{chart_id}` or `GET /charts/{chart_id}` | Chart detail with tracks | — |

**Alternative param names (fallback in code):** `genre`, `published_after`, `published_before` for date range.

**Response handling:** List endpoint may return `results` / `data` / `charts` / list. Chart object: `id`, `name`, `genre_id`, `genre_slug`, `author` (or `user`/`creator`) with `id`/`name`, `published_date` (or `published`), `track_count` (or `tracks_count`). Detail: same plus `tracks` array; each track: `id`/`track_id`, `title`, `artists`/`performers` (list or string), `url`/`beatport_url`, `position`.

### 4.3 Labels and releases

| Endpoint | Purpose | Params |
|----------|---------|--------|
| `GET /catalog/labels` or `GET /labels` | Search labels by name | `q` |
| `GET /catalog/labels/{label_id}/releases` or `GET /labels/{label_id}/releases` | Releases for label in date range | `from`, `to` (YYYY-MM-DD) |
| `GET /catalog/labels/{label_id}/tracks` or `GET /labels/{label_id}/tracks` | Tracks for label (fallback when releases have no tracks) | `from`, `to` |

**Response handling:** Labels: `labels` / `results` / `data` / list; items have `id`. Releases: `releases` / `results` / `data` / list; each release: `id`/`release_id`, `title`/`name`, `release_date`/`date`, and optionally `tracks`/`track_list`/`releases`. Tracks endpoint: list or object with `results`/`data`/`tracks`/`items`.

---

## 5. Normalized models (CuePoint)

From `src/cuepoint/incrate/beatport_api_models.py` and parsing in `beatport_api.py`:

- **Genre:** `id`, `name`, `slug`
- **ChartSummary:** `id`, `name`, `genre_id`, `genre_slug`, `author_id`, `author_name`, `published_date`, `track_count`
- **ChartTrack:** `track_id`, `title`, `artists` (string), `beatport_url`, `position`
- **ChartDetail:** `id`, `name`, `author_name`, `published_date`, `tracks` (list of ChartTrack)
- **LabelReleaseTrack:** `track_id`, `title`, `artists`, `beatport_url`, `release_date`
- **LabelRelease:** `release_id`, `title`, `release_date`, `tracks` (list of LabelReleaseTrack)
- **DiscoveredTrack:** `beatport_track_id`, `beatport_url`, `title`, `artists`, `source_type`, `source_name`

API field names may differ (e.g. `performers` vs `artists`); parsing in `beatport_api.py` normalizes them.

---

## 6. Error handling

| HTTP | Behavior in CuePoint |
|------|------------------------|
| **401** | Raise `BeatportAPIError` “Invalid or expired Beatport API token”; do not retry |
| **403** | Raise “Beatport API access forbidden” |
| **404** | Return `None` or `[]` (no exception for missing chart/release/label) |
| **429** | Raise “Rate limited; try again later”; retries use `run_with_retry` (e.g. 2 retries for 5xx/429) |
| **5xx** | Retry up to 2× then raise |
| **No token** | Raise “Configure Beatport API token (incrate.beatport_access_token or BEATPORT_ACCESS_TOKEN)” |
| **Timeout** | Raise “Request timed out” |
| **Malformed JSON** | Raise “Invalid API response” |

---

## 7. Caching (in CuePoint)

- **Genres:** key `beatport_api:genres`, TTL 24h
- **Charts list:** `beatport_api:charts:{genre_id}:{from_date}:{to_date}`, TTL 1h
- **Chart detail:** `beatport_api:chart:{chart_id}`, TTL 1h
- **Label releases:** `beatport_api:label_releases:{label_id}:{from_date}:{to_date}`, TTL 1h
- **Label search:** `beatport_api:label_search:{normalized_name}`, TTL 1h

---

## 8. References in repo

- **Token and auth:** [beatport-api-token.md](beatport-api-token.md)
- **Implementation design:** [incrate-02-beatport-api.md](incrate-02-beatport-api.md)
- **Code:** `src/cuepoint/services/beatport_api_client.py`, `src/cuepoint/services/beatport_api.py`, `src/cuepoint/incrate/beatport_api_models.py`
- **Diagnostic script:** `scripts/diagnose_beatport_api.py` (raw API responses for debugging)

---

*This file consolidates Beatport API v4 info for CuePoint. For the full interactive docs and exact schemas, use the official portal after login and, if possible, save the OpenAPI spec as described in §1.*
