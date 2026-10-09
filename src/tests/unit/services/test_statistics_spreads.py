#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the spreads the Statistics page answers with (STATS-03).

A library of nine tracks imported from fixture XML, a CuePoint override on two of
them, file checks, match states and a ``waveforms.db``, then the six spreads. The
expected numbers are written out below from the effective values, not computed by
the code under test:

===== ====== ======= ===== ====== ============ ==========================
track genre  bpm     year  rating date added   notes
===== ====== ======= ===== ====== ============ ==========================
a     House  124.49  2020  5      2026-09-01
b     house  124.5   2020  4      2026-09-15
c     HOUSE  123.5   2019  -      2026-09-1    a malformed day, in Sept.
d     Techno 124.0   2021  0      2026-10-02
e     -      -       -     -      soon         overrides: bpm 128, year
                                                2022, rating 2
f     -      -       2021  3      -            override: genre Techno
g     Disco  100.2   2018  5      2026-09-31
h     Disco  99.5    2018  5      2026-09-31   a time after the 31st
                                   12:00        leaves the month's range
i     Deep   90      2017  1      2026-08-31
===== ====== ======= ===== ====== ============ ==========================

Every rule set a bucket returns is also run through ``browse_count``: the number on
the bar and the Library it opens are one statement, in each scope.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import Mock

import pytest

from cuepoint.data.audio_decode import ANALYSIS_VERSION, LOUDNESS_VERSION
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    TrackFileStatus,
)
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.waveform import STORED_FAILED, StoredLoudness, StoredWaveform
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.statistics_repository import StatisticsRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.persistence.waveform_store import (
    PATH_CHUNK,
    WaveformStore,
    WaveformStoreError,
)
from cuepoint.persistence.waveform_work_repository import WaveformWorkRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.statistics_service import (
    GENRE_LIMIT,
    PlaysScope,
    ScopeNotFoundError,
    StatisticsService,
)
from cuepoint.services.waveform_analysis_service import WaveformAnalysisService

pytestmark = pytest.mark.unit

NOW = "2026-10-01T10:00:00+00:00"

#: ``(name, genre, bpm, year, rating, date added)``; ``None`` leaves the attribute out.
TRACKS = (
    ("a", "House", "124.49", "2020", "5", "2026-09-01"),
    ("b", "house", "124.5", "2020", "4", "2026-09-15"),
    ("c", "HOUSE", "123.5", "2019", None, "2026-09-1"),
    ("d", "Techno", "124.0", "2021", "0", "2026-10-02"),
    ("e", None, None, None, None, "soon"),
    ("f", None, None, "2021", "3", None),
    ("g", "Disco", "100.2", "2018", "5", "2026-09-31"),
    ("h", "Disco", "99.5", "2018", "5", "2026-09-31 12:00"),
    ("i", "Deep", "90", "2017", "1", "2026-08-31"),
)

#: Playlist "Warm", the Collection, the Set: these tracks (a, c, e, f).
FILED = ("a", "c", "e", "f")

SCOPES = ("library", "collection", "set", "smart", "playlist")


def track_xml(index: int, row) -> str:
    name, genre, bpm, year, rating, added = row
    attrs = [
        f'TrackID="{index}"',
        f'Name="{name}"',
        'Artist="A"',
        f'Location="file://localhost/m/{name}.mp3"',
    ]
    for key, value in (
        ("Genre", genre),
        ("AverageBpm", bpm),
        ("Year", year),
        ("Rating", rating),
        ("DateAdded", added),
    ):
        if value is not None:
            attrs.append(f'{key}="{value}"')
    return f"<TRACK {' '.join(attrs)}/>"


