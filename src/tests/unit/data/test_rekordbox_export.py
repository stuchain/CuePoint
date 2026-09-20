#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox XML patch writer (EXPORT-01, DEC-077, DEC-079, DEC-083).

The first test in this file is the one that matters most. DEC-077 patches the
source document rather than generating a new one because CuePoint has never
parsed a cue point or a beat grid, so a generated file would hand a DJ back a
library with every hot cue and grid stripped. That promise is only as good as the
byte-preservation property, so it is asserted on the bytes — not by re-parsing and
comparing trees, which is the check that would pass while the file was being
quietly reformatted underneath it.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cuepoint.data.rekordbox import (
    _rating_to_stars,
    _stars_to_rating,
    iter_collection_tracks,
)
from cuepoint.data.rekordbox_export import (
    ATTR_BPM,
    ATTR_GENRE,
    ATTR_KEY,
    ATTR_LABEL,
    ATTR_RATING,
    ATTR_YEAR,
    EXPORT_FIELDS,
    FORBIDDEN_ATTRS,
    TrackExportValues,
    patch_collection_xml,
    refuse_source_as_destination,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError
from cuepoint.services.tag_write_service import key_text

pytestmark = pytest.mark.unit


# --------------------------------------------------------------------- fixtures


#: A source that carries everything a patch must not disturb: hot and memory cues,
#: a beat grid, a nested playlist tree, the PRODUCT element, a comment holding a
#: decoy TRACK, an attribute CuePoint has never heard of, single-quoted values,
#: an escaped ampersand, a non-ASCII title, and both self-closing and paired TRACK
#: forms.
COLLECTION = b"""<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.7.4" Company="AlphaTheta"/>
  <COLLECTION Entries="4">
    <TRACK TrackID="1" Name="Bl&amp;nd" Artist="Dusk" Tonality="Am" AverageBpm="128.00"\
 Genre="Techno" Label="Drumcode" Year="2019" Rating="102" TotalTime="431"\
 Location="file://localhost/C:/Music/one.mp3" SomeFutureField="keep me">
      <TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.025" Num="0" Red="40" Green="226" Blue="20"/>
    </TRACK>
    <!-- a decoy: <TRACK TrackID="999" Tonality="Zz"/> -->
    <TRACK TrackID="2" Name="Caf&#233; Sol" Artist='Ma&#241;ana' Tonality='F#m'\
 AverageBpm='124' Genre='' Label='' Year='0' Rating='0'/>
    <TRACK TrackID="3" Name="No Key" Artist="Anon" AverageBpm="90.00"/>
    <TRACK ID="4" Name="Old Style Id" Artist="Legacy" Tonality="Gm"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Type="0" Name="Gigs" Count="1">
        <NODE Name="Saturday" Type="1" KeyType="0" Entries="2">
          <TRACK Key="1"/>
          <TRACK Key="2"/>
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
"""


@pytest.fixture()
def source(tmp_path: Path) -> Path:
    path = tmp_path / "collection.xml"
    path.write_bytes(COLLECTION)
    return path


@pytest.fixture()
def destination(tmp_path: Path) -> Path:
    return tmp_path / "out" / "export.xml"


def _as_read(track) -> dict:
    """A parsed track's own fields, without the timestamps a parse stamps on it.

    ``LibraryTrack.created_at`` and ``updated_at`` default to the clock, so two
    parses of byte-identical input are never equal and comparing whole objects
    would be a test that passes only when both parses land in the same
    microsecond. What these assertions mean is that the *track* is unchanged.
    """
    import dataclasses

    data = dataclasses.asdict(track)
    data.pop("created_at", None)
    data.pop("updated_at", None)
    return data


def attrs_of(path: Path, track_id: str) -> dict:
    """The raw attribute text of one COLLECTION TRACK, read back from the file."""
    import xml.etree.ElementTree as ET

    root = ET.parse(str(path)).getroot()
    collection = root.find(".//COLLECTION")
    assert collection is not None
    for element in collection.findall("TRACK"):
        if (element.get("TrackID") or element.get("ID")) == track_id:
            return dict(element.attrib)
    raise AssertionError(f"track {track_id} not in {path}")


# ------------------------------------------------- the property the phase rests on


class TestNothingElseChanges:
    def test_one_attribute_changes_and_every_other_byte_is_identical(
        self, source: Path, destination: Path
    ):
        """The test that would have caught a generated document (DEC-077)."""
        result = patch_collection_xml(
            str(source), {"1": TrackExportValues(key="Cm")}, str(destination)
        )

        before = source.read_bytes()
        after = destination.read_bytes()
        assert after == before.replace(b'Tonality="Am"', b'Tonality="Cm"', 1)
        assert result.tracks_changed == 1
        assert result.fields_changed == {"key": 1}

    @pytest.mark.parametrize(
        "fragment",
        [
            b'<TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>',
            b'<POSITION_MARK Name="Intro" Type="0" Start="0.025" Num="-1"/>',
            b'Num="0" Red="40" Green="226" Blue="20"',
            b'<PRODUCT Name="rekordbox" Version="6.7.4" Company="AlphaTheta"/>',
            b'<!-- a decoy: <TRACK TrackID="999" Tonality="Zz"/> -->',
            b'SomeFutureField="keep me"',
            b'TotalTime="431"',
            b'Location="file://localhost/C:/Music/one.mp3"',
            b'<NODE Name="Saturday" Type="1" KeyType="0" Entries="2">',
            b'<TRACK Key="1"/>',
            b'Name="Caf&#233; Sol"',
            b'<?xml version="1.0" encoding="UTF-8"?>',
        ],
    )
    def test_everything_cuepoint_never_parsed_survives(
        self, source: Path, destination: Path, fragment: bytes
    ):
        patch_collection_xml(
            str(source),
            {
                "1": TrackExportValues(key="Cm", bpm=130.0, rating=5),
                "2": TrackExportValues(genre="House", label="Kompakt", year=2021),
            },
            str(destination),
        )
        assert fragment in destination.read_bytes()

    def test_a_decoy_track_inside_a_comment_is_not_patched(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source), {"999": TrackExportValues(key="Cm")}, str(destination)
        )
        assert result.not_found == ("999",)
        assert destination.read_bytes() == source.read_bytes()

    def test_a_playlist_entry_is_not_a_track(self, source: Path, destination: Path):
        """A TRACK under PLAYLISTS is a reference; only COLLECTION holds tracks."""
        result = patch_collection_xml(
            str(source), {"1": TrackExportValues(key="Cm")}, str(destination)
        )
        assert result.tracks_seen == 4
        assert destination.read_bytes().count(b'<TRACK Key="1"/>') == 1

    def test_no_updates_copies_the_file_byte_for_byte(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(str(source), {}, str(destination))
        assert destination.read_bytes() == source.read_bytes()
        assert result.tracks_changed == 0
        assert result.changed is False


class TestManySplicesInOneDocument:
    """A four-track fixture can hide an off-by-one that five hundred cannot."""

    @staticmethod
    def _many(count: int) -> bytes:
        rows = "".join(
            f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="A{i}" Tonality="Am"'
            f' AverageBpm="128.00" Genre="Techno" Label="L{i}" Year="2019" Rating="102">\n'
            f'      <TEMPO Inizio="0.025" Bpm="128.00"/>\n'
            f'      <POSITION_MARK Name="Cue" Type="0" Start="0.025" Num="-1"/>\n'
            f"    </TRACK>\n"
            for i in range(1, count + 1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS>\n  <COLLECTION>\n'
            f"{rows}  </COLLECTION>\n</DJ_PLAYLISTS>\n"
        ).encode()

    def test_every_untouched_byte_after_the_last_edit_is_identical(
        self, tmp_path: Path
    ):
        source = tmp_path / "many.xml"
        source.write_bytes(self._many(500))
        out = tmp_path / "many_out.xml"

        # Six fields on the first hundred tracks: six hundred splices, then four
        # hundred tracks that must not move by a single byte.
        result = patch_collection_xml(
            str(source),
            {
                str(i): TrackExportValues(
                    key="Cm",
                    bpm=129.5,
                    genre="House",
                    label="Kompakt",
                    year=2021,
                    rating=5,
                )
                for i in range(1, 101)
            },
            str(out),
        )

        before, after = source.read_bytes(), out.read_bytes()
        marker = b'<TRACK TrackID="101" '
        assert before.count(marker) == after.count(marker) == 1
        assert after[after.index(marker) :] == before[before.index(marker) :]
        assert result.tracks_changed == 100
        assert before.count(b"<POSITION_MARK") == after.count(b"<POSITION_MARK") == 500
        assert before.count(b"<TEMPO") == after.count(b"<TEMPO") == 500

    def test_the_patched_tracks_all_read_back_correctly(self, tmp_path: Path):
        source = tmp_path / "many.xml"
        source.write_bytes(self._many(500))
        out = tmp_path / "many_out.xml"

        patch_collection_xml(
            str(source),
            {str(i): TrackExportValues(key="Cm", rating=5) for i in range(1, 101)},
            str(out),
        )

        tracks = {t.rekordbox_track_id: t for t in iter_collection_tracks(str(out))}
        assert len(tracks) == 500
        assert all(tracks[str(i)].key == "Cm" for i in range(1, 101))
        assert all(tracks[str(i)].rating == 5 for i in range(1, 101))
        assert all(tracks[str(i)].key == "Am" for i in range(101, 501))
        assert all(tracks[str(i)].rating == 2 for i in range(101, 501))


# ------------------------------------------------------ writing only what differs


class TestOnlyWhatDiffers:
    def test_values_equal_to_the_file_change_nothing(
        self, source: Path, destination: Path
    ):
        """A library nobody overrode exports as a copy (DEC-079)."""
        result = patch_collection_xml(
            str(source),
            {
                "1": TrackExportValues(
                    key="Am",
                    bpm=128.0,
                    genre="Techno",
                    label="Drumcode",
                    year=2019,
                    rating=2,
                )
            },
            str(destination),
        )
        assert destination.read_bytes() == source.read_bytes()
        assert result.tracks_changed == 0
        assert result.fields_changed == {}

    def test_bpm_is_compared_as_a_number_not_as_text(
        self, source: Path, destination: Path
    ):
        """``128`` and ``128.00`` are one value, so neither is rewritten."""
        patch_collection_xml(
            str(source), {"2": TrackExportValues(bpm=124.0)}, str(destination)
        )
        assert destination.read_bytes() == source.read_bytes()

    def test_a_different_bpm_is_written_in_rekordbox_form(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source), {"1": TrackExportValues(bpm=129.5)}, str(destination)
        )
        assert attrs_of(destination, "1")[ATTR_BPM] == "129.50"
        assert result.fields_changed == {"bpm": 1}

    def test_a_rating_another_tool_wrote_plainly_is_left_alone(self, tmp_path: Path):
        """``Rating="3"`` on a track nobody rated in CuePoint stays ``3``.

        The case that made DEC-079 compare parsed values: both encodings read as
        three stars, so re-serializing would change the file for no reason.
        """
        plain = tmp_path / "plain.xml"
        plain.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="7" Name="X" Rating="3"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(plain), {"7": TrackExportValues(rating=3)}, str(out))

        assert out.read_bytes() == plain.read_bytes()

    def test_a_changed_rating_is_written_in_rekordbox_encoding(self, tmp_path: Path):
        plain = tmp_path / "plain.xml"
        plain.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="7" Name="X" Rating="3"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(plain), {"7": TrackExportValues(rating=4)}, str(out))

        assert attrs_of(out, "7")[ATTR_RATING] == "204"

    def test_zero_stars_is_a_rating_and_zero_year_is_not_a_year(
        self, source: Path, destination: Path
    ):
        """Track 2 carries ``Rating='0'`` and ``Year='0'``.

        Zero stars is a rating a user gave, so a CuePoint zero matches it and
        nothing is written. Zero year is Rekordbox's "unknown", so a real year
        differs from it and is written.
        """
        result = patch_collection_xml(
            str(source),
            {"2": TrackExportValues(rating=0, year=2021)},
            str(destination),
        )
        assert result.fields_changed == {"year": 1}
        assert attrs_of(destination, "2")[ATTR_YEAR] == "2021"
        assert attrs_of(destination, "2")[ATTR_RATING] == "0"

    def test_an_absent_attribute_is_added(self, source: Path, destination: Path):
        """Track 3 has no ``Tonality`` at all."""
        patch_collection_xml(
            str(source), {"3": TrackExportValues(key="Dm")}, str(destination)
        )
        assert attrs_of(destination, "3")[ATTR_KEY] == "Dm"
        assert b'AverageBpm="90.00" Tonality="Dm"' in destination.read_bytes()

    @pytest.mark.parametrize("field", ["key", "genre", "label"])
    def test_a_blank_value_never_clears_an_attribute(
        self, source: Path, destination: Path, field: str
    ):
        """DEC-079 writes values; it does not empty fields."""
        patch_collection_xml(
            str(source), {"1": TrackExportValues(**{field: "  "})}, str(destination)
        )
        assert destination.read_bytes() == source.read_bytes()

    def test_none_leaves_every_field_alone(self, source: Path, destination: Path):
        patch_collection_xml(str(source), {"1": TrackExportValues()}, str(destination))
        assert destination.read_bytes() == source.read_bytes()

    def test_an_empty_attribute_in_the_file_is_filled(
        self, source: Path, destination: Path
    ):
        """Track 2 carries ``Genre=''`` and ``Label=''``, which are not values."""
        result = patch_collection_xml(
            str(source),
            {"2": TrackExportValues(genre="House", label="Kompakt")},
            str(destination),
        )
        assert result.fields_changed == {"genre": 1, "label": 1}
        assert attrs_of(destination, "2")[ATTR_GENRE] == "House"
        assert attrs_of(destination, "2")[ATTR_LABEL] == "Kompakt"


