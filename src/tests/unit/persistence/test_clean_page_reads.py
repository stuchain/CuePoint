#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The two reads the Clean page added (CLEAN-12).

- ``get_many``: a duplicate group's members, in the order the group names them,
  past one chunk of ids, with a track a refresh removed left out.
- ``unavailable_paths``: the paths the last check found on a missing root, for
  the path each track has now only.
"""

from __future__ import annotations

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.persistence.id_chunks import CHUNK_SIZE
from tests.unit.persistence.test_clean_projections import (  # noqa: F401 — fixtures
    NOW,
    add,
    container,
    resolve,
)


@pytest.mark.unit
class TestGetMany:
    def test_in_the_order_given_once_each(self, container):  # noqa: F811
        ids = add(3)
        wanted = [ids[2], ids[0], ids[2], ids[1]]
        found = resolve("ITrackRepository").get_many(wanted)
        assert [track.id for track in found] == [ids[2], ids[0], ids[1]]

    def test_an_id_that_names_no_track_is_left_out(self, container):  # noqa: F811
        [track_id] = add(1)
        found = resolve("ITrackRepository").get_many([424242, track_id])
        assert [track.id for track in found] == [track_id]

    def test_past_one_chunk(self, container):  # noqa: F811
        ids = add(CHUNK_SIZE + 5)
        found = resolve("ITrackRepository").get_many(list(reversed(ids)))
        assert [track.id for track in found] == list(reversed(ids))

    def test_nothing_asked_for(self, container):  # noqa: F811
        assert resolve("ITrackRepository").get_many([]) == []


def record(*checks: TrackFileStatus) -> None:
    with resolve("IDatabaseService").transaction():
        resolve("IFileStatusRepository").record(list(checks))


@pytest.mark.unit
class TestUnavailablePaths:
    def test_only_missing_on_an_unavailable_root_at_the_current_path(
        self,
        container,  # noqa: F811
    ):
        unplugged, plain_missing, present, moved = add(4)
        tracks = resolve("ITrackRepository")
        paths = {
            track.id: track.file_path
            for track in tracks.get_many([unplugged, plain_missing, present, moved])
        }
        record(
            TrackFileStatus(
                unplugged,
                FILE_MISSING,
                paths[unplugged],
                NOW,
                reason=REASON_ROOT_UNAVAILABLE,
            ),
            TrackFileStatus(plain_missing, FILE_MISSING, paths[plain_missing], NOW),
            TrackFileStatus(present, FILE_PRESENT, paths[present], NOW, 10),
            # Checked at a path the track no longer has: a refresh has answered
            # for it since, and the old finding is not about the library now.
            TrackFileStatus(
                moved,
                FILE_MISSING,
                "/elsewhere/old.mp3",
                NOW,
                reason=REASON_ROOT_UNAVAILABLE,
            ),
        )

        assert resolve("IFileStatusRepository").unavailable_paths() == [
            paths[unplugged]
        ]

    def test_nothing_checked(self, container):  # noqa: F811
        add(2)
        assert resolve("IFileStatusRepository").unavailable_paths() == []


def pairs(count: int) -> None:
    """``count`` groups of two by the text signal, and a scan that finds them."""
    from cuepoint.models.library_track import LibraryTrack

    resolve("ITrackRepository").add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"pair-{n}-{copy}",
                file_path=f"/music/pair-{n}-{copy}.mp3",
                title=f"Pair {n:03d}",
                artist="Twins",
                duration_seconds=200,
            )
            for n in range(count)
            for copy in (0, 1)
        ]
    )
    resolve("IDuplicateService").scan(["text"])


@pytest.mark.unit
class TestDuplicateGroupsPagedInSql:
    def test_pages_are_slices_of_the_whole_listing(self, container):  # noqa: F811
        pairs(7)
        service = resolve("IDuplicateService")
        whole = [group.group.id for group in service.groups()]
        assert len(whole) == 7
        paged = [
            group.group.id
            for offset in range(0, 7, 3)
            for group in service.groups(limit=3, offset=offset)
        ]
        assert paged == whole
        assert [g.group.id for g in service.groups(offset=5)] == whole[5:]
        assert service.count_groups() == 7
        assert service.count_groups("text") == 7
        assert service.count_groups("path") == 0

    def test_a_dismissed_group_is_left_out_of_the_page_and_the_count(
        self,
        container,  # noqa: F811
    ):
        pairs(4)
        service = resolve("IDuplicateService")
        first = service.groups()[0].group.id
        service.dismiss(first)

        shown = [g.group.id for g in service.groups(limit=10)]
        assert first not in shown
        assert len(shown) == service.count_groups() == 3
        everything = service.groups(include_dismissed=True, limit=2)
        assert [g.group.id for g in everything][0] == first
        assert everything[0].dismissed is True
        assert service.count_groups(include_dismissed=True) == 4

    @pytest.mark.parametrize("page", [{"limit": 0}, {"offset": -1}])
    def test_a_page_that_is_not_one_is_refused(self, container, page):  # noqa: F811
        with pytest.raises(ValueError):
            resolve("IDuplicateService").groups(**page)

    def test_an_unknown_signal_is_refused_when_counting(self, container):  # noqa: F811
        with pytest.raises(ValueError):
            resolve("IDuplicateService").count_groups("colour")
