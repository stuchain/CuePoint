#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Every warning a Set's checks can give, as the renderer receives it (PREP-05).

DEC-106's warnings are data, and the renderer turns them into words. The
specification asks that a test hold "every kind and detail to a string the
renderer has, as DISCOVER-08 did for reasons". This is the engine's half, as
``test_similar_reasons_fixture.py`` is for Similar Tracks: the real services,
over a real library built so each warning in ``core.set_analysis.WARNINGS`` is
given at least once, write ``setWarnings.fixture.json`` beside the renderer
module that words them. ``setWarnings.test.ts`` is the other half.

The file also carries the notice, the file-check states a Set can be in, and a
table of planned times as ``core.set_timing.format_time`` writes them, so the
renderer's ``formatTime`` is held to the engine's (PREP-03 handed that on).

To write the file again after a deliberate change::

    CUEPOINT_WRITE_FIXTURES=1 python -m pytest \\
        src/tests/unit/services/test_set_warnings_fixture.py

and read the diff before committing it.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from cuepoint.core.set_analysis import NOTICES, WARNINGS
from cuepoint.core.set_timing import MAX_TIME_SECONDS, format_time
from cuepoint.models.collection import KIND_SET, Collection
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_analysis_service import SetAnalysisService
from cuepoint.services.set_service import SetService

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = (
    REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "prepare"
    / "setWarnings.fixture.json"
)
WRITE = os.environ.get("CUEPOINT_WRITE_FIXTURES") == "1"
CHECKED = "2026-09-20T09:00:00+00:00"

#: Planned times the renderer must write exactly as the engine does.
TIMES = (0, 5, 59, 60, 225, 599, 3599, 3600, 3825, 36000, MAX_TIME_SECONDS)


