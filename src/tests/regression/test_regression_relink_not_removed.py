"""Regression test: RB-RELINK-NOT-REMOVED.

A Rekordbox database rebuild renumbers every ``TrackID`` while leaving the files
alone. DEC-002 re-links those tracks by path so their tags and ratings survive;
the refresh preview must say so. A diff that compared ids would announce the
whole library as removed and re-added — and DEC-003's deletions cannot be undone.

See ``RB-RELINK-NOT-REMOVED/README.md``. The assertions are on what the preview
tells the user, not on how the comparison is implemented.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner

TRACK_ATTRS = (
    'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" '
    'TotalTime="360" BitRate="320" Rating="204" PlayCount="7"'
)

#: Big enough that "every id changed" is unmistakably a rebuild rather than a
#: coincidence, small enough to stay a unit-speed test.
TRACK_COUNT = 40


def _export(tmp_path: Path, name: str, id_prefix: str = "") -> str:
    tracks = "\n".join(
        f'<TRACK TrackID="{id_prefix}{i}" Name="Track {i}" Artist="Artist {i}" '
        f'{TRACK_ATTRS} Location="file://localhost/music/track-{i}.mp3"/>'
        for i in range(TRACK_COUNT)
    )
    refs = "".join(f'<TRACK Key="{id_prefix}{i}"/>' for i in range(TRACK_COUNT))
    path = tmp_path / name
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        f'  <COLLECTION Entries="{TRACK_COUNT}">\n{tracks}\n  </COLLECTION>\n'
        '  <PLAYLISTS><NODE Name="ROOT" Type="0">'
        f'<NODE Name="Set" Type="1" Entries="{TRACK_COUNT}">{refs}</NODE>'
        "</NODE></PLAYLISTS>\n"
        "</DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )
    return str(path)


@pytest.fixture
def library(tmp_path):
    """A library imported from the original export, plus its service."""
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    tracks = TrackRepository(service)
    playlists = PlaylistRepository(service)
    importer = LibraryImportService(tracks, playlists, LibrarySourceRepository(service))
    importer.import_rekordbox_xml(_export(tmp_path, "before.xml"))
    try:
        yield importer, tracks, playlists
    finally:
        service.close_all()


@pytest.mark.integration
def test_a_rebuilt_rekordbox_database_previews_as_relinks_not_deletions(
    library, tmp_path
):
    """The whole library renumbered: everything re-links, nothing is deleted."""
    importer, tracks, _playlists = library
    rebuilt = _export(tmp_path, "after.xml", id_prefix="7")

    diff = importer.compute_refresh_diff(rebuilt)

    assert diff.relinked.count == TRACK_COUNT
    assert diff.removed.count == 0, (
        "a re-linked track previewed as removed; confirming this preview would "
        "delete the tags and ratings DEC-002 exists to keep"
    )
    assert diff.added.count == 0, (
        "a re-linked track previewed as new, which loses its history"
    )
    # Nothing about the tracks themselves differs, only their ids — and the id
    # is identity, not a compared field.
    assert diff.changed.count == 0


@pytest.mark.integration
def test_the_playlists_are_not_reported_as_edited_either(library, tmp_path):
    """Same tracks, same order. Only the numbers Rekordbox uses changed."""
    importer, _tracks, _playlists = library

    diff = importer.compute_refresh_diff(_export(tmp_path, "after.xml", id_prefix="7"))

    assert diff.playlists_changed.count == 0, (
        "membership compared by TrackID rather than by library row"
    )
    assert diff.playlists_added.count == 0
    assert diff.playlists_removed.count == 0


@pytest.mark.integration
def test_the_preview_matches_what_applying_it_would_do(library, tmp_path):
    """The promise and the act.

    An import after the preview must re-link the same tracks the preview named,
    keep every library row, and leave the ratings attached to them.
    """
    importer, tracks, _playlists = library
    rebuilt = _export(tmp_path, "after.xml", id_prefix="7")

    rows_before = {track.file_path: track.id for track in tracks.list_all()}
    ratings_before = {track.file_path: track.rating for track in tracks.list_all()}

    diff = importer.compute_refresh_diff(rebuilt)
    summary = importer.import_rekordbox_xml(rebuilt)

    assert summary.relinked_count == diff.relinked.count
    assert summary.tracks_inserted == 0
    assert tracks.count() == TRACK_COUNT

    rows_after = {track.file_path: track.id for track in tracks.list_all()}
    ratings_after = {track.file_path: track.rating for track in tracks.list_all()}
    assert rows_after == rows_before, (
        "a re-link created a new row instead of keeping one"
    )
    assert ratings_after == ratings_before


@pytest.mark.integration
def test_a_genuine_deletion_is_still_reported(library, tmp_path):
    """The other half: this must not become "nothing is ever removed".

    A test that only proved removals are never reported would pass against a
    diff that had lost the category entirely.
    """
    importer, _tracks, _playlists = library
    shrunk = tmp_path / "shrunk.xml"
    original = Path(_export(tmp_path, "again.xml")).read_text(encoding="utf-8")
    shrunk.write_text(
        original.replace(
            '<TRACK TrackID="0" Name="Track 0" Artist="Artist 0" '
            f'{TRACK_ATTRS} Location="file://localhost/music/track-0.mp3"/>\n',
            "",
        ),
        encoding="utf-8",
    )

    diff = importer.compute_refresh_diff(str(shrunk))

    assert diff.removed.count == 1
    assert diff.removed.items[0].rekordbox_track_id == "0"
