#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's checks, as a rule with no SQL and no I/O (PREP-05, DEC-106).

- **Every kind, from a table of cases**, including half time, the 12 to 1
  wheel wrap, a relative key, an unknown BPM or key on either side, a missing
  file and a drive that was not there, an unchecked file, a shortened track,
  repeats, and each chapter target with timed and untimed entries.
- **The vocabulary**: the cases produce exactly :data:`WARNINGS`, so a warning
  added to the rule without a case, or a case the rule cannot produce, fails.
- **Acknowledgements** apply only to the same two entries, in that order, with
  the same values compared.
- **One rule with Suggestions** (fact 6): a tempo that passes both neighbours'
  gates, as PREP-04 judges a slot, never jumps on either transition.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from cuepoint.core.set_analysis import (
    ABOVE,
    ALL_TIMED,
    BELOW,
    BPM_OUTSIDE_RANGE,
    DRIVE_UNAVAILABLE,
    FASTER,
    FILE_MISSING,
    FILE_MISSING_WARNING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    FILE_UNREADABLE,
    FILE_UNREADABLE_WARNING,
    IN_PAST_END,
    KEY_CLASH,
    KEY_UNKNOWN,
    KINDS,
    NO_RELATION,
    NOT_FOUND,
    OUT_PAST_END,
    OVER_TARGET,
    PARTLY_TIMED,
    REPEAT,
    SIDE_BOTH,
    SIDE_FROM,
    SIDE_TO,
    SLOWER,
    TEMPO_JUMP,
    TEMPO_UNKNOWN,
    TIME_OUTSIDE_TRACK,
    TRANSITION_KINDS,
    UNDER_TARGET,
    UNREADABLE,
    WARNINGS,
    Acknowledged,
    ChapterFacts,
    EntryFacts,
    SetWarning,
    ShapePoint,
    ShapeStep,
    analyse,
    camelot_code,
    shape_of,
    transition_warning,
    transition_warnings,
)
from cuepoint.core.set_timing import RunningTime
from cuepoint.core.similarity import (
    TEMPO_WINDOW_PERCENT,
    KEY_ADJACENT,
    KEY_RELATIVE,
    KEY_SAME,
    MusicalKey,
    fit_tempo_ranges,
    key_relation,
    tempo_relation,
)

pytestmark = pytest.mark.unit

CHAPTER = 1


def key(code: str) -> MusicalKey:
    return MusicalKey.from_camelot(int(code[:-1]), code[-1])


def entry(
    entry_id: int,
    *,
    track_id: Optional[int] = None,
    chapter_id: int = CHAPTER,
    bpm: Optional[float] = 124.0,
    k: Optional[str] = "8A",
    length: Optional[int] = 300,
    in_s: Optional[int] = None,
    out_s: Optional[int] = None,
    file: str = FILE_PRESENT,
    drive_unavailable: bool = False,
    checked_at: Optional[str] = "2026-09-01T10:00:00+00:00",
) -> EntryFacts:
    return EntryFacts(
        entry_id=entry_id,
        track_id=track_id if track_id is not None else entry_id * 10,
        chapter_id=chapter_id,
        bpm=bpm,
        key=key(k) if k else None,
        length_seconds=length,
        in_seconds=in_s,
        out_seconds=out_s,
        file=file,
        drive_unavailable=drive_unavailable,
        file_checked_at=checked_at if file != FILE_NOT_CHECKED else None,
    )


def kinds(warnings) -> List[Tuple[str, str]]:
    return [(w.kind, w.detail) for w in warnings]


def between(before: EntryFacts, after: EntryFacts) -> List[Tuple[str, str]]:
    return kinds(transition_warnings(before, after))


# -------------------------------------------------------------- transitions


