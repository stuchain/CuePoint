#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Similar Tracks over a real library (DISCOVER-08, DEC-096).

Through the real repositories and migrations:

- the seed and every candidate are read as **effective values** (DEC-068);
- the **pre-selection loses nothing**: over generated libraries, the service
  answers exactly what scoring every track in Python answers, the brute force
  written here from the tracks' own columns, independently of the SQL;
- the seed and its **duplicates** (DEC-074) are left out, and a dismissed
  group is not a duplicate;
- a **scope** restricts, and a broken one is refused as the Library refuses it;
- reasons are **written** in the library's key notation, with the seed's own
  spellings;
- nothing is **written** to the database.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple

import pytest

from tests.unit.key_support import accept_with_key
from cuepoint.core.entity_names import ENTITY_NAMES_VERSION, name_key, split_credit
from cuepoint.core.similarity import (
    REASONS,
    MusicalKey,
    Traits,
    rank,
)
from cuepoint.models.collection import KIND_COLLECTION, Collection
from cuepoint.models.duplicate_group import (
    SIGNAL_PATH,
    SIGNAL_TEXT,
    DuplicateDismissal,
    ScannedGroup,
    member_hash,
)
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
from cuepoint.models.similar_tracks import MAX_SIMILAR_LIMIT
from cuepoint.models.tag import Tag
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.rule_references import BrokenRuleError
from cuepoint.persistence.similarity_repository import SimilarityRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.override_values import parse_key
from cuepoint.services.similarity_service import SimilarityService

pytestmark = pytest.mark.unit

NOW = "2026-09-26T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class Library:
    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.meta = TrackMetadataRepository(db)
        self.credits = TrackCreditRepository(db)
        self.count = 0

    def add(
        self,
        artist: str = "Someone",
        *,
        bpm: Optional[float] = None,
        key: Optional[str] = None,
        genre: Optional[str] = None,
        label: Optional[str] = None,
        remixer: Optional[str] = None,
        path: Optional[str] = None,
    ) -> int:
        self.count += 1
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(self.count),
                file_path=path or f"/m/{self.count}.mp3",
                title=f"T{self.count}",
                artist=artist,
                remixer=remixer,
                bpm=bpm,
                key=key,
                genre=genre,
                label=label,
            )
        )
        assert stored.id is not None
        if key:
            # The key is Beatport's, by an accepted match (PAGES-15).
            accept_with_key(self.db, stored.id, key)
        return stored.id


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


@pytest.fixture
def service(db, lib) -> SimilarityService:
    return SimilarityService(SimilarityRepository(db), lib.credits, lib.tracks)


def ids(result) -> List[int]:
    return [s.track_id for s in result.suggestions]


def reasons_of(result, track_id: int) -> List[dict]:
    [found] = [s for s in result.suggestions if s.track_id == track_id]
    return [dict(r) for r in found.reasons]


# ------------------------------------------------------------ the answer