def write_export(tmp_path: Path, rows=TRACKS, filed=FILED) -> str:
    ids = {row[0]: index for index, row in enumerate(rows, start=1)}
    members = "".join(f'<TRACK Key="{ids[name]}"/>' for name in filed)
    path = tmp_path / "collection.xml"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{len(rows)}">\n'
        + "\n".join(track_xml(i, row) for i, row in enumerate(rows, start=1))
        + "\n  </COLLECTION>\n"
        '  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">'
        f'<NODE Name="Warm" Type="1" Entries="{len(filed)}">{members}</NODE>'
        "</NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


@dataclass
class SpreadWorld:
    """A library, its waveform store, and everything a test asks them with."""

    db: DatabaseService
    store: WaveformStore
    statistics: StatisticsService
    analysis: WaveformAnalysisService
    library: LibraryService
    collections: CollectionService
    ids: Dict[str, int]  # track name -> tracks.id
    playlist_id: int

    def path(self, name: str) -> str:
        row = (
            self.db.connect()
            .execute("SELECT file_path FROM tracks WHERE id = ?", (self.ids[name],))
            .fetchone()
        )
        return str(row[0])

    def scope(self, kind: str) -> PlaysScope:
        if kind == "library":
            return PlaysScope("library")
        if kind == "playlist":
            return PlaysScope("playlist", self.playlist_id)
        if kind == "smart":
            node = self.collections.create_smart(
                "House", RuleSet(rules=(FilterRule("genre", "is", "house"),))
            )
        else:
            make = (
                self.collections.create_set
                if kind == "set"
                else self.collections.create_collection
            )
            node = make("Filed")
            self.collections.add_tracks(int(node.id), [self.ids[n] for n in FILED])
        return PlaysScope("collection", int(node.id))

    def count(self, rules: RuleSet) -> int:
        return self.library.browse_count(rules=rules)

    def record_match(self, name: str, state: str) -> None:
        """Give a track a match state, with the attempt that state points at."""
        with self.db.transaction() as conn:
            attempt = conn.execute(
                "INSERT INTO match_attempts (track_id, started_at, finished_at,"
                " outcome, input_json) VALUES (?, ?, ?, 'no_match', '{}')",
                (self.ids[name], NOW, NOW),
            ).lastrowid
            conn.execute(
                "INSERT INTO track_match (track_id, state, decided_by, attempt_id,"
                " decided_at) VALUES (?, ?, 'auto', ?, ?)",
                (self.ids[name], state, attempt, NOW),
            )

    def check(
        self, name: str, status: str, *, path: Optional[str] = None, at: str = NOW
    ) -> None:
        FileStatusRepository(self.db).record(
            [
                TrackFileStatus(
                    self.ids[name],
                    status,
                    path or self.path(name),
                    at,
                    size_bytes=None if status == FILE_MISSING else 1000,
                )
            ]
        )

    def store_row(
        self,
        name: str,
        *,
        lufs: Optional[float] = None,
        loudness_version: int = LOUDNESS_VERSION,
        size: int = 1000,
        failed: bool = False,
    ) -> None:
        loudness = (
            None
            if lufs is None
            else StoredLoudness(loudness_version, integrated_lufs=lufs, peak_dbfs=-1.0)
        )
        common = dict(
            path=self.path(name),
            size_bytes=size,
            mtime_ns=1,
            analysis_version=ANALYSIS_VERSION,
            analysed_at=NOW,
        )
        if failed:
            row = StoredWaveform(state=STORED_FAILED, reason="undecodable", **common)
        else:
            row = StoredWaveform(
                state="ready",
                duration_ms=1000,
                data=b"CPWF" + bytes(8),
                loudness=loudness,
                **common,
            )
        self.store.put(row)

    def spreads(self, kind: str = "library") -> Dict[str, Any]:
        return self.statistics.spreads(self.scope(kind)).to_dict()


