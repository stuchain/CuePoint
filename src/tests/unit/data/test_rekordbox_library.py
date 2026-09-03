#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the library collection parser (LIBRARY-02).

Most of what is asserted here was learned from a real 3,880-track Rekordbox
6.8.6 export rather than from documentation, because the spec said to confirm
the mapping against a real file and the file disagreed with the obvious reading
in four places:

- ``Rating`` really is written as multiples of 51, and 68 tracks in that export
  are rated. A parser that stored the raw value would put "255 stars" in the
  database, and ``LibraryTrack`` would reject it.
- ``AverageBpm="0.00"`` appears on four tracks. ``LibraryTrack`` rejects a BPM
  of zero, so passing it through aborts the whole import over four unanalyzed
  files.
- ``Year="0"`` (136 tracks) and ``BitRate="0"`` (259) mean "not known", not
  "year zero" and "zero kbps".
- Track filenames contain ``?`` and ``#`` (7 tracks), and four contain a literal
  ``%`` because a download tool wrote percent-encoded text into the filename and
  Rekordbox then encoded the ``%`` correctly. Truncating at ``?`` or decoding
  twice both produce paths that do not exist.

There is no fixture of that export in the repository — it is the user's
collection. These tests reproduce its shapes.
"""

from __future__ import annotations

import gc
import tracemalloc
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import quoteattr

import pytest

from cuepoint.data import rekordbox
from cuepoint.data.rekordbox import (
    iter_collection_tracks,
    location_to_path,
    parse_collection,
)

# Every attribute a real Rekordbox 6.8.6 export writes on a COLLECTION TRACK.
FULL_TRACK = {
    "TrackID": "94682670",
    "Name": "Tataki (Original Mix)",
    "Artist": "Argy",
    "Composer": "",
    "Album": "Tataki",
    "Grouping": "",
    "Genre": "Melodic House",
    "Kind": "MP3 File",
    "Size": "13189421",
    "TotalTime": "328",
    "DiscNumber": "0",
    "TrackNumber": "0",
    "Year": "2022",
    "AverageBpm": "122.00",
    "DateAdded": "2022-10-03",
    "BitRate": "320",
    "SampleRate": "44100",
    "Comments": "peak time",
    "PlayCount": "7",
    "Rating": "204",
    "Location": "file://localhost/Users/stu/Desktop/rekordbox%20collection/Tataki.mp3",
    "Remixer": "Some Remixer",
    "Tonality": "10B",
    "Label": "Anjunadeep",
    "Mix": "",
}


def _track_xml(attrs: dict, children: str = "") -> str:
    rendered = " ".join(f"{k}={quoteattr(str(v))}" for k, v in attrs.items())
    if children:
        return f"    <TRACK {rendered}>{children}</TRACK>"
    return f"    <TRACK {rendered}/>"


def write_collection(
    tmp_path: Path,
    tracks: list,
    playlists_xml: str = "",
    name: str = "collection.xml",
) -> str:
    """Write a Rekordbox-shaped XML file and return its path."""
    body = "\n".join(_track_xml(t) if isinstance(t, dict) else t for t in tracks)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<DJ_PLAYLISTS Version="1.0.0">\n'
        '  <PRODUCT Name="rekordbox" Version="6.8.6" Company="AlphaTheta"/>\n'
        f'  <COLLECTION Entries="{len(tracks)}">\n'
        f"{body}\n"
        "  </COLLECTION>\n"
        f"{playlists_xml}"
        "</DJ_PLAYLISTS>\n"
    )
    path = tmp_path / name
    path.write_text(xml, encoding="utf-8")
    return str(path)


def _one(tmp_path: Path, **overrides):
    """Parse a single track built from FULL_TRACK plus overrides."""
    attrs = dict(FULL_TRACK)
    for key, value in overrides.items():
        if value is None:
            attrs.pop(key, None)
        else:
            attrs[key] = value
    tracks = list(iter_collection_tracks(write_collection(tmp_path, [attrs])))
    return tracks[0] if tracks else None


@pytest.mark.unit
class TestLocationToPath:
    """Decoding a Rekordbox Location into a path we can store and compare."""

    def test_empty_inputs_yield_empty(self):
        assert location_to_path(None) == ""
        assert location_to_path("") == ""
        assert location_to_path("   ") == ""

    def test_file_localhost_prefix_is_stripped(self):
        assert (
            location_to_path("file://localhost/Users/stu/track.mp3")
            == "/Users/stu/track.mp3"
        )

    def test_empty_host_form_is_stripped(self):
        assert location_to_path("file:///Users/stu/track.mp3") == "/Users/stu/track.mp3"

    def test_percent_escapes_are_decoded(self):
        assert (
            location_to_path("file://localhost/Users/stu/a%20b%20c.mp3")
            == "/Users/stu/a b c.mp3"
        )

    def test_utf8_escapes_are_decoded(self):
        assert (
            location_to_path("file://localhost/M%c3%bcsik/Tr%c3%a4ck.mp3")
            == "/Müsik/Träck.mp3"
        )

    def test_windows_drive_letter_loses_its_leading_slash(self):
        assert (
            location_to_path("file://localhost/D:/Music/track.mp3")
            == "D:/Music/track.mp3"
        )

    def test_posix_absolute_path_keeps_its_leading_slash(self):
        """The mirror of the drive-letter case: /var must not become var."""
        assert (
            location_to_path("file://localhost/var/music/x.mp3") == "/var/music/x.mp3"
        )

    def test_drive_letter_rule_does_not_depend_on_the_host_platform(self, monkeypatch):
        """A Windows export must decode the same way when read on a Mac.

        The database is one file a user may copy or restore anywhere, so this
        cannot branch on os.name the way get_track_locations does.
        """
        monkeypatch.setattr(rekordbox.os, "name", "posix")
        assert location_to_path("file://localhost/D:/Music/x.mp3") == "D:/Music/x.mp3"
        monkeypatch.setattr(rekordbox.os, "name", "nt")
        assert location_to_path("file://localhost/D:/Music/x.mp3") == "D:/Music/x.mp3"

    @pytest.mark.parametrize(
        "encoded,expected",
        [
            (
                "file://localhost/m/Is%20This%20A%20Dream%3f%20(Remix).mp3",
                "/m/Is This A Dream? (Remix).mp3",
            ),
            ("file://localhost/m/f%23m%20-%20Open%20Air.mp3", "/m/f#m - Open Air.mp3"),
            (
                "file://localhost/m/C's%20Movement%20%231.flac",
                "/m/C's Movement #1.flac",
            ),
        ],
    )
    def test_question_marks_and_hashes_are_part_of_the_name(self, encoded, expected):
        """Real filenames contain both; truncating there loses the extension."""
        assert location_to_path(encoded) == expected
        assert location_to_path(encoded).endswith((".mp3", ".flac"))

    def test_decoding_happens_exactly_once(self):
        """A real export's file really is named A%C3%BCra%2C on disk.

        A download tool wrote percent-encoded text into the filename and
        Rekordbox then encoded the % signs correctly, so decoding until the
        string stops changing produces a path that does not exist.
        """
        assert (
            location_to_path("file://localhost/m/A%25C3%25BCra%252C%20Rivero.mp3")
            == "/m/A%C3%BCra%2C Rivero.mp3"
        )

    def test_value_without_a_file_scheme_is_returned_as_a_path(self):
        assert location_to_path("/already/a/path.mp3") == "/already/a/path.mp3"

    def test_no_filesystem_access(self, tmp_path):
        """DEC-037: import records the path, it does not check for the file."""
        missing = "file://localhost/nowhere/at/all/ghost.mp3"
        assert location_to_path(missing) == "/nowhere/at/all/ghost.mp3"


@pytest.mark.unit
class TestFieldMapping:
    """DEC-034's fields, mapped from the attributes a real export writes."""

    def test_every_field_is_populated_from_a_full_track(self, tmp_path):
        track = _one(tmp_path)
        assert track.rekordbox_track_id == "94682670"
        assert track.title == "Tataki (Original Mix)"
        assert track.artist == "Argy"
        assert track.album == "Tataki"
        assert track.label == "Anjunadeep"
        assert track.genre == "Melodic House"
        assert track.remixer == "Some Remixer"
        assert track.key == "10B"
        assert track.bpm == 122.0
        assert track.year == 2022
        assert track.rating == 4
        assert track.play_count == 7
        assert track.date_added == "2022-10-03"
        assert track.comment == "peak time"
        assert track.duration_seconds == 328
        assert track.bitrate == 320
        assert track.file_path == "/Users/stu/Desktop/rekordbox collection/Tataki.mp3"

    def test_normalized_path_is_derived(self, tmp_path):
        track = _one(tmp_path)
        assert (
            track.normalized_path
            == "/users/stu/desktop/rekordbox collection/tataki.mp3"
        )

    def test_total_time_is_imported_into_duration_seconds(self, tmp_path):
        """DEC-038: one column for a track's length, not two.

        tracks has held duration_seconds since migration 0002, and it is the
        field the engine API exposes. A separate total_time column would have
        left the API reporting no duration for every imported track while the
        real value sat in a column nothing read.
        """
        track = _one(tmp_path, TotalTime="328")
        assert track.duration_seconds == 328
        assert not hasattr(track, "total_time")

    def test_musical_key_comes_from_tonality_not_key(self, tmp_path):
        """Key is Rekordbox's other spelling of TrackID on playlist entries.

        Reading the musical key from it would put a track id in the key column.
        """
        track = _one(tmp_path, Tonality=None, **{"Key": "99999"})
        assert track.key is None
        assert track.rekordbox_track_id == "94682670"

    def test_track_with_no_optional_fields_at_all(self, tmp_path):
        minimal = {"TrackID": "7", "Name": "Bare", "Artist": "Nobody"}
        (track,) = list(iter_collection_tracks(write_collection(tmp_path, [minimal])))
        assert track.rekordbox_track_id == "7"
        assert track.title == "Bare"
        assert track.file_path == ""
        assert track.normalized_path == ""
        for field in (
            "remixer",
            "album",
            "label",
            "genre",
            "key",
            "bpm",
            "year",
            "rating",
            "play_count",
            "colour",
            "date_added",
            "comment",
            "duration_seconds",
            "bitrate",
        ):
            assert getattr(track, field) is None, field

    def test_blank_attributes_become_none_not_empty_strings(self, tmp_path):
        track = _one(
            tmp_path,
            Remixer="",
            Album="  ",
            Label="",
            Genre="",
            Comments="",
            Tonality="",
        )
        assert track.remixer is None
        assert track.album is None
        assert track.label is None
        assert track.genre is None
        assert track.comment is None
        assert track.key is None

    def test_non_ascii_title_artist_and_path(self, tmp_path):
        track = _one(
            tmp_path,
            Name="Paris (Chloé Caillet Remix)",
            Artist="Kadosh (IL), Melódisch",
            Location="file://localhost/M%c3%bcsik/Tr%c3%a4ck%20%e2%80%93%20one.mp3",
        )
        assert track.title == "Paris (Chloé Caillet Remix)"
        assert track.artist == "Kadosh (IL), Melódisch"
        assert track.file_path == "/Müsik/Träck – one.mp3"
        assert track.normalized_path == "/müsik/träck – one.mp3"