class TestTransitions:
    @pytest.mark.parametrize(
        ("before", "after", "found"),
        [
            # Tempo: within the window, as it is or at half or double time.
            (dict(bpm=124.0), dict(bpm=124.0), []),
            (dict(bpm=124.0), dict(bpm=128.0), []),
            (dict(bpm=128.0), dict(bpm=64.0), []),  # half time
            (dict(bpm=64.0), dict(bpm=128.0), []),  # double time
            (dict(bpm=126.0), dict(bpm=62.5), []),
            (dict(bpm=120.0), dict(bpm=140.0), [(TEMPO_JUMP, FASTER)]),
            (dict(bpm=140.0), dict(bpm=120.0), [(TEMPO_JUMP, SLOWER)]),
            (dict(bpm=128.0), dict(bpm=90.0), [(TEMPO_JUMP, SLOWER)]),
            (dict(bpm=None), dict(bpm=124.0), [(TEMPO_UNKNOWN, SIDE_FROM)]),
            (dict(bpm=124.0), dict(bpm=None), [(TEMPO_UNKNOWN, SIDE_TO)]),
            (dict(bpm=None), dict(bpm=None), [(TEMPO_UNKNOWN, SIDE_BOTH)]),
            # Key: DEC-096's wheel.
            (dict(k="8A"), dict(k="8A"), []),
            (dict(k="8A"), dict(k="9A"), []),  # a step
            (dict(k="8A"), dict(k="7A"), []),
            (dict(k="12A"), dict(k="1A"), []),  # the wheel wraps
            (dict(k="1B"), dict(k="12B"), []),
            (dict(k="8A"), dict(k="8B"), []),  # relative
            (dict(k="8A"), dict(k="3B"), [(KEY_CLASH, NO_RELATION)]),
            (dict(k="8A"), dict(k="9B"), [(KEY_CLASH, NO_RELATION)]),
            (dict(k="8A"), dict(k="10A"), [(KEY_CLASH, NO_RELATION)]),
            # A track with no key is no warning (DEC-201): Beatport's key is the
            # only key, so an unmatched library has none.
            (dict(k=None), dict(k="8A"), []),
            (dict(k="8A"), dict(k=None), []),
            (dict(k=None), dict(k=None), []),
            # Both at once, tempo first.
            (
                dict(bpm=120.0, k="8A"),
                dict(bpm=140.0, k="3B"),
                [(TEMPO_JUMP, FASTER), (KEY_CLASH, NO_RELATION)],
            ),
            (
                dict(bpm=None, k=None),
                dict(bpm=124.0, k=None),
                [(TEMPO_UNKNOWN, SIDE_FROM)],
            ),
        ],
    )
    def test_cases(self, before, after, found):
        assert between(entry(1, **before), entry(2, **after)) == found

    def test_what_a_tempo_jump_compared(self):
        [jump] = transition_warnings(entry(1, bpm=120.0), entry(2, bpm=140.0))
        assert jump.compared == {"from": 120.0, "to": 140.0, "percent": 16.7}

    def test_a_jump_is_heard_the_closest_way(self):
        """90 is slower than 128 as it is, and 180 would be faster: the closest
        way is how a DJ hears it."""
        [jump] = transition_warnings(entry(1, bpm=128.0), entry(2, bpm=90.0))
        assert jump.detail == SLOWER and jump.compared["percent"] == 29.7

    def test_bpms_are_compared_at_the_librarys_precision(self):
        [jump] = transition_warnings(entry(1, bpm=120.004), entry(2, bpm=140.0049))
        assert jump.compared["from"] == 120.0 and jump.compared["to"] == 140.0

    def test_a_transition_is_judged_both_ways(self):
        """106.2 is 6.2% faster than 100, outside 100's window, but 100 is
        within 106.2's. Suggestions judge a slot from each neighbour, so a pair
        either one accepts is not a jump."""
        assert tempo_relation(100.0, 106.2) is None
        assert tempo_relation(106.2, 100.0) is not None
        assert between(entry(1, bpm=100.0), entry(2, bpm=106.2)) == []
        assert between(entry(1, bpm=106.2), entry(2, bpm=100.0)) == []

    def test_keys_are_compared_by_their_camelot_code(self):
        [clash] = transition_warnings(entry(1, k="8A"), entry(2, k="3B"))
        assert clash.compared == {"from": "8A", "to": "3B"}
        assert transition_warnings(entry(1, k=None), entry(2, k="8A")) == []
        assert camelot_code(key("12B")) == "12B"

    def test_an_unknown_tempo_says_what_is_known(self):
        [unknown] = transition_warnings(entry(1, bpm=None), entry(2, bpm=124.0))
        assert unknown.compared == {"from": None, "to": 124.0}

    def test_one_warning_by_name(self):
        found = transition_warning(entry(1, bpm=120.0), entry(2, bpm=140.0), TEMPO_JUMP)
        assert found is not None and found.detail == FASTER
        assert transition_warning(entry(1), entry(2), KEY_CLASH) is None
        with pytest.raises(ValueError, match="Only a transition's warnings"):
            transition_warning(entry(1), entry(2), FILE_MISSING_WARNING)


