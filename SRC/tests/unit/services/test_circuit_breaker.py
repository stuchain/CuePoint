"""Unit tests for network circuit breaker (Design 5.38)."""

import time

import pytest

from cuepoint.services.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    get_network_circuit_breaker,
)


def test_circuit_closed_succeeds():
    """Closed circuit allows calls and records success."""
    cb = CircuitBreaker(failure_threshold=5, recovery_timeout_sec=30.0)
    result = cb.call(lambda: 42)
    assert result == 42
    assert cb.state() == CircuitBreaker.STATE_CLOSED


def test_circuit_trips_after_five_failures():
    """Circuit opens after 5 consecutive failures (Design 5.38)."""
    cb = CircuitBreaker(failure_threshold=5, recovery_timeout_sec=30.0)

    def fail():
        raise ConnectionError("network")

    for _ in range(5):
        with pytest.raises(ConnectionError):
            cb.call(fail)
    assert cb.state() == CircuitBreaker.STATE_OPEN

    with pytest.raises(CircuitOpenError, match="Paused due to repeated failures"):
        cb.call(lambda: 1)


def _raise(exc):
    raise exc


def test_circuit_open_raises_circuit_open_error():
    """When open, call() raises CircuitOpenError with retry_after_sec."""
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout_sec=10.0)
    for _ in range(2):
        with pytest.raises(ValueError):
            cb.call(lambda: _raise(ValueError("x")))
    with pytest.raises(CircuitOpenError) as exc_info:
        cb.call(lambda: 1)
    assert exc_info.value.retry_after_sec is not None
    assert 0 <= exc_info.value.retry_after_sec <= 10.0


def test_allow_retry_opens_half_open():
    """allow_retry() moves open -> half_open so one request is allowed (Design 5.38)."""
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout_sec=30.0)
    for _ in range(2):
        with pytest.raises(OSError):
            cb.call(lambda: _raise(OSError("err")))
    assert cb.state() == CircuitBreaker.STATE_OPEN

    cb.allow_retry()
    result = cb.call(lambda: 99)
    assert result == 99
    assert cb.state() == CircuitBreaker.STATE_CLOSED


def test_allow_retry_then_fail_reopens():
    """Half-open: if the one attempt fails, circuit reopens."""
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout_sec=30.0)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            cb.call(lambda: _raise(RuntimeError("x")))
    cb.allow_retry()
    with pytest.raises(RuntimeError):
        cb.call(lambda: _raise(RuntimeError("y")))
    assert cb.state() == CircuitBreaker.STATE_OPEN


def test_reset_closes_circuit():
    """reset() clears state (for tests)."""
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout_sec=30.0)
    for _ in range(2):
        with pytest.raises(Exception):
            cb.call(lambda: _raise(Exception("x")))
    assert cb.state() == CircuitBreaker.STATE_OPEN
    cb.reset()
    assert cb.state() == CircuitBreaker.STATE_CLOSED
    assert cb.call(lambda: 1) == 1


def test_success_resets_consecutive_failures():
    """A success after some failures resets the failure count."""
    cb = CircuitBreaker(failure_threshold=5, recovery_timeout_sec=30.0)
    for _ in range(3):
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("x")))
    cb.call(lambda: 1)  # success
    cb.call(lambda: 2)  # success
    assert cb.state() == CircuitBreaker.STATE_CLOSED


def test_get_network_circuit_breaker_singleton():
    """get_network_circuit_breaker() returns the same instance."""
    from cuepoint.services import circuit_breaker as cb_mod
    original = cb_mod._breaker
    try:
        cb_mod._breaker = None
        a = get_network_circuit_breaker()
        b = get_network_circuit_breaker()
        assert a is b
    finally:
        cb_mod._breaker = original
