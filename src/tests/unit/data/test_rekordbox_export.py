#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox XML export writer (EXPORT-01, EXPORT-02).

DEC-077, DEC-078, DEC-079, DEC-082, DEC-083.

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
    iter_playlist_nodes,
)
from cuepoint.data.rekordbox_export import (
    ATTR_BPM,
    ATTR_GENRE,
    ATTR_KEY,
    ATTR_LABEL,
    ATTR_RATING,
    ATTR_YEAR,
    CUEPOINT_FOLDER_NAME,
    EXPORT_FIELDS,
    FORBIDDEN_ATTRS,
    MAX_EXPORT_DEPTH,
    ExportFolder,
    ExportPlaylist,
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


def _spelling_shares_a_file(path: Path) -> bool:
    """Whether this volume reaches ``path`` by a differently-cased name.

    Asked of the volume the test is running on rather than of ``os.name``,
    because case-insensitivity is a property of the filesystem: NTFS and the
    default APFS and HFS+ volumes have it, a case-sensitive APFS volume and
    ext4 do not, and Windows can mount either.
    """
    upper = Path(str(path).upper())
    try:
        return upper.exists() and os.path.samefile(path, upper)
    except OSError:  # pragma: no cover - an unreadable path is not this test's
        return False


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

    def test_a_case_difference_is_still_the_source(self, source: Path):
        """Not a Windows-only concern, which is how this got through.

        This test used to skip unless ``os.name == "nt"``, on the premise that
        "case-insensitive paths are Windows". macOS's default APFS volume is
        case-insensitive too, and there ``refuse_source_as_destination`` let
        ``COLLECTION.XML`` through and the export overwrote ``collection.xml``.
        Asking the volume rather than the OS runs it wherever it means
        something and skips it only where a different spelling really is a
        different file.
        """
        if not _spelling_shares_a_file(source):
            pytest.skip("this volume is case-sensitive")
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
        monkeypatch.setattr(module, "_scan_document", explode)

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


# ==============================================================================
# EXPORT-02 — appending CuePoint's own playlist tree (DEC-078, DEC-058, DEC-082)
#
# The tree is rendered into the same document, in the same pass, by the same
# function: one read, one splice list, one atomic write. So these tests share
# the fixture above, and the first of them is the EXPORT-01 property restated
# for the half of the file this step touches — everything Rekordbox put in the
# PLAYLISTS tree is still there, byte for byte, with CuePoint's folder added
# beside it.
# ==============================================================================


def _fixture(name: str) -> Path:
    """One of the repository's own Rekordbox exports, as a source.

    ``small.xml`` matters here for what it lacks: its ROOT node declares no
    ``Count`` and no ``Type``, which is the shape that proves the appender adds
    neither.
    """
    path = (
        Path(__file__).resolve().parent.parent.parent / "fixtures" / "rekordbox" / name
    )
    assert path.is_file(), f"missing fixture {path}"
    return path


#: The tree most of these tests append: one playlist, whose entries the
#: fixture's COLLECTION really holds.
def _write_xml(path: Path, document: str) -> Path:
    """Write a source document exactly as spelled, line endings included.

    ``Path.write_text`` translates a line feed into the platform's own line
    ending, so on Windows it would quietly hand these tests a CRLF document
    — a real case, covered deliberately below, and not the one most of them
    mean.
    """
    path.write_bytes(document.encode("utf-8"))
    return path


def _one_playlist(*track_ids: str, name: str = "Set") -> list:
    return [ExportPlaylist(name=name, track_ids=tuple(track_ids))]


def _tree_of(path: Path) -> list:
    """Every node of an exported file, as ``(path, kind, track_refs)``."""
    return [
        (node.rekordbox_path, node.kind, tuple(node.track_refs))
        for node in iter_playlist_nodes(str(path))
    ]


def _cuepoint_nodes(path: Path) -> list:
    """Only the nodes inside CuePoint's own folder."""
    return [entry for entry in _tree_of(path) if "CuePoint" in entry[0]]


class TestTheAppendedTreeLeavesTheMirrorAlone:
    def test_the_file_differs_by_the_block_and_the_count_and_nothing_else(
        self, source: Path, destination: Path
    ):
        """The EXPORT-01 property, restated for the tree (DEC-078).

        Asserted on the bytes, and against a fully spelled-out expectation, so
        an appender that reformatted the mirror while adding to it would fail
        here rather than pass a structural comparison.
        """
        patch_collection_xml(str(source), {}, str(destination), _one_playlist("1", "2"))

        block = (
            b'\n      <NODE Name="CuePoint" Type="0" Count="1">'
            b'\n        <NODE Name="Set" Type="1" KeyType="0" Entries="2">'
            b'\n          <TRACK Key="1"/>'
            b'\n          <TRACK Key="2"/>'
            b"\n        </NODE>"
            b"\n      </NODE>"
        )
        closing = b"\n    </NODE>\n  </PLAYLISTS>"
        expected = source.read_bytes().replace(
            b'Name="ROOT" Count="1"', b'Name="ROOT" Count="2"', 1
        )
        expected = expected.replace(closing, block + closing, 1)
        assert destination.read_bytes() == expected

    @pytest.mark.parametrize(
        "fragment",
        [
            b'<NODE Type="0" Name="Gigs" Count="1">',
            b'<NODE Name="Saturday" Type="1" KeyType="0" Entries="2">',
            b'<TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>',
            b'<POSITION_MARK Name="Drop" Type="0" Start="64.025" Num="0"',
            b'<PRODUCT Name="rekordbox" Version="6.7.4" Company="AlphaTheta"/>',
            b"<!-- a decoy:",
        ],
    )
    def test_an_export_with_playlists_still_carries_everything_else(
        self, source: Path, destination: Path, fragment: bytes
    ):
        patch_collection_xml(
            str(source),
            {"1": TrackExportValues(key="Cm", bpm=130.0, rating=5)},
            str(destination),
            _one_playlist("1", "2"),
        )
        assert fragment in destination.read_bytes()

    def test_the_two_halves_happen_in_one_pass(self, source: Path, destination: Path):
        """Attributes and playlists in one call, because it is one file."""
        result = patch_collection_xml(
            str(source),
            {"2": TrackExportValues(genre="House")},
            str(destination),
            _one_playlist("1", "2"),
        )
        data = destination.read_bytes()
        # Track 2 is single-quoted in the fixture, and a patch keeps a value's
        # own quoting rather than restyling the tag around it.
        assert b"Genre='House'" in data
        assert b'<NODE Name="Set" Type="1" KeyType="0" Entries="2">' in data
        assert result.tracks_changed == 1
        assert len(result.playlists) == 1

    def test_no_playlists_means_no_folder(self, source: Path, destination: Path):
        patch_collection_xml(str(source), {}, str(destination))
        assert destination.read_bytes() == source.read_bytes()

    def test_an_empty_sequence_appends_nothing(self, source: Path, destination: Path):
        """An empty CuePoint folder in a DJ's tree is litter, not a result."""
        result = patch_collection_xml(str(source), {}, str(destination), [])
        assert destination.read_bytes() == source.read_bytes()
        assert result.playlist_folder is None
        assert result.playlists == ()


class TestTheNestingAndTheShape:
    def test_a_three_level_structure_lands_at_its_path(
        self, source: Path, destination: Path
    ):
        """DEC-059's folders are carried, not flattened."""
        tree = [
            ExportFolder(
                name="2026",
                children=(
                    ExportFolder(
                        name="Summer",
                        children=(
                            ExportPlaylist(name="Opening", track_ids=("1",)),
                            ExportPlaylist(name="Closing", track_ids=("2", "3")),
                        ),
                    ),
                ),
            ),
            ExportPlaylist(name="Loose", track_ids=("4",)),
        ]
        patch_collection_xml(str(source), {}, str(destination), tree)

        assert _cuepoint_nodes(destination) == [
            ("ROOT/CuePoint", "folder", ()),
            ("ROOT/CuePoint/2026", "folder", ()),
            ("ROOT/CuePoint/2026/Summer", "folder", ()),
            ("ROOT/CuePoint/2026/Summer/Opening", "playlist", ("1",)),
            ("ROOT/CuePoint/2026/Summer/Closing", "playlist", ("2", "3")),
            ("ROOT/CuePoint/Loose", "playlist", ("4",)),
        ]

    def test_the_node_shape_is_rekordbox_own(self, source: Path, destination: Path):
        """``Type``, ``KeyType`` and ``Key`` as the vendor writes them.

        ``Key`` is the right name on a playlist entry and the wrong one on a
        COLLECTION track, which is the distinction ``FORBIDDEN_ATTRS`` pins from
        the other side.
        """
        patch_collection_xml(
            str(source),
            {},
            str(destination),
            [ExportFolder(name="F", children=(ExportPlaylist("P", ("1",)),))],
        )
        data = destination.read_bytes()
        assert b'<NODE Name="F" Type="0" Count="1">' in data
        assert b'<NODE Name="P" Type="1" KeyType="0" Entries="1">' in data
        assert b'<TRACK Key="1"/>' in data

    def test_a_folder_count_is_its_children(self, source: Path, destination: Path):
        tree = [
            ExportFolder(
                name="Three",
                children=(
                    ExportPlaylist("A", ("1",)),
                    ExportPlaylist("B", ("2",)),
                    ExportFolder("C", (ExportPlaylist("D", ("3",)),)),
                ),
            )
        ]
        patch_collection_xml(str(source), {}, str(destination), tree)
        data = destination.read_bytes()
        assert b'<NODE Name="Three" Type="0" Count="3">' in data
        assert b'<NODE Name="CuePoint" Type="0" Count="1">' in data
        assert b'<NODE Name="C" Type="0" Count="1">' in data

    def test_an_empty_folder_closes_itself(self, source: Path, destination: Path):
        patch_collection_xml(
            str(source), {}, str(destination), [ExportFolder(name="Nothing")]
        )
        assert b'<NODE Name="Nothing" Type="0" Count="0"/>' in destination.read_bytes()

    def test_the_result_re_parses_and_is_well_formed(
        self, source: Path, destination: Path
    ):
        import xml.etree.ElementTree as ET

        patch_collection_xml(
            str(source),
            {"1": TrackExportValues(key="Cm")},
            str(destination),
            [ExportFolder("F", (ExportPlaylist("P", ("1", "2")),))],
        )
        root = ET.parse(str(destination)).getroot()
        nodes = root.findall(".//PLAYLISTS//NODE")
        assert [node.get("Name") for node in nodes] == [
            "ROOT",
            "Gigs",
            "Saturday",
            "CuePoint",
            "F",
            "P",
        ]


class TestTheEntries:
    def test_a_repeated_track_exports_twice(self, source: Path, destination: Path):
        """DEC-058 allows a reprise; the COLLECTION still holds the track once."""
        patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("1", "2", "1")
        )
        data = destination.read_bytes()
        assert b'<TRACK Key="1"/>\n          <TRACK Key="2"/>\n' in data
        assert data.count(b'<COLLECTION Entries="4">') == 1
        assert _cuepoint_nodes(destination)[-1][2] == ("1", "2", "1")

    def test_the_order_is_the_collections_own(self, source: Path, destination: Path):
        patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("3", "1", "2")
        )
        assert _cuepoint_nodes(destination)[-1][2] == ("3", "1", "2")

    def test_a_track_the_file_does_not_hold_is_dropped_and_counted(
        self, source: Path, destination: Path
    ):
        """DEC-082: the only reason an exported playlist is shorter than the
        Collection on screen, and it is reported rather than silent."""
        result = patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("1", "77", "2")
        )
        assert result.playlists[0].entry_count == 2
        assert result.playlists[0].dropped == ("77",)
        assert result.dropped_reference_count == 1
        assert b'Entries="2"' in destination.read_bytes()
        assert b'<TRACK Key="77"/>' not in destination.read_bytes()

    def test_a_blank_reference_is_dropped(self, source: Path, destination: Path):
        result = patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("1", "  ", "2")
        )
        assert result.playlists[0].dropped == ("",)
        assert result.playlists[0].entry_count == 2

    def test_entries_always_equals_the_children_written(
        self, source: Path, destination: Path
    ):
        """The likely defect in a vendor format, asserted directly."""
        import xml.etree.ElementTree as ET

        patch_collection_xml(
            str(source),
            {},
            str(destination),
            [
                ExportPlaylist("Some", ("1", "404", "2", "999", "2")),
                ExportPlaylist("None", ("404",)),
            ],
        )
        root = ET.parse(str(destination)).getroot()
        for node in root.findall(".//PLAYLISTS//NODE"):
            if node.get("Type") == "1":
                assert int(node.get("Entries")) == len(node.findall("TRACK"))
            else:
                assert int(node.get("Count")) == len(node.findall("NODE"))

    def test_the_dropped_and_the_kept_account_for_the_whole_collection(
        self, source: Path, destination: Path
    ):
        asked = ("1", "404", "2", "999", "2")
        result = patch_collection_xml(
            str(source), {}, str(destination), [ExportPlaylist("Some", asked)]
        )
        written = result.playlists[0]
        assert written.entry_count + written.dropped_count == len(asked)
        assert written.dropped == ("404", "999")

    def test_an_empty_collection_exports_as_an_empty_playlist(
        self, source: Path, destination: Path
    ):
        """The user selected it, which said something."""
        result = patch_collection_xml(
            str(source), {}, str(destination), [ExportPlaylist("Nothing Yet", ())]
        )
        assert (
            b'<NODE Name="Nothing Yet" Type="1" KeyType="0" Entries="0"/>'
            in destination.read_bytes()
        )
        assert result.playlists[0].entry_count == 0

    def test_a_legacy_id_track_is_a_reference_like_any_other(
        self, source: Path, destination: Path
    ):
        """Both halves read identity the same way: ``TrackID or ID or Key``."""
        result = patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("4")
        )
        assert result.playlists[0].dropped == ()
        assert b'<TRACK Key="4"/>' in destination.read_bytes()

    def test_a_track_whose_file_is_gone_is_still_exported(
        self, source: Path, destination: Path
    ):
        """DEC-088. "The file is gone" and "the XML has no such track" are
        different facts, and only the second can dangle a reference — so the
        export never consults the filesystem to decide what to write."""
        assert b'Location="file://localhost/C:/Music/one.mp3"' in source.read_bytes()
        assert not Path("C:/Music/one.mp3").exists()

        result = patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("1")
        )
        assert result.playlists[0].entry_count == 1
        assert result.playlists[0].dropped == ()


