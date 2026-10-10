"""Unit tests for centralized reliability retry (Design 5.1, 5.63, 5.113)."""

import pytest

from cuepoint.services.reliability_retry import get_retry_config, run_with_retry


@pytest.fixture(autouse=True)
def slept(monkeypatch):
    """The backoff delays run_with_retry asked for, without waiting them out.

    Each retry sleeps 0.5, 1, 2 seconds plus jitter; slept for real, the retry
    tests here cost five seconds and checked nothing about the delays.
    """
    delays = []
    monkeypatch.setattr("cuepoint.services.reliability_retry.time.sleep", delays.append)
    return delays


def test_get_retry_config_defaults():
    """Without config_service, returns default max_retries and delays."""
    cfg = get_retry_config()
    assert cfg["max_retries"] == 3
    assert cfg["base_delay"] == 0.5
    assert cfg["jitter_range"] == 0.25


def test_get_retry_config_with_override():
    """max_retries override is respected."""
    cfg = get_retry_config(max_retries=5)
    assert cfg["max_retries"] == 5


def test_get_retry_config_from_config_service():
    """Config service reliability.max_retries is used."""

    class FakeConfig:
        def get(self, key, default=None):
            if key == "reliability.max_retries":
                return 7
            return default

    cfg = get_retry_config(config_service=FakeConfig())
    assert cfg["max_retries"] == 7


def test_run_with_retry_succeeds_first_try():
    """No retry when callable succeeds."""
    calls = []

    def ok():
        calls.append(1)
        return 42

    result = run_with_retry(ok, max_retries=2)
    assert result == 42
    assert len(calls) == 1


def test_run_with_retry_retries_then_succeeds(slept):
    """Retries on failure then succeeds (Design 5.63)."""
    calls = []

    def fail_twice():
        calls.append(1)
        if len(calls) < 3:
            raise ConnectionError("transient")
        return 99

    result = run_with_retry(fail_twice, max_retries=3)
    assert result == 99
    assert len(calls) == 3
    # delay = base * 2^attempt + jitter (Design 5.37), base 0.5 and jitter <= 0.25.
    assert len(slept) == 2
    assert 0.5 <= slept[0] <= 0.75
    assert 1.0 <= slept[1] <= 1.25


def test_run_with_retry_exhausted_raises():
    """After max_retries, last exception is raised."""
    calls = []

    def always_fail():
        calls.append(1)
        raise TimeoutError("timeout")

    with pytest.raises(TimeoutError, match="timeout"):
        run_with_retry(always_fail, max_retries=2)
    assert len(calls) == 3  # 1 + 2 retries


def test_run_with_retry_on_retry_callback(slept):
    """on_retry is called with attempt, max_attempts, delay, error (Design 5.42)."""
    retries_seen = []

    def failing():
        raise OSError("network")

    def on_retry(attempt, max_attempts, delay, error):
        retries_seen.append((attempt, max_attempts, delay, error))

    with pytest.raises(OSError):
        run_with_retry(failing, max_retries=2, on_retry=on_retry)
    assert len(retries_seen) == 2  # after first and second failure
    assert retries_seen[0][0] == 1
    assert retries_seen[0][1] == 2
    assert retries_seen[0][3].args[0] == "network"
    # The delay reported is the delay waited.
    assert slept == [seen[2] for seen in retries_seen]
