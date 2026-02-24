# inCrate implementation design 04: Playlist and auth (Phase 4)

**Implementation order:** Phase 4 — build after Phase 3 (Discovery).  
**Spec:** [../incrate-spec.md](../incrate-spec.md)  
**Previous:** [incrate-03-discovery.md](incrate-03-discovery.md)  
**Next:** [incrate-05-ui-and-integration.md](incrate-05-ui-and-integration.md).

---

## 1. Goals and scope

1. **Per-run playlist:** Create or select a playlist with name derived from current date (e.g. `feb26`) or user-provided; configurable format (short vs ISO).
2. **Add tracks:** Add the list of `DiscoveredTrack` from Phase 3 to that playlist.
3. **Auth:** Prefer Beatport API for playlist create and add-tracks if supported; otherwise **browser automation** with stored credentials (username/password).
4. **Output:** Return playlist URL or id and success count (or error message) for UI.

**Out of scope:** UI layout (Phase 5); only service and auth logic here.

---

## 2. Exact file and directory layout

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `src/cuepoint/incrate/playlist_writer.py` | `create_playlist_and_add_tracks(name, tracks) -> Result`; try API then browser. |
| CREATE | `src/cuepoint/incrate/playlist_name.py` | `default_playlist_name(format: str) -> str` (e.g. "short" -> "feb26", "iso" -> "2025-02-26"). |
| MODIFY | Config | incrate.playlist_name_format ("short" | "iso"), incrate.beatport_username, incrate.beatport_password (optional, for browser). |

---

## 3. Playlist name generation

**File:** `src/cuepoint/incrate/playlist_name.py`

- **default_playlist_name(format: str = "short", reference_date: Optional[date] = None) -> str**
  - If reference_date is None, use date.today().
  - "short": return e.g. "feb26" (month abbrev lower + day, no year).
  - "iso": return reference_date.isoformat() e.g. "2025-02-26".
  - Unknown format: default to "short".

- Month abbrev: Jan, Feb, Mar, ... (English); lowercase for "short": "jan", "feb", ...

---

## 4. Playlist writer (API path)

**File:** `src/cuepoint/incrate/playlist_writer.py`

- **create_playlist_and_add_tracks(name: str, tracks: List[DiscoveredTrack], api_client: Optional[BeatportApi] = None, ...) -> PlaylistResult**
  - PlaylistResult: dataclass with success: bool, playlist_url: Optional[str], playlist_id: Optional[str], added_count: int, error: Optional[str].
  - If api_client has create_playlist and add_tracks_to_playlist (to be added to BeatportApi in this phase if API supports):
    1. Create playlist with name; get playlist_id.
    2. For each track in tracks: add track by beatport_track_id to playlist_id.
    3. Return PlaylistResult(success=True, playlist_url=..., added_count=len(tracks)).
  - If API does not support or call fails: fall back to browser path (see below).

---

## 5. Playlist writer (browser fallback)

- **Requirements:** Browser automation (e.g. CuePoint’s existing browser provider or new incrate/browser_playlist.py).
- **Flow:**
  1. Launch or attach browser; navigate to Beatport login if not logged in.
  2. Log in with incrate.beatport_username and incrate.beatport_password (from config; do not log).
  3. Create new playlist with given name (e.g. click "New playlist", type name).
  4. For each DiscoveredTrack: open track page or use "Add to playlist" control; select the created playlist; add.
  5. Throttle: delay 0.5–1s between adds.
  6. Return PlaylistResult(success=True, added_count=N) or partial on error.
- **Resume:** Optional: persist "last added index" so on failure we can retry from that index; Phase 4 can be simple (no resume).

---

## 6. Configuration

- incrate.playlist_name_format: "short" | "iso"; default "short".
- incrate.beatport_username: str, optional.
- incrate.beatport_password: str, optional (store in keychain or config; never log).
- Beatport API token: same as Phase 2 for API path.

---

## 7. Full testing design

