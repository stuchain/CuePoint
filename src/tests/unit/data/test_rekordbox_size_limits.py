#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The two size limits of the Rekordbox readers, and the refusal that names them.

A library export reads in constant memory, so its readers may take a file of
several gigabytes. A reader that builds the whole tree uses five to seven times
the file, so it keeps the small limit. Either way a file over the limit is
refused with one clear error that a user can act on, and that CuePoint does not
report as a bug.
"""

from __future__ import annotations

import copy
import os
import pickle
from pathlib import Path

import pytest

from cuepoint.data import rekordbox
from cuepoint.data.rekordbox import (
    MAX_LIBRARY_XML_BYTES,
    MAX_XML_SIZE_BYTES,
    XmlTooLargeError,
    collection_entry_count,
    get_track_locations,
    has_collection_element,
    inspect_rekordbox_xml,
    iter_collection_entries,
    iter_playlist_nodes,
    parse_playlist_tree,
    parse_rekordbox,
    read_playlist_index,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError

pytestmark = pytest.mark.unit

XML = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="1">'
    '<TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/m/a.mp3"/>'
    "</COLLECTION><PLAYLISTS>"
    '<NODE Name="ROOT" Type="0"><NODE Name="P" Type="1" Entries="1">'
    '<TRACK Key="1"/></NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>'
)

#: What a 2.6 GB file reports, as the user in PYTHON-1H had.
FILE_OF_2_6_GB = 2_616_715_592

#: The readers that stream, and so take the library limit.
STREAMING_READERS = {
    "collection_entry_count": collection_entry_count,
    "has_collection_element": has_collection_element,
    "iter_collection_entries": lambda p: list(iter_collection_entries(p)),
    "iter_playlist_nodes": lambda p: list(iter_playlist_nodes(p)),
}

#: The readers that build the whole tree, and so keep the small limit.
TREE_READERS = {
    "parse_rekordbox": parse_rekordbox,
    "parse_playlist_tree": parse_playlist_tree,
    "get_track_locations": get_track_locations,
    "read_playlist_index": read_playlist_index,
    "inspect_rekordbox_xml": inspect_rekordbox_xml,
}


@pytest.fixture
def xml_path(tmp_path: Path) -> str:
    path = tmp_path / "collection.xml"
    path.write_text(XML, encoding="utf-8")
    return str(path)


def reports(monkeypatch: pytest.MonkeyPatch, size: int) -> None:
    """Make every ``getsize`` answer ``size`` without making a big file."""
    monkeypatch.setattr(os.path, "getsize", lambda _path: size)


class TestTheLimits:
    def test_a_library_may_be_four_gibibytes(self) -> None:
        assert MAX_LIBRARY_XML_BYTES == 4 * 1024**3

    def test_a_whole_tree_reader_keeps_a_hundred_mebibytes(self) -> None:
        assert MAX_XML_SIZE_BYTES == 100 * 1024 * 1024


class TestTheStreamingReaders:
    @pytest.mark.parametrize("name", sorted(STREAMING_READERS))
    def test_a_file_the_old_limit_refused_is_read(
        self, name: str, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, FILE_OF_2_6_GB)
        STREAMING_READERS[name](xml_path)

    @pytest.mark.parametrize("name", sorted(STREAMING_READERS))
    def test_a_file_over_the_library_limit_is_refused(
        self, name: str, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, MAX_LIBRARY_XML_BYTES + 1)
        with pytest.raises(XmlTooLargeError):
            STREAMING_READERS[name](xml_path)

    def test_a_file_of_exactly_the_limit_is_read(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, MAX_LIBRARY_XML_BYTES)
        assert collection_entry_count(xml_path) == 1


class TestTheTreeReaders:
    @pytest.mark.parametrize("name", sorted(TREE_READERS))
    def test_a_file_over_a_hundred_mebibytes_is_refused(
        self, name: str, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Fails today for ``read_playlist_index`` and ``inspect_rekordbox_xml``."""
        reports(monkeypatch, MAX_XML_SIZE_BYTES + 1)
        with pytest.raises(XmlTooLargeError):
            TREE_READERS[name](xml_path)

    @pytest.mark.parametrize("name", sorted(TREE_READERS))
    def test_a_file_at_the_limit_is_read(
        self, name: str, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, MAX_XML_SIZE_BYTES)
        TREE_READERS[name](xml_path)

    @pytest.mark.parametrize("name", sorted(TREE_READERS))
    def test_a_missing_file_is_still_a_file_not_found(
        self, name: str, tmp_path: Path
    ) -> None:
        with pytest.raises(FileNotFoundError):
            TREE_READERS[name](str(tmp_path / "gone.xml"))

    def test_a_streaming_limit_does_not_raise_the_tree_limit(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, FILE_OF_2_6_GB)
        with pytest.raises(XmlTooLargeError):
            parse_rekordbox(xml_path)