def build_spread_world(tmp_path: Path) -> SpreadWorld:
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    tracks = TrackRepository(db)
    playlists = PlaylistRepository(db)
    LibraryImportService(
        tracks, playlists, LibrarySourceRepository(db), db
    ).import_rekordbox_xml(write_export(tmp_path))
    connection = db.connect()
    ids = {
        str(r[0]): int(r[1]) for r in connection.execute("SELECT title, id FROM tracks")
    }
    with db.transaction():
        overrides = TrackMetadataRepository(db)
        overrides.set_override(ids["e"], "bpm", 128)
        overrides.set_override(ids["e"], "year", 2022)
        overrides.set_rating(ids["e"], 2)
        overrides.set_override(ids["f"], "genre", "Techno")
    playlist_id = int(
        connection.execute(
            "SELECT id FROM rekordbox_playlists WHERE name = 'Warm'"
        ).fetchone()[0]
    )
    activity = ActivityService(ActivityRepository(db), tracks)
    collection_repo = CollectionRepository(db)
    collections = CollectionService(collection_repo, db, tracks, activity, playlists)
    library = LibraryService(
        tracks, collection_repo, TrackMetadataRepository(db), AuthoredDataRepository(db)
    )
    store = WaveformStore(tmp_path / "waveforms.db")
    analysis = WaveformAnalysisService(WaveformWorkRepository(db), store, Mock())
    statistics = StatisticsService(
        StatisticsRepository(db),
        collections,
        playlists,
        waveform_store=store,
        analysis_service=analysis,
    )
    world = SpreadWorld(
        db, store, statistics, analysis, library, collections, ids, playlist_id
    )
    # Files: a, b, g, h, i present; c missing; d unreadable; e checked at a path
    # it no longer has; f never checked.
    for name in ("a", "b", "g", "h", "i"):
        world.check(name, FILE_PRESENT)
    world.check("c", FILE_MISSING, at="2026-10-02T08:00:00+00:00")
    world.check("d", FILE_UNREADABLE)
    world.check("e", FILE_PRESENT, path="/old/e.mp3", at="2026-10-09T08:00:00+00:00")
    # Beatport: one of each state; the other five were never matched.
    for name, state in (
        ("a", "accepted"),
        ("b", "needs_review"),
        ("c", "rejected"),
        ("d", "no_match"),
    ):
        world.record_match(name, state)
    # Loudness and analysis: a and b measured; g's file is not the size that was
    # measured; h was measured by an older version; i failed; c was measured too
    # but its file is missing.
    world.store_row("a", lufs=-9.2)
    world.store_row("b", lufs=-8.4)
    world.store_row("c", lufs=-8.0)
    world.store_row("g", lufs=-9.9, size=999)
    world.store_row("h", lufs=-7.0, loudness_version=LOUDNESS_VERSION + 1)
    world.store_row("i", failed=True)
    return world


@pytest.fixture
def world(tmp_path):
    built = build_spread_world(tmp_path)
    yield built
    built.store.close_all()
    built.db.close_all()


def lines(spread: Dict[str, Any]) -> List[tuple]:
    """``(label, count)`` of each bucket, in order."""
    return [(b["label"], b["count"]) for b in spread["buckets"]]


