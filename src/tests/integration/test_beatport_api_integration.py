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

    def test_genres_live(self, api):
        """Real API: genres() returns the whole listing, each with an id and name."""
        genres = api.genres()
        assert isinstance(genres, list)
        for genre in genres:
            assert genre.id > 0 and genre.name

    def test_charts_live(self, api):
        """Real API: charts() in a 30-day window stays inside it, newest first."""
        to_d = date.today()
        from_d = to_d - timedelta(days=30)
        charts = api.charts(5, from_d, to_d)
        assert isinstance(charts, list)
        dates = [c.publish_date for c in charts if c.publish_date]
        assert all(from_d.isoformat() <= d <= to_d.isoformat() for d in dates)
        assert dates == sorted(dates, reverse=True)

    def test_chart_tracks_live(self, api):
        """Real API: a listed chart's tracks carry their ids."""
        to_d = date.today()
        charts = api.charts(5, to_d - timedelta(days=30), to_d)
        if charts:
            for track in api.chart_tracks(charts[0].id, max_pages=1):
                assert track.id > 0
