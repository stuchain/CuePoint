#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Network circuit breaker (Design 5.38).

Trip after N consecutive failures; pause processing for recovery_timeout_sec;
allow manual retry (half-open one attempt).
"""

import threading
import time
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")


class CircuitOpenError(Exception):
    """Raised when the circuit is open (Design 5.38, 5.40)."""

    def __init__(
        self,
        message: str = "Paused due to repeated failures.",
        retry_after_sec: Optional[float] = None,
    ):
        super().__init__(message)
        self.message = message
        self.retry_after_sec = retry_after_sec


class CircuitBreaker:
    """
    Network circuit breaker: trip after failure_threshold consecutive failures,
    stay open for recovery_timeout_sec, then half-open; allow manual retry (Design 5.38).
    """

    STATE_CLOSED = "closed"
    STATE_OPEN = "open"
    STATE_HALF_OPEN = "half_open"

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout_sec: float = 30.0,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec
        self._state = self.STATE_CLOSED
        self._consecutive_failures = 0
        self._last_failure_time: Optional[float] = None
        self._lock = threading.Lock()

    def state(self) -> str:
        with self._lock:
            return self._state

    def call(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Run fn through the circuit. If circuit is open and within recovery window,
        raises CircuitOpenError. If open and past window (or after allow_retry),
        tries once (half-open).
        """
        with self._lock:
            now = time.monotonic()
            if self._state == self.STATE_OPEN:
                elapsed = now - (self._last_failure_time or 0)
                if elapsed < self.recovery_timeout_sec:
                    raise CircuitOpenError(
                        "Paused due to repeated failures.",
                        retry_after_sec=self.recovery_timeout_sec - elapsed,
                    )
                self._state = self.STATE_HALF_OPEN

        try:
            result = fn(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            raise e

    def _record_success(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._state = self.STATE_CLOSED

    def _record_failure(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._last_failure_time = now
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._state = self.STATE_OPEN
            elif self._state == self.STATE_HALF_OPEN:
                self._state = self.STATE_OPEN

    def allow_retry(self) -> None:
        """Manual retry (Design 5.38): move to half-open so one request is allowed."""
        with self._lock:
            if self._state == self.STATE_OPEN:
                self._state = self.STATE_HALF_OPEN

    def reset(self) -> None:
        """Reset to closed and clear failure count (e.g. for tests)."""
        with self._lock:
            self._state = self.STATE_CLOSED
            self._consecutive_failures = 0
            self._last_failure_time = None


# Shared instance for network calls (Design 5.38: one circuit for Beatport)
_breaker: Optional[CircuitBreaker] = None
_breaker_lock = threading.Lock()


def get_network_circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout_sec: float = 30.0,
) -> CircuitBreaker:
    """Return the shared network circuit breaker (Design 5.38)."""
    global _breaker
    with _breaker_lock:
        if _breaker is None:
            _breaker = CircuitBreaker(
                failure_threshold=failure_threshold,
                recovery_timeout_sec=recovery_timeout_sec,
            )
        return _breaker
