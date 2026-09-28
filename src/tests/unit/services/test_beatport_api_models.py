"""Unit tests for Beatport API models."""

from cuepoint.services.beatport_api_models import Genre


class TestGenre:
    """Test Genre dataclass."""

    def test_genre_dataclass(self):
        """Genre(id, name, slug) has accessible fields."""
        g = Genre(id=1, name="House", slug="house")
        assert g.id == 1
        assert g.name == "House"
        assert g.slug == "house"
