#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the library browse query (LIBUI-01, DEC-040).

Four properties carry the weight here, and each has a test that fails if the
thing it protects is undone:

**The tiebreak.** Paging over a sort whose values tie must visit every row
exactly once. Without the trailing row id, SQLite may return tied rows in a
different order for each page, so a table shows one track twice and never shows
another — which reads as data loss and is a missing ORDER BY term.

**Nulls last, both directions.** Rekordbox omits fields freely, so a library can
easily have thousands of null BPMs. Ascending by BPM must not open on a screen
of blanks.

**Distinct rows in a scope.** A track may appear twice in one playlist and in
several playlists under one folder. A join would return it once per membership
row; the count would then disagree with the rows.

**Nothing typed reaches the SQL text.** Sort names and directions come from a
whitelist; values are bound. The injection tests drive both.

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

from typing import Any, List

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.persistence import track_query
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_query import (
    BROWSE_LIMIT_DEFAULT,
    BROWSE_LIMIT_MAX,
    SORTABLE_COLUMNS,
    BrowseQuery,
    BrowseQueryError,
    build_select,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def playlists(db) -> PlaylistRepository:
    return PlaylistRepository(db)


def _track(track_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Title {track_id}")
    kwargs.setdefault("artist", "Artist")
    return LibraryTrack(
        rekordbox_track_id=track_id,
        file_path=f"/music/{track_id}.mp3",
        **kwargs,
    )


@pytest.fixture
def seeded(repo) -> TrackRepository:
    """A small library with the awkward cases built in.

    Case variation, a non-ASCII artist, ties on artist and on BPM, nulls in
    every nullable column, and a title containing both LIKE wildcards.
    """
    repo.add(
        _track(
            "1",
            title="Strobe",
            artist="deadmau5",
            album="For Lack of a Better Name",
            label="mau5trap",
            genre="Progressive House",
            key="8A",
            bpm=128.0,
            year=2009,
            duration_seconds=634,
            rating=5,
            play_count=12,
            date_added="2020-01-05",
            bitrate=320,
        )
    )
    repo.add(
        _track(
            "2",
            title="Ghosts n Stuff",
            artist="Deadmau5",  # same artist, different case
            label="mau5trap",
            genre="Progressive House",
            key="5A",
            bpm=128.0,  # ties with Strobe
            year=2009,
            duration_seconds=203,
            rating=4,
            play_count=40,
            date_added="2018-03-02",
            bitrate=320,
        )
    )
    repo.add(
        _track(
            "3",
            title="Rej",
            artist="Âme",
            album="Rej EP",
            label="Innervisions",
            genre="Deep House",
            key="9A",
            bpm=122.5,
            year=2005,
            duration_seconds=480,
            rating=1,
            play_count=3,
            date_added="2016-11-30",
            bitrate=256,
        )
    )
    # Everything nullable is null: the row that proves nulls sort last.
    repo.add(_track("4", title="Opus", artist="Eric Prydz"))
    repo.add(
        _track(
            "5",
            title="100% _Pure",  # both LIKE wildcards, on purpose
            artist="apparat",  # lowercase, to catch a lost COLLATE NOCASE
            album="Walls",
            label="Shitkatapult",
            genre="Electronica",
            key="11B",
            bpm=95.0,
            year=2007,
            duration_seconds=300,
            rating=3,
            play_count=1,
            date_added="2021-07-14",
            bitrate=192,
        )
    )
    return repo


def _node(name, kind, depth, position, path, parent_path=None, refs=()):
    return RekordboxPlaylist(
        name=name,
        kind=kind,
        depth=depth,
        position=position,
        rekordbox_path=path,
        parent_path=parent_path,
        track_refs=list(refs),
    )


@pytest.fixture
def tree(seeded, playlists) -> dict:
    """ROOT / SETS / (warmup, peak / closing) plus an empty playlist.

    ``warmup`` lists track 1 twice, which a real export does in 19 playlists;
    ``closing`` shares track 1 with it, so the folder union has to be distinct.
    """
    playlists.replace_tree(
        [
            _node("ROOT", KIND_FOLDER, 0, 0, "ROOT"),
            _node("SETS", KIND_FOLDER, 1, 0, "ROOT/SETS", "ROOT"),
            _node(
                "warmup",
                KIND_PLAYLIST,
                2,
                0,
                "ROOT/SETS/warmup",
                "ROOT/SETS",
                ["3", "1", "5", "1"],
            ),
            _node("peak", KIND_FOLDER, 2, 1, "ROOT/SETS/peak", "ROOT/SETS"),
            _node(
                "closing",
                KIND_PLAYLIST,
                3,
                0,
                "ROOT/SETS/peak/closing",
                "ROOT/SETS/peak",
                ["1", "2"],
            ),
            _node("empty", KIND_PLAYLIST, 1, 1, "ROOT/empty", "ROOT"),
        ]
    )
    by_path = {node.rekordbox_path: node.id for node in playlists.list_all()}
    return by_path


def ids(tracks: List[LibraryTrack]) -> List[str]:
    """Rekordbox ids, which are what the fixtures are readable by."""
    return [t.rekordbox_track_id for t in tracks]


def values(tracks: List[LibraryTrack], attribute: str) -> List[Any]:
    return [getattr(t, attribute) for t in tracks]


class TestDefaults:
    def test_returns_the_whole_library(self, seeded):
        assert len(seeded.browse()) == 5

    def test_blank_query_means_everything_unlike_search(self, seeded):
        # The one place browse and search deliberately disagree: an empty search
        # box is not a request to read the library, but a table with no search
        # term is supposed to show it.
        assert seeded.search("") == []
        assert len(seeded.browse(BrowseQuery(query=""))) == 5

    def test_default_order_is_artist_then_title(self, seeded):
        # apparat, Deadmau5/deadmau5 (tie, split by title), Eric Prydz, Âme.
        # "Âme" last because NOCASE folds ASCII only.
        assert ids(seeded.browse()) == ["5", "2", "1", "4", "3"]

    def test_default_order_is_case_insensitive(self, seeded):
        # Under BINARY collation "apparat" would sort after every capitalized
        # artist. This fails if COLLATE NOCASE is dropped from the ordering.
        order = ids(seeded.browse())
        assert order.index("5") < order.index("2")

    def test_case_variants_of_one_artist_stay_together(self, seeded):
        order = ids(seeded.browse())
        assert abs(order.index("1") - order.index("2")) == 1

    def test_default_limit_is_applied(self, repo):
        repo.add_many([_track(str(i), artist=f"A{i:03d}") for i in range(200)])
        assert len(repo.browse()) == BROWSE_LIMIT_DEFAULT


class TestSorting:
    """Every whitelisted sort, asserted as properties rather than by rewriting
    the SQL in Python: ordered, nulls last, and every row present once."""

    ATTRIBUTE = {
        "artist": "artist",
        "title": "title",
        "album": "album",
        "label": "label",
        "genre": "genre",
        "key": "key",
        "bpm": "bpm",
        "year": "year",
        "duration_seconds": "duration_seconds",
        "rating": "rating",
        "play_count": "play_count",
        "bitrate": "bitrate",
        "date_added": "date_added",
    }

    @pytest.mark.parametrize("sort", sorted(ATTRIBUTE))
    @pytest.mark.parametrize("direction", ["asc", "desc"])
    def test_sorted_and_complete(self, seeded, sort, direction):
        rows = seeded.browse(BrowseQuery(sort=sort, direction=direction), limit=100)
        assert sorted(ids(rows)) == ["1", "2", "3", "4", "5"]

        present = [v for v in values(rows, self.ATTRIBUTE[sort]) if v is not None]
        comparable = [v.lower() if isinstance(v, str) else v for v in present]
        expected = sorted(comparable, reverse=direction == "desc")
        assert comparable == expected

    @pytest.mark.parametrize("sort", sorted(ATTRIBUTE))
    @pytest.mark.parametrize("direction", ["asc", "desc"])
    def test_nulls_are_last(self, seeded, sort, direction):
        rows = seeded.browse(BrowseQuery(sort=sort, direction=direction), limit=100)
        seen = values(rows, self.ATTRIBUTE[sort])
        nulls = [i for i, v in enumerate(seen) if v is None]
        if nulls:
            assert nulls == list(range(len(seen) - len(nulls), len(seen)))

    def test_bpm_ascending_is_explicit(self, seeded):
        rows = seeded.browse(BrowseQuery(sort="bpm"), limit=100)
        # 95, 122.5, then the 128 tie split by artist/title, then the null.
        assert ids(rows) == ["5", "3", "2", "1", "4"]

    def test_bpm_descending_puts_nulls_last_not_first(self, seeded):
        assert ids(seeded.browse(BrowseQuery(sort="bpm", direction="desc")))[-1] == "4"

    def test_equal_values_fall_back_to_artist_and_title(self, seeded):
        # Both 128.0 BPM: "Deadmau5 / Ghosts n Stuff" before
        # "deadmau5 / Strobe" on title, not at random.
        rows = ids(seeded.browse(BrowseQuery(sort="bpm"), limit=100))
        assert rows.index("2") < rows.index("1")

    def test_every_sortable_column_is_covered_by_a_test(self):
        # Fails when a sort is added to the whitelist without a test, which is
        # how a column arrives that nobody ever ordered by.
        covered = set(self.ATTRIBUTE) | {track_query.PLAYLIST_POSITION}
        assert covered == set(SORTABLE_COLUMNS)


class TestTiebreak:
    @pytest.fixture
    def identical(self, repo) -> TrackRepository:
        # Twelve rows a sort cannot tell apart.
        repo.add_many(
            [_track(str(i), title="Same", artist="Same") for i in range(1, 13)]
        )
        return repo

    def test_paging_visits_every_row_exactly_once(self, identical):
        seen: List[str] = []
        for offset in range(0, 12, 5):
            seen.extend(ids(identical.browse(limit=5, offset=offset)))
        assert sorted(seen, key=int) == [str(i) for i in range(1, 13)]
        assert len(set(seen)) == 12

    def test_tied_rows_come_back_in_id_order(self, identical):
        rows = identical.browse(limit=12)
        assert [t.id for t in rows] == sorted(t.id for t in rows)

    @pytest.mark.parametrize("direction", ["asc", "desc"])
    def test_the_ordering_ends_with_the_row_id(self, direction):
        # A structural guard: the behavioural test above can pass by luck on a
        # small table, and this one cannot.
        sql, _ = build_select(BrowseQuery(sort="genre", direction=direction))
        keyword = "ASC" if direction == "asc" else "DESC"
        assert sql.endswith(f"tracks.id {keyword} LIMIT ? OFFSET ?")


class TestScope:
    def test_playlist_returns_exactly_its_tracks(self, seeded, tree):
        rows = seeded.browse(BrowseQuery(playlist_id=tree["ROOT/SETS/peak/closing"]))
        assert sorted(ids(rows)) == ["1", "2"]

    def test_a_track_listed_twice_appears_once(self, seeded, tree):
        rows = seeded.browse(BrowseQuery(playlist_id=tree["ROOT/SETS/warmup"]))
        assert sorted(ids(rows)) == ["1", "3", "5"]

    def test_folder_is_the_distinct_union_of_its_descendants(self, seeded, tree):
        rows = seeded.browse(BrowseQuery(playlist_id=tree["ROOT/SETS"]))
        # warmup {3,1,5} plus closing {1,2}, with 1 counted once.
        assert sorted(ids(rows)) == ["1", "2", "3", "5"]

    def test_folder_reaches_through_a_nested_folder(self, seeded, tree):
        rows = seeded.browse(BrowseQuery(playlist_id=tree["ROOT/SETS/peak"]))
        assert sorted(ids(rows)) == ["1", "2"]

    def test_root_folder_reaches_everything_below_it(self, seeded, tree):
        rows = seeded.browse(BrowseQuery(playlist_id=tree["ROOT"]))
        assert sorted(ids(rows)) == ["1", "2", "3", "5"]

    def test_an_empty_playlist_is_empty(self, seeded, tree):
        query = BrowseQuery(playlist_id=tree["ROOT/empty"])
        assert seeded.browse(query) == []
        assert seeded.browse_count(query) == 0

    def test_an_unknown_playlist_is_empty_not_an_error(self, seeded, tree):
        # A stale selection is the UI's problem to fall back from (LIBUI-07),
        # not a 500 from the data layer.
        query = BrowseQuery(playlist_id=999_999)
        assert seeded.browse(query) == []
        assert seeded.browse_count(query) == 0

    def test_scope_and_text_query_are_combined(self, seeded, tree):
        query = BrowseQuery(query="deadmau5", playlist_id=tree["ROOT/SETS/warmup"])
        # warmup holds 1, 3 and 5; only track 1 is deadmau5.
        assert ids(seeded.browse(query)) == ["1"]


class TestPlaylistPosition:
    def test_orders_by_rekordbox_order(self, seeded, tree):
        query = BrowseQuery(
            playlist_id=tree["ROOT/SETS/warmup"], sort="playlist_position"
        )
        # warmup is [3, 1, 5, 1]; track 1 takes its first position.
        assert ids(seeded.browse(query)) == ["3", "1", "5"]

    def test_descending_reverses_it(self, seeded, tree):
        query = BrowseQuery(
            playlist_id=tree["ROOT/SETS/warmup"],
            sort="playlist_position",
            direction="desc",
        )
        assert ids(seeded.browse(query)) == ["5", "1", "3"]

    def test_a_folder_orders_by_the_earliest_position_in_it(self, seeded, tree):
        query = BrowseQuery(playlist_id=tree["ROOT/SETS"], sort="playlist_position")
        # warmup [3,1,5,1] and closing [1,2]: 3@0, 1@0 (warmup), 2@1, 5@2.
        # 1 and 3 tie at 0 and fall back to artist/title.
        assert ids(seeded.browse(query)) == ["1", "3", "2", "5"]

    def test_refused_without_a_scope(self, seeded):
        with pytest.raises(BrowseQueryError, match="needs a playlist"):
            seeded.browse(BrowseQuery(sort="playlist_position"))

    def test_refused_without_a_scope_for_the_count_too(self, seeded):
        with pytest.raises(BrowseQueryError):
            seeded.browse_count(BrowseQuery(sort="playlist_position"))


class TestValidation:
    def test_unknown_sort_is_refused(self, seeded):
        with pytest.raises(BrowseQueryError, match="Cannot sort by 'popularity'"):
            seeded.browse(BrowseQuery(sort="popularity"))

    def test_the_refusal_says_what_is_sortable(self, seeded):
        with pytest.raises(BrowseQueryError) as exc:
            seeded.browse(BrowseQuery(sort="popularity"))
        assert "artist" in str(exc.value)

    def test_unknown_direction_is_refused(self, seeded):
        with pytest.raises(BrowseQueryError, match="asc"):
            seeded.browse(BrowseQuery(direction="sideways"))

    def test_direction_is_case_insensitive(self, seeded):
        assert ids(seeded.browse(BrowseQuery(direction="DESC"))) == ids(
            seeded.browse(BrowseQuery(direction="desc"))
        )

    def test_sort_whitespace_is_trimmed(self, seeded):
        assert ids(seeded.browse(BrowseQuery(sort=" bpm "))) == ids(
            seeded.browse(BrowseQuery(sort="bpm"))
        )

    def test_empty_sort_falls_back_to_the_default(self, seeded):
        assert ids(seeded.browse(BrowseQuery(sort=""))) == ids(seeded.browse())

    def test_a_playlist_that_is_not_a_number_is_refused(self, seeded):
        with pytest.raises(BrowseQueryError, match="number"):
            seeded.browse(BrowseQuery(playlist_id="the good one"))  # type: ignore[arg-type]

    def test_a_numeric_playlist_string_is_accepted(self, seeded, tree):
        # Query strings arrive as text; a scope that is a number written down
        # is still a number.
        query = BrowseQuery(playlist_id=str(tree["ROOT/SETS/peak/closing"]))  # type: ignore[arg-type]
        assert sorted(ids(seeded.browse(query))) == ["1", "2"]


class TestInjection:
    def test_a_sort_carrying_sql_is_refused_and_changes_nothing(self, seeded, db):
        with pytest.raises(BrowseQueryError):
            seeded.browse(BrowseQuery(sort="artist; DROP TABLE tracks--"))
        assert seeded.count() == 5

    def test_a_direction_carrying_sql_is_refused(self, seeded):
        with pytest.raises(BrowseQueryError):
            seeded.browse(BrowseQuery(direction="asc; DROP TABLE tracks--"))
        assert seeded.count() == 5

    def test_query_text_stays_a_value(self, seeded):
        assert seeded.browse(BrowseQuery(query="'; DROP TABLE tracks--")) == []
        assert seeded.count() == 5

    def test_like_wildcards_are_escaped(self, seeded):
        # A bare "%" would match every row if it reached LIKE as a wildcard.
        assert ids(seeded.browse(BrowseQuery(query="%"))) == ["5"]

    def test_underscore_is_not_a_wildcard(self, seeded):
        assert ids(seeded.browse(BrowseQuery(query="_Pure"))) == ["5"]

    def test_a_literal_wildcard_title_is_findable(self, seeded):
        assert ids(seeded.browse(BrowseQuery(query="100% _Pure"))) == ["5"]


class TestCount:
    @pytest.mark.parametrize(
        "query",
        [
            BrowseQuery(),
            BrowseQuery(query="deadmau5"),
            BrowseQuery(query="nothing matches this"),
            BrowseQuery(sort="bpm", direction="desc"),
        ],
    )
    def test_agrees_with_an_unpaged_read(self, seeded, query):
        assert seeded.browse_count(query) == len(seeded.browse(query, limit=500))

    def test_agrees_within_a_scope(self, seeded, tree):
        query = BrowseQuery(playlist_id=tree["ROOT/SETS"])
        assert seeded.browse_count(query) == len(seeded.browse(query, limit=500)) == 4

    def test_agrees_for_a_scope_and_a_query(self, seeded, tree):
        query = BrowseQuery(query="deadmau5", playlist_id=tree["ROOT/SETS"])
        assert seeded.browse_count(query) == 2

    def test_ignores_paging(self, seeded):
        assert seeded.browse_count(BrowseQuery()) == 5
        assert len(seeded.browse(BrowseQuery(), limit=2)) == 2


class TestPaging:
    def test_windows_reassemble_the_whole_library(self, seeded):
        whole = ids(seeded.browse(limit=500))
        windows: List[str] = []
        for offset in range(0, len(whole), 2):
            windows.extend(ids(seeded.browse(limit=2, offset=offset)))
        assert windows == whole

    def test_limit_is_clamped_to_the_maximum(self, repo):
        repo.add_many([_track(str(i), artist=f"A{i:04d}") for i in range(600)])
        assert len(repo.browse(limit=10_000)) == BROWSE_LIMIT_MAX

    def test_a_zero_limit_still_returns_a_row(self, seeded):
        assert len(seeded.browse(limit=0)) == 1

    def test_a_negative_offset_is_the_start(self, seeded):
        assert ids(seeded.browse(offset=-5)) == ids(seeded.browse())

    def test_an_offset_past_the_end_is_empty(self, seeded):
        assert seeded.browse(offset=500) == []


class TestNullsLastFallback:
    """The portable spelling, for a SQLite older than 3.30.

    Both paths must produce the same order, or a user on an old system SQLite
    sees a different library from everyone else.
    """

    @pytest.mark.parametrize("sort", ["bpm", "rating", "album", "date_added"])
    @pytest.mark.parametrize("direction", ["asc", "desc"])
    def test_matches_the_native_spelling(self, seeded, monkeypatch, sort, direction):
        query = BrowseQuery(sort=sort, direction=direction)
        native = ids(seeded.browse(query, limit=100))

        monkeypatch.setattr(track_query, "_SUPPORTS_NULLS_LAST", False)
        portable = ids(seeded.browse(query, limit=100))

        assert portable == native

    def test_the_fallback_is_actually_different_sql(self, monkeypatch):
        native, _ = build_select(BrowseQuery(sort="bpm"))
        monkeypatch.setattr(track_query, "_SUPPORTS_NULLS_LAST", False)
        portable, _ = build_select(BrowseQuery(sort="bpm"))
        assert "NULLS LAST" in native
        assert "NULLS LAST" not in portable
        assert "IS NULL" in portable


class TestQueryPlan:
    """The default order is the one that runs on every visit to the page, so it
    is the one that must be served by an index rather than by a sort."""

    def _plan(self, db, sql, params) -> str:
        rows = db.connect().execute(f"EXPLAIN QUERY PLAN {sql}", params).fetchall()
        return " | ".join(str(row["detail"]) for row in rows)

    def test_the_default_order_uses_the_composite_index(self, seeded, db):
        sql, params = build_select(BrowseQuery())
        plan = self._plan(db, sql, params)
        assert "idx_tracks_artist_title" in plan

    def test_the_default_order_needs_no_sort(self, seeded, db):
        # "USE TEMP B-TREE FOR ORDER BY" means SQLite read every row and sorted
        # them, which at 50,000 tracks is the difference the index exists for.
        sql, params = build_select(BrowseQuery())
        assert "TEMP B-TREE" not in self._plan(db, sql, params).upper()

    def test_a_scoped_query_uses_the_membership_index(self, seeded, tree, db):
        sql, params = build_select(BrowseQuery(playlist_id=tree["ROOT/SETS"]))
        plan = self._plan(db, sql, params).lower()
        assert "rekordbox_playlist_tracks" in plan
