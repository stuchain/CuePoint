"""DISCOVER-01: the Beatport v4 catalog parsers and the ``BeatportApi`` methods on them.

The parsers are held to ``src/tests/fixtures/beatport_v4/`` two ways. The value
tests read the reconstructed files, which carry the cases a recording cannot be
relied on to contain. The agreement tests run over every fixture, including any
recording in ``recorded/``, and check that what the parser kept is exactly what
the raw JSON says. No test reaches the network: the API is a fake that answers
from those files.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.incrate.beatport_api_models import (
    CatalogArtist,
    CatalogLabel,
    CatalogTrack,
    ChartTrack,
    LabelReleaseTrack,
)
from cuepoint.services.beatport_api import (
    MAX_LISTING_PAGES,
    PLAYLIST_WEB_BASE,
    TRACK_BATCH_SIZE,
    BeatportApi,
)
from cuepoint.services.beatport_catalog import (
    MAX_CREDITS,
    MAX_TEXT_LENGTH,
    catalog_key,
    chart_owner_name,
    page_items,
    parse_catalog_artist,
    parse_catalog_label,
    parse_catalog_track,
    positive_id,
    track_web_url,
)
from cuepoint.services.override_values import parse_key

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


Route = Any


class FakeClient:
    """Answers ``get`` and ``post`` from a table of paths, and records every call."""

    def __init__(
        self,
        routes: Optional[Dict[str, Route]] = None,
        posts: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.routes = routes or {}
        self.post_answers = posts or {}
        self.calls: List[Tuple[str, Dict[str, Any]]] = []
        self.posts: List[Tuple[str, Any]] = []

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        asked = dict(params or {})
        self.calls.append((path, asked))
        route = self.routes.get(path)
        if isinstance(route, Exception):
            raise route
        if callable(route):
            return route(asked)
        return copy.deepcopy(route)

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        self.posts.append((path, json))
        answer = self.post_answers.get(path)
        if isinstance(answer, Exception):
            raise answer
        return copy.deepcopy(answer)


def api_with(**routes: Route) -> Tuple[BeatportApi, FakeClient]:
    client = FakeClient({k.replace("__", "/"): v for k, v in routes.items()})
    return BeatportApi(client, cache_service=None), client  # type: ignore[arg-type]


def listing(results: List[Any], has_next: bool = False) -> Dict[str, Any]:
    return {
        "count": len(results),
        "next": "https://api.beatport.com/v4/next" if has_next else None,
        "previous": None,
        "page": "1/1",
        "per_page": 100,
        "results": results,
    }


def raw_track(
    track_id: int, name: str = "T", day: str = "2026-09-01", **extra: Any
) -> Dict[str, Any]:
    body = {
        "id": track_id,
        "name": name,
        "slug": "t",
        "artists": [{"id": 1, "name": "A"}],
        "publish_date": day,
        "new_release_date": day,
    }
    body.update(extra)
    return body


# --- Value tests over the reconstructed fixtures ------------------------------


class TestParseCatalogTrack:
    def test_two_artists_and_a_remixer_keep_their_ids_in_order(self) -> None:
        track = parse_catalog_track(load("track.json"))
        assert track is not None
        assert track.artists == (
            CatalogArtist(301001, "Mara Veil"),
            CatalogArtist(301002, "Óscar Lindqvist"),
        )
        assert track.remixers == (CatalogArtist(301003, "Dub Phizix Jr"),)

    def test_every_field_is_read(self) -> None:
        track = parse_catalog_track(load("track.json"))
        assert track == CatalogTrack(
            id=19000001,
            title="Lantern Signal",
            mix_name="Dub Phizix Jr Remix",
            url="https://www.beatport.com/track/lantern-signal/19000001",
            artists=track.artists if track else (),
            remixers=track.remixers if track else (),
            label_id=40211,
            label_name="Nightfall Audio",
            release_id=4500001,
            release_name="Lantern Signal EP",
            release_date="2026-08-14",
            bpm=124.0,
            key="Ebm",
            genre_id=5,
            genre_name="House",
        )

    def test_url_is_the_website_never_the_api(self) -> None:
        track = parse_catalog_track(load("track.json"))
        assert track is not None
        assert track.url.startswith("https://www.beatport.com/track/")
        assert "api.beatport.com" not in track.url

    def test_no_key_and_no_bpm_are_none_not_guesses(self) -> None:
        track = parse_catalog_track(load("track_no_key_no_bpm.json"))
        assert track is not None
        assert track.key is None
        assert track.bpm is None
        assert track.genre_name == "Dubstep"
        assert track.remixers == ()

    def test_a_release_with_no_label_leaves_the_label_empty(self) -> None:
        items, _ = page_items(load("release_tracks.json"))
        track = parse_catalog_track(items[0])
        assert track is not None
        assert track.label_id is None
        assert track.label_name is None
        assert track.release_id == 4500020
        assert track.release_name == "White Label 001"

    def test_needs_an_id_and_a_name(self) -> None:
        assert parse_catalog_track({"id": 5}) is None
        assert parse_catalog_track({"name": "No id"}) is None
        assert parse_catalog_track({"id": 0, "name": "Zero"}) is None
        assert parse_catalog_track({"id": True, "name": "Bool"}) is None
        assert parse_catalog_track(None) is None
        assert parse_catalog_track(["not", "a", "track"]) is None

    def test_fields_of_the_wrong_type_are_dropped_not_trusted(self) -> None:
        track = parse_catalog_track(
            {
                "id": "123",
                "name": "Typed",
                "artists": "A, B",
                "remixers": [
                    {"id": "x", "name": "Bad"},
                    "text",
                    {"id": 9, "name": "Ok"},
                ],
                "release": "not an object",
                "genre": [],
                "bpm": "128",
                "key": "8A",
                "publish_date": 20260101,
            }
        )
        assert track is not None
        assert track.id == 123
        assert track.artists == ()
        assert track.remixers == (CatalogArtist(9, "Ok"),)
        assert track.release_id is None and track.label_id is None
        assert track.genre_id is None
        assert track.bpm is None
        assert track.key is None
        assert track.release_date is None

    def test_strings_and_credit_lists_are_bounded(self) -> None:
        long_name = "x" * (MAX_TEXT_LENGTH * 3)
        crowd = [{"id": i, "name": f"A{i}"} for i in range(1, MAX_CREDITS + 40)]
        track = parse_catalog_track({"id": 1, "name": long_name, "artists": crowd})
        assert track is not None
        assert len(track.title) == MAX_TEXT_LENGTH
        assert len(track.artists) == MAX_CREDITS

    def test_release_date_prefers_the_store_date(self) -> None:
        track = parse_catalog_track(
            {
                "id": 1,
                "name": "T",
                "new_release_date": "2026-05-01",
                "publish_date": "2026-04-28T00:00:00-06:00",
            }
        )
        assert track is not None and track.release_date == "2026-05-01"
        only_publish = parse_catalog_track(
            {"id": 1, "name": "T", "publish_date": "2026-04-28T00:00:00-06:00"}
        )
        assert only_publish is not None and only_publish.release_date == "2026-04-28"

    def test_impossible_tempo_is_none(self) -> None:
        for bpm in (0, -5, 5000, float("nan")):
            track = parse_catalog_track({"id": 1, "name": "T", "bpm": bpm})
            assert track is not None and track.bpm is None


class TestCatalogKey:
    @pytest.mark.parametrize(
        ("key", "expected"),
        [
            ({"name": "Eb Minor", "camelot_number": 2, "camelot_letter": "A"}, "Ebm"),
            ({"name": "F# Major", "camelot_number": 2, "camelot_letter": "B"}, "F#"),
            ({"camelot_number": 8, "camelot_letter": "A"}, "Am"),
            ({"name": "A Minor"}, "Am"),
            ({"name": "A min"}, "Am"),
            ({"name": "G♭ Major"}, "F#"),
            ({"name": "C♯ Minor"}, "C#m"),
        ],
    )
    def test_is_classic_notation(self, key: Dict[str, Any], expected: str) -> None:
        assert catalog_key(key) == expected

    def test_camelot_wins_over_the_name(self) -> None:
        assert (
            catalog_key({"name": "C Major", "camelot_number": 8, "camelot_letter": "A"})
            == "Am"
        )

    def test_a_bad_camelot_falls_back_to_the_name(self) -> None:
        assert (
            catalog_key(
                {"name": "A Minor", "camelot_number": 99, "camelot_letter": "Z"}
            )
            == "Am"
        )

    @pytest.mark.parametrize(
        "key",
        [
            None,
            "8A",
            {},
            {"name": "Nonsense"},
            {"camelot_number": True, "camelot_letter": "A"},
        ],
    )
    def test_anything_else_is_none(self, key: Any) -> None:
        assert catalog_key(key) is None


class TestSmallParsers:
    def test_artist_and_label(self) -> None:
        assert parse_catalog_artist(load("artist.json")) == CatalogArtist(
            301001, "Mara Veil"
        )
        assert parse_catalog_label(load("label.json")) == CatalogLabel(
            40211, "Nightfall Audio"
        )
        assert parse_catalog_artist({"id": 1, "name": "   "}) is None
        assert parse_catalog_label({"id": -1, "name": "L"}) is None

    def test_positive_id(self) -> None:
        assert positive_id(7) == 7
        assert positive_id(" 42 ") == 42
        for bad in (0, -3, True, False, 1.5, "4a", "", None, [1]):
            assert positive_id(bad) is None

    def test_track_web_url_only_trusts_a_plain_slug(self) -> None:
        assert track_web_url(5, "a-b-c") == "https://www.beatport.com/track/a-b-c/5"
        for slug in ("../../x", "A B", "", None, "a/b", "été"):
            assert track_web_url(5, slug) == "https://www.beatport.com/track/t/5"

    def test_page_items(self) -> None:
        items, has_next = page_items(load("artist_tracks_page1.json"))
        assert [item["id"] for item in items] == [19000010, 19000011]
        assert has_next is True
        items, has_next = page_items(load("artist_tracks_page2.json"))
        assert len(items) == 2 and has_next is False
        assert page_items([{"id": 1}]) == ([], False)
        assert page_items({"results": "nope"}) == ([], False)
        assert page_items({"results": [1, {"id": 2}], "next": None}) == (
            [{"id": 2}],
            False,
        )

    def test_chart_owner_name(self) -> None:
        assert chart_owner_name(load("chart.json")) == "Mara Veil"
        assert chart_owner_name({"person": "someone"}) == ""
        assert chart_owner_name(None) == ""


# --- Agreement tests over every fixture, recorded ones included -----------------


def _all_fixtures() -> List[Path]:
    return sorted(FIXTURES.glob("*.json")) + sorted(FIXTURES.glob("recorded/*.json"))


def _raw_tracks(name: str, body: Any) -> List[Dict[str, Any]]:
    """The raw track objects a fixture holds, by what its name says it is."""
    if (
        name.startswith("track")
        and not name.startswith("tracks")
        and isinstance(body, dict)
    ):
        return [body]
    if any(part in name for part in ("tracks", "chart_tracks", "release_tracks")):
        items, _ = page_items(body)
        return items
    return []


def _expected_key(raw: Any) -> Optional[Tuple[int, bool]]:
    if not isinstance(raw, dict):
        return None
    number, letter = raw.get("camelot_number"), raw.get("camelot_letter")
    if isinstance(number, int) and isinstance(letter, str):
        parsed = parse_key(f"{number}{letter}")
        if parsed is not None:
            return parsed
    name = raw.get("name")
    return parse_key(name) if isinstance(name, str) else None


def _assert_track_agrees(raw: Dict[str, Any], track: Optional[CatalogTrack]) -> None:
    assert track is not None, f"track {raw.get('id')} did not parse"
    assert track.id == raw["id"]
    assert track.title == raw["name"].strip()
    assert track.mix_name == (raw.get("mix_name") or "").strip()
    assert [a.id for a in track.artists] == [a["id"] for a in raw.get("artists") or []]
    assert [a.name for a in track.artists] == [
        a["name"].strip() for a in raw.get("artists") or []
    ]
    assert [a.id for a in track.remixers] == [
        a["id"] for a in raw.get("remixers") or []
    ]
    release = raw.get("release") or {}
    label = release.get("label") or {}
    assert track.release_id == release.get("id")
    assert track.label_id == label.get("id")
    assert track.label_name == (label.get("name") or None)
    genre = raw.get("genre") or {}
    assert track.genre_id == genre.get("id")
    assert track.bpm == (float(raw["bpm"]) if raw.get("bpm") else None)
    expected_key = _expected_key(raw.get("key"))
    assert (parse_key(track.key) if track.key else None) == expected_key
    assert track.url.startswith("https://www.beatport.com/track/")
    assert track.url.endswith(f"/{raw['id']}")


@pytest.mark.parametrize(
    "path", _all_fixtures(), ids=lambda p: p.relative_to(FIXTURES).as_posix()
)
def test_parsers_agree_with_the_raw_json(path: Path) -> None:
    body = json.loads(path.read_text(encoding="utf-8"))
    name = path.name
    for raw in _raw_tracks(name, body):
        _assert_track_agrees(raw, parse_catalog_track(raw))
    if name == "artist.json":
        artist = parse_catalog_artist(body)
        assert artist is not None and (artist.id, artist.name) == (
            body["id"],
            body["name"].strip(),
        )
    if name == "label.json":
        label = parse_catalog_label(body)
        assert label is not None and (label.id, label.name) == (
            body["id"],
            body["name"].strip(),
        )
    if name == "chart.json":
        assert (
            chart_owner_name(body)
            == (body.get("person") or {}).get("owner_name", "").strip()
        )
    if name.endswith("_page.json") or name.startswith(
        ("artist_tracks", "chart_tracks", "tracks_by_id")
    ):
        assert set(body) >= {"next", "results"}, "a listing lost its pagination fields"


def test_every_listing_fixture_is_covered() -> None:
    """A fixture the agreement test does not recognise is one nothing checks."""
    known = {
        "artist.json",
        "artist_tracks_page1.json",
        "artist_tracks_page2.json",
        "chart.json",
        "chart_tracks.json",
        "charts_page.json",
        "error_unauthenticated.json",
        "label.json",
        "label_releases.json",
        "playlist_created.json",
        "release_tracks.json",
        "track.json",
        "track_no_key_no_bpm.json",
        "tracks_by_id.json",
    }
    assert {p.name for p in FIXTURES.glob("*.json")} == known


# --- BeatportApi methods over a fake API ----------------------------------------


class TestGetTrackArtistLabel:
    def test_get_track_asks_the_path_with_its_slash(self) -> None:
        api, client = api_with(**{"/catalog/tracks/19000001/": load("track.json")})
        track = api.get_track(19000001)
        assert track is not None and track.id == 19000001
        assert client.calls == [("/catalog/tracks/19000001/", {})]

    def test_not_found_is_none(self) -> None:
        api, _ = api_with()
        assert api.get_track(5) is None
        assert api.get_artist(5) is None
        assert api.get_label(5) is None

    def test_an_invalid_id_makes_no_request(self) -> None:
        api, client = api_with()
        assert api.get_track(0) is None
        assert api.get_artist(-1) is None
        assert api.get_label("x") is None  # type: ignore[arg-type]
        assert client.calls == []

    def test_artist_and_label(self) -> None:
        api, client = api_with(
            **{
                "/catalog/artists/301001/": load("artist.json"),
                "/catalog/labels/40211/": load("label.json"),
            }
        )
        assert api.get_artist(301001) == CatalogArtist(301001, "Mara Veil")
        assert api.get_label(40211) == CatalogLabel(40211, "Nightfall Audio")
        assert [c[0] for c in client.calls] == [
            "/catalog/artists/301001/",
            "/catalog/labels/40211/",
        ]

    def test_errors_are_raised_for_the_caller_to_classify(self) -> None:
        api, _ = api_with(
            **{"/catalog/tracks/1/": BeatportAPIError("no", status_code=401)}
        )
        with pytest.raises(BeatportAPIError):
            api.get_track(1)


def _by_id_route(
    catalog: Dict[int, Dict[str, Any]], behave: str = "applied"
) -> Callable[[Dict[str, Any]], Any]:
    """A ``catalog/tracks/`` that answers ``id=a,b`` as the named behaviour does."""

    def answer(params: Dict[str, Any]) -> Any:
        ids = [int(x) for x in str(params.get("id", "")).split(",") if x]
        if behave == "ignored":
            return listing([catalog[k] for k in sorted(catalog)][:3])
        if behave == "first_only":
            return listing([catalog[ids[0]]] if ids and ids[0] in catalog else [])
        if behave == "refused":
            raise BeatportAPIError("bad filter", status_code=400)
        return listing([catalog[i] for i in ids if i in catalog])

    return answer


def _single_routes(catalog: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    return {f"/catalog/tracks/{tid}/": body for tid, body in catalog.items()}


class TestGetTracks:
    catalog = {i: raw_track(i, f"T{i}") for i in range(1, 8)}

    def _api(self, behave: str) -> Tuple[BeatportApi, FakeClient]:
        routes: Dict[str, Any] = {
            "/catalog/tracks/": _by_id_route(self.catalog, behave)
        }
        routes.update(_single_routes(self.catalog))
        client = FakeClient(routes)
        return BeatportApi(client, cache_service=None), client  # type: ignore[arg-type]

    def test_one_batched_request_answers_in_the_order_asked(self) -> None:
        api, client = self._api("applied")
        tracks = api.get_tracks([3, 1, 2])
        assert [t.id for t in tracks] == [3, 1, 2]
        assert client.calls == [("/catalog/tracks/", {"id": "3,1,2", "per_page": 3})]

    def test_duplicates_and_invalid_ids_are_dropped_and_missing_left_out(self) -> None:
        api, client = self._api("applied")
        tracks = api.get_tracks([2, 2, 0, -4, 99, 1])
        assert [t.id for t in tracks] == [2, 1]
        assert client.calls[0] == ("/catalog/tracks/", {"id": "2,99,1", "per_page": 3})
        # 99 was missing from an unconfirmed batch, so one single lookup checked it.
        assert client.calls[1] == ("/catalog/tracks/99/", {})
        assert len(client.calls) == 2

    def test_a_filter_that_is_ignored_falls_back_to_one_request_per_track(self) -> None:
        api, client = self._api("ignored")
        tracks = api.get_tracks([5, 6])
        assert [t.id for t in tracks] == [5, 6]
        assert [c[0] for c in client.calls] == [
            "/catalog/tracks/",
            "/catalog/tracks/5/",
            "/catalog/tracks/6/",
        ]
        client.calls.clear()
        api.get_tracks([1, 2])
        assert [c[0] for c in client.calls] == [
            "/catalog/tracks/1/",
            "/catalog/tracks/2/",
        ]

    def test_a_filter_that_leaves_out_a_track_it_has_is_not_trusted(self) -> None:
        api, client = self._api("first_only")
        tracks = api.get_tracks([4, 5, 6])
        assert [t.id for t in tracks] == [4, 5, 6]
        assert api._batch_lookup is False

    def test_a_filter_refused_with_400_falls_back(self) -> None:
        api, _ = self._api("refused")
        assert [t.id for t in api.get_tracks([1, 2])] == [1, 2]
        assert api._batch_lookup is False

    def test_a_confirmed_filter_is_trusted_for_missing_tracks(self) -> None:
        api, client = self._api("applied")
        api.get_tracks([1, 2])
        assert api._batch_lookup is True
        client.calls.clear()
        assert [t.id for t in api.get_tracks([3, 99])] == [3]
        assert client.calls == [("/catalog/tracks/", {"id": "3,99", "per_page": 2})]

    def test_a_single_id_is_one_single_lookup(self) -> None:
        api, client = self._api("applied")
        assert [t.id for t in api.get_tracks([7])] == [7]
        assert client.calls == [("/catalog/tracks/7/", {})]

    def test_batches_are_capped_at_the_page_size(self) -> None:
        catalog = {i: raw_track(i) for i in range(1, 251)}
        client = FakeClient({"/catalog/tracks/": _by_id_route(catalog)})
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        tracks = api.get_tracks(range(1, 251))
        assert len(tracks) == 250
        sizes = [c[1]["per_page"] for c in client.calls]
        assert sizes == [TRACK_BATCH_SIZE, TRACK_BATCH_SIZE, 50]

    def test_errors_propagate(self) -> None:
        client = FakeClient(
            {"/catalog/tracks/": BeatportAPIError("no", status_code=401)}
        )
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        with pytest.raises(BeatportAPIError):
            api.get_tracks([1, 2])


def _paged(pages: List[Dict[str, Any]]) -> Callable[[Dict[str, Any]], Any]:
    def answer(params: Dict[str, Any]) -> Any:
        number = int(params.get("page", 1))
        return pages[number - 1] if number <= len(pages) else listing([])

    return answer


class TestRecentTracks:
    since = date(2026, 8, 1)
    until = date(2026, 9, 23)

    def test_artist_tracks_follow_pages_and_keep_the_window(self) -> None:
        pages = [load("artist_tracks_page1.json"), load("artist_tracks_page2.json")]
        api, client = api_with(**{"/catalog/tracks/": _paged(pages)})
        tracks = api.artist_tracks(301001, since=self.since, until=self.until)
        assert [t.id for t in tracks] == [19000010, 19000011, 19000012]
        first = client.calls[0]
        assert first[0] == "/catalog/tracks/"
        assert first[1] == {
            "artist_id": 301001,
            "publish_date": "2026-08-01:2026-09-23",
            "order_by": "-publish_date",
            "per_page": 100,
            "page": 1,
        }
        assert [c[1]["page"] for c in client.calls] == [1, 2]

    def test_label_tracks_filter_by_label(self) -> None:
        api, client = api_with(
            **{"/catalog/tracks/": _paged([load("artist_tracks_page2.json")])}
        )
        tracks = api.label_tracks(40211, since=self.since, until=self.until)
        assert [t.id for t in tracks] == [19000012]
        assert client.calls[0][1]["label_id"] == 40211
        assert "artist_id" not in client.calls[0][1]

    def test_when_beatport_ignores_the_dates_the_window_still_holds(self) -> None:
        # Newest first, as ordered; the second page is entirely older than the window.
        pages = [
            listing(
                [raw_track(1, day="2026-10-01"), raw_track(2, day="2026-09-10")],
                has_next=True,
            ),
            listing(
                [raw_track(3, day="2026-07-01"), raw_track(4, day="2026-06-01")],
                has_next=True,
            ),
            listing([raw_track(5, day="2026-05-01")], has_next=True),
        ]
        api, client = api_with(**{"/catalog/tracks/": _paged(pages)})
        tracks = api.artist_tracks(9, since=self.since, until=self.until)
        assert [t.id for t in tracks] == [2]
        assert len(client.calls) == 2, (
            "a page wholly older than the window ends the listing"
        )

    def test_an_undated_track_is_kept(self) -> None:
        undated = {"id": 8, "name": "No date", "artists": []}
        api, _ = api_with(**{"/catalog/tracks/": _paged([listing([undated])])})
        assert [
            t.id for t in api.artist_tracks(9, since=self.since, until=self.until)
        ] == [8]

    def test_the_page_cap_stops_a_listing_that_never_ends(self) -> None:
        def endless(params: Dict[str, Any]) -> Any:
            return listing(
                [raw_track(int(params["page"]), day="2026-09-01")], has_next=True
            )

        api, client = api_with(**{"/catalog/tracks/": endless})
        tracks = api.artist_tracks(9, since=self.since, until=self.until, max_pages=3)
        assert len(tracks) == 3
        assert len(client.calls) == 3
        client.calls.clear()
        api.artist_tracks(9, since=self.since, until=self.until)
        assert len(client.calls) == MAX_LISTING_PAGES

    def test_an_invalid_id_makes_no_request(self) -> None:
        api, client = api_with()
        assert api.artist_tracks(0, since=self.since) == []
        assert api.label_tracks(-1, since=self.since) == []
        assert client.calls == []

    def test_until_defaults_to_today(self) -> None:
        api, client = api_with(**{"/catalog/tracks/": _paged([listing([])])})
        api.artist_tracks(9, since=self.since)
        assert (
            client.calls[0][1]["publish_date"]
            == f"2026-08-01:{date.today().isoformat()}"
        )


class TestChartTracks:
    def test_reads_every_page_in_chart_order_without_repeats(self) -> None:
        page1 = listing([raw_track(1), raw_track(2)], has_next=True)
        page2 = listing([raw_track(2), raw_track(3)])
        api, client = api_with(
            **{"/catalog/charts/880001/tracks/": _paged([page1, page2])}
        )
        assert [t.id for t in api.chart_tracks(880001)] == [1, 2, 3]
        assert [c[1] for c in client.calls] == [
            {"per_page": 100, "page": 1},
            {"per_page": 100, "page": 2},
        ]

    def test_fixture_chart(self) -> None:
        api, _ = api_with(
            **{"/catalog/charts/880001/tracks/": load("chart_tracks.json")}
        )
        assert [t.id for t in api.chart_tracks(880001)] == [19000010, 19000001]

    def test_an_invalid_id_makes_no_request(self) -> None:
        api, client = api_with()
        assert api.chart_tracks(0) == []
        assert client.calls == []


class TestLegacyShapesGainTheCatalog:
    """inCrate's models carry the catalog track without anything inCrate reads changing."""

    def test_chart_tracks_carry_the_catalog_and_the_curator_is_read(self) -> None:
        api, _ = api_with(
            **{
                "/catalog/charts/880001": load("chart.json"),
                "/catalog/charts/880001/tracks": load("chart_tracks.json"),
            }
        )
        detail = api.get_chart(880001)
        assert detail is not None
        assert detail.author_name == "Mara Veil"
        assert [t.track_id for t in detail.tracks] == [19000010, 19000001]
        catalog = detail.tracks[1].catalog
        assert catalog is not None and catalog.remixers[0].name == "Dub Phizix Jr"

    def test_chart_summary_reads_the_curator(self) -> None:
        api, _ = api_with(**{"/catalog/charts": load("charts_page.json")})
        charts = api.list_charts(5, date(2026, 9, 1), date(2026, 9, 30))
        assert [c.author_name for c in charts] == ["Mara Veil"]

    def test_label_release_tracks_carry_the_catalog(self) -> None:
        api, _ = api_with(
            **{
                "/catalog/labels/40211/releases": load("label_releases.json"),
                "/catalog/releases/4500010/tracks": listing(
                    [load("artist_tracks_page1.json")["results"][0]]
                ),
                "/catalog/releases/4500020/tracks": load("release_tracks.json"),
            }
        )
        releases = api.get_label_releases(40211, date(2026, 8, 1), date(2026, 9, 30))
        by_id = {r.release_id: r for r in releases}
        white = by_id[4500020].tracks[0].catalog
        assert white is not None and white.label_id is None
        assert by_id[4500010].tracks[0].catalog is not None

    def test_old_constructors_still_work_without_the_catalog(self) -> None:
        assert ChartTrack(1, "T", "A", "u", 1).catalog is None
        assert LabelReleaseTrack(1, "T", "A", "u", "2026-01-01").catalog is None