class TestGenre:
    def test_genres_group_without_case_commonest_first(self, world):
        genre = world.spreads()["genre"]

        # House, house and HOUSE are one genre named by its smallest spelling;
        # f's CuePoint genre makes it Techno; e has none.
        assert lines(genre) == [
            ("HOUSE", 3),
            ("Disco", 2),
            ("Techno", 2),
            ("Deep", 1),
        ]
        assert genre["unknown"]["label"] == "No genre"
        assert genre["unknown"]["count"] == 1
        assert genre["total"] == 9

    def test_each_genre_opens_with_the_is_rule_the_filter_matches_case_blind(
        self, world
    ):
        first = world.spreads()["genre"]["buckets"][0]

        assert first["value"] == "HOUSE"
        assert first["rules"]["rules"] == [
            {"field": "genre", "operator": "is", "value": "HOUSE"}
        ]
        assert world.count(RuleSet.from_dict(first["rules"])) == 3

    def test_no_genre_opens_the_empty_rule(self, world):
        unknown = world.spreads()["genre"]["unknown"]

        assert unknown["rules"]["rules"] == [{"field": "genre", "operator": "is_empty"}]

    def test_the_top_twenty_are_cut_and_the_rest_are_other(self, world):
        # 25 more genres of 1 to 25 tracks: the 20 commonest (25 down to 6) keep a
        # bar; the five smallest and the fixture's own genres are Other.
        with world.db.transaction() as conn:
            for genre in range(25):
                for copy in range(genre + 1):
                    conn.execute(
                        "INSERT INTO tracks (rekordbox_track_id, title, artist,"
                        " file_path, normalized_path, genre, created_at, updated_at)"
                        " VALUES (?, 'x', 'A', '', ?, ?, ?, ?)",
                        (
                            f"g{genre}-{copy}",
                            f"g{genre}-{copy}",
                            f"Genre {genre:02d}",
                            NOW,
                            NOW,
                        ),
                    )
        report = world.spreads()["genre"]

        assert len(report["buckets"]) == GENRE_LIMIT + 1
        assert [b["count"] for b in report["buckets"][:GENRE_LIMIT]] == list(
            range(25, 5, -1)
        )
        other = report["buckets"][-1]
        assert other == {
            "label": "Other",
            "value": None,
            "count": (1 + 2 + 3 + 4 + 5) + 3 + 2 + 2 + 1,
            "rules": None,
        }
        assert report["buckets"][0]["label"] == "Genre 24"
        assert report["unknown"]["count"] == 1
        assert report["total"] == 9 + sum(range(1, 26))


class TestTempo:
    def test_a_tempo_is_floor_of_bpm_plus_a_half(self, world):
        tempo = world.spreads()["tempo"]

        # 124.49 -> 124, 124.5 -> 125 (not Python's round), 123.5 -> 124,
        # 124.0 -> 124, e's CuePoint 128, and 100.2 and 99.5 both -> 100.
        assert lines(tempo) == [
            ("90 BPM", 1),
            ("100 BPM", 2),
            ("124 BPM", 3),
            ("125 BPM", 1),
            ("128 BPM", 1),
        ]
        assert [b["value"] for b in tempo["buckets"]] == [90, 100, 124, 125, 128]
        assert tempo["unknown"] == {
            "label": "No tempo",
            "count": 1,
            "rules": {
                "match": "all",
                "rules": [{"field": "bpm", "operator": "is_empty"}],
            },
        }

    def test_a_tempo_opens_its_half_open_range(self, world):
        bucket = world.spreads()["tempo"]["buckets"][2]

        assert bucket["rules"]["rules"] == [
            {"field": "bpm", "operator": "gte", "value": 123.5},
            {"field": "bpm", "operator": "lt", "value": 124.5},
        ]

    def test_a_bpm_under_a_half_is_no_tempo_not_a_zero_bar(self, world):
        # bpm < 0.5 would round to 0, whose rule (bpm < 0.5) also finds a BPM of
        # zero or less; it is counted apart, not opened.
        with world.db.transaction() as conn:
            conn.execute("UPDATE tracks SET bpm = 0.3 WHERE id = ?", (world.ids["i"],))
        tempo = world.spreads()["tempo"]

        assert "0 BPM" not in [b["label"] for b in tempo["buckets"]]
        assert tempo["unknown"]["count"] == 2
        assert tempo["unknown"]["rules"] is None
        assert tempo["total"] == 9

    def test_a_bpm_of_exactly_a_half_is_the_one_bpm_bucket(self, world):
        with world.db.transaction() as conn:
            conn.execute("UPDATE tracks SET bpm = 0.5 WHERE id = ?", (world.ids["i"],))
        bucket = world.spreads()["tempo"]["buckets"][0]

        assert (bucket["label"], bucket["count"]) == ("1 BPM", 1)
        assert world.count(RuleSet.from_dict(bucket["rules"])) == 1

    def test_a_bpm_that_is_not_positive_is_counted_but_cannot_be_opened(self, world):
        with world.db.transaction() as conn:
            conn.execute("UPDATE tracks SET bpm = 0 WHERE id = ?", (world.ids["i"],))
        tempo = world.spreads()["tempo"]

        assert tempo["unknown"]["count"] == 2
        assert tempo["unknown"]["rules"] is None
        assert tempo["total"] == 9