class TestTheParentFolder:
    @staticmethod
    def _with_existing(tmp_path: Path, *names: str) -> Path:
        nodes = "".join(
            f'\n      <NODE Type="0" Name="{name}" Count="0"/>' for name in names
        )
        document = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<DJ_PLAYLISTS>\n"
            "  <COLLECTION>\n"
            '    <TRACK TrackID="1" Name="One"/>\n'
            "  </COLLECTION>\n"
            "  <PLAYLISTS>\n"
            f'    <NODE Type="0" Name="ROOT" Count="{len(names)}">{nodes}\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n"
        )
        path = tmp_path / "existing.xml"
        _write_xml(path, document)
        return path

    def test_an_existing_folder_of_that_name_is_never_merged_into(self, tmp_path: Path):
        """It may be the user's own, holding work this export must not touch."""
        source = self._with_existing(tmp_path, "CuePoint")
        out = tmp_path / "out.xml"

        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        assert result.playlist_folder == "CuePoint (2)"
        assert result.playlist_folder_renamed is True
        data = out.read_bytes()
        assert b'<NODE Type="0" Name="CuePoint" Count="0"/>' in data
        assert b'<NODE Name="CuePoint (2)" Type="0" Count="1">' in data

    def test_the_collision_check_folds_case(self, tmp_path: Path):
        """Two nodes a user cannot tell apart in the tree are a collision."""
        source = self._with_existing(tmp_path, "cuepoint")
        out = tmp_path / "out.xml"
        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert result.playlist_folder == "CuePoint (2)"

    def test_a_second_collision_goes_to_three(self, tmp_path: Path):
        source = self._with_existing(tmp_path, "CuePoint", "CuePoint (2)")
        out = tmp_path / "out.xml"
        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert result.playlist_folder == "CuePoint (3)"

    def test_no_collision_means_no_rename(self, tmp_path: Path):
        source = self._with_existing(tmp_path, "Gigs", "Archive")
        out = tmp_path / "out.xml"
        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert result.playlist_folder == CUEPOINT_FOLDER_NAME
        assert result.playlist_folder_renamed is False

    def test_a_folder_of_that_name_deeper_in_the_tree_is_not_a_collision(
        self, tmp_path: Path
    ):
        """Only the top level is looked at, because that is where ours goes."""
        document = (
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="1">\n'
            '      <NODE Type="0" Name="Gigs" Count="1">\n'
            '        <NODE Type="0" Name="CuePoint" Count="0"/>\n'
            "      </NODE>\n"
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n"
        )
        source = tmp_path / "deep.xml"
        _write_xml(source, document)
        out = tmp_path / "out.xml"

        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert result.playlist_folder == "CuePoint"
        assert result.playlist_folder_renamed is False


