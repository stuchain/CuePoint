#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Search and sort fold accents and case the way people expect (HARDEN-06, DEC-185).

SQLite's ``LIKE`` and ``NOCASE`` fold ASCII only, so "ÂME" did not find "Âme"
and "Âme" sorted after "Zedd". The library keeps a folded key beside each of
title, artist, album and label (casefold, then NFKD with the marks removed),
searches those, and sorts by them with the original as the tie-break.

Every test runs against a temporary database.
"""

from __future__ import annotations

import unicodedata
from typing import List

import pytest

from cuepoint.core.text_processing import search_fold
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit


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
def metadata(db) -> TrackMetadataRepository:
    return TrackMetadataRepository(db)


def _add(repo: TrackRepository, track_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", f"Title {track_id}")
    kwargs.setdefault("artist", "Artist")
    return repo.add(
        LibraryTrack(
            rekordbox_track_id=track_id,
            file_path=f"/music/{track_id}.mp3",
            **kwargs,
        )
    )


def _found(repo: TrackRepository, query: str) -> List[str]:
    return sorted(t.title for t in repo.search(query, limit=100))


def _browsed(repo: TrackRepository, query: str) -> List[str]:
    return sorted(t.title for t in repo.browse(BrowseQuery(query=query), limit=100))


class TestTheFold:
    @pytest.mark.parametrize(
        "text, folded",
        (
            ("Beyoncé", "beyonce"),
            ("ÂME", "ame"),
            ("Âme", "ame"),
            ("straße", "strasse"),
            ("STRASSE", "strasse"),
            ("Σίσυφος", "σισυφοσ"),
            ("σισυφος", "σισυφοσ"),
            ("東京", "東京"),
            ("Ångström", "angstrom"),
            ("ﬁnale", "finale"),
            ("Røyksopp", "royksopp"),
            ("Øystein", "oystein"),
            ("Łódź", "lodz"),
            ("Đorđe", "dorde"),
            ("Æon", "aeon"),
            ("Œuvre", "oeuvre"),
            ("Þór", "thor"),
            ("Ðóra", "dora"),
            ("", ""),
            (None, ""),
        ),
    )
    def test_a_name_folds_to_its_key(self, text, folded):
        assert search_fold(text) == folded

    def test_the_decomposed_and_composed_forms_fold_alike(self):
        composed = unicodedata.normalize("NFC", "Déjà Vu")
        decomposed = unicodedata.normalize("NFD", "Déjà Vu")
        assert search_fold(composed) == search_fold(decomposed) == "deja vu"


class TestTheMigrationFoldsLikeTheApplication:
    def test_the_frozen_table_and_function_agree(self):
        from cuepoint.core.text_processing import SEARCH_FOLD_TABLE
        from cuepoint.migrations import m0033_search_keys as migration

        assert migration.FOLD_TABLE == SEARCH_FOLD_TABLE
        for text in (
            "Røyksopp",
            "Łódź Æon Œuvre Þór Ðóra Đorđe",
            "Beyoncé",
            "STRASSE straße",
            "Σίσυφος",
            "東京",
            "",
        ):
            assert migration._fold(text) == search_fold(text), text
        assert migration._fold(None) is None


class TestSearchFindsWhatPeopleMean:
    def test_letters_that_are_not_accents_fold_as_typed(self, repo):
        _add(repo, "1", artist="Røyksopp", title="Eple")
        _add(repo, "2", artist="Łukasz", title="Dwa")

        assert _found(repo, "royksopp") == ["Eple"]
        assert _found(repo, "RØYKSOPP") == ["Eple"]
        assert _found(repo, "lukasz") == ["Dwa"]

    def test_an_unaccented_query_finds_an_accented_artist(self, repo):
        _add(repo, "1", artist="Beyoncé", title="Halo")
        _add(repo, "2", artist="Someone Else", title="Other")

        assert _found(repo, "beyonce") == ["Halo"]
        assert repo.search_count("beyonce") == 1

    def test_an_accented_query_finds_an_unaccented_artist(self, repo):
        _add(repo, "1", artist="Beyonce", title="Halo")

        assert _found(repo, "Beyoncé") == ["Halo"]

    def test_upper_case_with_marks_finds_mixed_case_with_marks(self, repo):
        _add(repo, "1", artist="Âme", title="Rej")
        _add(repo, "2", artist="Eric Prydz", title="Opus")

        assert _found(repo, "ÂME") == ["Rej"]
        assert _found(repo, "âme") == ["Rej"]
        assert _found(repo, "ame") == ["Rej"]

    def test_the_other_way_round(self, repo):
        _add(repo, "1", artist="ÂME", title="Rej")

        assert _found(repo, "Âme") == ["Rej"]
        assert _found(repo, "ame") == ["Rej"]

    def test_sharp_s_and_double_s_meet(self, repo):
        _add(repo, "1", title="Die Straße")
        _add(repo, "2", title="DIE STRASSE (Live)")

        assert _found(repo, "straße") == ["DIE STRASSE (Live)", "Die Straße"]
        assert _found(repo, "STRASSE") == ["DIE STRASSE (Live)", "Die Straße"]

    def test_greek_matches_without_tonos_and_with_a_final_sigma(self, repo):
        _add(repo, "1", title="Σίσυφος", artist="Μάρκος")

        assert _found(repo, "σισυφος") == ["Σίσυφος"]
        assert _found(repo, "ΣΊΣΥΦΟΣ") == ["Σίσυφος"]
        assert _found(repo, "μαρκοσ") == ["Σίσυφος"]

    def test_cjk_finds_itself_and_nothing_else(self, repo):
        _add(repo, "1", title="東京", artist="YMO")
        _add(repo, "2", title="京都", artist="YMO")
        _add(repo, "3", title="Tokyo", artist="YMO")

        assert _found(repo, "東京") == ["東京"]
        assert _found(repo, "京") == ["京都", "東京"]

    def test_the_decomposed_spelling_in_the_library_is_found_by_the_composed_one(
        self, repo
    ):
        _add(repo, "1", title=unicodedata.normalize("NFD", "Déjà Vu"))

        assert _found(repo, unicodedata.normalize("NFC", "Déjà")) == [
            unicodedata.normalize("NFD", "Déjà Vu")
        ]
        assert _found(repo, "deja") != []

    def test_album_and_label_are_searched_folded_too(self, repo):
        _add(repo, "1", title="A", album="Café del Mar", label="Éditions Mego")
        _add(repo, "2", title="B", album="Other", label="Other")

        assert _found(repo, "cafe del") == ["A"]
        assert _found(repo, "editions") == ["A"]

    def test_the_browse_query_searches_the_same_keys(self, repo):
        _add(repo, "1", artist="Âme", title="Rej")
        _add(repo, "2", artist="Eric Prydz", title="Opus")

        assert _browsed(repo, "AME") == ["Rej"]
        assert _browsed(repo, "âme") == ["Rej"]

    def test_wildcards_are_still_literal(self, repo):
        _add(repo, "1", title="100% Pûre")
        _add(repo, "2", title="Plain")

        assert _found(repo, "%") == ["100% Pûre"]
        assert _found(repo, "100% pure") == ["100% Pûre"]


class TestTheKeysAreKeptUp:
    def test_an_update_to_a_name_changes_what_is_found(self, repo):
        track = _add(repo, "1", artist="Beyonce", title="Halo")
        assert _found(repo, "knowles") == []

        track.artist = "Beyoncé Knowles"
        repo.update(track)

        assert _found(repo, "KNOWLES") == ["Halo"]
        assert _found(repo, "beyonce") == ["Halo"]

    def test_a_refresh_of_a_renamed_track_changes_what_is_found(self, repo):
        _add(repo, "1", artist="Old Name", title="Song")

        repo.upsert_many_from_rekordbox(
            [
                LibraryTrack(
                    rekordbox_track_id="1",
                    file_path="/music/1.mp3",
                    title="Chanson",
                    artist="Âme",
                )
            ]
        )

        assert _found(repo, "old name") == []
        assert _found(repo, "AME") == ["Chanson"]

    def test_the_keys_are_stored(self, db, repo):
        _add(repo, "1", artist="Âme", title="Rej", album="Rej EP", label="Éditions")

        row = db.connect().execute("SELECT * FROM tracks").fetchone()

        assert row["artist_search_key"] == "ame"
        assert row["title_search_key"] == "rej"
        assert row["album_search_key"] == "rej ep"
        assert row["label_search_key"] == "editions"


class TestALabelOverrideChangesWhatSearchFinds:
    def test_search_finds_the_override_and_not_the_imported_label(self, repo, metadata):
        track = _add(repo, "1", title="Rej", label="Innervisions")
        assert _found(repo, "innervisions") == ["Rej"]

        metadata.set_override(track.id, "label", "Édition Mégo")

        assert _found(repo, "innervisions") == []
        assert _found(repo, "edition mego") == ["Rej"]
        assert _browsed(repo, "MEGO") == ["Rej"]

    def test_clearing_the_override_brings_the_imported_label_back(self, repo, metadata):
        track = _add(repo, "1", title="Rej", label="Innervisions")
        metadata.set_override(track.id, "label", "Édition Mégo")

        metadata.set_override(track.id, "label", None)

        assert _found(repo, "innervisions") == ["Rej"]
        assert _found(repo, "mego") == []

    def test_forgetting_the_track_brings_the_imported_label_back(self, repo, metadata):
        track = _add(repo, "1", title="Rej", label="Innervisions")
        metadata.set_override(track.id, "label", "Édition Mégo")

        metadata.clear(track.id)

        assert _found(repo, "innervisions") == ["Rej"]


class TestSortOrder:
    NAMES = ["Zedd", "Âme", "Adam Beyer", "ábaco", "Boris Brejcha", "ÉRIC", "Eric"]

    def _artists(self, repo, **query) -> List[str]:
        return [t.artist for t in repo.browse(BrowseQuery(**query), limit=100)]

    @pytest.fixture
    def mixed(self, repo):
        for index, name in enumerate(self.NAMES):
            _add(repo, str(index), artist=name, title=f"T{index}")
        return repo

    def test_an_accented_name_sorts_among_its_plain_letter(self, mixed):
        artists = self._artists(mixed)

        assert artists[:3] == ["ábaco", "Adam Beyer", "Âme"]
        assert artists[-1] == "Zedd"

    def test_the_whole_order_is_by_the_folded_key_with_the_original_as_tiebreak(
        self, mixed
    ):
        assert self._artists(mixed) == [
            "ábaco",
            "Adam Beyer",
            "Âme",
            "Boris Brejcha",
            "Eric",
            "ÉRIC",
            "Zedd",
        ]

    def test_descending_is_the_reverse_of_ascending(self, mixed):
        assert self._artists(mixed, direction="desc") == list(
            reversed(self._artists(mixed))
        )

    def test_search_results_are_in_that_order_too(self, mixed):
        assert [t.artist for t in mixed.search("e", limit=100)] == [
            "Adam Beyer",
            "Âme",
            "Boris Brejcha",
            "Eric",
            "ÉRIC",
            "Zedd",
        ]

    def test_non_latin_scripts_sort_by_code_point_after_the_latin(self, repo):
        for index, name in enumerate(["東京", "Zedd", "Σίσυφος", "Ärzte", "Яндекс"]):
            _add(repo, str(index), artist=name)

        assert [t.artist for t in repo.browse(BrowseQuery(), limit=100)] == [
            "Ärzte",
            "Zedd",
            "Σίσυφος",
            "Яндекс",
            "東京",
        ]

    def test_o_with_a_stroke_sorts_with_the_os(self, repo):
        for index, name in enumerate(["Zedd", "Øystein", "Oliver", "Paul", "Ola"]):
            _add(repo, str(index), artist=name)

        assert [t.artist for t in repo.browse(BrowseQuery(), limit=100)] == [
            "Ola",
            "Oliver",
            "Øystein",
            "Paul",
            "Zedd",
        ]

    def test_list_all_is_in_the_same_order(self, repo):
        for index, name in enumerate(["Zedd", "Âme", "Adam", "Øystein", "Paul"]):
            _add(repo, str(index), artist=name)

        assert [t.artist for t in repo.list_all()] == [
            "Adam",
            "Âme",
            "Øystein",
            "Paul",
            "Zedd",
        ]

    def test_titles_sort_the_same_way(self, repo):
        for index, title in enumerate(["Zulu", "Âme", "Alpha", "Bravo"]):
            _add(repo, str(index), title=title)

        assert [t.title for t in repo.browse(BrowseQuery(sort="title"), limit=100)] == [
            "Alpha",
            "Âme",
            "Bravo",
            "Zulu",
        ]

    def test_albums_sort_the_same_way_and_blanks_come_last(self, repo):
        for index, album in enumerate(["Zeta", "Éclair", None, "Alpha"]):
            _add(repo, str(index), album=album, title=f"T{index}")

        assert [t.album for t in repo.browse(BrowseQuery(sort="album"), limit=100)] == [
            "Alpha",
            "Éclair",
            "Zeta",
            None,
        ]

    def test_labels_sort_by_the_effective_label(self, repo, metadata):
        first = _add(repo, "1", label="Zed Records")
        second = _add(repo, "2", label="Beta")
        third = _add(repo, "3", label="Émile")
        metadata.set_override(first.id, "label", "Alpha")

        assert [t.id for t in repo.browse(BrowseQuery(sort="label"), limit=100)] == [
            first.id,
            second.id,
            third.id,
        ]

    def test_paging_through_a_tied_sort_visits_every_row_once(self, repo):
        for index in range(30):
            _add(repo, str(index), artist=["Âme", "AME", "ame"][index % 3])

        seen: List[int] = []
        for offset in range(0, 30, 7):
            seen.extend(
                t.id for t in repo.browse(BrowseQuery(), limit=7, offset=offset)
            )

        assert len(seen) == len(set(seen)) == 30