### 7.1 Unit tests – playlist_name.py

**File:** `src/tests/unit/incrate/test_playlist_name.py`

| Test method | Input | Expected |
|-------------|-------|----------|
| test_short_format | format="short", date=2025-02-26 | "feb26" |
| test_iso_format | format="iso", date=2025-02-26 | "2025-02-26" |
| test_short_january | date=2025-01-15 | "jan15" |
| test_default_uses_today | format="short", reference_date=None | match today’s month/day |

### 7.2 Unit tests – playlist_writer (API path)

**File:** `src/tests/unit/incrate/test_playlist_writer.py`

| Test method | Mock | Assertion |
|-------------|------|-----------|
| test_create_playlist_and_add_tracks_api_success | API create returns id; add_tracks succeeds | PlaylistResult.success True; added_count=len(tracks) |
| test_create_playlist_and_add_tracks_api_failure_falls_back | API create raises | browser path called or error returned |
| test_create_playlist_and_add_tracks_empty_tracks | tracks=[] | success True; added_count=0; no API/browser add calls |
| test_playlist_result_on_api_error | API raises 401 | PlaylistResult.success False; error message set |

### 7.3 Unit tests – browser path (if implemented)

- Mock browser: click "New playlist", fill name, click "Add" for each track; assert sequence of actions.
- test_browser_fallback_adds_all_tracks: 2 tracks; assert add called 2 times.

### 7.4 Full test matrix (Phase 4)

| # | Test file | Test method |
|---|-----------|-------------|
| 1 | test_playlist_name | test_short_format |
| 2 | test_playlist_name | test_iso_format |
| 3 | test_playlist_name | test_short_january |
| 4 | test_playlist_name | test_default_uses_today |
| 5 | test_playlist_writer | test_create_playlist_and_add_tracks_api_success |
| 6 | test_playlist_writer | test_create_playlist_and_add_tracks_api_failure_falls_back |
| 7 | test_playlist_writer | test_create_playlist_and_add_tracks_empty_tracks |
| 8 | test_playlist_writer | test_playlist_result_on_api_error |

### 7.5 File-by-file checklist (Phase 4)

| File | Item | Implemented | Test |
|------|------|-------------|------|
| incrate/playlist_name.py | default_playlist_name | [ ] | test_playlist_name |
| incrate/playlist_writer.py | PlaylistResult | [ ] | test_playlist_writer |
| incrate/playlist_writer.py | create_playlist_and_add_tracks (API) | [ ] | test_*_api_* |
| incrate/playlist_writer.py | create_playlist_and_add_tracks (browser) | [ ] | test_browser_* |
| services/beatport_api.py (Phase 2) | create_playlist, add_tracks_to_playlist | [ ] | if API supports |

---

## 8. Edge cases

- **Playlist name already exists:** API may create new with same name or return existing; document behavior. Browser: create new so "feb26" twice = two playlists.
- **Add track fails (e.g. track removed from Beatport):** Log and continue; add_count may be less than len(tracks); return partial success.
- **Browser not available:** If browser path selected and no browser/credentials, return PlaylistResult(success=False, error="Browser automation not available or credentials missing").

---

## 9. Security

- Never log password or token.
- Store password in config or keychain; prefer keychain on macOS/Windows if available.
- If config stores password, ensure config file is not committed (already in .gitignore).

---

## 10. Completion criteria

- [ ] default_playlist_name implemented and tested.
- [ ] create_playlist_and_add_tracks implemented (API path and optionally browser path).
- [ ] PlaylistResult returned; all unit tests pass.

---

## 11. Next phase

Phase 5: [incrate-05-ui-and-integration.md](incrate-05-ui-and-integration.md) — UI: tool selection, inCrate screen, Import / Discover / Add to playlist; config UI.

---

## Appendix A: Line-by-line implementation checklist (Phase 4)

