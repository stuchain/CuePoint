#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set written as text, CSV and M3U8 (PREP-06, DEC-110).

- **Golden files**: each form, byte for byte, for a Set with a repeat, an empty
  chapter, a missing length, a missing file, a non-ASCII title, a title and a
  note beginning with ``=``, and a title broken over two lines.
- **The M3U8 reads back** through ``parse_m3u`` with the same paths, titles and
  artists in the same order.
- **The CSV reads back** through ``csv`` with every column, and no cell a
  spreadsheet would run.
- **The write** is atomic: a stopped or failed write leaves nothing at the
  destination and no temporary file.

The golden files are ``src/tests/fixtures/set_lists``, marked ``-text`` so git
never rewrites their line endings. To write them again after a deliberate
change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest src/tests/unit/data/test_set_list_file.py

and read the diff before committing it.
"""

from __future__ import annotations

import csv
import io
import os
from pathlib import Path
from typing import List

import pytest

from cuepoint.data.playlist_file import parse_m3u
from cuepoint.data.set_list_file import (
    CSV_COLUMNS,
    EXTENSIONS,
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FORMAT_CSV,
    FORMAT_M3U8,
    FORMAT_TEXT,
    FORMATS,
    SetList,
    SetListCancelled,
    SetListChapter,
    SetListRow,
    display_title,
    encoded,
    form_of,
    render,
    render_csv,
    render_m3u8,
    render_text,
    write_set_list,
)

pytestmark = pytest.mark.unit

GOLDEN = Path(__file__).resolve().parents[2] / "fixtures" / "set_lists"
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"
#: Where the golden Set's files are. Fixed, so the golden files are the same on
#: every system; a set list only names these paths.
GOLDEN_MUSIC = "/music"
#: An absolute folder on this system, for reading an M3U8 back: from Python
#: 3.13 on Windows, a path with no drive is relative, and a reader resolves it.
MUSIC = "C:/Music" if os.name == "nt" else "/music"


def friday(music: str = GOLDEN_MUSIC) -> SetList:
    """Warm-up (two), an empty unnamed chapter, and Peak (a repeat and more)."""
    rej = f"{music}/Âme - Rej.mp3"
    return SetList(
        name="Friday at Tresor",
        chapters=(
            SetListChapter(0, "Warm-up"),
            SetListChapter(1, ""),
            SetListChapter(2, "Peak"),
        ),
        rows=(
            SetListRow(
                position=0,
                chapter=0,
                starts_at=0,
                out_seconds=240,
                planned_seconds=240,
                artist="Âme",
                title="Rej (Original Mix)",
                bpm=122.5,
                key="8A",
                length_seconds=300,
                file_path=rej,
                file_status=FILE_PRESENT,
            ),
            SetListRow(
                position=1,
                chapter=0,
                starts_at=240,
                in_seconds=30,
                out_seconds=330,
                planned_seconds=300,
                artist="Dixon",
                title="=Formula Track",
                remixer="Kerri Chandler",
                bpm=124.0,
                key="9A",
                length_seconds=None,
                file_path=f"{music}/Dixon - Formula.flac",
                file_status=FILE_MISSING,
                note="=cmd|' /C calc'!A0",
            ),
            SetListRow(
                position=2,
                chapter=2,
                starts_at=540,
                artist="Âme",
                title="Rej (Original Mix)",
                bpm=122.5,
                key="8A",
                length_seconds=300,
                file_path=rej,
                file_status=FILE_PRESENT,
            ),
            SetListRow(
                position=3,
                chapter=2,
                starts_at=None,
                in_seconds=15,
                artist="Kraftwerk",
                title="Das  Model\n(Remastered)",
                bpm=None,
                key=None,
                length_seconds=400,
                file_path=f"{music}/Kraftwerk - Das Model.wav",
                file_status=FILE_NOT_CHECKED,
                note="Bring the lights down",
            ),
        ),
        running_seconds=540,
        untimed=2,
    )


def one_list(rows: int = 3) -> SetList:
    """A Set that never used chapters: its one unnamed chapter."""
    return SetList(
        name="Plain",
        chapters=(SetListChapter(0, ""),),
        rows=tuple(
            SetListRow(
                position=i,
                chapter=0,
                artist=f"A{i}",
                title=f"T{i}",
                file_path=f"{MUSIC}/{i}.mp3",
            )
            for i in range(rows)
        ),
        untimed=rows,
    )


# ------------------------------------------------------------------ golden


@pytest.mark.parametrize(
    ("form", "name"),
    [
        (FORMAT_TEXT, "friday.txt"),
        (FORMAT_CSV, "friday.csv"),
        (FORMAT_M3U8, "friday.m3u8"),
    ],
)
def test_each_form_against_its_golden_file(form, name):
    produced = encoded(friday(), form)
    golden = GOLDEN / name
    if WRITE:
        golden.parent.mkdir(parents=True, exist_ok=True)
        golden.write_bytes(produced)
    assert golden.read_bytes() == produced, (
        f"{name} is not what the writer produces now; write it again with"
        " CUEPOINT_WRITE_FIXTURES=1 and read the diff"
    )


def test_the_golden_files_are_kept_byte_for_byte():
    attributes = (GOLDEN / ".gitattributes").read_text(encoding="utf-8")
    assert "* -text" in attributes


# -------------------------------------------------------------------- text


class TestText:
    def test_it_reads_as_a_tracklist(self):
        assert render_text(friday()).splitlines() == [
            "Friday at Tresor",
            "Running time 9:00 (2 untimed entries not counted)",
            "",
            "Warm-up",
            "01. [0:00]  Âme – Rej (Original Mix)  (out 4:00)",
            "02. [4:00]  Dixon – =Formula Track (Kerri Chandler Remix)  (in 0:30, out 5:30)",
            "",
            "Chapter 2",
            "",
            "Peak",
            "03. [9:00]  Âme – Rej (Original Mix)",
            "04. Kraftwerk – Das Model (Remastered)  (in 0:15)",
        ]

    def test_a_set_that_never_used_chapters_has_no_headings(self):
        lines = render_text(one_list()).splitlines()
        assert lines == [
            "Plain",
            "Running time 0:00 (3 untimed entries not counted)",
            "",
            "01. A0 – T0",
            "02. A1 – T1",
            "03. A2 – T2",
        ]

    def test_one_untimed_entry_and_none(self):
        single = SetList("S", (SetListChapter(0),), (), running_seconds=3600, untimed=1)
        assert render_text(single).splitlines()[1] == (
            "Running time 1:00:00 (1 untimed entry not counted)"
        )
        timed = SetList("S", (SetListChapter(0),), (), running_seconds=90)
        assert render_text(timed).splitlines()[1] == "Running time 1:30"

    def test_numbers_are_as_wide_as_the_set(self):
        lines = render_text(one_list(120)).splitlines()
        assert lines[3].startswith("001. ") and lines[-1].startswith("120. ")

    @pytest.mark.parametrize(
        ("artist", "title", "remixer", "path", "shown"),
        [
            ("A", "T", None, "/x.mp3", "A – T"),
            (None, "T", None, "/x.mp3", "T"),
            ("A", None, None, "/x.mp3", "A"),
            (None, None, None, "/music/Lost File.mp3", "Lost File.mp3"),
            (None, None, None, "", "Untitled"),
            ("A", "T (Dixon Remix)", "Dixon", "/x.mp3", "A – T (Dixon Remix)"),
            ("A", "T (DIXON edit)", "dixon", "/x.mp3", "A – T (DIXON edit)"),
            ("A", "T", "Dixon", "/x.mp3", "A – T (Dixon Remix)"),
            ("A", None, "Dixon", "/x.mp3", "A – (Dixon Remix)"),
            ("  A\tB ", " T\r\n2 ", None, "/x.mp3", "A B – T 2"),
        ],
    )
    def test_what_an_entry_is_called(self, artist, title, remixer, path, shown):
        row = SetListRow(
            0, 0, artist=artist, title=title, remixer=remixer, file_path=path
        )
        text = render_text(SetList("S", (SetListChapter(0),), (row,)))
        assert text.splitlines()[-1] == f"01. {shown}"

    def test_display_title(self):
        assert display_title(SetListRow(0, 0, title="T", remixer="R")) == "T (R Remix)"
        assert (
            display_title(SetListRow(0, 0, title="T (r mix)", remixer="R"))
            == "T (r mix)"
        )


# --------------------------------------------------------------------- CSV


def read_csv(set_list: SetList) -> List[List[str]]:
    data = encoded(set_list, FORMAT_CSV)
    assert data.startswith(b"\xef\xbb\xbf"), "a byte-order mark"
    return list(csv.reader(io.StringIO(data.decode("utf-8-sig"))))


class TestCsv:
    def test_every_field_of_every_entry(self):
        rows = read_csv(friday())
        assert rows[0] == list(CSV_COLUMNS)
        assert len(rows) == 5
        assert rows[1] == [
            "1",
            "Warm-up",
            "0:00:00",
            "",
            "0:04:00",
            "0:04:00",
            "Âme",
            "Rej (Original Mix)",
            "",
            "122.5",
            "8A",
            "0:05:00",
            f"{GOLDEN_MUSIC}/Âme - Rej.mp3",
            "present",
            "",
        ]
        assert rows[2][1] == "Warm-up" and rows[2][11] == "", "a missing length"
        assert rows[2][13] == "missing", "a missing file is listed"
        assert rows[3][0] == "3" and rows[3][6:8] == ["Âme", "Rej (Original Mix)"]
        assert rows[4][2] == "" and rows[4][9] == "" and rows[4][13] == "not checked"

    def test_no_cell_runs_as_a_formula(self):
        rows = read_csv(friday())
        assert rows[2][7] == "'=Formula Track"
        assert rows[2][14] == "'=cmd|' /C calc'!A0"
        for row in rows:
            for cell in row:
                assert not cell.startswith(("=", "+", "-", "@", "\t", "\r")), cell

    @pytest.mark.parametrize("start", ["=", "+", "-", "@"])
    def test_each_formula_start_is_quoted(self, start):
        row = SetListRow(0, 0, artist=f"{start}x", title="t", file_path="/a.mp3")
        cells = read_csv(SetList("S", (SetListChapter(0),), (row,)))[1]
        assert cells[6] == f"'{start}x"

    @pytest.mark.parametrize("start", ["\t", "\r"])
    def test_a_leading_tab_or_return_is_trimmed_from_words(self, start):
        """Words are written on one line, so there is nothing left to quote."""
        row = SetListRow(0, 0, artist=f"{start}x", title="t", file_path="/a.mp3")
        assert read_csv(SetList("S", (SetListChapter(0),), (row,)))[1][6] == "x"

    @pytest.mark.parametrize("start", ["=", "+", "-", "@", "\t", "\r"])
    def test_a_path_is_quoted_too(self, start):
        """A path is written as the library holds it, untrimmed, and still safe."""
        row = SetListRow(0, 0, artist="a", title="t", file_path=f"{start}a.mp3")
        cells = read_csv(SetList("S", (SetListChapter(0),), (row,)))[1]
        assert cells[12] == f"'{start}a.mp3"

    def test_times_cannot_be_misread_as_hours(self):
        row = SetListRow(0, 0, starts_at=225, out_seconds=225, planned_seconds=225)
        cells = read_csv(SetList("S", (SetListChapter(0),), (row,)))[1]
        assert cells[2] == cells[4] == cells[5] == "0:03:45"

    def test_a_set_that_never_used_chapters_leaves_the_column_empty(self):
        rows = read_csv(one_list())
        assert {row[1] for row in rows[1:]} == {""}

    def test_rows_end_as_csv_says(self):
        assert render_csv(one_list(1)).endswith("\r\n")


# -------------------------------------------------------------------- M3U8


class TestM3u8:
    def test_it_reads_as_a_playlist(self):
        assert render_m3u8(friday()).splitlines() == [
            "#EXTM3U",
            "#PLAYLIST:Friday at Tresor",
            "# Chapter: Warm-up",
            "#EXTINF:300,Âme - Rej (Original Mix)",
            f"{GOLDEN_MUSIC}/Âme - Rej.mp3",
            "#EXTINF:-1,Dixon - =Formula Track (Kerri Chandler Remix)",
            f"{GOLDEN_MUSIC}/Dixon - Formula.flac",
            "# Chapter: Chapter 2",
            "# Chapter: Peak",
            "#EXTINF:300,Âme - Rej (Original Mix)",
            f"{GOLDEN_MUSIC}/Âme - Rej.mp3",
            "#EXTINF:400,Kraftwerk - Das Model (Remastered)",
            f"{GOLDEN_MUSIC}/Kraftwerk - Das Model.wav",
        ]

    def test_it_carries_no_times(self):
        text = render_m3u8(friday())
        assert "0:30" not in text and "5:30" not in text and "4:00" not in text

    def test_it_reads_back_the_same(self, tmp_path):
        playlist = tmp_path / "friday.m3u8"
        write_set_list(friday(MUSIC), FORMAT_M3U8, str(playlist))
        assert parse_m3u(str(playlist)) == [
            (f"{MUSIC}/Âme - Rej.mp3", "Rej (Original Mix)", "Âme"),
            (
                f"{MUSIC}/Dixon - Formula.flac",
                "=Formula Track (Kerri Chandler Remix)",
                "Dixon",
            ),
            (f"{MUSIC}/Âme - Rej.mp3", "Rej (Original Mix)", "Âme"),
            (
                f"{MUSIC}/Kraftwerk - Das Model.wav",
                "Das Model (Remastered)",
                "Kraftwerk",
            ),
        ]
        assert not playlist.read_bytes().startswith(b"\xef\xbb\xbf"), "no BOM in M3U8"

    def test_a_set_that_never_used_chapters_has_no_chapter_lines(self):
        assert "# Chapter" not in render_m3u8(one_list())


# ------------------------------------------------------------------- forms


class TestForms:
    @pytest.mark.parametrize(
        ("path", "form"),
        [
            ("a.txt", FORMAT_TEXT),
            ("a.TXT", FORMAT_TEXT),
            ("a.csv", FORMAT_CSV),
            ("a.m3u8", FORMAT_M3U8),
            ("a.M3U8", FORMAT_M3U8),
            ("a.m3u", None),
            ("a.xml", None),
            ("a.mp3", None),
            ("a", None),
            ("a.txt.bak", None),
        ],
    )
    def test_the_extension_names_the_form(self, path, form):
        assert form_of(path) == form

    def test_every_form_has_an_extension(self):
        assert set(EXTENSIONS.values()) == set(FORMATS)

    def test_an_unknown_form_is_refused(self):
        with pytest.raises(ValueError, match="one of"):
            render(friday(), "pdf")

    def test_an_entry_in_a_chapter_the_list_lacks_is_refused(self):
        broken = SetList("S", (SetListChapter(0),), (SetListRow(0, 5),))
        with pytest.raises(ValueError, match="does not have"):
            render_text(broken)

    def test_a_row_refuses_a_file_state_it_does_not_know(self):
        with pytest.raises(ValueError, match="file_status"):
            SetListRow(0, 0, file_status="gone")

    def test_only_csv_has_a_byte_order_mark(self):
        assert encoded(friday(), FORMAT_CSV).startswith(b"\xef\xbb\xbf")
        for form in (FORMAT_TEXT, FORMAT_M3U8):
            assert not encoded(friday(), form).startswith(b"\xef\xbb\xbf")
            encoded(friday(), form).decode("utf-8")

    def test_the_counts(self):
        assert friday().missing_files == 1
        assert friday().shows_chapters and not one_list().shows_chapters


# ------------------------------------------------------------------- write


class TestTheWrite:
    def test_it_writes_the_bytes_and_says_how_many(self, tmp_path):
        target = tmp_path / "friday.csv"
        written = write_set_list(friday(), FORMAT_CSV, str(target))
        assert target.read_bytes() == encoded(friday(), FORMAT_CSV)
        assert written == target.stat().st_size

    def test_it_replaces_a_file_already_there(self, tmp_path):
        target = tmp_path / "friday.txt"
        target.write_text("old", encoding="utf-8")
        write_set_list(friday(), FORMAT_TEXT, str(target))
        assert target.read_bytes() == encoded(friday(), FORMAT_TEXT)

    def test_a_stopped_write_leaves_nothing(self, tmp_path):
        target = tmp_path / "friday.txt"
        with pytest.raises(SetListCancelled):
            write_set_list(
                friday(), FORMAT_TEXT, str(target), should_cancel=lambda: True
            )
        assert list(tmp_path.iterdir()) == []

    def test_a_stopped_write_leaves_the_old_file_as_it_was(self, tmp_path):
        target = tmp_path / "friday.txt"
        target.write_text("old", encoding="utf-8")
        with pytest.raises(SetListCancelled):
            write_set_list(
                friday(), FORMAT_TEXT, str(target), should_cancel=lambda: True
            )
        assert target.read_text(encoding="utf-8") == "old"
        assert list(tmp_path.iterdir()) == [target]

    def test_a_failed_write_leaves_nothing(self, tmp_path, monkeypatch):
        import cuepoint.data.set_list_file as module

        real = module.os.fdopen

        class Breaks:
            def __init__(self, stream):
                self.stream = stream

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                self.stream.close()
                return False

            def write(self, data):
                self.stream.write(data[:10])
                raise OSError("disk full")

        monkeypatch.setattr(
            module.os, "fdopen", lambda fd, mode: Breaks(real(fd, mode))
        )
        with pytest.raises(OSError, match="disk full"):
            write_set_list(friday(), FORMAT_TEXT, str(tmp_path / "friday.txt"))
        assert list(tmp_path.iterdir()) == []

    def test_a_folder_that_is_not_there_fails_and_leaves_nothing(self, tmp_path):
        with pytest.raises(OSError):
            write_set_list(friday(), FORMAT_TEXT, str(tmp_path / "gone" / "friday.txt"))
        assert list(tmp_path.iterdir()) == []

    def test_it_never_opens_an_audio_file(self, tmp_path, monkeypatch):
        """The files a set list names are named, never read."""
        import builtins

        audio = tmp_path / "track.mp3"
        audio.write_bytes(b"ID3")
        opened: List[str] = []
        real_open, real_os_open = builtins.open, os.open

        def spy_open(file, *args, **kwargs):
            opened.append(str(file))
            return real_open(file, *args, **kwargs)

        def spy_os_open(path, *args, **kwargs):
            opened.append(str(path))
            return real_os_open(path, *args, **kwargs)

        monkeypatch.setattr(builtins, "open", spy_open)
        monkeypatch.setattr(os, "open", spy_os_open)
        row = SetListRow(0, 0, artist="A", title="T", file_path=str(audio))
        for form, suffix in (
            (FORMAT_TEXT, ".txt"),
            (FORMAT_CSV, ".csv"),
            (FORMAT_M3U8, ".m3u8"),
        ):
            write_set_list(
                SetList("S", (SetListChapter(0),), (row,)),
                form,
                str(tmp_path / f"s{suffix}"),
            )
        assert not any(Path(path).suffix == ".mp3" for path in opened), opened
        assert audio.read_bytes() == b"ID3"
