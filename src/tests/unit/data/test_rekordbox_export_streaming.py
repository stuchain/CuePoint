#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The export writes its output as a stream, from a source it does not copy (PYTHON-1H).

The writer used to read the whole source into memory, build the output in a
``bytearray`` and copy that into ``bytes`` before the temp file, about three
times the source at its peak. Now the source is mapped, the parse feeds expat in
chunks, and the spliced chunks go straight to the temp file. What it must not
change is the file: these tests hold it to bytes captured from the writer as it
was, with the parse chunk made small enough to land inside tags and inside
multi-byte characters.
"""

from __future__ import annotations

import gc
import hashlib
import tracemalloc
from pathlib import Path
from typing import List

import pytest

from cuepoint.data import rekordbox_export as writer
from cuepoint.data.rekordbox_export import (
    ExportCancelled,
    ExportFolder,
    ExportPlaylist,
    TrackExportValues,
    patch_collection_xml,
    plan_collection_xml,
)
from cuepoint.exceptions.cuepoint_exceptions import ValidationError

pytestmark = pytest.mark.unit

TRACKS = 900


def build_source(path: Path) -> Path:
    """A deterministic collection: cues, grids, a decoy comment, non-ASCII names,
    single and double quotes, self-closing and paired tracks, a playlist tree."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<DJ_PLAYLISTS Version="1.0.0">',
        '  <PRODUCT Name="rekordbox" Version="6.7.4" Company="AlphaTheta"/>',
        f'  <COLLECTION Entries="{TRACKS}">',
    ]
    for n in range(TRACKS):
        name = f"Caf\u00e9 \u30c8\u30e9\u30c3\u30af {n} &amp; Co"
        quote = "'" if n % 7 == 0 else '"'
        head = (
            f"    <TRACK TrackID={quote}{n}{quote} Name={quote}{name}{quote}"
            f" Artist={quote}Art\u00efst {n}{quote} Tonality={quote}Am{quote}"
            f" AverageBpm={quote}128.00{quote} Genre={quote}Techno{quote}"
            f" Year={quote}2019{quote} Rating={quote}102{quote}"
            f" Location={quote}file://localhost/C:/Music/{n}.mp3{quote}"
        )
        if n % 5 == 0:
            lines.append(head + "/>")
        else:
            lines.append(head + ">")
            lines.append(
                '      <TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>'
            )
            lines.append(
                f'      <POSITION_MARK Name="Drop" Type="0" Start="{n}.025" Num="0"/>'
            )
            lines.append("    </TRACK>")
        if n % 100 == 0:
            lines.append(f'    <!-- a decoy: <TRACK TrackID="d{n}" Tonality="Zz"/> -->')
    lines += [
        "  </COLLECTION>",
        "  <PLAYLISTS>",
        '    <NODE Type="0" Name="ROOT" Count="1">',
        '      <NODE Name="Saturday" Type="1" KeyType="0" Entries="2">',
        '        <TRACK Key="1"/>',
        '        <TRACK Key="2"/>',
        "      </NODE>",
        "    </NODE>",
        "  </PLAYLISTS>",
        "</DJ_PLAYLISTS>",
        "",
    ]
    path.write_bytes("\n".join(lines).encode("utf-8"))
    return path


UPDATES = {
    str(n): TrackExportValues(
        key="Cm", bpm=126.5, genre="Caf\u00e9 House", label="Dr\u00fcmcode", year=2024
    )
    for n in range(0, TRACKS, 3)
}

PLAYLISTS = [
    ExportFolder(
        "Gigs & Co",
        (
            ExportPlaylist("Set \u00e9", ("1", "2", "3", "1")),
            ExportFolder("Deep", (ExportPlaylist("Late", ("7", "8")),)),
        ),
    ),
    ExportPlaylist("Loose", ("4",)),
]

#: sha256 of the file the writer made from ``build_source`` + ``UPDATES`` +
#: ``PLAYLISTS`` before it streamed, captured on that code.
GOLDEN_SHA256 = "1d1c7a0f70fcbae0d2e2a041f201e8db5a2448c8c644252a0f673926114026ba"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def source(tmp_path: Path) -> Path:
    return build_source(tmp_path / "collection.xml")


class TestTheFileIsTheSame:
    def test_the_export_is_the_bytes_the_old_writer_wrote(
        self, source: Path, tmp_path: Path
    ):
        out = tmp_path / "out" / "export.xml"
        patch_collection_xml(str(source), UPDATES, str(out), PLAYLISTS)
        assert digest(out) == GOLDEN_SHA256

    @pytest.mark.parametrize("chunk", [1, 7, 4096, 65536])
    def test_wherever_the_parse_chunk_ends_the_file_is_the_same(
        self, source: Path, tmp_path: Path, monkeypatch, chunk: int
    ):
        """A chunk boundary inside a tag, an attribute value or a multi-byte
        character must not move one offset."""
        monkeypatch.setattr(writer, "_PARSE_CHUNK_BYTES", chunk, raising=False)
        out = tmp_path / "out" / "export.xml"
        patch_collection_xml(str(source), UPDATES, str(out), PLAYLISTS)
        assert digest(out) == GOLDEN_SHA256

    def test_a_preview_counts_what_the_export_changes(self, source: Path, tmp_path):
        previewed = plan_collection_xml(str(source), UPDATES, PLAYLISTS)
        written = patch_collection_xml(
            str(source), UPDATES, str(tmp_path / "o.xml"), PLAYLISTS
        )
        assert previewed.tracks_changed == written.tracks_changed
        assert previewed.elements_patched == written.elements_patched
        assert previewed.fields_changed == written.fields_changed

    def test_an_empty_source_is_refused_as_not_well_formed(self, tmp_path: Path):
        empty = tmp_path / "empty.xml"
        empty.write_bytes(b"")
        with pytest.raises(ValidationError, match="not well-formed"):
            patch_collection_xml(str(empty), {}, str(tmp_path / "o.xml"))
        with pytest.raises(ValidationError, match="not well-formed"):
            plan_collection_xml(str(empty), {}, None)

    def test_a_source_without_a_trailing_newline_or_with_a_bom(self, tmp_path: Path):
        text = (
            b'<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS><COLLECTION>'
            b'<TRACK TrackID="1" Tonality="Am"/></COLLECTION></DJ_PLAYLISTS>'
        )
        for name, data in (("plain", text), ("bom", b"\xef\xbb\xbf" + text)):
            source = tmp_path / f"{name}.xml"
            source.write_bytes(data)
            out = tmp_path / f"{name}-out.xml"
            patch_collection_xml(
                str(source), {"1": TrackExportValues(key="Cm")}, str(out)
            )
            assert out.read_bytes() == data.replace(b'"Am"', b'"Cm"')


