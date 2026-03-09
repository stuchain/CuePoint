"""Unit tests for playlist_writer.create_playlist_and_add_tracks (Phase 4)."""

from unittest.mock import Mock

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.playlist_writer import (
    PlaylistResult,
    create_playlist_and_add_tracks,
)


def _track(track_id: int = 100, title: str = "Track", artists: str = "Artist"):
    return DiscoveredTrack(
        beatport_track_id=track_id,
        beatport_url=f"https://beatport.com/track/{track_id}",
        title=title,
        artists=artists,
        source_type="chart",
        source_name="Chart 1",
    )


class TestCreatePlaylistAndAddTracksApiSuccess:
    def test_create_playlist_and_add_tracks_api_success(self):
        api = Mock()
        api.create_playlist.return_value = "pl1"
        api.add_track_to_playlist = Mock(return_value=None)
        tracks = [_track(100), _track(101)]
        result = create_playlist_and_add_tracks("feb26", tracks, api_client=api)
        assert result.success is True
        assert result.added_count == 2
        api.create_playlist.assert_called_once_with("feb26")
        assert api.add_track_to_playlist.call_count == 2

    def test_create_playlist_and_add_tracks_empty_tracks(self):
        api = Mock()
        result = create_playlist_and_add_tracks("feb26", [], api_client=api)
        assert result.success is True
        assert result.added_count == 0
        api.create_playlist.assert_not_called()


class TestCreatePlaylistAndAddTracksApiFailureFallsBack:
    def test_create_playlist_and_add_tracks_api_failure_tries_browser_when_credentials_given(
        self,
    ):
        """When API fails and credentials + browser callable are provided, we try the browser fallback."""
        api = Mock()
        api.create_playlist.side_effect = Exception("API error")
        api.add_track_to_playlist = Mock()
        tracks = [_track(100)]
        browser_result = PlaylistResult(
            success=True,
            playlist_url="https://www.beatport.com/playlist/xyz",
            playlist_id="xyz",
            added_count=1,
            error=None,
        )
        browser_fn = Mock(return_value=browser_result)
        result = create_playlist_and_add_tracks(
            "feb26",
            tracks,
            api_client=api,
            browser_add_to_playlist=browser_fn,
            beatport_username="u",
            beatport_password="p",
        )
        browser_fn.assert_called_once()
        assert result.success is True
        assert result.added_count == 1
        assert result.playlist_url == "https://www.beatport.com/playlist/xyz"

    def test_create_playlist_and_add_tracks_api_failure_no_browser_when_no_callable(
        self,
    ):
        """When API fails and no browser callable, we do not call browser and return API error."""
        api = Mock()
        api.create_playlist.side_effect = Exception("API error")
        tracks = [_track(100)]
        result = create_playlist_and_add_tracks(
            "feb26",
            tracks,
            api_client=api,
            browser_add_to_playlist=None,
            beatport_username="u",
            beatport_password="p",
        )
        assert result.success is False
        assert "API error" in (result.error or "")


class TestPlaylistResultOnApiError:
    def test_playlist_result_on_api_error(self):
        api = Mock()
        api.create_playlist.side_effect = Exception("401 Unauthorized")
        tracks = [_track(100)]
        result = create_playlist_and_add_tracks(
            "feb26",
            tracks,
            api_client=api,
            browser_add_to_playlist=None,
            beatport_username=None,
            beatport_password=None,
        )
        assert result.success is False
        assert result.added_count == 0
        assert result.error is not None
        assert (
            "playlist" in result.error.lower()
            or "401" in result.error.lower()
            or "unauthorized" in result.error.lower()
        )
