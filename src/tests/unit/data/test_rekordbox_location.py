#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""How Rekordbox spells where a track is, and what path that becomes (HARDEN-06).

``Location`` is a file URL. Its host part is empty or ``localhost`` for a local
file and names the machine for a network one; the host must survive, because
``//server/share/a.mp3`` is a different file from ``/share/a.mp3``. Drive
letters, percent-encoding and the two characters that start a URL's query and
fragment are ordinary file-name characters here.
"""

from __future__ import annotations

import unicodedata

import pytest

from cuepoint.data.rekordbox import location_to_path
from cuepoint.models.library_track import normalize_path

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "location, expected",
    (
        ("file://localhost/Users/stu/a.mp3", "/Users/stu/a.mp3"),
        ("file://LOCALHOST/Users/stu/a.mp3", "/Users/stu/a.mp3"),
        ("file:///Users/stu/a.mp3", "/Users/stu/a.mp3"),
        ("FILE:///Users/stu/a.mp3", "/Users/stu/a.mp3"),
        ("file://localhost/D:/Music/a.mp3", "D:/Music/a.mp3"),
        ("file:///D:/Music/a.mp3", "D:/Music/a.mp3"),
        ("/D:/Music/a.mp3", "D:/Music/a.mp3"),
    ),
)
def test_a_local_location_has_no_host(location, expected):
    assert location_to_path(location) == expected


@pytest.mark.parametrize(
    "location, expected",
    (
        # The standard spelling of a network file.
        ("file://server/share/a.mp3", "//server/share/a.mp3"),
        ("file://SERVER/Share/Sub%20Dir/a.mp3", "//SERVER/Share/Sub Dir/a.mp3"),
        ("file://nas.local/music/a.mp3", "//nas.local/music/a.mp3"),
        ("file://192.168.1.20/music/a.mp3", "//192.168.1.20/music/a.mp3"),
        # How Rekordbox writes it: localhost, then the UNC path's own slashes.
        ("file://localhost//server/share/a.mp3", "//server/share/a.mp3"),
        # An empty host and a four-slash UNC path.
        ("file:////server/share/a.mp3", "//server/share/a.mp3"),
    ),
)
def test_a_network_location_keeps_its_host(location, expected):
    assert location_to_path(location) == expected


def test_a_drive_letter_in_the_host_position_is_a_drive_not_a_host():
    assert location_to_path("file://D:/Music/a.mp3") == "D:/Music/a.mp3"


def test_the_two_spellings_of_a_network_track_are_one_key():
    assert normalize_path(location_to_path("file://Server/Share/a.mp3")) == (
        normalize_path(location_to_path("file://localhost//server/share/a.mp3"))
    )
    assert normalize_path(r"\\Server\Share\a.mp3") == normalize_path(
        location_to_path("file://server/share/a.mp3")
    )


def test_a_percent_encoded_decomposed_name_decodes_to_the_decomposed_name():
    decomposed = unicodedata.normalize("NFD", "Beyoncé")
    encoded = "Beyonce%CC%81"
    path = location_to_path(f"file://localhost/Music/{encoded}/a.mp3")

    assert path == f"/Music/{decomposed}/a.mp3"
    # file_path keeps what the disk holds; only the comparison key is composed.
    assert normalize_path(path) == "/music/beyoncé/a.mp3"


def test_a_percent_encoded_composed_name_and_a_decomposed_one_are_one_key():
    composed = location_to_path("file://localhost/Music/Beyonc%C3%A9/a.mp3")
    decomposed = location_to_path("file://localhost/Music/Beyonce%CC%81/a.mp3")

    assert composed != decomposed
    assert normalize_path(composed) == normalize_path(decomposed)


def test_a_hash_and_a_question_mark_are_part_of_the_name():
    assert location_to_path("file://localhost/Music/f#m/C's #1.mp3") == (
        "/Music/f#m/C's #1.mp3"
    )
    assert location_to_path("file://localhost/Music/Is This A Dream?.mp3") == (
        "/Music/Is This A Dream?.mp3"
    )
    assert location_to_path("file://server/share/Is%20It%3F%20%231.mp3") == (
        "//server/share/Is It? #1.mp3"
    )


def test_percent_signs_are_decoded_once():
    assert location_to_path("file://localhost/M/A%25C3%25BCra.mp3") == (
        "/M/A%C3%BCra.mp3"
    )


@pytest.mark.parametrize("location", (None, "", "   ", "file://", "file://localhost"))
def test_nothing_usable_is_an_empty_path(location):
    assert location_to_path(location) == ""
