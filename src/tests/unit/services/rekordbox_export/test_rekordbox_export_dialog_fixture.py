#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine answers the export dialog's tests are written against (EXPORT-07).

EXPORT-07's specification asks that the dialog's empty and refusal states come
"from real engine responses, not hand-written shapes". A shape typed by hand in
a renderer test is the renderer's belief about the engine, and a test over it
passes the day the two stop agreeing. So the renderer's fixtures are produced
here, by the real service over a real library, and committed as JSON beside the
component that reads them: ``rekordboxExport.fixture.json``, as
``test_clean_empty_state_fixture.py`` produces Clean's.

Each state below builds one situation the dialog has to describe and asserts
the committed JSON is what the engine answers for it now. A change to the
payload therefore fails here, in Python, where it is made — not silently in a
renderer test still reading the old shape. To write the file again after a
deliberate change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \
        src/tests/unit/services/rekordbox_export/test_rekordbox_export_dialog_fixture.py

and read the diff before committing it.

What varies from machine to machine is normalized, and nothing else: every
path under the test's temporary folder becomes the same fictional user's
folder, and every timestamp becomes a fixed one chosen by what it records, so a
file modified after its import still reads as modified after it.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

import pytest

from cuepoint.engine import rekordbox_export_api as api
from cuepoint.engine.jobs import JobTypeBusyError
from cuepoint.models.file_status import FILE_MISSING, FILE_PRESENT, TrackFileStatus
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_source import LibrarySource
from cuepoint.models.library_track import utc_now_iso
from cuepoint.persistence.rekordbox_export_repository import RekordboxExportRepository
from cuepoint.services.rekordbox_export_service import (
    ExportDestinationError,
    ExportSourceError,
)

from .library import SOURCE

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[5]
FIXTURES = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "library"
    / "rekordboxExport.fixture.json"
)
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"

#: Where the fictional user keeps things. Windows-shaped because the phase's
#: packaged acceptance is on Windows; the dialog draws whatever it is handed.
HOME = "C:\\Users\\dj\\Music"
PLACES = {
    "collection.xml": f"{HOME}\\collection.xml",
    "exports": f"{HOME}\\Exports",
    "exports/CuePoint Export 2026-09-21.xml": (
        f"{HOME}\\Exports\\CuePoint Export 2026-09-21.xml"
    ),
    "exports/set.mp3": f"{HOME}\\Exports\\set.mp3",
}

# ------------------------------------------------------------ normalization


def _replacements(tmp_path: Path) -> List[Tuple[str, str]]:
    """Each real path this test uses, spelled every way it can come back."""
    pairs: List[Tuple[str, str]] = []
    for relative, fictional in PLACES.items():
        real = tmp_path / relative
        for spelling in {str(real), str(real.resolve()), os.path.abspath(real)}:
            pairs.append((spelling, fictional))
    for spelling in {str(tmp_path), str(tmp_path.resolve())}:
        pairs.append((spelling, HOME))
    # Longest first, so a file's path is replaced before its folder's.
    return sorted(pairs, key=lambda pair: len(pair[0]), reverse=True)


#: The one moment every recorded time is put at, and how far the second of a
#: pair that differed is put after it. Fixed per field rather than per value
#: seen, so two clock readings a second apart cannot change the file.
IMPORTED_AT = "2026-09-03T09:00:00+00:00"
SAVED_AGAIN_AT = "2026-09-14T18:30:00+00:00"


def _exported_at(export_id: int, finished: bool) -> str:
    return f"2026-09-21T20:{export_id:02d}:{4 if finished else 0:02d}+00:00"


def _times(item: Dict[str, Any]) -> Dict[str, Any]:
    """A dict's timestamps, fixed by what they mean rather than when they ran."""
    fixed = dict(item)
    if "recorded_modified_at" in item:
        recorded, actual = item["recorded_modified_at"], item.get("actual_modified_at")
        fixed["recorded_modified_at"] = None if recorded is None else IMPORTED_AT
        if actual is not None:
            fixed["actual_modified_at"] = (
                IMPORTED_AT if actual == recorded else SAVED_AGAIN_AT
            )
    if "started_at" in item:
        export_id = int(item["id"])
        fixed["started_at"] = _exported_at(export_id, finished=False)
        if item.get("finished_at") is not None:
            fixed["finished_at"] = _exported_at(export_id, finished=True)
    return fixed


def normalize(value: Any, tmp_path: Path) -> Any:
    """The answer with this machine taken out of it, and nothing else."""
    replacements = _replacements(tmp_path)

    def walk(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: walk(inner) for key, inner in _times(item).items()}
        if isinstance(item, list):
            return [walk(inner) for inner in item]
        if isinstance(item, str):
            for real, fictional in replacements:
                item = item.replace(real, fictional)
            return item
        return item

    return walk(value)


