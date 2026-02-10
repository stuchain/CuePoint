# Rekordbox XML Parsing

## What it is (high-level)

CuePoint reads a **Rekordbox XML export** file (typically `collection.xml`) to get the user’s tracks and playlists. It does not talk to Rekordbox directly; it only parses the XML export. From that file it builds:

- A **collection** of tracks (track ID, title, artists).
- **Playlists**: each playlist is a named list of track IDs. Tracks are resolved from the collection so each playlist becomes a list of `Track` objects with position.

Artists are taken from the XML when present; when the artist field is empty, they can be **extracted from the title** (e.g. "Artist – Title" or "Title (Artist)"). There is also an **inspection** API used for preflight to report playlist names, track counts, and basic integrity (e.g. missing titles).

Security and robustness: XML file size is **capped** (100 MiB) to avoid resource exhaustion; parsing uses the standard library and skips tracks with missing IDs or titles.

## How it is implemented (code)

- **Entry point / main parser**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Function:** `parse_rekordbox(xml_path: str) -> Dict[str, Playlist]`  
  - Loads the file, checks size against `MAX_XML_SIZE_BYTES` (100 MiB), parses with `xml.etree.ElementTree`, then:
    - Finds `COLLECTION` and builds `tracks_by_id` (each `TRACK` → `RBTrack(track_id, title, artists)`).
    - Finds `PLAYLISTS` and iterates `NODE` elements with `Type="1"` (playlist); for each, reads `Name` and the list of `TRACK` keys to build `playlist_data[name] = [track_ids]`.
    - Converts to `Playlist` objects by resolving each track ID to a `Track` via `track_from_rbtrack()` and setting `track.position`.

- **Artist extraction when empty**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Function:** `extract_artists_from_title(title: str) -> Optional[Tuple[str, str]]`  
  - Uses regex/patterns to detect "Artist – Title" or parenthetical artist in title; returns `(artist, cleaned_title)` so the pipeline can fill in artist for display and search.

- **Preflight inspection**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Function:** `inspect_rekordbox_xml(xml_path: str) -> Dict[str, object]`  
  - Parses the XML and returns a dict with `root_tag`, `has_playlists`, playlist names, duplicate/empty playlist names, track counts per playlist, `has_tracks`, and counts of tracks missing title or artist. Used by the preflight step and UI.

- **Read/write checks**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Functions:** `is_readable(xml_path)`, `is_writable(xml_path)`  
  - Used to validate that the path exists, is a file, and (for write) that the directory is writable (e.g. for any future write-back or sidecars).

- **Playlist index helper**  
  - **File:** `src/cuepoint/data/rekordbox.py`  
  - **Function:** `read_playlist_index(xml_path) -> List[str]`  
  - Returns the list of playlist names in document order; used by the UI and CLI to list playlists and select one (or batch).

- **Models**  
  - **File:** `src/cuepoint/models/playlist.py` — `Playlist` (name, tracks).  
  - **File:** `src/cuepoint/models/track.py` — `Track` (title, artists, position, etc.).  
  - **File:** `src/cuepoint/models/compat.py` — `track_from_rbtrack(rbtrack)` to build a `Track` from `RBTrack`.

So: **what the feature is** = “read Rekordbox XML and give me playlists of tracks”; **how it’s implemented** = `rekordbox.py` parsing + `RBTrack` → `Track` + `Playlist`, with size limit, artist-from-title, and inspection for preflight.
