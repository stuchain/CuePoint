#!/usr/bin/env python3
# -*- coding: utf-8 -*-

r"""``os_path``: the spelling a Windows file call needs for a very long path (HARDEN-06).

Windows refuses an absolute path of 260 characters or more unless it is spelled
with the ``\\?\`` prefix (or ``\\?\UNC\`` for a network share). The helper does
that on Windows for absolute paths over 259 characters and leaves every other
path exactly as it was. ``os.name`` is faked here so the Windows rules run on
any machine; the Windows leg of CI runs the real thing at the end.
"""

from __future__ import annotations

import os
import types

import pytest

from cuepoint.utils import long_path
from cuepoint.utils.long_path import LIMIT, display_path, os_path

pytestmark = pytest.mark.unit


def _fake_os(monkeypatch, name: str) -> None:
    """Make the helper see ``os.name == name`` without changing the real ``os``.

    Faking ``os.name`` itself would break pathlib (and pytest's own reporting)
    for the length of the test, so the helper's module gets a stand-in.
    """
    monkeypatch.setattr(
        long_path, "os", types.SimpleNamespace(name=name, fspath=os.fspath)
    )


@pytest.fixture
def windows(monkeypatch):
    _fake_os(monkeypatch, "nt")


@pytest.fixture
def posix(monkeypatch):
    _fake_os(monkeypatch, "posix")


def _drive_path(length: int) -> str:
    stem = "C:\\Music\\"
    return stem + "a" * (length - len(stem) - 4) + ".mp3"


def test_the_limit_is_259():
    assert LIMIT == 259


def test_a_300_character_drive_path_is_prefixed_on_windows(windows):
    path = _drive_path(300)
    assert len(path) == 300
    assert os_path(path) == "\\\\?\\" + path


def test_a_300_character_path_is_left_alone_elsewhere(posix):
    path = "/" + "d/" * 150 + "a.mp3"
    assert os_path(path) == path
    drive = _drive_path(300)
    assert os_path(drive) == drive


def test_259_is_left_alone_and_260_is_prefixed_on_windows(windows):
    assert os_path(_drive_path(259)) == _drive_path(259)
    assert os_path(_drive_path(260)) == "\\\\?\\" + _drive_path(260)


def test_forward_slashes_become_backslashes_when_prefixed(windows):
    path = "C:/Music/" + "a" * 300 + ".mp3"
    assert os_path(path) == "\\\\?\\C:\\Music\\" + "a" * 300 + ".mp3"


def test_a_unc_path_gets_the_unc_prefix(windows):
    path = "\\\\server\\share\\" + "a" * 300 + ".mp3"
    assert os_path(path) == "\\\\?\\UNC\\server\\share\\" + "a" * 300 + ".mp3"


def test_a_forward_slash_unc_path_gets_the_unc_prefix(windows):
    path = "//server/share/" + "a" * 300 + ".mp3"
    assert os_path(path) == "\\\\?\\UNC\\server\\share\\" + "a" * 300 + ".mp3"


def test_a_prefixed_path_is_not_prefixed_again(windows):
    path = "\\\\?\\C:\\Music\\" + "a" * 300 + ".mp3"
    assert os_path(path) == path
    unc = "\\\\?\\UNC\\server\\share\\" + "a" * 300
    assert os_path(unc) == unc


def test_room_is_kept_for_a_sibling_the_caller_will_make(windows):
    path = _drive_path(250)
    assert os_path(path) == path
    assert os_path(path, reserve=64) == "\\\\?\\" + path
    assert os_path(_drive_path(100), reserve=64) == _drive_path(100)


def test_a_short_path_is_left_alone_on_windows(windows):
    assert os_path("C:\\Music\\a.mp3") == "C:\\Music\\a.mp3"


def test_a_relative_path_is_never_prefixed(windows):
    relative = "music\\" + "a" * 300
    assert os_path(relative) == relative


def test_dot_segments_are_collapsed_because_the_prefix_switches_that_off(windows):
    path = "C:\\Music\\." + "\\x\\.." + "\\" + "a" * 300
    assert os_path(path) == "\\\\?\\C:\\Music\\" + "a" * 300


def test_a_drive_relative_path_is_not_absolute(windows):
    relative = "C:" + "a" * 300
    assert os_path(relative) == relative


def test_empty_and_none_come_back_as_they_are(windows):
    assert os_path("") == ""
    assert os_path(None) is None


def test_a_pathlike_is_accepted_and_returned_as_text(posix, tmp_path):
    assert os_path(tmp_path) == str(tmp_path)


def test_display_path_takes_the_prefix_off_again(posix):
    plain = "C:\\Music\\" + "a" * 300
    assert display_path("\\\\?\\" + plain) == plain
    assert display_path("\\\\?\\UNC\\server\\share\\x") == "\\\\server\\share\\x"
    assert display_path("/music/a.mp3") == "/music/a.mp3"
    assert display_path("") == ""
    assert display_path(None) is None


