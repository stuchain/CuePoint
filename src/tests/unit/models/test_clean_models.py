#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Clean domain models (CLEAN-01).

Five modules over the tables ``m0011_clean`` creates, plus the five overrides
``TrackMetadata`` gained. The schema refuses a bad vocabulary value with a
CHECK; these tests pin what the models refuse *before* a statement is written,
and the distinctions that are easy to collapse and expensive to get back:

- An attempt's ``error`` outcome is not a track's ``no_match`` state, and an
  error nobody can read is refused.
- An accepted match names its candidate; a track with no match cannot.
- Only a user's decision can be disputed by a newer attempt (DEC-067).
- A dismissal covers exactly the members it was made for (DEC-074).
- "Unknown" artwork is not "none" — only "none" may be embedded into (DEC-076).
- A write record's "never read" is not "read, and empty" (DEC-070).
- A blank override is no override, not an override of nothing (DEC-068).

Every model round-trips through ``to_dict`` and ``from_row``, which is the
contract the repositories of CLEAN-02 onward are built on.
"""

from __future__ import annotations

import dataclasses
import json

import pytest

from cuepoint.models.artwork import (
    EMBEDDED_NONE,
    EMBEDDED_PRESENT,
    EMBEDDED_UNKNOWN,
    TrackArtwork,
)
from cuepoint.models.duplicate_group import (
    SIGNAL_BEATPORT,
    SIGNAL_PATH,
    SIGNAL_TEXT,
    DuplicateDismissal,
    DuplicateGroup,
    DuplicateMember,
    member_hash,
)
from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    FILE_UNREADABLE,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.models.file_write import (
    WRITE_FAILED,
    WRITE_RESTORED,
    WRITE_SKIPPED,
    WRITE_WRITTEN,
    FileWrite,
)
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    OUTCOME_ERROR,
    OUTCOME_MATCHED,
    OUTCOME_NO_MATCH,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_REJECTED,
    MatchAttempt,
    MatchCandidate,
    MatchJobTrack,
    TrackMatch,
)
from cuepoint.models.row_values import (
    flag,
    https_url,
    non_negative,
    one_of,
    optional_https_url,
    optional_id,
    optional_iso_date,
    optional_number,
    optional_text,
    required_text,
    whole_number,
)
from cuepoint.models.track_metadata import OVERRIDE_FIELDS, TrackMetadata

NOW = "2026-09-13T12:00:00+00:00"
INPUT = json.dumps({"title": "Strobe", "artist": "deadmau5", "key": "Am"})


def attempt(**overrides) -> MatchAttempt:
    fields = dict(
        track_id=7,
        outcome=OUTCOME_MATCHED,
        input_json=INPUT,
        started_at=NOW,
        finished_at=NOW,
    )
    fields.update(overrides)
    return MatchAttempt(**fields)


def candidate(**overrides) -> MatchCandidate:
    fields = dict(
        attempt_id=3,
        rank=0,
        url="https://www.beatport.com/track/strobe/123",
        score=97.5,
        guard_ok=True,
        is_winner=True,
    )
    fields.update(overrides)
    return MatchCandidate(**fields)


def track_match(**overrides) -> TrackMatch:
    fields = dict(
        track_id=7,
        state=STATE_ACCEPTED,
        decided_by=DECIDED_BY_AUTO,
        attempt_id=3,
        candidate_id=11,
        decided_at=NOW,
    )
    fields.update(overrides)
    return TrackMatch(**fields)


class TestRowValues:
    @pytest.mark.parametrize("value", [True, 4.5, "four", None, "4.5"])
    def test_a_whole_number_refuses_what_is_not_one(self, value):
        with pytest.raises(ValueError):
            whole_number(value, "n")

    @pytest.mark.parametrize("value, expected", [(4, 4), (4.0, 4), ("4", 4)])
    def test_a_whole_number_accepts_its_spellings(self, value, expected):
        assert whole_number(value, "n") == expected

    def test_negative_is_refused_where_it_cannot_be(self):
        with pytest.raises(ValueError, match="negative"):
            non_negative(-1, "rank")

    @pytest.mark.parametrize("value", ["no", "yes", 2, -1, None, 0.5])
    def test_a_flag_is_not_read_for_truthiness(self, value):
        # "no" is a truthy string: a guard verdict stored from it would say the
        # opposite of what the matcher said.
        with pytest.raises(ValueError):
            flag(value, "guard_ok")

    @pytest.mark.parametrize("value, expected", [(1, True), (0, False), (True, True)])
    def test_a_flag_accepts_sqlite_and_python(self, value, expected):
        assert flag(value, "guard_ok") is expected

    @pytest.mark.parametrize("value", [float("nan"), float("inf"), True, "x"])
    def test_a_number_is_finite(self, value):
        with pytest.raises(ValueError):
            optional_number(value, "score")

    def test_required_text_is_kept_as_given(self):
        # A path with its whitespace removed can name another file.
        assert required_text(" /m/a b.mp3 ", "file_path") == " /m/a b.mp3 "

    @pytest.mark.parametrize("value", ["", "   ", None, 5])
    def test_required_text_refuses_blank_or_not_text(self, value):
        with pytest.raises(ValueError):
            required_text(value, "file_path")

    @pytest.mark.parametrize("value", [0, -3])
    def test_an_id_is_positive(self, value):
        with pytest.raises(ValueError, match="positive id"):
            optional_id(value, "id")

    def test_a_vocabulary_names_what_is_allowed(self):
        with pytest.raises(ValueError, match="'a', 'b'"):
            one_of("c", ("a", "b"), "kind")

    def test_optional_text_is_none_or_kept_as_given(self):
        assert optional_text(None, "note") is None
        assert optional_text(" the dub ", "note") == " the dub "

    @pytest.mark.parametrize("value", ["", "  ", 5])
    def test_optional_text_is_not_blank(self, value):
        # None and "" are different facts; only None means "no value".
        with pytest.raises(ValueError):
            optional_text(value, "note")

    @pytest.mark.parametrize("value", [None, "2026-08-14", "2024-02-29"])
    def test_an_iso_date_is_kept(self, value):
        assert optional_iso_date(value, "release_date") == value

    @pytest.mark.parametrize(
        "value",
        [
            "2026-8-14",
            "2026-02-30",
            "2023-02-29",
            "14/08/2026",
            "2026-08-14T00:00",
            20260814,
        ],
    )
    def test_an_iso_date_is_exactly_yyyy_mm_dd(self, value):
        # Anything else sorts wrongly as text.
        with pytest.raises(ValueError, match="YYYY-MM-DD"):
            optional_iso_date(value, "release_date")

    def test_an_https_url_is_kept_as_given(self):
        url = "https://www.beatport.com/track/x/1"
        assert https_url(url, "url") == url
        assert optional_https_url(None, "url") is None

    @pytest.mark.parametrize(
        "value",
        [
            "http://www.beatport.com/track/x/1",
            "javascript:alert(1)",
            "file:///C:/Windows",
            "HTTPS://",
            "https://",
            "",
            None,
            7,
        ],
    )
    def test_a_link_the_app_would_open_is_https(self, value):
        with pytest.raises(ValueError):
            https_url(value, "url")


class TestMatchAttempt:
    @pytest.mark.parametrize("outcome", [OUTCOME_MATCHED, OUTCOME_NO_MATCH])
    def test_the_outcomes_are_accepted(self, outcome):
        assert attempt(outcome=outcome).outcome == outcome

    def test_an_outcome_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="outcome"):
            attempt(outcome="maybe")

    def test_an_error_must_say_what_it_was(self):
        with pytest.raises(ValueError, match="error"):
            attempt(outcome=OUTCOME_ERROR)
        with pytest.raises(ValueError, match="error"):
            attempt(outcome=OUTCOME_ERROR, error="   ")
        assert attempt(outcome=OUTCOME_ERROR, error="timed out").is_error

    @pytest.mark.parametrize("raw", ["not json", "[1, 2]", "", None])
    def test_the_question_must_be_a_json_object(self, raw):
        with pytest.raises(ValueError, match="input_json"):
            attempt(input_json=raw)

    def test_queries_must_be_a_json_array(self):
        with pytest.raises(ValueError, match="queries_json"):
            attempt(queries_json='{"q": 1}')

    def test_the_question_and_queries_read_back_parsed(self):
        record = attempt(queries_json='["deadmau5 strobe", "strobe"]')
        assert record.input["title"] == "Strobe"
        assert record.queries == ["deadmau5 strobe", "strobe"]
        assert attempt().queries == []

    def test_it_round_trips_through_a_row(self):
        record = attempt(
            id=5,
            job_id="job-1",
            best_candidate_id=11,
            score=97.5,
            queries_json='["q"]',
            matcher_version="1.0.0",
        )
        assert MatchAttempt.from_row(record.to_dict()) == record

    def test_it_is_immutable(self):
        with pytest.raises(dataclasses.FrozenInstanceError):
            attempt().outcome = OUTCOME_NO_MATCH  # type: ignore[misc]

    def test_ids_from_sqlite_are_coerced(self):
        assert attempt(track_id="7").track_id == 7


class TestMatchCandidate:
    def test_every_column_round_trips(self):
        record = candidate(
            id=11,
            beatport_track_id="123",
            title="Strobe",
            artists="deadmau5",
            remixers="",
            label="mau5trap",
            genre="Progressive House",
            subgenre="Melodic",
            key="A min",
            bpm=128.0,
            release_name="For Lack of a Better Name",
            release_date="2009-09-22",
            release_year=2009,
            artwork_url="https://geo-media.beatport.com/image/1.jpg",
            preview_url="https://geo-samples.beatport.com/1.mp3",
            base_score=90.0,
            title_sim=100,
            artist_sim=98,
            bonus_year=2,
            bonus_key=-3,
            reject_reason="",
            query_index=1,
            query_text="deadmau5 strobe",
            candidate_index=0,
            elapsed_ms=412,
        )
        row = record.to_dict()
        assert (row["guard_ok"], row["is_winner"]) == (1, 1)
        assert MatchCandidate.from_row(row) == record

    def test_a_rejected_loser_reads_back_as_one(self):
        record = candidate(guard_ok=0, is_winner=0, reject_reason="artist mismatch")
        restored = MatchCandidate.from_row(record.to_dict())
        assert (restored.guard_ok, restored.is_winner) == (False, False)

    def test_a_candidate_nobody_can_open_is_refused(self):
        with pytest.raises(ValueError, match="url"):
            candidate(url="")

    def test_rank_cannot_be_negative(self):
        with pytest.raises(ValueError, match="rank"):
            candidate(rank=-1)

    @pytest.mark.parametrize("name", ["title_sim", "artist_sim"])
    @pytest.mark.parametrize("value", [0, 43.47826086956522, 100, 100.0])
    def test_a_similarity_is_any_percentage_the_matcher_scores(self, name, value):
        """RapidFuzz's ratios are fractional; ``m0012`` stores them as REAL."""
        assert getattr(candidate(**{name: value}), name) == value

    @pytest.mark.parametrize("name", ["title_sim", "artist_sim"])
    @pytest.mark.parametrize(
        "value", [101, 100.5, -0.5, float("nan"), float("inf"), "high", True]
    )
    def test_a_similarity_outside_a_percentage_is_refused(self, name, value):
        with pytest.raises(ValueError, match=name):
            candidate(**{name: value})

    def test_a_bonus_may_be_a_penalty(self):
        assert candidate(bonus_key=-5).bonus_key == -5

    def test_a_guard_verdict_must_be_a_verdict(self):
        with pytest.raises(ValueError, match="guard_ok"):
            candidate(guard_ok="yes")

    def test_a_score_is_required(self):
        with pytest.raises(ValueError, match="score"):
            candidate(score=None)


