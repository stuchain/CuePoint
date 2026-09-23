"""An export could overwrite its own source on a case-insensitive volume.

DEC-083 promises that an export is always a new file and never the collection
it was read from, and ``refuse_source_as_destination`` is where that promise is
enforced for every caller. It compared the two paths with
``os.path.normcase``, which folds case on Windows and does nothing whatsoever
on POSIX — so the guard held on NTFS and did not hold on the default APFS and
HFS+ volumes, which are case-insensitive as well.

On a Mac, then, choosing ``COLLECTION.XML`` as the destination of an export
read from ``collection.xml`` passed the check and the write landed on the very
same bytes: the user's Rekordbox library, replaced by the export, with no
warning and no way back. Found by the Phase 8 macOS pass; the unit test that
should have caught it skipped itself with ``os.name != "nt"``.

The fix asks the filesystem — ``os.path.samefile`` — before it asks the path
strings, so a case difference, a hard link and a volume reached by two names
are all the same file, whatever the platform thinks of the spelling.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.data.rekordbox_export import (
    TrackExportValues,
    patch_collection_xml,
    refuse_source_as_destination,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError

COLLECTION = b"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="One" Artist="A" Tonality="Am" AverageBpm="120.00"
           Genre="Techno" Label="L" Year="2020" Rating="0"
           Location="file://localhost/music/one.mp3"/>
  </COLLECTION>
</DJ_PLAYLISTS>
"""


@pytest.fixture()
def source(tmp_path: Path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_bytes(COLLECTION)
    return path


def _volume_is_case_insensitive(path: Path) -> bool:
    upper = Path(str(path).upper())
    try:
        return upper.exists() and os.path.samefile(path, upper)
    except OSError:  # pragma: no cover - an unreadable path is not this test's
        return False


def test_a_differently_cased_destination_is_the_source(source: Path) -> None:
    """The guard alone, which is what the old code got wrong."""
    if not _volume_is_case_insensitive(source):
        pytest.skip("this volume is case-sensitive: the two names are two files")

    with pytest.raises(ValidationError, match="read from"):
        refuse_source_as_destination(str(source), str(source).upper())


def test_the_source_survives_an_export_aimed_at_its_own_name(source: Path) -> None:
    """And the consequence: the library is still there afterwards.

    This is the assertion that makes the bug a data-loss bug rather than a
    missing error message. On the unfixed code the write succeeded and
    ``collection.xml`` came back holding the export.
    """
    if not _volume_is_case_insensitive(source):
        pytest.skip("this volume is case-sensitive: the two names are two files")

    before = source.read_bytes()

    with pytest.raises(ValidationError):
        patch_collection_xml(
            str(source),
            {"1": TrackExportValues(key="Cm")},
            str(source.parent / source.name.upper()),
        )

    assert source.read_bytes() == before


def test_a_hard_link_to_the_source_is_the_source(source: Path, tmp_path: Path) -> None:
    """Same file, different name, on every platform — string comparison cannot see it."""
    link = tmp_path / "linked.xml"
    try:
        os.link(source, link)
    except (OSError, NotImplementedError, AttributeError):  # pragma: no cover
        pytest.skip("this filesystem does not support hard links")

    with pytest.raises(ValidationError):
        refuse_source_as_destination(str(source), str(link))


def test_a_genuinely_different_destination_is_still_allowed(source: Path) -> None:
    """The guard did not become a refusal of everything."""
    refuse_source_as_destination(str(source), str(source.parent / "export.xml"))
    refuse_source_as_destination(str(source), str(source.parent / "Export.xml"))