class TestYear:
    def test_one_bucket_per_effective_year(self, world):
        year = world.spreads()["year"]

        assert lines(year) == [
            ("2017", 1),
            ("2018", 2),
            ("2019", 1),
            ("2020", 2),
            ("2021", 2),
            ("2022", 1),
        ]
        assert year["buckets"][3]["rules"]["rules"] == [
            {"field": "year", "operator": "is", "value": 2020}
        ]
        assert year["unknown"]["label"] == "No year"
        assert year["unknown"]["count"] == 0
        assert year["total"] == 9

    def test_a_year_of_zero_is_no_year_but_cannot_be_opened(self, world):
        with world.db.transaction() as conn:
            conn.execute("UPDATE tracks SET year = 0 WHERE id = ?", (world.ids["i"],))
        year = world.spreads()["year"]

        assert year["unknown"]["count"] == 1
        assert year["unknown"]["rules"] is None
        assert year["total"] == 9


class TestDateAdded:
    def test_months_are_counted_by_the_text_range_the_filter_compares(self, world):
        dates = world.spreads()["date_added"]

        # 2026-09-1 is September's by text; 2026-09-31 12:00 is past its range, and
        # "soon" and the missing date are no month at all.
        assert lines(dates) == [("2026-08", 1), ("2026-09", 4), ("2026-10", 1)]
        assert dates["unknown"] == {"label": "Unknown date", "count": 3, "rules": None}
        assert dates["total"] == 9

    def test_a_month_opens_its_between_rule(self, world):
        september = world.spreads()["date_added"]["buckets"][1]

        assert september["rules"]["rules"] == [
            {
                "field": "date_added",
                "operator": "between",
                "value": ["2026-09-01", "2026-09-31"],
            }
        ]
        assert world.count(RuleSet.from_dict(september["rules"])) == 4

    def test_text_that_is_not_a_month_is_unknown(self, world):
        with world.db.transaction() as conn:
            for text in ("2026-13-05", "20260905", "2026-09-", "abcd-ef-gh", ""):
                conn.execute(
                    "UPDATE tracks SET date_added = ? WHERE id = ?",
                    (text, world.ids["i"]),
                )
                dates = world.statistics.spreads().to_dict()["date_added"]
                assert ("2026-08", 1) not in lines(dates), text
                assert dates["total"] == 9, text


class TestRating:
    def test_zero_to_five_stars_and_unrated_from_the_effective_rating(self, world):
        rating = world.spreads()["rating"]

        # e's CuePoint rating of 2 is its rating; c has none.
        assert lines(rating) == [
            ("0 stars", 1),
            ("1 star", 1),
            ("2 stars", 1),
            ("3 stars", 1),
            ("4 stars", 1),
            ("5 stars", 3),
        ]
        assert [b["value"] for b in rating["buckets"]] == [0, 1, 2, 3, 4, 5]
        assert rating["unknown"]["label"] == "Unrated"
        assert rating["unknown"]["count"] == 1
        assert rating["unknown"]["rules"]["rules"] == [
            {"field": "rating", "operator": "is_empty"}
        ]

    def test_every_star_is_shown_though_no_track_has_it(self, world):
        with world.db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE title IN ('a', 'g', 'h')")
        rating = world.spreads()["rating"]

        assert [b["count"] for b in rating["buckets"]][5] == 0
        assert len(rating["buckets"]) == 6


