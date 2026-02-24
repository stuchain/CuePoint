"""Create Beatport playlist and add discovered tracks (Phase 4). API path first; browser fallback."""

import logging
from dataclasses import dataclass
from typing import Any, Callable, List, Optional

from cuepoint.incrate.beatport_api_models import DiscoveredTrack

_logger = logging.getLogger(__name__)


@dataclass
class PlaylistResult:
    """Result of create_playlist_and_add_tracks."""

    success: bool
    playlist_url: Optional[str]
    playlist_id: Optional[str]
    added_count: int
    error: Optional[str]


def _try_api_path(
    name: str,
    tracks: List[DiscoveredTrack],
    api_client: Any,
) -> Optional[PlaylistResult]:
    """Try create_playlist and add_tracks via API. Returns None if API doesn't support or fails."""
    create_playlist = getattr(api_client, "create_playlist", None)
    add_track = getattr(api_client, "add_track_to_playlist", None)
    if not callable(create_playlist) or not callable(add_track):
        return None
    try:
        playlist_id = create_playlist(name)
        if not playlist_id:
            return None
        added = 0
        for t in tracks:
            try:
                add_track(playlist_id, t.beatport_track_id)
                added += 1
            except Exception as e:
                _logger.warning("Add track %s to playlist failed: %s", t.beatport_track_id, e)
        playlist_url = getattr(api_client, "playlist_url", None)
        url = playlist_url(playlist_id) if callable(playlist_url) else None
        return PlaylistResult(
            success=True,
            playlist_url=url,
            playlist_id=str(playlist_id) if playlist_id is not None else None,
            added_count=added,
            error=None,
        )
    except Exception as e:
        _logger.debug("API playlist path failed: %s", e)
        return None


def _try_browser_path(
    name: str,
    tracks: List[DiscoveredTrack],
    username: Optional[str],
    password: Optional[str],
    browser_add_to_playlist: Optional[Callable[[str, List[DiscoveredTrack], str, str], PlaylistResult]],
) -> PlaylistResult:
    """Use browser automation if available and credentials provided."""
    if not username or not password:
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error="Browser automation not available or credentials missing",
        )
    if not callable(browser_add_to_playlist):
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error="Browser automation not available or credentials missing",
        )
    try:
        return browser_add_to_playlist(name, tracks, username, password)
    except Exception as e:
        _logger.warning("Browser playlist path failed: %s", e)
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=str(e) or "Browser automation failed",
        )


def create_playlist_and_add_tracks(
    name: str,
    tracks: List[DiscoveredTrack],
    api_client: Optional[Any] = None,
    browser_add_to_playlist: Optional[Callable[[str, List[DiscoveredTrack], str, str], PlaylistResult]] = None,
    beatport_username: Optional[str] = None,
    beatport_password: Optional[str] = None,
) -> PlaylistResult:
    """Create a playlist with the given name and add tracks. Tries API then browser fallback.

    Args:
        name: Playlist name (e.g. from default_playlist_name).
        tracks: List of DiscoveredTrack to add.
        api_client: Optional BeatportApi (or similar) with create_playlist, add_track_to_playlist.
        browser_add_to_playlist: Optional callable(name, tracks, username, password) -> PlaylistResult.
        beatport_username: For browser path.
        beatport_password: For browser path (never logged).

    Returns:
        PlaylistResult with success, playlist_url/id, added_count, and error if failed.
    """
    if not tracks:
        return PlaylistResult(
            success=True,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=None,
        )
    result = None
    if api_client is not None:
        result = _try_api_path(name, tracks, api_client)
    if result is not None:
        return result
    return _try_browser_path(
        name,
        tracks,
        beatport_username,
        beatport_password,
        browser_add_to_playlist,
    )
