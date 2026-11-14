#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The fields CLEAN-10 writes: read, predicted, restored, and pictures (DEC-070, DEC-076).

Over real files — the recorded tones copied, and an Ogg Vorbis stream built —
because every claim here is about what mutagen leaves in a file:

- **What the writer writes is what is predicted**, for every field in every
  format: ``tag_writer`` and this module are held to each other.
- **A restore puts back exactly what was read**, including a field that was
  absent, every comment a player wrote, and a year a v2.3 file held.
- **A picture is embedded only into a file with none**, whatever kind of picture
  the file holds, and removing one removes that picture and nothing else.
"""

from __future__ import annotations

import base64

import pytest
from mutagen.aiff import AIFF
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, COMM, ID3, TCON, TKEY, TYER
from mutagen.oggvorbis import OggVorbis

from cuepoint.data.tag_fields import (
    FORMAT_FLAC,
    FORMAT_ID3,
    FORMAT_MP4,
    FORMAT_VORBIS,
    TAG_FIELDS,
    PictureAlreadyPresent,
    TagFieldsError,
    UnsupportedTagFormat,
    display_value,
    embed_front_cover,
    picture_hash,
    predicted_value,
    read_tag_fields,
    remove_picture,
    require_field,
    restore_tag_fields,
    tag_format_of,
)
from cuepoint.data.tag_writer import STATUS_OK, write_key_comment_year_to_file
from tests.fixtures.audio_files import SUPPORTED, audio_copy, jpeg_bytes, tag_dump

TEXTS = {
    "key": "F#m",
    "year": "2019",
    "label": "Ünïcode Label",
    "bpm": "124.5",
    "genre": "Tech House",
    "comment": "ok",
}


def write_all(path) -> None:
    status, error = write_key_comment_year_to_file(
        str(path),
        TEXTS["key"],
        TEXTS["comment"],
        TEXTS["year"],
        TEXTS["label"],
        TEXTS["bpm"],
        TEXTS["genre"],
    )
    assert (status, error) == (STATUS_OK, None)


def picture_block(data: bytes, kind: int = 3) -> Picture:
    picture = Picture()
    picture.type = kind
    picture.mime = "image/jpeg"
    picture.data = data
    return picture


def add_picture(path, data: bytes, kind: int = 3) -> None:
    """Give a file a picture with mutagen directly, as another tagger would."""
    suffix = path.suffix.lower()
    frame = APIC(encoding=3, mime="image/jpeg", type=kind, desc=f"p{kind}", data=data)
    if suffix == ".mp3":
        try:
            tags = ID3(str(path))
        except Exception:
            tags = ID3()
        tags.add(frame)
        tags.save(str(path))
    elif suffix == ".aiff":
        audio = AIFF(str(path))
        if audio.tags is None:
            audio.add_tags()
        audio.tags.add(frame)
        audio.save()
    elif suffix == ".flac":
        audio = FLAC(str(path))
        audio.add_picture(picture_block(data, kind))
        audio.save()
    elif suffix == ".m4a":
        from mutagen.mp4 import MP4, MP4Cover

        mp4 = MP4(str(path))
        if mp4.tags is None:
            mp4.add_tags()
        mp4.tags["covr"] = [*(mp4.tags.get("covr") or []), MP4Cover(data)]
        mp4.save()
    else:
        audio = OggVorbis(str(path))
        existing = list(audio.tags.get("METADATA_BLOCK_PICTURE") or [])
        existing.append(base64.b64encode(picture_block(data, kind).write()).decode())
        audio.tags["METADATA_BLOCK_PICTURE"] = existing
        audio.save()


# ------------------------------------------------------------------ formats


@pytest.mark.unit
class TestFormats:
    @pytest.mark.parametrize(
        "name, expected",
        [
            ("a.mp3", FORMAT_ID3),
            ("a.MP3", FORMAT_ID3),
            ("a.aiff", FORMAT_ID3),
            ("a.aif", FORMAT_ID3),
            ("a.flac", FORMAT_FLAC),
            ("a.ogg", FORMAT_VORBIS),
            ("a.wav", None),
            ("a.m4a", FORMAT_MP4),
            ("a.MP4", FORMAT_MP4),
            ("a.m4b", FORMAT_MP4),
            ("a.m4p", None),
            ("a.m4v", None),
            ("a.opus", None),
            ("noextension", None),
        ],
    )
    def test_the_formats_written(self, name, expected):
        assert tag_format_of(name) == expected

    @pytest.mark.parametrize("kind", ["wav"])
    def test_every_operation_refuses_another_format(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        before = path.read_bytes()
        for operation in (
            lambda: read_tag_fields(path),
            lambda: restore_tag_fields(path, {"key": None}),
            lambda: embed_front_cover(path, jpeg_bytes(), 40, 20),
            lambda: remove_picture(path, "a" * 64),
        ):
            with pytest.raises(UnsupportedTagFormat):
                operation()
        assert path.read_bytes() == before

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_a_file_that_is_not_there_cannot_be_read(self, tmp_path, kind):
        with pytest.raises(TagFieldsError):
            read_tag_fields(tmp_path / f"absent.{kind}")

    @pytest.mark.parametrize("kind", ["flac", "ogg", "aiff"])
    def test_a_file_that_is_not_its_format_cannot_be_read(self, tmp_path, kind):
        path = tmp_path / f"noise.{kind}"
        path.write_bytes(b"this is not audio at all" * 10)
        with pytest.raises(TagFieldsError):
            read_tag_fields(path)

    def test_an_unknown_field_is_refused(self):
        with pytest.raises(ValueError, match="rating"):
            require_field("rating")
        with pytest.raises(ValueError):
            predicted_value(FORMAT_ID3, "rating", "5")
        with pytest.raises(ValueError, match="Unknown tag format"):
            predicted_value("mp5", "key", "Am")

    def test_a_blank_value_is_never_predicted(self):
        with pytest.raises(ValueError, match="blank"):
            predicted_value(FORMAT_ID3, "key", "  ")


# ------------------------------------------------------------------ reading


@pytest.mark.unit
class TestReading:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_an_untagged_file_holds_nothing(self, tmp_path, kind):
        snapshot = read_tag_fields(audio_copy(tmp_path, kind))

        assert set(snapshot.fields) == set(TAG_FIELDS)
        assert all(snapshot.value(name) is None for name in TAG_FIELDS)
        assert snapshot.pictures == ()

    def test_id3_frames_are_read_as_the_writer_touches_them(self, tmp_path):
        path = audio_copy(tmp_path, "mp3")
        tags = ID3()
        tags.add(TKEY(encoding=0, text=["Am"]))
        tags.add(TYER(encoding=0, text=["2001"]))
        tags.add(TCON(encoding=1, text=["House"]))
        tags.add(COMM(encoding=0, lang="eng", desc="iTunNORM", text=[" 0000"]))
        tags.add(COMM(encoding=1, lang="eng", desc="", text=["typed"]))
        tags.save(str(path), v2_version=3)

        snapshot = read_tag_fields(path)

        assert snapshot.value("key") == {"TKEY": ["Am"]}
        # A v2.3 year is read as the v2.4 frame the writer sets.
        assert snapshot.value("year") == {"TDRC": ["2001"]}
        assert snapshot.value("genre") == {"TCON": ["House"]}
        assert snapshot.value("comment") == {
            "COMM": [["eng", "", ["typed"]], ["eng", "iTunNORM", [" 0000"]]]
        }
        assert snapshot.value("label") is None

    def test_flac_reads_both_key_comments_and_either_alone(self, tmp_path):
        path = audio_copy(tmp_path, "flac")
        audio = FLAC(str(path))
        audio["initialkey"] = ["8A"]
        audio.save()

        assert read_tag_fields(path).value("key") == {"INITIALKEY": ["8A"]}

    def test_vorbis_comments_are_read_whatever_their_case(self, tmp_path):
        path = audio_copy(tmp_path, "ogg")
        audio = OggVorbis(str(path))
        audio.tags["Genre"] = ["Techno", "Minimal"]
        audio.save()

        assert read_tag_fields(path).value("genre") == {"GENRE": ["Techno", "Minimal"]}


# --------------------------------------------------------------- prediction


@pytest.mark.unit
class TestTheWriterWritesWhatIsPredicted:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_every_field_reads_back_as_predicted(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        write_all(path)
        snapshot = read_tag_fields(path)

        for name in TAG_FIELDS:
            assert snapshot.value(name) == predicted_value(
                snapshot.format, name, TEXTS[name]
            ), name

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_writing_over_existing_values_still_reads_as_predicted(
        self, tmp_path, kind
    ):
        path = audio_copy(tmp_path, kind)
        write_key_comment_year_to_file(
            str(path), "C", "old", "1999", "Old", "99", "Old Genre"
        )
        write_all(path)
        snapshot = read_tag_fields(path)

        for name in TAG_FIELDS:
            assert snapshot.value(name) == predicted_value(
                snapshot.format, name, TEXTS[name]
            ), name

    def test_flac_key_is_both_comments_and_ogg_key_is_one(self):
        assert predicted_value(FORMAT_FLAC, "key", "Am") == {
            "KEY": ["Am"],
            "INITIALKEY": ["Am"],
        }
        assert predicted_value(FORMAT_VORBIS, "key", "Am") == {"KEY": ["Am"]}
        assert predicted_value(FORMAT_ID3, "comment", "ok") == {
            "COMM": [["XXX", "", ["ok"]]]
        }


# ------------------------------------------------------------------ restore


@pytest.mark.unit
class TestRestore:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_a_written_file_is_restored_to_holding_nothing(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        before = read_tag_fields(path)
        dumped = tag_dump(path)
        write_all(path)

        restore_tag_fields(path, before.fields)

        assert read_tag_fields(path) == before
        assert tag_dump(path) in (dumped, {})

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_values_a_file_held_come_back_exactly(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        write_key_comment_year_to_file(
            str(path), "C", "mine", "1999", "Old", "99", "Old Genre"
        )
        if kind == "mp3":
            tags = ID3(str(path))
            tags.add(COMM(encoding=1, lang="eng", desc="iTunNORM", text=["x"]))
            tags.save(str(path))
        before = read_tag_fields(path)
        dumped = tag_dump(path)
        write_all(path)
        assert read_tag_fields(path) != before

        restore_tag_fields(path, before.fields)

        assert read_tag_fields(path) == before
        assert tag_dump(path) == dumped

    def test_fields_not_named_are_not_touched(self, tmp_path):
        path = audio_copy(tmp_path, "flac")
        write_all(path)
        written = read_tag_fields(path)

        restore_tag_fields(path, {"genre": None, "key": {"KEY": ["C"]}})

        after = read_tag_fields(path)
        assert after.value("genre") is None
        # One slot given, so the other slot of the field is removed.
        assert after.value("key") == {"KEY": ["C"]}
        for name in ("year", "label", "bpm", "comment"):
            assert after.value(name) == written.value(name)

    def test_restoring_a_year_removes_a_v23_year_beside_it(self, tmp_path):
        path = audio_copy(tmp_path, "mp3")
        write_key_comment_year_to_file(str(path), None, None, "2019", None, None, None)

        restore_tag_fields(path, {"year": {"TDRC": ["2001-05-02"]}})

        tags = ID3(str(path))
        assert [str(t) for t in tags["TDRC"].text] == ["2001-05-02"]
        assert not tags.getall("TYER")

    def test_nothing_named_writes_nothing(self, tmp_path):
        path = audio_copy(tmp_path, "mp3")
        before = path.read_bytes()

        restore_tag_fields(path, {})

        assert path.read_bytes() == before

    @pytest.mark.parametrize("value", ["Am", ["Am"], 3])
    def test_a_value_is_a_mapping_or_none(self, tmp_path, value):
        with pytest.raises(ValueError, match="mapping"):
            restore_tag_fields(audio_copy(tmp_path, "mp3"), {"key": value})

    def test_a_file_that_cannot_be_saved_is_an_error(self, tmp_path):
        path = audio_copy(tmp_path, "flac")
        path.write_bytes(b"fLaC" + b"\x00" * 10)
        with pytest.raises(TagFieldsError):
            restore_tag_fields(path, {"key": None})


# ----------------------------------------------------------------- pictures


@pytest.mark.unit
class TestPictures:
    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_a_front_cover_is_embedded_into_a_file_with_none(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        data = jpeg_bytes()

        digest = embed_front_cover(path, data, 40, 20)

        assert digest == picture_hash(data)
        assert read_tag_fields(path).pictures == (digest,)
        from cuepoint.data.artwork import read_embedded

        assert read_embedded(path) == data

    @pytest.mark.parametrize("kind", SUPPORTED)
    @pytest.mark.parametrize("picture_type", [3, 0, 8])
    def test_never_into_a_file_with_any_picture(self, tmp_path, kind, picture_type):
        path = audio_copy(tmp_path, kind)
        add_picture(path, jpeg_bytes("blue"), picture_type)
        before = tag_dump(path)

        with pytest.raises(PictureAlreadyPresent):
            embed_front_cover(path, jpeg_bytes(), 40, 20)

        assert tag_dump(path) == before

    def test_an_ogg_legacy_cover_is_a_picture(self, tmp_path):
        path = audio_copy(tmp_path, "ogg")
        audio = OggVorbis(str(path))
        audio.tags["COVERART"] = [base64.b64encode(jpeg_bytes("blue")).decode()]
        audio.save()

        assert len(read_tag_fields(path).pictures) == 1
        with pytest.raises(PictureAlreadyPresent):
            embed_front_cover(path, jpeg_bytes(), 40, 20)

    def test_a_malformed_ogg_picture_is_still_a_picture(self, tmp_path):
        path = audio_copy(tmp_path, "ogg")
        audio = OggVorbis(str(path))
        audio.tags["METADATA_BLOCK_PICTURE"] = ["not base64 !!"]
        audio.save()

        assert len(read_tag_fields(path).pictures) == 1
        with pytest.raises(PictureAlreadyPresent):
            embed_front_cover(path, jpeg_bytes(), 40, 20)

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_removing_a_picture_removes_that_one_only(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        ours = jpeg_bytes("red")
        embed_front_cover(path, ours, 40, 20)
        theirs = jpeg_bytes("green")
        add_picture(path, theirs, 0)

        assert remove_picture(path, picture_hash(ours)) is True

        assert read_tag_fields(path).pictures == (picture_hash(theirs),)

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_removing_a_picture_the_file_does_not_hold_changes_nothing(
        self, tmp_path, kind
    ):
        path = audio_copy(tmp_path, kind)
        add_picture(path, jpeg_bytes("green"), 3)
        before = path.read_bytes()

        assert remove_picture(path, picture_hash(jpeg_bytes("red"))) is False
        assert path.read_bytes() == before

    def test_the_legacy_ogg_cover_can_be_removed_by_its_hash(self, tmp_path):
        path = audio_copy(tmp_path, "ogg")
        data = jpeg_bytes("blue")
        audio = OggVorbis(str(path))
        audio.tags["COVERART"] = [base64.b64encode(data).decode()]
        audio.save()

        assert remove_picture(path, picture_hash(data)) is True
        assert read_tag_fields(path).pictures == ()

    def test_an_empty_picture_is_refused(self, tmp_path):
        with pytest.raises(ValueError, match="empty"):
            embed_front_cover(audio_copy(tmp_path, "mp3"), b"", 1, 1)

    @pytest.mark.parametrize("kind", SUPPORTED)
    def test_embedding_keeps_the_tags_and_removing_it_restores_them(
        self, tmp_path, kind
    ):
        path = audio_copy(tmp_path, kind)
        write_all(path)
        before = tag_dump(path)
        data = jpeg_bytes()

        embed_front_cover(path, data, 40, 20)
        remove_picture(path, picture_hash(data))

        assert tag_dump(path) == before


# ------------------------------------------------------------------ display


@pytest.mark.unit
class TestDisplay:
    def test_none_reads_as_none(self):
        assert display_value(None) is None
        assert display_value({}) is None

    def test_a_players_own_comments_are_not_shown(self):
        value = {"COMM": [["eng", "", ["typed"]], ["eng", "iTunNORM", ["x"]]]}
        assert display_value(value) == "typed"
        assert display_value({"COMM": [["eng", "iTunNORM", ["x"]]]}) is None

    def test_a_key_held_twice_reads_once(self):
        assert display_value({"KEY": ["Am"], "INITIALKEY": ["Am"]}) == "Am"
        assert display_value({"KEY": ["Am"], "INITIALKEY": ["8A"]}) == "Am; 8A"


# ---------------------------------------------------------------------- MP4

KEY_ATOM = "----:com.apple.iTunes:initialkey"
LABEL_ATOM = "----:com.apple.iTunes:LABEL"
LEGACY_ATOMS = ("KEY\x00", "COMM", "DATE", "LABE", "BPM\x00", "GENR")
TOUCHED_ATOMS = (
    KEY_ATOM,
    "\xa9cmt",
    "\xa9day",
    LABEL_ATOM,
    "tmpo",
    "\xa9gen",
    *LEGACY_ATOMS,
    "covr",
)


def atoms_touched(path) -> dict:
    """Every atom a write or restore can touch, as mutagen holds it (bytes and types)."""
    from mutagen.mp4 import MP4

    tags = MP4(str(path)).tags
    held = {}
    for atom in TOUCHED_ATOMS:
        values = (tags.get(atom) if tags is not None else None) or []
        if values:
            held[atom] = [
                (type(v).__name__, bytes(v), getattr(v, "dataformat", None))
                if isinstance(v, bytes)
                else (type(v).__name__, v)
                for v in values
            ]
    return held


def plant_legacy_atoms(path) -> None:
    from mutagen.mp4 import MP4

    audio = MP4(str(path))
    if audio.tags is None:
        audio.add_tags()
    audio.tags["KEY\x00"] = ["5A"]
    audio.tags["COMM"] = ["old comment"]
    audio.tags["DATE"] = ["2019"]
    audio.tags["LABE"] = ["Old Label"]
    audio.tags["BPM\x00"] = ["120"]
    audio.tags["GENR"] = ["Techno"]
    audio.save()


def strip_all_tags(path) -> None:
    from mutagen.mp4 import MP4

    MP4(str(path)).delete()


@pytest.mark.unit
class TestMp4:
    def test_the_slots_are_the_standard_atom_and_the_legacy_one(self):
        assert predicted_value(FORMAT_MP4, "key", "Am") == {KEY_ATOM: ["Am"]}
        assert predicted_value(FORMAT_MP4, "bpm", "124.5") == {"tmpo": [125]}
        assert predicted_value(FORMAT_MP4, "comment", "ok") == {"\xa9cmt": ["ok"]}
        assert predicted_value(FORMAT_MP4, "bpm", "0.2") == {"tmpo": ["0.2"]}

    @pytest.mark.parametrize("suffix", [".m4a", ".mp4", ".m4b"])
    def test_the_whole_family_reads_and_restores(self, tmp_path, suffix):
        import shutil

        path = tmp_path / f"tone{suffix}"
        shutil.copy(audio_copy(tmp_path / "src", "m4a"), path)
        before = read_tag_fields(path)
        write_all(path)
        assert read_tag_fields(path) != before

        restore_tag_fields(path, before.fields)

        assert read_tag_fields(path) == before

    def test_a_value_is_json(self, tmp_path):
        import json

        path = audio_copy(tmp_path, "m4a")
        plant_legacy_atoms(path)
        write_key_comment_year_to_file(str(path), "Am", None, None, "Lbl", "126", None)

        snapshot = read_tag_fields(path)

        assert json.loads(json.dumps(snapshot.fields)) == snapshot.fields
        assert snapshot.value("bpm") == {"tmpo": [126]}
        # The writer carries an old value over to the standard atom.
        assert snapshot.value("genre") == {"\xa9gen": ["Techno"]}

    def test_a_file_with_no_tags_at_all_comes_back_to_holding_nothing(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        strip_all_tags(path)
        before = read_tag_fields(path)
        assert all(before.value(name) is None for name in TAG_FIELDS)
        write_all(path)
        assert read_tag_fields(path) != before

        restore_tag_fields(path, before.fields)

        assert read_tag_fields(path) == before
        assert atoms_touched(path) == {}

    def test_legacy_atoms_come_back_exactly_after_the_writer_removed_them(
        self, tmp_path
    ):
        path = audio_copy(tmp_path, "m4a")
        plant_legacy_atoms(path)
        held = atoms_touched(path)
        assert set(LEGACY_ATOMS) <= set(held)
        before = read_tag_fields(path)
        assert before.value("key") == {"KEY\x00": ["5A"]}

        write_all(path)
        written = atoms_touched(path)
        assert not set(LEGACY_ATOMS) & set(written)
        for name in TAG_FIELDS:
            assert read_tag_fields(path).value(name) == predicted_value(
                FORMAT_MP4, name, TEXTS[name]
            )
        restore_tag_fields(path, before.fields)

        assert atoms_touched(path) == held
        assert read_tag_fields(path) == before

    def test_standard_and_legacy_atoms_held_together_come_back_exactly(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        write_key_comment_year_to_file(
            str(path), "C", "mine", "1999", "Old", "99", "Old Genre"
        )
        plant_legacy_atoms(path)
        held = atoms_touched(path)
        before = read_tag_fields(path)
        assert set(before.value("genre")) == {"\xa9gen", "GENR"}
        write_all(path)

        restore_tag_fields(path, before.fields)

        assert atoms_touched(path) == held

    def test_a_freeform_atoms_bytes_and_data_type_come_back_exactly(self, tmp_path):
        from mutagen.mp4 import MP4, AtomDataType, MP4FreeForm

        path = audio_copy(tmp_path, "m4a")
        audio = MP4(str(path))
        audio.tags[KEY_ATOM] = [
            MP4FreeForm(b"8A", dataformat=AtomDataType.IMPLICIT),
            MP4FreeForm("Ünï".encode("utf-8"), dataformat=AtomDataType.UTF8),
        ]
        audio.tags[LABEL_ATOM] = [
            MP4FreeForm(b"\xff\xfe raw", dataformat=AtomDataType.UTF8)
        ]
        audio.save()
        held = atoms_touched(path)
        before = read_tag_fields(path)
        assert before.value("key")[KEY_ATOM][1] == "Ünï"
        write_all(path)

        restore_tag_fields(path, before.fields)

        assert atoms_touched(path) == held
        assert read_tag_fields(path) == before

    def test_two_values_are_equal_exactly_when_a_restore_has_nothing_to_do(
        self, tmp_path
    ):
        path = audio_copy(tmp_path, "m4a")
        write_all(path)
        held = atoms_touched(path)
        read = read_tag_fields(path)

        restore_tag_fields(path, read.fields)

        assert read_tag_fields(path) == read
        assert atoms_touched(path) == held

    def test_a_restore_of_one_field_leaves_the_others_and_the_audio(self, tmp_path):
        from tests.fixtures.audio_files import tag_dump

        path = audio_copy(tmp_path, "m4a")
        write_all(path)
        dumped = tag_dump(path)

        restore_tag_fields(path, {"key": None})

        after = tag_dump(path)
        assert KEY_ATOM not in after
        assert {k: v for k, v in dumped.items() if k != KEY_ATOM} == after

    def test_a_front_cover_is_embedded_as_a_jpeg_only_into_a_file_without_covr(
        self, tmp_path
    ):
        from mutagen.mp4 import MP4, MP4Cover

        path = audio_copy(tmp_path, "m4a")
        jpeg = jpeg_bytes()
        before = read_tag_fields(path)

        digest = embed_front_cover(path, jpeg, 40, 20)

        assert digest == picture_hash(jpeg)
        covers = MP4(str(path)).tags["covr"]
        assert [bytes(c) for c in covers] == [jpeg]
        assert covers[0].imageformat == MP4Cover.FORMAT_JPEG
        assert read_tag_fields(path).pictures == (digest,)
        assert read_tag_fields(path).fields == before.fields

    def test_a_file_with_a_cover_is_never_embedded_into(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        theirs = jpeg_bytes("green")
        add_picture(path, theirs)
        held = atoms_touched(path)

        with pytest.raises(PictureAlreadyPresent):
            embed_front_cover(path, jpeg_bytes("red"), 40, 20)

        assert atoms_touched(path) == held
        assert read_tag_fields(path).pictures == (picture_hash(theirs),)

    def test_a_picture_is_removed_by_its_hash_and_nothing_else(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        write_all(path)
        first, second = jpeg_bytes("red"), jpeg_bytes("blue")
        add_picture(path, first)
        add_picture(path, second)
        assert read_tag_fields(path).pictures == (
            picture_hash(first),
            picture_hash(second),
        )

        assert remove_picture(path, picture_hash(first)) is True
        assert read_tag_fields(path).pictures == (picture_hash(second),)
        assert remove_picture(path, picture_hash(first)) is False
        assert remove_picture(path, picture_hash(second)) is True

        assert read_tag_fields(path).pictures == ()
        assert "covr" not in atoms_touched(path)
        for name in TAG_FIELDS:
            assert read_tag_fields(path).value(name) == predicted_value(
                FORMAT_MP4, name, TEXTS[name]
            )

    def test_the_audio_is_not_changed(self, tmp_path):
        from cuepoint.data.tag_save import audio_fingerprint

        path = audio_copy(tmp_path, "m4a")
        before = audio_fingerprint(path)
        write_all(path)
        embed_front_cover(path, jpeg_bytes(), 40, 20)
        assert audio_fingerprint(path) == before


def patch_atom_flags(path, atom: bytes, flags: int) -> None:
    """Give an atom's ``data`` child another data type, as a foreign tagger might."""
    raw = bytearray(path.read_bytes())
    at = raw.index(atom)
    data = raw.index(b"data", at)
    raw[data + 4 : data + 8] = flags.to_bytes(4, "big")
    path.write_bytes(bytes(raw))


