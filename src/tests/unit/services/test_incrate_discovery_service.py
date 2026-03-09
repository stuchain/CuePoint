"""Unit tests for IncrateDiscoveryService (Phase 3)."""

from datetime import date, timedelta
from unittest.mock import Mock

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.services.incrate_discovery_service import IncrateDiscoveryService


class TestRunDiscoveryReturnsList:
    """run_discovery returns List[DiscoveredTrack]."""

    def test_run_discovery_returns_list(self):
        inv = Mock()
        inv.get_library_artists.return_value = []
        inv.get_library_labels.return_value = []
        api = Mock()
        api.list_charts.return_value = []
        service = IncrateDiscoveryService(inv, api, config_service=None)
        result = service.run_discovery(
            genre_ids=[1],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 1, 31),
        )
        assert isinstance(result, list)
        assert all(isinstance(t, DiscoveredTrack) for t in result)


class TestRunDiscoveryUsesConfigDates:
    """run_discovery uses config for dates when not passed."""

    def test_run_discovery_uses_config_dates(self):
        inv = Mock()
        inv.get_library_artists.return_value = []
        inv.get_library_labels.return_value = []
        api = Mock()
        api.list_charts.return_value = []
        config = Mock()
        config.get.side_effect = lambda k, d=None: 30 if k == "incrate.new_releases_days" else (d if d is not None else [])
        service = IncrateDiscoveryService(inv, api, config_service=config)
        to_date = date.today()
        from_date = to_date - timedelta(days=30)
        service.run_discovery(genre_ids=[])
        api.list_charts.assert_not_called()
        api.get_label_releases.assert_not_called()
        service.run_discovery(genre_ids=[5])
        # list_charts is called for genre 5; when 0 tracks, fallback calls list_charts(0, ..., limit=200)
        assert api.list_charts.call_count >= 1
        first_call_args, first_call_kw = api.list_charts.call_args_list[0]
        assert first_call_args[0] == 5
        assert first_call_args[2] == to_date
        assert first_call_args[1] == from_date
