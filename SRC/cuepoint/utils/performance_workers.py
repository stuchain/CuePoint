#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Workers and UI Responsiveness

Implements Step 6.6 - Performance with:
- Background worker system
- UI thread protection
- Progress update throttling
- Performance budgets
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple

from PySide6.QtCore import QObject, QThread, Signal

try:
    from PySide6.QtWidgets import QApplication
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False

logger = logging.getLogger(__name__)


class Worker(QThread):
    """Background worker thread for long-running operations.
    
    Implements Step 6.6.1.1 - Background Worker System.
    """
    
    # Signals
    started = Signal()
    progress = Signal(int, int)  # current, total
    status = Signal(str)  # status message
    finished = Signal(object)  # result
    error = Signal(Exception)  # error
    
    def __init__(self, task: Callable, *args, **kwargs):
        """Initialize worker.
        
        Args:
            task: Function to run in background.
            *args, **kwargs: Arguments to pass to task.
        """
        super().__init__()
        self.task = task
        self.args = args
        self.kwargs = kwargs
        self._cancelled = False
    
    def run(self):
        """Run task in background thread."""
        try:
            self.started.emit()
            result = self.task(*self.args, **self.kwargs)
            if not self._cancelled:
                self.finished.emit(result)
        except Exception as e:
            if not self._cancelled:
                self.error.emit(e)
    
    def cancel(self):
        """Cancel worker execution."""
        self._cancelled = True
        self.terminate()


class WorkerManager(QObject):
    """Manage background workers.
    
    Implements Step 6.6.1.1 - Background Worker System.
    """
    
    def __init__(self):
        """Initialize worker manager."""
        super().__init__()
        self.workers = []
    
    def start_worker(self, task: Callable, *args, **kwargs) -> Worker:
        """Start a background worker.
        
        Args:
            task: Function to run.
            *args, **kwargs: Arguments.
            
        Returns:
            Worker instance.
        """
        worker = Worker(task, *args, **kwargs)
        self.workers.append(worker)
        
        def remove_worker():
            if worker in self.workers:
                self.workers.remove(worker)
        
        worker.finished.connect(remove_worker)
        worker.error.connect(remove_worker)
        worker.start()
        return worker
    
    def cancel_all(self):
        """Cancel all running workers."""
        for worker in self.workers[:]:
            worker.cancel()
            if worker in self.workers:
                self.workers.remove(worker)


class UIThreadHelper:
    """Helper for UI thread operations.
    
    Implements Step 6.6.1.2 - UI Thread Protection.
    """
    
    @staticmethod
    def call_on_ui_thread(func: Callable, *args, **kwargs):
        """Call function on UI thread.
        
        Args:
            func: Function to call.
            *args, **kwargs: Arguments.
        """
        if not QT_AVAILABLE:
            # Fallback: just call directly
            return func(*args, **kwargs)
        
        app = QApplication.instance()
        if app is None:
            return
        
        # Use QTimer.singleShot for thread-safe call
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, lambda: func(*args, **kwargs))
    
    @staticmethod
    def is_ui_thread() -> bool:
        """Check if current thread is UI thread.
        
        Returns:
            True if on UI thread.
        """
        if not QT_AVAILABLE:
            return True  # Assume main thread if Qt not available
        
        app = QApplication.instance()
        if app is None:
            return False
        return QThread.currentThread() == app.thread()


class ProgressThrottler:
    """Throttle progress updates to prevent UI blocking.
    
    Implements Step 6.6.1.3 - Progress Update Throttling.
    """
    
    def __init__(self, min_interval: float = 0.25):
        """Initialize throttler.
        
        Args:
            min_interval: Minimum time between updates (seconds).
        """
        self.min_interval = min_interval
        self.last_update = 0.0
    
    def should_update(self) -> bool:
        """Check if update should be sent.
        
        Returns:
            True if enough time has passed.
        """
        now = time.time()
        if now - self.last_update >= self.min_interval:
            self.last_update = now
            return True
        return False
    
    def force_update(self):
        """Force next update to be sent."""
        self.last_update = 0.0