class TestLoudness:
    def test_buckets_are_whole_lufs_for_present_files_at_the_current_version(
        self, world
    ):
        loudness = world.spreads()["loudness"]

        # a -9.2 -> -10 and b -8.4 -> -9. c is measured but its file is missing;
        # g's file changed size; h was measured by another version; i failed.
        assert lines(loudness) == [("-10 LUFS", 1), ("-9 LUFS", 1)]
        assert [b["value"] for b in loudness["buckets"]] == [-10, -9]
        assert loudness["unknown"] == {
            "label": "Not measured",
            "count": 3,
            "rules": None,
        }
        # c (missing), d (unreadable), e (checked at another path), f (never).
        assert loudness["no_file"] == {"label": "No file", "count": 4, "rules": None}
        assert loudness["total"] == 9
        assert all(b["rules"] is None for b in loudness["buckets"])

    def test_the_floor_of_a_whole_number_is_itself(self, world):
        world.store_row("b", lufs=-9.0)

        assert (("-9 LUFS", 1)) in lines(world.spreads()["loudness"])

    def test_no_store_means_nothing_is_measured(self, world):
        service = StatisticsService(
            StatisticsRepository(world.db),
            world.collections,
            PlaylistRepository(world.db),
        )

        loudness = service.spreads().to_dict()["loudness"]

        assert loudness["buckets"] == []
        assert loudness["unknown"]["count"] == 5
        assert loudness["no_file"]["count"] == 4


class TestScopes:
    def test_a_collection_narrows_every_spread(self, world):
        report = world.spreads("collection")

        # a, c, e, f.
        assert report["scope"].startswith("collection:")
        assert report["total"] == 4
        assert lines(report["genre"]) == [("HOUSE", 2), ("Techno", 1)]
        assert report["genre"]["unknown"]["count"] == 1
        assert lines(report["tempo"]) == [("124 BPM", 2), ("128 BPM", 1)]
        assert lines(report["date_added"]) == [("2026-09", 2)]
        assert report["date_added"]["unknown"]["count"] == 2
        assert lines(report["loudness"]) == [("-10 LUFS", 1)]
        assert report["loudness"]["no_file"]["count"] == 3

    def test_the_library_is_named_library(self, world):
        assert world.spreads()["scope"] == "library"

    def test_a_scope_that_is_not_there_is_refused(self, world):
        with pytest.raises(ScopeNotFoundError):
            world.statistics.spreads(PlaysScope("collection", 99_999))
        with pytest.raises(ScopeNotFoundError):
            world.statistics.spreads(PlaysScope("playlist", 99_999))


FIELDS = ("genre", "tempo", "year", "date_added", "rating", "loudness")


@pytest.mark.parametrize("kind", SCOPES)
def test_every_bucket_with_rules_opens_exactly_what_it_counted(world, kind):
    scope = world.scope(kind)
    scope_rules = world.statistics.scope_rules(scope)
    report = world.statistics.spreads(scope).to_dict()
    total = world.count(scope_rules)

    assert report["total"] == total
    checked = 0
    for name in FIELDS:
        spread = report[name]
        parts = spread["buckets"] + [spread["unknown"]]
        if "no_file" in spread:
            parts.append(spread["no_file"])
        # The buckets and the lines that place no track sum to the scope.
        assert sum(p["count"] for p in parts) == spread["total"] == total, name
        for part in parts:
            if part["rules"] is None:
                continue
            rules = RuleSet.from_dict(part["rules"])
            assert world.count(rules) == part["count"], (kind, name, part)
            checked += 1
    assert checked > 0, "no bucket carried a rule to check"


@pytest.mark.parametrize("kind", SCOPES)
def test_every_scope_answers_the_same_six_fields(world, kind):
    report = world.spreads(kind)

    assert set(report) == {"scope", "total", *FIELDS}
    for name in FIELDS:
        expected = {"buckets", "unknown", "total"} | (
            {"no_file"} if name == "loudness" else set()
        )
        assert set(report[name]) == expected, name