class TestTheAnswer:
    def test_a_list_best_first_with_its_reasons(self, lib, service):
        seed = lib.add("A, B", bpm=128.0, key="8A", genre="Tech House", label="Nite")
        twin = lib.add("C", bpm=128.0, key="8A", genre="Tech House", label="Nite")
        half = lib.add("B feat. D", bpm=64.0, key="9A")
        near = lib.add("E", bpm=125.0, key="8B")
        lib.add("F", bpm=100.0, key="8A", genre="Tech House", label="Nite")
        result = service.similar(seed)
        assert ids(result) == [twin, half, near]
        assert [s.score for s in result.suggestions] == [85.0, 65.0, 42.2]
        assert reasons_of(result, half) == [
            {
                "component": "tempo",
                "detail": "half",
                "points": 30.0,
                "from": 128.0,
                "to": 64.0,
            },
            {
                "component": "key",
                "detail": "adjacent",
                "points": 20.0,
                "from": "8A",
                "to": "9A",
            },
            {"component": "artist", "detail": "shared", "points": 15.0, "names": ["B"]},
        ]
        # The track at 100 BPM is outside every window: never read, so never scored.
        assert result.considered == 3
        assert result.unused == ()

    def test_the_answer_on_the_wire(self, lib, service):
        seed = lib.add(bpm=128.0)
        other = lib.add(bpm=128.0)
        assert service.similar(seed).to_dict() == {
            "seed_id": seed,
            "notation": "camelot",
            "unused": ["key", "genre", "label"],
            "considered": 1,
            "duplicates_excluded": 0,
            "index_current": False,
            "suggestions": [
                {
                    "track_id": other,
                    "score": 45.0,
                    "reasons": [
                        {
                            "component": "tempo",
                            "detail": "same",
                            "points": 30.0,
                            "from": 128.0,
                            "to": 128.0,
                        },
                        {
                            "component": "artist",
                            "detail": "shared",
                            "points": 15.0,
                            "names": ["Someone"],
                        },
                    ],
                }
            ],
        }

    def test_the_same_library_gives_the_same_list_twice(self, lib, service):
        rnd = random.Random(1)
        for _ in range(60):
            lib.add(
                rnd.choice(["A", "B", "C"]),
                bpm=rnd.choice([124.0, 125.0, 126.0, 128.0]),
                key=rnd.choice(["8A", "9A", "8B", "3A"]),
            )
        assert service.similar(1).to_dict() == service.similar(1).to_dict()

    def test_ties_break_by_track_id(self, lib, service):
        seed = lib.add("X", bpm=128.0)
        same = [lib.add(f"Y{n}", bpm=128.0) for n in range(5)]
        result = service.similar(seed)
        assert ids(result) == sorted(same)
        assert len({s.score for s in result.suggestions}) == 1

    def test_the_limit(self, lib, service):
        seed = lib.add("X", bpm=128.0)
        for n in range(10):
            lib.add(f"Y{n}", bpm=128.0)
        assert len(service.similar(seed, limit=3).suggestions) == 3
        assert len(service.similar(seed, limit=MAX_SIMILAR_LIMIT).suggestions) == 10

    @pytest.mark.parametrize("limit", [0, MAX_SIMILAR_LIMIT + 1, True, 5.0, "5"])
    def test_a_limit_that_is_not_one_is_refused(self, lib, service, limit):
        seed = lib.add(bpm=128.0)
        with pytest.raises(ValueError, match="limit"):
            service.similar(seed, limit=limit)

    @pytest.mark.parametrize("track_id", [0, -3, True, "1", 1.0])
    def test_a_seed_that_is_not_an_id_is_refused(self, service, track_id):
        with pytest.raises(ValueError, match="track id"):
            service.similar(track_id)

    def test_a_seed_that_is_not_in_the_library(self, service):
        with pytest.raises(LookupError, match="no track 404"):
            service.similar(404)

    def test_a_seed_alone_has_no_suggestions(self, lib, service):
        seed = lib.add(bpm=128.0, key="8A")
        result = service.similar(seed)
        assert result.suggestions == () and result.considered == 0

    def test_a_candidate_with_no_bpm_is_not_near_a_seed_with_one(self, lib, service):
        seed = lib.add("A", bpm=128.0, key="8A", genre="House")
        lib.add("A", key="8A", genre="House")
        assert service.similar(seed).suggestions == ()


# ------------------------------------------------------ effective values


class TestEffectiveValues:
    def test_an_override_is_what_is_compared(self, lib, service):
        seed = lib.add("A", bpm=128.0, key="8A", genre="House", label="L")
        moved = lib.add("B", bpm=90.0, key="3A", genre="Techno", label="M")
        lib.meta.set_override(moved, "bpm", 128.0)
        lib.meta.set_override(moved, "key", "9A")
        lib.meta.set_override(moved, "genre", "house")
        lib.meta.set_override(moved, "label", "l")
        away = lib.add("C", bpm=128.0, key="8A")
        lib.meta.set_override(away, "bpm", 90.0)
        result = service.similar(seed)
        assert ids(result) == [moved]
        assert [r["component"] for r in reasons_of(result, moved)] == [
            "tempo",
            "key",
            "genre",
            "label",
        ]

    def test_the_seeds_own_override_is_what_it_offers(self, lib, service):
        seed = lib.add("A", bpm=90.0)
        lib.meta.set_override(seed, "bpm", 128.0)
        near = lib.add("B", bpm=128.0)
        lib.add("C", bpm=90.0)
        assert ids(service.similar(seed)) == [near]

    def test_genres_and_labels_compare_by_name_key(self, lib, service):
        seed = lib.add("A", bpm=128.0, genre="Tech House", label="Nightfall Audio")
        other = lib.add("B", bpm=128.0, genre="tech-house", label="NIGHTFALL  AUDIO")
        assert [r["component"] for r in reasons_of(service.similar(seed), other)] == [
            "tempo",
            "genre",
            "label",
        ]

    def test_an_artist_is_a_credit_not_a_substring(self, lib, service):
        seed = lib.add("Bob", bpm=128.0)
        lib.add("Bobby", bpm=128.0)
        credited = lib.add("Anna feat. BOB", bpm=128.0)
        remixed = lib.add("Zed", bpm=128.0, remixer="Bob")
        result = service.similar(seed)
        shared = [s.track_id for s in result.suggestions if len(s.reasons) == 2]
        assert shared == [credited, remixed]

    def test_what_is_not_a_value_is_none(self, lib, service):
        seed = lib.add(bpm=128.0, key="not a key", genre="  ", label="")
        assert service.similar(seed).unused == ("key", "genre", "label")


