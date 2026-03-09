"""Unit tests for Beatport API models."""

from cuepoint.incrate.beatport_api_models import (
    ChartDetail,
    ChartTrack,
    Genre,
    LabelRelease,
    LabelReleaseTrack,
)


class TestGenre:
    """Test Genre dataclass."""

    def test_genre_dataclass(self):
        """Genre(id, name, slug) has accessible fields."""
        g = Genre(id=1, name="House", slug="house")
        assert g.id == 1
        assert g.name == "House"
        assert g.slug == "house"


class TestChartDetail:
    """Test ChartDetail and ChartTrack."""

    def test_chart_detail_tracks(self):
        """ChartDetail with tracks list; len(detail.tracks) == 1."""
        track = ChartTrack(
            track_id=100,
            title="Track A",
            artists="Artist 1",
            beatport_url="https://beatport.com/track/a/100",
            position=1,
        )
        detail = ChartDetail(
            id=12345,
            name="Top 10",
            author_name="DJ",
            published_date="2025-02-15",
            tracks=[track],
        )
        assert len(detail.tracks) == 1
        assert detail.tracks[0].title == "Track A"
        assert detail.tracks[0].position == 1


class TestLabelRelease:
    """Test LabelRelease and LabelReleaseTrack."""

    def test_label_release_tracks(self):
        """LabelRelease contains LabelReleaseTrack list."""
        t = LabelReleaseTrack(
            track_id=1,
            title="T",
            artists="A",
            beatport_url="https://example.com",
            release_date="2025-01-01",
        )
        r = LabelRelease(release_id=10, title="Release", release_date="2025-01-01", tracks=[t])
        assert len(r.tracks) == 1
        assert r.tracks[0].title == "T"