class TestReadings:
    """``WaveformStore.readings``, directly: chunks, stale, unmeasured, repeats."""

    def test_chunks_versions_and_repeated_paths(self, tmp_path):
        count = PATH_CHUNK * 2 + 7
        store = WaveformStore(tmp_path / "waveforms.db")
        try:
            expected = {}
            paths = []
            for n in range(count):
                path = f"/m/{n}.mp3"
                paths.append(path)
                if n % 5 == 3:  # of another loudness version
                    loudness = StoredLoudness(
                        LOUDNESS_VERSION + 1, integrated_lufs=-9.0, peak_dbfs=-1.0
                    )
                elif n % 5 == 4:  # analysed, never measured
                    loudness = None
                elif n % 5 == 2:  # too quiet to measure: a reason, no loudness
                    loudness = StoredLoudness(LOUDNESS_VERSION, reason="silent")
                else:
                    lufs = -20.0 + n / 100
                    loudness = StoredLoudness(
                        LOUDNESS_VERSION, integrated_lufs=lufs, peak_dbfs=-1.0
                    )
                    expected[path] = (100 + n, lufs)
                store.put(
                    StoredWaveform(
                        path=path,
                        size_bytes=100 + n,
                        mtime_ns=1,
                        analysis_version=ANALYSIS_VERSION,
                        analysed_at=NOW,
                        state="ready",
                        duration_ms=1,
                        data=b"CPWF",
                        loudness=loudness,
                    )
                )
            asked = [*paths, *paths[:40], "/m/never-stored.mp3"]

            found = store.readings(asked, LOUDNESS_VERSION)

            assert found == expected
            assert len(found) > PATH_CHUNK // 2  # across more than one chunk of paths
            assert store.readings([], LOUDNESS_VERSION) == {}
            assert store.readings(asked, LOUDNESS_VERSION + 1) == {
                p: (100 + n, -9.0) for n, p in enumerate(paths) if n % 5 == 3
            }
        finally:
            store.close_all()


class BrokenStore:
    def readings(self, *_args):
        raise WaveformStoreError("the store is gone")


def test_loudness_with_an_unreadable_store_still_sums_to_the_scope(world):
    service = StatisticsService(
        StatisticsRepository(world.db),
        world.collections,
        PlaylistRepository(world.db),
        waveform_store=BrokenStore(),
    )

    loudness = service.spreads().to_dict()["loudness"]

    assert loudness["buckets"] == []
    assert loudness["unknown"]["count"] == 5
    assert loudness["no_file"]["count"] == 4
    assert loudness["total"] == 9


def test_a_route_reads_one_snapshot_whatever_is_committed_meanwhile(world):
    """A refresh landing between a route's reads must not split its totals."""
    repository = StatisticsRepository(world.db)
    real = repository.genre_spread
    path = world.db.db_path

    def interrupted(scope):
        # Another connection commits a tenth track after `total` was read.
        other = sqlite3.connect(path, isolation_level=None)
        try:
            other.execute(
                "INSERT INTO tracks (rekordbox_track_id, title, artist, file_path,"
                " normalized_path, genre, created_at, updated_at)"
                " VALUES ('late', 'late', 'A', '', '', 'Late', ?, ?)",
                (NOW, NOW),
            )
        finally:
            other.close()
        return real(scope)

    repository.genre_spread = interrupted  # type: ignore[method-assign]
    service = StatisticsService(
        repository,
        world.collections,
        PlaylistRepository(world.db),
        waveform_store=world.store,
        analysis_service=world.analysis,
    )

    report = service.spreads().to_dict()

    assert report["total"] == 9
    for name in FIELDS:
        assert report[name]["total"] == 9, name
    # Outside a snapshot the late track is there for the next reader.
    assert StatisticsRepository(world.db).total(RuleSet()) == 10
