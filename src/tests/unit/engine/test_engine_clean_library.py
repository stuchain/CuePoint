#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ruff: noqa: F811 — the engine fixtures are imported, and named as arguments

"""What the Library and the Inspector read about Clean, over HTTP (CLEAN-13).

CLEAN-13 draws Clean in the Library, and needed four things of the engine that
CLEAN-11 did not answer. Each is tested here through a running engine:

- **A row carries its match score and where each override came from**, in the
  browse, the Inspector's detail, the rows a hand edit and an apply answer with,
  and the members of a duplicate group.
- **The table can sort by the Clean columns.**
- **The filter vocabulary names each fixed value set**, and a filter naming a
  word outside one is refused rather than answered with nothing.
- **A tag write or restore a stop cut short is offered for restoring** in the
  activity feed as the engine starts — the only place it could be seen — and
  offered once.

Beatport is never reached.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from cuepoint.engine.tag_write_jobs import (
    JOB_TYPE_TAG_RESTORE,
    JOB_TYPE_TAG_WRITE,
    offer_interrupted_tag_jobs,
)
from cuepoint.models.file_write import WRITE_RESTORED, WRITE_WRITTEN, FileWrite
from cuepoint.persistence.job_repository import JobRecord
from cuepoint.services.tag_write_service import (
    EVENT_TAGS_INTERRUPTED,
    describe_interrupted_tags,
)
from tests.unit.engine.test_engine_clean_api import (  # noqa: F401 — fixtures
    NOW,
    add_tracks,
    attempt,
    candidate,
    engine,
    get,
    library_db,
    no_beatport,
    ok,
    post,
    refused,
    resolve,
    rule,
    store,
    track,
)


def rows(base: str, **params: Any) -> List[Dict[str, Any]]:
    payload = ok(
        get(base, "/api/v1/library/search", mode="browse", limit=100, **params)
    )
    return list(payload["tracks"])


def by_title(base: str, **params: Any) -> Dict[str, Dict[str, Any]]:
    return {row["title"]: row for row in rows(base, **params)}


@pytest.mark.unit
class TestTheRow:
    def test_a_row_carries_its_score_and_override_sources(self, engine):
        taken, typed, plain = add_tracks(track("Taken"), track("Typed"), track("Plain"))
        attempt(taken, candidate(1, score=97.0, genre="Techno", key="8A"))
        assert ok(
            post(
                engine, "/api/v1/clean/apply", {"fields": ["genre"], "track_id": taken}
            )
        )["track"]["override_sources"] == {"genre": "beatport"}
        ok(post(engine, f"/api/v1/library/tracks/{typed}/overrides", {"bpm": 126}))

        found = by_title(engine)
        assert found["Taken"]["match_score"] == 97.0
        assert found["Taken"]["override_sources"] == {"genre": "beatport"}
        assert found["Typed"]["override_sources"] == {"bpm": "cuepoint"}
        assert found["Typed"]["match_score"] is None
        assert found["Plain"]["override_sources"] == {}

    def test_the_latest_edit_names_the_source(self, engine):
        [taken] = add_tracks(track("Taken"))
        attempt(taken, candidate(1, score=97.0, genre="Techno"))
        ok(
            post(
                engine, "/api/v1/clean/apply", {"fields": ["genre"], "track_id": taken}
            )
        )
        edited = ok(
            post(
                engine, f"/api/v1/library/tracks/{taken}/overrides", {"genre": "House"}
            )
        )
        assert edited["track"]["override_sources"] == {"genre": "cuepoint"}

    def test_the_inspector_reads_the_same(self, engine):
        [taken] = add_tracks(track("Taken"))
        attempt(taken, candidate(1, score=96.5, label="Kompakt"))
        ok(
            post(
                engine, "/api/v1/clean/apply", {"fields": ["label"], "track_id": taken}
            )
        )
        detail = ok(get(engine, f"/api/v1/library/tracks/{taken}"))["track"]
        assert detail["override_sources"] == {"label": "beatport"}
        assert detail["match_score"] == 96.5

    def test_a_duplicate_member_reads_the_same(self, engine, store):
        from tests.unit.engine.test_engine_clean_api import finished

        first, second = add_tracks(
            track("Twin", artist="Same"), track("Twin", artist="Same")
        )
        ok(post(engine, f"/api/v1/library/tracks/{first}/overrides", {"year": 2001}))
        scan = ok(post(engine, "/api/v1/clean/duplicates/scan", {}), 202)
        finished(store, scan["job_id"])
        [group] = ok(get(engine, "/api/v1/clean/duplicates"))["groups"]
        members = {member["id"]: member for member in group["members"]}
        assert members[first]["override_sources"] == {"year": "cuepoint"}
        assert members[second]["override_sources"] == {}
        assert "match_score" in members[second]

    def test_a_rejected_track_scores_the_candidate_it_refused(self, engine):
        [refused_track] = add_tracks(track("Refused"))
        attempt(refused_track, candidate(1, score=83.0))
        ok(
            post(
                engine,
                "/api/v1/clean/decide",
                {"decision": "reject", "track_id": refused_track},
            )
        )
        assert by_title(engine)["Refused"]["match_score"] == 83.0


@pytest.mark.unit
class TestSortingAndFiltering:
    def test_the_clean_columns_are_sortable(self, engine):
        sortable = ok(get(engine, "/api/v1/library/filter-fields"))["sortable"]
        assert {"match_state", "match_score", "file_status"} <= set(sortable)

    def test_sorting_by_score(self, engine):
        low, high, none = add_tracks(track("Low"), track("High"), track("None"))
        attempt(low, candidate(1, score=81.0))
        attempt(high, candidate(2, score=98.0))
        titles = [row["title"] for row in rows(engine, sort="match_score", dir="desc")]
        assert titles == ["High", "Low", "None"]

    def test_the_vocabulary_names_fixed_values(self, engine):
        fields = {
            field["name"]: field
            for field in ok(get(engine, "/api/v1/library/filter-fields"))["fields"]
        }
        assert fields["match_state"]["choices"][0] == {
            "value": "needs_review",
            "label": "Needs review",
        }
        assert fields["genre"]["choices"] is None

    def test_a_word_outside_the_set_is_refused(self, engine):
        refused(
            get(
                engine,
                "/api/v1/library/search",
                mode="browse",
                filters=json.dumps(rule("match_state", "is", "reviewed")),
            ),
            400,
            "INVALID_REQUEST",
            "Match state",
            "needs_review",
        )


# ------------------------------------------------------ interrupted tag jobs


def running(job_id: str, job_type: str) -> None:
    resolve("IJobRepository").save(
        JobRecord(
            id=job_id,
            type=job_type,
            state="running",
            demo=False,
            progress=None,
            error=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )


def recorded(job_id: str, track_id: int, *, pending: int, done: int, **extra: Any):
    rows = [
        FileWrite(
            job_id=job_id,
            file_path=f"/music/{track_id}.mp3",
            field=field,
            outcome=extra.get("outcome", WRITE_WRITTEN),
            written_at=NOW,
            track_id=track_id,
            old_value_json='"old"',
            new_value_json='"new"',
            pending=index < pending,
            restore_of=extra.get("restore_of", [None] * 10)[index],
        )
        for index, field in enumerate(
            ["key", "bpm", "genre", "label", "year"][: pending + done]
        )
    ]
    with resolve("IDatabaseService").transaction():
        return resolve("IFileWriteRepository").record(rows)


def offers() -> List[Any]:
    return [
        event
        for event in resolve("IActivityRepository").recent_events(
            limit=50, event_type=EVENT_TAGS_INTERRUPTED
        )
    ]


@pytest.mark.unit
class TestInterruptedTagJobs:
    def test_a_stopped_write_is_offered_with_what_may_not_have_finished(
        self, library_db
    ):
        [track_id] = add_tracks(track("Written"))
        running("write-1", JOB_TYPE_TAG_WRITE)
        recorded("write-1", track_id, pending=2, done=1)

        assert offer_interrupted_tag_jobs() == 1
        [event] = offers()
        assert event.detail == {
            "job_id": "write-1",
            "job_type": JOB_TYPE_TAG_WRITE,
            "recorded": 3,
            "unconfirmed": 2,
            "write_job_ids": ["write-1"],
        }
        assert event.summary == describe_interrupted_tags(False, 3, 2)
        assert "2 values may not have finished" in event.summary

    def test_a_stopped_restore_names_the_writes_it_was_undoing(self, library_db):
        [track_id] = add_tracks(track("Written"))
        written = recorded("write-1", track_id, pending=0, done=2)
        resolve("IJobRepository").save(
            JobRecord(
                "write-1", JOB_TYPE_TAG_WRITE, "succeeded", False, None, None, NOW, NOW
            )
        )
        running("restore-1", JOB_TYPE_TAG_RESTORE)
        recorded(
            "restore-1",
            track_id,
            pending=1,
            done=1,
            outcome=WRITE_RESTORED,
            restore_of=written,
        )

        assert offer_interrupted_tag_jobs() == 1
        [event] = offers()
        assert event.detail["write_job_ids"] == ["write-1"]
        assert event.detail["job_type"] == JOB_TYPE_TAG_RESTORE
        assert event.summary.startswith("Restoring tags stopped")
        assert "1 value may not have been put back" in event.summary

    def test_finished_and_empty_jobs_are_not_offered(self, library_db):
        [track_id] = add_tracks(track("Written"))
        resolve("IJobRepository").save(
            JobRecord(
                "done", JOB_TYPE_TAG_WRITE, "succeeded", False, None, None, NOW, NOW
            )
        )
        recorded("done", track_id, pending=1, done=0)
        running("nothing-recorded", JOB_TYPE_TAG_WRITE)
        running("a-match", "clean_match")

        assert offer_interrupted_tag_jobs() == 0
        assert offers() == []

    def test_a_restart_offers_once(self, library_db):
        from cuepoint.engine.server import _resolve_job_repository

        [track_id] = add_tracks(track("Written"))
        running("write-1", JOB_TYPE_TAG_WRITE)
        recorded("write-1", track_id, pending=1, done=0)

        _resolve_job_repository()
        _resolve_job_repository()
        assert len(offers()) == 1
        assert resolve("IJobRepository").get("write-1").state == "failed"


@pytest.mark.unit
class TestTheSentence:
    @pytest.mark.parametrize(
        "restoring, recorded_rows, unconfirmed, expected",
        [
            (
                False,
                5,
                2,
                "Writing tags stopped when CuePoint closed: 2 values may not have"
                " finished writing, and 3 did. Restore them to put the files back",
            ),
            (
                False,
                1,
                0,
                "Writing tags stopped when CuePoint closed after writing 1 value."
                " Restore them to put the files back",
            ),
            (
                True,
                4,
                1,
                "Restoring tags stopped when CuePoint closed: 1 value may not have"
                " been put back. Restore again to finish",
            ),
            (
                True,
                4,
                0,
                "Restoring tags stopped when CuePoint closed before every file was"
                " put back. Restore again to finish",
            ),
        ],
    )
    def test_each_case(self, restoring, recorded_rows, unconfirmed, expected):
        assert (
            describe_interrupted_tags(restoring, recorded_rows, unconfirmed) == expected
        )
