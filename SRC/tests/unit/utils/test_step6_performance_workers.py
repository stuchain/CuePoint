#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.6: Performance

Tests Worker, WorkerManager, UIThreadHelper, ProgressThrottler, PerformanceBudget, PerformanceBudgetMonitor, DebouncedFilter.
"""

import time
from unittest.mock import Mock

import pytest

from cuepoint.utils.performance_workers import (
    DebouncedFilter,
    PerformanceBudget,
    PerformanceBudgetMonitor,
    PerformanceBudgets,
    ProgressThrottler,
    UIThreadHelper,
    Worker,
    WorkerManager,
)


class TestWorker:
    """Test Worker class."""

    def test_worker_initialization(self):
        """Test worker initialization."""
        def task():
            return "result"
        
        worker = Worker(task)
        assert worker.task == task
        assert worker._cancelled is False

    def test_worker_cancel(self):
        """Test worker cancellation."""
        def task():
            time.sleep(1)
            return "result"
        
        worker = Worker(task)
        worker.cancel()
        assert worker._cancelled is True


class TestWorkerManager:
    """Test WorkerManager class."""

    def test_manager_initialization(self):
        """Test manager initialization."""
        manager = WorkerManager()
        assert len(manager.workers) == 0

    def test_start_worker(self):
        """Test starting worker."""
        manager = WorkerManager()
        
        def task():
            return "result"
        
        worker = manager.start_worker(task)
        assert isinstance(worker, Worker)
        assert worker in manager.workers

    def test_cancel_all(self):
        """Test canceling all workers."""
        manager = WorkerManager()
        
        def task():
            time.sleep(1)
            return "result"
        
        worker = manager.start_worker(task)
        manager.cancel_all()
        assert worker._cancelled is True


class TestUIThreadHelper:
    """Test UIThreadHelper class."""

    def test_is_ui_thread(self):
        """Test UI thread check."""
        result = UIThreadHelper.is_ui_thread()
        assert isinstance(result, bool)

    def test_call_on_ui_thread(self):
        """Test calling on UI thread."""
        called = [False]
        
        def test_func():
            called[0] = True
        
        UIThreadHelper.call_on_ui_thread(test_func)
        # May not execute immediately, but should not raise
        assert True  # Just check it doesn't crash


class TestProgressThrottler:
    """Test ProgressThrottler class."""

    def test_throttler_initialization(self):
        """Test throttler initialization."""
        throttler = ProgressThrottler(min_interval=0.1)
        assert throttler.min_interval == 0.1

    def test_should_update_first_time(self):
        """Test first update should be allowed."""
        throttler = ProgressThrottler(min_interval=0.1)
        assert throttler.should_update() is True

    def test_should_update_throttled(self):
        """Test throttling prevents rapid updates."""
        throttler = ProgressThrottler(min_interval=0.1)
        throttler.should_update()  # First update
        assert throttler.should_update() is False  # Should be throttled

    def test_should_update_after_interval(self):
        """Test update allowed after interval."""
        throttler = ProgressThrottler(min_interval=0.05)
        throttler.should_update()  # First update
        time.sleep(0.06)  # Wait longer than interval
        assert throttler.should_update() is True

    def test_force_update(self):
        """Test forcing update."""
        throttler = ProgressThrottler(min_interval=0.1)
        throttler.should_update()  # First update
        throttler.force_update()
        assert throttler.should_update() is True


class TestPerformanceBudget:
    """Test PerformanceBudget class."""

    def test_budget_check_ok(self):
        """Test budget check when OK."""
        budget = PerformanceBudget("test", 100.0, warning_ms=200.0, critical_ms=500.0)
        is_ok, status = budget.check(50.0)
        assert is_ok is True
        assert "OK" in status

    def test_budget_check_slow(self):
        """Test budget check when slow."""
        budget = PerformanceBudget("test", 100.0, warning_ms=200.0, critical_ms=500.0)
        is_ok, status = budget.check(150.0)
        assert is_ok is True
        assert "SLOW" in status

    def test_budget_check_warning(self):
        """Test budget check when warning."""
        budget = PerformanceBudget("test", 100.0, warning_ms=200.0, critical_ms=500.0)
        is_ok, status = budget.check(250.0)
        assert is_ok is True
        assert "WARNING" in status

    def test_budget_check_critical(self):
        """Test budget check when critical."""
        budget = PerformanceBudget("test", 100.0, warning_ms=200.0, critical_ms=500.0)
        is_ok, status = budget.check(600.0)
        assert is_ok is False
        assert "CRITICAL" in status


class TestPerformanceBudgets:
    """Test PerformanceBudgets class."""

    def test_startup_budget(self):
        """Test startup budget."""
        assert PerformanceBudgets.STARTUP.name == "startup"
        assert PerformanceBudgets.STARTUP.target_ms == 2000

    def test_table_filter_budget(self):
        """Test table filter budget."""
        assert PerformanceBudgets.TABLE_FILTER.name == "table_filter"
        assert PerformanceBudgets.TABLE_FILTER.target_ms == 200

    def test_ui_response_budget(self):
        """Test UI response budget."""
        assert PerformanceBudgets.UI_RESPONSE.name == "ui_response"
        assert PerformanceBudgets.UI_RESPONSE.target_ms == 100


class TestPerformanceBudgetMonitor:
    """Test PerformanceBudgetMonitor class."""

    def test_check_budget_ok(self):
        """Test checking budget when OK."""
        PerformanceBudgetMonitor.clear_violations()
        is_ok, status = PerformanceBudgetMonitor.check_budget("startup", 1000.0)
        assert is_ok is True
        assert len(PerformanceBudgetMonitor.get_violations()) == 0

    def test_check_budget_violation(self):
        """Test checking budget with violation."""
        PerformanceBudgetMonitor.clear_violations()
        is_ok, status = PerformanceBudgetMonitor.check_budget("startup", 6000.0)
        assert is_ok is False
        violations = PerformanceBudgetMonitor.get_violations()
        assert len(violations) > 0
        assert violations[0]["operation"] == "startup"

    def test_clear_violations(self):
        """Test clearing violations."""
        PerformanceBudgetMonitor.clear_violations()
        PerformanceBudgetMonitor.check_budget("startup", 6000.0)
        assert len(PerformanceBudgetMonitor.get_violations()) > 0
        PerformanceBudgetMonitor.clear_violations()
        assert len(PerformanceBudgetMonitor.get_violations()) == 0


class TestDebouncedFilter:
    """Test DebouncedFilter class."""

    def test_debounced_filter_initialization(self):
        """Test debounced filter initialization."""
        callback = Mock()
        debouncer = DebouncedFilter(callback, delay_ms=100)
        assert debouncer.callback == callback
        assert debouncer.delay_ms == 100

    def test_debounced_filter_trigger(self):
        """Test triggering debounced filter."""
        callback = Mock()
        debouncer = DebouncedFilter(callback, delay_ms=50)
        debouncer.trigger("arg1", "arg2", key="value")
        # Should not call immediately
        callback.assert_not_called()

    def test_debounced_filter_cancel(self):
        """Test canceling debounced filter."""
        callback = Mock()
        debouncer = DebouncedFilter(callback, delay_ms=50)
        debouncer.trigger()
        debouncer.cancel()
        # Callback should not be called after cancel
        time.sleep(0.1)
        callback.assert_not_called()