@pytest.mark.unit
class TestAttributeNameVariants:
    """Exports differ across versions; the existing parser already knew this."""

    @pytest.mark.parametrize("attribute", ["TrackID", "ID", "Key"])
    def test_track_id_spellings(self, tmp_path, attribute):
        (track,) = list(
            iter_collection_tracks(
                write_collection(tmp_path, [{attribute: "42", "Name": "T"}])
            )
        )
        assert track.rekordbox_track_id == "42"

    def test_track_id_prefers_trackid_over_the_alternatives(self, tmp_path):
        (track,) = list(
            iter_collection_tracks(
                write_collection(
                    tmp_path, [{"TrackID": "1", "ID": "2", "Key": "3", "Name": "T"}]
                )
            )
        )
        assert track.rekordbox_track_id == "1"

    @pytest.mark.parametrize("attribute", ["Name", "Title"])
    def test_title_spellings(self, tmp_path, attribute):
        (track,) = list(
            iter_collection_tracks(
                write_collection(tmp_path, [{"TrackID": "1", attribute: "Song"}])
            )
        )
        assert track.title == "Song"

    @pytest.mark.parametrize("attribute", ["Artist", "Artists"])
    def test_artist_spellings(self, tmp_path, attribute):
        (track,) = list(
            iter_collection_tracks(
                write_collection(
                    tmp_path, [{"TrackID": "1", "Name": "S", attribute: "A"}]
                )
            )
        )
        assert track.artist == "A"

    @pytest.mark.parametrize("attribute", ["Colour", "Color"])
    def test_colour_spellings(self, tmp_path, attribute):
        """Neither spelling appears in a real 6.8.6 export; both are accepted.

        DEC-034 asked for colour and the column exists, so a version that does
        emit it lands in the right place instead of being dropped.
        """
        track = _one(tmp_path, **{attribute: "0xFF007F"})
        assert track.colour == "0xFF007F"

    def test_colour_is_none_when_the_export_omits_it(self, tmp_path):
        """The real export writes no Colour attribute on any of its 3,880 tracks."""
        assert _one(tmp_path).colour is None


