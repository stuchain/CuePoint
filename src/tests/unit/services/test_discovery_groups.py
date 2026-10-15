#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A dig's results grouped as cards: where each track came from.

The rule that decides row one (charts the chosen artists made, or, with none
chosen, the genres' general charts), the cards a run keeps (charts, artists,
labels) with their counts, and what ticking cards means (merged tracks, owned
counted). Runs over the real service and database, with the in-memory
Beatport of ``test_discovery_service``; no test reaches the network.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Dict, List, Tuple

import pytest

from cuepoint.models.discovery_run import (
    CHARTS_ARTISTS,
    CHARTS_GENRE,
    CHARTS_LIBRARY,
    GROUP_ARTIST,
    GROUP_CHART,
    GROUP_LABEL,
    OWNED_ALL,
    OWNED_HIDE,
    OWNED_ONLY,
)
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.services.discovery_service import (
    charts_mode,
)
from tests.fixtures.beatport_library import accept
from tests.fixtures.beatport_world import BeatportWorld, Chart
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_discovery_service import (
    LIBRARY,
    MARA,
    NIGHTFALL,
    TODAY,
    add_library,
    make,
    request,
    searches,
    standard_world,
)

pytestmark = pytest.mark.unit

#: An artist on no Beatport track, chart or search: nothing of theirs is found.
GHOST = "Ghost Artist"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def library(db):
    return add_library(db, [*LIBRARY, ("Four", GHOST, "Nightfall Audio")])


@pytest.fixture
def world():
    return standard_world()


ART = "https://geo-media.beatport.com/image_size/{w}x{h}/%s.jpg"


def cards(db, run_id) -> Dict[Tuple[str, str], Tuple[int, int, int, int]]:
    """Every card as ``(kind, key) -> (tracks, owned, charts, new)``."""
    return {
        (c.group.kind, c.group.key): (c.tracks, c.owned, c.charts, c.new)
        for c in DiscoveryRepository(db).run_groups(run_id)
    }


class TestTheRuleThatDecidesRowOne:
    def test_with_artists_chosen_the_charts_are_theirs(self, db, library, world):
        service = make(db, world)
        assert charts_mode(request(service, artists=["Mara Veil"])) == CHARTS_ARTISTS

    def test_with_none_chosen_they_are_the_genres_general_charts(
        self, db, library, world
    ):
        service = make(db, world)
        assert charts_mode(request(service, artists=[])) == CHARTS_GENRE

    def test_every_artist_keeps_the_charts_any_library_artist_made(
        self, db, library, world
    ):
        service = make(db, world)
        assert charts_mode(request(service)) == CHARTS_LIBRARY

    def test_artists_chosen_means_no_general_genre_chart(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        charts = {k for kind, k in cards(db, run.id) if kind == GROUP_CHART}
        # C1 is hers; C3 (Kiko's account), C4 (a stranger) are general charts.
        assert charts == {"1"}
        assert run.params["charts_mode"] == CHARTS_ARTISTS

    def test_with_none_chosen_every_chart_in_the_genres_counts(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, artists=[], labels=[]))
        found = cards(db, run.id)
        charts = {k for kind, k in found if kind == GROUP_CHART}
        assert charts == {"1", "2", "3", "4"}  # not the 60-day-old C5, nor genre 7
        assert not [k for kind, k in found if kind == GROUP_ARTIST]
        assert run.params["charts_mode"] == CHARTS_GENRE
        # Their reasons name who made them, and no library artist owns them.
        stored = DiscoveryRepository(db).run_groups(run.id)
        assert all(c.group.owner_key is None for c in stored)
        assert {c.group.key: c.group.curator for c in stored}["2"] == "DJEFF"

    def test_every_genre_chart_in_the_dates_is_read(self, db, library, world):
        service = make(db, world)
        before = service.run(request(service, genre_ids=[12], artists=[], labels=[]))
        for n in range(60):
            world.add_chart(
                Chart(
                    100 + n, f"Extra {n}", (12,), TODAY - timedelta(days=n % 20), (1,)
                )
            )
        run = service.run(request(service, genre_ids=[12], artists=[], labels=[]))
        assert run.charts_read == before.charts_read + 60
        assert service.run_notes(run.id) == []