class TestMatchAttemptJob:
    def test_a_single_match_has_no_job(self):
        assert attempt(job_id=None).job_id is None

    def test_a_job_id_is_kept_as_given(self):
        assert attempt(job_id="job-7").job_id == "job-7"

    @pytest.mark.parametrize("blank", ["", "   ", 7])
    def test_a_job_id_that_names_nothing_is_refused(self, blank):
        with pytest.raises(ValueError, match="job_id"):
            attempt(job_id=blank)


class TestTrackMatch:
    @pytest.mark.parametrize("state", [STATE_NEEDS_REVIEW, STATE_REJECTED])
    def test_states_that_may_or_may_not_name_a_candidate(self, state):
        assert track_match(state=state, candidate_id=None).state == state
        assert track_match(state=state).candidate_id == 11

    def test_a_state_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="state"):
            track_match(state="not_matched")

    def test_a_decider_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="decided_by"):
            track_match(decided_by="beatport")

    def test_an_acceptance_names_what_it_accepted(self):
        # "Apply" copies from this candidate (DEC-004), so there has to be one.
        with pytest.raises(ValueError, match="candidate"):
            track_match(state=STATE_ACCEPTED, candidate_id=None)

    def test_no_match_has_nothing_to_point_at(self):
        with pytest.raises(ValueError, match="candidate"):
            track_match(state=STATE_NO_MATCH, candidate_id=11)
        assert track_match(state=STATE_NO_MATCH, candidate_id=None).candidate_id is None

    def test_only_a_users_decision_can_be_disputed(self):
        with pytest.raises(ValueError, match="user"):
            track_match(decided_by=DECIDED_BY_AUTO, newer_attempt_id=4)
        disputed = track_match(decided_by=DECIDED_BY_USER, newer_attempt_id=4)
        assert disputed.is_disputed and disputed.is_user_decision

    def test_the_newer_attempt_is_not_the_decided_one(self):
        with pytest.raises(ValueError, match="newer"):
            track_match(decided_by=DECIDED_BY_USER, newer_attempt_id=3)

    def test_it_round_trips_through_a_row(self):
        record = track_match(decided_by=DECIDED_BY_USER, newer_attempt_id=9)
        assert TrackMatch.from_row(record.to_dict()) == record

    def test_an_automatic_state_is_not_disputed(self):
        assert not track_match().is_disputed
        assert not track_match().is_user_decision


