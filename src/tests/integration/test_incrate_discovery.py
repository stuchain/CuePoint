"""Integration tests for inCrate discovery (Phase 3): e2e with temp DB; mocked API and optional live API."""

import os
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import Mock

import pytest

from cuepoint.incrate.beatport_api_models import (
    ChartDetail,
    ChartSummary,
    ChartTrack,
    LabelRelease,
    LabelReleaseTrack,
)
from cuepoint.incrate.discovery import run_discovery
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.services.inventory_service import InventoryService


def _live_token() -> str:
    token = (os.environ.get("BEATPORT_ACCESS_TOKEN") or "").strip()
    if not token:
        # Allow token from repo-root beatporttoken.txt (token=...)
        root = Path(__file__).resolve().parents[3]
        token_file = root / "beatporttoken.txt"
        if token_file.exists():
            for line in token_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("token="):
                    token = line.split("=", 1)[1].strip()
                    break
    return token


@pytest.mark.integration
class TestRunDiscoveryE2eMocked:
    """Real InventoryService (temp DB with 1 artist, 1 label); mocked BeatportApi; result non-empty, dedupe."""

    def test_run_discovery_e2e_mocked(self, tmp_path: Path):
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION>
    <TRACK TrackID="1" Name="Track One" Artist="Artist A" Label="Defected"/>
  </COLLECTION>
