#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading each track's cue points and beat grid from the XML (WAVE-04, DEC-118).

The reader is the one place Rekordbox's vocabulary is interpreted, so its
tests are the specification's table, case by case: every ``Type`` and ``Num``,
loops with their ``End``, colours, times to the millisecond, a variable grid's
order, and every way a mark can be refused — skipped and counted, never raised
and never stored under a guess.

Two paths read a cue. The inline one, for a cue in exactly the form Rekordbox
writes, is what keeps a 50,000-track read inside its budget; the full one,
:func:`read_cue`, decides everything else. A property test holds that the
inline path never reads a value the full one would read differently.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from cuepoint.data.rekordbox import iter_collection_entries, iter_collection_tracks
from cuepoint.data.rekordbox_marks import (
    read_cue,
    read_tempo,
    read_track_marks,
    seconds_to_ms,
)
from cuepoint.models.track_marks import MAX_MARK_MS, NO_MARKS, ReadMarks

pytestmark = pytest.mark.unit

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "rekordbox" / "marks.xml"


def track(*children: str) -> ET.Element:
    """A ``COLLECTION/TRACK`` element with these children."""
    return ET.fromstring(f'<TRACK TrackID="1" Name="T">{"".join(children)}</TRACK>')


def mark(**attrs: str) -> str:
    return "<POSITION_MARK " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + "/>"


def tempo(**attrs: str) -> str:
    return "<TEMPO " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + "/>"


def cues_of(*children: str) -> ReadMarks:
    return read_track_marks(track(*children))


# ----------------------------------------------------------------- the table


class TestPositionMarks:
    @pytest.mark.parametrize(
        "type_, kind",
        [
            ("0", "cue"),
            ("1", "fade_in"),
            ("2", "fade_out"),
            ("3", "load"),
            ("4", "loop"),
        ],
    )
    def test_every_type_maps_to_its_kind(self, type_, kind):
        read = cues_of(mark(Type=type_, Start="1.000", Num="-1"))
        assert read.cues[0][0] == kind
        assert read.skipped == 0

    @pytest.mark.parametrize(
        "num, slot", [("-1", None), *[(str(n), n) for n in range(8)]]
    )
    def test_every_num_maps_to_its_slot(self, num, slot):
        read = cues_of(mark(Type="0", Start="1.000", Num=num))
        assert read.cues[0][1] == slot

    def test_a_loop_keeps_its_end(self):
        read = cues_of(mark(Type="4", Start="120.025", End="127.525", Num="2"))
        assert read.cues == (("loop", 2, 120025, 127525, None, None),)

    def test_a_memory_loop_keeps_its_end(self):
        read = cues_of(mark(Type="4", Start="1.000", End="2.000", Num="-1"))
        assert read.cues == (("loop", None, 1000, 2000, None, None),)

    def test_an_empty_end_is_no_end(self):
        """Rekordbox writes every attribute, empty where unused."""
        read = cues_of(mark(Type="0", Start="1.000", End="", Num="-1"))
        assert read.cues == (("cue", None, 1000, None, None, None),)

    def test_the_whole_mark(self):
        read = cues_of(
            mark(
                Name="Drop",
                Type="0",
                Start="64.025",
                Num="0",
                Red="40",
                Green="226",
                Blue="20",
            )
        )
        assert read == ReadMarks(cues=(("cue", 0, 64025, None, "Drop", "#28e214"),))

    def test_the_name_is_kept_as_written(self):
        read = cues_of(
            mark(Type="0", Start="1.000", Num="-1", Name="  Break &amp; Build ")
        )
        assert read.cues[0][4] == "  Break & Build "

    def test_an_empty_name_is_no_name(self):
        assert (
            cues_of(mark(Type="0", Start="1.000", Num="-1", Name="")).cues[0][4] is None
        )

    def test_marks_keep_the_order_rekordbox_wrote_them_in(self):
        read = cues_of(
            mark(Type="0", Start="90.000", Num="1"),
            mark(Type="0", Start="10.000", Num="-1"),
            mark(Type="0", Start="50.000", Num="0"),
        )
        assert [c[2] for c in read.cues] == [90000, 10000, 50000]