# ------------------------------------------------------------------ entries


class TestEntries:
    @pytest.mark.parametrize(
        ("values", "found"),
        [
            (dict(file=FILE_PRESENT), []),
            (dict(file=FILE_NOT_CHECKED), []),  # never checked is not missing
            (dict(file=FILE_MISSING), [(FILE_MISSING_WARNING, NOT_FOUND)]),
            (
                dict(file=FILE_MISSING, drive_unavailable=True),
                [(FILE_MISSING_WARNING, DRIVE_UNAVAILABLE)],
            ),
            (dict(file=FILE_UNREADABLE), [(FILE_UNREADABLE_WARNING, UNREADABLE)]),
            # Planned times against the track's end.
            (dict(out_s=300), []),  # exactly the end
            (dict(out_s=301), [(TIME_OUTSIDE_TRACK, OUT_PAST_END)]),
            (dict(in_s=240, out_s=360), [(TIME_OUTSIDE_TRACK, OUT_PAST_END)]),
            (dict(in_s=300, out_s=360), [(TIME_OUTSIDE_TRACK, IN_PAST_END)]),
            (dict(in_s=310), [(TIME_OUTSIDE_TRACK, IN_PAST_END)]),
            (dict(in_s=299), []),
            (dict(out_s=9000, length=None), []),  # a length not known
            (
                dict(file=FILE_MISSING, out_s=400),
                [(FILE_MISSING_WARNING, NOT_FOUND), (TIME_OUTSIDE_TRACK, OUT_PAST_END)],
            ),
        ],
    )
    def test_cases(self, values, found):
        analysis = analyse([entry(1, **values)], [ChapterFacts(CHAPTER)])
        assert kinds(analysis.entries[0].warnings) == found

    def test_what_they_compared(self):
        missing = (
            analyse(
                [entry(1, file=FILE_MISSING, checked_at="2026-09-02T08:00:00+00:00")],
                [ChapterFacts(CHAPTER)],
            )
            .entries[0]
            .warnings[0]
        )
        assert missing.compared == {"checked_at": "2026-09-02T08:00:00+00:00"}
        shortened = (
            analyse([entry(1, length=200, in_s=10, out_s=270)], [ChapterFacts(CHAPTER)])
            .entries[0]
            .warnings[0]
        )
        assert shortened.compared == {"length": 200, "in": 10, "out": 270}

    def test_a_repeat_is_a_notice_with_the_other_places(self):
        entries = [
            entry(1, track_id=7),
            entry(2, track_id=8),
            entry(3, track_id=7),
            entry(4, track_id=7),
        ]
        analysis = analyse(entries, [ChapterFacts(CHAPTER)])
        notices = [
            [(n.kind, dict(n.compared)) for n in e.notices] for e in analysis.entries
        ]
        assert notices == [
            [(REPEAT, {"others": [2, 3]})],
            [],
            [(REPEAT, {"others": [0, 3]})],
            [(REPEAT, {"others": [0, 2]})],
        ]
        assert analysis.notices == {REPEAT: 3}
        assert REPEAT not in analysis.counts
        assert all(not e.warnings for e in analysis.entries)


# ----------------------------------------------------------------- chapters


