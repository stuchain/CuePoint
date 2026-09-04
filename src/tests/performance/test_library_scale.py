#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library at scale (LIBRARY-12).

Phase 3 was designed against 50,000 tracks, and several of its choices only
make sense at that size: the parser streams and clears elements, the upsert
resolves identity against one snapshot rather than a query per track, the diff
reads the collection once, and an unchanged refresh does not read it at all.
Each of those costs something in clarity, so each has to keep earning its place.

``scripts/bench_library.py`` is the full 50,000-track measurement and prints the
numbers that go in the docs. These tests are the part worth running repeatedly:
they use a smaller collection and assert the **relationships** rather than
wall-clock seconds, because absolute timings vary by machine and a test that
fails on a slow laptop teaches people to ignore it.

Marked slow. ``scripts/run_tests.py --no-slow`` skips them; a release run does
not.
"""

from __future__ import annotations

import sys
import time
import tracemalloc
from pathlib import Path

import pytest

# `scripts/` is not a package and is not on the path; the generator lives there
# because it is also a command a person runs.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

from bench_library import build_service, write_export  # noqa: E402

#: Big enough for the relationships to be real, small enough to run often.
#: The full 50,000 is `scripts/bench_library.py`.
TRACKS = 20_000
PLAYLISTS = 60

#: Peak allocation a single pass may use per track, in bytes.
#:
#: Measured at 50,000 tracks: ~1.1 KB per track for an import and ~2.3 KB for a
#: pass that also holds the identity snapshot. Both are linear by design — one
#: snapshot plus one batch — so the guard is the constant, not the shape. The
#: ceiling is deliberately loose: it is here to catch a pass that stopped
#: releasing parsed XML elements, which costs several KB each, not to police
#: ordinary variation.
PEAK_BYTES_PER_TRACK = 8 * 1024

#: How much faster an unchanged refresh must be than a fresh import.
#:
#: Measured at 50,000 it is thousands of times faster, because DEC-035's
#: recorded file state answers without opening the export. Asserted at 20x so
#: the test says "not a fresh import" rather than pinning a number that a faster
#: machine would make meaningless.
UNCHANGED_SPEEDUP = 20


class Timed:
    """Wall time and peak allocation around a block."""

    def __enter__(self) -> "Timed":
        tracemalloc.start()
        self.started = time.perf_counter()
        return self

    def __exit__(self, *exc) -> None:
        self.seconds = time.perf_counter() - self.started
        _current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        self.peak_bytes = peak


@pytest.fixture(scope="module")
def scale(tmp_path_factory):
    """One import of a large collection, shared by every test here.

    Module-scoped because generating and importing 20,000 tracks takes seconds
    and none of these tests needs a fresh one — they are asked in order and the
    later ones depend on the earlier ones having happened.
    """
    workspace = tmp_path_factory.mktemp("library-scale")
    export = write_export(
        workspace / "collection.xml", list(range(1, TRACKS + 1)), PLAYLISTS
    )
    service = build_service(workspace / "library.db")

    with Timed() as timing:
        summary = service.import_rekordbox_xml(str(export))

    state = {
        "workspace": workspace,
        "export": export,
        "service": service,
        "summary": summary,
        "import_seconds": timing.seconds,
        "import_peak": timing.peak_bytes,
    }
    yield state
    service._db.close_all()


@pytest.mark.performance
@pytest.mark.slow
class TestImportingAtScale:
    def test_it_imports_every_track_and_the_whole_tree(self, scale):
        summary = scale["summary"]
        assert summary.tracks_inserted == TRACKS
        assert summary.playlists.playlists == PLAYLISTS
        assert summary.playlists.entries > TRACKS

    def test_it_does_not_hold_the_collection_in_memory(self, scale):
        """The streaming parser's whole reason for existing.

        A pass that stopped clearing and detaching elements would keep every
        parsed ``TRACK`` alive, which costs several KB each on top of the rows
        being written — the failure this ceiling is set to catch.
        """
        per_track = scale["import_peak"] / TRACKS
        assert per_track < PEAK_BYTES_PER_TRACK, (
            f"{per_track / 1024:.1f} KB per track at import; "
            f"the ceiling is {PEAK_BYTES_PER_TRACK / 1024:.0f} KB"
        )

    def test_re_importing_converges_rather_than_duplicating(self, scale):
        service, export = scale["service"], scale["export"]

        again = service.import_rekordbox_xml(str(export))

        assert again.tracks_inserted == 0
        assert again.tracks_updated == TRACKS
        assert service._tracks.count() == TRACKS


@pytest.mark.performance
@pytest.mark.slow
class TestAnUnchangedRefreshIsFast:
    """The common case, and the one LIBRARY-12 required be measured.

    Re-checking an export nobody has touched is what the Library page does every
    time it is opened. Reading the whole collection to answer it costs the same
    as importing it, which is what the measurement showed and why DEC-035's
    recorded file state is consulted first.
    """

    def test_it_is_nothing_like_a_fresh_import(self, scale):
        service, export = scale["service"], scale["export"]

        with Timed() as timing:
            diff = service.compute_refresh_diff(str(export))

        assert diff.is_empty
        assert timing.seconds * UNCHANGED_SPEEDUP < scale["import_seconds"], (
            f"an unchanged refresh took {timing.seconds:.2f}s against an import "
            f"of {scale['import_seconds']:.2f}s"
        )

    def test_it_says_it_did_not_read_the_file(self, scale):
        """A shortcut a caller cannot see is a shortcut nobody can debug."""
        diff = scale["service"].compute_refresh_diff(str(scale["export"]))

        assert diff.contents_compared is False

    def test_reading_it_in_full_agrees(self, scale):
        """The shortcut must not be hiding a difference the full pass would find.

        Without this, every assertion above would pass against a shortcut that
        was simply wrong.
        """
        with Timed() as timing:
            forced = scale["service"].compute_refresh_diff(
                str(scale["export"]), force=True
            )

        assert forced.is_empty
        assert forced.contents_compared is True
        # And it really is the expensive path — otherwise the comparison above
        # is between two shortcuts.
        assert timing.seconds * UNCHANGED_SPEEDUP > scale["import_seconds"] / 10


@pytest.mark.performance
@pytest.mark.slow
class TestRefreshingAtScale:
    def test_the_diff_and_the_apply_agree_on_a_large_edit(self, scale):
        service = scale["service"]
        removed = TRACKS // 100
        added = TRACKS // 200
        edited = write_export(
            scale["workspace"] / "edited.xml",
            list(range(1 + removed, TRACKS + 1))
            + list(range(10_000_000, 10_000_000 + added)),
            PLAYLISTS,
        )

        with Timed() as diffing:
            diff = service.compute_refresh_diff(str(edited))
        assert (diff.added.count, diff.removed.count) == (added, removed)
        assert diff.contents_compared is True

        with Timed() as applying:
            summary = service.apply_refresh(diff)

        assert summary.tracks_inserted == diff.added.count
        assert summary.tracks_deleted == diff.removed.count
        assert service._tracks.count() == TRACKS - removed + added
        # Both passes stream; neither may hold the collection.
        for label, timing in (("diff", diffing), ("apply", applying)):
            per_track = timing.peak_bytes / TRACKS
            assert per_track < PEAK_BYTES_PER_TRACK, (
                f"{per_track / 1024:.1f} KB per track during the {label}"
            )

    def test_the_playlist_mirror_survives_the_refresh(self, scale):
        """A deletion cascades through membership; the tree must still be whole."""
        service = scale["service"]
        connection = service._db.connect()

        orphans = connection.execute(
            "SELECT count(*) FROM rekordbox_playlist_tracks e "
            "LEFT JOIN tracks t ON t.id = e.track_id WHERE t.id IS NULL"
        ).fetchone()[0]

        assert orphans == 0
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        # `count()` is nodes, so the two folders the generator writes — ROOT and
        # the group under it — are in the total alongside the playlists.
        assert service._playlists.count() == PLAYLISTS + 2
        assert service._playlists.count_entries() > 0