def produce(tmp_path: Path) -> Dict[str, Any]:
    db = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(db).migrate()
    try:
        tracks = TrackRepository(db)
        files = FileStatusRepository(db)
        collections = CollectionRepository(db)
        set_repo = SetRepository(db)
        sets = SetService(collections, set_repo, db)
        service = SetAnalysisService(collections, set_repo, tracks, db)
        number = 0

        def add(
            bpm: Optional[float] = 124.0,
            key: Optional[str] = "8A",
            length: int = 400,
            file: Optional[str] = FILE_PRESENT,
            reason: Optional[str] = None,
        ) -> int:
            nonlocal number
            number += 1
            stored = tracks.add(
                LibraryTrack(
                    rekordbox_track_id=str(number),
                    file_path=f"/music/{number}.mp3",
                    title=f"Track {number}",
                    artist="Someone",
                    bpm=bpm,
                    duration_seconds=length,
                )
            )
            assert stored.id is not None
            if key is not None:
                # The key is yours or Beatport's (DEC-201), never Rekordbox's.
                TrackMetadataRepository(db).set_override(stored.id, "key", key)
            if file is not None:
                files.record(
                    [
                        TrackFileStatus(
                            stored.id,
                            file,
                            f"/music/{number}.mp3",
                            CHECKED,
                            size_bytes=1 if file == FILE_PRESENT else None,
                            reason=reason,
                        )
                    ]
                )
            return stored.id

        def make(track_ids: List[int]) -> int:
            set_id = int(collections.create(Collection(name="Set", kind=KIND_SET)).id)
            collections.append(set_id, track_ids)
            return set_id

        def entries(set_id: int) -> List[int]:
            return [int(e.id) for e in collections.entries(set_id)]

        def chapter(set_id: int) -> int:
            return int(collections.chapters(set_id)[0].id)

        made: List[int] = []
        # Tempo and key: a jump up, then down into a clashing key.
        made.append(make([add(bpm=120.0), add(bpm=140.0), add(bpm=120.0, key="3B")]))
        # Unknown values: before, after, and both.
        made.append(
            make(
                [
                    add(bpm=None, key=None),
                    add(),
                    add(bpm=None, key=None),
                    add(bpm=None, key=None),
                ]
            )
        )
        # Files.
        made.append(
            make(
                [
                    add(file=FILE_MISSING),
                    add(file=FILE_MISSING, reason=REASON_ROOT_UNAVAILABLE),
                    add(file=FILE_UNREADABLE),
                ]
            )
        )
        # Planned times a refresh has since put past the end.
        shortened = make([add(length=400), add(length=400)])
        first, second = entries(shortened)
        sets.set_entry_times(first, "0:30", "5:30")
        sets.set_entry_times(second, "5:10", "6:00")
        with db.transaction() as conn:
            conn.execute("UPDATE tracks SET duration_seconds = 300")
        made.append(shortened)
        # Chapter targets: over when all timed, over with one untimed, under.
        for outs, target in (
            (["3:00", "3:00"], 300),
            (["3:00", None, "3:00"], 300),
            (["3:00", "2:00"], 600),
        ):
            timed = make([add() for _ in outs])
            for entry, out in zip(entries(timed), outs):
                if out is not None:
                    sets.set_entry_times(entry, None, out)
            sets.set_chapter_targets(chapter(timed), target, None, None)
            made.append(timed)
        # Chapter BPM ranges: below, above, both.
        for bpms in ((116.0, 120.0), (120.0, 123.0), (116.0, 123.0)):
            ranged = make([add(bpm=bpm) for bpm in bpms])
            sets.set_chapter_targets(chapter(ranged), None, 118.0, 122.0)
            made.append(ranged)
        # A repeat.
        again = add()
        repeated = make([again, add(), again])
        # File checks: never, partly, and all.
        never = make([add(file=None), add(file=None)])
        partly = make([add(file=None), add(file=FILE_MISSING)])

        warnings: List[Dict[str, Any]] = []
        given = set()
        reports = [service.analyse(set_id).to_dict() for set_id in made]
        found = [
            warning
            for report in reports
            for group in ("transitions", "entries", "chapters")
            for item in report[group]
            for warning in item["warnings"]
        ]
        for kind in WARNINGS:
            for warning in found:
                if (warning["kind"], warning["detail"]) == kind and kind not in given:
                    given.add(kind)
                    warnings.append(warning)
        notices = [
            notice
            for item in service.analyse(repeated).to_dict()["entries"]
            for notice in item["notices"]
        ][:1]
        return {
            "notation": reports[0]["notation"],
            "warnings": warnings,
            "notices": notices,
            "files": [
                service.analyse(never).to_dict()["files"],
                service.analyse(partly).to_dict()["files"],
                reports[2]["files"],
            ],
            "times": [[seconds, format_time(seconds)] for seconds in TIMES],
        }
    finally:
        db.close_all()


def test_the_fixture_is_what_the_engine_answers(tmp_path):
    produced = produce(tmp_path)
    text = json.dumps(produced, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if WRITE:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(text, encoding="utf-8", newline="\n")
    assert FIXTURE.exists(), (
        "write setWarnings.fixture.json with CUEPOINT_WRITE_FIXTURES=1"
    )
    assert FIXTURE.read_text(encoding="utf-8") == text, (
        "setWarnings.fixture.json is not what the engine answers now; write it"
        " again with CUEPOINT_WRITE_FIXTURES=1 and read the diff"
    )


def test_the_fixture_covers_every_warning_and_notice(tmp_path):
    produced = produce(tmp_path)
    assert [(w["kind"], w["detail"]) for w in produced["warnings"]] == list(WARNINGS)
    assert [(n["kind"], n["detail"]) for n in produced["notices"]] == list(NOTICES)


def test_the_fixture_covers_every_file_check_state(tmp_path):
    never, partly, checked = produce(tmp_path)["files"]
    assert never["never_checked"] and never["unchecked"] == never["tracks"] > 0
    assert not partly["never_checked"] and partly["unchecked"] == 1
    assert checked["unchecked"] == 0 and checked["missing"] == 2
