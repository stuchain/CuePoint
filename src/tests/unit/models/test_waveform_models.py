#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A stored waveform and a track's waveform state (WAVE-02).

The types refuse what the store's ``CHECK`` constraints refuse, so a row that
could not be written is refused before it reaches SQLite, with a message about
the row rather than a constraint's name.
"""

from __future__ import annotations

import pytest

from cuepoint.models.waveform import (
    REASON_NO_PATH,
    STATE_FAILED,
    STATE_MISSING,
    STATE_READY,
    STATE_UNAVAILABLE,
    STATE_UNCHECKED,
    STATE_WAITING,
    STORED_FAILED,
    STORED_READY,
    WAVEFORM_STATES,
    StoredWaveform,
    WaveformState,
    WaveformSummary,
)

NOW = "2026-09-30T12:00:00+00:00"


def row(**overrides):
    values = dict(
        path="/music/a.flac",
        size_bytes=10,
        mtime_ns=20,
        analysis_version=1,
        state=STORED_READY,
        analysed_at=NOW,
        duration_ms=1_000,
        data=b"x",
    )
    values.update(overrides)
    return StoredWaveform(**values)


@pytest.mark.unit
class TestStoredWaveform:
    def test_a_ready_and_a_failed_row(self):
        assert row().is_ready
        failed = row(state=STORED_FAILED, reason="timeout", duration_ms=None, data=None)
        assert not failed.is_ready

    @pytest.mark.parametrize(
        "overrides",
        [
            {"path": ""},
            {"size_bytes": -1},
            {"size_bytes": True},
            {"analysis_version": 0},
            {"state": "waiting"},
            {"analysed_at": ""},
            {"duration_ms": -1},
            {"duration_ms": None},
            {"data": None},
            {"reason": "timeout"},
            {"reason": ""},
            {"state": STORED_FAILED, "reason": None, "duration_ms": None, "data": None},
            {"state": STORED_FAILED, "reason": "x", "data": None},
            {"state": STORED_FAILED, "reason": "x", "duration_ms": None},
        ],
    )
    def test_what_the_table_refuses_is_refused(self, overrides):
        with pytest.raises((ValueError, TypeError)):
            row(**overrides)

    def test_data_must_be_bytes(self):
        with pytest.raises(TypeError):
            row(data="text")
        assert type(row(data=bytearray(b"ab")).data) is bytes
        assert type(row(data=memoryview(b"ab")).data) is bytes

    def test_a_negative_modified_time_is_a_modified_time(self):
        # Files from before 1970 exist, and a restored archive can carry one.
        assert row(mtime_ns=-5).mtime_ns == -5

    def test_counts_for_the_same_size_and_modified_time_only(self):
        stored = row(size_bytes=100, mtime_ns=200)

        assert stored.counts_for(100, 200)
        assert not stored.counts_for(101, 200)
        assert not stored.counts_for(100, 201)

    def test_the_summary_is_the_row_without_its_picture(self):
        stored = row()

        summary = stored.summary

        assert type(summary) is WaveformSummary
        assert summary.path == stored.path
        assert summary.duration_ms == stored.duration_ms
        assert not hasattr(summary, "data")


@pytest.mark.unit
class TestWaveformState:
    def test_the_vocabulary(self):
        assert WAVEFORM_STATES == (
            "ready",
            "failed",
            "missing",
            "unchecked",
            "waiting",
            "unavailable",
        )

    @pytest.mark.parametrize(
        "state, reason, duration",
        [
            (STATE_READY, None, 5),
            (STATE_FAILED, "undecodable", None),
            (STATE_MISSING, REASON_NO_PATH, None),
            (STATE_MISSING, "root_unavailable", None),
            (STATE_UNCHECKED, None, None),
            (STATE_WAITING, None, None),
            (STATE_UNAVAILABLE, None, None),
        ],
    )
    def test_each_state(self, state, reason, duration):
        value = WaveformState(7, state, reason, duration)

        assert value.to_dict() == {
            "track_id": 7,
            "state": state,
            "reason": reason,
            "duration_ms": duration,
        }

    @pytest.mark.parametrize(
        "state, reason, duration",
        [
            ("paused", None, None),
            (STATE_READY, None, None),
            (STATE_WAITING, None, 5),
            (STATE_FAILED, None, None),
            (STATE_MISSING, None, None),
            (STATE_WAITING, "why", None),
            (STATE_READY, "why", 5),
        ],
    )
    def test_an_impossible_state_is_refused(self, state, reason, duration):
        with pytest.raises(ValueError):
            WaveformState(7, state, reason, duration)

    def test_a_track_id_is_required(self):
        with pytest.raises(ValueError):
            WaveformState(0, STATE_WAITING)
