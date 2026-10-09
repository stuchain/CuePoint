#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the plays the Statistics page answers with (STATS-02).

A library built from fixture XML and four reads of it (the import and three
refreshes, the last two on one day), then the questions the page asks: the top
tracks, artists and labels, all time, since a date and since a read, in each
scope. The expected numbers are written out below from the counts each read saw,
not computed by the code under test:

====== ======= ============ ============= ==== ==== ==== ====
track  title   artist       label         r1   r2   r3   r4
====== ======= ============ ============= ==== ==== ==== ====
1      Alpha   B            Nightfall     10   14   14   20
2      Bravo   A, B         Nightfall     5    5    9    9
3      Charlie B.           nightfall     3    3    3    5
4      Delta   C (B remix)  Other         0    0    3    3
5      echo    B (B remix)  Other         2    2    2    8
6      Foxtrot E            (none)        30   30   4    7
7      Golf    E            (none)        -    6    6    8
8      Hotel   F            (none)        ?    ?    ?    ?
9      India   F            (none)        0    0    0    0
10     Juliet  D            Nightfall *   1    1    1    1
11     Juliet  D            (none)        1    1    1    1
====== ======= ============ ============= ==== ==== ==== ====

``?`` is an unknown count, ``-`` a track the first export did not hold, and ``*``
a CuePoint label override ("Override Rec") over the imported one. The reads are
dated Jan 10, Feb 10 and Mar 10 twice (09:00 and 18:00 UTC), so "since the last
read" has two refreshes on one day to tell apart.

Every all-time rule set a row returns is also run through ``browse_count``: the
number on the row and the Library it opens are one statement, in each scope.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pytest

from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.statistics_repository import StatisticsRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.statistics_service import (
    PlaysScope,
    ReadNotFoundError,
    ScopeNotFoundError,
    StatisticsService,
)

pytestmark = pytest.mark.unit

#: When each read happened (UTC). The last two share a day.
READ_TIMES = (
    "2026-01-10T12:00:00+00:00",
    "2026-02-10T12:00:00+00:00",
    "2026-03-10T09:00:00+00:00",
    "2026-03-10T18:00:00+00:00",
)

#: ``(TrackID, title, artist, remixer, label, counts at r1..r4)``; ``None`` is
#: a count the export does not carry, and a track absent from r1 starts at r2.
TRACKS: Tuple[
    Tuple[int, str, str, Optional[str], Optional[str], Tuple[Any, ...]], ...
] = (
    (1, "Alpha", "B", None, "Nightfall", (10, 14, 14, 20)),
    (2, "Bravo", "A, B", None, "Nightfall", (5, 5, 9, 9)),
    (3, "Charlie", "B.", None, "nightfall", (3, 3, 3, 5)),
    (4, "Delta", "C", "B", "Other", (0, 0, 3, 3)),
    (5, "echo", "B", "B", "Other", (2, 2, 2, 8)),
    (6, "Foxtrot", "E", None, None, (30, 30, 4, 7)),
    (7, "Golf", "E", None, None, ("absent", 6, 6, 8)),
    (8, "Hotel", "F", None, None, (None, None, None, None)),
    (9, "India", "F", None, None, (0, 0, 0, 0)),
    (10, "Juliet", "D", None, "Nightfall", (1, 1, 1, 1)),
    (11, "Juliet", "D", None, None, (1, 1, 1, 1)),
)

#: Playlist "Warm" holds these Rekordbox TrackIDs; the Collection and the Set
#: below hold the first four, in the same way.
WARM = (1, 2, 8, 9)
FILED = (1, 6, 8, 9)


def track_xml(row, read: int) -> Optional[str]:
    """One ``TRACK`` element for read ``read`` (0-based), or None if absent."""
    track_id, title, artist, remixer, label, counts = row
    count = counts[read]
    if count == "absent":
        return None
    attrs = [
        f'TrackID="{track_id}"',
        f'Name="{title}"',
        f'Artist="{artist}"',
        f'Location="file://localhost/m/{track_id}.mp3"',
    ]
    if remixer:
        attrs.append(f'Remixer="{remixer}"')
    if label:
        attrs.append(f'Label="{label}"')
    if count is not None:
        attrs.append(f'PlayCount="{count}"')
    return f"<TRACK {' '.join(attrs)}/>"


