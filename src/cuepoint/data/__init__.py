"""Data access layer.

This package contains data access functions for:
- Beatport: Scraping and parsing Beatport track pages
- Rekordbox: Parsing Rekordbox XML export files
- Search: Direct Beatport search implementations
- Providers: Search provider abstraction (Step 12)

Modules:
    beatport: Beatport scraping and parsing utilities
    beatport_search: Direct Beatport search with multiple methods
    rekordbox: Rekordbox XML parsing utilities
    providers: Search provider interface and registry
"""

from cuepoint.data.rekordbox import (
    build_rekordbox_updates,
    build_rekordbox_updates_batch,
    get_track_locations,
    playlist_path_for_display,
    write_key_comment_year_to_playlist_tracks,
    write_key_comment_year_to_playlist_tracks_batch,
    write_tags_to_paths,
    write_updated_collection_xml,
)

__all__ = [
    "build_rekordbox_updates",
    "build_rekordbox_updates_batch",
    "get_track_locations",
    "playlist_path_for_display",
    "write_key_comment_year_to_playlist_tracks",
    "write_key_comment_year_to_playlist_tracks_batch",
    "write_tags_to_paths",
    "write_updated_collection_xml",
]