class TestChapters:
    def run(self, chapter: ChapterFacts, *entries: EntryFacts):
        [found] = analyse(list(entries), [chapter]).chapters
        return found

    @pytest.mark.parametrize(
        ("target", "outs", "found"),
        [
            (600, [300, 300], []),  # exactly
            (600, [300, 301], [(OVER_TARGET, ALL_TIMED)]),
            (600, [400, 300, None], [(OVER_TARGET, PARTLY_TIMED)]),
            (600, [200, 200], [(UNDER_TARGET, ALL_TIMED)]),
            (600, [200, None], []),  # untimed: under is not known
            (600, [None, None], []),
            (600, [], [(UNDER_TARGET, ALL_TIMED)]),  # an empty chapter
            (None, [9000], []),
        ],
    )
    def test_targets(self, target, outs, found):
        entries = [entry(i + 1, out_s=o, length=None) for i, o in enumerate(outs)]
        checked = self.run(ChapterFacts(CHAPTER, target_seconds=target), *entries)
        assert kinds(checked.warnings) == found

    def test_what_a_target_compared(self):
        checked = self.run(
            ChapterFacts(CHAPTER, target_seconds=600),
            entry(1, out_s=400, length=None),
            entry(2, out_s=300, length=None),
            entry(3, length=None),
        )
        assert checked.warnings[0].compared == {
            "target": 600,
            "planned": 700,
            "untimed": 1,
        }
        assert checked.running_time == RunningTime(700, 2, 1)

    @pytest.mark.parametrize(
        ("low", "high", "bpms", "detail", "outside"),
        [
            (118.0, 122.0, [118.0, 120.0, 122.0], None, []),  # inclusive
            (118.0, 122.0, [117.9, 120.0], BELOW, [1]),
            (118.0, 122.0, [120.0, 122.5], ABOVE, [2]),
            (118.0, 122.0, [110.0, 120.0, 130.0], SIDE_BOTH, [1, 3]),
            (None, 122.0, [60.0, 123.0], ABOVE, [2]),
            (118.0, None, [60.0, 200.0], BELOW, [1]),
            (118.0, 122.0, [None, 120.0], None, []),  # unknown: its transitions say so
        ],
    )
    def test_the_bpm_range(self, low, high, bpms, detail, outside):
        entries = [entry(i + 1, bpm=b) for i, b in enumerate(bpms)]
        checked = self.run(ChapterFacts(CHAPTER, bpm_min=low, bpm_max=high), *entries)
        if detail is None:
            assert checked.warnings == ()
            return
        [warning] = checked.warnings
        assert (warning.kind, warning.detail) == (BPM_OUTSIDE_RANGE, detail)
        assert warning.compared["min"] == low and warning.compared["max"] == high
        assert [e["entry_id"] for e in warning.compared["entries"]] == outside

    def test_each_chapter_reads_its_own_entries(self):
        warm, peak = ChapterFacts(1, target_seconds=100), ChapterFacts(2, bpm_max=125.0)
        analysis = analyse(
            [
                entry(1, chapter_id=1, out_s=150, length=None),
                entry(2, chapter_id=2, bpm=126.0),
                entry(3, chapter_id=2, bpm=124.0),
            ],
            [warm, peak],
        )
        assert [kinds(c.warnings) for c in analysis.chapters] == [
            [(OVER_TARGET, ALL_TIMED)],
            [(BPM_OUTSIDE_RANGE, ABOVE)],
        ]

    def test_an_entry_in_no_known_chapter_is_refused(self):
        with pytest.raises(ValueError, match="not one of the Set's chapters"):
            analyse([entry(1, chapter_id=9)], [ChapterFacts(1)])


# ---------------------------------------------------------------- the Set


class TestTheSet:
    def test_counts_running_time_and_files(self):
        entries = [
            entry(1, bpm=120.0, out_s=200, file=FILE_MISSING, checked_at="2026-09-01"),
            entry(2, bpm=140.0, out_s=250, checked_at="2026-09-03"),
            entry(
                3, track_id=10, bpm=140.0, file=FILE_MISSING, checked_at="2026-09-01"
            ),
            entry(4, bpm=None, file=FILE_NOT_CHECKED),
        ]
        analysis = analyse(entries, [ChapterFacts(CHAPTER)])
        # 120 -> 140 jumps; 140 -> 140 does not; 140 -> no BPM is unknown.
        assert analysis.counts == {
            TEMPO_JUMP: 1,
            TEMPO_UNKNOWN: 1,
            FILE_MISSING_WARNING: 2,
        }
        assert analysis.running_time == RunningTime(450, 2, 2)
        files = analysis.files
        # By track: entries 1 and 3 are one track, missing once.
        assert (files.tracks, files.checked, files.unchecked) == (3, 2, 1)
        assert (files.missing, files.unreadable) == (1, 0)
        assert files.last_checked_at == "2026-09-03"
        assert not files.never_checked

    def test_a_set_never_checked_says_so(self):
        entries = [entry(1, file=FILE_NOT_CHECKED), entry(2, file=FILE_NOT_CHECKED)]
        files = analyse(entries, [ChapterFacts(CHAPTER)]).files
        assert files.never_checked and files.missing == 0
        assert files.last_checked_at is None

    def test_an_empty_set(self):
        analysis = analyse([], [ChapterFacts(CHAPTER)])
        assert analysis.transitions == () and analysis.entries == ()
        assert not analysis.files.never_checked
        assert analysis.counts == {}

    def test_every_transition_entry_and_chapter_is_listed(self):
        entries = [entry(i) for i in range(1, 6)]
        analysis = analyse(entries, [ChapterFacts(CHAPTER)])
        assert [(t.from_entry_id, t.to_entry_id) for t in analysis.transitions] == [
            (1, 2),
            (2, 3),
            (3, 4),
            (4, 5),
        ]
        assert [e.entry_id for e in analysis.entries] == [1, 2, 3, 4, 5]
        assert list(analysis.warnings()) == []


