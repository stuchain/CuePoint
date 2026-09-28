#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The models over m0025's tables (PREP-01).

Three promises:

- **Each model is exactly its table.** Its persisted row names every column the
  table has, and nothing else — except ``set_details.kind``, a constant the
  database fills and the model never varies.
- **A real row round-trips.** Each model is written through ``to_dict`` into a
  migrated database and read back through ``from_row`` unchanged.
- **Every refusal says what was wrong.** What the database would refuse is
  refused here first, with the field named, and so are the things the database
  cannot see: a fractional second, a blank note kept as blank, a name too long to
  be a heading, comparison data that is not a JSON object.
"""

from __future__ import annotations

import json
from typing import Any, Dict

import pytest

from cuepoint.models.collection import KIND_SET, KINDS, Collection
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_export import (
    EXPORTED_KINDS,
    RekordboxExportPlaylist,
)
from cuepoint.models.set_plan import (
    MAX_CHAPTER_NAME_LENGTH,
    MAX_WARNING_LENGTH,
    SetAcknowledgement,
    SetChapter,
    SetDetails,
    SetEntryPlan,
    SetEntryRow,
    normalize_chapter_name,
)
from cuepoint.models.track_metadata import MAX_NOTES_LENGTH
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures import legacy_rows

pytestmark = pytest.mark.unit

NOW = "2026-09-28T12:00:00+00:00"


# ----------------------------------------------------------- the vocabulary


class TestTheSetKind:
    def test_a_set_is_a_kind_of_node(self):
        assert KIND_SET == "set"
        assert KIND_SET in KINDS
        assert Collection(name="Friday", kind=KIND_SET).kind == KIND_SET

    def test_a_set_exports_as_a_playlist(self):
        assert KIND_SET in EXPORTED_KINDS

    def test_a_sets_export_row_records_entries_not_rules(self):
        assert (
            RekordboxExportPlaylist(
                export_id=1,
                kind=KIND_SET,
                name="Friday",
                path="CuePoint/Friday",
                entry_count=3,
            ).rules_json
            is None
        )
        with pytest.raises(ValueError, match="A Set exported its stored entries"):
            RekordboxExportPlaylist(
                export_id=1,
                kind=KIND_SET,
                name="Friday",
                path="CuePoint/Friday",
                entry_count=3,
                rules_json='{"match": "all", "rules": []}',
            )


# ---------------------------------------------------------------- the rows


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def a_set(db) -> Dict[str, int]:
    """A Set node with details, one chapter and two entries, as SQL."""
    track = legacy_rows.add_track(
        db,
        LibraryTrack(
            rekordbox_track_id="1", file_path="/m/1.mp3", title="T", artist="A"
        ),
    )
    with db.transaction() as conn:
        node = conn.execute(
            "INSERT INTO collections (kind, name, position, depth, created_at,"
            " updated_at) VALUES ('set', 'Friday', 0, 0, ?, ?)",
            (NOW, NOW),
        ).lastrowid
        entries = [
            conn.execute(
                "INSERT INTO collection_tracks (collection_id, track_id, position,"
                " added_at) VALUES (?, ?, ?, ?)",
                (node, track, position, NOW),
            ).lastrowid
            for position in range(2)
        ]
    return {"set": int(node), "first": int(entries[0]), "second": int(entries[1])}


def columns(db, table: str):
    return [r["name"] for r in db.connect().execute(f"PRAGMA table_info({table})")]


def insert(db, table: str, row: Dict[str, Any]) -> int:
    data = {k: v for k, v in row.items() if not (k == "id" and v is None)}
    names = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    with db.transaction() as conn:
        cursor = conn.execute(
            f"INSERT INTO {table} ({names}) VALUES ({marks})", tuple(data.values())
        )
        return int(cursor.lastrowid)


def read(db, table: str, where: str, value: int):
    return (
        db.connect()
        .execute(f"SELECT * FROM {table} WHERE {where} = ?", (value,))
        .fetchone()
    )


class TestEachModelIsExactlyItsTable:
    def test_details(self, db):
        # ``kind`` is a constant the database fills: DEFAULT 'set', CHECK = 'set'.
        assert list(SetDetails(collection_id=1).to_dict()) == [
            c for c in columns(db, "set_details") if c != "kind"
        ]

    def test_chapter(self, db):
        assert list(SetChapter(collection_id=1).to_dict()) == columns(
            db, "set_chapters"
        )

    def test_entry_plan(self, db):
        assert list(
            SetEntryPlan(entry_id=1, collection_id=1, chapter_id=1).to_dict()
        ) == columns(db, "set_entries")

    def test_acknowledgement(self, db):
        row = SetAcknowledgement(
            collection_id=1,
            from_entry_id=1,
            to_entry_id=2,
            warning="key_clash",
            compared_json="{}",
        ).to_dict()
        assert list(row) == columns(db, "set_acknowledgements")


class TestARealRowRoundTrips:
    def test_all_four(self, db, a_set):
        details = SetDetails(
            collection_id=a_set["set"],
            notes="Two hours, early slot",
            created_at=NOW,
            updated_at=NOW,
        )
        insert(db, "set_details", details.to_dict())
        assert (
            SetDetails.from_row(read(db, "set_details", "collection_id", a_set["set"]))
            == details
        )

        chapter = SetChapter(
            collection_id=a_set["set"],
            position=0,
            name="Warm-up",
            notes="Keep it deep",
            target_seconds=2700,
            bpm_min=118.0,
            bpm_max=122.5,
            created_at=NOW,
            updated_at=NOW,
        )
        chapter_id = insert(db, "set_chapters", chapter.to_dict())
        stored_chapter = SetChapter.from_row(read(db, "set_chapters", "id", chapter_id))
        assert stored_chapter.to_dict() == {**chapter.to_dict(), "id": chapter_id}

        plans = [
            SetEntryPlan(
                entry_id=a_set["first"],
                collection_id=a_set["set"],
                chapter_id=chapter_id,
                in_seconds=15,
                out_seconds=250,
                note="Loop the intro",
            ),
            SetEntryPlan(
                entry_id=a_set["second"],
                collection_id=a_set["set"],
                chapter_id=chapter_id,
            ),
        ]
        for plan in plans:
            insert(db, "set_entries", plan.to_dict())
            assert (
                SetEntryPlan.from_row(
                    read(db, "set_entries", "entry_id", plan.entry_id)
                )
                == plan
            )

        compared = json.dumps({"from": "8A", "to": "3B"}, sort_keys=True)
        ack = SetAcknowledgement(
            collection_id=a_set["set"],
            from_entry_id=a_set["first"],
            to_entry_id=a_set["second"],
            warning="key_clash",
            compared_json=compared,
            created_at=NOW,
        )
        ack_id = insert(db, "set_acknowledgements", ack.to_dict())
        stored_ack = SetAcknowledgement.from_row(
            read(db, "set_acknowledgements", "id", ack_id)
        )
        assert stored_ack.to_dict() == {**ack.to_dict(), "id": ack_id}
        assert stored_ack.compared == {"from": "8A", "to": "3B"}

    def test_an_unnamed_chapter_with_no_targets(self, db, a_set):
        insert(db, "set_details", SetDetails(collection_id=a_set["set"]).to_dict())
        chapter = SetChapter(collection_id=a_set["set"])
        chapter_id = insert(db, "set_chapters", chapter.to_dict())
        stored = SetChapter.from_row(read(db, "set_chapters", "id", chapter_id))
        assert stored.is_unnamed
        assert not stored.has_bpm_range
        assert (stored.target_seconds, stored.bpm_min, stored.bpm_max) == (
            None,
            None,
            None,
        )


# ----------------------------------------------------------------- refusals


class TestSetDetails:
    @pytest.mark.parametrize("value", [None, 0, -1, True, "x"])
    def test_a_node_id_is_required_and_positive(self, value):
        with pytest.raises(ValueError, match="collection_id"):
            SetDetails(collection_id=value)

    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_blank_notes_are_no_notes(self, value):
        assert SetDetails(collection_id=1, notes=value).notes is None

    def test_notes_are_trimmed(self):
        assert (
            SetDetails(collection_id=1, notes="  Early slot \n").notes == "Early slot"
        )

    def test_notes_have_the_libraries_limit(self):
        SetDetails(collection_id=1, notes="x" * MAX_NOTES_LENGTH)
        with pytest.raises(ValueError, match="at most"):
            SetDetails(collection_id=1, notes="x" * (MAX_NOTES_LENGTH + 1))


class TestSetChapter:
    def test_a_name_is_trimmed_and_may_be_empty(self):
        assert SetChapter(collection_id=1, name="  Peak ").name == "Peak"
        assert SetChapter(collection_id=1, name=None).name == ""  # type: ignore[arg-type]
        assert SetChapter(collection_id=1, name="   ").is_unnamed

    def test_a_name_is_a_heading_not_a_description(self):
        normalize_chapter_name("x" * MAX_CHAPTER_NAME_LENGTH)
        with pytest.raises(ValueError, match="chapter name"):
            SetChapter(collection_id=1, name="x" * (MAX_CHAPTER_NAME_LENGTH + 1))

    @pytest.mark.parametrize("value", [-1, 1.5, True, "first"])
    def test_a_position_is_a_whole_number_from_zero(self, value):
        with pytest.raises(ValueError, match="position"):
            SetChapter(collection_id=1, position=value)

    @pytest.mark.parametrize("value", [0, -60, 12.5, True, "an hour"])
    def test_a_target_is_whole_seconds_above_zero(self, value):
        with pytest.raises(ValueError, match="target_seconds"):
            SetChapter(collection_id=1, target_seconds=value)

    def test_a_target_of_a_second_is_accepted(self):
        assert SetChapter(collection_id=1, target_seconds=1).target_seconds == 1

    @pytest.mark.parametrize("field", ["bpm_min", "bpm_max"])
    @pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf"), True, "fast"])
    def test_each_end_of_a_range_is_a_tempo(self, field, value):
        with pytest.raises(ValueError, match=field):
            SetChapter(collection_id=1, **{field: value})

    def test_a_range_must_run_upwards(self):
        with pytest.raises(ValueError, match="run upwards"):
            SetChapter(collection_id=1, bpm_min=128, bpm_max=120)
        assert SetChapter(collection_id=1, bpm_min=124, bpm_max=124).has_bpm_range
        assert SetChapter(collection_id=1, bpm_min=124).has_bpm_range
        assert SetChapter(collection_id=1, bpm_max=124).has_bpm_range

    def test_an_id_must_be_one_sqlite_could_have_given(self):
        with pytest.raises(ValueError, match="id"):
            SetChapter(collection_id=1, id=0)

    def test_touch_moves_the_update_time(self):
        long_ago = "2020-01-01T00:00:00+00:00"
        chapter = SetChapter(collection_id=1, created_at=long_ago, updated_at=long_ago)
        chapter.touch()
        assert chapter.updated_at > long_ago
        assert chapter.created_at == long_ago


class TestSetEntryPlan:
    def plan(self, **values) -> SetEntryPlan:
        return SetEntryPlan(entry_id=1, collection_id=2, chapter_id=3, **values)

    @pytest.mark.parametrize("field", ["entry_id", "collection_id", "chapter_id"])
    @pytest.mark.parametrize("value", [None, 0, -4, True])
    def test_every_reference_is_required(self, field, value):
        values = {"entry_id": 1, "collection_id": 2, "chapter_id": 3, field: value}
        with pytest.raises(ValueError, match=field):
            SetEntryPlan(**values)

    def test_an_untimed_entry(self):
        plan = self.plan()
        assert not plan.is_timed
        assert plan.planned_seconds is None

    def test_an_in_time_alone_does_not_time_an_entry(self):
        plan = self.plan(in_seconds=30)
        assert not plan.is_timed
        assert plan.planned_seconds is None

    def test_an_out_time_alone_plays_from_the_start(self):
        plan = self.plan(out_seconds=240)
        assert plan.is_timed
        assert plan.planned_seconds == 240

    def test_both_times(self):
        assert self.plan(in_seconds=0, out_seconds=1).planned_seconds == 1
        assert self.plan(in_seconds=45, out_seconds=300).planned_seconds == 255

    @pytest.mark.parametrize("value", [-1, 1.5, True, "0:30"])
    def test_an_in_time_is_whole_seconds_from_zero(self, value):
        with pytest.raises(ValueError, match="in_seconds"):
            self.plan(in_seconds=value)

    @pytest.mark.parametrize("value", [0, -1, 240.5, True, "4:00"])
    def test_an_out_time_is_whole_seconds_above_zero(self, value):
        with pytest.raises(ValueError, match="out_seconds"):
            self.plan(out_seconds=value)

    @pytest.mark.parametrize("in_seconds, out_seconds", [(300, 300), (301, 300)])
    def test_an_entry_comes_in_before_it_goes_out(self, in_seconds, out_seconds):
        with pytest.raises(ValueError, match="before it goes out"):
            self.plan(in_seconds=in_seconds, out_seconds=out_seconds)

    def test_a_whole_number_given_as_a_float_is_kept_whole(self):
        plan = self.plan(in_seconds=30.0, out_seconds=90.0)
        assert (plan.in_seconds, plan.out_seconds) == (30, 90)
        assert isinstance(plan.in_seconds, int) and isinstance(plan.out_seconds, int)

    def test_a_note(self):
        assert self.plan(note="  Loop the intro ").note == "Loop the intro"
        assert self.plan(note="  ").note is None


class TestSetAcknowledgement:
    def ack(self, **values) -> SetAcknowledgement:
        base: Dict[str, Any] = {
            "collection_id": 1,
            "from_entry_id": 2,
            "to_entry_id": 3,
            "warning": "tempo_jump",
            "compared_json": '{"from": 122.0, "to": 131.0}',
        }
        base.update(values)
        return SetAcknowledgement(**base)

    def test_it_reads_back_what_was_compared(self):
        assert self.ack().compared == {"from": 122.0, "to": 131.0}

    def test_a_transition_runs_between_two_entries(self):
        with pytest.raises(ValueError, match="two different entries"):
            self.ack(from_entry_id=2, to_entry_id=2)

    @pytest.mark.parametrize("field", ["collection_id", "from_entry_id", "to_entry_id"])
    def test_every_reference_is_required(self, field):
        with pytest.raises(ValueError, match=field):
            self.ack(**{field: None})

    @pytest.mark.parametrize(
        "value",
        ["", "  ", None, " key_clash", "key_clash ", "x" * (MAX_WARNING_LENGTH + 1)],
    )
    def test_a_warning_is_a_warnings_name(self, value):
        with pytest.raises(ValueError, match="warning"):
            self.ack(warning=value)

    @pytest.mark.parametrize(
        "value", ["", "not json", "[1, 2]", "12", '"text"', "null", None]
    )
    def test_what_was_compared_is_a_json_object(self, value):
        with pytest.raises(ValueError, match="compared_json"):
            self.ack(compared_json=value)

    def test_it_cannot_be_changed_once_made(self):
        ack = self.ack()
        with pytest.raises(AttributeError):
            ack.warning = "key_clash"  # type: ignore[misc]


@pytest.mark.unit
class TestChapterLabel:
    """How a refusal names a chapter (PREP-03)."""

    def test_by_name(self):
        assert SetChapter(collection_id=1, position=3, name="Peak").label == "'Peak'"

    def test_by_place_when_unnamed(self):
        assert SetChapter(collection_id=1, position=0).label == "chapter 1"
        assert SetChapter(collection_id=1, position=4, name="  ").label == "chapter 5"


@pytest.mark.unit
class TestSetEntryRow:
    """An entry as a Set's plan reads it (PREP-03); not a table."""

    def plan(self, **values: Any) -> SetEntryPlan:
        return SetEntryPlan(entry_id=7, collection_id=1, chapter_id=2, **values)

    def test_from_a_joined_row(self):
        row = SetEntryRow.from_row(
            {
                "position": 3,
                "track_id": 11,
                "entry_id": 7,
                "collection_id": 1,
                "chapter_id": 2,
                "in_seconds": 10,
                "out_seconds": 250,
                "note": "early",
                "length_seconds": 300,
            }
        )
        assert (row.position, row.track_id, row.entry_id, row.length_seconds) == (
            3,
            11,
            7,
            300,
        )
        assert row.plan == self.plan(in_seconds=10, out_seconds=250, note="early")

    @pytest.mark.parametrize("stored", [None, 0, -5])
    def test_a_length_that_is_not_one_reads_as_unknown(self, stored):
        row = SetEntryRow(
            position=0, track_id=1, plan=self.plan(), length_seconds=stored
        )
        assert row.length_seconds is None

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("position", -1),
            ("track_id", None),
            ("track_id", 0),
            ("length_seconds", 1.5),
        ],
    )
    def test_refusals_name_their_field(self, field, value):
        values: Dict[str, Any] = {"position": 0, "track_id": 1, "plan": self.plan()}
        values[field] = value
        with pytest.raises(ValueError, match=field):
            SetEntryRow(**values)

    def test_it_cannot_be_changed_once_made(self):
        row = SetEntryRow(position=0, track_id=1, plan=self.plan())
        with pytest.raises(AttributeError):
            row.position = 2  # type: ignore[misc]
