"""M4A/MP4 tags are written under the standard iTunes atoms, with a fallback read."""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.data.tag_writer import (
    MP4_ATOMS,
    MP4_LEGACY_ATOMS,
    STATUS_OK,
    read_mp4_fields,
    write_key_comment_year_to_file,
)
from tests.fixtures.audio_files import audio_copy

KEY_ATOM = "----:com.apple.iTunes:initialkey"
LABEL_ATOM = "----:com.apple.iTunes:LABEL"


def _tags(path: Path):
    from mutagen.mp4 import MP4

    return MP4(str(path)).tags


def _write(path: Path, **values):
    fields = dict(key=None, comment=None, year=None, label=None, bpm=None, genre=None)
    fields.update(values)
    return write_key_comment_year_to_file(str(path), **fields)


def _plant_old_atoms(path: Path) -> None:
    """A file as versions before 1.0.0 left it."""
    from mutagen.mp4 import MP4

    audio = MP4(str(path))
    if audio.tags is None:
        audio.add_tags()
    assert audio.tags is not None
    audio.tags["KEY\x00"] = ["5A"]
    audio.tags["COMM"] = ["old comment"]
    audio.tags["DATE"] = ["2019"]
    audio.tags["LABE"] = ["Old Label"]
    audio.tags["BPM\x00"] = ["120"]
    audio.tags["GENR"] = ["Techno"]
    audio.save()


@pytest.mark.unit
class TestStandardAtoms:
    def test_mutagen_sees_the_standard_atoms(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")

        status = _write(
            path,
            key="8A",
            comment="peak time",
            year="2021",
            label="Label X",
            bpm="126",
            genre="House",
        )

        assert status == (STATUS_OK, None)
        tags = _tags(path)
        assert tags["\xa9cmt"] == ["peak time"]
        assert tags["\xa9gen"] == ["House"]
        assert tags["\xa9day"] == ["2021"]
        assert tags["tmpo"] == [126]
        assert [bytes(v) for v in tags[KEY_ATOM]] == [b"8A"]
        assert [bytes(v) for v in tags[LABEL_ATOM]] == [b"Label X"]

    def test_no_made_up_atom_is_written(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _write(
            path, key="8A", comment="c", year="2021", label="L", bpm="126", genre="G"
        )
        tags = _tags(path)
        assert not [name for name in MP4_LEGACY_ATOMS.values() if name in tags]

    @pytest.mark.parametrize(
        "bpm, stored", [("126", 126), ("125.6", 126), (" 98 ", 98)]
    )
    def test_bpm_is_an_integer_tempo(self, tmp_path, bpm, stored):
        path = audio_copy(tmp_path, "m4a")
        _write(path, bpm=bpm)
        assert _tags(path)["tmpo"] == [stored]

    def test_an_unreadable_bpm_is_left_out_not_written_wrongly(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        assert _write(path, bpm="fast", genre="House") == (STATUS_OK, None)
        tags = _tags(path)
        assert "tmpo" not in tags and tags["\xa9gen"] == ["House"]

    def test_a_rewrite_replaces_rather_than_adds(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _write(path, key="8A", comment="one")
        _write(path, key="9B", comment="two")
        tags = _tags(path)
        assert tags["\xa9cmt"] == ["two"]
        assert [bytes(v) for v in tags[KEY_ATOM]] == [b"9B"]

    def test_non_ascii_text_survives(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _write(path, comment="café – Été", label="Maison Électrique")
        tags = _tags(path)
        assert tags["\xa9cmt"] == ["café – Été"]
        assert bytes(tags[LABEL_ATOM][0]).decode("utf-8") == "Maison Électrique"


@pytest.mark.unit
class TestFilesFromEarlierVersions:
    def test_an_old_atom_file_is_still_read(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _plant_old_atoms(path)

        assert read_mp4_fields(_tags(path)) == {
            "key": "5A",
            "comment": "old comment",
            "year": "2019",
            "label": "Old Label",
            "bpm": "120",
            "genre": "Techno",
        }

    def test_the_standard_atom_wins_over_the_old_one(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _plant_old_atoms(path)
        _write(path, comment="new comment")

        tags = _tags(path)
        tags["COMM"] = ["stale"]  # in memory only: a stale made-up atom beside it
        assert read_mp4_fields(tags)["comment"] == "new comment"

    def test_a_rewrite_removes_every_old_atom(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        _plant_old_atoms(path)

        assert _write(
            path,
            key="8A",
            comment="c",
            year="2021",
            label="L",
            bpm="126",
            genre="G",
        ) == (STATUS_OK, None)

        tags = _tags(path)
        assert not [name for name in MP4_LEGACY_ATOMS.values() if name in tags]
        assert tags["\xa9cmt"] == ["c"]

    def test_a_value_the_write_does_not_replace_is_carried_to_the_standard_atom(
        self, tmp_path
    ):
        path = audio_copy(tmp_path, "m4a")
        _plant_old_atoms(path)

        _write(path, key="8A")  # only the key is rewritten

        tags = _tags(path)
        assert not [name for name in MP4_LEGACY_ATOMS.values() if name in tags]
        fields = read_mp4_fields(tags, legacy_fallback=False)
        assert fields == {
            "key": "8A",
            "comment": "old comment",
            "year": "2019",
            "label": "Old Label",
            "bpm": "120",
            "genre": "Techno",
        }

    def test_every_field_has_both_atoms(self):
        assert MP4_ATOMS.keys() == MP4_LEGACY_ATOMS.keys()
