#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CLEAN-08's duplicate scan and dismissals (DEC-074).

What these tests are aimed at, in the specification's order:

- **Each signal finds its group and not its near-miss:** a path spelled two
  ways and a different path; one accepted Beatport track and a different one,
  or a candidate only proposed; the same artist, title and mix within two
  seconds, and three seconds apart, another mix, another artist.
- **A track can be in several groups**, one per signal.
- **A dismissal hides a group; a new member shows it again.**
- **A rebuild after a refresh deleted a member dissolves a pair.**
- **Nothing but the duplicate tables and the feed is written, and no file is
  opened**, asserted from the statements SQLite ran and from a patched ``os``.
"""

from __future__ import annotations

import builtins
import json
import os
import re
import sqlite3
from typing import List, Optional, Tuple

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.duplicate_group import (
    SIGNAL_BEATPORT,
    SIGNAL_PATH,
    SIGNAL_TEXT,
    SIGNALS,
    ScannedGroup,
    member_hash,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services import duplicate_service as module
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.duplicate_service import (
    EVENT_DUPLICATES_DISMISSED,
    EVENT_DUPLICATES_RESTORED,
    EVENT_DUPLICATES_SCANNED,
    TRIGGER_IMPORT,
    DuplicateScanResult,
    DuplicateService,
    SignalScan,
    validate_signals,
)
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-14T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")

#: The tables a scan, a dismissal and a restore may write.
DUPLICATE_TABLES = {
    "duplicate_groups",
    "duplicate_members",
    "duplicate_dismissals",
    "activity_events",
}


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def repo(db) -> DuplicateRepository:
    return DuplicateRepository(db)


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def service(db, repo, activity) -> DuplicateService:
    return DuplicateService(repo, activity, db, clock=lambda: NOW)


def add(
    db,
    tracks,
    name: str,
    *,
    path: str = "",
    artist: str = "An Artist",
    title: Optional[str] = None,
    seconds: Optional[int] = 300,
) -> int:
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=name,
                title=title if title is not None else name,
                artist=artist,
                file_path=path,
                duration_seconds=seconds,
            )
        ]
    )
    row = (
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (name,))
        .fetchone()
    )
    return int(row["id"])


def candidate(beatport_id: str, score: float) -> BeatportCandidate:
    return BeatportCandidate(
        url=f"https://www.beatport.com/track/a-title/{beatport_id}",
        title="A Title",
        artists="An Artist",
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


def match(db, tracks, activity, track_id: int, beatport_id: str, score: float) -> None:
    """Store an attempt whose winner is ``beatport_id``; 95 or more is accepted."""
    matches = MatchRepository(db)
    best = candidate(beatport_id, score)
    result = TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=score,
    )
    states = MatchStateService(matches, tracks, activity, db)
    states.apply_attempt(matches.add_attempt(track_id, "job", result, QUESTION))


def members(service, signal: Optional[str] = None, **kwargs) -> List[Tuple[int, ...]]:
    return [group.track_ids for group in service.groups(signal, **kwargs)]


def events(db, event_type: str) -> List[sqlite3.Row]:
    return list(
        db.connect().execute(
            "SELECT summary, detail_json FROM activity_events WHERE type = ? ORDER BY id",
            (event_type,),
        )
    )


# --------------------------------------------------------------- the signals


class TestThePathSignal:
    def test_one_file_imported_twice_is_a_group_and_another_file_is_not(
        self, db, tracks, service
    ):
        first = add(db, tracks, "one", path="E:/Music/Track.mp3", title="X", seconds=1)
        second = add(
            db, tracks, "two", path="e:\\music\\track.mp3", title="Y", seconds=500
        )
        add(db, tracks, "near", path="E:/Music/Track 2.mp3", title="Z", seconds=9)
        service.scan([SIGNAL_PATH])
        assert members(service, SIGNAL_PATH) == [(first, second)]
        [group] = service.groups(SIGNAL_PATH)
        assert group.group.group_key == "e:/music/track.mp3"

    def test_tracks_with_no_path_are_not_one_file(self, db, tracks, service):
        add(db, tracks, "one", title="X")
        add(db, tracks, "two", title="Y")
        service.scan([SIGNAL_PATH])
        assert members(service, SIGNAL_PATH) == []


class TestTheBeatportSignal:
    def test_one_accepted_beatport_track_is_a_group_and_another_is_not(
        self, db, tracks, activity, service
    ):
        first = add(db, tracks, "one", title="X", seconds=1)
        second = add(db, tracks, "two", title="Y", seconds=900)
        other = add(db, tracks, "three", title="Z", seconds=5)
        match(db, tracks, activity, first, "1001", 97.0)
        match(db, tracks, activity, second, "1001", 99.0)
        match(db, tracks, activity, other, "2002", 98.0)
        service.scan([SIGNAL_BEATPORT])
        assert members(service, SIGNAL_BEATPORT) == [(first, second)]

    def test_a_candidate_only_proposed_is_not_a_signal(
        self, db, tracks, activity, service
    ):
        first = add(db, tracks, "one", title="X")
        proposed = add(db, tracks, "two", title="Y")
        match(db, tracks, activity, first, "1001", 97.0)
        match(db, tracks, activity, proposed, "1001", 80.0)  # needs review
        service.scan([SIGNAL_BEATPORT])
        assert members(service, SIGNAL_BEATPORT) == []

    def test_a_candidate_with_no_parsed_id_is_grouped_by_its_page(
        self, db, tracks, activity, service
    ):
        first = add(db, tracks, "one", title="X")
        second = add(db, tracks, "two", title="Y")
        match(db, tracks, activity, first, "1001", 97.0)
        match(db, tracks, activity, second, "1001", 97.0)
        with db.transaction() as conn:
            conn.execute("UPDATE match_candidates SET beatport_track_id = NULL")
        service.scan([SIGNAL_BEATPORT])
        [group] = service.groups(SIGNAL_BEATPORT)
        assert group.track_ids == (first, second)
        assert group.group.group_key.startswith("url:")


class TestTheTextSignal:
    def test_the_same_recording_within_two_seconds_is_a_group(
        self, db, tracks, service
    ):
        plain = add(db, tracks, "one", title="Track", seconds=300)
        original = add(db, tracks, "two", title="Track (Original Mix)", seconds=302)
        service.scan([SIGNAL_TEXT])
        assert members(service, SIGNAL_TEXT) == [(plain, original)]

    @pytest.mark.parametrize(
        "near_miss",
        [
            dict(title="Track", seconds=303),
            dict(title="Track (Extended Mix)", seconds=300),
            dict(title="Track", artist="Someone Else", seconds=300),
        ],
        ids=["three seconds longer", "another mix", "another artist"],
    )
    def test_a_near_miss_is_not(self, db, tracks, service, near_miss):
        add(db, tracks, "one", title="Track", seconds=300)
        add(db, tracks, "two", **near_miss)
        service.scan([SIGNAL_TEXT])
        assert members(service, SIGNAL_TEXT) == []


class TestSeveralGroups:
    def test_a_track_can_be_in_a_group_for_each_signal(
        self, db, tracks, activity, service
    ):
        both = add(db, tracks, "one", path="/m/a.mp3", title="Track")
        by_path = add(db, tracks, "two", path="/m/a.mp3", title="Other", seconds=10)
        by_text = add(db, tracks, "three", path="/m/b.mp3", title="Track")
        service.scan()
        assert members(service, SIGNAL_PATH) == [(both, by_path)]
        assert members(service, SIGNAL_TEXT) == [(both, by_text)]

    def test_no_group_of_one_is_stored(self, db, tracks, service, repo):
        add(db, tracks, "one", path="/m/a.mp3")
        service.scan()
        assert (
            db.connect().execute("SELECT count(*) FROM duplicate_groups").fetchone()[0]
            == 0
        )


# ------------------------------------------------------------------- rebuild


class TestRebuilding:
    def test_a_group_keeps_its_id_across_scans(self, db, tracks, service):
        add(db, tracks, "one", path="/m/a.mp3")
        add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        service.scan()
        [before] = service.groups(SIGNAL_PATH)
        service.scan()
        [after] = service.groups(SIGNAL_PATH)
        assert after.group.id == before.group.id

    def test_a_refresh_deleting_a_member_dissolves_a_pair_at_once_and_on_rescan(
        self, db, tracks, service
    ):
        add(db, tracks, "one", path="/m/a.mp3")
        second = add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        service.scan([SIGNAL_PATH])
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (second,))
        assert service.groups(SIGNAL_PATH) == []  # hidden before any scan
        service.scan([SIGNAL_PATH])
        assert (
            db.connect().execute("SELECT count(*) FROM duplicate_groups").fetchone()[0]
            == 0
        )

    def test_a_group_no_longer_found_is_removed_and_its_members_with_it(
        self, db, tracks, service
    ):
        add(db, tracks, "one", path="/m/a.mp3")
        second = add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        service.scan([SIGNAL_PATH])
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = '/m/b.mp3', normalized_path = '/m/b.mp3'"
                " WHERE id = ?",
                (second,),
            )
        service.scan([SIGNAL_PATH])
        assert (
            db.connect().execute("SELECT count(*) FROM duplicate_members").fetchone()[0]
            == 0
        )

    def test_a_member_that_left_while_the_scan_ran_is_skipped(self, db, tracks, repo):
        first = add(db, tracks, "one", path="/m/a.mp3")
        second = add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        third = add(db, tracks, "three", path="/m/a.mp3", seconds=20)
        pair = add(db, tracks, "four", path="/m/b.mp3", seconds=30)
        gone = add(db, tracks, "five", path="/m/b.mp3", seconds=40)
        found = repo.path_groups()
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id IN (?, ?)", (third, gone))
        with db.transaction():
            repo.replace_signal(SIGNAL_PATH, found, NOW)
        [group] = repo.groups(SIGNAL_PATH)
        assert group.track_ids == (first, second)
        assert group.group.member_hash == member_hash([first, second])
        assert pair not in {
            tid for g in repo.groups(include_dismissed=True) for tid in g.track_ids
        }
        # Not merely unlisted: the pair left with one member is deleted.
        stored = db.connect().execute("SELECT count(*) FROM duplicate_groups")
        assert stored.fetchone()[0] == 1

    def test_a_member_that_moved_away_leaves_a_group_still_found(
        self, db, tracks, service
    ):
        first = add(db, tracks, "one", path="/m/a.mp3")
        second = add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        third = add(db, tracks, "three", path="/m/a.mp3", seconds=20)
        service.scan([SIGNAL_PATH])
        with db.transaction() as conn:
            conn.execute(
                "UPDATE tracks SET file_path = '/m/z.mp3', normalized_path = '/m/z.mp3'"
                " WHERE id = ?",
                (third,),
            )
        service.scan([SIGNAL_PATH])
        [group] = service.groups(SIGNAL_PATH)
        assert group.track_ids == (first, second)
        stored = db.connect().execute(
            "SELECT count(*) FROM duplicate_members WHERE group_id = ?",
            (group.group.id,),
        )
        assert stored.fetchone()[0] == 2

    def test_replacing_refuses_another_signals_groups_and_a_repeated_key(
        self, db, repo
    ):
        with pytest.raises(ValueError, match="cannot replace"):
            repo.replace_signal(
                SIGNAL_PATH, [ScannedGroup(SIGNAL_TEXT, "k", (1, 2))], NOW
            )
        with pytest.raises(ValueError, match="share the key"):
            repo.replace_signal(
                SIGNAL_PATH,
                [
                    ScannedGroup(SIGNAL_PATH, "k", (1, 2)),
                    ScannedGroup(SIGNAL_PATH, "k", (3, 4)),
                ],
                NOW,
            )
        with pytest.raises(ValueError, match="signal"):
            repo.replace_signal("sound", [], NOW)


# ---------------------------------------------------------------- dismissing


class TestDismissing:
    def pair(self, db, tracks, service) -> int:
        add(db, tracks, "one", title="Track")
        add(db, tracks, "two", title="Track (Original Mix)")
        service.scan([SIGNAL_TEXT])
        [group] = service.groups(SIGNAL_TEXT)
        return int(group.group.id)

    def test_a_dismissal_hides_the_group_and_survives_a_rescan(
        self, db, tracks, service
    ):
        group_id = self.pair(db, tracks, service)
        dismissed = service.dismiss(group_id)
        assert dismissed.dismissed and not dismissed.shown
        assert service.groups() == []
        assert [g.group.id for g in service.groups(include_dismissed=True)] == [
            group_id
        ]
        service.scan()
        assert service.groups() == []

    def test_a_new_member_shows_the_group_again(self, db, tracks, service):
        group_id = self.pair(db, tracks, service)
        service.dismiss(group_id)
        newcomer = add(db, tracks, "three", title="Track", seconds=301)
        service.scan([SIGNAL_TEXT])
        [group] = service.groups(SIGNAL_TEXT)
        assert newcomer in group.track_ids and not group.dismissed

    def test_restoring_shows_it_again(self, db, tracks, service):
        group_id = self.pair(db, tracks, service)
        service.dismiss(group_id)
        restored = service.restore(group_id)
        assert restored.shown
        assert [g.group.id for g in service.groups()] == [group_id]

    def test_what_cannot_be_dismissed_or_restored_is_refused(self, db, tracks, service):
        group_id = self.pair(db, tracks, service)
        with pytest.raises(LookupError):
            service.dismiss(999)
        with pytest.raises(LookupError):
            service.restore(999)
        with pytest.raises(ValueError, match="not marked"):
            service.restore(group_id)
        service.dismiss(group_id)
        with pytest.raises(ValueError, match="already"):
            service.dismiss(group_id)

    def test_a_pair_that_lost_a_member_cannot_be_dismissed(self, db, tracks, service):
        group_id = self.pair(db, tracks, service)
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM tracks WHERE id = (SELECT max(track_id) FROM duplicate_members)"
            )
        with pytest.raises(ValueError, match="no longer has two"):
            service.dismiss(group_id)

    def test_a_dismissal_after_a_refresh_took_a_member_hides_the_group_as_it_is(
        self, db, tracks, service
    ):
        # Three scanned, one deleted before any rescan: the group's stored
        # fingerprint is of three, and the dismissal is made for two.
        add(db, tracks, "one", path="/m/a.mp3", title="X", seconds=10)
        add(db, tracks, "two", path="/m/a.mp3", title="Y", seconds=100)
        third = add(db, tracks, "three", path="/m/a.mp3", title="Z", seconds=200)
        service.scan([SIGNAL_PATH])
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (third,))
        [group] = service.groups(SIGNAL_PATH)
        service.dismiss(int(group.group.id))
        assert service.groups() == []
        shown = db.connect().execute("SELECT count(*) FROM duplicate_track_signals")
        assert shown.fetchone()[0] == 0

    def test_each_answer_is_recorded(self, db, tracks, service):
        group_id = self.pair(db, tracks, service)
        service.dismiss(group_id)
        service.restore(group_id)
        [dismissed] = events(db, EVENT_DUPLICATES_DISMISSED)
        [restored] = events(db, EVENT_DUPLICATES_RESTORED)
        assert dismissed["summary"] == (
            "Marked 2 tracks as not duplicates (the same artist, title and mix)"
        )
        assert restored["summary"].startswith("Showed 2 tracks as possible duplicates")
        assert json.loads(dismissed["detail_json"]) == {
            "group_id": group_id,
            "signal": SIGNAL_TEXT,
            "tracks": 2,
        }

    def test_the_dismissal_stores_the_members_it_was_made_for(
        self, db, tracks, repo, service
    ):
        group_id = self.pair(db, tracks, service)
        service.dismiss(group_id)
        [group] = repo.groups(include_dismissed=True)
        stored = repo.dismissal(SIGNAL_TEXT, group.group.group_key)
        assert stored is not None
        assert (
            stored.member_hash
            == member_hash(group.track_ids)
            == group.group.member_hash
        )
        assert stored.covers(group.group, group.track_ids)


# -------------------------------------------------------------- what it writes


class TestNothingElseIsTouched:
    def test_no_track_or_metadata_is_written_and_no_file_is_opened(
        self, db, tracks, activity, service, monkeypatch
    ):
        first = add(db, tracks, "one", path="/m/a.mp3", title="Track")
        second = add(db, tracks, "two", path="/m/a.mp3", title="Track (Original Mix)")
        match(db, tracks, activity, first, "1001", 97.0)
        match(db, tracks, activity, second, "1001", 97.0)

        written: List[str] = []
        pattern = re.compile(
            r"^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(\w+)",
            re.IGNORECASE,
        )

        def trace(statement: str) -> None:
            found = pattern.match(statement)
            if found:
                written.append(found.group(1))

        def refuse(*args, **kwargs):
            raise AssertionError(f"a duplicate scan touched the filesystem: {args!r}")

        db.connect().set_trace_callback(trace)
        for name in ("stat", "lstat", "listdir", "scandir", "open", "remove", "rename"):
            monkeypatch.setattr(os, name, refuse)
        monkeypatch.setattr(os.path, "exists", refuse)
        monkeypatch.setattr(builtins, "open", refuse)
        try:
            service.scan()
            [group] = service.groups(SIGNAL_PATH)
            service.dismiss(int(group.group.id))
            service.restore(int(group.group.id))
        finally:
            db.connect().set_trace_callback(None)
            monkeypatch.undo()

        assert written, "the trace saw no writes, so it proves nothing"
        assert set(written) <= DUPLICATE_TABLES


# ----------------------------------------------------------- scanning itself


class TestScanning:
    def test_one_event_per_scan_with_each_signals_count(self, db, tracks, service):
        add(db, tracks, "one", path="/m/a.mp3", title="Track")
        add(db, tracks, "two", path="/m/a.mp3", title="Track", seconds=301)
        result = service.scan(trigger=TRIGGER_IMPORT)
        assert result.summary_line() == (
            "Found 2 possible duplicate groups: 1 by file path, 1 by artist and title"
        )
        [event] = events(db, EVENT_DUPLICATES_SCANNED)
        assert json.loads(event["detail_json"]) == {
            "trigger": "import",
            "cancelled": False,
            "path": 1,
            "beatport": 0,
            "text": 1,
        }

    def test_a_library_with_no_duplicates_says_so(self, db, tracks, service):
        add(db, tracks, "one", title="Track")
        assert service.scan().summary_line() == "Found no possible duplicates"

    def test_a_cancel_before_the_first_signal_writes_and_records_nothing(
        self, db, tracks, service
    ):
        add(db, tracks, "one", path="/m/a.mp3")
        add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        result = service.scan(should_cancel=lambda: True)
        assert result.cancelled and result.scans == ()
        assert service.groups() == []
        assert events(db, EVENT_DUPLICATES_SCANNED) == []

    def test_a_cancel_between_signals_keeps_the_signals_written(
        self, db, tracks, service
    ):
        add(db, tracks, "one", path="/m/a.mp3", title="Track")
        add(db, tracks, "two", path="/m/a.mp3", title="Track", seconds=301)
        asked = {"n": 0}

        def cancel_after_path() -> bool:
            asked["n"] += 1
            return asked["n"] > 1

        result = service.scan(should_cancel=cancel_after_path)
        assert [scan.signal for scan in result.scans] == [SIGNAL_PATH]
        assert result.cancelled
        assert members(service, SIGNAL_TEXT) == []
        assert len(members(service, SIGNAL_PATH)) == 1
        assert result.summary_line() == (
            "Stopped after looking for duplicates by file path: 1 by file path"
        )

    def test_a_cancel_while_titles_are_read_leaves_the_previous_text_groups(
        self, db, tracks, service, monkeypatch
    ):
        add(db, tracks, "one", title="Track")
        add(db, tracks, "two", title="Track", seconds=301)
        service.scan([SIGNAL_TEXT])
        add(db, tracks, "three", title="Other")
        add(db, tracks, "four", title="Other", seconds=301)
        monkeypatch.setattr(module, "_CANCEL_EVERY_ROWS", 1)
        asked = {"n": 0}

        def cancel_mid_read() -> bool:
            asked["n"] += 1
            return asked["n"] > 2

        result = service.scan([SIGNAL_TEXT], should_cancel=cancel_mid_read)
        assert result.cancelled and result.scans == ()
        assert len(members(service, SIGNAL_TEXT)) == 1

    def test_a_busy_database_is_waited_out(
        self, db, tracks, repo, service, monkeypatch
    ):
        add(db, tracks, "one", path="/m/a.mp3")
        add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        real = repo.replace_signal
        calls: List[str] = []

        def replace(signal, groups, computed_at):
            calls.append(signal)
            if len(calls) <= 2:
                raise sqlite3.OperationalError("database is locked")
            return real(signal, groups, computed_at)

        monkeypatch.setattr(repo, "replace_signal", replace)
        monkeypatch.setattr(module, "_BUSY_RETRY_INTERVAL_SECONDS", 0.0)
        service.scan([SIGNAL_PATH])
        assert calls == [SIGNAL_PATH] * 3
        assert len(members(service, SIGNAL_PATH)) == 1

    def test_a_failure_that_is_not_busy_is_raised(
        self, db, tracks, repo, service, monkeypatch
    ):
        def replace(signal, groups, computed_at):
            raise sqlite3.OperationalError("disk I/O error")

        monkeypatch.setattr(repo, "replace_signal", replace)
        with pytest.raises(sqlite3.OperationalError, match="disk"):
            service.scan([SIGNAL_PATH])

    def test_a_feed_that_cannot_be_written_does_not_fail_the_scan(
        self, db, tracks, repo
    ):
        class Broken:
            def record_event(self, *args, **kwargs):
                raise sqlite3.OperationalError("database is locked")

        add(db, tracks, "one", path="/m/a.mp3")
        add(db, tracks, "two", path="/m/a.mp3", seconds=10)
        result = DuplicateService(repo, Broken(), db, clock=lambda: NOW).scan()  # type: ignore[arg-type]
        assert result.groups == 1

    def test_an_unknown_trigger_or_signal_is_refused(self, service):
        with pytest.raises(ValueError, match="trigger"):
            service.scan(trigger="launch")
        with pytest.raises(ValueError, match="Unknown"):
            service.scan(["sound"])
        with pytest.raises(ValueError, match="Unknown"):
            service.groups("sound")


class TestSignalsAndResults:
    def test_signals_are_scanned_in_one_order_whatever_order_they_are_named(self):
        assert validate_signals(None) == SIGNALS
        assert validate_signals(["text", "path", "text"]) == (SIGNAL_PATH, SIGNAL_TEXT)
        with pytest.raises(ValueError, match="at least one"):
            validate_signals([])

    @pytest.mark.parametrize(
        "fields",
        [
            dict(trigger="launch", signals=SIGNALS, scans=()),
            dict(trigger="request", signals=SIGNALS, scans=()),
            dict(
                trigger="request",
                signals=(SIGNAL_PATH,),
                scans=(SignalScan(SIGNAL_TEXT, 0, 0, 0, 0.0),),
                cancelled=True,
            ),
        ],
    )
    def test_results_a_scan_cannot_produce_are_refused(self, fields):
        with pytest.raises(ValueError):
            DuplicateScanResult(**fields)

    def test_the_payload(self):
        result = DuplicateScanResult(
            trigger="match",
            signals=(SIGNAL_PATH, SIGNAL_BEATPORT),
            scans=(
                SignalScan(SIGNAL_PATH, 2, 4, 1, 0.12345),
                SignalScan(SIGNAL_BEATPORT, 0, 0, 0, 0.1),
            ),
            duration_seconds=0.5,
        )
        assert result.to_dict() == {
            "trigger": "match",
            "signals": ["path", "beatport"],
            "scans": [
                {
                    "signal": "path",
                    "groups": 2,
                    "tracks": 4,
                    "dismissed": 1,
                    "seconds": 0.123,
                },
                {
                    "signal": "beatport",
                    "groups": 0,
                    "tracks": 0,
                    "dismissed": 0,
                    "seconds": 0.1,
                },
            ],
            "groups": 2,
            "cancelled": False,
            "duration_seconds": 0.5,
            "summary_line": (
                "Found 2 possible duplicate groups: 2 by file path."
                " 1 more group marked not duplicates"
            ),
        }