def refusal(exc: BaseException) -> Dict[str, Any]:
    """A refusal as the renderer receives it.

    The engine's envelope, through the same status mapping the route uses, and
    then the translation ``engineClient.ts`` makes of it — the one step that
    runs in TypeScript, restated here field for field and held to that file by
    ``test_rekordbox_export_contract.py``.
    """
    _status, envelope = api.status_for(exc)
    error = envelope["error"]

    def text(key: str) -> Any:
        value = error.get(key)
        return value if isinstance(value, str) else None

    assert error["code"] in (
        api.SOURCE_REFUSED,
        api.DESTINATION_REFUSED,
        api.LIBRARY_BUSY,
    )
    return {
        "preview": None,
        "refusal": {
            "code": error["code"],
            "message": error["message"],
            "reason": text("reason"),
            "path": text("path"),
            "job_id": text("job_id"),
            "job_type": text("job_type"),
        },
    }


def refused(call: Callable[[], Any]) -> Dict[str, Any]:
    with pytest.raises(
        (ExportSourceError, ExportDestinationError, JobTypeBusyError)
    ) as caught:
        call()
    return refusal(caught.value)


# ------------------------------------------------------------ the situations


def _chosen(ctx: "Situation") -> List[int]:
    """A library a user has worked on, and a choice of what to send.

    Two overrides and a rating, one file found missing by a check, a folder
    holding a Collection with a closing reprise and a track the file lacks, a
    Collection at the top level, and a Smart Collection one of whose members
    the file lacks too.
    """
    ids, tree = ctx.ids, ctx.tree
    ctx.metadata.set_override(ids["1"], "key", "Cm")
    ctx.metadata.set_override(ids["2"], "genre", "Minimal")
    ctx.metadata.set_rating(ids["1"], 5)
    now = utc_now_iso()
    ctx.files.record(
        [
            TrackFileStatus(
                track_id=ids["1"],
                status=FILE_MISSING,
                checked_path="/m/one.mp3",
                checked_at=now,
            ),
            TrackFileStatus(
                track_id=ids["2"],
                status=FILE_PRESENT,
                checked_path="/m/two.mp3",
                size_bytes=1,
                checked_at=now,
            ),
        ]
    )
    ctx.collection_service.add_tracks(tree["saturday"], [ids["4"]])
    ctx.collection_service.insert_track(tree["saturday"], ids["1"], 3)
    smart = ctx.collection_service.create_smart(
        "Fast", RuleSet(rules=(FilterRule("bpm", "gte", 124),))
    )
    return [tree["gigs"], tree["loose"], int(smart.id)]


def _preview(
    ctx: "Situation", ids: List[int], notation: str = "normal"
) -> Dict[str, Any]:
    return {"preview": ctx.service.preview(ids, notation).to_dict(), "refusal": None}


def whole_library(ctx: "Situation") -> Any:
    """Opened from the header, nothing ticked, nothing overridden: a copy."""
    return _preview(ctx, [])


def chosen(ctx: "Situation") -> Any:
    return _preview(ctx, _chosen(ctx))


def chosen_camelot(ctx: "Situation") -> Any:
    return _preview(ctx, _chosen(ctx), "camelot")


def chosen_short(ctx: "Situation") -> Any:
    return _preview(ctx, _chosen(ctx), "short")


def stale(ctx: "Situation") -> Any:
    """The file was saved again in Rekordbox after it was imported."""
    ctx.source.write_bytes(
        SOURCE.replace(b'Name="Stranger"', b'Name="Stranger, renamed"')
    )
    recorded = ctx.source.stat()
    os.utime(ctx.source, (recorded.st_atime, recorded.st_mtime + 3600))
    return _preview(ctx, [ctx.tree["loose"]])


def stale_unknown(ctx: "Situation") -> Any:
    """An import whose own ``stat`` failed: nothing to compare against."""
    ctx.sources.replace(
        LibrarySource(
            xml_path=str(ctx.source), imported_at=utc_now_iso(), track_count=4
        )
    )
    return _preview(ctx, [])


def collision(ctx: "Situation") -> Any:
    """The file already has a top-level folder called CuePoint."""
    ctx.source.write_bytes(
        SOURCE.replace(
            b'<NODE Type="0" Name="ROOT" Count="0"/>',
            b'<NODE Type="0" Name="ROOT" Count="1">'
            b'<NODE Type="0" Name="CuePoint" Count="0"/></NODE>',
        )
    )
    ctx.sources.replace(_recorded(ctx.source))
    return _preview(ctx, [ctx.tree["loose"]])


def empty_folder(ctx: "Situation") -> Any:
    """A folder with nothing under it: chosen, and nothing to append."""
    folder = ctx.collection_service.create_folder("Ideas")
    return _preview(ctx, [int(folder.id)])


def empty_collection(ctx: "Situation") -> Any:
    """A Collection with nothing in it, which is still a playlist."""
    empty = ctx.collection_service.create_collection("Next week")
    return _preview(ctx, [int(empty.id)])


def never_imported(ctx: "Situation") -> Any:
    ctx.db.connect().execute("DELETE FROM library_source")
    return refused(lambda: ctx.service.preview([], "normal"))


def source_missing(ctx: "Situation") -> Any:
    ctx.source.unlink()
    return refused(lambda: ctx.service.preview([], "normal"))