# --------------------------------------------------------- key notation


class TestNotation:
    def test_a_camelot_library_reads_camelot(self, lib, service):
        seed = lib.add("A", bpm=128.0, key="8A")
        other = lib.add("B", bpm=128.0, key="Em")
        lib.add("C", key="1B")
        result = service.similar(seed)
        assert result.notation == "camelot"
        assert reasons_of(result, other)[1] == {
            "component": "key",
            "detail": "adjacent",
            "points": 20.0,
            "from": "8A",
            "to": "9A",
        }

    def test_a_classic_library_still_reads_camelot(self, lib, service):
        # Keys are Beatport's and shown in Camelot, whatever the library's
        # notation setting (PAGES-15).
        seed = lib.add("A", bpm=128.0, key="Am")
        other = lib.add("B", bpm=128.0, key="C")
        lib.add("C", key="G#m")
        result = service.similar(seed)
        assert result.notation == "camelot"
        assert reasons_of(result, other)[1] == {
            "component": "key",
            "detail": "relative",
            "points": 20.0,
            "from": "8A",
            "to": "8B",
        }


# ------------------------------------------------------------- no BPM


class TestASeedWithoutABpm:
    def test_it_finds_by_genre_label_artist_and_key_and_says_so(self, lib, service):
        seed = lib.add("A, B", key="8A", genre="Deep House", label="Nite")
        genre = lib.add("X", bpm=120.0, genre="deep-house")
        label = lib.add("Y", label="NITE")
        artist = lib.add("Q, b", bpm=90.0)
        key = lib.add("Z", key="9A")
        lib.add("W", bpm=128.0, key="3B", genre="Techno", label="Other")
        result = service.similar(seed)
        assert sorted(ids(result)) == sorted([genre, label, artist, key])
        assert result.unused == ("tempo",)
        assert result.considered == 4
        assert reasons_of(result, key) == [
            {
                "component": "key",
                "detail": "adjacent",
                "points": 20.0,
                "from": "8A",
                "to": "9A",
            }
        ]

    def test_with_no_bpm_and_no_key_it_says_which_it_could_not_use(self, lib, service):
        seed = lib.add("A", genre="House")
        other = lib.add("B", bpm=124.0, key="8A", genre="House")
        result = service.similar(seed)
        assert ids(result) == [other]
        assert result.unused == ("tempo", "key", "label")

    def test_a_seed_with_nothing_has_nothing(self, lib, service, db):
        seed = lib.add("A")
        # A track credited to nobody: no artist to share either.
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_credits WHERE track_id = ?", (seed,))
        lib.add("B", bpm=128.0, key="8A", genre="House")
        result = service.similar(seed)
        assert result.suggestions == () and result.considered == 0
        assert result.unused == ("tempo", "key", "genre", "label", "artist")


# --------------------------------------------------------- duplicates


class TestDuplicates:
    def test_the_seed_and_its_duplicates_are_left_out(self, lib, service, db):
        seed = lib.add("A", bpm=128.0, path="/m/same.mp3")
        copy = lib.add("A", bpm=128.0, path="/m/same.mp3")
        text = lib.add("A", bpm=128.0)
        other = lib.add("B", bpm=128.0)
        repo = DuplicateRepository(db)
        with db.transaction():
            repo.replace_signal(SIGNAL_PATH, repo.path_groups(), NOW)
            repo.replace_signal(
                SIGNAL_TEXT, [ScannedGroup(SIGNAL_TEXT, "a|t", (seed, text))], NOW
            )
        result = service.similar(seed)
        assert ids(result) == [other]
        assert result.duplicates_excluded == 2
        # A group, not a chain: the copy's only group is the path one, so the
        # track that shares the seed's text is still a suggestion for it.
        assert ids(service.similar(copy)) == [text, other]

    def test_a_group_the_user_dismissed_is_not_a_duplicate(self, lib, service, db):
        seed = lib.add("A", bpm=128.0)
        text = lib.add("A", bpm=128.0)
        repo = DuplicateRepository(db)
        with db.transaction():
            repo.replace_signal(
                SIGNAL_TEXT, [ScannedGroup(SIGNAL_TEXT, "a|t", (seed, text))], NOW
            )
        [group] = repo.groups(SIGNAL_TEXT)
        with db.transaction():
            repo.dismiss(
                DuplicateDismissal(SIGNAL_TEXT, "a|t", member_hash([seed, text]), NOW),
                group.group.id,
            )
        result = service.similar(seed)
        assert ids(result) == [text]
        assert result.duplicates_excluded == 0

    def test_another_tracks_group_does_not_matter(self, lib, service, db):
        seed = lib.add("A", bpm=128.0)
        one = lib.add("B", bpm=128.0)
        two = lib.add("B", bpm=128.0)
        repo = DuplicateRepository(db)
        with db.transaction():
            repo.replace_signal(
                SIGNAL_TEXT, [ScannedGroup(SIGNAL_TEXT, "b|t", (one, two))], NOW
            )
        assert ids(service.similar(seed)) == [one, two]


