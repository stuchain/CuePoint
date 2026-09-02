#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for library search (SHELL-04, DEC-023).

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_service import LibraryService
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
def library(repo) -> LibraryService:
    return LibraryService(repo)


def _add(repo: TrackRepository, track_id: str, **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", "Title")
    kwargs.setdefault("artist", "Artist")
    return repo.add(
        LibraryTrack(
            rekordbox_track_id=track_id,
            file_path=f"/music/{track_id}.mp3",
            **kwargs,
        )
    )


@pytest.fixture
def seeded(repo) -> TrackRepository:
    _add(
        repo,
        "1",
        title="Strobe",
        artist="deadmau5",
        album="For Lack of a Better Name",
        label="mau5trap",
    )
    _add(
        repo,
        "2",
        title="Ghosts n Stuff",
        artist="deadmau5",
        album="For Lack of a Better Name",
        label="mau5trap",
    )
    _add(repo, "3", title="Opus", artist="Eric Prydz", album="Opus", label="Virgin EMI")
    _add(repo, "4", title="Rej", artist="Âme", album="Rej EP", label="Innervisions")
    return repo


class TestMatching:
    def test_matches_title(self, seeded):
        assert [t.title for t in seeded.search("Strobe")] == ["Strobe"]

    def test_matches_artist(self, seeded):
        assert len(seeded.search("deadmau5")) == 2

    def test_matches_album(self, seeded):
        assert len(seeded.search("For Lack")) == 2

    def test_matches_label(self, seeded):
        assert [t.title for t in seeded.search("Innervisions")] == ["Rej"]

    def test_is_case_insensitive(self, seeded):
        assert len(seeded.search("DEADMAU5")) == len(seeded.search("deadmau5")) == 2

    def test_matches_a_substring_not_only_a_prefix(self, seeded):
        assert [t.title for t in seeded.search("trobe")] == ["Strobe"]

    def test_does_not_match_the_file_path(self, seeded):
        # Paths are deliberately excluded: a substring of a directory name would
        # match every track under it, which reads as a broken search.
        assert seeded.search("/music/") == []

    def test_blank_query_returns_nothing(self, seeded):
        # Not "everything": an empty search box is not a request to read the
        # whole library.
        assert seeded.search("") == []
        assert seeded.search("   ") == []
        assert seeded.search_count("") == 0

    def test_no_match_returns_empty(self, seeded):
        assert seeded.search("nothing here") == []
        assert seeded.search_count("nothing here") == 0


class TestLikeMetacharacters:
    """`%` and `_` are LIKE wildcards, and binding a parameter does not stop
    them being interpreted. Unescaped, a search for `_` matches everything."""

    def test_underscore_is_literal(self, repo):
        _add(repo, "1", title="Under_score")
        _add(repo, "2", title="Plain")

        assert [t.title for t in repo.search("_")] == ["Under_score"]

    def test_percent_is_literal(self, repo):
        _add(repo, "1", title="100% Pure")
        _add(repo, "2", title="Plain")

        assert [t.title for t in repo.search("%")] == ["100% Pure"]

    def test_escape_character_itself_is_literal(self, repo):
        # The escape character is `!`, so a query containing one must not break
        # the pattern or start escaping the next character.
        _add(repo, "1", title="Hey! Listen")
        _add(repo, "2", title="Plain")

        assert [t.title for t in repo.search("!")] == ["Hey! Listen"]
        assert [t.title for t in repo.search("Hey! Listen")] == ["Hey! Listen"]

    def test_quotes_do_not_break_the_query(self, repo):
        _add(repo, "1", title="Don't Stop")

        assert [t.title for t in repo.search("Don't")] == ["Don't Stop"]

    def test_sql_fragment_is_treated_as_text(self, repo):
        _add(repo, "1", title="Safe")

        assert repo.search("'; DROP TABLE tracks; --") == []
        # The table is still there.
        assert repo.count() == 1


class TestOrderingAndPaging:
    def test_orders_by_artist_then_title(self, repo):
        _add(repo, "1", title="Zebra", artist="Alpha")
        _add(repo, "2", title="Apple", artist="Alpha")
        _add(repo, "3", title="Anything", artist="Beta")

        assert [t.title for t in repo.search("a")] == ["Apple", "Zebra", "Anything"]

    def test_ordering_is_case_insensitive(self, repo):
        _add(repo, "1", title="b", artist="alpha")
        _add(repo, "2", title="a", artist="Alpha")

        assert [t.title for t in repo.search("alpha")] == ["a", "b"]

    def test_limit_and_offset_page_through_results(self, repo):
        for i in range(5):
            _add(repo, str(i), title=f"Track {i}", artist="Same")

        first = repo.search("Same", limit=2, offset=0)
        second = repo.search("Same", limit=2, offset=2)

        assert [t.title for t in first] == ["Track 0", "Track 1"]
        assert [t.title for t in second] == ["Track 2", "Track 3"]

    def test_count_ignores_paging(self, repo):
        for i in range(5):
            _add(repo, str(i), title=f"Track {i}", artist="Same")

        assert len(repo.search("Same", limit=2)) == 2
        assert repo.search_count("Same") == 5


class TestLibraryService:
    def test_returns_page_and_total(self, seeded, library):
        result = library.search_tracks("deadmau5", limit=1)

        assert result.total == 2
        assert len(result.tracks) == 1
        assert result.query == "deadmau5"

    def test_clamps_limit_to_the_maximum(self, seeded, library):
        # A 50,000-track library is an explicit target; an unbounded response
        # would materialize every matching row.
        assert (
            library.search_tracks("a", limit=10_000).limit
            == LibraryService.SEARCH_LIMIT_MAX
        )

    def test_rejects_a_limit_below_one(self, seeded, library):
        assert library.search_tracks("a", limit=0).limit == 1
        assert library.search_tracks("a", limit=-5).limit == 1

    def test_clamps_a_negative_offset(self, seeded, library):
        assert library.search_tracks("a", offset=-10).offset == 0

    def test_trims_the_query(self, seeded, library):
        assert library.search_tracks("  deadmau5  ").total == 2

    def test_blank_query_returns_an_empty_page(self, seeded, library):
        result = library.search_tracks("   ")

        assert result.tracks == []
        assert result.total == 0

    def test_empty_library_returns_nothing(self, library):
        result = library.search_tracks("anything")

        assert result.tracks == []
        assert result.total == 0