class TestTheRootFolderCount:
    def test_the_count_is_corrected_for_the_child_it_gained(
        self, source: Path, destination: Path
    ):
        """A folder declaring three children while holding four is a document
        that contradicts itself, and the reader that has to choose is Rekordbox."""
        assert b'Name="ROOT" Count="1"' in source.read_bytes()
        patch_collection_xml(str(source), {}, str(destination), _one_playlist("1"))
        assert b'Name="ROOT" Count="2"' in destination.read_bytes()

    def test_a_count_that_was_already_wrong_comes_out_right(self, tmp_path: Path):
        document = (
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="9">\n'
            '      <NODE Type="0" Name="Gigs" Count="0"/>\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n"
        )
        source = tmp_path / "wrong.xml"
        _write_xml(source, document)
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert b'Name="ROOT" Count="2"' in out.read_bytes()

    def test_a_root_that_never_declared_a_count_does_not_gain_one(self, tmp_path: Path):
        """Nothing is added where nothing was — the same rule as DEC-079's."""
        source = _fixture("small.xml")
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1", "2"))

        data = out.read_bytes()
        assert b'<NODE Name="ROOT">' in data
        assert (
            b"Count" not in data.split(b"<PLAYLISTS>")[1].split(b'Name="CuePoint"')[0]
        )
        assert b'<NODE Name="CuePoint" Type="0" Count="1">' in data

    def test_nothing_else_in_the_mirror_is_rewritten(
        self, source: Path, destination: Path
    ):
        """The Count is the only attribute this step writes outside its own tree."""
        patch_collection_xml(str(source), {}, str(destination), _one_playlist("1"))
        before = source.read_bytes()
        after = destination.read_bytes()
        for fragment in (
            b'<NODE Type="0" Name="Gigs" Count="1">',
            b'<NODE Name="Saturday" Type="1" KeyType="0" Entries="2">',
        ):
            assert before.count(fragment) == after.count(fragment) == 1