def test_the_real_thing_on_this_platform():
    """On Windows a 300-character path is opened through the prefix; elsewhere it is plain."""
    path = os.path.abspath(os.path.join("x", "a" * 300))
    if os.name == "nt":
        assert os_path(path).startswith("\\\\?\\")
    else:
        assert os_path(path) == path


# ----------------------------------------------------------- who uses the helper


LONG = "C:\\Music\\" + "d\\" * 150 + "a.mp3"


def test_the_file_check_stats_the_prefixed_path_on_windows(windows, monkeypatch):
    from cuepoint.services import file_check_service

    seen = []

    def stat(path, *args, **kwargs):
        seen.append(path)
        raise FileNotFoundError(path)

    monkeypatch.setattr(file_check_service.os, "stat", stat)

    assert file_check_service.check_file(LONG)[0] == file_check_service.FILE_MISSING
    assert seen == ["\\\\?\\" + LONG]


def test_the_file_check_hands_a_short_path_over_as_it_is(windows, monkeypatch):
    from cuepoint.services import file_check_service

    seen = []
    monkeypatch.setattr(
        file_check_service.os,
        "stat",
        lambda path, *a, **k: seen.append(path) or (_ for _ in ()).throw(OSError()),
    )

    file_check_service.check_file("C:\\Music\\a.mp3")
    assert seen == ["C:\\Music\\a.mp3"]


def test_the_decoder_is_given_the_prefixed_path_on_windows(windows):
    from cuepoint.data.audio_decode import decoder_arguments

    arguments = decoder_arguments("mpv", LONG, output="o.raw", log_file="l.txt")

    assert arguments[-2:] == ["--", "\\\\?\\" + LONG]


def test_the_decoder_is_given_the_path_as_it_is_elsewhere(posix):
    from cuepoint.data.audio_decode import decoder_arguments

    arguments = decoder_arguments("mpv", "/m/" + "d/" * 150, output="o", log_file="l")

    assert arguments[-1] == "/m/" + "d/" * 150


def test_the_export_folder_checks_look_through_the_prefix_on_windows(
    windows, monkeypatch
):
    from cuepoint.services import rekordbox_export_service as service

    seen = []
    monkeypatch.setattr(
        service.os.path,
        "isdir",
        lambda p: seen.append(p) or not p.endswith("out.xml"),
    )
    monkeypatch.setattr(service.os.path, "abspath", lambda p: p)

    service.RekordboxExportService._check_destination(
        "C:\\Music\\" + "d\\" * 150 + "out.xml", "C:\\src\\collection.xml"
    )

    assert seen and all(p.startswith("\\\\?\\") for p in seen if p)


def test_a_tag_write_opens_the_file_through_the_helper_with_room_for_its_copy(
    tmp_path, monkeypatch
):
    from cuepoint.data import tag_save

    target = tmp_path / "a.wav"
    target.write_bytes(b"RIFF" + b"\0" * 64)
    calls = []

    def recording(path, reserve=0):
        calls.append((os.path.basename(path), reserve))
        return path

    monkeypatch.setattr(tag_save, "os_path", recording)

    tag_save.save_via_copy(target, lambda copy: None, accept=lambda _r: False)

    assert calls == [("a.wav", tag_save._SIBLING_ROOM)]


# ------------------------------------------------------------- the read side


def test_a_tag_snapshot_read_opens_the_prefixed_path_on_windows(windows, monkeypatch):
    import mutagen.flac
    import mutagen.id3

    from cuepoint.data import tag_fields

    opened = []

    class Recorder(Exception):
        def __init__(self, path, *args, **kwargs):
            opened.append(path)
            super().__init__("stop here")

    monkeypatch.setattr(mutagen.id3, "ID3", Recorder)
    monkeypatch.setattr(mutagen.flac, "FLAC", Recorder)
    long_mp3 = "C:\\Music\\" + "d\\" * 150 + "a.mp3"
    long_flac = "C:\\Music\\" + "d\\" * 150 + "a.flac"

    for path in (long_mp3, long_flac):
        with pytest.raises(tag_fields.TagFieldsError):
            tag_fields.read_tag_fields(path)

    assert opened == ["\\\\?\\" + long_mp3, "\\\\?\\" + long_flac]


def test_the_embedded_picture_read_opens_the_prefixed_path_on_windows(
    windows, monkeypatch
):
    import mutagen

    from cuepoint.data import artwork

    opened = []
    monkeypatch.setattr(mutagen, "File", lambda path, *a, **k: opened.append(path))

    artwork.inspect_embedded(LONG)

    assert opened == ["\\\\?\\" + LONG]


def test_the_playlist_tag_read_opens_the_prefixed_path_on_windows(windows, monkeypatch):
    import mutagen

    from cuepoint.data import playlist_file

    opened = []
    monkeypatch.setattr(mutagen, "File", lambda path, *a, **k: opened.append(path))

    playlist_file._read_mutagen_auto_title_artist(LONG)

    assert opened == ["\\\\?\\" + LONG]