class TestColours:
    @pytest.mark.parametrize(
        "rgb, colour",
        [
            (("40", "226", "20"), "#28e214"),
            (("0", "0", "0"), "#000000"),
            (("255", "255", "255"), "#ffffff"),
            (("230", "40", "40"), "#e62828"),
        ],
    )
    def test_three_channels_become_rrggbb(self, rgb, colour):
        r, g, b = rgb
        read = cues_of(mark(Type="0", Start="1.000", Num="0", Red=r, Green=g, Blue=b))
        assert read.cues[0][5] == colour

    @pytest.mark.parametrize(
        "channels",
        [
            {"Red": "40", "Green": "226"},
            {"Green": "226", "Blue": "20"},
            {"Red": "40"},
            {},
        ],
    )
    def test_a_colour_needs_all_three(self, channels):
        read = cues_of(mark(Type="0", Start="1.000", Num="0", **channels))
        assert read.cues[0][5] is None

    @pytest.mark.parametrize(
        "channels",
        [
            {"Red": "256", "Green": "0", "Blue": "0"},
            {"Red": "-1", "Green": "0", "Blue": "0"},
            {"Red": "red", "Green": "0", "Blue": "0"},
            {"Red": "", "Green": "0", "Blue": "0"},
        ],
    )
    def test_an_unreadable_colour_is_left_off_and_the_cue_kept(self, channels):
        read = cues_of(mark(Type="0", Start="1.000", Num="0", **channels))
        assert read.cues[0][5] is None
        assert read.skipped == 0


class TestTimes:
    @pytest.mark.parametrize(
        "text, ms",
        [
            ("0.000", 0),
            ("0.025", 25),
            ("64.025", 64025),
            ("1.5", 1500),
            ("2", 2000),
            ("120", 120000),
            ("32.0005", 32001),  # half up
            ("32.0004", 32000),
            ("180.0254", 180025),
            ("181.9996", 182000),
            ("0.0005", 1),
            ("1e1", 10000),
            ("-0.000", 0),
            (" 1.000", 1000),
        ],
    )
    def test_seconds_become_whole_milliseconds_rounded_half_up(self, text, ms):
        assert seconds_to_ms(text) == ms

    @pytest.mark.parametrize(
        "text",
        [None, "", "-1.000", "-0.5", "nan", "inf", "-inf", "1.2.3", "abc", "1,000"],
    )
    def test_no_time_is_refused(self, text):
        assert seconds_to_ms(text) is None

    def test_the_last_millisecond_is_kept_and_the_next_refused(self):
        assert seconds_to_ms(f"{MAX_MARK_MS / 1000:.3f}") == MAX_MARK_MS
        assert seconds_to_ms(f"{(MAX_MARK_MS + 1) / 1000:.3f}") is None
        assert seconds_to_ms("1e300") is None

    @given(st.integers(min_value=0, max_value=MAX_MARK_MS))
    @settings(max_examples=2000, deadline=None)
    def test_rekordbox_s_three_decimals_are_exact_at_every_millisecond(self, ms):
        assert seconds_to_ms(f"{ms // 1000}.{ms % 1000:03d}") == ms


class TestRefused:
    @pytest.mark.parametrize(
        "attrs",
        [
            {
                "Type": "5",
                "Start": "1.000",
                "Num": "-1",
            },  # a kind CuePoint does not know
            {"Type": "", "Start": "1.000", "Num": "-1"},
            {"Start": "1.000", "Num": "-1"},  # no Type
            {"Type": "0", "Start": "1.000", "Num": "8"},  # no ninth hot cue
            {"Type": "0", "Start": "1.000", "Num": "-2"},
            {"Type": "0", "Start": "1.000"},  # no Num
            {"Type": "0", "Num": "-1"},  # no Start
            {"Type": "0", "Start": "", "Num": "-1"},
            {"Type": "0", "Start": "-1.000", "Num": "-1"},  # negative
            {"Type": "4", "Start": "50.000", "End": "40.000", "Num": "-1"},  # backwards
            {
                "Type": "4",
                "Start": "50.000",
                "End": "50.000",
                "Num": "-1",
            },  # empty loop
            {"Type": "4", "Start": "50.0001", "End": "50.0004", "Num": "-1"},  # one ms
            {"Type": "4", "Start": "50.000", "End": "soon", "Num": "-1"},
        ],
    )
    def test_a_mark_cuepoint_cannot_read_is_skipped_and_counted(self, attrs):
        read = cues_of(mark(**attrs), mark(Type="0", Start="9.000", Num="-1"))
        assert read.skipped == 1
        assert read.cues == (("cue", None, 9000, None, None, None),)

    @pytest.mark.parametrize(
        "attrs",
        [
            {"Inizio": "0.025", "Bpm": "0"},
            {"Inizio": "0.025", "Bpm": "-128.00"},
            {"Inizio": "0.025", "Bpm": ""},
            {"Inizio": "0.025"},
            {"Inizio": "0.025", "Bpm": "nan"},
            {"Inizio": "0.025", "Bpm": "inf"},
            {"Inizio": "0.025", "Bpm": "fast"},
            {"Bpm": "128.00"},
            {"Inizio": "-1.000", "Bpm": "128.00"},
            {"Inizio": "0.025", "Bpm": "128.00", "Battito": "5"},
            {"Inizio": "0.025", "Bpm": "128.00", "Battito": "0"},
            {"Inizio": "0.025", "Bpm": "128.00", "Battito": "one"},
        ],
    )
    def test_a_grid_marker_cuepoint_cannot_read_is_skipped_and_counted(self, attrs):
        read = cues_of(tempo(**attrs))
        assert read == ReadMarks(skipped=1)

    def test_whole_numbers_written_another_way_are_still_read(self):
        read = cues_of(
            mark(Type="0.0", Start="1.000", Num=" 1"),
            tempo(Inizio="0.000", Bpm="128", Battito="1.0"),
        )
        assert read.cues[0][:2] == ("cue", 1)
        assert read.grid == ((0, 128.0, None, 1),)
        assert read.skipped == 0