class TestAwkwardButLegalXml:
    """Shapes a real export may not use but a valid document may.

    Rekordbox writes one tidy style, so every one of these is a shape the writer
    would meet only in a hand-edited or third-party file — which is exactly when
    a byte-level rewrite could go wrong and nobody would be watching.
    """

    HEAD = b'<?xml version="1.0" encoding="UTF-8"?>'

    def _patch(self, tmp_path, body: bytes, updates):
        source = tmp_path / "awkward.xml"
        source.write_bytes(self.HEAD + body)
        out = tmp_path / "awkward_out.xml"
        result = patch_collection_xml(str(source), updates, str(out))
        return out.read_bytes(), result

    def test_whitespace_around_the_equals_sign(self, tmp_path: Path):
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID = "1"  Tonality = "Am" />'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(key="Cm")},
        )
        assert b'Tonality = "Cm"' in data
        assert result.tracks_changed == 1

    def test_a_start_tag_broken_over_several_lines(self, tmp_path: Path):
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1"\n      Tonality="Am"\n      Genre="T"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(key="Cm", genre="House")},
        )
        assert b'Tonality="Cm"' in data
        assert b'Genre="House"' in data

    def test_a_tab_between_attributes(self, tmp_path: Path):
        data, _ = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK\tTrackID="1"\tTonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(key="Cm")},
        )
        assert b'Tonality="Cm"' in data

    def test_a_paired_tag_with_no_attributes_to_append_after(self, tmp_path: Path):
        data, _ = self._patch(
            tmp_path,
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"></TRACK>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(key="Cm")},
        )
        assert b'<TRACK TrackID="1" Tonality="Cm">' in data

    def test_an_escaped_value_equal_to_ours_is_not_rewritten(self, tmp_path: Path):
        """``X &amp; Y`` already *is* ``X & Y``; comparison happens unescaped."""
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Name="A &amp; B" Label="X &amp; Y"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(label="X & Y")},
        )
        assert result.tracks_changed == 0
        assert b'Label="X &amp; Y"' in data
        assert b'Name="A &amp; B"' in data

    def test_a_collection_deeper_than_the_root(self, tmp_path: Path):
        data, result = self._patch(
            tmp_path,
            b"<ROOT><WRAP><COLLECTION>"
            b'<TRACK TrackID="1" Tonality="Am"/>'
            b"</COLLECTION></WRAP></ROOT>",
            {"1": TrackExportValues(key="Cm")},
        )
        assert b'Tonality="Cm"' in data
        assert result.tracks_seen == 1

    def test_a_decoy_inside_cdata_is_not_an_element(self, tmp_path: Path):
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Tonality="Am"><NOTE><![CDATA['
            b'<TRACK TrackID="2" Tonality="Zz"/>'
            b"]]></NOTE></TRACK></COLLECTION></DJ_PLAYLISTS>",
            {"2": TrackExportValues(key="Cm")},
        )
        assert result.not_found == ("2",)
        assert b'Tonality="Zz"' in data

    def test_an_unparseable_bpm_in_the_file_is_replaced(self, tmp_path: Path):
        """``999`` is past the parser's ceiling, so it reads as no BPM at all."""
        data, _ = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" AverageBpm="999.00"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(bpm=128.0)},
        )
        assert b'AverageBpm="128.00"' in data

    def test_an_unchanged_neighbour_does_not_move(self, tmp_path: Path):
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Tonality="Am" Genre="Techno"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {"1": TrackExportValues(key="Am", genre="House")},
        )
        assert b'Tonality="Am" Genre="House"' in data
        assert result.fields_changed == {"genre": 1}

    def test_attributes_in_reverse_field_order_are_all_written(self, tmp_path: Path):
        """The shape that needs the splices sorted rather than merely produced.

        Changes are built in ``EXPORT_FIELDS`` order. A file whose attributes run
        the other way therefore yields edits at descending offsets, and splicing
        them in that order walks backwards over the document. Without the sort in
        ``_write_atomically`` this raises rather than corrupting, which is the
        right failure — but it should never get the chance.
        """
        data, result = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Rating="102" Year="1999" Label="L" Genre="T"'
            b' AverageBpm="120.00" Tonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {
                "1": TrackExportValues(
                    key="Cm",
                    bpm=128.0,
                    genre="House",
                    label="Kompakt",
                    year=2024,
                    rating=5,
                )
            },
        )
        assert (
            b'<TRACK TrackID="1" Rating="255" Year="2024" Label="Kompakt"'
            b' Genre="House" AverageBpm="128.00" Tonality="Cm"/>' in data
        )
        assert result.fields_changed == {
            "key": 1,
            "bpm": 1,
            "genre": 1,
            "label": 1,
            "year": 1,
            "rating": 1,
        }

    def test_growing_one_value_keeps_the_later_offsets_right(self, tmp_path: Path):
        """The splice that would break first if offsets were applied in the wrong order."""
        data, _ = self._patch(
            tmp_path,
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Genre="T" Label="L" Year="1999"/>'
            b"</COLLECTION></DJ_PLAYLISTS>",
            {
                "1": TrackExportValues(
                    genre="A Very Long Genre Name",
                    label="Another Long Label",
                    year=2024,
                )
            },
        )
        assert (
            b'Genre="A Very Long Genre Name" Label="Another Long Label" Year="2024"'
            in data
        )


