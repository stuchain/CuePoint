#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Rekordbox export's two copies of every shape agree (EXPORT-06).

The engine serializes a preview, a result, a history row and a refusal; the
Electron client declares each as a TypeScript interface, and the renderer's
bridge types copy those (``desktopContract.test.ts`` holds the two TypeScript
copies together). What neither side can check alone is that the TypeScript
agrees with what Python actually sends — Vite will not read a file outside its
app — so this does, from Python, against real serialized objects rather than a
list of keys written out a second time.

A field the engine sends and the client never declares is a number the export
dialog cannot show; one the client declares and the engine never sends is a
number it shows as ``undefined``.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Set

import pytest

from cuepoint.data.rekordbox_export import EXPORT_FIELDS
from cuepoint.engine import rekordbox_export_api as api
from cuepoint.engine.jobs import Job, JobTypeBusyError
from cuepoint.engine.rekordbox_export_jobs import StartedRekordboxExport
from cuepoint.models.rekordbox_export import (
    EXPORT_OUTCOMES,
    EXPORTED_KINDS,
    RekordboxExport,
    RekordboxExportPlaylist,
)
from cuepoint.services.rekordbox_export_service import (
    DESTINATION_IS_SOURCE,
    DESTINATION_REFUSALS,
    SIGNAL_MODIFIED,
    SIGNAL_SIZE,
    SOURCE_MISSING,
    SOURCE_REFUSALS,
    ExportDestinationError,
    ExportPreview,
    ExportRequest,
    ExportResult,
    ExportSourceError,
    PlaylistPreview,
    RememberedExport,
    SourceState,
)
from cuepoint.services.tag_write_options import KEY_FORMATS

pytestmark = pytest.mark.unit

_CLIENT = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop-electron"
    / "electron"
    / "engineClient.ts"
)


def _client() -> str:
    return _CLIENT.read_text(encoding="utf-8")


def _fields(interface: str) -> Set[str]:
    """The field names one exported interface declares, at its top level."""
    text = _client()
    start = text.find(f"export interface {interface} ")
    assert start != -1, f"{interface} is not declared in engineClient.ts"
    body = text[start : text.index("\n}", start)]
    return set(re.findall(r"^ {2}([a-z_]+)\??:", body, re.M))


def _union(name: str) -> Set[str]:
    """The string literals one exported union type is made of."""
    text = _client()
    start = text.find(f"export type {name} =")
    assert start != -1, f"{name} is not declared in engineClient.ts"
    return set(re.findall(r'"([^"]+)"', text[start : text.index(";", start)]))


def _record(**overrides) -> RekordboxExport:
    values = dict(
        id=1,
        job_id="j-1",
        started_at="2026-09-21T10:00:00+00:00",
        finished_at="2026-09-21T10:00:03+00:00",
        outcome="written",
        destination_path="C:/Exports/out.xml",
        source_path="C:/Rekordbox/collection.xml",
        track_count=3,
        changed_track_count=1,
        fields_json='["genre"]',
        key_format="normal",
    )
    values.update(overrides)
    return RekordboxExport(**values)


def _playlist() -> RekordboxExportPlaylist:
    return RekordboxExportPlaylist(
        id=1,
        export_id=1,
        collection_id=4,
        kind="collection",
        name="Saturday",
        path="CuePoint/Saturday",
        entry_count=3,
    )


def _preview() -> ExportPreview:
    return ExportPreview(
        source=SourceState(path="C:/Rekordbox/collection.xml", stale=False),
        key_format="normal",
        track_count=3,
        changed_track_count=1,
        fields_changed={"genre": 1},
        unknown_track_count=0,
        absent_track_count=0,
        missing_file_count=None,
        playlists=(
            PlaylistPreview(
                collection_id=4,
                kind="collection",
                name="Saturday",
                path="CuePoint/Saturday",
                entry_count=3,
            ),
        ),
        playlist_folder="CuePoint",
    )


class TestTheFileIsWhereThisTestThinks:
    def test_it_exists(self):
        assert _CLIENT.is_file(), _CLIENT