# -------------------------------------------------------------- the vocabulary


CASES: List[Tuple[List[EntryFacts], List[ChapterFacts]]] = [
    ([entry(1, bpm=120.0), entry(2, bpm=140.0), entry(3, bpm=120.0)], []),
    ([entry(1, k="8A"), entry(2, k="3B")], []),
    (
        [
            entry(1, bpm=None, k=None),
            entry(2),
            entry(3, bpm=None, k=None),
            entry(4, bpm=None, k=None),
        ],
        [],
    ),
    (
        [
            entry(1, file=FILE_MISSING),
            entry(2, file=FILE_MISSING, drive_unavailable=True),
        ],
        [],
    ),
    ([entry(1, file=FILE_UNREADABLE)], []),
    ([entry(1, out_s=400), entry(2, in_s=300, out_s=400)], []),
    (
        [entry(1, out_s=300, length=None), entry(2, out_s=300, length=None)],
        [ChapterFacts(CHAPTER, target_seconds=500)],
    ),
    (
        [entry(1, out_s=300, length=None), entry(2, length=None)],
        [ChapterFacts(CHAPTER, target_seconds=200)],
    ),
    ([entry(1, out_s=100, length=None)], [ChapterFacts(CHAPTER, target_seconds=200)]),
    ([entry(1, bpm=110.0)], [ChapterFacts(CHAPTER, bpm_min=118.0)]),
    ([entry(1, bpm=130.0)], [ChapterFacts(CHAPTER, bpm_max=122.0)]),
    (
        [entry(1, bpm=110.0), entry(2, bpm=130.0)],
        [ChapterFacts(CHAPTER, bpm_min=118.0, bpm_max=122.0)],
    ),
]


def test_the_cases_give_exactly_every_warning_there_is():
    given: Set[Tuple[str, str]] = set()
    for entries, chapters in CASES:
        found = analyse(entries, chapters or [ChapterFacts(CHAPTER)])
        given.update((w.kind, w.detail) for w in found.warnings())
    assert given == set(WARNINGS)
    assert {kind for kind, _ in WARNINGS} == set(KINDS)
    assert len(set(WARNINGS)) == len(WARNINGS)


# ------------------------------------------------------------ acknowledgements


def ack(
    from_id: int, to_id: int, warning: str, compared: Dict[str, Any]
) -> Acknowledged:
    return Acknowledged(from_id, to_id, warning, compared)


