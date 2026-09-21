#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A patch reports two phases and can be stopped part way (EXPORT-05).

What these protect is DEC-084's "cancelling before the replace leaves no file at
the destination; the temp file is removed. There is no partial export." A stop is
asked at three kinds of moment — between tracks, between playlists, and after the
new file is written but before it replaces anything — and each is tested with a
file already at the destination, because "nothing was written" and "nothing was
overwritten" are the same promise only if both are checked.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, List, Tuple

import pytest

from cuepoint.data.rekordbox_export import (
    PHASE_PLAYLISTS,
    PHASE_TRACKS,
    PHASE_WRITE,
    PHASES,
    PROGRESS_EVERY_TRACKS,
    ExportCancelled,
    ExportFolder,
    ExportPlaylist,
    TrackExportValues,
    patch_collection_xml,
    phase_description,
    plan_collection_xml,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError

pytestmark = pytest.mark.unit

#: A file already at the destination: a previous export, which a cancelled one
#: must leave exactly as it was.
EARLIER = b"<earlier export, which must survive untouched/>"


def collection(tracks: int) -> bytes:
    """A document of ``tracks`` tracks and an empty root folder."""
    body = "".join(
        f'    <TRACK TrackID="{index}" Name="T{index}" Tonality="Am"/>\n'
        for index in range(1, tracks + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{tracks}">\n{body}  </COLLECTION>\n'
        '  <PLAYLISTS>\n    <NODE Type="0" Name="ROOT" Count="0"/>\n  </PLAYLISTS>\n'
        "</DJ_PLAYLISTS>\n"
    ).encode("utf-8")


def tree() -> Tuple[ExportFolder, ExportPlaylist]:
    """Three playlists, one inside a folder."""
    return (
        ExportFolder(
            name="Gigs",
            children=(
                ExportPlaylist(name="One", track_ids=("1", "2")),
                ExportPlaylist(name="Two", track_ids=("3",)),
            ),
        ),
        ExportPlaylist(name="Three", track_ids=("1",)),
    )


@pytest.fixture()
def source(tmp_path: Path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_bytes(collection(2500))
    return path


@pytest.fixture()
def destination(tmp_path: Path) -> Path:
    path = tmp_path / "out" / "export.xml"
    path.parent.mkdir()
    path.write_bytes(EARLIER)
    return path


def updates() -> dict:
    return {"1": TrackExportValues(key="Cm"), "2": TrackExportValues(genre="House")}


def stop_after(asked: int) -> Tuple[Callable[[], bool], List[int]]:
    """A cancel check that answers yes on its ``asked``-th question."""
    count = [0]

    def should_cancel() -> bool:
        count[0] += 1
        return count[0] >= asked

    return should_cancel, count


def leftovers(folder: Path) -> List[str]:
    return sorted(path.name for path in folder.iterdir() if path.name != "export.xml")


# ----------------------------------------------------------------- progress


class TestTwoPhasesOfProgress:
    def test_the_tracks_then_the_playlists_each_from_zero_to_their_total(
        self, source: Path, destination: Path
    ):
        ticks: List[Tuple[str, int, int]] = []

        patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            tree(),
            on_progress=lambda *tick: ticks.append(tick),
        )

        tracks = [tick for tick in ticks if tick[0] == PHASE_TRACKS]
        playlists = [tick for tick in ticks if tick[0] == PHASE_PLAYLISTS]
        assert tracks[0] == (PHASE_TRACKS, 0, 2500)
        assert tracks[-1] == (PHASE_TRACKS, 2500, 2500)
        assert playlists[0] == (PHASE_PLAYLISTS, 0, 3)
        assert playlists[-1] == (PHASE_PLAYLISTS, 3, 3)
        assert ticks.index(tracks[-1]) < ticks.index(playlists[0])

    def test_track_progress_is_sampled_rather_than_sent_per_track(
        self, source: Path, destination: Path
    ):
        ticks: List[Tuple[str, int, int]] = []

        patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            on_progress=lambda *tick: ticks.append(tick),
        )

        done = [tick[1] for tick in ticks if tick[0] == PHASE_TRACKS]
        assert done == [0, 1000, 2000, 2500]
        assert PROGRESS_EVERY_TRACKS == 1000

    def test_progress_only_ever_moves_forward(self, source: Path, destination: Path):
        ticks: List[Tuple[str, int, int]] = []

        patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            tree(),
            on_progress=lambda *tick: ticks.append(tick),
        )

        for phase in PHASES:
            done = [tick[1] for tick in ticks if tick[0] == phase]
            assert done == sorted(done)

    def test_a_playlist_count_includes_those_nested_in_folders(
        self, source: Path, destination: Path
    ):
        ticks: List[Tuple[str, int, int]] = []

        patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            (
                ExportFolder(
                    name="A", children=(ExportFolder(name="B", children=tree()),)
                ),
            ),
            on_progress=lambda *tick: ticks.append(tick),
        )

        assert {tick[2] for tick in ticks if tick[0] == PHASE_PLAYLISTS} == {3}

    def test_no_playlists_is_a_phase_of_nothing_rather_than_a_missing_one(
        self, source: Path, destination: Path
    ):
        ticks: List[Tuple[str, int, int]] = []

        patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            on_progress=lambda *tick: ticks.append(tick),
        )

        assert (PHASE_PLAYLISTS, 0, 0) in ticks

    def test_the_preview_reports_the_same_phases(self, source: Path):
        ticks: List[Tuple[str, int, int]] = []

        plan_collection_xml(
            str(source), updates(), tree(), on_progress=lambda *tick: ticks.append(tick)
        )

        assert ticks[0] == (PHASE_TRACKS, 0, 2500)
        assert ticks[-1] == (PHASE_PLAYLISTS, 3, 3)

    def test_without_a_callback_nothing_changes(self, source: Path, destination: Path):
        quiet = patch_collection_xml(str(source), updates(), str(destination), tree())
        other = destination.with_name("again.xml")
        loud = patch_collection_xml(
            str(source), updates(), str(other), tree(), on_progress=lambda *t: None
        )

        assert quiet == loud
        assert destination.read_bytes() == other.read_bytes()


