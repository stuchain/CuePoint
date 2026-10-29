"""HARDEN-04 / DEC-183: tag writes go through a checked copy, then replace the file."""

from __future__ import annotations

import os
from collections import namedtuple
import sys
from pathlib import Path
from typing import Callable

import pytest

from cuepoint.data import tag_fields, tag_save, tag_writer
from cuepoint.data.tag_save import (
    MESSAGE_AUDIO_DIFFERS,
    MESSAGE_IN_USE,
    MESSAGE_NO_SPACE,
    audio_fingerprint,
)
from cuepoint.data.tag_writer import (
    STATUS_OK,
    STATUS_WRITE_ERROR,
    write_key_comment_year_to_file,
)
from cuepoint.utils.atomic_write import TEMP_MARKER
from tests.fixtures.audio_files import audio_copy, tag_dump

KINDS = ["mp3", "flac", "aiff", "wav", "m4a", "ogg"]
VALUES = dict(
    key="8A",
    comment="peak time",
    year="2021",
    label="Label X",
    bpm="126",
    genre="House",
)


Usage = namedtuple("Usage", "total used free")


def write(path: Path, **overrides):
    values = {**VALUES, **overrides}
    return write_key_comment_year_to_file(
        str(path),
        values["key"],
        values["comment"],
        values["year"],
        values["label"],
        values["bpm"],
        values["genre"],
    )


def damage_audio(path: Path) -> None:
    """Flip four bytes inside the audio payload of a fixture."""
    data = bytearray(path.read_bytes())
    if path.suffix == ".ogg" or data[:4] == b"OggS":
        middle = bytes(data).rindex(b"\x00" * 10)  # the one audio packet
    elif data[:4] == b"fLaC":
        middle = len(data) - 12  # the metadata block padding fills the middle
    else:
        middle = len(data) // 2
    for offset in range(middle, middle + 4):
        data[offset] ^= 0xFF
    path.write_bytes(bytes(data))


def temps(folder: Path) -> list[str]:
    return sorted(p.name for p in folder.iterdir() if TEMP_MARKER in p.name)


def read_back(path: Path) -> dict:
    """The six written fields, read with mutagen directly."""
    from mutagen import File

    audio = File(str(path))
    tags = audio.tags
    suffix = path.suffix.lower()
    if suffix in (".mp3", ".aiff", ".wav"):
        return {
            "key": str(tags["TKEY"].text[0]),
            "comment": str(tags.getall("COMM")[0].text[0]),
            "year": str(tags["TDRC"].text[0]),
            "label": str(tags["TPUB"].text[0]),
            "bpm": str(tags["TBPM"].text[0]),
            "genre": str(tags["TCON"].text[0]),
        }
    if suffix == ".m4a":
        return {
            "key": bytes(tags["----:com.apple.iTunes:initialkey"][0]).decode(),
            "comment": tags["\xa9cmt"][0],
            "year": tags["\xa9day"][0],
            "label": bytes(tags["----:com.apple.iTunes:LABEL"][0]).decode(),
            "bpm": str(tags["tmpo"][0]),
            "genre": tags["\xa9gen"][0],
        }
    return {
        "key": tags["KEY"][0],
        "comment": tags["COMMENT"][0],
        "year": tags["DATE"][0],
        "label": tags["LABEL"][0],
        "bpm": tags["BPM"][0],
        "genre": tags["GENRE"][0],
    }


EXPECTED = {
    "key": "8A",
    "comment": "peak time",
    "year": "2021",
    "label": "Label X",
    "bpm": "126",
    "genre": "House",
}