class TestMatchJobTrack:
    def test_a_plan_row_starts_not_done(self):
        assert MatchJobTrack(job_id="job-1", position=0, track_id=7).done is False

    def test_it_round_trips_through_a_row(self):
        record = MatchJobTrack(job_id="job-1", position=12, track_id=7, done=True)
        row = record.to_dict()
        assert row["done"] == 1
        assert MatchJobTrack.from_row(row) == record

    @pytest.mark.parametrize(
        "fields",
        [
            dict(job_id="", position=0, track_id=7),
            dict(job_id="j", position=-1, track_id=7),
            dict(job_id="j", position=0, track_id=0),
        ],
    )
    def test_a_malformed_plan_row_is_refused(self, fields):
        with pytest.raises(ValueError):
            MatchJobTrack(**fields)


class TestTrackFileStatus:
    @pytest.mark.parametrize("status", [FILE_PRESENT, FILE_UNREADABLE])
    def test_a_found_file_may_have_a_size(self, status):
        check = TrackFileStatus(7, status, "/m/7.mp3", NOW, size_bytes=1024)
        assert check.size_bytes == 1024

    def test_a_missing_file_has_no_size(self):
        with pytest.raises(ValueError, match="size"):
            TrackFileStatus(7, FILE_MISSING, "/m/7.mp3", NOW, size_bytes=0)
        assert TrackFileStatus(7, FILE_MISSING, "/m/7.mp3", NOW).is_missing

    def test_a_status_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="status"):
            TrackFileStatus(7, "moved", "/m/7.mp3", NOW)

    def test_a_check_of_another_path_is_stale(self):
        # DEC-073: a refresh that moved the path makes the answer visibly old.
        check = TrackFileStatus(7, FILE_PRESENT, "/m/7.mp3", NOW)
        assert not check.is_stale_for("/m/7.mp3")
        assert check.is_stale_for("/new/7.mp3")
        assert check.is_stale_for(None)

    def test_it_round_trips_through_a_row(self):
        check = TrackFileStatus(7, FILE_PRESENT, "/m/7.mp3", NOW, size_bytes=5)
        assert TrackFileStatus.from_row(check.to_dict()) == check
        assert check.is_present

    def test_a_missing_file_can_say_its_root_was_unavailable(self):
        # CLEAN-07: a drive that is not there explains every file on it.
        check = TrackFileStatus(
            7, FILE_MISSING, "E:/7.mp3", NOW, reason=REASON_ROOT_UNAVAILABLE
        )
        assert TrackFileStatus.from_row(check.to_dict()) == check
        assert TrackFileStatus(7, FILE_MISSING, "/m/7.mp3", NOW).reason is None

    @pytest.mark.parametrize("status", [FILE_PRESENT, FILE_UNREADABLE])
    def test_only_a_missing_file_has_a_reason(self, status):
        with pytest.raises(ValueError, match="Only a missing file"):
            TrackFileStatus(7, status, "/m/7.mp3", NOW, reason=REASON_ROOT_UNAVAILABLE)

    @pytest.mark.parametrize("reason", ["moved", "ROOT_UNAVAILABLE", "", 1])
    def test_a_reason_outside_the_vocabulary_is_refused(self, reason):
        with pytest.raises(ValueError, match="reason"):
            TrackFileStatus(7, FILE_MISSING, "/m/7.mp3", NOW, reason=reason)

    def test_a_row_from_before_the_reason_column_reads_as_no_reason(self):
        row = {
            "track_id": 7,
            "status": FILE_MISSING,
            "checked_path": "/m/7.mp3",
            "size_bytes": None,
            "checked_at": NOW,
        }
        assert TrackFileStatus.from_row(row).reason is None


