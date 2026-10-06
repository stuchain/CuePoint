#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's waveform analysis: what a run does (WAVE-03).

Over a real library database and a real ``waveforms.db``, with the decoder
replaced by a stand-in that records every file it is handed, in order. So these
prove what the specification asks of a run, without the engine around it:

- **the plan** counts every present track against the store, and a row counts
  only at the check's size;
- **the drain** analyses tracks added while it runs, and stops when a count
  finds nothing left;
- **the order** is requests, Sets, Collections, then the newest;
- **a stop** finishes the file in flight and says why; a decoder that cannot
  analyse stops the run without blaming a file;
- **a failed file** is not retried until it changes, and a file gone is
  skipped, never failed;
- **verify** finds a file changed at the same size, and nothing else does;
- **pruning** follows only a whole drain, and never empties the store for an
  empty library;
- **progress** is throttled, and **Activity** gets one event per run.
"""

from __future__ import annotations

import contextlib
import logging
import os
import threading
from collections import deque
from typing import Iterable, List, Optional

import pytest

from cuepoint.data.audio_decode import (
    ANALYSIS_VERSION,
    DecodeFailed,
    DecoderUnavailable,
)
from cuepoint.models.waveform import STORED_FAILED, STORED_READY
from cuepoint.models.waveform_analysis import (
    STOP_PAUSED,
    STOP_STEPPED_ASIDE,
    STOP_UNAVAILABLE,
    RunProgress,
)
from cuepoint.persistence.waveform_store import WaveformStoreError
from cuepoint.services import waveform_analysis_service as module
from cuepoint.services.waveform_analysis_service import (
    EVENT_WAVEFORM_DATA_DELETED,
    EVENT_WAVEFORMS_ANALYSED,
    REFILL,
    RateWindow,
    WaveformAnalysisService,
    default_workers,
)
from tests.fixtures.waveform_library import WaveformLibrary, envelope


class Control:
    """An engine that asks nothing of the run but what a test sets."""

    def __init__(
        self,
        *,
        whole: bool = True,
        verify: bool = False,
        requests: Iterable[int] = (),
    ) -> None:
        self.requests = deque(requests)
        self.whole = whole
        self.verify_files = verify
        self.stop: Optional[str] = None
        self.counts = 0

    def next_request(self) -> Optional[int]:
        return self.requests.popleft() if self.requests else None

    def pending_requests(self) -> int:
        return len(self.requests)

    def whole_library(self) -> bool:
        return self.whole

    def verify(self) -> bool:
        return self.verify_files

    def counted(self) -> None:
        self.counts += 1

    def stop_reason(self) -> Optional[str]:
        return self.stop


@contextlib.contextmanager
def own_records(name: str):
    """A logger's own records, whatever another test did to logging.

    Not ``caplog``: its handler sits on the root, and in a full run another
    test's setup stops the ``cuepoint`` loggers propagating to it.
    """
    records: list = []
    handler = logging.Handler(logging.DEBUG)
    handler.emit = records.append  # type: ignore[method-assign]
    logger = logging.getLogger(name)
    level, disabled = logger.level, logger.disabled
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.disabled = False
    try:
        yield records
    finally:
        logger.removeHandler(handler)
        logger.setLevel(level)
        logger.disabled = disabled


@pytest.fixture
def lib(tmp_path):
    library = WaveformLibrary(tmp_path)
    yield library
    library.close()


def run(lib, control=None, *, workers: int = 1, **kwargs):
    return lib.analysis.run(
        control or Control(), trigger="file_check", workers=workers, **kwargs
    )


class TestThePlan:
    def test_counts_every_present_track_against_the_store(self, lib):
        for name in ("a", "b", "c", "d"):
            lib.add(name)
        lib.decoder.answers[str(lib.path("b"))] = DecodeFailed("undecodable", "stub")
        lib.waveforms.analyse(lib.id("a"))
        lib.waveforms.analyse(lib.id("b"))

        plan = lib.analysis.plan()

        assert (plan.present, plan.analysed, plan.failed) == (4, 1, 1)
        assert plan.remaining == 2 and plan.done == 2
        assert [item.track_id for item in plan.pending] == [lib.id("d"), lib.id("c")]
        assert plan.pending_total == 2
        assert sorted(item.track_id for item in plan.verify) == [
            lib.id("a"),
            lib.id("b"),
        ]

    def test_a_row_at_another_size_than_the_checks_does_not_count(self, lib):
        lib.add("a")
        lib.waveforms.analyse(lib.id("a"))
        lib.path("a").write_bytes(b"a longer file now")
        lib.check("a")

        plan = lib.analysis.plan()

        assert (plan.analysed, plan.remaining) == (0, 1)
        assert [item.track_id for item in plan.pending] == [lib.id("a")]

    def test_a_check_without_a_size_takes_any_row_of_the_version(self, lib):
        lib.add("a")
        lib.waveforms.analyse(lib.id("a"))
        connection = lib.db.connect()
        connection.execute("UPDATE track_files SET size_bytes = NULL")
        connection.commit()

        assert lib.analysis.plan().analysed == 1

    def test_tracks_sharing_a_path_are_counted_each_and_analysed_once(self, lib):
        lib.add("a")
        lib.add("twin", path=lib.path("a"))

        plan = lib.analysis.plan()

        assert plan.present == 2 and plan.remaining == 2
        assert len(plan.pending) == 1 and plan.pending_total == 1

    def test_excluded_paths_are_counted_but_not_offered(self, lib):
        lib.add("a")
        lib.add("b")

        plan = lib.analysis.plan(exclude={str(lib.path("a"))})

        assert plan.remaining == 2
        assert [item.track_id for item in plan.pending] == [lib.id("b")]

    def test_a_limit_bounds_the_items_and_not_the_counts(self, lib):
        for index in range(7):
            lib.add(f"t{index}")

        plan = lib.analysis.plan(limit=3)
        counted = lib.analysis.plan(limit=0, ordered=False)

        assert len(plan.pending) == 3 and plan.pending_total == 7
        assert counted.pending == () and counted.pending_total == 7

    def test_another_versions_row_does_not_count(self, lib):
        lib.add("a")
        lib.waveforms.analyse(lib.id("a"))
        newer = WaveformAnalysisService(
            lib.work, lib.store, lib.waveforms, analysis_version=ANALYSIS_VERSION + 1
        )

        assert newer.plan().remaining == 1


def forget_loudness(lib, *names: str) -> None:
    """Make the store one written before WAVE-08: waveforms, no loudness."""
    connection = lib.store.connect()
    if not names:
        connection.execute("DELETE FROM loudness")
    for name in names:
        connection.execute(
            "DELETE FROM loudness WHERE path = ?", (str(lib.path(name)),)
        )


class TestLoudnessIsMeasuredToo:
    """WAVE-08: a file is done when its loudness is measured with its waveform."""

    def test_a_waveform_without_loudness_is_remaining_after_every_unanalysed_file(
        self, lib
    ):
        lib.add("old", added="2001-01-01")
        lib.add("newer", added="2002-01-01")
        lib.add("newest", added="2026-01-01")
        lib.add("measured", added="2003-01-01")
        for name in ("old", "newest", "measured"):
            lib.waveforms.analyse(lib.id(name))
        forget_loudness(lib, "old", "newest")

        plan = lib.analysis.plan()

        assert (plan.present, plan.analysed, plan.failed) == (4, 1, 0)
        assert plan.remaining == 3 and plan.pending_total == 3
        # "newer" has no waveform: first, though "newest" is newer.
        assert [item.track_id for item in plan.pending] == [
            lib.id("newer"),
            lib.id("newest"),
            lib.id("old"),
        ]
        assert [item.track_id for item in plan.verify] == [lib.id("measured")]

    def test_the_limit_takes_unanalysed_files_first(self, lib):
        for index in range(4):
            lib.add(f"m{index}", added=f"2026-01-0{index + 1}")
            lib.waveforms.analyse(lib.id(f"m{index}"))
        forget_loudness(lib)
        lib.add("new", added="2000-01-01")

        plan = lib.analysis.plan(limit=2)

        assert [item.track_id for item in plan.pending] == [
            lib.id("new"),
            lib.id("m3"),
        ]
        assert plan.pending_total == 5

    def test_a_failed_file_has_nothing_left_to_measure(self, lib):
        lib.add("bad")
        lib.decoder.answers[str(lib.path("bad"))] = DecodeFailed("undecodable", "x")
        lib.waveforms.analyse(lib.id("bad"))

        plan = lib.analysis.plan()

        assert (plan.failed, plan.remaining) == (1, 0)

    def test_a_run_measures_an_analysed_library_keeping_every_waveform(self, lib):
        for name in ("a", "b", "c"):
            lib.add(name)
        run(lib)
        before = {
            name: lib.store.get(str(lib.path(name)), ANALYSIS_VERSION).data
            for name in ("a", "b", "c")
        }
        forget_loudness(lib)
        lib.add("new")
        lib.decoder.opened.clear()

        result = run(lib)

        assert lib.decoder.names()[0] == "new"
        assert sorted(lib.decoder.names()) == ["a", "b", "c", "new"]
        assert (result.analysed, result.remaining) == (4, 0) and result.drained
        assert lib.store.loudness_count() == 4
        for name, data in before.items():
            assert lib.store.get(str(lib.path(name)), ANALYSIS_VERSION).data == data
        lib.decoder.opened.clear()
        assert run(lib).analysed == 0 and lib.decoder.opened == []

    def test_a_request_for_a_track_missing_only_its_loudness_measures_it(self, lib):
        lib.add("a")
        lib.waveforms.analyse(lib.id("a"))
        forget_loudness(lib)
        lib.decoder.opened.clear()

        result = run(lib, Control(whole=False, requests=[lib.id("a")]))

        assert lib.decoder.names() == ["a"]
        assert result.analysed == 1
        (state,) = lib.waveforms.states([lib.id("a")])
        assert state.loudness is not None and state.loudness.integrated_lufs == -8.4


class TestTheDrain:
    def test_a_run_analyses_the_whole_library_and_says_so(self, lib):
        for name in ("a", "b", "c"):
            lib.add(name)

        result = run(lib)

        assert lib.stored() == {"a": STORED_READY, "b": STORED_READY, "c": STORED_READY}
        assert (result.analysed, result.failed, result.remaining) == (3, 0, 0)
        assert result.present == 3 and result.drained
        assert result.summary_line() == "Analysed 3 waveforms. Finished."

    def test_tracks_added_while_it_runs_are_analysed_in_the_same_run(self, lib):
        lib.add("first")

        def import_another(source):
            lib.add("late")
            return envelope()

        lib.decoder.answers[str(lib.path("first"))] = import_another

        result = run(lib)

        assert lib.decoder.names() == ["first", "late"]
        assert result.analysed == 2

    def test_it_counts_again_every_refill_and_takes_each_file_once(self, lib):
        for index in range(REFILL + 5):
            lib.add(f"t{index:03d}")
        control = Control()

        result = run(lib, control, workers=2)

        assert result.analysed == REFILL + 5
        assert len(lib.decoder.opened) == len(set(lib.decoder.opened)) == REFILL + 5
        # Two counts that found work, and the one that found none.
        assert control.counts == 3

    def test_two_workers_decode_at_once(self, lib):
        for name in ("a", "b"):
            lib.add(name)
        both_in = threading.Barrier(2, timeout=10)

        def meet(source):
            both_in.wait()
            return envelope()

        lib.decoder.default = meet

        assert run(lib, workers=2).analysed == 2

    def test_a_requests_only_run_analyses_exactly_the_requests(self, lib):
        for name in ("a", "b", "c"):
            lib.add(name)

        result = run(lib, Control(whole=False, requests=[lib.id("b")]))

        assert lib.decoder.names() == ["b"]
        assert not result.whole_library and result.analysed == 1
        assert result.summary_line() == "Analysed 1 waveform."

    def test_an_already_analysed_request_costs_a_stat(self, lib):
        lib.add("a")
        run(lib)
        lib.decoder.opened.clear()

        result = run(lib, Control(whole=False, requests=[lib.id("a")]))

        assert lib.decoder.opened == []
        assert result.up_to_date == 1 and not result.did_anything

    def test_nothing_to_do_is_up_to_date(self, lib):
        lib.add("a")
        run(lib)

        result = run(lib)

        assert result.analysed == 0
        assert result.summary_line() == "Every waveform is up to date. Finished."


class TestTheOrder:
    def test_requests_then_sets_then_collections_then_the_newest(self, lib):
        lib.add("old", added="2001-01-01")
        lib.add("new", added="2026-01-01")
        lib.add("crate", added="2000-01-01")
        lib.add("friday", added="1999-01-01")
        lib.add("asked", added="1998-01-01")
        lib.collection("collection", "Crate", "crate")
        lib.collection("set", "Friday", "friday")

        run(lib, Control(requests=[lib.id("asked")]))

        assert lib.decoder.names() == ["asked", "friday", "crate", "new", "old"]

    def test_a_request_made_mid_run_is_next(self, lib):
        for name in ("a", "b", "c", "d"):
            lib.add(name, added=f"2026-01-0{'abcd'.index(name) + 1}")
        control = Control()

        def ask(source):
            control.requests.append(lib.id("a"))
            return envelope()

        lib.decoder.answers[str(lib.path("d"))] = ask

        run(lib, control)

        # d is newest, a is oldest; the request jumps the two between.
        assert lib.decoder.names()[:2] == ["d", "a"]


class TestStopping:
    @pytest.mark.parametrize("reason", [STOP_PAUSED, STOP_STEPPED_ASIDE])
    def test_a_stop_finishes_the_file_in_flight_and_says_why(self, lib, reason):
        for name in ("a", "b", "c"):
            lib.add(name, added=f"2026-01-0{'cba'.index(name) + 1}")
        control = Control()

        def stop_now(source):
            control.stop = reason
            return envelope()

        lib.decoder.answers[str(lib.path("a"))] = stop_now

        result = run(lib, control)

        assert lib.decoder.names() == ["a"]
        assert lib.stored() == {"a": STORED_READY}
        assert result.stopped == reason and not result.drained
        assert result.remaining == 2

    def test_a_stop_before_it_starts_opens_nothing(self, lib):
        lib.add("a")
        control = Control()
        control.stop = STOP_PAUSED

        result = run(lib, control)

        assert lib.decoder.opened == [] and result.stopped == STOP_PAUSED

    def test_a_decoder_that_cannot_analyse_stops_the_run_and_blames_no_file(self, lib):
        for name in ("a", "b", "c"):
            lib.add(name)
        lib.decoder.default = DecoderUnavailable("graph dropped")

        result = run(lib)

        assert len(lib.decoder.opened) == 1
        assert lib.stored() == {}
        assert result.stopped == STOP_UNAVAILABLE

    def test_a_store_that_cannot_be_written_fails_the_run_keeping_what_was_done(
        self, lib, monkeypatch
    ):
        for name in ("a", "b"):
            lib.add(name, added=f"2026-01-0{'ba'.index(name) + 1}")
        real_put = lib.store.put

        def put(row):
            if row.path.endswith("b"):
                raise WaveformStoreError(message="disk full")
            real_put(row)

        monkeypatch.setattr(lib.store, "put", put)

        with pytest.raises(WaveformStoreError):
            run(lib)
        assert lib.stored() == {"a": STORED_READY}


class TestFailuresAndGoneFiles:
    def test_a_failed_file_is_not_retried_until_its_size_changes(self, lib):
        lib.add("broken")
        lib.decoder.default = DecodeFailed("undecodable", "stub")
        first = run(lib)
        lib.decoder.opened.clear()

        second = run(lib)
        lib.path("broken").write_bytes(b"repaired and longer")
        lib.check("broken")
        lib.decoder.default = envelope()
        third = run(lib)

        assert first.failed == 1
        assert first.summary_line() == (
            "Analysed 0 waveforms; 1 file could not be read. Finished."
        )
        assert second.failed == 0 and second.analysed == 0
        assert lib.decoder.names() == ["broken"]
        assert third.analysed == 1 and lib.stored() == {"broken": STORED_READY}

    def test_a_file_gone_since_the_check_is_skipped_never_failed(self, lib):
        lib.add("gone")
        lib.add("here")
        os.remove(lib.path("gone"))

        result = run(lib)

        assert result.not_found == 1 and result.failed == 0
        assert lib.stored() == {"here": STORED_READY}
        assert "1 file was not found" in result.summary_line()


class TestVerify:
    def test_a_file_changed_at_the_same_size_is_found_only_by_verify(self, lib):
        lib.add("a")
        run(lib)
        stat = lib.path("a").stat()
        os.utime(lib.path("a"), ns=(stat.st_atime_ns, stat.st_mtime_ns + 10**9))
        lib.decoder.opened.clear()

        plain = run(lib)
        verified = run(lib, Control(verify=True))

        assert plain.analysed == 0
        assert verified.analysed == 1
        assert lib.decoder.names() == ["a"]

    def test_verify_stats_an_unchanged_file_and_decodes_nothing(self, lib):
        lib.add("a")
        run(lib)
        lib.decoder.opened.clear()

        result = run(lib, Control(verify=True))

        assert lib.decoder.opened == []
        assert result.up_to_date == 1

    def test_unanalysed_files_come_before_verifying(self, lib):
        lib.add("done", added="2026-01-01")
        run(lib)
        lib.add("new", added="2000-01-01")
        stat = lib.path("done").stat()
        os.utime(lib.path("done"), ns=(stat.st_atime_ns, stat.st_mtime_ns + 10**9))
        lib.decoder.opened.clear()

        run(lib, Control(verify=True))

        assert lib.decoder.names() == ["new", "done"]


class TestPruning:
    def test_a_whole_drain_prunes_rows_no_track_has(self, lib):
        lib.add("kept")
        lib.add("removed")
        run(lib)
        lib.remove("removed")

        result = run(lib)

        assert result.pruned == 1
        assert lib.stored() == {"kept": STORED_READY}

    def test_a_row_for_a_track_that_is_missing_now_is_kept(self, lib):
        lib.add("unplugged")
        run(lib)
        connection = lib.db.connect()
        connection.execute(
            "UPDATE track_files SET status = 'missing', size_bytes = NULL"
        )
        connection.commit()

        assert run(lib).pruned == 0
        assert lib.stored() == {"unplugged": STORED_READY}

    def test_a_stopped_run_does_not_prune(self, lib):
        lib.add("kept")
        lib.add("removed")
        run(lib)
        lib.remove("removed")
        lib.add("new")
        control = Control()

        def stop(source):
            control.stop = STOP_PAUSED
            return envelope()

        lib.decoder.answers[str(lib.path("new"))] = stop

        assert run(lib, control).pruned == 0
        assert "removed" in lib.stored()

    def test_a_requests_only_run_does_not_prune(self, lib):
        lib.add("kept")
        lib.add("removed")
        run(lib)
        lib.remove("removed")

        result = run(lib, Control(whole=False, requests=[lib.id("kept")]))

        assert result.pruned == 0 and "removed" in lib.stored()

    def test_an_empty_library_never_empties_the_store(self, lib):
        lib.add("a")
        run(lib)
        lib.remove("a")

        assert run(lib).pruned == 0
        assert lib.stored() == {"a": STORED_READY}


class TestProgress:
    def test_reports_end_with_the_library_counted(self, lib):
        for name in ("a", "b", "c"):
            lib.add(name)
        reports: List[RunProgress] = []

        run(lib, on_progress=reports.append)

        last = reports[-1]
        assert (last.completed, last.total, last.remaining) == (3, 3, 0)
        assert last.analysed == 3 and last.whole_library

    def test_reports_are_at_most_every_half_second(self, lib, monkeypatch):
        now = [0.0]
        service = WaveformAnalysisService(
            lib.work, lib.store, lib.waveforms, clock=lambda: now[0]
        )
        for index in range(6):
            lib.add(f"t{index}")
        reports: List[RunProgress] = []

        def advance(source):
            now[0] += 0.2
            return envelope()

        lib.decoder.default = advance

        service.run(Control(), trigger="t", on_progress=reports.append, workers=1)

        # Six files 0.2 s apart: reported at 0.2 and 0.8 s, then the last, once
        # the run has ended.
        assert len(reports) == 3
        assert reports[-1].completed == 6

    def test_a_requests_only_run_counts_its_requests(self, lib):
        for name in ("a", "b"):
            lib.add(name)
        reports: List[RunProgress] = []

        run(
            lib,
            Control(whole=False, requests=[lib.id("a"), lib.id("b")]),
            on_progress=reports.append,
        )

        assert (reports[-1].completed, reports[-1].total) == (2, 2)
        assert not reports[-1].whole_library

    def test_a_failing_report_does_not_stop_the_run(self, lib):
        lib.add("a")

        def explode(progress):
            raise RuntimeError("renderer gone")

        assert run(lib, on_progress=explode).analysed == 1


class TestTheRate:
    def test_none_until_there_is_enough_to_say(self):
        now = [0.0]
        rate = RateWindow(clock=lambda: now[0])
        rate.add()
        now[0] = 5.0
        rate.add()

        assert rate.per_hour() is None
        now[0] = 20.0
        assert rate.per_hour() == pytest.approx(2 * 3600 / 20)

    def test_only_the_last_ten_minutes_count(self):
        now = [0.0]
        rate = RateWindow(clock=lambda: now[0])
        for _ in range(100):
            rate.add()
        now[0] = 700.0
        for _ in range(10):
            rate.add()

        assert rate.per_hour() == pytest.approx(10 * 3600 / 600)

    def test_the_eta_is_the_remaining_at_the_rate(self, lib):
        now = [0.0]
        service = WaveformAnalysisService(
            lib.work, lib.store, lib.waveforms, clock=lambda: now[0]
        )
        for index in range(4):
            lib.add(f"t{index}")
        reports: List[RunProgress] = []

        def ten_seconds(source):
            now[0] += 10.0
            return envelope()

        lib.decoder.default = ten_seconds

        service.run(Control(), trigger="t", on_progress=reports.append, workers=1)

        with_rate = [report for report in reports if report.rate_per_hour]
        assert with_rate
        first = with_rate[0]
        assert first.eta_seconds == pytest.approx(
            first.remaining * 3600 / first.rate_per_hour
        )


class TestWorkers:
    @pytest.mark.parametrize(
        "cores, workers", [(1, 1), (2, 1), (4, 1), (7, 1), (8, 2), (16, 2), (64, 2)]
    )
    def test_one_on_four_cores_and_two_on_eight_or_more(self, cores, workers):
        assert default_workers(cores) == workers

    def test_an_unknown_core_count_is_one(self):
        assert default_workers(0) == 1


class TestActivity:
    def test_one_event_per_run_with_what_it_did(self, lib):
        lib.add("a")
        lib.add("b")
        lib.decoder.answers[str(lib.path("b"))] = DecodeFailed("undecodable", "stub")

        lib.analysis.record_run(run(lib))

        events = lib.events()
        assert len(events) == 1
        assert events[0].type == EVENT_WAVEFORMS_ANALYSED
        assert events[0].summary == (
            "Analysed 1 waveform; 1 file could not be read. Finished."
        )
        assert events[0].detail["analysed"] == 1
        assert events[0].detail["failed"] == 1

    def test_a_request_run_that_only_looked_records_nothing(self, lib):
        lib.add("a")
        run(lib)

        lib.analysis.record_run(run(lib, Control(whole=False, requests=[lib.id("a")])))

        assert lib.events() == []

    def test_a_feed_that_cannot_be_written_is_logged_not_raised(self, lib):
        lib.add("a")
        result = run(lib)

        class Broken:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("database locked")

        service = WaveformAnalysisService(lib.work, lib.store, lib.waveforms, Broken())

        with own_records(module.__name__) as records:
            service.record_run(result)

        assert any("could not record the run" in r.getMessage() for r in records)

    def test_without_a_feed_nothing_is_recorded(self, lib):
        lib.add("a")
        service = WaveformAnalysisService(lib.work, lib.store, lib.waveforms)

        service.record_run(run(lib))

        assert lib.events() == []


def test_the_failure_state_is_stored_as_failed(lib):
    lib.add("a")
    lib.decoder.default = DecodeFailed("no_audio", "stub")

    run(lib)

    assert lib.stored() == {"a": STORED_FAILED}


class TestDeletingTheData:
    """ "Delete waveform data" (WAVE-05): the store, its size and one event."""

    def test_it_empties_the_store_and_says_what_went(self, lib):
        lib.add("a")
        lib.add("b")
        lib.decoder.answers[str(lib.path("b"))] = DecodeFailed("undecodable", "stub")
        run(lib)
        before = lib.analysis.store_bytes()

        result = lib.analysis.delete_data()

        assert result.waveforms == 2
        assert lib.stored() == {}
        # Two small rows leave the file at its least pages; the store's own
        # test shows a full one shrinking.
        assert result.freed_bytes == before - lib.analysis.store_bytes()
        assert result.freed_bytes >= 0

    def test_it_is_recorded_once(self, lib):
        lib.add("a")
        run(lib)

        lib.analysis.delete_data()

        events = lib.activity.recent_events(
            limit=10, event_type=EVENT_WAVEFORM_DATA_DELETED
        )
        assert len(events) == 1
        assert events[0].summary == (
            "Deleted 1 waveform; the library will be analysed again."
        )
        assert events[0].detail["waveforms"] == 1

    def test_an_empty_store_says_so(self, lib):
        result = lib.analysis.delete_data()

        assert result.waveforms == 0
        events = lib.activity.recent_events(
            limit=10, event_type=EVENT_WAVEFORM_DATA_DELETED
        )
        assert events[0].summary == (
            "Deleted the waveform data; there were no waveforms to delete."
        )

    def test_a_feed_that_cannot_be_written_does_not_undo_it(self, lib):
        lib.add("a")
        run(lib)

        class Broken:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("database locked")

        service = WaveformAnalysisService(lib.work, lib.store, lib.waveforms, Broken())

        with own_records(module.__name__) as records:
            result = service.delete_data()

        assert result.waveforms == 1
        assert lib.stored() == {}
        assert any("could not record the deletion" in r.getMessage() for r in records)

    def test_the_store_s_size_never_opens_it(self, lib):
        assert lib.analysis.store_bytes() == 0
        assert not lib.store.path.exists()
