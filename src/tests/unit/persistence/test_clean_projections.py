#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Clean's reads of a set of tracks, and the record read a page at a time (CLEAN-11).

- **A row's Clean answers are its filters' answers.** ``clean_states`` reads
  each through the vocabulary expression of the same name, and a test holds
  every track's answer to what the filter finds, past one chunk of ids.
- **A review row** is the track's effective values beside the candidate its
  state points at, in the order the ids were given.
- **The file-write record** is paged and counted in SQL, and the counts agree
  with the rows ``restorable`` reads.
- **A hand edit of several fields is one transaction.**
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.file_write import FileWrite
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.track_query import (
    BrowseQuery,
    BrowseQueryError,
    build_clean_states,
    build_review_rows,
)
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import get_container, reset_container

NOW = "2026-09-15T12:00:00+00:00"


@pytest.fixture
def container(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    yield get_container()
    reset_container()


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


def add(count: int, **fields: Any) -> List[int]:
    tracks = resolve("ITrackRepository")
    prefix = f"t{len(tracks.browse_ids(BrowseQuery()))}-"
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"{prefix}{n}",
                file_path=f"/music/{prefix}{n}.mp3",
                title=f"Song {prefix}{n}",
                artist="Artist",
                **fields,
            )
            for n in range(count)
        ]
    )
    return [int(tracks.find_by_rekordbox_id(f"{prefix}{n}").id) for n in range(count)]