class TestDuplicates:
    def test_membership_order_and_repetition_do_not_change_the_hash(self):
        assert member_hash([3, 1, 2]) == member_hash([1, 2, 3, 3])

    def test_a_new_member_changes_the_hash(self):
        assert member_hash([1, 2]) != member_hash([1, 2, 3])

    def test_a_group_of_nobody_has_no_fingerprint(self):
        with pytest.raises(ValueError, match="members"):
            member_hash([])

    def test_a_dismissal_covers_exactly_the_members_it_saw(self):
        group = DuplicateGroup(SIGNAL_TEXT, "deadmau5|strobe", NOW, id=1)
        dismissal = DuplicateDismissal(
            SIGNAL_TEXT, "deadmau5|strobe", member_hash([4, 9]), NOW
        )
        assert dismissal.covers(group, [9, 4])
        # DEC-074: a group that gained a track is shown again.
        assert not dismissal.covers(group, [4, 9, 12])
        assert not dismissal.covers(group, [4])

    def test_a_dismissal_does_not_cover_another_key_or_signal(self):
        dismissal = DuplicateDismissal(SIGNAL_TEXT, "k", member_hash([4, 9]), NOW)
        assert not dismissal.covers(DuplicateGroup(SIGNAL_TEXT, "other", NOW), [4, 9])
        assert not dismissal.covers(DuplicateGroup(SIGNAL_PATH, "k", NOW), [4, 9])

    @pytest.mark.parametrize("signal", [SIGNAL_PATH, SIGNAL_BEATPORT, SIGNAL_TEXT])
    def test_every_signal_round_trips(self, signal):
        group = DuplicateGroup(signal, "key", NOW, id=2)
        assert DuplicateGroup.from_row(group.to_dict()) == group
        dismissal = DuplicateDismissal(signal, "key", member_hash([1, 2]), NOW)
        assert DuplicateDismissal.from_row(dismissal.to_dict()) == dismissal

    def test_a_signal_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="signal"):
            DuplicateGroup("audio", "key", NOW)
        with pytest.raises(ValueError, match="signal"):
            DuplicateDismissal("audio", "key", "h", NOW)

    def test_a_member_round_trips(self):
        member = DuplicateMember(group_id="2", track_id=7)
        assert DuplicateMember.from_row(member.to_dict()) == DuplicateMember(2, 7)

    def test_a_blank_key_is_refused(self):
        with pytest.raises(ValueError, match="group_key"):
            DuplicateGroup(SIGNAL_PATH, " ", NOW)


