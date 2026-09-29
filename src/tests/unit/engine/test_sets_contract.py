#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's two copies of every shape agree with what the engine sends (PREP-08).

The engine serializes a plan, the running order, the checks, suggestions, a set
list, and every action's answer and refusal; the Electron client declares each
as a TypeScript type, and the renderer's bridge types copy them
(``desktopContract.test.ts`` holds the two TypeScript copies together). What
neither side can check alone is that the TypeScript agrees with what Python
actually sends, so this does, from Python, against real answers over a real
library rather than a list of keys written out a second time.

A field the engine sends and the client never declares is a value the Prepare
page cannot show; one the client declares and the engine never sends is one it
shows as ``undefined``. Every nested object is held to its own type, and every
vocabulary a union spells is held to the engine's.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Set

import pytest

from cuepoint.core import set_analysis, similarity
from cuepoint.data import set_list_file
from cuepoint.engine import sets_api as api
from cuepoint.engine.api_errors import ApiError
from cuepoint.models.set_suggestions import SIDES
from cuepoint.services.collection_service import SET_SOURCES
from cuepoint.services.set_list_service import (
    DESTINATION_REFUSALS,
    SetListDestinationError,
)
from cuepoint.services.set_suggestion_service import (
    INSERTION_POINT_REASONS,
    InsertionPointError,
)
from tests.unit.engine.test_discover_contract import (
    _client,
    _fields,
    _method_params,
    _union,
    first,
)
from tests.unit.engine.test_engine_library_browse import (
    library_db,  # noqa: F401 — a pytest fixture, used by name
)
from tests.unit.engine.test_sets_api import ids  # noqa: F401 — a fixture, by name

pytestmark = pytest.mark.unit


def holds(interface: str, value: Dict[str, Any]) -> None:
    assert isinstance(value, dict), (interface, value)
    assert _fields(interface) == set(value), interface


def _inline(interface: str, field: str) -> Set[str]:
    """The keys of an object type written inline for one field."""
    text = _client()
    start = text.index(f"export interface {interface} ")
    body = text[start : text.index("\n}", start)]
    line = re.search(rf"^ {{2}}{field}\??: (.*);$", body, re.M)
    assert line, (interface, field)
    inner = line.group(1)
    inner = inner[inner.index("{") + 1 : inner.rindex("}")]
    return set(re.findall(r"(?:^|[{;,]) ?([a-z_]+)\??:", inner))


def call(handler, **body) -> Dict[str, Any]:
    result: Dict[str, Any] = handler(body)
    return result


def query(**values) -> Dict[str, list]:
    return {key: [str(value)] for key, value in values.items()}


@pytest.fixture
def friday(ids):  # noqa: F811 — the fixture is used by name
    """Tracks 1, 2, 3, 4 and 1 again, split into two chapters, with a plan."""
    from cuepoint.utils.di_container import get_container
    from cuepoint.services.interfaces import ICollectionService

    made = call(api.create, name="Friday")["set"]
    service = get_container().resolve(ICollectionService)
    service.add_tracks(made["id"], ids[:4])
    service.insert_track(made["id"], ids[0], 4)
    entries = [e["entry_id"] for e in api.plan(query(set_id=made["id"]))["entries"]]
    call(api.chapter_split, entry_id=entries[2], name="Peak")
    call(api.entry_times, entry_id=entries[0], in_time="0:30", out_time="4:00")
    call(api.entry_note, entry_id=entries[0], note="blend")
    return {"id": made["id"], "entries": entries, "ids": ids}