def match(track_id: int, number: int, score: float = 97.0, **fields: Any) -> None:
    values: Dict[str, Any] = dict(
        url=f"https://www.beatport.com/track/song/{number}",
        title="Song",
        artists="Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
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
    values.update(fields)
    best = BeatportCandidate(**values)
    stored = resolve("IMatchRepository").add_attempt(
        track_id,
        "job",
        TrackResult(
            playlist_index=1,
            title="Song",
            artist="Artist",
            matched=True,
            best_match=best,
            candidates=[best],
            match_score=score,
        ),
        Track(title="Song", artist="Artist"),
    )
    resolve("IMatchStateService").apply_attempt(stored)


@pytest.mark.unit
class TestTheBuilders:
    @pytest.mark.parametrize("build", [build_clean_states, build_review_rows])
    def test_no_ids_is_refused_rather_than_written_as_in_nothing(self, build):
        with pytest.raises(BrowseQueryError):
            build(0)

    def test_every_value_is_bound(self):
        sql = build_clean_states(3)
        assert sql.count("?") == 3
        assert "tracks.id IN (?, ?, ?)" in sql


@pytest.mark.unit
class TestCleanStates:
    def test_each_answer_is_what_its_filter_finds_past_one_chunk(self, container):
        ids = add(1203)
        for number, track_id in enumerate(ids[:40]):
            match(track_id, number, score=97.0 if number % 2 else 70.0)
        tracks = resolve("ITrackRepository")

        states = tracks.clean_states(ids)

        assert set(states) == set(ids)
        for field in ("match_state", "file_status", "artwork"):
            for value in {getattr(state, field) for state in states.values()}:
                marked = {t for t, s in states.items() if getattr(s, field) == value}
                found = set(
                    tracks.browse_ids(
                        BrowseQuery(
                            rules=RuleSet(rules=(FilterRule(field, "is", value),))
                        ),
                        limit=50000,
                    )
                )
                assert found == marked, (field, value)

    def test_ids_not_in_the_library_are_absent(self, container):
        [track_id] = add(1)
        assert set(resolve("ITrackRepository").clean_states([track_id, 987654])) == {
            track_id
        }

    def test_the_library_service_reads_nothing_for_no_ids(self, container):
        assert resolve("ILibraryService").clean_states([]) == {}


@pytest.mark.unit
class TestReviewRows:
    def test_in_the_order_given_with_the_candidate_the_state_points_at(self, container):
        decided, never = add(2, genre="House")
        match(decided, 7, genre="Techno", key="A min")
        resolve("IMetadataService").set_override(decided, "genre", "Minimal")

        rows = resolve("ITrackRepository").review_rows([never, 424242, decided])

        assert [row["id"] for row in rows] == [never, decided]
        assert rows[0]["match_state"] == "not_matched"
        assert rows[0]["candidate_url"] is None
        assert rows[1]["match_state"] == "accepted"
        assert rows[1]["genre"] == "Minimal"
        assert rows[1]["candidate_genre"] == "Techno"
        assert rows[1]["candidate_beatport_track_id"] == "7"
        assert rows[1]["match_decided_at"]


def write_row(job_id: str, track_id: int, *, pending: bool = False) -> FileWrite:
    return FileWrite(
        job_id=job_id,
        track_id=track_id,
        file_path=f"/music/{track_id}.mp3",
        field="key",
        outcome="written",
        written_at=NOW,
        old_value_json="null",
        new_value_json='"Am"',
        pending=pending,
    )


@pytest.mark.unit
class TestTheRecordReadAPageAtATime:
    def test_pages_counts_and_restorable_counts(self, container):
        ids = add(3)
        writes = resolve("IFileWriteRepository")
        with resolve("IDatabaseService").transaction():
            recorded = writes.record(
                [
                    write_row("job-1", ids[0]),
                    write_row("job-1", ids[1], pending=True),
                    write_row("job-1", ids[2]),
                    write_row("job-2", ids[0]),
                ]
            )
            # A confirmed restore of the first write takes it out of restorable;
            # a pending restore of the third does not.
            writes.record(
                [
                    FileWrite(
                        job_id="restore-1",
                        track_id=ids[0],
                        file_path="/music/x.mp3",
                        field="key",
                        outcome="restored",
                        written_at=NOW,
                        restore_of=recorded[0],
                    ),
                    FileWrite(
                        job_id="restore-1",
                        track_id=ids[2],
                        file_path="/music/x.mp3",
                        field="key",
                        outcome="restored",
                        written_at=NOW,
                        restore_of=recorded[2],
                        pending=True,
                    ),
                ]
            )

        assert [row.id for row in writes.page(job_id="job-1", limit=2)] == recorded[:2]
        assert [row.id for row in writes.page(job_id="job-1", limit=2, offset=2)] == [
            recorded[2]
        ]
        assert writes.counts(job_id="job-1") == (3, 1)
        assert writes.counts(track_id=ids[0]) == (3, 0)
        assert writes.counts(job_id="restore-1") == (2, 1)

        for scope in ({"job_id": "job-1"}, {"track_id": ids[0]}, {"track_id": ids[2]}):
            rows = writes.restorable(**scope)
            assert writes.restorable_counts(**scope) == (
                len(rows),
                sum(1 for row in rows if row.pending),
            ), scope
        assert writes.restorable_counts(job_id="job-1") == (2, 1)
        assert resolve("ITagWriteService").restorable_count(job_id="job-1") == 2

    @pytest.mark.parametrize("method", ["page", "counts", "restorable_counts"])
    def test_a_job_or_a_track_never_both_or_neither(self, container, method):
        writes = resolve("IFileWriteRepository")
        with pytest.raises(ValueError):
            getattr(writes, method)()
        with pytest.raises(ValueError):
            getattr(writes, method)(job_id="x", track_id=1)


@pytest.mark.unit
class TestSeveralOverridesAtOnce:
    def test_one_transaction_so_a_refusal_writes_none(self, container):
        [track_id] = add(1, genre="House")
        metadata = resolve("IMetadataService")

        with pytest.raises(ValueError, match="bpm"):
            metadata.set_overrides(track_id, {"genre": "Techno", "bpm": 1000})

        assert metadata.get(track_id) is None
        assert resolve("IActivityService").track_history(track_id, limit=10) == []

    def test_each_field_records_its_own_change_and_the_notation_is_asked_once(
        self, container, monkeypatch
    ):
        [track_id] = add(1)
        metadata = resolve("IMetadataService")
        asked: List[int] = []
        original = metadata.key_notation
        monkeypatch.setattr(
            metadata, "key_notation", lambda: asked.append(1) or original()
        )

        record = metadata.set_overrides(
            track_id, {"key": "8A", "bpm": 124, "year": 2001}
        )

        assert (record.bpm, record.year) == (124, 2001)
        assert record.key is not None
        assert asked == [1]
        fields = {
            c.field_name
            for c in resolve("IActivityService").track_history(track_id, limit=10)
        }
        assert fields == {"cuepoint_key", "cuepoint_bpm", "cuepoint_year"}

    def test_nothing_named(self, container):
        [track_id] = add(1)
        with pytest.raises(ValueError, match="at least one"):
            resolve("IMetadataService").set_overrides(track_id, {})

    def test_an_unknown_field_writes_nothing(self, container):
        [track_id] = add(1)
        metadata = resolve("IMetadataService")
        with pytest.raises(ValueError):
            metadata.set_overrides(track_id, {"genre": "Techno", "colour": "red"})
        assert metadata.get(track_id) is None