class TestTrackArtwork:
    def test_a_new_record_is_unknown_not_none(self):
        record = TrackArtwork(track_id=7)
        assert record.embedded == EMBEDDED_UNKNOWN
        # DEC-076: a file nobody read may already carry art.
        assert not record.needs_embedding
        assert not record.has_embedded

    def test_only_a_file_known_to_have_none_needs_embedding(self):
        assert TrackArtwork(7, EMBEDDED_NONE, checked_at=NOW).needs_embedding
        assert not TrackArtwork(
            7, EMBEDDED_PRESENT, embedded_hash="ab", checked_at=NOW
        ).needs_embedding

    def test_a_hash_belongs_only_to_a_present_picture(self):
        with pytest.raises(ValueError, match="hash"):
            TrackArtwork(7, EMBEDDED_NONE, embedded_hash="ab", checked_at=NOW)

    @pytest.mark.parametrize("embedded", [EMBEDDED_NONE, EMBEDDED_PRESENT])
    def test_an_answer_says_when_it_was_found(self, embedded):
        with pytest.raises(ValueError, match="when"):
            TrackArtwork(7, embedded)

    def test_a_state_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="embedded"):
            TrackArtwork(7, "maybe")

    def test_it_round_trips_through_a_row(self):
        record = TrackArtwork(
            7,
            EMBEDDED_PRESENT,
            embedded_hash="ab12",
            beatport_url="https://geo-media.beatport.com/image/1.jpg",
            cache_key="c0ffee",
            checked_at=NOW,
        )
        assert TrackArtwork.from_row(record.to_dict()) == record

    def test_what_clean_09_added_round_trips_too(self):
        record = TrackArtwork(
            7,
            EMBEDDED_PRESENT,
            embedded_hash="ab12",
            beatport_url="https://geo-media.beatport.com/image/1.jpg",
            checked_at=NOW,
            checked_path="/m/7.mp3",
            embedded_refused="corrupt",
            beatport_refused="too_large",
            beatport_page="https://www.beatport.com/track/x/1",
        )
        assert TrackArtwork.from_row(record.to_dict()) == record

    def test_unreadable_tags_leave_the_answer_unknown(self):
        assert TrackArtwork(7, embedded_refused="tags").embedded == EMBEDDED_UNKNOWN
        with pytest.raises(ValueError, match="no answer"):
            TrackArtwork(7, EMBEDDED_NONE, checked_at=NOW, embedded_refused="tags")

    @pytest.mark.parametrize("embedded", [EMBEDDED_UNKNOWN, EMBEDDED_NONE])
    def test_only_a_present_picture_can_be_refused_by_the_guard(self, embedded):
        with pytest.raises(ValueError, match="present"):
            TrackArtwork(7, embedded, checked_at=NOW, embedded_refused="format")

    def test_a_refusal_reason_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="embedded_refused"):
            TrackArtwork(7, EMBEDDED_PRESENT, checked_at=NOW, embedded_refused="ugly")
        with pytest.raises(ValueError, match="beatport_refused"):
            TrackArtwork(
                7, beatport_url="https://beatport.com/a.jpg", beatport_refused="tags"
            )

    @pytest.mark.parametrize("url", [None, "", "  "])
    def test_a_refused_beatport_image_names_its_url(self, url):
        with pytest.raises(ValueError, match="URL"):
            TrackArtwork(7, beatport_url=url, beatport_refused="corrupt")

    def test_an_answer_read_at_another_path_is_stale(self):
        read = TrackArtwork(7, EMBEDDED_NONE, checked_at=NOW, checked_path="/m/a.mp3")

        assert not read.is_stale_for("/m/a.mp3")
        assert read.is_stale_for("/n/a.mp3")
        assert read.is_stale_for(None)
        assert TrackArtwork(7).is_stale_for("/m/a.mp3")