def stop_on_the_last_check(source: Path, tmp_path: Path):
    """A ``should_cancel`` that answers yes only to the final question: the one
    the writer asks once the temp file is complete, just before the replace."""
    asked: List[int] = []
    patch_collection_xml(
        str(source),
        UPDATES,
        str(tmp_path / "dry" / "export.xml"),
        PLAYLISTS,
        should_cancel=lambda: asked.append(1) or False,
    )
    total = len(asked)
    count = [0]

    def should_cancel() -> bool:
        count[0] += 1
        return count[0] == total

    return should_cancel


class TestTheWriteKeepsItsOrder:
    def test_a_stop_asked_before_the_replace_leaves_nothing(
        self, source: Path, tmp_path: Path
    ):
        out = tmp_path / "out" / "export.xml"

        with pytest.raises(ExportCancelled):
            patch_collection_xml(
                str(source),
                UPDATES,
                str(out),
                PLAYLISTS,
                should_cancel=stop_on_the_last_check(source, tmp_path),
            )

        assert not out.exists()
        assert list(out.parent.iterdir()) == []

    def test_a_stop_before_the_replace_leaves_the_previous_export_alone(
        self, source: Path, tmp_path: Path
    ):
        out = tmp_path / "out" / "export.xml"
        out.parent.mkdir()
        out.write_bytes(b"the previous export")

        with pytest.raises(ExportCancelled):
            patch_collection_xml(
                str(source),
                UPDATES,
                str(out),
                PLAYLISTS,
                should_cancel=stop_on_the_last_check(source, tmp_path),
            )

        assert out.read_bytes() == b"the previous export"
        assert [p.name for p in out.parent.iterdir()] == ["export.xml"]

    def test_the_previous_export_is_kept_as_a_dated_copy(
        self, source: Path, tmp_path: Path
    ):
        out = tmp_path / "out" / "export.xml"
        out.parent.mkdir()
        out.write_bytes(b"the previous export")

        result = patch_collection_xml(str(source), UPDATES, str(out), PLAYLISTS)

        assert result.backup_path is not None
        assert Path(result.backup_path).read_bytes() == b"the previous export"
        assert digest(out) == GOLDEN_SHA256
        assert len(list(out.parent.iterdir())) == 2

    def test_a_failure_in_the_replace_leaves_the_folder_as_found(
        self, source: Path, tmp_path: Path, monkeypatch
    ):
        out = tmp_path / "out" / "export.xml"
        out.parent.mkdir()
        out.write_bytes(b"the previous export")

        def refuse(_temp, _path):
            raise PermissionError("the destination is locked")

        monkeypatch.setattr(writer, "commit_temp", refuse)
        with pytest.raises(PermissionError):
            patch_collection_xml(str(source), UPDATES, str(out), PLAYLISTS)

        assert out.read_bytes() == b"the previous export"
        assert [p.name for p in out.parent.iterdir()] == ["export.xml"]

    def test_a_failure_while_writing_leaves_no_temp_file(
        self, source: Path, tmp_path: Path, monkeypatch
    ):
        out = tmp_path / "out" / "export.xml"

        def full(_temp):
            raise OSError(28, "No space left on device")

        monkeypatch.setattr(writer, "fsync_file", full, raising=False)
        monkeypatch.setattr("os.fsync", full)
        with pytest.raises(OSError):
            patch_collection_xml(str(source), UPDATES, str(out), PLAYLISTS)

        assert not out.exists()
        assert list(out.parent.iterdir()) == []


class TestTheOutputIsNotHeld:
    def test_the_peak_memory_of_a_write_is_about_the_source_not_three_times_it(
        self, tmp_path: Path
    ):
        """Three hundred tracks each carrying 100 KB of comment: the file is large
        and the parse is cheap, so the memory seen is the copies of it. Before the
        stream the write held the source, a ``bytearray`` of the output and a
        ``bytes`` copy of that: 3x."""
        padding = "<!--" + "x" * 100_000 + "-->"
        rows = "\n".join(
            f'<TRACK TrackID="{n}" Name="T{n}" Genre="House">{padding}</TRACK>'
            for n in range(300)
        )
        source = tmp_path / "big.xml"
        source.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS>'
            f"<COLLECTION>{rows}</COLLECTION></DJ_PLAYLISTS>",
            encoding="utf-8",
        )
        size = source.stat().st_size
        updates = {str(n): TrackExportValues(genre="Techno") for n in range(300)}
        out = tmp_path / "out" / "big-export.xml"

        gc.collect()
        tracemalloc.start()
        try:
            result = patch_collection_xml(str(source), updates, str(out))
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        assert result.tracks_changed == 300
        assert out.stat().st_size > size - 300 * 6
        assert peak < 1.2 * size, f"peak {peak / size:.2f}x the source"