@pytest.mark.unit
class TestRatingConversion:
    """The trap DEC-034 named, confirmed against a real export."""

    @pytest.mark.parametrize(
        "raw,stars",
        [("0", 0), ("51", 1), ("102", 2), ("153", 3), ("204", 4), ("255", 5)],
    )
    def test_rekordbox_encoding_becomes_a_star_count(self, tmp_path, raw, stars):
        assert _one(tmp_path, Rating=raw).rating == stars

    @pytest.mark.parametrize("stars", ["1", "2", "3", "4", "5"])
    def test_a_plain_star_count_is_accepted_too(self, tmp_path, stars):
        """No star count except zero is a multiple of 51, so there is no guess."""
        assert _one(tmp_path, Rating=stars).rating == int(stars)

    @pytest.mark.parametrize("bad", ["7", "200", "-51", "306", "abc", ""])
    def test_unrecognized_ratings_become_none_rather_than_raising(self, tmp_path, bad):
        """One odd value must not fail an import, or invent a rating."""
        assert _one(tmp_path, Rating=bad).rating is None

    def test_missing_rating_attribute_is_none(self, tmp_path):
        assert _one(tmp_path, Rating=None).rating is None

    def test_zero_stars_is_stored_as_zero_not_null(self, tmp_path):
        """Rekordbox writes Rating="0" for unrated; that is an answer, not a gap."""
        assert _one(tmp_path, Rating="0").rating == 0