def source_invalid(ctx: "Situation") -> Any:
    ctx.source.write_bytes(b"<DJ_PLAYLISTS><COLLECTION>")
    ctx.sources.replace(_recorded(ctx.source))
    return refused(lambda: ctx.service.preview([], "normal"))


def destination_is_source(ctx: "Situation") -> Any:
    return refused(lambda: ctx.service.validate([], "normal", str(ctx.source)))


def destination_not_xml(ctx: "Situation") -> Any:
    target = ctx.exports / "set.mp3"
    return refused(lambda: ctx.service.validate([], "normal", str(target)))


def library_busy(ctx: "Situation") -> Any:
    return refusal(JobTypeBusyError("library_import", "job-import"))


def result_written(ctx: "Situation") -> Any:
    ids = _chosen(ctx)
    return ctx.service.export(
        ids, "camelot", str(ctx.destination), job_id="job-export"
    ).to_dict()


def result_cancelled(ctx: "Situation") -> Any:
    return ctx.service.export(
        [ctx.tree["loose"]],
        "normal",
        str(ctx.destination),
        job_id="job-export",
        should_cancel=lambda: True,
    ).to_dict()


def history_empty(ctx: "Situation") -> Any:
    return _history(ctx)


def history(ctx: "Situation") -> Any:
    """Two exports: one that wrote, then one that was stopped."""
    ids = _chosen(ctx)
    ctx.service.export(ids, "camelot", str(ctx.destination), job_id="job-first")
    ctx.service.export(
        [ctx.tree["loose"]],
        "normal",
        str(ctx.destination),
        job_id="job-second",
        should_cancel=lambda: True,
    )
    return _history(ctx)


def _history(ctx: "Situation") -> Dict[str, Any]:
    """What ``GET /history`` answers, through the route's own serializers."""
    repository = RekordboxExportRepository(ctx.db)
    records = repository.recent(api.HISTORY_LIMIT_DEFAULT)
    return {
        "exports": [
            api.export_record_to_dict(record, repository.playlists_for(int(record.id)))
            for record in records
        ],
        "limit": api.HISTORY_LIMIT_DEFAULT,
        "remembered": ctx.service.remembered().to_dict(),
    }


def _recorded(path: Path) -> LibrarySource:
    from cuepoint.models.library_source import source_for_import

    return source_for_import(str(path), utc_now_iso(), 4, 0)


STATES: Dict[str, Callable[["Situation"], Any]] = {
    "whole_library": whole_library,
    "chosen": chosen,
    "chosen_camelot": chosen_camelot,
    "chosen_short": chosen_short,
    "stale": stale,
    "stale_unknown": stale_unknown,
    "collision": collision,
    "empty_folder": empty_folder,
    "empty_collection": empty_collection,
    "never_imported": never_imported,
    "source_missing": source_missing,
    "source_invalid": source_invalid,
    "destination_is_source": destination_is_source,
    "destination_not_xml": destination_not_xml,
    "library_busy": library_busy,
    "result_written": result_written,
    "result_cancelled": result_cancelled,
    "history_empty": history_empty,
    "history": history,
}


class Situation:
    """The service's fixtures, gathered, for a state to build on."""

    def __init__(self, **fixtures: Any) -> None:
        self.__dict__.update(fixtures)
        self.exports = fixtures["tmp_path"] / "exports"
        self.exports.mkdir()
        self.destination = self.exports / "CuePoint Export 2026-09-21.xml"


def _committed() -> Dict[str, Any]:
    if not FIXTURES.exists():
        return {}
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(STATES))
def test_the_committed_answer_is_what_the_engine_answers(
    name,
    tmp_path,
    db,
    source,
    ids,
    metadata,
    files,
    sources,
    collection_service,
    service,
    tree,
):
    ctx = Situation(
        tmp_path=tmp_path,
        db=db,
        source=source,
        ids=ids,
        metadata=metadata,
        files=files,
        sources=sources,
        collection_service=collection_service,
        service=service,
        tree=tree,
    )
    answer = normalize(json.loads(json.dumps(STATES[name](ctx))), tmp_path)

    if WRITE:
        committed = _committed()
        committed[name] = answer
        FIXTURES.write_text(
            json.dumps(committed, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    assert _committed().get(name) == answer, (
        f"{FIXTURES.name} no longer says what the engine answers for {name!r}; "
        "if the change is deliberate, write it again with CUEPOINT_WRITE_FIXTURES=1"
    )


def test_the_file_holds_no_state_nothing_builds():
    """A state removed here must not live on in the renderer's tests."""
    assert sorted(_committed()) == sorted(STATES)


def test_no_real_path_or_person_reaches_the_file():
    """The file is committed, so it may carry only the fictional user's paths."""
    text = FIXTURES.read_text(encoding="utf-8")
    assert "pytest" not in text
    assert "Temp" not in text and "/tmp" not in text
    for match in re.findall(r"[A-Z]:\\\\[^\"]*", text):
        assert match.startswith(HOME.replace("\\", "\\\\")), match