class TestTheGrid:
    def test_a_marker_s_every_value(self):
        read = cues_of(tempo(Inizio="0.025", Bpm="128.00", Metro="4/4", Battito="1"))
        assert read.grid == ((25, 128.0, "4/4", 1),)

    def test_a_variable_grid_keeps_its_order(self):
        read = cues_of(
            tempo(Inizio="120.120", Bpm="124.00", Metro="4/4", Battito="1"),
            tempo(Inizio="0.120", Bpm="121.00", Metro="4/4", Battito="1"),
            tempo(Inizio="60.120", Bpm="122.50", Metro="4/4", Battito="3"),
        )
        assert [m[:2] for m in read.grid] == [
            (120120, 124.0),
            (120, 121.0),
            (60120, 122.5),
        ]

    def test_the_meter_is_kept_as_written_and_an_empty_one_is_none(self):
        assert cues_of(tempo(Inizio="0", Bpm="90", Metro="3/4")).grid[0][2] == "3/4"
        assert cues_of(tempo(Inizio="0", Bpm="90", Metro="")).grid[0][2] is None

    def test_no_beat_is_none(self):
        assert cues_of(tempo(Inizio="0", Bpm="90")).grid[0][3] is None


class TestATrack:
    def test_with_no_marks_has_none_and_shares_the_empty_value(self):
        assert read_track_marks(track()) is NO_MARKS
        assert read_track_marks(ET.fromstring('<TRACK TrackID="1"/>')) is NO_MARKS

    def test_other_children_are_not_marks(self):
        read = cues_of(
            "<SOMETHING_NEW Start='1.000'/>", mark(Type="0", Start="1.000", Num="-1")
        )
        assert len(read.cues) == 1
        assert read.skipped == 0

    def test_marks_and_grid_together(self):
        read = cues_of(
            tempo(Inizio="0.025", Bpm="128.00", Metro="4/4", Battito="1"),
            mark(Type="0", Start="0.025", Num="-1", Name="Intro"),
            mark(Type="9", Start="0.025", Num="-1"),
        )
        assert len(read.cues) == 1 and len(read.grid) == 1 and read.skipped == 1


# ------------------------------------------------- the inline path, held equal

_TYPES = st.sampled_from(["0", "1", "2", "3", "4", "5", "-1", "0.0", " 1", "x", ""])
_NUMS = st.sampled_from(["-1", "0", "3", "7", "8", "-2", "1.0", " 2", "a", ""])
_STARTS = st.one_of(
    st.integers(min_value=0, max_value=MAX_MARK_MS + 2000).map(
        lambda ms: f"{ms // 1000}.{ms % 1000:03d}"
    ),
    st.decimals(
        min_value=-10, max_value=10_000, allow_nan=False, allow_infinity=False, places=4
    ).map(str),
    st.sampled_from(
        ["1", "12", "123", "1e3", "nan", "inf", "-1.000", "1_0.000", "", "x.yzw"]
    ),
)
_CHANNELS = st.one_of(
    st.none(), st.sampled_from(["0", "40", "255", "256", "-1", "x", ""])
)


@st.composite
def _cue_attrs(draw) -> Dict[str, str]:
    attrs: Dict[str, Optional[str]] = {
        "Type": draw(st.one_of(st.none(), _TYPES)),
        "Num": draw(st.one_of(st.none(), _NUMS)),
        "Start": draw(st.one_of(st.none(), _STARTS)),
        "End": draw(st.one_of(st.none(), st.just(""), _STARTS)),
        "Name": draw(st.one_of(st.none(), st.text(max_size=8))),
        "Red": draw(_CHANNELS),
        "Green": draw(_CHANNELS),
        "Blue": draw(_CHANNELS),
    }
    return {k: v for k, v in attrs.items() if v is not None}