# ----------------------------------------------------------- notation and encoding


class TestTheTextThatGetsWritten:
    @pytest.mark.parametrize(
        "key_format, expected",
        [("normal", "Am"), ("camelot", "8A"), ("short", "Amin")],
    )
    def test_each_notation_reaches_tonality(
        self, source: Path, destination: Path, key_format: str, expected: str
    ):
        """DEC-089's three notations, rendered by the one converter a layer up."""
        rendered, reason = key_text("Am", key_format)
        assert rendered == expected and reason == ""

        patch_collection_xml(
            str(source), {"3": TrackExportValues(key=rendered)}, str(destination)
        )
        assert attrs_of(destination, "3")[ATTR_KEY] == expected

    def test_a_camelot_export_rewrites_a_classic_key(
        self, source: Path, destination: Path
    ):
        """Track 1 holds ``Am``; a Camelot export must actually put ``8A`` there."""
        rendered, _ = key_text("Am", "camelot")
        result = patch_collection_xml(
            str(source), {"1": TrackExportValues(key=rendered)}, str(destination)
        )
        assert attrs_of(destination, "1")[ATTR_KEY] == "8A"
        assert result.fields_changed == {"key": 1}

    @pytest.mark.parametrize(
        "value, written",
        [
            ("Rock & Roll", "Rock &amp; Roll"),
            ('He said "hi"', "He said &quot;hi&quot;"),
            ("a < b", "a &lt; b"),
            ("plain", "plain"),
        ],
    )
    def test_a_value_is_escaped_for_its_own_quoting(
        self, source: Path, destination: Path, value: str, written: str
    ):
        patch_collection_xml(
            str(source), {"1": TrackExportValues(label=value)}, str(destination)
        )
        assert f'Label="{written}"'.encode() in destination.read_bytes()
        assert attrs_of(destination, "1")[ATTR_LABEL] == value

    def test_a_single_quoted_attribute_keeps_its_quoting(
        self, source: Path, destination: Path
    ):
        """Track 2's attributes are single-quoted; the patch must not restyle them."""
        patch_collection_xml(
            str(source), {"2": TrackExportValues(genre="R'n'B")}, str(destination)
        )
        data = destination.read_bytes()
        assert b"Genre='R&apos;n&apos;B'" in data
        assert attrs_of(destination, "2")[ATTR_GENRE] == "R'n'B"

    def test_a_non_ascii_value_is_written_as_utf8(
        self, source: Path, destination: Path
    ):
        patch_collection_xml(
            str(source),
            {"1": TrackExportValues(label="Ångström & Söhne")},
            str(destination),
        )
        assert attrs_of(destination, "1")[ATTR_LABEL] == "Ångström & Söhne"
        assert "Ångström".encode("utf-8") in destination.read_bytes()

    def test_a_byte_order_mark_is_handled(self, tmp_path: Path):
        marked = tmp_path / "bom.xml"
        marked.write_bytes(
            b"\xef\xbb\xbf" + b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1" Tonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(marked), {"1": TrackExportValues(key="Cm")}, str(out))

        data = out.read_bytes()
        assert data.startswith(b"\xef\xbb\xbf")
        assert b'Tonality="Cm"' in data

    def test_an_encoding_that_cannot_be_spliced_is_refused_by_name(
        self, tmp_path: Path
    ):
        odd = tmp_path / "odd.xml"
        odd.write_bytes(
            b'<?xml version="1.0" encoding="UTF-16"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"/></COLLECTION></DJ_PLAYLISTS>'
        )
        with pytest.raises(ValidationError, match="Unsupported XML encoding 'utf-16'"):
            patch_collection_xml(
                str(odd), {"1": TrackExportValues(key="Cm")}, str(tmp_path / "o.xml")
            )

    def test_an_ascii_document_gets_numeric_references_not_utf8_bytes(
        self, tmp_path: Path
    ):
        """A file that declares ASCII must not be handed bytes outside it.

        Rekordbox writes UTF-8, so this is for a collection that came from
        somewhere else. Splicing UTF-8 into a document declaring ``us-ascii``
        would make it contradict its own declaration — malformed, and refused by
        the next parser to read it. Refusing the export instead would fail on an
        ordinary label, so the value goes in as numeric character references.
        """
        ascii_doc = tmp_path / "ascii.xml"
        ascii_doc.write_bytes(
            b'<?xml version="1.0" encoding="us-ascii"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1" Label="L"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(
            str(ascii_doc),
            {"1": TrackExportValues(label="Bj\u00f6rk & S\u00f6hne")},
            str(out),
        )

        data = out.read_bytes()
        assert data.isascii(), "an ASCII document must stay ASCII"
        assert b"&#246;" in data
        assert b"&amp;" in data
        # And it still reads back as the value that went in.
        assert attrs_of(out, "1")[ATTR_LABEL] == "Bj\u00f6rk & S\u00f6hne"

    def test_a_utf8_document_gets_real_utf8_not_references(self, tmp_path: Path):
        """The companion: nothing is escaped that does not need to be."""
        utf8_doc = tmp_path / "utf8.xml"
        utf8_doc.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1" Label="L"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(
            str(utf8_doc), {"1": TrackExportValues(label="Bj\u00f6rk")}, str(out)
        )

        data = out.read_bytes()
        assert "Bj\u00f6rk".encode("utf-8") in data
        assert b"&#246;" not in data

    def test_a_declaration_without_an_encoding_is_assumed_utf8(self, tmp_path: Path):
        plain = tmp_path / "plain.xml"
        plain.write_bytes(
            b'<?xml version="1.0"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1" Tonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(plain), {"1": TrackExportValues(key="Cm")}, str(out))

        assert b'Tonality="Cm"' in out.read_bytes()


# ------------------------------------------------------------- counting and shape


class TestWhatThePatchReports:
    def test_tracks_not_in_the_file_are_reported(self, source: Path, destination: Path):
        result = patch_collection_xml(
            str(source),
            {
                "1": TrackExportValues(key="Cm"),
                "404": TrackExportValues(key="Cm"),
                "405": TrackExportValues(key="Cm"),
            },
            str(destination),
        )
        assert set(result.not_found) == {"404", "405"}
        assert result.tracks_changed == 1

    def test_the_legacy_id_attribute_is_still_an_identity(
        self, source: Path, destination: Path
    ):
        """Track 4 carries ``ID`` rather than ``TrackID``, as the importer allows."""
        result = patch_collection_xml(
            str(source), {"4": TrackExportValues(key="Cm")}, str(destination)
        )
        assert result.not_found == ()
        assert attrs_of(destination, "4")[ATTR_KEY] == "Cm"

    def test_fields_are_counted_per_track(self, source: Path, destination: Path):
        result = patch_collection_xml(
            str(source),
            {
                "1": TrackExportValues(key="Cm", bpm=130.0),
                "2": TrackExportValues(key="Cm"),
            },
            str(destination),
        )
        assert result.fields_changed == {"key": 2, "bpm": 1}
        assert result.tracks_changed == 2
        assert result.elements_patched == 2

    def test_a_repeated_track_id_is_patched_twice_and_counted_once(
        self, tmp_path: Path
    ):
        """Rekordbox does not repeat a TrackID, but a hand-edited file might."""
        doubled = tmp_path / "doubled.xml"
        doubled.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b"<DJ_PLAYLISTS><COLLECTION>"
            b'<TRACK TrackID="1" Tonality="Am"/>'
            b'<TRACK TrackID="1" Tonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        result = patch_collection_xml(
            str(doubled), {"1": TrackExportValues(key="Cm")}, str(out)
        )

        assert out.read_bytes().count(b'Tonality="Cm"') == 2
        assert result.tracks_changed == 1
        assert result.elements_patched == 2

    def test_a_track_without_any_identity_is_skipped(self, tmp_path: Path):
        anonymous = tmp_path / "anon.xml"
        anonymous.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK Name="No id" Tonality="Am"/>'
            b"</COLLECTION></DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        result = patch_collection_xml(
            str(anonymous), {"1": TrackExportValues(key="Cm")}, str(out)
        )

        assert result.tracks_seen == 1
        assert result.not_found == ("1",)
        assert out.read_bytes() == anonymous.read_bytes()

    def test_a_file_with_no_collection_finds_nothing(self, tmp_path: Path):
        empty = tmp_path / "empty.xml"
        empty.write_bytes(
            b'<?xml version="1.0" encoding="UTF-8"?>\n'
            b'<DJ_PLAYLISTS><PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>'
            b"</DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        result = patch_collection_xml(
            str(empty), {"1": TrackExportValues(key="Cm")}, str(out)
        )

        assert result.tracks_seen == 0
        assert result.not_found == ("1",)
        assert out.read_bytes() == empty.read_bytes()