def write_export(tmp_path: Path, read: int, rows=TRACKS) -> str:
    tracks = [x for x in (track_xml(row, read) for row in rows) if x]
    members = "".join(f'<TRACK Key="{i}"/>' for i in WARM)
    path = tmp_path / f"read-{read}.xml"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n' + "\n".join(tracks) + "\n"
        "  </COLLECTION>\n"
        '  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">'
        f'<NODE Name="Warm" Type="1" Entries="{len(WARM)}">{members}</NODE>'
        "</NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


@dataclass
class World:
    """A library with its history, and everything a test asks it with."""

    db: DatabaseService
    statistics: StatisticsService
    library: LibraryService
    collections: CollectionService
    ids: Dict[int, int]  # Rekordbox TrackID -> tracks.id
    reads: List[int]  # library_reads ids, oldest first
    playlist_id: int

    def plays(self, **kwargs) -> Dict[str, Any]:
        return self.statistics.plays(**kwargs).to_dict()

    def count(self, rules: Dict[str, Any]) -> int:
        return self.library.browse_count(rules=RuleSet.from_dict(rules))


def build_world(tmp_path: Path, *, with_history: bool = True) -> World:
    """Import the first export, refresh through the others, then date the reads."""
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    tracks = TrackRepository(db)
    playlists = PlaylistRepository(db)
    collection_repo = CollectionRepository(db)
    importer = LibraryImportService(tracks, playlists, LibrarySourceRepository(db), db)
    importer.import_rekordbox_xml(write_export(tmp_path, 0))
    for read in range(1, len(READ_TIMES)):
        importer.apply_refresh(
            importer.compute_refresh_diff(write_export(tmp_path, read), force=True)
        )
    connection = db.connect()
    read_ids = [
        r[0] for r in connection.execute("SELECT id FROM library_reads ORDER BY id")
    ]
    assert len(read_ids) == len(READ_TIMES)
    with db.transaction() as conn:
        for read_id, when in zip(read_ids, READ_TIMES):
            conn.execute(
                "UPDATE library_reads SET read_at = ? WHERE id = ?", (when, read_id)
            )
    ids = {
        int(r[0]): int(r[1])
        for r in connection.execute("SELECT rekordbox_track_id, id FROM tracks")
    }
    with db.transaction() as conn:
        # Juliet (10) carries a CuePoint label override over the imported one.
        TrackMetadataRepository(db).set_override(ids[10], "label", "Override Rec")
    playlist_id = int(
        connection.execute(
            "SELECT id FROM rekordbox_playlists WHERE name = 'Warm'"
        ).fetchone()[0]
    )
    if not with_history:
        with db.transaction() as conn:
            conn.execute("DELETE FROM play_counts")
            conn.execute("DELETE FROM library_reads")
    activity = ActivityService(ActivityRepository(db), tracks)
    collections = CollectionService(collection_repo, db, tracks, activity, playlists)
    library = LibraryService(
        tracks, collection_repo, TrackMetadataRepository(db), AuthoredDataRepository(db)
    )
    statistics = StatisticsService(StatisticsRepository(db), collections, playlists)
    return World(
        db=db,
        statistics=statistics,
        library=library,
        collections=collections,
        ids=ids,
        reads=read_ids if with_history else [],
        playlist_id=playlist_id,
    )


@pytest.fixture
def world(tmp_path):
    built = build_world(tmp_path)
    yield built
    built.db.close_all()