@pytest.mark.unit
class TestNumericTolerance:
    """Malformed and zero numbers, all of which occur in real exports."""

    @pytest.mark.parametrize("bad", ["", "   ", "abc", "N/A"])
    def test_malformed_numbers_become_none(self, tmp_path, bad):
        track = _one(tmp_path, BitRate=bad, PlayCount=bad, TotalTime=bad, Year=bad)
        assert track.bitrate is None
        assert track.play_count is None
        assert track.duration_seconds is None
        assert track.year is None

    def test_decimal_integers_are_accepted(self, tmp_path):
        assert _one(tmp_path, BitRate="320.0").bitrate == 320

    def test_zero_bpm_becomes_none_instead_of_failing_the_import(self, tmp_path):
        """Four tracks of a real export carry AverageBpm="0.00".

        LibraryTrack rejects a BPM of zero, so without this the whole import
        raises rather than importing 3,876 good tracks and four unanalyzed ones.
        """
        assert _one(tmp_path, AverageBpm="0.00").bpm is None

    @pytest.mark.parametrize("bad", ["-1", "999", "abc", "", "301"])
    def test_out_of_range_or_unparseable_bpm_becomes_none(self, tmp_path, bad):
        assert _one(tmp_path, AverageBpm=bad).bpm is None

    def test_highest_accepted_bpm(self, tmp_path):
        assert _one(tmp_path, AverageBpm="300").bpm == 300.0

    @pytest.mark.parametrize(
        "field,attribute",
        [
            ("year", "Year"),
            ("bitrate", "BitRate"),
            ("duration_seconds", "TotalTime"),
        ],
    )
    def test_zero_means_unknown_for_measured_quantities(
        self, tmp_path, field, attribute
    ):
        """136 tracks say Year="0" and 259 say BitRate="0" in a real export.

        Stored as zero they would sort as the oldest and worst-quality tracks in
        the library, which is DEC-034's "a missing rating is not a zero rating"
        made in the opposite direction.
        """
        assert getattr(_one(tmp_path, **{attribute: "0"}), field) is None

    def test_zero_play_count_is_kept(self, tmp_path):
        """Never played is a real answer, unlike a bitrate of zero."""
        assert _one(tmp_path, PlayCount="0").play_count == 0

    def test_large_play_count(self, tmp_path):
        assert _one(tmp_path, PlayCount="1234").play_count == 1234


