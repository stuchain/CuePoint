#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for alerting hooks (Design 7)."""

import pytest

from cuepoint.utils.alerting import (
    get_failure_count,
    record_failure,
    register_alert_hook,
    reset_failure_count,
    unregister_alert_hook,
)


class TestAlerting:
    def setup_method(self):
        reset_failure_count()

    def teardown_method(self):
        reset_failure_count()

    def test_record_failure_increments_count(self):
        assert get_failure_count("test_svc") == 0
        record_failure("test_svc")
        assert get_failure_count("test_svc") == 1
        record_failure("test_svc")
        assert get_failure_count("test_svc") == 2

    def test_reset_failure_count(self):
        record_failure("test_svc")
        reset_failure_count("test_svc")
        assert get_failure_count("test_svc") == 0

    def test_hook_called_when_threshold_exceeded(self):
        calls = []

        def hook(svc: str, count: int, detail: str) -> None:
            calls.append((svc, count, detail))

        register_alert_hook(hook)
        try:
            for _ in range(6):
                record_failure("test_svc", "detail")
            assert len(calls) >= 1
            assert calls[-1][0] == "test_svc"
            assert calls[-1][1] >= 5
        finally:
            unregister_alert_hook(hook)