def filed(world: World, kind: str) -> PlaysScope:
    """A Collection, a Set or a Smart Collection holding the FILED tracks."""
    if kind == "smart":
        # B's tracks: Alpha, Bravo, Charlie, Delta and echo.
        node = world.collections.create_smart(
            "B", RuleSet(rules=(FilterRule("artist_name", "is", "B"),))
        )
    else:
        make = (
            world.collections.create_set
            if kind == "set"
            else world.collections.create_collection
        )
        node = make("Filed")
        world.collections.add_tracks(int(node.id), [world.ids[i] for i in FILED])
    return PlaysScope("collection", int(node.id))


def scope_of(world: World, kind: str) -> PlaysScope:
    if kind == "library":
        return PlaysScope("library")
    if kind == "playlist":
        return PlaysScope("playlist", world.playlist_id)
    return filed(world, kind)


def rows(section: List[Dict[str, Any]], key: str) -> List[Tuple[Any, ...]]:
    """``(name or title, plays)`` of each row, in order."""
    return [(row[key], row["plays"]) for row in section]


# --------------------------------------------------------------- all time

ALL_TIME_TRACKS = [
    ("Alpha", 20),
    ("Bravo", 9),
    ("echo", 8),
    ("Golf", 8),
    ("Foxtrot", 7),
    ("Charlie", 5),
    ("Delta", 3),
    ("Juliet", 1),
    ("Juliet", 1),
]


class TestAllTime:
    def test_the_top_tracks_are_the_counts_the_library_shows(self, world):
        answer = world.plays()

        assert rows(answer["tracks"], "title") == ALL_TIME_TRACKS
        first = answer["tracks"][0]
        assert first == {
            "id": world.ids[1],
            "title": "Alpha",
            "artist": "B",
            "plays": 20,
        }

    def test_ties_sort_by_title_case_blind_then_by_id(self, world):
        tracks = world.plays()["tracks"]

        # "echo" before "Golf" (a binary sort puts "Golf" first), and the two
        # Juliets by id.
        assert [t["title"] for t in tracks[2:4]] == ["echo", "Golf"]
        assert [t["id"] for t in tracks[-2:]] == [world.ids[10], world.ids[11]]

    def test_the_artists_sum_their_tracks_over_artist_and_remixer(self, world):
        artists = world.plays()["artists"]

        assert [
            (a["name"], a["name_key"], a["plays"], a["tracks"]) for a in artists
        ] == [
            # Alpha 20, Bravo 9, Charlie 5 ("B." is B), Delta 3 (B remixed it)
            # and echo 8 (B twice, counted once).
            ("B", "b", 45, 5),
            ("E", "e", 15, 2),
            ("A", "a", 9, 1),
            ("C", "c", 3, 1),
            ("D", "d", 2, 2),
        ]

    def test_an_artist_with_no_plays_is_left_out(self, world):
        names = [a["name"] for a in world.plays()["artists"]]

        # F holds one track with an unknown count and one never played.
        assert "F" not in names

    def test_the_labels_use_the_override_over_the_imported_label(self, world):
        labels = world.plays()["labels"]

        assert [
            (row["name"], row["label_key"], row["plays"], row["tracks"])
            for row in labels
        ] == [
            # Alpha 20, Bravo 9 and Charlie 5 ("nightfall" is the same label).
            # Juliet's imported "Nightfall" no longer counts: it was overridden.
            ("Nightfall", "nightfall", 34, 3),
            ("Other", "other", 11, 2),
            ("Override Rec", "override rec", 1, 1),
        ]

    def test_never_played_and_unknown_are_counts_with_rules(self, world):
        answer = world.plays()

        assert answer["never_played"]["count"] == 1
        assert answer["unknown"]["count"] == 1
        assert answer["never_played"]["rules"]["rules"] == [
            {"field": "play_count", "operator": "is", "value": 0}
        ]
        assert answer["unknown"]["rules"]["rules"] == [
            {"field": "play_count", "operator": "is_empty"}
        ]

    def test_the_history_is_reported_beside_the_numbers(self, world):
        answer = world.plays()

        assert answer["since"] is None
        assert answer["since_clamped"] is False
        assert answer["history_from"] == READ_TIMES[0]
        assert answer["last_read"] == READ_TIMES[-1]

    @pytest.mark.parametrize("limit", [10, 25, 50, 100, 200])
    def test_each_limit_cuts_the_lists(self, tmp_path, limit):
        many = tmp_path / "many"
        many.mkdir()
        rows_ = tuple(
            (n, f"Track {n:02d}", f"Artist {n:02d}", None, None, (n,))
            for n in range(1, 61)
        )
        db = DatabaseService(db_path=many / "cuepoint.db")
        MigrationRunner(db).migrate()
        tracks = TrackRepository(db)
        playlists = PlaylistRepository(db)
        importer = LibraryImportService(
            tracks, playlists, LibrarySourceRepository(db), db
        )
        try:
            importer.import_rekordbox_xml(write_export(many, 0, rows_))
            collections = CollectionService(
                CollectionRepository(db),
                db,
                tracks,
                ActivityService(ActivityRepository(db), tracks),
                playlists,
            )
            service = StatisticsService(
                StatisticsRepository(db), collections, playlists
            )

            answer = service.plays(limit=limit).to_dict()
        finally:
            db.close_all()

        wanted = min(limit, 60)
        assert len(answer["tracks"]) == len(answer["artists"]) == wanted
        assert [t["plays"] for t in answer["tracks"]] == list(
            range(60, 60 - wanted, -1)
        )