class TestTheInlinePath:
    @given(_cue_attrs())
    @settings(max_examples=3000, deadline=None)
    def test_it_reads_every_cue_exactly_as_read_cue_does(self, attrs):
        elem = ET.Element("TRACK")
        ET.SubElement(elem, "POSITION_MARK", attrs)
        read = read_track_marks(elem)
        expected = read_cue(attrs.get)
        if expected is None:
            assert read == ReadMarks(skipped=1)
        else:
            assert read == ReadMarks(cues=(expected,))

    @given(
        st.fixed_dictionaries(
            {},
            optional={
                "Inizio": _STARTS,
                "Bpm": st.sampled_from(["128.00", "0", "-1", "", "nan", "90", "x"]),
                "Metro": st.sampled_from(["4/4", "", "3/4"]),
                "Battito": st.sampled_from(["1", "4", "5", "", "2.0"]),
            },
        )
    )
    @settings(max_examples=500, deadline=None)
    def test_a_grid_marker_is_read_as_read_tempo_reads_it(self, attrs):
        elem = ET.Element("TRACK")
        ET.SubElement(elem, "TEMPO", attrs)
        expected = read_tempo(attrs.get)
        read = read_track_marks(elem)
        assert read == (
            ReadMarks(skipped=1) if expected is None else ReadMarks(grid=(expected,))
        )


# ------------------------------------------------------- through the iterator


def write(tmp_path: Path, tracks: List[str]) -> str:
    path = tmp_path / "collection.xml"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">'
        f'<COLLECTION Entries="{len(tracks)}">{"".join(tracks)}</COLLECTION>'
        '<PLAYLISTS><NODE Type="0" Name="ROOT" Count="1">'
        '<NODE Name="P" Type="1" KeyType="0" Entries="1"><TRACK Key="1"/></NODE>'
        "</NODE></PLAYLISTS></DJ_PLAYLISTS>",
        encoding="utf-8",
    )
    return str(path)


class TestTheCollection:
    def test_each_track_comes_with_its_own_marks(self):
        entries = {
            t.rekordbox_track_id: m for t, m in iter_collection_entries(str(FIXTURE))
        }
        assert set(entries) == {"101", "102", "103", "104", "105"}
        assert len(entries["101"].cues) == 9
        assert len(entries["102"].grid) == 3
        assert entries["103"].skipped == 6
        assert entries["104"] is NO_MARKS
        assert entries["105"].cues == () and len(entries["105"].grid) == 1

    def test_the_fixture_reads_as_its_table_says(self):
        entries = {
            t.rekordbox_track_id: m for t, m in iter_collection_entries(str(FIXTURE))
        }
        assert entries["101"].cues == (
            ("cue", None, 25, None, "Intro", None),
            ("cue", 0, 64025, None, "Drop", "#28e214"),
            ("cue", 1, 96025, None, None, "#e62828"),
            ("loop", 2, 120025, 127525, "Build loop", "#ff8c00"),
            ("loop", None, 180025, 182000, None, None),
            ("fade_in", None, 1500, None, "Fade in", None),
            ("fade_out", None, 360250, None, "Fade out", None),
            ("load", None, 32001, None, "Load here", None),
            ("cue", 7, 300000, None, "H cue", None),
        )
        assert entries["102"].grid == (
            (120, 121.0, "4/4", 1),
            (60120, 122.5, "4/4", 3),
            (120120, 124.0, "4/4", 1),
        )
        assert entries["103"].cues == (("cue", None, 20000, None, "Kept", None),)
        assert entries["103"].grid == ((50, 130.0, "4/4", 1),)

    def test_the_tracks_are_the_ones_the_track_reader_reads(self):
        def values(track) -> dict:
            # When a value was made is the one thing two reads differ in.
            data = track.to_dict()
            data.pop("created_at")
            data.pop("updated_at")
            return data

        with_marks = [values(t) for t, _ in iter_collection_entries(str(FIXTURE))]
        assert with_marks == [values(t) for t in iter_collection_tracks(str(FIXTURE))]

    def test_a_playlist_s_track_references_are_not_tracks(self, tmp_path):
        path = write(
            tmp_path,
            [
                '<TRACK TrackID="1" Name="A">'
                + mark(Type="0", Start="1.000", Num="0")
                + "</TRACK>"
            ],
        )
        entries = list(iter_collection_entries(path))
        assert [t.rekordbox_track_id for t, _ in entries] == ["1"]

    def test_a_track_without_an_id_is_skipped_with_its_marks(self, tmp_path):
        path = write(
            tmp_path,
            [
                '<TRACK Name="No id">'
                + mark(Type="0", Start="1.000", Num="0")
                + "</TRACK>",
                '<TRACK TrackID="2" Name="B"/>',
            ],
        )
        assert [
            (t.rekordbox_track_id, m) for t, m in iter_collection_entries(path)
        ] == [("2", NO_MARKS)]

    def test_a_missing_file_raises_as_the_track_reader_does(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            list(iter_collection_entries(str(tmp_path / "nope.xml")))
