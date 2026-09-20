"""Data access layer.

This package contains data access functions for:
- Beatport: Scraping and parsing Beatport track pages
- Rekordbox: Parsing Rekordbox XML export files, and patching one for export
- Search: Direct Beatport search implementations
- Providers: Search provider abstraction (Step 12)

Modules:
    beatport: Beatport scraping and parsing utilities
    beatport_search: Direct Beatport search with multiple methods
    rekordbox: Rekordbox XML parsing utilities
    rekordbox_export: Writing a patched copy of a Rekordbox XML, with
        CuePoint's own playlists appended (EXPORT-01, EXPORT-02)
    providers: Search provider interface and registry
"""

from cuepoint.data.rekordbox import (
    get_track_locations,
    playlist_path_for_display,
)
from cuepoint.data.rekordbox_export import (
    CUEPOINT_FOLDER_NAME,
    ExportFolder,
    ExportPlaylist,
    PatchResult,
    PlaylistResult,
    TrackExportValues,
    patch_collection_xml,
    plan_collection_xml,
    refuse_source_as_destination,
)

__all__ = [
    "CUEPOINT_FOLDER_NAME",
    "ExportFolder",
    "ExportPlaylist",
    "PatchResult",
    "PlaylistResult",
    "TrackExportValues",
    "get_track_locations",
    "patch_collection_xml",
    "plan_collection_xml",
    "playlist_path_for_display",
    "refuse_source_as_destination",
]