class TestWhereTheTreeGoesInOddDocuments:
    def test_a_self_closing_root_is_opened_into_a_pair(self, tmp_path: Path):
        """An empty Rekordbox library writes ``<NODE …ROOT" Count="0"/>``."""
        source = tmp_path / "empty_library.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="0"/>\n'
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_text(encoding="utf-8")
        # A self-closing element has no whitespace before its end, so the
        # indentation comes from the line its start tag sits on.
        assert (
            '    <NODE Type="0" Name="ROOT" Count="1">\n'
            '      <NODE Name="CuePoint" Type="0" Count="1">\n'
            '        <NODE Name="Set" Type="1" KeyType="0" Entries="1">\n'
            '          <TRACK Key="1"/>\n'
            "        </NODE>\n"
            "      </NODE>\n"
            "    </NODE>\n" in data
        )
        assert _cuepoint_nodes(out) == [
            ("ROOT/CuePoint", "folder", ()),
            ("ROOT/CuePoint/Set", "playlist", ("1",)),
        ]

    def test_an_empty_playlists_element_gets_a_root_folder(self, tmp_path: Path):
        """A tree with no root folder is not one Rekordbox reads."""
        source = tmp_path / "no_root.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS/>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_text(encoding="utf-8")
        # A self-closing element has no whitespace before its end, so the
        # indentation comes from the line its start tag sits on.
        assert (
            '    <NODE Type="0" Name="ROOT" Count="1">\n'
            '      <NODE Name="CuePoint" Type="0" Count="1">\n'
            '        <NODE Name="Set" Type="1" KeyType="0" Entries="1">\n'
            '          <TRACK Key="1"/>\n'
            "        </NODE>\n"
            "      </NODE>\n"
            "    </NODE>\n" in data
        )
        assert _tree_of(out) == [
            ("ROOT", "folder", ()),
            ("ROOT/CuePoint", "folder", ()),
            ("ROOT/CuePoint/Set", "playlist", ("1",)),
        ]

    def test_a_document_with_no_playlists_at_all_gets_both(self, tmp_path: Path):
        source = tmp_path / "collection_only.xml"
        _write_xml(
            source,
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<DJ_PLAYLISTS>\n"
            "  <COLLECTION>\n"
            '    <TRACK TrackID="1"/>\n'
            "  </COLLECTION>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_text(encoding="utf-8")
        assert "  <PLAYLISTS>\n" in data
        assert data.rstrip().endswith("</DJ_PLAYLISTS>")
        assert _tree_of(out) == [
            ("ROOT", "folder", ()),
            ("ROOT/CuePoint", "folder", ()),
            ("ROOT/CuePoint/Set", "playlist", ("1",)),
        ]

    def test_playlists_holding_playlists_directly_gets_a_sibling(self, tmp_path: Path):
        """No Rekordbox wrote this, and inventing a parent around somebody
        else's nodes would be a worse answer than sitting beside them."""
        source = tmp_path / "flat.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS>\n"
            '    <NODE Name="Loose" Type="1" KeyType="0" Entries="1">\n'
            '      <TRACK Key="1"/>\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        assert _tree_of(out) == [
            ("Loose", "playlist", ("1",)),
            ("CuePoint", "folder", ()),
            ("CuePoint/Set", "playlist", ("1",)),
        ]

    def test_the_indentation_is_read_off_the_closing_tag_when_there_is_one(
        self, tmp_path: Path
    ):
        """A start tag sharing its line says nothing about how the file indents.

        Here the document root opens on line 1 beside the declaration, so its own
        line carries no indentation to read. The whitespace before its closing tag
        does, and that is the container's real indentation.
        """
        source = _write_xml(
            tmp_path / "crowded.xml",
            '<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS>\n'
            "  <COLLECTION>\n"
            '    <TRACK TrackID="1"/>\n'
            "  </COLLECTION>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_text(encoding="utf-8")
        assert "\n  <PLAYLISTS>\n" in data
        assert '\n    <NODE Type="0" Name="ROOT" Count="1">\n' in data
        assert '\n      <NODE Name="CuePoint" Type="0" Count="1">\n' in data
        assert "\n  </PLAYLISTS>\n</DJ_PLAYLISTS>" in data

    def test_a_document_written_without_line_breaks_gets_none_either(
        self, tmp_path: Path
    ):
        """One block of pretty-printing in the middle of a single line would be
        a change to how the file is written, which is not this step's business."""
        source = tmp_path / "compact.xml"
        source.write_bytes(
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"/></COLLECTION>'
            b'<PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"></NODE>'
            b"</PLAYLISTS></DJ_PLAYLISTS>"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_bytes()
        assert b"\n" not in data
        assert (
            b'<NODE Type="0" Name="ROOT" Count="1"><NODE Name="CuePoint" Type="0"'
            b' Count="1"><NODE Name="Set" Type="1" KeyType="0" Entries="1">'
            b'<TRACK Key="1"/></NODE></NODE></NODE>' in data
        )

    def test_tab_indentation_is_matched(self, tmp_path: Path):
        source = tmp_path / "tabs.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n"
            '\t<COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "\t<PLAYLISTS>\n"
            '\t\t<NODE Type="0" Name="ROOT" Count="0">\n'
            "\t\t</NODE>\n"
            "\t</PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_text(encoding="utf-8")
        assert '\n\t\t\t<NODE Name="CuePoint" Type="0" Count="1">\n' in data
        assert '\n\t\t\t\t<NODE Name="Set" Type="1" KeyType="0" Entries="1">\n' in data
        assert '\n\t\t\t\t\t<TRACK Key="1"/>\n' in data

    def test_windows_line_endings_are_matched(self, tmp_path: Path):
        source = tmp_path / "crlf.xml"
        source.write_bytes(
            b"<DJ_PLAYLISTS>\r\n"
            b'  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\r\n'
            b"  <PLAYLISTS>\r\n"
            b'    <NODE Type="0" Name="ROOT" Count="0">\r\n'
            b"    </NODE>\r\n"
            b"  </PLAYLISTS>\r\n"
            b"</DJ_PLAYLISTS>\r\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_bytes()
        assert b'\r\n      <NODE Name="CuePoint" Type="0" Count="1">\r\n' in data
        assert data.count(b"\n") == data.count(b"\r\n")


class TestTheByteScanOnTheContainerItself:
    def test_a_bracket_inside_the_root_folders_name_does_not_end_its_tag(
        self, tmp_path: Path
    ):
        """``>`` needs no escaping inside an attribute value, so a document may
        legally hold one — and a scan that looked for the first ``>`` after the
        element name would splice into the middle of a tag."""
        source = _write_xml(
            tmp_path / "bracket.xml",
            "<DJ_PLAYLISTS>\n"
            '  <COLLECTION><TRACK TrackID="1"/></COLLECTION>\n'
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="A>B" Count="0">\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))

        data = out.read_bytes()
        assert b'<NODE Type="0" Name="A>B" Count="1">' in data
        assert _cuepoint_nodes(out) == [
            ("A>B/CuePoint", "folder", ()),
            ("A>B/CuePoint/Set", "playlist", ("1",)),
        ]

    def test_a_document_whose_playlists_come_first_still_patches_both(
        self, tmp_path: Path
    ):
        """The splices then run in the other direction, which is the case the
        ordering in ``_write_atomically`` exists for."""
        source = _write_xml(
            tmp_path / "reversed.xml",
            "<DJ_PLAYLISTS>\n"
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="0">\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "  <COLLECTION>\n"
            '    <TRACK TrackID="1" Tonality="Am"/>\n'
            "  </COLLECTION>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        result = patch_collection_xml(
            str(source),
            {"1": TrackExportValues(key="Cm", year=2024)},
            str(out),
            _one_playlist("1"),
        )

        data = out.read_bytes()
        assert b'<TRACK TrackID="1" Tonality="Cm" Year="2024"/>' in data
        assert b'<NODE Name="Set" Type="1" KeyType="0" Entries="1">' in data
        assert result.tracks_changed == 1
        assert result.playlists[0].entry_count == 1


class TestNamesAsTheyAreWritten:
    def test_a_name_carrying_xml_syntax_is_escaped(
        self, source: Path, destination: Path
    ):
        patch_collection_xml(
            str(source),
            {},
            str(destination),
            [ExportPlaylist('Rock & <Roll> "Mix"', ("1",))],
        )
        data = destination.read_bytes()
        assert b'Name="Rock &amp; &lt;Roll> &quot;Mix&quot;"' in data
        assert _cuepoint_nodes(destination)[-1][0].endswith('Rock & <Roll> "Mix"')

    def test_a_non_ascii_name_in_an_ascii_document_becomes_references(
        self, tmp_path: Path
    ):
        source = tmp_path / "ascii.xml"
        source.write_bytes(
            b'<?xml version="1.0" encoding="us-ascii"?>\n'
            b'<DJ_PLAYLISTS><COLLECTION><TRACK TrackID="1"/></COLLECTION>'
            b'<PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>'
            b"</DJ_PLAYLISTS>\n"
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(
            str(source), {}, str(out), [ExportPlaylist("Bj\u00f6rk Night", ("1",))]
        )

        data = out.read_bytes()
        assert data.isascii()
        assert b"Bj&#246;rk Night" in data
        assert _cuepoint_nodes(out)[-1][0].endswith("Bj\u00f6rk Night")

    def test_a_newline_in_a_name_becomes_the_space_it_would_be_read_as(
        self, source: Path, destination: Path
    ):
        """Legal in an attribute value, but every parser turns it into a space,
        so it becomes one here instead of appearing to survive."""
        result = patch_collection_xml(
            str(source), {}, str(destination), [ExportPlaylist("Two\nLines", ("1",))]
        )
        assert result.playlists[0].name == "Two Lines"
        assert b'Name="Two Lines"' in destination.read_bytes()

    def test_a_name_is_trimmed_because_every_reader_of_one_trims_it(
        self, source: Path, destination: Path
    ):
        """``_playlist_node_from_element`` strips a name it reads, so writing the
        spaces would put something in the file that nobody ever sees."""
        result = patch_collection_xml(
            str(source), {}, str(destination), [ExportPlaylist("  Padded  ", ("1",))]
        )
        assert result.playlists[0].name == "Padded"
        assert result.playlists[0].path == "CuePoint/Padded"
        assert b'Name="Padded"' in destination.read_bytes()
        assert _cuepoint_nodes(destination)[-1][0] == "ROOT/CuePoint/Padded"

    def test_a_character_xml_cannot_represent_is_dropped(
        self, source: Path, destination: Path
    ):
        """The promise this module makes is a well-formed file."""
        result = patch_collection_xml(
            str(source), {}, str(destination), [ExportPlaylist("Bell\x07Name", ("1",))]
        )
        assert result.playlists[0].name == "BellName"
        assert b'Name="BellName"' in destination.read_bytes()
        assert b"\x07" not in destination.read_bytes()

    def test_the_reported_path_is_what_a_reader_will_see(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source),
            {},
            str(destination),
            [ExportFolder("Gigs", (ExportPlaylist("Sat", ("1",)),))],
        )
        assert result.playlists[0].path == "CuePoint/Gigs/Sat"

    def test_the_reported_path_carries_a_renamed_folder(self, tmp_path: Path):
        source = TestTheParentFolder._with_existing(tmp_path, "CuePoint")
        out = tmp_path / "out.xml"
        result = patch_collection_xml(str(source), {}, str(out), _one_playlist("1"))
        assert result.playlists[0].path == "CuePoint (2)/Set"


class TestWhatTheAppendReports:
    def test_every_playlist_is_reported_once_in_document_order(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source),
            {},
            str(destination),
            [
                ExportFolder("F", (ExportPlaylist("A", ("1",)),)),
                ExportPlaylist("B", ("2",)),
            ],
        )
        assert [playlist.path for playlist in result.playlists] == [
            "CuePoint/F/A",
            "CuePoint/B",
        ]

    def test_the_callers_own_token_comes_back(self, source: Path, destination: Path):
        """Two Collections in different folders may share a name, so EXPORT-05
        cannot match its rows on one."""
        result = patch_collection_xml(
            str(source),
            {},
            str(destination),
            [
                ExportFolder("Left", (ExportPlaylist("Set", ("1",), ref="11"),)),
                ExportFolder("Right", (ExportPlaylist("Set", ("2",), ref="22"),)),
            ],
        )
        assert [(p.name, p.ref) for p in result.playlists] == [
            ("Set", "11"),
            ("Set", "22"),
        ]
        assert b"ref" not in destination.read_bytes()

    def test_the_dropped_count_sums_across_playlists(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(
            str(source),
            {},
            str(destination),
            [
                ExportPlaylist("A", ("1", "51")),
                ExportPlaylist("B", ("52", "53", "2")),
            ],
        )
        assert result.dropped_reference_count == 3
        assert [p.dropped_count for p in result.playlists] == [1, 2]

    def test_an_export_that_only_added_playlists_still_counts_as_changed(
        self, source: Path, destination: Path
    ):
        """A library nobody has overridden still exports something (DEC-079)."""
        result = patch_collection_xml(
            str(source), {}, str(destination), _one_playlist("1")
        )
        assert result.tracks_changed == 0
        assert result.changed is True

    def test_an_export_that_changed_nothing_at_all_says_so(
        self, source: Path, destination: Path
    ):
        result = patch_collection_xml(str(source), {}, str(destination))
        assert result.changed is False
        assert result.dropped_reference_count == 0


class TestItRefusesATreeItCannotWrite:
    def _nest(self, depth: int):
        node = ExportPlaylist("Deep", ("1",))
        for level in range(depth):
            node = ExportFolder(f"L{level}", (node,))
        return [node]

    def test_a_tree_deeper_than_the_limit_is_refused_by_name(
        self, source: Path, destination: Path
    ):
        """A RecursionError from inside a splice is not a usable failure."""
        with pytest.raises(ValidationError, match="levels deep"):
            patch_collection_xml(
                str(source), {}, str(destination), self._nest(MAX_EXPORT_DEPTH + 2)
            )

    def test_a_refusal_leaves_no_destination_behind(
        self, source: Path, destination: Path
    ):
        with pytest.raises(ValidationError):
            patch_collection_xml(
                str(source), {}, str(destination), self._nest(MAX_EXPORT_DEPTH + 2)
            )
        assert not destination.exists()

    def test_a_tree_within_the_limit_is_written(self, source: Path, destination: Path):
        """``MAX_COLLECTION_DEPTH`` is 8, so the limit is slack rather than a
        ceiling a user can reach by filing things."""
        patch_collection_xml(
            str(source), {}, str(destination), self._nest(MAX_EXPORT_DEPTH - 2)
        )
        assert b'<NODE Name="Deep" Type="1" KeyType="0" Entries="1">' in (
            destination.read_bytes()
        )


class TestALargeTree:
    def test_a_long_playlist_is_written_whole_and_in_order(self, tmp_path: Path):
        """A four-entry fixture can hide an off-by-one in the splice."""
        tracks = "".join(
            f'\n    <TRACK TrackID="{n}" Name="T{n}"/>' for n in range(1, 2001)
        )
        source = tmp_path / "big.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n"
            f"  <COLLECTION>{tracks}\n  </COLLECTION>\n"
            "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="0">\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"
        asked = tuple(str(n) for n in range(2000, 0, -1)) + ("9999",)

        result = patch_collection_xml(
            str(source), {}, str(out), [ExportPlaylist("Everything", asked)]
        )

        assert result.playlists[0].entry_count == 2000
        assert result.playlists[0].dropped == ("9999",)
        refs = _cuepoint_nodes(out)[-1][2]
        assert refs == tuple(str(n) for n in range(2000, 0, -1))

    def test_the_collection_half_is_untouched_by_a_large_append(self, tmp_path: Path):
        tracks = "".join(
            f'\n    <TRACK TrackID="{n}" Name="T{n}"/>' for n in range(1, 501)
        )
        collection = f"  <COLLECTION>{tracks}\n  </COLLECTION>\n"
        source = tmp_path / "big.xml"
        _write_xml(
            source,
            "<DJ_PLAYLISTS>\n" + collection + "  <PLAYLISTS>\n"
            '    <NODE Type="0" Name="ROOT" Count="0">\n'
            "    </NODE>\n"
            "  </PLAYLISTS>\n"
            "</DJ_PLAYLISTS>\n",
        )
        out = tmp_path / "out.xml"

        patch_collection_xml(
            str(source),
            {},
            str(out),
            [ExportPlaylist("All", tuple(str(n) for n in range(1, 501)))],
        )

        assert collection.encode("utf-8") in out.read_bytes()