@pytest.mark.unit
@pytest.mark.parametrize("kind", KINDS)
class TestRoundTrip:
    def test_the_tags_are_written_and_the_audio_is_untouched(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        audio_before = audio_fingerprint(path)
        assert audio_before is not None

        assert write(path) == (STATUS_OK, None)

        assert read_back(path) == EXPECTED
        assert audio_fingerprint(path) == audio_before
        assert temps(tmp_path) == []

    def test_a_second_write_changes_the_tags_again(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        write(path)
        assert write(path, key="9B", comment="warm up") == (STATUS_OK, None)
        again = read_back(path)
        assert again["key"] == "9B" and again["comment"] == "warm up"

    def test_the_times_and_mode_are_kept(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        os.utime(path, (1_500_000_000, 1_600_000_000))
        if sys.platform != "win32":
            path.chmod(0o640)
        before = path.stat()

        assert write(path)[0] == STATUS_OK

        after = path.stat()
        assert after.st_mtime_ns == before.st_mtime_ns
        assert after.st_atime_ns == before.st_atime_ns
        if sys.platform != "win32":
            assert after.st_mode & 0o777 == 0o640
        assert path.stat().st_size != 0

    def test_a_write_that_raises_halfway_leaves_the_original_identical(
        self, tmp_path, kind, monkeypatch
    ):
        path = audio_copy(tmp_path, kind)
        original = path.read_bytes()

        # The writers' own save() is replaced by one that damages the copy and
        # then fails, wherever in the writer it is reached.
        def damaging(work: Path, *args):
            with open(work, "r+b") as handle:
                handle.truncate(max(1, work.stat().st_size // 2))
            raise OSError("disk went away")

        monkeypatch.setattr(tag_writer, "_dispatch", damaging)
        status, message = write(path)

        assert status == STATUS_WRITE_ERROR
        assert "disk went away" in message
        assert path.read_bytes() == original
        assert temps(tmp_path) == []

    def test_a_copy_whose_audio_differs_is_discarded(self, tmp_path, kind, monkeypatch):
        path = audio_copy(tmp_path, kind)
        original = path.read_bytes()
        real_dispatch = tag_writer._dispatch

        def writes_then_damages_audio(work: Path, *args):
            outcome = real_dispatch(work, *args)
            damage_audio(work)
            return outcome

        monkeypatch.setattr(tag_writer, "_dispatch", writes_then_damages_audio)
        status, message = write(path)

        assert status == STATUS_WRITE_ERROR
        assert message in (MESSAGE_AUDIO_DIFFERS, tag_save.MESSAGE_TAGS_DIFFER)
        assert path.read_bytes() == original
        assert temps(tmp_path) == []

    def test_no_space_fails_before_touching_the_file(self, tmp_path, kind, monkeypatch):
        path = audio_copy(tmp_path, kind)
        original = path.read_bytes()
        stat = path.stat()

        def never_copy(*_args, **_kwargs):  # pragma: no cover - must not run
            raise AssertionError("the file was copied although there is no room")

        monkeypatch.setattr(
            tag_save.shutil,
            "disk_usage",
            lambda _folder: Usage(100, 100, 0),
        )
        monkeypatch.setattr(tag_save.shutil, "copyfileobj", never_copy)

        assert write(path) == (STATUS_WRITE_ERROR, MESSAGE_NO_SPACE)
        assert path.read_bytes() == original
        assert path.stat().st_mtime_ns == stat.st_mtime_ns
        assert temps(tmp_path) == []

    def test_a_file_in_use_keeps_the_original_and_leaves_no_copy(
        self, tmp_path, kind, monkeypatch
    ):
        path = audio_copy(tmp_path, kind)
        original = path.read_bytes()

        def locked(_source, _target):
            raise PermissionError(13, "Access is denied")

        monkeypatch.setattr(tag_save, "commit_temp", locked)

        assert write(path) == (STATUS_WRITE_ERROR, MESSAGE_IN_USE)
        assert path.read_bytes() == original
        assert temps(tmp_path) == []

    def test_the_replace_is_refused_by_os_replace_itself(
        self, tmp_path, kind, monkeypatch
    ):
        from cuepoint.utils import atomic_write

        path = audio_copy(tmp_path, kind)
        original = path.read_bytes()

        def locked(_source, _target):
            raise PermissionError(13, "Access is denied")

        monkeypatch.setattr(atomic_write.os, "replace", locked)

        assert write(path) == (STATUS_WRITE_ERROR, MESSAGE_IN_USE)
        assert path.read_bytes() == original
        assert temps(tmp_path) == []


@pytest.mark.unit
class TestFingerprint:
    @pytest.mark.parametrize("kind", [k for k in KINDS if k != "ogg"])
    def test_tags_do_not_change_it_and_audio_does(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        before = audio_fingerprint(path)
        write(path)
        assert audio_fingerprint(path) == before

        damage_audio(path)
        assert audio_fingerprint(path) != before

    def test_ogg_audio_packets_are_compared_and_the_comment_header_is_not(
        self, tmp_path
    ):
        path = audio_copy(tmp_path, "ogg")
        before = audio_fingerprint(path)
        write(path)
        assert audio_fingerprint(path) == before

        data = path.read_bytes()
        marker = b"\x00" * 10
        index = data.rindex(marker)
        changed = tmp_path / "changed.ogg"
        changed.write_bytes(data[:index] + b"\x01" + data[index + 1 :])
        assert audio_fingerprint(changed) != before

    def test_a_trailing_id3v1_tag_is_not_audio(self, tmp_path):
        path = audio_copy(tmp_path, "mp3")
        before = audio_fingerprint(path)
        with open(path, "ab") as handle:
            handle.write(b"TAG" + b"\x00" * 125)
        assert audio_fingerprint(path) == before

    def test_an_unknown_format_has_no_fingerprint(self, tmp_path):
        path = tmp_path / "x.bin"
        path.write_bytes(b"not audio at all")
        assert audio_fingerprint(path) is None


@pytest.mark.unit
class TestGuards:
    def test_a_read_only_file_is_still_refused(self, tmp_path):
        if sys.platform == "win32" or os.geteuid() == 0:
            pytest.skip("needs POSIX permissions and a non-root user")
        path = audio_copy(tmp_path, "mp3")
        path.chmod(0o444)
        status, _message = write(path)
        assert status == STATUS_WRITE_ERROR
        assert temps(tmp_path) == []

    def test_a_symlink_keeps_pointing_at_the_replaced_file(self, tmp_path):
        if sys.platform == "win32":
            pytest.skip("symlinks need privileges on Windows")
        real = audio_copy(tmp_path / "real", "mp3")
        link = tmp_path / "link.mp3"
        link.symlink_to(real)

        assert write(link)[0] == STATUS_OK

        assert link.is_symlink()
        assert read_back(real) == EXPECTED

    def test_a_missing_file_is_reported_as_before(self, tmp_path):
        status, _ = write(tmp_path / "gone.mp3")
        assert status == tag_writer.STATUS_FILE_NOT_FOUND

    def test_the_file_changing_underneath_the_write_is_refused(
        self, tmp_path, monkeypatch
    ):
        path = audio_copy(tmp_path, "flac")
        real = tag_writer._dispatch

        def changes_the_original(work: Path, *args):
            outcome = real(work, *args)
            with open(path, "ab") as handle:
                handle.write(b"x")
            return outcome

        monkeypatch.setattr(tag_writer, "_dispatch", changes_the_original)
        status, message = write(path)
        assert status == STATUS_WRITE_ERROR
        assert message == tag_save.MESSAGE_CHANGED
        assert temps(tmp_path) == []


@pytest.mark.unit
class TestWavListInfo:
    def test_list_info_is_appended_through_a_checked_copy(self, tmp_path):
        from mutagen.wave import _WaveFile

        path = audio_copy(tmp_path, "wav")
        before = audio_fingerprint(path)

        tag_writer._write_wav_list_info(path, "a comment", "8A", "2021", "Lab", "House")

        with open(path, "rb") as handle:
            assert "LIST" in _WaveFile(handle)
        assert audio_fingerprint(path) == before
        assert temps(tmp_path) == []

    def test_a_failure_leaves_the_wav_as_it_was(self, tmp_path, monkeypatch):
        path = audio_copy(tmp_path, "wav")
        original = path.read_bytes()
        monkeypatch.setattr(
            tag_save,
            "commit_temp",
            lambda *_a: (_ for _ in ()).throw(PermissionError(13, "denied")),
        )
        tag_writer._write_wav_list_info(path, "a comment", "8A", "2021", "Lab", "House")
        assert path.read_bytes() == original
        assert temps(tmp_path) == []


@pytest.mark.unit
@pytest.mark.parametrize("kind", ["mp3", "flac", "aiff", "ogg"])
class TestRestoreAndPicture:
    def test_a_restore_goes_through_a_checked_copy(self, tmp_path, kind):
        path = audio_copy(tmp_path, kind)
        before_tags = tag_dump(path)
        audio_before = audio_fingerprint(path)
        write(path)
        assert tag_dump(path) != before_tags

        tag_fields.restore_tag_fields(
            path, {field: None for field in tag_fields.TAG_FIELDS}
        )

        assert tag_dump(path) == before_tags
        assert audio_fingerprint(path) == audio_before
        assert temps(tmp_path) == []

    def test_a_failing_restore_leaves_the_file_identical(
        self, tmp_path, kind, monkeypatch
    ):
        path = audio_copy(tmp_path, kind)
        write(path)
        original = path.read_bytes()

        monkeypatch.setattr(
            tag_save,
            "commit_temp",
            lambda *_a: (_ for _ in ()).throw(PermissionError(13, "denied")),
        )
        with pytest.raises(tag_fields.TagFieldsError, match="in use"):
            tag_fields.restore_tag_fields(path, {"key": None})

        assert path.read_bytes() == original
        assert temps(tmp_path) == []

    def test_a_picture_is_embedded_and_removed_through_copies(self, tmp_path, kind):
        from tests.fixtures.audio_files import jpeg_bytes

        path = audio_copy(tmp_path, kind)
        audio_before = audio_fingerprint(path)

        digest = tag_fields.embed_front_cover(path, jpeg_bytes(), 40, 20)
        assert digest in tag_fields.read_tag_fields(path).pictures
        assert tag_fields.remove_picture(path, digest) is True
        assert digest not in tag_fields.read_tag_fields(path).pictures
        assert tag_fields.remove_picture(path, digest) is False

        assert audio_fingerprint(path) == audio_before
        assert temps(tmp_path) == []


def test_helpers_are_exported():
    fn: Callable = tag_save.save_via_copy
    assert callable(fn)


@pytest.mark.unit
class TestCopyNaming:
    def test_the_copy_keeps_the_extension_while_it_is_written(
        self, tmp_path, monkeypatch
    ):
        path = audio_copy(tmp_path, "mp3")
        seen = []
        real = tag_writer._dispatch

        def look(work: Path, *args):
            seen.append(work.name)
            return real(work, *args)

        monkeypatch.setattr(tag_writer, "_dispatch", look)
        assert write(path)[0] == STATUS_OK
        assert seen == [f".tone.cuepoint-tmp-{os.getpid()}.mp3"]

    def test_a_dead_processs_copy_of_this_file_is_removed_first(self, tmp_path):
        from cuepoint.utils.atomic_write import temp_name_for

        path = audio_copy(tmp_path, "flac")
        import subprocess

        child = subprocess.Popen([sys.executable, "-c", "pass"])
        child.wait()
        stale = tmp_path / temp_name_for(
            "tone.flac", pid=child.pid, keep_extension=True
        )
        stale.write_bytes(b"left by a killed write")

        assert write(path)[0] == STATUS_OK
        assert not stale.exists()