@dataclass
class PerformanceBudget:
    """Performance budget definition.
    
    Implements Step 6.6.2.1 - Performance Budget Definitions.
    """
    name: str
    target_ms: float
    warning_ms: Optional[float] = None
    critical_ms: Optional[float] = None
    
    def check(self, actual_ms: float) -> Tuple[bool, str]:
        """Check if budget is met.
        
        Args:
            actual_ms: Actual time in milliseconds.
            
        Returns:
            Tuple of (is_ok, status_message).
        """
        if self.critical_ms and actual_ms > self.critical_ms:
            return False, f"CRITICAL: {actual_ms:.1f}ms > {self.critical_ms:.1f}ms"
        elif self.warning_ms and actual_ms > self.warning_ms:
            return True, f"WARNING: {actual_ms:.1f}ms > {self.warning_ms:.1f}ms"
        elif actual_ms > self.target_ms:
            return True, f"SLOW: {actual_ms:.1f}ms > {self.target_ms:.1f}ms"
        else:
            return True, f"OK: {actual_ms:.1f}ms"


class PerformanceBudgets:
    """Performance budget definitions.
    
    Implements Step 6.6.2.1 - Performance Budget Definitions.
    """
    
    STARTUP = PerformanceBudget("startup", 2000, warning_ms=3000, critical_ms=5000)
    TABLE_FILTER = PerformanceBudget("table_filter", 200, warning_ms=500, critical_ms=1000)
    TRACK_PROCESSING = PerformanceBudget("track_processing", 250, warning_ms=500, critical_ms=1000)
    UI_RESPONSE = PerformanceBudget("ui_response", 100, warning_ms=200, critical_ms=500)
    # Memory budget in MB (converted to bytes for comparison)
    MEMORY_USAGE = PerformanceBudget("memory_usage", 500 * 1024 * 1024, warning_ms=750 * 1024 * 1024, critical_ms=1000 * 1024 * 1024)


class PerformanceBudgetMonitor:
    """Monitor performance against budgets.
    
    Implements Step 6.6.2.2 - Performance Monitoring.
    """
    
    _violations = []
    
    @staticmethod
    def check_budget(operation_name: str, duration_ms: float, budget: Optional[PerformanceBudget] = None) -> Tuple[bool, str]:
        """Check operation against performance budget.
        
        Args:
            operation_name: Name of operation.
            duration_ms: Duration in milliseconds.
            budget: Performance budget (default: find by name).
            
        Returns:
            Tuple of (is_ok, status_message).
        """
        if budget is None:
            # Try to find budget by name
            budget = getattr(PerformanceBudgets, operation_name.upper(), None)
            if budget is None:
                return True, f"OK: {duration_ms:.1f}ms (no budget defined)"
        
        is_ok, status = budget.check(duration_ms)
        
        if not is_ok or "WARNING" in status or "CRITICAL" in status:
            PerformanceBudgetMonitor._violations.append({
                "operation": operation_name,
                "duration_ms": duration_ms,
                "status": status,
                "timestamp": time.time()
            })
            logger.warning(f"Performance: {operation_name} - {status}")
        
        return is_ok, status
    
    @staticmethod
    def get_violations() -> list:
        """Get list of budget violations.
        
        Returns:
            List of violation dictionaries.
        """
        return PerformanceBudgetMonitor._violations.copy()
    
    @staticmethod
    def clear_violations():
        """Clear violation history."""
        PerformanceBudgetMonitor._violations.clear()


class DebouncedFilter:
    """Debounced filter to prevent excessive operations.
    
    Implements Step 6.6.3.2 - Debounced Filtering.
    """
    
    def __init__(self, callback: Callable, delay_ms: int = 300):
        """Initialize debounced filter.
        
        Args:
            callback: Function to call after delay.
            delay_ms: Delay in milliseconds.
        """
        self.callback = callback
        self.delay_ms = delay_ms
        self._timer = None
        
        if QT_AVAILABLE:
            from PySide6.QtCore import QTimer
            self._timer = QTimer()
            self._timer.setSingleShot(True)
            self._timer.timeout.connect(self._execute)
    
    def trigger(self, *args, **kwargs):
        """Trigger debounced callback.
        
        Args:
            *args, **kwargs: Arguments to pass to callback.
        """
        if self._timer is None:
            # Fallback: call immediately
            self.callback(*args, **kwargs)
            return
        
        # Store args for later
        self._args = args
        self._kwargs = kwargs
        
        # Restart timer
        self._timer.stop()
        self._timer.start(self.delay_ms)
    
    def _execute(self):
        """Execute callback."""
        self.callback(*self._args, **self._kwargs)
    
    def cancel(self):
        """Cancel pending callback."""
        if self._timer:
            self._timer.stop()