class TestFileWrite:
    def write(self, **overrides) -> FileWrite:
        fields = dict(
            job_id="job-9",
            file_path="/m/7.mp3",
            field="key",
            outcome=WRITE_WRITTEN,
            written_at=NOW,
            track_id=7,
            old_value_json='"Am"',
            new_value_json='"8A"',
        )
        fields.update(overrides)
        return FileWrite(**fields)

    @pytest.mark.parametrize("outcome", [WRITE_SKIPPED, WRITE_FAILED])
    def test_a_skip_or_failure_says_why(self, outcome):
        with pytest.raises(ValueError, match="why"):
            self.write(outcome=outcome)
        assert self.write(outcome=outcome, reason="file is read-only").reason

    @pytest.mark.parametrize(
        "outcome, restore_of", [(WRITE_WRITTEN, None), (WRITE_RESTORED, 3)]
    )
    def test_a_write_or_restore_needs_no_reason(self, outcome, restore_of):
        record = self.write(outcome=outcome, restore_of=restore_of)
        assert record.outcome == outcome

    def test_a_restore_names_the_write_it_undid_and_only_a_restore_does(self):
        # CLEAN-10: a restore row points at its write; a write points at nothing.
        with pytest.raises(ValueError, match="name the write"):
            self.write(outcome=WRITE_RESTORED)
        with pytest.raises(ValueError, match="only a restore"):
            self.write(outcome=WRITE_WRITTEN, restore_of=3)
        skipped = self.write(outcome=WRITE_SKIPPED, reason="stale", restore_of=3)
        assert skipped.is_restore and not self.write().is_restore

    @pytest.mark.parametrize("outcome", [WRITE_WRITTEN, WRITE_RESTORED])
    def test_a_write_or_a_restore_may_be_pending(self, outcome):
        record = self.write(
            outcome=outcome,
            pending=1,
            restore_of=(3 if outcome == WRITE_RESTORED else None),
        )
        assert record.pending is True
        assert FileWrite.from_row(record.to_dict()) == record

    @pytest.mark.parametrize("outcome", [WRITE_SKIPPED, WRITE_FAILED])
    def test_a_skip_or_a_failure_is_never_pending(self, outcome):
        with pytest.raises(ValueError, match="never pending"):
            self.write(outcome=outcome, reason="why", pending=True)

    def test_pending_is_a_flag(self):
        with pytest.raises(ValueError, match="pending"):
            self.write(pending="yes")

    def test_never_read_is_not_read_and_empty(self):
        never = self.write(outcome=WRITE_FAILED, reason="locked", old_value_json=None)
        empty = self.write(old_value_json="null")
        assert not never.old_value_was_read
        assert empty.old_value_was_read
        assert never.old_value is None and empty.old_value is None

    def test_values_read_back_parsed(self):
        record = self.write()
        assert (record.old_value, record.new_value) == ("Am", "8A")

    def test_stored_values_must_be_json(self):
        with pytest.raises(ValueError, match="new_value_json"):
            self.write(new_value_json="8A")

    def test_a_record_outlives_its_track(self):
        # ON DELETE SET NULL: the row stays, and still names the file.
        orphan = self.write(track_id=None)
        assert orphan.is_orphaned
        assert orphan.file_path == "/m/7.mp3"

    def test_an_outcome_outside_the_vocabulary_is_refused(self):
        with pytest.raises(ValueError, match="outcome"):
            self.write(outcome="deleted")

    def test_it_round_trips_through_a_row(self):
        record = self.write(id=3)
        assert FileWrite.from_row(record.to_dict()) == record


