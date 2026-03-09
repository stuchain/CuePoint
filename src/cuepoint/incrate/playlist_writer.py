"""Create Beatport playlist and add discovered tracks (Phase 4). API path first; browser fallback."""

import logging
from dataclasses import dataclass
from typing import Any, Callable, List, Optional

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
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
            return PlaylistResult(
                success=False,
                playlist_url=None,
                playlist_id=None,
                added_count=0,
                error="Could not create playlist. Your Beatport token may not have playlist write access, or the API may not support playlist creation.",
            )
        added = 0
        for t in tracks:
            try:
                add_track(playlist_id, t.beatport_track_id)
                added += 1
            except Exception as e:
                _logger.warning(
                    "Add track %s to playlist failed: %s", t.beatport_track_id, e
                )
        playlist_url = getattr(api_client, "playlist_url", None)
        url = playlist_url(playlist_id) if callable(playlist_url) else None
        return PlaylistResult(
            success=True,
            playlist_url=url,
            playlist_id=str(playlist_id) if playlist_id is not None else None,
            added_count=added,
            error=None,
        )
    except BeatportAPIError as e:
        err_msg = getattr(e, "message", str(e)) or "Beatport API error"
        if getattr(e, "status_code", None) == 403:
            err_msg = "Beatport API access forbidden (403). Your token may not have playlist write scope."
        _logger.debug("API playlist path failed: %s", e)
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=err_msg,
        )
    except Exception as e:
        _logger.debug("API playlist path failed: %s", e)
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=f"Playlist API failed: {e!s}",
        )


def _try_browser_path(
    name: str,
    tracks: List[DiscoveredTrack],
    username: Optional[str],
    password: Optional[str],
    browser_add_to_playlist: Optional[
        Callable[[str, List[DiscoveredTrack], str, str], PlaylistResult]
    ],
) -> PlaylistResult:
    """Use browser automation (manual login in window, then create playlist and add tracks)."""
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
    browser_add_to_playlist: Optional[
        Callable[[str, List[DiscoveredTrack], str, str], PlaylistResult]
    ] = None,
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
    if result is not None and result.success:
        return result
    # When API failed or was skipped, try browser (you log in manually in the window)
    if callable(browser_add_to_playlist):
        browser_result = _try_browser_path(
            name,
            tracks,
            beatport_username,
            beatport_password,
            browser_add_to_playlist,
        )
        if browser_result.success:
            return browser_result
        # If browser also failed, prefer returning browser error so user knows to sign in there
        if result is not None and not result.success:
            return browser_result
    if result is not None:
        return result
    return _try_browser_path(
        name,
        tracks,
        beatport_username,
        beatport_password,
        browser_add_to_playlist,
    )
