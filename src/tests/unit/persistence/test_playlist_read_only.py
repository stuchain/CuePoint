#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-031: the mirrored playlist tree is source data, and stays read-only.

The mirror is rewritten wholesale from an export and never edited in place. A
rename, a move, or an add-track method would be a trap rather than a feature:
whatever it wrote would be destroyed without warning by the next refresh, and
the user would have no way to know why their edit vanished. Phase 6's
Collections are the editable concept, in their own tables.

The absence of those methods is the enforcement, so it is asserted here — the
same approach ``test_activity_append_only.py`` takes for the append-only
activity log.
"""

from __future__ import annotations

import inspect

import pytest

from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.services.interfaces import IPlaylistRepository

# The only writes a mirror may offer: replace it all, or remove it all.
ALLOWED_WRITES = {"replace_tree", "clear"}

# Verbs that would imply editing the mirror in place.
FORBIDDEN_VERBS = (
    "add",
    "append",
    "insert",
    "update",
    "rename",
    "move",
    "reorder",
    "remove",
    "delete",
    "set_",
    "save",
    "edit",
    "create",
)


def _public_methods(cls) -> set:
    return {
        name
        for name, member in inspect.getmembers(cls, inspect.isfunction)
        if not name.startswith("_")
    }


@pytest.mark.unit
class TestNoInPlaceEditing:
    def test_the_repository_exposes_no_mutating_method(self):
        offenders = sorted(
            name
            for name in _public_methods(PlaylistRepository)
            if name not in ALLOWED_WRITES
            and any(name.startswith(verb) for verb in FORBIDDEN_VERBS)
        )
        assert offenders == [], (
            f"{offenders} would let a caller edit the Rekordbox mirror in place. "
            "The next refresh would silently destroy whatever it wrote; an "
            "editable playlist belongs to Phase 6's Collections, in its own table."
        )

    def test_the_interface_exposes_no_mutating_method(self):
        offenders = sorted(
            name
            for name in _public_methods(IPlaylistRepository)
            if name not in ALLOWED_WRITES
            and any(name.startswith(verb) for verb in FORBIDDEN_VERBS)
        )
        assert offenders == []

    def test_the_repository_implements_the_interface(self):
        assert issubclass(PlaylistRepository, IPlaylistRepository)

    def test_every_interface_method_is_implemented(self):
        missing = _public_methods(IPlaylistRepository) - _public_methods(
            PlaylistRepository
        )
        assert missing == set()

    def test_the_two_permitted_writes_are_present(self):
        assert ALLOWED_WRITES <= _public_methods(PlaylistRepository)