class TestPlaylists:
    def test_create_posts_to_the_path_with_its_slash(self) -> None:
        client = FakeClient(posts={"my/playlists/": load("playlist_created.json")})
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        assert api.create_playlist("  Discover  ") == "5550001"
        assert client.posts == [("my/playlists/", {"name": "Discover"})]

    def test_add_posts_to_the_tracks_path_with_its_slash(self) -> None:
        client = FakeClient()
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        api.add_track_to_playlist("5550001", 19000001)
        assert client.posts == [
            ("my/playlists/5550001/tracks/", {"track_id": 19000001})
        ]

    def test_add_refuses_an_id_that_is_not_one(self) -> None:
        api = BeatportApi(FakeClient(), cache_service=None)  # type: ignore[arg-type]
        with pytest.raises(ValueError):
            api.add_track_to_playlist("1/../../my/account", 5)

    def test_playlist_url_is_real_and_never_a_placeholder(self) -> None:
        api = BeatportApi(FakeClient(), cache_service=None)  # type: ignore[arg-type]
        url = api.playlist_url("5550001")
        assert (
            url
            == f"{PLAYLIST_WEB_BASE}/5550001"
            == "https://www.beatport.com/library/playlists/5550001"
        )
        assert "placeholder" not in url
        assert api.playlist_url("") is None
        assert api.playlist_url("a/b") is None

    def test_a_website_url_in_the_create_response_is_used(self) -> None:
        answer = {
            **load("playlist_created.json"),
            "url": "https://www.beatport.com/library/playlists/5550001/x",
        }
        client = FakeClient(posts={"my/playlists/": answer})
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        pid = api.create_playlist("Discover")
        assert (
            api.playlist_url(pid or "")
            == "https://www.beatport.com/library/playlists/5550001/x"
        )

    def test_an_api_url_in_the_create_response_is_not(self) -> None:
        answer = {
            **load("playlist_created.json"),
            "url": "https://api.beatport.com/v4/my/playlists/5550001/",
        }
        client = FakeClient(posts={"my/playlists/": answer})
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        pid = api.create_playlist("Discover")
        assert (
            api.playlist_url(pid or "")
            == "https://www.beatport.com/library/playlists/5550001"
        )

    def test_create_with_no_usable_id_is_none(self) -> None:
        for answer in (None, [], {"name": "x"}, {"id": "bad/id"}):
            client = FakeClient(posts={"my/playlists/": answer})
            api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
            assert api.create_playlist("Discover") is None

    def test_a_forbidden_create_is_raised(self) -> None:
        client = FakeClient(
            posts={"my/playlists/": BeatportAPIError("scope", status_code=403)}
        )
        api = BeatportApi(client, cache_service=None)  # type: ignore[arg-type]
        with pytest.raises(BeatportAPIError):
            api.create_playlist("Discover")
