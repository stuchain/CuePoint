# How the Beatport API Works

This document is the full description of the Beatport API v4, extracted from the OpenAPI spec in this folder (`beatport-openapi.json`) and from Beatport’s Introduction text. It explains base URL, authentication (including OAuth2 flows and error codes), conventions, every section of the API, and all endpoints so you can understand and use the API in one place.

*(The HTML files in this export are static shells with no embedded API content; the spec in the JSON and the Introduction are the sources.)*

---

## 1. Base URL and version

- **Base URL:** `https://api.beatport.com` (all paths live under `/v4/`).
- **Example:** `GET https://api.beatport.com/v4/catalog/genres/`.
- **API version:** v4.
- **Terms:** [Beatport API Terms](https://support.beatport.com/hc/en-us/articles/4414997837716-Terms-and-Conditions#api).
- **Contact:** engineering@beatport.com.

---

## 2. Authentication

Every request must be authenticated. The API supports:

| Method | Description |
|--------|-------------|
| **OAuth2** | Recommended. See below for full flows. |
| **Cookie** | Session cookie named `sessionid` (e.g. after logging into the developer portal). |
| **HTTP Basic** | Username/password in the `Authorization` header. |

**OAuth2 scopes** (examples): `app:prostore`, `app:store`, `app:external`, `user:dj`, `catalog:read`, `catalog:write`, `curation:read`, `curation:write`, plus many app- and staff-specific scopes. The full list is in `beatport-openapi.json` under `components.securitySchemes.oauth2.flows`.

**Prerequisites:** Never publicly share your client secret. JavaScript apps with no server backend can use the browser redirect flow (Authorization Code). Server-side apps can use the secret-based flows (Password or Client Credentials). Examples below use HTTPie (`-f` for form-encoded body).

### 2.1 Obtaining an access token

**Authorization Code Grant (browser redirect)**

1. Send the user to:
   ```text
   https://api.beatport.com/v4/auth/o/authorize/?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<REDIRECT_URI>
   ```
   The redirect URI must be one configured for your OAuth application and must accept a `code` URL parameter.
2. After the user authorizes, Beatport redirects to your URI with `?code=...`. Exchange that code for a token (form-encoded POST):
   - URL: `https://api.beatport.com/v4/auth/o/token/`
   - Body: `client_id`, `code`, `grant_type=authorization_code`, `redirect_uri` (e.g. `https://api.beatport.com/v4/auth/o/post-message`).

**User Password Grant**

- URL: `https://api.beatport.com/v4/auth/o/token/`
- Body (form-encoded): `client_id`, `client_secret`, `username`, `password`, `grant_type=password`.

**Client Credentials Grant**

- URL: `https://api.beatport.com/v4/auth/o/token/`
- Body (form-encoded): `client_id`, `client_secret`, `grant_type=client_credentials`.

**Token response** (all flows): JSON with `access_token`, `refresh_token`, `expires_in`, `scope`, `token_type` (e.g. `"Bearer"`).

### 2.2 Using the access token

Send the token on every request:

```text
Authorization: Bearer <access_token>
```

**Introspect current user:** `GET https://api.beatport.com/v4/auth/o/introspect/` with the `Authorization: Bearer ...` header.

### 2.3 Refreshing the token

- URL: `https://api.beatport.com/v4/auth/o/token/`
- Method: POST, form-encoded.
- Body: `client_id`, `refresh_token`, `grant_type=refresh_token`. Optional: send `Authorization: Bearer <access_token>`.

### 2.4 Revoking the token

- URL: `https://api.beatport.com/v4/auth/o/revoke/?client_id=<CLIENT_ID>&token=<ACCESS_TOKEN>`
- Method: POST.

See also the project’s [Beatport API token doc](../beatport-api-token.md) for step-by-step flows.

---

## 2b. Error codes

Errors are returned in JSON. The API aims for consistent behavior across endpoints.

| Situation | HTTP | Response body (example) |
|-----------|------|-------------------------|
| **GET by ID** — ID does not exist | 404 Not Found | `{"detail": "Not found."}` |
| **GET by ID** — user does not have access to the resource | 404 Not Found | `{"detail": "Not found."}` |
| **GET list** — invalid filter value (e.g. string for `id`, or invalid choice for boolean/enum) | 400 Bad Request | Field-level errors, e.g. `{"id": ["Enter a number."]}` or `{"<query>": ["Select a valid choice. <value> is not one of the available choices."]}` |
| **DELETE** — ID does not exist | 404 Not Found | `{"detail": "Not found."}` |
| **DELETE** — user not permitted to delete | 403 Forbidden | `{"detail": "You do not have permission to perform this action."}` |
| **PATCH** — missing required fields or invalid data | 400 Bad Request | Field errors, e.g. `{"name": ["This field is required."]}` |
| **PATCH** — empty body (missing required fields) | 400 Bad Request | Same as above. |
| **POST** — invalid or missing required fields | 400 Bad Request | e.g. `{"track_id": ["This field may not be blank."]}` or `["This field may not be null."]` |

Examples of invalid requests that yield 400: filtering by `id` with a non-numeric value (e.g. `/v4/catalog/artists/?id=kh`), or using a value other than `true`/`false` on a boolean filter (e.g. `enabled=hfgd`).

---

## 3. Conventions used across the API

### 3.1 Pagination

List endpoints are paginated:

- **page** (query, integer): Page number (1-based).
- **per_page** (query, integer): Number of results per page.

Responses typically include fields like `count`, `next`, `previous`, and `results` (or similar; see schemas in the OpenAPI file).

### 3.2 Date filters (slice syntax)

Many query parameters accept dates in a “slice” form (e.g. `add_date`, `publish_date`, `created`, `updated`, `encoded_date`):

| Value | Meaning |
|-------|---------|
| `1970-01-01` | Exact date |
| `:1971-01-01` | Less than or equal |
| `1970-01-01:` | Greater than or equal |
| `1970-01-01:1971-01-01` | Range (inclusive) |

Use ISO date or date-time format as required by the parameter.

### 3.3 OR lookups (multiple values)

Many filters accept multiple values for OR matching. Pass them comma-separated:

- `genre_id=1,2`
- `id=10,20,30`

The spec uses `explode: false`, `style: form` for these.

### 3.4 Path IDs

Path parameters like `{id}`, `{release_pk}`, `{num}` use numeric strings (`pattern: ^[0-9]+$`). Examples: `GET /v4/catalog/charts/881292/`, `GET /v4/catalog/genres/5/top/10/`.

### 3.5 Facets endpoints

Many resources have a **facets** endpoint (e.g. `/v4/catalog/charts/facets/`). It returns the list of filters (facets) available for that resource, with help text. If there are no filters, the response is empty.

### 3.6 “Top N” endpoints

Endpoints like `/v4/catalog/genres/{id}/top/{num}/` return the top N items by popularity. **num** is between 1 and 100. Some support an optional query **type=release** to return top releases instead of tracks (e.g. genres, labels, artists).

### 3.7 Key filter (key_name)

Where **key_name** is supported (e.g. tracks, playlist tracks), use sharp as `#`, flat as `b`, with minor/major separated by a space. Supported values (OR lookup): "A Minor", "A Major", "Ab Minor", "Ab Major", "A# Minor", "A# Major", "B Minor", "B Major", "Bb Minor", "Bb Major", "C Minor", "C Major", "C# Minor", "C# Major", "D Minor", "D Major", "Db Minor", "Db Major", "D# Minor", "D# Major", "E Minor", "E Major", "Eb Minor", "Eb Major", "F Minor", "F Major", "F# Minor", "F# Major", "G Minor", "G Major", "Gb Minor", "Gb Major", "G# Minor", "G# Major".

---

## 4. Catalog API (read-only)

The **catalog** is the main read-only API for music metadata: genres, artists, labels, releases, tracks, charts, playlists, and search. All catalog paths are under `/v4/catalog/`.

### 4.1 Genres

- **List genres:** `GET /v4/catalog/genres/`  
  Query: `enabled` (boolean), `name` (exact match), `order_by` (`id`, `-id`, `status`, `-status`), `page`, `per_page`.
- **Single genre:** `GET /v4/catalog/genres/{id}/`.
- **Sub-genres of a genre:** `GET /v4/catalog/genres/{id}/sub-genres/`.
- **Top N tracks (or releases):** `GET /v4/catalog/genres/{id}/top/{num}/`. Optional: `type=release`.
- **Tracks in a genre:** `GET /v4/catalog/genres/{id}/tracks/`.
- **Facets:** `GET /v4/catalog/genres/facets/`.

### 4.2 Charts

Charts are DJ charts (curated track lists). Chart **detail** does not always include the track list; use the **tracks** sub-resource to get the list of tracks.

- **List charts:** `GET /v4/catalog/charts/`  
  Main query parameters:
  - **genre_id**, **genre_name**, **sub_genre_id**, **sub_genre_name** — filter by genre (OR for arrays).
  - **publish_date**, **add_date**, **updated** — date filters (slice syntax).
  - **dj_id**, **dj_name**, **dj_slug**, **user_id**, **username** — filter by chart author/DJ.
  - **id** — exact chart ID(s) (OR).
  - **name** — case-insensitive name containment (OR).
  - **track_id** — filter by track (OR).
  - **enabled**, **is_approved**, **is_indexed**, **is_published** — booleans.
  - **is_curated_playlist**, **curated_playlist_genre_id** — curated playlist filters.
  - **page**, **per_page**.
- **Chart detail:** `GET /v4/catalog/charts/{id}/`.
- **Chart images:** `GET /v4/catalog/charts/{id}/images/`.
- **Chart tracks (full list):** `GET /v4/catalog/charts/{id}/tracks/` — “Return this chart's tracks, updating if necessary.”
- **Chart track IDs only:** `GET /v4/catalog/charts/{id}/tracks/ids/`.
- **Facets:** `GET /v4/catalog/charts/facets/`.
- **Genre overview for charts:** `GET /v4/catalog/charts/genre-overview/`.

### 4.3 Labels

- **List/search labels:** `GET /v4/catalog/labels/`  
  Query: **name** (case-insensitive containment, OR), **name_exact** (exact label name), **id** (OR), **created**, **updated** (slice syntax), **enabled**, **supplier_id**, **supplier_name**, **label_manager**, **hype_active**, **hype_eligible**, **hype_trial_*_date**, **is_available_for_hype**, **is_available_for_pre_order**, **is_available_for_streaming**, **default_pre_order_weeks**, **page**, **per_page**.
- **Label detail:** `GET /v4/catalog/labels/{id}/`.
- **Label CSV export:** `GET /v4/catalog/labels/{id}/download/`.
- **Label images:** `GET /v4/catalog/labels/{id}/images/`.
- **Label’s releases:** `GET /v4/catalog/labels/{id}/releases/` — returns the list of releases for that label. Release objects do **not** include an inline list of tracks; to get tracks you must call the release-tracks endpoint per release.
- **Top N tracks (or releases):** `GET /v4/catalog/labels/{id}/top/{num}/`. Optional: `type=release`.
- **Facets:** `GET /v4/catalog/labels/facets/`.

### 4.4 Releases

- **List releases:** `GET /v4/catalog/releases/`  
  Many filters, including: **artist_id**, **artist_name**, **label_id**, **label_name**, **genre_id**, **genre_name**, **id**, **name**, **catalog_number**, **created**, **encoded_date**, **enabled**, **exclusive**, **current_status**, **is_available_for_streaming**, **is_explicit**, **is_hype**, **label_enabled**, **page**, **per_page**, and more (see OpenAPI).
- **Release detail:** `GET /v4/catalog/releases/{id}/`.
- **Tracks of a release:** `GET /v4/catalog/releases/{release_pk}/tracks/` — **use this to get the track list for a release.** Query: `page`, `per_page`.
- **Release track IDs only:** `GET /v4/catalog/releases/{release_pk}/tracks/ids/`.
- **Release track facets:** `GET /v4/catalog/releases/{release_pk}/tracks/facets/`.
- **DJ edit tracks:** `GET /v4/catalog/releases/{release_pk}/dj-edit-tracks/` and `.../dj-edit-tracks/facets/`.
- **Release images, beatbot, uab:** `GET /v4/catalog/releases/{id}/images/`, `.../beatbot/`, `.../uab/`.
- **Top N releases:** `GET /v4/catalog/releases/top/{num}/`.
- **Similar releases:** `GET /v4/catalog/releases/similar/`.
- **Facets:** `GET /v4/catalog/releases/facets/`.

**Important:** To get “label’s releases and their tracks”: (1) `GET /v4/catalog/labels/{id}/releases/`, (2) for each release id, `GET /v4/catalog/releases/{release_pk}/tracks/`.

### 4.5 Tracks

- **List tracks:** `GET /v4/catalog/tracks/` — many filters (artist, label, genre, release, BPM, key, date, etc.; see OpenAPI).
- **Track detail:** `GET /v4/catalog/tracks/{id}/`.
- **Audio files:** `GET /v4/catalog/tracks/{id}/audio-files/`.
- **Beatbot:** `GET /v4/catalog/tracks/{id}/beatbot/`.
- **Images:** `GET /v4/catalog/tracks/{id}/images/`.
- **Publishers:** `GET /v4/catalog/tracks/{id}/publishers/`.
- **Stream SDK:** `GET /v4/catalog/tracks/{id}/stream-sdk/`.
- **UAB:** `GET /v4/catalog/tracks/{id}/uab/`.
- **Track by ISRC (store):** `GET /v4/catalog/tracks/store/{isrc}/`.
- **Top N tracks:** `GET /v4/catalog/tracks/top/{num}/`.
- **Top N open-format:** `GET /v4/catalog/tracks/top/openformat/{num}/`.
- **Similar tracks:** `GET /v4/catalog/tracks/similar/`.
- **Facets:** `GET /v4/catalog/tracks/facets/`.

### 4.6 Artists

- **List artists:** `GET /v4/catalog/artists/`  
  Query: **name** (case-insensitive containment), **name_exact**, **id** (OR), **created**, **updated** (slice syntax), **enabled**, **page**, **per_page**.
- **Artist detail:** `GET /v4/catalog/artists/{id}/`.
- **Artist images:** `GET /v4/catalog/artists/{id}/images/`.
- **Top N tracks (or releases):** `GET /v4/catalog/artists/{id}/top/{num}/`. Optional: `type=release`.
- **Artist’s tracks:** `GET /v4/catalog/artists/{id}/tracks/`.
- **Facets:** `GET /v4/catalog/artists/facets/`.

### 4.7 Sub-genres

- **List:** `GET /v4/catalog/sub-genres/` — query: `enabled`, `name`, `page`, `per_page`, etc.
- **Detail:** `GET /v4/catalog/sub-genres/{id}/`.
- **Tracks:** `GET /v4/catalog/sub-genres/{id}/tracks/`.
- **Facets:** `GET /v4/catalog/sub-genres/facets/`.

### 4.8 Catalog playlists

- **List playlists:** `GET /v4/catalog/playlists/`  
  For LINK users: public and published only, filtered by subscription plan. Query params include **artist_name**, date range, and many others (see OpenAPI).
- **Playlist detail:** `GET /v4/catalog/playlists/{id}/`.
- **Tracks in playlist:** `GET /v4/catalog/playlists/{playlists_pk}/tracks/`.
- **Track facets / track IDs:** `.../tracks/facets/`, `.../tracks/ids/`.
- **Chart mapping, partners:** `GET /v4/catalog/playlists/{id}/chart-mapping/`, `.../partners/`.
- **Facets:** `GET /v4/catalog/playlists/facets/`.

### 4.9 Search

- **Search:** `GET /v4/catalog/search/` — catalog search (documentation maintained in frontend; see OpenAPI for params and security).
- **Search facets:** `GET /v4/catalog/search/facets/`.

---

## 5. Auxiliary API

Under `/v4/auxiliary/`: reference/lookup data.

- **Artist types:** `GET /v4/auxiliary/artist-types/`, `GET /v4/auxiliary/artist-types/{id}/`, `GET /v4/auxiliary/artist-types/facets/`.
- **Commercial model types:** `GET /v4/auxiliary/commercial-model-types/`, `GET /v4/auxiliary/commercial-model-types/facets/`.

All are GET-only. Facets return filter metadata and help text when present.

---

## 6. Curation API

Under `/v4/curation/`: curated playlists (read-only).

- **List curated playlists:** `GET /v4/curation/playlists/`.
- **Playlist detail:** `GET /v4/curation/playlists/{id}/`.
- **Tracks in curated playlist:** `GET /v4/curation/playlists/{curatedplaylist_pk}/tracks/`.
- **Single track in playlist:** `GET /v4/curation/playlists/{curatedplaylist_pk}/tracks/{id}/`.
- **Facets:** `GET /v4/curation/playlists/{curatedplaylist_pk}/tracks/facets/`, `GET /v4/curation/playlists/facets/`.

---

## 7. My API (user-specific)

Under `/v4/my/`: resources tied to the authenticated user. Requires authentication. Includes both read (GET) and write (POST, PUT, PATCH, DELETE) operations.

### 7.1 Account

- **List accounts:** `GET /v4/my/account/`.
- **Update account:** `PUT` or `PATCH /v4/my/account/{id}/`.
- **Facets:** `GET /v4/my/account/facets/`.
- **My account resource:** `PUT` or `PATCH /v4/my/account/myaccount/`.

### 7.2 Beatport (user’s Beatport library)

- **Get/create Beatport resource:** `GET` or `POST /v4/my/beatport/`.
- **Artists:** `GET /v4/my/beatport/artists/`.
- **Labels:** `GET /v4/my/beatport/labels/`.
- **Playlists:** `GET /v4/my/beatport/playlists/`.
- **Tracks:** `GET` or `POST /v4/my/beatport/tracks/`.
- **Delete:** `DELETE /v4/my/beatport/delete/` — delete subscription entries for the requesting user for the provided artist or label ids (send in request body as in OpenAPI).
- **Facets:** `GET /v4/my/beatport/facets/`.

### 7.3 My charts (user’s charts)

- **List or create:** `GET` or `POST /v4/my/charts/`.
- **Detail, update, delete:** `GET`, `PUT`, `PATCH`, `DELETE /v4/my/charts/{id}/`.
- **Chart images:** `GET` or `POST /v4/my/charts/{id}/images/`.
- **Tracks in chart:** `GET` or `POST /v4/my/charts/{mycharts_pk}/tracks/`.
- **Single track in chart:** `PUT`, `PATCH`, `DELETE /v4/my/charts/{mycharts_pk}/tracks/{id}/`.
- **Facets:** `GET /v4/my/charts/{mycharts_pk}/tracks/facets/`, `GET /v4/my/charts/facets/`.

### 7.4 Downloads

- **List:** `GET /v4/my/downloads/`.
- **Encode status:** `GET /v4/my/downloads/encode-status/`, `GET /v4/my/downloads/encode-status/facets/`.
- **Facets:** `GET /v4/my/downloads/facets/`.

### 7.5 Email preferences

- **Update:** `PATCH /v4/my/email-preferences/{id}/`.

### 7.6 My genres

- **List or create:** `GET` or `POST /v4/my/genres/`.
- **Delete:** `DELETE /v4/my/genres/{id}/`.
- **Facets:** `GET /v4/my/genres/facets/`.

### 7.7 My playlists

- **List or create:** `GET` or `POST /v4/my/playlists/`.
- **Detail, update, delete:** `GET`, `PATCH`, `DELETE /v4/my/playlists/{id}/`.
- **Tracks in playlist:** `GET` or `POST /v4/my/playlists/{myplaylists_pk}/tracks/`.
- **Single track:** `PATCH`, `DELETE /v4/my/playlists/{myplaylists_pk}/tracks/{id}/`.
- **Bulk track operations:** `POST`, `PATCH`, `DELETE /v4/my/playlists/{myplaylists_pk}/tracks/bulk/`. For **DELETE**, body must include `item_ids` (required): list of playlist track IDs to remove, e.g. `{"item_ids": [1, 2, 3]}`. **PATCH** is used to update playlist positions.
- **Bulk playlist update:** `PATCH /v4/my/playlists/bulk/` — update playlist positions.
- **Track facets / IDs:** `GET .../tracks/facets/`, `GET .../tracks/ids/`.
- **Facets:** `GET /v4/my/playlists/facets/`.

### 7.8 Streaming quality

- **List:** `GET /v4/my/streaming-quality/`.
- **Update:** `PATCH /v4/my/streaming-quality/{id}/`.
- **Facets:** `GET /v4/my/streaming-quality/facets/`.

---

## 8. Health

- **Health check:** `GET /v4/health-check/`.
- **Database health check:** `GET /v4/db-health-check/`.

---

## 9. Response format and schemas

- **Success:** Endpoints return `200` with a JSON body unless otherwise documented. List endpoints return paginated structures (e.g. `count`, `next`, `previous`, `results`). Exact field names and types are in `beatport-openapi.json` under `components.schemas`.
- **Schemas:** The spec references schemas such as `PaginatedChartListList`, `PaginatedLabelListList`, `ChartDetail`, `LabelDetail`, `GenreDetail`, `ReleaseDetail`, `TrackDetail`, `ArtistDetail`, `ReleaseTrackId`, and many others. Use the OpenAPI file for full request/response shapes.

---

## 10. Complete endpoint index (all paths and methods)

This table lists every path and every HTTP method from the OpenAPI spec so you can see the full surface area in one place.

| Method | Path |
|--------|------|
| **Auxiliary** | |
| GET | `/v4/auxiliary/artist-types/` |
| GET | `/v4/auxiliary/artist-types/{id}/` |
| GET | `/v4/auxiliary/artist-types/facets/` |
| GET | `/v4/auxiliary/commercial-model-types/` |
| GET | `/v4/auxiliary/commercial-model-types/facets/` |
| **Catalog — Artists** | |
| GET | `/v4/catalog/artists/` |
| GET | `/v4/catalog/artists/{id}/` |
| GET | `/v4/catalog/artists/{id}/images/` |
| GET | `/v4/catalog/artists/{id}/top/{num}/` |
| GET | `/v4/catalog/artists/{id}/tracks/` |
| GET | `/v4/catalog/artists/facets/` |
| **Catalog — Charts** | |
| GET | `/v4/catalog/charts/` |
| GET | `/v4/catalog/charts/{id}/` |
| GET | `/v4/catalog/charts/{id}/images/` |
| GET | `/v4/catalog/charts/{id}/tracks/` |
| GET | `/v4/catalog/charts/{id}/tracks/ids/` |
| GET | `/v4/catalog/charts/facets/` |
| GET | `/v4/catalog/charts/genre-overview/` |
| **Catalog — Genres** | |
| GET | `/v4/catalog/genres/` |
| GET | `/v4/catalog/genres/{id}/` |
| GET | `/v4/catalog/genres/{id}/sub-genres/` |
| GET | `/v4/catalog/genres/{id}/top/{num}/` |
| GET | `/v4/catalog/genres/{id}/tracks/` |
| GET | `/v4/catalog/genres/facets/` |
| **Catalog — Labels** | |
| GET | `/v4/catalog/labels/` |
| GET | `/v4/catalog/labels/{id}/` |
| GET | `/v4/catalog/labels/{id}/download/` |
| GET | `/v4/catalog/labels/{id}/images/` |
| GET | `/v4/catalog/labels/{id}/releases/` |
| GET | `/v4/catalog/labels/{id}/top/{num}/` |
| GET | `/v4/catalog/labels/facets/` |
| **Catalog — Playlists** | |
| GET | `/v4/catalog/playlists/` |
| GET | `/v4/catalog/playlists/{id}/` |
| GET | `/v4/catalog/playlists/{id}/chart-mapping/` |
| GET | `/v4/catalog/playlists/{id}/partners/` |
| GET | `/v4/catalog/playlists/{playlists_pk}/tracks/` |
| GET | `/v4/catalog/playlists/{playlists_pk}/tracks/facets/` |
| GET | `/v4/catalog/playlists/{playlists_pk}/tracks/ids/` |
| GET | `/v4/catalog/playlists/facets/` |
| **Catalog — Releases** | |
| GET | `/v4/catalog/releases/` |
| GET | `/v4/catalog/releases/{id}/` |
| GET | `/v4/catalog/releases/{id}/beatbot/` |
| GET | `/v4/catalog/releases/{id}/images/` |
| GET | `/v4/catalog/releases/{id}/uab/` |
| GET | `/v4/catalog/releases/{release_pk}/dj-edit-tracks/` |
| GET | `/v4/catalog/releases/{release_pk}/dj-edit-tracks/facets/` |
| GET | `/v4/catalog/releases/{release_pk}/tracks/` |
| GET | `/v4/catalog/releases/{release_pk}/tracks/facets/` |
| GET | `/v4/catalog/releases/{release_pk}/tracks/ids/` |
| GET | `/v4/catalog/releases/facets/` |
| GET | `/v4/catalog/releases/similar/` |
| GET | `/v4/catalog/releases/top/{num}/` |
| **Catalog — Search** | |
| GET | `/v4/catalog/search/` |
| GET | `/v4/catalog/search/facets/` |
| **Catalog — Sub-genres** | |
| GET | `/v4/catalog/sub-genres/` |
| GET | `/v4/catalog/sub-genres/{id}/` |
| GET | `/v4/catalog/sub-genres/{id}/tracks/` |
| GET | `/v4/catalog/sub-genres/facets/` |
| **Catalog — Tracks** | |
| GET | `/v4/catalog/tracks/` |
| GET | `/v4/catalog/tracks/{id}/` |
| GET | `/v4/catalog/tracks/{id}/audio-files/` |
| GET | `/v4/catalog/tracks/{id}/beatbot/` |
| GET | `/v4/catalog/tracks/{id}/images/` |
| GET | `/v4/catalog/tracks/{id}/publishers/` |
| GET | `/v4/catalog/tracks/{id}/stream-sdk/` |
| GET | `/v4/catalog/tracks/{id}/uab/` |
| GET | `/v4/catalog/tracks/facets/` |
| GET | `/v4/catalog/tracks/similar/` |
| GET | `/v4/catalog/tracks/store/{isrc}/` |
| GET | `/v4/catalog/tracks/top/{num}/` |
| GET | `/v4/catalog/tracks/top/openformat/{num}/` |
| **Curation** | |
| GET | `/v4/curation/playlists/` |
| GET | `/v4/curation/playlists/{curatedplaylist_pk}/tracks/` |
| GET | `/v4/curation/playlists/{curatedplaylist_pk}/tracks/{id}/` |
| GET | `/v4/curation/playlists/{curatedplaylist_pk}/tracks/facets/` |
| GET | `/v4/curation/playlists/{id}/` |
| GET | `/v4/curation/playlists/facets/` |
| **Health** | |
| GET | `/v4/db-health-check/` |
| GET | `/v4/health-check/` |
| **My — Account** | |
| GET | `/v4/my/account/` |
| PUT, PATCH | `/v4/my/account/{id}/` |
| GET | `/v4/my/account/facets/` |
| PUT, PATCH | `/v4/my/account/myaccount/` |
| **My — Beatport** | |
| GET, POST | `/v4/my/beatport/` |
| GET | `/v4/my/beatport/artists/` |
| DELETE | `/v4/my/beatport/delete/` |
| GET | `/v4/my/beatport/facets/` |
| GET | `/v4/my/beatport/labels/` |
| GET | `/v4/my/beatport/playlists/` |
| GET, POST | `/v4/my/beatport/tracks/` |
| **My — Charts** | |
| GET, POST | `/v4/my/charts/` |
| GET, POST | `/v4/my/charts/{mycharts_pk}/tracks/` |
| PUT, PATCH, DELETE | `/v4/my/charts/{mycharts_pk}/tracks/{id}/` |
| GET | `/v4/my/charts/{mycharts_pk}/tracks/facets/` |
| GET, PUT, PATCH, DELETE | `/v4/my/charts/{id}/` |
| GET, POST | `/v4/my/charts/{id}/images/` |
| GET | `/v4/my/charts/facets/` |
| **My — Downloads** | |
| GET | `/v4/my/downloads/` |
| GET | `/v4/my/downloads/encode-status/` |
| GET | `/v4/my/downloads/encode-status/facets/` |
| GET | `/v4/my/downloads/facets/` |
| **My — Email preferences** | |
| PATCH | `/v4/my/email-preferences/{id}/` |
| **My — Genres** | |
| GET, POST | `/v4/my/genres/` |
| DELETE | `/v4/my/genres/{id}/` |
| GET | `/v4/my/genres/facets/` |
| **My — Playlists** | |
| GET, POST | `/v4/my/playlists/` |
| GET, POST | `/v4/my/playlists/{myplaylists_pk}/tracks/` |
| PATCH, DELETE | `/v4/my/playlists/{myplaylists_pk}/tracks/{id}/` |
| POST, PATCH, DELETE | `/v4/my/playlists/{myplaylists_pk}/tracks/bulk/` |
| GET | `/v4/my/playlists/{myplaylists_pk}/tracks/facets/` |
| GET | `/v4/my/playlists/{myplaylists_pk}/tracks/ids/` |
| GET, PATCH, DELETE | `/v4/my/playlists/{id}/` |
| PATCH | `/v4/my/playlists/bulk/` |
| GET | `/v4/my/playlists/facets/` |
| **My — Streaming quality** | |
| GET | `/v4/my/streaming-quality/` |
| PATCH | `/v4/my/streaming-quality/{id}/` |
| GET | `/v4/my/streaming-quality/facets/` |

**Auth**

| Method | Path |
|--------|------|
| GET | User authorizes in browser: `/v4/auth/o/authorize/?client_id=...&response_type=code&redirect_uri=...` |
| POST | `/v4/auth/o/token/` (grant: authorization_code, password, client_credentials, refresh_token) |
| GET | `/v4/auth/o/introspect/` (Bearer token; returns current authorized user) |
| POST | `/v4/auth/o/revoke/?client_id=...&token=...` |

---

## 11. Common workflows

- **Charts and their tracks:** `GET /v4/catalog/charts/` (optional: filter by `genre_id`, `publish_date`). Then for each chart: `GET /v4/catalog/charts/{id}/` and `GET /v4/catalog/charts/{id}/tracks/`.
- **Labels and their release tracks:** `GET /v4/catalog/labels/` (e.g. `name` or `name_exact`). Then `GET /v4/catalog/labels/{id}/releases/`. For each release: `GET /v4/catalog/releases/{release_pk}/tracks/`.
- **Genres for filtering:** `GET /v4/catalog/genres/` then use genre ids in chart or release list params.
- **Date range for charts:** Use `publish_date` with slice syntax, e.g. `publish_date=2026-01-24:2026-02-24`.

For exact parameter names, types, and response schemas, use `beatport-openapi.json` in this folder.