class TestReads:
    def test_the_plan(self, friday):
        plan = api.plan(query(set_id=friday["id"]))
        holds("SetPlan", plan)
        holds("SetRunningTime", plan["running_time"])
        holds("SetChapterPlan", first(plan["chapters"]))
        holds("SetRunningTime", first(plan["chapters"])["running_time"])
        holds("SetPlannedEntry", first(plan["entries"]))

    def test_the_running_order(self, friday):
        answer = api.entries(query(set_id=friday["id"]))
        holds("SetEntries", answer)
        row = first(answer["entries"])
        holds("SetEntry", row)
        # The Library's own row, every field the engine sends declared.
        assert set(row["track"]) == _fields("LibraryTrackRow")

    def test_the_checks(self, friday):
        answer = api.analysis(query(set_id=friday["id"]))
        holds("SetAnalysis", answer)
        holds("SetRunningTime", answer["running_time"])
        holds("SetFileCheck", answer["files"])
        transition = first(answer["transitions"])
        assert set(transition) == _inline("SetAnalysis", "transitions")
        entry = first(answer["entries"])
        assert set(entry) == _inline("SetAnalysis", "entries")
        chapter = first(answer["chapters"])
        assert set(chapter) == _inline("SetAnalysis", "chapters")
        warning = first(transition["warnings"])
        assert set(warning) == {"kind", "detail", "compared", "acknowledged"}
        holds("SetNotice", first(entry["notices"]))
        # The lanes' values (PREP-11): every entry, each transition.
        holds("SetShape", answer["shape"])
        assert len(answer["shape"]["entries"]) == len(friday["entries"])
        point = first(answer["shape"]["entries"])
        holds("SetShapeEntry", point)
        holds("SetCamelot", point["camelot"])
        step = first(answer["shape"]["transitions"])
        holds("SetShapeTransition", step)
        relations = {t["key_relation"] for t in answer["shape"]["transitions"]}
        assert relations <= {*_union("SetKeyRelation"), None}

    def test_suggestions(self, friday):
        entries = friday["entries"]
        answer = api.suggestions(
            query(
                set_id=friday["id"],
                before_entry_id=entries[0],
                after_entry_id=entries[1],
            )
        )
        holds("SetSuggestions", answer)
        suggestion = first(answer["suggestions"])
        holds("SetSuggestion", suggestion)
        holds("SetSuggestionSide", suggestion["before"])
        # The Library's own row (PREP-11), every field the engine sends declared.
        assert set(suggestion["track"]) == _fields("LibraryTrackRow")
        assert set(answer["unused"]) <= set(SIDES)

    def test_a_chapters_range_and_a_gap_nothing_bridges(self, friday):
        entries = friday["entries"]
        plan = api.plan(query(set_id=friday["id"]))
        peak = plan["chapters"][1]["id"]
        call(api.chapter_update, chapter_id=peak, bpm_min=120, bpm_max=150)
        ranged = api.suggestions(
            query(
                set_id=friday["id"],
                before_entry_id=entries[2],
                after_entry_id=entries[3],
            )
        )
        holds("SetBpmRange", ranged["bpm_range"])
        # 140 then 122: no tempo passes both gates (DEC-096).
        stuck = api.suggestions(
            query(
                set_id=friday["id"],
                before_entry_id=entries[3],
                after_entry_id=entries[4],
            )
        )
        holds("SetNoFit", stuck["no_fit"])
        assert set(stuck["no_fit"]["tempo"]) == _inline("SetNoFit", "tempo")
        assert set(stuck["no_fit"]["key"]) == _inline("SetNoFit", "key")

    def test_the_set_list_text(self, friday):
        holds("SetListText", api.set_list_text(query(set_id=friday["id"])))


class TestActions:
    def test_making_a_set(self, friday):
        made = call(api.create, name="Saturday")
        holds("SetCreated", made)
        holds("CollectionNode", made["set"])
        holds("SetCreated", call(api.duplicate, set_id=friday["id"]))
        copied = call(
            api.create_from,
            source={"kind": "selection", "track_ids": friday["ids"][:2]},
            name="Picked",
        )
        holds("SetCreatedFrom", copied)
        holds("SetSourceUsed", copied["source"])

    def test_notes(self, friday):
        answer = call(api.notes, set_id=friday["id"], notes="USB")
        holds("SetNotesChanged", answer)
        holds("SetDetails", answer["details"])

    def test_chapters(self, friday):
        made = call(api.chapter_create, set_id=friday["id"], name="Close")
        holds("SetChapterChanged", made)
        holds("SetChapter", made["chapter"])
        chapter_id = made["chapter"]["id"]
        holds(
            "SetChapterChanged",
            call(api.chapter_update, chapter_id=chapter_id, target="30:00"),
        )
        holds(
            "SetChapterChanged",
            call(api.chapter_move, chapter_id=chapter_id, position=0),
        )
        deleted = call(api.chapter_delete, chapter_id=chapter_id)
        holds("SetChapterDeleted", deleted)
        holds("SetChapter", deleted["joined"])

    def test_entries(self, friday):
        entries = friday["entries"]
        moved = call(api.entry_move, entry_id=entries[4], position=0)
        holds("SetEntryMoved", moved)
        holds("CollectionEntry", moved["entry"])
        changed = call(
            api.entry_times, entry_id=entries[1], in_time=None, out_time="3:00"
        )
        holds("SetEntryPlanChanged", changed)
        holds("SetEntryPlan", changed["plan"])
        holds(
            "SetEntryPlanChanged", call(api.entry_note, entry_id=entries[1], note=None)
        )

    def test_acknowledgements(self, friday):
        analysis = api.analysis(query(set_id=friday["id"]))
        transition = first(analysis["transitions"])
        body = {
            "from_entry_id": transition["from_entry_id"],
            "to_entry_id": transition["to_entry_id"],
            "warning": transition["warnings"][0]["kind"],
        }
        made = api.acknowledge(body)
        holds("SetAcknowledged", made)
        holds("SetAcknowledgement", made["acknowledgement"])
        holds("SetUnacknowledged", api.unacknowledge(body))

    def test_a_saved_set_list(self, friday, tmp_path):
        answer = call(
            api.set_list_save,
            set_id=friday["id"],
            destination_path=str(tmp_path / "Friday.m3u8"),
        )
        holds("SetListSave", answer)
        holds("SetListSaved", answer["saved"])