class TestTheCards:
    def test_a_chosen_artist_is_a_card_with_her_charts_and_new_releases(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        found = cards(db, run.id)
        # Chart 1 (tracks 1, 2, 3) is hers; track 7 is her release on Nightfall.
        assert found[(GROUP_CHART, "1")][0] == 3
        assert found[(GROUP_ARTIST, "mara veil")] == (4, 0, 1, 1)

    def test_a_chosen_artist_beatport_does_not_know_is_still_a_card(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, artists=[GHOST], labels=[]))
        assert cards(db, run.id)[(GROUP_ARTIST, "ghost artist")] == (0, 0, 0, 0)
        assert searches(world) == 1  # asked once, and the answer kept
        service.run(request(service, artists=[GHOST], labels=[]))
        assert searches(world) == 1

    def test_an_artist_found_by_a_chart_is_not_searched_for(self, db, library, world):
        service = make(db, world)
        service.run(request(service, artists=["Mara Veil"], labels=[]))
        assert searches(world) == 0

    def test_an_artists_new_releases_are_in_the_chosen_genres_and_days(
        self, db, library, world
    ):
        world.add_track(
            40, TODAY - timedelta(days=3), (1, "Elsewhere"), (740, "X"), [MARA]
        )
        world.add_track(
            41, TODAY - timedelta(days=200), (1, "Elsewhere"), (741, "Y"), [MARA]
        )
        service = make(db, world)
        run = service.run(
            request(service, artists=["Mara Veil"], labels=[], new_releases_days=30)
        )
        assert cards(db, run.id)[(GROUP_ARTIST, "mara veil")][3] == 2  # 7 and 40

    def test_a_label_is_a_card_of_its_new_releases_in_the_chosen_genres(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, artists=[], labels=["Nightfall Audio"]))
        # Releases 700 (tracks 7, 8) and 701 (track 2); 702 is 90 days old.
        assert cards(db, run.id)[(GROUP_LABEL, "nightfall audio")] == (3, 0, 0, 3)

    def test_a_label_with_nothing_in_the_genres_is_an_empty_card(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(
            request(service, genre_ids=[6], artists=[], labels=["Nightfall Audio"])
        )
        assert cards(db, run.id)[(GROUP_LABEL, "nightfall audio")] == (0, 0, 0, 0)

    def test_labels_make_no_charts(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=["Cold Room"]))
        owners = {
            c.group.key: c.group.owner_key
            for c in DiscoveryRepository(db).run_groups(run.id)
            if c.group.kind == GROUP_CHART
        }
        assert owners == {"1": "mara veil"}

    def test_every_artist_makes_a_card_for_each_who_made_a_chart(
        self, db, library, world
    ):
        service = make(db, world)
        run = service.run(request(service, labels=[]))
        artist_cards = {k for kind, k in cards(db, run.id) if kind == GROUP_ARTIST}
        assert artist_cards == {"mara veil", "djeff", "kiko"}
        assert run.params["charts_mode"] == CHARTS_LIBRARY

    def test_a_cards_picture_is_kept_and_never_sent_as_a_url(self, db, library, world):
        world.images[("chart", 1)] = ART % "chart1"
        world.images[("artist", MARA[0])] = ART % "mara"
        world.images[("label", NIGHTFALL[0])] = ART % "label"
        service = make(db, world)
        run = service.run(
            request(service, artists=["Mara Veil"], labels=["Nightfall Audio"])
        )
        repo = DiscoveryRepository(db)
        assert repo.group_art(run.id, GROUP_CHART, "1") == ART % "chart1"
        assert repo.group_art(run.id, GROUP_ARTIST, "mara veil") == ART % "mara"
        assert repo.group_art(run.id, GROUP_LABEL, "nightfall audio") == ART % "label"
        sent = [c.to_dict() for c in repo.run_groups(run.id)]
        assert all(c["has_art"] for c in sent)
        assert not any("art_url" in c or "http" in str(c) for c in sent)

    def test_a_picture_not_on_beatports_hosts_is_not_kept(self, db, library, world):
        world.images[("chart", 1)] = "https://evil.example/x.jpg"
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        assert DiscoveryRepository(db).group_art(run.id, GROUP_CHART, "1") is None

    def test_cards_keep_the_order_they_were_found_in(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil", "Kiko"], labels=[]))
        order = [
            (c.group.kind, c.group.key)
            for c in DiscoveryRepository(db).run_groups(run.id)
        ]
        assert order[:2] == [(GROUP_ARTIST, "kiko"), (GROUP_ARTIST, "mara veil")]


class TestPicturesAndLimits:
    def test_a_run_asks_for_no_picture_of_its_own(self, db, library, world):
        world.images[("artist", MARA[0])] = ART % "mara"
        world.images[("label", NIGHTFALL[0])] = ART % "label"
        world.no_credit_images = {("artist", MARA[0]), ("label", NIGHTFALL[0])}
        service = make(db, world)
        run = service.run(
            request(service, artists=["Mara Veil"], labels=["Nightfall Audio"])
        )
        assert world.paths("catalog/artists") == []
        assert world.paths("catalog/labels/") == [] or all(
            p == "catalog/labels" for p in world.paths("catalog/labels")
        )
        repo = DiscoveryRepository(db)
        assert repo.group_art(run.id, GROUP_ARTIST, "mara veil") is None

    def test_a_card_nothing_named_a_picture_for_is_asked_once_when_looked_at(
        self, db, library, world
    ):
        world.images[("artist", MARA[0])] = ART % "mara"
        world.images[("label", NIGHTFALL[0])] = ART % "label"
        world.no_credit_images = {("artist", MARA[0]), ("label", NIGHTFALL[0])}
        service = make(db, world)
        run = service.run(
            request(service, artists=["Mara Veil"], labels=["Nightfall Audio"])
        )
        assert service.group_art_url(run.id, GROUP_ARTIST, "mara veil") == ART % "mara"
        assert service.group_art_url(run.id, GROUP_ARTIST, "mara veil") == ART % "mara"
        assert len(world.paths(f"catalog/artists/{MARA[0]}")) == 1
        assert (
            service.group_art_url(run.id, GROUP_LABEL, "nightfall audio")
            == ART % "label"
        )
        # A chart has no id to ask by, and nothing to ask for.
        assert service.group_art_url(run.id, GROUP_CHART, "1") is None

    def test_a_long_artist_list_is_cut_and_the_run_says_so(
        self, db, library, world, monkeypatch
    ):
        from cuepoint.services import discovery_service

        monkeypatch.setattr(discovery_service, "MAX_PICKED_ARTISTS", 1)
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil", "Kiko"], labels=[]))
        assert run.artists_in_scope == 1
        (note,) = service.run_notes(run.id)
        assert "first 1 of the 2 artists" in note

    def test_a_run_under_the_artist_limit_says_nothing(self, db, library, world):
        service = make(db, world)
        run = service.run(request(service, artists=["Mara Veil"], labels=[]))
        assert service.run_notes(run.id) == []


class TestTickingCards:
    def run_of(self, db, world):
        service = make(db, world)
        run = service.run(
            request(service, artists=["Mara Veil"], labels=["Nightfall Audio"])
        )
        return service, run

    def ids(self, page) -> List[int]:
        return [row.track.beatport_track_id for row in page.rows]

    def test_a_cards_tracks_open_with_their_reasons(self, db, library, world):
        service, run = self.run_of(db, world)
        page = service.group_tracks(
            run.id, [(GROUP_ARTIST, "mara veil")], OWNED_ALL, limit=50
        )
        assert sorted(self.ids(page)) == [1, 2, 3, 7]
        assert (page.total, page.tracks) == (4, 4)

    def test_ticked_cards_merge_their_tracks(self, db, library, world):
        service, run = self.run_of(db, world)
        both = [(GROUP_ARTIST, "mara veil"), (GROUP_LABEL, "nightfall audio")]
        # Mara: 1, 2, 3, 7. Nightfall: 7, 8, 2. Union: 1, 2, 3, 7, 8.
        assert service.group_selection(run.id, both).tracks == 5
        assert sorted(service.group_track_ids(run.id, both)) == [1, 2, 3, 7, 8]
        assert service.group_selection(run.id, both[:1]).tracks == 4

    def test_owned_tracks_are_counted_and_can_be_left_out(self, db, library, world):
        with db.transaction() as conn:
            accept(conn, library[0], "3")
            accept(conn, library[2], "7")
        service, run = self.run_of(db, world)
        both = [(GROUP_ARTIST, "mara veil"), (GROUP_LABEL, "nightfall audio")]
        selection = service.group_selection(run.id, both)
        assert (selection.tracks, selection.owned) == (5, 2)
        assert sorted(service.group_track_ids(run.id, both, OWNED_HIDE)) == [1, 2, 8]
        page = service.group_tracks(run.id, both, OWNED_ONLY, limit=50)
        assert sorted(self.ids(page)) == [3, 7]
        card = {(c.group.kind, c.group.key): c for c in service.run_groups(run.id)}[
            (GROUP_ARTIST, "mara veil")
        ]
        assert (card.tracks, card.owned) == (4, 2)

    def test_many_cards_are_one_query_and_too_many_are_refused(
        self, db, library, world
    ):
        service, run = self.run_of(db, world)
        real = [(GROUP_ARTIST, "mara veil"), (GROUP_LABEL, "nightfall audio")]
        many = real + [(GROUP_CHART, f"none{i}") for i in range(498)]
        assert len(many) == 500
        assert service.group_selection(run.id, many).tracks == 5
        with pytest.raises(ValueError):
            service.group_selection(run.id, many + [(GROUP_CHART, "one-more")])

    def test_a_card_that_is_not_one_is_refused(self, db, library, world):
        service, run = self.run_of(db, world)
        with pytest.raises(ValueError):
            service.group_selection(run.id, [("playlist", "x")])
        with pytest.raises(ValueError):
            service.group_selection(run.id, [])
        with pytest.raises(LookupError):
            service.group_selection(999, [(GROUP_LABEL, "x")])

    def test_a_card_nothing_was_found_for_holds_nothing(self, db, library, world):
        service, run = self.run_of(db, world)
        assert service.group_selection(run.id, [(GROUP_LABEL, "nobody")]).tracks == 0


class TestARunStoredBeforeGroups:
    def test_it_has_no_cards_and_reads_as_one_list(self, db, library, world):
        from cuepoint.models.discovery_run import DiscoveryRun

        service = make(db, world)
        repo = DiscoveryRepository(db)
        run = repo.start_run(
            DiscoveryRun(started_at="2026-01-01T00:00:00+00:00", params_json="{}")
        )
        assert service.run_groups(run.id) == []
        assert service.run_tracks(run.id).total == 0


class TestTheBeatportCalls:
    def test_an_artist_is_searched_by_exact_name_only(self, world):
        from cuepoint.services.beatport_api import BeatportApi

        api = BeatportApi(world)
        assert api.search_artist_by_name("Mara Veil") == MARA[0]
        assert api.search_artist_by_name("Mara") is None
        assert api.search_artist_by_name("  ") is None

    def test_my_playlists_lists_id_and_name(self):
        from cuepoint.services.beatport_api import BeatportApi

        world = BeatportWorld()
        world.add_track(1, TODAY, (1, "L"), (1, "R"))
        api = BeatportApi(world)
        first = api.create_playlist("Friday")
        assert api.my_playlists() == [(first, "Friday")]

    def test_a_picture_is_read_from_the_image_object_or_not_at_all(self):
        from cuepoint.services.beatport_catalog import (
            parse_catalog_artist,
            parse_catalog_chart,
        )

        good = {"id": 5, "name": "A", "image": {"dynamic_uri": ART % "x"}}
        assert parse_catalog_artist(good).image_url == ART % "x"
        assert parse_catalog_artist({"id": 5, "name": "A"}).image_url is None
        foreign = {"id": 5, "name": "A", "image": {"uri": "https://evil.example/a.jpg"}}
        assert parse_catalog_artist(foreign).image_url is None
        chart = {"id": 9, "name": "C", "image": {"uri": ART % "y"}}
        assert parse_catalog_chart(chart).image_url == ART % "y"


class TestThePicturesBeatportRecorded:
    """The recorded v4 answers (src/tests/fixtures/beatport_v4) name a picture."""

    def load(self, name):
        import json
        from pathlib import Path

        path = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4" / name
        return json.loads(path.read_text(encoding="utf-8"))

    def test_an_artist_a_label_and_a_chart_each_carry_one(self):
        from cuepoint.services.beatport_catalog import (
            parse_catalog_artist,
            parse_catalog_chart,
            parse_catalog_label,
        )

        host = "https://geo-media.beatport.com/image_size/{w}x{h}/"
        assert (
            parse_catalog_artist(self.load("artist.json")).image_url
            == host + "301001.jpg"
        )
        assert parse_catalog_label(self.load("label.json")).image_url == host + "l.jpg"
        assert parse_catalog_chart(self.load("chart.json")).image_url == host + "c.jpg"