# ------------------------------------------------------------------- stopping


class TestStoppingPartWay:
    def test_a_stop_between_tracks_writes_nothing_and_leaves_nothing(
        self, source: Path, destination: Path
    ):
        should_cancel, asked = stop_after(100)

        with pytest.raises(ExportCancelled) as stopped:
            patch_collection_xml(
                str(source),
                updates(),
                str(destination),
                tree(),
                should_cancel=should_cancel,
            )

        assert stopped.value.phase == PHASE_TRACKS
        assert asked[0] == 100
        assert destination.read_bytes() == EARLIER
        assert leftovers(destination.parent) == []

    def test_a_stop_is_asked_between_every_track(self, source: Path, destination: Path):
        asked = [0]

        def never() -> bool:
            asked[0] += 1
            return False

        patch_collection_xml(
            str(source), updates(), str(destination), should_cancel=never
        )

        # Once per track, and once more before the replace.
        assert asked[0] == 2500 + 1

    def test_a_stop_between_playlists_writes_nothing_and_leaves_nothing(
        self, source: Path, destination: Path
    ):
        should_cancel, _asked = stop_after(2500 + 2)

        with pytest.raises(ExportCancelled) as stopped:
            patch_collection_xml(
                str(source),
                updates(),
                str(destination),
                tree(),
                should_cancel=should_cancel,
            )

        assert stopped.value.phase == PHASE_PLAYLISTS
        assert destination.read_bytes() == EARLIER
        assert leftovers(destination.parent) == []

    def test_a_stop_is_asked_once_per_playlist(self, source: Path, destination: Path):
        asked = [0]

        def never() -> bool:
            asked[0] += 1
            return False

        patch_collection_xml(
            str(source), updates(), str(destination), tree(), should_cancel=never
        )

        assert asked[0] == 2500 + 3 + 1

    def test_a_stop_after_the_write_and_before_the_replace_keeps_the_old_file(
        self, source: Path, destination: Path
    ):
        """The last moment a stop can be honoured: the new file exists as a temp
        file and has not replaced anything. It must go, and the old one stay."""
        should_cancel, _asked = stop_after(2500 + 3 + 1)

        with pytest.raises(ExportCancelled) as stopped:
            patch_collection_xml(
                str(source),
                updates(),
                str(destination),
                tree(),
                should_cancel=should_cancel,
            )

        assert stopped.value.phase == PHASE_WRITE
        assert destination.read_bytes() == EARLIER
        assert leftovers(destination.parent) == []

    def test_a_stop_before_the_replace_on_a_new_destination_leaves_no_file(
        self, source: Path, tmp_path: Path
    ):
        target = tmp_path / "fresh.xml"
        should_cancel, _asked = stop_after(2500 + 1)

        with pytest.raises(ExportCancelled):
            patch_collection_xml(
                str(source), updates(), str(target), should_cancel=should_cancel
            )

        assert not target.exists()
        assert sorted(path.name for path in tmp_path.iterdir()) == ["collection.xml"]

    def test_the_preview_can_be_stopped_too(self, source: Path):
        should_cancel, _asked = stop_after(10)

        with pytest.raises(ExportCancelled):
            plan_collection_xml(
                str(source), updates(), tree(), should_cancel=should_cancel
            )

    def test_a_cancel_is_not_a_validation_error(self):
        """Handlers that turn a ValidationError into "that cannot be done" must
        not turn a person's own cancel into one."""
        assert not issubclass(ExportCancelled, ValidationError)

    @pytest.mark.parametrize(
        ("phase", "words"),
        (
            (PHASE_TRACKS, "patching tracks"),
            (PHASE_PLAYLISTS, "building playlists"),
            (PHASE_WRITE, "writing the file"),
        ),
    )
    def test_a_stop_says_where_it_happened(self, phase: str, words: str):
        assert phase_description(phase) == words
        assert words in str(ExportCancelled(phase))

    def test_a_stop_never_asked_for_changes_nothing(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source),
            updates(),
            str(destination),
            tree(),
            should_cancel=lambda: False,
        )

        assert result.tracks_changed == 2
        assert destination.read_bytes() != EARLIER