def without_ilst(path) -> None:
    """A file with no tag list at all: the ``ilst`` atom renamed to a skipped one."""
    raw = path.read_bytes()
    assert raw.count(b"ilst") == 1
    path.write_bytes(raw.replace(b"ilst", b"skip"))


@pytest.mark.unit
class TestMp4Details:
    @pytest.mark.parametrize("held", ["2019-05-04", "2019-05-04T07:00:00Z", "2019"])
    def test_a_held_date_in_the_same_year_is_what_the_write_leaves(self, held):
        before = {"\xa9day": [held]}
        assert predicted_value(FORMAT_MP4, "year", "2019", before) == before

    def test_a_held_legacy_year_is_removed_but_the_held_date_stays(self):
        before = {"\xa9day": ["2019-05-04"], "DATE": ["2001"]}
        assert predicted_value(FORMAT_MP4, "year", "2019", before) == {
            "\xa9day": ["2019-05-04"]
        }

    @pytest.mark.parametrize("held", ["2018-05-04", "x"])
    def test_another_year_is_written(self, held):
        before = {"\xa9day": [held]}
        assert predicted_value(FORMAT_MP4, "year", "2019", before) == {
            "\xa9day": ["2019"]
        }
        assert predicted_value(FORMAT_MP4, "year", "2019") == {"\xa9day": ["2019"]}

    def test_a_field_with_an_atom_the_file_cannot_parse_is_unreadable(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        from mutagen.mp4 import MP4

        audio = MP4(str(path))
        audio.tags["tmpo"] = [120]
        audio.save()
        patch_atom_flags(path, b"tmpo", 1)  # UTF-8 text where an integer belongs
        before = path.read_bytes()

        with pytest.raises(TagFieldsError, match="tmpo"):
            read_tag_fields(path)
        with pytest.raises(TagFieldsError):
            restore_tag_fields(path, {"bpm": None})
        assert path.read_bytes() == before

    def test_a_comment_in_utf16_is_unreadable(self, tmp_path):
        from mutagen.mp4 import MP4

        path = audio_copy(tmp_path, "m4a")
        audio = MP4(str(path))
        audio.tags["\xa9cmt"] = ["x"]
        audio.save()
        patch_atom_flags(path, b"\xa9cmt", 2)

        with pytest.raises(TagFieldsError):
            read_tag_fields(path)

    def test_an_unparsable_atom_of_another_name_is_no_matter(self, tmp_path):
        from mutagen.mp4 import MP4

        path = audio_copy(tmp_path, "m4a")
        audio = MP4(str(path))
        audio.tags["trkn"] = [(1, 2)]
        audio.save()
        patch_atom_flags(path, b"trkn", 1)

        assert read_tag_fields(path).value("key") is None

    def test_a_non_text_freeform_value_is_shown_as_binary(self):
        value = {KEY_ATOM: [{"dataformat": 0, "data": "/w=="}]}
        assert display_value(value) == "(binary)"
        assert display_value({KEY_ATOM: ["8A", {"dataformat": 0, "data": "/w=="}]}) == (
            "8A; (binary)"
        )

    def test_an_implicit_text_freeform_value_is_shown_as_its_text(self, tmp_path):
        from mutagen.mp4 import MP4, AtomDataType, MP4FreeForm

        path = audio_copy(tmp_path, "m4a")
        audio = MP4(str(path))
        audio.tags[KEY_ATOM] = [MP4FreeForm(b"8A", dataformat=AtomDataType.IMPLICIT)]
        audio.save()

        value = read_tag_fields(path).value("key")
        assert display_value(value) == "8A"
        # The record still holds the exact bytes and the data type, for an undo.
        assert value == {KEY_ATOM: [{"dataformat": 0, "data": "OEE="}]}

    def test_a_non_utf8_freeform_value_stays_binary(self):
        value = {KEY_ATOM: [{"dataformat": 0, "data": "/w=="}]}
        assert display_value(value) == "(binary)"

    def test_a_file_with_no_ilst_reads_as_nothing_and_comes_back(self, tmp_path):
        path = audio_copy(tmp_path, "m4a")
        without_ilst(path)
        from mutagen.mp4 import MP4

        assert MP4(str(path)).tags is None
        before = read_tag_fields(path)
        assert all(before.value(name) is None for name in TAG_FIELDS)
        write_all(path)
        assert read_tag_fields(path).value("key") == {KEY_ATOM: ["F#m"]}

        restore_tag_fields(path, before.fields)

        assert read_tag_fields(path) == before
        assert atoms_touched(path) == {}
