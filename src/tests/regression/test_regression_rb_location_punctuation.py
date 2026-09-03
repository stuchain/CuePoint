"""Regression test: RB-LOCATION-PUNCTUATION.

``get_track_locations()`` truncated any track path at the first ``?`` or ``#``,
so inKey could not find those files to write tags to. Seven tracks in one real
3,880-track collection were affected. See ``RB-LOCATION-PUNCTUATION/README.md``.

The assertions are on the symptom the user saw — the path names the file — not
on how the decoding is implemented.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

import pytest

from cuepoint.data.rekordbox import get_track_locations


def _case_dir() -> Path:
    return Path(__file__).resolve().parent / "RB-LOCATION-PUNCTUATION"


@pytest.fixture(scope="module")
def locations():
    return get_track_locations(str(_case_dir() / "input.xml"))


@pytest.mark.integration
@pytest.mark.parametrize(
    "track_id,filename",
    [
        ("1", "Samer Soltan - Is This A Dream? (Remix).mp3"),
        ("2", "15 - Beanfield - C's Movement #1 (Carl Craig remix).flac"),
        ("3", "f#m - Edu Imbernon - Open Air.mp3"),
        ("4", "EREZ - Where's My Voice? (Remix) [Crosstown].mp3"),
        ("5", "Nobody - Ordinary.mp3"),
    ],
)
def test_punctuation_in_a_filename_survives(locations, track_id, filename):
    """Every track keeps its whole name, punctuation and extension included."""
    assert track_id in locations, "track dropped entirely"
    assert os.path.basename(locations[track_id]) == filename


@pytest.mark.integration
def test_the_extension_is_never_lost(locations):
    """The damaging part: a path with no extension matches no audio file."""
    for track_id, path in locations.items():
        assert os.path.splitext(path)[1] in {".mp3", ".flac"}, (
            f"track {track_id} lost its extension: {path}"
        )


@pytest.mark.integration
def test_a_file_on_disk_is_actually_found(tmp_path):
    """The end of the story: inKey opens this path to write tags.

    Only the ``#`` case can be backed by a real file cross-platform — Windows
    forbids ``?`` in a filename — but it is the same defect, and this proves the
    returned path resolves to the file rather than merely looking plausible.
    """
    audio = tmp_path / "Beanfield - C's Movement #1 (remix).flac"
    audio.write_bytes(b"not really audio")

    xml = tmp_path / "collection.xml"
    xml.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="1">\n'
        f'<TRACK TrackID="1" Name="Movement" Artist="Beanfield" '
        f'Location="file://localhost/{quote(str(audio).replace(os.sep, "/"))}"/>\n'
        "</COLLECTION></DJ_PLAYLISTS>\n",
        encoding="utf-8",
    )

    found = get_track_locations(str(xml))
    assert "1" in found
    assert Path(found["1"]).exists(), f"{found['1']} does not point at the file"
    assert Path(found["1"]).read_bytes() == b"not really audio"