class TestAcknowledgements:
    JUMP = {"from": 120.0, "to": 140.0, "percent": 16.7}

    def jumps(self, *acks: Acknowledged, entries=None):
        entries = entries or [entry(1, bpm=120.0), entry(2, bpm=140.0)]
        return analyse(entries, [ChapterFacts(CHAPTER)], acks)

    def test_it_applies_to_the_same_transition_with_the_same_values(self):
        analysis = self.jumps(ack(1, 2, TEMPO_JUMP, self.JUMP))
        [warning] = analysis.transitions[0].warnings
        assert warning.acknowledged
        assert analysis.counts == {} and analysis.acknowledged == 1

    @pytest.mark.parametrize(
        "stale",
        [
            ack(
                2, 1, TEMPO_JUMP, {"from": 120.0, "to": 140.0, "percent": 16.7}
            ),  # other order
            ack(
                1, 3, TEMPO_JUMP, {"from": 120.0, "to": 140.0, "percent": 16.7}
            ),  # other entry
            ack(
                1, 2, TEMPO_JUMP, {"from": 120.0, "to": 141.0, "percent": 17.5}
            ),  # new BPM
            ack(
                1, 2, KEY_CLASH, {"from": 120.0, "to": 140.0, "percent": 16.7}
            ),  # other warning
        ],
    )
    def test_anything_else_is_inert(self, stale):
        analysis = self.jumps(stale)
        [warning] = analysis.transitions[0].warnings
        assert not warning.acknowledged
        assert analysis.counts == {TEMPO_JUMP: 1} and analysis.acknowledged == 0

    def test_values_parsed_from_json_still_match(self):
        """What a stored acknowledgement holds is JSON: the values must be
        JSON's own types, and compare equal once read back."""
        import json

        [warning] = transition_warnings(entry(1, bpm=120.0), entry(2, bpm=140.0))
        stored = json.loads(json.dumps(dict(warning.compared), sort_keys=True))
        assert self.jumps(ack(1, 2, TEMPO_JUMP, stored)).acknowledged == 1
        [clash] = transition_warnings(entry(1, k="8A"), entry(2, k="3B"))
        stored = json.loads(json.dumps(dict(clash.compared)))
        found = analyse(
            [entry(1, k="8A"), entry(2, k="3B")],
            [ChapterFacts(CHAPTER)],
            [ack(1, 2, KEY_CLASH, stored)],
        )
        assert found.acknowledged == 1

    def test_a_key_clash_accepted_under_one_pair_of_keys_is_asked_again(self):
        """DEC-106: what was accepted was a pair of keys. When Beatport's key
        replaces Rekordbox's and still clashes, the pair differs, so the
        clash is a new one and is not covered."""
        accepted = {"from": "8A", "to": "3B"}
        entries = [entry(1, k="8A"), entry(2, k="3B")]
        covered = analyse(
            entries, [ChapterFacts(CHAPTER)], [ack(1, 2, KEY_CLASH, accepted)]
        )
        assert covered.acknowledged == 1 and covered.counts == {}
        beatport = [entry(1, k="8A"), entry(2, k="5B")]
        again = analyse(
            beatport, [ChapterFacts(CHAPTER)], [ack(1, 2, KEY_CLASH, accepted)]
        )
        [warning] = again.transitions[0].warnings
        assert warning.kind == KEY_CLASH and not warning.acknowledged
        assert again.counts == {KEY_CLASH: 1} and again.acknowledged == 0

    def test_only_the_transitions_it_names(self):
        entries = [entry(1, bpm=120.0), entry(2, bpm=140.0), entry(3, bpm=120.0)]
        analysis = self.jumps(ack(1, 2, TEMPO_JUMP, self.JUMP), entries=entries)
        assert [w.acknowledged for t in analysis.transitions for w in t.warnings] == [
            True,
            False,
        ]
        assert analysis.counts == {TEMPO_JUMP: 1}

    def test_the_warning_as_data(self):
        warning = SetWarning(TEMPO_JUMP, FASTER, self.JUMP, acknowledged=True)
        assert warning.to_dict() == {
            "kind": TEMPO_JUMP,
            "detail": FASTER,
            "compared": self.JUMP,
            "acknowledged": True,
        }
        assert set(TRANSITION_KINDS) == {
            TEMPO_JUMP,
            KEY_CLASH,
            TEMPO_UNKNOWN,
        }


# ------------------------------------------------------- one rule with PREP-04


class TestOneRuleWithSuggestions:
    """PREP's fact 6: a tempo Suggestions offer for a slot never jumps there."""

    # No deadline: these assert a rule, not a speed. Under a parallel full run
    # one example took 300 ms, and 0.09 ms when replayed (WAVE-02 found it).
    @settings(max_examples=1500, deadline=None)
    @given(
        st.floats(min_value=50.0, max_value=200.0),
        st.floats(min_value=50.0, max_value=200.0),
        st.floats(min_value=25.0, max_value=400.0),
    )
    def test_a_tempo_that_passes_both_gates_never_jumps(self, before, after, candidate):
        passes = tempo_relation(before, candidate) is not None and (
            tempo_relation(after, candidate) is not None
        )
        if not passes:
            return
        inserted = [entry(1, bpm=before), entry(2, bpm=candidate), entry(3, bpm=after)]
        found = analyse(inserted, [ChapterFacts(CHAPTER)])
        assert TEMPO_JUMP not in found.counts

    @settings(max_examples=500, deadline=None)
    @given(
        st.floats(min_value=50.0, max_value=200.0),
        st.floats(min_value=50.0, max_value=200.0),
    )
    def test_a_gap_nothing_bridges_is_a_jump(self, before, after):
        """And the converse, for the neighbours themselves: when PREP-04 finds
        nothing that passes both gates, going straight from one to the other
        is at least as far as a window."""
        if fit_tempo_ranges(before, after) == ():
            assert tempo_relation(before, after) is None
            assert between(entry(1, bpm=before), entry(2, bpm=after)) in (
                [(TEMPO_JUMP, FASTER)],
                [(TEMPO_JUMP, SLOWER)],
            )

    def test_the_window_is_the_rules_own(self):
        """Nothing here restates DEC-096's percentage."""
        import cuepoint.core.set_analysis as module

        assert "6.0" not in open(module.__file__, encoding="utf-8").read()
        assert TEMPO_WINDOW_PERCENT == 6.0