class TestTrackMetadataOverrides:
    def test_no_override_by_default(self):
        record = TrackMetadata(track_id=1)
        assert all(getattr(record, name) is None for name in OVERRIDE_FIELDS)
        assert not record.has_overrides

    def test_an_override_alone_is_not_an_empty_record(self):
        # A row holding only an applied key is a row worth keeping.
        assert not TrackMetadata(track_id=1, key="8A").is_empty

    @pytest.mark.parametrize("name", ["key", "genre", "label"])
    def test_blank_text_is_no_override(self, name):
        # An empty override would hide Rekordbox's value behind nothing.
        assert getattr(TrackMetadata(track_id=1, **{name: "   "}), name) is None

    def test_text_is_trimmed(self):
        assert TrackMetadata(track_id=1, genre="  Techno ").genre == "Techno"

    @pytest.mark.parametrize("name", ["key", "genre", "label"])
    def test_text_overrides_must_be_text(self, name):
        with pytest.raises(ValueError, match=name):
            TrackMetadata(track_id=1, **{name: 8})

    @pytest.mark.parametrize("value", [True, "fast", float("nan"), float("inf")])
    def test_a_bpm_is_a_finite_number(self, value):
        with pytest.raises(ValueError, match="bpm"):
            TrackMetadata(track_id=1, bpm=value)

    @pytest.mark.parametrize("value", [True, 2020.5, "last year"])
    def test_a_year_is_a_whole_number(self, value):
        with pytest.raises(ValueError, match="year"):
            TrackMetadata(track_id=1, year=value)

    def test_numbers_are_coerced_from_their_spellings(self):
        record = TrackMetadata(track_id=1, bpm=124, year=2020.0)
        assert (record.bpm, record.year) == (124.0, 2020)
        assert isinstance(record.bpm, float) and isinstance(record.year, int)

    def test_it_round_trips_through_a_row(self):
        record = TrackMetadata(
            track_id=1,
            rating=4,
            key="8A",
            bpm=126.5,
            genre="Techno",
            label="Drumcode",
            year=2019,
        )
        assert TrackMetadata.from_row(record.to_dict()) == record

    def test_a_row_from_before_the_overrides_still_reads(self):
        # The columns are null on every row m0011 migrated.
        row = {
            "track_id": 1,
            "rating": 2,
            "favorite": 0,
            "notes": None,
            "created_at": NOW,
            "updated_at": NOW,
        }
        record = TrackMetadata.from_row(row)
        assert record.rating == 2 and not record.has_overrides


