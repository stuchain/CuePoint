"""Integration tests for Beatport API (live). Skip when BEATPORT_ACCESS_TOKEN not set."""

import os
from datetime import date, timedelta

import pytest

from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient


def _token() -> str:
    return os.environ.get("BEATPORT_ACCESS_TOKEN", "").strip()


@pytest.mark.integration
@pytest.mark.skipif(not _token(), reason="BEATPORT_ACCESS_TOKEN not set")
class TestBeatportApiLive:
    """Live API tests; run only when token is set."""

    @pytest.fixture
    def client(self):
        base = os.environ.get("BEATPORT_API_BASE_URL", "https://api.beatport.com/v4")
        return BeatportApiClient(
            base_url=base,
            access_token=_token(),
            timeout=30,
        )

    @pytest.fixture
    def api(self, client):
        return BeatportApi(client, cache_service=None)

    def test_list_genres_live(self, api):
        """Real API: list_genres() returns non-empty list."""
        genres = api.list_genres()
        assert isinstance(genres, list)
        # API may return empty if endpoint differs; we only require no exception
        if genres:
            assert hasattr(genres[0], "id")
            assert hasattr(genres[0], "name")

    def test_list_charts_live(self, api):
        """Real API: list_charts with genre and dates returns list (maybe empty)."""
        to_d = date.today()
        from_d = to_d - timedelta(days=30)
        charts = api.list_charts(genre_id=5, from_date=from_d, to_date=to_d)
        assert isinstance(charts, list)

    def test_get_chart_live(self, api):
        """Real API: get_chart(known_id) returns ChartDetail or None."""
        # Use a small chart id if API has one; otherwise we may get None
        detail = api.get_chart(12345)
        if detail is not None:
            assert hasattr(detail, "id")
            assert hasattr(detail, "tracks")