class TestTheRefusal:
    def test_it_carries_every_extra_any_refusal_sends(self):
        sent: Set[str] = set()
        for exc in (
            ApiError(404, api.SET_NOT_FOUND, "gone", reason="set"),
            InsertionPointError("stale", "moved"),
            SetListDestinationError("destination_is_folder", "folder", "/x"),
            ApiError(500, api.SET_LIST_WRITE_FAILED, "no", path="/x/y.txt"),
            ValueError("bad"),
        ):
            sent |= set(api.status_for(exc)[1]["error"])
        assert _fields("SetRefusal") == sent

    def test_every_code_a_refusal_can_carry_is_declared(self):
        assert _union("SetRefusalCode") == set(api.REFUSAL_CODES)
        text = _client()
        start = text.index("export const SET_REFUSAL_CODES")
        listed = set(re.findall(r'"([A-Z_]+)"', text[start : text.index("];", start)]))
        assert listed == set(api.REFUSAL_CODES)

    def test_every_reason(self):
        assert _union("SetNotFoundReason") == set(api.NOT_FOUND_REASONS)
        assert _union("SetInsertionPointReason") == set(INSERTION_POINT_REASONS)
        assert _union("SetListDestinationReason") == set(DESTINATION_REFUSALS)
        text = _client()
        start = text.index("= [", text.index("export const SET_REFUSAL_REASONS"))
        listed = set(re.findall(r'"([a-z_]+)"', text[start : text.index("];", start)]))
        assert listed == {
            *api.NOT_FOUND_REASONS,
            *INSERTION_POINT_REASONS,
            *DESTINATION_REFUSALS,
        }


class TestRequests:
    """What the client sends is what each route takes."""

    @pytest.mark.parametrize(
        "method, taken",
        [
            ("getSetPlan", api.SET_PARAMS),
            ("getSetEntries", api.SET_PARAMS),
            ("getSetAnalysis", api.SET_PARAMS),
            ("getSetListText", api.SET_PARAMS),
            ("createSet", api.CREATE_FIELDS),
            ("createSetFrom", api.CREATE_FROM_FIELDS),
            ("duplicateSet", api.DUPLICATE_FIELDS),
            ("setSetNotes", api.NOTES_FIELDS),
            ("createSetChapter", api.CHAPTER_CREATE_FIELDS),
            ("moveSetChapter", api.CHAPTER_MOVE_FIELDS),
            ("deleteSetChapter", api.CHAPTER_DELETE_FIELDS),
            ("splitSetChapter", api.CHAPTER_SPLIT_FIELDS),
            ("moveSetEntry", api.ENTRY_MOVE_FIELDS),
            ("setSetEntryTimes", api.ENTRY_TIMES_FIELDS),
            ("setSetEntryNote", api.ENTRY_NOTE_FIELDS),
            ("saveSetList", api.SET_LIST_SAVE_FIELDS),
        ],
    )
    def test_each_methods_parameters(self, method, taken):
        assert _method_params(method) == set(taken), method

    def test_the_named_requests(self):
        assert _fields("SetSuggestionsRequest") == set(api.SUGGESTIONS_PARAMS)
        assert _fields("SetChapterUpdate") == set(api.CHAPTER_UPDATE_FIELDS)
        assert _fields("SetTransitionWarningRef") == set(api.ACKNOWLEDGE_FIELDS)

    def test_the_source_of_a_new_set(self):
        text = _client()
        start = text.index("export type SetSource =")
        declared = text[start : text.index(";\n\n", start)]
        assert set(re.findall(r"([a-z_]+)\??:", declared)) == set(api.SOURCE_FIELDS)
        assert set(re.findall(r'kind: "([a-z]+)"', declared)) == set(SET_SOURCES)


class TestVocabularies:
    def test_the_words(self):
        assert _union("SetSuggestionSideName") == set(SIDES)
        assert _union("SetKeyRelation") == {
            similarity.KEY_SAME,
            similarity.KEY_ADJACENT,
            similarity.KEY_RELATIVE,
        }
        assert _union("SetTransitionWarningKind") == set(set_analysis.TRANSITION_KINDS)
        assert _union("SetListFormat") == {
            set_list_file.FORMAT_TEXT,
            set_list_file.FORMAT_CSV,
            set_list_file.FORMAT_M3U8,
        }

    def test_every_warning_the_checks_can_give_is_typed(self):
        text = _client()
        start = text.index("export type SetWarning =")
        declared = text[start : text.index(";\n\n", start)]
        kinds = set(re.findall(r'kind: "([a-z_]+)"(?: \| "([a-z_]+)")?', declared))
        typed = {k for pair in kinds for k in pair if k}
        assert typed == set(set_analysis.KINDS)


class TestRoutes:
    def test_the_client_calls_every_route_the_engine_answers(self):
        text = _client()
        for path in (*api.GET_PATHS, *api.POST_PATHS):
            assert f"{path}" in text, path

    def test_an_insert_names_a_chapter_on_the_collection_route(self):
        text = _client()
        start = text.index("  async insertTrackInCollection(")
        signature = text[start : text.index("): Promise<", start)]
        assert "chapter_id?: number | null;" in signature
