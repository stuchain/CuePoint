#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Similar Tracks' reads (DISCOVER-08): each criterion, the scope, the spellings.

The service's tests hold the whole answer to a brute force; these hold each
read to what it promises on its own, so a failure names the read that broke.
"""

from __future__ import annotations

from typing import List, Optional

import pytest

from cuepoint.models.collection import KIND_COLLECTION, Collection
from cuepoint.models.duplicate_group import SIGNAL_TEXT, ScannedGroup
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.similarity_repository import SimilarityRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, build_select_scoped
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.key_support import accept_with_key

pytestmark = pytest.mark.unit

NOW = "2026-09-26T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> SimilarityRepository:
    return SimilarityRepository(db)


class Adder:
    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.count = 0

    def __call__(
        self,
        artist: str = "Someone",
        *,
        title: Optional[str] = None,
        bpm: Optional[float] = None,
        key: Optional[str] = None,
        genre: Optional[str] = None,
        label: Optional[str] = None,
        remixer: Optional[str] = None,
    ) -> int:
        self.count += 1
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(self.count),
                file_path=f"/m/{self.count}.mp3",
                title=title or f"T{self.count}",
                artist=artist,
                remixer=remixer,
                bpm=bpm,
                genre=genre,
                label=label,
            )
        )
        assert stored.id is not None
        if key is not None:
            # Beatport's key by an accepted match (DEC-201), not Rekordbox's.
            accept_with_key(self.db, stored.id, key)
        return stored.id


@pytest.fixture
def add(db) -> Adder:
    return Adder(db)


def found(rows) -> List[int]:
    return sorted(row.track_id for row in rows)


class TestTheSeed:
    def test_a_seed_is_read_with_every_credit(self, add, repo):
        seed = add(
            "A, B feat. C", bpm=128.0, key="8A", genre="House", label="L", remixer="D"
        )
        row = repo.seed(seed)
        assert row is not None
        assert (row.track_id, row.bpm, row.key, row.genre, row.label) == (
            seed,
            128.0,
            "8A",
            "House",
            "L",
        )
        assert sorted(row.artist_keys) == ["a", "b", "c", "d"]

    def test_a_seed_is_read_with_its_overrides(self, add, repo, db):
        seed = add(bpm=128.0, key="8A", genre="House", label="L")
        meta = TrackMetadataRepository(db)
        meta.set_override(seed, "bpm", 124.0)
        meta.set_override(seed, "key", "9A")
        meta.set_override(seed, "genre", "Techno")
        meta.set_override(seed, "label", "M")
        row = repo.seed(seed)
        assert (row.bpm, row.key, row.genre, row.label) == (124.0, "9A", "Techno", "M")

    def test_no_such_seed(self, repo):
        assert repo.seed(12) is None


class TestCandidates:
    def test_each_criterion_on_its_own(self, add, repo):
        tempo = add("P", bpm=126.0)
        genre = add("Q", genre="House")
        label = add("R", label="L")
        key = add("S", key="9A")
        artist = add("T, Kept")
        add("U", bpm=90.0, genre="Techno", label="M", key="3B")
        everything = BrowseQuery()
        assert found(repo.candidates(everything, tempo_ranges=[(120.0, 130.0)])) == [
            tempo
        ]
        assert found(repo.candidates(everything, genres=["House"])) == [genre]
        assert found(repo.candidates(everything, labels=["L"])) == [label]
        assert found(repo.candidates(everything, keys=["9A"])) == [key]
        assert found(repo.candidates(everything, artist_keys=["kept"])) == [artist]

    def test_criteria_are_alternatives(self, add, repo):
        tempo = add("P", bpm=126.0)
        genre = add("Q", genre="House")
        add("U", bpm=90.0, genre="Techno")
        assert found(
            repo.candidates(
                BrowseQuery(), tempo_ranges=[(120.0, 130.0)], genres=["House"]
            )
        ) == [tempo, genre]

    def test_tempo_ranges_are_inclusive_and_several(self, add, repo):
        low = add(bpm=120.0)
        high = add(bpm=130.0)
        half = add(bpm=64.0)
        add(bpm=130.01)
        rows = repo.candidates(
            BrowseQuery(), tempo_ranges=[(120.0, 130.0), (60.0, 65.0)]
        )
        assert found(rows) == [low, high, half]

    def test_spellings_are_compared_exactly(self, add, repo):
        add(genre="house")
        exact = add(genre="House")
        assert found(repo.candidates(BrowseQuery(), genres=["House"])) == [exact]

    def test_the_effective_value_is_what_is_compared(self, add, repo, db):
        moved = add(bpm=90.0, genre="Techno")
        TrackMetadataRepository(db).set_override(moved, "bpm", 126.0)
        TrackMetadataRepository(db).set_override(moved, "genre", "House")
        rows = list(repo.candidates(BrowseQuery(), tempo_ranges=[(120.0, 130.0)]))
        assert [(r.track_id, r.bpm, r.genre) for r in rows] == [(moved, 126.0, "House")]
        assert found(repo.candidates(BrowseQuery(), genres=["Techno"])) == []

    def test_no_criterion_reads_nothing(self, add, repo):
        add(bpm=126.0)
        assert list(repo.candidates(BrowseQuery())) == []

    def test_excluded_tracks_are_not_read(self, add, repo):
        one = add(bpm=126.0)
        two = add(bpm=126.0)
        three = add(bpm=126.0)
        rows = repo.candidates(
            BrowseQuery(), tempo_ranges=[(120.0, 130.0)], exclude=[one, three, 999]
        )
        assert found(rows) == [two]

    def test_a_candidate_carries_only_the_credits_asked_about(self, add, repo):
        both = add("A, B, C", bpm=126.0)
        one = add("B", bpm=126.0, remixer="Z")
        none = add("Y", bpm=126.0)
        rows = {
            row.track_id: row.artist_keys
            for row in repo.candidates(
                BrowseQuery(),
                tempo_ranges=[(120.0, 130.0)],
                credits_among=["c", "a", "z"],
            )
        }
        assert rows == {both: ("a", "c"), one: ("z",), none: ()}

    def test_a_name_credited_twice_on_a_track_is_carried_once(self, add, repo):
        # The artist remixing their own track: two credit rows, one key.
        both = add("Âme", bpm=126.0, remixer="AME")
        [row] = repo.candidates(
            BrowseQuery(), tempo_ranges=[(120.0, 130.0)], credits_among=["ame"]
        )
        assert (row.track_id, row.artist_keys) == (both, ("ame",))

    def test_without_credits_asked_about_a_candidate_carries_none(self, add, repo):
        add("A", bpm=126.0)
        [row] = repo.candidates(BrowseQuery(), tempo_ranges=[(120.0, 130.0)])
        assert row.artist_keys == ()

    def test_every_scope_at_once_binds_in_order(self, add, repo, db):
        # A playlist CTE, a Collection CTE, a text query, a rule, a criterion
        # and an exclusion each bind parameters. Put together, only one track
        # meets all of them, which it would not if any bound in the wrong place.
        wanted = add("Zed", title="Needle", bpm=126.0, genre="House")
        add("Zed", title="Needle", bpm=126.0, genre="Techno")
        add("Zed", title="Other", bpm=126.0, genre="House")
        excluded = add("Zed", title="Needle", bpm=126.0, genre="House")
        add("Zed", title="Needle", bpm=90.0, genre="House")
        refs = [str(n) for n in range(1, 6)]
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="p",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="p",
                    track_refs=refs,
                )
            ]
        )
        collections = CollectionRepository(db)
        crate = collections.create(Collection(name="c", kind=KIND_COLLECTION))
        collections.add(crate.id, list(range(1, 6)))
        scope = BrowseQuery(
            query="needle",
            playlist_id=playlists.list_all()[0].id,
            collection_id=crate.id,
            rules=RuleSet(rules=(FilterRule("genre", "is", "House"),)),
        )
        rows = repo.candidates(scope, tempo_ranges=[(120.0, 130.0)], exclude=[excluded])
        assert found(rows) == [wanted]

    def test_the_scope_is_checked(self, repo):
        with pytest.raises(ValueError):
            list(repo.candidates(BrowseQuery(direction="sideways"), genres=["x"]))


class TestSpellings:
    def test_each_effective_value_once(self, add, repo, db):
        add(genre="House")
        add(genre="House")
        add(genre="house")
        moved = add(genre="Techno")
        add()
        TrackMetadataRepository(db).set_override(moved, "genre", "Deep House")
        assert repo.spellings("genre") == ["Deep House", "House", "house"]

    def test_keys_and_labels(self, add, repo):
        add(key="8A", label="L")
        add(key="Am", label="M")
        add(key="C", label="M")
        # Keys are Camelot, one spelling for one key (DEC-201).
        assert repo.spellings("key") == ["8A", "8B"]
        assert repo.spellings("label") == ["L", "M"]

    def test_only_the_three_fields(self, repo):
        with pytest.raises(ValueError):
            repo.spellings("title")


class TestDuplicates:
    def test_the_other_members_of_every_group_shown_with_the_track(self, add, repo, db):
        seed, a, b, c = add(), add(), add(), add()
        groups = DuplicateRepository(db)
        with db.transaction():
            groups.replace_signal(
                SIGNAL_TEXT,
                [
                    ScannedGroup(SIGNAL_TEXT, "k1", (seed, a)),
                    ScannedGroup(SIGNAL_TEXT, "k2", (seed, b)),
                    ScannedGroup(SIGNAL_TEXT, "k3", (b, c)),
                ],
                NOW,
            )
        assert repo.duplicates_of(seed) == {a, b}
        assert repo.duplicates_of(c) == {b}
        assert repo.duplicates_of(999) == set()


class TestTheBuilder:
    def test_a_condition_with_no_scope(self):
        sql, params = build_select_scoped(
            BrowseQuery(), "tracks.id", condition="tracks.id = ?", params=(4,)
        )
        assert sql == "SELECT tracks.id FROM tracks WHERE (tracks.id = ?)"
        assert params == (4,)

    def test_no_condition_is_the_scope_alone(self):
        sql, params = build_select_scoped(BrowseQuery(), "tracks.id")
        assert sql == "SELECT tracks.id FROM tracks"
        assert params == ()

    def test_an_unknown_join_is_refused(self):
        with pytest.raises(ValueError):
            build_select_scoped(BrowseQuery(), "tracks.id", joins=("nowhere",))


class TestItWritesNothing:
    def test_no_read_changes_the_database(self, add, repo, db):
        seed = add("A", bpm=126.0, genre="House", key="8A", label="L")
        add("A", bpm=126.0)
        conn = db.connect()
        before = conn.total_changes
        repo.seed(seed)
        list(
            repo.candidates(
                BrowseQuery(),
                tempo_ranges=[(1.0, 300.0)],
                genres=["House"],
                labels=["L"],
                keys=["8A"],
                artist_keys=["a"],
                credits_among=["a"],
            )
        )
        repo.spellings("genre")
        repo.duplicates_of(seed)
        assert conn.total_changes == before
