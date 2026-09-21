#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the next export starts from (EXPORT-06, DEC-083, DEC-089).

The folder and the notation are read from the export record — the last export
that wrote — rather than kept as settings of their own, so they cannot disagree
with where the last export actually went. The risks:

- **Remembering an export that wrote nothing.** A cancelled or failed export
  points somewhere nothing was written, and is no reason to suggest it again.
- **Remembering the file name.** DEC-083 remembers the folder only, so no export
  silently overwrites the previous one.
- **Suggesting a folder that is gone** without saying so.
- **Inventing a notation** when there is nothing to remember: the default is
  classic, so the mixed-notation outcome DEC-089 warns about is only ever
  reached by choosing it.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cuepoint.services.rekordbox_export_service import (
    DEFAULT_KEY_FORMAT,
    RememberedExport,
)

pytestmark = pytest.mark.unit


@pytest.fixture()
def out(tmp_path: Path) -> Path:
    folder = tmp_path / "exports"
    folder.mkdir()
    return folder


def stop_at_once() -> bool:
    return True


class TestNothingToRemember:
    def test_a_library_never_exported_remembers_nothing_and_offers_the_default(
        self, service
    ):
        remembered = service.remembered()

        assert remembered == RememberedExport()
        assert remembered.folder is None
        assert remembered.folder_exists is False
        assert remembered.key_format == DEFAULT_KEY_FORMAT
        assert remembered.export_id is None

    def test_the_default_is_classic(self):
        assert DEFAULT_KEY_FORMAT == "normal"

    def test_a_cancelled_export_is_not_remembered(self, service, sources, out: Path):
        service.export([], "camelot", str(out / "a.xml"), should_cancel=stop_at_once)

        assert service.remembered() == RememberedExport()

    def test_a_failed_export_is_not_remembered(
        self, service, sources, source: Path, out: Path
    ):
        source.write_bytes(b"<DJ_PLAYLISTS><COLLECTION><TRACK TrackID='1'>")

        ended = service.export([], "camelot", str(out / "a.xml"))

        assert ended.failed
        assert service.remembered() == RememberedExport()


class TestTheLastExportThatWrote:
    def test_its_folder_and_notation_are_remembered(self, service, sources, out: Path):
        ended = service.export([], "camelot", str(out / "Saturday.xml"))

        remembered = service.remembered()

        assert remembered.folder == str(out)
        assert remembered.folder_exists is True
        assert remembered.key_format == "camelot"
        assert remembered.export_id == ended.record.id

    def test_only_the_folder_is_remembered_never_the_file_name(
        self, service, sources, out: Path
    ):
        service.export([], "normal", str(out / "Saturday.xml"))

        assert "Saturday" not in (service.remembered().folder or "")

    def test_the_newest_one_that_wrote_is_the_one_remembered(
        self, service, sources, tmp_path: Path
    ):
        first = tmp_path / "first"
        second = tmp_path / "second"
        first.mkdir()
        second.mkdir()
        service.export([], "normal", str(first / "a.xml"))
        service.export([], "short", str(second / "b.xml"))

        remembered = service.remembered()

        assert remembered.folder == str(second)
        assert remembered.key_format == "short"

    def test_an_export_that_did_not_write_does_not_displace_one_that_did(
        self, service, sources, tmp_path: Path
    ):
        kept = tmp_path / "kept"
        stopped = tmp_path / "stopped"
        kept.mkdir()
        stopped.mkdir()
        written = service.export([], "camelot", str(kept / "a.xml"))
        service.export([], "short", str(stopped / "b.xml"), should_cancel=stop_at_once)

        remembered = service.remembered()

        assert remembered.folder == str(kept)
        assert remembered.key_format == "camelot"
        assert remembered.export_id == written.record.id

    def test_a_folder_that_is_gone_is_remembered_and_said_to_be_gone(
        self, service, sources, tmp_path: Path
    ):
        gone = tmp_path / "unplugged"
        gone.mkdir()
        service.export([], "normal", str(gone / "a.xml"))
        (gone / "a.xml").unlink()
        gone.rmdir()

        remembered = service.remembered()

        assert remembered.folder == str(gone)
        assert remembered.folder_exists is False

    def test_a_relative_destination_is_remembered_where_it_went(
        self, service, sources, out: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.chdir(out)

        service.export([], "normal", "relative.xml")

        assert service.remembered().folder == str(out)


class TestThePayload:
    def test_it_carries_every_field_under_its_own_name(self):
        remembered = RememberedExport(
            folder="C:/Exports", folder_exists=True, key_format="short", export_id=7
        )

        assert remembered.to_dict() == {
            "folder": "C:/Exports",
            "folder_exists": True,
            "key_format": "short",
            "export_id": 7,
        }