# ------------------------------------------------------------------ since

#: Plays since the Feb 10 read or before it: every rise at r2, r3 and r4.
SINCE_FEB = {
    "tracks": [
        ("Alpha", 10),
        ("echo", 6),
        ("Bravo", 4),
        ("Delta", 3),
        ("Foxtrot", 3),  # 30 -> 4 adds nothing, 4 -> 7 adds 3
        ("Charlie", 2),
        ("Golf", 2),  # new at r2 (its baseline adds nothing), then 6 -> 8
    ],
    "artists": [("B", 25), ("E", 5), ("A", 4), ("C", 3)],
    "labels": [("Nightfall", 16), ("Other", 9)],
}

#: Plays on Mar 10: the rises at r3 and r4.
SINCE_MARCH = {
    "tracks": [
        ("Alpha", 6),
        ("echo", 6),
        ("Bravo", 4),
        ("Delta", 3),
        ("Foxtrot", 3),
        ("Charlie", 2),
        ("Golf", 2),
    ],
    "artists": [("B", 21), ("E", 5), ("A", 4), ("C", 3)],
    "labels": [("Nightfall", 12), ("Other", 9)],
}

#: Plays at the last read alone.
SINCE_LAST = {
    "tracks": [
        ("Alpha", 6),
        ("echo", 6),
        ("Foxtrot", 3),
        ("Charlie", 2),
        ("Golf", 2),
    ],
    "artists": [("B", 14), ("E", 5)],
    "labels": [("Nightfall", 8), ("Other", 6)],
}


def shown(answer: Dict[str, Any]) -> Dict[str, List[Tuple[Any, ...]]]:
    return {
        "tracks": rows(answer["tracks"], "title"),
        "artists": rows(answer["artists"], "name"),
        "labels": rows(answer["labels"], "name"),
    }


def midnight(day: str, offset: str = "+00:00") -> Dict[str, Any]:
    sign = -1 if offset.startswith("-") else 1
    hours, minutes = offset[1:].split(":")
    return {
        "since": date.fromisoformat(day),
        "utc_offset": sign * timedelta(hours=int(hours), minutes=int(minutes)),
    }