class TestDuplicateScanModels:
    """What CLEAN-08 added to the duplicate types."""

    def test_a_group_carries_the_fingerprint_it_was_written_with(self):
        from cuepoint.models.duplicate_group import DuplicateGroup, member_hash

        fingerprint = member_hash([2, 1])
        group = DuplicateGroup(
            SIGNAL_TEXT, "a|t||300", NOW, id=4, member_hash=fingerprint
        )
        assert DuplicateGroup.from_row(group.to_dict()) == group
        assert DuplicateGroup(SIGNAL_TEXT, "k", NOW).member_hash == ""

    @pytest.mark.parametrize("fingerprint", ["abc", "g" * 64, "A" * 64])
    def test_a_fingerprint_that_is_not_a_sha256_is_refused(self, fingerprint):
        from cuepoint.models.duplicate_group import DuplicateGroup

        with pytest.raises(ValueError, match="member_hash"):
            DuplicateGroup(SIGNAL_TEXT, "k", NOW, member_hash=fingerprint)

    def test_a_scanned_group_puts_its_members_in_order_once(self):
        from cuepoint.models.duplicate_group import ScannedGroup, member_hash

        group = ScannedGroup(SIGNAL_PATH, "/m/a.mp3", (3, 1, 3))
        assert group.track_ids == (1, 3)
        assert group.member_hash == member_hash([1, 3])

    @pytest.mark.parametrize(
        "fields",
        [
            dict(signal=SIGNAL_PATH, group_key="k", track_ids=(1, 1)),
            dict(signal=SIGNAL_PATH, group_key="k", track_ids=(0, 1)),
            dict(signal="sound", group_key="k", track_ids=(1, 2)),
            dict(signal=SIGNAL_PATH, group_key="", track_ids=(1, 2)),
        ],
    )
    def test_a_scanned_group_that_is_not_a_group_is_refused(self, fields):
        from cuepoint.models.duplicate_group import ScannedGroup

        with pytest.raises(ValueError):
            ScannedGroup(**fields)

    def test_a_stored_group_is_shown_only_with_two_members_and_no_dismissal(self):
        from cuepoint.models.duplicate_group import (
            DuplicateGroup,
            DuplicateGroupMembers,
        )

        group = DuplicateGroup(SIGNAL_BEATPORT, "id:1", NOW, id=9)
        assert DuplicateGroupMembers(group, (1, 2)).shown
        assert not DuplicateGroupMembers(group, (1, 2), dismissed=True).shown
        assert not DuplicateGroupMembers(group, (1,)).shown
        assert DuplicateGroupMembers(group, (1, 2)).to_dict() == {
            "id": 9,
            "signal": SIGNAL_BEATPORT,
            "group_key": "id:1",
            "computed_at": NOW,
            "track_ids": [1, 2],
            "dismissed": False,
        }

    def test_every_signal_has_words(self):
        from cuepoint.models.duplicate_group import SIGNAL_LABELS, SIGNALS

        assert set(SIGNAL_LABELS) == set(SIGNALS)
