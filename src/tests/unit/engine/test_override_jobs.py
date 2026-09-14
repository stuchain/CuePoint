#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Applying Beatport values and typing overrides as batches (CLEAN-05).

``apply_match`` and ``set_override`` joined ORG-07's vocabulary, as CLEAN-04's
decisions did, so they get its guarantees through the real container: a query
selection above the threshold runs as a job, every value it writes carries the
job's one batch id, and one activity event says what happened. And DEC-068's:
a batch apply copies only what an accepted match has, and leaves every track
nobody accepted exactly as it was.
"""

from __future__ import annotations

import time
from typing import Dict, List

import pytest

from cuepoint.engine import batch_jobs
from cuepoint.engine.batch_jobs import apply_or_start
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.organization_api import apply_batch
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import (
    EVENT_BATCH_APPLIED,
    OPERATION_APPLY_MATCH,
    OPERATION_SET_OVERRIDE,
    BatchOperation,
    BatchSelection,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    IMatchRepository,
    IMatchStateService,
    IMetadataService,
    IMigrationRunner,
    ITrackRepository,
)
from cuepoint.utils.di_container import get_container, reset_container

QUESTION = Track(title="A Title", artist="An Artist")


def won(number: int, score: float, label) -> TrackResult:
    best = BeatportCandidate(
        url=f"https://www.beatport.com/track/a-title/{number}",
        title="A Title",
        artists="An Artist",
        label=label,
        release_date=None,
        bpm=126.0,
        key="F Minor",
        genre="Techno",
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
    )
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=score,
    )


@pytest.fixture
def library(tmp_path, monkeypatch) -> Dict[str, List[int]]:
    """Forty Camelot-keyed tracks: thirty accepted, five needing review, five
    never matched. Half the accepted matches have no label on Beatport."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    container = get_container()
    container.resolve(IMigrationRunner).migrate()
    tracks = container.resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                title=f"Track {i:02d}",
                artist="A",
                key="8A",
                bpm=124.0,
                genre="House",
            )
            for i in range(1, 41)
        ]
    )
    ids = tracks.browse_ids(BrowseQuery(sort="title"))
    matches = container.resolve(IMatchRepository)
    states = container.resolve(IMatchStateService)
    for n, track_id in enumerate(ids[:35]):
        score = 97.0 if n < 30 else 80.0
        label = "Drumcode" if n % 2 else None
        states.apply_attempt(
            matches.add_attempt(track_id, "job", won(n, score, label), QUESTION)
        )
    yield {
        "accepted": ids[:30],
        "labelled": ids[1:30:2],
        "review": ids[30:35],
        "never": ids[35:],
        "all": ids,
    }
    reset_container()


@pytest.fixture
def store() -> JobStore:
    return JobStore()


@pytest.fixture
def low_threshold(monkeypatch):
    monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 10)


def finished(job: Job, timeout: float = 30.0) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job did not finish; state={job.state}")


def everything() -> BatchSelection:
    return BatchSelection.matching(BrowseQuery())


def history(where: str = "1 = 1") -> List[Dict[str, object]]:
    connection = get_container().resolve(IDatabaseService).connect()
    return [
        dict(row)
        for row in connection.execute(
            "SELECT track_id, field, source, batch_id FROM track_history"
            f" WHERE field LIKE 'cuepoint_%' AND {where}"
        )
    ]


def count(field: str, operator: str, value) -> int:
    query = BrowseQuery(rules=RuleSet(rules=(FilterRule(field, operator, value),)))
    return get_container().resolve(ITrackRepository).browse_count(query)


def events() -> List[str]:
    feed = get_container().resolve(IActivityService)
    return [
        event.summary for event in feed.recent_events(event_type=EVENT_BATCH_APPLIED)
    ]


