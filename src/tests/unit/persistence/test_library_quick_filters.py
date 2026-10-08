#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Quick filters, search by key and tempo, and "In playlist" (FLW-4 to FLW-7).

Everything runs on a temporary database through the real repositories. A
track's key is its accepted Beatport match's (DEC-201), so the tests that need
one give the track a match with ``accept_with_key``.
"""

from __future__ import annotations

import json
from typing import Dict, List

import pytest

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER as COLLECTION_FOLDER,
    KIND_SET,
    KIND_SMART,
    Collection,
)
from cuepoint.models.filter_rule import FilterRule, FilterRuleError, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_playlist import (
    KIND_FOLDER,
    KIND_PLAYLIST,
    RekordboxPlaylist,
)
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.rule_references import BrokenRuleError
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, search_bpm, search_key
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.key_support import accept_with_key


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
def library(db, repo) -> LibraryService:
    return LibraryService(
        repo,
        CollectionRepository(db),
        TrackMetadataRepository(db),
        AuthoredDataRepository(db),
    )


def _add(repo: TrackRepository, track_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Track {track_id}")
    kwargs.setdefault("artist", "Artist")
    return repo.add(
        LibraryTrack(
            rekordbox_track_id=track_id, file_path=f"/music/{track_id}.mp3", **kwargs
        )
    )


@pytest.fixture
def tracks(db, repo) -> Dict[str, int]:
    """Seven tracks; the keys are Beatport's, written in mixed notations.

    1  House   128    10A  Beatport says "B Minor"
    2  house   128    2A   "2A"
    3  Techno  123.6  1B   "B Major"
    4  Techno  124.4  none (Rekordbox says 8A, which is not used)
    5  Techno  124.5  10A  "B Minor"
    6  no genre  95   none
    7  Disco   no BPM 2A   "2A"
    """
    _add(repo, "1", title="Strobe", genre="House", bpm=128.0)
    _add(repo, "2", title="Ghosts", genre="house", bpm=128.0)
    _add(repo, "3", title="Rej", genre="Techno", bpm=123.6)
    _add(repo, "4", title="Opus", genre="Techno", bpm=124.4, key="8A")
    _add(repo, "5", title="Wilder", genre="Techno", bpm=124.5)
    _add(repo, "6", title="Quiet", genre=None, bpm=95.0)
    _add(repo, "7", title="Disco Nap", genre="Disco", bpm=None)
    ids = {
        t.rekordbox_track_id: int(t.id) for t in repo.browse(BrowseQuery(), limit=50)
    }
    accept_with_key(db, ids["1"], "B Minor")  # 10A
    accept_with_key(db, ids["2"], "2A")
    accept_with_key(db, ids["3"], "B Major")  # 1B
    accept_with_key(db, ids["5"], "B Minor")  # 10A
    accept_with_key(db, ids["7"], "2A")
    return ids


def names(repo: TrackRepository, query: BrowseQuery) -> List[str]:
    rows = repo.browse(query, limit=100)
    assert repo.browse_count(query) == len(rows)
    return sorted(t.rekordbox_track_id for t in rows)


class TestQuickFacets:
    def test_keys_come_in_camelot_order_with_counts_and_a_no_key_count(
        self, library, tracks
    ):
        answer = library.quick_facets().to_dict()

        # 1B, 2A, 10A: numbers before letters, and 2A before 10A (not the
        # alphabet's 10A, 1B, 2A).
        assert [(k["value"], k["count"]) for k in answer["keys"]] == [
            ("1B", 1),
            ("2A", 2),
            ("10A", 2),
        ]
        # Track 4's Rekordbox-only 8A is no key, and neither is track 6's gap.
        assert answer["no_key"] == 2

    def test_bpm_range_and_missing(self, library, tracks):
        bpm = library.quick_facets().to_dict()["bpm"]
        assert (bpm["min"], bpm["max"], bpm["missing"]) == (95.0, 128.0, 1)

    def test_genres_with_counts_most_common_first(self, library, tracks):
        genres = library.quick_facets().to_dict()["genres"]
        assert [(g["value"], g["count"]) for g in genres[:2]] == [
            ("Techno", 3),
            ("House", 2),
        ]
        assert {g["value"] for g in genres} == {"Techno", "House", "Disco"}

    def test_it_answers_for_the_view_not_the_library(self, library, tracks, db):
        rules = RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        answer = library.quick_facets(rules=rules).to_dict()
        assert [(k["value"], k["count"]) for k in answer["keys"]] == [
            ("1B", 1),
            ("10A", 1),
        ]
        assert answer["no_key"] == 1
        assert answer["bpm"]["min"] == 123.6
        assert answer["bpm"]["max"] == 124.5

    def test_a_chosen_key_leaves_the_other_keys_choosable(self, library, tracks):
        rules = RuleSet(rules=(FilterRule("key", "is", "8A"),))
        keys = library.quick_facets(rules=rules).to_dict()["keys"]
        assert [k["value"] for k in keys] == ["1B", "2A", "10A"]

    def test_it_answers_inside_a_playlist(self, library, tracks, db):
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="warm",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="warm",
                    track_refs=["1", "2", "6"],
                )
            ]
        )
        pid = playlists.list_all()[0].id
        answer = library.quick_facets(playlist_id=pid).to_dict()
        assert [(k["value"], k["count"]) for k in answer["keys"]] == [
            ("2A", 1),
            ("10A", 1),
        ]
        assert answer["no_key"] == 1

    def test_genres_are_capped_and_say_so(self, library, tracks):
        answer = library.quick_facets(genre_limit=2).to_dict()
        assert len(answer["genres"]) == 2
        assert answer["genres_truncated"] is True
        assert answer["genres_total"] == 4  # Techno, House, Disco, and no genre

    def test_a_library_with_no_keys_says_no_key_for_every_track(self, library, repo):
        _add(repo, "1")
        _add(repo, "2")
        answer = library.quick_facets().to_dict()
        assert answer["keys"] == []
        assert answer["no_key"] == 2


class TestSearchByKeyAndTempo:
    def test_a_key_is_found_in_either_notation(self, repo, tracks):
        # 10A is B minor: "10A", "Bm" and "B minor" are one key.
        for text in ("10A", "10a", "Bm", "B minor", "b MIN"):
            assert names(repo, BrowseQuery(query=text)) == ["1", "5"], text

    def test_rekordbox_s_key_is_not_searchable(self, repo, tracks):
        # Track 4's imported key is 8A, and the key is Beatport's (DEC-201).
        assert names(repo, BrowseQuery(query="8A")) == []

    def test_a_lone_letter_is_text_not_a_key(self, repo, tracks):
        assert search_key("a") is None
        assert search_key("Am") == "8A"
        # "e" finds the titles with an e (Strobe, Rej, Wilder, Quiet) and is
        # not read as E major, which would add the other keyed tracks.
        assert names(repo, BrowseQuery(query="e")) == ["1", "3", "5", "6"]

    def test_a_whole_number_finds_the_tracks_that_round_to_it(self, repo, tracks):
        # 124 is 123.5 <= bpm < 124.5: 123.6 and 124.4 are in, 124.5 is not.
        assert names(repo, BrowseQuery(query="124")) == ["3", "4"]

    def test_a_decimal_is_read_at_its_own_precision(self, repo, tracks):
        assert search_bpm("124.5") == pytest.approx((124.45, 124.55))
        assert names(repo, BrowseQuery(query="124.5")) == ["5"]
        assert names(repo, BrowseQuery(query="124,5")) == ["5"]

    def test_text_still_matches_and_a_search_can_find_both(self, repo, tracks):
        assert names(repo, BrowseQuery(query="Strobe")) == ["1"]
        assert names(repo, BrowseQuery(query="Disco")) == ["7"]

    def test_search_uses_the_effective_bpm(self, db, repo, tracks):
        TrackMetadataRepository(db).set_override(tracks["6"], "bpm", 128.0)
        assert names(repo, BrowseQuery(query="128")) == ["1", "2", "6"]

    def test_the_global_search_path_finds_them_too(self, repo, tracks):
        assert sorted(t.rekordbox_track_id for t in repo.search("10A")) == ["1", "5"]
        assert repo.search_count("124") == 2
        assert repo.search_count("zzz") == 0


class TestInPlaylist:
    @pytest.fixture
    def sources(self, db, tracks) -> Dict[str, int]:
        playlists = PlaylistRepository(db)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="ROOT",
                    kind=KIND_FOLDER,
                    depth=0,
                    position=0,
                    rekordbox_path="ROOT",
                ),
                RekordboxPlaylist(
                    name="warm",
                    kind=KIND_PLAYLIST,
                    depth=1,
                    position=0,
                    rekordbox_path="ROOT/warm",
                    parent_path="ROOT",
                    track_refs=["1", "1", "2"],
                ),
                RekordboxPlaylist(
                    name="peak",
                    kind=KIND_PLAYLIST,
                    depth=1,
                    position=1,
                    rekordbox_path="ROOT/peak",
                    parent_path="ROOT",
                    track_refs=["3", "2"],
                ),
            ]
        )
        found = {n.rekordbox_path: int(n.id) for n in playlists.list_all()}
        collections = CollectionRepository(db)
        box = collections.create(Collection(kind=KIND_COLLECTION, name="Box"))
        collections.add(box.id, [tracks["5"], tracks["6"]])
        chain = collections.create(Collection(kind=KIND_SET, name="Friday"))
        collections.add(chain.id, [tracks["7"], tracks["5"]])
        smart = collections.create(
            Collection(
                kind=KIND_SMART,
                name="Smart",
                rules_json='{"match": "all", "rules": []}',
            )
        )
        folder = collections.create(Collection(kind=COLLECTION_FOLDER, name="Dir"))
        return {
            "warm": found["ROOT/warm"],
            "peak": found["ROOT/peak"],
            "ROOT": found["ROOT"],
            "box": int(box.id),
            "set": int(chain.id),
            "smart": int(smart.id),
            "folder": int(folder.id),
        }

    def rule(self, *items) -> RuleSet:
        return RuleSet(
            rules=(
                FilterRule(
                    "in_playlist",
                    "any_of",
                    [{"kind": kind, "id": ident} for kind, ident in items],
                ),
            )
        )

    def test_one_playlist(self, repo, sources):
        query = BrowseQuery(rules=self.rule(("playlist", sources["warm"])))
        assert names(repo, query) == ["1", "2"]

    def test_several_sources_of_different_kinds_are_united_once(self, repo, sources):
        query = BrowseQuery(
            rules=self.rule(
                ("playlist", sources["peak"]),
                ("collection", sources["box"]),
                ("set", sources["set"]),
            )
        )
        # peak: 3, 2. Box: 5, 6. Friday: 7, 5. Track 5 is in two sources.
        assert names(repo, query) == ["2", "3", "5", "6", "7"]

    def test_a_playlist_folder_counts_everything_under_it(self, repo, sources):
        query = BrowseQuery(rules=self.rule(("playlist", sources["ROOT"])))
        assert names(repo, query) == ["1", "2", "3"]

    def test_ids_are_typed_by_kind(self, repo, sources):
        # The Collection's id may equal a playlist's; only the named kind counts.
        query = BrowseQuery(rules=self.rule(("collection", sources["box"])))
        assert names(repo, query) == ["5", "6"]

    def test_it_combines_with_the_key_rule(self, repo, sources):
        rules = RuleSet(
            rules=(
                *self.rule(
                    ("collection", sources["box"]), ("set", sources["set"])
                ).rules,
                FilterRule("key", "is", "Bm"),  # 10A
            )
        )
        assert names(repo, BrowseQuery(rules=rules)) == ["5"]

    def test_a_deleted_playlist_is_a_broken_rule_not_an_empty_one(self, repo, sources):
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            repo.browse(BrowseQuery(rules=self.rule(("playlist", 9999))))
        with pytest.raises(BrokenRuleError, match="no longer exists"):
            repo.browse(BrowseQuery(rules=self.rule(("collection", 9999))))

    def test_a_smart_collection_is_refused_with_a_clear_message(self, repo, sources):
        with pytest.raises(FilterRuleError, match="Smart Collection"):
            repo.browse(BrowseQuery(rules=self.rule(("collection", sources["smart"]))))

    def test_a_kind_that_does_not_match_the_row_is_refused(self, repo, sources):
        with pytest.raises(FilterRuleError, match="but it is a set"):
            repo.browse(BrowseQuery(rules=self.rule(("collection", sources["set"]))))
        with pytest.raises(FilterRuleError, match="folder"):
            repo.browse(BrowseQuery(rules=self.rule(("collection", sources["folder"]))))

    def test_the_facets_honor_it(self, library, sources):
        rules = self.rule(("collection", sources["box"]))
        answer = library.quick_facets(rules=rules).to_dict()
        assert [(k["value"], k["count"]) for k in answer["keys"]] == [("10A", 1)]
        assert answer["no_key"] == 1


class TestKeyFields:
    def test_key_is_8a_matches_a_beatport_a_minor(self, db, repo):
        _add(repo, "1")
        ids = {t.rekordbox_track_id: int(t.id) for t in repo.browse(limit=5)}
        accept_with_key(db, ids["1"], "A Minor")
        for typed in ("8A", "Am", "A minor"):
            query = BrowseQuery(rules=RuleSet(rules=(FilterRule("key", "is", typed),)))
            assert names(repo, query) == ["1"], typed

    def test_the_rekordbox_field_reads_only_the_imported_key(self, db, repo):
        _add(repo, "1", key="8A")
        _add(repo, "2")
        ids = {t.rekordbox_track_id: int(t.id) for t in repo.browse(limit=5)}
        accept_with_key(db, ids["2"], "A Minor")
        theirs = RuleSet(rules=(FilterRule("key_rekordbox", "is", "8A"),))
        ours = RuleSet(rules=(FilterRule("key", "is", "8A"),))
        assert names(repo, BrowseQuery(rules=theirs)) == ["1"]
        assert names(repo, BrowseQuery(rules=ours)) == ["2"]


class TestSavedSmartCollectionsFromBefore:
    """A Smart Collection saved before this step filters exactly as before."""

    #: Rule JSON as ORG-06 through PAGES-15 stored it: every field by id.
    OLD_RULES = json.dumps(
        {
            "match": "all",
            "rules": [
                {"field": "genre", "operator": "is", "value": "Techno"},
                {"field": "bpm", "operator": "between", "value": [123, 125]},
                {"field": "key", "operator": "any_of", "value": ["10A", "1B"]},
                {"field": "match_state", "operator": "is", "value": "accepted"},
                {"field": "cuepoint_key", "operator": "is_empty"},
            ],
        }
    )

    def test_it_filters_as_it_did(self, repo, tracks):
        rules = RuleSet.from_dict(json.loads(self.OLD_RULES))
        assert names(repo, BrowseQuery(rules=rules)) == ["3", "5"]
        # The same rules, written out again, are the same rules.
        assert rules.validated().to_dict() == json.loads(self.OLD_RULES)