# -------------------------------------------------------------- scope


class TestScope:
    def test_a_collection_restricts(self, lib, service, db):
        seed = lib.add("A", bpm=128.0)
        inside = lib.add("B", bpm=128.0)
        lib.add("C", bpm=128.0)
        collections = CollectionRepository(db)
        crate = collections.create(Collection(name="Crate", kind=KIND_COLLECTION))
        collections.add(crate.id, [inside])
        result = service.similar(seed, scope=BrowseQuery(collection_id=crate.id))
        assert ids(result) == [inside]
        assert result.considered == 1

    def test_a_playlist_restricts(self, lib, service, db):
        seed = lib.add("A", bpm=128.0)
        lib.add("B", bpm=128.0)
        third = lib.add("C", bpm=128.0)
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="warmup",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="warmup",
                    track_refs=["3"],
                )
            ]
        )
        scope = BrowseQuery(playlist_id=playlists.list_all()[0].id)
        assert ids(service.similar(seed, scope=scope)) == [third]

    def test_a_rule_set_restricts(self, lib, service):
        seed = lib.add("A", bpm=128.0)
        house = lib.add("B", bpm=128.0, genre="House")
        lib.add("C", bpm=128.0, genre="Techno")
        scope = BrowseQuery(rules=RuleSet(rules=(FilterRule("genre", "is", "House"),)))
        assert ids(service.similar(seed, scope=scope)) == [house]

    def test_the_seed_need_not_be_in_the_scope(self, lib, service):
        seed = lib.add("A", bpm=128.0, genre="Techno")
        house = lib.add("B", bpm=128.0, genre="House")
        scope = BrowseQuery(rules=RuleSet(rules=(FilterRule("genre", "is", "House"),)))
        assert ids(service.similar(seed, scope=scope)) == [house]

    def test_a_scope_narrows_a_seed_without_a_bpm_too(self, lib, service):
        seed = lib.add("A", genre="House")
        lib.add("B", genre="House", label="L")
        kept = lib.add("C", genre="House", label="M")
        scope = BrowseQuery(rules=RuleSet(rules=(FilterRule("label", "is", "M"),)))
        assert ids(service.similar(seed, scope=scope)) == [kept]

    def test_a_broken_scope_is_refused_as_the_library_refuses_it(
        self, lib, service, db
    ):
        seed = lib.add("A", bpm=128.0)
        tags = TagRepository(db)
        tag = tags.create(Tag(name="gone"))
        tags.delete(tag.id)
        scope = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("tag", "any_of", [tag.id]),))
        )
        with pytest.raises(BrokenRuleError):
            service.similar(seed, scope=scope)
        with pytest.raises(BrowseQueryError):
            service.similar(seed, scope=BrowseQuery(collection_id="many"))

    def test_a_broken_scope_is_refused_even_when_nothing_is_preselected(
        self, lib, service, db
    ):
        seed = lib.add("A")
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_credits")
        tags = TagRepository(db)
        tag = tags.create(Tag(name="gone"))
        tags.delete(tag.id)
        scope = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("tag", "any_of", [tag.id]),))
        )
        with pytest.raises(BrokenRuleError):
            service.similar(seed, scope=scope)


# ------------------------------------------------------------ writing


class TestItWritesNothing:
    def test_a_list_changes_nothing_in_the_database(self, lib, service, db):
        seed = lib.add("A, B", bpm=128.0, key="8A", genre="House", label="L")
        for n in range(20):
            lib.add(f"X{n}, B", bpm=120.0 + n / 2, key="9A", genre="House")
        lib.meta.set_override(3, "bpm", 127.0)
        conn = db.connect()
        before = conn.total_changes
        service.similar(seed)
        service.similar(3, scope=BrowseQuery(query="X"))
        assert conn.total_changes == before