# ------------------------------------------------------------------ the round trip


class TestTheImporterReadsItBack:
    def test_the_patched_values_are_what_a_re_import_would_store(
        self, source: Path, destination: Path
    ):
        """The names must be the ones the importer reads, not the retired writer's.

        The orphaned code wrote ``BPM`` and ``Comment`` while the parser reads
        ``AverageBpm`` and ``Comments``, so its values never came back. This is
        the test that fails if that mistake returns.
        """
        patch_collection_xml(
            str(source),
            {
                "1": TrackExportValues(
                    key="Cm",
                    bpm=129.5,
                    genre="House",
                    label="Kompakt",
                    year=2021,
                    rating=5,
                )
            },
            str(destination),
        )

        tracks = {
            track.rekordbox_track_id: track
            for track in iter_collection_tracks(str(destination))
        }
        one = tracks["1"]
        assert one.key == "Cm"
        assert one.bpm == pytest.approx(129.5)
        assert one.genre == "House"
        assert one.label == "Kompakt"
        assert one.year == 2021
        assert one.rating == 5

    def test_the_untouched_track_reads_back_unchanged(
        self, source: Path, destination: Path
    ):
        patch_collection_xml(
            str(source), {"1": TrackExportValues(key="Cm")}, str(destination)
        )
        before = {t.rekordbox_track_id: t for t in iter_collection_tracks(str(source))}
        after = {
            t.rekordbox_track_id: t for t in iter_collection_tracks(str(destination))
        }
        assert _as_read(after["2"]) == _as_read(before["2"])
        assert _as_read(after["3"]) == _as_read(before["3"])
        assert _as_read(after["4"]) == _as_read(before["4"])

    def test_the_comparison_above_covers_every_field_but_the_parse_clock(self):
        """Guards the guard: `_as_read` must drop only the two timestamps."""
        import dataclasses

        from cuepoint.models.library_track import LibraryTrack

        dropped = {f.name for f in dataclasses.fields(LibraryTrack)} - set(
            _as_read(LibraryTrack(rekordbox_track_id="1", title="T", artist="A"))
        )
        assert dropped == {"created_at", "updated_at"}