@pytest.mark.unit
class TestCollectionScope:
    """What counts as a track, and what the iterator must ignore."""

    PLAYLISTS = (
        "  <PLAYLISTS>\n"
        '    <NODE Type="0" Name="ROOT" Count="1">\n'
        '      <NODE Name="Set" Type="1" KeyType="0" Entries="2">\n'
        '        <TRACK Key="94682670"/>\n'
        '        <TRACK Key="55555555"/>\n'
        "      </NODE>\n"
        "    </NODE>\n"
        "  </PLAYLISTS>\n"
    )

    def test_playlist_track_references_are_not_yielded(self, tmp_path):
        """<TRACK Key="..."/> in PLAYLISTS is a reference, not a track.

        It would otherwise parse as a track whose id came from the Key
        fallback, with no title, no path and no fields at all.
        """
        path = write_collection(tmp_path, [FULL_TRACK], playlists_xml=self.PLAYLISTS)
        tracks = list(iter_collection_tracks(path))
        assert [t.rekordbox_track_id for t in tracks] == ["94682670"]

    def test_document_order_is_preserved(self, tmp_path):
        rows = [
            {"TrackID": str(i), "Name": f"T{i}", "Artist": "A"} for i in range(1, 11)
        ]
        path = write_collection(tmp_path, rows)
        assert [t.rekordbox_track_id for t in iter_collection_tracks(path)] == [
            str(i) for i in range(1, 11)
        ]

    def test_track_without_an_identity_is_skipped(self, tmp_path):
        """No TrackID means no DEC-002 identity and no unique key to store it."""
        rows = [{"Name": "Orphan", "Artist": "A"}, {"TrackID": "2", "Name": "Kept"}]
        path = write_collection(tmp_path, rows)
        assert [t.rekordbox_track_id for t in iter_collection_tracks(path)] == ["2"]

    def test_track_without_a_title_is_kept(self, tmp_path):
        """Deliberately unlike parse_collection, which skips it.

        The library mirrors Rekordbox; dropping a track the user can see there
        would make it vanish from CuePoint with no explanation, and DEC-003 then
        deletes any CuePoint data attached to it on the next refresh.
        """
        path = write_collection(tmp_path, [{"TrackID": "9", "Name": "", "Artist": "A"}])
        (track,) = list(iter_collection_tracks(path))
        assert track.rekordbox_track_id == "9"
        assert track.title == ""

    def test_a_file_with_no_collection_yields_nothing(self, tmp_path):
        path = tmp_path / "empty.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0"><PLAYLISTS/></DJ_PLAYLISTS>\n',
            encoding="utf-8",
        )
        assert list(iter_collection_tracks(str(path))) == []

    def test_an_empty_collection_yields_nothing(self, tmp_path):
        path = tmp_path / "none.xml"
        path.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="0"/></DJ_PLAYLISTS>\n',
            encoding="utf-8",
        )
        assert list(iter_collection_tracks(str(path))) == []

    def test_track_child_elements_are_ignored(self, tmp_path):
        """TEMPO and POSITION_MARK end events must not be mistaken for tracks."""
        children = (
            '<TEMPO Inizio="0.106" Bpm="122.00" Metro="4/4" Battito="1"/>'
            '<POSITION_MARK Name="" Type="0" Start="39.447" Num="-1"/>'
        )
        xml = _track_xml(FULL_TRACK, children=children)
        path = write_collection(tmp_path, [xml])
        assert len(list(iter_collection_tracks(path))) == 1


@pytest.mark.unit
class TestInputGuards:
    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            list(iter_collection_tracks(str(tmp_path / "nope.xml")))

    def test_oversized_file_is_refused(self, tmp_path, monkeypatch):
        path = write_collection(tmp_path, [FULL_TRACK])
        monkeypatch.setattr(rekordbox, "MAX_XML_SIZE_BYTES", 10)
        with pytest.raises(ValueError, match="too large"):
            list(iter_collection_tracks(path))

    def test_malformed_xml_raises_a_parse_error(self, tmp_path):
        path = tmp_path / "broken.xml"
        path.write_text(
            '<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"',
            encoding="utf-8",
        )
        with pytest.raises(ET.ParseError):
            list(iter_collection_tracks(str(path)))