class TestShapes:
    def test_the_preview(self):
        assert _fields("RekordboxExportPreview") == set(_preview().to_dict())

    def test_the_source_state(self):
        assert _fields("RekordboxExportSourceState") == set(
            SourceState(path="p").to_dict()
        )

    def test_a_playlist_in_a_preview(self):
        playlist = _preview().playlists[0]
        assert _fields("RekordboxExportPlaylistPreview") == set(playlist.to_dict())

    def test_a_finished_jobs_result(self):
        result = ExportResult(record=_record(), playlists=(_playlist(),))
        assert _fields("RekordboxExportResult") == set(result.to_dict())

    def test_a_history_row(self):
        row = api.export_record_to_dict(_record(), [_playlist()])
        assert _fields("RekordboxExportRecord") == set(row)

    def test_a_playlist_in_a_history_row(self):
        assert _fields("RekordboxExportPlaylistRecord") == set(
            api.export_playlist_to_dict(_playlist())
        )

    def test_what_is_remembered(self):
        assert _fields("RememberedRekordboxExport") == set(RememberedExport().to_dict())

    def test_the_history(self):
        assert _fields("RekordboxExportHistory") == {"exports", "limit", "remembered"}

    def test_a_started_export(self):
        """The start route's answer: the started export plus the job's identity."""
        started = StartedRekordboxExport(
            job=Job(id="j-1", type="rekordbox_export"),
            request=ExportRequest((4,), "normal", "C:/out.xml", "C:/c.xml"),
        )
        assert _fields("RekordboxExportStarted") == {
            *started.to_dict(),
            "id",
            "state",
        }

    def test_a_refusal_carries_every_extra_any_refusal_sends(self):
        sent: Set[str] = set()
        for exc in (
            ExportDestinationError(DESTINATION_IS_SOURCE, "Source", "C:/c.xml"),
            ExportSourceError(SOURCE_MISSING, "Gone", "C:/c.xml"),
            JobTypeBusyError("library_import", "j-9"),
        ):
            sent |= set(api.status_for(exc)[1]["error"])
        assert _fields("RekordboxExportRefusal") == sent


class TestVocabularies:
    def test_the_key_notations(self):
        assert _union("RekordboxKeyFormat") == set(KEY_FORMATS)

    def test_the_fields_an_export_writes(self):
        assert _union("RekordboxExportField") == {name for name, _a in EXPORT_FIELDS}

    def test_the_source_refusals(self):
        assert _union("RekordboxExportSourceReason") == set(SOURCE_REFUSALS)

    def test_the_destination_refusals(self):
        assert _union("RekordboxExportDestinationReason") == set(DESTINATION_REFUSALS)

    def test_the_refusal_codes(self):
        expected = {api.SOURCE_REFUSED, api.DESTINATION_REFUSED, api.LIBRARY_BUSY}
        assert _union("RekordboxExportRefusalCode") == expected
        text = _client()
        start = text.index("export const REKORDBOX_EXPORT_REFUSAL_CODES")
        listed = set(re.findall(r'"([A-Z_]+)"', text[start : text.index("];", start)]))
        assert listed == expected

    def test_the_outcomes(self):
        for shape in ("RekordboxExportResult", "RekordboxExportRecord"):
            text = _client()
            start = text.index(f"export interface {shape} ")
            body = text[start : text.index("\n}", start)]
            line = re.search(r"^ {2}outcome: (.*);$", body, re.M)
            assert line, shape
            assert set(re.findall(r'"([a-z]+)"', line.group(1))) == set(EXPORT_OUTCOMES)

    def test_the_kinds_of_playlist(self):
        for shape in (
            "RekordboxExportPlaylistPreview",
            "RekordboxExportPlaylistRecord",
        ):
            text = _client()
            start = text.index(f"export interface {shape} ")
            body = text[start : text.index("\n}", start)]
            line = re.search(r"^ {2}kind: (.*);$", body, re.M)
            assert line, shape
            assert set(re.findall(r'"([a-z]+)"', line.group(1))) == set(EXPORTED_KINDS)

    def test_the_staleness_signals(self):
        text = _client()
        start = text.index("export interface RekordboxExportSourceState ")
        body = text[start : text.index("\n}", start)]
        line = re.search(r"^ {2}signals: (.*);$", body, re.M)
        assert line
        assert set(re.findall(r'"([a-z]+)"', line.group(1))) == {
            SIGNAL_MODIFIED,
            SIGNAL_SIZE,
        }


class TestRoutes:
    def test_the_client_calls_every_route_the_engine_answers(self):
        text = _client()
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            assert path in text, path