1. **incrate/playlist_name.py:** default_playlist_name(format="short", reference_date=None). If reference_date None: date.today(). If format=="short": return month_abbrev_lower + str(day) e.g. "feb26". If format=="iso": return reference_date.isoformat(). Month list: jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec.
2. **incrate/playlist_writer.py:** PlaylistResult(success, playlist_url, playlist_id, added_count, error). create_playlist_and_add_tracks(name, tracks, api_client, ...): if not tracks return PlaylistResult(True, added_count=0). Try: playlist_id = api_client.create_playlist(name); for t in tracks: api_client.add_track_to_playlist(playlist_id, t.beatport_track_id); return PlaylistResult(True, added_count=len(tracks)). Except: fall back to browser path if implemented. Browser path: launch browser; login; create playlist name; for t in tracks: add t to playlist; delay; return PlaylistResult.
3. **BeatportApi (Phase 2) extension:** If API supports: create_playlist(name) -> playlist_id; add_tracks_to_playlist(playlist_id, track_ids). Else Phase 4 only implements playlist_name and writer with API stub + browser fallback.
4. **Config:** incrate.playlist_name_format, incrate.beatport_username, incrate.beatport_password.
5. **Tests:** test_playlist_name (short, iso, january); test_playlist_writer (API success, API failure fallback, empty tracks, error result).

---

## Appendix B: Full test case specifications (Phase 4)

- **test_short_format:** default_playlist_name("short", date(2025,2,26)) == "feb26".
- **test_iso_format:** default_playlist_name("iso", date(2025,2,26)) == "2025-02-26".
- **test_create_playlist_and_add_tracks_api_success:** Mock api_client.create_playlist return "pl1"; add_track_to_playlist no raise. create_playlist_and_add_tracks("feb26", [DiscoveredTrack(...), ...]) -> success True, added_count 2.
- **test_create_playlist_and_add_tracks_empty_tracks:** tracks=[] -> success True, added_count=0; create_playlist not called.
- **test_playlist_result_on_api_error:** Mock create_playlist raise BeatportAPIError -> PlaylistResult(success=False, error=...).

---

## Appendix C: Error and edge case matrix (Phase 4)

| Scenario | Handling |
|----------|----------|
| Playlist name exists | API: document behavior; browser: create new |
| Add track fails (removed) | Log; continue; added_count may be less |
| Browser not available | Return success=False, error="Browser not available or credentials missing" |
| No credentials | API path: use token. Browser path: require username/password |
| Empty tracks | Return success True, added_count 0 |

---

## Appendix D: Dependency graph (Phase 4)

```
DiscoveredTrack list (from Phase 3)
default_playlist_name(format) -> name string
       |
       v
create_playlist_and_add_tracks(name, tracks)
  -> BeatportApi.create_playlist, add_track_to_playlist (if API supports)
  -> OR browser: login, create playlist, add each track
       |
       v
PlaylistResult -> Phase 5 (UI status, link)
```

---

## Appendix E: Exact function signatures (Phase 4)

**incrate/playlist_name.py**
```python
def default_playlist_name(format: str = "short", reference_date: Optional[date] = None) -> str: ...
```

**incrate/playlist_writer.py**
```python
@dataclass
class PlaylistResult:
    success: bool
    playlist_url: Optional[str]
    playlist_id: Optional[str]
    added_count: int
    error: Optional[str]

def create_playlist_and_add_tracks(
    name: str,
    tracks: List[DiscoveredTrack],
    api_client: Optional[BeatportApi] = None,
    ...
) -> PlaylistResult: ...
```

---

## Appendix F: Test file layout and pytest markers (Phase 4)

- `tests/unit/incrate/test_playlist_name.py`: TestShortFormat, TestIsoFormat, TestShortJanuary, TestDefaultUsesToday.
- `tests/unit/incrate/test_playlist_writer.py`: TestCreatePlaylistAndAddTracksApiSuccess, TestCreatePlaylistAndAddTracksApiFailureFallsBack, TestCreatePlaylistAndAddTracksEmptyTracks, TestPlaylistResultOnApiError.