@pytest.mark.unit
class TestStreaming:
    """Fifty thousand tracks is the target, and it shapes this function."""

    @staticmethod
    def _generate(tmp_path: Path, count: int, name: str) -> Path:
        path = tmp_path / name
        with path.open("w", encoding="utf-8") as handle:
            handle.write(
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<DJ_PLAYLISTS Version="1.0.0">\n'
                f'  <COLLECTION Entries="{count}">\n'
            )
            for i in range(count):
                handle.write(
                    f'    <TRACK TrackID="{i}" Name="Track number {i}" '
                    f'Artist="Artist {i % 500}" Album="Album {i % 900}" '
                    f'Genre="House" Label="Label {i % 300}" Tonality="8A" '
                    f'AverageBpm="124.00" Year="2024" TotalTime="360" '
                    f'BitRate="320" PlayCount="{i % 40}" Rating="{(i % 6) * 51}" '
                    f'DateAdded="2024-01-01" Comments="comment {i}" '
                    f'Location="file://localhost/Users/dj/Music/track%20{i}.mp3">\n'
                    f'      <TEMPO Inizio="0.1" Bpm="124.00" Metro="4/4" Battito="1"/>\n'
                    f"    </TRACK>\n"
                )
            handle.write("  </COLLECTION>\n</DJ_PLAYLISTS>\n")
        return path

    @staticmethod
    def _peak_bytes(path: Path) -> tuple:
        gc.collect()
        tracemalloc.start()
        try:
            count = sum(1 for _ in iter_collection_tracks(str(path)))
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        return count, peak

    def test_memory_does_not_grow_with_the_number_of_tracks(self, tmp_path):
        """The guard on element detaching.

        Clearing a TRACK frees its attributes and cue points but leaves an empty
        element in COLLECTION's child list, so without ``del collection[:]``
        memory still grows once per track. Ten times the tracks must not cost
        anything like ten times the memory.
        """
        small = self._generate(tmp_path, 2_000, "small.xml")
        large = self._generate(tmp_path, 20_000, "large.xml")

        small_count, small_peak = self._peak_bytes(small)
        large_count, large_peak = self._peak_bytes(large)

        assert small_count == 2_000
        assert large_count == 20_000
        assert large_peak < small_peak * 3, (
            f"peak memory grew with track count: {small_peak} -> {large_peak}; "
            "parsed elements are being retained"
        )

    def test_peak_memory_stays_far_below_the_file_size(self, tmp_path):
        large = self._generate(tmp_path, 20_000, "large.xml")
        _, peak = self._peak_bytes(large)
        assert peak < large.stat().st_size / 4, (
            f"peak {peak} against a {large.stat().st_size}-byte file suggests the "
            "document is being held in memory"
        )

    def test_the_file_handle_is_closed_when_iteration_finishes(self, tmp_path):
        """Windows refuses to delete an open file, so unlink is the assertion."""
        path = self._generate(tmp_path, 50, "closed.xml")
        assert sum(1 for _ in iter_collection_tracks(str(path))) == 50
        path.unlink()
        assert not path.exists()

    def test_the_file_handle_is_closed_when_the_caller_stops_early(self, tmp_path):
        """A refresh that finds what it needs early must not leak the handle."""
        path = self._generate(tmp_path, 500, "abandoned.xml")
        iterator = iter_collection_tracks(str(path))
        assert next(iterator).rekordbox_track_id == "0"
        iterator.close()
        gc.collect()
        path.unlink()
        assert not path.exists()

    @pytest.mark.slow
    def test_fifty_thousand_tracks(self, tmp_path):
        path = self._generate(tmp_path, 50_000, "fifty.xml")
        count, peak = self._peak_bytes(path)
        assert count == 50_000
        assert peak < 8 * 1024 * 1024, f"peak {peak} bytes for 50,000 tracks"


@pytest.mark.unit
class TestExistingParserIsUntouched:
    """DEC-036: the matching pipeline keeps its own parse, unchanged."""

    def test_parse_collection_still_reads_the_same_file(self, tmp_path):
        path = write_collection(tmp_path, [FULL_TRACK])
        rows = list(parse_collection(path))
        assert len(rows) == 1
        track_id, title, artist, remix, label = rows[0]
        assert (track_id, title, artist, label) == (
            "94682670",
            "Tataki (Original Mix)",
            "Argy",
            "Anjunadeep",
        )
        assert remix == "Some Remixer"

    def test_both_parsers_agree_on_which_tracks_exist(self, tmp_path):
        rows = [
            {"TrackID": str(i), "Name": f"T{i}", "Artist": "A"} for i in range(1, 6)
        ]
        path = write_collection(tmp_path, rows)
        assert [r[0] for r in parse_collection(path)] == [
            t.rekordbox_track_id for t in iter_collection_tracks(path)
        ]