class TestTheShape:
    """The values the lanes draw are the ones the checks read (DEC-111)."""

    def test_each_entry_is_a_point_in_order(self):
        entries = [
            entry(1, bpm=124.004, k="8A"),
            entry(2, chapter_id=2, bpm=None, k=None),
            entry(3, chapter_id=2, bpm=62.0, k="8B"),
        ]
        shape = analyse(entries, [ChapterFacts(CHAPTER), ChapterFacts(2)]).shape
        assert shape.points == (
            ShapePoint(1, CHAPTER, 124.0, key("8A")),
            ShapePoint(2, 2, None, None),
            ShapePoint(3, 2, 62.0, key("8B")),
        )

    def test_each_transition_says_how_its_keys_relate(self):
        codes = ["8A", "8A", "9A", "9B", "2A", None, "3A"]
        entries = [entry(i + 1, k=code) for i, code in enumerate(codes)]
        steps = shape_of(entries).steps
        assert steps == (
            ShapeStep(1, 2, KEY_SAME),
            ShapeStep(2, 3, KEY_ADJACENT),
            ShapeStep(3, 4, KEY_RELATIVE),
            ShapeStep(4, 5, None),
            ShapeStep(5, 6, None),
            ShapeStep(6, 7, None),
        )

    def test_a_step_with_no_relation_is_exactly_a_key_clash(self):
        wheel = [f"{n}{letter}" for n in range(1, 13) for letter in "AB"]
        for first in wheel:
            for second in wheel:
                pair = [entry(1, k=first), entry(2, k=second)]
                (step,) = shape_of(pair).steps
                assert step.key_relation == key_relation(key(first), key(second))
                clash = (KEY_CLASH, NO_RELATION) in between(*pair)
                assert (step.key_relation is None) == clash, (first, second)

    def test_an_empty_or_single_entry_set_has_no_steps(self):
        assert shape_of([]).points == () and shape_of([]).steps == ()
        (point,) = shape_of([entry(1)]).points
        assert point.entry_id == 1 and shape_of([entry(1)]).steps == ()

    def test_a_bpm_is_the_two_decimals_a_warning_compares(self):
        before, after = entry(1, bpm=120.004), entry(2, bpm=140.126)
        (jump,) = [
            w for w in transition_warnings(before, after) if w.kind == TEMPO_JUMP
        ]
        points = shape_of([before, after]).points
        assert (points[0].bpm, points[1].bpm) == (
            jump.compared["from"],
            jump.compared["to"],
        )


class TestAMissingKeyIsNotAWarning:
    """Prepare does not count a track with no key as a warning (DEC-201)."""

    def test_nothing_finds_key_unknown(self):
        entries = [entry(1, k=None), entry(2, k="8A"), entry(3, k=None)]
        found = analyse(entries, [ChapterFacts(CHAPTER)])
        assert KEY_UNKNOWN not in found.counts
        assert all(not t.warnings for t in found.transitions)
        assert (KEY_UNKNOWN, SIDE_FROM) not in WARNINGS

    def test_the_report_counts_the_entries_without_one(self):
        entries = [entry(1, k=None), entry(2, k="8A"), entry(3, k=None)]
        assert analyse(entries, [ChapterFacts(CHAPTER)]).without_key == 2

    def test_it_is_no_longer_a_kind_at_all(self):
        assert KEY_UNKNOWN not in TRANSITION_KINDS
        assert KEY_UNKNOWN not in KINDS