class TestSinceADate:
    def test_a_date_between_two_reads_counts_every_rise_after_it(self, world):
        answer = world.plays(**midnight("2026-02-01"))

        assert shown(answer) == SINCE_FEB
        assert answer["since"] == "2026-02-01"
        assert answer["since_clamped"] is False

    def test_a_date_before_history_is_clamped_to_it(self, world):
        answer = world.plays(**midnight("2026-01-01"))

        # The baseline read adds nothing, so the numbers are the same.
        assert shown(answer) == SINCE_FEB
        assert answer["since_clamped"] is True
        assert answer["history_from"] == READ_TIMES[0]

    def test_the_first_day_of_history_is_before_its_first_read(self, world):
        # Midnight on Jan 10 is before the 12:00 read: clamped.
        assert world.plays(**midnight("2026-01-10"))["since_clamped"] is True

    def test_the_first_read_after_the_date_compares_with_the_last_one_before_it(
        self, world
    ):
        answer = world.plays(**midnight("2026-03-10"))

        # Alpha was 14 at r3's predecessor (r2), so r3 adds nothing and r4 adds 6:
        # not 20 - 10, which is what comparing with its baseline would give.
        assert shown(answer) == SINCE_MARCH

    def test_a_date_after_the_last_read_answers_zero_plays(self, world):
        answer = world.plays(**midnight("2026-03-11"))

        assert answer["tracks"] == answer["artists"] == answer["labels"] == []
        assert answer["last_read"] == READ_TIMES[-1]
        # Never played and unknown are about the library, not the window.
        assert answer["never_played"]["count"] == 1
        assert answer["unknown"]["count"] == 1

    def test_the_date_is_the_users_local_day(self, world):
        # Local midnight on Mar 10 at UTC-10 is 10:00 UTC: after the 09:00 read
        # and before the 18:00 one.
        answer = world.plays(**midnight("2026-03-10", "-10:00"))

        assert shown(answer) == SINCE_LAST

    def test_an_east_offset_moves_the_midnight_earlier(self, world):
        # Mar 10 at UTC+12 begins Mar 9 12:00 UTC: both March reads are after.
        assert shown(world.plays(**midnight("2026-03-10", "+12:00"))) == SINCE_MARCH

    def test_an_artist_row_since_a_date_opens_all_the_artists_played_tracks(
        self, world
    ):
        answer = world.plays(**midnight("2026-03-10", "-10:00"))
        nightfall = next(row for row in answer["labels"] if row["name"] == "Nightfall")

        assert nightfall["opens_more"] is True
        # Alpha and Charlie played; Bravo (played earlier) opens too.
        assert nightfall["tracks"] == 2
        assert world.count(nightfall["rules"]) == 3
        assert nightfall["rules"]["rules"][-1] == {
            "field": "play_count",
            "operator": "gt",
            "value": 0,
        }

    def test_an_all_time_row_opens_exactly_what_it_counts(self, world):
        answer = world.plays()

        assert all(row["opens_more"] is False for row in answer["artists"])
        assert all(row["opens_more"] is False for row in answer["labels"])


class TestSinceARead:
    def test_since_the_last_read_tells_two_refreshes_on_one_day_apart(self, world):
        answer = world.plays(since_read=world.reads[3])

        assert shown(answer) == SINCE_LAST
        assert answer["since"] is None
        assert answer["since_clamped"] is False

    def test_since_the_read_before_it_includes_both(self, world):
        assert shown(world.plays(since_read=world.reads[2])) == SINCE_MARCH

    def test_since_the_first_read_is_everything_after_the_baseline(self, world):
        assert shown(world.plays(since_read=world.reads[0])) == SINCE_FEB

    def test_a_read_that_does_not_exist_is_not_found(self, world):
        with pytest.raises(ReadNotFoundError):
            world.plays(since_read=world.reads[-1] + 100)


