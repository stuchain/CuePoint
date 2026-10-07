# Beatport v4 API Reference

The parts of the Beatport v4 API that Discover uses: the base URL and settings, how to get a token, the routes CuePoint calls, the models it parses them into, and how errors are handled. The user-facing steps for entering a token are in [Discover](../user-guide/discover.md#a-beatport-token).

The code is in `src/cuepoint/services/`:

- `beatport_api_client.py`: the HTTP client (auth, retries, limits, error classes).
- `beatport_api.py`: the catalog and playlist calls Discover makes.
- `beatport_catalog.py`: the parsers, one shape for each response.
- `beatport_api_models.py`: the `Catalog*` and `Genre` models the parsers return.

## 1. Official docs

- **Docs:** <https://api.beatport.com/v4/docs/>. They need a Beatport login; without one you only see the portal shell.
- **OpenAPI spec (needs auth):** `https://api.beatport.com/v4/swagger-ui/json/`. To save it, open the docs in a browser while logged in, find the request to `/v4/swagger-ui/json/` in DevTools > Network, and save the response as JSON.

## 2. Base URL and settings

| Item | Value |
| --- | --- |
| Base URL | `https://api.beatport.com/v4` |
| Config key, base URL | `incrate.beatport_api_base_url` (default `https://api.beatport.com/v4`) |
| Config key, token | `incrate.beatport_access_token` (no default) |
| Environment override | `BEATPORT_ACCESS_TOKEN` takes priority over the config token |
| Config key, timeout | `incrate.beatport_api_timeout` (default 30 seconds) |

The `incrate.` prefix is historical; the keys keep their names so existing `~/.cuepoint/config.yaml` files still load. The engine reads them when it builds the API client (`services/bootstrap.py`).

## 3. Authentication

The API uses OAuth2 with a Bearer token. CuePoint sends `Authorization: Bearer <access_token>` and `Content-Type: application/json` on every request.

| Purpose | Method | URL |
| --- | --- | --- |
| Authorize (code flow) | GET | `https://api.beatport.com/v4/auth/o/authorize/?client_id=<ID>&response_type=code&redirect_uri=<URI>` |
| Token (exchange, refresh) | POST (form) | `https://api.beatport.com/v4/auth/o/token/` |
| Introspect | GET | `https://api.beatport.com/v4/auth/o/introspect/` (with Bearer) |
| Revoke | POST | `https://api.beatport.com/v4/auth/o/revoke/?client_id=<ID>&token=<ACCESS_TOKEN>` |

CuePoint only sends the token. It does not request, refresh or revoke tokens. The commands below are for getting one by hand.

### Getting a token

You do not look up a token. You request API access from Beatport at <https://accounts.beatport.com/developer/request-api-key>, and when it is approved you receive a **client ID** (and possibly a **client secret**) and the rules for which flows you may use. Then you exchange those for a token. Never share your client secret.

Which flow to use:

- **Client secret and a Beatport account:** the user password flow.
- **Only a client ID, or a browser app with no server:** the authorization code flow.
- **Application-level access, no user:** the client credentials flow.

The examples use [HTTPie](https://httpie.io/); `-f` form-encodes the body.

**Authorization code.** Open this in a browser (fill in `<CLIENT_ID>` and `<REDIRECT_URI>`), click **Authorize**, and Beatport sends a `code` to your redirect URI as a query parameter:

```text
https://api.beatport.com/v4/auth/o/authorize/?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<REDIRECT_URI>
```

Exchange the code for a token:

```bash
http -f https://api.beatport.com/v4/auth/o/token/ \
  client_id=$CLIENT_ID \
  code=$CODE \
  grant_type=authorization_code \
  redirect_uri=https://api.beatport.com/v4/auth/o/post-message
```

**User password:**

```bash
http -f https://api.beatport.com/v4/auth/o/token/ \
  client_id=$CLIENT_ID \
  client_secret=$CLIENT_SECRET \
  username=$USERNAME \
  password=$PASSWORD \
  grant_type=password
```

**Client credentials:**

```bash
http -f https://api.beatport.com/v4/auth/o/token/ \
  client_id=$CLIENT_ID \
  client_secret=$CLIENT_SECRET \
  grant_type=client_credentials
```

A successful answer looks like this. Save the `access_token` value in CuePoint's Settings:

```json
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "expires_in": 36000,
  "scope": "...",
  "token_type": "Bearer"
}
```

**Check a token** with the introspect route:

```bash
http https://api.beatport.com/v4/auth/o/introspect/ "Authorization:Bearer $ACCESS_TOKEN"
```

**Refresh** once `expires_in` has passed:

```bash
http -f https://api.beatport.com/v4/auth/o/token/ \
  "Authorization:Bearer $ACCESS_TOKEN" \
  client_id=$CLIENT_ID \
  refresh_token=$REFRESH_TOKEN \
  grant_type=refresh_token
```

**Revoke:**

```bash
http -f POST "https://api.beatport.com/v4/auth/o/revoke/?client_id=$CLIENT_ID&token=$ACCESS_TOKEN"
```

## 4. Routes Discover uses

All calls are GETs with the Bearer token, except the two playlist writes, which are POSTs. Paths are relative to the base URL.

| Call (`BeatportApi`) | Route | Notes |
| --- | --- | --- |
| `get_track` | `catalog/tracks/{id}/` | One track. |
| `get_tracks` | `catalog/tracks/?id=a,b,c` | Batches of up to 100 ids. The answer is checked against the ids asked for; if the filter does not hold, it falls back to one request per track. |
| `get_artist`, `get_label` | `catalog/artists/{id}/`, `catalog/labels/{id}/` | |
| `artist_tracks`, `label_tracks` | `catalog/tracks/` with `artist_id` or `label_id`, `publish_date=since:until`, `order_by=-publish_date` | Newest first. The window is applied again in code, and listing stops at the first page older than it. |
| `charts` | `catalog/charts/` with `publish_date=since:until` and optionally `genre_id` | Dates and genres are also checked in code. A chart with no date or no genres is kept. |
| `chart_tracks` | `catalog/charts/{id}/tracks/` | |
| `genres` | `catalog/genres/` | All genres, each once, in Beatport's order. |
| `search_label_by_name` | `catalog/search?q=` (falls back to `catalog/labels?q=`) | Resolves a label name to an id. |
| `create_playlist` | `POST my/playlists/` with `{"name": ...}` | Needs a token with playlist scope. |
| `add_track_to_playlist` | `POST my/playlists/{id}/tracks/` with `{"track_id": ...}` | |

A playlist's page on the website is `https://www.beatport.com/library/playlists/{id}`.

**Listings** use `per_page=100` (Beatport's largest page) and follow `next` for up to 10 pages (`MAX_LISTING_PAGES`).

**Route map**, checked against the live API on 2026-09-23. Its router answers 404 for a missing path and 401 for an existing one, before it checks a token:

- **Exist:** `catalog/tracks/`, `catalog/tracks/{id}/`, `catalog/artists/{id}/`, `catalog/artists/{id}/tracks/`, `catalog/labels/`, `catalog/labels/{id}/`, `catalog/labels/{id}/releases/`, `catalog/releases/{id}/tracks/`, `catalog/charts/`, `catalog/charts/{id}/`, `catalog/charts/{id}/tracks/`, `catalog/genres/`, `catalog/search/`, `my/account/`, `my/playlists/`, `my/playlists/{id}/`, `my/playlists/{id}/tracks/`, `my/playlists/{id}/tracks/bulk/`.
- **Do not exist:** `catalog/artists/{id}/charts/`, `catalog/artists/{id}/releases/`, `catalog/artists/{id}/top-10-tracks/`, `catalog/labels/{id}/charts/`, `catalog/labels/{id}/tracks/`, `catalog/labels/{id}/top-10-tracks/`. So there is no listing of charts by artist or by label.
- **Every path needs its trailing slash.** Without it Beatport answers 301, and `requests` replays a redirected POST as a GET, which once made "create playlist" read the playlist list instead. A POST now never follows a redirect.

## 5. Parsed models

`beatport_catalog.py` parses each response into one shape, which keeps every id:

- **`Genre`**: `id`, `name`, `slug`.
- **`CatalogArtist`**, **`CatalogLabel`**: `id`, `name`.
- **`CatalogTrack`**: `id`, `title`, `mix_name`, `url`, `artists`, `remixers`, `label_id`, `label_name`, `release_id`, `release_name`, `release_date`, `bpm`, `key`, `genre_id`, `genre_name`.
- **`CatalogChart`**: `id`, `name`, `url`, `publish_date`, `artist`, `owner_name`, `genre_ids`, `track_count`. A chart carries `artist` when a Beatport artist made it, and `null` otherwise. `owner_name` is the publishing account, which can differ from the artist, and its id is not an artist id. The chart's date field is `publish_date`.

The shapes, and the evidence for each, are in `src/tests/fixtures/beatport_v4/README.md`. `src/tests/unit/services/test_beatport_catalog.py` holds the parsers to the recorded and reconstructed fixtures, so no test reaches the network.

## 6. Errors and limits

| Case | What the client does |
| --- | --- |
| No token | Raises `BeatportAPIError` ("Configure Beatport API token ...", code `BEATPORT_API_NO_TOKEN`) before any request. |
| 401 | Raises "Invalid or expired Beatport API token". Not retried. |
| 403 | Raises "Beatport API access forbidden". Not retried. |
| 404 | `get` returns `None`. |
| 429 | Waits out `Retry-After` once (2 seconds when absent), then retries. A second 429, or a `Retry-After` over 30 seconds, raises "Rate limited; try again later" with `retry_after`. |
| 5xx | Retries with backoff, then raises. |
| 3xx on a POST | Raises `BEATPORT_API_REDIRECT`. A POST never follows a redirect. |
| Body over 8 MiB | Raises `BEATPORT_API_TOO_LARGE` before parsing. |
| Timeout | Raises "Request timed out". |
| Malformed JSON | Raises "Invalid API response". |

`classify_beatport_error` maps every failure to one of five classes, which Discover's empty states are built from: `no_token`, `rejected` (401), `forbidden` (403, including a token without playlist scope), `rate_limited` (429) and `unavailable` (everything else). At most four Beatport requests are in flight across the engine (`MAX_CONCURRENT_REQUESTS`).

## 7. Caching

- **Genres:** key `beatport_api:catalog_genres`, 24 hours.
- **Label search:** key `beatport_api:label_search:{normalized_name}`, 1 hour.

## 8. Working without a token

With `CUEPOINT_BEATPORT_FIXTURE` set, every request is answered from a file by `cuepoint/data/beatport_fixture.py` instead of the network, so the end-to-end tests run Discover with no token. `src/tests/fixtures/beatport_v4/` holds eleven recorded responses (2026-09-23) and the reconstructed ones.