# -------------------------------------------------------------- refusals and safety


class TestItRefusesTheWrongThings:
    def test_the_source_is_never_the_destination(self, source: Path):
        with pytest.raises(ValidationError, match="Refusing to write the export over"):
            patch_collection_xml(
                str(source), {"1": TrackExportValues(key="Cm")}, str(source)
            )
        assert source.read_bytes() == COLLECTION

    def test_a_relative_path_to_the_source_is_still_the_source(
        self, source: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.chdir(source.parent)
        with pytest.raises(ValidationError):
            patch_collection_xml(
                str(source), {"1": TrackExportValues(key="Cm")}, "collection.xml"
            )

    def test_a_dotted_path_to_the_source_is_still_the_source(self, source: Path):
        sneaky = str(source.parent / "." / source.name)
        with pytest.raises(ValidationError):
            refuse_source_as_destination(str(source), sneaky)

    @pytest.mark.skipif(os.name != "nt", reason="case-insensitive paths are Windows")
    def test_a_case_difference_is_still_the_source_on_windows(self, source: Path):
        with pytest.raises(ValidationError):
            refuse_source_as_destination(str(source), str(source).upper())

    def test_a_different_file_in_the_same_folder_is_allowed(self, source: Path):
        refuse_source_as_destination(str(source), str(source.parent / "export.xml"))

    def test_a_missing_source_is_a_file_not_found(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError, match="XML file not found"):
            patch_collection_xml(
                str(tmp_path / "gone.xml"), {}, str(tmp_path / "out.xml")
            )

    def test_an_oversized_source_is_refused_before_parsing(
        self, source: Path, destination: Path, monkeypatch: pytest.MonkeyPatch
    ):
        import cuepoint.data.rekordbox_export as module

        def explode(_path: str) -> bytes:  # pragma: no cover - must not run
            raise AssertionError("parsed a file it should have refused")

        monkeypatch.setattr(module.os.path, "getsize", lambda _p: 200 * 1024 * 1024)
        monkeypatch.setattr(module, "_collection_track_tags", explode)

        with pytest.raises(ValidationError, match="XML file too large"):
            patch_collection_xml(str(source), {}, str(destination))
        assert not destination.exists()

    def test_a_malformed_source_is_refused_and_named_as_such(self, tmp_path: Path):
        broken = tmp_path / "broken.xml"
        broken.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")
        with pytest.raises(ValidationError, match="not well-formed"):
            patch_collection_xml(
                str(broken), {"1": TrackExportValues(key="Cm")}, str(tmp_path / "o.xml")
            )

    def test_a_star_count_that_is_not_a_rating_writes_nothing(
        self, source: Path, destination: Path
    ):
        patch_collection_xml(
            str(source), {"1": TrackExportValues(rating=9)}, str(destination)
        )
        assert destination.read_bytes() == source.read_bytes()

    def test_no_exported_field_writes_a_forbidden_attribute(self):
        """The orphaned writer's mistakes, as a check rather than a comment."""
        written = {attribute for _field, attribute in EXPORT_FIELDS}
        assert written & set(FORBIDDEN_ATTRS) == set()
        assert written == {
            "Tonality",
            "AverageBpm",
            "Genre",
            "Label",
            "Year",
            "Rating",
        }


class TestTheWriteIsAtomic:
    def test_a_failure_leaves_no_destination_and_no_temp_file(
        self, source: Path, destination: Path, monkeypatch: pytest.MonkeyPatch
    ):
        destination.parent.mkdir(parents=True, exist_ok=True)
        original = Path.replace

        def fail(self: Path, target):  # noqa: ANN001 - patched stand-in
            raise OSError("disk full")

        monkeypatch.setattr(Path, "replace", fail)

        with pytest.raises(OSError, match="disk full"):
            patch_collection_xml(
                str(source), {"1": TrackExportValues(key="Cm")}, str(destination)
            )

        monkeypatch.setattr(Path, "replace", original)
        assert not destination.exists()
        assert list(destination.parent.iterdir()) == []

    def test_the_destination_directory_is_created(self, source: Path, tmp_path: Path):
        deep = tmp_path / "a" / "b" / "c" / "export.xml"
        patch_collection_xml(str(source), {}, str(deep))
        assert deep.is_file()

    def test_an_existing_destination_is_replaced(self, source: Path, tmp_path: Path):
        out = tmp_path / "out.xml"
        out.write_bytes(b"stale")
        patch_collection_xml(str(source), {"1": TrackExportValues(key="Cm")}, str(out))
        assert b'Tonality="Cm"' in out.read_bytes()
        assert b"stale" not in out.read_bytes()


# ------------------------------------------------------------- the rating encoding


class TestTheRatingEncoding:
    @pytest.mark.parametrize("stars", [0, 1, 2, 3, 4, 5])
    def test_stars_round_trip_through_rekordbox_encoding(self, stars: int):
        assert _rating_to_stars(str(_stars_to_rating(stars))) == stars

    @pytest.mark.parametrize(
        "stars, raw", [(0, 0), (1, 51), (2, 102), (3, 153), (4, 204), (5, 255)]
    )
    def test_the_encoding_is_rekordbox_own(self, stars: int, raw: int):
        assert _stars_to_rating(stars) == raw

    @pytest.mark.parametrize("stars", [-1, 6, 51, None, "three"])
    def test_anything_that_is_not_a_star_count_is_no_rating(self, stars):
        assert _stars_to_rating(stars) is None


class TestTheRetiredWritersAreGone:
    @pytest.mark.parametrize(
        "name",
        [
            "write_updated_collection_xml",
            "build_rekordbox_updates",
            "build_rekordbox_updates_batch",
            "write_key_comment_year_to_playlist_tracks",
            "write_key_comment_year_to_playlist_tracks_batch",
            "write_tags_to_paths",
            "_normal_key_value",
            "_short_key",
            "_rekordbox_classic_key",
            "_camelot_to_classic",
        ],
    )
    def test_the_orphaned_cluster_no_longer_exists(self, name: str):
        import cuepoint.data as package
        import cuepoint.data.rekordbox as rekordbox

        assert not hasattr(rekordbox, name), f"{name} came back"
        assert not hasattr(package, name), f"{name} is still re-exported"

    def test_what_the_cluster_used_that_had_to_stay(self):
        """`_CAMELOT_TO_CLASSIC` outlived it: `override_values` reads the table."""
        from cuepoint.data.rekordbox import _CAMELOT_TO_CLASSIC
        from cuepoint.services.override_values import parse_key

        assert _CAMELOT_TO_CLASSIC["8A"] == "Am"
        assert parse_key("8A") is not None