class TestTheRefusal:
    def test_it_is_a_validation_error_and_a_value_error(self) -> None:
        """Both, so the CLI's ``except ValueError`` and the engine's codes both work."""
        assert issubclass(XmlTooLargeError, ValidationError)
        assert issubclass(XmlTooLargeError, ValueError)

    def test_its_code_is_the_one_the_engine_does_not_report(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, MAX_LIBRARY_XML_BYTES + 1)
        with pytest.raises(XmlTooLargeError) as raised:
            collection_entry_count(xml_path)
        assert raised.value.error_code == "LIBRARY_XML_TOO_LARGE"
        assert raised.value.context == {
            "size_bytes": MAX_LIBRARY_XML_BYTES + 1,
            "limit_bytes": MAX_LIBRARY_XML_BYTES,
        }

    def test_it_says_the_sizes_in_gigabytes_and_what_to_check(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, 5_200_000_000)
        with pytest.raises(XmlTooLargeError) as raised:
            collection_entry_count(xml_path)
        assert raised.value.message == (
            "This file is 5.2 GB, larger than the 4 GB CuePoint can read. "
            "Check that it is your Rekordbox collection export "
            "(File > Export Collection in xml format)."
        )

    def test_it_says_megabytes_for_the_small_limit(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, 250 * 1000 * 1000)
        with pytest.raises(XmlTooLargeError) as raised:
            parse_rekordbox(xml_path)
        assert raised.value.message == (
            "This file is 250 MB, larger than the 100 MB the command line reads. "
            "Import it in the CuePoint app instead."
        )

    def test_it_never_names_the_file(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        reports(monkeypatch, MAX_LIBRARY_XML_BYTES + 1)
        with pytest.raises(XmlTooLargeError) as raised:
            collection_entry_count(xml_path)
        assert Path(xml_path).name not in raised.value.message
        assert "bytes" not in raised.value.message

    def test_the_limits_are_read_when_the_check_runs(
        self, xml_path: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(rekordbox, "MAX_LIBRARY_XML_BYTES", 10)
        with pytest.raises(XmlTooLargeError):
            collection_entry_count(xml_path)


class TestTheRefusalTravels:
    @pytest.mark.parametrize(
        "copy_it",
        [lambda e: pickle.loads(pickle.dumps(e)), copy.deepcopy, copy.copy],
        ids=["pickle", "deepcopy", "copy"],
    )
    def test_it_survives_a_copy_and_a_pickle(self, copy_it) -> None:
        error = XmlTooLargeError("Too big.", size_bytes=5, limit_bytes=3)
        again = copy_it(error)
        assert type(again) is XmlTooLargeError
        assert again.message == "Too big."
        assert again.error_code == "LIBRARY_XML_TOO_LARGE"
        assert again.context == {"size_bytes": 5, "limit_bytes": 3}
        assert (again.size_bytes, again.limit_bytes) == (5, 3)

    def test_the_sizes_may_be_left_out(self) -> None:
        again = pickle.loads(pickle.dumps(XmlTooLargeError("Too big.")))
        assert again.message == "Too big."
