#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Path-keyed lookups meet a name however its Unicode form was written (HARDEN-06).

macOS hands names back decomposed (NFD), Rekordbox on Windows writes them
composed (NFC). Three lookups read ``tracks.normalized_path``: the identity
fallback of a refresh, a lookup by path, and the duplicate finder. Each is
driven here with the same file spelled both ways.
"""

from __future__ import annotations

import unicodedata

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

PATH = "/Music/Beyoncé/Déjà Vu.m4a"
NFC = unicodedata.normalize("NFC", PATH)
NFD = unicodedata.normalize("NFD", PATH)

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


def _track(track_id: str, path: str) -> LibraryTrack:
    return LibraryTrack(
        rekordbox_track_id=track_id, title="Déjà Vu", artist="Beyoncé", file_path=path
    )


def test_the_two_spellings_are_not_the_same_string():
    assert NFC != NFD


def test_find_by_path_finds_a_track_stored_in_the_other_form(repo):
    stored = repo.add(_track("1", NFC))

    assert repo.find_by_path(NFD).id == stored.id
    assert repo.find_by_path(NFC).id == stored.id


def test_the_stored_file_path_keeps_the_form_the_disk_holds(repo):
    repo.add(_track("1", NFD))

    stored = repo.find_by_path(NFC)
    assert stored.file_path == NFD
    assert stored.normalized_path == NFC.casefold()


def test_a_refresh_with_a_renumbered_track_relinks_through_the_other_form(repo):
    original = repo.add(_track("1", NFC))

    track, action, relinked = repo.upsert_from_rekordbox(_track("77", NFD))

    assert (action, relinked) == ("updated", True)
    assert track.id == original.id


def test_the_bulk_refresh_relinks_through_the_other_form(repo):
    original = repo.add(_track("1", NFC))

    result = repo.upsert_many_from_rekordbox([_track("77", NFD)])

    assert result.inserted == 0
    assert repo.find_by_path(NFC).id == original.id


def test_the_duplicate_finder_groups_the_two_spellings(db, repo):
    first = repo.add(_track("1", NFC))
    second = repo.add(_track("2", NFD))

    groups = DuplicateRepository(db).path_groups()

    assert [set(g.track_ids) for g in groups] == [{first.id, second.id}]