class TestWithoutHistory:
    def test_all_time_still_answers_and_history_is_null(self, tmp_path):
        built = build_world(tmp_path, with_history=False)
        try:
            answer = built.plays()
        finally:
            built.db.close_all()

        assert answer["history_from"] is None
        assert answer["last_read"] is None
        assert rows(answer["tracks"], "title") == ALL_TIME_TRACKS

    def test_since_a_date_answers_zero_plays(self, tmp_path):
        built = build_world(tmp_path, with_history=False)
        try:
            answer = built.plays(**midnight("2026-02-01"))
        finally:
            built.db.close_all()

        assert answer["tracks"] == answer["artists"] == answer["labels"] == []
        assert answer["since_clamped"] is False
        assert answer["never_played"]["count"] == 1

    def test_an_empty_library_answers_empty(self, tmp_path):
        db = DatabaseService(db_path=tmp_path / "empty.db")
        MigrationRunner(db).migrate()
        tracks = TrackRepository(db)
        playlists = PlaylistRepository(db)
        collections = CollectionService(
            CollectionRepository(db),
            db,
            tracks,
            ActivityService(ActivityRepository(db), tracks),
            playlists,
        )
        service = StatisticsService(StatisticsRepository(db), collections, playlists)
        try:
            answer = service.plays().to_dict()
        finally:
            db.close_all()

        assert answer["tracks"] == answer["artists"] == answer["labels"] == []
        assert answer["never_played"]["count"] == answer["unknown"]["count"] == 0
        assert answer["history_from"] is answer["last_read"] is None


# ------------------------------------------------------------------ scope

SCOPES = ("library", "collection", "set", "smart", "playlist")

#: The tracks each scope holds, by Rekordbox TrackID.
SCOPED = {
    "library": tuple(row[0] for row in TRACKS),
    "collection": FILED,
    "set": FILED,
    "smart": (1, 2, 3, 4, 5),
    "playlist": WARM,
}


class TestScopes:
    @pytest.mark.parametrize("kind", SCOPES)
    def test_the_lists_hold_only_the_scopes_tracks(self, world, kind):
        answer = world.plays(scope=scope_of(world, kind), limit=200)

        wanted = {
            world.ids[i]
            for i in SCOPED[kind]
            if next(r for r in TRACKS if r[0] == i)[5][-1] not in (None, 0)
        }
        assert {t["id"] for t in answer["tracks"]} == wanted

    @pytest.mark.parametrize("kind", SCOPES)
    def test_never_played_and_unknown_are_counted_in_the_scope(self, world, kind):
        answer = world.plays(scope=scope_of(world, kind))

        never = [i for i in SCOPED[kind] if i == 9]
        unknown = [i for i in SCOPED[kind] if i == 8]
        assert answer["never_played"]["count"] == len(never)
        assert answer["unknown"]["count"] == len(unknown)

    def test_a_collection_sums_only_its_own_tracks(self, world):
        answer = world.plays(scope=scope_of(world, "collection"))

        # Alpha 20 and Foxtrot 7: Golf, the other E track, is not filed.
        assert rows(answer["tracks"], "title") == [("Alpha", 20), ("Foxtrot", 7)]
        assert rows(answer["artists"], "name") == [("B", 20), ("E", 7)]
        assert rows(answer["labels"], "name") == [("Nightfall", 20)]

    def test_a_set_is_a_collection(self, world):
        as_set = world.plays(scope=scope_of(world, "set"))
        as_collection = world.plays(scope=scope_of(world, "collection"))

        assert shown(as_set) == shown(as_collection)

    def test_a_smart_collection_applies_its_own_rules(self, world):
        answer = world.plays(scope=scope_of(world, "smart"))

        assert rows(answer["artists"], "name") == [
            ("B", 45),
            ("A", 9),
            ("C", 3),
        ]
        assert answer["never_played"]["count"] == 0

    def test_a_playlist_is_its_tracks(self, world):
        answer = world.plays(scope=scope_of(world, "playlist"))

        assert rows(answer["tracks"], "title") == [("Alpha", 20), ("Bravo", 9)]

    def test_since_a_date_a_scope_still_applies(self, world):
        answer = world.plays(
            scope=scope_of(world, "collection"), **midnight("2026-02-01")
        )

        assert rows(answer["tracks"], "title") == [("Alpha", 10), ("Foxtrot", 3)]

    @pytest.mark.parametrize(
        "scope",
        [
            PlaysScope("collection", 9999),
            PlaysScope("playlist", 9999),
        ],
    )
    def test_an_unknown_collection_or_playlist_is_not_found(self, world, scope):
        with pytest.raises(ScopeNotFoundError):
            world.plays(scope=scope)

    def test_a_playlist_id_is_not_a_collection_id(self, world):
        folder = world.collections.create_folder("Crates")

        with pytest.raises(ScopeNotFoundError):
            world.plays(scope=PlaysScope("collection", int(folder.id)))


