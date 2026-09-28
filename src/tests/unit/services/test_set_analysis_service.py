#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's warnings over a real library (PREP-05, DEC-106).

Through the real repositories and migrations:

- **Effective values** (DEC-068): an override is what a transition compares.
- **File checks** (DEC-073, DEC-088): a missing file, a drive that was not
  there, an unreadable file, a check made before a refresh moved the file
  (which is not a check of it), and a Set never checked, which says so.
- **A shortened track** keeps its times and makes them a warning.
- **Keys on the wire** are in the library's notation.
- **Acknowledgements**: made against what is there, stale after a reorder, a
  replaced neighbour or a new BPM override, holding across an unrelated edit and
  across a change of the library's notation, withdrawn, and refused for anything
  that is not a transition warning on two adjacent entries.
- **Nothing else is written.**
- **The shared rule** (fact 6): every track PREP-04 suggests for a gap,
  inserted there, has no tempo jump on either of its transitions.
"""

from __future__ import annotations

import json
import random
from typing import Dict, List, Optional, Tuple

import pytest

from cuepoint.core.set_analysis import (
    DRIVE_UNAVAILABLE,
    FILE_MISSING_WARNING,
    FILE_UNREADABLE_WARNING,
    KEY_CLASH,
    NOT_FOUND,
    REPEAT,
    TEMPO_JUMP,
    TIME_OUTSIDE_TRACK,
)
from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, Collection
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
from cuepoint.persistence.similarity_repository import SimilarityRepository
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.set_analysis_service import (
    SetAnalysisReport,
    SetAnalysisService,
)
from cuepoint.services.set_service import SetService
from cuepoint.services.set_suggestion_service import SetSuggestionService

pytestmark = pytest.mark.unit

CHECKED = "2026-09-20T09:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class Library:
    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.meta = TrackMetadataRepository(db)
        self.files = FileStatusRepository(db)
        self.collections = CollectionRepository(db)
        self.set_repo = SetRepository(db)
        self.sets = SetService(self.collections, self.set_repo, db)
        self.service = SetAnalysisService(
            self.collections, self.set_repo, self.tracks, db
        )
        self.count = 0

    def add(
        self,
        *,
        bpm: Optional[float] = 124.0,
        key: Optional[str] = "8A",
        length: Optional[int] = 300,
        artist: str = "A",
        genre: Optional[str] = None,
    ) -> int:
        self.count += 1
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=str(self.count),
                file_path=f"/m/{self.count}.mp3",
                title=f"T{self.count}",
                artist=artist,
                bpm=bpm,
                key=key,
                genre=genre,
                duration_seconds=length,
            )
        )
        assert stored.id is not None
        return stored.id

    def make_set(
        self, track_ids: List[int], name: str = "Friday"
    ) -> Tuple[int, List[int]]:
        set_id = int(self.collections.create(Collection(name=name, kind=KIND_SET)).id)
        if track_ids:
            self.collections.append(set_id, track_ids)
        return set_id, self.entries(set_id)

    def entries(self, set_id: int) -> List[int]:
        return [int(e.id) for e in self.collections.entries(set_id)]

    def check(
        self, track_id: int, status: str, reason: Optional[str] = None, path=None
    ):
        self.files.record(
            [
                TrackFileStatus(
                    track_id=track_id,
                    status=status,
                    checked_path=path or f"/m/{track_id}.mp3",
                    checked_at=CHECKED,
                    size_bytes=1000 if status == FILE_PRESENT else None,
                    reason=reason,
                )
            ]
        )


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


def wire(lib: Library, set_id: int) -> Dict:
    return lib.service.analyse(set_id).to_dict()


def transition_kinds(report: Dict) -> Dict[Tuple[int, int], List[Tuple[str, bool]]]:
    return {
        (t["from_entry_id"], t["to_entry_id"]): [
            (w["kind"], w["acknowledged"]) for w in t["warnings"]
        ]
        for t in report["transitions"]
    }


# ------------------------------------------------------------------ values


class TestTheValuesRead:
    def test_an_override_is_what_is_compared(self, lib):
        first, second = lib.add(bpm=124.0), lib.add(bpm=125.0)
        set_id, entries = lib.make_set([first, second])
        assert wire(lib, set_id)["counts"] == {}
        lib.meta.set_override(second, "bpm", 140.0)
        assert wire(lib, set_id)["counts"] == {TEMPO_JUMP: 1}
        lib.meta.set_override(second, "key", "3B")
        assert wire(lib, set_id)["counts"] == {TEMPO_JUMP: 1, KEY_CLASH: 1}

    def test_what_is_not_a_value_is_unknown(self, lib):
        zero, bad_key = lib.add(bpm=None, key="x"), lib.add()
        set_id, _ = lib.make_set([zero, bad_key])
        [transition] = wire(lib, set_id)["transitions"]
        assert [(w["kind"], w["detail"]) for w in transition["warnings"]] == [
            ("tempo_unknown", "from"),
            ("key_unknown", "from"),
        ]

    def test_keys_are_written_in_the_librarys_notation(self, lib):
        camelot = [lib.add(key="8A"), lib.add(key="3B")]
        set_id, _ = lib.make_set(camelot)
        [clash] = wire(lib, set_id)["transitions"][0]["warnings"]
        assert clash["compared"] == {"from": "8A", "to": "3B"}
        for _ in range(3):
            lib.add(key="Am")  # the library now reads classic
        report = wire(lib, set_id)
        assert report["notation"] == "classic"
        assert report["transitions"][0]["warnings"][0]["compared"] == {
            "from": "Am",
            "to": "Db",
        }


# ------------------------------------------------------------------- files


class TestFiles:
    def test_missing_unreadable_and_a_drive_that_was_not_there(self, lib):
        tracks = [lib.add() for _ in range(4)]
        lib.check(tracks[0], FILE_MISSING)
        lib.check(tracks[1], FILE_MISSING, REASON_ROOT_UNAVAILABLE)
        lib.check(tracks[2], FILE_UNREADABLE)
        lib.check(tracks[3], FILE_PRESENT)
        set_id, entries = lib.make_set(tracks)
        report = wire(lib, set_id)
        found = {
            e["entry_id"]: [(w["kind"], w["detail"]) for w in e["warnings"]]
            for e in report["entries"]
        }
        assert found == {
            entries[0]: [(FILE_MISSING_WARNING, NOT_FOUND)],
            entries[1]: [(FILE_MISSING_WARNING, DRIVE_UNAVAILABLE)],
            entries[2]: [(FILE_UNREADABLE_WARNING, "unreadable")],
        }
        assert report["entries"][0]["warnings"][0]["compared"] == {
            "checked_at": CHECKED
        }
        assert report["files"] == {
            "tracks": 4,
            "checked": 4,
            "unchecked": 0,
            "missing": 2,
            "unreadable": 1,
            "never_checked": False,
            "last_checked_at": CHECKED,
        }

    def test_a_set_never_checked_says_so_rather_than_nothing_missing(self, lib):
        set_id, _ = lib.make_set([lib.add(), lib.add()])
        files = wire(lib, set_id)["files"]
        assert files["never_checked"] is True
        assert files["missing"] == 0 and files["unchecked"] == 2
        assert files["last_checked_at"] is None

    def test_a_check_of_a_path_the_track_no_longer_has_is_no_check(self, lib):
        """A refresh moved the file: the old finding answers for another path."""
        track = lib.add()
        lib.check(track, FILE_MISSING, path="/old/place.mp3")
        set_id, _ = lib.make_set([track])
        report = wire(lib, set_id)
        assert report["entries"] == []
        assert report["files"]["never_checked"] is True


# ------------------------------------------------------------------- times


class TestTimes:
    def test_a_shortened_track_makes_its_times_a_warning(self, lib, db):
        track = lib.add(length=300)
        set_id, entries = lib.make_set([track])
        lib.sets.set_entry_times(entries[0], "0:30", "4:30")
        assert wire(lib, set_id)["entries"] == []
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET duration_seconds = 240 WHERE id = ?", (track,)
            )
        [found] = wire(lib, set_id)["entries"]
        [warning] = found["warnings"]
        assert (warning["kind"], warning["detail"]) == (TIME_OUTSIDE_TRACK, "out")
        assert warning["compared"] == {"length": 240, "in": 30, "out": 270}
        assert lib.sets.plan(set_id).entries[0].out_seconds == 270  # nothing rewritten

    def test_chapter_targets_read_the_plan(self, lib):
        tracks = [lib.add(bpm=bpm) for bpm in (120.0, 121.0, 128.0)]
        set_id, entries = lib.make_set(tracks)
        chapter = int(lib.collections.chapters(set_id)[0].id)
        lib.sets.set_chapter_targets(chapter, 600, 118.0, 122.0)
        for entry in entries:
            lib.sets.set_entry_times(entry, None, "3:00")
        [found] = wire(lib, set_id)["chapters"]
        assert found["running_time"] == {"seconds": 540, "timed": 3, "untimed": 0}
        assert [(w["kind"], w["detail"]) for w in found["warnings"]] == [
            ("under_target", "all_timed"),
            ("bpm_outside_range", "above"),
        ]
        assert found["warnings"][1]["compared"]["entries"] == [
            {"entry_id": entries[2], "bpm": 128.0}
        ]

    def test_a_repeat_is_a_notice(self, lib):
        first, second = lib.add(), lib.add()
        set_id, entries = lib.make_set([first, second, first])
        report = wire(lib, set_id)
        assert report["notices"] == {REPEAT: 2}
        notices = {e["entry_id"]: e["notices"] for e in report["entries"]}
        assert notices[entries[0]] == [
            {"kind": "repeat", "detail": "track", "compared": {"others": [2]}}
        ]
        assert report["counts"] == {}


# ------------------------------------------------------------------ the wire


class TestTheWire:
    def test_the_shape(self, lib):
        tracks = [lib.add(bpm=120.0), lib.add(bpm=140.0), lib.add(bpm=140.0)]
        set_id, entries = lib.make_set(tracks)
        report = wire(lib, set_id)
        assert set(report) == {
            "set_id",
            "notation",
            "running_time",
            "counts",
            "acknowledged",
            "notices",
            "files",
            "transitions",
            "entries",
            "chapters",
        }
        # Only what found something is listed; every chapter is.
        assert [
            (t["from_entry_id"], t["to_entry_id"]) for t in report["transitions"]
        ] == [(entries[0], entries[1])]
        [jump] = report["transitions"][0]["warnings"]
        assert jump == {
            "kind": "tempo_jump",
            "detail": "faster",
            "compared": {"from": 120.0, "to": 140.0, "percent": 16.7},
            "acknowledged": False,
        }
        assert len(report["chapters"]) == 1
        assert json.loads(json.dumps(report)) == report

    def test_refusals(self, lib):
        crate = int(
            lib.collections.create(Collection(name="Crate", kind=KIND_COLLECTION)).id
        )
        with pytest.raises(ValueError, match="'Crate' is a collection, not a Set"):
            lib.service.analyse(crate)
        with pytest.raises(ValueError, match="No such Set"):
            lib.service.analyse(999_999)

    def test_an_empty_set(self, lib):
        set_id, _ = lib.make_set([])
        report = wire(lib, set_id)
        assert report["transitions"] == [] and report["entries"] == []
        assert report["files"]["never_checked"] is False


# ------------------------------------------------------------ acknowledging


class TestAcknowledging:
    @pytest.fixture
    def jump(self, lib):
        tracks = [
            lib.add(bpm=120.0, key="8A"),
            lib.add(bpm=140.0, key="8A"),
            lib.add(bpm=140.0, key="8A"),
        ]
        set_id, entries = lib.make_set(tracks)
        return set_id, entries, tracks

    def test_it_accepts_what_is_there(self, lib, jump):
        set_id, entries, _ = jump
        stored = lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        assert stored.collection_id == set_id
        assert stored.compared == {"from": 120.0, "to": 140.0, "percent": 16.7}
        report = wire(lib, set_id)
        assert transition_kinds(report) == {
            (entries[0], entries[1]): [(TEMPO_JUMP, True)]
        }
        assert report["counts"] == {} and report["acknowledged"] == 1

    def test_acknowledging_again_changes_nothing(self, lib, jump):
        set_id, entries, _ = jump
        first = lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        again = lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        assert again == first

    def test_a_reorder_makes_it_stale(self, lib, jump):
        set_id, entries, _ = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        lib.sets.move_entry(entries[0], 2)  # 140, 140, 120
        report = wire(lib, set_id)
        assert report["acknowledged"] == 0 and report["counts"] == {TEMPO_JUMP: 1}
        lib.sets.move_entry(entries[0], 0)  # back: it applies again
        assert wire(lib, set_id)["acknowledged"] == 1

    def test_a_replaced_neighbour_makes_it_stale(self, lib, jump):
        set_id, entries, tracks = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        replacement = lib.add(bpm=140.0)
        lib.collections.remove_entries([entries[1]])
        lib.collections.insert_at(set_id, replacement, 1)
        report = wire(lib, set_id)
        assert report["acknowledged"] == 0 and report["counts"] == {TEMPO_JUMP: 1}

    def test_a_new_bpm_override_makes_it_stale(self, lib, jump):
        set_id, entries, tracks = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        lib.meta.set_override(tracks[1], "bpm", 145.0)
        report = wire(lib, set_id)
        assert report["acknowledged"] == 0 and report["counts"] == {TEMPO_JUMP: 1}
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        assert wire(lib, set_id)["acknowledged"] == 1

    def test_it_holds_across_an_unrelated_edit(self, lib, jump):
        set_id, entries, _ = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        lib.sets.set_entry_note(entries[1], "bring the bass in early")
        lib.sets.set_entry_times(entries[2], None, "3:00")
        chapter = int(lib.collections.chapters(set_id)[0].id)
        lib.sets.rename_chapter(chapter, "Warm-up")
        lib.collections.add(set_id, [lib.add(bpm=90.0)])  # a jump elsewhere
        report = wire(lib, set_id)
        assert report["acknowledged"] == 1
        assert report["counts"] == {TEMPO_JUMP: 1}  # only the new one

    def test_it_holds_across_a_change_of_notation(self, lib):
        tracks = [lib.add(key="8A"), lib.add(key="3B")]
        set_id, entries = lib.make_set(tracks)
        lib.service.acknowledge(entries[0], entries[1], KEY_CLASH)
        for _ in range(3):
            lib.add(key="Am")
        report = wire(lib, set_id)
        assert report["notation"] == "classic" and report["acknowledged"] == 1

    def test_it_is_withdrawn(self, lib, jump):
        set_id, entries, _ = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        assert lib.service.unacknowledge(entries[0], entries[1], TEMPO_JUMP) is True
        assert lib.service.unacknowledge(entries[0], entries[1], TEMPO_JUMP) is False
        assert wire(lib, set_id)["counts"] == {TEMPO_JUMP: 1}

    def test_it_goes_with_its_entry(self, lib, jump):
        set_id, entries, _ = jump
        lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
        lib.collections.remove_entries([entries[1]])
        assert lib.collections.acknowledgements(set_id) == []

    def test_refusals_write_nothing(self, lib, jump, db):
        set_id, entries, _ = jump
        other, others = lib.make_set([lib.add(), lib.add()], name="Saturday")
        crate = int(
            lib.collections.create(Collection(name="Crate", kind=KIND_COLLECTION)).id
        )
        lib.collections.add(crate, [lib.add()])
        crate_entry = lib.entries(crate)[0]
        cases = [
            ((entries[0], entries[1], "file_missing"), "Only a transition's warnings"),
            ((entries[0], entries[1], "nonsense"), "Only a transition's warnings"),
            ((entries[0], entries[2], TEMPO_JUMP), "does not follow"),
            ((entries[1], entries[0], TEMPO_JUMP), "does not follow"),
            ((entries[1], entries[2], TEMPO_JUMP), "There is no tempo_jump"),
            ((entries[0], entries[1], KEY_CLASH), "There is no key_clash"),
            ((entries[2], others[0], TEMPO_JUMP), "different Sets"),
            ((crate_entry, entries[0], TEMPO_JUMP), "No such entry in a Set"),
            ((entries[0], 999_999, TEMPO_JUMP), "No such entry in a Set"),
        ]
        for args, match in cases:
            with pytest.raises(ValueError, match=match):
                lib.service.acknowledge(*args)
        assert lib.collections.acknowledgements(set_id) == []
        with pytest.raises(ValueError, match="not a transition warning"):
            lib.service.unacknowledge(entries[0], entries[1], "over_target")


# --------------------------------------------------------- nothing else written


def test_checking_writes_nothing_and_acknowledging_only_its_row(lib, db):
    tracks = [lib.add(bpm=120.0), lib.add(bpm=140.0)]
    lib.check(tracks[0], FILE_MISSING)
    set_id, entries = lib.make_set(tracks)

    def everything(skip=()):
        conn = db.connect()
        names = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
                " AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            if r["name"] not in skip
        ]
        return {
            n: [tuple(r) for r in conn.execute(f"SELECT * FROM {n}")] for n in names
        }

    before = everything()
    lib.service.analyse(set_id)
    assert everything() == before
    lib.service.acknowledge(entries[0], entries[1], TEMPO_JUMP)
    assert everything(skip=("set_acknowledgements",)) == {
        k: v for k, v in before.items() if k != "set_acknowledgements"
    }
    assert len(everything()["set_acknowledgements"]) == 1


# ------------------------------------------------------------- the shared rule


def test_every_suggestion_inserted_at_its_gap_never_jumps(lib, db):
    """PREP's fact 6, through both real services: for a seeded library, every
    track Suggestions offer for a gap, inserted there, has no tempo jump on
    either of its transitions."""
    rnd = random.Random(5)
    for _ in range(160):
        lib.add(
            bpm=rnd.choice(
                [
                    None,
                    62.0,
                    64.0,
                    118.0,
                    120.0,
                    122.5,
                    124.0,
                    126.0,
                    128.0,
                    131.0,
                    136.0,
                    140.0,
                ]
            ),
            key=rnd.choice([None, "8A", "9A", "3B", "12A", "1A"]),
            artist=rnd.choice(["A", "B", "C"]),
            genre=rnd.choice([None, "House", "Techno"]),
        )
    order = [t for t in rnd.sample(range(1, 161), 60) if t][:12]
    set_id, _ = lib.make_set(order)
    suggest = SetSuggestionService(
        lib.collections,
        lib.set_repo,
        SimilarityRepository(db),
        TrackCreditRepository(db),
        lib.tracks,
    )
    tried = 0
    for gap in range(len(order) + 1):
        entries = lib.entries(set_id)
        before = entries[gap - 1] if gap > 0 else None
        after = entries[gap] if gap < len(entries) else None
        answer = suggest.suggest(
            set_id, before_entry_id=before, after_entry_id=after, limit=12
        )
        for suggestion in answer.suggestions:
            placed = lib.collections.insert_at(set_id, suggestion.track_id, gap)
            report = lib.service.analyse(set_id).to_dict()
            around = {
                (t["from_entry_id"], t["to_entry_id"]): [
                    w["kind"] for w in t["warnings"]
                ]
                for t in report["transitions"]
            }
            for pair in ((before, placed.id), (placed.id, after)):
                if None not in pair:
                    assert TEMPO_JUMP not in around.get(pair, []), (
                        gap,
                        suggestion.track_id,
                    )
            lib.collections.remove_entries([int(placed.id)])
            tried += 1
    assert tried > 40, "the seeded library should give suggestions to try"


def test_the_container_builds_the_service(tmp_path, monkeypatch):
    from cuepoint.services import database_service as database_service_module
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService, ISetAnalysisService
    from cuepoint.utils.di_container import get_container, reset_container

    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "c.db"
    )
    reset_container()
    try:
        bootstrap_services()
        service = get_container().resolve(ISetAnalysisService)
        assert isinstance(service, SetAnalysisService)
        with pytest.raises(ValueError, match="No such Set"):
            service.analyse(1)
    finally:
        get_container().resolve(IDatabaseService).close_all()
        reset_container()


def test_a_report_is_its_analysis(lib):
    set_id, _ = lib.make_set([lib.add()])
    report = lib.service.analyse(set_id)
    assert isinstance(report, SetAnalysisReport)
    assert report.set.id == set_id and report.analysis.entries[0].warnings == ()