</DJ_PLAYLISTS>"""
        xml_path = tmp_path / "collection.xml"
        xml_path.write_text(xml_content, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        inventory = InventoryService(db_path=db_path)
        inventory.import_from_xml(str(xml_path), enrich=False)
        assert "Artist A" in inventory.get_library_artists()
        assert "Defected" in inventory.get_library_labels()

        api = Mock()
        api.list_charts.return_value = [
            ChartSummary(1, "Chart One", 5, "house", None, "Artist A", "2025-02-01", 1),
        ]
        api.get_chart.return_value = ChartDetail(
            1,
            "Chart One",
            "Artist A",
            "2025-02-01",
            tracks=[
                ChartTrack(
                    100,
                    "Chart Track",
                    "Artist A",
                    "https://beatport.com/track/ct/100",
                    1,
                ),
            ],
        )
        api.search_label_by_name.return_value = 10
        api.get_label_releases.return_value = [
            LabelRelease(
                1,
                "Release One",
                "2025-02-01",
                tracks=[
                    LabelReleaseTrack(
                        101,
                        "Release Track",
                        "Artist B",
                        "https://beatport.com/track/rt/101",
                        "2025-02-01",
                    ),
                ],
            ),
        ]

        result = run_discovery(
            inventory,
            api,
            genre_ids=[5],
            charts_from_date=date(2025, 1, 1),
            charts_to_date=date(2025, 2, 28),
            new_releases_days=30,
        )
        assert len(result) >= 1
        chart_tracks = [t for t in result if t.source_type == "chart"]
        release_tracks = [t for t in result if t.source_type == "label_release"]
        assert len(chart_tracks) == 1
        assert chart_tracks[0].beatport_track_id == 100
        assert len(release_tracks) == 1
        assert release_tracks[0].beatport_track_id == 101
        seen_ids = {t.beatport_track_id for t in result}
        assert len(seen_ids) == len(result)


@pytest.mark.integration
@pytest.mark.skipif(
    not _live_token(),
    reason="BEATPORT_ACCESS_TOKEN not set (set it to run discovery against live API)",
)
class TestRunDiscoveryLive:
    """Run discovery against the real Beatport API. Verifies full flow: inventory -> charts + new releases -> dedupe.

    To run with real data (no token in repo):
      Windows:  set BEATPORT_ACCESS_TOKEN=your_token_here
      macOS/Linux:  export BEATPORT_ACCESS_TOKEN=your_token_here
      Then:  pytest src/tests/integration/test_incrate_discovery.py::TestRunDiscoveryLive -v
    """

    def test_run_discovery_live_completes_and_returns_list(self, tmp_path: Path):
        """With real API: import minimal inventory, run discovery with 1 genre, assert no crash and result is list."""
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION>
    <TRACK TrackID="1" Name="Track One" Artist="Test Artist" Label="Defected"/>
  </COLLECTION>
</DJ_PLAYLISTS>"""
        xml_path = tmp_path / "collection.xml"
        xml_path.write_text(xml_content, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        inventory = InventoryService(db_path=db_path)
        inventory.import_from_xml(str(xml_path), enrich=False)
        assert "Defected" in inventory.get_library_labels()

        base_url = os.environ.get(
            "BEATPORT_API_BASE_URL", "https://api.beatport.com/v4"
        )
        client = BeatportApiClient(
            base_url=base_url,
            access_token=_live_token(),
            timeout=30,
        )
        api = BeatportApi(client, cache_service=None)

        genres = api.list_genres()
        genre_ids = [g.id for g in genres[:2]] if genres else [5]

        to_date = date.today()
        from_date = to_date - timedelta(days=31)

        progress_calls = []

        def progress_cb(stage: str, current: int, total: int) -> None:
            progress_calls.append((stage, current, total))

        result = run_discovery(
            inventory,
            api,
            genre_ids=genre_ids,
            charts_from_date=from_date,
            charts_to_date=to_date,
            new_releases_days=30,
            progress_callback=progress_cb,
        )

        assert isinstance(result, list)
        for t in result:
            assert hasattr(t, "beatport_track_id")
            assert hasattr(t, "title")
            assert hasattr(t, "artists")
            assert hasattr(t, "source_type")
            assert t.source_type in ("chart", "label_release")
        seen = {t.beatport_track_id for t in result}
        assert len(seen) == len(result), "result should be deduplicated by track id"

        if progress_calls:
            stages = {p[0] for p in progress_calls}
            assert "charts" in stages or "releases" in stages or "resolving" in stages

    def test_run_discovery_live_resolving_and_releases_phases_run(self, tmp_path: Path):
        """With real API: multiple labels in inventory so resolving + new-releases phases both run."""
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION>
    <TRACK TrackID="1" Name="A" Artist="X" Label="Defected"/>
    <TRACK TrackID="2" Name="B" Artist="Y" Label="Toolroom"/>
  </COLLECTION>
</DJ_PLAYLISTS>"""
        xml_path = tmp_path / "collection.xml"
        xml_path.write_text(xml_content, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        inventory = InventoryService(db_path=db_path)
        inventory.import_from_xml(str(xml_path), enrich=False)
        assert len(inventory.get_library_labels()) >= 1

        base_url = os.environ.get(
            "BEATPORT_API_BASE_URL", "https://api.beatport.com/v4"
        )
        client = BeatportApiClient(
            base_url=base_url, access_token=_live_token(), timeout=30
        )
        api = BeatportApi(client, cache_service=None)

        to_date = date.today()
        from_date = to_date - timedelta(days=31)
        progress_calls = []

        result = run_discovery(
            inventory,
            api,
            genre_ids=[],
            charts_from_date=from_date,
            charts_to_date=to_date,
            new_releases_days=30,
            progress_callback=lambda s, c, t: progress_calls.append((s, c, t)),
        )

        assert isinstance(result, list)
        resolving = [p for p in progress_calls if p[0] == "resolving"]
        releases = [p for p in progress_calls if p[0] == "releases"]
        assert len(resolving) >= 1 or len(releases) >= 1, (
            "resolving or releases progress should be reported"
        )

    def test_run_discovery_live_afro_house_artists_labels(self, tmp_path: Path):
        """Live API: genre Afro House, artists Jimi Jules/Marasi/Diass/Yamil, labels Nothing But/Kompakt."""
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION>
    <TRACK TrackID="1" Name="Track 1" Artist="Jimi Jules" Label="Nothing But"/>
    <TRACK TrackID="2" Name="Track 2" Artist="Marasi" Label="Nothing But"/>
    <TRACK TrackID="3" Name="Track 3" Artist="Diass" Label="Kompakt"/>
    <TRACK TrackID="4" Name="Track 4" Artist="Yamil" Label="Kompakt"/>
  </COLLECTION>
</DJ_PLAYLISTS>"""
        xml_path = tmp_path / "collection.xml"
        xml_path.write_text(xml_content, encoding="utf-8")
        db_path = str(tmp_path / "inventory.sqlite")
        inventory = InventoryService(db_path=db_path)
        inventory.import_from_xml(str(xml_path), enrich=False)

        artists = inventory.get_library_artists()
        labels = inventory.get_library_labels()
        assert "Jimi Jules" in artists
        assert "Marasi" in artists
        assert "Diass" in artists
        assert "Yamil" in artists
        assert "Nothing But" in labels
        assert "Kompakt" in labels

        base_url = os.environ.get(
            "BEATPORT_API_BASE_URL", "https://api.beatport.com/v4"
        )
        client = BeatportApiClient(
            base_url=base_url, access_token=_live_token(), timeout=30
        )
        api = BeatportApi(client, cache_service=None)

        genres = api.list_genres()
        afro_house = next(
            (g for g in genres if g.name and "afro house" in g.name.lower()),
            None,
        )
        assert afro_house is not None, "Beatport API should have genre 'Afro House'"
        genre_ids = [afro_house.id]

        to_date = date.today()
        from_date = to_date - timedelta(days=31)
        progress_calls = []

        result = run_discovery(
            inventory,
            api,
            genre_ids=genre_ids,
            charts_from_date=from_date,
            charts_to_date=to_date,
            new_releases_days=30,
            progress_callback=lambda s, c, t: progress_calls.append((s, c, t)),
        )

        assert isinstance(result, list)
        seen = {t.beatport_track_id for t in result}
        assert len(seen) == len(result)
        chart_tracks = [t for t in result if t.source_type == "chart"]
        release_tracks = [t for t in result if t.source_type == "label_release"]
        assert len(progress_calls) >= 1

        # Print results so you can see what discovery pulled (visible with -s or when test fails)
        print(
            "\n--- Discovery results (Afro House, artists: Jimi Jules/Marasi/Diass/Yamil, labels: Nothing But/Kompakt) ---"
        )
        print(
            f"Total tracks: {len(result)} (charts: {len(chart_tracks)}, label_release: {len(release_tracks)})"
        )
        for i, t in enumerate(result[:50], 1):
            line = f"  {i}. [{t.source_type}] {t.title} — {t.artists} ({t.source_name})"
            try:
                print(line)
            except UnicodeEncodeError:
                print(line.encode("ascii", errors="replace").decode("ascii"))
        if len(result) > 50:
            print(f"  ... and {len(result) - 50} more")
        # If 0 results, print API diagnostics
        if len(result) == 0:
            print("Diagnostics (0 results):")
            try:
                charts = api.list_charts(genre_ids[0], from_date, to_date, limit=50)
                print(f"  list_charts(Afro House): {len(charts)} charts")
                charts_all = api.list_charts(0, from_date, to_date, limit=200)
                print(
                    f"  list_charts(0 = all): {len(charts_all)} charts, 881292 in list: {881292 in [c.id for c in (charts_all or [])]}"
                )
            except Exception as e:
                print(f"  list_charts error: {e}")
            try:
                label_id = api.search_label_by_name("Nothing But")
                print(f"  search_label_by_name('Nothing But'): {label_id}")
                if label_id:
                    rels = api.get_label_releases(label_id, from_date, to_date)
                    print(
                        f"  get_label_releases({label_id}): {len(rels)} releases, {sum(len(r.tracks) for r in rels)} tracks"
                    )
                rels43219 = api.get_label_releases(43219, from_date, to_date)
                print(
                    f"  get_label_releases(43219): {len(rels43219)} releases, {sum(len(r.tracks) for r in rels43219)} tracks"
                )
            except Exception as e:
                print(f"  label lookup/releases error: {e}")
            try:
                detail = api.get_chart(881292)
                print(
                    f"  get_chart(881292) Yamil: {detail.name if detail else None} tracks={len(detail.tracks) if detail else 0}"
                )
            except Exception as e:
                print(f"  get_chart(881292) error: {e}")
        print("---")