# ---------------------------------------------- what each row opens

WINDOWS = {
    "all time": {},
    "since a date": midnight("2026-02-01"),
}


class TestEveryRuleSetOpensWhatItCounts:
    @pytest.mark.parametrize("kind", SCOPES)
    def test_all_time_rows_match_the_librarys_count_for_their_rules(self, world, kind):
        answer = world.plays(scope=scope_of(world, kind), limit=200)

        for section in ("artists", "labels"):
            for row in answer[section]:
                assert world.count(row["rules"]) == row["tracks"], (kind, row)
        for section in ("never_played", "unknown"):
            rules = answer[section]["rules"]
            assert world.count(rules) == answer[section]["count"], (kind, section)

    @pytest.mark.parametrize("kind", SCOPES)
    def test_every_rule_set_is_valid_and_carries_the_scopes_rules(self, world, kind):
        scope = scope_of(world, kind)
        answer = world.plays(scope=scope, limit=200)
        scope_rules = world.statistics.scope_rules(scope)

        buckets = [
            answer["never_played"]["rules"],
            answer["unknown"]["rules"],
            *(r["rules"] for r in answer["artists"] + answer["labels"]),
        ]
        for rules in buckets:
            parsed = RuleSet.from_dict(rules).validated()
            assert parsed.match == "all"
            assert parsed.rules[: len(scope_rules.rules)] == scope_rules.rules

    def test_a_collection_scope_is_the_collection_rule(self, world):
        scope = scope_of(world, "collection")
        answer = world.plays(scope=scope)

        assert answer["never_played"]["rules"]["rules"] == [
            {"field": "collection", "operator": "in_collection", "value": scope.id},
            {"field": "play_count", "operator": "is", "value": 0},
        ]

    def test_a_playlist_scope_is_the_in_playlist_rule(self, world):
        answer = world.plays(scope=scope_of(world, "playlist"))

        assert answer["unknown"]["rules"]["rules"][0] == {
            "field": "in_playlist",
            "operator": "any_of",
            "value": [{"kind": "playlist", "id": world.playlist_id}],
        }

    def test_an_artist_row_names_the_artist_by_its_display_name(self, world):
        row = world.plays()["artists"][0]

        assert row["rules"]["rules"] == [
            {"field": "artist_name", "operator": "is", "value": "B"},
            {"field": "play_count", "operator": "gt", "value": 0},
        ]

    def test_a_label_row_names_the_label_by_its_display_name(self, world):
        row = world.plays()["labels"][0]

        assert row["rules"]["rules"] == [
            {"field": "label_name", "operator": "is", "value": "Nightfall"},
            {"field": "play_count", "operator": "gt", "value": 0},
        ]

    @pytest.mark.parametrize("kind", SCOPES)
    def test_a_since_row_opens_at_least_what_it_counts(self, world, kind):
        answer = world.plays(
            scope=scope_of(world, kind), limit=200, **WINDOWS["since a date"]
        )

        for row in answer["artists"] + answer["labels"]:
            assert row["opens_more"] is True
            assert world.count(row["rules"]) >= row["tracks"], (kind, row)


# ------------------------------------------------------ further cases