class TestApplyingAQueryAboveTheThreshold:
    @pytest.fixture
    def job(self, library, store, low_threshold) -> Job:
        result, job = apply_or_start(
            store,
            everything(),
            BatchOperation(OPERATION_APPLY_MATCH, ["key", "bpm", "label"]),
        )
        assert result is None and job is not None
        return finished(job)

    def test_it_runs_as_a_job_and_counts_only_the_accepted(self, job):
        assert job.state == JobState.SUCCEEDED
        assert (job.result["total"], job.result["changed"]) == (40, 30)
        assert job.result["unchanged"] == 10
        assert job.progress.status_message == "Applying Beatport values"

    def test_every_value_it_wrote_shares_the_jobs_batch_id_and_says_beatport(
        self, library, job
    ):
        rows = history()
        assert {row["batch_id"] for row in rows} == {job.result["batch_id"]}
        assert {row["source"] for row in rows} == {"beatport"}
        # Key and BPM on all thirty, label only on the fifteen that have one.
        assert len(rows) == 30 + 30 + 15

    def test_the_values_are_stored_in_the_librarys_notation(self, library, job):
        metadata = get_container().resolve(IMetadataService)
        for track_id in library["accepted"]:
            record = metadata.get(track_id)
            assert (record.key, record.bpm) == ("4A", 126.0)
        assert count("key", "is", "4A") == 30
        assert count("key_rekordbox", "is", "8A") == 40

    def test_a_missing_label_is_skipped_rather_than_written_empty(self, library, job):
        metadata = get_container().resolve(IMetadataService)
        labelled = {
            track_id
            for track_id in library["accepted"]
            if metadata.get(track_id).label == "Drumcode"
        }
        assert labelled == set(library["labelled"])
        assert count("cuepoint_label", "is_empty", None) == 40 - 15

    def test_tracks_nobody_accepted_are_left_exactly_as_they_were(self, library, job):
        metadata = get_container().resolve(IMetadataService)
        for track_id in library["review"] + library["never"]:
            assert metadata.get(track_id) is None

    def test_one_event_names_what_was_applied(self, job):
        (summary,) = events()
        # ORG-07's summaries add what was left alone after the count.
        assert summary.startswith("Applied the Beatport key, BPM, label to 30 tracks")
        assert summary.endswith("10 unchanged")

    def test_applying_again_changes_nothing_and_writes_no_history(
        self, library, store, job
    ):
        before = len(history())
        result, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["accepted"][:5]),
            BatchOperation(OPERATION_APPLY_MATCH, ["key", "bpm"]),
        )
        assert (result.changed, result.unchanged) == (0, 5)
        assert len(history()) == before


class TestTypingAnOverrideOverAQuery:
    def test_setting_then_clearing_a_genre_on_every_track(
        self, library, store, low_threshold
    ):
        _, job = apply_or_start(
            store,
            everything(),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "genre", "value": "Dub"}),
        )
        finished(job)
        assert job.state == JobState.SUCCEEDED
        assert job.progress.status_message == "Editing tracks"
        assert job.result["changed"] == 40
        assert count("genre", "is", "Dub") == 40
        assert count("genre_rekordbox", "is", "House") == 40
        assert {row["batch_id"] for row in history()} == {job.result["batch_id"]}
        assert {row["source"] for row in history()} == {"cuepoint"}

        _, cleared = apply_or_start(
            store,
            everything(),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "genre", "value": None}),
        )
        finished(cleared)
        assert cleared.result["changed"] == 40
        assert count("genre", "is", "House") == 40
        assert events() == [
            "Cleared the genre override on 40 tracks",
            "Set the genre to Dub on 40 tracks",
        ]

    def test_a_typed_key_is_stored_in_the_librarys_notation(self, library, store):
        result, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["never"]),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "key", "value": "Fm"}),
        )
        assert result.changed == 5
        assert count("key", "is", "4A") == 5
        assert count("key", "is", "8A") == 35
        assert count("cuepoint_key", "is", "4A") == 5


class TestRefusedBeforeAnyJob:
    @pytest.mark.parametrize(
        "operation",
        [
            BatchOperation(OPERATION_APPLY_MATCH, "key"),
            BatchOperation(OPERATION_APPLY_MATCH, []),
            BatchOperation(OPERATION_APPLY_MATCH, ["title"]),
            BatchOperation(OPERATION_APPLY_MATCH, None),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "bpm", "value": 500}),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "title", "value": "x"}),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "genre", "value": "  "}),
            BatchOperation(OPERATION_SET_OVERRIDE, {"field": "key", "value": "H#"}),
            BatchOperation(OPERATION_SET_OVERRIDE, "genre"),
        ],
    )
    def test_a_bad_value_is_refused_and_starts_nothing(
        self, library, store, low_threshold, operation
    ):
        with pytest.raises(ValueError):
            apply_or_start(store, everything(), operation)
        assert store.list_all() == []
        assert history() == []


class TestTheRoute:
    def test_the_existing_batch_route_applies_and_overrides(self, library, store):
        status, payload = apply_batch(
            {
                "selection": {"track_ids": library["accepted"][:3]},
                "operation": {"kind": OPERATION_APPLY_MATCH, "value": ["bpm"]},
            },
            job_store=store,
        )
        assert status == 200
        assert payload["applied"]["operation"] == OPERATION_APPLY_MATCH
        assert payload["applied"]["changed"] == 3

        status, payload = apply_batch(
            {
                "selection": {"track_ids": library["never"][:2]},
                "operation": {
                    "kind": OPERATION_SET_OVERRIDE,
                    "value": {"field": "year", "value": 1999},
                },
            },
            job_store=store,
        )
        assert status == 200
        assert payload["applied"]["changed"] == 2
        assert count("year", "is", 1999) == 2
