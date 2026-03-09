"""inCrate discovery service: charts from library artists + new releases from library labels (Phase 3)."""

from datetime import date, timedelta
from typing import Any, Callable, List, Optional

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.discovery import run_discovery as discovery_run_discovery


class IncrateDiscoveryService:
    """Facade for discovery: uses InventoryService and BeatportApi; reads config for dates and genres."""

    def __init__(
        self,
        inventory_service: Any,
        beatport_api: Any,
        config_service: Optional[Any] = None,
    ):
        self._inventory = inventory_service
        self._beatport_api = beatport_api
        self._config = config_service

    def run_discovery(
        self,
        genre_ids: Optional[List[int]] = None,
        charts_from_date: Optional[date] = None,
        charts_to_date: Optional[date] = None,
        new_releases_days: Optional[int] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
        library_artist_names: Optional[List[str]] = None,
        library_label_names: Optional[List[str]] = None,
    ) -> List[DiscoveredTrack]:
        """Run discovery; use config for defaults when args are None.

        Args:
            genre_ids: Genre IDs for charts; if None, use incrate.discovery_genre_ids.
            charts_from_date: Start date for charts; if None, today - 30.
            charts_to_date: End date for charts; if None, today.
            new_releases_days: Days back for label releases; if None, use incrate.new_releases_days (default 30).
            progress_callback: Optional (stage, current, total).
            library_artist_names: If non-empty, only chart authors in this list; None/empty = all.
            library_label_names: If non-empty, only these labels for releases; None/empty = all.

        Returns:
            Deduplicated list of DiscoveredTrack.
        """
        to_date = charts_to_date or date.today()
        from_date = charts_from_date or (to_date - timedelta(days=30))
        if genre_ids is None and self._config is not None:
            try:
                genre_ids = list(self._config.get("incrate.discovery_genre_ids") or [])
            except (TypeError, AttributeError):
                genre_ids = []
        if genre_ids is None:
            genre_ids = []
        days = new_releases_days
        if days is None and self._config is not None:
            try:
                days = int(self._config.get("incrate.new_releases_days") or 30)
            except (TypeError, ValueError, AttributeError):
                days = 30
        if days is None:
            days = 30
        return discovery_run_discovery(
            self._inventory,
            self._beatport_api,
            genre_ids,
            from_date,
            to_date,
            new_releases_days=days,
            progress_callback=progress_callback,
            library_artist_names=library_artist_names,
            library_label_names=library_label_names,
        )