class TestTheEdgesOfAWindow:
    def test_a_read_stamped_at_local_midnight_counts_for_that_day(self, world):
        with world.db.transaction() as conn:
            conn.execute(
                "UPDATE library_reads SET read_at = ? WHERE id = ?",
                ("2026-03-10T00:00:00+00:00", world.reads[2]),
            )

        answer = world.plays(**midnight("2026-03-10"))

        assert shown(answer) == SINCE_MARCH

    def test_the_window_starts_at_the_lowest_id_whatever_the_clock_did(self, world):
        # r2 was stamped after r3 (the clock moved back): both are after Mar 1.
        with world.db.transaction() as conn:
            conn.execute(
                "UPDATE library_reads SET read_at = ? WHERE id = ?",
                ("2026-03-11T12:00:00+00:00", world.reads[1]),
            )

        answer = world.plays(**midnight("2026-03-01"))

        assert shown(answer) == SINCE_FEB

    def test_a_count_unknown_for_a_read_and_known_again_rises_from_before(self, world):
        # Hotel is 5 at r2, unknown at r3 (nothing stored) and 8 at r4.
        hotel = world.ids[8]
        with world.db.transaction() as conn:
            conn.executemany(
                "INSERT INTO play_counts (track_id, read_id, play_count)"
                " VALUES (?, ?, ?)",
                [(hotel, world.reads[1], 5), (hotel, world.reads[3], 8)],
            )
            conn.execute("UPDATE tracks SET play_count = 8 WHERE id = ?", (hotel,))

        answer = world.plays(limit=200, **midnight("2026-02-01"))

        by_title = {row["title"]: row["plays"] for row in answer["tracks"]}
        # Its first stored row is its baseline; r4 rises 3 from it.
        assert by_title["Hotel"] == 3
        assert answer["unknown"]["count"] == 0


class TestAPlaylistFolder:
    def test_a_folder_is_the_union_of_what_is_under_it(self, world):
        root = (
            world.db.connect()
            .execute(
                "SELECT parent_id FROM rekordbox_playlists WHERE id = ?",
                (world.playlist_id,),
            )
            .fetchone()[0]
        )
        with world.db.transaction() as conn:
            cool = conn.execute(
                "INSERT INTO rekordbox_playlists (parent_id, name, kind, depth,"
                " position, rekordbox_path, parent_path) VALUES"
                " (?, 'Cool', 'playlist', 1, 1, 'ROOT/Cool', 'ROOT')",
                (root,),
            ).lastrowid
            conn.executemany(
                "INSERT INTO rekordbox_playlist_tracks (playlist_id, track_id,"
                " position) VALUES (?, ?, ?)",
                [(cool, world.ids[6], 0), (cool, world.ids[7], 1)],
            )

        answer = world.plays(scope=PlaysScope("playlist", root), limit=200)

        # Warm holds Alpha and Bravo (and two unplayed); Cool, Foxtrot and Golf.
        assert rows(answer["tracks"], "title") == [
            ("Alpha", 20),
            ("Bravo", 9),
            ("Golf", 8),
            ("Foxtrot", 7),
        ]
        assert answer["never_played"]["count"] == 1
        assert answer["unknown"]["count"] == 1
        for row in answer["artists"] + answer["labels"]:
            assert world.count(row["rules"]) == row["tracks"]


class TestTiesBetweenNames:
    def test_artists_and_labels_with_equal_plays_sort_by_key(self, world):
        # Give Hotel's artist F and a new label the same plays as D and
        # Override Rec (1 for one track): all tied, then ordered by key.
        with world.db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET play_count = 1, label = 'Aardvark',"
                " label_key = 'aardvark' WHERE id = ?",
                (world.ids[8],),
            )

        answer = world.plays(limit=200)

        artists = [(a["name_key"], a["plays"]) for a in answer["artists"]]
        assert artists[-3:] == [("c", 3), ("d", 2), ("f", 1)]
        labels = [(l_["label_key"], l_["plays"]) for l_ in answer["labels"]]
        assert labels[-2:] == [("aardvark", 1), ("override rec", 1)]
        # Ties cut at the limit keep the earlier key.
        assert [a["name_key"] for a in world.plays(limit=10)["artists"]] == [
            key for key, _ in artists
        ][:10]
