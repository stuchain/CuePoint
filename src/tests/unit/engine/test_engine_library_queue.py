#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The queue projection on the browse endpoint (PLAYER-05, DEC-012).

DEC-012 says double-clicking a track loads *the current view* as the playback
queue. With DEC-040's windowed table, that view is a query rather than an array:
the renderer holds a hundred rows out of tens of thousands, so the queue has to
be resolved by re-running the query the user is looking at.

``fields=queue`` is that resolution — a third projection of the one search path
(DEC-023), not a second endpoint. What matters here, and what these tests
assert, is that it answers with **exactly the rows and exactly the order** that
``mode=browse`` answers with for the same parameters. A queue that disagreed
with the table it came from would play tracks the user cannot see, in an order
they did not choose, and nothing in the UI would reveal why.

The other half is that the response stays additive: global search and the
Library table are live callers of this endpoint, and "we extended it" must not
mean "we changed it".
"""

from __future__ import annotations

import json

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread

from .test_engine_library_browse import (  # noqa: F401  (fixtures)
    TOKEN,
    get_error,
    get_json,
    library_db,
    seeded,
)


@pytest.fixture
def engine(seeded):  # noqa: F811
    """A running engine over the seeded library."""
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])

    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


SEARCH = "/api/v1/library/search"


def queue_rows(base: str, **params) -> list:
    payload = get_json(base, SEARCH, mode="browse", fields="queue", **params)
    return payload["queue_tracks"]


def browse_rows(base: str, **params) -> list:
    payload = get_json(base, SEARCH, mode="browse", **params)
    return payload["tracks"]


class TestTheProjection:
    def test_returns_queue_entries(self, engine):
        rows = queue_rows(engine)
        assert rows, "expected the whole library"
        assert set(rows[0]) == {
            "id",
            "title",
            "artist",
            "key",
            "bpm",
            "duration_seconds",
            "file_path",
        }

    def test_carries_what_a_dj_reads_off_a_player(self, engine):
        # Key and BPM are the two fields a DJ actually looks at; fetching them
        # per track change would flash empty at every transition (PLAYER-06).
        row = next(r for r in queue_rows(engine) if r["title"] == "Strobe")
        assert row["bpm"] == 128.0
        assert "key" in row

    def test_carries_the_file_the_player_opens(self, engine):
        # Without this the queue is unplayable, which is the entire point.
        assert all(row["file_path"] for row in queue_rows(engine))

    def test_does_not_carry_the_rest_of_the_track(self, engine):
        # A queue can be tens of thousands of rows; every extra field is paid
        # for once per track.
        row = queue_rows(engine)[0]
        # Key and BPM are deliberately present (PLAYER-06); these are not.
        for absent in ("rating", "label", "colour", "comment", "genre", "album"):
            assert absent not in row

    def test_reports_the_full_total_not_the_page_length(self, engine):
        payload = get_json(engine, SEARCH, mode="browse", fields="queue", limit=1)
        assert len(payload["queue_tracks"]) == 1
        assert payload["total"] == 4


class TestItAgreesWithTheTable:
    """The acceptance criterion: same rows, same order, same query."""

    def test_same_order_as_browse_by_default(self, engine):
        assert [r["id"] for r in queue_rows(engine)] == [
            r["id"] for r in browse_rows(engine)
        ]

    @pytest.mark.parametrize(
        ("sort", "direction"),
        [("title", "asc"), ("title", "desc"), ("artist", "desc"), ("bpm", "asc")],
    )
    def test_same_order_for_every_sort(self, engine, sort, direction):
        assert [r["id"] for r in queue_rows(engine, sort=sort, dir=direction)] == [
            r["id"] for r in browse_rows(engine, sort=sort, dir=direction)
        ]

    def test_same_rows_for_a_text_query(self, engine):
        assert [r["id"] for r in queue_rows(engine, q="deadmau5")] == [
            r["id"] for r in browse_rows(engine, q="deadmau5")
        ]

    def test_same_rows_for_a_filtered_view(self, engine):
        filters = json.dumps(
            {"rules": [{"field": "genre", "operator": "contains", "value": "house"}]}
        )
        assert [r["id"] for r in queue_rows(engine, filters=filters)] == [
            r["id"] for r in browse_rows(engine, filters=filters)
        ]

    def test_same_rows_for_a_playlist_scoped_view(self, engine):
        playlists = get_json(engine, "/api/v1/library/playlists")["playlists"]
        playlist = next(p for p in playlists if p["kind"] == "playlist")
        assert [r["id"] for r in queue_rows(engine, playlist_id=playlist["id"])] == [
            r["id"] for r in browse_rows(engine, playlist_id=playlist["id"])
        ]

    def test_same_rows_for_everything_at_once(self, engine):
        # Scope, text, filter and sort together — the combination a real double
        # click has to reproduce.
        filters = json.dumps(
            {"rules": [{"field": "bpm", "operator": "between", "value": [120, 130]}]}
        )
        params = {"q": "a", "filters": filters, "sort": "title", "dir": "desc"}
        assert [r["id"] for r in queue_rows(engine, **params)] == [
            r["id"] for r in browse_rows(engine, **params)
        ]

    def test_paging_the_queue_walks_the_same_list(self, engine):
        # A long queue is fetched in pages; the pages must join up into exactly
        # the browse order, with nothing repeated and nothing skipped.
        whole = [r["id"] for r in browse_rows(engine, sort="title", dir="asc")]
        paged: list = []
        for offset in range(0, len(whole), 2):
            paged.extend(
                r["id"]
                for r in queue_rows(
                    engine, sort="title", dir="asc", limit=2, offset=offset
                )
            )
        assert paged == whole
        assert len(paged) == len(set(paged))


class TestBadRequests:
    def test_an_unknown_projection_is_refused(self, engine):
        # Refused, not ignored: silently returning whole rows for a typo would
        # send twenty fields per track to something expecting five.
        status, payload = get_error(engine, SEARCH, mode="browse", fields="nonsense")
        assert status == 400
        assert "fields" in json.dumps(payload).lower()

    def test_the_error_names_what_is_allowed(self, engine):
        _, payload = get_error(engine, SEARCH, mode="browse", fields="tracks")
        message = json.dumps(payload)
        assert "queue" in message and "id" in message

    def test_a_bad_sort_is_still_refused_for_this_projection(self, engine):
        status, _ = get_error(
            engine, SEARCH, mode="browse", fields="queue", sort="nope"
        )
        assert status == 400

    def test_a_bad_filter_is_still_refused_for_this_projection(self, engine):
        status, _ = get_error(
            engine,
            SEARCH,
            mode="browse",
            fields="queue",
            filters=json.dumps(
                {"rules": [{"field": "nope", "operator": "is", "value": 1}]}
            ),
        )
        assert status == 400


class TestNothingElseChanged:
    """Live callers of this endpoint must see exactly what they saw before."""

    def test_browse_without_fields_is_unchanged(self, engine):
        payload = get_json(engine, SEARCH, mode="browse")
        assert "queue_tracks" not in payload
        assert payload["tracks"], "browse still returns whole rows"

    def test_search_mode_is_unchanged(self, engine):
        payload = get_json(engine, SEARCH, q="strobe")
        assert "queue_tracks" not in payload
        assert payload["tracks"][0]["title"] == "Strobe"

    def test_fields_id_is_unchanged(self, engine):
        payload = get_json(engine, SEARCH, mode="browse", fields="id")
        assert payload["track_ids"]
        assert "queue_tracks" not in payload
        assert payload["tracks"] == []

    def test_the_queue_projection_returns_no_full_rows(self, engine):
        # Both are never populated at once; a caller asking for a queue does not
        # want the rows and one that wants rows has them.
        payload = get_json(engine, SEARCH, mode="browse", fields="queue")
        assert payload["tracks"] == []
        assert "track_ids" not in payload

    def test_the_request_is_echoed_back(self, engine):
        # LIBUI-05's rule: a late response is recognised by what it answers.
        payload = get_json(
            engine, SEARCH, mode="browse", fields="queue", sort="title", dir="desc"
        )
        assert payload["mode"] == "browse"
        assert payload["sort"] == "title"
        assert payload["dir"] == "desc"