class TestTheIndex:
    def test_it_says_whether_the_credit_index_is_current(self, lib, service):
        seed = lib.add(bpm=128.0)
        assert service.similar(seed).index_current is False
        lib.credits.mark_built(ENTITY_NAMES_VERSION, NOW)
        assert service.similar(seed).index_current is True


# -------------------------------------------------- against brute force


def brute_force(
    lib: Library, seed_id: int, limit: int, exclude=()
) -> List[Tuple[int, float]]:
    """Score every track from its own columns, without the service's SQL."""
    overrides = lib.meta.get_many(
        [row[0] for row in lib.db.connect().execute("SELECT id FROM tracks")]
    )
    traits: Dict[int, Traits] = {}
    for row in lib.db.connect().execute("SELECT * FROM tracks"):
        meta = overrides.get(row["id"])

        def value(field: str):
            own = getattr(meta, field, None) if meta is not None else None
            return own if own is not None else row[field]

        parsed = parse_key(value("key")) if value("key") else None
        artists = [
            name_key(name)
            for credit in (row["artist"], row["remixer"])
            if credit
            for name in split_credit(credit)
        ]
        genre, label = value("genre"), value("label")
        traits[row["id"]] = Traits(
            bpm=value("bpm"),
            key=MusicalKey(*parsed) if parsed else None,
            genre_key=name_key(genre) if genre and genre.strip() else None,
            label_key=name_key(label) if label and label.strip() else None,
            artist_keys=frozenset(artists),
        )
    ranked = rank(
        traits[seed_id],
        sorted(traits.items()),
        limit,
        exclude=[seed_id, *exclude],
    )
    return [(s.track_id, s.score) for s in ranked]


class TestAgainstScoringEveryTrack:
    @pytest.mark.parametrize("seed_of_library", [1, 2, 3])
    def test_the_service_answers_what_scoring_every_track_answers(
        self, lib, service, seed_of_library
    ):
        rnd = random.Random(seed_of_library)
        names = ["Âme", "AME", "Dixon", "Kerri Chandler", "Bob", "Bobby"]
        genres = ["Deep House", "deep-house", "Techno", "TECHNO", "  ", None]
        labels = ["Innervisions", "INNERVISIONS", "Nite", None]
        keys = ["8A", "Am", "9A", "Em", "8B", "C", "1A", "12A", "G#m", "x", None]
        for _ in range(250):
            artist = ", ".join(rnd.sample(names, rnd.randrange(1, 3)))
            track = lib.add(
                artist,
                bpm=rnd.choice(
                    [None, 62.0, 64.0, 118.0, 122.5, 124.0, 128.0, 131.0, 256.0]
                ),
                key=rnd.choice(keys),
                genre=rnd.choice(genres),
                label=rnd.choice(labels),
                remixer=rnd.choice([None, None, rnd.choice(names)]),
            )
            if rnd.random() < 0.15:
                lib.meta.set_override(track, "bpm", rnd.choice([124.0, 64.0, 90.0]))
            if rnd.random() < 0.15:
                lib.meta.set_override(track, "genre", rnd.choice(["Techno", "House"]))
            if rnd.random() < 0.1:
                lib.meta.set_override(track, "key", rnd.choice(["8A", "3B"]))
        for seed in rnd.sample(range(1, 251), 25):
            result = service.similar(seed, limit=MAX_SIMILAR_LIMIT)
            assert [(s.track_id, s.score) for s in result.suggestions] == brute_force(
                lib, seed, MAX_SIMILAR_LIMIT
            ), seed
            for suggestion in result.suggestions:
                for reason in suggestion.reasons:
                    assert (reason["component"], reason["detail"]) in REASONS


class TestTheContainer:
    def test_it_builds_the_service(self, tmp_path, monkeypatch):
        from cuepoint.services import database_service as database_service_module
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService, ISimilarityService
        from cuepoint.utils.di_container import get_container, reset_container

        monkeypatch.setattr(
            database_service_module, "default_database_path", lambda: tmp_path / "c.db"
        )
        reset_container()
        try:
            bootstrap_services()
            service = get_container().resolve(ISimilarityService)
            assert isinstance(service, SimilarityService)
            with pytest.raises(LookupError):
                service.similar(1)
        finally:
            get_container().resolve(IDatabaseService).close_all()
            reset_container()
